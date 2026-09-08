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
import { cn } from "@/lib/utils"
import { useCurrentUser } from "@/lib/hooks/use-current-user"
import { auditActor } from "../../tasks/utils/audit"

function humanizeVariableName(name: string): string {
  if (!name) return "Field"
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function DecisionToggle({ decision, onApprove, onReject }: { decision: 'approved' | 'rejected', onApprove: () => void, onReject: () => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onApprove}
        title="Approve"
        className={cn(
          "h-7 w-7 flex items-center justify-center rounded-md border transition-colors",
          decision === 'approved' ? "bg-green-50 border-green-300 text-green-600" : "border-slate-200 text-slate-300 hover:text-green-600 hover:border-green-300"
        )}
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onReject}
        title="Reject"
        className={cn(
          "h-7 w-7 flex items-center justify-center rounded-md border transition-colors",
          decision === 'rejected' ? "bg-red-50 border-red-300 text-red-600" : "border-slate-200 text-slate-300 hover:text-red-600 hover:border-red-300"
        )}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
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
  const { user: currentUser } = useCurrentUser();
  const actor = auditActor(currentUser);
  const [isApplying, setIsApplying] = useState(false)
  const [activeTab, setActiveTab] = useState("documents")

  type Decision = 'approved' | 'rejected'
  const [docDecisions, setDocDecisions] = useState<Record<number, Decision>>({})
  const [fieldDecisions, setFieldDecisions] = useState<Record<string, Decision>>({})
  const [questionDecisions, setQuestionDecisions] = useState<Record<string, Decision>>({})

  const getDocDecision = useCallback((idx: number): Decision => docDecisions[idx] ?? 'approved', [docDecisions])
  const getFieldDecision = useCallback((key: string): Decision => fieldDecisions[key] ?? 'approved', [fieldDecisions])
  const getQuestionDecision = useCallback((id: string): Decision => questionDecisions[id] ?? 'approved', [questionDecisions])

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

  const buildFinalizedDocuments = useCallback((decisionFor: (idx: number) => Decision) => submittedDocuments.map((doc, idx) => ({
    document_id: doc.documentId,
    entity_id: doc.entityId,
    entity_type: doc.entityType,
    entity_label: doc.entityLabel,
    file_name: doc.fileName,
    file_path: doc.filePath,
    extracted_details: doc.extractedDetails,
    submitted_at: doc.submittedAt,
    status: decisionFor(idx),
  })), [submittedDocuments])

  const buildFinalizedFields = useCallback((decisionFor: (key: string) => Decision) => {
    const out: Record<string, any> = {}
    submittedFields.forEach(f => {
      out[f.fieldKey] = f.metadata ? { ...f.metadata, review_status: decisionFor(f.fieldKey) } : { value: f.value, review_status: decisionFor(f.fieldKey) }
    })
    return out
  }, [submittedFields])

  const buildQuestionReviewStatus = useCallback((decisionFor: (id: string) => Decision) => {
    const out: Record<string, Decision> = {}
    submittedQuestions.forEach(q => { out[q.questionId] = decisionFor(q.questionId) })
    return out
  }, [submittedQuestions])

  const setAllDecisions = useCallback((decision: Decision) => {
    setDocDecisions(Object.fromEntries(submittedDocuments.map((_, idx) => [idx, decision])))
    setFieldDecisions(Object.fromEntries(submittedFields.map(f => [f.fieldKey, decision])))
    setQuestionDecisions(Object.fromEntries(submittedQuestions.map(q => [q.questionId, decision])))
  }, [submittedDocuments, submittedFields, submittedQuestions])

  const decisionCounts = useMemo(() => {
    const all = [
      ...submittedDocuments.map((_, idx) => getDocDecision(idx)),
      ...submittedFields.map(f => getFieldDecision(f.fieldKey)),
      ...submittedQuestions.map(q => getQuestionDecision(q.questionId)),
    ]
    return {
      total: all.length,
      approved: all.filter(d => d === 'approved').length,
      rejected: all.filter(d => d === 'rejected').length,
    }
  }, [submittedDocuments, submittedFields, submittedQuestions, getDocDecision, getFieldDecision, getQuestionDecision])

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
    const toastId = toast.loading("Applying reviewed submission...")

    try {
      const approvedDocuments = submittedDocuments.filter((_, idx) => getDocDecision(idx) === 'approved')
      const approvedQuestions = submittedQuestions.filter(q => getQuestionDecision(q.questionId) === 'approved')
      const approvedFields = submittedFields.filter(f => getFieldDecision(f.fieldKey) === 'approved')

      // 1. Upload approved documents only
      if (approvedDocuments.length > 0) {
        const companyId = task.company_id || task.participants_details?.find((p: any) => p.type === 'company')?.id
        const individualId = task.individual_id || task.applicant_details?.id

        for (const doc of approvedDocuments) {
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

      // 2. Apply approved question answers to task
      if (approvedQuestions.length > 0) {
        const currentAnswers = task.job_specific_answers || {}
        const updatedAnswers = { ...currentAnswers }
        approvedQuestions.forEach(q => {
          updatedAnswers[q.questionId] = q.answer
        })

        const { error } = await supabase.from('tm_tasks')
          .update({
            job_specific_answers: updatedAnswers,
            updated_at: new Date().toISOString(),
            updated_by_id: actor.by_id,
          })
          .eq('id', task.id)
        if (error) throw error
      }

      // 3. Apply approved field values to source tables
      if (approvedFields.length > 0) {
        for (const field of approvedFields) {
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
              .update({ ...updateData, updated_at: new Date().toISOString(), updated_by_id: actor.by_id })
              .eq(queryField, recordPK)
            if (error) console.error('Error updating field:', error)
          }
        }
      }

      // 4. Persist per-item review status and finalize the draft
      const finalizedDocuments = buildFinalizedDocuments(getDocDecision)
      const finalizedFields = buildFinalizedFields(getFieldDecision)
      const questionReviewStatus = buildQuestionReviewStatus(getQuestionDecision)

      const { error } = await supabase.from('tm_tasks')
        .update({
          registry_metadata: {
            ...task.registry_metadata,
            client_requirements_draft: {
              ...draft,
              documents: finalizedDocuments,
              fields: finalizedFields,
              questionReviewStatus,
              status: 'applied',
              applied_at: new Date().toISOString()
            }
          },
          updated_at: new Date().toISOString(),
          updated_by_id: actor.by_id,
        })
        .eq('id', task.id)
      if (error) throw error

      const rejectedCount = decisionCounts.rejected
      toast.success(rejectedCount > 0 ? `Applied approved items (${rejectedCount} rejected)` : "Client submission applied successfully!", { id: toastId })
      onRefresh?.()
      onClose()
    } catch (error: any) {
      console.error('Error applying submission:', error)
      toast.error(`Failed to apply: ${error.message}`, { id: toastId })
    } finally {
      setIsApplying(false)
    }
  }

  const handleRejectAll = async () => {
    if (!task || !draft) return
    setIsApplying(true)
    const toastId = toast.loading("Rejecting entire submission...")

    try {
      const finalizedDocuments = buildFinalizedDocuments(() => 'rejected')
      const finalizedFields = buildFinalizedFields(() => 'rejected')
      const questionReviewStatus = buildQuestionReviewStatus(() => 'rejected')

      const { error } = await supabase.from('tm_tasks')
        .update({
          registry_metadata: {
            ...task.registry_metadata,
            client_requirements_draft: {
              ...draft,
              documents: finalizedDocuments,
              fields: finalizedFields,
              questionReviewStatus,
              status: 'rejected',
              rejected_at: new Date().toISOString()
            }
          },
          updated_at: new Date().toISOString(),
          updated_by_id: actor.by_id,
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
      setIsApplying(false)
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

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-500 font-medium">
            <span className="text-green-600 font-bold">{decisionCounts.approved}</span> approved &middot; <span className="text-red-600 font-bold">{decisionCounts.rejected}</span> rejected &middot; {decisionCounts.total} total items
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAllDecisions('approved')} className="h-8 text-xs font-semibold text-green-700 border-green-200 hover:bg-green-50">
              <Check className="h-3.5 w-3.5 mr-1.5" /> Approve All
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setAllDecisions('rejected')} className="h-8 text-xs font-semibold text-red-700 border-red-200 hover:bg-red-50">
              <X className="h-3.5 w-3.5 mr-1.5" /> Reject All
            </Button>
          </div>
        </div>

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
                    submittedDocuments.map((doc, idx) => {
                      const decision = getDocDecision(idx)
                      return (
                      <div key={idx} className={cn("p-3 flex items-center justify-between bg-white text-sm", decision === 'rejected' && "bg-red-50/40")}>
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
                        <DecisionToggle
                          decision={decision}
                          onApprove={() => setDocDecisions(prev => ({ ...prev, [idx]: 'approved' }))}
                          onReject={() => setDocDecisions(prev => ({ ...prev, [idx]: 'rejected' }))}
                        />
                      </div>
                    )})
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
                      const decision = getFieldDecision(field.fieldKey)
                      return (
                        <div key={idx} className={cn("p-3 flex items-center justify-between bg-white text-sm", decision === 'rejected' && "bg-red-50/40")}>
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
                          <div className="flex items-center gap-3 shrink-0 ml-3">
                            <div className="text-right">
                              <p className="text-sm font-medium text-slate-800 max-w-[200px] truncate">
                                {typeof field.value === 'object' ? JSON.stringify(field.value) : String(field.value || '-')}
                              </p>
                              {meta?.entityTypes?.length > 0 && (
                                <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
                                  {meta.entityTypes.join(', ')}
                                </p>
                              )}
                            </div>
                            <DecisionToggle
                              decision={decision}
                              onApprove={() => setFieldDecisions(prev => ({ ...prev, [field.fieldKey]: 'approved' }))}
                              onReject={() => setFieldDecisions(prev => ({ ...prev, [field.fieldKey]: 'rejected' }))}
                            />
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
                    submittedQuestions.map((q, idx) => {
                      const decision = getQuestionDecision(q.questionId)
                      return (
                      <div key={idx} className={cn("p-3 flex items-center justify-between bg-white text-sm", decision === 'rejected' && "bg-red-50/40")}>
                        <div className="flex items-center gap-3">
                          <HelpCircle className="h-4 w-4 text-purple-500" />
                          <div>
                            <p className="font-semibold text-slate-700">{getQuestionLabel(q.questionId)}</p>
                            <p className="text-[10px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded w-fit mt-1">Question</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-sm font-medium text-slate-800 max-w-[200px] truncate">
                            {typeof q.answer === 'object' ? JSON.stringify(q.answer) : String(q.answer || '-')}
                          </p>
                          <DecisionToggle
                            decision={decision}
                            onApprove={() => setQuestionDecisions(prev => ({ ...prev, [q.questionId]: 'approved' }))}
                            onReject={() => setQuestionDecisions(prev => ({ ...prev, [q.questionId]: 'rejected' }))}
                          />
                        </div>
                      </div>
                    )})
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
            onClick={handleRejectAll}
            disabled={isApplying}
            className="flex items-center gap-2"
            title="Reject the entire submission without applying anything"
          >
            {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Reject Entire Submission
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isApplying}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={isApplying}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Apply Decisions
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
