"use client"

// Manual "Link to task" for an EFNS notification / payment invoice. Lists candidate tasks (matched
// by R-number first, then applicant name), lets the operator pick a task and a stage from that
// task's department, then files the item's PDF onto the task against the task's individual. This is
// the human fallback for items the auto-filing job marks no_match / ambiguous — same server
// filing code, explicitly user-chosen task (`matched_by: 'manual'`).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Inbox, Loader2, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { ImmigrationItem } from "@/lib/immigrationNotifications"
import { EFNS_FILING_LABELS } from "@/lib/efnsFiling"
import { KIND_BADGE, KIND_LABEL } from "./statusStyles"

interface CandidateTask {
  id: number
  applicant_name: string | null
  r_number: string | null
  company_name: string | null
  individual_id: number | null
  department_id: number | null
  status: string
  is_terminal?: boolean
}

interface TaskStage {
  stageId: string
  stageName: string
  orderNum: number
  documents: Array<{ kycId: string; name: string; isRequired?: boolean }>
}

const fetchJson = async (url: string) => {
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok || json?.success === false) throw new Error(json?.error || "Request failed")
  return json
}

export function LinkEfnsItemDialog({
  item,
  onOpenChange,
  onLinked,
}: {
  item: ImmigrationItem | null
  onOpenChange: (open: boolean) => void
  onLinked: () => void
}) {
  const [suggestions, setSuggestions] = useState<CandidateTask[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [search, setSearch] = useState("")
  const [submittedSearch, setSubmittedSearch] = useState("")
  const [selectedTask, setSelectedTask] = useState<CandidateTask | null>(null)
  const [stages, setStages] = useState<TaskStage[]>([])
  const [loadingStages, setLoadingStages] = useState(false)
  const [selectedStageId, setSelectedStageId] = useState<string>("")
  const [selectedKycId, setSelectedKycId] = useState<string>("")
  const [filing, setFiling] = useState(false)
  const openedForRef = useRef<string>("")

  const open = !!item
  const key = item ? `${item.kind}-${item.id}` : ""

  // Load suggestions whenever a different item is opened.
  useEffect(() => {
    if (!open || !item) return
    if (openedForRef.current === key) return
    openedForRef.current = key
    setSearch(item.printableApplicant || item.name || "")
    setSubmittedSearch(item.printableApplicant || item.name || "")
    setSelectedTask(null)
    setStages([])
    setSelectedStageId("")
    setSelectedKycId("")
    void loadSuggestions(item, "")
  }, [open, item, key])

  const loadSuggestions = useCallback(async (target: ImmigrationItem, query: string) => {
    setLoadingSuggestions(true)
    try {
      const params = new URLSearchParams({
        kind: target.kind,
        id: String(target.id),
      })
      if (query.trim()) params.set("q", query.trim())
      const json = await fetchJson(`/api/immigration-notifications/file?${params}`)
      setSuggestions(json.suggestions || [])
    } catch (e: any) {
      toast.error(e?.message || "Failed to load matching tasks")
      setSuggestions([])
    } finally {
      setLoadingSuggestions(false)
    }
  }, [])

  const handleSearch = useCallback(() => {
    if (!item) return
    setSubmittedSearch(search.trim())
    void loadSuggestions(item, search)
  }, [item, search, loadSuggestions])

  const selectTask = useCallback(async (task: CandidateTask) => {
    setSelectedTask(task)
    setStages([])
    setSelectedStageId("")
    setSelectedKycId("")
    setLoadingStages(true)
    try {
      const json = await fetchJson(`/api/immigration-notifications/file?taskId=${task.id}`)
      const list: TaskStage[] = json.stages || []
      setStages(list)
      if (list.length === 1 && list[0].documents[0]?.kycId) {
        setSelectedStageId(list[0].stageId)
        setSelectedKycId(list[0].documents[0].kycId)
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to load the task's stages")
      setStages([])
    } finally {
      setLoadingStages(false)
    }
  }, [])

  const selectStage = useCallback((stageId: string) => {
    setSelectedStageId(stageId)
    const stage = stages.find((s) => s.stageId === stageId)
    setSelectedKycId(stage?.documents[0]?.kycId || "")
  }, [stages])

  const selectedStage = useMemo(() => stages.find((s) => s.stageId === selectedStageId), [stages, selectedStageId])

  const handleFile = useCallback(async () => {
    if (!item || !selectedTask) return
    if (!selectedStageId || !selectedKycId) {
      toast.error("Pick a stage (and its document) to file to")
      return
    }
    setFiling(true)
    try {
      const res = await fetch("/api/immigration-notifications/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: item.kind,
          id: item.id,
          taskId: selectedTask.id,
          stageId: selectedStageId,
          kycId: selectedKycId,
        }),
      })
      const json = await res.json()
      if (!res.ok || json?.success === false) throw new Error(json?.error || "Filing failed")
      toast.success(`Filed to ${selectedTask.applicant_name || `task #${selectedTask.id}`}`)
      onLinked()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || "Filing failed")
    } finally {
      setFiling(false)
    }
  }, [item, selectedTask, selectedStageId, selectedKycId, onLinked, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="p-4 border-b bg-white shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Inbox className="h-5 w-5 text-emerald-600" />
            <span className="truncate">Link record to a task</span>
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", KIND_BADGE[item?.kind ?? "notification"])}>
              {item ? KIND_LABEL[item.kind] : ""}
            </span>
          </DialogTitle>
          {item && (
            <p className="text-sm text-slate-500 mt-1">
              {item.name}
              {item.fileNumber ? <span className="ml-2 font-medium text-slate-600">R-N: {item.fileNumber}</span> : null}
              {item.filingStatus ? (
                <span className="ml-2">· {EFNS_FILING_LABELS[item.filingStatus]}</span>
              ) : null}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto p-4 space-y-5">
          {/* Step 1 — pick the task */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-800">1 · Task</h3>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search by R-number or applicant name…"
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleSearch} disabled={loadingSuggestions}>
                {loadingSuggestions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </Button>
              {search !== submittedSearch && (
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setSearch(submittedSearch); if (item) void loadSuggestions(item, submittedSearch); }} title="Reset search">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {loadingSuggestions ? (
              <div className="flex items-center justify-center py-8 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Searching matching tasks…
              </div>
            ) : suggestions.length === 0 ? (
              <div className="text-sm text-slate-400 italic py-4">
                No matching tasks found{submittedSearch ? ` for "${submittedSearch}"` : ""}. Try a different R-number or name.
              </div>
            ) : (
              <div className="border rounded-lg divide-y max-h-56 overflow-auto">
                <RadioGroup value={selectedTask ? String(selectedTask.id) : ""} onValueChange={(v) => selectTask(suggestions.find((s) => String(s.id) === v)!) }>
                  {suggestions.map((t) => (
                    <div key={t.id} className={cn("flex items-center gap-3 px-3 py-2 hover:bg-slate-50 transition-colors", selectedTask?.id === t.id && "bg-blue-50/60")}>
                      <RadioGroupItem id={`task-${t.id}`} value={String(t.id)} />
                      <Label htmlFor={`task-${t.id}`} className="flex-1 cursor-pointer min-w-0">
                        <span className="block font-medium text-slate-800 truncate">{t.applicant_name || "Unnamed applicant"}</span>
                        <span className="block text-xs text-slate-500 truncate">
                          #{t.id}
                          {t.r_number ? ` · R-N ${t.r_number}` : ""}
                          {t.company_name ? ` · ${t.company_name}` : ""}
                        </span>
                      </Label>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] shrink-0", t.is_terminal && "border-amber-300 bg-amber-50 text-amber-700")}
                      >
                        {t.is_terminal ? `completed · ${t.status}` : t.status}
                      </Badge>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            )}
          </section>

          {/* Step 2 — pick the stage + document */}
          {selectedTask && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">
                2 · Stage to file to{" "}
                <span className="font-normal text-slate-400">({selectedTask.applicant_name || `task #${selectedTask.id}`})</span>
              </h3>

              {loadingStages ? (
                <div className="flex items-center justify-center py-6 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading the task's stages…
                </div>
              ) : stages.length === 0 ? (
                <div className="text-sm text-slate-400 italic py-4">This task's department has no stages with configured documents.</div>
              ) : (
                <div className="border rounded-lg divide-y max-h-64 overflow-auto">
                  <RadioGroup value={selectedStageId} onValueChange={selectStage} className="gap-0">
                    {stages.map((s) => (
                      <div key={s.stageId} className={cn("px-3 py-2 hover:bg-slate-50 transition-colors", selectedStageId === s.stageId && "bg-blue-50/60")}>
                        <div className="flex items-center gap-3">
                          <RadioGroupItem id={`stage-${s.stageId}`} value={s.stageId} />
                          <Label htmlFor={`stage-${s.stageId}`} className="flex-1 cursor-pointer">
                            <span className="block font-medium text-slate-800 text-sm">{s.stageName}</span>
                            <span className="block text-xs text-slate-500">
                              {s.documents.map((d) => d.name).join(", ") || "No documents"}
                            </span>
                          </Label>
                        </div>

                        {selectedStageId === s.stageId && s.documents.length > 1 && (
                          <div className="flex flex-wrap gap-1.5 mt-2 pl-7">
                            {s.documents.map((d) => (
                              <button
                                key={d.kycId}
                                type="button"
                                onClick={() => setSelectedKycId(d.kycId)}
                                className={cn(
                                  "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                                  selectedKycId === d.kycId
                                    ? "border-emerald-600 bg-emerald-600 text-white"
                                    : "border-slate-300 bg-white text-slate-600 hover:border-emerald-400",
                                )}
                              >
                                {d.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              )}
            </section>
          )}

          {selectedStage && (
            <p className="text-xs text-slate-500 -mt-2">
              The PDF will be filed against the task's individual ({selectedTask?.individual_id ? `#${selectedTask.individual_id}` : "unknown"}) as the{" "}
              <span className="font-medium">{selectedStage.documents.find((d) => d.kycId === selectedKycId)?.name || "selected"}</span> document on{" "}
              <span className="font-medium">{selectedStage.stageName}</span>, and the stage will be marked complete.
            </p>
          )}
        </div>

        <div className="border-t p-4 bg-white shrink-0 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={filing}>
            Cancel
          </Button>
          <Button
            onClick={handleFile}
            disabled={filing || !selectedTask || !selectedStageId || !selectedKycId}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {filing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            File to task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}