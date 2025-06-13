//@ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserCheck, UserX, Users, History, Briefcase, ChevronRight } from "lucide-react"
import { TaskAssignmentDialog } from "@/components/task-assignment-dialog"
import { 
  fetchUsers, 
  updateUserStatus, 
  type User, 
  type StatusHistoryEntry,
  getUserStatusHistory,
  type UserRole 
} from './database'
import { fetchDepartments } from '../departments/database'
import { UserAssignmentsDialog } from "./user-assignments-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AddUserDialog } from "@/app/(dashboard)/dashboard/users/add-user-dialog"

export default function UsersPage() {
  const [activeUsers, setActiveUsers] = useState<User[]>([])
  const [inactiveUsers, setInactiveUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([])
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [departments, setDepartments] = useState<any[]>([])
  const [userAssignments, setUserAssignments] = useState<{[key: string]: {departments: string[], subdepartments: string[]}}>({})
  const [assignmentsDialogOpen, setAssignmentsDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      try {
        const [active, inactive, depts] = await Promise.all([
          fetchUsers(true),
          fetchUsers(false),
          fetchDepartments()
        ])
        
        setDepartments(depts)
        
        // Process user assignments
        const assignments: {[key: string]: {departments: string[], subdepartments: string[]}} = {}
        
        // Initialize assignments for all users
        ;[...active, ...inactive].forEach(user => {
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
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  const handleStatusChange = async (userId: string, makeActive: boolean) => {
    try {
      // In a real app, you would get the current user's ID from your auth context
      const currentUserId = 'system' // Replace with actual user ID from auth
      await updateUserStatus(userId, makeActive, currentUserId, 'Status changed by admin')
      
      // Refresh the user lists
      const [active, inactive] = await Promise.all([
        fetchUsers(true),
        fetchUsers(false)
      ])
      setActiveUsers(active)
      setInactiveUsers(inactive)
    } catch (error) {
      console.error('Failed to update user status:', error)
    }
  }

  const handleViewHistory = async (userId: string) => {
    try {
      const history = await getUserStatusHistory(userId)
      setStatusHistory(history)
      setHistoryDialogOpen(true)
    } catch (error) {
      console.error('Failed to fetch status history:', error)
    }
  }

  const renderUserRow = (user: User, isActive: boolean) => {
    const lastStatusChange = user.status_history?.[user.status_history.length - 1]
    const assignments = userAssignments[user.id] || { departments: [], subdepartments: [] }
    
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
      <TableRow key={user.id}>
        <TableCell className="font-medium">
          <div className="flex flex-col">
            <span>{user.name || `User ${user.id}`}</span>
            <Button 
              variant="link" 
              size="sm" 
              className="h-auto p-0 text-xs text-muted-foreground"
              onClick={() => handleViewHistory(user.id)}
            >
              <History className="h-3 w-3 mr-1" />
              View history
            </Button>
          </div>
        </TableCell>
        <TableCell>{user.email}</TableCell>
        <TableCell className="capitalize">
          <div className="flex flex-col">
            <span>{user.role.replace(/_/g, ' ')}</span>
            {assignments.departments.length > 0 && (
              <div className="mt-1">
                <div 
              className="flex items-center text-xs text-muted-foreground hover:text-primary cursor-pointer transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                setSelectedUser(user)
                setAssignmentsDialogOpen(true)
              }}
            >
              <Briefcase className="h-3 w-3 mr-1 flex-shrink-0" />
              <span className="truncate">{assignments.departments.length} department(s)</span>
              <ChevronRight className="h-3 w-3 ml-1" />
            </div>
              </div>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
            {isActive ? 'Active' : 'Inactive'}
          </div>
        </TableCell>
        <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
        {isActive && (
          <TableCell>
            {lastStatusChange ? (
              <div className="flex flex-col">
                <span>{new Date(lastStatusChange.changed_at).toLocaleDateString()}</span>
                <span className="text-xs text-muted-foreground">
                  by {lastStatusChange.changed_by}
                </span>
              </div>
            ) : 'N/A'}
          </TableCell>
        )}
        <TableCell>
          {isActive ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleStatusChange(user.id, false)}
                className="mr-2"
              >
                <UserX className="h-4 w-4 mr-2" />
                Deactivate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedUser(user)
                  setAssignmentDialogOpen(true)
                }}
              >
                <Users className="h-4 w-4 mr-2" />
                Assign
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleStatusChange(user.id, true)}
            >
              <UserCheck className="h-4 w-4 mr-2" />
              Reactivate
            </Button>
          )}
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
          <AddUserDialog />
        </div>
      </div>
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Active Users</TabsTrigger>
          <TabsTrigger value="inactive">Inactive Users</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Users</CardTitle>
              <CardDescription>Manage your active user accounts.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role & Assignments</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created Date</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead className="w-48">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeUsers.map(user => renderUserRow(user, true))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="inactive" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Inactive Users</CardTitle>
              <CardDescription>View and manage inactive user accounts.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Deactivated Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inactiveUsers.map(user => renderUserRow(user, false))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Task Assignment Dialog */}
      {selectedUser && (
        <TaskAssignmentDialog
          open={assignmentDialogOpen}
          onOpenChange={setAssignmentDialogOpen}
          task={{
            id: "new-task",
            jobDescription: "New Task Assignment",
            currentAssignments: {},
          }}
          users={activeUsers}
          onAssign={(assignments) => {
            console.log("User task assigned:", assignments)
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

      <UserAssignmentsDialog 
        open={assignmentsDialogOpen} 
        onOpenChange={setAssignmentsDialogOpen} 
        user={selectedUser}
        departments={departments}
      />
    </div>
  )
}