// @ts-nocheck
"use client"
import React, { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, FileText, Eye, AlertTriangle, CheckCircle } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import { format } from 'date-fns'

interface DocumentSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: any
  stages: any[]
  kycDocuments: Map<string, any>
  isStageApplicableToTask: (stage: any, task: any) => boolean
  isDocumentApplicableToTask: (doc: any, task: any) => boolean
  onDocumentLinked: () => void
}

interface DirectorDocument {
  id: string
  director_id: number
  document_id: string
  file_path: string
  extracted_details: any
  created_at: string
  updated_at: string
  status: string
}

export function DocumentSelectionDialog({
  open,
  onOpenChange,
  task,
  stages,
  kycDocuments,
  isStageApplicableToTask,
  isDocumentApplicableToTask,
  onDocumentLinked
}: DocumentSelectionDialogProps) {
  const [loading, setLoading] = useState(false)
  const [directorDocuments, setDirectorDocuments] = useState<DirectorDocument[]>([])
  const [stageDocumentMap, setStageDocumentMap] = useState<Map<string, DirectorDocument[]>>(new Map())
  const [selectedDocuments, setSelectedDocuments] = useState<Map<string, string>>(new Map())
  const [saving, setSaving] = useState(false)

  // Fetch director documents
  const fetchDirectorDocuments = useCallback(async () => {
    if (!task?.individual_id) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('acc_portal_directors_documents')
        .select('*')
        .eq('director_id', task.individual_id)
        .order('created_at', { ascending: false })

      if (error) throw error

      setDirectorDocuments(data || [])
    } catch (error) {
      console.error('Error fetching director documents:', error)
      toast({
        title: "Error",
        description: "Failed to load documents.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }, [task?.individual_id])

  // Map documents to stages
  const mapDocumentsToStages = useCallback(() => {
    const stageMap = new Map<string, DirectorDocument[]>()

    // Get applicable stages
    const applicableStages = stages.filter(stage =>
      stage && isStageApplicableToTask(stage, task)
    ).sort((a, b) => (a.order_num || 0) - (b.order_num || 0))

    applicableStages.forEach(stage => {
      if (!stage.documents || stage.documents.length === 0) return

      const stageDocuments: DirectorDocument[] = []

      stage.documents.forEach(stageDoc => {
        if (!isDocumentApplicableToTask(stageDoc, task)) return

        // Find director documents that match this stage document type
        const matchingDocs = directorDocuments.filter(dirDoc =>
          dirDoc.document_id === stageDoc.kycId
        )

        stageDocuments.push(...matchingDocs)
      })

      if (stageDocuments.length > 0) {
        stageMap.set(stage.id, stageDocuments)
      }
    })

    setStageDocumentMap(stageMap)
  }, [stages, directorDocuments, task, isStageApplicableToTask, isDocumentApplicableToTask])

  // Load existing selections from task
  const loadExistingSelections = useCallback(() => {
    if (!task?.source_document_id) return

    try {
      const selections = typeof task.source_document_id === 'string'
        ? JSON.parse(task.source_document_id)
        : task.source_document_id

      if (selections && typeof selections === 'object') {
        setSelectedDocuments(new Map(Object.entries(selections)))
      }
    } catch (error) {
      console.error('Error parsing existing selections:', error)
    }
  }, [task?.source_document_id])

  // Handle document selection
  const handleDocumentSelect = (stageId: string, documentId: string, isSelected: boolean) => {
    setSelectedDocuments(prev => {
      const newMap = new Map(prev)
      if (isSelected) {
        newMap.set(stageId, documentId)
      } else {
        newMap.delete(stageId)
      }
      return newMap
    })
  }

  // Save selections
  const handleSave = async () => {
    setSaving(true)
    try {
      const selectionsObject = Object.fromEntries(selectedDocuments)

      const { error } = await supabase
        .from('tm_tasks')
        .update({
          source_document_id: selectionsObject,
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id)

      if (error) throw error

      toast({
        title: "Success",
        description: "Document selections saved successfully.",
        variant: "default"
      })

      onDocumentLinked()
      onOpenChange(false)
    } catch (error) {
      console.error('Error saving document selections:', error)
      toast({
        title: "Error",
        description: "Failed to save document selections.",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  // Get document preview URL
  const getDocumentPreviewUrl = (document: DirectorDocument) => {
    if (!document.file_path) return null

    const bucketName = 'kyc-documents'
    const filePath = document.file_path.startsWith(bucketName)
      ? document.file_path
      : `${bucketName}/${document.file_path}`

    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`
  }

  // Get document type name
  const getDocumentTypeName = (documentId: string) => {
    const kycData = kycDocuments.get(documentId)
    return kycData?.display_name || kycData?.name || 'Unknown Document'
  }

  // Effects
  useEffect(() => {
    if (open && task) {
      fetchDirectorDocuments()
      loadExistingSelections()
    }
  }, [open, task, fetchDirectorDocuments, loadExistingSelections])

  useEffect(() => {
    if (directorDocuments.length > 0) {
      mapDocumentsToStages()
    }
  }, [directorDocuments, mapDocumentsToStages])

  if (!task) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Link Documents - {task.applicant_name}
          </DialogTitle>
          <DialogDescription>
            Select one document per stage to link to this task. Only documents uploaded for this applicant are shown.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading documents...</span>
              </div>
            </div>
          ) : stageDocumentMap.size === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="font-semibold text-gray-700">No Documents Found</h3>
              <p className="text-sm text-gray-500">
                No documents have been uploaded for this applicant that match the required stage document types.
              </p>
            </div>
          ) : (
            Array.from(stageDocumentMap.entries()).map(([stageId, documents]) => {
              const stage = stages.find(s => s.id === stageId)
              if (!stage) return null

              return (
                <Card key={stageId} className="border-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{stage.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {documents.length} document{documents.length !== 1 ? 's' : ''} available
                        </Badge>
                      </div>
                      {selectedDocuments.has(stageId) && (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {documents.map((document) => {
                      const isSelected = selectedDocuments.get(stageId) === document.id
                      const documentTypeName = getDocumentTypeName(document.document_id)
                      const previewUrl = getDocumentPreviewUrl(document)

                      return (
                        <div
                          key={document.id}
                          className={`p-3 border rounded-lg ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) =>
                                  handleDocumentSelect(stageId, document.id, checked as boolean)
                                }
                                className="mt-1"
                              />
                              <div className="flex-1 space-y-1">
                                <div className="font-medium text-sm">
                                  {documentTypeName}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Uploaded: {format(new Date(document.created_at), 'dd MMM yyyy, HH:mm')}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Status: <Badge variant="outline" className="text-xs">{document.status}</Badge>
                                </div>
                                {document.extracted_details && (
                                  <div className="text-xs text-gray-500">
                                    Data extracted: Yes
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {previewUrl && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => window.open(previewUrl, '_blank')}
                                  title="Preview Document"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-gray-500">
            {selectedDocuments.size > 0 && (
              <span>{selectedDocuments.size} stage{selectedDocuments.size !== 1 ? 's' : ''} with documents selected</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || selectedDocuments.size === 0}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Save Selections'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}