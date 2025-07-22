// @ts-nocheck
"use client"
import React, { useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"

// The props are similar to the original component, focusing on the data and handlers needed for this view.
interface StagesTransposedViewProps {
  currentDept: any
  processedSubdepartments: any[]
  handleAllocationChange: (subdeptId: number, stageId: string, shouldAllocate: boolean, classIndex?: number, subclassIndex?: number) => Promise<void>
  setEditingStage: (stage: any) => void
  minutesToTimeString: (minutes: number | null) => string
  handleKeyDown: (e: React.KeyboardEvent, subdeptId: number, stageId: string, shouldAllocate: boolean) => void
}

export function StagesTransposedView({
  currentDept,
  processedSubdepartments,
  handleAllocationChange,
  setEditingStage,
  minutesToTimeString,
  handleKeyDown,
}: StagesTransposedViewProps) {

  // useMemo hook to compute the column and header structure.
  // This is crucial for performance, as it avoids recalculating on every render.
  const { columns, subDeptHeaders, classHeaders } = useMemo(() => {
    const flatColumns = []
    const subDeptHeadersData = []
    const classHeadersData = []

    if (processedSubdepartments) {
      processedSubdepartments.forEach((subdept, subdeptIndex) => {
        let subDeptColSpan = 0
        if (subdept.classes && subdept.classes.length > 0) {
          subdept.classes.forEach((cls, classIndex) => {
            let classColSpan = 0
            if (cls.subClasses && cls.subClasses.length > 0) {
              cls.subClasses.forEach((subCls, subclassIndex) => {
                flatColumns.push({
                  subdeptId: subdept.id,
                  classId: cls.id,
                  subclass: subCls,
                  classIndex,
                  subclassIndex,
                })
                classColSpan++
                subDeptColSpan++
              })
            }
            if (classColSpan > 0) {
              classHeadersData.push({ name: cls.name, colSpan: classColSpan })
            }
          })
        }
        if (subDeptColSpan > 0) {
          subDeptHeadersData.push({ name: subdept.name, colSpan: subDeptColSpan })
        }
      })
    }
    
    return { columns: flatColumns, subDeptHeaders: subDeptHeadersData, classHeaders: classHeadersData }
  }, [processedSubdepartments])

  if (columns.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        No subclass entities available to display.
        <br />
        Please add classes and subclasses to the sub-departments.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto border rounded-lg relative">
      <Table className="min-w-full border-collapse">
        <TableHeader>
          {/* Row 1: Sub-Departments */}
          <TableRow className="bg-muted/50">
            <TableHead
              rowSpan={3}
              className="sticky left-0 bg-background z-20 border-b border-r align-middle min-w-[250px] lg:min-w-[300px]"
            >
              Stage
            </TableHead>
            {subDeptHeaders.map((header, index) => (
              <TableHead
                key={`subdept-header-${index}`}
                colSpan={header.colSpan}
                className="text-center p-2 font-semibold border-b border-r"
              >
                {header.name}
              </TableHead>
            ))}
          </TableRow>
          {/* Row 2: Classes */}
          <TableRow className="bg-muted/30">
            {classHeaders.map((header, index) => (
              <TableHead
                key={`class-header-${index}`}
                colSpan={header.colSpan}
                className="text-center p-2 border-b border-r text-muted-foreground"
              >
                {header.name}
              </TableHead>
            ))}
          </TableRow>
          {/* Row 3: Sub-Classes */}
          <TableRow className="bg-muted/20">
            {columns.map((col, index) => (
              <TableHead
                key={`subclass-header-${index}`}
                className="text-center p-2 font-normal text-muted-foreground border-b border-r"
              >
                {col.subclass.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {currentDept.stages.map((stage) => {
            const durationString = minutesToTimeString(stage.estimated_time)
            return (
              <TableRow key={stage.id} className="hover:bg-muted/50">
                {/* Sticky Stage Info Cell */}
                <TableCell className="sticky left-0 bg-background z-10 border-r font-medium">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-semibold">{stage.name}</p>
                      <div className="text-xs text-muted-foreground space-y-1 mt-1">
                        {durationString && <p>Duration: {durationString}</p>}
                        {stage.follow_up && <p>Follow Up: {stage.follow_up}</p>}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={() => setEditingStage(stage)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>

                {/* Data Cells with Checkboxes */}
                {columns.map((col, colIndex) => {
                  const stageAllocation = col.subclass.stages?.find((s: any) => s.stage_id === stage.id)
                  const isAllocated = stageAllocation?.applicable !== false

                  return (
                    <TableCell
                      key={`${stage.id}-${col.subclass.id || colIndex}`}
                      className="text-center p-4 border-r align-middle"
                    >
                      <Checkbox
                        checked={isAllocated}
                        onCheckedChange={(checked) =>
                          handleAllocationChange(
                            col.subdeptId,
                            stage.id,
                            checked === true,
                            col.classIndex,
                            col.subclassIndex
                          )
                        }
                        onKeyDown={(e) => handleKeyDown(e, col.subdeptId, stage.id, !isAllocated)}
                        aria-label={`Allocate stage ${stage.name} to ${col.subclass.name}`}
                      />
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}