"use client"

import { useState } from "react"
import { Progress } from "@/components/ui/progress"
import { CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import StepTwoIndividualSelection from "./steps/step-two-individual-selection"
import StepThreeUploadRequirements from "./steps/step-three-upload-requirements"
import StepFourWebDataFields from "./steps/step-four-web-data-fields"
import StepFiveReviewApply from "./steps/step-five-review-apply"
import StepOneApplicationDetails from "./steps/step-one-application-details"

const steps = [
  {
    id: 1,
    title: "Application Details",
    description: "Select application type and assign officers",
  },
  {
    id: 2,
    title: "Individual Selection",
    description: "Choose applicant from registry",
  },
  {
    id: 3,
    title: "Upload Requirements",
    description: "Upload required documents",
  },
  {
    id: 4,
    title: "Web Data Fields",
    description: "Review and complete application data",
  },
  {
    id: 5,
    title: "Review & Apply",
    description: "Final review and submission",
  },
]

export interface WizardData {
  // Step 1
  subdepartment?: string
  class?: string
  subclass?: string
  officer?: string
  taskManager?: string
  taskAssistant?: string
  accountUsed?: string
  appliedBy?: string
  batchId?: string

  // Step 2
  individualType?: "principal" | "dependent"
  selectedIndividual?: string

  // Step 3
  uploadedDocuments?: any[]

  // Step 4
  webDataFields?: any[]

  // Step 5
  applicationId?: string
  submissionStatus?: string
}

export default function ImmigrationWizard() {
  const [currentStep, setCurrentStep] = useState(1)
  const [wizardData, setWizardData] = useState<WizardData>({})
  const [completedSteps, setCompletedSteps] = useState<number[]>([])

  const updateWizardData = (stepData: Partial<WizardData>) => {
    setWizardData((prev) => ({ ...prev, ...stepData }))
  }

  const markStepComplete = (step: number) => {
    if (!completedSteps.includes(step)) {
      setCompletedSteps((prev) => [...prev, step])
    }
  }

  const nextStep = () => {
    markStepComplete(currentStep)
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const goToStep = (step: number) => {
    if (step <= currentStep || completedSteps.includes(step - 1)) {
      setCurrentStep(step)
    }
  }

  const renderStep = () => {
    const stepProps = {
      data: wizardData,
      updateData: updateWizardData,
      onNext: nextStep,
      onPrev: prevStep,
    }

    switch (currentStep) {
      case 1:
        return <StepOneApplicationDetails {...stepProps} />
      case 2:
        return <StepTwoIndividualSelection {...stepProps} />
      case 3:
        return <StepThreeUploadRequirements {...stepProps} />
      case 4:
        return <StepFourWebDataFields {...stepProps} />
      case 5:
        return <StepFiveReviewApply {...stepProps} />
      default:
        return <StepOneApplicationDetails {...stepProps} />
    }
  }

  const progress = (currentStep / steps.length) * 100

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Immigration Application Portal</h1>
            <p className="text-gray-600">Submit your immigration application online</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            {steps.map((step, index) => (
              <div key={step.id} className="flex flex-col items-center flex-1">
                <div className="flex items-center w-full">
                  <button
                    onClick={() => goToStep(step.id)}
                    disabled={step.id > currentStep && !completedSteps.includes(step.id - 1)}
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-medium transition-all duration-200",
                      currentStep === step.id
                        ? "bg-blue-600 border-blue-600 text-white"
                        : completedSteps.includes(step.id)
                          ? "bg-green-600 border-green-600 text-white"
                          : step.id < currentStep
                            ? "bg-gray-300 border-gray-300 text-gray-600 cursor-pointer hover:bg-gray-400"
                            : "bg-white border-gray-300 text-gray-400 cursor-not-allowed",
                    )}
                  >
                    {completedSteps.includes(step.id) ? <CheckCircle className="h-4 w-4" /> : <span>{step.id}</span>}
                  </button>
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        "flex-1 h-0.5 mx-3 transition-all duration-200",
                        completedSteps.includes(step.id) || currentStep > step.id
                          ? "bg-green-600"
                          : currentStep === step.id
                            ? "bg-blue-600"
                            : "bg-gray-200",
                      )}
                    />
                  )}
                </div>
                <div className="mt-3 text-center max-w-32">
                  <p className={cn("text-xs font-medium", currentStep === step.id ? "text-blue-600" : "text-gray-600")}>
                    {step.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">Overall Progress</span>
              <span className="text-sm font-medium text-gray-700">{Math.round(progress)}% Complete</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-8">{renderStep()}</div>
        </div>
      </div>
    </div>
  )
}
