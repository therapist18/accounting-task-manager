// @ts-nocheck
"use client";

import React from "react";
import { Inbox, Landmark, Truck, CheckCircle2, UserCheck, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

// KPI cards, but single-line each (icon + label + value side by side) instead of stacked
// label-over-value, so the whole strip is one row tall rather than two.
const TILES = [
  { key: "all", label: "Total tracked", icon: LayoutGrid, iconClass: "bg-slate-100 text-slate-500" },
  { key: "awaiting_receipt", label: "Awaiting receipt", icon: Inbox, iconClass: "bg-slate-100 text-slate-500" },
  { key: "at_nyayo", label: "At Nyayo House", icon: Landmark, iconClass: "bg-amber-50 text-amber-600" },
  { key: "in_dispatch", label: "Ready / out for dispatch", icon: Truck, iconClass: "bg-blue-50 text-blue-600" },
  { key: "completed", label: "Completed", icon: CheckCircle2, iconClass: "bg-emerald-50 text-emerald-600" },
  { key: "client_managed", label: "Client managed", icon: UserCheck, iconClass: "bg-violet-50 text-violet-600" },
];

export function StatsRow({ counts }: { counts: Record<string, number> }) {
  const values: Record<string, number> = {
    all: counts.all || 0,
    awaiting_receipt: counts.awaiting_receipt || 0,
    at_nyayo: counts.at_nyayo || 0,
    in_dispatch: (counts.ready_for_dispatch || 0) + (counts.out_for_delivery || 0) + (counts.awaiting_pickup || 0),
    completed: counts.completed || 0,
    client_managed: counts.client_managed || 0,
  };

  return (
    <div className="px-8 py-2.5 border-b border-slate-200 bg-slate-50/50">
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
        {TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.key} className="h-[108px] flex flex-col justify-between p-4 rounded-lg border border-slate-200 bg-white">
              <div className={cn("h-9 w-9 shrink-0 rounded-full flex items-center justify-center", tile.iconClass)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider truncate">{tile.label}</div>
                <div className="text-2xl font-black text-slate-900 tabular-nums leading-tight">{values[tile.key]}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
