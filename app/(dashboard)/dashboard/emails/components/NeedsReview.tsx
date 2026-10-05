"use client"

import { useEffect, useMemo, useState } from "react"
import { Paperclip, Inbox, CornerUpLeft, FlaskConical, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Pagination } from "./Pagination"
import { RuleTesterDialog } from "./RuleTesterDialog"
import {
  StatsRows, TableLoading, SortTh, TD_CLASS,
  useColumnFilters, useTableSort, zebraRow,
} from "./table"
import { DISPOSITION_BADGE, DISPOSITION_LABEL, fmtDateTime, type CategoryOption, type Disposition, type EmailRow, type RuleRow } from "./shared"

// The email tabs (Needs Review / Update / Ignored): one sortable, filterable, bordered, zebra-striped
// table with pagination — the same table language as the cases table and the Individual Document
// Manager. Header filters, multi-column sort (shift-click) and column visibility all come from ./table;
// only what's specific to an email row (cell rendering, quick-classify actions) lives here.

const SORT_VALUE: Record<string, (e: EmailRow) => string | number> = {
  company: (e) => e.company_name ?? "",
  from: (e) => e.sender_name || e.sender_email,
  subject: (e) => e.subject ?? "",
  summary: (e) => e.ai_summary || e.snippet || "",
  received: (e) => e.received_at,
  category: (e) => e.category_key ?? "",
  status: (e) => e.disposition ?? "",
  case: (e) => (e.case_id ? 1 : 0),
  actions: (e) => (e.disposition === "needs_review" ? 0 : 1), // rows still awaiting a decision first
}

// Toggleable columns — "#"/Company (sticky) and Actions (the whole point of the review tabs) always show.
export const TOGGLEABLE_COLUMNS = [
  { id: "from", label: "From" },
  { id: "subject", label: "Subject" },
  { id: "summary", label: "Summary" },
  { id: "received", label: "Received" },
  { id: "category", label: "Category" },
  { id: "status", label: "Status" },
  { id: "case", label: "Case" },
]

