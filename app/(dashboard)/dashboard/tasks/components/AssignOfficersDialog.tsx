"use client"

import React, { useState, useMemo, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  User,
  Layers,
  Check,
  X,
  Search,
  Users,
  Info,
  CheckCircle2,
  ChevronRight
} from "lucide-react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

interface AssignOfficersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: any
  officers: any[]
  stages?: any[]
  initialStageAssignments?: Record<string, string[]> // Existing stage assignments
  onAssign: (stageAssignments: Record<string, string[]>) => void
}

export function AssignOfficersDialog({ open, onOpenChange, task, officers, stages, initialStageAssignments, onAssign }: AssignOfficersDialogProps) {
  const [selectedOfficerIds, setSelectedOfficerIds] = useState<string[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageSelections, setStageSelections] = useState<Record<string, string[]>>(initialStageAssignments || {});

  // Initialize stageSelections when dialog opens or initialStageAssignments changes
  useEffect(() => {
    if (open && initialStageAssignments) {
      setStageSelections(initialStageAssignments);
      // Auto-select officers for the current stage
      const currentStageKey = selectedStageId || 'all';
      setSelectedOfficerIds(initialStageAssignments[currentStageKey] || []);
    }
  }, [open, initialStageAssignments, selectedStageId]);

  const officerFollowUpStages = useMemo(() => {
    return (stages || []).filter(s => s.follow_up?.toLowerCase() === 'officer');
  }, [stages]);

  const selectedStage = useMemo(() =>
    officerFollowUpStages.find(s => s.id === selectedStageId),
    [selectedStageId, officerFollowUpStages]);

  const filteredOfficers = useMemo(() => {
    let list = officers || [];

    // Filter by Stage logic - combine task assignments and stage associations
    if (selectedStage) {
      const officerIds = new Set<string>();

      // Add officers assigned to this stage in the task
      if (task?.stages?.[selectedStage.id]) {
        const taskStageData = task.stages[selectedStage.id];
        if (taskStageData?.officer_ids && Array.isArray(taskStageData.officer_ids)) {
          taskStageData.officer_ids.forEach((id: any) => officerIds.add(id.toString()));
        } else if (taskStageData?.officer_id) {
          officerIds.add(taskStageData.officer_id.toString());
        }
      }

      // Add officers associated with this stage in the stage definition
      if (selectedStage.officer_ids && Array.isArray(selectedStage.officer_ids)) {
        selectedStage.officer_ids.forEach((id: any) => officerIds.add(id.toString()));
      } else if (selectedStage.officer_id) {
        officerIds.add(selectedStage.officer_id.toString());
      }

      // Filter to show officers that are either assigned or associated
      if (officerIds.size > 0) {
        list = list.filter(o => officerIds.has(o.id.toString()));
      } else {
        list = []; // No officers for this stage
      }
    }

    // Filter by Search Query
    if (searchQuery) {
      list = list.filter(o =>
        (o.displayName || o.name || "").toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return list;
  }, [officers, selectedStage, task, searchQuery]);

  // Get stage names for each officer
  const officerStageMap = useMemo(() => {
    const map = new Map<string, string[]>();
    officerFollowUpStages.forEach(stage => {
      const stageOfficerIds = new Set<string>();
      if (stage.officer_ids && Array.isArray(stage.officer_ids)) {
        stage.officer_ids.forEach((id: any) => stageOfficerIds.add(id.toString()));
      } else if (stage.officer_id) {
        stageOfficerIds.add(stage.officer_id.toString());
      }
      stageOfficerIds.forEach(officerId => {
        if (!map.has(officerId)) {
          map.set(officerId, []);
        }
        map.get(officerId)!.push(stage.name);
      });
    });
    return map;
  }, [officerFollowUpStages]);

  const toggleOfficer = (id: string) => {
    setSelectedOfficerIds(prev => {
      const newSelection = prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
      // Save to current stage's selection
      const stageKey = selectedStageId || 'all';
      setStageSelections(prev => ({
        ...prev,
        [stageKey]: newSelection
      }));
      return newSelection;
    });
  };

  const handleStageChange = (newStageId: string | null) => {
    // Save current selection before changing stage
    const currentStageKey = selectedStageId || 'all';
    setStageSelections(prev => ({
      ...prev,
      [currentStageKey]: selectedOfficerIds
    }));

    // Load selection for the new stage
    const newStageKey = newStageId || 'all';
    setSelectedStageId(newStageId);
    setSelectedOfficerIds(stageSelections[newStageKey] || []);
  };

  const handleAssign = () => {
    // Save current selection before assigning
    const currentStageKey = selectedStageId || 'all';
    setStageSelections(prev => ({
      ...prev,
      [currentStageKey]: selectedOfficerIds
    }));

    // Pass all stage selections to parent
    onAssign(stageSelections);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl p-0 flex flex-col h-[85vh] max-h-[900px]">
        {/* TOP HEADER */}
        <div className="p-6 border-b bg-white shrink-0">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <DialogTitle className="text-xl">Assign Team Members</DialogTitle>
                  <DialogDescription className="text-sm">
                    Task #{task?.id} &bull; {task?.title || 'Workflow Assignment'}
                  </DialogDescription>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline" className="bg-slate-50">
                {selectedOfficerIds.length} Officers Selected
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2">
          {/* LEFT COLUMN: Stage Sidebar */}
          <div className="col-span-1 border-r bg-slate-50/50 flex flex-col shrink-0">
            <div className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-4">
                Stages with Officer Follow-up
              </p>
              <div className="space-y-1">
                <button
                  onClick={() => handleStageChange(null)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                    !selectedStageId
                      ? "bg-white border-slate-200 border shadow-sm text-blue-600 font-semibold"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent"
                  )}
                >
                  <Layers className={cn("h-4 w-4", !selectedStageId ? "text-blue-600" : "text-slate-400")} />
                  All Available
                  {!selectedStageId && <CheckCircle2 className="h-4 w-4 ml-auto" />}
                </button>

                <Separator className="my-3 opacity-50" />

                {officerFollowUpStages.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleStageChange(s.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group",
                      selectedStageId === s.id
                        ? "bg-white border-slate-200 border shadow-sm text-blue-600 font-semibold"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent"
                    )}
                  >
                    <div className={cn(
                      "h-2 w-2 rounded-full",
                      selectedStageId === s.id ? "bg-blue-600" : "bg-slate-300 group-hover:bg-slate-400"
                    )} />
                    <span className="truncate">{s.name}</span>
                    {selectedStageId === s.id && <CheckCircle2 className="h-4 w-4 ml-auto text-blue-600" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Context Info Box */}
            <div className="mt-auto p-4 m-4 bg-blue-50/50 rounded-xl border border-blue-100">
              <div className="flex gap-2">
                <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-[12px] text-blue-800 leading-tight">
                  Selecting a stage filters the officers to only those qualified for that workflow step.
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Officer List & Search */}
          <div className="col-span-1 flex-1 flex flex-col bg-white">
            <div className="p-4 border-b bg-slate-50/30">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  className="w-full pl-10 pr-4 py-2 bg-white border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="Search by name, role or department..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 grid grid-cols-1 gap-2">
                {filteredOfficers.length > 0 ? (
                  filteredOfficers.map((officer) => (
                    <div
                      key={officer.id}
                      onClick={() => toggleOfficer(officer.id.toString())}
                      className={cn(
                        "flex items-center gap-4 p-3 rounded-xl border cursor-pointer transition-all hover:shadow-sm",
                        selectedOfficerIds.includes(officer.id.toString())
                          ? "bg-blue-50/50 border-blue-200 ring-1 ring-blue-200"
                          : "bg-white border-slate-100 hover:border-slate-200"
                      )}
                    >
                      <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center font-bold text-xs border",
                        selectedOfficerIds.includes(officer.id.toString())
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      )}>
                        {(officer.displayName || officer.name || "U").charAt(0).toUpperCase()}
                      </div>

                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {officer.displayName || officer.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {officer.role || "Officer"} &bull;
                        </p>
                      </div>

                      <div className={cn(
                        "h-6 w-6 rounded-full border flex items-center justify-center transition-all",
                        selectedOfficerIds.includes(officer.id.toString())
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-slate-200"
                      )}>
                        {selectedOfficerIds.includes(officer.id.toString()) && <Check className="h-3.5 w-3.5" />}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
                    <div className="p-4 bg-slate-50 rounded-full">
                      <Search className="h-8 w-8 opacity-20" />
                    </div>
                    <p className="text-sm">No officers match your search or filters.</p>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* SELECTION BAR */}
            {selectedOfficerIds.length > 0 && (
              <div className="p-4 border-t bg-slate-50/80">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Currently Selecting:
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedOfficerIds.map(id => {
                    const officer = officers.find(o => o.id.toString() === id);
                    return (
                      <Badge key={id} variant="secondary" className="pl-2 pr-1 py-1 gap-1 bg-white border shadow-sm rounded-md">
                        {officer?.displayName || officer?.name}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleOfficer(id); }}
                          className="hover:bg-slate-100 rounded-sm p-0.5"
                        >
                          <X className="h-3 w-3 text-slate-400 hover:text-slate-900" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM FOOTER */}
        <DialogFooter className="p-4 border-t bg-white shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={selectedOfficerIds.length === 0}
            className="min-w-[160px] bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20"
          >
            Assign {selectedOfficerIds.length > 0 ? `${selectedOfficerIds.length} Officers` : "Members"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}