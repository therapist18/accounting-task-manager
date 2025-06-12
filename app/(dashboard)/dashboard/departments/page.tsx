// @ts-nocheck
"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FolderPlus, Plus, Settings, Users, Clock, AlertTriangle } from "lucide-react"

type User = {
  id: string
  name: string
  email: string
  role: 'admin' | 'task_manager' | 'task_assistant'
}

type Stage = {
  id: string
  name: string
  estimatedTime: number // in hours
  order: number
  taskManagerId?: string
  taskAssistantId?: string
  isActive: boolean
}

type Subdepartment = {
  id: string
  name: string
  stages: Stage[]
  taskManagerId?: string
  taskAssistantId?: string
  processingTime: number // in days
  deliveryTime: number // in days
}

type Department = {
  id: string
  name: string
  subdepartments: Subdepartment[]
}

export default function DepartmentsPage() {
  const [isAddStageOpen, setIsAddStageOpen] = useState(false)
  const [currentSubdept, setCurrentSubdept] = useState<Subdepartment | null>(null)
  
  // Mock users - in a real app, this would come from your database
  const users: User[] = [
    { id: '1', name: 'John Doe', email: 'john@example.com', role: 'task_manager' },
    { id: '2', name: 'Jane Smith', email: 'jane@example.com', role: 'task_assistant' },
    { id: '3', name: 'Mike Johnson', email: 'mike@example.com', role: 'task_manager' },
  ]

  const [departments, setDepartments] = useState<Department[]>([
    {
      id: "1",
      name: "KRA",
      subdepartments: [
        {
          id: "1-1",
          name: "Tax Returns",
          stages: [
            { id: '1-1-1', name: 'Document Collection', estimatedTime: 24, order: 1, isActive: true },
            { id: '1-1-2', name: 'Data Entry', estimatedTime: 8, order: 2, isActive: false },
            { id: '1-1-3', name: 'Review', estimatedTime: 4, order: 3, isActive: false },
          ],
          processingTime: 2,
          deliveryTime: 5
        },
        // ... other subdepartments with stages
      ],
    },
    // ... other departments
  ])


  const handleAddStage = (subdept: Subdepartment) => {
    setCurrentSubdept(subdept)
    setIsAddStageOpen(true)
  }

  const handleSaveStage = (stageData: Omit<Stage, 'id' | 'order' | 'isActive'>) => {
    if (!currentSubdept) return
    
    const newStage: Stage = {
      ...stageData,
      id: `${currentSubdept.id}-${currentSubdept.stages.length + 1}`,
      order: currentSubdept.stages.length + 1,
      isActive: false
    }

    const updatedDepartments = departments.map(dept => ({
      ...dept,
      subdepartments: dept.subdepartments.map(subdept => {
        if (subdept.id === currentSubdept.id) {
          return {
            ...subdept,
            stages: [...subdept.stages, newStage]
          }
        }
        return subdept
      })
    }))


    setDepartments(updatedDepartments)
    setIsAddStageOpen(false)
  }

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Departments & Workflows</h2>
          <p className="text-sm text-muted-foreground">
            Manage departments, subdepartments, and their workflow stages
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button>
            <FolderPlus className="mr-2 h-4 w-4" />
            Add Department
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Departments</CardTitle>
          <CardDescription>Manage departments and their subdepartments.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {departments.map((dept) => (
              <AccordionItem key={dept.id} value={dept.id}>
                <AccordionTrigger className="hover:bg-muted/50 px-4 py-2 rounded-md">
                  <div className="flex items-center justify-between w-full pr-4">
                    <span>{dept.name}</span>
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pl-4 pr-2 pt-2">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm font-medium">Subdepartments</h4>
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Subdepartment
                      </Button>
                    </div>
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[200px]">Subdepartment</TableHead>
                            <TableHead>Task Manager</TableHead>
                            <TableHead>Task Assistant</TableHead>
                            <TableHead>Processing Time</TableHead>
                            <TableHead>Delivery Time</TableHead>
                            <TableHead>Stages</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dept.subdepartments.map((subdept) => (
                            <TableRow key={subdept.id}>
                              <TableCell className="font-medium">{subdept.name}</TableCell>
                              <TableCell>
                                <Select defaultValue={subdept.taskManagerId}>
                                  <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select manager" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {users.filter(u => u.role === 'task_manager').map(user => (
                                      <SelectItem key={user.id} value={user.id}>
                                        {user.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Select defaultValue={subdept.taskAssistantId}>
                                  <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select assistant" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {users.filter(u => u.role === 'task_assistant').map(user => (
                                      <SelectItem key={user.id} value={user.id}>
                                        {user.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>{subdept.processingTime} days</TableCell>
                              <TableCell>{subdept.deliveryTime} days</TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm text-muted-foreground">
                                    {subdept.stages.length} stages
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleAddStage(subdept)}
                                  >
                                    <Plus className="h-4 w-4 mr-1" />
                                    Add Stage
                                  </Button>
                                </div>
                                {subdept.stages.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {subdept.stages.map(stage => (
                                      <div
                                        key={stage.id}
                                        className="flex items-center justify-between p-2 text-sm rounded border"
                                      >
                                        <div className="flex items-center space-x-2">
                                          <div className={`w-2 h-2 rounded-full ${
                                            stage.isActive ? 'bg-green-500' : 'bg-gray-300'
                                          }`} />
                                          <span>{stage.name}</span>
                                          <span className="text-xs text-muted-foreground flex items-center">
                                            <Clock className="h-3 w-3 mr-1" />
                                            {stage.estimatedTime}h
                                          </span>
                                          {stage.isActive && (
                                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full flex items-center">
                                              <AlertTriangle className="h-3 w-3 mr-1" />
                                              Active
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex space-x-2">
                                          <Button variant="ghost" size="sm" className="h-6">
                                            <Users className="h-3 w-3" />
                                          </Button>
                                          <Button variant="ghost" size="sm" className="h-6">
                                            <Settings className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex space-x-2">
                                  <Button variant="ghost" size="sm">
                                    <Users className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm">
                                    <Settings className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
      {/* Add Stage Dialog */}
      <Dialog open={isAddStageOpen} onOpenChange={setIsAddStageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Stage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stageName">Stage Name</Label>
              <Input id="stageName" placeholder="e.g., Document Review" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimatedTime">Estimated Time (hours)</Label>
              <Input
                id="estimatedTime"
                type="number"
                min="1"
                placeholder="e.g., 8"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setIsAddStageOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const name = (document.getElementById('stageName') as HTMLInputElement).value
                  const estimatedTime = parseInt((document.getElementById('estimatedTime') as HTMLInputElement).value || '8')
                  handleSaveStage({ name, estimatedTime })
                }}
              >
                Add Stage
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
