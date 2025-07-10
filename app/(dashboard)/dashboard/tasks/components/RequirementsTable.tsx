// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, BarChart3, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Eye, EyeOff, FileText, HelpCircle, Info, Loader2, Menu, Minus, Pin, Plus, Sidebar, Upload, UserCheck, X, Users , } from "lucide-react"
import { format, parseISO } from "date-fns"
import { supabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { getTableFields, getGroupedFields } from "../../departments/documents+fields/formFields"
import { toast } from "@/hooks/use-toast"
import { useSearchParams, useRouter } from "next/navigation"

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

  // Updated function to properly fetch all individual names
const fetchAllIndividualData = useCallback(async (tasks: any[]) => {
  const uniqueIds = new Set<number>();

  // Collect all individual IDs from tasks
  tasks.forEach(task => {
    if (task.principal_member) {
      uniqueIds.add(task.principal_member);
    }
    if (task.understudy_member) {
      uniqueIds.add(task.understudy_member);
    }
    if (task.dependant_member) {
      uniqueIds.add(task.dependant_member);
    }
    if (task.individual_id) {
      uniqueIds.add(task.individual_id);
    }
  });

  // Remove any undefined or null values
  const validIds = Array.from(uniqueIds).filter(id => id != null);

  if (validIds.length === 0) return;

  // Get individual names
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

    // Update the individualNames state with the new names
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

  // Fetch documents for individuals
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

    const documentsByDirector = documents?.reduce((acc, doc) => {
      const directorId = doc.director_id;
      if (!acc[directorId]) {
        acc[directorId] = [];
      }
      acc[directorId].push(doc);
      return acc;
    }, {} as Record<string, any[]>);

    setAllIndividualDocuments(documentsByDirector || {});
  } catch (error) {
    console.error('Error fetching all individual documents:', error);
  }
}, []);

  // Update individual names when tasks change
  useEffect(() => {
    if (!tasks?.length) {
      return;
    }
    
    // Fetch all individual data including names from the database
    fetchAllIndividualData(tasks);
    
  }, [tasks, fetchAllIndividualData]);

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

