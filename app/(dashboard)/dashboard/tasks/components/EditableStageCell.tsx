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
  linkedDocuments?: any[]
  isDocumentRow?: boolean
  documentData?: any
  onAutomationClick?: (e: React.MouseEvent, documentData?: any) => void
  departments?: any[]
  renderMode?: 'date' | 'actions'  // NEW: Specify what to render
}

// Helper functions remain the same
const isDocumentApplicable = (doc: any, task: any): boolean => {
  if (!doc || !task) return false;
  if (!doc.isSpecial) return true;

  const taskClassId = task.class_id?.toString();
  const taskSubdeptId = task.subdepartment?.id?.toString() || task.subdepartment_id?.toString();

  if (Array.isArray(doc.targetEntities) && doc.targetEntities.length > 0) {
    return doc.targetEntities.some((entity: any) => {
      const classMatch = !entity.class_id || entity.class_id.toString() === taskClassId;
      const subdeptMatch = !entity.subdept_id || entity.subdept_id.toString() === taskSubdeptId;
      return classMatch && subdeptMatch;
    });
  }

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

const isStageApplicableToTask = (stage: any, task: any, departments: any[] = []): boolean => {
  if (!task || !stage || !Array.isArray(departments) || departments.length === 0) {
    return true;
  }

  try {
    const dept = departments.find(d => d?.id === (task.department?.id || task.department_id));
    if (!dept) return true;

    const subdept = dept.tm_subdepartments?.find((s: any) => s?.id === (task.subdepartment?.id || task.subdepartment_id));
    if (!subdept) return true;

    if (task.class_id) {
      const cls = subdept.classes?.find((c: any) => c?.id?.toString() === task.class_id?.toString());
      const classStage = cls?.stages?.find((s: any) => s.stage_id === stage.id);
      if (classStage && typeof classStage.applicable === 'boolean') {
        return classStage.applicable;
      }
    }

    const subdeptStage = subdept.stages?.find((s: any) => s.stage_id === stage.id);
    if (subdeptStage && typeof subdeptStage.applicable === 'boolean') {
      return subdeptStage.applicable;
    }

    return true;
  } catch (error) {
    console.error('Error in isStageApplicableToTask:', error);
    return true;
  }
};

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
  linkedDocuments = [],
  documentData = null,
  departments,
  renderMode = 'date'  // Default to date mode
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
    if (!requiresUpload || linkedDocuments.length === 0) {
      return null;
    }
    const firstDoc = linkedDocuments[0];
    return firstDoc;
  }, [linkedDocuments, requiresUpload, stage.id, stage.name]);

  const hasLinkedDocument = useMemo(() => !!linkedDocument && !linkedDocument.indicator, [linkedDocument]);

  const stageDate = useMemo(() => {
    const dateFields = [
      'application_date', 'date', 'upload_date', 'created_date',
      'date_and_time_generated', 'invoice_date_and_time', 'With_Effect_From',
      'Expiry_Date', 'Date_of_Issue'
    ];

    const stageData = task?.stages?.[stage.id];
    const hasDocumentsUploaded = stageData?.documentsUploaded !== undefined && stageData?.documentsUploaded !== null;

    // PRIORITY 1: Document stages - use extracted dates
    if ((requiresUpload || hasDocumentsUploaded) && hasLinkedDocument) {
      if (linkedDocument.extracted_details) {
        const extractedDate = findDateInObject(linkedDocument.extracted_details, dateFields);
        if (extractedDate) return extractedDate;
      }

      if (linkedDocument.extracted_data) {
        const extractedDate = findDateInObject(linkedDocument.extracted_data, dateFields);
        if (extractedDate) return extractedDate;
      }

      return '';
    }

    // PRIORITY 2: Non-document stages - use completion date from value prop
    if (!requiresUpload && !hasDocumentsUploaded && value) {
      return typeof value === 'string' ? value : '';
    }

    return '';
  }, [hasLinkedDocument, linkedDocument, requiresUpload, value, task, stage.id, stage.name]);

  const isStageApplicable = useMemo(() => isStageApplicableToTask(stage, task, departments), [stage, task, departments]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
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

      const previewData = {
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

      return previewData;
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
      toast({ title: 'Error', description: 'Failed to save document data.', variant: 'destructive' });
    }
  }, [onSave, previewDocument, stage.id, task.id]);

  // ========================================
  // RENDER MODE: DATE COLUMN
  // ========================================
  if (renderMode === 'date') {
    if (!isStageApplicable) {
      return <span className="text-sm text-gray-400 italic">N/A</span>;
    }

    // Date editing mode for non-document stages
    if (isEditing && !requiresUpload) {
      return (
        <div className="flex items-center gap-2 min-w-[150px]">
          <Input
            ref={inputRef}
            type="date"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="text-sm h-7"
            disabled={isLoading}
          />
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600" onClick={handleSave} disabled={isLoading}>
            <Check className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600" onClick={handleCancel} disabled={isLoading}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    // Display date or "Add Date" button
    if (stageDate && stageDate !== 'NaN/NaN/NaN') {
      return (
        <div
          className="flex items-center gap-2 group cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            if (!requiresUpload) setIsEditing(true);
          }}
        >
          <Badge
            variant="default"
            className="bg-green-100 text-green-800 hover:bg-green-200"
          >
            <Check className="h-3 w-3 mr-1" />
            {formatDateDisplay(stageDate)}
          </Badge>
        </div>
      );
    }

    // No date available
    if (!requiresUpload) {
      return (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-3 text-gray-600 border border-dashed border-gray-300 hover:border-gray-400"
          onClick={() => setIsEditing(true)}
        >
          <Calendar className="h-3 w-3 mr-1" />
          Add Date
        </Button>
      );
    }

    // Document stage without linked document
    return <span className="text-sm text-gray-500 italic">-</span>;
  }

  // ========================================
  // RENDER MODE: ACTIONS COLUMN
  // ========================================
  if (renderMode === 'actions') {
    if (!isStageApplicable) {
      return <span className="text-sm text-gray-400 italic">-</span>;
    }

    const hasAutomation = !!(stage?.automation?.automationId || stage?.automation?.id || stage?.web_automation?.automationId);
    const hasAnyAutomation = requiresUpload && stage.documents?.some((doc: any) =>
      isDocumentApplicable(doc, task) && (doc.automationId || doc.automation?.id)
    );

    return (
      <div className="flex items-center justify-center gap-1">
        {/* Automation button */}
        {(hasAutomation || hasAnyAutomation) && !hasLinkedDocument && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-amber-500 hover:bg-amber-50"
            onClick={handleTriggerAutomation}
            disabled={isAutomationRunning}
            title="Run automation"
          >
            {isAutomationRunning ? <Clock className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          </Button>
        )}

        {/* View document button */}
        {hasLinkedDocument && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-green-600 hover:bg-green-50"
            onClick={handleViewDocument}
            title="View document details"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* Upload document button */}
        {requiresUpload && (
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${hasLinkedDocument ? 'text-blue-400 hover:bg-blue-50' : 'text-blue-600 hover:bg-blue-50'}`}
            onClick={handleDocumentUpload}
            title={hasLinkedDocument ? 'Upload new document' : 'Upload document'}
          >
            <Upload className="h-3.5 w-3.5" />
          </Button>
        )}

      </div>
    );
  }

  // Fallback (shouldn't reach here)
  return null;
}