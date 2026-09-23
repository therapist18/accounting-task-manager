"use client"

import { useEffect, useMemo, useState } from "react"
import { Paperclip, Inbox, CornerUpLeft, Search, Building2, Filter, UserX } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { cn } from "@/lib/utils"
import { Pagination } from "./Pagination"
import ClientCategoryFilter from "@/app/generic-components/ClientCategoryFilter"
import {
  companyMatchesCategoryFilters,
  DEFAULT_CATEGORY_FILTERS,
  type FilterState,
} from "@/app/generic-components/companyCategoryFilters"
import type { Company } from "../../companies/database"
import { DISPOSITION_BADGE, DISPOSITION_LABEL, fmtDateTime, type CategoryOption, type Disposition, type EmailRow } from "./shared"

// The three Needs Review views: the flat EmailList, the mailbox-style EmailSidebarView (resizable
// company sidebar + list), and the CompaniesSidebar the latter renders. Merged into one file since
// the sidebar view is pure composition of the other two.

export const UNASSIGNED = "__unassigned__"

// ── EmailList: the flat list ─────────────────────────────────────────────────

export function EmailList({
  emails,
  categories,
  onOpen,
  onQuickClassify,
  emptyMessage = "Nothing needs review right now.",
  embedded = false,
}: {
  emails: EmailRow[]
  categories: CategoryOption[]
  onOpen: (e: EmailRow) => void
  onQuickClassify: (e: EmailRow, d: Disposition) => void
  emptyMessage?: string
  embedded?: boolean
}) {
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [page, setPage] = useState(0)

  useEffect(() => setPage(0), [emails, itemsPerPage])

  const totalPages = Math.max(1, Math.ceil(emails.length / itemsPerPage))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * itemsPerPage
  const visible: EmailRow[] = emails.slice(start, start + itemsPerPage)

  if (!emails.length) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center py-16 text-slate-400 gap-2 bg-white",
        !embedded && "rounded-xl border border-slate-200 shadow-sm"
      )}>
        <Inbox className="w-8 h-8 text-slate-300" />
        <p className="text-xs font-medium text-slate-500">{emptyMessage}</p>
      </div>
    )
  }

  const byKey = new Map(categories.map((c) => [c.key, c]))

  return (
    <div className={cn(
      "flex flex-col flex-1 min-h-0 bg-white overflow-hidden",
      !embedded && "rounded-xl border border-slate-200 shadow-sm max-h-[calc(100vh-19rem)]"
    )}>
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
        {visible.map((e, idx) => {
          const cat = e.category_key ? byKey.get(e.category_key) : null
          const isUnread = !e.is_read
          return (
            <div
              key={e.id}
              onClick={() => onOpen(e)}
              className={cn(
                "group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors relative",
                isUnread ? "bg-blue-50/40 hover:bg-blue-50/70" : idx % 2 === 1 ? "bg-slate-50/30 hover:bg-slate-100/70" : "bg-white hover:bg-slate-50/80"
              )}
            >
              {isUnread && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-custom-blue" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("text-xs truncate", isUnread ? "font-bold text-slate-900" : "font-semibold text-slate-800")}>
                    {e.direction === "outbound" && <CornerUpLeft className="inline w-3 h-3 mr-1 text-slate-400" />}
                    {e.company_name ?? <span className="text-red-500 font-normal">Unassigned</span>}
                    <span className="font-normal text-slate-500"> · {e.sender_name || e.sender_email}</span>
                  </p>
                  <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">{fmtDateTime(e.received_at)}</span>
                </div>
                <p className="text-xs font-medium text-slate-800 truncate mt-0.5">{e.subject || "(no subject)"}</p>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">{e.ai_summary || e.snippet}</p>

                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {e.disposition && (
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", DISPOSITION_BADGE[e.disposition])}>
                      {DISPOSITION_LABEL[e.disposition]}
                    </span>
                  )}
                  {cat && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                      style={{ background: `${cat.color ?? "#6b7280"}14`, color: cat.color ?? "#6b7280", borderColor: `${cat.color ?? "#6b7280"}33` }}
                    >
                      {cat.name}
                    </span>
                  )}
                  {e.classification_source && e.category_confidence !== null && (
                    <span className="text-[10px] text-slate-400 font-medium">
                      {e.classification_source} · {Math.round(e.category_confidence * 100)}%
                    </span>
                  )}
                  {e.has_attachments && <Paperclip className="w-3 h-3 text-slate-400" />}
                  {e.case_id && <span className="text-[10px] font-semibold text-emerald-600">● in a case</span>}
                </div>
                {e.disposition === "needs_review" && e.review_reason && (
                  <p className="text-[11px] text-amber-700 mt-1.5 font-medium">{e.review_reason}</p>
                )}
              </div>

              {e.disposition === "needs_review" && (
                <div className="flex items-center gap-1.5 shrink-0" onClick={(ev) => ev.stopPropagation()}>
                  <Button size="sm" variant="outline" className="h-6 px-2.5 rounded-md text-[11px] font-semibold border-slate-200 hover:bg-slate-100" onClick={() => onQuickClassify(e, "action_required")}>Action</Button>
                  <Button size="sm" variant="outline" className="h-6 px-2.5 rounded-md text-[11px] font-semibold border-slate-200 hover:bg-slate-100" onClick={() => onQuickClassify(e, "update_only")}>Update</Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2.5 rounded-md text-[11px] font-semibold text-slate-500 hover:text-slate-800" onClick={() => onQuickClassify(e, "ignore")}>Ignore</Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <Pagination
        totalItems={emails.length}
        itemsPerPage={itemsPerPage}
        currentPage={safePage}
        onPageChange={setPage}
        onItemsPerPageChange={(n) => setItemsPerPage(n)}
        sticky={false}
        className="shrink-0 border-t border-slate-200"
      />
    </div>
  )
}

// ── CompaniesSidebar ─────────────────────────────────────────────────────────
// Same shell and Client Category Filter as Consultancy Contracts' CompaniesSidebar (search +
// ACC/IMM/Audit/Sheria + status, via the shared companyCategoryFilters/ClientCategoryFilter used
// everywhere else a company list needs to respect that filter) — adapted to show every company
// (not just ones with a saved contract) with a Needs Review count instead of an engagement status.

export function CompaniesSidebar({
  companies,
  selectedCompanyId,
  onSelectCompany,
  reviewCounts,
  unassignedCount,
  totalCount,
}: {
  companies: Company[]
  selectedCompanyId: string
  onSelectCompany: (id: string) => void
  reviewCounts: Record<string, number>
  unassignedCount: number
  totalCount: number
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilters, setCategoryFilters] = useState<FilterState | null>(DEFAULT_CATEGORY_FILTERS)
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false)

  const filteredCompanies = useMemo(
    () =>
      companies
        .filter((c) => c.company_name?.toLowerCase().includes(searchQuery.toLowerCase()))
        .filter((c) => companyMatchesCategoryFilters(c, categoryFilters)),
    [companies, searchQuery, categoryFilters]
  )

  return (
    <div className="flex flex-col h-full bg-slate-50/40">
      <div className="p-3 border-b border-slate-200/80 shrink-0 bg-white">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-custom-blue" />
            Companies
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md"
            onClick={() => setCategoryFilterOpen(true)}
            title="Filter by client category"
          >
            <Filter className="h-3.5 w-3.5" />
          </Button>
          <ClientCategoryFilter
            open={categoryFilterOpen}
            onOpenChange={setCategoryFilterOpen}
            onFilterChange={setCategoryFilters}
            initialFilters={categoryFilters}
            showSectionStatus={false}
            showOperationalStatus={true}
            hideCategoryFilterButton
          />
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search company…"
            className="pl-8 h-8 text-xs bg-slate-50 border-slate-200 rounded-md focus:bg-white focus-visible:ring-1 focus-visible:ring-custom-blue"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-0.5">
          <Row
            icon={<Inbox className="w-3.5 h-3.5" />}
            label="All companies"
            count={totalCount}
            active={!selectedCompanyId}
            onClick={() => onSelectCompany("")}
          />
          {unassignedCount > 0 && (
            <Row
              icon={<UserX className="w-3.5 h-3.5" />}
              label="Unassigned"
              count={unassignedCount}
              active={selectedCompanyId === UNASSIGNED}
              onClick={() => onSelectCompany(UNASSIGNED)}
            />
          )}

          <div className="my-1 border-t border-slate-200/60" />

          {filteredCompanies.map((company) => {
            const compId = String(company.id)
            const isSelected = selectedCompanyId === compId
            const count = reviewCounts[compId] ?? 0
            return (
              <Row
                key={compId}
                icon={<Building2 className="w-3.5 h-3.5" />}
                label={company.company_name}
                count={count}
                active={isSelected}
                onClick={() => onSelectCompany(compId)}
              />
            )
          })}
          {filteredCompanies.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">No companies match this search/filter.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function Row({
  icon, label, count, active, onClick,
}: {
  icon: React.ReactNode
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center w-full px-2.5 py-2 text-xs rounded-md transition-colors text-left font-medium",
        active ? "bg-custom-blue text-white shadow-xs" : "text-slate-700 hover:bg-slate-200/60"
      )}
    >
      <span className={cn("mr-2 shrink-0", active ? "text-white" : "text-slate-400")}>{icon}</span>
      <span className="truncate flex-1">{label}</span>
      {count > 0 && (
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] font-semibold rounded-full px-1.5 py-0.5 ml-1 tabular-nums border",
            active ? "bg-white/20 text-white border-white/30" : "bg-amber-50 text-amber-700 border-amber-200"
          )}
        >
          {count}
        </Badge>
      )}
    </button>
  )
}

