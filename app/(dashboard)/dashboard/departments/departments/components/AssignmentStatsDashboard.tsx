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
import { User, Department, Officer, OfficerHistory, ManagerHistory, AssistantHistory, getCurrentAssignments } from '../database'
import { getOfficerDisplayName, FilteredUserData } from "@/lib/shared-user-assignment-service"

interface AssignmentStatsProps {
  departments: Department[]
  userData: FilteredUserData
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
  unassignedOfficers: Officer[]
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
  return getCurrentAssignments(officers_history)[0] || null
}

function getCurrentOfficers(officers_history: OfficerHistory[] | null | undefined): OfficerHistory[] {
  return getCurrentAssignments(officers_history)
}

// Helper function to get officer with inheritance from parent department
function getInheritedOfficer(
  entityOfficersHistory: OfficerHistory[] | null | undefined,
  parentDepartment: any
): OfficerHistory | null {
  // First check if this entity has its own officer assignment
  const ownOfficer = getCurrentOfficer(entityOfficersHistory || [])
  if (ownOfficer) {
    return ownOfficer
  }

  // If no own officer, inherit from parent department
  if (parentDepartment) {
    const parentOfficer = getCurrentOfficer(parentDepartment.officers_history || [])
    return parentOfficer
  }

  // No officer found
  return null
}

function getCurrentManager(manager_history: ManagerHistory[] | null | undefined): ManagerHistory | null {
  return getCurrentAssignments(manager_history)[0] || null
}

function getCurrentManagers(manager_history: ManagerHistory[] | null | undefined): ManagerHistory[] {
  return getCurrentAssignments(manager_history)
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
    const currentOfficers = getCurrentOfficers(dept.officers_history || [])
    officerAssignments += currentOfficers.filter((officer) => officer.id === userId).length

    dept.tm_subdepartments?.forEach(subdept => {
      const currentSubdeptOfficers = getCurrentOfficers(subdept.officer_history || [])
      officerAssignments += currentSubdeptOfficers.filter((officer) => officer.id === userId).length

      const currentManagers = getCurrentManagers(subdept.manager_history || [])
      managerAssignments += currentManagers.filter((manager) => manager.id === userId).length

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

function getAssignmentStatistics(departments: Department[], userData: FilteredUserData): AssignmentStatistics {
  let departmentsWithOfficers = 0
  let totalSubdepartments = 0
  let subdepartmentsWithManagers = 0
  let subdepartmentsWithAssistants = 0

  const assignedOfficerIds = new Set<string>()
  const assignedManagerIds = new Set<string>()
  const assignedAssistantIds = new Set<string>()

  departments.forEach(dept => {
    const currentOfficers = getCurrentOfficers(dept.officers_history || [])
    if (currentOfficers.length > 0) {
      departmentsWithOfficers++
      currentOfficers.forEach((officer) => assignedOfficerIds.add(officer.id))
    }

    dept.tm_subdepartments?.forEach(subdept => {
      totalSubdepartments++

      getCurrentOfficers(subdept.officer_history || []).forEach((officer) => assignedOfficerIds.add(officer.id))

      // Check for managers assigned via roleAssignments
      const assignedManagers = userData.managers.filter(manager =>
        manager.assignments?.some((assignment: any) =>
          assignment.role === 'manager' &&
          assignment.department_id === parseInt(dept.id) &&
          (assignment.subdepartment_id === parseInt(subdept.id) || assignment.subdepartment_id === null) &&
          !assignment.end_date
        )
      )

      if (assignedManagers.length > 0) {
        subdepartmentsWithManagers++
        assignedManagers.forEach((manager) => assignedManagerIds.add(manager.id))
      }

      // Check for assistants assigned via roleAssignments
      const assignedAssistants = userData.assistants.filter(assistant =>
        assistant.assignments?.some((assignment: any) =>
          assignment.role === 'assistant' &&
          assignment.department_id === parseInt(dept.id) &&
          (assignment.subdepartment_id === parseInt(subdept.id) || assignment.subdepartment_id === null) &&
          !assignment.end_date
        )
      )

      if (assignedAssistants.length > 0) {
        subdepartmentsWithAssistants++
        assignedAssistants.forEach(assistant => assignedAssistantIds.add(assistant.id))
      }
    })
  })

  // Find overloaded users (users with more than 2 assignments)
  const overloadedUsers = userData.allUsers
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
    totalOfficers: userData.officers.length,
    totalManagers: userData.managers.length,
    totalAssistants: userData.assistants.length,
    unassignedOfficers: userData.officers.filter(officer => !assignedOfficerIds.has(officer.id)),
    unassignedManagers: userData.managers.filter(manager => !assignedManagerIds.has(manager.id)),
    unassignedAssistants: userData.assistants.filter(assistant => !assignedAssistantIds.has(assistant.id)),
    overloadedUsers,
    assignmentDistribution: {
      officerAssignments: assignedOfficerIds.size,
      managerAssignments: assignedManagerIds.size,
      assistantAssignments: assignedAssistantIds.size,
      totalAssignments: assignedOfficerIds.size + assignedManagerIds.size + assignedAssistantIds.size
    }
  }
}

export default function AssignmentStatsDashboard({ departments, userData, isOpen, onClose }: AssignmentStatsProps) {
  const [stats, setStats] = useState<AssignmentStatistics | null>(null)

  useEffect(() => {
    if (isOpen && departments.length > 0 && userData.allUsers.length > 0) {
      const statistics = getAssignmentStatistics(departments, userData)
      setStats(statistics)
    }
  }, [isOpen, departments, userData])

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
                              <p className="font-medium text-sm">{getOfficerDisplayName(officer)}</p>
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
