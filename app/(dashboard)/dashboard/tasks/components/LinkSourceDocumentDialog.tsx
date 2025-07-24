// @ts-nocheck
"use client"
import { useState, useEffect, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, ChevronDown, Plus, Minus, Loader2, Settings, Search, Users, X, TableProperties, RotateCcw, Pencil, AlertTriangle, Send, DownloadCloud, ArrowUpDown, ArrowUp, ArrowDown, Link as LinkIcon, FileArchive, Eye as EyeIcon, FileText } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import ExtractionPreview from "@/components/ExtractionPreview";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface PreviewableDocument extends Document {
    // Add any other properties your preview component might need from the document object
    extracted_details?: Record<string, any>;
    // This will hold the full, accessible URL for the preview
    publicUrl: string;
  }

interface Task {
  id: string;
  applicant_name: string;
  individual_id: string;
  source_document_id?: Record<string, string>;
  created_at: string;
}

interface Stage {
  id: string;
  name: string;
  order_num?: number;
  documents?: Array<{
    kycId: string;
  }>;
}

interface Document {
  id: string;
  document_id: string;
  file_path: string;
  created_at: string;
  director_id: string;
}

interface KycDocument {
  id: string;
  name: string;
  display_name?: string;
}

interface LinkSourceDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
  stages: Stage[];
  allDocuments: Document[];
  kycDocuments: Map<string, KycDocument>;
  onLinkSuccess: () => void;
  isStageApplicableToTask: (stage: Stage, task: Task) => boolean;
  onPreviewDocument: (document: Document) => void; // This prop is no longer needed as we handle preview internally
}

