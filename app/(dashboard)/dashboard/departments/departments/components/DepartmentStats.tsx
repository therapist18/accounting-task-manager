import { User } from "../database"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Building, Users, User as UserIcon, Shield, BarChart3, X } from "lucide-react"

interface DepartmentStatsProps {
  department: {
    id: string
    name: string
    officers_history: Array<{ id: string; start_date: string; end_date?: string }>
  }
  subdepartments: Array<{
    id: string
    name: string
    officer_history: Array<{ id: string; start_date: string; end_date?: string }>
    manager_history: Array<{ id: string; start_date: string; end_date?: string }>
    assistant_history: Array<{ id: string; start_date: string; end_date?: string }>
  }>
  users: User[]
}

function getCurrentAssignments(history: any = []) {
  try {
    // If history is null, undefined, or not an array, return empty array
    if (!history || !Array.isArray(history)) return [];
    
    // Safely filter and map the array
    return history
      .filter((item: any) => item && typeof item === 'object' && 'id' in item && !item.end_date)
      .map((item: any) => item.id);
  } catch (error) {
    console.error('Error in getCurrentAssignments:', error);
    return [];
  }
}

export function DepartmentStats({ department, subdepartments, users }: DepartmentStatsProps) {
  // Get department officer
  const deptOfficers = getCurrentAssignments(department.officers_history)
  
  // Get all subdepartment assignments
  const subdeptOfficers = new Set<string>()
  const managers = new Set<string>()
  const assistants = new Set<string>()
  
  subdepartments.forEach(subdept => {
    getCurrentAssignments(subdept.officer_history).forEach(id => subdeptOfficers.add(id))
    getCurrentAssignments(subdept.manager_history).forEach(id => managers.add(id))
    getCurrentAssignments(subdept.assistant_history).forEach(id => assistants.add(id))
  })
  
  // Combine department and subdepartment officers
  const allOfficers = new Set([...deptOfficers, ...Array.from(subdeptOfficers)])
  
  // Get user details
  const getUser = (id: string) => users.find(u => u.id === id)
  
  const totalSubdepartments = subdepartments.length
  const totalOfficers = allOfficers.size
  const totalManagers = managers.size
  const totalAssistants = assistants.size
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          View Stats
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            {department.name} - Department Statistics
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border rounded-lg p-4">
              <div className="text-sm font-medium text-gray-500">Subdepartments</div>
              <div className="text-2xl font-bold">{totalSubdepartments}</div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-sm font-medium text-gray-500">Officers</div>
              <div className="text-2xl font-bold">{totalOfficers}</div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-sm font-medium text-gray-500">Managers</div>
              <div className="text-2xl font-bold">{totalManagers}</div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-sm font-medium text-gray-500">Assistants</div>
              <div className="text-2xl font-bold">{totalAssistants}</div>
            </div>
          </div>
          
          {/* Detailed Breakdown */}
          <div className="space-y-6">
            {/* Department Officer */}
            {deptOfficers.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  Department Officer
                </h4>
                <div className="space-y-1 pl-6">
                  {deptOfficers.map(officerId => {
                    const user = getUser(officerId)
                    return user ? (
                      <div key={officerId} className="flex items-center gap-2 p-2 bg-blue-50 rounded">
                        <UserIcon className="h-4 w-4 text-blue-500" />
                        <span>{user.name}</span>
                        <Badge variant="secondary" className="ml-auto">Department Level</Badge>
                      </div>
                    ) : null
                  })}
                </div>
              </div>
            )}
            
            {/* Subdepartment Officers */}
            {subdeptOfficers.size > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-600" />
                  Subdepartment Officers
                </h4>
                <div className="space-y-2 pl-6">
                  {Array.from(subdeptOfficers).map(officerId => {
                    const user = getUser(officerId)
                    if (!user) return null
                    
                    const assignedSubdepts = subdepartments
                      .filter(subdept => getCurrentAssignments(subdept.officer_history).includes(officerId))
                      .map(subdept => subdept.name)
                    
                    return (
                      <div key={officerId} className="p-2 bg-purple-50 rounded">
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-purple-500" />
                          <span className="font-medium">{user.name}</span>
                          <Badge variant="outline" className="ml-auto">
                            {assignedSubdepts.length} {assignedSubdepts.length === 1 ? 'Subdept' : 'Subdepts'}
                          </Badge>
                        </div>
                        {assignedSubdepts.length > 0 && (
                          <div className="mt-1 text-xs text-gray-500 pl-6">
                            {assignedSubdepts.join(', ')}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
            {/* Managers */}
            {managers.size > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-green-600" />
                  Task Managers
                </h4>
                <div className="space-y-2 pl-6">
                  {Array.from(managers).map(managerId => {
                    const user = getUser(managerId)
                    if (!user) return null
                    
                    const assignedSubdepts = subdepartments
                      .filter(subdept => getCurrentAssignments(subdept.manager_history).includes(managerId))
                      .map(subdept => subdept.name)
                    
                    return (
                      <div key={managerId} className="p-2 bg-green-50 rounded">
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-green-500" />
                          <span className="font-medium">{user.name}</span>
                          <Badge variant="outline" className="ml-auto">
                            {assignedSubdepts.length} {assignedSubdepts.length === 1 ? 'Subdept' : 'Subdepts'}
                          </Badge>
                        </div>
                        {assignedSubdepts.length > 0 && (
                          <div className="mt-1 text-xs text-gray-500 pl-6">
                            {assignedSubdepts.join(', ')}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
            {/* Assistants */}
            {assistants.size > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-amber-600" />
                  Task Assistants
                </h4>
                <div className="space-y-2 pl-6">
                  {Array.from(assistants).map(assistantId => {
                    const user = getUser(assistantId)
                    if (!user) return null
                    
                    const assignedSubdepts = subdepartments
                      .filter(subdept => getCurrentAssignments(subdept.assistant_history).includes(assistantId))
                      .map(subdept => subdept.name)
                    
                    return (
                      <div key={assistantId} className="p-2 bg-amber-50 rounded">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-amber-500" />
                          <span className="font-medium">{user.name}</span>
                          <Badge variant="outline" className="ml-auto">
                            {assignedSubdepts.length} {assignedSubdepts.length === 1 ? 'Subdept' : 'Subdepts'}
                          </Badge>
                        </div>
                        {assignedSubdepts.length > 0 && (
                          <div className="mt-1 text-xs text-gray-500 pl-6">
                            {assignedSubdepts.join(', ')}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
