"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { WizardData } from "../page"
import { mockRequirements, mockWebDataFields, mockIndividuals } from "../components/supabase"
import { Upload, FileText, CheckCircle, AlertCircle, Edit2, Save, X } from "lucide-react"

interface StepFiveProps {
  data: WizardData
  updateData: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function StepFive({ data, updateData, onNext, onPrev }: StepFiveProps) {
  const [documents, setDocuments] = useState<any[]>([])
  const [webFields, setWebFields] = useState<any[]>([])
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")

  useEffect(() => {
    // Load requirements based on selected class
    const requirements = mockRequirements[data.class as keyof typeof mockRequirements] || []
    const docsWithStatus = requirements.map((req) => ({
      ...req,
      status: Math.random() > 0.5 ? "uploaded" : "missing",
      uploadedFile: Math.random() > 0.5 ? `${req.name.toLowerCase().replace(" ", "_")}.pdf` : null,
    }))
    setDocuments(docsWithStatus)

    // Auto-fill web data fields from selected individual
    const selectedPerson = mockIndividuals.find((i) => i.id === data.selectedIndividual)
    const fieldsWithData = mockWebDataFields.map((field) => ({
      ...field,
      value: selectedPerson ? getFieldValue(field.field, selectedPerson) : field.value,
    }))
    setWebFields(fieldsWithData)
  }, [data.class, data.selectedIndividual])

  const getFieldValue = (fieldName: string, person: any) => {
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

  const handleFileUpload = (docId: string) => {
    setDocuments((prev) =>
      prev.map((doc) =>
        doc.id === docId
          ? { ...doc, status: "uploaded", uploadedFile: `${doc.name.toLowerCase().replace(" ", "_")}.pdf` }
          : doc,
      ),
    )
  }

  const handleEditField = (fieldName: string, currentValue: string) => {
    setEditingField(fieldName)
    setEditValue(currentValue)
  }

  const handleSaveField = (fieldName: string) => {
    setWebFields((prev) => prev.map((field) => (field.field === fieldName ? { ...field, value: editValue } : field)))
    setEditingField(null)
    setEditValue("")
  }

  const handleNext = () => {
    updateData({
      uploadedDocuments: documents,
      webDataFields: webFields,
    })
    onNext()
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "uploaded":
        return (
          <Badge className="bg-green-100 text-green-800 border-green-300">
            <CheckCircle className="h-3 w-3 mr-1" />
            Uploaded
          </Badge>
        )
      case "missing":
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Missing
          </Badge>
        )
      case "expired":
        return (
          <Badge className="bg-orange-100 text-orange-800 border-orange-300">
            <AlertCircle className="h-3 w-3 mr-1" />
            Expired
          </Badge>
        )
      default:
        return <Badge variant="secondary">Unknown</Badge>
    }
  }

  const getSourceBadge = (source: string) => {
    const colors = {
      registry_individuals: "bg-blue-100 text-blue-800 border-blue-300",
      passport: "bg-purple-100 text-purple-800 border-purple-300",
      manual: "bg-gray-100 text-gray-800 border-gray-300",
    }
    return <Badge className={colors[source as keyof typeof colors] || colors.manual}>Source: {source}</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Upload Requirements Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc) => (
              <Card
                key={doc.id}
                className="border-2 border-dashed border-gray-200 hover:border-gray-300 transition-colors"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-5 w-5 text-gray-500" />
                      <div>
                        <h4 className="font-medium">{doc.name}</h4>
                        {doc.required && <span className="text-xs text-red-600">Required</span>}
                      </div>
                    </div>
                    {getStatusBadge(doc.status)}
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{doc.description}</p>
                  {doc.uploadedFile ? (
                    <div className="flex items-center space-x-2 text-sm text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span>{doc.uploadedFile}</span>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => handleFileUpload(doc.id)} className="w-full">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Document
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Web Data Fields Section */}
      <Card>
        <CardHeader>
          <CardTitle>Web Data Fields</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field Name</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webFields.map((field) => (
                <TableRow key={field.field}>
                  <TableCell className="font-medium">{field.label}</TableCell>
                  <TableCell>
                    {editingField === field.field ? (
                      <div className="flex items-center space-x-2">
                        <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-8" />
                        <Button size="sm" onClick={() => handleSaveField(field.field)}>
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingField(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <span className={field.value ? "" : "text-gray-400"}>{field.value || "Not set"}</span>
                    )}
                  </TableCell>
                  <TableCell>{getSourceBadge(field.source)}</TableCell>
                  <TableCell>
                    {field.editable && editingField !== field.field && (
                      <Button size="sm" variant="ghost" onClick={() => handleEditField(field.field, field.value)}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onPrev}>
          Previous
        </Button>
        <Button onClick={handleNext}>Review & Submit</Button>
      </div>
    </div>
  )
}
