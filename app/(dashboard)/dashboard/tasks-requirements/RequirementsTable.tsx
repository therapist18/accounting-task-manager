// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Briefcase, FileText, Loader2, Search, Upload, Eye } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import RequirementsTableCombined from "./RequirementsTableCombined"
import { FileUploadComponent } from "../tasks/components/FileUploadComponent"
import { ExtractionPreview } from "@/components/ExtractionPreview"

// --- MODIFICATION: Placeholder for the Letter Template Dialog ---
const LetterTemplateDialog = ({ open, onOpenChange, letterData, individualNames }) => {
  if (!letterData) return null;

  const { task, document, columnType, applicantId } = letterData;

  let applicantName = "the applicant";
  if (columnType === 'principal') applicantName = individualNames[task.principal_member || task.individual_id] || 'Principal';
  else if (columnType === 'dependant') applicantName = individualNames[applicantId] || `Dependant ${applicantId}`;
  else if (columnType === 'understudy') applicantName = individualNames[task.understudy_member] || 'Understudy';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full">
        <DialogHeader>
          <DialogTitle>Generate: {document?.display_name}</DialogTitle>
          <DialogDescription>
            Generating letter for {applicantName}. Please fill in the required details below.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <h3 className="font-semibold">Template Details</h3>
          {/* This is where your actual template engine and form would go */}
          <div className="p-4 border rounded-md bg-gray-50 text-sm">
            <p className="text-gray-600">Your dynamic letter template for '{document?.name}' would be rendered here.</p>
            <p className="mt-2 text-gray-600">It would include input fields for any variables needed to generate the final document.</p>
          </div>
          <div className="flex justify-end">
            <Button>Generate & Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};


interface RequirementsTableProps {
  tasks: any[]
  loading: boolean
  error: string | null
  activeTab?: string
}

type ApplicantType = 'principal' | 'dependant' | 'understudy' | 'company' | 'reference';

interface DocumentStatus {
  type: 'upload' | 'view' | 'na' | 'missing'
  documents: any[]
  count: number
}

const REFERENCE_SUBDEPARTMENT_IDS = [10, 5];

