// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { BarChart3, Briefcase, ChevronLeft, ChevronRight, Eye, EyeOff, FileText, Loader2, Search, Upload } from "lucide-react"
import { format, parseISO } from "date-fns"
import { supabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { getTableFields } from "../../departments/documents+fields/components/formFields"
import { toast } from "@/hooks/use-toast"
import { FileUploadComponent } from "../components/FileUploadComponent"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import ExtractionPreview from "@/components/ExtractionPreview"
import RequirementsTableCombined from "./RequirementsTableCombined"

// Props interface for the main component
interface RequirementsTableProps {
  tasks: any[]
  loading: boolean
  error: string | null
  onTaskAction?: (action: string, task: any) => void
  onShowUploadDialog?: (task: any, requirement?: any) => void
  onViewDocument?: (task: any, requirement: any) => void
  requirements: any[]
  sortConfig?: { key: string; direction: 'asc' | 'desc' } | null
  onSort?: (key: string) => void
  applicantDocuments?: Record<number, any[]>
  activeTab?: string
  documentTab?: "company" | "individual"
}

type ApplicantType = 'principal' | 'dependant' | 'understudy' | 'company' | 'reference';

interface DocumentStatus {
  type: 'upload' | 'view' | 'na' | 'missing'
  documents: any[]
  count: number
  applicantTypes: {
    principal: boolean
    dependant: boolean
    understudy: boolean
    reference: boolean
  }
}

// Constants for specific subdepartment IDs that require a "References" column
const REFERENCE_SUBDEPARTMENT_IDS = [10, 5];

export function RequirementsTable({
  tasks,
  loading,
  error,
  activeTab = "work-in-progress",
  documentTab = "individual"
}: RequirementsTableProps) {
  // --- STATE MANAGEMENT ---
  const [documents, setDocuments] = useState<any[]>([])
  const [bclTemplateDocuments, setBclTemplateDocuments] = useState<any[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [taskClassRequirements, setTaskClassRequirements] = useState<Record<string, any>>({})
  const [taskIndividualData, setTaskIndividualData] = useState<Record<string, any>>({})
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set())
  const [showStats, setShowStats] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedApplicant, setSelectedApplicant] = useState<string | null>(null);
  const [individualNames, setIndividualNames] = useState<Record<number, string>>({})
  const [allIndividualDocuments, setAllIndividualDocuments] = useState<Record<string, any[]>>({});
  const [allCompanyDocuments, setAllCompanyDocuments] = useState<Record<string, any[]>>({});
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [selectedUploadData, setSelectedUploadData] = useState<any>(null)
  const [stageDocuments, setStageDocuments] = useState<any[]>([])
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(false);
  const [selectedDocumentForPreview, setSelectedDocumentForPreview] = useState<any>(null);
  const [companyData, setCompanyData] = useState<Record<number, any>>({});
  const [documentStatusesMap, setDocumentStatusesMap] = useState<Record<string, { status: DocumentStatus; loading: boolean; }>>({});
  const [taskReferences, setTaskReferences] = useState<Record<string, any[]>>({});
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");

  // --- DATA FETCHING AND PROCESSING ---

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

  const clientFormFields = useMemo(() => getTableFields(documentTab), [documentTab]);

  const fetchAllIndividualData = useCallback(async (tasksToFetch: any[]) => {
    const uniqueIds = new Set<number>();
    tasksToFetch.forEach(task => {
      if (task.principal_member) uniqueIds.add(task.principal_member);
      if (task.understudy_member) uniqueIds.add(task.understudy_member);
      if (task.individual_id) uniqueIds.add(task.individual_id);
      if (Array.isArray(task.dependant_member)) task.dependant_member.forEach(dep => dep.id && uniqueIds.add(dep.id));
      if (Array.isArray(task.references)) task.references.forEach(ref => ref.id && uniqueIds.add(ref.id));
    });

    const validIds = Array.from(uniqueIds).filter(id => id != null);
    if (validIds.length === 0) return;

    try {
      const [individualsRes, documentsRes] = await Promise.all([
        supabase.from('registry_individuals').select('id, full_name').in('id', validIds),
        supabase.from('acc_portal_directors_documents').select(`*, acc_portal_kyc (id, name, display_name)`).in('director_id', validIds).order('created_at', { ascending: false })
      ]);

      if (individualsRes.error) throw individualsRes.error;
      if (documentsRes.error) throw documentsRes.error;

      const namesMap = individualsRes.data?.reduce((acc, ind) => ({ ...acc, [ind.id]: ind.full_name }), {});
      setIndividualNames(prev => ({ ...prev, ...namesMap }));

      const documentsByDirector = documentsRes.data?.reduce((acc, doc) => {
        acc[doc.director_id] = [...(acc[doc.director_id] || []), doc];
        return acc;
      }, {});
      setAllIndividualDocuments(documentsByDirector || {});
    } catch (err) {
      console.error('Error fetching individual data:', err);
    }
  }, []);

  const fetchCompanyData = useCallback(async (tasksToFetch: any[]) => {
    const companyIds = [...new Set(tasksToFetch.map(t => t.company_id).filter(Boolean))];
    if (companyIds.length === 0) return;
    try {
      const { data, error } = await supabase.from('acc_portal_company_duplicate').select('id, company_name, company_type, registration_number').in('id', companyIds);
      if (error) throw error;
      const companiesMap = data?.reduce((acc, co) => ({ ...acc, [co.id]: co }), {});
      setCompanyData(companiesMap || {});
    } catch (err) {
      console.error('Error fetching company data:', err);
    }
  }, []);

  const fetchTaskReferences = useCallback(async (tasksToFetch: any[]) => {
    const referenceTasks = tasksToFetch.filter(task => REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.id) || REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.parent_id));
    if (referenceTasks.length === 0) return;
    const referencesByTask = referenceTasks.reduce((acc, task) => {
      if (Array.isArray(task.references)) acc[task.id] = task.references;
      return acc;
    }, {});
    setTaskReferences(referencesByTask);
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
    } catch (err) {
      console.error('Error fetching company documents:', err);
    }
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => activeTab === "completed" ? (task.status === "completed" || task.status === "approved") : (task.status !== "completed" && task.status !== "approved"));
  }, [tasks, activeTab]);

  const hasReferencesColumn = useMemo(() => {
    return filteredTasks.some(task => REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.id) || REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.parent_id));
  }, [filteredTasks]);

  useEffect(() => {
    if (!filteredTasks.length) {
      setDocumentsLoading(false);
      return;
    }
    const loadAllData = async () => {
      setDocumentsLoading(true);
      await Promise.all([
        fetchAllIndividualData(filteredTasks),
        fetchCompanyData(filteredTasks),
        fetchTaskReferences(filteredTasks),
        fetchAllCompanyDocuments(filteredTasks)
      ]);
      setDocumentsLoaded(true);
      setDocumentsLoading(false);
    };
    loadAllData();
  }, [filteredTasks, fetchAllIndividualData, fetchTaskReferences, fetchCompanyData, fetchAllCompanyDocuments]);

  useEffect(() => {
    let isMounted = true;
    const fetchMetadata = async () => {
      if (!isMounted || !filteredTasks.length) return;
      try {
        const [docsRes, bclRes] = await Promise.all([
          supabase.from('acc_portal_kyc').select('*').order('custom_order', { ascending: true, nullsLast: true }),
          supabase.from('acc_portal_kyc').select('*').eq('has_template', true).order('custom_order', { ascending: true, nullsLast: true }),
        ]);
        if (!isMounted) return;
        if (docsRes.error) throw docsRes.error;
        if (bclRes.error) throw bclRes.error;
        const processedDocs = (docsRes.data || []).map(doc => ({ ...doc, display_name: doc.display_name || doc.name }));
        const processedBcl = (bclRes.data || []).map(doc => ({ ...doc, display_name: doc.display_name || doc.name }));
        setDocuments(processedDocs);
        setBclTemplateDocuments(processedBcl);

        const taskDataPromises = filteredTasks.map(async (task) => {
          const classId = task.subclass_id || (task.class_id && (task.subdepartment?.id || task.subdepartment_id) ? `${task.subdepartment.id}_${task.class_id}` : task.class_id);
          let classRequirements = null;
          if (classId) {
            const { data } = await supabase.from('tm_class_requirements').select('*').eq('class_id', classId).maybeSingle();
            classRequirements = data;
          }
          return { taskId: task.id, classRequirements };
        });
        const results = await Promise.all(taskDataPromises);
        const requirementsMap = results.reduce((acc, res) => {
          if (res.classRequirements) acc[res.taskId] = res.classRequirements;
          return acc;
        }, {});
        setTaskClassRequirements(requirementsMap);

      } catch (err) {
        console.error('Error fetching metadata:', err);
      }
    };
    fetchMetadata();
    return () => { isMounted = false; };
  }, [filteredTasks]);

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, any[]>();
    filteredTasks.forEach(task => {
      let applicantName = task.applicant_name || task.company_name || 'Unknown Applicant';
      if (!groups.has(applicantName)) groups.set(applicantName, []);
      groups.get(applicantName)!.push(task);
    });
    return Array.from(groups.entries()).map(([name, tasks]) => ({ applicantName: name, tasks }));
  }, [filteredTasks]);

  const searchedGroupedTasks = useMemo(() => {
    if (!sidebarSearchQuery) return groupedTasks;
    return groupedTasks.filter(group => group.applicantName.toLowerCase().includes(sidebarSearchQuery.toLowerCase()));
  }, [groupedTasks, sidebarSearchQuery]);

  const filteredGroupedTasks = useMemo(() => {
    if (!selectedApplicant) return searchedGroupedTasks;
    return searchedGroupedTasks.filter(group => group.applicantName === selectedApplicant);
  }, [searchedGroupedTasks, selectedApplicant]);

  useEffect(() => {
    if (searchedGroupedTasks.length > 0 && !selectedApplicant) {
      setSelectedApplicant(searchedGroupedTasks[0]?.applicantName || null);
    } else if (searchedGroupedTasks.length === 0) {
      setSelectedApplicant(null);
    }
  }, [searchedGroupedTasks, selectedApplicant]);

  const organizedRequirements = useMemo(() => {
    const documentsMap = new Map<string, { document: any; fields: any[]; category: 'company' | 'individual'; }>();
    const bclCompanyTemplates: any[] = [];
    const bclIndividualTemplates: any[] = [];
    const postAppCompanyDocuments: any[] = [];
    const postAppIndividualDocuments: any[] = [];
    const clientFieldsMap = new Map<string, { field: any; category: 'company' | 'individual' }>();
    const selectedBclTemplateIds = new Set<string>();
    const stageDocumentIds = new Set<string>();

    stageDocuments.forEach(stageDoc => {
      stageDocumentIds.add(stageDoc.id);
      const category = stageDoc.category === 'company-docs' ? 'company' : 'individual';
      if (category === 'company') postAppCompanyDocuments.push(stageDoc);
      else postAppIndividualDocuments.push(stageDoc);
    });

    filteredTasks.forEach(task => {
      const classReqs = taskClassRequirements[task.id];
      if (!classReqs || !Array.isArray(classReqs.documents_and_fields)) return;

      classReqs.documents_and_fields.forEach((item: any) => {
        const parsed = parseSelectionId(item.id);
        if (parsed.type === 'document' && bclTemplateDocuments.some(doc => doc.id === parsed.documentId)) {
          selectedBclTemplateIds.add(parsed.documentId);
        }
      });
    });

    filteredTasks.forEach(task => {
      const classReqs = taskClassRequirements[task.id];
      if (!classReqs) return;

      if (Array.isArray(classReqs.documents_and_fields)) {
        classReqs.documents_and_fields.forEach((item: any) => {
          const parsed = parseSelectionId(item.id);
          const docId = parsed.documentId;
          if (stageDocumentIds.has(docId)) return;

          const isBcl = selectedBclTemplateIds.has(docId);
          const docDef = isBcl ? bclTemplateDocuments.find(d => d.id === docId) : documents.find(d => d.id === docId);
          if (!docDef) return;

          const category = docDef.category === 'company-docs' ? 'company' : 'individual';
          const itemWithSettings = { ...docDef, selectionId: item.id, ...item };

          if (parsed.type === 'document') {
            if (isBcl) {
              const targetArray = category === 'company' ? bclCompanyTemplates : bclIndividualTemplates;
              if (!targetArray.some(t => t.id === docId)) targetArray.push(itemWithSettings);
            } else if (!documentsMap.has(docId)) {
              documentsMap.set(docId, { document: itemWithSettings, fields: [], category });
            }
          } else if (parsed.type === 'field' && parsed.fieldId && !isBcl) {
            if (!documentsMap.has(docId)) documentsMap.set(docId, { document: docDef, fields: [], category });
            const field = docDef.fields?.find((f: any) => f.id === parsed.fieldId);
            if (field) {
              const docEntry = documentsMap.get(docId)!;
              if (!docEntry.fields.some(f => f.id === field.id)) {
                docEntry.fields.push({ ...field, selectionId: item.id, ...item });
              }
            }
          }
        });
      }

      if (Array.isArray(classReqs.client_fields)) {
        classReqs.client_fields.forEach((item: any) => {
          let fieldName = item.id.replace(/^form-field-|^platform-.*?-/, '').replace(/_\d+_\d+$/, '');
          const field = clientFormFields.find(f => f.name === fieldName);
          if (field && !clientFieldsMap.has(item.id)) {
            clientFieldsMap.set(item.id, { field: { ...field, selectionId: item.id, ...item }, category: documentTab });
          }
        });
      }
    });

    return {
      documents: {
        company: Array.from(documentsMap.values()).filter(i => i.category === 'company'),
        individual: Array.from(documentsMap.values()).filter(i => i.category === 'individual'),
      },
      clientFields: {
        company: Array.from(clientFieldsMap.values()).filter(i => i.category === 'company'),
        individual: Array.from(clientFieldsMap.values()).filter(i => i.category === 'individual'),
      },
      bclTemplates: { company: bclCompanyTemplates, individual: bclIndividualTemplates },
      postApplication: { company: postAppCompanyDocuments, individual: postAppIndividualDocuments },
    };
  }, [filteredTasks, taskClassRequirements, documents, bclTemplateDocuments, stageDocuments, clientFormFields, documentTab, parseSelectionId]);

  const calculateStats = useMemo(() => {
    const stats = { uploaded: 0, missing: 0, na: 0, total: 0 };
    Object.values(documentStatusesMap).forEach(({ status }) => {
      stats.total++;
      if (status.type === 'view') stats.uploaded++;
      else if (status.type === 'upload' || status.type === 'missing') stats.missing++;
      else if (status.type === 'na') stats.na++;
    });
    return stats;
  }, [documentStatusesMap]);

  // --- CALLBACKS AND HANDLERS ---

  const handleSelectApplicant = (applicantName: string) => setSelectedApplicant(applicantName);

  const toggleDocumentExpansion = useCallback((docId: string) => {
    setExpandedDocuments(prev => {
      const newSet = new Set(prev);
      newSet.has(docId) ? newSet.delete(docId) : newSet.add(docId);
      return newSet;
    });
  }, []);

  const handleUploadAction = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number) => {
    setSelectedUploadData({ task, document: item, columnType, applicantId });
    setUploadDialogOpen(true);
  }, []);

  const handleUploadComplete = useCallback(() => {
    setUploadDialogOpen(false);
    if (filteredTasks.length > 0) {
      Promise.all([fetchAllIndividualData(filteredTasks), fetchAllCompanyDocuments(filteredTasks)])
        .then(() => setDocumentStatusesMap({})); // Force status recalculation
    }
  }, [filteredTasks, fetchAllIndividualData, fetchAllCompanyDocuments]);

  const getDocumentStatusForColumn = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number): DocumentStatus => {
    const itemId = item.selectionId || item.id;
    const isCompanyDocument = item.category === 'company-docs' || item.category === 'company';

    const baseStatus = { documents: [], count: 0, applicantTypes: { principal: item.ap, dependant: item.dp, understudy: item.understudy, reference: item.reference } };

    if ((columnType === 'company' && !isCompanyDocument) || (columnType !== 'company' && isCompanyDocument)) {
      return { ...baseStatus, type: 'na' };
    }

    const isApplicable = (columnType === 'principal' && (item.ap || item.display)) ||
      (columnType === 'dependant' && (item.dp || item.display)) ||
      (columnType === 'understudy' && (item.understudy || item.display)) ||
      (columnType === 'reference' && (item.reference || item.display)) ||
      columnType === 'company';

    if (!isApplicable) return { ...baseStatus, type: 'na' };

    let foundDocuments: any[] = [];
    const baseItemId = itemId.split('_')[0];

    if (columnType === 'company') {
      if (task.company_id && allCompanyDocuments[task.company_id]) {
        foundDocuments = allCompanyDocuments[task.company_id].filter(doc => doc.kyc_document_id === baseItemId || doc.kyc_document_id === itemId || doc.kyc_document_id === item.id);
      }
    } else {
      let individualId: number | null = null;
      if (columnType === 'principal') individualId = task.principal_member || task.individual_id;
      else if (columnType === 'understudy') individualId = task.understudy_member || task.individual_id;
      else if (columnType === 'dependant' || columnType === 'reference') individualId = applicantId;

      if (individualId && allIndividualDocuments[individualId]) {
        foundDocuments = allIndividualDocuments[individualId].filter(doc => {
          const docId = doc.document_id || '';
          const kycId = doc.acc_portal_kyc?.id || '';
          return docId === baseItemId || docId === itemId || kycId === baseItemId || kycId === itemId;
        });
      }
    }

    return { ...baseStatus, documents: foundDocuments, count: foundDocuments.length, type: foundDocuments.length > 0 ? 'view' : 'upload' };
  }, [allCompanyDocuments, allIndividualDocuments]);

  // --- RENDER FUNCTIONS ---

  const renderDocumentStatus = useCallback((task: any, item: any, columnType: ApplicantType, applicantId?: number) => {
    const status = getDocumentStatusForColumn(task, item, columnType, applicantId);

    const handleViewClick = async () => {
      if (status.documents.length === 0) return;
      const docToPreview = status.documents[0];
      try {
        const { data, error } = await supabase.storage.from('kyc-documents').createSignedUrl(docToPreview.file_path, 3600);
        if (error) throw error;

        const docDef = documents.find(d => d.id === docToPreview.document_id || d.id === docToPreview.kyc_document_id) ||
          bclTemplateDocuments.find(d => d.id === docToPreview.document_id || d.id === docToPreview.kyc_document_id);

        setSelectedDocumentForPreview({
          documentName: docDef?.display_name || docToPreview.acc_portal_kyc?.display_name || 'Document',
          extractedData: docToPreview.extracted_details || {},
          fields: docDef?.fields || [],
          fileUrl: data.signedUrl,
          fileName: docToPreview.file_path?.split('/').pop() || '',
          allDocuments: status.documents,
          currentIndex: 0,
          uploadDate: docToPreview.created_at,
          documentStatus: docToPreview.status,
          columnType,
          applicantId
        });
        setDocumentPreviewOpen(true);
      } catch (err) {
        console.error('Error getting file URL:', err);
        toast({ title: 'Error', description: 'Failed to load document preview', variant: 'destructive' });
      }
    };

    switch (status.type) {
      case 'na':
        return <div className="flex items-center justify-center h-full"><span className="text-gray-400 text-xs">N/A</span></div>;
      case 'view':
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600 hover:bg-green-100" onClick={handleViewClick} title={`View ${status.count} document(s)`}>
                <Eye className="h-4 w-4" />
              </Button>
              {status.count > 1 && <Badge variant="outline" className="h-5 w-5 p-0 flex items-center justify-center text-xs bg-green-50 text-green-700 border-green-200">{status.count}</Badge>}
            </div>
            <span className="text-[10px] text-green-600 font-medium mt-0.5">Uploaded</span>
          </div>
        );
      case 'upload':
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50" onClick={() => handleUploadAction(task, item, columnType, applicantId)} title={`Upload ${item.display_name || item.name}`}>
              <Upload className="h-4 w-4" />
            </Button>
            <span className="text-[10px] text-amber-600 font-medium mt-0.5">Upload</span>
          </div>
        );
      default:
        return <div className="flex items-center justify-center h-full"><span className="text-gray-400 text-xs">-</span></div>;
    }
  }, [getDocumentStatusForColumn, handleUploadAction, documents, bclTemplateDocuments]);

  const renderClientFieldData = useCallback((task: any, item: any, columnType: ApplicantType) => {
    if (columnType === 'company') {
      return <div className="text-center"><span className="text-gray-400 text-xs">N/A</span></div>;
    }
    const individualData = taskIndividualData[task.id];
    if (!individualData) return <div className="text-center"><span className="text-red-500 text-xs">No Registry Data</span></div>;
    const fieldValue = individualData[item.field.name];
    if (fieldValue == null) return <div className="text-center"><span className="text-red-500 text-xs">Missing</span></div>;
    return <div className="text-center"><span className="text-blue-600 text-xs truncate max-w-[100px] inline-block">{String(fieldValue)}</span></div>;
  }, [taskIndividualData]);

  const renderReferencesData = useCallback((task: any, columnType: ApplicantType, applicantId?: number) => {
    const isApplicable = REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.id) || REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.parent_id);
    if (!isApplicable || columnType === 'company') return <div className="text-center p-2"><span className="text-gray-400 text-xs">N/A</span></div>;

    const references = taskReferences[task.id] || [];
    if (references.length === 0) {
      return <div className="text-center p-2"><Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-amber-600"><Upload className="h-4 w-4" /></Button><span className="text-[10px] text-amber-600 font-medium mt-0.5">Upload</span></div>;
    }
    return <div className="text-center p-2"><Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600"><Eye className="h-4 w-4" /></Button><span className="text-[10px] text-green-600 font-medium">View Refs</span></div>;
  }, [taskReferences]);

  return (
    <div className="flex h-[85vh] w-full bg-white">
      {/* Sidebar with Applicant List and Search */}
      <div className={cn("w-64 border-r transition-all duration-300 ease-in-out bg-white flex flex-col", !sidebarOpen && "hidden md:block")}>
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Applicants</h2>
        </div>

        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search applicants..." className="pl-8" value={sidebarSearchQuery} onChange={(e) => setSidebarSearchQuery(e.target.value)} />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {searchedGroupedTasks.map((group) => (
              <Button key={group.applicantName} variant={selectedApplicant === group.applicantName ? "secondary" : "ghost"} className={cn("w-full justify-start h-auto py-2", selectedApplicant === group.applicantName && "bg-muted")} onClick={() => handleSelectApplicant(group.applicantName)}>
                <div className="flex flex-col items-start w-full">
                  <div className="flex items-center justify-between w-full">
                    <span className="truncate text-left text-sm font-medium">{group.applicantName}</span>
                    <Badge variant="outline" className="ml-2 flex-shrink-0">{group.tasks.length}</Badge>
                  </div>
                  {group.tasks[0]?.company_id && companyData[group.tasks[0].company_id] && (
                    <span className="text-xs text-muted-foreground truncate w-full text-left mt-1 flex items-center">
                      <Briefcase className="h-3 w-3 inline-block mr-1.5 flex-shrink-0" />
                      {companyData[group.tasks[0].company_id].company_name}
                    </span>
                  )}
                </div>
              </Button>
            ))}
            {loading && <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div>}
            {!loading && searchedGroupedTasks.length === 0 && <p className="text-center text-sm text-muted-foreground p-4">No applicants found.</p>}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col border rounded-md bg-background shadow-sm">
        {showStats && (
          <div className="border-b bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded"></div><span className="text-sm font-medium">Uploaded: {calculateStats.uploaded}</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-orange-500 rounded"></div><span className="text-sm font-medium">Missing: {calculateStats.missing}</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-gray-400 rounded"></div><span className="text-sm font-medium">N/A: {calculateStats.na}</span></div>
                <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-600" /><span className="text-sm font-medium">Total: {calculateStats.total}</span></div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowStats(false)} className="text-gray-500 hover:text-gray-700"><EyeOff className="h-4 w-4 mr-2" />Hide Stats</Button>
            </div>
          </div>
        )}

        <div className="overflow-auto flex-1">
          <RequirementsTableCombined
            loading={documentsLoading}
            error={error}
            filteredGroupedTasks={filteredGroupedTasks}
            organizedRequirements={organizedRequirements}
            expandedDocuments={expandedDocuments}
            toggleDocumentExpansion={toggleDocumentExpansion}
            renderDocumentStatus={renderDocumentStatus}
            renderClientFieldData={renderClientFieldData}
            renderReferencesData={renderReferencesData}
            hasReferencesColumn={hasReferencesColumn}
            individualNames={individualNames}
            companyData={companyData}
          />
        </div>

        <div className="border-t bg-gray-50 p-3">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-4">
              <span><strong>{filteredTasks.length}</strong> {activeTab === 'completed' ? 'completed' : 'active'} applications</span>
              <span><strong>{groupedTasks.length}</strong> applicant{groupedTasks.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded"></div><span className="text-xs">Uploaded ({calculateStats.uploaded})</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-orange-500 rounded"></div><span className="text-xs">Missing ({calculateStats.missing})</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-gray-400 rounded"></div><span className="text-xs">N/A ({calculateStats.na})</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Document Preview Dialog */}
      {selectedDocumentForPreview && (
        <Dialog open={documentPreviewOpen} onOpenChange={setDocumentPreviewOpen}>
          <DialogContent className="max-w-6xl max-h-[98vh] p-0">
            <div className="h-[98vh] flex flex-col">
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex flex-col">
                  <DialogTitle className="flex items-center gap-2">
                    {selectedDocumentForPreview.documentName}
                    {selectedDocumentForPreview.documentStatus && (
                      <Badge
                        variant={selectedDocumentForPreview.documentStatus === 'valid' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {selectedDocumentForPreview.documentStatus}
                      </Badge>
                    )}
                    {selectedDocumentForPreview.allDocuments?.length > 1 && (
                      <span className="text-sm font-normal text-gray-500">
                        ({selectedDocumentForPreview.currentIndex + 1} of {selectedDocumentForPreview.allDocuments.length})
                      </span>
                    )}
                  </DialogTitle>
                  {selectedDocumentForPreview.uploadDate && (
                    <p className="text-sm text-gray-500 mt-1">
                      Uploaded: {format(parseISO(selectedDocumentForPreview.uploadDate), 'MMM dd, yyyy HH:mm')}
                      {selectedDocumentForPreview.columnType && (
                        <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                          {selectedDocumentForPreview.columnType}
                          {selectedDocumentForPreview.dependantId && ` - ${individualNames[selectedDocumentForPreview.dependantId]}`}
                        </span>
                      )}
                    </p>
                  )}
                </div>

                {selectedDocumentForPreview.allDocuments?.length > 1 && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const newIndex = selectedDocumentForPreview.currentIndex > 0
                          ? selectedDocumentForPreview.currentIndex - 1
                          : selectedDocumentForPreview.allDocuments.length - 1;

                        const document = selectedDocumentForPreview.allDocuments[newIndex];

                        try {
                          const { data: signedUrl, error } = await supabase.storage
                            .from('kyc-documents')
                            .createSignedUrl(document.file_path, 3600)

                          if (error) throw error;

                          setSelectedDocumentForPreview({
                            ...selectedDocumentForPreview,
                            extractedData: document.extracted_details || {},
                            fileUrl: signedUrl.signedUrl,
                            fileName: document.file_path?.split('/').pop() || '',
                            currentIndex: newIndex,
                            uploadDate: document.created_at,
                            documentStatus: document.status
                          });
                        } catch (error) {
                          console.error('Error loading previous document:', error);
                        }
                      }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const newIndex = selectedDocumentForPreview.currentIndex < selectedDocumentForPreview.allDocuments.length - 1
                          ? selectedDocumentForPreview.currentIndex + 1
                          : 0;

                        const document = selectedDocumentForPreview.allDocuments[newIndex];

                        try {
                          const { data: signedUrl, error } = await supabase.storage
                            .from('kyc-documents')
                            .createSignedUrl(document.file_path, 3600)

                          if (error) throw error;

                          setSelectedDocumentForPreview({
                            ...selectedDocumentForPreview,
                            extractedData: document.extracted_details || {},
                            fileUrl: signedUrl.signedUrl,
                            fileName: document.file_path?.split('/').pop() || '',
                            currentIndex: newIndex,
                            uploadDate: document.created_at,
                            documentStatus: document.status
                          });
                        } catch (error) {
                          console.error('Error loading next document:', error);
                        }
                      }}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-auto">
                <ExtractionPreview
                  documentName={selectedDocumentForPreview.documentName}
                  extractedData={selectedDocumentForPreview.extractedData || {}}
                  fields={selectedDocumentForPreview.fields || []}
                  fileUrl={selectedDocumentForPreview.fileUrl}
                  fileName={selectedDocumentForPreview.fileName}
                  expanded={true}
                  showSaveButton={false}
                  type={selectedDocumentForPreview.columnType}
                  viewMode={true}
                  onDataChange={() => { }}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-6xl w-[90vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Upload {(selectedUploadData?.document?.display_name || 'Document')} for {selectedUploadData?.columnType}
            </DialogTitle>
          </DialogHeader>
          <FileUploadComponent
            open={uploadDialogOpen}
            onOpenChange={setUploadDialogOpen}
            task={selectedUploadData?.task}
            document={selectedUploadData?.document}
            columnType={selectedUploadData?.columnType}
            applicantId={selectedUploadData?.applicantId}
            individualNames={individualNames}
            onUploadComplete={handleUploadComplete}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}