// @ts-nocheck
"use client"

import React, { useState, useEffect } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Plus, Pencil } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Stage = {
  id: number
  name: string
  order_num: number
  estimated_time: number | null
  created_at: string
  updated_at: string
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
}

type Subdepartment = {
  id: number
  name: string
  department_id: number
  stages?: number[]
  classes?: SubdepartmentClass[]
  tm_subdepartments?: any // For the raw data from Supabase
}

type Department = {
  id: number
  name: string
  tm_subdepartments?: Subdepartment[]
  subdepartments?: Subdepartment[]
}

export default function Stages() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingStage, setEditingStage] = useState<Stage | null>(null)
  const [newStage, setNewStage] = useState<{name: string, estimated_time: number}>({name: '', estimated_time: 0})

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        
        // Fetch departments with their subdepartments
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
        
        // Fetch all stages
        const { data: stagesData, error: stagesError } = await supabase
          .from('tm_stages')
          .select('*')
          .order('order_num')
          
        if (stagesError) throw stagesError

        // Transform the data to ensure consistent structure
        const transformedDepartments = (deptsData || []).map(dept => ({
          ...dept,
          subdepartments: (dept.tm_subdepartments || []).map((subdept: any) => ({
            ...subdept,
            stages: Array.isArray(subdept.stages) ? subdept.stages : [],
            classes: Array.isArray(subdept.classes) ? subdept.classes : []
          }))
        }))
        
        setDepartments(transformedDepartments)
        setStages(stagesData || [])
      } catch (err) {
        console.error('Error fetching data:', err)
        setError('Failed to load data. Please try again.')
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
  }, [])

  // Create a map of stage IDs to stage objects for quick lookup
  const stagesMap = new Map(stages.map(stage => [stage.id, stage]))

  // Handle allocation change
  const handleAllocationChange = (subdeptId: number, stageId: number, shouldAllocate: boolean) => {
    setDepartments(prevDepartments => 
      prevDepartments.map(dept => ({
        ...dept,
        subdepartments: dept.subdepartments?.map(subdept => 
          subdept.id === subdeptId
            ? {
                ...subdept,
                stages: shouldAllocate 
                  ? [...new Set([...(subdept.stages || []), stageId])] // Ensure unique
                  : (subdept.stages || []).filter(id => id !== stageId)
              }
            : subdept
        ) || []
      }))
    )
  }

  // Handle display toggle
  const handleDisplayToggle = (subdeptId: number, stageId: number, checked: boolean) => {
    // This is a placeholder - implement the actual logic based on your requirements
    console.log(`Display toggled for subdept ${subdeptId}, stage ${stageId}: ${checked}`)
  }

  if (loading) return <div>Loading...</div>
  if (error) return <div className="text-red-500">{error}</div>

  // Calculate column spans for department and subdepartment headers
  const getDepartmentColSpan = (dept: Department) => {
    return (dept.subdepartments || []).reduce((total, subdept) => {
      return total + ((subdept.classes?.length || 0) || 1) // At least 1 if no classes
    }, 0)
  }

  const getSubdepartmentColSpan = (subdept: Subdepartment) => {
    return (subdept.classes?.length || 0) || 1 // At least 1 if no classes
  }

  // Function to add a new stage
  const handleAddStage = async () => {
    try {
      if (!newStage.name.trim()) return
      
      const { data: addedStage, error } = await supabase
        .from('tm_stages')
        .insert([
          { 
            name: newStage.name,
            estimated_time: newStage.estimated_time,
            order_num: stages.length > 0 ? Math.max(...stages.map(s => s.order_num)) + 1 : 1
          }
        ])
        .select()
        .single()
      
      if (error) throw error
      
      setStages(prev => [...prev, addedStage])
      setNewStage({name: '', estimated_time: 0})
      setIsDialogOpen(false)
    } catch (err) {
      console.error('Error adding stage:', err)
      alert('Failed to add stage. Please try again.')
    }
  }

  // Function to update a stage
  const handleUpdateStage = async (stage: Stage, updates: Partial<Stage>) => {
    try {
      const { data: updatedStage, error } = await supabase
        .from('tm_stages')
        .update(updates)
        .eq('id', stage.id)
        .select()
        .single()
      
      if (error) throw error
      
      setStages(prev => prev.map(s => s.id === stage.id ? updatedStage : s))
    } catch (err) {
      console.error('Error updating stage:', err)
      alert('Failed to update stage. Please try again.')
    }
  }

  return (
    <div className="w-full overflow-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Stages Configuration</h3>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Stage
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Stage</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                  Name
                </Label>
                <Input
                  id="name"
                  value={newStage.name}
                  onChange={(e) => setNewStage({...newStage, name: e.target.value})}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="time" className="text-right">
                  Time (mins)
                </Label>
                <Input
                  id="time"
                  type="number"
                  value={newStage.estimated_time || ''}
                  onChange={(e) => setNewStage({...newStage, estimated_time: parseInt(e.target.value) || 0})}
                  className="col-span-3"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddStage}>
                  Add Stage
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="overflow-x-auto">
        <Table className="border min-w-max">
          <TableHeader className="sticky top-0 bg-background z-10">
            {/* Department Header Row */}
            <TableRow className="bg-muted/50">
              <TableHead rowSpan={3} className="border-r font-bold w-12">#</TableHead>
              <TableHead rowSpan={3} className="border-r font-bold min-w-[200px]">Stage Details</TableHead>
              {departments.map(dept => (
                <TableHead 
                  key={`dept-${dept.id}`}
                  colSpan={getDepartmentColSpan(dept) * 2} // *2 for allocated/display columns
                  className="border-l border-r text-center font-bold bg-muted/30"
                >
                  {dept.name}
                </TableHead>
              ))}
            </TableRow>
            
            {/* Subdepartment Header Row */}
            <TableRow className="bg-muted/20">
              {departments.flatMap(dept => 
                (dept.subdepartments || []).flatMap(subdept => 
                  Array(getSubdepartmentColSpan(subdept)).fill(0).map((_, i) => (
                    <TableHead 
                      key={`subdept-${subdept.id}-${i}`} 
                      colSpan={2} // *2 for allocated/display columns
                      className={`${i === 0 ? 'border-l' : ''} border-r text-center`}
                    >
                      {i === 0 ? subdept.name : ''}
                    </TableHead>
                  ))
                )
              )}
            </TableRow>
            
            {/* Class Header Row */}
            <TableRow className="bg-muted/10">
              {departments.flatMap(dept => 
                (dept.subdepartments || []).flatMap(subdept => 
                  (subdept.classes && subdept.classes.length > 0 
                    ? subdept.classes 
                    : [{}] // Default empty class if none exist
                  ).map((cls, i) => (
                    <React.Fragment key={`class-${subdept.id}-${i}`}>
                      <TableHead className="border text-center" colSpan={2}>
                        {cls.name || 'All'}
                      </TableHead>
                    </React.Fragment>
                  ))
                )
              )}
            </TableRow>

            {/* Allocated/Display Header Row */}
            <TableRow>
              <TableHead className="border-r" rowSpan={2}>
                <div className="text-center">#</div>
              </TableHead>
              <TableHead className="border-r" colSpan={2}>
                <div className="text-center">Stage Details</div>
              </TableHead>
              {departments.flatMap(dept => 
                (dept.subdepartments || []).flatMap(subdept => 
                  (subdept.classes && subdept.classes.length > 0 
                    ? subdept.classes 
                    : [{}]
                  ).flatMap((_, i) => [
                    <TableHead key={`alloc-${subdept.id}-${i}`} className="border text-center">
                      Allocate
                    </TableHead>,
                    <TableHead key={`disp-${subdept.id}-${i}`} className="border text-center">
                      Display
                    </TableHead>
                  ])
                )
              )}
            </TableRow>
            <TableRow>
              <TableHead className="border-r text-center">
                Name
              </TableHead>
              <TableHead className="border-r text-center">
                Time (mins)
              </TableHead>
              {departments.flatMap(dept => 
                (dept.subdepartments || []).flatMap(subdept => 
                  (subdept.classes && subdept.classes.length > 0 
                    ? subdept.classes 
                    : [{}]
                  ).flatMap((_, i) => [
                    <TableHead key={`alloc2-${subdept.id}-${i}`} className="border text-center">
                      
                    </TableHead>,
                    <TableHead key={`disp2-${subdept.id}-${i}`} className="border text-center">
                      
                    </TableHead>
                  ])
                )
              )}
            </TableRow>
          </TableHeader>
        
        <TableBody>
          {stages.map((stage, index) => (
            <TableRow key={stage.id}>
              <TableCell className="border-r text-center">
                {index + 1}
              </TableCell>
              <TableCell className="border-r p-0">
                <div className="grid grid-cols-2 divide-x divide-border">
                  <div className="p-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        className="w-full bg-transparent border-none focus:ring-1 focus:ring-ring rounded px-2 py-1"
                        value={stage.name}
                        onChange={(e) => handleUpdateStage(stage, { name: e.target.value })}
                      />
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="p-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="w-full bg-transparent border-none focus:ring-1 focus:ring-ring rounded px-2 py-1"
                        value={stage.estimated_time || ''}
                        onChange={(e) => handleUpdateStage(stage, { estimated_time: parseInt(e.target.value) || 0 })}
                        placeholder="0"
                      />
                      <span className="text-xs text-muted-foreground">mins</span>
                    </div>
                  </div>
                </div>
              </TableCell>
              
              {departments.flatMap(dept => 
                (dept.subdepartments || []).flatMap(subdept => 
                  (subdept.classes && subdept.classes.length > 0 
                    ? subdept.classes 
                    : [{}]
                  ).map((cls, i) => {
                    const isAllocated = subdept.stages?.includes(stage.id) || false
                    return (
                      <React.Fragment key={`cell-${subdept.id}-${i}-${stage.id}`}>
                        <TableCell className="border p-0">
                          <Select
                            value={isAllocated ? 'allocated' : 'not-allocated'}
                            onValueChange={(value) => 
                              handleAllocationChange(subdept.id, stage.id, value === 'allocated')
                            }
                          >
                            <SelectTrigger className="border-0 focus:ring-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="allocated">Allocate</SelectItem>
                              <SelectItem value="not-allocated">Not Allocated</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="border p-0">
                          <div className="flex items-center justify-center h-full">
                            <Checkbox 
                              checked={isAllocated}
                              onCheckedChange={(checked) => 
                                handleDisplayToggle(subdept.id, stage.id, checked === true)
                              }
                              disabled={!isAllocated}
                              className="border-gray-300"
                            />
                          </div>
                        </TableCell>
                      </React.Fragment>
                    )
                  })
                )
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  )
}
