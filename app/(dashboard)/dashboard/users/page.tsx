//@ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Users, Briefcase } from "lucide-react"
import { TaskAssignmentDialog } from "@/components/task-assignment-dialog"
import {
  fetchUsers,
  updateUserStatus,
  type User,
  type StatusHistoryEntry,
  getUserStatusHistory,
  type UserRole,
  type DepartmentHistoryEntry
} from './database'
import { OfficersTable, type Officer } from "./officers-table"
import { UsersTable } from "./users-table"
import { fetchDepartments } from '../departments/database'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AddUserDialog } from "./add-user-dialog"
import { AddOfficerDialog } from "./add-officer-dialog"

export default function UsersPage() {
  const [activeUsers, setActiveUsers] = useState<User[]>([])
  const [inactiveUsers, setInactiveUsers] = useState<User[]>([])
  const [activeOfficers, setActiveOfficers] = useState<Officer[]>([])
  const [inactiveOfficers, setInactiveOfficers] = useState<Officer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([])
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [departments, setDepartments] = useState<Array<{
    id: string
    name: string
    subdepartments: Array<{
      id: string
      name: string
      taskManagerId?: string
      taskAssistantId?: string
    }>
  }>>([])
  const [userAssignments, setUserAssignments] = useState<{ [key: string]: { departments: string[], subdepartments: string[] } }>({})
  const [assignmentsDialogOpen, setAssignmentsDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [activeTab, setActiveTab] = useState<'users' | 'officers'>('users')
  const [activeStatusTab, setActiveStatusTab] = useState<'active' | 'inactive'>('active')
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refreshUsers = async () => {
    try {
      const [active, inactive] = await Promise.all([
        fetchUsers(true),
        fetchUsers(false)
      ])
      setActiveUsers(active.filter(user => user.role !== 'officer'))
      setInactiveUsers(inactive.filter(user => user.role !== 'officer'))
      
      // Cast to Officer type for TypeScript
      const activeOfficers = active.filter(user => user.role === 'officer') as Officer[]
      const inactiveOfficers = inactive.filter(user => user.role === 'officer') as Officer[]
      
      setActiveOfficers(activeOfficers)
      setInactiveOfficers(inactiveOfficers)
      setRefreshKey(prev => prev + 1)
    } catch (error) {
      console.error('Failed to refresh users:', error)
    }
  }

  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      try {
        const [allActive, allInactive, depts] = await Promise.all([
          fetchUsers(true),
          fetchUsers(false),
          fetchDepartments()
        ])

        setDepartments(depts)

        // Separate users and officers with proper typing
        const active = allActive.filter(user => user.role !== 'officer')
        const inactive = allInactive.filter(user => user.role !== 'officer')
        const activeOfficers = allActive.filter(user => user.role === 'officer') as Officer[]
        const inactiveOfficers = allInactive.filter(user => user.role === 'officer') as Officer[]

        // Process user assignments
        const assignments: { [key: string]: { departments: string[], subdepartments: string[] } } = {}

          // Initialize assignments for all users and officers
          ;[...allActive, ...allInactive].forEach(user => {
            assignments[user.id] = { departments: [], subdepartments: [] }
          })

        // Process department assignments
        depts.forEach(dept => {
          dept.subdepartments.forEach(subdept => {
            if (subdept.taskManagerId && assignments[subdept.taskManagerId]) {
              assignments[subdept.taskManagerId].departments = [
                ...new Set([...assignments[subdept.taskManagerId].departments, dept.id])
              ]
              assignments[subdept.taskManagerId].subdepartments = [
                ...new Set([...assignments[subdept.taskManagerId].subdepartments, subdept.id])
              ]
            }
            if (subdept.taskAssistantId && assignments[subdept.taskAssistantId]) {
              assignments[subdept.taskAssistantId].departments = [
                ...new Set([...assignments[subdept.taskAssistantId].departments, dept.id])
              ]
              assignments[subdept.taskAssistantId].subdepartments = [
                ...new Set([...assignments[subdept.taskAssistantId].subdepartments, subdept.id])
              ]
            }
          })
        })

        setUserAssignments(assignments)
        setActiveUsers(active)
        setInactiveUsers(inactive)
        setActiveOfficers(activeOfficers)
        setInactiveOfficers(inactiveOfficers)
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  const handleStatusChange = async (userId: string | number, makeActive: boolean) => {
    try {
      // In a real app, you would get the current user's ID from your auth context
      const currentUserId = 'system' // Replace with actual user ID from auth
      await updateUserStatus(
        userId.toString(), 
        makeActive, 
        currentUserId, 
        makeActive ? 'User reactivated by admin' : 'User deactivated by admin'
      )

      // Refresh the user lists
      await refreshUsers()
    } catch (error) {
      console.error('Failed to update user status:', error)
    }
  }

  const handleViewHistory = async (userId: string | number) => {
    try {
      const history = await getUserStatusHistory(userId.toString())
      setStatusHistory(history)
      setHistoryDialogOpen(true)
    } catch (error) {
      console.error('Failed to fetch status history:', error)
    }
  }

  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  const handleEditUser = (user: User | Officer) => {
    // Ensure we have a fresh copy of the user with their status history
    setEditingUser({
      ...user,
      status_history: Array.isArray(user.status_history)
        ? [...user.status_history]
        : [],
      department_history: 'department_history' in user 
        ? [...(user as Officer).department_history]
        : []
    })
    setIsEditDialogOpen(true)
  }

  const handleUserUpdated = () => {
    refreshUsers()
    setEditingUser(null)
    setIsEditDialogOpen(false)
  }

  const renderUserRow = (user: User, isActive: boolean, index: number) => {
    const statusHistory = Array.isArray(user.status_history) ? user.status_history : []
    const lastStatusChange = statusHistory[statusHistory.length - 1]
    const assignments = userAssignments[user.id] || { departments: [], subdepartments: [] }
    const departmentHistory = Array.isArray(user.department_history) ? user.department_history : []
    
    // Filter by selected department if viewing officers
    if (activeTab === 'officers' && selectedDepartment) {
      const userDepartments = departmentHistory.map(d => d.department_id)
      if (!userDepartments.includes(selectedDepartment)) {
        return null
      }
    }

    // Get current department assignment for officers
    const currentDepartment = departmentHistory.length > 0 
      ? departments.find(d => d.id === departmentHistory[0].department_id)
      : null

    // Format dates for display
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

    // Get the current status dates
    const currentStatus = statusHistory.length > 0
      ? statusHistory[statusHistory.length - 1]
      : null

    const startDate = currentStatus?.start_date || user.start_date
    const endDate = currentStatus?.end_date || user.end_date

    const getDepartmentName = (id: string) => {
      const dept = departments.find(d => d.id === id)
      return dept?.name || 'Unknown Department'
    }

    const getSubdepartmentName = (id: string) => {
      for (const dept of departments) {
        const subdept = dept.subdepartments?.find((s: any) => s.id === id)
        if (subdept) return subdept.name
      }
      return 'Unknown Subdepartment'
    }

    return (
      <TableRow key={`${user.id}-${refreshKey}`} className="border-b">
        <TableCell className="font-medium w-12 text-center">{index + 1}</TableCell>
        <TableCell className="font-medium">
          {user.name || `User ${user.id}`}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {user.email || 'N/A'}
        </TableCell>
        {activeTab === 'officers' ? (
          <>
            <TableCell>
              {currentDepartment?.name || 'N/A'}
            </TableCell>
            <TableCell>
              {departmentHistory[0]?.start_date ? formatDate(departmentHistory[0].start_date) : 'N/A'}
            </TableCell>
            <TableCell>
              {departmentHistory[0]?.end_date ? formatDate(departmentHistory[0].end_date) : 'Present'}
            </TableCell>
          </>
        ) : (
          <>
            <TableCell className="capitalize">
              {user.role.replace(/_/g, ' ')}
            </TableCell>
            <TableCell>
              {lastStatusChange?.start_date ? new Date(lastStatusChange.start_date).toLocaleDateString() : 'N/A'}
            </TableCell>
            <TableCell>
              {lastStatusChange?.end_date ? new Date(lastStatusChange.end_date).toLocaleDateString() : 'N/A'}
            </TableCell>
          </>
        )}
        <TableCell>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
            {isActive ? 'Active' : 'Inactive'}
          </div>
        </TableCell>
        <TableCell className="space-x-1">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleEditUser(user)}
              title="Edit user"
              className="h-8 w-8 p-0"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleViewHistory(user.id)}
              title="View history"
              className="h-8 w-8 p-0"
            >
              <History className="h-4 w-4" />
            </Button>
            {isActive ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleStatusChange(user.id, false)}
                title="Deactivate user"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              >
                <UserX className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleStatusChange(user.id, true)}
                title="Reactivate user"
                className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
              >
                <UserCheck className="h-4 w-4" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    )
  }

  if (isLoading) {
    return <div>Loading users...</div>
  }

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2">
            {activeTab === 'officers' ? (
              <AddOfficerDialog onOfficerAdded={refreshUsers} />
            ) : (
              <AddUserDialog
                defaultRole="user"
                onUserAdded={refreshUsers}
                isEditMode={false}
              />
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value as 'users' | 'officers')
            setSelectedDepartment(null)
          }}
          className="space-y-4"
        >
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="officers">Officers</TabsTrigger>
          </TabsList>
          
          {activeTab === 'officers' && departments.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">Departments</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={!selectedDepartment ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedDepartment(null)}
                >
                  All Departments
                </Button>
                {departments.map((dept) => (
                  <Button
                    key={dept.id}
                    variant={selectedDepartment === dept.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedDepartment(dept.id)}
                  >
                    {dept.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <Tabs
            value={activeStatusTab}
            onValueChange={(value) => setActiveStatusTab(value as 'active' | 'inactive')}
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="active">Active {activeTab === 'users' ? 'Users' : 'Officers'}</TabsTrigger>
              <TabsTrigger value="inactive">Inactive {activeTab === 'users' ? 'Users' : 'Officers'}</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Active {activeTab === 'users' ? 'Users' : 'Officers'}</CardTitle>
                  <CardDescription>Manage your active {activeTab} accounts.</CardDescription>
                </CardHeader>
                <CardContent>
                  {activeTab === 'users' ? (
                    <UsersTable
                      users={activeUsers}
                      isActive={true}
                      onStatusChange={handleStatusChange}
                      onViewHistory={handleViewHistory}
                      onEditUser={handleEditUser}
                      refreshKey={refreshKey}
                    />
                  ) : (
                    <OfficersTable
                      officers={activeOfficers}
                      isActive={true}
                      departments={departments}
                      onStatusChange={handleStatusChange}
                      onViewHistory={handleViewHistory}
                      onEditUser={handleEditUser}
                      selectedDepartment={selectedDepartment}
                      refreshKey={refreshKey}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="inactive" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Inactive {activeTab === 'users' ? 'Users' : 'Officers'}</CardTitle>
                  <CardDescription>View and manage inactive {activeTab} accounts.</CardDescription>
                </CardHeader>
                <CardContent>
                  {activeTab === 'users' ? (
                    <UsersTable
                      users={inactiveUsers}
                      isActive={false}
                      onStatusChange={handleStatusChange}
                      onViewHistory={handleViewHistory}
                      onEditUser={handleEditUser}
                      refreshKey={refreshKey}
                    />
                  ) : (
                    <OfficersTable
                      officers={inactiveOfficers}
                      isActive={false}
                      departments={departments}
                      onStatusChange={handleStatusChange}
                      onViewHistory={handleViewHistory}
                      onEditUser={handleEditUser}
                      selectedDepartment={selectedDepartment}
                      refreshKey={refreshKey}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </Tabs>

        {/* Edit User Dialog */}
        {editingUser && (
          <AddUserDialog
            user={editingUser}
            isEditMode={true}
            onUserAdded={handleUserUpdated}
            defaultRole={editingUser.role as UserRole}
          />
        )}
      </div>

      {/* Edit User Dialog */}
      {editingUser && (
        <AddUserDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          user={editingUser}
          isEditMode={true}
          onUserAdded={() => {
            refreshUsers()
            setEditingUser(null)
            setIsEditDialogOpen(false)
          }}
        />
      )}

      {/* Status History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>User Status History</DialogTitle>
            <DialogDescription>
              History of status changes for this user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <div className="absolute left-4 top-0 h-full w-0.5 bg-border" />
              <div className="space-y-4">
                {statusHistory.map((entry, index) => (
                  <div key={index} className="relative flex items-start gap-4">
                    <div className="absolute left-4 mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                    <div className="ml-8 flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Status changed to <span className="capitalize">{entry.status}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.changed_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Changed by: {entry.changed_by}
                        {entry.reason && (
                          <div className="mt-1 text-xs">
                            <span className="font-medium">Reason:</span> {entry.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {statusHistory.length === 0 && (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    No status history available
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}