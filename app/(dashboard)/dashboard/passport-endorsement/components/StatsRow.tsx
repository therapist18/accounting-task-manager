// @ts-nocheck
"use client";

import React from "react";
import { Inbox, Landmark, Truck, CheckCircle2, UserCheck, LayoutGrid, Clock, Laptop } from "lucide-react";
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
  const values = {
    all: counts.all || 0,
    awaiting_receipt: counts.awaiting_receipt || 0,
    in_progress: (counts.at_nyayo || 0) + (counts.ready_for_dispatch || 0) + (counts.out_for_delivery || 0) + (counts.awaiting_pickup || 0),
    completed: counts.completed || 0,
    at_nyayo: counts.at_nyayo || 0,
    in_dispatch: (counts.ready_for_dispatch || 0) + (counts.out_for_delivery || 0) + (counts.awaiting_pickup || 0),
    client_managed: counts.client_managed || 0,
  };

  return (
    <div className="px-8 py-5 bg-white border-b border-slate-200">
      <div className="flex gap-4 overflow-x-auto pb-2 -mb-2 custom-scrollbar">
        {/* Total Tracked */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors flex-1 min-w-[200px]">
          <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <Laptop className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 leading-none">{values.all.toLocaleString()}</div>
            <div className="text-sm font-bold text-slate-700 mt-1">Total Tracked</div>
          </div>
        </div>
        
        {/* Awaiting Receipt */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors flex-1 min-w-[200px]">
          <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 leading-none">{values.awaiting_receipt.toLocaleString()}</div>
            <div className="text-sm font-bold text-slate-700 mt-1">Awaiting Receipt</div>
          </div>
        </div>
        
        {/* At Nyayo House */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors flex-1 min-w-[200px]">
          <div className="h-12 w-12 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
            <Landmark className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 leading-none">{values.at_nyayo.toLocaleString()}</div>
            <div className="text-sm font-bold text-slate-700 mt-1">At Nyayo House</div>
          </div>
        </div>

        {/* Ready / Out for Dispatch */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors flex-1 min-w-[200px]">
          <div className="h-12 w-12 rounded-full bg-sky-50 flex items-center justify-center shrink-0">
            <Truck className="h-5 w-5 text-sky-500" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 leading-none">{values.in_dispatch.toLocaleString()}</div>
            <div className="text-sm font-bold text-slate-700 mt-1">In Dispatch</div>
          </div>
        </div>

        {/* Completed */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors flex-1 min-w-[200px]">
          <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 leading-none">{values.completed.toLocaleString()}</div>
            <div className="text-sm font-bold text-slate-700 mt-1">Completed</div>
          </div>
        </div>
        
        {/* Client Managed */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors flex-1 min-w-[200px]">
          <div className="h-12 w-12 rounded-full bg-violet-50 flex items-center justify-center shrink-0">
            <UserCheck className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 leading-none">{values.client_managed.toLocaleString()}</div>
            <div className="text-sm font-bold text-slate-700 mt-1">Client Managed</div>
          </div>
        </div>
      </div>
    </div>
  );
}
