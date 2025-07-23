// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Officer, OfficerStatus } from '@/types/officer';
import { OfficerDialog } from '../../users-management/officers/components/officer-dialog';
import { format, formatDistanceToNow } from 'date-fns';
import { MoreHorizontal, Calendar, Building2, Layers } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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

interface DepartmentMap {
  [key: string]: {
    name: string;
    subdepartments: {[key: string]: string};
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
        // Optionally show error to user
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

  const handleSaveOfficer = async (formData: any) => {
    setIsLoading(true);
    try {
      // Prepare the data for the API
      const officerData = {
        ...formData,
        // Ensure status_history is properly formatted
        status_history: [{
          status: 'active',
          start_date: formData.status_history?.[0]?.start_date || new Date().toISOString(),
          end_date: formData.status_history?.[0]?.end_date || null
        }],
        // Flatten department and subdepartment for the API
        department_id: formData.department_id,
        subdepartment_id: formData.subdepartment_id || null,
        department_start_date: formData.department_start_date,
        department_end_date: formData.department_end_date || null
      };
      
      let savedOfficer;
      if (selectedOfficer) {
        savedOfficer = await updateOfficer(selectedOfficer.id, officerData);
        setOfficers(officers.map(o => o.id === selectedOfficer.id ? savedOfficer : o));
      } else {
        savedOfficer = await createOfficer(officerData);
        setOfficers([...officers, savedOfficer]);
      }
      
      setIsDialogOpen(false);
      setSelectedOfficer(undefined);
    } catch (error) {
      console.error('Error saving officer:', error);
      // Optionally show error to user
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteOfficer = async (officerId: string) => {
    if (!confirm('Are you sure you want to delete this officer?')) return;
    
    setIsLoading(true);
    try {
      await deleteOfficer(officerId);
      // Update local state
      setOfficers(officers.filter(officer => officer.id !== officerId));
    } catch (error) {
      console.error('Error deleting officer:', error);
      // Optionally show error to user
    } finally {
      setIsLoading(false);
    }
  };

  // Department history popover component
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
    <div className="mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Officer Management</h1>
        <Button onClick={() => {
          setSelectedOfficer(undefined);
          setIsDialogOpen(true);
        }}>
          Add Officer
        </Button>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList>
          <TabsTrigger value="active">Active Officers ({activeOfficers.length})</TabsTrigger>
          <TabsTrigger value="inactive">Inactive Officers ({inactiveOfficers.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="active">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="bg-blue-600 border-r text-white">#</TableHead>
                  <TableHead className="bg-blue-600 border-r text-white">Name</TableHead>
                  <TableHead className="bg-blue-600 border-r text-white">Email</TableHead>
                  <TableHead className="bg-blue-600 border-r text-white">Department</TableHead>
                  <TableHead className="bg-blue-600 border-r text-white">Subdepartment</TableHead>
                  <TableHead className="bg-blue-600 border-r text-white">Status</TableHead>
                  <TableHead className="bg-blue-600 border-r text-white">Created</TableHead>
                  <TableHead className="w-[50px] bg-blue-600 border-r text-white">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : activeOfficers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      No active officers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  activeOfficers.map((officer, index) => (
                    <TableRow key={officer.id}>
                      <TableCell className="font-medium border-r">{index + 1}</TableCell>
                      <TableCell className="font-medium border-r">{officer.name}</TableCell>
                      <TableCell className="border-r">{officer.email || '-'}</TableCell>
                      <TableCell className="border-r">
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
                      <TableCell className="border-r">
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
                          <span className="text-muted-foreground border-r">
                            {officer.department_history?.[0]?.subdepartment_id ? 'No Subdept' : '-'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="border-r">{getStatusBadge(officer.status_history)}</TableCell>
                      <TableCell className="border-r">{officer.created_at ? format(new Date(officer.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell className="border-r">{renderActions(officer)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        
        <TabsContent value="inactive">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
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
                    <TableCell colSpan={7} className="h-24 text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : inactiveOfficers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      No inactive officers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  inactiveOfficers.map((officer) => (
                    <TableRow key={officer.id}>
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
                          <span className="text-muted-foreground">
                            {officer.department_history?.[0]?.subdepartment_id ? 'No Subdept' : '-'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(officer.status_history)}</TableCell>
                      <TableCell>{officer.created_at ? format(new Date(officer.created_at), 'MMM d, yyyy') : '-'}</TableCell>
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
