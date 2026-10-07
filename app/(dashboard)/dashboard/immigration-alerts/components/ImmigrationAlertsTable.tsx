"use client"

import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { IMMIGRATION_ALERT_STATUS_LABELS, type ImmigrationAlert } from "@/lib/immigrationAlerts"
// The Email Center's table toolkit, so this table sorts, filters, stripes and paginates exactly like
// every other table in the app.
import { fmtDate } from "../../emails/components/shared"
import { Pagination } from "../../emails/components/Pagination"
import { SortTh, TableLoading, TD_CLASS, TH_CLASS, useColumnFilters, useTableSort, zebraRow } from "../../emails/components/table"
import { STATS_ROWS, type StatsRowKey } from "./statusStyles"

// Every column, in display order. `filter` columns get a header filter (a checklist of their values,
// or a From/To range for the date column); hide-able ones are listed in the Columns button.
export const ALERT_COLUMNS = [
  { id: "person", label: "Person", filter: false, identity: true },
  { id: "relationship", label: "Relationship", filter: true, identity: true },
  { id: "principal", label: "Principal", filter: true, identity: true },
  { id: "company", label: "Company", filter: true, identity: true },
  { id: "prefix", label: "Prefix", filter: true, identity: true },
  { id: "job_level", label: "Job level", filter: true, identity: false },
  { id: "document", label: "Current status document", filter: true, identity: false },
  { id: "expiry", label: "Expiry date", filter: true, identity: false },
  { id: "days", label: "Days", filter: false, identity: false },
  { id: "status", label: "Status", filter: true, identity: false },
] as const

export type AlertColumnId = (typeof ALERT_COLUMNS)[number]["id"]

export const jobLevelLabel = (a: ImmigrationAlert) => a.job_level?.subdepartment_name || "Unassigned"

