"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  Ban,
  Bot,
  CheckCircle2,
  Clock,
  MonitorSmartphone,
  Play,
  RefreshCw,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/lib/hooks/use-toast"
import { useCurrentUser, hasPermission } from "@/lib/hooks/use-current-user"
import { automationFetch } from "@/lib/automations/client"

type JobStatus = "running" | "completed" | "failed" | "cancelled" | "interrupted"

type JobLog = { timestamp: string; level: string; step: string | null; message: string }

type LiveJob = {
  jobId: string
  type: string
  label: string
  status: JobStatus
  progress: number
  currentStep: string
  message: string
  error: string | null
  isRunning: boolean
  logs: JobLog[]
  startedAt: string
  finishedAt: string | null
}

type RunRecord = {
  id: string
  automation_type: string
  task_id: string | null
  task_label: string | null
  status: JobStatus
  progress: number | null
  current_step: string | null
  error: string | null
  created_at: string
  completed_at: string | null
}

const STATUS_META: Record<JobStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  running: { label: "Running", variant: "default" },
  completed: { label: "Completed", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
  cancelled: { label: "Stopped", variant: "outline" },
  interrupted: { label: "Interrupted", variant: "outline" },
}

const POLL_INTERVAL_MS = 2000

function formatTime(value: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString()
}

