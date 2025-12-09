// @ts-nocheck
'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { fetchDepartments } from '@/app/(dashboard)/dashboard/departments/departments/database';

export interface DepartmentSelectProps {
  value?: string;
  onChange: (value: string) => void;
  subDepartmentValue?: string | string[];
  onSubDepartmentChange?: (value: string | string[]) => void;
  required?: boolean;
  isMultiSelectSub?: boolean;
}

export function DepartmentSelect({
  value,
  onChange,
  subDepartmentValue,
  onSubDepartmentChange,
  required = false,
  isMultiSelectSub = false,
}: DepartmentSelectProps) {
  const [departments, setDepartments] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [openSub, setOpenSub] = React.useState(false);

  // Load departments
  React.useEffect(() => {
    const loadDepts = async () => {
      try {
        const data = await fetchDepartments();
        setDepartments(data);
      } catch (err) {
        console.error('Failed to load departments', err);
      } finally {
        setLoading(false);
      }
    };
    loadDepts();
  }, []);

  const selectedDepartment = departments.find((d) => d.id === value);
  const subdepartments = selectedDepartment?.tm_subdepartments || [];

  // --- Subdepartment Selection Logic ---

  const handleSingleSubChange = (val: string) => {
    onSubDepartmentChange?.(val);
  };

  const handleMultiSubToggle = (subId: string) => {
    if (!onSubDepartmentChange) return;

    const currentValues = Array.isArray(subDepartmentValue) ? subDepartmentValue : [];
    let newValues;

    if (currentValues.includes(subId)) {
      newValues = currentValues.filter((id) => id !== subId);
    } else {
      newValues = [...currentValues, subId];
    }
    onSubDepartmentChange(newValues);
  };

  const handleRemoveSub = (subId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSubDepartmentChange) return;
    const currentValues = Array.isArray(subDepartmentValue) ? subDepartmentValue : [];
    onSubDepartmentChange(currentValues.filter((id) => id !== subId));
  };

  return (
    <div className="space-y-3">
      {/* Department Select (Always Single) */}
      <Select value={value} onValueChange={onChange} disabled={loading}>
        <SelectTrigger className="w-full bg-white">
          <SelectValue placeholder="Select Department" />
        </SelectTrigger>
        <SelectContent>
          {departments.map((dept) => (
            <SelectItem key={dept.id} value={dept.id}>
              {dept.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Subdepartment Select */}
      {selectedDepartment && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          {isMultiSelectSub ? (
            // --- MULTI SELECT MODE (Popover + Command) ---
            <Popover open={openSub} onOpenChange={setOpenSub}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openSub}
                  className="w-full justify-between bg-white h-auto min-h-[40px] px-3 py-2 hover:bg-white text-left"
                >
                  <div className="flex flex-wrap gap-1 items-center w-full overflow-hidden">
                    {Array.isArray(subDepartmentValue) && subDepartmentValue.length > 0 ? (
                      subDepartmentValue.map((id) => {
                        const sub = subdepartments.find((s: any) => s.id === id);
                        return (
                          <Badge key={id} variant="secondary" className="mr-1 mb-1">
                            {sub?.name || 'Unknown'}
                            <div
                              className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={(e) => handleRemoveSub(id, e)}
                            >
                              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                            </div>
                          </Badge>
                        );
                      })
                    ) : (
                      <span className="text-muted-foreground font-normal">Select Subdepartments...</span>
                    )}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search subdepartments..." />
                  <CommandList>
                    <CommandEmpty>No subdepartment found.</CommandEmpty>
                    <CommandGroup>
                      {subdepartments.map((sub: any) => {
                        const isSelected = Array.isArray(subDepartmentValue) && subDepartmentValue.includes(sub.id);
                        return (
                          <CommandItem
                            key={sub.id}
                            value={sub.name} // Search by name
                            onSelect={() => handleMultiSubToggle(sub.id)}
                          >
                            <div
                              className={cn(
                                'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                                isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'opacity-50 [&_svg]:invisible'
                              )}
                            >
                              <Check className={cn('h-4 w-4')} />
                            </div>
                            <span>{sub.name}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : (
            // --- SINGLE SELECT MODE (Standard Select) ---
            <Select
              value={subDepartmentValue as string}
              onValueChange={handleSingleSubChange}
            >
              <SelectTrigger className="w-full bg-white">
                <SelectValue placeholder="Select Subdepartment" />
              </SelectTrigger>
              <SelectContent>
                {subdepartments.map((sub: any) => (
                  <SelectItem key={sub.id} value={sub.id}>
                    {sub.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );
}