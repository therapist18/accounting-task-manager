"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { APPROVAL_BADGE, FROM_KRA_BAND, RESPOND_BAND, TRACKING_BAND } from "./chrome"
import { APPROVAL_LABEL, type CaseRow } from "./types"
import { caseMetrics, fmtDate, todayYmd, type CaseMetrics } from "./utils"

// Renders the "KRA CORESPONDENCE PLATFORM" Sheet1 layout: a two-level, colour-banded header
// (From KRA email | When BCL responds to KRA | Tracking), an index column, and click-to-sort
// columns. The three computed columns (days given, days since email, days remaining) are calculated
// from the case dates, so sorting them sorts on the computed value, not a stored one.

const ROW_TINT = {
  overdue: "bg-red-50 hover:bg-red-100",
  pending: "bg-amber-50 hover:bg-amber-100",
  approved: "bg-emerald-50 hover:bg-emerald-100",
  // Rows need a solid background: the sticky columns inherit it, and a transparent one would let
  // scrolled content show through.
  normal: "bg-white hover:bg-slate-50",
}

const th = "px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide border border-slate-200 whitespace-nowrap"
const td = "px-3 py-2.5 text-xs text-slate-700 border border-slate-100 align-top"
const badge = "text-[10px] font-bold whitespace-nowrap border"

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
      className={cn(th, className, "cursor-pointer select-none hover:brightness-95 transition-[filter]")}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <Icon className={cn("h-3 w-3 shrink-0", active ? "opacity-90" : "opacity-30")} />
      </span>
    </th>
  )
}

