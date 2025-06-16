// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Pencil, Info, ChevronUp, ChevronDown } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { supabase } from "@/lib/supabase/client"
import { AddStageDialog } from "./add-stage-dialog"
import { EditStageDialog } from "./edit-stage-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

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
const formatTime = (minutes: number | null): string => {
  if (minutes === null || isNaN(minutes)) return '0m'
  const days = Math.floor(minutes / (60 * 24))
  const hours = Math.floor((minutes % (60 * 24)) / 60)
  const mins = minutes % 60

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`)

  return parts.join(' ')
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
          stages: dept.stages ? (Array.isArray(dept.stages) ? dept.stages.sort((a,b) => a.order_num - b.order_num) : []) : [],
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
          stageAllocation = { stage_id: stageId, allocated: false, display: false }
          subdeptStages.push(stageAllocation)
        }
        stageAllocation.allocated = shouldAllocate
        if (!shouldAllocate) {
          stageAllocation.display = false
        }
        updateData = { stages: subdeptStages }
      }

      const { error } = await supabase.from('tm_subdepartments').update(updateData).eq('id', subdeptId)
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
                if (!updatedClasses[classIndex].stages) updatedClasses[classIndex].stages = []
                let sa = updatedClasses[classIndex].stages.find(s => s.stage_id === stageId)
                if (!sa) {
                  sa = { stage_id: stageId, allocated: shouldAllocate, display: false }
                  updatedClasses[classIndex].stages.push(sa)
                } else {
                  sa.allocated = shouldAllocate
                  if (!shouldAllocate) sa.display = false
                }
                return { ...subdept, classes: updatedClasses }
              } else {
                const updatedStages = [...(subdept.stages || [])]
                let sa = updatedStages.find(s => s.stage_id === stageId)
                if (!sa) {
                  sa = { stage_id: stageId, allocated: shouldAllocate, display: false }
                  updatedStages.push(sa)
                } else {
                  sa.allocated = shouldAllocate
                  if (!shouldAllocate) sa.display = false
                }
                return { ...subdept, stages: updatedStages }
              }
            }) || []
          }
        })
      )

      toast({
        title: "Success",
        description: `${stageName} has been ${shouldAllocate ? 'allocated to' : 'removed from'} ${className ? `${className} in ${subdeptName}` : subdeptName}`,
      })
    } catch (err) {
      console.error('Error updating allocation:', err)
      toast({ title: "Error", description: "Failed to update allocation.", variant: "destructive" })
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
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept?.classes?.[classIndex]) return;
        subdeptName = subdept.name
        className = subdept.classes[classIndex].name
        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))
        if (!updatedClasses[classIndex].stages) updatedClasses[classIndex].stages = []
        let stageAllocation = updatedClasses[classIndex].stages.find(s => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, allocated: true, display: checked } // Assume allocated if display is toggled
          updatedClasses[classIndex].stages.push(stageAllocation)
        }
        stageAllocation.display = checked
        updateData = { classes: updatedClasses }
      } else {
        const subdept = currentDept.subdepartments?.find(sd => sd.id === subdeptId)
        if (!subdept) return;
        subdeptName = subdept.name
        const subdeptStages = [...(subdept.stages || [])]
        let stageAllocation = subdeptStages.find(s => s.stage_id === stageId)
        if (!stageAllocation) {
          stageAllocation = { stage_id: stageId, allocated: true, display: checked }
          subdeptStages.push(stageAllocation)
        }
        stageAllocation.display = checked
        updateData = { stages: subdeptStages }
      }

      const { error } = await supabase.from('tm_subdepartments').update(updateData).eq('id', subdeptId)
      if (error) throw error

      setDepartments(prevDepartments =>
        prevDepartments.map(dept => {
          if (dept.id !== activeTab) return dept
          return {
            ...dept,
            subdepartments: dept.subdepartments?.map(subdept => {
              if (subdept.id !== subdeptId) return subdept
              if (classIndex !== null) {
                const updatedClasses = JSON.parse(JSON.stringify(subdept.classes))
                if (!updatedClasses[classIndex].stages) updatedClasses[classIndex].stages = []
                let sa = updatedClasses[classIndex].stages.find(s => s.stage_id === stageId)
                if (!sa) {
                   updatedClasses[classIndex].stages.push({ stage_id: stageId, allocated: true, display: checked })
                } else {
                   sa.display = checked
                }
                return { ...subdept, classes: updatedClasses }
              } else {
                const updatedStages = [...(subdept.stages || [])]
                let sa = updatedStages.find(s => s.stage_id === stageId)
                if (!sa) {
                  updatedStages.push({ stage_id: stageId, allocated: true, display: checked })
                } else {
                  sa.display = checked
                }
                return { ...subdept, stages: updatedStages }
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
      toast({ title: "Error", description: "Failed to update display setting.", variant: "destructive" })
    }
  }

  const handleAddStages = async (stages: any[], departmentId: string) => {
    const currentDept = departments.find(d => d.id === departmentId)
    if (!currentDept) {
      toast({ title: "Error", description: "Department not found.", variant: "destructive" })
      return
    }
    try {
      const highestOrderNum = Math.max(0, ...currentDept.stages.map(s => s.order_num))
      const newStagesData = stages
        .filter(stage => stage.name.trim() !== '')
        .map((stage, index) => ({
          ...stage,
          estimated_time: (stage.days * 24 * 60) + (stage.hours * 60) + stage.minutes,
          order_num: highestOrderNum + index + 1,
          follow_up: stage.followUp === 'none' ? null : stage.followUp
        }))

      if (newStagesData.length === 0) {
        toast({ title: "No valid stages to add", variant: "destructive" })
        return
      }
      
      const updatedStages = [...currentDept.stages, ...newStagesData]

      const { error } = await supabase
        .from('tm_departments')
        .update({ stages: updatedStages, updated_at: new Date().toISOString() })
        .eq('id', currentDept.id)

      if (error) throw error

      setDepartments(departments.map(dept =>
        dept.id === currentDept.id ? { ...dept, stages: updatedStages.sort((a,b) => a.order_num - b.order_num) } : dept
      ))
      setIsDialogOpen(false)
      toast({ title: "Success", description: `Added ${newStagesData.length} stage(s).` })
    } catch (err) {
      console.error('Error adding stages:', err)
      toast({ title: "Error", description: "Failed to add stages.", variant: "destructive" })
    }
  }

  const handleUpdateStage = async (updatedStage: Stage) => {
    try {
      const currentDept = getCurrentDepartment()
      if (!currentDept) return

      const updatedStages = currentDept.stages.map(s => s.id === updatedStage.id ? updatedStage : s)

      const { error } = await supabase
        .from('tm_departments')
        .update({ stages: updatedStages, updated_at: new Date().toISOString() })
        .eq('id', activeTab)

      if (error) throw error

      setDepartments(prev => prev.map(dept =>
        dept.id === activeTab ? { ...dept, stages: updatedStages.sort((a,b) => a.order_num - b.order_num) } : dept
      ))
      toast({ title: "Success", description: "Stage updated successfully" })
      setEditingStage(null)
    } catch (err) {
      console.error('Error updating stage:', err)
      toast({ title: "Error", description: "Failed to update stage.", variant: "destructive" })
    }
  }
  
  const moveStage = async (stageId: string, direction: 'up' | 'down') => {
    const currentDept = getCurrentDepartment()
    if (!currentDept) return

    const stages = [...currentDept.stages]
    const currentIndex = stages.findIndex(s => s.id === stageId)
    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= stages.length) return

    // Swap order numbers
    const tempOrder = stages[currentIndex].order_num
    stages[currentIndex].order_num = stages[newIndex].order_num
    stages[newIndex].order_num = tempOrder

    try {
      const { error } = await supabase
        .from('tm_departments')
        .update({ stages, updated_at: new Date().toISOString() })
        .eq('id', activeTab)
      if (error) throw error

      setDepartments(prev => prev.map(dept =>
        dept.id === activeTab ? { ...dept, stages: stages.sort((a,b) => a.order_num - b.order_num) } : dept
      ))
    } catch (err) {
      console.error('Error moving stage:', err)
      toast({ title: "Error", description: "Failed to move stage.", variant: "destructive" })
    }
  }

  const currentDept = getCurrentDepartment()

  if (loading) return <div>Loading...</div>
  if (error) return <div className="text-red-500">{error}</div>
  if (!currentDept) return <div>No department selected or department has no data.</div>

  // Ensure we always have at least one subdepartment for rendering, even if it's a dummy one
  const normalizedSubdepartments = currentDept.subdepartments && currentDept.subdepartments.length > 0
    ? currentDept.subdepartments
    : [{ id: -1, name: 'N/A (No subdepartments configured)', department_id: currentDept.id, stages: [], hasClasses: false, classes: [] }]

  // Stages sorted by order_num
  const sortedStages = currentDept.stages; // Already sorted on fetch/update

  let rowIndex = 0;

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Stages Configuration</h2>
        <AddStageDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onAddStages={handleAddStages}
          departments={departmentList}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <EditStageDialog
          open={!!editingStage}
          onOpenChange={(open) => !open && setEditingStage(null)}
          stage={editingStage}
          onSave={handleUpdateStage}
        />
        <TabsList className="w-full mb-4 items-start justify-start">
          {departments.map(dept => (
            <TabsTrigger key={dept.id} value={dept.id}>{dept.name}</TabsTrigger>
          ))}
        </TabsList>

        {departments.map(dept => (
          <TabsContent key={dept.id} value={dept.id} className="space-y-4">
            <div className="relative overflow-auto border rounded-lg max-h-[calc(100vh-250px)]">
              <Table className="min-w-max">
                <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-20 w-12 text-center">#</TableHead>
                    <TableHead className="sticky left-12 bg-background z-20 w-48">Subdepartment</TableHead>
                    <TableHead className="sticky left-60 bg-background z-20 w-48">Class</TableHead>
                    
                    {sortedStages.map((stage, stageIndex) => (
                      <TableHead key={stage.id} className="w-48 border-l">
                        <div className="flex flex-col gap-2 p-2">
                           <div className="flex items-center justify-between font-bold text-base">
                             <span>{stage.name}</span>
                              <div className="flex items-center">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingStage(stage)}><Pencil className="h-4 w-4" /></Button>
                                <div className="flex flex-col">
                                   <button onClick={() => moveStage(stage.id, 'up')} disabled={stageIndex === 0} className="p-0.5 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                                   <button onClick={() => moveStage(stage.id, 'down')} disabled={stageIndex === sortedStages.length - 1} className="p-0.5 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                                </div>
                              </div>
                           </div>
                           <div className="flex items-center gap-2 text-sm text-muted-foreground font-normal">
                             <span>Time:</span>
                             {stage.isSpecial ? (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-6 p-1 text-blue-500 font-semibold">
                                       Special <Info className="h-3 w-3 ml-1" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-80">
                                    <div className="space-y-2">
                                      <h4 className="font-medium">Special Stage Requirements</h4>
                                      <p className="text-sm text-muted-foreground">Time varies by application type:</p>
                                      {stage.timeConfigs?.map((config, i) => (
                                        <div key={i} className="bg-muted/50 p-2 rounded text-sm">
                                          <div className="font-medium">{config.applicationType || 'Default'}</div>
                                          <div>{formatTime((config.days * 1440) + (config.hours * 60) + config.minutes)}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              ) : (
                                <span>{formatTime(stage.estimated_time)}</span>
                              )}
                           </div>
                           <div className="text-sm text-muted-foreground font-normal">
                             Follow-up: {stage.follow_up || 'None'}
                           </div>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                
                <TableBody>
                  {normalizedSubdepartments.map(subdept => {
                    if (subdept.hasClasses && subdept.classes.length > 0) {
                      return subdept.classes.map((cls, clsIndex) => {
                        rowIndex++;
                        return (
                          <TableRow key={`${subdept.id}-${clsIndex}`}>
                            <TableCell className="sticky left-0 bg-background z-10 text-center">{rowIndex}</TableCell>
                            <TableCell className="sticky left-12 bg-background z-10 font-medium">{subdept.name}</TableCell>
                            <TableCell className="sticky left-60 bg-background z-10">{cls.name}</TableCell>
                            {sortedStages.map(stage => {
                              const stageAllocation = cls.stages?.find(s => s.stage_id === stage.id)
                              const isAllocated = stageAllocation?.allocated || false
                              const isDisplayed = stageAllocation?.display || false
                              return (
                                <TableCell key={stage.id} className="border-l">
                                  <div className="flex flex-col gap-2 items-center">
                                    <Select value={isAllocated ? 'allocated' : 'not-allocated'} onValueChange={(value) => handleAllocationChange(subdept.id, stage.id, value === 'allocated', clsIndex)}>
                                      <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="allocated">Allocated</SelectItem>
                                        <SelectItem value="not-allocated">Not Allocated</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <div className="flex items-center space-x-2">
                                      <Checkbox id={`display-${subdept.id}-${clsIndex}-${stage.id}`} checked={isDisplayed} onCheckedChange={(checked) => handleDisplayToggle(subdept.id, stage.id, !!checked, clsIndex)} disabled={!isAllocated} />
                                      <label htmlFor={`display-${subdept.id}-${clsIndex}-${stage.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Display</label>
                                    </div>
                                  </div>
                                </TableCell>
                              )
                            })}
                          </TableRow>
                        )
                      })
                    } else {
                      rowIndex++;
                      return (
                         <TableRow key={subdept.id}>
                            <TableCell className="sticky left-0 bg-background z-10 text-center">{rowIndex}</TableCell>
                            <TableCell className="sticky left-12 bg-background z-10 font-medium">{subdept.name}</TableCell>
                            <TableCell className="sticky left-60 bg-background z-10 text-muted-foreground">
                                {subdept.id === -1 ? '' : '(All)'}
                            </TableCell>
                            {sortedStages.map(stage => {
                              const stageAllocation = subdept.stages?.find(s => s.stage_id === stage.id)
                              const isAllocated = stageAllocation?.allocated || false
                              const isDisplayed = stageAllocation?.display || false
                              return (
                                <TableCell key={stage.id} className="border-l">
                                  <div className="flex flex-col gap-2 items-center">
                                      <Select value={isAllocated ? 'allocated' : 'not-allocated'} onValueChange={(value) => handleAllocationChange(subdept.id, stage.id, value === 'allocated', null)}>
                                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="allocated">Allocated</SelectItem>
                                          <SelectItem value="not-allocated">Not Allocated</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <div className="flex items-center space-x-2">
                                        <Checkbox id={`display-${subdept.id}-${stage.id}`} checked={isDisplayed} onCheckedChange={(checked) => handleDisplayToggle(subdept.id, stage.id, !!checked, null)} disabled={!isAllocated} />
                                        <label htmlFor={`display-${subdept.id}-${stage.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Display</label>
                                      </div>
                                  </div>
                                </TableCell>
                              )
                            })}
                         </TableRow>
                      )
                    }
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}