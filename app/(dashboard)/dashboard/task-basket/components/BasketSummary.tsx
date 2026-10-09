"use client"

import { useMemo } from "react"
import { FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  TASK_BASKET_MODULE_LABELS,
  TASK_BASKET_STATUS_LABELS,
  outstandingLines,
  type TaskBasketItem,
  type TaskBasketModule,
} from "@/lib/supabase/taskBasket"

// The basket as a dashboard: totals across everything currently shown, then one row per company with
// each module's state, what is outstanding, and its deadline — and a Report button per company (and
// one for everyone) that opens the download / send dialog.

const MODULES: TaskBasketModule[] = ["bank_statements", "file_management", "tax_receipts"]

const STATUS_TONE: Record<string, string> = {
  open: "border-amber-300 bg-amber-50 text-amber-700",
  received_late: "border-sky-300 bg-sky-50 text-sky-700",
  resolved: "border-emerald-300 bg-emerald-50 text-emerald-700",
}

const fmtDate = (ymd: string | null) =>
  ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : null

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("text-2xl font-bold tabular-nums", tone)}>{value}</div>
    </div>
  )
}

export default function BasketSummary({
  items,
  onReport,
}: {
  items: TaskBasketItem[]
  /** null = the overall report; otherwise that company's items. */
  onReport: (companyId: number | null) => void
}) {
  const companies = useMemo(() => {
    const byCompany = new Map<number, { id: number; name: string; items: TaskBasketItem[] }>()
    for (const item of items) {
      const entry = byCompany.get(item.company_id) || { id: item.company_id, name: item.company_name, items: [] }
      entry.items.push(item)
      byCompany.set(item.company_id, entry)
    }
    return [...byCompany.values()].sort((a, b) => {
      const openDiff = b.items.filter((i) => i.status === "open").length - a.items.filter((i) => i.status === "open").length
      return openDiff || a.name.localeCompare(b.name)
    })
  }, [items])

  const totals = useMemo(() => ({
    companies: companies.filter((c) => c.items.some((i) => i.status === "open")).length,
    open: items.filter((i) => i.status === "open").length,
    late: items.filter((i) => i.status === "received_late").length,
    resolved: items.filter((i) => i.status === "resolved").length,
    byModule: MODULES.map((m) => ({ module: m, open: items.filter((i) => i.module === m && i.status === "open").length })),
  }), [companies, items])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-slate-200 bg-slate-50/60 p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Companies with open items" value={totals.companies} tone="text-slate-900" />
          <Stat label="Open items" value={totals.open} tone="text-amber-600" />
          <Stat label="Received late" value={totals.late} tone="text-sky-700" />
          <Stat label="Resolved" value={totals.resolved} tone="text-emerald-700" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          {totals.byModule.map(({ module, open }) => (
            <span key={module} className="rounded-full border border-slate-200 bg-white px-3 py-1">
              {TASK_BASKET_MODULE_LABELS[module]}: <strong className="text-slate-900">{open}</strong> open
            </span>
          ))}
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => onReport(null)} disabled={!items.length}>
            <FileText className="mr-1 h-4 w-4" /> Overall report
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-custom-blue text-white">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Company</th>
              {MODULES.map((m) => (
                <th key={m} className="px-3 py-2 text-left font-semibold">{TASK_BASKET_MODULE_LABELS[m]}</th>
              ))}
              <th className="px-3 py-2 text-right font-semibold">Report</th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr><td colSpan={MODULES.length + 2} className="py-10 text-center text-slate-400">Nothing in the basket for this filter.</td></tr>
            )}
            {companies.map((company, index) => (
              <tr key={company.id} className={cn("align-top", index % 2 ? "bg-slate-50/60" : "bg-white")}>
                <td className="border-t border-slate-100 px-3 py-2 font-semibold text-slate-800">
                  {company.name}
                  <div className="text-xs font-normal text-slate-400">#{company.id}</div>
                </td>
                {MODULES.map((m) => {
                  const moduleItems = company.items.filter((i) => i.module === m)
                  return (
                    <td key={m} className="border-t border-slate-100 px-3 py-2">
                      {moduleItems.length === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : moduleItems.map((item) => (
                        <div key={item.id} className="mb-1.5 last:mb-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className={STATUS_TONE[item.status]}>{TASK_BASKET_STATUS_LABELS[item.status]}</Badge>
                            <span className="text-xs text-slate-500">
                              {item.cycle_month}{fmtDate(item.deadline) ? ` · due ${fmtDate(item.deadline)}` : ""}
                            </span>
                            {item.has_comments && <span className="text-xs text-violet-700">· comments</span>}
                          </div>
                          {item.status === "open" && (
                            <ul className="mt-0.5 space-y-0.5 text-xs text-slate-600">
                              {(outstandingLines(item).length ? outstandingLines(item) : [item.reason]).map((line, i) => (
                                <li key={i}>{line}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </td>
                  )
                })}
                <td className="border-t border-slate-100 px-3 py-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => onReport(company.id)}>
                    <FileText className="mr-1 h-4 w-4" /> Report
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
