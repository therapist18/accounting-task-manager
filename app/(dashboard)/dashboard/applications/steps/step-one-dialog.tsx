// @ts-nocheck
"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import type { WizardData } from "../page"
import { mockSubdepartments, mockOfficers, mockIndividuals } from "../components/supabase"
import { User, ArrowRight } from "lucide-react"

interface StepOneDialogProps {
  data: WizardData
  updateData: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function StepOneDialog({ data, updateData, onNext }: StepOneDialogProps) {
  // Application Details
  const [selectedSubdepartment, setSelectedSubdepartment] = useState(data.subdepartment || "")
  const [selectedClass, setSelectedClass] = useState(data.class || "")
  const [selectedSubclass, setSelectedSubclass] = useState(data.subclass || "")

  // Officers
  const [officer, setOfficer] = useState(data.officer || "")
  const [taskManager, setTaskManager] = useState(data.taskManager || "")
  const [taskAssistant, setTaskAssistant] = useState(data.taskAssistant || "")

  // Metadata
  const [appliedBy, setAppliedBy] = useState(data.appliedBy || "")
  const [batch, setBatch] = useState(data.batch || "")
  const [accountUsed, setAccountUsed] = useState(data.accountUsed || "")
  const [referenceNumber, setReferenceNumber] = useState(data.referenceNumber || "")

  // Individual
  const [individualType, setIndividualType] = useState<"principal" | "dependent">(data.individualType || "principal")
  const [selectedIndividual, setSelectedIndividual] = useState(data.selectedIndividual || "")

  const [availableClasses, setAvailableClasses] = useState<any[]>([])
  const [availableSubclasses, setAvailableSubclasses] = useState<any[]>([])

  useEffect(() => {
    if (selectedSubdepartment) {
      const dept = mockSubdepartments.find((d) => d.id === selectedSubdepartment)
      setAvailableClasses(dept?.classes || [])
      setSelectedClass("")
      setSelectedSubclass("")
    }
  }, [selectedSubdepartment])

  useEffect(() => {
    if (selectedClass) {
      const dept = mockSubdepartments.find((d) => d.id === selectedSubdepartment)
      const cls = dept?.classes.find((c) => c.id === selectedClass)
      setAvailableSubclasses(cls?.subclasses || [])
      setSelectedSubclass("")
    }
  }, [selectedClass, selectedSubdepartment])

  const handleNext = () => {
    updateData({
      subdepartment: selectedSubdepartment,
      class: selectedClass,
      subclass: selectedSubclass,
      officer,
      taskManager,
      taskAssistant,
      appliedBy,
      batch,
      accountUsed,
      referenceNumber,
      individualType,
      selectedIndividual,
    })
    onNext()
  }

  const officers = mockOfficers.filter((o) => o.role === "officer")
  const taskManagers = mockOfficers.filter((o) => o.role === "task_manager")
  const taskAssistants = mockOfficers.filter((o) => o.role === "task_assistant")
  const selectedPerson = mockIndividuals.find((i) => i.id === selectedIndividual)

  const isValid =
    selectedSubdepartment && selectedClass && officer && taskManager && taskAssistant && selectedIndividual

  return (
    <div className="space-y-8">
      {/* Application Details */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="text-lg font-semibold text-slate-900">Application Details</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="subdepartment" className="text-sm font-medium text-slate-700">
                Subdepartment *
              </Label>
              <Select value={selectedSubdepartment} onValueChange={setSelectedSubdepartment}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select subdepartment" />
                </SelectTrigger>
                <SelectContent>
                  {mockSubdepartments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedSubdepartment && (
              <div className="space-y-2">
                <Label htmlFor="class" className="text-sm font-medium text-slate-700">
                  Class *
                </Label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClasses.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedClass && availableSubclasses.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="subclass" className="text-sm font-medium text-slate-700">
                  Subclass
                </Label>
                <Select value={selectedSubclass} onValueChange={setSelectedSubclass}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select subclass (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSubclasses.map((subcls) => (
                      <SelectItem key={subcls.id} value={subcls.id}>
                        {subcls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Assign Officers */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="text-lg font-semibold text-slate-900">Assign Officers</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="officer" className="text-sm font-medium text-slate-700">
                Officer *
              </Label>
              <Select value={officer} onValueChange={setOfficer}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select officer" />
                </SelectTrigger>
                <SelectContent>
                  {officers.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="taskManager" className="text-sm font-medium text-slate-700">
                Task Manager *
              </Label>
              <Select value={taskManager} onValueChange={setTaskManager}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select task manager" />
                </SelectTrigger>
                <SelectContent>
                  {taskManagers.map((tm) => (
                    <SelectItem key={tm.id} value={tm.id}>
                      {tm.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="taskAssistant" className="text-sm font-medium text-slate-700">
                Task Assistant *
              </Label>
              <Select value={taskAssistant} onValueChange={setTaskAssistant}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select task assistant" />
                </SelectTrigger>
                <SelectContent>
                  {taskAssistants.map((ta) => (
                    <SelectItem key={ta.id} value={ta.id}>
                      {ta.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Metadata */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="text-lg font-semibold text-slate-900">Additional Information</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="appliedBy" className="text-sm font-medium text-slate-700">
                Applied By
              </Label>
              <Input
                id="appliedBy"
                value={appliedBy}
                onChange={(e) => setAppliedBy(e.target.value)}
                placeholder="Enter who applied"
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="batch" className="text-sm font-medium text-slate-700">
                Batch
              </Label>
              <Input
                id="batch"
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                placeholder="Enter batch number"
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountUsed" className="text-sm font-medium text-slate-700">
                Account Used
              </Label>
              <Input
                id="accountUsed"
                value={accountUsed}
                onChange={(e) => setAccountUsed(e.target.value)}
                placeholder="Enter account used"
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="referenceNumber" className="text-sm font-medium text-slate-700">
                Reference Number
              </Label>
              <Input
                id="referenceNumber"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Enter reference number"
                className="h-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual Selection */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="text-lg font-semibold text-slate-900">Select Applicant</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-4">
            <Label className="text-sm font-medium text-slate-700">Individual Type *</Label>
            <RadioGroup
              value={individualType}
              onValueChange={(value: "principal" | "dependent") => setIndividualType(value)}
              className="flex space-x-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="principal" id="principal" />
                <Label htmlFor="principal" className="text-sm font-medium text-slate-700">
                  Principal
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="dependent" id="dependent" />
                <Label htmlFor="dependent" className="text-sm font-medium text-slate-700">
                  Dependent
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="individual" className="text-sm font-medium text-slate-700">
              Individual *
            </Label>
            <Select value={selectedIndividual} onValueChange={setSelectedIndividual}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select an individual" />
              </SelectTrigger>
              <SelectContent>
                {mockIndividuals.map((individual) => (
                  <SelectItem key={individual.id} value={individual.id}>
                    <div className="flex items-center space-x-2">
                      <span>{individual.fullName}</span>
                      <Badge variant="secondary" className="text-xs">
                        {individual.nationality}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPerson && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="bg-blue-100 rounded-full p-2">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-blue-900">{selectedPerson.fullName}</h4>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-blue-700">
                    <div>
                      <span className="font-medium">ID:</span> {selectedPerson.id}
                    </div>
                    <div>
                      <span className="font-medium">Nationality:</span> {selectedPerson.nationality}
                    </div>
                    <div>
                      <span className="font-medium">Date of Birth:</span> {selectedPerson.dateOfBirth}
                    </div>
                    <div>
                      <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                        {individualType === "principal" ? "Principal Applicant" : "Dependent"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end pt-4">
        <Button onClick={handleNext} disabled={!isValid} size="lg" className="px-8">
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
