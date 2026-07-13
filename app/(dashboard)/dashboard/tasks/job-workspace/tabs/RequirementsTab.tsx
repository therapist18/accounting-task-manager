// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2, AlertCircle, UploadCloud, Eye, Lock, 
  ChevronDown, ChevronRight, XCircle, User,
  Briefcase, UserCheck, Users2, HeartPulse, Search, 
  AlertTriangle, Filter, Plus, Minus, Zap, Wand2,
  ArrowUpDown, ArrowUp, ArrowDown
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import { toast } from "sonner"
import { REQUIREMENTS_LOCK_STAGE_IDS } from "../../utils/taskManagerData"
import { getLatestDocumentExpiryDate } from "../../utils/automationComputedFunctions"
import { resolveAutomationFieldData } from "../../../tasks-requirements/utils/resolveAutomationFieldData"
import { isTemplateEligible, fetchMasterFields, buildTemplateGenerationInfo } from "../../../tasks-requirements/utils/templateGenerationData"
import { resolveTemplatePlaceholders } from "../../../tasks-requirements/TemplateGenerationDialog"
import { UploadModal } from "@/app/generic-components/UploadModal"
import { ReviewSubmissionDialog } from "../../../tasks-requirements/components/ReviewSubmissionDialog"
import { SendRequirementsDialog } from "../../../tasks-requirements/components/SendRequirementsDialog"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import type { JobWorkspaceData } from "../fetchJobWorkspaceData"

/**
 * UI Theme Helper
 */
function getColTheme(type: string) {
  switch (type) {
    case "company": return { headerBg: "bg-slate-700", cellBg: "bg-slate-50/30" }
    case "director": return { headerBg: "bg-indigo-700", cellBg: "bg-indigo-50/20" }
    case "dependant": return { headerBg: "bg-blue-600", cellBg: "bg-blue-50/20" }
    case "principal": return { headerBg: "bg-[#3182ce]", cellBg: "bg-blue-50/30" }
    case "understudy": return { headerBg: "bg-cyan-700", cellBg: "bg-cyan-50/20" }
    default: return { headerBg: "bg-slate-600", cellBg: "bg-gray-50/30" }
  }
}

/**
 * Logic Helpers
 */
const CATEGORY_ORDER = ["general", "processing", "issuance", "other"]
const CATEGORY_LABELS: Record<string, string> = {
  general: "GENERAL REQUIREMENTS",
  processing: "PROCESSING REQUIREMENTS",
  issuance: "ISSUANCE REQUIREMENTS",
  other: "OTHER REQUIREMENTS",
}

function getLockState(task: any) {
  const stages = task?.stages || {}
  const done = (id: string) => stages[id]?.status === "completed"
  return {
    processingLocked: done(REQUIREMENTS_LOCK_STAGE_IDS.PROCESSING) && !done(REQUIREMENTS_LOCK_STAGE_IDS.DEFERRED),
    issuanceLocked: done(REQUIREMENTS_LOCK_STAGE_IDS.ISSUANCE),
  }
}

function getLatestDoc(docs: any[]) {
  if (!docs || docs.length === 0) return null
  return docs.reduce((prev, curr) =>
    new Date(curr.created_at || 0) > new Date(prev.created_at || 0) ? curr : prev
  )
}

function checkApplicability(colType: string, requirement: any): boolean {
  const allowedTypes = requirement.entityTypes || (requirement.applicantType ? [requirement.applicantType] : [])
  return allowedTypes.length === 0 || allowedTypes.includes(colType)
}

/**
 * SUB-COMPONENT: RequirementCell
 * Isolated component to handle hook-based status fetching per cell 
 * to avoid "Rendered fewer hooks than expected" error.
 */
