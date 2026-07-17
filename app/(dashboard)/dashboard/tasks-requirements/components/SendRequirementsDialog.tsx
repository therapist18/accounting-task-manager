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
  ArrowRight, ShieldCheck, HelpCircle, Zap, Loader2
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

function getEntityTypes(item: any): string[] {
  return item?.entityTypes || (item?.entityType ? [item.entityType] : (item?.applicantType ? [item.applicantType] : []))
}

function EntityTypeBadges({ types }: { types: string[] }) {
  if (!types || types.length === 0) {
    return <span className="text-xs text-slate-400 italic">Any</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {types.map((t) => (
        <Badge key={t} variant="outline" className="capitalize text-[9px] font-semibold bg-slate-50 text-slate-600 border-slate-200 px-1.5 py-0">
          {t}
        </Badge>
      ))}
    </div>
  )
}

function roleMatchesEntityType(p: any, t: string): boolean {
  const roles = Array.isArray(p.role) ? p.role.map((r: string) => String(r).toLowerCase()) : [String(p.role || '').toLowerCase()]
  if (t === 'principal') return roles.includes('principal') || roles.includes('applicant')
  if (t === 'director') return roles.includes('director') || roles.includes('shareholder')
  if (t === 'dependant' || t === 'dependent') return roles.includes('dependant') || roles.includes('dependent')
  if (t === 'sponsor') return roles.includes('sponsor')
  if (t === 'understudy') return roles.includes('understudy')
  return roles.includes(t)
}

type TaskEntity = { id: any; name: string; type: 'company' | 'individual' }

function getAllTaskEntities(task: any): TaskEntity[] {
  if (!task) return []
  const participants = task.participants_details || []
  const applicant = task.applicant_details || {}
  const entities: TaskEntity[] = []
  const seen = new Set<string>()
  const add = (id: any, name: string, type: 'company' | 'individual') => {
    if (id === null || id === undefined) return
    const key = `${type}-${id}`
    if (seen.has(key)) return
    seen.add(key)
    entities.push({ id, name, type })
  }
  if (applicant.type === 'company') add(applicant.id, applicant.name, 'company')
  if (applicant.type === 'individual') add(applicant.id, applicant.name, 'individual')
  participants.forEach((p: any) => add(p.id, p.name, p.type === 'company' ? 'company' : 'individual'))
  if (task.company_id) add(task.company_id, task.company_name || 'Company', 'company')
  if (task.individual_id) add(task.individual_id, applicant.name || 'Individual', 'individual')
  return entities
}

// The single source of truth for "which participant(s) does this requirement apply
// to" - used both for the Applies To column and for resolving whose documents count
// toward the requirement's status. Previously the status lookup only ever checked
// task.company_id/task.individual_id, so a requirement satisfied by a *different*
// participant (e.g. a director/dependant whose docs live under their own id) showed
// as missing even though the Requirements Matrix tab - which checks every applicable
// participant column - showed it as satisfied.
function getApplicableEntitiesForRequirement(item: any, task: any): TaskEntity[] {
  const entityTypes = getEntityTypes(item)
  if (!task) return []
  if (entityTypes.length === 0) return getAllTaskEntities(task)

  const participants = task.participants_details || []
  const applicant = task.applicant_details || {}
  const entities: TaskEntity[] = []
  const seen = new Set<string>()
  const add = (id: any, name: string, type: 'company' | 'individual') => {
    if (id === null || id === undefined) return
    const key = `${type}-${id}`
    if (seen.has(key)) return
    seen.add(key)
    entities.push({ id, name, type })
  }

  entityTypes.map((t: string) => String(t).toLowerCase()).forEach((t: string) => {
    if (t === 'company') {
      const companyPart = applicant.type === 'company' ? applicant : participants.find((p: any) => p.type === 'company')
      if (companyPart?.id) add(companyPart.id, companyPart.name, 'company')
      else if (task.company_id) add(task.company_id, task.company_name || 'Company', 'company')
      return
    }
    if (applicant.type === 'individual' && roleMatchesEntityType(applicant, t)) add(applicant.id, applicant.name, 'individual')
    participants.filter((p: any) => p.type === 'individual').forEach((p: any) => { if (roleMatchesEntityType(p, t)) add(p.id, p.name, 'individual') })
  })

  return entities
}

