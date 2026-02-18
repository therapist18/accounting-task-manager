'use client'

import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight, Layers, Search, ChevronsUpDown, Eye, EyeOff, Star, RotateCcw, Settings, ChevronLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import React from "react"

type SubClass = {
  id: string | number;
  name: string;
  description?: string | null;
  default_display?: boolean;
  order?: number;
}

type Class = {
  id: string | number;
  name: string;
  description?: string | null;
  default_display?: boolean;
  subClasses?: SubClass[];
  order?: number;
}

type SubDepartment = {
  id: string | number;
  name: string;
  description?: string | null;
  default_display?: boolean;
  classes?: Class[];
  order?: number;
}

type Department = {
  id: string;
  name: string;
  description?: string;
  default_display?: boolean;
  subdepartments?: SubDepartment[];
  order?: number;
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
  isCollapsed?: boolean;
  onCollapseToggle?: () => void;
  showDefaultDisplayOnly?: boolean;
  onToggleDefaultDisplay?: () => void;
}

// Helper component to render index with level-based colors
const IndexBadge = ({
  index,
  isActive,
  level = 'department',
  isDefault = false
}: {
  index: string;
  isActive: boolean;
  level?: 'department' | 'subdepartment' | 'class' | 'subclass';
  isDefault?: boolean;
}) => {
  const levelColors = {
    department: {
      bg: '',
      text: 'text-blue-700 dark:text-blue-200',
      activeBg: 'bg-blue-100 dark:bg-blue-900/50',
      activeText: 'text-blue-700 dark:text-blue-200',
      defaultBg: 'bg-blue-200 dark:bg-blue-800',
      defaultText: 'text-blue-800 dark:text-blue-100',
    },
    subdepartment: {
      bg: '',
      text: 'text-emerald-700 dark:text-emerald-200',
      activeBg: 'bg-emerald-100 dark:bg-emerald-900/40',
      activeText: 'text-emerald-700 dark:text-emerald-200',
      defaultBg: 'bg-emerald-200 dark:bg-emerald-800',
      defaultText: 'text-emerald-800 dark:text-emerald-100',
    },
    class: {
      bg: '',
      text: 'text-amber-700 dark:text-amber-200',
      activeBg: 'bg-amber-100 dark:bg-amber-900/30',
      activeText: 'text-amber-700 dark:text-amber-200',
      defaultBg: 'bg-amber-200 dark:bg-amber-800',
      defaultText: 'text-amber-800 dark:text-amber-100',
    },
    subclass: {
      bg: '',
      text: 'text-purple-700 dark:text-purple-200',
      activeBg: 'bg-purple-100 dark:bg-purple-900/30',
      activeText: 'text-purple-700 dark:text-purple-200',
      defaultBg: 'bg-purple-200 dark:bg-purple-800',
      defaultText: 'text-purple-800 dark:text-purple-100',
    },
  }

  const colors = levelColors[level] || levelColors.department

  return (
    <span className={cn(
      "flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium mr-2 flex-shrink-0 transition-all",
      isActive ? colors.activeBg : colors.bg,
      isActive ? colors.activeText : colors.text
    )}>
      {index}
    </span>
  )
}

