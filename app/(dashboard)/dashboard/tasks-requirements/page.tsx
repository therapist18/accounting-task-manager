// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Loader2, Plus, FileText, CheckCheckIcon } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"

// Import everything from the shared utility file
import {
  fetchTasks,
  fetchStages,
  type Task as UtilTask,
  type Department,
} from "../tasks/utils/taskManagerData"

import { StagesTable } from "../tasks/components/StagesTable"
import { NewTaskDialog } from "../tasks/components/new-task-dialog"
import { DepartmentSidebar } from "../departments/main-shared-components/department-sidebar"
import { EnquiryDialog } from "../tasks/components/EnquiryDialog"
import { DeleteConfirmationDialog } from "../tasks/components/DeleteConfirmationDialog"
import { RequirementsTable } from "../tasks/department-wise/RequirementsTable"
import { EnquiryTable } from "../tasks/components/EnquiryTable"
import { UploadRequirementsDialog } from "../tasks/department-wise/UploadRequirementsDialog"
import { StageUploadDialog } from "../tasks/components/StageUploadDialog"
import { fetchDepartments } from "../departments/departments/database"


export default function TasksPage() {
  // --- State Management ---
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tasks, setTasks] = useState<UtilTask[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState({ departments: true, tasks: false });
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
  const [selectedTaskForUpload, setSelectedTaskForUpload] = useState<UtilTask | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [selectedTaskForDocuments, setSelectedTaskForDocuments] = useState<UtilTask | null>(null);
  const [isDocumentsDialogOpen, setIsDocumentsDialogOpen] = useState(false);

  // --- Data Fetching Callbacks ---
  const loadTasksAndStages = useCallback(async (departmentId: string, subdepartmentId?: string) => {
    if (!departmentId || departments.length === 0) return;
    setDataLoading(prev => ({ ...prev, tasks: true }));
    try {
      const tasksData = await fetchTasks(departmentId, subdepartmentId);
      const stagesData = await fetchStages(departmentId, departments);
      setTasks(tasksData);
      setStages(stagesData);
    } finally {
      setDataLoading(prev => ({ ...prev, tasks: false }));
    }
  }, [departments]);

  // --- Effects ---
  useEffect(() => {
    const performInitialLoad = async () => {
      setDataLoading({ departments: true, tasks: false });
      const departmentsData = await fetchDepartments();
      setDepartments(departmentsData);
      setDataLoading(prev => ({ ...prev, departments: false }));
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

  // --- Filtering and Memoization ---
  const getFilteredTasks = useCallback((status?: string) => {
    let filtered = [...tasks];
    if (status) {
      filtered = filtered.filter(task => task.status === status);
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

  const getCurrentRequirements = useCallback(() => {
    if (!selectedDepartment) return [];
    const dept = departments.find(d => d.id.toString() === selectedDepartment);
    const subdept = dept?.tm_subdepartments?.find(s => s.id.toString() === selectedSubdepartment);
    const cls = subdept?.classes?.find(c => c.id.toString() === selectedClass);
    const subcls = cls?.subClasses?.find(sc => sc.id.toString() === selectedSubclass);

    if (subcls) return subcls.requirements || [];
    if (cls) return cls.requirements || [];
    if (subdept) return subdept.requirements || [];
    if (dept) return dept.requirements || [];
    return [];
  }, [departments, selectedDepartment, selectedSubdepartment, selectedClass, selectedSubclass]);

  // ========= FIX: MOVED THIS useMemo HOOK TO THE TOP =========
  // This hook must be called on every render, before any conditional returns.
  const { dept, subdept, cls, subcls } = useMemo(() => {
    const d = departments.find(d => d.id.toString() === selectedDepartment);
    const sd = d?.tm_subdepartments?.find(s => s.id.toString() === selectedSubdepartment);
    const c = sd?.classes?.find(c => c.id.toString() === selectedClass);
    const sc = c?.subClasses?.find(sc => sc.id.toString() === selectedSubclass);
    return { dept: d, subdept: sd, cls: c, subcls: sc };
  }, [departments, selectedDepartment, selectedSubdepartment, selectedClass, selectedSubclass]);
  // ===================== END OF FIX =======================

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
    }
  };

  const handleDeleteConfirm = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('tm_tasks').delete().eq('id', taskToDelete.id);
      if (error) throw error;
      setTasks(prev => prev.filter(t => t.id !== taskToDelete.id));
      toast({ title: 'Task deleted successfully.' });
    } catch (error) {
      toast({ title: 'Error deleting task.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setTaskToDelete(null);
    }
  };

  const handleEnquiryCreated = (newEnquiry: UtilTask) => {
    setTasks(prev => [newEnquiry, ...prev]);
    toast({ title: "Success", description: "New enquiry created." });
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

  const handleShowUploadDialog = (task: UtilTask) => {
    setSelectedTaskForUpload(task);
    setShowUploadDialog(true);
  };
  const handleViewDocuments = (task: UtilTask) => {
    setSelectedTaskForUpload(task);
    setShowUploadDialog(true);
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig?.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // --- Render Logic ---
  if (dataLoading.departments) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading Workspace...</p>
        </div>
      </div>
    );
  }

  const getDisplayTitle = () => {
    if (subcls) return `${subcls.name} (${cls?.name} - ${subdept?.name})`;
    if (cls) return `${cls.name} (${subdept?.name})`;
    if (subdept) return subdept.name || '';
    if (dept) return dept.name || '';
    return 'Task Management';
  };

  return (
    <div className="flex h-screen bg-slate-50/50">
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
      />

      <main className="flex-1 overflow-hidden">
        <div className="h-full overflow-auto p-4 space-y-4">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Task Management</h2>
              <p className="text-muted-foreground">
                {dept?.name} {subdept && `> ${subdept.name}`} {cls && `> ${cls.name}`} {subcls && `> ${subcls.name}`}
              </p>
            </div>
          </header>

          {dataLoading.tasks ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="mt-4 text-muted-foreground">Loading tasks...</p>
              </div>
            </div>
          ) : !selectedDepartment ? (
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
          ) : (selectedClass || selectedSubclass) ? (
            <Tabs defaultValue="stages" className="space-y-4">
              <TabsList>
                <TabsTrigger value="stages"><FileText className="h-4 w-4 mr-2" />Stages</TabsTrigger>
                <TabsTrigger value="upload-requirements"><CheckCheckIcon className="h-4 w-4 mr-2" />Requirements Checklist</TabsTrigger>
              </TabsList>

              <TabsContent value="stages">
                <Card>
                  <CardHeader>
                    <CardTitle>Stages Progress - {getDisplayTitle()}</CardTitle>
                    <CardDescription>Track tasks through various stages of completion.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4">
                    <StagesTable
                      tasks={wipTasks}
                      loading={dataLoading.tasks}
                      onTaskAction={handleTaskAction}
                      onStageDocumentUpload={handleStageDocumentUpload}
                      handleStageStatusSave={handleStageStatusSave}
                      onShowUploadDialog={handleViewDocuments}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="upload-requirements">
                <Card>
                  <CardHeader>
                    <CardTitle>Requirements Checklist - {getDisplayTitle()}</CardTitle>
                    <CardDescription>Manage document requirements for this selection.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4">
                    <RequirementsTable
                      tasks={wipTasks}
                      loading={dataLoading.tasks}
                      onTaskAction={handleTaskAction}
                      onShowUploadDialog={handleShowUploadDialog}
                      requirements={getCurrentRequirements()}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{getDisplayTitle()}</CardTitle>
                <CardDescription>Select a class or subclass from the sidebar to view tasks.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 text-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No class selected.</p>
              </CardContent>
            </Card>
          )}

          {/* Dialogs */}
          <NewTaskDialog open={newTaskDialogOpen} onOpenChange={setNewTaskDialogOpen} onCreate={handleEnquiryCreated} />
          <EnquiryDialog open={enquiryDialogOpen} onOpenChange={setEnquiryDialogOpen} onEnquiryCreated={handleEnquiryCreated} />
          <DeleteConfirmationDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onConfirm={handleDeleteConfirm} loading={isDeleting} />
          <StageUploadDialog open={stageUploadDialogOpen} onOpenChange={setStageUploadDialogOpen} selectedStageTask={selectedStageTask} />
          <UploadRequirementsDialog
            open={showUploadDialog}
            onClose={() => setShowUploadDialog(false)}
            task={selectedTaskForUpload}
            requirements={getCurrentRequirements()}
            onUploadComplete={() => {
              // Refresh the tasks data when upload is complete
              if (selectedDepartment) {
                loadTasksAndStages(selectedDepartment, selectedSubdepartment);
              }
            }}
          />
        </div>
      </main>
    </div>
  );
}