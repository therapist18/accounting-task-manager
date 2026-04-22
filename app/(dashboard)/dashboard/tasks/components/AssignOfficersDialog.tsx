"use client"

import React, { useState, useMemo, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import {
  Users,
  Check,
  Search,
  Info,
  UserPlus,
  UserMinus,
  ChevronRight,
  Layers,
  CheckCircle2,
  AlertCircle
} from "lucide-react"
import { cn } from "@/lib/utils"

interface AssignOfficersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: any
  officers: any[]
  stages?: any[]
  initialStageAssignments?: Record<string, string[]>
  onAssign: (stageAssignments: Record<string, string[]>) => void
}

export function AssignOfficersDialog({
  open,
  onOpenChange,
  task,
  officers,
  stages,
  initialStageAssignments,
  onAssign
}: AssignOfficersDialogProps) {
  // localAssignments: { [stageId]: string[] }
  const [localAssignments, setLocalAssignments] = useState<Record<string, string[]>>({});
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // 1. Filter stages that require officer follow-up
  const officerFollowUpStages = useMemo(() => {
    return (stages || []).filter(s => s.follow_up?.toLowerCase() === 'officer');
  }, [stages]);

  // 2. Initialize local state when dialog opens
  useEffect(() => {
    if (open) {
      setLocalAssignments(initialStageAssignments || {});
      // Default to "All Available" (null) or first stage
      setSelectedStageId(null);
    }
  }, [open, initialStageAssignments]);

  // 3. Filtering Logic: Identify which officers are "Qualified" for which stage
  const stageQualificationMap = useMemo(() => {
    const map = new Map<string, Set<string>>(); // StageId -> Set of OfficerIds

    officerFollowUpStages.forEach(stage => {
      const qualifiedIds = new Set<string>();

      // From Stage Definition
      if (Array.isArray(stage.officer_ids)) {
        stage.officer_ids.forEach((id: any) => qualifiedIds.add(id.toString()));
      } else if (stage.officer_id) {
        qualifiedIds.add(stage.officer_id.toString());
      }

      // From Current Task Data
      const taskStageData = task?.stages?.[stage.id];
      if (taskStageData) {
        if (Array.isArray(taskStageData.officer_ids)) {
          taskStageData.officer_ids.forEach((id: any) => qualifiedIds.add(id.toString()));
        } else if (taskStageData.officer_id) {
          qualifiedIds.add(taskStageData.officer_id.toString());
        }
      }

      map.set(stage.id, qualifiedIds);
    });
    return map;
  }, [officerFollowUpStages, task]);

  // 4. Filter the officer list based on selected stage and search query
  const filteredOfficers = useMemo(() => {
    let list = officers || [];

    // If a specific stage is selected, filter by qualification
    if (selectedStageId) {
      const qualifiedIds = stageQualificationMap.get(selectedStageId);
      // If no qualified officers for this stage, return empty array
      if (!qualifiedIds || qualifiedIds.size === 0) {
        return [];
      }
      list = list.filter(o => qualifiedIds.has(o.id.toString()));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(o =>
        (o.displayName || o.name || "").toLowerCase().includes(q) ||
        (o.role || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [officers, selectedStageId, stageQualificationMap, searchQuery]);

  const toggleOfficerInStage = (officerId: string) => {
    // If no stage selected, we treat it as a general assignment (or prevent it)
    // For this UI, we'll assign to the current selected stage context
    const stageKey = selectedStageId || 'all';

    setLocalAssignments(prev => {
      const currentIds = prev[stageKey] || [];
      const newIds = currentIds.includes(officerId)
        ? currentIds.filter(id => id !== officerId)
        : [...currentIds, officerId];

      return { ...prev, [stageKey]: newIds };
    });
  };

  const handleApply = () => {
    onAssign(localAssignments);
    onOpenChange(false);
  };

  const totalDistinctOfficers = useMemo(() => {
    const allIds = new Set<string>();
    Object.values(localAssignments).forEach(ids => ids.forEach(id => allIds.add(id)));
    return allIds.size;
  }, [localAssignments]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl p-0 flex flex-col h-[85vh] max-h-[900px] overflow-hidden">

        {/* HEADER */}
        <div className="p-6 border-b bg-white shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-600 rounded-xl shadow-blue-200 shadow-lg">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">Assign Team Members</DialogTitle>
                <DialogDescription className="text-slate-500 font-medium">
                  Task #{task?.id} &bull; {task?.title || 'Workflow Assignment'}
                </DialogDescription>
              </div>
            </div>
            <div className="text-right">
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 px-3 py-1 text-sm">
                {totalDistinctOfficers} Unique Officers Selected
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* LEFT COLUMN: Sidebar Navigation */}
          <div className="w-[320px] border-r bg-slate-50/50 flex flex-col shrink-0">
            <div className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-4 px-2">
                Workflow Stages
              </p>
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedStageId(null)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all",
                    !selectedStageId
                      ? "bg-white border-slate-200 border shadow-sm text-blue-600 font-bold"
                      : "text-slate-600 hover:bg-slate-100 border border-transparent"
                  )}
                >
                  <Layers className={cn("h-4 w-4", !selectedStageId ? "text-blue-600" : "text-slate-400")} />
                  All Available Officers
                  {!selectedStageId && <CheckCircle2 className="h-4 w-4 ml-auto" />}
                </button>

                <Separator className="my-4 opacity-50" />

                {officerFollowUpStages.map((s) => {
                  const count = (localAssignments[s.id] || []).length;
                  const isActive = selectedStageId === s.id;

                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStageId(s.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all group",
                        isActive
                          ? "bg-white border-slate-200 border shadow-sm text-blue-600 font-bold"
                          : "text-slate-600 hover:bg-slate-100 border border-transparent"
                      )}
                    >
                      <div className={cn(
                        "h-2 w-2 rounded-full",
                        isActive ? "bg-blue-600" : "bg-slate-300"
                      )} />
                      <span className="truncate flex-1 text-left">{s.name}</span>
                      {count > 0 && (
                        <Badge className={cn(
                          "ml-auto text-[10px] px-1.5 h-5 min-w-[20px] flex items-center justify-center",
                          isActive ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
                        )}>
                          {count}
                        </Badge>
                      )}
                      {isActive && <ChevronRight className="h-4 w-4 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto p-6">
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex gap-3">
                <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-[12px] text-blue-800 leading-snug">
                  Select a stage to view qualified officers for that specific workflow step.
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Officer List */}
          <div className="flex-1 flex flex-col bg-white">
            <div className="p-6 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  className="w-full pl-10 h-12 bg-slate-50 border-none ring-1 ring-slate-200 focus-visible:ring-2 focus-visible:ring-blue-500"
                  placeholder="Search officers by name, role or department..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {selectedStageId && (
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-tight">Filtering By:</span>
                  <Badge variant="outline" className="bg-blue-50/50 text-blue-700 border-blue-100">
                    {officerFollowUpStages.find(s => s.id === selectedStageId)?.name}
                  </Badge>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-6">
                {filteredOfficers.length > 0 ? (
                  filteredOfficers.map((officer) => {
                    const officerId = officer.id.toString();
                    const stageKey = selectedStageId || 'all';
                    const isSelected = (localAssignments[stageKey] || []).includes(officerId);
                    const wasOriginallyHere = initialStageAssignments?.[stageKey]?.includes(officerId);

                    return (
                      <div
                        key={officer.id}
                        onClick={() => toggleOfficerInStage(officerId)}
                        className={cn(
                          "flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all",
                          isSelected
                            ? "bg-blue-50/50 border-blue-200 ring-1 ring-blue-100 shadow-sm"
                            : "bg-white border-slate-100 hover:border-slate-300 shadow-sm hover:shadow-md"
                        )}
                      >
                        <div className={cn(
                          "h-12 w-12 rounded-full flex items-center justify-center font-bold border shrink-0",
                          isSelected ? "bg-blue-600 text-white border-blue-600" : "bg-slate-100 text-slate-600 border-slate-200"
                        )}>
                          {(officer.displayName || officer.name || "U").charAt(0).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-900 truncate">
                              {officer.displayName || officer.name}
                            </p>
                            {isSelected && !wasOriginallyHere && (
                              <Badge className="h-4 px-1.5 bg-green-100 text-green-700 border-green-200 text-[9px] font-bold uppercase">New</Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-medium truncate">
                            {officer.role || "Officer"}
                          </p>
                        </div>

                        <div className={cn(
                          "h-6 w-6 rounded-lg border flex items-center justify-center transition-all",
                          isSelected ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300"
                        )}>
                          {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
                    <Search className="h-10 w-10 opacity-10" />
                    <p className="text-sm font-medium">No officers match your search or qualifications.</p>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* SELECTION SUMMARY BAR */}
            <div className="mt-auto p-4 border-t bg-slate-50/80">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Current Draft Summary
                </p>
              </div>
              <ScrollArea className="h-12">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(localAssignments).map(([sId, ids]) => {
                    if (ids.length === 0) return null;
                    const stageName = sId === 'all' ? 'Uncategorized' : officerFollowUpStages.find(s => s.id === sId)?.name;
                    return (
                      <Badge key={sId} variant="outline" className="bg-white border-slate-200 text-[11px] font-medium py-1">
                        {stageName}: <span className="text-blue-600 ml-1">{ids.length} Officers</span>
                      </Badge>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <DialogFooter className="p-4 border-t bg-white shrink-0 gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="font-semibold text-slate-500">
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            className="min-w-[200px] bg-blue-600 hover:bg-blue-700 h-11 font-bold shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
          >
            Apply All Assignments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}