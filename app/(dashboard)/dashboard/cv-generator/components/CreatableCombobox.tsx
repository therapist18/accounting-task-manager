"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ComboOption {
  value: string;
  label: string;
}

interface CreatableComboboxProps {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  onCreateOption?: (label: string) => Promise<string>;
  placeholder?: string;
  createLabel?: string;
  className?: string;
  disabled?: boolean;
  emptyLabel?: string;
}

export function CreatableCombobox({
  options,
  value,
  onChange,
  onCreateOption,
  placeholder = "Select or type...",
  createLabel = "Create",
  className,
  disabled,
  emptyLabel = "No results found.",
}: CreatableComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const displayLabel = React.useMemo(() => {
    if (!value) return "";
    const opt = options.find(o => o.value === value);
    return opt ? opt.label : value;
  }, [value, options]);

  const filtered = React.useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const canCreate = onCreateOption && query.trim() && !filtered.find(o => o.label.toLowerCase() === query.toLowerCase());

  async function handleCreate() {
    if (!onCreateOption || !query.trim()) return;
    setCreating(true);
    try {
      const newValue = await onCreateOption(query.trim());
      onChange(newValue);
      setQuery("");
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal border-slate-200 h-9 text-sm", !displayLabel && "text-slate-400", className)}
        >
          <span className="truncate">{displayLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={query}
            onValueChange={setQuery}
            className="h-9"
          />
          <CommandList>
            {filtered.length === 0 && !canCreate && (
              <CommandEmpty>{emptyLabel}</CommandEmpty>
            )}
            <CommandGroup>
              {filtered.map(opt => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  onSelect={() => { onChange(opt.value); setQuery(""); setOpen(false); }}
                  className="text-sm"
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5", value === opt.value ? "opacity-100" : "opacity-0")} />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {canCreate && (
              <CommandGroup>
                <CommandItem
                  onSelect={handleCreate}
                  className="text-indigo-600 font-medium text-sm"
                  disabled={creating}
                >
                  {creating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
                  {createLabel} &quot;{query.trim()}&quot;
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
