// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Officer, OfficerStatus } from '@/app/(dashboard)/dashboard/users-management/officers/components/officers-fields';
import { OfficerDialog } from '../../users-management/officers/components/officer-dialog';
import { format, formatDistanceToNow } from 'date-fns';
import { MoreHorizontal, Calendar, Building2, Layers, Search, FileSpreadsheet, Plus, Download } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';

interface DepartmentMap {
  [key: string]: {
    name: string;
    subdepartments: { [key: string]: string };
  };
}

export default function OfficersPage() {
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [activeOfficers, setActiveOfficers] = useState<Officer[]>([]);
  const [inactiveOfficers, setInactiveOfficers] = useState<Officer[]>([]);
  const [departments, setDepartments] = useState<DepartmentMap>({});
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState<Officer | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  // New States
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");

  // Load departments and officers data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Load departments first
        const deptsData = await fetchDepartments();

        // Create a map of department and subdepartment names
        const deptMap: DepartmentMap = {};

        deptsData.forEach(dept => {
          deptMap[dept.id] = {
            name: dept.name,
            subdepartments: {}
          };

          // Add subdepartments
          (dept.tm_subdepartments || []).forEach((sub: any) => {
            deptMap[dept.id].subdepartments[sub.id] = sub.name;
          });
        });

        setDepartments(deptMap);

        // Then load officers
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

  // Filter officers by active status and enrich with department data
  useEffect(() => {
    if (officers.length > 0) {
      // Process officers to include department info
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

  // Filter logic based on search term
  const filterOfficers = (list: Officer[]) => {
    if (!searchTerm) return list;
    const lowerTerm = searchTerm.toLowerCase();
    return list.filter(officer =>
      officer.name.toLowerCase().includes(lowerTerm) ||
      officer.email?.toLowerCase().includes(lowerTerm)
    );
  };

  const filteredActiveOfficers = filterOfficers(activeOfficers);
  const filteredInactiveOfficers = filterOfficers(inactiveOfficers);

  // Export to Excel Functionality
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheetName = activeTab === 'active' ? 'Active Officers' : 'Inactive Officers';
      const sheet = workbook.addWorksheet(sheetName);
      const dataToExport = activeTab === 'active' ? filteredActiveOfficers : filteredInactiveOfficers;

      // Define Columns
      sheet.columns = [
        { header: '#', key: 'index', width: 10 },
        { header: 'Name', key: 'name', width: 30 },
        { header: 'Email', key: 'email', width: 35 },
        { header: 'Department', key: 'department', width: 30 },
        { header: 'Subdepartment', key: 'subdepartment', width: 30 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Assignment Start', key: 'startDate', width: 20 },
        { header: 'Created At', key: 'createdAt', width: 20 },
      ];

      // Style Header
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

      // Add Data
      dataToExport.forEach((officer, index) => {
        const deptInfo = getCurrentDepartment(officer);

        sheet.addRow({
          index: index + 1,
          name: officer.name,
          email: officer.email || '-',
          department: deptInfo.name,
          subdepartment: deptInfo.subName !== 'No Subdepartment' ? deptInfo.subName : '-',
          status: activeTab === 'active' ? 'Active' : 'Inactive',
          startDate: formatDate(officer.departmentStartDate) || '-',
          createdAt: formatDate(officer.created_at) || '-'
        });
      });

      // Export
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Officers_${sheetName.replace(' ', '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

      toast.success('Export successful');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export Excel');
    }
  };

  const handleSaveOfficer = async (formData: any) => {
    setIsLoading(true);
    try {
      const {
        department_id,
        subdepartment_ids, // Expecting array now
        department_start_date,
        department_end_date,
        start_date,
        end_date,
        ...coreUserData
      } = formData;

      // 1. Prepare User Payload
      // We store the subdepartment_ids array directly in the user's history
      const officerData = {
        name: coreUserData.name,
        email: coreUserData.email || null,
        ...(coreUserData.password ? { password: coreUserData.password } : {}),
        
        status_history: [{
          status: 'active',
          start_date: start_date || new Date().toISOString(),
          end_date: end_date || null
        }],
        
        department_history: [{
          department_id: department_id,
          subdepartment_ids: subdepartment_ids || [], // Store array
          // Fallback for backward compatibility if needed:
          subdepartment_id: subdepartment_ids && subdepartment_ids.length > 0 ? subdepartment_ids[0] : null,
          start_date: department_start_date || new Date().toISOString(),
          end_date: department_end_date || null
        }],
        updated_at: new Date().toISOString(),
      };

      let savedOfficerId;
      let savedOfficer;

      // 2. Update/Create User in tm_users
      if (selectedOfficer) {
        savedOfficerId = selectedOfficer.id;
        savedOfficer = await updateOfficer(selectedOfficer.id, officerData);
        setOfficers(officers.map(o => o.id === selectedOfficer.id ? savedOfficer : o));
        toast.success('Officer updated successfully');
      } else {
        savedOfficer = await createOfficer(officerData);
        savedOfficerId = savedOfficer.id;
        setOfficers([...officers, savedOfficer]);
        toast.success('Officer created successfully');
      }

      // 3. Update tm_subdepartments (officer_history)
      // Only if subdepartments are selected
      if (subdepartment_ids && subdepartment_ids.length > 0) {
        
        const newHistoryEntry = {
          id: savedOfficerId, // The ID of the officer we just saved
          start_date: department_start_date || new Date().toISOString(),
          end_date: department_end_date || null
        };

        // Iterate through each selected subdepartment to update its history
        const updatePromises = subdepartment_ids.map(async (subId: string) => {
          try {
            // A. Fetch current history for this subdepartment
            const { data: currentSub, error: fetchError } = await supabase
              .from('tm_subdepartments')
              .select('officer_history')
              .eq('id', subId)
              .single();

            if (fetchError) throw fetchError;

            // B. Append new officer to history
            // We use a safe spread. If officer_history is null, start a new array.
            const currentHistory = currentSub.officer_history || [];
            const updatedHistory = [...currentHistory, newHistoryEntry];

            // C. Update the subdepartment record
            const { error: updateError } = await supabase
              .from('tm_subdepartments')
              .update({ 
                officer_history: updatedHistory,
                updated_at: new Date().toISOString()
              })
              .eq('id', subId);

            if (updateError) throw updateError;
            
          } catch (err) {
            console.error(`Failed to update history for subdept ${subId}`, err);
            // We don't throw here to ensure other subdepartments might still succeed
          }
        });

        await Promise.all(updatePromises);
      }

      setIsDialogOpen(false);
      setSelectedOfficer(undefined);
    } catch (error) {
      console.error('Error saving officer:', error);
      toast.error('Failed to save officer');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteOfficer = async (officerId: string) => {
    if (!confirm('Are you sure you want to delete this officer?')) return;

    setIsLoading(true);
    try {
      await deleteOfficer(officerId);
      setOfficers(officers.filter(officer => officer.id !== officerId));
      toast.success('Officer deleted');
    } catch (error) {
      console.error('Error deleting officer:', error);
      toast.error('Failed to delete officer');
    } finally {
      setIsLoading(false);
    }
  };

  const DepartmentInfoPopover = ({
    department,
    subdepartment,
    startDate,
    endDate,
    children
  }: {
    department: any;
    subdepartment: any;
    startDate?: string | null;
    endDate?: string | null;
    children: React.ReactNode;
  }) => {
    // Get department info from the department object or try to look it up by ID
    let deptName = 'Unknown Department';
    let deptId = 'N/A';

    if (department) {
      deptName = department.name || 'Unknown Department';
      deptId = department.id || 'N/A';
    } else if (department?.id && departments[department.id]) {
      deptName = departments[department.id].name;
      deptId = department.id;
    }

    // Get subdepartment info
    let subDeptName = 'No Subdepartment';
    let subDeptId = 'N/A';

    if (subdepartment) {
      subDeptName = subdepartment.name || 'No Subdepartment';
      subDeptId = subdepartment.id || 'N/A';
    } else if (department?.id && subdepartment?.id && departments[department.id]?.subdepartments[subdepartment.id]) {
      subDeptName = departments[department.id].subdepartments[subdepartment.id];
      subDeptId = subdepartment.id;
    }

    const isActive = !endDate || new Date(endDate) > new Date();

    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className="text-left hover:underline focus:outline-none">
            {children}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-96">
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium leading-none">Department Information</h4>
                <Badge variant={isActive ? 'default' : 'outline'} className="ml-2">
                  {isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Building2 className="h-4 w-4" />
                      Department
                    </div>
                    <div className="text-sm text-muted-foreground">ID: {deptId}</div>
                  </div>
                  <div className="pl-6 text-sm">{deptName}</div>
                </div>

                {(subDeptName !== 'No Subdepartment') && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Layers className="h-4 w-4 opacity-70" />
                        Subdepartment
                      </div>
                      <div className="text-sm text-muted-foreground">ID: {subDeptId}</div>
                    </div>
                    <div className="pl-6 text-sm">{subDeptName}</div>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="font-medium text-sm">Assignment Period</h4>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 opacity-70" />
                <div className="flex items-center gap-1">
                  <span className="font-medium">From:</span>
                  <span className="text-muted-foreground">
                    {formatDate(startDate) || 'Not specified'}
                  </span>
                </div>
                <div className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                <div className="flex items-center gap-1">
                  <span className="font-medium">To:</span>
                  <span className="text-muted-foreground">
                    {endDate ? formatDate(endDate) : 'Present'}
                  </span>
                </div>
              </div>

              {startDate && (
                <div className="text-xs text-muted-foreground mt-1">
                  {isActive
                    ? `Assigned ${formatDistanceToNow(new Date(startDate), { addSuffix: true })}`
                    : `Assignment ended ${formatDistanceToNow(new Date(endDate!), { addSuffix: true })}`
                  }
                </div>
              )}
            </div>

            <div className="pt-2 text-xs text-muted-foreground">
              Click outside to close
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  // Helper function to get department and subdepartment names by IDs
  const getDepartmentInfo = (deptId: string | undefined, subDeptId: string | undefined | null) => {
    if (!deptId || !departments[deptId]) {
      return { name: 'Unknown Department', subName: 'No Subdepartment' };
    }

    const deptName = departments[deptId].name;
    let subDeptName = 'No Subdepartment';

    if (subDeptId && departments[deptId].subdepartments[subDeptId]) {
      subDeptName = departments[deptId].subdepartments[subDeptId];
    }

    return { name: deptName, subName: subDeptName };
  };

  // Helper function to get current department info
  const getCurrentDepartment = (officer: Officer) => {
    const currentDept = officer.department_history?.[0];
    if (!currentDept) return {
      name: '-',
      subName: '-',
      department: null,
      subdepartment: null,
      startDate: null,
      endDate: null
    };

    // Get department info using the most reliable method available
    let deptName = 'Unknown Department';
    let subDeptName = 'No Subdepartment';

    // Try to get from department object first
    if (currentDept.department?.name) {
      deptName = currentDept.department.name;
      if (currentDept.subdepartment?.name) {
        subDeptName = currentDept.subdepartment.name;
      }
    }
    // Fall back to ID-based lookup
    else if (currentDept.department_id) {
      const deptInfo = getDepartmentInfo(
        currentDept.department_id,
        currentDept.subdepartment_id
      );
      deptName = deptInfo.name;
      subDeptName = deptInfo.subName;
    }

    return {
      name: deptName,
      subName: subDeptName,
      startDate: currentDept.start_date,
      endDate: currentDept.end_date,
      department: currentDept.department || {
        id: currentDept.department_id,
        name: deptName
      },
      subdepartment: currentDept.subdepartment ||
        (currentDept.subdepartment_id ? {
          id: currentDept.subdepartment_id,
          name: subDeptName
        } : null)
    };
  };

  // Helper function to get status badge
  const getStatusBadge = (statusHistory: OfficerStatus[] = []) => {
    const currentStatus = statusHistory[0];
    const isActive = currentStatus?.status === 'active' && !currentStatus?.end_date;
    return (
      <Badge variant={isActive ? 'default' : 'secondary'}>
        {isActive ? 'Active' : 'Inactive'}
      </Badge>
    );
  };

  // Format date for display
  const formatDate = (dateString: string | undefined | null) => {
    if (!dateString) return null;
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return null;
    }
  };

  // Helper function to render action buttons
  const renderActions = (officer: Officer) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => {
            setSelectedOfficer(officer);
            setIsDialogOpen(true);
          }}
        >
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleDeleteOfficer(officer.id!)}
          className="text-red-600"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="mx-auto py-6 px-4 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Officer Management</h1>
          <p className="text-sm text-gray-500">Manage officer accounts, assignments, and statuses.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Search Bar */}
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

          {/* Export Button */}
          <Button
            variant="outline"
            onClick={handleExportExcel}
            className="text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800 gap-2"
            title="Export to Excel"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>

          {/* Add Button */}
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
          <TabsTrigger value="active">Active Officers ({filteredActiveOfficers.length})</TabsTrigger>
          <TabsTrigger value="inactive">Inactive Officers ({filteredInactiveOfficers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {/* Added overflow-auto and max-height for scrolling */}
          <div className="rounded-md border bg-white overflow-auto max-h-[70vh] relative shadow-sm">
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="bg-blue-600 hover:bg-blue-600">
                  <TableHead className="w-[50px] text-white border border-gray-200 font-semibold">#</TableHead>
                  <TableHead className="text-white border border-gray-200 font-semibold">Name</TableHead>
                  <TableHead className="text-white border border-gray-200 font-semibold">Email</TableHead>
                  <TableHead className="text-white border border-gray-200 font-semibold">Department</TableHead>
                  <TableHead className="text-white border border-gray-200 font-semibold">Subdepartment</TableHead>
                  <TableHead className="text-white border border-gray-200 font-semibold">Status</TableHead>
                  <TableHead className="text-white border border-gray-200 font-semibold">Created</TableHead>
                  <TableHead className="w-[50px] text-white border border-gray-200 font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredActiveOfficers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-gray-500">
                      {searchTerm ? 'No matching officers found.' : 'No active officers found.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredActiveOfficers.map((officer, index) => (
                    <TableRow key={officer.id} className="hover:bg-blue-50/50">
                      <TableCell className="font-medium text-gray-500 border border-gray-200">{index + 1}</TableCell>
                      <TableCell className="font-medium border border-gray-200">{officer.name}</TableCell>
                      <TableCell className='border border-gray-200'>{officer.email || '-'}</TableCell>
                      <TableCell className='border border-gray-200'>
                        <DepartmentInfoPopover
                          department={officer.currentDepartment}
                          subdepartment={officer.currentSubdepartment}
                          startDate={officer.departmentStartDate}
                          endDate={officer.department_history?.[0]?.end_date}
                        >
                          <span className={cn(
                            'hover:underline cursor-pointer text-blue-600 font-medium',
                            !officer.currentDepartment?.name && 'text-muted-foreground'
                          )}>
                            {getCurrentDepartment(officer).name}
                          </span>
                        </DepartmentInfoPopover>
                      </TableCell>
                      <TableCell className='border border-gray-200'>
                        {officer.currentSubdepartment ? (
                          <DepartmentInfoPopover
                            department={officer.currentDepartment}
                            subdepartment={officer.currentSubdepartment}
                            startDate={officer.departmentStartDate}
                            endDate={officer.department_history?.[0]?.end_date}
                          >
                            <span className="hover:underline cursor-pointer">
                              {getCurrentDepartment(officer).subName}
                            </span>
                          </DepartmentInfoPopover>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">
                            {officer.department_history?.[0]?.subdepartment_id ? 'No Subdept' : '-'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className='border border-gray-200'>{getStatusBadge(officer.status_history)}</TableCell>
                      <TableCell className="text-gray-500 text-sm border border-gray-200">{officer.created_at ? format(new Date(officer.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell className='border border-gray-200'>{renderActions(officer)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="inactive">
          {/* Added overflow-auto and max-height for scrolling */}
          <div className="rounded-md border bg-white overflow-auto max-h-[70vh] relative shadow-sm">
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="bg-gray-100 hover:bg-gray-100">
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Subdepartment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredInactiveOfficers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-gray-500">
                      {searchTerm ? 'No matching officers found.' : 'No inactive officers found.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInactiveOfficers.map((officer, index) => (
                    <TableRow key={officer.id}>
                      <TableCell className="font-medium text-gray-500">{index + 1}</TableCell>
                      <TableCell className="font-medium">{officer.name}</TableCell>
                      <TableCell>{officer.email || '-'}</TableCell>
                      <TableCell>
                        <DepartmentInfoPopover
                          department={officer.currentDepartment}
                          subdepartment={officer.currentSubdepartment}
                          startDate={officer.departmentStartDate}
                          endDate={officer.department_history?.[0]?.end_date}
                        >
                          <span className={cn(
                            'hover:underline cursor-pointer',
                            !officer.currentDepartment?.name && 'text-muted-foreground'
                          )}>
                            {getCurrentDepartment(officer).name}
                          </span>
                        </DepartmentInfoPopover>
                      </TableCell>
                      <TableCell>
                        {officer.currentSubdepartment ? (
                          <DepartmentInfoPopover
                            department={officer.currentDepartment}
                            subdepartment={officer.currentSubdepartment}
                            startDate={officer.departmentStartDate}
                            endDate={officer.department_history?.[0]?.end_date}
                          >
                            <span className="hover:underline cursor-pointer">
                              {getCurrentDepartment(officer).subName}
                            </span>
                          </DepartmentInfoPopover>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">
                            {officer.department_history?.[0]?.subdepartment_id ? 'No Subdept' : '-'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(officer.status_history)}</TableCell>
                      <TableCell className="text-gray-500 text-sm">{officer.created_at ? format(new Date(officer.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell>{renderActions(officer)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
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