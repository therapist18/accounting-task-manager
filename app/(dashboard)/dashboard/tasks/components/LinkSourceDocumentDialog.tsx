// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "@/lib/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { auditActor } from "../utils/audit";
import { Button } from "@/components/ui/button";
import {
  isStageDocumentApplicableToTask,
  collectTaskTriggerDocumentIds,
  getDocumentLinkAvailabilityContext,
  invalidateDocumentLinkAvailabilityCache,
  isDocumentAvailableForLinking,
  buildStageLinkUpdate,
  buildStageUnlinkUpdate,
  computeAdvancedTaskStatus,
  maybeResolveWriteUpWorkflowPairing,
} from "../utils/taskManagerData";
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
import { Badge } from "@/components/ui/badge";
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
  status?: string;
  linked_document_type_id?: string;
  source_document_id?: Record<string, SelectedDoc[] | SelectedDoc>;
  created_at: string;
  class_id?: string;
  subclass_id?: string;
  subdepartment?: { id: string } | string;
  department?: { id: string } | string;
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
  const { user: currentUser } = useCurrentUser();
  const actor = auditActor(currentUser);
  const [selectedDocs, setSelectedDocs] = useState<Record<string, SelectedDoc[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<number | null>(null);
  // Same "who's already claimed this document" data StageUploadDialog fetches for its own
  // "use existing document" path — see getDocumentLinkAvailabilityContext. Keeping both dialogs
  // on this one shared query/shape means a document that's unavailable in one is unavailable in
  // the other, instead of each dialog running its own divergent exclusion rule.
  const [availabilityContext, setAvailabilityContext] = useState<{
    otherTasksData: any[];
    workflowDocMap: Record<string, any>;
    triggerDocIdsFromWorkflow: Set<string>;
  } | null>(null);
  const [isLoadingLinkedDocs, setIsLoadingLinkedDocs] = useState(false);

  // Documents that triggered THIS task (e.g. a renewal task created off an expiring document) —
  // those shouldn't be offered back as something this task can "link" as if it were new.
  const currentTaskTriggerDocumentIds = useMemo(
    () => collectTaskTriggerDocumentIds(task?.source_document_id),
    [task?.source_document_id]
  );

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

  // Same availability data StageUploadDialog fetches for its own "use existing document" path.
  useEffect(() => {
    if (!open) {
      setSelectedDocs({});
      setAvailabilityContext(null);
      setIsLoadingLinkedDocs(false);
      return;
    }

    // Set initial selected docs when opening
    setSelectedDocs(initialSelectedDocs);

    let isCancelled = false;
    setIsLoadingLinkedDocs(true);
    const fetchData = async () => {
      try {
        const ctx = await getDocumentLinkAvailabilityContext(task, { isCompanyTask: false, companyId: null });
        if (!isCancelled) {
          setAvailabilityContext(ctx);
        }
      } catch (error) {
        console.error("Error initializing dialog:", error);
        if (!isCancelled) {
          toast({ title: "Error loading data", variant: "destructive" });
        }
      } finally {
        if (!isCancelled) setIsLoadingLinkedDocs(false);
      }
    };

    fetchData();
    return () => { isCancelled = true; };
  }, [open, task?.id, task?.individual_id, initialSelectedDocs]);

  const applicableStages = useMemo(() => {
    return stages
      .filter(
        (stage) =>
          isStageApplicableToTask(stage, task, departments) &&
          stage.documents?.length > 0
      )
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  }, [stages, task, departments]);

  // Precomputed once per stage/document-set/availability change, not on every render — the JSX
  // below used to re-run this filter for every stage on every render, including one triggered by
  // merely checking a checkbox (a selectedDocs update), since selectedDocs isn't a dependency here.
  const availableDocsByStage = useMemo(() => {
    const map = new Map<string, Array<{ doc: Document; hasNoTaskOutcome: boolean }>>();
    if (!availabilityContext) return map;

    applicableStages.forEach((stage) => {
      const applicableDocuments = stage.documents?.filter((doc) =>
        isStageDocumentApplicableToTask(doc, task)
      ) || [];
      const stageDocTypes = new Set(applicableDocuments.map((d) => d.kycId));

      // collectTaskTriggerDocumentIds treats every document already linked ANYWHERE on this
      // task as a "trigger doc" to exclude — correct for StageUploadDialog, which shows an
      // already-linked doc through a separate locked banner instead of this list. This dialog
      // has no such separate banner: the checkbox list IS how an already-linked document is
      // shown (checked) and unlinked (unchecked), so a doc already linked to THIS stage must
      // stay in the list even though it also counts as a trigger doc.
      const alreadyLinkedToThisStageIds = new Set(
        (initialSelectedDocs[stage.id] || []).map((d) => d.id.toString())
      );

      const availableDocs = allDocuments
        .filter((d) => {
          const individualMatch = d.director_id?.toString() === task.individual_id?.toString();
          const stageDocTypesMatch = stageDocTypes.has(d.document_id);
          return individualMatch && stageDocTypesMatch;
        })
        .map((d) => ({
          doc: d,
          ...isDocumentAvailableForLinking(d, task, availabilityContext, currentTaskTriggerDocumentIds),
        }))
        .filter((entry) => entry.available || alreadyLinkedToThisStageIds.has(entry.doc.id.toString()))
        .sort((a, b) => new Date(b.doc.created_at).getTime() - new Date(a.doc.created_at).getTime());

      map.set(stage.id, availableDocs);
    });

    return map;
  }, [applicableStages, allDocuments, availabilityContext, task, currentTaskTriggerDocumentIds, initialSelectedDocs]);

  // Builds the same stage-entry/source_document_id shape StageUploadDialog's saveAllDocuments
  // writes for an existing-document link, advances task.status through the same stage ladder,
  // and fires the same write-up/endorsement renewal pairing — see taskManagerData.ts. This dialog
  // also lets the user UNCHECK an already-linked document, so each touched stage is diffed
  // against what was linked when the dialog opened: newly-checked docs go through
  // buildStageLinkUpdate, newly-unchecked ones through buildStageUnlinkUpdate (unlink is applied
  // first so a same-stage add+remove in one save lands on the post-removal document set). Every
  // touched stage is batched into a single tm_tasks update instead of one write per stage.
  const handleSave = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentDate = new Date().toISOString();
      const allStageIds = new Set([...Object.keys(selectedDocs), ...Object.keys(initialSelectedDocs)]);

      let updatedStages = { ...task.stages };
      let updatedSourceDocs = { ...task.source_document_id };
      let runningStatus = task.status;
      let advancedStatus: string | null = null;
      const touchedStageIds: string[] = [];

      allStageIds.forEach((stageId) => {
        const currentDocs = selectedDocs[stageId] || [];
        const initialDocs = initialSelectedDocs[stageId] || [];
        const currentIds = new Set(currentDocs.map((d) => d.id.toString()));
        const initialIds = new Set(initialDocs.map((d) => d.id.toString()));

        const docsToAdd = currentDocs.filter((d) => !initialIds.has(d.id.toString()));
        const docIdsToRemove = initialDocs
          .map((d) => d.id.toString())
          .filter((id) => !currentIds.has(id));

        if (docsToAdd.length === 0 && docIdsToRemove.length === 0) return;
        touchedStageIds.push(stageId);

        if (docIdsToRemove.length > 0) {
          const { updatedStageEntry, sourceDocsForStage } = buildStageUnlinkUpdate({
            task: { stages: updatedStages, source_document_id: updatedSourceDocs },
            stageId,
            docIdsToUnlink: docIdsToRemove,
            uploaderId: actor.by_id,
            currentDate,
          });
          updatedStages = { ...updatedStages, [stageId]: updatedStageEntry };
          updatedSourceDocs = { ...updatedSourceDocs, [stageId]: sourceDocsForStage };
        }

        if (docsToAdd.length > 0) {
          const { updatedStageEntry, sourceDocsForStage } = buildStageLinkUpdate({
            task: { stages: updatedStages, source_document_id: updatedSourceDocs },
            stageId,
            docsToLink: docsToAdd,
            kycDocuments,
            uploaderId: actor.by_id,
            currentDate,
          });
          updatedStages = { ...updatedStages, [stageId]: updatedStageEntry };
          updatedSourceDocs = { ...updatedSourceDocs, [stageId]: sourceDocsForStage };
        }

        // Only a stage that ends this save as 'completed' should be able to advance the task's
        // status — a pure or net unlink reverts the stage's own status but must never ratchet
        // the task status, forward or back.
        if (updatedStages[stageId]?.status === 'completed') {
          const advance = computeAdvancedTaskStatus(runningStatus, stageId);
          if (advance) {
            advancedStatus = advance;
            runningStatus = advance;
          }
        }
      });

      if (touchedStageIds.length === 0) {
        toast({ title: "Nothing to save", description: "No changes were made.", variant: "default" });
        return;
      }

      const updateData: Record<string, any> = {
        stages: updatedStages,
        source_document_id: updatedSourceDocs,
        updated_at: currentDate,
        updated_by_id: actor.by_id,
      };
      if (advancedStatus) updateData.status = advancedStatus;

      const { error } = await supabase
        .from("tm_tasks")
        .update(updateData)
        .eq("id", task.id);

      if (error) throw error;

      // This save may have just claimed a document (or advanced the task's status), which
      // changes what the shared availability lookup would return for this individual — drop the
      // cached copy so the next dialog open (this task or another for the same individual) refetches.
      invalidateDocumentLinkAvailabilityCache(task, { isCompanyTask: false, companyId: null });

      await maybeResolveWriteUpWorkflowPairing({
        task,
        updatedStages,
        touchedStageIds,
        isCompanyTask: false,
        uploaderId: actor.by_id,
      });

      toast({ title: "Success", description: "Source document links updated successfully." });
      onLinkSuccess();
    } catch (error: any) {
      console.error("Failed to update source document links:", error);
      toast({ title: "Error", description: `Failed to update source document links: ${error.message}`, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [selectedDocs, initialSelectedDocs, task, kycDocuments, onLinkSuccess, actor.by_id]);

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
            <DialogTitle>Link Source Documents for: {task?.applicant_name} (Task ID: {task?.id})</DialogTitle>
            <DialogDescription>Check a document to link it to a stage, or uncheck an already-linked one to unlink it.</DialogDescription>
          </DialogHeader>

          <div className="flex-grow overflow-hidden border-t border-b">
            <ScrollArea className="h-full pr-6">
              {isLoadingLinkedDocs || !availabilityContext ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                  <p className="ml-3 text-slate-600">Loading available documents...</p>
                </div>
              ) : (
                <div className="space-y-6 py-4">
                  {applicableStages.map((stage) => {
                    const availableDocs = availableDocsByStage.get(stage.id) || [];

                    return (
                      <div key={stage.id} className="p-4 border rounded-lg">
                        <h3 className="font-semibold text-lg text-slate-800 mb-3">{stage.name}</h3>
                        {availableDocs.length > 0 ? (
                          <div className="space-y-2">
                            {availableDocs.map(({ doc, hasNoTaskOutcome }) => {
                              const kycDoc = kycDocuments.get(doc.document_id);
                              const isSelected = selectedDocs[stage.id]?.some(d => d.id.toString() === doc.id.toString()) || false;
                              const isDisabled = hasNoTaskOutcome && !isSelected;

                              return (
                                <div
                                  key={doc.id}
                                  className={`flex items-center gap-4 p-3 border rounded-md transition-colors ${isSelected ? "bg-blue-50 border-blue-300" : isDisabled ? "opacity-70 bg-slate-50/50" : "hover:bg-slate-50"}`}
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <Checkbox
                                      id={`${stage.id}-${doc.id}`}
                                      checked={isSelected}
                                      disabled={isDisabled}
                                      onCheckedChange={(checked) => handleDocSelectionChange(stage.id, doc, !!checked)}
                                    />
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <Label htmlFor={`${stage.id}-${doc.id}`} className={`font-medium text-slate-900 block truncate ${isDisabled ? 'cursor-default' : 'cursor-pointer'}`}>
                                          {kycDoc?.display_name || kycDoc?.name || doc.document_id}
                                        </Label>
                                        {hasNoTaskOutcome && (
                                          <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50">
                                            Resolved &mdash; not applicable
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-slate-500 truncate">{doc.file_path?.split("/").pop() || "document"}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handlePreviewClick(doc)}
                                      disabled={loadingPreviewId === doc.id}
                                      className="h-8 w-8 p-0"
                                    >
                                      {loadingPreviewId === doc.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Eye className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500 italic">No available documents for this stage.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-[1800px] h-[90vh] max-h-[95vh] p-4 flex flex-col overflow-hidden">
          {previewDocument && (
            <div className="flex-1 min-h-0">
              <ExtractionPreview
                {...previewDocument}
                expanded={true}
                showSaveButton={false}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
