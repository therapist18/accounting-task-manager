// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback } from "react"
import { FileType, Loader2, Wand2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { supabase } from "@/lib/supabase/client"
import { toast } from "sonner"
import TemplateGenerationDialog from "../../../tasks-requirements/TemplateGenerationDialog"
import type { JobWorkspaceData } from "../fetchJobWorkspaceData"

interface TemplatesTabProps {
  data: JobWorkspaceData
}

export function TemplatesTab({ data }: TemplatesTabProps) {
  const { task, kycDocsMap } = data
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [selectedTemplateReq, setSelectedTemplateReq] = useState<any>(null)
  const [templates, setTemplates] = useState<any[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  const templateReqs = useMemo(() => {
    if (!task?.requirements) return []
    return task.requirements.filter((r: any) => r.hasTemplate)
  }, [task])

  const handleGenerateTemplate = useCallback(async (req: any) => {
    try {
      setLoadingTemplates(true)
      const docId = req.document_id || req.document_ids?.[0]
      if (!docId) { toast.error("No document ID for this requirement"); return; }

      const { data: templateData, error } = await supabase
        .from("acc_portal_templates")
        .select("*")
        .eq("document_id", docId)

      if (error) throw error

      if (!templateData?.length) {
        toast.error(`No templates available for: ${req.display_name || req.name}`)
        return
      }

      setTemplates(templateData)
      setSelectedTemplateReq(req)
      setTemplateDialogOpen(true)
    } catch (err) {
      console.error("Error fetching templates:", err)
      toast.error("Failed to load templates")
    } finally {
      setLoadingTemplates(false)
    }
  }, [])

  if (!task) return null

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0 z-40">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-slate-800">Template Generation</h3>
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
            {templateReqs.length} Available
          </Badge>
        </div>
      </div>

      {templateReqs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
          <div className="bg-white p-4 rounded-full shadow-sm mb-3 border border-slate-100">
            <Search className="h-8 w-8 text-slate-300" />
          </div>
          <p className="text-sm font-bold text-slate-600">No Templates Available</p>
          <p className="text-[11px] font-medium text-slate-400 mt-1 max-w-xs">
            This job level has no requirements with template generation enabled.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto relative custom-scrollbar">
          <Table className="border-separate border-spacing-0 min-w-full">
            <TableHeader className="sticky top-0 z-30">
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="w-12 h-10 text-center border-b border-r sticky left-0 top-0 z-40 text-[10px] font-bold uppercase text-white bg-custom-blue">#</TableHead>
                <TableHead className="min-w-[300px] h-10 border-b border-r sticky left-12 top-0 z-40 text-[10px] font-bold uppercase text-white bg-custom-blue">
                  Target Document
                </TableHead>
                <TableHead className="w-40 h-10 border-b border-r top-0 text-[10px] font-bold uppercase text-white bg-custom-blue">
                  Category
                </TableHead>
                <TableHead className="w-32 h-10 border-b border-r top-0 text-[10px] font-bold uppercase text-white bg-custom-blue text-center">
                  Format
                </TableHead>
                <TableHead className="w-32 h-10 border-b top-0 text-[10px] font-bold uppercase text-white bg-custom-blue text-center">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templateReqs.map((req: any, idx: number) => {
                const docMeta = kycDocsMap.get(req.document_id || req.document_ids?.[0])
                const docName = docMeta?.display_name || docMeta?.name || req.display_name || req.name || "Unknown"

                return (
                  <TableRow key={req.id || idx} className="group hover:bg-slate-50/50">
                    <TableCell className="h-12 text-center text-[10px] font-mono text-slate-400 border-b border-r sticky left-0 bg-white group-hover:bg-slate-50/50 z-10">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="h-12 border-b border-r sticky left-12 bg-white group-hover:bg-slate-50/50 z-10">
                      <span className="text-xs font-semibold text-slate-700">{docName}</span>
                    </TableCell>
                    <TableCell className="h-12 border-b border-r">
                      <Badge variant="outline" className="text-[9px] px-1.5 font-bold uppercase tracking-wider bg-slate-50 text-slate-500 border-slate-200">
                        {req.category || "General"}
                      </Badge>
                    </TableCell>
                    <TableCell className="h-12 text-center border-b border-r">
                      <div className="flex items-center justify-center gap-1.5 text-[10px] font-semibold text-slate-500">
                        <FileType className="h-3.5 w-3.5 text-blue-500" /> DOCX / PDF
                      </div>
                    </TableCell>
                    <TableCell className="h-12 text-center border-b">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] font-bold gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                        onClick={() => handleGenerateTemplate(req)}
                        disabled={loadingTemplates}
                      >
                        {loadingTemplates ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                        Generate
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedTemplateReq && (
        <TemplateGenerationDialog
          isOpen={templateDialogOpen}
          onClose={() => setTemplateDialogOpen(false)}
          task={task}
          template={templates.length === 1 ? templates[0] : null}
          availableTemplates={templates}
          documentName={selectedTemplateReq.display_name || selectedTemplateReq.name}
          masterFields={new Map()}
          entityIdMap={{}}
          sourceDataCache={{}}
          personData={{}}
          companyData={{}}
          jobLevel={task.job_level}
          activeEntityType="principal"
          activeEntityId={task.individual_id?.toString()}
          refreshDocuments={() => {}}
        />
      )}
    </div>
  )
}