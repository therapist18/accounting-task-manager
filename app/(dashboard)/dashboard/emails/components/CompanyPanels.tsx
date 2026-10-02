"use client"

import { useMemo, useState } from "react"
import { Inbox, Search, Building2, Filter, UserX } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle, useCollapsiblePanel, PanelCollapseButton, CollapsedRail } from "@/components/ui/resizable"
import { cn } from "@/lib/utils"
import ClientCategoryFilter from "@/app/generic-components/ClientCategoryFilter"
import {
  companyMatchesCategoryFilters,
  DEFAULT_CATEGORY_FILTERS,
  type FilterState,
} from "@/app/generic-components/companyCategoryFilters"
import type { Company } from "../../companies/database"

// "By company" layout for every list tab (cases and emails): a resizable company sidebar on the left
// (same shell and Client Category Filter as Consultancy Contracts' CompaniesSidebar, and the same
// ResizablePanelGroup pattern the Individual Document Manager uses) and the tab's table on the right.
// The sidebar only ever narrows what the page already holds in memory — no fetching happens here.

export const UNASSIGNED = "__unassigned__"

// An empty selection means every company; otherwise a row matches when its company (or "no company",
// via UNASSIGNED) is one of the selected entries.
export function matchesCompanySelection(companyId: string | null, selected: string[]): boolean {
  if (selected.length === 0) return true
  return companyId ? selected.includes(companyId) : selected.includes(UNASSIGNED)
}

