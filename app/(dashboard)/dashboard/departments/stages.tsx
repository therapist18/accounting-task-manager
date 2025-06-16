// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Plus, Pencil, GripVertical, ArrowUp, ArrowDown, X } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { closestCenter, DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors, DragStartEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Simple UUID generator for client-side use
const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

type Stage = {
  id: string
  name: string
  order_num: number
  estimated_time: number | null
  follow_up?: 'Client' | 'Officer' | 'BCL' | null
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
  const [newStages, setNewStages] = useState<Array<{
    id: string
    name: string
    days: number
    hours: number
    minutes: number
    followUp: string
  }>>([{
    id: generateId(),
    name: '',
    days: 0,
    hours: 0,
    minutes: 0,
    followUp: 'none',
  }])
  
  const addNewStageRow = () => {
    setNewStages(prev => [...prev, {
      id: generateId(),
      name: '',
      days: 0,
      hours: 0,
      minutes: 0,
      followUp: 'none',
    }])
  }

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
    return departments.find(dept => dept.id === activeTab)
  }

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
                const updatedClasses = [...(subdept.classes || [])]
                if (!updatedClasses[classIndex].stages) {
                  updatedClasses[classIndex].stages = []
                }

                let stageAllocation = updatedClasses[classIndex].stages.find((s: StageAllocation) => s.stage_id === stageId)
                if (!stageAllocation) {
                  stageAllocation = { stage_id: stageId, allocated: false, display: false }
                  updatedClasses[classIndex].stages.push(stageAllocation)
                }
                stageAllocation.allocated = shouldAllocate
                if (!shouldAllocate) stageAllocation.display = false

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
              stageAllocation.allocated = shouldAllocate
              if (!shouldAllocate) stageAllocation.display = false

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

  // Function to add a new stage to current department
  const handleAddStages = async () => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      const newStagesData = newStages
        .filter(stage => stage.name.trim() !== '')
        .map((stage, index) => {
          const totalMinutes = (stage.days * 24 * 60) + (stage.hours * 60) + stage.minutes
          return {
            name: stage.name,
            estimated_time: totalMinutes,
            order_num: currentDept.stages.length + index + 1,
            follow_up: stage.followUp === 'none' ? null : stage.followUp as 'Client' | 'Officer' | 'BCL',
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

      const updatedStages = [...currentDept.stages, ...newStagesData]

      // Update department stages in Supabase
      // First, update the department with new stages
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

      // Update allocations in the tm_subdepartments table if needed
      // This will be handled by the existing allocation change handlers
      // when the user interacts with the allocation checkboxes

      // Update local state
      setDepartments(departments.map(dept => 
        dept.id === currentDept.id 
          ? { ...dept, stages: updatedStages } 
          : dept
      ))

      // Reset form
      setNewStages([{
        id: crypto.randomUUID(),
        name: '',
        days: 0,
        hours: 0,
        minutes: 0,
        followUp: 'none'
      }])
      setIsDialogOpen(false)

      toast({
        title: "Success",
        description: `${newStagesData.length} stage(s) added successfully`,
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
  const handleUpdateStage = async (stage: Stage, updates: Partial<Stage>) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      const updatedStages = currentDept.stages.map(s =>
        s.id === stage.id ? { ...s, ...updates } : s
      )

      // Update department stages in Supabase
      const { error } = await supabase
        .from('tm_departments')
        .update({ stages: updatedStages })
        .eq('id', activeTab)

      if (error) throw error

      // Update local state
      setDepartments(prev => prev.map(dept =>
        dept.id === activeTab
          ? { ...dept, stages: updatedStages }
          : dept
      ))
    } catch (err) {
      console.error('Error updating stage:', err)
      toast({
        title: "Error",
        description: "Failed to update stage. Please try again.",
        variant: "destructive"
      })
    }
  }

  // Function to reorder stages
  const handleDragEnd = async (event: any) => {
    const { active, over } = event
    if (!active || !over || active.id === over.id) return

    const currentDept = getCurrentDepartment()
    if (!currentDept) return

    const oldIndex = currentDept.stages.findIndex(s => s.id === active.id)
    const newIndex = currentDept.stages.findIndex(s => s.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const newStages = arrayMove(currentDept.stages, oldIndex, newIndex)
    
    // Update order numbers
    const updatedStages = newStages.map((stage, index) => ({
      ...stage,
      order_num: index + 1
    }))

    try {
      // Update in Supabase
      const { error } = await supabase
        .from('tm_departments')
        .update({ stages: updatedStages })
        .eq('id', activeTab)

      if (error) throw error

      // Update local state
      setDepartments(prev => prev.map(dept =>
        dept.id === activeTab
          ? { ...dept, stages: updatedStages }
          : dept
      ))
    } catch (err) {
      console.error('Error reordering stages:', err)
      toast({
        title: "Error",
        description: "Failed to reorder stages. Please try again.",
        variant: "destructive"
      })
    }
  }

  // Move stage up or down
  const moveStage = async (stageId: string, direction: 'up' | 'down') => {
    const currentDept = getCurrentDepartment()
    if (!currentDept) return

    const currentIndex = currentDept.stages.findIndex(s => s.id === stageId)
    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= currentDept.stages.length) return

    const newStages = [...currentDept.stages]
    const [movedStage] = newStages.splice(currentIndex, 1)
    newStages.splice(newIndex, 0, movedStage)

    // Update order numbers
    const updatedStages = newStages.map((stage, index) => ({
      ...stage,
      order_num: index + 1
    }))

    try {
      // Update in Supabase
      const { error } = await supabase
        .from('tm_departments')
        .update({ stages: updatedStages })
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

  // Set up sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const currentDept = getCurrentDepartment()
  
  // Memoize the sortable context items to prevent unnecessary re-renders
  const sortableItems = useMemo(() => {
    return currentDept?.stages?.map(stage => stage.id) || []
  }, [currentDept?.stages])

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
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Stages Configuration</h3>
        <div className="flex gap-2">
          <Button 
            variant={isReordering ? "default" : "outline"} 
            size="sm"
            onClick={() => setIsReordering(!isReordering)}
          >
            {isReordering ? 'Done Reordering' : 'Reorder Stages'}
          </Button>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Stage
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Stage to {currentDept.name}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {newStages.map((stage, index) => (
                  <div key={stage.id} className="space-y-4 p-4 border rounded-lg relative">
                    {newStages.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStageRow(stage.id)}
                        className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor={`name-${stage.id}`} className="text-right">
                        Stage Name
                      </Label>
                      <Input
                        id={`name-${stage.id}`}
                        value={stage.name}
                        onChange={(e) => updateNewStage(stage.id, { name: e.target.value })}
                        className="col-span-3"
                        placeholder="Enter stage name"
                      />
                    </div>
                    
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">
                        Estimated Time
                      </Label>
                      <div className="col-span-3 grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor={`days-${stage.id}`} className="text-xs text-muted-foreground">Days</Label>
                          <Input
                            id={`days-${stage.id}`}
                            type="number"
                            min="0"
                            value={stage.days}
                            onChange={(e) => updateNewStage(stage.id, { days: parseInt(e.target.value) || 0 })}
                            className="w-full"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`hours-${stage.id}`} className="text-xs text-muted-foreground">Hours</Label>
                          <Input
                            id={`hours-${stage.id}`}
                            type="number"
                            min="0"
                            max="23"
                            value={stage.hours}
                            onChange={(e) => updateNewStage(stage.id, { hours: Math.min(23, parseInt(e.target.value) || 0) })}
                            className="w-full"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`minutes-${stage.id}`} className="text-xs text-muted-foreground">Minutes</Label>
                          <Input
                            id={`minutes-${stage.id}`}
                            type="number"
                            min="0"
                            max="59"
                            value={stage.minutes}
                            onChange={(e) => updateNewStage(stage.id, { minutes: Math.min(59, parseInt(e.target.value) || 0) })}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor={`followUp-${stage.id}`} className="text-right">
                        Follow Up
                      </Label>
                      <Select
                        value={stage.followUp}
                        onValueChange={(value) => updateNewStage(stage.id, { followUp: value })}
                      >
                        <SelectTrigger className="col-span-3">
                          <SelectValue placeholder="Select follow-up" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="Client">Client</SelectItem>
                          <SelectItem value="Officer">Officer</SelectItem>
                          <SelectItem value="BCL">BCL</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={addNewStageRow}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Another Stage
                </Button>
                <div className="flex gap-2">
                  <Button 
                    type="button"
                    variant="outline" 
                    onClick={() => {
                      setIsDialogOpen(false)
                      setNewStages([{
                        id: crypto.randomUUID(),
                        name: '',
                        days: 0,
                        hours: 0,
                        minutes: 0,
                        followUp: 'none'
                      }])
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="button"
                    onClick={handleAddStages}
                  >
                    Add {newStages.length} Stage{newStages.length !== 1 ? 's' : ''}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full mb-4">
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
                    <TableHead rowSpan={2} colSpan={2} className={`sticky ${isReordering ? 'left-24' : 'left-12'} bg-background border-r font-bold w-48 z-20 text-center`}>Stage Details</TableHead>
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
                    {isReordering && (
                      <TableHead className="sticky left-0 bg-background border-r z-20">
                        <div className="text-center">Move</div>
                      </TableHead>
                    )}
                    <TableHead className={`sticky ${isReordering ? 'left-12' : 'left-0'} bg-background border-r z-20`}>
                      <div className="text-center">#</div>
                    </TableHead>
                    <TableHead className={`sticky ${isReordering ? 'left-64' : 'left-52'} bg-background border-r z-20`}>
                      <div className="text-center">Stage Name</div>
                    </TableHead>
                    <TableHead className="sticky left-80 bg-background border-r z-20">
                      <div className="text-center">Time</div>
                    </TableHead>
                    <TableHead className="sticky left-96 bg-background border-r z-20">
                      <div className="text-center">Follow Up</div>
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
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={dept.stages.map(stage => stage.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {dept.stages.map((stage, index) => (
                        <SortableRow key={stage.id} id={stage.id} isReordering={isReordering}>
                          <TableCell className="sticky left-0 bg-background border-r z-10 text-center w-12">
                            {index + 1}
                          </TableCell>
                          <TableCell className="sticky left-12 bg-background border-r p-0 z-10 w-48">
                            <div className="flex items-center gap-2 p-2">
                              <input
                                type="text"
                                className="w-full bg-transparent border-none focus:ring-1 focus:ring-ring rounded px-2 py-1"
                                value={stage.name}
                                onChange={(e) => handleUpdateStage(stage, { name: e.target.value })}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => setEditingStage(stage)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="sticky left-60 bg-background border-r z-10 p-0 w-24">
                            <div className="flex items-center justify-center p-2">
                              <div className="text-sm">
                                {formatTime(stage.estimated_time)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="sticky left-84 bg-background border-r z-10 p-0 w-24">
                            <div className="flex items-center justify-center p-2">
                              <div className="text-sm">
                                {stage.follow_up || 'None'}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="p-0 w-12">
                            <div className="flex flex-col items-center">
                              <button
                                onClick={() => moveStage(stage.id, 'up')}
                                disabled={index === 0}
                                className="p-1 disabled:opacity-30"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => moveStage(stage.id, 'down')}
                                disabled={index === dept.stages.length - 1}
                                className="p-1 disabled:opacity-30"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
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
                          const stageAllocation = subdept.stages?.find(s => s.stage_id === stage.id)
                          const hasAllocation = stageAllocation?.allocated || false
                          const hasDisplay = stageAllocation?.display || false

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
                        </SortableRow>
                      ))}
                    </SortableContext>
                  </DndContext>
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}