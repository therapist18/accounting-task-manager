// @ts-nocheck
// components/MemorizedReportDialog.tsx

"use client"

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import {
  Loader2, Plus, Minus, Edit, Trash2, X, Save, Star, Filter,
  Table as TableIcon, ChevronsUpDown, ChevronUp,
  CheckSquare, AlertCircle
} from "lucide-react"
import type { Department, KycDocument } from "../utils/taskManagerData"
import { ENHANCED_TABLE_HEADERS_IMMIGRATION } from "../tasks/overall-view/tableUtils"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type FieldConfig = {
  id: string;
  isDefault: boolean;
};

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

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_REPORT_CONFIG: ReportConfiguration = {
  taskFields: [{ id: 'applicant_name', isDefault: true }],
  stages: {}
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const normalizeConfiguration = (config: any): ReportConfiguration => {
  if (!config) return INITIAL_REPORT_CONFIG;

  const normalized: ReportConfiguration = {
    taskFields: [],
    stages: {}
  };

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

/**
 * Core applicability check — mirrors DepartmentTasksManager.isStageApplicableToTask
 * and EditableStageCell's local copy. Walks dept → subdept → class → subclass to find
 * an explicit `applicable` override; defaults to true if none found.
 */
const isStageApplicable = (
  stage: any,
  deptId: string,
  subdeptId: string,
  classId: string,
  subClassId: string,
  departments: any[]
): boolean => {
  if (!stage || !deptId || deptId === 'all' || !departments.length) return true;

  try {
    const dept = departments.find(d => d.id.toString() === deptId);
    if (!dept) return true;

    const subdept = dept.tm_subdepartments?.find((s: any) =>
      s.id.toString() === subdeptId && subdeptId !== 'all'
    );
    if (!subdept || subdeptId === 'all') return true;

    // Subclass-level check takes priority (if specified)
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

    // Class-level check
    if (classId && classId !== 'all') {
      const cls = subdept.classes?.find((c: any) => c.id.toString() === classId);
      if (cls) {
        const classStage = cls.stages?.find((s: any) => s.stage_id === stage.id);
        if (classStage && typeof classStage.applicable === 'boolean') {
          return classStage.applicable;
        }
      }
    }

    // Subdept-level fallback
    const subdeptStage = subdept.stages?.find((s: any) => s.stage_id === stage.id);
    if (subdeptStage && typeof subdeptStage.applicable === 'boolean') {
      return subdeptStage.applicable;
    }

    return true; // No override found → applicable
  } catch {
    return true; // Fail-safe
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components (moved outside to prevent re-renders)
// ─────────────────────────────────────────────────────────────────────────────

const TableHeaderRow = React.memo(({ handleSelectAllDefault, handleSelectAllReports }: { handleSelectAllDefault: () => void; handleSelectAllReports: () => void }) => (
  <div className="grid grid-cols-12 gap-0 border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700 sticky top-0 z-20 shadow-sm">
    <div className="col-span-8 px-4 py-3 border-r border-slate-200">Field / Category</div>
    <div className="col-span-2 px-2 py-3 border-r border-slate-200 text-center bg-green-50/50 text-green-700 flex items-center justify-center gap-1">
      <span>Default</span>
      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-green-100 text-green-600" onClick={handleSelectAllDefault} title="Toggle All Default">
        <CheckSquare className="h-3 w-3" />
      </Button>
    </div>
    <div className="col-span-2 px-2 py-3 text-center bg-blue-50/50 text-blue-700 flex items-center justify-center gap-1">
      <span>Reports Table</span>
      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-blue-100 text-blue-600" onClick={handleSelectAllReports} title="Toggle All Report Fields">
        <CheckSquare className="h-3 w-3" />
      </Button>
    </div>
  </div>
));

const TableRowItem = React.memo(({
  label,
  isIncluded,
  isDefault,
  onToggleInclude,
  onToggleDefault,
  depth = 0,
  isSessionOnly = false,
  className = "",
  icon = null,
  readOnly = false
}: {
  label: React.ReactNode;
  isIncluded?: boolean;
  isDefault?: boolean;
  onToggleInclude?: () => void;
  onToggleDefault?: () => void;
  depth?: number;
  isSessionOnly?: boolean;
  className?: string;
  icon?: React.ReactNode;
  readOnly?: boolean;
}) => (
  <div className={cn("grid grid-cols-12 gap-0 border-b border-slate-100 items-stretch text-sm transition-colors bg-white hover:bg-slate-50", className)}>
    <div className="col-span-8 flex items-center border-r border-slate-100 py-2">
      <div style={{ width: `${depth * 24}px` }} className="shrink-0 h-full border-r border-dashed border-slate-100 mr-2 opacity-50" />
      <div className="flex items-center gap-2 px-2 min-w-0">
        {icon}
        <span className={cn("truncate font-medium", isSessionOnly ? "text-blue-600" : "text-slate-700")}>
          {label}
          {isSessionOnly && <span className="text-xs text-blue-500 font-normal ml-1">(Session Only)</span>}
        </span>
      </div>
    </div>
    <div className="col-span-2 flex items-center justify-center border-r border-slate-100 bg-slate-50/30 py-2">
      {(onToggleDefault || readOnly) && (
        <Checkbox
          checked={isDefault}
          onCheckedChange={onToggleDefault}
          disabled={readOnly || isSessionOnly}
          className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 disabled:opacity-50"
        />
      )}
    </div>
    <div className="col-span-2 flex items-center justify-center bg-slate-50/30 py-2">
      {(onToggleInclude || readOnly) && (
        <Checkbox
          checked={isIncluded}
          onCheckedChange={onToggleInclude}
          disabled={readOnly}
          className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 disabled:opacity-50"
        />
      )}
    </div>
  </div>
));

const ExpandableRow = React.memo(({ title, children, stageId, getSectionId, nonApplicableStageIds }: { title: string; children: React.ReactNode; stageId?: string; getSectionId: (title: string) => string; nonApplicableStageIds: Set<string> }) => {
  const sectionId = getSectionId(title);
  const isNA = stageId ? nonApplicableStageIds.has(stageId) : false;

  return (
    <AccordionItem value={sectionId} className={cn(
      "border-b border-slate-200 last:border-0 transition-opacity",
      isNA && "bg-slate-50/50"
    )}>
      <AccordionTrigger className="w-full py-0 hover:no-underline group bg-white">
        <div className="grid grid-cols-12 w-full gap-0 text-left">
          <div className="col-span-12 px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className={cn("font-bold text-sm", isNA ? "text-slate-400" : "text-slate-800")}>
                {title}
              </span>
              {isNA && (
                <Badge variant="outline" className="text-[10px] bg-white text-amber-600 border-amber-200">
                  N/A for Job Level
                </Badge>
              )}
            </div>
            <div className="h-5 w-5 rounded border border-slate-300 bg-white flex items-center justify-center text-slate-500 shadow-sm">
              <Plus className="h-3 w-3 group-data-[state=open]:hidden" />
              <Minus className="h-3 w-3 hidden group-data-[state=open]:block" />
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

// ─────────────────────────────────────────────────────────────────────────────
// Report Editor Component (moved outside to prevent re-renders)
// ─────────────────────────────────────────────────────────────────────────────

interface ReportEditorProps {
  selectedReport: MemorizedReport | null;
  reportName: string;
  setReportName: (name: string) => void;
  reportConfig: ReportConfiguration;
  showSelectedOnly: boolean;
  setShowSelectedOnly: (show: boolean) => void;
  includedFields: Set<string>;
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
  toggleStageDateInclude: (stageId: string) => void;
  toggleStageDateDefault: (stageId: string) => void;
  toggleDocument: (stageId: string, kycId: string) => void;
  toggleDocFieldInclude: (stageId: string, kycId: string, fieldId: string) => void;
  toggleDocFieldDefault: (stageId: string, kycId: string, fieldId: string) => void;
  handleSelectAllDefault: () => void;
  handleSelectAllReports: () => void;
  getSectionId: (title: string) => string;
}

const ReportEditor = React.memo(({
  selectedReport,
  reportName,
  setReportName,
  reportConfig,
  showSelectedOnly,
  setShowSelectedOnly,
  includedFields,
  expandedSections,
  setExpandedSections,
  setIsEditing,
  selectedDepartment,
  setSelectedDepartment,
  selectedSubdepartment,
  setSelectedSubdepartment,
  selectedClass,
  setSelectedClass,
  selectedSubClass,
  setSelectedSubClass,
  tableHeaders,
  sortedStages,
  kycDocuments,
  memoizedDepartments,
  department,
  nonApplicableStageIds,
  availableSubdepartments,
  availableClasses,
  availableSubClasses,
  countSelectedFields,
  isTaskFieldIncluded,
  toggleTaskFieldInclude,
  toggleTaskFieldDefault,
  toggleStageDateInclude,
  toggleStageDateDefault,
  toggleDocument,
  toggleDocFieldInclude,
  toggleDocFieldDefault,
  handleSelectAllDefault,
  handleSelectAllReports,
  getSectionId
}: ReportEditorProps) => {
  const selectedCount = countSelectedFields();

  const filteredTaskFields = tableHeaders.filter(field =>
    showSelectedOnly ? includedFields.has(field.id) : true
  );

  const filteredStages = sortedStages.filter(stage => {
    if (!showSelectedOnly) return true;
    const stageConfig = reportConfig.stages?.[stage.id];
    if (!stageConfig) return false;
    if (stageConfig.isStageDateSelected) return true;
    return Object.keys(stageConfig.documents).length > 0;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-4 pb-4 border-b px-1">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {selectedReport ? `Edit "${selectedReport.name}"` : 'Create New Report'}
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">{selectedCount} field{selectedCount !== 1 ? 's' : ''} selected</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="bg-blue-50 text-blue-700 text-sm px-3 py-1.5 rounded-md border border-blue-100">
              {selectedCount} selected
            </div>
            <Button variant="outline" size="sm" className="text-xs h-8 px-3 flex items-center gap-1.5" onClick={() => setShowSelectedOnly(!showSelectedOnly)}>
              <Filter className="h-3.5 w-3.5" />
              {showSelectedOnly ? 'Show All' : 'Show Selected'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
          </div>
        </div>
      </div>

      {/* Report Name */}
      <div className="mb-3 space-y-1">
        <Label htmlFor="report-name">Report Name *</Label>
        <Input
          id="report-name"
          value={reportName}
          onChange={e => setReportName(e.target.value)}
          placeholder="Enter report name..."
          className="h-9"
        />
      </div>

      {/* ── Job-level Hierarchy ── */}
      <div className="grid grid-cols-4 gap-3 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="space-y-1">
          <Label className="text-xs text-slate-600">Department</Label>
          <Select value={selectedDepartment} onValueChange={v => { setSelectedDepartment(v); setSelectedSubdepartment('all'); setSelectedClass('all'); setSelectedSubClass('all'); }}>
            <SelectTrigger className="h-9 bg-white border-slate-200 text-xs">
              <SelectValue placeholder="All Departments" />
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
          <Label className="text-xs text-slate-600">Sub-Department</Label>
          <Select value={selectedSubdepartment} onValueChange={v => { setSelectedSubdepartment(v); setSelectedClass('all'); setSelectedSubClass('all'); }} disabled={!selectedDepartment}>
            <SelectTrigger className="h-9 bg-white border-slate-200 text-xs">
              <SelectValue placeholder="All Sub-Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sub-Departments</SelectItem>
              {availableSubdepartments.map((s: any) => (
                <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-600">Service Class</Label>
          <Select value={selectedClass} onValueChange={v => { setSelectedClass(v); setSelectedSubClass('all'); }} disabled={!selectedSubdepartment}>
            <SelectTrigger className="h-9 bg-white border-slate-200 text-xs">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {availableClasses.map((c: any) => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-600">Subclass</Label>
          <Select value={selectedSubClass} onValueChange={setSelectedSubClass} disabled={!selectedClass}>
            <SelectTrigger className="h-9 bg-white border-slate-200 text-xs">
              <SelectValue placeholder="All Subclasses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subclasses</SelectItem>
              {availableSubClasses.map((sc: any) => (
                <SelectItem key={sc.id} value={sc.id.toString()}>{sc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Applicability summary */}
        {selectedDepartment && nonApplicableStageIds.size > 0 && (
          <div className="col-span-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-md border border-amber-200">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>{nonApplicableStageIds.size}</strong> stage{nonApplicableStageIds.size !== 1 ? 's are' : ' is'} not applicable to the selected job level and shown greyed out.
            </span>
          </div>
        )}
      </div>

      {/* ── Field Table ── */}
      <div className="flex-1 flex flex-col min-h-0 border rounded-lg shadow-sm overflow-hidden bg-white">
        <TableHeaderRow handleSelectAllDefault={handleSelectAllDefault} handleSelectAllReports={handleSelectAllReports} />
        <ScrollArea className="flex-1">
          <Accordion
            type="multiple"
            className="w-full divide-y divide-slate-200"
            value={expandedSections}
            onValueChange={setExpandedSections}
          >
            {/* Task Details */}
            {filteredTaskFields.length > 0 && (
              <ExpandableRow title="Task Details" getSectionId={getSectionId} nonApplicableStageIds={nonApplicableStageIds}>
                {filteredTaskFields.map(field => {
                  const isIncluded = isTaskFieldIncluded(field.id);
                  const config = reportConfig.taskFields?.find(f => f.id === field.id);
                  const isSessionOnly = isIncluded && !config?.isDefault;
                  return (
                    <TableRowItem
                      key={field.id}
                      label={field.label}
                      isIncluded={isIncluded}
                      isDefault={!!config?.isDefault}
                      onToggleInclude={() => toggleTaskFieldInclude(field.id)}
                      onToggleDefault={() => toggleTaskFieldDefault(field.id)}
                      depth={1}
                      isSessionOnly={isSessionOnly}
                    />
                  );
                })}
              </ExpandableRow>
            )}

            {/* Stages — only applicable stages shown; N/A ones filtered out */}
            {filteredStages.map(stage => {
              const stageConfig = reportConfig.stages?.[stage.id];
              const filteredDocs = (stage.documents || []).filter((doc: any) =>
                showSelectedOnly ? !!stageConfig?.documents?.[doc.kycId] : true
              );

              if (showSelectedOnly && !stageConfig?.isStageDateSelected && filteredDocs.length === 0) return null;

              return (
                <ExpandableRow key={`stage-${stage.id}`} title={stage.name} stageId={stage.id} getSectionId={getSectionId} nonApplicableStageIds={nonApplicableStageIds}>
                  {/* Stage date row */}
                  {(!showSelectedOnly || stageConfig?.isStageDateSelected) && (
                    <TableRowItem
                      label="Stage Completion Date"
                      isIncluded={!!stageConfig?.isStageDateSelected}
                      isDefault={!!stageConfig?.isStageDateDefault}
                      onToggleInclude={() => toggleStageDateInclude(stage.id)}
                      onToggleDefault={() => toggleStageDateDefault(stage.id)}
                      depth={1}
                      className="bg-slate-50/50 italic text-slate-600"
                    />
                  )}

                  {/* Documents */}
                  {filteredDocs.map((doc: any) => {
                    const kycDoc = kycDocuments.get(doc.kycId);
                    if (!kycDoc) return null;
                    const isDocActive = !!stageConfig?.documents?.[doc.kycId];

                    return (
                      <div key={`doc-${stage.id}-${doc.kycId}`}>
                        {/* Document header */}
                        <div className="grid grid-cols-12 gap-0 border-b border-slate-100 items-stretch text-sm hover:bg-slate-50">
                          <div className="col-span-8 flex items-center border-r border-slate-100 py-2">
                            <div style={{ width: `24px` }} className="shrink-0 h-full border-r border-dashed border-slate-100 mr-2 opacity-50" />
                            <div className="flex items-center gap-2 px-2 py-1 w-full">
                              <Checkbox
                                id={`doc-${stage.id}-${doc.kycId}`}
                                checked={isDocActive}
                                onCheckedChange={() => toggleDocument(stage.id, doc.kycId)}
                              />
                              <Label htmlFor={`doc-${stage.id}-${doc.kycId}`} className="cursor-pointer font-semibold text-slate-700 flex-1 truncate">
                                {kycDoc.display_name || kycDoc.name}
                              </Label>
                            </div>
                          </div>
                          <div className="col-span-2 border-r border-slate-100 bg-slate-50/30" />
                          <div className="col-span-2 bg-slate-50/30" />
                        </div>

                        {/* Document fields */}
                        {isDocActive && (
                          <div className="bg-slate-50/30">
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
                                  isSessionOnly={!!fieldConfig && !fieldConfig.isDefault}
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

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function MemorizedReportDialog({
  open,
  onOpenChange,
  department,
  stages,
  kycDocuments,
  onApplyReport,
  tableHeaders,
  availableJobLevels = [],
  departments = [],
  subdepartments = [],
  classes = [],
}: MemorizedReportDialogProps) {
  const [reports, setReports] = useState<MemorizedReport[]>([])
  const [selectedReport, setSelectedReport] = useState<MemorizedReport | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [reportName, setReportName] = useState("")
  const [reportConfig, setReportConfig] = useState<ReportConfiguration>(INITIAL_REPORT_CONFIG)

  // Hierarchical job-level selectors
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedSubdepartment, setSelectedSubdepartment] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSubClass, setSelectedSubClass] = useState<string>('all');

  // UI state
  const [includedFields, setIncludedFields] = useState<Set<string>>(new Set());
  const [showSelectedOnly, setShowSelectedOnly] = useState(true);
  const [expandedSections, setExpandedSections] = useState<string[]>(['task-details']);
  const [allExpanded, setAllExpanded] = useState(false);

  // ─── Memoised derived data ───────────────────────────────────────────────

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

  /**
   * Compute which stages are N/A for the selected job level.
   * We always show ALL stages, but grey out the non-applicable ones.
   */
  const nonApplicableStageIds = useMemo(() => {
    if (!selectedDepartment || selectedDepartment === 'all' || !stages.length) return new Set<string>();
    return new Set(
      stages
        .filter(stage => !isStageApplicable(stage, selectedDepartment, selectedSubdepartment, selectedClass, selectedSubClass, memoizedDepartments))
        .map(s => s.id)
    );
  }, [stages, selectedDepartment, selectedSubdepartment, selectedClass, selectedSubClass, memoizedDepartments]);

  // All stages sorted — we never filter them out, just visually indicate N/A ones
  const sortedStages = useMemo(() => {
    return [...stages].sort((a, b) => (a.order || a.order_num || 0) - (b.order || b.order_num || 0));
  }, [stages]);

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

  // ─── Section helpers ─────────────────────────────────────────────────────

  const getSectionId = useCallback((title: string) => title.toLowerCase().replace(/\s+/g, '-'), []);

  const getAllSectionIds = useCallback(() => [
    'task-details',
    ...sortedStages.map(stage => getSectionId(stage.name))
  ], [sortedStages, getSectionId]);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const next = prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId];
      setAllExpanded(next.length === getAllSectionIds().length);
      return next;
    });
  }, [getAllSectionIds]);

  const toggleAllSections = useCallback(() => {
    if (allExpanded) {
      setExpandedSections([]);
      setAllExpanded(false);
    } else {
      setExpandedSections(getAllSectionIds());
      setAllExpanded(true);
    }
  }, [allExpanded, getAllSectionIds]);

  // ─── Field counting ───────────────────────────────────────────────────────

  const countSelectedFields = useCallback(() => {
    let count = reportConfig.taskFields.filter(f => includedFields.has(f.id)).length;
    Object.values(reportConfig.stages).forEach(stage => {
      if (stage.isStageDateSelected) count++;
      Object.values(stage.documents).forEach(doc => {
        count += doc.fields.filter(f => includedFields.has(f.id)).length;
      });
    });
    return count;
  }, [reportConfig, includedFields]);

  // ─── Data fetching ────────────────────────────────────────────────────────

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

  // Filter by job level when hierarchy changes
  useEffect(() => {
    const deptId = department?.id;
    if (!deptId) return;

    const filter = async () => {
      setIsLoading(true);
      try {
        let query = supabase
          .from('tm_memorized_reports')
          .select('*')
          .eq('department_id', deptId)
          .order('name', { ascending: true });

        const { data, error } = await query;
        if (error) throw error;
        setReports(data || []);
      } catch {
        // silent
      } finally {
        setIsLoading(false);
      }
    };
    filter();
  }, [department?.id, selectedDepartment, selectedSubdepartment, selectedClass]);

  useEffect(() => {
    if (open && department) fetchReports();
  }, [open, fetchReports, department]);

  // Reset on open / dept change
  useEffect(() => {
    setSelectedReport(null);
    setReportName("");
    setReportConfig(INITIAL_REPORT_CONFIG);
    setIncludedFields(new Set(['applicant_name']));
    setIsEditing(false);
    setShowSelectedOnly(true);
    setExpandedSections(['task-details']);

    if (department?.id) {
      setSelectedDepartment(department.id.toString());
    } else {
      setSelectedDepartment('all');
    }
    setSelectedSubdepartment('all');
    setSelectedClass('all');
    setSelectedSubClass('all');
  }, [department?.id]);

  // ─── Report actions ───────────────────────────────────────────────────────

  const handleCreateNew = () => {
    setSelectedReport(null);
    setReportName("");
    setReportConfig(INITIAL_REPORT_CONFIG);
    setIncludedFields(new Set(['applicant_name']));
    setIsEditing(true);
    setShowSelectedOnly(false);
    setExpandedSections(['task-details']);
  };

  const handleSelectReport = (report: MemorizedReport) => {
    const config = normalizeConfiguration(report.configuration);
    setSelectedReport(report);
    setReportName(report.name);
    setReportConfig(config);
    setIncludedFields(new Set(config.taskFields.map(f => f.id)));
    setIsEditing(false);
    setShowSelectedOnly(true);
    setExpandedSections(['task-details']);

    if (report.job_level) {
      setSelectedDepartment(report.job_level.department_id?.toString() || 'all');
      setSelectedSubdepartment(report.job_level.subdepartment_id?.toString() || 'all');
      setSelectedClass(report.job_level.class_id?.toString() || 'all');
    }
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

  const getFinalConfiguration = (config: ReportConfiguration): ReportConfiguration => {
    const orderedTaskFields = tableHeaders
      .filter(header => config.taskFields.find(f => f.id === header.id)?.isDefault)
      .map(header => {
        const field = config.taskFields.find(f => f.id === header.id)!;
        return { id: field.id, isDefault: field.isDefault };
      });

    const newStages: ReportConfiguration['stages'] = {};
    stages.forEach(stage => {
      if (config.stages[stage.id]) {
        newStages[stage.id] = { ...config.stages[stage.id], documents: { ...config.stages[stage.id].documents } };
      }
    });

    return { taskFields: orderedTaskFields, stages: newStages };
  };

  const handleSaveReport = async () => {
    if (!reportName.trim() || !department) return;
    setIsLoading(true);
    try {
      const finalConfig = getFinalConfiguration(reportConfig);
      const reportData = {
        name: reportName,
        configuration: finalConfig,
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
      await fetchReports();
    } catch {
      toast({ title: "Error", description: "Failed to delete report.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (selectedReport) {
      const finalConfig = getFinalConfiguration(reportConfig);
      onApplyReport({
        ...selectedReport,
        configuration: finalConfig,
        sessionIncludedFields: Array.from(includedFields)
      });
      onOpenChange(false);
    }
  };

  // ─── Field toggle helpers ─────────────────────────────────────────────────

  const isTaskFieldIncluded = useCallback((fieldId: string) => includedFields.has(fieldId), [includedFields]);

  const toggleTaskFieldInclude = useCallback((fieldId: string) => {
    setIncludedFields(prev => {
      const next = new Set(prev);
      next.has(fieldId) ? next.delete(fieldId) : next.add(fieldId);
      return next;
    });
  }, []);

  const toggleTaskFieldDefault = useCallback((fieldId: string) => {
    setReportConfig(prev => {
      const current = prev.taskFields || [];
      const exists = current.find(f => f.id === fieldId);
      const newFields = exists
        ? current.map(f => f.id === fieldId ? { ...f, isDefault: !f.isDefault } : f)
        : [...current, { id: fieldId, isDefault: true }];
      return { ...prev, taskFields: newFields };
    });
    setIncludedFields(prev => {
      if (!prev.has(fieldId)) { const n = new Set(prev); n.add(fieldId); return n; }
      return prev;
    });
  }, []);

  const toggleStageDateInclude = (stageId: string) => {
    setReportConfig(prev => {
      const newStages = { ...prev.stages };
      if (!newStages[stageId]) {
        newStages[stageId] = { isStageDateSelected: true, isStageDateDefault: false, documents: {} };
      } else {
        newStages[stageId].isStageDateSelected = !newStages[stageId].isStageDateSelected;
        if (!newStages[stageId].isStageDateSelected && Object.keys(newStages[stageId].documents).length === 0) {
          delete newStages[stageId];
        }
      }
      return { ...prev, stages: newStages };
    });
  };

  const toggleStageDateDefault = (stageId: string) => {
    setReportConfig(prev => {
      const newStages = { ...prev.stages };
      if (!newStages[stageId]) {
        newStages[stageId] = { isStageDateSelected: true, isStageDateDefault: true, documents: {} };
      } else {
        newStages[stageId].isStageDateDefault = !newStages[stageId].isStageDateDefault;
        if (newStages[stageId].isStageDateDefault) newStages[stageId].isStageDateSelected = true;
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

  // ─── Select All helpers ───────────────────────────────────────────────────

  const handleSelectAllDefault = useCallback(() => {
    const allTaskFieldIds = tableHeaders.map(f => f.id);
    const areAllDefault = allTaskFieldIds.every(id => reportConfig.taskFields.find(f => f.id === id)?.isDefault);
    const shouldSelect = !areAllDefault;

    setReportConfig(prev => {
      const newTaskFields = allTaskFieldIds.map(id => ({ id, isDefault: shouldSelect }));
      const newStages = { ...prev.stages };

      sortedStages.forEach(stage => {
        if (!newStages[stage.id]) {
          newStages[stage.id] = { isStageDateSelected: shouldSelect, isStageDateDefault: shouldSelect, documents: {} };
        } else {
          newStages[stage.id].isStageDateDefault = shouldSelect;
          if (shouldSelect) newStages[stage.id].isStageDateSelected = true;
        }
        (stage.documents || []).forEach((doc: any) => {
          const kycDoc = kycDocuments.get(doc.kycId);
          if (kycDoc?.fields) {
            if (!newStages[stage.id].documents[doc.kycId]) {
              newStages[stage.id].documents[doc.kycId] = { fields: [] };
            }
            newStages[stage.id].documents[doc.kycId].fields = kycDoc.fields.map((f: any) => ({
              id: f.id, isDefault: shouldSelect
            }));
          }
        });
      });

      return { ...prev, taskFields: newTaskFields, stages: newStages };
    });

    if (shouldSelect) setIncludedFields(new Set(allTaskFieldIds));
  }, [tableHeaders, sortedStages, kycDocuments, reportConfig.taskFields]);

  const handleSelectAllReports = useCallback(() => {
    const allTaskFieldIds = tableHeaders.map(f => f.id);
    const areAllIncluded = allTaskFieldIds.every(id => includedFields.has(id));
    const shouldSelect = !areAllIncluded;

    setIncludedFields(shouldSelect ? new Set(allTaskFieldIds) : new Set());

    setReportConfig(prev => {
      const newStages = { ...prev.stages };
      sortedStages.forEach(stage => {
        if (!newStages[stage.id]) {
          newStages[stage.id] = { isStageDateSelected: shouldSelect, isStageDateDefault: false, documents: {} };
        } else {
          newStages[stage.id].isStageDateSelected = shouldSelect;
        }
        (stage.documents || []).forEach((doc: any) => {
          const kycDoc = kycDocuments.get(doc.kycId);
          if (kycDoc?.fields) {
            if (shouldSelect) {
              newStages[stage.id].documents[doc.kycId] = {
                fields: kycDoc.fields.map((f: any) => ({
                  id: f.id,
                  isDefault: prev.stages[stage.id]?.documents[doc.kycId]?.fields.find((df: any) => df.id === f.id)?.isDefault || false
                }))
              };
            } else {
              delete newStages[stage.id]?.documents[doc.kycId];
            }
          }
        });
        if (!shouldSelect && newStages[stage.id] && Object.keys(newStages[stage.id].documents).length === 0 && !newStages[stage.id].isStageDateSelected) {
          delete newStages[stage.id];
        }
      });
      return { ...prev, stages: newStages };
    });
  }, [tableHeaders, sortedStages, kycDocuments, includedFields]);

  // ─── Sorted reports ───────────────────────────────────────────────────────

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      if (a.is_favorite && !b.is_favorite) return -1;
      if (!a.is_favorite && b.is_favorite) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [reports]);

  // ─── Render: Report List ──────────────────────────────────────────────────

  const renderReportList = () => (
    <div className="flex flex-col gap-2 h-full">
      <Button onClick={handleCreateNew} className="w-full mb-2 bg-slate-800 hover:bg-slate-700">
        <Plus className="mr-2 h-4 w-4" /> Create New Report
      </Button>
      <ScrollArea className="flex-1 pr-4 -mr-4">
        <div className="space-y-1">
          {sortedReports.map(report => (
            <div
              key={report.id}
              className={`group flex items-center justify-between p-2 rounded-md cursor-pointer border transition-all
                ${selectedReport?.id === report.id
                  ? 'bg-blue-50 border-blue-200 shadow-sm'
                  : 'border-transparent hover:bg-slate-50 hover:border-slate-200'}`}
              onClick={() => handleSelectReport(report)}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-6 w-6 shrink-0 ${report.is_favorite ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                  onClick={(e) => handleToggleFavorite(e, report)}
                >
                  <Star className="h-4 w-4 fill-current" />
                </Button>
                <div className="flex flex-col min-w-0">
                  <span className={`font-medium text-sm truncate ${selectedReport?.id === report.id ? 'text-blue-700' : 'text-slate-700'}`}>
                    {report.name}
                  </span>
                  {report.job_level && (
                    <span className="text-[10px] text-slate-400 truncate">
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
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-blue-600" onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-red-600" onClick={(e) => { e.stopPropagation(); handleDeleteReport(report.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {reports.length === 0 && <div className="text-center text-slate-400 py-8 text-sm">No reports found.</div>}
        </div>
      </ScrollArea>
    </div>
  );

  // ─── Render: Report Viewer ────────────────────────────────────────────────

  const renderReportViewer = () => {
    const allIncludedFields = new Set([
      ...(reportConfig.taskFields?.map(f => f.id) || []),
      ...Array.from(includedFields)
    ]);

    return (
      <div className="flex flex-col h-full">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-slate-900">{selectedReport?.name}</h3>
          <p className="text-sm text-slate-500">Read-only preview.</p>
          {selectedReport?.job_level && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium">Scope:</span>
              {selectedDepartment && selectedDepartment !== 'all' && <Badge variant="outline" className="text-xs">{memoizedDepartments.find(d => d.id.toString() === selectedDepartment)?.name}</Badge>}
              {selectedSubdepartment && selectedSubdepartment !== 'all' && <Badge variant="outline" className="text-xs">{availableSubdepartments.find(s => s.id.toString() === selectedSubdepartment)?.name}</Badge>}
              {selectedClass && selectedClass !== 'all' && <Badge variant="outline" className="text-xs">{availableClasses.find(c => c.id.toString() === selectedClass)?.name}</Badge>}
              {selectedSubClass && selectedSubClass !== 'all' && <Badge variant="outline" className="text-xs">{availableSubClasses.find(sc => sc.id.toString() === selectedSubClass)?.name}</Badge>}
            </div>
          )}
        </div>

        <div className="border rounded-lg shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden bg-white">
          <TableHeaderRow handleSelectAllDefault={() => { }} handleSelectAllReports={() => { }} />
          <ScrollArea className="flex-1">
            <div className="divide-y divide-slate-100">
              <div className="bg-slate-50 px-4 py-2 font-bold text-xs uppercase text-slate-500 tracking-wider">Task Fields</div>
              {Array.from(allIncludedFields).map(fieldId => {
                const fieldConfig = reportConfig.taskFields?.find(f => f.id === fieldId);
                const header = tableHeaders.find(h => h.id === fieldId);
                return (
                  <TableRowItem
                    key={fieldId}
                    label={header?.label || fieldId}
                    isIncluded
                    isDefault={!!fieldConfig?.isDefault}
                    isSessionOnly={!fieldConfig?.isDefault}
                    depth={0}
                    readOnly
                  />
                );
              })}

              {Object.entries(reportConfig.stages).map(([stageId, stageConfig]) => {
                const stage = stages.find(s => s.id === stageId);
                if (!stage) return null;

                // Show N/A badge in viewer if this stage is not applicable to selected job level
                const isNA = nonApplicableStageIds.has(stageId);

                return (
                  <div key={stageId}>
                    <div className="bg-slate-50 px-4 py-2 font-bold text-xs uppercase text-slate-500 tracking-wider border-t border-slate-200 flex items-center gap-2">
                      {stage.name}
                      {isNA && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50">N/A for selected level</Badge>}
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
                          <div className="px-4 py-1.5 bg-slate-50/50 text-xs font-semibold text-slate-600 border-t border-slate-100 pl-8">
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
                                isSessionOnly={!field.isDefault}
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
  };

  // ─── Main Render ──────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] grid grid-cols-12 gap-0 p-0 overflow-hidden bg-slate-50">
        {/* Left panel: report list */}
        <div className="col-span-3 border-r bg-white p-4 flex flex-col h-full overflow-hidden">
          <DialogHeader className="mb-4 px-1">
            <DialogTitle>Saved Reports</DialogTitle>
            <DialogDescription>Manage your customized report views.</DialogDescription>
          </DialogHeader>
          {isLoading && !isEditing
            ? <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500" /></div>
            : renderReportList()}
        </div>

        {/* Right panel: editor / viewer */}
        <div className="col-span-9 p-6 flex flex-col h-full overflow-hidden">
          <div className="flex-1 min-h-0 mb-4 overflow-hidden flex flex-col">
            {isEditing
              ? <ReportEditor
                selectedReport={selectedReport}
                reportName={reportName}
                setReportName={setReportName}
                reportConfig={reportConfig}
                showSelectedOnly={showSelectedOnly}
                setShowSelectedOnly={setShowSelectedOnly}
                includedFields={includedFields}
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
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <div className="p-6 bg-white shadow-sm rounded-full mb-4"><TableIcon className="h-10 w-10 text-slate-200" /></div>
                    <p className="font-semibold text-lg text-slate-600">Select a report to view details</p>
                    <p className="text-sm">Or create a new one to get started.</p>
                  </div>
                )}
          </div>

          <DialogFooter className="mt-auto pt-4 border-t bg-slate-50 -mx-6 -mb-6 p-6">
            {isEditing ? (
              <Button onClick={handleSaveReport} disabled={isLoading || !reportName.trim()} className="w-full sm:w-auto bg-green-600 hover:bg-green-700">
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Configuration
              </Button>
            ) : selectedReport ? (
              <Button onClick={handleApply} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 shadow-sm">
                Apply This Report
              </Button>
            ) : null}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}