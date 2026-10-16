// @ts-nocheck
"use client"

import React, { useEffect, useMemo, useRef } from "react"
import { ArrowRight, Check, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useCurrentUser } from "@/lib/hooks/use-current-user"
import { auditActor } from "../utils/audit"
import type { JobWorkspaceData } from "./fetchJobWorkspaceData"
import { useAutomationReadiness } from "./useAutomationReadiness"

/**
 * "Start application" guide: a slim step bar over the normal workspace tabs.
 *
 * It replaces the separate guided page, which rebuilt in its own UI what the tabs already do
 * (Requirements = documents, Automation's Field Resolution Matrix = details + run, Templates =
 * letters). Each step here just opens the real tab - focused on this application where the tab
 * supports it - and shows how far along that part is.
 */

export type GuideStepId = "documents" | "details" | "letters" | "run"

const STEP_TAB: Record<GuideStepId, string> = {
  documents: "requirements",
  details: "automation",
  letters: "templates",
  run: "automation",
}

interface ApplicationGuideBarProps {
  data: JobWorkspaceData
  automationId: string | null
  onAutomationChange: (automationId: string) => void
  automationJobs?: any[] | null
  step: GuideStepId | null
  onStepChange: (step: GuideStepId, tab: string) => void
  onExit: () => void
}

export function ApplicationGuideBar({ data, automationId, onAutomationChange, automationJobs, step, onStepChange, onExit }: ApplicationGuideBarProps) {
  const automations = data.automations || []
  const automation = automations.find((a: any) => String(a.id) === String(automationId)) || null
  const { user } = useCurrentUser()
  const readiness = useAutomationReadiness(data, automation, auditActor(user).by_id)

  const lastRun = useMemo(
    () => (automationJobs || []).find((j: any) => automation && String(j.automation_id) === String(automation.id)) || null,
    [automationJobs, automation]
  )

  const steps = useMemo(() => {
    const s = readiness.summary
    const all: { id: GuideStepId; label: string; summary: any }[] = [
      { id: "documents", label: "Documents", summary: s.documents },
      { id: "details", label: "Details", summary: s.fields },
      { id: "letters", label: "Letters", summary: s.letters },
    ]
    return [...all.filter((x) => x.summary.total > 0), { id: "run" as GuideStepId, label: "Run", summary: null }]
  }, [readiness.summary])

  // Open on the first step that still needs something - once per application, so the user's own
  // navigation wins afterwards even as items get completed under them.
  const landedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!automation || readiness.status !== "ready") return
    if (landedFor.current === String(automation.id)) return
    landedFor.current = String(automation.id)
    const first = steps.find((x) => x.summary && x.summary.requiredMissing > 0)?.id || "run"
    onStepChange(first, STEP_TAB[first])
  }, [automation, readiness.status, steps])

  const currentIdx = Math.max(0, steps.findIndex((x) => x.id === step))
  const next = steps[currentIdx + 1]
  const runStatus = lastRun?.status as string | undefined
  const running = ["pending", "claiming", "running"].includes(runStatus || "")

  return (
    <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-2.5 flex items-center gap-5">
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <span className="text-sm font-semibold text-slate-500">Application</span>
        {automations.length > 1 ? (
          <select
            value={automationId || ""}
            onChange={(e) => onAutomationChange(e.target.value)}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 max-w-[16rem]"
          >
            <option value="" disabled>Choose…</option>
            {automations.map((a: any) => <option key={a.id} value={String(a.id)}>{a.name || `Automation ${a.id}`}</option>)}
          </select>
        ) : (
          <span className="text-sm font-semibold text-slate-900 truncate max-w-[16rem]">{automation?.name || "—"}</span>
        )}
      </div>

      <div className="h-6 w-px bg-slate-200 shrink-0" />

      {!automation ? (
        <span className="text-sm text-slate-500">Choose the application to work on.</span>
      ) : readiness.status === "loading" ? (
        <span className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking what it needs…</span>
      ) : (
        <ol className="flex items-center gap-1 min-w-0 overflow-x-auto">
          {steps.map((x, i) => {
            const active = x.id === step
            const sm = x.summary
            const complete = sm ? sm.requiredMissing === 0 : runStatus === "completed"
            const status = sm
              ? sm.requiredMissing > 0 ? `${sm.requiredMissing} missing` : `${sm.done}/${sm.total}`
              : running ? "Running…" : runStatus === "completed" ? "Done" : readiness.canRun ? "Ready" : "Not ready"
            return (
              <li key={x.id} className="flex items-center gap-1 shrink-0">
                {i > 0 && <span className="w-5 h-px bg-slate-200" />}
                <button
                  onClick={() => onStepChange(x.id, STEP_TAB[x.id])}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors",
                    active ? "bg-slate-100" : "hover:bg-slate-50",
                  )}
                >
                  <span className={cn(
                    "h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                    complete ? "bg-emerald-600 text-white" : active ? "bg-custom-blue text-white" : "border border-slate-300 text-slate-500",
                  )}>
                    {complete ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className={cn("text-sm font-semibold", active ? "text-slate-900" : "text-slate-600")}>{x.label}</span>
                  <span className={cn(
                    "text-xs tabular-nums",
                    sm && sm.requiredMissing > 0 ? "text-amber-700 font-semibold" : complete ? "text-emerald-700" : "text-slate-400",
                  )}>
                    {status}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}

      <div className="ml-auto flex items-center gap-2 shrink-0">
        {readiness.refreshing && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        {automation && next && (
          <Button size="sm" variant="outline" className="h-8" onClick={() => onStepChange(next.id, STEP_TAB[next.id])}>
            Next: {next.label} <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700" onClick={onExit} title="Close the application guide">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
