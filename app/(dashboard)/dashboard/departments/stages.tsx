// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { ArrowUp, ArrowDown, Pencil, Plus, X, Info, ChevronUp, ChevronDown, Clock, FileText, User } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { supabase } from "@/lib/supabase/client"
import { AddStageDialog } from "./add-stage-dialog"
import { EditStageDialog } from "./edit-stage-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import type { Department, Stage, Subdepartment, DepartmentOption } from "./types"

// Simple UUID generator for client-side use
const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// Utility functions for time conversion
const minutesToTimeString = (minutes: number | null): string => {
  if (minutes === null) return '0m'
  const days = Math.floor(minutes / (60 * 24))
  const hours = Math.floor((minutes % (60 * 24)) / 60)
  const mins = minutes % 60

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`)

  return parts.join(' ')
}

const timeStringToMinutes = (timeString: string): number => {
  let totalMinutes = 0
  const parts = timeString.trim().split(/\s+/)

  for (const part of parts) {
    const value = parseInt(part)
    if (part.endsWith('d')) {
      totalMinutes += value * 60 * 24
    } else if (part.endsWith('h')) {
      totalMinutes += value * 60
    } else if (part.endsWith('m')) {
      totalMinutes += value
    }
  }

  return totalMinutes
}

const getTimeFromMinutes = (minutes: number | null) => {
  if (minutes === null) return { days: 0, hours: 0, minutes: 0 }
  const days = Math.floor(minutes / (24 * 60))
  const remainingMinutes = minutes % (24 * 60)
  const hours = Math.floor(remainingMinutes / 60)
  const mins = remainingMinutes % 60
  return { days, hours, minutes: mins }
}

export default function Stages() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeTab, setActiveTab] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingStage, setEditingStage] = useState<Stage | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const { toast } = useToast()

  const toggleRowExpansion = (rowId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(rowId)) {
        newSet.delete(rowId)
      } else {
        newSet.add(rowId)
      }
      return newSet
    })
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        // Fetch departments with their subdepartments and stages
        const { data: deptsData, error: deptsError } = await supabase
          .from('tm_departments')
          .select(`
            *,
            tm_subdepartments (
              *,
              classes
            )
          `)
          .order('name')

        if (deptsError) throw deptsError

        // Transform the data to ensure consistent structure
        const transformedDepartments = (deptsData || []).map(dept => ({
          ...dept,
          stages: dept.stages ? (Array.isArray(dept.stages) ? dept.stages : []) : [],
          subdepartments: (dept.tm_subdepartments || []).map((subdept: any) => ({
            ...subdept,
            stages: Array.isArray(subdept.stages) ? subdept.stages : [],
            classes: Array.isArray(subdept.classes) ? subdept.classes : [],
            hasClasses: (subdept.classes && Array.isArray(subdept.classes) && subdept.classes.length > 0)
          }))
        }))

        setDepartments(transformedDepartments)

        // Set the first department as active tab
        if (transformedDepartments.length > 0) {
          setActiveTab(transformedDepartments[0].id)
        }
      } catch (err) {
        console.error('Error fetching data:', err)
        setError('Failed to load data. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const getCurrentDepartment = () => {
    return departments.find(d => d.id === activeTab)
  }

  // Get simplified department list for the dropdown
  const departmentList = useMemo((): DepartmentOption[] =>
    departments.map(dept => ({
      id: dept.id,
      name: dept.name
    })),
    [departments]
  )

  // Handle allocation change
  const handleAllocationChange = async (subdeptId: number, stageId: string, shouldAllocate: boolean, classIndex: number | null = null) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      let updateData: any = {}
      let subdeptName = ''
      let className = ''
      let stageName = currentDept.stages.find(s => s.id === stageId)?.name || 'this stage'

      if (classIndex !== null) {
        // Handle class allocation
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept?.classes?.[classIndex]) {
          toast({
            title: "Error",
            description: "Class not found",
            variant: "destructive"
          })
          return
        }

        subdeptName = subdept.name
        className = subdept.classes[classIndex].name

        // Create a deep copy of the classes array
        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))

        // Ensure stages array exists
        if (!updatedClasses[classIndex].stages) {
          updatedClasses[classIndex].stages = []
        }

        // Find or create stage allocation
        let stageAllocation = updatedClasses[classIndex].stages.find((s: any) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: false, display: false }
          updatedClasses[classIndex].stages.push(stageAllocation)
        }

        // Update allocation
        stageAllocation.applicable = shouldAllocate
        if (!shouldAllocate) {
          stageAllocation.display = false // If not applicable, can't display
        }

        updateData = { classes: updatedClasses }

        // Also update subdepartment stages
        const subdeptStages = [...(subdept.stages || [])]
        let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!subdeptStageAllocation) {
          subdeptStageAllocation = { stage_id: stageId, applicable: false, display: false }
          subdeptStages.push(subdeptStageAllocation)
        }
        subdeptStageAllocation.applicable = shouldAllocate || subdeptStages.some(s => s.stage_id === stageId && s.applicable)
        updateData.stages = subdeptStages

      } else {
        // Handle subdepartment allocation
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept) {
          toast({
            title: "Error",
            description: "Subdepartment not found",
            variant: "destructive"
          })
          return
        }

        subdeptName = subdept.name

        // Ensure stages array exists
        const subdeptStages = [...(subdept.stages || [])]
        let stageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: false, display: false }
          subdeptStages.push(stageAllocation)
        }

        // Update allocation
        stageAllocation.applicable = shouldAllocate
        if (!shouldAllocate) {
          stageAllocation.display = false // If not applicable, can't display
        }

        updateData = { stages: subdeptStages }
      }

      // Update in Supabase
      const { error } = await supabase
        .from('tm_subdepartments')
        .update(updateData)
        .eq('id', subdeptId)

      if (error) throw error

      // Update local state
      setDepartments(prevDepartments =>
        prevDepartments.map(dept => {
          if (dept.id !== activeTab) return dept

          return {
            ...dept,
            subdepartments: dept.subdepartments?.map(subdept => {
              if (subdept.id !== subdeptId) return subdept

              if (classIndex !== null) {
                const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))

                // Ensure stages array exists
                if (!updatedClasses[classIndex].stages) {
                  updatedClasses[classIndex].stages = []
                }

                // Find or create stage allocation
                let stageAllocation = updatedClasses[classIndex].stages.find((s: any) => s.stage_id === stageId)
                if (!stageAllocation) {
                  stageAllocation = { stage_id: stageId, applicable: false, display: false }
                  updatedClasses[classIndex].stages.push(stageAllocation)
                }

                // Update allocation
                stageAllocation.applicable = shouldAllocate
                if (!shouldAllocate) {
                  stageAllocation.display = false // If not applicable, can't display
                }

                // Update subdepartment stages as well
                const subdeptStages = [...(subdept.stages || [])]
                let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
                if (!subdeptStageAllocation) {
                  subdeptStageAllocation = { stage_id: stageId, applicable: false, display: false }
                  subdeptStages.push(subdeptStageAllocation)
                }
                subdeptStageAllocation.applicable = shouldAllocate || subdeptStages.some(s => s.stage_id === stageId && s.applicable)

                return {
                  ...subdept,
                  classes: updatedClasses,
                  stages: subdeptStages
                }
              }

              const subdeptStages = [...(subdept.stages || [])]
              let stageAllocation = subdeptStages.find(s => s.stage_id === stageId)
              if (!stageAllocation) {
                stageAllocation = { stage_id: stageId, applicable: false, display: false }
                subdeptStages.push(stageAllocation)
              }

              // Update allocation
              stageAllocation.applicable = shouldAllocate
              if (!shouldAllocate) {
                stageAllocation.display = false // If not applicable, can't display
              }

              return {
                ...subdept,
                stages: subdeptStages
              }
            }) || []
          }
        })
      )

      // Show success toast
      toast({
        title: "Success",
        description: `${stageName} has been ${shouldAllocate ? 'applicable to' : 'removed from'} ${className ? `${className} in ${subdeptName}` : subdeptName}`,
      })
    } catch (err) {
      console.error('Error updating allocation:', err)
      toast({
        title: "Error",
        description: "Failed to update allocation. Please try again.",
        variant: "destructive"
      })
    }
  }

  // Handle display toggle
  const handleDisplayToggle = async (subdeptId: number, stageId: string, checked: boolean, classIndex: number | null = null) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      let updateData: any = {}
      let subdeptName = ''
      let className = ''
      let stageName = currentDept.stages.find(s => s.id === stageId)?.name || 'this stage'

      if (classIndex !== null) {
        // Handle class display toggle
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept?.classes?.[classIndex]) {
          toast({
            title: "Error",
            description: "Class not found",
            variant: "destructive"
          })
          return
        }

        subdeptName = subdept.name
        className = subdept.classes[classIndex].name

        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))

        if (!updatedClasses[classIndex].stages) {
          updatedClasses[classIndex].stages = []
        }

        let stageAllocation = updatedClasses[classIndex].stages.find((s: any) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: false, display: false }
          updatedClasses[classIndex].stages.push(stageAllocation)
        }

        stageAllocation.display = checked
        updateData = { classes: updatedClasses }

        // Update subdepartment display as well
        const subdeptStages = [...(subdept.stages || [])]
        let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!subdeptStageAllocation) {
          subdeptStageAllocation = { stage_id: stageId, applicable: false, display: false }
          subdeptStages.push(subdeptStageAllocation)
        }
        subdeptStageAllocation.display = checked || subdeptStages.some(s => s.stage_id === stageId && s.display)
        updateData.stages = subdeptStages

      } else {
        // Handle subdepartment display toggle
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept) {
          toast({
            title: "Error",
            description: "Subdepartment not found",
            variant: "destructive"
          })
          return
        }

        subdeptName = subdept.name

        const subdeptStages = [...(subdept.stages || [])]
        let stageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: false, display: false }
          subdeptStages.push(stageAllocation)
        }

        stageAllocation.display = checked
        updateData = { stages: subdeptStages }
      }

      // Update in Supabase
      const { error } = await supabase
        .from('tm_subdepartments')
        .update(updateData)
        .eq('id', subdeptId)

      if (error) throw error

      // Update local state
      setDepartments(prevDepartments =>
        prevDepartments.map(dept => {
          if (dept.id !== activeTab) return dept

          return {
            ...dept,
            subdepartments: dept.subdepartments?.map(subdept => {
              if (subdept.id !== subdeptId) return subdept

              if (classIndex !== null) {
                const updatedClasses = [...(subdept.classes || [])]
                if (!updatedClasses[classIndex].stages) {
                  updatedClasses[classIndex].stages = []
                }

                let stageAllocation = updatedClasses[classIndex].stages.find((s: any) => s.stage_id === stageId)
                if (!stageAllocation) {
                  stageAllocation = { stage_id: stageId, applicable: false, display: false }
                  updatedClasses[classIndex].stages.push(stageAllocation)
                }
                stageAllocation.display = checked

                // Update subdepartment display as well
                const subdeptStages = [...(subdept.stages || [])]
                let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
                if (!subdeptStageAllocation) {
                  subdeptStageAllocation = { stage_id: stageId, applicable: false, display: false }
                  subdeptStages.push(subdeptStageAllocation)
                }
                subdeptStageAllocation.display = checked || subdeptStages.some(s => s.stage_id === stageId && s.display)

                return {
                  ...subdept,
                  classes: updatedClasses,
                  stages: subdeptStages
                }
              }

              const subdeptStages = [...(subdept.stages || [])]
              let stageAllocation = subdeptStages.find(s => s.stage_id === stageId)
              if (!stageAllocation) {
                stageAllocation = { stage_id: stageId, applicable: false, display: false }
                subdeptStages.push(stageAllocation)
              }
              stageAllocation.display = checked

              return {
                ...subdept,
                stages: subdeptStages
              }
            }) || []
          }
        })
      )

      // Show success toast
      toast({
        title: "Success",
        description: `Display setting updated for ${stageName} in ${className ? `${className} (${subdeptName})` : subdeptName}`,
      })
    } catch (err) {
      console.error('Error updating display setting:', err)
      toast({
        title: "Error",
        description: "Failed to update display setting. Please try again.",
        variant: "destructive"
      })
    }
  }

  // Function to add new stages from the AddStageDialog
  const handleAddStages = async (stages: any[], departmentId: string) => {
    const currentDept = departments.find(d => d.id === departmentId)
    if (!currentDept) {
      toast({
        title: "Error",
        description: "Department not found. Please try again.",
        variant: "destructive"
      })
      return
    }

    try {
      // Process each stage to ensure proper time configurations
      const newStagesData = stages
        .filter(stage => stage.name.trim() !== '')
        .map((stage, index) => {
          // For special stages, we need to ensure timeConfigs are properly formatted
          if (stage.isSpecial) {
            const timeConfigs = Array.isArray(stage.timeConfigs) 
              ? stage.timeConfigs.map(config => ({
                  applicationType: config.applicationType || 'Default',
                  days: Number(config.days) || 0,
                  hours: Number(config.hours) || 0,
                  minutes: Number(config.minutes) || 0
                }))
              : [];

            // Calculate total minutes from the first config (or default to 0)
            const firstConfig = timeConfigs[0] || { days: 0, hours: 0, minutes: 0 };
            const totalMinutes = (firstConfig.days * 24 * 60) + (firstConfig.hours * 60) + firstConfig.minutes;

            return {
              id: generateId(),
              name: stage.name.trim(),
              description: stage.description || '',
              estimated_time: totalMinutes,
              order_num: currentDept.stages.length + index + 1,
              follow_up: stage.followUp === 'none' ? null : stage.followUp as 'Client' | 'Officer' | 'BCL',
              isSpecial: true,
              timeConfigs: timeConfigs.length > 0 ? timeConfigs : undefined,
              documents: stage.documents || [],
              allocations: {}
            };
          }
          
          // For regular stages, use direct time input
          const days = Number(stage.days) || 0;
          const hours = Number(stage.hours) || 0;
          const minutes = Number(stage.minutes) || 0;
          const totalMinutes = (days * 24 * 60) + (hours * 60) + minutes;

          return {
            id: generateId(),
            name: stage.name.trim(),
            description: stage.description || '',
            estimated_time: totalMinutes,
            order_num: currentDept.stages.length + index + 1,
            follow_up: stage.followUp === 'none' ? null : stage.followUp as 'Client' | 'Officer' | 'BCL',
            isSpecial: false,
            timeConfigs: undefined,
            documents: stage.documents || [],
            allocations: {}
          };
        });

      if (newStagesData.length === 0) {
        toast({
          title: "No valid stages to add",
          description: "Please enter at least one stage name",
          variant: "destructive"
        })
        return
      }

      // Prepare stages for database update
      const updatedStages = [
        ...currentDept.stages,
        ...newStagesData
      ];

      // Update department with new stages in the database
      const { data: updatedDept, error: updateError } = await supabase
        .from('tm_departments')
        .update({
          stages: updatedStages,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentDept.id)
        .select()
        .single()

      if (updateError) throw updateError

      // Update local state with the new stages
      setDepartments(departments.map(dept =>
        dept.id === currentDept.id
          ? { ...dept, stages: updatedStages }
          : dept
      ))

      // Close the dialog
      setIsDialogOpen(false)

      toast({
        title: "Success",
        description: `Added ${newStagesData.length} stage${newStagesData.length > 1 ? 's' : ''} successfully.`,
      })
    } catch (err) {
      console.error('Error adding stages:', err)
      toast({
        title: "Error",
        description: "Failed to add stages. Please try again.",
        variant: "destructive"
      })
    }
  }

  // Function to update a stage
  const handleUpdateStage = async (updatedStage: Stage) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      const updatedStages = currentDept.stages.map(s =>
        s.id === updatedStage.id ? updatedStage : s
      )

      // Update department stages in Supabase
      const { error } = await supabase
        .from('tm_departments')
        .update({
          stages: updatedStages,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeTab)

      if (error) throw error

      // Update local state
      setDepartments(prev => prev.map(dept =>
        dept.id === activeTab
          ? { ...dept, stages: updatedStages }
          : dept
      ))

      toast({
        title: "Success",
        description: "Stage updated successfully",
      })

      setIsEditDialogOpen(false)
      setEditingStage(null)
    } catch (err) {
      console.error('Error updating stage:', err)
      toast({
        title: "Error",
        description: "Failed to update stage. Please try again.",
        variant: "destructive"
      })
    }
  }

  // Function to move a stage up or down
  const moveStage = async (stageId: string, direction: 'up' | 'down') => {
    const currentDept = getCurrentDepartment()
    if (!currentDept) return

    // Create a deep copy of the stages array to avoid reference issues
    const currentStages = JSON.parse(JSON.stringify(currentDept.stages))
    const currentIndex = currentStages.findIndex((s: Stage) => s.id === stageId)

    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= currentStages.length) return

    // Create a new array with the stage moved to its new position
    const newStages = [...currentStages]
    const [movedStage] = newStages.splice(currentIndex, 1)
    newStages.splice(newIndex, 0, movedStage)

    // Update order numbers while preserving all other properties
    const updatedStages = newStages.map((stage: Stage, index: number) => ({
      ...stage, // Spread all existing properties
      order_num: index + 1 // Update just the order_num
    }))

    try {
      // First, get the current department data to preserve all fields
      const { data: currentDeptData, error: fetchError } = await supabase
        .from('tm_departments')
        .select('*')
        .eq('id', activeTab)
        .single()

      if (fetchError) throw fetchError

      // Update the department with the new stages array
      const { error } = await supabase
        .from('tm_departments')
        .update({
          ...currentDeptData, // Preserve all other fields
          stages: updatedStages,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeTab)

      if (error) throw error

      // Update local state
      setDepartments(prev => prev.map(dept =>
        dept.id === activeTab
          ? { ...dept, stages: updatedStages }
          : dept
      ))
    } catch (err) {
      console.error('Error moving stage:', err)
      toast({
        title: "Error",
        description: `Failed to move stage ${direction}. Please try again.`,
        variant: "destructive"
      })
    }
  }

  const currentDept = getCurrentDepartment()

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>
  if (error) return <div className="text-red-500 p-4">{error}</div>
  if (!currentDept) return <div className="p-4">No department selected</div>

  // Ensure we always have at least one subdepartment
  const normalizedSubdepartments = currentDept.subdepartments && currentDept.subdepartments.length > 0
    ? currentDept.subdepartments
    : [{
      id: -1,
      name: 'N/A',
      department_id: currentDept.id,
      stages: [],
      hasClasses: false,
      classes: []
    }]

  return (
    <div className="w-full space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Stages Management</h2>
        <AddStageDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onAddStages={handleAddStages}
          departments={departmentList}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full mb-4 items-start justify-start overflow-x-auto">
          {departments.map(dept => (
            <TabsTrigger key={dept.id} value={dept.id} className="whitespace-nowrap">
              {dept.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {departments.map(dept => (
        <TabsContent key={dept.id} value={dept.id} className="space-y-4">
        {dept.stages.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-muted rounded-lg">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium text-muted-foreground mb-2">No stages yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first stage to get started with the workflow
            </p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Stage
            </Button>
          </div>
        ) : (
          <div className="relative overflow-auto max-h-[calc(100vh-300px)] border rounded-lg">
            <Table className="min-w-max">
              <TableHeader className="sticky top-0 bg-background z-10">
                {/* Multi-level header for stages */}
                <TableRow className="bg-muted/50">
                  <TableHead rowSpan={3} className="sticky left-0 bg-background border-r font-bold w-48 z-20">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Department / Class
                    </div>
                  </TableHead>
                  {dept.stages.map((stage) => (
                    <TableHead 
                      key={stage.id} 
                      colSpan={6} 
                      className="border-r text-center font-bold bg-muted/30 min-w-[300px]"
                    >
                      <div className="flex flex-col items-center p-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{stage.name}</span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => setEditingStage(stage)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => moveStage(stage.id, 'up')}
                              disabled={stage.order_num === 1}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => moveStage(stage.id, 'down')}
                              disabled={stage.order_num === dept.stages.length}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-xs">
                            #{stage.order_num}
                          </Badge>
                          {stage.documents && stage.documents.length > 0 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-5 w-5 p-0">
                                  <FileText className="h-3 w-3 text-blue-500" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-80">
                                <div className="space-y-2">
                                  <h4 className="font-medium">Stage Documents</h4>
                                  <div className="space-y-2">
                                    {stage.documents.map((doc, i) => (
                                      <div key={i} className="bg-muted/50 p-2 rounded text-sm">
                                        <div className="font-medium flex items-center gap-2">
                                          {doc.name}
                                          <Badge variant={doc.isRequired ? "default" : "secondary"} className="text-xs">
                                            {doc.isRequired ? "Required" : "Optional"}
                                          </Badge>
                                        </div>
                                        <div className="text-muted-foreground text-xs">
                                          Type: {doc.documentType}
                                        </div>
                                        {doc.extractionSpecs && doc.extractionSpecs.length > 0 && (
                                          <div className="text-xs text-muted-foreground mt-1">
                                            Extractions: {doc.extractionSpecs.map(spec => spec.fieldName).join(', ')}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                          {stage.isSpecial && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-5 w-5 p-0">
                                  <Clock className="h-3 w-3 text-orange-500" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-80">
                                <div className="space-y-2">
                                  <h4 className="font-medium">Special Time Requirements</h4>
                                  <div className="text-sm text-muted-foreground">
                                    This stage has different time requirements based on application type:
                                  </div>
                                  <div className="space-y-2 mt-2">
                                    {stage.timeConfigs?.map((config, i) => (
                                      <div key={i} className="bg-muted/50 p-2 rounded text-sm">
                                        <div className="font-medium">{config.applicationType || 'Default'}</div>
                                        <div className="text-muted-foreground">
                                          {config.days > 0 && `${config.days}d `}
                                          {config.hours > 0 && `${config.hours}h `}
                                          {config.minutes > 0 ? `${config.minutes}m` : ''}
                                          {!config.days && !config.hours && !config.minutes ? '0m' : ''}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
                
                {/* Stage details row */}
                <TableRow className="bg-muted/30">
                  {dept.stages.map((stage) => (
                    <React.Fragment key={`details-${stage.id}`}>
                      <TableHead colSpan={3} className="border text-center text-xs font-medium">
                        <div className="flex items-center justify-center gap-1">
                          <Clock className="h-3 w-3" />
                          Duration
                        </div>
                      </TableHead>
                      <TableHead className="border text-center text-xs font-medium">
                        <div className="flex items-center justify-center gap-1">
                          <User className="h-3 w-3" />
                          Follow Up
                        </div>
                      </TableHead>
                      <TableHead className="border text-center text-xs font-medium">
                        Applicable
                      </TableHead>
                      <TableHead className="border text-center text-xs font-medium">
                        Display
                      </TableHead>
                    </React.Fragment>
                  ))}
                </TableRow>
                
                {/* Duration breakdown row */}
                <TableRow className="bg-muted/20">
                  {dept.stages.map((stage) => (
                    <React.Fragment key={`duration-${stage.id}`}>
                      <TableHead className="border text-center text-xs">Days</TableHead>
                      <TableHead className="border text-center text-xs">Hours</TableHead>
                      <TableHead className="border text-center text-xs">Minutes</TableHead>
                      <TableHead className="border text-center text-xs">Person</TableHead>
                      <TableHead className="border text-center text-xs">Status</TableHead>
                      <TableHead className="border text-center text-xs">Show</TableHead>
                    </React.Fragment>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {normalizedSubdepartments.flatMap(subdept => {
                  const subdeptRowId = `subdept-${subdept.id}`
                  const isExpanded = expandedRows.has(subdeptRowId)
                  
                  const rows = [
                    // Subdepartment row
                    <TableRow key={subdeptRowId} className="hover:bg-muted/50">
                      <TableCell className="sticky left-0 bg-background border-r font-medium z-10">
                        <div className="flex items-center gap-2">
                          {subdept.hasClasses && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => toggleRowExpansion(subdeptRowId)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronUp className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          <span className="font-medium">{subdept.name}</span>
                          {subdept.hasClasses && (
                            <Badge variant="secondary" className="text-xs">
                              {subdept.classes?.length || 0} classes
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      {dept.stages.map(stage => {
                        const stageAllocation = subdept.stages?.find(s => s.stage_id === stage.id)
                        const hasAllocation = stageAllocation?.applicable || false
                        const hasDisplay = stageAllocation?.display || false
                        const { days, hours, minutes } = getTimeFromMinutes(stage.estimated_time)

                        return (
                          <React.Fragment key={`subdept-${subdept.id}-${stage.id}`}>
                            <TableCell className="border p-1 text-center text-sm font-mono">
                              {days}
                            </TableCell>
                            <TableCell className="border p-1 text-center text-sm font-mono">
                              {hours}
                            </TableCell>
                            <TableCell className="border p-1 text-center text-sm font-mono">
                              {minutes}
                            </TableCell>
                            <TableCell className="border p-1 text-center text-xs">
                              {stage.follow_up ? (
                                <Badge variant="outline" className="text-xs">
                                  {stage.follow_up}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="border p-0">
                              <Select
                                value={hasAllocation ? 'applicable' : 'not-applicable'}
                                onValueChange={(value) =>
                                  handleAllocationChange(subdept.id, stage.id, value === 'applicable')
                                }
                              >
                                <SelectTrigger className="h-8 w-full border-0 shadow-none focus:ring-1 focus:ring-ring">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="applicable">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                      Applicable
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="not-applicable">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                      Not Applicable
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="border p-0">
                              <div className="flex items-center justify-center p-2">
                                <Checkbox
                                  checked={hasDisplay}
                                  onCheckedChange={(checked) =>
                                    handleDisplayToggle(subdept.id, stage.id, checked as boolean)
                                  }
                                  disabled={!hasAllocation}
                                  className="h-4 w-4"
                                />
                              </div>
                            </TableCell>
                          </React.Fragment>
                        )
                      })}
                    </TableRow>
                  ]

                  // Add class rows if expanded and has classes
                  if (isExpanded && subdept.hasClasses && subdept.classes) {
                    subdept.classes.forEach((cls, clsIndex) => {
                      rows.push(
                        <TableRow key={`class-${subdept.id}-${clsIndex}`} className="bg-muted/5 hover:bg-muted/10">
                          <TableCell className="sticky left-0 bg-background border-r pl-12 z-10">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground text-sm">└─ {cls.name}</span>
                              {cls.requirements && cls.requirements.length > 0 && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-5 w-5 p-0">
                                      <Info className="h-3 w-3 text-blue-500" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-60">
                                    <div className="space-y-2">
                                      <h4 className="font-medium text-sm">Class Requirements</h4>
                                      <div className="space-y-1">
                                        {cls.requirements.map((req, i) => (
                                          <div key={i} className="text-xs">
                                            <span className={req.is_required ? "text-red-600" : "text-muted-foreground"}>
                                              {req.is_required ? "• " : "○ "}{req.name}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                            </div>
                          </TableCell>
                          {dept.stages.map(stage => {
                            const stageAllocation = cls.stages?.find(s => s.stage_id === stage.id)
                            const hasAllocation = stageAllocation?.applicable || false
                            const hasDisplay = stageAllocation?.display || false
                            const { days, hours, minutes } = getTimeFromMinutes(stage.estimated_time)

                            return (
                              <React.Fragment key={`class-${subdept.id}-${clsIndex}-${stage.id}`}>
                                <TableCell className="border p-1 text-center text-sm font-mono text-muted-foreground">
                                  {days}
                                </TableCell>
                                <TableCell className="border p-1 text-center text-sm font-mono text-muted-foreground">
                                  {hours}
                                </TableCell>
                                <TableCell className="border p-1 text-center text-sm font-mono text-muted-foreground">
                                  {minutes}
                                </TableCell>
                                <TableCell className="border p-1 text-center text-xs">
                                  {stage.follow_up ? (
                                    <Badge variant="outline" className="text-xs opacity-75">
                                      {stage.follow_up}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="border p-0">
                                  <Select
                                    value={hasAllocation ? 'applicable' : 'not-applicable'}
                                    onValueChange={(value) =>
                                      handleAllocationChange(subdept.id, stage.id, value === 'applicable', clsIndex)
                                    }
                                  >
                                    <SelectTrigger className="h-8 w-full border-0 shadow-none focus:ring-1 focus:ring-ring">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="applicable">
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                          Applicable
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="not-applicable">
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                          Not Applicable
                                        </div>
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="border p-0">
                                  <div className="flex items-center justify-center p-2">
                                    <Checkbox
                                      checked={hasDisplay}
                                      onCheckedChange={(checked) =>
                                        handleDisplayToggle(subdept.id, stage.id, checked as boolean, clsIndex)
                                      }
                                      disabled={!hasAllocation}
                                      className="h-4 w-4"
                                    />
                                  </div>
                                </TableCell>
                              </React.Fragment>
                            )
                          })}
                        </TableRow>
                      )
                    })
                  }

                  return rows
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>
    ))}
  </Tabs>

  <EditStageDialog
    open={!!editingStage}
    onOpenChange={(open) => !open && setEditingStage(null)}
    stage={editingStage}
    onSave={handleUpdateStage}
  />
</div>
)
}