export function LinkSourceDocumentDialog({
  open,
  onOpenChange,
  task,
  stages,
  allDocuments,
  kycDocuments,
  onLinkSuccess,
  isStageApplicableToTask
}: LinkSourceDocumentDialogProps) {
  interface SelectedDoc {
    id: string;
    document_id: string;
  }
  
  const [selectedDocs, setSelectedDocs] = useState<Record<string, SelectedDoc>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);

  useEffect(() => {
    if (task?.source_document_id && typeof task.source_document_id === 'object') {
      // Convert existing data to new format if needed
      const formattedSelections = Object.entries(task.source_document_id).reduce((acc, [stageId, docData]) => {
        if (typeof docData === 'string') {
          // Handle legacy format (just the ID)
          const doc = allDocuments.find(d => d.id === docData);
          if (doc) {
            acc[stageId] = { id: doc.id, document_id: doc.document_id };
          }
        } else if (docData && typeof docData === 'object') {
          // Handle new format with both IDs
          acc[stageId] = docData as SelectedDoc;
        }
        return acc;
      }, {} as Record<string, SelectedDoc>);
      
      setSelectedDocs(formattedSelections);
    } else {
      setSelectedDocs({});
    }
  }, [task, open, allDocuments]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('tm_tasks')
        .update({ 
          source_document_id: selectedDocs, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', task.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Source documents have been linked successfully.",
      });
      onLinkSuccess();
    } catch (error) {
      console.error("Failed to link documents:", error);
      toast({
        title: "Error",
        description: `Failed to link source documents: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const toggleDocSelection = (stageId: string, doc: Document) => {
    setSelectedDocs(prev => {
      const currentSelection = prev[stageId];
      if (currentSelection?.id === doc.id) {
        // If document is already selected, unselect it
        const newSelections = { ...prev };
        delete newSelections[stageId];
        return newSelections;
      } else {
        // Select new document for this stage
        return {
          ...prev,
          [stageId]: {
            id: doc.id,
            document_id: doc.document_id
          }
        };
      }
    });
  };

  const handlePreview = (document: Document) => {
    const kycDoc = kycDocuments.get(document.document_id);
    const docName = kycDoc?.display_name || kycDoc?.name || 'Document';
    const fileName = document.file_path?.split('/').pop() || 'document';
    
    // Create the full file URL with the correct Supabase storage path
    const bucketName = 'kyc-documents';
    
    // Clean up the file path - remove any leading slashes or the bucket name if present
    let cleanPath = document.file_path || '';
    cleanPath = cleanPath.replace(/^[\\/]+/, ''); // Remove leading slashes
    cleanPath = cleanPath.replace(new RegExp(`^${bucketName}[\\/]?`), ''); // Remove bucket name if present
    
    // Construct the full Supabase storage public URL
    const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucketName}/${cleanPath}?t=${Date.now()}`;
    
    // Format the data to match what ExtractionPreview expects
    const previewData = {
      documentId: document.id,
      documentName: docName,
      fileUrl: fileUrl,
      fileName: fileName,
      extractedData: document.extracted_details || {},
      fields: [], // We'll need to get the fields from kycDoc if available
      type: 'document',
      file: {
        name: fileName,
        type: fileName.split('.').pop()?.toLowerCase() || 'pdf',
        url: fileUrl
      }
    };
    
    console.log('Preview data:', JSON.stringify(previewData, null, 2));
    console.log('File URL:', fileUrl); // Log the file URL for debugging
    setPreviewDocument(previewData);
    setIsPreviewDialogOpen(true);
  };

  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);

  const handleClosePreview = () => {
    setPreviewDocument(null);
  };

  const applicableStages = useMemo(() => {
    return stages
      .filter(stage => isStageApplicableToTask(stage, task) && stage.documents?.length > 0)
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  }, [stages, task, isStageApplicableToTask]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Link Source Documents for: {task.applicant_name}</DialogTitle>
            <DialogDescription>
              Select a specific document version for each stage. Only the selected document will be shown in the task view.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-hidden border-t border-b">
            <ScrollArea className="h-full pr-6">
              <div className="space-y-6 py-4">
                {applicableStages.map(stage => {
                  const stageDocTypes = stage.documents.map(d => d.kycId);
                  const availableDocs = allDocuments
                    .filter(d => {
                      // First check if the document belongs to this task's individual
                      if (d.director_id !== task.individual_id) {
                        return false;
                      }
                      // Allow any document of the correct type for this stage
                      return stageDocTypes.includes(d.document_id);
                    })
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                  return (
                    <div key={stage.id} className="p-4 border rounded-lg">
                      <h3 className="font-semibold text-lg text-slate-800 mb-3">{stage.name}</h3>
                      {availableDocs.length > 0 ? (
                        <RadioGroup
                          value={selectedDocs[stage.id]?.id || ''}
                          onValueChange={(docId) => {
                            const selectedDoc = availableDocs.find(doc => doc.id === docId);
                            if (selectedDoc) {
                              setSelectedDocs(prev => ({
                                ...prev,
                                [stage.id]: { id: selectedDoc.id, document_id: selectedDoc.document_id }
                              }));
                            }
                          }}
                        >
                          <div className="space-y-2">
                            {availableDocs.map(doc => {
                              const kycDoc = kycDocuments.get(doc.document_id);
                              const docName = kycDoc?.display_name || kycDoc?.name || 'Document';
                              const fileName = doc.file_path?.split('/').pop() || 'document';
                              
                              return (
                                <div 
                                  key={doc.id}
                                  className={`flex items-center gap-4 p-3 border rounded-md transition-colors hover:bg-slate-50 ${selectedDocs[stage.id]?.id === doc.id ? 'bg-blue-50 border-blue-300' : ''}`}
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <input
                                      type="checkbox"
                                      id={`${stage.id}-${doc.id}`}
                                      checked={selectedDocs[stage.id]?.id === doc.id}
                                      onChange={() => toggleDocSelection(stage.id, doc)}
                                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <FileText className="h-5 w-5 text-slate-600 flex-shrink-0" />
                                    <div className="min-w-0">
                                      <Label 
                                        htmlFor={`${stage.id}-${doc.id}`}
                                        className="font-medium text-slate-900 cursor-pointer block truncate"
                                        title={`View ${docName}`}
                                      >
                                        {docName}
                                      </Label>
                                      <p className="text-xs text-slate-500 truncate" title={fileName}>
                                        {fileName}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-green-600 hover:bg-green-100"
                                      onClick={() => {
                                        setPreviewDocument(doc);
                                        setIsPreviewDialogOpen(true);
                                      }}
                                      title="Preview Document Extraction"
                                    >
                                      <EyeIcon className="h-4 w-4" />
                                    </Button>
                                    <div className="text-xs text-slate-500 text-right">
                                      <p>Uploaded:</p>
                                      <p>{format(parseISO(doc.created_at), 'dd MMM yyyy, HH:mm')}</p>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                            {availableDocs.length === 0 && (
                              <div className="text-center py-4 text-slate-500 text-sm">
                                No document linked for this stage
                              </div>
                            )}
                          </div>
                        </RadioGroup>
                      ) : (
                        <div className="text-center py-4 text-slate-500 text-sm">
                          No documents of the required type found for this applicant.
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Links
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {previewDocument && (
        <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
          <DialogContent className="max-w-7xl w-[95vw] h-[95vh] p-0 flex flex-col">
            <div className="flex flex-col h-full">
              <DialogHeader className="p-6 pb-2">
                <DialogTitle className="text-xl">{previewDocument?.file_path?.split('/').pop() || 'Document'}</DialogTitle>
                <DialogDescription>
                  Review extracted details for {task.applicant_name || 'this document'}
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto p-6 pt-2">
                <ExtractionPreview
                  documentName={previewDocument?.file_path?.split('/').pop() || 'Document'}
                  fileUrl={previewDocument?.file_path}
                  fileName={previewDocument?.file_path?.split('/').pop()}
                  extractedData={previewDocument?.extracted_details || {} }
                  fields={[]}
                  viewMode={true}
                  file={previewDocument}
                  type="document"
                  onDataChange={(fieldName, value) => {
                    console.log(`Field ${fieldName} changed to:`, value);
                  }}
                  onSave={() => {
                    console.log("Saving document data...");
                    setIsPreviewDialogOpen(false);
                    handleClosePreview();
                    toast({ title: "Success", description: "Document details saved." });
                  }}
                  getStylesByType={(type) => ({
                    getBgColor: () => 'bg-primary',
                    getTextColor: () => 'text-primary-foreground',
                    getBorderColor: () => 'border-primary',
                    getButtonStyle: () => 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  })}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
