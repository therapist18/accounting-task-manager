"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Download, Loader2, Play, RefreshCcw, RotateCcw, Search, Trash2, X, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { fetchImmigrationItems, sortPermitGroups, sortStatuses, type ImmigrationItem } from "@/lib/immigrationNotifications"
import { COUNT_BADGE_CLASS, PILL_BUTTON_CLASS, TAB_LIST_CLASS, TAB_TRIGGER_CLASS, fmtDateTime } from "../emails/components/shared"
import { ColumnVisibilityButton, useColumnVisibility } from "../emails/components/table"
import { ITEM_COLUMNS, ITEM_VALUE, NotificationsTable } from "./components/NotificationsTable"
import { exportItemsToExcel } from "./components/exportNotifications"
import { STATUS_TAB, STATUS_TAB_FALLBACK } from "./components/statusStyles"
import { LinkEfnsItemDialog } from "./components/LinkEfnsItemDialog"
import { DeleteEfnsItemDialog } from "./components/DeleteEfnsItemDialog"
import type { FieldPreview } from "./components/DocumentPreviewDialog"

interface SyncRequest {
  id: number
  status: "pending" | "running" | "done" | "error"
  targets: unknown[]
  created_at: string
  finished_at: string | null
  result: { recaptured: number; missing: number } | null
  error: string | null
}

// Immigration Notifications: everything the EFNS immigration automation has recorded — both the
// notification updates (approved / issued / invoice / upload required …) and the payment invoices
// (paid / not paid) — in one list.
//
// Grouped the way the automation's WhatsApp summary groups a run: first by permit type
// (PERMIT / SPECIAL PASS / DEPENDANT PASS …), then by status (APPROVED / ISSUED / INVOICE …).
// Laid out like the KRA Email Center and Immigration Alerts (identity + actions row, permit-type
// tabs + search row, status tabs + the shared table toolkit), so it reads as part of the same app.
//
// Read-only: this renders the two tables the automation writes (immigration_notifications and
// immigration_payments). Everything is fetched once; tabs, search and the column filters only
// re-slice what's in memory.

const ALL = "all"

const matchesSearch = (i: ImmigrationItem, q: string) =>
  !q || ITEM_COLUMNS.some((c) => ITEM_VALUE[c.id](i).toLowerCase().includes(q))

const STATUS_TAB_BASE_CLASS =
  "group h-10 px-4 text-sm font-medium rounded-md border transition-all data-[state=active]:shadow-sm data-[state=active]:font-semibold"

