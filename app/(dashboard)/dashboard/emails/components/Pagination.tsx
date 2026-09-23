"use client"

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { cn } from "@/lib/utils"

// IDM-style pagination bar: sticky bottom, "Showing X to Y of Z", rows-per-page select
// (20/50/100/200) and first/prev/1-5/ellipsis/next/last buttons, on the module's custom-blue
// accent. Mirrors the Individual Document Manager's Pagination, restyled for this app's slate +
// custom-blue tokens.
export function Pagination({
  totalItems,
  itemsPerPage,
  currentPage,
  onPageChange,
  onItemsPerPageChange,
  className,
  sticky = true,
}: {
  totalItems: number
  itemsPerPage: number
  currentPage: number
  onPageChange: (page: number) => void
  onItemsPerPageChange: (items: number) => void
  className?: string
  sticky?: boolean
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
  const safePage = Math.min(currentPage, totalPages - 1)

  const firstItem = totalItems === 0 ? 0 : safePage * itemsPerPage + 1
  const lastItem = Math.min((safePage + 1) * itemsPerPage, totalItems)

  return (
    <div className={cn(sticky && "sticky bottom-0 z-40", "flex items-center justify-between gap-3 px-4 py-2 border-t border-slate-200 bg-white", className)}>
      <div className="flex items-center gap-3">
        <p className="text-xs text-slate-500 font-medium">
          Showing <span className="font-semibold text-slate-900">{firstItem}</span> to{' '}
          <span className="font-semibold text-slate-900">{lastItem}</span> of{' '}
          <span className="font-semibold text-slate-900">{totalItems}</span>
        </p>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          Rows
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 shadow-none focus:ring-1 focus:ring-custom-blue outline-none cursor-pointer"
          >
            {[20, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(0)}
          disabled={safePage === 0}
          title="First page"
          className="h-8 w-8 p-0 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center transition-colors"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(0, safePage - 1))}
          disabled={safePage === 0}
          title="Previous page"
          className="h-8 w-8 p-0 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i).map((pageNum) => (
          <button
            key={pageNum}
            type="button"
            onClick={() => onPageChange(pageNum)}
            className={cn(
              "h-8 min-w-[32px] text-xs px-2.5 rounded-md flex items-center justify-center font-semibold transition-colors",
              safePage === pageNum
                ? "bg-custom-blue text-white shadow-xs"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            {pageNum + 1}
          </button>
        ))}
        {totalPages > 5 && <span className="text-xs text-slate-400 px-1 font-medium">...</span>}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages - 1, safePage + 1))}
          disabled={safePage >= totalPages - 1}
          title="Next page"
          className="h-8 w-8 p-0 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages - 1)}
          disabled={safePage >= totalPages - 1}
          title="Last page"
          className="h-8 w-8 p-0 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center transition-colors"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}