  // @ts-nocheck
  "use client"

  import { useCallback, useEffect, useState, useMemo } from "react"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
  import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
  import { Badge } from "@/components/ui/badge"
  import { DatabaseIcon, Loader2, Plus, Send } from "lucide-react"
  import { Users } from "lucide-react"
  import { AlertTriangle } from "lucide-react"
  import { CheckCircle } from "lucide-react"
  import { ArrowRight } from "lucide-react"
  import { Calendar } from "lucide-react"
  import { ChevronDown } from "lucide-react"
  import { Upload } from "lucide-react"
  import { FileText } from "lucide-react"
  import { Edit } from "lucide-react"
  import { Trash2 } from "lucide-react"
  import { X } from "lucide-react"
  import { File as FileIcon } from "lucide-react"
  import { Check } from "lucide-react"
  import { XCircle } from "lucide-react"
  import { Eye } from "lucide-react"
  import { MessageSquare } from "lucide-react"
  import { Download } from "lucide-react"
  import { format, parseISO } from "date-fns"
  import dynamic from 'next/dynamic'
  const PDFViewer = dynamic(() => import('@/components/PDFViewer'), { ssr: false })
  const ExtractionPreview = dynamic(() => import('@/components/ExtractionPreview'), { ssr: false })
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
  import { toast } from "@/hooks/use-toast"
  import { performExtraction } from "@/lib/extractionUtils"
  import { Textarea } from "@/components/ui/textarea"
  import { Label } from "@/components/ui/label"
  import { Input } from "@/components/ui/input"

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
    const [stageUploadDialogOpen, setStageUploadDialogOpen] = useState(false);
    const [selectedStageTask, setSelectedStageTask] = useState<{ task: Task, stage: any } | null>(null);
    const [stageExtractionDialogOpen, setStageExtractionDialogOpen] = useState(false);
    const [extractedData, setExtractedData] = useState<any>(null);
    const [extractionLoading, setExtractionLoading] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
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
      {
        key: 'documents',
        header: 'All Submitted Documents',
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
      { key: 'renewal_status', header: 'New/Renewal', width: '120px' },
      // Dynamic stage columns will be added here by generateStageColumns()
      { key: 'account_used', header: 'Account Used', width: '120px' },
      { key: 'applied_by', header: 'Applied by Who', width: '120px' },
      { key: 'batch', header: 'Batch', width: '100px' },
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


        return transformedDept;
      }).filter(Boolean);
    };

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


          // Transform departments data
          const transformedDepts = transformDepartments(deptsData);

          setTasks(tasksData);
          setDepartments(transformedDepts);
          setUsers(usersData);
          setStages(stagesData);

          // Log the first task's structure for debugging
          if (tasksData.length > 0) {
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
      // If no filters are selected, return all tasks
      if (!selectedDepartment && !selectedSubdepartment && !selectedClass && !selectedSubclass) {
        return status ? tasks.filter(task => task.status === status) : [...tasks];
      }

      // Helper function to compare IDs safely
      const idsMatch = (id1: any, id2: any): boolean => {
        if (id1 === undefined || id2 === undefined) return false;
        return String(id1) === String(id2);
      };

      return tasks.filter(task => {
        // Task details for filtering
        const taskInfo = {
          taskId: task.id,
          taskDept: task.department?.id,
          taskSubdept: task.subdepartment?.id,
          taskClass: task.class_id,
          taskSubclass: task.subclass_id
        };

        // Check department match if department is selected
        if (selectedDepartment) {
          const deptMatch = idsMatch(task.department?.id, selectedDepartment);
          if (!deptMatch) {
            return false;
          }
        }

        // Check subdepartment match if subdepartment is selected
        if (selectedSubdepartment) {
          const subdeptMatch = idsMatch(task.subdepartment?.id, selectedSubdepartment);
          if (!subdeptMatch) {
            return false;
          }
        }

        // Check class match if class is selected
        if (selectedClass) {
          const classMatch = idsMatch(task.class_id, selectedClass);
          if (!classMatch) {
            return false;
          }
        }

        // Check subclass match if subclass is selected
        if (selectedSubclass) {
          const subclassMatch = idsMatch(task.subclass_id, selectedSubclass);
          if (!subclassMatch) {
            return false;
          }
        }

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



      return subdept
    }
    // Updated getCurrentRequirements function
    const getCurrentRequirements = useCallback(() => {
      if (selectedSubclass) {
        console.log('Looking for subclass with ID:', selectedSubclass);
        const subclass = departments
          .flatMap(d => d.tm_subdepartments || [])
          .flatMap(sd => sd.classes || [])
          .flatMap(c => c.subClasses || [])
          .find(sc => String(sc.id) === String(selectedSubclass)); // Ensure string comparison

        console.log('Found subclass:', subclass);
        return subclass?.requirements || [];
      } else if (selectedClass) {
        console.log('Looking for class with ID:', selectedClass);

        // First try to find the class by ID (which seems to be stored as a number)
        let cls = departments
          .flatMap(d => d.tm_subdepartments || [])
          .flatMap(sd => sd.classes || [])
          .find(c => String(c.id) === String(selectedClass));

        // If not found by ID, try by name (since selectedClass might be a name)
        if (!cls) {
          cls = departments
            .flatMap(d => d.tm_subdepartments || [])
            .flatMap(sd => sd.classes || [])
            .find(c => c.name === selectedClass);
        }

        console.log('Found class:', cls);
        return cls?.requirements || [];
      } else if (selectedSubdepartment) {
        console.log('Looking for subdepartment with ID:', selectedSubdepartment);
        const subdept = departments
          .flatMap(d => d.tm_subdepartments || [])
          .find(sd => String(sd.id) === String(selectedSubdepartment));

        console.log('Found subdepartment:', subdept);
        return subdept?.requirements || [];
      } else if (selectedDepartment) {
        console.log('Looking for department with ID:', selectedDepartment);
        const dept = departments.find(d => String(d.id) === String(selectedDepartment));
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
      const transformedDept = {
        ...dept,
        id: dept.id.toString(), // Ensure department ID is string
        subdepartments: dept.subdepartments?.map(subdept => {

          const transformedSubdept = {
            ...subdept,
            id: subdept.id.toString(), // Ensure subdepartment ID is string
            department_id: subdept.department_id?.toString(), // Ensure department_id is string
            classes: subdept.classes?.map(cls => {

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
        principal_member_name: task.principal_member_name || 'Missing',
        renewal_status: task.renewal_status || 'New',
        application_type: task.application_type || 'Standard',
        r_number: task.r_number || 'N/A',
        status: task.status || 'pending',
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

    // State for column visibility and sorting
    const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [showColumnMenu, setShowColumnMenu] = useState(false);

    // Initialize column visibility
    useEffect(() => {
      const initialVisibility = stageColumns.reduce((acc, col) => {
        acc[col.key] = true;
        return acc;
      }, {} as Record<string, boolean>);
      setColumnVisibility(initialVisibility);
    }, []);

    // Handle sort request
    const handleSort = (key: string) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
        direction = 'desc';
      }
      setSortConfig({ key, direction });
    };

    // Sort tasks based on sortConfig
    const getSortedTasks = (tasks: Task[]) => {
      if (!sortConfig) return tasks;

      return [...tasks].sort((a, b) => {
        // Handle nested properties
        const getNestedValue = (obj: any, path: string) => {
          return path.split('.').reduce((acc, part) => acc && acc[part], obj);
        };

        let aValue = getNestedValue(a, sortConfig.key);
        let bValue = getNestedValue(b, sortConfig.key);

        // Convert to string for consistent comparison
        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();

        if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    };

    // Toggle column visibility
    const toggleColumnVisibility = (key: string) => {
      setColumnVisibility(prev => ({
        ...prev,
        [key]: !prev[key]
      }));
    };

    // Get sort indicator for column header
    const getSortIndicator = (key: string) => {
      if (!sortConfig || sortConfig.key !== key) return null;
      return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
    };

    // Column visibility toggle component
    const ColumnVisibilityToggle = () => (
      <div className="relative group">
        <Button
          variant="outline"
          size="sm"
          className="ml-2"
          onClick={() => setShowColumnMenu(!showColumnMenu)}
        >
          <span className="mr-1">Columns</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
        {showColumnMenu && (
          <div
            className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-10 p-2 border"
            onMouseLeave={() => setShowColumnMenu(false)}
          >
            <div className="max-h-60 overflow-y-auto">
              {taskColumns
                .filter(col => !['actions', 'index', 'separator1', 'separator2', 'separator3', 'separator4'].includes(col.key))
                .map(column => (
                  <label
                    key={column.key}
                    className="flex items-center p-1 hover:bg-gray-100 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={columnVisibility[column.key] !== false}
                      onChange={() => toggleColumnVisibility(column.key)}
                      className="mr-2"
                      onClick={(e) => e.stopPropagation()}
                    />
                    {typeof column.header === 'string' ? column.header : column.key}
                  </label>
                ))}
            </div>
          </div>
        )}
      </div>
    );
    const handleStageDocumentUpload = (task: Task, stage: any) => {
      setSelectedStageTask({ task, stage });
      setStageUploadDialogOpen(true);
    };

    const handleViewStageDocuments = (task: Task, stage: any) => {
      // Show uploaded documents and extracted data
      setSelectedStageTask({ task, stage });
      setStageUploadDialogOpen(true);
    };

    // Create a simplified extraction function based on your performExtraction
    const performStageExtraction = async (
      file: File,
      extractionSpecs: any[],
      onProgress?: (message: string) => void
    ) => {
      try {
        setExtractionLoading(true);
        onProgress?.('Processing document...');

        // Convert extraction specs to the format expected by your performExtraction function
        const fields = extractionSpecs.map(spec => ({
          id: spec.id,
          name: spec.fieldName,
          type: spec.fieldType || 'text',
          required: spec.isRequired || false
        }));

        // Create a file URL for processing (you might need to upload to temp storage first)
        const fileUrl = URL.createObjectURL(file);

        const result = await performExtraction(
          fileUrl,
          fields,
          'document',
          onProgress,
          file.name
        );

        // Clean up the object URL
        URL.revokeObjectURL(fileUrl);

        return result;
      } catch (error) {
        console.error('Extraction error:', error);
        throw error;
      } finally {
        setExtractionLoading(false);
      }
    };

    const handleDocumentUpload = async (file: File, taskId: number, stageId: string, docId: string) => {
      try {
        setExtractionLoading(true);

        // Find the stage and document configuration
        const stage = departments
          .flatMap(d => d.stages || [])
          .find(s => s.id === stageId);

        const document = stage?.documents?.find(d => d.id === docId);

        if (!document) {
          throw new Error('Document configuration not found');
        }

        let extractedData = null;

        // Perform extraction if the document has extraction specs
        if (document.extractionSpecs && document.extractionSpecs.length > 0) {
          const extractionResult = await performStageExtraction(
            file,
            document.extractionSpecs,
            (message) => console.log('Extraction progress:', message)
          );

          if (extractionResult.success) {
            extractedData = extractionResult.extractedData;
            setExtractedData(extractedData);
          }
        }

        // Here you would normally upload the file to your storage
        // For now, we'll just simulate the upload
        const fileUrl = URL.createObjectURL(file);

        // Update the task with document information (you'll need to implement this)
        // This is where you'd save to your database
        const documentInfo = {
          fileUrl,
          fileName: file.name,
          extractedData,
          uploadedAt: new Date().toISOString()
        };

        toast({
          title: "Success",
          description: extractedData
            ? "Document uploaded and data extracted successfully"
            : "Document uploaded successfully",
        });

        return documentInfo;

      } catch (error) {
        console.error('Error uploading document:', error);
        toast({
          title: "Error",
          description: "Failed to upload document. Please try again.",
          variant: "destructive"
        });
        throw error;
      } finally {
        setExtractionLoading(false);
      }
    };
  // Update the generateStageColumns function in your page.tsx
  const generateStageColumns = () => {
    // Define base columns (columns before stages)
    const baseColumns = stageColumns
      .slice(0, stageColumns.findIndex(col => col.key === 'renewal_status') + 1)
      .filter(col => columnVisibility[col.key] !== false);

    // Define moved columns (account_used, applied_by, batch)
    const movedColumns = stageColumns
      .slice(
        stageColumns.findIndex(col => col.key === 'account_used'),
        stageColumns.findIndex(col => col.key === 'batch') + 1
      )
      .filter(col => ['account_used', 'applied_by', 'batch'].includes(col.key) && 
                    columnVisibility[col.key] !== false);

    // Define end columns (any remaining columns after moved columns)
    const endColumns: any[] = [];

    // Define no stages column
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

    // Filter stages based on applicable/display settings
    const applicableStages = currentDept.stages.filter(stage => {
      if (!currentSubdept) return true; // Show all if no subdepartment selected
      
      // Check if stage is applicable for current subdepartment
      const subdeptStageConfig = currentSubdept.stages?.find(s => s.stage_id === stage.id);
      if (!subdeptStageConfig?.applicable) return false;
      
      // Check if stage should be displayed
      if (!subdeptStageConfig?.display) return false;
      
      // If we have a selected class, check class-level settings
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

    // Create stage columns only for applicable and displayable stages
    const stageColumnsList = applicableStages
      .filter(stage => columnVisibility[`stage_${stage.name.toLowerCase().replace(/\s+/g, '_')}`] !== false)
      .map(stage => ({
        key: `stage_${stage.name.toLowerCase().replace(/\s+/g, '_')}`,
        header: stage.name,
        width: '150px',
        parentHeader: 'Stages',
        sortable: true,
        render: (value: any, task: Task) => {
          const isCurrentStage = task.current_stage?.name === stage.name;
          const isCompleted = task.current_stage &&
            (task.current_stage.order_num || 0) > (stage.order_num || 0);

          // Handle document upload for document-based stages
          if (stage.documents && stage.documents.length > 0) {
            return (
              <div className="flex flex-col gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStageDocumentUpload(task, stage);
                  }}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Upload
                </Button>
                
                {/* Show document indicator if documents have been uploaded */}
                {task.stage_documents?.[stage.id] && (
                  <div className="flex items-center justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewStageDocuments(task, stage);
                      }}
                    >
                      <Eye className="h-4 w-4 text-blue-600" />
                    </Button>
                  </div>
                )}
                
                {isCurrentStage && task.current_stage_started_at && (
                  <StageTimer
                    startTime={task.current_stage_started_at}
                    estimatedTime={stage.estimated_time}
                  />
                )}
              </div>
            );
          }

          // Regular stage status display
          let status = 'Pending';
          let variant: 'default' | 'secondary' | 'outline' = 'outline';

          if (isCurrentStage) {
            status = 'In Progress';
            variant = 'default';
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
            );
          } else if (isCompleted) {
            status = 'Completed';
            variant = 'secondary';
          }

          return <Badge variant={variant} className="w-fit">{status}</Badge>;
        }
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
  };
    // Render the task table
    const renderTaskTable = (tasksToRender: Task[], columns: any[], showRequirements = false) => {
      // Apply sorting
      const sortedTasks = sortConfig ? getSortedTasks(tasksToRender) : tasksToRender;

      // Get the appropriate columns based on requirements/stages view
      const finalColumns = showRequirements ? generateRequirementColumns() : generateStageColumns();

      // Add table controls header
      // const tableControls = (
      //   <div className="flex justify-between items-center mb-4 px-4 pt-2">
      //     <div className="flex items-center">
      //       <h2 className="text-lg font-semibold">Tasks</h2>
      //       {/* <span className="ml-2 text-sm text-muted-foreground">
      //         {sortedTasks.length} {sortedTasks.length === 1 ? 'task' : 'tasks'}
      //       </span> */}
      //     </div>
      //     <div className="flex items-center">
      //       <ColumnVisibilityToggle />
      //     </div>
      //   </div>
      // );

      // Group columns by parent header for display
      const groupedColumns = finalColumns.reduce((acc: Record<string, any[]>, col: any) => {
        const parent = col.parentHeader || 'ungrouped';
        if (!acc[parent]) acc[parent] = [];
        acc[parent].push(col);
        return acc;
      }, {} as Record<string, any[]>);

      // Flatten all columns for easier access
      const allColumns = Object.values(groupedColumns).flat();

      // Define background colors for parent headers
      const getParentHeaderBgColor = (groupName: string) => {
        if (groupName === 'ungrouped') return 'bg-blue-600';
        if (groupName === 'Stages') return 'bg-blue-600';
        if (groupName === 'Additional Info   ') return 'bg-blue-600';
        return 'bg-blue-500';
      };

      // Define text color for parent headers
      const getParentHeaderTextColor = (groupName: string) => {
        if (groupName === 'ungrouped') return 'text-foreground';
        return 'text-white';
      };

      return (
        <div className="rounded-md border w-full flex flex-col bg-background shadow-sm" style={{ maxHeight: '80vh', maxWidth: '95vw' }}>
          <div className="overflow-auto flex-1 relative">
            {/* {tableControls} */}
            <Table className="min-w-full w-full border-collapse">
              <TableHeader className="sticky top-0 z-10">
                {/* First row - parent headers */}
                <TableRow className="h-10">
                  {Object.entries(groupedColumns).map(([groupName, groupCols]) => (
                    <TableHead
                      key={groupName}
                      colSpan={groupCols.length}
                      className={`text-center border-b-2 border-gray-200 font-medium text-sm ${getParentHeaderBgColor(groupName)} ${getParentHeaderTextColor(groupName)}`}
                    >
                      {groupName !== 'ungrouped' ? groupName : ''}
                    </TableHead>
                  ))}
                </TableRow>

                {/* Second row - column headers */}
                <TableRow className="h-12">
                  {allColumns.map((col: any) => {
                    const isStageColumn = col.parentHeader === 'Stages';
                    const bgColor = isStageColumn ? 'bg-blue-500' : 'bg-blue-600';
                    return (
                      <TableHead
                        key={col.key}
                        style={{ width: col.width, minWidth: col.width }}
                        className={`whitespace-nowrap p-2 border-b border-r font-medium text-sm text-white ${bgColor} hover:opacity-90`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{typeof col.header === 'function' ? col.header() : col.header}</span>
                          {col.sortable && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSort(col.key);
                              }}
                              className="ml-1 hover:text-primary-foreground"
                            >
                              {sortConfig?.key === col.key ? (
                                sortConfig.direction === 'asc' ? '↑' : '↓'
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>

              <TableBody className="divide-y">
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={allColumns.length}
                      className="h-24 text-center bg-gray-50"
                    >
                      <div className="flex items-center justify-center space-x-2">
                        <div className="h-4 w-4 border-2 border-t-2 border-t-primary rounded-full animate-spin"></div>
                        <span>Loading tasks...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell
                      colSpan={allColumns.length}
                      className="h-24 text-center text-destructive bg-red-50"
                    >
                      <div className="flex items-center justify-center space-x-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        <span>{error}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : sortedTasks.length > 0 ? (
                  sortedTasks.map((task, index) => {
                    const formattedTask = formatTaskData(task, index);
                    const isEven = index % 2 === 0;

                    return (
                      <TableRow
                        key={task.id}
                        className={`hover:bg-gray-50 ${isEven ? 'bg-white' : 'bg-gray-50'}`}
                      >
                        {allColumns.map((col: any) => {
                          const cellValue = col.render
                            ? col.render(formattedTask[col.key], task, index)
                            : formattedTask[col.key] || '-';

                          return (
                            <TableCell
                              key={`${task.id}-${col.key}`}
                              className={`p-2 border-r border-b ${col.key.startsWith('separator') ? 'w-px p-0' : ''}`}
                            >
                              {col.key.startsWith('separator') ? (
                                <div className="w-px h-6 bg-gray-200"></div>
                              ) : (
                                <div className="truncate max-w-xs">
                                  {cellValue}
                                </div>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={allColumns.length}
                      className="text-center p-8 text-muted-foreground bg-gray-50"
                    >
                      <div className="flex flex-col items-center space-y-2">
                        <FileText className="h-8 w-8 text-muted-foreground/50" />
                        <p className="font-medium">No tasks found</p>
                        <p className="text-sm text-muted-foreground">
                          Try adjusting your filters or create a new task
                        </p>
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

    // Generate columns for requirements view
    const generateRequirementColumns = () => {
      // Start with the base columns up to renewal_status
      const baseColumns = stageColumns.slice(0, stageColumns.findIndex(col => col.key === 'renewal_status') + 1);

      // Add requirement-specific columns
      const requirementColumns = [
        ...baseColumns,
        {
          key: 'requirements',
          header: 'Requirements',
          width: '200px',
          render: (value: any, task: Task) => {
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
          render: (value: any, task: Task) => (
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" onClick={() => handleViewTask(task)}>
                View
              </Button>
            </div>
          )
        }
      ];

      return requirementColumns;
    };
    const { dept, subdept, cls, subcls } = getCurrentSelectionDetails();
    const selectionLevel = getCurrentSelectionLevel();

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
    // Add this dialog component at the bottom of your page component
    const StageUploadDialog = () => {
      const [selectedFiles, setSelectedFiles] = useState<Record<string, File>>({});
      const [messageTexts, setMessageTexts] = useState<Record<string, string>>({});
      const [extractedData, setExtractedData] = useState<any>(null);
      const [uploading, setUploading] = useState(false);
      const [activeDocumentTab, setActiveDocumentTab] = useState<string>('');
      const [pdfUrl, setPdfUrl] = useState<string | null>(null);
      const [previewData, setPreviewData] = useState<{
        fileUrl?: string;
        messageContent?: string;
        extractedData?: any;
      }>({});
      
      // Clean up object URLs when component unmounts or when dialog closes
      useEffect(() => {
        return () => {
          if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
          }
          if (previewData.fileUrl) {
            URL.revokeObjectURL(previewData.fileUrl);
          }
        };
      }, [pdfUrl, previewData.fileUrl]);
    
      if (!selectedStageTask) return null;
    
      const { task, stage } = selectedStageTask;
    
      // Set the first document as active tab if none selected
      useEffect(() => {
        if (stage.documents?.length > 0 && !activeDocumentTab) {
          setActiveDocumentTab(stage.documents[0].id);
        }
      }, [stage.documents, activeDocumentTab]);
    
      const handleFileUpload = async (file: File, docId: string) => {
        try {
          setUploading(true);
          setSelectedFiles(prev => ({ ...prev, [docId]: file }));
          
          // Clean up previous file URL if it exists
          if (previewData.fileUrl) {
            URL.revokeObjectURL(previewData.fileUrl);
          }
          
          // Create preview URL
          const fileUrl = URL.createObjectURL(file);
          setPreviewData(prev => ({ ...prev, fileUrl }));
          
          // Clear any existing PDF URL when uploading a new file
          if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
            setPdfUrl(null);
          }
          
          // Find document configuration
          const document = stage.documents?.find(d => d.id === docId);
          if (!document) return;
    
          // Perform extraction if needed
          if (document.extractionSpecs && document.extractionSpecs.length > 0) {
            const result = await performStageExtraction(file, document.extractionSpecs);
            if (result.success) {
              setExtractedData(result.extractedData);
              setPreviewData(prev => ({ ...prev, extractedData: result.extractedData }));
            }
          }
    
          toast({
            title: "Success",
            description: "File uploaded and processed successfully",
          });
    
        } catch (error) {
          console.error('Error uploading file:', error);
          toast({
            title: "Error",
            description: "Failed to upload file. Please try again.",
            variant: "destructive"
          });
        } finally {
          setUploading(false);
        }
      };
      // Function to convert message to PDF
      const convertMessageToPDF = async (message: string): Promise<Blob> => {
        try {
          const response = await fetch('/api/convert-message-to-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, documentType: 'mpesa_message' })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to convert message to PDF: ${response.status} ${errorText}`);
          }
          
          return response.blob();
        } catch (error) {
          console.error('Error in convertMessageToPDF:', error);
          throw error;
        }
      };
    
      const activeDocument = stage.documents?.find(d => d.id === activeDocumentTab);
      
      // Handle file upload and extraction
      const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, docId: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
          setUploading(true);
          
          // Clear previous preview data
          if (previewData.fileUrl) {
            URL.revokeObjectURL(previewData.fileUrl);
          }
          if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
          }

          // Update selected files state
          setSelectedFiles(prev => ({ ...prev, [docId]: file }));

          // Create file URL for preview
          const fileUrl = URL.createObjectURL(file);
          setPdfUrl(file.type === 'application/pdf' ? fileUrl : null);
          
          // If there are extraction specs, perform extraction
          const document = stage.documents?.find(d => d.id === docId);
          let extractedData = null;
          
          if (document?.extractionSpecs?.length) {
            const result = await performStageExtraction(file, document.extractionSpecs);
            if (result.success) {
              extractedData = result.extractedData;
              setExtractedData(extractedData);
            }
          }

          // Update preview data with file and extracted data
          setPreviewData({ 
            fileUrl,
            fileName: file.name,
            fileType: file.type,
            extractedData,
            documentName: document?.name || 'Document'
          });

          toast({ 
            title: "File uploaded", 
            description: `${file.name} has been uploaded successfully.` 
          });

        } catch (error) {
          console.error('Error uploading file:', error);
          toast({ 
            title: "Error", 
            description: "Failed to process file. Please try again.", 
            variant: "destructive" 
          });
        } finally {
          setUploading(false);
        }
      };

      // Handle message submission
      const handleMessageSubmit = async (message: string, docId: string) => {
        try {
          setUploading(true);
          setMessageTexts(prev => ({ ...prev, [docId]: message }));
          
          // Clean up previous file URL if it exists
          if (previewData.fileUrl) {
            URL.revokeObjectURL(previewData.fileUrl);
          }
          
          // Find document configuration
          const document = stage.documents?.find(d => d.id === docId);
          if (!document) return;

          // Convert message to PDF
          const pdfBlob = await convertMessageToPDF(message);
          const pdfFile = new File([pdfBlob], `${document.name}_message.pdf`, { type: 'application/pdf' });
          
          // Create preview URL for the PDF
          const pdfUrl = URL.createObjectURL(pdfBlob);
          setPdfUrl(pdfUrl);
          
          // If there are extraction specs, perform extraction
          let extractedData = null;
          if (document.extractionSpecs?.length) {
            const result = await performStageExtraction(pdfFile, document.extractionSpecs);
            if (result.success) {
              extractedData = result.extractedData;
              setExtractedData(extractedData);
            }
          }
          
          // Update preview data with PDF and extracted data
          setPreviewData({
            fileUrl: pdfUrl,
            fileName: `${document.name}_message.pdf`,
            fileType: 'application/pdf',
            extractedData,
            documentName: document.name,
            messageContent: message
          });
          
          toast({ 
            title: "Success", 
            description: "Message processed and data extracted successfully" 
          });
          
        } catch (error) {
          console.error('Error processing message:', error);
          toast({ 
            title: "Error", 
            description: "Failed to process message. Please try again.", 
            variant: "destructive" 
          });
        } finally {
          setUploading(false);
        }
      };
      
      // Handle data changes from ExtractionPreview
      const handleDataChange = (fieldName: string, value: any) => {
        setExtractedData((prev: any) => ({
          ...prev,
          [fieldName]: value
        }));
        
        setPreviewData(prev => ({
          ...prev,
          extractedData: {
            ...(prev.extractedData || {}),
            [fieldName]: value
          }
        }));
      };
      return (
          <Dialog open={stageUploadDialogOpen} onOpenChange={setStageUploadDialogOpen}>
            <DialogContent className="max-w-7xl max-h-[95vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Upload Documents for {stage?.name}</DialogTitle>
                <DialogDescription>
                  Upload required documents or submit messages to complete this stage.
                </DialogDescription>
              </DialogHeader>
      
              <Tabs 
                value={activeDocumentTab} 
                onValueChange={setActiveDocumentTab}
                className="w-full"
              >
                <TabsList className="w-full justify-start overflow-x-auto">
                  {stage?.documents?.map((doc) => (
                    <TabsTrigger 
                      key={doc.id} 
                      value={doc.id}
                      className="whitespace-nowrap"
                    >
                      {doc.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
      
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                  {/* Left Panel - Document Upload/Message Input */}
                  <div className="space-y-4 lg:col-span-1">
                    {stage?.documents?.map((doc) => (
                      <div 
                        key={doc.id} 
                        className={`space-y-4 p-4 rounded-lg border ${
                          activeDocumentTab === doc.id ? 'block' : 'hidden'
                        }`}
                      >
                        <div className="space-y-2">
                          <Label htmlFor={`file-${doc.id}`} className="font-medium">
                            {doc.description || `Upload ${doc.name}`}
                          </Label>
                          <Input
                            id={`file-${doc.id}`}
                            type="file"
                            accept="application/pdf,image/*"
                            onChange={(e) => handleFileChange(e, doc.id)}
                            className="cursor-pointer"
                            disabled={uploading}
                          />
                          <p className="text-sm text-muted-foreground">
                            {doc.required ? "Required" : "Optional"} • {doc.type}
                          </p>
                        </div>
      
                        <div className="relative">
                          <div className="relative flex items-center">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                              <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <Textarea
                              placeholder={`Or type a message for ${doc.name}...`}
                              className="pl-10 min-h-[100px]"
                              value={messageTexts[doc.id] || ''}
                              onChange={(e) => setMessageTexts(prev => ({ ...prev, [doc.id]: e.target.value }))}
                              disabled={uploading}
                            />
                          </div>
                          <Button
                            className="mt-2 w-full"
                            onClick={() => handleMessageSubmit(messageTexts[doc.id] || '', doc.id)}
                            disabled={!messageTexts[doc.id]?.trim() || uploading}
                          >
                            {uploading ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="mr-2 h-4 w-4" />
                            )}
                            Submit Message
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
      
                  {/* Right Panel - Preview and Extracted Data */}
                  <div className="lg:col-span-2 space-y-6">
                    {/* PDF Preview */}
                    <div className="border rounded-lg overflow-hidden bg-gray-50">
                      <div className="bg-muted/50 p-3 border-b flex items-center">
                        <FileText className="h-4 w-4 mr-2" />
                        <span className="font-medium">Document Preview</span>
                      </div>
                      <div className="h-[400px] overflow-auto">
                        {previewData.fileUrl ? (
                          <PDFViewer fileUrl={previewData.fileUrl} />
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
                            <FileText className="h-12 w-12 mb-4 opacity-30" />
                            <p>Preview will appear here</p>
                            <p className="text-sm">Upload a file or submit a message to generate a preview</p>
                          </div>
                        )}
                      </div>
                    </div>
      
                    {/* Extracted Data */}
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-muted/50 p-3 border-b flex items-center">
                        <DatabaseIcon className="h-4 w-4 mr-2" />
                        <span className="font-medium">Extracted Data</span>
                      </div>
                      <div className="p-4">
                        {previewData.extractedData ? (
                          <div className="space-y-4">
                            {Object.entries(previewData.extractedData).map(([key, value]) => (
                              <div key={key} className="border-b pb-2 last:border-0 last:pb-0">
                                <div className="text-sm font-medium text-muted-foreground capitalize">
                                  {key.replace(/([A-Z])/g, ' $1').trim()}
                                </div>
                                <div className="mt-1">
                                  {Array.isArray(value) ? (
                                    <ul className="list-disc pl-5 space-y-1">
                                      {value.map((item, i) => (
                                        <li key={i}>{String(item)}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <div className="font-medium">
                                      {String(value) || <span className="text-muted-foreground">No data</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <DatabaseIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p>Extracted data will appear here</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Tabs>
            </DialogContent>
          </Dialog>
      );
    };
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
        <StageUploadDialog />
      </div>
    )
  }