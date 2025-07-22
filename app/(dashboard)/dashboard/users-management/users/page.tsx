// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, UserStatus } from '@/types/user';
import { UserDialog } from './components/user-dialog';
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
import { fetchUsers, createUser, updateUser, deleteUser } from '@/app/(dashboard)/dashboard/users-management/users/components/users';



export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [inactiveUsers, setInactiveUsers] = useState<User[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  // Load users from the database
  useEffect(() => {
    const loadUsers = async () => {
      setIsLoading(true);
      try {
        const data = await fetchUsers();
        setUsers(data);
      } catch (error) {
        console.error('Error fetching users:', error);
        // Optionally show error to user
      } finally {
        setIsLoading(false);
      }
    };

    loadUsers();
  }, []);

  // Filter users by active status
  useEffect(() => {
    if (users.length > 0) {
      setActiveUsers(users.filter(user => {
        const status = user.status_history?.[0];
        return status?.status === 'active' && !status?.end_date;
      }));
      
      setInactiveUsers(users.filter(user => {
        const status = user.status_history?.[0];
        return status?.status === 'inactive' || status?.end_date;
      }));
    } else {
      setActiveUsers([]);
      setInactiveUsers([]);
    }
  }, [users]);

  const handleSaveUser = async (formData: any) => {
    setIsLoading(true);
    try {
      // Prepare the data for the API
      const userData = {
        ...formData,
        // Ensure status_history is properly formatted
        status_history: [{
          status: 'active',
          start_date: formData.status_history?.[0]?.start_date || new Date().toISOString(),
          end_date: formData.status_history?.[0]?.end_date || null
        }]
      };
      
      let savedUser;
      if (selectedUser) {
        savedUser = await updateUser(selectedUser.id, userData);
        setUsers(users.map(u => u.id === selectedUser.id ? savedUser : u));
      } else {
        savedUser = await createUser(userData);
        setUsers([...users, savedUser]);
      }
      
      setIsDialogOpen(false);
      setSelectedUser(undefined);
    } catch (error) {
      console.error('Error saving user:', error);
      // Optionally show error to user
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    setIsLoading(true);
    try {
      await deleteUser(userId);
      // Update local state
      setUsers(users.filter(user => user.id !== userId));
    } catch (error) {
      console.error('Error deleting user:', error);
      // Optionally show error to user
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to get status badge
  const getStatusBadge = (statusHistory: UserStatus[]) => {
    const isActive = statusHistory[0]?.status === 'active' && !statusHistory[0]?.end_date;
    return (
      <Badge variant={isActive ? 'default' : 'secondary'}>
        {isActive ? 'Active' : 'Inactive'}
      </Badge>
    );
  };

  // Helper function to render action buttons
  const renderActions = (user: User) => (
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
            setSelectedUser(user);
            setIsDialogOpen(true);
          }}
        >
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleDeleteUser(user.id!)}
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
        <h1 className="text-2xl font-bold">User Management</h1>
        <Button onClick={() => {
          setSelectedUser(undefined);
          setIsDialogOpen(true);
        }}>
          Add User
        </Button>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList>
          <TabsTrigger value="active">Active Users ({activeUsers.length})</TabsTrigger>
          <TabsTrigger value="inactive">Inactive Users ({inactiveUsers.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="active">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : activeUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      No active users found.
                    </TableCell>
                  </TableRow>
                ) : (
                  activeUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' ? 'default' : 'outline'}>
                          {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(user.status_history)}</TableCell>
                      <TableCell>{user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell>{renderActions(user)}</TableCell>
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
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : inactiveUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      No inactive users found.
                    </TableCell>
                  </TableRow>
                ) : (
                  inactiveUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' ? 'default' : 'outline'}>
                          {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(user.status_history)}</TableCell>
                      <TableCell>{user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell>{renderActions(user)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <UserDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleSaveUser}
        user={selectedUser}
        isLoading={isLoading}
      />
    </div>
  );
}
