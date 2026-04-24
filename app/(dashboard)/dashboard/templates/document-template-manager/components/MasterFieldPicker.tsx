"use client";
import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { ChevronsUpDown, Check, X, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobField } from "../types";

interface MasterFieldPickerProps {
  masterFields: JobField[];
  allowMultiple?: boolean;
  selectedFieldId?: number;
  selectedFieldIds?: number[];
  onSelect?: (field: JobField) => void;
  onMultipleSelect?: (fieldIds: number[]) => void;
  onClear?: () => void;
  placeholder?: string;
}

export function MasterFieldPicker({
  masterFields,
  allowMultiple = false,
  selectedFieldId,
  selectedFieldIds = [],
  onSelect,
  onMultipleSelect,
  onClear,
  placeholder = "Select master fields..."
}: MasterFieldPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const currentSelection = useMemo(() => {
    if (allowMultiple) return selectedFieldIds;
    if (selectedFieldId) return [selectedFieldId];
    return [];
  }, [allowMultiple, selectedFieldId, selectedFieldIds]);

  const selectedFields = useMemo(() =>
    masterFields.filter(f => currentSelection.includes(f.id)),
    [masterFields, currentSelection]);

  const filteredFields = useMemo(() => {
    if (!search?.trim()) return masterFields;
    const searchLower = search.toLowerCase();
    return masterFields.filter(field =>
      field.label.toLowerCase().includes(searchLower) ||
      field.field_key.toLowerCase().includes(searchLower)
    );
  }, [masterFields, search]);

  const handleSingleSelect = (field: JobField) => {
    onSelect?.(field);
    setOpen(false);
  };

  const handleMultipleSelect = (fieldId: number) => {
    const isSelected = currentSelection.includes(fieldId);
    const newSelection = isSelected
      ? currentSelection.filter(id => id !== fieldId)
      : [...currentSelection, fieldId];
    onMultipleSelect?.(newSelection);
  };

  const handleClear = () => {
    if (allowMultiple) {
      onMultipleSelect?.([]);
    } else if (selectedFieldId) {
      onSelect?.(undefined as any);
    }
    onClear?.();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
              <span className="truncate">
                {selectedFields.length > 0
                  ? allowMultiple
                    ? `${selectedFields.length} field${selectedFields.length > 1 ? 's' : ''} selected`
                    : selectedFields[0]?.label || "Select master field..."
                  : placeholder
                }
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search master fields..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>No master fields found.</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {filteredFields.map((field) => {
                    const isSelected = currentSelection.includes(field.id);
                    return (
                      <CommandItem
                        key={field.id}
                        value={field.label}
                        onSelect={() => {
                          if (allowMultiple) {
                            handleMultipleSelect(field.id);
                          } else {
                            handleSingleSelect(field);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div>
                            <div className="font-medium">{field.label}</div>
                            <div className="text-xs text-muted-foreground">{field.field_key}</div>
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedFields.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {selectedFields.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedFields.map((field) => (
            <Badge
              key={field.id}
              variant="secondary"
              className="flex items-center gap-1.5 pr-1.5 bg-blue-50 text-blue-700 border-blue-200"
            >
              <Database className="h-3 w-3" />
              <span className="max-w-[200px] truncate">{field.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (allowMultiple) {
                    handleMultipleSelect(field.id);
                  } else {
                    handleClear();
                  }
                }}
                className="ml-1 rounded-full p-0.5 hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
