// @ts-nocheck 
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, BarChart3, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Eye, EyeOff, FileText, HelpCircle, Info, Loader2, Menu, Minus, Pin, Plus, Sidebar, Upload, UserCheck, X, Users, Briefcase, } from "lucide-react"
import { format, parseISO } from "date-fns"
import { supabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { getTableFields, getGroupedFields } from "../../departments/documents+fields/formFields"
import { toast } from "@/hooks/use-toast"
import { useSearchParams, useRouter } from "next/navigation"
import { FileUploadComponent } from "./FileUploadComponent"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import ExtractionPreview from "@/components/ExtractionPreview"
import RequirementsTableHeader from "./RequirementsTableHeader"
import RequirementsTableBody from "./RequirementsTableBody"
import RequirementsTableCombined from "./RequirementsTableCombined"

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
  activeTab?: string // "completed" | "work-in-progress"
  documentTab?: "company" | "individual"
  classId?: string
  applicantType?: 'principal' | 'dependant' | 'understudy'
}

type ApplicantType = 'principal' | 'dependant' | 'understudy';

interface DocumentStatus {
  type: 'upload' | 'view' | 'na' | 'missing'
  documents: any[]
  count: number
  applicantTypes: {
    principal: boolean
    dependant: boolean
    understudy: boolean
  }
}

const CLASS_D_ID = '1750687058159';
const REFERENCE_SUBDEPARTMENT_IDS = [10, 5]; // Subdepartments 10 and 5

