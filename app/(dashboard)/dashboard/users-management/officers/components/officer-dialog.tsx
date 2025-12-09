"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import supabase from "@/lib/supabase/client"

export interface Department {
  id: string
  name: string
  tm_subdepartments?: SubDepartment[]
}

export interface SubDepartment {
  id: string
  name: string
  department_id: string
}

interface DepartmentSelectProps {
  value?: string
  onChange: (value: string) => void
  subDepartmentValue?: string | string[]
  onSubDepartmentChange?: (value: string | string[]) => void
  required?: boolean
  isMultiSelectSub?: boolean
  className?: string
}

export function DepartmentSelect({
  value,
  onChange,
  subDepartmentValue,
  onSubDepartmentChange,
  required = false,
  isMultiSelectSub = false,
  className,
}: DepartmentSelectProps) {
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [loading, setLoading] = React.useState(true)
  const [openSub, setOpenSub] = React.useState(false)

  // Fetch departments and subdepartments on mount
  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const { data, error } = await supabase
          .from("tm_departments")
          .select("*, tm_subdepartments(*)")
          .order("name")

        if (error) throw error
        setDepartments(data || [])
      } catch (error) {
        console.error("Error fetching departments:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Derived state
  const selectedDepartment = departments.find((d) => d.id === String(value))
  const subDepartments = selectedDepartment?.tm_subdepartments || []

  // Helper for multi-select value
  const selectedSubIds = Array.isArray(subDepartmentValue)
    ? subDepartmentValue
    : subDepartmentValue
    ? [subDepartmentValue]
    : []

  const handleSubSelect = (subId: string) => {
    if (!onSubDepartmentChange) return

    if (isMultiSelectSub) {
      const currentIds = selectedSubIds
      const newIds = currentIds.includes(subId)
        ? currentIds.filter((id) => id !== subId)
        : [...currentIds, subId]
      onSubDepartmentChange(newIds)
    } else {
      onSubDepartmentChange(subId)
      setOpenSub(false)
    }
  }

  const handleRemoveSub = (e: React.MouseEvent, subId: string) => {
    e.stopPropagation()
    if (onSubDepartmentChange && isMultiSelectSub) {
      onSubDepartmentChange(selectedSubIds.filter((id) => id !== subId))
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Department Select (Always Single) */}
      <Select value={value?.toString()} onValueChange={onChange} disabled={loading}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={loading ? "Loading..." : "Select Department"} />
        </SelectTrigger>
        <SelectContent>
          {departments.map((dept) => (
            <SelectItem key={dept.id} value={dept.id.toString()}>
              {dept.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Subdepartment Select (Single or Multi) */}
      {selectedDepartment && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          {isMultiSelectSub ? (
            // --- MULTI SELECT UI (Popover + Command) ---
            <Popover open={openSub} onOpenChange={setOpenSub}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openSub}
                  className="w-full justify-between min-h-[2.5rem] h-auto"
                >
                  <div className="flex flex-wrap gap-1 items-center">
                    {selectedSubIds.length > 0 ? (
                      selectedSubIds.map((id) => {
                        const sub = subDepartments.find((s) => s.id === id)
                        return (
                          <Badge key={id} variant="secondary" className="mr-1 mb-1 sm:mb-0">
                            {sub?.name || "Unknown"}
                            <div
                              className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                              onMouseDown={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              onClick={(e) => handleRemoveSub(e, id)}
                            >
                              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                            </div>
                          </Badge>
                        )
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
                  <CommandInput placeholder="Search subdepartment..." />
                  <CommandList>
                    <CommandEmpty>No subdepartment found.</CommandEmpty>
                    <CommandGroup>
                      {subDepartments.map((sub) => (
                        <CommandItem
                          key={sub.id}
                          value={sub.name} // Search by name
                          onSelect={() => handleSubSelect(sub.id.toString())}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedSubIds.includes(sub.id.toString())
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {sub.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : (
            // --- SINGLE SELECT UI (Standard Select) ---
            <Select
              value={subDepartmentValue?.toString()}
              onValueChange={(val) => onSubDepartmentChange?.(val)}
              disabled={subDepartments.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={
                  subDepartments.length === 0 
                    ? "No subdepartments available" 
                    : "Select Subdepartment"
                } />
              </SelectTrigger>
              <SelectContent>
                {subDepartments.map((sub) => (
                  <SelectItem key={sub.id} value={sub.id.toString()}>
                    {sub.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  )
}