export function CasesTable({ cases, onOpen }: { cases: CaseRow[]; onOpen: (c: CaseRow) => void }) {
  const today = todayYmd()
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>({ key: "email_date", dir: "desc" })

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
  }

  return (
    <div className="overflow-auto max-h-[calc(100vh-19rem)] rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-[2140px] w-full border-collapse">
        <thead className="sticky top-0 z-10">
          <tr>
            <th rowSpan={2} className={cn(th, "w-11 sticky left-0 z-20 text-center bg-slate-800 text-white")}>#</th>
            <Th id="client" sort={sort} onSort={handleSort} className={cn("min-w-[210px] sticky left-11 z-20 text-left bg-slate-800 text-white")}>
              Client / Ref
            </Th>
            <th colSpan={11} className={cn(th, "text-center", FROM_KRA_BAND.header)}>From KRA email</th>
            <th colSpan={5} className={cn(th, "text-center", RESPOND_BAND.header)}>When BCL responds to KRA</th>
            <th colSpan={3} className={cn(th, "text-center", TRACKING_BAND.header)}>Tracking</th>
          </tr>
          <tr>
            {[
              ["kra_email_from", "KRA email from"], ["kra_email_cc", "KRA email CC to"], ["email_date", "Email date"],
              ["deadline_date", "Deadline date (KRA)"], ["subject", "Subject"], ["contents", "Contents (details)"],
              ["attachments_summary", "Attached (PDF/Excel)"], ["signing_officer_name", "Signing officer name"],
              ["signing_officer_position", "Signing officer position"], ["days_given", "Days given to respond"],
              ["days_since", "Days: email → today"],
            ].map(([id, label]) => (
              <Th key={id} id={id} sort={sort} onSort={handleSort} className="text-slate-600 bg-blue-50">{label}</Th>
            ))}
            {[
              ["respond_date", "Respond date"], ["responded_by_name", "Responded by name"], ["respond_contents", "Respond contents"],
              ["promised_date", "Promised time date"], ["days_remaining", "Days remaining"],
            ].map(([id, label]) => (
              <Th key={id} id={id} sort={sort} onSort={handleSort} className="text-slate-600 bg-emerald-50">{label}</Th>
            ))}
            {[["approval_status", "Approval"], ["assigned_to_name", "Assigned to"], ["status", "Status"]].map(([id, label]) => (
              <Th key={id} id={id} sort={sort} onSort={handleSort} className="text-slate-600 bg-slate-100">{label}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={21} className="py-16 text-center text-sm text-slate-400">
                No KRA cases match these filters.
              </td>
            </tr>
          )}
          {sortedRows.map(({ case: c, metrics: m }, index) => (
            <tr
              key={c.id}
              onClick={() => onOpen(c)}
              className={cn("cursor-pointer transition-colors", ROW_TINT[m.state])}
            >
              <td className={cn(td, "sticky left-0 z-[5] bg-inherit text-center text-slate-400 font-medium tabular-nums")}>
                {index + 1}
              </td>
              <td className={cn(td, "sticky left-11 z-[5] bg-inherit font-semibold text-slate-900")}>
                <div className="leading-snug">{c.company_name ?? <span className="text-red-500 font-normal">Unassigned company</span>}</div>
                <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                  {c.case_ref}{c.kra_pin ? ` · ${c.kra_pin}` : ""}
                </div>
              </td>
              <td className={cn(td, "min-w-[170px] break-all")}>{c.kra_email_from}</td>
              <td className={cn(td, "min-w-[170px] break-all")}>{c.kra_email_cc || "-"}</td>
              <td className={cn(td, "whitespace-nowrap")}>{fmtDate(c.email_date)}</td>
              <td className={cn(td, "whitespace-nowrap font-semibold")}>{fmtDate(c.deadline_date) || <span className="text-slate-300 font-normal">—</span>}</td>
              <td className={cn(td, "min-w-[260px]")}>
                <span className="line-clamp-3" title={c.subject ?? ""}>{c.subject}</span>
              </td>
              <td className={cn(td, "min-w-[280px]")}>
                <span className="line-clamp-3" title={c.contents ?? ""}>{c.contents}</span>
              </td>
              <td className={cn(td, "min-w-[120px]")}>{c.attachments_summary || <span className="text-slate-300">—</span>}</td>
              <td className={cn(td, "min-w-[130px]")}>{c.signing_officer_name}</td>
              <td className={cn(td, "min-w-[160px]")}>{c.signing_officer_position}</td>
              <td className={cn(td, "text-center tabular-nums")}>{m.daysGiven ?? ""}</td>
              <td className={cn(td, "text-center tabular-nums")}>{m.daysSince ?? ""}</td>
              <td className={cn(td, "whitespace-nowrap")}>{fmtDate(c.respond_date)}</td>
              <td className={td}>{c.respond_date ? c.responded_by_name ?? "BCL" : ""}</td>
              <td className={cn(td, "min-w-[280px]")}>
                <span className="line-clamp-3" title={c.respond_contents ?? ""}>{c.respond_contents}</span>
              </td>
              <td className={cn(td, "whitespace-nowrap")}>{fmtDate(c.promised_date)}</td>
              <td
                className={cn(
                  td, "text-center font-bold tabular-nums",
                  m.daysRemaining !== null && m.daysRemaining < 0 && "text-red-600",
                  m.daysRemaining !== null && m.daysRemaining >= 0 && m.daysRemaining <= 7 && "text-amber-600"
                )}
              >
                {m.daysRemaining ?? ""}
              </td>
              <td className={td}>
                <Badge variant="outline" className={cn(badge, APPROVAL_BADGE[c.approval_status])}>
                  {APPROVAL_LABEL[c.approval_status]}
                </Badge>
                {c.approval_date && <div className="text-[10px] text-slate-400 mt-0.5">{fmtDate(c.approval_date)}</div>}
              </td>
              <td className={cn(td, "whitespace-nowrap")}>
                {c.assigned_to_name ?? <span className="text-slate-400">Unassigned</span>}
              </td>
              <td className={cn(td, "whitespace-nowrap")}>
                {c.status === "closed" ? (
                  <>
                    <Badge variant="outline" className={cn(badge, "bg-emerald-50 text-emerald-700 border-emerald-200")}>Completed</Badge>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {c.completed_by_name ?? ""}{c.completed_at ? ` · ${fmtDate(c.completed_at.slice(0, 10))}` : ""}
                    </div>
                  </>
                ) : (
                  <Badge variant="outline" className={cn(badge, "bg-slate-100 text-slate-600 border-slate-200")}>Open</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
