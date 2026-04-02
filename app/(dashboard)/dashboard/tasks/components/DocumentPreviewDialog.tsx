// @ts-nocheck
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  FileText,
  Info,
  Download,
  Check,
  X,
  AlertTriangle,
  Eye,
  MessageSquare,
  Clock,
  User,
  Calendar,
  CheckCircle,
  XCircle,
  Loader2
} from "lucide-react"
import { toast } from "@/lib/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { format } from "date-fns"

interface DocumentPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: any
  task: any
  onReviewComplete?: (documentId: string, status: 'approved' | 'rejected', comments?: string) => void
  onExtractedDataUpdate?: (documentId: string, updatedData: any) => void
}

export function DocumentPreviewDialog({
  open,
  onOpenChange,
  document,
  task,
  onReviewComplete,
  onExtractedDataUpdate
}: DocumentPreviewDialogProps) {
  const [activeTab, setActiveTab] = useState('preview')
  const [reviewStatus, setReviewStatus] = useState<'pending' | 'approved' | 'rejected'>(document?.status || 'pending')
  const [reviewComments, setReviewComments] = useState('')
  const [extractedData, setExtractedData] = useState<any>(document?.extracted_details || {})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [documentHistory, setDocumentHistory] = useState<any[]>([])
  const [relatedDocuments, setRelatedDocuments] = useState<any[]>([])
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (document && open) {
      setExtractedData(document.extracted_details || {})
      setReviewStatus(document.status || 'pending')
      setReviewComments('')
      setValidationErrors({})
      loadDocumentHistory()
      loadRelatedDocuments()
    }
  }, [document, open])

  const loadDocumentHistory = async () => {
    if (!document?.id) return

    try {
      const { data: history, error } = await supabase
        .from('document_review_history')
        .select(`
          *,
          reviewer:tm_users(name, email)
        `)
        .eq('document_id', document.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setDocumentHistory(history || [])
    } catch (error) {
      console.error('Error loading document history:', error)
    }
  }

  const loadRelatedDocuments = async () => {
    if (!document?.director_id || !task?.id) return

    try {
      const { data: related, error } = await supabase
        .from('acc_portal_directors_documents')
        .select(`
          *,
          acc_portal_kyc (
            id,
            name,
            display_name
          )
        `)
        .eq('director_id', document.director_id)
        .neq('id', document.id)
        .limit(10)

      if (error) throw error
      setRelatedDocuments(related || [])
    } catch (error) {
      console.error('Error loading related documents:', error)
    }
  }

  const validateExtractedData = () => {
    const errors: Record<string, string> = {}

    // Add validation logic based on document type
    if (document?.document_type === 'passport') {
      if (!extractedData.passport_number) {
        errors.passport_number = 'Passport number is required'
      }
      if (!extractedData.full_name) {
        errors.full_name = 'Full name is required'
      }
      if (!extractedData.date_of_birth) {
        errors.date_of_birth = 'Date of birth is required'
      }
    }

    if (document?.document_type === 'id_card') {
      if (!extractedData.id_number) {
        errors.id_number = 'ID number is required'
      }
      if (!extractedData.full_name) {
        errors.full_name = 'Full name is required'
      }
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleFieldChange = (fieldName: string, value: any) => {
    setExtractedData(prev => ({
      ...prev,
      [fieldName]: value
    }))

    // Clear validation error for this field
    if (validationErrors[fieldName]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[fieldName]
        return newErrors
      })
    }
  }

  const handleReviewSubmit = async (status: 'approved' | 'rejected') => {
    if (!document?.id) return

    // Validate extracted data for approval
    if (status === 'approved' && !validateExtractedData()) {
      toast({
        title: 'Validation Error',
        description: 'Please fix all validation errors before approving',
        variant: 'destructive'
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Update document status and extracted data
      const { error: updateError } = await supabase
        .from('acc_portal_directors_documents')
        .update({
          status: status,
          extracted_details: extractedData,
          review_comments: reviewComments,
          reviewed_at: new Date().toISOString(),
          reviewed_by: (await supabase.auth.getUser()).data.user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', document.id)

      if (updateError) throw updateError

      // Add to review history
      const { error: historyError } = await supabase
        .from('document_review_history')
        .insert({
          document_id: document.id,
          task_id: task?.id,
          reviewer_id: (await supabase.auth.getUser()).data.user?.id,
          status: status,
          comments: reviewComments,
          extracted_data_snapshot: extractedData,
          created_at: new Date().toISOString()
        })

      if (historyError) throw historyError

      toast({
        title: 'Success',
        description: `Document ${status} successfully`,
        variant: status === 'approved' ? 'default' : 'destructive'
      })

      // Notify parent component
      onReviewComplete?.(document.id, status, reviewComments)
      onExtractedDataUpdate?.(document.id, extractedData)

      setReviewStatus(status)
      loadDocumentHistory()

    } catch (error) {
      console.error('Error submitting review:', error)
      toast({
        title: 'Error',
        description: 'Failed to submit review',
        variant: 'destructive'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateExtractedData = async () => {
    if (!document?.id || !validateExtractedData()) return

    setIsSubmitting(true)

    try {
      const { error } = await supabase
        .from('acc_portal_directors_documents')
        .update({
          extracted_details: extractedData,
          updated_at: new Date().toISOString()
        })
        .eq('id', document.id)

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Extracted data updated successfully'
      })

      onExtractedDataUpdate?.(document.id, extractedData)

    } catch (error) {
      console.error('Error updating extracted data:', error)
      toast({
        title: 'Error',
        description: 'Failed to update extracted data',
        variant: 'destructive'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800'
      case 'rejected': return 'bg-red-100 text-red-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="h-4 w-4" />
      case 'rejected': return <XCircle className="h-4 w-4" />
      case 'pending': return <Clock className="h-4 w-4" />
      default: return <AlertTriangle className="h-4 w-4" />
    }
  }

  if (!document) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Document Review - {document.acc_portal_kyc?.display_name || document.document_type}
          </DialogTitle>
          <DialogDescription>
            Review and validate document for {task?.applicant_name || task?.principal_member_name || 'Unknown'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          <Badge className={`${getStatusColor(reviewStatus)} flex items-center gap-1`}>
            {getStatusIcon(reviewStatus)}
            {reviewStatus.charAt(0).toUpperCase() + reviewStatus.slice(1)}
          </Badge>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4" />
            Uploaded: {format(new Date(document.created_at), 'PPP')}
          </div>
          {document.reviewed_at && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User className="h-4 w-4" />
              Reviewed: {format(new Date(document.reviewed_at), 'PPP')}
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="extracted-data">Extracted Data</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="related">Related Docs</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Document Preview */}
              <div className="space-y-4">
                <h4 className="font-medium">Document Preview</h4>
                <div className="border rounded-lg p-4 bg-gray-50">
                  {document.file_path ? (
                    <iframe
                      src={`${supabase.storage.from('kyc-documents').getPublicUrl(document.file_path).data.publicUrl}`}
                      className="w-full h-96 border rounded"
                      title="Document Preview"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
                      <FileText className="h-12 w-12 mb-2" />
                      <p>Document preview not available</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => window.open(document.file_path, '_blank')}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Document Metadata */}
              <div className="space-y-4">
                <h4 className="font-medium">Document Information</h4>
                <div className="border rounded-lg p-4 bg-white space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-600">Document Type:</span>
                      <p>{document.acc_portal_kyc?.display_name || document.document_type}</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Status:</span>
                      <Badge className={`${getStatusColor(document.status)} ml-2`}>
                        {document.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Upload Date:</span>
                      <p>{format(new Date(document.created_at), 'PPP')}</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">File Size:</span>
                      <p>{document.file_size ? `${(document.file_size / 1024).toFixed(2)} KB` : 'Unknown'}</p>
                    </div>
                    {document.issue_date && (
                      <div>
                        <span className="font-medium text-gray-600">Issue Date:</span>
                        <p>{document.issue_date}</p>
                      </div>
                    )}
                    {document.expiry_date && (
                      <div>
                        <span className="font-medium text-gray-600">Expiry Date:</span>
                        <p>{document.expiry_date}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="extracted-data" className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Extracted Data</h4>
              <Button
                onClick={handleUpdateExtractedData}
                disabled={isSubmitting || Object.keys(validationErrors).length > 0}
                size="sm"
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Update Data
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(extractedData).map(([key, value]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key} className="capitalize">
                    {key.replace(/_/g, ' ')}
                  </Label>
                  <Textarea
                    id={key}
                    value={String(value || '')}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    className={`min-h-[60px] ${validationErrors[key] ? 'border-red-500' : ''}`}
                    placeholder={`Enter ${key.replace(/_/g, ' ')}`}
                  />
                  {validationErrors[key] && (
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {validationErrors[key]}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {Object.keys(extractedData).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Info className="h-8 w-8 mx-auto mb-2" />
                <p>No extracted data available</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="review" className="space-y-6">
            <div className="space-y-4">
              <h4 className="font-medium">Review Decision</h4>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="review-comments">Review Comments</Label>
                  <Textarea
                    id="review-comments"
                    placeholder="Add your review comments here..."
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                    className="min-h-[100px] mt-2"
                  />
                </div>

                <div className="flex gap-4">
                  <Button
                    onClick={() => handleReviewSubmit('approved')}
                    disabled={isSubmitting || reviewStatus === 'approved'}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    )}
                    Approve Document
                  </Button>

                  <Button
                    variant="destructive"
                    onClick={() => handleReviewSubmit('rejected')}
                    disabled={isSubmitting || reviewStatus === 'rejected'}
                  >
                    {isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="mr-2 h-4 w-4" />
                    )}
                    Reject Document
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <h4 className="font-medium">Review History</h4>

            <div className="space-y-4">
              {documentHistory.length > 0 ? (
                documentHistory.map((entry) => (
                  <div key={entry.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className={getStatusColor(entry.status)}>
                          {getStatusIcon(entry.status)}
                          {entry.status}
                        </Badge>
                        <span className="text-sm text-gray-600">
                          by {entry.reviewer?.name || entry.reviewer?.email || 'Unknown'}
                        </span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {format(new Date(entry.created_at), 'PPP')}
                      </span>
                    </div>
                    {entry.comments && (
                      <p className="text-sm text-gray-700 mt-2">{entry.comments}</p>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2" />
                  <p>No review history available</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="related" className="space-y-4">
            <h4 className="font-medium">Related Documents</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {relatedDocuments.length > 0 ? (
                relatedDocuments.map((doc) => (
                  <div key={doc.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h5 className="font-medium text-sm">
                          {doc.acc_portal_kyc?.display_name || doc.document_type}
                        </h5>
                        <p className="text-xs text-gray-600">
                          {format(new Date(doc.created_at), 'PP')}
                        </p>
                      </div>
                      <Badge className={getStatusColor(doc.status)} size="sm">
                        {doc.status}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => window.open(doc.file_path, '_blank')}
                    >
                      <Eye className="h-3 w-3 mr-2" />
                      View
                    </Button>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2" />
                  <p>No related documents found</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => window.open(document.file_path, '_blank')}
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            {reviewStatus === 'pending' && (
              <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                <Clock className="h-3 w-3 mr-1" />
                Pending Review
              </Badge>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}