// @ts-nocheck
"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, Send, FileText, MessageSquare, Star, Eye, Check } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { format, parseISO } from "date-fns"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { UploadModal } from "@/app/generic-components/UploadModal"

// --- Helper Functions ---

const transformKycFields = (fields: any[]): any[] => {
  if (!Array.isArray(fields)) return []
  return fields.map((field: any) => {
    const isArray = field.type === 'array' || field.isArray === true
    const transformedField: any = {
      id: field.id || field.fieldName || '',
      fieldName: field.name || field.fieldName || '',
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
  if (!data || typeof data !== 'object') return data;
  const result = { ...data };
  fields.forEach(field => {
    const fieldId = field.id || field.fieldName;
    if (field.isArray && Array.isArray(result[fieldId])) {
      result[fieldId] = result[fieldId].map((item: any) => {
        if (field.arrayConfig?.fields) {
          return processExtractedData(item, field.arrayConfig.fields);
        }
        return item;
      });
    } else if (typeof result[fieldId] === 'object' && result[fieldId] !== null) {
      result[fieldId] = processExtractedData(result[fieldId], field.fields || []);
    }
  });
  return result;
};

// Filter documents applicable to the current task context
const isDocumentApplicableToTask = (doc: any, task: any, childContext: any = null) => {
  if (!doc.isSpecial) return true;

  if (doc.targetEntities?.length > 0) {
    const matchesTarget = doc.targetEntities.some((entity: any) => {
      const classMatch = entity.class_id ? entity.class_id.toString() === task.class_id?.toString() : true;
      const subdeptMatch = entity.subdept_id ? entity.subdept_id.toString() === task.subdepartment?.id?.toString() : true;
      return classMatch && subdeptMatch;
    });
    if (!matchesTarget) return false;
    return true;
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
}

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
  onToggleSourceDoc,
  onUploadSuccess,
  onPreviewExisting,
  onUseExistingLink
}) => {
  const [useExisting, setUseExisting] = useState(false);
  const [selectedExistingId, setSelectedExistingId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync with locked state
  useEffect(() => {
    if (isLocked && linkedDocInstanceId) {
      setUseExisting(true);
      setSelectedExistingId(linkedDocInstanceId);
    }
  }, [isLocked, linkedDocInstanceId]);

  const documentName = kycData?.display_name || kycData?.name || doc.name || 'Document';
  const inputType = doc.inputType || (doc.isSpecial ? 'file' : 'both');

  const handleMessageSubmit = async () => {
    if (!messageText.trim()) return;
    setIsProcessing(true);
    try {
      const response = await fetch('/api/convert-message-to-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText, documentType: 'message', documentName })
      });

      if (!response.ok) throw new Error('Conversion failed');
      const blob = await response.blob();
      toast({ title: 'Success', description: 'Message converted to PDF. Please upload using the file upload option.' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to process message', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4 p-4 rounded-lg border h-full overflow-y-auto">
      {/* Existing Documents Section */}
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
                        <div className="flex items-center gap-2">
                          <RadioGroupItem
                            value={ed.id}
                            id={ed.id}
                            disabled={isLocked}
                            className={`${isLocked ? 'opacity-50' : ''}`}
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isLocked) {
                                onToggleSourceDoc(ed.id, doc.kycId, !isSourceDocSelected(ed.id));
                              }
                            }}
                            className={`flex items-center justify-center h-5 w-5 rounded border ${isSourceDocSelected(ed.id) ? 'bg-blue-100 border-blue-500' : 'border-gray-300'} ${isLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-blue-50'}`}
                            disabled={isLocked}
                            aria-label={isSourceDocSelected(ed.id) ? 'Unlink as source document' : 'Link as source document'}
                          >
                            {isSourceDocSelected(ed.id) && (
                              <Check className="h-3.5 w-3.5 text-blue-600" />
                            )}
                          </button>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={ed.id} className="text-sm cursor-pointer">{fileName}</Label>
                            {isSourceDocSelected(ed.id) && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                Source
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{format(parseISO(ed.created_at), 'dd MMM yyyy')}</p>
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
                    disabled={isProcessing}
                    className="ml-6 mt-2"
                    size="sm"
                  >
                    {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                    Use Selected
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Upload / Message Section */}
      {isLocked ? (
        <div className="text-center p-6 bg-slate-50 border-dashed border-2 border-slate-200 rounded-lg">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40 text-slate-500" />
          <p className="font-medium text-slate-700">Stage Locked</p>
        </div>
      ) : !useExisting && (
        <>
          {activeDocFields ? (
            <UploadModal
              documentName={documentName}
              documentFields={activeDocFields}
              selectedDoc={{ id: doc.kycId, name: documentName, display_name: documentName, fields: activeDocFields }}
              selectedMember={{ id: task?.individual_id, name: individualName, full_name: individualName }}
              entityId={task?.individual_id}
              entityName={individualName}
              onSuccess={(newDoc) => onUploadSuccess(newDoc, doc)}
              targetTable="acc_portal_directors_documents"
              idFieldName="director_id"
              documentIdFieldName="document_id"
              isCompanyUpload={false}
              additionalFields={{ expiry_date: null }}
              onBeforeUpload={async (recordData) => {
                if (doc.onBeforeUpload) return doc.onBeforeUpload(recordData);
                return null;
              }}
            />
          ) : (
            <div className="flex justify-center p-10 text-muted-foreground">Initializing fields...</div>
          )}

          {(inputType === 'message' || inputType === 'both') && (
            <div className="mt-4 pt-4 border-t">
              <Label className="font-medium flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4" />
                Submit Message as PDF
              </Label>
              <Textarea
                placeholder={`Type message...`}
                className="min-h-[100px] resize-none mb-2"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />
              <Button onClick={handleMessageSubmit} disabled={!messageText.trim() || isProcessing} variant="outline" className="w-full">
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Submit as PDF
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};


// --- Main Component ---

export function StageUploadDialog({
  open,
  onOpenChange,
  selectedStageTask,
  onTaskAction,
  onStageCompleted
}: any) {
  // State
  const [activeDocumentTab, setActiveDocumentTab] = useState('');
  const [existingDocuments, setExistingDocuments] = useState<Record<string, any[]>>({});
  const [kycDocuments, setKycDocuments] = useState<Map<string, any>>(new Map());
  const [docFieldsMap, setDocFieldsMap] = useState<Record<string, any[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSourceDocs, setSelectedSourceDocs] = useState<Record<string, Array<{ id: string, document_id: string }>>>({});
  const [lockedDocuments, setLockedDocuments] = useState<Record<string, boolean>>({});
  const [linkedDocuments, setLinkedDocuments] = useState<Record<string, any>>({});

  const [previewState, setPreviewState] = useState({
    isOpen: false,
    data: null as any,
    loading: false
  });

  const { task, stage } = selectedStageTask || {};

  // Initialize Source Docs
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

  // Determine which documents apply to this specific task
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

  // Set initial tab
  useEffect(() => {
    if (open && applicableDocuments.length > 0 && !activeDocumentTab) {
      setActiveDocumentTab(applicableDocuments[0].id);
    }
  }, [open, applicableDocuments, activeDocumentTab]);

  // Clean up
  useEffect(() => {
    if (!open) {
      setActiveDocumentTab('');
      setPreviewState({ isOpen: false, data: null, loading: false });
    }
  }, [open]);

  // --- Optimized Data Fetching ---
  // Fetches ALL necessary data for the stage in parallel when dialog opens
  useEffect(() => {
    if (!open || !stage?.documents || !task?.individual_id) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 1. Identify all KYC IDs required by applicable documents
        const uniqueKycIds = [...new Set(applicableDocuments
          .map((d: any) => d.kycId)
          .filter(Boolean))];

        // 2. Prepare parallel fetches
        const promises: Promise<any>[] = [];

        // Fetch KYC Definitions
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

        // Fetch Existing User Documents
        promises.push(
          supabase
            .from('acc_portal_directors_documents')
            .select('*')
            .eq('director_id', task.individual_id)
            .order('created_at', { ascending: false })
        );

        // Execute fetches
        const [kycRes, userDocsRes] = await Promise.all(promises);

        // 3. Process KYC Definitions & Fields
        const newKycMap = new Map();
        const newDocFieldsMap: Record<string, any[]> = {};

        // Process fetched KYC data
        if (kycRes.data) {
          kycRes.data.forEach((kycData: any) => {
            const transformed = { ...kycData, fields: transformKycFields(kycData.fields || []) };
            newKycMap.set(kycData.id, transformed);
          });
        }

        // Map fields to stage document IDs
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
            // Fallback to extractionSpecs if no KYC ID
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

        // 4. Process Existing Documents
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

      } catch (error) {
        console.error("Error initializing stage upload dialog:", error);
        toast({ title: "Error loading data", description: "Please close and try again.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [open, stage?.documents, task?.individual_id, applicableDocuments]);


  // Check for locked documents
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


  // --- Event Handlers ---

  const handleDocumentCompletion = useCallback(async (docId: string, docInstanceId: string, kycId: string) => {
    if (!stage?.id) return;

    try {
      const currentDate = new Date().toISOString();
      const docToAdd = {
        id: docInstanceId,
        document_id: kycId,
        linked_at: currentDate,
        updated_at: currentDate
      };

      setLockedDocuments(prev => ({ ...prev, [docId]: true }));
      setLinkedDocuments(prev => ({ ...prev, [docId]: docToAdd }));

      const updatedSource = {
        ...selectedSourceDocs,
        [stage.id]: [...(selectedSourceDocs[stage.id] || []).filter(d => d.document_id !== kycId), docToAdd]
      };

      await supabase
        .from('tm_tasks_duplicate')
        .update({ source_document_id: updatedSource, updated_at: currentDate })
        .eq('id', task.id);

      toast({ title: 'Success', description: 'Document linked successfully.' });

      const allDocumentsCompleted = applicableDocuments.every((doc: any) =>
        lockedDocuments[doc.id] || doc.id === docId
      );

      if (allDocumentsCompleted) {
        const timestamp = new Date().toISOString();
        const updatedStages = {
          ...task.stages,
          [stage.id]: {
            status: 'completed',
            date: new Date().toLocaleDateString('en-GB'),
            completedAt: timestamp,
            documentsUploaded: applicableDocuments.length
          }
        };

        await supabase.from('tm_tasks_duplicate').update({
          stages: updatedStages,
          current_stage_id: stage.id,
          updated_at: timestamp
        }).eq('id', task.id);

        onStageCompleted?.(stage.id, task.id, {
          date: updatedStages[stage.id].date,
          status: 'completed'
        });
        onTaskAction?.({ type: 'refresh', taskId: task.id });
        onOpenChange(false);
      }
    } catch (e) {
      console.error('Document completion error', e);
      toast({ title: 'Error', description: 'Failed to complete document', variant: 'destructive' });
    }
  }, [stage, task, selectedSourceDocs, applicableDocuments, lockedDocuments, onStageCompleted, onTaskAction, onOpenChange]);

  const handleUploadSuccess = useCallback(async (newDocument: any, originatingDoc: any) => {
    if (originatingDoc?.kycId && newDocument?.id && stage?.id) {
      await handleDocumentCompletion(
        originatingDoc.id,
        newDocument.id.toString(),
        originatingDoc.kycId
      );
    }
  }, [stage?.id, handleDocumentCompletion]);

  const handleUseExisting = useCallback(async (docConfigId: string, existingDocId: string, kycId: string) => {
    await handleDocumentCompletion(docConfigId, existingDocId, kycId);
  }, [handleDocumentCompletion]);

  const toggleSourceDocument = useCallback(async (docId: string, kycId: string, isSelected: boolean) => {
    if (!stage?.id) return;
    try {
      const currentDate = new Date().toISOString();
      let updatedSource = { ...selectedSourceDocs };

      if (isSelected) {
        updatedSource[stage.id] = [
          ...(updatedSource[stage.id] || []),
          { id: docId, document_id: kycId, linked_at: currentDate, updated_at: currentDate }
        ];
      } else {
        updatedSource[stage.id] = (updatedSource[stage.id] || [])
          .map(doc => doc.id === docId
            ? { ...doc, updated_at: currentDate, unlinked_at: currentDate }
            : doc
          );
      }

      setSelectedSourceDocs(updatedSource);
      const { error } = await supabase
        .from('tm_tasks_duplicate')
        .update({ source_document_id: updatedSource, updated_at: currentDate })
        .eq('id', task.id);

      if (error) throw error;
      toast({ title: 'Success', description: isSelected ? 'Document linked as source.' : 'Document unlinked from source.' });
      onTaskAction?.({ type: 'refresh', taskId: task.id });
    } catch (e) {
      console.error('Error updating source document:', e);
      toast({ title: 'Error', variant: 'destructive', description: 'Failed to update source document.' });
    }
  }, [task?.id, stage?.id, selectedSourceDocs, onTaskAction]);

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
          <div className="p-6 border-b">
            <DialogHeader>
              <DialogTitle className="flex justify-between">
                <h2>Upload {stage?.name} for {individualName}</h2>
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

          <div className="flex-1 overflow-hidden flex flex-col">
            <Tabs value={activeDocumentTab} onValueChange={setActiveDocumentTab} className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 pt-2 border-b bg-muted/10">
                <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-transparent gap-2">
                  {applicableDocuments.map((doc: any) => (
                    <TabsTrigger
                      key={doc.id}
                      value={doc.id}
                      className="relative px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-border"
                    >
                      {doc.name || 'Document'}
                      {isDocumentLocked(doc.id) && (
                        <Check className="h-4 w-4 ml-2 text-green-600" />
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="flex-1 overflow-auto relative bg-slate-50/50">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  applicableDocuments.map((doc: any) => (
                    // CRITICAL FIX: Use display:none (hidden class) instead of unmounting content.
                    // This preserves the state of UploadModal when switching tabs.
                    <div
                      key={doc.id}
                      className={`h-full overflow-y-auto p-6 ${activeDocumentTab === doc.id ? 'block' : 'hidden'}`}
                    >
                      <DocumentTabPanel
                        doc={doc}
                        task={task}
                        individualName={individualName}
                        existingDocs={existingDocuments[doc.id]}
                        isLocked={isDocumentLocked(doc.id)}
                        linkedDocInstanceId={isDocumentLocked(doc.id) ? linkedDocuments[doc.id]?.id : null}
                        kycData={doc.kycId ? kycDocuments.get(doc.kycId) : null}
                        activeDocFields={docFieldsMap[doc.id]}
                        isSourceDocSelected={isDocSelectedAsSource}
                        onToggleSourceDoc={toggleSourceDocument}
                        onUploadSuccess={handleUploadSuccess}
                        onPreviewExisting={handlePreview}
                        onUseExistingLink={handleUseExisting}
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