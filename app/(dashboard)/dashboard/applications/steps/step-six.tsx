"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { WizardData } from "../page"
import { mockSubdepartments, mockOfficers, mockIndividuals } from "../components/supabase"
import { CheckCircle, Download, Send } from "lucide-react"

interface StepSixProps {
  data: WizardData
  updateData: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function StepSix({ data, updateData, onNext, onPrev }: StepSixProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [applicationId, setApplicationId] = useState("")

  const handleSubmit = async () => {
    setIsSubmitting(true)

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const newApplicationId = `APP-${Date.now()}`
    setApplicationId(newApplicationId)
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
      <Card>
        <CardHeader>
          <CardTitle>Step 6: Review & Submit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Application Details */}
          <div>
            <h3 className="font-semibold mb-3">Application Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Subdepartment:</span>{" "}
                {getDisplayValue("subdepartment", data.subdepartment || "")}
              </div>
              <div>
                <span className="font-medium">Class:</span> {getDisplayValue("class", data.class || "")}
              </div>
              {data.subclass && (
                <div>
                  <span className="font-medium">Subclass:</span> {data.subclass}
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Assigned Officers */}
          <div>
            <h3 className="font-semibold mb-3">Assigned Officers</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="font-medium">Officer:</span> {getDisplayValue("officer", data.officer || "")}
              </div>
              <div>
                <span className="font-medium">Task Manager:</span>{" "}
                {getDisplayValue("taskManager", data.taskManager || "")}
              </div>
              <div>
                <span className="font-medium">Task Assistant:</span>{" "}
                {getDisplayValue("taskAssistant", data.taskAssistant || "")}
              </div>
            </div>
          </div>

          <Separator />

          {/* Metadata */}
          {(data.appliedBy || data.batch || data.accountUsed || data.referenceNumber) && (
            <>
              <div>
                <h3 className="font-semibold mb-3">Additional Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {data.appliedBy && (
                    <div>
                      <span className="font-medium">Applied By:</span> {data.appliedBy}
                    </div>
                  )}
                  {data.batch && (
                    <div>
                      <span className="font-medium">Batch:</span> {data.batch}
                    </div>
                  )}
                  {data.accountUsed && (
                    <div>
                      <span className="font-medium">Account Used:</span> {data.accountUsed}
                    </div>
                  )}
                  {data.referenceNumber && (
                    <div>
                      <span className="font-medium">Reference Number:</span> {data.referenceNumber}
                    </div>
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Individual Information */}
          <div>
            <h3 className="font-semibold mb-3">Applicant Information</h3>
            <div className="flex items-center space-x-4">
              <div className="text-sm">
                <span className="font-medium">Individual:</span>{" "}
                {getDisplayValue("selectedIndividual", data.selectedIndividual || "")}
              </div>
              <Badge variant={data.individualType === "principal" ? "default" : "secondary"}>
                {data.individualType === "principal" ? "Principal" : "Dependent"}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Requirements Summary */}
          <div>
            <h3 className="font-semibold mb-3">Requirements Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-green-50 border-green-200">
                <CardContent className="pt-4">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-900">Documents</p>
                      <p className="text-sm text-green-700">
                        {uploadedDocsCount} of {totalDocsCount} uploaded
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-4">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-medium text-blue-900">Data Fields</p>
                      <p className="text-sm text-blue-700">
                        {filledFieldsCount} of {totalFieldsCount} completed
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={onPrev}>
              Previous
            </Button>
            <div className="space-x-2">
              <Button variant="outline" onClick={handleDownloadExcel}>
                <Download className="h-4 w-4 mr-2" />
                Download Excel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                <Send className="h-4 w-4 mr-2" />
                {isSubmitting ? "Submitting..." : "Submit Application"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <span>Application Submitted Successfully!</span>
            </DialogTitle>
            <DialogDescription className="space-y-4">
              <p>Your immigration application has been submitted and is now being processed.</p>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium">Application ID: {applicationId}</p>
                <p className="text-sm text-gray-600 mt-1">Please save this ID for future reference.</p>
              </div>
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
          <div className="flex justify-end">
            <Button onClick={() => setShowSuccessDialog(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
