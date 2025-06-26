"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import type { WizardData } from "../page"
import { mockSubdepartments } from "../components/supabase"

interface StepOneProps {
  data: WizardData
  updateData: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function StepOne({ data, updateData, onNext }: StepOneProps) {
  const [selectedSubdepartment, setSelectedSubdepartment] = useState(data.subdepartment || "")
  const [selectedClass, setSelectedClass] = useState(data.class || "")
  const [selectedSubclass, setSelectedSubclass] = useState(data.subclass || "")

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
    })
    onNext()
  }

  const isValid = selectedSubdepartment && selectedClass

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 1: Select Application Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="subdepartment">Subdepartment *</Label>
          <Select value={selectedSubdepartment} onValueChange={setSelectedSubdepartment}>
            <SelectTrigger>
              <SelectValue placeholder="Select a subdepartment" />
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
            <Label htmlFor="class">Class *</Label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger>
                <SelectValue placeholder="Select a class" />
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
            <Label htmlFor="subclass">Subclass</Label>
            <Select value={selectedSubclass} onValueChange={setSelectedSubclass}>
              <SelectTrigger>
                <SelectValue placeholder="Select a subclass (optional)" />
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

        <div className="flex justify-end">
          <Button onClick={handleNext} disabled={!isValid}>
            Next Step
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
