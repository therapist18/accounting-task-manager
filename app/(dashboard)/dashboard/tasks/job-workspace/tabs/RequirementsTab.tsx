// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import {
  CheckCircle2, AlertCircle, UploadCloud, Eye, FileText, Lock, Loader2,
  ChevronDown, ChevronRight, Trash2, RefreshCw, FileUp, XCircle, User,
  Briefcase, UserCheck, Users2, HeartPulse, Send, Search, AlertTriangle, Check, X, ArrowUpDown, ArrowUp, ArrowDown, HelpCircle,
  Calendar
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import { toast } from "sonner"
import { REQUIREMENTS_LOCK_STAGE_IDS } from "../../utils/taskManagerData"
import { UploadModal } from "@/app/generic-components/UploadModal"
import { ReviewSubmissionDialog } from "../../../tasks-requirements/components/ReviewSubmissionDialog"
import { SendRequirementsDialog } from "../../../tasks-requirements/components/SendRequirementsDialog"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import type { JobWorkspaceData } from "../fetchJobWorkspaceData"

interface RequirementsTabProps {
  data: JobWorkspaceData
  onRefresh?: () => void
}

interface ColDef {
  type: string
  id: number | string
  label: string
  subLabel: string
  roles?: string[]
  priority: number
}

const CATEGORY_ORDER = ["general", "processing", "issuance", "other"]
const CATEGORY_LABELS: Record<string, string> = {
  general: "General Requirements",
  processing: "Processing Phase",
  issuance: "Issuance Phase",
  other: "Other Requirements",
}

function getLockState(task: any) {
  const stages = task?.stages || {}
  const done = (id: string) => stages[id]?.status === "completed"
  return {
    processingLocked: done(REQUIREMENTS_LOCK_STAGE_IDS.PROCESSING) && !done(REQUIREMENTS_LOCK_STAGE_IDS.DEFERRED),
    issuanceLocked: done(REQUIREMENTS_LOCK_STAGE_IDS.ISSUANCE),
  }
}

