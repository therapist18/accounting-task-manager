// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Briefcase, FileText, Loader2, Search, UploadCloud, Eye, Zap, FileType, Wand2 } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import RequirementsTableCombined from "./RequirementsTableCombined"
import { FileUploadComponent } from "../tasks/components/FileUploadComponent"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { AutomationMappingDialog } from "../tasks/components/AutomationMappingDialog"

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

  const [isLetterDialogOpen, setIsLetterDialogOpen] = useState(false);
  const [selectedLetterData, setSelectedLetterData] = useState(null);
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
          if (req.kyc_document_id) ids.add(req.kyc_document_id);
          if (req.kyc_document_ids) req.kyc_document_ids.forEach(id => ids.add(id));
        });
      }
    });
    return Array.from(ids);
  }, [taskClassRequirements]);

  // OPTIMIZED: Batch fetch individual documents
  const fetchAllIndividualData = useCallback(async (tasksToFetch: any[], requiredKycIds: string[]) => {
    console.log('🔄 [fetchAllIndividualData] Starting batch fetch...');
    const startTime = performance.now();

    const uniqueIds = new Set<number>();
    const individualTypeMap = new Map<number, string>();

    tasksToFetch.forEach(task => {
      if (task.applicant_details?.id) {
        uniqueIds.add(task.applicant_details.id);
        individualTypeMap.set(task.applicant_details.id, 'principal');
      }
      
      if (Array.isArray(task.participants_details)) {
        task.participants_details.forEach(p => {
          if (p.id) {
            uniqueIds.add(p.id);
            individualTypeMap.set(p.id, p.role || 'individual');
          }
        });
      }
      
      if (task.understudy) {
        uniqueIds.add(task.understudy);
        if (!individualTypeMap.has(task.understudy)) individualTypeMap.set(task.understudy, 'understudy');
      }
    });

    const validIds = Array.from(uniqueIds).filter(Boolean);
    if (validIds.length === 0 || requiredKycIds.length === 0) {
      console.log('⏭️ No individual IDs or required KYC IDs to fetch');
      return;
    }

    try {
      console.log(`📊 Fetching documents for ${validIds.length} individuals across ${requiredKycIds.length} document types...`);
      
      // SINGLE QUERY for all individuals and all document types
      const { data: documentsRes, error } = await supabase
        .from('acc_portal_directors_documents')
        .select('*, acc_portal_kyc (id, name, display_name)')
        .in('director_id', validIds)
        .in('document_id', requiredKycIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const endTime = performance.now();
      console.log(`✅ Fetched ${documentsRes?.length || 0} individual documents in ${Math.round(endTime - startTime)}ms`);

      // Filter documents based on applicability
      const filteredDocuments = documentsRes?.filter(doc => {
        const individualType = individualTypeMap.get(doc.director_id);
        const docApplicantTypes = doc.acc_portal_kyc?.applicant_types;
        
        if (!docApplicantTypes || !Array.isArray(docApplicantTypes) || docApplicantTypes.length === 0) return true;
        
        return docApplicantTypes.includes(individualType);
      });

      console.log(`🔍 After applicability filter: ${filteredDocuments?.length || 0} documents`);

      const documentsByDirector = filteredDocuments?.reduce((acc, doc) => {
        if (!acc[doc.director_id]) acc[doc.director_id] = [];
        acc[doc.director_id].push(doc);
        return acc;
      }, {});

      setAllIndividualDocuments(prev => ({ ...prev, ...documentsByDirector }));
    } catch (err) { 
      console.error('❌ Error Individual Fetch:', err); 
    }
  }, []);

  // OPTIMIZED: Batch fetch company documents
  const fetchAllCompanyDocuments = useCallback(async (tasksToFetch: any[], requiredKycIds: string[]) => {
    console.log('🔄 [fetchAllCompanyDocuments] Starting batch fetch...');
    const startTime = performance.now();

    const companyIds = [...new Set(tasksToFetch.flatMap(t => {
      const companyPart = t.participants_details?.find(p => p.type === 'company');
      return [t.company_id, companyPart?.id].filter(Boolean);
    }))];

    if (companyIds.length === 0 || requiredKycIds.length === 0) {
      console.log('⏭️ No company IDs or required KYC IDs to fetch');
      return;
    }

    try {
      console.log(`📊 Fetching documents for ${companyIds.length} companies across ${requiredKycIds.length} document types...`);
      
      // SINGLE QUERY for all companies and all document types
      const { data, error } = await supabase
        .from('acc_portal_kyc_uploads')
        .select('*, acc_portal_kyc (id, name, display_name)')
        .in('company_id', companyIds)
        .in('kyc_document_id', requiredKycIds)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const endTime = performance.now();
      console.log(`✅ Fetched ${data?.length || 0} company documents in ${Math.round(endTime - startTime)}ms`);
    
      const docsByCompany = data?.reduce((acc, doc) => {
        if (!acc[doc.company_id]) acc[doc.company_id] = [];
        acc[doc.company_id].push(doc);
        return acc;
      }, {});
      
      setAllCompanyDocuments(prev => ({ ...prev, ...docsByCompany }));
    } catch (err) { 
      console.error('❌ Error Company Fetch:', err); 
    }
  }, []);

  // OPTIMIZED: Batch fetch company metadata
  const fetchCompanyData = useCallback(async (tasksToFetch: any[]) => {
    console.log('🔄 [fetchCompanyData] Starting batch fetch...');
    const startTime = performance.now();
    
    const companyIds = [...new Set(tasksToFetch.flatMap(t => {
      const ids = [];
      if (t.company_id) ids.push(t.company_id);
      
      if (t.applicant_details?.type === 'company' && t.applicant_details?.id) {
        ids.push(t.applicant_details.id);
      }
      
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

    console.log(`📊 Fetching metadata for ${companyIds.length} companies...`);

    try {
      // SINGLE QUERY for all companies
      const { data, error } = await supabase
        .from('acc_portal_company_duplicate')
        .select('id, company_name')
        .in('id', companyIds);

      if (error) throw error;

      const endTime = performance.now();
      console.log(`✅ Fetched ${data?.length || 0} companies in ${Math.round(endTime - startTime)}ms`);

      const companiesMap = data?.reduce((acc, co) => {
        acc[co.id] = co;
        return acc;
      }, {} as Record<number, any>);

      setCompanyData(companiesMap || {});

    } catch (err) {
      console.error('❌ Error fetching company data:', err);
    }
  }, []);

  // OPTIMIZED: Load all data in parallel with minimal queries
  useEffect(() => {
    const loadData = async () => {
      if (!filteredTasks.length) return;
      
      console.log('🚀 [loadData] Starting optimized data loading pipeline...');
      const pipelineStartTime = performance.now();
      
      // Step 1: Fetch class requirements (unavoidable serial step)
      console.log('📋 Step 1: Fetching class requirements...');
      const reqMap = {};
      const classReqPromises = filteredTasks.map(async task => {
        const { data } = await supabase
          .from('tm_class_requirements')
          .select('*')
          .eq('job_level->>class_id', task.class_id)
          .maybeSingle();
        if (data) reqMap[task.id] = data;
      });
      
      await Promise.all(classReqPromises);
      setTaskClassRequirements(reqMap);

      // Step 2: Extract all required KYC IDs from requirements
      const requiredKycIds = [];
      Object.values(reqMap).forEach(cr => cr.requirements?.forEach(r => {
        if(r.kyc_document_id) requiredKycIds.push(r.kyc_document_id);
        if(r.kyc_document_ids) requiredKycIds.push(...r.kyc_document_ids);
      }));

      const uniqueKycIds = [...new Set(requiredKycIds)];
      console.log(`📝 Identified ${uniqueKycIds.length} unique KYC document types needed`);

      // Step 3: PARALLEL fetch all data with KYC filters
      console.log('⚡ Step 2: Parallel fetching documents and metadata...');
      setDocumentsLoading(true);
      
      await Promise.all([
        fetchAllIndividualData(filteredTasks, uniqueKycIds),
        fetchCompanyData(filteredTasks),
        fetchAllCompanyDocuments(filteredTasks, uniqueKycIds)
      ]);
      
      setDocumentsLoading(false);
      
      const pipelineEndTime = performance.now();
      console.log(`🎉 [loadData] Complete pipeline finished in ${Math.round(pipelineEndTime - pipelineStartTime)}ms`);
    };
    
    loadData();
  }, [filteredTasks, fetchAllIndividualData, fetchCompanyData, fetchAllCompanyDocuments]);

  const hasReferencesColumn = useMemo(() => filteredTasks.some(task => REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.id) || REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.parent_id)), [filteredTasks]);

  useEffect(() => {
    let isMounted = true;
    const fetchMetadata = async () => {
      if (!isMounted || !filteredTasks.length) return;
      try {
        const { data: docsRes, error: docsErr } = await supabase.from('acc_portal_kyc').select('*').order('display_name', { ascending: true, nullsLast: true });
        if (!isMounted) return;
        if (docsErr) throw docsErr;
        setDocuments((docsRes || []).map(doc => ({ ...doc, display_name: doc.display_name || doc.name })));

        const taskDataPromises = filteredTasks.map(async (task) => {
          const jobLevel = task.job_level || {};

          let query = supabase
            .from('tm_class_requirements')
            .select('*');

          if (jobLevel.department_id) {
            query = query.eq('job_level->>department_id', jobLevel.department_id.toString());
          }
          if (jobLevel.subdepartment_id) {
            query = query.eq('job_level->>subdepartment_id', jobLevel.subdepartment_id.toString());
          }

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
      let applicantName = 'Unknown Applicant';

      if (task.applicant_details?.name) {
        applicantName = task.applicant_details.name;
      } else if (task.participants_details?.length) {
        const principal = task.participants_details.find(p =>
          p.type === 'individual' &&
          (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
        );

        if (principal) {
          applicantName = principal.name;
        } else {
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
      if (!classReqs?.requirements || !Array.isArray(classReqs.requirements)) return;

      classReqs.requirements.forEach((req: any) => {
        const kycDocIds = req.kyc_document_ids || (req.kyc_document_id ? [req.kyc_document_id] : []);
        
        if (kycDocIds.length === 0) return;
        
        // Check if we already have this requirement (by ID, not name)
        const existingReq = requirementRows.find(r => r.id === req.id);
        if (existingReq) return; // Skip duplicates from multiple tasks
        
        // Get the first document for display purposes
        const firstDocId = kycDocIds[0];
        const firstDocDef = documents.find(d => d.id === firstDocId);
        
        // Determine if this is a composite requirement (multiple different document types)
        const uniqueDocTypes = new Set(
          kycDocIds.map(docId => {
            const doc = documents.find(d => d.id === docId);
            return doc?.display_name || doc?.name || 'Unknown';
          })
        );
        
        const isComposite = uniqueDocTypes.size > 1;
        
        // Use requirement name, not document name
        const requirementName = req.name || firstDocDef?.display_name || firstDocDef?.name || 'Unnamed Requirement';
        
        requirementRows.push({
          ...req,
          documentDefinition: firstDocDef, // For fields and metadata
          kyc_document_ids: kycDocIds, // All document IDs
          kyc_document_id: firstDocId, // First ID for backward compatibility
          uniqueId: req.id, // Use requirement ID as unique identifier
          name: requirementName, // Use requirement name
          documentCount: kycDocIds.length, // Total number of document types
          isMultiDocument: isComposite, // True if multiple different types
          category: (() => {
            if (req.hasTemplate) {
              return 'template';
            }
            
            const applicantTypes = req.applicantTypes || (req.applicantType ? [req.applicantType] : []);
            if (applicantTypes.includes('company')) {
              return 'company';
            }
            
            if (firstDocDef?.category === 'company-docs') {
              return 'company';
            }
            
            if (firstDocDef?.has_template) {
              return 'template';
            }
            
            return 'individual';
          })()
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
  const handleUploadComplete = useCallback(() => { 
    setUploadDialogOpen(false); 
    if (filteredTasks.length > 0) {
      const requiredKycIds = getRequiredKycIds();
      Promise.all([
        fetchAllIndividualData(filteredTasks, requiredKycIds), 
        fetchAllCompanyDocuments(filteredTasks, requiredKycIds)
      ]); 
    }
  }, [filteredTasks, getRequiredKycIds, fetchAllIndividualData, fetchAllCompanyDocuments]);

  const handleGenerateLetterAction = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number) => {
    setSelectedLetterData({ task, document: item, columnType, applicantId });
    setIsLetterDialogOpen(true);
  }, []);

  const handleAutomationAction = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number, relationshipData?: any) => {
    console.log("⚙️ Opening Automation Dialog with Relationship Data:", relationshipData);
    setSelectedAutomationData({ task, document: item, columnType, applicantId, relationshipData });
    setIsAutomationDialogOpen(true);
  }, []);

  const getDocumentStatusForColumn = useCallback((task: any, reqItem: any, columnType: ApplicantType, applicantId?: number): 
  DocumentStatus => {
    const baseStatus = { documents: [], count: 0 };
    const kycDocIds = reqItem.kyc_document_ids || (reqItem.kyc_document_id ? [reqItem.kyc_document_id] : []);
    
    if (kycDocIds.length === 0) return baseStatus;

    const allowedTypes = reqItem.applicantTypes || (reqItem.applicantType ? [reqItem.applicantType] : []);
    const normalizedColType = columnType === 'director' ? 'principal' : columnType;
    if (!allowedTypes.includes(normalizedColType)) return { ...baseStatus, type: 'na' };

    let foundDocuments: any[] = [];

    if (columnType === 'company') {
      let companyId = null;
      
      if (task.applicant_details?.type === 'company' && task.applicant_details?.id) {
        companyId = task.applicant_details.id;
      } else if (task.participants_details) {
        const companyPart = task.participants_details.find(p => p.type === 'company');
        companyId = companyPart?.id;
      }
      
      if (!companyId) {
        companyId = task.company_id;
      }
      
      if (companyId && allCompanyDocuments[companyId]) {
        foundDocuments = allCompanyDocuments[companyId].filter(doc => 
          kycDocIds.includes(doc.kyc_document_id)
        );
      }
    } else {
      let individualId = applicantId;
      
      if (columnType === 'principal') {
        if (task.applicant_details?.type === 'individual' && task.applicant_details?.id) {
          individualId = task.applicant_details.id;
        } else if (task.participants_details) {
          const principalIndividual = task.participants_details.find(p => 
            p.type === 'individual' && 
            (p.role === 'principal' || p.role === 'applicant' || (!p.role && !p.relationship))
          );
          individualId = principalIndividual?.id || task.individual_id;
        } else {
          individualId = task.individual_id;
        }
      } else if (columnType === 'understudy') {
        individualId = task.understudy;
      }

      if (individualId && allIndividualDocuments[individualId]) {
        foundDocuments = allIndividualDocuments[individualId].filter(doc => 
          kycDocIds.includes(doc.document_id)
        );
      }
    }

    const type = foundDocuments.length > 0 ? 'view' : 'upload';
    return { ...baseStatus, documents: foundDocuments, count: foundDocuments.length, type };
  }, [allCompanyDocuments, allIndividualDocuments]);

  const renderDocumentStatus = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number, relationshipData?: any) => {
    const status = getDocumentStatusForColumn(task, item, columnType, applicantId);
    const isLetter = item.main_category === 'Letters';

    const handleViewClick = async () => {
      if (status.documents.length === 0) return;

      try {
        const documentPreviews = (await Promise.all(status.documents.map(async (doc) => {
          if (!doc.file_path) {
            console.warn('Document missing file_path:', doc.id);
            return null;
          }

          const { data, error } = await supabase.storage
            .from('kyc-documents')
            .createSignedUrl(doc.file_path, 3600);

          if (error) throw error;

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
            extractedData: doc.extracted_details || {},
            fields: fields,
            name: doc.acc_portal_kyc?.display_name || item.display_name,
            uploadedAt: doc.created_at
          };
        }))).filter(Boolean);

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

    if (status.type === 'na') return <div className="text-gray-400 text-[10px]">N/A</div>;

    return (
      <div className="flex items-center justify-center gap-1 h-full">
        {item.web_automation?.automationId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
            onClick={() => handleAutomationAction(task, item, columnType, applicantId, relationshipData)}
            title={`Run Automation: ${item.web_automation.automationName}`}
          >
            <Zap className="h-4 w-4" />
          </Button>
        )}

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
        
        {!item.web_automation?.automationId && (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50" onClick={() => handleUploadAction(task, item, columnType, applicantId)} title={`Upload ${item.display_name}`}><UploadCloud className="h-4 w-4" /></Button>
        )}
        
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

  const getCompanyName = (group) => {
    const task = group.tasks[0];
    if (!task) return null;

    if (task.applicant_details?.type === 'company') {
      return task.applicant_details.name;
    }

    if (Array.isArray(task.participants_details)) {
      const company = task.participants_details.find(p => p.type === 'company');
      if (company) return company.name;
    }

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

      <LetterTemplateDialog
        open={isLetterDialogOpen}
        onOpenChange={setIsLetterDialogOpen}
        letterData={selectedLetterData}
        individualNames={individualNames}
      />

      {selectedAutomationData && (
        <AutomationMappingDialog
          isOpen={isAutomationDialogOpen}
          onClose={() => setIsAutomationDialogOpen(false)}
          classId={selectedAutomationData.task?.class_id || ''}
          requirementId={selectedAutomationData.document?.id || ''}
          taskId={selectedAutomationData.task?.id}
          individualId={selectedAutomationData.applicantId?.toString()}
          task={selectedAutomationData.task}
          relationshipData={selectedAutomationData.relationshipData}
        />
      )}

    </div>
  );
}