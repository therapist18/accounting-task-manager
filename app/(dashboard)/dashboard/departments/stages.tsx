// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { ArrowUp, ArrowDown, Pencil, Plus, X, Info, ChevronUp, ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { supabase } from "@/lib/supabase/client"
import { AddStageDialog } from "./add-stage-dialog"
import { EditStageDialog } from "./edit-stage-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// Simple UUID generator for client-side use
const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

type TimeConfig = {
  applicationType: string
  days: number
  hours: number
  minutes: number
}

type Stage = {
  id: string
  name: string
  order_num: number
  estimated_time: number | null
  follow_up?: 'Client' | 'Officer' | 'BCL' | null
  isSpecial: boolean
  timeConfigs?: TimeConfig[]
  allocations?: {
    [key: string]: {
      allocated: boolean
      display: boolean
      classId?: string
    }
  }
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

type ClassRequirement = {
  name: string
  description: string | null
  is_required: boolean
}

type SubdepartmentClass = {
  name: string
  description: string | null
  requirements: ClassRequirement[]
  stages?: StageAllocation[]
}

type StageAllocation = {
  stage_id: string
  allocated: boolean
  display: boolean
}

type Subdepartment = {
  id: number
  name: string
  department_id: string
  classes?: SubdepartmentClass[]
  stages?: StageAllocation[]
  hasClasses: boolean
}

type Department = {
  id: string
  name: string
  stages: Stage[]
  tm_subdepartments?: Subdepartment[]
  subdepartments?: Subdepartment[]
}

export default function Stages() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeTab, setActiveTab] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingStage, setEditingStage] = useState<Stage | null>(null)
  const [isReordering, setIsReordering] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  const removeStageRow = (id: string) => {
    if (newStages.length <= 1) return
    setNewStages(prev => prev.filter(stage => stage.id !== id))
  }

  const updateNewStage = (id: string, updates: Partial<{
    id: string
    name: string
    days: number
    hours: number
    minutes: number
    followUp: string
  }>) => {
    setNewStages(prev =>
      prev.map(stage =>
        stage.id === id ? { ...stage, ...updates } : stage
      )
    )
  }
  const { toast } = useToast()

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
  const departmentList = useMemo(() =>
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
        let stageAllocation = updatedClasses[classIndex].stages.find((s: StageAllocation) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, allocated: false, display: false }
          updatedClasses[classIndex].stages.push(stageAllocation)
        }

        // Update allocation
        stageAllocation.allocated = shouldAllocate
        if (!shouldAllocate) {
          stageAllocation.display = false // If not allocated, can't display
        }

        updateData = { classes: updatedClasses }

        // Also update subdepartment stages
        const subdeptStages = [...(subdept.stages || [])]
        let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!subdeptStageAllocation) {
          subdeptStageAllocation = { stage_id: stageId, allocated: false, display: false }
          subdeptStages.push(subdeptStageAllocation)
        }
        subdeptStageAllocation.allocated = shouldAllocate || subdeptStages.some(s => s.stage_id === stageId && s.allocated)
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
          stageAllocation = { stage_id: stageId, allocated: false, display: false }
          subdeptStages.push(stageAllocation)
        }

        // Update allocation
        stageAllocation.allocated = shouldAllocate
        if (!shouldAllocate) {
          stageAllocation.display = false // If not allocated, can't display
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
                let stageAllocation = updatedClasses[classIndex].stages.find((s: StageAllocation) => s.stage_id === stageId)
                if (!stageAllocation) {
                  stageAllocation = { stage_id: stageId, allocated: false, display: false }
                  updatedClasses[classIndex].stages.push(stageAllocation)
                }

                // Update allocation
                stageAllocation.allocated = shouldAllocate
                if (!shouldAllocate) {
                  stageAllocation.display = false // If not allocated, can't display
                }

                // Update subdepartment stages as well
                const subdeptStages = [...(subdept.stages || [])]
                let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
                if (!subdeptStageAllocation) {
                  subdeptStageAllocation = { stage_id: stageId, allocated: false, display: false }
                  subdeptStages.push(subdeptStageAllocation)
                }
                subdeptStageAllocation.allocated = shouldAllocate || subdeptStages.some(s => s.stage_id === stageId && s.allocated)

                return {
                  ...subdept,
                  classes: updatedClasses,
                  stages: subdeptStages
                }
              }

              const subdeptStages = [...(subdept.stages || [])]
              let stageAllocation = subdeptStages.find(s => s.stage_id === stageId)
              if (!stageAllocation) {
                stageAllocation = { stage_id: stageId, allocated: false, display: false }
                subdeptStages.push(stageAllocation)
              }

              // Update allocation
              stageAllocation.allocated = shouldAllocate
              if (!shouldAllocate) {
                stageAllocation.display = false // If not allocated, can't display
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
        description: `${stageName} has been ${shouldAllocate ? 'allocated to' : 'removed from'} ${className ? `${className} in ${subdeptName}` : subdeptName}`,
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

        let stageAllocation = updatedClasses[classIndex].stages.find((s: StageAllocation) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, allocated: false, display: false }
          updatedClasses[classIndex].stages.push(stageAllocation)
        }

        stageAllocation.display = checked
        updateData = { classes: updatedClasses }

        // Update subdepartment display as well
        const subdeptStages = [...(subdept.stages || [])]
        let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!subdeptStageAllocation) {
          subdeptStageAllocation = { stage_id: stageId, allocated: false, display: false }
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
          stageAllocation = { stage_id: stageId, allocated: false, display: false }
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

                let stageAllocation = updatedClasses[classIndex].stages.find((s: StageAllocation) => s.stage_id === stageId)
                if (!stageAllocation) {
                  stageAllocation = { stage_id: stageId, allocated: false, display: false }
                  updatedClasses[classIndex].stages.push(stageAllocation)
                }
                stageAllocation.display = checked

                // Update subdepartment display as well
                const subdeptStages = [...(subdept.stages || [])]
                let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
                if (!subdeptStageAllocation) {
                  subdeptStageAllocation = { stage_id: stageId, allocated: false, display: false }
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
                stageAllocation = { stage_id: stageId, allocated: false, display: false }
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
  const handleAddStages = async (stages: Array<{
    id: string
    name: string
    days: number
    hours: number
    minutes: number
    followUp: string
    isSpecial: boolean
    timeConfigs: Array<{
      applicationType: string
      days: number
      hours: number
      minutes: number
    }>
  }>, departmentId: string) => {
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
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      const newStagesData = stages
        .filter(stage => stage.name.trim() !== '')
        .map((stage, index) => {
          // For special stages, we'll store the time configs and calculate time based on application type
          // For non-special stages, we'll use the direct time input
          const timeConfig = stage.isSpecial && stage.timeConfigs?.length > 0
            ? stage.timeConfigs[0] // Default to first config for now
            : { days: stage.days, hours: stage.hours, minutes: stage.minutes }


          const totalMinutes = (timeConfig.days * 24 * 60) + (timeConfig.hours * 60) + timeConfig.minutes

          return {
            name: stage.name,
            estimated_time: totalMinutes,
            order_num: currentDept.stages.length + index + 1,
            follow_up: stage.followUp === 'none' ? null : stage.followUp as 'Client' | 'Officer' | 'BCL',
            isSpecial: stage.isSpecial,
            timeConfigs: stage.isSpecial ? stage.timeConfigs : undefined,
            allocations: {}
          }
        })

      if (newStagesData.length === 0) {
        toast({
          title: "No valid stages to add",
          description: "Please enter at least one stage name",
          variant: "destructive"
        })
        return
      }

      // Update department with new stages
      const { data: updatedDept, error: updateError } = await supabase
        .from('tm_departments')
        .update({
          stages: [...currentDept.stages, ...newStagesData],
          updated_at: new Date().toISOString()
        })
        .eq('id', currentDept.id)
        .select()
        .single()

      if (updateError) throw updateError

      // Update local state
      setDepartments(departments.map(dept =>
        dept.id === currentDept.id
          ? { ...dept, stages: [...dept.stages, ...newStagesData] }
          : dept
      ))

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

  if (loading) return <div>Loading...</div>
  if (error) return <div className="text-red-500">{error}</div>
  if (!currentDept) return <div>No department selected</div>

  const getSubdepartmentColSpan = (subdept: Subdepartment) => {
    return (subdept.classes?.length || 0) || 1 // At least 1 if no classes
  }


  // Format time for display
  const formatTime = (minutes: number | null) => {
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

  // Sortable row component - moved outside the component
  const SortableRow = React.memo(({ id, children, isReordering }: { id: string, children: React.ReactNode, isReordering: boolean }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
    } = useSortable({ id })

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    }

    return (
      <TableRow ref={setNodeRef} style={style} className="relative">
        {isReordering && (
          <TableCell className="w-10 p-0">
            <button
              {...attributes}
              {...listeners}
              className="p-2 hover:bg-muted rounded-md cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
          </TableCell>
        )}
        {children}
      </TableRow>
    )
  })

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Stages</h2>
        <AddStageDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onAddStages={handleAddStages}
          departments={departmentList}
          />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Edit Stage Dialog */}
        <EditStageDialog
          open={!!editingStage}
          onOpenChange={(open) => !open && setEditingStage(null)}
          stage={editingStage}
          onSave={handleUpdateStage}
        />
        <TabsList className="w-full mb-4 items-start justify-start">
          {departments.map(dept => (
            <TabsTrigger key={dept.id} value={dept.id}>
              {dept.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {departments.map(dept => (
          <TabsContent key={dept.id} value={dept.id} className="space-y-4">
            <div className="relative overflow-auto max-h-[calc(100vh-300px)]">
              <Table className="border min-w-max">
                <TableHeader className="sticky top-0 bg-background z-10">
                  {/* Subdepartment Header Row */}
                  <TableRow className="bg-muted/50">
                    {isReordering && <TableHead rowSpan={2} className="sticky left-0 bg-background border-r font-bold w-12 z-20">Move</TableHead>}
                    <TableHead rowSpan={2} className={`sticky ${isReordering ? 'left-12' : 'left-0'} bg-background border-r font-bold w-12 z-20`}>#</TableHead>
                    <TableHead rowSpan={2} colSpan={4} className={`sticky ${isReordering ? 'left-24' : 'left-12'} bg-background border-r font-bold w-48 z-20 text-center`}>Stage Details</TableHead>
                    {normalizedSubdepartments.map((subdept, subIndex) => {
                      const colSpan = getSubdepartmentColSpan(subdept) * 2; // *2 for allocated/display
                      return (
                        <TableHead
                          key={`subdept-${subdept.id}-${subIndex}`}
                          colSpan={colSpan}
                          className={`${subIndex === 0 ? 'border-l' : ''} border-r text-center font-bold bg-muted/30`}
                        >
                          {subdept.name}
                        </TableHead>
                      );
                    })}
                  </TableRow>

                  {/* Class Header Row */}
                  <TableRow className="bg-muted/20">
                    {normalizedSubdepartments.map(subdept =>
                      subdept.hasClasses
                        ? subdept.classes?.map((cls, clsIndex) => (
                          <TableHead
                            key={`class-${subdept.id}-${clsIndex}`}
                            className="border text-center"
                            colSpan={2} // Allocate + Display columns
                          >
                            {cls.name}
                          </TableHead>
                        ))
                        : <TableHead
                          key={`subdept-${subdept.id}-direct`}
                          className="border text-center"
                          colSpan={2} // Allocate + Display columns
                        >
                          {subdept.name}
                        </TableHead>
                    )}
                  </TableRow>

                  {/* Allocate/Display Header Row */}
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background border-r z-20">
                      <div className="text-center">#</div>
                    </TableHead>
                    <TableHead className="sticky left-5 bg-background border-r z-20">
                      <div className="text-center">Stage Name</div>
                    </TableHead>
                    <TableHead className="sticky left-15 bg-background border-r z-20">
                      <div className="text-center">Time</div>
                    </TableHead>
                    <TableHead className="sticky left-25 bg-background border-r z-20">
                      <div className="text-center">Follow Up</div>
                    </TableHead>
                    <TableHead className="sticky left-40 bg-background border-r z-20">
                      <div className="text-center">Order</div>
                    </TableHead>
                    {normalizedSubdepartments.map(subdept =>
                      subdept.hasClasses
                        ? subdept.classes?.map((cls, clsIndex) => (
                          <React.Fragment key={`alloc-display-${subdept.id}-${clsIndex}`}>
                            <TableHead className="border text-center">
                              Allocate
                            </TableHead>
                            <TableHead className="border text-center">
                              Display
                            </TableHead>
                          </React.Fragment>
                        ))
                        : (
                          <React.Fragment key={`alloc-display-${subdept.id}-direct`}>
                            <TableHead className="border text-center">
                              Allocate
                            </TableHead>
                            <TableHead className="border text-center">
                              Display
                            </TableHead>
                          </React.Fragment>
                        )
                    )}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {dept.stages.map((stage, index) => (
                    <TableRow key={stage.id} className="group">
                      <TableCell className="sticky left-0 bg-background border-r z-10 text-center w-12">
                        {index + 1}
                      </TableCell>
                      <TableCell className="sticky left-12 bg-background border-r p-0 z-10 w-48">
                        <div className="flex items-center gap-2 p-2">
                          <span className="font-medium">{stage.name}</span>

                        </div>
                      </TableCell>
                      <TableCell className="sticky left-60 bg-background border-r p-0 z-10 w-24">
                        <div className="flex items-center justify-center p-2">
                          <div className="text-sm">
                            {stage.isSpecial ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
                                    <Info className="h-4 w-4 text-blue-500" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80">
                                  <div className="space-y-2">
                                    <h4 className="font-medium">Special Stage Requirements</h4>
                                    <div className="text-sm text-muted-foreground">
                                      This stage has special time requirements based on application type:
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
                            ) : (
                              <div className="text-sm">{formatTime(stage.estimated_time)}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="sticky left-84 bg-background border-r p-0 z-10 w-24">
                        <div className="flex p-2">
                          {stage.follow_up && (
                            <span className="text-sm">
                              {stage.follow_up}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="p-0 w-12">
                        <div className="flex items-center justify-center">
                          <div className="flex flex-col items-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveStage(stage.id, 'up');
                              }}
                              disabled={index === 0}
                              className={`p-1 rounded hover:bg-muted ${index === 0 ? 'opacity-30' : 'hover:bg-muted'}`}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveStage(stage.id, 'down');
                              }}
                              disabled={index === dept.stages.length - 1}
                              className={`p-1 rounded hover:bg-muted ${index === dept.stages.length - 1 ? 'opacity-30' : 'hover:bg-muted'}`}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setEditingStage(stage);
                              setIsEditDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                      {normalizedSubdepartments.map(subdept => {
                        if (subdept.hasClasses) {
                          return subdept.classes?.map((cls, clsIndex) => {
                            const stageAllocation = cls.stages?.find(s => s.stage_id === stage.id)
                            const hasAllocation = stageAllocation?.allocated || false
                            const hasDisplay = stageAllocation?.display || false

                            return (
                              <React.Fragment key={`cell-${subdept.id}-${clsIndex}-${stage.id}`}>
                                <TableCell className="border p-0">
                                  <Select
                                    value={hasAllocation ? 'allocated' : 'not-allocated'}
                                    onValueChange={(value) =>
                                      handleAllocationChange(subdept.id, stage.id, value === 'allocated', clsIndex)
                                    }
                                  >
                                    <SelectTrigger className="h-8 w-full border-0 shadow-none focus:ring-1 focus:ring-ring">
                                      <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="allocated">Allocated</SelectItem>
                                      <SelectItem value="not-allocated">Not Allocated</SelectItem>
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
                            );
                          });
                        } else {
                          // For subdepartments without classes
                          const stageAllocation = subdept.stages?.find(s => s.stage_id === stage.id);
                          const hasAllocation = stageAllocation?.allocated || false;
                          const hasDisplay = stageAllocation?.display || false;

                          return (
                            <React.Fragment key={`cell-${subdept.id}-direct-${stage.id}`}>
                              <TableCell className="border p-0">
                                <Select
                                  value={hasAllocation ? 'allocated' : 'not-allocated'}
                                  onValueChange={(value) =>
                                    handleAllocationChange(subdept.id, stage.id, value === 'allocated')
                                  }
                                >
                                  <SelectTrigger className="h-8 w-full border-0 shadow-none focus:ring-1 focus:ring-ring">
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="allocated">Allocated</SelectItem>
                                    <SelectItem value="not-allocated">Not Allocated</SelectItem>
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
                          );
                        }
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}