// @ts-nocheck
"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Upload, Calendar, Check, X, Clock, Eye, AlertTriangle, Zap, Loader2, Pencil, SkipForward, Clock3 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { format, parse, isValid } from "date-fns"
import { AutomationMappingDialog } from "./AutomationMappingDialog"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { formatDuration, getTimeStatus, isDocumentApplicable, parseDate } from "../overall-view/tableUtils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface EditableStageCellProps {
  stage: any
  stages?: any[]
  task: any
  value?: string | null
  onSave?: (stageId: string, taskId: string, value: string, updatedExtractedDetails?: Record<string, any>) => Promise<void> | void
  onDocumentUpload?: (task: any, stage: any) => void
  onShowDocuments?: (task: any, stage: any) => void
  getKycFields?: (documentConfig: any) => Promise<any[]>
  allDocuments?: any[]
  linkedDocuments?: any[]
  isDocumentRow?: boolean
  documentData?: any
  onAutomationClick?: (e: React.MouseEvent, documentData?: any) => void
  departments?: any[]
  renderMode?: 'date' | 'actions'
  taskName?: string
  clientName?: string
  onFetchData?: () => Promise<void>;
}

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
  stages = [],
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
  renderMode = 'date',
  taskName,
  clientName,
  onFetchData
}: EditableStageCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);
  const [previewDocuments, setPreviewDocuments] = useState<any[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [isSkipDialogOpen, setIsSkipDialogOpen] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [selectedSkipReason, setSelectedSkipReason] = useState('');
  const [isCheckingPreviousStages, setIsCheckingPreviousStages] = useState(false);
  useEffect(() => {
    if (previewDocuments.length > 0) {
      console.log('Preview Documents:', previewDocuments.map(doc => ({
        documentName: doc.documentName,
        hasExtractedData: !!doc.extractedData,
        fileUrl: doc.fileUrl
      })));
    }
  }, [previewDocuments, task]);

  const inputRef = useRef<HTMLInputElement>(null);

  const handlePreviewDataChange = useCallback((docId: string, fieldName: string, value: any) => {
    setPreviewDocuments(prev =>
      prev.map(doc =>
        doc.documentId === docId
          ? {
            ...doc,
            extractedData: {
              ...(doc.extractedData || {}),
              [fieldName]: value
            }
          }
          : doc
      )
    );
  }, []);

  const requiresUpload = useMemo(() => stage.documents && stage.documents.length > 0, [stage.documents]);

  const linkedDocument = useMemo(() => {
    if (!requiresUpload || linkedDocuments.length === 0) {
      return null;
    }
    const firstDoc = linkedDocuments[0];
    return firstDoc;
  }, [linkedDocuments, requiresUpload, stage.id, stage.name]);

  const hasLinkedDocument = useMemo(() => {
    if (!linkedDocument) {
      return false;
    }

    const hasDocument = linkedDocument.file_path ||
      linkedDocument.url ||
      linkedDocument.document_url ||
      linkedDocument.extracted_details ||
      linkedDocument.extracted_data;

    if (!hasDocument) {
      return false;
    }

    const isApplicable = isDocumentApplicable(linkedDocument, task);
    if (!isApplicable) {
      return false;
    }

    return true;
  }, [linkedDocument, task]);

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

  const isStageCompleted = useMemo(() => {
    return task.stages?.[stage.id]?.status === 'completed' || task.stages?.[stage.id]?.status === 'skipped';
  }, [task.stages, stage.id]);

  // --- NEW: Time Calculation Logic ---
  const effectiveStartTime = useMemo(() => {
    if (!stages || stages.length === 0) return task.created_at || task.date_initiated;

    const sortedStages = [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
    const currentStageIndex = sortedStages.findIndex(s => s.id === stage.id);

    if (currentStageIndex > 0) {
      const prevStage = sortedStages[currentStageIndex - 1];
      const prevStageData = task.stages?.[prevStage.id];
      if (prevStageData?.completedAt) return prevStageData.completedAt;
      if (prevStageData?.date) return prevStageData.date;
      if (prevStageData?.status === 'skipped' && prevStageData.skippedAt) return prevStageData.skippedAt;
    }

    return task.date_initiated || task.created_at;
  }, [task, stage.id, stages]);

  const timeStatus = useMemo(() => {
    return getTimeStatus(effectiveStartTime, stage.estimated_time);
  }, [effectiveStartTime, stage.estimated_time]);


  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (stageDate && stageDate !== 'NaN/NaN/NaN') {
      // Try parsing with time first, then fall back to date only
      let parsedDate = parse(stageDate, "yyyy-MM-dd'T'HH:mm", new Date());
      if (!isValid(parsedDate)) {
        parsedDate = parse(stageDate, 'dd/MM/yyyy', new Date());
      }
      if (isValid(parsedDate)) {
        setEditValue(format(parsedDate, "yyyy-MM-dd'T'HH:mm"));
      }
    } else {
      setEditValue('');
    }
  }, [stageDate]);

  const formatDateDisplay = (dateStr: string, status?: string, skippedAt?: string): string => {
    if (status === 'skipped') {
      if (skippedAt) {
        try {
          const date = new Date(skippedAt);
          if (isValid(date)) {
            return `Skipped (${format(date, 'dd/MM/yyyy HH:mm')})`;
          }
        } catch (e) {
          console.error('Error formatting skipped date:', e);
        }
      }
      return 'Skipped';
    }

    if (!dateStr) return '';

    // Try datetime format first
    const dateTimeFormats = [
      "yyyy-MM-dd'T'HH:mm",
      'dd/MM/yyyy HH:mm',
      'yyyy-MM-dd',
      'dd/MM/yyyy',
      'MM/dd/yyyy',
      'dd-MM-yyyy'
    ];

    for (const formatStr of dateTimeFormats) {
      const parsedDate = parse(dateStr, formatStr, new Date());
      if (isValid(parsedDate)) {
        return format(parsedDate, 'dd/MM/yyyy HH:mm');
      }
    }

    return dateStr;
  };

  const handleSave = useCallback(async (isSkipped = false, skipReason = '') => {
    if (!onSave) {
      toast({ title: "Error", description: "Save handler not available", variant: "destructive" });
      return;
    }

    if (isSkipped) {
      // Skip date validation for skipped stages
      await onSave(stage.id, task.id, '', {
        ...(linkedDocument?.extracted_details || {}),
        status: 'skipped',
        skippedAt: new Date().toISOString(),
        skippedBy: 'userId',
        reason: skipReason || selectedSkipReason || 'Not specified',
      });
      setIsEditing(false);
      setIsSkipDialogOpen(false);
      toast({ title: "Success", description: "Stage marked as skipped" });
      return;
    }

    // Handle date with time
    let dateObj = new Date(editValue);

    // If time is not specified (00:00), set it to 9:00 AM
    if (editValue && editValue.endsWith('T00:00')) {
      const [datePart] = editValue.split('T');
      dateObj = new Date(`${datePart}T09:00`);
    }

    const formattedDate = format(dateObj, "dd/MM/yyyy HH:mm");

    if (!editValue.trim() || !isValid(dateObj)) {
      toast({ title: "Error", description: "Please enter a valid date and time", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      await onSave(stage.id, task.id, formattedDate, {
        ...(linkedDocument?.extracted_details || {}),
        status: 'completed',
      });

      setIsEditing(false);
      toast({
        title: "Success",
        description: "Date saved successfully"
      });
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [editValue, onSave, stage.id, task.id, linkedDocument, selectedSkipReason]);

  const checkPreviousStages = useCallback(async () => {
    if (!task.stages || !stages || stages.length === 0) return true;

    const currentStageIndex = stages.findIndex(s => s.id === stage.id);
    if (currentStageIndex <= 0) return true; // First stage, nothing to check

    // Check all previous stages
    for (let i = 0; i < currentStageIndex; i++) {
      const prevStage = stages[i];
      const stageStatus = task.stages[prevStage.id]?.status;

      if (!stageStatus || (stageStatus !== 'completed' && stageStatus !== 'skipped')) {
        return false; // Found an incomplete stage
      }
    }

    return true; // All previous stages are complete or skipped
  }, [stage.id, stages, task.stages]);

  const handleSkipClick = async () => {
    setIsSkipDialogOpen(true);
  };

  const handleUnskip = async () => {
    if (!onSave) {
      toast({ title: "Error", description: "Save handler not available", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      // Create a clean reset object
      const resetData = {
        ...(linkedDocument?.extracted_details || {}),
        // 👇 CHANGE: Explicitly set status to 'in_progress'
        status: 'in_progress',
        skippedAt: null,
        skippedBy: null,
        reason: null,
        date: null,
        completedAt: null,
        // Ensure we don't have any status flags set
        documentsUploaded: requiresUpload ? false : undefined
      };

      // Call onSave with empty value and the reset data containing the status
      await onSave(stage.id, task.id, '', resetData);

      setEditValue('');

      toast({
        title: "Success",
        description: "Stage reset.",
        variant: "default"
      });

      if (onFetchData) {
        await onFetchData();
      }
    } catch (error) {
      console.error('Error unskipping stage:', error);
      toast({ title: "Error", description: "Failed to reset stage", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const confirmSkip = async () => {
    const allPreviousStagesComplete = await checkPreviousStages();
    if (!allPreviousStagesComplete) {
      const confirmSkip = window.confirm(
        'You have not completed all previous stages. Do you want to skip them and mark this stage as skipped?'
      );

      if (!confirmSkip) {
        setIsSkipDialogOpen(false);
        return;
      }
    }

    handleSave(true, skipReason || selectedSkipReason);
  };

  const handleDeleteDocument = useCallback(async (documentToDelete: any) => {
    if (!documentToDelete) {
      toast({
        title: 'Error',
        description: 'No document to delete',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {
      // 1. Delete file from storage bucket
      if (documentToDelete.file_path) {
        const filePath = documentToDelete.file_path.startsWith('kyc-documents/')
          ? documentToDelete.file_path.substring('kyc-documents/'.length)
          : documentToDelete.file_path;

        const { error: storageError } = await supabase.storage
          .from('kyc-documents')
          .remove([filePath]);

        if (storageError) {
          console.error('Storage deletion error:', storageError);
        }
      }

      // 2. Get the document ID with proper validation
      const documentId = documentToDelete.id || documentToDelete.file?.id || documentToDelete.documentId;

      // Ensure we have a valid ID before attempting to delete
      if (!documentId) {
        throw new Error('Cannot delete document: Missing document ID');
      }

      // 3. Delete document record from database
      const { error: dbError } = await supabase
        .from('acc_portal_directors_documents')
        .delete()
        .eq('id', documentId);

      if (dbError) throw dbError;

      // 4. Update task's stages JSON and source_document_id
      const currentTask = await supabase
        .from('tm_tasks')
        .select('stages, source_document_id')
        .eq('id', task.id)
        .single();

      if (currentTask.error) throw currentTask.error;

      const updatedStages = { ...currentTask.data.stages };
      const updatedSourceDocIds = { ...currentTask.data.source_document_id };

      // 4. Update source_document_id JSON - remove document reference
      if (updatedSourceDocIds[stage.id]) {
        if (Array.isArray(updatedSourceDocIds[stage.id])) {
          updatedSourceDocIds[stage.id] = updatedSourceDocIds[stage.id].filter(
            (doc: any) => {
              const docId = typeof doc === 'string' ? doc : doc.id;
              return docId !== (documentToDelete.id || documentToDelete.file?.id);
            }
          );
          // Remove the stage key if no documents left
          if (updatedSourceDocIds[stage.id].length === 0) {
            delete updatedSourceDocIds[stage.id];
            // Also reset the stage to pending
            if (updatedStages[stage.id]) {
              delete updatedStages[stage.id];
            }
          }
        } else {
          const docId = typeof updatedSourceDocIds[stage.id] === 'string'
            ? updatedSourceDocIds[stage.id]
            : updatedSourceDocIds[stage.id].id;

          if (docId === (documentToDelete.id || documentToDelete.file?.id)) {
            delete updatedSourceDocIds[stage.id];
            // Also reset the stage to pending
            if (updatedStages[stage.id]) {
              delete updatedStages[stage.id];
            }
          }
        }
      }

      // 5. Update the task record
      const { error: updateError } = await supabase
        .from('tm_tasks')
        .update({
          stages: updatedStages,
          source_document_id: updatedSourceDocIds,
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id);

      if (updateError) throw updateError;

      // Update preview documents list
      const updatedPreviewDocs = previewDocuments.filter(
        (doc) => doc.documentId !== (documentToDelete.id || documentToDelete.file?.id)
      );
      setPreviewDocuments(updatedPreviewDocs);

      // Close preview if no more documents
      if (updatedPreviewDocs.length === 0) {
        setIsPreviewOpen(false);
      } else if (currentPreviewIndex >= updatedPreviewDocs.length) {
        setCurrentPreviewIndex(updatedPreviewDocs.length - 1);
      }

      // Trigger a refresh of the task data
      if (onSave) {
        await onSave(stage.id, task.id, '', {});
      }

    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete document',
        variant: 'destructive'
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [stage.id, task.id, onSave, previewDocuments, currentPreviewIndex]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    if (stageDate) {
      const parsedDate = parse(stageDate, 'dd/MM/yyyy', new Date());
      if (isValid(parsedDate)) {
        setEditValue(format(parsedDate, "yyyy-MM-dd'T'HH:mm"));
      }
    } else {
      setEditValue('');
    }
  }, [stageDate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
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

  const buildPreviewDocumentsData = useCallback(async (documents: any[]) => {
    if (!documents || documents.length === 0) {
      console.log('No documents found for preview');
      return [];
    }

    const previewDocuments = [];

    for (const doc of documents) {
      try {
        const kycDoc = await fetchKycDocumentData(doc.document_id || doc.id);
        console.log('Fetched KYC doc:', kycDoc);

        if (!kycDoc) {
          console.log('No KYC document configuration found for document:', doc.id);
          continue;
        }

        // Construct the full file URL
        const filePath = doc.file_path || doc.download_url || doc.url || doc.document_url;
        const fileUrl = filePath ?
          (filePath.startsWith('http') ? filePath : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${filePath}`)
          : null;

        const fileName = doc.file_name || filePath?.split('/').pop() || 'document.pdf';
        const documentType = doc.type || kycDoc.document_type || 'document';
        const documentName = kycDoc.display_name || kycDoc.name || doc.name || doc.document_name || 'Document';

        const previewData = {
          documentId: doc.id,
          documentName,
          fileUrl,
          fileName,
          extractedData: doc.extracted_data || doc.extracted_details || {},
          fields: transformKycFieldsToPreviewFormat(kycDoc.fields || []),
          kycDoc,
          document: doc,
          type: documentType,
          documentType,
          file: {
            url: fileUrl,
            name: fileName,
            type: doc.file_type || 'application/pdf'
          },
          created_at: doc.created_at || new Date().toISOString()
        };

        console.log('Built preview data for document:', doc.id, previewData);
        previewDocuments.push(previewData);
      } catch (error) {
        console.error(`Error building preview data for document ${doc.id}:`, error);
        // Continue with other documents even if one fails
      }
    }

    if (previewDocuments.length === 0) {
      toast({
        title: 'Error',
        description: 'Failed to prepare document previews.',
        variant: 'destructive'
      });
    }

    return previewDocuments;
  }, [fetchKycDocumentData, transformKycFieldsToPreviewFormat]);

  const handleViewDocument = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Use linkedDocuments if available, otherwise fall back to linkedDocument for backward compatibility
    const documentsToPreview = linkedDocuments && linkedDocuments.length > 0
      ? linkedDocuments
      : linkedDocument ? [linkedDocument] : [];

    if (documentsToPreview.length === 0) {
      console.log('No documents found to preview');
      return;
    }

    console.log('Opening document preview for documents:', documentsToPreview.map(doc => ({
      documentId: doc.id,
      documentName: doc.name || doc.document_name,
      hasFile: !!(doc.file_path || doc.url || doc.document_url),
      hasExtractedData: !!(doc.extracted_data || doc.extracted_details)
    })));

    setIsLoading(true);
    try {
      const previewDocs = await buildPreviewDocumentsData(documentsToPreview);

      if (previewDocs.length > 0) {
        setPreviewDocuments(previewDocs);
        setCurrentPreviewIndex(0);
        setIsPreviewOpen(true);

        console.log('Preview documents prepared:', previewDocs.map(doc => ({
          documentId: doc.documentId,
          documentName: doc.documentName,
          hasExtractedData: !!doc.extractedData,
          fieldsCount: doc.fields?.length || 0,
          fileUrl: doc.fileUrl
        })));
      } else {
        throw new Error('No valid documents could be prepared for preview');
      }
    } catch (error) {
      console.error('Error in handleViewDocument:', error);
      toast({
        title: 'Error',
        description: 'Failed to open document preview',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [linkedDocument, linkedDocuments, buildPreviewDocumentsData]);

  const handlePreviewSave = useCallback(async (data: any) => {
    if (!onSave || previewDocuments.length === 0) {
      console.error('Missing required data for save:', { onSave, previewDocuments });
      return;
    }

    try {
      const currentDoc = previewDocuments[currentPreviewIndex];
      if (!currentDoc) {
        throw new Error('No active document to save');
      }

      console.log('Saving document data:', {
        stageId: stage.id,
        taskId: task.id,
        documentId: currentDoc.documentId,
        extractedData: data
      });

      // Call onSave with the extracted data
      await onSave(
        stage.id,
        task.id,
        'completed',
        {
          extractedData: data,
          documentId: currentDoc.documentId
        }
      );

      // Update local state
      const updatedDocs = [...previewDocuments];
      updatedDocs[currentPreviewIndex] = {
        ...currentDoc,
        extractedData: { ...data }
      };
      setPreviewDocuments(updatedDocs);

      // Call the fetch function to refresh the data
      if (onFetchData) {
        await onFetchData();
      }

      toast({
        title: 'Success',
        description: 'Document data saved and refreshed successfully.'
      });

      // Move to next document or close
      if (currentPreviewIndex >= previewDocuments.length - 1) {
        setIsPreviewOpen(false);
      } else {
        setCurrentPreviewIndex(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error saving document data:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save document data.',
        variant: 'destructive'
      });
    }
  }, [onSave, previewDocuments, currentPreviewIndex, stage.id, task.id, onFetchData]);

 if (renderMode === 'date') {
    if (!isStageApplicable) return <span className="text-sm text-gray-400 italic">N/A</span>;
    
    const stageData = task.stages?.[stage.id];
    const stageStatus = stageData?.status;
    const isSkipped = stageStatus === 'skipped';

    // 1. SKIPPED STATUS
    if (isSkipped) {
      const skippedAt = stageData?.skippedAt;
      const reason = stageData?.reason || 'No reason provided';
      let formattedSkippedDate = 'N/A';
      if (skippedAt) {
        const d = parseDate(skippedAt);
        if (d) formattedSkippedDate = format(d, 'dd/MM/yyyy HH:mm');
      }

      return (
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200 cursor-help font-normal">
                  Skipped
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="bg-slate-900 text-white border-slate-800">
                <div className="text-xs text-left space-y-1">
                  <p><span className="font-semibold text-slate-300">Reason:</span> {reason}</p>
                  <p><span className="font-semibold text-slate-300">Date:</span> {formattedSkippedDate}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600 hover:bg-blue-50" onClick={(e) => { e.stopPropagation(); handleUnskip(); }} disabled={isLoading}>
            Unskip
          </Button>
        </div>
      );
    }

    // 2. COMPLETED STATUS
    const isExplicitlyCompleted = stageStatus === 'completed';
    const isLegacyCompleted = !stageStatus && (!!value || stageData?.documentsUploaded === true);

    if ((isExplicitlyCompleted || isLegacyCompleted) && stageDate && stageDate !== 'NaN/NaN/NaN') {
      const completionDate = parseDate(stageDate);
      let isCompletedOverdue = false;
      let completionDuration = 'N/A';

      if (completionDate && effectiveStartTime && stage.estimated_time) {
        const start = parseDate(effectiveStartTime instanceof Date ? effectiveStartTime.toISOString() : effectiveStartTime);
        if (start) {
          const durationMs = completionDate.getTime() - start.getTime();
          const durationMinutes = Math.floor(durationMs / (1000 * 60));
          isCompletedOverdue = durationMinutes > stage.estimated_time;
          completionDuration = formatDuration(durationMinutes);
        }
      }

      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 group cursor-pointer" onClick={(e) => { e.stopPropagation(); if (!requiresUpload) setIsEditing(true); }}>
                <div className={`text-gray-800 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${isCompletedOverdue ? 'bg-amber-50 text-amber-900 border border-amber-200' : ''}`}>
                  {formatDateDisplay(stageDate)}
                  {isCompletedOverdue && <Clock className="h-3 w-3 text-amber-600" />}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs space-y-1">
                <p><span className="font-bold">Completed:</span> {formatDateDisplay(stageDate)}</p>
                {effectiveStartTime && <p><span className="text-slate-400">Duration:</span> {completionDuration}</p>}
                {isCompletedOverdue && <p className="text-amber-400 font-bold">Overdue</p>}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    // 3. EDIT MODE
    if (isEditing && !requiresUpload) {
      return (
        <div className="flex items-center gap-2 min-w-[150px]">
          <Input ref={inputRef} type="datetime-local" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSave} className="text-sm h-7" disabled={isLoading} step="60" />
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600" onClick={handleSave} disabled={isLoading}><Check className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600" onClick={handleCancel} disabled={isLoading}><X className="h-3 w-3" /></Button>
        </div>
      );
    }

    // 4. IN PROGRESS (Time Status)
    if (timeStatus && !requiresUpload && !hasLinkedDocument) {
      return (
        <div className="flex flex-col gap-1 min-w-[120px] items-start">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
            {timeStatus.formattedElapsed} elapsed
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-md ${timeStatus.isOverdue ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-600 border-blue-200'} text-[10px] px-1.5 py-0.5 font-normal cursor-help`}>
                    {timeStatus.isOverdue ? <AlertTriangle className="h-3 w-3 mr-1" /> : <Clock3 className="h-3 w-3 mr-1" />}
                    {timeStatus.isOverdue ? "Overdue" : "In Progress"}
                  </span>
                  {/* Action Button for non-upload stages */}
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 border border-dashed border-gray-300 hover:border-gray-400" onClick={() => setIsEditing(true)}>
                    <Check className="h-3 w-3 text-green-600" />
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[250px]">
                <div className="space-y-2">
                  <div className="flex justify-between border-b pb-1"><span className="font-bold">{stage.name}</span></div>
                  {stage.estimated_time > 0 && (
                    <>
                      <div className="flex justify-between gap-4"><span className="text-slate-400">Time Remaining:</span><span className={timeStatus.isOverdue ? 'text-red-400' : 'text-green-400'}>{timeStatus.isOverdue ? `Overdue by ${timeStatus.formattedOverdue}` : timeStatus.formattedRemaining}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-slate-400">Estimate:</span><span>{formatDuration(stage.estimated_time)}</span></div>
                    </>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      );
    }

    // 5. Default "Add Date" for non-upload stages if no time status derived (fallback)
    if (!requiresUpload) {
      return (
        <Button variant="ghost" size="sm" className="h-7 px-3 text-gray-600 border border-dashed border-gray-300 hover:border-gray-400" onClick={() => setIsEditing(true)}>
          <Calendar className="h-3 w-3 mr-1" /> Add Date
        </Button>
      );
    }

    return <span className="text-sm text-gray-500 italic">-</span>;
  }

  const SkipStageDialog = () => (
    <Dialog open={isSkipDialogOpen} onOpenChange={setIsSkipDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skip Stage</DialogTitle>
          <DialogDescription>
            Please provide a reason for skipping this stage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Select a reason</label>
            <Select onValueChange={setSelectedSkipReason}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Not Sure">Not Sure</SelectItem>
                <SelectItem value="Already Completed">Already Completed</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
                <SelectItem value="custom">Custom Reason</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(selectedSkipReason === 'custom' || !selectedSkipReason) && (
            <div>
              <label className="block text-sm font-medium mb-1">
                {selectedSkipReason === 'custom' ? 'Custom reason' : 'Or enter your own reason'}
              </label>
              <Textarea
                placeholder="Enter reason for skipping this stage"
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                rows={3}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsSkipDialogOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSkip}
              disabled={isLoading || (!selectedSkipReason && !skipReason)}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirm Skip
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const renderContent = () => {
    if (renderMode === 'actions') {
      if (!isStageApplicable) {
        return <span className="text-sm text-gray-400 italic">-</span>;
      }

      const hasAutomation = !!(stage?.automation?.automationId || stage?.automation?.id || stage?.web_automation?.automationId);
      const hasAnyAutomation = requiresUpload && stage.documents?.some((doc: any) =>
        isDocumentApplicable(doc, task) && (doc.automationId || doc.automation?.id)
      );

      if (isDocumentRow && documentData) {
        const isApplicable = isDocumentApplicable(documentData, task);

        console.log('Document row rendering check:', {
          documentId: documentData.id,
          documentName: documentData.name || documentData.document_name,
          isApplicable,
          taskId: task.id,
          taskClass: task.class_id,
          taskSubdept: task.subdepartment_id || task.subdepartment?.id,
          documentTargets: documentData.targetEntities,
          isSpecial: documentData.isSpecial
        });

        if (!isApplicable) {
          return (
            <div className="h-full flex items-center justify-center text-gray-400">
              N/A
            </div>
          );
        }
      }

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

          {/* View document button - always show if there's a linked document */}
          {linkedDocument && (
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

          {!isStageCompleted && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-amber-600 hover:bg-amber-50"
              onClick={handleSkipClick}
              title="Skip this stage"
            >
              <SkipForward className="h-3.5 w-3.5" />
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
  };

  // Fallback (shouldn't reach here)
  return (
    <>
      {renderContent()}
      <SkipStageDialog />
      {/* Extraction Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-[90vw] w-full max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-3 border-b">
            <DialogTitle className="text-lg">
              <div className="flex items-center justify-between">
                <div>
                  {task?.name}
                  {task?.client_name && ` - ${task.client_name}`}
                </div>
                <div className="text-sm font-normal text-muted-foreground">
                  {previewDocuments.length} document{previewDocuments.length !== 1 ? 's' : ''}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto p-6 space-y-6">
            {previewDocuments.length > 0 ? (
              <div className="space-y-6">
                {previewDocuments.map((doc, index) => (
                  <div key={doc.documentId} className="border rounded-lg overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                      <h3 className="font-medium">
                        {doc.documentName || 'Document'}
                        <span className="text-muted-foreground text-sm font-normal ml-2">
                          (Uploaded: {doc.created_at ? formatDateDisplay(doc.created_at) : 'N/A'})
                        </span>
                      </h3>
                    </div>
                    <div className="p-4">
                      <div className="border rounded-lg">
                        <ExtractionPreview
                          documentId={doc.documentId}  // ← ADD THIS LINE
                          documentName={doc.documentName}
                          extractedData={doc.extractedData || {}}
                          fields={doc.fields || []}
                          fileUrl={doc.fileUrl}
                          fileName={doc.fileName}
                          onSave={handlePreviewSave}
                          onDelete={handleDeleteDocument}
                          expanded={true}
                          showSaveButton={!!onSave}
                          readOnly={false}
                          type={doc.type}
                          file={doc.file}
                          onDataChange={(fieldName, value) =>
                            handlePreviewDataChange(doc.documentId, fieldName, value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="ml-4 text-muted-foreground">Loading documents...</p>
              </div>
            )}
          </div>
          <div className="p-4 border-t flex justify-end">
            <Button
              variant="default"
              onClick={() => setIsPreviewOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}