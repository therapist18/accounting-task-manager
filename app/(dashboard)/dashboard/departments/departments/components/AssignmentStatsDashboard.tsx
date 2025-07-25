// @ts-nocheck
"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { 
  Shield, 
  UserIcon, 
  Users, 
  Building, 
  Workflow, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  UserCheck,
  UserPlus,
  BarChart3,
  PieChart,
  Calendar
} from "lucide-react"
import { User, Department, OfficerHistory, ManagerHistory, AssistantHistory } from './database'

interface AssignmentStatsProps {
  departments: Department[]
  users: User[]
  isOpen: boolean
  onClose: () => void
}

interface AssignmentStatistics {
  totalDepartments: number
  departmentsWithOfficers: number
  totalSubdepartments: number
  subdepartmentsWithManagers: number
  subdepartmentsWithAssistants: number
  totalOfficers: number
  totalManagers: number
  totalAssistants: number
  unassignedOfficers: User[]
  unassignedManagers: User[]
  unassignedAssistants: User[]
  overloadedUsers: Array<{
    user: User
    workload: {
      officerAssignments: number
      managerAssignments: number
      assistantAssignments: number
      totalAssignments: number
    }
  }>
}

// Utility functions
function getCurrentOfficer(officers_history: OfficerHistory[] | null | undefined): OfficerHistory | null {
  try {
    // Handle null, undefined, or non-array input
    if (!officers_history || !Array.isArray(officers_history) || officers_history.length === 0) {
      return null;
    }

    // Ensure all items in the array are valid
    const validHistory = officers_history.filter(
      (officer): officer is OfficerHistory => 
        officer && 
        typeof officer === 'object' && 
        'id' in officer && 
        'start_date' in officer
    );

    if (validHistory.length === 0) return null;

    // Find current officer (no end date)
    const currentOfficer = validHistory.find(officer => !officer.end_date);
    if (currentOfficer) return currentOfficer;

    // If no current officer, find the most recent one
    return validHistory.reduce((latest, officer) => {
      try {
        const officerDate = new Date(officer.start_date);
        const latestDate = new Date(latest.start_date);
        return officerDate > latestDate ? officer : latest;
      } catch (error) {
        console.error('Error comparing dates:', error);
        return latest; // In case of date parsing error, keep the current latest
      }
    });
  } catch (error) {
    console.error('Error in getCurrentOfficer:', error);
    return null;
  }
}

function getCurrentManager(manager_history: ManagerHistory[] | null | undefined): ManagerHistory | null {
  try {
    // Handle null, undefined, or non-array input
    if (!manager_history || !Array.isArray(manager_history) || manager_history.length === 0) {
      return null;
    }

    // Ensure all items in the array are valid
    const validHistory = manager_history.filter(
      (manager): manager is ManagerHistory => 
        manager && 
        typeof manager === 'object' && 
        'id' in manager && 
        'start_date' in manager
    );

    if (validHistory.length === 0) return null;

    // Find current manager (no end date)
    const currentManager = validHistory.find(manager => !manager.end_date);
    if (currentManager) return currentManager;

    // If no current manager, find the most recent one
    return validHistory.reduce((latest, manager) => {
      try {
        const managerDate = new Date(manager.start_date);
        const latestDate = new Date(latest.start_date);
        return managerDate > latestDate ? manager : latest;
      } catch (error) {
        console.error('Error comparing dates:', error);
        return latest; // In case of date parsing error, keep the current latest
      }
    });
  } catch (error) {
    console.error('Error in getCurrentManager:', error);
    return null;
  }
}

function getCurrentAssistants(assistant_history: AssistantHistory[] | null | undefined): AssistantHistory[] {
  try {
    // Handle null, undefined, or non-array input
    if (!assistant_history || !Array.isArray(assistant_history) || assistant_history.length === 0) {
      return [];
    }

    // Ensure all items in the array are valid and filter out ended assignments
    return assistant_history.filter(
      (assistant): assistant is AssistantHistory => 
        assistant && 
        typeof assistant === 'object' && 
        'id' in assistant && 
        'start_date' in assistant &&
        !assistant.end_date
    );
  } catch (error) {
    console.error('Error in getCurrentAssistants:', error);
    return [];
  }
}

