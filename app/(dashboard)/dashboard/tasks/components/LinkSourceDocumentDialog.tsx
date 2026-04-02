// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, Loader2, FileText, Trash2, RotateCcw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  getWorkflowLogsForIndividual
} from "../utils/workflowSyncService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ExtractionPreview } from "@/components/ExtractionPreview";

// --- Interface Definitions ---
interface SelectedDoc {
  id: string; // The instance ID of the document in the 'documents' table
  document_id: string; // The KYC type ID (e.g., 'passport', 'visa')
}

interface Task {
  id: string;
  applicant_name: string;
  individual_id: string;
  source_document_id?: Record<string, SelectedDoc[] | SelectedDoc>;
  created_at: string;
  class_id?: string;
  subclass_id?: string;
  subdepartment?: { id: string } | string;
  department?: { id: string } | string;
}

interface TaskDocumentLink {
  id: string;
  source_document_id: Record<string, SelectedDoc[] | SelectedDoc>;
}

interface Stage {
  id: string;
  name: string;
  order_num?: number;
  documents?: Array<{ kycId: string; isSpecial?: boolean; targetEntities?: any[]; class_id?: string; subdept_id?: string; entityType?: string }>;
}

interface Document {
  id: number;
  document_id: string;
  file_path: string;
  file_name?: string;
  file_type?: string;
  name?: string;
  created_at: string;
  director_id: number;
  extracted_details?: Record<string, any>;
  extracted_data?: Record<string, any>;
  fields?: any[];
  status?: string;
  download_url?: string;
}

interface KycDocument {
  id: string;
  name: string;
  display_name?: string;
  fields?: any[];
  document_type?: string;
}

interface LinkSourceDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
  stages: Stage[];
  allDocuments: Document[];
  kycDocuments: Map<string, KycDocument>;
  onLinkSuccess: () => void;
  departments?: any[];
}

const isStageApplicableToTask = (
  stage: any,
  task: any,
  departments: any[] = []
): boolean => {
  try {
    if (!task || !departments.length) return true;
    const dept = departments.find(
      (d) => d?.id === task.department?.id || d?.id === task.department
    );
    if (!dept) return true;
    const subdept = dept.tm_subdepartments?.find(
      (s: any) => s?.id === task.subdepartment?.id || s?.id === task.subdepartment
    );
    if (task.subdepartment && !subdept) return false;
    if (!task.subdepartment) {
      const deptStage = dept.stages?.find((s: any) => s.stage_id === stage.id);
      return deptStage ? deptStage.applicable !== false : true;
    }
    const subdeptStage = subdept.stages?.find(
      (s: any) => s.stage_id === stage.id
    );
    if (subdeptStage && subdeptStage.applicable === false) return false;
    if (task.class_id) {
      const cls = subdept.classes?.find(
        (c: any) =>
          c?.id?.toString() === task.class_id?.toString() ||
          c?.id === task.class_id
      );
      if (cls) {
        const classStage = cls.stages?.find((s: any) => s.stage_id === stage.id);
        if (classStage && classStage.applicable === false) return false;
      }
    }
    return true;
  } catch (error) {
    console.error("Error in isStageApplicableToTask:", error);
    return false;
  }
};

// Function to filter documents applicable to the current task context (from StageUploadDialog)
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

// Function to get documents linked to other tasks
const getDocumentsLinkedToOtherTasks = async (
  currentTaskId: string,
  individualId: string
): Promise<Set<string>> => {
  try {
    const { data: tasks, error } = await supabase
      .from("tm_tasks")
      .select("id, source_document_id")
      .eq("individual_id", individualId)
      .neq("id", currentTaskId)
      .not("source_document_id", "is", null);

    if (error) throw error;

    const linkedDocIds = new Set<string>();

    if (tasks) {
      tasks.forEach((task: TaskDocumentLink) => {
        if (task.source_document_id && typeof task.source_document_id === "object") {
          Object.values(task.source_document_id).forEach((docs) => {
            const docArray = Array.isArray(docs) ? docs : [docs];
            docArray.forEach((doc) => {
              if (doc?.id) {
                linkedDocIds.add(doc.id.toString());
              }
            });
          });
        }
      });
    }

    return linkedDocIds;
  } catch (error) {
    console.error("Error fetching linked documents:", error);
    return new Set<string>();
  }
};