export const daysLabel = (days: number | null) => {
  if (days === null || days === undefined) return "—"
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? "" : "s"} ago`
  if (days === 0) return "Today"
  return `${days} day${days === 1 ? "" : "s"} left`
}

// What each column shows (and filters / exports on).
export const ALERT_VALUE: Record<AlertColumnId, (a: ImmigrationAlert) => string> = {
  person: (a) => a.person_name || "Unknown",
  relationship: (a) => (a.principal_name ? a.relationship || "Dependant" : "Principal"),
  principal: (a) => a.principal_name || "",
  company: (a) => a.company_name || "",
  prefix: (a) => a.company_prefix || "",
  job_level: jobLevelLabel,
  document: (a) => a.doc_type_name || "",
  expiry: (a) => fmtDate(a.expiry_date),
  days: (a) => daysLabel(a.days_to_go),
  status: (a) => IMMIGRATION_ALERT_STATUS_LABELS[a.status],
}

const SORT_ACCESSORS: Record<string, (a: ImmigrationAlert) => string | number> = {
  ...ALERT_VALUE,
  expiry: (a) => a.expiry_date || "",
  days: (a) => a.days_to_go ?? 0,
}

const FILTER_VALUES = Object.fromEntries(
  ALERT_COLUMNS.filter((c) => c.filter).map((c) => [c.id, ALERT_VALUE[c.id]]),
) as Record<string, (a: ImmigrationAlert) => string>

export const STATUS_BADGE: Record<ImmigrationAlert["status"], string> = {
  expired: "border-red-200 bg-red-50 text-red-700",
  grace: "border-amber-200 bg-amber-50 text-amber-700",
}

export function ImmigrationAlertsTable({
  alerts,
  loading,
  isVisible,
  onFilteredChange,
  resetKey,
  statsRows = [],
}: {
  alerts: ImmigrationAlert[]
  loading: boolean
  isVisible: (id: string) => boolean
  // The rows after the header filters, in display order — what the page exports.
  onFilteredChange?: (rows: ImmigrationAlert[]) => void
  // Changing this (tab / search) jumps back to the first page.
  resetKey?: string
  // Which stats rows to show, frozen under the header (none = off).
  statsRows?: StatsRowKey[]
}) {
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [page, setPage] = useState(0)

  const { filtered, configFor } = useColumnFilters(alerts, FILTER_VALUES, ["expiry"])
  // Grace periods running out soonest first, then the most recent expiries — the same order the
  // registry sends them in.
  const { levels, sorted, toggle } = useTableSort(filtered, SORT_ACCESSORS, [{ key: "#", dir: "asc" }])

  useEffect(() => onFilteredChange?.(sorted), [sorted, onFilteredChange])
  useEffect(() => setPage(0), [resetKey, itemsPerPage, filtered.length])

  const columns = ALERT_COLUMNS.filter((c) => isVisible(c.id))
  const identitySpan = columns.filter((c) => c.identity).length
  const statusSpan = columns.length - identitySpan

  // Same figures as the Imm Status Manager's stats rows, over what the header filters leave:
  // the principal/dependant split across the person columns, the count across the status columns.
  const stats = useMemo(() => {
    const split = (rows: ImmigrationAlert[]) => ({
      count: rows.length,
      principals: rows.filter((a) => !a.principal_name).length,
      dependants: rows.filter((a) => !!a.principal_name).length,
    })
    return {
      total: split(filtered),
      grace: split(filtered.filter((a) => a.status === "grace")),
      expired: split(filtered.filter((a) => a.status === "expired")),
    }
  }, [filtered])
  const totalPages = Math.max(1, Math.ceil(sorted.length / itemsPerPage))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * itemsPerPage
  const pageRows = useMemo(() => sorted.slice(start, start + itemsPerPage), [sorted, start, itemsPerPage])

  const cell = (a: ImmigrationAlert, id: AlertColumnId) => {
    switch (id) {
      case "person":
        return <span className="font-semibold text-slate-900">{ALERT_VALUE.person(a)}</span>
      case "status":
        return (
          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium", STATUS_BADGE[a.status])}>
            {ALERT_VALUE.status(a)}
          </span>
        )
      case "days":
        return (
          <span className={cn("tabular-nums font-medium", a.status === "expired" ? "text-red-600" : "text-amber-600")}>
            {ALERT_VALUE.days(a)}
          </span>
        )
      case "expiry":
        return <span className="tabular-nums">{ALERT_VALUE.expiry(a) || "—"}</span>
      default:
        return ALERT_VALUE[id](a) || <span className="text-slate-400">—</span>
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
      <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
        <table className="w-full min-w-[1500px] border-separate border-spacing-0 text-base">
          <thead className="sticky top-0 z-30 bg-white shadow-xs">
            <tr>
              <SortTh tone="blue" id="#" levels={levels} onSort={toggle} className="w-16 text-center">#</SortTh>
              {columns.map((c, i) => (
                <SortTh
                  key={c.id}
                  tone="blue"
                  id={c.id}
                  levels={levels}
                  onSort={toggle}
                  filter={c.filter ? configFor(c.id) : undefined}
                  className={cn("text-left min-w-[140px]", c.id === "person" && "min-w-[220px]", c.id === "document" && "min-w-[240px]", i === columns.length - 1 && "border-r-0")}
                >
                  {c.label}
                </SortTh>
              ))}
            </tr>
            {STATS_ROWS.filter((r) => statsRows.includes(r.key)).map((r) => {
              const s = stats[r.key]
              const cellClass = cn(TH_CLASS, "py-1.5 text-sm font-semibold text-center bg-inherit", r.borderClass)
              return (
                <tr key={r.key} className={r.rowClass}>
                  <th className={cellClass}>{r.label}</th>
                  {identitySpan > 0 && (
                    <th colSpan={identitySpan} className={cellClass}>
                      Principals: {s.principals} | Dependants: {s.dependants}
                    </th>
                  )}
                  {statusSpan > 0 && (
                    <th colSpan={statusSpan} className={cn(cellClass, "tabular-nums border-r-0")}>
                      {s.count}
                    </th>
                  )}
                </tr>
              )
            })}
          </thead>
          <tbody>
            {loading && alerts.length === 0 && <TableLoading cols={columns.length + 1} label="Checking immigration statuses…" />}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="py-16 text-center text-base text-slate-400">
                  {alerts.length === 0 ? "No one is in their grace period or expired." : "Nothing matches these filters."}
                </td>
              </tr>
            )}
            {pageRows.map((a, index) => (
              <tr key={a.key} className={cn("transition-colors", zebraRow(index))}>
                <td className={cn(TD_CLASS, "text-center text-slate-400 tabular-nums")}>{start + index + 1}</td>
                {columns.map((c, i) => (
                  <td key={c.id} className={cn(TD_CLASS, i === columns.length - 1 && "border-r-0")}>
                    {cell(a, c.id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        totalItems={sorted.length}
        itemsPerPage={itemsPerPage}
        currentPage={safePage}
        onPageChange={setPage}
        onItemsPerPageChange={setItemsPerPage}
        sticky={false}
        className="shrink-0 border-t border-slate-200"
      />
    </div>
  )
}
