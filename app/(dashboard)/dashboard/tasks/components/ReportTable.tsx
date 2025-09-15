// @ts-nocheck
// overall-view/ReportTable.tsx

"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, LayoutGrid, Rows, Plus, Minus, Briefcase, FileDown, ChevronDown, ChevronsRight, ChevronsDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateValue } from "../utils/taskManagerData";
import { getCellContent as getStandardCellContent } from "../overall-view/tableUtils";
import jsPDF from 'jspdf';
import 'jspdf-autotable';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}
import ExcelJS from 'exceljs';

// Helper function to check if document is older than task creation
const isDocumentOlderThanTask = (documentDate, taskDate) => {
  if (!documentDate || !taskDate) return false;
  try {
    return new Date(documentDate) < new Date(taskDate);
  } catch (error) {
    return false;
  }
};

// **NEW**: Helper to get plain text/string value for exports, stripping JSX
const getPlainTextCellContent = (task, column, enhancedProps) => {
  const { stages, getDocumentForTaskStage } = enhancedProps;

  switch (column.type) {
    case 'task':
      // Simplified for export - returning direct values
      // This can be expanded based on the complexity of getStandardCellContent
      return task[column.field]?.toString() || task[column.field] || '-';
    case 'stage_date': {
      const stageData = task.stages?.[column.stageId];
      return stageData?.date ? formatDateValue(stageData.date) : '-';
    }
    case 'extracted_field': {
      const stage = stages.find(s => s.id === column.stageId);
      const stageDocInfo = stage?.documents?.find(d => d.kycId === column.kycId);
      if (!stage || !stageDocInfo) return 'N/A';
      const linkedDocument = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] });
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