// ── EmailSidebarView: mailbox-client layout for Needs Review ─────────────────
// Pick a company from the sidebar (like switching mailboxes in an email client) and its emails
// render on the right. Same CompaniesSidebar (search + Client Category Filter) and resizable-panel
// shell as Consultancy Contracts' company workspace, so this reads as the same kind of screen as
// the rest of the app.
//
// Every company renders in the sidebar, not just ones with something waiting — this only ever
// shows emails already kept in the database (case-linked or awaiting review), not a full
// per-company inbox of every message, so it needed no ingestion changes.

export function EmailSidebarView({
  emails,
  companies,
  categories,
  selectedCompany,
  onSelectCompany,
  onOpen,
  onQuickClassify,
}: {
  emails: EmailRow[] // already search-filtered by the page; NOT company-filtered — that's this component's job
  companies: Company[]
  categories: CategoryOption[]
  selectedCompany: string // "" = all, UNASSIGNED = no company, else a company id
  onSelectCompany: (id: string) => void
  onOpen: (e: EmailRow) => void
  onQuickClassify: (e: EmailRow, d: Disposition) => void
}) {
  const { reviewCounts, unassignedCount } = useMemo(() => {
    const counts: Record<string, number> = {}
    let unassigned = 0
    for (const e of emails) {
      if (!e.company_id) { unassigned++; continue }
      counts[e.company_id] = (counts[e.company_id] ?? 0) + 1
    }
    return { reviewCounts: counts, unassignedCount: unassigned }
  }, [emails])

  const visibleEmails = useMemo(() => {
    if (!selectedCompany) return emails
    if (selectedCompany === UNASSIGNED) return emails.filter((e) => !e.company_id)
    return emails.filter((e) => e.company_id === selectedCompany)
  }, [emails, selectedCompany])

  return (
    <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <ResizablePanelGroup direction="horizontal" autoSaveId="email-center-needs-review-layout" className="flex-1 min-h-0 h-full w-full">
        <ResizablePanel id="companies" order={1} defaultSize={22} minSize={16} maxSize={36} className="flex flex-col overflow-hidden bg-slate-50/40 border-r border-slate-200/80">
          <CompaniesSidebar
            companies={companies}
            selectedCompanyId={selectedCompany}
            onSelectCompany={onSelectCompany}
            reviewCounts={reviewCounts}
            unassignedCount={unassignedCount}
            totalCount={emails.length}
          />
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-slate-200/80 hover:bg-custom-blue/40 transition-colors" />

        <ResizablePanel id="emails" order={2} defaultSize={78} minSize={40} className="flex flex-col overflow-hidden bg-white">
          <EmailList emails={visibleEmails} categories={categories} onOpen={onOpen} onQuickClassify={onQuickClassify} embedded={true} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}