// @ts-nocheck
"use client"

import React from "react"
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Circle, Clock, FileSignature, ListChecks, Loader2, Play, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useCurrentUser } from "@/lib/hooks/use-current-user"
import { auditActor } from "../../utils/audit"
import type { JobWorkspaceData } from "../fetchJobWorkspaceData"
import { useAutomationReadiness } from "../useAutomationReadiness"

/**
 * The job's home tab: everything that still needs doing, in one table, with a button to the tab
 * where each thing is done. One row per area (workflow stages, requirement documents, letters) and
 * one per automated application, each saying exactly what's missing and for whom.
 *
 * It only summarises - the work itself stays in the tabs (and the application guide over them).
 */

type RowState = "done" | "todo" | "unknown" | "running" | "failed"

interface OverviewTabProps {
  data: JobWorkspaceData
  requirementsSummary: { total: number; satisfied: number } | null
  templatesSummary: { ready: number; total: number } | null
  automationJobs?: any[] | null
  stageProgress: { completed: number; total: number; percentage: number }
  currentStage: any | null
  onGoToTab: (tab: string) => void
  onStartApplication: (automationId: string) => void
}

export function OverviewTab({
  data, requirementsSummary, templatesSummary, automationJobs, stageProgress, currentStage, onGoToTab, onStartApplication,
}: OverviewTabProps) {
  const { task, stages, individual, department, subdepartment, automations = [] } = data
  const company = task?.participants_details?.find((p: any) => p.type === "company")
  const sponsor = task?.participants_details?.find((p: any) => p.role?.includes("sponsor") || p.role?.includes("company"))
  const taskManager = task?.participants_details?.find((p: any) => p.role?.includes("task_manager"))
  const sortedStages = [...(stages || [])].sort((a, b) => (a.order_num ?? 0) - (b.order_num ?? 0))
  const pendingStages = sortedStages.filter((s) => task?.stages?.[s.id]?.status !== "completed")

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 pb-8">
      {/* What's left */}
      <section className="min-w-0">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-bold text-slate-900">What's left on this job</h2>
          <p className="text-sm text-slate-500">Each row opens the tab where it's done.</p>
        </div>
        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="px-4 py-2.5 w-8" />
                <th className="px-3 py-2.5 w-56">Area</th>
                <th className="px-3 py-2.5 w-28">Progress</th>
                <th className="px-3 py-2.5">What's missing</th>
                <th className="px-4 py-2.5 w-40 text-right">Go to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <OverviewRow
                state={stageProgress.total === 0 ? "unknown" : pendingStages.length === 0 ? "done" : "todo"}
                Icon={Clock}
                area="Workflow stages"
                progress={stageProgress.total ? `${stageProgress.completed}/${stageProgress.total}` : "—"}
                missing={
                  stageProgress.total === 0 ? "No stages configured for this job type."
                    : pendingStages.length === 0 ? "All stages complete."
                    : <>Current: <b className="font-semibold text-slate-800">{currentStage?.name || pendingStages[0]?.name}</b>{pendingStages.length > 1 && <> · then {pendingStages.slice(1, 4).map((s) => s.name).join(", ")}{pendingStages.length > 4 ? ` +${pendingStages.length - 4} more` : ""}</>}</>
                }
                action={{ label: "Workflow", onClick: () => onGoToTab("workflow") }}
              />
              <OverviewRow
                state={!requirementsSummary ? "unknown" : requirementsSummary.satisfied === requirementsSummary.total ? "done" : "todo"}
                Icon={CheckCircle2}
                area="Requirement documents"
                progress={requirementsSummary ? `${requirementsSummary.satisfied}/${requirementsSummary.total}` : "—"}
                missing={
                  !requirementsSummary ? "No requirements set for this job type."
                    : requirementsSummary.satisfied === requirementsSummary.total ? "Every required document is on file."
                    : `${requirementsSummary.total - requirementsSummary.satisfied} document${requirementsSummary.total - requirementsSummary.satisfied === 1 ? "" : "s"} still to collect.`
                }
                action={{ label: "Requirements", onClick: () => onGoToTab("requirements") }}
              />
              <OverviewRow
                state={!templatesSummary ? "unknown" : templatesSummary.ready === templatesSummary.total ? "done" : "todo"}
                Icon={FileSignature}
                area="Letters & templates"
                progress={templatesSummary ? `${templatesSummary.ready}/${templatesSummary.total}` : "—"}
                missing={
                  !templatesSummary ? "Open the Templates tab once to check what each letter still needs."
                    : templatesSummary.ready === templatesSummary.total ? "Every template has the data it needs."
                    : `${templatesSummary.total - templatesSummary.ready} template${templatesSummary.total - templatesSummary.ready === 1 ? "" : "s"} still missing data.`
                }
                action={{ label: "Templates", onClick: () => onGoToTab("templates") }}
              />
              {automations.map((a: any) => (
                <ApplicationRow
                  key={a.id}
                  data={data}
                  automation={a}
                  lastRun={(automationJobs || []).find((j: any) => String(j.automation_id) === String(a.id)) || null}
                  onGoToTab={onGoToTab}
                  onStart={() => onStartApplication(String(a.id))}
                />
              ))}
            </tbody>
          </table>
        </div>
        {automations.length === 0 && (
          <p className="text-sm text-slate-400 mt-2">No automated application is linked to this job type.</p>
        )}
      </section>

      {/* Job facts */}
      <aside className="space-y-4">
        <FactsCard title="Job">
          <Fact label="Applicant" value={task?.applicant_name} />
          <Fact label="R number" value={individual?.r_number || task?.r_number} mono />
          <Fact label="Nationality" value={individual?.nationality || task?.nationality} />
          <Fact label="Date of birth" value={fmtDate(individual?.date_of_birth)} />
          <Fact label="Passport no." value={individual?.passport_number} mono />
          <Fact label="Status" value={task?.status?.replace("_", " ")} capitalize />
        </FactsCard>
        <FactsCard title="Assignment">
          <Fact label="Department" value={department?.name} />
          <Fact label="Subdepartment" value={subdepartment?.name} />
          <Fact label="Officer" value={task?.officer?.name || "Unassigned"} />
          <Fact label="Task manager" value={taskManager?.name} />
          <Fact label="Sponsor / company" value={sponsor?.name || company?.name} />
          <Fact label="Created" value={fmtDate(task?.created_at)} />
        </FactsCard>
        {sortedStages.length > 0 && (
          <FactsCard title={`Stages · ${stageProgress.completed}/${stageProgress.total}`}>
            <ol className="space-y-1.5">
              {sortedStages.map((s) => {
                const done = task?.stages?.[s.id]?.status === "completed"
                const current = currentStage?.id === s.id && !done
                return (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    {done ? <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      : current ? <span className="h-2 w-2 mx-[3px] rounded-full bg-custom-blue shrink-0" />
                      : <Circle className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
                    <span className={cn("truncate", done ? "text-slate-500" : current ? "font-semibold text-slate-900" : "text-slate-600")}>{s.name}</span>
                  </li>
                )
              })}
            </ol>
          </FactsCard>
        )}
      </aside>
    </div>
  )
}

