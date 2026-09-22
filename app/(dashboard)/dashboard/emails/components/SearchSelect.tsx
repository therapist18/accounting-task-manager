"use client"

import { SearchableSelect, type Option } from "@/components/ui/searchable-select"
import { cn } from "@/lib/utils"

// Thin wrapper over the app's existing SearchableSelect (Popover + Command, already used across
// other modules) so every dropdown in this module — company/staff pickers with long, growing lists
// especially — is searchable instead of a plain <select>, with one place to keep the styling
// consistent. `variant="pill"` matches the page-level filter bar's rounded-full chrome; dialogs use
// the default (standard-radius) look, same restraint the rest of the app's dialogs use.
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className,
  disabled,
  error,
  variant = "default",
}: {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  className?: string
  disabled?: boolean
  error?: boolean
  variant?: "pill" | "default"
}) {
  return (
    <SearchableSelect
      value={value}
      onValueChange={onChange}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      buttonClassName={cn(
        variant === "pill" && "h-10 rounded-full border-slate-300 bg-white text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50",
        error && "border-red-300 text-red-600"
      )}
    />
  )
}
