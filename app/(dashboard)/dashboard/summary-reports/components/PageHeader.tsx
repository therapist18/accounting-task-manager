// @ts-nocheck
"use client";

import React, { useState } from "react";
import { ChevronRight, Search, X, Shield, User, RotateCcw, Loader2, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SUMMARY_COLUMNS } from "../stageColumnConfig";

// Single source of truth for the "pill inside a grey track" segmented-control look used by
// every tab row on this page (Department, Sub-Department, Class, Status, Perspective) — one
// component so every level is guaranteed to look like the same control, just recolored,
// instead of five independently-styled tab treatments.
export interface PillTrackItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ComponentType<{ className?: string }>;
  activeBg?: string; // literal Tailwind class, e.g. 'bg-emerald-600' — defaults to bg-custom-blue
  dot?: string; // literal Tailwind bg-* class for an always-visible color dot (inactive state)
}

export function PillTrack({
  items, value, onValueChange, size = 'md', wrap = true,
}: {
  items: PillTrackItem[];
  value: string;
  onValueChange: (v: string) => void;
  size?: 'sm' | 'md';
  wrap?: boolean;
}) {
  return (
    <div className={cn(
      "inline-flex items-center gap-0.5 bg-slate-100 p-1 rounded-full border border-slate-200",
      wrap && "flex-wrap"
    )}>
      {items.map(item => {
        const isActive = value === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => onValueChange(item.id)}
            className={cn(
              "font-bold rounded-full transition-all flex items-center gap-1.5 shrink-0",
              size === 'sm' ? "h-7 px-3 text-xs" : "h-8 px-4 text-sm",
              isActive ? cn(item.activeBg || "bg-custom-blue", "text-white shadow-sm") : "text-slate-500 hover:text-slate-800"
            )}
          >
            {Icon ? (
              <Icon className={cn(size === 'sm' ? "h-3 w-3" : "h-3.5 w-3.5", isActive ? "text-white" : "text-slate-400")} />
            ) : item.dot ? (
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", isActive ? "bg-white" : item.dot)} />
            ) : null}
            {item.label}
            {typeof item.count === 'number' && (
              <span className={cn(
                "font-black tabular-nums rounded-full leading-none",
                size === 'sm' ? "text-[10px] px-1.5 py-1 ml-0.5" : "text-xs px-2 py-1 ml-1",
                isActive ? "bg-white text-slate-900" : "bg-slate-200/80 text-slate-600"
              )}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Department → Sub-Department → Class hierarchy scoping ──
export function HierarchyTabs({
  departments,
  activeDeptId, setActiveDeptId,
  activeSubDeptId, setActiveSubDeptId,
  activeClassId, setActiveClassId,
  deptTaskCounts = {}, subDeptTaskCounts = {}, classTaskCounts = {},
}: any) {
  const activeDepartment = departments.find(d => d.id.toString() === activeDeptId);
  const subDepartments = activeDepartment?.tm_subdepartments || [];
  const activeSubDepartment = subDepartments.find((s: any) => s.id.toString() === activeSubDeptId);
  const classes = activeSubDepartment?.classes || [];

  return (
    <div className="bg-slate-50/50 p-2 rounded-xl border border-slate-200/60 space-y-1">
      {/* Level 1: Departments */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200/50 p-1">
        <PillTrack
          value={activeDeptId}
          onValueChange={(v) => { setActiveDeptId(v); setActiveSubDeptId('all'); setActiveClassId('all'); }}
          items={[
            { id: 'all', label: 'All Departments', count: deptTaskCounts.all },
            ...departments.map((d: any) => ({ id: d.id.toString(), label: d.name, count: deptTaskCounts[d.id.toString()] })),
          ]}
        />
      </div>

      {/* Level 2 & 3: Drilled down levels */}
      {(activeDeptId !== 'all' && (subDepartments.length > 0 || classes.length > 0)) && (
        <div className="flex flex-col gap-1 pl-4 border-l-2 border-slate-200 ml-4 mt-2 py-1">
          {subDepartments.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter w-12">Subs</span>
              <PillTrack
                size="sm"
                variant="ghost" // Assuming PillTrack supports a lighter style
                value={activeSubDeptId}
                onValueChange={(v) => { setActiveSubDeptId(v); setActiveClassId('all'); }}
                items={[
                  { id: 'all', label: 'All', count: subDeptTaskCounts.all },
                  ...subDepartments.map((s: any) => ({ id: s.id.toString(), label: s.name, count: subDeptTaskCounts[s.id.toString()] })),
                ]}
              />
            </div>
          )}

          {activeSubDeptId !== 'all' && classes.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter w-12">Class</span>
              <PillTrack
                size="sm"
                value={activeClassId}
                onValueChange={setActiveClassId}
                items={[
                  { id: 'all', label: 'All', count: classTaskCounts.all, activeBg: 'bg-indigo-500' },
                  ...classes.map((c: any) => ({ id: c.id.toString(), label: c.name, count: classTaskCounts[c.id.toString()], activeBg: 'bg-indigo-500' })),
                ]}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Task-status scoping (All / Enquiry / WIP / Completed / Overdue) ──
// Semantic colors so status reads at a glance: All=blue, Enquiry=grey, WIP=amber,
// Completed=green, Overdue=red. Same PillTrack control as every other tab row on the page —
// only the color changes.
const STATUS_ITEMS = [
  { id: 'all', label: 'All', activeBg: 'bg-custom-blue', dot: 'bg-blue-400' },
  { id: 'enquiry', label: 'Enquiry', activeBg: 'bg-slate-600', dot: 'bg-slate-400' },
  { id: 'wip', label: 'WIP', activeBg: 'bg-amber-500', dot: 'bg-amber-400' },
  { id: 'completed', label: 'Completed', activeBg: 'bg-emerald-600', dot: 'bg-emerald-400' },
  { id: 'overdue', label: 'Overdue', activeBg: 'bg-rose-600', dot: 'bg-rose-400' },
];

export function StatusTabs({ activeTaskStatus, setActiveTaskStatus, counts = {} }: {
  activeTaskStatus: string;
  setActiveTaskStatus: (v: string) => void;
  counts?: Record<string, number>;
}) {
  return (
    <div className="px-5 pb-3 pt-3 border-t border-slate-100">
      <PillTrack
        value={activeTaskStatus}
        onValueChange={setActiveTaskStatus}
        items={STATUS_ITEMS.map(s => ({ ...s, count: counts[s.id] ?? 0 }))}
      />
    </div>
  );
}

// ── Perspective scoping (Overview / Officers / Managers / Clients) ──
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

// ── Column visibility control (lives in the page title bar) ──
// Same pattern as reports/components/ReportColumnVisibilityDialog.tsx — a Columns button
// opening a searchable checkbox list — adapted to the Summary Reports Dashboard's flat,
// fixed column set (no grouping needed, unlike the Reports module's dynamic columns).
export function ColumnVisibilityDialog({ visibleColumnIds, setVisibleColumnIds }: {
  visibleColumnIds: string[];
  setVisibleColumnIds: (ids: string[] | ((prev: string[]) => string[])) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleToggle = (colId: string, checked: boolean) => {
    setVisibleColumnIds(prev => checked ? [...prev, colId] : prev.filter(id => id !== colId));
  };

  const filteredColumns = searchQuery
    ? SUMMARY_COLUMNS.filter(c => c.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : SUMMARY_COLUMNS;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-3 rounded-lg text-sm font-bold gap-1.5 transition-all shrink-0 text-slate-500 hover:bg-slate-100"
        >
          <Eye className="h-3.5 w-3.5" />
          Columns
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Column Visibility</DialogTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search columns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9"
            />
          </div>
        </DialogHeader>

        <div className="flex-grow overflow-y-auto pr-4 -mr-4 mt-4">
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="p-4 space-y-2">
              {filteredColumns.map(col => (
                <div key={col.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`summary-col-${col.id}`}
                    checked={visibleColumnIds.includes(col.id)}
                    onCheckedChange={(checked) => handleToggle(col.id, checked === true)}
                  />
                  <label htmlFor={`summary-col-${col.id}`} className="text-sm cursor-pointer flex-1 truncate">{col.label}</label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}