// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { FileType, Loader2, Wand2, Search, LayoutTemplate } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { fetchMasterFields, buildTemplateGenerationInfo, isTemplateEligible } from "../../../tasks-requirements/utils/templateGenerationData"
import type { JobWorkspaceData } from "../fetchJobWorkspaceData"
import TemplateGenerationComponent, { resolveTemplatePlaceholders } from "../../../tasks-requirements/TemplateGenerationDialog"
import { buildParticipantColumns } from "./RequirementsTab"

interface TemplatesTabProps {
  data: JobWorkspaceData
  targetDocumentId?: string
  // Reports this tab's own fill-progress aggregate up to the JobWorkspace tab bar, so the
  // badge there is exact (reuses this component's own computation) without JobWorkspace
  // having to re-run the same per-requirement placeholder-resolution queries itself.
  onSummaryChange?: (summary: { ready: number; total: number } | null) => void
}

export function TemplatesTab({ data, targetDocumentId, onSummaryChange }: TemplatesTabProps) {
  const { task, kycDocsMap } = data
  const [selectedTemplateReq, setSelectedTemplateReq] = useState<any>(null)
  const [generationInfo, setGenerationInfo] = useState<any>(null)
  const [loadingReqId, setLoadingReqId] = useState<string | null>(null)
  const [masterFields, setMasterFields] = useState<Map<number, any> | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [templateProgress, setTemplateProgress] = useState<Record<string, { filled: number; total: number } | 'loading'>>({})

  // Keyed by task+targetDocumentId (not just task) so a later in-app navigation to a
  // *different* target document (e.g. from AutomationTab's "linked requirement" button)
  // still triggers auto-preview even though this tab was already visited once before.
  const autoPreviewedKey = useRef<string | null>(null)
  const listRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const resolveEntityForReq = useCallback((req: any) => {
    const entityTypes = req.entityTypes || (req.applicantType ? [req.applicantType] : [])

    // Match against the same participant columns the Requirements table itself
    // uses (director/shareholder/dependant/understudy/sponsor/etc.), not just
    // company vs. principal - a requirement scoped to e.g. ["director"] has no
    // "principal" participant to fall back to when the task only has a director.
    if (entityTypes.length > 0) {
      const matchingCol = buildParticipantColumns(task).find((c: any) => entityTypes.includes(c.type))
      if (matchingCol) return { colType: matchingCol.type, colId: matchingCol.id }
    }

    if (entityTypes.includes('company')) {
      let companyId = task.company_id
      if (!companyId && task.participants_details) {
        companyId = task.participants_details.find((p: any) => p.type === 'company')?.id
      }
      if (!companyId && task.applicant_details?.type === 'company') companyId = task.applicant_details.id
      return { colType: 'company', colId: companyId }
    }
    const principalPart = task.participants_details?.find((p: any) =>
      p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
    )
    const colId = principalPart?.id || (task.applicant_details?.type === 'individual' ? task.applicant_details.id : task.individual_id)
    return { colType: 'principal', colId }
  }, [task])

  // Filter requirements that STRICTLY have hasTemplate: true, deduped by the
  // actual document type + entity it resolves to - overlapping class-requirement
  // rows (e.g. a subclass-level and a broader department-level row) can both mark
  // the same document as template-eligible, which would otherwise list the exact
  // same generated document twice. Two requirements for the same doc but
  // *different* entities (e.g. a director's vs the principal's invitation letter)
  // are genuinely different generated files, so those stay separate.
  const templateReqs = useMemo(() => {
    if (!task?.requirements) return []
    const eligible = task.requirements.filter((r: any) => {
      const isExplicitlyTrue = r.hasTemplate === true || String(r.hasTemplate) === 'true'
      if (!isExplicitlyTrue) return false

      const docMeta = kycDocsMap.get(r.document_id || r.document_ids?.[0])
      return isTemplateEligible(r, docMeta)
    })

    const seen = new Map<string, any>()
    eligible.forEach((req: any) => {
      const docId = req.document_id || req.document_ids?.[0]
      const { colType, colId } = resolveEntityForReq(req)
      const key = `${docId}::${colType}::${colId ?? ''}`
      if (!seen.has(key)) seen.set(key, req)
    })
    return Array.from(seen.values())
  }, [task, kycDocsMap, resolveEntityForReq])

  // Apply search query filtering
  const filteredReqs = useMemo(() => {
    if (!searchQuery.trim()) return templateReqs
    const query = searchQuery.toLowerCase()

    return templateReqs.filter((req: any) => {
      const docMeta = kycDocsMap.get(req.document_id || req.document_ids?.[0])
      const docName = docMeta?.display_name || docMeta?.name || req.display_name || req.name || "Unknown"
      const category = req.category || "General"

      return docName.toLowerCase().includes(query) || category.toLowerCase().includes(query)
    })
  }, [templateReqs, searchQuery, kycDocsMap])

  useEffect(() => {
    fetchMasterFields().then(setMasterFields)
  }, [])

  // Proactively compute each template's fill progress so the sidebar can show a
  // percentage without requiring the user to click into the generation module.
  useEffect(() => {
    if (!masterFields || templateReqs.length === 0 || !task) return
    let cancelled = false
    templateReqs.forEach(async (req: any, idx: number) => {
      const reqKey = String(req.id || idx)
      const docId = req.document_id || req.document_ids?.[0]
      const docMeta = docId ? kycDocsMap.get(docId) : null
      if (!docId || !docMeta) return
      const { colType, colId } = resolveEntityForReq(req)
      if (!colId) return
      try {
        const info = await buildTemplateGenerationInfo({ document: docMeta }, task, colType, colId, masterFields, task.job_level, req.selectedTemplateId)
        if (cancelled) return
        if (!info?.template) {
          setTemplateProgress(prev => ({ ...prev, [reqKey]: { filled: 0, total: 0 } }))
          return
        }
        const { filled, total } = resolveTemplatePlaceholders(info.template, {
          relationshipData: info.relationshipData,
          sourceDataCache: info.sourceDataCache,
          masterFields: info.masterFields,
          entityIdMap: info.entityIdMap,
          extractedData: info.extractedData,
          companyData: info.companyData,
          task: info.task,
        })
        if (!cancelled) setTemplateProgress(prev => ({ ...prev, [reqKey]: { filled, total } }))
      } catch (err) {
        console.error('[TemplatesTab] Error computing template progress for', req.name, err)
      }
    })
    return () => { cancelled = true }
  }, [masterFields, templateReqs, task, kycDocsMap, resolveEntityForReq])

  useEffect(() => {
    if (!onSummaryChange) return
    if (templateReqs.length === 0) { onSummaryChange(null); return }
    let ready = 0
    templateReqs.forEach((req: any, idx: number) => {
      const progress = templateProgress[String(req.id || idx)]
      if (progress && progress !== 'loading' && progress.total > 0 && progress.filled === progress.total) ready++
    })
    onSummaryChange({ ready, total: templateReqs.length })
  }, [templateReqs, templateProgress, onSummaryChange])

  const handleGenerateTemplate = useCallback(async (req: any, reqId: string) => {
    if (!masterFields) return
    try {
      setLoadingReqId(reqId)
      const docId = req.document_id || req.document_ids?.[0]
      const docMeta = docId ? kycDocsMap.get(docId) : null
      if (!docId || !docMeta) { toast.error("No document configured for this requirement"); return; }

      const { colType, colId } = resolveEntityForReq(req)
      if (!colId) { toast.error(`Could not determine the applicant/company to generate "${req.display_name || req.name}" for`); return; }

      const info = await buildTemplateGenerationInfo({ document: docMeta }, task, colType, colId, masterFields, task.job_level, req.selectedTemplateId)
      if (!info) {
        toast.error(`No templates available for: ${req.display_name || req.name}`)
        return
      }

      setGenerationInfo(info)
      setSelectedTemplateReq(req)
    } catch (err) {
      console.error("Error preparing template generation:", err)
      toast.error("Failed to load template")
    } finally {
      setLoadingReqId(null)
    }
  }, [masterFields, task, kycDocsMap, resolveEntityForReq])

  // Auto-preview only kicks in for an explicit deep link (e.g. "Go to linked template"
  // from the Automation tab). Otherwise the user is prompted to pick a template themselves.
  useEffect(() => {
    if (!masterFields || templateReqs.length === 0 || !targetDocumentId) return
    const key = `${task.id}:${targetDocumentId}`
    if (autoPreviewedKey.current === key) return
    autoPreviewedKey.current = key

    const targeted = templateReqs.find((r: any) => (r.document_id || r.document_ids?.[0]) === targetDocumentId)
    if (targeted) {
      const reqKey = String(targeted.id || templateReqs.indexOf(targeted))
      handleGenerateTemplate(targeted, reqKey)
      setTimeout(() => {
        listRefs.current[reqKey]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
    }
  }, [masterFields, templateReqs, task?.id, targetDocumentId, handleGenerateTemplate])

  if (!task) return null

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white px-6 py-4">
      {templateReqs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-200">
          <div className="bg-white p-6 rounded-full shadow-md mb-4 border border-slate-100">
            <Search className="h-10 w-10 text-slate-300" />
          </div>
          <p className="text-lg font-medium text-slate-600">No Templates Available</p>
          <p className="text-sm font-medium text-slate-400 mt-2 max-w-sm leading-relaxed">
            This job level has no requirements explicitly marked with template generation enabled.
          </p>
        </div>
      ) : (
        <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
          {/* Sidebar Panel for Templates */}
          <ResizablePanel defaultSize={28} minSize={20} maxSize={45} className="flex flex-col bg-slate-50/30 overflow-hidden">
            <div className="bg-white px-4 py-3 flex flex-col gap-3 sticky top-0 z-10 border-b border-slate-100">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-slate-900 tracking-tight flex items-center">
                  <LayoutTemplate className="w-4 h-4 mr-2 text-slate-500" /> Target Documents
                </span>
                <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-xs rounded-full px-3 py-0.5">
                  {templateReqs.length} Available
                </Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs bg-slate-50/50 border-slate-200 focus-visible:ring-blue-500 focus-visible:border-blue-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar border">
              {filteredReqs.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 font-medium">
                  No templates match your search.
                </div>
              ) : (
                filteredReqs.map((req: any, idx: number) => {
                  const reqId = String(req.id || idx)
                  const docMeta = kycDocsMap.get(req.document_id || req.document_ids?.[0])
                  const docName = docMeta?.display_name || docMeta?.name || req.display_name || req.name || "Unknown"
                  const isSelected = selectedTemplateReq?.id === req.id
                  const isLoading = loadingReqId === reqId

                  return (
                    <div
                      key={reqId}
                      ref={(el) => { listRefs.current[reqId] = el }}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group",
                        isSelected
                          ? "bg-blue-50 border-blue-200 ring-1 ring-blue-500 shadow-sm"
                          : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-sm"
                      )}
                      onClick={() => { if (!isSelected) handleGenerateTemplate(req, reqId) }}
                    >
                      <div className="flex flex-col min-w-0 pr-3">
                        <span className={cn(
                          "text-sm font-semibold truncate transition-colors",
                          isSelected ? "text-blue-800" : "text-slate-700"
                        )}>
                          {docName}
                        </span>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge variant="outline" className="text-[10px] font-semibold bg-white text-slate-500 rounded-full px-2 py-0 border-slate-200">
                            {req.category || "General"}
                          </Badge>
                          <span className="text-[10px] text-slate-400 font-medium flex items-center">
                            <FileType className="h-3 w-3 mr-1 opacity-70" /> DOCX/PDF
                          </span>
                        </div>
                        {(() => {
                          const progress = templateProgress[reqId]
                          if (!progress) return (
                            <span className="text-[9px] text-slate-400 mt-1">Checking template...</span>
                          )
                          const pct = progress.total > 0 ? Math.round((progress.filled / progress.total) * 100) : 0
                          return (
                            <div className="flex items-center gap-1.5 mt-1.5 w-full max-w-[180px]">
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : "bg-blue-500")}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className={cn("text-[9px] font-bold shrink-0", pct === 100 ? "text-emerald-600" : "text-slate-500")}>
                                {progress.total > 0 ? `${pct}%` : "N/A"}
                              </span>
                            </div>
                          )
                        })()}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 rounded-full px-4 text-xs font-semibold transition-all shrink-0",
                          isSelected
                            ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900 group-hover:border-slate-300"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isSelected) handleGenerateTemplate(req, reqId);
                        }}
                        disabled={isLoading || isSelected}
                      >
                        {isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : isSelected ? (
                          "Viewing"
                        ) : (
                          "Select"
                        )}
                      </Button>
                    </div>
                  )
                })
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Main Content / Inline Template Generation View */}
          <ResizablePanel defaultSize={72} minSize={40} className="flex flex-col border rounded-xl bg-white shadow-sm overflow-hidden ml-1">
            {selectedTemplateReq && generationInfo ? (
              <TemplateGenerationComponent
                key={selectedTemplateReq.id || generationInfo.template?.id}
                isOpen={true}
                task={generationInfo.task}
                template={generationInfo.template}
                availableTemplates={generationInfo.availableTemplates}
                documentName={selectedTemplateReq.display_name || selectedTemplateReq.name}
                masterFields={generationInfo.masterFields}
                entityIdMap={generationInfo.entityIdMap}
                sourceDataCache={generationInfo.sourceDataCache}
                extractedData={generationInfo.extractedData}
                personData={generationInfo.personData}
                companyData={generationInfo.companyData}
                relationshipData={generationInfo.relationshipData}
                jobLevel={task.job_level}
                activeEntityType={generationInfo.activeEntityType}
                activeEntityId={generationInfo.activeEntityId?.toString()}
                refreshDocuments={() => { }}
                onClose={() => setSelectedTemplateReq(null)}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50/30">
                <div className="bg-slate-100 p-6 rounded-full mb-4">
                  <LayoutTemplate className="h-10 w-10 text-slate-300" />
                </div>
                <p className="text-lg font-medium text-slate-500">No Template Selected</p>
                <p className="text-sm text-slate-400 mt-1 max-w-sm">
                  Select a target document from the sidebar to start populating and generating.
                </p>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  )
}