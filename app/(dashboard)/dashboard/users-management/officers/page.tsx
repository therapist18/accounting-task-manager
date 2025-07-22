// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Officer, OfficerStatus } from '@/types/officer';
import { OfficerDialog } from '../../users-management/officers/components/officer-dialog';
import { format } from 'date-fns';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fetchOfficers, createOfficer, updateOfficer, deleteOfficer } from '@/app/(dashboard)/dashboard/users-management/officers/components/officers';



export default function OfficersPage() {
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [activeOfficers, setActiveOfficers] = useState<Officer[]>([]);
  const [inactiveOfficers, setInactiveOfficers] = useState<Officer[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState<Officer | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  // Load officers from the database
  useEffect(() => {
    const loadOfficers = async () => {
      setIsLoading(true);
      try {
        const data = await fetchOfficers();
        setOfficers(data);
      } catch (error) {
        console.error('Error fetching officers:', error);
        // Optionally show error to user
      } finally {
        setIsLoading(false);
      }
    };

    loadOfficers();
  }, []);

  // Filter officers by active status
  useEffect(() => {
    if (officers.length > 0) {
      setActiveOfficers(officers.filter(officer => {
        const status = officer.status_history?.[0];
        return status?.status === 'active' && !status?.end_date;
      }));
      
      setInactiveOfficers(officers.filter(officer => {
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

  // Helper function to get status badge
  const getStatusBadge = (statusHistory: OfficerStatus[]) => {
    const isActive = statusHistory[0]?.status === 'active' && !statusHistory[0]?.end_date;
    return (
      <Badge variant={isActive ? 'default' : 'secondary'}>
        {isActive ? 'Active' : 'Inactive'}
      </Badge>
    );
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
    <div className="container mx-auto py-10">
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
                ) : activeOfficers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      No active officers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  activeOfficers.map((officer) => (
                    <TableRow key={officer.id}>
                      <TableCell className="font-medium">{officer.name}</TableCell>
                      <TableCell>{officer.email || '-'}</TableCell>
                      <TableCell>{officer.department?.name || '-'}</TableCell>
                      <TableCell>{officer.subdepartment?.name || '-'}</TableCell>
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
                      <TableCell>{officer.department?.name || '-'}</TableCell>
                      <TableCell>{officer.subdepartment?.name || '-'}</TableCell>
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
