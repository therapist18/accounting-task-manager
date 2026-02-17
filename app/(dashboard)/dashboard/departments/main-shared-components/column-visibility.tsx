"use client"

import React, { useState, useMemo } from 'react'
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Eye, EyeOff, Settings, Search, RotateCcw, Columns, X } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

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
  title = "Manage Columns",
  description = "Select which columns you want to see in the table."
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Group columns by their group property
  const groupedColumns = useMemo(() => {
    return columns.reduce((acc, column) => {
      const group = column.group || 'General'
      if (!acc[group]) acc[group] = []
      acc[group].push(column)
      return acc
    }, {} as Record<string, ColumnVisibilityOption[]>)
  }, [columns])

  // Filter logic
  const filteredGroups = useMemo(() => {
    const search = searchQuery.toLowerCase().trim()
    if (!search) return groupedColumns
    
    const filtered: Record<string, ColumnVisibilityOption[]> = {}
    Object.entries(groupedColumns).forEach(([groupName, groupColumns]) => {
      const matches = groupColumns.filter(col => 
        col.label.toLowerCase().includes(search) || 
        groupName.toLowerCase().includes(search)
      )
      if (matches.length > 0) filtered[groupName] = matches
    })
    return filtered
  }, [groupedColumns, searchQuery])

  const visibleCount = columns.filter(col => col.visible).length
  const totalCount = columns.length
  const allSelected = visibleCount === totalCount

  const handleToggleAll = () => {
    const targetValue = !allSelected
    columns.forEach(col => {
      if (!col.disabled && col.visible !== targetValue) {
        onVisibilityChange(col.id, targetValue)
      }
    })
  }

  const handleToggleGroup = (groupName: string) => {
    const groupCols = groupedColumns[groupName]
    const allGroupVisible = groupCols.every(c => c.visible)
    groupCols.forEach(col => {
      if (!col.disabled) {
        onVisibilityChange(col.id, !allGroupVisible)
      }
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <Settings className="h-4 w-4" />
            <span>Columns</span>
            <Badge variant="secondary" className="ml-1 px-1.5 h-5 font-mono text-[10px]">
              {visibleCount}/{totalCount}
            </Badge>
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[600px] gap-0 p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2">
                <Columns className="h-5 w-5 text-muted-foreground" />
                {title}
              </DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-2 pt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search columns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
              {searchQuery && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleToggleAll}
              className="h-9 whitespace-nowrap"
            >
              {allSelected ? "Hide All" : "Show All"}
            </Button>
          </div>
        </DialogHeader>

        <Separator />

        <ScrollArea className="flex-1 p-6">
          {Object.keys(filteredGroups).length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">No columns matching "{searchQuery}"</p>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(filteredGroups).map(([groupName, groupColumns]) => (
                <div key={groupName} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                      {groupName}
                    </h5>
                    <Button 
                      variant="ghost" 
                      className="h-auto p-0 text-[10px] uppercase font-bold text-primary hover:bg-transparent"
                      onClick={() => handleToggleGroup(groupName)}
                    >
                      Toggle Group
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    {groupColumns.map((column) => (
                      <div
                        key={column.id}
                        className={`
                          flex items-center space-x-3 p-2 rounded-md transition-colors
                          ${column.visible ? 'bg-accent/30' : 'hover:bg-accent/20'}
                        `}
                      >
                        <Checkbox
                          id={`col-${column.id}`}
                          checked={column.visible}
                          disabled={column.disabled}
                          onCheckedChange={(checked) => {
                            onVisibilityChange(column.id, Boolean(checked))
                          }}
                        />
                        <Label
                          htmlFor={`col-${column.id}`}
                          className={`flex-1 text-sm font-medium leading-none cursor-pointer flex items-center justify-between ${
                            column.disabled ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {column.label}
                          {column.isDefault && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 uppercase font-normal text-muted-foreground">
                              Default
                            </Badge>
                          )}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <Separator />

        <DialogFooter className="p-4 bg-muted/30">
          <div className="flex w-full items-center justify-between">
            {onResetToDefault ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onResetToDefault}
                className="text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-2" />
                Reset to Default
              </Button>
            ) : <div />}
            
            <Button type="button" onClick={() => setIsOpen(false)}>
              Done
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

ColumnVisibilityControl.displayName = 'ColumnVisibilityControl'

export default ColumnVisibilityControl