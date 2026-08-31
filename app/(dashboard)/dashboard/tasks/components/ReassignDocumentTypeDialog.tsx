// @ts-nocheck
"use client"

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/lib/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Eye, Loader2, ArrowRight, Check, ChevronsUpDown } from "lucide-react";
import { ExtractionPreview } from "@/components/ExtractionPreview";
import { isStageDocumentApplicableToTask } from "../utils/taskManagerData";
import { cn } from "@/lib/utils";

// Same resolution order StageUploadDialog.tsx's resolveCompanyIdForTask uses.
const resolveCompanyIdForTask = (task: any): number | string | null => {
  if (task?.company_id) return task.company_id;
  const companyParticipant = task?.participants_details?.find((p: any) => p.type === 'company');
  if (companyParticipant?.id) return companyParticipant.id;
  if (task?.applicant_details?.type === 'company') return task.applicant_details.id;
  return null;
};

interface ReassignDocumentTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: any;
  stage: any;
  linkedDocuments: any[];
  kycDocuments: Map<string, any>;
  onSuccess: () => void | Promise<void>;
}

export function ReassignDocumentTypeDialog({
  open,
  onOpenChange,
  task,
  stage,
  linkedDocuments,
  kycDocuments,
  onSuccess,
}: ReassignDocumentTypeDialogProps) {
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [newTypeId, setNewTypeId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isTypePopoverOpen, setIsTypePopoverOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedDocId('');
      setNewTypeId('');
      return;
    }
    setSelectedDocId(linkedDocuments?.[0]?.id?.toString() || '');
    setNewTypeId('');
    setIsTypePopoverOpen(false);
  }, [open, linkedDocuments]);

  // Switching which document is being fixed invalidates any previously chosen target type.
  useEffect(() => {
    setNewTypeId('');
  }, [selectedDocId]);

  const selectedDoc = useMemo(
    () => linkedDocuments?.find((d) => d.id?.toString() === selectedDocId) || null,
    [linkedDocuments, selectedDocId]
  );

  // Only types this stage actually offers for this task's job level (department/subdepartment/
  // class via targetEntities' job_level, same rule StageUploadDialog uses to decide which upload
  // tabs to show) — so the picker never lets staff "correct" a document into a type that isn't
  // even valid for this task in the first place.
  const candidateTypes = useMemo(() => {
    const configs = Array.isArray(stage?.documents) ? stage.documents : [];
    return configs.filter((docConfig: any) =>
      docConfig.kycId &&
      docConfig.kycId !== selectedDoc?.document_id &&
      isStageDocumentApplicableToTask(docConfig, task)
    );
  }, [stage?.documents, selectedDoc, task]);

  const getTypeLabel = useCallback((kycId: string, fallbackName?: string) => {
    const kycDoc = kycDocuments.get(kycId);
    return kycDoc?.display_name || kycDoc?.name || fallbackName || kycId;
  }, [kycDocuments]);

  const handlePreviewClick = useCallback(async (doc: any) => {
    setLoadingPreviewId(doc.id);
    try {
      const { data: kycDoc, error } = await supabase
        .from('acc_portal_kyc')
        .select('id, fields, name, display_name, document_type')
        .eq('id', doc.document_id)
        .single();
      if (error || !kycDoc) {
        toast({ title: 'Error', description: 'Could not load document configuration.', variant: 'destructive' });
        return;
      }

      const fileName = doc.file_path?.split('/').pop() || 'document.pdf';
      const fileUrl = doc.file_path
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${doc.file_path}`
        : null;
      if (!fileUrl) throw new Error('No file URL available for preview');

      setPreviewDocument({
        documentName: kycDoc.display_name || kycDoc.name || 'Document',
        fileUrl,
        fileName,
        extractedData: doc.extracted_data || doc.extracted_details || {},
        fields: [],
        type: kycDoc.document_type || 'document',
        file: { url: fileUrl, name: fileName, type: doc.file_type || 'application/pdf' },
      });
      setIsPreviewOpen(true);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to prepare document for preview.', variant: 'destructive' });
    } finally {
      setLoadingPreviewId(null);
    }
  }, []);

  const handleReassign = useCallback(async () => {
    if (!selectedDoc || !newTypeId) return;
    setIsSaving(true);
    try {
      const isCompanyTask = !task?.individual_id && !!resolveCompanyIdForTask(task);
      const table = isCompanyTask ? 'acc_portal_kyc_uploads' : 'acc_portal_directors_documents';
      const currentDate = new Date().toISOString();

      const { error: docError } = await supabase
        .from(table)
        .update({ document_id: newTypeId, updated_at: currentDate })
        .eq('id', selectedDoc.id);
      if (docError) throw docError;

      const { data: currentTask, error: taskFetchError } = await supabase
        .from('tm_tasks')
        .select('stages, source_document_id')
        .eq('id', task.id)
        .single();
      if (taskFetchError) throw taskFetchError;

      const updatedSourceDocs = { ...(currentTask.source_document_id || {}) };
      if (updatedSourceDocs[stage.id]) {
        const stageRefs = Array.isArray(updatedSourceDocs[stage.id])
          ? updatedSourceDocs[stage.id]
          : [updatedSourceDocs[stage.id]];
        updatedSourceDocs[stage.id] = stageRefs.map((ref: any) => {
          const refId = typeof ref === 'string' ? ref : ref.id;
          if (refId?.toString() !== selectedDoc.id.toString()) return ref;
          return typeof ref === 'string' ? ref : { ...ref, document_id: newTypeId };
        });
      }

      const newTypeLabel = getTypeLabel(newTypeId);
      const updatedStages = { ...(currentTask.stages || {}) };
      const stageEntry = updatedStages[stage.id];
      if (stageEntry?.documents) {
        const updatedDocs = { ...stageEntry.documents };
        Object.keys(updatedDocs).forEach((key) => {
          if (updatedDocs[key]?.id?.toString() === selectedDoc.id.toString()) {
            updatedDocs[key] = { ...updatedDocs[key], document_id: newTypeId, name: newTypeLabel };
          }
        });
        updatedStages[stage.id] = { ...stageEntry, documents: updatedDocs, lastUpdated: currentDate };
      }

      const { error: taskUpdateError } = await supabase
        .from('tm_tasks')
        .update({ stages: updatedStages, source_document_id: updatedSourceDocs, updated_at: currentDate })
        .eq('id', task.id);
      if (taskUpdateError) throw taskUpdateError;

      toast({
        title: 'Document type corrected',
        description: `Reassigned to ${newTypeLabel}. The file itself was kept — only its document type was fixed.`,
      });
      await onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error reassigning document type:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to reassign document type.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [selectedDoc, newTypeId, task, stage, getTypeLabel, onSuccess, onOpenChange]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fix Document Type — {stage?.name}</DialogTitle>
            <DialogDescription>
              Use this when a document was uploaded under the wrong tab and is now tagged with the
              wrong document type. This relabels the existing file — it does not delete or replace it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div>
              <Label className="text-sm font-medium">Which document is mistagged?</Label>
              <RadioGroup value={selectedDocId} onValueChange={setSelectedDocId} className="mt-2 space-y-2">
                {(linkedDocuments || []).map((doc) => (
                  <div
                    key={doc.id}
                    className={`flex items-center gap-3 p-3 border rounded-md ${selectedDocId === doc.id?.toString() ? "bg-blue-50 border-blue-300" : ""}`}
                  >
                    <RadioGroupItem value={doc.id?.toString()} id={`doc-${doc.id}`} />
                    <div className="flex-1 min-w-0">
                      <Label htmlFor={`doc-${doc.id}`} className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Currently: {getTypeLabel(doc.document_id)}</Badge>
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-1">{doc.file_path?.split("/").pop() || "document"}</p>
                      </Label>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 shrink-0"
                      onClick={() => handlePreviewClick(doc)}
                      disabled={loadingPreviewId === doc.id}
                    >
                      {loadingPreviewId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                ))}
                {(!linkedDocuments || linkedDocuments.length === 0) && (
                  <p className="text-sm text-slate-500 italic">No documents linked to this stage.</p>
                )}
              </RadioGroup>
            </div>

            {selectedDoc && (
              <div>
                <Label className="text-sm font-medium">Correct document type</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="shrink-0">{getTypeLabel(selectedDoc.document_id)}</Badge>
                  <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
                  <Popover open={isTypePopoverOpen} onOpenChange={setIsTypePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={isTypePopoverOpen}
                        className="flex-1 justify-between font-normal"
                        disabled={candidateTypes.length === 0}
                      >
                        {newTypeId ? getTypeLabel(newTypeId) : "Select the correct type..."}
                        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search document types..." />
                        <CommandList className="max-h-[260px] overflow-y-auto">
                          <CommandEmpty>No matching document type.</CommandEmpty>
                          <CommandGroup>
                            {candidateTypes.map((docConfig: any) => (
                              <CommandItem
                                key={docConfig.kycId}
                                value={getTypeLabel(docConfig.kycId, docConfig.name)}
                                onSelect={() => { setNewTypeId(docConfig.kycId); setIsTypePopoverOpen(false); }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", newTypeId === docConfig.kycId ? "opacity-100" : "opacity-0")} />
                                {getTypeLabel(docConfig.kycId, docConfig.name)}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                {candidateTypes.length === 0 && (
                  <p className="text-xs text-slate-500 italic mt-2">
                    No other document types are configured for this stage.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleReassign} disabled={isSaving || !selectedDoc || !newTypeId}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reassign Type
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewDocument && (
        <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>{previewDocument.documentName}</DialogTitle>
            </DialogHeader>
            <ExtractionPreview
              documentName={previewDocument.documentName}
              extractedData={previewDocument.extractedData}
              fields={previewDocument.fields}
              fileUrl={previewDocument.fileUrl}
              fileName={previewDocument.fileName}
              type={previewDocument.type}
              file={previewDocument.file}
              expanded={true}
              showSaveButton={false}
              readOnly={true}
              onDataChange={() => {}}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
