'use client'

import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight, Layers } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

type SubClass = {
  id: string | number;
  name: string;
  description?: string | null;
}

type Class = {
  id: string | number;
  name: string;
  description?: string | null;
  subClasses?: SubClass[];
}

type SubDepartment = {
  id: string | number;
  name: string;
  description?: string | null;
  classes?: Class[];
}

type Department = {
  id: string;
  name: string;
  description?: string;
  subdepartments?: SubDepartment[];
}

interface DepartmentSidebarProps {
  departments: Department[];
  activeDept: string;
  activeSubdept: string;
  onDeptClick: (deptId: string) => void;
  onSubdeptClick: (deptId: string, subdeptId: string) => void;
  onClassClick?: (deptId: string, subdeptId: string, classId: string) => void;
  onSubclassClick?: (deptId: string, subdeptId: string, classId: string, subclassId: string) => void;
  onToggleExpand?: (key: string) => void;
  expandedItems?: Record<string, boolean>;
}

export function DepartmentSidebar({
  departments,
  activeDept,
  activeSubdept,
  onDeptClick,
  onSubdeptClick,
  onClassClick = () => {},
  onSubclassClick = () => {},
  onToggleExpand = () => {},
  expandedItems = {},
}: DepartmentSidebarProps) {
  return (
    <div className="w-64 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 h-full overflow-y-auto">
      <div className="p-4 space-y-2">
        <div className="flex items-center space-x-3 mb-4 sticky top-0 bg-white dark:bg-gray-900 z-10 py-2">
          <div className="p-1.5 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
            <Layers className="h-4 w-4 text-gray-600 dark:text-gray-300" />
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Departments</h3>
        </div>

        {departments.map((dept, deptIndex) => {
          const deptKey = `dept-${dept.id}`
          const isDeptExpanded = expandedItems[deptKey] ?? true
          const subdepartments = dept.subdepartments || []

          return (
            <div key={dept.id} className="space-y-1">
              <Collapsible 
                open={isDeptExpanded} 
                onOpenChange={() => onToggleExpand(deptKey)}
              >
                <CollapsibleTrigger asChild>
                  <button
                    className={cn(
                      "w-full flex items-center justify-between p-2.5 text-left rounded-md transition-all",
                      activeDept === dept.id
                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-100"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800"
                    )}
                    onClick={() => onDeptClick(dept.id)}
                  >
                    <div className="flex items-center space-x-2">
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-gray-400 transition-transform",
                          isDeptExpanded ? "rotate-0" : "-rotate-90"
                        )}
                      />
                      <span className="font-medium text-sm">{dept.name}</span>
                    </div>
                    {subdepartments.length > 0 && (
                      <Badge variant="outline" className="h-5 text-xs">
                        {subdepartments.length}
                      </Badge>
                    )}
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent className="mt-1 space-y-1 pl-4">
                  {subdepartments.map((subdept) => {
                    const subdeptKey = `subdept-${dept.id}-${subdept.id}`
                    const isSubdeptExpanded = expandedItems[subdeptKey] ?? true
                    const isActive = activeSubdept === subdept.id.toString()
                    const classes = subdept.classes || []

                    return (
                      <div key={subdept.id} className="space-y-1">
                        <Collapsible 
                          open={isSubdeptExpanded} 
                          onOpenChange={() => onToggleExpand(subdeptKey)}
                        >
                          <CollapsibleTrigger asChild>
                            <button
                              className={cn(
                                "w-full flex items-center justify-between p-2 text-sm rounded-md transition-colors",
                                isActive
                                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-100"
                                  : "hover:bg-gray-100 dark:hover:bg-gray-800"
                              )}
                              onClick={(e) => {
                                e.stopPropagation()
                                onSubdeptClick(dept.id, subdept.id.toString())
                              }}
                            >
                              <div className="flex items-center space-x-2">
                                {classes.length > 0 ? (
                                  isSubdeptExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                                  )
                                ) : (
                                  <div className="w-3.5" />
                                )}
                                <span>{subdept.name}</span>
                              </div>
                              {classes.length > 0 && (
                                <Badge variant="outline" className="h-5 text-xs">
                                  {classes.length}
                                </Badge>
                              )}
                            </button>
                          </CollapsibleTrigger>

                          <CollapsibleContent className="ml-2 mt-1 space-y-1">
                            {classes.map((cls) => {
                              const classKey = `class-${dept.id}-${subdept.id}-${cls.id}`
                              const isClassExpanded = expandedItems[classKey] ?? false
                              const subClasses = cls.subClasses || []

                              return (
                                <div key={cls.id} className="space-y-1">
                                  <Collapsible 
                                    open={isClassExpanded} 
                                    onOpenChange={() => onToggleExpand(classKey)}
                                  >
                                    <CollapsibleTrigger asChild>
                                      <button
                                        className={cn(
                                          "w-full flex items-center justify-between p-1.5 pl-3 text-sm rounded-md transition-colors",
                                          "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                        )}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          onClassClick(dept.id, subdept.id.toString(), cls.id.toString())
                                        }}
                                      >
                                        <div className="flex items-center space-x-2">
                                          {subClasses.length > 0 ? (
                                            isClassExpanded ? (
                                              <ChevronDown className="h-3 w-3 text-gray-400" />
                                            ) : (
                                              <ChevronRight className="h-3 w-3 text-gray-400" />
                                            )
                                          ) : (
                                            <div className="w-3" />
                                          )}
                                          <span>{cls.name}</span>
                                        </div>
                                        {subClasses.length > 0 && (
                                          <span className="text-xs text-gray-500">
                                            {subClasses.length}
                                          </span>
                                        )}
                                      </button>
                                    </CollapsibleTrigger>

                                    <CollapsibleContent className="ml-3 mt-1 space-y-1">
                                      {subClasses.map((subClass) => (
                                        <button
                                          key={subClass.id}
                                          className="w-full text-left p-1.5 pl-4 text-sm rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            onSubclassClick(
                                              dept.id, 
                                              subdept.id.toString(), 
                                              cls.id.toString(), 
                                              subClass.id.toString()
                                            )
                                          }}
                                        >
                                          {subClass.name}
                                        </button>
                                      ))}
                                    </CollapsibleContent>
                                  </Collapsible>
                                </div>
                              )
                            })}
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    )
                  })}
                </CollapsibleContent>
              </Collapsible>
            </div>
          )
        })}
      </div>
    </div>
  )
}
