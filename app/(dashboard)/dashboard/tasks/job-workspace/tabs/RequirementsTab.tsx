// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import {
  CheckCircle2, AlertCircle, UploadCloud, Eye, FileText, Lock, Loader2,
  ChevronDown, ChevronRight, Trash2, RefreshCw, FileUp, XCircle, User,
  Briefcase, UserCheck, Users2, HeartPulse, Send, Search, AlertTriangle, Check, X, ArrowUpDown, ArrowUp, ArrowDown
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
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
  general: "General",
  processing: "Processing",
  issuance: "Issuance",
  other: "Other",
}
const CATEGORY_COLORS: Record<string, string> = {
  general: "bg-slate-100 text-slate-700",
  processing: "bg-amber-100 text-amber-700",
  issuance: "bg-blue-100 text-blue-700",
  other: "bg-purple-100 text-purple-700",
}

function getLockState(task: any) {
  const stages = task?.stages || {}
  const done = (id: string) => stages[id]?.status === "completed"
  return {
    processingLocked: done(REQUIREMENTS_LOCK_STAGE_IDS.PROCESSING) && !done(REQUIREMENTS_LOCK_STAGE_IDS.DEFERRED),
    issuanceLocked: done(REQUIREMENTS_LOCK_STAGE_IDS.ISSUANCE),
  }
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
    case "director": return { bgColor: "bg-indigo-655", Icon: UserCheck }
    case "dependant": return { bgColor: "bg-blue-500", Icon: Users2 }
    case "principal": return { bgColor: "bg-blue-700", Icon: UserCheck }
    case "sponsor": return { bgColor: "bg-green-600", Icon: HeartPulse }
    case "understudy": return { bgColor: "bg-cyan-600", Icon: User }
    default: return { bgColor: "bg-blue-600", Icon: User }
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
  const docIds = req.document_ids || (req.document_id ? [req.document_id] : [])
  if (!docIds.length) return { type: "na" as const, docs: [] }
  if (!checkApplicability(col.type, req)) return { type: "na" as const, docs: [] }
  let found: any[] = []
  if (col.type === "company") found = (allCompanyDocs || []).filter((d: any) => docIds.includes(d.document_id))
  else found = (docsByInd[col.id] || []).filter((d: any) => docIds.includes(d.document_id))
  return { type: found.length > 0 ? "view" as const : "upload" as const, docs: found }
}