export function RequirementsTable({
  tasks,
  loading,
  error,
  activeTab = "work-in-progress",
}: RequirementsTableProps) {
  const [documents, setDocuments] = useState<any[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [taskClassRequirements, setTaskClassRequirements] = useState<Record<string, any>>({})
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set())
  const [selectedApplicant, setSelectedApplicant] = useState<string | null>(null);
  const [individualNames, setIndividualNames] = useState<Record<number, string>>({})
  const [allIndividualDocuments, setAllIndividualDocuments] = useState<Record<string, any[]>>({});
  const [allCompanyDocuments, setAllCompanyDocuments] = useState<Record<string, any[]>>({});
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [selectedUploadData, setSelectedUploadData] = useState<any>(null)
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(false);
  const [selectedDocumentForPreview, setSelectedDocumentForPreview] = useState<any>(null);
  const [companyData, setCompanyData] = useState<Record<number, any>>({});
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
  const [previewDocument, setPreviewDocument] = useState<{
    documents: Array<{
      fileUrl: string;
      extractedData: any;
      fields: any[];
      name?: string;
      uploadedAt?: string;
    }>;
    currentIndex: number;
  } | null>(null);

  // --- MODIFICATION: State for the new letter dialog ---
  const [isLetterDialogOpen, setIsLetterDialogOpen] = useState(false);
  const [selectedLetterData, setSelectedLetterData] = useState(null);

  const parseSelectionId = useCallback((selectionId: string) => {
    const cleanId = selectionId.replace(/_\d+_\d+$/, '');
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
    if (isUUID) return { type: 'document', documentId: cleanId, fieldId: null };
    if (cleanId.includes('-')) {
      const parts = cleanId.split('-');
      return { type: 'field', documentId: parts[0], fieldId: parts.slice(1).join('-') };
    }
    return { type: 'unknown', documentId: cleanId, fieldId: null };
  }, []);

const fetchAllIndividualData = useCallback(async (tasksToFetch: any[]) => {
  // 1. Collect all unique individual IDs from tasks and store director details
  const uniqueIds = new Set<number>();
  const directorMap = new Map<number, any>();
  
  tasksToFetch.forEach(task => {
    // Existing individual IDs
    if (task.principal_member) uniqueIds.add(task.principal_member);
    if (task.understudy_member) uniqueIds.add(task.understudy_member);
    if (task.individual_id) uniqueIds.add(task.individual_id);
    if (Array.isArray(task.dependant_member)) {
      task.dependant_member.forEach(dep => dep.id && uniqueIds.add(dep.id));
    }
    if (Array.isArray(task.references)) {
      task.references.forEach(ref => ref.id && uniqueIds.add(ref.id));
    }
    
    // Store director details
    if (Array.isArray(task.directors_details)) {
      task.directors_details.forEach(director => {
        if (director?.id) {
          uniqueIds.add(director.id);
          directorMap.set(director.id, {
            full_name: director.full_name,
            role: director.role,
            is_primary: director.is_primary,
            roles: director.roles || []
          });
        }
      });
    }
  });

  // 2. Convert to array and filter out null/undefined
  const validIds = Array.from(uniqueIds).filter(id => id != null);
  if (validIds.length === 0) return;

  try {
    // 3. Fetch data in parallel
    const [individualsRes, documentsRes] = await Promise.all([
      // Get basic individual info
      supabase
        .from('registry_individuals')
        .select('id, full_name')
        .in('id', validIds),
      
      // Get documents for these individuals
      supabase
        .from('acc_portal_directors_documents')
        .select(`*, acc_portal_kyc (id, name, display_name)`)
        .in('director_id', validIds)
        .order('created_at', { ascending: false })
    ]);

    // 4. Handle errors
    if (individualsRes.error) throw individualsRes.error;
    if (documentsRes.error) throw documentsRes.error;

    // 5. Process and store individual names, prioritizing director details
    const namesMap = {};
    
    // First add registry individuals
    individualsRes.data?.forEach(ind => {
      namesMap[ind.id] = ind.full_name;
    });
    
    // Then override with director details if available
    directorMap.forEach((details, id) => {
      if (details?.full_name) {
        namesMap[id] = details.full_name;
      }
    });
    
    setIndividualNames(prev => ({ ...prev, ...namesMap }));

    const documentMap = new Map();
documentsRes.data?.forEach(doc => {
  if (doc.document_id) {
    documentMap.set(doc.document_id, doc);
  }
});

    // 6. Process and store documents by director with additional metadata
  const documentsByDirector = documentsRes.data?.reduce((acc, doc) => {
  const directorId = doc.director_id;
  if (!directorId) return acc;
  
  // Check if this document matches any KYC document ID
  const kycDocId = doc.kyc_document_id || doc.document_id;
  const matchingKycDoc = kycDocId ? documentMap.get(kycDocId) : null;
  
  if (!acc[directorId]) {
    acc[directorId] = [];
  }
  
  // Create document with merged data
  const documentWithMetadata = {
    ...doc,
    director_details: directorMap.get(directorId) || null,
    // If we have a matching KYC document, merge its data
    ...(matchingKycDoc ? {
      kyc_document: {
        id: matchingKycDoc.id,
        name: matchingKycDoc.acc_portal_kyc?.name,
        display_name: matchingKycDoc.acc_portal_kyc?.display_name,
        file_path: matchingKycDoc.file_path,
        extracted_details: matchingKycDoc.extracted_details
      }
    } : {})
  };
  
  acc[directorId].push(documentWithMetadata);
  return acc;
}, {});
    
    setAllIndividualDocuments(prev => ({
      ...prev,
      ...(documentsByDirector || {})
    }));
    
  } catch (err) { 
    console.error('Error fetching individual data:', err);
    toast({
      title: "Error fetching individual data",
      description: err.message,
      variant: "destructive"
    });
  }
}, []);

  const fetchCompanyData = useCallback(async (tasksToFetch: any[]) => {
    const companyIds = [...new Set(tasksToFetch.map(t => t.company_id).filter(Boolean))];
    if (companyIds.length === 0) return;
    try {
      const { data, error } = await supabase.from('acc_portal_company_duplicate').select('id, company_name').in('id', companyIds);
      if (error) throw error;
      const companiesMap = data?.reduce((acc, co) => ({ ...acc, [co.id]: co }), {});
      setCompanyData(companiesMap || {});
    } catch (err) { console.error('Error fetching company data:', err); }
  }, []);

  const fetchAllCompanyDocuments = useCallback(async (tasksToFetch: any[]) => {
    const companyIds = [...new Set(tasksToFetch.map(t => t.company_id).filter(Boolean))];
    if (companyIds.length === 0) return;
    try {
      const { data, error } = await supabase.from('acc_portal_kyc_uploads').select(`*, acc_portal_kyc (id, name, display_name)`).in('company_id', companyIds).order('created_at', { ascending: false });
      if (error) throw error;
      const documentsByCompany = data?.reduce((acc, doc) => {
        acc[doc.company_id] = [...(acc[doc.company_id] || []), doc];
        return acc;
      }, {});
      setAllCompanyDocuments(documentsByCompany || {});
    } catch (err) { console.error('Error fetching company documents:', err); }
  }, []);

  const filteredTasks = useMemo(() => tasks.filter(task => activeTab === "completed" ? (task.status === "completed" || task.status === "approved") : (task.status !== "completed" && task.status !== "approved")), [tasks, activeTab]);
  const hasReferencesColumn = useMemo(() => filteredTasks.some(task => REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.id) || REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.parent_id)), [filteredTasks]);

  useEffect(() => {
    if (!filteredTasks.length) { setDocumentsLoading(false); return; }
    const loadAllData = async () => {
      setDocumentsLoading(true);
      await Promise.all([
        fetchAllIndividualData(filteredTasks),
        fetchCompanyData(filteredTasks),
        fetchAllCompanyDocuments(filteredTasks)
      ]);
      setDocumentsLoading(false);
    };
    loadAllData();
  }, [filteredTasks, fetchAllIndividualData, fetchCompanyData, fetchAllCompanyDocuments]);

  useEffect(() => {
    let isMounted = true;
    const fetchMetadata = async () => {
      if (!isMounted || !filteredTasks.length) return;
      try {
        const { data: docsRes, error: docsErr } = await supabase.from('acc_portal_kyc').select('*').order('custom_order', { ascending: true, nullsLast: true });
        if (!isMounted) return;
        if (docsErr) throw docsErr;
        setDocuments((docsRes || []).map(doc => ({ ...doc, display_name: doc.display_name || doc.name })));
        const taskDataPromises = filteredTasks.map(async (task) => {
          const classId = task.subclass_id || (task.class_id && (task.subdepartment?.id || task.subdepartment_id) ? `${task.subdepartment.id}_${task.class_id}` : task.class_id);
          const { data } = await supabase.from('tm_class_requirements').select('*').eq('class_id', classId).maybeSingle();
          return { taskId: task.id, classRequirements: data };
        });
        const results = await Promise.all(taskDataPromises);
        const requirementsMap = results.reduce((acc, res) => {
          if (res.classRequirements) acc[res.taskId] = res.classRequirements;
          return acc;
        }, {});
        setTaskClassRequirements(requirementsMap);
      } catch (err) { console.error('Error fetching metadata:', err); }
    };
    fetchMetadata();
    return () => { isMounted = false; };
  }, [filteredTasks]);

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, any[]>();
    filteredTasks.forEach(task => {
        let applicantName = task.applicant_name || 'Unknown Applicant';
        if (!groups.has(applicantName)) groups.set(applicantName, []);
        groups.get(applicantName)!.push(task);
    });
    return Array.from(groups.entries()).map(([name, tasksInGroup]) => ({
        applicantName: name, 
        tasks: tasksInGroup,
        dependantIds: [...new Set(tasksInGroup.flatMap(t => Array.isArray(t.dependant_member) ? t.dependant_member.map(d => d.id) : []).filter(Boolean))]
    }));
  }, [filteredTasks]);

  const searchedGroupedTasks = useMemo(() => !sidebarSearchQuery ? groupedTasks : groupedTasks.filter(group => group.applicantName.toLowerCase().includes(sidebarSearchQuery.toLowerCase())), [groupedTasks, sidebarSearchQuery]);
  const filteredGroupedTasks = useMemo(() => !selectedApplicant ? (searchedGroupedTasks.length > 0 ? [searchedGroupedTasks[0]] : []) : searchedGroupedTasks.filter(group => group.applicantName === selectedApplicant), [searchedGroupedTasks, selectedApplicant]);

  useEffect(() => {
    if (searchedGroupedTasks.length > 0 && !selectedApplicant) {
      setSelectedApplicant(searchedGroupedTasks[0]?.applicantName || null);
    } else if (searchedGroupedTasks.length > 0 && !searchedGroupedTasks.some(g => g.applicantName === selectedApplicant)) {
      setSelectedApplicant(searchedGroupedTasks[0]?.applicantName || null);
    } else if (searchedGroupedTasks.length === 0) {
      setSelectedApplicant(null);
    }
  }, [searchedGroupedTasks, selectedApplicant]);

  // --- MODIFICATION: Separate "Letters" from other document types ---
  const organizedRequirements = useMemo(() => {
    const documentsMap = new Map<string, { document: any; fields: any[]; category: 'company' | 'individual' | 'letter'; }>();
    const allTasks = filteredGroupedTasks.flatMap(g => g.tasks);

    allTasks.forEach(task => {
      const classReqs = taskClassRequirements[task.id];
      if (!classReqs?.documents_and_fields) return;

      classReqs.documents_and_fields.forEach((item: any) => {
        const parsed = parseSelectionId(item.id);
        const docId = parsed.documentId;
        const docDef = documents.find(d => d.id === docId);

        if (docDef && !documentsMap.has(docId)) {
          const itemWithSettings = { ...item, ...docDef, selectionId: item.id };
          let category: 'company' | 'individual' | 'letter' = 'individual';
          if (docDef.main_category === 'Letters' || docDef.main_category === 'Forms') {
            category = 'letter';
          } else if (docDef.category === 'company-docs') {
            category = 'company';
          }

          documentsMap.set(docId, { 
            document: itemWithSettings, 
            fields: [], 
            category: category
          });
        }
      });
    });
    
    const allDocs = Array.from(documentsMap.values());
    return {
      documents: {
        company: allDocs.filter(i => i.category === 'company'),
        individual: allDocs.filter(i => i.category === 'individual' && i.document.main_category !== 'Letters' && i.document.main_category !== 'Forms'),
        letters: allDocs.filter(i => i.document.main_category === 'Letters' || i.document.main_category === 'Forms'),
      }
    };
  }, [filteredGroupedTasks, taskClassRequirements, documents, parseSelectionId]);

  const handleSelectApplicant = (applicantName: string) => setSelectedApplicant(applicantName);
  const toggleDocumentExpansion = useCallback((docId: string) => setExpandedDocuments(prev => { const newSet = new Set(prev); newSet.has(docId) ? newSet.delete(docId) : newSet.add(docId); return newSet; }), []);
  const handleUploadAction = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number) => { setSelectedUploadData({ task, document: item, columnType, applicantId }); setUploadDialogOpen(true); }, []);
  const handleUploadComplete = useCallback(() => { setUploadDialogOpen(false); if (filteredTasks.length > 0) Promise.all([fetchAllIndividualData(filteredTasks), fetchAllCompanyDocuments(filteredTasks)]); }, [filteredTasks, fetchAllIndividualData, fetchAllCompanyDocuments]);
  
  // --- MODIFICATION: Handler for the new Generate Letter button ---
  const handleGenerateLetterAction = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number) => {
    setSelectedLetterData({ task, document: item, columnType, applicantId });
    setIsLetterDialogOpen(true);
  }, []);