function getAppliesToNames(item: any, task: any): string[] {
  const entityTypes = getEntityTypes(item)
  if (!task || entityTypes.length === 0) return []
  return Array.from(new Set(getApplicableEntitiesForRequirement(item, task).map(e => e.name).filter(Boolean)))
}

function AppliesToCell({ item, task }: { item: any, task: any }) {
  const names = getAppliesToNames(item, task)
  if (names.length === 0) {
    return <span className="text-xs text-slate-400 italic">Everyone</span>
  }
  return (
    <div className="flex flex-col gap-0.5">
      {names.map((n) => (
        <span key={n} className="text-xs font-medium text-slate-700 truncate max-w-[160px]">{n}</span>
      ))}
    </div>
  )
}

interface SendRequirementsDialogProps {
  isOpen: boolean
  onClose: () => void
  selectedApplicant: string
  tasks: any[]
  taskClassRequirements: Record<string, any>
  automationWebdataMap?: Record<string, { name: string; webdata: any[] }>
  allCompanyDocuments: Record<string, any[]>
  allIndividualDocuments: Record<string, any[]>
  fieldSourceDataCache: Record<string, Record<string, any>>
  fieldMasterComputedCache: Record<string, any>
  jobFieldsRecord?: Record<string, any>
  relationshipData?: any[]
  kycDocsMap?: Map<string, any>
}

