"use client";

// Small building blocks for the access-management screens, matching BCL Registry's User Rights
// module (pill tabs, compact toolbar buttons, native matrix checkboxes). Plain elements only, so
// the same files render identically in every app regardless of its UI component library.
// Shared by Task Manager, KRA Tools and BCL Meetings (components/access-matrix) — keep the copies in sync.

import { memo, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check, ChevronDown, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { theme } from "./theme";

export function ToolbarButton({
  className,
  tone = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "default" | "danger" | "primary" }) {
  return (
    <button
      type="button"
      className={cn(
        theme.button,
        tone === "primary" ? theme.buttonPrimary : theme.buttonDefault,
        tone === "danger" && theme.buttonDanger,
        className
      )}
      {...props}
    />
  );
}

export interface PillTab<V extends string> {
  value: V;
  label: string;
  count?: number;
}

/** The section tab bar ("main": bordered pill with solid active tab; "sub": smaller muted bar). */
export function PillTabs<V extends string>({
  tabs,
  value,
  onValueChange,
  variant = "main",
}: {
  tabs: readonly PillTab<V>[];
  value: V;
  onValueChange: (value: V) => void;
  variant?: "main" | "sub";
}) {
  const isMain = variant === "main";
  return (
    <div
      role="tablist"
      className={isMain ? theme.tabList : theme.subTabList}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(tab.value)}
            className={cn(
              isMain ? theme.tab : theme.subTab,
              active ? (isMain ? theme.tabActive : theme.subTabActive) : theme.tabInactive
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={theme.tabCount}>{theme.tabCountInBrackets ? `(${tab.count})` : tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Native checkbox for matrix cells — the matrix can hold thousands of cells. */
export const MatrixCheckbox = memo(function MatrixCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
      className={theme.checkbox}
    />
  );
});

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide",
        active
          ? "border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400"
          : "border-slate-200/60 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400"
      )}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export interface PickerOption {
  value: string;
  label: string;
}

/** Searchable multi-select with "Select all" (ticks every option matching the search). */
export function MultiUserPicker({
  value,
  onValueChange,
  options,
  placeholder = "Select users…",
}: {
  value: string[];
  onValueChange: (value: string[]) => void;
  options: PickerOption[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => new Set(value), [value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, search]);
  const allFilteredSelected = filtered.length > 0 && filtered.every((o) => selected.has(o.value));

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onValueChange(Array.from(next));
  };
  const toggleAllFiltered = () => {
    const next = new Set(selected);
    if (allFilteredSelected) filtered.forEach((o) => next.delete(o.value));
    else filtered.forEach((o) => next.add(o.value));
    onValueChange(Array.from(next));
  };

  const label =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? options.find((o) => o.value === value[0])?.label ?? "1 user selected"
        : `${value.length} users selected`;

  const box = (on: boolean) => (
    <span
      className={cn(
        "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary",
        on ? "bg-primary text-primary-foreground" : "opacity-50"
      )}
    >
      {on && <Check className="h-3 w-3" />}
    </span>
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={theme.pickerButton}
      >
        <span className="flex items-center gap-1.5 truncate">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 opacity-50" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-96 rounded-lg border border-border bg-card p-1 shadow-lg">
          <div className="relative p-1">
            <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users…"
              className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={toggleAllFiltered}
              className={cn("flex w-full items-center rounded-md px-2 py-1.5 text-left font-medium hover:bg-muted", theme.pickerItem)}
            >
              {box(allFilteredSelected)}
              {search.trim() ? `Select all matching (${filtered.length})` : `Select all (${filtered.length})`}
            </button>
          )}
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onValueChange([])}
              className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              Clear selection ({value.length})
            </button>
          )}
          <div className="my-1 h-px bg-border" />
          <div className="max-h-[300px] overflow-y-auto overscroll-contain">
            {filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className={cn("flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-muted", theme.pickerItem)}
              >
                {box(selected.has(option.value))}
                <span className="truncate">{option.label}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No users found.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