const getDocumentStatusForColumn = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number): DocumentStatus => {
  const isCompanyDocument = item.category === 'company-docs' || item.category === 'company';
  const baseStatus = { documents: [], count: 0 };
  const requiredDocId = item.id; // The ID of the KYC requirement

  // 1. Cross-check: Don't show Individual docs in Company columns and vice versa
  if ((columnType === 'company' && !isCompanyDocument) || (columnType !== 'company' && isCompanyDocument)) {
    return { ...baseStatus, type: 'na' };
  }

  let foundDocuments: any[] = [];

  if (columnType === 'company') {
    // Existing Company Logic
    if (task.company_id && allCompanyDocuments[task.company_id]) {
      foundDocuments = allCompanyDocuments[task.company_id].filter(
        doc => doc.kyc_document_id === requiredDocId || doc.document_id === requiredDocId
      );
    }
  } else {
    // 2. Individual Matching Logic
    let individualId: number | null = null;
    if (columnType === 'principal') individualId = task.principal_member || task.individual_id;
    else if (columnType === 'understudy') individualId = task.understudy_member;
    else if (columnType === 'dependant' || columnType === 'reference' || columnType === 'director') individualId = applicantId;

    if (individualId && allIndividualDocuments[individualId]) {
      // Look through the list for this specific person
      foundDocuments = allIndividualDocuments[individualId].filter(doc => {
        // Match against the Requirement ID
        return doc.document_id === requiredDocId || doc.kyc_document_id === requiredDocId;
      });
    }
  }
  
  const type = foundDocuments.length > 0 ? 'view' : 'upload';
  return { ...baseStatus, documents: foundDocuments, count: foundDocuments.length, type };
}, [allCompanyDocuments, allIndividualDocuments]);

