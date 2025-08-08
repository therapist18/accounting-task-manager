'use client'

import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight, Layers, Search, ChevronsUpDown, Eye, EyeOff, Star, RotateCcw, Settings } from "lucide-react"
import { Badge } from "@/components/ui/badge"

// Base interface for items that can be ordered
interface OrderedItem {
  order?: number;
  default_display?: boolean;
  id: string;
  name: string;
}

// Extended interfaces for the hierarchy
interface SubClass extends OrderedItem {
  // Additional properties specific to SubClass
}

interface Class extends OrderedItem {
  subClasses?: SubClass[];
}

interface SubDepartment extends OrderedItem {
  classes?: Class[];
}

interface Department extends OrderedItem {
  description?: string;
  subdepartments?: SubDepartment[];
}
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import React from "react"

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
  // New props for default display functionality
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
      bg: 'bg-blue-100 dark:bg-blue-900/50',
      text: 'text-blue-700 dark:text-blue-200',
      activeBg: 'bg-blue-100 dark:bg-blue-900/50',
      activeText: 'text-blue-700 dark:text-blue-200',
      defaultBg: 'bg-blue-200 dark:bg-blue-800',
      defaultText: 'text-blue-800 dark:text-blue-100',
    },
    subdepartment: {
      bg: 'bg-emerald-100 dark:bg-emerald-900/40',
      text: 'text-emerald-700 dark:text-emerald-200',
      activeBg: 'bg-emerald-100 dark:bg-emerald-900/40',
      activeText: 'text-emerald-700 dark:text-emerald-200',
      defaultBg: 'bg-emerald-200 dark:bg-emerald-800',
      defaultText: 'text-emerald-800 dark:text-emerald-100',
    },
    class: {
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      text: 'text-amber-700 dark:text-amber-200',
      activeBg: 'bg-amber-100 dark:bg-amber-900/30',
      activeText: 'text-amber-700 dark:text-amber-200',
      defaultBg: 'bg-amber-200 dark:bg-amber-800',
      defaultText: 'text-amber-800 dark:text-amber-100',
    },
    subclass: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
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
      "flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium mr-2 flex-shrink-0 transition-all relative",
      isActive && isDefault ? colors.defaultBg : isActive ? colors.activeBg : isDefault ? colors.defaultBg : colors.bg,
      isActive && isDefault ? colors.defaultText : isActive ? colors.activeText : isDefault ? colors.defaultText : colors.text
    )}>
      {index}
      {isDefault && (
        <Star className="absolute -top-1 -right-1 h-2.5 w-2.5 text-yellow-500 fill-yellow-500" />
      )}
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
            <span className={`truncate block ${textColor} ${className}`}>
              {text}
            </span>
            {isDefault && (
              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p className="text-sm">
            {text}
            {isDefault && (
              <span className="block text-xs text-yellow-600 mt-1">★ Default Display</span>
            )}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Helper function to sort items by order
const sortByOrder = <T extends OrderedItem>(items: T[]): T[] => {
  return [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
};

// Helper function to filter items by default display
const filterByDefaultDisplay = <T extends OrderedItem>(items: T[], showDefaultOnly: boolean): T[] => {
  if (!showDefaultOnly) return items;
  return items.filter(item => item.default_display !== false);
};

// Helper function to check if item should be visible based on default display filter
const shouldShowItem = <T extends OrderedItem>(item: T, showDefaultOnly: boolean): boolean => {
  return !showDefaultOnly || item.default_display !== false;
};

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
  showDefaultDisplayOnly = true,
  onToggleDefaultDisplay = () => {},
}: DepartmentSidebarProps) {
  const [searchQuery, setSearchQuery] = React.useState('')
  const [isAllCollapsed, setIsAllCollapsed] = React.useState(false)

  // Event handlers that ensure string IDs
  const handleDeptClick = (deptId: string | number) => {
    onDeptClick(String(deptId));
  };

  const handleSubdeptClick = (deptId: string | number, subdeptId: string | number) => {
    onSubdeptClick(String(deptId), String(subdeptId));
  };

  const handleClassClick = (deptId: string | number, subdeptId: string | number, classId: string | number) => {
    onClassClick(String(deptId), String(subdeptId), String(classId));
  };

  const handleSubclassClick = (deptId: string | number, subdeptId: string | number, classId: string | number, subclassId: string | number) => {
    onSubclassClick(
      String(deptId), 
      String(subdeptId), 
      String(classId), 
      String(subclassId)
    );
  };
  
  const toggleAll = () => {
    const newState = !isAllCollapsed;
    setIsAllCollapsed(newState);
    
    // Get all department and subdepartment keys
    const allKeys = departments.flatMap(dept => {
      const deptKey = `dept-${dept.id}`;
      const subKeys = (dept.subdepartments || []).map(
        subdept => `subdept-${dept.id}-${subdept.id}`
      );
      const classKeys = (dept.subdepartments || []).flatMap(subdept => 
        (subdept.classes || []).map(cls => `class-${dept.id}-${subdept.id}-${cls.id}`)
      );
      return [deptKey, ...subKeys, ...classKeys];
    });
    
    // Collapse or expand all
    allKeys.forEach(key => onToggleExpand(key));
  };

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
    // Start with a properly typed copy of departments
    let depts: Department[] = JSON.parse(JSON.stringify(departments));
    
    // Ensure all IDs are strings
    const ensureStringIds = <T extends { id: string | number }>(items: T[]): T[] => {
      return items.map(item => ({
        ...item,
        id: String(item.id)
      })) as T[];
    };
    
    // Process departments to ensure string IDs and sort by order
    depts = sortByOrder(ensureStringIds(depts));
    
    // Apply default display filter first
    if (showDefaultDisplayOnly) {
      depts = depts
        .map(dept => {
          const processedDept: Department = {
            ...dept,
            subdepartments: sortByOrder(ensureStringIds(dept.subdepartments || []))
              .filter((subdept: SubDepartment) => shouldShowItem(subdept, showDefaultDisplayOnly))
              .map((subdept: SubDepartment) => ({
                ...subdept,
                classes: sortByOrder(ensureStringIds(subdept.classes || []))
                  .filter((cls: Class) => shouldShowItem(cls, showDefaultDisplayOnly))
                  .map((cls: Class) => ({
                    ...cls,
                    subClasses: sortByOrder(ensureStringIds(cls.subClasses || []))
                      .filter((subcls: SubClass) => shouldShowItem(subcls, showDefaultDisplayOnly))
                  }))
              }))
          };
          return processedDept;
        })
        .filter((dept: Department) => 
          shouldShowItem(dept, showDefaultDisplayOnly) || 
          (dept.subdepartments && dept.subdepartments.length > 0)
        );
    }
    
    // Apply search filter
    if (!searchQuery.trim()) return depts;
    
    const query = searchQuery.toLowerCase();
    return depts
      .map((dept: Department) => {
        // Ensure all IDs are strings before processing
        const subdepartments = ensureStringIds(dept.subdepartments || []);
        
        const filteredSubdepts = sortByOrder(subdepartments)
          .map((subdept: SubDepartment) => {
            const classes = ensureStringIds(subdept.classes || []);
            
            const filteredClasses = sortByOrder(classes)
              .map((cls: Class) => ({
                ...cls,
                subClasses: sortByOrder(ensureStringIds(cls.subClasses || []))
                  .filter((subClass: SubClass) => 
                    subClass.name.toLowerCase().includes(query)
                  )
              }))
              .filter((cls: Class) => 
                cls.name.toLowerCase().includes(query) || 
                (cls.subClasses && cls.subClasses.length > 0)
              )
            
            return {
              ...subdept,
              classes: filteredClasses
            };
          })
          .filter((subdept: SubDepartment) => 
            subdept.name.toLowerCase().includes(query) || 
            (subdept.classes && subdept.classes.length > 0)
          );
        
        return {
          ...dept,
          subdepartments: filteredSubdepts
        };
      })
      .filter((dept: Department) => 
        dept.name.toLowerCase().includes(query) || 
        (dept.subdepartments && dept.subdepartments.length > 0)
      );
  }, [departments, searchQuery, showDefaultDisplayOnly])

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
          
          {/* Controls */}
          <div className="flex items-center gap-1">
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
                      onClick={() => handleDeptClick(dept.id)}
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
                                      ? "bg-emerald-100/80 dark:bg-emerald-900/50 shadow-sm border border-emerald-200 dark:border-emerald-800"
                                      : "bg-emerald-100/70 dark:bg-emerald-900/40 shadow-sm border border-emerald-200 dark:border-emerald-800"
                                    : subdept.default_display
                                      ? "bg-emerald-50/50 dark:bg-emerald-900/20 text-gray-600 dark:text-gray-300 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30"
                                      : "text-gray-600 dark:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-gray-800/40",
                                  "before:absolute before:left-4 before:top-1/2 before:-translate-y-1/2 before:w-1.5 before:h-1.5 before:rounded-full",
                                  isActive 
                                    ? "before:bg-emerald-500 before:ring-2 before:ring-emerald-200 dark:before:ring-emerald-900/50" 
                                    : subdept.default_display
                                      ? "before:bg-emerald-400 dark:before:bg-emerald-500"
                                      : "before:bg-gray-300 dark:before:bg-gray-600"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSubdeptClick(dept.id, subdept.id)
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
                                                ? "bg-amber-100/80 dark:bg-amber-900/50 shadow-sm border border-amber-200 dark:border-amber-800"
                                                : "bg-amber-100/70 dark:bg-amber-900/40 shadow-sm border border-amber-200 dark:border-amber-800"
                                              : cls.default_display
                                                ? "bg-amber-50/50 dark:bg-amber-900/20 text-gray-600 dark:text-gray-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30"
                                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/40",
                                            "before:absolute before:left-6 before:top-1/2 before:-translate-y-1/2 before:w-1.5 before:h-1.5 before:rounded-full",
                                            activeClass === cls.id.toString()
                                              ? "before:bg-amber-500 before:ring-2 before:ring-amber-200 dark:before:ring-amber-900/50"
                                              : cls.default_display
                                                ? "before:bg-amber-400 dark:before:bg-amber-500"
                                                : "before:bg-gray-300 dark:before:bg-gray-600"
                                          )}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleClassClick(dept.id, subdept.id, cls.id)
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
                                                  ? "bg-purple-100/80 dark:bg-purple-900/50 shadow-sm border border-purple-200 dark:border-purple-800"
                                                  : "bg-purple-50/80 dark:bg-purple-900/30 shadow-sm border border-purple-100 dark:border-purple-800/50"
                                                : subClass.default_display
                                                  ? "bg-purple-50/50 dark:bg-purple-900/20 text-gray-600 dark:text-gray-400 hover:bg-purple-100/50 dark:hover:bg-purple-900/30"
                                                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100/40 dark:hover:bg-gray-800/30",
                                              "before:absolute before:left-8 before:top-1/2 before:-translate-y-1/2 before:w-1.5 before:h-1.5 before:rounded-full before:transition-all",
                                              activeSubclass === subClass.id.toString()
                                                ? "before:bg-purple-500 before:ring-2 before:ring-purple-200 dark:before:ring-purple-900/40"
                                                : subClass.default_display
                                                  ? "before:bg-purple-400 dark:before:bg-purple-500"
                                                  : "before:bg-gray-300/70 dark:before:bg-gray-500/50 group-hover:before:bg-gray-400/70 dark:group-hover:before:bg-gray-400/50"
                                            )}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleSubclassClick(
                                                dept.id, 
                                                subdept.id, 
                                                cls.id, 
                                                subClass.id
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