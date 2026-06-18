// @ts-nocheck
// components/MemorizedReportDialog.tsx

"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import { Loader2, Plus, Minus, Edit, Trash2, X, Save, Star, Filter, Table as TableIcon, ChevronUp, ChevronDown, CheckSquare, AlertCircle, BookmarkCheck } from "lucide-react"
import type { Department, KycDocument } from "../utils/taskManagerData"
import { ENHANCED_TABLE_HEADERS_IMMIGRATION } from "../tasks/overall-view/tableUtils"
import { cn } from "@/lib/utils"

type FieldConfig = { id: string; isDefault: boolean; };

type ReportConfiguration = {
  taskFields: FieldConfig[];
  stages: {
    [stageId: string]: {
      isStageDateSelected: boolean;
      isStageDateDefault: boolean;
      documents: {
        [kycId: string]: {
          fields: FieldConfig[];
        }
      }
    }
  }
};

export type MemorizedReport = {
  id: string;
  name: string;
  description?: string;
  configuration: ReportConfiguration;
  department_id: number;
  job_level?: {
    level: number;
    class_id: string;
    subclass_id: string | null;
    department_id: number;
    subdepartment_id: number;
  };
  is_favorite?: boolean;
  sessionIncludedFields?: string[];
};

interface MemorizedReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: Department | null;
  stages: any[];
  kycDocuments: Map<string, KycDocument>;
  onApplyReport: (report: MemorizedReport) => void;
  tableHeaders: typeof ENHANCED_TABLE_HEADERS_IMMIGRATION;
  availableJobLevels?: any[];
  departments: Department[];
  subdepartments?: any[];
  classes?: any[];
}

const INITIAL_REPORT_CONFIG: ReportConfiguration = { taskFields: [{ id: 'applicant_name', isDefault: true }], stages: {} };

const normalizeConfiguration = (config: any): ReportConfiguration => {
  if (!config) return INITIAL_REPORT_CONFIG;

  const normalized: ReportConfiguration = { taskFields: [], stages: {} };

  if (Array.isArray(config.taskFields)) {
    normalized.taskFields = config.taskFields.map((f: any) =>
      typeof f === 'string' ? { id: f, isDefault: true } : f
    );
  }

  if (config.stages) {
    Object.entries(config.stages).forEach(([stageId, stageConfig]: [string, any]) => {
      normalized.stages[stageId] = {
        isStageDateSelected: stageConfig.isStageDateSelected ?? true,
        isStageDateDefault: stageConfig.isStageDateDefault ?? true,
        documents: {}
      };

      if (stageConfig.documents) {
        Object.entries(stageConfig.documents).forEach(([kycId, docConfig]: [string, any]) => {
          let fields: FieldConfig[] = [];
          if (Array.isArray(docConfig.fields)) {
            fields = docConfig.fields.map((f: any) =>
              typeof f === 'string' ? { id: f, isDefault: true } : f
            );
          }
          normalized.stages[stageId].documents[kycId] = { fields };
        });
      }
    });
  }

  return normalized;
};

const isStageApplicable = (stage: any, deptId: string, subdeptId: string, classId: string, subClassId: string, departments: any[]): boolean => {
  if (!stage || !deptId || deptId === 'all' || !departments.length) return true;

  try {
    const dept = departments.find(d => d.id.toString() === deptId);
    if (!dept) return true;

    const subdept = dept.tm_subdepartments?.find((s: any) =>
      s.id.toString() === subdeptId && subdeptId !== 'all'
    );
    if (!subdept || subdeptId === 'all') return true;

    if (subClassId && subClassId !== 'all') {
      const cls = subdept.classes?.find((c: any) => c.id.toString() === classId);
      if (cls) {
        const subCls = cls.subClasses?.find((sc: any) => sc.id.toString() === subClassId);
        if (subCls) {
          const subClassStage = subCls.stages?.find((s: any) => s.stage_id === stage.id);
          if (subClassStage && typeof subClassStage.applicable === 'boolean') {
            return subClassStage.applicable;
          }
        }
      }
    }
    if (classId && classId !== 'all') {
      const cls = subdept.classes?.find((c: any) => c.id.toString() === classId);
      if (cls) {
        const classStage = cls.stages?.find((s: any) => s.stage_id === stage.id);
        if (classStage && typeof classStage.applicable === 'boolean') {
          return classStage.applicable;
        }
      }
    }
    const subdeptStage = subdept.stages?.find((s: any) => s.stage_id === stage.id);
    if (subdeptStage && typeof subdeptStage.applicable === 'boolean') {
      return subdeptStage.applicable;
    }
    return true;
  } catch {
    return true;
  }
};

const TableHeaderRow = React.memo(({ handleSelectAllDefault, handleSelectAllReports }: {
  handleSelectAllDefault: () => void;
  handleSelectAllReports: () => void;
}) => (
  <div className="grid grid-cols-12 gap-0 border-b border-gray-200 bg-gray-100 text-xs font-semibold text-gray-700 sticky top-0 z-20 shadow-sm">
    <div className="col-span-8 px-4 py-3 border-r border-gray-200">Field / Category</div>
    <div className="col-span-2 px-2 py-3 border-r border-gray-200 text-center bg-green-50/50 text-green-700 flex items-center justify-center gap-1">
      <span>Default</span>
      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-green-100 text-green-600" onClick={handleSelectAllDefault} title="Toggle All Default">
        <CheckSquare className="h-3 w-3" />
      </Button>
    </div>
    <div className="col-span-2 px-2 py-3 text-center bg-blue-50/50 text-blue-700 flex items-center justify-center gap-1">
      <span>Report</span>
      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-blue-100 text-blue-600" onClick={handleSelectAllReports} title="Toggle All Fields">
        <CheckSquare className="h-3 w-3" />
      </Button>
    </div>
  </div>
));

