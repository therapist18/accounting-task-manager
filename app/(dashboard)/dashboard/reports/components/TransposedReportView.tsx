"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Table, TableBody, TableCell, TableRow, TableHeader } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Minus, Briefcase, FileText, AlertTriangle, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Building, Layers, Shield, User as UserIcon, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { userService, getOfficerDisplayName } from "@/lib/shared-user-assignment-service";

const DATA_COLUMN_WIDTH = "w-[150px]";
const INDEX_WIDTH = "w-14 min-w-14 max-w-14";
const LABEL_WIDTH = "w-[280px] min-w-[280px] max-w-[280px]";

// Helper function to group role assignments by hierarchy
const groupAssignmentsByHierarchy = (roleAssignments: any[]) => {
  return {
    departments: roleAssignments.filter((a: any) => a.department_id && !a.subdepartment_id),
    subDepartments: roleAssignments.filter((a: any) => a.subdepartment_id && !a.class_id),
    classes: roleAssignments.filter((a: any) => a.class_id)
  };
};

// --- Role Assignments Display Component for Popover ---
function RoleAssignmentsDisplay({ officer, departments }: { officer: any; departments: any[] }) {
  if (!officer.roleAssignments || officer.roleAssignments.length === 0) {
    return <div className="text-xs text-slate-500 italic">No specific assignments</div>;
  }

  const grouped = groupAssignmentsByHierarchy(officer.roleAssignments);
  const hasAssignments = Object.values(grouped).some((list: any) => list && list.length > 0);

  if (!hasAssignments) {
    return <div className="text-xs text-slate-500 italic">No specific assignments</div>;
  }

  const formatJobLevel = (assignment: any, departments: any[]) => {
    if (!assignment) return '';
    const dept = departments.find((d: any) => d.id === assignment.department_id);
    const subdept = dept?.tm_subdepartments?.find((s: any) => s.id === assignment.subdepartment_id);
    const cls = subdept?.classes?.find((c: any) => c.id === assignment.class_id);

    if (cls) return `${dept?.name || ''} > ${subdept?.name || ''} > ${cls.name}`;
    if (subdept) return `${dept?.name || ''} > ${subdept.name}`;
    if (dept) return dept.name;
    return '';
  };

  return (
    <div className="space-y-1">
      {grouped.departments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {grouped.departments.map((assignment: any, idx: number) => (
            <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
              <Building className="h-2.5 w-2.5 mr-1" />{formatJobLevel(assignment, departments)}
            </Badge>
          ))}
        </div>
      )}
      {grouped.subDepartments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {grouped.subDepartments.map((assignment: any, idx: number) => (
            <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0 bg-indigo-50 text-indigo-700 border-indigo-200">
              <Layers className="h-2.5 w-2.5 mr-1" />{formatJobLevel(assignment, departments)}
            </Badge>
          ))}
        </div>
      )}
      {grouped.classes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {grouped.classes.map((assignment: any, idx: number) => (
            <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0 bg-violet-50 text-violet-700 border-violet-200">
              <Layers className="h-2.5 w-2.5 mr-1" />{formatJobLevel(assignment, departments)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// User Details Popover 
function UserDetailsPopover({ userId, users, officers = [], role, children, departments = [] }: {
  userId: string,
  users: any[],
  officers?: any[],
  departments?: any[],
  role: 'manager' | 'assistant' | 'officer',
  children: React.ReactNode
}) {
  const officer = role === 'officer' ? officers.find((o: any) => o.id === userId) : null;
  const user = role === 'officer'
    ? (officer ? { name: getOfficerDisplayName(officer), email: officer.email } : null)
    : users.find((u: any) => u.id === userId);

  if (!user) return <span className="text-slate-400">{children}</span>;

  const roleIcons = {
    manager: <UserIcon className="h-5 w-5" />,
    assistant: <Users className="h-5 w-5" />,
    officer: <Shield className="h-5 w-5" />
  };

  const roleColors = {
    manager: 'bg-emerald-100 text-emerald-700',
    assistant: 'bg-purple-100 text-purple-700',
    officer: 'bg-blue-100 text-blue-700'
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="cursor-pointer hover:opacity-80 transition-opacity inline-block w-full">{children}</div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 shadow-xl border-slate-200" align="start">
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${roleColors[role]}`}>
              {roleIcons[role]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 text-sm truncate">{user.name || 'No name'}</p>
              <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
              <Badge variant="outline" className="mt-1 capitalize text-[9px] font-semibold px-1.5">{role}</Badge>
            </div>
          </div>
          {role === 'officer' && officer && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Role Assignments</p>
              <RoleAssignmentsDisplay officer={officer} departments={departments} />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Enhanced Role Assignment Display Component
function RoleAssignmentDisplay({ userIds, users, officers, departments, role, emptyLabel = 'None assigned' }: any) {
  if (!userIds || userIds.length === 0) {
    return <span className="text-sm text-slate-400 italic">{emptyLabel}</span>;
  }

  const getRoleInfo = (r: string) => {
    switch (r) {
      case 'officer': return { color: 'blue', icon: Shield, label: 'Officer' };
      case 'manager': return { color: 'emerald', icon: UserIcon, label: 'Manager' };
      case 'assistant': return { color: 'purple', icon: Users, label: 'Assistant' };
      default: return { color: 'slate', icon: UserIcon, label: role };
    }
  };

  const getName = (id: string) => {
    if (role === 'officer') {
      const off = officers.find((o: any) => o.id === id);
      return off ? getOfficerDisplayName(off) : 'Unknown';
    }
    const u = users.find((u: any) => u.id === id);
    return u ? (u.displayName || u.name) : 'Unknown';
  };

  const roleInfo = getRoleInfo(role);
  const Icon = roleInfo.icon;

  // If only 1-2 people, show them directly
  if (userIds.length <= 2) {
    return (
      <div className="space-y-1">
        {userIds.map((id: string) => (
          <UserDetailsPopover key={id} userId={id} users={users} officers={officers} departments={departments} role={role}>
            <div className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
              <Icon className={`h-4 w-4 text-${roleInfo.color}-600`} />
              <span className="text-sm font-medium text-slate-700">{getName(id)}</span>
            </div>
          </UserDetailsPopover>
        ))}
      </div>
    );
  }

  // If 3+ people, show summary with popover
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className={`flex items-center gap-2 p-2 rounded-lg bg-${roleInfo.color}-50 hover:bg-${roleInfo.color}-100 transition-colors cursor-pointer border border-${roleInfo.color}-200`}>
          <Icon className={`h-4 w-4 text-${roleInfo.color}-600`} />
          <span className={`text-sm font-semibold text-${roleInfo.color}-700`}>{userIds.length} {roleInfo.label}s</span>
          <span className={`text-xs text-${roleInfo.color}-600`}>({userIds.slice(0, 2).map(getName).join(', ')})</span>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 shadow-xl border-slate-200" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
            <Icon className={`h-5 w-5 text-${roleInfo.color}-600`} />
            <h4 className="font-semibold text-slate-900">{userIds.length} Assigned {roleInfo.label}s</h4>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {userIds.map((id: string) => (
              <UserDetailsPopover key={id} userId={id} users={users} officers={officers} departments={departments} role={role}>
                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-${roleInfo.color}-100`}>
                    <Icon className={`h-4 w-4 text-${roleInfo.color}-700`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{getName(id)}</p>
                    <p className="text-xs text-slate-500">{roleInfo.label}</p>
                  </div>
                </div>
              </UserDetailsPopover>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// --- Safe Rendering Function (Matching EnhancedTable) ---
const safeRender = (content: any) => {
  if (React.isValidElement(content)) return content;
  if (typeof content === 'string') {
    // Handle special styling for 'Undedicated' status
    if (content === 'Undedicated') {
      return <span className="text-red-600 font-medium">{content}</span>;
    }
    // Replace "N/A" with "Missing" in red text
    if (content === 'N/A') return <span className="text-red-500">Missing</span>;
    return content;
  }
  if (typeof content === 'number') return content;
  if (content === null || content === undefined) return null;
  if (Array.isArray(content)) {
    return content.map((c, i) => <React.Fragment key={i}>{safeRender(c)}</React.Fragment>);
  }
  if (typeof content === 'object') {
    if ('status' in content) {
      const status = content.status;
      if (typeof status === 'string' || typeof status === 'number') {
        if (status === 'Undedicated') {
          return <span className="text-red-600 font-medium">{status}</span>;
        }
        if (status === 'N/A') return <span className="text-red-500">Missing</span>;
        return status;
      }
      if (React.isValidElement(status)) return status;
      if (!status) return null;
      return JSON.stringify(status);
    }
    return <span className="text-xs text-gray-500 truncate max-w-[100px] inline-block" title={JSON.stringify(content)}>{JSON.stringify(content)}</span>;
  }
  return String(content);
};

interface TransposedReportViewProps {
  paginatedTasks: any[];
  transposedRows: any[];
  currentPage: number;
  itemsPerPage: number;
  expandedSections: Set<string>;
  renderCellValue: (task: any, col: any) => any;
  toggleSection: (section: string) => void;
  loading?: boolean;
  error?: any;
  initialColumnsPerPage?: number;
  userData?: {
    officers: any[];
    managers: any[];
    assistants: any[];
    allUsers: any[];
  };
  departments?: any[];
}

export function TransposedReportView({
  paginatedTasks,
  transposedRows,
  currentPage,
  itemsPerPage,
  expandedSections,
  renderCellValue,
  toggleSection,
  loading = false,
  error = null,
  initialColumnsPerPage = 10,
  userData = { officers: [], managers: [], assistants: [], allUsers: [] },
  departments = []
}: TransposedReportViewProps) {

  // Column pagination state
  const [columnsPage, setColumnsPage] = useState(1);
  const [columnsPerPage, setColumnsPerPage] = useState(initialColumnsPerPage);

  // Reset columns page when paginatedTasks changes
  React.useEffect(() => {
    setColumnsPage(1);
  }, [paginatedTasks]);

  // Calculate pagination
  const totalColumns = paginatedTasks.length;
  const totalColumnsPages = Math.max(1, Math.ceil(totalColumns / columnsPerPage));

  const paginatedColumns = useMemo(() => {
    const startIndex = (columnsPage - 1) * columnsPerPage;
    return paginatedTasks.slice(startIndex, startIndex + columnsPerPage);
  }, [paginatedTasks, columnsPage, columnsPerPage]);

  // Pagination callbacks
  const handleNextColumnsPage = useCallback(() => setColumnsPage(prev => Math.min(prev + 1, totalColumnsPages)), [totalColumnsPages]);
  const handlePreviousColumnsPage = useCallback(() => setColumnsPage(prev => Math.max(prev - 1, 1)), []);
  const handleFirstColumnsPage = useCallback(() => setColumnsPage(1), []);
  const handleLastColumnsPage = useCallback(() => setColumnsPage(totalColumnsPages), [totalColumnsPages]);
  const handleColumnsPerPageChange = useCallback((value: string) => {
    setColumnsPerPage(parseInt(value, 10));
    setColumnsPage(1);
  }, []);

  // Separate Task Details (to be placed in Header) from Body Rows
  const isHeaderRow = (row: any) => row.id === 'task_details' || row.type === 'task';
  const headerRows = transposedRows.filter(isHeaderRow);
  const bodyRows = transposedRows.filter(row => !isHeaderRow(row));

  let dataRowCounter = 1;

  // Helper to detect role columns and render appropriately
  const isRoleColumn = (col: any) => {
    const colId = col.id?.toLowerCase() || col.field?.toLowerCase() || '';
    // Officer handling removed - now uses stages JSON
    return colId.includes('manager') || colId.includes('assistant');
  };

  const getRoleFromColumn = (col: any) => {
    const colId = col.id?.toLowerCase() || col.field?.toLowerCase() || '';
    // Officer handling removed - now uses stages JSON
    if (colId.includes('manager')) return 'task_manager';
    if (colId.includes('assistant')) return 'task_assistant';
    return null;
  };

  // Enhanced render function that handles role columns
  const enhancedRenderCellValue = (task: any, col: any) => {
    return safeRender(renderCellValue(task, col));
  };

  return (
    <div className="space-y-4">
      {/* Column Pagination Controls */}
      {totalColumns > 0 && (
        <div className="flex items-center justify-between p-4 bg-white border rounded-xl shadow-sm">
          <div className="text-sm text-slate-500">
            Showing{' '}
            <span className="font-bold text-slate-800">{((columnsPage - 1) * columnsPerPage) + 1}</span> to{' '}
            <span className="font-bold text-slate-800">{Math.min(columnsPage * columnsPerPage, totalColumns)}</span> of{' '}
            <span className="font-bold text-slate-800">{totalColumns}</span> columns
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Columns:</span>
              <Select
                value={String(columnsPerPage)}
                onValueChange={handleColumnsPerPageChange}
              >
                <SelectTrigger className="w-20 h-8">
                  <SelectValue placeholder={columnsPerPage} />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 15, 20, 50].map(size => (
                    <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleFirstColumnsPage}
                disabled={columnsPage === 1}
                aria-label="Go to first page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handlePreviousColumnsPage}
                disabled={columnsPage === 1}
                aria-label="Go to previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-4 text-sm font-bold">Page {totalColumnsPages > 0 ? columnsPage : 0} / {Math.max(1, totalColumnsPages)}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleNextColumnsPage}
                disabled={columnsPage >= totalColumnsPages}
                aria-label="Go to next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleLastColumnsPage}
                disabled={columnsPage >= totalColumnsPages}
                aria-label="Go to last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="border-2 border-slate-300 rounded-b-lg rounded-tl-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 240px)' }}>
        <Table className="min-w-full border-separate border-spacing-0">

          <TableHeader className="sticky top-0 z-30 bg-slate-100/80 backdrop-blur-sm">

            {/* Section Header for Task Details (Collapsible UI) */}
            {headerRows.find(r => r.id === 'task_details') && (
              <TableRow className="bg-slate-200 border-y-2 border-slate-400 hover:bg-slate-200">
                <TableCell colSpan={paginatedTasks.length + 2} className="p-0">
                  <div className="flex items-center justify-between px-3 py-2 sticky left-0 w-max min-w-full">
                    <div className="flex items-center gap-3">
                      <Briefcase className="h-5 w-5 text-slate-600" />
                      <span className="font-bold text-slate-700 text-lg">Task Details</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-slate-300" onClick={() => toggleSection('task_details')}>
                      {expandedSections.has('task_details') ? <Minus className="h-4 w-4 text-slate-600" /> : <Plus className="h-4 w-4 text-slate-600" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* Render Task Detail Fields as normal table headers */}
            {expandedSections.has('task_details') && headerRows.filter(r => r.type === 'task').map((row, idx) => (
              <TableRow key={row.id} className="bg-blue-600 text-white group border-b border-slate-200">

                <TableCell className={`sticky left-0 z-40 bg-blue-600 text-white group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 text-center ${INDEX_WIDTH}`}>
                  {idx + 1}
                </TableCell>

                <TableCell className={`sticky left-14 z-40 bg-blue-600 text-white group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 ${LABEL_WIDTH}`}>
                  <span className="break-words leading-tight">{row.label}</span>
                </TableCell>

                {paginatedColumns.map((task) => (
                  <TableCell key={`${row.id}-${task.id}`} className={`text-center text-sm py-1 px-2 align-middle bg-blue-500 text-white border border-gray-100 ${DATA_COLUMN_WIDTH} ${task.type === 'dependant' ? 'bg-orange-500' : ''}`}>
                    {safeRender(enhancedRenderCellValue(task, row))}
                  </TableCell>
                ))}

              </TableRow>
            ))}

            {/* Fallback Identifiers (Visible only if Task Details is completely collapsed) */}
            {!expandedSections.has('task_details') && (
              <TableRow className="bg-blue-600 text-white group border-b border-slate-200">
                <TableCell className={`sticky left-0 z-40 bg-blue-600 text-white border border-gray-100 font-medium text-sm p-2 text-center ${INDEX_WIDTH}`}>
                  #
                </TableCell>
                <TableCell className={`sticky left-14 z-40 bg-blue-600 text-white border border-gray-100 font-medium text-sm p-2 ${LABEL_WIDTH}`}>
                  Task Identifiers
                </TableCell>
                {paginatedColumns.map((task, idx) => (
                  <TableCell key={`fallback-${task.id}`} className={`text-center text-sm py-1 px-2 align-middle bg-blue-500 text-white border border-gray-100 ${DATA_COLUMN_WIDTH} ${task.type === 'dependant' ? 'bg-orange-500' : ''}`}>
                    <div className="flex flex-col items-center justify-center gap-1 p-1">
                      <span className="font-semibold text-center" title={task.applicant_name}>
                        {task.applicant_name || <span className="text-red-300">Missing</span>}
                      </span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${task.type === 'dependant' ? 'bg-orange-600/50 border-orange-400 text-white' : 'bg-blue-600/50 border-blue-400 text-white'}`}>
                        ID: {task.id}
                      </Badge>
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            )}
          </TableHeader>

          <TableBody className="divide-y divide-slate-200">
            {loading ? (
              <TableRow>
                <TableCell colSpan={paginatedColumns.length + 2} className="h-32 text-center">
                  <div className="flex justify-center items-center gap-2 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />Loading...</div>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={paginatedColumns.length + 2} className="h-32 text-center text-red-600">
                  <div className="flex justify-center items-center gap-2"><AlertTriangle className="h-5 w-5" />{error}</div>
                </TableCell>
              </TableRow>
            ) : paginatedTasks.length > 0 ? bodyRows.map((row, rIdx) => {

              // --- SECTION HEADER ROWS (Time Tracking, Stages, etc.) ---
              if (row.type === 'section_header') {
                const Icon = row.icon || Briefcase;
                const isFilterNA = row.filterApplicable === false;
                const isDocReq = row.id === 'reference_requirements';
                const isStage = row.id !== 'task_info' && row.id !== 'reference_requirements' && row.id !== 'time_tracking';

                return (
                  <TableRow key={row.id} className={cn(
                    "border-y-2 border-slate-400 hover:bg-slate-200",
                    isDocReq && isFilterNA ? 'bg-amber-50/80' : '',
                    isDocReq && !isFilterNA ? 'bg-emerald-100' : '',
                    isStage && isFilterNA ? 'bg-amber-50/80' : '',
                    isStage && !isFilterNA ? 'bg-purple-100' : '',
                    !isDocReq && !isStage && isFilterNA ? 'bg-amber-50/80' : '',
                    !isDocReq && !isStage && !isFilterNA ? 'bg-slate-200' : ''
                  )}>
                    <TableCell colSpan={paginatedColumns.length + 2} className="p-0">
                      <div className={cn(
                        "flex items-center justify-between px-3 py-2 sticky left-0 w-max min-w-full border-l-4",
                        isDocReq && isFilterNA ? 'border-l-amber-400' : '',
                        isDocReq && !isFilterNA ? 'border-l-emerald-500' : '',
                        isStage && isFilterNA ? 'border-l-purple-400' : '',
                        isStage && !isFilterNA ? 'border-l-purple-500' : ''
                      )}>
                        <div className="flex items-center gap-3">
                          <Icon className={cn("h-5 w-5", isFilterNA ? "text-amber-600" : "text-slate-600")} />
                          <span className={cn("font-bold text-lg", isDocReq ? 'text-emerald-900' : isStage ? 'text-purple-900' : 'text-slate-700')}>{row.label}</span>
                          {isFilterNA && (
                            <Badge variant="secondary" className="bg-amber-500 text-white hover:bg-amber-600 text-xs py-0 h-5">
                              FILTER N/A
                            </Badge>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-slate-300" onClick={() => toggleSection(row.id)}>
                          {expandedSections.has(row.id) ? <Minus className="h-4 w-4 text-slate-600" /> : <Plus className="h-4 w-4 text-slate-600" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }

              // --- STANDARD DATA ROWS ---
              const rowBg = row.isSubSubRow ? 'bg-slate-100/50' : row.isSubRow ? 'bg-slate-50/60' : 'bg-white';
              const hoverBg = 'hover:bg-blue-50/50';
              const baseBgClass = rowBg.split('/')[0]; // Isolate base class for sticky cells
              const isDocReq = row.type === 'reference_requirement';
              const isStage = row.stageId && row.type !== 'task' && row.type !== 'current_stage_age' && row.type !== 'total_process_age';

              const currentIndex = dataRowCounter++;

              return (
                <TableRow key={rIdx} className={`${rowBg} ${hoverBg} group border-b border-slate-200`}>

                  <TableCell className={`sticky left-0 z-20 ${baseBgClass} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 text-center ${INDEX_WIDTH}`}>
                    {row.stageOrder || currentIndex}
                  </TableCell>

                  <TableCell className={`sticky left-14 z-20 ${baseBgClass} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 ${LABEL_WIDTH}`}>
                    <div style={{ paddingLeft: row.isSubSubRow ? '32px' : row.isSubRow ? '16px' : '0px' }} className="flex items-center gap-2">
                      <span className={cn(row.type === 'stage' ? 'font-semibold' : '', 'break-words leading-tight')}>
                        {safeRender(row.label)}
                      </span>
                    </div>
                  </TableCell>

                  {paginatedColumns.map(task => (
                    <TableCell key={`${row.id}-${task.id}`} className={cn(
                      "text-center text-sm py-1 px-2 align-middle border-l-4 border-t border-b border-gray-100",
                      DATA_COLUMN_WIDTH,
                      task.type === 'dependant' ? 'bg-orange-50/50' : '',
                      isDocReq && 'bg-emerald-50/50',
                      isStage && 'bg-purple-50/50'
                    )}>
                      <div className="w-full mx-auto flex items-center justify-center min-h-[24px]">
                        {safeRender(enhancedRenderCellValue(task, row))}
                      </div>
                    </TableCell>
                  ))}

                </TableRow>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={paginatedColumns.length + 2} className="h-32 text-center text-slate-500 bg-slate-50/50">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <FileText className="h-12 w-12 text-slate-400" />
                    <div className="text-sm font-semibold text-slate-700">No data available</div>
                    <p className="text-sm text-slate-500">Tasks will appear here when available.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}