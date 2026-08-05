// @ts-nocheck
"use client";

import React from "react";
import { PillTrack } from "./PillTrack";

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
