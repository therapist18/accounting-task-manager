// @ts-nocheck
'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { UserCheck, UserX, History, Pencil } from "lucide-react"
import { useState } from "react"
import { User, UserRole, type StatusHistoryEntry, type DepartmentHistoryEntry } from "./database"
import { AddOfficerDialog } from "./add-officer-dialog"

export interface Officer extends User {
  department_history: DepartmentHistoryEntry[]
  status_history: StatusHistoryEntry[]
}

export function OfficersTable({
  officers,
  isActive,
  departments,
  onStatusChange,
  onViewHistory,
  onEditUser,
  selectedDepartment,
  refreshKey
}: {
  officers: Officer[]
  isActive: boolean
  departments: any[]
  onStatusChange: (userId: string, makeActive: boolean) => Promise<void>
  onViewHistory: (userId: string) => Promise<void>
  onEditUser: (user: Officer) => void
  selectedDepartment: string | null
  refreshKey: number
}) {
  const [editingOfficer, setEditingOfficer] = useState<Officer | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch (e) {
      return 'Invalid Date'
    }
  }

  // Get current department assignment for each officer
  const officersWithDepartments = officers.map(officer => {
    // Ensure department_history is an array and sort by assigned_at date (newest first)
    const sortedDeptHistory = Array.isArray(officer.department_history) 
      ? [...officer.department_history].sort((a, b) => 
          new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()
        )
      : []
    
    // Get current department assignment (most recent with no end date or latest end date in future)
    const now = new Date()
    const currentDeptAssignment = sortedDeptHistory.find(dept => 
      !dept.end_date || new Date(dept.end_date) >= now
    ) || sortedDeptHistory[0] || null

    // Get status history
    const sortedStatusHistory = Array.isArray(officer.status_history)
      ? [...officer.status_history].sort((a, b) => 
          new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
        )
      : []
    
    const currentStatus = sortedStatusHistory[0] || { status: 'inactive' }

    // Find department with type-safe comparison
    const department = currentDeptAssignment 
      ? departments.find(d => d.id.toString() === currentDeptAssignment.department_id.toString())
      : null

    return {
      ...officer,
      currentDepartment: department?.name || 'Unassigned',
      departmentStartDate: currentDeptAssignment?.start_date || 'N/A',
      departmentEndDate: currentDeptAssignment?.end_date || 'Present',
      currentDepartmentId: currentDeptAssignment?.department_id || null,
      currentStatus: currentStatus.status,
      statusStartDate: currentStatus.start_date || 'N/A',
      statusEndDate: currentStatus.end_date || 'Present'
    }
  })

  // Filter officers by selected department if specified
  const filteredOfficers = selectedDepartment
    ? officersWithDepartments.filter(officer => 
        officer.currentDepartmentId?.toString() === selectedDepartment.toString()
      )
    : officersWithDepartments

  if (filteredOfficers.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No {isActive ? 'active' : 'inactive'} officers found{selectedDepartment ? ' in this department' : ''}.
      </div>
    )
  }

  const handleEditOfficer = (officer: Officer) => {
    setEditingOfficer({
      ...officer,
      department_id: officer.currentDepartmentId || '',
      department_start_date: officer.departmentStartDate !== 'N/A' ? officer.departmentStartDate : new Date().toISOString().split('T')[0],
      department_end_date: officer.departmentEndDate !== 'Present' && officer.departmentEndDate !== 'N/A' 
        ? officer.departmentEndDate 
        : undefined,
      start_date: officer.statusStartDate !== 'N/A' ? officer.statusStartDate : new Date().toISOString().split('T')[0],
      end_date: officer.statusEndDate !== 'Present' && officer.statusEndDate !== 'N/A' 
        ? officer.statusEndDate 
        : undefined,
    })
    setIsEditDialogOpen(true)
  }

  const handleOfficerUpdated = () => {
    setIsEditDialogOpen(false)
    setEditingOfficer(null)
  }

  return (
    <>
      {editingOfficer && (
        <AddOfficerDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          officer={editingOfficer}
          onOfficerAdded={handleOfficerUpdated}
          departments={departments}
        />
      )}
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Dept. Start Date</TableHead>
          <TableHead>Dept. End Date</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-40">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredOfficers.map((officer, index) => {
          // Get department history for the history view
          const departmentHistory = Array.isArray(officer.department_history) 
            ? [...officer.department_history].sort((a, b) => 
                new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()
              )
            : []
          
          // Get status history for the history view
          const statusHistory = Array.isArray(officer.status_history)
            ? [...officer.status_history].sort((a, b) => 
                new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
              )
            : []
          
          // Get current department info with type-safe comparison
          const currentDepartment = departmentHistory.find(dept => 
            !dept.end_date || new Date(dept.end_date) >= new Date()
          ) || departmentHistory[0] || {}
          
          // Find department by ID with type conversion for comparison
          const department = departments.find(d => 
            d.id.toString() === (officer.currentDepartmentId?.toString() || '')
          )
          const departmentName = department?.name || 'Unassigned'
          
          // Prepare department history with names for display
          const departmentHistoryWithNames = departmentHistory.map(entry => ({
            ...entry,
            departmentName: departments.find(d => d.id.toString() === entry.department_id.toString())?.name || 'Unknown Department'
          }))

          return (
            <TableRow key={`${officer.id}-${refreshKey}`}>
              <TableCell className="font-medium w-12 text-center">{index + 1}</TableCell>
              <TableCell className="font-medium">
                {officer.name || `Officer ${officer.id}`}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {officer.email || 'N/A'}
              </TableCell>
              <TableCell className="capitalize">
                {officer.role.replace(/_/g, ' ')}
              </TableCell>
              <TableCell>
                {departmentName}
              </TableCell>
              <TableCell>
                {officer.departmentStartDate !== 'N/A' ? formatDate(officer.departmentStartDate) : 'N/A'}
              </TableCell>
              <TableCell>
                {officer.departmentEndDate !== 'Present' && officer.departmentEndDate !== 'N/A' 
                  ? formatDate(officer.departmentEndDate) 
                  : officer.departmentEndDate}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span 
                    className={`h-2 w-2 rounded-full ${
                      officer.currentStatus === 'active' ? 'bg-green-500' : 'bg-gray-400'
                    }`} 
                  />
                  {officer.currentStatus === 'active' ? 'Active' : 'Inactive'}
                </div>
              </TableCell>
              <TableCell className="space-x-1">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEditOfficer(officer)}
                    title="Edit officer"
                    className="h-8 w-8 p-0"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onViewHistory(officer.id)}
                    title="View history"
                    className="h-8 w-8 p-0"
                  >
                    <History className="h-4 w-4" />
                  </Button>
                  {isActive ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onStatusChange(officer.id, false)}
                      title="Deactivate officer"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <UserX className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onStatusChange(officer.id, true)}
                      title="Reactivate officer"
                      className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                    >
                      <UserCheck className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
      </Table>
    </>
  )
}