function getUserWorkload(userId: string, departments: Department[]): {
  officerAssignments: number
  managerAssignments: number
  assistantAssignments: number
  totalAssignments: number
} {
  let officerAssignments = 0
  let managerAssignments = 0
  let assistantAssignments = 0

  departments.forEach(dept => {
    const currentOfficer = getCurrentOfficer(dept.officers_history || [])
    if (currentOfficer?.id === userId) {
      officerAssignments++
    }

    dept.tm_subdepartments?.forEach(subdept => {
      const currentManager = getCurrentManager(subdept.manager_history || [])
      if (currentManager?.id === userId) {
        managerAssignments++
      }

      const currentAssistants = getCurrentAssistants(subdept.assistant_history || [])
      if (currentAssistants.some(assistant => assistant.id === userId)) {
        assistantAssignments++
      }
    })
  })

  return {
    officerAssignments,
    managerAssignments,
    assistantAssignments,
    totalAssignments: officerAssignments + managerAssignments + assistantAssignments
  }
}

function getAssignmentStatistics(departments: Department[], users: User[]): AssignmentStatistics {
  const officers = users.filter(u => u.role === 'officer')
  const managers = users.filter(u => u.role === 'task_manager' || u.role === 'admin')
  const assistants = users.filter(u => u.role === 'task_assistant' || u.role === 'admin')

  let departmentsWithOfficers = 0
  let totalSubdepartments = 0
  let subdepartmentsWithManagers = 0
  let subdepartmentsWithAssistants = 0

  const assignedOfficerIds = new Set<string>()
  const assignedManagerIds = new Set<string>()
  const assignedAssistantIds = new Set<string>()

  departments.forEach(dept => {
    const currentOfficer = getCurrentOfficer(dept.officers_history || [])
    if (currentOfficer) {
      departmentsWithOfficers++
      assignedOfficerIds.add(currentOfficer.id)
    }

    dept.tm_subdepartments?.forEach(subdept => {
      totalSubdepartments++

      const currentManager = getCurrentManager(subdept.manager_history || [])
      if (currentManager) {
        subdepartmentsWithManagers++
        assignedManagerIds.add(currentManager.id)
      }

      const currentAssistants = getCurrentAssistants(subdept.assistant_history || [])
      if (currentAssistants.length > 0) {
        subdepartmentsWithAssistants++
        currentAssistants.forEach(assistant => assignedAssistantIds.add(assistant.id))
      }
    })
  })

  // Find overloaded users (users with more than 2 assignments)
  const overloadedUsers = users
    .map(user => ({
      user,
      workload: getUserWorkload(user.id, departments)
    }))
    .filter(({ workload }) => workload.totalAssignments > 2)
    .sort((a, b) => b.workload.totalAssignments - a.workload.totalAssignments)

  return {
    totalDepartments: departments.length,
    departmentsWithOfficers,
    totalSubdepartments,
    subdepartmentsWithManagers,
    subdepartmentsWithAssistants,
    totalOfficers: officers.length,
    totalManagers: managers.length,
    totalAssistants: assistants.length,
    unassignedOfficers: officers.filter(o => !assignedOfficerIds.has(o.id)),
    unassignedManagers: managers.filter(m => !assignedManagerIds.has(m.id)),
    unassignedAssistants: assistants.filter(a => !assignedAssistantIds.has(a.id)),
    overloadedUsers
  }
}

