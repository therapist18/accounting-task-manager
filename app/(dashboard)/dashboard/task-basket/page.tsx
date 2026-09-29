"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { differenceInCalendarDays } from "date-fns"
import { Download, Filter, Inbox, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/lib/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  getTaskBasketItems,
  TaskBasketItem,
  TaskBasketModule,
  TaskBasketStatus,
  TASK_BASKET_MODULE_LABELS,
} from "@/lib/supabase/taskBasket"
// The app-wide Client Category Filter (ACC / IMM / Audit / Sheria, by client and operational status)
// plus its predicate — the same pair the Email Center's company panels and sidebars use, so a
// category selected here means the same thing as it does everywhere else.
import ClientCategoryFilter from "@/app/generic-components/ClientCategoryFilter"
import {
  companyMatchesCategoryFilters,
  DEFAULT_CATEGORY_FILTERS,
  type FilterState,
} from "@/app/generic-components/companyCategoryFilters"
import { fetchCompanies, type Company } from "../companies/database"
import { exportRowsToExcel, timestampedFilename, type ExcelColumn } from "../emails/components/excelExport"
import { PILL_BUTTON_ACTIVE_CLASS, PILL_BUTTON_CLASS } from "../emails/components/shared"
import TaskBasketTable from "./components/TaskBasketTable"

function currentCycleMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function daysSince(iso: string): number {
  return Math.max(0, differenceInCalendarDays(new Date(), new Date(iso)))
}

// The Export column set mirrors the table one-for-one (minus the actions column): the reader gets the
// same layout it just saw on screen, plus Contact value (the on-screen cell only previews two names).
const EXPORT_COLUMNS: ExcelColumn<TaskBasketItem>[] = [
  { header: "#", width: 6, align: "center", value: (_r, i) => String(i + 1) },
  { header: "Company ID", width: 12, align: "right", value: (r) => String(r.company_id) },
  { header: "Company", width: 30, value: (r) => r.company_name },
  { header: "Module", width: 18, value: (r) => TASK_BASKET_MODULE_LABELS[r.module] },
  { header: "Cycle", width: 10, value: (r) => r.cycle_month },
  {
    header: "Contact", width: 32, wrap: true,
    value: (r) => r.contact_summary.map((c) => `${c.name} (${c.channel}: ${c.value})`).join("\n") || "No contact configured",
  },
  { header: "Reason", width: 40, wrap: true, value: (r) => r.reason },
  { header: "Triggered", width: 14, value: (r) => new Date(r.triggered_at).toISOString().slice(0, 10) },
  { header: "Overdue (days)", width: 14, align: "right", value: (r) => (r.status === "open" ? String(daysSince(r.triggered_at)) : "—") },
  { header: "Status", width: 12, value: (r) => (r.status === "open" ? "Open" : "Resolved") },
  { header: "Resolution note", width: 34, wrap: true, value: (r) => r.resolution_note || (r.status === "resolved" ? "Resolved" : "") },
]