const TableRowItem = React.memo(({ label, isIncluded, isDefault, onToggleInclude, onToggleDefault, depth = 0, className = "", icon = null, readOnly = false, onMoveUp, onMoveDown, showMoveControls = false, isSaved = false }: { label: React.ReactNode; isIncluded?: boolean; isDefault?: boolean; onToggleInclude?: () => void; onToggleDefault?: () => void; depth?: number; className?: string; icon?: React.ReactNode; readOnly?: boolean; onMoveUp?: () => void; onMoveDown?: () => void; showMoveControls?: boolean; isSaved?: boolean; }) => (
  <div className={cn("grid grid-cols-12 gap-0 border-b border-gray-100 items-stretch text-sm transition-colors", isIncluded ? "bg-blue-50/20 hover:bg-blue-50/40" : "bg-white hover:bg-gray-50", className)}>
    <div className="col-span-8 flex items-center border-r border-gray-100 py-2">
      <div style={{ width: `${depth * 24}px` }} className="shrink-0 h-full border-r border-dashed border-gray-100 mr-2 opacity-50" />
      <div className="flex items-center gap-2 px-2 min-w-0 flex-1">
        {icon}
        <span className={cn("truncate font-medium", isIncluded ? "text-gray-800" : "text-gray-500")}>
          {label}
        </span>
        {isSaved && isIncluded && (
          <Badge variant="outline" className="ml-1 shrink-0 text-[10px] py-0 px-1.5 bg-emerald-50 text-emerald-600 border-emerald-200 font-semibold">
            Saved
          </Badge>
        )}
        {isSaved && !isIncluded && (
          <Badge variant="outline" className="ml-1 shrink-0 text-[10px] py-0 px-1.5 bg-gray-50 text-gray-400 border-gray-200 line-through">
            Saved
          </Badge>
        )}
        {showMoveControls && !readOnly && isIncluded && (
          <div className="flex items-center gap-1 ml-auto shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 hover:bg-gray-200"
              onClick={onMoveUp}
              disabled={!onMoveUp}
              title="Move up"
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 hover:bg-gray-200"
              onClick={onMoveDown}
              disabled={!onMoveDown}
              title="Move down"
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
    <div className="col-span-2 flex items-center justify-center border-r border-gray-100 bg-gray-50/30 py-2">
      {(onToggleDefault || readOnly) && (
        <Checkbox
          checked={isDefault}
          onCheckedChange={onToggleDefault}
          disabled={readOnly || !isIncluded}
          className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 disabled:opacity-30"
        />
      )}
    </div>
    <div className="col-span-2 flex items-center justify-center bg-gray-50/30 py-2">
      {(onToggleInclude || readOnly) && (
        <Checkbox
          checked={isIncluded}
          onCheckedChange={onToggleInclude}
          disabled={readOnly}
          className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 disabled:opacity-30"
        />
      )}
    </div>
  </div>
));

const ExpandableRow = React.memo(({ title, children, stageId, getSectionId, nonApplicableStageIds }: { title: string; children: React.ReactNode; stageId?: string; getSectionId: (title: string) => string; nonApplicableStageIds: Set<string>; }) => {
  const sectionId = getSectionId(title);
  const isNA = stageId ? nonApplicableStageIds.has(stageId) : false;

  return (
    <AccordionItem value={sectionId} className={cn(
      "border-b border-gray-200 last:border-0 transition-opacity",
      isNA && "opacity-60"
    )}>
      <AccordionTrigger className="w-full py-0 hover:no-underline group bg-gray-50/80 hover:bg-gray-100/80 pr-4">
        <div className="grid grid-cols-12 w-full gap-0 text-left">
          <div className="col-span-12 px-4 py-2.5 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className={cn("font-semibold text-xs uppercase tracking-wide", isNA ? "text-gray-400" : "text-gray-600")}>
                {title}
              </span>
              {isNA && (
                <Badge variant="outline" className="text-[10px] bg-white text-amber-600 border-amber-200">
                  N/A
                </Badge>
              )}
            </div>
            <div className="h-4 w-4 rounded border border-gray-300 bg-white flex items-center justify-center text-gray-400 shadow-sm">
              <Plus className="h-2.5 w-2.5 group-data-[state=open]:hidden" />
              <Minus className="h-2.5 w-2.5 hidden group-data-[state=open]:block" />
            </div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="p-0 animate-in slide-in-from-top-1">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
});

interface ReportEditorProps {
  selectedReport: MemorizedReport | null;
  reportName: string;
  setReportName: (name: string) => void;
  reportConfig: ReportConfiguration;
  showSelectedOnly: boolean;
  setShowSelectedOnly: (show: boolean) => void;
  includedFields: Set<string>;
  originalSavedFieldIds: Set<string>;
  expandedSections: string[];
  setExpandedSections: (sections: string[]) => void;
  setIsEditing: (editing: boolean) => void;
  selectedDepartment: string;
  setSelectedDepartment: (dept: string) => void;
  selectedSubdepartment: string;
  setSelectedSubdepartment: (subdept: string) => void;
  selectedClass: string;
  setSelectedClass: (cls: string) => void;
  selectedSubClass: string;
  setSelectedSubClass: (subclass: string) => void;
  tableHeaders: typeof ENHANCED_TABLE_HEADERS_IMMIGRATION;
  sortedStages: any[];
  kycDocuments: Map<string, KycDocument>;
  memoizedDepartments: any[];
  department: Department | null;
  nonApplicableStageIds: Set<string>;
  availableSubdepartments: any[];
  availableClasses: any[];
  availableSubClasses: any[];
  countSelectedFields: () => number;
  isTaskFieldIncluded: (fieldId: string) => boolean;
  toggleTaskFieldInclude: (fieldId: string) => void;
  toggleTaskFieldDefault: (fieldId: string) => void;
  moveTaskField: (fieldId: string, direction: 'up' | 'down') => void;
  toggleStageDateInclude: (stageId: string) => void;
  toggleStageDateDefault: (stageId: string) => void;
  toggleDocument: (stageId: string, kycId: string) => void;
  toggleDocFieldInclude: (stageId: string, kycId: string, fieldId: string) => void;
  toggleDocFieldDefault: (stageId: string, kycId: string, fieldId: string) => void;
  handleSelectAllDefault: () => void;
  handleSelectAllReports: () => void;
  getSectionId: (title: string) => string;
}

const ReportEditor = React.memo(({ selectedReport, reportName, setReportName, reportConfig, showSelectedOnly, setShowSelectedOnly, includedFields, originalSavedFieldIds, expandedSections, setExpandedSections, setIsEditing, selectedDepartment, setSelectedDepartment, selectedSubdepartment, setSelectedSubdepartment, selectedClass, setSelectedClass, selectedSubClass, setSelectedSubClass, tableHeaders, sortedStages, kycDocuments, memoizedDepartments, department, nonApplicableStageIds, availableSubdepartments, availableClasses, availableSubClasses, countSelectedFields, isTaskFieldIncluded, toggleTaskFieldInclude, toggleTaskFieldDefault, moveTaskField, toggleStageDateInclude, toggleStageDateDefault, toggleDocument, toggleDocFieldInclude, toggleDocFieldDefault, handleSelectAllDefault, handleSelectAllReports, getSectionId }: ReportEditorProps) => {
  const selectedCount = countSelectedFields();

  const orderedTaskFields = useMemo(() => {
    const configuredFields = reportConfig.taskFields || [];
    const allFields = tableHeaders;
    if (configuredFields.length === 0) return allFields;
    const fieldOrder = new Map(configuredFields.map((f, i) => [f.id, i]));
    return [...allFields].sort((a, b) => {
      const orderA = fieldOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const orderB = fieldOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
  }, [reportConfig.taskFields, tableHeaders]);

  const filteredTaskFields = orderedTaskFields.filter(field =>
    showSelectedOnly ? includedFields.has(field.id) : true
  );

  const filteredStages = sortedStages.filter(stage => {
    if (!showSelectedOnly) return true;
    const stageConfig = reportConfig.stages?.[stage.id];
    if (!stageConfig) return false;
    if (stageConfig.isStageDateSelected) return true;
    return Object.keys(stageConfig.documents).length > 0;
  });

  const isEditMode = !!selectedReport;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-3 pb-3 border-b px-1 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              {selectedReport ? `Editing: ${selectedReport.name}` : 'Create New Report'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{selectedCount} field{selectedCount !== 1 ? 's' : ''} selected</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isEditMode && originalSavedFieldIds.size > 0 && (
              <div className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md px-2 py-1">
                <BookmarkCheck className="h-3 w-3" />
                <span>{originalSavedFieldIds.size} saved</span>
              </div>
            )}
            <Button variant="outline" size="sm" className="text-xs h-7 px-2.5 flex items-center gap-1.5" onClick={() => setShowSelectedOnly(!showSelectedOnly)}>
              <Filter className="h-3 w-3" />
              {showSelectedOnly ? 'Show All' : 'Show Selected'}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsEditing(false)}>
              <X className="mr-1 h-3 w-3" /> Cancel
            </Button>
          </div>
        </div>
      </div>

      {/* Report Name */}
      <div className="mb-3 space-y-1 shrink-0">
        <Label htmlFor="report-name" className="text-xs">Report Name *</Label>
        <Input
          id="report-name"
          value={reportName}
          onChange={e => setReportName(e.target.value)}
          placeholder="Enter report name..."
          className="h-8 text-sm"
        />
      </div>

      {/* Job-level Hierarchy */}
      <div className="grid grid-cols-4 gap-2 mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200 shrink-0">
        <div className="space-y-1">
          <Label className="text-[11px] text-gray-600 uppercase tracking-wide">Department</Label>
          <Select value={selectedDepartment} onValueChange={v => { setSelectedDepartment(v); setSelectedSubdepartment('all'); setSelectedClass('all'); setSelectedSubClass('all'); }}>
            <SelectTrigger className="h-8 bg-white border-gray-200 text-xs">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {memoizedDepartments.map((d: any) => (
                <SelectItem key={d.id} value={d.id.toString()}>
                  {d.name}{department?.id === d.id ? ' (Current)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-gray-600 uppercase tracking-wide">Sub-Department</Label>
          <Select value={selectedSubdepartment} onValueChange={v => { setSelectedSubdepartment(v); setSelectedClass('all'); setSelectedSubClass('all'); }} disabled={!selectedDepartment || selectedDepartment === 'all'}>
            <SelectTrigger className="h-8 bg-white border-gray-200 text-xs">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {availableSubdepartments.map((s: any) => (
                <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-gray-600 uppercase tracking-wide">Service Class</Label>
          <Select value={selectedClass} onValueChange={v => { setSelectedClass(v); setSelectedSubClass('all'); }} disabled={!selectedSubdepartment || selectedSubdepartment === 'all'}>
            <SelectTrigger className="h-8 bg-white border-gray-200 text-xs">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {availableClasses.map((c: any) => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-gray-600 uppercase tracking-wide">Subclass</Label>
          <Select value={selectedSubClass} onValueChange={setSelectedSubClass} disabled={!selectedClass || selectedClass === 'all'}>
            <SelectTrigger className="h-8 bg-white border-gray-200 text-xs">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {availableSubClasses.map((sc: any) => (
                <SelectItem key={sc.id} value={sc.id.toString()}>{sc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedDepartment && selectedDepartment !== 'all' && nonApplicableStageIds.size > 0 && (
          <div className="col-span-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span><strong>{nonApplicableStageIds.size}</strong> stage{nonApplicableStageIds.size !== 1 ? 's' : ''} N/A for selected job level</span>
          </div>
        )}
      </div>

      {/* Field Table */}
      <div className="flex-1 flex flex-col min-h-0 border rounded-lg shadow-sm overflow-hidden bg-white">
        <TableHeaderRow handleSelectAllDefault={handleSelectAllDefault} handleSelectAllReports={handleSelectAllReports} />
        <ScrollArea className="flex-1">
          <Accordion
            type="multiple"
            className="w-full divide-y divide-gray-200"
            value={expandedSections}
            onValueChange={setExpandedSections}
          >
            {filteredTaskFields.length > 0 && (
              <ExpandableRow title="Task Details" getSectionId={getSectionId} nonApplicableStageIds={nonApplicableStageIds}>
                {filteredTaskFields.map((field) => {
                  const isIncluded = isTaskFieldIncluded(field.id);
                  const config = reportConfig.taskFields?.find(f => f.id === field.id);
                  const fieldIndex = reportConfig.taskFields?.findIndex(f => f.id === field.id) ?? -1;
                  const canMoveUp = isIncluded && fieldIndex > 0;
                  const canMoveDown = isIncluded && fieldIndex >= 0 && fieldIndex < (reportConfig.taskFields?.length ?? 0) - 1;
                  return (
                    <TableRowItem
                      key={field.id}
                      label={field.label}
                      isIncluded={isIncluded}
                      isDefault={!!config?.isDefault}
                      onToggleInclude={() => toggleTaskFieldInclude(field.id)}
                      onToggleDefault={() => toggleTaskFieldDefault(field.id)}
                      depth={1}
                      isSaved={isEditMode && originalSavedFieldIds.has(field.id)}
                      onMoveUp={canMoveUp ? () => moveTaskField(field.id, 'up') : undefined}
                      onMoveDown={canMoveDown ? () => moveTaskField(field.id, 'down') : undefined}
                      showMoveControls={true}
                    />
                  );
                })}
              </ExpandableRow>
            )}

            {filteredStages.map(stage => {
              const stageConfig = reportConfig.stages?.[stage.id];
              const filteredDocs = (stage.documents || []).filter((doc: any) =>
                showSelectedOnly ? !!stageConfig?.documents?.[doc.kycId] : true
              );

              if (showSelectedOnly && !stageConfig?.isStageDateSelected && filteredDocs.length === 0) return null;

              return (
                <ExpandableRow key={`stage-${stage.id}`} title={stage.name} stageId={stage.id} getSectionId={getSectionId} nonApplicableStageIds={nonApplicableStageIds}>
                  {(!showSelectedOnly || stageConfig?.isStageDateSelected) && (
                    <TableRowItem
                      label="Stage Completion Date"
                      isIncluded={!!stageConfig?.isStageDateSelected}
                      isDefault={!!stageConfig?.isStageDateDefault}
                      onToggleInclude={() => toggleStageDateInclude(stage.id)}
                      onToggleDefault={() => toggleStageDateDefault(stage.id)}
                      depth={1}
                      className="italic"
                    />
                  )}

                  {filteredDocs.map((doc: any) => {
                    const kycDoc = kycDocuments.get(doc.kycId);
                    if (!kycDoc) return null;
                    const isDocActive = !!stageConfig?.documents?.[doc.kycId];

                    return (
                      <div key={`doc-${stage.id}-${doc.kycId}`}>
                        <div className={cn(
                          "grid grid-cols-12 gap-0 border-b border-gray-100 items-stretch text-sm",
                          isDocActive ? "bg-blue-50/20 hover:bg-blue-50/40" : "bg-white hover:bg-gray-50"
                        )}>
                          <div className="col-span-8 flex items-center border-r border-gray-100 py-2">
                            <div style={{ width: `24px` }} className="shrink-0 h-full border-r border-dashed border-gray-100 mr-2 opacity-50" />
                            <div className="flex items-center gap-2 px-2 py-1 w-full">
                              <Checkbox
                                id={`doc-${stage.id}-${doc.kycId}`}
                                checked={isDocActive}
                                onCheckedChange={() => toggleDocument(stage.id, doc.kycId)}
                                className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                              />
                              <Label htmlFor={`doc-${stage.id}-${doc.kycId}`} className={cn(
                                "cursor-pointer font-semibold flex-1 truncate text-sm",
                                isDocActive ? "text-gray-800" : "text-gray-500"
                              )}>
                                {kycDoc.display_name || kycDoc.name}
                              </Label>
                            </div>
                          </div>
                          <div className="col-span-2 border-r border-gray-100 bg-gray-50/30" />
                          <div className="col-span-2 bg-gray-50/30" />
                        </div>

                        {isDocActive && (
                          <div className="bg-gray-50/30">
                            {kycDoc.fields?.map((field: any) => {
                              const docConfig = stageConfig?.documents?.[doc.kycId];
                              const fieldConfig = docConfig?.fields.find((f: any) => f.id === field.id);
                              if (showSelectedOnly && !fieldConfig) return null;
                              return (
                                <TableRowItem
                                  key={`field-${stage.id}-${doc.kycId}-${field.id}`}
                                  label={field.fieldName}
                                  isIncluded={!!fieldConfig}
                                  isDefault={!!fieldConfig?.isDefault}
                                  onToggleInclude={() => toggleDocFieldInclude(stage.id, doc.kycId, field.id)}
                                  onToggleDefault={() => toggleDocFieldDefault(stage.id, doc.kycId, field.id)}
                                  depth={2}
                                  className="bg-white"
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </ExpandableRow>
              );
            })}
          </Accordion>
        </ScrollArea>
      </div>
    </div>
  );
});

export function MemorizedReportDialog({ open, onOpenChange, department, stages, kycDocuments, onApplyReport, tableHeaders, availableJobLevels = [], departments = [], subdepartments = [], classes = [] }: MemorizedReportDialogProps) {
  const [reports, setReports] = useState<MemorizedReport[]>([])
  const [selectedReport, setSelectedReport] = useState<MemorizedReport | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [reportName, setReportName] = useState("")
  const [reportConfig, setReportConfig] = useState<ReportConfiguration>(INITIAL_REPORT_CONFIG)
  const [originalSavedFieldIds, setOriginalSavedFieldIds] = useState<Set<string>>(new Set())
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedSubdepartment, setSelectedSubdepartment] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSubClass, setSelectedSubClass] = useState<string>('all');
  const [showSelectedOnly, setShowSelectedOnly] = useState(true);
  const [expandedSections, setExpandedSections] = useState<string[]>(['task-details']);
  const includedFields = useMemo(() => new Set(reportConfig.taskFields.map(f => f.id)), [reportConfig.taskFields]);
  const memoizedDepartments = useMemo(() => departments || [], [departments]);

  const availableSubdepartments = useMemo(() => {
    if (!selectedDepartment || selectedDepartment === 'all') return [];
    const dept = memoizedDepartments.find(d => d.id.toString() === selectedDepartment);
    return dept?.tm_subdepartments || [];
  }, [selectedDepartment, memoizedDepartments]);

  const availableClasses = useMemo(() => {
    if (!selectedSubdepartment || selectedSubdepartment === 'all') return [];
    const sub = availableSubdepartments.find(s => s.id.toString() === selectedSubdepartment);
    return sub?.classes || [];
  }, [selectedSubdepartment, availableSubdepartments]);

  const availableSubClasses = useMemo(() => {
    if (!selectedClass || selectedClass === 'all') return [];
    const cls = availableClasses.find(c => c.id.toString() === selectedClass);
    return cls?.subClasses || [];
  }, [selectedClass, availableClasses]);

  const nonApplicableStageIds = useMemo(() => {
    if (!selectedDepartment || selectedDepartment === 'all' || !stages.length) return new Set<string>();
    return new Set(
      stages
        .filter(stage => !isStageApplicable(stage, selectedDepartment, selectedSubdepartment, selectedClass, selectedSubClass, memoizedDepartments))
        .map(s => s.id)
    );
  }, [stages, selectedDepartment, selectedSubdepartment, selectedClass, selectedSubClass, memoizedDepartments]);

  const sortedStages = useMemo(() =>
    [...stages].sort((a, b) => (a.order || a.order_num || 0) - (b.order || b.order_num || 0)),
    [stages]
  );

  const calculatedJobLevel = useMemo(() => {
    if (!selectedDepartment || selectedDepartment === 'all') return null;
    return {
      level: selectedClass && selectedClass !== 'all' ? 3 : selectedSubdepartment && selectedSubdepartment !== 'all' ? 2 : 1,
      department_id: Number(selectedDepartment),
      subdepartment_id: selectedSubdepartment && selectedSubdepartment !== 'all' ? Number(selectedSubdepartment) : null,
      class_id: selectedClass && selectedClass !== 'all' ? Number(selectedClass) : null,
      subclass_id: selectedSubClass && selectedSubClass !== 'all' ? Number(selectedSubClass) : null
    };
  }, [selectedDepartment, selectedSubdepartment, selectedClass, selectedSubClass]);

  const getSectionId = useCallback((title: string) => title.toLowerCase().replace(/\s+/g, '-'), []);

  const countSelectedFields = useCallback(() => {
    let count = reportConfig.taskFields.length;
    Object.values(reportConfig.stages).forEach(stage => {
      if (stage.isStageDateSelected) count++;
      Object.values(stage.documents).forEach(doc => {
        count += doc.fields.length;
      });
    });
    return count;
  }, [reportConfig]);

  const fetchReports = useCallback(async () => {
    const deptId = department?.id;
    if (!deptId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('tm_memorized_reports')
        .select('*')
        .eq('department_id', deptId)
        .order('name', { ascending: true });
      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error("Error fetching reports:", error);
      toast({ title: "Error", description: "Could not fetch reports.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [department?.id]);

  useEffect(() => {
    if (open && department) fetchReports();
  }, [open, fetchReports, department]);

  useEffect(() => {
    setSelectedReport(null); setReportName(""); setReportConfig(INITIAL_REPORT_CONFIG); setOriginalSavedFieldIds(new Set()); setIsEditing(false); setShowSelectedOnly(true); setExpandedSections(['task-details']);

    if (department?.id) {
      setSelectedDepartment(department.id.toString());
    } else {
      setSelectedDepartment('all');
    }
    setSelectedSubdepartment('all');
    setSelectedClass('all');
    setSelectedSubClass('all');
  }, [department?.id]);

  const handleCreateNew = () => {
    setSelectedReport(null);
    setReportName("");
    setReportConfig(INITIAL_REPORT_CONFIG);
    setOriginalSavedFieldIds(new Set());
    setIsEditing(true);
    setShowSelectedOnly(false);
    setExpandedSections(['task-details']);
  };

  const handleSelectReport = (report: MemorizedReport) => {
    const config = normalizeConfiguration(report.configuration);
    setSelectedReport(report);
    setReportName(report.name);
    setReportConfig(config);
    setOriginalSavedFieldIds(new Set(config.taskFields.map(f => f.id)));
    setIsEditing(false);
    setShowSelectedOnly(true);
    setExpandedSections(['task-details']);

    if (report.job_level) {
      setSelectedDepartment(report.job_level.department_id?.toString() || 'all');
      setSelectedSubdepartment(report.job_level.subdepartment_id?.toString() || 'all');
      setSelectedClass(report.job_level.class_id?.toString() || 'all');
    }
  };

  const handleEditReport = () => {
    setOriginalSavedFieldIds(new Set(reportConfig.taskFields.map(f => f.id)));
    setIsEditing(true);
    setShowSelectedOnly(false);
  };

  const handleToggleFavorite = async (e: React.MouseEvent, report: MemorizedReport) => {
    e.stopPropagation();
    const newStatus = !report.is_favorite;
    setReports(prev => prev.map(r => r.id === report.id ? { ...r, is_favorite: newStatus } : r));
    try {
      await supabase.from('tm_memorized_reports').update({ is_favorite: newStatus }).eq('id', report.id);
    } catch {
      toast({ title: "Error", description: "Failed to update favorite status", variant: "destructive" });
      fetchReports();
    }
  };

  const handleSaveReport = async () => {
    if (!reportName.trim() || !department) return;
    setIsLoading(true);
    try {
      const reportData = {
        name: reportName,
        configuration: reportConfig,
        department_id: department.id,
        job_level: calculatedJobLevel,
      };

      let savedReportData;
      if (selectedReport?.id) {
        const { data, error } = await supabase.from('tm_memorized_reports').update(reportData).eq('id', selectedReport.id).select().single();
        if (error) throw error;
        savedReportData = data;
        toast({ title: "Success", description: "Report updated." });
      } else {
        const { data, error } = await supabase.from('tm_memorized_reports').insert(reportData).select().single();
        if (error) throw error;
        savedReportData = data;
        toast({ title: "Success", description: "Report created." });
      }

      const normalizedSavedConfig = normalizeConfiguration(savedReportData.configuration);
      setSelectedReport(savedReportData);
      setReportName(savedReportData.name);
      setReportConfig(normalizedSavedConfig);
      setOriginalSavedFieldIds(new Set(normalizedSavedConfig.taskFields.map(f => f.id)));
      setIsEditing(false);
      await fetchReports();
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to save report.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm("Are you sure you want to delete this report?")) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.from('tm_memorized_reports').delete().eq('id', reportId);
      if (error) throw error;
      toast({ title: "Success", description: "Report deleted." });
      setSelectedReport(null);
      setIsEditing(false);
      setOriginalSavedFieldIds(new Set());
      await fetchReports();
    } catch {
      toast({ title: "Error", description: "Failed to delete report.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (selectedReport) {
      onApplyReport({
        ...selectedReport,
        configuration: reportConfig,
        sessionIncludedFields: reportConfig.taskFields.map(f => f.id)
      });
      onOpenChange(false);
    }
  };

  const isTaskFieldIncluded = useCallback(
    (fieldId: string) => reportConfig.taskFields.some(f => f.id === fieldId),
    [reportConfig.taskFields]
  );

  const toggleTaskFieldInclude = useCallback((fieldId: string) => {
    setReportConfig(prev => {
      const exists = prev.taskFields.find(f => f.id === fieldId);
      const newFields = exists
        ? prev.taskFields.filter(f => f.id !== fieldId)          // remove → deselect
        : [...prev.taskFields, { id: fieldId, isDefault: false }]; // add → session-only
      return { ...prev, taskFields: newFields };
    });
  }, []);

  const toggleTaskFieldDefault = useCallback((fieldId: string) => {
    setReportConfig(prev => {
      const exists = prev.taskFields.find(f => f.id === fieldId);
      const newFields = exists
        ? prev.taskFields.map(f => f.id === fieldId ? { ...f, isDefault: !f.isDefault } : f)
        : [...prev.taskFields, { id: fieldId, isDefault: true }]; // include + mark default
      return { ...prev, taskFields: newFields };
    });
  }, []);

  const moveTaskField = useCallback((fieldId: string, direction: 'up' | 'down') => {
    setReportConfig(prev => {
      const current = prev.taskFields || [];
      const index = current.findIndex(f => f.id === fieldId);
      if (index === -1) return prev;
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= current.length) return prev;
      const newFields = [...current];
      [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
      return { ...prev, taskFields: newFields };
    });
  }, []);

  const toggleStageDateDefault = (stageId: string) => {
    setReportConfig(prev => {
      const newStages = { ...prev.stages };
      if (!newStages[stageId]) {
        newStages[stageId] = { isStageDateSelected: true, isStageDateDefault: true, documents: {} };
      } else {
        newStages[stageId] = {
          ...newStages[stageId],
          isStageDateDefault: !newStages[stageId].isStageDateDefault,
          isStageDateSelected: !newStages[stageId].isStageDateDefault ? true : newStages[stageId].isStageDateSelected
        };
      }
      return { ...prev, stages: newStages };
    });
  };

  const toggleStageDateInclude = (stageId: string) => {
    setReportConfig(prev => {
      const newStages = { ...prev.stages };
      if (!newStages[stageId]) {
        newStages[stageId] = { isStageDateSelected: true, isStageDateDefault: false, documents: {} };
      } else {
        const currentlySelected = newStages[stageId].isStageDateSelected;
        newStages[stageId] = {
          ...newStages[stageId],
          isStageDateSelected: !currentlySelected,
          isStageDateDefault: !currentlySelected ? newStages[stageId].isStageDateDefault : false
        };
        if (!newStages[stageId].isStageDateSelected && Object.keys(newStages[stageId].documents).length === 0) {
          delete newStages[stageId];
        }
      }
      return { ...prev, stages: newStages };
    });
  };

  const toggleDocument = (stageId: string, kycId: string) => {
    setReportConfig(prev => {
      const newStages = JSON.parse(JSON.stringify(prev.stages));
      if (!newStages[stageId]) {
        newStages[stageId] = { isStageDateSelected: false, isStageDateDefault: false, documents: {} };
      }
      if (newStages[stageId].documents[kycId]) {
        delete newStages[stageId].documents[kycId];
      } else {
        newStages[stageId].documents[kycId] = { fields: [] };
      }
      if (!newStages[stageId].isStageDateSelected && Object.keys(newStages[stageId].documents).length === 0) {
        delete newStages[stageId];
      }
      return { ...prev, stages: newStages };
    });
  };

  const toggleDocFieldInclude = (stageId: string, kycId: string, fieldId: string) => {
    setReportConfig(prev => {
      const newStages = JSON.parse(JSON.stringify(prev.stages));
      if (!newStages[stageId]?.documents[kycId]) return prev;
      const currentFields = newStages[stageId].documents[kycId].fields;
      const exists = currentFields.find((f: any) => f.id === fieldId);
      newStages[stageId].documents[kycId].fields = exists
        ? currentFields.filter((f: any) => f.id !== fieldId)
        : [...currentFields, { id: fieldId, isDefault: false }];
      return { ...prev, stages: newStages };
    });
  };

  const toggleDocFieldDefault = (stageId: string, kycId: string, fieldId: string) => {
    setReportConfig(prev => {
      const newStages = JSON.parse(JSON.stringify(prev.stages));
      if (!newStages[stageId]?.documents[kycId]) return prev;
      const currentFields = newStages[stageId].documents[kycId].fields;
      const exists = currentFields.find((f: any) => f.id === fieldId);
      newStages[stageId].documents[kycId].fields = exists
        ? currentFields.map((f: any) => f.id === fieldId ? { ...f, isDefault: !f.isDefault } : f)
        : [...currentFields, { id: fieldId, isDefault: true }];
      return { ...prev, stages: newStages };
    });
  };

  const handleSelectAllDefault = useCallback(() => {
    const allTaskFieldIds = tableHeaders.map(f => f.id);
    const areAllDefault = allTaskFieldIds.every(id => reportConfig.taskFields.find(f => f.id === id)?.isDefault);
    const shouldSelect = !areAllDefault;

    setReportConfig(prev => {
      const existingMap = new Map(prev.taskFields.map(f => [f.id, f]));
      const newTaskFields = shouldSelect
        ? allTaskFieldIds.map(id => ({ id, isDefault: true }))
        : allTaskFieldIds.map(id => existingMap.has(id) ? { ...existingMap.get(id)!, isDefault: false } : null).filter(Boolean);

      const newStages = { ...prev.stages };
      sortedStages.forEach(stage => {
        if (!newStages[stage.id]) {
          if (shouldSelect) newStages[stage.id] = { isStageDateSelected: true, isStageDateDefault: true, documents: {} };
        } else {
          newStages[stage.id] = { ...newStages[stage.id], isStageDateDefault: shouldSelect, isStageDateSelected: shouldSelect ? true : newStages[stage.id].isStageDateSelected };
        }
        (stage.documents || []).forEach((doc: any) => {
          const kycDoc = kycDocuments.get(doc.kycId);
          if (kycDoc?.fields && newStages[stage.id]) {
            if (!newStages[stage.id].documents[doc.kycId]) {
              if (shouldSelect) newStages[stage.id].documents[doc.kycId] = { fields: [] };
            }
            if (newStages[stage.id].documents[doc.kycId]) {
              newStages[stage.id].documents[doc.kycId].fields = kycDoc.fields.map((f: any) => ({
                id: f.id, isDefault: shouldSelect
              }));
            }
          }
        });
      });

      return { ...prev, taskFields: newTaskFields, stages: newStages };
    });
  }, [tableHeaders, sortedStages, kycDocuments, reportConfig.taskFields]);

  const handleSelectAllReports = useCallback(() => {
    const allTaskFieldIds = tableHeaders.map(f => f.id);
    const areAllIncluded = allTaskFieldIds.every(id => reportConfig.taskFields.some(f => f.id === id));
    const shouldSelect = !areAllIncluded;

    setReportConfig(prev => {
      const existingMap = new Map(prev.taskFields.map(f => [f.id, f]));
      const newTaskFields = shouldSelect
        ? allTaskFieldIds.map(id => existingMap.get(id) || { id, isDefault: false })
        : [];

      const newStages = { ...prev.stages };
      sortedStages.forEach(stage => {
        if (!newStages[stage.id]) {
          if (shouldSelect) newStages[stage.id] = { isStageDateSelected: true, isStageDateDefault: false, documents: {} };
        } else {
          newStages[stage.id] = { ...newStages[stage.id], isStageDateSelected: shouldSelect };
        }
        (stage.documents || []).forEach((doc: any) => {
          const kycDoc = kycDocuments.get(doc.kycId);
          if (kycDoc?.fields) {
            if (shouldSelect) {
              if (!newStages[stage.id]) return;
              newStages[stage.id].documents[doc.kycId] = {
                fields: kycDoc.fields.map((f: any) => ({
                  id: f.id,
                  isDefault: prev.stages[stage.id]?.documents[doc.kycId]?.fields.find((df: any) => df.id === f.id)?.isDefault || false
                }))
              };
            } else if (newStages[stage.id]) {
              delete newStages[stage.id].documents[doc.kycId];
            }
          }
        });
        if (newStages[stage.id] && !shouldSelect && !newStages[stage.id].isStageDateSelected && Object.keys(newStages[stage.id].documents).length === 0) {
          delete newStages[stage.id];
        }
      });
      return { ...prev, taskFields: newTaskFields, stages: newStages };
    });
  }, [tableHeaders, sortedStages, kycDocuments, reportConfig.taskFields]);

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      if (a.is_favorite && !b.is_favorite) return -1;
      if (!a.is_favorite && b.is_favorite) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [reports]);

  const renderReportList = () => (
    <div className="flex flex-col gap-2 h-full">
      <Button onClick={handleCreateNew} className="w-full mb-2 bg-gray-800 hover:bg-gray-700 h-8 text-sm">
        <Plus className="mr-2 h-3.5 w-3.5" /> New Report
      </Button>
      <ScrollArea className="flex-1 pr-4 -mr-4">
        <div className="space-y-1">
          {sortedReports.map(report => (
            <div
              key={report.id}
              className={cn(
                "group flex items-center justify-between p-2 rounded-md cursor-pointer border transition-all",
                selectedReport?.id === report.id
                  ? 'bg-blue-50 border-blue-200 shadow-sm'
                  : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
              )}
              onClick={() => handleSelectReport(report)}
            >
              <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-5 w-5 shrink-0", report.is_favorite ? 'text-amber-400 hover:text-amber-500' : 'text-gray-300 hover:text-amber-400')}
                  onClick={(e) => handleToggleFavorite(e, report)}
                >
                  <Star className="h-3.5 w-3.5 fill-current" />
                </Button>
                <div className="flex flex-col min-w-0">
                  <span className={cn("font-medium text-xs truncate", selectedReport?.id === report.id ? 'text-blue-700' : 'text-gray-700')}>
                    {report.name}
                  </span>
                  {report.job_level && (
                    <span className="text-[11px] text-gray-400 truncate">
                      {report.job_level.class_id
                        ? `Class ${report.job_level.class_id}`
                        : report.job_level.subdepartment_id
                          ? `Subdept ${report.job_level.subdepartment_id}`
                          : `Dept ${report.job_level.department_id}`}
                    </span>
                  )}
                </div>
              </div>
              {selectedReport?.id === report.id && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-blue-600" onClick={(e) => { e.stopPropagation(); handleEditReport(); }}>
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-500 hover:text-red-600" onClick={(e) => { e.stopPropagation(); handleDeleteReport(report.id); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {reports.length === 0 && <div className="text-center text-gray-400 py-8 text-xs">No reports yet.</div>}
        </div>
      </ScrollArea>
    </div>
  );

  const renderReportViewer = () => (
    <div className="flex flex-col h-full">
      <div className="mb-3 shrink-0">
        <h3 className="text-base font-bold text-gray-900">{selectedReport?.name}</h3>
        <p className="text-xs text-gray-500 mt-0.5">Read-only preview.</p>
        {selectedReport?.job_level && (
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 flex-wrap">
            <span className="font-medium">Scope:</span>
            {selectedDepartment && selectedDepartment !== 'all' && <Badge variant="outline" className="text-xs">{memoizedDepartments.find(d => d.id.toString() === selectedDepartment)?.name}</Badge>}
            {selectedSubdepartment && selectedSubdepartment !== 'all' && <Badge variant="outline" className="text-xs">{availableSubdepartments.find(s => s.id.toString() === selectedSubdepartment)?.name}</Badge>}
            {selectedClass && selectedClass !== 'all' && <Badge variant="outline" className="text-xs">{availableClasses.find(c => c.id.toString() === selectedClass)?.name}</Badge>}
          </div>
        )}
      </div>
      <div className="border rounded-lg shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden bg-white">
        <TableHeaderRow handleSelectAllDefault={() => { }} handleSelectAllReports={() => { }} />
        <ScrollArea className="flex-1">
          <div className="divide-y divide-gray-100">
            <div className="bg-gray-50 px-4 py-2 font-bold text-xs uppercase text-gray-500 tracking-wider">Task Fields</div>
            {reportConfig.taskFields.map(fieldConfig => {
              const header = tableHeaders.find(h => h.id === fieldConfig.id);
              return (
                <TableRowItem
                  key={fieldConfig.id}
                  label={header?.label || fieldConfig.id}
                  isIncluded
                  isDefault={fieldConfig.isDefault}
                  depth={0}
                  readOnly
                />
              );
            })}
            {Object.entries(reportConfig.stages).map(([stageId, stageConfig]) => {
              const stage = stages.find(s => s.id === stageId);
              if (!stage) return null;
              const isNA = nonApplicableStageIds.has(stageId);
              return (
                <div key={stageId}>
                  <div className="bg-gray-50 px-4 py-2 font-bold text-xs uppercase text-gray-500 tracking-wider border-t border-gray-200 flex items-center gap-2">
                    {stage.name}
                    {isNA && <Badge variant="outline" className="text-[11px] text-amber-600 border-amber-300 bg-amber-50">N/A</Badge>}
                  </div>
                  {stageConfig.isStageDateSelected && (
                    <TableRowItem label="Completion Date" isIncluded isDefault={stageConfig.isStageDateDefault} depth={0} readOnly />
                  )}
                  {Object.entries(stageConfig.documents).map(([kycId, docConfig]) => {
                    const kycDoc = kycDocuments.get(kycId);
                    const docFields = (docConfig as any).fields || [];
                    if (!kycDoc) return null;
                    return (
                      <React.Fragment key={kycId}>
                        <div className="px-4 py-1.5 bg-gray-50/50 text-xs font-semibold text-gray-600 border-t border-gray-100 pl-8">
                          {kycDoc.display_name || kycDoc.name}
                        </div>
                        {docFields.map((field: any) => {
                          const fieldInfo = kycDoc.fields?.find((f: any) => f.id === field.id);
                          return (
                            <TableRowItem
                              key={field.id}
                              label={fieldInfo?.fieldName || field.id}
                              isIncluded
                              isDefault={field.isDefault}
                              depth={1}
                              readOnly
                            />
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[72vw] h-[88vh] p-0 overflow-hidden bg-gray-50 flex flex-col gap-0">
        <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
          <ResizablePanel defaultSize={24} minSize={18} maxSize={38} className="flex flex-col bg-white border-r">
            <div className="p-4 border-b shrink-0">
              <DialogTitle className="text-sm font-bold">Saved Reports</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">Manage your report views.</DialogDescription>
            </div>
            <div className="flex-1 min-h-0 p-4 overflow-hidden flex flex-col">
              {isLoading && !isEditing
                ? <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500 h-5 w-5" /></div>
                : renderReportList()}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={76} className="flex flex-col">
            <div className="flex-1 min-h-0 p-5 flex flex-col overflow-hidden">
              {isEditing
                ? <ReportEditor
                  selectedReport={selectedReport}
                  reportName={reportName}
                  setReportName={setReportName}
                  reportConfig={reportConfig}
                  showSelectedOnly={showSelectedOnly}
                  setShowSelectedOnly={setShowSelectedOnly}
                  includedFields={includedFields}
                  originalSavedFieldIds={originalSavedFieldIds}
                  expandedSections={expandedSections}
                  setExpandedSections={setExpandedSections}
                  setIsEditing={setIsEditing}
                  selectedDepartment={selectedDepartment}
                  setSelectedDepartment={setSelectedDepartment}
                  selectedSubdepartment={selectedSubdepartment}
                  setSelectedSubdepartment={setSelectedSubdepartment}
                  selectedClass={selectedClass}
                  setSelectedClass={setSelectedClass}
                  selectedSubClass={selectedSubClass}
                  setSelectedSubClass={setSelectedSubClass}
                  tableHeaders={tableHeaders}
                  sortedStages={sortedStages}
                  kycDocuments={kycDocuments}
                  memoizedDepartments={memoizedDepartments}
                  department={department}
                  nonApplicableStageIds={nonApplicableStageIds}
                  availableSubdepartments={availableSubdepartments}
                  availableClasses={availableClasses}
                  availableSubClasses={availableSubClasses}
                  countSelectedFields={countSelectedFields}
                  isTaskFieldIncluded={isTaskFieldIncluded}
                  toggleTaskFieldInclude={toggleTaskFieldInclude}
                  toggleTaskFieldDefault={toggleTaskFieldDefault}
                  moveTaskField={moveTaskField}
                  toggleStageDateInclude={toggleStageDateInclude}
                  toggleStageDateDefault={toggleStageDateDefault}
                  toggleDocument={toggleDocument}
                  toggleDocFieldInclude={toggleDocFieldInclude}
                  toggleDocFieldDefault={toggleDocFieldDefault}
                  handleSelectAllDefault={handleSelectAllDefault}
                  handleSelectAllReports={handleSelectAllReports}
                  getSectionId={getSectionId}
                />
                : selectedReport
                  ? renderReportViewer()
                  : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                      <div className="p-6 bg-white shadow-sm rounded-full mb-4">
                        <TableIcon className="h-10 w-10 text-gray-200" />
                      </div>
                      <p className="font-semibold text-lg text-gray-600">Select a report to preview</p>
                      <p className="text-sm">Or create a new one to get started.</p>
                    </div>
                  )}
            </div>

            <div className="shrink-0 border-t bg-white px-5 py-3 flex justify-end gap-2">
              {isEditing ? (
                <Button onClick={handleSaveReport} disabled={isLoading || !reportName.trim()} className="bg-green-600 hover:bg-green-700">
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Configuration
                </Button>
              ) : selectedReport ? (
                <Button onClick={handleApply} className="bg-blue-600 hover:bg-blue-700 shadow-sm">
                  Apply This Report
                </Button>
              ) : null}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </DialogContent>
    </Dialog>
  );
}
