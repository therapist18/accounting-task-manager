// @ts-nocheck
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Officer } from '@/app/(dashboard)/dashboard/users-management/officers/components/officers-fields';
import { OfficerDialog } from '../../users-management/officers/components/officer-dialog';
import { format } from 'date-fns';
import {
  MoreHorizontal, Search, FileSpreadsheet, Plus,
  ArrowUpDown, ChevronDown, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fetchOfficers, createOfficer, updateOfficer, deleteOfficer } from '@/app/(dashboard)/dashboard/users-management/officers/components/officers';
import { fetchDepartments } from '../departments';
import supabase from '@/lib/supabase/client';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { toast } from "@/lib/hooks/use-toast";

interface DepartmentMap {
  [key: string]: {
    name: string;
    subdepartments: { [key: string]: string };
  };
}

// Sorting Types
type SortKey = 'name' | 'email' | 'department' | 'subdepartment' | 'status' | 'created_at' | 'updated_at';

export default function OfficersPage() {
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [activeOfficers, setActiveOfficers] = useState<Officer[]>([]);
  const [inactiveOfficers, setInactiveOfficers] = useState<Officer[]>([]);
  const [departments, setDepartments] = useState<DepartmentMap>({});
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState<Officer | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  // Search & Tabs
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'created_at',
    direction: 'desc',
  });

  // Column Expansion State
  const [showDeptDates, setShowDeptDates] = useState(false);
  const [showStatusDates, setShowStatusDates] = useState(false);

  // Load Data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const deptsData = await fetchDepartments();
        const deptMap: DepartmentMap = {};

        deptsData.forEach(dept => {
          deptMap[dept.id] = {
            name: dept.name,
            subdepartments: {}
          };
          (dept.tm_subdepartments || []).forEach((sub: any) => {
            deptMap[dept.id].subdepartments[sub.id] = sub.name;
          });
        });

        setDepartments(deptMap);
        const officersData = await fetchOfficers();
        setOfficers(officersData);
      } catch (error) {
        console.error('Error loading data:', error);
        toast.error('Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Filter & Categorize Officers
  useEffect(() => {
    if (officers.length > 0) {
      const processedOfficers = officers.map(officer => {
        const currentDept = officer.department_history?.[0];
        return {
          ...officer,
          currentDepartment: currentDept?.department,
          currentSubdepartment: currentDept?.subdepartment,
          departmentStartDate: currentDept?.start_date
        };
      });

      setActiveOfficers(processedOfficers.filter(officer => {
        const status = officer.status_history?.[0];
        return status?.status === 'active' && !status?.end_date;
      }));

      setInactiveOfficers(processedOfficers.filter(officer => {
        const status = officer.status_history?.[0];
        return status?.status === 'inactive' || status?.end_date;
      }));
    } else {
      setActiveOfficers([]);
      setInactiveOfficers([]);
    }
  }, [officers]);

  // --- Helpers ---
  const getCurrentDepartment = (officer: Officer) => {
    const currentDept = officer.department_history?.[0];
    if (!currentDept) return { name: '-', subNames: [], startDate: null, endDate: null };

    let deptName = 'Unknown Department';
    let subDeptNames: string[] = [];

    if (currentDept.department_id && departments[currentDept.department_id]) {
      deptName = departments[currentDept.department_id].name;
      if (currentDept.subdepartment_ids && Array.isArray(currentDept.subdepartment_ids)) {
        subDeptNames = currentDept.subdepartment_ids
          .map((id: string) => departments[currentDept.department_id]?.subdepartments[id])
          .filter(Boolean);
      }
      else if (currentDept.subdepartment_id && departments[currentDept.department_id]?.subdepartments[currentDept.subdepartment_id]) {
        subDeptNames = [departments[currentDept.department_id].subdepartments[currentDept.subdepartment_id]];
      }
    } else if (currentDept.department?.name) {
      deptName = currentDept.department.name;
    }

    return {
      name: deptName,
      subNames: subDeptNames,
      startDate: currentDept.start_date,
      endDate: currentDept.end_date
    };
  };

  // --- Sorting Logic ---
  const handleSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedOfficers = (list: Officer[]) => {
    let filtered = list;
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      filtered = list.filter(officer =>
        officer.name.toLowerCase().includes(lowerTerm) ||
        officer.email?.toLowerCase().includes(lowerTerm)
      );
    }

    return [...filtered].sort((a, b) => {
      let aValue: any = '';
      let bValue: any = '';

      switch (sortConfig.key) {
        case 'name':
        case 'email':
        case 'created_at':
        case 'updated_at':
          aValue = a[sortConfig.key] || '';
          bValue = b[sortConfig.key] || '';
          break;
        case 'department':
          aValue = getCurrentDepartment(a).name;
          bValue = getCurrentDepartment(b).name;
          break;
        case 'subdepartment':
          aValue = getCurrentDepartment(a).subNames.join(', ');
          bValue = getCurrentDepartment(b).subNames.join(', ');
          break;
        case 'status':
          aValue = a.status_history?.[0]?.status || '';
          bValue = b.status_history?.[0]?.status || '';
          break;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const sortedActiveOfficers = useMemo(() => getSortedOfficers(activeOfficers), [activeOfficers, searchTerm, sortConfig, departments]);
  const sortedInactiveOfficers = useMemo(() => getSortedOfficers(inactiveOfficers), [inactiveOfficers, searchTerm, sortConfig, departments]);

  const handleSaveOfficer = async (formData: any) => {
    setIsLoading(true);
    // DEBUG: Verify subdepartment_ids are now present
    console.log("Submitting form data:", formData);

    try {
      const {
        department_id,
        subdepartment_ids,
        department_start_date,
        department_end_date,
        start_date,
        end_date,
        ...coreUserData
      } = formData;

      // Ensure we work with an array even if undefined
      const subDeptIdsArray = Array.isArray(subdepartment_ids) ? subdepartment_ids : [];

      // --- STEP 1: Use Unified API for Officer Management ---
      const officerData = {
        username: coreUserData.name.toLowerCase().replace(/\s+/g, '.'),
        email: coreUserData.email || null,
        firstName: coreUserData.name.split(' ')[0] || '',
        lastName: coreUserData.name.split(' ').slice(1).join(' ') || '',
        isActive: true,
        payrollAccessEnabled: true,
        jobLevels: subDeptIdsArray.length > 0 ? subDeptIdsArray.map(subDeptId => ({
          level: 2, // Subdepartment level
          department_id: parseInt(department_id),
          subdepartment_id: parseInt(subDeptId),
          class_id: null,
          subclass_id: null
        })) : [{
          level: 1, // Department level
          department_id: parseInt(department_id),
          subdepartment_id: null,
          class_id: null,
          subclass_id: null
        }],
        ...(coreUserData.password ? { password: coreUserData.password } : {})
      };

      let savedOfficerId;
      let savedOfficer;

      if (selectedOfficer) {
        savedOfficerId = selectedOfficer.id;
        savedOfficer = await updateOfficer(selectedOfficer.id, officerData);
        setOfficers(officers.map(o => o.id === selectedOfficer.id ? savedOfficer : o));
        toast.success('Officer profile updated');
      } else {
        savedOfficer = await createOfficer(officerData);
        savedOfficerId = savedOfficer.id;
        setOfficers([...officers, savedOfficer]);
        toast.success('Officer created');
      }

      // --- STEP 2: Update 'tm_subdepartments' Table ---
      // We only run this if there are subdepartments selected
      if (savedOfficerId && subDeptIdsArray.length > 0) {
        console.log(`Updating ${subDeptIdsArray.length} subdepartments for Officer ID: ${savedOfficerId}`);

        const updatePromises = subDeptIdsArray.map(async (subId: string | number) => {
          // A. Fetch current history for this specific subdepartment
          const { data: subDeptData, error: fetchError } = await supabase
            .from('tm_subdepartments')
            .select('officer_history')
            .eq('id', subId)
            .single();

          if (fetchError) {
            console.error(`Error fetching subdept ${subId}:`, fetchError);
            return;
          }

          // B. Append new history entry
          const currentHistory = Array.isArray(subDeptData?.officer_history)
            ? subDeptData.officer_history
            : [];

          const newHistoryEntry = {
            id: savedOfficerId,
            start_date: department_start_date || new Date().toISOString(),
            end_date: department_end_date || null,
            updated_at: new Date().toISOString()
          };

          // C. Update the table with the new array
          const { error: updateError } = await supabase
            .from('tm_subdepartments')
            .update({
              officer_history: [...currentHistory, newHistoryEntry],
              updated_at: new Date().toISOString()
            })
            .eq('id', subId);

          if (updateError) {
            console.error(`Error updating subdept ${subId}:`, updateError);
            toast.error(`Failed to assign to subdepartment ${subId}`);
          }
        });

        // Wait for all updates to complete
        await Promise.all(updatePromises);
      }

      setIsDialogOpen(false);
      setSelectedOfficer(undefined);
    } catch (error) {
      console.error('Error saving officer:', error);
      toast.error('Failed to save officer data');
    } finally {
      setIsLoading(false);
    }
  };

  // --- UPDATED DELETE FUNCTION ---
  const handleDeleteOfficer = async (officerId: string) => {
    if (!confirm('Are you sure you want to delete this officer? This will remove them from all assigned departments.')) return;
    setIsLoading(true);
    try {
      // 1. Get the officer's current subdepartments from local state
      const officerToDelete = officers.find(o => o.id === officerId);
      const subIdsToCheck = officerToDelete?.department_history?.[0]?.subdepartment_ids || [];

      // 2. Remove officer from 'tm_subdepartments' history (Update Table 1)
      if (subIdsToCheck.length > 0) {
        const cleanupPromises = subIdsToCheck.map(async (subId: any) => {
          // Fetch current history
          const { data: subData } = await supabase
            .from('tm_subdepartments')
            .select('officer_history')
            .eq('id', subId)
            .single();

          if (subData && Array.isArray(subData.officer_history)) {
            // Filter out the officer being deleted
            // We check against 'officer_id' or 'id' to be safe with JSON variations
            const updatedHistory = subData.officer_history.filter((record: any) =>
              String(record.officer_id) !== String(officerId) &&
              String(record.id) !== String(officerId)
            );

            // Only update if changes were made
            if (updatedHistory.length !== subData.officer_history.length) {
              await supabase
                .from('tm_subdepartments')
                .update({ officer_history: updatedHistory })
                .eq('id', subId);
            }
          }
        });

        await Promise.all(cleanupPromises);
      }

      // 3. Delete from 'tm_users' (Delete Table 2)
      await deleteOfficer(officerId);

      // 4. Update UI
      setOfficers(officers.filter(officer => officer.id !== officerId));
      toast.success('Officer deleted completely');

    } catch (error) {
      console.error('Error deleting officer:', error);
      toast.error('Failed to delete officer');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheetName = activeTab === 'active' ? 'Active Officers' : 'Inactive Officers';
      const sheet = workbook.addWorksheet(sheetName);
      const dataToExport = activeTab === 'active' ? sortedActiveOfficers : sortedInactiveOfficers;

      sheet.columns = [
        { header: '#', key: 'index', width: 10 },
        { header: 'Name', key: 'name', width: 30 },
        { header: 'Email', key: 'email', width: 35 },
        { header: 'Department', key: 'department', width: 30 },
        { header: 'Subdepartments', key: 'subdepartment', width: 40 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Assignment Start', key: 'startDate', width: 20 },
        { header: 'Assignment End', key: 'endDate', width: 20 },
        { header: 'Created At', key: 'createdAt', width: 20 },
      ];

      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

      dataToExport.forEach((officer, index) => {
        const deptInfo = getCurrentDepartment(officer);
        sheet.addRow({
          index: index + 1,
          name: officer.name,
          email: officer.email || '-',
          department: deptInfo.name,
          subdepartment: deptInfo.subNames.join(', '),
          status: activeTab === 'active' ? 'Active' : 'Inactive',
          startDate: deptInfo.startDate ? format(new Date(deptInfo.startDate), 'yyyy-MM-dd') : '-',
          endDate: deptInfo.endDate ? format(new Date(deptInfo.endDate), 'yyyy-MM-dd') : '-',
          createdAt: officer.created_at ? format(new Date(officer.created_at), 'yyyy-MM-dd') : '-',
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Officers_${sheetName.replace(' ', '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

      toast.success('Export successful');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export Excel');
    }
  };

  const renderSortArrow = (key: SortKey) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="ml-2 h-3 w-3 opacity-50" />;
    return sortConfig.direction === 'asc' ?
      <ChevronDown className="ml-2 h-3 w-3 text-white rotate-180 transition-transform" /> :
      <ChevronDown className="ml-2 h-3 w-3 text-white transition-transform" />;
  };

  const getTotalColumns = () => {
    let cols = 7;
    if (showDeptDates) cols += 2;
    if (showStatusDates) cols += 1;
    cols += 2;
    return cols;
  };

  const TableContent = ({ data }: { data: Officer[] }) => (
    <div className="rounded-md border bg-white overflow-auto max-h-[70vh] relative shadow-sm">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-white shadow-sm">
          <TableRow className="bg-blue-600 hover:bg-blue-600 border-none">
            <TableHead className="w-[50px] text-white font-semibold">#</TableHead>
            <TableHead className="text-white font-semibold cursor-pointer hover:bg-blue-700 transition-colors" onClick={() => handleSort('name')}>
              <div className="flex items-center">Name {renderSortArrow('name')}</div>
            </TableHead>
            <TableHead className="text-white font-semibold cursor-pointer hover:bg-blue-700 transition-colors" onClick={() => handleSort('email')}>
              <div className="flex items-center">Email {renderSortArrow('email')}</div>
            </TableHead>
            <TableHead className="text-white font-semibold transition-colors min-w-[200px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center cursor-pointer hover:underline" onClick={() => handleSort('department')}>
                  Department {renderSortArrow('department')}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-blue-500 text-white"
                  onClick={() => setShowDeptDates(!showDeptDates)}
                  title={showDeptDates ? "Collapse dates" : "Expand dates"}
                >
                  {showDeptDates ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                </Button>
              </div>
            </TableHead>
            <TableHead className="text-white font-semibold cursor-pointer hover:bg-blue-700 transition-colors min-w-[200px]" onClick={() => handleSort('subdepartment')}>
              <div className="flex items-center">Subdepartments {renderSortArrow('subdepartment')}</div>
            </TableHead>
            {showDeptDates && (
              <>
                <TableHead className="text-white font-semibold bg-blue-700 animate-in fade-in slide-in-from-left-2">
                  Assigned From
                </TableHead>
                <TableHead className="text-white font-semibold bg-blue-700 animate-in fade-in slide-in-from-left-2">
                  Assigned To
                </TableHead>
              </>
            )}
            <TableHead className="text-white font-semibold transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center cursor-pointer hover:underline" onClick={() => handleSort('status')}>
                  Status {renderSortArrow('status')}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-blue-500 text-white"
                  onClick={() => setShowStatusDates(!showStatusDates)}
                  title={showStatusDates ? "Collapse status history" : "Expand status history"}
                >
                  {showStatusDates ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                </Button>
              </div>
            </TableHead>
            {showStatusDates && (
              <TableHead className="text-white font-semibold bg-blue-700 animate-in fade-in slide-in-from-left-2">
                Status Since
              </TableHead>
            )}
            <TableHead className="text-white font-semibold cursor-pointer hover:bg-blue-700 transition-colors" onClick={() => handleSort('created_at')}>
              <div className="flex items-center">Created {renderSortArrow('created_at')}</div>
            </TableHead>
            <TableHead className="text-white font-semibold cursor-pointer hover:bg-blue-700 transition-colors" onClick={() => handleSort('updated_at')}>
              <div className="flex items-center">Updated {renderSortArrow('updated_at')}</div>
            </TableHead>
            <TableHead className="w-[50px] text-white font-semibold">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={getTotalColumns()} className="h-24 text-center">Loading...</TableCell>
            </TableRow>
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={getTotalColumns()} className="h-24 text-center text-gray-500">
                {searchTerm ? 'No matching officers found.' : 'No officers found.'}
              </TableCell>
            </TableRow>
          ) : (
            data.map((officer, index) => {
              const deptInfo = getCurrentDepartment(officer);
              const statusInfo = officer.status_history?.[0];

              return (
                <React.Fragment key={officer.id}>
                  <TableRow className="hover:bg-gray-50">
                    <TableCell className="font-medium text-gray-500">{index + 1}</TableCell>
                    <TableCell className="font-medium">{officer.name}</TableCell>
                    <TableCell>{officer.email || '-'}</TableCell>

                    <TableCell>
                      <span className={cn("font-medium", !deptInfo.name && "text-muted-foreground")}>
                        {deptInfo.name}
                      </span>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {deptInfo.subNames.length > 0 ? (
                          <>
                            <Badge variant="secondary" className="text-[10px] font-normal">{deptInfo.subNames[0]}</Badge>
                            {deptInfo.subNames.length > 1 && (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground" title={deptInfo.subNames.slice(1).join(', ')}>
                                +{deptInfo.subNames.length - 1}
                              </Badge>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground italic">-</span>
                        )}
                      </div>
                    </TableCell>

                    {showDeptDates && (
                      <>
                        <TableCell className="bg-blue-50/30 text-xs animate-in fade-in slide-in-from-left-2 whitespace-nowrap">
                          {deptInfo.startDate ? format(new Date(deptInfo.startDate), 'MMM d, yyyy') : '-'}
                        </TableCell>
                        <TableCell className="bg-blue-50/30 text-xs animate-in fade-in slide-in-from-left-2 whitespace-nowrap">
                          {deptInfo.endDate ? format(new Date(deptInfo.endDate), 'MMM d, yyyy') : <span className="text-green-600 font-medium">Present</span>}
                        </TableCell>
                      </>
                    )}

                    <TableCell>
                      <Badge variant={statusInfo?.status === 'active' ? 'default' : 'secondary'}>
                        {statusInfo?.status || 'Unknown'}
                      </Badge>
                    </TableCell>

                    {showStatusDates && (
                      <TableCell className="bg-blue-50/30 text-xs animate-in fade-in slide-in-from-left-2 whitespace-nowrap">
                        {statusInfo?.start_date ? format(new Date(statusInfo.start_date), 'MMM d, yyyy') : '-'}
                      </TableCell>
                    )}

                    <TableCell className="text-gray-500 text-sm whitespace-nowrap">
                      {officer.created_at ? format(new Date(officer.created_at), 'MMM d, yyyy') : '-'}
                    </TableCell>

                    <TableCell className="text-gray-500 text-sm whitespace-nowrap">
                      {officer.updated_at ? format(new Date(officer.updated_at), 'MMM d, yyyy') : '-'}
                    </TableCell>

                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => { setSelectedOfficer(officer); setIsDialogOpen(true); }}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteOfficer(officer.id!)} className="text-red-600">
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
  return (
    <div className="mx-auto py-6 px-4 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Officer Management</h1>
          <p className="text-sm text-gray-500">Manage officer accounts, assignments, and statuses.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              type="text"
              placeholder="Search by name or email..."
              className="pl-9 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Button
            variant="outline"
            onClick={handleExportExcel}
            className="text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800 gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>

          <Button
            onClick={() => {
              setSelectedOfficer(undefined);
              setIsDialogOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Officer
          </Button>
        </div>
      </div>

      <Tabs defaultValue="active" className="w-full" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="active">Active Officers ({sortedActiveOfficers.length})</TabsTrigger>
          <TabsTrigger value="inactive">Inactive Officers ({sortedInactiveOfficers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <TableContent data={sortedActiveOfficers} />
        </TabsContent>

        <TabsContent value="inactive">
          <TableContent data={sortedInactiveOfficers} />
        </TabsContent>
      </Tabs>

      <OfficerDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleSaveOfficer}
        officer={selectedOfficer}
        isLoading={isLoading}
      />
    </div>
  );
}