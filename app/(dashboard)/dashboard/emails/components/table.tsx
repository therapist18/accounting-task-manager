"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"

// Table building blocks shared by every table in the Email Center (cases, emails, mailboxes), so
// they all sort, border and stripe the same way the Individual Document Manager's tables do:
// click-to-sort headers, bordered cells and alternating row colours.

export type SortDir = "asc" | "desc"
export interface SortState { key: string; dir: SortDir }

export const TH_CLASS = "px-3 py-2.5 text-base font-semibold border-b border-r border-slate-200/80 whitespace-nowrap"
export const TD_CLASS = "px-3 py-3 text-base text-slate-700 border-b border-r border-slate-200/70 align-top transition-colors"
export const HEAD_NEUTRAL = "bg-slate-100 hover:bg-slate-200/70 text-slate-800"
// Single-colour header, as in the Individual Document Manager — used by the tables that have no banded groups.
export const HEAD_BLUE = "bg-[#376bae] hover:bg-[#376bae]/90 text-white border-white/20"

// Opaque backgrounds (not /40 tints) so sticky cells that use bg-inherit never show content
// scrolling underneath them.
export const zebraRow = (index: number) =>
  index % 2 === 0 ? "bg-white hover:bg-slate-100" : "bg-slate-50 hover:bg-slate-100"

function compare(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" })
}

// One accessor per sortable column; cell rendering stays hand-written in each table.
export function useSortedRows<T>(
  rows: T[],
  accessors: Record<string, (row: T) => string | number>,
  initial: SortState | null
) {
  const [sort, setSort] = useState<SortState | null>(initial)

  const sorted = useMemo(() => {
    if (sort?.key === "#") return sort.dir === "asc" ? rows : [...rows].reverse() // "#" = original order
    const accessor = sort ? accessors[sort.key] : null
    if (!sort || !accessor) return rows
    const dir = sort.dir === "asc" ? 1 : -1
    return [...rows].sort((a, b) => dir * compare(accessor(a), accessor(b)))
    // accessors are module-level constants in every caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort])

  const toggle = (key: string) => {
    if (key !== "#" && !accessors[key]) return
    setSort((cur) => (cur?.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }))
  }

  return { sort, sorted, toggle }
}

export function SortTh({
  id, children, className, sort, onSort, rowSpan, tone = "neutral",
}: {
  id: string
  children: React.ReactNode
  className?: string
  sort: SortState | null
  onSort: (id: string) => void
  rowSpan?: number
  tone?: "neutral" | "blue"
}) {
  const active = sort?.key === id
  const Icon = active ? (sort!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th
      rowSpan={rowSpan}
      onClick={() => onSort(id)}
      className={cn(TH_CLASS, tone === "blue" ? HEAD_BLUE : HEAD_NEUTRAL, className, "cursor-pointer select-none transition-colors group")}
    >
      <div className="inline-flex items-center gap-1.5 justify-between w-full">
        <span>{children}</span>
        <Icon className={cn("h-4 w-4 shrink-0 transition-opacity", active ? "opacity-100" : "opacity-50 group-hover:opacity-90")} />
      </div>
    </th>
  )
}

// Loading placeholder rows for the table body — the toolbar and headers stay put while data loads, so
// there is no full-page spinner, just the table filling in.
export function SkeletonRows({ rows = 8, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className={zebraRow(r)}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className={TD_CLASS}>
              <div className="h-4 rounded bg-slate-200/80 animate-pulse" style={{ width: `${40 + ((r * 7 + c * 13) % 50)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
