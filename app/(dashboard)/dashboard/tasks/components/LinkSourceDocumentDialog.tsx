  // @ts-nocheck
  "use client"
  import { useState, useEffect, useMemo, useCallback } from "react";
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
    const [previewDocument, setPreviewDocument] = useState<any | null>(null);
    const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
    const [kycDocumentData, setKycDocumentData] = useState<Map<string, any>>(new Map());

    // Fetch KYC document data - same as EditableStageCell
    const fetchKycDocumentData = useCallback(async (kycId: string) => {
      try {
        const { data, error } = await supabase
          .from('acc_portal_kyc')
          .select('id, fields, name, display_name, document_type')
          .eq('id', kycId)
          .single();

        if (error) throw error;

        console.log('Fetched KYC document data:', data);
        return data;
      } catch (error) {
        console.error('Error fetching KYC document:', error);
        return null;
      }
    }, []);

    // Function to process extracted data and ensure proper date handling for arrays - same as EditableStageCell
    const processExtractedData = (data: any, fields: any[]): any => {
      if (!data || typeof data !== 'object') return data;

      const result = { ...data };
      
      // Process each field
      fields.forEach(field => {
        const fieldId = field.id || field.fieldName;
        
        // Handle array fields
        if (field.isArray && Array.isArray(result[fieldId])) {
          // Process each item in the array
          result[fieldId] = result[fieldId].map((item: any) => {
            if (field.arrayConfig?.fields) {
              // Recursively process nested fields
              return processExtractedData(item, field.arrayConfig.fields);
            }
            return item;
          });
        } 
        // Handle nested objects
        else if (typeof result[fieldId] === 'object' && result[fieldId] !== null) {
          result[fieldId] = processExtractedData(result[fieldId], field.fields || []);
        }
      });
      
      return result;
    };

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

    const handlePreview = async (document: Document) => {
      console.log('--- handlePreview called ---');
      console.log('Document:', document);

      try {
        setIsLoading(true);

        // Get the KYC document data using the document_id (which should match kycId)
        const kycId = document.document_id;
        if (!kycId) {
          console.log('No KYC ID found in document');
          toast({
            title: 'Error',
            description: 'No KYC document ID found',
            variant: 'destructive',
          });
          return;
        }

        // Fetch KYC document data
        const kycData = await fetchKycDocumentData(kycId);
        if (!kycData) {
          console.log('No KYC data found');
          toast({
            title: 'Error',
            description: 'Could not load document configuration',
            variant: 'destructive',
          });
          return;
        }

        console.log('KYC Data:', kycData);
        console.log('Raw document data:', document);

        // Use KYC document display_name or name, not stage document name
        const documentName = kycData.display_name || kycData.name || 'Document';

        // Format the file path and URL - same as EditableStageCell
        const bucketName = 'kyc-documents';
        const filePath = document.file_path?.startsWith(bucketName)
          ? document.file_path
          : `${bucketName}/${document.file_path}`;

        const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
        const fileName = document.file_path?.split('/').pop() || documentName;
        const fileType = fileName.split('.').pop()?.toLowerCase() || 'pdf';

        // Get KYC fields from the KYC document data
        const kycFields = kycData.fields || [];

        console.log('KYC Fields from KYC document:', kycFields);

        // Transform KYC fields to the expected format - same as EditableStageCell
        const transformKycFields = (fields: any[]): any[] => {
          if (!Array.isArray(fields)) return [];

          return fields.map((field: any) => {
            const isArray = field.type === 'array' || field.isArray === true;

            const transformedField: any = {
              id: field.id || field.fieldName || '',
              fieldName: field.name || field.fieldName || '',
              description: field.description || '',
              isRequired: field.isRequired !== false,
              fieldType: isArray ? 'array' : (field.type || field.fieldType || 'text'),
              parentField: field.parentField,
              isArray: isArray,
              fields: field.fields ? transformKycFields(field.fields) : undefined,
            };

            if (isArray && field.arrayConfig && Array.isArray(field.arrayConfig.fields)) {
              transformedField.arrayConfig = {
                maxItems: field.arrayConfig.maxItems,
                fields: transformKycFields(field.arrayConfig.fields)
              };
            }

            return transformedField;
          });
        };

        // Map KYC fields to the expected format
        const fields = transformKycFields(kycFields).map((field: any) => ({
          id: field.id || field.fieldName,
          name: field.fieldName,
          type: field.fieldType,
          required: field.isRequired,
          description: field.description,
          isArray: field.isArray,
          arrayConfig: field.arrayConfig,
          fields: field.fields || []
        }));

        // Prepare extracted data
        const rawExtractedData = document.extracted_details || {};
        console.log('Raw extracted data from document:', rawExtractedData);

        // Process the extracted data to handle arrays and nested fields
        const processedExtractedData = processExtractedData(rawExtractedData, fields);
        
        // Ensure all fields have values, using empty strings for missing ones
        const extractedData = { ...processedExtractedData };
        fields.forEach((field: any) => {
          if (extractedData[field.id] === undefined) {
            extractedData[field.id] = field.isArray ? [] : '';
          }
        });

        console.log('Processed extracted data:', extractedData);

        const previewData = {
          documentId: document.id,
          documentName: documentName,
          fileUrl,
          fileName,
          extractedData,
          fields,
          type: kycData.document_type || 'document',
          file: {
            name: fileName,
            type: fileType,
            url: fileUrl
          }
        };

        console.log('Final preview data being passed to ExtractionPreview:', previewData);
        console.log('File URL:', fileUrl); // Log the file URL for debugging
        
        setPreviewDocument(previewData);
        setIsPreviewDialogOpen(true);

      } catch (error) {
        console.error('Error in handlePreview:', error);
        toast({
          title: 'Error',
          description: 'Failed to load document preview',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    const handleClosePreview = () => {
      setPreviewDocument(null);
      setIsPreviewDialogOpen(false);
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
                                        onClick={() => handlePreview(doc)}
                                        title="Preview Document Extraction"
                                        disabled={isLoading}
                                      >
                                        {isLoading ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <EyeIcon className="h-4 w-4" />
                                        )}
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
        
        {/* Document Preview Dialog */}
        <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
          <DialogContent className="max-w-7xl w-[95vw] h-[95vh] p-0 flex flex-col">
            {previewDocument ? (
              <div className="flex flex-col h-full">
                <DialogHeader className="p-6 pb-2">
                  <DialogTitle className="text-xl">{previewDocument.documentName}</DialogTitle>
                  <DialogDescription>
                    Review extracted details for {task.applicant_name || 'this document'}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto p-6 pt-2">
                  <ExtractionPreview
                    documentName={previewDocument.documentName}
                    fileUrl={previewDocument.fileUrl}
                    fileName={previewDocument.fileName}
                    extractedData={previewDocument.extractedData || {}}
                    fields={previewDocument.fields || []}
                    viewMode={true}
                    file={previewDocument.file}
                    type={previewDocument.type}
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
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-muted-foreground">Loading document preview...</p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }