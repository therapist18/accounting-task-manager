// @ts-nocheck
"use client"

import React, { useState, useMemo, useEffect } from "react"
import { ArrowLeft, Briefcase, CheckCircle2, Clock, FileText, User, Zap, History, MessageSquare, CreditCard, FileType, Building2, ChevronRight, LayoutList, Calendar, Globe, Hash, AlertTriangle, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import type { JobWorkspaceData } from "./fetchJobWorkspaceData"
import { WorkflowTab } from "./tabs/WorkflowTab"
import { AutomationTab } from "./tabs/AutomationTab"
import { RequirementsTab, buildParticipantColumns, getCellStatus } from "./tabs/RequirementsTab"
import { TemplatesTab } from "./tabs/TemplatesTab"
import { BillingTab } from "./tabs/BillingTab"
import { HistoryTab } from "./tabs/HistoryTab"
import { NotesTab } from "./tabs/NotesTab"
import { GuidedApplication } from "./guided/GuidedApplication"

interface JobWorkspaceProps {
  data: JobWorkspaceData
  onBack: () => void
  onRefresh?: () => void
  initialTab?: string
  initialAutomationId?: string
  initialRequirementId?: string
  initialOpenSendDialog?: boolean
  initialTemplateDocId?: string
  /** "guided" opens the step-by-step application flow instead of the tabs */
  initialMode?: string
}

// Keeps ?mode / ?automationId in the URL in step with guided mode (so refresh and
// shared links land in the same place) without a navigation or refetch.
function syncGuidedParams(guided: boolean, automationId?: string | null) {
  const url = new URL(window.location.href)
  if (guided) url.searchParams.set("mode", "guided")
  else url.searchParams.delete("mode")
  if (automationId) url.searchParams.set("automationId", automationId)
  else if (guided) url.searchParams.delete("automationId")
  window.history.replaceState(null, "", url.toString())
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

// Mirrors the isFailed/needsReview/isRunning classification in AutomationTab's per-row
// status pill, so this badge never disagrees with what the tab itself shows.
function classifyAutomationJob(job: any) {
  const isFailed = job.status === "failed"
  const needsReview = !isFailed && job.result?.status === "needs_review"
  const isRunning = ["pending", "claiming", "running"].includes(job.status)
  return { isFailed, needsReview, isRunning }
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

export function JobWorkspace({ data, onBack, onRefresh, initialTab, initialAutomationId, initialRequirementId, initialOpenSendDialog, initialTemplateDocId, initialMode }: JobWorkspaceProps) {
  const { task, department, subdepartment, stages, individual } = data
  const [guided, setGuided] = useState(initialMode === "guided")
  const [guidedAutomationId, setGuidedAutomationId] = useState<string | null>(initialMode === "guided" ? initialAutomationId || null : null)

  const enterGuided = (automationId?: string | null) => {
    setGuided(true)
    setGuidedAutomationId(automationId || null)
    syncGuidedParams(true, automationId)
  }
  const exitGuided = () => {
    setGuided(false)
    syncGuidedParams(false)
    // Land on the automation matrix - the closest tab to where the user just was.
    handleTabChange("automation")
  }
  const [activeTab, setActiveTab] = useState(initialTab || "workflow")
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set([initialTab || "workflow"]))
  const [openReviewDraft, setOpenReviewDraft] = useState(false)
  const [openSendRequirements, setOpenSendRequirements] = useState(false)
  // Mutable versions of the URL-sourced deep-link targets, so a same-session jump
  // (e.g. AutomationTab's "linked requirement" button) can retarget the highlight
  // without a page reload - tabs stay mounted, data stays in memory.
  const [requirementHighlightId, setRequirementHighlightId] = useState(initialRequirementId)
  const [templateHighlightId, setTemplateHighlightId] = useState(initialTemplateDocId)
  // Populated by TemplatesTab itself once visited (see its onSummaryChange prop) - stays
  // populated across tab switches since it lives here, not in the (lazily-mounted) tab.
  const [templatesSummary, setTemplatesSummary] = useState<{ ready: number; total: number } | null>(null)

  // Automation run history for this task - fetched once here (independent of
  // whether the Automation tab has been opened, so the tab-bar badge is accurate
  // even before the tab ever mounts) and passed down to AutomationTab as a prop
  // instead of it running the exact same query itself.
  //
  // Goes through /api/automations/runs rather than querying tm_automation_runs
  // directly: the table has RLS enabled with no client policy, so all access goes
  // through the server route that scopes rows to the signed-in user.
  const [automationJobs, setAutomationJobs] = useState<any[] | null>(null)
  useEffect(() => {
    if (!task?.id) { setAutomationJobs(null); return }
    let cancelled = false
    fetch(`/api/automations/runs?taskId=${encodeURIComponent(String(task.id))}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled || !payload?.success) return
        setAutomationJobs(payload.runs ?? [])
      })
      .catch(() => { /* history is non-critical; leave the badge hidden */ })
    return () => { cancelled = true }
  }, [task?.id])

  // Lightweight, tab-bar-only summary of automation run state (failed/needs-review/running),
  // derived from the same automationJobs fetched above.
  const automationSummary = useMemo(() => {
    if (!automationJobs?.length || !data.automations?.length) return null
    const knownAutomationIds = new Set(data.automations.map((a: any) => String(a.id)))
    const latest: Record<string, any> = {}
    automationJobs.forEach((j: any) => {
      const autoId = j.automation_id != null ? String(j.automation_id) : null
      if (autoId && knownAutomationIds.has(autoId) && !latest[autoId]) latest[autoId] = j
    })
    const summary = { failed: 0, needsReview: 0, running: 0 }
    Object.values(latest).forEach((job: any) => {
      const { isFailed, needsReview, isRunning } = classifyAutomationJob(job)
      if (isFailed) summary.failed++
      else if (needsReview) summary.needsReview++
      else if (isRunning) summary.running++
    })
    return summary
  }, [automationJobs, data.automations])

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

  const handleNavigateToRequirement = (requirementId: string) => {
    setRequirementHighlightId(requirementId)
    handleTabChange("requirements")
  }

  const handleNavigateToTemplate = (documentId: string) => {
    setTemplateHighlightId(documentId)
    handleTabChange("templates")
  }

  const stageProgress = useMemo(() => getStageProgress(task, stages), [task, stages])
  const currentStage = useMemo(() => getCurrentStage(task, stages), [task, stages])

  // Reuses RequirementsTab's own column-building and cell-matching logic (rather than
  // re-deriving "does this requirement have a document" separately) so this badge can never
  // drift from what the tab itself shows, while staying cheap enough to compute up front.
  const requirementsSummary = useMemo(() => {
    if (!task?.requirements?.length) return null
    const columns = buildParticipantColumns(task)
    const allCompanyDocumentsMap: Record<string, any[]> = {}
    ;(data.allCompanyDocuments || []).forEach((doc: any) => {
      if (doc.company_id) (allCompanyDocumentsMap[doc.company_id] ||= []).push(doc)
    })
    let total = 0
    let satisfied = 0
    task.requirements.forEach((req: any) => {
      columns.forEach(col => {
        const status = getCellStatus(req, col, data.documentsByIndividual, allCompanyDocumentsMap)
        if (status.type === "na") return
        total++
        if (status.type === "view") satisfied++
      })
    })
    return total > 0 ? { total, satisfied } : null
  }, [task, data.documentsByIndividual, data.allCompanyDocuments])

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

  if (guided) {
    return (
      <GuidedApplication
        data={data}
        automationId={guidedAutomationId}
        automationJobs={automationJobs}
        onAutomationChange={(id) => { setGuidedAutomationId(id || null); syncGuidedParams(true, id || null) }}
        onExit={exitGuided}
        onRefresh={onRefresh}
      />
    )
  }

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
              <h1 className="text-2xl tracking-tight font-bold text-slate-900 uppercase truncate">{applicantName}</h1>
              <Badge variant="outline" className={cn("text-sm font-semibold capitalize px-2.5 py-0.5 rounded-full border-blue-200", STATUS_COLORS[task?.status] || "bg-slate-100 text-slate-600")}>
                {statusLabel}
              </Badge>
              <span className="text-sm text-slate-500 font-semibold bg-slate-100 px-2.5 py-0.5 rounded-full font-mono">#{task?.id}</span>
              {jobLevelLabel && (
                <Badge variant="outline" className="text-sm font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border-blue-200">
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
                <Badge variant="outline" className="text-sm font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border-blue-200">
                  {currentStage.name}
                </Badge>
              )}
              {data.automations?.length > 0 && (
                <Button
                  size="sm"
                  className="h-8 bg-custom-blue hover:bg-custom-blue/90 text-white"
                  onClick={() => enterGuided(data.automations.length === 1 ? String(data.automations[0].id) : null)}
                  title="Step-by-step: documents, details and letters, then run the automation"
                >
                  <Zap className="h-4 w-4 mr-1.5" /> Start application
                </Button>
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

            const autoBadge = tab.value === "automation" ? automationSummary : null
            const autoBadgeCount = autoBadge ? autoBadge.failed + autoBadge.needsReview + autoBadge.running : 0

            const reqBadge = tab.value === "requirements" ? requirementsSummary : null
            const tplBadge = tab.value === "templates" ? templatesSummary : null

            return (
              <button
                key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                className={cn(
                  "px-4 py-3 my-1.5 rounded-lg text-base font-medium flex items-center gap-2 whitespace-nowrap transition-all relative",
                  isActive
                    ? "text-blue-700 bg-blue-50"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                )}
              >
                <Icon className={cn("h-4 w-4", isActive ? "text-blue-600" : "text-slate-400")} />
                {tab.label}
                {reqBadge && (
                  <span
                    title={`${reqBadge.satisfied} of ${reqBadge.total} requirements have a document on file`}
                    className={cn(
                      "px-1.5 h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center",
                      reqBadge.satisfied === reqBadge.total ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {reqBadge.satisfied}/{reqBadge.total}
                  </span>
                )}
                {tplBadge && (
                  <span
                    title={`${tplBadge.ready} of ${tplBadge.total} templates have all placeholder data available`}
                    className={cn(
                      "px-1.5 h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center",
                      tplBadge.ready === tplBadge.total ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {tplBadge.ready}/{tplBadge.total}
                  </span>
                )}
                {autoBadgeCount > 0 && (
                  <span
                    title={[
                      autoBadge.failed > 0 ? `${autoBadge.failed} failed` : null,
                      autoBadge.needsReview > 0 ? `${autoBadge.needsReview} needs review` : null,
                      autoBadge.running > 0 ? `${autoBadge.running} running` : null,
                    ].filter(Boolean).join(", ")}
                    className={cn(
                      "min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center",
                      autoBadge.failed > 0 ? "bg-red-500" : autoBadge.needsReview > 0 ? "bg-amber-500" : "bg-blue-500 animate-pulse"
                    )}
                  >
                    {autoBadgeCount}
                  </span>
                )}
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
              highlightRequirementId={activeTab === "requirements" ? requirementHighlightId : undefined}
            />
          </div>
        )}
        {visitedTabs.has("templates") && (
          <div className={cn("h-full overflow-y-auto", activeTab !== "templates" && "hidden")}>
            <TemplatesTab data={data} targetDocumentId={activeTab === "templates" ? templateHighlightId : undefined} onSummaryChange={setTemplatesSummary} />
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
            <AutomationTab
              data={data}
              onRefresh={onRefresh}
              highlightAutomationId={activeTab === "automation" ? initialAutomationId : undefined}
              onNavigateToRequirement={handleNavigateToRequirement}
              onNavigateToTemplate={handleNavigateToTemplate}
              automationJobs={automationJobs}
            />
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
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Job Details</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-base">
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
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Assignment &amp; Company</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-base">
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
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Progress</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-700" style={{ width: `${progress.percentage}%` }} />
          </div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-slate-500">{progress.completed}/{progress.total} stages completed</p>
            <span className="text-sm font-bold text-slate-700">{progress.percentage}%</span>
          </div>
          {currentStage && (
            <div className="p-3.5 bg-blue-50/80 rounded-lg border border-blue-100">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-3.5 w-3.5 text-blue-600" />
                <p className="text-sm font-semibold text-blue-700">Current Stage: {currentStage.name}</p>
              </div>
              {currentStage.description && <p className="text-sm text-blue-500 mt-1 ml-5 leading-relaxed">{currentStage.description}</p>}
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
