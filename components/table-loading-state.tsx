'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TableLoadingStateProps {
  /** Primary line shown next to the spinner. */
  message?: ReactNode
  /** Secondary line under the message; `null` hides it. */
  hint?: ReactNode | null
  className?: string
}

/**
 * The card itself: spinner + message, shared by the overlay and inline variants
 * below so every table's loading state looks the same.
 */
function LoadingCard({ message, hint }: { message: ReactNode; hint?: ReactNode | null }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-3.5 shadow-lg">
      {/* Two concentric rings: a faint track plus a primary arc that spins. */}
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="absolute inset-0 animate-spin rounded-full border-[2.5px] border-primary/20" />
        <span className="absolute inset-0 animate-spin rounded-full border-[2.5px] border-transparent border-t-primary" />
      </span>
      <span className="flex flex-col text-left">
        <span className="text-xs font-semibold leading-tight text-foreground">{message}</span>
        {hint && (
          <span className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{hint}</span>
        )}
      </span>
    </div>
  )
}

/**
 * The standard table-loading design.
 *
 * Every table in the app — companies, individuals, documents, settings, … —
 * renders this same card with this same wording, so a loading table looks and
 * reads identically wherever you meet it. To re-word the whole app, change
 * these two constants; call sites are expected to pass no props.
 */
export const TABLE_LOADING_MESSAGE = 'Loading data...'
export const TABLE_LOADING_HINT = 'Fetching the latest records — this may take a moment.'

/**
 * Loading state for wide, multi-column tables — rendered as an overlay.
 *
 * The old pattern put the spinner + text in a `text-center` cell spanning every
 * column: on a table that is thousands of pixels wide the centre of that cell
 * sits far off-screen, so the indicator was invisible unless the table happened
 * to be scrolled to just the right spot.
 *
 * Use this when the component owns the table's (non-scrolling) wrapper: the
 * overlay is pinned to `inset-0` of that wrapper, so it is always centred in the
 * visible part of the table no matter how far the table has been scrolled
 * horizontally or vertically. A light scrim sits behind the card so the state
 * also reads over stale rows, and `pointer-events-none` keeps the table
 * scrollable while it loads.
 */
export function TableLoadingState({
  message = TABLE_LOADING_MESSAGE,
  hint = TABLE_LOADING_HINT,
  className,
}: TableLoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'absolute inset-0 z-20 flex items-center justify-center pointer-events-none',
        className
      )}
    >
      {/* Scrim over the body only — a sticky header with z-30 stays above it. */}
      <div className="absolute inset-0 bg-card/70 backdrop-blur-[1px]" />
      <div className="relative">
        <LoadingCard message={message} hint={hint} />
      </div>
    </div>
  )
}

/**
 * Loading state rendered *inside* the loading `<td>` itself, for tables whose
 * scroll container belongs to someone else (a page wrapper, a shell component,
 * the shadcn `<Table>` container) and therefore can't host the overlay above.
 *
 * A centred cell on a wide table puts the card far off-screen; pinning it to
 * the left keeps it visible but looks wedged into the corner. So this measures
 * the scroll container and becomes exactly as wide as its *visible* area,
 * pinned with `position: sticky; left: 0` - the card then sits centred in
 * whatever part of the table is on screen, however far it has been scrolled.
 * Pair it with a `colSpan` cell on a row of its own.
 */
export function TableLoadingStateInline({
  message = TABLE_LOADING_MESSAGE,
  hint = TABLE_LOADING_HINT,
  className,
}: TableLoadingStateProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visibleWidth, setVisibleWidth] = useState<number>()

  useLayoutEffect(() => {
    const scroller = findHorizontalScroller(ref.current)
    if (!scroller) return
    const update = () => setVisibleWidth(scroller.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      // maxWidth: on a table narrower than its container, never overflow the cell.
      style={{ width: visibleWidth, maxWidth: '100%' }}
      className={cn('sticky left-0 flex items-center justify-center px-4 py-12', className)}
    >
      <LoadingCard message={message} hint={hint} />
    </div>
  )
}

/** Nearest ancestor that scrolls horizontally - the box the card should centre in. */
function findHorizontalScroller(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node && node !== document.body; node = node.parentElement) {
    const { overflowX } = getComputedStyle(node)
    if (overflowX === 'auto' || overflowX === 'scroll') return node
  }
  return null
}