function RequirementCell({ task, req, col, docsByInd, allCompanyDocs, kycDocsMap, onUpload, onPreview }) {
  const statusInfo = useMemo(() => {
    if (!checkApplicability(col.type, req)) return { type: "na" as const, docs: [] }
    const docIds = req.document_ids || (req.document_id ? [req.document_id] : [])
    if (!docIds.length) return { type: "na" as const, docs: [] }
    
    let found = col.type === "company" 
      ? (allCompanyDocs[col.id] || []).filter(d => docIds.includes(d.document_id))
      : (docsByInd[col.id] || []).filter(d => docIds.includes(d.document_id))
    
    return { type: found.length > 0 ? "view" as const : "upload" as const, docs: found }
  }, [req, col, docsByInd, allCompanyDocs])

  const [status, setStatus] = useState<any>(null)
  const theme = getColTheme(col.type)

  useEffect(() => {
    if (statusInfo.type === 'view') {
      const latest = getLatestDoc(statusInfo.docs)
      const docId = latest.document_id
      const docMeta = kycDocsMap.get(docId)
      if (!docMeta) return

      getLatestDocumentExpiryDate(
        col.type === 'company' ? (task.company_id || col.id) : col.id, 
        [docId], 
        undefined, 
        { doc: latest, type: docMeta }
      ).then(expiryDate => {
        if (expiryDate.includes('Not Found')) {
          setStatus({ status: 'valid', label: 'Valid', color: 'text-green-600', bgColor: 'bg-green-50', border: 'border-green-200', expiryDate: 'No Expiry' })
          return
        }
        const expiry = new Date(expiryDate)
        const isExpired = expiry < new Date()
        setStatus({
          status: isExpired ? 'expired' : 'valid',
          label: isExpired ? 'Expired' : 'Valid',
          color: isExpired ? 'text-red-600' : 'text-green-600',
          bgColor: isExpired ? 'bg-red-50' : 'bg-green-50',
          border: isExpired ? 'border-red-200' : 'border-green-200',
          expiryDate: `${String(expiry.getDate()).padStart(2, '0')}/${String(expiry.getMonth() + 1).padStart(2, '0')}/${expiry.getFullYear()}`
        })
      })
    }
  }, [statusInfo, task, col, kycDocsMap])

  if (statusInfo.type === 'na') {
    return (
      <TableCell className={cn("p-0 border-r align-middle text-center", theme.cellBg)}>
        <span className="text-[10px] font-bold text-slate-300 tracking-widest">N/A</span>
      </TableCell>
    )
  }

  return (
    <TableCell className={cn("p-0 border-r align-middle", theme.cellBg)}>
      <div className="grid grid-cols-[90px_120px_1fr] h-full items-center">
        <div className="px-2 text-[10px] text-slate-500 text-center border-r border-slate-200/50 h-full flex items-center justify-center font-medium">
          {status?.expiryDate || "-"}
        </div>
        <div className="px-2 text-center border-r border-slate-200/50 h-full flex items-center justify-center">
          {statusInfo.type === 'view' ? (
            status ? (
              <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-[9px] font-bold uppercase tracking-wider", status.bgColor, status.color, status.border)}>
                {status.status === 'valid' && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                {status.label}
              </div>
            ) : <div className="w-3 h-3 border border-t-transparent animate-spin rounded-full" />
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border bg-amber-50 text-amber-600 border-amber-100 text-[9px] font-bold uppercase tracking-wider">
               Pending
            </div>
          )}
        </div>
        <div className="px-2 text-center flex items-center justify-center gap-3">
          {statusInfo.type === 'view' ? (
            <button onClick={() => onPreview(req, col)} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-[10px] font-bold uppercase tracking-tight transition-colors">
              <Eye className="h-3 w-3" /> View
            </button>
          ) : (
            <button onClick={() => onUpload(req, col)} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-[10px] font-bold uppercase tracking-tight transition-colors">
              <UploadCloud className="h-3 w-3" /> Upload
            </button>
          )}
        </div>
      </div>
    </TableCell>
  )
}

export function RequirementsTab(props: RequirementsTabProps) {
  const { data, onRefresh, autoOpenSendDialog } = props
  const { task, kycDocsMap, documentsByIndividual, allCompanyDocuments } = data
  const router = useRouter()

  // State
  const [searchQuery, setSearchQuery] = useState("")
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({ key: 'name', direction: 'asc' })
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(CATEGORY_ORDER))
  const [expandedRequirements, setExpandedRequirements] = useState<Set<string>>(new Set())
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedDocForUpload, setSelectedDocForUpload] = useState<any>(null)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewDocument, setPreviewDocument] = useState<any>(null)

  // Dialog states (controlled or local)
  const [localReviewOpen, setLocalReviewOpen] = useState(false)
  const reviewOpen = props.openReviewDraft !== undefined ? props.openReviewDraft : localReviewOpen
  const setReviewOpen = props.setOpenReviewDraft !== undefined ? props.setOpenReviewDraft : setLocalReviewOpen

  const [localSendOpen, setLocalSendOpen] = useState(false)
  const isSendRequirementsOpen = props.openSendRequirements !== undefined ? props.openSendRequirements : localSendOpen
  const setIsSendRequirementsOpen = props.setOpenSendRequirements !== undefined ? props.setOpenSendRequirements : setLocalSendOpen

  const columns = useMemo(() => {
    if (!task) return []
    const cols: any[] = []
    const participants = task.participants_details || []
    const applicant = task.applicant_details || {}
    let priority = 1

    if (applicant?.type === "company") cols.push({ type: "company", id: applicant.id, label: applicant.name, subLabel: "APPLICANT", priority: priority++ })
    else {
      const companyPart = participants.find(p => p.type === "company")
      if (companyPart) cols.push({ type: "company", id: companyPart.id, label: companyPart.name, subLabel: "ENTITY", priority: priority++ })
    }

    if (applicant?.type === "individual") {
      const role = Array.isArray(applicant.role) ? applicant.role : [applicant.role]
      let type = "principal"
      if (role.some(r => ["director", "shareholder"].includes(r))) type = "director"
      else if (role.some(r => ["dependant", "dependent"].includes(r))) type = "dependant"
      cols.push({ type, id: applicant.id, label: applicant.name, subLabel: type.toUpperCase(), priority: priority++ })
    }

    participants.filter(p => p.type === "individual" && p.id !== applicant.id).forEach(p => {
      const role = Array.isArray(p.role) ? p.role : [p.role]
      let type = "principal"
      if (role.some(r => ["director", "shareholder"].includes(r))) type = "director"
      else if (role.some(r => ["dependant", "dependent"].includes(r))) type = "dependant"
      else if (role.includes("understudy")) type = "understudy"
      cols.push({ type, id: p.id, label: p.name, subLabel: type.toUpperCase(), priority: priority++ })
    })

    return cols.sort((a, b) => a.priority - b.priority)
  }, [task])

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

  // Sorting and Filtering Logic
  const processedRequirements = useMemo(() => {
    if (!task?.requirements) return {}
    
    let filtered = task.requirements.filter(r => {
      const search = searchQuery.toLowerCase()
      const name = (r.name || "").toLowerCase()
      const displayName = (r.display_name || "").toLowerCase()
      return name.includes(search) || displayName.includes(search)
    })

    if (sortConfig.direction) {
      filtered = [...filtered].sort((a, b) => {
        const valA = (sortConfig.key === 'name' ? (a.name || a.display_name) : (kycDocsMap.get(a.document_id)?.display_name || "")).toLowerCase()
        const valB = (sortConfig.key === 'name' ? (b.name || b.display_name) : (kycDocsMap.get(b.document_id)?.display_name || "")).toLowerCase()
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }

    const map: Record<string, any[]> = {}
    filtered.forEach(req => {
      const cat = req.category || "other"
      if (!map[cat]) map[cat] = []
      map[cat].push(req)
    })
    return map
  }, [task, searchQuery, sortConfig, kycDocsMap])

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const handlePreview = useCallback(async (req: any, col: any) => {
    const docIds = req.document_ids || [req.document_id]
    const docs = col.type === "company" 
      ? (allCompanyDocumentsMap[col.id] || []).filter(d => docIds.includes(d.document_id))
      : (documentsByIndividual[col.id] || []).filter(d => docIds.includes(d.document_id))

    if (!docs.length) return
    try {
      const previews = await Promise.all(docs.map(async (doc) => {
        const { data: signData } = await supabase.storage.from('kyc-documents').createSignedUrl(doc.file_path, 3600);
        return {
          id: doc.id,
          fileUrl: signData?.signedUrl,
          extractedData: doc.extracted_details || {},
          name: kycDocsMap.get(doc.document_id)?.display_name || req.display_name || 'Document',
          originalDoc: doc
        };
      }));
      setPreviewDocument({ documents: previews.filter(Boolean) });
      setPreviewDialogOpen(true);
    } catch { toast.error('Preview failed') }
  }, [documentsByIndividual, allCompanyDocumentsMap, kycDocsMap])

  if (!task) return null
  const totalCols = columns.length + 3

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 shrink-0 gap-4">
        <div className="flex items-center gap-6">
          <h3 className="text-lg font-bold text-slate-900 whitespace-nowrap">Requirements Matrix</h3>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search requirements..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs border-slate-200 bg-slate-50/50 focus-visible:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-9 px-4 text-xs font-semibold rounded border-slate-200 text-slate-600 shadow-sm bg-white hover:bg-slate-50">
            <Filter className="h-3.5 w-3.5 mr-2 text-slate-400" />
            Filters
          </Button>
          <Button onClick={() => setIsSendRequirementsOpen(true)} className="h-9 px-5 text-xs font-bold bg-[#1a56db] hover:bg-[#1e429f] text-white shadow-sm rounded">
             Send Requirements
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar relative">
        <Table className="border-collapse min-w-full">
          <TableHeader className="sticky top-0 z-40">
            <TableRow className="bg-[#2d3748] hover:bg-[#2d3748] border-none">
              <TableHead className="w-12 text-white text-[10px] font-bold text-center border-r border-slate-600 uppercase">#</TableHead>
              
              <TableHead 
                className="w-[340px] text-white text-[10px] font-bold px-6 border-r border-slate-600 uppercase cursor-pointer hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center justify-between">
                  Requirement
                  {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                </div>
              </TableHead>

              <TableHead 
                className="w-[240px] text-white text-[10px] font-bold px-6 border-r border-slate-600 uppercase cursor-pointer hover:bg-slate-700/50 transition-colors"
                onClick={() => handleSort('docType')}
              >
                <div className="flex items-center justify-between">
                  Document Type
                  {sortConfig.key === 'docType' ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                </div>
              </TableHead>
              
              {columns.map(col => {
                const theme = getColTheme(col.type);
                return (
                  <TableHead key={col.id} className={cn("min-w-[340px] p-0 text-white border-r border-white/10 align-top", theme.headerBg)}>
                    <div className="flex flex-col">
                      <div className="flex flex-col items-center justify-center py-3 px-4 border-b border-white/10">
                        <span className="text-[11px] font-bold uppercase tracking-tight truncate w-full text-center">{col.label}</span>
                        <span className="text-[9px] font-medium opacity-60 mt-0.5">{col.subLabel}</span>
                      </div>
                      <div className="grid grid-cols-[90px_120px_1fr] text-[9px] font-bold uppercase bg-black/10">
                        <div className="py-2 text-center border-r border-white/5">Date</div>
                        <div className="py-2 text-center border-r border-white/5">Status</div>
                        <div className="py-2 text-center">Action</div>
                      </div>
                    </div>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {CATEGORY_ORDER.map(cat => {
              const reqs = processedRequirements[cat] || []
              if (reqs.length === 0) return null
              const isExpanded = expandedCategories.has(cat)

              return (
                <React.Fragment key={cat}>
                  <TableRow 
                    className="bg-slate-50/80 hover:bg-slate-100 cursor-pointer border-b border-slate-200 transition-colors" 
                    onClick={() => setExpandedCategories(prev => {
                      const next = new Set(prev); next.has(cat) ? next.delete(cat) : next.add(cat); return next;
                    })}
                  >
                    <TableCell colSpan={totalCols} className="py-2.5 px-5">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        <span className="text-[10px] font-extrabold text-slate-600 tracking-wider uppercase">
                          {CATEGORY_LABELS[cat]} <span className="ml-1 opacity-60 font-medium">({reqs.length})</span>
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>

                  {isExpanded && reqs.map((req, idx) => {
                    const docMeta = kycDocsMap.get(req.document_id || req.document_ids?.[0])
                    const reqId = req.id || `${cat}-${idx}`
                    const isReqExpanded = expandedRequirements.has(reqId)
                    
                    return (
                      <React.Fragment key={reqId}>
                        <TableRow className="hover:bg-slate-50/50 border-b border-slate-100 group transition-colors">
                          <TableCell className="text-center text-[11px] text-slate-400 font-medium border-r bg-white group-hover:bg-transparent">{idx + 1}</TableCell>
                          
                          <TableCell className="px-6 py-4 border-r align-middle bg-white group-hover:bg-transparent">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-slate-700 leading-tight">
                                  {req.name || req.display_name}
                                </span>
                                {/* Restored Navigation Redirection Icons */}
                                {req.web_automation?.automationId && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); window.open(`/dashboard/tasks/${task.id}?tab=automation&automationId=${req.web_automation.automationId}`, '_blank')}}
                                    className="hover:scale-110 transition-transform"
                                  >
                                    <Zap className="h-3 w-3 text-purple-500 fill-purple-500" />
                                  </button>
                                )}
                                {(req.hasTemplate === true || String(req.hasTemplate) === 'true') && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); window.open(`/dashboard/tasks/${task.id}?tab=templates&documentId=${req.document_id || req.document_ids?.[0]}`, '_blank')}}
                                    className="hover:scale-110 transition-transform"
                                  >
                                    <Wand2 className="h-3 w-3 text-blue-500" />
                                  </button>
                                )}
                              </div>
                              {req.description && <span className="text-[10px] text-slate-400 line-clamp-1">{req.description}</span>}
                            </div>
                          </TableCell>

                          <TableCell className="px-6 py-4 border-r align-middle bg-white group-hover:bg-transparent">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium text-slate-500 italic">
                                {docMeta?.display_name || req.document_type_name || "Document"}
                              </span>
                              {(docMeta?.fields?.length > 0) && (
                                <button 
                                  onClick={() => setExpandedRequirements(p => { const n = new Set(p); n.has(reqId) ? n.delete(reqId) : n.add(reqId); return n })}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-400"
                                >
                                  {isReqExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                </button>
                              )}
                            </div>
                          </TableCell>

                          {columns.map(col => (
                            <RequirementCell 
                              key={col.id}
                              task={task}
                              req={req}
                              col={col}
                              docsByInd={documentsByIndividual}
                              allCompanyDocs={allCompanyDocumentsMap}
                              kycDocsMap={kycDocsMap}
                              onPreview={handlePreview}
                              onUpload={(r, c) => { setSelectedDocForUpload({...r, person: c}); setUploadModalOpen(true); }}
                            />
                          ))}
                        </TableRow>
                        
                        {isReqExpanded && docMeta?.fields?.map((field, fIdx) => (
                           <TableRow key={`${reqId}-f-${fIdx}`} className="bg-slate-50/30 border-b border-slate-100">
                             <TableCell className="border-r" />
                             <TableCell className="pl-10 border-r py-2"><span className="text-[10px] text-slate-400 uppercase font-bold">{field.name}</span></TableCell>
                             <TableCell className="border-r" />
                             {columns.map(col => (
                               <TableCell key={col.id} className="text-center py-2 border-r bg-white/50">
                                 <span className="text-[10px] font-medium text-slate-600">-</span>
                               </TableCell>
                             ))}
                           </TableRow>
                        ))}
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Preserve Modals & Dialogs */}
      {selectedDocForUpload && (() => {
        const docId = selectedDocForUpload.document_id || selectedDocForUpload.document_ids?.[0]
        const docMeta = kycDocsMap.get(docId)
        const isCompany = selectedDocForUpload.person.type === 'company'
        return (
          <UploadModal
            isOpen={uploadModalOpen}
            onClose={() => setUploadModalOpen(false)}
            onSuccess={() => { onRefresh?.(); setUploadModalOpen(false); }}
            documentName={docMeta?.display_name || selectedDocForUpload.name}
            entityName={selectedDocForUpload.person.label}
            entityId={String(selectedDocForUpload.person.id)}
            selectedDocumentId={docId}
            targetTable={isCompany ? 'acc_portal_kyc_uploads' : 'acc_portal_directors_documents'}
            isCompanyUpload={isCompany}
          />
        )
      })()}

      <SendRequirementsDialog
        isOpen={isSendRequirementsOpen}
        onClose={() => setIsSendRequirementsOpen(false)}
        selectedApplicant={task.applicant_name}
        tasks={[task]}
        taskClassRequirements={{ [task.id]: { requirements: task.requirements, job_level: task.job_level, job_specific_questions: task.job_specific_questions } }}
        allCompanyDocuments={allCompanyDocumentsMap}
        allIndividualDocuments={documentsByIndividual}
        kycDocsMap={kycDocsMap}
      />

      <ReviewSubmissionDialog
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        task={task}
        taskClassRequirements={{ [task.id]: { requirements: task.requirements, job_level: task.job_level, job_specific_questions: task.job_specific_questions } }}
        allCompanyDocuments={allCompanyDocumentsMap}
        allIndividualDocuments={documentsByIndividual}
        onRefresh={onRefresh}
      />

      {previewDocument && (
        <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
          <DialogContent className="max-w-[90vw] w-full max-h-[90vh] flex flex-col p-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              {previewDocument.documents.map((doc: any) => (
                <ExtractionPreview
                  key={doc.id}
                  documentName={doc.name}
                  extractedData={doc.extractedData}
                  fileUrl={doc.fileUrl}
                  expanded={true}
                  onDialogClose={() => setPreviewDialogOpen(false)}
                />
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}