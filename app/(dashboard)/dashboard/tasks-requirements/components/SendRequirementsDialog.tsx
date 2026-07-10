// @ts-nocheck
"use client"

import React, { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { toast } from "sonner"
import {
  CheckCircle2, AlertCircle, Copy, Check, ExternalLink,
  Printer, FileText, Send, Database, Link as LinkIcon,
  CheckSquare, ClipboardList, Eye, LayoutDashboard,
  ArrowRight, ShieldCheck, HelpCircle, Zap
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
  const [activeTab, setActiveTab] = useState("checklist")
  const router = useRouter()

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
                    sourceName: auto.name,
                    task,
                    groupIndex
                  })
                }
              }
            })
          }
        }
      })

      // Fallback: If no client requirements found, show all requirements (for backward compatibility)
      if (docs.length === 0 && classReqs.requirements?.length > 0) {
        classReqs.requirements.forEach((req: any) => {
          docs.push({ ...req, task, groupIndex })
        })
      }
      if (questions.length === 0 && classReqs.job_specific_questions?.length > 0) {
        classReqs.job_specific_questions.forEach((q: any) => {
          questions.push({ ...q, task, groupIndex })
        })
      }
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
    const requiredCount = docRequirement.requiredDocumentCount || 1
    const missing = { label: 'Action Required', color: 'text-red-600', bgColor: 'bg-red-50', status: 'missing', icon: AlertCircle, date: '-', satisfiedCount: 0, requiredCount }
    if (docIds.length === 0) return missing

    let foundDocs: any[] = []
    const companyId = task.company_id
    if (companyId && allCompanyDocuments[companyId]) {
      foundDocs.push(...allCompanyDocuments[companyId].filter(doc => docIds.includes(doc.document_id) && doc.status !== 'deleted'))
    }
    const individualId = task.individual_id
    if (individualId && allIndividualDocuments[individualId]) {
      foundDocs.push(...allIndividualDocuments[individualId].filter(doc => docIds.includes(doc.document_id) && doc.status !== 'deleted'))
    }

    if (foundDocs.length === 0) return missing

    const activeDocs = foundDocs.filter(d => d.status === 'active')
    const latestDoc = (activeDocs.length > 0 ? activeDocs : foundDocs).reduce((prev, curr) => new Date(curr.created_at) > new Date(prev.created_at) ? curr : prev)
    const formattedDate = new Date(latestDoc.created_at).toLocaleDateString('en-GB')

    // A requirement can accept any of several document types (document_ids is the pool);
    // requiredDocumentCount says how many of the pool must be present, e.g. count=1 means "any one of these".
    if (activeDocs.length >= requiredCount) {
      return {
        label: requiredCount > 1 ? `Verified (${activeDocs.length}/${requiredCount})` : 'Verified',
        color: 'text-green-600', bgColor: 'bg-green-50', status: 'valid', icon: ShieldCheck, date: formattedDate, satisfiedCount: activeDocs.length, requiredCount
      }
    }

    if (activeDocs.length > 0) {
      return {
        label: `${activeDocs.length}/${requiredCount} Provided`,
        color: 'text-amber-600', bgColor: 'bg-amber-50', status: 'partial', icon: ClipboardList, date: formattedDate, satisfiedCount: activeDocs.length, requiredCount
      }
    }

    const draftDocs = foundDocs.filter(d => d.status === 'draft')
    if (draftDocs.length > 0) {
      return { label: 'In Progress', color: 'text-amber-600', bgColor: 'bg-amber-50', status: 'draft', icon: ClipboardList, date: formattedDate, satisfiedCount: 0, requiredCount }
    }
    return missing
  }

  const getDocTypeNames = (docRequirement: any): string[] => {
    const docIds = docRequirement.document_ids || (docRequirement.document_id ? [docRequirement.document_id] : [])
    if (docIds.length === 0) return []
    return docIds.map((id: string) => {
      const docType = kycDocsMap.get(id)
      return docType?.display_name || docType?.name || 'Document'
    })
  }

  const getAcceptedTypesLabel = (docTypeNames: string[], requiredCount: number): string => {
    if (docTypeNames.length <= 1) return docTypeNames[0] || 'Document'
    return requiredCount > 1 ? `Any ${requiredCount} of ${docTypeNames.length}` : `Any 1 of ${docTypeNames.length}`
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

  const stats = useMemo(() => {
    const total = clientRequirements.docs.length + clientRequirements.questions.length + clientRequirements.fields.length;
    let completed = 0;

    clientRequirements.docs.forEach(doc => {
        if (getDocStatus(doc, doc.task).status === 'valid') completed++;
    });
    clientRequirements.questions.forEach(q => {
        if (q.task.job_specific_answers?.[q.id]) completed++;
    });
    clientRequirements.fields.forEach(f => {
        const val = f.fieldType === 'array' ? getArrayVal(f, f.task, f.groupIndex) : getFieldVal(f, f.task, f.groupIndex);
        if (f.fieldType === 'array' ? val.length > 0 : !isFieldMissingVal(val)) completed++;
    });

    return { total, completed, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }, [clientRequirements]);

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

  const handlePrint = async () => {
    const getStatusClass = (statusObj: any) => {
      if (statusObj.status === 'valid') return 'status-valid'
      if (statusObj.status === 'partial') return 'status-partial'
      if (statusObj.status === 'draft') return 'status-draft'
      return 'status-missing'
    }

    const now = new Date()
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const refNo = `REQ-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Math.random().toString(36).substring(2,6).toUpperCase()}`

    const formatAcceptedTypes = (docTypeNames: string[], requiredCount: number) => {
      if (docTypeNames.length <= 1) return docTypeNames[0] || 'Document'
      const label = getAcceptedTypesLabel(docTypeNames, requiredCount)
      const preview = docTypeNames.slice(0, 3).join(' &bull; ') + (docTypeNames.length > 3 ? ` &bull; +${docTypeNames.length - 3} more` : '')
      return `<strong style="color:#1e293b;">${label}</strong><br/><span style="color:#94a3b8; font-size:9px;">${preview}</span>`
    }

    const docRows = clientRequirements.docs.map((doc, idx) => {
      const status = getDocStatus(doc, doc.task)
      const docTypeNames = getDocTypeNames(doc)
      const requiredCount = doc.requiredDocumentCount || 1
      const automationTag = doc.web_automation?.automationId
        ? ' <span style="display:inline-block; font-size:8px; font-weight:700; color:#7c3aed; background:#f5f3ff; border:1px solid #ddd6fe; border-radius:9999px; padding:1px 6px; vertical-align:middle;">&#9889; Automated</span>'
        : ''
      return `<tr>
        <td style="text-align:center; color:#94a3b8; font-family:monospace; font-size:9px;">${String(idx + 1).padStart(2,'0')}</td>
        <td style="font-weight:600; color:#1e293b;">${doc.name}${automationTag}</td>
        <td style="color:#64748b; font-size:9.5px;">${formatAcceptedTypes(docTypeNames, requiredCount)}</td>
        <td style="text-align:center; color:#64748b; font-size:9.5px; white-space:nowrap;">${status.date}</td>
        <td style="text-align:center;">
          <span class="status-badge ${getStatusClass(status)}">${status.label}</span>
        </td>
      </tr>`
    }).join('')

    const fieldCards = [
      ...clientRequirements.questions.map((q, idx) => {
        const val = q.task.job_specific_answers?.[q.id]
        const isMissing = !val
        return `<div class="field-card ${isMissing ? 'field-missing' : 'field-ok'}">
          <div class="field-card-top">
            <span class="field-num">${String(idx + 1).padStart(2,'0')}</span>
            <span class="field-name">${q.label}</span>
            <span class="status-dot ${isMissing ? 'dot-missing' : 'dot-valid'}"></span>
          </div>
          <div class="field-value">${val || '<span style="color:#cbd5e1;font-style:italic;">Pending Input</span>'}</div>
        </div>`
      }),
      ...clientRequirements.fields.map((f, idx) => {
        const isArray = f.fieldType === 'array'
        let displayVal: string
        let isMissing: boolean
        if (isArray) {
          const arrayRows = getArrayVal(f, f.task, f.groupIndex)
          isMissing = arrayRows.length === 0
          if (isMissing) {
            displayVal = '<span style="color:#cbd5e1;font-style:italic;">Pending Input</span>'
          } else {
            displayVal = `<ul style="margin:0; padding-left: 14px;">` + arrayRows.map((row: any) => {
              const label = getEntityLabelForRow(f.task, row.entityId)
              const items = (f.arrayItems || []).map((item: any) => `<strong>${getFieldLabel(item)}:</strong> ${row[item.variableName] ?? '-'}`).join(', ')
              return `<li style="margin-bottom:3px;"><strong style="color:#1e293b;">${label}</strong> &rarr; ${items}</li>`
            }).join('') + `</ul>`
          }
        } else {
          const val = getFieldVal(f, f.task, f.groupIndex)
          isMissing = isFieldMissingVal(val)
          displayVal = val || '<span style="color:#cbd5e1;font-style:italic;">Pending Input</span>'
        }
        return `<div class="field-card ${isMissing ? 'field-missing' : 'field-ok'} ${isArray ? 'field-wide' : ''}">
          <div class="field-card-top">
            <span class="field-num">${String(clientRequirements.questions.length + idx + 1).padStart(2,'0')}</span>
            <span class="field-name">${getFieldLabel(f)}</span>
            <span class="status-dot ${isMissing ? 'dot-missing' : 'dot-valid'}"></span>
          </div>
          <div class="field-value">${displayVal}</div>
        </div>`
      })
    ].join('')

    const htmlContent = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #0f172a; line-height: 1.4; background: #ffffff; }

        /* HEADER: brand + title + progress in one compact band */
        .header { position: relative; padding: 20px 36px 16px; border-bottom: 3px solid #2563eb; }
        .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
        .brand { display: flex; flex-direction: column; gap: 2px; }
        .brand-logo { font-size: 10px; font-weight: 800; color: #2563eb; text-transform: uppercase; letter-spacing: 0.18em; }
        .brand-title { font-size: 16px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; margin-top: 2px; }
        .header-meta { text-align: right; display: flex; gap: 18px; }
        .meta-item { display: flex; flex-direction: column; gap: 1px; }
        .meta-label { font-size: 7px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; }
        .meta-value { font-size: 10.5px; font-weight: 600; color: #334155; }

        .progress-row { display: flex; align-items: center; gap: 14px; margin-top: 14px; }
        .progress-bar-bg { flex: 1; height: 7px; background: #e2e8f0; border-radius: 99px; overflow: hidden; }
        .progress-bar-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #2563eb, #7c3aed); }
        .progress-summary { font-size: 10px; color: #64748b; font-weight: 600; white-space: nowrap; }
        .progress-percent { font-size: 15px; font-weight: 800; color: #0f172a; white-space: nowrap; }

        /* CONTENT */
        .content { padding: 18px 36px 8px; }
        .section-header { display: flex; align-items: center; gap: 10px; margin: 18px 0 8px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; }
        .section-header:first-child { margin-top: 0; }
        .section-number { width: 20px; height: 20px; background: #2563eb; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; flex-shrink: 0; }
        .section-title { font-size: 11px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.06em; }
        .section-count { font-size: 9px; font-weight: 600; color: #94a3b8; background: #f1f5f9; padding: 1px 7px; border-radius: 99px; }

        /* DOCUMENT TABLE */
        table { width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 10px; }
        th { background-color: #f1f5f9; padding: 6px 10px; text-align: left; font-weight: 700; color: #475569; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; font-size: 8px; letter-spacing: 0.05em; }
        td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; color: #334155; page-break-inside: avoid; }
        tr:nth-child(even) td { background-color: #fafbfc; }
        tr:last-child td { border-bottom: none; }

        /* FIELD CARD GRID */
        .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 12px; margin-bottom: 10px; }
        .field-card { border: 1px solid #eef2f7; border-radius: 5px; padding: 5px 9px; background: #fafbfc; page-break-inside: avoid; }
        .field-card.field-wide { grid-column: 1 / -1; }
        .field-card.field-missing { background: #fef7f7; border-color: #fbdcdc; }
        .field-card-top { display: flex; align-items: center; gap: 5px; margin-bottom: 1px; }
        .field-num { font-size: 7px; color: #94a3b8; font-family: 'Courier New', monospace; }
        .field-name { font-size: 9.5px; font-weight: 700; color: #1e293b; flex: 1; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .dot-valid { background: #16a34a; }
        .dot-missing { background: #dc2626; }
        .field-value { font-size: 9.5px; color: #475569; padding-left: 11px; word-break: break-word; }
        .field-value ul { list-style: none; }

        /* STATUS BADGES */
        .status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 9999px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; }
        .status-missing { background-color: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        .status-valid { background-color: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
        .status-partial { background-color: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
        .status-draft { background-color: #fffbeb; color: #d97706; border: 1px solid #fde68a; }

        /* FOOTER */
        .footer { margin-top: 20px; padding: 12px 36px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
        .footer-left { font-size: 8px; color: #94a3b8; font-weight: 500; }
        .footer-right { font-size: 8px; color: #94a3b8; font-weight: 500; }
        .footer-brand { font-weight: 700; color: #64748b; }

        /* WATERMARK */
        .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 70px; font-weight: 900; color: rgba(37, 99, 235, 0.025); letter-spacing: 0.1em; text-transform: uppercase; pointer-events: none; white-space: nowrap; z-index: 0; }
      </style>
      <div class="watermark">CONFIDENTIAL</div>

      <div class="header">
        <div class="header-top">
          <div class="brand">
            <div class="brand-logo">Accounting Task Manager</div>
            <div class="brand-title">Requirement Checklist Report &middot; ${selectedApplicant}</div>
          </div>
          <div class="header-meta">
            <div class="meta-item"><span class="meta-label">Ref No.</span><span class="meta-value">${refNo}</span></div>
            <div class="meta-item"><span class="meta-label">Generated</span><span class="meta-value">${dateStr}, ${timeStr}</span></div>
            <div class="meta-item"><span class="meta-label">Classification</span><span class="meta-value">Confidential</span></div>
          </div>
        </div>
        <div class="progress-row">
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${stats.percent}%"></div></div>
          <span class="progress-summary">${stats.completed} of ${stats.total} items addressed</span>
          <span class="progress-percent">${stats.percent}%</span>
        </div>
      </div>

      <div class="content">
        <div class="section-header">
          <div class="section-number">1</div>
          <div class="section-title">Document Requirements</div>
          <div class="section-count">${clientRequirements.docs.length} items</div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:32px; text-align:center;">#</th>
              <th>Requirement</th>
              <th style="width:190px">Accepted Types</th>
              <th style="width:80px; text-align:center;">Date</th>
              <th style="width:120px; text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>${docRows}</tbody>
        </table>

        <div class="section-header">
          <div class="section-number">2</div>
          <div class="section-title">Information & Context Fields</div>
          <div class="section-count">${clientRequirements.questions.length + clientRequirements.fields.length} items</div>
        </div>
        <div class="field-grid">${fieldCards}</div>
      </div>

      <div class="footer">
        <div class="footer-left"><span class="footer-brand">Accounting Task Manager</span> &mdash; Automated Compliance Report</div>
        <div class="footer-right">${dateStr} &nbsp;&bull;&nbsp; ${refNo}</div>
      </div>
    `

    const element = document.createElement('div')
    element.innerHTML = htmlContent
    element.style.width = '800px'
    element.style.position = 'relative'
    element.style.background = '#ffffff'
    document.body.appendChild(element)

    try {
      const html2pdf = (await import('html2pdf.js')).default
      await html2pdf()
        .set({
          margin: [0, 0, 0, 0],
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            letterRendering: true,
          },
          jsPDF: {
            unit: 'mm',
            format: 'a4',
            orientation: 'portrait',
          },
          filename: `Requirement_Dashboard_${selectedApplicant.replace(/\s+/g, '_')}_${now.toISOString().slice(0, 10)}.pdf`,
        })
        .from(element)
        .save()
      toast.success('PDF exported successfully!')
    } catch (err) {
      toast.error('Failed to export PDF. Please try again.')
    } finally {
      document.body.removeChild(element)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[1050px] w-[95vw] max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
        
        {/* Modern Header Widget */}
        <header className="bg-white border-b px-8 py-6 shrink-0 shadow-sm z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="h-14 w-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200 shrink-0">
                <LayoutDashboard className="h-7 w-7" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold text-slate-900 tracking-tight">
                  Requirement Dashboard
                </DialogTitle>
                <div className="flex items-center gap-3 mt-1.5 text-slate-500">
                  <Badge variant="outline" className="bg-slate-50 font-medium px-2.5 py-0.5 text-slate-700 border-slate-200 text-xs shadow-sm">
                    {selectedApplicant}
                  </Badge>
                  <span className="text-slate-300">•</span>
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Internal Review Mode</span>
                </div>
              </div>
            </div>

            {/* Progress Card */}
            <div className="bg-slate-900 text-white rounded-xl p-4 min-w-[260px] shadow-lg flex flex-col justify-center border border-slate-800 shrink-0">
               <div className="flex justify-between items-end mb-2.5 px-1">
                  <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">Total Completion</span>
                  <span className="text-lg font-bold leading-none">{stats.percent}%</span>
               </div>
               <Progress value={stats.percent} className="h-2 bg-slate-700" indicatorClassName="bg-blue-400" />
               <p className="text-[11px] mt-2.5 px-1 text-slate-300 font-medium">
                <strong className="text-white">{stats.completed}</strong> of <strong className="text-white">{stats.total}</strong> requirements satisfied
               </p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="px-8 bg-white border-b shadow-sm z-0 relative shrink-0">
              <TabsList className="bg-transparent h-14 p-0 space-x-6">
                <TabsTrigger 
                  value="checklist" 
                  className="rounded-none border-b-2 border-transparent px-2 py-4 text-sm font-semibold text-slate-500 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all"
                >
                  <CheckSquare className="h-4 w-4 mr-2" />
                  Action Checklist
                </TabsTrigger>
                <TabsTrigger 
                  value="link" 
                  className="rounded-none border-b-2 border-transparent px-2 py-4 text-sm font-semibold text-slate-500 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all"
                >
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Share Access
                </TabsTrigger>
                <TabsTrigger 
                  value="pdf" 
                  className="rounded-none border-b-2 border-transparent px-2 py-4 text-sm font-semibold text-slate-500 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Export Report
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-auto relative">
              
              {/* TABS CONTENT: CHECKLIST */}
              <TabsContent value="checklist" className="h-full flex flex-col m-0 data-[state=active]:flex overflow-auto bg-slate-50/50">
                  <div className="p-8 space-y-12">
                    
                    {/* Document Requirements */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between ml-1">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shadow-sm">
                            <FileText className="h-4 w-4" />
                          </div>
                          <h3 className="text-sm font-bold text-slate-800">Document Requirements</h3>
                        </div>
                      </div>
                      
                      <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm w-full">
                        <div className="overflow-x-auto w-full">
                          <Table className="min-w-max w-full">
                            <TableHeader className="bg-slate-50/80 border-b">
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="w-12 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">#</TableHead>
                                <TableHead className="py-3 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Requirement</TableHead>
                                <TableHead className="w-[200px] py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Accepted Types</TableHead>
                                <TableHead className="w-[180px] py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</TableHead>
                                <TableHead className="w-[80px] py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Details</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {clientRequirements.docs.map((doc, idx) => {
                                const status = getDocStatus(doc, doc.task)
                                const StatusIcon = status.icon
                                const isMissing = status.status === 'missing'
                                const docTypeNames = getDocTypeNames(doc)
                                
                                return (
                                  <TableRow key={idx} className={cn("group transition-colors", isMissing ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-slate-50/60")}>
                                    <TableCell className="text-center font-mono text-xs text-slate-400 font-semibold">{idx + 1}</TableCell>
                                    <TableCell className="px-6 py-4">
                                      <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5">
                                          <span className={cn("text-sm font-semibold", isMissing ? "text-red-900" : "text-slate-800")}>{doc.name}</span>
                                          {doc.web_automation?.automationId && (
                                            <button
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); window.open(`/dashboard/tasks/${doc.task.id}?tab=automation&automationId=${doc.web_automation.automationId}`, '_blank', 'noopener,noreferrer') }}
                                              className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-purple-600 rounded-full pl-1 pr-2 py-0.5 shadow-sm ring-2 ring-purple-100 hover:bg-purple-700 hover:ring-purple-200 transition-colors shrink-0"
                                              title={`Generated by automation: ${doc.web_automation.automationName || 'View automation'}`}
                                            >
                                              <Zap className="h-3 w-3" fill="currentColor" /> Automated
                                            </button>
                                          )}
                                        </div>
                                        {doc.description && <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">{doc.description}</span>}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      {docTypeNames.length > 1 ? (
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <button type="button" className="mx-auto">
                                              <Badge variant="secondary" className="text-[10px] font-semibold bg-blue-50 text-blue-700 border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors">
                                                {getAcceptedTypesLabel(docTypeNames, doc.requiredDocumentCount || 1)}
                                              </Badge>
                                            </button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-64 p-0" align="center">
                                            <Command>
                                              <CommandList>
                                                <CommandGroup heading="Accepted document types">
                                                  {docTypeNames.map((name, i) => (
                                                    <CommandItem key={i} className="text-xs">{name}</CommandItem>
                                                  ))}
                                                </CommandGroup>
                                              </CommandList>
                                            </Command>
                                          </PopoverContent>
                                        </Popover>
                                      ) : (
                                        <Badge variant="secondary" className="text-[10px] font-semibold bg-slate-100 text-slate-600 border-slate-200">
                                          {docTypeNames[0] || 'Document'}
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <div className={cn(
                                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm",
                                        status.bgColor, status.color.replace('text-', 'border-')
                                      )}>
                                        <StatusIcon className="h-3.5 w-3.5" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">{status.label}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all rounded-full">
                                        <ArrowRight className="h-4 w-4" />
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

                    {/* Information Fields & Questions */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between ml-1">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg shadow-sm">
                            <Database className="h-4 w-4" />
                          </div>
                          <h3 className="text-sm font-bold text-slate-800">Information & Context Fields</h3>
                        </div>
                      </div>
                      
                      <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm w-full">
                        <div className="overflow-x-auto w-full">
                          <Table className="min-w-max w-full">
                            <TableHeader className="bg-slate-50/80 border-b">
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="w-12 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">#</TableHead>
                                <TableHead className="py-3 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Requested Field</TableHead>
                                <TableHead className="min-w-[300px] py-3 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Value</TableHead>
                                <TableHead className="w-[180px] py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {/* Questions */}
                              {clientRequirements.questions.map((q, idx) => {
                                const val = q.task.job_specific_answers?.[q.id]
                                const isMissing = !val
                                return (
                                  <TableRow key={`q-${idx}`} className={cn("group transition-colors", isMissing ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-slate-50/60")}>
                                    <TableCell className="text-center font-mono text-xs text-slate-400 font-semibold">{idx + 1}</TableCell>
                                    <TableCell className="px-6 py-4">
                                      <div className="flex flex-col">
                                        <span className={cn("text-sm font-semibold", isMissing ? "text-red-900" : "text-slate-800")}>{q.label}</span>
                                        <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1 mt-1 uppercase tracking-wider">
                                          <HelpCircle className="h-3 w-3" /> Questionnaire
                                        </span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="px-6 py-4">
                                      {isMissing ? (
                                        <div className="flex items-center gap-2 text-red-400/80 italic text-sm font-medium bg-white w-fit px-3 py-1.5 rounded-lg border border-red-100 shadow-sm">
                                          Pending Input
                                        </div>
                                      ) : (
                                        <span className="text-sm font-medium text-slate-700 bg-white shadow-sm border border-slate-200 py-1.5 px-3 rounded-lg inline-block">
                                          {val}
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <div className={cn(
                                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm",
                                        isMissing ? "bg-red-50 border-red-200 text-red-600" : "bg-green-50 border-green-200 text-green-600"
                                      )}>
                                        {isMissing ? <AlertCircle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                                        <span className="text-[10px] font-bold uppercase tracking-wider">{isMissing ? 'Action Required' : 'Populated'}</span>
                                      </div>
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
                                  <TableRow key={`f-${idx}`} className={cn("group transition-colors", isMissing ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-slate-50/60")}>
                                    <TableCell className="text-center font-mono text-xs text-slate-400 font-semibold align-top pt-5">
                                      {clientRequirements.questions.length + idx + 1}
                                    </TableCell>
                                    <TableCell className="px-6 py-4 align-top">
                                      <div className="flex flex-col">
                                        <span className={cn("text-sm font-semibold", isMissing ? "text-red-900" : "text-slate-800")}>{getFieldLabel(f)}</span>
                                        <div className="flex items-center gap-2 mt-1.5 text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                                          {isArray && (
                                            <>
                                              <span>•</span>
                                              <span className="text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded shadow-sm border border-indigo-100">List Format</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="px-6 py-4 align-top">
                                      {isArray ? (
                                        arrayRows.length > 0 ? (
                                          <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white shadow-sm max-w-full relative">
                                            <table className="w-full text-xs text-left min-w-[500px]">
                                              <thead className="bg-slate-50 border-b border-slate-100">
                                                <tr>
                                                  <th className="px-4 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-wider whitespace-nowrap">Entity Record</th>
                                                  {(f.arrayItems || []).map((item: any) => (
                                                    <th key={item.variableName} className="px-4 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-wider whitespace-nowrap">
                                                      {getFieldLabel(item)}
                                                    </th>
                                                  ))}
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-100">
                                                {arrayRows.map((row: any, rIdx: number) => (
                                                  <tr key={rIdx} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">{getEntityLabelForRow(f.task, row.entityId)}</td>
                                                    {(f.arrayItems || []).map((item: any) => (
                                                      <td key={item.variableName} className="px-4 py-3 text-slate-600 whitespace-nowrap">{row[item.variableName] ?? '-'}</td>
                                                    ))}
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-2 text-red-400/80 italic text-sm font-medium bg-white w-fit px-3 py-1.5 rounded-lg border border-red-100 shadow-sm">
                                            Pending Input
                                          </div>
                                        )
                                      ) : (
                                        isMissing ? (
                                          <div className="flex items-center gap-2 text-red-400/80 italic text-sm font-medium bg-white w-fit px-3 py-1.5 rounded-lg border border-red-100 shadow-sm">
                                            Pending Input
                                          </div>
                                        ) : (
                                          <span className="text-sm font-medium text-slate-700 bg-white shadow-sm border border-slate-200 py-1.5 px-3 rounded-lg inline-block break-all">
                                            {val}
                                          </span>
                                        )
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center align-top pt-5">
                                      <div className={cn(
                                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm",
                                        isMissing ? "bg-red-50 border-red-200 text-red-600" : "bg-green-50 border-green-200 text-green-600"
                                      )}>
                                        {isMissing ? <AlertCircle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                                        <span className="text-[10px] font-bold uppercase tracking-wider">{isMissing ? 'Action Required' : 'Populated'}</span>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                    </div>
                  </div>
                  </div>
              </TabsContent>

              {/* TABS CONTENT: LINK */}
              <TabsContent value="link" className="h-full m-0 p-8 flex items-center justify-center bg-slate-50/50">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-12 max-w-2xl w-full mx-auto text-center space-y-8 transform transition-all hover:shadow-2xl">
                  <div className="bg-blue-50 h-24 w-24 rounded-[2rem] mx-auto border-8 border-white shadow-inner flex items-center justify-center">
                    <LinkIcon className="h-10 w-10 text-blue-600" />
                  </div>
                  
                  <div className="space-y-3">
                    <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Share Secure Access</h3>
                    <p className="text-base text-slate-500 leading-relaxed px-6 max-w-md mx-auto">
                      Provide this link to the applicant. They can securely upload missing documents and fill out outstanding details.
                    </p>
                  </div>
                  
                  <div className="flex flex-col gap-5 pt-4">
                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-sm font-mono text-slate-700 break-all select-all text-left shadow-inner">
                      <span className="flex-1 font-medium text-blue-600 line-clamp-1">{clientUrl}</span>
                      <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-slate-500 hover:text-blue-700 bg-white shadow-sm border rounded-xl transition-colors" onClick={copyToClipboard}>
                        {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
                      </Button>
                    </div>
                    
                    <div className="flex justify-center gap-4">
                      <Button variant="outline" className="h-12 rounded-xl px-8 font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm" onClick={() => window.open(clientUrl, "_blank")}>
                        <ExternalLink className="h-4 w-4 mr-2" /> Live Preview
                      </Button>
                      <Button variant="default" className="h-12 rounded-xl px-8 font-semibold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95" onClick={copyToClipboard}>
                        <Copy className="h-4 w-4 mr-2" /> {copied ? 'Link Copied!' : 'Copy to Clipboard'}
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* TABS CONTENT: PDF */}
              <TabsContent value="pdf" className="h-full m-0 p-8 flex items-center justify-center bg-slate-50/50">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-12 max-w-2xl w-full mx-auto text-center space-y-8 transform transition-all hover:shadow-2xl">
                  <div className="bg-orange-50 h-24 w-24 rounded-[2rem] mx-auto border-8 border-white shadow-inner flex items-center justify-center">
                    <Printer className="h-10 w-10 text-orange-500" />
                  </div>
                  
                  <div className="space-y-3">
                    <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Export Requirements Report</h3>
                    <p className="text-base text-slate-500 leading-relaxed px-6 max-w-md mx-auto">
                      Generate a clean, printable physical report summarizing all verified and outstanding action items.
                    </p>
                  </div>
                  
                  <div className="pt-6">
                    <Button variant="default" className="h-14 rounded-2xl px-10 font-bold text-lg bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-200 text-white transition-all active:scale-95" onClick={handlePrint}>
                      <Printer className="h-5 w-5 mr-3" /> Generate PDF Report
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="bg-white border-t px-8 py-5 shrink-0 z-10 flex justify-between items-center w-full">
          <p className="text-xs text-slate-400 font-medium hidden sm:block">Changes to documents are auto-saved to the main profile.</p>
          <Button variant="outline" onClick={onClose} className="h-11 rounded-xl px-10 font-bold text-slate-700 border-slate-200 hover:bg-slate-50">
            Close Dashboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 