// Main rendering function that returns JSX
const getCellContentForReport = (task, column, enhancedProps) => {
  const {
    enhancedTasksData, taskDependants, expandedDependants, companies, getTaskHierarchy,
    getStaffName, getEnhancedImmigrationStatus, getCurrentStageStatus, renderImmigrationStatusCell,
    renderCurrentStageStatusCell, toggleDependantsExpansion, setLinkingTask, setIsLinkDialogOpen,
    stages, getDocumentForTaskStage
  } = enhancedProps;

  switch (column.type) {
    case 'task':
      return getStandardCellContent(
        task, column.field, enhancedTasksData, taskDependants, expandedDependants, companies,
        getTaskHierarchy, getStaffName, getEnhancedImmigrationStatus, getCurrentStageStatus,
        () => renderImmigrationStatusCell(task), () => renderCurrentStageStatusCell(task),
        toggleDependantsExpansion, setLinkingTask, setIsLinkDialogOpen
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
      const stageDocInfo = stage?.documents?.find(d => d.kycId === column.kycId);
      if (!stage || !stageDocInfo) return <div className="text-start text-slate-400">Missing</div>;
      const linkedDocument = getDocumentForTaskStage(task, { ...stage, documents: [stageDocInfo] });
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

const StandardView = ({ tasks, columnGroups, enhancedProps }) => {
  const flatColumns = useMemo(() => columnGroups.flatMap(g => g.columns), [columnGroups]);

  return (
    <div className="border-2 border-slate-300 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 250px)' }}>
      <Table className="min-w-full border-separate border-spacing-0">
        <TableHeader className="sticky top-0 z-20 bg-slate-100/80 backdrop-blur-sm">
          <TableRow>
            <TableHead rowSpan={2} className="sticky left-0 z-30 bg-slate-200 border-b-2 border-slate-400 p-2 text-slate-800 font-semibold text-center align-middle w-16">#</TableHead>
            {columnGroups.map(group => (
              <TableHead
                key={group.id}
                colSpan={group.columns.length}
                className="whitespace-nowrap p-2 text-white font-semibold border-b-2 border-slate-400 bg-blue-600 text-center"
              >
                {group.label}
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            {flatColumns.map(col => (
              <TableHead key={col.id} className="whitespace-nowrap p-2 text-slate-700 font-medium bg-slate-200 border-b-2 border-slate-400">
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task, index) => (
            <TableRow key={task.id} className="hover:bg-slate-50/80 group">
              <TableCell className="sticky left-0 z-10 bg-white group-hover:bg-slate-50/80 text-sm p-2 border text-center font-medium text-slate-600">{index + 1}</TableCell>
              {flatColumns.map(col => (
                <TableCell key={`${task.id}-${col.id}`} className="text-sm p-2 border">
                  {getCellContentForReport(task, col, enhancedProps)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

const TransposedView = ({ tableRows, tasks, enhancedProps }) => {
  return (
    <div className="border-2 border-slate-300 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 250px)' }}>
      <Table className="min-w-full border-separate border-spacing-0">
        <TableHeader className="sticky top-0 z-20 bg-blue-600/95 backdrop-blur-sm">
          <TableRow>
            <TableHead className="sticky left-0 z-30 bg-blue-700 min-w-[250px] md:min-w-[350px] p-2 text-white font-semibold border-r">Details</TableHead>
            {tasks.map(task => (
              <TableHead key={task.id} className="whitespace-nowrap min-w-[200px] p-2 border-x border-blue-500 text-white ">
                {task.applicant_name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableRows.map((row, index) => {
            if (row.type === 'section_header') {
              const Icon = row.icon;
              return (
                <TableRow key={row.id} className="bg-slate-200 border-y-2 border-slate-300 hover:bg-slate-200">
                  <TableCell className="sticky left-0 z-10 bg-slate-200 py-1 px-2 border-r" colSpan={tasks.length + 1}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {Icon && <Icon className="h-5 w-5 text-slate-600" />}
                        <span className="font-semibold text-slate-700 text-base">{row.label}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => row.toggleExpansion(row.id)}>
                        {row.isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            }
            const rowBg = 'bg-white';
            const hoverBg = 'hover:bg-blue-50/50';
            return (
              <TableRow key={`${row.type}-${row.label}-${index}`} className={`${rowBg} ${hoverBg} group border-b`}>
                <TableCell className={`sticky left-0 z-10 ${rowBg} group-hover:bg-blue-50/50 border-r font-medium text-sm text-slate-600 p-2 text-start`}>
                  <div style={{ paddingLeft: row.isSubRow ? '24px' : '0px' }}>{row.label}</div>
                </TableCell>
                {tasks.map(task => (
                  <TableCell key={`${task.id}-${row.label}`} className="text-sm p-2 text-start border-x">
                    {getCellContentForReport(task, row, enhancedProps)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export const ReportTable = (props) => {
  const { tasks, report, loading, stages, kycDocuments, tableHeaders } = props;
  const [view, setView] = useState('standard');
  const [expandedSections, setExpandedSections] = useState(() => new Set(['task_details']));

  const allSectionIds = useMemo(() => {
    if (!report) return [];
    const ids = ['task_details'];
    Object.keys(report.configuration.stages).forEach(stageId => ids.push(stageId));
    return ids;
  }, [report]);

  const toggleSectionExpansion = (sectionId) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      newSet.has(sectionId) ? newSet.delete(sectionId) : newSet.add(sectionId);
      return newSet;
    });
  };
  
  const handleExpandAll = () => setExpandedSections(new Set(allSectionIds));
  const handleCollapseAll = () => setExpandedSections(new Set());

  const columns = useMemo(() => {
    if (!report) return [];
    const generatedColumns = [];
    report.configuration.taskFields.forEach(fieldId => {
      const header = tableHeaders.find(h => h.id === fieldId);
      if (header) generatedColumns.push({ id: `task_${fieldId}`, label: header.label, type: 'task', field: fieldId });
    });

    // Ensure stages are processed in their correct order
    const configuredStageIds = Object.keys(report.configuration.stages);
    const orderedStages = stages.filter(s => configuredStageIds.includes(s.id)); // Assumes `stages` is presorted

    orderedStages.forEach(stage => {
      const stageId = stage.id;
      const stageConfig = report.configuration.stages[stageId];
      if (!stageConfig) return;

      if (stageConfig.isStageDateSelected) {
        generatedColumns.push({ id: `stage_date_${stageId}`, label: `${stage.name} Date`, type: 'stage_date', stageId: stageId });
      }
      Object.entries(stageConfig.documents).forEach(([kycId, docConfig]) => {
        const kycDoc = kycDocuments.get(kycId);
        if (!kycDoc) return;
        docConfig.fields.forEach(fieldId => {
          const field = kycDoc.fields?.find(f => f.id === fieldId);
          if (field) {
            generatedColumns.push({ id: `field_${stageId}_${kycId}_${fieldId}`, label: `${kycDoc.display_name} - ${field.fieldName}`, type: 'extracted_field', stageId, kycId, fieldId, fieldName: field.fieldName, fieldType: field.fieldType });
          }
        });
      });
    });
    return generatedColumns;
  }, [report, stages, kycDocuments, tableHeaders]);

  const columnGroups = useMemo(() => {
    if (!report || !columns.length) return [];
    const taskGroup = { id: 'task_details', label: "Task Details", columns: [] };
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
  }, [columns, stages, report]);

  const transposedTableRows = useMemo(() => {
    if (!report) return [];
    const rows = [];
    const config = report.configuration;

    rows.push({ type: 'section_header', id: 'task_details', label: 'Task Details', icon: Briefcase, isExpanded: expandedSections.has('task_details'), toggleExpansion: toggleSectionExpansion });
    if (expandedSections.has('task_details')) {
      config.taskFields.forEach(fieldId => {
        const header = tableHeaders.find(h => h.id === fieldId);
        if (header) rows.push({ type: 'task', field: fieldId, label: header.label, isSubRow: true });
      });
    }

    const configuredStageIds = Object.keys(config.stages);
    const orderedStages = stages.filter(s => configuredStageIds.includes(s.id));

    orderedStages.forEach(stage => {
      const stageId = stage.id;
      const stageConfig = config.stages[stageId];
      if (!stage) return;
      rows.push({ type: 'section_header', id: stageId, label: stage.name, icon: stage.icon || Briefcase, isExpanded: expandedSections.has(stageId), toggleExpansion: toggleSectionExpansion });
      if (expandedSections.has(stageId)) {
        if (stageConfig.isStageDateSelected) rows.push({ type: 'stage_date', stageId, label: 'Completion Date', isSubRow: true });
        Object.entries(stageConfig.documents).forEach(([kycId, docConfig]) => {
          const kycDoc = kycDocuments.get(kycId);
          if (!kycDoc) return;
          docConfig.fields.forEach(fieldId => {
            const field = kycDoc.fields?.find(f => f.id === fieldId);
            if (field) rows.push({ type: 'extracted_field', stageId, kycId, fieldId, fieldName: field.fieldName, fieldType: field.fieldType, label: `${kycDoc.display_name} - ${field.fieldName}`, isSubRow: true });
          });
        });
      }
    });
    return rows;
  }, [report, expandedSections, stages, kycDocuments, tableHeaders, toggleSectionExpansion]);

  const handleExportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');
    const headerStyle = {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00529B' } }, // Blue
      font: { color: { argb: 'FFFFFFFF' }, bold: true },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    };
    const sectionHeaderStyle = {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } }, // Light Gray
      font: { bold: true },
    };

    if (view === 'standard') {
      const headers = columns.map(c => c.label);
      const headerRow = sheet.addRow(headers);
      headerRow.eachCell(cell => cell.style = headerStyle);
      tasks.forEach(task => {
        const rowData = columns.map(col => getPlainTextCellContent(task, col, props));
        sheet.addRow(rowData);
      });
      sheet.views = [{ state: 'frozen', ySplit: 1 }]; // Freeze header row
    } else { // Transposed View
      const headers = ['Details', ...tasks.map(t => t.applicant_name)];
      const headerRow = sheet.addRow(headers);
      headerRow.eachCell(cell => cell.style = headerStyle);
      transposedTableRows.forEach(row => {
        if (row.type === 'section_header') {
          const sectionRow = sheet.addRow([row.label]);
          sheet.mergeCells(sectionRow.number, 1, sectionRow.number, headers.length);
          sectionRow.getCell(1).style = sectionHeaderStyle;
        } else {
          const rowData = [row.label, ...tasks.map(task => getPlainTextCellContent(task, row, props))];
          sheet.addRow(rowData);
        }
      });
      sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]; // Freeze header row and first column
    }

    sheet.columns.forEach(column => {
      let maxLen = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLen) maxLen = columnLength;
      });
      column.width = maxLen < 15 ? 15 : maxLen + 2;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'report.xlsx';
    link.click();
  };

  const handleExportToPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    
    // Add title
    doc.setFontSize(18);
    doc.text(`Report: ${report.name}`, 14, 16);
    
    // Set up table data
    let head: string[][] = [];
    let body: any[][] = [];

    if (view === 'standard') {
      head = [columns.map(c => c.label)];
      body = tasks.map(task => columns.map(col => getPlainTextCellContent(task, col, props)));
    } else { // Transposed View
      head = [['Details', ...tasks.map(t => t.applicant_name)]];
      transposedTableRows.forEach(row => {
        if (row.type !== 'section_header') {
          body.push([row.label, ...tasks.map(task => getPlainTextCellContent(task, row, props))]);
        }
      });
    }

    // Generate the table with proper styling
    (doc as any).autoTable({
      head: head,
      body: body,
      startY: 25,
      theme: 'grid',
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8
      },
      styles: { 
        fontSize: 8, 
        cellPadding: 2,
        overflow: 'linebreak',
        valign: 'middle'
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      margin: { top: 20 },
      columnStyles: { 
        0: { 
          cellWidth: view === 'transposed' ? 50 : 'auto',
          fontStyle: 'bold'
        } 
      }
    });

    // Save the PDF
    doc.save(`${report.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-slate-500" /></div>;
  if (!tasks.length) return <div className="text-center py-10 text-slate-500">No tasks to display for this report.</div>;
  if (!report || (columns.length === 0 && transposedTableRows.length === 0)) return <div className="text-center py-10 text-slate-500">Report configuration is invalid or has no columns selected.</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <FileDown className="h-4 w-4" />
                  <span>Export</span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={handleExportToExcel}><FileDown className="h-4 w-4 mr-2" />Export as Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportToPDF}><FileDown className="h-4 w-4 mr-2" />Export as PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {view === 'transposed' && (
              <>
                <Button variant="outline" size="sm" onClick={handleExpandAll} className="flex items-center gap-2">
                  <ChevronsDown className="h-4 w-4" /> Expand All
                </Button>
                <Button variant="outline" size="sm" onClick={handleCollapseAll} className="flex items-center gap-2">
                  <ChevronsRight className="h-4 w-4" /> Collapse All
                </Button>
              </>
            )}
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setView(view === 'standard' ? 'transposed' : 'standard')}
          className="flex items-center gap-2"
        >
          {view === 'standard' ? <><LayoutGrid className="h-4 w-4" /><span>Transposed View</span></> : <><Rows className="h-4 w-4" /><span>Standard View</span></>}
        </Button>
      </div>

      {view === 'standard' ? (
        <StandardView tasks={tasks} columnGroups={columnGroups} enhancedProps={props} />
      ) : (
        <TransposedView tableRows={transposedTableRows} tasks={tasks} enhancedProps={props} />
      )}
    </div>
  );
};