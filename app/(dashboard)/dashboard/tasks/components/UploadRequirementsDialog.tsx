// @ts-nocheck
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { 
  Loader2, 
  FileText, 
  Check, 
  AlertTriangle, 
  Eye, 
  Upload, 
  X,
  Plus,
  PlayCircle,
  CheckCircle,
  ExternalLink,
  Download
} from "lucide-react"
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
  const [requirementsWithDocuments, setRequirementsWithDocuments] = useState<any[]>([])
  const [selectedDocuments, setSelectedDocuments] = useState<Record<string, any[]>>({})
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewRequirement, setPreviewRequirement] = useState<any>(null)

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
        const matchingDocs = documents.filter(doc => 
          doc.document_id === req.kycDocumentId || 
          doc.kyc_document_id === req.kycDocumentId
        );
        
        return {
          ...req,
          documents: matchingDocs,
          status: matchingDocs.length > 0 ? 'available' : 'missing'
        };
      });

      // Store both for rendering
      setRequirementsWithDocuments(enrichedRequirements);
    } catch (error) {
      console.error('Error loading applicant documents:', error);
    }
  };

  // Add missing helper functions
  const getDocumentForRequirement = (requirement: any) => {
    if (!requirement.kycDocumentId) return [];
    
    // Return all documents matching this requirement type
    return applicantDocuments.filter(doc =>
      doc.document_id === requirement.kycDocumentId ||
      doc.kyc_document_id === requirement.kycDocumentId
    );
  }

  const handleDocumentSelection = (requirementId: string, document: any, checked: boolean) => {
    setSelectedDocuments(prev => {
      const current = prev[requirementId] || []
      if (checked) {
        return {
          ...prev,
          [requirementId]: [...current, document]
        }
      } else {
        return {
          ...prev,
          [requirementId]: current.filter(doc => doc.id !== document.id)
        }
      }
    })
  }

  const handlePreviewDocuments = (requirement: any) => {
    setPreviewRequirement(requirement)
    setPreviewDialogOpen(true)
  }

  const getRequiredDocumentCount = (requirement: any) => {
    // Check if requirement specifies a count, default to 1
    return requirement.requiredCount || 1
  }

  const getRequirementStatus = (requirement: any) => {
    const availableDocs = getDocumentForRequirement(requirement)
    const selectedDocs = selectedDocuments[requirement.id] || []
    const requiredCount = getRequiredDocumentCount(requirement)

    if (availableDocs.length === 0) {
      return { status: 'missing', message: 'No documents found', color: 'red' }
    }

    if (selectedDocs.length === 0) {
      return { status: 'available', message: `${availableDocs.length} available - Select documents`, color: 'blue' }
    }

    if (selectedDocs.length < requiredCount) {
      return { status: 'partial', message: `${selectedDocs.length}/${requiredCount} selected - Need more`, color: 'yellow' }
    }

    if (selectedDocs.length === requiredCount) {
      return { status: 'complete', message: `${selectedDocs.length}/${requiredCount} selected - Complete`, color: 'green' }
    }

    return { status: 'excess', message: `${selectedDocs.length}/${requiredCount} selected - Too many`, color: 'orange' }
  }

// In UploadRequirementsDialog.tsx, update the triggerFormAutomation function:

