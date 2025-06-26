"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import { User } from "lucide-react"
import { mockIndividuals } from "../components/supabase"
import { WizardData } from "../page"

interface StepFourProps {
  data: WizardData
  updateData: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function StepFour({ data, updateData, onNext, onPrev }: StepFourProps) {
  const [individualType, setIndividualType] = useState<"principal" | "dependent">(data.individualType || "principal")
  const [selectedIndividual, setSelectedIndividual] = useState(data.selectedIndividual || "")

  const handleNext = () => {
    updateData({
      individualType,
      selectedIndividual,
    })
    onNext()
  }

  const selectedPerson = mockIndividuals.find((i) => i.id === selectedIndividual)
  const isValid = individualType && selectedIndividual

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 4: Select Individual to Apply For</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Individual Type *</Label>
          <RadioGroup
            value={individualType}
            onValueChange={(value: "principal" | "dependent") => setIndividualType(value)}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="principal" id="principal" />
              <Label htmlFor="principal">Principal</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="dependent" id="dependent" />
              <Label htmlFor="dependent">Dependent</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="individual">Individual *</Label>
          <Select value={selectedIndividual} onValueChange={setSelectedIndividual}>
            <SelectTrigger>
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
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-start space-x-4">
                <div className="bg-blue-100 rounded-full p-3">
                  <User className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900">{selectedPerson.fullName}</h3>
                  <div className="mt-2 space-y-1 text-sm text-blue-700">
                    <p>
                      <span className="font-medium">ID:</span> {selectedPerson.id}
                    </p>
                    <p>
                      <span className="font-medium">Nationality:</span> {selectedPerson.nationality}
                    </p>
                    <p>
                      <span className="font-medium">Date of Birth:</span> {selectedPerson.dateOfBirth}
                    </p>
                  </div>
                  <Badge className="mt-2 bg-blue-100 text-blue-800 border-blue-300">
                    {individualType === "principal" ? "Principal Applicant" : "Dependent"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-between">
          <Button variant="outline" onClick={onPrev}>
            Previous
          </Button>
          <Button onClick={handleNext} disabled={!isValid}>
            Next Step
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
