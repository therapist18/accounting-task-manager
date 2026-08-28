// @ts-nocheck
"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus, Trash2, Copy, ChevronUp, ChevronDown, ListFilter, GripVertical } from 'lucide-react';
import { cn } from "@/lib/utils";

export interface SortLevel {
  id: string;
  key: string;
  sortOn: string;
  direction: string;
}

interface ColumnOption {
  value: string;
  label: string;
  type?: 'text' | 'number' | 'date';
}

interface MultiSortProps {
  columns: ColumnOption[];
  initialLevels?: SortLevel[];
  onApply: (levels: SortLevel[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export const MultiSort: React.FC<MultiSortProps> = ({ columns, initialLevels = [], onApply, open: externalOpen, onOpenChange: externalOnOpenChange, hideTrigger = false }) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;
  const [levels, setLevels] = useState<SortLevel[]>(initialLevels.length > 0 ? initialLevels : [
    { id: '1', key: columns[0]?.value || '', sortOn: 'Cell Values', direction: 'asc' }
  ]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0);

  const addLevel = () => {
    const newLevel: SortLevel = {
      id: crypto.randomUUID(),
      key: columns[0]?.value || '',
      sortOn: 'Cell Values',
      direction: 'asc'
    };
    setLevels([...levels, newLevel]);
    setSelectedIndex(levels.length);
  };

  const deleteLevel = (idx: number) => {
    const newLevels = levels.filter((_, i) => i !== idx);
    setLevels(newLevels);
    if (selectedIndex === idx) setSelectedIndex(newLevels.length > 0 ? 0 : null);
  };

  const copyLevel = (idx: number) => {
    const levelToCopy = levels[idx];
    const newLevel = { ...levelToCopy, id: crypto.randomUUID() };
    const newLevels = [...levels];
    newLevels.splice(idx + 1, 0, newLevel);
    setLevels(newLevels);
    setSelectedIndex(idx + 1);
  };

  const moveLevel = (dir: -1 | 1) => {
    if (selectedIndex === null) return;
    const target = selectedIndex + dir;
    if (target < 0 || target >= levels.length) return;
    const newLevels = [...levels];
    [newLevels[selectedIndex], newLevels[target]] = [newLevels[target], newLevels[selectedIndex]];
    setLevels(newLevels);
    setSelectedIndex(target);
  };

  const updateLevel = (idx: number, patch: Partial<SortLevel>) => {
    setLevels(levels.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger render={
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs rounded-md shadow-none bg-card hover:bg-muted border-border" />
        }>
          <ListFilter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Multi-level Sort</span>
        </DialogTrigger>
      )}

      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden sm:rounded-2xl shadow-xl border-slate-200">
        <DialogHeader className="px-8 pt-8 pb-6 bg-white">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900">Sort configuration</DialogTitle>
              <DialogDescription className="text-sm text-slate-500">
                Manage and prioritize how your data is organized across multiple columns.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Action Bar */}
        <div className="flex items-center justify-between px-8 py-4 bg-slate-50/80 border-y border-slate-100">
          <div className="flex items-center gap-3">
            <Button onClick={addLevel} variant="default" size="sm" className="h-10 px-4 gap-2 shadow-sm">
              <Plus className="w-4 h-4" />
              <span className="text-sm">Add sorting level</span>
            </Button>
            
            <div className="w-[1px] h-6 bg-slate-200 mx-1" />
            
            <div className="flex items-center bg-white border border-slate-200 rounded-md shadow-sm">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-10 rounded-none border-r border-slate-100" 
                disabled={selectedIndex === null || selectedIndex === 0}
                onClick={() => moveLevel(-1)}
              >
                <ChevronUp className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-10 rounded-none" 
                disabled={selectedIndex === null || selectedIndex === levels.length - 1}
                onClick={() => moveLevel(1)}
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="max-h-[500px] overflow-y-auto px-8 py-6 bg-white">
          <div className="space-y-4">
            {levels.map((level, idx) => (
              <div 
                key={level.id}
                onClick={() => setSelectedIndex(idx)}
                className={cn(
                  "group flex items-center gap-4 p-4 rounded-xl border transition-all duration-200",
                  selectedIndex === idx 
                    ? "border-blue-500 bg-blue-50/30 ring-1 ring-blue-500/10 shadow-sm" 
                    : "border-slate-200 hover:border-slate-300 bg-white"
                )}
              >
                <div className="flex items-center gap-3 flex-1">
                  {/* Metadata Label */}
                  <div className="min-w-[85px]">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      {idx === 0 ? "Initial sort" : `Level ${idx + 1}`}
                    </span>
                    <p className="text-xs font-semibold text-slate-600">
                      {idx === 0 ? "Sort by" : "Then by"}
                    </p>
                  </div>

                  {/* Inputs */}
                  <div className="grid grid-cols-12 gap-3 flex-1 items-center">
                    <div className="col-span-5">
                      <SearchableSelect
                        options={columns}
                        value={level.key}
                        onValueChange={(val) => updateLevel(idx, { key: val })}
                        placeholder="Select column..."
                        className="h-10 text-sm"
                      />
                    </div>
                    <div className="col-span-3">
                      <Select value={level.sortOn} onValueChange={(val) => updateLevel(idx, { sortOn: val })}>
                        <SelectTrigger className="h-10 text-sm bg-white border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cell Values" className="text-sm">Cell Values</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-4">
                      <Select value={level.direction} onValueChange={(val) => updateLevel(idx, { direction: val })}>
                        <SelectTrigger className="h-10 text-sm bg-white border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="asc" className="text-sm">Smallest to Largest</SelectItem>
                          <SelectItem value="desc" className="text-sm">Largest to Smallest</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Inline Actions */}
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 text-slate-400 hover:text-slate-900 hover:bg-white"
                    onClick={(e) => { e.stopPropagation(); copyLevel(idx); }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 text-slate-400 hover:text-red-600 hover:bg-red-50"
                    onClick={(e) => { e.stopPropagation(); deleteLevel(idx); }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}

            {levels.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/30">
                <p className="text-sm text-slate-500 mb-4">No sorting levels active</p>
                <Button variant="outline" onClick={addLevel} className="h-9">
                  Define first level
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between sm:justify-between">
          <div className="text-xs text-slate-500">
            {levels.length} {levels.length === 1 ? 'level' : 'levels'} applied
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => setOpen(false)} className="h-10 px-6 text-sm">
              Cancel
            </Button>
            <Button 
              onClick={() => { onApply(levels); setOpen(false); }}
              className="h-10 px-8 text-sm font-medium shadow-md shadow-primary/10"
            >
              Apply Sorting
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};