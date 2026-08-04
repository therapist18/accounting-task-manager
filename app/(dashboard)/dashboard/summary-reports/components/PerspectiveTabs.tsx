// @ts-nocheck
"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Shield, User, RotateCcw, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const PERSPECTIVES = [
  { id: 'all', label: 'Overview', activeBg: 'bg-custom-blue', activeText: 'text-white' },
  { id: 'officers', label: 'Officers', activeBg: 'bg-amber-500', activeText: 'text-white' },
  { id: 'managers', label: 'Managers', activeBg: 'bg-violet-500', activeText: 'text-white' },
  { id: 'clients', label: 'Clients', activeBg: 'bg-emerald-500', activeText: 'text-white' },
];

export function PerspectiveTabs({
  activePerspective, setActivePerspective,
  allCount, officersCount, managersCount, clientsCount,
  availableOfficers = [], activeOfficerId, setActiveOfficerId, officerCounts = {},
  availableTaskManagers = [], activeManagerId, setActiveManagerId, managerCounts = {},
  searchQuery, setSearchQuery,
  refreshData, loading,
}: any) {
  const isOfficer = activePerspective === 'officers';
  const isManager = activePerspective === 'managers';
  const isPersonView = isOfficer || isManager;

  const currentData = isOfficer ? availableOfficers : availableTaskManagers;
  const currentActive = isOfficer ? activeOfficerId : activeManagerId;
  const setTab = isOfficer ? setActiveOfficerId : setActiveManagerId;
  const counts = isOfficer ? officerCounts : managerCounts;

  const perspectiveCounts = { all: allCount || 0, officers: officersCount || 0, managers: managersCount || 0, clients: clientsCount || 0 };

  return (
    <div className="border-b border-slate-200 antialiased flex flex-col bg-white">
      {/* Tier 1: Toolbar Row */}
      <div className="px-8 py-4 flex items-center justify-between gap-4 border-b border-t border-slate-200">
        <div className="relative group w-[320px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search company or applicant..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-11 pr-10 bg-white border-slate-300 rounded-full text-sm font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-full border border-slate-200 shrink-0">
            {PERSPECTIVES.map(p => (
              <button
                key={p.id}
                onClick={() => setActivePerspective(p.id)}
                className={cn(
                  "h-8 px-4 text-sm font-bold rounded-full transition-all flex items-center gap-2",
                  activePerspective === p.id ? `${p.activeBg} ${p.activeText} shadow-sm` : "text-slate-500 hover:text-slate-800"
                )}
              >
                {p.label}
                <span className={cn(
                  "text-sm font-black tabular-nums px-1.5 py-0.5 rounded-full font-medium",
                  activePerspective === p.id ? `bg-white/20 ${p.activeText}` : "text-slate-400"
                )}>
                  {perspectiveCounts[p.id]}
                </span>
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-slate-200 mx-1 shrink-0" />

          {refreshData && (
            <Button
              variant="outline"
              onClick={refreshData}
              disabled={loading}
              className="h-10 px-5 rounded-full border-slate-200 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 text-slate-400 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2 text-slate-400" />}
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          )}
        </div>
      </div>

      {/* Filter Description Banner */}
      {isPersonView && (
        <div className="px-8 py-2.5 flex items-center gap-3 border-b border-slate-100 bg-slate-50/80">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0",
            isOfficer ? "bg-blue-100/60 text-blue-700" : "bg-violet-100/60 text-violet-700"
          )}>
            {isOfficer ? <Shield className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            <span>{isOfficer ? "Officer View" : "Manager View"}</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {isOfficer
              ? "Showing tasks currently at an officer's stage. Select a specific officer to view only their assigned tasks, or click All to see tasks across all officers."
              : "Showing tasks currently at a manager (BCL) stage. Select a specific manager to view only the tasks they manage, or click All to see tasks across all managers."}
          </p>
        </div>
      )}

      {/* Tier 1.5: Assignee Pills with Counts */}
      {isPersonView && (
        <div className="px-8 py-4 flex flex-wrap items-center gap-1.5">
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-black uppercase font-bold mr-1 shrink-0",
            isOfficer ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-violet-50 text-violet-600 border border-violet-100"
          )}>
            {isOfficer ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {isOfficer ? "Officers" : "Managers"}
          </div>

          <button
            onClick={() => setTab('all')}
            className={cn(
              "h-10 px-6 py-2 rounded-full text-sm font-bold transition-all border flex items-center gap-1.5",
              currentActive === 'all' ? "bg-slate-800 border-slate-800 text-white shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            All
            <span className={cn("text-sm font-black tabular-nums font-medium", currentActive === 'all' ? "text-white/60" : "text-slate-400")}>
              {counts.all ?? 0}
            </span>
          </button>

          {currentData.map((p: any) => {
            const displayName = p.displayName || p.full_name || p.name || `User ${p.id}`;
            const isActive = currentActive === p.id.toString();
            const count = counts[p.id.toString()] || 0;
            return (
              <button
                key={p.id}
                onClick={() => setTab(isActive ? 'all' : p.id.toString())}
                className={cn(
                  "h-10 px-6 py-2 rounded-full text-sm font-bold transition-all border flex items-center gap-1.5",
                  isActive
                    ? (isOfficer ? "bg-custom-blue border-custom-blue text-white shadow-sm" : "bg-violet-600 border-violet-600 text-white shadow-sm")
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                {displayName}
                {count > 0 && (
                  <span className="text-sm font-black tabular-nums font-medium bg-custom-blue text-white px-1.5 py-0.5 rounded-full">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
