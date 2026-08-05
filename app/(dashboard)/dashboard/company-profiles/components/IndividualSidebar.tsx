// @ts-nocheck
"use client";

import React from "react";
import { Search, X, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountBadge, RosterFilterButton, type SortMode, type FilterMode } from "./RosterListShared";

export function IndividualSidebar({
  individuals, activeIndividualId, onSelect, searchQuery, setSearchQuery,
  sortMode, setSortMode, filterMode, setFilterMode,
}: {
  individuals: { id: string; name: string; companyCount: number; taskCount: number }[];
  activeIndividualId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  sortMode: SortMode;
  setSortMode: (v: SortMode) => void;
  filterMode: FilterMode;
  setFilterMode: (v: FilterMode) => void;
}) {
  const getInitials = (name: string) => (name || "").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-4 py-4 border-b border-slate-200 flex items-center gap-2">
        <span className="h-9 w-9 rounded-xl bg-violet-600 text-white shadow-sm shrink-0 flex items-center justify-center">
          <User className="h-4.5 w-4.5" />
        </span>
        <div className="flex flex-col leading-tight min-w-0">
          <h2 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Individual Profiles</h2>
          <span className="text-sm text-slate-900 font-bold truncate">{individuals.length} People</span>
        </div>
      </div>

      <div className="p-3 border-b border-slate-100 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search people..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 h-10 text-sm rounded-full border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <RosterFilterButton sortMode={sortMode} setSortMode={setSortMode} filterMode={filterMode} setFilterMode={setFilterMode} />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
        {individuals.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8 px-4">No individuals match your filters.</p>
        ) : (
          individuals.map(person => {
            const isActive = activeIndividualId === person.id;
            return (
              <button
                key={person.id}
                onClick={() => onSelect(person.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all",
                  isActive ? "bg-violet-50" : "hover:bg-slate-50"
                )}
              >
                <div className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                  isActive ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"
                )}>
                  {getInitials(person.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-semibold truncate", isActive ? "text-violet-700" : "text-slate-700")}>{person.name}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide truncate">
                    {person.companyCount} compan{person.companyCount === 1 ? 'y' : 'ies'}
                  </p>
                </div>
                <CountBadge count={person.taskCount} active={isActive} activeAccent="text-violet-700 bg-violet-600/10" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
