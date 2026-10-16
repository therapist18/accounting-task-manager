"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { BarChart3, Download, Loader2, RotateCcw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { getImmigrationAlerts, immigrationAlertsResource, type ImmigrationAlert } from "@/lib/immigrationAlerts"
import { fetchDepartments } from "../departments/departments/database"
import {
  COUNT_BADGE_CLASS, PILL_BUTTON_CLASS, TAB_LIST_CLASS, TAB_TRIGGER_CLASS, URGENT_BADGE_CLASS, fmtDateTime,
} from "../emails/components/shared"
import { ColumnVisibilityButton, useColumnVisibility } from "../emails/components/table"
import { ALERT_COLUMNS, ALERT_VALUE, ImmigrationAlertsTable } from "./components/ImmigrationAlertsTable"
import { exportAlertsToExcel } from "./components/exportAlerts"
import { STATS_ROWS, STATUS_TABS, STATUS_TAB_BASE_CLASS, type StatusTab } from "./components/statusStyles"

// Immigration Alerts: people whose Current Immigration Status is expired or in its grace period —
// the same people as the Imm Status Manager's Expired / Grace tabs, worked out by bcl-registry on
// request (cached ~10 minutes; Refresh recalculates).
//
// Laid out like the Email Center (identity + actions row, tabs + filters row, the shared table
// toolkit), with one tab per task job level (Immigration -> KEP, KSP, ETA ...), in the same order and
// selection as the task list's subdepartment tabs. Everything is fetched once; tabs, the status switch,
// search and column filters only re-slice what's in memory.

const ALL = "all"

const jobLevelKey = (a: ImmigrationAlert) => (a.job_level?.subdepartment_id != null ? String(a.job_level.subdepartment_id) : "none")

const matchesSearch = (a: ImmigrationAlert, q: string) =>
  !q || ALERT_COLUMNS.some((c) => ALERT_VALUE[c.id](a).toLowerCase().includes(q))

