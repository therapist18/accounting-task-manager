// @ts-nocheck
"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Upload, Calendar, Check, X, Clock, Eye, AlertTriangle, Zap, Loader2, Pencil } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { format, parse, isValid } from "date-fns"
import { AutomationMappingDialog } from "./AutomationMappingDialog"
import { ExtractionPreview } from "@/components/ExtractionPreview"

interface EditableStageCellProps {
  stage: any
  task: any
  value?: string | null
  onSave?: (
    stageId: string,
    taskId: string,
    value: string,
    updatedExtractedDetails?: Record<string, any>
  ) => Promise<void> | void
  onDocumentUpload?: (task: any, stage: any) => void
  onShowDocuments?: (task: any, stage: any) => void
  getKycFields?: (documentConfig: any) => Promise<any[]>
  allDocuments?: any[]
  isDocumentRow?: boolean
  documentData?: any
  onAutomationClick?: (e: React.MouseEvent, documentData?: any) => void
  departments?: any[]
}

// Helper function to check if document is older than task creation
const isDocumentOlderThanTask = (documentDate: string, taskDate: string): boolean => {
  if (!documentDate || !taskDate) return false;
  try {
    const docDate = new Date(documentDate);
    const tskDate = new Date(taskDate);
    return docDate < tskDate;
  } catch (error) {
    console.error('Error comparing dates:', error);
    return false;
  }
};

const getLinkedDocumentForStage = (task: any, stage: any, allDocuments: any[]): any | null => {
  const sourceDocId = task?.source_document_id;
  if (!sourceDocId || !stage?.id || !Array.isArray(allDocuments)) return null;

  let documentId: string | undefined;

  // Handle case where source_document_id is an object mapping stage IDs to document arrays
  if (typeof sourceDocId === 'object') {
    const stageDocuments = sourceDocId[stage.id];
    if (Array.isArray(stageDocuments) && stageDocuments.length > 0) {
      const documentRef = stageDocuments[0]; // Assuming the first document is the relevant one
      documentId = documentRef.id || documentRef.document_id;
    }
  }

  if (!documentId) return null;

  // Find the full document object from the allDocuments list
  return allDocuments.find(doc => doc.id === documentId || doc.document_id === documentId) || null;
};

// Helper function to check if a document is applicable to the current task
const isDocumentApplicable = (doc: any, task: any): boolean => {
  if (!doc || !task) return false;
  if (!doc.isSpecial) return true;

  const taskClassId = task.class_id?.toString();
  const taskSubdeptId = task.subdepartment?.id?.toString() || task.subdepartment_id?.toString();

  // New targetEntities logic
  if (Array.isArray(doc.targetEntities) && doc.targetEntities.length > 0) {
    return doc.targetEntities.some((entity: any) => {
      const classMatch = !entity.class_id || entity.class_id.toString() === taskClassId;
      const subdeptMatch = !entity.subdept_id || entity.subdept_id.toString() === taskSubdeptId;
      return classMatch && subdeptMatch;
    });
  }

  // Legacy entityType logic
  const docClassId = doc.class_id?.toString();
  const docSubdeptId = doc.subdept_id?.toString();
  const docSubclassId = doc.subclass_id?.toString();

  switch (doc.entityType) {
    case 'class':
      if (docSubdeptId) return taskClassId === docClassId && taskSubdeptId === docSubdeptId;
      return taskClassId === docClassId;
    case 'subdept':
      return taskSubdeptId === docSubdeptId;
    case 'subclass':
      return taskSubdeptId === docSubdeptId && taskClassId === docClassId && task.subclass_id?.toString() === docSubclassId;
    default:
      if (docClassId && docSubdeptId) return taskSubdeptId === docSubdeptId && taskClassId === docClassId;
      if (docSubdeptId) return taskSubdeptId === docSubdeptId;
      return false;
  }
};

// Optimized and robust stage applicability check
const isStageApplicableToTask = (stage: any, task: any, departments: any[] = []): boolean => {
  if (!task || !stage || !Array.isArray(departments) || departments.length === 0) {
    return true; // Default to applicable if data is missing
  }

  try {
    const dept = departments.find(d => d?.id === (task.department?.id || task.department_id));
    if (!dept) return true;

    const subdept = dept.tm_subdepartments?.find((s: any) => s?.id === (task.subdepartment?.id || task.subdepartment_id));
    if (!subdept) return true;

    // Check class-level override (most specific)
    if (task.class_id) {
      const cls = subdept.classes?.find((c: any) => c?.id?.toString() === task.class_id?.toString());
      const classStage = cls?.stages?.find((s: any) => s.stage_id === stage.id);
      if (classStage && typeof classStage.applicable === 'boolean') {
        return classStage.applicable;
      }
    }

    // Fallback to subdepartment-level override
    const subdeptStage = subdept.stages?.find((s: any) => s.stage_id === stage.id);
    if (subdeptStage && typeof subdeptStage.applicable === 'boolean') {
      return subdeptStage.applicable;
    }

    return true; // Default to applicable if no override is found
  } catch (error) {
    console.error('Error in isStageApplicableToTask:', error);
    return true; // Failsafe
  }
};

