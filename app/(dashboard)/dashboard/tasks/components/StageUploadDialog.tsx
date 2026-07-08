// @ts-nocheck
"use client"

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2, FileText, MessageSquare, Star, Eye, Check, CheckCircle2, RotateCcw, X } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/lib/hooks/use-toast"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { format, parseISO } from "date-fns"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { UploadModal } from "@/app/generic-components/UploadModal"
import { performExtraction } from "@/lib/extractionUtils"
import supabase from "@/lib/supabase/client";
import {
  updateDocumentWorkflow,
  shouldTriggerWorkflowUpdate,
  WORKFLOW_OUTCOME_LABELS,
  TASK_STAGE_WORKFLOW_MAPPING,
  getWorkflowLogsForIndividual
} from "../utils/workflowSyncService";

// Optimized helper functions with memoization
const transformKycFields = (() => {
  const cache = new Map<string, any[]>();
  return (fields: any[]): any[] => {
    if (!Array.isArray(fields)) return [];

    const cacheKey = JSON.stringify(fields);
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const result = fields.map((field: any) => {
      const isArray = field.type === 'array' || field.isArray === true;
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
      };

      if (isArray && field.arrayConfig && Array.isArray(field.arrayConfig.fields)) {
        transformedField.arrayConfig = {
          maxItems: field.arrayConfig.maxItems,
          fields: transformKycFields(field.arrayConfig.fields)
        };
      }

      return transformedField;
    });

    cache.set(cacheKey, result);
    return result;
  };
})();

const processExtractedData = (() => {
  const cache = new Map<string, any>();
  return (data: any, fields: any[]): any => {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const cacheKey = JSON.stringify({ data, fields });
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const result: Record<string, any> = {};
    const fieldMap = new Map();

    // Create field lookup for O(1) access
    fields.forEach((field) => {
      const fieldName = field.name || field.fieldName;
      if (fieldName) {
        fieldMap.set(field.id, fieldName);
        fieldMap.set(fieldName, fieldName);
      }
    });

    // Process data efficiently
    Object.entries(data).forEach(([key, value]) => {
      const fieldName = fieldMap.get(key);
      if (fieldName) {
        const field = fields.find(f => f.id === key || f.name === key || f.fieldName === key);

        if (field?.isArray && Array.isArray(value)) {
          result[fieldName] = value.map((item: any) => {
            if (field.arrayConfig?.fields) {
              return processExtractedData(item, field.arrayConfig.fields);
            }
            return item;
          });
        } else if (typeof value === 'object' && value !== null && field?.fields) {
          result[fieldName] = processExtractedData(value, field.fields);
        } else {
          result[fieldName] = value;
        }
      } else if (!fields.some(f => f.id === key)) {
        result[key] = value;
      }
    });

    cache.set(cacheKey, result);
    return result;
  };
})();

