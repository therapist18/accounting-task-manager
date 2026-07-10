// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { FileType, Loader2, Wand2, Search, LayoutTemplate } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

import TemplateGenerationComponent from "../../../tasks-requirements/TemplateGenerationComponent"
import { fetchMasterFields, buildTemplateGenerationInfo, isTemplateEligible } from "../../../tasks-requirements/utils/templateGenerationData"
import type { JobWorkspaceData } from "../fetchJobWorkspaceData"

interface TemplatesTabProps {
  data: JobWorkspaceData
  targetDocumentId?: string
}

export function TemplatesTab({ data, targetDocumentId }: TemplatesTabProps) {
  const { task, kycDocsMap } = data
  const [selectedTemplateReq, setSelectedTemplateReq] = useState<any>(null)
  const [generationInfo, setGenerationInfo] = useState<any>(null)
  const [loadingReqId, setLoadingReqId] = useState<string | null>(null)
  const [masterFields, setMasterFields] = useState<Map<number, any> | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  
  const autoPreviewedTaskId = useRef<any>(null)
  const listRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Filter requirements that STRICTLY have hasTemplate: true
  const templateReqs = useMemo(() => {
    if (!task?.requirements) return []
    return task.requirements.filter((r: any) => {
      const isExplicitlyTrue = r.hasTemplate === true || String(r.hasTemplate) === 'true'
      if (!isExplicitlyTrue) return false
      
      const docMeta = kycDocsMap.get(r.document_id || r.document_ids?.[0])
      return isTemplateEligible(r, docMeta)
    })
  }, [task, kycDocsMap])

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

  const resolveEntityForReq = useCallback((req: any) => {
    const entityTypes = req.entityTypes || (req.applicantType ? [req.applicantType] : [])
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

  // Auto-preview functionality (deep linking or fallback to first template)
  useEffect(() => {
    if (!masterFields || templateReqs.length === 0) return
    if (autoPreviewedTaskId.current === task.id) return
    autoPreviewedTaskId.current = task.id

    const targeted = targetDocumentId
      ? templateReqs.find((r: any) => (r.document_id || r.document_ids?.[0]) === targetDocumentId)
      : null
    const reqToPreview = targeted || templateReqs[0]
    
    if (reqToPreview) {
      const key = String(reqToPreview.id || templateReqs.indexOf(reqToPreview))
      handleGenerateTemplate(reqToPreview, key)

      if (targeted) {
        setTimeout(() => {
          listRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 150)
      }
    }
  }, [masterFields, templateReqs, task?.id, targetDocumentId, handleGenerateTemplate])

  if (!task) return null

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white px-6 py-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b pb-4 mb-4 bg-white shrink-0 z-40">
        <div className="flex items-center gap-4">
          <h3 className="text-xl font-medium text-slate-800 tracking-tight">Template Generation</h3>
          <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-sm rounded-full px-3 py-0.5">
            {templateReqs.length} Available
          </Badge>
        </div>
      </div>

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
        <div className="flex flex-1 overflow-hidden gap-5">
          {/* Sidebar Panel for Templates */}
          <div className="w-[360px] flex flex-col border rounded-xl bg-slate-50/30 shadow-sm overflow-hidden shrink-0">
            <div className="bg-white border-b px-4 py-3 flex flex-col gap-3 sticky top-0 z-10">
               <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center">
                 <LayoutTemplate className="w-4 h-4 mr-2" /> Target Documents
               </span>
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
            
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
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
          </div>

          {/* Main Content / Inline Template Generation View */}
          <div className="flex-1 flex flex-col border rounded-xl bg-white shadow-sm overflow-hidden">
            {selectedTemplateReq && generationInfo ? (
              <TemplateGenerationComponent
                /*
                  Using 'key' ensures that React unmounts the old component and mounts a entirely 
                  new one when switching templates. This guarantees that initial state (like formData) 
                  is completely rebuilt for the new template configuration!
                */
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
                refreshDocuments={() => {}}
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
          </div>
        </div>
      )}
    </div>
  )
}