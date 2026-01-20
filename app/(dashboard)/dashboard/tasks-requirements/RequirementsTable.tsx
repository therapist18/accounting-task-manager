// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Briefcase, FileText, Loader2, Search, Upload, Eye, Zap, FileType, Wand2 } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import RequirementsTableCombined from "./RequirementsTableCombined"
import { FileUploadComponent } from "../tasks/components/FileUploadComponent"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { AutomationMappingDialog } from "../tasks/components/AutomationMappingDialog"

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
  activeTab = "enquiry",
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

  // --- State for automation dialog ---
  const [isAutomationDialogOpen, setIsAutomationDialogOpen] = useState(false);
  const [selectedAutomationData, setSelectedAutomationData] = useState(null);

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

  const filteredTasks = useMemo(() => tasks.filter(task => activeTab === "completed" ? (task.status === "completed" || task.status === "approved") : (task.status !== "completed" && task.status !== "approved")), [tasks, activeTab]);

  const companyIds = useMemo(() =>
    [...new Set(filteredTasks.map(t => t.company_id).filter(Boolean))],
    [filteredTasks]
  );

  // Memoize individual IDs extraction
  const individualIds = useMemo(() => {
    const ids = new Set<number>();
    filteredTasks.forEach(task => {
      if (Array.isArray(task.participants_details)) {
        task.participants_details.forEach(participant => {
          if (participant.id && participant.type === 'individual') {
            ids.add(participant.id);
          }
        });
      }
      if (Array.isArray(task.references)) {
        task.references.forEach(ref => ref.id && ids.add(ref.id));
      }
    });
    return Array.from(ids);
  }, [filteredTasks]);

  const getRequiredKycIds = useCallback(() => {
    const ids = new Set<string>();
    Object.values(taskClassRequirements).forEach(classReq => {
      if (classReq?.requirements) {
        classReq.requirements.forEach(req => {
          // Handle both old and new field structures
          if (req.kyc_document_id) ids.add(req.kyc_document_id);
          if (req.kyc_document_ids) req.kyc_document_ids.forEach(id => ids.add(id));
        });
      }
    });
    return Array.from(ids);
  }, [taskClassRequirements]);

