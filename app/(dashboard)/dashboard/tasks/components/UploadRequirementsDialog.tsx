// @ts-nocheck
"use client"
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { X, Upload, Check, XCircle, Eye, Download, Trash2 } from "lucide-react"
import { format } from "date-fns"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"

interface UploadRequirementsDialogProps {
  task: any;
  requirements: any[];
  onClose: () => void;
  onUploadComplete?: () => void;
}

export function UploadRequirementsDialog({ task, requirements, onClose, onUploadComplete }: UploadRequirementsDialogProps) {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [documentPreviews, setDocumentPreviews] = useState<Record<string, string>>({});
  const [applicantDocuments, setApplicantDocuments] = useState<Record<number, any[]>>({});

  useEffect(() => {
    if (task) {
      loadApplicantDocuments(task).then(() => setLoading(false));
    }
  }, [task]);

  const getDocumentForRequirement = (requirement: any) => {
    if (!requirement.kycDocumentId) return null;

    const taskDocuments = applicantDocuments[task.id] || [];
    return taskDocuments.find(doc =>
      doc.document_id === requirement.kycDocumentId
    );
  };

  const loadApplicantDocuments = async (task: any) => {
    if (!task.id || applicantDocuments[task.id]) return;

    try {
      // Try to find registry individual first
      const individual = {
        full_name: task.applicant_name || task.principal_member_name,
        r_number: task.r_number,
        passport_number: null
      };

      const registryMatch = await searchRegistryIndividuals(individual);

      if (registryMatch.exactMatch) {
        const documents = await fetchApplicantDocuments(registryMatch.exactMatch.id);
        setApplicantDocuments(prev => ({
          ...prev,
          [task.id]: documents
        }));
      }
    } catch (error) {
      console.error('Error loading applicant documents:', error);
    }
  };

  const searchRegistryIndividuals = async (individual: any) => {
    try {
      let exactMatch = null;
      let fuzzyMatches = [];

      if (individual.r_number) {
        const { data: rNumberMatch, error } = await supabase
          .from('registry_individuals')
          .select('*')
          .eq('r_number', individual.r_number);

        if (!error && rNumberMatch && rNumberMatch.length > 0) {
          exactMatch = rNumberMatch[0];
        }
      }


      return {
        exactMatch,
        fuzzyMatches,
        searchCriteria: individual
      };
    } catch (error) {
      console.error('Error searching registry:', error);
      throw error;
    }
  };

  const fetchApplicantDocuments = async (applicantId: string) => {
    try {
      const { data: documents, error } = await supabase
        .from('kyc_documents')
        .select('*')
        .eq('applicant_id', applicantId);

      if (error) throw error;

      // Get signed URLs for each document
      const documentsWithUrls = await Promise.all(
        documents.map(async (doc) => {
          if (doc.file_path) {
            try {
              const { data } = await supabase.storage
                .from('kyc-documents')
                .createSignedUrl(doc.file_path, 3600);
              
              return {
                ...doc,
                previewUrl: data?.signedUrl
              };
            } catch (urlError) {
              console.error('Error generating signed URL:', urlError);
              return doc;
            }
          }
          return doc;
        })
      );

      return documentsWithUrls;
    } catch (error) {
      console.error('Error fetching applicant documents:', error);
      return [];
    }
  };

  const handleFileUpload = async (file: File, requirement: any) => {
    if (!file || !task) return;

    try {
      setUploading(prev => ({ ...prev, [requirement.id]: true }));
      
      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${task.id}_${requirement.id}_${Date.now()}.${fileExt}`;
      const filePath = `${task.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Save document reference to database
      const { error: dbError } = await supabase
        .from('task_documents')
        .upsert({
          task_id: task.id,
          requirement_id: requirement.id,
          file_path: filePath,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          uploaded_by: 'user-id-here' // Replace with actual user ID
        });

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: `${file.name} uploaded successfully`,
      });

      // Refresh documents
      await loadApplicantDocuments(task);
      onUploadComplete?.();

    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: "Error",
        description: `Failed to upload ${file.name}`,
        variant: "destructive"
      });
    } finally {
      setUploading(prev => ({ ...prev, [requirement.id]: false }));
      setUploadProgress(prev => ({ ...prev, [requirement.id]: 0 }));
    }
  };

  const handlePreviewDocument = (document: any) => {
    if (document.previewUrl) {
      window.open(document.previewUrl, '_blank');
    }
  };

  const handleDownloadDocument = async (document: any) => {
    if (!document.file_path) return;

    try {
      const { data, error } = await supabase.storage
        .from('kyc-documents')
        .download(document.file_path);

      if (error) throw error;

      const url = window.URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = document.file_name || 'document';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading document:', error);
      toast({
        title: "Error",
        description: "Failed to download document",
        variant: "destructive"
      });
    }
  };

  const handleDeleteDocument = async (document: any) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('kyc-documents')
        .remove([document.file_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('kyc_documents')
        .delete()
        .eq('id', document.id);

      if (dbError) throw dbError;

      // Update UI
      setApplicantDocuments(prev => ({
        ...prev,
        [task.id]: (prev[task.id] || []).filter(doc => doc.id !== document.id)
      }));

      toast({
        title: "Success",
        description: "Document deleted successfully",
      });

      onUploadComplete?.();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive"
      });
    }
  };

  if (!task) return null;

  return (
    <Dialog open={!!task} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Required Documents</DialogTitle>
          <DialogDescription>
            Upload the required documents for {task.applicant_name || task.principal_member_name || 'this task'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Task Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Applicant Name</p>
                    <p>{task.applicant_name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Company Name</p>
                    <p>{task.company_name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">R Number</p>
                    <p>{task.r_number || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <Badge variant={task.status === 'completed' ? 'default' : 'outline'}>
                      {task.status || 'Pending'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">Required Documents</h3>
              <div className="space-y-4">
                {requirements.length > 0 ? (
                  requirements.map((requirement) => {
                    const document = getDocumentForRequirement(requirement);
                    const isUploading = uploading[requirement.id];
                    const progress = uploadProgress[requirement.id] || 0;

                    return (
                      <div key={requirement.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">{requirement.name}</h4>
                            {requirement.description && (
                              <p className="text-sm text-muted-foreground">
                                {requirement.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            {document ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700">
                                <Check className="h-4 w-4 mr-1" />
                                Uploaded
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-red-50 text-red-700">
                                <XCircle className="h-4 w-4 mr-1" />
                                Required
                              </Badge>
                            )}
                          </div>
                        </div>

                        {document && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-md">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <FileText className="h-5 w-5 text-gray-500" />
                                <span className="text-sm font-medium">
                                  {document.file_name || 'Document'}
                                </span>
                              </div>
                              <div className="flex space-x-2">
                                {document.previewUrl && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2"
                                    onClick={() => handlePreviewDocument(document)}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    View
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2"
                                  onClick={() => handleDownloadDocument(document)}
                                >
                                  <Download className="h-4 w-4 mr-1" />
                                  Download
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-red-600 hover:text-red-700"
                                  onClick={() => handleDeleteDocument(document)}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Remove
                                </Button>
                              </div>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              Uploaded on {format(new Date(document.created_at), 'MMM d, yyyy')}
                            </div>
                          </div>
                        )}

                        {!document && (
                          <div className="mt-3">
                            <div className="flex items-center space-x-2">
                              <label
                                htmlFor={`file-upload-${requirement.id}`}
                                className="cursor-pointer inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                              >
                                <Upload className="h-4 w-4 mr-1" />
                                Upload File
                                <input
                                  id={`file-upload-${requirement.id}`}
                                  name={`file-upload-${requirement.id}`}
                                  type="file"
                                  className="sr-only"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleFileUpload(file, requirement);
                                    }
                                  }}
                                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                                  disabled={isUploading}
                                />
                              </label>
                              {isUploading && (
                                <span className="text-sm text-muted-foreground">
                                  Uploading...
                                </span>
                              )}
                            </div>
                            {isUploading && (
                              <div className="mt-2">
                                <Progress value={progress} className="h-2" />
                                <p className="text-xs text-muted-foreground mt-1">
                                  {Math.round(progress)}% complete
                                </p>
                              </div>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">
                              Accepted file types: PDF, DOC, DOCX, XLS, XLSX, JPG, JPEG, PNG
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No document requirements found for this task.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
