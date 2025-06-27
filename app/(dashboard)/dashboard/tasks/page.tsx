// @ts-nocheck
"use client"

import { useCallback, useEffect, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Plus, FileText, Upload } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import type { Stage, Department } from "@/lib/supabase/departments"
import { StageUploadDialog } from "./components/StageUploadDialog"
import { UploadRequirementsDialog } from "./components/UploadRequirementsDialog"
import { TaskTable } from "./components/TaskTable"
import { StageTransitionDialog } from "@/components/stage-transition-dialog"
import { NewTaskDialog } from "@/app/(dashboard)/dashboard/tasks/components/new-task-dialog"
import { getTasks, updateTaskAssignment } from "@/lib/supabase/tasks"
import { getStages } from "@/lib/supabase/stages"
import { fetchDepartments } from "../departments/departments/database"
import { DepartmentSidebar } from "../departments/main-shared-components/department-sidebar"
import DocumentPreviewDialog from "../applications/components/document-preview-dialog"

const fuzzyMatch = (str1: string, str2: string, threshold = 0.8): boolean => {
  if (!str1 || !str2) return false;

  const normalize = (str: string) =>
    str.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const normalizedStr1 = normalize(str1);
  const normalizedStr2 = normalize(str2);

  if (normalizedStr1 === normalizedStr2) return true;

  if (normalizedStr1.includes(normalizedStr2) || normalizedStr2.includes(normalizedStr1)) {
    return true;
  }

  const distance = (a: string, b: string): number => {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i += 1) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j += 1) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j += 1) {
      for (let i = 1; i <= a.length; i += 1) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[b.length][a.length];
  };

  const maxLength = Math.max(normalizedStr1.length, normalizedStr2.length);
  if (maxLength === 0) return false;

  const similarity = (maxLength - distance(normalizedStr1, normalizedStr2)) / maxLength;
  return similarity >= threshold;
};

