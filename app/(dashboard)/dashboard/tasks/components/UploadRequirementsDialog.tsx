// @ts-nocheck
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Loader2, FileText, Check, AlertTriangle, Eye, Upload } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"

interface UploadRequirementsDialogProps {
  open: boolean
  onClose: () => void
  task: any
  requirements: any[]
  onUploadComplete?: () => void
}

export function UploadRequirementsDialog({
  open,
  onClose,
  task,
  requirements,
  onUploadComplete
}: UploadRequirementsDialogProps) {
  const [loading, setLoading] = useState(true)
  const [documentPreviews, setDocumentPreviews] = useState<Record<string, string>>({})
  const [applicantDocuments, setApplicantDocuments] = useState<any[]>([])
  const [requirementsWithDocuments, setRequirementsWithDocuments] = useState<any[]>([]);
  useEffect(() => {
    if (task && open) {
      loadApplicantDocuments(task).then(() => setLoading(false))
    }
  }, [task, open])
  
  const searchRegistryIndividuals = async (individual: any) => {
    try {
      console.log('Searching registry for individual:', individual)

      let exactMatch = null
      let fuzzyMatches = []

      // First, try exact matches by r_number or passport_number
      if (individual.r_number) {
        const { data: rNumberMatch, error } = await supabase
          .from('registry_individuals')
          .select('*')
          .eq('r_number', individual.r_number)

        if (!error && rNumberMatch && rNumberMatch.length > 0) {
          exactMatch = rNumberMatch[0]
        }
      }

      if (!exactMatch && individual.passport_number) {
        const { data: passportMatch, error } = await supabase
          .from('registry_individuals')
          .select('*')
          .eq('passport_number', individual.passport_number)

        if (!error && passportMatch && passportMatch.length > 0) {
          exactMatch = passportMatch[0]
        }
      }

      // If no exact match, try fuzzy matching on full_name
      if (!exactMatch && individual.full_name) {
        const { data: allIndividuals, error } = await supabase
          .from('registry_individuals')
          .select('*')
          .limit(100)

        if (!error && allIndividuals) {
          // Simple fuzzy matching - you can replace with your fuzzy matching logic
          fuzzyMatches = allIndividuals.filter(person => {
            if (!person.full_name) return false
            return person.full_name.toLowerCase().includes(individual.full_name.toLowerCase()) ||
              individual.full_name.toLowerCase().includes(person.full_name.toLowerCase())
          }).slice(0, 5)
        }
      }

      return {
        exactMatch,
        fuzzyMatches,
        searchCriteria: {
          r_number: individual.r_number,
          passport_number: individual.passport_number,
          full_name: individual.full_name,
          individual_type: individual.individual_type
        }
      }
    } catch (error) {
      console.error('Error searching registry:', error)
      throw new Error(`Registry search failed: ${error.message}`)
    }
  }

  const fetchApplicantDocuments = async (applicantId: number) => {
    try {
      const { data: documents, error } = await supabase
        .from('acc_portal_directors_documents')
        .select(`
          *,
          acc_portal_kyc (
            id,
            name,
            display_name,
            fields
          )
        `)
        .eq('director_id', applicantId)

      if (error) throw error
      return documents || []
    } catch (error) {
      console.error('Error fetching applicant documents:', error)
      return []
    }
  }

// In UploadRequirementsDialog.tsx, update the loadRequirementDocuments function:
const loadRequirementDocuments = async (task: any) => {
  try {
    let requirementData = null;
    
    // Construct the proper class_id format: subdepartment_id_class_id
    let constructedClassId = null;
    
    if (task.subclass_id && task.class_id) {
      // For subclass, we might need a different format or use subclass_id directly
      constructedClassId = task.subclass_id;
    } else if (task.class_id) {
      // Get the subdepartment_id from the task and construct the format
      const subdepartmentId = task.subdepartment?.id || task.subdepartment_id;
      if (subdepartmentId) {
        constructedClassId = `${subdepartmentId}_${task.class_id}`;
      } else {
        constructedClassId = task.class_id;
      }
    }
    
    console.log('Searching for requirements with class_id:', constructedClassId);
    
    if (constructedClassId) {
      const { data, error } = await supabase
        .from('tm_class_requirements')
        .select('*')
        .eq('class_id', constructedClassId)
        .maybeSingle();
      
      if (error) {
        console.error('Database error:', error);
      } else if (data) {
        requirementData = data;
        console.log('Found requirements:', data);
      } else {
        console.log('No requirements found for class_id:', constructedClassId);
      }
    }

    if (requirementData?.requirements) {
      // Map requirements to show document status
      const enrichedRequirements = requirementData.requirements.map(req => ({
        ...req,
        document: null, // Will be set after applicant documents are loaded
        status: 'missing'
      }));
      
      console.log('Enriched requirements:', enrichedRequirements);
      return enrichedRequirements;
    }
    
    return [];
  } catch (error) {
    console.error('Error loading requirement documents:', error);
    return [];
  }
};

  // Update the loadApplicantDocuments function:
  const loadApplicantDocuments = async (task: any) => {
    if (!task.id) return;
  
    try {
      // First, find the individual using registry search
      const individual = {
        full_name: task.applicant_name || task.principal_member_name,
        r_number: task.r_number,
        passport_number: null
      };
  
      const registryMatch = await searchRegistryIndividuals(individual);
      let documents = [];
      
      if (registryMatch.exactMatch) {
        // Fetch documents for this individual
        documents = await fetchApplicantDocuments(registryMatch.exactMatch.id);
        setApplicantDocuments(documents);
      }
  
      // Load requirements from database
      const requirements = await loadRequirementDocuments(task);
      
      // Now match requirements with documents
      const enrichedRequirements = requirements.map(req => {
        const document = documents.find(doc => 
          doc.document_id === req.kycDocumentId || 
          doc.kyc_document_id === req.kycDocumentId
        );
        
        return {
          ...req,
          document,
          status: document ? 'available' : 'missing'
        };
      });
  
      // Store both for rendering
      setRequirementsWithDocuments(enrichedRequirements);
    } catch (error) {
      console.error('Error loading applicant documents:', error);
    }
  };

  // Update the getDocumentForRequirement function:
  const getDocumentForRequirement = (requirement: any) => {
    if (!requirement.kycDocumentId) return null;

    // Find document by kycDocumentId (this maps to document_id in acc_portal_directors_documents)
    return applicantDocuments.find(doc =>
      doc.document_id === requirement.kycDocumentId ||
      doc.kyc_document_id === requirement.kycDocumentId
    );
  };

  // Add new function to get document preview URL:
  const getDocumentPreviewUrl = async (document: any) => {
    try {
      if (documentPreviews[document.id]) {
        return documentPreviews[document.id];
      }

      if (!document.file_path) {
        console.warn('No file path for document:', document);
        return null;
      }

      const { data: fileUrl, error } = await supabase.storage
        .from('kyc-documents')
        .createSignedUrl(document.file_path, 3600);

      if (error) {
        console.error('Error creating signed URL:', error);
        return null;
      }

      setDocumentPreviews(prev => ({
        ...prev,
        [document.id]: fileUrl.signedUrl
      }));

      return fileUrl.signedUrl;
    } catch (error) {
      console.error('Error getting document preview URL:', error);
      return null;
    }
  };

  // Update the handleViewDocument function:
  const handleViewDocument = async (document: any) => {
    const previewUrl = await getDocumentPreviewUrl(document);
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    } else {
      toast({
        title: 'Error',
        description: 'Could not load document preview',
        variant: 'destructive'
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Requirements</DialogTitle>
          <DialogDescription>
            {task?.job_description} - {task?.applicant_name || task?.principal_member_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading applicant documents...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {requirementsWithDocuments.map((req, index) => {
                const document = getDocumentForRequirement(req);

                return (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-full bg-muted">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{req.name}</p>
                            {req.kycDocumentId && (
                              <Badge variant="outline" className="text-xs">
                                <FileText className="h-3 w-3 mr-1" />
                                KYC: {req.kycDocumentId}
                              </Badge>
                            )}
                            {document && (
                              <Badge variant="default" className="text-xs bg-green-100 text-green-800">
                                <Check className="h-3 w-3 mr-1" />
                                Available
                              </Badge>
                            )}
                          </div>
                          {req.description && (
                            <p className="text-sm text-muted-foreground mt-1">{req.description}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {document ? (
                      <div className="space-y-3">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">Document Available</span>
                            <Badge variant={document.status === 'valid' ? 'default' : 'outline'}>
                              {document.status || 'pending'}
                            </Badge>
                          </div>

                          <div className="text-xs space-y-1">
                            <div><span className="font-medium">Uploaded:</span> {new Date(document.created_at).toLocaleDateString()}</div>
                            <div><span className="font-medium">File:</span> {document.file_path?.split('/').pop() || 'Unknown'}</div>
                            {document.issue_date && (
                              <div><span className="font-medium">Issue Date:</span> {document.issue_date}</div>
                            )}
                            {document.expiry_date && (
                              <div><span className="font-medium">Expiry Date:</span> {document.expiry_date}</div>
                            )}
                          </div>

                          {/* Document Preview Thumbnail */}
                          {document.file_path && (
                            <div className="mt-3 border rounded-lg overflow-hidden">
                              <div className="aspect-video bg-gray-100 flex items-center justify-center">
                                <iframe
                                  src={`${supabase.storage.from('kyc-documents').getPublicUrl(document.file_path).data.publicUrl}`}
                                  className="w-full h-full"
                                  title="Document Preview"
                                  style={{ minHeight: '200px' }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Extracted Data Preview */}
                          {document.extracted_details && Object.keys(document.extracted_details).length > 0 && (
                            <div className="mt-2 p-2 bg-white rounded border">
                              <div className="text-xs font-medium mb-1">Extracted Data:</div>
                              <div className="text-xs space-y-1">
                                {Object.entries(document.extracted_details).slice(0, 3).map(([key, value]) => (
                                  <div key={key} className="flex justify-between">
                                    <span className="text-gray-600">{key.replace(/_/g, ' ')}:</span>
                                    <span className="font-medium">{String(value).substring(0, 30)}...</span>
                                  </div>
                                ))}
                                {Object.keys(document.extracted_details).length > 3 && (
                                  <div className="text-gray-500">+{Object.keys(document.extracted_details).length - 3} more fields</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 flex-1"
                            onClick={() => handleViewDocument(document)}
                          >
                            <Eye className="h-4 w-4" />
                            View Full Document
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => {
                              // Handle document replacement
                              console.log('Replace document:', document.id);
                            }}
                          >
                            <Upload className="h-4 w-4" />
                            Replace
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <div className="flex items-center text-yellow-800">
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            <span className="text-sm">Document not found</span>
                          </div>
                          {req.kycDocumentId && (
                            <p className="text-xs text-yellow-700 mt-1">
                              Looking for document type: {req.kycDocumentId}
                            </p>
                          )}
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 w-full"
                          onClick={() => {
                            // Handle document upload
                            console.log('Upload document for requirement:', req.kycDocumentId);
                          }}
                        >
                          <Upload className="h-4 w-4" />
                          Upload Required Document
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {!loading && requirementsWithDocuments.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2" />
              <p>No requirements defined for this class/subclass</p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}