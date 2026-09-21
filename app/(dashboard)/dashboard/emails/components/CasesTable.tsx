"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { APPROVAL_LABEL, type CaseRow } from "./types"
import { caseMetrics, fmtDate, todayYmd } from "./utils"

// Renders the "KRA CORESPONDENCE PLATFORM" Sheet1 layout: a two-level header
// (CLIENT / REF | FROM KRA EMAIL | WHEN BCL RESPONDS TO KRA) with the three computed columns
// (days given, days since email, days remaining) calculated from the case dates.

const ROW_TINT = {
  overdue: "bg-red-50 hover:bg-red-100",
  pending: "bg-amber-50 hover:bg-amber-100",
  approved: "bg-emerald-50 hover:bg-emerald-100",
  // Rows need a solid background: the sticky first column inherits it, and a transparent one would
  // let scrolled content show through.
  normal: "bg-white hover:bg-slate-50",
}

const APPROVAL_TINT: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
  not_responded: "bg-slate-100 text-slate-600",
  not_applicable: "bg-slate-100 text-slate-500",
}

const th = "px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600 border border-slate-200 bg-slate-50 whitespace-nowrap"
const td = "px-2 py-2 text-xs text-slate-700 border border-slate-100 align-top"

export function CasesTable({ cases, onOpen }: { cases: CaseRow[]; onOpen: (c: CaseRow) => void }) {
  const today = todayYmd()

  return (
    <div className="overflow-auto max-h-[calc(100vh-18rem)] rounded-lg border border-slate-200 bg-white">
      <table className="min-w-[2100px] w-full border-collapse">
        <thead className="sticky top-0 z-10">
          <tr>
            <th rowSpan={2} className={cn(th, "min-w-[210px] sticky left-0 z-20 text-left")}>Client / Ref</th>
            <th colSpan={11} className={cn(th, "text-center bg-blue-50 text-blue-800")}>From KRA email</th>
            <th colSpan={5} className={cn(th, "text-center bg-emerald-50 text-emerald-800")}>When BCL responds to KRA</th>
            <th colSpan={3} className={cn(th, "text-center bg-slate-100")}>Tracking</th>
          </tr>
          <tr>
            {[
              "KRA email from", "KRA email CC to", "Email date", "Deadline date (KRA)", "Subject",
              "Contents (details)", "Attached (PDF/Excel)", "Signing officer name", "Signing officer position",
              "No. of days given to respond", "Days: KRA email date → today",
            ].map((h) => <th key={h} className={cn(th, "bg-blue-50/60")}>{h}</th>)}
            {["Respond date", "Responded by name", "Respond contents", "Promised time date", "Days remaining to promised time"].map(
              (h) => <th key={h} className={cn(th, "bg-emerald-50/60")}>{h}</th>
            )}
            <th className={th}>Approval</th>
            <th className={th}>Assigned to</th>
            <th className={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {cases.length === 0 && (
            <tr>
              <td colSpan={20} className="py-16 text-center text-sm text-slate-400">
                No KRA cases match these filters.
              </td>
            </tr>
          )}
          {cases.map((c) => {
            const m = caseMetrics(c, today)
            return (
              <tr
                key={c.id}
                onClick={() => onOpen(c)}
                className={cn("cursor-pointer transition-colors", ROW_TINT[m.state])}
              >
                <td className={cn(td, "sticky left-0 z-[5] bg-inherit font-medium text-slate-900")}>
                  <div className="leading-snug">{c.company_name ?? <span className="text-red-500">Unassigned company</span>}</div>
                  <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                    {c.case_ref}{c.kra_pin ? ` · ${c.kra_pin}` : ""}
                  </div>
                </td>
                <td className={cn(td, "min-w-[170px] break-all")}>{c.kra_email_from}</td>
                <td className={cn(td, "min-w-[170px] break-all")}>{c.kra_email_cc || "-"}</td>
                <td className={cn(td, "whitespace-nowrap")}>{fmtDate(c.email_date)}</td>
                <td className={cn(td, "whitespace-nowrap font-medium")}>{fmtDate(c.deadline_date) || <span className="text-slate-300">—</span>}</td>
                <td className={cn(td, "min-w-[260px]")}>
                  <span className="line-clamp-3" title={c.subject ?? ""}>{c.subject}</span>
                </td>
                <td className={cn(td, "min-w-[280px]")}>
                  <span className="line-clamp-3" title={c.contents ?? ""}>{c.contents}</span>
                </td>
                <td className={cn(td, "min-w-[120px]")}>{c.attachments_summary || <span className="text-slate-300">—</span>}</td>
                <td className={cn(td, "min-w-[130px]")}>{c.signing_officer_name}</td>
                <td className={cn(td, "min-w-[160px]")}>{c.signing_officer_position}</td>
                <td className={cn(td, "text-center")}>{m.daysGiven ?? ""}</td>
                <td className={cn(td, "text-center")}>{m.daysSince ?? ""}</td>
                <td className={cn(td, "whitespace-nowrap")}>{fmtDate(c.respond_date)}</td>
                <td className={td}>{c.respond_date ? c.responded_by_name ?? "BCL" : ""}</td>
                <td className={cn(td, "min-w-[280px]")}>
                  <span className="line-clamp-3" title={c.respond_contents ?? ""}>{c.respond_contents}</span>
                </td>
                <td className={cn(td, "whitespace-nowrap")}>{fmtDate(c.promised_date)}</td>
                <td
                  className={cn(
                    td, "text-center font-semibold",
                    m.daysRemaining !== null && m.daysRemaining < 0 && "text-red-600",
                    m.daysRemaining !== null && m.daysRemaining >= 0 && m.daysRemaining <= 7 && "text-amber-600"
                  )}
                >
                  {m.daysRemaining ?? ""}
                </td>
                <td className={td}>
                  <Badge variant="secondary" className={cn("text-[10px] font-medium whitespace-nowrap", APPROVAL_TINT[c.approval_status])}>
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
                      <span className="text-emerald-700 font-medium">Completed</span>
                      <div className="text-[10px] text-slate-400">
                        {c.completed_by_name ?? ""}{c.completed_at ? ` · ${fmtDate(c.completed_at.slice(0, 10))}` : ""}
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-500">Open</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
