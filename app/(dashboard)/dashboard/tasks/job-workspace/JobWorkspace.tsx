// @ts-nocheck
"use client"

import React, { useState, useMemo } from "react"
import { ArrowLeft, Briefcase, CheckCircle2, Clock, FileText, User, Zap, History, MessageSquare, CreditCard, FileType, Building2, ChevronRight, LayoutList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { JobWorkspaceData } from "./fetchJobWorkspaceData"
import { WorkflowTab } from "./tabs/WorkflowTab"
import { AutomationTab } from "./tabs/AutomationTab"
import { RequirementsTab } from "./tabs/RequirementsTab"
import { TemplatesTab } from "./tabs/TemplatesTab"
import { BillingTab } from "./tabs/BillingTab"
import { HistoryTab } from "./tabs/HistoryTab"
import { NotesTab } from "./tabs/NotesTab"

interface JobWorkspaceProps {
  data: JobWorkspaceData
  onBack: () => void
  onRefresh?: () => void
}

const STATUS_COLORS: Record<string, string> = {
  enquiry: "bg-amber-100 text-amber-800 border-amber-200",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  endorsed: "bg-purple-100 text-purple-800 border-purple-200",
}

function getStageProgress(task: any, stages: any[]) {
  if (!task?.stages || !stages?.length) return { completed: 0, total: 0, percentage: 0 }
  const sorted = [...stages].sort((a, b) => (a.order_num ?? 0) - (b.order_num ?? 0))
  const total = sorted.length
  const completed = sorted.filter(s => task.stages[s.id]?.status === "completed").length
  return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 }
}

function getCurrentStage(task: any, stages: any[]) {
  if (!task?.stages || !stages?.length) return null
  const sorted = [...stages].sort((a, b) => (a.order_num ?? 0) - (b.order_num ?? 0))
  const lastCompleted = sorted.reduce((last, s, i) => task.stages[s.id]?.status === "completed" ? i : last, -1)
  return lastCompleted === -1 ? sorted[0] : sorted[lastCompleted + 1] ?? sorted[lastCompleted]
}

const TAB_DEFINITIONS = [
  { value: "overview", label: "Overview", icon: LayoutList },
  { value: "workflow", label: "Workflow", icon: Clock },
  { value: "requirements", label: "Requirements", icon: CheckCircle2 },
  { value: "templates", label: "Templates", icon: FileType },
  { value: "billing", label: "Billing", icon: CreditCard },
  { value: "automation", label: "Automation", icon: Zap },
  { value: "history", label: "History", icon: History },
  { value: "notes", label: "Notes", icon: MessageSquare },
]

