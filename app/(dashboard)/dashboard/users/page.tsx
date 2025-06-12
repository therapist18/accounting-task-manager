"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserPlus, UserCheck, UserX, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { TaskAssignmentDialog } from "@/components/task-assignment-dialog"
import { useState } from "react"

const mockUserTasks = {
  "1": [
    { id: "task-1", jobDescription: "Tax Filing for ABC Corp", status: "Active", department: "KRA" },
    { id: "task-2", jobDescription: "PIN Registration", status: "Completed", department: "KRA" },
  ],
  "2": [{ id: "task-3", jobDescription: "Passport Application", status: "Active", department: "Immigration" }],
}

export default function UsersPage() {
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
        <div className="flex items-center space-x-2">
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
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
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created Date</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead>Current Tasks</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">user{i}</TableCell>
                      <TableCell>user{i}@example.com</TableCell>
                      <TableCell>{i === 1 ? "Admin" : "User"}</TableCell>
                      <TableCell>2023-05-{i < 10 ? `0${i}` : i}</TableCell>
                      <TableCell>Today</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {mockUserTasks[i]?.map((task) => (
                            <Badge key={task.id} variant={task.status === "Active" ? "default" : "secondary"}>
                              {task.department}
                            </Badge>
                          )) || <span className="text-muted-foreground">No tasks</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          <UserX className="h-4 w-4 mr-2" />
                          Deactivate
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedUser({ id: i.toString(), username: `user${i}`, email: `user${i}@example.com` })
                            setAssignmentDialogOpen(true)
                          }}
                        >
                          <Users className="h-4 w-4 mr-2" />
                          Assign
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Deactivated Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2].map((i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">inactive{i}</TableCell>
                      <TableCell>inactive{i}@example.com</TableCell>
                      <TableCell>User</TableCell>
                      <TableCell>2023-04-{10 + i}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          <UserCheck className="h-4 w-4 mr-2" />
                          Reactivate
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {selectedUser && (
        <TaskAssignmentDialog
          open={assignmentDialogOpen}
          onOpenChange={setAssignmentDialogOpen}
          task={{
            id: "new-task",
            jobDescription: "New Task Assignment",
            currentAssignments: {},
          }}
          users={[
            { id: "1", username: "john_doe", email: "john@example.com" },
            { id: "2", username: "jane_smith", email: "jane@example.com" },
          ]}
          onAssign={(assignments) => {
            console.log("User task assigned:", assignments)
          }}
        />
      )}
    </div>
  )
}
