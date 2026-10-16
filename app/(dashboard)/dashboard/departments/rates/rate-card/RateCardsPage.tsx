"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Download, Loader2, RotateCcw, Save, Search, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DateInput } from "@/components/ui/date-input"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { dateFieldToIso, formatDateToDMY } from "@/lib/dateUtils"
import { useCurrentUser } from "@/lib/hooks/use-current-user"
import { useSessionResource } from "@/lib/sessionCache"
import { cn } from "@/lib/utils"
import {
  COUNT_BADGE_CLASS, PILL_BUTTON_CLASS, PRIMARY_PILL_BUTTON_CLASS, SearchSelect, TAB_LIST_CLASS, TAB_TRIGGER_CLASS, URGENT_BADGE_CLASS,
} from "../../../emails/components/shared"
import { ColumnVisibilityButton, useColumnVisibility } from "../../../emails/components/table"
import { Pagination } from "../../../emails/components/Pagination"
import { departmentsResource } from "../../../tasks/utils/taskManagerCache"
import DepartmentRates from "../department-rates"
import MPesaRates from "../mpesa-rates"
import { IMMIGRATION_DEPARTMENT_ID, normalizeImmigrationRates, normalizeJobRates } from "./catalog"
import {
  IMMIGRATION_BANDS, IMMIGRATION_GROUPS, JOB_BANDS, JOB_GROUPS, immigrationColumns, immigrationSticky, jobColumns, jobSticky,
  type ColumnContext, type RowModel,
} from "./columns"
import { deleteRateVersion, flattenJobLevels, indexVersions, rateCardsResource, rateSettingsResource, settingsOn, todayYmd } from "./data"
import { RateHistoryDialog, SaveRatesDialog } from "./dialogs"
import { exportImmigrationRates, exportJobRates } from "./exportRates"
import { RateGrid } from "./RateGrid"
import { RateSettingsPanel } from "./RateSettingsPanel"
import type { ImmigrationRates, JobLevel, JobRates, RateCardRow } from "./types"
import { immigrationFromPreset, jobFromPreset, useRateCard } from "./useRateCard"

type Tab = "immigration" | "jobs" | "settings" | "mpesa" | "legacy"
type Show = "all" | "priced" | "unpriced" | "edited"

const SHOW_OPTIONS = [
  { value: "all", label: "All job levels" },
  { value: "priced", label: "Priced" },
  { value: "unpriced", label: "Not priced" },
  { value: "edited", label: "Edited (unsaved)" },
]

