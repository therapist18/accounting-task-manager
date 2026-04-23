// @ts-nocheck
"use client"

import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Upload, Calendar, Check, X, Clock, Eye, AlertTriangle, Zap,
  Loader2, SkipForward, Clock3, MoreHorizontal, CheckCircle2,
  Timer, AlertCircle, User, UserPlus
} from "lucide-react"
import { toast } from "@/lib/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { format, parse, isValid } from "date-fns"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { formatDuration, getTimeStatus, isDocumentApplicable, parseDate } from "../overall-view/tableUtils"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { calculateStageDate } from "../utils/dateUtils"

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
  officers?: any[]
  onOfficerChange?: (taskId: string, officerId: string | null) => Promise<void>
}

// Memoized child components to prevent unnecessary re-renders
const MemoizedTooltipProvider = memo(({ children }: { children: React.ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
));
MemoizedTooltipProvider.displayName = "MemoizedTooltipProvider";

const MemoizedButton = memo(Button);
MemoizedButton.displayName = "MemoizedButton";

// Cache for document fields to avoid repeated API calls
const documentFieldsCache = new Map<string, { fields: any[], timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

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
    return true;
  }
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
  getKycFields,
  onFetchData,
  officers = [],
  onOfficerChange
}: EditableStageCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);
  const [previewDocuments, setPreviewDocuments] = useState<any[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [isSkipDialogOpen, setIsSkipDialogOpen] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [selectedSkipReason, setSelectedSkipReason] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [documentFields, setDocumentFields] = useState<any[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [isOfficerSelectOpen, setIsOfficerSelectOpen] = useState(false);

  const currentAutomationConfig = useMemo(() => {
    const jl = task?.job_level;
    if (!jl || !stage?.documents) return null;

    // 1. Generate a stable key for the current task
    const taskKey = `${jl.subdepartment_id}:${jl.class_id || 0}:${jl.subclass_id || 0}`;

    // 2. Search documents for a target entity that matches this job level
    for (const doc of stage.documents) {
      if (doc.targetEntities && Array.isArray(doc.targetEntities)) {
        const match = doc.targetEntities.find(te => {
          // Check if this entity has an automation AND if the job levels match
          if (!te.automationId || !te.job_level) return false;

          const entityKey = `${te.job_level.subdepartment_id}:${te.job_level.class_id || 0}:${te.job_level.subclass_id || 0}`;
          return entityKey === taskKey;
        });

        if (match) {
          return {
            automationId: match.automationId,
            docName: doc.name
          };
        }
      }
    }
    return null;
  }, [task?.job_level, stage?.documents]);

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

  // Optimized document fields fetching with caching
  useEffect(() => {
    const fetchDocumentFields = async () => {
      if (!linkedDocument?.document_type_id || !getKycFields) {
        setDocumentFields([]);
        setIsLoadingFields(false);
        return;
      }

      const cacheKey = linkedDocument.document_type_id;
      const cached = documentFieldsCache.get(cacheKey);
      const now = Date.now();

      // Return cached data if still valid
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        setDocumentFields(cached.fields);
        setIsLoadingFields(false);
        return;
      }

      try {
        setIsLoadingFields(true);
        const fields = await getKycFields(linkedDocument.document_type_id);

        // Cache the results
        documentFieldsCache.set(cacheKey, {
          fields: fields || [],
          timestamp: now
        });

        setDocumentFields(fields || []);
      } catch (error) {
        console.error('[EditableStageCell] Error fetching document fields:', error);
        setDocumentFields([]);
      } finally {
        setIsLoadingFields(false);
      }
    };

    fetchDocumentFields();
  }, [linkedDocument?.document_type_id, getKycFields]);

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

  // Memoized stage date calculation with dependencies optimized
  const stageDate = useMemo(() => {
    if (!task?.stages || !stage?.id) return null;

    const stageData = task.stages[stage.id];
    if (!stageData) return null;

    return calculateStageDate(
      stage,
      stageData,
      linkedDocument,
      documentFields,
      value,
      isLoadingFields
    );
  }, [stage?.id, task?.stages, linkedDocument, documentFields, value, isLoadingFields]);

  const isStageApplicable = useMemo(() => isStageApplicableToTask(stage, task, departments), [stage, task, departments]);

  // Optimized stage completion check
  const isStageCompleted = useMemo(() => {
    const stageStatus = task?.stages?.[stage?.id]?.status;
    return stageStatus === 'completed' || stageStatus === 'skipped';
  }, [task?.stages, stage?.id]);

  // --- Time Calculation Logic ---
  const effectiveStartTime = useMemo(() => {
    if (!stages?.length || !task?.created_at) return task.date_initiated;

    const sortedStages = [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
    const currentIndex = sortedStages.findIndex(s => s.id === stage.id);

    if (currentIndex <= 0) return task.created_at || task.date_initiated;

    let previousStage = sortedStages[currentIndex - 1];
    while (previousStage && !task.stages?.[previousStage.id]?.date_completed) {
      const prevIndex = sortedStages.findIndex(s => s.id === previousStage.id);
      if (prevIndex <= 0) break;
      previousStage = sortedStages[prevIndex - 1];
    }

    return previousStage?.id ? task.stages?.[previousStage.id]?.date_completed : task.created_at || task.date_initiated;
  }, [stages, stage?.id, task?.created_at, task?.date_initiated, task?.stages]);

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
      let parsedDate = parse(stageDate, 'dd/MM/yyyy HH:mm', new Date());

      if (!isValid(parsedDate)) {
        parsedDate = parse(stageDate, 'MM/dd/yyyy HH:mm', new Date());
      }

      if (!isValid(parsedDate)) {
        parsedDate = new Date(stageDate);
      }

      if (isValid(parsedDate)) {
        const formattedDate = format(parsedDate, "yyyy-MM-dd'T'HH:mm");
        setEditValue(formattedDate);
      } else {
        setEditValue(stageDate);
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
            const formatted = format(date, 'dd/MM/yyyy HH:mm');
            return `Skipped (${formatted})`;
          }
        } catch (e) {
          console.error('Error formatting skipped date:', e);
        }
      }
      return 'Skipped';
    }

    if (!dateStr) {
      return '';
    }

    const desiredFormatRegex = /^\d{2}\/\d{2}\/\d{4}( \d{2}:\d{2})?$/;
    if (desiredFormatRegex.test(dateStr)) {
      return dateStr;
    }

    // Then try to parse as ISO 8601
    try {
      const date = new Date(dateStr);
      if (isValid(date)) {
        const formatted = format(date, 'dd/MM/yyyy HH:mm');
        return formatted;
      }
    } catch (e) {
      console.log('formatDateDisplay - ISO 8601 parse failed, trying other formats');
    }

    // Try parsing with explicit formats
    const formats = [
      'MM/dd/yyyy HH:mm',
      'MM/dd/yyyy',
      'yyyy-MM-dd',
      'dd-MM-yyyy'
    ];

    for (const fmt of formats) {
      const parsed = parse(dateStr, fmt, new Date());
      if (isValid(parsed)) {
        const formatted = format(parsed, 'dd/MM/yyyy HH:mm');
        return formatted;
      }
    }
    return dateStr;
  };

  const handleSave = useCallback(async (isSkipped = false, skipReason = '', valueOverride?: string) => {
    if (!onSave) {
      toast({ title: "Error", description: "Save handler not available", variant: "destructive" });
      return;
    }

    setIsLoading(true);

    try {
      const finalValue = valueOverride || editValue;
      const updatedExtractedDetails: Record<string, any> = {};

      if (linkedDocument && previewDocuments.length > 0) {
        const currentDoc = previewDocuments[currentPreviewIndex];
        if (currentDoc?.extractedData) {
          updatedExtractedDetails.extracted_details = currentDoc.extractedData;
        }
      }

      if (isSkipped) {
        updatedExtractedDetails.status = 'skipped';
        updatedExtractedDetails.skip_reason = skipReason || selectedSkipReason;
      }

      // Save the stage data
      await onSave(stage.id, task.id, finalValue, updatedExtractedDetails);
      setIsEditing(false);

      // Show success message
      toast({
        title: "Success",
        description: isSkipped ? "Stage marked as skipped" : "Stage updated successfully",
        variant: "success"
      });

      // Fetch and update states after successful submission
      if (onFetchData) {
        try {
          await onFetchData();
        } catch (fetchError) {
          console.error('Error refreshing data after save:', fetchError);
          toast({
            title: "Warning",
            description: "Stage saved but data refresh failed. Please refresh manually.",
            variant: "warning"
          });
        }
      }

      // Clear any cached data that might be stale
      if (linkedDocument?.document_type_id) {
        documentFieldsCache.delete(linkedDocument.document_type_id);
      }

    } catch (error) {
      console.error('Error saving stage:', error);
      toast({
        title: "Error",
        description: "Failed to save stage. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [editValue, onSave, stage?.id, task?.id, linkedDocument, selectedSkipReason, previewDocuments, currentPreviewIndex, onFetchData]);

  const checkPreviousStages = useCallback(async () => {
    if (!task.stages || !stages || stages.length === 0) return true;

    const currentStageIndex = stages.findIndex(s => s.id === stage.id);
    if (currentStageIndex <= 0) return true;

    for (let i = 0; i < currentStageIndex; i++) {
      const prevStage = stages[i];
      const stageStatus = task.stages[prevStage.id]?.status;

      if (!stageStatus || (stageStatus !== 'completed' && stageStatus !== 'skipped')) {
        return false;
      }
    }

    return true;
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
      const resetData = {
        ...(linkedDocument?.extracted_details || {}),
        status: 'in_progress',
        skippedAt: null,
        skippedBy: null,
        reason: null,
        date: null,
        completedAt: null,
        documentsUploaded: requiresUpload ? false : undefined
      };

      await onSave(stage.id, task.id, '', resetData);

      setEditValue('');

      toast({
        title: "Success",
        description: "Stage reset.",
        variant: "success"
      });

      // Fetch and update states after successful submission
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
      toast({ title: 'Error', description: 'No document to delete', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      if (documentToDelete.file_path) {
        const filePath = documentToDelete.file_path.startsWith('kyc-documents/')
          ? documentToDelete.file_path.substring('kyc-documents/'.length)
          : documentToDelete.file_path;
        await supabase.storage.from('kyc-documents').remove([filePath]);
      }

      // Try multiple possible ID fields with detailed logging
      const possibleIds = [
        documentToDelete.id,
        documentToDelete.file?.id,
        documentToDelete.documentId,
        documentToDelete.kyc_document_id,
        documentToDelete.director_id
      ];

      // For one-off documents, use documentId or fileUrl as the identifier
      const isOneOff = documentToDelete.type === 'one_off' || documentId === 'one_off';
      const documentId = documentToDelete.id || documentToDelete.file?.id || documentToDelete.documentId || documentToDelete.document_id;
      const docIdentifier = isOneOff
        ? (documentToDelete.documentId || documentToDelete.fileUrl || documentToDelete.fileName || documentId)
        : documentId;

      if (!docIdentifier) {
        console.error(' [ERROR] Cannot delete document: Missing document identifier. Document object:', documentToDelete);
        throw new Error('Cannot delete document: Missing document identifier');
      }

      // Handle one-off documents differently - they can't be deleted from acc_portal_directors_documents
      if (isOneOff) {
        console.log('Skipping database deletion for one-off document, will remove from task data:', documentToDelete);
        // One-off documents are typically temporary/external documents that don't need DB deletion
        // But we still need to remove them from the task's stage data
      } else {
        const { error: dbError } = await supabase.from('acc_portal_directors_documents').delete().eq('id', documentId);
        if (dbError) throw dbError;
      }

      const currentTask = await supabase.from('tm_tasks').select('stages, source_document_id').eq('id', task.id).single();
      if (currentTask.error) throw currentTask.error;

      const updatedStages = { ...currentTask.data.stages };
      const updatedSourceDocIds = { ...currentTask.data.source_document_id };

      if (updatedSourceDocIds[stage.id]) {
        if (Array.isArray(updatedSourceDocIds[stage.id])) {
          updatedSourceDocIds[stage.id] = updatedSourceDocIds[stage.id].filter(
            (doc: any) => {
              const docId = typeof doc === 'string' ? doc : doc.id;
              // For one-off documents, compare against docIdentifier (which could be documentId or fileUrl)
              // For regular documents, compare against the standard ID
              const compareId = isOneOff ? docIdentifier : (documentToDelete.id || documentToDelete.file?.id);
              return docId !== compareId;
            }
          );
          if (updatedSourceDocIds[stage.id].length === 0) {
            delete updatedSourceDocIds[stage.id];
            if (updatedStages[stage.id]) {
              delete updatedStages[stage.id];
            }
          }
        } else {
          const docId = typeof updatedSourceDocIds[stage.id] === 'string'
            ? updatedSourceDocIds[stage.id]
            : updatedSourceDocIds[stage.id].id;

          const compareId = isOneOff ? docIdentifier : (documentToDelete.id || documentToDelete.file?.id);
          if (docId === compareId) {
            delete updatedSourceDocIds[stage.id];
            if (updatedStages[stage.id]) {
              delete updatedStages[stage.id];
            }
          }
        }
      }

      const { error: updateError } = await supabase.from('tm_tasks').update({
        stages: updatedStages,
        source_document_id: updatedSourceDocIds,
        updated_at: new Date().toISOString()
      }).eq('id', task.id);

      if (updateError) throw updateError;

      const updatedPreviewDocs = previewDocuments.filter(
        (doc) => doc.documentId !== docIdentifier
      );
      setPreviewDocuments(updatedPreviewDocs);

      if (updatedPreviewDocs.length === 0) {
        setIsPreviewOpen(false);
      } else if (currentPreviewIndex >= updatedPreviewDocs.length) {
        setCurrentPreviewIndex(updatedPreviewDocs.length - 1);
      }

      if (onSave) {
        await onSave(stage.id, task.id, '', {});
      }

      // Fetch and update states after successful submission to tm_tasks
      if (onFetchData) {
        await onFetchData();
      }

    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete document',
        variant: 'destructive'
      });
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
      const inputValue = inputRef.current?.value || '';

      // Update state for UI consistency
      setEditValue(inputValue);

      // Pass inputValue directly to handleSave to ensure the latest value is used
      // This fixes the "No date selected" error
      handleSave(false, '', inputValue);
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
  }, [stage, task, isAutomationRunning, automationDialogOpen]);

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
      return [];
    }

    const previewDocuments = [];

    for (const doc of documents) {
      try {
        const kycDoc = await fetchKycDocumentData(doc.document_id || doc.id);
        if (!kycDoc) {
          continue;
        }
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
        previewDocuments.push(previewData);
      } catch (error) {
        console.error(`Error building preview data for document ${doc.id}:`, error);
      }
    }

    if (previewDocuments.length === 0) {
      console.error('No preview documents were created'); // Debug log
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

    try {
      const documentsToPreview = linkedDocuments && linkedDocuments.length > 0
        ? linkedDocuments
        : linkedDocument ? [linkedDocument] : [];

      if (documentsToPreview.length === 0) {
        toast({
          title: 'No documents',
          description: 'No documents available to preview',
          variant: 'warning'
        });
        return;
      }

      setIsLoading(true);
      const previewDocs = await buildPreviewDocumentsData(documentsToPreview);

      if (previewDocs.length > 0) {
        setCurrentPreviewIndex(0);
        setPreviewDocuments(previewDocs);
        setIsPreviewOpen(true);
      } else {
        toast({
          title: 'Error',
          description: 'No valid documents could be prepared for preview',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to open document preview',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [linkedDocument, linkedDocuments, buildPreviewDocumentsData]);
  const handlePreviewSave = useCallback(async (data: any) => {
    if (!onSave || previewDocuments.length === 0) return;

    try {
      const currentDoc = previewDocuments[currentPreviewIndex];
      if (!currentDoc) throw new Error('No active document to save');

      await onSave(
        stage.id,
        task.id,
        'completed',
        {
          extractedData: data,
          documentId: currentDoc.documentId
        }
      );

      const updatedDocs = [...previewDocuments];
      updatedDocs[currentPreviewIndex] = {
        ...currentDoc,
        extractedData: { ...data }
      };
      setPreviewDocuments(updatedDocs);

      toast({ title: "Success", description: "Document data saved and refreshed successfully.", variant: "success" });

      // Fetch and update states after successful submission
      if (onFetchData) {
        await onFetchData();
      }

      if (currentPreviewIndex >= previewDocuments.length - 1) {
        setIsPreviewOpen(false);
      } else {
        setCurrentPreviewIndex(prev => prev + 1);
      }
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to save document data.', variant: 'destructive' });
    }
  }, [onSave, previewDocuments, currentPreviewIndex, stage.id, task.id, onFetchData]);

  const handleOfficerChange = async (officerId: string) => {
    if (!onOfficerChange) return;
    setIsLoading(true);
    console.log('[EditableStageCell handleOfficerChange] Task ID:', task.id, 'Stage ID:', stage.id, 'Stage Name:', stage.name, 'Officer ID:', officerId);
    try {
      await onOfficerChange(task.id, officerId || null, stage.id);
      setIsOfficerSelectOpen(false);
      toast({
        title: "Success",
        description: "Officer updated successfully",
      });
    } catch (error) {
      console.error('Error updating officer:', error);
      toast({
        title: "Error",
        description: "Failed to update officer",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderCellContent = () => {
    if (!isStageApplicable) return <span className="text-sm text-gray-400 italic">N/A</span>;
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

        // Matches ReportsPage styling for Skipped
        return (
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 font-medium cursor-help bg-transparent border-0 p-0">
                    <AlertCircle className="h-3.5 w-3.5" /> Skipped
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-amber-50 text-amber-900 border-amber-200">
                  <div className="text-xs text-left space-y-1">
                    <p><span className="font-semibold">Reason:</span> {reason}</p>
                    <p><span className="font-semibold">Date:</span> {formattedSkippedDate}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {/* Unskip functionality retained */}
            <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600 hover:bg-blue-50" onClick={(e) => { e.stopPropagation(); handleUnskip(); }} disabled={isLoading}>
              Unskip
            </Button>
          </div>
        );
      }

      // 2. COMPLETED STATUS
      const isExplicitlyCompleted = stageStatus === 'completed';
      const isLegacyCompleted = !stageStatus && (!!value || stageData?.documentsUploaded === true);
      if (isExplicitlyCompleted && (!stageDate || stageDate === 'NaN/NaN/NaN') && !requiresUpload && !isEditing) {
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-3 text-emerald-600 border border-dashed border-emerald-300 hover:border-emerald-400 bg-emerald-50"
                  onClick={() => setIsEditing(true)}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Set Date
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-emerald-50 border-emerald-200 text-emerald-900">
                <p className="text-xs">Stage is marked completed, but date is missing.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      if ((isExplicitlyCompleted || isLegacyCompleted) && stageDate && stageDate !== 'NaN/NaN/NaN' && !isEditing) {
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

        const textColorClass = isCompletedOverdue ? "text-amber-600" : "text-emerald-600";
        const icon = isCompletedOverdue ? <Clock className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />;
        const borderColorClass = isCompletedOverdue ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-100";

        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`flex items-center gap-1.5 font-semibold text-xs ${textColorClass} cursor-pointer hover:underline select-none`}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Keep single click for manual stages
                    if (!requiresUpload) setIsEditing(true);
                  }}
                  // ADDED: Double click handler to force edit mode
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                  }}
                >
                  {icon}
                  <span>{formatDateDisplay(stageDate)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent className={`${borderColorClass} text-slate-900 border shadow-md`}>
                <div className="space-y-2 p-1">
                  <div className="flex justify-between border-b border-black/10 pb-1 mb-1">
                    <span className={`font-bold ${textColorClass}`}>
                      {isCompletedOverdue ? "Completed (Overdue)" : "Completed On Time"}
                    </span>
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Completed:</span>
                      <span>{formatDateDisplay(stageDate)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Duration:</span>
                      <span>{completionDuration}</span>
                    </div>
                    {isCompletedOverdue && <p className="text-amber-600 font-bold">Overdue</p>}
                    {/* Added hint for user */}
                    <p className="text-[10px] text-slate-400 pt-1 italic border-t border-slate-200 mt-1">Double-click to edit date</p>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      // 3. EDIT MODE (Active input)
      if (isEditing) {

        // -- Helper Functions for value splitting --
        const getCurrentDate = () => {
          if (!editValue) return '';
          try {
            // If it's already an ISO string with T
            if (editValue.includes('T')) return editValue.split('T')[0];

            // If it's another format, try parsing
            const parsed = parseDate(editValue);
            return parsed ? format(parsed, 'yyyy-MM-dd') : '';
          } catch (e) { return ''; }
        };

        const getCurrentTime = () => {
          if (!editValue) return '00:00';
          try {
            if (editValue.includes('T')) {
              const t = editValue.split('T')[1];
              // Ensure we only get HH:mm even if seconds exist
              return t ? t.substring(0, 5) : '00:00';
            }
            const parsed = parseDate(editValue);
            return parsed ? format(parsed, 'HH:mm') : '00:00';
          } catch (e) { return '00:00'; }
        };

        const datePart = getCurrentDate();
        const timePart = getCurrentTime();

        const handleCompositeSave = () => {
          const dateInput = document.getElementById(`date-part-${stage.id}`) as HTMLInputElement;
          const timeInput = document.getElementById(`time-part-${stage.id}`) as HTMLInputElement;

          const d = dateInput?.value || datePart;
          const t = timeInput?.value || '00:00';

          if (!d) {
            toast({ title: "Error", description: "Please select a date", variant: "destructive" });
            return;
          }

          // Combine and save
          handleSave(false, '', `${d}T${t}`);
        };

        const handleKeyDownComposite = (e: React.KeyboardEvent) => {
          if (e.key === 'Enter') handleCompositeSave();
          if (e.key === 'Escape') handleCancel();
        };

        return (
          <div className="flex items-center gap-2">
            {/* Composite Input Container - Looks like a single shadcn Input */}
            <div className="flex items-center h-8 rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">

              {/* Date Part */}
              <input
                id={`date-part-${stage.id}`}
                type="date"
                defaultValue={datePart}
                className="bg-transparent border-none p-0 h-full focus:outline-none focus:ring-0 text-sm font-medium text-slate-900 w-[110px]"
                autoFocus
                onKeyDown={handleKeyDownComposite}
                onChange={(e) => {
                  // Optional: Live update state if needed, though we read from DOM on save for speed
                  const t = (document.getElementById(`time-part-${stage.id}`) as HTMLInputElement)?.value || '00:00';
                  setEditValue(`${e.target.value}T${t}`);
                }}
              />

              {/* Visual Separator */}
              <span className="text-slate-300 mx-1">|</span>

              {/* Time Part - Defaults to 00:00 visually */}
              <Clock3 className="h-3 w-3 text-slate-400 mr-1.5" />
              <input
                id={`time-part-${stage.id}`}
                type="time"
                defaultValue={timePart}
                className="bg-transparent border-none p-0 h-full focus:outline-none focus:ring-0 text-sm text-slate-600 w-[70px]"
                onKeyDown={handleKeyDownComposite}
                onChange={(e) => {
                  const d = (document.getElementById(`date-part-${stage.id}`) as HTMLInputElement)?.value || '';
                  setEditValue(`${d}T${e.target.value}`);
                }}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-0.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                onClick={handleCompositeSave}
                disabled={isLoading}
                title="Save Date"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={handleCancel}
                disabled={isLoading}
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      }

      // 4. IN PROGRESS (Time Status)
      if (timeStatus && !requiresUpload && !hasLinkedDocument) {
        // ** COLOR & ICON LOGIC for IN PROGRESS (Matches ReportsPage) **
        const textColorClass = timeStatus.isOverdue ? "text-red-600" : "text-blue-600";
        const icon = timeStatus.isOverdue ? <AlertTriangle className="h-3.5 w-3.5" /> : <Timer className="h-3.5 w-3.5" />;
        const borderColorClass = timeStatus.isOverdue ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50";

        return (
          <div className="flex flex-col gap-1 min-w-[120px] items-start">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 font-medium text-xs ${textColorClass} cursor-default`}>
                      {icon}
                      <span>{timeStatus.formattedElapsed} elapsed</span>
                    </div>
                    {/* Action Button for non-upload stages */}
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 border border-dashed border-gray-300 hover:border-gray-400" onClick={() => setIsEditing(true)}>
                      <Check className="h-3 w-3 text-green-600" />
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent className={`${borderColorClass} text-slate-900 border shadow-md max-w-[250px]`}>
                  <div className="space-y-2 p-1">
                    <div className="flex justify-between border-b border-black/10 pb-1 mb-1">
                      <span className={`font-bold ${textColorClass}`}>{timeStatus.isOverdue ? "In Progress (Overdue)" : "In Progress (On Track)"}</span>
                    </div>
                    <div className="text-xs space-y-1">
                      {stage.estimated_time > 0 && (
                        <>
                          <div className="flex justify-between gap-4"><span className="text-slate-500">Remaining:</span><span className={timeStatus.isOverdue ? 'font-bold text-red-600' : 'text-green-600'}>{timeStatus.isOverdue ? `Overdue by ${timeStatus.formattedOverdue}` : timeStatus.formattedRemaining}</span></div>
                          <div className="flex justify-between gap-4"><span className="text-slate-500">Estimate:</span><span>{formatDuration(stage.estimated_time)}</span></div>
                        </>
                      )}
                    </div>
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

    if (renderMode === 'actions') {
      if (!isStageApplicable) return <span className="text-sm text-gray-400 italic">-</span>;

      // Determine if we should show the button based on the new mapping
      const showAutomation = !!currentAutomationConfig && !hasLinkedDocument;
      const showSkip = !isStageCompleted;
      const hasMoreActions = showAutomation || showSkip;

      return (
        <div className="flex items-center justify-center gap-1">
          {/* Officer Selection - only for stages with officer follow-up */}
          {onOfficerChange && officers.length > 0 && stage.follow_up?.toLowerCase() === 'officer' && (() => {
            // Filter officers based on stage allocation
            const stageOfficerIds = new Set<string>();
            if (Array.isArray(stage.officer_ids)) {
              stage.officer_ids.forEach((id: any) => stageOfficerIds.add(id.toString()));
            } else if (stage.officer_id) {
              stageOfficerIds.add(stage.officer_id.toString());
            }
            const stageOfficers = officers.filter(o => stageOfficerIds.has(o.id.toString()));

            if (stageOfficers.length === 0) return null;

            // Get currently assigned officer for this stage
            const taskStageData = task.stages?.[stage.id];
            const assignedOfficerId = taskStageData?.officer_ids?.[0] || taskStageData?.officer_id;

            // Debug logging
            if (assignedOfficerId) {
              console.log('[EditableStageCell] Stage:', stage.id, 'Assigned Officer ID:', assignedOfficerId);
              console.log('[EditableStageCell] Available officers:', officers.map(o => ({ id: o.id, name: o.displayName || o.name })));
            }

            const assignedOfficer = assignedOfficerId ? officers.find(o => o.id === assignedOfficerId || o.id?.toString() === assignedOfficerId?.toString()) : null;

            return (
              <Select
                value={assignedOfficerId || "unassigned"}
                onValueChange={(val) => handleOfficerChange(val === "unassigned" ? null : val)}
                open={isOfficerSelectOpen}
                onOpenChange={setIsOfficerSelectOpen}
              >
                <SelectTrigger className="h-7 w-7 p-0 border-0 bg-transparent hover:bg-slate-100" title={assignedOfficer ? `Assigned: ${assignedOfficer.displayName || assignedOfficer.name}` : "Assign officer"}>
                  <User className={`h-3.5 w-3.5 ${assignedOfficer ? 'text-green-600' : 'text-slate-600'}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {stageOfficers.map(officer => (
                    <SelectItem key={officer.id} value={officer.id}>
                      {officer.displayName || officer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })()}

          {/* View Document */}
          {linkedDocument && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-green-600 hover:bg-green-50"
                  title="View document details"
                  onClick={handleViewDocument}
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-[90vw] w-full max-h-[90vh] flex flex-col p-0 overflow-hidden" onOpenAutoFocus={e => e.preventDefault()}>
                <DialogHeader className="p-4 border-b">
                  <DialogTitle className="text-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        {stage?.name && <span>{stage.name}: </span>}
                        {task?.name}
                        {task?.client_name && ` - ${task.client_name}`}
                      </div>
                      <div className="text-sm font-normal text-muted-foreground">
                        {previewDocuments.length} document{previewDocuments.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-auto p-4">
                  {previewDocuments.length > 0 ? (
                    previewDocuments.map((doc) => (
                      <div key={doc.documentId} className="border rounded-lg overflow-hidden mb-4">
                        <div className="p-4 bg-gray-50 border-b">
                          <h3 className="font-medium">
                            {doc.documentName || 'Document'}
                            <span className="text-muted-foreground text-sm font-normal ml-2">
                              (Uploaded: {doc.created_at ? formatDateDisplay(doc.created_at) : 'N/A'})
                            </span>
                          </h3>
                        </div>
                        <div className="p-4">
                          <ExtractionPreview
                            documentId={doc.documentId}
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
                    ))
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
          )}

          {/* Upload Document */}
          {requiresUpload && (
            <Button variant="ghost" size="icon" className={`h-7 w-7 ${hasLinkedDocument ? 'text-blue-400 hover:bg-blue-50' : 'text-blue-600 hover:bg-blue-50'}`} onClick={handleDocumentUpload} title={hasLinkedDocument ? 'Upload new document' : 'Upload document'}>
              <Upload className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* More Actions Dropdown */}
          {hasMoreActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:bg-slate-100">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {showAutomation && (
                  <DropdownMenuItem onClick={handleTriggerAutomation} disabled={isAutomationRunning}>
                    <Zap className="mr-2 h-3.5 w-3.5 text-blue-600 fill-blue-600" />
                    <div className="flex flex-col">
                      <span>Run Automation</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        via {currentAutomationConfig.docName}
                      </span>
                    </div>
                  </DropdownMenuItem>
                )}
                {showSkip && (
                  <DropdownMenuItem onClick={handleSkipClick}>
                    <SkipForward className="mr-2 h-3.5 w-3.5" />
                    Skip Stage
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      );
    }
    return <span className="text-sm text-gray-500 italic">-</span>;
  };

  return (
    <>
      <SkipStageDialog />
      {renderCellContent()}

      {/* Test Dialog for debugging */}
      <Dialog open={automationDialogOpen} onOpenChange={(open) => {
        if (!open) setAutomationDialogOpen(false);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Test Dialog</DialogTitle>
            <DialogDescription>
              This is a test to see if dialogs work. Stage: {stage?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p>If you can see this, the Dialog component is working!</p>
            <p>Stage ID: {stage?.id}</p>
            <p>Task ID: {task?.id}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setAutomationDialogOpen(false)}>Close Test</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}

function SkipStageDialog() {
  return null;
}
