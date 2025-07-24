// @ts-nocheck
"use client"
import React from "react" // Added for React.Fragment
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Pencil, ChevronDown, ChevronUp, Info } from "lucide-react" // Removed Check, X. Added Info.
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface StagesTableViewProps {
  currentDept: any
  processedSubdepartments: any[]
  expandedRows: Set<string>
  columnVisibility: any
  handleAllocationChange: (subdeptId: number, stageId: string, shouldAllocate: boolean, classIndex?: number, subclassIndex?: number) => Promise<void>
  handleDisplayToggle: (subdeptId: number, stageId: string, checked: boolean, classIndex?: number, subclassIndex?: number) => Promise<void>
  setEditingStage: (stage: any) => void
  getTimeFromMinutes: (minutes: number | null) => { days: number; hours: number; minutes: number }
  minutesToTimeString: (minutes: number | null) => string
  toggleRowExpansion: (rowId: string) => void
  handleKeyDown: (e: React.KeyboardEvent, subdeptId: number, stageId: string, shouldAllocate: boolean) => void
  DocumentDisplay: React.FC<{ doc: any }>
}

// Debug logging utility
const debugLog = (message: string, data?: any) => {
  console.log(`[StagesTableView] ${message}`, data || '');
};

export function StagesTableView({
  currentDept,
  processedSubdepartments,
  expandedRows,
  columnVisibility,
  handleAllocationChange,
  handleDisplayToggle,
  setEditingStage,
  getTimeFromMinutes,
  minutesToTimeString,
  toggleRowExpansion,
  handleKeyDown,
  DocumentDisplay
}: StagesTableViewProps) {
  // Log when component renders and receives props
  debugLog('Rendering with props:', {
    currentDeptId: currentDept?.id,
    subdepartmentsCount: processedSubdepartments?.length,
    expandedRows: Array.from(expandedRows),
    columnVisibility
  });

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            {columnVisibility.index && <TableHead className="w-12">#</TableHead>}
            {columnVisibility.entity && <TableHead className="min-w-[200px]">Department / Entity</TableHead>}
            {columnVisibility.stageName && <TableHead className="min-w-[200px]">Stage Names</TableHead>}
            {columnVisibility.duration && <TableHead className="w-32">Duration</TableHead>}
            {columnVisibility.followUp && <TableHead className="w-32">Follow Up</TableHead>}
            {columnVisibility.controls && <TableHead className="w-48">Controls</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {processedSubdepartments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No subdepartments to display.
              </TableCell>
            </TableRow>
          ) : (
            processedSubdepartments.map((subdept) => {
              const hasClasses = subdept.classes && subdept.classes.length > 0
              const subdeptRowId = `subdept-${subdept.id}`
              const isExpanded = expandedRows.has(subdeptRowId)
              
              // Log for each subdepartment being rendered
              debugLog('Processing subdepartment:', subdept);

              return (
                <React.Fragment key={subdeptRowId}>
                  {/* Subdepartment Row (Level 1) */}
                  <TableRow
                    className={cn("hover:bg-muted/50 cursor-pointer", hasClasses && "bg-muted/20")}
                    onClick={() => hasClasses && toggleRowExpansion(subdeptRowId)}
                  >
                    <TableCell className="w-12">
                      {hasClasses && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleRowExpansion(subdeptRowId)
                          }}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      )}
                    </TableCell>
                    {columnVisibility.index && <TableCell className="font-medium">{subdept.order_num}</TableCell>}
                    <TableCell className="font-medium">
                        {subdept.name}
                    </TableCell>
                    <TableCell colSpan={4}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {currentDept.stages.map((stage) => {
                          const stageAllocation = subdept.stages?.find((s: any) => s.stage_id === stage.id)
                          const isAllocated = stageAllocation?.applicable !== false
                          
                          return (
                            <div
                              key={stage.id}
                              className={cn(
                                "px-2 py-1 text-xs rounded border",
                                isAllocated
                                  ? "bg-green-50 border-green-200 text-green-800"
                                  : "bg-gray-100 border-gray-200 text-gray-500"
                              )}
                            >
                              {stage.name}
                            </div>
                          )
                        })}
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Class Rows (Level 2) - Expanded content for subdepartment */}
                  {isExpanded && hasClasses && subdept.classes.map((cls: any, clsIndex: number) => {
                    const classRowId = `class-${subdept.id}-${cls.id || clsIndex}`
                    const isClassExpanded = expandedRows.has(classRowId)
                    const hasSubClasses = cls.subClasses && cls.subClasses.length > 0
                    
                    debugLog('Processing class:', { class: cls, isExpanded: isClassExpanded });

                    return (
                      <React.Fragment key={classRowId}>
                        <TableRow
                          className={cn("hover:bg-muted/30 cursor-pointer", hasSubClasses && "bg-muted/10")}
                          onClick={() => hasSubClasses && toggleRowExpansion(classRowId)}
                        >
                          <TableCell className="pl-12">
                            {hasSubClasses && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleRowExpansion(classRowId)
                                }}
                              >
                                {isClassExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                            )}
                          </TableCell>
                          {columnVisibility.index && <TableCell className="text-muted-foreground">{cls.order_num}</TableCell>}
                          <TableCell className="text-muted-foreground pl-8">{cls.name}</TableCell>
                          <TableCell colSpan={4}>
                            <div className="flex items-center gap-2 flex-wrap">
                              {currentDept.stages.map((stage: any) => {
                                const stageAllocation = cls.stages?.find((s: any) => s.stage_id === stage.id)
                                const isAllocated = stageAllocation?.applicable !== false
                                
                                return (
                                  <div key={stage.id} className="relative group p-1">
                                    <div className="flex items-center">
                                      <div
                                        className={cn(
                                          "px-2 py-1 text-xs rounded border flex-1",
                                          isAllocated
                                            ? "bg-green-50 border-green-200 text-green-800"
                                            : "bg-gray-100 border-gray-200 text-gray-500"
                                        )}
                                      >
                                        {stage.name}
                                      </div>
                                      <div className="absolute right-0 top-0 h-full flex items-center pr-1 bg-white bg-opacity-80 group-hover:bg-opacity-100 transition-opacity">
                                        {/* --- NEW STATUS POPOVER --- */}
                                        {stage.status && (
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 opacity-0 group-hover:opacity-100 text-blue-500 hover:bg-blue-50"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                <Info className="h-3.5 w-3.5" />
                                              </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-64 p-3 text-sm" align="start">
                                              <div className="space-y-2">
                                                <h4 className="font-medium">Stage Status</h4>
                                                <p className="text-muted-foreground">{stage.status}</p>
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                        )}
                                        {/* --- END NEW --- */}
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-blue-600 hover:bg-blue-50"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingStage(stage);
                                          }}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Sub-Class Rows (Level 3) - Expanded content for class */}
                        {isClassExpanded && hasSubClasses && cls.subClasses.map((subCls: any, subClsIndex: number) => {
                           debugLog('Processing sub-class:', subCls);
                           return (
                            <TableRow key={`subclass-${subdept.id}-${cls.id || clsIndex}-${subCls.id || subClsIndex}`}>
                                <TableCell className="pl-20"></TableCell>
                                {columnVisibility.index && <TableCell className="text-muted-foreground">{subCls.order_num}</TableCell>}
                                <TableCell className="text-muted-foreground pl-12">{subCls.name}</TableCell>
                                <TableCell className="space-y-2 align-top py-4">
                                {currentDept.stages.map((stage: any) => {
                                    const stageAllocation = subCls.stages?.find((s: any) => s.stage_id === stage.id)
                                    const isAllocated = stageAllocation?.applicable !== false

                                    return (
                                    <div key={stage.id} className="relative group flex items-center h-7">
                                        <Checkbox
                                            id={`cb-${stage.id}-${subdept.id}-${cls.id}-${subCls.id}`}
                                            checked={isAllocated}
                                            onCheckedChange={(checked) =>
                                                handleAllocationChange(subdept.id, stage.id, checked === true, clsIndex, subClsIndex)
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                            onKeyDown={(e) => handleKeyDown(e, subdept.id, stage.id, !isAllocated)}
                                            className="h-4 w-4"
                                        />
                                        <label
                                            htmlFor={`cb-${stage.id}-${subdept.id}-${cls.id}-${subCls.id}`}
                                            className={cn(
                                                "text-sm cursor-pointer flex-1 ml-2",
                                                isAllocated ? "font-medium" : "text-muted-foreground"
                                            )}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {stage.name}
                                        </label>
                                        <div className="absolute right-0 top-0 h-full flex items-center pr-1 bg-white bg-opacity-80 group-hover:bg-opacity-100 transition-opacity">
                                            {/* --- NEW STATUS POPOVER --- */}
                                            {stage.status && (
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-blue-500 hover:bg-blue-50"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <Info className="h-3.5 w-3.5" />
                                                    </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-64 p-3 text-sm" align="start">
                                                    <div className="space-y-2">
                                                        <h4 className="font-medium">Stage Status</h4>
                                                        <p className="text-muted-foreground">{stage.status}</p>
                                                    </div>
                                                    </PopoverContent>
                                                </Popover>
                                            )}
                                            {/* --- END NEW --- */}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 opacity-0 group-hover:opacity-100 text-blue-600 hover:bg-blue-50"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingStage(stage);
                                                }}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                    )
                                })}
                                </TableCell>
                                <TableCell className="space-y-2 align-top py-4">
                                {currentDept.stages.map((stage: any) => (
                                    <div key={stage.id} className="text-sm text-muted-foreground flex items-center h-7">
                                        {minutesToTimeString(stage.estimated_time)}
                                    </div>
                                ))}
                                </TableCell>
                                <TableCell className="space-y-2 align-top py-4">
                                {currentDept.stages.map((stage: any) => (
                                    <div key={stage.id} className="text-sm text-muted-foreground flex items-center h-7">
                                        {stage.follow_up || 'None'}
                                    </div>
                                ))}
                                </TableCell>
                                <TableCell className="space-y-2 align-top py-4">
                                {currentDept.stages.map((stage: any) => {
                                    const stageAllocation = subCls.stages?.find((s: any) => s.stage_id === stage.id)
                                    const isAllocated = stageAllocation?.applicable !== false
                                    const isDisplayed = stageAllocation?.display !== false

                                    return (
                                        <div key={stage.id} className="flex items-center gap-2 h-7">
                                            <span className={cn("text-xs px-2 py-1 rounded", isAllocated ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500")}>
                                            {isAllocated ? 'Applicable' : 'N/A'}
                                            </span>
                                            {isAllocated && (
                                            <span className={cn("text-xs px-2 py-1 rounded", isDisplayed ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-500")}>
                                                {isDisplayed ? 'Visible' : 'Hidden'}
                                            </span>
                                            )}
                                        </div>
                                    )
                                })}
                                </TableCell>
                            </TableRow>
                           );
                        })}
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}