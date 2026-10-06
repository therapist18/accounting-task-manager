'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

export interface SearchableSelectOption {
  value: string;
  label: string;
  group?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found.',
  disabled,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  const groups = new Map<string | undefined, SearchableSelectOption[]>();
  for (const opt of options) {
    if (!groups.has(opt.group)) groups.set(opt.group, []);
    groups.get(opt.group)!.push(opt);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-between text-base font-normal bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm hover:bg-white dark:hover:bg-slate-900 rounded-xl px-3",
            !selected && "text-slate-400",
            className
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[max(280px,var(--radix-popover-trigger-width))] p-0 rounded-xl shadow-xl" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-10 text-base" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {Array.from(groups.entries()).map(([group, opts]) => (
              <CommandGroup key={group ?? '__ungrouped__'} heading={group}>
                {opts.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.label}
                    onSelect={() => { onChange(opt.value); setOpen(false); }}
                    className="text-base font-medium"
                  >
                    <Check className={cn("mr-2 h-4 w-4 text-blue-600 shrink-0", opt.value === value ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{opt.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