export function EmailsTable({
  emails,
  categories,
  onOpen,
  onQuickClassify,
  showTime,
  loading = false,
  emptyMessage = "Nothing needs review right now.",
  embedded = false,
  notificationsMode = false,
  onMarkHandled,
  selection,
  onAllocate,
  allocateTargets,
  onDeleteRow,
  ignoreRules,
  showStats = false,
  visibleColumns: visibility,
  rules,
}: {
  emails: EmailRow[]
  categories: CategoryOption[]
  onOpen: (e: EmailRow) => void
  onQuickClassify: (e: EmailRow, d: Disposition) => void
  showTime: boolean
  loading?: boolean
  emptyMessage?: string
  embedded?: boolean
  // The Notifications basket: rows carry handled_by/handled_at instead of a disposition label, and
  // unhandled ones get a "Mark handled" action (worked like a task, never a KRA task/case).
  notificationsMode?: boolean
  onMarkHandled?: (e: EmailRow) => void
  // Row checkboxes (the Ignored tab). The header checkbox covers every row in `emails`, not just the
  // current page.
  selection?: { selected: Set<string>; onToggle: (id: string) => void; onToggleAll: (ids: string[], on: boolean) => void }
  // The Ignored tab: ignore rules name no category (every mail they catch is filed as System / Non-KRA),
  // so for a row ignored by one of these rules the Category column shows the rule instead.
  ignoreRules?: RuleRow[]
  // Adds an Action dropdown (— / Action required / Update only / Ignored / Needs review) to each row.
  onAllocate?: (e: EmailRow, d: Disposition) => void
  // Limits the Action dropdown to these tabs (default: all). The Ignored tab leaves out "Ignored".
  allocateTargets?: Disposition[]
  // Adds a trash button to each row's Actions cell; the caller confirms and deletes.
  onDeleteRow?: (e: EmailRow) => void
  // Both owned by the page's shared toolbar (Stats / Columns buttons), not this component — so every
  // list tab's table keeps those controls in one place instead of each growing its own.
  showStats?: boolean
  visibleColumns?: Record<string, boolean>
  // When given, a Needs Review row's Actions cell gets a "Test" button that opens the rule tester
  // seeded with that email's own subject/sender — same tool as the Rules tab's toolbar button, just
  // starting from a real mail instead of a blank form. Omitted elsewhere (Notifications/Update), where
  // testing against rules is less relevant.
  rules?: RuleRow[]
}) {
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [page, setPage] = useState(0)
  const [testerSeed, setTesterSeed] = useState<{ subject: string; sender: string; company: { id: string; name: string } | null } | null>(null)
  const isVisible = (id: string) => visibility?.[id] !== false

  const byKey = new Map(categories.map((c) => [c.key, c]))
  const ignoreRuleById = new Map((ignoreRules ?? []).map((r) => [r.id, r]))
  // "sender — subject" of the ignore rule that caught this mail, or "" when none did (ignored by hand,
  // or by a rule that has since been deleted).
  const ignoreRuleLabel = (e: EmailRow) => {
    const r = e.disposition === "ignore" && e.matched_rule_id ? ignoreRuleById.get(e.matched_rule_id) : undefined
    if (!r) return ""
    const subjects = [r.pattern, ...(r.extra_patterns ?? [])].map((w) => w.trim()).filter(Boolean)
    const senders = [r.sender_pattern, ...(r.extra_sender_patterns ?? [])].map((w) => (w ?? "").trim()).filter(Boolean)
    return `${senders.length ? senders.join(" · ") : "Any sender"} — ${subjects.length ? subjects.join(" · ") : "Any subject"}`
  }
  const categoryName = (e: EmailRow) => ignoreRuleLabel(e) || (e.category_key ? byKey.get(e.category_key)?.name ?? e.category_key : "")
  const statusLabel = (e: EmailRow) =>
    e.handled_at ? "Handled"
      : e.category_key === "notification" ? (e.priority === "urgent" ? "Urgent" : "FYI")
      : e.disposition ? DISPOSITION_LABEL[e.disposition] : ""

  const FILTER_VALUE: Record<string, (e: EmailRow) => string> = {
    company: (e) => e.company_name ?? "Unassigned company",
    category: categoryName,
    status: statusLabel,
    // Always includes the time (regardless of the Show/Hide Time toggle) so typing a time into the
    // filter works whether or not the column itself is currently displaying one.
    received: (e) => fmtDateTime(e.received_at, true),
  }
  const { filtered, configFor, activeCount: activeFilterCount, clearAll: clearAllFilters } = useColumnFilters(emails, FILTER_VALUE, ["received"])

  // Category sorts by its displayed name, not its internal key (the two orders differ).
  const { levels, sorted, toggle } = useTableSort(filtered, { ...SORT_VALUE, category: (e) => categoryName(e).toLowerCase() }, [{ key: "received", dir: "desc" }])

  useEffect(() => setPage(0), [emails, itemsPerPage])

  const totalPages = Math.max(1, Math.ceil(sorted.length / itemsPerPage))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * itemsPerPage
  const visibleRows = sorted.slice(start, start + itemsPerPage)

  const showActions = !!onAllocate || emails.some((e) => e.disposition === "needs_review")
  const colCount = 2 + TOGGLEABLE_COLUMNS.filter((c) => isVisible(c.id)).length + (showActions ? 1 : 0)
  // The row checkbox lives in the sticky "#" column, which widens to make room — so the Company column
  // that sticks beside it has to move over by the same amount.
  const numWidth = selection ? "w-24 min-w-[6rem] max-w-[6rem]" : "w-16"
  const companyLeft = selection ? "left-24" : "left-16"
  // A selection never includes rows the column filters are hiding: narrowing the filters deselects
  // whatever just dropped out, so "N selected" and bulk actions only ever cover what's on screen.
  useEffect(() => {
    if (!selection) return
    const visible = new Set(filtered.map((e) => e.id))
    const hidden = emails.filter((e) => selection.selected.has(e.id) && !visible.has(e.id)).map((e) => e.id)
    if (hidden.length) selection.onToggleAll(hidden, false)
    // only when the filtered set changes; selection's identity changes on every toggle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered])

  // Select-all acts on the rows the column filters leave visible, not on every email behind them.
  const allSelected = !!selection && filtered.length > 0 && filtered.every((e) => selection.selected.has(e.id))
  const someSelected = !!selection && !allSelected && filtered.some((e) => selection.selected.has(e.id))

  const statsRowColumns = useMemo(() => {
    const cols: { id: string; getValue?: (e: EmailRow) => string; className?: string }[] = [
      { id: "#", className: cn(numWidth, "sticky left-0 z-40 text-center") },
      { id: "company", getValue: (e) => e.company_name ?? "", className: cn("sticky z-40 border-r-2", companyLeft) },
    ]
    if (isVisible("from")) cols.push({ id: "from", getValue: (e) => e.sender_name || e.sender_email })
    if (isVisible("subject")) cols.push({ id: "subject", getValue: (e) => e.subject ?? "" })
    if (isVisible("summary")) cols.push({ id: "summary", getValue: (e) => e.ai_summary || e.snippet || "" })
    if (isVisible("received")) cols.push({ id: "received", getValue: (e) => e.received_at })
    if (isVisible("category")) cols.push({ id: "category", getValue: categoryName })
    if (isVisible("status")) cols.push({ id: "status", getValue: statusLabel })
    if (isVisible("case")) cols.push({ id: "case", getValue: (e) => (e.case_id ? "yes" : "") })
    if (showActions) cols.push({ id: "actions" })
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, showActions, numWidth, companyLeft, byKey])

  return (
    <div className={cn(
      "flex flex-col flex-1 min-h-0 bg-white overflow-hidden",
      !embedded && "rounded-xl border border-slate-200 shadow-sm"
    )}>
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 shrink-0">
          <Button variant="outline" size="sm" onClick={clearAllFilters} className="h-9 px-3 gap-1.5 rounded-full border-slate-200 text-base font-medium text-custom-blue">
            Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
          </Button>
        </div>
      )}

      <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
        <table className="min-w-[1500px] w-full border-separate border-spacing-0 text-base">
          <thead className="sticky top-0 z-30 bg-white shadow-xs">
            <tr>
              <SortTh tone="blue" id="#" levels={levels} onSort={toggle} className={cn(numWidth, "sticky left-0 z-40 text-center")}>
                {selection ? (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected }}
                    onClick={(ev) => ev.stopPropagation()}
                    onChange={(ev) => selection.onToggleAll(filtered.map((e) => e.id), ev.target.checked)}
                    title={allSelected ? "Clear selection" : `Select all ${filtered.length}`}
                    className="h-4 w-4 align-middle accent-white cursor-pointer"
                  />
                ) : "#"}
              </SortTh>
              <SortTh tone="blue" id="company" levels={levels} onSort={toggle} filter={configFor("company")} className={cn("min-w-[210px] sticky z-40 text-left border-r-2", companyLeft)}>Company</SortTh>
              {isVisible("from") && <SortTh tone="blue" id="from" levels={levels} onSort={toggle} className="min-w-[200px]">From</SortTh>}
              {isVisible("subject") && <SortTh tone="blue" id="subject" levels={levels} onSort={toggle} className="min-w-[280px]">Subject</SortTh>}
              {isVisible("summary") && <SortTh tone="blue" id="summary" levels={levels} onSort={toggle} className="min-w-[300px]">Summary</SortTh>}
              {isVisible("received") && <SortTh tone="blue" id="received" levels={levels} onSort={toggle} filter={configFor("received")} className="min-w-[130px]">Received</SortTh>}
              {isVisible("category") && <SortTh tone="blue" id="category" levels={levels} onSort={toggle} filter={configFor("category")} className="min-w-[140px]">Category</SortTh>}
              {isVisible("status") && <SortTh tone="blue" id="status" levels={levels} onSort={toggle} filter={configFor("status")} className="min-w-[130px]">Status</SortTh>}
              {isVisible("case") && <SortTh tone="blue" id="case" levels={levels} onSort={toggle} className="min-w-[90px]">Case</SortTh>}
              {showActions && <SortTh tone="blue" id="actions" levels={levels} onSort={toggle} className="min-w-[200px] text-left">Actions</SortTh>}
            </tr>
            {showStats && <StatsRows rows={filtered} columns={statsRowColumns} />}
          </thead>
          <tbody>
            {loading && <TableLoading cols={colCount} />}
            {!loading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-20 text-center text-base text-slate-400">
                  <Inbox className="w-11 h-11 text-slate-300 mx-auto mb-2" />
                  {emptyMessage}
                </td>
              </tr>
            )}
            {visibleRows.map((e, index) => {
              const cat = e.category_key ? byKey.get(e.category_key) : null
              const isUnread = !e.is_read
              return (
                <tr key={e.id} onClick={() => onOpen(e)} className={cn("cursor-pointer transition-colors", zebraRow(index), e.handled_at && "opacity-60")}>
                  <td className={cn(TD_CLASS, numWidth, "sticky left-0 z-20 bg-inherit text-center text-slate-400 font-medium tabular-nums border-r border-slate-200", isUnread && "border-l-4 border-l-custom-blue")}>
                    {selection ? (
                      <div className="flex items-center justify-center gap-2" onClick={(ev) => ev.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selection.selected.has(e.id)}
                          onChange={() => selection.onToggle(e.id)}
                          className="h-4 w-4 accent-custom-blue cursor-pointer"
                        />
                        <span>{start + index + 1}</span>
                      </div>
                    ) : start + index + 1}
                  </td>
                  <td className={cn(TD_CLASS, "sticky z-20 bg-inherit border-r-2 border-slate-300", companyLeft)}>
                    <div className={cn("leading-snug", isUnread ? "font-bold text-slate-900" : "font-semibold text-slate-900")}>
                      {e.company_name ?? <span className="text-red-500 font-normal">Unassigned company</span>}
                    </div>
                    {e.kra_pin && <div className="text-sm text-slate-500 mt-1">{e.kra_pin}</div>}
                  </td>
                  {isVisible("from") && (
                    <td className={cn(TD_CLASS, "break-all")}>
                      <div className="flex items-start gap-1.5">
                        {e.direction === "outbound" && <CornerUpLeft className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />}
                        <div className="min-w-0">
                          <div className="text-slate-800">{e.sender_name || e.sender_email}</div>
                          {e.sender_name && <div className="text-sm text-slate-500 mt-0.5">{e.sender_email}</div>}
                        </div>
                      </div>
                    </td>
                  )}
                  {isVisible("subject") && (
                    <td className={TD_CLASS}>
                      <div className="flex items-start gap-1.5">
                        <span className={cn("line-clamp-2 leading-snug", isUnread ? "font-bold text-slate-900" : "font-medium text-slate-900")} title={e.subject}>
                          {e.subject || "(no subject)"}
                        </span>
                        {e.has_attachments && <Paperclip className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />}
                      </div>
                    </td>
                  )}
                  {isVisible("summary") && (
                    <td className={TD_CLASS}>
                      <span className="line-clamp-2 leading-snug text-slate-600" title={e.ai_summary || e.snippet || ""}>{e.ai_summary || e.snippet || "—"}</span>
                      {e.disposition === "needs_review" && e.review_reason && (
                        <div className="text-sm text-amber-700 font-medium mt-1">{e.review_reason}</div>
                      )}
                    </td>
                  )}
                  {isVisible("received") && <td className={cn(TD_CLASS, "whitespace-nowrap tabular-nums")}>{fmtDateTime(e.received_at, showTime)}</td>}
                  {isVisible("category") && (
                    <td className={TD_CLASS}>
                      {ignoreRuleLabel(e) ? (
                        <span
                          className="inline-block max-w-[260px] truncate align-middle text-sm font-semibold px-2.5 py-0.5 rounded-full border bg-slate-50 text-slate-700 border-slate-200"
                          title={`Ignored by rule: ${ignoreRuleLabel(e)}`}
                        >
                          Rule: {ignoreRuleLabel(e)}
                        </span>
                      ) : cat ? (
                        <span
                          className="text-sm font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap"
                          style={{ background: `${cat.color ?? "#6b7280"}14`, color: cat.color ?? "#6b7280", borderColor: `${cat.color ?? "#6b7280"}33` }}
                        >
                          {cat.name}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  )}
                  {isVisible("status") && (
                    <td className={cn(TD_CLASS, "whitespace-nowrap")}>
                      {e.handled_at ? (
                        <>
                          <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">Handled</span>
                          <div className="text-sm text-emerald-700 mt-1">by {e.handled_by_name ?? "…"} · {fmtDateTime(e.handled_at, showTime)}</div>
                        </>
                      ) : e.category_key === "notification" ? (
                        e.priority === "urgent" ? (
                          <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">Urgent</span>
                        ) : (
                          <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">FYI</span>
                        )
                      ) : e.disposition ? (
                        <span className={cn("text-sm font-semibold px-2.5 py-0.5 rounded-full border", DISPOSITION_BADGE[e.disposition])}>
                          {DISPOSITION_LABEL[e.disposition]}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                      {!e.handled_at && e.disposition !== "needs_review" && e.classification_source && e.category_confidence !== null && (
                        <div className="text-sm text-slate-400 mt-1">{e.classification_source} · {Math.round(e.category_confidence * 100)}%</div>
                      )}
                    </td>
                  )}
                  {isVisible("case") && (
                    <td className={cn(TD_CLASS, "whitespace-nowrap")}>
                      {e.case_id ? <span className="text-sm font-semibold text-emerald-600">● In a case</span> : <span className="text-slate-300">—</span>}
                    </td>
                  )}
                  {showActions && (
                    <td className={TD_CLASS} onClick={(ev) => ev.stopPropagation()}>
                      {onAllocate ? (
                        <div className="flex items-center gap-1.5">
                          <select
                            value=""
                            onChange={(ev) => { if (ev.target.value) onAllocate(e, ev.target.value as Disposition) }}
                            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-base font-medium text-slate-700 hover:bg-slate-50 cursor-pointer focus:outline-none focus:ring-1 focus:ring-custom-blue"
                            title="Move this email to another tab"
                          >
                            <option value="">Move to…</option>
                            {(allocateTargets ?? (Object.keys(DISPOSITION_LABEL) as Disposition[]))
                              .filter((d) => d !== e.disposition)
                              .map((d) => (
                                <option key={d} value={d}>{DISPOSITION_LABEL[d]}</option>
                              ))}
                          </select>
                          {onDeleteRow && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 rounded-md text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => onDeleteRow(e)}
                              title="Delete this email from the app (it stays in Gmail)"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ) : e.handled_at ? (
                        <span className="text-sm text-slate-300">—</span>
                      ) : e.disposition === "needs_review" ? (
                        <div className="flex items-center gap-1.5">
                          {notificationsMode && onMarkHandled && (
                            <Button size="sm" className="h-8 px-2.5 rounded-md text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onMarkHandled(e)}>
                              Handled
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-8 px-2.5 rounded-md text-base font-medium border-slate-200 bg-white hover:bg-slate-100" onClick={() => onQuickClassify(e, "action_required")}>Action</Button>
                          <Button size="sm" variant="outline" className="h-8 px-2.5 rounded-md text-base font-medium border-slate-200 bg-white hover:bg-slate-100" onClick={() => onQuickClassify(e, "update_only")}>Update</Button>
                          <Button size="sm" variant="ghost" className="h-8 px-2.5 rounded-md text-base font-medium text-slate-500 hover:text-slate-800" onClick={() => onQuickClassify(e, "ignore")}>Ignore</Button>
                          {rules && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 rounded-md text-slate-400 hover:text-custom-blue hover:bg-slate-100"
                              onClick={() => setTesterSeed({ subject: e.subject, sender: e.sender_email, company: e.company_id ? { id: String(e.company_id), name: e.company_name ?? "This email's company" } : null })}
                              title="Test this mail's subject/sender against every rule"
                            >
                              <FlaskConical className="h-4 w-4" />
                            </Button>
                          )}
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
      {rules && (
        <RuleTesterDialog
          open={!!testerSeed}
          onOpenChange={(o) => !o && setTesterSeed(null)}
          rules={rules}
          categories={categories}
          initialSubject={testerSeed?.subject}
          initialSender={testerSeed?.sender}
          initialCompany={testerSeed?.company}
        />
      )}
    </div>
  )
}