export function LinkSourceDocumentDialog({
  open,
  onOpenChange,
  task,
  stages,
  allDocuments,
  kycDocuments,
  onLinkSuccess,
  departments = [],
}: LinkSourceDocumentDialogProps) {
  const [selectedDocs, setSelectedDocs] = useState<Record<string, SelectedDoc[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<number | null>(null);
  const [documentsLinkedToOtherTasks, setDocumentsLinkedToOtherTasks] = useState<Set<string>>(new Set());
  const [isLoadingLinkedDocs, setIsLoadingLinkedDocs] = useState(false);
  const [workflowDocuments, setWorkflowDocuments] = useState<Record<string, any>>({});

  // NEW: Handle workflow resolution for original documents in write_up stage
  const resolveOriginalDocumentWorkflow = async (newDocumentId: string, documentTypeId: string) => {
    try {
      console.log('[LinkSourceDocumentDialog] resolveOriginalDocumentWorkflow called:', {
        newDocumentId,
        documentTypeId,
        individualId: task.individual_id
      });

      // Find existing workflow logs for this document type that have not_applicable status
      const { data: existingLogs, error: logsError } = await supabase
        .from('document_workflow_logs')
        .select('*')
        .eq('individual_id', task.individual_id)
        .eq('document_type_id', documentTypeId)
        .order('created_at', { ascending: false });

      if (logsError) {
        console.error('[LinkSourceDocumentDialog] Error fetching existing logs:', logsError);
        throw logsError;
      }

      console.log('[LinkSourceDocumentDialog] Found existing logs:', {
        count: existingLogs?.length || 0,
        logs: existingLogs
      });

      if (!existingLogs || existingLogs.length === 0) {
        console.log('[LinkSourceDocumentDialog] No existing workflow logs found for document type:', documentTypeId);
        return;
      }

      // Find the most recent log with not_applicable tasks
      const logToResolve = existingLogs.find(log => {
        const tasks = Array.isArray(log.tasks) ? log.tasks : [];
        const hasNotApplicable = tasks.some((task: any) => task.status === 'not_applicable');
        console.log('[LinkSourceDocumentDialog] Checking log:', {
          logId: log.id,
          tasks: log.tasks,
          hasNotApplicable
        });
        return hasNotApplicable;
      });

      if (!logToResolve) {
        console.log('[LinkSourceDocumentDialog] No logs with not_applicable status found');
        return;
      }

      console.log('[LinkSourceDocumentDialog] Found log to resolve:', logToResolve.id);

      // Create a new resolution that marks the document as renewed
      const newResolution = {
        outcome: 'renewed_by_client',
        document_id: newDocumentId, // Link to the new document
        effectiveDate: new Date().toISOString().split('T')[0],
        note: 'Document renewed through task completion',
        createdAt: new Date().toISOString()
      };

      // Update the workflow log with the new resolution
      const updatedResolutions = Array.isArray(logToResolve.resolutions)
        ? [...logToResolve.resolutions, newResolution]
        : [newResolution];

      // Update tasks array to remove not_applicable status
      const updatedTasks = Array.isArray(logToResolve.tasks)
        ? logToResolve.tasks.map((task: any) =>
          task.status === 'not_applicable'
            ? { ...task, status: 'completed', note: 'Document renewed - task completed' }
            : task
        )
        : [];

      console.log('[LinkSourceDocumentDialog] Updating workflow log:', {
        logId: logToResolve.id,
        newResolution,
        updatedResolutionsCount: updatedResolutions.length,
        updatedTasksCount: updatedTasks.length
      });

      const { error: updateError } = await supabase
        .from('document_workflow_logs')
        .update({
          resolutions: updatedResolutions,
          tasks: updatedTasks,
          action_type: 'resolution',
          updated_at: new Date().toISOString()
        })
        .eq('id', logToResolve.id);

      if (updateError) {
        console.error('[LinkSourceDocumentDialog] Error updating workflow log:', updateError);
        throw updateError;
      }

      console.log('[LinkSourceDocumentDialog] Successfully resolved original document workflow:', {
        logId: logToResolve.id,
        newResolution,
        updatedTasksCount: updatedTasks.length
      });

      toast({
        title: 'Document Renewed',
        description: 'Original document workflow has been updated to reflect renewal',
        variant: 'default'
      });

    } catch (error) {
      console.error('[LinkSourceDocumentDialog] Error resolving original document workflow:', error);
      toast({
        title: 'Workflow Resolution Error',
        description: 'Failed to update original document workflow',
        variant: 'destructive'
      });
    }
  };

  // NEW: Handle unlinking of documents
  const handleUnlinkDocument = useCallback(async (stageId: string, docId: string) => {
    try {
      setIsLoading(true);

      console.log('[LinkSourceDocumentDialog] Unlinking document:', { stageId, docId });

      // Remove the document from the selected docs in local state
      setSelectedDocs(prev => {
        const currentSelections = prev[stageId] ? [...prev[stageId]] : [];
        const filteredSelections = currentSelections.filter(d => d.id !== docId);
        return { ...prev, [stageId]: filteredSelections };
      });

      // Update the database to remove the document from source_document_id
      const { data: currentTask } = await supabase
        .from('tm_tasks')
        .select('source_document_id, stages')
        .eq('id', task.id)
        .single();

      if (currentTask?.source_document_id) {
        // Remove the document from the stage in source_document_id
        const updatedSourceDocs = { ...currentTask.source_document_id };
        if (updatedSourceDocs[stageId]) {
          updatedSourceDocs[stageId] = Array.isArray(updatedSourceDocs[stageId])
            ? updatedSourceDocs[stageId].filter((doc: any) => doc.id !== docId)
            : updatedSourceDocs[stageId].id !== docId ? updatedSourceDocs[stageId] : [];
        }

        // Also update the stages JSON to remove the document
        const updatedStages = { ...currentTask.stages };
        if (updatedStages?.[stageId]?.documents) {
          const stageDocs = updatedStages[stageId].documents;
          Object.keys(stageDocs).forEach(docKey => {
            if (stageDocs[docKey]?.id === docId) {
              delete stageDocs[docKey];
            }
          });
        }

        // Update both source_document_id and stages in the database
        const { error: updateError } = await supabase
          .from('tm_tasks')
          .update({
            source_document_id: updatedSourceDocs,
            stages: updatedStages,
            updated_at: new Date().toISOString()
          })
          .eq('id', task.id);

        if (updateError) {
          console.error('[LinkSourceDocumentDialog] Error updating task:', updateError);
          throw updateError;
        }

        console.log('[LinkSourceDocumentDialog] Successfully unlinked document and updated stages');
      }

      toast({
        title: 'Document Unlinked',
        description: 'Document has been removed from the task and stages updated',
        variant: 'default'
      });

      // Refresh the data
      onLinkSuccess();
    } catch (error) {
      console.error('Error unlinking document:', error);
      toast({
        title: 'Error',
        description: 'Failed to unlink document',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [task.id, onLinkSuccess]);

  const initialSelectedDocs = useMemo(() => {
    const normalized: Record<string, SelectedDoc[]> = {};
    if (task?.source_document_id && typeof task.source_document_id === "object") {
      Object.entries(task.source_document_id).forEach(([stageId, docs]) => {
        const stageDocs = Array.isArray(docs) ? docs : [docs];
        normalized[stageId] = stageDocs
          .filter((d): d is SelectedDoc => !!d && allDocuments.some(doc => doc.id.toString() === d.id?.toString()))
          .map(d => ({
            id: d.id.toString(),
            document_id: d.document_id
          }));
      });
    }
    return normalized;
  }, [task?.source_document_id, allDocuments]);

  // Fetch documents linked to other tasks when dialog opens
  useEffect(() => {
    if (open && task?.individual_id && task?.id) {
      setIsLoadingLinkedDocs(true);
      getDocumentsLinkedToOtherTasks(task.id, task.individual_id)
        .then(setDocumentsLinkedToOtherTasks)
        .catch((error) => {
          console.error("Error loading linked documents:", error);
          toast({
            title: "Warning",
            description: "Could not check for documents linked to other tasks.",
            variant: "destructive"
          });
        })
        .finally(() => setIsLoadingLinkedDocs(false));
    }
  }, [open, task?.id, task?.individual_id]);

  // Fetch workflow documents when dialog opens
  useEffect(() => {
    if (open && task?.individual_id) {
      getWorkflowLogsForIndividual(task.individual_id)
        .then((logs) => {
          const workflowDocMap: Record<string, any> = {};

          // Process workflow logs to understand existing workflow context
          if (logs) {
            logs.forEach((log: any) => {
              // Check if this log represents a completed workflow
              const isCompleted = log.resolutions && log.resolutions.length > 0;

              // For completed workflows, use resolution outcome
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

          setWorkflowDocuments(workflowDocMap);
        })
        .catch((error) => {
          console.error("Error loading workflow documents:", error);
        });
    }
  }, [open, task?.individual_id]);

  useEffect(() => {
    if (open) {
      setSelectedDocs(initialSelectedDocs);
    }
  }, [open, initialSelectedDocs]);

  const applicableStages = useMemo(() => {
    return stages
      .filter(
        (stage) =>
          isStageApplicableToTask(stage, task, departments) &&
          stage.documents?.length > 0
      )
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  }, [stages, task, departments]);

  const handleSave = useCallback(async () => {
    setIsLoading(true);
    try {
      // Update the task with selected documents
      const { error } = await supabase
        .from("tm_tasks")
        .update({
          source_document_id: selectedDocs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.id);

      if (error) throw error;

      // NEW: Handle workflow resolution for write_up stage
      const writeUpStageId = '072b9710-45df-4a05-ba65-01b4ef29d61d';
      const writeUpDocs = selectedDocs[writeUpStageId] || [];

      if (writeUpDocs.length > 0) {
        console.log('[LinkSourceDocumentDialog] Write-up stage detected, attempting workflow resolution:', {
          stageId: writeUpStageId,
          docsCount: writeUpDocs.length
        });

        // Process each document in write_up stage
        for (const doc of writeUpDocs) {
          const uploadedDocInfo = doc; // Already has id and document_id
          console.log('[LinkSourceDocumentDialog] Calling resolveOriginalDocumentWorkflow with:', {
            newDocumentId: uploadedDocInfo.id,
            documentTypeId: uploadedDocInfo.document_id
          });
          await resolveOriginalDocumentWorkflow(uploadedDocInfo.id, uploadedDocInfo.document_id);
        }
      }

      toast({ title: "Success", description: "Source documents linked successfully." });
      onLinkSuccess();
    } catch (error: any) {
      console.error("Failed to link documents:", error);
      toast({ title: "Error", description: `Failed to link source documents: ${error.message}`, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [selectedDocs, task.id, onLinkSuccess]);

  const handleDocSelectionChange = useCallback((stageId: string, doc: Document, isSelected: boolean) => {
    setSelectedDocs((prev) => {
      const currentSelections = prev[stageId] ? [...prev[stageId]] : [];
      const index = currentSelections.findIndex((d) => d.id.toString() === doc.id.toString());

      if (isSelected && index === -1) {
        currentSelections.push({ id: doc.id.toString(), document_id: doc.document_id });
      } else if (!isSelected && index !== -1) {
        currentSelections.splice(index, 1);
      }
      return { ...prev, [stageId]: currentSelections };
    });
  }, []);

  const fetchKycDocumentData = useCallback(async (kycId: string): Promise<KycDocument | null> => {
    try {
      const { data, error } = await supabase
        .from("acc_portal_kyc")
        .select("id, fields, name, display_name, document_type")
        .eq("id", kycId)
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error fetching KYC document:", error);
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

  const handlePreviewClick = useCallback(async (doc: Document) => {
    setLoadingPreviewId(doc.id);
    try {
      const kycDoc = await fetchKycDocumentData(doc.document_id);
      if (!kycDoc) {
        toast({ title: 'Error', description: 'Could not load document configuration.', variant: 'destructive' });
        return;
      }

      // Get the file name from the path
      const fileName = doc.file_path?.split('/').pop() || 'document.pdf';

      const fileUrl = doc.file_path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${doc.file_path}` : null;
      if (!fileUrl) {
        throw new Error('No file URL available for preview');
      }

      const previewData = {
        documentId: doc.id,
        documentName: kycDoc.display_name || kycDoc.name || 'Document',
        fileUrl: fileUrl,
        fileName: fileName,
        extractedData: doc.extracted_data || doc.extracted_details || {},
        fields: transformKycFieldsToPreviewFormat(kycDoc.fields || []),
        type: kycDoc.document_type || 'document',
        file: {
          url: fileUrl,
          name: fileName,
          type: doc.file_type || 'application/pdf'
        }
      };

      setPreviewDocument(previewData);
      setIsPreviewOpen(true);
    } catch (error) {
      console.error("Error preparing preview:", error);
      toast({
        title: 'Error',
        description: 'Failed to prepare document for preview.',
        variant: 'destructive'
      });
    } finally {
      setLoadingPreviewId(null);
    }
  }, [fetchKycDocumentData, transformKycFieldsToPreviewFormat]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Link Source Documents for: {task?.applicant_name}</DialogTitle>
            <DialogDescription>Select one or more documents for each stage.</DialogDescription>
          </DialogHeader>

          <div className="flex-grow overflow-hidden border-t border-b">
            <ScrollArea className="h-full pr-6">
              {isLoadingLinkedDocs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                  <p className="ml-3 text-slate-600">Loading available documents...</p>
                </div>
              ) : (
                <div className="space-y-6 py-4">
                  {applicableStages.map((stage) => {
                    // Filter stage documents to only those applicable to this task
                    const applicableDocuments = stage.documents?.filter((doc) =>
                      isDocumentApplicableToTask(doc, task)
                    ) || [];

                    // Get KYC IDs only from applicable documents
                    const stageDocTypes = new Set(applicableDocuments.map((d) => d.kycId));

                    const availableDocs = allDocuments
                      .filter(
                        (d) =>
                          d.director_id?.toString() === task.individual_id?.toString() &&
                          stageDocTypes.has(d.document_id) && // Only fetch documents of applicable types
                          !documentsLinkedToOtherTasks.has(d.id.toString()) // Filter out docs linked to other tasks
                      )
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                    return (
                      <div key={stage.id} className="p-4 border rounded-lg">
                        <h3 className="font-semibold text-lg text-slate-800 mb-3">{stage.name}</h3>
                        {availableDocs.length > 0 ? (
                          <div className="space-y-2">
                            {availableDocs.map((doc) => {
                              const kycDoc = kycDocuments.get(doc.document_id);
                              const isSelected = selectedDocs[stage.id]?.some(d => d.id.toString() === doc.id.toString()) || false;

                              return (
                                <div
                                  key={doc.id}
                                  className={`flex items-center gap-4 p-3 border rounded-md transition-colors ${isSelected ? "bg-blue-50 border-blue-300" : "hover:bg-slate-50"}`}
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <Checkbox
                                      id={`${stage.id}-${doc.id}`}
                                      checked={isSelected}
                                      onCheckedChange={(checked) => handleDocSelectionChange(stage.id, doc, !!checked)}
                                    />
                                    <div className="min-w-0">
                                      <Label htmlFor={`${stage.id}-${doc.id}`} className="font-medium text-slate-900 block truncate cursor-pointer">
                                        {kycDoc?.display_name || kycDoc?.name || doc.document_id}
                                      </Label>
                                      <p className="text-xs text-slate-500 truncate">{doc.file_path?.split("/").pop() || "document"}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-green-600 hover:bg-green-100"
                                      onClick={() => handlePreviewClick(doc)}
                                      title="Preview Document"
                                      disabled={loadingPreviewId !== null}
                                    >
                                      {loadingPreviewId === doc.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Eye className="h-4 w-4" />
                                      )}
                                    </Button>
                                    <div className="text-xs text-slate-500 text-right">
                                      <p>Uploaded:</p>
                                      <p>{format(parseISO(doc.created_at), 'dd MMM yyyy')}</p>
                                      {workflowDocuments[doc.id.toString()] && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 ml-2">
                                          {workflowDocuments[doc.id.toString()].workflowOutcome || 'Workflow Document'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-slate-500">
                            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="font-medium">No available documents for this stage</p>
                            <p className="text-xs mt-1">All documents may be linked to other tasks or not applicable to this task type</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isLoading || isLoadingLinkedDocs}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Links
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-[90vw] w-full max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Preview: {previewDocument?.documentName}</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto p-1">
            {previewDocument ? (
              <ExtractionPreview
                key={previewDocument.documentId}
                documentName={previewDocument.documentName}
                extractedData={previewDocument.extractedData}
                fields={previewDocument.fields}
                fileUrl={previewDocument.fileUrl}
                fileName={previewDocument.fileName}
                expanded={true}
                showSaveButton={false} // View only mode in this context
                viewMode={true}
                type={previewDocument.type}
                file={previewDocument.file}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="ml-4">Loading preview...</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}