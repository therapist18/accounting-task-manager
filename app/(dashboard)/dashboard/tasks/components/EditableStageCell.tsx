// @ts-nocheck
"use client"

import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Upload, Calendar, Check, X, Clock, Eye, AlertTriangle, Zap, Loader2, SkipForward, Clock3, MoreHorizontal, MoreVertical, CheckCircle2, Timer, AlertCircle, User, UserPlus, List, Link2, Type, Hash, Globe, Mail, Phone, AlignLeft, FileText as FileTextIcon, RotateCcw, ArrowUpRight, CreditCard, ClipboardList, Lock } from "lucide-react"
import { toast } from "@/lib/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { format, parse, isValid } from "date-fns"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { formatDuration, getTimeStatus, isDocumentApplicable, stageApplicabilityConditionsMet } from "../overall-view/tableUtils"
import { parseDate } from "@/app/generic-functions/dateUtils"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { calculateStageDate } from "../utils/dateUtils"
import { STAGE_TAB_LINKS, isStageDocumentApplicableToTask } from "../utils/taskManagerData"
import { cn } from "@/lib/utils"
import { getCanonicalCurrentStage } from "../../reports/utils/reportStageLogic"
import { ReassignDocumentTypeDialog } from "./ReassignDocumentTypeDialog"

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
  kycDocuments?: Map<string, any>
  isDocumentRow?: boolean
  documentData?: any
  onAutomationClick?: (e: React.MouseEvent, documentData?: any) => void
  departments?: any[]
  // The applied stage's own enhancedTasksData entry (enhancedTasksData.get(task.id) —
  // tableUtils.tsx's createEnhancedTaskData), carrying nationality/age/renewal_status. Only
  // needed when `stage.applicabilityConditions` references nationality/age (renewal_status
  // also falls back to the raw task); passed down from DepartmentTasksManager.tsx.
  enhancedTaskData?: any
  // 'status' / 'upload' / 'other' split 'actions' into dedicated columns (status badge;
  // view+upload; officer/billing-link/skip-menu) for the transposed table's 4-column layout —
  // 'actions' itself is untouched so other consumers (StandardTable, TransposedStagesTable,
  // StagesTable, EnquiryTable, SummaryTable) keep their existing combined behavior.
  renderMode?: 'date' | 'actions' | 'combined' | 'plain-date' | 'status' | 'upload' | 'other'
  taskName?: string
  clientName?: string
  onFetchData?: () => Promise<void>;
  // Fires after a successful "Fix Document Type" reassignment. Distinct from onFetchData
  // because that only reloads tasks/stages — this also invalidates and refetches allDocuments
  // (whose document_id the fix just changed) so the mismatch indicator clears immediately.
  // Falls back to onFetchData when not provided.
  onDocumentTypeFixed?: () => Promise<void> | void;
  officers?: any[]
  onOfficerChange?: (taskId: string, officerId: string | null) => Promise<void>
  readOnly?: boolean
  onOpenRequirements?: (task: any) => void
  showTime?: boolean
  // readOnly-only: hides the deep-link action buttons (billing/requirements/automation
  // shortcuts) so only the document-preview eye icon shows. For consumers like SummaryTable
  // that only want a document preview affordance, not the full DepartmentTasksManager action set.
  previewOnly?: boolean
}

const documentFieldsCache = new Map<string, { fields: any[], timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

const isoToDisplayDate = (iso: string): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch { return iso; }
};

const displayToIsoDate = (display: string): string => {
  if (!display) return '';
  const match = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return display;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
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
    return true;
  }
};

