// @ts-nocheck
"use client"

import React, { useMemo } from "react"
import { CheckCircle2, Circle, Clock, FileText, User, AlertCircle, XCircle, SkipForward, UploadCloud, Eye, Lock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { REQUIREMENTS_LOCK_STAGE_IDS } from "../../utils/taskManagerData"

interface WorkflowTabProps {
  task: any
  stages: any[]
  allDocuments: any[]
}

const STAGE_ICONS: Record<string, string> = {
  enquiry: "search",
  quotation: "dollar",
  requirements: "file",
  confirmation: "check",
  application: "zap",
  processing: "upload",
  issuance: "download",
  collection: "package",
}

function getStageStatus(task: any, stage: any): "completed" | "current" | "pending" | "skipped" | "locked" {
  const stageData = task?.stages?.[stage.id]
  if (!stageData) return "pending"
  if (stageData.status === "completed" || stageData.completedAt) return "completed"
  if (stageData.status === "skipped") return "skipped"
  if (stageData.status === "cancelled") return "skipped"
  if (stageData.date && !stageData.completedAt) return "current"
  return "pending"
}

const LOCK_STAGE_VALUES = Object.values(REQUIREMENTS_LOCK_STAGE_IDS)

function getStageDate(task: any, stage: any): string | null {
  const stageData = task?.stages?.[stage.id]
  if (!stageData) return null
  return stageData.date || stageData.completedAt || null
}

export function WorkflowTab({ task, stages, allDocuments }: WorkflowTabProps) {
  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => (a.order_num ?? 0) - (b.order_num ?? 0)),
    [stages]
  )

  // Determine which stage is current (first non-completed)
  const currentStageIndex = sortedStages.findIndex(s => getStageStatus(task, s) === "pending")

  const getStageDocs = (stage: any) => {
    if (!stage.documents?.length) return []
    return stage.documents.map((doc: any) => {
      const linkedDoc = allDocuments.find(d => d.id === doc.kycId)
      return { ...doc, linkedDoc }
    })
  }

  return (
    <div className="h-full flex">
      <ScrollArea className="flex-1 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900">Stage Workflow</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {sortedStages.length} stages · {sortedStages.filter(s => getStageStatus(task, s) === "completed").length} completed
            </p>
          </div>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[15px] top-3 bottom-3 w-0.5 bg-slate-200" />

            <div className="space-y-0">
              {sortedStages.map((stage, index) => {
                const status = getStageStatus(task, stage)
                const isLast = index === sortedStages.length - 1
                const isLockStage = LOCK_STAGE_VALUES.includes(stage.id)
                const stageDocs = getStageDocs(stage)
                const stageDate = getStageDate(task, stage)

                return (
                  <div key={stage.id} className="relative flex gap-4 pb-6">
                    {/* Timeline dot */}
                    <div className="relative z-10 flex-shrink-0 mt-1">
                      <div
                        className={cn(
                          "h-[30px] w-[30px] rounded-full flex items-center justify-center border-2 transition-all",
                          status === "completed" && "bg-green-500 border-green-500 text-white",
                          status === "current" && "bg-blue-500 border-blue-500 text-white shadow-md shadow-blue-200",
                          status === "pending" && "bg-white border-slate-300 text-slate-400",
                          status === "skipped" && "bg-slate-100 border-slate-300 text-slate-400",
                        )}
                      >
                        {status === "completed" ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : status === "current" ? (
                          <Circle className="h-4 w-4 fill-white" />
                        ) : status === "skipped" ? (
                          <SkipForward className="h-3.5 w-3.5" />
                        ) : (
                          <Circle className="h-4 w-4" />
                        )}
                      </div>
                    </div>

                    {/* Content card */}
                    <div className={cn(
                      "flex-1 min-w-0 rounded-lg border p-3 transition-all",
                      status === "completed" && "bg-green-50/50 border-green-200",
                      status === "current" && "bg-blue-50 border-blue-200 shadow-sm",
                      status === "pending" && "bg-white border-slate-200",
                      status === "skipped" && "bg-slate-50 border-slate-200 opacity-60",
                    )}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-semibold",
                              status === "completed" && "text-green-800",
                              status === "current" && "text-blue-800",
                              status === "pending" && "text-slate-600",
                              status === "skipped" && "text-slate-400",
                            )}>
                              {stage.name}
                            </span>
                            {status === "current" && (
                              <Badge className="bg-blue-500 text-white text-[10px] px-1.5 py-0">Current</Badge>
                            )}
                            {status === "completed" && (
                              <Badge variant="outline" className="text-green-600 border-green-300 text-[10px] px-1.5 py-0">Done</Badge>
                            )}
                            {status === "skipped" && (
                              <Badge variant="outline" className="text-slate-400 border-slate-300 text-[10px] px-1.5 py-0">Skipped</Badge>
                            )}
                            {isLockStage && status === "completed" && (
                              <Lock className="h-3 w-3 text-amber-500" />
                            )}
                          </div>
                          {stage.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{stage.description}</p>
                          )}
                          {stageDate && (
                            <p className="text-xs text-muted-foreground mt-1">
                              <Clock className="h-3 w-3 inline mr-1" />
                              {new Date(stageDate).toLocaleDateString("en-GB", {
                                day: "numeric", month: "short", year: "numeric",
                                hour: "2-digit", minute: "2-digit"
                              })}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Stage documents */}
                      {stageDocs.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-inherit">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                            Documents ({stageDocs.length})
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {stageDocs.map((doc: any) => {
                              const hasFile = doc.linkedDoc?.file_path
                              return (
                                <Badge
                                  key={doc.id || doc.kycId}
                                  variant="secondary"
                                  className={cn(
                                    "text-[10px] font-normal gap-1",
                                    hasFile ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                                  )}
                                >
                                  {hasFile ? (
                                    <Eye className="h-3 w-3" />
                                  ) : (
                                    <UploadCloud className="h-3 w-3" />
                                  )}
                                  {doc.name || doc.display_name || "Document"}
                                </Badge>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Stage order number */}
                    <div className="absolute -bottom-1 left-[13px] w-[34px] text-center">
                      {!isLast && (
                        <div className="h-full w-0.5 bg-slate-200" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: '34px', bottom: '0', zIndex: 0 }} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
