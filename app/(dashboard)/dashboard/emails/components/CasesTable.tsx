"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Pagination } from "./Pagination"
import { SkeletonRows, SortTh, TD_CLASS, TH_CLASS, useSortedRows, zebraRow } from "./table"
import { APPROVAL_BADGE, APPROVAL_LABEL, caseMetrics, fmtDate, fmtDateTime, todayYmd, type CaseMetrics, type CaseRow } from "./shared"

// Renders the "KRA CORESPONDENCE PLATFORM" Sheet1 layout: a two-level, colour-banded header
// (From KRA email | When BCL responds to KRA | Tracking), an index column, and click-to-sort
// columns. The three computed columns (days given, days since email, days remaining) are calculated
// from the case dates, so sorting them sorts on the computed value, not a stored one.

const ROW_TINT = {
  overdue: "bg-red-50 hover:bg-red-100",
  pending: "bg-amber-50 hover:bg-amber-100",
  approved: "bg-emerald-50 hover:bg-emerald-100",
  normal: "",
}

const th = TH_CLASS
const td = TD_CLASS
const badge = "text-sm font-semibold whitespace-nowrap border px-2.5 py-0.5 rounded-full"

interface Row {
  case: CaseRow
  metrics: CaseMetrics
}

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

export function CasesTable({
  cases, onOpen, showTime, embedded = false, loading = false,
}: {
  cases: CaseRow[]
  onOpen: (c: CaseRow) => void
  showTime: boolean
  embedded?: boolean
  loading?: boolean
}) {
  const today = todayYmd()
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [page, setPage] = useState(0)

  const rows: Row[] = useMemo(
    () => cases.map((c) => ({ case: c, metrics: caseMetrics(c, today) })),
    [cases, today]
  )

  const { sort, sorted: sortedRows, toggle: handleSort } = useSortedRows(rows, SORT_VALUE, { key: "email_date", dir: "desc" })

  useEffect(() => setPage(0), [cases, itemsPerPage, rows, sort])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / itemsPerPage))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * itemsPerPage
  const visibleRows = sortedRows.slice(start, start + itemsPerPage)

  return (
    <div className={cn("flex flex-col flex-1 min-h-0 bg-white overflow-hidden", !embedded && "rounded-xl border border-slate-200 shadow-sm")}>
      <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
        <table className="min-w-[2300px] w-full border-separate border-spacing-0 text-base">
          <thead className="sticky top-0 z-30 bg-white shadow-xs">
            <tr>
              <th rowSpan={2} className={cn(th, "w-11 sticky left-0 z-40 text-center bg-[#376bae] text-white border-white/20")}>#</th>
              <SortTh id="client" rowSpan={2} sort={sort} onSort={handleSort} className="min-w-[220px] sticky left-11 z-40 text-left bg-[#376bae] hover:bg-[#376bae]/90 text-white border-white/20 border-r-2">
                Client / Ref
              </SortTh>
              <th colSpan={11} className="py-2 px-3 text-center bg-[#376bae] text-white font-semibold text-base border-b border-r border-white/20">From KRA email</th>
              <th colSpan={5} className="py-2 px-3 text-center bg-emerald-600 text-white font-semibold text-base border-b border-r border-white/20">When BCL responds to KRA</th>
              <th colSpan={3} className="py-2 px-3 text-center bg-slate-600 text-white font-semibold text-base border-b border-white/20">Tracking</th>
            </tr>
            <tr>
              {[
                ["kra_email_from", "KRA email from"], ["kra_email_cc", "KRA email CC to"], ["email_date", "Email date"],
                ["deadline_date", "Deadline date (KRA)"], ["subject", "Subject"], ["contents", "Contents (details)"],
                ["attachments_summary", "Attached (PDF/Excel)"], ["signing_officer_name", "Signing officer name"],
                ["signing_officer_position", "Signing officer position"], ["days_given", "Days given to respond"],
                ["days_since", "Days: email → today"],
              ].map(([id, label]) => (
                <SortTh key={id} id={id} sort={sort} onSort={handleSort} className="text-slate-800 bg-blue-50 hover:bg-blue-100/70">{label}</SortTh>
              ))}
              {[
                ["respond_date", "Respond date"], ["responded_by_name", "Responded by name"], ["respond_contents", "Respond contents"],
                ["promised_date", "Promised time date"], ["days_remaining", "Days remaining"],
              ].map(([id, label]) => (
                <SortTh key={id} id={id} sort={sort} onSort={handleSort} className="text-slate-800 bg-emerald-50 hover:bg-emerald-100/70">{label}</SortTh>
              ))}
              {[["approval_status", "Approval"], ["assigned_to_name", "Assigned to"], ["status", "Status"]].map(([id, label]) => (
                <SortTh key={id} id={id} sort={sort} onSort={handleSort} className="text-slate-800 bg-slate-100 hover:bg-slate-200/70">{label}</SortTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <SkeletonRows cols={21} />}
            {!loading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={21} className="py-20 text-center text-base text-slate-400">
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
                  <td className={cn(td, "sticky left-11 z-20 bg-inherit font-semibold text-slate-900 border-r-2 border-slate-300")}>
                    <div className="leading-snug text-slate-900 font-semibold">{c.company_name ?? <span className="text-red-500 font-normal">Unassigned company</span>}</div>
                    <div className="text-sm font-normal text-slate-500 mt-1">
                      {c.case_ref}{c.kra_pin ? ` · ${c.kra_pin}` : ""}
                    </div>
                  </td>
                  <td className={cn(td, "min-w-[190px] break-all text-sm text-slate-600")}>{c.kra_email_from}</td>
                  <td className={cn(td, "min-w-[190px] break-all text-sm text-slate-500")}>{c.kra_email_cc || "—"}</td>
                  <td className={cn(td, "whitespace-nowrap tabular-nums")}>{fmtDate(c.email_date)}</td>
                  <td className={cn(td, "whitespace-nowrap font-semibold tabular-nums")}>{fmtDate(c.deadline_date) || <span className="text-slate-300 font-normal">—</span>}</td>
                  <td className={cn(td, "min-w-[260px]")}>
                    <span className="line-clamp-2 leading-snug font-medium text-slate-900" title={c.subject ?? ""}>{c.subject}</span>
                  </td>
                  <td className={cn(td, "min-w-[280px]")}>
                    <span className="line-clamp-2 leading-snug text-slate-600" title={c.contents ?? ""}>{c.contents}</span>
                  </td>
                  <td className={cn(td, "min-w-[130px] text-sm text-slate-600")}>{c.attachments_summary || <span className="text-slate-300">—</span>}</td>
                  <td className={cn(td, "min-w-[130px] font-medium text-slate-800")}>{c.signing_officer_name || "—"}</td>
                  <td className={cn(td, "min-w-[170px] text-sm text-slate-600")}>{c.signing_officer_position || "—"}</td>
                  <td className={cn(td, "text-center tabular-nums font-medium text-slate-700")}>{m.daysGiven ?? "—"}</td>
                  <td className={cn(td, "text-center tabular-nums font-medium text-slate-700")}>{m.daysSince ?? "—"}</td>
                  <td className={cn(td, "whitespace-nowrap tabular-nums")}>{fmtDate(c.respond_date) || "—"}</td>
                  <td className={cn(td, "text-slate-700")}>{c.respond_date ? c.responded_by_name ?? "BCL" : "—"}</td>
                  <td className={cn(td, "min-w-[280px]")}>
                    <span className="line-clamp-2 leading-snug text-slate-600" title={c.respond_contents ?? ""}>{c.respond_contents || "—"}</span>
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
                    {c.approval_date && <div className="text-sm text-slate-400 mt-0.5 tabular-nums">{fmtDate(c.approval_date)}</div>}
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
                        <div className="text-sm text-slate-400 mt-0.5 tabular-nums">
                          {c.completed_by_name ?? ""}{c.completed_at ? ` · ${fmtDateTime(c.completed_at, showTime)}` : ""}
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
