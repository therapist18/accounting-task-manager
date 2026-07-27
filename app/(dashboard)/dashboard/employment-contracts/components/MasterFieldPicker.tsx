'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronsUpDown, Check, X, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MasterFieldOption } from '../utils/placeholderDetection';

// Single-select searchable combobox for linking one ec_placeholders row to
// one tm_job_fields row - same Popover+Command pattern as Document Template
// Manager's MasterFieldPicker, but typed against real UUID string ids
// (master-fields/components/types/database.ts) rather than that component's
// own `id: number` type, which doesn't match the live schema.
interface EcMasterFieldPickerProps {
  masterFields: MasterFieldOption[];
  selectedFieldId: string | null;
  onSelect: (field: MasterFieldOption | null) => void;
  disabled?: boolean;
  className?: string;
}

export function MasterFieldPicker({ masterFields, selectedFieldId, onSelect, disabled, className }: EcMasterFieldPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedField = useMemo(
    () => masterFields.find((f) => f.id === selectedFieldId) || null,
    [masterFields, selectedFieldId]
  );

  const filteredFields = useMemo(() => {
    if (!search.trim()) return masterFields;
    const q = search.toLowerCase();
    return masterFields.filter((f) => f.label.toLowerCase().includes(q) || f.field_key.toLowerCase().includes(q));
  }, [masterFields, search]);

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "h-8 text-xs justify-between font-normal w-72",
              !selectedField && "border-amber-300 dark:border-amber-700 text-slate-400"
            )}
          >
            <span className="truncate flex items-center gap-1.5">
              {selectedField ? (
                <>
                  <Database className="w-3 h-3 text-custom-blue shrink-0" />
                  {selectedField.label}
                </>
              ) : 'Not linked - using legacy default'}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="end">
          <Command>
            <CommandInput placeholder="Search master fields..." value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>No master fields found.</CommandEmpty>
              <CommandGroup className="max-h-72 overflow-y-auto">
                <CommandItem value="__none__" onSelect={() => { onSelect(null); setOpen(false); }} className="cursor-pointer">
                  <div className="flex items-center gap-2 text-slate-500">
                    <X className="h-3.5 w-3.5" /> Not linked (falls back to legacy default)
                  </div>
                </CommandItem>
                {filteredFields.map((field) => (
                  <CommandItem
                    key={field.id}
                    value={field.label}
                    onSelect={() => { onSelect(field); setOpen(false); }}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Check className={cn('h-3.5 w-3.5 shrink-0', field.id === selectedFieldId ? 'opacity-100' : 'opacity-0')} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{field.label}</div>
                        <div className="text-[10px] font-mono text-slate-400 truncate">{field.field_key}</div>
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