export function SendRequirementsDialog({
  isOpen,
  onClose,
  selectedApplicant,
  tasks,
  taskClassRequirements,
  automationWebdataMap = {},
  allCompanyDocuments,
  allIndividualDocuments,
  fieldSourceDataCache = {},
  fieldMasterComputedCache = {},
  jobFieldsRecord = {},
  relationshipData = [],
  kycDocsMap = new Map()
}: SendRequirementsDialogProps) {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState("checklist")
  const [isExporting, setIsExporting] = useState(false)
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
    // No document type is linked to this requirement at all, so it can never be
    // fulfilled by anyone - the Requirements Matrix tab shows this as "N/A" rather
    // than flagging it for action, since there's nothing a client/staff member can
    // do about it here (it's a class-requirement configuration gap, not a missing
    // submission). Mirror that instead of showing a misleading red "Action Required".
    if (docIds.length === 0) {
      return { label: 'Not Configured', color: 'text-slate-500', bgColor: 'bg-slate-100', status: 'unconfigured', icon: HelpCircle, date: '-', satisfiedCount: 0, requiredCount }
    }

    const entities = getApplicableEntitiesForRequirement(docRequirement, task)
    const foundDocs: any[] = []
    const seenDocIds = new Set<any>()
    const entityTrace = entities.map((entity) => {
      const source = entity.type === 'company' ? allCompanyDocuments[entity.id] : allIndividualDocuments[entity.id]
      const matched = (source || []).filter((doc: any) => docIds.includes(doc.document_id) && doc.status !== 'deleted')
      matched.forEach((doc: any) => {
        if (seenDocIds.has(doc.id)) return
        seenDocIds.add(doc.id)
        foundDocs.push(doc)
      })
      return {
        entity: `${entity.type}:${entity.id}:${entity.name}`,
        docsAvailableForEntity: source?.length ?? 0,
        docsAvailableTypes: (source || []).map((d: any) => d.document_id),
        matchedCount: matched.length,
        matchedStatuses: matched.map((d: any) => d.status),
      }
    })

    if (foundDocs.length === 0) return missing

    const activeDocs = foundDocs.filter(d => d.status !== 'draft')
    const latestDoc = (activeDocs.length > 0 ? activeDocs : foundDocs).reduce((prev, curr) => new Date(curr.created_at) > new Date(prev.created_at) ? curr : prev)
    const formattedDate = new Date(latestDoc.created_at).toLocaleDateString('en-GB')

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
    const value = targetEntityId == null ? null : resolveVariableValueImpl(field, String(targetEntityId), ctx)
       return value
  }

  const getArrayVal = (field: any, task: any, groupIndex: number): any[] => {
    const ctx = buildCtx(field.automationId, [field], groupIndex, task)
    const rows = getArrayFieldDataImpl(field, ctx) || []
      return rows
  }

  const getEntityLabelForRow = (task: any, entityId: any) => {
    if (task?.applicant_details && String(task.applicant_details.id) === String(entityId)) return task.applicant_details.name
    const participant = (task?.participants_details || []).find((p: any) => String(p.id) === String(entityId))
    if (participant) return participant.name
    if (String(task?.company_id) === String(entityId)) return task?.company_name || 'Company'
    return String(entityId)
  }

  const isFieldMissingVal = (val: any) => val === null || val === undefined || val === "" || val === "Missing"

  const docsWithStatus = useMemo(() => {
    const results = clientRequirements.docs.map((doc) => {
      const status = getDocStatus(doc, doc.task)
      const docTypeNames = getDocTypeNames(doc)
      const requiredCount = doc.requiredDocumentCount || 1
      return { doc, status, docTypeNames, acceptedTypesLabel: getAcceptedTypesLabel(docTypeNames, requiredCount) }
    })
    return results
  }, [clientRequirements.docs, allCompanyDocuments, allIndividualDocuments, kycDocsMap])

  const questionsWithValues = useMemo(() => {
    return clientRequirements.questions.map((q) => {
      const value = q.task.job_specific_answers?.[q.id]
      return { question: q, value, isMissing: !value }
    })
  }, [clientRequirements.questions])

  const fieldsWithValues = useMemo(() => {
    return clientRequirements.fields.map((f) => {
      if (f.fieldType === 'array') {
        const arrayRows = getArrayVal(f, f.task, f.groupIndex)
        return { field: f, isArray: true as const, arrayRows, value: null, isMissing: arrayRows.length === 0 }
      }
      const value = getFieldVal(f, f.task, f.groupIndex)
      return { field: f, isArray: false as const, arrayRows: [] as any[], value, isMissing: isFieldMissingVal(value) }
    })
  }, [clientRequirements.fields, fieldSourceDataCache, jobFieldsRecord, fieldMasterComputedCache, relationshipData])

  const stats = useMemo(() => {
    // Requirements with no document type linked ('unconfigured') can never be
    // fulfilled by anyone, so they're excluded from the completion count - same as
    // how the Requirements Matrix tab doesn't treat its "N/A" rows as outstanding work.
    const configuredDocCount = docsWithStatus.filter(({ status }) => status.status !== 'unconfigured').length;
    const total = configuredDocCount + clientRequirements.questions.length + clientRequirements.fields.length;
    let completed = 0;

    docsWithStatus.forEach(({ status }) => { if (status.status === 'valid') completed++; });
    questionsWithValues.forEach(({ isMissing }) => { if (!isMissing) completed++; });
    fieldsWithValues.forEach(({ isArray, arrayRows, isMissing }) => { if (isArray ? arrayRows.length > 0 : !isMissing) completed++; });

    return { total, completed, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }, [clientRequirements, docsWithStatus, questionsWithValues, fieldsWithValues]);

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
    if (isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading('Generating PDF report...');

    const getStatusClass = (statusObj: any) => {
      if (statusObj.status === 'valid') return 'status-valid'
      if (statusObj.status === 'partial') return 'status-partial'
      if (statusObj.status === 'draft') return 'status-draft'
      if (statusObj.status === 'unconfigured') return 'status-unconfigured'
      return 'status-missing'
    }

    const now = new Date()
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const refNo = `REQ-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

    const formatAcceptedTypes = (docTypeNames: string[], requiredCount: number) => {
      if (docTypeNames.length <= 1) return docTypeNames[0] || 'Document'
      const label = getAcceptedTypesLabel(docTypeNames, requiredCount)
      const preview = docTypeNames.slice(0, 3).join(' &bull; ') + (docTypeNames.length > 3 ? ` &bull; +${docTypeNames.length - 3} more` : '')
      return `<strong style="color:#1e293b;">${label}</strong><br/><span style="color:#94a3b8; font-size:9px;">${preview}</span>`
    }

    const docRows = docsWithStatus.map(({ doc, status, docTypeNames }, idx) => {
      const requiredCount = doc.requiredDocumentCount || 1
      const automationTag = doc.web_automation?.automationId
        ? ' <span style="display:inline-block; font-size:8px; font-weight:700; color:#7c3aed; background:#f5f3ff; border:1px solid #ddd6fe; border-radius:9999px; padding:1px 6px; vertical-align:middle;">&#9889; Automated</span>'
        : ''
      return `<tr>
        <td style="text-align:center; color:#94a3b8; font-family:monospace; font-size:10px;">${String(idx + 1).padStart(2, '0')}</td>
        <td style="font-weight:600; color:#1e293b; font-size: 11px;">${doc.name}${automationTag}</td>
        <td style="color:#64748b; font-size:10px;">${formatAcceptedTypes(docTypeNames, requiredCount)}</td>
        <td style="text-align:center; color:#64748b; font-size:10px; white-space:nowrap;">${status.date}</td>
        <td style="text-align:center;">
          <span class="status-badge ${getStatusClass(status)}">${status.label}</span>
        </td>
      </tr>`
    }).join('')

    const fieldCards = [
      ...questionsWithValues.map(({ question: q, value: val, isMissing }, idx) => {
        return `<div class="field-card ${isMissing ? 'field-missing' : 'field-ok'}">
          <div class="field-card-top">
            <span class="field-num">${String(idx + 1).padStart(2, '0')}</span>
            <span class="field-name">${q.label}</span>
            <span class="status-dot ${isMissing ? 'dot-missing' : 'dot-valid'}"></span>
          </div>
          <div class="field-value">${val || '<span style="color:#cbd5e1;font-style:italic;">Pending Input</span>'}</div>
        </div>`
      }),
      ...fieldsWithValues.map(({ field: f, isArray, arrayRows, value: val, isMissing }, idx) => {
        let displayVal: string
        if (isArray) {
          displayVal = isMissing
            ? '<span style="color:#cbd5e1;font-style:italic;">Pending Input</span>'
            : `<ul>` + arrayRows.map((row: any) => {
              const label = getEntityLabelForRow(f.task, row.entityId)
              const items = (f.arrayItems || []).map((item: any) => `<strong>${getFieldLabel(item)}:</strong> ${row[item.variableName] ?? '-'}`).join(', ')
              return `<li><strong style="color:#1e293b;">${label}</strong> &rarr; ${items}</li>`
            }).join('') + `</ul>`
        } else {
          displayVal = val || '<span style="color:#cbd5e1;font-style:italic;">Pending Input</span>'
        }
        return `<div class="field-card ${isMissing ? 'field-missing' : 'field-ok'} ${isArray ? 'field-wide' : ''}">
          <div class="field-card-top">
            <span class="field-num">${String(questionsWithValues.length + idx + 1).padStart(2, '0')}</span>
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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #0f172a; line-height: 1.4; }
        
        .pdf-wrapper { background: #ffffff; padding: 0; position: relative; z-index: 1; }
        
        .watermark { position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 80px; font-weight: 900; color: rgba(37, 99, 235, 0.03); letter-spacing: 0.1em; text-transform: uppercase; pointer-events: none; white-space: nowrap; z-index: -1; }

        .header { border-bottom: 3px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }
        .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
        .brand { display: flex; flex-direction: column; gap: 4px; }
        .brand-logo { font-size: 11px; font-weight: 800; color: #2563eb; text-transform: uppercase; letter-spacing: 0.15em; }
        .brand-title { font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; }
        .header-meta { text-align: right; display: flex; gap: 20px; }
        .meta-item { display: flex; flex-direction: column; gap: 2px; }
        .meta-label { font-size: 8px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; }
        .meta-value { font-size: 11px; font-weight: 600; color: #334155; }

        .progress-row { display: flex; align-items: center; gap: 14px; margin-top: 16px; }
        .progress-bar-bg { flex: 1; height: 8px; background: #e2e8f0; border-radius: 99px; overflow: hidden; }
        .progress-bar-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #2563eb, #7c3aed); }
        .progress-summary { font-size: 11px; color: #64748b; font-weight: 600; }
        .progress-percent { font-size: 16px; font-weight: 800; color: #0f172a; }

        .section-header { display: flex; align-items: center; gap: 10px; margin: 24px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; page-break-after: avoid; }
        .section-header:first-child { margin-top: 0; }
        .section-number { width: 22px; height: 22px; background: #2563eb; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; flex-shrink: 0; }
        .section-title { font-size: 12px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em; }
        .section-count { font-size: 10px; font-weight: 600; color: #94a3b8; background: #f1f5f9; padding: 2px 8px; border-radius: 99px; }

        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px; page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        th { background-color: #f8fafc; padding: 10px 12px; text-align: left; font-weight: 700; color: #475569; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; }
        td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; color: #334155; }
        tr:nth-child(even) td { background-color: #fafbfc; }

        .field-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
        .field-card { width: calc(50% - 6px); border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; background: #f8fafc; page-break-inside: avoid; display: flex; flex-direction: column; gap: 6px; }
        .field-card.field-wide { width: 100%; }
        .field-card.field-missing { background: #fef2f2; border-color: #fecaca; }
        .field-card-top { display: flex; align-items: center; gap: 8px; }
        .field-num { font-size: 9px; color: #94a3b8; font-family: monospace; font-weight: 600; }
        .field-name { font-size: 11px; font-weight: 700; color: #1e293b; flex: 1; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .dot-valid { background: #16a34a; }
        .dot-missing { background: #dc2626; }
        .field-value { font-size: 11px; color: #475569; padding-left: 17px; word-break: break-word; }
        .field-value ul { list-style: none; padding-left: 0; }
        .field-value li { margin-bottom: 6px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 6px; }
        .field-value li:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }

        .status-badge { display: inline-flex; align-items: center; justify-content: center; padding: 4px 10px; border-radius: 9999px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
        .status-missing { background-color: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        .status-valid { background-color: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
        .status-partial { background-color: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
        .status-draft { background-color: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
        .status-unconfigured { background-color: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }

        .footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; page-break-inside: avoid; }
        .footer-left { font-size: 9px; color: #94a3b8; font-weight: 500; }
        .footer-right { font-size: 9px; color: #94a3b8; font-weight: 500; }
        .footer-brand { font-weight: 700; color: #64748b; }
      </style>
      
      <div class="pdf-wrapper">
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
      </div>
    `

    const element = document.createElement('div')
    element.innerHTML = htmlContent
    element.style.width = '800px'
    element.style.position = 'absolute'
    element.style.left = '-9999px' // Hide off-screen to avoid layout shifts for the user
    element.style.top = '0'
    document.body.appendChild(element)

    try {
      const html2pdf = (await import('html2pdf.js')).default
      await html2pdf()
        .set({
          margin: 15, // Using html2pdf margins is much safer than manual CSS padding for page breaks
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
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
      toast.success('PDF exported successfully!', { id: toastId })
    } catch (err) {
      console.error(err)
      toast.error('Failed to export PDF. Please try again.', { id: toastId })
    } finally {
      setIsExporting(false)
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
                  <div className="p-6 md:p-8 space-y-10">
                    
                    {/* Document Requirements */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between ml-1">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shadow-sm">
                            <FileText className="h-4 w-4" />
                          </div>
                          <h3 className="text-base font-bold text-slate-800">Document Requirements</h3>
                        </div>
                      </div>
                      
                      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                          <Table className="min-w-[800px] w-full">
                            <TableHeader className="bg-slate-50/80 border-b border-slate-200">
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="w-16 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">#</TableHead>
                                <TableHead className="py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Requirement</TableHead>
                                <TableHead className="w-[130px] py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Entity Type</TableHead>
                                <TableHead className="w-[150px] py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Applies To</TableHead>
                                <TableHead className="w-[220px] py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Accepted Types</TableHead>
                                <TableHead className="w-[160px] py-3 text-right pr-6 text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {docsWithStatus.map(({ doc, status, docTypeNames, acceptedTypesLabel }, idx) => {
                                const StatusIcon = status.icon

                                return (
                                  <TableRow key={idx} className="group hover:bg-slate-50/60 border-slate-100 transition-colors">
                                    <TableCell className="text-center font-mono text-xs text-slate-400 font-medium">{idx + 1}</TableCell>
                                    <TableCell className="py-4 pr-4">
                                      <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-semibold text-slate-800">{doc.name}</span>
                                          {doc.web_automation?.automationId && (
                                            <button
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); window.open(`/dashboard/tasks/${doc.task.id}?tab=automation&automationId=${doc.web_automation.automationId}`, '_blank', 'noopener,noreferrer') }}
                                              className="inline-flex items-center gap-1 text-[9px] font-bold text-purple-700 bg-purple-50 rounded-full px-2 py-0.5 border border-purple-200 hover:bg-purple-100 transition-colors shrink-0 uppercase tracking-wide"
                                              title="Generated by automation"
                                            >
                                              <Zap className="h-3 w-3" fill="currentColor" /> Auto
                                            </button>
                                          )}
                                        </div>
                                        {doc.description && <span className="text-xs text-slate-500 line-clamp-1">{doc.description}</span>}
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-4 pr-4">
                                      <EntityTypeBadges types={getEntityTypes(doc)} />
                                    </TableCell>
                                    <TableCell className="py-4 pr-4">
                                      <AppliesToCell item={doc} task={doc.task} />
                                    </TableCell>
                                    <TableCell className="py-4 pr-4">
                                      <span className="inline-block text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
                                        {acceptedTypesLabel}
                                      </span>
                                    </TableCell>
                                    <TableCell className="py-4 pr-6 text-right">
                                      <div className={cn(
                                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm",
                                        status.bgColor, status.color.replace('text-', 'border-'), status.color
                                      )}>
                                        <StatusIcon className="h-3.5 w-3.5" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">{status.label}</span>
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

                    {/* Information Fields & Questions */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between ml-1">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg shadow-sm">
                            <Database className="h-4 w-4" />
                          </div>
                          <h3 className="text-base font-bold text-slate-800">Information & Context Fields</h3>
                        </div>
                      </div>
                      
                      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                          <Table className="min-w-[800px] w-full">
                            <TableHeader className="bg-slate-50/80 border-b border-slate-200">
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="w-16 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">#</TableHead>
                                <TableHead className="py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Requested Field</TableHead>
                                <TableHead className="w-[120px] py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Entity Type</TableHead>
                                <TableHead className="w-[140px] py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Applies To</TableHead>
                                <TableHead className="w-[260px] py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Current Value</TableHead>
                                <TableHead className="w-[160px] py-3 text-right pr-6 text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {/* Questions */}
                              {questionsWithValues.map(({ question: q, value: val, isMissing }, idx) => {
                                return (
                                  <TableRow key={`q-${idx}`} className="group hover:bg-slate-50/60 border-slate-100 transition-colors">
                                    <TableCell className="text-center font-mono text-xs text-slate-400 font-medium align-top pt-5">{idx + 1}</TableCell>
                                    <TableCell className="py-4 pr-4 align-top">
                                      <div className="flex flex-col gap-1">
                                        <span className="text-sm font-semibold text-slate-800">{q.label}</span>
                                        <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1 uppercase tracking-wider">
                                          <HelpCircle className="h-3 w-3" /> Questionnaire
                                        </span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-4 pr-4 align-top">
                                      <EntityTypeBadges types={getEntityTypes(q)} />
                                    </TableCell>
                                    <TableCell className="py-4 pr-4 align-top">
                                      <AppliesToCell item={q} task={q.task} />
                                    </TableCell>
                                    <TableCell className="py-4 pr-4 align-top">
                                      {isMissing ? (
                                        <span className="text-red-400/80 italic text-sm font-medium">Pending Input</span>
                                      ) : (
                                        <span className="text-sm font-medium text-slate-700 bg-white border border-slate-200 py-1.5 px-3 rounded-lg inline-block shadow-sm">
                                          {val}
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="py-4 pr-6 text-right align-top">
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
                              {fieldsWithValues.map(({ field: f, isArray, arrayRows, value: val, isMissing }, idx) => {
                                return (
                                  <TableRow key={`f-${idx}`} className="group hover:bg-slate-50/60 border-slate-100 transition-colors">
                                    <TableCell className="text-center font-mono text-xs text-slate-400 font-medium align-top pt-5">
                                      {questionsWithValues.length + idx + 1}
                                    </TableCell>
                                    <TableCell className="py-4 pr-4 align-top">
                                      <div className="flex flex-col gap-1">
                                        <span className="text-sm font-semibold text-slate-800">{getFieldLabel(f)}</span>
                                        {isArray && (
                                          <span className="inline-block w-max text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded uppercase tracking-wider">
                                            List Format
                                          </span>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-4 pr-4 align-top">
                                      <EntityTypeBadges types={getEntityTypes(f)} />
                                    </TableCell>
                                    <TableCell className="py-4 pr-4 align-top">
                                      <AppliesToCell item={f} task={f.task} />
                                    </TableCell>
                                    <TableCell className="py-4 pr-4 align-top">
                                      {isArray ? (
                                        arrayRows.length > 0 ? (
                                          <div className="flex flex-col gap-2">
                                            {arrayRows.map((row: any, rIdx: number) => (
                                              <div key={rIdx} className="bg-slate-50 rounded-lg p-3 border border-slate-200 shadow-sm">
                                                <span className="text-xs font-bold text-slate-700 mb-2 block border-b border-slate-200 pb-1">
                                                  {getEntityLabelForRow(f.task, row.entityId)}
                                                </span>
                                                <div className="grid grid-cols-1 gap-2">
                                                  {(f.arrayItems || []).map((item: any) => (
                                                    <div key={item.variableName} className="flex flex-col">
                                                      <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">
                                                        {getFieldLabel(item)}
                                                      </span>
                                                      <span className="text-sm text-slate-800 font-medium">
                                                        {row[item.variableName] ?? '-'}
                                                      </span>
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-red-400/80 italic text-sm font-medium">Pending Input</span>
                                        )
                                      ) : (
                                        isMissing ? (
                                          <span className="text-red-400/80 italic text-sm font-medium">Pending Input</span>
                                        ) : (
                                          <span className="text-sm font-medium text-slate-700 bg-white border border-slate-200 py-1.5 px-3 rounded-lg inline-block shadow-sm break-all">
                                            {val}
                                          </span>
                                        )
                                      )}
                                    </TableCell>
                                    <TableCell className="py-4 pr-6 text-right align-top">
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
                    <Button 
                      variant="default" 
                      className="h-14 rounded-2xl px-10 font-bold text-lg bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-200 text-white transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed" 
                      onClick={handlePrint}
                      disabled={isExporting}
                    >
                      {isExporting ? (
                        <><Loader2 className="h-5 w-5 mr-3 animate-spin" /> Generating PDF...</>
                      ) : (
                        <><Printer className="h-5 w-5 mr-3" /> Generate PDF Report</>
                      )}
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