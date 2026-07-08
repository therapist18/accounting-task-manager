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
import type { FieldResolutionContext } from "../../tasks/utils/fieldResolution"

function humanizeVariableName(name: string): string {
  if (!name) return "Field"
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

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

  // Mirrors the relationshipData shape built in RequirementsTab/AutomationTab so target
  // entities (director, dependant, sponsor, etc.) resolve the same way everywhere.
  const relationshipData = useMemo(() => {
    if (!task) return [null]
    const participants = task.participants_details || []
    const applicant = task.applicant_details || {}
    const companyParticipant = participants.find((p: any) => p.type === 'company')
    const isApplicantDependant = applicant.role === 'dependant' || (Array.isArray(applicant.role) && applicant.role.includes('dependant'))
    let principal = participants.find((p: any) =>
      p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
    )
    let dependants = participants
      .filter((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('dependant') : p.role === 'dependant'))
      .map((dep: any) => ({ id: dep.id, name: dep.name, relationship: dep.relationship || 'dependant' }))
    if (isApplicantDependant) {
      if (!dependants.find((d: any) => d.id === applicant.id)) {
        dependants.push({ id: applicant.id || task?.individual_id, name: applicant.name, relationship: applicant.relationship || 'dependant' })
      }
    } else {
      if (!principal) principal = { id: applicant.id || task?.individual_id, name: applicant.name, role: applicant.role }
    }
    return [{
      company: { id: companyParticipant?.id || task?.company_id, name: companyParticipant?.name || task?.company_name || 'Company', type: 'company' },
      principal: principal ? { id: principal.id, name: principal.name, role: principal.role } : null,
      directors: participants
        .filter((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? (p.role.includes('director') || p.role.includes('shareholder')) : (p.role === 'director' || p.role === 'shareholder')))
        .map((d: any) => ({ id: d.id, name: d.name, role: d.role })),
      dependants: dependants,
      understudy: (() => {
        const up = participants.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('understudy') : p.role === 'understudy'))
        return up ? { id: up.id, name: up.name } : null
      })(),
      sponsor: (() => {
        const sp = participants.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('sponsor') : p.role === 'sponsor'))
        return sp ? { id: sp.id, name: sp.name } : null
      })()
    }]
  }, [task])

  const getEntityLabel = useCallback((entityId: any, entityType?: string) => {
    if (!task) return String(entityId)
    if (String(task.applicant_details?.id) === String(entityId)) return task.applicant_details?.name
    const participant = (task.participants_details || []).find((p: any) => String(p.id) === String(entityId))
    if (participant) return participant.name
    if (entityType === 'company' || String(task.company_id) === String(entityId)) return task.company_name || 'Company'
    return String(entityId)
  }, [task])

  const submittedDocuments = useMemo(() => {
    if (!draft?.documents) return []
    if (Array.isArray(draft.documents)) {
      return draft.documents.map((data: any) => ({
        documentId: data.document_id || data.documentId,
        entityId: data.entity_id ?? data.entityId,
        entityType: data.entity_type || data.entityType,
        entityLabel: data.entity_label || data.entityLabel || getEntityLabel(data.entity_id ?? data.entityId, data.entity_type || data.entityType),
        fileName: data.file_name || data.fileName || 'Document',
        filePath: data.file_path || data.filePath,
        extractedDetails: data.extracted_details || data.extractedDetails || {},
        status: data.status || 'draft',
        submittedAt: data.submitted_at || data.submittedAt,
      }))
    }
    // Legacy object-map format (pre entity-tagged submissions)
    return Object.entries(draft.documents).map(([docId, data]: [string, any]) => ({
      documentId: docId,
      entityId: undefined,
      entityType: data.entity_type || data.entityType || (data.entity_types || data.entityTypes)?.[0],
      entityLabel: '',
      fileName: data.file_name || data.fileName || 'Document',
      filePath: data.file_path || data.filePath,
      extractedDetails: data.extracted_details || data.extractedDetails || {},
      status: data.status || 'draft',
      submittedAt: data.submitted_at || data.submittedAt,
    }))
  }, [draft, getEntityLabel])

  const submittedQuestions = useMemo(() => {
    if (!draft?.questions) return []
    return Object.entries(draft.questions).map(([qId, answer]: [string, any]) => ({
      questionId: qId,
      answer: answer,
    }))
  }, [draft])

  const submittedFields = useMemo(() => {
    if (!draft?.fields) return []
    return Object.entries(draft.fields).map(([fieldKey, entry]: [string, any]) => ({
      fieldKey,
      value: typeof entry === 'object' && entry !== null && 'value' in entry ? entry.value : entry,
      metadata: typeof entry === 'object' && entry !== null && 'value' in entry ? entry : null,
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
      return field?.efnsDisplayName || field?.name || humanizeVariableName(variableName)
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
        const companyId = task.company_id || task.participants_details?.find((p: any) => p.type === 'company')?.id
        const individualId = task.individual_id || task.applicant_details?.id

        for (const doc of submittedDocuments) {
          if (!doc.filePath) continue

          const isCompanyDoc = doc.entityType === 'company'
          const targetTable = isCompanyDoc ? 'acc_portal_kyc_uploads' : 'acc_portal_directors_documents'
          const idField = isCompanyDoc ? 'company_id' : 'director_id'
          // Prefer the specific entity the client uploaded against; fall back to the
          // task's primary company/individual for legacy (non entity-tagged) drafts.
          const entityId = doc.entityId ?? (isCompanyDoc ? companyId : individualId)

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

          // Prefer the live automation definition (has dependantRelationships etc. needed
          // for correct entity resolution); fall back to the metadata captured at submit time.
          const meta = field.metadata
          const auto = automationWebdataMap[automationId]
          let fieldDef = auto?.webdata?.find((f: any) => f.variableName === variableName)
          if (!fieldDef && meta) {
            fieldDef = { variableName: meta.variableName, entityTypes: meta.entityTypes, masterFieldIds: meta.masterFieldIds }
          }

          if (!fieldDef) continue

          const linkedMasterFieldId = fieldDef.linkedMasterFields?.[0] || fieldDef.masterFieldIds?.[0] || fieldDef.linkedMasterFieldId || (fieldDef.masterFieldIds?.length > 0 ? fieldDef.masterFieldIds[0] : null)
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

          // Determine entity ID for the record using the same resolution logic used
          // everywhere else (AutomationTab, SendRequirementsDialog) so a field always
          // lands on the same record it was read from.
          const entityId = resolveTargetEntityIdImpl(fieldDef, {
            relationshipData: relationshipData[0],
            currentIndividualId: String(task.individual_id || task.applicant_details?.id || ''),
            task,
          } as FieldResolutionContext)

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

          const fieldValueToApply = meta ? meta.value : field.value

          if (existing) {
            const updateData = updateJsonValue(existing, source.path, fieldValueToApply)

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
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-800">
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
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <p className="text-xs text-slate-400">{doc.fileName}</p>
                              {doc.entityLabel && (
                                <Badge variant="secondary" className="text-[9px] font-medium uppercase tracking-wide px-1.5 py-0 bg-slate-100 text-slate-500 border-slate-200">
                                  {doc.entityLabel}
                                </Badge>
                              )}
                            </div>
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
                    submittedFields.map((field, idx) => {
                      const meta = field.metadata
                      return (
                        <div key={idx} className="p-3 flex items-center justify-between bg-white text-sm">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Database className="h-4 w-4 text-blue-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-700 truncate">{getFieldName(field.fieldKey)}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <p className="text-[10px] text-slate-400 font-mono">{field.fieldKey}</p>
                                {meta?.automationName && (
                                  <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[8px] border px-1 py-0 font-medium">
                                    {meta.automationName}
                                  </Badge>
                                )}
                                {meta?.fieldType && (
                                  <span className="text-[9px] text-slate-500 bg-slate-100 px-1 py-0.5 rounded font-medium uppercase">
                                    {meta.fieldType}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className="text-sm font-medium text-slate-800 max-w-[200px] truncate">
                              {typeof field.value === 'object' ? JSON.stringify(field.value) : String(field.value || '-')}
                            </p>
                            {meta?.entityTypes?.length > 0 && (
                              <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
                                {meta.entityTypes.join(', ')}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })
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
