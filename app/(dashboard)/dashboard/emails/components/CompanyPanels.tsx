"use client"

import { useMemo, useState } from "react"
import { Inbox, Search, Building2, Filter, UserX } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
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

export function matchesCompanySelection(companyId: string | null, selected: string): boolean {
  if (!selected) return true
  if (selected === UNASSIGNED) return !companyId
  return companyId === selected
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
  selected: string // "" = all, UNASSIGNED = no company, else a company id
  onSelect: (id: string) => void
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

  return (
    <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <ResizablePanelGroup direction="horizontal" autoSaveId="email-center-company-layout" className="flex-1 min-h-0 h-full w-full">
        <ResizablePanel id="companies" order={1} defaultSize={20} minSize={14} maxSize={36} className="flex flex-col overflow-hidden bg-slate-50/40 border-r border-slate-200/80">
          <CompaniesSidebar
            companies={companies}
            selectedCompanyId={selected}
            onSelectCompany={onSelect}
            counts={counts}
            unassignedCount={unassignedCount}
            totalCount={companyIds.length}
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
  selectedCompanyId,
  onSelectCompany,
  counts,
  unassignedCount,
  totalCount,
}: {
  companies: Company[]
  selectedCompanyId: string
  onSelectCompany: (id: string) => void
  counts: Record<string, number>
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
      <div className="p-3 border-b border-slate-200/80 shrink-0 bg-white space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-custom-blue" />
            Companies
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md"
            onClick={() => setCategoryFilterOpen(true)}
            title="Filter by client category"
          >
            <Filter className="h-5 w-5" />
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
          <Row icon={<Inbox className="w-5 h-5" />} label="All companies" count={totalCount} active={!selectedCompanyId} onClick={() => onSelectCompany("")} />
          {unassignedCount > 0 && (
            <Row icon={<UserX className="w-5 h-5" />} label="Unassigned" count={unassignedCount} active={selectedCompanyId === UNASSIGNED} onClick={() => onSelectCompany(UNASSIGNED)} />
          )}

          <div className="my-1 border-t border-slate-200/60" />

          {filteredCompanies.map((company) => {
            const compId = String(company.id)
            return (
              <Row
                key={compId}
                icon={<Building2 className="w-5 h-5" />}
                label={company.company_name}
                count={counts[compId] ?? 0}
                active={selectedCompanyId === compId}
                onClick={() => onSelectCompany(compId)}
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
        "flex items-center w-full px-3 py-2 text-base rounded-md transition-colors text-left font-medium",
        active ? "bg-custom-blue text-white shadow-xs" : "text-slate-700 hover:bg-slate-200/60"
      )}
    >
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
    </button>
  )
}
