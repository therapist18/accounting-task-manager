"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { mockWebDataFields, mockIndividuals } from "../components/supabase"
import {
  Edit2,
  Save,
  X,
  ArrowRight,
  ArrowLeft,
  TableIcon,
  CheckCircle,
  AlertCircle,
  Sparkles,
  User,
  FileText,
  Edit,
  Info,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { WizardData } from "../page"

interface StepFourProps {
  data: WizardData
  updateData: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function StepFourWebDataFields({ data, updateData, onNext, onPrev }: StepFourProps) {
  const [webFields, setWebFields] = useState<any[]>([])
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")

  useEffect(() => {
    // Auto-fill web data fields from selected individual and uploaded documents
    const selectedPerson = mockIndividuals.find((i) => i.id === data.selectedIndividual)
    const uploadedDocs = data.uploadedDocuments || []

    const fieldsWithData = mockWebDataFields.map((field) => {
      let value = field.value
      let source = field.source

      // First, try to get value from selected individual
      if (selectedPerson && !value) {
        value = getFieldValueFromPerson(field.field, selectedPerson)
        if (value) source = "registry_individuals"
      }

      // Then, try to get value from uploaded documents (AI extraction)
      if (!value) {
        const extractedValue = getFieldValueFromDocuments(field.field, uploadedDocs)
        if (extractedValue) {
          value = extractedValue
          source = "document_extraction"
        }
      }

      return {
        ...field,
        value: value || "",
        source,
      }
    })

    setWebFields(fieldsWithData)
  }, [data.selectedIndividual, data.uploadedDocuments])

  const getFieldValueFromPerson = (fieldName: string, person: any) => {
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

  const getFieldValueFromDocuments = (fieldName: string, uploadedDocs: any[]) => {
    for (const req of uploadedDocs) {
      for (const doc of req.uploadedDocuments || []) {
        if (doc.extractedData && doc.extractedData[fieldName]) {
          return doc.extractedData[fieldName]
        }
      }
    }
    return ""
  }

  const handleEditField = (fieldName: string, currentValue: string) => {
    setEditingField(fieldName)
    setEditValue(currentValue)
  }

  const handleSaveField = (fieldName: string) => {
    setWebFields((prev) =>
      prev.map((field) =>
        field.field === fieldName
          ? { ...field, value: editValue, source: field.value !== editValue ? "manual" : field.source }
          : field,
      ),
    )
    setEditingField(null)
    setEditValue("")
  }

  const handleNext = () => {
    updateData({
      webDataFields: webFields,
    })
    onNext()
  }

  const getSourceBadge = (source: string) => {
    const configs = {
      registry_individuals: {
        bg: "bg-blue-50",
        text: "text-blue-700",
        border: "border-blue-200",
        icon: <User className="h-3 w-3 mr-1" />,
        label: "Registry",
      },
      passport: {
        bg: "bg-purple-50",
        text: "text-purple-700",
        border: "border-purple-200",
        icon: <FileText className="h-3 w-3 mr-1" />,
        label: "Passport",
      },
      document_extraction: {
        bg: "bg-green-50",
        text: "text-green-700",
        border: "border-green-200",
        icon: <Sparkles className="h-3 w-3 mr-1" />,
        label: "AI Extracted",
      },
      manual: {
        bg: "bg-gray-50",
        text: "text-gray-700",
        border: "border-gray-200",
        icon: <Edit className="h-3 w-3 mr-1" />,
        label: "Manual",
      },
    }

    const config = configs[source as keyof typeof configs] || configs.manual

    return (
      <Badge className={`${config.bg} ${config.text} ${config.border} hover:${config.bg}`}>
        {config.icon}
        {config.label}
      </Badge>
    )
  }

  const filledFieldsCount = webFields.filter((field) => field.value && field.value.trim() !== "").length
  const totalFieldsCount = webFields.length
  const completionPercentage = totalFieldsCount > 0 ? (filledFieldsCount / totalFieldsCount) * 100 : 0

  const missingFields = webFields.filter((field) => !field.value || field.value.trim() === "")

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Web Data Fields</h2>
        <p className="text-gray-600">Review and complete your application data</p>
      </div>

      {/* Completion Status */}
      <Card>
        <CardHeader className="bg-gray-50 border-b">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <TableIcon className="h-5 w-5 text-blue-600" />
            <span>Data Completion Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{filledFieldsCount}</div>
              <div className="text-sm text-gray-600">Fields Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{totalFieldsCount}</div>
              <div className="text-sm text-gray-600">Total Fields</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{Math.round(completionPercentage)}%</div>
              <div className="text-sm text-gray-600">Complete</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Missing Fields Alert */}
      {missingFields.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <Info className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>{missingFields.length} field(s) are missing data:</strong>{" "}
            {missingFields.map((field) => field.label).join(", ")}. You can continue without filling all fields, but
            completing them will improve your application.
          </AlertDescription>
        </Alert>
      )}

      {/* Data Fields Table */}
      <Card>
        <CardHeader className="bg-gray-50 border-b">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <TableIcon className="h-5 w-5 text-blue-600" />
            <span>Application Data Fields</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-sm font-medium text-gray-700 w-1/4">Field Name</TableHead>
                  <TableHead className="text-sm font-medium text-gray-700 w-2/5">Value</TableHead>
                  <TableHead className="text-sm font-medium text-gray-700 w-1/5">Source</TableHead>
                  <TableHead className="text-sm font-medium text-gray-700 w-1/5">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webFields.map((field) => (
                  <TableRow key={field.field} className="hover:bg-gray-50">
                    <TableCell className="font-medium text-sm text-gray-900 py-4">
                      <div className="flex items-center space-x-2">
                        <span>{field.label}</span>
                        {(!field.value || field.value.trim() === "") && (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      {editingField === field.field ? (
                        <div className="flex items-center space-x-2">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="h-8 text-sm"
                            placeholder={`Enter ${field.label.toLowerCase()}`}
                          />
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
                        <div className="flex items-center space-x-2">
                          <span
                            className={cn(
                              "text-sm",
                              field.value && field.value.trim() !== ""
                                ? "text-gray-900 font-medium"
                                : "text-gray-400 italic",
                            )}
                          >
                            {field.value && field.value.trim() !== "" ? field.value : "Not set"}
                          </span>
                          {field.value && field.value.trim() !== "" && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-4">{getSourceBadge(field.source)}</TableCell>
                    <TableCell className="py-4">
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