export function JobWorkspace({ data, onBack, onRefresh }: JobWorkspaceProps) {
  const { task, department, subdepartment, stages, individual } = data
  const [activeTab, setActiveTab] = useState("workflow")

  const stageProgress = useMemo(() => getStageProgress(task, stages), [task, stages])
  const currentStage = useMemo(() => getCurrentStage(task, stages), [task, stages])

  const jobTitle = task?.job_description || subdepartment?.name || department?.name || "Job Workspace"
  const applicantName = task?.applicant_name || individual?.full_name || "Unknown"
  const statusLabel = task?.status?.replace("_", " ") || "Unknown"

  return (
    <div className="h-full flex flex-col bg-[#FAFAFC] overflow-hidden">
      {/* Header */}
      <div className="border-b bg-white px-6 py-3 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2 mb-1">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2 -ml-2 text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">Task Manager</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium text-slate-700">{applicantName}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-custom-blue flex items-center justify-center shadow-sm">
              <Briefcase className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">{applicantName}</h1>
                <Badge variant="outline" className={cn("text-[10px] font-semibold capitalize px-1.5 py-0", STATUS_COLORS[task?.status] || "bg-slate-100 text-slate-600")}>
                  {statusLabel}
                </Badge>
                <span className="text-[10px] text-muted-foreground font-mono">#{task?.id}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{jobTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {task?.officer?.name || "Unassigned"}</span>
            <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {department?.name}{subdepartment ? ` / ${subdepartment.name}` : ""}</span>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex-1 max-w-sm">
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-custom-blue rounded-full transition-all duration-500" style={{ width: `${stageProgress.percentage}%` }} />
            </div>
          </div>
          <span className="text-[10px] font-medium text-slate-500">{stageProgress.completed}/{stageProgress.total} stages</span>
          {currentStage && (
            <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">{currentStage.name}</Badge>
          )}
        </div>
      </div>

      {/* Tabs - forceMount keeps all content in DOM to prevent refetching */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b bg-white px-6 shrink-0 shadow-sm">
          <TabsList className="bg-transparent h-10 p-0 gap-0">
            {TAB_DEFINITIONS.map(tab => {
              const Icon = tab.icon
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="text-xs font-medium py-2 px-3 rounded-none border-b-2 border-transparent data-[state=active]:border-custom-blue data-[state=active]:text-custom-blue data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <Icon className="h-3.5 w-3.5 mr-1.5" />
                  {tab.label}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <TabsContent value="overview" forceMount className="h-full m-0 p-6 overflow-y-auto data-[state=inactive]:hidden">
            <OverviewTabContent data={data} />
          </TabsContent>
          <TabsContent value="workflow" forceMount className="h-full m-0 overflow-hidden data-[state=inactive]:hidden">
            <WorkflowTab task={task} stages={stages} allDocuments={data.allDocuments} />
          </TabsContent>
          <TabsContent value="requirements" forceMount className="h-full m-0 overflow-hidden data-[state=inactive]:hidden">
            <RequirementsTab data={data} onRefresh={onRefresh} />
          </TabsContent>
          <TabsContent value="templates" forceMount className="h-full m-0 p-6 overflow-y-auto data-[state=inactive]:hidden">
            <TemplatesTab data={data} />
          </TabsContent>
          <TabsContent value="billing" forceMount className="h-full m-0 overflow-hidden data-[state=inactive]:hidden">
            <BillingTab task={task} onRefresh={onRefresh} />
          </TabsContent>
          <TabsContent value="automation" forceMount className="h-full m-0 overflow-hidden data-[state=inactive]:hidden">
            <AutomationTab data={data} onRefresh={onRefresh} />
          </TabsContent>
          <TabsContent value="history" forceMount className="h-full m-0 p-6 overflow-y-auto data-[state=inactive]:hidden">
            <HistoryTab task={task} stages={stages} />
          </TabsContent>
          <TabsContent value="notes" forceMount className="h-full m-0 p-6 overflow-y-auto data-[state=inactive]:hidden">
            <NotesTab task={task} onRefresh={onRefresh} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

// --- Overview Tab ---
function OverviewTabContent({ data }: { data: JobWorkspaceData }) {
  const { task, stages, individual, department, subdepartment } = data
  const currentStage = getCurrentStage(task, stages)
  const progress = getStageProgress(task, stages)

  return (
    <div className="max-w-3xl space-y-4">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-2 px-5 pt-4">
          <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Job Details</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Applicant</span><span className="font-medium text-slate-800 text-right">{task?.applicant_name}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">R Number</span><span className="font-medium text-slate-800 text-right">{individual?.r_number || task?.r_number || "N/A"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Nationality</span><span className="font-medium text-slate-800 text-right">{individual?.nationality || task?.nationality || "N/A"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Department</span><span className="font-medium text-slate-800 text-right">{department?.name || "N/A"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Subdepartment</span><span className="font-medium text-slate-800 text-right">{subdepartment?.name || "N/A"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Officer</span><span className="font-medium text-slate-800 text-right">{task?.officer?.name || "Unassigned"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Created</span><span className="font-medium text-slate-800 text-right">{task?.created_at ? new Date(task.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "N/A"}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Status</span><span className="font-medium capitalize text-right">{task?.status?.replace("_", " ") || "N/A"}</span></div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-2 px-5 pt-4">
          <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Progress</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-custom-blue rounded-full transition-all" style={{ width: `${progress.percentage}%` }} />
          </div>
          <p className="text-xs text-slate-500">{progress.completed}/{progress.total} stages completed ({progress.percentage}%)</p>
          {currentStage && (
            <div className="mt-3 p-3 bg-blue-50/70 rounded-md border border-blue-100">
              <p className="text-xs font-semibold text-blue-700">Current Stage: {currentStage.name}</p>
              {currentStage.description && <p className="text-[11px] text-blue-500 mt-0.5">{currentStage.description}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