// Helper component for truncated text with tooltip and level-based styling
const TruncatedText = ({
  text,
  className = "",
  level = 'department',
  isActive = false,
  isDefault = false
}: {
  text: string;
  className?: string;
  level?: 'department' | 'subdepartment' | 'class' | 'subclass';
  isActive?: boolean;
  isDefault?: boolean;
}) => {
  const levelColors = {
    department: {
      text: 'text-gray-800 dark:text-gray-200',
      activeText: 'text-blue-700 dark:text-blue-100',
      defaultText: 'text-blue-800 dark:text-blue-100',
    },
    subdepartment: {
      text: 'text-gray-700 dark:text-gray-200',
      activeText: 'text-emerald-700 dark:text-emerald-100',
      defaultText: 'text-emerald-800 dark:text-emerald-100',
    },
    class: {
      text: 'text-gray-600 dark:text-gray-300',
      activeText: 'text-amber-700 dark:text-amber-100',
      defaultText: 'text-amber-800 dark:text-amber-100',
    },
    subclass: {
      text: 'text-gray-600 dark:text-gray-400',
      activeText: 'text-purple-700 dark:text-purple-100',
      defaultText: 'text-purple-800 dark:text-purple-100',
    },
  }

  const colors = levelColors[level] || levelColors.department
  const textColor = isActive && isDefault ? colors.defaultText : isActive ? colors.activeText : isDefault ? colors.defaultText : colors.text

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 min-w-0">
            <span className={`block whitespace-nowrap ${textColor} ${className}`}>
              {text}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p className="text-sm">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Helper function to filter items by default display
const filterByDefaultDisplay = <T extends { default_display?: boolean }>(items: T[], showDefaultOnly: boolean): T[] => {
  if (!showDefaultOnly) return items
  return items.filter(item => item.default_display === true)
}

// Helper function to check if item should be visible based on default display filter
const shouldShowItem = (item: { default_display?: boolean }, showDefaultOnly: boolean): boolean => {
  if (!showDefaultOnly) return true
  return item.default_display === true
}

export function DepartmentSidebar({
  departments,
  activeDept,
  activeSubdept,
  activeClass = '',
  activeSubclass = '',
  onDeptClick,
  onSubdeptClick,
  onClassClick = () => { },
  onSubclassClick = () => { },
  onToggleExpand = () => { },
  expandedItems = {},
  showDefaultDisplayOnly = false,
  onToggleDefaultDisplay = () => { },
  isCollapsed = false,
  onCollapseToggle,
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
      const classKeys = (dept.subdepartments || []).flatMap(subdept =>
        (subdept.classes || []).map(cls => `class-${dept.id}-${subdept.id}-${cls.id}`)
      )
      return [deptKey, ...subKeys, ...classKeys]
    })

    // Collapse or expand all
    allKeys.forEach(key => onToggleExpand(key))
  }

  // Count default display items
  const defaultDisplayCounts = React.useMemo(() => {
    let totalDefault = 0
    let totalItems = 0

    departments.forEach(dept => {
      totalItems++
      if (dept.default_display) totalDefault++

      dept.subdepartments?.forEach(subdept => {
        totalItems++
        if (subdept.default_display) totalDefault++

        subdept.classes?.forEach(cls => {
          totalItems++
          if (cls.default_display) totalDefault++

          cls.subClasses?.forEach(subcls => {
            totalItems++
            if (subcls.default_display) totalDefault++
          })
        })
      })
    })

    return { totalDefault, totalItems }
  }, [departments])

  const filteredDepartments = React.useMemo(() => {
    let depts = departments

    // 1. Apply ordering to all levels
    depts = depts.map(dept => ({
      ...dept,
      subdepartments: (dept.subdepartments || [])
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(subdept => ({
          ...subdept,
          classes: (subdept.classes || [])
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map(cls => ({
              ...cls,
              subClasses: (cls.subClasses || [])
                .sort((a, b) => (a.order || 0) - (b.order || 0))
            }))
        }))
    }))

    // 2. Apply default display filter
    if (showDefaultDisplayOnly) {
      depts = depts.map(dept => ({
        ...dept,
        subdepartments: (dept.subdepartments || [])
          .filter(subdept => shouldShowItem(subdept, showDefaultDisplayOnly))
          .map(subdept => ({
            ...subdept,
            classes: (subdept.classes || [])
              .filter(cls => shouldShowItem(cls, showDefaultDisplayOnly))
              .map(cls => ({
                ...cls,
                subClasses: (cls.subClasses || [])
                  .filter(subcls => shouldShowItem(subcls, showDefaultDisplayOnly))
              }))
          }))
      })).filter(dept =>
        shouldShowItem(dept, showDefaultDisplayOnly) ||
        (dept.subdepartments && dept.subdepartments.length > 0)
      )
    }

    // 3. Apply search filter (Updated logic)
    if (!searchQuery.trim()) return depts

    const query = searchQuery.toLowerCase()

    return depts.map(dept => {
      const deptMatches = dept.name.toLowerCase().includes(query);

      const filteredSubdepts = (dept.subdepartments || []).map(subdept => {
        // A subdept is considered a match if its parent matched OR its own name matches
        const subdeptMatches = deptMatches || subdept.name.toLowerCase().includes(query);

        const filteredClasses = (subdept.classes || []).map(cls => {
          // A class is considered a match if its parent matched OR its own name matches
          const classMatches = subdeptMatches || cls.name.toLowerCase().includes(query);

          const filteredSubClasses = (cls.subClasses || []).filter(subClass =>
            // Include if path matches OR subclass name matches
            classMatches || subClass.name.toLowerCase().includes(query)
          );

          return { ...cls, subClasses: filteredSubClasses };
        }).filter(cls =>
          // Keep class if: path matches OR its own name matches OR it has matching children
          subdeptMatches || cls.name.toLowerCase().includes(query) || cls.subClasses.length > 0
        );

        return { ...subdept, classes: filteredClasses };
      }).filter(subdept =>
        // Keep subdept if: path matches OR its own name matches OR it has matching children
        deptMatches || subdept.name.toLowerCase().includes(query) || subdept.classes.length > 0
      );

      return { ...dept, subdepartments: filteredSubdepts };
    }).filter(dept =>
      // Keep dept if: its own name matches OR it has matching children
      dept.name.toLowerCase().includes(query) || dept.subdepartments.length > 0
    );
  }, [departments, searchQuery, showDefaultDisplayOnly])

  if (isCollapsed) {
    return (
      <div className="w-full h-full flex flex-col bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 py-4 items-center">
        <TooltipProvider delayDuration={0}>
          <div className="flex flex-col items-center gap-4 w-full px-2">
            <Button variant="ghost" size="icon" onClick={onCollapseToggle} className="h-8 w-8 text-gray-400">
              <ChevronRight size={18} />
            </Button>
            <Separator className="w-8" />
            {filteredDepartments.map((dept) => (
              <Tooltip key={dept.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={activeDept === dept.id ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => onDeptClick(dept.id)}
                    className={cn(
                      "h-10 w-10 rounded-xl shrink-0 transition-all",
                      activeDept === dept.id
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                        : "text-gray-500 hover:bg-gray-100"
                    )}
                  >
                    <Layers size={20} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-medium">{dept.name}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <Layers className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Departments</h3>
          </div>

          <div className="flex items-center gap-1">
            {/* Add Collapse Toggle Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onCollapseToggle}
              className="h-8 w-8 text-gray-400 hover:text-gray-700"
            >
              <ChevronLeft size={18} />
            </Button>

            {/* Default Display Toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showDefaultDisplayOnly ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-8 px-2 text-xs",
                      showDefaultDisplayOnly
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    )}
                    onClick={onToggleDefaultDisplay}
                  >
                    {showDefaultDisplayOnly ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm">
                    {showDefaultDisplayOnly ? 'Show All Items' : 'Show Default Only'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {defaultDisplayCounts.totalDefault} of {defaultDisplayCounts.totalItems} items marked as default
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Expand/Collapse All */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    onClick={toggleAll}
                  >
                    <ChevronsUpDown className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm">{isAllCollapsed ? 'Expand All' : 'Collapse All'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Settings/Info Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" side="bottom" align="end">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-sm mb-2">Display Settings</h4>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center justify-between">
                        <span>Total Items:</span>
                        <Badge variant="outline">{defaultDisplayCounts.totalItems}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Default Display:</span>
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                          <Star className="h-3 w-3 mr-1" />
                          {defaultDisplayCounts.totalDefault}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Currently Showing:</span>
                        <Badge variant="outline">
                          {showDefaultDisplayOnly ? defaultDisplayCounts.totalDefault : defaultDisplayCounts.totalItems}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <p className="text-xs text-gray-500">
                      Items marked with ★ are set as default display. Use the eye icon to toggle between showing all items or only default items.
                    </p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
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

        {/* Filter Status */}
        {(showDefaultDisplayOnly || searchQuery) && (
          <div className="flex items-center gap-2 flex-wrap">
            {showDefaultDisplayOnly && (
              <Badge variant="secondary" className="text-xs">
                <Star className="h-3 w-3 mr-1" />
                Default Only
              </Badge>
            )}
            {searchQuery && (
              <Badge variant="outline" className="text-xs">
                <Search className="h-3 w-3 mr-1" />
                "{searchQuery}"
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredDepartments.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
            {searchQuery ? (
              <div>
                <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No departments found for "{searchQuery}"</p>
              </div>
            ) : showDefaultDisplayOnly ? (
              <div>
                <Star className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No default display items found</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={onToggleDefaultDisplay}
                >
                  Show All Items
                </Button>
              </div>
            ) : (
              <div>
                <Layers className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No departments found</p>
              </div>
            )}
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
                        "w-full flex items-center justify-between p-2.5 pl-3 pr-2.5 text-left transition-all duration-200 group relative rounded-lg",
                        activeDept === dept.id
                          ? dept.default_display
                            ? "bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-100 font-medium shadow-sm border border-blue-200"
                            : "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-100 font-medium shadow-sm"
                          : dept.default_display
                            ? "bg-blue-50/50 dark:bg-blue-900/20 text-gray-700 dark:text-gray-200 hover:bg-blue-100/70 dark:hover:bg-blue-900/40"
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
                            isActive={activeDept === dept.id && !activeSubdept && !activeClass && !activeSubclass}
                            isDefault={dept.default_display === true}
                            level="department"
                          />
                          <TruncatedText
                            text={dept.name}
                            className="max-w-[120px] font-medium text-sm"
                            level="department"
                            isActive={activeDept === dept.id && !activeSubdept && !activeClass && !activeSubclass}
                            isDefault={dept.default_display === true}
                          />
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
                                  "w-full flex items-center justify-between p-2 pl-7 pr-2 text-sm transition-colors duration-200 group relative rounded-md",
                                  isActive
                                    ? subdept.default_display
                                      ? "shadow-sm border border-emerald-200 dark:border-emerald-800"
                                      : "shadow-sm border border-emerald-200 dark:border-emerald-800"
                                    : subdept.default_display
                                      ? "shadow-sm"
                                      : "shadow-sm",
                                  "before:absolute before:left-4 before:top-1/2 before:-translate-y-1/2 before:w-1.5 before:h-1.5 before:rounded-full",
                                  isActive
                                    ? "before:bg-emerald-500 before:ring-2 before:ring-emerald-200 dark:before:ring-emerald-900/50"
                                    : subdept.default_display
                                      ? "before:bg-emerald-400 dark:before:bg-emerald-500"
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
                                      isActive={isActive && !activeClass && !activeSubclass}
                                      isDefault={subdept.default_display === true}
                                      level="subdepartment"
                                    />
                                    <TruncatedText
                                      text={subdept.name}
                                      className="max-w-[100px]"
                                      level="subdepartment"
                                      isActive={isActive && !activeClass && !activeSubclass}
                                      isDefault={subdept.default_display === true}
                                    />
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
                                              ? cls.default_display
                                                ? "shadow-sm border border-amber-200 dark:border-amber-800"
                                                : "shadow-sm border border-amber-200 dark:border-amber-800"
                                              : cls.default_display
                                                ? ""
                                                : "",
                                            "before:absolute before:left-6 before:top-1/2 before:-translate-y-1/2 before:w-1.5 before:h-1.5 before:rounded-full",
                                            activeClass === cls.id.toString()
                                              ? "before:bg-amber-500 before:ring-2 before:ring-amber-200 dark:before:ring-amber-900/50"
                                              : cls.default_display
                                                ? "before:bg-amber-400 dark:before:bg-amber-500"
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
                                                isActive={activeClass === cls.id.toString() && !activeSubclass}
                                                isDefault={cls.default_display === true}
                                                level="class"
                                              />
                                              <TruncatedText
                                                text={cls.name}
                                                className="max-w-[80px]"
                                                level="class"
                                                isActive={activeClass === cls.id.toString() && !activeSubclass}
                                                isDefault={cls.default_display === true}
                                              />
                                            </div>
                                          </div>
                                          {subClasses.length > 0 && (
                                            <Badge variant="outline" className="h-4 text-xs">
                                              {subClasses.length}
                                            </Badge>
                                          )}
                                        </button>
                                      </CollapsibleTrigger>

                                      <CollapsibleContent className="ml-3 mt-1 space-y-1">
                                        {subClasses.map((subClass, subclassIndex) => (
                                          <button
                                            key={subClass.id}
                                            className={cn(
                                              "w-full text-left p-1.5 pl-12 pr-2 text-sm rounded-md transition-all duration-200 relative group",
                                              activeSubclass === subClass.id.toString()
                                                ? subClass.default_display
                                                  ? "shadow-sm border border-purple-200 dark:border-purple-800"
                                                  : "shadow-sm border border-purple-200 dark:border-purple-800"
                                                : subClass.default_display
                                                  ? ""
                                                  : "",
                                              "before:absolute before:left-8 before:top-1/2 before:-translate-y-1/2 before:w-1.5 before:h-1.5 before:rounded-full before:transition-all",
                                              activeSubclass === subClass.id.toString()
                                                ? "before:bg-purple-500 before:ring-2 before:ring-purple-200 dark:before:ring-purple-900/40"
                                                : subClass.default_display
                                                  ? "before:bg-purple-400 dark:before:bg-purple-500"
                                                  : "before:bg-gray-300/70 dark:before:bg-gray-500/50 group-hover:before:bg-gray-400/70 dark:group-hover:before:bg-gray-400/50"
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
                                            <div className="flex items-center">
                                              <IndexBadge
                                                index={`${deptIndex + 1}.${subdeptIndex + 1}.${classIndex + 1}.${subclassIndex + 1}`}
                                                isActive={activeSubclass === subClass.id.toString()}
                                                isDefault={subClass.default_display === true}
                                                level="subclass"
                                              />
                                              <TruncatedText
                                                text={subClass.name}
                                                className="max-w-[70px]"
                                                level="subclass"
                                                isActive={activeSubclass === subClass.id.toString()}
                                                isDefault={subClass.default_display === true}
                                              />
                                            </div>
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
          })
        )}
      </div>

      {/* Footer with stats when filtering */}
      {showDefaultDisplayOnly && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Showing default display items</span>
            <Badge variant="outline" className="text-xs">
              <Star className="h-3 w-3 mr-1" />
              {defaultDisplayCounts.totalDefault} / {defaultDisplayCounts.totalItems}
            </Badge>
          </div>
        </div>
      )}
    </div>
  )
}