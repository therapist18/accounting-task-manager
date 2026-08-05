// @ts-nocheck
"use client";

import React from "react";
import { PillTrack } from "./PillTrack";

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
      <div className="px-5 py-3">
        <PillTrack
          value={activeDeptId}
          onValueChange={(v) => { setActiveDeptId(v); setActiveSubDeptId('all'); setActiveClassId('all'); }}
          items={[
            { id: 'all', label: 'All Departments', count: deptTaskCounts.all ?? 0 },
            ...departments.map((d: any) => ({ id: d.id.toString(), label: d.name, count: deptTaskCounts[d.id.toString()] ?? 0 })),
          ]}
        />
      </div>

      {activeDeptId !== 'all' && subDepartments.length > 0 && (
        <div className="px-5 pb-3 flex items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Sub-Dept</span>
          <PillTrack
            size="sm"
            value={activeSubDeptId}
            onValueChange={(v) => { setActiveSubDeptId(v); setActiveClassId('all'); }}
            items={[
              { id: 'all', label: 'All', count: subDeptTaskCounts.all ?? 0 },
              ...subDepartments.map((s: any) => ({ id: s.id.toString(), label: s.name, count: subDeptTaskCounts[s.id.toString()] ?? 0 })),
            ]}
          />
        </div>
      )}

      {activeSubDeptId !== 'all' && classes.length > 0 && (
        <div className="px-5 pb-3 flex items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Class</span>
          <PillTrack
            size="sm"
            value={activeClassId}
            onValueChange={setActiveClassId}
            items={[
              { id: 'all', label: 'All', count: classTaskCounts.all ?? 0, activeBg: 'bg-violet-600' },
              ...classes.map((c: any) => ({ id: c.id.toString(), label: c.name, count: classTaskCounts[c.id.toString()] ?? 0, activeBg: 'bg-violet-600' })),
            ]}
          />
        </div>
      )}
    </div>
  );
}
