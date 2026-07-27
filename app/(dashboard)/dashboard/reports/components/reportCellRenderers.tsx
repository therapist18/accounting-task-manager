// @ts-nocheck
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Upload, CheckCircle2, AlertTriangle, CalendarIcon, AlertCircle } from "lucide-react";
import { isValid, format } from "date-fns";
import { cn } from "@/lib/utils";

// Shared between StandardReportView (desktop table) and MobileReportView (card layout)
// so the two layouts always show identical cell logic/state.

export const formatDateCell = (dateStr: string | null, showTime: boolean): string => {
  if (!dateStr) return "—";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return showTime ? `${dateStr} 00:00` : dateStr;
  try {
    const d = new Date(dateStr);
    if (isValid(d)) return showTime ? format(d, "dd/MM/yyyy HH:mm") : format(d, "dd/MM/yyyy");
  } catch { }
  return dateStr;
};

export const formatEstimatedMins = (minutes: number): string => {
  if (!minutes || minutes <= 0) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const d = Math.floor(h / 24);
  return d >= 1 ? `~${d}d` : `~${h}h`;
};

export const DataCell = ({ val, isMissing, isPrimary, isAccent }: { val: React.ReactNode, isMissing: boolean, isPrimary?: boolean, isAccent?: boolean }) => (
  <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          "block w-full truncate text-sm cursor-default leading-snug",
          isMissing
            ? "text-slate-400 font-medium italic"
            : isAccent
              ? "text-violet-700 font-bold"
              : isPrimary
                ? "text-slate-900 font-semibold"
                : "text-slate-500 font-medium"
        )}>
          {val}
        </div>
      </TooltipTrigger>
      {val && val !== 'N/A' && (
        <TooltipContent side="top" className="max-w-sm bg-slate-800 text-white border-none shadow-xl text-sm rounded-lg px-3 py-2 z-[9999] break-words">
          {val}
        </TooltipContent>
      )}
    </Tooltip>
  </TooltipProvider>
);

export const PendingUploadLink = ({ taskId, stageId, subdeptId, deptId }: any) => (
  <Link
    href={`/dashboard/tasks?deptId=${deptId || ''}&subDeptId=${subdeptId}&taskId=${taskId}&stageId=${stageId}`}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-1.5 group/cell text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
    onClick={e => e.stopPropagation()}
  >
    <div className="h-2 w-2 rounded-full bg-slate-300 shrink-0 group-hover/cell:bg-blue-400 transition-colors" />
    <span className="text-sm font-medium italic">Pending</span>
    <Upload className="h-3.5 w-3.5 opacity-0 group-hover/cell:opacity-100 transition-opacity ml-0.5 shrink-0" />
  </Link>
);