export default function TaskBasketPage() {
  const [items, setItems] = useState<TaskBasketItem[]>([])
  const [loading, setLoading] = useState(true)
  const [moduleFilter, setModuleFilter] = useState<TaskBasketModule | "all">("all")
  const [statusFilter, setStatusFilter] = useState<TaskBasketStatus | "all">("open")
  const [cycleMonth, setCycleMonth] = useState(currentCycleMonth())
  // Full company records (ACC/IMM/Audit/Sheria effective dates + cease details) — the thin row the
  // basket read needs for a company name isn't enough for the category filter to judge a company.
  const [companies, setCompanies] = useState<Company[]>([])
  const [categoryFilters, setCategoryFilters] = useState<FilterState | null>(DEFAULT_CATEGORY_FILTERS)
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getTaskBasketItems({ module: moduleFilter, status: statusFilter, cycleMonth })
      setItems(data)
    } catch (error: any) {
      toast({ title: "Failed to load task basket", description: error.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [moduleFilter, statusFilter, cycleMonth, toast])

  useEffect(() => {
    load()
  }, [load])

  // Companies barely change within a session, and the category filter is a client-side predicate, so
  // this is fetched once — moving a filter never triggers a network call.
  useEffect(() => {
    fetchCompanies()
      .then(setCompanies)
      .catch((e: any) => toast({ title: "Failed to load companies", description: e.message, variant: "destructive" }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const companyById = useMemo(
    () => new Map(companies.map((c) => [String(c.id), c])),
    [companies]
  )

  const visibleItems = useMemo(() => {
    if (!categoryFilters) return items
    // A basket row whose company isn't in the company list (deleted, or only present under a
    // different id) is kept rather than hidden: an overdue compliance item must never disappear
    // just because it can't be categorised.
    return items.filter(
      (item) => !companyById.has(String(item.company_id)) ||
        companyMatchesCategoryFilters(companyById.get(String(item.company_id)), categoryFilters)
    )
  }, [items, companyById, categoryFilters])

  const openCount = useMemo(() => items.filter((i) => i.status === "open").length, [items])
  const categoryActive = !!categoryFilters && Object.values(categoryFilters.categories || {}).some(Boolean)
  const [exporting, setExporting] = useState(false)

  // Exports exactly what's on screen (the current filter's full list, not just the page), and prints
  // the Total / Completed / Missing figures the stats bar shows into the workbook's header band.
  const handleExport = async () => {
    if (!visibleItems.length) return
    setExporting(true)
    try {
      const completed = visibleItems.filter((i) => i.status === "resolved").length
      const missing = visibleItems.length - completed
      const filterNotes = [
        moduleFilter !== "all" ? `Module: ${TASK_BASKET_MODULE_LABELS[moduleFilter]}` : "All modules",
        `Status: ${statusFilter}`,
        `Cycle: ${cycleMonth}`,
        categoryActive ? "Client category filter applied" : "No client category filter",
      ].join(" · ")
      await exportRowsToExcel({
        title: "Task Basket",
        subtitle: filterNotes,
        sheetName: "Task Basket",
        filename: timestampedFilename(`task-basket-${cycleMonth}`),
        columns: EXPORT_COLUMNS,
        rows: visibleItems,
        stats: [
          { label: "Total", value: visibleItems.length },
          { label: "Missing", value: missing, color: missing > 0 ? "FFDC2626" : "FF94A3B8" },
          { label: "Completed", value: completed, color: "FF059669" },
        ],
      })
      toast({ title: "Exported", description: `${visibleItems.length} rows written to Excel.` })
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-6 h-full flex flex-col bg-[#FAFAFC]">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-custom-blue flex items-center justify-center">
            <Inbox className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Task Basket</h1>
            <p className="text-xs text-slate-500">
              Companies past a compliance deadline — Reception's shared open list ({openCount} open)
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4 shrink-0">
        <Select value={moduleFilter} onValueChange={(v) => setModuleFilter(v as TaskBasketModule | "all")}>
          <SelectTrigger className="w-[220px] h-10 text-base">
            <SelectValue placeholder="Module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {Object.entries(TASK_BASKET_MODULE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskBasketStatus | "all")}>
          <SelectTrigger className="w-[160px] h-10 text-base">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>

        <input
          type="month"
          value={cycleMonth}
          onChange={(e) => setCycleMonth(e.target.value)}
          className="h-10 rounded-md border border-input bg-transparent px-3 text-base shadow-sm"
        />

        <Button
          variant="outline"
          size="sm"
          onClick={() => setCategoryFilterOpen(true)}
          className={cn(PILL_BUTTON_CLASS, categoryActive && PILL_BUTTON_ACTIVE_CLASS)}
          title="Filter companies by client category"
        >
          <Filter className="h-5 w-5" /> Client category
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting || visibleItems.length === 0}
          className={PILL_BUTTON_CLASS}
          title="Download the filtered rows as a styled Excel file"
        >
          {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />} Export
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
        <TaskBasketTable
          items={visibleItems}
          loading={loading}
          onItemResolved={(id) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "resolved" } : i)))}
          onItemDeleted={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
        />
      </div>
    </div>
  )
}
