// @ts-nocheck
"use client"
import React, { useState, useMemo } from "react"
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

// --- TYPE DEFINITIONS ---
interface ColumnField {
  id: number | string;
  name: string;
  label: string;
  subFields?: ColumnField[];
}

interface ColumnSection {
  title: string;
  fields: {
    id: number | string;
    name: string;
    label: string;
    [key: string]: any;
  }[];
}

interface FlatColumn {
  value: string;
  label: string;
  sectionTitle?: string;
}

interface ColumnVisibilityProps {
  visibleColumns: {
    [key: string]: boolean
  }
  setVisibleColumns: (columns: { [key: string]: boolean }) => void
  columns: FlatColumn[]
  columnSections: {
    [key: string]: ColumnSection;
  }
  hideColumnVisibilityButton?: boolean
}


export function ColumnVisibility({
  visibleColumns,
  setVisibleColumns,
  columns = [],
  columnSections = {},
  hideColumnVisibilityButton = false
}: ColumnVisibilityProps) {
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [columnSearchQuery, setColumnSearchQuery] = useState("");

  const allColumnsSource = useMemo(() => {
    const sections = Object.entries(columnSections).map(([key, section]) => ({
      ...section,
      key,
    }));

    const allSectionFieldNames = new Set(
      Object.values(columnSections).flatMap(section => section.fields.map(field => field.name))
    );
    const others = columns.filter(col => !allSectionFieldNames.has(col.value));

    return { sections, others };
  }, [columns, columnSections]);

  // --- FIXED LOGIC ---
  const { filteredSections, filteredOtherColumns } = useMemo(() => {
    const query = columnSearchQuery.toLowerCase().trim();
    const source = allColumnsSource;

    if (!query) {
      return { filteredSections: source.sections, filteredOtherColumns: source.others };
    }

    const sections = source.sections
      .map(section => {
        const matchingFields = section.fields.filter(field =>
          field.label?.toLowerCase().includes(query)
        );
        return matchingFields.length > 0 ? { ...section, fields: matchingFields } : null;
      })
      .filter(Boolean);

    const others = source.others.filter(col =>
      col.label?.toLowerCase().includes(query)
    );

    return { filteredSections: sections, filteredOtherColumns: others };
  }, [columnSearchQuery, allColumnsSource]);

  const allVisibleColumnKeysInDialog = useMemo(() => {
    const sectionKeys = filteredSections.flatMap(section =>
      section.fields.map(field => field.name)
    );
    const otherKeys = filteredOtherColumns.map(col => col.value);
    return [...sectionKeys, ...otherKeys];
  }, [filteredSections, filteredOtherColumns]);

  const checkedCount = allVisibleColumnKeysInDialog.filter(key => visibleColumns[key]).length;
  const isAllChecked = checkedCount === allVisibleColumnKeysInDialog.length && allVisibleColumnKeysInDialog.length > 0;

  const handleToggleAll = () => {
    const newCheckedState = !isAllChecked;
    setVisibleColumns(prev => {
      const newVisible = { ...prev };
      allVisibleColumnKeysInDialog.forEach(key => {
        newVisible[key] = newCheckedState;
      });
      return newVisible;
    });
  };

  const handleColumnToggle = (key: string, checked: boolean) => {
    setVisibleColumns(prev => ({
      ...prev,
      [key]: checked
    }));
  };

  const handleGroupToggle = (keysToToggle: string[]) => {
    const allCurrentlyChecked = keysToToggle.every(key => visibleColumns[key]);
    const newCheckedState = !allCurrentlyChecked;

    setVisibleColumns(prev => {
      const newVisible = { ...prev };
      keysToToggle.forEach(key => {
        newVisible[key] = newCheckedState;
      });
      return newVisible;
    });
  };

  return (
    <div className="flex items-center gap-2">
      {!hideColumnVisibilityButton && (
        <Dialog open={columnDialogOpen} onOpenChange={setColumnDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Eye className="mr-2 h-4 w-4" />
              Columns
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Column Visibility</DialogTitle>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search columns..."
                  value={columnSearchQuery}
                  onChange={(e) => setColumnSearchQuery(e.target.value)}
                  className="w-full pl-9"
                />
              </div>
            </DialogHeader>

            <div className="flex-grow overflow-y-auto pr-4 -mr-4 mt-4">
              <div className="sticky top-0 bg-white z-10 py-2">
                <div className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg border">
                  <Checkbox
                    id="select-all-columns"
                    checked={isAllChecked}
                    onCheckedChange={handleToggleAll}
                  />
                  <label htmlFor="select-all-columns" className="text-sm font-medium leading-none cursor-pointer">
                    Select All
                  </label>
                </div>
              </div>

              <div className="space-y-4 mt-4">
                {filteredSections.map((section) => {
                  const sectionKeys = section.fields.map(field => field.name);
                  const sectionCheckedCount = sectionKeys.filter(key => !!visibleColumns[key]).length;
                  const isAllSectionChecked = sectionKeys.length > 0 && sectionCheckedCount === sectionKeys.length;
                  const isSomeSectionChecked = sectionCheckedCount > 0 && !isAllSectionChecked;

                  return (
                    <div key={section.key} className="rounded-lg border bg-white shadow-sm">
                      <div className="flex items-center space-x-3 border-b p-4">
                        <Checkbox
                          id={`select-group-${section.key}`}
                          checked={isSomeSectionChecked ? "indeterminate" : isAllSectionChecked}
                          onCheckedChange={() => handleGroupToggle(sectionKeys)}
                        />
                        <label htmlFor={`select-group-${section.key}`} className="text-sm font-semibold text-slate-700 cursor-pointer">
                          {section.title}
                        </label>
                      </div>
                      <div className="p-4 space-y-2">
                        {section.fields.map((field) => (
                          <div key={field.name} className="flex items-center space-x-3 p-2 hover:bg-slate-50 rounded-md">
                            <Checkbox
                              id={`${section.key}-${field.name}`}
                              checked={!!visibleColumns[field.name]}
                              onCheckedChange={(checked) => handleColumnToggle(field.name, checked === true)}
                            />
                            <label htmlFor={`${section.key}-${field.name}`} className="text-sm leading-tight cursor-pointer">
                              {field.label}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {filteredOtherColumns.length > 0 && (() => {
                  const otherKeys = filteredOtherColumns.map(col => col.value);
                  const otherCheckedCount = otherKeys.filter(key => !!visibleColumns[key]).length;
                  const isAllOtherChecked = otherKeys.length > 0 && otherCheckedCount === otherKeys.length;
                  const isSomeOtherChecked = otherCheckedCount > 0 && !isAllOtherChecked;

                  return (
                    <div className="rounded-lg border bg-white shadow-sm">
                      <div className="flex items-center space-x-3 border-b p-4">
                        <Checkbox
                          id="select-group-other"
                          checked={isSomeOtherChecked ? "indeterminate" : isAllOtherChecked}
                          onCheckedChange={() => handleGroupToggle(otherKeys)}
                        />
                        <label htmlFor="select-group-other" className="text-sm font-semibold text-slate-700 cursor-pointer">
                          Other Columns
                        </label>
                      </div>
                      <div className="p-4 space-y-2">
                        {filteredOtherColumns.map((column) => (
                          <div key={`other-${column.value}`} className="flex items-center space-x-3 p-2 hover:bg-slate-50 rounded-md">
                            <Checkbox
                              id={`other-${column.value}-checkbox`}
                              checked={!!visibleColumns[column.value]}
                              onCheckedChange={(checked) => handleColumnToggle(column.value, checked === true)}
                            />
                            <label htmlFor={`other-${column.value}-checkbox`} className="text-sm leading-tight cursor-pointer">
                              {column.label}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}