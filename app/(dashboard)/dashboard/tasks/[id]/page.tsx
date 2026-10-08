// @ts-nocheck
"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { JobWorkspace } from "../job-workspace/JobWorkspace"
import { fetchJobWorkspaceData, type JobWorkspaceData } from "../job-workspace/fetchJobWorkspaceData"

// Last loaded workspace per task for this browser session. Re-opening a task (back
// from the task list, or guided mode -> tasks -> guided mode) renders this
// immediately while a fresh copy loads in the background, instead of a spinner.
const workspaceCache = new Map<string, JobWorkspaceData>()

export default function TaskWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const tab = searchParams.get("tab") || undefined
  const automationId = searchParams.get("automationId") || undefined
  const requirementId = searchParams.get("requirementId") || undefined
  const openSendDialog = searchParams.get("openSendDialog") || undefined
  const documentId = searchParams.get("documentId") || undefined
  const mode = searchParams.get("mode") || undefined
  const router = useRouter()
  const [data, setData] = useState<JobWorkspaceData | null>(() => workspaceCache.get(id) || null)

  const load = useCallback(async () => {
    const result = await fetchJobWorkspaceData(id)
    // A failed background refresh keeps the cached copy on screen rather than
    // replacing a working workspace with an error page.
    if (result.error && workspaceCache.has(id)) {
      console.error('[TaskWorkspacePage] refresh failed, keeping cached data:', result.error)
      return
    }
    if (!result.error) workspaceCache.set(id, result)
    setData(result)
  }, [id])

  useEffect(() => { load() }, [load])

  if (!data || data.loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-custom-blue" />
          <p className="text-sm text-muted-foreground">{mode === "guided" ? "Preparing application..." : "Loading job workspace..."}</p>
        </div>
      </div>
    )
  }

  if (data.error || !data.task) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <p className="text-destructive font-medium">{data.error || "Task not found"}</p>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Task Manager
          </Button>
        </div>
      </div>
    )
  }

  return <JobWorkspace data={data} onRefresh={load} onBack={() => router.back()} initialTab={tab} initialAutomationId={automationId} initialRequirementId={requirementId} initialOpenSendDialog={openSendDialog === '1'} initialTemplateDocId={documentId} initialMode={mode} />
}
