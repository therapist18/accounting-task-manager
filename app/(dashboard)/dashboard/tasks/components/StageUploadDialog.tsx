// @ts-nocheck
"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, Send, FileText, Trash2, MessageSquare, Star, Eye, Check } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { format, parseISO } from "date-fns"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { UploadModal } from "@/app/generic-components/UploadModal"

// --- Helper Functions (Extracted for Performance) ---

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

// Pure logic for filtering documents
const isDocumentApplicableToTask = (doc: any, task: any, childContext: any = null) => {
  if (!doc.isSpecial) return true;

  // Check targetEntities array
  if (doc.targetEntities?.length > 0) {
    const matchesTarget = doc.targetEntities.some((entity: any) => {
      const classMatch = entity.class_id ? entity.class_id.toString() === task.class_id?.toString() : true;
      const subdeptMatch = entity.subdept_id ? entity.subdept_id.toString() === task.subdepartment?.id?.toString() : true;
      return classMatch && subdeptMatch;
    });
    if (!matchesTarget) return false;
    return true; // If it matches target entities, we accept it
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

  // Child context check (subclass/child levels)
  if (childContext?.childLevelId && childContext?.childLevelType) {
    const { childLevelId, childLevelType } = childContext;
    if (doc[`${childLevelType}_id`] && doc[`${childLevelType}_id`].toString() !== childLevelId) {
      return false;
    }
    if (childLevelType === 'subclass' && doc.class_id && doc.class_id.toString() !== taskClassId) return false;
    if (childLevelType === 'class' && doc.subdept_id && doc.subdept_id.toString() !== taskSubdeptId) return false;
  }

  // Specific Entity Type checks
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
// Handles the UI for a single document to reduce re-renders in the parent
const DocumentTabPanel = ({
  doc,
  task,
  individualName,
  existingDocs = [],
  isLocked,
  linkedDocInstanceId,
  kycData,
  isLoadingFields,
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
      // In a real scenario, you'd likely upload this blob immediately or trigger the upload modal with it
      // For this refactor, we simulate the success/toast
      toast({ title: 'Success', description: 'Message converted to PDF. Please upload using the file upload option.' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to process message', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4 p-4 rounded-lg border">
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

      {/* Special Doc Banner */}
      {doc.isSpecial && (
        <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-4 flex gap-3">
          <Star className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-700">
            {doc.entityName ? `Specific to ${doc.entityName}` : 'Special requirements apply'}
          </p>
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
          {isLoadingFields ? (
            <div className="flex justify-center p-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : activeDocFields ? (
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
              additionalFields={{
                expiry_date: null
              }}
              onBeforeUpload={async (recordData) => {
                // Custom handling before upload if needed
                if (doc.onBeforeUpload) {
                  return doc.onBeforeUpload(recordData);
                }
                return null;
              }}
            />
          ) : null}

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
  const [activeDocFields, setActiveDocFields] = useState<any[] | null>(null);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [selectedSourceDocs, setSelectedSourceDocs] = useState<Record<string, Array<{id: string, document_id: string}>>>({});
  
  // Preview State consolidated
  const [previewState, setPreviewState] = useState({
    isOpen: false,
    data: null as any,
    loading: false
  });

  // Refs for caching to avoid re-fetching fields constantly
  const documentFieldsCache = useRef(new Map());

  // Derived Values
  const { task, stage } = selectedStageTask || {};
  
  // Initialize selectedSourceDocs from task.source_document_id when dialog opens
  useEffect(() => {
    if (open && task?.source_document_id) {
      setSelectedSourceDocs(prev => ({
        ...prev,
        ...(typeof task.source_document_id === 'object' ? task.source_document_id : {})
      }));
    }
  }, [open, task?.source_document_id]);
  
  const linkedDocumentForStage = useMemo(() => {
    const sourceIdMap = task?.source_document_id;
    return (sourceIdMap && typeof sourceIdMap === 'object' && stage?.id) ? sourceIdMap[stage.id] : null;
  }, [task?.source_document_id, stage?.id]);
  
  // Check if a document is selected as a source for the current stage
  const isDocSelectedAsSource = useCallback((docId: string) => {
    if (!stage?.id) return false;
    const stageSelections = selectedSourceDocs[stage.id] || [];
    return stageSelections.some(doc => doc.id === docId);
  }, [selectedSourceDocs, stage?.id]);

  const isStageLocked = !!linkedDocumentForStage;

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

  // Clean up on close
  useEffect(() => {
    if (!open) {
      setActiveDocumentTab('');
      setPreviewState({ isOpen: false, data: null, loading: false });
    }
  }, [open]);

  // --- Data Fetching ---

  const fetchKycDocument = useCallback(async (kycId: string) => {
    if (kycDocuments.has(kycId)) return kycDocuments.get(kycId);
    
    try {
      const { data, error } = await supabase
        .from('acc_portal_kyc')
        .select('id, fields, name, display_name, document_type')
        .eq('id', kycId)
        .single();
        
      if (error || !data) throw error;

      const transformedDoc = { ...data, fields: transformKycFields(data.fields || []) };
      setKycDocuments(prev => new Map(prev.set(kycId, transformedDoc)));
      return transformedDoc;
    } catch (e) {
      console.error('Error fetching KYC:', e);
      return null;
    }
  }, [kycDocuments]);

  // Fetch Existing Docs
  useEffect(() => {
    if (!open || !task?.individual_id || !stage?.documents) return;

    const loadDocs = async () => {
      const { data: documents } = await supabase
        .from('acc_portal_directors_documents')
        .select('*')
        .eq('director_id', task.individual_id)
        .order('created_at', { ascending: false });

      if (!documents) return;

      const groupedDocs: Record<string, any[]> = {};
      
      // We need to know which stage doc corresponds to which KYC ID
      for (const stageDoc of stage.documents) {
        if (stageDoc.kycId) {
          // Prefetch KYC definition
          await fetchKycDocument(stageDoc.kycId);
          
          const matching = documents.filter(d => d.document_id === stageDoc.kycId);
          if (matching.length > 0) groupedDocs[stageDoc.id] = matching;
        }
      }
      setExistingDocuments(groupedDocs);
    };

    loadDocs();
  }, [open, task?.individual_id, stage?.documents, fetchKycDocument]);

  // Fetch Fields for Active Tab
  useEffect(() => {
    if (!activeDocumentTab) return;

    const loadFields = async () => {
      if (documentFieldsCache.current.has(activeDocumentTab)) {
        setActiveDocFields(documentFieldsCache.current.get(activeDocumentTab));
        return;
      }

      setIsLoadingFields(true);
      const docConfig = stage?.documents?.find((d: any) => d.id === activeDocumentTab);
      let fields = [];

      if (docConfig?.kycId) {
        const kycDoc = await fetchKycDocument(docConfig.kycId);
        if (kycDoc?.fields) {
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
      }
      
      // Fallback to extractionSpecs if no KYC fields
      if (!fields.length && docConfig?.extractionSpecs) {
         fields = docConfig.extractionSpecs.map((spec: any) => ({
          id: spec.id || spec.fieldName || `field-${Date.now()}`,
          name: spec.fieldName || spec.name || 'Field',
          type: spec.fieldType || 'text',
          required: spec.required || false,
          isArray: spec.isArray || false
         }));
      }

      documentFieldsCache.current.set(activeDocumentTab, fields);
      setActiveDocFields(fields);
      setIsLoadingFields(false);
    };

    loadFields();
  }, [activeDocumentTab, stage?.documents, fetchKycDocument]);

  // --- Handlers ---

  const handleStageCompletion = useCallback(async (count: number = 1) => {
    try {
      const timestamp = new Date().toISOString();
      const updatedStages = {
        ...task.stages,
        [stage.id]: {
          status: 'completed',
          date: new Date().toLocaleDateString('en-GB'),
          completedAt: timestamp,
          documentsUploaded: count
        }
      };

      await supabase.from('tm_tasks').update({
        stages: updatedStages,
        current_stage_id: stage.id,
        updated_at: timestamp
      }).eq('id', task.id);

      onStageCompleted?.(stage.id, task.id, { date: updatedStages[stage.id].date, status: 'completed' });
      onTaskAction?.({ type: 'refresh', taskId: task.id });
      onOpenChange(false);
    } catch (e) {
      console.error('Stage completion error', e);
      toast({ title: "Error", description: "Failed to update stage status", variant: "destructive" });
    }
  }, [task, stage, onStageCompleted, onTaskAction, onOpenChange]);

const handleUploadSuccess = useCallback(async (newDocument: any, originatingDoc: any) => {
  if (originatingDoc?.kycId && newDocument?.id && stage?.id) {
    const currentDate = new Date().toISOString();
    const docToAdd = { 
      id: newDocument.id.toString(), 
      document_id: originatingDoc.kycId,
      linked_at: currentDate,
      updated_at: currentDate
    };
    const updatedSource = {
      ...selectedSourceDocs,
      [stage.id]: [...(selectedSourceDocs[stage.id] || []), docToAdd]
    };
    
    setSelectedSourceDocs(updatedSource);
    
    await supabase
      .from('tm_tasks')
      .update({ 
        source_document_id: updatedSource,
        updated_at: currentDate
      })
      .eq('id', task.id);
  }
  
  await handleStageCompletion(Array.isArray(newDocument) ? newDocument.length : 1);
}, [task, stage, selectedSourceDocs, handleStageCompletion]);

const handleUseExisting = useCallback(async (docConfigId: string, existingDocId: string, kycId: string) => {
  if (!stage?.id) return;
  
  try {
    const currentDate = new Date().toISOString();
    const docToAdd = { 
      id: existingDocId.toString(), 
      document_id: kycId,
      linked_at: currentDate,
      updated_at: currentDate
    };
    const updatedSource = {
      ...selectedSourceDocs,
      [stage.id]: [...(selectedSourceDocs[stage.id] || []).filter(d => d.id !== existingDocId), docToAdd]
    };
    
    setSelectedSourceDocs(updatedSource);
    
    const { error } = await supabase
      .from('tm_tasks')
      .update({ 
        source_document_id: updatedSource,
        updated_at: currentDate
      })
      .eq('id', task.id);
    
    if (error) throw error;
    
    toast({ title: 'Success', description: 'Document linked successfully.' });
    await handleStageCompletion(1);
  } catch (e) {
    console.error('Error linking document:', e);
    toast({ 
      title: 'Error', 
      variant: 'destructive', 
      description: 'Failed to link document. Please try again.' 
    });
  }
}, [task, stage, selectedSourceDocs, handleStageCompletion]);

const toggleSourceDocument = useCallback(async (docId: string, kycId: string, isSelected: boolean) => {
  if (!stage?.id) return;
  
  try {
    const currentDate = new Date().toISOString();
    let updatedSource = { ...selectedSourceDocs };
    
    if (isSelected) {
      updatedSource = {
        ...updatedSource,
        [stage.id]: [
          ...(updatedSource[stage.id] || []), 
          { 
            id: docId, 
            document_id: kycId,
            linked_at: currentDate,
            updated_at: currentDate
          }
        ]
      };
    } else {
      updatedSource = {
        ...updatedSource,
        [stage.id]: (updatedSource[stage.id] || [])
          .map(doc => doc.id === docId 
            ? { ...doc, updated_at: currentDate, unlinked_at: currentDate }
            : doc
          )
      };
    }
    
    setSelectedSourceDocs(updatedSource);
    
    const { error } = await supabase
      .from('tm_tasks')
      .update({ 
        source_document_id: updatedSource,
        updated_at: currentDate
      })
      .eq('id', task.id);
    
    if (error) throw error;
    
    toast({ 
      title: 'Success', 
      description: isSelected ? 'Document linked as source.' : 'Document unlinked from source.' 
    });
    
    onTaskAction?.({ type: 'refresh', taskId: task.id });
    
  } catch (e) {
    console.error('Error updating source document:', e);
    toast({ 
      title: 'Error', 
      variant: 'destructive', 
      description: 'Failed to update source document. Please try again.' 
    });
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
      
      // Process fields for preview
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
        <DialogContent className="max-w-[1800px] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Documents for {stage?.name}</DialogTitle>
            <DialogDescription>
              Upload required documents or select existing ones to complete this stage.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={activeDocumentTab} onValueChange={setActiveDocumentTab} className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto">
              {applicableDocuments.map((doc: any) => (
                <TabsTrigger key={doc.id} value={doc.id}>
                  {doc.name || 'Document'}
                  {isStageLocked && linkedDocumentForStage?.document_id === doc.kycId && (
                    <Check className="h-4 w-4 ml-2 text-green-600" />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {applicableDocuments.map((doc: any) => (
              <TabsContent key={doc.id} value={doc.id} className="mt-6">
                <DocumentTabPanel
                  doc={doc}
                  task={task}
                  individualName={individualName}
                  existingDocs={existingDocuments[doc.id]}
                  isLocked={isStageLocked}
                  linkedDocInstanceId={isStageLocked ? linkedDocumentForStage?.id : null}
                  kycData={doc.kycId ? kycDocuments.get(doc.kycId) : null}
                  isLoadingFields={isLoadingFields}
                  activeDocFields={activeDocFields}
                  isSourceDocSelected={isDocSelectedAsSource}
                  onToggleSourceDoc={toggleSourceDocument}
                  onUploadSuccess={handleUploadSuccess}
                  onPreviewExisting={handlePreview}
                  onUseExistingLink={handleUseExisting}
                />
              </TabsContent>
            ))}
          </Tabs>
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
               // Pass a resolved promise for compatibility with the component's interface
               fieldsPromise={Promise.resolve(previewState.data.fields)}
             />
           ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}