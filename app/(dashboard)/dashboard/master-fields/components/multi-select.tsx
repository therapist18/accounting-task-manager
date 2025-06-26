"use client"

import * as React from "react"
import { X, ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Command, CommandItem } from "@/components/ui/command"
import { Checkbox } from "@/components/ui/checkbox"

export type Option = {
  label: string
  value: string
  group?: string
  dataType?: string
  isJsonField?: boolean
  table_name?: string
  jsonColumn?: string
}

interface MultiSelectProps {
  options: Option[]
  onChange: (values: string[]) => void
  className?: string
  placeholder?: string
  value?: string[]
  maxHeight?: string
  showSearch?: boolean
  isJsonField?: boolean
}

export function MultiSelect({
  options,
  value = [],
  onChange,
  placeholder,
  className,
  maxHeight = "h-[300px]"
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  // Ensure value is always an array
  const safeValue = Array.isArray(value) ? value : []

  // Group selected values by table for preview
  const selectedByTable = React.useMemo(() => {
    const grouped: { [key: string]: string[] } = {}
    if (!Array.isArray(safeValue)) return grouped

    safeValue.forEach(val => {
      const option = options.find(opt => opt.value === val)
      if (option) {
        const tableName = option.table_name || 'Other'
        if (!grouped[tableName]) {
          grouped[tableName] = []
        }
        grouped[tableName].push(val)
      }
    })
    return grouped
  }, [safeValue, options])

  const handleSelect = React.useCallback((option: Option) => {
    const isSelected = safeValue.includes(option.value)
    onChange(
      isSelected
        ? safeValue.filter((v) => v !== option.value)
        : [...safeValue, option.value]
    )
  }, [safeValue, onChange])

  const filteredOptions = options.filter((option) => {
    if (!option?.label) return false
    const label = option.label.toLowerCase()
    const searchTerm = search.toLowerCase()
    return label.includes(searchTerm)
  })

  // Group by table and type
  const groupedByTableAndType = React.useMemo(() => {
    const tableMap = new Map<string, {
      regular: {
        fields: typeof options,
        groups: Map<string, typeof options> // For regular field grouping
      },
      json: Map<string, {
        fields: typeof options,
        groups: Map<string, typeof options> // For JSON field grouping
      }>
    }>()
    
    filteredOptions.forEach((option) => {
      const tableName = option.table_name || 'Other'
      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, {
          regular: { fields: [], groups: new Map() },
          json: new Map()
        })
      }
      
      const tableGroup = tableMap.get(tableName)!
      
      if (option.isJsonField && option.jsonColumn) {
        if (!tableGroup.json.has(option.jsonColumn)) {
          tableGroup.json.set(option.jsonColumn, {
            fields: [],
            groups: new Map()
          })
        }
        const jsonGroup = tableGroup.json.get(option.jsonColumn)!
        
        if (option.group) {
          if (!jsonGroup.groups.has(option.group)) {
            jsonGroup.groups.set(option.group, [])
          }
          jsonGroup.groups.get(option.group)!.push(option)
        } else {
          jsonGroup.fields.push(option)
        }
      } else {
        if (option.group) {
          if (!tableGroup.regular.groups.has(option.group)) {
            tableGroup.regular.groups.set(option.group, [])
          }
          tableGroup.regular.groups.get(option.group)!.push(option)
        } else {
          tableGroup.regular.fields.push(option)
        }
      }
    })

    // Sort all fields and groups
    tableMap.forEach((table) => {
      // Sort regular fields
      table.regular.fields.sort((a, b) => a.label.localeCompare(b.label))
      table.regular.groups.forEach(group => {
        group.sort((a, b) => a.label.localeCompare(b.label))
      })
      
      // Sort JSON fields
      table.json.forEach(jsonColumn => {
        jsonColumn.fields.sort((a, b) => a.label.localeCompare(b.label))
        jsonColumn.groups.forEach(group => {
          group.sort((a, b) => a.label.localeCompare(b.label))
        })
      })
    })

    return Array.from(tableMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredOptions])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            safeValue.length > 0 ? "text-black" : "text-muted-foreground",
            className
          )}
        >
          <div className="flex items-center">
            {safeValue.length > 0 ? (
              <span>
                {safeValue.length} item{safeValue.length === 1 ? '' : 's'} selected
              </span>
            ) : (
              placeholder || "Select items..."
            )}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[500px] p-0" align="start">
        <Command className="overflow-hidden">
          <div className="border-b px-3 py-2 bg-white z-20">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 border-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>
          <div 
            className={cn("overflow-y-auto relative", maxHeight)}
            onWheel={(e) => {
              e.currentTarget.scrollTop += e.deltaY;
            }}
          >
            {groupedByTableAndType.map(([tableName, groups]) => (
              <div key={tableName}>
                <div className="sticky top-0 z-50 bg-white">
                  <h3 className="px-4 py-2.5 text-sm font-bold bg-gradient-to-b from-blue-50 to-blue-100 text-blue-900 border-y border-blue-200">
                    {tableName}
                    <span className="ml-2 text-xs text-blue-600">
                      ({groups.regular.fields.length + Array.from(groups.regular.groups.values()).reduce((acc, curr) => acc + curr.length, 0) + Array.from(groups.json.values()).reduce((acc, curr) => acc + curr.fields.length + Array.from(curr.groups.values()).reduce((a, c) => a + c.length, 0), 0)} fields)
                    </span>
                  </h3>
                </div>

                {/* Regular Fields Section */}
                {(groups.regular.fields.length > 0 || groups.regular.groups.size > 0) && (
                  <div className="py-1">
                    {/* Ungrouped Regular Fields */}
                    {groups.regular.fields.map((option) => (
                      <CommandItem
                        key={option.value}
                        onSelect={() => handleSelect(option)}
                        className="mx-0 hover:bg-blue-50 cursor-pointer"
                      >
                        <div className="flex items-center gap-3 py-2 px-4">
                          <Checkbox 
                            checked={safeValue.includes(option.value)}
                            className="h-4 w-4 rounded-sm"
                          />
                          <span className="text-sm text-gray-700">{option.label}</span>
                        </div>
                      </CommandItem>
                    ))}

                    {/* Grouped Regular Fields */}
                    {Array.from(groups.regular.groups.entries()).map(([groupName, fields]) => (
                      <div key={groupName} className="py-1">
                        <div className="sticky top-[41px] z-40 bg-white">
                          <h5 className="px-6 py-1.5 text-xs font-medium text-blue-500 bg-blue-50/30 border-y border-blue-50">
                            {groupName}
                            <span className="ml-2">({fields.length})</span>
                          </h5>
                        </div>
                        {fields.map((option) => (
                          <CommandItem
                            key={option.value}
                            onSelect={() => handleSelect(option)}
                            className="mx-0 hover:bg-blue-50 cursor-pointer"
                          >
                            <div className="flex items-center gap-3 py-2 px-6">
                              <Checkbox 
                                checked={safeValue.includes(option.value)}
                                className="h-4 w-4 rounded-sm"
                              />
                              <span className="text-sm text-gray-700">{option.label}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* JSON Fields Section */}
                {groups.json.size > 0 && (
                  <div className="py-1">
                    <div className="sticky top-[41px] z-40 bg-white">
                      <h4 className="px-4 py-2 text-xs font-semibold text-blue-600 bg-blue-50/50 border-y border-blue-100">
                        JSON Fields
                        <span className="ml-2">
                          ({Array.from(groups.json.values()).reduce((acc, curr) => 
                            acc + curr.fields.length + Array.from(curr.groups.values()).reduce((a, c) => a + c.length, 0), 0
                          )})
                        </span>
                      </h4>
                    </div>
                    {Array.from(groups.json.entries()).map(([jsonColumn, columnData]) => (
                      <div key={jsonColumn} className="py-1">
                        <div className="sticky top-[73px] z-30 bg-white">
                          <h5 className="px-6 py-1.5 text-xs font-medium text-blue-500 bg-blue-50/30 border-y border-blue-50">
                            {jsonColumn.split('_').map(word => 
                              word.charAt(0).toUpperCase() + word.slice(1)
                            ).join(' ')}
                            <span className="ml-2">
                              ({columnData.fields.length + Array.from(columnData.groups.values()).reduce((acc, curr) => acc + curr.length, 0)})
                            </span>
                          </h5>
                        </div>
                        {/* Ungrouped JSON Fields */}
                        {columnData.fields.map((option) => (
                          <CommandItem
                            key={option.value}
                            onSelect={() => handleSelect(option)}
                            className="mx-0 hover:bg-blue-50 cursor-pointer"
                          >
                            <div className="flex items-center gap-3 py-2 px-6">
                              <Checkbox 
                                checked={safeValue.includes(option.value)}
                                className="h-4 w-4 rounded-sm"
                              />
                              <span className="text-sm text-gray-700">{option.label}</span>
                            </div>
                          </CommandItem>
                        ))}

                        {/* Grouped JSON Fields */}
                        {Array.from(columnData.groups.entries()).map(([groupName, fields]) => (
                          <div key={groupName}>
                            <div className="sticky top-[105px] z-20 bg-white">
                              <h6 className="px-8 py-1 text-xs font-medium text-blue-400 bg-blue-50/20 border-y border-blue-50">
                                {groupName}
                                <span className="ml-2">({fields.length})</span>
                              </h6>
                            </div>
                            {fields.map((option) => (
                              <CommandItem
                                key={option.value}
                                onSelect={() => handleSelect(option)}
                                className="mx-0 hover:bg-blue-50 cursor-pointer"
                              >
                                <div className="flex items-center gap-3 py-2 px-8">
                                  <Checkbox 
                                    checked={safeValue.includes(option.value)}
                                    className="h-4 w-4 rounded-sm"
                                  />
                                  <span className="text-sm text-gray-700">{option.label}</span>
                                </div>
                              </CommandItem>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {filteredOptions.length === 0 && (
              <div className="py-6 text-center text-sm text-gray-500">
                No results found.
              </div>
            )}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
