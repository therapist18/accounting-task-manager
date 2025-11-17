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
  created_at: string;
  director_id: number;
  extracted_details?: Record<string, any>;
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
  console.log('[Props] Component rendering or re-rendering. Task prop:', JSON.parse(JSON.stringify(task)));
  const [selectedDocs, setSelectedDocs] = useState<Record<string, SelectedDoc[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any | null>(null);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  // Replace the existing allDocuments useEffect with this one
  useEffect(() => {
    if (open) {  // Only log when the dialog is open
      console.log('[LinkSourceDocumentDialog] Dialog opened with task:', {
        taskId: task?.id,
        individualId: task?.individual_id,
        task: JSON.parse(JSON.stringify(task || {}))
      });

      console.log('[LinkSourceDocumentDialog] All documents received:', allDocuments);

      if (task?.individual_id) {
        const individualDocs = allDocuments.filter(doc =>
          doc.director_id.toString() === task.individual_id.toString()
        );
        console.log(`[LinkSourceDocumentDialog] Documents for individual ${task.individual_id}:`, individualDocs);
      }
    }
  }, [allDocuments, task, open]);  // Added 'open' and 'task' to dependencies
  useEffect(() => {
    console.log('[State Update] The selectedDocs state has been updated to:', JSON.parse(JSON.stringify(selectedDocs)));
  }, [selectedDocs]);

const initialSelectedDocs = useMemo(() => {
  const normalized: Record<string, SelectedDoc[]> = {};

  if (task?.source_document_id && typeof task.source_document_id === "object") {
    Object.entries(task.source_document_id).forEach(([stageId, docs]) => {
      const stageDocs = Array.isArray(docs) ? docs : [docs];
      normalized[stageId] = stageDocs
        .filter((d): d is SelectedDoc => {
          if (!d) return false;
          const doc = allDocuments.find(doc => 
            doc.id.toString() === d.id.toString()
          );
          return !!doc;
        })
        .map(d => ({
          id: d.id.toString(),
          document_id: d.document_id
        }));
    });
  }

  console.log('[InitialSelectedDocs] Normalized selected docs:', JSON.parse(JSON.stringify(normalized)));
  return normalized;
}, [task?.source_document_id, allDocuments]); 

  useEffect(() => {
    if (open) {
      console.log('[Effect Init] Setting state with initial docs:', JSON.parse(JSON.stringify(initialSelectedDocs)));
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
      toast({
        title: "Success",
        description: "Source documents linked successfully.",
      });
      onLinkSuccess();
    } catch (error: any) {
      console.error("Failed to link documents:", error);
      toast({
        title: "Error",
        description: `Failed to link source documents: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedDocs, task.id, onLinkSuccess]);

  const handleDocSelectionChange = useCallback(
    (stageId: string, doc: Document, isSelected: boolean) => {
      console.log(`[Interaction] Checkbox changed for Stage ${stageId}, Doc ${doc.id}. New state: ${isSelected}`);
      setSelectedDocs((prev) => {
        const currentSelections = Array.isArray(prev[stageId])
          ? [...prev[stageId]]
          : [];

        if (isSelected) {
          if (!currentSelections.some((d) => d && d.id.toString() === doc.id.toString())) {
            currentSelections.push({
              id: doc.id.toString(),
              document_id: doc.document_id
            });
          }
        } else {
          const index = currentSelections.findIndex((d) => d.id.toString() === doc.id.toString());
          if (index !== -1) {
            currentSelections.splice(index, 1);
          }
        }

        return {
          ...prev,
          [stageId]: currentSelections
        };
      });
    },
    []
  );
  const fetchKycDocumentData = useCallback(async (kycId: string) => {
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

  const handlePreview = useCallback(async (document: Document) => {
    setIsLoading(true);
    setPreviewDocument({ documentId: document.id }); // Show loader for this specific item
    try {
      const kycId = document.document_id;
      if (!kycId) {
        toast({ title: 'Error', description: 'No KYC document ID found', variant: 'destructive' });
        return;
      }
      const kycData = await fetchKycDocumentData(kycId);
      if (!kycData) {
        toast({ title: 'Error', description: 'Could not load document configuration', variant: 'destructive' });
        return;
      }
      const documentName = kycData.display_name || kycData.name || 'Document';
      const bucketName = 'kyc-documents';
      const filePath = document.file_path?.startsWith(bucketName) ? document.file_path : `${bucketName}/${document.file_path}`;
      const { data: fileData, error: fileError } = await supabase.storage.from(bucketName).createSignedUrl(document.file_path, 3600);
      if (fileError || !fileData) {
        throw new Error("Failed to get document URL");
      }
      const fileUrl = fileData.signedUrl;
      const fileName = document.file_path?.split('/').pop() || documentName;
      const fileType = fileName.split('.').pop()?.toLowerCase() || 'pdf';

      const transformKycFields = (fields: any[]): any[] => {
        if (!Array.isArray(fields)) return [];
        return fields.map((field: any) => ({
          id: field.id || field.fieldName || '',
          fieldName: field.name || field.fieldName || '',
          description: field.description || '',
          isRequired: field.isRequired !== false,
          fieldType: field.type === 'array' || field.isArray ? 'array' : (field.type || field.fieldType || 'text'),
          parentField: field.parentField,
          isArray: field.type === 'array' || field.isArray,
          fields: field.fields ? transformKycFields(field.fields) : undefined,
          ...(field.type === 'array' && field.arrayConfig && { arrayConfig: { maxItems: field.arrayConfig.maxItems, fields: transformKycFields(field.arrayConfig.fields) } })
        }));
      };
      const fields = transformKycFields(kycData.fields || []);
      const extractedData = { ...(document.extracted_details || {}) };
      fields.forEach(field => { if (extractedData[field.id] === undefined) extractedData[field.id] = field.isArray ? [] : ''; });

      setPreviewDocument({
        documentId: document.id, documentName, fileUrl, fileName, extractedData, fields,
        type: kycData.document_type || 'document',
        file: { name: fileName, type: fileType, url: fileUrl }
      });
      setIsPreviewDialogOpen(true);
    } catch (error: any) {
      console.error('Error in handlePreview:', error);
      toast({ title: 'Error', description: `Failed to load document preview: ${error.message}`, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [fetchKycDocumentData]);


  const handleClosePreview = () => {
    setPreviewDocument(null);
    setIsPreviewDialogOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Link Source Documents for: {task?.applicant_name}</DialogTitle>
            <DialogDescription>Select one or more documents for each stage.</DialogDescription>
          </DialogHeader>

          <div className="flex-grow overflow-hidden border-t border-b">
            <ScrollArea className="h-full pr-6">
              <div className="space-y-6 py-4">
                {applicableStages.map((stage) => {
                  const stageDocTypes = new Set(stage.documents.map((d) => d.kycId));
                  const availableDocs = allDocuments
                    .filter(
                      (d) =>
                        d.director_id === task.individual_id &&
                        stageDocTypes.has(d.document_id)
                    )
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                  // --- FINAL DIAGNOSTIC LOG ---
                  console.groupCollapsed(`[Render] Rendering Stage: "${stage.name}" (ID: ${stage.id})`);
                  console.log(`[Render] Found ${availableDocs.length} documents to display for this stage.`);
                  console.log(`[Render] Document List:`, availableDocs.map(d => ({ name: d.file_path.split("/").pop(), id: d.id })));
                  console.groupEnd();
                  // --- END FINAL LOG ---

                  return (
                    <div key={stage.id} className="p-4 border rounded-lg">
                      <h3 className="font-semibold text-lg text-slate-800 mb-3">{stage.name}</h3>
                      {availableDocs.length > 0 ? (
                        <div className="space-y-2">
                   {availableDocs.map((doc) => {
  const selectionsForThisStage = selectedDocs[stage.id] || [];
  const isSelected = selectionsForThisStage.some(
    (d) => d && d.id.toString() === doc.id.toString()
  );
  
  console.log(`[Render] Document ${doc.id} (${doc.file_path}) - Selected: ${isSelected}`, {
    docId: doc.id,
    docIdType: typeof doc.id,
    selections: selectionsForThisStage,
    stageId: stage.id
  });

  return (
    <div
      key={doc.id}
      className={`flex items-center gap-4 p-3 border rounded-md transition-colors ${
        isSelected ? "bg-blue-50 border-blue-300" : "hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center gap-3 flex-1">
        <Checkbox
          id={`${stage.id}-${doc.id}`}
          checked={isSelected}
          onCheckedChange={(checked) => {
            handleDocSelectionChange(stage.id, doc, !!checked);
          }}
        />
                                  <div className="min-w-0">
                                    <Label
                                      htmlFor={`${stage.id}-${doc.id}`}
                                      className="font-medium text-slate-900 block truncate cursor-pointer"
                                    >
                                      {kycDocuments.get(doc.document_id)
                                        ?.display_name || "Document"}
                                    </Label>
                                    <p className="text-xs text-slate-500 truncate">
                                      {doc.file_path?.split("/").pop() ||
                                        "document"}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-green-600 hover:bg-green-100"
                                    onClick={() => handlePreview(doc)}
                                    title="Preview Document"
                                    disabled={isLoading}
                                  >
                                    {isLoading &&
                                      previewDocument?.documentId === doc.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Eye className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <div className="text-xs text-slate-500 text-right">
                                    <p>Uploaded:</p>
                                    <p>
                                      {format(
                                        parseISO(doc.created_at),
                                        "dd MMM yyyy"
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-slate-500">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="font-medium">No documents found</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Links
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The preview dialog */}
      <Dialog
        open={isPreviewDialogOpen}
        onOpenChange={setIsPreviewDialogOpen}
      >
        <DialogContent className="max-w-7xl w-[95vw] h-[95vh] p-0 flex flex-col">
          {previewDocument?.fileUrl ? (
            <div className="flex flex-col h-full">
              <DialogHeader className="p-6 pb-2">
                <DialogTitle className="text-xl flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {previewDocument.documentName}
                </DialogTitle>
                <DialogDescription>
                  Review extracted details for {task.applicant_name ||
                    "this document"}
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-hidden p-6 pt-2">
                <ExtractionPreview
                  documentId={previewDocument.documentId}
                  documentName={previewDocument.documentName}
                  fileUrl={previewDocument.fileUrl}
                  fileName={previewDocument.fileName}
                  extractedData={previewDocument.extractedData || {}}
                  fields={previewDocument.fields || []}
                  viewMode={true}
                  file={previewDocument.file}
                  type={previewDocument.type}
                  onClose={handleClosePreview}
                  onSave={() => {
                    /* Not needed in view mode */
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Loading document preview...
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}