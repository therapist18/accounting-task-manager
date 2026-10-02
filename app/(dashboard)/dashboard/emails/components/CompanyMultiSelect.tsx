"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

// Toolbar company filter that allows several companies at once. An empty selection means "all
// companies" (same convention as the "By company" sidebar), so nothing is filtered until one is ticked.

export function CompanyMultiSelect({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: string; label: string }[]
  value: string[]
  onChange: (ids: string[]) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? options.filter((o) => o.label?.toLowerCase().includes(q)) : options
  }, [options, search])

  const selected = useMemo(() => new Set(value), [value])
  const allShownSelected = shown.length > 0 && shown.every((o) => selected.has(o.value))

  const toggle = (id: string) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id])
  // "Select all" ticks everything the search currently shows; ticking it again unticks just those.
  const toggleAllShown = () => {
    const ids = shown.map((o) => o.value)
    onChange(allShownSelected ? value.filter((v) => !ids.includes(v)) : [...new Set([...value, ...ids])])
  }

  const label =
    value.length === 0 ? "All companies"
      : value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? "1 company"
      : `${value.length} companies`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={cn("h-10 justify-between font-normal text-base border-slate-200 bg-white", className)}>
          <span className={cn("truncate", value.length === 0 && "text-slate-500")}>{label}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="relative border-b border-slate-200 p-2">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            autoFocus
            placeholder="Search company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-base"
          />
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 text-sm">
          <button type="button" onClick={toggleAllShown} disabled={shown.length === 0} className="font-medium text-custom-blue hover:underline disabled:opacity-40">
            {allShownSelected ? "Deselect all" : search ? "Select all shown" : "Select all"}
          </button>
          <button type="button" onClick={() => onChange([])} disabled={value.length === 0} className="font-medium text-slate-500 hover:underline disabled:opacity-40">
            Clear ({value.length})
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {shown.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-base hover:bg-slate-100"
            >
              <Checkbox checked={selected.has(o.value)} className="h-4 w-4 rounded-sm pointer-events-none" />
              <span className="truncate flex-1">{o.label}</span>
              {selected.has(o.value) && <Check className="h-4 w-4 text-custom-blue shrink-0" />}
            </button>
          ))}
          {shown.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No companies match.</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
