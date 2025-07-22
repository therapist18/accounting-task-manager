// @ts-nocheck
'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UserCheck, UserX, History, Pencil, Users, Plus } from "lucide-react"
import { 
  User, 
  StatusHistoryEntry, 
  updateUserStatus, 
  fetchUsers, 
  getUserStatusHistory 
} from "./database"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AddUserDialog } from "./add-user-dialog"

export function UsersTable({
  users: initialUsers,
  refreshKey
}: {
  users: User[]
  refreshKey: number
}) {
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([])
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'active' | 'inactive'>('active')
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

  // Update users when initialUsers changes
  useEffect(() => {
    setUsers(initialUsers)
  }, [initialUsers])

  const handleStatusChange = async (userId: string, makeActive: boolean) => {
    try {
      await updateUserStatus(userId, makeActive)
      const updatedUsers = await fetchUsers()
      setUsers(updatedUsers.filter(user => user.role !== 'officer'))
    } catch (error) {
      console.error('Error updating user status:', error)
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

  const handleUserUpdated = () => {
    refreshUsers()
    setEditingUser(null)
    setIsEditDialogOpen(false)
  }

  const refreshUsers = async () => {
    try {
      const [active, inactive] = await Promise.all([
        fetchUsers(true),
        fetchUsers(false)
      ])
      const allUsers = [...active, ...inactive].filter(user => user.role !== 'officer')
      setUsers(allUsers)
      return allUsers
    } catch (error) {
      console.error('Failed to refresh users:', error)
      return []
    }
  }

  // Filter users based on active/inactive status
  const activeUsers = users.filter(user => {
    const statusHistory = Array.isArray(user.status_history) ? user.status_history : []
    const currentStatus = statusHistory[statusHistory.length - 1] || {}
    return currentStatus.status === 'active'
  })

  const inactiveUsers = users.filter(user => {
    const statusHistory = Array.isArray(user.status_history) ? user.status_history : []
    const currentStatus = statusHistory[statusHistory.length - 1] || {}
    return currentStatus.status === 'inactive'
  })

  const filteredUsers = activeTab === 'active' ? activeUsers : inactiveUsers

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Users
            </CardTitle>
            <CardDescription>Manage all user accounts and their status.</CardDescription>
          </div>
          <AddUserDialog
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            onUserAdded={async () => {
              await refreshUsers()
              setIsAddDialogOpen(false)
            }}
          />
          {editingUser && (
            <AddUserDialog
              open={isEditDialogOpen}
              onOpenChange={setIsEditDialogOpen}
              user={editingUser}
              isEditMode={true}
              onUserAdded={handleUserUpdated}
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
              <Users className="h-4 w-4" />
              Active Users
              <span className="ml-1 text-xs text-muted-foreground">
                ({activeUsers.length})
              </span>
            </TabsTrigger>
            <TabsTrigger value="inactive" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Inactive Users
              <span className="ml-1 text-xs text-muted-foreground">
                ({inactiveUsers.length})
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {filteredUsers.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground border rounded-lg">
            No {activeTab} users found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              
              {filteredUsers.map((user, index) => {
                const statusHistory = Array.isArray(user.status_history) ? user.status_history : []
                const currentStatus = statusHistory[statusHistory.length - 1] || {}

                return (
                  <TableRow key={`${user.id}-${refreshKey}`}>
                    <TableCell className="font-medium w-12 text-center">{index + 1}</TableCell>
                    <TableCell className="font-medium">
                      {user.name || `User ${user.id}`}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email || 'N/A'}
                    </TableCell>
                    <TableCell className="capitalize">
                      {user.role.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell>
                      {currentStatus.start_date ? formatDate(currentStatus.start_date) : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {currentStatus.end_date ? formatDate(currentStatus.end_date) : 'Present'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${currentStatus.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {currentStatus.status ? currentStatus.status.charAt(0).toUpperCase() + currentStatus.status.slice(1) : 'Inactive'}
                      </div>
                    </TableCell>
                    <TableCell className="space-x-1">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                          setEditingUser(user)
                          setIsEditDialogOpen(true)
                        }}
                          title="Edit user"
                          className="h-8 w-8 p-0"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onViewHistory(user.id)}
                          title="View history"
                          className="h-8 w-8 p-0"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        {currentStatus.status === 'active' ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onStatusChange(user.id, false)}
                            title="Deactivate user"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onStatusChange(user.id, true)}
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
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
