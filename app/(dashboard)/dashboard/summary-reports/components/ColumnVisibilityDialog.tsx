// @ts-nocheck
"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SUMMARY_COLUMNS } from "../stageColumnConfig";

// Same pattern as reports/components/ReportColumnVisibilityDialog.tsx — a Columns button
// opening a searchable checkbox list — adapted to the Summary Reports Dashboard's flat,
// fixed column set (no grouping needed, unlike the Reports module's dynamic columns).
export function ColumnVisibilityDialog({ visibleColumnIds, setVisibleColumnIds }: {
  visibleColumnIds: string[];
  setVisibleColumnIds: (ids: string[] | ((prev: string[]) => string[])) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleToggle = (colId: string, checked: boolean) => {
    setVisibleColumnIds(prev => checked ? [...prev, colId] : prev.filter(id => id !== colId));
  };

  const filteredColumns = searchQuery
    ? SUMMARY_COLUMNS.filter(c => c.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : SUMMARY_COLUMNS;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-3 rounded-lg text-sm font-bold gap-1.5 transition-all shrink-0 text-slate-500 hover:bg-slate-100"
        >
          <Eye className="h-3.5 w-3.5" />
          Columns
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
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

        <div className="flex-grow overflow-y-auto pr-4 -mr-4 mt-4">
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="p-4 space-y-2">
              {filteredColumns.map(col => (
                <div key={col.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`summary-col-${col.id}`}
                    checked={visibleColumnIds.includes(col.id)}
                    onCheckedChange={(checked) => handleToggle(col.id, checked === true)}
                  />
                  <label htmlFor={`summary-col-${col.id}`} className="text-sm cursor-pointer flex-1 truncate">{col.label}</label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
