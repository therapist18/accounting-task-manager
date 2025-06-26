"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import type { WizardData } from "../page"
import { mockSubdepartments, mockOfficers, mockIndividuals } from "../components/supabase"
import {
  CheckCircle,
  Download,
  Send,
  Loader2,
  ExternalLink,
  FileText,
  Users,
  Globe,
  ArrowLeft,
  AlertTriangle,
  Info,
  Building,
  UserCheck,
} from "lucide-react"

interface StepFiveProps {
  data: WizardData
  updateData: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function StepFiveReviewApply({ data, updateData, onPrev }: StepFiveProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [applicationId, setApplicationId] = useState("")
  const [automationStatus, setAutomationStatus] = useState<string[]>([])

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setAutomationStatus([])

    // Simulate submission process with automation steps
    const steps = [
      "Validating application data...",
      "Generating application forms...",
      "Connecting to eFNS portal...",
      "Submitting to external systems...",
      "Processing confirmation...",
      "Application submitted successfully!",
    ]

    for (let i = 0; i < steps.length; i++) {
      setAutomationStatus((prev) => [...prev, steps[i]])
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    const newApplicationId = `APP-${Date.now()}`
    setApplicationId(newApplicationId)
    updateData({ applicationId: newApplicationId, submissionStatus: "submitted" })
    setIsSubmitting(false)
    setShowSuccessDialog(true)
  }

  const handleDownloadSummary = () => {
    // Simulate download
    const blob = new Blob(["Application Summary Export"], { type: "application/pdf" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `immigration-application-summary-${Date.now()}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getDisplayValue = (key: string, value: string) => {
    switch (key) {
      case "subdepartment":
        return mockSubdepartments.find((d) => d.id === value)?.name || value
      case "class":
        const dept = mockSubdepartments.find((d) => d.id === data.subdepartment)
        return dept?.classes.find((c) => c.id === value)?.name || value
      case "officer":
      case "taskManager":
      case "taskAssistant":
        return mockOfficers.find((o) => o.id === value)?.name || value
      case "selectedIndividual":
        return mockIndividuals.find((i) => i.id === value)?.fullName || value
      default:
        return value
    }
  }

  // Calculate completion statistics
  const uploadedDocsCount =
    data.uploadedDocuments?.reduce((count, req) => {
      return count + (req.selectedDocuments?.length || 0) + (req.uploadedDocuments?.length || 0)
    }, 0) || 0

  const totalRequiredDocs =
    data.uploadedDocuments?.reduce((count, req) => {
      return count + (req.required ? req.quantity : 0)
    }, 0) || 0

  const filledFieldsCount = data.webDataFields?.filter((field) => field.value && field.value.trim() !== "").length || 0
  const totalFieldsCount = data.webDataFields?.length || 0

  const selectedPerson = mockIndividuals.find((i) => i.id === data.selectedIndividual)

  const incompleteRequirements =
    data.uploadedDocuments?.filter((req) => {
      const totalDocs = (req.selectedDocuments?.length || 0) + (req.uploadedDocuments?.length || 0)
      return req.required && totalDocs < req.quantity
    }) || []

  const missingFields = data.webDataFields?.filter((field) => !field.value || field.value.trim() === "") || []

  return (
    <>
      <div className="space-y-8">
        <div className="text-center mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Review &amp; Apply</h2>
          <p className="text-gray-600">Review your application details and submit</p>
        </div>

        {/* Application Readiness Status */}
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="bg-blue-100 border-b border-blue-200">
            <CardTitle className="flex items-center space-x-2 text-lg text-blue-900">
              <CheckCircle className="h-5 w-5" />
              <span>Application Readiness</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-blue-900">Documents</span>
                  <span className="text-sm text-blue-700">
                    {uploadedDocsCount} uploaded ({totalRequiredDocs} required)
                  </span>
                </div>
                <Progress
                  value={totalRequiredDocs > 0 ? (uploadedDocsCount / totalRequiredDocs) * 100 : 100}
                  className="h-2"
                />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-blue-900">Data Fields</span>
                  <span className="text-sm text-blue-700">
                    {filledFieldsCount}/{totalFieldsCount} completed
                  </span>
                </div>
                <Progress
                  value={totalFieldsCount > 0 ? (filledFieldsCount / totalFieldsCount) * 100 : 100}
                  className="h-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Warnings for incomplete items */}
        {(incompleteRequirements.length > 0 || missingFields.length > 0) && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <div className="space-y-2">
                <p>
                  <strong>Your application can be submitted, but some items are incomplete:</strong>
                </p>
                {incompleteRequirements.length > 0 && (
                  <p>
                    • <strong>Missing Documents:</strong> {incompleteRequirements.map((req) => req.name).join(", ")}
                  </p>
                )}
                {missingFields.length > 0 && (
                  <p>
                    • <strong>Missing Data:</strong> {missingFields.map((field) => field.label).join(", ")}
                  </p>
                )}
                <p className="text-sm">You may be asked to provide additional information later.</p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Application Summary */}
        <Card>
          <CardHeader className="bg-gray-50 border-b">
            <CardTitle className="flex items-center space-x-2 text-lg">
              <FileText className="h-5 w-5 text-blue-600" />
              <span>Application Summary</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Application Details */}
            <div>
              <h3 className="font-medium mb-3 text-gray-900 flex items-center space-x-2">
                <Building className="h-4 w-4" />
                <span>Application Details</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <span className="text-gray-600">Subdepartment:</span>
                  <p className="font-medium text-gray-900">
                    {getDisplayValue("subdepartment", data.subdepartment || "")}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-600">Class:</span>
                  <p className="font-medium text-gray-900">{getDisplayValue("class", data.class || "")}</p>
                </div>
                {data.subclass && (
                  <div className="space-y-1">
                    <span className="text-gray-600">Subclass:</span>
                    <p className="font-medium text-gray-900">{data.subclass}</p>
                  </div>
                )}
                {data.batchId && (
                  <div className="space-y-1">
                    <span className="text-gray-600">Batch ID:</span>
                    <p className="font-medium text-gray-900">{data.batchId}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Assigned Officers */}
            <div>
              <h3 className="font-medium mb-3 text-gray-900 flex items-center space-x-2">
                <Users className="h-4 w-4" />
                <span>Assigned Officers</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="space-y-1">
                  <span className="text-gray-600">Officer:</span>
                  <p className="font-medium text-gray-900">{getDisplayValue("officer", data.officer || "")}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-600">Task Manager:</span>
                  <p className="font-medium text-gray-900">{getDisplayValue("taskManager", data.taskManager || "")}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-600">Task Assistant:</span>
                  <p className="font-medium text-gray-900">
                    {getDisplayValue("taskAssistant", data.taskAssistant || "")}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Applicant Information */}
            <div>
              <h3 className="font-medium mb-3 text-gray-900 flex items-center space-x-2">
                <UserCheck className="h-4 w-4" />
                <span>Applicant Information</span>
              </h3>
              <div className="flex items-center space-x-4">
                <div className="text-sm">
                  <span className="text-gray-600">Individual:</span>
                  <p className="font-medium text-gray-900">
                    {getDisplayValue("selectedIndividual", data.selectedIndividual || "")}
                  </p>
                </div>
                <Badge variant={data.individualType === "principal" ? "default" : "secondary"}>
                  {data.individualType === "principal" ? "Principal" : "Dependent"}
                </Badge>
              </div>
              {selectedPerson && (
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm text-gray-600">
                  <div>ID: {selectedPerson.id}</div>
                  <div>DOB: {selectedPerson.dateOfBirth}</div>
                  <div>Nationality: {selectedPerson.nationality}</div>
                </div>
              )}
            </div>

            {/* Additional Information */}
            {(data.accountUsed || data.appliedBy) && (
              <>
                <Separator />
                <div>
                  <h3 className="font-medium mb-3 text-gray-900 flex items-center space-x-2">
                    <Info className="h-4 w-4" />
                    <span>Additional Information</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    {data.accountUsed && (
                      <div className="space-y-1">
                        <span className="text-gray-600">Account Used:</span>
                        <p className="font-medium text-gray-900">{data.accountUsed}</p>
                      </div>
                    )}
                    {data.appliedBy && (
                      <div className="space-y-1">
                        <span className="text-gray-600">Applied By:</span>
                        <p className="font-medium text-gray-900">{data.appliedBy}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Automation Info */}
        <Card>
          <CardHeader className="bg-gray-50 border-b">
            <CardTitle className="flex items-center space-x-2 text-lg">
              <Globe className="h-5 w-5 text-blue-600" />
              <span>Automated Processing</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <Alert>
              <Globe className="h-4 w-4" />
              <AlertDescription>
                Upon submission, this application will be automatically processed and submitted to external systems
                including eFNS Portal, Immigration Database, and Document Management systems.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Submission Status */}
        {isSubmitting && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-6">
              <div className="flex items-start space-x-3">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600 mt-1" />
                <div className="flex-1">
                  <h3 className="font-medium text-blue-900 mb-2">Processing Application</h3>
                  <div className="space-y-1">
                    {automationStatus.map((status, index) => (
                      <div key={index} className="flex items-center space-x-2 text-sm">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        <span className="text-blue-700">{status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-between pt-6">
          <Button variant="outline" onClick={onPrev} size="lg" className="px-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="space-x-3">
            <Button variant="outline" onClick={handleDownloadSummary} size="lg">
              <Download className="h-4 w-4 mr-2" />
              Download Summary
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} size="lg" className="px-6">
              <Send className="h-4 w-4 mr-2" />
              {isSubmitting ? "Submitting..." : "Submit Application"}
            </Button>
          </div>
        </div>
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span>Application Submitted Successfully!</span>
            </DialogTitle>
            <DialogDescription className="space-y-4">
              <p>Your immigration application has been successfully submitted and is now being processed.</p>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium text-gray-900">Application ID: {applicationId}</p>
                <p className="text-sm text-gray-600 mt-1">Please save this ID for future reference.</p>
              </div>
              <Alert>
                <ExternalLink className="h-4 w-4" />
                <AlertDescription>
                  You can track your application status on the eFNS portal using your application ID.
                </AlertDescription>
              </Alert>
              <div className="space-y-2 text-sm">
                <h4 className="font-medium">Next Steps:</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  <li>Your application will be reviewed by the assigned officers</li>
                  <li>You will receive email notifications for status updates</li>
                  <li>Additional documents may be requested if needed</li>
                  <li>Processing time is typically 2-4 weeks</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleDownloadSummary}>
              <Download className="h-4 w-4 mr-2" />
              Download Summary
            </Button>
            <Button onClick={() => setShowSuccessDialog(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
