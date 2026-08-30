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
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
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
import { isStageApplicableToTask } from "../../reports/utils/reportStageLogic"

interface AssignOfficersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: any
  officers: any[]
  stages?: any[]
  departments?: any[]
  officerSections?: Array<{ id: string, name: string, stage_ids: string[] }>
  initialStageAssignments?: Record<string, string[]>
  onAssign: (stageAssignments: Record<string, string[]>) => void
}

export function AssignOfficersDialog({
  open,
  onOpenChange,
  task,
  officers,
  stages,
  departments,
  officerSections,
  initialStageAssignments,
  onAssign
}: AssignOfficersDialogProps) {
  // localAssignments: { [stageId]: string[] }
  const [localAssignments, setLocalAssignments] = useState<Record<string, string[]>>({});
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // 1. Filter stages that require officer follow-up AND are applicable to this task's job level,
  //    so the "Assigning to:" list only surfaces stages the current task can actually go through.
  const officerFollowUpStages = useMemo(() => {
    return (stages || []).filter(s =>
      s.follow_up?.toLowerCase() === 'officer' &&
      isStageApplicableToTask(s, task, departments || [])
    );
  }, [stages, task, departments]);

  // 1b. Section-aware groupings of officer stages. Each configured section groups the officer
  //    stages whose ids it contains; any officer stage not in a section falls back into an
  //    "Ungrouped" bucket. Rendering against these groups lets an admin assign one officer to a
  //    whole contiguous block of steps instead of clicking each stage.
  const officerGroups = useMemo(() => {
    const groups: Array<{ id: string, isSection: boolean, name: string, stages: any[] }> = [];
    const sectioned = new Set<string>();

    (officerSections || []).forEach(sec => {
      const memberStages = officerFollowUpStages.filter(s =>
        Array.isArray(sec.stage_ids) && sec.stage_ids.includes(s.id)
      );
      if (memberStages.length === 0) return;
      memberStages.forEach(s => sectioned.add(s.id));
      groups.push({ id: sec.id, isSection: true, name: sec.name || 'Section', stages: memberStages });
    });

    const ungrouped = officerFollowUpStages.filter(s => !sectioned.has(s.id));
    if (ungrouped.length > 0) {
      groups.push({ id: '__ungrouped__', isSection: false, name: 'Ungrouped', stages: ungrouped });
    }

    return groups;
  }, [officerSections, officerFollowUpStages]);

  // 2. Initialize local state when dialog opens
  useEffect(() => {
    if (open) {
      // Normalize to a single officer per stage so pre-existing multi-officer data still obeys
      // the one-officer rule (keep the first assigned officer for each stage).
      const normalized: Record<string, string[]> = {};
      Object.entries(initialStageAssignments || {}).forEach(([sid, ids]) => {
        if (Array.isArray(ids) && ids.length > 0) normalized[sid] = [ids[0]];
      });
      setLocalAssignments(normalized);
      // Default to first group (section or ungrouped bucket)
      setSelectedStageId(officerGroups[0]?.id || null);
    }
  }, [open, initialStageAssignments, officerGroups]);

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

  // 4. The stages belonging to the current selection. When a whole section is selected we
  //    treat the union of its stages' qualified officers as the pool to render.
  const selectedGroupStages = useMemo(() => {
    const group = officerGroups.find(g => g.id === selectedStageId);
    return group ? group.stages : [];
  }, [officerGroups, selectedStageId]);

  // 4. Filter the officer list based on selected stage and search query
  const filteredOfficers = useMemo(() => {
    let list = officers || [];

    // If a specific group is selected, filter by the union of qualifications across its stages
    if (selectedGroupStages.length > 0) {
      const qualifiedIds = new Set<string>();
      selectedGroupStages.forEach(stage => {
        (stageQualificationMap.get(stage.id) || new Set<string>()).forEach(id => qualifiedIds.add(id));
      });
      if (qualifiedIds.size === 0) {
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
  }, [officers, selectedGroupStages, stageQualificationMap, searchQuery]);

  // Stage ids the currently selected group fans assignments out to.
  const selectedTargetStageIds = useMemo(
    () => selectedGroupStages.map(s => s.id),
    [selectedGroupStages],
  );

  const isOfficerSelectedInGroup = (officerId: string) =>
    selectedTargetStageIds.some(sid => (localAssignments[sid] || []).includes(officerId));

  const toggleOfficerInGroup = (officerId: string) => {
    // Only one officer may be selected across the whole dialog at a time. Selecting a new
    // officer clears every other stage's selection, then fans the single choice out to every
    // officer stage in the current group (sections of consecutive officer steps).
    const alreadySelected = isOfficerSelectedInGroup(officerId);
    setLocalAssignments(prev => {
      const next: Record<string, string[]> = {};
      if (!alreadySelected) {
        // Drop any prior selection from all stages, then apply the new single officer.
        Object.keys(prev).forEach(sid => { next[sid] = []; });
        selectedTargetStageIds.forEach(sid => { next[sid] = [officerId]; });
      }
      // alreadySelected -> clear the group's stages (deselect). Other stages stay untouched.
      if (alreadySelected) {
        Object.keys(prev).forEach(sid => {
          next[sid] = selectedTargetStageIds.includes(sid) ? [] : (prev[sid] || []);
        });
      }
      return next;
    });
  };

  const handleApply = () => {
    onAssign(localAssignments);
    onOpenChange(false);
  };

  // Get current stage for display
  const currentStage = useMemo(() => {
    if (!task?.stages) return null;
    const stages = Object.entries(task.stages);
    // Find the most recent stage with a status
    const completedStages = stages.filter(([_, data]: [string, any]) =>
      data.status === 'completed' || data.status === 'Completed'
    );
    if (completedStages.length > 0) {
      // Return the last completed stage
      const lastCompleted = completedStages[completedStages.length - 1];
      return lastCompleted[0]; // stage ID
    }
    // If no completed stages, return the first stage
    return stages[0]?.[0] || null;
  }, [task]);

  const currentStageName = useMemo(() => {
    if (!currentStage || !stages) return null;
    const stage = stages.find((s: any) => s.id === currentStage);
    if (!stage) return null;
    const orderNum = stage.order_num || stage.order || '';
    return orderNum ? `${orderNum}. ${stage.name}` : stage.name;
  }, [currentStage, stages]);

  const totalDistinctOfficers = useMemo(() => {
    const allIds = new Set<string>();
    Object.values(localAssignments).forEach(ids => ids.forEach(id => allIds.add(id)));
    return allIds.size;
  }, [localAssignments]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[75vw] p-0 flex flex-col h-[90vh] max-h-[95vh] overflow-hidden">

        {/* HEADER */}
        <div className="p-6 border-b bg-white shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-600 rounded-xl shadow-blue-200 shadow-lg">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">Assign Officers</DialogTitle>
                <DialogDescription className="text-slate-500 font-medium text-base">
                  Task #{task?.id} &bull; <span className="text-slate-700 font-semibold">{task?.applicant_name || task?.applicant_details?.name || 'Unknown Applicant'}</span>
                  {currentStageName && (
                    <span className="ml-2 text-blue-600 font-medium text-sm">
                      &bull; Current Stage: {currentStageName}
                    </span>
                  )}
                  {task?.job_level && (
                    <span className="ml-2 text-slate-400 text-sm">
                      &bull; {task.job_level.department?.name || ''} {task.job_level.subdepartment?.name ? `/ ${task.job_level.subdepartment.name}` : ''} {task.job_level.class?.name ? `/ ${task.job_level.class.name}` : ''}
                    </span>
                  )}
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

        <ResizablePanelGroup direction="horizontal" className="flex-1">
          {/* LEFT COLUMN: Sidebar Navigation */}
          <ResizablePanel defaultSize={25} minSize={20} maxSize={40} className="border-r bg-slate-50/50 flex flex-col overflow-hidden">
            <div className="p-4 overflow-y-auto flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-4 px-2">
                Officer Sections &amp; Stages
              </p>
              <div className="space-y-1">
                {officerGroups.map((g) => {
                  // Distinct officers assigned across this group's stages.
                  const groupOfficerIds = new Set<string>();
                  g.stages.forEach(s => (localAssignments[s.id] || []).forEach(id => groupOfficerIds.add(id)));
                  const count = groupOfficerIds.size;
                  const isActive = selectedStageId === g.id;
                  const rangeLabel = g.stages.length > 1
                    ? `${g.stages[0]?.order_num}. ${g.stages[0]?.name} – ${g.stages[g.stages.length - 1]?.order_num}. ${g.stages[g.stages.length - 1]?.name}`
                    : `${g.stages[0]?.order_num}. ${g.stages[0]?.name}`;

                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedStageId(g.id)}
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
                      <span className="truncate flex-1 text-left">
                        <span className="block truncate font-semibold">{g.name}</span>
                        <span className={cn("block text-[11px] font-medium truncate", isActive ? "text-blue-500" : "text-slate-400")}>
                          {g.stages.length} stage{g.stages.length === 1 ? "" : "s"} &bull; {rangeLabel}
                        </span>
                      </span>
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
                  Select a section to view its officer stages. Assigning an officer applies to
                  every officer stage in that section.
                </p>
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* RIGHT COLUMN: Officer List */}
          <ResizablePanel defaultSize={75} minSize={60} className="flex flex-col bg-white overflow-hidden">
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
              {selectedGroupStages.length > 0 && (
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-tight">Assigning to:</span>
                  <Badge variant="outline" className="bg-blue-50/50 text-blue-700 border-blue-100">
                    {officerGroups.find(g => g.id === selectedStageId)?.name}
                  </Badge>
                  {selectedGroupStages.map(s => (
                    <Badge key={s.id} variant="secondary" className="text-[10px] bg-slate-100 text-slate-600">
                      {s.order_num}. {s.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-6">
                {filteredOfficers.length > 0 ? (
                  filteredOfficers.map((officer) => {
                    const officerId = officer.id.toString();
                    const isSelected = isOfficerSelectedInGroup(officerId);
                    const wasOriginallyHere = selectedTargetStageIds.some(sid => initialStageAssignments?.[sid]?.includes(officerId));

                    return (
                      <div
                        key={officer.id}
                        onClick={() => toggleOfficerInGroup(officerId)}
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
                  {officerGroups.map((g) => {
                    const groupOfficerIds = new Set<string>();
                    g.stages.forEach(s => (localAssignments[s.id] || []).forEach(id => groupOfficerIds.add(id)));
                    if (groupOfficerIds.size === 0) return null;
                    return (
                      <Badge key={g.id} variant="outline" className="bg-white border-slate-200 text-[11px] font-medium py-1">
                        {g.name}: <span className="text-blue-600 ml-1">{groupOfficerIds.size} Officer{groupOfficerIds.size === 1 ? "" : "s"}</span>
                      </Badge>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>

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