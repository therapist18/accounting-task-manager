"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Pagination } from "./Pagination"
import { APPROVAL_BADGE, APPROVAL_LABEL, FROM_KRA_BAND, RESPOND_BAND, TRACKING_BAND, caseMetrics, fmtDate, todayYmd, type CaseMetrics, type CaseRow } from "./shared"

// Renders the "KRA CORESPONDENCE PLATFORM" Sheet1 layout: a two-level, colour-banded header
// (From KRA email | When BCL responds to KRA | Tracking), an index column, and click-to-sort
// columns. The three computed columns (days given, days since email, days remaining) are calculated
// from the case dates, so sorting them sorts on the computed value, not a stored one.

const ROW_TINT = {
  overdue: "bg-red-50/40 hover:bg-red-100/50",
  pending: "bg-amber-50/40 hover:bg-amber-100/50",
  approved: "bg-emerald-50/40 hover:bg-emerald-100/50",
  normal: "hover:bg-slate-100/70",
}

const th = "px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b border-r border-slate-200/80 whitespace-nowrap"
const td = "px-3 py-2 text-xs text-slate-700 border-b border-r border-slate-200/60 align-top transition-colors"
const badge = "text-[11px] font-semibold whitespace-nowrap border px-2 py-0.5 rounded-full"

interface Row {
  case: CaseRow
  metrics: CaseMetrics
}

type SortDir = "asc" | "desc"

// One accessor per column, used only for sorting — cell rendering below stays hand-written per
// column (badges, clamped text, links) since that isn't worth generalising for ~20 columns.
const SORT_VALUE: Record<string, (r: Row) => string | number> = {
  client: (r) => r.case.company_name ?? "",
  kra_email_from: (r) => r.case.kra_email_from ?? "",
  kra_email_cc: (r) => r.case.kra_email_cc ?? "",
  email_date: (r) => r.case.email_date ?? "",
  deadline_date: (r) => r.case.deadline_date ?? "",
  subject: (r) => r.case.subject ?? "",
  contents: (r) => r.case.contents ?? "",
  attachments_summary: (r) => r.case.attachments_summary ?? "",
  signing_officer_name: (r) => r.case.signing_officer_name ?? "",
  signing_officer_position: (r) => r.case.signing_officer_position ?? "",
  days_given: (r) => r.metrics.daysGiven ?? -Infinity,
  days_since: (r) => r.metrics.daysSince ?? -Infinity,
  respond_date: (r) => r.case.respond_date ?? "",
  responded_by_name: (r) => r.case.responded_by_name ?? "",
  respond_contents: (r) => r.case.respond_contents ?? "",
  promised_date: (r) => r.case.promised_date ?? "",
  days_remaining: (r) => r.metrics.daysRemaining ?? Infinity,
  approval_status: (r) => r.case.approval_status,
  assigned_to_name: (r) => r.case.assigned_to_name ?? "",
  status: (r) => r.case.status,
}

function Th({
  id, children, className, sort, onSort,
}: {
  id: string
  children: React.ReactNode
  className?: string
  sort: { key: string; dir: SortDir } | null
  onSort: (id: string) => void
}) {
  const active = sort?.key === id
  const Icon = active ? (sort!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th
      onClick={() => onSort(id)}
      className={cn(th, className, "cursor-pointer select-none transition-colors group")}
    >
      <div className="inline-flex items-center gap-1.5 justify-between w-full">
        <span>{children}</span>
        <Icon className={cn("h-3 w-3 shrink-0 transition-opacity", active ? "opacity-100 text-foreground" : "opacity-35 group-hover:opacity-75")} />
      </div>
    </th>
  )
}

