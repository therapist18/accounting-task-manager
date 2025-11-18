// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, Loader2, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
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

interface Stage {
  id: string;
  name: string;
  order_num?: number;
  documents?: Array<{ kycId: string }>;
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
  const [selectedDocs, setSelectedDocs] = useState<Record<string, SelectedDoc[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<number | null>(null);

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
      const { error } = await supabase
        .from("tm_tasks")
        .update({
          source_document_id: selectedDocs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.id);

      if (error) throw error;
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
    
    // Use the direct URL from the document's file_path
    // The URL should already be in the format: https://zyszsqgdlrpnunkegipk.supabase.co/storage/v1/object/sign/kyc-documents/...
    const fileUrl = doc.file_path;
    
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
              <div className="space-y-6 py-4">
                {applicableStages.map((stage) => {
                  const stageDocTypes = new Set(stage.documents?.map((d) => d.kycId));
                  const availableDocs = allDocuments
                    .filter(
                      (d) =>
                        d.director_id?.toString() === task.individual_id?.toString() &&
                        stageDocTypes.has(d.document_id)
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
                                    <p>{format(parseISO(doc.created_at), "dd MMM yyyy")}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-slate-500">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="font-medium">No documents found for this stage</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isLoading}>
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