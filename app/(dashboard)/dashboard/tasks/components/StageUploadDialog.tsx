// @ts-nocheck
"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, Send, FileText, RotateCw, Trash2, MessageSquare, Upload, Star, AlertTriangle } from "lucide-react"
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
  selectedStageTask: {
    task: any,
    stage: any,
    childLevelId?: string,
    childLevelType?: 'subdepartment' | 'class' | 'subclass'
  } | null
  getCurrentRequirements: () => any[]
  fuzzyMatch: (str1: string, str2: string, threshold?: number) => boolean
  onTaskAction?: (action: { type: string; taskId: string | number; [key: string]: any }) => void
}

// Recursive helper to transform KYC fields, handling nested arrays
const transformKycFields = (fields: any[]): any[] => {
  if (!Array.isArray(fields)) return []

  return fields.map((field: any) => {
    const isArray = field.type === 'array' || field.isArray === true

    const transformedField: any = {
      id: field.id || field.fieldName || '',
      fieldName: field.name || field.fieldName || '',
      description: field.description || '',
      isRequired: field.isRequired !== false,
      fieldType: isArray ? 'array' : (field.type || field.fieldType || 'text'),
      parentField: field.parentField,
      isArray: isArray,
    }

    if (isArray && field.arrayConfig && Array.isArray(field.arrayConfig.fields)) {
      transformedField.arrayConfig = {
        maxItems: field.arrayConfig.maxItems,
        fields: transformKycFields(field.arrayConfig.fields)
      }
    }

    return transformedField
  })
}

// Helper function to check if document is older than task creation
const isDocumentOlderThanTask = (documentDate: string, taskDate: string): boolean => {
  try {
    const docDate = new Date(documentDate)
    const tskDate = new Date(taskDate)
    return docDate < tskDate
  } catch (error) {
    console.error('Error comparing dates:', error)
    return false
  }
}