function formatDocDate(doc: any): string | null {
  if (!doc) return null
  const d = doc.expiry_date || doc.created_at
  if (!d) return null
  const date = new Date(d)
  if (isNaN(date.getTime())) return null
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

function getLatestDoc(docs: any[]) {
  if (!docs || docs.length === 0) return null
  return docs.reduce((prev, curr) =>
    new Date(curr.created_at || 0) > new Date(prev.created_at || 0) ? curr : prev
  )
}

function isSectionLocked(task: any, category: string) {
  const { processingLocked, issuanceLocked } = getLockState(task)
  if (category === "processing") return processingLocked
  if (category === "issuance") return issuanceLocked
  return false
}

function getEntityTypeConfig(type: string) {
  switch (type) {
    case "company": return { bgColor: "bg-slate-700", Icon: Briefcase }
    case "director": return { bgColor: "bg-indigo-600", Icon: UserCheck }
    case "dependant": return { bgColor: "bg-blue-500", Icon: Users2 }
    case "principal": return { bgColor: "bg-custom-blue", Icon: UserCheck }
    case "sponsor": return { bgColor: "bg-green-600", Icon: HeartPulse }
    case "understudy": return { bgColor: "bg-cyan-600", Icon: User }
    default: return { bgColor: "bg-custom-blue", Icon: User }
  }
}

function checkApplicability(colType: string, requirement: any): boolean {
  const allowedTypes = requirement.entityTypes || (requirement.applicantType ? [requirement.applicantType] : [])
  if (!allowedTypes || allowedTypes.length === 0) return true
  return allowedTypes.includes(colType)
}

function buildParticipantColumns(task: any): ColDef[] {
  if (!task) return []
  const cols: ColDef[] = []
  const participants = task.participants_details || []
  const applicant = task.applicant_details || {}

  let priority = 1
  if (applicant?.type === "company") {
    cols.push({ type: "company", id: applicant.id, label: applicant.name, subLabel: "Applicant", priority: priority++ })
  } else {
    const companyPart = participants.find((p: any) => p.type === "company")
    if (companyPart) cols.push({ type: "company", id: companyPart.id, label: companyPart.name, subLabel: "Entity", priority: priority++ })
  }

  if (applicant?.type === "individual") {
    const role = Array.isArray(applicant.role) ? applicant.role : [applicant.role]
    let colType = "principal"
    if (role.includes("dependant") || role.includes("dependent")) colType = "dependant"
    else if (role.includes("director") || role.includes("shareholder")) colType = "director"
    else if (role.includes("understudy")) colType = "understudy"
    cols.push({ type: colType, id: applicant.id, label: applicant.name, subLabel: colType.toUpperCase(), roles: role, priority: priority++ })
  }

  participants.filter((p: any) => p.type === "individual").forEach((p: any) => {
    const roles = Array.isArray(p.role) ? p.role : [p.role]
    if (cols.find(c => c.id === p.id)) return
    if (roles.includes("director") || roles.includes("shareholder")) {
      cols.push({ type: "director", id: p.id, label: p.name, subLabel: "Director", roles, priority: priority++ })
    } else if (roles.includes("dependant") || roles.includes("dependent")) {
      cols.push({ type: "dependant", id: p.id, label: p.name, subLabel: p.relationship || "Dependant", roles, priority: priority++ })
    } else if (roles.includes("understudy")) {
      cols.push({ type: "understudy", id: p.id, label: p.name, subLabel: "Understudy", roles, priority: priority++ })
    } else if (roles.includes("sponsor")) {
      cols.push({ type: "sponsor", id: p.id, label: p.name, subLabel: "Sponsor", roles, priority: priority++ })
    } else if (roles.includes("principal") || roles.includes("applicant")) {
      if (!cols.find(c => c.id === p.id)) cols.push({ type: "principal", id: p.id, label: p.name, subLabel: "Principal", roles, priority: priority++ })
    }
  })

  return cols.sort((a, b) => a.priority - b.priority)
}

function getCellStatus(req: any, col: ColDef, docsByInd: Record<string, any[]>, allCompanyDocs: any[]) {
  if (!checkApplicability(col.type, req)) return { type: "na" as const, docs: [] }
  
  const docIds = req.document_ids || (req.document_id ? [req.document_id] : [])
  if (!docIds.length) return { type: "na" as const, docs: [] }

  let found: any[] = []
  if (col.type === "company") {
    found = (allCompanyDocs || []).filter((d: any) => docIds.includes(d.document_id))
  } else {
    found = (docsByInd[col.id] || []).filter((d: any) => docIds.includes(d.document_id))
  }
  
  return { type: found.length > 0 ? "view" as const : "upload" as const, docs: found }
}

export function RequirementsTab({ data, onRefresh }: RequirementsTabProps) {
  const { task, kycDocsMap, documentsByIndividual, allDocuments, allCompanyDocuments } = data
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(CATEGORY_ORDER))
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedDocForUpload, setSelectedDocForUpload] = useState<any>(null)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewDocument, setPreviewDocument] = useState<any>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [isSendRequirementsOpen, setIsSendRequirementsOpen] = useState(false)
  const [jobFieldsRecord, setJobFieldsRecord] = useState<Record<string, any>>({})
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const lockState = useMemo(() => getLockState(task), [task])
  const columns = useMemo(() => buildParticipantColumns(task), [task])
  const clientDraft = task?.registry_metadata?.client_requirements_draft

  // Map automations
  const automationWebdataMap = useMemo(() => {
    const map: Record<string, any> = {}
    ;(data.automations || []).forEach(auto => {
      if (auto.webdata?.length > 0) map[auto.id] = { name: auto.name || 'Unknown', webdata: auto.webdata }
    })
    return map
  }, [data.automations])

  const allCompanyDocumentsMap = useMemo(() => {
    const map: Record<string, any[]> = {}
    if (Array.isArray(allCompanyDocuments)) {
      allCompanyDocuments.forEach(doc => {
        if (doc.company_id) {
          if (!map[doc.company_id]) map[doc.company_id] = []
          map[doc.company_id].push(doc)
        }
      })
    }
    return map
  }, [allCompanyDocuments])

  const requirementMap = useMemo(() => {
    if (!task?.requirements) return {}
    const map: Record<string, any[]> = {}
    task.requirements.forEach((req: any) => {
      const cat = req.category || "other"
      if (!map[cat]) map[cat] = []
      map[cat].push(req)
    })
    return map
  }, [task])

  const handleSort = (colKey: string) => {
    setSortCol(prev => prev === colKey ? (setSortDir(d => d === "asc" ? "desc" : "asc"), colKey) : (setSortDir("asc"), colKey))
  }

  const handlePreview = useCallback(async (req: any, col: ColDef, locked?: boolean) => {
    const status = getCellStatus(req, col, documentsByIndividual, allCompanyDocuments)
    if (status.docs.length === 0) return

    try {
      const documentPreviews = await Promise.all(status.docs.map(async (doc) => {
        const { data: signData } = await supabase.storage.from('kyc-documents').createSignedUrl(doc.file_path, 3600);
        let fields = [];
        if (doc.document_id) {
          const { data: kycData } = await supabase.from('acc_portal_kyc').select('fields').eq('id', doc.document_id).single();
          if (kycData) fields = kycData.fields || [];
        }
        return {
          id: doc.id,
          fileUrl: signData?.signedUrl,
          extractedData: doc.extracted_details || {},
          fields,
          name: kycDocsMap.get(doc.document_id)?.display_name || req.display_name || 'Document',
          originalDoc: doc
        };
      }));

      setPreviewDocument({ documents: documentPreviews.filter(Boolean), currentIndex: 0, locked });
      setPreviewDialogOpen(true);
    } catch (err) { console.error(err); toast.error('Preview failed'); }
  }, [documentsByIndividual, allCompanyDocuments, kycDocsMap])

  const handleDeleteDocument = async (doc: any) => {
    if (!confirm("Are you sure you want to delete this document?")) return
    try {
      const targetTable = doc.director_id ? "acc_portal_directors_documents" : "acc_portal_kyc_uploads"
      await supabase.from(targetTable).delete().eq("id", doc.id)
      onRefresh?.()
      setPreviewDialogOpen(false)
      toast.success("Document deleted")
    } catch { toast.error("Delete failed") }
  }

  if (!task) return null

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0 z-40">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-slate-800">Requirements Matrix</h3>
          <div className="flex gap-1.5">
            {lockState.processingLocked && <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]"><Lock className="h-3 w-3 mr-1" />Processing Locked</Badge>}
            {lockState.issuanceLocked && <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]"><Lock className="h-3 w-3 mr-1" />Issuance Locked</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {clientDraft && clientDraft.status !== "applied" && (
            <Button variant="outline" size="sm" className="h-8 text-xs border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100" onClick={() => setReviewOpen(true)}>
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Review Draft
            </Button>
          )}
          <Button size="sm" className="h-8 text-xs bg-custom-blue hover:bg-blue-700" onClick={() => setIsSendRequirementsOpen(true)}>
            <Send className="h-3.5 w-3.5 mr-1.5" /> Send Requirements
          </Button>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="flex-1 overflow-auto relative custom-scrollbar">
        <Table className="border-separate border-spacing-0 min-w-full">
          <TableHeader className="sticky top-0 z-30 text-white">
            <TableRow className="bg-custom-blue hover:bg-custom-blue">
              <TableHead className="w-12 h-12 text-center border-b border-r sticky left-0 top-0 bg-custom-blue z-40 text-[10px] font-bold uppercase text-white">#</TableHead>
              <TableHead className="min-w-[280px] h-12 border-b border-r sticky left-12 top-0 bg-custom-blue z-40 text-[10px] font-bold uppercase text-white">
                Requirement Name
              </TableHead>
              {columns.map(col => {
                const { bgColor, Icon } = getEntityTypeConfig(col.type)
                return (
                  <TableHead key={col.id} className={cn("min-w-[180px] h-12 border-b border-r top-0 bg-custom-blue p-0 text-white", bgColor)}>
                    <span className="flex justify-between px-4">
                      <span className={cn("flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold")}>
                        <Icon className="h-3 w-3" />
                        <span className="">{col.label}</span>
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider">{col.subLabel}</span>
                    </span>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {CATEGORY_ORDER.map(cat => {
              const reqs = requirementMap[cat] || []
              if (reqs.length === 0) return null
              const isLocked = isSectionLocked(task, cat)
              const isExpanded = expandedCategories.has(cat)

              return (
                <React.Fragment key={cat}>
                  {/* Category Separator Row */}
                  <TableRow 
                    className="bg-slate-100/80 hover:bg-slate-200/80 cursor-pointer transition-colors"
                    onClick={() => setExpandedCategories(prev => {
                      const next = new Set(prev)
                      if (next.has(cat)) next.delete(cat)
                      else next.add(cat)
                      return next
                    })}
                  >
                    <TableCell 
                      colSpan={columns.length + 2} 
                      className="h-10 py-0 px-4 border-b border-slate-200 sticky left-0 z-20"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                        <span className="text-sm font-black uppercase tracking-widest text-slate-700">{CATEGORY_LABELS[cat]}</span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-white border-slate-300 text-slate-500">{reqs.length}</Badge>
                        {isLocked && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[9px] h-4"><Lock className="h-2.5 w-2.5 mr-1" />Locked</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Requirements Rows */}
                  {isExpanded && reqs.map((req, idx) => {
                    const docMeta = kycDocsMap.get(req.document_id || req.document_ids?.[0])
                    const docName = docMeta?.display_name || req.display_name || req.name || "Untitled"

                    return (
                      <TableRow key={req.id || idx} className="group hover:bg-slate-50/50">
                        <TableCell className="h-12 text-center text-[10px] font-mono text-slate-400 border-b border-r sticky left-0 bg-white group-hover:bg-slate-50/50 z-10">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="h-12 border-b border-r sticky left-12 bg-white group-hover:bg-slate-50/50 z-10">
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-slate-700 line-clamp-1">{docName}</span>
                            {req.description && <span className="text-[9px] text-slate-400 line-clamp-1">{req.description}</span>}
                          </div>
                        </TableCell>
                        {columns.map(col => {
                          const status = getCellStatus(req, col, documentsByIndividual, allCompanyDocuments)
                          
                          return (
                            <TableCell key={col.id} className="h-12 text-center border-b border-r p-0">
                              <div className="flex items-center justify-center h-full px-2">
                                {status.type === "na" ? (
                                  <span className="text-[9px] font-bold text-slate-300 uppercase italic">N/A</span>
                                ) : status.type === "view" ? (
                                  <div className="flex items-center gap-1">
                                    <div className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md border bg-green-50 border-green-200 shadow-sm">
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                      <span className="text-sm font-bold uppercase tracking-wider text-green-600">Valid</span>
                                    </div>
                                    {(() => {
                                      const latestDoc = getLatestDoc(status.docs)
                                      const dateStr = formatDocDate(latestDoc)
                                      return dateStr ? (
                                        <div className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded text-[9.5px] font-medium text-green-600 bg-white border border-green-200 shadow-sm">
                                          <Calendar className="h-3 w-3 opacity-70" />
                                          {dateStr}
                                        </div>
                                      ) : null
                                    })()}
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600" onClick={() => handlePreview(req, col, isLocked)}>
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ) : (
                                  // Missing / Not Provided State
                                  <div className="flex flex-col items-center gap-1">
                                    {isLocked ? (
                                      <div className="flex items-center gap-1 text-red-500 bg-red-50 px-2 py-0.5 rounded border border-red-100">
                                        <AlertCircle className="h-3 w-3" />
                                        <span className="text-[10px] font-black uppercase">Missing</span>
                                      </div>
                                    ) : (
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-7 text-[10px] font-bold text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200"
                                        onClick={() => {
                                          setSelectedDocForUpload({ ...req, person: { id: col.id, full_name: col.label } });
                                          setUploadModalOpen(true);
                                        }}
                                      >
                                        <UploadCloud className="h-3.5 w-3.5 mr-1" /> Upload
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Modals & Dialogs */}
      {selectedDocForUpload && (
        <UploadModal
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onSuccess={() => { onRefresh?.(); setUploadModalOpen(false); }}
          entityId={String(selectedDocForUpload.person?.id)}
          entityName={selectedDocForUpload.person?.full_name}
          selectedDocumentId={selectedDocForUpload.document_id || selectedDocForUpload.document_ids?.[0]}
          documentName={kycDocsMap.get(selectedDocForUpload.document_id || selectedDocForUpload.document_ids?.[0])?.display_name || "Document"}
        />
      )}

      {previewDocument && (
        <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
          <DialogContent className="max-w-[90vw] w-full max-h-[90vh] flex flex-col p-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              {previewDocument.documents.map((doc: any) => (
                <ExtractionPreview
                  key={doc.id}
                  documentName={doc.name}
                  extractedData={doc.extractedData}
                  fields={doc.fields}
                  fileUrl={doc.fileUrl}
                  expanded={true}
                  showSaveButton={!previewDocument.locked}
                  onDelete={() => handleDeleteDocument(doc.originalDoc)}
                  onDialogClose={() => setPreviewDialogOpen(false)}
                />
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <SendRequirementsDialog
        isOpen={isSendRequirementsOpen}
        onClose={() => setIsSendRequirementsOpen(false)}
        selectedApplicant={task.applicant_name}
        tasks={[task]}
        taskClassRequirements={{ [task.id]: { requirements: task.requirements, job_level: task.job_level, job_specific_questions: task.job_specific_questions } }}
        automationWebdataMap={automationWebdataMap}
        allCompanyDocuments={allCompanyDocumentsMap}
        allIndividualDocuments={documentsByIndividual}
        jobFieldsRecord={jobFieldsRecord}
        relationshipData={[]} 
      />

      <ReviewSubmissionDialog
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        task={task}
        taskClassRequirements={{ [task.id]: { requirements: task.requirements, job_level: task.job_level, job_specific_questions: task.job_specific_questions } }}
        automationWebdataMap={automationWebdataMap}
        allCompanyDocuments={allCompanyDocumentsMap}
        allIndividualDocuments={documentsByIndividual}
        jobFieldsRecord={jobFieldsRecord}
        onRefresh={onRefresh}
      />
    </div>
  )
}