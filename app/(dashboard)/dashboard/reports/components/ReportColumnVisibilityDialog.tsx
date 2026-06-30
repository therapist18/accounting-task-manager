// @ts-nocheck
"use client"
import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Eye, Search } from 'lucide-react'
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

interface Column {
  id: string;
  label: string;
  type: string;
  stageId?: string;
  [key: string]: any;
}

interface ReportColumnVisibilityDialogProps {
  columns: Column[];
  visibleColumnIds: string[];
  setVisibleColumnIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  showDocRequirementsColumns?: boolean;
  setShowDocRequirementsColumns?: (show: boolean) => void;
}

export function ReportColumnVisibilityDialog({
  columns,
  visibleColumnIds,
  setVisibleColumnIds,
  showDocRequirementsColumns = false,
  setShowDocRequirementsColumns,
}: ReportColumnVisibilityDialogProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const taskColumns = columns.filter(c => c.type === 'task');
  const timeTrackingColumns = columns.filter(c =>
    c.type === 'current_stage_age' ||
    c.type === 'total_process_age'
  );
  const docReqColumns = columns.filter(c => c.type === 'reference_requirement');
  const stageColumns = columns.filter(c => c.stageId && (c.type === 'stage_date' || c.type === 'stage_officer' || c.type === 'stage_doc_fields'));

  const handleColumnToggle = (colId: string, checked: boolean) => {
    setVisibleColumnIds(prev => {
      if (checked) return [...prev, colId];
      return prev.filter(id => id !== colId);
    });
  };

  const handleDocRequirementsToggle = (checked: boolean) => {
    if (setShowDocRequirementsColumns) {
      setShowDocRequirementsColumns(checked);
    }
    const docReqColIds = docReqColumns.map(c => c.id);
    setVisibleColumnIds(prev => {
      if (checked) {
        return [...new Set([...prev, ...docReqColIds])];
      }
      return prev.filter(id => !docReqColIds.includes(id));
    });
  };

  const filterColumns = (cols: Column[]) => {
    if (!searchQuery) return cols;
    return cols.filter(col => col.label.toLowerCase().includes(searchQuery.toLowerCase()));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-10 px-5 rounded-full border-slate-200 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 shrink-0 gap-2">
          <Eye className="h-4 w-4" />
          Columns
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Column Visibility</DialogTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search columns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9"
            />
          </div>
        </DialogHeader>

        <div className="flex-grow overflow-y-auto pr-4 -mr-4 mt-4 space-y-4">
          {/* Task Details */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b p-4 bg-gray-50">
              <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wider">Task Details</h3>
            </div>
            <div className="p-4 space-y-2">
              {filterColumns(taskColumns).map(col => (
                <div key={col.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`col-${col.id}`}
                    checked={visibleColumnIds.includes(col.id)}
                    onCheckedChange={(checked) => handleColumnToggle(col.id, checked === true)}
                  />
                  <label htmlFor={`col-${col.id}`} className="text-sm cursor-pointer flex-1 truncate">{col.label}</label>
                </div>
              ))}
            </div>
          </div>

          {/* Time Tracking - Always visible, no toggle */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b p-4 bg-gray-50">
              <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wider">Time Tracking</h3>
            </div>
            <div className="p-4 space-y-2">
              {filterColumns(timeTrackingColumns).map(col => (
                <div key={col.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`col-${col.id}`}
                    checked={visibleColumnIds.includes(col.id)}
                    onCheckedChange={(checked) => handleColumnToggle(col.id, checked === true)}
                  />
                  <label htmlFor={`col-${col.id}`} className="text-sm cursor-pointer flex-1 truncate">{col.label}</label>
                </div>
              ))}
            </div>
          </div>

          {/* Document Requirements */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b p-4 bg-gray-50">
              <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wider">Document Requirements</h3>
              <Checkbox
                id="toggle-doc-requirements"
                checked={showDocRequirementsColumns}
                onCheckedChange={(checked) => handleDocRequirementsToggle(checked === true)}
              />
            </div>
            <div className="p-4 space-y-2">
              {filterColumns(docReqColumns).map(col => (
                <div key={col.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`col-${col.id}`}
                    checked={visibleColumnIds.includes(col.id)}
                    onCheckedChange={(checked) => handleColumnToggle(col.id, checked === true)}
                  />
                  <label htmlFor={`col-${col.id}`} className="text-sm cursor-pointer flex-1 truncate">{col.label}</label>
                </div>
              ))}
            </div>
          </div>

          {/* Stages */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b p-4 bg-gray-50">
              <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wider">Stages</h3>
            </div>
            <div className="p-4 space-y-2">
              {filterColumns(stageColumns).map(col => (
                <div key={col.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`col-${col.id}`}
                    checked={visibleColumnIds.includes(col.id)}
                    onCheckedChange={(checked) => handleColumnToggle(col.id, checked === true)}
                  />
                  <label htmlFor={`col-${col.id}`} className="text-sm cursor-pointer flex-1 truncate">{col.label}</label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
