"use client"

import { useEffect, useMemo, useState } from "react"
import { Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ImmigrationItem } from "@/lib/immigrationNotifications"
// The Email Center's table toolkit, so this table sorts, filters, stripes and paginates exactly like
// every other table in the app.
import { fmtDateTime } from "../../emails/components/shared"
import { Pagination } from "../../emails/components/Pagination"
import { SortTh, TableLoading, TD_CLASS, useColumnFilters, useTableSort, zebraRow } from "../../emails/components/table"
import { DocumentPreviewDialog } from "./DocumentPreviewDialog"
import { KIND_BADGE, KIND_LABEL, STATUS_BADGE, STATUS_BADGE_FALLBACK } from "./statusStyles"

// Every column, in display order. `filter` columns get a header filter (a checklist of their values,
// or a From/To range for the date columns); hide-able ones are listed in the Columns button.
export const ITEM_COLUMNS = [
  { id: "name", label: "Applicant", filter: true },
  { id: "kind", label: "Record", filter: true },
  { id: "applicationType", label: "Application type", filter: true },
  { id: "status", label: "Status", filter: true },
  { id: "date", label: "Date", filter: true },
  { id: "message", label: "Message / Fee", filter: true },
  { id: "created", label: "Recorded", filter: true },
  { id: "pdf", label: "Document", filter: false },
] as const

export type ItemColumnId = (typeof ITEM_COLUMNS)[number]["id"]

// What each column shows (and sorts / filters / exports on).
export const ITEM_VALUE: Record<ItemColumnId, (i: ImmigrationItem) => string> = {
  name: (i) => i.name,
  kind: (i) => KIND_LABEL[i.kind],
  applicationType: (i) => i.applicationType,
  status: (i) => i.status,
  date: (i) => i.date,
  message: (i) => [i.message, i.amount ? `Amount: ${i.amount}` : ""].filter(Boolean).join(" · "),
  created: (i) => fmtDateTime(i.iso),
  pdf: (i) => i.pdfName || "",
}

const SORT_ACCESSORS: Record<string, (i: ImmigrationItem) => string | number> = {
  ...ITEM_VALUE,
  // Sort the date columns on the real underlying date/time, not the DD/MM/YYYY display text.
  date: (i) => i.dateIso,
  created: (i) => i.iso,
}

const FILTER_VALUES = Object.fromEntries(
  ITEM_COLUMNS.filter((c) => c.filter).map((c) => [c.id, ITEM_VALUE[c.id]]),
) as Record<string, (i: ImmigrationItem) => string>

export function NotificationsTable({
  items,
  loading,
  isVisible,
  onFilteredChange,
  resetKey,
}: {
  items: ImmigrationItem[]
  loading: boolean
  isVisible: (id: string) => boolean
  // The rows after the header filters, in display order — what the page exports.
  onFilteredChange?: (rows: ImmigrationItem[]) => void
  // Changing this (tab / search) jumps back to the first page.
  resetKey?: string
}) {
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [page, setPage] = useState(0)
  // The row whose document is open in the ExtractionPreview dialog (null = closed).
  const [previewItem, setPreviewItem] = useState<ImmigrationItem | null>(null)

  const { filtered, configFor } = useColumnFilters(items, FILTER_VALUES, ["date", "created"])
  const { levels, sorted, toggle } = useTableSort(filtered, SORT_ACCESSORS, [{ key: "#", dir: "asc" }])

  useEffect(() => onFilteredChange?.(sorted), [sorted, onFilteredChange])
  useEffect(() => setPage(0), [resetKey, itemsPerPage, filtered.length])

  const columns = ITEM_COLUMNS.filter((c) => isVisible(c.id))
  const totalPages = Math.max(1, Math.ceil(sorted.length / itemsPerPage))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * itemsPerPage
  const pageRows = useMemo(() => sorted.slice(start, start + itemsPerPage), [sorted, start, itemsPerPage])

  const cell = (i: ImmigrationItem, id: ItemColumnId) => {
    switch (id) {
      case "name":
        return <span className="font-semibold text-slate-900">{ITEM_VALUE.name(i)}</span>
      case "kind":
        return (
          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium", KIND_BADGE[i.kind])}>
            {KIND_LABEL[i.kind]}
          </span>
        )
      case "status":
        return (
          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium", STATUS_BADGE[i.statusKey] ?? STATUS_BADGE_FALLBACK)}>
            {i.status}
          </span>
        )
      case "pdf":
        return i.pdfUrl ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreviewItem(i)}
            title={i.pdfName ? `Preview ${i.pdfName}` : "Preview document"}
            className="h-8 -ml-2 gap-1.5 px-2 font-medium text-green-600 hover:bg-green-50 hover:text-green-700"
          >
            <Eye className="h-4 w-4" />
            Preview
          </Button>
        ) : (
          <span className="text-slate-400">—</span>
        )
      default:
        return ITEM_VALUE[id](i) || <span className="text-slate-400">—</span>
    }
  }

  return (
    <>
      <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
        <table className="w-full min-w-[1500px] border-separate border-spacing-0 text-base">
          <thead className="sticky top-0 z-30 bg-white shadow-xs">
            <tr>
              <SortTh tone="blue" id="#" levels={levels} onSort={toggle} className="w-16 text-center">#</SortTh>
              {columns.map((c, i) => (
                <SortTh
                  key={c.id}
                  tone="blue"
                  id={c.id}
                  levels={levels}
                  onSort={toggle}
                  filter={c.filter ? configFor(c.id) : undefined}
                  className={cn(
                    "text-left min-w-[140px]",
                    c.id === "name" && "min-w-[240px]",
                    c.id === "message" && "min-w-[260px]",
                    i === columns.length - 1 && "border-r-0",
                  )}
                >
                  {c.label}
                </SortTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 && <TableLoading cols={columns.length + 1} label="Loading immigration notifications…" />}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="py-16 text-center text-base text-slate-400">
                  {items.length === 0 ? "No notifications or payments recorded yet." : "Nothing matches these filters."}
                </td>
              </tr>
            )}
            {pageRows.map((i, index) => (
              <tr key={i.key} className={cn("transition-colors", zebraRow(index))}>
                <td className={cn(TD_CLASS, "text-center text-slate-400 tabular-nums")}>{start + index + 1}</td>
                {columns.map((c, ci) => (
                  <td key={c.id} className={cn(TD_CLASS, ci === columns.length - 1 && "border-r-0")}>
                    {cell(i, c.id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <Pagination
          totalItems={sorted.length}
          itemsPerPage={itemsPerPage}
          currentPage={safePage}
          onPageChange={setPage}
          onItemsPerPageChange={setItemsPerPage}
          sticky={false}
          className="shrink-0 border-t border-slate-200"
        />
      </div>

      <DocumentPreviewDialog
        item={previewItem}
        onOpenChange={(open) => !open && setPreviewItem(null)}
      />
    </>
  )
}
