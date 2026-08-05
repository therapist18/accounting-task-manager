// @ts-nocheck
"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Shield, User, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PillTrack } from "./PillTrack";

const PERSPECTIVES = [
  { id: 'all', label: 'Overview', activeBg: 'bg-custom-blue' },
  { id: 'officers', label: 'Officers', activeBg: 'bg-amber-500' },
  { id: 'managers', label: 'Managers', activeBg: 'bg-violet-500' },
  { id: 'clients', label: 'Clients', activeBg: 'bg-emerald-500' },
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
  const personAccent = isOfficer ? 'bg-custom-blue' : 'bg-violet-600';

  const perspectiveCounts = { all: allCount || 0, officers: officersCount || 0, managers: managersCount || 0, clients: clientsCount || 0 };

  return (
    <div className="antialiased flex flex-col bg-white">
      {/* Tier 1: Toolbar Row */}
      <div className="px-6 py-3.5 flex items-center justify-between gap-4">
        <div className="relative group w-[380px] max-w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search company, applicant, sponsor..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-11 pr-10 bg-white border-slate-300 rounded-full text-sm font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <PillTrack
            value={activePerspective}
            onValueChange={setActivePerspective}
            items={PERSPECTIVES.map(p => ({ ...p, count: perspectiveCounts[p.id] }))}
          />

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
        <div className="px-6 py-2.5 flex items-center gap-3 border-t border-slate-100 bg-slate-50/80">
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

      {/* Tier 1.5: Assignee Pills with Counts — same PillTrack as every other tab row */}
      {isPersonView && (
        <div className="px-6 py-3.5 flex flex-wrap items-center gap-2 border-t border-slate-100">
          <span className={cn(
            "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest shrink-0",
            isOfficer ? "text-blue-600" : "text-violet-600"
          )}>
            {isOfficer ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {isOfficer ? "Officers" : "Managers"}
          </span>
          <PillTrack
            size="sm"
            value={currentActive}
            onValueChange={(v) => setTab(v === currentActive ? 'all' : v)}
            items={[
              { id: 'all', label: 'All', count: counts.all ?? 0, activeBg: personAccent },
              ...currentData.map((p: any) => ({
                id: p.id.toString(),
                label: p.displayName || p.full_name || p.name || `User ${p.id}`,
                count: counts[p.id.toString()] || 0,
                activeBg: personAccent,
              })),
            ]}
          />
        </div>
      )}
    </div>
  );
}
