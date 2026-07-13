// @ts-nocheck
"use client"

import React, { useState, useMemo, useEffect } from "react"
import { ArrowLeft, Briefcase, CheckCircle2, Clock, FileText, User, Zap, History, MessageSquare, CreditCard, FileType, Building2, ChevronRight, LayoutList, Calendar, Globe, Hash, AlertTriangle, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  initialTab?: string
  initialAutomationId?: string
  initialOpenSendDialog?: boolean
  initialTemplateDocId?: string
}

const STATUS_COLORS: Record<string, string> = {
  enquiry: "bg-amber-100 text-amber-800 border-amber-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
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

export function JobWorkspace({ data, onBack, onRefresh, initialTab, initialAutomationId, initialOpenSendDialog, initialTemplateDocId }: JobWorkspaceProps) {
  const { task, department, subdepartment, stages, individual } = data
  const [activeTab, setActiveTab] = useState(initialTab || "workflow")
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set([initialTab || "workflow"]))
  const [openReviewDraft, setOpenReviewDraft] = useState(false)
  const [openSendRequirements, setOpenSendRequirements] = useState(false)

  // Sync activeTab when URL-driven initialTab prop changes (e.g. from zap icon redirect)
  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTab(initialTab)
      setVisitedTabs(prev => prev.has(initialTab) ? prev : new Set(prev).add(initialTab))
    }
  }, [initialTab])

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    setVisitedTabs(prev => prev.has(tab) ? prev : new Set(prev).add(tab))
  }

  const stageProgress = useMemo(() => getStageProgress(task, stages), [task, stages])
  const currentStage = useMemo(() => getCurrentStage(task, stages), [task, stages])

  const jobLevelLabel = useMemo(() => {
    const jobLevel = task?.job_level
    if (!jobLevel) return null
    if (jobLevel.class_id) {
      const classItem = subdepartment?.classes?.find((c: any) => c.id == jobLevel.class_id)
      return classItem?.name || `Class ${jobLevel.class_id}`
    }
    if (jobLevel.subclass_id) return `Subclass ${jobLevel.subclass_id}`
    return null
  }, [task?.job_level, subdepartment])

  const jobTitle = task?.job_description || subdepartment?.name || department?.name || "Job Workspace"
  const applicantName = task?.applicant_name || individual?.full_name || "Unknown"
  const statusLabel = task?.status?.replace("_", " ") || "Unknown"
  const clientDraft = task?.registry_metadata?.client_requirements_draft

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFC] overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-custom-blue via-blue-400 to-blue-300" />
      {/* Header */}
      <div className="shrink-0 z-10 bg-white border-b border-slate-200">
        <div className="px-6 py-3">
          {/* Breadcrumb and Metadata Row */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-base text-slate-400">
              <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-1.5 -ml-1.5 text-slate-400 hover:text-slate-700">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="hover:text-slate-600 transition-colors cursor-default">Tasks</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-slate-500 font-medium uppercase">{applicantName}</span>
            </div>

            <div className="flex items-center gap-5 text-sm text-slate-500 font-medium">
              <span className="flex items-center gap-1.5"><User className="h-4 w-4 text-slate-400" /> {task?.officer?.name || "Unassigned"}</span>
              <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4 text-slate-400" /> {department?.name}{subdepartment ? <><span className="text-slate-300 mx-0.5">/</span>{subdepartment.name}</> : ""}{jobLevelLabel ? <><span className="text-slate-300 mx-0.5">/</span>{jobLevelLabel}</> : ""}</span>
              {task?.created_at && (
                <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-slate-400" /> {new Date(task.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              )}
            </div>
          </div>

          {/* Main header row */}
          <div className="flex items-center justify-between gap-6 py-2">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-3xl font-bold text-slate-900 uppercase truncate">{applicantName}</h1>
              <Badge variant="outline" className={cn("text-sm font-bold capitalize px-3 py-0.5 rounded-full border-blue-200", STATUS_COLORS[task?.status] || "bg-slate-100 text-slate-600")}>
                {statusLabel}
              </Badge>
              <span className="text-sm text-slate-500 font-semibold bg-slate-100 px-2.5 py-0.5 rounded-full font-mono">#{task?.id}</span>
              {jobLevelLabel && (
                <Badge variant="outline" className="text-sm font-bold px-3 py-0.5 rounded-full bg-blue-50 text-blue-700 border-blue-200">
                  {jobLevelLabel}
                </Badge>
              )}
            </div>

            {/* Progress Section */}
            <div className="flex items-center gap-4 shrink-0">
              <span className="text-sm font-semibold text-slate-500">{stageProgress.completed} / {stageProgress.total} stages</span>
              <div className="w-40 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${stageProgress.percentage}%` }} />
              </div>
              {currentStage && (
                <Badge variant="outline" className="text-sm font-bold px-3 py-0.5 rounded-full bg-blue-50 text-blue-700 border-blue-200">
                  {currentStage.name}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Row with actions aligned */}
      <div className="border-b border-slate-200 bg-white px-6 shrink-0 flex items-center justify-between z-10 shadow-sm">
        <div className="flex gap-1.5">
          {TAB_DEFINITIONS.map(tab => {
            const isActive = activeTab === tab.value
            const Icon = tab.icon
            return (
              <button
                key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                className={cn(
                  "px-4 py-3 my-1.5 rounded-lg text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-all relative",
                  isActive
                    ? "text-blue-700 bg-blue-50"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                )}
              >
                <Icon className={cn("h-4 w-4", isActive ? "text-blue-600" : "text-slate-400")} />
                {tab.label}
                {isActive && (
                  <span className="absolute left-2 right-2 -bottom-[7px] h-[3px] rounded-full bg-blue-600" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden relative">
        {visitedTabs.has("overview") && (
          <div className={cn("h-full overflow-y-auto", activeTab !== "overview" && "hidden")}>
            <div className="p-6">
              <OverviewTabContent data={data} />
            </div>
          </div>
        )}
        {visitedTabs.has("workflow") && (
          <div className={cn("h-full overflow-y-auto", activeTab !== "workflow" && "hidden")}>
            <WorkflowTab task={task} stages={stages} allDocuments={data.allDocuments} />
          </div>
        )}
        {visitedTabs.has("requirements") && (
          <div className={cn("h-full overflow-y-auto", activeTab !== "requirements" && "hidden")}>
            <RequirementsTab
              data={data}
              onRefresh={onRefresh}
              openReviewDraft={openReviewDraft}
              setOpenReviewDraft={setOpenReviewDraft}
              openSendRequirements={openSendRequirements}
              setOpenSendRequirements={setOpenSendRequirements}
              autoOpenSendDialog={activeTab === "requirements" ? initialOpenSendDialog : undefined}
            />
          </div>
        )}
        {visitedTabs.has("templates") && (
          <div className={cn("h-full overflow-y-auto", activeTab !== "templates" && "hidden")}>
            <TemplatesTab data={data} targetDocumentId={activeTab === "templates" ? initialTemplateDocId : undefined} />
          </div>
        )}
        {visitedTabs.has("billing") && (
          <div className={cn("h-full overflow-y-auto", activeTab !== "billing" && "hidden")}>
            <div className="p-6">
              <BillingTab task={task} onRefresh={onRefresh} />
            </div>
          </div>
        )}
        {visitedTabs.has("automation") && (
          <div className={cn("h-full overflow-y-auto", activeTab !== "automation" && "hidden")}>
            <AutomationTab data={data} onRefresh={onRefresh} highlightAutomationId={activeTab === "automation" ? initialAutomationId : undefined} />
          </div>
        )}
        {visitedTabs.has("history") && (
          <div className={cn("h-full overflow-y-auto", activeTab !== "history" && "hidden")}>
            <div className="p-6">
              <HistoryTab task={task} stages={stages} />
            </div>
          </div>
        )}
        {visitedTabs.has("notes") && (
          <div className={cn("h-full overflow-y-auto", activeTab !== "notes" && "hidden")}>
            <div className="p-6">
              <NotesTab task={task} onRefresh={onRefresh} />
            </div>
          </div>
        )}
      </div>
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
