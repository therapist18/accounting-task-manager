// @ts-nocheck
"use client";

import React, { useState, useMemo } from "react";
import { ChevronRight, ChevronLeft, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrackerSidebarProps {
  departments: any[];
  activeDeptId: string;
  setActiveDeptId: (id: string) => void;
  activeSubDepartments: any[];
  activeSubDeptIds: string[];
  setActiveSubDeptIds: (ids: string[]) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function TrackerSidebar({
  departments,
  activeDeptId,
  setActiveDeptId,
  activeSubDepartments,
  activeSubDeptIds,
  setActiveSubDeptIds,
  isCollapsed = false,
  onToggleCollapse,
}: TrackerSidebarProps) {
  const [sidebarSearch, setSidebarSearch] = useState("");

  const toggleSubDept = (id: string) => {
    setActiveSubDeptIds(
      activeSubDeptIds.includes(id)
        ? activeSubDeptIds.filter((x) => x !== id)
        : [...activeSubDeptIds, id]
    );
  };

  const getInitials = (name: string) => {
    if (!name) return "";
    return name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const filteredDepartments = sidebarSearch.trim()
    ? departments.filter((d) =>
        d.name?.toLowerCase().includes(sidebarSearch.toLowerCase())
      )
    : departments;

  return (
    <div
      className={cn(
        "border-r border-slate-200 bg-[#FAFAFC] flex flex-col max-h-screen shrink-0 transition-all duration-300 ease-in-out z-20",
        isCollapsed ? "w-[72px]" : "w-[280px]"
      )}
    >
      <div className="border rounded-lg shadow-md m-4 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div
          className={cn(
            "px-6 py-6 flex items-center shrink-0 border-b border-slate-200 bg-white",
            isCollapsed ? "justify-center" : "justify-between"
          )}
        >
          {!isCollapsed && (
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest leading-tight">
                Immigration
              </h2>
              <span className="text-[14px] text-slate-900 font-bold">
                Document Tracker
              </span>
            </div>
          )}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1.5 rounded-full border border-slate-200 text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-all"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {/* Search Input */}
        {!isCollapsed && (
          <div className="p-4 bg-white border-b border-slate-200 shrink-0">
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search department..."
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                className="w-full pl-10 pr-8 h-10 text-sm rounded-full border border-slate-300 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-400"
              />
              {sidebarSearch && (
                <button
                  onClick={() => setSidebarSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-white custom-scrollbar pb-6">
          {filteredDepartments.map((dept) => {
            const isActive = activeDeptId === dept.id.toString();

            if (isCollapsed) {
              return (
                <button
                  key={dept.id}
                  onClick={() => {
                    setActiveDeptId(dept.id.toString());
                    setActiveSubDeptIds([]);
                  }}
                  className={cn(
                    "w-11 h-11 mx-auto flex items-center justify-center rounded-full text-sm font-bold transition-all mt-3 border",
                    isActive
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-400 border-slate-200 hover:border-blue-300"
                  )}
                  title={dept.name}
                >
                  {getInitials(dept.name)}
                </button>
              );
            }

            return (
              <div key={dept.id} className="border-b border-slate-100 last:border-none">
                <button
                  onClick={() => {
                    setActiveDeptId(dept.id.toString());
                    setActiveSubDeptIds([]);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-6 py-4 transition-all text-left",
                    isActive
                      ? "bg-slate-50 border-l-4 border-blue-600"
                      : "hover:bg-slate-50 border-l-4 border-transparent"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "h-7 w-7 rounded flex items-center justify-center text-sm font-bold",
                        isActive
                          ? "bg-blue-600 text-white"
                          : "bg-slate-200 text-slate-500"
                      )}
                    >
                      {getInitials(dept.name)}
                    </div>
                    <span
                      className={cn(
                        "text-sm font-semibold uppercase tracking-wider truncate",
                        isActive ? "text-slate-900" : "text-slate-600"
                      )}
                    >
                      {dept.name}
                    </span>
                  </div>
                  {isActive && (
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                  )}
                </button>

                {isActive && activeSubDepartments.length > 0 && (
                  <div className="bg-[#FAFAFC] border-y border-slate-100 py-2 flex flex-col">
                    <button
                      onClick={() => setActiveSubDeptIds([])}
                      className={cn(
                        "w-full text-left px-8 py-2.5 text-sm font-medium transition-all flex justify-between items-center",
                        activeSubDeptIds.length === 0
                          ? "bg-blue-50/80 text-blue-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      )}
                    >
                      <span>All Sub-units</span>
                      {activeSubDeptIds.length === 0 && (
                        <Check className="h-3 w-3" />
                      )}
                    </button>

                    {activeSubDepartments.map((sub) => {
                      const id = sub.id.toString();
                      const isSelected = activeSubDeptIds.includes(id);
                      return (
                        <button
                          key={sub.id}
                          onClick={() => toggleSubDept(id)}
                          className={cn(
                            "w-full text-left px-8 py-2.5 text-sm font-medium transition-all truncate flex justify-between items-center",
                            isSelected
                              ? "bg-blue-50/80 text-blue-700"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          )}
                        >
                          <span className="truncate">{sub.name}</span>
                          {isSelected && <Check className="h-3 w-3" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
