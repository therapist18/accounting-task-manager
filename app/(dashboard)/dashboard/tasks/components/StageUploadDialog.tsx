// @ts-nocheck
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, Send, FileText, RotateCw, Trash2, MessageSquare } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import dynamic from 'next/dynamic'
import { toast } from "@/hooks/use-toast"
import { performExtraction } from "@/lib/extractionUtils"
import { supabase } from "@/lib/supabase/client"

const ExtractionPreview = dynamic(
  () => import('@/components/ExtractionPreview').then(mod => mod.default || mod),
  { ssr: false }
)

interface StageUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedStageTask: { task: any, stage: any } | null
  getCurrentRequirements: () => any[]
  fuzzyMatch: (str1: string, str2: string, threshold?: number) => boolean
}

export function StageUploadDialog({
  open,
  onOpenChange,
  selectedStageTask,
  getCurrentRequirements,
  fuzzyMatch
}: StageUploadDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File>>({})
  const [messageTexts, setMessageTexts] = useState<Record<string, string>>({})
  const [extractedData, setExtractedData] = useState<Record<string, any>>({})
  const [uploading, setUploading] = useState(false)
  const [activeDocumentTab, setActiveDocumentTab] = useState<string>('')
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, any[]>>({})
  const [previewData, setPreviewData] = useState<Record<string, {
    fileUrl?: string;
    fileName?: string;
    fileType?: string;
    messageContent?: string;
    extractedData?: any;
    documentName?: string;
  }>>({})
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})

  // New state for database submission
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false)
  const [fuzzyMatchResults, setFuzzyMatchResults] = useState<any[]>([])
  const [pendingSubmission, setPendingSubmission] = useState<any>(null)

  // Storage keys
  const STAGE_DOCUMENTS_STORAGE_KEY = 'stageDocuments'
  const TASK_STAGE_STATUS_KEY = 'taskStageStatuses'

  // Clean up object URLs when component unmounts or when dialog closes
  useEffect(() => {
    return () => {
      Object.values(previewData).forEach(data => {
        if (data.fileUrl) {
          URL.revokeObjectURL(data.fileUrl)
        }
      })
    }
  }, [previewData])

  // Set the first document as active tab if none selected
  useEffect(() => {
    if (selectedStageTask?.stage?.documents?.length > 0 && !activeDocumentTab) {
      setActiveDocumentTab(selectedStageTask.stage.documents[0].id)
    }
  }, [selectedStageTask?.stage?.documents, activeDocumentTab])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setActiveDocumentTab('')
      setUploadedDocs({})
      setPreviewData({})
      setMessageTexts({})
      setExtractedData({})
      setConfirmationDialogOpen(false)
      setFuzzyMatchResults([])
      setPendingSubmission(null)
    }
  }, [open])

  // Helper functions
  const generateDocumentId = () => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36)
  }

  const updateLocalStorage = (key: string, value: any) => {
    localStorage.setItem(key, JSON.stringify(value))
    window.dispatchEvent(new Event('localStorageChange'))
  }

  // Database submission functions
  const searchRegistryIndividuals = async (individual: any) => {
    try {
      console.log('Searching registry for individual:', individual)

      let exactMatch = null
      let fuzzyMatches = []

      // First, try exact matches by r_number or passport_number
      if (individual.r_number) {
        const { data: rNumberMatch, error } = await supabase
          .from('registry_individuals')
          .select('*')
          .eq('r_number', individual.r_number)

        if (!error && rNumberMatch && rNumberMatch.length > 0) {
          exactMatch = rNumberMatch[0]
        }
      }

      if (!exactMatch && individual.passport_number) {
        const { data: passportMatch, error } = await supabase
          .from('registry_individuals')
          .select('*')
          .eq('passport_number', individual.passport_number)

        if (!error && passportMatch && passportMatch.length > 0) {
          exactMatch = passportMatch[0]
        }
      }

      // If no exact match, try fuzzy matching on full_name
      if (!exactMatch && individual.full_name) {
        const { data: allIndividuals, error } = await supabase
          .from('registry_individuals')
          .select('*')
          .limit(100)

        if (!error && allIndividuals) {
          fuzzyMatches = allIndividuals.filter(person => {
            if (!person.full_name) return false

            if (person.full_name.toLowerCase() === individual.full_name.toLowerCase()) {
              if (!exactMatch) exactMatch = person
              return false
            }

            return fuzzyMatch(individual.full_name, person.full_name, 0.70)
          }).slice(0, 5)
        }
      }

      return {
        exactMatch,
        fuzzyMatches,
        searchCriteria: {
          r_number: individual.r_number,
          passport_number: individual.passport_number,
          full_name: individual.full_name,
          individual_type: individual.individual_type
        }
      }
    } catch (error) {
      console.error('Error searching registry:', error)
      throw new Error(`Registry search failed: ${error.message}`)
    }
  }

  const uploadFileToStorage = async (file: File, individualId: number, documentType: string): Promise<string> => {
    try {
      const bucketName = 'kyc-documents'

      const individual = await supabase
        .from('registry_individuals')
        .select('full_name')
        .eq('id', individualId)
        .single()

      if (individual.error) {
        throw new Error(`Failed to get individual name: ${individual.error.message}`)
      }

      const normalizedName = individual.data.full_name
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')

      const filename = `individual-documents/${normalizedName}/${documentType}/${file.name}`

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

  const createNewRegistryIndividual = async (individual: any): Promise<number> => {
    try {
      if (!selectedStageTask) throw new Error('No task selected')
      
      let fullName = individual.full_name || selectedStageTask.task.applicant_name || selectedStageTask.task.principal_member_name

      if (!fullName && individual.first_name && individual.last_name) {
        fullName = `${individual.first_name} ${individual.last_name}`.trim()
      }

      if (!fullName) {
        throw new Error('Cannot create individual without a name')
      }

      const newIndividualData = {
        first_name: individual.first_name || fullName.split(' ')[0] || '',
        middle_name: individual.middle_name || '',
        last_name: individual.last_name || fullName.split(' ').slice(-1)[0] || '',
        full_name: fullName,
        gender: individual.gender || null,
        nationality: individual.nationality || null,
        date_of_birth: individual.date_of_birth || null,
        passport_number: individual.passport_number || null,
        passport_place_of_issue: individual.passport_place_of_issue || null,
        passport_issue_date: individual.passport_issue_date || null,
        passport_expiry_date: individual.passport_expiry_date || null,
        id_number: individual.id_number || null,
        r_number: individual.r_number || selectedStageTask.task.r_number || null,
        individual_type: individual.individual_type || 'director',
        status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { data: newIndividual, error } = await supabase
        .from('registry_individuals')
        .insert(newIndividualData)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to create registry individual: ${error.message}`)
      }

      return newIndividual.id
    } catch (error) {
      console.error('Error creating new registry individual:', error)
      throw error
    }
  }

  const submitDocumentsToDatabase = async (documents: any[], registryIndividual: any, docId: string) => {
    try {
      console.log('=== Starting document submission ===')

      const submittedDocIds = []

      for (const [index, doc] of documents.entries()) {
        // Document submission logic here
        const documentRecord = {
          director_id: registryIndividual.id,
          document_id: doc.documentType || 'unknown',
          file_path: await uploadFileToStorage(doc.file, registryIndividual.id, doc.documentType || 'document'),
          extracted_details: doc.extractedData || {},
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }

        const { data: insertedDoc, error: insertError } = await supabase
          .from('acc_portal_directors_documents')
          .insert(documentRecord)
          .select()
          .single()

        if (insertError) {
          throw new Error(`Failed to save document record: ${insertError.message}`)
        }

        submittedDocIds.push(insertedDoc.id)
      }

      toast({
        title: 'Success',
        description: `${documents.length} document(s) submitted successfully to database`
      })

      return submittedDocIds
    } catch (error) {
      console.error('=== Document submission failed ===')
      throw error
    }
  }

  // Get fields for extraction based on document configuration
  const getFieldsForDocument = (docId: string) => {
    if (!selectedStageTask?.stage?.documents) return []
    
    const document = selectedStageTask.stage.documents.find(d => d.id === docId)
    if (!document?.extractionSpecs) return []

    return document.extractionSpecs.map(spec => ({
      id: spec.id || spec.fieldName || `field-${Date.now()}`,
      name: spec.fieldName || spec.name || 'Unknown Field',
      type: spec.fieldType || spec.type || 'text',
      required: spec.isRequired || spec.required || false,
      isArray: spec.isArray || false,
      arrayConfig: spec.arrayConfig
    }))
  }

  // Function to convert message to PDF
  const convertMessageToPDF = async (message: string, documentName: string): Promise<Blob> => {
    try {
      const response = await fetch('/api/convert-message-to-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          documentType: 'message',
          documentName
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to convert message to PDF: ${response.status} ${errorText}`)
      }

      return response.blob()
    } catch (error) {
      console.error('Error in convertMessageToPDF:', error)
      throw error
    }
  }

  // Handle file upload and extraction
  const handleFileUpload = async (files: File[] | File, docId: string) => {
    if (!selectedStageTask) return
    
    try {
      const fileArray = Array.isArray(files) ? files : [files]
      if (!fileArray.length) {
        toast({
          title: 'Error',
          description: 'No files selected for upload',
          variant: 'destructive'
        })
        return
      }

      const existingDocs = JSON.parse(localStorage.getItem(STAGE_DOCUMENTS_STORAGE_KEY) || '[]')
      const existingDocsMap = new Map(
        existingDocs.map(doc => [`${doc.taskId}-${doc.stageId}-${doc.documentId}`, doc])
      )

      const newDocs = []
      const duplicates = []

      const document = selectedStageTask.stage.documents?.find(d => d.id === docId)
      if (!document) {
        toast({
          title: 'Error',
          description: 'Document configuration not found',
          variant: 'destructive'
        })
        return
      }

      for (const file of fileArray) {
        if (!(file instanceof File)) {
          toast({
            title: 'Error',
            description: `Invalid file: ${file.name || 'Unknown file'}`,
            variant: 'destructive'
          })
          continue
        }

        let fileUrl = null
        try {
          fileUrl = URL.createObjectURL(file)
        } catch (urlError) {
          toast({
            title: 'Error',
            description: `Failed to process ${file.name}`,
            variant: 'destructive'
          })
          continue
        }

        const newDoc = {
          id: generateDocumentId(),
          taskId: selectedStageTask.task.id,
          stageId: selectedStageTask.stage.id,
          documentId: docId,
          documentName: document.name,
          documentType: document.type || 'document',
          file,
          fileUrl,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          extractedData: {},
          isRecent: true,
          uploadDate: new Date().toISOString(),
          status: 'pending',
          fields: document.extractionSpecs || []
        }

        const key = `${selectedStageTask.task.id}-${selectedStageTask.stage.id}-${docId}`
        if (existingDocsMap.has(key)) {
          duplicates.push(file.name)
          continue
        }

        const documentFields = getFieldsForDocument(docId)

        try {
          const extractionToast = toast({
            title: 'Extraction in progress',
            description: `Starting extraction for ${file.name}...`,
          })

          const { extractedData, success, message } = await performExtraction(
            fileUrl,
            documentFields,
            document.type || 'document',
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

          let mappedData = parsedData.rawData || parsedData || {}

          if (documentFields.length > 0) {
            const fieldMappedData = {}
            documentFields.forEach(field => {
              const fieldName = field.name
              const fieldKeys = [
                fieldName,
                fieldName.toLowerCase(),
                fieldName.replace(/[_\s]/g, ''),
                fieldName.replace(/[_\s]/g, '.'),
              ]

              const value = fieldKeys.reduce((val, key) => val || mappedData[key], undefined)
              if (value !== undefined) {
                fieldMappedData[fieldName] = value
              }
            })

            if (Object.keys(fieldMappedData).length > 0) {
              mappedData = fieldMappedData
            }
          }

          newDoc.extractedData = mappedData
          newDoc.status = success ? 'valid' : 'pending'

          if (success) {
            toast({
              title: 'Success',
              description: `Successfully extracted data from ${file.name}`,
            })
          } else {
            toast({
              title: 'Warning',
              description: `Partial data extracted from ${file.name}`,
              variant: 'destructive',
            })
          }
        } catch (extractError) {
          console.error('Extraction error:', extractError)
          toast({
            title: 'Error',
            description: `Extraction failed for ${file.name}: ${extractError.message}`,
            variant: 'destructive',
          })
          newDoc.status = 'pending'
        }

        newDocs.push(newDoc)
      }

      if (duplicates.length > 0) {
        toast({
          title: 'Warning',
          description: `Duplicate documents not uploaded: ${duplicates.join(', ')}`,
          variant: 'destructive',
        })
      }

      if (newDocs.length === 0) {
        toast({
          title: 'Error',
          description: duplicates.length > 0 ? 'All documents were duplicates' : 'No valid files were uploaded',
          variant: 'destructive'
        })
        return
      }

      setUploadedDocs(prev => ({
        ...prev,
        [docId]: [...(prev[docId] || []), ...newDocs]
      }))

      if (newDocs.length > 0) {
        const firstDoc = newDocs[0]
        setPreviewData(prev => ({
          ...prev,
          [docId]: {
            fileUrl: firstDoc.fileUrl,
            fileName: firstDoc.fileName,
            fileType: firstDoc.fileType,
            documentName: firstDoc.documentName,
            extractedData: firstDoc.extractedData
          }
        }))
      }
    } catch (error) {
      console.error('Error uploading files:', error)
      toast({
        title: 'Error',
        description: `Upload failed: ${error.message}`,
        variant: 'destructive',
      })
    }
  }

  // Handle file input change
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, docId: string) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      await handleFileUpload([file], docId)
    } finally {
      setUploading(false)
    }
  }

  // Handle message submission
  const handleMessageSubmit = async (message: string, docId: string) => {
    if (!selectedStageTask) return
    
    try {
      setUploading(true)
      setMessageTexts(prev => ({ ...prev, [docId]: message }))

      const document = selectedStageTask.stage.documents?.find(d => d.id === docId)
      if (!document) return

      const pdfBlob = await convertMessageToPDF(message, document.name)
      const pdfFile = new File([pdfBlob], `${document.name}_message.pdf`, { type: 'application/pdf' })

      await handleFileUpload([pdfFile], docId)

      toast({
        title: 'Success',
        description: 'Message processed successfully',
      })
    } catch (error) {
      console.error('Error processing message:', error)
      toast({
        title: 'Error',
        description: `Failed to process message: ${error.message}`,
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  // Handle data changes from ExtractionPreview
  const handleDataChange = (docId: string, fieldName: string, value: any) => {
    if (fieldName === 'save') {
      handleSaveDocument(docId, value)
    } else {
      setExtractedData(prev => ({
        ...prev,
        [docId]: {
          ...(prev[docId] || {}),
          [fieldName]: value
        }
      }))

      setPreviewData(prev => ({
        ...prev,
        [docId]: {
          ...prev[docId],
          extractedData: {
            ...(prev[docId]?.extractedData || {}),
            [fieldName]: value
          }
        }
      }))

      setUploadedDocs(prev => {
        if (prev[docId]) {
          return {
            ...prev,
            [docId]: prev[docId].map(doc => ({
              ...doc,
              extractedData: {
                ...doc.extractedData,
                [fieldName]: value
              }
            }))
          }
        }
        return prev
      })
    }
  }

  // Main data submission handler
  const handleDataSubmission = async (docId: string, saveData: any) => {
    if (!selectedStageTask) return
    
    try {
      setUploading(true)

      const docsToSave = uploadedDocs[docId] || []
      if (docsToSave.length === 0) {
        throw new Error('No documents to save')
      }

      const individual = {
        id: selectedStageTask.task.id,
        full_name: selectedStageTask.task.applicant_name || selectedStageTask.task.principal_member_name,
        first_name: selectedStageTask.task.applicant_name?.split(' ')[0],
        last_name: selectedStageTask.task.applicant_name?.split(' ').slice(-1)[0],
        r_number: selectedStageTask.task.r_number,
        passport_number: null,
        individual_type: selectedStageTask.task.renewal_status === 'New' ? 'principal' : 'dependent',
        relationship: 'Principal'
      }

      const registryMatch = await searchRegistryIndividuals(individual)

      if (registryMatch.exactMatch) {
        await submitDocumentsToDatabase(docsToSave, registryMatch.exactMatch, docId)
      } else if (registryMatch.fuzzyMatches && registryMatch.fuzzyMatches.length > 0) {
        setFuzzyMatchResults(registryMatch.fuzzyMatches)
        setPendingSubmission({ docsToSave, docId, originalIndividual: individual })
        setConfirmationDialogOpen(true)
        return
      } else {
        const newRegistryId = await createNewRegistryIndividual(individual)
        await submitDocumentsToDatabase(docsToSave, { id: newRegistryId }, docId)
      }

      await handleExistingSaveLogic(docId, docsToSave)
    } catch (error) {
      console.error('Error in data submission:', error)
      toast({
        title: 'Error',
        description: `Failed to submit documents: ${error.message}`,
        variant: "destructive"
      })
    } finally {
      setUploading(false)
    }
  }

  // Handle existing save logic for backward compatibility
  const handleExistingSaveLogic = async (docId: string, docsToSave: any[]) => {
    if (!selectedStageTask) return
    
    const existingDocs = JSON.parse(localStorage.getItem(STAGE_DOCUMENTS_STORAGE_KEY) || '[]')

    const processedUploads = docsToSave.map(doc => ({
      ...doc,
      status: 'valid',
      uploadDate: new Date().toISOString(),
      isRecent: true,
      file: undefined
    }))

    const updatedDocs = [...existingDocs, ...processedUploads]
    updateLocalStorage(STAGE_DOCUMENTS_STORAGE_KEY, updatedDocs)

    const stageStatuses = JSON.parse(localStorage.getItem(TASK_STAGE_STATUS_KEY) || '{}')
    const taskKey = `${selectedStageTask.task.id}`
    const currentTaskStatus = stageStatuses[taskKey] || {}

    currentTaskStatus[selectedStageTask.stage.id] = {
      ...currentTaskStatus[selectedStageTask.stage.id],
      [docId]: {
        status: 'completed',
        completedAt: new Date().toISOString(),
        documentsCount: processedUploads.length
      }
    }

    stageStatuses[taskKey] = currentTaskStatus
    updateLocalStorage(TASK_STAGE_STATUS_KEY, stageStatuses)

    setUploadedDocs(prev => ({
      ...prev,
      [docId]: []
    }))
  }

  // Handle document save with database submission
  const handleSaveDocument = async (docId: string, saveData: any) => {
    await handleDataSubmission(docId, saveData)
  }

  // Handle saving all documents
  const handleSaveAllDocuments = async () => {
    try {
      setUploading(true)

      const savePromises = Object.keys(uploadedDocs).map(docId => {
        if (uploadedDocs[docId].length > 0) {
          return handleDataSubmission(docId, { documents: uploadedDocs[docId] })
        }
        return Promise.resolve()
      })

      await Promise.all(savePromises)

      onOpenChange(false)

      setUploadedDocs({})
      setPreviewData({})
      setMessageTexts({})
      setExtractedData({})
    } catch (error) {
      console.error('Error saving all documents:', error)
      toast({
        title: 'Error',
        description: 'Failed to save some documents',
        variant: "destructive"
      })
    } finally {
      setUploading(false)
    }
  }

  // Re-extraction function
  const handleReExtraction = async (docId: string, docIndex: number) => {
    if (!selectedStageTask) return
    
    try {
      const docsForType = uploadedDocs[docId] || []
      const doc = docsForType[docIndex]

      if (!doc?.file) {
        toast({
          title: 'Error',
          description: 'Original file not found',
          variant: "destructive"
        })
        return
      }

      const document = selectedStageTask.stage.documents?.find(d => d.id === docId)
      if (!document) return

      const documentFields = document.extractionSpecs || []

      const progressToastId = toast({
        title: 'Re-extraction',
        description: "Starting re-extraction..."
      })

      const { extractedData, success, message } = await performExtraction(
        doc.fileUrl,
        documentFields,
        document.type || 'document',
        (progressMessage) => {
          console.log('Re-extraction progress:', progressMessage)
        },
        doc.fileName
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

      let mappedData = parsedData.rawData || {}

      if (!parsedData.rawData) {
        documentFields.forEach(field => {
          if (field.type === 'array' && field.isArray && field.arrayConfig?.fields) {
            const arrayFieldName = field.name
            const arrayData = parsedData[arrayFieldName] || []

            if (Array.isArray(arrayData)) {
              mappedData[arrayFieldName] = arrayData
            } else {
              const constructedArray = []
              const maxItems = field.arrayConfig.maxItems || 10

              for (let i = 0; i < maxItems; i++) {
                const itemData = {}
                let hasData = false

                field.arrayConfig.fields.forEach(subField => {
                  const possibleKeys = [
                    `${arrayFieldName}_${i + 1}_${subField.name}`,
                    `${arrayFieldName}[${i}].${subField.name}`,
                    `${arrayFieldName}.${i}.${subField.name}`,
                    `${arrayFieldName}[${i}][${subField.name}]`,
                    `${subField.name}`,
                    subField.name.toLowerCase(),
                    subField.name.replace(/[_\s]/g, '')
                  ]

                  const value = possibleKeys.reduce((val, key) =>
                    val || parsedData[key] ||
                    (typeof parsedData[arrayFieldName] === 'object' && parsedData[arrayFieldName][key]),
                    undefined
                  )

                  if (value !== undefined) {
                    itemData[subField.name] = value
                    hasData = true
                  }
                })

                if (hasData) {
                  constructedArray.push(itemData)
                }
              }

              if (constructedArray.length > 0) {
                mappedData[arrayFieldName] = constructedArray
              }
            }
          } else {
            const fieldKeys = [
              field.name,
              field.name.toLowerCase(),
              field.name.replace(/[_\s]/g, ''),
              field.name.replace(/[_\s]/g, '.'),
            ]

            const value = fieldKeys.reduce((val, key) => val || parsedData[key], undefined)
            if (value !== undefined) {
              mappedData[field.name] = value
            }
          }
        })
      }

      setUploadedDocs(prev => {
        const updatedDocs = { ...prev }
        if (updatedDocs[docId] && updatedDocs[docId][docIndex]) {
          updatedDocs[docId][docIndex] = {
            ...updatedDocs[docId][docIndex],
            extractedData: mappedData,
            status: success ? 'valid' : 'pending'
          }
        }
        return updatedDocs
      })

      setPreviewData(prev => ({
        ...prev,
        [docId]: {
          ...prev[docId],
          extractedData: mappedData
       }
     }))

     toast({
       title: 'Success',
       description: `Successfully re-extracted data from ${doc.fileName}`,
     })
   } catch (error) {
     console.error('Error during re-extraction:', error)
     toast({
       title: 'Error',
       description: `Re-extraction failed: ${error.message}`,
       variant: 'destructive',
     })
   }
 }

 // Fuzzy Match Confirmation Dialog Component
 const FuzzyMatchConfirmationDialog = () => {
   const handleConfirmMatch = async (selectedMatch: any) => {
     try {
       setUploading(true)
       await submitDocumentsToDatabase(
         pendingSubmission.docsToSave,
         selectedMatch,
         pendingSubmission.docId
       )
       await handleExistingSaveLogic(pendingSubmission.docId, pendingSubmission.docsToSave)

       setConfirmationDialogOpen(false)
       setPendingSubmission(null)
       setFuzzyMatchResults([])
     } catch (error) {
       console.error('Error confirming match:', error)
       toast({
         title: 'Error',
         description: `Failed to confirm match: ${error.message}`,
         variant: "destructive"
       })
     } finally {
       setUploading(false)
     }
   }

   const handleCreateNew = async () => {
     try {
       setUploading(true)
       const newRegistryId = await createNewRegistryIndividual(pendingSubmission.originalIndividual)
       await submitDocumentsToDatabase(
         pendingSubmission.docsToSave,
         { id: newRegistryId },
         pendingSubmission.docId
       )
       await handleExistingSaveLogic(pendingSubmission.docId, pendingSubmission.docsToSave)

       setConfirmationDialogOpen(false)
       setPendingSubmission(null)
       setFuzzyMatchResults([])
     } catch (error) {
       console.error('Error creating new individual:', error)
       toast({
         title: 'Error',
         description: `Failed to create new individual: ${error.message}`,
         variant: "destructive"
       })
     } finally {
       setUploading(false)
     }
   }

   return (
     <Dialog open={confirmationDialogOpen} onOpenChange={setConfirmationDialogOpen}>
       <DialogContent className="max-w-4xl">
         <DialogHeader>
           <DialogTitle>Confirm Individual Identity</DialogTitle>
           <DialogDescription>
             We found similar individuals in the registry. Please confirm if any of these match
             <strong> {pendingSubmission?.originalIndividual?.full_name}</strong>:
           </DialogDescription>
         </DialogHeader>

         <div className="space-y-4 max-h-96 overflow-y-auto">
           {fuzzyMatchResults.map((match) => (
             <div key={match.id} className="border rounded-lg p-4 hover:bg-gray-50">
               <div className="flex justify-between items-start">
                 <div className="space-y-2">
                   <h4 className="font-semibold">{match.full_name}</h4>
                   <div className="text-sm text-gray-600 space-y-1">
                     {match.r_number && <p><span className="font-medium">R-Number:</span> {match.r_number}</p>}
                     {match.passport_number && <p><span className="font-medium">Passport:</span> {match.passport_number}</p>}
                     {match.nationality && <p><span className="font-medium">Nationality:</span> {match.nationality}</p>}
                     {match.date_of_birth && <p><span className="font-medium">DOB:</span> {match.date_of_birth}</p>}
                   </div>
                 </div>
                 <Button
                   onClick={() => handleConfirmMatch(match)}
                   className="ml-4"
                   disabled={uploading}
                 >
                   {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                   Select This Person
                 </Button>
               </div>
             </div>
           ))}
         </div>

         <div className="flex justify-between pt-4 border-t">
           <Button
             variant="outline"
             onClick={() => setConfirmationDialogOpen(false)}
             disabled={uploading}
           >
             Cancel
           </Button>
           <Button
             onClick={handleCreateNew}
             disabled={uploading}
           >
             {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
             Create New Individual
           </Button>
         </div>
       </DialogContent>
     </Dialog>
   )
 }

 // Don't render anything if there's no selected stage task
 if (!selectedStageTask) {
   return null
 }

 const { task, stage } = selectedStageTask
 const activeDocument = stage?.documents?.find(d => d.id === activeDocumentTab)

 return (
   <>
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-7xl max-h-[95vh] overflow-y-auto">
         <DialogHeader>
           <DialogTitle>Upload Documents for {stage?.name}</DialogTitle>
           <DialogDescription>
             Upload required documents or submit messages to complete this stage.
           </DialogDescription>
         </DialogHeader>

         <Tabs
           value={activeDocumentTab}
           onValueChange={setActiveDocumentTab}
           className="w-full"
         >
           <TabsList className="w-full justify-start overflow-x-auto">
             {stage?.documents?.map((doc) => (
               <TabsTrigger
                 key={doc.id}
                 value={doc.id}
                 className="whitespace-nowrap"
               >
                 {doc.name}
                 {uploadedDocs[doc.id]?.length > 0 && (
                   <div className="ml-2 w-2 h-2 bg-green-500 rounded-full"></div>
                 )}
               </TabsTrigger>
             ))}
           </TabsList>

           {stage?.documents?.map((doc) => (
             <div
               key={doc.id}
               className={`mt-6 ${activeDocumentTab === doc.id ? 'block' : 'hidden'}`}
             >
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 {/* Left Panel - Document Upload/Message Input */}
                 <div className="space-y-4 lg:col-span-1">
                   <div className="space-y-4 p-4 rounded-lg border">
                     <div className="space-y-2">
                       <Label htmlFor={`file-${doc.id}`} className="font-medium">
                         {doc.description || `Upload ${doc.name}`}
                       </Label>
                       <Input
                         id={`file-${doc.id}`}
                         type="file"
                         accept="application/pdf,image/*"
                         onChange={(e) => handleFileChange(e, doc.id)}
                         className="cursor-pointer"
                         disabled={uploading}
                       />
                       <p className="text-sm text-muted-foreground">
                         {doc.required ? "Required" : "Optional"} • {doc.type}
                       </p>

                       {/* Upload Progress */}
                       {uploadProgress[doc.id] > 0 && uploadProgress[doc.id] < 100 && (
                         <div className="w-full bg-gray-200 rounded-full h-2">
                           <div
                             className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                             style={{ width: `${uploadProgress[doc.id]}%` }}
                           />
                         </div>
                       )}
                     </div>

                     <div className="relative">
                       <div className="relative flex items-center">
                         <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                           <MessageSquare className="h-4 w-4 text-muted-foreground" />
                         </div>
                         <Textarea
                           placeholder={`Or type a message for ${doc.name}...`}
                           className="pl-10 min-h-[100px]"
                           value={messageTexts[doc.id] || ''}
                           onChange={(e) => setMessageTexts(prev => ({ ...prev, [doc.id]: e.target.value }))}
                           disabled={uploading}
                         />
                       </div>
                       <Button
                         className="mt-2 w-full"
                         onClick={() => handleMessageSubmit(messageTexts[doc.id] || '', doc.id)}
                         disabled={!messageTexts[doc.id]?.trim() || uploading}
                       >
                         {uploading ? (
                           <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                         ) : (
                           <Send className="mr-2 h-4 w-4" />
                         )}
                         Submit Message
                       </Button>
                     </div>
                   </div>
                 </div>

                 {/* Right Panel - Preview and Extracted Data */}
                 <div className="lg:col-span-2">
                   {uploadedDocs[doc.id]?.length > 0 ? (
                     <div className="space-y-6">
                       {uploadedDocs[doc.id].map((uploadedDoc, index) => (
                         <div key={uploadedDoc.id} className="relative bg-gray-50 rounded-lg p-4 border">
                           <div className="flex justify-between items-start mb-4">
                             <span className="inline-flex items-center justify-center bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                               Upload #{index + 1}
                             </span>
                             <div className="flex gap-2">
                               <Button
                                 variant="ghost"
                                 size="sm"
                                 className="text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                                 onClick={() => handleReExtraction(doc.id, index)}
                               >
                                 <RotateCw className="h-4 w-4" />
                               </Button>
                               <Button
                                 variant="ghost"
                                 size="sm"
                                 className="text-red-600 hover:text-red-800 hover:bg-red-100"
                                 onClick={() => {
                                   setUploadedDocs(prev => ({
                                     ...prev,
                                     [doc.id]: prev[doc.id].filter((_, i) => i !== index)
                                   }))
                                 }}
                               >
                                 <Trash2 className="h-4 w-4" />
                               </Button>
                             </div>
                           </div>
                           <ExtractionPreview
                             documentName={doc.name}
                             extractedData={uploadedDoc.extractedData || {}}
                             fields={getFieldsForDocument(doc.id)}
                             onDataChange={(fieldName, value) => handleDataChange(doc.id, fieldName, value)}
                             fileUrl={uploadedDoc.fileUrl}
                             fileName={uploadedDoc.fileName}
                             expanded={true}
                             showSaveButton={false}
                             type={doc.type || 'document'}
                             file={uploadedDoc.file}
                           />
                         </div>
                       ))}
                     </div>
                   ) : previewData[doc.id] ? (
                     <ExtractionPreview
                       documentName={doc.name}
                       extractedData={previewData[doc.id].extractedData || {}}
                       fields={getFieldsForDocument(doc.id)}
                       onDataChange={(fieldName, value) => handleDataChange(doc.id, fieldName, value)}
                       fileUrl={previewData[doc.id].fileUrl}
                       fileName={previewData[doc.id].fileName}
                       expanded={true}
                       showSaveButton={false}
                       type={doc.type || 'document'}
                     />
                   ) : (
                     <div className="border rounded-lg p-8 text-center bg-gray-50">
                       <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
                       <p className="text-muted-foreground mb-2">No document uploaded yet</p>
                       <p className="text-sm text-muted-foreground">
                         Upload a file or submit a message to see the preview and extracted data
                       </p>
                     </div>
                   )}
                 </div>
               </div>
             </div>
           ))}
         </Tabs>

         <div className="flex justify-end gap-2 pt-4 border-t">
           <Button
             variant="outline"
             onClick={() => onOpenChange(false)}
             disabled={uploading}
           >
             Close
           </Button>
           <Button
             onClick={handleSaveAllDocuments}
             disabled={uploading || Object.values(uploadedDocs).every(docs => docs.length === 0)}
           >
             {uploading ? (
               <>
                 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                 Saving...
               </>
             ) : (
               'Save All Documents'
             )}
           </Button>
         </div>
       </DialogContent>
     </Dialog>
     <FuzzyMatchConfirmationDialog />
   </>
 )
}