export function CasesTable({ cases, onOpen }: { cases: CaseRow[]; onOpen: (c: CaseRow) => void }) {
  const today = todayYmd()
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>({ key: "email_date", dir: "desc" })
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [page, setPage] = useState(0)

  const rows: Row[] = useMemo(
    () => cases.map((c) => ({ case: c, metrics: caseMetrics(c, today) })),
    [cases, today]
  )

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const accessor = SORT_VALUE[sort.key]
    if (!accessor) return rows
    const dir = sort.dir === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = accessor(a), bv = accessor(b)
      if (av < bv) return -dir
      if (av > bv) return dir
      return 0
    })
  }, [rows, sort])

  const handleSort = (id: string) => {
    if (!SORT_VALUE[id]) return
    setSort((cur) => (cur?.key === id ? { key: id, dir: cur.dir === "asc" ? "desc" : "asc" } : { key: id, dir: "asc" }))
    setPage(0)
  }

  useEffect(() => setPage(0), [cases, itemsPerPage, rows])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / itemsPerPage))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * itemsPerPage
  const visibleRows = sortedRows.slice(start, start + itemsPerPage)

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-auto flex-1 min-h-0 max-h-[calc(100vh-19rem)]">
        <table className="min-w-[2140px] w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-30 bg-white shadow-xs">
            <tr>
              <th rowSpan={2} className={cn(th, "w-11 sticky left-0 z-40 text-center bg-slate-800 text-white font-semibold border-b border-r border-slate-700")}>#</th>
              <Th id="client" sort={sort} onSort={handleSort} className={cn("min-w-[210px] sticky left-11 z-40 text-left bg-slate-800 text-white font-semibold border-b border-r-2 border-slate-600")}>
                Client / Ref
              </Th>
              <th colSpan={11} className="py-2 px-3 text-center bg-[#376bae] text-white font-bold text-xs uppercase tracking-wider border-b border-r border-white/20">From KRA email</th>
              <th colSpan={5} className="py-2 px-3 text-center bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider border-b border-r border-white/20">When BCL responds to KRA</th>
              <th colSpan={3} className="py-2 px-3 text-center bg-slate-700 text-white font-bold text-xs uppercase tracking-wider border-b border-white/20">Tracking</th>
            </tr>
            <tr>
              {[
                ["kra_email_from", "KRA email from"], ["kra_email_cc", "KRA email CC to"], ["email_date", "Email date"],
                ["deadline_date", "Deadline date (KRA)"], ["subject", "Subject"], ["contents", "Contents (details)"],
                ["attachments_summary", "Attached (PDF/Excel)"], ["signing_officer_name", "Signing officer name"],
                ["signing_officer_position", "Signing officer position"], ["days_given", "Days given to respond"],
                ["days_since", "Days: email → today"],
              ].map(([id, label]) => (
                <Th key={id} id={id} sort={sort} onSort={handleSort} className="text-slate-700 bg-blue-50/70 hover:bg-blue-100/60 font-semibold">{label}</Th>
              ))}
              {[
                ["respond_date", "Respond date"], ["responded_by_name", "Responded by name"], ["respond_contents", "Respond contents"],
                ["promised_date", "Promised time date"], ["days_remaining", "Days remaining"],
              ].map(([id, label]) => (
                <Th key={id} id={id} sort={sort} onSort={handleSort} className="text-slate-700 bg-emerald-50/70 hover:bg-emerald-100/60 font-semibold">{label}</Th>
              ))}
              {[["approval_status", "Approval"], ["assigned_to_name", "Assigned to"], ["status", "Status"]].map(([id, label]) => (
                <Th key={id} id={id} sort={sort} onSort={handleSort} className="text-slate-700 bg-slate-100/80 hover:bg-slate-200/70 font-semibold">{label}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={21} className="py-16 text-center text-sm text-slate-400">
                  No KRA cases match these filters.
                </td>
              </tr>
            )}
            {visibleRows.map(({ case: c, metrics: m }, index) => {
              const isEven = index % 2 === 0
              const rowClass = m.state !== "normal"
                ? ROW_TINT[m.state]
                : (isEven ? "bg-white" : "bg-slate-50/40") + " " + ROW_TINT.normal

              return (
                <tr
                  key={c.id}
                  onClick={() => onOpen(c)}
                  className={cn("cursor-pointer transition-colors group", rowClass)}
                >
                  <td className={cn(td, "sticky left-0 z-20 bg-inherit text-center text-slate-400 font-medium tabular-nums border-r border-slate-200")}>
                    {start + index + 1}
                  </td>
                  <td className={cn(td, "sticky left-11 z-20 bg-inherit font-semibold text-slate-900 border-r-2 border-slate-300")}>
                    <div className="leading-snug text-slate-900 font-medium">{c.company_name ?? <span className="text-red-500 font-normal">Unassigned company</span>}</div>
                    <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                      {c.case_ref}{c.kra_pin ? ` · ${c.kra_pin}` : ""}
                    </div>
                  </td>
                  <td className={cn(td, "min-w-[170px] break-all")}>{c.kra_email_from}</td>
                  <td className={cn(td, "min-w-[170px] break-all text-slate-500")}>{c.kra_email_cc || "—"}</td>
                  <td className={cn(td, "whitespace-nowrap tabular-nums")}>{fmtDate(c.email_date)}</td>
                  <td className={cn(td, "whitespace-nowrap font-semibold tabular-nums")}>{fmtDate(c.deadline_date) || <span className="text-slate-300 font-normal">—</span>}</td>
                  <td className={cn(td, "min-w-[260px]")}>
                    <span className="line-clamp-2 leading-relaxed text-slate-800" title={c.subject ?? ""}>{c.subject}</span>
                  </td>
                  <td className={cn(td, "min-w-[280px]")}>
                    <span className="line-clamp-2 leading-relaxed text-slate-600" title={c.contents ?? ""}>{c.contents}</span>
                  </td>
                  <td className={cn(td, "min-w-[120px] text-slate-600")}>{c.attachments_summary || <span className="text-slate-300">—</span>}</td>
                  <td className={cn(td, "min-w-[130px] font-medium text-slate-800")}>{c.signing_officer_name || "—"}</td>
                  <td className={cn(td, "min-w-[160px] text-slate-600")}>{c.signing_officer_position || "—"}</td>
                  <td className={cn(td, "text-center tabular-nums font-medium text-slate-700")}>{m.daysGiven ?? "—"}</td>
                  <td className={cn(td, "text-center tabular-nums font-medium text-slate-700")}>{m.daysSince ?? "—"}</td>
                  <td className={cn(td, "whitespace-nowrap tabular-nums")}>{fmtDate(c.respond_date) || "—"}</td>
                  <td className={cn(td, "text-slate-700")}>{c.respond_date ? c.responded_by_name ?? "BCL" : "—"}</td>
                  <td className={cn(td, "min-w-[280px]")}>
                    <span className="line-clamp-2 leading-relaxed text-slate-600" title={c.respond_contents ?? ""}>{c.respond_contents || "—"}</span>
                  </td>
                  <td className={cn(td, "whitespace-nowrap tabular-nums")}>{fmtDate(c.promised_date) || "—"}</td>
                  <td
                    className={cn(
                      td, "text-center font-bold tabular-nums",
                      m.daysRemaining !== null && m.daysRemaining < 0 && "text-red-600",
                      m.daysRemaining !== null && m.daysRemaining >= 0 && m.daysRemaining <= 7 && "text-amber-600",
                      m.daysRemaining !== null && m.daysRemaining > 7 && "text-emerald-600"
                    )}
                  >
                    {m.daysRemaining ?? "—"}
                  </td>
                  <td className={td}>
                    <Badge variant="outline" className={cn(badge, APPROVAL_BADGE[c.approval_status])}>
                      {APPROVAL_LABEL[c.approval_status]}
                    </Badge>
                    {c.approval_date && <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{fmtDate(c.approval_date)}</div>}
                  </td>
                  <td className={cn(td, "whitespace-nowrap")}>
                    {c.assigned_to_name ? (
                      <span className="font-medium text-slate-800">{c.assigned_to_name}</span>
                    ) : (
                      <span className="text-slate-400">Unassigned</span>
                    )}
                  </td>
                  <td className={cn(td, "whitespace-nowrap")}>
                    {c.status === "closed" ? (
                      <>
                        <Badge variant="outline" className={cn(badge, "bg-emerald-50 text-emerald-700 border-emerald-200")}>Completed</Badge>
                        <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                          {c.completed_by_name ?? ""}{c.completed_at ? ` · ${fmtDate(c.completed_at.slice(0, 10))}` : ""}
                        </div>
                      </>
                    ) : (
                      <Badge variant="outline" className={cn(badge, "bg-slate-100 text-slate-600 border-slate-200")}>Open</Badge>
                    )}
                  </td>
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
