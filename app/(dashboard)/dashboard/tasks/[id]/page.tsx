// @ts-nocheck
"use client"

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { JobWorkspace } from "../job-workspace/JobWorkspace"
import { fetchJobWorkspaceData, type JobWorkspaceData } from "../job-workspace/fetchJobWorkspaceData"

export default function TaskWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [data, setData] = useState<JobWorkspaceData | null>(null)

  const load = useCallback(async () => {
    const result = await fetchJobWorkspaceData(id)
    setData(result)
  }, [id])

  useEffect(() => { load() }, [load])

  if (!data || data.loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-custom-blue" />
          <p className="text-sm text-muted-foreground">Loading job workspace...</p>
        </div>
      </div>
    )
  }

  if (data.error || !data.task) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <p className="text-destructive font-medium">{data.error || "Task not found"}</p>
          <Button variant="outline" onClick={() => router.push("/dashboard/tasks")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Task Manager
          </Button>
        </div>
      </div>
    )
  }

  return <JobWorkspace data={data} onRefresh={load} onBack={() => router.push("/dashboard/tasks")} />
}