export default function EditableStageCell({ stage, stages = [], task, value, onSave, onDocumentUpload, onShowDocuments, allDocuments = [], isDocumentRow = false, linkedDocuments = [], documentData = null, departments, enhancedTaskData, renderMode = 'date', taskName, clientName, getKycFields, kycDocuments = new Map(), onFetchData, onDocumentTypeFixed, officers = [], onOfficerChange, readOnly = false, onOpenRequirements, showTime = true, previewOnly = false }: EditableStageCellProps) {
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
  const [billPreviewOpen, setBillPreviewOpen] = useState(false);
  const [isReassignTypeDialogOpen, setIsReassignTypeDialogOpen] = useState(false);
  const router = useRouter();

  // Deep-links this stage cell into the matching JobWorkspace tab (Billing/Requirements/Automation)
  const stageLink = useMemo(() => Object.values(STAGE_TAB_LINKS).find(l => l.stageId === stage?.id), [stage?.id]);

  const latestBillingItem = useMemo(() => {
    const billing = task?.registry_metadata?.billing || [];
    return billing[billing.length - 1] || null;
  }, [task?.registry_metadata?.billing]);

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

  // Flags a document that was uploaded under the wrong tab of the stage's upload dialog (each
  // tab stamps its own kycId onto the document row) — i.e. its current document_id isn't among
  // the types this stage actually offers for this task's job level. Surfaced as a warning on the
  // view icon so a mistagged document is visible right in the table, not just discoverable by
  // opening "Fix Document Type" and checking manually.
  const hasMismatchedDocumentType = useMemo(() => {
    if (!hasLinkedDocument || !Array.isArray(stage?.documents) || stage.documents.length < 2) return false;
    const applicableKycIds = new Set(
      stage.documents
        .filter((docConfig: any) => isStageDocumentApplicableToTask(docConfig, task))
        .map((docConfig: any) => docConfig.kycId)
    );
    return (linkedDocuments || []).some((doc: any) => doc?.document_id && !applicableKycIds.has(doc.document_id));
  }, [hasLinkedDocument, stage?.documents, task, linkedDocuments]);

  const stageDate = useMemo(() => {
    if (!task?.stages || !stage?.id) return null;

    const stageData = task.stages[stage.id];
    if (!stageData) return null;

    return calculateStageDate(stage, stageData, linkedDocument, documentFields, value, isLoadingFields);
  }, [stage?.id, task?.stages, linkedDocument, documentFields, value, isLoadingFields]);

  const isStageApplicable = useMemo(() => {
    if (!isStageApplicableToTask(stage, task, departments)) return false;
    // stageApplicabilityConditionsMet takes a taskId -> enhancedTask map (tableUtils.tsx); this
    // cell only ever has its own single task's resolved entry, passed down as enhancedTaskData.
    const enhancedTasksData = enhancedTaskData && task?.id != null
      ? new Map([[task.id.toString(), enhancedTaskData]])
      : undefined;
    return stageApplicabilityConditionsMet(stage, task, enhancedTasksData);
  }, [stage, task, departments, enhancedTaskData]);

  const isStageCompleted = useMemo(() => {
    const stageStatus = task?.stages?.[stage?.id]?.status;
    return stageStatus === 'completed' || stageStatus === 'skipped';
  }, [task?.stages, stage?.id]);

  const effectiveStartTime = useMemo(() => {
    if (!stages?.length || !task?.created_at) return task.date_initiated;

    const sortedStages = [...stages].sort((a: any, b: any) => (a.order_num || 0) - (b.order_num || 0));
    const currentIndex = sortedStages.findIndex(s => s.id === stage.id);

    if (currentIndex <= 0) return task.created_at || task.date_initiated;

    const stageCompletionDate = (stageId: string) => {
      const stageData = task.stages?.[stageId];
      return stageData?.date || stageData?.completedAt || stageData?.date_completed;
    };

    let previousStage = sortedStages[currentIndex - 1];
    while (previousStage && !stageCompletionDate(previousStage.id)) {
      const prevIndex = sortedStages.findIndex(s => s.id === previousStage.id);
      if (prevIndex <= 0) break;
      previousStage = sortedStages[prevIndex - 1];
    }

    return previousStage?.id ? stageCompletionDate(previousStage.id) : task.created_at || task.date_initiated;
  }, [stages, stage?.id, task?.created_at, task?.date_initiated, task?.stages]);

  // Overdue detection — mirrors reports/page.tsx computeStageDateInfo's isOverdue logic:
  // a completed stage is overdue if the duration between its effective start and completion
  // date exceeds the stage's estimated_time.
  const isStageOverdue = useMemo(() => {
    const stageData = task?.stages?.[stage?.id];
    const stageStatus = stageData?.status;
    if (stageStatus !== 'completed' && stageData?.documentsUploaded !== true) return false;
    if (!stage.estimated_time) return false;
    const completionDate = stageData?.date || stageData?.completedAt;
    if (!completionDate || !effectiveStartTime) return false;
    const start = parseDate(effectiveStartTime);
    const end = parseDate(completionDate);
    if (!start || !end) return false;
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));
    return durationMinutes > stage.estimated_time;
  }, [task?.stages, stage?.id, stage?.estimated_time, effectiveStartTime]);

  // The task's actual current position (same "highest completed index, then next applicable
  // stage" algorithm reports/page.tsx and DepartmentTasksManager's perspective tabs use).
  // Stages strictly after this one haven't been reached yet — showing an "elapsed" timer for
  // them is misleading (a task at stage 6 shouldn't show stage 9 as if it's already in
  // progress). Stages at-or-before it (including earlier ones the task skipped past without
  // ever getting data) still show elapsed/overdue normally.
  const canonicalCurrentStage = useMemo(
    () => getCanonicalCurrentStage(task, stages, departments),
    [task, stages, departments]
  );
  const isStageReached = useMemo(() => {
    if (!canonicalCurrentStage || stage?.order_num == null || canonicalCurrentStage.order_num == null) return true;
    return stage.order_num <= canonicalCurrentStage.order_num;
  }, [stage?.order_num, canonicalCurrentStage]);

  const timeStatus = useMemo(() => {
    if (!isStageReached) return null;
    return getTimeStatus(effectiveStartTime, stage.estimated_time);
  }, [effectiveStartTime, stage.estimated_time, isStageReached]);

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
          if (isValid(date)) return `Skipped (${format(date, 'dd/MM/yyyy')})`;
        } catch (e) {}
      }
      return 'Skipped';
    }

    if (!dateStr) return '';

    const desiredFormatRegex = /^\d{2}\/\d{2}\/\d{4}( \d{2}:\d{2})?$/;
    if (desiredFormatRegex.test(dateStr)) return dateStr;

    const dateFmt = showTime ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy';

    try {
      const date = new Date(dateStr);
      if (isValid(date)) return format(date, dateFmt);
    } catch (e) {}

    const formats = ['MM/dd/yyyy HH:mm', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy'];
    for (const fmt of formats) {
      const parsed = parse(dateStr, fmt, new Date());
      if (isValid(parsed)) return format(parsed, dateFmt);
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
        isCleared: true,
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

  const handleClearStage = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!onSave || readOnly) return;
    setIsLoading(true);
    try {
      const resetData = {
        isCleared: true,
        status: 'in_progress',
        skippedAt: null, skippedBy: null, reason: null, date: null, completedAt: null,
        documentsUploaded: requiresUpload ? false : undefined
      };
      await onSave(stage.id, task.id, '', resetData);
      setEditValue('');
      setCustomInputValue('');
      setCustomMultiSelectValues([]);
      setIsEditing(false);
      if (onFetchData) await onFetchData();
    } catch (error) {
      toast({ title: "Error", description: "Failed to clear stage", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [onSave, readOnly, stage?.id, task?.id, requiresUpload, onFetchData]);

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
              type="text"
              value={customInputValue ? isoToDisplayDate(customInputValue) : ''}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d/]/g, '');
                setCustomInputValue(displayToIsoDate(raw));
              }}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder="dd/mm/yyyy"
              maxLength={10}
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
              type="text"
              value={customInputValue ? isoToDisplayDate(customInputValue.split('T')[0]) : ''}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d/]/g, '');
                const isoDate = displayToIsoDate(raw);
                const time = customInputValue?.split('T')[1] || '00:00';
                setCustomInputValue(`${isoDate}T${time}`);
              }}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder="dd/mm/yyyy"
              maxLength={10}
              className={cn("flex-1 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500", btnClass)}
            />
            <input
              type="time"
              value={customInputValue?.split('T')[1] || ''}
              onChange={(e) => {
                const date = customInputValue?.split('T')[0] || '';
                setCustomInputValue(`${date}T${e.target.value}`);
              }}
              onKeyDown={handleKeyDown}
              className={cn("w-24 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500", btnClass)}
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

  // Shared hover-detail body for a stage's date/status — used by every completed/in-progress
  // tooltip (read-only and edit mode alike) so hovering any stage cell shows the same
  // consistent picture: when it started, when it ended (or "In progress"), how long that took
  // vs. how long it was expected to take, how far over/under that is, and — if this stage has
  // dependencies — what it was waiting on to unlock.
  const renderStageTimingDetails = (opts: { isCompleted: boolean }) => {
    const startRaw = effectiveStartTime instanceof Date ? effectiveStartTime.toISOString() : effectiveStartTime;
    const startLabel = startRaw ? formatDateDisplay(startRaw) : 'Unknown';
    const estimatedMinutes = stage?.estimated_time || 0;
    const deps = (stage?.dependencies || []).filter((d: any) => d.dependencyType !== 'always_visible');

    let elapsedMinutes: number | null = null;
    let endLabel = 'In progress';
    if (opts.isCompleted && stageDate) {
      const start = startRaw ? parseDate(startRaw) : null;
      const end = parseDate(stageDate);
      if (start && end) elapsedMinutes = Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
      endLabel = formatDateDisplay(stageDate);
    } else if (!opts.isCompleted && timeStatus) {
      elapsedMinutes = timeStatus.elapsed;
    }

    const overdueMinutes = estimatedMinutes > 0 && elapsedMinutes !== null && elapsedMinutes > estimatedMinutes ? elapsedMinutes - estimatedMinutes : 0;
    const remainingMinutes = !opts.isCompleted && estimatedMinutes > 0 && elapsedMinutes !== null && elapsedMinutes <= estimatedMinutes ? estimatedMinutes - elapsedMinutes : 0;

    return (
      <div className="text-xs space-y-1">
        <div className="flex justify-between gap-4"><span className="text-slate-500">Start:</span><span>{startLabel}</span></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">{opts.isCompleted ? 'Completed:' : 'Status:'}</span><span>{endLabel}</span></div>
        {elapsedMinutes !== null && (
          <div className="flex justify-between gap-4"><span className="text-slate-500">{opts.isCompleted ? 'Duration:' : 'Elapsed:'}</span><span>{formatDuration(elapsedMinutes)}</span></div>
        )}
        {estimatedMinutes > 0 && (
          <div className="flex justify-between gap-4"><span className="text-slate-500">Expected:</span><span>{formatDuration(estimatedMinutes)}</span></div>
        )}
        {overdueMinutes > 0 && <p className="text-amber-600 font-bold">Overdue by {formatDuration(overdueMinutes)}</p>}
        {remainingMinutes > 0 && (
          <div className="flex justify-between gap-4"><span className="text-slate-500">Remaining:</span><span className="text-green-600">{formatDuration(remainingMinutes)}</span></div>
        )}
        {deps.length > 0 && (
          <div className="pt-1 mt-1 border-t border-black/10">
            <p className="text-slate-500 font-semibold mb-0.5">Depends on:</p>
            {deps.map((d: any, i: number) => (
              <p key={i} className="text-[11px]">{d.stageName || 'Unknown'} — {d.dependencyType === 'visible_when_started' ? 'must be started' : 'must be completed'}</p>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Shared composite date+time editor — used by both renderDateContent (legacy 'date' mode)
  // and renderPlainDateContent (the transposed table's dedicated Date column) so the two never
  // drift apart.
  const renderCompositeDateEditor = () => {
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
      const rawDate = dateInput?.value || '';
      const d = displayToIsoDate(rawDate) || datePart;
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
            id={`date-part-${stage.id}`} type="text" defaultValue={datePart ? isoToDisplayDate(datePart) : ''} autoFocus
            placeholder="dd/mm/yyyy"
            maxLength={10}
            className="bg-transparent border-none p-0 h-full focus:outline-none focus:ring-0 text-[11px] font-medium text-slate-900 w-[85px]"
            onKeyDown={handleKeyDownComposite}
            onChange={(e) => { const raw = e.target.value.replace(/[^\d/]/g, ''); const isoDate = displayToIsoDate(raw); const t = (document.getElementById(`time-part-${stage.id}`) as HTMLInputElement)?.value || '00:00'; setEditValue(`${isoDate}T${t}`); }}
          />
          <span className="text-slate-200 mx-0.5">|</span>
          <input
            id={`time-part-${stage.id}`} type="time" defaultValue={timePart}
            className="bg-transparent border-none p-0 h-full focus:outline-none focus:ring-0 text-[11px] text-slate-600 w-[45px]"
            onKeyDown={handleKeyDownComposite}
            onChange={(e) => { const rawDate = (document.getElementById(`date-part-${stage.id}`) as HTMLInputElement)?.value || ''; const isoDate = displayToIsoDate(rawDate); setEditValue(`${isoDate}T${e.target.value}`); }}
          />
        </div>
        <div className="flex items-center shrink-0">
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={handleCompositeSave} disabled={isLoading} title="Save"><Check className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={handleCancel} disabled={isLoading} title="Cancel"><X className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    );
  };

  const renderDateContent = (isCompact = false) => {
    if (!isStageApplicable) return <span className="text-xs text-gray-400 italic">N/A</span>;
    const stageData = task.stages?.[stage.id];
    const stageStatus = stageData?.status;
    const isSkipped = stageStatus === 'skipped';

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
            <HoverCard openDelay={100} closeDelay={100}>
              <HoverCardTrigger asChild>
                <div className="flex items-center gap-1 text-xs text-amber-600 font-medium cursor-help bg-transparent border-0 p-0 truncate">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Skipped</span>
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="bg-amber-50 text-amber-900 border-amber-200">
                <div className="text-xs text-left space-y-1">
                  <p><span className="font-semibold">Reason:</span> {reason}</p>
                  <p><span className="font-semibold">Date:</span> {formattedSkippedDate}</p>
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>
        );
      }

      const isExplicitlyCompleted = stageStatus === 'completed';
      const isLegacyCompleted = !stageStatus && (!!value || stageData?.documentsUploaded === true);

      if ((isExplicitlyCompleted || isLegacyCompleted) && stageDate && stageDate !== 'NaN/NaN/NaN') {
        const completedBlock = (
          <div className="flex items-center gap-1.5 cursor-default select-none min-w-0">
            {isStageOverdue
              ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
            <span className={cn("text-xs font-semibold whitespace-nowrap tracking-tight truncate", isStageOverdue ? "text-amber-700" : "text-slate-800")} title={formatDateDisplay(stageDate)}>
              {formatDateDisplay(stageDate)}
            </span>
            {isStageOverdue && (
              <span className="text-[8px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded uppercase shrink-0">LATE</span>
            )}
          </div>
        );
        return (
          <HoverCard openDelay={100} closeDelay={100}>
            <HoverCardTrigger asChild>{completedBlock}</HoverCardTrigger>
            <HoverCardContent
              side="top"
              className={cn(
                "border shadow-lg text-xs rounded-lg px-3 py-2 z-[9999] min-w-[260px]",
                isStageOverdue ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900"
              )}
            >
              <p className="font-bold mb-0.5">{isStageOverdue ? "Completed — Overdue" : "Completed On Time"}</p>
              {renderStageTimingDetails({ isCompleted: true })}
            </HoverCardContent>
          </HoverCard>
        );
      }

      if (timeStatus && !requiresUpload && !hasLinkedDocument) {
        const textColorClass = timeStatus.isOverdue ? "text-red-600" : "text-blue-600";
        const icon = timeStatus.isOverdue ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <Timer className="h-3.5 w-3.5 shrink-0" />;
        return (
          <HoverCard openDelay={100} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div className="flex items-center gap-1">
                <div className={`flex items-center gap-1 font-medium text-xs ${textColorClass} cursor-default truncate`}>
                  {icon}<span className="truncate">{timeStatus.formattedElapsed} elapsed</span>
                </div>
              </div>
            </HoverCardTrigger>
            <HoverCardContent
              side="top"
              className={cn(
                "border shadow-lg text-xs rounded-lg px-3 py-2 z-[9999] min-w-[260px]",
                timeStatus.isOverdue ? "bg-red-50 border-red-200 text-red-900" : "bg-blue-50 border-blue-200 text-blue-900"
              )}
            >
              <p className="font-bold mb-0.5">{timeStatus.isOverdue ? "In Progress — Overdue" : "In Progress — On Track"}</p>
              {renderStageTimingDetails({ isCompleted: false })}
            </HoverCardContent>
          </HoverCard>
        );
      }

      // No date, no elapsed timer to show, and (if applicable) no linked document either —
      // render nothing rather than a red "Missing" badge; a blank cell already reads as "no
      // data" without turning the whole table red.
      return null;
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
          <HoverCard openDelay={100} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div className="flex items-center gap-1 text-xs text-amber-600 font-medium cursor-help bg-transparent border-0 p-0 truncate">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Skipped</span>
              </div>
            </HoverCardTrigger>
            <HoverCardContent className="bg-amber-50 text-amber-900 border-amber-200">
              <div className="text-xs text-left space-y-1">
                <p><span className="font-semibold">Reason:</span> {reason}</p>
                <p><span className="font-semibold">Date:</span> {formattedSkippedDate}</p>
              </div>
            </HoverCardContent>
          </HoverCard>
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

    const inputType = stage.stageInputType;
    const isCustomInputType = inputType && inputType !== 'document' && inputType !== 'file' && !requiresUpload;
    const currentValue = value || stageData?.value || '';

    if (isCustomInputType && !isSkipped) {
      if ((isExplicitlyCompleted || isLegacyCompleted) && !isEditing) {
        return (
          <div className="flex items-center gap-1 min-w-0">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span className="text-xs font-semibold text-emerald-600 truncate" title={currentValue || 'Completed'}>
              {currentValue || 'Completed'}
            </span>
            {!readOnly && (
              <>
                <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px] text-blue-600 hover:bg-blue-50 shrink-0" onClick={(e) => { e.stopPropagation(); setIsEditing(true); setCustomInputValue(currentValue); if (inputType === 'multiselect') setCustomMultiSelectValues(currentValue ? currentValue.split(', ') : []); }}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0" onClick={handleClearStage} disabled={isLoading} title="Clear">
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        );
      }

      if (isEditing) {
        return renderCustomInputEditor(inputType, isCompact, currentValue);
      }

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
      // Shared with the readOnly branch's badge above — same isStageOverdue memo, so edit mode
      // and read-only mode never disagree about whether a completed stage was late.
      const isCompletedOverdue = isStageOverdue;

      const textColorClass = isCompletedOverdue ? "text-amber-600" : "text-emerald-600";
      const icon = isCompletedOverdue ? <Clock className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />;
      const borderColorClass = isCompletedOverdue ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-100";

      return (
        <div className="flex items-center gap-1 min-w-0">
          <HoverCard openDelay={100} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div
                className={`flex items-center gap-1 font-semibold text-xs ${textColorClass} cursor-help select-none truncate`}
                onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
              >
                {icon}
                <span className="truncate" title={formatDateDisplay(stageDate)}>{formatDateDisplay(stageDate)}</span>
                {isCompletedOverdue && (
                  <span className="text-[8px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded uppercase shrink-0">LATE</span>
                )}
              </div>
            </HoverCardTrigger>
            <HoverCardContent className={`${borderColorClass} text-slate-900 border shadow-md min-w-[260px]`}>
              <div className="space-y-2 p-1">
                <div className="flex justify-between border-b border-black/10 pb-1 mb-1">
                  <span className={`font-bold ${textColorClass}`}>{isCompletedOverdue ? "Completed (Overdue)" : "Completed On Time"}</span>
                </div>
                {renderStageTimingDetails({ isCompleted: true })}
                <p className="text-[10px] text-slate-400 pt-1 italic border-t border-slate-200 mt-1">Double-click to edit date</p>
              </div>
            </HoverCardContent>
          </HoverCard>
          {!readOnly && !requiresUpload && (
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0" onClick={handleClearStage} disabled={isLoading} title="Clear">
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      );
    }

    if (isEditing) {
      return renderCompositeDateEditor();
    }

    if (timeStatus && !requiresUpload && !hasLinkedDocument) {
      const textColorClass = timeStatus.isOverdue ? "text-red-600" : "text-blue-600";
      const icon = timeStatus.isOverdue ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <Timer className="h-3.5 w-3.5 shrink-0" />;
      const borderColorClass = timeStatus.isOverdue ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50";

      return (
        <div className="flex items-center min-w-0">
          <HoverCard openDelay={100} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div className="flex items-center gap-1">
                <div className={`flex items-center gap-1 font-medium text-xs ${textColorClass} cursor-default truncate`}>
                  {icon}<span className="truncate">{timeStatus.formattedElapsed} elapsed</span>
                </div>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 border border-dashed border-gray-300 hover:border-gray-400 shrink-0 ml-1" onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
                  <Check className="h-3 w-3 text-green-600" />
                </Button>
              </div>
            </HoverCardTrigger>
            <HoverCardContent className={`${borderColorClass} text-slate-900 border shadow-md min-w-[260px]`}>
              <div className="space-y-2 p-1">
                <div className="flex justify-between border-b border-black/10 pb-1 mb-1">
                  <span className={`font-bold ${textColorClass}`}>{timeStatus.isOverdue ? "In Progress (Overdue)" : "In Progress (On Track)"}</span>
                </div>
                {renderStageTimingDetails({ isCompleted: false })}
              </div>
            </HoverCardContent>
          </HoverCard>
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

    // No date, no elapsed timer, no linked document — render nothing rather than a red
    // "Missing" badge (same as the readOnly branch above).
    return null;
  };

  const renderActionsContent = (isCompact = false) => {
    if (!isStageApplicable) return null;

    const btnSizeClass = isCompact ? "h-6 w-6" : "h-7 w-7";
    const iconSizeClass = "h-3.5 w-3.5";

    const stageLinkBtn = (() => {
      if (!stageLink) return null;
      if (stageLink.tab === 'billing') {
        return (
          <Button variant="ghost" size="icon" className={cn("text-blue-600 hover:bg-blue-50", btnSizeClass)} title="Preview bill" onClick={(e) => { e.stopPropagation(); setBillPreviewOpen(true); }}>
            <CreditCard className={iconSizeClass} />
          </Button>
        );
      }
      if (stageLink.tab === 'requirements') {
        return (
          <Button variant="ghost" size="icon" className={cn("text-indigo-600 hover:bg-indigo-50", btnSizeClass)} title="Open requirements checklist" onClick={(e) => { e.stopPropagation(); onOpenRequirements?.(task); }}>
            <ClipboardList className={iconSizeClass} />
          </Button>
        );
      }
      if (stageLink.tab === 'automation' && currentAutomationConfig) {
        return (
          <Button variant="ghost" size="icon" className={cn("text-purple-600 hover:bg-purple-50", btnSizeClass)} title={`Open automation: ${currentAutomationConfig.docName}`} onClick={(e) => { e.stopPropagation(); window.open(`/dashboard/tasks/${task.id}?tab=automation&automationId=${currentAutomationConfig.automationId}`, '_blank', 'noopener,noreferrer'); }}>
            <Zap className={iconSizeClass} />
          </Button>
        );
      }
      return null;
    })();

    if (readOnly) {
      const viewBtn = linkedDocument && (
        <Dialog>
          <div className="relative inline-flex">
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className={cn(hasMismatchedDocumentType ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50", btnSizeClass)} title={hasMismatchedDocumentType ? "This document's type may not match this stage — click to review" : "View document details"} onClick={handleViewDocument}>
                <Eye className={iconSizeClass} />
              </Button>
            </DialogTrigger>
            {hasMismatchedDocumentType && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 ring-1 ring-white pointer-events-none" />
            )}
          </div>
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
            {!previewOnly && stageLinkBtn}
            {viewBtn}
          </div>
        );
      }

      return (
        <div className="flex items-center gap-1 shrink-0">
          {!previewOnly && stageLinkBtn}
          {viewBtn}
        </div>
      );
    }

    const showAutomation = !!currentAutomationConfig && !hasLinkedDocument;
    const showSkip = !isStageCompleted;
    const showReassignType = hasMismatchedDocumentType;
    const hasMoreActions = showAutomation || showSkip || showReassignType;

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
        <div className="relative inline-flex">
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className={cn(hasMismatchedDocumentType ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50", btnSizeClass)} title={hasMismatchedDocumentType ? "This document's type may not match this stage — click to review" : "View document details"} onClick={handleViewDocument}>
              <Eye className={iconSizeClass} />
            </Button>
          </DialogTrigger>
          {hasMismatchedDocumentType && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 ring-1 ring-white pointer-events-none" />
          )}
        </div>
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
          {showReassignType && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setIsReassignTypeDialogOpen(true); }}>
              <Link2 className="mr-2 h-3.5 w-3.5 text-indigo-600" />Fix Document Type
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
          {stageLinkBtn}
          {viewBtn}
          {uploadBtn}
          {menuBtn}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1 shrink-0">
        {officerContent}
        {stageLinkBtn}
        {viewBtn}
        {uploadBtn}
        {menuBtn}
      </div>
    );
  };

  // Neutral, uncolored date-only view for the transposed table's dedicated Date column — no
  // status icon, no overdue color/badge, no elapsed timer, all of which now live exclusively
  // in the Status column so the two never disagree about what "late" looks like.
  const renderPlainDateContent = (isCompact = false) => {
    if (!isStageApplicable) return <span className="text-sm text-gray-400 italic">N/A</span>;

    const stageData = task.stages?.[stage.id];
    const stageStatus = stageData?.status;
    const isSkipped = stageStatus === 'skipped';

    if (isSkipped) return <span className="text-sm text-gray-300">—</span>;

    const isExplicitlyCompleted = stageStatus === 'completed';
    const isLegacyCompleted = !stageStatus && (!!value || stageData?.documentsUploaded === true);
    const inputType = stage.stageInputType;
    const isCustomInputType = inputType && inputType !== 'document' && inputType !== 'file' && !requiresUpload;
    const currentValue = value || stageData?.value || '';

    if (isCustomInputType) {
      if (isEditing) return renderCustomInputEditor(inputType, isCompact, currentValue);

      if ((isExplicitlyCompleted || isLegacyCompleted) || currentValue) {
        return (
          <div className="flex items-center gap-1 min-w-0 justify-center">
            <span className="text-xs text-slate-600 truncate" title={currentValue || undefined}>{currentValue || '—'}</span>
            {!readOnly && (
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-slate-400 hover:text-blue-600 shrink-0" onClick={(e) => { e.stopPropagation(); setIsEditing(true); setCustomInputValue(currentValue); if (inputType === 'multiselect') setCustomMultiSelectValues(currentValue ? currentValue.split(', ') : []); }} title="Edit">
                {getInputTypeIcon(inputType)}
              </Button>
            )}
          </div>
        );
      }

      if (readOnly) return <span className="text-sm text-gray-300">—</span>;
      return (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-slate-500 border border-dashed border-gray-300 hover:border-gray-400 shrink-0" onClick={() => { setIsEditing(true); setCustomInputValue(currentValue); if (inputType === 'multiselect') setCustomMultiSelectValues(currentValue ? currentValue.split(', ') : []); }}>
          {getInputTypeLabel(inputType)}
        </Button>
      );
    }

    if (isEditing) return renderCompositeDateEditor();

    if ((isExplicitlyCompleted || isLegacyCompleted) && (!stageDate || stageDate === 'NaN/NaN/NaN') && !requiresUpload) {
      if (readOnly) return <span className="text-sm text-gray-300">—</span>;
      return (
        <Button variant="ghost" size="sm" className="h-7 px-3 text-xs text-slate-500 border border-dashed border-gray-300 hover:border-gray-400" onClick={() => setIsEditing(true)}>
          Set Date
        </Button>
      );
    }

    if ((isExplicitlyCompleted || isLegacyCompleted) && stageDate && stageDate !== 'NaN/NaN/NaN') {
      const editable = !readOnly && !requiresUpload;
      return (
        <span
          className={cn("text-sm text-slate-600 truncate", editable && "cursor-pointer hover:underline")}
          title={formatDateDisplay(stageDate)}
          onClick={(e) => { if (!editable) return; e.stopPropagation(); setIsEditing(true); }}
        >
          {formatDateDisplay(stageDate)}
        </span>
      );
    }

    if (readOnly) return <span className="text-sm text-gray-300">—</span>;

    if (!requiresUpload) {
      return (
        <Button variant="ghost" size="sm" className="h-7 px-3 text-xs text-slate-500 border border-dashed border-gray-300 hover:border-gray-400" onClick={() => setIsEditing(true)}>
          <Calendar className="h-3 w-3 mr-1" /> Add Date
        </Button>
      );
    }

    return null;
  };

  // Status-only view for the transposed table's dedicated Status column: same badge/tooltip
  // logic as renderDateContent's completed/in-progress branches, minus the date text itself
  // (which stays in the Date column). Purely a read display now — Undo Skip/Clear Stage moved
  // into the Other Actions menu (renderOtherActionsContent) so this column never has to carry
  // both a badge AND an icon-button crammed next to it.
  const renderStatusContent = (isCompact = false) => {
    if (!isStageApplicable) return <span className="text-sm text-gray-400 italic">N/A</span>;

    const stageData = task.stages?.[stage.id];
    const stageStatus = stageData?.status;
    const isSkipped = stageStatus === 'skipped';

    if (isSkipped) {
      const skippedAt = stageData?.skippedAt;
      const reason = stageData?.reason || 'No reason provided';
      let formattedSkippedDate = 'N/A';
      if (skippedAt) {
        const d = parseDate(skippedAt);
        if (d) formattedSkippedDate = format(d, 'dd/MM/yyyy');
      }
      return (
        <HoverCard openDelay={100} closeDelay={100}>
          <HoverCardTrigger asChild>
            <div className="flex items-center gap-1 text-sm text-amber-600 font-semibold cursor-help truncate">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Skipped</span>
            </div>
          </HoverCardTrigger>
          <HoverCardContent className="bg-amber-50 text-amber-900 border-amber-200">
            <div className="text-xs text-left space-y-1">
              <p><span className="font-semibold">Reason:</span> {reason}</p>
              <p><span className="font-semibold">Date:</span> {formattedSkippedDate}</p>
            </div>
          </HoverCardContent>
        </HoverCard>
      );
    }

    const isExplicitlyCompleted = stageStatus === 'completed';
    const isLegacyCompleted = !stageStatus && (!!value || stageData?.documentsUploaded === true);

    if (isExplicitlyCompleted || isLegacyCompleted) {
      const isCompletedOverdue = isStageOverdue;
      const textColorClass = isCompletedOverdue ? "text-amber-600" : "text-emerald-600";
      const icon = isCompletedOverdue ? <Clock className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />;
      const borderColorClass = isCompletedOverdue ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-100";

      return (
        <HoverCard openDelay={100} closeDelay={100}>
          <HoverCardTrigger asChild>
            <div className={`flex items-center gap-1 font-semibold text-sm ${textColorClass} cursor-help select-none truncate`}>
              {icon}
              <span className="truncate">{isCompletedOverdue ? "Overdue" : "Completed"}</span>
            </div>
          </HoverCardTrigger>
          <HoverCardContent className={`${borderColorClass} text-slate-900 border shadow-md min-w-[260px]`}>
            <div className="space-y-2 p-1">
              <div className="flex justify-between border-b border-black/10 pb-1 mb-1">
                <span className={`font-bold ${textColorClass}`}>{isCompletedOverdue ? "Completed (Overdue)" : "Completed On Time"}</span>
              </div>
              {renderStageTimingDetails({ isCompleted: true })}
            </div>
          </HoverCardContent>
        </HoverCard>
      );
    }

    if (timeStatus && !requiresUpload && !hasLinkedDocument) {
      const textColorClass = timeStatus.isOverdue ? "text-red-600" : "text-blue-600";
      const icon = timeStatus.isOverdue ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <Timer className="h-3.5 w-3.5 shrink-0" />;
      const borderColorClass = timeStatus.isOverdue ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50";

      return (
        <HoverCard openDelay={100} closeDelay={100}>
          <HoverCardTrigger asChild>
            <div className={`flex items-center gap-1 font-semibold text-sm ${textColorClass} cursor-help truncate`}>
              {icon}<span className="truncate">{timeStatus.isOverdue ? 'Overdue' : 'In Progress'}</span>
            </div>
          </HoverCardTrigger>
          <HoverCardContent className={`${borderColorClass} text-slate-900 border shadow-md min-w-[260px]`}>
            <div className="space-y-2 p-1">
              <div className="flex justify-between border-b border-black/10 pb-1 mb-1">
                <span className={`font-bold ${textColorClass}`}>{timeStatus.isOverdue ? "In Progress (Overdue)" : "In Progress (On Track)"}</span>
              </div>
              {renderStageTimingDetails({ isCompleted: false })}
            </div>
          </HoverCardContent>
        </HoverCard>
      );
    }

    return <span className="text-sm text-gray-400 italic">Not started</span>;
  };

  // Document-only view for the transposed table's dedicated Upload/View column.
  const renderUploadViewContent = (isCompact = false) => {
    if (!isStageApplicable) return null;

    const btnSizeClass = isCompact ? "h-6 w-6" : "h-7 w-7";
    const iconSizeClass = "h-3.5 w-3.5";

    const viewBtn = linkedDocument && (
      <Dialog>
        <div className="relative inline-flex">
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className={cn(hasMismatchedDocumentType ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50", btnSizeClass)} title={hasMismatchedDocumentType ? "This document's type may not match this stage — click to review" : "View document details"} onClick={handleViewDocument}>
              <Eye className={iconSizeClass} />
            </Button>
          </DialogTrigger>
          {hasMismatchedDocumentType && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 ring-1 ring-white pointer-events-none" />
          )}
        </div>
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
                    <ExtractionPreview documentId={doc.documentId} documentName={doc.documentName} extractedData={doc.extractedData || {}} fields={doc.fields || []} fileUrl={doc.fileUrl} fileName={doc.fileName} onSave={handlePreviewSave} onDelete={handleDeleteDocument} expanded={true} showSaveButton={!readOnly && !!onSave} readOnly={readOnly} type={doc.type} file={doc.file} onDataChange={(fieldName, value) => handlePreviewDataChange(doc.documentId, fieldName, value)} />
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

    const uploadBtn = !readOnly && requiresUpload && (
      <Button variant="ghost" size="icon" className={cn(hasLinkedDocument ? 'text-blue-400 hover:bg-blue-50' : 'text-blue-600 hover:bg-blue-50', btnSizeClass)} onClick={handleDocumentUpload} title={hasLinkedDocument ? 'Upload new document' : 'Upload document'}>
        <Upload className={iconSizeClass} />
      </Button>
    );

    if (!viewBtn && !uploadBtn) return null;

    return (
      <div className={cn("flex items-center gap-1 shrink-0", isCompact && "bg-slate-50/50 rounded p-0.5 border border-slate-100")}>
        {viewBtn}
        {uploadBtn}
      </div>
    );
  };

  // Officer assignment / billing-requirements-automation deep-link / skip+run-automation menu —
  // everything from renderActionsContent except the document view/upload buttons, which get
  // their own dedicated Upload/View column instead.
  // Everything that isn't date/status/document (officer assignment, the billing/requirements/
  // automation deep-link, Run Automation, Skip Stage) folds into ONE "more actions" menu instead
  // of a row of separate icon buttons — the transposed table's 4-column layout only has room for
  // a single compact trigger here, and a wall of icons per stage per task was the whole reason
  // this column existed as a distinct, decluttered space in the first place.
  const renderOtherActionsContent = (isCompact = false) => {
    if (!isStageApplicable) return null;

    const btnSizeClass = isCompact ? "h-6 w-6" : "h-7 w-7";

    const stageLinkItem = (() => {
      if (!stageLink) return null;
      if (stageLink.tab === 'billing') {
        return { icon: <CreditCard className="mr-2 h-3.5 w-3.5 text-blue-600 shrink-0" />, label: 'Preview Bill', onClick: (e: React.MouseEvent) => { e.stopPropagation(); setBillPreviewOpen(true); } };
      }
      if (stageLink.tab === 'requirements') {
        return { icon: <ClipboardList className="mr-2 h-3.5 w-3.5 text-indigo-600 shrink-0" />, label: 'Requirements Checklist', onClick: (e: React.MouseEvent) => { e.stopPropagation(); onOpenRequirements?.(task); } };
      }
      if (stageLink.tab === 'automation' && currentAutomationConfig) {
        return { icon: <Zap className="mr-2 h-3.5 w-3.5 text-purple-600 shrink-0" />, label: 'Open Automation', onClick: (e: React.MouseEvent) => { e.stopPropagation(); window.open(`/dashboard/tasks/${task.id}?tab=automation&automationId=${currentAutomationConfig.automationId}`, '_blank', 'noopener,noreferrer'); } };
      }
      return null;
    })();

    const menuTrigger = (
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0", btnSizeClass)} onClick={(e) => e.stopPropagation()}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
    );

    if (readOnly) {
      if (previewOnly || !stageLinkItem) return null;
      return (
        <DropdownMenu>
          {menuTrigger}
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={stageLinkItem.onClick}>{stageLinkItem.icon}{stageLinkItem.label}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    const showAutomation = !!currentAutomationConfig && !hasLinkedDocument;
    const showSkip = !isStageCompleted;

    // Status-changing actions that used to sit as icon-buttons directly next to the Status
    // column's badge (cramped, and duplicated per-row clutter) — now just menu items here.
    const stageData = task.stages?.[stage.id];
    const isSkipped = stageData?.status === 'skipped';
    const isCompleted = stageData?.status === 'completed' || (!stageData?.status && (!!value || stageData?.documentsUploaded === true));
    const showUndoSkip = isSkipped;
    const showClear = isCompleted && !requiresUpload;
    // Lets staff correct a document that was uploaded into the wrong tab of the stage's upload
    // dialog (each tab stamps the document row with its own kycId), retagging the existing file
    // to the right type instead of deleting and re-uploading it. Only meaningful when the stage
    // actually offers more than one document type to choose between.
    const showReassignType = hasMismatchedDocumentType;

    let officerSubmenu: React.ReactNode = null;
    if (onOfficerChange && officers.length > 0 && stage.follow_up?.toLowerCase() === 'officer') {
      const stageOfficerIds = new Set<string>();
      if (Array.isArray(stage.officer_ids)) stage.officer_ids.forEach((id: any) => stageOfficerIds.add(id.toString()));
      else if (stage.officer_id) stageOfficerIds.add(stage.officer_id.toString());

      const stageOfficers = officers.filter(o => stageOfficerIds.has(o.id.toString()));
      if (stageOfficers.length > 0) {
        const taskStageData = task.stages?.[stage.id];
        const assignedOfficerId = taskStageData?.officer_ids?.[0] || taskStageData?.officer_id;
        const assignedOfficer = assignedOfficerId ? officers.find(o => o.id === assignedOfficerId || o.id?.toString() === assignedOfficerId?.toString()) : null;

        officerSubmenu = (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <User className={cn("mr-2 h-3.5 w-3.5 shrink-0", assignedOfficer ? 'text-green-600' : 'text-slate-500')} />
              <span className="flex-1">Assign Officer</span>
              {assignedOfficer && <span className="text-[10px] text-muted-foreground ml-2 truncate max-w-[90px]">{assignedOfficer.displayName || assignedOfficer.name}</span>}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => handleOfficerChange(null)}>
                <Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", assignedOfficerId ? "invisible" : "")} />
                Unassigned
              </DropdownMenuItem>
              {stageOfficers.map(officer => (
                <DropdownMenuItem key={officer.id} onClick={() => handleOfficerChange(officer.id)}>
                  <Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", (assignedOfficerId === officer.id || assignedOfficerId?.toString() === officer.id?.toString()) ? "" : "invisible")} />
                  {officer.displayName || officer.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        );
      }
    }

    const hasAnyItem = !!stageLinkItem || !!officerSubmenu || showAutomation || showSkip || showUndoSkip || showClear || showReassignType;
    if (!hasAnyItem) return null;

    return (
      <DropdownMenu>
        {menuTrigger}
        <DropdownMenuContent align="end">
          {stageLinkItem && <DropdownMenuItem onClick={stageLinkItem.onClick}>{stageLinkItem.icon}{stageLinkItem.label}</DropdownMenuItem>}
          {officerSubmenu}
          {(stageLinkItem || officerSubmenu) && (showAutomation || showSkip || showUndoSkip || showClear || showReassignType) && <DropdownMenuSeparator />}
          {showAutomation && (
            <DropdownMenuItem onClick={handleTriggerAutomation} disabled={isAutomationRunning}>
              <Zap className="mr-2 h-3.5 w-3.5 text-blue-600 fill-blue-600 shrink-0" />
              <div className="flex flex-col">
                <span>Run Automation</span><span className="text-[10px] text-muted-foreground leading-tight">via {currentAutomationConfig.docName}</span>
              </div>
            </DropdownMenuItem>
          )}
          {showReassignType && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setIsReassignTypeDialogOpen(true); }}>
              <Link2 className="mr-2 h-3.5 w-3.5 shrink-0 text-indigo-600" />Fix Document Type
            </DropdownMenuItem>
          )}
          {showSkip && (
            <DropdownMenuItem onClick={handleSkipClick}>
              <SkipForward className="mr-2 h-3.5 w-3.5 shrink-0" />Skip Stage
            </DropdownMenuItem>
          )}
          {showUndoSkip && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleUnskip(); }} disabled={isLoading}>
              <RotateCcw className="mr-2 h-3.5 w-3.5 shrink-0 text-blue-600" />Undo Skip
            </DropdownMenuItem>
          )}
          {showClear && (
            <DropdownMenuItem onClick={handleClearStage} disabled={isLoading} className="text-red-600 focus:text-red-600">
              <RotateCcw className="mr-2 h-3.5 w-3.5 shrink-0" />Clear Stage
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const isDependencyMet = useMemo(() => {
    const deps = stage?.dependencies || [];
    if (deps.length === 0) return true;

    for (const dep of deps) {
      const parentStageData = task?.stages?.[dep.stageId];
      const hasData = parentStageData?.date || parentStageData?.value || parentStageData?.status;
      const isCompleted = parentStageData?.status === 'completed';

      switch (dep.dependencyType) {
        case 'visible_when_completed':
          if (!isCompleted) return false;
          break;
        case 'visible_when_started':
          if (!hasData) return false;
          break;
        case 'sequential':
          if (!isCompleted) return false;
          break;
        case 'always_visible':
        default:
          break;
      }
    }
    return true;
  }, [stage?.dependencies, task?.stages]);

  const renderCellContent = () => {
    // The transposed table's 4-column layout ('plain-date'/'status'/'upload'/'other') calls
    // this once per sub-column for the same stage — show N/A/Locked once (in Status, since
    // that's the column that carries stage state) rather than once per sub-column. The legacy
    // modes ('date'/'actions'/'combined') keep showing it themselves since each is the only
    // call for its consumer (StandardTable, TransposedStagesTable, StagesTable, etc.).
    const isLegacyMode = renderMode === 'date' || renderMode === 'actions' || renderMode === 'combined';

    if (!isStageApplicable) {
      if (isLegacyMode || renderMode === 'status') return <span className="text-xs text-gray-400 italic">N/A</span>;
      return null;
    }

    if (!isDependencyMet) {
      const waitingOn = (stage?.dependencies || [])
        .filter((dep: any) => {
          const parentStageData = task?.stages?.[dep.stageId];
          const hasData = parentStageData?.date || parentStageData?.value || parentStageData?.status;
          const isCompleted = parentStageData?.status === 'completed';
          if (dep.dependencyType === 'visible_when_completed' || dep.dependencyType === 'sequential') return !isCompleted;
          if (dep.dependencyType === 'visible_when_started') return !hasData;
          return false;
        })
        .map((dep: any) => dep.stageName || 'Unknown')
        .join(', ');

      if (!isLegacyMode && renderMode !== 'status') return null;

      return (
        <HoverCard openDelay={100} closeDelay={100}>
          <HoverCardTrigger asChild>
            <div className="flex items-center gap-1.5 px-1 py-0.5 rounded bg-gray-50 border border-dashed border-gray-200 cursor-help w-full">
              <Lock className="h-3 w-3 text-gray-300 shrink-0" />
              <span className="text-[10px] text-gray-300 italic truncate">Locked</span>
            </div>
          </HoverCardTrigger>
          <HoverCardContent>
            <p className="text-xs">Waiting for: {waitingOn}</p>
          </HoverCardContent>
        </HoverCard>
      );
    }

    if (renderMode === 'date') return renderDateContent(false);
    if (renderMode === 'actions') return renderActionsContent(false);
    if (renderMode === 'plain-date') return renderPlainDateContent(false);
    if (renderMode === 'status') return renderStatusContent(false);
    if (renderMode === 'upload') return renderUploadViewContent(false);
    if (renderMode === 'other') return renderOtherActionsContent(false);

    if (renderMode === 'combined') {
      return (
        <div className="flex flex-row items-center justify-between w-full h-full px-0.5 gap-1 min-h-[30px]">
          <div className="flex items-center min-w-0 flex-1 justify-start">
             {renderDateContent(true)}
          </div>
          <div className="flex items-center justify-end shrink-0">
             {renderActionsContent(true)}
          </div>
        </div>
      );
    }
    
    return <span className="text-xs text-gray-500 italic">-</span>;
  };

  return (
    <div className="flex items-center min-h-[28px] py-0.5">
      <SkipStageDialog />
      {renderCellContent()}
      {stageLink?.tab === 'billing' && (
        <Dialog open={billPreviewOpen} onOpenChange={setBillPreviewOpen}>
          <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
            <DialogHeader><DialogTitle>Quotation Preview</DialogTitle></DialogHeader>
            {latestBillingItem ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Invoice #</span><span className="font-semibold">{latestBillingItem.invoiceNumber}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold">${Number(latestBillingItem.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-semibold capitalize">{latestBillingItem.status}</span></div>
                {latestBillingItem.description && <p className="text-muted-foreground">{latestBillingItem.description}</p>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No bill has been raised yet.</p>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setBillPreviewOpen(false)}>Close</Button>
              <Button size="sm" onClick={() => window.open(`/dashboard/tasks/${task.id}?tab=billing`, '_blank', 'noopener,noreferrer')}>
                Open Billing Tab <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {isReassignTypeDialogOpen && (
        <ReassignDocumentTypeDialog
          open={isReassignTypeDialogOpen}
          onOpenChange={setIsReassignTypeDialogOpen}
          task={task}
          stage={stage}
          linkedDocuments={linkedDocuments}
          kycDocuments={kycDocuments}
          onSuccess={async () => {
            if (onDocumentTypeFixed) await onDocumentTypeFixed();
            else if (onFetchData) await onFetchData();
          }}
        />
      )}
    </div>
  );
}

function SkipStageDialog() { return null; }