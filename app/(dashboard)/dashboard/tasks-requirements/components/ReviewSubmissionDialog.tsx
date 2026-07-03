// @ts-nocheck
"use client"

import React, { useMemo, useState, useCallback } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { CheckCircle2, XCircle, AlertCircle, FileText, Database, HelpCircle, Check, X, Loader2 } from "lucide-react"
import supabase from "@/lib/supabase/client"
import { resolveTargetEntityIdImpl, resolveVariableValueImpl } from "../../tasks/utils/fieldResolution"
import { updateJsonValue } from "../../tasks/utils/AutomationMappingDialog"

interface ReviewSubmissionDialogProps {
  isOpen: boolean
  onClose: () => void
  task: any
  taskClassRequirements: Record<string, any>
  automationWebdataMap: Record<string, { name: string; webdata: any[] }>
  allCompanyDocuments: Record<string, any[]>
  allIndividualDocuments: Record<string, any[]>
  fieldSourceDataCache: Record<string, Record<string, any>>
  fieldMasterComputedCache: Record<string, any>
  jobFieldsRecord?: Record<string, any>
  onRefresh?: () => void
}

export function ReviewSubmissionDialog({
  isOpen,
  onClose,
  task,
  taskClassRequirements,
  automationWebdataMap,
  allCompanyDocuments,
  allIndividualDocuments,
  fieldSourceDataCache,
  fieldMasterComputedCache,
  jobFieldsRecord = {},
  onRefresh
}: ReviewSubmissionDialogProps) {
  const [isApplying, setIsApplying] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [activeTab, setActiveTab] = useState("documents")

  const draft = task?.registry_metadata?.client_requirements_draft

  const submittedDocuments = useMemo(() => {
    if (!draft?.documents) return []
    return Object.entries(draft.documents).map(([docId, data]: [string, any]) => ({
      documentId: docId,
      fileName: data.file_name || data.fileName || 'Document',
      filePath: data.file_path || data.filePath,
      extractedDetails: data.extracted_details || data.extractedDetails || {},
      entityType: data.entity_type || data.entityType,
      status: data.status || 'draft',
      submittedAt: data.submitted_at || data.submittedAt,
    }))
  }, [draft])

  const submittedQuestions = useMemo(() => {
    if (!draft?.questions) return []
    return Object.entries(draft.questions).map(([qId, answer]: [string, any]) => ({
      questionId: qId,
      answer: answer,
    }))
  }, [draft])

  const submittedFields = useMemo(() => {
    if (!draft?.fields) return []
    return Object.entries(draft.fields).map(([fieldKey, value]: [string, any]) => ({
      fieldKey,
      value,
    }))
  }, [draft])

  const classReqs = task ? taskClassRequirements[task.id] : null

  const getDocumentName = useCallback((docId: string) => {
    const req = classReqs?.requirements?.find((r: any) => r.document_ids?.includes(docId) || r.id === docId)
    return req?.name || docId
  }, [classReqs])

  const getQuestionLabel = useCallback((qId: string) => {
    const q = classReqs?.job_specific_questions?.find((q: any) => q.id === qId)
    return q?.label || qId
  }, [classReqs])

  const getFieldName = useCallback((fieldKey: string) => {
    const parts = fieldKey.split(':')
    if (parts.length >= 2) {
      const automationId = parts[0]
      const variableName = parts.slice(1).join(':')
      const auto = automationWebdataMap[automationId]
      const field = auto?.webdata?.find((f: any) => f.variableName === variableName)
      return field?.efnsDisplayName || field?.name || variableName
    }
    return fieldKey
  }, [automationWebdataMap])

  const handleApply = async () => {
    if (!task || !draft) return
    setIsApplying(true)
    const toastId = toast.loading("Applying client submission...")

    try {
      // 1. Upload submitted documents
      if (submittedDocuments.length > 0) {
        for (const doc of submittedDocuments) {
          if (!doc.filePath) continue

          const companyId = task.company_id || task.participants_details?.find((p: any) => p.type === 'company')?.id
          const individualId = task.individual_id || task.applicant_details?.id

          const isCompanyDoc = doc.entityType === 'company' || (!!companyId && !individualId)
          const targetTable = isCompanyDoc ? 'acc_portal_kyc_uploads' : 'acc_portal_directors_documents'
          const idField = isCompanyDoc ? 'company_id' : 'director_id'
          const entityId = isCompanyDoc ? companyId : individualId

          if (!entityId) continue

          const { error } = await supabase.from(targetTable).insert({
            [idField]: entityId,
            document_id: doc.documentId,
            file_path: doc.filePath,
            file_name: doc.fileName,
            extracted_details: doc.extractedDetails,
            status: 'active',
            extraction_status: 'success',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          if (error) console.error('Error inserting document:', error)
        }
      }

      // 2. Apply question answers to task
      if (submittedQuestions.length > 0) {
        const currentAnswers = task.job_specific_answers || {}
        const updatedAnswers = { ...currentAnswers }
        submittedQuestions.forEach(q => {
          updatedAnswers[q.questionId] = q.answer
        })

        const { error } = await supabase.from('tm_tasks')
          .update({
            job_specific_answers: updatedAnswers,
            updated_at: new Date().toISOString()
          })
          .eq('id', task.id)
        if (error) throw error
      }

      // 3. Apply field values to source tables
      if (submittedFields.length > 0) {
        for (const field of submittedFields) {
          const parts = field.fieldKey.split(':')
          if (parts.length < 2) continue
          const automationId = parts[0]
          const variableName = parts.slice(1).join(':')

          const auto = automationWebdataMap[automationId]
          const fieldDef = auto?.webdata?.find((f: any) => f.variableName === variableName)
          if (!fieldDef) continue

          const linkedMasterFieldId = fieldDef.linkedMasterFields?.[0] || fieldDef.masterFieldIds?.[0] || fieldDef.linkedMasterFieldId
          if (!linkedMasterFieldId) continue

          // Find the job field definition to get the source table/path
          let masterField = jobFieldsRecord[String(linkedMasterFieldId)]
          if (!masterField) {
            const { data } = await supabase.from('tm_job_fields').select('*').eq('id', linkedMasterFieldId).single()
            masterField = data
          }
          if (!masterField?.sources?.length) continue

          const source = masterField.sources.find((s: any) => !s.is_computed && s.table && s.path) || masterField.sources[0]
          if (!source?.table || !source?.path) continue

          // Determine entity ID for the record
          let entityId = task.individual_id || task.applicant_details?.id
          const entityTypes = fieldDef.entityTypes || (fieldDef.entityType ? [fieldDef.entityType] : [])
          if (entityTypes.includes('company')) {
            entityId = task.company_id || task.participants_details?.find((p: any) => p.type === 'company')?.id
          }

          if (!entityId) continue

          // Fetch existing record and update
          let query = supabase.from(source.table).select('*')
          if (source.table === 'tm_tasks') {
            query = query.eq('id', task.id)
          } else if (source.linking_variable) {
            query = query.eq(source.linking_variable, entityId)
          } else {
            query = query.or(`id.eq.${entityId},director_id.eq.${entityId},company_id.eq.${entityId}`)
          }
          const { data: existing } = await query.maybeSingle()

          if (existing) {
            const updateData = updateJsonValue(existing, source.path, field.value)

            const queryField = source.table === 'tm_tasks' ? 'id' :
              source.linking_variable ? source.linking_variable :
              existing.director_id ? 'director_id' :
              existing.company_id ? 'company_id' : 'id'
            const recordPK = source.table === 'tm_tasks' ? task.id :
              source.linking_variable ? entityId :
              existing.director_id || existing.company_id || existing.id

            const { error } = await supabase.from(source.table)
              .update({ ...updateData, updated_at: new Date().toISOString() })
              .eq(queryField, recordPK)
            if (error) console.error('Error updating field:', error)
          }
        }
      }

      // 4. Clear the draft and update status
      const { error } = await supabase.from('tm_tasks')
        .update({
          registry_metadata: {
            ...task.registry_metadata,
            client_requirements_draft: {
              ...draft,
              status: 'applied',
              applied_at: new Date().toISOString()
            }
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id)
      if (error) throw error

      toast.success("Client submission applied successfully!", { id: toastId })
      onRefresh?.()
      onClose()
    } catch (error: any) {
      console.error('Error applying submission:', error)
      toast.error(`Failed to apply: ${error.message}`, { id: toastId })
    } finally {
      setIsApplying(false)
    }
  }

  const handleReject = async () => {
    if (!task || !draft) return
    setIsRejecting(true)
    const toastId = toast.loading("Rejecting submission...")

    try {
      const { error } = await supabase.from('tm_tasks')
        .update({
          registry_metadata: {
            ...task.registry_metadata,
            client_requirements_draft: {
              ...draft,
              status: 'rejected',
              rejected_at: new Date().toISOString()
            }
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id)
      if (error) throw error

      toast.success("Submission rejected", { id: toastId })
      onRefresh?.()
      onClose()
    } catch (error: any) {
      console.error('Error rejecting submission:', error)
      toast.error(`Failed to reject: ${error.message}`, { id: toastId })
    } finally {
      setIsRejecting(false)
    }
  }

  if (!draft) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>No Submission Found</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500 py-4">No client submission draft found for this task.</p>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-full max-h-[85vh] flex flex-col bg-white">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <CheckCircle2 className="h-5 w-5 text-blue-600" />
            Review Client Submission
          </DialogTitle>
          <DialogDescription>
            Review the submitted documents, fields, and question answers from the client.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden my-4">
          <TabsList className="grid grid-cols-3 w-full max-w-md shrink-0">
            <TabsTrigger value="documents">
              Documents ({submittedDocuments.length})
            </TabsTrigger>
            <TabsTrigger value="fields">
              Fields ({submittedFields.length})
            </TabsTrigger>
            <TabsTrigger value="questions">
              Questions ({submittedQuestions.length})
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden mt-4">
            <TabsContent value="documents" className="h-full flex flex-col m-0">
              <ScrollArea className="flex-1 pr-2">
                <div className="border rounded-md divide-y bg-slate-50/50">
                  {submittedDocuments.length > 0 ? (
                    submittedDocuments.map((doc, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between bg-white text-sm">
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-blue-500" />
                          <div>
                            <p className="font-semibold text-slate-700">{getDocumentName(doc.documentId)}</p>
                            <p className="text-xs text-slate-400">{doc.fileName}</p>
                            {doc.submittedAt && (
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Submitted: {new Date(doc.submittedAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge className="bg-blue-50 text-blue-600 border border-blue-200 text-[10px] uppercase font-bold">
                          {doc.status}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <p className="p-4 text-center text-sm text-slate-400 italic">No documents submitted.</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="fields" className="h-full flex flex-col m-0">
              <ScrollArea className="flex-1 pr-2">
                <div className="border rounded-md divide-y bg-slate-50/50">
                  {submittedFields.length > 0 ? (
                    submittedFields.map((field, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between bg-white text-sm">
                        <div className="flex items-center gap-3">
                          <Database className="h-4 w-4 text-blue-500" />
                          <div>
                            <p className="font-semibold text-slate-700">{getFieldName(field.fieldKey)}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{field.fieldKey}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-slate-800 max-w-[200px] truncate">
                            {typeof field.value === 'object' ? JSON.stringify(field.value) : String(field.value || '-')}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="p-4 text-center text-sm text-slate-400 italic">No fields submitted.</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="questions" className="h-full flex flex-col m-0">
              <ScrollArea className="flex-1 pr-2">
                <div className="border rounded-md divide-y bg-slate-50/50">
                  {submittedQuestions.length > 0 ? (
                    submittedQuestions.map((q, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between bg-white text-sm">
                        <div className="flex items-center gap-3">
                          <HelpCircle className="h-4 w-4 text-purple-500" />
                          <div>
                            <p className="font-semibold text-slate-700">{getQuestionLabel(q.questionId)}</p>
                            <p className="text-[10px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded w-fit mt-1">Question</p>
                          </div>
                        </div>
                        <p className="text-sm font-medium text-slate-800 max-w-[200px] truncate">
                          {typeof q.answer === 'object' ? JSON.stringify(q.answer) : String(q.answer || '-')}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="p-4 text-center text-sm text-slate-400 italic">No questions answered.</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="border-t pt-4 flex justify-between">
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={isApplying || isRejecting}
            className="flex items-center gap-2"
          >
            {isRejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Reject
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isApplying || isRejecting}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={isApplying || isRejecting}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Apply Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
