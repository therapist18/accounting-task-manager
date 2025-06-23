  // @ts-nocheck
  "use client"

  import React, { useState } from "react"
  import { Button } from "@/components/ui/button"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"
  import { Textarea } from "@/components/ui/textarea"
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
  import { Checkbox } from "@/components/ui/checkbox"
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
  import { Plus, Trash2, FileText } from "lucide-react"
  import type { StageDocument, DocumentExtraction } from "../departments/database"

  interface StageDocumentsProps {
    documents: StageDocument[]
    onChange: (documents: StageDocument[]) => void
  }

  export function StageDocuments({ documents, onChange }: StageDocumentsProps) {
    const generateId = () => Math.random().toString(36).substring(2) + Date.now().toString(36)

    const addDocument = () => {
      const newDoc: StageDocument = {
        id: generateId(),
        name: '',
        description: '',
        isRequired: true,
        extractionSpecs: [],
        allowMultiple: false
      }
      onChange([...documents, newDoc])
    }

    const updateDocument = (docId: string, updates: Partial<StageDocument>) => {
      onChange(documents.map(doc => 
        doc.id === docId ? { ...doc, ...updates } : doc
      ))
    }

    const removeDocument = (docId: string) => {
      onChange(documents.filter(doc => doc.id !== docId))
    }

    const addExtraction = (docId: string) => {
      const newExtraction: DocumentExtraction = {
        id: generateId(),
        fieldName: '',
        fieldType: 'text',
        isRequired: true,
        description: ''
      }
      
      updateDocument(docId, {
        extractionSpecs: [
          ...(documents.find(d => d.id === docId)?.extractionSpecs || []),
          newExtraction
        ]
      })
    }

    const updateExtraction = (docId: string, extractionId: string, updates: Partial<DocumentExtraction>) => {
      const doc = documents.find(d => d.id === docId)
      if (!doc) return

      const updatedExtractions = doc.extractionSpecs.map(ext =>
        ext.id === extractionId ? { ...ext, ...updates } : ext
      )

      updateDocument(docId, { extractionSpecs: updatedExtractions })
    }

    const removeExtraction = (docId: string, extractionId: string) => {
      const doc = documents.find(d => d.id === docId)
      if (!doc) return

      updateDocument(docId, {
        extractionSpecs: doc.extractionSpecs.filter(ext => ext.id !== extractionId)
      })
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium">Documents</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addDocument}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            Add Document
          </Button>
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p>No documents added yet</p>
            <p className="text-sm">Click "Add Document" to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {documents.map((doc, docIndex) => (
              <Card key={doc.id} className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Document {docIndex + 1}</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeDocument(doc.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Document Name *</Label>
                      <Input
                        value={doc.name}
                        onChange={(e) => updateDocument(doc.id, { name: e.target.value })}
                        placeholder="e.g., Application Form, Passport Copy"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Input
                        value={doc.description || ''}
                        onChange={(e) => updateDocument(doc.id, { description: e.target.value })}
                        placeholder="Optional description"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`required-${doc.id}`}
                        checked={doc.isRequired}
                        onCheckedChange={(checked) => updateDocument(doc.id, { isRequired: Boolean(checked) })}
                      />
                      <Label htmlFor={`required-${doc.id}`}>Required</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`multiple-${doc.id}`}
                        checked={doc.allowMultiple || false}
                        onCheckedChange={(checked) => updateDocument(doc.id, { allowMultiple: Boolean(checked) })}
                      />
                      <Label htmlFor={`multiple-${doc.id}`}>Allow Multiple Files</Label>
                    </div>
                  </div>

                  {/* Extraction Specifications */}
                  <div className="space-y-3 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <Label className="font-medium">Data Extraction Specifications</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addExtraction(doc.id)}
                        className="gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        Add Field
                      </Button>
                    </div>

                    {doc.extractionSpecs.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground text-sm border border-dashed rounded">
                        No extraction fields defined. Click "Add Field" to specify data to extract from this document.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {doc.extractionSpecs.map((extraction, extIndex) => (
                          <div key={extraction.id} className="grid grid-cols-12 gap-2 items-end p-3 bg-gray-50 rounded-lg">
                            <div className="col-span-3">
                              <Label className="text-xs">Field Name</Label>
                              <Input
                                value={extraction.fieldName}
                                onChange={(e) => updateExtraction(doc.id, extraction.id, { fieldName: e.target.value })}
                                placeholder="e.g., Date Applied"
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="col-span-2">
                              <Label className="text-xs">Type</Label>
                              <Select
                                value={extraction.fieldType}
                                onValueChange={(value) => updateExtraction(doc.id, extraction.id, { fieldType: value as any })}
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="date">Date</SelectItem>
                                  <SelectItem value="number">Number</SelectItem>
                                  <SelectItem value="boolean">Yes/No</SelectItem>
                                  <SelectItem value="file">File</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-4">
                              <Label className="text-xs">Description</Label>
                              <Input
                                value={extraction.description || ''}
                                onChange={(e) => updateExtraction(doc.id, extraction.id, { description: e.target.value })}
                                placeholder="What to extract"
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="col-span-2 flex items-center space-x-2">
                              <Checkbox
                                id={`ext-required-${extraction.id}`}
                                checked={extraction.isRequired}
                                onCheckedChange={(checked) => updateExtraction(doc.id, extraction.id, { isRequired: Boolean(checked) })}
                              />
                              <Label htmlFor={`ext-required-${extraction.id}`} className="text-xs">Required</Label>
                            </div>
                            <div className="col-span-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeExtraction(doc.id, extraction.id)}
                                className="h-8 w-8 p-0 text-red-500"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }