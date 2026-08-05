// @ts-nocheck
"use client";

import React from "react";
import { Filter, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Tiered coloring so a count badge actually communicates volume at a glance instead of every
// row looking identically grey regardless of whether it has 0 or 40 tasks. Active-row state
// (handled by the caller) always wins over this.
export function CountBadge({ count, active, activeAccent = "text-custom-blue bg-custom-blue/10" }: { count: number; active?: boolean; activeAccent?: string }) {
  const style = active
    ? activeAccent
    : count === 0
      ? "bg-slate-100 text-slate-400"
      : count <= 3
        ? "bg-blue-50 text-blue-600"
        : count <= 9
          ? "bg-blue-100 text-blue-700"
          : "bg-custom-blue text-white";
  return (
    <span className={cn("text-xs font-black tabular-nums px-1.5 py-0.5 rounded-full shrink-0", style)}>
      {count}
    </span>
  );
}

export type SortMode = 'name' | 'most' | 'fewest';
export type FilterMode = 'all' | 'withTasks';

export function RosterFilterButton({
  sortMode, setSortMode, filterMode, setFilterMode,
}: {
  sortMode: SortMode;
  setSortMode: (v: SortMode) => void;
  filterMode: FilterMode;
  setFilterMode: (v: FilterMode) => void;
}) {
  const isFiltered = filterMode !== 'all' || sortMode !== 'name';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-10 w-10 rounded-full shrink-0", isFiltered ? "bg-blue-50 text-custom-blue" : "text-slate-400 hover:bg-slate-100")}
        >
          <Filter className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sort By</DropdownMenuLabel>
        {([
          { id: 'name', label: 'Name (A–Z)' },
          { id: 'most', label: 'Most Tasks' },
          { id: 'fewest', label: 'Fewest Tasks' },
        ] as const).map(opt => (
          <DropdownMenuItem key={opt.id} onClick={() => setSortMode(opt.id)} className="flex items-center justify-between cursor-pointer">
            {opt.label}
            {sortMode === opt.id && <Check className="h-3.5 w-3.5 text-custom-blue" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Show</DropdownMenuLabel>
        {([
          { id: 'all', label: 'All' },
          { id: 'withTasks', label: 'Only with tasks' },
        ] as const).map(opt => (
          <DropdownMenuItem key={opt.id} onClick={() => setFilterMode(opt.id)} className="flex items-center justify-between cursor-pointer">
            {opt.label}
            {filterMode === opt.id && <Check className="h-3.5 w-3.5 text-custom-blue" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function applySortAndFilter<T extends { name: string; taskCount: number }>(list: T[], sortMode: SortMode, filterMode: FilterMode): T[] {
  const filtered = filterMode === 'withTasks' ? list.filter(i => i.taskCount > 0) : list;
  const sorted = [...filtered];
  if (sortMode === 'most') sorted.sort((a, b) => b.taskCount - a.taskCount || a.name.localeCompare(b.name));
  else if (sortMode === 'fewest') sorted.sort((a, b) => a.taskCount - b.taskCount || a.name.localeCompare(b.name));
  else sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}
