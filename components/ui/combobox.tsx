"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

type Option = {
  value: string
  label: string
  description?: string
}

interface ComboBoxProps {
  options: Option[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  emptyText?: string
  className?: string
  disabled?: boolean
  loading?: boolean
}

export function ComboBox({
  options,
  value,
  onValueChange,
  placeholder = "Select an option...",
  emptyText = "No options found.",
  className,
  disabled = false,
  loading = false,
}: ComboBoxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options;
    const searchLower = search.toLowerCase();
    return options.filter(option => 
      option.label.toLowerCase().includes(searchLower) || 
      option.description?.toLowerCase().includes(searchLower) ||
      option.value.toLowerCase().includes(searchLower)
    );
  }, [options, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled || loading}
        >
          {loading ? (
            <span className="text-muted-foreground">Loading...</span>
          ) : value ? (
            options.find((option) => option.value === value)?.label || placeholder
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandEmpty>{emptyText}</CommandEmpty>
          <CommandGroup className="max-h-[300px] overflow-y-auto">
            {filteredOptions.map((option) => (
              <CommandItem
                key={option.value}
                value={option.value}
                onSelect={() => {
                  onValueChange(option.value)
                  setSearch("")
                  setOpen(false)
                }}
                className="flex flex-col items-start gap-1"
              >
                <div className="flex items-center">
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span>{option.label}</span>
                </div>
                {option.description && (
                  <span className="text-xs text-muted-foreground ml-6">
                    {option.description}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