// Helper function to find a date in a potentially nested object
const findDateInObject = (obj: any, dateFields: string[]): string | null => {
  if (!obj || typeof obj !== 'object') return null;

  for (const key in obj) {
    if (dateFields.includes(key) && typeof obj[key] === 'string') {
      return obj[key];
    }
    if (typeof obj[key] === 'object') {
      const nestedDate = findDateInObject(obj[key], dateFields);
      if (nestedDate) return nestedDate;
    }
  }
  return null;
};

// Main Component
export default function EditableStageCell({
  stage,
  task,
  value,
  onSave,
  onDocumentUpload,
  onShowDocuments,
  allDocuments = [],
  isDocumentRow = false,
  documentData = null,
  departments
}: EditableStageCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const requiresUpload = useMemo(() => stage.documents && stage.documents.length > 0, [stage.documents]);

  const linkedDocument = useMemo(() => {
    if (!requiresUpload) return null;
    return getLinkedDocumentForStage(task, stage, allDocuments);
  }, [task, stage, allDocuments, requiresUpload]);

  const isOldDocument = useMemo(() => {
    if (!linkedDocument || !task.created_at) return false;
    return isDocumentOlderThanTask(linkedDocument.created_at, task.created_at);
  }, [linkedDocument, task.created_at]);

  const hasLinkedDocument = useMemo(() => !!linkedDocument && !linkedDocument.indicator && !isOldDocument, [linkedDocument, isOldDocument]);

  const stageDate = useMemo(() => {
    if (!hasLinkedDocument || !linkedDocument.extracted_details) return '';
    const dateFields = [
      'application_date', 'date', 'upload_date', 'created_date',
      'date_and_time_generated', 'invoice_date_and_time', 'With_Effect_From',
      'Expiry_Date', 'Date_of_Issue'
    ];
    return findDateInObject(linkedDocument.extracted_details, dateFields) || '';
  }, [hasLinkedDocument, linkedDocument]);

  const isStageApplicable = useMemo(() => isStageApplicableToTask(stage, task, departments), [stage, task, departments]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    // Set initial edit value when editing starts or stageDate changes
    if (stageDate && stageDate !== 'NaN/NaN/NaN') {
      const parsedDate = parse(stageDate, 'dd/MM/yyyy', new Date());
      if (isValid(parsedDate)) {
        setEditValue(format(parsedDate, 'yyyy-MM-dd'));
      }
    } else {
      setEditValue('');
    }
  }, [stageDate]);

  const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    const formatsToTry = ['dd/MM/yyyy', 'yyyy-MM-dd'];
    for (const fmt of formatsToTry) {
      const date = parse(dateStr, fmt, new Date());
      if (isValid(date)) {
        return format(date, 'dd/MM/yyyy');
      }
    }
    return dateStr;
  };

  const handleSave = useCallback(async () => {
    if (!onSave) {
      toast({ title: "Error", description: "Save handler not available", variant: "destructive" });
      return;
    }

    const dateObj = parse(editValue, 'yyyy-MM-dd', new Date());
    if (!editValue.trim() || !isValid(dateObj)) {
      toast({ title: "Error", description: "Please enter a valid date", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const formattedDate = format(dateObj, 'dd/MM/yyyy');
      // Logic to update extracted_details can be added here if needed
      await onSave(stage.id, task.id, formattedDate, linkedDocument?.extracted_details || {});
      setIsEditing(false);
      toast({ title: "Success", description: "Date saved successfully" });
    } catch (error) {
      console.error('Date save error:', error);
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to save date", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [editValue, onSave, stage.id, task.id, linkedDocument]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    // Reset value back to original
    if (stageDate) {
      const parsedDate = parse(stageDate, 'dd/MM/yyyy', new Date());
      if (isValid(parsedDate)) {
        setEditValue(format(parsedDate, 'yyyy-MM-dd'));
      }
    } else {
      setEditValue('');
    }
  }, [stageDate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') handleCancel();
  }, [handleSave, handleCancel]);

  const handleDocumentUpload = useCallback(() => {
    onDocumentUpload?.(task, stage);
  }, [onDocumentUpload, task, stage]);

  const handleTriggerAutomation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setAutomationDialogOpen(true);
  }, []);

  const fetchKycDocumentData = useCallback(async (kycId: string) => {
    try {
      const { data, error } = await supabase
        .from('acc_portal_kyc')
        .select('id, fields, name, display_name, document_type')
        .eq('id', kycId)
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching KYC document:', error);
      return null;
    }
  }, []);

  const transformKycFieldsToPreviewFormat = useCallback((kycFields: any[]): any[] => {
    if (!Array.isArray(kycFields)) return [];
    return kycFields.map((field: any) => ({
      id: field.id || field.fieldName || field.name,
      name: field.fieldName || field.name || field.id,
      type: field.type === 'array' || field.isArray ? 'array' : (field.fieldType || field.type || 'text'),
      isArray: field.type === 'array' || field.isArray === true,
      required: field.isRequired !== false,
      description: field.description || '',
      arrayConfig: (field.type === 'array' || field.isArray) && field.arrayConfig ? {
        maxItems: field.arrayConfig.maxItems || 10,
        fields: transformKycFieldsToPreviewFormat(field.arrayConfig.fields || []),
      } : undefined,
    }));
  }, []);

  const buildPreviewDocumentData = useCallback(async () => {
    if (!linkedDocument) {
      toast({ title: 'No Document', description: 'No document is linked to this stage.', variant: 'default' });
      return null;
    }

    try {
      const kycDoc = await fetchKycDocumentData(linkedDocument.document_id);
      if (!kycDoc) {
        toast({ title: 'Error', description: 'Could not load document configuration.', variant: 'destructive' });
        return null;
      }

      return {
        documentId: linkedDocument.id,
        documentName: kycDoc.display_name || kycDoc.name || 'Document',
        fileUrl: linkedDocument.file_path || linkedDocument.download_url,
        fileName: linkedDocument.file_path?.split('/').pop() || 'document.pdf',
        extractedData: linkedDocument.extracted_data || {},
        fields: transformKycFieldsToPreviewFormat(kycDoc.fields || []),
        kycDoc,
        document: linkedDocument,
        type: kycDoc.document_type || 'document',
        file: {
          url: linkedDocument.file_path || linkedDocument.download_url,
          name: linkedDocument.file_name || linkedDocument.file_path?.split('/').pop() || 'document.pdf',
          type: linkedDocument.file_type || 'application/pdf'
        }
      };
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to prepare document preview.', variant: 'destructive' });
      return null;
    }
  }, [linkedDocument, fetchKycDocumentData, transformKycFieldsToPreviewFormat]);

  const handleViewDocument = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    const previewData = await buildPreviewDocumentData();
    if (previewData) {
      setPreviewDocument(previewData);
      setIsPreviewOpen(true);
    }
    setIsLoading(false);
  }, [buildPreviewDocumentData]);

  const handlePreviewSave = useCallback(async (data: any) => {
    if (!onSave || !previewDocument?.documentId) return;
    try {
      await onSave(stage.id, task.id, 'completed', { extractedData: data });
      toast({ title: 'Success', description: 'Document data saved successfully.' });
      setIsPreviewOpen(false);
    } catch (error) {
      console.error('Error saving document data:', error);
      toast({ title: 'Error', description: 'Failed to save document data.', variant: 'destructive' });
    }
  }, [onSave, previewDocument, stage.id, task.id]);


  // RENDER LOGIC
  if (isEditing && !requiresUpload) {
    return (
      <div className="flex items-center gap-2 min-w-[200px]">
        <Input
          ref={inputRef}
          type="date"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="text-sm"
          disabled={isLoading}
        />
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600" onClick={handleSave} disabled={isLoading}><Check className="h-3 w-3" /></Button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600" onClick={handleCancel} disabled={isLoading}><X className="h-3 w-3" /></Button>
      </div>
    );
  }

  const renderContent = () => {
    if (!isDocumentRow && !isStageApplicable) {
      return <span className="text-gray-400">N/A</span>;
    }

    if (isDocumentRow) {
      if (!isDocumentApplicable(documentData, task)) {
        return <span className="text-gray-400">N/A</span>;
      }
      const docValue = typeof value === 'object' ? value : { status: value };
      const hasAutomation = !!(documentData?.automation?.automationId || documentData?.automation?.id);

      return (
        <div className="flex items-center gap-2 justify-center">
          <span>{docValue.status}</span>
          {docValue.hasDocument && !docValue.hasIndicator && !docValue.isOldDocument ? (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600" onClick={handleViewDocument} title="View details"><Eye className="h-3 w-3" /></Button>
          ) : (docValue.status === 'Not Linked' && hasAutomation) && (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-500" title="Run Automation" onClick={handleTriggerAutomation}><Zap className="h-3 w-3" /></Button>
          )}
        </div>
      );
    }

    if (requiresUpload) {
      const hasAnyAutomation = stage.documents.some((doc: any) => isDocumentApplicable(doc, task) && (doc.automationId || doc.automation?.id));

      return (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">{stageDate && <div className="text-xs text-gray-600 text-center mt-1">{formatDateDisplay(stageDate)}</div>}</div>
          <div className="col-span-1 flex gap-1">
            {!hasLinkedDocument && hasAnyAutomation && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-500" onClick={handleTriggerAutomation} title="Run automation"><Zap className="h-4 w-4" /></Button>
            )}
            {hasLinkedDocument && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={handleViewDocument} title="View details"><Eye className="h-4 w-4" /></Button>
            )}
            <Button variant="ghost" size="icon" className={`h-8 w-8 ${hasLinkedDocument ? 'text-blue-400' : 'text-blue-600'}`} onClick={handleDocumentUpload} title={hasLinkedDocument ? 'Upload new' : 'Upload document'}><Upload className="h-4 w-4" /></Button>
            {isOldDocument && (
              <div className="h-8 w-8 flex items-center justify-center" title="Document is older than task creation"><AlertTriangle className="h-4 w-4 text-orange-500" /></div>
            )}
          </div>
        </div>
      );
    }

    // Non-upload stages
    const hasAutomation = !!(stage?.automation?.automationId || stage?.automation?.id || stage?.web_automation?.automationId);
    return (
      <div className="flex items-center gap-2" onClick={() => !stageDate && setIsEditing(true)}>
        {hasAutomation && (
          <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-500" onClick={handleTriggerAutomation} disabled={isAutomationRunning} title="Run automation">
            {isAutomationRunning ? <Clock className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          </Button>
        )}
        {stageDate && stageDate !== 'NaN/NaN/NaN' ? (
          <div className="flex items-center gap-2 group cursor-pointer">
            <Badge variant="default" className="bg-green-100 text-green-800"><Check className="h-3 w-3 mr-1" />{formatDateDisplay(stageDate)}</Badge>
            <Pencil className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" />
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="h-8 px-3 text-gray-600 border border-dashed border-gray-300">
            <Calendar className="h-3 w-3 mr-1" />Add Date
          </Button>
        )}
      </div>
    );
  };

  const automationId = isDocumentRow
    ? documentData?.automation?.automationId || documentData?.automation?.id
    : stage?.web_automation?.automationId || stage?.web_automation?.id;

  return (
    <>
      <AutomationMappingDialog
        isOpen={automationDialogOpen}
        onClose={() => setAutomationDialogOpen(false)}
        taskId={task.id}
        automationId={automationId}
        task={task}
        stage={stage}
        allDocuments={allDocuments}
      />

      <div className="flex items-center justify-center min-h-[32px] rounded p-1">
        {renderContent()}
      </div>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-[90vw] w-full max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Preview: {previewDocument?.document_display_name} - {previewDocument?.company_name}</DialogTitle></DialogHeader>
          <div className="flex-grow overflow-y-auto p-1 space-y-4">
            <div className="border rounded-lg">
              <div className="p-3 bg-gray-50 border-b ">
                <h3 className="font-medium text-sm">Document (Uploaded: {previewDocument?.created_at ? formatDateDisplay(previewDocument.created_at) : 'N/A'})</h3>
              </div>
              <div className="p-2">
                <div className="flex-1 overflow-auto border rounded-lg">
                  {previewDocument ? (
                    <ExtractionPreview
                      key={previewDocument.documentId}
                      documentName={previewDocument.documentName}
                      extractedData={previewDocument.extractedData}
                      fields={previewDocument.fields}
                      fileUrl={previewDocument.fileUrl}
                      fileName={previewDocument.fileName}
                      onSave={handlePreviewSave}
                      expanded={true}
                      showSaveButton={!!onSave}
                      type={previewDocument.type}
                      file={previewDocument.file}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /><p className="ml-4">Loading preview...</p></div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}