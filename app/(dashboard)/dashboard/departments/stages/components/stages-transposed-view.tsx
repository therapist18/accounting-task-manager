// @ts-nocheck
"use client"

import React from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Pencil, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"

// Interface remains the same as it describes the data and functions passed in.
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

// Renamed component to reflect the new structure
// Enhanced debug logging utility
const debugLog = (message: string, data?: any) => {
  console.log(`[StagesTransposedView] ${message}`, data || '');
  // Also log to error console for better visibility
  if (data && typeof data === 'object') {
    console.error(`[StagesTransposedView] ${message}`, data);
  }
};

export function StagesTransposedView({
  currentDept,
  processedSubdepartments,
  expandedRows,
  columnVisibility,
  handleAllocationChange,
  handleDisplayToggle,
  setEditingStage,
  minutesToTimeString,
  toggleRowExpansion,
  handleKeyDown,
  DocumentDisplay,
}: StagesTableViewProps) {
  // Add debug logs at the start of component
  React.useEffect(() => {
    console.log('=== StagesTransposedView Mounted ===');
    console.log('currentDept:', currentDept);
    console.log('processedSubdepartments count:', processedSubdepartments?.length);
    console.log('columnVisibility:', columnVisibility);
    
    if (currentDept?.stages) {
      console.log('Stages:', currentDept.stages.map((s: any) => ({
        id: s.id,
        name: s.name,
        estimated_time: s.estimated_time
      })));
    }
    
    return () => {
      console.log('=== StagesTransposedView Unmounted ===');
    };
  }, []);
  console.log('currentDept:', JSON.stringify(currentDept, null, 2));
  console.log('processedSubdepartments:', JSON.stringify(processedSubdepartments, null, 2));
  console.log('columnVisibility:', columnVisibility);
  // Debug logs for props and component lifecycle
  React.useEffect(() => {
    debugLog('Component mounted with props:', {
      currentDept: {
        id: currentDept?.id,
        name: currentDept?.name,
        stages: currentDept?.stages?.map((s: any) => ({
          id: s.id,
          name: s.name,
          documents: s.documents?.length
        }))
      },
      processedSubdepartments: processedSubdepartments?.map((d: any) => ({
        id: d.id,
        name: d.name,
        classes: d.classes?.length,
        stages: d.stages?.length
      })),
      columnVisibility,
      expandedRows: Array.from(expandedRows)
    });

    return () => {
      debugLog('Component unmounted');
    };
  }, []);

  React.useEffect(() => {
    debugLog('Props changed:', {
      currentDeptId: currentDept?.id,
      subdepartmentsCount: processedSubdepartments?.length,
      stagesCount: currentDept?.stages?.length,
      expandedRows: Array.from(expandedRows)
    });
  }, [currentDept, processedSubdepartments, expandedRows]);

  // Debug logs for data structure
  React.useEffect(() => {
    if (currentDept?.stages) {
      debugLog('Stages structure:', {
        totalStages: currentDept.stages.length,
        stages: currentDept.stages.map((s: any) => ({
          id: s.id,
          name: s.name,
          hasDocuments: s.documents?.length > 0,
          documentCount: s.documents?.length || 0,
          estimatedTime: s.estimated_time
        }))
      });
    }
  }, [currentDept?.stages]);

  const STAGE_SUB_COLUMNS_COUNT = 5 // Applicable, Display, Duration, Follow Up, Documents

  const entityColLeftClass = columnVisibility.index ? "left-[96px]" : "left-12"
  const totalColumns =
    1 + (columnVisibility.index ? 1 : 0) + (columnVisibility.entity ? 1 : 0) + currentDept.stages.length * STAGE_SUB_COLUMNS_COUNT

  // Debug render cycle with enhanced logging
  debugLog('Rendering component', {
    renderCount: 1,
    hasStages: !!currentDept?.stages,
    stagesCount: currentDept?.stages?.length || 0,
    subdepartmentsCount: processedSubdepartments?.length
  });
  console.log('currentDept.stages exists:', !!currentDept?.stages);
  console.log('Number of stages:', currentDept?.stages?.length || 0);
  console.log('Stage names:', currentDept?.stages?.map((s: any) => s.name) || []);
  
  // Log processed data before rendering
  console.log('=== RENDERING HEADERS ===');
  console.log('Column visibility:', columnVisibility);
  console.log('Processed subdepartments count:', processedSubdepartments?.length);
  console.log('Stages count:', currentDept?.stages?.length || 0);
  
  if (currentDept?.stages) {
    console.log('Stages structure:', currentDept.stages.map((s: any) => ({
      id: s.id,
      name: s.name,
      hasDocuments: s.documents?.length > 0,
      documentCount: s.documents?.length || 0
    })));
  }

  return (
    <div className="relative border rounded-lg overflow-x-auto">
      <Table className="min-w-full">
        <TableHeader className="bg-muted/50">
          {/* First Header Row: Main Columns and Stage Names */}
          <TableRow>
            <TableHead className="w-12 sticky left-0 bg-muted/50 z-20"></TableHead>
            {columnVisibility.index && <TableHead className="w-12 sticky left-12 bg-muted/50 z-20">#</TableHead>}
            {columnVisibility.entity && (
              <TableHead className={cn("min-w-[200px] sticky bg-muted/50 z-20", entityColLeftClass)}>
                Department / Entity
              </TableHead>
            )}
            {currentDept.stages.map((stage: any, stageIndex: number) => {
              console.log(`Rendering stage header ${stageIndex + 1}:`, {
                id: stage.id,
                name: stage.name,
                colSpan: STAGE_SUB_COLUMNS_COUNT,
                hasDocuments: stage.documents?.length > 0
              });
              
              return (
                <TableHead 
                  key={stage.id} 
                  colSpan={STAGE_SUB_COLUMNS_COUNT} 
                  className="text-center border-l"
                  data-stage-id={stage.id}
                  data-stage-index={stageIndex}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>{stage.name}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingStage(stage)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                </TableHead>
              );
            })}
          </TableRow>
          {/* Second Header Row: Sub-columns for each stage */}
          <TableRow>
            {console.log('Rendering sub-column headers for stages:', {
              stagesCount: currentDept?.stages?.length,
              subColumnsPerStage: STAGE_SUB_COLUMNS_COUNT,
              columnVisibility
            })}
            <TableHead className="sticky left-0 bg-muted/50 z-20">
              {console.log('Rendering empty header for row selector')}
            </TableHead>
            {columnVisibility.index && (
              <TableHead className="sticky left-12 bg-muted/50 z-20">
                {console.log('Rendering index header')}
              </TableHead>
            )}
            {columnVisibility.entity && (
              <TableHead className={cn("sticky bg-muted/50 z-20", entityColLeftClass)}>
                {console.log('Rendering entity header')}
              </TableHead>
            )}
            {currentDept.stages.flatMap((stage: any, stageIndex: number) => {
              console.log(`Rendering sub-columns for stage ${stageIndex + 1} (${stage.name}):`, {
                stageId: stage.id,
                hasDocuments: stage.documents?.length > 0,
                documentCount: stage.documents?.length || 0
              });
              
              return [
                <TableHead 
                  key={`${stage.id}-applicable`} 
                  className="text-center border-l"
                  data-stage-id={stage.id}
                  data-subcol="applicable"
                >
                  Applicable
                </TableHead>,
                <TableHead 
                  key={`${stage.id}-display`} 
                  className="text-center border-l"
                  data-stage-id={stage.id}
                  data-subcol="display"
                >
                  Display
                </TableHead>,
                <TableHead 
                  key={`${stage.id}-duration`} 
                  className="text-center border-l w-32"
                  data-stage-id={stage.id}
                  data-subcol="duration"
                >
                  Duration
                </TableHead>,
                <TableHead 
                  key={`${stage.id}-followup`} 
                  className="text-center border-l w-32"
                  data-stage-id={stage.id}
                  data-subcol="followup"
                >
                  Follow Up
                </TableHead>,
                <TableHead 
                  key={`${stage.id}-documents`} 
                  className="text-center border-l w-40"
                  data-stage-id={stage.id}
                  data-subcol="documents"
                >
                  Documents
                </TableHead>,
              ];
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {processedSubdepartments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={totalColumns} className="text-center py-8 text-muted-foreground">
                No subdepartments found
              </TableCell>
            </TableRow>
          ) : (
            processedSubdepartments.map((subdept) => {
              const hasClasses = subdept.classes && subdept.classes.length > 0
              const subdeptRowId = `subdept-${subdept.id}`
              const isExpanded = expandedRows.has(subdeptRowId)
              
              const rowBg = hasClasses ? "bg-muted/20" : "bg-background"

              return (
                <React.Fragment key={subdeptRowId}>
                  {/* Subdepartment Row (Summary View) */}
                  <TableRow
                    className={cn("group", rowBg, "hover:bg-muted/50", hasClasses && "cursor-pointer")}
                    onClick={() => hasClasses && toggleRowExpansion(subdeptRowId)}
                  >
                    <TableCell className={cn("sticky left-0 w-12 z-10 group-hover:bg-muted/50", rowBg)}>
                      {hasClasses && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); toggleRowExpansion(subdeptRowId) }}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      )}
                    </TableCell>
                    {columnVisibility.index && <TableCell className={cn("sticky left-12 w-12 z-10 font-medium group-hover:bg-muted/50", rowBg)}>{subdept.order_num}</TableCell>}
                    <TableCell className={cn("sticky min-w-[200px] z-10 font-medium group-hover:bg-muted/50", entityColLeftClass, rowBg)}>
                        {subdept.name}
                    </TableCell>
                    <TableCell colSpan={currentDept.stages.length * STAGE_SUB_COLUMNS_COUNT}>
                      <div className="flex items-center gap-2">
                        {currentDept.stages.map((stage) => {
                          const isAllocated = subdept.stages?.find((s: any) => s.stage_id === stage.id)?.applicable !== false
                          return (
                            <div key={stage.id} className={cn("px-2 py-1 text-xs rounded border", isAllocated ? "bg-green-50 border-green-200 text-green-800" : "bg-gray-100 border-gray-200 text-gray-500")}>
                              {stage.name}
                            </div>
                          )
                        })}
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Expanded content for subdepartment: Classes */}
                  {isExpanded && subdept.classes?.map((cls: any, clsIndex: number) => {
                    const classRowId = `class-${subdept.id}-${cls.id || clsIndex}`
                    const isClassExpanded = expandedRows.has(classRowId)
                    const hasSubClasses = cls.subClasses && cls.subClasses.length > 0
                    const classRowBg = hasSubClasses ? "bg-muted/10" : "bg-background";


                    return (
                      <React.Fragment key={classRowId}>
                        {/* Class Row (Summary View) */}
                        <TableRow
                          className={cn("group", classRowBg, "hover:bg-muted/30", hasSubClasses && "cursor-pointer")}
                          onClick={() => hasSubClasses && toggleRowExpansion(classRowId)}
                        >
                          <TableCell className={cn("sticky left-0 w-12 pl-6 z-10 group-hover:bg-muted/30", classRowBg)}>
                             {hasSubClasses && (
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); toggleRowExpansion(classRowId) }}>
                                {isClassExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                            )}
                          </TableCell>
                          {columnVisibility.index && <TableCell className={cn("sticky left-12 w-12 z-10 text-muted-foreground group-hover:bg-muted/30", classRowBg)}>{cls.order_num}</TableCell>}
                          <TableCell className={cn("sticky min-w-[200px] z-10 pl-8 text-muted-foreground group-hover:bg-muted/30", entityColLeftClass, classRowBg)}>
                            {cls.name}
                          </TableCell>
                           <TableCell colSpan={currentDept.stages.length * STAGE_SUB_COLUMNS_COUNT}>
                                <div className="flex items-center gap-2">
                                  {currentDept.stages.map((stage: any) => {
                                    const isAllocated = cls.stages?.find((s: any) => s.stage_id === stage.id)?.applicable !== false
                                    return (
                                      <div key={stage.id} className={cn("px-2 py-1 text-xs rounded border", isAllocated ? "bg-green-50 border-green-200 text-green-800" : "bg-gray-100 border-gray-200 text-gray-500")}>
                                        {stage.name}
                                      </div>
                                    )
                                  })}
                                </div>
                            </TableCell>
                        </TableRow>

                        {/* Expanded content for class: SubClasses (Detailed Data View) */}
                        {isClassExpanded && cls.subClasses?.map((subCls: any, subClsIndex: number) => {
                            const subClassRowBg = "bg-background";
                            return(
                              <TableRow key={`subclass-${subdept.id}-${cls.id || clsIndex}-${subCls.id || subClsIndex}`} className="group hover:bg-muted/50">
                                <TableCell className={cn("sticky left-0 w-12 pl-12 z-10 group-hover:bg-muted/50", subClassRowBg)}></TableCell>
                                {columnVisibility.index && <TableCell className={cn("sticky left-12 w-12 z-10 text-muted-foreground group-hover:bg-muted/50", subClassRowBg)}>{subCls.order_num}</TableCell>}
                                <TableCell className={cn("sticky min-w-[200px] z-10 pl-12 text-muted-foreground group-hover:bg-muted/50", entityColLeftClass, subClassRowBg)}>
                                  - {subCls.name}
                                </TableCell>
                                {currentDept.stages.map((stage: any) => {
                                  const stageAllocation = subCls.stages?.find((s: any) => s.stage_id === stage.id)
                                  const isAllocated = stageAllocation?.applicable !== false
                                  const isDisplayed = stageAllocation?.display !== false

                                  return (
                                    <React.Fragment key={stage.id}>
                                      <TableCell className="text-center border-l">
                                        <Checkbox
                                          checked={isAllocated}
                                          onCheckedChange={(checked) => handleAllocationChange(subdept.id, stage.id, checked === true, clsIndex, subClsIndex)}
                                          onKeyDown={(e) => handleKeyDown(e, subdept.id, stage.id, !isAllocated)}
                                        />
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <Checkbox
                                          checked={isDisplayed}
                                          disabled={!isAllocated}
                                          onCheckedChange={(checked) => handleDisplayToggle(subdept.id, stage.id, checked === true, clsIndex, subClsIndex)}
                                        />
                                      </TableCell>
                                      <TableCell className="text-center text-sm text-muted-foreground">
                                        {minutesToTimeString(stage.estimated_time)}
                                      </TableCell>
                                      <TableCell className="text-center text-sm text-muted-foreground">
                                        {stage.follow_up || "None"}
                                      </TableCell>
                                      <TableCell className="text-center text-sm text-muted-foreground">
                                        {stage.documents && stage.documents.length > 0 
                                          ? <DocumentDisplay doc={stage.documents[0]} /> 
                                          : "None"
                                        }
                                      </TableCell>
                                    </React.Fragment>
                                  )
                                })}
                              </TableRow>
                            )
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