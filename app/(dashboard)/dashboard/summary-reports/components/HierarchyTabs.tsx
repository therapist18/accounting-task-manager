// @ts-nocheck
"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

// Level 1 (Departments) mirrors ReportsHeader's StatusFilterBar: solid rounded-lg tabs.
const DeptRow = ({ value, onValueChange, items, counts }: {
  value: string; onValueChange: (v: string) => void; items: { id: string; name: string }[]; counts: Record<string, number>;
}) => (
  <div className="px-8 py-2.5 flex items-center flex-wrap gap-1.5 border-b border-slate-200 bg-white antialiased">
    <button
      onClick={() => onValueChange('all')}
      className={cn(
        "h-10 px-5 text-base font-semibold rounded-lg transition-all flex items-center gap-2",
        value === 'all' ? "bg-custom-blue text-white shadow-sm" : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700"
      )}
    >
      All Departments
      <span className={cn("px-2 py-1 rounded-md text-sm font-bold tabular-nums", value === 'all' ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>
        {counts.all ?? 0}
      </span>
    </button>
    {items.map(item => {
      const isActive = value === item.id;
      return (
        <button
          key={item.id}
          onClick={() => onValueChange(item.id)}
          className={cn(
            "h-10 px-5 text-base font-semibold rounded-lg transition-all flex items-center gap-2",
            isActive ? "bg-custom-blue text-white shadow-sm" : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700"
          )}
        >
          {item.name}
          <span className={cn("px-2 py-1 rounded-md text-sm font-bold tabular-nums", isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>
            {counts[item.id] ?? 0}
          </span>
        </button>
      );
    })}
  </div>
);

// Levels 2 & 3 (Subdepartments / Classes) mirror PersonFilterStrip's "assignee pill" row —
// subordinate to the solid dept tabs above, nested on a tinted strip.
const SubRow = ({ label, value, onValueChange, items, counts, tint }: {
  label: string; value: string; onValueChange: (v: string) => void; items: { id: string; name: string }[]; counts: Record<string, number>; tint: string;
}) => (
  <div className="px-8 py-2.5 flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-slate-50/80">
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1 shrink-0">{label}</span>
    <button
      onClick={() => onValueChange('all')}
      className={cn(
        "h-9 px-4 rounded-full text-sm font-bold transition-all border flex items-center gap-1.5",
        value === 'all' ? "bg-slate-800 border-slate-800 text-white shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      {value === 'all' && <Check className="h-3 w-3" />}
      All
      <span className={cn("text-xs font-black tabular-nums", value === 'all' ? "text-white/60" : "text-slate-400")}>{counts.all ?? 0}</span>
    </button>
    {items.map(item => {
      const isActive = value === item.id;
      return (
        <button
          key={item.id}
          onClick={() => onValueChange(item.id)}
          className={cn(
            "h-9 px-4 rounded-full text-sm font-bold transition-all border flex items-center gap-1.5",
            isActive ? `${tint} text-white shadow-sm` : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          )}
        >
          {isActive && <Check className="h-3 w-3" />}
          {item.name}
          <span className={cn("text-xs font-black tabular-nums", isActive ? "text-white/60" : "text-slate-400")}>{counts[item.id] ?? 0}</span>
        </button>
      );
    })}
  </div>
);

export function HierarchyTabs({
  departments,
  activeDeptId, setActiveDeptId,
  activeSubDeptId, setActiveSubDeptId,
  activeClassId, setActiveClassId,
  deptTaskCounts = {}, subDeptTaskCounts = {}, classTaskCounts = {},
}: {
  departments: any[];
  activeDeptId: string;
  setActiveDeptId: (id: string) => void;
  activeSubDeptId: string;
  setActiveSubDeptId: (id: string) => void;
  activeClassId: string;
  setActiveClassId: (id: string) => void;
  deptTaskCounts?: Record<string, number>;
  subDeptTaskCounts?: Record<string, number>;
  classTaskCounts?: Record<string, number>;
}) {
  const activeDepartment = departments.find(d => d.id.toString() === activeDeptId);
  const subDepartments = activeDepartment?.tm_subdepartments || [];
  const activeSubDepartment = subDepartments.find((s: any) => s.id.toString() === activeSubDeptId);
  const classes = activeSubDepartment?.classes || [];

  return (
    <div className="flex flex-col">
      <DeptRow
        value={activeDeptId}
        onValueChange={(v) => { setActiveDeptId(v); setActiveSubDeptId('all'); setActiveClassId('all'); }}
        items={departments.map(d => ({ id: d.id.toString(), name: d.name }))}
        counts={deptTaskCounts}
      />
      {activeDeptId !== 'all' && subDepartments.length > 0 && (
        <SubRow
          label="Sub-Department"
          tint="bg-custom-blue border-custom-blue"
          value={activeSubDeptId}
          onValueChange={(v) => { setActiveSubDeptId(v); setActiveClassId('all'); }}
          items={subDepartments.map((s: any) => ({ id: s.id.toString(), name: s.name }))}
          counts={subDeptTaskCounts}
        />
      )}
      {activeSubDeptId !== 'all' && classes.length > 0 && (
        <SubRow
          label="Class"
          tint="bg-violet-600 border-violet-600"
          value={activeClassId}
          onValueChange={setActiveClassId}
          items={classes.map((c: any) => ({ id: c.id.toString(), name: c.name }))}
          counts={classTaskCounts}
        />
      )}
    </div>
  );
}
