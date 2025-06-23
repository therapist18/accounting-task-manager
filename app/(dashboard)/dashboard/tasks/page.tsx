// @ts-nocheck
"use client"

import { useCallback, useEffect, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Plus, Users, AlertTriangle, CheckCircle, ArrowRight, Calendar, Upload, FileText, Edit, Trash2, X, File, Check, XCircle } from "lucide-react"
import { format, parseISO } from "date-fns"
import { taskColumns } from "./components/tasksfields"
import { StageTimer } from "@/components/stage-timer"
import { StageTransitionDialog } from "@/components/stage-transition-dialog"
import { StageTimeline } from "@/components/stage-timeline"
import { StageAutomation } from "@/lib/stage-automation"
import { NewTaskDialog } from "@/app/(dashboard)/dashboard/tasks/components/new-task-dialog"
import { getTasks, updateTaskAssignment } from "@/lib/supabase/tasks"
import { getStages } from "@/lib/supabase/stages"
import { supabase } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import type { Stage, Department } from "@/lib/supabase/departments"
import { fetchDepartments } from "../departments/departments/database"
import { DepartmentSidebar } from "../departments/main-shared-components/department-sidebar"

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
  subdepartment?: {
    id: number;
    name: string;
    description?: string | null;
    department_id: number;
    created_at: string;
    updated_at: string;
    classes?: Array<{
      id: number;
      name: string;
      order: number;
      isVisible: boolean;
      description: string | null;
      requirements?: Array<{
        name: string;
        description: string | null;
        is_required?: boolean;
        type?: 'standard' | 'conditional' | 'optional';
        order?: number;
      }>;
      subClasses?: Array<{
        id: number;
        name: string;
        order: number;
        isVisible: boolean;
        description: string | null;
        requirements?: Array<{
          name: string;
          description: string | null;
          is_required?: boolean;
          type?: 'standard' | 'conditional' | 'optional';
          order?: number;
        }>;
      }>;
    }>;
    stages?: Array<{
      display: boolean;
      stage_id: string;
      applicable: boolean;
    }>;
    task_manager?: {
      id: number;
      start_date?: string;
      end_date?: string | null;
    } | null;
    task_assistant?: Array<{
      id: number;
      start_date?: string;
      end_date?: string | null;
    }> | null;
  } | null;
  task_manager?: {
    id: number;
    name: string | null;
    email: string;
  } | null;
  task_assistant?: {
    id: number;
    name: string | null;
    email: string;
  } | null;
  officer?: {
    id: number;
    name: string | null;
    email: string;
  } | null;
  current_stage?: {
    id: string;
    name: string;
    description: string;
    documents: any[];
    follow_up: string;
    isSpecial: boolean;
    order_num: number;
    allocations: Record<string, any>;
    estimated_time: number;
  } | null;
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
  const [tasks, setTasks] = useState<Task[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string | null; role?: string }[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [stageTransitionDialogOpen, setStageTransitionDialogOpen] = useState(false)
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false)
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')
  const [selectedSubdepartment, setSelectedSubdepartment] = useState<string>('')
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [selectedSubclass, setSelectedSubclass] = useState<string>('')
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})
  const [documentsDialogOpen, setDocumentsDialogOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  // Define stage columns inside the component to access component methods
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
    { key: 'dependent_name', header: 'Dependent Name', width: '150px' },
    { key: 'renewal_status', header: 'New/Renewal', width: '120px' },
    // Dynamic stage columns will be added here by generateStageColumns()
    { key: 'account_used', header: 'Account Used', width: '120px' },
    { key: 'applied_by', header: 'Applied by Who', width: '120px' },
    { key: 'batch', header: 'Batch', width: '100px' },
    { 
      key: 'documents', 
      header: 'Documents', 
      width: '80px',
      render: (value: any, task: Task) => (
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          onClick={() => handleViewDocuments(task)}
        >
          <X className="h-4 w-4" />
        </Button>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '120px',
      render: (value: any, task: Task) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleEditTask(task.id)}
            className="h-8 w-8 p-0"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDeleteTask(task.id)}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )
    }
  ]

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
    { key: 'dependent_name', header: 'Dependent Name', width: '150px' },
    { key: 'renewal_status', header: 'New/Renewal', width: '120px' },
    { key: 'account_used', header: 'Account Used', width: '120px' },
    { key: 'applied_by', header: 'Applied by Who', width: '120px' },
    { key: 'batch', header: 'Batch', width: '100px' },
  ]

  // Transform departments data to ensure consistent ID types and structure
  const transformDepartments = (departments: any[]) => {
    if (!departments || !Array.isArray(departments)) {
      console.error('Invalid departments data:', departments);
      return [];
    }

    return departments.map(dept => {
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

      console.log(`Processed department ${transformedDept.name} with ${transformedDept.tm_subdepartments.length} subdepartments`);
      return transformedDept;
    }).filter(Boolean);
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        console.log('Loading tasks, departments, users, and stages...');
        
        const [tasksData, deptsData, usersData, stagesData] = await Promise.all([
          getTasks(),
          fetchDepartments(),
          supabase.from('tm_users').select('id, name, email, role'),
          getStages(),
        ]);

        console.log('Raw tasks data:', tasksData);
        console.log('Raw departments data:', deptsData);
        console.log('Raw users data:', usersData);
        console.log('Raw stages data:', stagesData);

        // Transform departments data
        const transformedDepts = transformDepartments(deptsData);
        console.log('Transformed departments:', transformedDepts);

        setTasks(tasksData);
        setDepartments(transformedDepts);
        setUsers(usersData);
        setStages(stagesData);

        // Log the first task's structure for debugging
        if (tasksData.length > 0) {
          console.log('First task structure:', tasksData[0]);
          console.log('First task department:', tasksData[0].department);
          console.log('First task subdepartment:', tasksData[0].subdepartment);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Get filtered tasks based on selected department/subdepartment/class/subclass
  const getFilteredTasks = useCallback((status?: string) => {
    console.log('Filtering tasks with selection:', {
      selectedDepartment,
      selectedSubdepartment,
      selectedClass,
      selectedSubclass,
      tasksCount: tasks.length
    });

    // If no filters are selected, return all tasks
    if (!selectedDepartment && !selectedSubdepartment && !selectedClass && !selectedSubclass) {
      const allTasks = status ? tasks.filter(task => task.status === status) : [...tasks];
      console.log('No filters selected, returning all tasks:', allTasks);
      return allTasks;
    }

    // Helper function to compare IDs safely
    const idsMatch = (id1: any, id2: any): boolean => {
      if (id1 === undefined || id2 === undefined) return false;
      return String(id1) === String(id2);
    };

    return tasks.filter(task => {
      // Log task details for debugging
      const taskInfo = {
        taskId: task.id,
        taskDept: task.department?.id,
        taskSubdept: task.subdepartment?.id,
        taskClass: task.class_id,
        taskSubclass: task.subclass_id
      };
      console.log('Checking task:', taskInfo);

      // Check department match if department is selected
      if (selectedDepartment) {
        const deptMatch = idsMatch(task.department?.id, selectedDepartment);
        if (!deptMatch) {
          console.log(`Task ${task.id} filtered out - department mismatch`);
          return false;
        }
      }
      
      // Check subdepartment match if subdepartment is selected
      if (selectedSubdepartment) {
        const subdeptMatch = idsMatch(task.subdepartment?.id, selectedSubdepartment);
        if (!subdeptMatch) {
          console.log(`Task ${task.id} filtered out - subdepartment mismatch`);
          return false;
        }
      }
      
      // Check class match if class is selected
      if (selectedClass) {
        const classMatch = idsMatch(task.class_id, selectedClass);
        if (!classMatch) {
          console.log(`Task ${task.id} filtered out - class mismatch`);
          return false;
        }
      }
      
      // Check subclass match if subclass is selected
      if (selectedSubclass) {
        const subclassMatch = idsMatch(task.subclass_id, selectedSubclass);
        if (!subclassMatch) {
          console.log(`Task ${task.id} filtered out - subclass mismatch`);
          return false;
        }
      }
      
      console.log(`Task ${task.id} passed all filters`);
      return true;
    });
  }, [tasks, selectedDepartment, selectedSubdepartment, selectedClass, selectedSubclass]);

  // Memoize filtered tasks to prevent unnecessary recalculations
  const filteredTasks = useMemo(() => {
    return getFilteredTasks();
  }, [getFilteredTasks]);

  // Get current subdepartment details with proper typing
  const getCurrentSubdepartment = (): Subdepartment | undefined => {
    const dept = departments.find(d => d.id === selectedDepartment)
    const subdept = dept?.subdepartments?.find(s => s.id === selectedSubdepartment)

    console.log('Current Department:', dept?.name, 'Subdepartment:', subdept?.name)
    console.log('Subdepartment classes:', subdept?.classes)

    return subdept
  }

  // Get current selection level for determining data source
  const getCurrentSelectionLevel = () => {
    if (selectedSubclass) {
      console.log('Current selection level: subclass');
      return 'subclass';
    }
    if (selectedClass) {
      console.log('Current selection level: class');
      return 'class';
    }
    if (selectedSubdepartment) {
      console.log('Current selection level: subdepartment');
      return 'subdepartment';
    }
    if (selectedDepartment) {
      console.log('Current selection level: department');
      return 'department';
    }
    console.log('Current selection level: none');
    return 'none';
  }

  // Get requirements based on current selection level (child data level)
  const getCurrentRequirements = useCallback(() => {
    if (selectedSubclass) {
      console.log('Looking for subclass with ID:', selectedSubclass);
      const subclass = departments
        .flatMap(d => d.tm_subdepartments || [])
        .flatMap(sd => sd.classes || [])
        .flatMap(c => c.subClasses || [])
        .find(sc => sc.id === selectedSubclass);
      
      console.log('Found subclass:', subclass);
      return subclass?.requirements || [];
    } else if (selectedClass) {
      console.log('Looking for class with ID:', selectedClass);
      const cls = departments
        .flatMap(d => d.tm_subdepartments || [])
        .flatMap(sd => sd.classes || [])
        .find(c => c.id === selectedClass);
      
      console.log('Found class:', cls);
      return cls?.requirements || [];
    } else if (selectedSubdepartment) {
      console.log('Looking for subdepartment with ID:', selectedSubdepartment);
      const subdept = departments
        .flatMap(d => d.tm_subdepartments || [])
        .find(sd => sd.id === selectedSubdepartment);
      
      console.log('Found subdepartment:', subdept);
      return subdept?.requirements || [];
    } else if (selectedDepartment) {
      console.log('Looking for department with ID:', selectedDepartment);
      const dept = departments.find(d => d.id === selectedDepartment);
      console.log('Found department:', dept);
      return dept?.requirements || [];
    }
    
    console.log('No selection level specified, returning empty requirements');
    return [];
  }, [departments, selectedDepartment, selectedSubdepartment, selectedClass, selectedSubclass]);

  // Get stages based on department level
  const getCurrentStages = () => {
    const dept = departments.find(d => d.id === selectedDepartment)
    const subdept = dept?.subdepartments?.find(s => s.id === selectedSubdepartment)

    // Stages are department-dependent
    const deptStages = dept?.stages || []
    const subdeptStages = subdept?.stages || []

    // Combine and remove duplicates by name
    const allStages = [...deptStages, ...subdeptStages]
    const uniqueStages = Array.from(new Map(allStages.map(stage => [stage.name, stage])).values())

    // Sort stages by order_num
    return uniqueStages.sort((a, b) => (a.order_num || 0) - (b.order_num || 0))
  }

  // Handle sidebar navigation
  const handleDeptClick = (deptId: string) => {
    setSelectedDepartment(deptId)
    const dept = departments.find(d => d.id === deptId)
    if (dept?.subdepartments?.length > 0) {
      setSelectedSubdepartment(dept.subdepartments[0].id)
      // Reset class and subclass selection
      if (dept.subdepartments[0].classes?.length > 0) {
        setSelectedClass(dept.subdepartments[0].classes[0].name)
        if (dept.subdepartments[0].classes[0].subClasses?.length > 0) {
          setSelectedSubclass(dept.subdepartments[0].classes[0].subClasses[0].id)
        } else {
          setSelectedSubclass('')
        }
      } else {
        setSelectedClass('')
        setSelectedSubclass('')
      }
    }
  }

  const handleSubdeptClick = (deptId: string, subdeptId: string) => {
    setSelectedDepartment(deptId)
    setSelectedSubdepartment(subdeptId)
    const dept = departments.find(d => d.id === deptId)
    const subdept = dept?.subdepartments?.find(s => s.id === subdeptId)
    // Reset class and subclass selection
    if (subdept?.classes?.length > 0) {
      setSelectedClass(subdept.classes[0].name)
      if (subdept.classes[0].subClasses?.length > 0) {
        setSelectedSubclass(subdept.classes[0].subClasses[0].id)
      } else {
        setSelectedSubclass('')
      }
    } else {
      setSelectedClass('')
      setSelectedSubclass('')
    }
  }

  const handleClassClick = (deptId: string, subdeptId: string, classId: string) => {
    setSelectedDepartment(deptId)
    setSelectedSubdepartment(subdeptId)
    setSelectedClass(classId)
    // Reset subclass selection and set first subclass if available
    const dept = departments.find(d => d.id === deptId)
    const subdept = dept?.subdepartments?.find(s => s.id === subdeptId)
    const cls = subdept?.classes?.find(c => c.name === classId)
    if (cls?.subClasses?.length > 0) {
      setSelectedSubclass(cls.subClasses[0].id)
    } else {
      setSelectedSubclass('')
    }
  }

  const handleSubclassClick = (deptId: string, subdeptId: string, classId: string, subclassId: string) => {
    setSelectedDepartment(deptId)
    setSelectedSubdepartment(subdeptId)
    setSelectedClass(classId)
    setSelectedSubclass(subclassId)
  }

  const handleViewDocuments = (task: Task) => {
    setSelectedTask(task)
    setDocumentsDialogOpen(true)
  }

  const handleToggleExpand = (key: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  // Transform departments for sidebar with proper ID mapping and type handling
  const transformedDepartments = departments.map(dept => {
    console.log(`Processing department: ${dept.name} (ID: ${dept.id})`);
    const transformedDept = {
      ...dept,
      id: dept.id.toString(), // Ensure department ID is string
      subdepartments: dept.subdepartments?.map(subdept => {
        console.log(`  - Processing subdepartment: ${subdept.name} (ID: ${subdept.id})`);
        console.log(`  - Subdepartment classes:`, subdept.classes);
        
        const transformedSubdept = {
          ...subdept,
          id: subdept.id.toString(), // Ensure subdepartment ID is string
          department_id: subdept.department_id?.toString(), // Ensure department_id is string
          classes: subdept.classes?.map(cls => {
            console.log(`    - Processing class: ${cls.name} (ID: ${cls.id})`);
            console.log(`    - Class subclasses:`, cls.subClasses);
            
            return {
              ...cls,
              id: cls.id?.toString(), // Ensure class ID is string
              subClasses: (cls.subClasses || []).map(subCls => ({
                ...subCls,
                id: subCls.id?.toString(), // Ensure subclass ID is string
                // Ensure parentClassId is properly set if it exists
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
  
  console.log('Transformed departments:', JSON.stringify(transformedDepartments, null, 2));

  // Format task data for display
  const formatTaskData = (task: Task, index: number) => {
    const formatDate = (dateString?: string | null) => {
      if (!dateString) return '';
      try {
        return format(parseISO(dateString), 'yyyy-MM-dd');
      } catch (e) {
        return dateString;
      }
    };

    // Get requirements for the current task based on child data level
    const getRequirements = () => {
      const requirements = getCurrentRequirements();

      if (!requirements || requirements.length === 0) {
        return {};
      }

      return requirements.reduce((acc, req) => {
        if (!req.name) return acc;
        const key = req.name.replace(/\s+/g, '_').toLowerCase();
        acc[key] = {
          status: req.is_required ? 'Required' : 'Optional',
          description: req.description || ''
        };
        return acc;
      }, {} as Record<string, { status: string; description: string }>);
    };

    const requirements = getRequirements();
    const taskManagerName = task.task_manager?.name || task.task_manager?.email || 'Unassigned';
    const taskAssistantName = task.task_assistant?.name || task.task_assistant?.email || 'None';
    const officerName = task.officer?.name || task.officer?.email || 'None';

    return {
      ...task,
      index: index + 1,
      website: task.website || '',
      job_description: task.job_description || 'No description',
      task_manager: taskManagerName,
      task_assistant: taskAssistantName,
      officer: officerName,
      class: task.class_id || 'Missing',
      subclass: task.subclass_id || 'Missing',
      documents: 'View Documents',
      applicant_name: task.applicant_name || 'Missing',
      company_name: task.company_name || 'Missing',
      dependent_name: task.dependent_name || 'Missing',
      principal_member_name: task.principal_member_name || 'Missing',
      renewal_status: task.renewal_status || 'New',
      account_used: task.account_used || 'Missing',
      applied_by: task.applied_by || 'System',
      batch: task.batch || 'Missing',
      current_stage: task.current_stage?.name || 'Not Started',
      date_initiated: task.date_initiated ? formatDate(task.date_initiated) : 'Missing',
      created_at: formatDate(task.created_at),
      updated_at: formatDate(task.updated_at),
      ...requirements
    };
  };

  // Generate dynamic stage columns based on department (stages are department-dependent)
  const generateStageColumns = () => {
    const stages = getCurrentStages()

    if (!stages || stages.length === 0) {
      // If no stages, return base columns with a "No Stages" indicator
      const renewalStatusIndex = stageColumns.findIndex(col => col.key === 'renewal_status')
      const baseColumns = stageColumns.slice(0, renewalStatusIndex + 1)
      const endColumns = stageColumns.slice(renewalStatusIndex + 1)

      const noStagesColumn = {
        key: 'no_stages',
        header: 'Stages',
        width: '150px',
        render: () => (
          <div className="text-center text-muted-foreground text-sm">
            No stages configured
          </div>
        )
      }
      return [...baseColumns, noStagesColumn, ...endColumns]
    }

    // Create nested stage columns with proper rendering
    const dynamicStageColumns = stages.map(stage => ({
      key: `stage_${stage.name.toLowerCase().replace(/\s+/g, '_')}`,
      header: stage.name,
      width: '150px',
      parentHeader: 'Stages',
      render: (value: any, task: Task) => {
        const isCurrentStage = task.current_stage?.name === stage.name
        const isCompleted = task.current_stage &&
          (task.current_stage.order_num || 0) > (stage.order_num || 0)

        let status = 'Pending'
        let variant: 'default' | 'secondary' | 'outline' = 'outline'

        if (isCurrentStage) {
          status = 'In Progress'
          variant = 'default'
          return (
            <div className="flex flex-col gap-1">
              <Badge variant={variant} className="w-fit">{status}</Badge>
              {task.current_stage_started_at && (
                <StageTimer
                  startTime={task.current_stage_started_at}
                  estimatedTime={stage.estimated_time}
                />
              )}
            </div>
          )
        } else if (isCompleted) {
          status = 'Completed'
          variant = 'secondary'
        }

        return <Badge variant={variant} className="w-fit">{status}</Badge>
      }
    }))

    // Get the index of renewal_status column
    const renewalStatusIndex = stageColumns.findIndex(col => col.key === 'renewal_status')
    
    // Get the index of the first column that comes after the stage columns
    const accountUsedIndex = stageColumns.findIndex(col => col.key === 'account_used')
    
    // If we found both indices, insert the stage columns between them
    if (renewalStatusIndex !== -1 && accountUsedIndex !== -1) {
      const baseColumns = stageColumns.slice(0, renewalStatusIndex + 1)
      const endColumns = stageColumns.slice(accountUsedIndex)
      return [...baseColumns, ...dynamicStageColumns, ...endColumns]
    }
    
    // Fallback to the original behavior if we can't find the columns
    console.warn('Could not find required columns for proper stage column insertion')
    const baseColumns = stageColumns.slice(0, renewalStatusIndex + 1)
    const endColumns = stageColumns.slice(renewalStatusIndex + 1)
    return [...baseColumns, ...dynamicStageColumns, ...endColumns]
  }

  // Generate dynamic requirement columns based on child data level
  const generateRequirementColumns = () => {
    console.log('Generating requirement columns for current selection')
    const requirements = getCurrentRequirements()

    if (!requirements || requirements.length === 0) {
      console.log('No requirements found for current selection')
      return requirementColumns
    }

    console.log('Found requirements:', requirements)

    const dynamicRequirementColumns = requirements.map(req => {
      const column = {
        key: `req_${req.name.replace(/\s+/g, '_').toLowerCase()}`,
        header: req.name,
        width: '150px',
        render: (value: any, task: Task) => {
          console.log('Rendering requirement:', req.name, 'for task:', task.id)
          return (
            <div className="flex items-center gap-2">
              <Badge variant="outline">Pending</Badge>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                <Upload className="h-3 w-3" />
              </Button>
            </div>
          )
        }
      }
      console.log('Created column for requirement:', req.name, column)
      return column
    })

    console.log('Generated requirement columns:', dynamicRequirementColumns)

    // Insert requirement columns after the base columns
    const baseColumns = requirementColumns
    const result = [...baseColumns, ...dynamicRequirementColumns]

    console.log('Final columns:', result)
    return result
  }

  const handleTaskAssignment = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (task) {
      setSelectedTask({
        id: task.id,
        jobDescription: task.job_description || '',
        currentAssignments: {
          taskManager: task.task_manager_id || "",
          taskAssistant: task.task_assistant_id || "",
        },
      } as any)
      setAssignmentDialogOpen(true)
    }
  }

  const handleStageTransition = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    setSelectedTask(task)
    setStageTransitionDialogOpen(true)
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      in_progress: "default",
      completed: "success",
      cancelled: "destructive",
      pending: "secondary",
    } as const

    return <Badge variant={variants[status as keyof typeof variants] || "secondary"}>{status}</Badge>
  }

  const renderTaskTable = (tasksToRender: Task[], columns: any[], showRequirements = false) => {
    const finalColumns = showRequirements ? generateRequirementColumns() : generateStageColumns()

    // Group columns by parent header
    const groupedColumns = finalColumns.reduce((acc, col) => {
      if (col.parentHeader) {
        if (!acc[col.parentHeader]) acc[col.parentHeader] = []
        acc[col.parentHeader].push(col)
      } else {
        if (!acc.ungrouped) acc.ungrouped = []
        acc.ungrouped.push(col)
      }
      return acc
    }, {} as Record<string, any[]>)

    return (
      <div className="rounded-md border w-full flex flex-col bg-background" style={{ maxHeight: '70vh', maxWidth: '90vw' }}>
        <div className="overflow-hidden flex-1 flex flex-col">
          <div className="overflow-auto flex-1 relative">
            <Table className="min-w-[1400px] w-full border-collapse">
              <TableHeader className="sticky top-0 z-10">
                {/* First row - parent headers */}
                <TableRow className="bg-blue-600">
                  {groupedColumns.ungrouped?.map((column) => (
                    <TableHead
                      key={column.key}
                      rowSpan={2}
                      className="whitespace-nowrap border-r border-border font-semibold text-white bg-blue-600"
                      style={{
                        width: column.width,
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        backgroundColor: 'hsl(var(--blue-50))',
                        verticalAlign: 'middle'
                      }}
                    >
                      {column.header}
                    </TableHead>
                  ))}
                  {Object.entries(groupedColumns).map(([groupName, cols]) => {
                    if (groupName === 'ungrouped') return null
                    return (
                      <TableHead
                        key={groupName}
                        colSpan={cols.length}
                        className="whitespace-nowrap border-r border-border font-semibold text-white text-center"
                        style={{
                          position: 'sticky',
                          top: 0,
                          zIndex: 10,
                          backgroundColor: 'hsl(var(--blue-50))',
                        }}
                      >
                        {groupName}
                      </TableHead>
                    )
                  })}
                </TableRow>

                {/* Second row - sub headers */}
                <TableRow className="bg-blue-600">
                  {Object.entries(groupedColumns).map(([groupName, cols]) => {
                    if (groupName === 'ungrouped') return null
                    return cols.map((column) => (
                      <TableHead
                        key={column.key}
                        className="whitespace-nowrap border-r border-border font-medium text-white text-center"
                        style={{
                          width: column.width,
                          position: 'sticky',
                          top: '40px', // Height of first row
                          zIndex: 10,
                          backgroundColor: 'hsl(var(--blue-50))',
                        }}
                      >
                        {column.header}
                      </TableHead>
                    ))
                  })}
                </TableRow>
              </TableHeader>

              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={finalColumns.length} className="h-24 text-center">
                      Loading tasks...
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={finalColumns.length} className="h-24 text-center text-destructive">
                      {error}
                    </TableCell>
                  </TableRow>
                ) : tasksToRender.length > 0 ? (
                  tasksToRender.map((task, index) => {
                    const formattedTask = formatTaskData(task, index)
                    return (
                      <TableRow key={task.id} className="hover:bg-muted/50">
                        {finalColumns.map((column) => (
                          <TableCell
                            key={`${task.id}-${column.key}`}
                            className="whitespace-nowrap border-r border-border last:border-r-0 py-2"
                          >
                            {column.render
                              ? column.render(
                                formattedTask[column.key as keyof typeof formattedTask],
                                formattedTask,
                                index
                              )
                              : (formattedTask[column.key as keyof typeof formattedTask] || '-')}
                          </TableCell>
                        ))}
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={finalColumns.length} className="h-24 text-center">
                      No tasks found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    )
  }
  // Get current selection details for display
  const getCurrentSelectionDetails = () => {
    const dept = departments.find(d => d.id === selectedDepartment)
    const subdept = dept?.subdepartments?.find(s => s.id === selectedSubdepartment)
    const cls = subdept?.classes?.find(c => c.name === selectedClass)
    const subcls = cls?.subClasses?.find(sc => sc.id === selectedSubclass)

    return { dept, subdept, cls, subcls }
  }

  // Get display title based on current selection
  const getDisplayTitle = () => {
    const { dept, subdept, cls, subcls } = getCurrentSelectionDetails()
    const selectionLevel = getCurrentSelectionLevel()

    switch (selectionLevel) {
      case 'subclass':
        return `${subcls?.name} (${cls?.name} - ${subdept?.name})`
      case 'class':
        return `${cls?.name} (${subdept?.name})`
      case 'subdepartment':
        return subdept?.name
      case 'department':
        return dept?.name
      default:
        return 'Task Management'
    }
  }
  // Add these functions to your main tasks component
  const handleEditTask = useCallback((taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      // Open edit dialog or navigate to edit page
      console.log('Edit task:', task)
      // You can implement an edit dialog similar to the new task dialog
    }
  }, [tasks])

  const handleDeleteTask = useCallback(async (taskId: string) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      try {
        const { error } = await supabase
          .from('tm_tasks')
          .delete()
          .eq('id', taskId)

        if (error) throw error

        // Remove from local state
        setTasks(prev => prev.filter(t => t.id !== taskId))
      } catch (error) {
        console.error('Error deleting task:', error)
      }
    }
  }, [])

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
    )
  }

  const { dept, subdept, cls, subcls } = getCurrentSelectionDetails()
  const selectionLevel = getCurrentSelectionLevel()

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
            // Show class/subclass-specific content with tabs
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
                        {renderTaskTable(
                          getFilteredTasks('in_progress'),
                          stageColumns,
                          false
                        )}
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
                        {renderTaskTable(
                          getFilteredTasks('in_progress'),
                          requirementColumns,
                          true
                        )}
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
                        {renderTaskTable(
                          getFilteredTasks('in_progress'),
                          requirementColumns,
                          true
                        )}
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
                    {renderTaskTable(
                      getFilteredTasks('completed'),
                      stageColumns,
                      false
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : selectedSubdepartment ? (
            // Show subdepartment-level content
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
                        {renderTaskTable(
                          getFilteredTasks('in_progress'),
                          stageColumns,
                          false
                        )}
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
                        {renderTaskTable(
                          getFilteredTasks('in_progress'),
                          requirementColumns,
                          true
                        )}
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
                        {renderTaskTable(
                          getFilteredTasks('in_progress'),
                          requirementColumns,
                          true
                        )}
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
                    {renderTaskTable(
                      getFilteredTasks('completed'),
                      stageColumns,
                      false
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : selectedDepartment ? (
            // Show department-level content
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
            // Show default content when nothing is selected
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
              setTasks(prev => [newTask, ...prev])
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
                    .single()

                  if (error) throw error

                  setTasks(tasks.map(t => t.id === selectedTask.id ? updatedTask : t))

                  const [tasksData] = await Promise.all([getTasks()])
                  setTasks(tasksData)
                  setStageTransitionDialogOpen(false)
                } catch (err) {
                  console.error("Error updating stage:", err)
                }
              }}
            />
          )}

          {/* Documents Dialog */}
          <Dialog open={documentsDialogOpen} onOpenChange={setDocumentsDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Upload Requirements</DialogTitle>
                <DialogDescription>
                  {selectedTask?.job_description} - {selectedTask?.applicant_name}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {getCurrentRequirements().map((req, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-md">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded-full bg-muted">
                        <File className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">{req.name}</p>
                        {req.description && (
                          <p className="text-sm text-muted-foreground">{req.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Upload className="h-4 w-4" />
                        Upload
                      </Button>
                      <Button variant="ghost" size="icon" className="text-muted-foreground">
                        <XCircle className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}