export default function ImmigrationNotificationsPage() {
  const [items, setItems] = useState<ImmigrationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [permit, setPermit] = useState<string>(ALL)
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [search, setSearch] = useState("")
  const [exportRows, setExportRows] = useState<ImmigrationItem[]>([])
  const [exporting, setExporting] = useState(false)
  const [running, setRunning] = useState(false)
  // The item keys ticked in the table for a targeted "Run filing" (empty = file everything pending).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [linkItem, setLinkItem] = useState<ImmigrationItem | null>(null)
  // The record(s) queued for the delete dialog: one row's trash button, or the whole selection.
  const [deleteItems, setDeleteItems] = useState<ImmigrationItem[]>([])
  // Every row's document-type fields, loaded with the list so the preview opens with them.
  const [fieldPreviews, setFieldPreviews] = useState<Record<string, FieldPreview>>({})
  // The latest requested sync (re-capture of deleted records by the EFNS automation).
  const [syncRequest, setSyncRequest] = useState<SyncRequest | null>(null)
  const columns = useColumnVisibility(ITEM_COLUMNS.map(({ id, label }) => ({ id, label })))

  const loadFieldPreviews = useCallback(async () => {
    try {
      const res = await fetch("/api/immigration-notifications/fields")
      const json = await res.json()
      if (!res.ok || !json.success) return
      const types = (json.types || {}) as Record<string, { name: string | null; fields: FieldPreview["fields"] }>
      const map: Record<string, FieldPreview> = {}
      for (const [key, p] of Object.entries(json.items || {}) as Array<[string, any]>) {
        const type = p.kycId ? types[p.kycId] : null
        map[key] = { ...p, docTypeName: type?.name ?? null, fields: type?.fields ?? [] }
      }
      setFieldPreviews(map)
    } catch {
      // The preview falls back to the row's own details.
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list] = await Promise.all([fetchImmigrationItems(), loadFieldPreviews()])
      setItems(list)
    } catch (e: any) {
      toast.error(e?.message || "Failed to load immigration notifications")
    } finally {
      setLoading(false)
    }
  }, [loadFieldPreviews])

  useEffect(() => {
    load()
  }, [load])

  const loadSyncRequest = useCallback(async () => {
    try {
      const res = await fetch("/api/immigration-notifications/resync")
      const json = await res.json()
      return ((json.requests || [])[0] as SyncRequest | undefined) ?? null
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    loadSyncRequest().then(setSyncRequest)
  }, [loadSyncRequest])

  // While a re-capture is queued or running, check on it every 10s; reload the list when it lands.
  const syncActive = syncRequest?.status === "pending" || syncRequest?.status === "running"
  useEffect(() => {
    if (!syncActive) return
    const timer = setInterval(async () => {
      const latest = await loadSyncRequest()
      if (!latest) return
      setSyncRequest((prev) => {
        if (prev && prev.id === latest.id && prev.status !== latest.status && (latest.status === "done" || latest.status === "error")) {
          if (latest.status === "done") {
            toast.success(`Re-capture finished: ${latest.result?.recaptured ?? 0} back, ${latest.result?.missing ?? 0} not found on the portal`)
          } else {
            toast.error(`Re-capture failed: ${latest.error || "unknown error"}`)
          }
          // File what came back straight away (the EFNS automation also triggers this when it is
          // configured to; running it twice is harmless — filed items are skipped).
          void fetch("/api/immigration-notifications/file-job", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })
            .catch(() => {})
            .finally(() => void load())
        }
        return latest
      })
    }, 10000)
    return () => clearInterval(timer)
  }, [syncActive, loadSyncRequest, load])

  const generatedAt = useMemo(() => items.reduce((max, i) => (i.iso > max ? i.iso : max), ""), [items])
  const notificationCount = useMemo(() => items.filter((i) => i.kind === "notification").length, [items])
  const paymentCount = useMemo(() => items.filter((i) => i.kind === "payment").length, [items])

  // Permit-type tabs are the permit groups actually present, in the automation's preferred order.
  const permitTabs = useMemo(() => {
    const counts = new Map<string, number>()
    items.forEach((i) => counts.set(i.permitGroup, (counts.get(i.permitGroup) || 0) + 1))
    return sortPermitGroups([...counts.keys()]).map((key) => ({ key, count: counts.get(key) || 0 }))
  }, [items])

  // Status tabs are every status present, in a stable order.
  const statusKeys = useMemo(() => sortStatuses([...new Set(items.map((i) => i.statusKey))]), [items])

  const q = search.trim().toLowerCase()
  const searched = useMemo(() => items.filter((i) => matchesSearch(i, q)), [items, q])
  // Counts follow the other filters, like the task list's tab counts: permit tabs count what the
  // status switch + search leave, and the status switch counts what the permit tab + search leave.
  const permitCounts = useMemo(() => {
    const m = new Map<string, number>()
    searched
      .filter((i) => statusFilter === ALL || i.statusKey === statusFilter)
      .forEach((i) => m.set(i.permitGroup, (m.get(i.permitGroup) || 0) + 1))
    return m
  }, [searched, statusFilter])
  const inPermit = useMemo(() => searched.filter((i) => permit === ALL || i.permitGroup === permit), [searched, permit])
  const statusCounts = useMemo(() => {
    const m = new Map<string, number>()
    inPermit.forEach((i) => m.set(i.statusKey, (m.get(i.statusKey) || 0) + 1))
    return m
  }, [inPermit])
  const visible = useMemo(
    () => inPermit.filter((i) => statusFilter === ALL || i.statusKey === statusFilter),
    [inPermit, statusFilter],
  )

  const tabLabel = permit === ALL ? "All permit types" : permit
  const scopeLabel = `${tabLabel}${statusFilter === ALL ? "" : ` · ${statusFilter}`}`

  // Everything ticked in the table that has a database id — what Delete removes.
  const selectedItems = useMemo(() => items.filter((i) => selected.has(i.key) && i.id != null), [items, selected])
  // Of the ticked rows, the ones filing can still do something with (already-filed records are only
  // deletable — re-running them would just mark "stage already filled" and lose where they were filed).
  const filingItems = useMemo(
    () => selectedItems.filter((i) => i.filingStatus !== "filed"),
    [selectedItems],
  )

  const handleRunFiling = async () => {
    // With rows ticked in the table, file exactly those (passing their ids makes the job re-run
    // just those records instead of taking the newest not-yet-processed ones); with nothing ticked
    // it files everything pending, as before.
    const picked = selected.size > 0 ? filingItems : []
    if (selected.size > 0 && picked.length === 0) {
      toast.info("The selected records are all already filed — nothing to file")
      return
    }
    setRunning(true)
    try {
      const res = await fetch("/api/immigration-notifications/file-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          picked.length > 0
            ? { ids: picked.map((i) => ({ kind: i.kind, id: i.id })), limit: picked.length }
            : {},
        ),
      })
      const json = await res.json()
      if (!res.ok || json.success === false) throw new Error(json.error || "Auto-filing run failed")
      const { processed, filed } = json
      toast.success(
        processed === 0
          ? picked.length > 0
            ? "Nothing to file — the selected records are all already filed"
            : "Nothing to file — every item has already been looked at"
          : `Filed ${filed} of ${processed} item${processed === 1 ? "" : "s"}`,
      )
      // Drop just the rows that were filed (they're done); anything ticked only for deleting —
      // already-filed records — stays ticked.
      if (picked.length > 0) {
        const done = new Set(picked.map((i) => i.key))
        setSelected((prev) => {
          const next = new Set([...prev].filter((k) => !done.has(k)))
          return next
        })
      }
      await load()
    } catch (e: any) {
      toast.error(e?.message || "Auto-filing run failed")
    } finally {
      setRunning(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportItemsToExcel(exportRows, scopeLabel)
    } catch (e: any) {
      toast.error(e?.message || "Export failed")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-50/50">
      {/* Row 1: identity + actions */}
      <div className="border-b border-slate-200/80 bg-white px-4 py-2.5 antialiased flex items-center gap-x-3 gap-y-2 flex-wrap shrink-0">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Immigration Notifications</h1>
        <span className="text-sm font-semibold text-custom-blue bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
          EFNS Automation
        </span>
        <div className="hidden md:flex items-center text-base text-slate-500 gap-1.5">
          <span className="font-medium text-slate-700">{notificationCount} notifications</span>
          <span className="text-slate-300">·</span>
          <span className="font-medium text-violet-700">{paymentCount} payments</span>
          {generatedAt && (
            <>
              <span className="text-slate-300">·</span>
              <span title="Latest record the automation wrote into the database">
                Last record {fmtDateTime(generatedAt)}
              </span>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ColumnVisibilityButton
            columns={ITEM_COLUMNS.map(({ id, label }) => ({ id, label }))}
            visible={columns.visible}
            onToggle={columns.toggle}
            onShowAll={columns.showAll}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || exportRows.length === 0}
            className={PILL_BUTTON_CLASS}
            title="Download the rows shown as an Excel workbook"
          >
            {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            Export
          </Button>
          {syncRequest && (syncActive || (syncRequest.finished_at && Date.now() - new Date(syncRequest.finished_at).getTime() < 30 * 60 * 1000)) && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 h-9 text-sm font-medium",
                syncRequest.status === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : syncRequest.status === "done"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700",
              )}
              title={syncRequest.error || "Records deleted with “Re-capture” are fetched again by the EFNS automation (WhatsApp off)"}
            >
              {syncRequest.status === "pending" && <><RefreshCcw className="h-4 w-4" /> Re-capture queued ({syncRequest.targets.length}) · waiting for EFNS</>}
              {syncRequest.status === "running" && <><Loader2 className="h-4 w-4 animate-spin" /> Re-capturing {syncRequest.targets.length} record{syncRequest.targets.length === 1 ? "" : "s"}…</>}
              {syncRequest.status === "done" && <><CheckCircle2 className="h-4 w-4" /> Re-captured {syncRequest.result?.recaptured ?? 0}/{syncRequest.targets.length}</>}
              {syncRequest.status === "error" && <><XCircle className="h-4 w-4" /> Re-capture failed</>}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className={PILL_BUTTON_CLASS} title="Reload from the database">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />}
            Refresh
          </Button>
          {selected.size > 0 && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 h-9 text-sm font-medium text-blue-700"
              title="Tick the header box to select every row on this page. The selection runs filing for, or deletes, exactly these records."
            >
              {selected.size} selected
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                aria-label="Clear the selected records"
                className="rounded-full p-0.5 hover:bg-blue-100"
              >
                <X className="h-4 w-4" />
              </button>
            </span>
          )}
          {selectedItems.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteItems(selectedItems)}
              disabled={loading}
              className={cn(PILL_BUTTON_CLASS, "border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700")}
              title={`Delete the ${selectedItems.length} selected record${selectedItems.length === 1 ? "" : "s"} (optionally re-capture them from EFNS)`}
            >
              <Trash2 className="h-5 w-5" />
              Delete
              <span className="ml-1 font-semibold">({selectedItems.length})</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunFiling}
            disabled={running || loading}
            className={PILL_BUTTON_CLASS}
            title={
              selected.size > 0
                ? filingItems.length > 0
                  ? `File only the ${filingItems.length} selected record${filingItems.length === 1 ? "" : "s"}${filingItems.length < selected.size ? " (the already-filed ones are skipped)" : ""}`
                  : "The selected records are all already filed — nothing to file"
                : "Match each not-yet-filed item to its task and file the PDF onto the matching stage document. Tick rows first to file only those."
            }
          >
            {running ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
            Run filing
            {filingItems.length > 0 && <span className="ml-1 font-semibold">({filingItems.length})</span>}
          </Button>
        </div>
      </div>

      {/* Row 2: permit-type tabs + search */}
      <div className="border-b border-slate-200/80 bg-slate-50/60 px-4 py-2 antialiased flex items-center gap-x-4 gap-y-2 flex-wrap shrink-0">
        <Tabs value={permit} onValueChange={setPermit}>
          <TabsList className={TAB_LIST_CLASS}>
            <TabsTrigger value={ALL} className={TAB_TRIGGER_CLASS}>
              All permit types
              {searched.length > 0 && <span className={COUNT_BADGE_CLASS}>{[...permitCounts.values()].reduce((s, n) => s + n, 0)}</span>}
            </TabsTrigger>
            {permitTabs.map((t) => {
              const count = permitCounts.get(t.key) || 0
              return (
                <TabsTrigger key={t.key} value={t.key} className={TAB_TRIGGER_CLASS}>
                  {t.key}
                  {count > 0 && <span className={COUNT_BADGE_CLASS}>{count}</span>}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input
              placeholder="Search applicant, application, message…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-10 pr-3 bg-white border-slate-200 rounded-md text-base focus-visible:ring-1 focus-visible:ring-custom-blue placeholder:text-slate-400 shadow-none"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-4 flex flex-col gap-3">
        {/* Status tabs, over whatever the permit tab + search leave */}
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="h-auto bg-transparent p-0 gap-1.5 flex-wrap justify-start">
            <TabsTrigger value={ALL} className={cn(STATUS_TAB_BASE_CLASS, "border-border bg-card text-foreground/70 data-[state=active]:bg-muted data-[state=active]:border-foreground/30 data-[state=active]:text-foreground")}>
              All statuses <span className="ml-1 font-semibold">({inPermit.length})</span>
            </TabsTrigger>
            {statusKeys.map((key) => (
              <TabsTrigger key={key} value={key} className={cn(STATUS_TAB_BASE_CLASS, STATUS_TAB[key] ?? STATUS_TAB_FALLBACK)}>
                {key} <span className="ml-1 font-semibold">({statusCounts.get(key) || 0})</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <NotificationsTable
          items={visible}
          loading={loading}
          isVisible={columns.isVisible}
          onFilteredChange={setExportRows}
          onLink={setLinkItem}
          onDelete={(i) => setDeleteItems([i])}
          fieldPreviews={fieldPreviews}
          selected={selected}
          onSelectedChange={setSelected}
          resetKey={`${permit}|${statusFilter}|${q}`}
        />
      </div>

      <LinkEfnsItemDialog
        item={linkItem}
        onOpenChange={(open) => !open && setLinkItem(null)}
        onLinked={load}
      />

      <DeleteEfnsItemDialog
        items={deleteItems}
        onOpenChange={(open) => !open && setDeleteItems([])}
        onDeleted={async (queued) => {
          // Untick what just went, so the count in the header can't outlive the rows.
          const gone = new Set(deleteItems.map((i) => i.key))
          setSelected((prev) => new Set([...prev].filter((k) => !gone.has(k))))
          await load()
          if (queued) setSyncRequest(await loadSyncRequest())
        }}
      />
    </div>
  )
}
