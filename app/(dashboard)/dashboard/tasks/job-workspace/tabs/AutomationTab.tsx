// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import {
  ChevronDown, ChevronRight, Settings2, FileText, User, Loader2, RefreshCw,
  CheckCircle2, AlertCircle, Eye, Briefcase, UserCheck, HeartPulse, ArrowUpDown, ArrowUp, ArrowDown, Users2,
  Database, Zap, FileType, HelpCircle
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { resolveVariableValueImpl, resolveTargetEntityIdImpl, fetchSourceDataImpl, getArrayFieldDataImpl } from "../../utils/fieldResolution"
import { isValidValue, cleanFieldValue as cleanFieldValueStr } from "../../utils/AutomationMappingDialog"
import type { JobWorkspaceData } from "../fetchJobWorkspaceData"
import { AutomationMappingDialog } from "../../components/AutomationMappingDialog"
import supabase from "@/lib/supabase/client"

interface AutomationTabProps {
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

function getEntityTypeConfig(type: string) {
  switch (type) {
    case "company": return { bgColor: "bg-slate-700", Icon: Briefcase }
    case "director": return { bgColor: "bg-indigo-600", Icon: UserCheck }
    case "dependant": return { bgColor: "bg-blue-500", Icon: Users2 }
    case "principal": return { bgColor: "bg-blue-700", Icon: UserCheck }
    case "sponsor": return { bgColor: "bg-green-600", Icon: HeartPulse }
    case "understudy": return { bgColor: "bg-cyan-600", Icon: User }
    default: return { bgColor: "bg-blue-600", Icon: User }
  }
}

function isFieldApplicable(field: any, col: ColDef): boolean {
  const entityTypes = field.entityTypes || (field.applicableTo ? [field.applicableTo] : [])
  if (!entityTypes || entityTypes.length === 0) return true

  const lowerEntityTypes = entityTypes.map(t => String(t).toLowerCase())
  const colType = String(col.type).toLowerCase()
  const colRoles = (col.roles || []).map(r => String(r).toLowerCase())

  if (lowerEntityTypes.includes('dependent') && !lowerEntityTypes.includes('dependant')) lowerEntityTypes.push('dependant')
  if (lowerEntityTypes.includes('dependant') && !lowerEntityTypes.includes('dependent')) lowerEntityTypes.push('dependent')

  if (colType === 'dependent' || colType === 'dependant') {
    if (lowerEntityTypes.includes('dependant') || lowerEntityTypes.includes('dependent')) return true
  }

  if (colType === 'principal') {
    if (lowerEntityTypes.includes('principal') || lowerEntityTypes.includes('director') || lowerEntityTypes.includes('individual')) return true
  }

  if (lowerEntityTypes.includes(colType)) return true

  for (const role of colRoles) {
    if (lowerEntityTypes.includes(role)) return true
    if (role === 'director' && lowerEntityTypes.includes('principal')) return true
    if (role === 'principal' && lowerEntityTypes.includes('director')) return true
  }

  if (colType !== 'company' && lowerEntityTypes.includes('individual')) return true

  return false
}

export function AutomationTab({ data, onRefresh }: AutomationTabProps) {
  const { task, automations } = data
  const [expandedAutomations, setExpandedAutomations] = useState<Set<number>>(new Set())
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [mappingOpen, setMappingOpen] = useState(false)
  const [mappingField, setMappingField] = useState<any>(null)
  const [fieldSourceDataCache, setFieldSourceDataCache] = useState<Record<string, Record<string, any>>>({})
  const [fieldMasterComputedCache, setFieldMasterComputedCache] = useState<Record<string, any>>({})
  const [resolvedValues, setResolvedValues] = useState<Record<string, any>>({})
  const [resolving, setResolving] = useState<Record<string, boolean>>({})
  const [jobFieldsRecord, setJobFieldsRecord] = useState<Record<string, any>>({})

  const columns = useMemo(() => buildParticipantColumns(task), [task])

  // Build relationship data the same way RequirementsTableCombined does
  const relationshipData = useMemo(() => {
    if (!task) return []
    const participants = task.participants_details || []
    const applicant = task.applicant_details || {}

    const companyParticipant = participants.find((p: any) => p.type === 'company')
    const isApplicantDependant = applicant.role === 'dependant' ||
      (Array.isArray(applicant.role) && applicant.role.includes('dependant'))

    let principal = participants.find((p: any) =>
      p.type === 'individual' &&
      (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
    )

    let dependants = participants
      .filter((p: any) => p.type === 'individual' && (
        Array.isArray(p.role) ? p.role.includes('dependant') : p.role === 'dependant'
      ))
      .map((dep: any) => ({
        id: dep.id,
        name: dep.name,
        relationship: dep.relationship || 'dependant'
      }))

    if (isApplicantDependant) {
      if (!dependants.find((d: any) => d.id === applicant.id)) {
        dependants.push({
          id: applicant.id || task?.individual_id,
          name: applicant.name,
          relationship: applicant.relationship || 'dependant'
        })
      }
    } else {
      if (!principal) {
        principal = {
          id: applicant.id || task?.individual_id,
          name: applicant.name,
          role: applicant.role
        }
      }
    }

    return [{
      company: {
        id: companyParticipant?.id || task?.company_id,
        name: companyParticipant?.name || task?.company_name || 'Company',
        type: 'company'
      },
      principal: principal ? { id: principal.id, name: principal.name, role: principal.role } : null,
      directors: participants
        .filter((p: any) => p.type === 'individual' && (
          Array.isArray(p.role) ? (p.role.includes('director') || p.role.includes('shareholder')) : (p.role === 'director' || p.role === 'shareholder')
        ))
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

  // Load job fields for automations
  useEffect(() => {
    const linkedFieldIds = new Set<string>()
    ;(automations || []).forEach(auto => {
      if (auto.webdata && auto.webdata.length > 0) {
        auto.webdata.forEach((field: any) => {
          ;(field.linkedMasterFields || field.masterFieldIds || []).forEach((id: any) => linkedFieldIds.add(String(id)))
          ;(field.arrayItems || []).forEach((item: any) => {
            ;(item.linkedMasterFields || item.masterFieldIds || (item.linkedMasterFieldId ? [item.linkedMasterFieldId] : [])).forEach((id: any) => linkedFieldIds.add(String(id)))
          })
        })
      }
    })
    if (linkedFieldIds.size === 0) return
    const fetchJobFields = async () => {
      const { data: fields, error } = await supabase
        .from('tm_job_fields')
        .select('*')
        .in('id', Array.from(linkedFieldIds))
      if (!error && fields) {
        setJobFieldsRecord(fields.reduce((acc: Record<string, any>, field: any) => {
          acc[String(field.id)] = field
          return acc
        }, {}))
      }
    }
    fetchJobFields()
  }, [automations])

  // Auto-resolve field values when automations are expanded
  useEffect(() => {
    if (expandedAutomations.size === 0 || Object.keys(jobFieldsRecord).length === 0) return

    const loadAll = async () => {
      const mergedSource: Record<string, Record<string, any>> = {}
      const mergedComputed: Record<string, any> = {}
      const calls: Promise<void>[] = []

      ;(automations || []).forEach(auto => {
        if (!expandedAutomations.has(auto.id) || !auto.webdata?.length) return
        relationshipData.forEach((relData: any) => {
          calls.push(
            fetchSourceDataImpl({
              selectedAutomationId: String(auto.id),
              webData: [{ automationId: String(auto.id), fields: auto.webdata }],
              jobFields: jobFieldsRecord,
              relationshipData: relData,
              taskId: String(task?.id || ""),
              currentIndividualId: String(task?.individual_id || ""),
              task
            }).then(({ sourceData: sd, masterFieldComputedValues: mc }) => {
              Object.entries(sd).forEach(([table, records]) => {
                if (!mergedSource[table]) mergedSource[table] = {}
                Object.assign(mergedSource[table], records)
              })
              if (mc) Object.assign(mergedComputed, mc)
            }).catch(err => console.error('Error resolving field values', err))
          )
        })
      })
      await Promise.all(calls)
      setFieldSourceDataCache(prev => {
        const next = { ...prev }
        Object.entries(mergedSource).forEach(([table, records]) => {
          next[table] = { ...(next[table] || {}), ...records }
        })
        return next
      })
      setFieldMasterComputedCache(prev => ({ ...prev, ...mergedComputed }))
    }
    loadAll()
  }, [expandedAutomations, automations, jobFieldsRecord, relationshipData, task])

  const handleSort = useCallback((colKey: string) => {
    setSortCol(prev => prev === colKey ? (setSortDir(d => d === "asc" ? "desc" : "asc"), colKey) : (setSortDir("asc"), colKey))
  }, [])

  const toggleAutomation = useCallback((id: number) => {
    setExpandedAutomations(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }, [])

  // Resolve a single field value for a specific column (participant)
  const resolveFieldForCol = useCallback(async (field: any, col: ColDef) => {
    const cacheKey = `${field.variableName || field.name}-${col.id}`
    if (resolvedValues[cacheKey] !== undefined && !resolving[cacheKey]) return
    setResolving(prev => ({ ...prev, [cacheKey]: true }))
    try {
      const ctx = {
        sourceData: fieldSourceDataCache,
        jobFields: jobFieldsRecord,
        webData: [{ automationId: String(field.automation_id || ""), fields: [field] }],
        selectedAutomationId: String(field.automation_id || ""),
        masterFieldComputedValues: fieldMasterComputedCache,
        relationshipData: relationshipData[0],
        taskId: String(task?.id || ""),
        currentIndividualId: col.type === 'company' ? String(task?.individual_id || "") : String(col.id),
        task,
      }
      const targetEntityId = resolveTargetEntityIdImpl(field, ctx)
      const val = targetEntityId != null ? resolveVariableValueImpl(field, String(targetEntityId), ctx) : null
      setResolvedValues(prev => ({ ...prev, [cacheKey]: val }))
    } catch {
      setResolvedValues(prev => ({ ...prev, [cacheKey]: null }))
    }
    setResolving(prev => ({ ...prev, [cacheKey]: false }))
  }, [task, fieldSourceDataCache, jobFieldsRecord, fieldMasterComputedCache, relationshipData, resolvedValues, resolving])

  // Auto-resolve when source data is ready for expanded automations
  useEffect(() => {
    if (Object.keys(fieldSourceDataCache).length === 0) return
    ;(automations || []).forEach(auto => {
      if (!expandedAutomations.has(auto.id)) return
      ;(auto.webdata || []).forEach((field: any) => {
        columns.forEach(col => {
          const cacheKey = `${field.variableName || field.name}-${col.id}`
          if (resolvedValues[cacheKey] === undefined && !resolving[cacheKey] && isFieldApplicable(field, col)) {
            resolveFieldForCol(field, col)
          }
        })
      })
    })
  }, [fieldSourceDataCache, expandedAutomations, automations, columns, resolvedValues, resolving, resolveFieldForCol])

  if (!task) return <div className="h-full flex items-center justify-center text-muted-foreground"><p className="text-sm">No task data</p></div>

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#FAFAFC]">
      <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-800">Automation</h3>
          <span className="text-xs text-slate-500 font-medium">{task.applicant_name}</span>
          <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 font-bold">{automations?.length || 0} automations</Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-slate-500 hover:bg-slate-50 font-semibold" onClick={onRefresh}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {(!automations || automations.length === 0) ? (
          <div className="h-full flex items-center justify-center bg-white border border-slate-200 border-dashed rounded-lg p-16">
            <p className="text-sm text-slate-500 font-medium">No automations configured for this task.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {automations.map((automation: any) => {
              const isExpanded = expandedAutomations.has(automation.id)
              const fields = automation.webdata || automation.fields || automation.web_data_fields || automation.mapped_fields || []
              const hasFields = fields.length > 0

              const sortedFields = [...fields]
              if (sortCol === `field-${automation.id}`) {
                sortedFields.sort((a, b) => {
                  const aName = (a.name || a.field_name || a.variableName || "").toLowerCase()
                  const bName = (b.name || b.field_name || b.variableName || "").toLowerCase()
                  return sortDir === "asc" ? aName.localeCompare(bName) : bName.localeCompare(aName)
                })
              } else if (sortCol?.startsWith(`col-${automation.id}-`)) {
                const colType = sortCol.replace(`col-${automation.id}-`, "")
                const col = columns.find(c => c.type === colType)
                if (col) {
                  sortedFields.sort((a, b) => {
                    const aApp = isFieldApplicable(a, col) ? 1 : 0
                    const bApp = isFieldApplicable(b, col) ? 1 : 0
                    return sortDir === "asc" ? bApp - aApp : aApp - bApp
                  })
                }
              }

              return (
                <Card key={automation.id} className="border-slate-200 overflow-hidden shadow-sm bg-white">
                  <div
                    className="flex items-center justify-between px-4 py-2.5 bg-slate-50/50 border-b border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors select-none"
                    onClick={() => toggleAutomation(automation.id)}
                  >
                    <div className="flex items-center gap-2.5">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                      <Settings2 className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium text-slate-800">{automation.name || automation.automation_name || `Automation #${automation.id}`}</span>
                      <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 font-bold">{hasFields ? fields.length : 0} fields</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-mono capitalize">{automation.status || "active"}</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-purple-650" onClick={(e) => { e.stopPropagation(); setMappingField(automation); setMappingOpen(true) }}>
                        <Settings2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && hasFields && (
                    <div className="max-h-[350px] overflow-auto relative border-t border-slate-100 custom-scrollbar">
                      <Table className="border-separate border-spacing-0 w-full min-w-max">
                        <TableHeader className="sticky top-0 z-20 bg-slate-100/90 backdrop-blur-sm">
                          <TableRow className="bg-slate-100 hover:bg-transparent">
                            <TableHead className="h-9 text-[10px] font-bold text-slate-700 uppercase w-12 pl-4 sticky left-0 bg-slate-100 z-30 border-r border-b border-slate-200 text-center">#</TableHead>
                            <TableHead className={cn(
                              "h-9 text-[10px] font-bold text-slate-700 uppercase min-w-[200px] sticky left-12 bg-slate-100 z-30 border-r border-b border-slate-200 cursor-pointer select-none hover:bg-slate-200/80 transition-colors",
                              sortCol === `field-${automation.id}` && "text-blue-600 bg-blue-50/50"
                            )} onClick={() => handleSort(`field-${automation.id}`)}>
                              <div className="flex items-center justify-between gap-1.5">
                                <span>Field</span>
                                {sortCol === `field-${automation.id}` ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                              </div>
                            </TableHead>
                            {columns.map(col => {
                              const { bgColor, Icon } = getEntityTypeConfig(col.type)
                              const colKey = `col-${automation.id}-${col.type}`
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
                                      <span className="truncate max-w-[85px]">{col.label}</span>
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
                          {sortedFields.map((field: any, idx: number) => {
                            const isDocument = field.fieldType === 'document'
                            const isComputed = field.fieldType === 'computed'
                            const isArray = field.fieldType === 'array'

                            return (
                              <TableRow key={field.id || field.variableName || idx} className="hover:bg-slate-50/50 border-b border-slate-100">
                                <TableCell className="text-[11px] text-slate-400 font-mono py-2.5 pl-4 sticky left-0 bg-white z-10 border-r border-b border-slate-250 text-center">{idx + 1}</TableCell>
                                <TableCell className="py-2.5 pl-3 pr-2 sticky left-12 bg-white z-10 border-r border-b border-slate-250 max-w-[200px] truncate">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                      <span className="text-xs font-semibold text-slate-700">{field.efnsDisplayName || field.name || field.field_name || field.variableName || `Field #${field.id}`}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {field.fieldType && (
                                        <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[9px] uppercase font-semibold">
                                          {field.fieldType}
                                        </span>
                                      )}
                                      {(field.entityTypes || (field.entityType ? [field.entityType] : [])).map((et: string) => (
                                        <span key={et} className="bg-slate-200 text-slate-700 px-1 py-0.5 rounded text-[9px] capitalize">
                                          {et}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </TableCell>
                                {columns.map(col => {
                                  const applicable = isFieldApplicable(field, col)
                                  const cacheKey = `${field.variableName || field.name}-${col.id}`
                                  const val = resolvedValues[cacheKey]
                                  const isResolving = resolving[cacheKey] || false
                                  const isMissing = !isValidValue(val)

                                  const triggerResolve = () => {
                                    if (val === undefined && !isResolving) {
                                      resolveFieldForCol(field, col)
                                    }
                                  }

                                  return (
                                    <TableCell key={`fv-${field.id || field.variableName}-${col.type}-${col.id}`}
                                      className="py-2.5 text-center align-middle border-r border-b border-slate-250"
                                      onClick={triggerResolve}
                                    >
                                      {!applicable ? (
                                        <span className="text-[10px] text-slate-350 italic font-semibold">N/A</span>
                                      ) : isDocument ? (
                                        <div className="flex items-center justify-center gap-1">
                                          <Database className="h-3 w-3 text-blue-400" />
                                          <span className="text-[10px] text-blue-600 font-semibold">Document mapping</span>
                                        </div>
                                      ) : isComputed ? (
                                        <div className="flex items-center justify-center gap-1">
                                          <Zap className="h-3 w-3 text-amber-400" />
                                          <span className="text-[10px] text-amber-600 font-semibold">Computed</span>
                                        </div>
                                      ) : isArray ? (
                                        <span className="text-[10px] text-blue-600 font-semibold">Array items</span>
                                      ) : isResolving ? (
                                        <div className="flex items-center justify-center"><Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /></div>
                                      ) : val !== undefined ? (
                                        <span className={cn(
                                          "text-xs truncate block max-w-[120px] mx-auto font-semibold",
                                          isMissing ? "text-red-500" : "text-slate-750"
                                        )}>
                                          {isMissing ? 'Missing Value' : cleanFieldValueStr(val) || '-'}
                                        </span>
                                      ) : (
                                        <Button variant="ghost" size="sm" className="h-7 text-[10px] text-purple-600 hover:bg-purple-50 gap-1 font-bold"
                                          onClick={(e) => { e.stopPropagation(); resolveFieldForCol(field, col) }}>
                                          <Eye className="h-3 w-3" /> Resolve
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

                  {isExpanded && !hasFields && (
                    <div className="px-4 py-6 text-center border-t border-slate-100">
                      <p className="text-xs text-slate-500 font-medium">No fields configured for this automation.</p>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {mappingOpen && (
        <AutomationMappingDialog
          isOpen={mappingOpen}
          onClose={() => setMappingOpen(false)}
          automation={mappingField}
          relationshipData={task?.registry_metadata?.client_requirements_draft?.data || {}}
          onRefresh={onRefresh}
        />
      )}
    </div>
  )
}
