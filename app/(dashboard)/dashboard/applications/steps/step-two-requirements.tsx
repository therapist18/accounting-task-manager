"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import type { WizardData } from "../page"
import { mockRequirements, mockWebDataFields, mockIndividuals } from "../components/supabase"
import {
  FileText,
  CheckCircle,
  AlertCircle,
  Edit2,
  Save,
  X,
  Eye,
  Loader2,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Plus,
  Calendar,
  Clock,
} from "lucide-react"
import DocumentUploadDialog from "../components/document-upload-dialog"
import DocumentPreviewDialog from "../components/document-preview-dialog"
import DocumentSelectionDialog from "../components/document-selection-dialog"
import { cn } from "@/lib/utils"

interface StepTwoRequirementsProps {
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

export default function StepTwoRequirements({ data, updateData, onNext, onPrev }: StepTwoRequirementsProps) {
  const [requirements, setRequirements] = useState<DocumentRequirement[]>([])
  const [webFields, setWebFields] = useState<any[]>([])
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [showSelectionDialog, setShowSelectionDialog] = useState(false)
  const [selectedRequirement, setSelectedRequirement] = useState<DocumentRequirement | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<any>(null)
  const [extractingData, setExtractingData] = useState(false)

  useEffect(() => {
    // Load requirements based on selected class
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

    // Auto-fill web data fields from selected individual
    const selectedPerson = mockIndividuals.find((i) => i.id === data.selectedIndividual)
    const fieldsWithData = mockWebDataFields.map((field) => ({
      ...field,
      value: selectedPerson ? getFieldValue(field.field, selectedPerson) : field.value,
    }))
    setWebFields(fieldsWithData)
  }, [data.class, data.selectedIndividual])

  const getMostRecentDocument = (documents: any[]) => {
    return documents.reduce((latest, current) => {
      const latestDate = new Date(latest.issueDate || latest.uploadedAt)
      const currentDate = new Date(current.issueDate || current.uploadedAt)
      return currentDate > latestDate ? current : latest
    })
  }

  const getFieldValue = (fieldName: string, person: any) => {
    switch (fieldName) {
      case "full_name":
        return person.fullName
      case "date_of_birth":
        return person.dateOfBirth
      case "nationality":
        return person.nationality
      case "passport_number":
        return `P${Math.random().toString().substr(2, 8)}`
      default:
        return ""
    }
  }

  const handleDocumentUpload = async (requirementId: string, file: File) => {
    setExtractingData(true)

    // Simulate Gemini AI extraction
    await new Promise((resolve) => setTimeout(resolve, 3000))

    const mockExtractedData = {
      full_name: "John Doe",
      passport_number: "P12345678",
      date_of_birth: "1990-01-01",
      nationality: "US",
      issue_date: "2020-01-01",
      expiry_date: "2030-01-01",
    }

    const newDocument = {
      id: `uploaded_${Date.now()}`,
      fileName: file.name,
      issueDate: mockExtractedData.issue_date,
      expiryDate: mockExtractedData.expiry_date,
      uploadedAt: new Date().toISOString(),
      extractedData: mockExtractedData,
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

    // Auto-update web fields with extracted data
    setWebFields((prev) =>
      prev.map((field) => {
        const extractedValue = mockExtractedData[field.field as keyof typeof mockExtractedData]
        return extractedValue ? { ...field, value: extractedValue, source: "document_extraction" } : field
      }),
    )

    setExtractingData(false)
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

  const handleEditField = (fieldName: string, currentValue: string) => {
    setEditingField(fieldName)
    setEditValue(currentValue)
  }

  const handleSaveField = (fieldName: string) => {
    setWebFields((prev) => prev.map((field) => (field.field === fieldName ? { ...field, value: editValue } : field)))
    setEditingField(null)
    setEditValue("")
  }

  const handleNext = () => {
    updateData({
      uploadedDocuments: requirements,
      webDataFields: webFields,
    })
    onNext()
  }

  const getRequirementStatus = (req: DocumentRequirement) => {
    const totalDocuments = req.selectedDocuments.length + req.uploadedDocuments.length
    const isComplete = totalDocuments >= req.quantity
    const progress = (totalDocuments / req.quantity) * 100

    return { isComplete, progress, totalDocuments }
  }

  const getSourceBadge = (source: string) => {
    const configs = {
      registry_individuals: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: null },
      passport: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", icon: null },
      document_extraction: {
        bg: "bg-green-50",
        text: "text-green-700",
        border: "border-green-200",
        icon: <Sparkles className="h-3 w-3 mr-1" />,
      },
      manual: { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", icon: null },
    }

    const config = configs[source as keyof typeof configs] || configs.manual

    return (
      <Badge className={`${config.bg} ${config.text} ${config.border} hover:${config.bg}`}>
        {config.icon}
        {source.replace("_", " ")}
      </Badge>
    )
  }

  const allRequiredComplete = requirements
    .filter((req) => req.required)
    .every((req) => getRequirementStatus(req).isComplete)

  const incompleteRequired = requirements.filter((req) => req.required && !getRequirementStatus(req).isComplete)

  return (
    <div className="space-y-8">
      {/* Missing Documents Alert */}
      {incompleteRequired.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>{incompleteRequired.length} required document type(s) incomplete:</strong>{" "}
            {incompleteRequired
              .map((req) => {
                const status = getRequirementStatus(req)
                return `${req.name} (${status.totalDocuments}/${req.quantity})`
              })
              .join(", ")}
          </AlertDescription>
        </Alert>
      )}

      {/* Document Requirements Section */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="text-lg font-semibold text-slate-900">Document Requirements</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-6">
            {requirements.map((req) => {
              const status = getRequirementStatus(req)
              return (
                <div key={req.id} className="border border-slate-200 rounded-lg p-4">
                  {/* Requirement Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="font-medium text-slate-900">{req.name}</h3>
                        {req.required && (
                          <Badge variant="destructive" className="text-xs">
                            Required
                          </Badge>
                        )}
                        {req.needsSelection && (
                          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                            Selection Needed
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mb-3">{req.description}</p>

                      {/* Progress for multi-document requirements */}
                      {req.quantity > 1 && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Progress</span>
                            <span className="font-medium text-slate-900">
                              {status.totalDocuments}/{req.quantity} documents
                            </span>
                          </div>
                          <Progress value={status.progress} className="h-2" />
                        </div>
                      )}
                    </div>

                    <div className="ml-4">
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

                  {/* Existing Documents */}
                  {req.selectedDocuments.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-slate-700 mb-2">Selected Documents</h4>
                      <div className="space-y-2">
                        {req.selectedDocuments.map((doc, index) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3"
                          >
                            <div className="flex items-center space-x-3">
                              <FileText className="h-4 w-4 text-blue-600" />
                              <div>
                                <p className="text-sm font-medium text-blue-900">{doc.fileName}</p>
                                <div className="flex items-center space-x-4 text-xs text-blue-700">
                                  {doc.issueDate && (
                                    <span className="flex items-center space-x-1">
                                      <Calendar className="h-3 w-3" />
                                      <span>Issued: {doc.issueDate}</span>
                                    </span>
                                  )}
                                  <span className="flex items-center space-x-1">
                                    <Clock className="h-3 w-3" />
                                    <span>Added: {new Date(doc.uploadedAt).toLocaleDateString()}</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedDocument(doc)
                                setShowPreviewDialog(true)
                              }}
                              className="h-8"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Preview
                            </Button>
                          </div>
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
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-slate-700 mb-2">Uploaded Documents</h4>
                      <div className="space-y-2">
                        {req.uploadedDocuments.map((doc, index) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3"
                          >
                            <div className="flex items-center space-x-3">
                              <FileText className="h-4 w-4 text-green-600" />
                              <div>
                                <p className="text-sm font-medium text-green-900">{doc.fileName}</p>
                                <div className="flex items-center space-x-4 text-xs text-green-700">
                                  <span className="flex items-center space-x-1">
                                    <Sparkles className="h-3 w-3" />
                                    <span>AI Extracted</span>
                                  </span>
                                  <span className="flex items-center space-x-1">
                                    <Clock className="h-3 w-3" />
                                    <span>Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedDocument(doc)
                                setShowPreviewDialog(true)
                              }}
                              className="h-8"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Preview
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Upload Button */}
                  {status.totalDocuments < req.quantity && (
                    <Button
                      size="sm"
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
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Extraction Loading */}
      {extractingData && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <div>
                <h3 className="font-medium text-blue-900 text-sm">Extracting Document Data</h3>
                <p className="text-xs text-blue-700">Using AI to extract information from your document...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Web Data Fields Section */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="text-lg font-semibold text-slate-900">Application Data</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-medium text-slate-600">Field Name</TableHead>
                  <TableHead className="text-xs font-medium text-slate-600">Value</TableHead>
                  <TableHead className="text-xs font-medium text-slate-600">Source</TableHead>
                  <TableHead className="text-xs font-medium text-slate-600">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webFields.map((field) => (
                  <TableRow key={field.field}>
                    <TableCell className="font-medium text-sm text-slate-900">{field.label}</TableCell>
                    <TableCell>
                      {editingField === field.field ? (
                        <div className="flex items-center space-x-2">
                          <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-8" />
                          <Button size="sm" onClick={() => handleSaveField(field.field)} className="h-8 px-2">
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingField(null)}
                            className="h-8 px-2"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className={cn("text-sm", field.value ? "text-slate-900" : "text-slate-400")}>
                          {field.value || "Not set"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{getSourceBadge(field.source)}</TableCell>
                    <TableCell>
                      {field.editable && editingField !== field.field && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEditField(field.field, field.value)}
                          className="h-8 px-2"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrev} size="lg" className="px-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={handleNext} disabled={!allRequiredComplete} size="lg" className="px-6">
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      {/* Upload Dialog */}
      <DocumentUploadDialog
        open={showUploadDialog}
        onOpenChange={setShowUploadDialog}
        requirement={selectedRequirement}
        onUpload={handleDocumentUpload}
      />

      {/* Preview Dialog */}
      <DocumentPreviewDialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog} document={selectedDocument} />

      {/* Selection Dialog */}
      <DocumentSelectionDialog
        open={showSelectionDialog}
        onOpenChange={setShowSelectionDialog}
        requirement={selectedRequirement}
        onSelect={handleDocumentSelection}
      />
    </div>
  )
}