const renderDocumentStatus = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number) => {
  const status = getDocumentStatusForColumn(task, item, columnType, applicantId);
  const isLetter = item.main_category === 'Letters';

  const handleViewClick = async () => {
    if (status.documents.length === 0) return;
    
    try {
      const documentPreviews = await Promise.all(status.documents.map(async (doc) => {
        const { data, error } = await supabase.storage
          .from('kyc-documents')
          .createSignedUrl(doc.file_path, 3600);
        
        if (error) throw error;
        
        return {
          id: doc.id,
          fileUrl: data.signedUrl,
          // Map extracted_details from your JSON
          extractedData: doc.extracted_details || {}, 
          // Use fields from the KYC definition (item)
          fields: item.fields || [],
          name: doc.acc_portal_kyc?.display_name || item.display_name,
          uploadedAt: doc.created_at
        };
      }));
      
      setPreviewDocument({
        documents: documentPreviews,
        currentIndex: 0
      });
      
      setDocumentPreviewOpen(true);
    } catch (err) {
      console.error('Error loading individual document previews:', err);
      toast({ title: 'Error', description: 'Failed to load document.', variant: 'destructive' });
    }
  };

  // UI Rendering Logic...
  if (status.type === 'na') return <div className="text-gray-400 text-[10px]">N/A</div>;

    return (
      <div className="flex items-center justify-center gap-1 h-full">
        {isLetter && (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50" onClick={() => handleGenerateLetterAction(task, item, columnType, applicantId)} title={`Generate ${item.display_name}`}><FileText className="h-4 w-4" /></Button>
        )}
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50" onClick={() => handleUploadAction(task, item, columnType, applicantId)} title={`Upload ${item.display_name}`}><Upload className="h-4 w-4" /></Button>
        {status.type === 'view' && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600 hover:bg-green-100" onClick={handleViewClick} title={`View ${status.count} document(s)`}><Eye className="h-4 w-4" /></Button>
            {status.count > 1 && (<Badge variant="outline" className="h-5 w-5 p-0 flex items-center justify-center text-xs bg-green-50 text-green-700 border-green-200">{status.count}</Badge>)}
          </div>
        )}
      </div>
    );
  }, [getDocumentStatusForColumn, handleUploadAction, handleGenerateLetterAction, documents]);

  const renderClientFieldData = useCallback(() => <div className="text-center"><span className="text-gray-400 text-xs">-</span></div>, []);
  const renderReferencesData = useCallback(() => <div className="text-center p-2"><span className="text-gray-400 text-xs">N/A</span></div>, []);
  const getCurrentRequirements = () => [];
  const fuzzyMatch = (str1, str2) => str1.toLowerCase() === str2.toLowerCase();