/** One automated application: its readiness (documents / details / letters) and last run. */
function ApplicationRow({ data, automation, lastRun, onGoToTab, onStart }) {
  const { user } = useCurrentUser()
  const readiness = useAutomationReadiness(data, automation, auditActor(user).by_id)
  const running = ["pending", "claiming", "running"].includes(lastRun?.status)

  if (readiness.status === "loading") {
    return (
      <OverviewRow
        state="unknown"
        Icon={Zap}
        area={automation.name || `Automation ${automation.id}`}
        progress={<Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        missing="Checking what this application needs…"
        action={{ label: "Automation", onClick: () => onGoToTab("automation") }}
      />
    )
  }

  const missing = [
    ...readiness.documents.filter((i) => !i.satisfied && !i.optional).map((i) => ({ i, tab: "requirements", what: "document" })),
    ...readiness.fields.filter((i) => !i.satisfied && !i.optional).map((i) => ({ i, tab: "automation", what: "detail" })),
    ...readiness.letters.filter((i) => !i.satisfied && !i.optional).map((i) => ({ i, tab: "templates", what: "letter" })),
  ]
  const s = readiness.summary
  const done = s.documents.done + s.fields.done + s.letters.done
  const total = s.documents.total + s.fields.total + s.letters.total
  const state: RowState = running ? "running" : lastRun?.status === "failed" ? "failed" : missing.length === 0 ? "done" : "todo"

  // Group what's missing by the tab it's fixed in, naming the first few items and whose they are.
  const byTab = ["requirements", "automation", "templates"]
    .map((tab) => ({ tab, items: missing.filter((m) => m.tab === tab) }))
    .filter((g) => g.items.length)
  const TAB_LABEL = { requirements: "Documents", automation: "Details", templates: "Letters" }

  return (
    <OverviewRow
      state={state}
      Icon={Zap}
      area={
        <span>
          {automation.name || `Automation ${automation.id}`}
          <span className="block text-xs font-normal text-slate-500 mt-0.5">
            {running ? "Running now…"
              : lastRun ? `Last run ${fmtDate(lastRun.completed_at || lastRun.created_at)} · ${lastRun.result?.status === "needs_review" ? "needed review" : lastRun.status}`
              : "Not run yet"}
          </span>
        </span>
      }
      progress={`${done}/${total}`}
      missing={
        readiness.status === "error" ? <span className="text-amber-700">Couldn't check: {readiness.error}</span>
          : missing.length === 0 ? (running ? "Everything's in - the run is in progress." : "Everything required is in - ready to run.")
          : (
            <div className="space-y-1">
              {byTab.map(({ tab, items }) => (
                <div key={tab} className="flex items-start gap-2">
                  <button onClick={() => onGoToTab(tab)} className="shrink-0 text-xs font-semibold text-custom-blue hover:underline mt-0.5">
                    {TAB_LABEL[tab]} ({items.length})
                  </button>
                  <span className="text-slate-600">
                    {items.slice(0, 4).map(({ i }) => `${i.label}${i.col?.label ? ` (${i.col.label})` : ""}`).join(", ")}
                    {items.length > 4 && ` +${items.length - 4} more`}
                  </span>
                </div>
              ))}
            </div>
          )
      }
      action={
        missing.length === 0 && !running
          ? { label: "Run", primary: true, Icon: Play, onClick: onStart }
          : { label: "Start application", onClick: onStart }
      }
    />
  )
}

function OverviewRow({ state, Icon, area, progress, missing, action }: {
  state: RowState
  Icon: any
  area: React.ReactNode
  progress: React.ReactNode
  missing: React.ReactNode
  action: { label: string; onClick: () => void; primary?: boolean; Icon?: any }
}) {
  const ActionIcon = action.Icon || ArrowRight
  return (
    <tr className="align-top hover:bg-slate-50/60">
      <td className="px-4 py-3">
        {state === "done" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          : state === "todo" ? <AlertTriangle className="h-5 w-5 text-amber-500" />
          : state === "running" ? <Loader2 className="h-5 w-5 text-custom-blue animate-spin" />
          : state === "failed" ? <AlertTriangle className="h-5 w-5 text-red-500" />
          : <Circle className="h-5 w-5 text-slate-300" />}
      </td>
      <td className="px-3 py-3 font-semibold text-slate-800">
        <span className="flex items-start gap-2"><Icon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />{area}</span>
      </td>
      <td className="px-3 py-3 tabular-nums text-slate-700">{progress}</td>
      <td className="px-3 py-3 text-slate-600">{missing}</td>
      <td className="px-4 py-2.5 text-right">
        <Button
          size="sm"
          variant={action.primary ? "default" : "outline"}
          className={cn("h-8", action.primary && "bg-custom-blue hover:bg-custom-blue/90")}
          onClick={action.onClick}
        >
          {action.label} <ActionIcon className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </td>
    </tr>
  )
}

function FactsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-lg bg-white">
      <p className="px-4 py-2.5 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="px-4 py-3 space-y-2">{children}</div>
    </div>
  )
}

function Fact({ label, value, mono, capitalize }: { label: string; value?: string | null; mono?: boolean; capitalize?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={cn("font-medium text-slate-800 text-right truncate", mono && "font-mono", capitalize && "capitalize")}>{value || "—"}</span>
    </div>
  )
}

function fmtDate(value?: string | null) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}
