"use client"

import React, { useState, useMemo } from 'react'
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Eye, EyeOff, Settings, Search } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"

export interface ColumnVisibilityOption {
  id: string
  label: string
  visible: boolean
  disabled?: boolean
  isDefault?: boolean
  group?: string
}

interface ColumnVisibilityControlProps {
  columns: ColumnVisibilityOption[]
  onVisibilityChange: (columnId: string, visible: boolean) => void
  onResetToDefault?: () => void
  trigger?: React.ReactNode
  title?: string
  description?: string
}

export const ColumnVisibilityControl: React.FC<ColumnVisibilityControlProps> = React.memo(({
  columns,
  onVisibilityChange,
  onResetToDefault,
  trigger,
  title = "Column Visibility",
  description = "Toggle column visibility"
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Group columns by their group property - memoized to prevent recalculation
  const groupedColumns = useMemo(() => {
    return columns.reduce((acc, column) => {
      const group = column.group || 'General'
      if (!acc[group]) {
        acc[group] = []
      }
      acc[group].push(column)
      return acc
    }, {} as Record<string, ColumnVisibilityOption[]>)
  }, [columns])

  // Filter columns based on search query
  const filteredGroupedColumns = useMemo(() => {
    if (!searchQuery.trim()) return groupedColumns
    
    const filtered: Record<string, ColumnVisibilityOption[]> = {}
    Object.entries(groupedColumns).forEach(([groupName, groupColumns]) => {
      const filteredColumns = groupColumns.filter(column =>
        column.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        groupName.toLowerCase().includes(searchQuery.toLowerCase())
      )
      if (filteredColumns.length > 0) {
        filtered[groupName] = filteredColumns
      }
    })
    return filtered
  }, [groupedColumns, searchQuery])

  const visibleCount = useMemo(() => columns.filter(col => col.visible).length, [columns])
  const totalCount = columns.length
  const allSelected = visibleCount === totalCount && totalCount > 0

  // Toggle all functionality
  const handleToggleAll = () => {
    columns.forEach((column: ColumnVisibilityOption) => {
      if (!column.disabled) {
        onVisibilityChange(column.id, !allSelected)
      }
    })
  }

  const defaultTrigger = useMemo(() => (
    <Button variant="outline" size="sm" className="flex items-center gap-2">
      <Settings className="h-4 w-4" />
      Columns ({visibleCount}/{totalCount})
    </Button>
  ), [visibleCount, totalCount])

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {trigger || defaultTrigger}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div>
          <h4 className="font-medium text-sm">{title}</h4>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleAll}
              className="flex-1"
            >
              {allSelected ? (
                <>
                  <EyeOff className="h-3 w-3 mr-1" />
                  Deselect All
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3 mr-1" />
                  Select All
                </>
              )}
            </Button>
            {onResetToDefault && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onResetToDefault()
                }}
                className="flex-1"
              >
                Reset
              </Button>
            )}
          </div>

          <Separator />

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search columns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Separator />

          {/* Column list */}
          <ScrollArea className="h-64">
            <div className="space-y-4">
              {Object.entries(filteredGroupedColumns).map(([groupName, groupColumns]) => (
                <div key={groupName} className="space-y-2">
                  {Object.keys(filteredGroupedColumns).length > 1 && (
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {groupName}
                    </div>
                  )}
                  <div className="space-y-2">
                    {groupColumns.map((column) => (
                      <div
                        key={column.id}
                        className="flex items-center space-x-2 py-1"
                      >
                        <Checkbox
                          id={column.id}
                          checked={column.visible}
                          disabled={column.disabled}
                          onCheckedChange={(checked) => {
                            onVisibilityChange(column.id, Boolean(checked))
                          }}
                        />
                        <Label
                          htmlFor={column.id}
                          className={`text-sm flex-1 cursor-pointer ${
                            column.disabled ? 'opacity-50' : ''
                          }`}
                        >
                          {column.label}
                          {column.isDefault && (
                            <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1 py-0.5 rounded">
                              Default
                            </span>
                          )}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  )
})

ColumnVisibilityControl.displayName = 'ColumnVisibilityControl'

export default ColumnVisibilityControl