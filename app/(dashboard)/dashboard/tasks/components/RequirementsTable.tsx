// @ts-nocheck
"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, FileText, ChevronDown, Edit, Trash2, Upload, Eye, CheckCircle, XCircle, Clock, Users, ClipboardList } from "lucide-react"
import { format, parseISO } from "date-fns"
import { supabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { getTableFields, getGroupedFields } from "../../departments/documents+fields/formFields"

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
  const [taskCounts, setTaskCounts] = useState<Record<string, {documentsAndFieldsCount: number, clientFieldsCount: number}>>({})

  // Get client form fields based on document tab
  const clientFormFields = useMemo(() => {
    return getTableFields(documentTab);
  }, [documentTab]);

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

  // Helper function to extract document ID from selection ID
  const extractDocumentId = useCallback((selectionId: string) => {
    // Remove the suffix pattern like "_1_2" or "_2_0"
    return selectionId.replace(/_\d+_\d+$/, '');
  }, []);

  // Helper function to parse field ID from selection ID
  const parseFieldId = useCallback((selectionId: string) => {
    console.log('parseFieldId input:', selectionId);
    
    if (!selectionId) {
      console.warn('parseFieldId received empty selectionId');
      return { documentId: null, fieldId: null };
    }
    
    const cleanId = extractDocumentId(selectionId);
    console.log('parseFieldId cleaned ID:', cleanId);
    
    if (cleanId.includes('-')) {
      // This is a field: format "documentId-fieldId"
      const parts = cleanId.split('-');
      const result = {
        documentId: parts[0]?.toLowerCase(),
        fieldId: parts.slice(1).join('-') // In case field ID contains dashes
      };
      console.log('parseFieldId result (field):', result);
      return result;
    }
    
    const result = {
      documentId: cleanId?.toLowerCase(),
      fieldId: null
    };
    
    console.log('parseFieldId result (document):', result);
    return result;
  }, [extractDocumentId]);

  // Debug effect to log documents when they change
  useEffect(() => {
    console.log('Current documents:', documents.map(d => ({
      id: d.id,
      name: d.name || 'No name',
      display_name: d.display_name || 'No display name',
      fields_count: d.fields?.length || 0
    })));
  }, [documents]);

  // Fetch all required data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setDocumentsLoading(true);
        
        // 1. Fetch all documents from KYC table
        const category = documentTab === 'company' ? 'company-docs' : 'directors-docs';
        console.log(`Fetching documents for category: ${category}`);
        
        const documentsResponse = await supabase
          .from('acc_portal_kyc')
          .select('*')
          .order('main_category_number', { ascending: true, nullsLast: true })
          .order('custom_order', { ascending: true, nullsLast: true });

        if (documentsResponse.error) {
          console.error('Error fetching documents:', documentsResponse.error);
          throw documentsResponse.error;
        }

        console.log(`Fetched ${documentsResponse.data?.length || 0} documents`);
        const processedDocuments = (documentsResponse.data || []).map(doc => ({
          ...doc,
          id: doc.id?.toLowerCase(), // Normalize IDs to lowercase
          fields: Array.isArray(doc.fields) ? doc.fields : [],
          display_name: doc.display_name || doc.name
        }));

        setDocuments(processedDocuments);

        // 2. Fetch task class requirements and individual data for all filtered tasks
        const taskDataPromises = filteredTasks.map(async (task) => {
          // Construct class_id from task data
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

          console.log(`Task ${task.id}: Constructed class_id = ${constructedClassId}`);

          // Fetch class requirements for this task's class
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
              console.log(`Task ${task.id}: Found class requirements:`, classRequirements);
              
              // Count documents and fields
              if (classRequirements.requirements && Array.isArray(classRequirements.requirements)) {
                documentsAndFieldsCount = classRequirements.requirements.length;
              }
              
              // Count client fields (this is a simplified example - adjust based on your actual data structure)
              clientFieldsCount = 7; // This should be calculated based on your actual data
              
              console.log(`Task ${task.id}: Documents & Fields: ${documentsAndFieldsCount}, Client Fields: ${clientFieldsCount}`);
            } else {
              console.log(`Task ${task.id}: No class requirements found for class_id: ${constructedClassId}`);
            }
          }

          // Fetch individual data if task has r_number
          let individualData = null;
          if (task.r_number) {
            const individualResponse = await supabase
              .from('registry_individuals')
              .select('*')
              .eq('r_number', task.r_number)
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
        
        // Process results into state
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
        setDocumentsLoading(false);
      }
    };

    if (filteredTasks.length > 0) {
      fetchData();
    } else {
      setDocumentsLoading(false);
    }
  }, [documentTab, filteredTasks]);

  // Helper function to get document name by ID
  const getDocumentName = useCallback((docId: string) => {
    if (!docId) return 'Unknown Document';
    const doc = documents.find(d => d.id === docId.toLowerCase());
    return doc?.display_name || doc?.name || `Document (${docId.substring(0, 8)}...)`;
  }, [documents]);

  // Get selected documents and fields for a specific task
  const getTaskDocumentItems = useCallback((taskId: string) => {
    const classRequirements = taskClassRequirements[taskId];
    if (!classRequirements) {
      console.log(`No class requirements found for task ${taskId}`);
      return [];
    }

    console.log(`Processing documents and fields for task ${taskId}`, {
      clientFieldsCount: classRequirements.client_fields?.length || 0,
      documentsAndFieldsCount: classRequirements.documents_and_fields?.length || 0,
      classRequirements: classRequirements
    });

    const selectedItems: any[] = [];

    // Process standard requirements
    if (Array.isArray(classRequirements.requirements)) {
      classRequirements.requirements.forEach((req: any) => {
        if (req.isVisible !== false) {
          selectedItems.push({
            type: 'standard',
            id: `req_${req.id}`,
            name: req.name,
            description: req.description,
            isRequired: req.isRequired !== false,
            order: req.order || 0
          });
        }
      });
    }

    // Process documents_and_fields
    if (Array.isArray(classRequirements.documents_and_fields)) {
      classRequirements.documents_and_fields
        .filter((item: any) => item.display === true || item.ap === true || item.dp === true || item.understudy === true)
        .forEach((item: any) => {
          // Handle different ID formats
          const [docId, fieldId] = item.id.includes('_') ? item.id.split('_') : [item.id, null];
          const document = documents.find(doc => doc.id === docId);
          
          if (document) {
            if (fieldId && fieldId !== '1_3') { // Skip the _1_3 suffix which seems to be a version/class identifier
              // This is a document field
              const field = document.fields?.find((f: any) => f.id === fieldId);
              if (field) {
                selectedItems.push({
                  type: 'field',
                  id: item.id,
                  name: field.name,
                  document: document,
                  field: field,
                  isRequired: true,
                  applicantTypes: {
                    principal: item.ap === true || item.ap === undefined,
                    dependant: item.dp === true || item.dp === undefined,
                    understudy: item.understudy === true
                  }
                });
              }
            } else {
              // This is a document
              selectedItems.push({
                type: 'document',
                id: document.id,
                name: document.display_name || document.name,
                document: document,
                isRequired: true,
                applicantTypes: {
                  principal: item.ap === true || item.ap === undefined,
                  dependant: item.dp === true || item.dp === undefined,
                  understudy: item.understudy === true
                },
                // Add the document name for display
                displayName: document.display_name || document.name || getDocumentName(document.id)
              });
            }
          }
        });
    }

    // Process client_fields
    if (Array.isArray(classRequirements.client_fields)) {
      classRequirements.client_fields
        .filter((item: any) => item.display === true)
        .forEach((item: any) => {
          // Extract field name from ID: "form-field-fieldName_..."
          const fieldName = item.id.replace(/^form-field-/, '').split('_')[0];
          const field = clientFormFields.find(f => f.name === fieldName);
          
          if (field) {
            selectedItems.push({
              type: 'client-field',
              id: item.id,
              name: field.tableHeader || field.label,
              field: field,
              selection: item,
              isRequired: true
            });
          }
        });
    }

    // Sort items by order if available, otherwise by name
    selectedItems.sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
      return a.name.localeCompare(b.name);
    });

    console.log(`Task ${taskId} final items:`, selectedItems);
    return selectedItems;
  }, [taskClassRequirements, documents, clientFormFields]);

  // Get all unique requirement items across all tasks
  const allDocumentAndFieldItems = useMemo(() => {
    const uniqueItems = new Map();
    const allItems: any[] = [];

    filteredTasks.forEach(task => {
      const taskItems = getTaskDocumentItems(task.id);
      taskItems.forEach(item => {
        // Include all item types in the map
        if (!uniqueItems.has(item.id)) {
          // Ensure document names are properly set
          if (item.type === 'document' && !item.displayName) {
            item.displayName = getDocumentName(item.id);
          }
          uniqueItems.set(item.id, item);
          allItems.push(item);
        }
      });
    });

    console.log('All document and field items:', allItems);
    console.log(`Found ${allItems.length} unique requirement items across all tasks`);
    return allItems;
  }, [filteredTasks, getTaskDocumentItems, getDocumentName]);

  // Get all unique client field items across all tasks
  const allClientFieldItems = useMemo(() => {
    const uniqueItems = new Map();

    filteredTasks.forEach(task => {
      const taskItems = getTaskDocumentItems(task.id);
      taskItems.forEach(item => {
        if (item.type === 'client-field') {
          uniqueItems.set(item.id, item);
        }
      });
    });

    console.log('All client field items:', Array.from(uniqueItems.values()));
    return Array.from(uniqueItems.values());
  }, [filteredTasks, getTaskDocumentItems]);

  // Format task data
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
      created_at: formatDate(task.created_at),
      updated_at: formatDate(task.updated_at)
    };
  }, []);

  // Check if a task has a specific document/field item
  const taskHasItem = useCallback((taskId: string, itemId: string) => {
    const taskItems = getTaskDocumentItems(taskId);
    return taskItems.some(item => item.id === itemId);
  }, [getTaskDocumentItems]);

  // Render document/field status
  const renderDocumentStatus = useCallback((task: any, item: any) => {
    // Check if this task has this item selected
    if (!taskHasItem(task.id, item.id)) {
      return (
        <div className="text-center">
          <span className="text-gray-400 text-xs">N/A</span>
        </div>
      );
    }

    const taskDocuments = applicantDocuments[task.id] || [];
    
    let hasDocument = false;
    let matchingDoc = null;

    if (item.type === 'document') {
      hasDocument = taskDocuments.some(doc => 
        doc.document_id === item.document?.id || 
        doc.document_type === item.document?.name
      );
      matchingDoc = taskDocuments.find(doc => 
        doc.document_id === item.document?.id || 
        doc.document_type === item.document?.name
      );
    } else if (item.type === 'field') {
      hasDocument = taskDocuments.some(doc => 
        doc.field_id === item.field?.id || 
        (doc.document_id === item.document?.id && doc.field_name === item.field?.name)
      );
      matchingDoc = taskDocuments.find(doc => 
        doc.field_id === item.field?.id || 
        (doc.document_id === item.document?.id && doc.field_name === item.field?.name)
      );
    }

    // Check if this requirement applies to the current applicant type
    const applicantType = task.applicant_type || 'principal';
    const isApplicable = !item.applicantTypes || 
                         (applicantType === 'principal' && item.applicantTypes.principal) ||
                         (applicantType === 'dependant' && item.applicantTypes.dependant) ||
                         (applicantType === 'understudy' && item.applicantTypes?.understudy);

    if (!isApplicable) {
      return (
        <div className="flex items-center justify-center text-muted-foreground text-xs">
          N/A
        </div>
      );
    }

    if (hasDocument && matchingDoc) {
      const status = matchingDoc.status?.toLowerCase() || 'pending';
      const statusColor = 
        status === 'approved' ? 'text-green-600' :
        status === 'rejected' ? 'text-red-600' :
        'text-yellow-600';

      return (
        <div className="flex flex-col items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-full text-xs ${statusColor}`}
            onClick={() => onViewDocument?.(task, item)}
          >
            <Eye className="h-3 w-3 mr-1" />
            View
          </Button>
          <Badge 
            variant={
              status === 'approved' ? 'default' :
              status === 'rejected' ? 'destructive' :
              'secondary'
            }
            className="text-xs px-1 py-0"
          >
            {status === 'approved' ? 'OK' :
             status === 'rejected' ? 'REJ' :
             'PEN'}
          </Badge>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs text-gray-500"
          onClick={() => onShowUploadDialog?.(task, item)}
        >
          <Upload className="h-3 w-3 mr-1" />
          Upload
        </Button>
        <Badge variant="outline" className="text-xs px-1 py-0">
          Missing
        </Badge>
      </div>
    );
  }, [applicantDocuments, onViewDocument, onShowUploadDialog, taskHasItem]);

  // Render client field data
  const renderClientFieldData = useCallback((task: any, item: any) => {
    // Check if this task has this field selected
    if (!taskHasItem(task.id, item.id)) {
      return (
        <div className="text-center">
          <span className="text-gray-400 text-xs">N/A</span>
        </div>
      );
    }

    // Get individual data for this task from registry_individuals
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

    // Format value based on field type
    const formatValue = (value: any, type: string) => {
      if (type === 'password') return '••••••••';
      if (type === 'date') {
        try {
          return format(parseISO(value), 'yyyy-MM-dd');
        } catch {
          return value;
        }
      }
      if (type === 'number') return Number(value).toLocaleString();
      return String(value);
    };

    return (
      <div className="text-center">
        <span className="text-green-600 text-xs font-medium truncate max-w-[100px] inline-block">
          {formatValue(fieldValue, item.field.type)}
        </span>
      </div>
    );
  }, [taskIndividualData, taskHasItem]);

  if (documentsLoading) {
    return (
      <div className="rounded-md border w-full flex items-center justify-center h-64 bg-background shadow-sm">
        <div className="flex items-center space-x-2">
          <div className="h-4 w-4 border-2 border-t-2 border-t-primary rounded-full animate-spin"></div>
          <span>Loading documents and fields...</span>
        </div>
      </div>
    );
  }

  const allItems = [...allDocumentAndFieldItems, ...allClientFieldItems];

  // Debug logging
  console.log('Filtered tasks:', filteredTasks);
  console.log('Documents:', documents);
  console.log('Task class requirements:', taskClassRequirements);
  console.log('All document and field items:', allDocumentAndFieldItems);
  console.log('All client field items:', allClientFieldItems);

  return (
    <div className="rounded-md border w-full flex flex-col bg-background shadow-sm" style={{ maxHeight: '85vh', maxWidth: '98vw' }}>
      <div className="overflow-auto flex-1 relative">
        <Table className="min-w-full w-full border-collapse">
          <TableHeader className="sticky top-0 z-10">
            {/* Main header row */}
            <TableRow className="h-12">
              <TableHead 
                rowSpan={2}
                className="sticky left-0 bg-blue-600 border-r border-blue-500 w-16 z-20 text-white text-center font-semibold"
              >
                #
              </TableHead>
              <TableHead 
                rowSpan={2}
                className="sticky left-16 bg-blue-600 border-r border-blue-500 w-[300px] z-20 text-white font-semibold"
              >
                Requirements
              </TableHead>
              {filteredTasks.flatMap(task => {
                const isClassD = task.class_id === CLASS_D_ID;
                const columns = [
                  <TableHead
                    key={`${task.id}-principal`}
                    colSpan={1}
                    className="bg-purple-600 border-r border-purple-400 text-white text-center font-semibold min-w-[120px] px-2"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs font-bold">Principal</span>
                      {task.applicant_type === 'principal' && (
                        <span className="text-xs truncate max-w-[100px] bg-white/20 px-1 rounded">
                          {formatTaskData(task).applicant_name}
                        </span>
                      )}
                      <Badge 
                        variant={task.renewal_status === 'Renewal' ? 'secondary' : 'default'}
                        className="text-xs px-1 py-0"
                      >
                        {formatTaskData(task).renewal_status}
                      </Badge>
                    </div>
                  </TableHead>,
                  <TableHead
                    key={`${task.id}-dependant`}
                    colSpan={1}
                    className="bg-blue-600 border-r border-blue-400 text-white text-center font-semibold min-w-[120px] px-2"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs font-bold">Dependant</span>
                      {task.applicant_type === 'dependant' && (
                        <span className="text-xs truncate max-w-[100px] bg-white/20 px-1 rounded">
                          {formatTaskData(task).applicant_name}
                        </span>
                      )}
                      <Badge 
                        variant={task.renewal_status === 'Renewal' ? 'secondary' : 'default'}
                        className="text-xs px-1 py-0"
                      >
                        {formatTaskData(task).renewal_status}
                      </Badge>
                    </div>
                  </TableHead>
                ];

                // Add Understudy column for Class D
                if (isClassD) {
                  columns.push(
                    <TableHead
                      key={`${task.id}-understudy`}
                      colSpan={1}
                      className="bg-amber-600 border-r border-amber-400 text-white text-center font-semibold min-w-[120px] px-2"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-bold">Understudy</span>
                        {task.applicant_type === 'understudy' && (
                          <span className="text-xs truncate max-w-[100px] bg-white/20 px-1 rounded">
                            {formatTaskData(task).applicant_name}
                          </span>
                        )}
                        <Badge 
                          variant={task.renewal_status === 'Renewal' ? 'secondary' : 'default'}
                          className="text-xs px-1 py-0"
                        >
                          {formatTaskData(task).renewal_status}
                        </Badge>
                      </div>
                    </TableHead>
                  );
                }

                return columns;
              })}
            </TableRow>
            {/* Status row */}
            <TableRow className="h-8">
              <TableHead className="sticky left-16 bg-blue-500 border-r border-blue-400 text-white text-center text-xs min-w-[120px]">
                Status
              </TableHead>
              {filteredTasks.flatMap(task => {
                const isClassD = task.class_id === CLASS_D_ID;
                const statusColumns = [
                  <TableHead
                    key={`status-${task.id}-principal`}
                    className="bg-purple-500 border-r border-purple-400 text-white text-center text-xs min-w-[120px]"
                  >
                    <Badge 
                      variant={
                        task.status === 'completed' || task.status === 'approved' ? 'default' :
                        task.status === 'rejected' ? 'destructive' :
                        'secondary'
                      }
                      className="text-xs px-1 py-0"
                    >
                      {task.status === 'completed' || task.status === 'approved' ? 'Completed' :
                      task.status === 'rejected' ? 'Rejected' :
                      'In Progress'}
                    </Badge>
                  </TableHead>,
                  <TableHead
                    key={`status-${task.id}-dependant`}
                    className="bg-blue-500 border-r border-blue-400 text-white text-center text-xs min-w-[120px]"
                  >
                    <Badge 
                      variant="outline"
                      className="text-xs px-1 py-0 bg-white/10"
                    >
                      {task.applicant_type === 'dependant' ? 'Assigned' : 'N/A'}
                    </Badge>
                  </TableHead>
                ];

                // Add Understudy status column for Class D
                if (isClassD) {
                  statusColumns.push(
                    <TableHead
                      key={`status-${task.id}-understudy`}
                      className="bg-amber-500 border-r border-amber-400 text-white text-center text-xs min-w-[120px]"
                    >
                      <Badge 
                        variant="outline"
                        className="text-xs px-1 py-0 bg-white/10"
                      >
                        {task.applicant_type === 'understudy' ? 'Assigned' : 'N/A'}
                      </Badge>
                    </TableHead>
                  );
                }

                return statusColumns;
              })}
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y">
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={2 + filteredTasks.length}
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
                  colSpan={2 + filteredTasks.length}
                  className="h-24 text-center text-destructive bg-red-50"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <span>{error}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredTasks.length > 0 ? (
              <>
                {/* Documents & Fields Count */}
                <TableRow className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
                  <TableCell className="sticky left-0 bg-blue-50 border-r z-[5] text-center font-semibold">
                    <FileText className="h-4 w-4 mx-auto text-blue-600" />
                  </TableCell>
                  <TableCell className="sticky left-16 bg-blue-50 border-r z-[5] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                          <span className="font-medium text-blue-800">Documents & Fields Count</span>
                    </div>
                  </TableCell>
                  {filteredTasks.map((task) => (
                    <TableCell key={`doc-count-${task.id}`} className="border-r text-center py-3">
                      <Badge variant="outline" className="bg-white text-blue-700 border-blue-300">
                        {taskCounts[task.id]?.documentsAndFieldsCount || 0}
                      </Badge>
                    </TableCell>
                  ))}
                </TableRow>

                {/* Client Fields Count */}
                <TableRow className="bg-gradient-to-r from-green-50 to-green-100 border-b border-green-200">
                  <TableCell className="sticky left-0 bg-green-50 border-r z-[5] text-center font-semibold">
                    <ClipboardList className="h-4 w-4 mx-auto text-green-600" />
                  </TableCell>
                  <TableCell className="sticky left-16 bg-green-50 border-r z-[5] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-5 w-5 text-green-600" />
                      <span className="font-medium text-green-800">Client Fields Count</span>
                    </div>
                  </TableCell>
                  {filteredTasks.map((task) => (
                    <TableCell key={`client-count-${task.id}`} className="border-r text-center py-3">
                      <Badge variant="outline" className="bg-white text-green-700 border-green-300">
                        {taskCounts[task.id]?.clientFieldsCount || 0}
                      </Badge>
                    </TableCell>
                  ))}
                </TableRow>
              </>
            ) : (
              <TableRow>
                <TableCell
                  colSpan={2 + filteredTasks.length}
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
              <strong>{allDocumentAndFieldItems.length}</strong> document items
            </span>
            <span>
              <strong>{allClientFieldItems.length}</strong> client fields
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span className="text-xs">Approved/Complete</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-yellow-500 rounded"></div>
              <span className="text-xs">Pending</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-500 rounded"></div>
              <span className="text-xs">Missing/Rejected</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gray-400 rounded"></div>
              <span className="text-xs">N/A</span>
            </div>
          </div>
        </div>
      </div>
    </div>
 );
}