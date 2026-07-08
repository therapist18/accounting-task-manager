// @ts-nocheck
"use client"

import React, { useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { 
  CheckCircle2, AlertCircle, XCircle, Copy, Check, ExternalLink, 
  Printer, FileText, Send, Database, HelpCircle, Lock, Link as LinkIcon,
  Info, CheckSquare, ClipboardList, Eye, User, Briefcase
} from "lucide-react"
import { resolveTargetEntityIdImpl, resolveVariableValueImpl, getArrayFieldDataImpl } from "../../tasks/utils/fieldResolution"
import { cn } from "@/lib/utils"

function humanizeVariableName(name: string): string {
  if (!name) return "Field"
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function getFieldLabel(field: any): string {
  return field?.efnsDisplayName || field?.name || humanizeVariableName(field?.variableName) || "Field"
}

interface SendRequirementsDialogProps {
  isOpen: boolean
  onClose: () => void
  selectedApplicant: string
  tasks: any[]
  taskClassRequirements: Record<string, any>
  automationWebdataMap: Record<string, { name: string; webdata: any[] }>
  allCompanyDocuments: Record<string, any[]>
  allIndividualDocuments: Record<string, any[]>
  fieldSourceDataCache: Record<string, Record<string, any>>
  fieldMasterComputedCache: Record<string, any>
  jobFieldsRecord: Record<string, any>
  relationshipData: any[]
  kycDocsMap?: Map<string, any>
}

export function SendRequirementsDialog({
  isOpen,
  onClose,
  selectedApplicant,
  tasks,
  taskClassRequirements,
  automationWebdataMap,
  allCompanyDocuments,
  allIndividualDocuments,
  fieldSourceDataCache = {},
  fieldMasterComputedCache = {},
  jobFieldsRecord,
  relationshipData,
  kycDocsMap = new Map()
}: SendRequirementsDialogProps) {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState("status")

  const clientRequirements = useMemo(() => {
    const docs: any[] = []
    const questions: any[] = []
    const fields: any[] = []

    tasks.forEach((task, groupIndex) => {
      const classReqs = taskClassRequirements[task.id]
      if (!classReqs) return

      if (classReqs.requirements) {
        classReqs.requirements.forEach((req: any) => {
          if (req.is_client_requirement) {
            docs.push({ ...req, task, groupIndex })
          }
        })
      }

      if (classReqs.job_specific_questions) {
        classReqs.job_specific_questions.forEach((q: any) => {
          if (q.is_client_requirement) {
            questions.push({ ...q, task, groupIndex })
          }
        })
      }

      const reqs = classReqs.requirements || []
      reqs.forEach((req: any) => {
        if (req.web_automation?.automationId) {
          const auto = automationWebdataMap[req.web_automation.automationId]
          if (auto?.webdata) {
            auto.webdata.forEach((field: any) => {
              if (field.is_client_requirement) {
                if (!fields.some(f => f.variableName === field.variableName && f.groupIndex === groupIndex)) {
                  fields.push({
                    ...field,
                    automationId: req.web_automation.automationId,
                    automationName: auto.name,
                    task,
                    groupIndex
                  })
                }
              }
            })
          }
        }
      })
    })

    return { docs, questions, fields }
  }, [tasks, taskClassRequirements, automationWebdataMap])

  const buildCtx = (automationId: string, fields: any[], groupIndex: number, task: any) => ({
    sourceData: fieldSourceDataCache,
    jobFields: jobFieldsRecord,
    webData: [{ automationId, fields }],
    selectedAutomationId: automationId,
    masterFieldComputedValues: fieldMasterComputedCache,
    relationshipData: relationshipData[groupIndex],
    taskId: task?.id,
    currentIndividualId: task?.individual_id?.toString(),
    task,
  })

  const getDocStatus = (docRequirement: any, task: any) => {
    const docIds = docRequirement.document_ids || (docRequirement.document_id ? [docRequirement.document_id] : [])
    if (docIds.length === 0) return { label: 'Missing', color: 'text-red-600', bgColor: 'bg-red-50', status: 'missing', icon: AlertCircle, date: '-' }

    let foundDocs: any[] = []
    const companyId = task.company_id
    if (companyId && allCompanyDocuments[companyId]) {
      foundDocs.push(...allCompanyDocuments[companyId].filter(doc => docIds.includes(doc.document_id) && doc.status !== 'deleted'))
    }
    const individualId = task.individual_id
    if (individualId && allIndividualDocuments[individualId]) {
      foundDocs.push(...allIndividualDocuments[individualId].filter(doc => docIds.includes(doc.document_id) && doc.status !== 'deleted'))
    }

    if (foundDocs.length === 0) return { label: 'Missing', color: 'text-red-600', bgColor: 'bg-red-50', status: 'missing', icon: AlertCircle, date: '-' }

    const activeDocs = foundDocs.filter(d => d.status === 'active')
    const latestDoc = (activeDocs.length > 0 ? activeDocs : foundDocs).reduce((prev, curr) => new Date(curr.created_at) > new Date(prev.created_at) ? curr : prev)
    const formattedDate = new Date(latestDoc.created_at).toLocaleDateString('en-GB')

    if (activeDocs.length === 0) {
      const draftDocs = foundDocs.filter(d => d.status === 'draft')
      if (draftDocs.length > 0) {
        return { label: 'Drafted', color: 'text-amber-600', bgColor: 'bg-amber-50', status: 'draft', icon: ClipboardList, date: formattedDate }
      }
      return { label: 'Missing', color: 'text-red-600', bgColor: 'bg-red-50', status: 'missing', icon: AlertCircle, date: '-' }
    }

    return { label: 'Received', color: 'text-green-600', bgColor: 'bg-green-50', status: 'valid', icon: CheckCircle2, date: formattedDate }
  }

  const getDocTypeNames = (docRequirement: any): string[] => {
    const docIds = docRequirement.document_ids || (docRequirement.document_id ? [docRequirement.document_id] : [])
    if (docIds.length === 0) return []
    return docIds.map((id: string) => {
      const docType = kycDocsMap.get(id)
      return docType?.display_name || docType?.name || 'Document'
    })
  }

  const getFieldVal = (field: any, task: any, groupIndex: number) => {
    if (['array', 'document', 'computed'].includes(field.fieldType)) return "Complex Mapping"
    const ctx = buildCtx(field.automationId, [field], groupIndex, task)
    const targetEntityId = resolveTargetEntityIdImpl(field, ctx)
    if (targetEntityId == null) return null
    return resolveVariableValueImpl(field, String(targetEntityId), ctx)
  }

  const getArrayVal = (field: any, task: any, groupIndex: number): any[] => {
    const ctx = buildCtx(field.automationId, [field], groupIndex, task)
    return getArrayFieldDataImpl(field, ctx) || []
  }

  const getEntityLabelForRow = (task: any, entityId: any) => {
    if (task?.applicant_details && String(task.applicant_details.id) === String(entityId)) return task.applicant_details.name
    const participant = (task?.participants_details || []).find((p: any) => String(p.id) === String(entityId))
    if (participant) return participant.name
    if (String(task?.company_id) === String(entityId)) return task?.company_name || 'Company'
    return String(entityId)
  }

  const isFieldMissingVal = (val: any) => val === null || val === undefined || val === "" || val === "Missing"

  const clientUrl = useMemo(() => {
    if (typeof window === "undefined" || !tasks?.[0]?.id) return ""
    return `${window.location.origin}/client/fill-requirements?taskId=${tasks[0].id}`
  }, [tasks])

  const copyToClipboard = () => {
    if (!clientUrl) return
    navigator.clipboard.writeText(clientUrl)
    setCopied(true)
    toast.success("Client link copied to clipboard!")
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePrint = () => {
    const printWindow = window.open("", "_blank")
    if (!printWindow) return

    const docRows = clientRequirements.docs.map((doc, idx) => {
      const status = getDocStatus(doc, doc.task)
      const docTypeNames = getDocTypeNames(doc).join(', ')
      return `<tr>
        <td style="padding:8px;border:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:12px">${idx + 1}</td>
        <td style="padding:8px;border:1px solid #e2e8f0;font-weight:600;color:#1e293b">${doc.name}</td>
        <td style="padding:8px;border:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:12px">${docTypeNames}</td>
        <td style="padding:8px;border:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:12px">${status.date}</td>
        <td style="padding:8px;border:1px solid #e2e8f0;text-align:center">
          <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;text-transform:uppercase;${status.bgColor};color:${status.color}">${status.label}</span>
        </td>
      </tr>`
    }).join('')

    const fieldRows = [
      ...clientRequirements.questions.map((q, idx) => {
        const val = q.task.job_specific_answers?.[q.id]
        const isMissing = !val
        return `<tr>
          <td style="padding:8px;border:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:12px">${idx + 1}</td>
          <td style="padding:8px;border:1px solid #e2e8f0;font-weight:600;color:#1e293b">${q.label}</td>
          <td style="padding:8px;border:1px solid #e2e8f0;color:#475569;font-size:12px">${val || 'Not Answered'}</td>
          <td style="padding:8px;border:1px solid #e2e8f0;text-align:center">
            <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;text-transform:uppercase;${isMissing ? 'background:#fef2f2;color:#dc2626' : 'background:#f0fdf4;color:#16a34a'}">${isMissing ? 'Missing' : 'Populated'}</span>
          </td>
        </tr>`
      }),
      ...clientRequirements.fields.map((f, idx) => {
        const isArray = f.fieldType === 'array'
        let displayVal: string
        let isMissing: boolean
        if (isArray) {
          const arrayRows = getArrayVal(f, f.task, f.groupIndex)
          isMissing = arrayRows.length === 0
          displayVal = arrayRows.map((row: any) => {
            const label = getEntityLabelForRow(f.task, row.entityId)
            const items = (f.arrayItems || []).map((item: any) => `${getFieldLabel(item)}: ${row[item.variableName] ?? '-'}`).join(', ')
            return `${label} (${items})`
          }).join(' | ') || 'No Data'
        } else {
          const val = getFieldVal(f, f.task, f.groupIndex)
          isMissing = isFieldMissingVal(val)
          displayVal = val || 'No Data'
        }
        return `<tr>
          <td style="padding:8px;border:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:12px">${clientRequirements.questions.length + idx + 1}</td>
          <td style="padding:8px;border:1px solid #e2e8f0;font-weight:600;color:#1e293b">${getFieldLabel(f)}</td>
          <td style="padding:8px;border:1px solid #e2e8f0;color:#475569;font-size:12px">${displayVal}</td>
          <td style="padding:8px;border:1px solid #e2e8f0;text-align:center">
            <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;text-transform:uppercase;${isMissing ? 'background:#fef2f2;color:#dc2626' : 'background:#f0fdf4;color:#16a34a'}">${isMissing ? 'Missing' : 'Populated'}</span>
          </td>
        </tr>`
      })
    ].join('')

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Requirements Checklist - ${selectedApplicant}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1e293b; }
          h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
          h2 { font-size: 14px; font-weight: 600; color: #64748b; margin-top: 32px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.1em; }
          .meta { font-size: 12px; color: #94a3b8; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          th { background: #f8fafc; padding: 10px 8px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; border: 1px solid #e2e8f0; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <h1>Requirements Checklist</h1>
        <div class="meta">Applicant: ${selectedApplicant} | Generated: ${new Date().toLocaleDateString('en-GB')}</div>
        
        <h2>Document Requirements</h2>
        <table>
          <thead>
            <tr><th style="width:40px">#</th><th>Requirement</th><th style="width:160px">Document Type</th><th style="width:100px">Date</th><th style="width:120px">Status</th></tr>
          </thead>
          <tbody>${docRows}</tbody>
        </table>

        <h2>Information Fields & Questions</h2>
        <table>
          <thead>
            <tr><th style="width:40px">#</th><th>Field / Question</th><th>Value</th><th style="width:120px">Status</th></tr>
          </thead>
          <tbody>${fieldRows}</tbody>
        </table>
      </body>
      </html>
    `)
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 300)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[90vw] w-full max-h-[95vh] flex flex-col bg-white p-0 overflow-hidden rounded-xl border-none shadow-2xl">
        {/* Header Bar */}
        <DialogHeader className="px-8 py-6 bg-white border-b shrink-0 z-40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <Send className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-medium text-slate-800 tracking-tight leading-none">
                  Checklist & Distribution
                </DialogTitle>
                <DialogDescription className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mt-1.5 flex items-center gap-2">
                  <Info className="h-3 w-3" />
                  Applicant: <span className="text-slate-600">{selectedApplicant}</span>
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/50">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-8 py-4 bg-white border-b">
              <TabsList className="bg-slate-100 p-1 h-12 rounded-full w-full max-w-lg">
                <TabsTrigger value="status" className="rounded-full px-6 text-[11px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all">
                  <CheckSquare className="h-3.5 w-3.5 mr-2" />
                  Matrix Checklist
                </TabsTrigger>
                <TabsTrigger value="link" className="rounded-full px-6 text-[11px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all">
                  <LinkIcon className="h-3.5 w-3.5 mr-2" />
                  Client Access Link
                </TabsTrigger>
                <TabsTrigger value="pdf" className="rounded-full px-6 text-[11px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all">
                  <Printer className="h-3.5 w-3.5 mr-2" />
                  Print Checklist
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-hidden">
              {/* TABS CONTENT: MATRIX CHECKLIST */}
              <TabsContent value="status" className="h-full flex flex-col m-0 overflow-auto">
                <ScrollArea className="flex-1">
                  <div className="p-8 space-y-10">
                    
                    {/* Document Requirements Table */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 ml-1">
                        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                          <FileText className="h-4 w-4" />
                        </div>
                        <h3 className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Document Requirements Matrix</h3>
                      </div>
                      
                      <div className="border rounded-xl bg-white overflow-auto shadow-sm w-full">
                        <Table className="min-w-max w-full">
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead className="w-12 py-4 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">#</TableHead>
                              <TableHead className="py-4 px-6 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Requirement Name</TableHead>
                              <TableHead className="w-[160px] py-4 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">Document Type</TableHead>
                              <TableHead className="w-[140px] py-4 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">Date</TableHead>
                              <TableHead className="w-[180px] py-4 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</TableHead>
                              <TableHead className="w-[120px] py-4 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {clientRequirements.docs.map((doc, idx) => {
                              const status = getDocStatus(doc, doc.task)
                              const StatusIcon = status.icon
                              return (
                                <TableRow key={idx} className="group hover:bg-slate-50/50">
                                  <TableCell className="text-center font-mono text-[10px] text-slate-400 font-semibold">{idx + 1}</TableCell>
                                  <TableCell className="px-6 py-4">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-semibold text-slate-800">{doc.name}</span>
                                      {doc.description && <span className="text-[11px] font-medium text-slate-400 line-clamp-1 mt-0.5">{doc.description}</span>}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex flex-col items-center gap-1">
                                      {getDocTypeNames(doc).map((typeName: string, tIdx: number) => (
                                        <Badge key={tIdx} variant="secondary" className="text-[9px] font-semibold uppercase tracking-wider rounded-full px-2 py-0 bg-blue-50 text-blue-600 border-blue-100">
                                          {typeName}
                                        </Badge>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-tighter">{status.date}</span>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className={cn(
                                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border shadow-sm",
                                      status.bgColor, status.color.replace('text-', 'border-')
                                    )}>
                                      <StatusIcon className="h-3 w-3" />
                                      <span className="text-[9px] font-semibold uppercase tracking-wider">{status.label}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full text-blue-600 bg-blue-50/50 hover:bg-blue-100 transition-all shadow-sm">
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Information Fields Table */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 ml-1">
                        <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                          <Database className="h-4 w-4" />
                        </div>
                        <h3 className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Information Fields & Metadata</h3>
                      </div>
                      
                      <div className="border rounded-xl bg-white overflow-auto shadow-sm w-full">
                        <Table className="min-w-max w-full">
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead className="w-12 py-4 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">#</TableHead>
                              <TableHead className="py-4 px-6 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Field / Question</TableHead>
                              <TableHead className="min-w-[200px] py-4 px-6 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Populated Value</TableHead>
                              <TableHead className="w-[180px] py-4 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</TableHead>
                              <TableHead className="w-[120px] py-4 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {/* Questions */}
                            {clientRequirements.questions.map((q, idx) => {
                              const val = q.task.job_specific_answers?.[q.id]
                              const isMissing = !val
                              return (
                                <TableRow key={`q-${idx}`} className="group hover:bg-slate-50/50">
                                  <TableCell className="text-center font-mono text-[10px] text-slate-400 font-semibold">{idx + 1}</TableCell>
                                  <TableCell className="px-6 py-4">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-semibold text-slate-800">{q.label}</span>
                                      <Badge variant="secondary" className="w-fit text-[9px] font-semibold uppercase tracking-wider mt-1 px-1.5 py-0 bg-purple-50 text-purple-600 border-purple-100">Questionnaire</Badge>
                                    </div>
                                  </TableCell>
                                  <TableCell className="px-6 py-4">
                                      <span className={cn(
                                        "text-[11px] font-semibold py-1 px-2.5 rounded-md border",
                                        isMissing ? "text-slate-300 bg-slate-50 italic" : "text-slate-700 bg-white shadow-sm border-slate-200"
                                      )}>
                                        {val || 'Not Answered'}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <div className={cn(
                                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border shadow-sm",
                                        isMissing ? "bg-red-50 border-red-200 text-red-600" : "bg-green-50 border-green-200 text-green-600"
                                      )}>
                                        {isMissing ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                        <span className="text-[9px] font-semibold uppercase tracking-wider">{isMissing ? 'Missing' : 'Populated'}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Button variant="ghost" size="sm" className="h-8 px-4 text-[10px] font-medium text-blue-600 rounded-full hover:bg-blue-50">
                                      Fix
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              )
                            })}

                            {/* Fields */}
                            {clientRequirements.fields.map((f, idx) => {
                              const isArray = f.fieldType === 'array'
                              const arrayRows = isArray ? getArrayVal(f, f.task, f.groupIndex) : []
                              const val = isArray ? null : getFieldVal(f, f.task, f.groupIndex)
                              const isMissing = isArray ? arrayRows.length === 0 : isFieldMissingVal(val)
                              return (
                                <TableRow key={`f-${idx}`} className="group hover:bg-slate-50/50">
                                  <TableCell className="text-center font-mono text-[10px] text-slate-400 font-semibold align-top">{clientRequirements.questions.length + idx + 1}</TableCell>
                                  <TableCell className="px-6 py-4 align-top">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-semibold text-slate-800">{getFieldLabel(f)}</span>
                                      <div className="flex items-center gap-1.5 mt-1">
                                        <Badge variant="secondary" className="w-fit text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0 bg-blue-50 text-blue-600 border-blue-100">{f.automationName}</Badge>
                                        {isArray && (
                                          <Badge variant="secondary" className="w-fit text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0 bg-indigo-50 text-indigo-600 border-indigo-100">Array</Badge>
                                        )}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="px-6 py-4 align-top">
                                    {isArray ? (
                                      arrayRows.length > 0 ? (
                                        <div className="border rounded-md overflow-auto bg-white max-w-full max-h-[250px] relative">
                                          <table className="w-full text-[11px] min-w-max">
                                            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                              <tr>
                                                <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase text-[9px] whitespace-nowrap">Entity</th>
                                                {(f.arrayItems || []).map((item: any) => (
                                                  <th key={item.variableName} className="px-3 py-2 text-left font-semibold text-slate-500 uppercase text-[9px] whitespace-nowrap">
                                                    {getFieldLabel(item)}
                                                  </th>
                                                ))}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {arrayRows.map((row: any, rIdx: number) => (
                                                <tr key={rIdx} className="border-t hover:bg-slate-50/50">
                                                  <td className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">{getEntityLabelForRow(f.task, row.entityId)}</td>
                                                  {(f.arrayItems || []).map((item: any) => (
                                                    <td key={item.variableName} className="px-3 py-2 text-slate-700 whitespace-nowrap">{row[item.variableName] ?? '-'}</td>
                                                  ))}
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <span className="text-[11px] font-semibold py-1 px-2.5 rounded-md border text-slate-300 bg-slate-50 italic">No Data</span>
                                      )
                                    ) : (
                                      <span className={cn(
                                        "text-[11px] font-semibold py-1 px-2.5 rounded-md border",
                                        isMissing ? "text-slate-300 bg-slate-50 italic" : "text-slate-700 bg-white shadow-sm border-slate-200"
                                      )}>
                                        {val || 'No Data'}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center align-top">
                                    <div className={cn(
                                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border shadow-sm",
                                      isMissing ? "bg-red-50 border-red-200 text-red-600" : "bg-green-50 border-green-200 text-green-600"
                                    )}>
                                      {isMissing ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                      <span className="text-[9px] font-semibold uppercase tracking-wider">{isMissing ? 'Missing' : 'Populated'}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center align-top">
                                    <Button variant="ghost" size="sm" className="h-8 px-4 text-[10px] font-medium text-blue-600 rounded-full hover:bg-blue-50">
                                      Edit
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* TABS CONTENT: LINK */}
              <TabsContent value="link" className="h-full flex flex-col justify-center py-6 m-0 p-8 bg-slate-50/50">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-12 max-w-2xl mx-auto text-center space-y-8">
                  <div className="bg-blue-50 p-6 rounded-3xl w-fit mx-auto border-4 border-white shadow-inner">
                    <LinkIcon className="h-12 w-12 text-blue-600" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-xl font-medium text-slate-800 tracking-tight leading-none">External Submission Link</h3>
                    <p className="text-sm font-medium text-slate-500 leading-relaxed px-6">
                      Provide this secure link to the applicant or their HR manager to collect missing documentation and mandatory profile fields.
                    </p>
                  </div>
                  
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4 bg-slate-50 p-5 rounded-2xl border-2 border-dashed border-slate-200 text-sm font-mono text-slate-700 break-all select-all text-left group">
                      <span className="flex-1 font-medium text-blue-600 opacity-80 group-hover:opacity-100 transition-opacity">{clientUrl}</span>
                      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-slate-400 hover:text-blue-600 bg-white shadow-sm border rounded-xl" onClick={copyToClipboard}>
                        {copied ? <Check className="h-6 w-6 text-green-600" /> : <Copy className="h-6 w-6" />}
                      </Button>
                    </div>
                    <div className="flex justify-center gap-4 pt-2">
                      <Button variant="outline" className="h-12 rounded-full px-10 font-medium border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm" onClick={() => window.open(clientUrl, "_blank")}>
                        <ExternalLink className="h-4 w-4 mr-2" /> Live Preview
                      </Button>
                      <Button variant="default" className="h-12 rounded-full px-10 font-medium bg-custom-blue hover:bg-blue-700 shadow-lg transition-all active:scale-95" onClick={copyToClipboard}>
                        <Copy className="h-4 w-4 mr-2" /> {copied ? 'Link Copied' : 'Copy Access Link'}
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* TABS CONTENT: PDF */}
              <TabsContent value="pdf" className="h-full flex flex-col justify-center py-6 m-0 p-8 bg-slate-50/50">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-12 max-w-2xl mx-auto text-center space-y-8">
                  <div className="bg-orange-50 p-6 rounded-3xl w-fit mx-auto border-4 border-white shadow-inner">
                    <Printer className="h-12 w-12 text-orange-500" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-xl font-medium text-slate-800 tracking-tight leading-none">Printable Checklist</h3>
                    <p className="text-sm font-medium text-slate-500 leading-relaxed px-6">
                      Generate a detailed physical report of all outstanding requirements and values for the applicant's internal use.
                    </p>
                  </div>
                  <div className="pt-2">
                    <Button variant="default" className="h-14 rounded-full px-12 font-medium bg-orange-500 hover:bg-orange-600 shadow-xl text-white transition-all active:scale-95" onClick={handlePrint}>
                      <Printer className="h-5 w-5 mr-3" /> Export Checklist as PDF
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <DialogFooter className="bg-white border-t px-8 py-5 shrink-0">
          <Button variant="outline" onClick={onClose} className="h-11 rounded-full px-10 font-medium text-slate-600 border-slate-200 hover:bg-slate-50">
            Cancel & Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}