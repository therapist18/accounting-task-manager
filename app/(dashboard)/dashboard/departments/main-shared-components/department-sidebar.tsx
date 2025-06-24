'use client'

import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight, Layers, Search, ChevronsUpDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import React from "react"

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
  activeClass?: string;
  activeSubclass?: string;
  onDeptClick: (deptId: string) => void;
  onSubdeptClick: (deptId: string, subdeptId: string) => void;
  onClassClick?: (deptId: string, subdeptId: string, classId: string) => void;
  onSubclassClick?: (deptId: string, subdeptId: string, classId: string, subclassId: string) => void;
  onToggleExpand?: (key: string) => void;
  expandedItems?: Record<string, boolean>;
}

// Helper component to render index
const IndexBadge = ({ index, isActive }: { index: string; isActive: boolean }) => (
  <span className={cn(
    "flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium mr-2 flex-shrink-0",
    isActive 
      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200"
      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
  )}>
    {index}
  </span>
)

export function DepartmentSidebar({
  departments,
  activeDept,
  activeSubdept,
  activeClass = '',
  activeSubclass = '',
  onDeptClick,
  onSubdeptClick,
  onClassClick = () => {},
  onSubclassClick = () => {},
  onToggleExpand = () => {},
  expandedItems = {},
}: DepartmentSidebarProps) {
  const [searchQuery, setSearchQuery] = React.useState('')
  const [isAllCollapsed, setIsAllCollapsed] = React.useState(false)
  
  const toggleAll = () => {
    const newState = !isAllCollapsed
    setIsAllCollapsed(newState)
    
    // Get all department and subdepartment keys
    const allKeys = departments.flatMap(dept => {
      const deptKey = `dept-${dept.id}`
      const subKeys = (dept.subdepartments || []).map(
        subdept => `subdept-${dept.id}-${subdept.id}`
      )
      return [deptKey, ...subKeys]
    })
    
    // Collapse or expand all
    allKeys.forEach(key => onToggleExpand(key))
  }
  
  const filteredDepartments = React.useMemo(() => {
    if (!searchQuery.trim()) return departments;
    
    const query = searchQuery.toLowerCase();
    return departments.map(dept => {
      const filteredSubdepts = (dept.subdepartments || []).map(subdept => {
        const filteredClasses = (subdept.classes || []).map(cls => ({
          ...cls,
          subClasses: (cls.subClasses || []).filter(
            subClass => subClass.name.toLowerCase().includes(query)
          )
        })).filter(cls => 
          cls.name.toLowerCase().includes(query) || 
          cls.subClasses.length > 0
        )
        
        return {
          ...subdept,
          classes: filteredClasses
        };
      }).filter(subdept => 
        subdept.name.toLowerCase().includes(query) || 
        subdept.classes.length > 0
      )
      
      return {
        ...dept,
        subdepartments: filteredSubdepts
      };
    }).filter(dept => 
      dept.name.toLowerCase().includes(query) || 
      dept.subdepartments.length > 0
    );
  }, [departments, searchQuery]);
  return (
    <div className="w-72 h-full flex flex-col bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <Layers className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Departments</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            onClick={toggleAll}
          >
            <ChevronsUpDown className="h-3.5 w-3.5 mr-1.5" />
            {isAllCollapsed ? 'Expand All' : 'Collapse All'}
          </Button>
        </div>
        
        {/* Search Input */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search departments..."
            className="pl-9 h-9 text-sm rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus-visible:ring-1 focus-visible:ring-blue-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-2">

        {filteredDepartments.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
            No departments found
          </div>
        ) : (
          filteredDepartments.map((dept, deptIndex) => {
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
                      "w-full flex items-center justify-between p-2.5 pl-3 pr-2.5 text-left transition-all duration-200 group relative",
                      activeDept === dept.id
                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-100 font-medium shadow-sm"
                        : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                    )}
                    onClick={() => onDeptClick(dept.id)}
                  >
                    <div className="flex items-center space-x-2">
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-gray-400 transition-transform flex-shrink-0",
                          isDeptExpanded ? "rotate-0" : "-rotate-90"
                        )}
                      />
                      <div className="flex items-center">
                        <IndexBadge 
                          index={`${deptIndex + 1}`} 
                          isActive={activeDept === dept.id}
                        />
                        <span className="font-medium text-sm">{dept.name}</span>
                      </div>
                    </div>
                    {subdepartments.length > 0 && (
                      <Badge variant="outline" className="h-5 text-xs">
                        {subdepartments.length}
                      </Badge>
                    )}
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent className="mt-1 space-y-1 pl-4">
                  {subdepartments.map((subdept, subdeptIndex) => {
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
                                "w-full flex items-center justify-between p-2 pl-7 pr-2 text-sm transition-colors duration-200 group relative",
                                isActive
                                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-100 font-medium shadow-sm"
                                  : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50",
                                "before:absolute before:left-4 before:top-1/2 before:-translate-y-1/2 before:w-1.5 before:h-1.5 before:rounded-full",
                                isActive 
                                  ? "before:bg-blue-500 before:ring-2 before:ring-blue-200 dark:before:ring-blue-900/50" 
                                  : "before:bg-gray-300 dark:before:bg-gray-600"
                              )}
                              onClick={(e) => {
                                e.stopPropagation()
                                onSubdeptClick(dept.id, subdept.id.toString())
                              }}
                            >
                              <div className="flex items-center space-x-2">
                                {classes.length > 0 ? (
                                  isSubdeptExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                  )
                                ) : (
                                  <div className="w-3.5 flex-shrink-0" />
                                )}
                                <div className="flex items-center">
                                  <IndexBadge 
                                    index={`${deptIndex + 1}.${subdeptIndex + 1}`} 
                                    isActive={isActive}
                                  />
                                  <span>{subdept.name}</span>
                                </div>
                              </div>
                              {classes.length > 0 && (
                                <Badge variant="outline" className="h-5 text-xs">
                                  {classes.length}
                                </Badge>
                              )}
                            </button>
                          </CollapsibleTrigger>

                          <CollapsibleContent className="ml-2 mt-1 space-y-1">
                            {classes.map((cls, classIndex) => {
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
                                          "w-full flex items-center justify-between p-1.5 pl-8 pr-2 text-sm rounded-lg transition-colors duration-200 relative",
                                          activeClass === cls.id.toString()
                                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-100 font-medium shadow-sm"
                                            : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50",
                                          "before:absolute before:left-6 before:top-1/2 before:-translate-y-1/2 before:w-1.5 before:h-1.5 before:rounded-full",
                                          activeClass === cls.id.toString()
                                            ? "before:bg-blue-500 before:ring-2 before:ring-blue-200 dark:before:ring-blue-900/50"
                                            : "before:bg-gray-300 dark:before:bg-gray-600"
                                        )}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          onClassClick(dept.id, subdept.id.toString(), cls.id.toString())
                                        }}
                                      >
                                        <div className="flex items-center space-x-2">
                                          {subClasses.length > 0 ? (
                                            isClassExpanded ? (
                                              <ChevronDown className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                            ) : (
                                              <ChevronRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                            )
                                          ) : (
                                            <div className="w-3 flex-shrink-0" />
                                          )}
                                          <div className="flex items-center">
                                            <IndexBadge 
                                              index={`${deptIndex + 1}.${subdeptIndex + 1}.${classIndex + 1}`} 
                                              isActive={activeClass === cls.id.toString()}
                                            />
                                            <span>{cls.name}</span>
                                          </div>
                                        </div>
                                        {subClasses.length > 0 && (
                                          <span className="text-xs text-gray-500">
                                            {subClasses.length}
                                          </span>
                                        )}
                                      </button>
                                    </CollapsibleTrigger>

                                    <CollapsibleContent className="ml-3 mt-1 space-y-1">
                                      {subClasses.map((subClass, subclassIndex) => (
                                        <button
                                          key={subClass.id}
                                          className={cn(
                                            "w-full text-left p-1.5 pl-14 pr-2 text-sm rounded-lg transition-colors duration-200 relative",
                                            activeSubclass === subClass.id.toString()
                                              ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-100 font-medium shadow-sm"
                                              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50",
                                            "before:absolute before:left-8 before:top-1/2 before:-translate-y-1/2 before:w-1.5 before:h-1.5 before:rounded-full",
                                            activeSubclass === subClass.id.toString()
                                              ? "before:bg-blue-500 before:ring-2 before:ring-blue-200 dark:before:ring-blue-900/50"
                                              : "before:bg-gray-300 dark:before:bg-gray-600"
                                          )}
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
        }))}
      </div>
    </div>
  )
}
