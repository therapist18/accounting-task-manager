// @ts-nocheck
"use client";

import React from "react";
import { cn } from "@/lib/utils";

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
