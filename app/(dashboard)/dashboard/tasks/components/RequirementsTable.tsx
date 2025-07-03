// @ts-nocheck
"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, FileText, ChevronDown, Edit, Trash2, Upload, Eye, CheckCircle, XCircle, Clock, Users } from "lucide-react"
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
}

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
  documentTab = "company"
}: RequirementsTableProps) {
  
  const [documents, setDocuments] = useState<any[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [taskRequirements, setTaskRequirements] = useState<Record<string, any[]>>({})
  const [taskIndividualData, setTaskIndividualData] = useState<Record<string, any>>({})

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

  // Fetch all required data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setDocumentsLoading(true);
        
        // 1. Fetch all documents from KYC table
        const documentsResponse = await supabase
          .from('acc_portal_kyc')
          .select('*')
          .eq('category', documentTab === 'company' ? 'company-docs' : 'directors-docs')
          .order('main_category_number', { ascending: true, nullsLast: true })
          .order('custom_order', { ascending: true, nullsLast: true });

        if (documentsResponse.error) throw documentsResponse.error;

        const processedDocuments = (documentsResponse.data || []).map(doc => ({
          ...doc,
          fields: Array.isArray(doc.fields) ? doc.fields : [],
          display_name: doc.display_name || doc.name
        }));

        setDocuments(processedDocuments);

        // 2. Fetch task requirements and individual data for all filtered tasks
        const taskRequirementsPromises = filteredTasks.map(async (task) => {
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

          // Fetch requirements for this task's class
          const requirementsResponse = await supabase
            .from('tm_class_requirements')
            .select('*')
            .eq('class_id', constructedClassId)
            .maybeSingle();

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
            requirements: requirementsResponse.data || null,
            individualData: individualData
          };
        });

        const taskRequirementsResults = await Promise.all(taskRequirementsPromises);

        // Process results into state
        const requirementsMap: Record<string, any[]> = {};
        const individualDataMap: Record<string, any> = {};

        taskRequirementsResults.forEach(({ taskId, requirements, individualData }) => {
          requirementsMap[taskId] = requirements;
          if (individualData) {
            individualDataMap[taskId] = individualData;
          }
        });

        setTaskRequirements(requirementsMap);
        setTaskIndividualData(individualDataMap);

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

  // Get selected documents and fields for a specific task
  const getTaskDocumentItems = useCallback((taskId: string) => {
    const taskReqs = taskRequirements[taskId];
    if (!taskReqs) return [];

    const selectedItems: any[] = [];

    // Process documents_and_fields (KYC documents and their fields)
    if (taskReqs.documents_and_fields) {
      taskReqs.documents_and_fields
        .filter(item => item.display === true)
        .forEach(selection => {
          // Parse the selection ID to determine if it's a document or field
          const idParts = selection.id.split('_');
          
          if (selection.id.includes('-')) {
            // This is a field: format "documentId-fieldId_..."
            const [documentId, fieldId] = selection.id.split('-');
            const document = documents.find(doc => doc.id === documentId);
            
            if (document) {
              const field = document.fields?.find(f => f.id === fieldId);
              if (field) {
                selectedItems.push({
                  type: 'field',
                  id: `${document.id}-${field.id}`,
                  name: field.name,
                  field: field,
                  document: document,
                  selection: selection
                });
              }
            }
          } else {
            // This is a document: format "documentId_..."
            const documentId = idParts[0];
            const document = documents.find(doc => doc.id === documentId);
            
            if (document) {
              selectedItems.push({
                type: 'document',
                id: document.id,
                name: document.display_name,
                document: document,
                selection: selection
              });
            }
          }
        });
    }

    // Process client_fields (form fields from registry_individuals)
    if (taskReqs.client_fields) {
      taskReqs.client_fields
        .filter(item => item.display === true)
        .forEach(selection => {
          // Extract field name from ID: "form-field-fieldName_..."
          const fieldName = selection.id.replace(/^form-field-/, '').split('_')[0];
          const field = clientFormFields.find(f => f.name === fieldName);
          
          if (field) {
            selectedItems.push({
              type: 'client-field',
              id: selection.id,
              name: field.tableHeader || field.label,
              field: field,
              selection: selection
            });
          }
        });
    }

    return selectedItems;
  }, [taskRequirements, documents, clientFormFields]);

  // Get all unique document items across all tasks
  const allDocumentItems = useMemo(() => {
    const uniqueItems = new Map();

    filteredTasks.forEach(task => {
      const taskItems = getTaskDocumentItems(task.id);
      taskItems.forEach(item => {
        if (item.type === 'document' || item.type === 'field') {
          uniqueItems.set(item.id, item);
        }
      });
    });

    return Array.from(uniqueItems.values());
  }, [filteredTasks, getTaskDocumentItems]);

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
        doc.document_id === item.document.id || 
        doc.document_type === item.document.name
      );
      matchingDoc = taskDocuments.find(doc => 
        doc.document_id === item.document.id || 
        doc.document_type === item.document.name
      );
    } else if (item.type === 'field') {
      hasDocument = taskDocuments.some(doc => 
        doc.field_id === item.field.id || 
        (doc.document_id === item.document.id && doc.field_name === item.field.name)
      );
      matchingDoc = taskDocuments.find(doc => 
        doc.field_id === item.field.id || 
        (doc.document_id === item.document.id && doc.field_name === item.field.name)
      );
    }

    if (hasDocument && matchingDoc) {
      const statusColor = 
        matchingDoc.status === 'approved' ? 'text-green-600' :
        matchingDoc.status === 'rejected' ? 'text-red-600' :
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
              matchingDoc.status === 'approved' ? 'default' :
              matchingDoc.status === 'rejected' ? 'destructive' :
              'secondary'
            }
            className="text-xs px-1 py-0"
          >
            {matchingDoc.status === 'approved' ? 'OK' :
             matchingDoc.status === 'rejected' ? 'REJ' :
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

  const allItems = [...allDocumentItems, ...allClientFieldItems];

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
                <div className="flex items-center justify-between px-2">
                  <span>Document / Field Details</span>
                  <FileText className="h-4 w-4" />
                </div>
              </TableHead>
              {filteredTasks.map((task, index) => (
                <TableHead
                  key={task.id}
                  colSpan={1}
                  className="bg-purple-600 border-r border-purple-400 text-white text-center font-semibold min-w-[120px] px-2"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs truncate max-w-[100px]">
                      {formatTaskData(task).applicant_name}
                    </span>
                    <Badge 
                      variant={task.renewal_status === 'Renewal' ? 'secondary' : 'default'}
                      className="text-xs px-1 py-0"
                    >
                      {formatTaskData(task).renewal_status}
                    </Badge>
                  </div>
                </TableHead>
              ))}
            </TableRow>

            {/* Status row */}
            <TableRow className="h-8">
              {filteredTasks.map((task) => (
                <TableHead
                  key={`status-${task.id}`}
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
                </TableHead>
              ))}
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
            ) : allItems.length > 0 ? (
              <>
                {/* Documents & Fields Section */}
                {allDocumentItems.length > 0 && (
                  <>
                    <TableRow className="bg-gradient-to-r from-slate-100 to-slate-50 border-y-2 border-slate-300">
                      <TableCell className="sticky left-0 bg-gradient-to-r from-slate-100 to-slate-50 border-r z-[5] text-center font-bold text-slate-700">
                        <FileText className="h-4 w-4 mx-auto" />
                      </TableCell>
                      <TableCell className="sticky left-16 bg-gradient-to-r from-slate-100 to-slate-50 border-r z-[5]">
                        <div className="flex items-center gap-2 px-2 py-2">
                          <FileText className="h-5 w-5 text-slate-600" />
                          <span className="font-bold text-slate-700 text-lg">Documents & Fields</span>
                          <span className="text-sm bg-slate-200 text-slate-600 px-2 py-1 rounded-full ml-2">
                            {allDocumentItems.length}
                          </span>
                        </div>
                      </TableCell>
                      {filteredTasks.map((task) => (
                        <TableCell key={`section-doc-${task.id}`} className="bg-gradient-to-r from-slate-100 to-slate-50 border-r text-center">
                          <div className="h-px bg-slate-300 w-full"></div>
                        </TableCell>
                      ))}
                    </TableRow>

                    {/* Document items */}
                    {allDocumentItems.map((item, index) => (
                      <TableRow key={item.id} className="group bg-blue-50 hover:bg-blue-100">
                        <TableCell className="sticky left-0 bg-blue-50 group-hover:bg-blue-100 border-r z-[5] text-center text-sm font-semibold">
                          {index + 1}
                        </TableCell>
                        <TableCell className="sticky left-16 bg-blue-50 group-hover:bg-blue-100 border-r z-[5]">
                          <div className="flex items-center px-2">
                            <span className="text-sm font-semibold text-gray-800">
                              {item.name}
                            </span>
                            {item.type === 'field' && item.field.type && (
                              <span className="text-xs text-gray-400 ml-2">
                                ({item.field.type})
                                {item.field.required && <span className="text-red-500 ml-1">*</span>}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        {filteredTasks.map((task) => (
                          <TableCell key={`${item.id}-${task.id}`} className="text-center border p-1">
                            {renderDocumentStatus(task, item)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </>
                )}

                {/* Client Form Fields Section */}
                {allClientFieldItems.length > 0 && (
                  <>
                    <TableRow className="bg-gradient-to-r from-slate-100 to-slate-50 border-y-2 border-slate-300">
                      <TableCell className="sticky left-0 bg-gradient-to-r from-slate-100 to-slate-50 border-r z-[5] text-center font-bold text-slate-700">
                        <Users className="h-4 w-4 mx-auto" />
                      </TableCell>
                      <TableCell className="sticky left-16 bg-gradient-to-r from-slate-100 to-slate-50 border-r z-[5]">
                        <div className="flex items-center gap-2 px-2 py-2">
                          <Users className="h-5 w-5 text-slate-600" />
                          <span className="font-bold text-slate-700 text-lg">Client Form Fields</span>
                          <span className="text-sm bg-slate-200 text-slate-600 px-2 py-1 rounded-full ml-2">
                            {allClientFieldItems.length}
                          </span>
                        </div>
                      </TableCell>
                      {filteredTasks.map((task) => (
                        <TableCell key={`section-client-${task.id}`} className="bg-gradient-to-r from-slate-100 to-slate-50 border-r text-center">
                          <div className="h-px bg-slate-300 w-full"></div>
                        </TableCell>
                      ))}
                    </TableRow>

                    {/* Client field items */}
                    {allClientFieldItems.map((item, index) => (
                      <TableRow key={item.id} className="group bg-purple-50 hover:bg-purple-100">
                        <TableCell className="sticky left-0 bg-purple-50 group-hover:bg-purple-100 border-r z-[5] text-center text-sm text-purple-500">
                          {index + 1}
                        </TableCell>
                        <TableCell className="sticky left-16 bg-purple-50 group-hover:bg-purple-100 border-r z-[5]">
                          <div className="flex items-center px-2">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-700">
                                {item.name}
                              </span>
                              {item.field.type && (
                                <div className="flex items-center gap-1 mt-1">
                                  <span className="text-xs text-gray-400 bg-gray-100 px-1 py-0.5 rounded">
                                    {item.field.type}
                                  </span>
                                  {item.field.required && (
                                    <span className="text-xs text-red-500 bg-red-100 px-1 py-0.5 rounded">
                                      Required
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        {filteredTasks.map((task) => (
                          <TableCell key={`${item.id}-${task.id}`} className="text-center border p-1">
                            {renderClientFieldData(task, item)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </>
                )}
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
              <strong>{allDocumentItems.length}</strong> document items
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