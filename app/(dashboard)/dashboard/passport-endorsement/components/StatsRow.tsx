// @ts-nocheck
"use client";

import React from "react";
import { Laptop, Landmark, Truck, CheckCircle2, UserCheck, Clock, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

// KPI cards, but single-line each (icon + label + value side by side) instead of stacked
// label-over-value, so the whole strip is one row tall rather than two. Each tile also
// carries the status steps it maps to — clicking a tile applies (or clears) that filter in
// the table below, so the stats strip doubles as a fast status filter.
const TILES = [
  { key: "all", label: "Total Tracked", steps: [], icon: Laptop, iconClass: "bg-blue-50 text-blue-500", accentClass: "border-l-4 border-l-blue-500", dotClass: "bg-blue-500" },
  { key: "awaiting_receipt", label: "Awaiting Receipt", steps: ["awaiting_receipt"], icon: Clock, iconClass: "bg-orange-50 text-orange-500", accentClass: "border-l-4 border-l-orange-500", dotClass: "bg-orange-500" },
  { key: "at_nyayo", label: "At Nyayo House", steps: ["at_nyayo"], icon: Landmark, iconClass: "bg-purple-50 text-purple-500", accentClass: "border-l-4 border-l-purple-500", dotClass: "bg-purple-500" },
  { key: "in_dispatch", label: "In Dispatch", steps: ["ready_for_dispatch", "out_for_delivery", "awaiting_pickup"], icon: Truck, iconClass: "bg-sky-50 text-sky-500", accentClass: "border-l-4 border-l-sky-500", dotClass: "bg-sky-500" },
  { key: "completed", label: "Completed", steps: ["completed"], icon: CheckCircle2, iconClass: "bg-emerald-50 text-emerald-500", accentClass: "border-l-4 border-l-emerald-500", dotClass: "bg-emerald-500" },
  { key: "client_managed", label: "Client Managed", steps: ["client_managed"], icon: UserCheck, iconClass: "bg-violet-50 text-violet-500", accentClass: "border-l-4 border-l-violet-500", dotClass: "bg-violet-500" },
];

function sameSteps(a: string[], b: string[]) {
  return a.length === b.length && a.every((s) => b.includes(s));
}

export function StatsRow({ counts, activeSteps = [], setActiveSteps }: any) {
  const values = {
    all: counts.all || 0,
    awaiting_receipt: counts.awaiting_receipt || 0,
    in_progress: (counts.at_nyayo || 0) + (counts.ready_for_dispatch || 0) + (counts.out_for_delivery || 0) + (counts.awaiting_pickup || 0),
    completed: counts.completed || 0,
    at_nyayo: counts.at_nyayo || 0,
    in_dispatch: (counts.ready_for_dispatch || 0) + (counts.out_for_delivery || 0) + (counts.awaiting_pickup || 0),
    client_managed: counts.client_managed || 0,
  };

  const isTileActive = (tile: (typeof TILES)[number]) =>
    tile.steps.length === 0 ? activeSteps.length === 0 : sameSteps(tile.steps, activeSteps);

  const handleTileClick = (tile: (typeof TILES)[number]) => {
    setActiveSteps(isTileActive(tile) ? [] : tile.steps);
  };

  return (
    <div className="px-10 py-6 bg-gradient-to-r from-blue-50/50 via-white to-white border-b border-slate-200">
      <div className="flex gap-4 overflow-x-auto pb-2 -mb-2 custom-scrollbar">
        {TILES.map((tile) => {
          const active = isTileActive(tile);
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => handleTileClick(tile)}
              title="Click to filter the table by this status"
              className={cn(
                "bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 hover:shadow-md transition-all flex-1 min-w-[220px] text-left group cursor-pointer",
                tile.accentClass,
                active && "ring-2 ring-custom-blue/30 border-custom-blue/40 shadow-md"
              )}
            >
              <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform", tile.iconClass)}>
                <tile.icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-3xl font-black text-slate-900 leading-none tabular-nums">{values[tile.key].toLocaleString()}</div>
                <div className="text-[15px] font-bold text-slate-600 mt-1.5 whitespace-nowrap flex items-center gap-1.5">
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", tile.dotClass)} />
                  {tile.label}
                </div>
              </div>
              {active && (
                <span className="shrink-0 flex items-center gap-1 rounded-lg bg-custom-blue text-white px-2.5 py-1 text-[11px] font-bold shadow-sm">
                  <SlidersHorizontal className="h-3 w-3" /> Filtering
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}