// @ts-nocheck
// components/ColumnVisibilityDialog.tsx

"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Search, Columns, CheckSquare, Square } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Department, KycDocument } from "../utils/taskManagerData"
import { ENHANCED_TABLE_HEADERS_IMMIGRATION } from "../tasks/overall-view/tableUtils"

interface ColumnVisibilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: any[];
  kycDocuments: Map<string, KycDocument>;
  tableHeaders: typeof ENHANCED_TABLE_HEADERS_IMMIGRATION;
  visibleColumns: string[];
  onApply: (newVisibleColumns: string[]) => void;
}

// Helper to generate consistent IDs
const getStageDateColumnId = (stageId: string) => `stage_${stageId}_date`;
const getDocFieldColumnId = (stageId: string, kycId: string, fieldId: string) => `${stageId}_${kycId}_${fieldId}`;

export function ColumnVisibilityDialog({
  open,
  onOpenChange,
  stages,
  kycDocuments,
  tableHeaders,
  visibleColumns,
  onApply,
}: ColumnVisibilityDialogProps) {
  
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedColumns(new Set(visibleColumns));
      setSearchQuery("");
    }
  }, [open, visibleColumns]);

  const toggleColumn = (id: string) => {
    const newSet = new Set(selectedColumns);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedColumns(newSet);
  };

  const handleSelectAll = (select: boolean) => {
    if (!select) {
      setSelectedColumns(new Set());
      return;
    }
    const newSet = new Set<string>();
    // Static headers
    tableHeaders.forEach(h => newSet.add(h.id));
    // Dynamic headers
    stages.forEach(stage => {
      newSet.add(getStageDateColumnId(stage.id));
      if (stage.documents) {
        Object.keys(stage.documents).forEach(kycId => {
            const doc = kycDocuments.get(kycId);
            if (doc && doc.fields) {
                doc.fields.forEach((field: any) => {
                    newSet.add(getDocFieldColumnId(stage.id, kycId, field.id));
                });
            }
        });
      }
    });
    setSelectedColumns(newSet);
  };

  const handleSave = () => {
    onApply(Array.from(selectedColumns));
    onOpenChange(false);
  };

  const sortedStages = useMemo(() => [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0)), [stages]);

  // --- Filtering Logic ---
  const matchesSearch = (text: string) => text.toLowerCase().includes(searchQuery.toLowerCase());
  const filteredTaskFields = tableHeaders.filter(h => matchesSearch(h.label));

  const filteredStages = sortedStages.map(stage => {
    const stageMatches = matchesSearch(stage.name);
    const relevantDocs = (stage.documents ? Object.keys(stage.documents) : [])
      .map(kycId => {
        const doc = kycDocuments.get(kycId);
        if (!doc) return null;
        const docMatches = matchesSearch(doc.display_name || doc.name);
        const relevantFields = (doc.fields || []).filter((f: any) => 
            stageMatches || docMatches || matchesSearch(f.fieldName)
        );
        if (!stageMatches && !docMatches && relevantFields.length === 0) return null;
        return { kycId, doc, fields: relevantFields };
      })
      .filter(Boolean);

    if (!stageMatches && relevantDocs.length === 0) return null;
    return { ...stage, relevantDocs };
  }).filter(Boolean);


  // --- Helper Component for Table Rows ---
  const VisibilityRow = ({ 
    id, 
    label, 
    depth = 0, 
    isHeader = false,
    className = "" 
  }: { 
    id?: string, 
    label: string, 
    depth?: number, 
    isHeader?: boolean,
    className?: string 
  }) => {
    const isChecked = id ? selectedColumns.has(id) : false;
    
    return (
      <TableRow 
        className={`
          ${id ? 'cursor-pointer hover:bg-slate-50' : ''} 
          ${isHeader ? 'bg-slate-50/80 hover:bg-slate-50/80' : ''}
          ${className}
        `}
        onClick={id ? () => toggleColumn(id) : undefined}
      >
        <TableCell className="py-2.5">
          <div 
            style={{ paddingLeft: `${depth * 24}px` }} 
            className={`text-sm flex items-center ${isHeader ? 'font-semibold text-slate-800' : 'text-slate-600'}`}
          >
            {label}
          </div>
        </TableCell>
        <TableCell className="w-[100px] text-center py-2">
          {id && (
            <Checkbox 
              checked={isChecked}
              onCheckedChange={() => toggleColumn(id)}
              onClick={(e) => e.stopPropagation()}
              className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
            />
          )}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b bg-white">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Columns className="h-5 w-5 text-blue-600" />
                    Column Visibility
                </DialogTitle>
                <DialogDescription>
                    Select which columns should appear in your table.
                </DialogDescription>
            </DialogHeader>
            
            <div className="mt-4 flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input 
                        placeholder="Filter columns..." 
                        className="pl-9 bg-slate-50" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                {searchQuery === "" && (
                    <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => handleSelectAll(true)} title="Select All">
                            <CheckSquare className="h-4 w-4 mr-1"/> All
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleSelectAll(false)} title="Deselect All">
                            <Square className="h-4 w-4 mr-1"/> None
                        </Button>
                    </div>
                )}
            </div>
        </div>

        {/* Content Table */}
        <div className="flex-1 min-h-0 relative bg-white">
            <div className="absolute inset-0 flex flex-col">
                 {/* Table Header (Fixed) */}
                <div className="border-b bg-slate-100 z-10">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-100 hover:bg-slate-100 border-none">
                                <TableHead className="font-bold text-slate-700 pl-4">Column Name</TableHead>
                                <TableHead className="w-[100px] text-center font-bold text-slate-700">Visible</TableHead>
                            </TableRow>
                        </TableHeader>
                    </Table>
                </div>

                {/* Scrollable Body */}
                <ScrollArea className="flex-1">
                    <Table>
                        <TableBody>
                            {/* 1. Task Details Section */}
                            {filteredTaskFields.length > 0 && (
                                <>
                                    <VisibilityRow label="Task Details" isHeader className="bg-blue-50/50" />
                                    {filteredTaskFields.map((header) => (
                                        <VisibilityRow 
                                            key={header.id} 
                                            id={header.id} 
                                            label={header.label} 
                                            depth={1}
                                        />
                                    ))}
                                </>
                            )}

                            {/* 2. Stages Section */}
                            {filteredStages.map((stage: any) => (
                                <React.Fragment key={stage.id}>
                                    <VisibilityRow label={stage.name} isHeader className="bg-slate-50" />
                                    
                                    {/* Stage Date */}
                                    <VisibilityRow 
                                        id={getStageDateColumnId(stage.id)} 
                                        label="Completion Date" 
                                        depth={1}
                                        className="border-b-0"
                                    />

                                    {/* Documents */}
                                    {stage.relevantDocs?.map(({ kycId, doc, fields }: any) => (
                                        <React.Fragment key={kycId}>
                                            <VisibilityRow 
                                                label={doc.display_name || doc.name} 
                                                depth={1}
                                                className="text-blue-600 font-medium bg-slate-50/30"
                                            />
                                            {fields.map((field: any) => (
                                                <VisibilityRow 
                                                    key={field.id}
                                                    id={getDocFieldColumnId(stage.id, kycId, field.id)}
                                                    label={field.fieldName}
                                                    depth={2}
                                                />
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </React.Fragment>
                            ))}

                            {filteredTaskFields.length === 0 && filteredStages.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={2} className="h-24 text-center text-slate-500">
                                        No columns found matching "{searchQuery}"
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </div>
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t bg-slate-50 flex items-center justify-between sm:justify-between z-20">
            <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-normal bg-white border">
                    {selectedColumns.size} columns visible
                </Badge>
            </div>
            <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">
                    Apply Changes
                </Button>
            </div>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  )
}