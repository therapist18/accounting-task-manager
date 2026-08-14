"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface Option {
  value: string;
  label: string;
  [key: string]: any;
}

interface SearchableSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
  onOpenChange?: (open: boolean) => void;
  allowClear?: boolean;
}

export function SearchableSelect({
  value,
  onValueChange,
  options = [],
  placeholder = "Select an option",
  disabled = false,
  emptyMessage = "No results found.",
  searchPlaceholder = "Search...",
  className,
  buttonClassName,
  popoverClassName,
  onOpenChange,
  allowClear = false,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const normalizedOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const deduped: Option[] = [];
    for (const option of options || []) {
      const value = String(option?.value ?? "");
      const label = String(option?.label ?? option?.value ?? "");
      const dedupeKey = `${value}::${label}`.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      deduped.push({ ...option, value, label });
    }
    return deduped;
  }, [options]);

  const filteredOptions = React.useMemo(() => {
    if (!search) return normalizedOptions;
    const searchLower = search.toLowerCase();
    return normalizedOptions.filter(
      (option) =>
        String(option.label || option.value || '')
          .toLowerCase()
          .includes(searchLower) ||
        String(option.value || '').toLowerCase().includes(searchLower)
    );
  }, [normalizedOptions, search]);

  const selectedOption = React.useMemo(
    () => normalizedOptions.find((option) => option.value === value),
    [normalizedOptions, value]
  );

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (onOpenChange) {
      onOpenChange(newOpen);
    }
    if (!newOpen) {
      setSearch("");
    }
  };

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal text-left",
              !value && "text-muted-foreground",
              buttonClassName
            )}
          >
            <span className="truncate">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn("w-[var(--radix-popover-trigger-width)] p-0", popoverClassName)}
          align="start"
        >
          <Command className="rounded-lg border shadow-md" shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={search}
              onValueChange={setSearch}
              className="h-9"
            />
            <CommandList
              className="max-h-[300px] overflow-y-auto overscroll-contain"
              onWheel={(e) => e.stopPropagation()}
            >
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {filteredOptions.map((option, idx) => (
                  <CommandItem
                    key={`${option.value}::${option.label}::${idx}`}
                    value={`${option.value}::${option.label}`}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="flex-1 truncate">{option.label}</span>
                    {option.description && (
                      <span className="ml-2 shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full border border-slate-200">
                        {option.description}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {allowClear && value && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onValueChange("")}
          className="absolute right-8 top-1/2 transform -translate-y-1/2 h-6 w-6 text-slate-400 hover:text-red-500 hover:bg-red-50"
          type="button"
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Clear selection</span>
        </Button>
      )}
    </div>
  );
}