export default function AssignmentStatsDashboard({ departments, users, isOpen, onClose }: AssignmentStatsProps) {
  const [stats, setStats] = useState<AssignmentStatistics | null>(null)

  useEffect(() => {
    if (isOpen && departments.length > 0 && users.length > 0) {
      const statistics = getAssignmentStatistics(departments, users)
      setStats(statistics)
    }
  }, [isOpen, departments, users])

  if (!stats) return null

  const officerCoverage = (stats.departmentsWithOfficers / stats.totalDepartments) * 100
  const managerCoverage = (stats.subdepartmentsWithManagers / stats.totalSubdepartments) * 100
  const assistantCoverage = (stats.subdepartmentsWithAssistants / stats.totalSubdepartments) * 100

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[calc(100vh-10rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            Assignment Statistics Dashboard
          </DialogTitle>
          <DialogDescription>
            Overview of department assignments and user workloads
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Departments</CardTitle>
                <Building className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalDepartments}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.departmentsWithOfficers} with officers
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Subdepartments</CardTitle>
                <Workflow className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalSubdepartments}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.subdepartmentsWithManagers} with managers
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Officers</CardTitle>
                <Shield className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalOfficers}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.unassignedOfficers.length} unassigned
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Managers</CardTitle>
                <UserIcon className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalManagers}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.unassignedManagers.length} unassigned
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Assistants</CardTitle>
                <Users className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalAssistants}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.unassignedAssistants.length} unassigned
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overloaded</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.overloadedUsers.length}</div>
                <p className="text-xs text-muted-foreground">
                  Users with 3+ assignments
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="coverage" className="space-y-4">
            <TabsList>
              <TabsTrigger value="coverage">Coverage Analysis</TabsTrigger>
              <TabsTrigger value="unassigned">Unassigned Users</TabsTrigger>
              <TabsTrigger value="workload">User Workload</TabsTrigger>
            </TabsList>

            <TabsContent value="coverage" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-purple-600" />
                      Officer Coverage
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Departments with Officers</span>
                      <span className="text-2xl font-bold">{Math.round(officerCoverage)}%</span>
                    </div>
                    <Progress value={officerCoverage} className="w-full" />
                    <div className="text-sm text-gray-600">
                      {stats.departmentsWithOfficers} of {stats.totalDepartments} departments
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserIcon className="h-5 w-5 text-blue-600" />
                      Manager Coverage
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Subdepartments with Managers</span>
                      <span className="text-2xl font-bold">{Math.round(managerCoverage)}%</span>
                    </div>
                    <Progress value={managerCoverage} className="w-full" />
                    <div className="text-sm text-gray-600">
                      {stats.subdepartmentsWithManagers} of {stats.totalSubdepartments} subdepartments
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-green-600" />
                      Assistant Coverage
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Subdepartments with Assistants</span>
                      <span className="text-2xl font-bold">{Math.round(assistantCoverage)}%</span>
                    </div>
                    <Progress value={assistantCoverage} className="w-full" />
                    <div className="text-sm text-gray-600">
                      {stats.subdepartmentsWithAssistants} of {stats.totalSubdepartments} subdepartments
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="unassigned" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-purple-600" />
                      Unassigned Officers ({stats.unassignedOfficers.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {stats.unassignedOfficers.length === 0 ? (
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          <span className="text-sm">All officers assigned</span>
                        </div>
                      ) : (
                        stats.unassignedOfficers.map(officer => (
                          <div key={officer.id} className="flex items-center justify-between p-2 border rounded">
                            <div>
                              <p className="font-medium text-sm">{officer.name}</p>
                              <p className="text-xs text-gray-500">{officer.email}</p>
                            </div>
                            <Badge variant="outline">Available</Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserIcon className="h-5 w-5 text-blue-600" />
                      Unassigned Managers ({stats.unassignedManagers.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {stats.unassignedManagers.length === 0 ? (
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          <span className="text-sm">All managers assigned</span>
                        </div>
                      ) : (
                        stats.unassignedManagers.map(manager => (
                          <div key={manager.id} className="flex items-center justify-between p-2 border rounded">
                            <div>
                              <p className="font-medium text-sm">{manager.name}</p>
                              <p className="text-xs text-gray-500">{manager.email}</p>
                            </div>
                            <Badge variant="outline">Available</Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-green-600" />
                      Unassigned Assistants ({stats.unassignedAssistants.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {stats.unassignedAssistants.length === 0 ? (
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          <span className="text-sm">All assistants assigned</span>
                        </div>
                      ) : (
                        stats.unassignedAssistants.map(assistant => (
                          <div key={assistant.id} className="flex items-center justify-between p-2 border rounded">
                            <div>
                              <p className="font-medium text-sm">{assistant.name}</p>
                              <p className="text-xs text-gray-500">{assistant.email}</p>
                            </div>
                            <Badge variant="outline">Available</Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="workload" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    User Workload Analysis
                  </CardTitle>
                  <CardDescription>
                    Users with multiple assignments (3 or more assignments are considered overloaded)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {stats.overloadedUsers.length === 0 ? (
                      <div className="flex items-center gap-2 text-green-600 justify-center py-8">
                        <CheckCircle className="h-6 w-6" />
                        <span>No users are overloaded with assignments</span>
                      </div>
                    ) : (
                      stats.overloadedUsers.map(({ user, workload }) => (
                        <div key={user.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <h4 className="font-medium">{user.name}</h4>
                              <p className="text-sm text-gray-500">{user.email}</p>
                            </div>
                            <Badge 
                              variant={workload.totalAssignments > 4 ? "destructive" : "secondary"}
                              className="text-sm"
                            >
                              {workload.totalAssignments} assignments
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div className="text-center">
                              <div className="font-medium text-purple-600">{workload.officerAssignments}</div>
                              <div className="text-gray-500">Officer</div>
                            </div>
                            <div className="text-center">
                              <div className="font-medium text-blue-600">{workload.managerAssignments}</div>
                              <div className="text-gray-500">Manager</div>
                            </div>
                            <div className="text-center">
                              <div className="font-medium text-green-600">{workload.assistantAssignments}</div>
                              <div className="text-gray-500">Assistant</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex justify-end pt-6 border-t">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}