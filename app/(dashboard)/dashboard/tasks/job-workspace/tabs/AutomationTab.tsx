// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import {
  ChevronDown, ChevronRight, Settings2, FileText, User, Loader2, RefreshCw,
  CheckCircle2, AlertCircle, Eye, Briefcase, UserCheck, HeartPulse, ArrowUpDown, ArrowUp, ArrowDown, Users2,
  Database, Zap, Search, Settings
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { resolveVariableValueImpl, resolveTargetEntityIdImpl, fetchSourceDataImpl } from "../../utils/fieldResolution"
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
  const [expandedAutomations, setExpandedAutomations] = useState<Set<number>>(new Set(automations?.map(a => a.id) || []))
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

  // Build relationship data (same as Requirements logic)
  const relationshipData = useMemo(() => {
    if (!task) return []
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

  // Load job fields
  useEffect(() => {
    const linkedFieldIds = new Set<string>()
      ; (automations || []).forEach(auto => {
        if (auto.webdata && auto.webdata.length > 0) {
          auto.webdata.forEach((field: any) => {
            ; (field.linkedMasterFields || field.masterFieldIds || []).forEach((id: any) => linkedFieldIds.add(String(id)))
              ; (field.arrayItems || []).forEach((item: any) => {
                ; (item.linkedMasterFields || item.masterFieldIds || (item.linkedMasterFieldId ? [item.linkedMasterFieldId] : [])).forEach((id: any) => linkedFieldIds.add(String(id)))
              })
          })
        }
      })
    if (linkedFieldIds.size === 0) return
    const fetchJobFields = async () => {
      const { data: fields } = await supabase.from('tm_job_fields').select('*').in('id', Array.from(linkedFieldIds))
      if (fields) {
        setJobFieldsRecord(fields.reduce((acc: Record<string, any>, field: any) => {
          acc[String(field.id)] = field
          return acc
        }, {}))
      }
    }
    fetchJobFields()
  }, [automations])

  // Pre-fetch source data
  useEffect(() => {
    if (expandedAutomations.size === 0 || Object.keys(jobFieldsRecord).length === 0) return
    const loadAll = async () => {
      const mergedSource: Record<string, Record<string, any>> = {}
      const mergedComputed: Record<string, any> = {}
      const calls: Promise<void>[] = []

        ; (automations || []).forEach(auto => {
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
        Object.entries(mergedSource).forEach(([table, records]) => { next[table] = { ...(next[table] || {}), ...records } })
        return next
      })
      setFieldMasterComputedCache(prev => ({ ...prev, ...mergedComputed }))
    }
    loadAll()
  }, [expandedAutomations, automations, jobFieldsRecord, relationshipData, task])

  // Single field resolver
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

  // Auto-resolve when source data is ready
  useEffect(() => {
    if (Object.keys(fieldSourceDataCache).length === 0) return
      ; (automations || []).forEach(auto => {
        if (!expandedAutomations.has(auto.id)) return
          ; (auto.webdata || []).forEach((field: any) => {
            columns.forEach(col => {
              const cacheKey = `${field.variableName || field.name}-${col.id}`
              if (resolvedValues[cacheKey] === undefined && !resolving[cacheKey] && isFieldApplicable(field, col)) {
                resolveFieldForCol(field, col)
              }
            })
          })
      })
  }, [fieldSourceDataCache, expandedAutomations, automations, columns, resolvedValues, resolving, resolveFieldForCol])

  const handleSort = (colKey: string) => {
    setSortCol(prev => prev === colKey ? (setSortDir(d => d === "asc" ? "desc" : "asc"), colKey) : (setSortDir("asc"), colKey))
  }

  if (!task) return null

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0 z-40">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-slate-800">Field Resolution Matrix</h3>
          <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[10px]">
            {automations?.length || 0} Automations
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs border-slate-200 text-slate-600 hover:bg-slate-50" onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {(!automations || automations.length === 0) ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
          <div className="bg-white p-4 rounded-full shadow-sm mb-3 border border-slate-100">
            <Search className="h-8 w-8 text-slate-300" />
          </div>
          <p className="text-sm font-bold text-slate-600">No Automations Configured</p>
          <p className="text-[11px] font-medium text-slate-400 mt-1 max-w-xs">
            This task does not have any web automation fields configured for mapping.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto relative custom-scrollbar">
          <Table className="border-separate border-spacing-0 min-w-full">
            <TableHeader className="sticky top-0 z-30">
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="w-12 h-12 text-center border-b border-r sticky left-0 top-0 bg-slate-50 z-40 text-[10px] font-bold uppercase text-slate-500">#</TableHead>
                <TableHead
                  className="min-w-[280px] h-12 border-b border-r sticky left-12 top-0 bg-slate-50 z-40 text-[10px] font-bold uppercase text-slate-500 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort("field-name")}
                >
                  <div className="flex items-center justify-between">
                    <span>Field Name & Type</span>
                    {sortCol === "field-name" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                  </div>
                </TableHead>
                {columns.map(col => {
                  const { bgColor, Icon } = getEntityTypeConfig(col.type)
                  const colKey = `col-${col.id}`
                  return (
                    <TableHead
                      key={col.id}
                      className="min-w-[180px] h-12 border-b border-r top-0 bg-slate-50 p-0 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort(colKey)}
                    >
                      <div className="flex flex-col items-center justify-center gap-1 px-4">
                        <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded text-white text-[10px] font-bold shadow-sm", bgColor)}>
                          <Icon className="h-3 w-3" />
                          <span className="truncate max-w-[100px]">{col.label}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{col.subLabel}</span>
                          {sortCol === colKey ? (sortDir === "asc" ? <ArrowUp className="h-2.5 w-2.5 text-slate-400" /> : <ArrowDown className="h-2.5 w-2.5 text-slate-400" />) : null}
                        </div>
                      </div>
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {automations.map((automation: any) => {
                const isExpanded = expandedAutomations.has(automation.id)
                const fields = automation.webdata || automation.fields || automation.web_data_fields || automation.mapped_fields || []

                // Sorting logic
                let sortedFields = [...fields]
                if (sortCol === "field-name") {
                  sortedFields.sort((a, b) => {
                    const aName = (a.efnsDisplayName || a.name || a.field_name || a.variableName || "").toLowerCase()
                    const bName = (b.efnsDisplayName || b.name || b.field_name || b.variableName || "").toLowerCase()
                    return sortDir === "asc" ? aName.localeCompare(bName) : bName.localeCompare(aName)
                  })
                } else if (sortCol?.startsWith("col-")) {
                  const colId = sortCol.replace("col-", "")
                  const col = columns.find(c => String(c.id) === colId)
                  if (col) {
                    sortedFields.sort((a, b) => {
                      const aApp = isFieldApplicable(a, col) ? 1 : 0
                      const bApp = isFieldApplicable(b, col) ? 1 : 0
                      return sortDir === "asc" ? bApp - aApp : aApp - bApp
                    })
                  }
                }

                return (
                  <React.Fragment key={automation.id}>
                    {/* Category Separator Row */}
                    <TableRow
                      className="bg-slate-100/80 hover:bg-slate-200/80 cursor-pointer transition-colors"
                      onClick={() => setExpandedAutomations(prev => {
                        const next = new Set(prev)
                        if (next.has(automation.id)) next.delete(automation.id)
                        else next.add(automation.id)
                        return next
                      })}
                    >
                      <TableCell colSpan={columns.length + 2} className="h-10 py-0 px-4 border-b border-slate-200 sticky left-0 z-20">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                            <Zap className="h-3.5 w-3.5 text-purple-600" />
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">
                              {automation.name || automation.automation_name || `Automation #${automation.id}`}
                            </span>
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-white border-slate-300 text-slate-500">
                              {fields.length} Fields
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-100">
                              {automation.status || "Active"}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-full"
                              onClick={(e) => { e.stopPropagation(); setMappingField(automation); setMappingOpen(true); }}
                              title="Edit Mapping"
                            >
                              <Settings className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Automation Fields Rows */}
                    {isExpanded && sortedFields.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={columns.length + 2} className="h-16 text-center text-xs font-medium text-slate-400 bg-slate-50">
                          No fields configured in this automation.
                        </TableCell>
                      </TableRow>
                    )}

                    {isExpanded && sortedFields.map((field: any, idx: number) => {
                      const isDocument = field.fieldType === 'document'
                      const isComputed = field.fieldType === 'computed'
                      const isArray = field.fieldType === 'array'

                      return (
                        <TableRow key={field.id || field.variableName || idx} className="group hover:bg-slate-50/50">
                          <TableCell className="h-12 text-center text-[10px] font-mono text-slate-400 border-b border-r sticky left-0 bg-white group-hover:bg-slate-50/50 z-10">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="h-12 border-b border-r sticky left-12 bg-white group-hover:bg-slate-50/50 z-10 p-3">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2">
                                <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="text-xs font-semibold text-slate-700 line-clamp-1">
                                  {field.efnsDisplayName || field.name || field.field_name || field.variableName || `Field #${field.id}`}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {field.fieldType && (
                                  <span className="bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider">
                                    {field.fieldType}
                                  </span>
                                )}
                                {(field.entityTypes || (field.entityType ? [field.entityType] : [])).map((et: string) => (
                                  <span key={et} className="bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider">
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

                            return (
                              <TableCell
                                key={`fv-${field.id || field.variableName}-${col.type}-${col.id}`}
                                className="h-12 text-center border-b border-r p-2 align-middle cursor-pointer hover:bg-slate-100/50 transition-colors"
                                onClick={() => { if (val === undefined && !isResolving) resolveFieldForCol(field, col); }}
                              >
                                {!applicable ? (
                                  <span className="text-[9px] font-bold text-slate-300 uppercase italic">N/A</span>
                                ) : isDocument ? (
                                  <div className="flex items-center justify-center gap-1 bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100 w-fit mx-auto">
                                    <Database className="h-3 w-3" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Doc Mapping</span>
                                  </div>
                                ) : isComputed ? (
                                  <div className="flex items-center justify-center gap-1 bg-amber-50 text-amber-600 px-2 py-1 rounded border border-amber-100 w-fit mx-auto">
                                    <Zap className="h-3 w-3" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Computed</span>
                                  </div>
                                ) : isArray ? (
                                  <div className="flex items-center justify-center gap-1 bg-indigo-50 text-indigo-600 px-2 py-1 rounded border border-indigo-100 w-fit mx-auto">
                                    <Database className="h-3 w-3" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Array Items</span>
                                  </div>
                                ) : isResolving ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-purple-500 mx-auto" />
                                ) : val !== undefined ? (
                                  <div className={cn(
                                    "px-2 py-1 rounded border inline-block max-w-full",
                                    isMissing ? "bg-red-50 border-red-100" : "bg-green-50 border-green-100"
                                  )}>
                                    <span className={cn(
                                      "text-[11px] font-bold truncate block w-full",
                                      isMissing ? "text-red-500 uppercase text-[9px] tracking-wider" : "text-green-700"
                                    )}>
                                      {isMissing ? 'Missing' : cleanFieldValueStr(val)}
                                    </span>
                                  </div>
                                ) : (
                                  <Button variant="ghost" size="sm" className="h-7 text-[10px] text-purple-600 hover:bg-purple-50 border border-transparent hover:border-purple-200 font-bold gap-1"
                                    onClick={(e) => { e.stopPropagation(); resolveFieldForCol(field, col) }}>
                                    <Eye className="h-3.5 w-3.5" /> Resolve
                                  </Button>
                                )}
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
      )}

      {/* Mapping Edit Dialog */}
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