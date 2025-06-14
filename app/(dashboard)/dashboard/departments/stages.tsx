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
import { useToast } from "@/components/ui/use-toast"
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
  stages?: number[]
  display_stages?: number[]
}

type Subdepartment = {
  id: number
  name: string
  department_id: number
  stages?: number[]
  display_stages?: number[]
  classes?: SubdepartmentClass[]
  tm_subdepartments?: any // For the raw data from Supabase
  hasClasses: boolean
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
  const [newStage, setNewStage] = useState<{ name: string, estimated_time: number }>({ name: '', estimated_time: 0 })
  const { toast } = useToast()

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
  const handleAllocationChange = async (subdeptId: number, stageId: number, shouldAllocate: boolean, classIndex: number | null = null) => {
    try {
      let updateData;
      let subdeptName = '';
      let className = '';
      let stageName = stages.find(s => s.id === stageId)?.name || 'this stage';

      if (classIndex !== null) {
        // Handle class allocation
        const subdept = departments
          .flatMap(d => d.subdepartments || [])
          .find(sd => sd.id === subdeptId);

        if (!subdept?.classes?.[classIndex]) {
          toast({
            title: "Error",
            description: "Class not found",
            variant: "destructive"
          });
          return;
        }

        subdeptName = subdept.name;
        className = subdept.classes[classIndex].name;
        
        // Create a deep copy of the classes array
        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes));
        
        // Update the specific class
        if (shouldAllocate) {
          // Add to stages if not already present
          if (!updatedClasses[classIndex].stages) {
            updatedClasses[classIndex].stages = [];
          }
          if (!updatedClasses[classIndex].stages.includes(stageId)) {
            updatedClasses[classIndex].stages.push(stageId);
          }
          // Also add to display_stages if not already present
          if (!updatedClasses[classIndex].display_stages) {
            updatedClasses[classIndex].display_stages = [];
          }
          if (!updatedClasses[classIndex].display_stages.includes(stageId)) {
            updatedClasses[classIndex].display_stages.push(stageId);
          }
        } else {
          // Remove from stages and display_stages
          updatedClasses[classIndex].stages = (updatedClasses[classIndex].stages || []).filter((id: number) => id !== stageId);
          updatedClasses[classIndex].display_stages = (updatedClasses[classIndex].display_stages || []).filter((id: number) => id !== stageId);
        }

        // Prepare the update data for Supabase
        updateData = { 
          classes: updatedClasses,
          // Also update the subdepartment's stages to keep them in sync
          stages: shouldAllocate
            ? [...new Set([...(subdept.stages || []), stageId])]
            : (subdept.stages || []).filter(id => id !== stageId)
        };
      } else {
        // Handle subdepartment allocation
        const subdept = departments
          .flatMap(d => d.subdepartments || [])
          .find(sd => sd.id === subdeptId);

        if (!subdept) {
          toast({
            title: "Error",
            description: "Subdepartment not found",
            variant: "destructive"
          });
          return;
        }

        subdeptName = subdept.name;
        
        // Create a deep copy of the subdepartment
        const updatedSubdept = JSON.parse(JSON.stringify(subdept));
        
        if (shouldAllocate) {
          // Add to stages if not already present
          if (!updatedSubdept.stages) {
            updatedSubdept.stages = [];
          }
          if (!updatedSubdept.stages.includes(stageId)) {
            updatedSubdept.stages.push(stageId);
          }
          // Also add to display_stages if not already present
          if (!updatedSubdept.display_stages) {
            updatedSubdept.display_stages = [];
          }
          if (!updatedSubdept.display_stages.includes(stageId)) {
            updatedSubdept.display_stages.push(stageId);
          }
        } else {
          // Remove from stages and display_stages
          updatedSubdept.stages = (updatedSubdept.stages || []).filter((id: number) => id !== stageId);
          updatedSubdept.display_stages = (updatedSubdept.display_stages || []).filter((id: number) => id !== stageId);
        }
        
        updateData = {
          stages: updatedSubdept.stages,
          display_stages: updatedSubdept.display_stages
        };
      }

      // Update in Supabase
      const { error } = await supabase
        .from('tm_subdepartments')
        .update(updateData)
        .eq('id', subdeptId);

      if (error) throw error;

      // Update local state
      setDepartments(prevDepartments =>
        prevDepartments.map(dept => ({
          ...dept,
          subdepartments: dept.subdepartments?.map(subdept => {
            if (subdept.id !== subdeptId) return subdept;

            if (classIndex !== null) {
              const updatedClasses = [...(subdept.classes || [])];
              const updatedStages = shouldAllocate
                ? [...new Set([...(updatedClasses[classIndex]?.stages || []), stageId])]
                : (updatedClasses[classIndex]?.stages || []).filter(id => id !== stageId);
                
              updatedClasses[classIndex] = {
                ...updatedClasses[classIndex],
                stages: updatedStages,
                // If we're allocating, also add to display_stages by default
                ...(shouldAllocate && {
                  display_stages: [...new Set([...(updatedClasses[classIndex]?.display_stages || []), stageId])]
                })
              };
              
              return { 
                ...subdept, 
                classes: updatedClasses,
                // Also update the subdepartment's stages to keep them in sync
                stages: [...new Set([
                  ...(subdept.stages || []),
                  ...(shouldAllocate ? [stageId] : [])
                ])].filter(id => shouldAllocate || id !== stageId)
              };
            }

            const updatedStages = shouldAllocate
              ? [...new Set([...(subdept.stages || []), stageId])]
              : (subdept.stages || []).filter(id => id !== stageId);
              
            return {
              ...subdept,
              stages: updatedStages,
              // If we're allocating, also add to display_stages by default
              ...(shouldAllocate && {
                display_stages: [...new Set([...(subdept.display_stages || []), stageId])]
              })
            };
          }) || []
        }))
      );

      // Show success toast
      toast({
        title: "Success",
        description: `${stageName} has been ${shouldAllocate ? 'allocated to' : 'removed from'} ${className ? `${className} in ${subdeptName}` : subdeptName}`,
      });
    } catch (err) {
      console.error('Error updating allocation:', err);
      toast({
        title: "Error",
        description: "Failed to update allocation. Please try again.",
        variant: "destructive"
      });
    }
  }

  // Handle display toggle
  const handleDisplayToggle = async (subdeptId: number, stageId: number, checked: boolean, classIndex: number | null = null) => {
    try {
      let updateData;
      let subdeptName = '';
      let className = '';
      let stageName = stages.find(s => s.id === stageId)?.name || 'this stage';

      if (classIndex !== null) {
        // Handle class display toggle
        const subdept = departments
          .flatMap(d => d.subdepartments || [])
          .find(sd => sd.id === subdeptId);

        if (!subdept?.classes?.[classIndex]) {
          toast({
            title: "Error",
            description: "Class not found",
            variant: "destructive"
          });
          return;
        }

        subdeptName = subdept.name;
        className = subdept.classes[classIndex].name;
        
        // Create a deep copy of the classes array
        const updatedClasses = JSON.parse(JSON.stringify(subdept.classes));
        
        // Update the specific class's display_stages
        if (checked) {
          if (!updatedClasses[classIndex].display_stages) {
            updatedClasses[classIndex].display_stages = [];
          }
          if (!updatedClasses[classIndex].display_stages.includes(stageId)) {
            updatedClasses[classIndex].display_stages.push(stageId);
          }
        } else {
          updatedClasses[classIndex].display_stages = 
            (updatedClasses[classIndex].display_stages || []).filter((id: number) => id !== stageId);
        }

        updateData = { 
          classes: updatedClasses,
          // Also update the subdepartment's display_stages to keep them in sync
          display_stages: checked
            ? [...new Set([...(subdept.display_stages || []), stageId])]
            : (subdept.display_stages || []).filter(id => id !== stageId)
        };
      } else {
        // Handle subdepartment display toggle
        const subdept = departments
          .flatMap(d => d.subdepartments || [])
          .find(sd => sd.id === subdeptId);

        if (!subdept) {
          toast({
            title: "Error",
            description: "Subdepartment not found",
            variant: "destructive"
          });
          return;
        }

        subdeptName = subdept.name;
        
        // Create a deep copy of the subdepartment
        const updatedSubdept = JSON.parse(JSON.stringify(subdept));
        
        // Update display_stages
        if (checked) {
          if (!updatedSubdept.display_stages) {
            updatedSubdept.display_stages = [];
          }
          if (!updatedSubdept.display_stages.includes(stageId)) {
            updatedSubdept.display_stages.push(stageId);
          }
        } else {
          updatedSubdept.display_stages = 
            (updatedSubdept.display_stages || []).filter((id: number) => id !== stageId);
        }
        
        updateData = {
          display_stages: updatedSubdept.display_stages
        };
      }

      // Update in Supabase
      const { error } = await supabase
        .from('tm_subdepartments')
        .update(updateData)
        .eq('id', subdeptId);

      if (error) throw error;

      // Update local state
      setDepartments(prevDepartments =>
        prevDepartments.map(dept => ({
          ...dept,
          subdepartments: dept.subdepartments?.map(subdept => {
            if (subdept.id !== subdeptId) return subdept;

            if (classIndex !== null) {
              const updatedClasses = [...(subdept.classes || [])];
              updatedClasses[classIndex] = {
                ...updatedClasses[classIndex],
                display_stages: checked
                  ? [...new Set([...(updatedClasses[classIndex]?.display_stages || []), stageId])]
                  : (updatedClasses[classIndex]?.display_stages || []).filter(id => id !== stageId)
              };
              
              return { 
                ...subdept, 
                classes: updatedClasses,
                // Also update the subdepartment's display_stages to keep them in sync
                display_stages: [...new Set([
                  ...(subdept.display_stages || []),
                  ...(checked ? [stageId] : [])
                ])].filter(id => checked || id !== stageId)
              };
            }

            return {
              ...subdept,
              display_stages: checked
                ? [...new Set([...(subdept.display_stages || []), stageId])]
                : (subdept.display_stages || []).filter(id => id !== stageId)
            };
          }) || []
        }))
      );

      // Show success toast
      toast({
        title: "Success",
        description: `Display setting updated for ${stageName} in ${className ? `${className} (${subdeptName})` : subdeptName}`,
      });
    } catch (err) {
      console.error('Error updating display setting:', err);
      toast({
        title: "Error",
        description: "Failed to update display setting. Please try again.",
        variant: "destructive"
      });
    }
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
      setNewStage({ name: '', estimated_time: 0 })
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

  // Ensure we always have at least one subdepartment for each department
  const normalizedDepartments = departments.map(dept => {
    // If no subdepartments, create a default one
    const hasSubdepartments = dept.subdepartments && dept.subdepartments.length > 0;
    const subdepartments = hasSubdepartments
      ? dept.subdepartments
      : [{
        id: dept.id * -1, // Use negative ID to avoid conflicts
        name: 'N/A',
        department_id: dept.id,
        stages: [],
        hasClasses: false,
        classes: []
      }];

    return {
      ...dept,
      subdepartments: subdepartments.map(sd => ({
        ...sd,
        hasClasses: (sd.classes?.length || 0) > 0,
        classes: sd.classes?.length ? sd.classes : []
      }))
    };
  });

  return (
    <div className="w-full">
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
                  onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
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
                  onChange={(e) => setNewStage({ ...newStage, estimated_time: parseInt(e.target.value) || 0 })}
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

      <div className="relative overflow-auto max-h-[calc(100vh-200px)]">
        <Table className="border min-w-max">
          <TableHeader className="sticky top-0 bg-background z-10">
            {/* Department Header Row */}
            <TableRow className="bg-muted/50">
              <TableHead rowSpan={3} className="sticky left-0 bg-background border-r font-bold w-12 z-20">#</TableHead>
              <TableHead rowSpan={3} colSpan={2} className="sticky left-12 bg-background border-r font-bold w-48 z-20 text-center">Stage Details</TableHead>
              {normalizedDepartments.map(dept => {
                const colSpan = getDepartmentColSpan(dept) * 2; // *2 for allocated/display columns
                return (
                  <TableHead
                    key={`dept-${dept.id}`}
                    colSpan={colSpan}
                    className="border-l border-r text-center font-bold bg-muted/30"
                  >
                    {dept.name}
                  </TableHead>
                );
              })}
            </TableRow>

            {/* Subdepartment Header Row */}
            <TableRow className="bg-muted/20">
              {normalizedDepartments.flatMap(dept =>
                dept.subdepartments.flatMap((subdept, subIndex) => {
                  const colSpan = getSubdepartmentColSpan(subdept) * 2; // *2 for allocated/display
                  return (
                    <TableHead
                      key={`subdept-${subdept.id}-${subIndex}`}
                      colSpan={colSpan}
                      className={`${subIndex === 0 ? 'border-l' : ''} border-r text-center`}
                    >
                      {subdept.name}
                    </TableHead>
                  );
                })
              )}
            </TableRow>

            {/* Class Header Row */}
            <TableRow className="bg-muted/10">
              {normalizedDepartments.flatMap(dept =>
                dept.subdepartments.flatMap(subdept =>
                  subdept.hasClasses
                    ? subdept.classes.map((cls, clsIndex) => (
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
                )
              )}
            </TableRow>

            {/* Allocate/Display Header Row */}
            <TableRow>
              <TableHead className="sticky left-0 bg-background border-r z-20">
                <div className="text-center">#</div>
              </TableHead>
              <TableHead className="sticky left-12 bg-background border-r z-20">
                <div className="text-center">Stage Name</div>
              </TableHead>
              <TableHead className="sticky left-60 bg-background border-r z-20">
                <div className="text-center">Time (mins)</div>
              </TableHead>
              {normalizedDepartments.flatMap(dept =>
                dept.subdepartments.flatMap(subdept =>
                  subdept.hasClasses
                    ? subdept.classes.map((cls, clsIndex) => (
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
                )
              )}
            </TableRow>
          </TableHeader>

          <TableBody>
            {stages.map((stage, index) => (
              <TableRow key={stage.id}>
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
                    <input
                      type="number"
                      className="w-full bg-transparent border-none focus:ring-1 focus:ring-ring rounded px-2 py-1 text-center"
                      value={stage.estimated_time || ''}
                      onChange={(e) => handleUpdateStage(stage, { estimated_time: Number(e.target.value) })}
                      placeholder="Mins"
                    />
                  </div>
                </TableCell>
                {normalizedDepartments.flatMap(dept =>
                  dept.subdepartments.flatMap(subdept => {
                    if (subdept.hasClasses) {
                      return subdept.classes.map((cls, clsIndex) => {
                        const hasAllocation = cls.stages?.includes(stage.id) || false;

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
                                  checked={cls.display_stages?.includes(stage.id) || false}
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
                      const hasAllocation = subdept.stages?.includes(stage.id) || false;

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
                                checked={subdept.display_stages?.includes(stage.id) || false}
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
                  })
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
