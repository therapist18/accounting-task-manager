"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
  User,
  Globe,
  ArrowLeft,
} from "lucide-react"

interface StepThreeReviewProps {
  data: WizardData
  updateData: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function StepThreeReview({ data, updateData, onNext, onPrev }: StepThreeReviewProps) {
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

  const handleDownloadExcel = () => {
    // Simulate Excel download
    const blob = new Blob(["Application Data Export"], { type: "application/vnd.ms-excel" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "immigration-application.xlsx"
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

  const uploadedDocsCount = data.uploadedDocuments?.filter((doc) => doc.status === "uploaded").length || 0
  const totalDocsCount = data.uploadedDocuments?.length || 0
  const filledFieldsCount = data.webDataFields?.filter((field) => field.value).length || 0
  const totalFieldsCount = data.webDataFields?.length || 0

  return (
    <>
      <div className="space-y-8">
        {/* Application Summary */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-lg font-semibold text-slate-900">Application Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Application Details */}
            <div>
              <h3 className="font-medium mb-3 text-slate-900 flex items-center space-x-2">
                <FileText className="h-4 w-4" />
                <span>Application Details</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <span className="text-slate-600">Subdepartment:</span>
                  <p className="font-medium text-slate-900">
                    {getDisplayValue("subdepartment", data.subdepartment || "")}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-600">Class:</span>
                  <p className="font-medium text-slate-900">{getDisplayValue("class", data.class || "")}</p>
                </div>
                {data.subclass && (
                  <div className="space-y-1">
                    <span className="text-slate-600">Subclass:</span>
                    <p className="font-medium text-slate-900">{data.subclass}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Assigned Officers */}
            <div>
              <h3 className="font-medium mb-3 text-slate-900 flex items-center space-x-2">
                <Users className="h-4 w-4" />
                <span>Assigned Officers</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="space-y-1">
                  <span className="text-slate-600">Officer:</span>
                  <p className="font-medium text-slate-900">{getDisplayValue("officer", data.officer || "")}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-600">Task Manager:</span>
                  <p className="font-medium text-slate-900">{getDisplayValue("taskManager", data.taskManager || "")}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-600">Task Assistant:</span>
                  <p className="font-medium text-slate-900">
                    {getDisplayValue("taskAssistant", data.taskAssistant || "")}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Individual Information */}
            <div>
              <h3 className="font-medium mb-3 text-slate-900 flex items-center space-x-2">
                <User className="h-4 w-4" />
                <span>Applicant Information</span>
              </h3>
              <div className="flex items-center space-x-4">
                <div className="text-sm">
                  <span className="text-slate-600">Individual:</span>
                  <p className="font-medium text-slate-900">
                    {getDisplayValue("selectedIndividual", data.selectedIndividual || "")}
                  </p>
                </div>
                <Badge variant={data.individualType === "principal" ? "default" : "secondary"}>
                  {data.individualType === "principal" ? "Principal" : "Dependent"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Requirements Summary */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-lg font-semibold text-slate-900">Requirements Status</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-900">Documents</p>
                    <p className="text-sm text-green-700">
                      {uploadedDocsCount} of {totalDocsCount} uploaded
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="font-medium text-blue-900">Data Fields</p>
                    <p className="text-sm text-blue-700">
                      {filledFieldsCount} of {totalFieldsCount} completed
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Automation Info */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-lg font-semibold text-slate-900">Automated Processing</CardTitle>
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

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onPrev} size="lg" className="px-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="space-x-3">
            <Button variant="outline" onClick={handleDownloadExcel} size="lg">
              <Download className="h-4 w-4 mr-2" />
              Download
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
              <span>Application Submitted</span>
            </DialogTitle>
            <DialogDescription className="space-y-4">
              <p>Your immigration application has been successfully submitted and is now being processed.</p>
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="font-medium text-slate-900">Application ID: {applicationId}</p>
                <p className="text-sm text-slate-600 mt-1">Please save this ID for future reference.</p>
              </div>
              <Alert>
                <ExternalLink className="h-4 w-4" />
                <AlertDescription>
                  You can track your application status on the eFNS portal using your application ID.
                </AlertDescription>
              </Alert>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleDownloadExcel}>
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
