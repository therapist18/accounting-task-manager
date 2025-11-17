// @ts-nocheck
"use client"
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, Loader2, FileText, Check } from "lucide-react"; // Assuming Checkbox might need an icon
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
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
  source_document_id?: Record<string, SelectedDoc[]>;
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
  documents?: Array<{ kycId: string; }>;
}

interface Document {
  id: string;
  document_id: string;
  file_path: string;
  created_at: string;
  director_id: string;
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

const isStageApplicableToTask = (stage: any, task: any, departments: any[] = []): boolean => {
  try {
    if (!task || !departments.length) return true;
    const dept = departments.find(d => d?.id === task.department?.id || d?.id === task.department);
    if (!dept) return true;
    const subdept = dept.tm_subdepartments?.find((s: any) => s?.id === task.subdepartment?.id || s?.id === task.subdepartment);
    if (task.subdepartment && !subdept) return false;
    if (!task.subdepartment) {
      const deptStage = dept.stages?.find((s: any) => s.stage_id === stage.id);
      return deptStage ? deptStage.applicable !== false : true;
    }
    const subdeptStage = subdept.stages?.find((s: any) => s.stage_id === stage.id);
    if (subdeptStage && subdeptStage.applicable === false) return false;
    if (task.class_id) {
      const cls = subdept.classes?.find((c: any) => c?.id?.toString() === task.class_id?.toString() || c?.id === task.class_id);
      if (cls) {
        const classStage = cls.stages?.find((s: any) => s.stage_id === stage.id);
        if (classStage && classStage.applicable === false) return false;
      }
    }
    return true;
  } catch (error) {
    console.error('Error in isStageApplicableToTask:', error);
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
  departments = []
}: LinkSourceDocumentDialogProps) {
  // MODIFICATION: State now holds an array of selected documents for each stage ID.
  const [selectedDocs, setSelectedDocs] = useState<Record<string, SelectedDoc[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any | null>(null);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);

  // MODIFICATION: Logic updated to handle and pre-select multiple documents.
  const initialSelectedDocs = useMemo(() => {
    if (!task?.source_document_id || typeof task.source_document_id !== 'object') {
      return {};
    }
    // The structure from the database is assumed to be { stageId: [doc1, doc2], ... }
    return task.source_document_id;
  }, [task?.id, task?.source_document_id]);

  useEffect(() => {
    if (open) {
      setSelectedDocs(initialSelectedDocs);
    }
  }, [initialSelectedDocs, open]);

  const applicableStages = useMemo(() => {
    return stages
      .filter(stage => isStageApplicableToTask(stage, task, departments) && stage.documents?.length > 0)
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  }, [stages, task, departments]);

  // MODIFICATION: handleSave now sends a payload compatible with the new multi-select structure.
  const handleSave = useCallback(async () => {
    setIsLoading(true);
    try {
      // The finalPayload is already in the correct format { stageId: [doc1, doc2], ... }
      const { error } = await supabase
        .from('tm_tasks_duplicate')
        .update({ source_document_id: selectedDocs, updated_at: new Date().toISOString() })
        .eq('id', task.id);

      if (error) throw error;
      toast({ title: "Success", description: "Source documents linked successfully." });
      onLinkSuccess();
    } catch (error) {
      console.error("Failed to link documents:", error);
      toast({ title: "Error", description: `Failed to link source documents: ${error.message}`, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [selectedDocs, task.id, onLinkSuccess]);

  // NEW: Callback to handle checkbox state changes for multi-selection.
  const handleDocSelectionChange = useCallback((stageId: string, doc: Document, isSelected: boolean) => {
    setSelectedDocs(prev => {
      // Ensure currentSelections is always an array
      const currentSelections = Array.isArray(prev[stageId]) ? prev[stageId] : [];
      let newSelections;

      if (isSelected) {
        // Add the document if it's not already selected
        if (!currentSelections.some(d => d && d.id === doc.id)) {
          newSelections = [...currentSelections, { id: doc.id, document_id: doc.document_id }];
        } else {
          newSelections = currentSelections;
        }
      } else {
        // Remove the document
        newSelections = currentSelections.filter(d => d.id !== doc.id);
      }

      return { ...prev, [stageId]: newSelections };
    });
  }, []);

  const fetchKycDocumentData = useCallback(async (kycId: string) => {
    // ... (no changes in this function)
    try {
      const { data, error } = await supabase.from('acc_portal_kyc').select('id, fields, name, display_name, document_type').eq('id', kycId).single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching KYC document:', error);
      return null;
    }
  }, []);

  const handlePreview = useCallback(async (document: Document) => {
    // ... (no changes in this function)
    setIsLoading(true);
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
      const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
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
    } catch (error) {
      console.error('Error in handlePreview:', error);
      toast({ title: 'Error', description: 'Failed to load document preview', variant: 'destructive' });
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
            <DialogDescription>
              Select one or more documents for each stage.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-hidden border-t border-b">
            <ScrollArea className="h-full pr-6">
              <div className="space-y-6 py-4">
                {applicableStages.map(stage => {
                  const stageDocTypes = new Set(stage.documents.map(d => d.kycId));
                  const availableDocs = allDocuments
                    .filter(d => d.director_id === task.individual_id && stageDocTypes.has(d.document_id))
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                  return (
                    <div key={stage.id} className="p-4 border rounded-lg">
                      <h3 className="font-semibold text-lg text-slate-800 mb-3">
                        {stage.name}
                      </h3>
                      {availableDocs.length > 0 ? (
                        // MODIFICATION: Replaced RadioGroup with a div to contain Checkboxes.
                        <div className="space-y-2">
                          {availableDocs.map(doc => {
                            const isSelected = Array.isArray(selectedDocs[stage.id])
                              ? selectedDocs[stage.id].some(d => d.id === doc.id)
                              : false;
                            return (
                              <div
                                key={doc.id}
                                className={`flex items-center gap-4 p-3 border rounded-md transition-colors ${isSelected ? 'bg-blue-50 border-blue-300' : 'hover:bg-slate-50'
                                  }`}
                              >
                                <div className="flex items-center gap-3 flex-1">
                                  {/* MODIFICATION: Replaced RadioGroupItem with a Checkbox. */}
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
                                      {kycDocuments.get(doc.document_id)?.display_name || 'Document'}
                                    </Label>
                                    <p className="text-xs text-slate-500 truncate">
                                      {doc.file_path?.split('/').pop() || 'document'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-8 w-8 text-green-600 hover:bg-green-100"
                                    onClick={() => handlePreview(doc)}
                                    title="Preview Document"
                                    disabled={isLoading}
                                  >
                                    {isLoading && previewDocument?.documentId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                                  </Button>
                                  <div className="text-xs text-slate-500 text-right">
                                    <p>Uploaded:</p>
                                    <p>{format(parseISO(doc.created_at), 'dd MMM yyyy')}</p>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-slate-500">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="font-medium">No documents found</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Links
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The preview dialog remains unchanged */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-7xl w-[95vw] h-[95vh] p-0 flex flex-col">
          {previewDocument ? (
            <div className="flex flex-col h-full">
              <DialogHeader className="p-6 pb-2">
                <DialogTitle className="text-xl flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {previewDocument.documentName}
                </DialogTitle>
                <DialogDescription>
                  Review extracted details for {task.applicant_name || 'this document'}
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
                  onSave={() => { /* Not needed in view mode */ }}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading document preview...</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}