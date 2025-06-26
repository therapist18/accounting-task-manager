"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { WizardData } from "../page"
import { mockRequirements } from "../components/supabase"
import {
  FileText,
  CheckCircle,
  AlertCircle,
  Eye,
  Plus,
  Calendar,
  Clock,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  ChevronDown,
  Sparkles,
} from "lucide-react"
import DocumentUploadDialog from "../components/document-upload-dialog"
import DocumentPreviewDialog from "../components/document-preview-dialog"
import DocumentSelectionDialog from "../components/document-selection-dialog"
import { cn } from "@/lib/utils"


interface StepThreeProps {
  data: WizardData
  updateData: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrev: () => void
}

interface DocumentRequirement {
  id: string
  name: string
  required: boolean
  description: string
  quantity: number
  existingDocuments: any[]
  selectedDocuments: any[]
  uploadedDocuments: any[]
  needsSelection: boolean
}

export default function StepThreeUploadRequirements({ data, updateData, onNext, onPrev }: StepThreeProps) {
  const [requirements, setRequirements] = useState<DocumentRequirement[]>([])
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [showSelectionDialog, setShowSelectionDialog] = useState(false)
  const [selectedRequirement, setSelectedRequirement] = useState<DocumentRequirement | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<any>(null)

  useEffect(() => {
    const baseRequirements = mockRequirements[data.class as keyof typeof mockRequirements] || []

    const processedRequirements = baseRequirements.map((req) => {
      const selectedDocuments =
        req.quantity === 1 && req.existingDocuments.length > 1
          ? [getMostRecentDocument(req.existingDocuments)]
          : req.existingDocuments.slice(0, req.quantity)

      return {
        ...req,
        selectedDocuments,
        uploadedDocuments: [],
        needsSelection: req.quantity === 1 && req.existingDocuments.length > 1,
      }
    })

    setRequirements(processedRequirements)
  }, [data.class])

  const getMostRecentDocument = (documents: any[]) => {
    return documents.reduce((latest, current) => {
      const latestDate = new Date(latest.issueDate || latest.uploadedAt)
      const currentDate = new Date(current.issueDate || current.uploadedAt)
      return currentDate > latestDate ? current : latest
    })
  }

  const handleDocumentUpload = async (requirementId: string, file: File) => {
    // Simulate upload and AI extraction
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const newDocument = {
      id: `uploaded_${Date.now()}`,
      fileName: file.name,
      issueDate: "2024-01-01",
      uploadedAt: new Date().toISOString(),
      extractedData: {
        full_name: "John Doe",
        passport_number: "P12345678",
        date_of_birth: "1990-01-01",
      },
      file: file,
    }

    setRequirements((prev) =>
      prev.map((req) =>
        req.id === requirementId
          ? {
              ...req,
              uploadedDocuments: [...req.uploadedDocuments, newDocument],
            }
          : req,
      ),
    )

    setShowUploadDialog(false)
  }

  const handleDocumentSelection = (requirementId: string, selectedDocs: any[]) => {
    setRequirements((prev) =>
      prev.map((req) =>
        req.id === requirementId
          ? {
              ...req,
              selectedDocuments: selectedDocs,
              needsSelection: false,
            }
          : req,
      ),
    )
    setShowSelectionDialog(false)
  }

  const handleNext = () => {
    updateData({
      uploadedDocuments: requirements,
    })
    onNext()
  }

  const getRequirementStatus = (req: DocumentRequirement) => {
    const totalDocuments = req.selectedDocuments.length + req.uploadedDocuments.length
    const isComplete = totalDocuments >= req.quantity
    const progress = (totalDocuments / req.quantity) * 100

    return { isComplete, progress, totalDocuments }
  }

  const allRequiredComplete = requirements
    .filter((req) => req.required)
    .every((req) => getRequirementStatus(req).isComplete)

  const incompleteRequired = requirements.filter((req) => req.required && !getRequirementStatus(req).isComplete)

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Upload Requirements</h2>
        <p className="text-gray-600">Upload required documents for your application</p>
      </div>

      {/* Missing Documents Alert */}
      {incompleteRequired.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>{incompleteRequired.length} required document type(s) incomplete.</strong> Please upload all
            required documents to continue.
          </AlertDescription>
        </Alert>
      )}

      {/* Requirements List */}
      <div className="space-y-4">
        {requirements.map((req) => {
          const status = getRequirementStatus(req)
          return (
            <Card key={req.id} className="border border-gray-200">
              <CardHeader className="bg-gray-50 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center space-x-3 text-base">
                    <FileText className="h-5 w-5 text-blue-600" />
                    <span>{req.name}</span>
                    {req.required && (
                      <Badge variant="destructive" className="text-xs">
                        Required
                      </Badge>
                    )}
                    {req.needsSelection && (
                      <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">Selection Needed</Badge>
                    )}
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    {status.isComplete ? (
                      <Badge className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Complete
                      </Badge>
                    ) : (
                      <Badge className="bg-red-50 text-red-700 border-red-200">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Incomplete
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">{req.description}</p>

                  {/* Progress for multi-document requirements */}
                  {req.quantity > 1 && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Progress</span>
                        <span className="font-medium text-gray-900">
                          {status.totalDocuments}/{req.quantity} documents
                        </span>
                      </div>
                      <Progress value={status.progress} className="h-2" />
                    </div>
                  )}

                  {/* Document Lists */}
                  <div className="space-y-4">
                    {/* Selected Documents */}
                    {req.selectedDocuments.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Documents</h4>
                        <div className="space-y-2">
                          {req.selectedDocuments.map((doc) => (
                            <DocumentCard
                              key={doc.id}
                              document={doc}
                              type="selected"
                              onPreview={() => {
                                setSelectedDocument(doc)
                                setShowPreviewDialog(true)
                              }}
                            />
                          ))}
                        </div>
                        {req.needsSelection && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedRequirement(req)
                              setShowSelectionDialog(true)
                            }}
                            className="mt-2"
                          >
                            Change Selection
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Uploaded Documents */}
                    {req.uploadedDocuments.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Uploaded Documents</h4>
                        <div className="space-y-2">
                          {req.uploadedDocuments.map((doc) => (
                            <DocumentCard
                              key={doc.id}
                              document={doc}
                              type="uploaded"
                              onPreview={() => {
                                setSelectedDocument(doc)
                                setShowPreviewDialog(true)
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Upload Button */}
                  {status.totalDocuments < req.quantity && (
                    <Button
                      variant={req.required ? "default" : "outline"}
                      onClick={() => {
                        setSelectedRequirement(req)
                        setShowUploadDialog(true)
                      }}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Upload {req.quantity > 1 ? `Additional ${req.name}` : req.name}
                      {req.quantity > 1 && (
                        <span className="ml-2 text-xs">({req.quantity - status.totalDocuments} more needed)</span>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex justify-between pt-6">
        <Button variant="outline" onClick={onPrev} size="lg" className="px-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={handleNext} size="lg" className="px-8">
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      {/* Dialogs */}
      <DocumentUploadDialog
        open={showUploadDialog}
        onOpenChange={setShowUploadDialog}
        requirement={selectedRequirement}
        onUpload={handleDocumentUpload}
      />

      <DocumentPreviewDialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog} document={selectedDocument} />

      <DocumentSelectionDialog
        open={showSelectionDialog}
        onOpenChange={setShowSelectionDialog}
        requirement={selectedRequirement}
        onSelect={handleDocumentSelection}
      />
    </div>
  )
}

// Document Card Component
function DocumentCard({
  document,
  type,
  onPreview,
}: {
  document: any
  type: "selected" | "uploaded"
  onPreview: () => void
}) {
  const [showExtracted, setShowExtracted] = useState(false)

  const bgColor = type === "selected" ? "bg-blue-50 border-blue-200" : "bg-green-50 border-green-200"
  const textColor = type === "selected" ? "text-blue-900" : "text-green-900"
  const iconColor = type === "selected" ? "text-blue-600" : "text-green-600"

  return (
    <div className={cn("border rounded-lg p-3", bgColor)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <FileText className={cn("h-4 w-4", iconColor)} />
          <div>
            <p className={cn("text-sm font-medium", textColor)}>{document.fileName}</p>
            <div className="flex items-center space-x-4 text-xs text-gray-600">
              {document.issueDate && (
                <span className="flex items-center space-x-1">
                  <Calendar className="h-3 w-3" />
                  <span>Issued: {document.issueDate}</span>
                </span>
              )}
              <span className="flex items-center space-x-1">
                <Clock className="h-3 w-3" />
                <span>Added: {new Date(document.uploadedAt).toLocaleDateString()}</span>
              </span>
              {type === "uploaded" && (
                <span className="flex items-center space-x-1">
                  <Sparkles className="h-3 w-3" />
                  <span>AI Extracted</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {document.extractedData && (
            <Collapsible open={showExtracted} onOpenChange={setShowExtracted}>
              <CollapsibleTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 px-2">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Data
                  <ChevronDown className={cn("h-3 w-3 ml-1 transition-transform", showExtracted && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          )}
          <Button size="sm" variant="outline" onClick={onPreview} className="h-8">
            <Eye className="h-3 w-3 mr-1" />
            Preview
          </Button>
        </div>
      </div>
      {document.extractedData && (
        <Collapsible open={showExtracted} onOpenChange={setShowExtracted}>
          <CollapsibleContent className="mt-3 pt-3 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(document.extractedData).map(([key, value]) => (
                <div key={key}>
                  <span className="text-gray-600 capitalize">{key.replace("_", " ")}:</span>
                  <span className="ml-1 font-medium">{value as string}</span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
