// @ts-nocheck
"use client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Pencil, ChevronDown, ChevronUp, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"

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
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                No subdepartments found
              </TableCell>
            </TableRow>
          ) : (
            processedSubdepartments.map((subdept) => {
              const hasClasses = subdept.classes && subdept.classes.length > 0
              const subdeptRowId = `subdept-${subdept.id}`
              const isExpanded = expandedRows.has(subdeptRowId)

              return (
                <React.Fragment key={subdeptRowId}>
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
                      <div className="flex items-center gap-2">
                        {subdept.name}
                        {subdept.default_display === false && (
                          <span className="text-xs text-muted-foreground">(Hidden by default)</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell colSpan={4}>
                      <div className="flex items-center gap-2">
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

                  {/* Expanded content for subdepartment */}
                  {isExpanded && subdept.classes?.map((cls: any, clsIndex: number) => {
                    const classRowId = `class-${subdept.id}-${cls.id || clsIndex}`
                    const isClassExpanded = expandedRows.has(classRowId)
                    const hasSubClasses = cls.subClasses && cls.subClasses.length > 0

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
                          <TableCell className="text-muted-foreground pl-8">
                            <div className="flex items-center gap-2">
                              {cls.name}
                              {cls.default_display === false && (
                                <span className="text-xs text-muted-foreground">(Hidden by default)</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell colSpan={4}>
                            <div className="flex items-center gap-2">
                              {currentDept.stages.map((stage: any) => {
                                const stageAllocation = cls.stages?.find((s: any) => s.stage_id === stage.id)
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

                        {/* Expanded content for class */}
                        {isClassExpanded && cls.subClasses?.map((subCls: any, subClsIndex: number) => (
                          <TableRow key={`subclass-${subdept.id}-${cls.id || clsIndex}-${subCls.id || subClsIndex}`}>
                            <TableCell className="pl-20"></TableCell>
                            {columnVisibility.index && <TableCell className="text-muted-foreground">{subCls.order_num}</TableCell>}
                            <TableCell className="text-muted-foreground pl-12">
                              <div className="flex items-center gap-2">
                                {subCls.name}
                                {subCls.default_display === false && (
                                  <span className="text-xs text-muted-foreground">(Hidden by default)</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="space-y-2">
                              {currentDept.stages.map((stage: any) => {
                                const stageAllocation = subCls.stages?.find((s: any) => s.stage_id === stage.id)
                                const isAllocated = stageAllocation?.applicable !== false
                                const isDisplayed = stageAllocation?.display !== false

                                return (
                                  <div key={stage.id} className="flex items-center gap-2">
                                    <Checkbox
                                      id={`${stage.id}-${subdept.id}-${cls.id}-${subCls.id}`}
                                      checked={isAllocated}
                                      onCheckedChange={(checked) =>
                                        handleAllocationChange(
                                          subdept.id,
                                          stage.id,
                                          checked === true,
                                          clsIndex,
                                          subClsIndex
                                        )
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) =>
                                        handleKeyDown(e, subdept.id, stage.id, !isAllocated)
                                      }
                                      className="h-4 w-4"
                                    />
                                    <label
                                      htmlFor={`${stage.id}-${subdept.id}-${cls.id}-${subCls.id}`}
                                      className={cn(
                                        "text-sm cursor-pointer",
                                        isAllocated ? "font-medium" : "text-muted-foreground"
                                      )}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {stage.name}
                                    </label>
                                  </div>
                                )
                              })}
                            </TableCell>
                            <TableCell>
                              {currentDept.stages.map((stage: any) => {
                                const time = getTimeFromMinutes(stage.estimated_time)
                                return (
                                  <div key={stage.id} className="text-sm text-muted-foreground">
                                    {time.days > 0 && `${time.days}d `}
                                    {time.hours > 0 && `${time.hours}h `}
                                    {time.minutes > 0 ? `${time.minutes}m` : time.days === 0 && time.hours === 0 ? '0m' : ''}
                                  </div>
                                )
                              })}
                            </TableCell>
                            <TableCell>
                              {currentDept.stages.map((stage: any) => (
                                <div key={stage.id} className="text-sm text-muted-foreground">
                                  {stage.follow_up || 'None'}
                                </div>
                              ))}
                            </TableCell>
                            <TableCell>
                              {currentDept.stages.map((stage: any) => {
                                const stageAllocation = subCls.stages?.find((s: any) => s.stage_id === stage.id)
                                const isAllocated = stageAllocation?.applicable !== false
                                const isDisplayed = stageAllocation?.display !== false

                                return (
                                  <div key={stage.id} className="flex items-center gap-2">
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
                        ))}
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