export function RequirementsTable({
  tasks,
  loading,
  error,
  onTaskAction,
  onShowUploadDialog,
  onViewDocument,
  requirements,
  sortConfig,
  onSort,
  applicantDocuments = {},
  activeTab = "work-in-progress",
  documentTab = "individual"
}: RequirementsTableProps) {

  const [documents, setDocuments] = useState<any[]>([])
  const [bclTemplateDocuments, setBclTemplateDocuments] = useState<any[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [taskClassRequirements, setTaskClassRequirements] = useState<Record<string, any>>({})
  const [taskIndividualData, setTaskIndividualData] = useState<Record<string, any>>({})
  const [taskCounts, setTaskCounts] = useState<Record<string, { documentsAndFieldsCount: number, clientFieldsCount: number }>>({})
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set())
  const [showStats, setShowStats] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedApplicant, setSelectedApplicant] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [taskDocuments, setTaskDocuments] = useState<Record<string, Record<string, any[]>>>({})
  const [documentStatuses, setDocumentStatuses] = useState<Record<string, DocumentStatus>>({})
  const [loadingDocuments, setLoadingDocuments] = useState<Set<string>>(new Set())
  const [principalMemberData, setPrincipalMemberData] = useState<Record<string, any>>({})
  const [individualNames, setIndividualNames] = useState<Record<number, string>>({})
  const [allIndividualDocuments, setAllIndividualDocuments] = useState<Record<string, any[]>>({});
  const [allCompanyDocuments, setAllCompanyDocuments] = useState<Record<string, any[]>>({});
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [fetchingDocuments, setFetchingDocuments] = useState<Set<string>>(new Set())
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [selectedUploadData, setSelectedUploadData] = useState<{
    task: any,
    document: any,
    columnType: 'principal' | 'dependant' | 'understudy'
  } | null>(null)
  const [stageDocuments, setStageDocuments] = useState<any[]>([])
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(false);
  const [selectedDocumentForPreview, setSelectedDocumentForPreview] = useState<{
    documentName: string;
    extractedData: any;
    fields: any[];
    fileUrl: string;
    fileName: string;
    currentIndex: number;
    allDocuments: any[];
    uploadDate?: string;
    documentStatus?: string;
    columnType?: 'principal' | 'dependant' | 'understudy';
  } | null>(null);
  const [companyData, setCompanyData] = useState<Record<number, any>>({});
  const [documentStatusesMap, setDocumentStatusesMap] = useState<Record<string, {
    status: DocumentStatus;
    loading: boolean;
  }>>({});

  // References data for subdepartments 10 and 5
  const [taskReferences, setTaskReferences] = useState<Record<string, any[]>>({});

  // Helper function to extract dependant IDs from tasks
  const extractDependantIds = useCallback((tasks: any[]): number[] => {
    const dependantIds = new Set<number>();

    tasks.forEach(task => {
      if (task.dependant_member) {
        if (Array.isArray(task.dependant_member)) {
          task.dependant_member.forEach((dep: any) => {
            if (dep.id && typeof dep.id === 'number') {
              dependantIds.add(dep.id);
            }
          });
        } else if (typeof task.dependant_member === 'number') {
          dependantIds.add(task.dependant_member);
        }
      }
    });

    return Array.from(dependantIds);
  }, []);

  const fetchAllIndividualData = useCallback(async (tasks: any[]) => {
    const uniqueIds = new Set<number>();

    tasks.forEach(task => {
      if (task.principal_member && typeof task.principal_member === 'number') {
        uniqueIds.add(task.principal_member);
      }
      if (task.understudy_member && typeof task.understudy_member === 'number') {
        uniqueIds.add(task.understudy_member);
      }
      if (task.individual_id && typeof task.individual_id === 'number') {
        uniqueIds.add(task.individual_id);
      }

      if (task.dependant_member) {
        if (Array.isArray(task.dependant_member)) {
          task.dependant_member.forEach((dep: any) => {
            if (dep.id && typeof dep.id === 'number') {
              uniqueIds.add(dep.id);
            }
          });
        } else if (typeof task.dependant_member === 'number') {
          uniqueIds.add(task.dependant_member);
        }
      }
      if (task.references && Array.isArray(task.references)) {
        task.references.forEach((ref: any) => {
          if (ref.id && typeof ref.id === 'number') {
            uniqueIds.add(ref.id);
          }
        });
      }
    });

    console.log('uniqueIds:', Array.from(uniqueIds));

    const validIds = Array.from(uniqueIds).filter(id => id != null && typeof id === 'number');

    if (validIds.length === 0) return;

    try {
      const { data: individuals, error } = await supabase
        .from('registry_individuals')
        .select('id, full_name')
        .in('id', validIds);

      if (error) throw error;

      const namesMap = individuals?.reduce((acc, individual) => {
        acc[individual.id] = individual.full_name;
        return acc;
      }, {} as Record<number, string>);

      setIndividualNames(prevNames => {
        const updated = {
          ...prevNames,
          ...namesMap
        };
        return updated;
      });

    } catch (error) {
      console.error('Error fetching individual names:', error);
    }

    try {
      const { data: documents, error } = await supabase
        .from('acc_portal_directors_documents')
        .select(`
        *,
        acc_portal_kyc (
          id,
          name,
          display_name
        )
      `)
        .in('director_id', validIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (documents?.length > 0) {
        const documentsByDirector = documents.reduce((acc, doc) => {
          const directorId = doc.director_id;
          if (!acc[directorId]) {
            acc[directorId] = [];
          }
          acc[directorId].push(doc);
          return acc;
        }, {} as Record<string, any[]>);

        setAllIndividualDocuments(documentsByDirector);
      } else {
        setAllIndividualDocuments({});
      }
    } catch (error) {
      console.error('Error fetching all individual documents:', error);
      setAllIndividualDocuments({});
    }
  }, []);

  const fetchCompanyData = useCallback(async (tasks: any[]) => {
    const companyIds = [...new Set(tasks.map(t => t.company_id).filter(Boolean))];
    if (companyIds.length === 0) return;

    try {
      const { data: companies, error } = await supabase
        .from('acc_portal_company_duplicate')
        .select('id, company_name, company_type, registration_number')
        .in('id', companyIds);

      if (error) throw error;

      const companiesMap = companies?.reduce((acc, company) => {
        acc[company.id] = company;
        return acc;
      }, {} as Record<number, any>);

      setCompanyData(companiesMap || {});
    } catch (error) {
      console.error('Error fetching company data:', error);
    }
  }, []);

  // Fetch references for subdepartments 10 and 5 tasks
  const fetchTaskReferences = useCallback(async (tasks: any[]) => {
    const referenceTasks = tasks.filter(task => {
      const subdepartmentId = task.subdepartment?.id || task.subdepartment_id;
      return REFERENCE_SUBDEPARTMENT_IDS.includes(subdepartmentId) ||
        REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.parent_id);
    });

    if (referenceTasks.length === 0) return;

    try {
      const referencesByTask = referenceTasks.reduce((acc, task) => {
        if (!task.references || !Array.isArray(task.references)) return acc;

        if (!acc[task.id]) {
          acc[task.id] = [];
        }
        acc[task.id] = task.references;
        return acc;
      }, {} as Record<string, any[]>);

      setTaskReferences(referencesByTask);
    } catch (error) {
      console.error('Error processing task references:', error);
    }
  }, []);

  // Filter tasks based on active tab
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (activeTab === "completed") {
        return task.status === "completed" || task.status === "approved";
      } else {
        return task.status !== "completed" && task.status !== "approved";
      }
    });
  }, [tasks, activeTab]);

  // Check if any task requires references column (subdepartment_id 10, 5 or their children)
  const hasReferencesColumn = useMemo(() => {
    return filteredTasks.some(task => {
      const subdepartmentId = task.subdepartment?.id || task.subdepartment_id;
      return REFERENCE_SUBDEPARTMENT_IDS.includes(subdepartmentId) ||
        REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.parent_id);
    });
  }, [filteredTasks]);

  useEffect(() => {
    const fetchPrincipalData = async () => {
      const dependantTasks = filteredTasks.filter(task => task.applicant_type === 'dependant' && task.principal_member);

      if (dependantTasks.length === 0) return;

      const principalIds = [...new Set(dependantTasks.map(task => task.principal_member).filter(Boolean))];

      try {
        const { data: principals, error } = await supabase
          .from('registry_individuals')
          .select('id, full_name')
          .in('id', principalIds);

        if (error) throw error;

        const principalDataMap = dependantTasks.reduce((acc, task) => {
          const principal = principals?.find(p => p.id === task.principal_member);
          if (principal) {
            acc[task.id] = {
              full_name: principal.full_name,
              individual_id: principal.individual_id || principal.id
            };
          }
          return acc;
        }, {} as Record<string, any>);

        setPrincipalMemberData(principalDataMap);
      } catch (error) {
        console.error('Error fetching principal member data:', error);
      }
    };

    fetchPrincipalData();
  }, [filteredTasks]);

  // Fetch all company documents for the current user
  const fetchAllCompanyDocuments = useCallback(async (tasks: any[]) => {
    const companyIds = [...new Set(tasks.map(t => t.company_id).filter(Boolean))];
    if (companyIds.length === 0) return;

    try {
      const { data: documents, error } = await supabase
        .from('acc_portal_kyc_uploads')
        .select(`
          *,
          acc_portal_kyc (
            id,
            name,
            display_name
          )
        `)
        .in('company_id', companyIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const documentsByCompany = documents?.reduce((acc, doc) => {
        const companyId = doc.company_id;
        if (!acc[companyId]) {
          acc[companyId] = [];
        }
        acc[companyId].push(doc);
        return acc;
      }, {} as Record<string, any[]>);

      setAllCompanyDocuments(documentsByCompany || {});
    } catch (error) {
      console.error('Error fetching all company documents:', error);
    }
  }, []);

  // Get individual documents from cached data
  const getIndividualDocuments = useCallback((task: any, documentId: string) => {
    const cleanDocumentId = documentId.split('-').slice(0, 5).join('-');
    let searchId = task.individual_id;

    if (task.applicant_type === 'dependant') {
      const principalData = principalMemberData[task.id];
      if (principalData) {
        searchId = principalData.individual_id;
      }
    }

    const documents = allIndividualDocuments[searchId] || [];
    const document = documents.find(doc => doc.id === cleanDocumentId);

    return document;
  }, [allIndividualDocuments, principalMemberData]);

  // Get client form fields based on document tab
  const clientFormFields = useMemo(() => {
    return getTableFields(documentTab);
  }, [documentTab]);

  // Updated groupedTasks to include dependant applicant in their own dependant list
const groupedTasks = useMemo(() => {
  const groups = new Map<string, any[]>();

  filteredTasks.forEach(task => {
    let applicantName = task.applicant_name || task.company_name || 'Unknown Applicant';

    if (task.applicant_type === 'dependant') {
      const principalData = principalMemberData[task.id];
      if (principalData) {
        applicantName = `${applicantName} (${principalData.full_name})`;
      }
    }

    if (!groups.has(applicantName)) {
      groups.set(applicantName, []);
    }
    groups.get(applicantName)!.push(task);
  });

  return Array.from(groups.entries()).map(([name, tasks]) => {
    const allDependantIds = new Set<number>();
    const allReferenceIds = new Set<number>();
    
    tasks.forEach(task => {
      // Include the main applicant if they are a dependant
      if (task.applicant_type === 'dependant' && task.individual_id) {
        allDependantIds.add(task.individual_id);
      }
      
      // Include other dependants from dependant_member array
      if (task.dependant_member && Array.isArray(task.dependant_member)) {
        task.dependant_member.forEach((dep: any) => {
          if (dep.id && typeof dep.id === 'number') {
            allDependantIds.add(dep.id);
          }
        });
      }
      
      if (task.references && Array.isArray(task.references)) {
        task.references.forEach((ref: any) => {
          if (ref.id && typeof ref.id === 'number') {
            allReferenceIds.add(ref.id);
          }
        });
      }
    });

    return {
      applicantName: name,
      tasks: tasks,
      dependantIds: Array.from(allDependantIds),
      referenceIds: Array.from(allReferenceIds)
    };
  });
}, [filteredTasks, principalMemberData]);

  // Filter tasks based on selected applicant
  const filteredGroupedTasks = useMemo(() => {
    if (!selectedApplicant) return groupedTasks;
    return groupedTasks.filter(group => group.applicantName === selectedApplicant);
  }, [groupedTasks, selectedApplicant]);

  // Set initial selected applicant if none is selected
  useEffect(() => {
    if (groupedTasks.length > 0 && !selectedApplicant) {
      setSelectedApplicant(groupedTasks[0]?.applicantName || null);
    }
  }, [groupedTasks, selectedApplicant]);

  const handleSelectApplicant = (applicantName: string) => {
    setSelectedApplicant(applicantName);
  };

  const handleBackToAll = () => {
    setSelectedApplicant(null);
  };

  // Update individual names when tasks change
  useEffect(() => {
    if (!tasks?.length) {
      return;
    }
    fetchAllIndividualData(tasks);
    fetchCompanyData(tasks);
    fetchTaskReferences(tasks); // Fetch references for subdepartments 10 and 5

  }, [tasks, fetchAllIndividualData, fetchTaskReferences, fetchCompanyData]);

  // Toggle document field expansion
  const toggleDocumentExpansion = useCallback((documentId: string) => {
    setExpandedDocuments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(documentId)) {
        newSet.delete(documentId);
      } else {
        newSet.add(documentId);
      }
      return newSet;
    });
  }, []);

  // Helper function to extract document ID and field ID from selection ID
  const parseSelectionId = useCallback((selectionId: string) => {
    const cleanId = selectionId.replace(/_\d+_\d+$/, '');
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

    if (isUUID) {
      return {
        type: 'document',
        documentId: cleanId,
        fieldId: null
      };
    } else if (cleanId.includes('-')) {
      const parts = cleanId.split('-');
      return {
        type: 'field',
        documentId: parts[0],
        fieldId: parts.slice(1).join('-')
      };
    }

    return {
      type: 'unknown',
      documentId: cleanId,
      fieldId: null
    };
  }, []);

  const getCompanyDocuments = useCallback((task: any, documentId: string) => {
    if (!task.company_id || !allCompanyDocuments[task.company_id]) return [];

    const cleanDocumentId = documentId.split('-').slice(0, 5).join('-');
    return allCompanyDocuments[task.company_id].filter(doc =>
      doc.kyc_document_id === cleanDocumentId
    );
  }, [allCompanyDocuments]);

  // Load all documents when tasks change
  useEffect(() => {
    if (filteredTasks.length === 0) return;

    let isMounted = true;

    const loadDocuments = async () => {
      setDocumentsLoaded(false);
      try {
        await Promise.all([
          fetchAllIndividualData(filteredTasks),
          fetchAllCompanyDocuments(filteredTasks)
        ]);
      } catch (error) {
        console.error('Error loading documents:', error);
      } finally {
        if (isMounted) {
          setDocumentsLoaded(true);
        }
      }
    };

    loadDocuments();

    return () => {
      isMounted = false;
    };
  }, [filteredTasks, fetchAllIndividualData, fetchAllCompanyDocuments]);

  // Check if a task has a specific document/field item
  const taskHasItem = useCallback((taskId: string, itemId: string) => {
    const classRequirements = taskClassRequirements[taskId];
    if (!classRequirements) return false;

    return classRequirements.documents_and_fields?.some((item: any) => item.id === itemId) || false;
  }, [taskClassRequirements]);

  // Updated: Function to get document applicability for specific applicant type
  const getDocumentApplicability = useCallback((item: any, applicantType: ApplicantType) => {
    if (!item) return false;

    if (item.display === false) return false;

    switch (applicantType) {
      case 'principal':
        return item.ap === true || item.display === true;
      case 'dependant':
        return item.dp === true;
      case 'understudy':
        return item.understudy === true;
      default:
        return false;
    }
  }, []);

  const fetchDocumentsFromDatabase = useCallback(async (individualId: number, documentId: string, columnType: string) => {
    const cacheKey = `${individualId}-${documentId}-${columnType}`

    if (fetchingDocuments.has(cacheKey)) {
      return []
    }

    try {
      setFetchingDocuments(prev => new Set([...prev, cacheKey]))

      const { data: documents, error } = await supabase
        .from('acc_portal_directors_documents')
        .select(`
          *,
          acc_portal_kyc (
            id,
            name,
            display_name
          )
        `)
        .eq('director_id', individualId)
        .eq('document_id', documentId)
        .eq('applicant_type', columnType)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching documents:', error)
        return []
      }

      return documents || []
    } catch (error) {
      console.error('Error in fetchDocumentsFromDatabase:', error)
      return []
    } finally {
      setFetchingDocuments(prev => {
        const newSet = new Set(prev)
        newSet.delete(cacheKey)
        return newSet
      })
    }
  }, [fetchingDocuments])

  const getDocumentStatusForColumn = useCallback((task: any, item: any, columnType: 'principal' | 'dependant' | 'understudy' | 'reference', dependantId?: number, referenceId?: number): DocumentStatus => {
    const itemId = item.selectionId || item.id;
    const statusKey = dependantId ? `${task.id}-${itemId}-${columnType}-${dependantId}` :
      referenceId ? `${task.id}-${itemId}-${columnType}-${referenceId}` :
        `${task.id}-${itemId}-${columnType}`;

    const isApplicableForColumn =
      (columnType === 'principal' && (item.ap === true || item.display === true)) ||
      (columnType === 'dependant' && (item.dp === true || item.display === true)) ||
      (columnType === 'understudy' && (item.understudy === true || item.display === true)) ||
      (columnType === 'reference' && (item.reference === true || item.display === true));

    if (!isApplicableForColumn) {
      return {
        type: 'na',
        documents: [],
        count: 0,
        applicantTypes: {
          principal: item.ap === true || item.display === true,
          dependant: item.dp === true || item.display === true,
          understudy: item.understudy === true || item.display === true,
          reference: item.reference === true || item.display === true
        }
      };
    }

    // Check if this is a company document by looking at the actual document definition
    let isCompanyDocument = false;
    const parsedId = parseSelectionId(itemId);

    let documents: any[] = [];
    if (parsedId.type === 'document') {
      const documentDef = documents.find(doc => doc.id === parsedId.documentId) ||
        bclTemplateDocuments.find(doc => doc.id === parsedId.documentId);
      isCompanyDocument = documentDef?.category === 'company-docs';
    }

    if (isCompanyDocument) {
      // Handle company documents
      if (task.company_id && allCompanyDocuments[task.company_id]) {
        const baseItemId = itemId.split('_')[0];
        documents = allCompanyDocuments[task.company_id].filter(doc => {
          const kycDocId = doc.kyc_document_id;
          return kycDocId === baseItemId ||
            kycDocId === itemId ||
            kycDocId === item.id ||
            kycDocId === parsedId.documentId;
        });
      }
    } else {
      // Handle individual documents
      let individualId: number | null = null;

      if (columnType === 'principal') {
        individualId = task.principal_member || task.individual_id;
      } else if (columnType === 'dependant') {
        individualId = dependantId || task.dependant_member || task.individual_id;
      } else if (columnType === 'understudy') {
        individualId = task.understudy_member || task.individual_id;
      } else if (columnType === 'reference') {
        individualId = referenceId || task.individual_id;
      }

      if (individualId && allIndividualDocuments[individualId]) {
        const baseItemId = itemId.split('_')[0];
        documents = allIndividualDocuments[individualId].filter(doc => {
          const docId = doc.document_id || '';
          const kycId = (doc.acc_portal_kyc?.id || '');
          return docId === baseItemId ||
            docId === itemId ||
            kycId === baseItemId ||
            kycId === itemId ||
            docId === item.id ||
            kycId === item.id;
        });
      }
    }

    const cachedStatus = documentStatusesMap[statusKey];
    if (cachedStatus && !cachedStatus.loading) {
      return cachedStatus.status;
    }

    return {
      type: documents.length > 0 ? 'view' : 'upload',
      documents: documents,
      count: documents.length,
      applicantTypes: {
        principal: item.ap === true || item.display === true,
        dependant: item.dp === true || item.display === true,
        understudy: item.understudy === true || item.display === true,
        reference: item.reference === true || item.display === true
      }
    };
  }, [documentStatusesMap, allIndividualDocuments, allCompanyDocuments, documents, bclTemplateDocuments, parseSelectionId]);

  // Calculate statistics
  const calculateStats = useMemo(() => {
    const stats = {
      uploaded: 0,
      missing: 0,
      na: 0,
      total: 0
    };

    Object.values(documentStatuses).forEach(status => {
      stats.total++;
      switch (status.type) {
        case 'view':
          stats.uploaded++;
          break;
        case 'upload':
        case 'missing':
          stats.missing++;
          break;
        case 'na':
          stats.na++;
          break;
      }
    });

    return stats;
  }, [documentStatuses]);

  // Clear document statuses
  const clearDocumentStatuses = useCallback(() => {
    setDocumentStatuses(prevStatuses => {
      if (Object.keys(prevStatuses).length > 0) {
        return {};
      }
      return prevStatuses;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (!isMounted || !filteredTasks.length) return;

      clearDocumentStatuses();
      setDocumentsLoading(true);
      setDocuments([]);
      setBclTemplateDocuments([]);
      setStageDocuments([]);

      try {
        const documentsResponse = await supabase
          .from('acc_portal_kyc')
          .select('*')
          .order('main_category_number', { ascending: true, nullsLast: true })
          .order('custom_order', { ascending: true, nullsLast: true });

        const bclTemplatesResponse = await supabase
          .from('acc_portal_kyc')
          .select('*')
          .eq('has_template', true)
          .order('main_category_number', { ascending: true, nullsLast: true })
          .order('custom_order', { ascending: true, nullsLast: true });

        if (!isMounted) return;

        if (documentsResponse.error) {
          console.error('Error fetching documents:', documentsResponse.error);
          throw documentsResponse.error;
        }

        if (bclTemplatesResponse.error) {
          console.error('Error fetching BCL templates:', bclTemplatesResponse.error);
          throw bclTemplatesResponse.error;
        }

        const processedDocuments = (documentsResponse.data || []).map(doc => ({
          ...doc,
          id: doc.id,
          fields: Array.isArray(doc.fields) ? doc.fields : [],
          display_name: doc.display_name || doc.name
        }));

        const processedBclTemplates = (bclTemplatesResponse.data || []).map(doc => ({
          ...doc,
          id: doc.id,
          fields: Array.isArray(doc.fields) ? doc.fields : [],
          display_name: doc.display_name || doc.name
        }));

        setDocuments(processedDocuments);
        setBclTemplateDocuments(processedBclTemplates);

        const allStageDocuments = new Map<string, any>();

        filteredTasks.forEach(task => {
          if (task.department?.stages) {
            task.department.stages.forEach((stage: any) => {
              if (stage.documents && Array.isArray(stage.documents)) {
                stage.documents.forEach((stageDoc: any) => {
                  if (stageDoc.kycId) {
                    const kycDoc = processedDocuments.find(doc => doc.id === stageDoc.kycId) ||
                      processedBclTemplates.find(doc => doc.id === stageDoc.kycId);

                    if (kycDoc && !allStageDocuments.has(stageDoc.kycId)) {
                      allStageDocuments.set(stageDoc.kycId, {
                        ...kycDoc,
                        stageName: stage.name,
                        stageId: stage.id,
                        stageOrder: stage.order_num || 0,
                        stageDocumentConfig: stageDoc,
                        ap: true,
                        dp: stageDoc.dp !== undefined ? stageDoc.dp : true,
                        understudy: stageDoc.understudy !== undefined ? stageDoc.understudy : true,
                        display: true
                      });
                    }
                  }
                });
              }
            });
          }
        });

        setStageDocuments(Array.from(allStageDocuments.values()));

        const taskDataPromises = filteredTasks.map(async (task) => {
          let constructedClassId = null;
          if (task.subclass_id && task.class_id) {
            constructedClassId = task.subclass_id;
          } else if (task.class_id) {
            const subdepartmentId = task.subdepartment?.id || task.subdepartment_id;
            if (subdepartmentId) {
              constructedClassId = `${subdepartmentId}_${task.class_id}`;
            } else {
              constructedClassId = task.class_id;
            }
          }

          let classRequirements = null;
          let documentsAndFieldsCount = 0;
          let clientFieldsCount = 0;

          if (constructedClassId) {
            const requirementsResponse = await supabase
              .from('tm_class_requirements')
              .select('*')
              .eq('class_id', constructedClassId)
              .maybeSingle();

            if (!requirementsResponse.error && requirementsResponse.data) {
              classRequirements = requirementsResponse.data;

              if (classRequirements.documents_and_fields && Array.isArray(classRequirements.documents_and_fields)) {
                const applicableDocuments = classRequirements.documents_and_fields.filter((item: any) => {
                  return item.ap === true || item.dp === true || item.understudy === true || item.display === true;
                });
                classRequirements.documents_and_fields = applicableDocuments;
                documentsAndFieldsCount = applicableDocuments.length;
              }

              if (classRequirements.client_fields && Array.isArray(classRequirements.client_fields)) {
                const applicableClientFields = classRequirements.client_fields.filter((item: any) => {
                  return item.ap === true || item.dp === true || item.understudy === true || item.display === true;
                });
                classRequirements.client_fields = applicableClientFields;
                clientFieldsCount = applicableClientFields.length;
              }
            }
          }

          let individualData = null;
          if (task.individual_id) {
            const individualResponse = await supabase
              .from('registry_individuals')
              .select('*')
              .eq('id', task.individual_id)
              .single();

            if (!individualResponse.error && individualResponse.data) {
              individualData = individualResponse.data;
            }
          }

          return {
            taskId: task.id,
            classRequirements: classRequirements,
            individualData: individualData,
            counts: {
              documentsAndFieldsCount,
              clientFieldsCount
            }
          };
        });

        const results = await Promise.all(taskDataPromises);

        const requirementsMap: Record<string, any> = {};
        const individualDataMap: Record<string, any> = {};
        const countsMap: Record<string, any> = {};

        results.forEach(result => {
          if (result.classRequirements) {
            requirementsMap[result.taskId] = result.classRequirements;
          }
          if (result.individualData) {
            individualDataMap[result.taskId] = result.individualData;
          }
          if (result.counts) {
            countsMap[result.taskId] = result.counts;
          }
        });

        setTaskClassRequirements(requirementsMap);
        setTaskIndividualData(individualDataMap);
        setTaskCounts(countsMap);

      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        if (isMounted) {
          setDocumentsLoading(false);
        }
      }
    };

    if (filteredTasks.length > 0) {
      fetchData();
    } else {
      setDocumentsLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [documentTab, filteredTasks, clearDocumentStatuses]);

  // Helper function to get document name by ID
  const getDocumentName = useCallback((docId: string) => {
    if (!docId) return 'Unknown Document';
    const doc = documents.find(d => d.id === docId) || bclTemplateDocuments.find(d => d.id === docId);
    return doc?.display_name || doc?.name || `Document (${docId.substring(0, 8)}...)`;
  }, [documents, bclTemplateDocuments]);

  // Handle upload action
  const handleUploadAction = useCallback((task: any, item: any, columnType: 'principal' | 'dependant' | 'understudy' | 'reference', applicantId?: number) => {
    const itemId = item.selectionId || item.id;
    const statusKey = applicantId ? `${task.id}-${itemId}-${columnType}-${applicantId}` : `${task.id}-${itemId}-${columnType}`;

    const newStatuses = { ...documentStatuses };
    Object.keys(newStatuses).forEach(key => {
      if (key.startsWith(`${task.id}-${itemId}-`)) {
        delete newStatuses[key];
      }
    });
    setDocumentStatuses(newStatuses);

    setSelectedUploadData({
      task,
      document: item,
      columnType,
      applicantId
    });
    setUploadDialogOpen(true);
  }, [documentStatuses]);

  // Handle view action
  const handleViewAction = useCallback(async (task: any, item: any, dependantId?: number) => {
    const itemId = item.selectionId || item.id;
    const statusKey = dependantId
      ? Object.keys(documentStatuses).find(key => key.startsWith(`${task.id}-${itemId}-`) && key.endsWith(`-${dependantId}`))
      : Object.keys(documentStatuses).find(key => key.startsWith(`${task.id}-${itemId}-`) && !key.includes(`-${dependantId}`));

    const status = statusKey ? documentStatuses[statusKey] : null;

    if (status && status.documents.length > 0) {
      const matchingDocs = status.documents.filter(doc => {
        const extractedDetails = doc.extracted_details || {};
        const hasMatchingDetails = Object.keys(extractedDetails).length > 0;
        return hasMatchingDetails;
      });

      if (matchingDocs.length > 0) {
        if (onViewDocument) {
          onViewDocument(task, { ...item, documents: matchingDocs });
        } else {
          const firstDoc = matchingDocs[0];
          if (firstDoc.file_path) {
            try {
              const { data: fileUrl, error } = await supabase.storage
                .from(documentTab === 'company' ? 'kyc-documents' : 'kyc-documents')
                .createSignedUrl(firstDoc.file_path, 3600);

              if (error) throw error;

              if (fileUrl?.signedUrl) {
                window.open(fileUrl.signedUrl, '_blank');
              }
            } catch (error) {
              console.error('Error viewing document:', error);
              toast({
                title: "Error",
                description: "Failed to open document",
                variant: "destructive"
              });
            }
          }
        }
      } else {
        toast({
          title: "No Matching Documents",
          description: "No documents with matching extracted details found",
          variant: "default"
        });
      }
    }
  }, [documentStatuses, onViewDocument, documentTab]);

  useEffect(() => {
    const updateDocumentStatuses = async () => {
      const updates: Record<string, {
        status: DocumentStatus;
        loading: boolean;
      }> = {};

      for (const task of filteredTasks) {
        const classRequirements = taskClassRequirements[task.id];
        if (!classRequirements?.documents_and_fields) continue;

        for (const item of classRequirements.documents_and_fields) {
          const itemId = item.selectionId || item.id;
          const baseItemId = itemId.split('_')[0];

          // Check if this is a company document by looking at the actual document definition
          let isCompanyDocument = false;
          const parsedId = parseSelectionId(itemId);
          if (parsedId.type === 'document') {
            const documentDef = documents.find(doc => doc.id === parsedId.documentId) ||
              bclTemplateDocuments.find(doc => doc.id === parsedId.documentId);
            isCompanyDocument = documentDef?.category === 'company-docs';
          }
          if (item.ap || item.dp || item.understudy || item.display || item.reference) {
            const columnTypes: ('principal' | 'dependant' | 'understudy' | 'reference')[] = [];
            if (item.ap || item.display) columnTypes.push('principal');
            if (item.dp || item.display) columnTypes.push('dependant');
            if (item.understudy || item.display) columnTypes.push('understudy');
            if (item.reference || item.display) columnTypes.push('reference');

            for (const columnType of columnTypes) {
              if (isCompanyDocument) {
                // Handle company documents - single status per task/item/column
                const key = `${task.id}-${itemId}-${columnType}`;

                let documents: any[] = [];
                if (task.company_id && allCompanyDocuments[task.company_id]) {
                  documents = allCompanyDocuments[task.company_id].filter(doc => {
                    const kycDocId = doc.kyc_document_id;

                    // More flexible matching for company documents
                    const matches = kycDocId === baseItemId ||
                      kycDocId === itemId ||
                      kycDocId === item.id ||
                      kycDocId === parsedId.documentId;


                    return matches;
                  });
                }

                const currentStatus = documentStatusesMap[key];
                const documentCount = documents.length;
                const currentCount = currentStatus?.status.count || 0;

                if (!currentStatus || documentCount !== currentCount) {
                  updates[key] = {
                    status: {
                      type: documentCount > 0 ? 'view' : 'upload',
                      documents: documents,
                      count: documentCount,
                      applicantTypes: {
                        principal: item.ap || item.display || false,
                        dependant: item.dp || item.display || false,
                        understudy: item.understudy || item.display || false,
                        reference: item.reference || item.display || false
                      }
                    },
                    loading: false
                  };
                }
              } else {
                // Handle individual documents (existing logic)
                if (columnType === 'dependant' && task.dependant_member && Array.isArray(task.dependant_member)) {
                  for (const dependant of task.dependant_member) {
                    const key = `${task.id}-${itemId}-${columnType}-${dependant.id}`;

                    let documents: any[] = [];
                    if (dependant.id && allIndividualDocuments[dependant.id]) {
                      documents = allIndividualDocuments[dependant.id].filter(doc => {
                        const docId = doc.document_id || '';
                        const kycId = (doc.acc_portal_kyc?.id || '');
                        return docId === baseItemId ||
                          docId === itemId ||
                          kycId === baseItemId ||
                          kycId === itemId;
                      });
                    }

                    const currentStatus = documentStatusesMap[key];
                    const documentCount = documents.length;
                    const currentCount = currentStatus?.status.count || 0;

                    if (!currentStatus || documentCount !== currentCount) {
                      updates[key] = {
                        status: {
                          type: documentCount > 0 ? 'view' : 'upload',
                          documents: documents,
                          count: documentCount,
                          applicantTypes: {
                            principal: item.ap || item.display || false,
                            dependant: item.dp || item.display || false,
                            understudy: item.understudy || item.display || false,
                            reference: item.reference || item.display || false
                          }
                        },
                        loading: false
                      };
                    }
                  }
                } else if (columnType === 'reference' && task.references && Array.isArray(task.references)) {
                  for (const reference of task.references) {
                    const key = `${task.id}-${itemId}-${columnType}-${reference.id}`;

                    let documents: any[] = [];
                    if (reference.id && allIndividualDocuments[reference.id]) {
                      documents = allIndividualDocuments[reference.id].filter(doc => {
                        const docId = doc.document_id || '';
                        const kycId = (doc.acc_portal_kyc?.id || '');
                        return docId === baseItemId ||
                          docId === itemId ||
                          kycId === baseItemId ||
                          kycId === itemId;
                      });
                    }

                    const currentStatus = documentStatusesMap[key];
                    const documentCount = documents.length;
                    const currentCount = currentStatus?.status.count || 0;

                    if (!currentStatus || documentCount !== currentCount) {
                      updates[key] = {
                        status: {
                          type: documentCount > 0 ? 'view' : 'upload',
                          documents: documents,
                          count: documentCount,
                          applicantTypes: {
                            principal: item.ap || item.display || false,
                            dependant: item.dp || item.display || false,
                            understudy: item.understudy || item.display || false,
                            reference: item.reference || item.display || false
                          }
                        },
                        loading: false
                      };
                    }
                  }
                } else {
                  // Handle principal, understudy (single individual)
                  const key = `${task.id}-${itemId}-${columnType}`;

                  let individualId: number | null = null;
                  if (columnType === 'principal') {
                    individualId = task.principal_member || task.individual_id;
                  } else if (columnType === 'understudy') {
                    individualId = task.understudy_member || task.individual_id;
                  }

                  let documents: any[] = [];
                  if (individualId && allIndividualDocuments[individualId]) {
                    documents = allIndividualDocuments[individualId].filter(doc => {
                      const docId = doc.document_id || '';
                      const kycId = (doc.acc_portal_kyc?.id || '');
                      return docId === baseItemId ||
                        docId === itemId ||
                        kycId === baseItemId ||
                        kycId === itemId;
                    });
                  }

                  const currentStatus = documentStatusesMap[key];
                  const documentCount = documents.length;
                  const currentCount = currentStatus?.status.count || 0;

                  if (!currentStatus || documentCount !== currentCount) {
                    updates[key] = {
                      status: {
                        type: documentCount > 0 ? 'view' : 'upload',
                        documents: documents,
                        count: documentCount,
                        applicantTypes: {
                          principal: item.ap || item.display || false,
                          dependant: item.dp || item.display || false,
                          understudy: item.understudy || item.display || false,
                          reference: item.reference || item.display || false
                        }
                      },
                      loading: false
                    };
                  }
                }
              }
            }
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        setDocumentStatusesMap(prev => ({
          ...prev,
          ...updates
        }));
      }
    };

    updateDocumentStatuses();
  }, [filteredTasks, taskClassRequirements, allIndividualDocuments, allCompanyDocuments, documentStatusesMap, documents, bclTemplateDocuments, parseSelectionId]);
  // Updated render function to restrict post application icons to matching applicant types
  const renderDocumentStatus = useCallback((task: any, item: any, columnType: 'principal' | 'dependant' | 'understudy' | 'reference', applicantId?: number, referenceId?: number, isPostApplication?: boolean) => {
    // For post application documents, restrict to matching applicant types only
    if (isPostApplication) {
      // Check if this task's applicant_type matches the column type
      const taskApplicantType = task.applicant_type;

      if (columnType === 'principal' && taskApplicantType !== 'principal') {
        return (
          <div className="flex items-center justify-center h-full">
            <span className="text-gray-400 text-xs">N/A</span>
          </div>
        );
      }

      if (columnType === 'dependant') {
        if (taskApplicantType !== 'dependant') {
          return (
            <div className="flex items-center justify-center h-full">
              <span className="text-gray-400 text-xs">N/A</span>
            </div>
          );
        }
        // For dependants, also check if this specific dependant ID matches
        if (task.dependant_member && Array.isArray(task.dependant_member)) {
          const hasMatchingDependant = task.dependant_member.some((dep: any) => dep.id === referenceId);
          if (!hasMatchingDependant) {
            return (
              <div className="flex items-center justify-center h-full">
                <span className="text-gray-400 text-xs">N/A</span>
              </div>
            );
          }
        }
      }

      if (columnType === 'understudy' && taskApplicantType !== 'understudy') {
        return (
          <div className="flex items-center justify-center h-full">
            <span className="text-gray-400 text-xs">N/A</span>
          </div>
        );
      }

      if (columnType === 'reference') {
        if (!task.references || !Array.isArray(task.references)) {
          return (
            <div className="flex items-center justify-center h-full">
              <span className="text-gray-400 text-xs">N/A</span>
            </div>
          );
        }
        // For references, check if this specific reference ID matches
        if (referenceId) {
          const hasMatchingReference = task.references.some((ref: any) => ref.id === referenceId);
          if (!hasMatchingReference) {
            return (
              <div className="flex items-center justify-center h-full">
                <span className="text-gray-400 text-xs">N/A</span>
              </div>
            );
          }
        }
      }
    }

    const status = getDocumentStatusForColumn(task, item, columnType, applicantId || referenceId);
    const itemId = item.selectionId || item.id;
    const key = applicantId ? `${task.id}-${itemId}-${columnType}-${applicantId}` : `${task.id}-${itemId}-${columnType}`;
    const isLoading = documentStatusesMap[key]?.loading || false;

    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )
    }

    if (status.type === 'na') {
      return (
        <div className="flex items-center justify-center h-full">
          <span className="text-gray-400 text-xs">N/A</span>
        </div>
      )
    }

    const handleUploadClick = () => {
      setSelectedUploadData({
        task,
        document: item,
        columnType
      });
      setUploadDialogOpen(true);
    };

    const handleViewClick = async () => {
      if (status.documents.length > 0) {
        const document = status.documents[0];

        try {
          const { data: signedUrl, error } = await supabase.storage
            .from('kyc-documents')
            .createSignedUrl(document.file_path, 3600);

          if (error) throw error;

          // Check if this is a company document or individual document
          const isCompanyDoc = item.category === 'company-docs' || item.category === 'company';

          let documentDefinition;
          if (isCompanyDoc) {
            documentDefinition = documents.find(doc => doc.id === document.kyc_document_id) ||
              bclTemplateDocuments.find(doc => doc.id === document.kyc_document_id);
          } else {
            documentDefinition = documents.find(doc => doc.id === document.document_id) ||
              bclTemplateDocuments.find(doc => doc.id === document.document_id);
          }

          const extractionFields = (documentDefinition?.fields || []).map((field: any) => ({
            id: field.id,
            name: field.name,
            type: field.type || 'text',
            required: field.required || false
          }));

          setSelectedDocumentForPreview({
            documentName: documentDefinition?.display_name || documentDefinition?.name || document.acc_portal_kyc?.display_name || 'Document',
            extractedData: document.extracted_details || {},
            fields: extractionFields,
            fileUrl: signedUrl.signedUrl,
            fileName: document.file_path?.split('/').pop() || '',
            allDocuments: status.documents,
            currentIndex: 0,
            task,
            item,
            columnType,
            referenceId,
            uploadDate: document.created_at,
            documentStatus: document.status
          })
          setDocumentPreviewOpen(true)
        } catch (error) {
          console.error('Error getting file URL:', error)
          toast({
            title: 'Error',
            description: 'Failed to load document preview',
            variant: 'destructive'
          })
        }
      }
    }

    switch (status.type) {
      case 'view':
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="flex items-center justify-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-green-600 hover:bg-green-100 hover:text-green-700 transition-colors"
                onClick={handleViewClick}
                title={`View ${status.count} ${status.count > 1 ? 'documents' : 'document'}`}
              >
                <Eye className="h-4 w-4" />
              </Button>
              {status.count > 1 && (
                <Badge
                  variant="outline"
                  className="h-5 w-5 p-0 flex items-center justify-center text-xs font-semibold bg-green-50 text-green-700 border-green-200"
                >
                  {status.count}
                </Badge>
              )}
            </div>
            <span className="text-[10px] text-green-600 font-medium mt-0.5">Uploaded</span>
          </div>
        )

      case 'upload':
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50 hover:text-amber-700 transition-colors"
              onClick={() => {
                handleUploadAction(task, item, columnType, applicantId || referenceId);
              }}
              title={`Upload ${item.display_name || item.name} for ${columnType}${(columnType === 'reference' || columnType === 'dependant') && applicantId && individualNames[applicantId] ? ` (${individualNames[applicantId]})` : ''}`}
            >
              <Upload className="h-4 w-4" />
            </Button>
            <span className="text-[10px] text-amber-600 font-medium mt-0.5">Upload</span>
          </div>
        )

      default:
        return (
          <div className="flex items-center justify-center h-full">
            <span className="text-gray-400 text-xs">-</span>
          </div>
        )
    }
  }, [getDocumentStatusForColumn, documentStatusesMap, documents, bclTemplateDocuments, individualNames, handleUploadAction])

  const handleUploadComplete = useCallback(() => {
    setDocumentStatusesMap(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => {
        updated[key] = {
          ...updated[key],
          loading: true
        };
      });
      return updated;
    });

    // Clear both individual and company documents
    setAllIndividualDocuments({});
    setAllCompanyDocuments({});

    if (filteredTasks.length > 0) {
      fetchAllIndividualData(filteredTasks);
      fetchAllCompanyDocuments(filteredTasks); // Add this line
    }
  }, [filteredTasks, fetchAllIndividualData, fetchAllCompanyDocuments]);
  // Render client field data
  const renderClientFieldData = useCallback((task: any, item: any) => {
    const individualData = taskIndividualData[task.id];
    if (!individualData) {
      return (
        <div className="text-center">
          <span className="text-red-500 text-xs font-medium">No Registry Data</span>
        </div>
      );
    }

    const fieldValue = individualData[item.field.name];

    if (!fieldValue && fieldValue !== 0) {
      return (
        <div className="text-center">
          <span className="text-red-500 text-xs font-medium">Missing</span>
        </div>
      );
    }

    return (
      <div className="text-center">
        <span className="text-blue-600 text-xs font-medium truncate max-w-[100px] inline-block">
          {String(fieldValue)}
        </span>
      </div>
    );
  }, [taskIndividualData]);

  // Updated render references data function to handle per applicant type
  const renderReferencesData = useCallback((task: any, columnType: 'principal' | 'dependant' | 'understudy', applicantId?: number) => {
    // Check if this task is applicable for references
    const subdepartmentId = task.subdepartment?.id || task.subdepartment_id;
    const isReferenceApplicable = REFERENCE_SUBDEPARTMENT_IDS.includes(subdepartmentId) ||
      REFERENCE_SUBDEPARTMENT_IDS.includes(task.subdepartment?.parent_id);

    if (!isReferenceApplicable) {
      return (
        <div className="text-center p-2">
          <span className="text-gray-400 text-xs">N/A</span>
        </div>
      );
    }

    // For references, check if this matches the task's applicant type
    const taskApplicantType = task.applicant_type;

    if (columnType === 'principal' && taskApplicantType !== 'principal') {
      return (
        <div className="text-center p-2">
          <span className="text-gray-400 text-xs">N/A</span>
        </div>
      );
    }

    if (columnType === 'dependant') {
      if (taskApplicantType !== 'dependant') {
        return (
          <div className="text-center p-2">
            <span className="text-gray-400 text-xs">N/A</span>
          </div>
        );
      }
      // For dependants, also check if this specific dependant ID matches
      if (dependantId && task.dependant_member && Array.isArray(task.dependant_member)) {
        const hasMatchingDependant = task.dependant_member.some((dep: any) => dep.id === dependantId);
        if (!hasMatchingDependant) {
          return (
            <div className="text-center p-2">
              <span className="text-gray-400 text-xs">N/A</span>
            </div>
          );
        }
      }
    }

    if (columnType === 'understudy' && taskApplicantType !== 'understudy') {
      return (
        <div className="text-center p-2">
          <span className="text-gray-400 text-xs">N/A</span>
        </div>
      );
    }

    const references = taskReferences[task.id] || [];

    if (references.length === 0) {
      return (
        <div className="text-center p-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50 hover:text-amber-700 transition-colors"
            title="Upload references"
          >
            <Upload className="h-4 w-4" />
          </Button>
          <span className="text-[10px] text-amber-600 font-medium mt-0.5">Upload</span>
        </div>
      );
    }

    return (
      <div className="text-center p-2">
        <div className="flex flex-col items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-green-600 hover:bg-green-100 hover:text-green-700 transition-colors"
            title={`View ${references.length} ${references.length > 1 ? 'references' : 'reference'}`}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {references.length > 1 && (
            <Badge
              variant="outline"
              className="h-5 w-5 p-0 flex items-center justify-center text-xs font-semibold bg-green-50 text-green-700 border-green-200"
            >
              {references.length}
            </Badge>
          )}
          <span className="text-[10px] text-green-600 font-medium">References</span>
        </div>
      </div>
    );
  }, [taskReferences]);

  const organizedRequirements = useMemo(() => {
    const documentsMap = new Map<string, {
      document: any,
      fields: any[],
      category: 'company' | 'individual',
      applicabilitySettings?: any
    }>();

    const bclCompanyTemplates: any[] = [];
    const bclIndividualTemplates: any[] = [];

    const postAppCompanyDocuments: any[] = [];
    const postAppIndividualDocuments: any[] = [];

    const clientFieldsMap = new Map<string, {
      field: any,
      category: 'company' | 'individual'
    }>();

    const selectedBclTemplateIds = new Set<string>();

    const stageDocumentIds = new Set<string>();

    stageDocuments.forEach(stageDoc => {
      stageDocumentIds.add(stageDoc.id);
      const category = stageDoc.category === 'company-docs' ? 'company' : 'individual';

      if (category === 'company') {
        postAppCompanyDocuments.push(stageDoc);
      } else {
        postAppIndividualDocuments.push(stageDoc);
      }
    });

    filteredTasks.forEach(task => {
      const classRequirements = taskClassRequirements[task.id];
      if (!classRequirements) return;

      if (Array.isArray(classRequirements.documents_and_fields)) {
        classRequirements.documents_and_fields
          .filter((item: any) => {
            return item.ap === true || item.dp === true || item.understudy === true || item.display === true;
          })
          .forEach((item: any) => {
            const parsed = parseSelectionId(item.id);

            if (parsed.type === 'document') {
              if (stageDocumentIds.has(parsed.documentId)) {
                return;
              }

              const bclTemplate = bclTemplateDocuments.find(doc => doc.id === parsed.documentId);
              if (bclTemplate) {
                selectedBclTemplateIds.add(parsed.documentId);
              }
            }
          });
      }
    });

    filteredTasks.forEach(task => {
      const classRequirements = taskClassRequirements[task.id];
      if (!classRequirements) return;

      if (Array.isArray(classRequirements.documents_and_fields)) {
        classRequirements.documents_and_fields
          .filter((item: any) => {
            return item.ap === true || item.dp === true || item.understudy === true || item.display === true;
          })
          .forEach((item: any) => {
            const parsed = parseSelectionId(item.id);

            if (parsed.type === 'document') {
              if (stageDocumentIds.has(parsed.documentId)) {
                return;
              }

              if (selectedBclTemplateIds.has(parsed.documentId)) {
                const bclTemplate = bclTemplateDocuments.find(doc => doc.id === parsed.documentId);
                if (bclTemplate) {
                  const category = bclTemplate.category === 'company-docs' ? 'company' : 'individual';
                  const templateWithSettings = {
                    ...bclTemplate,
                    selectionId: item.id,
                    ap: item.ap,
                    dp: item.dp,
                    understudy: item.understudy,
                    display: item.display,
                    kycdocumentid: item.kycdocumentid || bclTemplate.id
                  };

                  if (category === 'company') {
                    if (!bclCompanyTemplates.some(t => t.id === bclTemplate.id)) {
                      bclCompanyTemplates.push(templateWithSettings);
                    }
                  } else {
                    if (!bclIndividualTemplates.some(t => t.id === bclTemplate.id)) {
                      bclIndividualTemplates.push(templateWithSettings);
                    }
                  }
                }
              } else {
                const document = documents.find(doc => doc.id === parsed.documentId);
                if (document && !documentsMap.has(parsed.documentId)) {
                  const category = document.category === 'company-docs' ? 'company' : 'individual';
                  documentsMap.set(parsed.documentId, {
                    document: {
                      ...document,
                      selectionId: item.id,
                      ap: item.ap,
                      dp: item.dp,
                      understudy: item.understudy,
                      display: item.display,
                      kycdocumentid: item.kycdocumentid || document.id
                    },
                    fields: [],
                    category: category,
                    applicabilitySettings: {
                      ap: item.ap,
                      dp: item.dp,
                      understudy: item.understudy,
                      display: item.display
                    }
                  });
                }
              }
            } else if (parsed.type === 'field' && parsed.fieldId) {
              if (!selectedBclTemplateIds.has(parsed.documentId) && !stageDocumentIds.has(parsed.documentId)) {
                const document = documents.find(doc => doc.id === parsed.documentId);

                if (document) {
                  const category = document.category === 'company-docs' ? 'company' : 'individual';

                  if (!documentsMap.has(parsed.documentId)) {
                    documentsMap.set(parsed.documentId, {
                      document: document,
                      fields: [],
                      category: category
                    });
                  }

                  const field = document.fields?.find((f: any) => f.id === parsed.fieldId);
                  if (field) {
                    const docEntry = documentsMap.get(parsed.documentId)!;
                    const fieldExists = docEntry.fields.some(f => f.id === field.id);
                    if (!fieldExists) {
                      docEntry.fields.push({
                        ...field,
                        selectionId: item.id,
                        ap: item.ap,
                        dp: item.dp,
                        understudy: item.understudy,
                        display: item.display,
                        kycdocumentid: item.kycdocumentid || `${document.id}-${field.id}`
                      });
                    }
                  }
                }
              }
            }
          });
      }

      if (Array.isArray(classRequirements.client_fields)) {
        classRequirements.client_fields
          .filter((item: any) => {
            return item.ap === true || item.dp === true || item.understudy === true || item.display === true;
          })
          .forEach((item: any) => {
            let fieldName = '';
            const itemId = item.id;

            if (itemId.startsWith('form-field-')) {
              const withoutPrefix = itemId.replace(/^form-field-/, '');
              fieldName = withoutPrefix.replace(/_\d+_\d+$/, '');
            } else if (itemId.startsWith('platform-')) {
              const withoutPrefix = itemId.replace(/^platform-/, '');
              const parts = withoutPrefix.split('-');
              if (parts.length >= 2) {
                fieldName = parts.slice(1).join('-').replace(/_\d+_\d+$/, '');
              }
            } else {
              fieldName = itemId.split('_')[0];
            }

            const field = clientFormFields.find(f => f.name === fieldName);
            if (field && !clientFieldsMap.has(item.id)) {
              const category = documentTab;
              clientFieldsMap.set(item.id, {
                field: {
                  ...field,
                  selectionId: item.id,
                  ap: item.ap,
                  dp: item.dp,
                  understudy: item.understudy,
                  display: item.display
                },
                category: category
              });
            }
          });
      }
    });

    const companyDocuments = Array.from(documentsMap.values()).filter(item => item.category === 'company');
    const individualDocuments = Array.from(documentsMap.values()).filter(item => item.category === 'individual');
    const companyFields = Array.from(clientFieldsMap.values()).filter(item => item.category === 'company');
    const individualFields = Array.from(clientFieldsMap.values()).filter(item => item.category === 'individual');

    return {
      documents: {
        company: companyDocuments,
        individual: individualDocuments
      },
      clientFields: {
        company: companyFields,
        individual: individualFields
      },
      bclTemplates: {
        company: bclCompanyTemplates,
        individual: bclIndividualTemplates
      },
      postApplication: {
        company: postAppCompanyDocuments.sort((a, b) => (a.stageOrder || 0) - (b.stageOrder || 0)),
        individual: postAppIndividualDocuments.sort((a, b) => (a.stageOrder || 0) - (b.stageOrder || 0))
      }
    };
  }, [filteredTasks, taskClassRequirements, documents, bclTemplateDocuments, stageDocuments, clientFormFields, documentTab, parseSelectionId]);

  // Format task data helper
  const formatTaskData = useCallback((task: any) => {
    const formatDate = (dateString?: string | null) => {
      if (!dateString) return '';
      try {
        return format(parseISO(dateString), 'yyyy-MM-dd');
      } catch (e) {
        return dateString;
      }
    };

    return {
      ...task,
      applicant_name: task.applicant_name || task.company_name || 'Missing',
      renewal_status: task.renewal_status || 'New',
    }
  }, [groupedTasks, selectedApplicant]);

  if (documentsLoading) {
    return (
      <div className="flex h-[85vh] w-full">
        {/* Sidebar */}
        <div className={cn(
          "w-64 border-r transition-all duration-300 ease-in-out bg-white",
          !sidebarOpen && "hidden md:block"
        )}>
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold">Applicants</h2>
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="h-[calc(100%-60px)]">
            <div className="space-y-1 p-2">
              {groupedTasks.map((group, index) => (
                <Button
                  key={index}
                  variant={selectedApplicant === group.applicantName ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start",
                    selectedApplicant === group.applicantName ? "bg-muted" : "hover:bg-muted/50"
                  )}
                  onClick={() => handleSelectApplicant(group.applicantName)}
                >
                  <span className="truncate">{group.applicantName}</span>
                  <Badge variant="outline" className="ml-2">
                    {group.tasks.length}
                  </Badge>
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col border rounded-md bg-background shadow-sm">
          <div className="overflow-auto flex-1">
            <div className="flex items-center space-x-2">
              <div className="h-4 w-4 border-2 border-t-2 border-t-primary rounded-full animate-spin"></div>
              <span>Loading documents and fields...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[85vh] w-full">
      {/* Sidebar */}
      <div className={cn(
        "w-64 border-r transition-all duration-300 ease-in-out bg-white",
        !sidebarOpen && "hidden md:block"
      )}>
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Applicants</h2>
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="h-[calc(100%-60px)]">
          <div className="space-y-1 p-2">
            {/* Company Information Section
            {Object.keys(companyData).length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border">
                <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Company Information
                </h3>
                {Object.values(companyData).map((company: any) => (
                  <div key={company.id} className="space-y-1">
                    <div className="text-xs font-medium text-blue-800">
                      {company.company_name}
                    </div>
                    <div className="text-xs text-blue-600">
                      {company.company_type} • {company.registration_number}
                    </div>
                    <div className="text-xs text-blue-500">
                      ID: {company.id}
                    </div>
                  </div>
                ))}
              </div>
            )} */}

            {/* Applicants List */}
            <div className="border-t pt-2">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 px-2">Applicants</h3>
              {groupedTasks.map((group, index) => (
                <Button
                  key={index}
                  variant={selectedApplicant === group.applicantName ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start mb-1",
                    selectedApplicant === group.applicantName ? "bg-muted" : "hover:bg-muted/50"
                  )}
                  onClick={() => handleSelectApplicant(group.applicantName)}
                >
                  <div className="flex flex-col items-start w-full">
                    <div className="flex items-center justify-between w-full">
                      <span className="truncate text-left">{group.applicantName}</span>
                      <Badge variant="outline" className="ml-2">
                        {group.tasks.length}
                      </Badge>
                    </div>
                    {/* Show company name for this applicant */}
                    {group.tasks[0]?.company_id && companyData[group.tasks[0].company_id] && (
                      <span className="text-xs text-muted-foreground truncate w-full text-left">
                        {companyData[group.tasks[0].company_id].company_name}
                      </span>
                    )}
                  </div>
                </Button>
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col border rounded-md bg-background shadow-sm">
        {/* Stats Row */}
        {showStats && (
          <div className="border-b bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded"></div>
                  <span className="text-sm font-medium">Uploaded: {calculateStats.uploaded}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-orange-500 rounded"></div>
                  <span className="text-sm font-medium">Missing: {calculateStats.missing}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-gray-400 rounded"></div>
                  <span className="text-sm font-medium">N/A: {calculateStats.na}</span>
                </div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium">Total: {calculateStats.total}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowStats(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <EyeOff className="h-4 w-4 mr-2" />
                Hide Stats
              </Button>
            </div>
          </div>
        )}

        {/* Show Stats Button when hidden */}
        {!showStats && (
          <div className="border-b bg-gray-50 p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowStats(true)}
              className="text-gray-500 hover:text-gray-700"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Show Stats
            </Button>
          </div>
        )}

        {/* Table Container */}
        <div className="overflow-auto flex-1">
          <RequirementsTableCombined
            loading={loading}
            error={error}
            filteredGroupedTasks={filteredGroupedTasks}
            organizedRequirements={organizedRequirements}
            expandedDocuments={expandedDocuments}
            toggleDocumentExpansion={toggleDocumentExpansion}
            renderDocumentStatus={renderDocumentStatus}
            renderClientFieldData={renderClientFieldData}
            renderReferencesData={renderReferencesData}
            hasReferencesColumn={hasReferencesColumn}
            documentTab={documentTab}
            activeTab={activeTab}
            calculateStats={calculateStats}
            individualNames={individualNames}
          />
        </div>

        {/* Footer with summary information */}
        <div className="border-t bg-gray-50 p-3">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-4">
              <span>
                <strong>{filteredTasks.length}</strong> {activeTab === 'completed' ? 'completed' : 'active'} applications
              </span>
              <span>
                <strong>{groupedTasks.length}</strong> applicant{groupedTasks.length !== 1 ? 's' : ''}
              </span>
              <span>
                <strong>{organizedRequirements.documents.company.length + organizedRequirements.documents.individual.length}</strong> document items
                {organizedRequirements.documents.company.length > 0 && (
                  <span className="text-blue-600 ml-1">
                    ({organizedRequirements.documents.company.length} company, {organizedRequirements.documents.individual.length} individual)
                  </span>
                )}
              </span>
              <span>
                <strong>{organizedRequirements.bclTemplates.company.length + organizedRequirements.bclTemplates.individual.length}</strong> BCL templates
              </span>
              <span>
                <strong>{organizedRequirements.clientFields.company.length + organizedRequirements.clientFields.individual.length}</strong> client fields
              </span>
              <span>
                <strong>{organizedRequirements.postApplication.company.length + organizedRequirements.postApplication.individual.length}</strong> stage documents
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-500 rounded"></div>
                <span className="text-xs">Uploaded ({calculateStats.uploaded})</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-orange-500 rounded"></div>
                <span className="text-xs">Missing ({calculateStats.missing})</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-gray-400 rounded"></div>
                <span className="text-xs">N/A ({calculateStats.na})</span>
              </div>
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
              Upload {(selectedUploadData?.document?.display_name || selectedUploadData?.document?.name || 'Unknown Document')} for {selectedUploadData?.columnType}
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
            onUploadComplete={() => {
              setUploadDialogOpen(false);
              handleUploadComplete();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}