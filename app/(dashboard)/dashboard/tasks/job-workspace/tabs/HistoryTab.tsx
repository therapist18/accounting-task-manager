// @ts-nocheck
"use client"

import React, { useMemo } from "react"
import { History, Clock, CheckCircle2, User, FileText, Plus, Database, Settings } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface HistoryTabProps {
  task: any
  stages: any[]
}

interface ActivityEvent {
  date: string
  action: string
  user: string
  details: string
  icon: any
  iconBg: string
  iconColor: string
}

export function HistoryTab({ task, stages }: HistoryTabProps) {
  const events = useMemo(() => {
    const list: ActivityEvent[] = []

    // 1. Task Creation
    if (task?.created_at) {
      list.push({
        date: task.created_at,
        action: "Job Created",
        user: "System",
        details: "Job workspace initialized and applicant details imported.",
        icon: Plus,
        iconBg: "bg-blue-50",
        iconColor: "text-blue-600"
      })
    }

    // 2. Requirements Assigned
    if (task?.created_at && task.requirements?.length > 0) {
      list.push({
        date: task.created_at,
        action: "Requirements Assigned",
        user: "System",
        details: `${task.requirements.length} KYC documents & info fields mapped from job level defaults.`,
        icon: Database,
        iconBg: "bg-purple-50",
        iconColor: "text-purple-600"
      })
    }

    // 3. Stage Completions from Task Stages
    if (task?.stages && stages?.length > 0) {
      Object.entries(task.stages).forEach(([stageId, data]: [string, any]) => {
        const stage = stages.find(s => s.id === stageId)
        if (stage && (data.status === 'completed' || data.completedAt)) {
          list.push({
            date: data.completedAt || data.date || task.created_at,
            action: `Stage Completed: ${stage.name}`,
            user: data.officer_ids?.length ? "Assigned Officer" : "Officer",
            details: `Workflow stage marked as completed. Status updated in task manager.`,
            icon: CheckCircle2,
            iconBg: "bg-green-50",
            iconColor: "text-green-600"
          })
        } else if (stage && data.status === 'skipped') {
          list.push({
            date: data.updatedAt || task.created_at,
            action: `Stage Skipped: ${stage.name}`,
            user: "Officer",
            details: `Workflow stage skipped by officer decision.`,
            icon: Clock,
            iconBg: "bg-slate-50",
            iconColor: "text-slate-500"
          })
        }
      })
    }

    // 4. Custom Activity History from metadata (notes, billing, uploads)
    const metadataHistory = task?.registry_metadata?.activity_history || []
    metadataHistory.forEach((h: any) => {
      list.push({
        date: h.date,
        action: h.action,
        user: h.user || "Staff",
        details: h.details,
        icon: FileText,
        iconBg: "bg-amber-50",
        iconColor: "text-amber-600"
      })
    })

    // Sort chronologically descending (newest first)
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [task, stages])

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Job Activity Timeline</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Audit log of all stage transitions, requirement uploads, and metadata updates.</p>
      </div>

      {events.length === 0 ? (
        <div className="text-center p-12 bg-white border border-dashed rounded-lg border-slate-200">
          <History className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-655">No activity recorded</p>
          <p className="text-xs text-slate-400 mt-0.5">Activities will appear as workflow stages are completed.</p>
        </div>
      ) : (
        <div className="relative pl-6 border-l-2 border-slate-200 ml-4 space-y-6 py-2">
          {events.map((event, idx) => {
            const Icon = event.icon
            return (
              <div key={idx} className="relative">
                {/* Timeline Dot Icon */}
                <div className={cn(
                  "absolute -left-[37px] top-0.5 h-[22px] w-[22px] rounded-full border-2 border-white flex items-center justify-center shadow-sm",
                  event.iconBg
                )}>
                  <Icon className={cn("h-3 w-3", event.iconColor)} />
                </div>

                {/* Event Details Card */}
                <Card className="border-slate-200 shadow-sm bg-white hover:border-slate-300 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <span className="text-xs font-bold text-slate-800">{event.action}</span>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{event.details}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap text-right block">
                        {new Date(event.date).toLocaleDateString("en-GB", {
                          day: "numeric", month: "short", year: "numeric"
                        })}
                        <span className="block text-[9px] font-medium text-slate-400/80">
                          {new Date(event.date).toLocaleTimeString("en-GB", {
                            hour: "2-digit", minute: "2-digit"
                          })}
                        </span>
                      </span>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                      <User className="h-3 w-3 text-slate-400" />
                      <span>Action by: </span>
                      <span className="font-bold text-slate-700">{event.user}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