// Separate component for Fuzzy Match Confirmation Dialog
const FuzzyMatchConfirmationDialog = ({ 
  open, 
  onOpenChange, 
  fuzzyMatchResults, 
  pendingSubmission, 
  uploading, 
  onConfirmMatch, 
  onCreateNew 
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                  onClick={() => onConfirmMatch(match)}
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
            onClick={() => onOpenChange(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            onClick={onCreateNew}
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

export function StageUploadDialog({
  open,
  onOpenChange,
  selectedStageTask,
  getCurrentRequirements,
  fuzzyMatch,
  onTaskAction
}: StageUploadDialogProps) {

  
  // All useState hooks first
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File>>({})
  const [messageTexts, setMessageTexts] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [activeDocumentTab, setActiveDocumentTab] = useState<string>('')
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, any[]>>({})
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [existingDocuments, setExistingDocuments] = useState<Record<string, any[]>>({})
  const [kycDocuments, setKycDocuments] = useState<Map<string, any>>(new Map())
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false)
  const [fuzzyMatchResults, setFuzzyMatchResults] = useState<any[]>([])
  const [pendingSubmission, setPendingSubmission] = useState<any>(null)

  // All useRef hooks
  const documentFieldsCache = useRef(new Map())
  const blobUrlsRef = useRef<Set<string>>(new Set())

  // All useEffect hooks
  useEffect(() => {
    documentFieldsCache.current.clear()
  }, [selectedStageTask])

  useEffect(() => {
    if (open && selectedStageTask) {
      fetchExistingDocuments()
    }
  }, [open, selectedStageTask])

  useEffect(() => {
    if (!open) {
      // Clean up blob URLs
      blobUrlsRef.current.forEach(url => {
        try {
          URL.revokeObjectURL(url)
        } catch (e) {
          console.warn('Failed to revoke blob URL:', url)
        }
      })
      blobUrlsRef.current.clear()
      
      setActiveDocumentTab('')
      setUploadedDocs({})
      setMessageTexts({})
      setExistingDocuments({})
      setConfirmationDialogOpen(false)
      setFuzzyMatchResults([])
      setPendingSubmission(null)
      documentFieldsCache.current.clear()
    }
  }, [open])

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => {
        try {
          URL.revokeObjectURL(url)
        } catch (e) {
          console.warn('Failed to revoke blob URL:', url)
        }
      })
      blobUrlsRef.current.clear()
    }
  }, [])

  // All useCallback hooks
  const fetchKycDocument = useCallback(async (kycId: string) => {
    console.log('Fetching KYC document for ID:', kycId)
    
    return new Promise((resolve) => {
      setKycDocuments(currentDocs => {
        if (currentDocs.has(kycId)) {
          console.log('KYC document found in cache:', currentDocs.get(kycId))
          resolve(currentDocs.get(kycId))
          return currentDocs
        }

        console.log('Fetching KYC document from database...')
        supabase
          .from('acc_portal_kyc')
          .select('id, fields, name, display_name')
          .eq('id', kycId)
          .single()
          .then(({ data, error }) => {
            if (error) {
              console.error('Error fetching KYC document:', error)
              resolve(null)
              return
            }

            console.log('Raw KYC data from database:', data)

            const transformedDoc = {
              ...data,
              fields: transformKycFields(data.fields || [])
            }

            console.log('Transformed KYC document:', transformedDoc)

            setKycDocuments(prev => new Map(prev.set(kycId, transformedDoc)))
            resolve(transformedDoc)
          })
          .catch(error => {
            console.error('Error fetching KYC document:', error)
            resolve(null)
          })

        return currentDocs
      })
    })
  }, [])

  const fetchExistingDocuments = useCallback(async () => {
    if (!selectedStageTask?.task?.individual_id || !selectedStageTask?.stage?.documents) {
      setExistingDocuments({})
      return
    }

    try {
      const { data: documents, error } = await supabase
        .from('acc_portal_directors_documents')
        .select('*')
        .eq('director_id', selectedStageTask.task.individual_id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching existing documents:', error)
        return
      }

      const groupedDocs: Record<string, any[]> = {}
      
      const kycDocPromises = selectedStageTask.stage.documents.map(async (stageDoc) => {
        if (stageDoc.kycId) {
          const kycDoc = await fetchKycDocument(stageDoc.kycId)
          return { 
            ...stageDoc,
            kycData: kycDoc
          }
        }
        return stageDoc
      })

      const stageDocsWithKyc = await Promise.all(kycDocPromises)

      stageDocsWithKyc.forEach(stageDoc => {
        if (stageDoc.kycId) {
          const docsForType = documents?.filter(doc => doc.document_id === stageDoc.kycId) || []
          if (docsForType.length > 0) {
            groupedDocs[stageDoc.id] = docsForType
          }
        }
      })
      
      console.log('Existing documents fetched:', groupedDocs)
      setExistingDocuments(groupedDocs)
    } catch (error) {
      console.error('Error fetching existing documents:', error)
      setExistingDocuments({})
    }
  }, [
    selectedStageTask?.task?.individual_id,
    selectedStageTask?.stage?.documents?.length,
    fetchKycDocument
  ])

  const getFieldsForDocument = useCallback(async (docId: string) => {
    if (documentFieldsCache.current.has(docId)) {
      return documentFieldsCache.current.get(docId)
    }

    if (!selectedStageTask?.stage?.documents) return []

    const document = selectedStageTask.stage.documents.find(d => d.id === docId)
    if (!document) return []

    let fields = []

    if (document.kycId) {
      try {
        const kycDoc = await fetchKycDocument(document.kycId);
        if (kycDoc?.fields?.length > 0) {
          fields = kycDoc.fields.map((field: any) => ({
            id: field.id || field.fieldName,
            name: field.fieldName,
            type: field.fieldType,
            required: field.isRequired,
            description: field.description,
            isArray: field.isArray,
            arrayConfig: field.arrayConfig
          }))
        }
      } catch (error) {
        console.error('Error getting fields from KYC document:', error)
      }
    }

    if (fields.length === 0 && document.extractionSpecs) {
      fields = document.extractionSpecs.map(spec => ({
        id: spec.id || spec.fieldName || `field-${Date.now()}`,
        name: spec.fieldName || spec.name || 'Unknown Field',
        type: spec.fieldType || spec.type || 'text',
        required: spec.isRequired || spec.required || false,
        isArray: spec.isArray || false,
        arrayConfig: spec.arrayConfig
      }))
    }

    documentFieldsCache.current.set(docId, fields)
    return fields
  }, [selectedStageTask?.stage?.documents, fetchKycDocument])

  const getDocumentInputType = useCallback((doc: any): 'file' | 'message' | 'both' => {
    if (doc.inputType) {
      return doc.inputType;
    }

    if (doc.isSpecial) {
      return 'file';
    }

    return 'both';
  }, [])

  const getDocumentDisplayName = useCallback((doc: any): string => {
    if (!doc.kycId) {
      return doc.name || 'Document'
    }
    
    const kycData = kycDocuments.get(doc.kycId)
    return kycData?.display_name || kycData?.name || doc.name || 'Document'
  }, [kycDocuments])

  const isDocumentApplicableToTask = useCallback((doc: any, task: any) => {
    if (!doc.isSpecial) {
      return true;
    }

    if (doc.targetEntities && Array.isArray(doc.targetEntities) && doc.targetEntities.length > 0) {
      const matchesTarget = doc.targetEntities.some((entity: any) => {
        const classMatch = entity.class_id ?
          entity.class_id.toString() === task.class_id?.toString() :
          true;
        const subdeptMatch = entity.subdept_id ?
          entity.subdept_id.toString() === task.subdepartment?.id?.toString() :
          true;
        return classMatch && subdeptMatch;
      });

      if (doc.targetEntities.length > 0 && !matchesTarget) {
        return false;
      }

      if (matchesTarget) {
        return true;
      }
    }

    const taskClassId = task.class_id?.toString();
    const taskSubdeptId = task.subdepartment?.id?.toString();
    const docClassId = doc.class_id?.toString();
    const docSubdeptId = doc.subdept_id?.toString();

    if (docClassId) { 
      if (docClassId !== taskClassId) {
        return false;
      }

      if (docSubdeptId && docSubdeptId !== taskSubdeptId) {
        return false;
      }

      return true;
    }

    if (docSubdeptId) {
      const matches = docSubdeptId === taskSubdeptId;
      return matches;
    }

    if (selectedStageTask?.childLevelId && selectedStageTask?.childLevelType) {
      const childLevelId = selectedStageTask.childLevelId;
      const childLevelType = selectedStageTask.childLevelType;

      if (doc[`${childLevelType}_id`] && doc[`${childLevelType}_id`].toString() !== childLevelId) {
        return false;
      }

      if (childLevelType === 'subclass' && doc.class_id && doc.class_id.toString() !== taskClassId) {
        return false;
      }

      if (childLevelType === 'class' && doc.subdept_id && doc.subdept_id.toString() !== taskSubdeptId) {
        return false;
      }
    }

    if (doc.entityType === 'class' && doc.class_id) {
      const classMatch = task.class_id?.toString() === doc.class_id.toString();

      if (doc.subdept_id) {
        const subdeptMatch = task.subdepartment?.id?.toString() === doc.subdept_id.toString();
        return classMatch && subdeptMatch;
      }

      return classMatch;
    }

    if (doc.entityType === 'subdept' && doc.subdept_id) {
      const result = task.subdepartment?.id?.toString() === doc.subdept_id?.toString()
      return result
    }

    if (doc.entityType === 'subclass' && doc.subclass_id && doc.class_id && doc.subdept_id) {
      const result = (
        task.subdepartment?.id?.toString() === doc.subdept_id?.toString() &&
        task.class_id?.toString() === doc.class_id?.toString() &&
        task.subclass_id?.toString() === doc.subclass_id?.toString()
      )
      return result
    }

    if (doc.class_id && doc.subdept_id) {
      const result = (
        task.subdepartment?.id?.toString() === doc.subdept_id?.toString() &&
        task.class_id?.toString() === doc.class_id?.toString()
      )
      return result
    }

    if (doc.subdept_id && !doc.class_id) {
      const result = task.subdepartment?.id?.toString() === doc.subdept_id?.toString()
      return result
    }

    return false
  }, [selectedStageTask])

  const generateDocumentId = useCallback(() => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36)
  }, [])

  const updateLocalStorage = useCallback((key: string, value: any) => {
    localStorage.setItem(key, JSON.stringify(value))
    window.dispatchEvent(new Event('localStorageChange'))
  }, [])

  const searchRegistryIndividuals = useCallback(async (individual: any) => {
    try {
      console.log('Searching registry for individual:', individual)

      let exactMatch = null
      let fuzzyMatches = []

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
  }, [fuzzyMatch])
  
  const uploadFileToStorage = useCallback(async (file: File, individualId: number, documentName: string, documentKycId: string): Promise<string> => {
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
  
      // Get the document name from KYC document
      const { data: kycDoc, error: kycError } = await supabase
        .from('acc_portal_kyc')
        .select('name')
        .eq('id', documentKycId)
        .single()
  
      if (kycError) {
        throw new Error(`Failed to get document name: ${kycError.message}`)
      }
  
      const normalizedName = individual.data.full_name
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
      
      // FIXED: Properly normalize document name with spaces converted to underscores
      const normalizedDocName = (kycDoc?.name || documentName || 'document')
        .toLowerCase()
        .replace(/\s+/g, '_')  // Replace spaces with underscores
        .replace(/[^a-z0-9_]/g, '') // Remove special characters except underscores
  
      const filename = `individual-documents/${normalizedName}/${normalizedDocName}/${file.name}`
  
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
  }, [])

  const createNewRegistryIndividual = useCallback(async (individual: any): Promise<number> => {
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
  }, [selectedStageTask])

  const submitDocumentsToDatabase = useCallback(async (documents: any[], registryIndividual: any, docId: string) => {
    try {
      console.log('=== Starting document submission ===')
      console.log('Documents to submit:', documents.map(doc => ({
        fileName: doc.fileName,
        extractedData: doc.extractedData,
        extractedDataKeys: Object.keys(doc.extractedData || {}),
        hasFile: !!doc.file
      })))
  
      if (!selectedStageTask?.task?.individual_id) {
        throw new Error('No individual ID found in task')
      }
  
      const submittedDocIds = []
      const documentConfig = selectedStageTask?.stage?.documents?.find(d => d.id === docId)
      const documentKycId = documentConfig?.kycId
      const documentName = documentConfig?.name || 'document'
  
      if (!documentKycId) {
        throw new Error('Document configuration not found or missing kycId')
      }
  
      const { data: individual, error: individualError } = await supabase
        .from('registry_individuals')
        .select('*')
        .eq('id', selectedStageTask.task.individual_id)
        .single()
  
      if (individualError) {
        throw new Error(`Failed to fetch individual details: ${individualError.message}`)
      }
  
      const existingDocs = existingDocuments[docId] || []
      
      if (existingDocs.length > 0) {
        console.log(`Found ${existingDocs.length} existing documents to replace`)
        
        const updatePromises = existingDocs.map(existingDoc => 
          supabase
            .from('acc_portal_directors_documents')
            .update({ 
              status: 'replaced',
              updated_at: new Date().toISOString()
            })
            .eq('id', existingDoc.id)
        )
        
        await Promise.all(updatePromises)
        console.log('Marked existing documents as replaced')
      }
  
      for (const [index, doc] of documents.entries()) {
        // FIXED: Use the document's extractedData directly (no additional processing needed)
        const extractedDetails = doc.extractedData || {}
        
        console.log(`Submitting document ${index + 1}:`, {
          fileName: doc.fileName,
          extractedData: extractedDetails,
          extractedDataKeys: Object.keys(extractedDetails)
        })
  
        const filename = await uploadFileToStorage(doc.file, selectedStageTask.task.individual_id, documentName, documentKycId)
        
        const documentRecord = {
          director_id: selectedStageTask.task.individual_id,
          document_id: documentKycId,
          file_path: filename,
          extracted_details: extractedDetails, // This should now contain the correct data
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
  
        console.log('Document record to insert:', documentRecord)
  
        const { data: insertedDoc, error: insertError } = await supabase
          .from('acc_portal_directors_documents')
          .insert(documentRecord)
          .select()
          .single()
  
        if (insertError) {
          throw new Error(`Failed to save document record: ${insertError.message}`)
        }
  
        submittedDocIds.push(insertedDoc.id)
        console.log(`Successfully submitted document with ID: ${insertedDoc.id}`)
      }
  
      await fetchExistingDocuments()
  
      toast({
        title: 'Success',
        description: `${documents.length} document(s) submitted successfully with extracted data`
      })
  
      return submittedDocIds
    } catch (error) {
      console.error('=== Document submission failed ===', error)
      throw error
    }
  }, [selectedStageTask, existingDocuments, fetchExistingDocuments, uploadFileToStorage])
  
  const convertMessageToPDF = useCallback(async (message: string, documentName: string): Promise<Blob> => {
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
  }, [])

  const handleFileUpload = useCallback(async (files: File[] | File, docId: string) => {
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
 
      const existingDocs = JSON.parse(localStorage.getItem('stageDocuments') || '[]')
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
          blobUrlsRef.current.add(fileUrl) // Track blob URL for cleanup
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
 
        const isDuplicateInSession = Object.values(uploadedDocs[docId] || {}).some(
          (uploadedDoc: any) => uploadedDoc.fileName === file.name && 
          uploadedDoc.fileSize === file.size &&
          uploadedDoc.uploadDate > (Date.now() - 60000)
        )
        
        if (isDuplicateInSession) {
          duplicates.push(file.name)
          continue
        }
 
        const documentFields = await getFieldsForDocument(docId)
 
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
            file.name,
            document.kycId
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
 
          const mappedData = parsedData.rawData || parsedData || {}
          const finalExtractedData = {};
          documentFields.forEach(field => {
            const fieldName = field.name;
            const extractedValue = mappedData[fieldName];
            
            if (field.isArray) {
              finalExtractedData[fieldName] = Array.isArray(extractedValue) ? extractedValue : [];
            } else {
              finalExtractedData[fieldName] = extractedValue ?? '';
            }
          });

          newDoc.extractedData = finalExtractedData;
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
 
    } catch (error) {
      console.error('Error uploading files:', error)
      toast({
        title: 'Error',
        description: `Upload failed: ${error.message}`,
        variant: 'destructive',
      })
    }
  }, [selectedStageTask, generateDocumentId, getFieldsForDocument, uploadedDocs])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, docId: string) => {
    const file = e.target.files?.[0]
    if (!file) return
 
    setUploading(true)
    try {
      await handleFileUpload([file], docId)
    } finally {
      setUploading(false)
    }
  }, [handleFileUpload])

  const handleMessageSubmit = useCallback(async (message: string, docId: string) => {
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
  }, [selectedStageTask, convertMessageToPDF, handleFileUpload])

  // FIXED: Simplified data change handler that directly updates the uploadedDocs state
  const handleDataChange = useCallback((docId: string, docIndex: number, fieldName: string, value: any) => {
    console.log(`📝 Data change event in StageUploadDialog:`, {
      docId,
      docIndex,
      fieldName,
      value,
      valueType: typeof value,
      timestamp: new Date().toISOString()
    })
  
    setUploadedDocs(prev => {
      const updatedDocsForId = [...(prev[docId] || [])];
      
      if (updatedDocsForId[docIndex]) {
        const existingExtractedData = updatedDocsForId[docIndex].extractedData || {}
        
        // FIXED: Process the value to ensure it's stored correctly
        const processedValue = value === null || value === undefined ? '' : String(value);
        
        const updatedExtractedData = {
          ...existingExtractedData,
          [fieldName]: processedValue,
        }
  
        updatedDocsForId[docIndex] = {
          ...updatedDocsForId[docIndex],
          extractedData: updatedExtractedData,
          lastModified: new Date().toISOString()
        };
  
        console.log(`✅ Updated document data in StageUploadDialog:`, {
          docId,
          docIndex,
          fieldName,
          previousValue: existingExtractedData[fieldName],
          newValue: processedValue,
          allExtractedData: updatedExtractedData,
          extractedDataKeys: Object.keys(updatedExtractedData)
        })
  
        return {
          ...prev,
          [docId]: updatedDocsForId,
        };
      }
      
      console.warn(`⚠️ Document not found for update:`, { docId, docIndex })
      return prev;
    });
  }, [])

  // FIXED: Create stable callbacks that are properly memoized
  const stableCallbacks = useMemo(() => {
    const callbacks: Record<string, (fieldName: string, value: any) => void> = {};
    
    Object.keys(uploadedDocs).forEach(docId => {
      uploadedDocs[docId].forEach((_, index) => {
        const key = `${docId}-${index}`;
        callbacks[key] = (fieldIdentifier: string, value: any) => {
          console.log(`📝 StableCallback triggered:`, {
            docId,
            index,
            fieldIdentifier,
            value,
            valueType: typeof value
          });
          
          handleDataChange(docId, index, fieldIdentifier, value);
        };
      });
    });
    
    return callbacks;
  }, [Object.keys(uploadedDocs).map(k => `${k}:${uploadedDocs[k].length}`).join(','), handleDataChange]);
  
  const handleExistingSaveLogic = useCallback(async (docId: string, docsToSave: any[]) => {
    if (!selectedStageTask) return
 
    const existingDocs = JSON.parse(localStorage.getItem('stageDocuments') || '[]')
 
    const processedUploads = docsToSave.map(doc => ({
      ...doc,
      status: 'valid',
      uploadDate: new Date().toISOString(),
      isRecent: true,
      file: undefined
    }))
 
    const updatedDocs = [...existingDocs, ...processedUploads]
    updateLocalStorage('stageDocuments', updatedDocs)
 
    const stageStatuses = JSON.parse(localStorage.getItem('taskStageStatuses') || '{}')
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
    updateLocalStorage('taskStageStatuses', stageStatuses)
 
    setUploadedDocs(prev => ({
      ...prev,
      [docId]: []
    }))
  }, [selectedStageTask, updateLocalStorage])

  // FIXED: Simplified data submission without DOM manipulation
  const handleDataSubmission = useCallback(async (docId: string, saveData: any) => {
    if (!selectedStageTask) return
   
    try {
      setUploading(true)
   
      // FIXED: Get current documents from state directly
      const docsToSave = uploadedDocs[docId] || []
      if (docsToSave.length === 0) {
        throw new Error('No documents to save')
      }
  
      console.log('🚀 Starting data submission (FIXED VERSION):', {
        docId,
        documentsCount: docsToSave.length,
        documentsData: docsToSave.map(doc => ({
          fileName: doc.fileName,
          extractedDataKeys: Object.keys(doc.extractedData || {}),
          extractedData: doc.extractedData,
          lastModified: doc.lastModified
        }))
      })
  
      // Use the existing individual_id from the task
      const individualId = selectedStageTask.task.individual_id
      if (!individualId) {
        throw new Error('No individual ID found in task')
      }
  
      // FIXED: Submit documents directly with their current extractedData
      await submitDocumentsToDatabase(docsToSave, { id: individualId }, docId)
      await handleExistingSaveLogic(docId, docsToSave)
  
      console.log('✅ Data submission completed successfully')
    } catch (error) {
      console.error('❌ Error in data submission:', error)
      toast({
        title: 'Error',
        description: `Failed to submit documents: ${error.message}`,
        variant: "destructive"
      })
    } finally {
      setUploading(false)
    }
  }, [selectedStageTask, uploadedDocs, submitDocumentsToDatabase, handleExistingSaveLogic])

  const handleSaveDocument = useCallback(async (docId: string, saveData: any) => {
    try {
      await handleDataSubmission(docId, saveData)
      if (selectedStageTask?.task?.id) {
        onTaskAction?.({
          type: 'refresh',
          taskId: selectedStageTask.task.id,
          timestamp: Date.now()
        })
        
        if (onTaskAction) {
          onTaskAction({ type: 'refresh-data' })
        }
      }
    } catch (error) {
      console.error('Error saving document:', error)
      throw error
    }
  }, [handleDataSubmission, selectedStageTask, onTaskAction])

  const handleSaveAllDocuments = useCallback(async () => {
    try {
      setUploading(true)
 
      const savePromises = Object.keys(uploadedDocs).map(docId => {
        if (uploadedDocs[docId].length > 0) {
          return handleDataSubmission(docId, { documents: uploadedDocs[docId] })
        }
        return Promise.resolve()
      })
 
      await Promise.all(savePromises)
 
      if (selectedStageTask?.task?.id && onTaskAction) {
        onTaskAction({ 
          type: 'refresh',
          taskId: selectedStageTask.task.id,
          timestamp: Date.now()
        })
        onTaskAction({ type: 'refresh-data' })
      }
 
      onOpenChange(false)
 
      setUploadedDocs({})
      setMessageTexts({})
      setExistingDocuments({})
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
  }, [uploadedDocs, handleDataSubmission, selectedStageTask, onTaskAction, onOpenChange])

  const handleReExtraction = useCallback(async (docId: string, docIndex: number) => {
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
 
      const documentFields = await getFieldsForDocument(docId)
 
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
        doc.fileName,
        document.kycId
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
 
      const mappedData = parsedData.rawData || parsedData || {};
      const finalExtractedData = {};
      documentFields.forEach(field => {
        const value = mappedData[field.name];
        if (field.isArray) {
          finalExtractedData[field.name] = Array.isArray(value) ? value : [];
        } else {
          finalExtractedData[field.name] = value ?? '';
        }
      });
 
      setUploadedDocs(prev => {
        const updatedDocs = { ...prev }
        if (updatedDocs[docId] && updatedDocs[docId][docIndex]) {
          updatedDocs[docId][docIndex] = {
            ...updatedDocs[docId][docIndex],
            extractedData: finalExtractedData,
            status: success ? 'valid' : 'pending'
          }
        }
        return updatedDocs
      })
 
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
  }, [selectedStageTask, uploadedDocs, getFieldsForDocument])

  const renderExistingDocumentStatus = useCallback((doc: any) => {
    const existingDocs = existingDocuments[doc.id] || []
    
    if (existingDocs.length === 0) {
      return null
    }

    const mostRecentDoc = existingDocs[0]
    const isOldDocument = selectedStageTask?.task?.created_at && 
      isDocumentOlderThanTask(mostRecentDoc.created_at, selectedStageTask.task.created_at)
    const hasIndicator = mostRecentDoc.indicator === true

    return (
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h4 className="text-sm font-medium text-blue-900 mb-1">
              Existing Documents ({existingDocs.length})
            </h4>
            <div className="space-y-1">
              {existingDocs.slice(0, 3).map((existingDoc, index) => {
                const docIsOld = selectedStageTask?.task?.created_at && 
                  isDocumentOlderThanTask(existingDoc.created_at, selectedStageTask.task.created_at)
                const docHasIndicator = existingDoc.indicator === true
                
                return (
                  <div key={existingDoc.id} className="flex items-center gap-2 text-xs">
                    <span className="text-blue-700">
                      {existingDoc.file_path?.split('/').pop() || getDocumentDisplayName(doc)}
                    </span>
                    {docIsOld && (
                      <div className="flex items-center gap-1 text-orange-600">
                        <AlertTriangle className="h-3 w-3" />
                        <span>Old</span>
                      </div>
                    )}
                    {docHasIndicator && (
                      <Badge variant="outline" className="text-xs px-1">
                        No Preview
                      </Badge>
                    )}
                    {!docIsOld && !docHasIndicator && (
                      <Badge variant="default" className="text-xs px-1 bg-green-100 text-green-800">
                        Active
                      </Badge>
                    )}
                  </div>
                )
              })}
              {existingDocs.length > 3 && (
                <p className="text-xs text-blue-600">
                  +{existingDocs.length - 3} more documents
                </p>
              )}
            </div>
          </div>
          {isOldDocument && (
            <div className="flex items-center gap-1 text-orange-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs">Latest document is old</span>
            </div>
          )}
        </div>
        
        {(isOldDocument || hasIndicator) && (
          <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs">
            {isOldDocument && (
              <p className="text-orange-700 mb-1">
                ⚠️ Most recent document is older than task creation - uploading new document recommended
              </p>
            )}
            {hasIndicator && (
              <p className="text-orange-700">
                ⚠️ Most recent document has restricted preview access
              </p>
            )}
          </div>
        )}
      </div>
    )
  }, [existingDocuments, selectedStageTask, getDocumentDisplayName])

  const renderInputSection = useCallback((doc: any) => {
    const documentName = getDocumentDisplayName(doc)
    const inputType = getDocumentInputType(doc);
    const isSpecialDocument = doc.isSpecial;
    const documentType = doc.documentType || 'both';
    const existingDocs = existingDocuments[doc.id] || []
    const hasExistingDocs = existingDocs.length > 0

    return (
      <div className="space-y-4 p-4 rounded-lg border">
        {renderExistingDocumentStatus(doc)}

        {isSpecialDocument && (
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <Star className="h-5 w-5 text-amber-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-amber-700">
                  {doc.entityName ?
                    `This document is specific to ${doc.entityName}` :
                    'This is a special document with specific requirements'}
                </p>
              </div>
            </div>
          </div>
        )}

        {(inputType === 'file' || inputType === 'both') && (
          <div className="space-y-2">
            <Label htmlFor={`file-${doc.id}`} className="font-medium flex items-center gap-2">
              <Upload className="h-4 w-4" />
              {inputType === 'both' ? 'Upload File' : doc.description || `Upload ${documentName}`}
              {hasExistingDocs && (
                <Badge variant="secondary" className="text-xs">
                  Will replace existing
                </Badge>
              )}
            </Label>
            <Input
              id={`file-${doc.id}`}
              type="file"
              accept={documentType === 'both' ? "application/pdf,image/*" :
                documentType === 'upload' ? "application/pdf,image/*" :
                  documentType === 'extraction' ? "application/pdf" : "application/pdf,image/*"}
              onChange={(e) => handleFileChange(e, doc.id)}
              className="cursor-pointer"
              disabled={uploading}
            />
            <p className="text-sm text-muted-foreground">
              {doc.isRequired ? "Required" : "Optional"} •
              {documentType === 'both' ? "Accepts PDF and image files" :
                documentType === 'upload' ? "Upload document only (PDF/Images)" :
                  documentType === 'extraction' ? "PDF only (data extraction required)" :
                    "Accepts PDF and image files"}
              {hasExistingDocs && " • New upload will replace existing documents"}
            </p>

            {uploadProgress[doc.id] > 0 && uploadProgress[doc.id] < 100 && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress[doc.id]}%` }}
                />
              </div>
            )}
          </div>
        )}

        {inputType === 'both' && (
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>
        )}

        {(inputType === 'message' || inputType === 'both') && (
          <div className="space-y-2">
            <Label className="font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              {inputType === 'both' ? 'Submit Message/Text' : doc.description || `Enter ${documentName}`}
              {hasExistingDocs && (
                <Badge variant="secondary" className="text-xs">
                  Will replace existing
                </Badge>
              )}
            </Label>
            <div className="relative">
              <Textarea
                placeholder={`${inputType === 'both' ? 'Or type' : 'Type'} message content for ${doc.name}...`}
                className="min-h-[100px] resize-none"
                value={messageTexts[doc.id] || ''}
                onChange={(e) => setMessageTexts(prev => ({ ...prev, [doc.id]: e.target.value }))}
                disabled={uploading || documentType === 'upload'}
              />
              {documentType === 'upload' && (
                <div className="absolute inset-0 bg-gray-50 bg-opacity-50 flex items-center justify-center rounded-md">
                  <p className="text-sm text-muted-foreground">
                    Message input not available for upload-only documents
                  </p>
                </div>
              )}
            </div>
            <Button
              className="w-full"
              onClick={() => handleMessageSubmit(messageTexts[doc.id] || '', doc.id)}
              disabled={!messageTexts[doc.id]?.trim() || uploading || documentType === 'upload'}
              variant={inputType === 'message' ? 'default' : 'outline'}
              title={documentType === 'upload' ? 'Message submission not available for upload-only documents' : ''}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Submit {inputType === 'message' ? 'Message' : 'Text'}
            </Button>
            <p className="text-sm text-muted-foreground">
              {doc.isRequired ? "Required" : "Optional"} • Message will be converted to PDF
              {hasExistingDocs && " • New submission will replace existing documents"}
            </p>
          </div>
        )}
      </div>
    )
  }, [getDocumentDisplayName, getDocumentInputType, existingDocuments, renderExistingDocumentStatus, 
      uploadProgress, uploading, messageTexts, handleFileChange, handleMessageSubmit])

  const handleConfirmMatch = useCallback(async (selectedMatch: any) => {
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
  }, [pendingSubmission, submitDocumentsToDatabase, handleExistingSaveLogic])

  const handleCreateNew = useCallback(async () => {
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
  }, [pendingSubmission, createNewRegistryIndividual, submitDocumentsToDatabase, handleExistingSaveLogic])

  // All useMemo hooks
  const applicableDocuments = useMemo(() => {
    if (!selectedStageTask?.stage?.documents || !selectedStageTask?.task) {
      return []
    }

    const filtered = selectedStageTask.stage.documents.filter(doc =>
      isDocumentApplicableToTask(doc, selectedStageTask.task)
    )
    
    return filtered
  }, [selectedStageTask, isDocumentApplicableToTask])

  // FIXED: Create stable field promises
  const stableFieldPromises = useMemo(() => {
    const promises: Record<string, Promise<any[]>> = {};
    
    applicableDocuments.forEach(doc => {
      promises[doc.id] = getFieldsForDocument(doc.id);
    });
    
    return promises;
  }, [applicableDocuments.map(d => d.id).join(','), getFieldsForDocument])

  const getStableFieldPromise = useCallback((docId: string) => {
    return stableFieldPromises[docId] || Promise.resolve([]);
  }, [stableFieldPromises])

  // FIXED: Move the render logic for document content outside of JSX and into a function
  const renderDocumentContent = useCallback((doc: any) => {
    const docsForId = uploadedDocs[doc.id] || []
    
    if (docsForId.length === 0) {
      return (
        <div className="border rounded-lg p-8 text-center bg-gray-50">
          <div className="flex flex-col items-center">
            {getDocumentInputType(doc) === 'file' && <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />}
            {getDocumentInputType(doc) === 'message' && <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />}
            {getDocumentInputType(doc) === 'both' && <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />}

            <p className="text-muted-foreground mb-2">No content submitted yet</p>
            <p className="text-sm text-muted-foreground">
              {getDocumentInputType(doc) === 'file' && 'Upload a file to see the preview and extracted data'}
              {getDocumentInputType(doc) === 'message' && 'Submit a message to see the processed content'}
              {getDocumentInputType(doc) === 'both' && 'Upload a file or submit a message to see the preview and extracted data'}
            </p>
            
            {existingDocuments[doc.id]?.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                <p className="text-blue-700 font-medium mb-1">
                  {existingDocuments[doc.id].length} existing document(s) found
                </p>
                <p className="text-blue-600 text-xs">
                  Upload a new file to replace existing documents
                </p>
              </div>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        {docsForId.map((uploadedDoc, index) => {
          // Get stable callback from the stableCallbacks memoized object
          const callbackKey = `${doc.id}-${index}`;
          const onDataChange = stableCallbacks[callbackKey];

          return (
            <div key={uploadedDoc.id} className="relative bg-gray-50 rounded-lg p-4 border">
              <div className="flex justify-between items-start mb-2">
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
                key={uploadedDoc.id}
                documentName={getDocumentDisplayName(doc)}
                extractedData={uploadedDoc.extractedData || {}}
                fieldsPromise={getStableFieldPromise(doc.id)}
                onDataChange={onDataChange}
                fileUrl={uploadedDoc.fileUrl}
                fileName={uploadedDoc.fileName}
                expanded={true}
                showSaveButton={false}
                type={doc.documentType || 'document'}
                file={uploadedDoc.file}
                documentId={doc.id}
                documentIndex={index}
              />
            </div>
          )
        })}
      </div>
    )
  }, [uploadedDocs, existingDocuments, getDocumentInputType, getDocumentDisplayName, 
      handleReExtraction, stableCallbacks, getStableFieldPromise])

  useEffect(() => {
    if (applicableDocuments.length > 0 && !activeDocumentTab) {
      setActiveDocumentTab(applicableDocuments[0].id)
    }
  }, [applicableDocuments, activeDocumentTab])
  
  // Don't render anything if there's no selected stage task
  if (!selectedStageTask) {
    return null
  }
 
  const { task, stage } = selectedStageTask

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[1800px] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Upload Documents for {stage?.name} Stage
            </DialogTitle>
            <DialogDescription>
              Complete this stage by uploading required documents or submitting messages as specified.
              {selectedStageTask?.stage?.documents && applicableDocuments.length !== selectedStageTask.stage.documents.length && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-sm text-blue-700">
                    Showing {applicableDocuments.length} of {selectedStageTask.stage.documents.length} documents applicable to this entity.
                    {selectedStageTask.task.class_id && (
                      <span className="block mt-1">
                        Entity: {selectedStageTask.task.subdepartment?.name}
                        {selectedStageTask.task.class_id && ` → Class ID: ${selectedStageTask.task.class_id}`}
                      </span>
                    )}
                  </p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={activeDocumentTab} onValueChange={setActiveDocumentTab} className="w-full">
            <TabsList className="w-full justify-start">
              {applicableDocuments?.map((doc) => {
                const inputType = getDocumentInputType(doc)
                const hasUploads = uploadedDocs[doc.id]?.length > 0
                const hasExistingDocs = existingDocuments[doc.id]?.length > 0
                const existingDocs = existingDocuments[doc.id] || []
                const mostRecentDoc = existingDocs[0]
                const isOldDocument = mostRecentDoc && selectedStageTask?.task?.created_at && 
                  isDocumentOlderThanTask(mostRecentDoc.created_at, selectedStageTask.task.created_at)

               return (
                 <TabsTrigger
                   key={doc.id}
                   value={doc.id}
                   className="whitespace-nowrap flex items-center gap-2"
                 >
                   {inputType === 'file' && <Upload className="h-3 w-3" />}
                   {inputType === 'message' && <MessageSquare className="h-3 w-3" />}
                   {inputType === 'both' && <FileText className="h-3 w-3" />}

                   {getDocumentDisplayName(doc)}

                   {doc.isSpecial && <Star className="h-3 w-3 text-amber-500" />}

                   {doc.isRequired && (
                     <Badge variant="destructive" className="text-xs px-1">
                       Required
                     </Badge>
                   )}

                   {hasUploads && (
                     <div className="w-2 h-2 bg-green-500 rounded-full" title="Has new uploads"></div>
                   )}

                   {hasExistingDocs && !hasUploads && (
                     <>
                       {isOldDocument ? (
                         <div className="w-2 h-2 bg-orange-500 rounded-full" title="Has old documents"></div>
                       ) : (
                         <div className="w-2 h-2 bg-blue-500 rounded-full" title="Has existing documents"></div>
                       )}
                     </>
                   )}
                 </TabsTrigger>
               )
             })}
           </TabsList>

           {applicableDocuments?.map((doc) => (
             <div
               key={doc.id}
               className={`mt-6 ${activeDocumentTab === doc.id ? 'block' : 'hidden'}`}
             >
               <div className="space-y-6 grid">
                 <div className="space-y-4">
                   {renderInputSection(doc)}
                 </div>

                 <div className="">
                   {renderDocumentContent(doc)}
                 </div>
               </div>
             </div>
           ))}
         </Tabs>
         
         <div className="flex justify-end pt-4 border-t mt-4">
           <Button 
             onClick={handleSaveAllDocuments}
             disabled={Object.values(uploadedDocs).every(docs => docs.length === 0) || uploading}
             className="w-full sm:w-auto"
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
     
     <FuzzyMatchConfirmationDialog 
       open={confirmationDialogOpen}
       onOpenChange={setConfirmationDialogOpen}
       fuzzyMatchResults={fuzzyMatchResults}
       pendingSubmission={pendingSubmission}
       uploading={uploading}
       onConfirmMatch={handleConfirmMatch}
       onCreateNew={handleCreateNew}
     />
   </>
 )
}