// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { FileText, FileType, Download, Loader2, Wand2, CheckCircle2, AlertCircle, ExternalLink, Eye } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { supabase } from "@/lib/supabase/client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
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

  // Find requirements that have templates
  const templateReqs = useMemo(() => {
    if (!task?.requirements) return []
    return task.requirements.filter((r: any) => r.hasTemplate)
  }, [task])

  const handleGenerateTemplate = useCallback(async (req: any) => {
    try {
      setLoadingTemplates(true)
      const docId = req.document_id || req.document_ids?.[0]
      if (!docId) {
        toast.error("No document ID for this requirement")
        return
      }

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

  if (!task) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p className="text-sm">No task data available</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Templates & Letter Generation</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Generate letters and documents from templates</p>
        </div>

        {templateReqs.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="p-8 text-center">
              <FileType className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500">No Templates Available</p>
              <p className="text-xs text-slate-400 mt-1">This job level has no requirements with template generation enabled.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-slate-200">
            <Table className="border-collapse">
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="h-8 text-[10px] font-semibold text-slate-500 uppercase w-8 pl-4 border-r">#</TableHead>
                  <TableHead className="h-8 text-[10px] font-semibold text-slate-500 uppercase border-r">Document</TableHead>
                  <TableHead className="h-8 text-[10px] font-semibold text-slate-500 uppercase border-r">Category</TableHead>
                  <TableHead className="h-8 text-[10px] font-semibold text-slate-500 uppercase w-28 text-center border-r">Status</TableHead>
                  <TableHead className="h-8 text-[10px] font-semibold text-slate-500 uppercase w-28 text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templateReqs.map((req: any, idx: number) => {
                  const docMeta = kycDocsMap.get(req.document_id || req.document_ids?.[0])
                  const docName = docMeta?.display_name || docMeta?.name || req.display_name || req.name || "Unknown"

                  return (
                    <TableRow key={req.id || req.uniqueId || idx} className="hover:bg-slate-50/50">
                      <TableCell className="text-[11px] text-slate-400 font-mono py-2.5 pl-4 border-r border-slate-100">{idx + 1}</TableCell>
                      <TableCell className="py-2.5 border-r border-slate-100">
                        <span className="text-sm font-medium text-slate-700">{docName}</span>
                      </TableCell>
                      <TableCell className="py-2.5 border-r border-slate-100">
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 capitalize bg-slate-50 text-slate-500 border-slate-200">
                          {req.category || "general"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-center border-r border-slate-100">
                        <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 gap-1">
                          <FileType className="h-3 w-3" /> Template
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                          onClick={() => handleGenerateTemplate(req)}
                          disabled={loadingTemplates}
                        >
                          {loadingTemplates ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Wand2 className="h-3 w-3" />
                          )}
                          Generate
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {selectedTemplateReq && (
        <TemplateGenerationDialog
          isOpen={templateDialogOpen}
          onClose={() => setTemplateDialogOpen(false)}
          task={task}
          template={templates.length === 1 ? templates[0] : null}
          availableTemplates={templates}
          documentName={selectedTemplateReq.display_name || selectedTemplateReq.name}
          masterFields={{}}
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
