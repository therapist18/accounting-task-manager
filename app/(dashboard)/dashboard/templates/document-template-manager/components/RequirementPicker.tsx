"use client";
import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { ChevronsUpDown, Check, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Requirement } from "../types";

interface RequirementPickerProps {
  requirements: Requirement[];
  allowMultiple?: boolean;
  selectedRequirementId?: string;
  selectedRequirementIds?: string[];
  onSelect?: (requirement: Requirement) => void;
  onMultipleSelect?: (requirementIds: string[]) => void;
  onClear?: () => void;
  placeholder?: string;
}

export function RequirementPicker({
  requirements,
  allowMultiple = false,
  selectedRequirementId,
  selectedRequirementIds = [],
  onSelect,
  onMultipleSelect,
  onClear,
  placeholder = "Select requirement..."
}: RequirementPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const currentSelection = useMemo(() => {
    if (allowMultiple) return selectedRequirementIds;
    if (selectedRequirementId) return [selectedRequirementId];
    return [];
  }, [allowMultiple, selectedRequirementId, selectedRequirementIds]);

  const selectedRequirements = useMemo(() =>
    requirements.filter(r => currentSelection.includes(r.id)),
    [requirements, currentSelection]);

  const filteredRequirements = useMemo(() => {
    if (!search?.trim()) return requirements;
    const searchLower = search.toLowerCase();
    return requirements.filter(requirement =>
      requirement.label.toLowerCase().includes(searchLower)
    );
  }, [requirements, search]);

  const handleSingleSelect = (requirement: Requirement) => {
    onSelect?.(requirement);
    setOpen(false);
  };

  const handleMultipleSelect = (requirementId: string) => {
    const isSelected = currentSelection.includes(requirementId);
    const newSelection = isSelected
      ? currentSelection.filter(id => id !== requirementId)
      : [...currentSelection, requirementId];
    onMultipleSelect?.(newSelection);
  };

  const handleClear = () => {
    if (allowMultiple) {
      onMultipleSelect?.([]);
    } else if (selectedRequirementId) {
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
                {selectedRequirements.length > 0
                  ? allowMultiple
                    ? `${selectedRequirements.length} requirement${selectedRequirements.length > 1 ? 's' : ''} selected`
                    : selectedRequirements[0]?.label || "Select requirement..."
                  : placeholder
                }
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search requirements..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>No requirements found.</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {filteredRequirements.map((requirement) => {
                    const isSelected = currentSelection.includes(requirement.id);
                    return (
                      <CommandItem
                        key={requirement.id}
                        value={requirement.label}
                        onSelect={() => {
                          if (allowMultiple) {
                            handleMultipleSelect(requirement.id);
                          } else {
                            handleSingleSelect(requirement);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div>
                            <div className="font-medium">{requirement.label}</div>
                            {requirement.document_ids && requirement.document_ids.length > 0 && (
                              <div className="text-xs text-muted-foreground">
                                {requirement.document_ids.length} document(s)
                              </div>
                            )}
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
        {selectedRequirements.length > 0 && (
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

      {selectedRequirements.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedRequirements.map((requirement) => (
            <Badge
              key={requirement.id}
              variant="secondary"
              className="flex items-center gap-1.5 pr-1.5 bg-green-50 text-green-700 border-green-200"
            >
              <FileText className="h-3 w-3" />
              <span className="max-w-[200px] truncate">{requirement.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (allowMultiple) {
                    handleMultipleSelect(requirement.id);
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