export default function ImmigrationAlertsPage() {
  // Seeded from the shared copy (lib/immigrationAlerts) the notifier and dashboard card also use.
  const [alerts, setAlerts] = useState<ImmigrationAlert[]>(() => immigrationAlertsResource.getState().data?.alerts ?? [])
  const [generatedAt, setGeneratedAt] = useState<string | null>(() => immigrationAlertsResource.getState().data?.generatedAt ?? null)
  const [loading, setLoading] = useState(() => !immigrationAlertsResource.getState().data)
  const [departments, setDepartments] = useState<any[]>([])
  const [jobLevel, setJobLevel] = useState<string>(ALL)
  const [status, setStatus] = useState<StatusTab>("all")
  const [search, setSearch] = useState("")
  const [exportRows, setExportRows] = useState<ImmigrationAlert[]>([])
  const [exporting, setExporting] = useState(false)
  const columns = useColumnVisibility(ALERT_COLUMNS.map(({ id, label }) => ({ id, label })))
  // Stats rows (Total / Grace / Expired) — shown by default; the Stats button picks which.
  const statsRows = useColumnVisibility(STATS_ROWS.map(({ key, label }) => ({ id: key, label })))

  // `fresh` (Refresh) asks bcl-registry to recalculate instead of using its cache.
  // fresh = the Recalculate button: ask the registry to recompute, then share the result.
  const load = useCallback(async (fresh = false) => {
    if (fresh || !immigrationAlertsResource.getState().data) setLoading(true)
    try {
      const result = fresh ? await getImmigrationAlerts({ fresh: true }) : await immigrationAlertsResource.load()
      if (fresh) immigrationAlertsResource.mutate(() => result)
      setAlerts(result.alerts)
      setGeneratedAt(result.generatedAt)
    } catch (e: any) {
      toast.error(e?.message || "Failed to load immigration alerts")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    fetchDepartments().then(setDepartments).catch((e) => console.warn("[immigration-alerts] departments:", e))
  }, [load])

  // Job level tabs: the alerts' department's subdepartments, in its configured order — the ones the
  // task list shows by default, plus any other that has alerts, so no alert is ever left without a tab.
  const jobLevelTabs = useMemo(() => {
    const counts = new Map<string, number>()
    alerts.forEach((a) => counts.set(jobLevelKey(a), (counts.get(jobLevelKey(a)) || 0) + 1))
    const deptId = alerts.find((a) => a.job_level?.department_id != null)?.job_level?.department_id
    const dept = departments.find((d) => String(d.id) === String(deptId))
    const tabs: { key: string; label: string }[] = dept
      ? (dept.tm_subdepartments || [])
          .filter((s: any) => s.default_display || counts.has(String(s.id)))
          .map((s: any) => ({ key: String(s.id), label: s.name }))
      : // Departments not loaded (yet): fall back to the job levels the alerts name.
        [...new Map(alerts.filter((a) => a.job_level?.subdepartment_id != null).map((a) => [jobLevelKey(a), a.job_level!.subdepartment_name || "—"])).entries()]
          .map(([key, label]) => ({ key, label }))
    if (counts.has("none")) tabs.push({ key: "none", label: "No job level" })
    return tabs
  }, [alerts, departments])

  const q = search.trim().toLowerCase()
  // Counts follow the other filters, like the task list's search-aware tab counts: the job level tabs
  // count what the status switch + search leave, and the status switch counts what the tab + search leave.
  const searched = useMemo(() => alerts.filter((a) => matchesSearch(a, q)), [alerts, q])
  const tabCounts = useMemo(() => {
    const m = new Map<string, number>()
    searched.filter((a) => status === "all" || a.status === status).forEach((a) => m.set(jobLevelKey(a), (m.get(jobLevelKey(a)) || 0) + 1))
    return m
  }, [searched, status])
  const inTab = useMemo(() => searched.filter((a) => jobLevel === ALL || jobLevelKey(a) === jobLevel), [searched, jobLevel])
  const statusCounts = useMemo(
    () => ({ all: inTab.length, expired: inTab.filter((a) => a.status === "expired").length, grace: inTab.filter((a) => a.status === "grace").length }),
    [inTab],
  )
  const visible = useMemo(() => inTab.filter((a) => status === "all" || a.status === status), [inTab, status])

  const totalExpired = alerts.filter((a) => a.status === "expired").length
  const totalGrace = alerts.length - totalExpired
  const tabLabel = jobLevel === ALL ? "All job levels" : jobLevelTabs.find((t) => t.key === jobLevel)?.label || "Job level"

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportAlertsToExcel(exportRows, `${tabLabel}${status === "all" ? "" : ` · ${status === "expired" ? "Expired" : "Grace"}`}`)
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
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Immigration Alerts</h1>
        <span className="text-sm font-semibold text-custom-blue bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
          Current Immigration Status
        </span>
        <div className="hidden md:flex items-center text-base text-slate-500 gap-1.5">
          <span className="font-medium text-red-600">{totalExpired} expired</span>
          <span className="text-slate-300">·</span>
          <span className="font-medium text-amber-600">{totalGrace} in grace period</span>
          {generatedAt && (
            <>
              <span className="text-slate-300">·</span>
              <span title="Worked out by BCL Registry from the Imm Status Manager; Refresh recalculates it now">
                Checked {fmtDateTime(generatedAt)}
              </span>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ColumnVisibilityButton
            label="Stats"
            icon={BarChart3}
            columns={STATS_ROWS.map(({ key, label }) => ({ id: key, label: `${label} row` }))}
            visible={statsRows.visible}
            onToggle={statsRows.toggle}
            onShowAll={statsRows.showAll}
          />
          <ColumnVisibilityButton
            columns={ALERT_COLUMNS.map(({ id, label }) => ({ id, label }))}
            visible={columns.visible}
            onToggle={columns.toggle}
            onShowAll={columns.showAll}
          />
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || exportRows.length === 0} className={PILL_BUTTON_CLASS} title="Download the rows shown as an Excel workbook">
            {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading} className={PILL_BUTTON_CLASS} title="Recalculate from the Imm Status Manager now">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Row 2: job level tabs + filters */}
      <div className="border-b border-slate-200/80 bg-slate-50/60 px-4 py-2 antialiased flex items-center gap-x-4 gap-y-2 flex-wrap shrink-0">
        <Tabs value={jobLevel} onValueChange={setJobLevel}>
          <TabsList className={TAB_LIST_CLASS}>
            <TabsTrigger value={ALL} className={TAB_TRIGGER_CLASS}>
              All job levels
              {searched.length > 0 && <span className={COUNT_BADGE_CLASS}>{[...tabCounts.values()].reduce((s, n) => s + n, 0)}</span>}
            </TabsTrigger>
            {jobLevelTabs.map((t) => {
              const count = tabCounts.get(t.key) || 0
              return (
                <TabsTrigger key={t.key} value={t.key} className={TAB_TRIGGER_CLASS}>
                  {t.label}
                  {count > 0 && <span className={t.key === "none" ? URGENT_BADGE_CLASS : COUNT_BADGE_CLASS}>{count}</span>}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input
              placeholder="Search name, company, document…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-10 pr-3 bg-white border-slate-200 rounded-md text-base focus-visible:ring-1 focus-visible:ring-custom-blue placeholder:text-slate-400 shadow-none"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-4 flex flex-col gap-3">
        {/* Status tabs, as in the Imm Status Manager's Current Immigration Status */}
        <Tabs value={status} onValueChange={(v) => setStatus(v as StatusTab)}>
          <TabsList className="h-auto bg-transparent p-0 gap-1.5 flex-wrap justify-start">
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className={cn(STATUS_TAB_BASE_CLASS, t.className)}>
                <t.icon className="h-3.5 w-3.5 mr-1.5" />
                {t.label} <span className="ml-1 font-semibold">({statusCounts[t.value]})</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <ImmigrationAlertsTable
          alerts={visible}
          loading={loading}
          isVisible={columns.isVisible}
          onFilteredChange={setExportRows}
          resetKey={`${jobLevel}|${status}|${q}`}
          statsRows={STATS_ROWS.filter((r) => statsRows.isVisible(r.key)).map((r) => r.key)}
        />
      </div>
    </div>
  )
}
