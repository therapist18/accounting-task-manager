"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Filter, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// Table building blocks shared by every table in the Email Center (cases, emails, rules), so they all
// sort, filter, border and stripe the same way the Individual Document Manager's tables do:
// click-to-sort (shift-click to add another sort level) headers, per-column filters, a
// total/completed/missing stats bar, column visibility, bordered cells and alternating row colours.

export type SortDir = "asc" | "desc"
export interface SortLevel { key: string; dir: SortDir }

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

// Multi-column ("multisort") sort: a plain click sorts by that column alone, cycling asc -> desc ->
// off; a shift-click instead adds (or advances, or drops) that column as an extra tie-breaking level
// on top of whatever is already active — the same convention as a spreadsheet, so ties on the first
// sorted column fall back to the second, then the third. Cell rendering stays hand-written per table;
// this only owns the ordering.
export function useTableSort<T>(
  rows: T[],
  accessors: Record<string, (row: T) => string | number>,
  initial: SortLevel[]
) {
  const [levels, setLevels] = useState<SortLevel[]>(initial)

  const sorted = useMemo(() => {
    if (levels.length === 1 && levels[0].key === "#") return levels[0].dir === "asc" ? rows : [...rows].reverse() // "#" = original order
    const active = levels.filter((l) => l.key !== "#" && accessors[l.key])
    if (!active.length) return rows
    return [...rows].sort((a, b) => {
      for (const { key, dir } of active) {
        const cmp = compare(accessors[key](a), accessors[key](b))
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp
      }
      return 0
    })
    // accessors are module-level constants in every caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, levels])

  const toggle = (key: string, additive = false) => {
    if (key !== "#" && !accessors[key]) return
    setLevels((cur) => {
      if (!additive || key === "#") {
        // plain click: this column becomes the only sort, cycling asc -> desc -> off
        if (cur.length === 1 && cur[0].key === key) return cur[0].dir === "asc" ? [{ key, dir: "desc" }] : []
        return [{ key, dir: "asc" }]
      }
      const idx = cur.findIndex((l) => l.key === key)
      if (idx === -1) return [...cur, { key, dir: "asc" }] // shift-click: add as another sort level
      if (cur[idx].dir === "asc") return cur.map((l, i) => (i === idx ? { key, dir: "desc" } : l))
      return cur.filter((_, i) => i !== idx) // third shift-click on the same column: drop that level
    })
  }

  return { levels, sorted, toggle }
}

// A single column's header filter: normally a funnel icon that opens a searchable checklist of the
// column's distinct values (computed by the caller — usually from every row, not just what other
// filters have already narrowed down, so the option list doesn't shrink out from under you as you
// filter). A date/timestamp column instead gets a From / To range: each end can be just a year
// ("2021"), a month ("03/2021") or a full date ("14/03/2021"), so "2021 to 2026" works without having
// to hunt for (and tick) every exact timestamp that falls in it. Either end can be left blank.
export interface DateRange { from: string; to: string }
export type ColumnFilterConfig =
  | { kind: "checklist"; options: string[]; selected: Set<string>; onToggle: (value: string) => void; onClear: () => void }
  | { kind: "daterange"; value: DateRange; onChange: (value: DateRange) => void; onClear: () => void }

// "2021" | "03/2021" | "14/03/2021" (also accepts - and . as separators) -> the first or last day it
// covers as YYYY-MM-DD, or null when it isn't a date. `end` picks the last day instead of the first, so
// a "To" of "2026" includes all of 2026 and a "From" of "2021" starts on 1 January 2021.
export function parseDateBound(raw: string, end: boolean): string | null {
  const t = raw.trim()
  if (!t) return null
  const parts = t.split(/[/.-]/).map((x) => x.trim())
  if (parts.some((x) => !/^\d+$/.test(x))) return null
  const pad = (n: number) => String(n).padStart(2, "0")
  let y: number
  let m: number | null = null
  let d: number | null = null
  if (parts.length === 1 && parts[0].length === 4) y = Number(parts[0])
  else if (parts.length === 2 && parts[1].length === 4) { m = Number(parts[0]); y = Number(parts[1]) }
  else if (parts.length === 3 && parts[2].length === 4) { d = Number(parts[0]); m = Number(parts[1]); y = Number(parts[2]) }
  else return null
  if (m !== null && (m < 1 || m > 12)) return null
  if (d !== null && (d < 1 || d > new Date(y, m!, 0).getDate())) return null
  if (m === null) return `${y}-${end ? "12-31" : "01-01"}`
  if (d === null) return `${y}-${pad(m)}-${end ? pad(new Date(y, m, 0).getDate()) : "01"}`
  return `${y}-${pad(m)}-${pad(d)}`
}

// A column's displayed value is "DD/MM/YYYY" optionally followed by a time — pull the date out of it.
function displayedDateToYmd(v: string): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(v)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function inDateRange(displayed: string, range: DateRange): boolean {
  const from = parseDateBound(range.from, false)
  const to = parseDateBound(range.to, true)
  if (!from && !to) return true
  const ymd = displayedDateToYmd(displayed)
  if (!ymd) return false
  return (!from || ymd >= from) && (!to || ymd <= to)
}

const rangeActive = (r: DateRange | undefined) => !!r && (r.from.trim() !== "" || r.to.trim() !== "")

function ColumnFilterButton({ filter, tone }: { filter: ColumnFilterConfig; tone: "neutral" | "blue" }) {
  const [q, setQ] = useState("")
  const active = filter.kind === "daterange" ? rangeActive(filter.value) : filter.selected.size > 0
  const shown = filter.kind === "checklist" && q ? filter.options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : filter.kind === "checklist" ? filter.options : []
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          title="Filter this column"
          className={cn(
            "h-5 w-5 rounded flex items-center justify-center shrink-0 transition-colors",
            active
              ? tone === "blue" ? "bg-white text-[#376bae]" : "bg-custom-blue text-white"
              : tone === "blue" ? "text-white/70 hover:text-white hover:bg-white/15" : "text-slate-500 hover:text-slate-900 hover:bg-slate-300/50"
          )}
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        {filter.kind === "daterange" ? (
          <div className="p-2.5 space-y-2">
            {([["from", "From"], ["to", "To"]] as const).map(([k, label], i) => {
              const bad = filter.value[k].trim() !== "" && parseDateBound(filter.value[k], k === "to") === null
              return (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-10 text-sm text-slate-500 shrink-0">{label}</span>
                  <Input
                    value={filter.value[k]}
                    onChange={(e) => filter.onChange({ ...filter.value, [k]: e.target.value })}
                    placeholder={k === "from" ? "e.g. 2021" : "e.g. 2026"}
                    className={cn("h-8 text-sm", bad && "border-red-400 focus-visible:ring-red-400")}
                    autoFocus={i === 0}
                  />
                </div>
              )
            })}
            <p className="text-xs text-slate-400 px-0.5">
              Each end can be a year (2021), a month (03/2021) or a full date (14/03/2021). Leave one blank for “from then on” / “up to then”.
            </p>
          </div>
        ) : (
          <>
            {filter.options.length > 8 && (
              <div className="p-2 border-b border-slate-100">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 text-sm" autoFocus />
              </div>
            )}
            <div className="max-h-64 overflow-y-auto py-1">
              {shown.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">No values.</div>}
              {shown.map((o) => (
                <label key={o} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer">
                  <Checkbox checked={filter.selected.has(o)} onCheckedChange={() => filter.onToggle(o)} />
                  <span className="truncate font-normal text-slate-700">{o}</span>
                </label>
              ))}
            </div>
          </>
        )}
        {active && (
          <div className="border-t border-slate-100 p-1.5">
            <button type="button" onClick={filter.onClear} className="w-full text-center text-sm text-custom-blue hover:underline py-1">Clear filter</button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// Per-column filters over a row set: each key in `getValue` is a column id, the accessor its
// filterable text. Options for a checklist column are drawn from `rows` as given (not re-narrowed by
// other active filters), so opening one column's filter never hides values another filter would still
// allow. `textColumns` marks the date/timestamp columns, which get a From / To date range instead of a
// checklist (their displayed "DD/MM/YYYY[ HH:mm]" value is what gets compared).
export function useColumnFilters<T>(rows: T[], getValue: Record<string, (row: T) => string>, textColumns: string[] = []) {
  const [checklist, setChecklist] = useState<Record<string, Set<string>>>({})
  const [range, setRange] = useState<Record<string, DateRange>>({})
  const isDate = (key: string) => textColumns.includes(key)

  const filtered = useMemo(() => {
    const checklistKeys = Object.keys(checklist).filter((k) => checklist[k]?.size)
    const rangeKeys = Object.keys(range).filter((k) => rangeActive(range[k]))
    if (!checklistKeys.length && !rangeKeys.length) return rows
    return rows.filter(
      (r) =>
        checklistKeys.every((k) => checklist[k].has(getValue[k]?.(r) ?? "")) &&
        rangeKeys.every((k) => inDateRange(getValue[k]?.(r) ?? "", range[k]))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, checklist, range])

  const optionsFor = (key: string) =>
    Array.from(new Set(rows.map((r) => getValue[key]?.(r) ?? "").filter((v) => v !== ""))).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    )

  const toggle = (key: string, value: string) =>
    setChecklist((f) => {
      const set = new Set(f[key] ?? [])
      set.has(value) ? set.delete(value) : set.add(value)
      return { ...f, [key]: set }
    })

  const clear = (key: string) => {
    setChecklist((f) => { const next = { ...f }; delete next[key]; return next })
    setRange((t) => { const next = { ...t }; delete next[key]; return next })
  }
  const clearAll = () => { setChecklist({}); setRange({}) }
  const activeCount =
    Object.values(checklist).filter((s) => s?.size).length + Object.values(range).filter(rangeActive).length

  const configFor = (key: string): ColumnFilterConfig =>
    isDate(key)
      ? { kind: "daterange", value: range[key] ?? { from: "", to: "" }, onChange: (value) => setRange((t) => ({ ...t, [key]: value })), onClear: () => clear(key) }
      : { kind: "checklist", options: optionsFor(key), selected: checklist[key] ?? new Set(), onToggle: (value) => toggle(key, value), onClear: () => clear(key) }

  return { filtered, configFor, clearAll, activeCount }
}

export function SortTh({
  id, children, className, levels, onSort, rowSpan, tone = "neutral", filter,
}: {
  id: string
  children: React.ReactNode
  className?: string
  levels: SortLevel[]
  onSort: (id: string, additive?: boolean) => void
  rowSpan?: number
  tone?: "neutral" | "blue"
  filter?: ColumnFilterConfig
}) {
  const idx = levels.findIndex((l) => l.key === id)
  const active = idx !== -1
  const dir = active ? levels[idx].dir : null
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th
      rowSpan={rowSpan}
      onClick={(e) => onSort(id, e.shiftKey)}
      title="Click to sort. Shift-click to sort by more than one column."
      className={cn(TH_CLASS, tone === "blue" ? HEAD_BLUE : HEAD_NEUTRAL, className, "cursor-pointer select-none transition-colors group")}
    >
      <div className="inline-flex items-center gap-1.5 justify-between w-full">
        <span className="truncate">{children}</span>
        <span className="inline-flex items-center gap-1.5 shrink-0">
          {filter && <ColumnFilterButton filter={filter} tone={tone} />}
          {active && levels.length > 1 && (
            <span className={cn("text-[10px] font-bold rounded-full w-3.5 h-3.5 inline-flex items-center justify-center leading-none", tone === "blue" ? "bg-white/25" : "bg-slate-300 text-slate-700")}>
              {idx + 1}
            </span>
          )}
          <Icon className={cn("h-4 w-4 shrink-0 transition-opacity", active ? "opacity-100" : "opacity-50 group-hover:opacity-90")} />
        </span>
      </div>
    </th>
  )
}

// Column visibility: a "Columns" button with a checklist, driven by a plain `Record<id, boolean>` (a
// missing/true entry means visible) so callers can seed it straight into useState.
export function useColumnVisibility(columns: { id: string; label: string }[], initiallyHidden: string[] = []) {
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    const v: Record<string, boolean> = {}
    columns.forEach((c) => { v[c.id] = !initiallyHidden.includes(c.id) })
    return v
  })
  const isVisible = (id: string) => visible[id] !== false
  const toggle = (id: string) => setVisible((v) => ({ ...v, [id]: !isVisible(id) }))
  const showAll = () => setVisible(() => {
    const v: Record<string, boolean> = {}
    columns.forEach((c) => { v[c.id] = true })
    return v
  })
  return { visible, isVisible, toggle, showAll }
}

// Also usable for any other show/hide checklist (e.g. which stats rows to show): pass `label` and `icon`.
export function ColumnVisibilityButton({
  columns, visible, onToggle, onShowAll, label = "Columns", icon: Icon = Columns3,
}: {
  columns: { id: string; label: string }[]
  visible: Record<string, boolean>
  onToggle: (id: string) => void
  onShowAll: () => void
  label?: string
  icon?: React.ComponentType<{ className?: string }>
}) {
  const hiddenCount = columns.filter((c) => visible[c.id] === false).length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 px-3 gap-1.5 rounded-full border-slate-200 text-base font-medium">
          <Icon className="h-4 w-4" /> {label}{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <div className="max-h-80 overflow-y-auto py-1">
          {columns.map((c) => (
            <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer">
              <Checkbox checked={visible[c.id] !== false} onCheckedChange={() => onToggle(c.id)} />
              <span className="truncate font-normal text-slate-700">{c.label}</span>
            </label>
          ))}
        </div>
        {hiddenCount > 0 && (
          <div className="border-t border-slate-100 p-1.5">
            <button type="button" onClick={onShowAll} className="w-full text-center text-sm text-custom-blue hover:underline py-1">Show all</button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// Total / Completed / Missing, one triple per tracked column — same convention as the
// company-related-banks module: "Completed" is a non-empty value, "Missing" is blank, "-", "—",
// "n/a" or "none". Rendered as a compact bar above the table (not extra <thead> rows), so it stays
// correct regardless of sticky columns or banded headers.
const EMPTY_VALUES = new Set(["", "-", "—", "n/a", "none", "missing"])

export function columnStats<T>(rows: T[], getValue: (row: T) => string) {
  let completed = 0
  for (const r of rows) {
    const v = (getValue(r) ?? "").trim().toLowerCase()
    if (!EMPTY_VALUES.has(v)) completed++
  }
  return { total: rows.length, completed, missing: rows.length - completed }
}

// One column, left to right exactly as the real header renders it. A column with no `getValue` (the
// index column, an actions column) never carries a count — only the first such column gets the row's
// label ("Total" / "Completed" / "Missing"), the rest stay blank, matching how a header cell with
// nothing to show stays blank rather than repeating the label.
export interface StatsColumn<T> {
  id: string
  getValue?: (row: T) => string
  className?: string
}

const STAT_KINDS: Array<{ key: "total" | "completed" | "missing"; label: string }> = [
  { key: "total", label: "Total" },
  { key: "completed", label: "Completed" },
  { key: "missing", label: "Missing" },
]

// Total / Completed / Missing as real, frozen table rows — placed straight after the header row(s)
// inside the same sticky <thead>, so they scroll and line up column-for-column exactly like the
// header itself (sticky-left columns included). Same convention as the company-related-banks module:
// "Completed" is a non-empty value, "Missing" is blank, "-", "—", "n/a" or "none".
export function StatsRows<T>({ rows, columns }: { rows: T[]; columns: StatsColumn<T>[] }) {
  return (
    <>
      {STAT_KINDS.map(({ key, label }) => (
        <tr key={key}>
          {columns.map((c, i) => {
            if (!c.getValue) {
              return (
                <td key={c.id} className={cn(TH_CLASS, "py-1.5 text-sm font-bold uppercase tracking-wide text-slate-500 bg-slate-50", c.className)}>
                  {i === 0 ? label : ""}
                </td>
              )
            }
            const s = columnStats(rows, c.getValue)
            const val = key === "total" ? s.total : key === "completed" ? s.completed : s.missing
            return (
              <td
                key={c.id}
                className={cn(
                  TH_CLASS, "py-1.5 text-sm font-semibold tabular-nums bg-slate-50",
                  key === "missing" ? (val > 0 ? "text-red-600" : "text-slate-400") : key === "completed" ? "text-emerald-600" : "text-slate-600",
                  c.className
                )}
              >
                {val}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}

// Loading placeholder for the table body — the toolbar and headers stay put while data loads, so there
// is no full-page spinner, just a centred spinner + label inside the table.
export function TableLoading({ cols, label = "Loading…" }: { cols: number; label?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-custom-blue mx-auto mb-3" />
        <div className="text-base text-slate-400">{label}</div>
      </td>
    </tr>
  )
}
