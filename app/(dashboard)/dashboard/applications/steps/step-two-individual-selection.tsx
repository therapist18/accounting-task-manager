"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { WizardData } from "../page"
import { mockIndividuals } from "../components/supabase"
import { ArrowRight, ArrowLeft, User, Users, BadgeIcon as IdCard } from "lucide-react"

interface StepTwoProps {
  data: WizardData
  updateData: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function StepTwoIndividualSelection({ data, updateData, onNext, onPrev }: StepTwoProps) {
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
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Individual Selection</h2>
        <p className="text-gray-600">Select the individual for this application</p>
      </div>

      {/* Individual Type Section */}
      <Card>
        <CardHeader className="bg-gray-50 border-b">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <Users className="h-5 w-5 text-blue-600" />
            <span>Individual Type</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            <Label className="text-sm font-medium text-gray-700">
              Select individual type <span className="text-red-500">*</span>
            </Label>
            <RadioGroup
              value={individualType}
              onValueChange={(value: "principal" | "dependent") => setIndividualType(value)}
              className="flex space-x-8"
            >
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="principal" id="principal" />
                <Label htmlFor="principal" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Principal Applicant
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="dependent" id="dependent" />
                <Label htmlFor="dependent" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Dependent
                </Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {/* Individual Selection Section */}
      <Card>
        <CardHeader className="bg-gray-50 border-b">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <User className="h-5 w-5 text-blue-600" />
            <span>Select Individual</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="individual" className="text-sm font-medium text-gray-700">
                Individual <span className="text-red-500">*</span>
              </Label>
              <Select value={selectedIndividual} onValueChange={setSelectedIndividual}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Search and select an individual" />
                </SelectTrigger>
                <SelectContent>
                  {mockIndividuals.map((individual) => (
                    <SelectItem key={individual.id} value={individual.id}>
                      <div className="flex items-center space-x-3">
                        <span className="font-medium">{individual.fullName}</span>
                        <Badge variant="secondary" className="text-xs">
                          {individual.nationality}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Selected Individual Profile */}
            {selectedPerson && (
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center space-x-2 text-base">
                    <IdCard className="h-4 w-4 text-blue-600" />
                    <span>Selected Individual Profile</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs font-medium text-blue-700">Full Name</Label>
                        <p className="text-sm font-medium text-blue-900">{selectedPerson.fullName}</p>
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-blue-700">ID Number</Label>
                        <p className="text-sm font-medium text-blue-900">{selectedPerson.id}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs font-medium text-blue-700">Date of Birth</Label>
                        <p className="text-sm font-medium text-blue-900">{selectedPerson.dateOfBirth}</p>
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-blue-700">Nationality</Label>
                        <p className="text-sm font-medium text-blue-900">{selectedPerson.nationality}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                      {individualType === "principal" ? "Principal Applicant" : "Dependent"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </CardContent>
      </Card>

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
    </div>
  )
}
