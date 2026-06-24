// @ts-nocheck
"use client";

import React from "react";
import { Layers, Clock, Check, Sparkles, Building2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export function TrackerHeader({
  activeDepartment,
  activeSubDepartments,
  activeSubDeptIds,
  allTasksCount,
  wipTasksCount,
  writeUpCompletedCount,
  endorsedCount,
  searchQuery,
  setSearchQuery,
}: any) {
  const selectedSubDeptText = React.useMemo(() => {
    if (activeSubDeptIds.length === 0) return "All Sub-units";
    const names = activeSubDeptIds
      .map(
        (id) =>
          activeSubDepartments.find((s) => s.id.toString() === id)?.name
      )
      .filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length <= 2) return names.join(", ");
    return `${names[0]} +${names.length - 1}`;
  }, [activeSubDeptIds, activeSubDepartments]);

  return (
    <div className="border-b border-slate-200 bg-white px-8 py-5 antialiased flex flex-col justify-center">
      {/* Title Row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[22px] font-black text-slate-900 uppercase tracking-tight leading-none">
            Immigration Document Tracker
          </h1>
          <div className="flex items-center text-sm text-slate-500 font-semibold gap-1">
            <Building2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <span className="text-blue-600 font-bold">
              {activeDepartment?.name || "Department"}
            </span>
            <span className="text-slate-300 mx-0.5">/</span>
            <span className="truncate text-slate-500">
              {selectedSubDeptText}
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative group w-[320px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search employee, ID, department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-11 pr-10 bg-white border-slate-300 rounded-full text-[13px] font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "ALL TASKS", value: allTasksCount || 0, icon: Layers, iconBg: "bg-blue-500", cardBg: "bg-blue-50/60 border-blue-100", valueColor: "text-blue-700", accentBorder: "border-l-blue-500" },
          { label: "WIP", value: wipTasksCount || 0, icon: Clock, iconBg: "bg-amber-500", cardBg: "bg-amber-50/60 border-amber-100", valueColor: "text-amber-700", accentBorder: "border-l-amber-500" },
          { label: "WRITE-UP COMPLETED", value: writeUpCompletedCount || 0, icon: Check, iconBg: "bg-emerald-500", cardBg: "bg-emerald-50/60 border-emerald-100", valueColor: "text-emerald-700", accentBorder: "border-l-emerald-500" },
          { label: "ENDORSED", value: endorsedCount || 0, icon: Sparkles, iconBg: "bg-teal-500", cardBg: "bg-teal-50/60 border-teal-100", valueColor: "text-teal-700", accentBorder: "border-l-teal-500" },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={cn(
                "flex items-center gap-4 px-5 py-4 rounded-xl border border-l-4 transition-all hover:shadow-sm",
                card.cardBg,
                card.accentBorder
              )}
            >
              <div
                className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                  card.iconBg
                )}
              >
                <Icon className="h-5 w-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {card.label}
                </span>
                <span
                  className={cn(
                    "text-2xl font-black tabular-nums leading-none mt-0.5",
                    card.valueColor
                  )}
                >
                  {card.value.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TrackerStatusFilter({
  activeStatus,
  setActiveStatus,
  allTasksCount,
  wipTasksCount,
  writeUpCompletedCount,
  endorsedCount,
}: any) {
  const counts = {
    all: allTasksCount || 0,
    wip: wipTasksCount || 0,
    write_up_completed: writeUpCompletedCount || 0,
    endorsed: endorsedCount || 0,
  };

  const tabs = [
    { id: "all", label: "All Tasks", color: "bg-blue-600" },
    { id: "wip", label: "WIP", color: "bg-amber-500" },
    { id: "write_up_completed", label: "Write-up Completed", color: "bg-emerald-600" },
    { id: "endorsed", label: "Endorsed", color: "bg-violet-600" },
  ];

  return (
    <div className="px-8 pt-2 pb-0 flex items-center border-b border-slate-200 bg-slate-50/50 antialiased">
      <div className="flex gap-1">
        {tabs.map((s) => {
          const isActive = activeStatus === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveStatus(s.id)}
              className={cn(
                "h-10 px-5 text-sm font-semibold rounded-t-xl transition-all flex items-center gap-2.5 border-x border-t",
                isActive
                  ? `${s.color} text-white border-transparent shadow-[0_-4px_12px_rgba(0,0,0,0.08)]`
                  : "bg-transparent text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-200/50"
              )}
            >
              {s.label}
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-sm font-black tabular-nums font-medium",
                  isActive ? "bg-white/25 text-white" : "bg-slate-200 text-slate-500"
                )}
              >
                {counts[s.id]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
