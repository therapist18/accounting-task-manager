"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Minus, ArrowUpDown, Briefcase, SearchX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Building, Layers, Shield, User as UserIcon, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { userService, getOfficerDisplayName } from "@/lib/shared-user-assignment-service";

const COLUMN_WIDTH_CLASS = "w-[200px] min-w-[200px] max-w-[200px]";
const INDEX_WIDTH_CLASS = "w-14 min-w-14 max-w-14";

// Helper function to group role assignments by hierarchy
const groupAssignmentsByHierarchy = (roleAssignments: any[]) => {
  return {
    departments: roleAssignments.filter((a: any) => a.department_id && !a.subdepartment_id),
    subDepartments: roleAssignments.filter((a: any) => a.subdepartment_id && !a.class_id),
    classes: roleAssignments.filter((a: any) => a.class_id)
  };
};

// Role Assignments Display Component for Popover
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

interface StandardReportViewProps {
  allTasks: any[];
  filteredColumns: any[];
  columnGroups: any[];
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  expandedStageColumns: Set<string>;
  renderCellValue: (task: any, col: any) => any;
  safeRender: (content: any) => any;
  handleSort: (key: string) => void;
  toggleStageColumns: (stageId: string) => void;
  isStageApplicableToCurrentFilter: (stageId: string) => boolean;
  initialRowsPerPage?: number;
  userData?: {
    officers: any[];
    managers: any[];
    assistants: any[];
    allUsers: any[];
  };
  departments?: any[];
  stages?: any[];
  getStaffFromParticipants?: (task: any, role: string) => string | null;
}

