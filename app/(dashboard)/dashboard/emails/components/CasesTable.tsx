"use client"

import { ReactNode, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Pagination } from "./Pagination"
import {
  StatsRows, TableLoading, SortTh, TD_CLASS,
  useColumnFilters, useTableSort, zebraRow,
} from "./table"
import { APPROVAL_BADGE, APPROVAL_LABEL, caseMetrics, fmtDate, fmtDateTime, todayYmd, type CaseMetrics, type CaseRow } from "./shared"

// Renders the "KRA CORESPONDENCE PLATFORM" Sheet1 layout: a two-level, colour-banded header
// (From KRA email | When BCL responds to KRA | Tracking), an index column, filterable/sortable
// columns (click to sort, shift-click to add a sort level, funnel icon to filter) and column
// visibility. The three computed columns (days given, days since email, days remaining) are
// calculated from the case dates, so sorting/filtering them works on the computed value, not a stored one.

const ROW_TINT = {
  overdue: "bg-red-50 hover:bg-red-100",
  pending: "bg-amber-50 hover:bg-amber-100",
  approved: "bg-emerald-50 hover:bg-emerald-100",
  normal: "",
}

const td = TD_CLASS
const badge = "text-sm font-semibold whitespace-nowrap border px-2.5 py-0.5 rounded-full"

interface Row {
  case: CaseRow
  metrics: CaseMetrics
}

type Band = "from" | "respond" | "tracking"

const BAND_HEADER: Record<Band, string> = {
  from: "text-slate-800 bg-blue-50 hover:bg-blue-100/70",
  respond: "text-slate-800 bg-emerald-50 hover:bg-emerald-100/70",
  tracking: "text-slate-800 bg-slate-100 hover:bg-slate-200/70",
}
const BAND_BANNER: Record<Band, string> = {
  from: "bg-[#376bae] text-white",
  respond: "bg-emerald-600 text-white",
  tracking: "bg-slate-600 text-white",
}
const BAND_LABEL: Record<Band, string> = { from: "From KRA email", respond: "When BCL responds to KRA", tracking: "Tracking" }

interface ColDef {
  id: string
  label: string
  band: Band
  tdClassName?: string
  sortValue: (r: Row) => string | number
  filterValue?: (r: Row) => string
  renderCell: (c: CaseRow, m: CaseMetrics, showTime: boolean) => ReactNode
}

