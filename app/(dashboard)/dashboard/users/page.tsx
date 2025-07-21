//@ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Users, Briefcase, History, Pencil, UserX, UserCheck } from "lucide-react"
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
import { fetchDepartments } from '../departments/departments/database'
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
  const [activeTab, setActiveTab] = useState<'active-users' | 'inactive-users' | 'active-officers' | 'inactive-officers'>('active-users')
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

  // Helper function to get the current tab context
  const getCurrentTabInfo = () => {
    const isOfficerTab = activeTab.includes('officers')
    const isActiveTab = activeTab.includes('active')
    return { isOfficerTab, isActiveTab }
  }

  const { isOfficerTab, isActiveTab } = getCurrentTabInfo()

  if (isLoading) {
    return <div>Loading users...</div>
  }

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
        <div className="flex items-center space-x-2">
          {isOfficerTab ? (
            <AddOfficerDialog onOfficerAdded={refreshUsers} departments={departments} />
          ) : (
            <AddUserDialog
              defaultRole="user"
              onUserAdded={refreshUsers}
              isEditMode={false}
            />
          )}
        </div>
      </div>

      <div className="space-y-4">
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="officers">Officers</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Tabs defaultValue='active-users' className="space-y-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="active-users" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Active Users
                </TabsTrigger>
                <TabsTrigger value="inactive-users" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Inactive Users
                </TabsTrigger>
              </TabsList>
              {/* Active Users Tab */}
              <TabsContent value="active-users" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Active Users
                      <span className="text-sm font-normal text-muted-foreground">
                        ({activeUsers.length})
                      </span>
                    </CardTitle>
                    <CardDescription>Manage your active user accounts.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <UsersTable
                      users={activeUsers}
                      isActive={true}
                      onStatusChange={handleStatusChange}
                      onViewHistory={handleViewHistory}
                      onEditUser={handleEditUser}
                      refreshKey={refreshKey}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Inactive Users Tab */}
              <TabsContent value="inactive-users" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Inactive Users
                      <span className="text-sm font-normal text-muted-foreground">
                        ({inactiveUsers.length})
                      </span>
                    </CardTitle>
                    <CardDescription>View and manage inactive user accounts.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <UsersTable
                      users={inactiveUsers}
                      isActive={false}
                      onStatusChange={handleStatusChange}
                      onViewHistory={handleViewHistory}
                      onEditUser={handleEditUser}
                      refreshKey={refreshKey}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="officers">
            <Tabs defaultValue="active-officers"
              value={activeTab}
              onValueChange={(value) => {
                setActiveTab(value as typeof activeTab)
                setSelectedDepartment(null)
              }}
              className="space-y-4"
            >
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="active-officers" className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Active Officers
                </TabsTrigger>
                <TabsTrigger value="inactive-officers" className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Inactive Officers
                </TabsTrigger>
              </TabsList>

              {/* Department Filter for Officer Tabs */}
              {isOfficerTab && departments.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium mb-2">Filter by Department</h3>
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

              {/* Active Officers Tab */}
              <TabsContent value="active-officers" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5" />
                      Active Officers
                      <span className="text-sm font-normal text-muted-foreground">
                        ({activeOfficers.length})
                      </span>
                    </CardTitle>
                    <CardDescription>Manage your active officer accounts.</CardDescription>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Inactive Officers Tab */}
              <TabsContent value="inactive-officers" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5" />
                      Inactive Officers
                      <span className="text-sm font-normal text-muted-foreground">
                        ({inactiveOfficers.length})
                      </span>
                    </CardTitle>
                    <CardDescription>View and manage inactive officer accounts.</CardDescription>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit User Dialog */}
      {editingUser && (
        <AddUserDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          user={editingUser}
          isEditMode={true}
          onUserAdded={handleUserUpdated}
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