export function StandardReportView({
  allTasks,
  filteredColumns,
  columnGroups,
  sortConfig,
  expandedStageColumns,
  renderCellValue,
  safeRender,
  handleSort,
  toggleStageColumns,
  isStageApplicableToCurrentFilter,
  initialRowsPerPage = 25,
  userData = { officers: [], managers: [], assistants: [], allUsers: [] },
  departments = [],
  stages = [],
  getStaffFromParticipants
}: StandardReportViewProps) {

  // Helper to format minutes to time string
  const minutesToTimeString = (minutes: number | null): string => {
    if (minutes === null || minutes === 0) return "0m";
    const days = Math.floor(minutes / (60 * 24));
    const hours = Math.floor((minutes % (60 * 24)) / 60);
    const mins = minutes % 60;
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0) parts.push(`${mins}m`);
    return parts.join(" ") || "0m";
  };

  // Define which columns should be sticky (frozen)
  const stickyColumnIds = new Set(['task_applicant_name', 'task_job_level', 'task_renewal_new', 'task_sub_department']);

  // Calculate sticky column offsets
  const stickyColumnOffsets = useMemo(() => {
    const offsets: Record<string, number> = {};
    let currentOffset = 50; // Start after index column (50px)

    filteredColumns.forEach(col => {
      if (stickyColumnIds.has(col.id)) {
        offsets[col.id] = currentOffset;
        currentOffset += 180; // Each sticky column is 180px (COLUMN_WIDTH_CLASS)
      }
    });

    return offsets;
  }, [filteredColumns, stickyColumnIds]);

  // Row pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);

  // Reset to page 1 when allTasks changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [allTasks]);

  // Calculate pagination
  const totalRows = allTasks.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return allTasks.slice(startIndex, startIndex + rowsPerPage);
  }, [allTasks, currentPage, rowsPerPage]);

  // Pagination callbacks
  const handleNextPage = useCallback(() => setCurrentPage(prev => Math.min(prev + 1, totalPages)), [totalPages]);
  const handlePreviousPage = useCallback(() => setCurrentPage(prev => Math.max(prev - 1, 1)), []);
  const handleFirstPage = useCallback(() => setCurrentPage(1), []);
  const handleLastPage = useCallback(() => setCurrentPage(totalPages), [totalPages]);
  const handleRowsPerPageChange = useCallback((value: string) => {
    setRowsPerPage(parseInt(value, 10));
    setCurrentPage(1);
  }, []);

  // Helper to detect role columns and render appropriately
  const isRoleColumn = (col: any) => {
    const colId = col.id?.toLowerCase() || col.field?.toLowerCase() || '';
    return colId.includes('officer') || colId.includes('manager') || colId.includes('assistant');
  };

  const getRoleFromColumn = (col: any) => {
    const colId = col.id?.toLowerCase() || col.field?.toLowerCase() || '';
    if (colId.includes('officer')) return 'officer';
    if (colId.includes('manager')) return 'task_manager';
    if (colId.includes('assistant')) return 'task_assistant';
    return null;
  };

  // Enhanced render function that handles role columns
  const enhancedRenderCellValue = (task: any, col: any) => {
    const role = getRoleFromColumn(col);

    if (!role || !getStaffFromParticipants) {
      return safeRender(renderCellValue(task, col));
    }

    // Use getStaffFromParticipants to extract staff name from participants_details
    const staffName = getStaffFromParticipants(task, role);

    if (!staffName) {
      return <span className="text-sm text-slate-400 italic">None assigned</span>;
    }

    return <span className="text-sm text-slate-700">{staffName}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Row Pagination Controls */}
      {totalRows > 0 && (
        <div className="flex items-center justify-between p-4 bg-white border rounded-xl shadow-sm">
          <div className="text-sm text-slate-500">
            Showing{' '}
            <span className="font-bold text-slate-800">{((currentPage - 1) * rowsPerPage) + 1}</span> to{' '}
            <span className="font-bold text-slate-800">{Math.min(currentPage * rowsPerPage, totalRows)}</span> of{' '}
            <span className="font-bold text-slate-800">{totalRows}</span> rows
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Rows:</span>
              <Select
                value={String(rowsPerPage)}
                onValueChange={handleRowsPerPageChange}
              >
                <SelectTrigger className="w-20 h-8">
                  <SelectValue placeholder={rowsPerPage} />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map(size => (
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
                onClick={handleFirstPage}
                disabled={currentPage === 1}
                aria-label="Go to first page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                aria-label="Go to previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-4 text-sm font-bold">Page {totalPages > 0 ? currentPage : 0} / {Math.max(1, totalPages)}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleNextPage}
                disabled={currentPage >= totalPages}
                aria-label="Go to next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleLastPage}
                disabled={currentPage >= totalPages}
                aria-label="Go to last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="border-2 border-slate-300 rounded-b-lg rounded-tl-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <Table className="border-separate border-spacing-0 w-full min-w-max">
          <TableHeader className="sticky top-0 z-30 shadow-sm backdrop-blur-md">

            {/* --- GROUP HEADER ROW --- */}
            <TableRow className="bg-slate-200 border-y-2 border-slate-400">
              <TableHead className={`${INDEX_WIDTH_CLASS} sticky left-0 z-40 bg-slate-200 border-r border-slate-300 text-center font-bold text-slate-500 text-xs`}>
                #
              </TableHead>
              {columnGroups.map((group, i) => (
                <TableHead
                  key={i}
                  colSpan={group.span}
                  className={cn(
                    "text-center font-bold border-r border-slate-300 last:border-r-0 py-2 text-sm text-slate-700",
                    !group.applicable ? 'bg-amber-50/80 text-amber-800' : 'bg-slate-200'
                  )}
                >
                  <div className="flex items-center justify-center gap-2">
                    {group.label}
                    {!group.applicable && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 text-[10px] px-1.5 py-0">
                        FILTER N/A
                      </Badge>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>

            {/* --- COLUMN HEADER ROW --- */}
            <TableRow className="bg-blue-600 text-white">
              <TableHead className={`${INDEX_WIDTH_CLASS} sticky left-0 z-40 bg-blue-600 border-r border-blue-500 text-center text-white font-semibold text-xs`}>
                IDX
              </TableHead>
              {filteredColumns.map(col => {
                const isColFilterNA = col.stageId ? !isStageApplicableToCurrentFilter(col.stageId) : false;
                const isSticky = stickyColumnIds.has(col.id);
                const leftOffset = isSticky ? stickyColumnOffsets[col.id] : undefined;

                return (
                  <TableHead
                    key={col.id}
                    onClick={() => handleSort(col.id)}
                    className={cn(
                      `${COLUMN_WIDTH_CLASS} px-3 py-2.5 font-medium text-sm border-r border-blue-500/50 cursor-pointer transition-colors group select-none`,
                      isColFilterNA ? 'bg-blue-700/80 text-blue-100' : 'bg-blue-600 hover:bg-blue-700 text-white',
                      isSticky && `sticky left-[${leftOffset}px] z-30`
                    )}
                    style={isSticky ? { left: `${leftOffset}px` } : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="break-words leading-tight">Time Gap</span>

                        {isColFilterNA && (
                          <Badge variant="outline" className="bg-blue-800 text-blue-200 border-blue-400 text-[10px] px-1 py-0 h-4 shrink-0">
                            N/A
                          </Badge>
                        )}

                        {col.hasSubColumns && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); toggleStageColumns(col.stageId); }}
                            className="h-5 w-5 hover:bg-blue-800/50 text-white shrink-0 transition-colors p-0 rounded-sm"
                          >
                            {expandedStageColumns.has(col.stageId) ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                      </div>

                      {/* Subtle Sort Icon */}
                      <ArrowUpDown className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-all duration-200",
                        sortConfig?.key === col.id
                          ? "text-white opacity-100 scale-110"
                          : "text-blue-200 opacity-0 group-hover:opacity-100 -translate-y-1 group-hover:translate-y-0"
                      )} />
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>

            {/* --- STAGE DURATION HEADER ROW --- */}
            <TableRow className="bg-purple-100 border-b border-purple-300">
              <TableHead className={`${INDEX_WIDTH_CLASS} sticky left-0 z-40 bg-purple-100 border-r border-purple-200 text-center font-semibold text-xs text-purple-800`}>
                Duration
              </TableHead>
              {filteredColumns.map(col => {
                const isSticky = stickyColumnIds.has(col.id);
                const leftOffset = isSticky ? stickyColumnOffsets[col.id] : undefined;

                // Only show duration for stage columns
                if (col.type === 'stage_date' && col.stageId) {
                  const stage = stages.find((s: any) => s.id === col.stageId);
                  const duration = stage?.estimated_time ? minutesToTimeString(stage.estimated_time) : '-';
                  const isColFilterNA = !isStageApplicableToCurrentFilter(col.stageId);

                  return (
                    <TableHead
                      key={col.id}
                      className={cn(
                        `${COLUMN_WIDTH_CLASS} text-center font-semibold text-xs border-r border-purple-200`,
                        isColFilterNA ? 'bg-purple-200/80 text-purple-400' : 'bg-purple-100 text-purple-800',
                        isSticky && `sticky left-[${leftOffset}px] z-30`
                      )}
                      style={isSticky ? { left: `${leftOffset}px` } : undefined}
                    >
                      {duration}
                    </TableHead>
                  );
                }
                // Gap columns show time difference between stages
                if (col.type === 'stage_gap') {
                  return (
                    <TableHead
                      key={col.id}
                      className={`${COLUMN_WIDTH_CLASS} border-r border-purple-200 bg-orange-50 text-center font-semibold text-xs text-orange-700`}
                    >
                      {col.label}
                    </TableHead>
                  );
                }
                // Empty cells for other non-stage columns
                return (
                  <TableHead
                    key={col.id}
                    className={cn(
                      `${COLUMN_WIDTH_CLASS} border-r border-purple-200 bg-purple-50`,
                      isSticky && `sticky left-[${leftOffset}px] z-30`
                    )}
                    style={isSticky ? { left: `${leftOffset}px` } : undefined}
                  />
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y divide-slate-100 bg-white">
            {paginatedTasks.length > 0 ? paginatedTasks.map((task, idx) => {

              // Determine row background for seamless sticky column hovering
              const isEven = idx % 2 === 0;
              const rowBg = isEven ? 'bg-white' : 'bg-slate-100';
              const hoverBg = 'hover:bg-blue-50/50';
              const baseBgClass = rowBg;

              return (
                <TableRow key={task.id} className={`${rowBg} ${hoverBg} group border-b border-slate-200 transition-colors`}>

                  {/* Sticky Index Cell */}
                  <TableCell className={`${INDEX_WIDTH_CLASS} sticky left-0 z-20 ${baseBgClass} group-hover:bg-blue-50/50 border-r border-slate-200 font-medium text-xs text-center text-slate-500`}>
                    {(currentPage - 1) * rowsPerPage + idx + 1}
                  </TableCell>

                  {/* Data Cells */}
                  {filteredColumns.map(col => {
                    const isSticky = stickyColumnIds.has(col.id);
                    const leftOffset = isSticky ? stickyColumnOffsets[col.id] : undefined;

                    return (
                      <TableCell
                        key={col.id}
                        className={cn(
                          `${COLUMN_WIDTH_CLASS} border-r border-b border-slate-200 px-3 py-2.5 text-sm text-slate-700 align-middle`,
                          isSticky && `sticky left-[${leftOffset}px] z-20 ${baseBgClass} group-hover:bg-blue-50/50`
                        )}
                        style={isSticky ? { left: `${leftOffset}px` } : undefined}
                      >
                        <div className="truncate w-full flex items-center min-h-[24px]">
                          {safeRender(enhancedRenderCellValue(task, col))}
                        </div>
                      </TableCell>
                    );
                  })}

                </TableRow>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={filteredColumns.length + 1} className="h-[40vh] text-center bg-slate-50/30">
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <SearchX className="h-12 w-12 mb-4 text-slate-300" strokeWidth={1.5} />
                    <p className="text-base font-semibold text-slate-600">No matching tasks found</p>
                    <p className="text-sm text-slate-500 mt-1">Try adjusting your search or modifying the active filters above.</p>
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