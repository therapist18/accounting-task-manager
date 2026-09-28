"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, History, Loader2, Search, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DateInput } from "@/components/ui/date-input"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addDaysIso, dateFieldToIso, formatDateToDMY, todayIso } from "@/lib/dateUtils"
import { cn } from "@/lib/utils"
import { api, type AccountRow } from "./shared"

// "Sync from date": pull in mail older than the automatic backfill window, for every connected mailbox or
// just the ones picked, optionally only up to an end date (a period). Per mailbox it lists the not-yet-stored
// messages in the period (oldest first),
// then ingests them a few at a time — through the very same ingestion as normal syncs, so classification
// and case opening behave identically and already-stored mail is simply skipped. Up to three mailboxes run
// at once; "Stop" finishes the batch in flight and leaves the rest for another run.

const BATCH = 40 // keep in step with BACKFILL_BATCH in lib/email-center/ingest.ts (the server accepts up to double)
// Each mailbox is a separate Google account with its own Gmail quota, so mailboxes don't compete with
// each other for it — raised from 3 now that a slow mailbox no longer blocks the others as long either
// (ingestBackfillBatch itself now runs several messages at once within each one).
const PARALLEL_MAILBOXES = 5
const LONG_RANGE_DAYS = 90
// Gmail launched in 2004: a start date this early covers a mailbox from its very first email.
const MAILBOX_START = "2004-04-01"

type Status = "pending" | "listing" | "running" | "done" | "error" | "stopped"
interface Progress {
  status: Status
  total: number
  done: number
  ingested: number
  failed: number
  capped?: boolean
  error?: string
}

const PRESETS: Array<{ label: string; iso: () => string }> = [
  { label: "Last 7 days", iso: () => addDaysIso(todayIso(), -7) },
  { label: "Last 30 days", iso: () => addDaysIso(todayIso(), -30) },
  { label: "Last 90 days", iso: () => addDaysIso(todayIso(), -90) },
  { label: "Start of this year", iso: () => `${new Date().getFullYear()}-01-01` },
  { label: "Start of last year", iso: () => `${new Date().getFullYear() - 1}-01-01` },
]

