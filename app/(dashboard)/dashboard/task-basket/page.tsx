"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { differenceInCalendarDays } from "date-fns"
import { CheckCheck, Download, Filter, Inbox, Loader2, Trash2, X } from "lucide-react"
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
import BulkResolveDialog from "./components/BulkResolveDialog"
import BulkDeleteDialog from "./components/BulkDeleteDialog"

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
  {
    header: "Comments", width: 40, wrap: true,
    value: (r) => r.comments
      .map((c) => `${c.account ? `${c.account}: ` : ""}${c.text}${c.expected_date ? ` (expected ${c.expected_date})` : ""}`)
      .join("\n"),
  },
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
  // Companies that explained the delay (client response / account note) vs. ones that went silent.
  const [commentFilter, setCommentFilter] = useState<"all" | "with" | "without">("all")
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
    const byComments = commentFilter === "all"
      ? items
      : items.filter((item) => item.has_comments === (commentFilter === "with"))
    if (!categoryFilters) return byComments
    // A basket row whose company isn't in the company list (deleted, or only present under a
    // different id) is kept rather than hidden: an overdue compliance item must never disappear
    // just because it can't be categorised.
    return byComments.filter(
      (item) => !companyById.has(String(item.company_id)) ||
        companyMatchesCategoryFilters(companyById.get(String(item.company_id)), categoryFilters)
    )
  }, [items, companyById, categoryFilters, commentFilter])

  const openCount = useMemo(() => items.filter((i) => i.status === "open").length, [items])
  const categoryActive = !!categoryFilters && Object.values(categoryFilters.categories || {}).some(Boolean)
  const [exporting, setExporting] = useState(false)

  // Bulk selection. Held here (not in the table) so the action bar can sit in the page chrome, and
  // pruned whenever the visible list changes: a filter change or a deleted row must never leave a
  // hidden id selected, because a bulk Delete/Resolve would then act on rows the user can't see.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkResolveOpen, setBulkResolveOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  useEffect(() => {
    setSelectedIds((prev) => {
      if (!prev.size) return prev
      const visible = new Set(visibleItems.map((i) => i.id))
      const next = new Set([...prev].filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [visibleItems])

  const selectedItems = useMemo(
    () => visibleItems.filter((i) => selectedIds.has(i.id)),
    [visibleItems, selectedIds]
  )
  const selectedOpenCount = useMemo(() => selectedItems.filter((i) => i.status === "open").length, [selectedItems])

  // Exports exactly what's on screen (the current filter's full list, not just the page) — or just the
  // ticked rows when called with them — and prints the Total / Completed / Missing figures the stats
  // bar shows into the workbook's header band.
  const handleExport = async (rows: TaskBasketItem[] = visibleItems) => {
    if (!rows.length) return
    setExporting(true)
    try {
      const completed = rows.filter((i) => i.status === "resolved").length
      const missing = rows.length - completed
      const filterNotes = [
        rows !== visibleItems ? `${rows.length} selected row${rows.length === 1 ? "" : "s"}` : null,
        moduleFilter !== "all" ? `Module: ${TASK_BASKET_MODULE_LABELS[moduleFilter]}` : "All modules",
        `Status: ${statusFilter}`,
        commentFilter !== "all" ? (commentFilter === "with" ? "With comments only" : "Without comments only") : null,
        `Cycle: ${cycleMonth}`,
        categoryActive ? "Client category filter applied" : "No client category filter",
      ].filter(Boolean).join(" · ")
      await exportRowsToExcel({
        title: "Task Basket",
        subtitle: filterNotes,
        sheetName: "Task Basket",
        filename: timestampedFilename(`task-basket-${cycleMonth}`),
        columns: EXPORT_COLUMNS,
        rows,
        stats: [
          { label: "Total", value: rows.length },
          { label: "Missing", value: missing, color: missing > 0 ? "FFDC2626" : "FF94A3B8" },
          { label: "Completed", value: completed, color: "FF059669" },
        ],
      })
      toast({ title: "Exported", description: `${rows.length} rows written to Excel.` })
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-50/50">
      {/* One compact toolbar row (identity + filters + actions), like the Email Center's header rows */}
      <div className="border-b border-slate-200/80 bg-white px-4 py-2.5 antialiased flex items-center gap-x-3 gap-y-2 flex-wrap shrink-0">
        <div className="h-9 w-9 rounded-lg bg-custom-blue flex items-center justify-center shrink-0">
          <Inbox className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Task Basket</h1>
        <span
          className="hidden md:inline text-base text-slate-500"
          title="Companies past a compliance deadline — Reception's shared open list"
        >
          {openCount} open
        </span>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
        <Select value={moduleFilter} onValueChange={(v) => setModuleFilter(v as TaskBasketModule | "all")}>
          <SelectTrigger className="w-[220px] h-10 text-base bg-white">
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
          <SelectTrigger className="w-[160px] h-10 text-base bg-white">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>

        <Select value={commentFilter} onValueChange={(v) => setCommentFilter(v as "all" | "with" | "without")}>
          <SelectTrigger className="w-[190px] h-10 text-base bg-white" title="Companies that explained the delay vs. ones that didn't">
            <SelectValue placeholder="Comments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All (comments or not)</SelectItem>
            <SelectItem value="with">Has comments</SelectItem>
            <SelectItem value="without">No comments</SelectItem>
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
          onClick={() => handleExport()}
          disabled={exporting || visibleItems.length === 0}
          className={PILL_BUTTON_CLASS}
          title="Download the filtered rows as a styled Excel file"
        >
          {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />} Export
        </Button>
        </div>
      </div>

      {/* Bulk action bar — only while something is ticked, so it costs no space the rest of the time */}
      {selectedItems.length > 0 && (
        <div className="shrink-0 border-b border-blue-200 bg-blue-50 px-4 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-base font-semibold text-blue-900">
            {selectedItems.length} selected
          </span>
          <span className="hidden md:inline text-sm text-blue-700">
            {selectedOpenCount} open · {selectedItems.length - selectedOpenCount} resolved
          </span>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className={PILL_BUTTON_CLASS}
              disabled={selectedOpenCount === 0}
              onClick={() => setBulkResolveOpen(true)}
              title={selectedOpenCount === 0 ? "No open rows in the selection" : "Mark the selected open rows as resolved"}
            >
              <CheckCheck className="h-5 w-5" /> Mark resolved
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={PILL_BUTTON_CLASS}
              disabled={exporting}
              onClick={() => handleExport(selectedItems)}
              title="Download only the selected rows as an Excel file"
            >
              {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />} Export selected
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn(PILL_BUTTON_CLASS, "text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700")}
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="h-5 w-5" /> Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              title="Clear the selection"
            >
              <X className="h-5 w-5" /> Clear
            </Button>
          </div>
        </div>
      )}

      {/* Body — the table owns its scrolling and fills whatever height is left */}
      <div className="px-3 py-3 flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex flex-col flex-1 min-h-0 border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
        <TaskBasketTable
          items={visibleItems}
          loading={loading}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onItemResolved={(id) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "resolved" } : i)))}
          onItemDeleted={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
        />
        </div>
      </div>

      <BulkResolveDialog
        items={selectedItems}
        open={bulkResolveOpen}
        onOpenChange={setBulkResolveOpen}
        // Reload instead of patching rows locally: the server stamps resolved_by/resolved_at, and the
        // table's "Resolved … by …" line would read "automatically" until the next refresh.
        onResolved={() => { setSelectedIds(new Set()); load() }}
      />
      <BulkDeleteDialog
        items={selectedItems}
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        onDeleted={(ids) => {
          const gone = new Set(ids)
          setItems((prev) => prev.filter((i) => !gone.has(i.id)))
          setSelectedIds(new Set())
        }}
      />
    </div>
  )
}
