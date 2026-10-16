"use client"

import React, { useEffect, useRef, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import type { Currency, RateComponent } from "./types"

// Inline editors for the rate tables. Each keeps its own text while focused and only reports the
// value on blur / Enter, so typing in one cell of a 100-row table doesn't re-render every row on
// every keystroke.

const INPUT_CLASS =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-base tabular-nums text-slate-800 shadow-none outline-none focus:border-custom-blue focus:ring-1 focus:ring-custom-blue disabled:bg-slate-100 disabled:text-slate-400"

const fmt = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 2 })

const parseNumber = (text: string): number | null => {
  const cleaned = text.replace(/,/g, "").trim()
  if (cleaned === "") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function NumberField({
  value, onCommit, disabled, placeholder, className, title,
}: {
  value: number | null | undefined
  onCommit: (value: number | null) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  title?: string
}) {
  const [text, setText] = useState("")
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(value == null ? "" : fmt.format(value))
  }, [value])
  const commit = () => {
    const next = parseNumber(text)
    if (next !== (value ?? null)) onCommit(next)
    else setText(value == null ? "" : fmt.format(value))
  }
  return (
    <input
      inputMode="decimal"
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      title={title}
      onFocus={(e) => {
        focused.current = true
        setText(value == null ? "" : String(value))
        requestAnimationFrame(() => e.target.select())
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        focused.current = false
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        if (e.key === "Escape") {
          setText(value == null ? "" : String(value))
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      className={cn(INPUT_CLASS, "text-right", className)}
    />
  )
}

export function TextField({
  value, onCommit, placeholder, className, multiline,
}: {
  value: string | null | undefined
  onCommit: (value: string) => void
  placeholder?: string
  className?: string
  multiline?: boolean
}) {
  const [text, setText] = useState(value ?? "")
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(value ?? "")
  }, [value])
  const props = {
    value: text,
    placeholder,
    onFocus: () => { focused.current = true },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setText(e.target.value),
    onBlur: () => {
      focused.current = false
      if (text !== (value ?? "")) onCommit(text)
    },
  }
  return multiline ? (
    <textarea {...props} rows={2} className={cn(INPUT_CLASS, "h-auto min-h-9 py-1.5 text-sm leading-snug resize-y", className)} />
  ) : (
    <input {...props} className={cn(INPUT_CLASS, className)} />
  )
}

export function MiniSelect<V extends string>({
  value, options, onChange, placeholder = "—", className, disabled,
}: {
  value: V | null | undefined
  options: { value: V; label: string }[]
  onChange: (value: V | null) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange((e.target.value || null) as V | null)}
      className={cn(INPUT_CLASS, "cursor-pointer pr-1", className)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

/** Applicability tick + amount (+ KES/USD when the component can be priced in dollars). */
export function ComponentCell({
  value, onChange, withCurrency, defaultAmount, usdRate,
}: {
  value: RateComponent | undefined
  onChange: (value: RateComponent) => void
  withCurrency?: boolean
  defaultAmount?: number
  usdRate: number
}) {
  const v: RateComponent = value ?? { on: false, amount: null, currency: "KES" }
  const currency: Currency = v.currency ?? "KES"
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Checkbox
        checked={v.on}
        onCheckedChange={(checked) =>
          onChange({ ...v, on: !!checked, amount: checked && v.amount == null && defaultAmount != null ? defaultAmount : v.amount })
        }
        title={v.on ? "Applies — untick for N/A" : "N/A — tick to apply"}
        className="shrink-0"
      />
      {v.on ? (
        <>
          {withCurrency && (
            <button
              type="button"
              onClick={() => onChange({ ...v, currency: currency === "USD" ? "KES" : "USD" })}
              title={currency === "USD" ? `Priced in USD, converted at ${usdRate}` : "Priced in KES — click for USD"}
              className={cn(
                "h-9 shrink-0 rounded-md border px-1.5 text-xs font-bold tracking-wide transition-colors",
                currency === "USD" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              )}
            >
              {currency === "USD" ? "USD" : "KES"}
            </button>
          )}
          <NumberField value={v.amount} onCommit={(amount) => onChange({ ...v, amount })} className="min-w-0" />
        </>
      ) : (
        <span className="text-sm font-medium text-slate-400 select-none">N/A</span>
      )}
    </div>
  )
}

/** Read-only computed figure. */
export function Figure({ value, strong, tone, title }: { value: string; strong?: boolean; tone?: "muted" | "positive" | "negative"; title?: string }) {
  return (
    <div
      title={title}
      className={cn(
        "text-right tabular-nums text-base whitespace-nowrap",
        strong ? "font-bold text-slate-900" : "font-medium text-slate-700",
        tone === "muted" && "text-slate-400 font-normal",
        tone === "negative" && "text-red-600",
        tone === "positive" && "text-emerald-700"
      )}
    >
      {value}
    </div>
  )
}
