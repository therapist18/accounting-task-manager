// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Plus, FileText } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"

// Import everything from the shared utility file
import {
  fetchTasks,
  fetchStages,
  type Task as UtilTask,
} from "../tasks/utils/taskManagerData"

type Department = {
  id: string | number;
  name: string;
  description?: string;
  entity_types?: string[];
  tm_subdepartments?: any[];
  // Add other department properties as needed
}

import { NewTaskDialog } from "../tasks/components/new-task-dialog"
import { DepartmentSidebar } from "../departments/main-shared-components/department-sidebar"
import { EnquiryDialog } from "../tasks/components/EnquiryDialog"
import { NewCompanyInquiryDialog } from "../tasks/components/NewCompanyInquiryDialog"
import { DeleteConfirmationDialog } from "../tasks/components/DeleteConfirmationDialog"
import { RequirementsTable } from "./RequirementsTable"
import { EnquiryTable } from "../tasks/components/EnquiryTable"
import { StageUploadDialog } from "../tasks/components/StageUploadDialog"
import { fetchDepartments } from "../departments/departments/database"
import { Badge } from "@/components/ui/badge"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { cn } from "@/lib/utils"


export default function TasksPage() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const sidebarPanelRef = useRef(null)
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tasks, setTasks] = useState<UtilTask[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedSubdepartment, setSelectedSubdepartment] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubclass, setSelectedSubclass] = useState<string>('');
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);
  const [enquiryDialogOpen, setEnquiryDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<UtilTask | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [stageUploadDialogOpen, setStageUploadDialogOpen] = useState(false);
  const [selectedStageTask, setSelectedStageTask] = useState<{ task: UtilTask, stage: any } | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [selectedTaskForDocuments, setSelectedTaskForDocuments] = useState<UtilTask | null>(null);
  const [isDocumentsDialogOpen, setIsDocumentsDialogOpen] = useState(false);
  const [companyInquiryDialogOpen, setCompanyInquiryDialogOpen] = useState(false);
  const [internalStaff, setInternalStaff] = useState({ users: [], officers: [] });
  const [taskToEdit, setTaskToEdit] = useState<UtilTask | null>(null);
  // --- Data Fetching Callbacks ---

  const handleSidebarToggle = useCallback(() => {
    const panel = sidebarPanelRef.current
    if (panel) {
      if (isSidebarCollapsed) {
        panel.expand()
      } else {
        panel.collapse()
      }
    }
  }, [isSidebarCollapsed])

  const loadTasksAndStages = useCallback(async (departmentId: string, subdepartmentId?: string) => {
    if (!departmentId || departments.length === 0) return;
    try {
      const tasksData = await fetchTasks(departmentId, subdepartmentId);
      const stagesData = await fetchStages(departmentId, departments);
      setTasks(tasksData);
      setStages(stagesData);
    } catch (error) {
      console.error("Failed to load tasks and stages:", error);
      // Optionally, show a toast notification on error
      toast({
        title: "Error",
        description: "Could not load tasks. Please try again.",
        variant: "destructive",
      });
    }
  }, [departments]);

  // --- Effects ---
  useEffect(() => {
    const performInitialLoad = async () => {
      const departmentsData = await fetchDepartments();
      console.log('🔹 [Departments Loaded]:', departmentsData);
      setDepartments(departmentsData);
    };
    performInitialLoad();
  }, []);

  useEffect(() => {
    if (selectedDepartment) {
      loadTasksAndStages(selectedDepartment, selectedSubdepartment);
    } else {
      setTasks([]);
      setStages([]);
    }
  }, [selectedDepartment, selectedSubdepartment, loadTasksAndStages]);

  useEffect(() => {
    const fetchStaff = async () => {
      console.group('🔹 [Parent Component] Fetching Staff Data');
      try {
        console.log('🔹 [Parent] Attempting to fetch from registry_users table...');
        const { data: staff, error } = await supabase.from('registry_users').select('id, full_name').order('full_name');

        console.log('🔹 [Parent] Staff fetch result:', {
          data: staff,
          error,
          dataLength: staff?.length || 0
        });

        if (error) {
          console.error('🔹 [Parent] Error fetching staff:', error);
        }

        // If your schema differentiates officers, filter here or fetch separately
        const staffData = {
          users: staff || [],
          officers: staff || [] // Assuming same table for this example
        };

        console.log('🔹 [Parent] Setting internal staff state:', staffData);
        setInternalStaff(staffData);
      } catch (err) {
        console.error('🔹 [Parent] Unexpected error fetching staff:', err);
        setInternalStaff({ users: [], officers: [] });
      }
      console.groupEnd();
    };
    fetchStaff();
  }, []);

  // --- Filtering and Memoization ---
  const getFilteredTasks = useCallback((status?: string | string[]) => {
    let filtered = [...tasks];
    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      filtered = filtered.filter(task => statuses.includes(task.status));
    }
    const idsMatch = (id1: any, id2: any) => (id1 !== undefined && id2 !== undefined) ? String(id1) === String(id2) : false;
    if (selectedClass) {
      filtered = filtered.filter(task => idsMatch(task.class_id, selectedClass));
    }
    if (selectedSubclass) {
      filtered = filtered.filter(task => idsMatch(task.subclass_id, selectedSubclass));
    }
    return filtered;
  }, [tasks, selectedClass, selectedSubclass]);

  const enquiryTasks = useMemo(() => getFilteredTasks('enquiry'), [getFilteredTasks]);
  const wipTasks = useMemo(() => getFilteredTasks('in_progress'), [getFilteredTasks]);
  const completedTasks = useMemo(() => getFilteredTasks('completed'), [getFilteredTasks]);

  const { dept, subdept, cls, subcls } = useMemo(() => {
    const d = departments.find(d => String(d.id) === selectedDepartment);
    const sd = d?.tm_subdepartments?.find(s => String(s.id) === selectedSubdepartment);
    const c = sd?.classes?.find(c => String(c.id) === selectedClass);
    const sc = c?.subClasses?.find(sc => String(sc.id) === selectedSubclass);

    // Debug log to check department entity_types
    if (d) {
      console.log('Department:', {
        id: d.id,
        name: d.name,
        entity_types: d.entity_types,
        hasEntityTypes: 'entity_types' in d
      });
    }

    return {
      dept: d || null,
      subdept: sd || null,
      cls: c || null,
      subcls: sc || null
    };
  }, [departments, selectedDepartment, selectedSubdepartment, selectedClass, selectedSubclass]);

  // --- Event Handlers ---
  const handleDeptClick = (deptId: string) => {
    setSelectedDepartment(deptId);
    setSelectedSubdepartment('');
    setSelectedClass('');
    setSelectedSubclass('');
  };

  const handleSubdeptClick = (deptId: string, subdeptId: string) => {
    setSelectedDepartment(deptId);
    setSelectedSubdepartment(subdeptId);
    setSelectedClass('');
    setSelectedSubclass('');
  };

  const handleClassClick = (deptId: string, subdeptId: string, classId: string) => {
    setSelectedDepartment(deptId);
    setSelectedSubdepartment(subdeptId);
    setSelectedClass(classId);
    setSelectedSubclass('');
  };

  const handleSubclassClick = (deptId: string, subdeptId: string, classId: string, subclassId: string) => {
    setSelectedDepartment(deptId);
    setSelectedSubdepartment(subdeptId);
    setSelectedClass(classId);
    setSelectedSubclass(subclassId);
  };

  const handleTaskAction = (action: 'edit' | 'delete', task: UtilTask) => {
    if (action === 'delete') {
      setTaskToDelete(task);
      setDeleteDialogOpen(true);
    } else if (action === 'edit') {
      setTaskToEdit(task);
      // Determine which dialog to open based on department entity_types
      const currentDept = departments.find(d => String(d.id) === String(task.job_level?.department_id));
      if (currentDept?.entity_types?.includes('company')) {
        setCompanyInquiryDialogOpen(true);
      } else {
        setEnquiryDialogOpen(true);
      }
    }
  };

  const handleEnquiryDialogOpenChange = (isOpen: boolean) => {
    setEnquiryDialogOpen(isOpen);
    if (!isOpen) setTaskToEdit(null);
  };

  const handleDeleteConfirm = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('tm_tasks').delete().eq('id', taskToDelete.id);
      if (error) throw error;

      // Update tasks state to remove the deleted task
      setTasks(prev => prev.filter(t => t.id !== taskToDelete.id));

      // Show success toast with task details
      toast({
        title: 'Task Deleted Successfully',
        description: `Task "${taskToDelete.name || taskToDelete.title || 'Unknown'}" has been deleted.`
      });

      // Close dialog and reset state
      setDeleteDialogOpen(false);
      setTaskToDelete(null);
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Error Deleting Task',
        description: error.message || 'Failed to delete task. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEnquiryCreated = async (newEnquiry: UtilTask | UtilTask[], isEdit = false) => {
    const newEnquiries = Array.isArray(newEnquiry) ? newEnquiry : [newEnquiry];

    // Show success toast with more specific information
    toast({
      title: "Success",
      description: `${isEdit ? "Task updated" : "New enquiry/enquiries created"} successfully.`
    });

    // Refresh tasks and stages to get updated data
    try {
      console.log('🔹 [handleEnquiryCreated] Refreshing data after submission...');
      await loadTasksAndStages(selectedDepartment, selectedSubdepartment);
      
      // Log the updated state for debugging
      console.log('🔹 [handleEnquiryCreated] Data refreshed successfully', {
        newEnquiriesCount: newEnquiries.length,
        isEdit,
        selectedDepartment,
        selectedSubdepartment
      });
      
    } catch (error) {
      console.error("Failed to refresh data after enquiry creation:", error);
      
      // Provide more detailed error feedback
      toast({
        title: "Warning",
        description: "Task was saved but failed to refresh data automatically. Please refresh the page to see the latest updates.",
        variant: "destructive"
      });
    }
  };

  const handleStageStatusSave = async (stageId: string, taskId: string, date: string) => {
    const task = tasks.find(t => t.id.toString() === taskId);
    if (!task) return;

    const updatedStages = { ...task.stages, [stageId]: { date, status: 'completed', completedAt: new Date().toISOString() } };
    const { error } = await supabase.from('tm_tasks').update({ stages: updatedStages }).eq('id', taskId);

    if (error) {
      toast({ title: "Error saving stage", variant: "destructive" });
    } else {
      setTasks(prev => prev.map(t => t.id.toString() === taskId ? { ...t, stages: updatedStages } : t));
    }
  };

  const handleStageDocumentUpload = (task: UtilTask, stage: any) => {
    setSelectedStageTask({ task, stage });
    setStageUploadDialogOpen(true);
  };

  const handleDeleteDocument = async (document: any) => {
    if (!document?.id) {
      toast({ title: 'Error', description: 'Document ID is required for deletion', variant: 'destructive' });
      return;
    }

    try {
      // Determine which table to delete from based on document structure
      const isCompanyDocument = document.company_id || document.kyc_document_id;
      const tableName = isCompanyDocument ? 'acc_portal_kyc_uploads' : 'acc_portal_directors_documents';
      const idField = isCompanyDocument ? 'id' : 'id';

      // Delete from storage bucket first
      if (document.file_path) {
        const { error: storageError } = await supabase.storage
          .from('kyc-documents')
          .remove([document.file_path]);

        if (storageError) {
          console.error('Storage delete error:', storageError);
          toast({
            title: 'Warning',
            description: 'Document deleted from database but failed to delete from storage',
            variant: 'destructive'
          });
        }
      }

      // Delete from database
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq(idField, document.id);

      if (error) {
        console.error('Delete error:', error);
        toast({
          title: 'Error deleting document',
          description: error.message || 'Failed to delete document',
          variant: 'destructive'
        });
        return;
      }

      toast({ title: 'Success', description: 'Document deleted successfully' });

      // Refresh tasks and stages to update the UI
      await loadTasksAndStages(selectedDepartment, selectedSubdepartment);

    } catch (error) {
      console.error('Unexpected error during deletion:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while deleting the document',
        variant: 'destructive'
      });
    }
  };

  const handleNewEnquiryClick = () => {
    console.log('🔹 [handleNewEnquiryClick] Triggered');
    console.log('   [handleNewEnquiryClick] Selected Department ID:', selectedDepartment);
    console.log('   [handleNewEnquiryClick] Available Departments:', departments);

    if (!selectedDepartment) {
      console.warn('⚠️ [handleNewEnquiryClick] No department selected');
      toast({
        title: "Department Not Selected",
        description: "Please select a department before creating an enquiry.",
        variant: "destructive"
      });
      return;
    }

    const currentDept = departments.find(d => String(d.id) === selectedDepartment || d.id === Number(selectedDepartment));
    console.log('   [handleNewEnquiryClick] Found Department:', currentDept);

    if (!currentDept) {
      console.error('❌ [handleNewEnquiryClick] Department not found with ID:', selectedDepartment);
      toast({
        title: "Department Not Found",
        description: `The selected department (ID: ${selectedDepartment}) could not be found.`,
        variant: "destructive"
      });
      return;
    }

    const entityTypes = currentDept.entity_types || [];
    console.log('   [handleNewEnquiryClick] Department Entity Types:', entityTypes);

    if (entityTypes.includes('company')) {
      console.log('   [handleNewEnquiryClick] Opening Company Inquiry Dialog');
      setCompanyInquiryDialogOpen(true);
    } else {
      console.log('   [handleNewEnquiryClick] Opening Individual Enquiry Dialog');
      setEnquiryDialogOpen(true);
    }
  };

  // --- Render Logic ---
  const getDisplayTitle = () => {
    if (subcls) return `${subcls.name} (${cls?.name} - ${subdept?.name})`;
    if (cls) return `${cls.name} (${subdept?.name})`;
    if (subdept) return subdept.name || '';
    if (dept) return dept.name || '';
    return 'Task Management';
  };

  return (
    <div className="h-screen w-full overflow-hidden bg-background">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel
          ref={sidebarPanelRef}
          defaultSize={20}
          minSize={15}
          maxSize={25}
          collapsible={true}
          onCollapse={() => setIsSidebarCollapsed(true)}
          onExpand={() => setIsSidebarCollapsed(false)}
          className={cn(
            isSidebarCollapsed ? "min-w-[60px] transition-all duration-300" : "transition-all duration-300"
          )}
        >
          <DepartmentSidebar
            departments={departments}
            activeDept={selectedDepartment}
            activeSubdept={selectedSubdepartment}
            activeClass={selectedClass}
            activeSubclass={selectedSubclass}
            onDeptClick={handleDeptClick}
            onSubdeptClick={handleSubdeptClick}
            onClassClick={handleClassClick}
            onSubclassClick={handleSubclassClick}
            expandedItems={expandedItems}
            onToggleExpand={(key) => setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }))}
            // Pass collapsed state props
            isCollapsed={isSidebarCollapsed}
            onCollapseToggle={handleSidebarToggle}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={80}>
          <main className="h-full flex flex-col overflow-hidden">
            <div className="h-full overflow-auto p-4 space-y-4">
              <header className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Task Management</h2>
                  <p className="text-muted-foreground">
                    {dept?.name} {subdept && `> ${subdept.name}`} {cls && `> ${cls.name}`} {subcls && `> ${subcls.name}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleNewEnquiryClick}
                  disabled={!selectedDepartment}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {(() => {
                    if (!selectedDepartment) return 'New Enquiry';
                    const currentDept = departments.find(d => String(d.id) === selectedDepartment || d.id === Number(selectedDepartment));
                    console.log('🔹 [Button] Current Department:', currentDept);
                    const entityTypes = currentDept?.entity_types || [];
                    console.log('🔹 [Button] Department Entity Types:', entityTypes);
                    return entityTypes.includes('company') ? 'New Company Enquiry' : 'New Individual Enquiry';
                  })()}
                </Button>
              </header>

              {!selectedDepartment ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Task Management Dashboard</CardTitle>
                    <CardDescription>Select a department from the sidebar to get started</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 text-center py-8">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Choose a department to view and manage tasks.</p>
                  </CardContent>
                </Card>
              ) : (enquiryTasks.length > 0 || wipTasks.length > 0 || completedTasks.length > 0) ? (
                <Tabs defaultValue="enquiries" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="enquiries">
                      Enquiries
                      <Badge variant="secondary" className="ml-2">{enquiryTasks.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="wip">
                      Work-in-Progress
                      <Badge variant="secondary" className="ml-2">{wipTasks.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="completed">
                      Completed
                      <Badge variant="secondary" className="ml-2">{completedTasks.length}</Badge>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="enquiries">
                    <RequirementsTable
                      tasks={enquiryTasks}
                      loading={false}
                      error={null}
                      handleDeleteDocument={handleDeleteDocument}
                      onTaskAction={handleTaskAction} // ADD THIS
                    />
                  </TabsContent>
                  <TabsContent value="wip">
                    <RequirementsTable
                      tasks={wipTasks}
                      loading={false}
                      error={null}
                      handleDeleteDocument={handleDeleteDocument}
                      onTaskAction={handleTaskAction} // ADD THIS
                    />
                  </TabsContent>
                  <TabsContent value="completed">
                    <RequirementsTable
                      tasks={completedTasks}
                      loading={false}
                      error={null}
                      handleDeleteDocument={handleDeleteDocument}
                      onTaskAction={handleTaskAction} // ADD THIS
                    />
                  </TabsContent>
                </Tabs>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>{getDisplayTitle()}</CardTitle>
                    <CardDescription>No tasks found for the current selection. Try selecting a class or subclass from the sidebar.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 text-center py-8">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No tasks available for the current selection.</p>
                  </CardContent>
                </Card>
              )}

              {/* Debug logging for props being passed */}
              {(() => {
                console.log('🔹 [Parent Component] EnquiryDialog Props:', {
                  open: enquiryDialogOpen,
                  departmentsLength: departments?.length,
                  usersLength: internalStaff.users?.length,
                  officersLength: internalStaff.officers?.length,
                  internalStaffState: internalStaff
                });
                return null;
              })()}
            </div>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
      <DeleteConfirmationDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={handleDeleteConfirm} loading={isDeleting} />
      <StageUploadDialog open={stageUploadDialogOpen} onOpenChange={setStageUploadDialogOpen} selectedStageTask={selectedStageTask} />

      <NewCompanyInquiryDialog
        open={companyInquiryDialogOpen}
        onOpenChange={(isOpen) => {
          console.log('🔹 [CompanyInquiryDialog] Open State Changed:', isOpen);
          setCompanyInquiryDialogOpen(isOpen);
          if (!isOpen) {
            // Reset the selected department when dialog is closed
            setSelectedDepartment('');
          }
        }}
        onEnquiryCreated={(enquiries) => {
          handleEnquiryCreated(enquiries, false);
        }}
        departments={departments}
        selectedDepartmentId={selectedDepartment}
        selectedSubdepartmentId={selectedSubdepartment}
        selectedClassId={selectedClass}
        users={[]}
        officers={[]}
        key={`company-dialog-${selectedDepartment}-${selectedSubdepartment}-${selectedClass}`} // Force re-render when any selection changes
      />

      <EnquiryDialog
        open={enquiryDialogOpen}
        onOpenChange={setEnquiryDialogOpen}
        taskToEdit={taskToEdit} // PASS STATE HERE
        onEnquiryCreated={(updatedTask) => {
          handleEnquiryCreated(updatedTask, !!taskToEdit);
        }}
        departments={departments}
        users={internalStaff.users}       // Pass real data
        officers={internalStaff.officers} // Pass real data
        selectedDepartment={selectedDepartment}
        selectedSubdepartment={selectedSubdepartment}
        selectedClass={selectedClass}
        selectedSubclass={selectedSubclass}
        key={`enquiry-dialog-${selectedDepartment}-${selectedSubdepartment}-${selectedClass}`}
      />
    </div>
  );
}