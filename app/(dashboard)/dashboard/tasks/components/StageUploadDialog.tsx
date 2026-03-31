// @ts-nocheck
"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, Send, FileText, MessageSquare, Star, Eye, Check, FileUp, Trash2, CheckCircle2 } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { format, parseISO } from "date-fns"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { UploadModal } from "@/app/generic-components/UploadModal"
import { v4 as uuidv4 } from 'uuid'
import { performExtraction } from '@/lib/extractionUtils'
import supabase from "@/lib/supabase/client";
import {
  updateDocumentWorkflow,
  shouldTriggerWorkflowUpdate,
  WORKFLOW_OUTCOME_LABELS,
  TASK_STAGE_WORKFLOW_MAPPING,
  getWorkflowLogsForIndividual,
  setupWorkflowRealtimeSubscription,
  setupTaskRealtimeSubscription,
  cleanupRealtimeSubscriptions
} from "../utils/workflowSyncService";

const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[~`!@#$%^&*+=\[\]\\';,{}|":<>?]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase();
};

const transformKycFields = (fields: any[]): any[] => {
  if (!Array.isArray(fields)) return []
  return fields.map((field: any) => {
    const isArray = field.type === 'array' || field.isArray === true
    const fieldName = field.name || field.fieldName || '';
    const transformedField: any = {
      id: field.id || fieldName,
      fieldName: fieldName,
      name: fieldName,
      description: field.description || '',
      isRequired: field.isRequired !== false,
      fieldType: isArray ? 'array' : (field.type || field.fieldType || 'text'),
      parentField: field.parentField,
      isArray: isArray,
    }
    if (isArray && field.arrayConfig && Array.isArray(field.arrayConfig.fields)) {
      transformedField.arrayConfig = {
        maxItems: field.arrayConfig.maxItems,
        fields: transformKycFields(field.arrayConfig.fields)
      }
    }
    return transformedField
  })
}

const processExtractedData = (data: any, fields: any[]): any => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const result: Record<string, any> = {};

  fields.forEach((field, index) => {
    const fieldId = field.id;
    const fieldName = field.name || field.fieldName;

    if (!fieldName) {
      return;
    }

    const value = data[fieldId] !== undefined ? data[fieldId] :
      data[fieldName] !== undefined ? data[fieldName] :
        undefined;

    if (value !== undefined) {
      if (field.isArray && Array.isArray(value)) {
        result[fieldName] = value.map((item: any, itemIndex: number) => {
          if (field.arrayConfig?.fields) {
            return processExtractedData(item, field.arrayConfig.fields);
          }
          return item;
        });
      } else if (typeof value === 'object' && value !== null) {
        result[fieldName] = processExtractedData(value, field.fields || []);
      } else {
        result[fieldName] = value;
      }
    }
  });

  Object.entries(data).forEach(([key, value]) => {
    if (!(key in result)) {
      if (!fields.some(f => f.id === key)) {
        result[key] = value;
      }
    }
  });

  return result;
};

const isDocumentApplicableToTask = (doc: any, task: any, childContext: any = null) => {
  if (!doc.isSpecial) {
    return true;
  }

  if (doc.targetEntities?.length > 0) {
    const matchesTarget = doc.targetEntities.some((entity: any) => {
      const taskClassId = task.class_id?.toString();
      const taskSubdeptId = task.subdepartment_id?.toString();
      const entityClassId = entity.job_level?.class_id?.toString();
      const entitySubdeptId = entity.job_level?.subdepartment_id?.toString();
      const entityDeptId = entity.job_level?.department_id?.toString();

      const deptMatch = !entityDeptId || entityDeptId === task.department_id?.toString();
      if (!deptMatch) return false;

      const subdeptMatch = !entitySubdeptId || entitySubdeptId === taskSubdeptId;
      if (!subdeptMatch) return false;

      const classMatch = !entityClassId || entityClassId === taskClassId;
      if (!classMatch) return false;

      return true;
    });

    return matchesTarget;
  }

  const taskClassId = task.class_id?.toString();
  const taskSubdeptId = task.subdepartment?.id?.toString();
  const docClassId = doc.class_id?.toString();
  const docSubdeptId = doc.subdept_id?.toString();

  if (docClassId) {
    if (docClassId !== taskClassId) return false;
    if (docSubdeptId && docSubdeptId !== taskSubdeptId) return false;
    return true;
  }

  if (docSubdeptId) {
    return docSubdeptId === taskSubdeptId;
  }

  if (childContext?.childLevelId && childContext?.childLevelType) {
    const { childLevelId, childLevelType } = childContext;
    if (doc[`${childLevelType}_id`] && doc[`${childLevelType}_id`].toString() !== childLevelId) {
      return false;
    }
    if (childLevelType === 'subclass' && doc.class_id && doc.class_id.toString() !== taskClassId) return false;
    if (childLevelType === 'class' && doc.subdept_id && doc.subdept_id.toString() !== taskSubdeptId) return false;
  }

  if (doc.entityType === 'class' && doc.class_id) {
    const classMatch = taskClassId === doc.class_id.toString();
    if (doc.subdept_id) return classMatch && (taskSubdeptId === doc.subdept_id.toString());
    return classMatch;
  }

  if (doc.entityType === 'subdept' && doc.subdept_id) {
    return taskSubdeptId === doc.subdept_id.toString();
  }

  return false;
};

// --- Sub-Component: Document Tab Panel ---
const DocumentTabPanel = ({
  doc,
  task,
  individualName,
  existingDocs = [],
  isLocked,
  linkedDocInstanceId,
  kycData,
  activeDocFields,
  isSourceDocSelected,
  onUploadSuccess,
  onPreviewExisting,
  onUseExistingLink,
  messageState,
  onMessageStateChange,
  workflowDocuments = {}
}) => {
  const [useExisting, setUseExisting] = useState(false);
  const [selectedExistingId, setSelectedExistingId] = useState("");
  const [messageText, setMessageText] = useState(messageState || "");
  const [isConverting, setIsConverting] = useState(false);
  const [generatedFile, setGeneratedFile] = useState<File | null>(null);

  useEffect(() => {
    setMessageText(messageState || "");
  }, [messageState]);

  const handleMessageTextChange = (value: string) => {
    setMessageText(value);
    onMessageStateChange?.(doc.id, value);
  };

  useEffect(() => {
    if (isLocked && linkedDocInstanceId) {
      setUseExisting(true);
      setSelectedExistingId(linkedDocInstanceId);
    }
  }, [isLocked, linkedDocInstanceId]);

  const documentName = kycData?.display_name || kycData?.name || doc.name || 'Document';
  const inputType = doc.inputType || (doc.isSpecial ? 'file' : 'both');

  const handleConvertAndUpload = async () => {
    if (!messageText.trim()) return;
    setIsConverting(true);

    try {
      const response = await fetch('/api/convert-message-to-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          documentType: documentName
        })
      });

      if (!response.ok) throw new Error('Failed to convert text to PDF');

      const blob = await response.blob();
      const fileName = `${documentName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
      const file = new File([blob], fileName, { type: 'application/pdf' });

      setGeneratedFile(file);

      toast({
        title: 'Success',
        description: 'PDF generated successfully. Review the document below.',
      });
    } catch (error) {
      console.error('Conversion error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to convert text to PDF',
        variant: 'destructive',
      });
    } finally {
      setIsConverting(false);
    }
  };

  const handlePendingChange = useCallback((docs: any[]) => {
    if (docs && docs.length > 0) {
      // Only extract docs that are fully validated and extracted successfully
      const readyDocs = docs.filter(d =>
        (d.validationStatus === 'valid' || d.validationStatus === 'warning') &&
        d.extractedData && Object.keys(d.extractedData).length > 0
      );

      if (readyDocs.length > 0) {
        onUploadSuccess({ files: readyDocs }, doc);
      } else {
        onUploadSuccess(null, doc);
      }
    } else {
      onUploadSuccess(null, doc);
    }
  }, [doc, onUploadSuccess]);

  const selectedDocMemo = useMemo(() => ({
    id: doc.kycId,
    name: documentName,
    display_name: documentName,
    fields: activeDocFields
  }), [doc.kycId, documentName, activeDocFields]);

  const selectedMemberMemo = useMemo(() => ({
    id: task?.individual_id,
    name: individualName,
    full_name: individualName
  }), [task?.individual_id, individualName]);

  const additionalFieldsMemo = useMemo(() => ({ expiry_date: null, isFormContext: true }), []);

  const handleClose = useCallback(() => { }, []);
  const handleSuccess = useCallback((newDoc: any) => {
    setGeneratedFile(null);
    setMessageText("");
  }, []);

  const handleExternalFileClear = useCallback(() => setGeneratedFile(null), []);

  const handleBeforeUpload = useCallback(async (recordData: any) => {
    if (doc.onBeforeUpload) return doc.onBeforeUpload(recordData);
    return null;
  }, [doc]);

  return (
    <div className="space-y-4 p-4 rounded-lg border h-full overflow-y-auto">
      {(existingDocs.length > 0 || isLocked) && (
        <div className={`mb-4 p-4 rounded-lg border ${isLocked ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
          <div className="flex-1">
            <h4 className={`text-sm font-medium mb-2 ${isLocked ? 'text-green-900' : 'text-blue-900'}`}>
              {isLocked ? "Linked Source Document" : `Existing Documents (${existingDocs.length})`}
            </h4>

            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id={`use-existing-${doc.id}`}
                checked={useExisting}
                onChange={(e) => !isLocked && setUseExisting(e.target.checked)}
                disabled={isLocked}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <Label htmlFor={`use-existing-${doc.id}`} className={`text-sm font-medium ${isLocked ? 'text-green-800' : 'text-blue-800'}`}>
                {isLocked ? "This document is linked as the source" : "Use existing document"}
              </Label>
            </div>

            {useExisting && (
              <div className="ml-6 space-y-2">
                <RadioGroup value={selectedExistingId} onValueChange={(val) => !isLocked && setSelectedExistingId(val)}>
                  {existingDocs.map((ed) => {
                    const isSelected = selectedExistingId === ed.id;
                    const fileName = ed.file_path?.split('/').pop() || documentName;
                    return (
                      <div key={ed.id} className={`flex items-center gap-3 p-2 border rounded transition-colors ${isSelected ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50'}`}>
                        <RadioGroupItem
                          value={ed.id}
                          id={ed.id}
                          disabled={isLocked}
                          className={`${isLocked ? 'opacity-50' : ''}`}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={ed.id} className="text-sm cursor-pointer">{fileName}</Label>
                            {isSourceDocSelected(ed.id) && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                Source
                              </span>
                            )}
                            {workflowDocuments[ed.id] && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                {workflowDocuments[ed.id].workflowOutcome || 'Workflow Document'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{format(parseISO(ed.created_at), 'dd MMM yyyy')}</p>
                          {workflowDocuments[ed.id] && (
                            <p className="text-xs text-slate-400 mt-1">
                              Workflow: {workflowDocuments[ed.id].workflowAction} - {format(parseISO(workflowDocuments[ed.id].created_at), 'dd MMM yyyy')}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-500 hover:text-gray-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPreviewExisting(ed, kycData);
                          }}
                          type="button"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </RadioGroup>

                {!isLocked && selectedExistingId && (
                  <Button
                    onClick={() => onUseExistingLink(doc.id, selectedExistingId, doc.kycId)}
                    className="ml-6 mt-2"
                    size="sm"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Use Selected
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {isLocked ? (
        <div className="text-center p-6 bg-slate-50 border-dashed border-2 border-slate-200 rounded-lg">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40 text-slate-500" />
          <p className="font-medium text-slate-700">Stage Locked</p>
        </div>
      ) : !useExisting && (
        <>
          {activeDocFields ? (
            <UploadModal
              isOpen={true}
              renderAsDialog={false}
              showSaveButton={false}
              onClose={handleClose}
              documentName={documentName}
              documentFields={activeDocFields}
              selectedDoc={selectedDocMemo}
              selectedMember={selectedMemberMemo}
              entityId={task?.individual_id}
              entityName={individualName}
              onSuccess={handleSuccess}
              targetTable="acc_portal_directors_documents"
              idFieldName="director_id"
              documentIdFieldName="document_id"
              isCompanyUpload={false}
              additionalFields={additionalFieldsMemo}
              externalFile={generatedFile}
              onExternalFileClear={handleExternalFileClear}
              onBeforeUpload={handleBeforeUpload}
              onPendingChange={handlePendingChange} // <--- Added missing link here
            />
          ) : (
            <div className="flex justify-center p-10 text-muted-foreground">
              Initializing fields...
              <br />
              <small className="text-xs mt-2">
                Doc KYC ID: {doc.kycId || 'missing'} |
                Task ID: {task?.id || 'missing'} |
                Individual ID: {task?.individual_id || 'missing'}
              </small>
            </div>
          )}

          {(inputType === 'message' || inputType === 'both') && (
            <div className="mt-6 pt-6 border-t space-y-4">
              <Label className="font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Write Message & Convert to PDF
              </Label>

              <Textarea
                placeholder={`Type your message here...`}
                className="min-h-[120px] resize-none font-mono text-sm"
                value={messageText}
                onChange={(e) => handleMessageTextChange(e.target.value)}
              />

              <div className="flex gap-2">
                <Button
                  onClick={handleConvertAndUpload}
                  disabled={!messageText.trim() || isConverting}
                  variant="outline"
                  className="w-full border-dashed border-2 hover:bg-slate-50"
                >
                  {isConverting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  {isConverting ? 'Generating PDF...' : 'Convert to PDF & Review'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                This will convert your text into a PDF and open the document preview for final verification.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export function StageUploadDialog({
  open,
  onOpenChange,
  selectedStageTask,
  onTaskAction,
  onStageCompleted
}: any) {
  const [activeDocumentTab, setActiveDocumentTab] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [kycDocuments, setKycDocuments] = useState<Map<string, any>>(new Map());
  const [existingDocuments, setExistingDocuments] = useState<Record<string, any[]>>({});
  const [docFieldsMap, setDocFieldsMap] = useState<Record<string, any[]>>({});
  const [lockedDocuments, setLockedDocuments] = useState<Record<string, boolean>>({});
  const [linkedDocuments, setLinkedDocuments] = useState<Record<string, any>>({});
  const [pendingDocuments, setPendingDocuments] = useState<Record<string, any>>({});
  const [selectedSourceDocs, setSelectedSourceDocs] = useState<Record<string, any[]>>({ selected: [] });
  const [workflowDocuments, setWorkflowDocuments] = useState<Record<string, any>>({});
  const [realtimeSubscriptions, setRealtimeSubscriptions] = useState<any[]>([]);
  const [previewState, setPreviewState] = useState({
    isOpen: false,
    loading: false,
    data: null as any
  });

  const [tabMessageStates, setTabMessageStates] = useState<Record<string, string>>({});

  const { task, stage } = selectedStageTask || {};

  const jobLevelDisplay = useMemo(() => {
    if (!task?.job_description) return '';
    return `${task.job_description}`;
  }, [task]);

  useEffect(() => {
    if (open && task?.source_document_id) {
      setSelectedSourceDocs(prev => ({
        ...prev,
        ...(typeof task.source_document_id === 'object' ? task.source_document_id : {})
      }));
    }
  }, [open, task?.source_document_id]);

  const isDocSelectedAsSource = useCallback((docId: string) => {
    return Boolean(selectedSourceDocs[stage?.id || '']?.some(doc => doc.id === docId));
  }, [selectedSourceDocs, stage?.id]);

  const isDocumentLocked = useCallback((docId: string) => {
    return Boolean(lockedDocuments[docId]);
  }, [lockedDocuments]);

  const applicableDocuments = useMemo(() => {
    if (!stage?.documents || !task) return [];
    const childContext = {
      childLevelId: selectedStageTask.childLevelId,
      childLevelType: selectedStageTask.childLevelType
    };
    return stage.documents.filter((doc: any) => isDocumentApplicableToTask(doc, task, childContext));
  }, [stage, task, selectedStageTask?.childLevelId]);

  const individualName = useMemo(() =>
    task?.applicant_name || task?.principal_member_name || 'Individual',
    [task]);

  useEffect(() => {
    if (open && applicableDocuments.length > 0 && !activeDocumentTab) {
      const firstDocId = applicableDocuments[0]?.id;
      if (firstDocId) {
        setActiveDocumentTab(firstDocId);
      }
    }
  }, [open, applicableDocuments.length]);

  useEffect(() => {
    if (!open) {
      const resetStates = () => {
        setActiveDocumentTab('');
        setPreviewState({ isOpen: false, data: null, loading: false });
        setPendingDocuments({});
        setTabMessageStates({});
      };
      requestAnimationFrame(() => resetStates());
    }
  }, [open]);

  useEffect(() => {
    if (!open || !stage?.documents || !task?.individual_id) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const uniqueKycIds = [...new Set(applicableDocuments
          .map((d: any) => d.kycId)
          .filter(Boolean))];

        const promises: Promise<any>[] = [];

        if (uniqueKycIds.length > 0) {
          promises.push(
            supabase
              .from('acc_portal_kyc')
              .select('id, fields, name, display_name, document_type')
              .in('id', uniqueKycIds)
          );
        } else {
          promises.push(Promise.resolve({ data: [] }));
        }

        promises.push(
          supabase
            .from('acc_portal_directors_documents')
            .select('*')
            .eq('director_id', task.individual_id)
            .order('created_at', { ascending: false })
        );

        // NEW: Fetch workflow logs to understand existing workflow documents
        promises.push(
          getWorkflowLogsForIndividual(task.individual_id).then(logs => ({ data: logs }))
        );

        const [kycRes, userDocsRes, workflowRes] = await Promise.all(promises);

        const newKycMap = new Map();
        const newDocFieldsMap: Record<string, any[]> = {};
        const workflowDocMap: Record<string, any> = {};

        if (kycRes.data) {
          kycRes.data.forEach((kycData: any) => {
            const transformed = { ...kycData, fields: transformKycFields(kycData.fields || []) };
            newKycMap.set(kycData.id, transformed);
          });
        }

        applicableDocuments.forEach((doc: any) => {
          let fields = [];
          if (doc.kycId && newKycMap.has(doc.kycId)) {
            const kycDoc = newKycMap.get(doc.kycId);
            if (kycDoc.fields) {
              fields = kycDoc.fields.map((field: any) => ({
                id: field.id || field.fieldName,
                name: field.fieldName,
                type: field.fieldType,
                required: field.isRequired,
                description: field.description,
                isArray: field.isArray,
                arrayConfig: field.arrayConfig
              }));
            }
          } else if (doc.extractionSpecs) {
            fields = doc.extractionSpecs.map((spec: any) => ({
              id: spec.id || spec.fieldName || `field-${Date.now()}`,
              name: spec.fieldName || spec.name || 'Field',
              type: spec.fieldType || 'text',
              required: spec.required || false,
              isArray: spec.isArray || false
            }));
          }
          newDocFieldsMap[doc.id] = fields;
        });

        // Process workflow documents to understand existing workflow context
        if (workflowRes.data) {
          workflowRes.data.forEach((log: any) => {
            // Check if this log represents a completed workflow
            const isCompleted = log.resolutions && log.resolutions.length > 0;

            // For completed workflows, use the resolution outcome
            if (isCompleted && log.resolutions[0]) {
              workflowDocMap[log.uploaded_doc_id] = {
                ...log,
                isWorkflowDocument: true,
                workflowAction: log.action_type,
                workflowOutcome: log.resolutions[0].outcome,
                isCompleted: true
              };
            }
            // Also track the document type for workflow detection
            if (log.document_type_id) {
              workflowDocMap[log.document_type_id] = {
                ...log,
                isWorkflowDocument: true,
                workflowAction: log.action_type,
                workflowOutcome: isCompleted ? log.resolutions[0].outcome : log.action_type,
                isCompleted: isCompleted
              };
            }
          });
        }

        const groupedDocs: Record<string, any[]> = {};
        if (userDocsRes.data) {
          applicableDocuments.forEach((stageDoc: any) => {
            if (stageDoc.kycId) {
              const matching = userDocsRes.data.filter((d: any) => d.document_id === stageDoc.kycId);
              if (matching.length > 0) groupedDocs[stageDoc.id] = matching;
            }
          });
        }

        setKycDocuments(newKycMap);
        setDocFieldsMap(newDocFieldsMap);
        setExistingDocuments(groupedDocs);
        setWorkflowDocuments(workflowDocMap);

      } catch (error) {
        console.error("Error initializing stage upload dialog:", error);
        toast({ title: "Error loading data", description: "Please close and try again.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [open, stage?.documents, task?.individual_id, applicableDocuments]);

  useEffect(() => {
    if (!stage?.id || !applicableDocuments.length || !task?.id) return;

    const checkLockedDocuments = async () => {
      const { data: taskData } = await supabase
        .from('tm_tasks_duplicate')
        .select('source_document_id')
        .eq('id', task.id)
        .single();

      if (taskData?.source_document_id) {
        const newLockedDocs = { ...lockedDocuments };
        const newLinkedDocs = { ...linkedDocuments };

        applicableDocuments.forEach((doc: any) => {
          const docInstance = taskData.source_document_id[stage.id]?.find(
            (d: any) => d.document_id === doc.kycId
          );

          if (docInstance) {
            newLockedDocs[doc.id] = true;
            newLinkedDocs[doc.id] = docInstance;
          } else {
            newLockedDocs[doc.id] = false;
          }
        });

        setLockedDocuments(newLockedDocs);
        setLinkedDocuments(newLinkedDocs);
      }
    };

    checkLockedDocuments();
  }, [stage?.id, task?.id, JSON.stringify(applicableDocuments)]);

  const handleDocumentSelection = useCallback((docId: string, docInstanceId: string, kycId: string) => {
    if (!stage?.id || !task?.id) return;

    const currentDate = new Date().toISOString();
    const docToAdd = {
      id: docInstanceId,
      document_id: kycId,
      linked_at: currentDate,
      updated_at: currentDate
    };

    setPendingDocuments(prev => ({
      ...prev,
      [docId]: docToAdd
    }));
  }, [stage?.id, task?.id]);

  const saveAllDocuments = useCallback(async () => {
    if (!stage?.id || !task?.id) {
      toast({ title: 'Error', description: 'Missing stage or task information', variant: 'destructive' });
      return;
    }
    setIsSaving(true);

    try {
      const currentDate = new Date().toISOString();
      const updatedLinkedDocs = { ...linkedDocuments };
      const updatedLockedDocs = { ...lockedDocuments };
      const updatedSourceDocs = { ...selectedSourceDocs };
      const uploadedDocIds = new Set<string>();

      for (const [docId, docData] of Object.entries(pendingDocuments)) {
        if (!docData) continue;

        // Extract base ID to retrieve configurations
        const baseDocId = docId.split('_')[0];
        const docConfig = applicableDocuments.find(doc => doc.id === baseDocId);
        if (!docConfig) continue;

        try {
          const file = docData.file;
          let filePath = '';
          let documentId = docData.id || '';

          if (file) {
            const sanitizedFilename = sanitizeFilename(file.name);
            filePath = `individual-documents/${task.individual_id}/${docConfig.kycId}/${sanitizedFilename}`;

            const { error: uploadError } = await supabase.storage
              .from('kyc-documents')
              .upload(filePath, file, {
                cacheControl: '3600',
                upsert: true,
                contentType: file.type || 'application/octet-stream'
              });

            if (uploadError) throw uploadError;
          } else {
            filePath = docData.file_path || '';
          }

          let insertedDoc;
          if (file) {
            const rawDetails = docData.extractedData || {};
            const cleanedDetails = {};
            const fieldIdToName = new Map();
            const validFieldNames = new Set();

            const collectFieldInfo = (fields) => {
              if (!Array.isArray(fields)) return;
              fields.forEach(field => {
                if (field.id && field.name) fieldIdToName.set(field.id, field.name);
                if (field.name) validFieldNames.add(field.name);

                if (field.fields) collectFieldInfo(field.fields);
                if (field.arrayConfig?.fields) collectFieldInfo(field.arrayConfig.fields);
              });
            };

            const fullDocFields = docFieldsMap[baseDocId];
            if (fullDocFields) {
              collectFieldInfo(fullDocFields);
            }

            Object.entries(rawDetails).forEach(([key, value]) => {
              if (fieldIdToName.has(key)) {
                cleanedDetails[fieldIdToName.get(key)] = value;
              } else if (validFieldNames.has(key)) {
                cleanedDetails[key] = value;
              } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
                cleanedDetails[key] = value;
              }
            });

            const { data: newDoc, error: insertError } = await supabase
              .from('acc_portal_directors_documents')
              .insert([{
                director_id: task.individual_id,
                document_id: docConfig.kycId,
                extracted_details: cleanedDetails,
                status: 'active',
                file_path: filePath,
                created_at: currentDate,
                updated_at: currentDate
              }])
              .select()
              .single();

            if (insertError) throw insertError;
            insertedDoc = newDoc;
            documentId = newDoc.id;
          } else if (docData.id) {
            insertedDoc = { id: docData.id };
            documentId = docData.id;
          }

          updatedLinkedDocs[docId] = {
            id: documentId,
            document_id: docConfig.kycId,
            linked_at: docData.linked_at || currentDate,
            updated_at: currentDate
          };
          updatedLockedDocs[baseDocId] = true;
          uploadedDocIds.add(docId);

          if (!updatedSourceDocs[stage.id]) {
            updatedSourceDocs[stage.id] = [];
          }
          updatedSourceDocs[stage.id] = [
            ...(updatedSourceDocs[stage.id]?.filter((d: any) => d.document_id !== docConfig.kycId) || []),
            {
              id: insertedDoc.id,
              document_id: docConfig.kycId,
              linked_at: currentDate,
              status: 'uploaded',
              linked_document_id: insertedDoc.id,
            }
          ];

        } catch (error) {
          console.error(`Error processing document ${docId}:`, error);
          continue;
        }
      }

      const STATUS_PRIORITY: Record<string, number> = {
        'pending': 0, 'new': 0, 'enquiry': 0,
        'in_progress': 1,
        'write_up_completed': 2,
        'endorsed': 3
      };

      const STAGE_STATUS_MAPPING: Record<string, string> = {
        'a19b270e-6d1e-4e6d-b2bc-f21db72cde08': 'in_progress',
        '072b9710-45df-4a05-ba65-01b4ef29d61d': 'write_up_completed',
        '6625f6d2-8017-4bf4-96c2-85335703164c': 'endorsed',
        'caefd742-5de5-4341-a3bb-81d7b9dd2b73': 'endorsed'
      };

      const normalizeStatus = (s: string | null | undefined) => {
        if (!s) return 'pending';
        return s.toLowerCase().trim().replace(/[\s-]/g, '_');
      };

      const currentStatusRaw = task.status;
      const currentStatusKey = normalizeStatus(currentStatusRaw);
      const potentialNewStatus = STAGE_STATUS_MAPPING[stage.id];

      let taskStatusUpdate = {};

      if (potentialNewStatus) {
        const currentPriority = STATUS_PRIORITY[currentStatusKey] ?? 0;
        const newPriority = STATUS_PRIORITY[potentialNewStatus] ?? 0;

        if (newPriority > currentPriority) {
          taskStatusUpdate = { status: potentialNewStatus };
        }
      }

      const updatedStages = {
        ...task.stages,
        [stage.id]: {
          ...task.stages?.[stage.id],
          status: 'completed',
          date: currentDate.split('T')[0],
          completedAt: currentDate,
          documentsUploaded: Object.keys(updatedLinkedDocs).length,
          lastUpdated: currentDate,
          documents: {
            ...(task.stages?.[stage.id]?.documents || {}),
            ...Object.fromEntries(
              Array.from(uploadedDocIds).map(docId => {
                const baseDocId = docId.split('_')[0];
                const docConfig = applicableDocuments.find(doc => doc.id === baseDocId);
                return [docId, {
                  id: updatedLinkedDocs[docId]?.id,
                  document_id: docConfig?.kycId,
                  name: docConfig?.name || 'document',
                  linked_at: currentDate,
                  status: 'linked'
                }];
              })
            )
          }
        }
      };

      const updateData = {
        ...taskStatusUpdate,
        stages: updatedStages,
        source_document_id: updatedSourceDocs,
        updated_at: currentDate
      };

      const { error: updateError } = await supabase
        .from('tm_tasks_duplicate')
        .update(updateData)
        .eq('id', task.id);

      if (updateError) throw updateError;

      const successMsg = ('status' in taskStatusUpdate)
        ? `Documents saved & Status updated to ${taskStatusUpdate.status}`
        : `Successfully uploaded ${uploadedDocIds.size} document(s)`;

      const updatedTask = {
        ...task,
        ...taskStatusUpdate,
        stages: updatedStages,
        source_document_id: updatedSourceDocs,
        updated_at: currentDate
      };

      toast({
        title: 'Success',
        description: successMsg,
        variant: 'default'
      });

      onTaskAction?.({
        type: 'task-updated',
        taskId: task.id,
        task: updatedTask,
        stageId: stage.id,
        source: 'stage-upload'
      });

      // NEW: Update document workflow if this stage should trigger it
      if (shouldTriggerWorkflowUpdate(stage.id)) {
        try {
          // Get the final uploaded document for this stage
          const finalDocId = uploadedDocIds.size > 0 ?
            Object.values(updatedLinkedDocs).find(doc => doc)?.id : null;

          // Check if there's already a completed workflow for this document type
          const existingWorkflowDoc = Object.values(workflowDocuments).find(
            (doc: any) => {
              // Check for completed workflows by looking at resolutions
              return doc.document_type_id === task.linked_document_type_id &&
                doc.isCompleted === true &&
                ['renewed_by_client', 'task_completed', 'task_endorsed'].includes(doc.workflowOutcome)
            }
          );

          let workflowOutcome = WORKFLOW_OUTCOME_LABELS[TASK_STAGE_WORKFLOW_MAPPING[stage.id]];

          // If there's already a completed workflow, use a more specific outcome
          if (existingWorkflowDoc && stage.id === 'writeup_completed') {
            workflowOutcome = 'Document Write-up Updated';
          }

          const workflowResult = await updateDocumentWorkflow(
            task.id,
            stage.id,
            finalDocId,
            workflowOutcome
          );

          if (workflowResult.success) {
            toast({
              title: 'Workflow Updated',
              description: `Document workflow updated: ${workflowResult.data.outcome}`,
              variant: 'default'
            });
          } else {
            console.error('Workflow update failed:', workflowResult.error);
            toast({
              title: 'Workflow Update Failed',
              description: 'Task was saved but workflow update failed',
              variant: 'destructive'
            });
          }
        } catch (workflowError) {
          console.error('Error updating workflow:', workflowError);
          toast({
            title: 'Workflow Update Error',
            description: 'Task was saved but workflow update encountered an error',
            variant: 'destructive'
          });
        }
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error saving documents:', error);
      toast({
        title: 'Error',
        description: 'Failed to save documents. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  }, [stage, task, pendingDocuments, linkedDocuments, selectedSourceDocs, onTaskAction, onOpenChange, applicableDocuments, lockedDocuments, docFieldsMap]);

  const handleUploadSuccess = useCallback((newDocument: any, originatingDoc: any) => {
    if (!originatingDoc?.id) return;

    setPendingDocuments(prev => {
      const updated = { ...prev };

      // Remove any existing files for THIS specific tab so we don't accumulate stale documents 
      // if the user drops a new file or deletes one.
      Object.keys(updated).forEach(key => {
        if (key === originatingDoc.id || key.startsWith(`${originatingDoc.id}_`)) {
          delete updated[key];
        }
      });

      // If document payload is cleared entirely
      if (!newDocument || Object.keys(newDocument).length === 0 || (newDocument.files && newDocument.files.length === 0)) {
        return updated;
      }

      // Add fresh documents sent from UploadModal back in
      if (newDocument.files && Array.isArray(newDocument.files)) {
        newDocument.files.forEach((fileData: any, index: number) => {
          if (fileData.file && fileData.extractedData) {
            const docId = `${originatingDoc.id}_${index}`;
            updated[docId] = {
              ...fileData,
              id: docId,
              document_id: originatingDoc.kycId,
              kycId: originatingDoc.kycId,
              name: originatingDoc.name
            };
          }
        });
      } else {
        updated[originatingDoc.id] = {
          ...newDocument,
          kycId: originatingDoc.kycId,
          name: originatingDoc.name
        };
      }

      return updated;
    });
  }, []);

  const handleUseExisting = useCallback((docConfigId: string, existingDocId: string, kycId: string) => {
    handleDocumentSelection(docConfigId, existingDocId, kycId);
  }, [handleDocumentSelection]);

  const handlePreview = useCallback(async (document: any, kycData: any) => {
    if (!kycData) return;
    setPreviewState(prev => ({ ...prev, isOpen: true, loading: true }));
    try {
      const bucketName = 'kyc-documents';
      const filePath = document.file_path?.startsWith(bucketName) ? document.file_path : `${bucketName}/${document.file_path}`;
      const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
      const fileName = document.file_path?.split('/').pop() || kycData.name;
      const fields = transformKycFields(kycData.fields || []);
      const processedData = processExtractedData(document.extracted_details || {}, fields);

      setPreviewState({
        isOpen: true,
        loading: false,
        data: {
          documentId: document.id,
          documentName: kycData.display_name || kycData.name,
          fileUrl,
          fileName,
          extractedData: processedData,
          fields,
          type: kycData.document_type || 'document',
          file: { name: fileName, url: fileUrl, type: fileName.split('.').pop() }
        }
      });
    } catch (error) {
      console.error('Preview error', error);
      toast({ title: "Error", description: "Failed to load preview", variant: "destructive" });
      setPreviewState(prev => ({ ...prev, isOpen: false, loading: false }));
    }
  }, []);

  if (!selectedStageTask) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[1800px] max-h-[95vh] flex flex-col p-0 gap-0">
          <div className="p-6 border-b flex justify-between items-center">
            <div className="flex-1">
              <DialogHeader>
                <DialogTitle className="flex justify-between">
                  <div>
                    <h2>Upload {stage?.name} for {individualName}</h2>
                    {jobLevelDisplay && (
                      <p className="text-sm text-muted-foreground mt-1">{jobLevelDisplay}</p>
                    )}
                  </div>
                  <div>
                    {applicableDocuments.some((doc: any) => doc.isSpecial) && (
                      <div className="p-2 flex gap-3">
                        <Star className="h-5 w-5 text-amber-600 flex-shrink-0" />
                        <p className="text-sm text-amber-700">
                          Special requirements apply to some documents
                        </p>
                      </div>
                    )}
                  </div>
                </DialogTitle>
                <DialogDescription>
                  Upload required documents or select existing ones to complete this stage.
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="flex items-center gap-2">
              {Object.keys(pendingDocuments).length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {Object.keys(pendingDocuments).length} document(s) pending save
                </span>
              )}
              <Button
                disabled={Object.keys(pendingDocuments).length === 0 || isSaving}
                onClick={saveAllDocuments}
                className="ml-4"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  `Save All (${Object.keys(pendingDocuments).length})`
                )}
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            <Tabs value={activeDocumentTab} onValueChange={setActiveDocumentTab} className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 pt-2 border-b bg-muted/10">
                <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-transparent gap-2">
                  {applicableDocuments.map((doc: any) => {
                    const kycDoc = kycDocuments.get(doc.kycId);
                    const displayName = kycDoc?.display_name || doc.name || 'Document';
                    return (
                      <TabsTrigger
                        key={doc.id}
                        value={doc.id}
                        className="relative px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-border"
                      >
                        {displayName}
                        {isDocumentLocked(doc.id) && (
                          <Check className="h-4 w-4 ml-2 text-green-600" />
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              <div className="flex-1 overflow-auto relative bg-slate-50/50">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  applicableDocuments.map((doc: any) => (
                    <div
                      key={doc.id}
                      className={`h-full overflow-y-auto p-6 ${activeDocumentTab === doc.id ? 'block' : 'hidden'}`}
                    >
                      <DocumentTabPanel
                        doc={doc}
                        task={task}
                        individualName={individualName}
                        existingDocs={existingDocuments[doc.id] || []}
                        isLocked={isDocumentLocked(doc.id)}
                        linkedDocInstanceId={isDocumentLocked(doc.id) ? linkedDocuments[doc.id]?.id : null}
                        kycData={doc.kycId ? kycDocuments.get(doc.kycId) : null}
                        activeDocFields={docFieldsMap[doc.id]}
                        isSourceDocSelected={isDocSelectedAsSource}
                        onUploadSuccess={(newDoc) => handleUploadSuccess(newDoc, doc)}
                        onPreviewExisting={handlePreview}
                        onUseExistingLink={handleUseExisting}
                        messageState={tabMessageStates[doc.id]}
                        onMessageStateChange={(docId, message) => setTabMessageStates(prev => ({ ...prev, [docId]: message }))}
                        workflowDocuments={workflowDocuments}
                      />
                    </div>
                  ))
                )}
              </div>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={previewState.isOpen} onOpenChange={(v) => setPreviewState(p => ({ ...p, isOpen: v }))}>
        <DialogContent className="max-w-[1800px] max-h-[95vh] overflow-y-auto">
          {previewState.loading ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin h-10 w-10" /></div>
          ) : previewState.data ? (
            <ExtractionPreview
              {...previewState.data}
              expanded={true}
              showSaveButton={false}
              fieldsPromise={Promise.resolve(previewState.data.fields)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
