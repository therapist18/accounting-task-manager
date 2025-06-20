"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, X, Trash2, ChevronDown, ChevronRight } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type DocumentExtraction = {
  fieldName: string
  fieldType: 'text' | 'date' | 'number' | 'boolean'
  isRequired: boolean
  description?: string
}

type StageDocument = {
  id: string
  name: string
  description?: string
  isRequired: boolean
  extractionSpecs?: DocumentExtraction[]
}

interface StageDocumentsProps {
  documents: StageDocument[]
  onChange: (documents: StageDocument[]) => void
  className?: string
}

export function StageDocuments({ documents = [], onChange, className = '' }: StageDocumentsProps) {
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null)
  const [newFieldType, setNewFieldType] = useState<DocumentExtraction['fieldType']>('text')

  const addDocument = () => {
    const newDoc: StageDocument = {
      id: `doc-${Date.now()}`,
      name: '',
      isRequired: false,
      extractionSpecs: []
    }
    onChange([...documents, newDoc])
    setExpandedDocId(newDoc.id)
  }

  const updateDocument = (id: string, updates: Partial<StageDocument>) => {
    onChange(
      documents.map((doc) =>
        doc.id === id ? { ...doc, ...updates } : doc
      )
    )
  }

  const removeDocument = (id: string) => {
    onChange(documents.filter((doc) => doc.id !== id))
    if (expandedDocId === id) {
      setExpandedDocId(null)
    }
  }

  const addExtractionField = (docId: string) => {
    const newField: DocumentExtraction = {
      fieldName: '',
      fieldType: newFieldType,
      isRequired: false,
    }

    onChange(
      documents.map((doc) =>
        doc.id === docId
          ? {
              ...doc,
              extractionSpecs: [
                ...(doc.extractionSpecs || []),
                newField,
              ],
            }
          : doc
      )
    )
  }


  const updateExtractionField = (
    docId: string,
    fieldIndex: number,
    updates: Partial<DocumentExtraction>
  ) => {
    onChange(
      documents.map((doc) =>
        doc.id === docId
          ? {
              ...doc,
              extractionSpecs: doc.extractionSpecs?.map((field, idx) =>
                idx === fieldIndex ? { ...field, ...updates } : field
              ),
            }
          : doc
      )
    )
  }


  const removeExtractionField = (docId: string, fieldIndex: number) => {
    const doc = documents.find((d) => d.id === docId)
    if (!doc) return

    const newFields = doc.extractionSpecs?.filter((_, idx) => idx !== fieldIndex) || []
    
    onChange(
      documents.map((d) =>
        d.id === docId
          ? {
              ...d,
              extractionSpecs: newFields,
            }
          : d
      )
    )
  }

  const toggleDocumentExpand = (id: string) => {
    setExpandedDocId(expandedDocId === id ? null : id)
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex justify-between items-center">
        <h4 className="font-medium">Documents</h4>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addDocument}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Document
        </Button>
      </div>

      <div className="space-y-2">
        {documents.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4 border rounded-md">
            No documents added yet
          </div>
        ) : (
          documents.map((doc) => (
            <div key={doc.id} className="border rounded-md overflow-hidden">
              <div className="flex items-center justify-between p-3 bg-muted/50">
                <div className="flex items-center space-x-3 flex-1">
                  <button
                    type="button"
                    onClick={() => toggleDocumentExpand(doc.id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {expandedDocId === doc.id ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <div className="flex-1">
                    <Input
                      value={doc.name}
                      onChange={(e) =>
                        updateDocument(doc.id, { name: e.target.value })
                      }
                      placeholder="Document name"
                      className="border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1">
                    <Checkbox
                      id={`${doc.id}-required`}
                      checked={doc.isRequired}
                      onCheckedChange={(checked) =>
                        updateDocument(doc.id, { isRequired: Boolean(checked) })
                      }
                    />
                    <Label htmlFor={`${doc.id}-required`} className="text-sm">
                      Required
                    </Label>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeDocument(doc.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {expandedDocId === doc.id && (
                <div className="p-4 border-t">
                  <div className="space-y-4">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`${doc.id}-description`}>Description</Label>
                        <Input
                          id={`${doc.id}-description`}
                          value={doc.description || ''}
                          onChange={(e) =>
                            updateDocument(doc.id, { description: e.target.value })
                          }
                          placeholder="Document description (optional)"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h5 className="text-sm font-medium">Extraction Fields</h5>
                        <div className="flex space-x-2">
                          <Select
                            value={newFieldType}
                            onValueChange={(value: DocumentExtraction['fieldType']) =>
                              setNewFieldType(value)
                            }
                          >
                            <SelectTrigger className="w-[120px]">
                              <SelectValue placeholder="Field type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="date">Date</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="boolean">Yes/No</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addExtractionField(doc.id)}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Field
                          </Button>
                        </div>
                      </div>


                      {doc.extractionSpecs?.length ? (
                        <div className="space-y-2">
                          {doc.extractionSpecs.map((field, fieldIndex) => (
                            <div
                              key={fieldIndex}
                              className="grid grid-cols-12 gap-3 items-start p-3 border rounded-md"
                            >
                              <div className="col-span-5">
                                <Label>Field Name</Label>
                                <Input
                                  value={field.fieldName}
                                  onChange={(e) =>
                                    updateExtractionField(doc.id, fieldIndex, {
                                      fieldName: e.target.value,
                                    })
                                  }
                                  placeholder="e.g., Application Date"
                                />
                              </div>
                              <div className="col-span-3">
                                <Label>Type</Label>
                                <div className="text-sm text-muted-foreground mt-1.5 capitalize">
                                  {field.fieldType}
                                </div>
                              </div>
                              <div className="col-span-2 flex items-center pt-6">
                                <Checkbox
                                  id={`${doc.id}-field-${fieldIndex}-required`}
                                  checked={field.isRequired}
                                  onCheckedChange={(checked) =>
                                    updateExtractionField(doc.id, fieldIndex, {
                                      isRequired: Boolean(checked),
                                    })
                                  }
                                />
                                <Label
                                  htmlFor={`${doc.id}-field-${fieldIndex}-required`}
                                  className="ml-2 text-sm"
                                >
                                  Required
                                </Label>
                              </div>
                              <div className="col-span-2 flex justify-end pt-6">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() =>
                                    removeExtractionField(doc.id, fieldIndex)
                                  }
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground text-center py-4 border rounded-md">
                          No extraction fields added yet
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
