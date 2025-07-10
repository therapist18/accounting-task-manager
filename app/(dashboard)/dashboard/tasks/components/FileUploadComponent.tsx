// @ts-nocheck
"use client"

import React, { useState, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Upload, FileText } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { performExtraction } from "@/lib/extractionUtils"
import { supabase } from "@/lib/supabase/client"
import dynamic from 'next/dynamic'

const ExtractionPreview = dynamic(
  () => import('@/components/ExtractionPreview').then(mod => mod.default || mod),
  { ssr: false }
)

interface FileUploadComponentProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: any
  document: any
  columnType: 'principal' | 'dependant' | 'understudy'
  onUploadComplete?: () => void
}

export function FileUploadComponent({
  open,
  onOpenChange,
  task,
  document,
  columnType,
  onUploadComplete
}: FileUploadComponentProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [extractedData, setExtractedData] = useState<any>({})
  const [uploading, setUploading] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<any>(null)
  
  // Initialize extraction fields from document
  const extractionFields = React.useMemo(() => {
    return document?.fields?.map((field: any) => ({
      id: field.id,
      name: field.name,
      type: field.type || 'text',
      required: field.required || false
    })) || [];
  }, [document])

  // Clean up when dialog closes
  React.useEffect(() => {
    if (!open) {
      setSelectedFile(null)
      setExtractedData({})
      setPreviewData(null)
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl)
        setFileUrl(null)
      }
      // Clean up global function
      if (window.refreshExtraction) {
        delete window.refreshExtraction
      }
    }
  }, [open, fileUrl])

  // Get individual ID based on column type
  const getIndividualId = useCallback(() => {
    switch (columnType) {
      case 'principal':
        return task.principal_member || task.individual_id
      case 'dependant':
        return task.dependant_member || task.individual_id
      case 'understudy':
        return task.understudy_member || task.individual_id
      default:
        return task.individual_id
    }
  }, [task, columnType])

  // Upload file to Supabase storage
  const uploadFileToStorage = async (file: File, individualId: number): Promise<string> => {
    try {
      const bucketName = 'kyc-documents'

      // Get individual name for folder structure
      const { data: individual, error: individualError } = await supabase
        .from('registry_individuals')
        .select('full_name')
        .eq('id', individualId)
        .single()

      if (individualError) {
        throw new Error(`Failed to get individual name: ${individualError.message}`)
      }

      const normalizedName = individual.full_name
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')

      const fileExtension = file.name.split('.').pop()
      const timestamp = Date.now()
      const filename = `individual-documents/${normalizedName}/${document.name}/${timestamp}.${fileExtension}`

      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filename, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) {
        throw new Error(`Storage upload failed: ${error.message}`)
      }

      return data.path
    } catch (error) {
      console.error('Error uploading file to storage:', error)
      throw error
    }
  }



  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      const objectUrl = URL.createObjectURL(file)
      setFileUrl(objectUrl)
      
      // Set up immediate preview with empty data
      const previewData = {
        fileUrl: objectUrl,
        fileName: file.name,
        fileType: file.type,
        extractedData: {}
      }
      setPreviewData(previewData)
      
      // Make refreshExtraction available globally
      window.refreshExtraction = async () => {
        if (file) {
          await performDataExtraction(file, objectUrl, true)
        }
      }
      
      // Start extraction in the background
      performDataExtraction(file, objectUrl)
    }
  }



// Update the FileUploadComponent to use fields from the document
  const performDataExtraction = async (file: File, fileUrl: string, isRefresh = false) => {
    if (!file || !document) return

    setUploading(true)
    try {
      const { extractedData, success, message } = await performExtraction(
        fileUrl,
        extractionFields,
        document?.category || 'document',
        (progressMessage) => {
          console.log('Extraction progress:', progressMessage)
        },
        file.name
      )
  
      let parsedData = extractedData
      if (typeof extractedData === 'string') {
        try {
          const match = extractedData.match(/```json\n([\s\S]*?)\n```/)
          parsedData = match && match[1] ? JSON.parse(match[1]) : {}
        } catch (parseError) {
          console.error('Error parsing extracted data:', parseError)
          parsedData = {}
        }
      }
  
      setExtractedData(parsedData)
      
      // Update preview data with extracted data
      setPreviewData(prev => ({
        ...prev,
        extractedData: parsedData
      }))
  
      if (success) {
        toast({
          title: 'Success',
          description: `Successfully extracted data from ${file.name}`
        })
      }
    } catch (error) {
      console.error('Extraction error:', error)
      toast({
        title: 'Error',
        description: `Extraction failed: ${error.message}`,
        variant: 'destructive'
      })
    } finally {
      setUploading(false)
    }
  }

  // Handle data change from ExtractionPreview
  const handleDataChange = (fieldName: string, value: any) => {
    setExtractedData(prev => ({
      ...prev,
      [fieldName]: value
    }))
  }

  // Save document to database
  const handleSaveDocument = async () => {
    if (!selectedFile) {
      toast({
        title: 'Error',
        description: 'No file selected',
        variant: 'destructive'
      })
      return
    }

    try {
      setUploading(true)

      const individualId = getIndividualId()
      if (!individualId) {
        throw new Error('Individual ID not found')
      }

      // Upload file to storage
      const filePath = await uploadFileToStorage(selectedFile, individualId)

      // Save document record to database
      const documentRecord = {
        director_id: individualId,
        document_id: document.id,
        file_path: filePath,
        extracted_details: extractedData,
        applicant_type: columnType,
        status: 'uploaded',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { data: insertedDoc, error } = await supabase
        .from('acc_portal_directors_documents')
        .insert(documentRecord)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to save document: ${error.message}`)
      }

      toast({
        title: 'Success',
        description: 'Document uploaded and saved successfully'
      })

      // Close dialog and trigger refresh
      onOpenChange(false)
      if (onUploadComplete) {
        onUploadComplete()
      }

    } catch (error) {
      console.error('Error saving document:', error)
      toast({
        title: 'Error',
        description: `Failed to save document: ${error.message}`,
        variant: 'destructive'
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Upload {(document?.display_name || document?.name || 'Unknown Document')} for {columnType}
          </DialogTitle>
        </DialogHeader>

        <div className="">
          {/* Left Panel - Upload Options */}
          <div className="space-y-4">
            <div className="space-y-4 p-4 rounded-lg border">
              <div className="space-y-2">
                <Label htmlFor="file-input" className="font-medium">
                  Upload File
                </Label>
                <Input
                  id="file-input"
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={handleFileChange}
                  className="cursor-pointer"
                  disabled={uploading}
                />
                <p className="text-sm text-muted-foreground">
                  Supported formats: PDF, Images
                </p>
              </div>


            </div>
          </div>

          {/* Right Panel - Preview */}
          <div>
            <div className="mt-6">
            {fileUrl ? (
              <ExtractionPreview
                documentName={document?.display_name || document?.name || 'Document'}
                extractedData={previewData?.extractedData || {}}
                fields={extractionFields}
                onDataChange={(field, value) => {
                  setExtractedData((prev: any) => ({
                    ...prev,
                    [field]: value
                  }))
                }}
                fileUrl={fileUrl}
                fileName={selectedFile?.name || ''}
                expanded={true}
              />
            ) : (
              <div className="flex items-center justify-center h-64 border-2 border-dashed rounded-lg">
                <p className="text-muted-foreground">Upload a file to see the preview</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveDocument}
            disabled={!selectedFile || uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Save Document
              </>
            )}
          </Button>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}