const COLUMNS: ColDef[] = [
  { id: "kra_email_from", label: "KRA email from", band: "from", tdClassName: "min-w-[190px] break-all text-sm text-slate-600", sortValue: (r) => r.case.kra_email_from ?? "", renderCell: (c) => c.kra_email_from },
  { id: "kra_email_cc", label: "KRA email CC to", band: "from", tdClassName: "min-w-[190px] break-all text-sm text-slate-500", sortValue: (r) => r.case.kra_email_cc ?? "", renderCell: (c) => c.kra_email_cc || "—" },
  { id: "email_date", label: "Email date", band: "from", tdClassName: "whitespace-nowrap tabular-nums", sortValue: (r) => r.case.email_date ?? "", renderCell: (c) => fmtDate(c.email_date) },
  { id: "deadline_date", label: "Deadline date (KRA)", band: "from", tdClassName: "whitespace-nowrap font-semibold tabular-nums", sortValue: (r) => r.case.deadline_date ?? "", renderCell: (c) => fmtDate(c.deadline_date) || <span className="text-slate-300 font-normal">—</span> },
  { id: "subject", label: "Subject", band: "from", tdClassName: "min-w-[260px]", sortValue: (r) => r.case.subject ?? "", renderCell: (c) => <span className="line-clamp-2 leading-snug font-medium text-slate-900" title={c.subject ?? ""}>{c.subject}</span> },
  { id: "contents", label: "Contents (details)", band: "from", tdClassName: "min-w-[280px]", sortValue: (r) => r.case.contents ?? "", renderCell: (c) => <span className="line-clamp-2 leading-snug text-slate-600" title={c.contents ?? ""}>{c.contents}</span> },
  { id: "attachments_summary", label: "Attached (PDF/Excel)", band: "from", tdClassName: "min-w-[130px] text-sm text-slate-600", sortValue: (r) => r.case.attachments_summary ?? "", renderCell: (c) => c.attachments_summary || <span className="text-slate-300">—</span> },
  { id: "signing_officer_name", label: "Signing officer name", band: "from", tdClassName: "min-w-[130px] font-medium text-slate-800", sortValue: (r) => r.case.signing_officer_name ?? "", filterValue: (r) => r.case.signing_officer_name ?? "", renderCell: (c) => c.signing_officer_name || "—" },
  { id: "signing_officer_position", label: "Signing officer position", band: "from", tdClassName: "min-w-[170px] text-sm text-slate-600", sortValue: (r) => r.case.signing_officer_position ?? "", renderCell: (c) => c.signing_officer_position || "—" },
  { id: "days_given", label: "Days given to respond", band: "from", tdClassName: "text-center tabular-nums font-medium text-slate-700", sortValue: (r) => r.metrics.daysGiven ?? -Infinity, renderCell: (_c, m) => m.daysGiven ?? "—" },
  { id: "days_since", label: "Days: email → today", band: "from", tdClassName: "text-center tabular-nums font-medium text-slate-700", sortValue: (r) => r.metrics.daysSince ?? -Infinity, renderCell: (_c, m) => m.daysSince ?? "—" },

  { id: "respond_date", label: "Respond date", band: "respond", tdClassName: "whitespace-nowrap tabular-nums", sortValue: (r) => r.case.respond_date ?? "", renderCell: (c) => fmtDate(c.respond_date) || "—" },
  { id: "responded_by_name", label: "Responded by name", band: "respond", tdClassName: "text-slate-700", sortValue: (r) => r.case.responded_by_name ?? "", renderCell: (c) => (c.respond_date ? c.responded_by_name ?? "BCL" : "—") },
  { id: "respond_contents", label: "Respond contents", band: "respond", tdClassName: "min-w-[280px]", sortValue: (r) => r.case.respond_contents ?? "", renderCell: (c) => <span className="line-clamp-2 leading-snug text-slate-600" title={c.respond_contents ?? ""}>{c.respond_contents || "—"}</span> },
  { id: "promised_date", label: "Promised time date", band: "respond", tdClassName: "whitespace-nowrap tabular-nums", sortValue: (r) => r.case.promised_date ?? "", renderCell: (c) => fmtDate(c.promised_date) || "—" },
  {
    id: "days_remaining", label: "Days remaining", band: "respond", sortValue: (r) => r.metrics.daysRemaining ?? Infinity,
    tdClassName: "text-center font-bold tabular-nums",
    renderCell: (_c, m) => (
      <span className={cn(
        m.daysRemaining !== null && m.daysRemaining < 0 && "text-red-600",
        m.daysRemaining !== null && m.daysRemaining >= 0 && m.daysRemaining <= 7 && "text-amber-600",
        m.daysRemaining !== null && m.daysRemaining > 7 && "text-emerald-600"
      )}>
        {m.daysRemaining ?? "—"}
      </span>
    ),
  },

  {
    id: "approval_status", label: "Approval", band: "tracking", sortValue: (r) => r.case.approval_status, filterValue: (r) => APPROVAL_LABEL[r.case.approval_status],
    renderCell: (c) => (
      <>
        <Badge variant="outline" className={cn(badge, APPROVAL_BADGE[c.approval_status])}>{APPROVAL_LABEL[c.approval_status]}</Badge>
        {c.approval_date && <div className="text-sm text-slate-400 mt-0.5 tabular-nums">{fmtDate(c.approval_date)}</div>}
      </>
    ),
  },
  {
    id: "assigned_to_name", label: "Assigned to", band: "tracking", tdClassName: "whitespace-nowrap", sortValue: (r) => r.case.assigned_to_name ?? "", filterValue: (r) => r.case.assigned_to_name ?? "Unassigned",
    renderCell: (c) => (c.assigned_to_name ? <span className="font-medium text-slate-800">{c.assigned_to_name}</span> : <span className="text-slate-400">Unassigned</span>),
  },
  {
    id: "status", label: "Status", band: "tracking", tdClassName: "whitespace-nowrap", sortValue: (r) => r.case.status, filterValue: (r) => (r.case.status === "closed" ? "Completed" : "Open"),
    renderCell: (c, _m, showTime) => c.status === "closed" ? (
      <>
        <Badge variant="outline" className={cn(badge, "bg-emerald-50 text-emerald-700 border-emerald-200")}>Completed</Badge>
        <div className="text-sm text-slate-400 mt-0.5 tabular-nums">{c.completed_by_name ?? ""}{c.completed_at ? ` · ${fmtDateTime(c.completed_at, showTime)}` : ""}</div>
      </>
    ) : (
      <Badge variant="outline" className={cn(badge, "bg-slate-100 text-slate-600 border-slate-200")}>Open</Badge>
    ),
  },
]

