// @ts-nocheck
"use client"

import React, { useState, useMemo } from "react"
import { ArrowLeft, Briefcase, CheckCircle2, Clock, FileText, User, Zap, History, MessageSquare, CreditCard, FileType, Building2, ChevronRight, LayoutList, Calendar, Globe, Hash } from "lucide-react"
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
    <div className="h-screen flex flex-col bg-[#FAFAFC] overflow-hidden">
      {/* Header */}
      <div className="shrink-0 z-10 bg-white shadow-sm border-b border-slate-200">
        {/* Accent bar */}
        <div className="h-1 bg-gradient-to-r from-custom-blue via-blue-400 to-blue-300" />

        <div className="px-6 py-3">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 mb-2 text-xs text-slate-400">
            <Button variant="ghost" size="sm" onClick={onBack} className="h-6 px-1.5 -ml-1.5 text-slate-400 hover:text-slate-700">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="hover:text-slate-600 transition-colors cursor-default">Tasks</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-600 font-medium truncate max-w-[200px]">{applicantName}</span>
          </div>

          {/* Main header row */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-custom-blue to-blue-500 flex items-center justify-center shadow-sm shrink-0 mt-0.5">
                <Briefcase className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-slate-900 truncate">{applicantName}</h1>
                  <Badge variant="outline" className={cn("text-[10px] font-semibold capitalize px-1.5 py-0", STATUS_COLORS[task?.status] || "bg-slate-100 text-slate-600")}>
                    {statusLabel}
                  </Badge>
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">#{task?.id}</span>
                </div>
                <p className="text-sm text-slate-500 mt-0.5">{jobTitle}</p>
              </div>
            </div>

            {/* Progress bar row */}
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 max-w-sm">
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-custom-blue to-blue-400 rounded-full transition-all duration-500" />
                </div>
              </div>
              <span className="text-[10px] font-medium text-slate-500">{stageProgress.completed}/{stageProgress.total} stages</span>
              {currentStage && (
                <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">{currentStage.name}</Badge>
              )}
            </div>

            <div className="flex items-center gap-5 text-xs text-slate-500 shrink-0 ml-4">
              <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-slate-400" /> {task?.officer?.name || "Unassigned"}</span>
              <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" /> {department?.name}{subdepartment ? <><span className="text-slate-300 mx-0.5">/</span>{subdepartment.name}</> : ""}</span>
              {task?.created_at && (
                <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-slate-400" /> {new Date(task.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs - Force Mount + Flex Hierarchy for perfect scrolling */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="border-b bg-white px-6 shrink-0 shadow-sm z-10">
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
          <TabsContent value="workflow" forceMount className="h-full m-0 overflow-y-auto data-[state=inactive]:hidden">
            <WorkflowTab task={task} stages={stages} allDocuments={data.allDocuments} />
          </TabsContent>
          <TabsContent value="requirements" forceMount className="h-full m-0 overflow-y-auto data-[state=inactive]:hidden">
            <RequirementsTab data={data} onRefresh={onRefresh} />
          </TabsContent>
          <TabsContent value="templates" forceMount className="h-full m-0 overflow-y-auto data-[state=inactive]:hidden">
            <TemplatesTab data={data} />
          </TabsContent>
          <TabsContent value="billing" forceMount className="h-full m-0 p-6 overflow-y-auto data-[state=inactive]:hidden">
            <BillingTab task={task} onRefresh={onRefresh} />
          </TabsContent>
          <TabsContent value="automation" forceMount className="h-full m-0 overflow-y-auto data-[state=inactive]:hidden">
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

  const company = task?.participants_details?.find((p: any) => p.type === "company")
  const sponsor = task?.participants_details?.find((p: any) =>
    p.role?.includes("sponsor") || p.role?.includes("company")
  )
  const taskManager = task?.participants_details?.find((p: any) => p.role?.includes("task_manager"))

  return (
    <div className="max-w-4xl space-y-5 pb-8">
      {/* Job Details Card */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-custom-blue via-blue-400 to-blue-300" />
        <CardHeader className="pb-2 px-5 pt-4">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-custom-blue" />
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Job Details</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm">
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500 flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-slate-400" /> Applicant</span>
              <span className="font-medium text-slate-800 text-right">{task?.applicant_name}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500 flex items-center gap-1.5"><Hash className="h-3.5 w-3.5 text-slate-400" /> R Number</span>
              <span className="font-medium text-slate-800 text-right">{individual?.r_number || task?.r_number || "N/A"}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500 flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-slate-400" /> Nationality</span>
              <span className="font-medium text-slate-800 text-right">{individual?.nationality || task?.nationality || "N/A"}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-slate-400" /> Date of Birth</span>
              <span className="font-medium text-slate-800 text-right">{individual?.date_of_birth ? new Date(individual.date_of_birth).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "N/A"}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-slate-400" /> Passport No.</span>
              <span className="font-medium text-slate-800 text-right">{individual?.passport_number || "N/A"}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500 flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" /> Status</span>
              <span className={cn("font-medium capitalize text-right", task?.status === "cancelled" ? "text-red-600" : task?.status === "completed" ? "text-green-600" : "text-slate-800")}>{task?.status?.replace("_", " ") || "N/A"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assignment Card */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-200" />
        <CardHeader className="pb-2 px-5 pt-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-amber-600" />
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assignment &amp; Company</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm">
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Department</span>
              <span className="font-medium text-slate-800 text-right">{department?.name || "N/A"}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Subdepartment</span>
              <span className="font-medium text-slate-800 text-right">{subdepartment?.name || "N/A"}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Officer</span>
              <span className="font-medium text-slate-800 text-right">{task?.officer?.name || "Unassigned"}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Task Manager</span>
              <span className="font-medium text-slate-800 text-right">{taskManager?.name || "N/A"}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Sponsor / Company</span>
              <span className="font-medium text-slate-800 text-right">{sponsor?.name || company?.name || "N/A"}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">Created</span>
              <span className="font-medium text-slate-800 text-right">{task?.created_at ? new Date(task.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "N/A"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Card */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-green-400 via-green-300 to-emerald-200" />
        <CardHeader className="pb-2 px-5 pt-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Progress</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-700" style={{ width: `${progress.percentage}%` }} />
          </div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-500">{progress.completed}/{progress.total} stages completed</p>
            <span className="text-xs font-bold text-slate-700">{progress.percentage}%</span>
          </div>
          {currentStage && (
            <div className="p-3.5 bg-blue-50/80 rounded-lg border border-blue-100">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-3.5 w-3.5 text-blue-600" />
                <p className="text-xs font-semibold text-blue-700">Current Stage: {currentStage.name}</p>
              </div>
              {currentStage.description && <p className="text-[11px] text-blue-500 mt-1 ml-5 leading-relaxed">{currentStage.description}</p>}
            </div>
          )}
          {stages.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Stage Overview</p>
              <div className="flex flex-wrap gap-1.5">
                {[...stages].sort((a, b) => (a.order_num ?? 0) - (b.order_num ?? 0)).map((s) => {
                  const done = task?.stages?.[s.id]?.status === "completed"
                  return (
                    <Badge key={s.id} variant="outline" className={cn(
                      "text-[9px] px-1.5 py-0 font-medium",
                      done ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-500 border-slate-200"
                    )}>
                      {done ? <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> : <Clock className="h-2.5 w-2.5 mr-1" />}
                      {s.name}
                    </Badge>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}