// Settings → Rates. Two rate cards over the department tree:
//  • Immigration (department 1) — the "Imm Rates" sheet transposed: one row per job level
//    (KEP → Class G…), one column per charge (O-1…H-4) with its applicability tick.
//  • Other departments (KRA, Sheria, NTSA…) — the "Acc Rates" sheet: one row per job offered.
// Every row is versioned on its own (tm_rate_cards), so "Rates as of" shows what applied on any
// date, and saving only creates versions for the rows that were edited.
//
// All of it (department tree, every rate version, settings) is loaded once into the session cache;
// tabs, filters, the as-of date and history only re-slice it in memory.
export default function RateCardsPage() {
  const { user } = useCurrentUser()
  const userName = (user?.displayName || user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || null) as string | null

  const departments = useSessionResource(departmentsResource)
  const rateCards = useSessionResource(rateCardsResource)
  const settingsRes = useSessionResource(rateSettingsResource)

  const [tab, setTab] = useState<Tab>("immigration")
  const [asOfText, setAsOfText] = useState(todayYmd())
  const asOfIso = dateFieldToIso(asOfText)
  const asOf = asOfIso && asOfIso !== "invalid" ? asOfIso : todayYmd()
  const isToday = asOf === todayYmd()

  const [search, setSearch] = useState("")
  const [show, setShow] = useState<Show>("all")
  const [deptFilter, setDeptFilter] = useState("")
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(50)
  const [saveOpen, setSaveOpen] = useState(false)
  const [historyLevel, setHistoryLevel] = useState<JobLevel | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)

  const immVisibility = useColumnVisibility(IMMIGRATION_GROUPS)
  const jobVisibility = useColumnVisibility(JOB_GROUPS, ["workflow"])

  const settings = useMemo(() => settingsOn(settingsRes.data, asOf), [settingsRes.data, asOf])
  const allLevels = useMemo(() => flattenJobLevels(departments.data || []), [departments.data])
  const immLevels = useMemo(() => allLevels.filter((l) => l.departmentId === IMMIGRATION_DEPARTMENT_ID), [allLevels])
  const jobLevels = useMemo(() => allLevels.filter((l) => l.departmentId !== IMMIGRATION_DEPARTMENT_ID), [allLevels])
  const versions = useMemo(() => indexVersions(rateCards.data || []), [rateCards.data])

  const imm = useRateCard("immigration", immLevels, versions, asOf, settings)
  const job = useRateCard("job", jobLevels, versions, asOf, settings)
  const totalDirty = imm.dirtyCount + job.dirtyCount

  // Latest rows by key, so the preset callback can stay stable (memoised rows depend on it).
  const latest = useRef({ job: new Map<string, JobRates>() })
  latest.current.job = new Map(job.rows.map((r) => [r.level.key, r.rates]))

  const immCtx: ColumnContext<ImmigrationRates> = useMemo(() => ({
    settings,
    onChange: imm.setDraft,
    onDiscard: imm.discard,
    onHistory: setHistoryLevel,
    onPreset: (key, id) => {
      const next = immigrationFromPreset(id)
      if (next) imm.setDraft(key, next)
    },
  }), [settings, imm.setDraft, imm.discard])

  const jobCtx: ColumnContext<JobRates> = useMemo(() => ({
    settings,
    onChange: job.setDraft,
    onDiscard: job.discard,
    onHistory: setHistoryLevel,
    onPreset: (key, id) => {
      const current = latest.current.job.get(key)
      const next = current && jobFromPreset(id, current)
      if (next) job.setDraft(key, next)
    },
  }), [settings, job.setDraft, job.discard])

  const immCols = useMemo(() => immigrationColumns(immCtx, immVisibility.visible), [immCtx, immVisibility.visible])
  const jobCols = useMemo(() => jobColumns(jobCtx, jobVisibility.visible), [jobCtx, jobVisibility.visible])
  const immStickyCols = useMemo(() => immigrationSticky(), [])
  const jobStickyCols = useMemo(() => jobSticky(), [])

  // Leaving with unsaved edits.
  useEffect(() => {
    if (totalDirty === 0) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [totalDirty])

  useEffect(() => { setPage(0) }, [tab, search, show, deptFilter, asOf])

  const filterRows = <R extends RowModel<any, any>>(rows: R[]) => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (deptFilter && String(r.level.departmentId) !== deptFilter) return false
      if (show === "priced" && !r.version) return false
      if (show === "unpriced" && r.version) return false
      if (show === "edited" && !r.dirty) return false
      return !q || `${r.level.departmentName} ${r.level.path}`.toLowerCase().includes(q)
    })
  }
  const immRows = useMemo(() => filterRows(imm.rows), [imm.rows, search, show]) // eslint-disable-line react-hooks/exhaustive-deps
  const jobRows = useMemo(() => filterRows(job.rows), [job.rows, search, show, deptFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const jobDepartmentOptions = useMemo(() => {
    const seen = new Map<number, string>()
    jobLevels.forEach((l) => seen.set(l.departmentId, l.departmentName))
    return [{ value: "", label: "All departments" }, ...Array.from(seen, ([id, name]) => ({ value: String(id), label: name }))]
  }, [jobLevels])

  const loading = departments.loading || rateCards.loading
  const revalidating = departments.refreshing || rateCards.refreshing || settingsRes.refreshing
  const missingTables = /tm_rate_(cards|settings)/.test(`${rateCards.error?.message ?? ""} ${settingsRes.error?.message ?? ""}`)

  const pricedImm = imm.rows.filter((r) => r.version).length
  const pricedJob = job.rows.filter((r) => r.version).length

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([departmentsResource.refresh(), rateCardsResource.refresh(), rateSettingsResource.refresh()])
    } catch (e: any) {
      toast.error(e?.message || "Could not reload the rates")
    } finally {
      setRefreshing(false)
    }
  }

  const handleSave = async (effectiveFrom: string, note: string) => {
    const [a, b] = await Promise.all([
      imm.dirtyCount ? imm.save(effectiveFrom, note, userName) : 0,
      job.dirtyCount ? job.save(effectiveFrom, note, userName) : 0,
    ])
    toast.success(`${a + b} rate${a + b === 1 ? "" : "s"} saved, effective ${formatDateToDMY(effectiveFrom)}`)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      if (tab === "immigration") await exportImmigrationRates(immRows, asOf, settings)
      else await exportJobRates(jobRows, asOf, settings)
    } catch (e: any) {
      toast.error(e?.message || "Export failed")
    } finally {
      setExporting(false)
    }
  }

  const onLoadVersion = useCallback((v: RateCardRow) => {
    if (v.card_type === "immigration") imm.setDraft(v.job_key, normalizeImmigrationRates(v.rates as any))
    else job.setDraft(v.job_key, normalizeJobRates(v.rates as any))
    setHistoryLevel(null)
    toast.message(`Loaded the ${formatDateToDMY(v.effective_from)} rate into the editor — save to apply it.`)
  }, [imm.setDraft, job.setDraft]) // eslint-disable-line react-hooks/exhaustive-deps

  const gridTab = tab === "immigration" || tab === "jobs"
  const visibleRows = tab === "immigration" ? immRows : jobRows
  const pageRows = visibleRows.slice(page * perPage, (page + 1) * perPage)

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-50/50">
      {/* Row 1: identity + global actions */}
      <div className="border-b border-slate-200/80 bg-white px-4 py-2.5 antialiased flex items-center gap-x-3 gap-y-2 flex-wrap shrink-0">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Rates Management</h1>
        <span className="text-sm font-semibold text-custom-blue bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">Rate Card</span>
        <div className="hidden md:flex items-center text-base text-slate-500 gap-1.5">
          <span>{pricedImm}/{immLevels.length} immigration priced</span>
          <span className="text-slate-300">·</span>
          <span>{pricedJob}/{jobLevels.length} other jobs priced</span>
          <span className="text-slate-300">·</span>
          <span>{settings.usd_rate} KES/USD</span>
          {revalidating && (
            <span className="inline-flex items-center gap-1 text-slate-400" title="Showing what was loaded earlier while the latest data comes in">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
            </span>
          )}
        </div>

        {totalDirty > 0 && (
          <span className="inline-flex items-center gap-1.5 text-base font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            {totalDirty} unsaved change{totalDirty === 1 ? "" : "s"}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2" title="Show the rates that applied on this date">
            <span className="text-base font-medium text-slate-600">Rates as of</span>
            <DateInput value={asOfText} onChange={setAsOfText} className={cn("h-10 w-40 text-base", !isToday && "border-amber-300 bg-amber-50")} />
            {!isToday && (
              <Button variant="outline" size="sm" className={PILL_BUTTON_CLASS} onClick={() => setAsOfText(todayYmd())}>Today</Button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || loading} className={PILL_BUTTON_CLASS} title="Reload from the database">
            {refreshing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />}
            Refresh
          </Button>
          {gridTab && (
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || loading} className={PILL_BUTTON_CLASS}>
              {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
              Export
            </Button>
          )}
          {totalDirty > 0 && (
            <Button variant="outline" size="sm" onClick={() => { imm.discardAll(); job.discardAll() }} className={PILL_BUTTON_CLASS}>
              <Undo2 className="h-5 w-5" /> Discard
            </Button>
          )}
          <Button onClick={() => setSaveOpen(true)} disabled={totalDirty === 0} className={PRIMARY_PILL_BUTTON_CLASS}>
            <Save className="h-5 w-5" /> Save changes{totalDirty > 0 ? ` (${totalDirty})` : ""}
          </Button>
        </div>
      </div>

      {/* Row 2: tabs + filters */}
      <div className="border-b border-slate-200/80 bg-slate-50/60 px-4 py-2 antialiased flex items-center gap-x-4 gap-y-2 flex-wrap shrink-0">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className={TAB_LIST_CLASS}>
            <TabsTrigger value="immigration" className={TAB_TRIGGER_CLASS}>
              Immigration Rates
              <span className={imm.dirtyCount ? URGENT_BADGE_CLASS : COUNT_BADGE_CLASS}>{imm.dirtyCount || immLevels.length}</span>
            </TabsTrigger>
            <TabsTrigger value="jobs" className={TAB_TRIGGER_CLASS}>
              Other Departments
              <span className={job.dirtyCount ? URGENT_BADGE_CLASS : COUNT_BADGE_CLASS}>{job.dirtyCount || jobLevels.length}</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className={TAB_TRIGGER_CLASS}>Settings</TabsTrigger>
            <TabsTrigger value="mpesa" className={TAB_TRIGGER_CLASS}>MPesa Rates</TabsTrigger>
            <TabsTrigger value="legacy" className={TAB_TRIGGER_CLASS} title="The previous department rates table (rates_history), kept until it is retired">Old Rates</TabsTrigger>
          </TabsList>
        </Tabs>

        {gridTab && (
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search job levels…" className="h-10 w-64 pl-9 text-base" />
            </div>
            {tab === "jobs" && (
              <SearchSelect value={deptFilter} onChange={setDeptFilter} options={jobDepartmentOptions} placeholder="All departments" className="w-52" />
            )}
            <SearchSelect value={show} onChange={(v) => setShow((v || "all") as Show)} options={SHOW_OPTIONS} className="w-48" />
            {tab === "immigration" ? (
              <ColumnVisibilityButton columns={IMMIGRATION_GROUPS} visible={immVisibility.visible} onToggle={immVisibility.toggle} onShowAll={immVisibility.showAll} label="Sections" />
            ) : (
              <ColumnVisibilityButton columns={JOB_GROUPS} visible={jobVisibility.visible} onToggle={jobVisibility.toggle} onShowAll={jobVisibility.showAll} label="Sections" />
            )}
          </div>
        )}
      </div>

      {missingTables && (
        <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-800">
          The rate card tables don&apos;t exist yet. Apply <code className="font-mono text-sm">supabase/migrations/20261019000000_rate_cards_and_quotations.sql</code> to the database, then press Refresh.
        </div>
      )}
      {gridTab && !isToday && (
        <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-base text-amber-800">
          Showing the rates that applied on <strong>{formatDateToDMY(asOf)}</strong>. Edits made here are saved with whatever effective date you pick when saving.
        </div>
      )}

      {gridTab ? (
        <>
          <div className="flex-1 min-h-0 overflow-auto bg-white">
            {tab === "immigration" ? (
              <RateGrid
                rows={pageRows as typeof immRows}
                rowKey={(r) => r.level.key}
                sticky={immStickyCols}
                columns={immCols}
                bands={IMMIGRATION_BANDS}
                loading={loading}
                offset={page * perPage}
                empty={immLevels.length === 0 ? "No job levels under Immigration yet — add them in Settings → Departments." : "No job levels match these filters."}
                rowClassName={(r) => (r.dirty ? "!bg-amber-50" : undefined)}
              />
            ) : (
              <RateGrid
                rows={pageRows as typeof jobRows}
                rowKey={(r) => r.level.key}
                sticky={jobStickyCols}
                columns={jobCols}
                bands={JOB_BANDS}
                loading={loading}
                offset={page * perPage}
                empty="No job levels match these filters."
                rowClassName={(r) => cn(r.dirty && "!bg-amber-50", !r.rates.applicable && "opacity-60")}
              />
            )}
          </div>
          <Pagination
            totalItems={visibleRows.length}
            itemsPerPage={perPage}
            currentPage={page}
            onPageChange={setPage}
            onItemsPerPageChange={(n) => { setPerPage(n); setPage(0) }}
          />
        </>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          {tab === "settings" && <RateSettingsPanel rows={settingsRes.data} loading={settingsRes.loading} userName={userName} />}
          {tab === "mpesa" && <div className="p-4"><MPesaRates /></div>}
          {tab === "legacy" && <div className="p-4"><DepartmentRates /></div>}
        </div>
      )}

      <SaveRatesDialog open={saveOpen} onOpenChange={setSaveOpen} count={totalDirty} defaultDate={todayYmd()} onSave={handleSave} />
      <RateHistoryDialog
        level={historyLevel}
        versions={historyLevel ? versions.get(historyLevel.key) || [] : []}
        settingsRows={settingsRes.data}
        onClose={() => setHistoryLevel(null)}
        onLoad={onLoadVersion}
        onDelete={async (v) => {
          try {
            await deleteRateVersion(v.id)
            toast.success(`Deleted the ${formatDateToDMY(v.effective_from)} version`)
          } catch (e: any) {
            toast.error(e?.message || "Could not delete the version")
          }
        }}
      />
    </div>
  )
}