const fetchAllIndividualData = useCallback(async (tasksToFetch: any[], requiredKycIds: string[]) => {
  const uniqueIds = new Set<number>();
  const individualTypeMap = new Map<number, string>();

  tasksToFetch.forEach(task => {
    // 1. Principal
    if (task.applicant_details?.id) {
      uniqueIds.add(task.applicant_details.id);
      individualTypeMap.set(task.applicant_details.id, 'principal');
    }
    
    // 2. Participants (Dependants & Understudy)
    if (Array.isArray(task.participants_details)) {
      task.participants_details.forEach(p => {
        if (p.id) {
          uniqueIds.add(p.id);
          // Map roles: 'dependant', 'understudy', 'director'
          individualTypeMap.set(p.id, p.role || 'individual');
        }
      });
    }
    
    // 3. Fallback Understudy from root
    if (task.understudy) {
      uniqueIds.add(task.understudy);
      if (!individualTypeMap.has(task.understudy)) individualTypeMap.set(task.understudy, 'understudy');
    }
  });

  const validIds = Array.from(uniqueIds).filter(Boolean);
  if (validIds.length === 0 || requiredKycIds.length === 0) return;

  try {
    const { data: documentsRes, error } = await supabase
      .from('acc_portal_directors_documents')
      .select('*, acc_portal_kyc (id, name, display_name)')
      .in('director_id', validIds)
      .in('document_id', requiredKycIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Filter documents based on applicability
    const filteredDocuments = documentsRes?.filter(doc => {
      const individualType = individualTypeMap.get(doc.director_id);
      const docApplicantTypes = doc.acc_portal_kyc?.applicant_types;
      
      // If document metadata doesn't restrict types, or we don't know the person's type, allow it
      if (!docApplicantTypes || !Array.isArray(docApplicantTypes) || docApplicantTypes.length === 0) return true;
      
      // Strict match
      return docApplicantTypes.includes(individualType);
    });

    const documentsByDirector = filteredDocuments?.reduce((acc, doc) => {
      if (!acc[doc.director_id]) acc[doc.director_id] = [];
      acc[doc.director_id].push(doc);
      return acc;
    }, {});

    setAllIndividualDocuments(prev => ({ ...prev, ...documentsByDirector }));
  } catch (err) { console.error('Error Individual Fetch:', err); }
}, []);

const fetchAllCompanyDocuments = useCallback(async (tasksToFetch: any[], requiredKycIds: string[]) => {
  const companyIds = [...new Set(tasksToFetch.flatMap(t => {
    // Look for the actual company ID in participants
    const companyPart = t.participants_details?.find(p => p.type === 'company');
    return [t.company_id, companyPart?.id].filter(Boolean);
  }))];

  if (companyIds.length === 0 || requiredKycIds.length === 0) return;

  try {
    // acc_portal_kyc_uploads table structure:
    // - company_id: links to company
    // - kyc_document_id: links to requirement (NOT document_id)
    // - acc_portal_kyc: document type info with applicant_types for applicability
    const { data, error } = await supabase
      .from('acc_portal_kyc_uploads')
      .select('*, acc_portal_kyc (id, name, display_name)')
      .in('company_id', companyIds)
      .in('kyc_document_id', requiredKycIds) // Correct field for company documents
      .order('created_at', { ascending: false });

    if (error) throw error;
    
  const docsByCompany = data?.reduce((acc, doc) => {
  if (!acc[doc.company_id]) acc[doc.company_id] = [];
  acc[doc.company_id].push(doc);
  return acc;
}, {});
    
    setAllCompanyDocuments(prev => ({ ...prev, ...docsByCompany }));
  } catch (err) { console.error('Error Company Fetch:', err); }
}, []);

    const fetchCompanyData = useCallback(async (tasksToFetch: any[]) => {
    console.log('🔍 [fetchCompanyData] Input tasks:', tasksToFetch.map(t => ({ id: t.id, company_id: t.company_id, company_name: t.company_name })));
    
    // Extract company IDs from multiple possible locations
    const companyIds = [...new Set(tasksToFetch.flatMap(t => {
      const ids = [];
      if (t.company_id) ids.push(t.company_id);
      
      // Check applicant_details for company
      if (t.applicant_details?.type === 'company' && t.applicant_details?.id) {
        ids.push(t.applicant_details.id);
      }
      
      // Check participants_details for company
      if (Array.isArray(t.participants_details)) {
        const companyParticipant = t.participants_details.find(p => p.type === 'company');
        if (companyParticipant?.id) ids.push(companyParticipant.id);
      }
      
      return ids;
    }).filter(Boolean))];
    
    if (companyIds.length === 0) {
      console.log('⏭️ No company IDs to fetch');
      return;
    }

    console.log(`📋 Fetching data for ${companyIds.length} companies`);

    try {
      const { data, error } = await supabase
        .from('acc_portal_company_duplicate')
        .select('id, company_name')
        .in('id', companyIds);

      if (error) throw error;

      // Single pass reduce
      const companiesMap = data?.reduce((acc, co) => {
        acc[co.id] = co;
        return acc;
      }, {} as Record<number, any>);

      setCompanyData(companiesMap || {});
      console.log(`✅ Fetched ${data?.length || 0} companies`);

    } catch (err) {
      console.error('❌ Error fetching company data:', err);
    }
  }, []);

  // Update the loading effect to wait for requirements first
  useEffect(() => {
    const loadData = async () => {
      if (!filteredTasks.length) return;
      
      // 1. Fetch Class Requirements first to get the KYC IDs
      const reqMap = {};
      for (const task of filteredTasks) {
        const { data } = await supabase.from('tm_class_requirements')
          .select('*')
          .eq('job_level->>class_id', task.class_id)
          .maybeSingle();
        if (data) reqMap[task.id] = data;
      }
      setTaskClassRequirements(reqMap);

      // 2. Extract required IDs
      const requiredKycIds = [];
      Object.values(reqMap).forEach(cr => cr.requirements?.forEach(r => {
        // Handle both old and new field structures
        if(r.kyc_document_id) requiredKycIds.push(r.kyc_document_id);
        if(r.kyc_document_ids) requiredKycIds.push(...r.kyc_document_ids);
      }));

      // 3. Parallel fetch with filters
      setDocumentsLoading(true);
      await Promise.all([
        fetchAllIndividualData(filteredTasks, requiredKycIds),
        fetchCompanyData(filteredTasks),
        fetchAllCompanyDocuments(filteredTasks, requiredKycIds)
      ]);
      setDocumentsLoading(false);
    };
    loadData();
  }, [filteredTasks]);

  const hasReferencesColumn = useMemo(() => filteredTasks.some(task => REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.id) || REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.parent_id)), [filteredTasks]);

  // useEffect(() => {
  //   if (!filteredTasks.length) {
  //     setDocumentsLoading(false);
  //     return;
  //   }

  //   const loadAllData = async () => {
  //     setDocumentsLoading(true);
  //     console.log('🚀 [loadAllData] Starting parallel data fetch for', filteredTasks.length, 'tasks');

  //     const startTime = performance.now();

  //     try {
  //       // PARALLEL EXECUTION - All 3 fetches run simultaneously
  //       await Promise.all([
  //         fetchAllIndividualData(filteredTasks),
  //         fetchCompanyData(filteredTasks),
  //         fetchAllCompanyDocuments(filteredTasks)
  //       ]);

  //       const endTime = performance.now();
  //       console.log(`✅ [loadAllData] Complete in ${Math.round(endTime - startTime)}ms`);

  //     } catch (error) {
  //       console.error('❌ [loadAllData] Error:', error);
  //     } finally {
  //       setDocumentsLoading(false);
  //     }
  //   };

  //   loadAllData();
  // }, [filteredTasks, fetchAllIndividualData, fetchCompanyData, fetchAllCompanyDocuments]);

  useEffect(() => {
    let isMounted = true;
    const fetchMetadata = async () => {
      if (!isMounted || !filteredTasks.length) return;
      try {
        const { data: docsRes, error: docsErr } = await supabase.from('acc_portal_kyc').select('*').order('display_name', { ascending: true, nullsLast: true });
        if (!isMounted) return;
        if (docsErr) throw docsErr;
        setDocuments((docsRes || []).map(doc => ({ ...doc, display_name: doc.display_name || doc.name })));

        // Fetch class requirements for each task
        const taskDataPromises = filteredTasks.map(async (task) => {
          const jobLevel = task.job_level || {};

          // Construct a query that targets the job_level JSON structure
          let query = supabase
            .from('tm_class_requirements')
            .select('*');

          // Filter based on the hierarchical IDs stored in the task's job_level
          if (jobLevel.department_id) {
            query = query.eq('job_level->>department_id', jobLevel.department_id.toString());
          }
          if (jobLevel.subdepartment_id) {
            query = query.eq('job_level->>subdepartment_id', jobLevel.subdepartment_id.toString());
          }

          // Use .is() for null values in JSONB
          query = query.eq('job_level->>class_id', jobLevel.class_id ? jobLevel.class_id.toString() : 'null');

          if (jobLevel.subclass_id) {
            query = query.eq('job_level->>subclass_id', jobLevel.subclass_id.toString());
          } else {
            query = query.is('job_level->>subclass_id', null);
          }

          const { data } = await query.maybeSingle();

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
      // Get applicant name from applicant_details or fall back to participants_details
      let applicantName = 'Unknown Applicant';

      if (task.applicant_details?.name) {
        // If we have applicant_details, use that name
        applicantName = task.applicant_details.name;
      } else if (task.participants_details?.length) {
        // Otherwise try to find a principal or company in participants_details
        const principal = task.participants_details.find(p =>
          p.type === 'individual' &&
          (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
        );

        if (principal) {
          applicantName = principal.name;
        } else {
          // Fall back to first participant with a name
          const namedParticipant = task.participants_details.find(p => p.name);
          if (namedParticipant) {
            applicantName = namedParticipant.name;
          }
        }
      }

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

const organizedRequirements = useMemo(() => {
  const allTasks = filteredGroupedTasks.flatMap(g => g.tasks);
  const requirementRows: any[] = [];

  allTasks.forEach(task => {
    const classReqs = taskClassRequirements[task.id];
    // Check for the new 'requirements' array instead of 'documents_and_fields'
    if (!classReqs?.requirements || !Array.isArray(classReqs.requirements)) return;

    classReqs.requirements.forEach((req: any) => {
      // Handle both kyc_document_id (singular) and kyc_document_ids (array)
      const kycDocIds = req.kyc_document_ids || (req.kyc_document_id ? [req.kyc_document_id] : []);
      
      if (kycDocIds.length === 0) return;
      
      // Group documents by their type name to avoid duplicates
      const documentGroups = new Map<string, string[]>(); // displayName -> array of document IDs
      
      kycDocIds.forEach((docId: string) => {
        const docDef = documents.find(d => d.id === docId);
        const documentName = docDef?.display_name || docDef?.name || req.name;
        
        if (!documentGroups.has(documentName)) {
          documentGroups.set(documentName, []);
        }
        documentGroups.get(documentName)!.push(docId);
      });
      
      // Create one row per unique document type
      documentGroups.forEach((docIds: string[], documentName: string) => {
        // Use the first document ID for display and matching
        const firstDocId = docIds[0];
        const docDef = documents.find(d => d.id === firstDocId);
        
        // Create a unique identifier for this document type group
        const uniqueId = `${req.id}-${documentName.replace(/\s+/g, '-')}`;
        
        // Avoid duplicate requirement rows if the same document type already exists
        if (requirementRows.find(r => r.documentTypeName === documentName)) return;
        
        requirementRows.push({
          ...req, // The requirement object from your JSON
          documentDefinition: docDef, // The KYC metadata (fields, etc)
          kyc_document_ids: docIds, // Store all document IDs of this type
          kyc_document_id: firstDocId, // Also store first ID for backward compatibility
          uniqueId: uniqueId, // Unique identifier for this document type group
          documentTypeName: documentName, // Store the document type name for deduplication
          documentCount: docIds.length, // Number of documents of this type
          isMultiDocument: docIds.length > 1, // Flag to indicate multiple documents of same type
          // Determine category for sectioning based on applicantTypes and document category
          category: (() => {
            // Check if this requirement applies to companies
            const applicantTypes = req.applicantTypes || (req.applicantType ? [req.applicantType] : []);
            if (applicantTypes.includes('company')) {
              return 'company';
            }
            
            // For non-company requirements, check document category
            if (docDef?.category === 'company-docs') {
              return 'company';
            }
            
            // Check if it's a template
            if (docDef?.has_template) {
              return 'template';
            }
            
            // Default to individual
            return 'individual';
          })()
        });
      });
    });
  });

  return {
    documents: {
      company: requirementRows.filter(r => r.category === 'company'),
      individual: requirementRows.filter(r => r.category === 'individual'),
      templates: requirementRows.filter(r => r.category === 'template'),
    }
  };
}, [filteredGroupedTasks, taskClassRequirements, documents]);
  const handleSelectApplicant = (applicantName: string) => setSelectedApplicant(applicantName);
  const toggleDocumentExpansion = useCallback((docId: string) => setExpandedDocuments(prev => { const newSet = new Set(prev); newSet.has(docId) ? newSet.delete(docId) : newSet.add(docId); return newSet; }), []);
  const handleUploadAction = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number) => { setSelectedUploadData({ task, document: item, columnType, applicantId }); setUploadDialogOpen(true); }, []);
  const handleUploadComplete = useCallback(() => { setUploadDialogOpen(false); if (filteredTasks.length > 0) Promise.all([fetchAllIndividualData(filteredTasks), fetchAllCompanyDocuments(filteredTasks)]); }, [filteredTasks, fetchAllIndividualData, fetchAllCompanyDocuments]);

  // --- MODIFICATION: Handler for the new Generate Letter button ---
  const handleGenerateLetterAction = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number) => {
    setSelectedLetterData({ task, document: item, columnType, applicantId });
    setIsLetterDialogOpen(true);
  }, []);

  // --- Handler for automation dialog ---
  const handleAutomationAction = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number) => {
    setSelectedAutomationData({ task, document: item, columnType, applicantId });
    setIsAutomationDialogOpen(true);
  }, []);
const getDocumentStatusForColumn = useCallback((task: any, reqItem: any, columnType: ApplicantType, applicantId?: number): 
DocumentStatus => {
  const baseStatus = { documents: [], count: 0 };
  // Handle multiple document IDs of the same type
  const kycDocIds = reqItem.kyc_document_ids || (reqItem.kyc_document_id ? [reqItem.kyc_document_id] : []);
  
  if (kycDocIds.length === 0) return baseStatus;

  // Strict applicability check (matches column type to requirement definition)
  const allowedTypes = reqItem.applicantTypes || (reqItem.applicantType ? [reqItem.applicantType] : []);
  const normalizedColType = columnType === 'director' ? 'principal' : columnType;
  if (!allowedTypes.includes(normalizedColType)) return { ...baseStatus, type: 'na' };

  let foundDocuments: any[] = [];

  if (columnType === 'company') {
    // Match Pool: acc_portal_kyc_uploads (company_id)
    const companyId = task.participants_details?.find(p => p.type === 'company')?.id || task.company_id;
    if (companyId && allCompanyDocuments[companyId]) {
      // Check if any of the kycDocIds match (for documents of same type)
      foundDocuments = allCompanyDocuments[companyId].filter(doc => 
        kycDocIds.includes(doc.kyc_document_id)
      );
    }
  } else {
    // Match Pool: acc_portal_directors_documents (director_id)
    let individualId = applicantId; // from column mapping
    if (columnType === 'principal') individualId = task.applicant_details?.id || task.individual_id;
    if (columnType === 'understudy') individualId = task.understudy;

    if (individualId && allIndividualDocuments[individualId]) {
      // Check if any of the kycDocIds match (for documents of same type)
      foundDocuments = allIndividualDocuments[individualId].filter(doc => 
        kycDocIds.includes(doc.document_id)
      );
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
        const documentPreviews = (await Promise.all(status.documents.map(async (doc) => {
          // Skip documents without valid file_path
          if (!doc.file_path) {
            console.warn('Document missing file_path:', doc.id);
            return null;
          }

          const { data, error } = await supabase.storage
            .from('kyc-documents')
            .createSignedUrl(doc.file_path, 3600);

          if (error) throw error;

          // Fetch fields from acc_portal_kyc table using the document's KYC relationship
          let fields = [];
          if (doc.document_id) {
            try {
              const { data: kycData, error: kycError } = await supabase
                .from('acc_portal_kyc')
                .select('fields')
                .eq('id', doc.document_id)
                .single();
              
              if (!kycError && kycData) {
                fields = kycData.fields || [];
              } else if (kycError) {
                console.warn('Failed to fetch KYC fields for document:', doc.id, kycError);
              }
            } catch (err) {
              console.warn('Error fetching KYC fields:', err);
            }
          }

          return {
            id: doc.id,
            fileUrl: data.signedUrl,
            // Map extracted_details from your JSON
            extractedData: doc.extracted_details || {},
            // Use fields from the KYC table
            fields: fields,
            name: doc.acc_portal_kyc?.display_name || item.display_name,
            uploadedAt: doc.created_at
          };
        }))).filter(Boolean); // Filter out null entries

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
        {/* Web automation - clickable Zap icon for automation documents */}
        {item.web_automation?.automationId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
            onClick={() => handleAutomationAction(task, item, columnType, applicantId)}
            title={`Run Automation: ${item.web_automation.automationName}`}
          >
            <Zap className="h-4 w-4" />
          </Button>
        )}

        {/* Generate template button for letters with templates */}
        {isLetter && item.hasTemplate && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
            onClick={() => handleGenerateLetterAction(task, item, columnType, applicantId)}
            title={`Generate ${item.display_name}`}
          >
            <Wand2 className="h-3 w-3 mr-1" />
            <span className="text-[10px] font-bold uppercase">Generate</span>
          </Button>
        )}
        
        {/* Regular generate letter button for letters without templates */}
        {isLetter && !item.hasTemplate && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
            onClick={() => handleGenerateLetterAction(task, item, columnType, applicantId)}
            title={`Generate ${item.display_name}`}
          >
            <Wand2 className="h-3 w-3 mr-1" />
            <span className="text-[10px] font-bold uppercase">Generate</span>
          </Button>
        )}
        
        {/* Upload button - hide for automation documents */}
        {!item.web_automation?.automationId && (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50" onClick={() => handleUploadAction(task, item, columnType, applicantId)} title={`Upload ${item.display_name}`}><Upload className="h-4 w-4" /></Button>
        )}
        
        {/* View button for existing documents */}
        {status.type === 'view' && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600 hover:bg-green-100" onClick={handleViewClick} title={`View ${status.count} document(s)`}><Eye className="h-4 w-4" /></Button>
            {status.count > 1 && (<Badge variant="outline" className="h-5 w-5 p-0 flex items-center justify-center text-xs bg-green-50 text-green-700 border-green-200">{status.count}</Badge>)}
          </div>
        )}
      </div>
    );
  }, [getDocumentStatusForColumn, handleUploadAction, handleGenerateLetterAction, handleAutomationAction, documents]);

  const renderClientFieldData = useCallback(() => <div className="text-center"><span className="text-gray-400 text-xs">-</span></div>, []);
  const renderReferencesData = useCallback(() => <div className="text-center p-2"><span className="text-gray-400 text-xs">N/A</span></div>, []);
  const getCurrentRequirements = () => [];
  const fuzzyMatch = (str1, str2) => str1.toLowerCase() === str2.toLowerCase();

  const currentClassRequirements = useMemo(() => {
    const firstTask = filteredGroupedTasks[0]?.tasks?.[0];
    if (!firstTask) return [];
    const requirements = taskClassRequirements[firstTask.id];   
    return requirements ? [requirements] : [];
  }, [filteredGroupedTasks, taskClassRequirements]);

  // Get company data for each applicant group
  const getCompanyName = (group) => {
    const task = group.tasks[0];
    if (!task) return null;

    // If this is a company applicant, return its name
    if (task.applicant_details?.type === 'company') {
      return task.applicant_details.name;
    }

    // For individual applicants, find the company in participants_details
    if (Array.isArray(task.participants_details)) {
      const company = task.participants_details.find(p => p.type === 'company');
      if (company) return company.name;
    }

    // Fallback to company data if available
    if (task.company_id && companyData[task.company_id]) {
      return companyData[task.company_id].company_name;
    }

    return null;
  };

  return (
    <div className="flex h-[85vh] w-full bg-white">
      <div className="w-64 border-r bg-white flex flex-col">
        <div className="p-4 border-b"><h2 className="text-lg font-semibold">Applicants</h2></div>
        <div className="p-2 border-b"><div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." className="pl-8" value={sidebarSearchQuery} onChange={(e) => setSidebarSearchQuery(e.target.value)} /></div></div>
        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {searchedGroupedTasks.map((group) => {
              const companyName = getCompanyName(group);
              return (
                <Button
                  key={group.applicantName}
                  variant={selectedApplicant === group.applicantName ? "secondary" : "ghost"}
                  className="w-full justify-start h-auto py-2"
                  onClick={() => handleSelectApplicant(group.applicantName)}
                >
                  <div className="flex flex-col items-start w-full">
                    <span className="truncate text-left text-sm font-medium">
                      {group.applicantName}
                    </span>
                    {companyName && (
                      <span className="text-xs text-muted-foreground truncate w-full text-left mt-1 flex items-center">
                        <Briefcase className="h-3 w-3 inline-block mr-1.5" />
                        {companyName}
                      </span>
                    )}
                  </div>
                </Button>
              );
            })}
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
            renderClientFieldData={renderClientFieldData}
            renderReferencesData={renderReferencesData}
            hasReferencesColumn={hasReferencesColumn}
            allIndividualDocuments={allIndividualDocuments}
  allCompanyDocuments={allCompanyDocuments}
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
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}><DialogContent className="max-w-6xl w-[90vw] max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Upload {(selectedUploadData?.document?.display_name || 'Document')}</DialogTitle></DialogHeader><FileUploadComponent open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} task={selectedUploadData?.task} document={selectedUploadData?.document} columnType={selectedUploadData?.columnType} applicantId={selectedUploadData?.applicantId} individualNames={individualNames} onUploadComplete={handleUploadComplete} /></DialogContent></Dialog>

      {/* --- MODIFICATION: Render the new Letter Template Dialog --- */}
      <LetterTemplateDialog
        open={isLetterDialogOpen}
        onOpenChange={setIsLetterDialogOpen}
        letterData={selectedLetterData}
        individualNames={individualNames}
      />

      {/* Automation Dialog */}
      {selectedAutomationData && (
        <AutomationMappingDialog
          isOpen={isAutomationDialogOpen}
          onClose={() => setIsAutomationDialogOpen(false)}
          classId={selectedAutomationData.task?.class_id || ''}
          requirementId={selectedAutomationData.document?.id || ''}
          taskId={selectedAutomationData.task?.id}
          individualId={selectedAutomationData.applicantId?.toString()}
          task={selectedAutomationData.task}
        />
      )}
    </div>
  );
}