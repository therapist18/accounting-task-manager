// @ts-nocheck
"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Plus, Minus, Briefcase, AlertTriangle, Loader2, 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, 
  Building, Layers, Shield, User as UserIcon, Users, SearchX 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getOfficerDisplayName } from "@/lib/shared-user-assignment-service";

const DATA_COLUMN_WIDTH = "w-[200px] min-w-[200px]";
const INDEX_WIDTH = "w-14 min-w-[56px] max-w-[56px]";
const LABEL_WIDTH = "w-[320px] min-w-[320px] max-w-[320px]";

// --- Component: User Profile Card (Popover) ---
function UserDetailsPopover({ userId, users, officers = [], role, children, departments = [] }: any) {
  const officer = role === 'officer' ? officers.find((o: any) => o.id === userId) : null;
  const user = role === 'officer'
    ? (officer ? { name: getOfficerDisplayName(officer), email: officer.email } : null)
    : users.find((u: any) => u.id === userId);

  if (!user) return <span className="text-slate-400">{children}</span>;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="cursor-pointer transition-all hover:translate-y-[-1px] active:translate-y-0">{children}</div>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 shadow-2xl border-slate-200 rounded-2xl overflow-hidden" align="start">
        <div className="bg-custom-blue px-4 py-6 text-white">
          <div className="flex items-center gap-3">
             <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-lg">
                {user.name?.slice(0, 2).toUpperCase()}
             </div>
             <div className="flex-1 min-w-0">
                <p className="font-bold text-[15px] leading-tight truncate">{user.name}</p>
                <p className="text-[11px] text-white/70 truncate uppercase tracking-widest mt-1">{role}</p>
             </div>
          </div>
        </div>
        <div className="p-4 bg-white">
           <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Contact</p>
           <p className="text-xs text-slate-600 mb-4">{user.email}</p>
           {role === 'officer' && officer && (
             <div className="pt-3 border-t border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Assignments</p>
                <div className="flex flex-wrap gap-1.5">
                   {officer.roleAssignments?.slice(0, 3).map((a: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-[9px] bg-slate-50 text-slate-600 border-slate-200">
                        {a.department_id ? 'Dept' : 'Unit'}
                      </Badge>
                   ))}
                </div>
             </div>
           )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// --- Helper: SaaS Rendering ---
const safeRender = (content: any) => {
  if (React.isValidElement(content)) return content;
  if (typeof content === 'string') {
    if (content === 'Undedicated' || content === 'N/A') return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[11px] font-bold ring-1 ring-inset ring-rose-200">Missing</span>;
    if (content === 'Completed') return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[11px] font-bold ring-1 ring-inset ring-emerald-200">Done</span>;
    if (content === 'Pending' || content === 'WIP') return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[11px] font-bold ring-1 ring-inset ring-amber-200">In Progress</span>;
    return <span className="text-slate-700 font-medium">{content}</span>;
  }
  return content;
};

export function TransposedReportView({
  paginatedTasks, transposedRows, expandedSections, renderCellValue, toggleSection,
  loading = false, error = null, initialColumnsPerPage = 10, userData = { officers: [], users: [] }
}: any) {
  const [columnsPage, setColumnsPage] = useState(1);
  const [columnsPerPage, setColumnsPerPage] = useState(initialColumnsPerPage);

  const totalColumns = paginatedTasks.length;
  const totalPages = Math.ceil(totalColumns / columnsPerPage);
  const paginatedColumns = paginatedTasks.slice((columnsPage - 1) * columnsPerPage, columnsPage * columnsPerPage);

  const bodyRows = transposedRows.filter(row => row.id !== 'task_details' && row.type !== 'task');
  const taskDetailsRows = transposedRows.filter(row => row.type === 'task');

  return (
    <div className="space-y-6">
      {/* SaaS Pagination Header */}
      <div className="flex items-center justify-between px-8 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm mx-8">
        <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Column Browser</span>
            <p className="text-sm font-bold text-slate-900">
                Displaying <span className="text-blue-600">{paginatedColumns.length}</span> of {totalColumns} tasks
            </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
             <span className="text-[11px] font-bold text-slate-400 uppercase">Cols per page:</span>
             <Select value={String(columnsPerPage)} onValueChange={(v) => setColumnsPerPage(Number(v))}>
                <SelectTrigger className="h-9 w-20 rounded-xl font-bold border-slate-200 shadow-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                    {[5, 10, 20].map(v => <SelectItem key={v} value={String(v)}>{v}</SelectItem>)}
                </SelectContent>
             </Select>
          </div>
          <div className="h-8 w-px bg-slate-200 mx-2" />
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
             <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setColumnsPage(1)} disabled={columnsPage === 1}><ChevronsLeft size={16}/></Button>
             <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setColumnsPage(p => p - 1)} disabled={columnsPage === 1}><ChevronLeft size={16}/></Button>
             <span className="px-4 text-[13px] font-bold text-slate-900">{columnsPage} / {totalPages || 1}</span>
             <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setColumnsPage(p => p + 1)} disabled={columnsPage >= totalPages}><ChevronRight size={16}/></Button>
             <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setColumnsPage(totalPages)} disabled={columnsPage >= totalPages}><ChevronsRight size={16}/></Button>
          </div>
        </div>
      </div>

      {/* Main Transposed Table */}
      <div className="mx-8 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm ring-1 ring-slate-200/50">
        <div className="overflow-auto max-h-[calc(100vh-240px)] custom-scrollbar">
          <Table className="border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-30">
              {/* Context Row */}
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn("sticky left-0 z-40 bg-blue-100/80 border-r border-b border-blue-200", INDEX_WIDTH)} />
                <TableHead className={cn("sticky left-[56px] z-40 bg-blue-100/80 border-r border-b border-blue-200 px-6 py-4", LABEL_WIDTH)}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-blue-700 uppercase tracking-widest">Field Attribute</span>
                    <Button 
                      variant="outline" size="sm" 
                      onClick={() => toggleSection('task_details')}
                      className="h-7 px-2 rounded-lg border-slate-200 bg-white text-[10px] font-bold gap-1.5"
                    >
                      {expandedSections.has('task_details') ? <Minus size={10}/> : <Plus size={10}/>} Details
                    </Button>
                  </div>
                </TableHead>
                {paginatedColumns.map(task => (
                  <TableHead key={task.id} className={cn("bg-blue-100/80 border-b border-blue-200 py-4 px-4 text-center", DATA_COLUMN_WIDTH)}>
                     <div className="flex flex-col items-center gap-1">
                        <span className="text-[13px] font-black text-slate-900 truncate w-full">{task.applicant_name || 'Unnamed'}</span>
                        <Badge className="bg-custom-blue text-white text-[10px] font-bold border-transparent px-2">ID: {task.id}</Badge>
                     </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {/* Task Details Sub-rows */}
              {expandedSections.has('task_details') && taskDetailsRows.map((row, idx) => (
                <TableRow key={row.id} className="hover:bg-blue-50/20 transition-colors">
                  <TableCell className={cn("sticky left-0 z-20 bg-white border-r border-b border-slate-100 text-center text-[11px] font-bold text-slate-400", INDEX_WIDTH)}>{idx + 1}</TableCell>
                  <TableCell className={cn("sticky left-[56px] z-20 bg-white border-r border-b border-slate-100 px-6 py-3 text-[13px] font-semibold text-slate-600", LABEL_WIDTH)}>{row.label}</TableCell>
                  {paginatedColumns.map(task => (
                    <TableCell key={task.id} className={cn("border-b border-slate-100 text-center px-4 py-3", DATA_COLUMN_WIDTH)}>
                      {safeRender(renderCellValue(task, row))}
                    </TableCell>
                  ))}
                </TableRow>
              ))}

              {/* Dynamic Body Rows (Stages, Stats, etc.) */}
              {bodyRows.map((row, rIdx) => {
                if (row.type === 'section_header') {
                  return (
                    <TableRow key={row.id} className="bg-blue-50/80 hover:bg-blue-50 border-y border-blue-200">
                      <TableCell colSpan={paginatedColumns.length + 2} className="p-0">
                        <div className="flex items-center justify-between px-6 py-3 sticky left-0 w-max min-w-full border-l-4 border-l-blue-500">
                           <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-custom-blue text-white flex items-center justify-center">
                                 {row.icon ? <row.icon size={16}/> : <Layers size={16}/>}
                              </div>
                              <span className="text-[13px] font-bold text-slate-900 tracking-tight">{row.label}</span>
                              {row.filterApplicable === false && <Badge variant="secondary" className="text-[9px] uppercase font-black bg-amber-100 text-amber-700 ml-2">N/A</Badge>}
                           </div>
                           <Button variant="ghost" size="icon" onClick={() => toggleSection(row.id)} className="h-8 w-8 text-slate-400 hover:text-blue-600">
                              {expandedSections.has(row.id) ? <Minus size={14}/> : <Plus size={14}/>}
                           </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                if (!expandedSections.has(row.sectionId)) return null;

                return (
                  <TableRow key={row.id} className="hover:bg-blue-50/20 group">
                    <TableCell className={cn("sticky left-0 z-20 bg-white border-r border-b border-slate-100 text-center text-[11px] font-bold text-slate-400", INDEX_WIDTH)}>{row.stageOrder || rIdx}</TableCell>
                    <TableCell className={cn("sticky left-[56px] z-20 bg-white border-r border-b border-slate-100 px-6 py-3", LABEL_WIDTH)}>
                      <div className="flex flex-col gap-0.5">
                        <span className={cn("text-[13px] font-semibold transition-colors", row.type === 'stage' ? "text-slate-900" : "text-slate-600")}>
                          {row.label}
                        </span>
                        {row.isSubRow && <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Sub-Attribute</span>}
                      </div>
                    </TableCell>
                    {paginatedColumns.map(task => (
                      <TableCell key={task.id} className={cn("border-b border-slate-100 text-center px-4 py-3", DATA_COLUMN_WIDTH)}>
                        <div className="text-[13px] leading-relaxed">
                          {safeRender(renderCellValue(task, row))}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          
          {paginatedColumns.length === 0 && !loading && (
             <div className="flex flex-col items-center justify-center py-24 text-slate-400 bg-slate-50/50">
                <SearchX size={48} strokeWidth={1} className="mb-4 opacity-20"/>
                <p className="text-base font-bold text-slate-900">No data for this view</p>
                <p className="text-sm">Try moving to a different page of results</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}