// Fetch principal member data for dependants
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

    // For dependants, use the principal member ID
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

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, any[]>();

    filteredTasks.forEach(task => {
      let applicantName = task.applicant_name || task.company_name || 'Unknown Applicant';

      // For dependants, show both dependant and principal names
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

    return Array.from(groups.entries()).map(([name, tasks]) => ({
      applicantName: name,
      tasks: tasks
    }));
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

  
  // Get company documents from cached data
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

    // Check if display is explicitly false
    if (item.display === false) return false;

    // Check specific applicant type settings
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

  // Get document status for specific column (principal/dependant/understudy)
  const getDocumentStatusForColumn = useCallback((task: any, item: any, columnType: 'principal' | 'dependant' | 'understudy'): DocumentStatus => {
    const itemId = item.selectionId || item.id;
    // Create a status key that includes the column type
    const statusKey = `${task.id}-${itemId}-${columnType}`;
    
    // Determine which columns this document should appear in
    const applicableColumns = [];
    
    if (item.ap === true) applicableColumns.push('principal');
    if (item.dp === true) applicableColumns.push('dependant');
    if (item.understudy === true) applicableColumns.push('understudy');
    
    if (item.display === true) {
      if (!applicableColumns.includes('principal')) applicableColumns.push('principal');
      if (!applicableColumns.includes('dependant')) applicableColumns.push('dependant');
    }
    
    if (!applicableColumns.includes(columnType)) {
      return { type: 'na', documents: [] };
    }
    
    if (documentStatuses[statusKey]) {
      return documentStatuses[statusKey];
    }
    
    const isDocumentApplicable = applicableColumns.includes(columnType);
    
    if (!isDocumentApplicable) {
      const naStatus: DocumentStatus = {
        type: 'na',
        documents: [],
        count: 0,
        applicantTypes: {
          principal: item.ap === true || item.display === true,
          dependant: item.dp === true || item.display === true,
          understudy: item.understudy === true || item.display === true
        }
      };
      setDocumentStatuses(prev => ({ ...prev, [statusKey]: naStatus }));
      return naStatus;
    }

    const status: DocumentStatus = {
      type: 'missing',
      documents: [],
      count: 0,
      applicantTypes: {
        principal: item.ap === true || item.display === true,
        dependant: item.dp === true || item.display === true,
        understudy: item.understudy === true || item.display === true
      }
    };

    try {
      let documentId = item.kycdocumentid || item.id;
      
      if (!documentId) {
        setDocumentStatuses(prev => ({ ...prev, [statusKey]: status }));
        return status;
      }

      if (documentId.includes('_')) {
        const parts = documentId.split('_');
        documentId = parts[0];
      }

      let allDocuments: any[] = [];
      if (documentTab === 'individual') {
        allDocuments = getIndividualDocuments(task, documentId) || [];
      } else if (documentTab === 'company') {
        allDocuments = getCompanyDocuments(task, documentId) || [];
      }

      const filteredDocuments = allDocuments.filter(doc => {
        return !doc.applicant_type || doc.applicant_type === columnType;
      });

      if (filteredDocuments.length > 0) {
        status.type = 'view';
        status.documents = filteredDocuments;
        status.count = filteredDocuments.length;
      }
    } catch (error) {
      console.error('Error checking documents:', error);
    } finally {
      setDocumentStatuses(prev => ({ ...prev, [statusKey]: status }));
    }

    setDocumentStatuses(prev => ({ ...prev, [statusKey]: status }));
    return status;
  }, [documentTab, getDocumentApplicability, getIndividualDocuments, getCompanyDocuments, documentStatuses]);

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

  // Updated: Fetch all required data with proper class requirements filtering
  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      if (!isMounted || !filteredTasks.length) return;
      
      clearDocumentStatuses();
      setDocumentsLoading(true);
      setDocuments([]);
      
      try {
        const documentsResponse = await supabase
          .from('acc_portal_kyc')
          .select('*')
          .order('main_category_number', { ascending: true, nullsLast: true })
          .order('custom_order', { ascending: true, nullsLast: true });

        if (!isMounted) return;
        
        if (documentsResponse.error) {
          console.error('Error fetching documents:', documentsResponse.error);
          throw documentsResponse.error;
        }

        const processedDocuments = (documentsResponse.data || []).map(doc => ({
          ...doc,
          id: doc.id,
          fields: Array.isArray(doc.fields) ? doc.fields : [],
          display_name: doc.display_name || doc.name
        }));

        setDocuments(processedDocuments);

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
    const doc = documents.find(d => d.id === docId);
    return doc?.display_name || doc?.name || `Document (${docId.substring(0, 8)}...)`;
  }, [documents]);

  // Handle upload action
  const handleUploadAction = useCallback((task: any, item: any, columnType: 'principal' | 'dependant' | 'understudy') => {
    if (onShowUploadDialog) {
      const itemId = item.selectionId || item.id;
      const newStatuses = { ...documentStatuses };
      Object.keys(newStatuses).forEach(key => {
        if (key.startsWith(`${task.id}-${itemId}-`)) {
          delete newStatuses[key];
        }
      });
      setDocumentStatuses(newStatuses);
      
      onShowUploadDialog({ ...task, currentColumnType: columnType }, item);
    }
  }, [documentStatuses, onShowUploadDialog]);

  // Handle view action
  const handleViewAction = useCallback(async (task: any, item: any) => {
    const itemId = item.selectionId || item.id;
    const statusKey = Object.keys(documentStatuses).find(key => 
      key.startsWith(`${task.id}-${itemId}-`)
    );
    const status = statusKey ? documentStatuses[statusKey] : null;

    if (status && status.documents.length > 0) {
      if (onViewDocument) {
        onViewDocument(task, { ...item, documents: status.documents });
      } else {
        const firstDoc = status.documents[0];
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
    }
  }, [documentStatuses, onViewDocument, documentTab]);

  // Render document status for each column (principal/dependant/understudy)
  const renderDocumentStatus = useCallback((task: any, item: any, columnType: 'principal' | 'dependant' | 'understudy') => {
    const status = getDocumentStatusForColumn(task, item, columnType);
    const itemId = item.selectionId || item.id;
    const statusKey = `${task.id}-${itemId}-${columnType}`;
    const isLoading = loadingDocuments.has(statusKey);

    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      );
    }

    if (status.type === 'na') {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <span className="text-gray-400 text-xs">N/A</span>
        </div>
      );
    }

    switch (status.type) {
      case 'view':
        return (
          <div className="flex flex-col items-center justify-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-100"
                onClick={() => handleViewAction(task, item)}
                title={`View ${status.count} document(s)`}
              >
                <Eye className="h-4 w-4" />
              </Button>
              {status.count > 1 && (
                <Badge variant="default" className="text-xs px-1 bg-green-100 text-green-700">
                  {status.count}
                </Badge>
              )}
            </div>
          </div>
        );

      case 'missing':
        return (
          <div className="flex flex-col items-center justify-center">
            <div className="flex items-center justify-center mb-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-red-600 hover:bg-red-100"
                onClick={() => handleUploadAction(task, item, columnType)}
                title={`Upload document for ${columnType}`}
              >
                <Upload className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center">
            <span className="text-gray-400 text-xs">-</span>
          </div>
        );
    }
  }, [getDocumentStatusForColumn, loadingDocuments, handleViewAction, handleUploadAction]);

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

  // Updated: Organize requirements with proper filtering
  const organizedRequirements = useMemo(() => {
    const documentsMap = new Map<string, {
      document: any,
      fields: any[],
      category: 'company' | 'individual',
      applicabilitySettings?: any
    }>();
    const clientFieldsMap = new Map<string, {
      field: any,
      category: 'company' | 'individual'
    }>();

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
            } else if (parsed.type === 'field' && parsed.fieldId) {
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
      }
    };
  }, [filteredTasks, taskClassRequirements, documents, clientFormFields, documentTab, parseSelectionId]);

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
        {/* Table Container */}
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
      {/* Table Container */}
      <div className="overflow-auto flex-1">
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

        <Table className="min-w-full w-full border-collapse">
          <TableHeader className="sticky top-0 z-10">
            {/* Main header row - Applicant Names */}
            <TableRow className="h-12">
              <TableHead
                rowSpan={3}
                className="sticky left-0 bg-blue-600 border-r border-blue-500 w-16 z-20 text-white text-center font-semibold"
              >
                #
              </TableHead>
              <TableHead
                rowSpan={3}
                className="sticky left-16 bg-blue-600 border-r border-blue-500 w-[300px] z-20 text-white font-semibold"
              >
                Requirements
              </TableHead>
              {filteredGroupedTasks.map((group, groupIndex) => {
                const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                const columnsCount = hasClassD ? 3 : 2;
                const hasDependant = group.tasks.some(task => task.applicant_type === 'dependant');

                return (
                  <TableHead
                    key={`applicant-${groupIndex}`}
                    colSpan={columnsCount}
                    className="bg-blue-700 border-r border-blue-500 text-white text-center font-bold px-2"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold truncate max-w-[200px]">
                          {group.applicantName}
                        </span>
                        {hasDependant && (
                          <UserCheck className="h-3 w-3 text-white" title="Has dependant relationship" />
                        )}
                      </div>
                      <span className="text-xs opacity-75">
                        {group.tasks.length} application{group.tasks.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>

            {/* ====== CORRECTED APPLICANT NAME ROW ====== */}
            <TableRow className="h-14">
              {filteredGroupedTasks.map((group, groupIndex) => {
                const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);

                // Robustly find IDs for each role by checking all tasks in the group
                const { principalId, dependantId, understudyId } = group.tasks.reduce(
                  (acc, task) => {
                    // The primary ID is from the task for that specific applicant type
                    if (task.applicant_type === 'principal') acc.principalId = task.individual_id;
                    if (task.applicant_type === 'dependant') acc.dependantId = task.individual_id;
                    if (task.applicant_type === 'understudy') acc.understudyId = task.individual_id;

                    // Use the relationship fields as fallbacks or to link across tasks
                    // The '||' operator ensures we don't overwrite an ID if it's already found
                    if (task.principal_member) acc.principalId = acc.principalId || task.principal_member;
                    if (task.dependant_member) acc.dependantId = acc.dependantId || task.dependant_member;
                    if (task.understudy_member) acc.understudyId = acc.understudyId || task.understudy_member;
                    
                    return acc;
                  },
                  { principalId: null, dependantId: null, understudyId: null }
                );

                // Look up names using the IDs from the central `individualNames` map.
                const principalName = (principalId && individualNames[principalId]);
                const dependantName = (dependantId && individualNames[dependantId]);
                const understudyName = (understudyId && individualNames[understudyId]);

                const dependantTask = group.tasks.find(t => t.applicant_type === 'dependant');

                const columns = [
                  // Principal Column
                  <TableHead
                    key={`${groupIndex}-principal`}
                    colSpan={1}
                    className="bg-blue-600 border-r border-blue-400 text-white text-center font-semibold min-w-[150px] px-2 py-2"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs font-bold">Principal</span>
                      {principalName ? (
                        <div className="flex items-center gap-1">
                          <UserCheck className="h-3 w-3 text-blue-200" />
                          <span className="text-xs truncate max-w-[100px]" title={principalName}>
                            {principalName}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableHead>,
                  
                  // Dependant Column
                  <TableHead
                    key={`${groupIndex}-dependant`}
                    colSpan={1}
                    className="bg-blue-500 border-r border-blue-400 text-white text-center font-semibold min-w-[150px] px-2 py-2"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs font-bold">Dependant</span>
                      {dependantName ? (
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-blue-200" />
                          <span className="text-xs truncate max-w-[100px]" title={dependantName}>
                            {dependantName}
                          </span>
                          {dependantTask && dependantTask.applications_count > 0 && (
                            <span className="text-xs bg-blue-100 text-blue-800 rounded-full px-1.5">
                              {dependantTask.applications_count}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableHead>
                ];

                // Add Understudy Column if needed
                if (hasClassD) {
                  columns.push(
                    <TableHead
                      key={`${groupIndex}-understudy`}
                      colSpan={1}
                      className="bg-blue-400 border-r border-blue-400 text-white text-center font-semibold min-w-[150px] px-2 py-2"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-bold">Understudy</span>
                        {understudyName ? (
                          <div className="flex items-center gap-1">
                            <UserCheck className="h-3 w-3 text-blue-200" />
                            <span className="text-xs truncate max-w-[100px]" title={understudyName}>
                              {understudyName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableHead>
                  );
                }

                return columns;
              })}
            </TableRow>
            {/* ====== END OF CORRECTION ====== */}
            
            {/* Status row with plus/minus icons */}
            <TableRow className="h-8">
              {filteredGroupedTasks.map((group, groupIndex) => {
                const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                const principalTask = group.tasks.find(task => task.applicant_type === 'principal');
                const dependantTask = group.tasks.find(task => task.applicant_type === 'dependant');
                const understudyTask = group.tasks.find(task => task.applicant_type === 'understudy');

                const columns = [
                  <TableHead
                    key={`${groupIndex}-principal-status`}
                    colSpan={1}
                    className="bg-blue-600 border-r border-blue-400 text-white text-center font-semibold min-w-[120px] px-2"
                  >
                    <div className="flex flex-col items-center gap-1">
                      {principalTask && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleDocumentExpansion(principalTask.id)}
                          title="Toggle document fields"
                        >
                          {expandedDocuments.has(principalTask.id) ? (
                            <Minus className="h-4 w-4" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </TableHead>,
                  <TableHead
                    key={`${groupIndex}-dependant-status`}
                    colSpan={1}
                    className="bg-blue-500 border-r border-blue-400 text-white text-center font-semibold min-w-[120px] px-2"
                  >
                    <div className="flex flex-col items-center gap-1">
                      {dependantTask && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleDocumentExpansion(dependantTask.id)}
                          title="Toggle document fields"
                        >
                          {expandedDocuments.has(dependantTask.id) ? (
                            <Minus className="h-4 w-4" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </TableHead>
                ];

                if (hasClassD) {
                  columns.push(
                    <TableHead
                      key={`${groupIndex}-understudy-status`}
                      colSpan={1}
                      className="bg-blue-400 border-r border-blue-400 text-white text-center font-semibold min-w-[120px] px-2"
                    >
                      <div className="flex flex-col items-center gap-1">
                        {understudyTask && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleDocumentExpansion(understudyTask.id)}
                            title="Toggle document fields"
                          >
                            {expandedDocuments.has(understudyTask.id) ? (
                              <Minus className="h-4 w-4" />
                            ) : (
                              <Plus className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableHead>
                  );
                }

                return columns;
              })}
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y">
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={2 + groupedTasks.reduce((acc, group) => acc + (group.tasks.some(task => task.class_id === CLASS_D_ID) ? 3 : 2), 0)}
                  className="h-24 text-center bg-gray-50"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <div className="h-4 w-4 border-2 border-t-2 border-t-primary rounded-full animate-spin"></div>
                    <span>Loading requirements...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell
                  colSpan={2 + groupedTasks.reduce((acc, group) => acc + (group.tasks.some(task => task.class_id === CLASS_D_ID) ? 3 : 2), 0)}
                  className="h-24 text-center text-destructive bg-red-50"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <span>{error}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <>
                {/* Documents & Fields Section */}
                {(organizedRequirements.documents.company.length > 0 || organizedRequirements.documents.individual.length > 0) && (
                  <>
                    {/* Main Documents & Fields Header */}
                    <TableRow className="bg-gradient-to-r from-slate-100 to-slate-50 border-y-2 border-slate-300">
                      <TableCell className="sticky left-0 bg-gradient-to-r from-slate-100 to-slate-50 border-r z-[5] text-center font-bold text-slate-700">
                        <FileText className="h-4 w-4 mx-auto" />
                      </TableCell>
                      <TableCell className="sticky left-16 bg-gradient-to-r from-slate-100 to-slate-50 border-r z-[5]">
                        <div className="flex items-center gap-2 px-2 py-2">
                          <span className="font-bold text-slate-700 text-lg">Documents & Fields</span>
                          <span className="text-sm bg-slate-200 text-slate-600 px-2 py-1 rounded-full ml-2">
                            {organizedRequirements.documents.company.length + organizedRequirements.documents.individual.length}
                          </span>
                        </div>
                      </TableCell>
                      {filteredGroupedTasks.map((group, groupIndex) => {
                        const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                        const columnsCount = hasClassD ? 3 : 2;

                        return Array.from({ length: columnsCount }, (_, idx) => (
                          <TableCell
                            key={`doc-section-${groupIndex}-${idx}`}
                            className="bg-gradient-to-r from-slate-100 to-slate-50 border-r text-center"
                          >
                            <div className="h-px bg-slate-300 w-full"></div>
                          </TableCell>
                        ));
                      })}
                    </TableRow>

                    {/* Company Documents Subsection */}
                    {organizedRequirements.documents.company.length > 0 && (
                      <>
                        <TableRow className="bg-blue-100">
                          <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-blue-700"></TableCell>
                          <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] px-4 py-2">
                            <span className="font-semibold text-blue-700">Company Documents</span>
                            <span className="text-sm bg-blue-200 text-blue-700 px-2 py-1 rounded-full ml-2">
                              {organizedRequirements.documents.company.length}
                            </span>
                          </TableCell>
                          {filteredGroupedTasks.map((group, groupIndex) => {
                            const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                            const columnsCount = hasClassD ? 3 : 2;

                            return Array.from({ length: columnsCount }, (_, idx) => (
                              <TableCell
                                key={`company-doc-header-${groupIndex}-${idx}`}
                                className="bg-blue-100 border-r text-center"
                              >
                                -
                              </TableCell>
                            ));
                          })}
                        </TableRow>

                        {/* Company Document Items */}
                        {organizedRequirements.documents.company.map((docItem, docIndex) => {
                          const isExpanded = expandedDocuments.has(docItem.document.id);

                          return (
                            <React.Fragment key={`company-doc-${docItem.document.id}`}>
                              {/* Document Row */}
                              <TableRow className="group bg-blue-50 hover:bg-blue-100">
                                <TableCell className="sticky left-0 bg-blue-50 group-hover:bg-blue-100 border-r z-[5] text-center text-sm font-semibold">
                                  {docIndex + 1}
                                </TableCell>
                                <TableCell className="sticky left-16 bg-blue-50 group-hover:bg-blue-100 border-r z-[5]">
                                  <div className="flex items-center px-2">
                                    <span className="text-sm font-semibold text-gray-800">
                                      {docItem.document.display_name}
                                    </span>
                                    {docItem.fields.length > 0 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 ml-2"
                                        onClick={() => toggleDocumentExpansion(docItem.document.id)}
                                      >
                                        {isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                                {filteredGroupedTasks.map((group, groupIndex) => {
                                  const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                                  const principalTask = group.tasks.find(task => task.applicant_type === 'principal');
                                  const dependantTask = group.tasks.find(task => task.applicant_type === 'dependant');
                                  const understudyTask = group.tasks.find(task => task.applicant_type === 'understudy');

                                  const columns = [
                                    <TableCell key={`${docItem.document.id}-${groupIndex}-principal`} className="text-center border p-1">
                                      {principalTask ? renderDocumentStatus(principalTask, docItem.document, 'principal') :
                                        <span className="text-gray-400 text-xs">N/A</span>}
                                    </TableCell>,
                                    <TableCell key={`${docItem.document.id}-${groupIndex}-dependant`} className="text-center border p-1">
                                      {dependantTask ? renderDocumentStatus(dependantTask, docItem.document, 'dependant') :
                                        <span className="text-gray-400 text-xs">N/A</span>}
                                    </TableCell>
                                  ];

                                  if (hasClassD) {
                                    columns.push(
                                      <TableCell key={`${docItem.document.id}-${groupIndex}-understudy`} className="text-center border p-1">
                                        {understudyTask ? renderDocumentStatus(understudyTask, docItem.document, 'understudy') :
                                          <span className="text-gray-400 text-xs">N/A</span>}
                                      </TableCell>
                                    );
                                  }

                                  return columns;
                                })}
                              </TableRow>

                              {/* Document Fields (if expanded) */}
                              {isExpanded && docItem.fields.map((field, fieldIndex) => (
                                <TableRow key={`company-field-${field.id}`} className="group bg-blue-25 hover:bg-blue-50">
                                  <TableCell className="sticky left-0 bg-blue-25 group-hover:bg-blue-50 border-r z-[5] text-center text-sm text-gray-500">
                                    {docIndex + 1}.{fieldIndex + 1}
                                  </TableCell>
                                  <TableCell className="sticky left-16 bg-blue-25 group-hover:bg-blue-50 border-r z-[5]">
                                    <div className="flex items-center px-2 pl-8">
                                      <span className="text-sm text-gray-700">{field.name}</span>
                                      <Badge variant="outline" className="text-xs ml-2 bg-yellow-50 text-yellow-700">
                                        Field
                                      </Badge>
                                      {field.type && (
                                        <span className="text-xs text-gray-400 ml-2">
                                          ({field.type})
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  {filteredGroupedTasks.map((group, groupIndex) => {
                                    const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                                    const principalTask = group.tasks.find(task => task.applicant_type === 'principal');
                                    const dependantTask = group.tasks.find(task => task.applicant_type === 'dependant');
                                    const understudyTask = group.tasks.find(task => task.applicant_type === 'understudy');

                                    const columns = [
                                      <TableCell key={`${field.id}-${groupIndex}-principal`} className="text-center border p-1">
                                        {principalTask ? renderDocumentStatus(principalTask, field, 'principal') :
                                          <span className="text-gray-400 text-xs">N/A</span>}
                                      </TableCell>,
                                      <TableCell key={`${field.id}-${groupIndex}-dependant`} className="text-center border p-1">
                                        {dependantTask ? renderDocumentStatus(dependantTask, field, 'dependant') :
                                          <span className="text-gray-400 text-xs">N/A</span>}
                                      </TableCell>
                                    ];

                                    if (hasClassD) {
                                      columns.push(
                                        <TableCell key={`${field.id}-${groupIndex}-understudy`} className="text-center border p-1">
                                          {understudyTask ? renderDocumentStatus(understudyTask, field, 'understudy') :
                                            <span className="text-gray-400 text-xs">N/A</span>}
                                        </TableCell>
                                      );
                                    }

                                    return columns;
                                  })}
                                </TableRow>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </>
                    )}

                    {/* Individual Documents Subsection */}
                    {organizedRequirements.documents.individual.length > 0 && (
                      <>
                        <TableRow className="bg-blue-100">
                          <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-blue-700"></TableCell>
                          <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] px-4 py-2">
                            <span className="font-semibold text-blue-700">Individual Documents</span>
                            <span className="text-sm bg-blue-200 text-blue-700 px-2 py-1 rounded-full ml-2">
                              {organizedRequirements.documents.individual.length}
                            </span>
                          </TableCell>
                          {filteredGroupedTasks.map((group, groupIndex) => {
                            const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                            const columnsCount = hasClassD ? 3 : 2;

                            return Array.from({ length: columnsCount }, (_, idx) => (
                              <TableCell
                                key={`individual-doc-header-${groupIndex}-${idx}`}
                                className="bg-blue-100 border-r text-center"
                              >
                                -
                              </TableCell>
                            ));
                          })}
                        </TableRow>

                        {/* Individual Document Items */}
                        {organizedRequirements.documents.individual.map((docItem, docIndex) => {
                          const isExpanded = expandedDocuments.has(docItem.document.id);

                          return (
                            <React.Fragment key={`individual-doc-${docItem.document.id}`}>
                              {/* Document Row */}
                              <TableRow className="group bg-blue-50 hover:bg-blue-100">
                                <TableCell className="sticky left-0 bg-blue-50 group-hover:bg-blue-100 border-r z-[5] text-center text-sm font-semibold">
                                  {docIndex + 1}
                                </TableCell>
                                <TableCell className="sticky left-16 bg-blue-50 group-hover:bg-blue-100 border-r z-[5]">
                                  <div className="flex items-center px-2">
                                    <span className="text-sm font-semibold text-gray-800">
                                      {docItem.document.display_name}
                                    </span>
                                    {docItem.fields.length > 0 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 ml-2"
                                        onClick={() => toggleDocumentExpansion(docItem.document.id)}
                                      >
                                        {isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                                {filteredGroupedTasks.map((group, groupIndex) => {
                                  const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                                  const principalTask = group.tasks.find(task => task.applicant_type === 'principal');
                                  const dependantTask = group.tasks.find(task => task.applicant_type === 'dependant');
                                  const understudyTask = group.tasks.find(task => task.applicant_type === 'understudy');

                                  const columns = [
                                    <TableCell key={`${docItem.document.id}-${groupIndex}-principal`} className="text-center border p-1">
                                      {principalTask ? renderDocumentStatus(principalTask, docItem.document, 'principal') :
                                        <span className="text-gray-400 text-xs">N/A</span>}
                                    </TableCell>,
                                    <TableCell key={`${docItem.document.id}-${groupIndex}-dependant`} className="text-center border p-1">
                                      {dependantTask ? renderDocumentStatus(dependantTask, docItem.document, 'dependant') :
                                        <span className="text-gray-400 text-xs">N/A</span>}
                                    </TableCell>
                                  ];

                                  if (hasClassD) {
                                    columns.push(
                                      <TableCell key={`${docItem.document.id}-${groupIndex}-understudy`} className="text-center border p-1">
                                        {understudyTask ? renderDocumentStatus(understudyTask, docItem.document, 'understudy') :
                                          <span className="text-gray-400 text-xs">N/A</span>}
                                      </TableCell>
                                    );
                                  }

                                  return columns;
                                })}
                              </TableRow>

                              {/* Document Fields (if expanded) */}
                              {isExpanded && docItem.fields.map((field, fieldIndex) => (
                                <TableRow key={`individual-field-${field.id}`} className="group bg-blue-25 hover:bg-blue-50">
                                  <TableCell className="sticky left-0 bg-blue-25 group-hover:bg-blue-50 border-r z-[5] text-center text-sm text-gray-500">
                                    {docIndex + 1}.{fieldIndex + 1}
                                  </TableCell>
                                  <TableCell className="sticky left-16 bg-blue-25 group-hover:bg-blue-50 border-r z-[5]">
                                    <div className="flex items-center px-2 pl-8">
                                      <span className="text-sm text-gray-700">{field.name}</span>
                                      <Badge variant="outline" className="text-xs ml-2 bg-yellow-50 text-yellow-700">
                                        Field
                                      </Badge>
                                      {field.type && (
                                        <span className="text-xs text-gray-400 ml-2">
                                          ({field.type})
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  {filteredGroupedTasks.map((group, groupIndex) => {
                                    const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                                    const principalTask = group.tasks.find(task => task.applicant_type === 'principal');
                                    const dependantTask = group.tasks.find(task => task.applicant_type === 'dependant');
                                    const understudyTask = group.tasks.find(task => task.applicant_type === 'understudy');

                                    const columns = [
                                      <TableCell key={`${field.id}-${groupIndex}-principal`} className="text-center border p-1">
                                        {principalTask ? renderDocumentStatus(principalTask, field, 'principal') :
                                          <span className="text-gray-400 text-xs">N/A</span>}
                                      </TableCell>,
                                      <TableCell key={`${field.id}-${groupIndex}-dependant`} className="text-center border p-1">
                                        {dependantTask ? renderDocumentStatus(dependantTask, field, 'dependant') :
                                          <span className="text-gray-400 text-xs">N/A</span>}
                                      </TableCell>
                                    ];

                                    if (hasClassD) {
                                      columns.push(
                                        <TableCell key={`${field.id}-${groupIndex}-understudy`} className="text-center border p-1">
                                          {understudyTask ? renderDocumentStatus(understudyTask, field, 'understudy') :
                                            <span className="text-gray-400 text-xs">N/A</span>}
                                        </TableCell>
                                      );
                                    }

                                    return columns;
                                  })}
                                </TableRow>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </>
                    )}
                  </>
                )}

                {/* Client Form Fields Section */}
                {(organizedRequirements.clientFields.company.length > 0 || organizedRequirements.clientFields.individual.length > 0) && (
                  <>
                    {/* Main Client Form Fields Header */}
                    <TableRow className="bg-gradient-to-r from-slate-100 to-slate-50 border-y-2 border-slate-300">
                      <TableCell className="sticky left-0 bg-gradient-to-r from-slate-100 to-slate-50 border-r z-[5] text-center font-bold text-slate-700">
                        <Users className="h-4 w-4 mx-auto" />
                      </TableCell>
                      <TableCell className="sticky left-16 bg-gradient-to-r from-slate-100 to-slate-50 border-r z-[5]">
                        <div className="flex items-center gap-2 px-2 py-2">
                          <span className="font-bold text-slate-700 text-lg">Client Form Fields</span>
                          <span className="text-sm bg-slate-200 text-slate-600 px-2 py-1 rounded-full ml-2">
                            {organizedRequirements.clientFields.company.length + organizedRequirements.clientFields.individual.length}
                          </span>
                        </div>
                      </TableCell>
                      {filteredGroupedTasks.map((group, groupIndex) => {
                        const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                        const columnsCount = hasClassD ? 3 : 2;

                        return Array.from({ length: columnsCount }, (_, idx) => (
                          <TableCell
                            key={`client-section-${groupIndex}-${idx}`}
                            className="bg-gradient-to-r from-slate-100 to-slate-50 border-r text-center"
                          >
                            <div className="h-px bg-slate-300 w-full"></div>
                          </TableCell>
                        ));
                      })}
                    </TableRow>

                    {/* Individual Client Fields Subsection */}
                    {organizedRequirements.clientFields.individual.length > 0 && (
                      <>
                        <TableRow className="bg-blue-100">
                          <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-gray-700"></TableCell>
                          <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] px-4 py-2">
                            <span className="font-semibold text-gray-700">Individual Fields</span>
                            <span className="text-sm bg-blue-200 text-gray-700 px-2 py-1 rounded-full ml-2">
                              {organizedRequirements.clientFields.individual.length}
                            </span>
                          </TableCell>
                          {filteredGroupedTasks.map((group, groupIndex) => {
                            const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                            const columnsCount = hasClassD ? 3 : 2;

                            return Array.from({ length: columnsCount }, (_, idx) => (
                              <TableCell
                                key={`individual-field-header-${groupIndex}-${idx}`}
                                className="bg-blue-100 border-r text-center"
                              >
                                -
                              </TableCell>
                            ));
                          })}
                        </TableRow>

                        {/* Individual Client Field Items */}
                        {organizedRequirements.clientFields.individual.map((fieldItem, fieldIndex) => (
                          <TableRow key={`individual-field-${fieldItem.field.selectionId}`} className="group bg-blue-50 hover:bg-blue-100">
                            <TableCell className="sticky left-0 bg-blue-50 group-hover:bg-blue-100 border-r z-[5] text-center text-sm font-semibold">
                              {fieldIndex + 1}
                            </TableCell>
                            <TableCell className="sticky left-16 bg-blue-50 group-hover:bg-blue-100 border-r z-[5]">
                              <div className="flex items-center px-2">
                                <span className="text-sm font-medium text-gray-700">
                                  {fieldItem.field.tableHeader || fieldItem.field.label}
                                </span>
                                {fieldItem.field.type && (
                                  <span className="text-xs text-gray-400 ml-2">
                                    ({fieldItem.field.type})
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            {filteredGroupedTasks.map((group, groupIndex) => {
                              const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                              const principalTask = group.tasks.find(task => task.applicant_type === 'principal');
                              const dependantTask = group.tasks.find(task => task.applicant_type === 'dependant');
                              const understudyTask = group.tasks.find(task => task.applicant_type === 'understudy');

                              const columns = [
                                <TableCell key={`${fieldItem.field.selectionId}-${groupIndex}-principal`} className="text-center border p-1">
                                  {principalTask ? renderClientFieldData(principalTask, fieldItem) :
                                    <span className="text-gray-400 text-xs">N/A</span>}
                                </TableCell>,
                                <TableCell key={`${fieldItem.field.selectionId}-${groupIndex}-dependant`} className="text-center border p-1">
                                  {dependantTask ? renderClientFieldData(dependantTask, fieldItem) :
                                    <span className="text-gray-400 text-xs">N/A</span>}
                                </TableCell>
                              ];

                              if (hasClassD) {
                                columns.push(
                                  <TableCell key={`${fieldItem.field.selectionId}-${groupIndex}-understudy`} className="text-center border p-1">
                                    {understudyTask ? renderClientFieldData(understudyTask, fieldItem) :
                                      <span className="text-gray-400 text-xs">N/A</span>}
                                  </TableCell>
                                );
                              }

                              return columns;
                            })}
                          </TableRow>
                        ))}
                      </>
                    )}
                  </>
                )}

                {/* Empty state */}
                {organizedRequirements.documents.company.length === 0 &&
                  organizedRequirements.documents.individual.length === 0 &&
                  organizedRequirements.clientFields.company.length === 0 &&
                  organizedRequirements.clientFields.individual.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={2 + groupedTasks.reduce((acc, group) => acc + (group.tasks.some(task => task.class_id === CLASS_D_ID) ? 3 : 2), 0)}
                        className="text-center p-8 text-muted-foreground bg-gray-50"
                      >
                        <div className="flex flex-col items-center space-y-2">
                          <FileText className="h-8 w-8 text-muted-foreground/50" />
                          <p className="font-medium">No requirements found</p>
                          <p className="text-sm text-muted-foreground">
                            No selected documents or client fields to display for {documentTab} applications
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
              </>
            )}
          </TableBody>
        </Table>
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
            </span>
            <span>
              <strong>{organizedRequirements.clientFields.company.length + organizedRequirements.clientFields.individual.length}</strong> client fields
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
  </div>
);
}