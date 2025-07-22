// @ts-nocheck
'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UserCheck, UserX, History, Pencil, Briefcase, Users } from "lucide-react"
import { User } from "./database"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState } from "react"
import { 
  User, 
  UserRole, 
  StatusHistoryEntry, 
  DepartmentHistoryEntry,
  fetchUsers,
  updateUserStatus,
  getUserStatusHistory
} from "./database"
import { AddOfficerDialog } from "./add-officer-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export interface Officer extends User {
  department_history: DepartmentHistoryEntry[]
  status_history: StatusHistoryEntry[]
}

export function OfficersTable({
  officers: initialOfficers,
  departments,
  refreshKey
}: {
  officers: Officer[]
  departments: Array<{
    id: string
    name: string
    subdepartments: Array<{
      id: string
      name: string
      taskManagerId?: string
      taskAssistantId?: string
    }>
  }>
  refreshKey: number
}) {
  const [officers, setOfficers] = useState<Officer[]>(initialOfficers)
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([])
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [editingOfficer, setEditingOfficer] = useState<Officer | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'active' | 'inactive'>('active')
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)

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
  // Add currentStatus to each officer for easier access
  const officersWithStatus = officers.map(officer => {
    const statusHistory = Array.isArray(officer.status_history) ? officer.status_history : []
    const currentStatus = statusHistory[statusHistory.length - 1]?.status || 'inactive'
    return {
      ...officer,
      currentStatus: currentStatus as 'active' | 'inactive'
    }
  })

  // Filter officers based on active/inactive status
  const activeOfficers = officersWithStatus.filter(officer => officer.currentStatus === 'active')
  const inactiveOfficers = officersWithStatus.filter(officer => officer.currentStatus === 'inactive')

  const filteredOfficers = activeTab === 'active' ? activeOfficers : inactiveOfficers

  // Apply department filter if selected
  const finalFilteredOfficers = selectedDepartment
    ? filteredOfficers.filter(officer =>
      officer.currentDepartmentId?.toString() === selectedDepartment.toString()
    )
    : filteredOfficers

  const handleAddOfficer = () => {
    setIsAddMode(true)
    setEditingOfficer(null)
    setIsDialogOpen(true)
  }

  const handleEditOfficer = (officer: Officer) => {
    const officerWithDepartment = {
      ...officer,
      department_id: officer.currentDepartmentId || '',
      subdepartment_id: null, // This will be set by the dialog based on the department
      department_start_date: officer.departmentStartDate !== 'N/A' ? officer.departmentStartDate : new Date().toISOString().split('T')[0],
      department_end_date: officer.departmentEndDate !== 'Present' && officer.departmentEndDate !== 'N/A'
        ? officer.departmentEndDate
        : undefined,
      start_date: officer.statusStartDate !== 'N/A' ? officer.statusStartDate : new Date().toISOString().split('T')[0],
      end_date: officer.statusEndDate !== 'Present' && officer.statusEndDate !== 'N/A'
        ? officer.statusEndDate
        : undefined,
    };
    
    setEditingOfficer(officerWithDepartment);
    setIsEditDialogOpen(true);
  }

  const handleOfficerUpdated = async () => {
    await refreshOfficers()
    setEditingOfficer(null)
    setIsEditDialogOpen(false)
  }

  const refreshOfficers = async () => {
    try {
      const [active, inactive] = await Promise.all([
        fetchUsers(true),
        fetchUsers(false)
      ])
      const allOfficers = [...active, ...inactive]
        .filter(user => user.role === 'officer')
        .map(officer => ({
          ...officer,
          status_history: Array.isArray(officer.status_history) ? officer.status_history : []
        })) as Officer[]
      setOfficers(allOfficers)
    } catch (error) {
      console.error('Failed to refresh officers:', error)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Officers
            </CardTitle>
            <CardDescription>Manage all officer accounts and their departments.</CardDescription>
          </div>
          <AddOfficerDialog
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            departments={departments}
            onOfficerAdded={async () => {
              await refreshOfficers();
              setIsAddDialogOpen(false);
            }}
          />
          {editingOfficer && (
            <AddOfficerDialog
              open={isEditDialogOpen}
              onOpenChange={setIsEditDialogOpen}
              departments={departments}
              officer={editingOfficer}
              isEditMode={true}
              onOfficerAdded={handleOfficerUpdated}
            />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'active' | 'inactive')}
          className="w-[400px]"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Active Officers
              <span className="ml-1 text-xs text-muted-foreground">
                ({activeOfficers.length})
              </span>
            </TabsTrigger>
            <TabsTrigger value="inactive" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Inactive Officers
              <span className="ml-1 text-xs text-muted-foreground">
                ({inactiveOfficers.length})
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center space-x-2">
          <Tabs
            value={selectedDepartment || 'all'}
            onValueChange={(value) => setSelectedDepartment(value === 'all' ? null : value)}
            className="w-[200px]"
          >
            <TabsList className="">
              <TabsTrigger value="all" className="flex items-center gap-2">
                All Departments
              </TabsTrigger>
              {departments.map((dept) => (
                <TabsTrigger key={dept.id} value={dept.id} className="flex items-center gap-2">
                  {dept.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {finalFilteredOfficers.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground border rounded-lg">
            No {activeTab} officers found in {selectedDepartment ? departments.find(d => d.id === selectedDepartment)?.name || 'selected department' : 'any department'}.
          </div>
        ) : (
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
              {finalFilteredOfficers.map((officer, index) => (
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
                    {officer.currentDepartment}
                  </TableCell>
                  <TableCell>
                    {officer.departmentStartDate}
                  </TableCell>
                  <TableCell>
                    {officer.departmentEndDate}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${officer.currentStatus === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                      {officer.currentStatus?.charAt(0)?.toUpperCase() + officer.currentStatus?.slice(1) || 'Inactive'}
                    </div>
                  </TableCell>
                  <TableCell className="space-x-1">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditOfficer(officer as Officer)}
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
                      {officer.currentStatus === 'active' ? (
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
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}