const isDocumentApplicableToTask = (doc: any, task: any, childContext: any = null) => {
  if (!doc.isSpecial) {
    return true;
  }

  // Early return for target entities
  if (doc.targetEntities?.length > 0) {
    const taskClassId = task.class_id?.toString();
    const taskSubdeptId = task.subdepartment_id?.toString();

    return doc.targetEntities.some((entity: any) => {
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

const collectTaskTriggerDocumentIds = (sourceDocumentMap: any) => {
  const triggerIds = new Set<string>();

  if (!sourceDocumentMap || typeof sourceDocumentMap !== 'object') {
    return triggerIds;
  }

  Object.values(sourceDocumentMap).forEach((stageEntries: any) => {
    if (!Array.isArray(stageEntries)) return;

    stageEntries.forEach((entry: any) => {
      const candidates = [
        entry?.id,
        entry?.linked_document_id,
        entry?.uploaded_doc_id
      ];

      candidates.forEach((candidate) => {
        if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
          triggerIds.add(String(candidate));
        }
      });
    });
  });

  return triggerIds;
};

const StageUploadDialogLoadingState = () => {
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingSteps = [
    "Initializing document requirements...",
    "Fetching existing documents...",
    "Processing workflow data...",
    "Preparing upload interface...",
    "Almost ready..."
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingStep(prev => (prev + 1) % loadingSteps.length);
    }, 800);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header area matching the dialog structure */}
      <div className="px-6 pt-2 border-b bg-muted/10">
        <div className="flex gap-2 overflow-hidden py-1">
          {/* Fake tab skeleton */}
          <div className="px-4 py-2 bg-slate-100 rounded-md border border-slate-200 animate-pulse">
            <div className="h-4 w-24 bg-slate-200 rounded"></div>
          </div>
          <div className="px-4 py-2 bg-slate-100 rounded-md border border-slate-200 animate-pulse">
            <div className="h-4 w-20 bg-slate-200 rounded"></div>
          </div>
          <div className="px-4 py-2 bg-slate-100 rounded-md border border-slate-200 animate-pulse">
            <div className="h-4 w-28 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>

      {/* Enhanced content area with progress */}
      <div className="flex-1 overflow-auto relative bg-slate-50/50">
        <div className="flex items-center justify-center h-full p-6">
          <div className="text-center space-y-6 max-w-md">
            {/* Main loading indicator */}
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="text-xl font-semibold text-slate-800">Loading Stage Documents</span>
            </div>

            {/* Progress indicator */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm text-slate-600">
                <span>{loadingSteps[loadingStep]}</span>
                <span className="text-xs text-slate-500">{loadingStep + 1}/{loadingSteps.length}</span>
              </div>

              {/* Progress dots */}
              <div className="flex justify-center gap-2">
                {loadingSteps.map((_, index) => (
                  <div
                    key={index}
                    className={`h-2 w-2 rounded-full transition-all duration-300 ${index === loadingStep
                      ? 'bg-blue-600 w-6'
                      : index < loadingStep
                        ? 'bg-blue-400'
                        : 'bg-slate-300'
                      }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
  workflowDocuments = {},
  onRevertResolution
}) => {
  const [useExisting, setUseExisting] = useState(false);
  const [selectedExistingId, setSelectedExistingId] = useState("");
  const [messageText, setMessageText] = useState(messageState || "");
  const [isConverting, setIsConverting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [generatedFile, setGeneratedFile] = useState<File | null>(null);
  const [generatedFileUrl, setGeneratedFileUrl] = useState<string | null>(null);
  const [pdfExtractedData, setPdfExtractedData] = useState<Record<string, any>>({});
  const [showPdfPreview, setShowPdfPreview] = useState(false);

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

      if (generatedFileUrl) URL.revokeObjectURL(generatedFileUrl);
      const blobUrl = URL.createObjectURL(blob);
      setGeneratedFileUrl(blobUrl);
      setGeneratedFile(file);
      setShowPdfPreview(true);
      setIsConverting(false);

      // Run extraction against the document's fields
      if (activeDocFields && activeDocFields.length > 0) {
        setIsExtracting(true);
        try {
          const result = await performExtraction(
            blobUrl,
            activeDocFields,
            documentName,
            () => {},
            fileName
          );
          const data = typeof result.extractedData === 'string'
            ? JSON.parse(result.extractedData)
            : result.extractedData || {};
          setPdfExtractedData(data);
        } catch (extractErr) {
          console.error('Extraction error:', extractErr);
          const emptyData: Record<string, any> = {};
          activeDocFields.forEach((f: any) => { emptyData[f.name] = ''; });
          setPdfExtractedData(emptyData);
          toast({ title: 'Extraction incomplete', description: 'PDF generated — please fill in the fields manually.', variant: 'default' });
        } finally {
          setIsExtracting(false);
        }
      } else {
        setPdfExtractedData({});
      }
    } catch (error) {
      console.error('Conversion error:', error);
      setIsConverting(false);
      toast({
        title: 'Error',
        description: error.message || 'Failed to convert text to PDF',
        variant: 'destructive',
      });
    }
  };

  const handlePendingChange = useCallback((docs: any[]) => {
    if (docs && docs.length > 0) {
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
    if (generatedFileUrl) URL.revokeObjectURL(generatedFileUrl);
    setGeneratedFile(null);
    setGeneratedFileUrl(null);
    setPdfExtractedData({});
    setShowPdfPreview(false);
    setMessageText("");
  }, [generatedFileUrl]);

  const handleExternalFileClear = useCallback(() => {
    if (generatedFileUrl) URL.revokeObjectURL(generatedFileUrl);
    setGeneratedFile(null);
    setGeneratedFileUrl(null);
    setPdfExtractedData({});
    setShowPdfPreview(false);
  }, [generatedFileUrl]);

  const handleConfirmPdfUpload = useCallback(() => {
    if (!generatedFile) return;
    onUploadSuccess({
      files: [{
        file: generatedFile,
        extractedData: pdfExtractedData,
        validationStatus: 'valid'
      }]
    }, doc);
    if (generatedFileUrl) URL.revokeObjectURL(generatedFileUrl);
    setGeneratedFile(null);
    setGeneratedFileUrl(null);
    setPdfExtractedData({});
    setShowPdfPreview(false);
    setMessageText("");
  }, [generatedFile, generatedFileUrl, pdfExtractedData, onUploadSuccess, doc]);

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
                  {existingDocs.filter(ed => !ed.hasNoTaskOutcome).map((ed) => {
                    const isSelected = selectedExistingId === ed.id;
                    const fileName = ed.file_path?.split('/').pop() || documentName;

                    // Identify if this doc has a bypass workflow outcome making it invalid for task linking
                    const isBypassed = ed.hasNoTaskOutcome;
                    const isDisabled = isLocked || isBypassed;

                    return (
                      <div key={ed.id} className={`flex flex-col gap-2 p-3 border rounded-lg transition-colors ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white hover:bg-slate-50'} ${isBypassed ? 'opacity-80 bg-slate-50/50' : ''}`}>
                        <div className="flex items-center gap-3">
                          <RadioGroupItem
                            value={ed.id}
                            id={ed.id}
                            disabled={isDisabled}
                            className={`${isDisabled ? 'opacity-50' : ''}`}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Label htmlFor={ed.id} className={`text-sm ${isDisabled ? 'cursor-default text-slate-500' : 'cursor-pointer font-medium'}`}>{fileName}</Label>
                              {isSourceDocSelected(ed.id) && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800">
                                  Source
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">{format(parseISO(ed.created_at), 'dd MMM yyyy')}</p>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-slate-700 bg-white shadow-sm border border-slate-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPreviewExisting(ed, kycData);
                            }}
                            type="button"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Rendering the bypass UI with revert button */}
                        {isBypassed && (
                          <div className="mt-1 flex items-center justify-between bg-amber-50 p-2.5 rounded-md border border-amber-200 ml-7">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-amber-600" />
                              <span className="text-xs text-amber-900 font-medium">
                                Resolved: {ed.workflowOutcome?.replace(/_/g, ' ').toUpperCase()}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs bg-white hover:bg-amber-100 text-amber-700 border-amber-300"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRevertResolution(ed.workflowLogId);
                              }}
                              type="button"
                            >
                              <RotateCcw className="h-3 w-3 mr-1.5" /> Revert
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </RadioGroup>

                {!isLocked && selectedExistingId && (
                  <Button
                    onClick={() => onUseExistingLink(doc.id, selectedExistingId, doc.kycId)}
                    className="ml-6 mt-3 shadow-sm"
                    size="sm"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Use Selected Document
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
              onBeforeUpload={handleBeforeUpload}
              onPendingChange={handlePendingChange}
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

              {!showPdfPreview && (
                <>
                  <Textarea
                    placeholder={`Type your message here...`}
                    className="min-h-[120px] resize-none font-mono text-sm"
                    value={messageText}
                    onChange={(e) => handleMessageTextChange(e.target.value)}
                  />

                  <Button
                    onClick={handleConvertAndUpload}
                    disabled={!messageText.trim() || isConverting}
                    variant="outline"
                    className="w-full border-dashed border-2 hover:bg-slate-50"
                  >
                    {isConverting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                    {isConverting ? 'Generating PDF...' : 'Convert to PDF & Review'}
                  </Button>
                </>
              )}

              {showPdfPreview && generatedFile && generatedFileUrl && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-red-500" />
                      {generatedFile.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {isExtracting && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Extracting fields...
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-500 hover:text-slate-800"
                        onClick={handleExternalFileClear}
                        type="button"
                        title="Discard and start over"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="p-4">
                    <ExtractionPreview
                      documentName={documentName}
                      extractedData={pdfExtractedData}
                      fields={activeDocFields || []}
                      fileUrl={generatedFileUrl}
                      fileName={generatedFile.name}
                      expanded={true}
                      showSaveButton={false}
                      onDataChange={(fieldName, value) =>
                        setPdfExtractedData(prev => ({ ...prev, [fieldName]: value }))
                      }
                    />
                  </div>

                  <div className="px-4 pb-4">
                    <Button
                      onClick={handleConfirmPdfUpload}
                      className="w-full"
                      disabled={isExtracting}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Confirm & Add to Upload Queue
                    </Button>
                  </div>
                </div>
              )}
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
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Trigger to reload data after revert
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

  const currentTaskTriggerDocumentIds = useMemo(
    () => collectTaskTriggerDocumentIds(task?.source_document_id),
    [task?.source_document_id]
  );

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
  }, [stage?.documents, task, selectedStageTask?.childLevelId, selectedStageTask?.childLevelType]);

  const applicableDocumentsById = useMemo(() => {
    return applicableDocuments.reduce((acc, doc: any) => {
      acc[doc.id] = doc;
      return acc;
    }, {} as Record<string, any>);
  }, [applicableDocuments]);

  const applicableKycIds = useMemo(() => {
    return [...new Set(applicableDocuments.map((doc: any) => doc.kycId).filter(Boolean))];
  }, [applicableDocuments]);

  const pendingDocumentCount = useMemo(() => Object.keys(pendingDocuments).length, [pendingDocuments]);

  const hasSpecialDocuments = useMemo(
    () => applicableDocuments.some((doc: any) => doc.isSpecial),
    [applicableDocuments]
  );

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
  }, [open, applicableDocuments, activeDocumentTab]);

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

    let isCancelled = false;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Create optimized parallel data fetching with early returns
        const dataPromises: Promise<any>[] = [];

        // KYC data fetch - only if needed
        if (applicableKycIds.length > 0) {
          dataPromises.push(
            supabase
              .from('acc_portal_kyc')
              .select('id, fields, name, display_name, document_type')
              .in('id', applicableKycIds)
          );
        } else {
          dataPromises.push(Promise.resolve({ data: [] }));
        }

        // User documents fetch with optimized query
        dataPromises.push(
          supabase
            .from('acc_portal_directors_documents')
            .select('id, document_id, file_path, created_at, extracted_details')
            .eq('director_id', task.individual_id)
            .order('created_at', { ascending: false })
        );

        // Workflow logs fetch - cached and optimized
        dataPromises.push(
          getWorkflowLogsForIndividual(task.individual_id).then(logs => ({ data: logs }))
        );

        // Fetch all tasks for the same individual to check for document usage across tasks
        dataPromises.push(
          supabase
            .from('tm_tasks')
            .select('id, stages, individual_id, status')
            .eq('individual_id', task.individual_id)
            .neq('id', task.id) // Exclude current task
            .in('status', ['completed', 'write_up_completed']) // Only check completed tasks
        );

        // Execute all requests in parallel
        const [kycRes, userDocsRes, workflowRes, otherTasksRes] = await Promise.all(dataPromises);
        if (isCancelled) return;

        // Optimized data processing with memoization
        const newKycMap = new Map();
        const newDocFieldsMap: Record<string, any[]> = {};
        const workflowDocMap: Record<string, any> = {};
        const triggerDocIdsFromWorkflow = new Set<string>();

        // Process KYC data with optimized transformation
        if (kycRes.data) {
          kycRes.data.forEach((kycData: any) => {
            // Cache transformed fields to avoid re-processing
            const transformed = {
              ...kycData,
              fields: kycData.fields ? transformKycFields(kycData.fields) : []
            };
            newKycMap.set(kycData.id, transformed);
          });
        }

        // Create optimized document lookup with Map for O(1) access
        const documentsByTypeId = new Map<string, any[]>();
        if (userDocsRes.data) {
          userDocsRes.data.forEach((doc: any) => {
            const key = String(doc.document_id);
            if (!documentsByTypeId.has(key)) {
              documentsByTypeId.set(key, []);
            }
            documentsByTypeId.get(key)!.push(doc);
          });
        }

        // Process workflow documents with optimized logic
        if (workflowRes.data) {
          workflowRes.data.forEach((log: any) => {
            const isCompleted = log.resolutions && log.resolutions.length > 0;
            const tasksArray = Array.isArray(log.tasks) ? log.tasks : [];

            // Check if this log triggered the current task
            const isTriggerForCurrentTask = tasksArray.some((t: any) =>
              Array.isArray(t.taskIds) && t.taskIds.map(String).includes(String(task.id))
            );

            if (isTriggerForCurrentTask && log.uploaded_doc_id) {
              triggerDocIdsFromWorkflow.add(String(log.uploaded_doc_id));
            }

            // Create workflow document entries with optimized structure
            const workflowDocInfo = {
              ...log,
              isWorkflowDocument: true,
              workflowAction: log.action_type,
              workflowOutcome: isCompleted ? log.resolutions[0]?.outcome : log.action_type,
              isCompleted: isCompleted
            };

            if (log.uploaded_doc_id) {
              workflowDocMap[log.uploaded_doc_id] = workflowDocInfo;
            }
            if (log.document_type_id) {
              workflowDocMap[log.document_type_id] = workflowDocInfo;
            }
          });
        }

        // Optimized field processing with lazy evaluation
        applicableDocuments.forEach((doc: any) => {
          let fields = [];

          if (doc.kycId && newKycMap.has(doc.kycId)) {
            const kycDoc = newKycMap.get(doc.kycId);
            if (kycDoc.fields) {
              // Use cached transformed fields
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

        // Optimized document processing with reduced iterations
        const groupedDocs: Record<string, any[]> = {};
        const currentTaskTriggerIds = currentTaskTriggerDocumentIds;

        if (userDocsRes.data) {
          // Process applicable documents in batch
          applicableDocuments.forEach((stageDoc: any) => {
            if (!stageDoc.kycId) {
              return;
            }

            const matching = documentsByTypeId.get(String(stageDoc.kycId)) || [];

            if (matching.length === 0) {
              return;
            }

            // Process matching documents with optimized filtering
            const selectableMatching = matching.filter((doc: any) => {
              const docId = String(doc.id);

              // Early skip for trigger documents
              if (currentTaskTriggerIds.has(docId) || triggerDocIdsFromWorkflow.has(docId)) {
                return false;
              }

              // Check workflow status efficiently
              const workflowDoc = workflowDocMap[doc.id];
              const hasNotApplicableTaskStatus = workflowDoc?.tasks?.some?.((task: any) =>
                task.status === 'not_applicable'
              );

              // THIS IS THE KEY ISSUE: We need to filter by task context
              // Documents should only be shown if they belong to the current task or are not task-specific
              // AND they're not already linked to a completed stage in the current task
              let isDocumentAvailable = !doc.task_id || doc.task_id === task.id;

              // Additional check: Don't show documents that are already linked to completed stages in other tasks
              if (isDocumentAvailable && otherTasksRes?.data) {
                const isAlreadyLinkedToOtherTask = otherTasksRes.data.some((otherTask: any) => {
                  // Check all stages in the other task
                  return Object.entries(otherTask.stages || {}).some(([stageId, stageData]: [string, any]) => {
                    // Only check completed stages
                    if (stageData.status !== 'completed') return false;

                    // Check if this document is linked to this completed stage
                    const stageDocuments = stageData.documents || {};
                    const isDocumentLinked = Object.values(stageDocuments).some((stageDoc: any) =>
                      stageDoc.id === docId || stageDoc.linked_document_id === docId
                    );

                    return isDocumentLinked;
                  });
                });

                if (isAlreadyLinkedToOtherTask) {
                  isDocumentAvailable = false;
                }
              }

              return isDocumentAvailable;
            }).map((doc: any) => {
              const workflowDoc = workflowDocMap[doc.id];
              return {
                ...doc,
                hasNoTaskOutcome: workflowDoc?.tasks?.some?.((task: any) =>
                  task.status === 'not_applicable'
                ) || false,
                isCurrentTaskTriggerDocument: false,
                workflowLogId: workflowDoc?.id,
                workflowOutcome: workflowDoc?.workflowOutcome
              };
            });

            if (selectableMatching.length > 0) {
              groupedDocs[stageDoc.id] = selectableMatching;
            }
          });
        }

        if (!isCancelled) {
          setKycDocuments(newKycMap);
          setDocFieldsMap(newDocFieldsMap);
          setExistingDocuments(groupedDocs);
          setWorkflowDocuments(workflowDocMap);
        }

      } catch (error) {
        console.error("Error initializing stage upload dialog:", error);
        if (!isCancelled) {
          toast({ title: "Error loading data", description: "Please close and try again.", variant: "destructive" });
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    // Add small delay to prevent flickering for fast loads
    const loadingTimeout = setTimeout(fetchData, 50);

    return () => {
      isCancelled = true;
      clearTimeout(loadingTimeout);
    };
  }, [open, stage?.documents, task?.individual_id, applicableDocuments, applicableKycIds, refreshTrigger, currentTaskTriggerDocumentIds, task?.id]);

  useEffect(() => {
    if (!stage?.id || !applicableDocuments.length) return;

    const stageSourceDocs = Array.isArray(task?.source_document_id?.[stage.id])
      ? task.source_document_id[stage.id]
      : [];

    const sourceDocsByDocumentId = stageSourceDocs.reduce((acc: Record<string, any>, docInstance: any) => {
      if (docInstance?.document_id) {
        acc[String(docInstance.document_id)] = docInstance;
      }
      return acc;
    }, {});

    const nextLockedDocuments: Record<string, boolean> = {};
    const nextLinkedDocuments: Record<string, any> = {};

    applicableDocuments.forEach((doc: any) => {
      const docInstance = sourceDocsByDocumentId[String(doc.kycId)];
      nextLockedDocuments[doc.id] = Boolean(docInstance);
      if (docInstance) {
        nextLinkedDocuments[doc.id] = docInstance;
      }
    });

    setLockedDocuments(nextLockedDocuments);
    setLinkedDocuments(nextLinkedDocuments);
  }, [stage?.id, task?.source_document_id, applicableDocuments]);

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

  // Handle workflow resolution for original documents in write_up stage
  const resolveOriginalDocumentWorkflow = async (newDocumentId: string, documentTypeId: string) => {
    try {
      // Find existing workflow logs for this individual
      const { data: existingLogs, error: logsError } = await supabase
        .from('document_workflow_logs')
        .select('*')
        .eq('individual_id', task.individual_id)
        .order('created_at', { ascending: false });

      if (logsError) {
        console.error('[StageUploadDialog] Error fetching existing logs:', logsError);
        throw logsError;
      }

      if (!existingLogs || existingLogs.length === 0) {
        return;
      }

      // Filter to find ALL workflow logs that actually triggered this current task
      // E.g., multiple dependants may have triggered the task bundle, resolving all is necessary.
      const logsToResolve = existingLogs.filter(log => {
        const tasks = Array.isArray(log.tasks) ? log.tasks : [];
        return tasks.some((t: any) =>
          Array.isArray(t.taskIds) && t.taskIds.map(String).includes(String(task.id))
        );
      });

      if (logsToResolve.length === 0) {
        return;
      }

      // Update each found triggering log
      const updatePromises = logsToResolve.map(async (logToResolve) => {
        const newResolution = {
          outcome: 'renewed',
          document_id: newDocumentId,
          renewed_by_document_type_id: documentTypeId,
          effectiveDate: new Date().toISOString().split('T')[0],
          note: `Document renewed through task completion (Task ID: ${task.id})`,
          createdAt: new Date().toISOString()
        };

        const updatedResolutions = Array.isArray(logToResolve.resolutions)
          ? [...logToResolve.resolutions, newResolution]
          : [newResolution];

        const updatedTasks = Array.isArray(logToResolve.tasks)
          ? logToResolve.tasks.map((t: any) => {
            const isMatchingTask = Array.isArray(t.taskIds) && t.taskIds.map(String).includes(String(task.id));
            if (isMatchingTask || t.status === 'not_applicable' || ['pending_task_creation', 'task_created', 'task_initiated'].includes(String(t.status || ''))) {
              return { ...t, status: 'completed', note: 'Trigger document renewed by completed write-up task' };
            }
            return t;
          })
          : [];

        const updatedPayload = {
          ...(logToResolve.payload || {}),
          activeWorkflow: {
            ...(logToResolve.payload?.activeWorkflow || {}),
            canProceed: false,
            isCompleted: true,
            currentAction: 'resolution',
            currentStatus: 'renewed',
            nextAction: null,
            lastUpdated: new Date().toISOString()
          }
        };

        return supabase
          .from('document_workflow_logs')
          .update({
            resolutions: updatedResolutions,
            tasks: updatedTasks,
            payload: updatedPayload,
            action_type: 'resolution',
            updated_at: new Date().toISOString()
          })
          .eq('id', logToResolve.id);
      });

      await Promise.all(updatePromises);

      toast({
        title: 'Documents Renewed',
        description: 'Original document workflows have been updated to reflect renewal',
        variant: 'default'
      });

    } catch (error) {
      console.error('[StageUploadDialog] Error resolving original document workflow:', error);
      toast({
        title: 'Workflow Resolution Error',
        description: 'Failed to update original document workflow',
        variant: 'destructive'
      });
    }
  };

  // Handle reverting a resolution that hides it from standard task flow
  const handleRevertResolution = async (logId: number) => {
    setIsLoading(true);
    try {
      const { data: log, error } = await supabase
        .from('document_workflow_logs')
        .select('*')
        .eq('id', logId)
        .single();

      if (error) throw error;
      if (!log) return;

      const resolutions = Array.isArray(log.resolutions) ? log.resolutions : [];
      // Remove the last resolution
      const updatedResolutions = resolutions.slice(0, -1);

      const hasHolds = Array.isArray(log.holds) && log.holds.length > 0;
      const hasComments = Array.isArray(log.comments) && log.comments.length > 0;
      const hasReminders = Array.isArray(log.reminders) && log.reminders.length > 0;
      const hasTasks = Array.isArray(log.tasks) && log.tasks.length > 0;

      // If it was the only thing in the log, delete the entire record
      if (!hasHolds && !hasComments && !hasReminders && !hasTasks && updatedResolutions.length === 0) {
        await supabase.from('document_workflow_logs').delete().eq('id', logId);
      } else {
        // Fallback to a logical previous state action type
        let nextActionType = log.action_type;
        if (log.action_type === 'resolution' && updatedResolutions.length === 0) {
          if (hasTasks) nextActionType = 'task_created';
          else if (hasHolds) nextActionType = 'hold';
          else if (hasReminders) nextActionType = 'reminder_sent';
          else nextActionType = 'comment';
        }

        await supabase.from('document_workflow_logs').update({
          resolutions: updatedResolutions,
          action_type: nextActionType,
          updated_at: new Date().toISOString()
        }).eq('id', logId);
      }

      toast({
        title: 'Success',
        description: 'Resolution reverted. Document is now available to be linked to workflows.'
      });

      // Trigger a re-fetch
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      console.error('Revert error:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to revert resolution.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveAllDocuments = useCallback(async () => {
    if (!stage?.id || !task?.id) {
      toast({ title: 'Error', description: 'Missing stage or task information', variant: 'destructive' });
      return;
    }
    setIsSaving(true);

    try {
      const currentDate = new Date().toISOString();
      const updatedLinkedDocs = { ...linkedDocuments };
      const updatedSourceDocs = { ...selectedSourceDocs };
      const uploadedDocIds = new Set<string>();
      const uploadedDocumentsForWorkflow: Array<{ id: string; document_id: string; stage_doc_id: string }> = [];

      const fieldMetadataByDocId = Object.entries(docFieldsMap).reduce((acc, [docId, fields]) => {
        const fieldIdToName = new Map();
        const validFieldNames = new Set();

        const collectFieldInfo = (fieldList: any[]) => {
          if (!Array.isArray(fieldList)) return;
          fieldList.forEach((field: any) => {
            if (field.id && field.name) fieldIdToName.set(field.id, field.name);
            if (field.name) validFieldNames.add(field.name);

            if (field.fields) collectFieldInfo(field.fields);
            if (field.arrayConfig?.fields) collectFieldInfo(field.arrayConfig.fields);
          });
        };

        collectFieldInfo(fields as any[]);
        acc[docId] = { fieldIdToName, validFieldNames };
        return acc;
      }, {} as Record<string, { fieldIdToName: Map<any, any>; validFieldNames: Set<any> }>);

      for (const [docId, docData] of Object.entries(pendingDocuments)) {
        if (!docData) continue;

        const baseDocId = docId.split('_')[0];
        const docConfig = applicableDocumentsById[baseDocId];
        if (!docConfig) continue;

        try {
          const file = docData.file;
          let filePath = '';
          let documentId = docData.id || '';

          if (file) {
            // Create a safe filename that preserves the original name while being valid for Supabase storage
            // Replace only problematic characters, keep spaces and other valid characters
            const sanitizedName = file.name
              .replace(/[~`!@#$%^&*()+=\[\]{};':"\\|,<>\/?]/g, '_') // Remove problematic special chars
              .replace(/_{2,}/g, '_') // Replace multiple underscores with single
              .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

            // Add timestamp to prevent conflicts if filename is too long or has issues
            const timestamp = Date.now();
            const finalName = sanitizedName.length > 100
              ? `${sanitizedName.substring(0, 80)}_${timestamp}.pdf`
              : sanitizedName;

            filePath = `individual-documents/${task.individual_id}/${docConfig.kycId}/${finalName}`;

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
            const fieldMetadata = fieldMetadataByDocId[baseDocId];
            const fieldIdToName = fieldMetadata?.fieldIdToName || new Map();
            const validFieldNames = fieldMetadata?.validFieldNames || new Set();

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

          if (documentId && docConfig.kycId) {
            uploadedDocumentsForWorkflow.push({
              id: documentId,
              document_id: docConfig.kycId,
              stage_doc_id: baseDocId
            });
          }

          updatedLinkedDocs[docId] = {
            ...insertedDoc,
            stageDocumentName: docConfig.name,
            kycId: docConfig.kycId,
            insertedDocumentId: documentId,
            fromExistingDocument: !file
          };

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
                const docConfig = applicableDocumentsById[baseDocId];
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
        .from('tm_tasks')
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

      const isWriteUpStage = stage.id === '072b9710-45df-4a05-ba65-01b4ef29d61d';

      // Always execute if it's WriteUp stage, otherwise rely on the workflow trigger map check.
      if (isWriteUpStage || shouldTriggerWorkflowUpdate(stage.id)) {
        try {
          const workflowTargetDocument =
            uploadedDocumentsForWorkflow.find(doc => doc.document_id === task.linked_document_type_id) ||
            uploadedDocumentsForWorkflow[0] ||
            null;
          const finalDocId = workflowTargetDocument?.id || null;

          // Resolve triggering documents logic (Specifically for renewals in Write up stage)
          if (isWriteUpStage && finalDocId) {
            const resolvedDocumentTypeId =
              workflowTargetDocument?.document_id ||
              task.linked_document_type_id;

            if (resolvedDocumentTypeId) {
              await resolveOriginalDocumentWorkflow(finalDocId, resolvedDocumentTypeId);
            }
          }

          // Also execute the standard Document Workflow action mapped to this stage
          if (shouldTriggerWorkflowUpdate(stage.id)) {
            const existingWorkflowDoc = Object.values(workflowDocuments).find(
              (doc: any) => {
                return doc.document_type_id === task.linked_document_type_id &&
                  doc.isCompleted === true &&
                  ['renewed_by_client', 'renewed', 'task_completed', 'task_endorsed'].includes(doc.workflowOutcome)
              }
            );

            let workflowOutcome = WORKFLOW_OUTCOME_LABELS[TASK_STAGE_WORKFLOW_MAPPING[stage.id]];

            if (existingWorkflowDoc && isWriteUpStage) {
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
            }
          }
        } catch (workflowError) {
          console.error('Error updating workflow:', workflowError);
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
  }, [stage, task, pendingDocuments, linkedDocuments, selectedSourceDocs, onTaskAction, onOpenChange, applicableDocumentsById, docFieldsMap, workflowDocuments]);

  const handleUploadSuccess = useCallback((newDocument: any, originatingDoc: any) => {
    if (!originatingDoc?.id) return;

    setPendingDocuments(prev => {
      const updated = { ...prev };

      Object.keys(updated).forEach(key => {
        if (key === originatingDoc.id || key.startsWith(`${originatingDoc.id}_`)) {
          delete updated[key];
        }
      });

      if (!newDocument || Object.keys(newDocument).length === 0 || (newDocument.files && newDocument.files.length === 0)) {
        return updated;
      }

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
                    {hasSpecialDocuments && (
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
              {pendingDocumentCount > 0 && (
                <span className="text-sm text-muted-foreground">
                  {pendingDocumentCount} document(s) pending save
                </span>
              )}
              <Button
                disabled={pendingDocumentCount === 0 || isSaving}
                onClick={saveAllDocuments}
                className="ml-4"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  `Save All (${pendingDocumentCount})`
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
                  <StageUploadDialogLoadingState />
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
                        onRevertResolution={handleRevertResolution}
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
