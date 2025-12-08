// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, LayoutGrid, Rows, Plus, Minus, Briefcase, FileDown, ChevronDown, ChevronsRight, ChevronsDown, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { 
  getCurrentStageStatus,
  renderImmigrationStatusCell,
  renderCurrentStageStatusCell, 
  getCellContent,
  getEnhancedImmigrationStatus 
} from "../tasks/overall-view/tableUtils";
// Make sure this path is correct for your project structure
import { calculateAge } from "@/lib/utils/utils"; 
import {
  fetchTasks, 
  fetchStages,
  fetchDepartments,
  fetchCompanies,
  fetchAllDocuments,
  fetchAllKycFields,
  fetchTmUsers,
  formatDateValue,
} from "../tasks/utils/taskManagerData";

// Extend jsPDF types
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

// Types
interface ReportTableProps {
  report: any;
  onExit: () => void;
}

export default function ReportTable({ report, onExit }: ReportTableProps) {
  // Local Data State
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Map<number, string>>(new Map());
  const [allDocuments, setAllDocuments] = useState<any[]>([]);
  const [kycDocuments, setKycDocuments] = useState<Map<string, any>>(new Map());
  const [tmUsers, setTmUsers] = useState<Map<number, any>>(new Map());
  const [taskDependants, setTaskDependants] = useState<Map<string, any[]>>(new Map());
  const [enhancedTasksData, setEnhancedTasksData] = useState<Map<string, any>>(new Map());

  // View State
  const [view, setView] = useState<'standard' | 'transposed'>('standard');
  const [expandedSections, setExpandedSections] = useState(() => new Set(['task_details']));

  // --- 1. Data Fetching ---
  useEffect(() => {
    // If no report is passed, stop loading immediately
    if (!report) {
      setLoading(false);
      return;
    }

    const loadReportData = async () => {
      try {
        setLoading(true);
        // 1. Fetch Core Context Data
        const [
          deptsData,
          companiesData,
          docsData,
          kycFieldsData,
          usersMap
        ] = await Promise.all([
          fetchDepartments(),
          fetchCompanies(),
          fetchAllDocuments(),
          fetchAllKycFields(),
          fetchTmUsers()
        ]);

        // Destructure safely
        const kycDocsMap = kycFieldsData?.kycDocsMap || new Map();

        // 2. Determine Scope based on Report Configuration
        const deptId = report.department_id?.toString();

        // 3. Fetch Tasks & Stages specific to the scope
        const [tasksData, stagesData] = await Promise.all([
          fetchTasks(deptId),
          deptId ? fetchStages(deptId, deptsData) : Promise.resolve([])
        ]);

        const safeTasks = Array.isArray(tasksData) ? tasksData : [];

        // 4. Process Dependants
        const processDependants = async () => {
          const dependantsMap = new Map<string, any[]>();
          const enhancedMap = new Map<string, any>();

          safeTasks.forEach(task => {
            // Fix: Fixed typo calculateAgee -> calculateAge
            const age = calculateAge ? calculateAge(task.date_of_birth) : null;
            
            enhancedMap.set(task.id.toString(), {
              ...task,
              age: age
            });

            if (task.dependant_member && Array.isArray(task.dependant_member)) {
              dependantsMap.set(task.id.toString(), task.dependant_member);
            }
          });
          return { dependantsMap, enhancedMap };
        };

        const { dependantsMap, enhancedMap } = await processDependants();

        // 5. Update State (Batching helps but React 18 handles this automatically mostly)
        setDepartments(deptsData || []);
        setCompanies(companiesData || new Map());
        setAllDocuments(docsData || []);
        setKycDocuments(kycDocsMap);
        setTmUsers(usersMap || new Map());
        setTasks(safeTasks);
        setStages(stagesData || []);
        setTaskDependants(dependantsMap);
        setEnhancedTasksData(enhancedMap);

      } catch (error) {
        console.error("Failed to load report data", error);
        toast({
          title: "Error",
          description: "Failed to load report data. Please check connection.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    loadReportData();
  }, [report]);

  // --- 2. Local Helper Functions ---

  const getStaffName = useCallback((userId: number) => {
    if (!userId) return '';
    const user = tmUsers.get(Number(userId));
    return user?.name || `User ${userId}`;
  }, [tmUsers]);

  const getTaskHierarchy = useCallback((task: any) => {
    if (!task || !departments.length) return null
    const dept = departments.find(d => d.id === task.department?.id || d.id === task.department_id)
    if (!dept) return null
    const subdept = dept.tm_subdepartments?.find((s: any) => s.id === task.subdepartment?.id || s.id === task.subdepartment_id)
    const cls = subdept?.classes?.find((c: any) => c.id.toString() === task.class_id?.toString())
    const subCls = cls?.subClasses?.find((sc: any) => sc.id.toString() === task.subclass_id?.toString())
    return { department: dept, subdepartment: subdept, class: cls, subclass: subCls }
  }, [departments]);

  const getDocumentForTaskStage = useCallback((task: any, stage: any) => {
    const linkedDocumentData = task.source_document_id?.[stage.id];
    if (!linkedDocumentData) return [];

    const documentRefs = Array.isArray(linkedDocumentData) ? linkedDocumentData : [linkedDocumentData];

    return documentRefs.map(ref => {
      const documentId = typeof ref === 'string' ? ref : ref.id;
      return allDocuments.find(doc => doc.id.toString() === documentId.toString());
    }).filter(Boolean);
  }, [allDocuments]);

  const isDocumentOlderThanTask = (documentDate: string, taskDate: string) => {
    if (!documentDate || !taskDate) return false;
    try {
      return new Date(documentDate) < new Date(taskDate);
    } catch (error) {
      return false;
    }
  };

  const getPlainTextCellContent = (task: any, column: any) => {
    switch (column.type) {
      case 'task':
        return task[column.field]?.toString() || task[column.field] || '-';
      case 'stage_date': {
        const stageData = task.stages?.[column.stageId];
        return stageData?.date ? formatDateValue(stageData.date) : '-';
      }
      case 'extracted_field': {
        const stage = stages.find(s => s.id === column.stageId);
        const stageDocInfo = stage?.documents?.find((d: any) => d.kycId === column.kycId);
        if (!stage || !stageDocInfo) return 'N/A';

        const linkedDocs = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] });
        const linkedDocument = linkedDocs[0]; // Take first for report

        if (!linkedDocument) return 'Not Linked';
        if (linkedDocument.indicator) return 'Indicator';

        const fieldValueRaw = linkedDocument.extracted_details?.[column.fieldName] || linkedDocument.extracted_details?.[column.fieldId];
        const fieldValue = (column.fieldType?.toLowerCase() === 'date') ? formatDateValue(fieldValueRaw) : (fieldValueRaw || '-');
        const isOld = isDocumentOlderThanTask(linkedDocument.created_at, task.created_at);

        return isOld ? `${fieldValue} (Old Doc)` : fieldValue;
      }
      default:
        return '-';
    }
  };

  // --- 3. View Logic (Standard vs Transposed) ---

  const columns = useMemo(() => {
    if (!report || !stages.length) return [];

    const getHeaderLabel = (id: string) => {
      const headerMap: Record<string, string> = {
        'applicant_name': 'Applicant Name', 'company_id': 'Company', 'task_manager_id': 'Manager',
        'officer_id': 'Officer', 'status': 'Status', 'created_at': 'Created Date'
      };
      return headerMap[id] || id.replace(/_/g, ' ').toUpperCase();
    };

    const generatedColumns: any[] = [];
    
    if (report.configuration?.taskFields) {
      report.configuration.taskFields.forEach((fieldId: string) => {
        generatedColumns.push({
          id: `task_${fieldId}`,
          label: getHeaderLabel(fieldId),
          type: 'task',
          field: fieldId
        });
      });
    }

    if (report.configuration?.stages) {
      const configuredStageIds = Object.keys(report.configuration.stages);
      const orderedStages = stages.filter(s => configuredStageIds.includes(s.id));

      orderedStages.forEach(stage => {
        const stageConfig = report.configuration.stages[stage.id];
        if (!stageConfig) return;

        if (stageConfig.isStageDateSelected) {
          generatedColumns.push({ id: `stage_date_${stage.id}`, label: `${stage.name} Date`, type: 'stage_date', stageId: stage.id });
        }
        if (stageConfig.documents) {
          Object.entries(stageConfig.documents).forEach(([kycId, docConfig]: [string, any]) => {
            const kycDoc = kycDocuments.get(kycId);
            if (!kycDoc) return;
            docConfig.fields.forEach((fieldId: string) => {
              const field = kycDoc.fields?.find((f: any) => f.id === fieldId);
              if (field) {
                generatedColumns.push({
                  id: `field_${stage.id}_${kycId}_${fieldId}`,
                  label: `${kycDoc.display_name || kycDoc.name} - ${field.fieldName}`,
                  type: 'extracted_field',
                  stageId: stage.id,
                  kycId,
                  fieldId,
                  fieldName: field.fieldName,
                  fieldType: field.fieldType
                });
              }
            });
          });
        }
      });
    }
    return generatedColumns;
  }, [report, stages, kycDocuments]);

  const columnGroups = useMemo(() => {
    if (!columns.length) return [];
    const taskGroup = { id: 'task_details', label: "Task Details", columns: [] as any[] };
    const stageGroups = new Map();

    columns.forEach(col => {
      if (col.type === 'task') {
        taskGroup.columns.push(col);
      } else if (col.type === 'stage_date' || col.type === 'extracted_field') {
        if (!stageGroups.has(col.stageId)) {
          const stage = stages.find(s => s.id === col.stageId);
          stageGroups.set(col.stageId, {
            id: `stage_group_${col.stageId}`,
            label: stage?.name || 'Unknown Stage',
            columns: []
          });
        }
        stageGroups.get(col.stageId).columns.push(col);
      }
    });

    const result = [];
    if (taskGroup.columns.length > 0) result.push(taskGroup);
    result.push(...Array.from(stageGroups.values()));
    return result;
  }, [columns, stages]);

  const transposedTableRows = useMemo(() => {
    if (!report) return [];
    const rows: any[] = [];
    const config = report.configuration;

    const getHeaderLabel = (id: string) => id.replace(/_/g, ' ').toUpperCase(); 

    rows.push({ type: 'section_header', id: 'task_details', label: 'Task Details', icon: Briefcase, isExpanded: expandedSections.has('task_details') });

    if (expandedSections.has('task_details') && config?.taskFields) {
      config.taskFields.forEach((fieldId: string) => {
        rows.push({ type: 'task', field: fieldId, label: getHeaderLabel(fieldId), isSubRow: true });
      });
    }

    if (config?.stages) {
      const configuredStageIds = Object.keys(config.stages);
      const orderedStages = stages.filter(s => configuredStageIds.includes(s.id));

      orderedStages.forEach(stage => {
        const stageConfig = config.stages[stage.id];
        if (!stage) return;
        rows.push({ type: 'section_header', id: stage.id, label: stage.name, icon: stage.icon || Briefcase, isExpanded: expandedSections.has(stage.id) });

        if (expandedSections.has(stage.id)) {
          if (stageConfig.isStageDateSelected) rows.push({ type: 'stage_date', stageId: stage.id, label: 'Completion Date', isSubRow: true });
          if (stageConfig.documents) {
            Object.entries(stageConfig.documents).forEach(([kycId, docConfig]: [string, any]) => {
              const kycDoc = kycDocuments.get(kycId);
              if (!kycDoc) return;
              docConfig.fields.forEach((fieldId: string) => {
                const field = kycDoc.fields?.find((f: any) => f.id === fieldId);
                if (field) rows.push({
                  type: 'extracted_field',
                  stageId: stage.id,
                  kycId,
                  fieldId,
                  fieldName: field.fieldName,
                  fieldType: field.fieldType,
                  label: `${kycDoc.display_name} - ${field.fieldName}`,
                  isSubRow: true
                });
              });
            });
          }
        }
      });
    }
    return rows;
  }, [report, expandedSections, stages, kycDocuments]);

  // --- 4. Render Logic for Cells ---
  const renderCell = (task: any, column: any) => {
    switch (column.type) {
      case 'task':
        return getCellContent(
          task,
          column.field,
          enhancedTasksData,
          taskDependants,
          new Set(), // expandedDependants
          companies,
          getTaskHierarchy,
          getStaffName,
          getEnhancedImmigrationStatus,
          getCurrentStageStatus,
          () => null, // renderImmigrationStatusCell
          () => null, // renderCurrentStageStatusCell
          () => { }, // toggleDependantsExpansion
          () => { }, // setLinkingTask
          () => { } // setIsLinkDialogOpen
        );

      case 'stage_date': {
        const stageData = task.stages?.[column.stageId];
        if (stageData?.date) {
          return (
            <div className="">
              {formatDateValue(stageData.date)}
            </div>
          );
        }
        return <div className="text-start text-red-500">Missing</div>;
      }

      case 'extracted_field': {
        const stage = stages.find(s => s.id === column.stageId);
        const stageDocInfo = stage?.documents?.find((d: any) => d.kycId === column.kycId);
        if (!stage || !stageDocInfo) return <div className="text-start text-slate-400">Missing</div>;

        const linkedDocs = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] });
        const linkedDocument = linkedDocs[0];

        if (!linkedDocument) {
          return (
            <div className="flex">
              <Badge variant="outline" className="font-normal border-dashed">Not Linked</Badge>
            </div>
          );
        }
        const fieldValueRaw = linkedDocument.extracted_details?.[column.fieldName] || linkedDocument.extracted_details?.[column.fieldId];
        const fieldValue = (column.fieldType?.toLowerCase() === 'date') ? formatDateValue(fieldValueRaw) : fieldValueRaw;
        const isOld = isDocumentOlderThanTask(linkedDocument.created_at, task.created_at);
        const hasIndicator = linkedDocument.indicator === true;
        if (hasIndicator) {
          return (
            <div className="flex">
              <Badge variant="destructive" className="font-normal">Indicator</Badge>
            </div>
          )
        }
        return (
          <div className="flex items-center gap-2">
            <span className={isOld ? "text-slate-500" : ""}>{fieldValue || "-"}</span>
          </div>
        );
      }
      default:
        return <div className="text-start text-slate-400">Missing</div>;
    }
  };

  // --- 5. Export Logic ---
  const handleExportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');
    const headerStyle = {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00529B' } }, // Blue
      font: { color: { argb: 'FFFFFFFF' }, bold: true },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    };

    if (view === 'standard') {
      const headers = columns.map(c => c.label);
      const headerRow = sheet.addRow(headers);
      headerRow.eachCell(cell => cell.style = headerStyle as any);
      tasks.forEach(task => {
        const rowData = columns.map(col => getPlainTextCellContent(task, col));
        sheet.addRow(rowData);
      });
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    } else {
      const headers = ['Details', ...tasks.map(t => t.applicant_name)];
      const headerRow = sheet.addRow(headers);
      headerRow.eachCell(cell => cell.style = headerStyle as any);
      transposedTableRows.forEach(row => {
        if (row.type === 'section_header') {
          const sectionRow = sheet.addRow([row.label]);
          // sheet.mergeCells(sectionRow.number, 1, sectionRow.number, headers.length);
          sectionRow.getCell(1).font = { bold: true };
        } else {
          const rowData = [row.label, ...tasks.map(task => getPlainTextCellContent(task, row))];
          sheet.addRow(rowData);
        }
      });
      sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `report_${report.name.replace(/\s+/g, '_')}.xlsx`;
    link.click();
  };

  const handleExportToPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(18);
    doc.text(`Report: ${report.name}`, 14, 16);

    let head: string[][] = [];
    let body: any[][] = [];

    if (view === 'standard') {
      head = [columns.map(c => c.label)];
      body = tasks.map(task => columns.map(col => getPlainTextCellContent(task, col)));
    } else {
      head = [['Details', ...tasks.map(t => t.applicant_name)]];
      transposedTableRows.forEach(row => {
        if (row.type !== 'section_header') {
          body.push([row.label, ...tasks.map(task => getPlainTextCellContent(task, row))]);
        }
      });
    }

    doc.autoTable({
      head: head,
      body: body,
      startY: 25,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    });

    doc.save(`report_${report.name.replace(/\s+/g, '_')}.pdf`);
  };

  // --- 6. Main Render ---
  if (loading) {
    return (
      <div className="flex-1 p-8 bg-slate-50/30 flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto" />
          <p className="text-slate-700">Loading report data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 bg-white min-h-screen">
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
        <div>
          <h3 className="font-bold text-xl text-blue-900">Viewing Report: {report?.name}</h3>
          <p className="text-sm text-blue-700 mt-1">{report?.description || 'Custom data view'}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="bg-white rounded-md border flex">
            <Button
              variant={view === 'standard' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('standard')}
              className="flex items-center gap-2"
            >
              <Rows className="h-4 w-4" /> Standard
            </Button>
            <div className="w-px bg-slate-200 my-1"></div>
            <Button
              variant={view === 'transposed' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('transposed')}
              className="flex items-center gap-2"
            >
              <LayoutGrid className="h-4 w-4" /> Transposed
            </Button>
          </div>

          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2 bg-white">
                <FileDown className="h-4 w-4" /> Export
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportToExcel}>Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportToPDF}>PDF (.pdf)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="destructive" size="sm" onClick={onExit} className="ml-2">
            <X className="mr-2 h-4 w-4" /> Exit Report
          </Button>
        </div>
      </div>

      {/* Control Bar for Transposed View */}
      {view === 'transposed' && (
        <div className="flex justify-end gap-2 mb-2">
          <Button variant="outline" size="xs" onClick={() => setExpandedSections(new Set([...Array.from(expandedSections), ...transposedTableRows.map(r => r.id)]))} className="text-xs">
            <ChevronsDown className="h-3 w-3 mr-1" /> Expand All
          </Button>
          <Button variant="outline" size="xs" onClick={() => setExpandedSections(new Set())} className="text-xs">
            <ChevronsRight className="h-3 w-3 mr-1" /> Collapse All
          </Button>
        </div>
      )}

      {/* Table Render */}
      <div className="border-2 border-slate-300 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <Table className="min-w-full border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-20 bg-slate-100/95 backdrop-blur-sm">
            {view === 'standard' ? (
              <>
                <TableRow>
                  <TableHead rowSpan={2} className="sticky left-0 z-30 bg-slate-200 border-b-2 border-slate-400 w-12 text-center">#</TableHead>
                  {columnGroups.map((group: any) => (
                    <TableHead
                      key={group.id}
                      colSpan={group.columns.length}
                      className="p-2 text-white font-semibold border-b-2 border-slate-400 bg-blue-600 text-center"
                    >
                      {group.label}
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow>
                  {columns.map((col: any) => (
                    <TableHead key={col.id} className="whitespace-nowrap p-2 text-slate-700 font-medium bg-slate-200 border-b-2 border-slate-400">
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </>
            ) : (
              <TableRow>
                <TableHead className="sticky left-0 z-30 bg-blue-700 min-w-[250px] p-2 text-white font-semibold border-r">
                  Report Details / Applicants
                </TableHead>
                {tasks.map(task => (
                  <TableHead key={task.id} className="whitespace-nowrap min-w-[200px] p-2 border-x border-blue-500 bg-blue-600 text-white">
                    {task.applicant_name}
                  </TableHead>
                ))}
              </TableRow>
            )}
          </TableHeader>
          <TableBody>
            {view === 'standard' ? (
              tasks.map((task, index) => (
                <TableRow key={task.id} className="hover:bg-slate-50">
                  <TableCell className="sticky left-0 z-10 bg-white border-r text-center text-slate-500 text-xs">{index + 1}</TableCell>
                  {columns.map((col: any) => (
                    <TableCell key={`${task.id}-${col.id}`} className="text-sm p-2 border">
                      {renderCell(task, col)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              transposedTableRows.map((row: any, index: number) => {
                if (row.type === 'section_header') {
                  const Icon = row.icon;
                  return (
                    <TableRow key={row.id} className="bg-slate-100 hover:bg-slate-200 cursor-pointer" onClick={() => {
                      const newSet = new Set(expandedSections);
                      newSet.has(row.id) ? newSet.delete(row.id) : newSet.add(row.id);
                      setExpandedSections(newSet);
                    }}>
                      <TableCell className="sticky left-0 z-10 bg-slate-100 border-r py-2 px-3" colSpan={tasks.length + 1}>
                        <div className="flex items-center gap-2">
                          {row.isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                          {Icon && <Icon className="h-4 w-4 text-slate-500" />}
                          <span className="font-semibold text-slate-700">{row.label}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }
                return (
                  <TableRow key={`${row.type}-${row.label}-${index}`} className="group border-b">
                    <TableCell className="sticky left-0 z-10 bg-white group-hover:bg-blue-50 border-r font-medium text-sm text-slate-600 p-2 pl-8">
                      {row.label}
                    </TableCell>
                    {tasks.map(task => (
                      <TableCell key={`${task.id}-${row.label}`} className="text-sm p-2 border-r group-hover:bg-blue-50/30">
                        {renderCell(task, row)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};