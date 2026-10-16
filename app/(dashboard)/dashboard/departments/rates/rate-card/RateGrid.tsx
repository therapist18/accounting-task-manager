"use client"

import React, { memo } from "react"
import { cn } from "@/lib/utils"
import { HEAD_NEUTRAL, TD_CLASS, TH_CLASS, TableLoading, zebraRow } from "../../../emails/components/table"

// The banded, horizontally scrolling table both rate cards render into — the Email Center's table
// language (TH/TD classes, zebra rows, banded group headers, the shared loading row), with sticky
// job-level columns on the left and a sticky two-row header (bands, then columns).

export interface GridBand {
  id: string
  label: string
  /** Header classes for the band and its columns. */
  head: string
  /** Background for computed cells in the band. */
  tint?: string
}

export interface GridColumn<R> {
  id: string
  band: string
  header: React.ReactNode
  title?: string
  width: number
  render: (row: R, index: number) => React.ReactNode
  /** Computed (read-only) column — gets the band tint. */
  computed?: boolean
  className?: string
}

interface Props<R> {
  rows: R[]
  rowKey: (row: R) => string
  sticky: GridColumn<R>[]
  columns: GridColumn<R>[]
  bands: Record<string, GridBand>
  loading: boolean
  empty: React.ReactNode
  rowClassName?: (row: R, index: number) => string | undefined
  /** Absolute index of the first row (pagination), for the # column. */
  offset?: number
}

function GridInner<R>({ rows, rowKey, sticky, columns, bands, loading, empty, rowClassName, offset = 0 }: Props<R>) {
  const stickyLeft: number[] = []
  sticky.reduce((left, c) => {
    stickyLeft.push(left)
    return left + c.width
  }, 0)
  const totalCols = sticky.length + columns.length

  // Consecutive columns of the same band share one band header cell.
  const bandRuns: { band: GridBand; span: number }[] = []
  for (const c of columns) {
    const last = bandRuns[bandRuns.length - 1]
    if (last && last.band.id === c.band) last.span += 1
    else bandRuns.push({ band: bands[c.band], span: 1 })
  }

  return (
    <table className="border-separate border-spacing-0 text-left" style={{ minWidth: "100%" }}>
      <colgroup>
        {[...sticky, ...columns].map((c) => (
          <col key={c.id} style={{ width: c.width, minWidth: c.width }} />
        ))}
      </colgroup>
      <thead className="sticky top-0 z-30">
        <tr>
          {sticky.map((c, i) => (
            <th
              key={c.id}
              rowSpan={2}
              title={c.title}
              style={{ left: stickyLeft[i] }}
              className={cn(TH_CLASS, HEAD_NEUTRAL, "sticky z-40 align-bottom", i === sticky.length - 1 && "border-r-2 border-r-slate-300")}
            >
              {c.header}
            </th>
          ))}
          {bandRuns.map((run, i) => (
            <th key={`${run.band.id}-${i}`} colSpan={run.span} className={cn(TH_CLASS, run.band.head, "text-center py-1.5 text-sm uppercase tracking-wide")}>
              {run.band.label}
            </th>
          ))}
        </tr>
        <tr>
          {columns.map((c) => (
            <th key={c.id} title={c.title} className={cn(TH_CLASS, bands[c.band].head, "text-sm py-2 whitespace-normal leading-tight align-bottom")}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <TableLoading cols={totalCols} />
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={totalCols} className="p-0">
              <div className="sticky left-0 w-[min(100%,100vw)] px-6 py-14 text-center text-base text-slate-500">{empty}</div>
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <GridRow
              key={rowKey(row)}
              row={row}
              index={offset + i}
              sticky={sticky}
              stickyLeft={stickyLeft}
              columns={columns}
              bands={bands}
              className={cn(zebraRow(offset + i), rowClassName?.(row, offset + i))}
            />
          ))
        )}
      </tbody>
    </table>
  )
}

interface RowProps<R> {
  row: R
  index: number
  sticky: GridColumn<R>[]
  stickyLeft: number[]
  columns: GridColumn<R>[]
  bands: Record<string, GridBand>
  className?: string
}

function GridRowInner<R>({ row, index, sticky, stickyLeft, columns, bands, className }: RowProps<R>) {
  return (
    <tr className={className}>
      {sticky.map((c, i) => (
        <td
          key={c.id}
          style={{ left: stickyLeft[i] }}
          className={cn(TD_CLASS, "sticky z-10 bg-inherit py-2", i === sticky.length - 1 && "border-r-2 border-r-slate-300", c.className)}
        >
          {c.render(row, index)}
        </td>
      ))}
      {columns.map((c) => (
        <td key={c.id} className={cn(TD_CLASS, "py-2 align-middle", c.computed && bands[c.band].tint, c.className)}>
          {c.render(row, index)}
        </td>
      ))}
    </tr>
  )
}

// Rows re-render only when their own row object (or the column set) changes — see useStableRows.
const GridRow = memo(GridRowInner) as typeof GridRowInner

export const RateGrid = GridInner