const triggerFormAutomation = async (requirement: any) => {
  if (!requirement.automationId) {
    toast({
      title: "No Automation Configured",
      description: "This requirement doesn't have an automation configured.",
      variant: "destructive"
    })
    return
  }

  try {
    // Fetch the automation details
    const { data: automation, error } = await supabase
      .from('tm_automations')
      .select('*')
      .eq('id', requirement.automationId)
      .single()

    if (error) throw error

    if (!automation.is_active) {
      toast({
        title: "Automation Inactive",
        description: "The linked automation is currently inactive.",
        variant: "destructive"
      })
      return
    }

    // Prepare the payload for the webhook
    const payload = {
      requirementId: requirement.id,
      requirementName: requirement.name,
      formName: requirement.webFormName,
      taskId: task?.id,
      applicantName: task?.applicant_name || task?.principal_member_name,
      rNumber: task?.r_number,
      timestamp: new Date().toISOString(),
      // Add any other relevant task data
      taskData: {
        jobDescription: task?.job_description,
        departmentId: task?.department?.id,
        subdepartmentId: task?.subdepartment?.id,
        classId: task?.class_id,
        subclassId: task?.subclass_id
      }
    }

    // Show loading state
    toast({
      title: "Triggering Automation",
      description: `Starting ${automation.name} for ${requirement.name}...`,
    })

    // Call the webhook
    const webhookResponse = await fetch(automation.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TaskManager-Automation/1.0'
      },
      body: JSON.stringify(payload)
    })

    if (!webhookResponse.ok) {
      throw new Error(`Webhook failed with status: ${webhookResponse.status}`)
    }

    const result = await webhookResponse.json()

    // Log the automation trigger
    await supabase
      .from('tm_automation_logs')
      .insert({
        automation_id: automation.id,
        requirement_id: requirement.id,
        task_id: task?.id,
        payload: payload,
        response: result,
        status: 'success',
        triggered_at: new Date().toISOString()
      })

    toast({
      title: "Automation Triggered Successfully",
      description: `${automation.name} has been started for ${requirement.name}`,
      variant: "default"
    })

  } catch (error) {
    console.error('Error triggering automation:', error)

    // Log the error
    await supabase
      .from('tm_automation_logs')
      .insert({
        automation_id: requirement.automationId,
        requirement_id: requirement.id,
        task_id: task?.id,
        payload: { error: error.message },
        status: 'error',
        triggered_at: new Date().toISOString()
      })

    toast({
      title: "Automation Failed",
      description: `Failed to trigger automation: ${error.message}`,
      variant: "destructive"
    })
  }
}

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
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-7xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-xl">Upload Requirements</DialogTitle>
            <DialogDescription className="text-base">
              {task?.job_description} - {task?.applicant_name || task?.principal_member_name}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mr-3" />
              <span className="text-lg">Loading applicant documents...</span>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <div className="h-full overflow-y-auto pr-4">
                <div className="space-y-4">
                  {requirementsWithDocuments.map((req, index) => {
                    const availableDocs = getDocumentForRequirement(req)
                    const selectedDocs = selectedDocuments[req.id] || []
                    const status = getRequirementStatus(req)
                    const requiredCount = getRequiredDocumentCount(req)

                    return (
                      <Card key={index} className="border-2 hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 rounded-lg bg-blue-50">
                                  <FileText className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                  <CardTitle className="text-lg font-semibold">{req.name}</CardTitle>
                                  {req.description && (
                                    <p className="text-sm text-muted-foreground mt-1">{req.description}</p>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2 flex-wrap">
                                {req.kycDocumentId && (
                                  <Badge variant="outline" className="text-xs">
                                    <FileText className="h-3 w-3 mr-1" />
                                    KYC: {req.kycDocumentId}
                                  </Badge>
                                )}
                                
                                {req.isRequired && (
                                  <Badge variant="destructive" className="text-xs">
                                    Required
                                  </Badge>
                                )}

                                <Badge 
                                  variant={status.color === 'green' ? 'default' : 'secondary'}
                                  className={`text-xs ${
                                    status.color === 'red' ? 'bg-red-100 text-red-800' :
                                    status.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                                    status.color === 'blue' ? 'bg-blue-100 text-blue-800' :
                                    status.color === 'green' ? 'bg-green-100 text-green-800' :
                                    'bg-orange-100 text-orange-800'
                                  }`}
                                >
                                  {status.message}
                                </Badge>

                                {requiredCount > 1 && (
                                  <Badge variant="outline" className="text-xs">
                                    Requires {requiredCount} documents
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="pt-0">
                          <div className="flex items-center gap-3 mb-4">
                            {/* Upload Button */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-2"
                              onClick={() => {
                                console.log('Upload document for requirement:', req.kycDocumentId)
                                // Handle document upload
                              }}
                            >
                              <Upload className="h-4 w-4" />
                              Upload
                            </Button>

                            {/* Preview Button */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-2"
                              onClick={() => handlePreviewDocuments(req)}
                              disabled={availableDocs.length === 0}
                            >
                              <Eye className="h-4 w-4" />
                              Preview ({availableDocs.length})
                            </Button>

                            {/* Form Automation Button */}
                            {req.hasWebForm && req.automationId && (
  <Button
    variant="outline"
    size="sm"
    className="flex items-center gap-2"
    onClick={() => triggerFormAutomation(req)}
  >
    <PlayCircle className="h-4 w-4" />
    Trigger {req.webFormName || 'Form'} Automation
  </Button>
)}

                            {/* Status Indicator */}
                            {status.status === 'complete' && (
                              <div className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="h-4 w-4" />
                                <span className="text-sm font-medium">Complete</span>
                              </div>
                            )}
                          </div>

                          {/* Document Selection Area */}
                          {availableDocs.length > 0 && (
                            <div className="bg-gray-50 rounded-lg p-4">
                              <h4 className="text-sm font-medium mb-3">
                                Available Documents ({availableDocs.length})
                                {requiredCount > 1 && ` - Select ${requiredCount}`}
                              </h4>
                              
                              <div className="space-y-2 max-h-32 overflow-y-auto">
                                {availableDocs.map((doc, docIndex) => {
                                  const isSelected = selectedDocs.some(selected => selected.id === doc.id)
                                  
                                  return (
                                    <div key={docIndex} className="flex items-center space-x-3 p-2 bg-white rounded border">
                                      <Checkbox
                                        id={`${req.id}-${doc.id}`}
                                        checked={isSelected}
                                        onCheckedChange={(checked) => 
                                          handleDocumentSelection(req.id, doc, checked as boolean)
                                        }
                                        disabled={!isSelected && selectedDocs.length >= requiredCount}
                                      />
                                      
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <p className="text-sm font-medium truncate">
                                            {doc.file_path?.split('/').pop() || 'Unknown file'}
                                          </p>
                                          <Badge variant="outline" className="text-xs">
                                            {doc.status || 'pending'}
                                          </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                          Uploaded: {new Date(doc.created_at).toLocaleDateString()}
                                        </p>
                                      </div>
                                      
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => handleViewDocument(doc)}
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )
                                })}
                              </div>
                              
                              {/* Selection Summary */}
                              {selectedDocs.length > 0 && (
                                <div className="mt-3 pt-3 border-t">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">
                                      Selected: {selectedDocs.length} / {requiredCount}
                                    </span>
                                    {selectedDocs.length !== requiredCount && (
                                      <span className={`font-medium ${
                                        selectedDocs.length < requiredCount ? 'text-yellow-600' : 'text-orange-600'
                                      }`}>
                                        {selectedDocs.length < requiredCount 
                                          ? `Need ${requiredCount - selectedDocs.length} more`
                                          : `${selectedDocs.length - requiredCount} too many`
                                        }
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* No Documents Available */}
                          {availableDocs.length === 0 && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                              <div className="flex items-center text-yellow-800">
                                <AlertTriangle className="h-5 w-5 mr-2" />
                                <div>
                                  <p className="text-sm font-medium">No documents found</p>
                                  <p className="text-xs text-yellow-700 mt-1">
                                    Looking for document type: {req.kycDocumentId}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}

                  {requirementsWithDocuments.length === 0 && (
                    <Card>
                      <CardContent className="text-center py-12">
                        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium mb-2">No Requirements Found</h3>
                        <p className="text-muted-foreground">
                          No requirements are defined for this class/subclass
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          )}

          <Separator className="my-4" />
          
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {requirementsWithDocuments.length > 0 && (
                <span>
                  {requirementsWithDocuments.filter(req => getRequirementStatus(req).status === 'complete').length} / {requirementsWithDocuments.length} requirements completed
                </span>
              )}
            </div>
            
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button 
                onClick={() => {
                  // Handle save/submit logic
                  console.log('Selected documents:', selectedDocuments)
                  onUploadComplete?.()
                }}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Save Selections
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[1800px] max-h-[95vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="text-xl">
              {previewRequirement?.name} - Documents ({getDocumentForRequirement(previewRequirement || {}).length})
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {getDocumentForRequirement(previewRequirement || {}).map((doc, index) => (
                <Card key={index} className="border shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-0">
                    <div className="h-[600px] w-full bg-gray-50 flex items-center justify-center overflow-hidden">
                      {doc.file_path && (
                        <iframe
                          src={`${supabase.storage.from('kyc-documents').getPublicUrl(doc.file_path).data.publicUrl}`}
                          className="w-full h-full border-0"
                          title={`Document ${index + 1}`}
                        />
                      )}
                    </div>
                    
                    <div className="p-4 border-t">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium truncate max-w-[70%]">
                          {doc.file_path?.split('/').pop() || 'Unknown file'}
                        </p>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            doc.status === 'valid' ? 'bg-green-50 text-green-700' :
                            doc.status === 'pending' ? 'bg-yellow-50 text-yellow-700' :
                            'bg-red-50 text-red-700'
                          }`}
                        >
                          {doc.status || 'pending'}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground mb-4">
                        <div>
                          <p className="text-xs text-gray-500">Uploaded</p>
                          <p>{new Date(doc.created_at).toLocaleDateString()}</p>
                        </div>
                        {doc.issue_date && (
                          <div>
                            <p className="text-xs text-gray-500">Issue Date</p>
                            <p>{doc.issue_date}</p>
                          </div>
                        )}
                        {doc.expiry_date && (
                          <div className="col-span-2">
                            <p className="text-xs text-gray-500">Expiry Date</p>
                            <p className={new Date(doc.expiry_date) < new Date() ? 'text-red-600 font-medium' : ''}>
                              {doc.expiry_date}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => handleViewDocument(doc)}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open Full View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            const url = supabase.storage.from('kyc-documents').getPublicUrl(doc.file_path).data.publicUrl;
                            window.open(url, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}