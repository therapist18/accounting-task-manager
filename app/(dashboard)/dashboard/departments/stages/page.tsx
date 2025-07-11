// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { ArrowUp, ArrowDown, Pencil, X, Info, Minus, Plus, Clock, FileText, User, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Download, FileSpreadsheet } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { supabase } from "@/lib/supabase/client"
import { AddStageDialog } from "./components/add-stage-dialog"
import { EditStageDialog } from "./components/edit-stage-dialog"
import { ExportStages } from "./components/export-stages"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import type { Department, Stage, Subdepartment, DepartmentOption } from "./stagesdb"

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

// Helper function to get alternating blue colors for stages
const getStageColumnColor = (index: number) => {
  return index % 2 === 0 ? 'bg-blue-100/50' : 'bg-blue-50/50'
}

const getStageHeaderColor = (index: number) => {
  return index % 2 === 0 ? 'bg-blue-600' : 'bg-blue-600'
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

  const handleKeyDown = (e: React.KeyboardEvent, subdeptId: number, stageId: string, shouldAllocate: boolean) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAllocationChangeInternal(subdeptId, stageId, shouldAllocate)
    }
  }

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

        const { data: deptsData, error: deptsError } = await supabase
          .from('tm_departments')
          .select(`
            *,
            tm_subdepartments (
              *,
              classes
            )
          `)
          .order('order', { ascending: true })

        if (deptsError) throw deptsError

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

  const departmentList = useMemo((): DepartmentOption[] =>
    departments.map(dept => ({
      id: dept.id,
      name: dept.name
    })),
    [departments]
  )

  const handleAllocationChangeInternal = async (subdeptId: number, stageId: string,
    shouldAllocate: boolean
  ) => {
    return handleAllocationChange(subdeptId, stageId, shouldAllocate)
  }

  const handleAllocationChange = async (
    subdeptId: number,
    stageId: string,
    shouldAllocate: boolean,
    classIndex: number | null = null,
    subclassIndex: number | null = null
  ) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      let updateData: any = {}
      let subdeptName = ''
      let className = ''
      let stageName = currentDept.stages.find(s => s.id === stageId)?.name || 'this stage'

      if (classIndex !== null && subclassIndex !== null) {
        // Handle subclass allocation
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept?.classes?.[classIndex]?.subClasses?.[subclassIndex]) {
          toast({
            title: "Error",
            description: "Subclass not found",
            variant: "destructive"
          })
          return
        }

        subdeptName = subdept.name
        className = subdept.classes[classIndex].name
        const subclassName = subdept.classes[classIndex].subClasses[subclassIndex].name

        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))

        if (!updatedClasses[classIndex].subClasses[subclassIndex].stages) {
          updatedClasses[classIndex].subClasses[subclassIndex].stages = []
        }

        let stageAllocation = updatedClasses[classIndex].subClasses[subclassIndex].stages.find((s: any) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          updatedClasses[classIndex].subClasses[subclassIndex].stages.push(stageAllocation)
        }

        stageAllocation.applicable = shouldAllocate
        if (!shouldAllocate) {
          stageAllocation.display = false
        }

        updateData = { classes: updatedClasses }

        // Update parent class and subdepartment stages as well
        if (!updatedClasses[classIndex].stages) {
          updatedClasses[classIndex].stages = []
        }
        let classStageAllocation = updatedClasses[classIndex].stages.find((s: any) => s.stage_id === stageId)
        if (!classStageAllocation) {
          classStageAllocation = { stage_id: stageId, applicable: true, display: true }
          updatedClasses[classIndex].stages.push(classStageAllocation)
        }
        classStageAllocation.applicable = shouldAllocate || updatedClasses[classIndex].subClasses?.some((sc: any) =>
          sc.stages?.some((s: any) => s.stage_id === stageId && s.applicable)
        )

        const subdeptStages = [...(subdept.stages || [])]
        let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!subdeptStageAllocation) {
          subdeptStageAllocation = { stage_id: stageId, applicable: true, display: true }
          subdeptStages.push(subdeptStageAllocation)
        }
        subdeptStageAllocation.applicable = shouldAllocate || subdeptStages.some(s => s.stage_id === stageId && s.applicable)
        updateData.stages = subdeptStages

      } else if (classIndex !== null) {
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

        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))

        if (!updatedClasses[classIndex].stages) {
          updatedClasses[classIndex].stages = []
        }

        let stageAllocation = updatedClasses[classIndex].stages.find((s: any) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          updatedClasses[classIndex].stages.push(stageAllocation)
        }

        stageAllocation.applicable = shouldAllocate
        if (!shouldAllocate) {
          stageAllocation.display = false
        }

        updateData = { classes: updatedClasses }

        // Also update subdepartment stages
        const subdeptStages = [...(subdept.stages || [])]
        let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!subdeptStageAllocation) {
          subdeptStageAllocation = { stage_id: stageId, applicable: true, display: true }
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

        const subdeptStages = [...(subdept.stages || [])]
        let stageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          subdeptStages.push(stageAllocation)
        }

        stageAllocation.applicable = shouldAllocate
        if (!shouldAllocate) {
          stageAllocation.display = false
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

              if (classIndex !== null && subclassIndex !== null) {
                // Update subclass
                const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))

                if (!updatedClasses[classIndex].subClasses[subclassIndex].stages) {
                  updatedClasses[classIndex].subClasses[subclassIndex].stages = []
                }

                let stageAllocation = updatedClasses[classIndex].subClasses[subclassIndex].stages.find((s: any) => s.stage_id === stageId)
                if (!stageAllocation) {
                  stageAllocation = { stage_id: stageId, applicable: true, display: true }
                  updatedClasses[classIndex].subClasses[subclassIndex].stages.push(stageAllocation)
                }

                stageAllocation.applicable = shouldAllocate
                if (!shouldAllocate) {
                  stageAllocation.display = false
                }

                return {
                  ...subdept,
                  classes: updatedClasses
                }
              } else if (classIndex !== null) {
                // Update class
                const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))

                if (!updatedClasses[classIndex].stages) {
                  updatedClasses[classIndex].stages = []
                }

                let stageAllocation = updatedClasses[classIndex].stages.find((s: any) => s.stage_id === stageId)
                if (!stageAllocation) {
                  stageAllocation = { stage_id: stageId, applicable: true, display: true }
                  updatedClasses[classIndex].stages.push(stageAllocation)
                }

                stageAllocation.applicable = shouldAllocate
                if (!shouldAllocate) {
                  stageAllocation.display = false
                }

                const subdeptStages = [...(subdept.stages || [])]
                let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
                if (!subdeptStageAllocation) {
                  subdeptStageAllocation = { stage_id: stageId, applicable: true, display: true }
                  subdeptStages.push(subdeptStageAllocation)
                }
                subdeptStageAllocation.applicable = shouldAllocate || subdeptStages.some(s => s.stage_id === stageId && s.applicable)

                return {
                  ...subdept,
                  classes: updatedClasses,
                  stages: subdeptStages
                }
              }

              // Update subdepartment
              const subdeptStages = [...(subdept.stages || [])]
              let stageAllocation = subdeptStages.find(s => s.stage_id === stageId)
              if (!stageAllocation) {
                stageAllocation = { stage_id: stageId, applicable: true, display: true }
                subdeptStages.push(stageAllocation)
              }

              stageAllocation.applicable = shouldAllocate
              if (!shouldAllocate) {
                stageAllocation.display = false
              }

              return {
                ...subdept,
                stages: subdeptStages
              }
            }) || []
          }
        })
      )

      toast({
        title: "Success",
        description: `${stageName} has been ${shouldAllocate ? 'applied to' : 'removed from'} ${className ? `${className} in ${subdeptName}` : subdeptName}`,
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

  const handleDisplayToggle = async (
    subdeptId: number,
    stageId: string,
    checked: boolean,
    classIndex: number | null = null,
    subclassIndex: number | null = null
  ) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      let updateData: any = {}
      let subdeptName = ''
      let className = ''
      let stageName = currentDept.stages.find(s => s.id === stageId)?.name || 'this stage'

      if (classIndex !== null && subclassIndex !== null) {
        // Handle subclass display toggle
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept?.classes?.[classIndex]?.subClasses?.[subclassIndex]) {
          toast({
            title: "Error",
            description: "Subclass not found",
            variant: "destructive"
          })
          return
        }

        subdeptName = subdept.name
        className = subdept.classes[classIndex].name
        const subclassName = subdept.classes[classIndex].subClasses[subclassIndex].name

        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))

        if (!updatedClasses[classIndex].subClasses[subclassIndex].stages) {
          updatedClasses[classIndex].subClasses[subclassIndex].stages = []
        }

        let stageAllocation = updatedClasses[classIndex].subClasses[subclassIndex].stages.find((s: any) => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          updatedClasses[classIndex].subClasses[subclassIndex].stages.push(stageAllocation)
        }

        stageAllocation.display = checked
        updateData = { classes: updatedClasses }

      } else if (classIndex !== null) {
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
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
          updatedClasses[classIndex].stages.push(stageAllocation)
        }

        stageAllocation.display = checked
        updateData = { classes: updatedClasses }

        const subdeptStages = [...(subdept.stages || [])]
        let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!subdeptStageAllocation) {
          subdeptStageAllocation = { stage_id: stageId, applicable: true, display: true }
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
          stageAllocation = { stage_id: stageId, applicable: true, display: true }
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

              if (classIndex !== null && subclassIndex !== null) {
                const updatedClasses = [...(subdept.classes || [])]
                if (!updatedClasses[classIndex].subClasses[subclassIndex].stages) {
                  updatedClasses[classIndex].subClasses[subclassIndex].stages = []
                }

                let stageAllocation = updatedClasses[classIndex].subClasses[subclassIndex].stages.find((s: any) => s.stage_id === stageId)
                if (!stageAllocation) {
                  stageAllocation = { stage_id: stageId, applicable: true, display: true }
                  updatedClasses[classIndex].subClasses[subclassIndex].stages.push(stageAllocation)
                }
                stageAllocation.display = checked

                return {
                  ...subdept,
                  classes: updatedClasses
                }
              } else if (classIndex !== null) {
                const updatedClasses = [...(subdept.classes || [])]
                if (!updatedClasses[classIndex].stages) {
                  updatedClasses[classIndex].stages = []
                }

                let stageAllocation = updatedClasses[classIndex].stages.find((s: any) => s.stage_id === stageId)
                if (!stageAllocation) {
                  stageAllocation = { stage_id: stageId, applicable: true, display: true }
                  updatedClasses[classIndex].stages.push(stageAllocation)
                }
                stageAllocation.display = checked

                const subdeptStages = [...(subdept.stages || [])]
                let subdeptStageAllocation = subdeptStages.find(s => s.stage_id === stageId)
                if (!subdeptStageAllocation) {
                  subdeptStageAllocation = { stage_id: stageId, applicable: true, display: true }
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
                stageAllocation = { stage_id: stageId, applicable: true, display: true }
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
      const newStagesData = stages
        .filter(stage => stage.name.trim() !== '')
        .map((stage, index) => {
          if (stage.isSpecial) {
            const timeConfigs = Array.isArray(stage.timeConfigs)
              ? stage.timeConfigs.map(config => ({
                applicationType: config.applicationType || 'Default',
                days: Number(config.days) || 0,
                hours: Number(config.hours) || 0,
                minutes: Number(config.minutes) || 0
              }))
              : [];

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

      const updatedStages = [
        ...currentDept.stages,
        ...newStagesData
      ];

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

      setDepartments(departments.map(dept =>
        dept.id === currentDept.id
          ? { ...dept, stages: updatedStages }
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

  const handleUpdateStage = async (updatedStage: Stage) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      const updatedStages = currentDept.stages.map(s =>
        s.id === updatedStage.id ? updatedStage : s
      )

      const { error } = await supabase
        .from('tm_departments')
        .update({
          stages: updatedStages,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeTab)

      if (error) throw error

      setDepartments(prev => prev.map(dept =>
        dept.id === activeTab
          ? { ...dept, stages: updatedStages }
          : dept
      ))

      toast({
        title: "Success",
        description: "Stage updated successfully",
      })

      setEditingStage(null)
      setIsEditDialogOpen(false)
    } catch (err) {
      console.error('Error updating stage:', err)
      toast({
        title: "Error",
        description: "Failed to update stage. Please try again.",
        variant: "destructive"
      })
    }
  }

  const moveStage = async (stageId: string, direction: 'up' | 'down') => {const currentDept = getCurrentDepartment()
    if (!currentDept) return
 
    const currentStages = JSON.parse(JSON.stringify(currentDept.stages))
    const currentIndex = currentStages.findIndex((s: Stage) => s.id === stageId)
 
    if (currentIndex === -1) return
 
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= currentStages.length) return
 
    const newStages = [...currentStages]
    const [movedStage] = newStages.splice(currentIndex, 1)
    newStages.splice(newIndex, 0, movedStage)
 
    const updatedStages = newStages.map((stage: Stage, index: number) => ({
      ...stage,
      order_num: index + 1
    }))
 
    try {
      const { data: currentDeptData, error: fetchError } = await supabase
        .from('tm_departments')
        .select('*')
        .eq('id', activeTab)
        .single()
 
      if (fetchError) throw fetchError
 
      const { error } = await supabase
        .from('tm_departments')
        .update({
          ...currentDeptData,
          stages: updatedStages,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeTab)
 
      if (error) throw error
 
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
 
  const handleDeleteStage = async (stageId: string) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return
 
      const stageToDelete = currentDept.stages.find(s => s.id === stageId)
      if (!stageToDelete) return
 
      if (stageToDelete.documents) {
        await Promise.all(
          stageToDelete.documents
            .filter(doc => doc.kycId)
            .map(doc => deleteKYCDocument(doc.kycId!))
        )
      }
 
      const updatedStages = currentDept.stages
        .filter(s => s.id !== stageId)
        .map((stage, index) => ({ ...stage, order_num: index + 1 }))
 
      const { error } = await supabase
        .from('tm_departments')
        .update({
          stages: updatedStages,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeTab)
 
      if (error) throw error
 
      setDepartments(prev => prev.map(dept =>
        dept.id === activeTab
          ? { ...dept, stages: updatedStages }
          : dept
      ))
 
      toast({
        title: "Success",
        description: "Stage and associated documents deleted successfully",
      })
    } catch (err) {
      console.error('Error deleting stage:', err)
      toast({
        title: "Error",
        description: "Failed to delete stage. Please try again.",
        variant: "destructive"
      })
    }
  }
 
  const currentDept = getCurrentDepartment()
 
  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>
  if (error) return <div className="text-red-500 p-4">{error}</div>
  if (!currentDept) return <div className="p-4">No department selected</div>
 
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
    <div className="w-full space-y-6 h-screen flex flex-col">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Stages Management</h2>
          <p className="text-muted-foreground">Configure workflow stages and their allocations</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportStages
            currentDept={currentDept}
            disabled={!currentDept || !currentDept.stages || currentDept.stages.length === 0}
          />
 
          <AddStageDialog
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            onAddStages={handleAddStages}
            departments={departmentList}
          />
        </div>
      </div>
 
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
        <TabsList className="w-full mb-4 items-start justify-start overflow-x-auto">
          {departments.map(dept => (
            <TabsTrigger key={dept.id} value={dept.id} className="whitespace-nowrap">
              <div className="flex items-center gap-2">
                <span>{dept.name}</span>
                {/* <Badge variant="secondary" className="text-xs">
                  {dept.stages?.length || 0}
                </Badge> */}
              </div>
            </TabsTrigger>
          ))}
        </TabsList>
 
        {departments.map(dept => (
          <TabsContent key={dept.id} value={dept.id} className="space-y-4 flex-1 flex flex-col">
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
              <div className="relative overflow-auto h-[calc(100vh-210px)] border rounded-lg shadow-lg">
                <Table className="min-w-max">
                  {/* Sticky Headers */}
                  <TableHeader className="sticky top-0 z-50">
                    {/* Stage Names Row */}
                    <TableRow className="bg-blue-600">
                      <TableHead className="sticky left-0 bg-blue-600 border-r-2 border-blue-300 font-bold w-16 z-50 text-center text-white" rowSpan={4}>
                        #
                      </TableHead>
                      <TableHead className="sticky left-16 bg-blue-600 border-r-2 border-blue-300 font-bold w-64 z-50 text-white" rowSpan={4}>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Department / Entity
                        </div>
                      </TableHead>
                      <TableHead className="sticky left-80 bg-blue-600 border-r-2 border-blue-300 z-50 text-white">Stage Name</TableHead>
 
                      {dept.stages.map((stage, index) => (
                        <TableHead
                          key={stage.id}
                          className={cn(
                            "border-r border-blue-300 text-center font-bold text-white min-w-[200px]",
                            getStageHeaderColor(index)
                          )}
                        >
                          <div className="flex flex-col items-center p-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{stage.order_num}. {stage.name}</span>
                            </div>
 
                            <div className="flex items-center gap-2 text-xs">
                              {/* Document Indicator */}
                              {stage.documents && stage.documents.length > 0 && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-5 w-5 p-0 relative bg-purple-600 shadow-sm hover:bg-purple-700">
                                      <FileText className="h-3 w-3 text-white" />
                                      <Badge
                                        variant="secondary"
                                        className="absolute -top-1 -right-1 h-4 w-4 text-xs p-0 flex items-center justify-center rounded-full"
                                      >
                                        <div className="flex items-center justify-center h-full w-full">
                                          {stage.documents.length}
                                        </div>
                                      </Badge>
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-96 max-h-96 overflow-y-auto">
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between">
                                        <h4 className="font-medium">Stage Documents</h4>
                                        <Badge variant="outline" className="text-xs">
                                          {stage.documents.length} document{stage.documents.length > 1 ? 's' : ''}
                                        </Badge>
                                      </div>
 
                                      <div className="space-y-3">
                                        {stage.documents.map((doc, i) => (
                                          <div key={doc.id || i} className="bg-muted/50 p-3 rounded-lg space-y-2">
                                            <div className="flex items-start justify-between">
                                              <div className="space-y-1">
                                                <div className="font-medium flex items-center gap-2">
                                                  <FileText className="h-4 w-4" />
                                                  {doc.name}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <Badge variant={doc.isRequired ? "default" : "secondary"} className="text-xs">
                                                    {doc.isRequired ? "Required" : "Optional"}
                                                  </Badge>
                                                  <Badge variant="outline" className="text-xs">
                                                    {doc.documentType}
                                                  </Badge>
                                                  {doc.inputType && (
                                                    <Badge variant="outline" className="text-xs">
                                                      {doc.inputType}
                                                    </Badge>
                                                  )}
                                                  {doc.kycId && (
                                                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                                      KYC Synced
                                                    </Badge>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
 
                                            {doc.description && (
                                              <div className="text-muted-foreground text-xs">
                                                {doc.description}
                                              </div>
                                            )}
 
                                            {doc.extractionSpecs && doc.extractionSpecs.length > 0 && (
                                              <div className="space-y-2">
                                                <div className="flex items-center gap-1 text-xs font-medium">
                                                  <Info className="h-3 w-3" />
                                                  Extraction Fields ({doc.extractionSpecs.length})
                                                </div>
                                                <div className="grid grid-cols-1 gap-1">
                                                  {doc.extractionSpecs.map((spec, specIndex) => (
                                                    <div key={spec.id || specIndex} className="bg-background p-2 rounded text-xs">
                                                      <div className="flex items-center justify-between">
                                                        <span className="font-medium">{spec.fieldName}</span>
                                                        <div className="flex items-center gap-1">
                                                          <Badge variant="outline" className="text-xs py-0">
                                                            {spec.fieldType}
                                                          </Badge>
                                                          {spec.isRequired && (
                                                            <Badge variant="destructive" className="text-xs py-0">
                                                              Required
                                                            </Badge>
                                                          )}
                                                        </div>
                                                      </div>
                                                      {spec.description && (
                                                        <div className="text-muted-foreground mt-1">
                                                          {spec.description}
                                                        </div>
                                                      )}
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
 
                                      <div className="pt-2 border-t">
                                        <p className="text-xs text-muted-foreground">
                                          Documents are automatically synced with the KYC system when stages are saved.
                                        </p>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
 
                              {/* Special Time Config Indicator */}
                              {stage.isSpecial && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-5 w-5 p-0 bg-orange-500 hover:bg-orange-600 rounded">
                                      <Clock className="h-3 w-3 text-white" />
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
 
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 hover:bg-white/20"
                                  onClick={() => moveStage(stage.id, 'up')}
                                  disabled={stage.order_num === 1}
                                >
                                  <ChevronLeft className="h-3 w-3 text-white" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 hover:bg-white/20"
                                  onClick={() => moveStage(stage.id, 'down')}
                                  disabled={stage.order_num === dept.stages.length}
                                >
                                  <ChevronRight className="h-3 w-3 text-white" />
                                </Button>
 
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 hover:bg-white/20"
                                  onClick={() => setEditingStage(stage)}
                                >
                                  <Pencil className="h-3 w-3 text-white" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
 
                    {/* Duration Row */}
                    <TableRow className="bg-blue-600">
                      <TableHead className="sticky left-80 bg-blue-600 border-r-2 border-blue-300 z-50 text-white">Duration</TableHead>
                      {dept.stages.map((stage, index) => {
                        const { days, hours, minutes } = getTimeFromMinutes(stage.estimated_time)
                        return (
                          <TableHead
                            key={`duration-${stage.id}`}
                            className={cn(
                              "border-r border-blue-300 text-center",
                              getStageHeaderColor(index)
                            )}
                          >
                            <div className="font-mono font-bold text-sm text-white">
                              {days > 0 && `${days}d `}
                              {hours > 0 && `${hours}h `}
                              {minutes > 0 ? `${minutes}m` : ''}
                              {!days && !hours && !minutes && '0m'}
                            </div>
                          </TableHead>
                        )
                      })}
                    </TableRow>
 
                    {/* Follow Up Row */}
                    <TableRow className="bg-blue-600">
                      <TableHead className="sticky left-80 bg-blue-600 border-r-2 border-blue-300 z-50 text-white">Follow Up</TableHead>
                      {dept.stages.map((stage, index) => (
                        <TableHead
                          key={`followup-${stage.id}`}
                          className={cn(
                            "border-r border-blue-300 text-center",
                            getStageHeaderColor(index)
                          )}
                        >
                          <div className="font-bold text-sm text-white">
                            {stage.follow_up || '-'}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
 
                    {/* Applicable/Display Headers Row */}
                    <TableRow className="bg-blue-600">
                      <TableHead className="sticky left-80 bg-blue-600 border-r-2 border-blue-300 z-50"></TableHead>
                      {dept.stages.map((stage, index) => (
                        <TableHead
                          key={`controls-${stage.id}`}
                          className={cn(
                            "border-r border-blue-300",
                            getStageHeaderColor(index)
                          )}
                        >
                          <div className="grid grid-cols-2 gap-1 p-1">
                            <div className="text-center text-xs font-medium text-white">
                              Applicable
                            </div>
                            <div className="text-center text-xs font-medium text-white">
                              Display
                            </div>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
 
                  <TableBody>
                    {normalizedSubdepartments.flatMap((subdept, subdeptIndex) => {
                      const subdeptRowId = `subdept-${subdept.id}`
                      const isExpanded = expandedRows.has(subdeptRowId)
                      const rows = []
                      let rowIndex = subdeptIndex + 1
 
                      const hasClasses = subdept.classes && subdept.classes.length > 0
 
                      rows.push(
                        <TableRow key={subdeptRowId} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="sticky left-0 bg-white border-2 border-gray-300 text-center font-mono text-sm z-30 font-semibold">
                            {rowIndex}
                          </TableCell>
                          <TableCell className="sticky left-16 bg-white border-2 border-gray-300 font-medium z-30">
                            <div className="flex justify-between items-center gap-2">
                              <span className="font-semibold text-gray-900">{subdept.name}</span>
                              {hasClasses && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 hover:bg-blue-100"
                                  onClick={() => toggleRowExpansion(subdeptRowId)}
                                >
                                  {isExpanded ? (
                                    <Minus className="h-4 w-4 text-blue-600" />
                                  ) : (
                                    <Plus className="h-4 w-4 text-blue-600" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="sticky left-80 bg-white border-2 border-gray-300 text-center font-mono text-sm z-30"></TableCell>
                          {dept.stages.map((stage, stageIndex) => {
                            const stageAllocation = subdept.stages?.find(s => s.stage_id === stage.id)
                            const hasAllocation = stageAllocation?.applicable ?? true
                            const hasDisplay = stageAllocation?.display ?? true
 
                            return (
                              <TableCell
                                key={`subdept-${subdept.id}-${stage.id}`}
                                className={cn(
                                  "border-2 border-gray-300 p-0",
                                  getStageColumnColor(stageIndex)
                                )}
                              >
                                {!hasClasses ? (
                                  <div className="grid grid-cols-2 gap-1 p-1">
                                    <div className="flex justify-center">
                                      <div
                                        className="w-full"
                                        data-subdept-id={subdept.id}
                                        data-stage-id={stage.id}
                                        onKeyDown={(e) => handleKeyDown(e, subdept.id, stage.id, !hasAllocation)}
                                      >
                                        <Select
                                          value={hasAllocation ? 'applicable' : 'not-applicable'}
                                          onValueChange={async (value) => {
                                            const newValue = value === 'applicable';
                                            setDepartments(prevDepartments => {
                                              return prevDepartments.map(dept => {
                                                if (dept.id !== activeTab) return dept;
 
                                                return {
                                                  ...dept,
                                                  subdepartments: dept.subdepartments?.map(sd => {
                                                    if (sd.id !== subdept.id) return sd;
 
                                                    const updatedStages = [...(sd.stages || [])];
                                                    let stageAlloc = updatedStages.find(s => s.stage_id === stage.id);
 
                                                    if (!stageAlloc) {
                                                      stageAlloc = { stage_id: stage.id, applicable: newValue, display: newValue };
                                                      updatedStages.push(stageAlloc);
                                                    } else {
                                                      stageAlloc.applicable = newValue;
                                                      if (!newValue) stageAlloc.display = false;
                                                    }
 
                                                    return {
                                                      ...sd,
                                                      stages: updatedStages
                                                    };
                                                  }) || []
                                                };
                                              });
                                            });
 
                                            await handleAllocationChangeInternal(subdept.id, stage.id, newValue);
                                          }}
                                        >
                                          <SelectTrigger
                                            className="h-7 w-full border-0 shadow-none text-xs bg-transparent hover:bg-white/50"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <SelectValue>
                                              <div className="flex items-center gap-1">
                                                <div className={`w-2 h-2 rounded-full ${hasAllocation ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                                <span className="ml-1 font-medium">{hasAllocation ? 'Yes' : 'No'}</span>
                                              </div>
                                            </SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="applicable">
                                              <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                <span>Applicable</span>
                                              </div>
                                            </SelectItem>
                                            <SelectItem value="not-applicable">
                                              <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                                <span>Not Applicable</span>
                                              </div>
                                            </SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                    <div className="flex justify-center items-center">
                                      <Checkbox
                                        checked={hasDisplay}
                                        onCheckedChange={(checked) =>
                                          handleDisplayToggle(subdept.id, stage.id, checked as boolean)
                                        }
                                        disabled={!hasAllocation}
                                        className="h-4 w-4"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center p-2 text-muted-foreground">
                                    -
                                  </div>
                                )}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      )
 
                      // Add class rows if expanded
                      if (isExpanded && hasClasses) {
                        subdept.classes?.forEach((cls, clsIndex) => {
                          const hasSubClasses = cls.subClasses && cls.subClasses.length > 0
                          const classRowId = `class-${subdept.id}-${cls.id}`
                          const isClassExpanded = expandedRows.has(classRowId)
 
                          rows.push(
                            <TableRow key={classRowId} className="bg-blue-50/50 hover:bg-blue-100/50 transition-colors">
                              <TableCell className="sticky left-0 bg-blue-50/50 border-2 border-gray-300 text-center font-mono text-sm z-30 font-semibold">
                                {rowIndex}.{clsIndex + 1}
                              </TableCell>
                              <TableCell className="sticky left-16 bg-blue-50/50 border-2 border-gray-300 pl-8 z-30">
                                <div className="flex justify-between items-center gap-2">
                                  <div className="flex items-center gap-2">
                                    <ChevronRight className="h-3 w-3 text-blue-500" />
                                    <span className="text-blue-700 text-sm font-medium">{cls.name}</span>
                                  </div>
                                  {hasSubClasses && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 hover:bg-blue-200"
                                      onClick={() => toggleRowExpansion(classRowId)}
                                    >
                                      {isClassExpanded ? (
                                        <Minus className="h-3 w-3 text-blue-600" />
                                      ) : (
                                        <Plus className="h-3 w-3 text-blue-600" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
 
                              <TableCell className="sticky left-80 bg-blue-50/50 border-2 border-gray-300 text-center font-mono text-sm z-30"></TableCell>
                              {dept.stages.map((stage, stageIndex) => {
                                const stageAllocation = cls.stages?.find(s => s.stage_id === stage.id)
                                const hasAllocation = stageAllocation?.applicable ?? true
                                const hasDisplay = stageAllocation?.display ?? true
 
                                return (
                                  <TableCell
                                    key={`class-${subdept.id}-${cls.id}-${stage.id}`}
                                    className={cn(
                                      "border-2 border-gray-300 p-0 z-30",
                                      getStageColumnColor(stageIndex)
                                    )}
                                  >
                                    {!hasSubClasses ? (
                                      <div className="grid grid-cols-2 gap-1 p-1">
                                        <div className="flex justify-center">
                                          <Select
                                            value={hasAllocation ? 'applicable' : 'not-applicable'}
                                            onValueChange={(value) =>
                                              handleAllocationChange(subdept.id, stage.id, value === 'applicable', clsIndex)
                                            }
                                          >
                                            <SelectTrigger className="h-7 w-full border-0 shadow-none text-xs bg-transparent hover:bg-white/50">
                                              <SelectValue>
                                                <div className="flex items-center gap-1">
                                                  <div className={`w-2 h-2 rounded-full ${hasAllocation ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                                  <span className="font-medium">{hasAllocation ? 'Yes' : 'No'}</span>
                                                </div>
                                              </SelectValue>
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
                                        </div>
                                        <div className="flex justify-center items-center">
                                          <Checkbox
                                            checked={hasDisplay}
                                            onCheckedChange={(checked) =>
                                              handleDisplayToggle(subdept.id, stage.id, checked as boolean, clsIndex)
                                            }
                                            disabled={!hasAllocation}
                                            className="h-4 w-4"
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center p-2 text-muted-foreground">
                                        -
                                      </div>
                                    )}
                                  </TableCell>
                                )
                              })}
                            </TableRow>
                          )
 
                          // Add subclass rows if class is expanded
                          if (isClassExpanded && hasSubClasses) {
                            cls.subClasses?.forEach((subCls, subClsIndex) => {
                              rows.push(
                                <TableRow key={`subclass-${subdept.id}-${cls.id}-${subCls.id}`} className="bg-purple-50/50 hover:bg-purple-100/50 transition-colors">
                                  <TableCell className="sticky left-0 bg-purple-50/50 border-2 border-gray-300 text-center font-mono text-sm z-30 font-semibold">
                                    {rowIndex}.{clsIndex + 1}.{subClsIndex + 1}
                                  </TableCell>
                                  <TableCell className="sticky left-16 bg-purple-50/50 border-2 border-gray-300 pl-16 z-30">
                                    <div className="flex items-center gap-2">
                                      <ChevronRight className="h-3 w-3 text-blue-500" />
                                      <span className="text-blue-700 text-sm font-medium">{subCls.name}</span>
                                    </div>
                                  </TableCell>
 
                                  <TableCell className="sticky left-80 bg-purple-50/50 border-2 border-gray-300 text-center font-mono text-sm z-30"></TableCell>
                                  {dept.stages.map((stage, stageIndex) => {
                                    const stageAllocation = subCls.stages?.find(s => s.stage_id === stage.id)
                                    const hasAllocation = stageAllocation?.applicable ?? true
                                    const hasDisplay = stageAllocation?.display ?? true
 
                                    return (
                                      <TableCell
                                        key={`subclass-${subdept.id}-${cls.id}-${subCls.id}-${stage.id}`}
                                        className={cn(
                                          "border-2 border-gray-300 p-0",
                                          getStageColumnColor(stageIndex)
                                        )}
                                      >
                                        <div className="grid grid-cols-2 gap-1 p-1">
                                          <div className="flex justify-center">
                                            <Select
                                              value={hasAllocation ? 'applicable' : 'not-applicable'}
                                              onValueChange={(value) =>
                                                handleAllocationChange(subdept.id, stage.id, value === 'applicable', clsIndex, subClsIndex)
                                              }
                                            >
                                              <SelectTrigger className="h-7 w-full border-0 shadow-none text-xs bg-transparent hover:bg-white/50">
                                                <SelectValue>
                                                  <div className="flex items-center gap-1">
                                                    <div className={`w-2 h-2 rounded-full ${hasAllocation ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                                    <span className="font-medium">{hasAllocation ? 'Yes' : 'No'}</span>
                                                  </div>
                                                </SelectValue>
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
                                          </div>
                                          <div className="flex justify-center items-center">
                                            <Checkbox
                                              checked={hasDisplay}
                                              onCheckedChange={(checked) =>
                                                handleDisplayToggle(subdept.id, stage.id, checked as boolean, clsIndex, subClsIndex)
                                              }
                                              disabled={!hasAllocation}
                                              className="h-4 w-4"
                                            />
                                          </div>
                                        </div>
                                      </TableCell>
                                    )
                                  })}
                                </TableRow>
                              )
                            })
                          }
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
        onOpenChange={(open) => {
          if (!open) {
            setEditingStage(null)
            setIsEditDialogOpen(false)
          }
        }}
        stage={editingStage}
        onSave={handleUpdateStage}
      />
    </div>
  )
 }