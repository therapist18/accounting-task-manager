"use client"

import { useEffect, useState } from "react"
import { Paperclip, Inbox, CornerUpLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Pagination } from "./Pagination"
import { HEAD_BLUE, SkeletonRows, SortTh, TD_CLASS, TH_CLASS, useSortedRows, zebraRow } from "./table"
import { DISPOSITION_BADGE, DISPOSITION_LABEL, fmtDateTime, type CategoryOption, type Disposition, type EmailRow } from "./shared"

// The email tabs (Needs Review / Update / Ignored): one sortable, bordered, zebra-striped table with
// pagination — the same table language as the cases table and the Individual Document Manager.

const SORT_VALUE: Record<string, (e: EmailRow) => string | number> = {
  company: (e) => e.company_name ?? "",
  from: (e) => e.sender_name || e.sender_email,
  subject: (e) => e.subject ?? "",
  summary: (e) => e.ai_summary || e.snippet || "",
  received: (e) => e.received_at,
  category: (e) => e.category_key ?? "",
  status: (e) => e.disposition ?? "",
  case: (e) => (e.case_id ? 1 : 0),
}

export function EmailsTable({
  emails,
  categories,
  onOpen,
  onQuickClassify,
  showTime,
  loading = false,
  emptyMessage = "Nothing needs review right now.",
  embedded = false,
}: {
  emails: EmailRow[]
  categories: CategoryOption[]
  onOpen: (e: EmailRow) => void
  onQuickClassify: (e: EmailRow, d: Disposition) => void
  showTime: boolean
  loading?: boolean
  emptyMessage?: string
  embedded?: boolean
}) {
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [page, setPage] = useState(0)
  const { sort, sorted, toggle } = useSortedRows(emails, SORT_VALUE, { key: "received", dir: "desc" })

  useEffect(() => setPage(0), [emails, itemsPerPage])

  const totalPages = Math.max(1, Math.ceil(sorted.length / itemsPerPage))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * itemsPerPage
  const visible = sorted.slice(start, start + itemsPerPage)

  const byKey = new Map(categories.map((c) => [c.key, c]))
  const showActions = emails.some((e) => e.disposition === "needs_review")
  const colCount = showActions ? 10 : 9

  return (
    <div className={cn(
      "flex flex-col flex-1 min-h-0 bg-white overflow-hidden",
      !embedded && "rounded-xl border border-slate-200 shadow-sm"
    )}>
      <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
        <table className="min-w-[1500px] w-full border-separate border-spacing-0 text-base">
          <thead className="sticky top-0 z-30 bg-white shadow-xs">
            <tr>
              <th className={cn(TH_CLASS, HEAD_BLUE, "w-11 sticky left-0 z-40 text-center")}>#</th>
              <SortTh tone="blue" id="company" sort={sort} onSort={toggle} className="min-w-[210px] sticky left-11 z-40 text-left border-r-2">Company</SortTh>
              <SortTh tone="blue" id="from" sort={sort} onSort={toggle} className="min-w-[200px]">From</SortTh>
              <SortTh tone="blue" id="subject" sort={sort} onSort={toggle} className="min-w-[280px]">Subject</SortTh>
              <SortTh tone="blue" id="summary" sort={sort} onSort={toggle} className="min-w-[300px]">Summary</SortTh>
              <SortTh tone="blue" id="received" sort={sort} onSort={toggle} className="min-w-[130px]">Received</SortTh>
              <SortTh tone="blue" id="category" sort={sort} onSort={toggle} className="min-w-[140px]">Category</SortTh>
              <SortTh tone="blue" id="status" sort={sort} onSort={toggle} className="min-w-[130px]">Status</SortTh>
              <SortTh tone="blue" id="case" sort={sort} onSort={toggle} className="min-w-[90px]">Case</SortTh>
              {showActions && <th className={cn(TH_CLASS, HEAD_BLUE, "min-w-[200px] text-left")}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <SkeletonRows cols={colCount} />}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-20 text-center text-base text-slate-400">
                  <Inbox className="w-11 h-11 text-slate-300 mx-auto mb-2" />
                  {emptyMessage}
                </td>
              </tr>
            )}
            {visible.map((e, index) => {
              const cat = e.category_key ? byKey.get(e.category_key) : null
              const isUnread = !e.is_read
              return (
                <tr key={e.id} onClick={() => onOpen(e)} className={cn("cursor-pointer transition-colors", zebraRow(index))}>
                  <td className={cn(TD_CLASS, "sticky left-0 z-20 bg-inherit text-center text-slate-400 font-medium tabular-nums border-r border-slate-200", isUnread && "border-l-4 border-l-custom-blue")}>
                    {start + index + 1}
                  </td>
                  <td className={cn(TD_CLASS, "sticky left-11 z-20 bg-inherit border-r-2 border-slate-300")}>
                    <div className={cn("leading-snug", isUnread ? "font-bold text-slate-900" : "font-semibold text-slate-900")}>
                      {e.company_name ?? <span className="text-red-500 font-normal">Unassigned company</span>}
                    </div>
                    {e.kra_pin && <div className="text-sm text-slate-500 mt-1">{e.kra_pin}</div>}
                  </td>
                  <td className={cn(TD_CLASS, "break-all")}>
                    <div className="flex items-start gap-1.5">
                      {e.direction === "outbound" && <CornerUpLeft className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-slate-800">{e.sender_name || e.sender_email}</div>
                        {e.sender_name && <div className="text-sm text-slate-500 mt-0.5">{e.sender_email}</div>}
                      </div>
                    </div>
                  </td>
                  <td className={TD_CLASS}>
                    <div className="flex items-start gap-1.5">
                      <span className={cn("line-clamp-2 leading-snug", isUnread ? "font-bold text-slate-900" : "font-medium text-slate-900")} title={e.subject}>
                        {e.subject || "(no subject)"}
                      </span>
                      {e.has_attachments && <Paperclip className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />}
                    </div>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="line-clamp-2 leading-snug text-slate-600" title={e.ai_summary || e.snippet || ""}>{e.ai_summary || e.snippet || "—"}</span>
                    {e.disposition === "needs_review" && e.review_reason && (
                      <div className="text-sm text-amber-700 font-medium mt-1">{e.review_reason}</div>
                    )}
                  </td>
                  <td className={cn(TD_CLASS, "whitespace-nowrap tabular-nums")}>{fmtDateTime(e.received_at, showTime)}</td>
                  <td className={TD_CLASS}>
                    {cat ? (
                      <span
                        className="text-sm font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap"
                        style={{ background: `${cat.color ?? "#6b7280"}14`, color: cat.color ?? "#6b7280", borderColor: `${cat.color ?? "#6b7280"}33` }}
                      >
                        {cat.name}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className={cn(TD_CLASS, "whitespace-nowrap")}>
                    {e.disposition ? (
                      <span className={cn("text-sm font-semibold px-2.5 py-0.5 rounded-full border", DISPOSITION_BADGE[e.disposition])}>
                        {DISPOSITION_LABEL[e.disposition]}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                    {e.classification_source && e.category_confidence !== null && (
                      <div className="text-sm text-slate-400 mt-1">{e.classification_source} · {Math.round(e.category_confidence * 100)}%</div>
                    )}
                  </td>
                  <td className={cn(TD_CLASS, "whitespace-nowrap")}>
                    {e.case_id ? <span className="text-sm font-semibold text-emerald-600">● In a case</span> : <span className="text-slate-300">—</span>}
                  </td>
                  {showActions && (
                    <td className={TD_CLASS} onClick={(ev) => ev.stopPropagation()}>
                      {e.disposition === "needs_review" ? (
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" className="h-8 px-2.5 rounded-md text-base font-medium border-slate-200 bg-white hover:bg-slate-100" onClick={() => onQuickClassify(e, "action_required")}>Action</Button>
                          <Button size="sm" variant="outline" className="h-8 px-2.5 rounded-md text-base font-medium border-slate-200 bg-white hover:bg-slate-100" onClick={() => onQuickClassify(e, "update_only")}>Update</Button>
                          <Button size="sm" variant="ghost" className="h-8 px-2.5 rounded-md text-base font-medium text-slate-500 hover:text-slate-800" onClick={() => onQuickClassify(e, "ignore")}>Ignore</Button>
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        totalItems={sorted.length}
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