export function RequirementsTab({ data, onRefresh }: RequirementsTabProps) {
  const { task, kycDocsMap, documentsByIndividual, allDocuments, allCompanyDocuments } = data
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["general", "processing", "issuance"]))
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedDocForUpload, setSelectedDocForUpload] = useState<any>(null)
  
  // Premium Split Preview Modal States
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewDocument, setPreviewDocument] = useState<{
    documents: Array<{
      id: string;
      fileUrl: string;
      extractedData: any;
      fields: any[];
      name?: string;
      uploadedAt?: string;
      originalDoc: any;
    }>;
    currentIndex: number;
    locked?: boolean;
  } | null>(null)

  // Dialog Wiring States
  const [reviewOpen, setReviewOpen] = useState(false)
  const [isSendRequirementsOpen, setIsSendRequirementsOpen] = useState(false)
  
  // Cache and helper state for client send dialog
  const [jobFieldsRecord, setJobFieldsRecord] = useState<Record<string, any>>({})
  const [fieldSourceDataCache, setFieldSourceDataCache] = useState<Record<string, Record<string, any>>>({})
  const [fieldMasterComputedCache, setFieldMasterComputedCache] = useState<Record<string, any>>({})

  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const lockState = useMemo(() => getLockState(task), [task])
  const individualId = task?.individual_id
  const columns = useMemo(() => buildParticipantColumns(task), [task])
  const clientDraft = task?.registry_metadata?.client_requirements_draft

  // Map automations for this task
  const automationWebdataMap = useMemo(() => {
    const map: Record<string, { name: string; webdata: any[] }> = {};
    (data.automations || []).forEach(auto => {
      if (auto.webdata && auto.webdata.length > 0) {
        map[auto.id] = { name: auto.name || 'Unknown', webdata: auto.webdata };
      }
    });
    return map;
  }, [data.automations]);

  // Load Job Fields Record for send requirements dialog
  useEffect(() => {
    const fetchJobFields = async () => {
      const linkedFieldIds = new Set<string>();
      (data.automations || []).forEach(auto => {
        if (auto.webdata && auto.webdata.length > 0) {
          auto.webdata.forEach((field: any) => {
            (field.linkedMasterFields || field.masterFieldIds || []).forEach((id: any) => linkedFieldIds.add(String(id)));
            (field.arrayItems || []).forEach((item: any) => {
              (item.linkedMasterFields || item.masterFieldIds || (item.linkedMasterFieldId ? [item.linkedMasterFieldId] : [])).forEach((id: any) => linkedFieldIds.add(String(id)));
            });
          });
        }
      });
      if (linkedFieldIds.size === 0) return;
      try {
        const { data: fields, error: fieldsError } = await supabase
          .from('tm_job_fields')
          .select('*')
          .in('id', Array.from(linkedFieldIds));
        if (fieldsError) throw fieldsError;
        setJobFieldsRecord((fields || []).reduce((acc: Record<string, any>, field: any) => {
          acc[String(field.id)] = field;
          return acc;
        }, {}));
      } catch (err) {
        console.error('Error fetching job fields in RequirementsTab:', err);
      }
    };
    fetchJobFields();
  }, [data.automations]);

  // Transform allCompanyDocuments array to map format keyed by company_id
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

  const relationshipData = useMemo(() => {
    const participants = task?.participants_details || [];
    return [{
      company: participants.find((p: any) => p.type === 'company') || (task?.applicant_details?.type === 'company' ? task.applicant_details : null),
      principal: participants.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')),
      directors: participants.filter((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('director') : p.role === 'director')),
      dependants: participants.filter((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('dependant') : p.role === 'dependant')),
    }];
  }, [task]);

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

  const handleSort = useCallback((colKey: string) => {
    setSortCol(prev => prev === colKey ? (setSortDir(d => d === "asc" ? "desc" : "asc"), colKey) : (setSortDir("asc"), colKey))
  }, [])

  const handleUploadAction = useCallback((req: any) => {
    // Get actual KYC definition to pass down proper fields info
    const docId = req.document_id || req.document_ids?.[0]
    const docDefinition = kycDocsMap.get(docId)

    setSelectedDocForUpload({
      ...req,
      doc: docDefinition || req,
      fields: docDefinition?.fields || req.fields || []
    })
    setUploadModalOpen(true)
  }, [kycDocsMap])

  // Premium split view preview loader
  const handlePreview = useCallback(async (req: any, col: ColDef, locked?: boolean) => {
    const status = getCellStatus(req, col, documentsByIndividual, allCompanyDocuments)
    if (status.docs.length === 0) return

    try {
      const documentPreviews = await Promise.all(status.docs.map(async (doc) => {
        if (!doc.file_path) {
          console.warn('Document missing file_path:', doc.id);
          return null;
        }

        const { data: signData, error: signError } = await supabase.storage
          .from('kyc-documents')
          .createSignedUrl(doc.file_path, 3600);

        if (signError) throw signError;

        let fields = [];
        if (doc.document_id) {
          try {
            const { data: kycData } = await supabase
              .from('acc_portal_kyc')
              .select('fields')
              .eq('id', doc.document_id)
              .single();
            if (kycData) fields = kycData.fields || [];
          } catch (err) { console.warn('Error fetching KYC fields:', err); }
        }

        const docName = kycDocsMap.get(doc.document_id)?.display_name || req.display_name || req.name || 'Document';

        return {
          id: doc.id,
          fileUrl: signData.signedUrl,
          extractedData: doc.extracted_details || {},
          fields: fields,
          name: docName,
          uploadedAt: doc.created_at,
          originalDoc: doc
        };
      }));

      const validPreviews = documentPreviews.filter(Boolean);
      if (validPreviews.length > 0) {
        setPreviewDocument({
          documents: validPreviews,
          currentIndex: 0,
          locked: !!locked
        });
        setPreviewDialogOpen(true);
      }
    } catch (err) {
      console.error('Error generating document preview:', err);
      toast.error('Failed to preview document.');
    }
  }, [documentsByIndividual, allCompanyDocuments, kycDocsMap])

  // Save changes to extracted document details
  const handleSaveDocument = useCallback(async (doc: any, editedData?: any) => {
    if (!doc) return;
    const toastId = toast.loading('Saving changes...');
    try {
      const isIndividual = !!doc.director_id;
      const targetTable = isIndividual ? 'acc_portal_directors_documents' : 'acc_portal_kyc_uploads';
      let rawData = editedData || doc.edited_details || doc.extracted_details || {};
      const dataToSave = Object.keys(rawData).reduce((clean, key) => {
        const value = rawData[key];
        if (key === 'file' || key === 'document' || key === 'fileUrl' || key === 'fileName' || key === 'documentName' || key === 'type') return clean;
        if (value !== null && value !== undefined) {
          if (typeof value === 'object' && !Array.isArray(value)) {
            if (!value.file && !value.document && !value.extracted_details) clean[key] = value;
          } else {
            clean[key] = value;
          }
        }
        return clean;
      }, {});

      let updatePayload = { extracted_details: dataToSave };

      const { error } = await supabase.from(targetTable).update(updatePayload).eq('id', doc.id);
      if (error) throw error;

      toast.success('Document updated successfully', { id: toastId });
      onRefresh?.();
    } catch (error) {
      console.error('Save error:', error);
      toast.error(`Save failed: ${error.message}`, { id: toastId });
    }
  }, [onRefresh]);

  const handlePreviewDataChange = useCallback((docId, fieldName, value) => {
    setPreviewDocument(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        documents: prev.documents.map(d =>
          d.id === docId
            ? { ...d, extractedData: { ...d.extractedData, [fieldName]: value } }
            : d
        )
      };
    });
  }, []);

  const handleDeleteDocument = useCallback(async (doc: any) => {
    if (!doc?.id) return
    const toastId = toast.loading("Deleting document...")
    try {
      if (doc.file_path) await supabase.storage.from("kyc-documents").remove([doc.file_path])
      const targetTable = doc.director_id ? "acc_portal_directors_documents" : "acc_portal_kyc_uploads"
      const { error } = await supabase.from(targetTable).delete().eq("id", doc.id)
      if (error) throw error
      toast.success("Document deleted", { id: toastId })
      setPreviewDialogOpen(false)
      onRefresh?.()
    } catch { toast.error("Failed to delete document", { id: toastId }) }
  }, [onRefresh])

  const handleUploadComplete = useCallback(() => {
    setUploadModalOpen(false)
    toast.success("Document uploaded")
    onRefresh?.()
  }, [onRefresh])

  if (!task) return <div className="h-full flex items-center justify-center text-muted-foreground"><p className="text-sm">No task data</p></div>

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#FAFAFC]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-800">Requirements</h3>
          <span className="text-xs text-slate-500 font-medium">{task.applicant_name}</span>
          {lockState.processingLocked && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200"><Lock className="h-3 w-3 mr-0.5" />Processing Locked</Badge>}
          {lockState.issuanceLocked && <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200"><Lock className="h-3 w-3 mr-0.5" />Issuance Locked</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {clientDraft && clientDraft.status !== "applied" && clientDraft.status !== "rejected" && (
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100" onClick={() => setReviewOpen(true)}>
              <AlertTriangle className="h-3 w-3" /> Review Submission
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            onClick={() => setIsSendRequirementsOpen(true)}
            className="h-7 text-[10px] gap-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm"
          >
            <Send className="h-3 w-3" /> Send Requirements
          </Button>
        </div>
      </div>

      {/* Client submission banner */}
      {clientDraft && (
        <div className="mx-6 mt-3 flex items-center justify-between px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-md shrink-0 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="font-semibold">Client has submitted requirements draft</span>
            <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 capitalize font-bold">{clientDraft.status}</Badge>
          </div>
          <Button variant="outline" size="sm" className="h-6 text-[10px] bg-white text-amber-700 border-amber-300 hover:bg-amber-100 font-semibold" onClick={() => setReviewOpen(true)}>Review</Button>
        </div>
      )}

      {/* Scrollable table area */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="space-y-4">
          {CATEGORY_ORDER.map(cat => {
            const reqs = requirementMap[cat]
            if (!reqs?.length) return null
            const isExpanded = expandedCategories.has(cat)
            const locked = isSectionLocked(task, cat)

            // Sort reqs
            const sortedReqs = [...reqs]
            if (sortCol === `cat-${cat}`) {
              sortedReqs.sort((a, b) => {
                const aName = (kycDocsMap.get(a.document_id || a.document_ids?.[0])?.display_name || a.display_name || a.name || "Unknown").toLowerCase()
                const bName = (kycDocsMap.get(b.document_id || b.document_ids?.[0])?.display_name || b.display_name || b.name || "Unknown").toLowerCase()
                return sortDir === "asc" ? aName.localeCompare(bName) : bName.localeCompare(aName)
              })
            } else if (sortCol?.startsWith(`col-${cat}-`)) {
              const colType = sortCol.replace(`col-${cat}-`, "")
              const col = columns.find(c => c.type === colType)
              if (col) {
                sortedReqs.sort((a, b) => {
                  const aSt = getCellStatus(a, col, documentsByIndividual, allCompanyDocuments)
                  const bSt = getCellStatus(b, col, documentsByIndividual, allCompanyDocuments)
                  const aVal = aSt.type === "view" ? 1 : aSt.type === "na" ? 2 : 0
                  const bVal = bSt.type === "view" ? 1 : bSt.type === "na" ? 2 : 0
                  return sortDir === "asc" ? aVal - bVal : bVal - aVal
                })
              }
            }

            return (
              <Card key={cat} className="border-slate-200 overflow-hidden shadow-sm bg-white">
                <div
                  className="flex items-center justify-between px-4 py-2.5 bg-slate-50/50 border-b border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors select-none"
                  onClick={() => setExpandedCategories(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n })}
                >
                  <div className="flex items-center gap-2.5">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded shadow-sm", CATEGORY_COLORS[cat])}>{CATEGORY_LABELS[cat] || cat}</span>
                    <span className="text-xs text-slate-500 font-medium">{reqs.length} item{reqs.length > 1 ? "s" : ""}</span>
                  </div>
                  {locked && (
                    <Badge variant="secondary" className="text-[10px] bg-amber-50 text-amber-700 border-amber-250 font-bold gap-1 py-0.5 px-2">
                      <Lock className="h-3 w-3" /> Section Locked
                    </Badge>
                  )}
                </div>

                {isExpanded && (
                  <div className="max-h-[400px] overflow-auto relative border-t border-slate-100 custom-scrollbar">
                    <Table className="border-separate border-spacing-0 w-full min-w-max">
                      <TableHeader className="sticky top-0 z-20 bg-slate-100/90 backdrop-blur-sm">
                        <TableRow className="bg-slate-100 hover:bg-transparent">
                          <TableHead className="h-9 text-[10px] font-bold text-slate-700 uppercase w-12 pl-4 sticky left-0 bg-slate-100 z-30 border-r border-b border-slate-200 text-center">#</TableHead>
                          <TableHead className={cn(
                            "h-9 text-[10px] font-bold text-slate-700 uppercase min-w-[220px] sticky left-12 bg-slate-100 z-30 border-r border-b border-slate-200 cursor-pointer select-none hover:bg-slate-200/80 transition-colors",
                            sortCol === `cat-${cat}` && "text-blue-600 bg-blue-50/50"
                          )} onClick={() => handleSort(`cat-${cat}`)}>
                            <div className="flex items-center gap-1.5 justify-between">
                              <span>Document</span>
                              {sortCol === `cat-${cat}` ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                            </div>
                          </TableHead>
                          {columns.map(col => {
                            const { bgColor, Icon } = getEntityTypeConfig(col.type)
                            const colKey = `col-${cat}-${col.type}`
                            const isActive = sortCol === colKey
                            return (
                              <TableHead key={`hdr-${col.type}-${col.id}`}
                                className={cn(
                                  "h-9 text-[10px] font-bold uppercase text-center min-w-[150px] p-0 border-r border-b border-slate-200 cursor-pointer select-none hover:bg-slate-200/80 transition-colors",
                                  isActive && "bg-blue-50/50 text-blue-600"
                                )}
                                onClick={() => handleSort(colKey)}
                              >
                                <div className="flex flex-col items-center gap-0.5 py-1 px-2 justify-center h-full">
                                  <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded text-white text-[9px] font-bold", bgColor)}>
                                    <Icon className="h-2.5 w-2.5" />
                                    <span className="truncate max-w-[80px]">{col.label}</span>
                                  </div>
                                  <span className="flex items-center gap-0.5 text-[8px] text-slate-500 uppercase tracking-wider font-bold">
                                    {col.subLabel}
                                    {isActive ? (sortDir === "asc" ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />) : <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />}
                                  </span>
                                </div>
                              </TableHead>
                            )
                          })}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedReqs.map((req: any, idx: number) => {
                          const docMeta = kycDocsMap.get(req.document_id || req.document_ids?.[0])
                          const docName = docMeta?.display_name || docMeta?.name || req.display_name || req.name || "Unknown"

                          return (
                            <TableRow key={req.id || req.uniqueId || idx} className="hover:bg-slate-50/50 border-b border-slate-100">
                              <TableCell className="text-[11px] text-slate-400 font-mono py-2.5 pl-4 sticky left-0 bg-white z-10 border-r border-b border-slate-250 text-center">{idx + 1}</TableCell>
                              <TableCell className="py-2.5 pl-3 pr-2 sticky left-12 bg-white z-10 border-r border-b border-slate-250 max-w-[220px] truncate" title={docName}>
                                <span className="text-xs font-semibold text-slate-700">{docName}</span>
                              </TableCell>
                              {columns.map(col => {
                                const cs = getCellStatus(req, col, documentsByIndividual, allCompanyDocuments)
                                const cellLocked = locked || false

                                return (
                                  <TableCell key={`cell-${req.id}-${col.type}-${col.id}`} className="py-2.5 text-center align-middle border-r border-b border-slate-250">
                                    {cs.type === "na" ? (
                                      <span className="text-[10px] text-slate-350 italic font-semibold">N/A</span>
                                    ) : cs.type === "view" ? (
                                      <div className="flex items-center justify-center gap-1.5">
                                        <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 gap-1 font-bold py-0.5 shadow-sm"><CheckCircle2 className="h-3 w-3" /> Valid</Badge>
                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50" title="Preview" onClick={() => handlePreview(req, col, cellLocked)}>
                                          <Eye className="h-3.5 w-3.5" />
                                        </Button>
                                        {!cellLocked && (
                                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" title="Delete" onClick={() => handleDeleteDocument(cs.docs[0])}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                    ) : cellLocked ? (
                                      <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-400 border-slate-200 gap-1 font-bold py-0.5"><Lock className="h-3 w-3" /> Locked</Badge>
                                    ) : (
                                      <Button variant="ghost" size="sm" className="h-7 text-[10px] text-blue-600 hover:bg-blue-50 gap-1 font-bold" onClick={() => handleUploadAction(req)}>
                                        <UploadCloud className="h-3.5 w-3.5" /> Upload
                                      </Button>
                                    )}
                                  </TableCell>
                                )
                              })}
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </div>

      {selectedDocForUpload && (
        <UploadModal
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onSuccess={handleUploadComplete}
          entityId={String(selectedDocForUpload.person?.id || individualId)}
          entityName={selectedDocForUpload.person?.full_name || task?.applicant_name || "Applicant"}
          selectedDocumentId={selectedDocForUpload.document_id || selectedDocForUpload.document_ids?.[0]}
          documentName={kycDocsMap.get(selectedDocForUpload.document_id || selectedDocForUpload.document_ids?.[0])?.display_name || "Document"}
        />
      )}

      {/* Premium split extraction preview modal */}
      {previewDocument && previewDocument.documents.length > 0 && (
        <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
          <DialogContent className="max-w-[95vw] w-full max-h-[95vh] flex flex-col p-0 overflow-hidden bg-slate-50 shadow-2xl">
            <DialogHeader className="p-4 border-b bg-white shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-xl">
                    <div className="flex items-center gap-2.5">
                      <div className="bg-white p-2 rounded-lg border shadow-sm">
                        <FileText className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex flex-col">
                        <p className="text-base font-bold text-slate-800 line-clamp-1">{previewDocument?.documents[0]?.name || 'Document'}</p>
                      </div>
                    </div>
                  </DialogTitle>
                </div>
                <div className="flex items-center gap-2">
                  {previewDocument?.locked && (
                    <Badge variant="outline" className="text-[10px] uppercase font-bold border-amber-300 text-amber-700 bg-amber-50">
                      Locked / Read-Only
                    </Badge>
                  )}
                  <div className="text-xs font-semibold bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-100 shadow-sm">
                    {previewDocument?.documents.length || 0} File(s)
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto">
              <div className="space-y-6 mx-auto">
                {previewDocument?.documents.map((doc, index) => (
                  <div key={doc.id || index} className="p-2 lg:p-4">
                    <ExtractionPreview
                      documentName={doc.name}
                      extractedData={doc.extractedData}
                      fields={doc.fields}
                      fileUrl={doc.fileUrl}
                      expanded={true}
                      showSaveButton={!previewDocument?.locked}
                      onSave={previewDocument?.locked ? undefined : (data) => handleSaveDocument(doc.originalDoc, data)}
                      onDataChange={previewDocument?.locked ? undefined : (fieldName, value) => handlePreviewDataChange(doc.id, fieldName, value)}
                      onDelete={previewDocument?.locked ? undefined : () => handleDeleteDocument(doc.originalDoc)}
                      onDialogClose={() => setPreviewDialogOpen(false)}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t bg-white flex justify-end shrink-0 gap-2">
              <Button variant="outline" onClick={() => setPreviewDialogOpen(false)} className="w-24 font-semibold">Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Wired dialogs */}
      <SendRequirementsDialog
        isOpen={isSendRequirementsOpen}
        onClose={() => setIsSendRequirementsOpen(false)}
        selectedApplicant={task.applicant_name}
        tasks={[task]}
        taskClassRequirements={{ [task.id]: { requirements: task.requirements, job_level: task.job_level, job_specific_questions: task.job_specific_questions } }}
        automationWebdataMap={automationWebdataMap}
        allCompanyDocuments={allCompanyDocumentsMap}
        allIndividualDocuments={documentsByIndividual}
        fieldSourceDataCache={fieldSourceDataCache}
        fieldMasterComputedCache={fieldMasterComputedCache}
        jobFieldsRecord={jobFieldsRecord}
        relationshipData={relationshipData}
      />

      <ReviewSubmissionDialog
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        task={task}
        taskClassRequirements={{ [task.id]: { requirements: task.requirements, job_level: task.job_level, job_specific_questions: task.job_specific_questions } }}
        automationWebdataMap={automationWebdataMap}
        allCompanyDocuments={allCompanyDocumentsMap}
        allIndividualDocuments={documentsByIndividual}
        fieldSourceDataCache={fieldSourceDataCache}
        fieldMasterComputedCache={fieldMasterComputedCache}
        jobFieldsRecord={jobFieldsRecord}
        onRefresh={onRefresh}
      />
    </div>
  )
}
