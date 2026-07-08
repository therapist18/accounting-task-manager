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
  Timer, AlertCircle, User, UserPlus, List, Link2, Type, Hash,
  Globe, Mail, Phone, AlignLeft, FileText as FileTextIcon
} from "lucide-react"
import { toast } from "@/lib/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { format, parse, isValid } from "date-fns"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { formatDuration, getTimeStatus, isDocumentApplicable } from "../overall-view/tableUtils"
import { parseDate } from "@/app/generic-functions/dateUtils"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { calculateStageDate } from "../utils/dateUtils"
import { cn } from "@/lib/utils"

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
  renderMode?: 'date' | 'actions' | 'combined'
  taskName?: string
  clientName?: string
  onFetchData?: () => Promise<void>;
  officers?: any[]
  onOfficerChange?: (taskId: string, officerId: string | null) => Promise<void>
  readOnly?: boolean
}

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
  onOfficerChange,
  readOnly = false
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
  const [customInputValue, setCustomInputValue] = useState('');
  const [customMultiSelectValues, setCustomMultiSelectValues] = useState<string[]>([]);

  const currentAutomationConfig = useMemo(() => {
    const jl = task?.job_level;
    if (!jl || !stage?.documents) return null;

    const taskKey = `${jl.subdepartment_id}:${jl.class_id || 0}:${jl.subclass_id || 0}`;

    for (const doc of stage.documents) {
      if (doc.targetEntities && Array.isArray(doc.targetEntities)) {
        const match = doc.targetEntities.find(te => {
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
    if (!requiresUpload || linkedDocuments.length === 0) return null;
    return linkedDocuments[0];
  }, [linkedDocuments, requiresUpload, stage.id, stage.name]);

  useEffect(() => {
    const fetchDocumentFields = async () => {
      if (!linkedDocument?.document_id || !getKycFields) {
        setDocumentFields([]);
        setIsLoadingFields(false);
        return;
      }

      const cacheKey = linkedDocument.document_id;
      const cached = documentFieldsCache.get(cacheKey);
      const now = Date.now();

      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        setDocumentFields(cached.fields);
        setIsLoadingFields(false);
        return;
      }

      try {
        setIsLoadingFields(true);
        const fields = await getKycFields({ kycId: linkedDocument.document_id });
        documentFieldsCache.set(cacheKey, { fields: fields || [], timestamp: now });
        setDocumentFields(fields || []);
      } catch (error) {
        setDocumentFields([]);
      } finally {
        setIsLoadingFields(false);
      }
    };

    fetchDocumentFields();
  }, [linkedDocument?.document_id, getKycFields]);

  const hasLinkedDocument = useMemo(() => {
    if (!linkedDocument) return false;

    const hasDocument = linkedDocument.file_path ||
      linkedDocument.url ||
      linkedDocument.document_url ||
      linkedDocument.extracted_details ||
      linkedDocument.extracted_data;

    if (!hasDocument) return false;

    return isDocumentApplicable(linkedDocument, task);
  }, [linkedDocument, task]);

  const stageDate = useMemo(() => {
    if (!task?.stages || !stage?.id) return null;

    const stageData = task.stages[stage.id];
    if (!stageData) return null;

    return calculateStageDate(stage, stageData, linkedDocument, documentFields, value, isLoadingFields);
  }, [stage?.id, task?.stages, linkedDocument, documentFields, value, isLoadingFields]);

  const isStageApplicable = useMemo(() => isStageApplicableToTask(stage, task, departments), [stage, task, departments]);

  const isStageCompleted = useMemo(() => {
    const stageStatus = task?.stages?.[stage?.id]?.status;
    return stageStatus === 'completed' || stageStatus === 'skipped';
  }, [task?.stages, stage?.id]);

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
      if (!isValid(parsedDate)) parsedDate = parse(stageDate, 'MM/dd/yyyy HH:mm', new Date());
      if (!isValid(parsedDate)) parsedDate = new Date(stageDate);

      if (isValid(parsedDate)) {
        setEditValue(format(parsedDate, "yyyy-MM-dd'T'HH:mm"));
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
          if (isValid(date)) return `Skipped (${format(date, 'dd/MM/yyyy')})`; // Shortened for inline view
        } catch (e) {}
      }
      return 'Skipped';
    }

    if (!dateStr) return '';

    const desiredFormatRegex = /^\d{2}\/\d{2}\/\d{4}( \d{2}:\d{2})?$/;
    if (desiredFormatRegex.test(dateStr)) return dateStr;

    try {
      const date = new Date(dateStr);
      if (isValid(date)) return format(date, 'dd/MM/yyyy HH:mm');
    } catch (e) {}

    const formats = ['MM/dd/yyyy HH:mm', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy'];
    for (const fmt of formats) {
      const parsed = parse(dateStr, fmt, new Date());
      if (isValid(parsed)) return format(parsed, 'dd/MM/yyyy HH:mm');
    }
    return dateStr;
  };

  const handleSave = useCallback(async (isSkipped = false, skipReason = '', valueOverride?: string) => {
    if (!onSave || readOnly) return;
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

      await onSave(stage.id, task.id, finalValue, updatedExtractedDetails);
      setIsEditing(false);

      if (linkedDocument?.document_id) {
        documentFieldsCache.delete(linkedDocument.document_id);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save stage.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [editValue, onSave, stage?.id, task?.id, linkedDocument, selectedSkipReason, previewDocuments, currentPreviewIndex]);

  const handleCustomInputSave = useCallback(async (valueOverride?: string) => {
    if (!onSave || readOnly) return;
    setIsLoading(true);
    try {
      const finalValue = valueOverride || customInputValue;
      await onSave(stage.id, task.id, finalValue, {});
      setIsEditing(false);
      if (onFetchData) await onFetchData();
    } catch (error) {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [customInputValue, onSave, stage?.id, task?.id, onFetchData]);

  const handleMultiSelectSave = useCallback(async () => {
    if (!onSave || readOnly) return;
    setIsLoading(true);
    try {
      const finalValue = customMultiSelectValues.join(', ');
      await onSave(stage.id, task.id, finalValue, {});
      setIsEditing(false);
      if (onFetchData) await onFetchData();
    } catch (error) {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [customMultiSelectValues, onSave, stage?.id, task?.id, onFetchData]);

  const handleUnskip = async () => {
    if (!onSave || readOnly) return;
    setIsLoading(true);
    try {
      const resetData = {
        ...(linkedDocument?.extracted_details || {}),
        status: 'in_progress',
        skippedAt: null, skippedBy: null, reason: null, date: null, completedAt: null,
        documentsUploaded: requiresUpload ? false : undefined
      };
      await onSave(stage.id, task.id, '', resetData);
      setEditValue('');
    } catch (error) {
      toast({ title: "Error", description: "Failed to reset stage", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteDocument = useCallback(async (documentToDelete: any) => {
    if (!documentToDelete || readOnly) return;

    setIsLoading(true);
    try {
      if (documentToDelete.file_path) {
        const bucketMarker = 'kyc-documents/';
        const markerIndex = documentToDelete.file_path.indexOf(bucketMarker);
        const filePath = markerIndex !== -1
          ? documentToDelete.file_path.substring(markerIndex + bucketMarker.length)
          : documentToDelete.file_path;
        const { error: storageError } = await supabase.storage.from('kyc-documents').remove([filePath]);
        console.log('[DEBUG] EditableStageCell.handleDeleteDocument: storage remove result', { filePath, storageError });
      }

      const documentId = documentToDelete.id || documentToDelete.file?.id || documentToDelete.documentId || documentToDelete.document_id;
      // "one_off" here is a KYC *document type* classification (see add-stage-dialog.tsx), not an
      // indicator that this document instance lacks a DB row - always delete by real UUID when we have one.
      const isRealDocumentId = typeof documentId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId);
      const docIdentifier = isRealDocumentId ? documentId : (documentToDelete.documentId || documentToDelete.fileUrl || documentToDelete.fileName || documentId);

      console.log('[DEBUG] EditableStageCell.handleDeleteDocument: resolved ids', { documentId, isRealDocumentId, type: documentToDelete.type });

      if (isRealDocumentId) {
        const { data: deletedRows, error: dbError } = await supabase
          .from('acc_portal_directors_documents')
          .delete()
          .eq('id', documentId)
          .select();
        console.log('[DEBUG] EditableStageCell.handleDeleteDocument: db delete result', { documentId, deletedRows, deletedCount: deletedRows?.length ?? 0, dbError });
        if (dbError) throw dbError;
        if (!deletedRows || deletedRows.length === 0) {
          throw new Error(`No document row was deleted for id ${documentId}.`);
        }
      }

      const currentTask = await supabase.from('tm_tasks').select('stages, source_document_id').eq('id', task.id).single();
      if (currentTask.error) throw currentTask.error;

      const updatedStages = { ...currentTask.data.stages };
      const updatedSourceDocIds = { ...currentTask.data.source_document_id };

      if (updatedSourceDocIds[stage.id]) {
        if (Array.isArray(updatedSourceDocIds[stage.id])) {
          updatedSourceDocIds[stage.id] = updatedSourceDocIds[stage.id].filter((doc: any) => {
            const docId = typeof doc === 'string' ? doc : doc.id;
            const compareId = isRealDocumentId ? (documentToDelete.id || documentToDelete.file?.id) : docIdentifier;
            return docId !== compareId;
          });
          if (updatedSourceDocIds[stage.id].length === 0) {
            delete updatedSourceDocIds[stage.id];
            if (updatedStages[stage.id]) delete updatedStages[stage.id];
          }
        } else {
          const docId = typeof updatedSourceDocIds[stage.id] === 'string' ? updatedSourceDocIds[stage.id] : updatedSourceDocIds[stage.id].id;
          const compareId = isRealDocumentId ? (documentToDelete.id || documentToDelete.file?.id) : docIdentifier;
          if (docId === compareId) {
            delete updatedSourceDocIds[stage.id];
            if (updatedStages[stage.id]) delete updatedStages[stage.id];
          }
        }
      }

      await supabase.from('tm_tasks').update({
        stages: updatedStages,
        source_document_id: updatedSourceDocIds,
        updated_at: new Date().toISOString()
      }).eq('id', task.id);

      const updatedPreviewDocs = previewDocuments.filter(doc => doc.documentId !== docIdentifier);
      setPreviewDocuments(updatedPreviewDocs);

      if (updatedPreviewDocs.length === 0) setIsPreviewOpen(false);
      else if (currentPreviewIndex >= updatedPreviewDocs.length) setCurrentPreviewIndex(updatedPreviewDocs.length - 1);

      if (onSave) await onSave(stage.id, task.id, '', {});
      if (onFetchData) await onFetchData();

    } catch (error) {
      console.error('[DEBUG] EditableStageCell.handleDeleteDocument: caught error', error);
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to delete document', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [stage.id, task.id, onSave, previewDocuments, currentPreviewIndex, onFetchData]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    if (stageDate) {
      const parsedDate = parse(stageDate, 'dd/MM/yyyy', new Date());
      if (isValid(parsedDate)) setEditValue(format(parsedDate, "yyyy-MM-dd'T'HH:mm"));
    } else {
      setEditValue('');
    }
  }, [stageDate]);

  const handleDocumentUpload = useCallback(() => onDocumentUpload?.(task, stage), [onDocumentUpload, task, stage]);
  const handleTriggerAutomation = useCallback((e: React.MouseEvent) => { e.stopPropagation(); setAutomationDialogOpen(true); }, []);
  const handleSkipClick = async () => setIsSkipDialogOpen(true);

  const fetchKycDocumentData = useCallback(async (kycId: string) => {
    try {
      const { data, error } = await supabase.from('acc_portal_kyc').select('id, fields, name, display_name, document_type').eq('id', kycId).single();
      if (error) throw error;
      return data;
    } catch (error) { return null; }
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
    if (!documents || documents.length === 0) return [];
    const previewDocuments = [];

    for (const doc of documents) {
      try {
        const kycDoc = await fetchKycDocumentData(doc.document_id || doc.id);
        if (!kycDoc) continue;
        const filePath = doc.file_path || doc.download_url || doc.url || doc.document_url;
        const fileUrl = filePath ? (filePath.startsWith('http') ? filePath : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${filePath}`) : null;
        const fileName = doc.file_name || filePath?.split('/').pop() || 'document.pdf';
        const documentType = doc.type || kycDoc.document_type || 'document';
        const documentName = kycDoc.display_name || kycDoc.name || doc.name || doc.document_name || 'Document';

        previewDocuments.push({
          documentId: doc.id,
          documentName, fileUrl, fileName,
          extractedData: doc.extracted_data || doc.extracted_details || {},
          fields: transformKycFieldsToPreviewFormat(kycDoc.fields || []),
          kycDoc, document: doc, type: documentType, documentType,
          file: { url: fileUrl, name: fileName, type: doc.file_type || 'application/pdf' },
          created_at: doc.created_at || new Date().toISOString()
        });
      } catch (error) {}
    }
    return previewDocuments;
  }, [fetchKycDocumentData, transformKycFieldsToPreviewFormat]);

  const handleViewDocument = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const documentsToPreview = linkedDocuments && linkedDocuments.length > 0 ? linkedDocuments : linkedDocument ? [linkedDocument] : [];
      if (documentsToPreview.length === 0) {
        toast({ title: 'No documents', description: 'No documents available to preview', variant: 'warning' });
        return;
      }
      setIsLoading(true);
      const previewDocs = await buildPreviewDocumentsData(documentsToPreview);
      if (previewDocs.length > 0) {
        setCurrentPreviewIndex(0);
        setPreviewDocuments(previewDocs);
        setIsPreviewOpen(true);
      } else {
        toast({ title: 'Error', description: 'No valid documents could be prepared for preview', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to open document preview', variant: 'destructive' });
    } finally { setIsLoading(false); }
  }, [linkedDocument, linkedDocuments, buildPreviewDocumentsData]);

  const handlePreviewSave = useCallback(async (data: any) => {
    if (!onSave || previewDocuments.length === 0) return;
    try {
      const currentDoc = previewDocuments[currentPreviewIndex];
      if (!currentDoc) throw new Error('No active document to save');
      await onSave(stage.id, task.id, 'completed', { extractedData: data, documentId: currentDoc.documentId });
      
      const updatedDocs = [...previewDocuments];
      updatedDocs[currentPreviewIndex] = { ...currentDoc, extractedData: { ...data } };
      setPreviewDocuments(updatedDocs);
      toast({ title: "Success", description: "Document data saved successfully.", variant: "success" });

      if (currentPreviewIndex >= previewDocuments.length - 1) setIsPreviewOpen(false);
      else setCurrentPreviewIndex(prev => prev + 1);
      
      if (onFetchData) await onFetchData();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save document data.', variant: 'destructive' });
    }
  }, [onSave, previewDocuments, currentPreviewIndex, stage.id, task.id, onFetchData]);

  const handleOfficerChange = async (officerId: string) => {
    if (!onOfficerChange) return;
    setIsLoading(true);
    try {
      await onOfficerChange(task.id, officerId || null, stage.id);
      setIsOfficerSelectOpen(false);
    } catch (error) {
      toast({ title: "Error", description: "Failed to update officer", variant: "destructive" });
    } finally { setIsLoading(false); }
  };

  const getInputTypeIcon = (inputType: string) => {
    switch (inputType) {
      case 'text': return <Type className="h-3 w-3" />;
      case 'textarea': return <AlignLeft className="h-3 w-3" />;
      case 'number': return <Hash className="h-3 w-3" />;
      case 'date': return <Calendar className="h-3 w-3" />;
      case 'datetime': return <Clock className="h-3 w-3" />;
      case 'dropdown': return <List className="h-3 w-3" />;
      case 'multiselect': return <List className="h-3 w-3" />;
      case 'checkbox': return <Check className="h-3 w-3" />;
      case 'url': return <Globe className="h-3 w-3" />;
      case 'email': return <Mail className="h-3 w-3" />;
      case 'phone': return <Phone className="h-3 w-3" />;
      default: return <Type className="h-3 w-3" />;
    }
  };

  const getInputTypeLabel = (inputType: string) => {
    switch (inputType) {
      case 'text': return 'Add Text';
      case 'textarea': return 'Add Text';
      case 'number': return 'Add Number';
      case 'date': return 'Add Date';
      case 'datetime': return 'Add Date';
      case 'dropdown': return 'Select';
      case 'multiselect': return 'Select';
      case 'checkbox': return 'Check';
      case 'url': return 'Add URL';
      case 'email': return 'Add Email';
      case 'phone': return 'Add Phone';
      default: return 'Add Value';
    }
  };

  const renderCustomInputEditor = (inputType: string, isCompact: boolean, currentValue: string) => {
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && inputType !== 'textarea') {
        e.preventDefault();
        handleCustomInputSave();
      }
      if (e.key === 'Escape') {
        setIsEditing(false);
        setCustomInputValue(currentValue);
      }
    };

    const btnClass = isCompact ? "h-6" : "h-7";

    switch (inputType) {
      case 'text':
      case 'url':
      case 'email':
      case 'phone':
        return (
          <div className="flex items-center gap-1 w-full relative z-10">
            <input
              type={inputType === 'url' ? 'url' : inputType === 'email' ? 'email' : inputType === 'phone' ? 'tel' : 'text'}
              value={customInputValue}
              onChange={(e) => setCustomInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder={inputType === 'url' ? 'https://...' : inputType === 'email' ? 'email@...' : inputType === 'phone' ? '+1234567890' : 'Enter value...'}
              className={cn("flex-1 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500", btnClass)}
            />
            <Button size="sm" variant="ghost" className={cn("p-0 text-emerald-600 hover:text-emerald-700 w-6", btnClass)} onClick={() => handleCustomInputSave()} disabled={isLoading}><Check className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className={cn("p-0 text-red-500 hover:text-red-700 w-6", btnClass)} onClick={() => { setIsEditing(false); setCustomInputValue(currentValue); }} disabled={isLoading}><X className="h-3.5 w-3.5" /></Button>
          </div>
        );

      case 'textarea':
        return (
          <div className="flex flex-col gap-1 w-full relative z-10">
            <textarea
              value={customInputValue}
              onChange={(e) => setCustomInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setIsEditing(false); setCustomInputValue(currentValue); } }}
              autoFocus
              rows={3}
              placeholder="Enter text..."
              className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
            <div className="flex items-center gap-1 justify-end">
              <Button size="sm" variant="ghost" className="h-6 px-2 text-emerald-600 hover:text-emerald-700" onClick={() => handleCustomInputSave()} disabled={isLoading}><Check className="h-3 w-3 mr-1" />Save</Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-red-500 hover:text-red-700" onClick={() => { setIsEditing(false); setCustomInputValue(currentValue); }} disabled={isLoading}><X className="h-3 w-3 mr-1" />Cancel</Button>
            </div>
          </div>
        );

      case 'number':
        return (
          <div className="flex items-center gap-1 w-full relative z-10">
            <input
              type="number"
              value={customInputValue}
              onChange={(e) => setCustomInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder="0"
              className={cn("flex-1 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500", btnClass)}
            />
            <Button size="sm" variant="ghost" className={cn("p-0 text-emerald-600 hover:text-emerald-700 w-6", btnClass)} onClick={() => handleCustomInputSave()} disabled={isLoading}><Check className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className={cn("p-0 text-red-500 hover:text-red-700 w-6", btnClass)} onClick={() => { setIsEditing(false); setCustomInputValue(currentValue); }} disabled={isLoading}><X className="h-3.5 w-3.5" /></Button>
          </div>
        );

      case 'date':
        return (
          <div className="flex items-center gap-1 w-full relative z-10">
            <input
              type="date"
              value={customInputValue || ''}
              onChange={(e) => setCustomInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              className={cn("flex-1 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500", btnClass)}
            />
            <Button size="sm" variant="ghost" className={cn("p-0 text-emerald-600 hover:text-emerald-700 w-6", btnClass)} onClick={() => handleCustomInputSave()} disabled={isLoading}><Check className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className={cn("p-0 text-red-500 hover:text-red-700 w-6", btnClass)} onClick={() => { setIsEditing(false); setCustomInputValue(currentValue); }} disabled={isLoading}><X className="h-3.5 w-3.5" /></Button>
          </div>
        );

      case 'datetime':
        return (
          <div className="flex items-center gap-1 w-full relative z-10">
            <input
              type="datetime-local"
              value={customInputValue || ''}
              onChange={(e) => setCustomInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              className={cn("flex-1 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500", btnClass)}
            />
            <Button size="sm" variant="ghost" className={cn("p-0 text-emerald-600 hover:text-emerald-700 w-6", btnClass)} onClick={() => handleCustomInputSave()} disabled={isLoading}><Check className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className={cn("p-0 text-red-500 hover:text-red-700 w-6", btnClass)} onClick={() => { setIsEditing(false); setCustomInputValue(currentValue); }} disabled={isLoading}><X className="h-3.5 w-3.5" /></Button>
          </div>
        );

      case 'dropdown':
        return (
          <div className="flex items-center gap-1 w-full relative z-10">
            <select
              value={customInputValue}
              onChange={(e) => { setCustomInputValue(e.target.value); }}
              autoFocus
              className={cn("flex-1 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500", btnClass)}
            >
              <option value="">-- Select --</option>
              {(stage.dropdownOptions || []).map((opt: string) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <Button size="sm" variant="ghost" className={cn("p-0 text-emerald-600 hover:text-emerald-700 w-6", btnClass)} onClick={() => handleCustomInputSave()} disabled={isLoading}><Check className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className={cn("p-0 text-red-500 hover:text-red-700 w-6", btnClass)} onClick={() => { setIsEditing(false); setCustomInputValue(currentValue); }} disabled={isLoading}><X className="h-3.5 w-3.5" /></Button>
          </div>
        );

      case 'multiselect':
        return (
          <div className="flex flex-col gap-1 w-full relative z-10">
            <div className="flex flex-wrap gap-1 p-1 border rounded-md bg-background min-h-[28px]">
              {(stage.dropdownOptions || []).map((opt: string) => {
                const isSelected = customMultiSelectValues.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setCustomMultiSelectValues(prev =>
                        isSelected ? prev.filter(v => v !== opt) : [...prev, opt]
                      );
                    }}
                    className={cn("text-[10px] px-1.5 py-0.5 rounded border", isSelected ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5 mr-0.5 inline" />}
                    {opt}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1 justify-end">
              <Button size="sm" variant="ghost" className="h-6 px-2 text-emerald-600 hover:text-emerald-700" onClick={() => handleMultiSelectSave()} disabled={isLoading}><Check className="h-3 w-3 mr-1" />Save</Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-red-500 hover:text-red-700" onClick={() => { setIsEditing(false); setCustomMultiSelectValues(currentValue ? currentValue.split(', ') : []); }} disabled={isLoading}><X className="h-3 w-3 mr-1" />Cancel</Button>
            </div>
          </div>
        );

      case 'checkbox':
        return (
          <div className="flex items-center gap-2 w-full relative z-10">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={customInputValue === 'true' || customInputValue === 'Yes'}
                onChange={(e) => setCustomInputValue(e.target.checked ? 'Yes' : 'No')}
                className="rounded border-gray-300"
              />
              <span className="text-xs">{customInputValue === 'true' || customInputValue === 'Yes' ? 'Yes' : 'No'}</span>
            </label>
            <div className="flex items-center gap-1 ml-auto">
              <Button size="sm" variant="ghost" className="h-6 px-2 text-emerald-600 hover:text-emerald-700" onClick={() => handleCustomInputSave()} disabled={isLoading}><Check className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-red-500 hover:text-red-700" onClick={() => { setIsEditing(false); setCustomInputValue(currentValue); }} disabled={isLoading}><X className="h-3 w-3" /></Button>
            </div>
          </div>
        );

      default:
        return (
          <div className="flex items-center gap-1 w-full relative z-10">
            <input
              type="text"
              value={customInputValue}
              onChange={(e) => setCustomInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder="Enter value..."
              className={cn("flex-1 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500", btnClass)}
            />
            <Button size="sm" variant="ghost" className={cn("p-0 text-emerald-600 hover:text-emerald-700 w-6", btnClass)} onClick={() => handleCustomInputSave()} disabled={isLoading}><Check className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className={cn("p-0 text-red-500 hover:text-red-700 w-6", btnClass)} onClick={() => { setIsEditing(false); setCustomInputValue(currentValue); }} disabled={isLoading}><X className="h-3.5 w-3.5" /></Button>
          </div>
        );
    }
  };

  const renderDateContent = (isCompact = false) => {
    if (!isStageApplicable) return <span className="text-sm text-gray-400 italic">N/A</span>;
    const stageData = task.stages?.[stage.id];
    const stageStatus = stageData?.status;
    const isSkipped = stageStatus === 'skipped';

    // In readOnly mode, show read-only display without edit capabilities
    if (readOnly) {
      if (isSkipped) {
        const skippedAt = stageData?.skippedAt;
        const reason = stageData?.reason || 'No reason provided';
        let formattedSkippedDate = 'N/A';
        if (skippedAt) {
          const d = parseDate(skippedAt);
          if (d) formattedSkippedDate = format(d, 'dd/MM/yyyy');
        }
        return (
          <div className="flex items-center gap-1.5 min-w-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-xs text-amber-600 font-medium cursor-help bg-transparent border-0 p-0 truncate">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Skipped</span>
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
          </div>
        );
      }

      const isExplicitlyCompleted = stageStatus === 'completed';
      const isLegacyCompleted = !stageStatus && (!!value || stageData?.documentsUploaded === true);

      if ((isExplicitlyCompleted || isLegacyCompleted) && stageDate && stageDate !== 'NaN/NaN/NaN') {
        const textColorClass = "text-emerald-600";
        return (
          <div className={`flex items-center gap-1 font-semibold text-xs ${textColorClass} truncate`}>
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={formatDateDisplay(stageDate)}>{formatDateDisplay(stageDate)}</span>
          </div>
        );
      }

      if (timeStatus && !requiresUpload && !hasLinkedDocument) {
        const textColorClass = timeStatus.isOverdue ? "text-red-600" : "text-blue-600";
        const icon = timeStatus.isOverdue ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <Timer className="h-3.5 w-3.5 shrink-0" />;
        return (
          <div className="flex items-center gap-1">
            <div className={`flex items-center gap-1 font-medium text-[11px] ${textColorClass} cursor-default truncate`}>
              {icon}<span className="truncate">{timeStatus.formattedElapsed} elapsed</span>
            </div>
          </div>
        );
      }

      return <span className="text-sm text-gray-500 italic">...</span>;
    }

    if (isSkipped) {
      const skippedAt = stageData?.skippedAt;
      const reason = stageData?.reason || 'No reason provided';
      let formattedSkippedDate = 'N/A';
      if (skippedAt) {
        const d = parseDate(skippedAt);
        if (d) formattedSkippedDate = format(d, 'dd/MM/yyyy'); // Shorter format for fit
      }
      return (
        <div className="flex items-center gap-1.5 min-w-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-xs text-amber-600 font-medium cursor-help bg-transparent border-0 p-0 truncate">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Skipped</span>
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
          {!isCompact && (
            <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-blue-600 hover:bg-blue-50" onClick={(e) => { e.stopPropagation(); handleUnskip(); }} disabled={isLoading}>
              Undo
            </Button>
          )}
        </div>
      );
    }

    const isExplicitlyCompleted = stageStatus === 'completed';
    const isLegacyCompleted = !stageStatus && (!!value || stageData?.documentsUploaded === true);

    // Handle custom input types (non-document, non-date)
    const inputType = stage.stageInputType;
    const isCustomInputType = inputType && inputType !== 'document' && inputType !== 'file' && !requiresUpload;
    const currentValue = value || stageData?.value || '';

    if (isCustomInputType && !isSkipped) {
      // Completed state for custom input types
      if ((isExplicitlyCompleted || isLegacyCompleted) && !isEditing) {
        return (
          <div className="flex items-center gap-1 min-w-0">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span className="text-xs font-semibold text-emerald-600 truncate" title={currentValue || 'Completed'}>
              {currentValue || 'Completed'}
            </span>
            {!readOnly && (
              <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px] text-blue-600 hover:bg-blue-50 shrink-0" onClick={(e) => { e.stopPropagation(); setIsEditing(true); setCustomInputValue(currentValue); if (inputType === 'multiselect') setCustomMultiSelectValues(currentValue ? currentValue.split(', ') : []); }}>
                Edit
              </Button>
            )}
          </div>
        );
      }

      // In progress / not started - show input or button
      if (isEditing) {
        return renderCustomInputEditor(inputType, isCompact, currentValue);
      }

      // Show input type icon and value or action button
      const inputIcon = getInputTypeIcon(inputType);
      if (currentValue) {
        return (
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-slate-600 truncate" title={currentValue}>{currentValue}</span>
            {!readOnly && (
              <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px] text-blue-600 hover:bg-blue-50 shrink-0" onClick={(e) => { e.stopPropagation(); setIsEditing(true); setCustomInputValue(currentValue); if (inputType === 'multiselect') setCustomMultiSelectValues(currentValue ? currentValue.split(', ') : []); }}>
                {inputIcon}
              </Button>
            )}
          </div>
        );
      }

      // No value yet - show add button
      return (
        <Button variant="ghost" size="sm" className={cn("text-gray-600 border border-dashed border-gray-300 hover:border-gray-400 shrink-0", isCompact ? "h-6 px-2 text-[10px]" : "h-7 px-3 text-xs")} onClick={() => { setIsEditing(true); setCustomInputValue(currentValue); if (inputType === 'multiselect') setCustomMultiSelectValues(currentValue ? currentValue.split(', ') : []); }}>
          {inputIcon} <span className="ml-1">{getInputTypeLabel(inputType)}</span>
        </Button>
      );
    }
    
    if (isExplicitlyCompleted && (!stageDate || stageDate === 'NaN/NaN/NaN') && !requiresUpload && !isEditing) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className={cn("text-emerald-600 border border-dashed border-emerald-300 hover:border-emerald-400 bg-emerald-50", isCompact ? "h-6 px-2 text-[10px]" : "h-7 px-3 text-xs")} onClick={() => setIsEditing(true)}>
                <CheckCircle2 className="h-3 w-3 mr-1 shrink-0" /> <span className="truncate">Set Date</span>
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
      const icon = isCompletedOverdue ? <Clock className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />;
      const borderColorClass = isCompletedOverdue ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-100";

      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`flex items-center gap-1 font-semibold text-xs ${textColorClass} cursor-pointer hover:underline select-none truncate`}
                onClick={(e) => { e.stopPropagation(); if (!requiresUpload) setIsEditing(true); }}
                onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
              >
                {icon}
                <span className="truncate" title={formatDateDisplay(stageDate)}>{formatDateDisplay(stageDate)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent className={`${borderColorClass} text-slate-900 border shadow-md`}>
              <div className="space-y-2 p-1">
                <div className="flex justify-between border-b border-black/10 pb-1 mb-1">
                  <span className={`font-bold ${textColorClass}`}>{isCompletedOverdue ? "Completed (Overdue)" : "Completed On Time"}</span>
                </div>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between gap-4"><span className="text-slate-500">Completed:</span><span>{formatDateDisplay(stageDate)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-slate-500">Duration:</span><span>{completionDuration}</span></div>
                  {isCompletedOverdue && <p className="text-amber-600 font-bold">Overdue</p>}
                  <p className="text-[10px] text-slate-400 pt-1 italic border-t border-slate-200 mt-1">Double-click to edit date</p>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (isEditing) {
      const getCurrentDate = () => {
        if (!editValue) return '';
        try {
          if (editValue.includes('T')) return editValue.split('T')[0];
          const parsed = parseDate(editValue);
          return parsed ? format(parsed, 'yyyy-MM-dd') : '';
        } catch (e) { return ''; }
      };

      const getCurrentTime = () => {
        if (!editValue) return '00:00';
        try {
          if (editValue.includes('T')) {
            const t = editValue.split('T')[1];
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
        if (!d) { toast({ title: "Error", description: "Please select a date", variant: "destructive" }); return; }
        handleSave(false, '', `${d}T${t}`);
      };

      const handleKeyDownComposite = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleCompositeSave();
        if (e.key === 'Escape') handleCancel();
      };

      return (
        <div className="flex items-center gap-1 w-full relative z-10">
          <div className="flex items-center h-7 rounded-md border border-input bg-background px-1 text-sm shadow-sm flex-1 max-w-[130px]">
            <input
              id={`date-part-${stage.id}`} type="date" defaultValue={datePart} autoFocus
              className="bg-transparent border-none p-0 h-full focus:outline-none focus:ring-0 text-[11px] font-medium text-slate-900 w-[78px]"
              onKeyDown={handleKeyDownComposite}
              onChange={(e) => { const t = (document.getElementById(`time-part-${stage.id}`) as HTMLInputElement)?.value || '00:00'; setEditValue(`${e.target.value}T${t}`); }}
            />
            <span className="text-slate-200 mx-0.5">|</span>
            <input
              id={`time-part-${stage.id}`} type="time" defaultValue={timePart}
              className="bg-transparent border-none p-0 h-full focus:outline-none focus:ring-0 text-[11px] text-slate-600 w-[45px]"
              onKeyDown={handleKeyDownComposite}
              onChange={(e) => { const d = (document.getElementById(`date-part-${stage.id}`) as HTMLInputElement)?.value || ''; setEditValue(`${d}T${e.target.value}`); }}
            />
          </div>
          <div className="flex items-center shrink-0">
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={handleCompositeSave} disabled={isLoading} title="Save"><Check className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={handleCancel} disabled={isLoading} title="Cancel"><X className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      );
    }

    if (timeStatus && !requiresUpload && !hasLinkedDocument) {
      const textColorClass = timeStatus.isOverdue ? "text-red-600" : "text-blue-600";
      const icon = timeStatus.isOverdue ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <Timer className="h-3.5 w-3.5 shrink-0" />;
      const borderColorClass = timeStatus.isOverdue ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50";

      return (
        <div className="flex items-center min-w-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <div className={`flex items-center gap-1 font-medium text-[11px] ${textColorClass} cursor-default truncate`}>
                    {icon}<span className="truncate">{timeStatus.formattedElapsed} elapsed</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 border border-dashed border-gray-300 hover:border-gray-400 shrink-0 ml-1" onClick={() => setIsEditing(true)}>
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

    if (!requiresUpload) {
      return (
        <Button variant="ghost" size="sm" className={cn("text-gray-600 border border-dashed border-gray-300 hover:border-gray-400 shrink-0", isCompact ? "h-6 px-2 text-[10px]" : "h-7 px-3 text-xs")} onClick={() => setIsEditing(true)}>
          <Calendar className="h-3 w-3 mr-1" /> Add Date
        </Button>
      );
    }

    return <span className="text-sm text-gray-500 italic">...</span>;
  };

  const renderActionsContent = (isCompact = false) => {
    if (!isStageApplicable) return null;

    const btnSizeClass = isCompact ? "h-6 w-6" : "h-7 w-7";
    const iconSizeClass = isCompact ? "h-16 w-16" : "h-16 w-16";

    // In readOnly mode, only show view button
    if (readOnly) {
      const viewBtn = linkedDocument && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className={cn("text-green-600 hover:bg-green-50", btnSizeClass)} title="View document details" onClick={handleViewDocument}>
              <Eye className={iconSizeClass} />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[90vw] w-full max-h-[90vh] flex flex-col p-0 overflow-hidden" onOpenAutoFocus={e => e.preventDefault()}>
            <DialogHeader className="p-4 border-b">
              <DialogTitle className="text-lg">
                <div className="flex items-center justify-between">
                  <div>{stage?.name && <span>{stage.name}: </span>}{task?.name}{task?.client_name && ` - ${task.client_name}`}</div>
                  <div className="text-sm font-normal text-muted-foreground">{previewDocuments.length} document{previewDocuments.length !== 1 ? 's' : ''}</div>
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto p-4">
              {previewDocuments.length > 0 ? (
                previewDocuments.map((doc) => (
                  <div key={doc.documentId} className="border rounded-lg overflow-hidden mb-4">
                    <div className="p-4 bg-gray-50 border-b">
                      <h3 className="font-medium">{doc.documentName || 'Document'} <span className="text-muted-foreground text-sm font-normal ml-2">(Uploaded: {doc.created_at ? formatDateDisplay(doc.created_at) : 'N/A'})</span></h3>
                    </div>
                    <div className="p-4">
                      <ExtractionPreview documentId={doc.documentId} documentName={doc.documentName} extractedData={doc.extractedData || {}} fields={doc.fields || []} fileUrl={doc.fileUrl} fileName={doc.fileName} onSave={handlePreviewSave} onDelete={handleDeleteDocument} expanded={true} showSaveButton={false} readOnly={true} type={doc.type} file={doc.file} onDataChange={(fieldName, value) => handlePreviewDataChange(doc.documentId, fieldName, value)} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /><p className="ml-4 text-muted-foreground">Loading documents...</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t flex justify-end">
              <Button variant="default" onClick={() => setIsPreviewOpen(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      );

      if (isCompact) {
        return (
          <div className="flex items-center gap-0.5 shrink-0 bg-slate-50/50 rounded p-0.5 border border-slate-100">
            {viewBtn}
          </div>
        );
      }

      return (
        <div className="grid grid-cols-4 items-center justify-items-center w-full">
          <div className="flex items-center justify-center w-8 h-8">{viewBtn}</div>
          <div className="flex items-center justify-center w-8 h-8"></div>
          <div className="flex items-center justify-center w-8 h-8"></div>
          <div className="flex items-center justify-center w-8 h-8"></div>
        </div>
      );
    }

    const showAutomation = !!currentAutomationConfig && !hasLinkedDocument;
    const showSkip = !isStageCompleted;
    const hasMoreActions = showAutomation || showSkip;

    let officerContent: React.ReactNode = null;
    if (onOfficerChange && officers.length > 0 && stage.follow_up?.toLowerCase() === 'officer') {
      const stageOfficerIds = new Set<string>();
      if (Array.isArray(stage.officer_ids)) stage.officer_ids.forEach((id: any) => stageOfficerIds.add(id.toString()));
      else if (stage.officer_id) stageOfficerIds.add(stage.officer_id.toString());
      
      const stageOfficers = officers.filter(o => stageOfficerIds.has(o.id.toString()));
      if (stageOfficers.length > 0) {
        const taskStageData = task.stages?.[stage.id];
        const assignedOfficerId = taskStageData?.officer_ids?.[0] || taskStageData?.officer_id;
        const assignedOfficer = assignedOfficerId ? officers.find(o => o.id === assignedOfficerId || o.id?.toString() === assignedOfficerId?.toString()) : null;
        officerContent = (
          <Select value={assignedOfficerId || "unassigned"} onValueChange={(val) => handleOfficerChange(val === "unassigned" ? null : val)} open={isOfficerSelectOpen} onOpenChange={setIsOfficerSelectOpen}>
            <SelectTrigger className={cn(`p-1 border-0 ${assignedOfficer ? 'bg-green-100 hover:bg-green-200' : 'bg-transparent hover:bg-slate-100'}`, btnSizeClass)} title={assignedOfficer ? `Assigned: ${assignedOfficer.displayName || assignedOfficer.name}` : "Assign officer"}>
              <User className={cn(assignedOfficer ? 'text-green-700' : 'text-slate-600', iconSizeClass)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {stageOfficers.map(officer => <SelectItem key={officer.id} value={officer.id}>{officer.displayName || officer.name}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      }
    }

    const viewBtn = linkedDocument && (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className={cn("text-green-600 hover:bg-green-50", btnSizeClass)} title="View document details" onClick={handleViewDocument}>
            <Eye className={iconSizeClass} />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-[90vw] w-full max-h-[90vh] flex flex-col p-0 overflow-hidden" onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="text-lg">
              <div className="flex items-center justify-between">
                <div>{stage?.name && <span>{stage.name}: </span>}{task?.name}{task?.client_name && ` - ${task.client_name}`}</div>
                <div className="text-sm font-normal text-muted-foreground">{previewDocuments.length} document{previewDocuments.length !== 1 ? 's' : ''}</div>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4">
            {previewDocuments.length > 0 ? (
              previewDocuments.map((doc) => (
                <div key={doc.documentId} className="border rounded-lg overflow-hidden mb-4">
                  <div className="p-4 bg-gray-50 border-b">
                    <h3 className="font-medium">{doc.documentName || 'Document'} <span className="text-muted-foreground text-sm font-normal ml-2">(Uploaded: {doc.created_at ? formatDateDisplay(doc.created_at) : 'N/A'})</span></h3>
                  </div>
                  <div className="p-4">
                    <ExtractionPreview documentId={doc.documentId} documentName={doc.documentName} extractedData={doc.extractedData || {}} fields={doc.fields || []} fileUrl={doc.fileUrl} fileName={doc.fileName} onSave={handlePreviewSave} onDelete={handleDeleteDocument} expanded={true} showSaveButton={!!onSave} readOnly={false} type={doc.type} file={doc.file} onDataChange={(fieldName, value) => handlePreviewDataChange(doc.documentId, fieldName, value)} />
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /><p className="ml-4 text-muted-foreground">Loading documents...</p>
              </div>
            )}
          </div>
          <div className="p-4 border-t flex justify-end">
            <Button variant="default" onClick={() => setIsPreviewOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );

    const uploadBtn = requiresUpload && (
      <Button variant="ghost" size="icon" className={cn(hasLinkedDocument ? 'text-blue-400 hover:bg-blue-50' : 'text-blue-600 hover:bg-blue-50', btnSizeClass)} onClick={handleDocumentUpload} title={hasLinkedDocument ? 'Upload new document' : 'Upload document'}>
        <Upload className={iconSizeClass} />
      </Button>
    );

    const menuBtn = hasMoreActions && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={cn("text-slate-500 hover:bg-slate-100", btnSizeClass)}>
            <MoreHorizontal className={iconSizeClass} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {showAutomation && (
            <DropdownMenuItem onClick={handleTriggerAutomation} disabled={isAutomationRunning}>
              <Zap className="mr-2 h-3.5 w-3.5 text-blue-600 fill-blue-600" />
              <div className="flex flex-col">
                <span>Run Automation</span><span className="text-[10px] text-muted-foreground leading-tight">via {currentAutomationConfig.docName}</span>
              </div>
            </DropdownMenuItem>
          )}
          {showSkip && (
            <DropdownMenuItem onClick={handleSkipClick}>
              <SkipForward className="mr-2 h-3.5 w-3.5" />Skip Stage
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );

    if (isCompact) {
      return (
        <div className="flex items-center gap-0.5 shrink-0 bg-slate-50/50 rounded p-0.5 border border-slate-100">
          {officerContent}
          {viewBtn}
          {uploadBtn}
          {menuBtn}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-4 items-center justify-items-center w-full">
        <div className="flex items-center justify-center w-8 h-8">{officerContent}</div>
        <div className="flex items-center justify-center w-8 h-8">{viewBtn}</div>
        <div className="flex items-center justify-center w-8 h-8">{uploadBtn}</div>
        <div className="flex items-center justify-center w-8 h-8">{menuBtn}</div>
      </div>
    );
  };

  const renderCellContent = () => {
    if (!isStageApplicable) return <span className="text-sm text-gray-400 italic">N/A</span>;
    if (renderMode === 'date') return renderDateContent(false);
    if (renderMode === 'actions') return renderActionsContent(false);
    
    // NEW COMBINED INLINE LAYOUT
    if (renderMode === 'combined') {
      return (
        <div className="flex flex-row items-center justify-between w-full h-full px-0.5 gap-1 min-h-[30px]">
          {/* Status/Date taking available space on left */}
          <div className="flex items-center min-w-0 flex-1 justify-start">
             {renderDateContent(true)}
          </div>
          {/* Action icons packed tightly on the right */}
          <div className="flex items-center justify-end shrink-0">
             {renderActionsContent(true)}
          </div>
        </div>
      );
    }
    
    return <span className="text-sm text-gray-500 italic">-</span>;
  };

  return (
    <>
      <SkipStageDialog />
      {renderCellContent()}
    </>
  );
}

function SkipStageDialog() { return null; }