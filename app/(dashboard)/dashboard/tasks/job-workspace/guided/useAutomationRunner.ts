// @ts-nocheck
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { deriveAutomationType, cleanFormData, startAutomationRun, fetchAutomationProgress, stopAutomationRun, saveEvidenceScreenshot } from "../automationShared"

export interface RunState {
  jobId: string | null
  status: string
  progress: number
  currentStep: string
  message: string
  logs: { level?: string; message: string; timestamp?: string }[]
  error?: string | null
  needsReview?: boolean
  evidenceSaved?: number
}

const ACTIVE = ["pending", "claiming", "running"]
const POLL_MS = 2000

export function useAutomationRunner({ automation, task, automationJobs, actorId, onFinished }: {
  automation: any | null
  task: any
  automationJobs?: any[] | null
  actorId?: string | null
  onFinished?: () => void
}) {
  const [run, setRun] = useState<RunState | null>(null)
  const [starting, setStarting] = useState(false)
  const timer = useRef<any>(null)
  const finishedRef = useRef(onFinished)
  finishedRef.current = onFinished

  const stopPolling = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const handleCompleted = useCallback(async (job: any) => {
    const directorId = String(task?.individual_id || task?.applicant_details?.id || "")
    const screenshots = (job.evidence || []).filter((e: any) => e.type === "screenshot")
    let saved = 0
    if (directorId) {
      for (const shot of screenshots) {
        try {
          const blob = await (await fetch(shot.url)).blob()
          await saveEvidenceScreenshot(blob, directorId, task?.id, actorId)
          saved++
        } catch (err) {
          console.error("[guided] Failed to save evidence screenshot", err)
        }
      }
    }
    const needsReview = job.result?.status === "needs_review"
    setRun(prev => prev ? { ...prev, needsReview, evidenceSaved: saved } : prev)
    if (needsReview) toast.warning(job.result?.message || "The form was filled but needs a manual check before submitting.")
    else toast.success(saved > 0 ? "Application submitted - confirmation screenshot saved." : "Automation completed.")
    finishedRef.current?.()
  }, [task, actorId])

  const poll = useCallback(async (jobId: string) => {
    try {
      const { ok, status, job, error } = await fetchAutomationProgress(jobId)
      if (!ok || !job) {
        if (status === 503 || status === 404) {
          stopPolling()
          setRun(prev => prev ? {
            ...prev, status: "failed",
            error: status === 503 ? (error || "The automation service isn't running. Restart the desktop app and try again.") : "This run is no longer tracked by the automation service.",
          } : prev)
        }
        return
      }
      setRun(prev => ({
        jobId,
        status: job.status,
        progress: job.progress || 0,
        currentStep: job.currentStep || "",
        message: job.message || "",
        logs: job.logs?.length ? job.logs : (prev?.logs || []),
        error: job.error || null,
        needsReview: prev?.needsReview,
        evidenceSaved: prev?.evidenceSaved,
      }))
      if (job.status === "completed") {
        stopPolling()
        await handleCompleted(job)
      } else if (["failed", "cancelled", "interrupted"].includes(job.status)) {
        stopPolling()
      }
    } catch (err) {
      // Transient network blip - the next tick retries.
      console.error("[guided] progress poll failed", err)
    }
  }, [stopPolling, handleCompleted])

  const beginPolling = useCallback((jobId: string) => {
    stopPolling()
    timer.current = setInterval(() => poll(jobId), POLL_MS)
    poll(jobId)
  }, [poll, stopPolling])

  // Last recorded run for this automation, and resume a run that is still in flight
  // (e.g. the page was refreshed mid-run) instead of looking like nothing started.
  const lastRun = (automationJobs || []).find((j: any) => automation && String(j.automation_id) === String(automation.id)) || null
  useEffect(() => {
    if (!lastRun || run) return
    if (ACTIVE.includes(lastRun.status) && lastRun.job_id) {
      setRun({ jobId: lastRun.job_id, status: lastRun.status, progress: lastRun.progress || 0, currentStep: lastRun.current_step || "", message: "Resuming…", logs: [] })
      beginPolling(lastRun.job_id)
    }
  }, [lastRun?.id, lastRun?.status])

  const start = useCallback(async (formData: Record<string, any>) => {
    if (!automation) return
    setStarting(true)
    setRun({ jobId: null, status: "pending", progress: 0, currentStep: "Preparing", message: "Collecting form data…", logs: [] })
    try {
      const started = await startAutomationRun({
        type: deriveAutomationType(automation),
        taskId: task?.id ?? null,
        automationId: automation.id,
        taskLabel: task?.applicant_name || task?.r_number || automation?.name || null,
        formData: cleanFormData(formData),
      })
      setRun({ jobId: started.jobId, status: "running", progress: 0, currentStep: "Starting", message: "Launching browser…", logs: [] })
      beginPolling(started.jobId)
    } catch (err: any) {
      setRun({ jobId: null, status: "failed", progress: 0, currentStep: "", message: "", logs: [], error: err?.message || "Could not start the automation." })
    } finally {
      setStarting(false)
    }
  }, [automation, task, beginPolling])

  const stop = useCallback(async () => {
    if (!run?.jobId) return
    try {
      await stopAutomationRun(run.jobId)
      stopPolling()
      setRun(prev => prev ? { ...prev, status: "cancelled", message: "Stopped by user" } : prev)
    } catch (err: any) {
      toast.error(`Could not stop automation: ${err.message}`)
    }
  }, [run?.jobId, stopPolling])

  const reset = useCallback(() => { stopPolling(); setRun(null) }, [stopPolling])

  const isActive = !!run && (starting || ACTIVE.includes(run.status))
  return { run, lastRun, starting, isActive, start, stop, reset }
}