const getDocumentDataForPreview = useCallback((task: any, item: any, columnType: ApplicantType, referenceId?: number) => {
  const status = getDocumentStatusForColumn(task, item, columnType, referenceId);
  if (status.type === 'view' && status.documents.length > 0) {
    // Return the first/latest document found
    const doc = status.documents[0];
    
    // Ensure extracted_details are mapped for the ExtractionPreview component
    return {
      ...doc,
      // Handle potential variation in JSON keys
      extracted_details: doc.extracted_details || {},
      file_path: doc.file_path,
      id: doc.id
    };
  }
  return null;
}, [getDocumentStatusForColumn]);

  const currentClassRequirements = useMemo(() => {
    const firstTask = filteredGroupedTasks[0]?.tasks?.[0];
    if (!firstTask) return [];
    const requirements = taskClassRequirements[firstTask.id];
    return requirements ? [requirements] : [];
  }, [filteredGroupedTasks, taskClassRequirements]);

  return (
    <div className="flex h-[85vh] w-full bg-white">
      <div className="w-64 border-r bg-white flex flex-col">
        <div className="p-4 border-b"><h2 className="text-lg font-semibold">Applicants</h2></div>
        <div className="p-2 border-b"><div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." className="pl-8" value={sidebarSearchQuery} onChange={(e) => setSidebarSearchQuery(e.target.value)} /></div></div>
        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {searchedGroupedTasks.map((group) => (<Button key={group.applicantName} variant={selectedApplicant === group.applicantName ? "secondary" : "ghost"} className="w-full justify-start h-auto py-2" onClick={() => handleSelectApplicant(group.applicantName)}>
                <div className="flex flex-col items-start w-full"><span className="truncate text-left text-sm font-medium">{group.applicantName}</span>{group.tasks[0]?.company_id && companyData[group.tasks[0].company_id] && (<span className="text-xs text-muted-foreground truncate w-full text-left mt-1 flex items-center"><Briefcase className="h-3 w-3 inline-block mr-1.5" />{companyData[group.tasks[0].company_id].company_name}</span>)}</div></Button>))}
            {loading && <div className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>}
            {!loading && searchedGroupedTasks.length === 0 && <p className="p-4 text-sm text-center text-muted-foreground">No applicants found.</p>}
          </div>
        </ScrollArea>
      </div>
      <div className="flex-1 flex flex-col border rounded-md bg-background shadow-sm">
        <div className="overflow-auto flex-1">
          <RequirementsTableCombined
            loading={documentsLoading || loading} 
            error={error} 
            filteredGroupedTasks={filteredGroupedTasks} 
            organizedRequirements={organizedRequirements} 
            classRequirements={currentClassRequirements}
            expandedDocuments={expandedDocuments} 
            toggleDocumentExpansion={toggleDocumentExpansion} 
            renderDocumentStatus={renderDocumentStatus} 
            getDocumentDataForPreview={getDocumentDataForPreview}
            renderClientFieldData={renderClientFieldData} 
            renderReferencesData={renderReferencesData} 
            hasReferencesColumn={hasReferencesColumn} 
            individualNames={individualNames} 
            companyData={companyData} 
            getCurrentRequirements={getCurrentRequirements} 
            fuzzyMatch={fuzzyMatch}
            kycDocuments={new Map()}
          />
        </div>
      </div>
      {previewDocument && previewDocument.documents.length > 0 && (
        <ExtractionPreview
          open={documentPreviewOpen}
          onOpenChange={setDocumentPreviewOpen}
          documents={previewDocument.documents}
          initialIndex={previewDocument.currentIndex}
          onDocumentChange={(index) => {
            setPreviewDocument(prev => prev ? {
              ...prev,
              currentIndex: index
            } : null);
          }}
        />
      )}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}><DialogContent className="max-w-6xl w-[90vw] max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Upload {(selectedUploadData?.document?.display_name || 'Document')}</DialogTitle></DialogHeader><FileUploadComponent open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} task={selectedUploadData?.task} document={selectedUploadData?.document} columnType={selectedUploadData?.columnType} applicantId={selectedUploadData?.applicantId} individualNames={individualNames} onUploadComplete={handleUploadComplete}/></DialogContent></Dialog>
      
      {/* --- MODIFICATION: Render the new Letter Template Dialog --- */}
      <LetterTemplateDialog 
        open={isLetterDialogOpen}
        onOpenChange={setIsLetterDialogOpen}
        letterData={selectedLetterData}
        individualNames={individualNames}
      />
    </div>
  );
}