export function CompanyPanels({
  companies,
  companyIds,
  selected,
  onSelect,
  children,
}: {
  companies: Company[]
  // company_id of every row in the active tab BEFORE any company narrowing — drives the counts.
  companyIds: (string | null)[]
  selected: string[] // [] = all; entries are company ids and/or UNASSIGNED
  onSelect: (ids: string[]) => void
  children: React.ReactNode
}) {
  const { counts, unassignedCount } = useMemo(() => {
    const byCompany: Record<string, number> = {}
    let unassigned = 0
    for (const id of companyIds) {
      if (!id) { unassigned++; continue }
      byCompany[id] = (byCompany[id] ?? 0) + 1
    }
    return { counts: byCompany, unassignedCount: unassigned }
  }, [companyIds])

  const sidebar = useCollapsiblePanel()

  return (
    <div className="flex-1 min-h-0 flex rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {sidebar.collapsed && <CollapsedRail onExpand={sidebar.expand} label="Companies" />}
      <ResizablePanelGroup direction="horizontal" autoSaveId="email-center-company-layout" className="flex-1 min-h-0 h-full min-w-0">
        <ResizablePanel id="companies" order={1} defaultSize={20} minSize={14} maxSize={36} {...sidebar.panelProps} className="flex flex-col overflow-hidden bg-slate-50/40 border-r border-slate-200/80">
          <CompaniesSidebar
            companies={companies}
            selectedIds={selected}
            onChange={onSelect}
            counts={counts}
            unassignedCount={unassignedCount}
            totalCount={companyIds.length}
            onCollapse={sidebar.collapse}
          />
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-slate-200/80 hover:bg-custom-blue/40 transition-colors" />

        <ResizablePanel id="content" order={2} defaultSize={80} minSize={40} className="flex flex-col overflow-hidden bg-white">
          {children}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

function CompaniesSidebar({
  companies,
  selectedIds,
  onChange,
  counts,
  unassignedCount,
  totalCount,
  onCollapse,
}: {
  companies: Company[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  counts: Record<string, number>
  unassignedCount: number
  totalCount: number
  onCollapse: () => void
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

  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const shownIds = filteredCompanies.map((c) => String(c.id))
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id))
  // A plain click picks just that entry (the old behaviour); the checkbox adds/removes it from a multi-selection.
  const only = (id: string) => onChange([id])
  const toggle = (id: string) => onChange(selected.has(id) ? selectedIds.filter((v) => v !== id) : [...selectedIds, id])
  // "Select all" ticks everything the search/category filter currently shows; again unticks just those.
  const toggleAllShown = () =>
    onChange(allShownSelected ? selectedIds.filter((id) => !shownIds.includes(id)) : [...new Set([...selectedIds, ...shownIds])])

  return (
    <div className="flex flex-col h-full bg-slate-50/40">
      <div className="p-3 border-b border-slate-200/80 shrink-0 bg-white space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-custom-blue" />
            Companies
          </h2>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md"
              onClick={() => setCategoryFilterOpen(true)}
              title="Filter by client category"
            >
              <Filter className="h-5 w-5" />
            </Button>
            <PanelCollapseButton onClick={onCollapse} />
          </div>
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input
            placeholder="Search company…"
            className="pl-10 h-10 text-base bg-slate-50 border-slate-200 rounded-md focus:bg-white focus-visible:ring-1 focus-visible:ring-custom-blue"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-0.5">
          <Row icon={<Inbox className="w-5 h-5" />} label="All companies" count={totalCount} active={selectedIds.length === 0} onClick={() => onChange([])} />
          {unassignedCount > 0 && (
            <Row
              icon={<UserX className="w-5 h-5" />}
              label="Unassigned"
              count={unassignedCount}
              active={selected.has(UNASSIGNED)}
              onClick={() => only(UNASSIGNED)}
              onToggle={() => toggle(UNASSIGNED)}
            />
          )}

          <div className="my-1 border-t border-slate-200/60" />

          {filteredCompanies.length > 0 && (
            <div className="flex items-center justify-between px-3 py-1 text-sm">
              <button type="button" onClick={toggleAllShown} className="font-medium text-custom-blue hover:underline">
                {allShownSelected ? "Deselect all" : searchQuery ? "Select all shown" : "Select all"}
              </button>
              {selectedIds.length > 0 && (
                <span className="text-slate-500">{selectedIds.length} selected</span>
              )}
            </div>
          )}

          {filteredCompanies.map((company) => {
            const compId = String(company.id)
            return (
              <Row
                key={compId}
                icon={<Building2 className="w-5 h-5" />}
                label={company.company_name}
                count={counts[compId] ?? 0}
                active={selected.has(compId)}
                onClick={() => only(compId)}
                onToggle={() => toggle(compId)}
              />
            )
          })}
          {filteredCompanies.length === 0 && (
            <p className="text-base text-slate-400 text-center py-6">No companies match this search/filter.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function Row({
  icon, label, count, active, onClick, onToggle,
}: {
  icon: React.ReactNode
  label: string
  count: number
  active: boolean
  onClick: () => void
  // When given, the row shows a checkbox that adds/removes it from a multi-selection.
  onToggle?: () => void
}) {
  return (
    // A div (not a button) because it can contain the selection checkbox, and an input nested in a
    // button doesn't reliably receive clicks.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onClick() } }}
      className={cn(
        "flex items-center w-full px-3 py-2 text-base rounded-md transition-colors text-left font-medium cursor-pointer",
        active ? "bg-custom-blue text-white shadow-xs" : "text-slate-700 hover:bg-slate-200/60"
      )}
    >
      {onToggle && (
        <input
          type="checkbox"
          checked={active}
          onClick={(ev) => ev.stopPropagation()}
          onChange={onToggle}
          title="Add to / remove from selection"
          className="mr-2 h-4 w-4 shrink-0 cursor-pointer accent-custom-blue"
        />
      )}
      <span className={cn("mr-2 shrink-0", active ? "text-white" : "text-slate-400")}>{icon}</span>
      <span className="truncate flex-1">{label}</span>
      {count > 0 && (
        <Badge
          variant="outline"
          className={cn(
            "text-sm font-semibold rounded-full px-2 py-0.5 ml-1 tabular-nums border",
            active ? "bg-white/20 text-white border-white/30" : "bg-slate-100 text-slate-600 border-slate-200"
          )}
        >
          {count}
        </Badge>
      )}
    </div>
  )
}
