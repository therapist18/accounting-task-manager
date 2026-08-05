// @ts-nocheck
"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'enquiry', label: 'Enquiry' },
  { id: 'wip', label: 'WIP' },
  { id: 'completed', label: 'Completed' },
  { id: 'overdue', label: 'Overdue', warn: true },
];

// Mirrors ReportsHeader's StatusFilterBar styling exactly, placed after the
// Department/Sub-Department/Class hierarchy tabs.
export function StatusTabs({ activeTaskStatus, setActiveTaskStatus, counts = {} }: {
  activeTaskStatus: string;
  setActiveTaskStatus: (v: string) => void;
  counts?: Record<string, number>;
}) {
  return (
    <div className="px-8 py-2.5 flex items-center border-b border-slate-200 bg-white antialiased">
      <div className="flex gap-1.5">
        {TABS.map(tab => {
          const isActive = activeTaskStatus === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTaskStatus(tab.id)}
              className={cn(
                "h-10 px-5 text-base font-semibold rounded-lg transition-all flex items-center gap-2",
                isActive
                  ? (tab.warn ? "bg-rose-600 text-white shadow-sm" : "bg-custom-blue text-white shadow-sm")
                  : (tab.warn ? "bg-white text-rose-600 border border-rose-200 hover:border-rose-300" : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700")
              )}
            >
              {tab.warn && <AlertTriangle className="h-3.5 w-3.5" />}
              {tab.label}
              <span className={cn(
                "px-2 py-1 rounded-md text-sm font-bold tabular-nums",
                isActive ? "bg-white/20 text-white" : tab.warn ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"
              )}>
                {counts[tab.id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