function formatDuration(startedAt: string, finishedAt: string | null) {
  const start = new Date(startedAt).getTime()
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

export default function AutomationsPage() {
  const { toast } = useToast()
  const { user, loading: userLoading } = useCurrentUser()
  const canRun = hasPermission(user, "automations.run")

  const [job, setJob] = useState<LiveJob | null>(null)
  const [history, setHistory] = useState<RunRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [serviceDown, setServiceDown] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)

  const logEndRef = useRef<HTMLDivElement | null>(null)
  const isRunning = job?.isRunning ?? false

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/automations/runs", { cache: "no-store" })
      const payload = await response.json().catch(() => null)
      if (response.ok && payload?.success) {
        setHistory(payload.runs as RunRecord[])
        setServiceDown(null)
      }
    } catch {
      // A history fetch failure is not worth a toast - it retries on the next poll.
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // Live progress. Polls only while a run is in flight; once it settles, the
  // durable record in tm_automation_runs is the source of truth and the poll
  // stops.
  useEffect(() => {
    if (!job?.jobId) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const response = await automationFetch(`/api/automations/progress?jobId=${encodeURIComponent(job.jobId)}`, {
          cache: "no-store",
        })
        const payload = await response.json().catch(() => null)

        if (cancelled) return

        if (!response.ok) {
          // A 503 means the automation service is gone, which will not fix
          // itself by retrying.
          if (response.status === 503) {
            setServiceDown(payload?.error || "The automation service is not running.")
            setJob((prev) => (prev ? { ...prev, isRunning: false, status: "failed" } : prev))
            return
          }
          throw new Error(payload?.error || `Progress request failed (${response.status})`)
        }

        setJob((prev) => (prev ? { ...prev, ...payload.job } : prev))
        if (payload.job?.isRunning) {
          timer = setTimeout(poll, POLL_INTERVAL_MS)
        } else {
          loadHistory()
        }
      } catch (error: any) {
        if (cancelled) return
        // Transient failures are common while the service restarts; keep trying
        // a bounded number of times before surfacing it.
        setJob((prev) => (prev ? { ...prev, message: `Reconnecting… ${error.message}` } : prev))
        timer = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    timer = setTimeout(poll, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [job?.jobId, job?.isRunning, loadHistory])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [job?.logs?.length])

  // Tell the desktop shell who is signed in so it can sweep this user's stale
  // runs if the app is force-closed mid-automation.
  useEffect(() => {
    const id = user?.id ? String(user.id) : null;
    if (id) window.desktop?.setUser?.(id);
  }, [user?.id])

  // The shell pushes a terminal event when a run finishes, which is what makes
  // the notification appear even if this tab was not the one that started it.
  useEffect(() => {
    return window.desktop?.onAutomationEvent?.((event: any) => {
      if (
        event?.type === "job:finished" ||
        event?.type === "job:failed" ||
        event?.type === "job:cancelled"
      ) {
        loadHistory()
        setJob((prev) => {
          if (!prev || prev.jobId !== event.jobId) return prev
          return {
            ...prev,
            isRunning: false,
            status:
              event.type === "job:finished"
                ? "completed"
                : event.type === "job:cancelled"
                  ? "cancelled"
                  : "failed",
            error: event.error ?? null,
          }
        })
      }
    })
  }, [loadHistory])

  // Note: this page deliberately has no "start a run" button.
  //
  // eTA Kenya is a real government application that ends in a payment step, and
  // it needs a full payload assembled from a task (applicant details, document
  // URLs, the resolved form field mapping). An earlier version of this page
  // posted `formData: {}`, which would drive a headed browser through a real
  // application and a real charge with no applicant data at all. Runs are
  // started from a task's Automation tab instead; this page monitors them.

  const stopRun = useCallback(async () => {
    if (!job?.jobId) return
    setStopping(true)
    try {
      await automationFetch("/api/automations/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.jobId }),
      })
    } catch (error: any) {
      toast({ title: "Could not stop automation", description: error.message, variant: "destructive" })
    } finally {
      setStopping(false)
    }
  }, [job?.jobId, toast])

  const hasHistory = useMemo(() => history.length > 0, [history])

  return (
    <div className="p-6 h-full overflow-y-auto bg-[#FAFAFC]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-custom-blue flex items-center justify-center">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Automations</h1>
            <p className="text-sm text-slate-500">
              Browser automations run on this machine. You can close the window — a desktop notification
              arrives when a run finishes.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadHistory} disabled={loadingHistory}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loadingHistory ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {serviceDown && (
        <Card className="mb-6 border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-destructive">Automation service unavailable</p>
              <p className="text-sm text-muted-foreground mt-1">{serviceDown}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Play className="h-4 w-4" />
              Available automations
            </CardTitle>
            <CardDescription>Each opens a real browser window on this machine.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">eTA Kenya</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Files a Kenya eTA application end to end, including uploads and the payment step.
                  </p>
                </div>
                {isRunning ? (
                  <Badge>Running</Badge>
                ) : (
                  <Badge variant="outline">Ready</Badge>
                )}
              </div>

              {!canRun && !userLoading ? (
                <p className="text-xs text-muted-foreground">
                  Your role can view automations but not run them.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Runs start from a task, where the applicant details and documents are filled in for
                  you.
                </p>
              )}

              <div className="flex gap-2">
                <Button size="sm" asChild variant={canRun ? "default" : "outline"}>
                  <Link href="/dashboard/tasks">
                    <Play className="h-4 w-4 mr-2" />
                    Go to tasks
                  </Link>
                </Button>
                {isRunning && (
                  <Button size="sm" variant="outline" onClick={stopRun} disabled={stopping}>
                    <Ban className="h-4 w-4 mr-2" />
                    {stopping ? "Stopping…" : "Stop"}
                  </Button>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground flex items-start gap-2">
              <MonitorSmartphone className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              The browser window is parked off-screen so it does not steal focus, but the run is genuinely
              headful.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Current run</CardTitle>
            <CardDescription>
              {job ? job.label : "No automation has run in this session yet."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!job ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Start an automation to see live progress here.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={STATUS_META[job.status]?.variant ?? "outline"}>
                    {STATUS_META[job.status]?.label ?? job.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(job.startedAt, job.finishedAt)}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{job.currentStep || "Working"}</span>
                    <span className="tabular-nums text-muted-foreground">{job.progress}%</span>
                  </div>
                  <Progress value={job.progress} className="h-2" />
                  {job.message && (
                    <p className="text-xs text-muted-foreground">{job.message}</p>
                  )}
                </div>

                {job.error && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/5 p-3">
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-sm text-destructive">{job.error}</p>
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium mb-2">Console</p>
                  <ScrollArea className="h-64 rounded-md border bg-slate-950">
                    <div className="p-3 font-mono text-xs space-y-0.5">
                      {job.logs.length === 0 ? (
                        <p className="text-slate-500">Waiting for output…</p>
                      ) : (
                        job.logs.map((entry, index) => (
                          <p
                            key={`${entry.timestamp}-${index}`}
                            className={
                              entry.level === "error"
                                ? "text-red-400"
                                : entry.level === "warn"
                                  ? "text-amber-400"
                                  : "text-slate-300"
                            }
                          >
                            {entry.message}
                          </p>
                        ))
                      )}
                      <div ref={logEndRef} />
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Run history</CardTitle>
          <CardDescription>Persisted, so it survives restarting the app.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : !hasHistory ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No runs recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Automation</th>
                    <th className="py-2 pr-4 font-medium">Task</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Started</th>
                    <th className="py-2 pr-4 font-medium">Duration</th>
                    <th className="py-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((run) => (
                    <tr key={run.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4">{run.automation_type}</td>
                      <td className="py-2.5 pr-4">
                        {run.task_id ? (
                          <Link
                            href={`/dashboard/tasks/${run.task_id}`}
                            className="text-custom-blue hover:underline"
                          >
                            {run.task_label || run.task_id}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={STATUS_META[run.status]?.variant ?? "outline"}>
                          {run.status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                          {STATUS_META[run.status]?.label ?? run.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{formatTime(run.created_at)}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">
                        {formatDuration(run.created_at, run.completed_at)}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {run.error || run.current_step || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
