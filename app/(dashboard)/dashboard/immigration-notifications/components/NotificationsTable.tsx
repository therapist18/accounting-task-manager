"use client"

import { useEffect, useMemo, useState } from "react"
import { Eye, Link2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { RELATIONSHIP_LABEL, type ImmigrationItem } from "@/lib/immigrationNotifications"
import { EFNS_FILING_BADGE, EFNS_FILING_LABELS } from "@/lib/efnsFiling"
// The Email Center's table toolkit, so this table sorts, filters, stripes and paginates exactly like
// every other table in the app.
import { fmtDateTime } from "../../emails/components/shared"
import { Pagination } from "../../emails/components/Pagination"
import { SortTh, TableLoading, TD_CLASS, useColumnFilters, useTableSort, zebraRow } from "../../emails/components/table"
import { DocumentPreviewDialog, type FieldPreview } from "./DocumentPreviewDialog"
import { KIND_BADGE, KIND_LABEL, STATUS_BADGE, STATUS_BADGE_FALLBACK } from "./statusStyles"

// Every column, in display order. `filter` columns get a header filter (a checklist of their values,
// or a From/To range for the date columns); hide-able ones are listed in the Columns button.
export const ITEM_COLUMNS = [
  { id: "name", label: "Applicant", filter: true },
  { id: "relationship", label: "Relationship", filter: true },
  { id: "principal", label: "Principal / Company", filter: true },
  { id: "kind", label: "Record", filter: true },
  { id: "applicationType", label: "Application type", filter: true },
  { id: "status", label: "Status", filter: true },
  { id: "date", label: "Date", filter: true },
  { id: "message", label: "Message / Fee", filter: true },
  { id: "created", label: "Recorded", filter: true },
  { id: "filing", label: "Filing", filter: true },
  { id: "pdf", label: "Document", filter: false },
  { id: "link", label: "", filter: false },
] as const

export type ItemColumnId = (typeof ITEM_COLUMNS)[number]["id"]

// What each column shows (and sorts / filters / exports on).
export const ITEM_VALUE: Record<ItemColumnId, (i: ImmigrationItem) => string> = {
  // The applicant alone; who they're a dependant of / applied under is in the next two columns.
  name: (i) => i.applicant,
  relationship: (i) => RELATIONSHIP_LABEL[i.relationship],
  principal: (i) => i.principalName || i.companyName || "",
  kind: (i) => KIND_LABEL[i.kind],
  applicationType: (i) => i.applicationType,
  status: (i) => i.status,
  date: (i) => i.date,
  message: (i) => [i.message, i.amount ? `Amount: ${i.amount}` : ""].filter(Boolean).join(" · "),
  created: (i) => fmtDateTime(i.iso),
  filing: (i) => {
    if (!i.filingStatus) return "Not processed"
    const base = EFNS_FILING_LABELS[i.filingStatus]
    const task = i.filing?.task_id ? ` · Task #${i.filing.task_id}` : ""
    return `${base}${task}`
  },
  pdf: (i) => i.pdfName || "",
  link: () => "",
}

const RELATIONSHIP_BADGE: Record<ImmigrationItem["relationship"], string> = {
  principal: "border-blue-200 bg-blue-50 text-blue-700",
  dependant: "border-violet-200 bg-violet-50 text-violet-700",
  company: "border-amber-200 bg-amber-50 text-amber-700",
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
  onLink,
  onDelete,
  fieldPreviews,
}: {
  items: ImmigrationItem[]
  loading: boolean
  isVisible: (id: string) => boolean
  // The rows after the header filters, in display order — what the page exports.
  onFilteredChange?: (rows: ImmigrationItem[]) => void
  // Changing this (tab / search) jumps back to the first page.
  resetKey?: string
  // Opens the manual link dialog for a row.
  onLink?: (item: ImmigrationItem) => void
  // Opens the delete (and re-capture) dialog for a row.
  onDelete?: (item: ImmigrationItem) => void
  // Each row's document-type fields (loaded with the list), keyed by item key.
  fieldPreviews?: Record<string, FieldPreview>
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
        return <span className="font-semibold text-slate-900" title={i.name}>{ITEM_VALUE.name(i)}</span>
      case "relationship":
        return (
          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium", RELATIONSHIP_BADGE[i.relationship])}>
            {RELATIONSHIP_LABEL[i.relationship]}
          </span>
        )
      case "principal":
        if (i.principalName) {
          return (
            <span className="text-slate-700">
              <span className="text-xs text-slate-400">Principal · </span>
              {i.principalName}
            </span>
          )
        }
        if (i.companyName) {
          return (
            <span className="text-slate-700">
              <span className="text-xs text-slate-400">Company · </span>
              {i.companyName}
            </span>
          )
        }
        return <span className="text-slate-400">—</span>
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
      case "message": {
        // One line, so long portal messages don't stretch the row; the full text is on hover.
        const text = ITEM_VALUE.message(i)
        return text ? (
          <span className="block max-w-[320px] truncate" title={text}>{text}</span>
        ) : (
          <span className="text-slate-400">—</span>
        )
      }
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
      case "filing":
        if (!i.filingStatus) {
          return <span className="text-slate-400">Not processed</span>
        }
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                EFNS_FILING_BADGE[i.filingStatus],
              )}
            >
              {EFNS_FILING_LABELS[i.filingStatus]}
            </span>
            {i.filing?.task_id && (
              <span className="text-[11px] text-slate-500">
                → Task #{i.filing.task_id}
                {i.filing.individual_id != null ? ` · Ind #${i.filing.individual_id}` : ""}
              </span>
            )}
            {i.filingStatus === "filed" && i.filing && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[10px] font-semibold",
                  (i.filing.linked_by ?? (i.filing.matched_by === "manual" ? "staff" : "auto")) === "auto" ? "bg-sky-100 text-sky-700" : "bg-slate-200 text-slate-700",
                )}
                title={i.filing.mode === "replace" ? "Replaced the stage’s previous document" : i.filing.mode === "add" ? "Added alongside the stage’s document" : undefined}
              >
                {(i.filing.linked_by ?? (i.filing.matched_by === "manual" ? "staff" : "auto")) === "auto" ? "Auto-linked" : "Linked by staff"}
                {i.filing.mode === "replace" ? " · replaced" : i.filing.mode === "add" ? " · added" : ""}
              </span>
            )}
            {i.filing?.error && <span className="text-[11px] text-red-500 max-w-[220px] line-clamp-2" title={i.filing.error}>{i.filing.error}</span>}
          </div>
        )
      case "link":
        return (
          <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onLink?.(i)}
            disabled={!onLink}
            title={i.filingStatus === "filed" ? "Re-link or file to another task" : "Link this record to a task, stage and individual"}
            className="h-8 -ml-2 gap-1.5 px-2 font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700"
          >
            <Link2 className="h-4 w-4" />
            {i.filingStatus === "filed" ? "Re-link" : "Link"}
          </Button>
          {onDelete && i.id != null && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(i)}
              title="Delete this record (optionally re-capture it from EFNS)"
              className="h-8 w-8 p-0 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          </div>
        )
      default:
        return ITEM_VALUE[id](i) || <span className="text-slate-400">—</span>
    }
  }

  // Sticky columns: # and Applicant pin to the left, the Link action to the right, so a row stays
  // identifiable and actionable while the wide middle scrolls. Body cells inherit the row's (zebra /
  // hover) background so scrolled content doesn't show through.
  const stickyClass = (id: string, head: boolean) => {
    const base = head ? "sticky z-40" : "sticky z-10 bg-inherit"
    if (id === "#") return cn(base, "left-0")
    if (id === "name") return cn(base, "left-16 shadow-[inset_-1px_0_0_rgb(226_232_240)]")
    if (id === "link") return cn(base, "right-0 shadow-[inset_1px_0_0_rgb(226_232_240)]")
    return ""
  }

  return (
    <>
      <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
        <table className="w-full min-w-[1500px] border-separate border-spacing-0 text-base">
          <thead className="sticky top-0 z-30 bg-white shadow-xs">
            <tr>
              <SortTh tone="blue" id="#" levels={levels} onSort={toggle} className={cn("w-16 min-w-16 max-w-16 text-center", stickyClass("#", true))}>#</SortTh>
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
                    c.id === "principal" && "min-w-[240px]",
                    c.id === "message" && "w-[340px] min-w-[260px] max-w-[340px]",
                    i === columns.length - 1 && "border-r-0",
                    stickyClass(c.id, true),
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
                <td className={cn(TD_CLASS, "text-center text-slate-400 tabular-nums", stickyClass("#", false))}>{start + index + 1}</td>
                {columns.map((c, ci) => (
                  <td key={c.id} className={cn(TD_CLASS, ci === columns.length - 1 && "border-r-0", stickyClass(c.id, false))}>
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
        preview={previewItem ? fieldPreviews?.[previewItem.key] ?? null : null}
        onOpenChange={(open) => !open && setPreviewItem(null)}
      />
    </>
  )
}