export const TOGGLEABLE_COLUMNS = COLUMNS.map((c) => ({ id: c.id, label: c.label }))

export function CasesTable({
  cases, onOpen, showTime, embedded = false, loading = false, showStats = false, visibleColumns: visibility,
}: {
  cases: CaseRow[]
  onOpen: (c: CaseRow) => void
  showTime: boolean
  embedded?: boolean
  loading?: boolean
  // Both owned by the page's shared toolbar (Stats / Columns buttons), not this component — so every
  // list tab's table keeps those controls in one place instead of each growing its own.
  showStats?: boolean
  visibleColumns?: Record<string, boolean>
}) {
  const today = todayYmd()
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [page, setPage] = useState(0)
  const isVisible = (id: string) => visibility?.[id] !== false

  const rows: Row[] = useMemo(
    () => cases.map((c) => ({ case: c, metrics: caseMetrics(c, today) })),
    [cases, today]
  )

  const sortAccessors = useMemo(() => {
    const acc: Record<string, (r: Row) => string | number> = { client: (r) => r.case.company_name ?? "" }
    COLUMNS.forEach((c) => { acc[c.id] = c.sortValue })
    return acc
  }, [])

  const filterValue = useMemo(() => {
    const fv: Record<string, (r: Row) => string> = {}
    COLUMNS.forEach((c) => { if (c.filterValue) fv[c.id] = c.filterValue })
    return fv
  }, [])
  const { filtered, configFor, activeCount: activeFilterCount, clearAll: clearAllFilters } = useColumnFilters(rows, filterValue)

  const { levels, sorted: sortedRows, toggle: handleSort } = useTableSort(filtered, sortAccessors, [{ key: "email_date", dir: "desc" }])

  useEffect(() => setPage(0), [cases, itemsPerPage])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / itemsPerPage))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * itemsPerPage
  const visibleRows = sortedRows.slice(start, start + itemsPerPage)

  const visibleColumns = COLUMNS.filter((c) => isVisible(c.id))
  const bandColumns: Record<Band, ColDef[]> = {
    from: visibleColumns.filter((c) => c.band === "from"),
    respond: visibleColumns.filter((c) => c.band === "respond"),
    tracking: visibleColumns.filter((c) => c.band === "tracking"),
  }
  const colCount = 2 + visibleColumns.length

  const statsRowColumns = useMemo(() => {
    const cols: { id: string; getValue?: (r: Row) => string; className?: string }[] = [
      { id: "#", className: "sticky left-0 z-40 text-center" },
      { id: "client", getValue: (r) => r.case.company_name ?? "", className: "sticky left-16 z-40 border-r-2" },
    ]
    visibleColumns.forEach((c) => cols.push({ id: c.id, getValue: (r) => String(c.filterValue ? c.filterValue(r) : c.sortValue(r)) }))
    return cols
  }, [visibleColumns])

  return (
    <div className={cn("flex flex-col flex-1 min-h-0 bg-white overflow-hidden", !embedded && "rounded-xl border border-slate-200 shadow-sm")}>
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 shrink-0">
          <Button variant="outline" size="sm" onClick={clearAllFilters} className="h-9 px-3 gap-1.5 rounded-full border-slate-200 text-base font-medium text-custom-blue">
            Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
          </Button>
        </div>
      )}

      <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
        <table className="min-w-[2300px] w-full border-separate border-spacing-0 text-base">
          <thead className="sticky top-0 z-30 bg-white shadow-xs">
            <tr>
              <SortTh tone="blue" id="#" rowSpan={2} levels={levels} onSort={handleSort} className="w-16 sticky left-0 z-40 text-center">#</SortTh>
              <SortTh id="client" rowSpan={2} levels={levels} onSort={handleSort} className="min-w-[220px] sticky left-16 z-40 text-left bg-[#376bae] hover:bg-[#376bae]/90 text-white border-white/20 border-r-2">
                Client / Ref
              </SortTh>
              {(["from", "respond", "tracking"] as Band[]).map((band) =>
                bandColumns[band].length > 0 && (
                  <th key={band} colSpan={bandColumns[band].length} className={cn("py-2 px-3 text-center font-semibold text-base border-b border-white/20", band !== "tracking" && "border-r", BAND_BANNER[band])}>
                    {BAND_LABEL[band]}
                  </th>
                )
              )}
            </tr>
            <tr>
              {visibleColumns.map((c) => (
                <SortTh key={c.id} id={c.id} levels={levels} onSort={handleSort} filter={c.filterValue ? configFor(c.id) : undefined} className={BAND_HEADER[c.band]}>
                  {c.label}
                </SortTh>
              ))}
            </tr>
            {showStats && <StatsRows rows={filtered} columns={statsRowColumns} />}
          </thead>
          <tbody>
            {loading && <TableLoading cols={colCount} />}
            {!loading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-20 text-center text-base text-slate-400">
                  No KRA cases match these filters.
                </td>
              </tr>
            )}
            {visibleRows.map(({ case: c, metrics: m }, index) => {
              const rowClass = m.state !== "normal" ? ROW_TINT[m.state] : zebraRow(index)

              return (
                <tr
                  key={c.id}
                  onClick={() => onOpen(c)}
                  className={cn("cursor-pointer transition-colors group", rowClass)}
                >
                  <td className={cn(td, "sticky left-0 z-20 bg-inherit text-center text-slate-400 font-medium tabular-nums border-r border-slate-200")}>
                    {start + index + 1}
                  </td>
                  <td className={cn(td, "sticky left-16 z-20 bg-inherit font-semibold text-slate-900 border-r-2 border-slate-300")}>
                    <div className="leading-snug text-slate-900 font-semibold">{c.company_name ?? <span className="text-red-500 font-normal">Unassigned company</span>}</div>
                    <div className="text-sm font-normal text-slate-500 mt-1">
                      {c.case_ref}{c.kra_pin ? ` · ${c.kra_pin}` : ""}
                    </div>
                  </td>
                  {visibleColumns.map((col) => (
                    <td key={col.id} className={cn(td, col.tdClassName)}>{col.renderCell(c, m, showTime)}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        totalItems={sortedRows.length}
        itemsPerPage={itemsPerPage}
        currentPage={safePage}
        onPageChange={setPage}
        onItemsPerPageChange={(n) => setItemsPerPage(n)}
        sticky={false}
        className="shrink-0"
      />
    </div>
  )
}
