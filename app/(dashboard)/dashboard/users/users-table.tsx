// @ts-nocheck
'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { UserCheck, UserX, History, Pencil } from "lucide-react"
import { User } from "./database"

export function UsersTable({
  users,
  isActive,
  onStatusChange,
  onViewHistory,
  onEditUser,
  refreshKey
}: {
  users: User[]
  isActive: boolean
  onStatusChange: (userId: string, makeActive: boolean) => Promise<void>
  onViewHistory: (userId: string) => Promise<void>
  onEditUser: (user: User) => void
  refreshKey: number
}) {
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

  if (users.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No {isActive ? 'active' : 'inactive'} users found.
      </div>
    )
  }

  return (
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
        {users.map((user, index) => {
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
                  <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                  {isActive ? 'Active' : 'Inactive'}
                </div>
              </TableCell>
              <TableCell className="space-x-1">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEditUser(user)}
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
                  {isActive ? (
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
  )
}
