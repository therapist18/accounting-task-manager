"use client"

import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"

type OptionType = {
  value: string
  label: string
}

interface MultiSelectDocumentTypesProps {
  options: OptionType[]
  selectedValues: string[]
  onSelect: (value: string) => void
  onRemove: (value: string) => void
  onClear: () => void
  placeholder?: string
  emptyMessage?: string
  disabled?: boolean
}

export function MultiSelectDocumentTypes({
  options,
  selectedValues = [],
  onSelect,
  onRemove,
  onClear,
  placeholder = "Select items...",
  emptyMessage = "No items found.",
  disabled = false
}: MultiSelectDocumentTypesProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filteredOptions = options.filter(option =>
    !search || 
    option.label.toLowerCase().includes(search.toLowerCase()) ||
    option.value.toLowerCase().includes(search.toLowerCase())
  )

  const selectedLabels = selectedValues.map(value => 
    options.find(opt => opt.value === value)?.label || value
  )

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            <div className="flex flex-wrap gap-1 overflow-hidden max-h-6">
              {selectedLabels.length > 0 ? (
                selectedLabels.map((label, index) => (
                  <Badge key={index} variant="secondary" className="mr-1">
                    {label}
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput 
              placeholder="Search document types..." 
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {filteredOptions.map((option) => {
                  const isSelected = selectedValues.includes(option.value)
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => {
                        if (isSelected) {
                          onRemove(option.value)
                        } else {
                          onSelect(option.value)
                        }
                      }}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center">
                        <div className={`mr-2 flex h-4 w-4 items-center justify-center ${isSelected ? 'opacity-100' : 'opacity-0'}`}>
                          <Check className="h-4 w-4" />
                        </div>
                        {option.label}
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      
      {selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {selectedValues.map((value) => {
            const option = options.find(opt => opt.value === value)
            return (
              <Badge key={value} variant="secondary" className="pr-1">
                {option?.label || value}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(value)
                  }}
                  className="ml-1 rounded-full hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                  <span className="sr-only">Remove {option?.label || value}</span>
                </button>
              </Badge>
            )
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={onClear}
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  )
}