export function SyncDialog({
  open,
  accounts,
  presetIds,
  onClose,
  onFinished,
}: {
  open: boolean
  accounts: AccountRow[]
  // Mailboxes to start with — set when the dialog is opened from one company's row.
  presetIds?: string[]
  onClose: () => void
  // Called once a run ends (even if stopped) so the page can reload what was pulled in.
  onFinished: () => void
}) {
  const eligible = useMemo(() => accounts.filter((a) => a.status === "active"), [accounts])

  const [since, setSince] = useState(formatDateToDMY(addDaysIso(todayIso(), -30)) ?? "")
  // Optional end of the period; empty means "up to now".
  const [until, setUntil] = useState("")
  const [scope, setScope] = useState<"all" | "selected">("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [finished, setFinished] = useState(false)
  const stopRef = useRef(false)

  // Reset every time the dialog opens; a preset (opened from a company row) starts in "selected" mode.
  useEffect(() => {
    if (!open) return
    setProgress({})
    setFinished(false)
    setSearch("")
    if (presetIds?.length) {
      setScope("selected")
      setSelected(new Set(presetIds))
    } else {
      setScope("all")
      setSelected(new Set())
    }
  }, [open, presetIds])

  const sinceIso = dateFieldToIso(since)
  const sinceValid = sinceIso !== "" && sinceIso !== "invalid" && sinceIso <= todayIso()
  const untilIso = until.trim() ? dateFieldToIso(until) : ""
  const untilValid = untilIso === "" || (untilIso !== "invalid" && untilIso <= todayIso() && (!sinceValid || untilIso >= sinceIso))
  // How much mail the period spans: from the start date to the end date (or today).
  const daysBack = sinceValid ? Math.round((Date.parse(untilIso && untilIso !== "invalid" ? untilIso : todayIso()) - Date.parse(sinceIso)) / 86_400_000) : 0

  const targets = scope === "all" ? eligible : eligible.filter((a) => selected.has(a.id))

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return eligible
      .filter((a) => !q || `${a.company_name ?? ""} ${a.email}`.toLowerCase().includes(q))
      .sort((a, b) => (a.company_name ?? "￿").localeCompare(b.company_name ?? "￿") || a.email.localeCompare(b.email))
  }, [eligible, search])

  const patch = (id: string, p: Partial<Progress>) =>
    setProgress((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { status: "pending", total: 0, done: 0, ingested: 0, failed: 0 }), ...p } }))

  async function runMailbox(acc: AccountRow, sinceDate: string, untilDate: string) {
    try {
      patch(acc.id, { status: "listing" })
      const listed = await api<{ ids: string[]; capped: boolean }>("/api/email-center/sync/backfill", {
        method: "POST",
        body: JSON.stringify({ accountId: acc.id, action: "list", since: sinceDate, ...(untilDate ? { until: untilDate } : {}) }),
      })
      let queue = listed.ids
      patch(acc.id, { status: "running", total: queue.length, done: 0, ingested: 0, failed: 0, capped: listed.capped })

      let done = 0, ingested = 0, failed = 0
      while (queue.length) {
        if (stopRef.current) return patch(acc.id, { status: "stopped" })
        const batch = queue.slice(0, BATCH)
        const res = await api<{ ingested: number; skipped: number; failed: number; remaining: string[] }>("/api/email-center/sync/backfill", {
          method: "POST",
          body: JSON.stringify({ accountId: acc.id, action: "ingest", ids: batch }),
        })
        // Anything the server ran out of time for goes back to the front of the queue.
        queue = [...res.remaining, ...queue.slice(batch.length)]
        done += batch.length - res.remaining.length
        ingested += res.ingested
        failed += res.failed
        patch(acc.id, { done, ingested, failed })
      }
      patch(acc.id, { status: "done" })
    } catch (e: any) {
      patch(acc.id, { status: "error", error: e.message })
    }
  }

  const start = async () => {
    if (!sinceValid) return toast.error("Enter a valid start date (DD/MM/YYYY) that isn't in the future.")
    if (!untilValid) return toast.error("The end date must be a valid date (DD/MM/YYYY) on or after the start date, and not in the future.")
    if (!targets.length) return toast.error("Choose at least one connected mailbox.")
    stopRef.current = false
    setFinished(false)
    setRunning(true)
    setProgress(Object.fromEntries(targets.map((a) => [a.id, { status: "pending" as Status, total: 0, done: 0, ingested: 0, failed: 0 }])))

    const queue = [...targets]
    const worker = async () => {
      while (queue.length && !stopRef.current) {
        const acc = queue.shift()!
        await runMailbox(acc, sinceIso, untilIso)
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL_MAILBOXES, queue.length) }, worker))

    setRunning(false)
    setFinished(true)
    const entries = Object.values(progressRef.current)
    const newCount = entries.reduce((n, p) => n + p.ingested, 0)
    toast.success(stopRef.current ? `Stopped — ${newCount} new email(s) so far.` : `Done — ${newCount} new email(s) pulled in.`)
    onFinished()
  }

  // The latest progress for the summary toast (state inside the async loop above would be stale).
  const progressRef = useRef(progress)
  progressRef.current = progress

  const rows = targets.filter((a) => progress[a.id])
  const totals = rows.reduce(
    (t, a) => {
      const p = progress[a.id]
      return { total: t.total + p.total, done: t.done + p.done, ingested: t.ingested + p.ingested, failed: t.failed + p.failed }
    },
    { total: 0, done: 0, ingested: 0, failed: 0 }
  )
  const pct = totals.total ? Math.round((totals.done / totals.total) * 100) : rows.every((a) => progress[a.id].status === "done") && rows.length ? 100 : 0
  const showProgress = rows.length > 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className="max-w-3xl w-[96vw] max-h-[92vh] p-0 gap-0 border border-slate-200 shadow-xl rounded-2xl overflow-hidden bg-white flex flex-col">
        <div className="flex items-center gap-4 border-b border-slate-200 pl-6 pr-14 py-4 shrink-0">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-custom-blue/10 text-custom-blue shrink-0">
            <History className="h-6 w-6" />
          </span>
          <div>
            <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900">Sync from date</DialogTitle>
            <DialogDescription className="text-base text-slate-500 mt-0.5">Pull in older mail from Gmail for a period, for all mailboxes or only the ones you pick.</DialogDescription>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-5 space-y-6">
          {/* Period */}
          <section className="space-y-2.5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-56 space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">From</Label>
                <DateInput value={since} onChange={setSince} disabled={running} className="h-10 text-base rounded-md border-slate-200" />
              </div>
              <div className="w-56 space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">To <span className="text-slate-400 font-normal">— optional, blank = up to now</span></Label>
                <DateInput value={until} onChange={setUntil} disabled={running} className="h-10 text-base rounded-md border-slate-200" />
              </div>
              {until && (
                <Button type="button" variant="ghost" size="sm" disabled={running} onClick={() => setUntil("")} className="h-10 px-3 text-sm text-slate-600">Clear end date</Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={running}
                onClick={() => { setSince(formatDateToDMY(MAILBOX_START) ?? ""); setUntil("") }}
                className="h-9 px-3 rounded-md bg-custom-blue hover:bg-custom-blue/90 text-white text-sm font-semibold gap-1.5"
                title="From the first email ever received up to the latest"
              >
                <History className="h-4 w-4" /> Entire mailbox
              </Button>
              {PRESETS.map((p) => (
                <Button key={p.label} type="button" variant="outline" size="sm" disabled={running} onClick={() => { setSince(formatDateToDMY(p.iso()) ?? ""); setUntil("") }} className="h-9 px-3 rounded-md border-slate-200 text-sm font-medium">
                  {p.label}
                </Button>
              ))}
            </div>
            {since && !sinceValid && <p className="text-sm text-red-600">Enter a valid start date as DD/MM/YYYY (not in the future).</p>}
            {until && !untilValid && <p className="text-sm text-red-600">The end date must be a valid DD/MM/YYYY on or after the start date, and not in the future.</p>}
            {sinceValid && untilValid && daysBack > LONG_RANGE_DAYS && (
              <p className="flex items-start gap-1.5 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                That period spans {daysBack} days. A long range can take a while — keep this page open until it finishes. Mail already stored is skipped, so it's safe to stop and run it again.
              </p>
            )}
          </section>

          {/* Scope */}
          <section className="space-y-3">
            <Label className="text-sm font-medium text-slate-600">Mailboxes</Label>
            <div className="grid sm:grid-cols-2 gap-3">
              {([
                ["all", "All connected mailboxes", `${eligible.length} mailbox${eligible.length === 1 ? "" : "es"}`],
                ["selected", "Selected mailboxes only", scope === "selected" ? `${targets.length} selected` : "Choose from the list"],
              ] as const).map(([value, title, sub]) => (
                <button
                  key={value}
                  type="button"
                  disabled={running}
                  onClick={() => setScope(value)}
                  className={cn(
                    "text-left rounded-xl border px-4 py-3 transition-colors",
                    scope === value ? "border-custom-blue bg-blue-50/60 ring-1 ring-custom-blue" : "border-slate-200 bg-white hover:bg-slate-50"
                  )}
                >
                  <p className="text-base font-semibold text-slate-900">{title}</p>
                  <p className="text-sm text-slate-500">{sub}</p>
                </button>
              ))}
            </div>

            {scope === "selected" && (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 p-2.5">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company or mailbox…" className="h-9 pl-10 text-base bg-white border-slate-200 rounded-md" disabled={running} />
                  </div>
                  <Button type="button" variant="ghost" size="sm" disabled={running} onClick={() => setSelected((prev) => new Set([...prev, ...shown.map((a) => a.id)]))} className="h-9 px-3 text-sm">Select shown</Button>
                  <Button type="button" variant="ghost" size="sm" disabled={running} onClick={() => setSelected(new Set())} className="h-9 px-3 text-sm">Clear</Button>
                </div>
                <div className="max-h-60 overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                  {shown.map((a) => (
                    <label key={a.id} className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-slate-50">
                      <Checkbox
                        checked={selected.has(a.id)}
                        disabled={running}
                        onCheckedChange={(v) => setSelected((prev) => { const next = new Set(prev); if (v === true) next.add(a.id); else next.delete(a.id); return next })}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-medium text-slate-900 truncate">{a.company_name ?? <span className="text-red-500 font-normal">Not linked to a company</span>}</span>
                        <span className="block text-sm text-slate-500 truncate">{a.email}</span>
                      </span>
                    </label>
                  ))}
                  {shown.length === 0 && <p className="py-8 text-center text-base text-slate-400">No connected mailboxes match.</p>}
                </div>
              </div>
            )}
          </section>

          {/* Progress */}
          {showProgress && (
            <section className="space-y-3">
              <div className="flex items-center justify-between text-base">
                <span className="font-semibold text-slate-800">
                  {running ? "Syncing…" : finished ? "Finished" : "Progress"}
                </span>
                <span className="text-slate-500 tabular-nums">
                  {totals.done} of {totals.total} messages · {totals.ingested} new{totals.failed ? ` · ${totals.failed} failed` : ""}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-custom-blue transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-56 overflow-y-auto custom-scrollbar">
                {rows.map((a) => {
                  const p = progress[a.id]
                  return (
                    <div key={a.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className="w-5 shrink-0">
                        {p.status === "done" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          : p.status === "error" ? <XCircle className="h-5 w-5 text-red-500" />
                          : p.status === "pending" || p.status === "stopped" ? <span className="block h-2.5 w-2.5 rounded-full bg-slate-300 mx-auto" />
                          : <Loader2 className="h-5 w-5 animate-spin text-custom-blue" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-medium text-slate-900 truncate">{a.company_name ?? a.email}</span>
                        <span className="block text-sm text-slate-500 truncate">
                          {p.status === "pending" && "Waiting…"}
                          {p.status === "listing" && "Finding messages…"}
                          {p.status === "stopped" && `Stopped at ${p.done} of ${p.total}`}
                          {p.status === "error" && <span className="text-red-600">{p.error}</span>}
                          {(p.status === "running" || p.status === "done") &&
                            (p.total === 0 ? "Nothing new in that period" : `${p.done} of ${p.total} · ${p.ingested} new${p.failed ? ` · ${p.failed} failed` : ""}`)}
                          {p.capped && " · very large period — only the newest 30,000 messages were listed; run again with an earlier end date for the rest"}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        <div className="border-t border-slate-200 bg-white px-6 py-3.5 shrink-0 flex items-center justify-end gap-2.5">
          {running ? (
            <Button variant="outline" size="sm" onClick={() => { stopRef.current = true }} className="h-11 px-5 text-base font-medium rounded-lg border-slate-300">
              Stop after this batch
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} className="h-11 px-5 text-base font-medium text-slate-600 hover:text-slate-900 rounded-lg">{finished ? "Close" : "Cancel"}</Button>
              <Button size="sm" onClick={start} disabled={!sinceValid || !untilValid || targets.length === 0} className="h-11 px-6 text-base font-semibold bg-custom-blue hover:bg-custom-blue/90 text-white rounded-lg shadow-xs gap-2">
                <History className="w-5 h-5" /> {finished ? "Sync again" : `Sync ${targets.length} mailbox${targets.length === 1 ? "" : "es"}`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
