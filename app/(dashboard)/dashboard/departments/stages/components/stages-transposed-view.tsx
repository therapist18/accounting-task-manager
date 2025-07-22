// @ts-nocheck
"use client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"

interface StagesTransposedViewProps {
  currentDept: any
  leafEntities: Array<{
    id: string
    name: string
    type: string
    path: string
    subdeptId: number
    classIndex?: number
    subclassIndex?: number
  }>
  expandedRows: Set<string>
  columnVisibility: any
  handleAllocationChange: (subdeptId: number, stageId: string, shouldAllocate: boolean, classIndex?: number, subclassIndex?: number) => Promise<void>
  handleDisplayToggle: (subdeptId: number, stageId: string, checked: boolean, classIndex?: number, subclassIndex?: number) => Promise<void>
  setEditingStage: (stage: any) => void
  getTimeFromMinutes: (minutes: number | null) => { days: number; hours: number; minutes: number }
  minutesToTimeString: (minutes: number | null) => string
  toggleRowExpansion: (rowId: string) => void
  DocumentDisplay: React.FC<{ doc: any }>
}

export function StagesTransposedView({
  currentDept,
  leafEntities,
  expandedRows,
  columnVisibility,
  handleAllocationChange,
  handleDisplayToggle,
  setEditingStage,
  getTimeFromMinutes,
  minutesToTimeString,
  toggleRowExpansion,
  DocumentDisplay
}: StagesTransposedViewProps) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            {columnVisibility.index && <TableHead className="w-12">#</TableHead>}
            {columnVisibility.entity && <TableHead className="min-w-[200px]">Stage Info</TableHead>}
            {leafEntities.map((entity) => (
              <TableHead key={entity.id} className="min-w-[150px] align-bottom">
                <div className="flex flex-col">
                  <span className="font-medium">{entity.name}</span>
                  <span className="text-xs text-muted-foreground">{entity.type}</span>
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {currentDept.stages.map((stage: any) => {
            const stageRowId = `stage-${stage.id}`
            const isExpanded = expandedRows.has(stageRowId)
            const hasDocuments = stage.documents && stage.documents.length > 0
            const time = getTimeFromMinutes(stage.estimated_time)

            return (
              <React.Fragment key={stage.id}>
                <TableRow 
                  className={cn("hover:bg-muted/50 cursor-pointer", hasDocuments && "bg-muted/20")}
                  onClick={() => hasDocuments && toggleRowExpansion(stageRowId)}
                >
                  <TableCell className="w-12">
                    {hasDocuments && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleRowExpansion(stageRowId)
                        }}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    )}
                  </TableCell>
                  {columnVisibility.index && <TableCell>{stage.order_num}</TableCell>}
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{stage.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {time.days > 0 && `${time.days}d `}
                        {time.hours > 0 && `${time.hours}h `}
                        {time.minutes > 0 ? `${time.minutes}m` : time.days === 0 && time.hours === 0 ? '0m' : ''}
                      </div>
                      {stage.follow_up && (
                        <div className="text-xs text-blue-600">Follow up: {stage.follow_up}</div>
                      )}
                    </div>
                  </TableCell>
                  {leafEntities.map((entity) => {
                    let stageAllocation
                    
                    if (entity.subclassIndex !== undefined) {
                      // Subclass level
                      const subdept = currentDept.subdepartments?.find((sd: any) => sd.id === entity.subdeptId)
                      const cls = subdept?.classes?.[entity.classIndex!]
                      const subCls = cls?.subClasses?.[entity.subclassIndex]
                      stageAllocation = subCls?.stages?.find((s: any) => s.stage_id === stage.id)
                    } else if (entity.classIndex !== undefined) {
                      // Class level
                      const subdept = currentDept.subdepartments?.find((sd: any) => sd.id === entity.subdeptId)
                      const cls = subdept?.classes?.[entity.classIndex]
                      stageAllocation = cls?.stages?.find((s: any) => s.stage_id === stage.id)
                    } else {
                      // Subdepartment level
                      const subdept = currentDept.subdepartments?.find((sd: any) => sd.id === entity.subdeptId)
                      stageAllocation = subdept?.stages?.find((s: any) => s.stage_id === stage.id)
                    }

                    const isAllocated = stageAllocation?.applicable !== false
                    const isDisplayed = stageAllocation?.display !== false

                    return (
                      <TableCell key={`${stage.id}-${entity.id}`} className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div className={cn(
                            "h-6 w-6 rounded-full flex items-center justify-center",
                            isAllocated 
                              ? "bg-green-100 text-green-600" 
                              : "bg-gray-100 text-gray-400"
                          )}>
                            {isAllocated ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                          </div>
                          {isAllocated && (
                            <span className={cn(
                              "text-xs px-2 py-0.5 rounded-full",
                              isDisplayed 
                                ? "bg-blue-100 text-blue-600" 
                                : "bg-gray-100 text-gray-500"
                            )}>
                              {isDisplayed ? 'Visible' : 'Hidden'}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    )
                  })}
                </TableRow>

                {/* Expanded content for stage documents */}
                {isExpanded && hasDocuments && (
                  <TableRow>
                    <TableCell colSpan={leafEntities.length + 3} className="p-0">
                      <div className="p-4 bg-muted/10">
                        <h4 className="text-sm font-medium mb-3">Required Documents</h4>
                        <div className="space-y-3">
                          {stage.documents.map((doc: any) => (
                            <DocumentDisplay key={doc.id} doc={doc} />
                          ))}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
