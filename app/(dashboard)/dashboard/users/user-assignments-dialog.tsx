'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { User, UserRole } from "./database"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

type UserAssignmentsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
  departments: any[]
}

export function UserAssignmentsDialog({ open, onOpenChange, user, departments }: UserAssignmentsDialogProps) {
  if (!user) return null

  // Get all assignments for this user
  const assignments = departments.flatMap(dept => 
    dept.subdepartments
      .filter((subdept: any) => 
        subdept.taskManagerId === user.id || subdept.taskAssistantId === user.id
      )
      .map((subdept: any) => ({
        departmentId: dept.id,
        departmentName: dept.name,
        subdepartmentId: subdept.id,
        subdepartmentName: subdept.name,
        role: subdept.taskManagerId === user.id ? 'Task Manager' : 'Task Assistant'
      }))
  )

  // Group by department
  const assignmentsByDept: {[key: string]: any[]} = {}
  assignments.forEach(assignment => {
    if (!assignmentsByDept[assignment.departmentId]) {
      assignmentsByDept[assignment.departmentId] = []
    }
    assignmentsByDept[assignment.departmentId].push(assignment)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>User Assignments</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {user.name} - {user.email}
          </p>
        </DialogHeader>
        
        <div className="space-y-4">
          {Object.keys(assignmentsByDept).length > 0 ? (
            Object.entries(assignmentsByDept).map(([deptId, deptAssignments]) => {
              const dept = departments.find(d => d.id === deptId)
              return (
                <div key={deptId} className="border rounded-lg p-4">
                  <h3 className="font-medium mb-2">{dept?.name || 'Unknown Department'}</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subdepartment</TableHead>
                        <TableHead>Role</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deptAssignments.map((assignment: any) => (
                        <TableRow key={assignment.subdepartmentId}>
                          <TableCell>{assignment.subdepartmentName}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                              {assignment.role}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )
            })
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No department assignments found for this user.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