// ── ReportStageDateCell ───────────────────────────────────────────────────────
export const ReportStageDateCell = ({
  dateValue, isCompleted, isPending, isOverdue, requiresUpload,
  taskId, stageId, subdeptId, deptId,
  isSkipped, skipReason,
  showTime, onSaveStageDate,
}: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [dateInput, setDateInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const hasDate = !!dateValue;

  const handleCancel = () => {
    setIsEditing(false);
    setSelectedDate(undefined);
    setDateInput('');
  };

  const handleDateInputChange = (val: string) => {
    setDateInput(val);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
      const [dd, mm, yyyy] = val.split('/');
      const d = new Date(`${yyyy}-${mm}-${dd}`);
      if (isValid(d)) setSelectedDate(d);
    }
  };

  const handleCalendarSelect = (d: Date | undefined) => {
    setSelectedDate(d);
    if (d) setDateInput(format(d, 'dd/MM/yyyy'));
  };

  const handleSave = async () => {
    const finalDate = selectedDate ? format(selectedDate, 'dd/MM/yyyy') : dateInput;
    if (!finalDate || !onSaveStageDate) return;
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(finalDate)) return;
    setIsSaving(true);
    try {
      await onSaveStageDate(taskId, stageId, finalDate);
      handleCancel();
    } finally {
      setIsSaving(false);
    }
  };

  const dateOk = selectedDate != null || /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput);

  // Status: Skipped
  if (isSkipped) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 text-sm text-amber-600 font-medium cursor-help">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Skipped
            </span>
          </TooltipTrigger>
          <TooltipContent className="bg-amber-50 border-amber-200 text-amber-900 text-xs shadow-md px-3 py-2 rounded-lg z-[9999]">
            {skipReason || 'No reason provided'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Status: Completed
  if (isCompleted) {
    if (hasDate) {
      const completedBlock = (
        <div className="flex items-center gap-1.5 cursor-default select-none group/cell">
          {isOverdue
            ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
          <span className={cn("text-sm font-semibold whitespace-nowrap tracking-tight", isOverdue ? "text-amber-700" : "text-slate-800")}>
            {formatDateCell(dateValue, showTime)}
          </span>
          {isOverdue && (
            <span className="text-[8px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded uppercase ml-1">LATE</span>
          )}
        </div>
      );
      return (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>{completedBlock}</TooltipTrigger>
            <TooltipContent
              side="top"
              className={cn(
                "border shadow-lg text-xs rounded-lg px-3 py-2 z-[9999]",
                isOverdue ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900"
              )}
            >
              <p className="font-bold mb-0.5">{isOverdue ? "Completed — Overdue" : "Completed On Time"}</p>
              <p className="text-slate-600 text-sm">{formatDateCell(dateValue, true)}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    } else {
      // Marked completed, but no date (Set Date mode)
      return (
        <Popover open={isEditing} onOpenChange={(o) => { if (!o) handleCancel(); }}>
          <PopoverTrigger asChild>
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 text-emerald-600 border border-dashed border-emerald-300 hover:border-emerald-400 bg-emerald-50 rounded px-2 py-1 text-[10px] transition-colors"
            >
              <CheckCircle2 className="h-3 w-3" /> Set Date
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3 z-[9999]" align="start" side="bottom">
            <div className="space-y-2.5">
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Set Completion Date</p>
              <Input
                placeholder="DD/MM/YYYY"
                value={dateInput}
                onChange={(e) => handleDateInputChange(e.target.value)}
                className="h-8 text-sm font-mono"
              />
              <CalendarPicker
                mode="single"
                selected={selectedDate}
                onSelect={handleCalendarSelect}
                initialFocus
              />
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleSave}
                  disabled={!dateOk || isSaving}
                  size="sm"
                  className="flex-1 h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-40"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
                <Button onClick={handleCancel} size="sm" variant="outline" className="flex-1 h-8 text-xs">
                  Cancel
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      );
    }
  }

  // Status: Pending (Document Stage -> Redirect to Tasks page to upload / select docs)
  if (requiresUpload) {
    return <PendingUploadLink taskId={taskId} stageId={stageId} subdeptId={subdeptId} deptId={deptId} />;
  }

  // Status: Pending (Manual Input Stage -> Inline Calendar Popover for "Add Date")
  return (
    <Popover open={isEditing} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <PopoverTrigger asChild>
        <button
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-1.5 text-slate-500 hover:text-blue-600 border border-dashed border-slate-300 hover:border-blue-400 rounded px-2 py-1 text-xs transition-colors"
        >
          <CalendarIcon className="h-3 w-3" /> Add Date
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 z-[9999]" align="start" side="bottom">
        <div className="space-y-2.5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enter Date</p>
          <Input
            placeholder="DD/MM/YYYY"
            value={dateInput}
            onChange={(e) => handleDateInputChange(e.target.value)}
            className="h-8 text-sm font-mono"
          />
          <CalendarPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            initialFocus
          />
          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={!dateOk || isSaving}
              size="sm"
              className="flex-1 h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-40"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            <Button onClick={handleCancel} size="sm" variant="outline" className="flex-1 h-8 text-xs">
              Cancel
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// ── Shared cell-content resolver ─────────────────────────────────────────────
// Given a task + column definition, returns the same cell JSX used by both the
// desktop table (StandardReportView) and the mobile card layout (MobileReportView).
export function renderReportCellContent(task: any, col: any, opts: {
  renderCellValue: (task: any, col: any) => any;
  safeRender: (val: any) => any;
  showTime?: boolean;
  showOfficers?: boolean;
  activeDeptId?: string;
  onSaveStageDate?: (taskId: string, stageId: string, date: string) => Promise<void>;
}): React.ReactNode {
  const { renderCellValue, safeRender, showTime = false, showOfficers = false, activeDeptId = '', onSaveStageDate } = opts;
  const rawCellVal = renderCellValue(task, col);

  // ── Combined stage_info cell ──
  if (rawCellVal && typeof rawCellVal === 'object' && rawCellVal.isCombinedStageDetails) {
    if (rawCellVal.isApplicable === false) {
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1.5 text-sm text-slate-400 font-medium italic cursor-default pl-1">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
                N/A
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-slate-800 text-white border-none shadow-xl text-xs rounded-lg px-3 py-2 z-[9999]">
              Stage not applicable for this task's Job Level
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    const { hasDate, hasDocs, hasOfficer, docIsPending, stageDateRawProps, docNode, officerNode, docIsOverdue, docDateValue, docStageName, docEstimatedTime, docIsCompleted } = rawCellVal;

    return (
      <div className="flex items-center w-full min-h-[26px] flex-wrap gap-y-1">
        {hasDate && (
          <div className={cn(
            "flex-1 flex items-center",
            (hasDocs || (hasOfficer && showOfficers)) && "pr-2 border-r border-slate-200 mr-2"
          )}>
            <ReportStageDateCell
              {...stageDateRawProps}
              showTime={showTime}
              onSaveStageDate={onSaveStageDate}
              deptId={activeDeptId}
            />
          </div>
        )}
        {hasDocs && (
          <div className={cn(
            "flex-1 flex items-center",
            (hasOfficer && showOfficers) && "pr-2 border-r border-slate-200 mr-2"
          )}>
            {docIsPending ? (
              <PendingUploadLink
                taskId={stageDateRawProps.taskId}
                stageId={stageDateRawProps.stageId}
                subdeptId={stageDateRawProps.subdeptId}
                deptId={stageDateRawProps.deptId}
              />
            ) : docIsOverdue ? (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-default select-none group/cell">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      {docNode}
                      <span className="text-[8px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded uppercase ml-1">LATE</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="border shadow-lg text-xs rounded-lg px-3 py-2 z-[9999] bg-amber-50 border-amber-200 text-amber-900"
                  >
                    <p className="font-bold mb-0.5">Completed — Overdue</p>
                    <p className="text-slate-600 text-sm">{formatDateCell(docDateValue, showTime)}</p>
                    {docEstimatedTime && <p className="text-slate-500 text-[10px] mt-1">Est. {formatEstimatedMins(docEstimatedTime)}</p>}
                    {docStageName && <p className="text-slate-500 text-[10px]">{docStageName}</p>}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : docIsCompleted && docDateValue ? (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-default select-none group/cell">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      {docNode}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="border shadow-lg text-xs rounded-lg px-3 py-2 z-[9999] bg-emerald-50 border-emerald-200 text-emerald-900"
                  >
                    <p className="font-bold mb-0.5">Completed On Time</p>
                    <p className="text-slate-600 text-sm">{formatDateCell(docDateValue, true)}</p>
                    {docEstimatedTime && <p className="text-slate-500 text-[10px] mt-1">Est. {formatEstimatedMins(docEstimatedTime)}</p>}
                    {docStageName && <p className="text-slate-500 text-[10px]">{docStageName}</p>}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : docNode}
          </div>
        )}
        {(hasOfficer && showOfficers) && (
          <div className="flex-1 flex items-center">
            {officerNode}
          </div>
        )}
      </div>
    );
  }

  // ── Report doc / reference requirement: raw custom node rendered directly ──
  if (col.type === 'report_doc' || col.type === 'reference_requirement') {
    return rawCellVal;
  }

  // ── Non-stage / task / N/A cell ──
  const val = safeRender(rawCellVal);
  const isMissing = React.isValidElement(val) && val.props?.className?.includes('text-rose-600');
  const isPrimary = col.field === 'applicant_name' || col.field === 'company_name';
  const isAccent = col.type === 'total_time_expected' || col.type === 'total_time_actual';
  return isMissing ? val : <DataCell val={val} isMissing={val === 'N/A'} isPrimary={isPrimary} isAccent={isAccent} />;
}