type Task = Database['public']['Tables']['tm_tasks']['Row'] & {
  department?: {
    id: number;
    name: string;
    description?: string | null;
    created_at?: string;
    updated_at?: string;
    stages?: Array<{
      id: string;
      name: string;
      description: string;
      documents: Array<any>;
      follow_up: string;
      isSpecial: boolean;
      order_num: number;
      allocations: Record<string, any>;
      estimated_time: number;
    }>;
  } | null;
  subdepartment?: any;
  task_manager?: any;
  task_assistant?: any;
  officer?: any;
  current_stage?: any;
  applicant_name?: string | null;
  r_number?: string | null;
  class_id?: string | null;
  subclass_id?: string | null;
  renewal_status?: 'New' | 'Renewal' | null;
  account_used?: string | null;
  applied_by?: string | null;
  batch?: string | null;
  principal_member_name?: string | null;
  current_stage_started_at?: string | null;
  created_at: string;
  updated_at: string;
  status: string;
  job_description: string;
  date_initiated: string | null;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string | null; role?: string }[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stageTransitionDialogOpen, setStageTransitionDialogOpen] = useState(false);
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedSubdepartment, setSelectedSubdepartment] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubclass, setSelectedSubclass] = useState<string>('');
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [stageUploadDialogOpen, setStageUploadDialogOpen] = useState(false);
  const [selectedStageTask, setSelectedStageTask] = useState<{ task: Task, stage: any } | null>(null);
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [applicantDocuments, setApplicantDocuments] = useState<Record<number, any[]>>({});
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [documentReviewOpen, setDocumentReviewOpen] = useState(false)
  const [reviewDocument, setReviewDocument] = useState<any>(null)
  // Define requirement columns
  const requirementColumns = [
    { key: 'index', header: '#', width: '50px' },
    { key: 'website', header: 'Website', width: '120px' },
    { key: 'job_description', header: 'Job', width: '150px' },
    { key: 'task_manager', header: 'Task Manager', width: '120px' },
    { key: 'task_assistant', header: 'Task Assistant', width: '120px' },
    { key: 'officer', header: 'Officer', width: '120px' },
    { key: 'applicant_name', header: 'Applicant Name', width: '150px' },
    { key: 'company_name', header: 'Company Name', width: '150px' },
    { key: 'renewal_status', header: 'New/Renewal', width: '120px' },
    { key: 'account_used', header: 'Account Used', width: '120px' },
    { key: 'applied_by', header: 'Applied by Who', width: '120px' },
    { key: 'batch', header: 'Batch', width: '100px' },
  ];

  // Define stage columns
  const stageColumns = [
    { key: 'index', header: '#', width: '50px' },
    { key: 'website', header: 'Website', width: '120px' },
    { key: 'job_description', header: 'Job', width: '150px' },
    { key: 'task_manager', header: 'Task Manager', width: '120px' },
    { key: 'task_assistant', header: 'Task Assistant', width: '120px' },
    { key: 'officer', header: 'Officer', width: '120px' },
    { key: 'applicant_name', header: 'Applicant Name', width: '150px' },
    { key: 'principal_member_name', header: 'Principal Member Name', width: '180px' },
    { key: 'company_name', header: 'Company Name', width: '150px' },
    {
      key: 'documents',
      header: 'All Submitted Documents',
      width: '80px'
    },
    { key: 'renewal_status', header: 'New/Renewal', width: '120px' },
    { key: 'account_used', header: 'Account Used', width: '120px' },
    { key: 'applied_by', header: 'Applied by Who', width: '120px' },
    { key: 'batch', header: 'Batch', width: '100px' },
    {
      key: 'actions',
      header: 'Actions',
      width: '120px'
    }
  ];

  // Transform departments data
  const transformDepartments = useCallback((depts: any[]) => {
    if (!depts || !Array.isArray(depts)) {
      console.error('Invalid departments data:', depts);
      return [];
    }

    return depts.map(dept => {
      if (!dept) return null;

      const transformedDept = {
        ...dept,
        id: String(dept.id),
        tm_subdepartments: Array.isArray(dept.tm_subdepartments)
          ? dept.tm_subdepartments
            .filter(Boolean)
            .map(subDept => ({
              ...subDept,
              id: String(subDept.id),
              department_id: String(subDept.department_id || dept.id),
              classes: Array.isArray(subDept.classes)
                ? subDept.classes
                  .filter(Boolean)
                  .map(cls => ({
                    ...cls,
                    id: String(cls.id),
                    subdepartment_id: String(subDept.id),
                    subClasses: Array.isArray(cls.subClasses)
                      ? cls.subClasses
                        .filter(Boolean)
                        .map(subCls => ({
                          ...subCls,
                          id: String(subCls.id),
                          class_id: String(cls.id)
                        }))
                      : []
                  }))
                : []
            }))
          : []
      };

      return transformedDept;
    }).filter(Boolean);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        const [tasksData, deptsData, usersData, stagesData] = await Promise.all([
          getTasks(),
          fetchDepartments(),
          supabase.from('tm_users').select('id, name, email, role'),
          getStages(),
        ]);

        const transformedDepts = transformDepartments(deptsData);

        setTasks(tasksData);
        setDepartments(transformedDepts);
        setUsers(usersData);
        setStages(stagesData);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [transformDepartments]);

  // Get filtered tasks based on selected department/subdepartment/class/subclass
  const getFilteredTasks = useCallback((status?: string) => {
    if (!selectedDepartment && !selectedSubdepartment && !selectedClass && !selectedSubclass) {
      return status ? tasks.filter(task => task.status === status) : [...tasks];
    }

    const idsMatch = (id1: any, id2: any): boolean => {
      if (id1 === undefined || id2 === undefined) return false;
      return String(id1) === String(id2);
    };

    return tasks.filter(task => {
      if (selectedDepartment) {
        const deptMatch = idsMatch(task.department?.id, selectedDepartment);
        if (!deptMatch) return false;
      }

      if (selectedSubdepartment) {
        const subdeptMatch = idsMatch(task.subdepartment?.id, selectedSubdepartment);
        if (!subdeptMatch) return false;
      }

      if (selectedClass) {
        const classMatch = idsMatch(task.class_id, selectedClass);
        if (!classMatch) return false;
      }

      if (selectedSubclass) {
        const subclassMatch = idsMatch(task.subclass_id, selectedSubclass);
        if (!subclassMatch) return false;
      }

      return true;
    });
  }, [tasks, selectedDepartment, selectedSubdepartment, selectedClass, selectedSubclass]);

  const filteredTasks = useMemo(() => {
    return getFilteredTasks();
  }, [getFilteredTasks]);

  // Get current requirements
  const getCurrentRequirements = useCallback(() => {
    if (selectedSubclass) {
      const subclass = departments
        .flatMap(d => d.tm_subdepartments || [])
        .flatMap(sd => sd.classes || [])
        .flatMap(c => c.subClasses || [])
        .find(sc => String(sc.id) === String(selectedSubclass));

      return subclass?.requirements || [];
    } else if (selectedClass) {
      let cls = departments
        .flatMap(d => d.tm_subdepartments || [])
        .flatMap(sd => sd.classes || [])
        .find(c => String(c.id) === String(selectedClass));

      if (!cls) {
        cls = departments
          .flatMap(d => d.tm_subdepartments || [])
          .flatMap(sd => sd.classes || [])
          .find(c => c.name === selectedClass);
      }

      return cls?.requirements || [];
    } else if (selectedSubdepartment) {
      const subdept = departments
        .flatMap(d => d.tm_subdepartments || [])
        .find(sd => String(sd.id) === String(selectedSubdepartment));

      return subdept?.requirements || [];
    } else if (selectedDepartment) {
      const dept = departments.find(d => String(d.id) === String(selectedDepartment));
      return dept?.requirements || [];
    }

    return [];
  }, [departments, selectedDepartment, selectedSubdepartment, selectedClass, selectedSubclass]);

  // Generate columns for stages view
  const generateStageColumns = useCallback(() => {
    const baseColumns = stageColumns
      .slice(0, stageColumns.findIndex(col => col.key === 'renewal_status') + 1)
      .filter(col => columnVisibility[col.key] !== false);

    const movedColumns = stageColumns
      .slice(
        stageColumns.findIndex(col => col.key === 'account_used'),
        stageColumns.findIndex(col => col.key === 'batch') + 1
      )
      .filter(col => ['account_used', 'applied_by', 'batch'].includes(col.key) &&
        columnVisibility[col.key] !== false);

    const endColumns: any[] = [];

    const noStagesColumn = {
      key: 'no_stages',
      header: 'Stages',
      width: '150px',
      parentHeader: 'Stages',
      sortable: false,
      render: () => (
        <div className="text-center text-muted-foreground text-sm">
          No stages configured
        </div>
      )
    };

    const currentDept = departments.find(d => d.id === selectedDepartment);
    const currentSubdept = currentDept?.tm_subdepartments?.find(s => s.id === selectedSubdepartment);

    if (!currentDept?.stages) {
      return [...baseColumns, noStagesColumn, ...endColumns];
    }

    const applicableStages = currentDept.stages.filter(stage => {
      if (!currentSubdept) return true;

      const subdeptStageConfig = currentSubdept.stages?.find(s => s.stage_id === stage.id);
      if (!subdeptStageConfig?.applicable) return false;
      if (!subdeptStageConfig?.display) return false;

      if (selectedClass) {
        const currentClass = currentSubdept.classes?.find(c => c.name === selectedClass);
        if (currentClass) {
          const classStageConfig = currentClass.stages?.find(s => s.stage_id === stage.id);
          if (classStageConfig && !classStageConfig.applicable) return false;
          if (classStageConfig && !classStageConfig.display) return false;
        }
      }

      return true;
    });

    const stageColumnsList = applicableStages
      .filter(stage => columnVisibility[`stage_${stage.name.toLowerCase().replace(/\s+/g, '_')}`] !== false)
      .map(stage => ({
        key: `stage_${stage.name.toLowerCase().replace(/\s+/g, '_')}`,
        header: stage.name,
        width: '150px',
        parentHeader: 'Stages',
        sortable: true,
        stage: stage // Pass the stage object for rendering
      }));

    return [
      ...baseColumns,
      ...stageColumnsList,
      ...movedColumns.map(col => ({
        ...col,
        parentHeader: 'Additional Info'
      })),
      ...endColumns
    ];
  }, [departments, selectedDepartment, selectedSubdepartment, selectedClass, columnVisibility]);

  // Generate columns for requirements view
  const generateRequirementColumns = useCallback(() => {
    const baseColumns = stageColumns.slice(0, stageColumns.findIndex(col => col.key === 'renewal_status') + 1);

    const requirementColumns = [
      ...baseColumns,
      {
        key: 'requirements',
        header: 'Requirements',
        width: '200px',
        render: (value: any, task: any) => {
          const requirements = getCurrentRequirements();
          return (
            <div className="space-y-2">
              {requirements.map((req, idx) => (
                <div key={idx} className="flex items-center space-x-2">
                  <span className="text-sm font-medium">{req.name}:</span>
                  <Badge variant={req.status === 'completed' ? 'default' : 'outline'}>
                    {req.status || 'Pending'}
                  </Badge>
                </div>
              ))}
            </div>
          );
        }
      },
      {
        key: 'actions',
        header: 'Actions',
        width: '150px',
        render: (value: any, task: any) => (
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={() => handleViewTask(task)}>
              View
            </Button>
          </div>
        )
      }
    ];

    return requirementColumns;
  }, [getCurrentRequirements]);

  // Handle sidebar navigation
  const handleDeptClick = (deptId: string) => {
    setSelectedDepartment(deptId);
    const dept = departments.find(d => d.id === deptId);
    if (dept?.subdepartments?.length > 0) {
      setSelectedSubdepartment(dept.subdepartments[0].id);
      if (dept.subdepartments[0].classes?.length > 0) {
        setSelectedClass(dept.subdepartments[0].classes[0].name);
        if (dept.subdepartments[0].classes[0].subClasses?.length > 0) {
          setSelectedSubclass(dept.subdepartments[0].classes[0].subClasses[0].id);
        } else {
          setSelectedSubclass('');
        }
      } else {
        setSelectedClass('');
        setSelectedSubclass('');
      }
    }
  };

  const handleSubdeptClick = (deptId: string, subdeptId: string) => {
    setSelectedDepartment(deptId);
    setSelectedSubdepartment(subdeptId);
    const dept = departments.find(d => d.id === deptId);
    const subdept = dept?.subdepartments?.find(s => s.id === subdeptId);
    if (subdept?.classes?.length > 0) {
      setSelectedClass(subdept.classes[0].name);
      if (subdept.classes[0].subClasses?.length > 0) {
        setSelectedSubclass(subdept.classes[0].subClasses[0].id);
      } else {
        setSelectedSubclass('');
      }
    } else {
      setSelectedClass('');
      setSelectedSubclass('');
    }
  };

  const handleClassClick = (deptId: string, subdeptId: string, classId: string) => {
    setSelectedDepartment(deptId);
    setSelectedSubdepartment(subdeptId);
    setSelectedClass(classId);
    const dept = departments.find(d => d.id === deptId);
    const subdept = dept?.subdepartments?.find(s => s.id === subdeptId);
    const cls = subdept?.classes?.find(c => c.name === classId);
    if (cls?.subClasses?.length > 0) {
      setSelectedSubclass(cls.subClasses[0].id);
    } else {
      setSelectedSubclass('');
    }
  };

  const handleSubclassClick = (deptId: string, subdeptId: string, classId: string, subclassId: string) => {
    setSelectedDepartment(deptId);
    setSelectedSubdepartment(subdeptId);
    setSelectedClass(classId);
    setSelectedSubclass(subclassId);
  };

  const handleToggleExpand = (key: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Handle task actions
  const handleTaskAction = (action: string, task: Task) => {
    switch (action) {
      case 'edit':
        // Handle edit task
        break;
      case 'delete':
        // Handle delete task
        break;
      case 'view':
        setSelectedTask(task);
        break;
      default:
        break;
    }
  };

  const handleViewTask = (task: Task) => {
    setSelectedTask(task);
  };

  // Handle stage document upload
  const handleStageDocumentUpload = (task: Task, stage: any) => {
    setSelectedStageTask({ task, stage });
    setStageUploadDialogOpen(true);
  };

  // Handle view stage document
  const handleViewStageDocument = async (task: Task, stage: any, stageDoc: any, document: any) => {
    try {
      const { data: fileUrl, error } = await supabase.storage
        .from('kyc-documents')
        .createSignedUrl(document.file_path, 3600);

      if (error) throw error;

      setPreviewDocument({
        ...document,
        fileUrl: fileUrl.signedUrl,
        stageName: stage.name,
        documentName: stageDoc.name,
        isRecentlySubmitted: document.created_at > new Date(Date.now() - 5 * 60 * 1000).toISOString()
      });
      setDocumentPreviewOpen(true);
    } catch (error) {
      console.error('Error loading document:', error);
      toast({
        title: "Error",
        description: "Failed to load document",
        variant: "destructive"
      });
    }
  };

  // Handle show upload dialog
  const handleShowUploadDialog = (task: Task) => {
    setSelectedTask(task);
    setShowUploadDialog(true);
  };

  // Handle sort
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Transform departments for sidebar
  const transformedDepartments = departments.map(dept => {
    const transformedDept = {
      ...dept,
      id: dept.id.toString(),
      subdepartments: dept.subdepartments?.map(subdept => {
        const transformedSubdept = {
          ...subdept,
          id: subdept.id.toString(),
          department_id: subdept.department_id?.toString(),
          classes: subdept.classes?.map(cls => {
            return {
              ...cls,
              id: cls.id?.toString(),
              subClasses: (cls.subClasses || []).map(subCls => ({
                ...subCls,
                id: subCls.id?.toString(),
                ...(subCls.parentClassId && { parentClassId: subCls.parentClassId.toString() })
              }))
            };
          })
        };
        return transformedSubdept;
      })
    };
    return transformedDept;
  });

  // Get current selection details for display
  const getCurrentSelectionDetails = () => {
    const dept = departments.find(d => d.id === selectedDepartment);
    const subdept = dept?.subdepartments?.find(s => s.id === selectedSubdepartment);
    const cls = subdept?.classes?.find(c => c.name === selectedClass);
    const subcls = cls?.subClasses?.find(sc => sc.id === selectedSubclass);

    return { dept, subdept, cls, subcls };
  };

  // Get display title based on current selection
  const getDisplayTitle = () => {
    const { dept, subdept, cls, subcls } = getCurrentSelectionDetails();
    const selectionLevel = getCurrentSelectionLevel();

    switch (selectionLevel) {
      case 'subclass':
        return `${subcls?.name} (${cls?.name} - ${subdept?.name})`;
      case 'class':
        return `${cls?.name} (${subdept?.name})`;
      case 'subdepartment':
        return subdept?.name || '';
      case 'department':
        return dept?.name || '';
      default:
        return 'Task Management';
    }
  };

  // Get current selection level
  const getCurrentSelectionLevel = () => {
    if (selectedSubclass) return 'subclass';
    if (selectedClass) return 'class';
    if (selectedSubdepartment) return 'subdepartment';
    if (selectedDepartment) return 'department';
    return 'none';
  };

  const { dept, subdept, cls, subcls } = getCurrentSelectionDetails();
  const selectionLevel = getCurrentSelectionLevel();

  const handleReviewDocument = (document: any) => {
    setReviewDocument(document)
    setDocumentReviewOpen(true)
  }

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-2">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading tasks...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <DepartmentSidebar
        departments={transformedDepartments}
        activeDept={selectedDepartment}
        activeSubdept={selectedSubdepartment}
        onDeptClick={handleDeptClick}
        onSubdeptClick={handleSubdeptClick}
        onClassClick={handleClassClick}
        onSubclassClick={handleSubclassClick}
        onToggleExpand={handleToggleExpand}
        expandedItems={expandedItems}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="flex-1 space-y-4 p-4 h-full overflow-auto">
          <div className="flex items-center justify-between space-y-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Task Management</h2>
              <p className="text-muted-foreground">
                {dept?.name} {subdept && `> ${subdept.name}`} {cls && `> ${cls.name}`} {subcls && `> ${subcls.name}`}
              </p>
              <div className="mt-1">
                <Badge variant="outline" className="text-xs">
                  Current Level: {selectionLevel.charAt(0).toUpperCase() + selectionLevel.slice(1)}
                </Badge>
                <Badge variant="outline" className="text-xs ml-2">
                  Stages: Department-based | Requirements: {selectionLevel === 'subclass' ? 'Subclass-based' : 'Class-based'}
                </Badge>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => setNewTaskDialogOpen(true)}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                New Task
              </Button>
            </div>
          </div>

          {/* Content based on selection */}
          {(selectedClass || selectedSubclass) ? (
            <Tabs defaultValue="work-in-progress" className="space-y-4">
              <TabsList>
                <TabsTrigger value="work-in-progress">Work in Progress</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
              </TabsList>

              <TabsContent value="work-in-progress" className="space-y-4">
                <Tabs defaultValue="stages" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="stages">
                      <FileText className="h-4 w-4 mr-2" />
                      Stages (Department-based)
                    </TabsTrigger>
                    <TabsTrigger value="upload-requirements">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Requirements ({selectionLevel === 'subclass' ? 'Subclass' : 'Class'}-based)
                    </TabsTrigger>
                    <TabsTrigger value="webdata">
                      <Upload className="h-4 w-4 mr-2" />
                      Web Data
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="stages" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Stages Progress - {getDisplayTitle()}</CardTitle>
                        <CardDescription>
                          Track tasks through various stages of completion (Department-level stages)
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4">
                        <TaskTable
                          tasks={getFilteredTasks('in_progress')}
                          columns={generateStageColumns()}
                          loading={loading}
                          error={error}
                          onTaskAction={handleTaskAction}
                          onStageDocumentUpload={handleStageDocumentUpload}
                          onViewStageDocument={handleViewStageDocument}
                          onShowUploadDialog={handleShowUploadDialog}
                          applicantDocuments={applicantDocuments}
                          departments={departments}
                          sortConfig={sortConfig}
                          onSort={handleSort}
                          columnVisibility={columnVisibility}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="upload-requirements" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Upload Requirements - {getDisplayTitle()}</CardTitle>
                        <CardDescription>
                          {selectionLevel === 'subclass'
                            ? `Manage document requirements for ${subcls?.name} (Subclass-level requirements)`
                            : `Manage document requirements for ${cls?.name} (Class-level requirements)`
                          }
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4">
                        <TaskTable
                          tasks={getFilteredTasks('in_progress')}
                          columns={generateRequirementColumns()}
                          loading={loading}
                          error={error}
                          onTaskAction={handleTaskAction}
                          onShowUploadDialog={handleShowUploadDialog}
                          applicantDocuments={applicantDocuments}
                          sortConfig={sortConfig}
                          onSort={handleSort}
                          columnVisibility={columnVisibility}
                          showRequirements={true}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="webdata" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Web Data - {getDisplayTitle()}</CardTitle>
                        <CardDescription>
                          Web data for {getDisplayTitle()}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4">
                        <TaskTable
                          tasks={getFilteredTasks('in_progress')}
                          columns={generateRequirementColumns()}
                          loading={loading}
                          error={error}
                          onTaskAction={handleTaskAction}
                          onShowUploadDialog={handleShowUploadDialog}
                          applicantDocuments={applicantDocuments}
                          sortConfig={sortConfig}
                          onSort={handleSort}
                          columnVisibility={columnVisibility}
                          showRequirements={true}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </TabsContent>

              <TabsContent value="completed" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Completed Tasks - {getDisplayTitle()}</CardTitle>
                    <CardDescription>Successfully completed tasks with performance metrics</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4">
                    <TaskTable
                      tasks={getFilteredTasks('completed')}
                      columns={generateStageColumns()}
                      loading={loading}
                      error={error}
                      onTaskAction={handleTaskAction}
                      onStageDocumentUpload={handleStageDocumentUpload}
                      onViewStageDocument={handleViewStageDocument}
                      onShowUploadDialog={handleShowUploadDialog}
                      applicantDocuments={applicantDocuments}
                      departments={departments}
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      columnVisibility={columnVisibility}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : selectedSubdepartment ? (
            <Tabs defaultValue="work-in-progress" className="space-y-4">
              <TabsList>
                <TabsTrigger value="work-in-progress">Work in Progress</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
              </TabsList>

              <TabsContent value="work-in-progress" className="space-y-4">
                <Tabs defaultValue="stages" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="stages">
                      <FileText className="h-4 w-4 mr-2" />
                      Stages (Department-based)
                    </TabsTrigger>
                    <TabsTrigger value="upload-requirements">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Requirements (Class-based)
                    </TabsTrigger>
                    <TabsTrigger value="webdata">
                      <Upload className="h-4 w-4 mr-2" />
                      Web Data
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="stages" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Stages Progress - {subdept?.name}</CardTitle>
                        <CardDescription>
                          Track tasks through various stages of completion (Department-level stages)
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4">
                        <TaskTable
                          tasks={getFilteredTasks('in_progress')}
                          columns={generateStageColumns()}
                          loading={loading}
                          error={error}
                          onTaskAction={handleTaskAction}
                          onStageDocumentUpload={handleStageDocumentUpload}
                          onViewStageDocument={handleViewStageDocument}
                          onShowUploadDialog={handleShowUploadDialog}
                          applicantDocuments={applicantDocuments}
                          departments={departments}
                          sortConfig={sortConfig}
                          onSort={handleSort}
                          columnVisibility={columnVisibility}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="upload-requirements" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Upload Requirements - {subdept?.name}</CardTitle>
                        <CardDescription>
                          Manage document requirements for this subdepartment (Class/Subclass-level requirements)
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4">
                        <TaskTable
                          tasks={getFilteredTasks('in_progress')}
                          columns={generateRequirementColumns()}
                          loading={loading}
                          error={error}
                          onTaskAction={handleTaskAction}
                          onShowUploadDialog={handleShowUploadDialog}
                          applicantDocuments={applicantDocuments}
                          sortConfig={sortConfig}
                          onSort={handleSort}
                          columnVisibility={columnVisibility}
                          showRequirements={true}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="webdata" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Web Data - {subdept?.name}</CardTitle>
                        <CardDescription>
                          Web data for this subdepartment
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4">
                        <TaskTable
                          tasks={getFilteredTasks('in_progress')}
                          columns={generateRequirementColumns()}
                          loading={loading}
                          error={error}
                          onTaskAction={handleTaskAction}
                          onShowUploadDialog={handleShowUploadDialog}
                          applicantDocuments={applicantDocuments}
                          sortConfig={sortConfig}
                          onSort={handleSort}
                          columnVisibility={columnVisibility}
                          showRequirements={true}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </TabsContent>

              <TabsContent value="completed" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Completed Tasks - {subdept?.name}</CardTitle>
                    <CardDescription>Successfully completed tasks with performance metrics</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4">
                    <TaskTable
                      tasks={getFilteredTasks('completed')}
                      columns={generateStageColumns()}
                      loading={loading}
                      error={error}
                      onTaskAction={handleTaskAction}
                      onStageDocumentUpload={handleStageDocumentUpload}
                      onViewStageDocument={handleViewStageDocument}
                      onShowUploadDialog={handleShowUploadDialog}
                      applicantDocuments={applicantDocuments}
                      departments={departments}
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      columnVisibility={columnVisibility}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : selectedDepartment ? (
            <Card>
              <CardHeader>
                <CardTitle>Department Overview - {dept?.name}</CardTitle>
                <CardDescription>
                  Select a subdepartment from the sidebar to view tasks
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <div className="space-y-2">
                    <p className="text-muted-foreground">
                      Choose a subdepartment from the sidebar to view and manage tasks
                    </p>
                    <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md inline-block">
                      <div className="font-medium mb-1">Data Dependencies:</div>
                      <div>• Stages: Based on Department level</div>
                      <div>• Requirements: Based on Class/Subclass level</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Task Management Dashboard</CardTitle>
                <CardDescription>
                  Select a department from the sidebar to get started
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <div className="space-y-2">
                    <p className="text-muted-foreground">
                      Choose a department from the sidebar to view and manage tasks
                    </p>
                    <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md inline-block">
                      <div className="font-medium mb-1">System Overview:</div>
                      <div>• Departments → Subdepartments → Classes → Subclasses</div>
                      <div>• Stages: Department-dependent</div>
                      <div>• Requirements: Class/Subclass-dependent</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dialogs */}
          <NewTaskDialog
            open={newTaskDialogOpen}
            onOpenChange={setNewTaskDialogOpen}
            onCreate={(newTask) => {
              setTasks(prev => [newTask, ...prev]);
            }}
          />

          {selectedTask && (
            <StageTransitionDialog
              open={stageTransitionDialogOpen}
              onOpenChange={setStageTransitionDialogOpen}
              currentStage={{
                id: selectedTask.current_stage?.id?.toString() || '',
                name: selectedTask.current_stage?.name || 'Not Started',
                estimatedDuration: selectedTask.current_stage?.estimated_time || 0,
                actualDuration: selectedTask.current_stage_started_at
                  ? (new Date().getTime() - new Date(selectedTask.current_stage_started_at).getTime()) / (1000 * 60)
                  : 0
              }}
              stages={stages}
              currentStageId={selectedTask.current_stage?.id?.toString()}
              onTransition={async (data) => {
                try {
                  const { data: updatedTask, error } = await supabase
                    .from('tm_tasks')
                    .update({
                      current_stage_id: data.nextStageId ? parseInt(data.nextStageId) : null,
                      current_stage_started_at: data.nextStageId ? new Date().toISOString() : null,
                      status: data.nextStageId ? 'in_progress' : 'completed',
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', selectedTask.id)
                    .select('*')
                    .single();

                  if (error) throw error;

                  setTasks(tasks.map(t => t.id === selectedTask.id ? updatedTask : t));

                  const [tasksData] = await Promise.all([getTasks()]);
                  setTasks(tasksData);
                  setStageTransitionDialogOpen(false);
                } catch (err) {
                  console.error("Error updating stage:", err);
                }
              }}
            />
          )}

          <StageUploadDialog
            open={stageUploadDialogOpen}
            onOpenChange={setStageUploadDialogOpen}
            selectedStageTask={selectedStageTask}
            getCurrentRequirements={getCurrentRequirements}
            fuzzyMatch={fuzzyMatch}
          />

          {selectedTask && showUploadDialog && (
            <UploadRequirementsDialog
              open={showUploadDialog}
              onClose={() => {
                setSelectedTask(null);
                setShowUploadDialog(false);
              }}
              task={selectedTask}
              requirements={getCurrentRequirements()}
              onUploadComplete={() => {
                if (selectedTask) {
                  // Refresh task data or update UI as needed
                  console.log('Upload completed for task:', selectedTask.id);
                }
              }}
            />
          )}

          <DocumentPreviewDialog
            open={documentReviewOpen}
            onOpenChange={setDocumentReviewOpen}
            document={reviewDocument}
            task={selectedTask}
            onReviewComplete={(documentId, status, comments) => {
              console.log('Review completed:', { documentId, status, comments })
              // Handle review completion
              toast({
                title: 'Review Completed',
                description: `Document ${status} successfully`,
                variant: status === 'approved' ? 'default' : 'destructive'
              })
            }}
            onExtractedDataUpdate={(documentId, updatedData) => {
              console.log('Extracted data updated:', { documentId, updatedData })
              // Handle extracted data update
            }}
          />
        </div>
      </div>
    </div>
  );
}