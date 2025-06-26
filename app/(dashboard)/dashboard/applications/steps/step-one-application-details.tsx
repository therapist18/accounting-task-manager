"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { WizardData } from "../page"
import { mockSubdepartments, mockOfficers } from "../components/supabase"
import { ArrowRight, FileText, Users, Info } from "lucide-react"

interface StepOneProps {
  data: WizardData
  updateData: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function StepOneApplicationDetails({ data, updateData, onNext }: StepOneProps) {
  const [subdepartment, setSubdepartment] = useState(data.subdepartment || "")
  const [selectedClass, setSelectedClass] = useState(data.class || "")
  const [selectedSubclass, setSelectedSubclass] = useState(data.subclass || "")
  const [officer, setOfficer] = useState(data.officer || "")
  const [taskManager, setTaskManager] = useState(data.taskManager || "")
  const [taskAssistant, setTaskAssistant] = useState(data.taskAssistant || "")
  const [accountUsed, setAccountUsed] = useState(data.accountUsed || "")
  const [appliedBy, setAppliedBy] = useState(data.appliedBy || "")
  const [batchId, setBatchId] = useState(data.batchId || "")

  const [availableClasses, setAvailableClasses] = useState<any[]>([])
  const [availableSubclasses, setAvailableSubclasses] = useState<any[]>([])

  useEffect(() => {
    if (subdepartment) {
      const dept = mockSubdepartments.find((d) => d.id === subdepartment)
      setAvailableClasses(dept?.classes || [])
      setSelectedClass("")
      setSelectedSubclass("")
    }
  }, [subdepartment])

  useEffect(() => {
    if (selectedClass) {
      const dept = mockSubdepartments.find((d) => d.id === subdepartment)
      const cls = dept?.classes.find((c) => c.id === selectedClass)
      setAvailableSubclasses(cls?.subclasses || [])
      setSelectedSubclass("")
    }
  }, [selectedClass, subdepartment])

  const handleNext = () => {
    updateData({
      subdepartment,
      class: selectedClass,
      subclass: selectedSubclass,
      officer,
      taskManager,
      taskAssistant,
      accountUsed,
      appliedBy,
      batchId,
    })
    onNext()
  }

  const officers = mockOfficers.filter((o) => o.role === "officer")
  const taskManagers = mockOfficers.filter((o) => o.role === "task_manager")
  const taskAssistants = mockOfficers.filter((o) => o.role === "task_assistant")

  const isValid = subdepartment && selectedClass && officer && taskManager && taskAssistant

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Application Details</h2>
        <p className="text-gray-600">Please provide the application type and assignment details</p>
      </div>

      {/* Application Type Section */}
      <Card>
        <CardHeader className="bg-gray-50 border-b">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <FileText className="h-5 w-5 text-blue-600" />
            <span>Application Type</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="subdepartment" className="text-sm font-medium text-gray-700">
                Subdepartment <span className="text-red-500">*</span>
              </Label>
              <Select value={subdepartment} onValueChange={setSubdepartment}>
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

            <div className="space-y-2">
              <Label htmlFor="class" className="text-sm font-medium text-gray-700">
                Class <span className="text-red-500">*</span>
              </Label>
              <Select value={selectedClass} onValueChange={setSelectedClass} disabled={!subdepartment}>
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

            {availableSubclasses.length > 0 && (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="subclass" className="text-sm font-medium text-gray-700">
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

      {/* Officer Assignment Section */}
      <Card>
        <CardHeader className="bg-gray-50 border-b">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <Users className="h-5 w-5 text-blue-600" />
            <span>Officer Assignment</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="officer" className="text-sm font-medium text-gray-700">
                Officer <span className="text-red-500">*</span>
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
              <Label htmlFor="taskManager" className="text-sm font-medium text-gray-700">
                Task Manager <span className="text-red-500">*</span>
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
              <Label htmlFor="taskAssistant" className="text-sm font-medium text-gray-700">
                Task Assistant <span className="text-red-500">*</span>
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

      {/* Additional Information Section */}
      <Card>
        <CardHeader className="bg-gray-50 border-b">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <Info className="h-5 w-5 text-blue-600" />
            <span>Additional Information</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="accountUsed" className="text-sm font-medium text-gray-700">
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
              <Label htmlFor="appliedBy" className="text-sm font-medium text-gray-700">
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
              <Label htmlFor="batchId" className="text-sm font-medium text-gray-700">
                Batch ID
              </Label>
              <Input
                id="batchId"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                placeholder="Enter batch ID"
                className="h-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-6">
        <Button onClick={handleNext} size="lg" className="px-8">
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
