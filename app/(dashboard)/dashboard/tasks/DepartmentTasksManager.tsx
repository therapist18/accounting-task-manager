// @ts-nocheck
"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TruncatedText } from "@/app/(dashboard)/dashboard/departments/documents+fields/types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, ChevronDown, ChevronRight, Expand, Shrink, EyeOff, Plus, Minus } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, FileText, Edit, Trash2, Download, Building, RotateCcw, TableProperties, Search, Hash, Upload, Users, Briefcase } from "lucide-react"
import { EnquiryDialog } from "./components/EnquiryDialog"
import { format, parseISO } from "date-fns"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { EditTaskDialog } from "./components/EditTaskDialog"
import { fetchDepartments } from "../departments/departments/database"
import { DepartmentTasksManagerProps, Task } from "./components/types"
import { StageUploadDialog } from "./components/StageUploadDialog"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import EditableStageCell from "./components/EditableStageCell"



// Document field cell component
function DocumentFieldCell({ document, field, task }) {
  if (!document || !document.extracted_details) {
    return <span className="text-xs text-gray-400">-</span>
  }

  const value = document.extracted_details[field.fieldName] || document.extracted_details[field.id]

  if (!value) {
    return <span className="text-xs text-gray-400">-</span>
  }

  return (
    <div className="text-xs text-gray-700 p-1 max-w-[120px] truncate" title={value}>
      {value}
    </div>
  )
}

export default function DepartmentTasksManager({
  error,
  onTaskAction,
  onStageDocumentUpload,
  onShowUploadDialog,
  applicantDocuments = {},
  getTaskStageStatus,
  handleStageStatusSave,
  onTaskUpdate,
  getCurrentRequirements
}: DepartmentTasksManagerProps) {
  const [departments, setDepartments] = useState<any[]>([])
  const [departmentsLoading, setDepartmentsLoading] = useState(true)
  const [companies, setCompanies] = useState<Map<number, string>>(new Map())
  const [companiesLoading, setCompaniesLoading] = useState(true)
  const [activeDepartmentTab, setActiveDepartmentTab] = useState<string>("")
  const [activeSubTab, setActiveSubTab] = useState<string>("wip-stages")
  const [activeFollowUpFilter, setActiveFollowUpFilter] = useState<string>("all")
  const [isTransposedView, setIsTransposedView] = useState<boolean>(true)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<any>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [allDocuments, setAllDocuments] = useState<any[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [isEnquiryDialogOpen, setIsEnquiryDialogOpen] = useState(false)
  const [selectedStageTask, setSelectedStageTask] = useState<{ task: any, stage: any } | null>(null)
  const [isStageUploadDialogOpen, setIsStageUploadDialogOpen] = useState(false)
  const [globalSearchTerm, setGlobalSearchTerm] = useState<string>('')

  // Enhanced state management for expansions
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['case_details', 'stages']))
  const [showTableHeaders, setShowTableHeaders] = useState<boolean>(true)

  // Fetch all documents once
  const fetchAllDocuments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('acc_portal_directors_documents')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setAllDocuments(data || [])
    } catch (error) {
      console.error('Error fetching documents:', error)
      toast({
        title: "Error",
        description: "Failed to load documents data.",
        variant: "destructive"
      })
    }
  }, [])

  // Get document for specific task and stage
  const getDocumentForTaskStage = useCallback((task: any, stage: any) => {
    if (!task.individual_id || !stage.documents?.[0]?.kycId) return null

    return allDocuments.find(doc =>
      doc.director_id === task.individual_id &&
      doc.document_id === stage.documents[0].kycId
    )
  }, [allDocuments])

  // Section toggle functions
  const toggleSectionExpansion = (sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId)
      } else {
        newSet.add(sectionId)
      }
      return newSet
    })
  }

  // Stage and document toggle functions
  const toggleStageExpansion = (stageId: string) => {
    setExpandedStages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(stageId)) {
        newSet.delete(stageId)
      } else {
        newSet.add(stageId)
      }
      return newSet
    })
  }

  const toggleDocumentExpansion = (docId: string) => {
    setExpandedDocuments(prev => {
      const newSet = new Set(prev)
      if (newSet.has(docId)) {
        newSet.delete(docId)
      } else {
        newSet.add(docId)
      }
      return newSet
    })
  }

  // Expand/Collapse all functions
  const expandAll = () => {
    setExpandedSections(new Set(['case_details', 'stages']))
    const allStageIds = stages.map(s => s.id)
    setExpandedStages(new Set(allStageIds))

    const allDocIds = stages.flatMap(s => s.documents?.map(d => d.id) || [])
    setExpandedDocuments(new Set(allDocIds))
  }

  const collapseAll = () => {
    setExpandedSections(new Set())
    setExpandedStages(new Set())
    setExpandedDocuments(new Set())
  }

  // Handle document upload
  const handleStageDocumentUpload = useCallback((task: any, stage: any) => {
    const enrichedTask = {
      ...task,
      department: task.department || departments.find(d => d.id === task.department_id),
      subdepartment: task.subdepartment || departments
        .find(d => d.id === task.department_id)
        ?.tm_subdepartments?.find(s => s.id === task.subdepartment_id),
      class_id: task.class_id,
      subclass_id: task.subclass_id,
    }

    let childLevelId: string | undefined;
    let childLevelType: 'subdepartment' | 'class' | 'subclass' | undefined;

    if (enrichedTask.subclass_id) {
      childLevelId = enrichedTask.subclass_id;
      childLevelType = 'subclass';
    } else if (enrichedTask.class_id) {
      childLevelId = enrichedTask.class_id;
      childLevelType = 'class';
    } else if (enrichedTask.subdepartment?.id) {
      childLevelId = enrichedTask.subdepartment.id;
      childLevelType = 'subdepartment';
    }

    setSelectedStageTask({
      task: enrichedTask,
      stage,
      childLevelId,
      childLevelType
    })
    setIsStageUploadDialogOpen(true)
  }, [departments])

  // Handle document view
  const [previewDocument, setPreviewDocument] = useState<any>(null);

  const handleViewDocument = useCallback(async (task: any, stage: any) => {
    try {
      console.log('[handleViewDocument] Started', { taskId: task?.id, stageId: stage?.id });
      console.log('[handleViewDocument] Getting document for task stage', { 
        taskId: task?.id, 
        stageId: stage?.id,
        documentId: stage?.documents?.[0]?.id,
        documentName: stage?.documents?.[0]?.name
      });
      
      const document = getDocumentForTaskStage(task, stage);
      console.log('[handleViewDocument] Retrieved document', { 
        documentId: document?.id,
        hasExtractedDetails: !!document?.extracted_details,
        documentPath: document?.file_path
      });

      if (document) {
        // Prepare document data for preview
        const documentName = stage.documents?.[0]?.name || 'Document';
        const bucketName = 'kyc-documents';
        const filePath = document.file_path?.startsWith(bucketName) 
          ? document.file_path 
          : `${bucketName}/${document.file_path}`;
        
        const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
        const fileName = document.file_path?.split('/').pop() || documentName;
        
        // Map extraction fields to the expected format
        const fields = (stage.documents?.[0]?.extractionSpecs || []).map(spec => ({
          id: spec.fieldName,
          name: spec.fieldName,
          type: spec.fieldType,
          required: spec.isRequired,
          description: spec.description,
          ...(spec.extractionRules || {})
        }));

        // Prepare extracted data, ensuring all fields have values
        const extractedData = { ...(document.extracted_details || {}) };
        fields.forEach(field => {
          if (extractedData[field.id] === undefined) {
            extractedData[field.id] = '';
          }
        });

        // Prepare the document preview data
        const previewData = {
          documentName,
          fileUrl,
          fileName,
          extractedData,
          fields,
          type: stage.documents?.[0]?.documentType || 'document',
          file: {
            name: fileName,
            type: fileName.split('.').pop()?.toLowerCase() || 'pdf',
            url: fileUrl
          }
        };

        setPreviewDocument(previewData);
        console.log('[handleViewDocument] Preview document set successfully');
      } else {
        const errorMessage = `No ${stage.documents?.[0]?.name || 'documents'} uploaded for this stage yet.`;
        console.warn('[handleViewDocument] No document found', { 
          taskId: task?.id, 
          stageId: stage?.id,
          error: errorMessage
        });
        
        toast({
          title: 'No documents found',
          description: errorMessage,
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('[handleViewDocument] Error:', error, { 
        taskId: task?.id, 
        stageId: stage?.id,
        errorMessage: error?.message,
        errorStack: error?.stack
      });
      
      toast({
        title: 'Error',
        description: 'Failed to load document',
        variant: 'destructive',
      });
    } finally {
      console.log('[handleViewDocument] Completed', { taskId: task?.id, stageId: stage?.id });
    }
  }, [getDocumentForTaskStage]);

  // Fetch companies
  const fetchCompanies = async () => {
    try {
      setCompaniesLoading(true)
      const { data, error } = await supabase
        .from('acc_portal_company_duplicate')
        .select('id, company_name')

      if (error) throw error

      if (data) {
        const companyMap = new Map(data.map(c => [c.id, c.company_name]))
        setCompanies(companyMap)
      }
    } catch (error) {
      console.error('Error fetching companies:', error)
      toast({
        title: "Error",
        description: "Failed to load company data.",
        variant: "destructive"
      })
    } finally {
      setCompaniesLoading(false)
    }
  }

  // Fetch tasks with related data
  const fetchTasks = useCallback(async (departmentId?: string) => {
    try {
      setTasksLoading(true)
      let query = supabase
        .from('tm_tasks')
        .select(`*, 
          department:department_id (id, name), 
          subdepartment:subdepartment_id (id, name), 
          current_stage:current_stage_id (id, name, order_num)
        `)
        .order('created_at', { ascending: false })

      if (departmentId) {
        query = query.eq('department_id', departmentId)
      }

      const { data, error } = await query

      if (error) throw error
      setTasks(data || [])
    } catch (error) {
      console.error('Error fetching tasks:', error)
      toast({ title: "Error", description: "Failed to load tasks.", variant: "destructive" })
    } finally {
      setTasksLoading(false)
    }
  }, [])

  // Handle new enquiry creation
  const handleEnquiryCreated = useCallback(async (newEnquiry: any) => {
    try {
      setTasks(prevTasks => [newEnquiry, ...prevTasks])
      await fetchTasks();

      toast({
        title: "Success",
        description: "New enquiry created successfully",
        variant: "default"
      })
    } catch (error) {
      console.error('Error creating enquiry:', error);
      toast({
        title: "Error",
        description: "Failed to create enquiry",
        variant: "destructive"
      });
    }
  }, [fetchTasks])

  // Fetch and process stages for a department
  const fetchStages = async (departmentId: string) => {
    try {
      const department = departments.find(d => d.id.toString() === departmentId.toString())
      if (!department) return

      const uniqueStages = new Map()
      department.stages.forEach(stage => {
        if (!uniqueStages.has(stage.id)) {
          uniqueStages.set(stage.id, { ...stage, departmentId: department.id, departmentName: department.name })
        }
      })
      const allStages = Array.from(uniqueStages.values()).sort((a, b) => (a.order_num || 0) - (b.order_num || 0))
      setStages(allStages)
    } catch (error) {
      console.error('Error fetching stages:', error)
      toast({ title: "Error", description: "Failed to load stages.", variant: "destructive" })
    }
  }

  // Initial data loading
  useEffect(() => {
    const loadInitialData = async () => {
      setDepartmentsLoading(true)
      try {
        const [departmentsData] = await Promise.all([
          fetchDepartments(),
          fetchCompanies(),
          fetchAllDocuments()
        ])
        setDepartments(departmentsData)
        if (departmentsData.length > 0) {
          setActiveDepartmentTab(departmentsData[0].id.toString())
        }
      } catch (error) {
        console.error('Error loading initial data:', error)
        toast({ title: "Error", description: "Failed to load initial data.", variant: "destructive" })
      } finally {
        setDepartmentsLoading(false)
      }
    }
    loadInitialData()
  }, [fetchAllDocuments])

  // Handle task actions
  const handleTaskAction = useCallback((action: { type: string; taskId?: string | number; [key: string]: any }) => {
    switch (action.type) {
      case 'refresh':
      case 'refresh-data':
        if (activeDepartmentTab) {
          fetchTasks(activeDepartmentTab)
          fetchStages(activeDepartmentTab)
          fetchAllDocuments()
        }
        break
      default:
        onTaskAction?.(action)
    }
  }, [activeDepartmentTab, onTaskAction, fetchAllDocuments, fetchTasks])

  // Fetch tasks and stages when department changes
  useEffect(() => {
    if (activeDepartmentTab && departments.length > 0) {
      fetchTasks(activeDepartmentTab)
      fetchStages(activeDepartmentTab)
    }
  }, [activeDepartmentTab, departments, fetchTasks])

  // Get task hierarchy info
  const getTaskHierarchy = useCallback((task: any) => {
    if (!task || !departments.length) return null
    const dept = departments.find(d => d.id === task.department?.id)
    if (!dept) return null
    const subdept = dept.tm_subdepartments?.find(s => s.id === task.subdepartment?.id)
    const cls = subdept?.classes?.find(c => c.id.toString() === task.class_id?.toString())
    const subCls = cls?.subClasses?.find(sc => sc.id.toString() === task.subclass_id?.toString())
    return { department: dept, subdepartment: subdept, class: cls, subclass: subCls }
  }, [departments])

  // Check if stage is applicable to a task
  const isStageApplicableToTask = useCallback((stage: any, task: any, departments: any[]) => {
    if (!task || !departments.length) return false

    const dept = departments.find(d => d.id === task.department?.id)
    if (!dept) return false

    const subdept = dept.tm_subdepartments?.find(s => s.id === task.subdepartment?.id)
    if (!subdept) return false

    const subdeptStage = subdept.stages?.find(s => s.stage_id === stage.id)
    if (subdeptStage && !subdeptStage.applicable) return false

    if (task.class_id) {
      const cls = subdept.classes?.find(c => c.id.toString() === task.class_id.toString())
      if (cls) {
        const classStage = cls.stages?.find(s => s.stage_id === stage.id)
        if (classStage && !classStage.applicable) return false
      }
    }

    return true
  }, [])

  // Filter tasks by department and status
  const getFilteredTasks = useCallback((status?: string) => {
    if (!departments.length || !activeDepartmentTab || !tasks.length) return []
    const currentDept = departments.find(d => d.id.toString() === activeDepartmentTab)
    if (!currentDept) return []
    return tasks.filter(task =>
      task &&
      task.department?.id?.toString() === currentDept.id.toString() &&
      (!status || task.status === status)
    )
  }, [tasks, departments, activeDepartmentTab])

  // Filter WIP tasks by follow-up
  const getWIPTasksByFollowUp = useCallback((followUpFilter: string) => {
    const wipTasks = getFilteredTasks('in_progress')
    if (followUpFilter === 'all') return wipTasks

    return wipTasks.filter(task => {
      if (!task.current_stage) return false
      const currentStage = stages.find(s => s.id === task.current_stage.id)
      if (!currentStage) return false

      const stageFollowUp = currentStage.follow_up?.toLowerCase() || null

      switch (followUpFilter) {
        case 'bcl':
          return stageFollowUp === 'bcl'
        case 'officer':
          return stageFollowUp === 'officer'
        case 'client':
          return stageFollowUp === 'client'
        default:
          return true
      }
    })
  }, [getFilteredTasks, stages])

  // Memoized task lists
  const enquiryTasks = useMemo(() => getFilteredTasks('enquiry'), [getFilteredTasks])
  const wipTasks = useMemo(() => getWIPTasksByFollowUp(activeFollowUpFilter), [getWIPTasksByFollowUp, activeFollowUpFilter])
  const completedTasks = useMemo(() => getFilteredTasks('completed'), [getFilteredTasks])

  // Task actions handlers
  const handleTaskEdit = (task: any) => { setEditingTask(task); setEditDialogOpen(true) }
  const handleTaskUpdate = (updatedTask: any) => { onTaskUpdate?.(updatedTask); setEditDialogOpen(false); setEditingTask(null) }

  // Export to CSV
  const handleExport = useCallback((tasks: any[], tableType: string) => {
    if (!tasks.length) {
      toast({ title: "No Data", description: "No data available to export.", variant: "destructive" })
      return
    }
    toast({ title: "Export Successful", description: `${tableType} data exported.` })
  }, [])

  // Generate enhanced table rows for transposed view
  const generateEnhancedTableRows = useCallback((tasks: Task[]) => {
    if (!tasks.length) return []

    const allStages = stages.filter(stage => stage).sort((a, b) => (a.order_num || 0) - (b.order_num || 0))
    const rows = []

    rows.push({ key: 'section_header_case_details', type: 'section_header', label: 'Case Details', id: 'case_details', icon: Users });

    if (expandedSections.has('case_details')) {
      rows.push({ key: 'task_id', label: 'Task ID', type: 'basic', getValue: (task: any) => `${task.id}` })
      rows.push({ key: 'job_description', label: 'Job Description', type: 'basic', getValue: (task: any) => task.job_description || 'N/A' })
      rows.push({ key: 'status', label: 'Status', type: 'badge', getValue: (task: any) => task.status || 'pending' })
      rows.push({ key: 'applicant_name', label: 'Applicant Name', type: 'basic', getValue: (task: any) => task.applicant_name || 'N/A' })
      rows.push({ key: 'company_name', label: 'Company Name', type: 'basic', getValue: (task: any) => companies.get(task.company_id) || 'N/A' })
      rows.push({ key: 'department', label: 'Department', type: 'basic', getValue: (task: any) => getTaskHierarchy(task)?.department?.name || 'N/A' })
      rows.push({ key: 'subdepartment', label: 'Subdepartment', type: 'basic', getValue: (task: any) => getTaskHierarchy(task)?.subdepartment?.name || 'N/A' })
      rows.push({ key: 'task_manager', label: 'Task Manager', type: 'basic', getValue: (task: any) => task.task_manager?.name || task.task_manager?.email || 'Unassigned' })
      rows.push({ key: 'renewal_status', label: 'New/Renewal', type: 'badge', getValue: (task: any) => task.renewal_status || 'New' })
      rows.push({ key: 'created_at', label: 'Created Date', type: 'date', getValue: (task: any) => task.created_at ? format(parseISO(task.created_at), 'dd MMM, yyyy') : 'N/A' })
    }

    rows.push({ key: 'section_header_stages', type: 'section_header', label: 'Stages', id: 'stages', icon: Briefcase });

    if (expandedSections.has('stages')) {
      allStages.forEach(stage => {
        rows.push({
          key: `stage_${stage.id}`,
          label: `${stage.name}`,
          type: 'stage',
          stage,
          getValue: (task: Task) => isStageApplicableToTask(stage, task, departments) ? task.stages?.[stage.id] : 'N/A'
        })

        if (expandedStages.has(stage.id) && stage.documents && stage.documents.length > 0) {
          stage.documents.forEach(doc => {
            rows.push({
              key: `doc_${stage.id}_${doc.id}`,
              label: `${doc.name}`,
              type: 'document',
              stage,
              document: doc,
              isSubRow: true,
              getValue: (task: Task) => getDocumentForTaskStage(task, { ...stage, documents: [doc] }) ? 'Uploaded' : 'Not Uploaded'
            })

            if (expandedDocuments.has(doc.id) && doc.extractionSpecs && doc.extractionSpecs.length > 0) {
              doc.extractionSpecs.forEach(field => {
                rows.push({
                  key: `field_${stage.id}_${doc.id}_${field.id || field.fieldName}`,
                  label: `${field.fieldName}`,
                  type: 'field',
                  stage,
                  document: doc,
                  field,
                  isSubRow: true,
                  isSubSubRow: true,
                  getValue: (task: Task) => {
                    const document = getDocumentForTaskStage(task, { ...stage, documents: [doc] })
                    if (!document || !document.extracted_details) return 'N/A'
                    return document.extracted_details[field.fieldName] || document.extracted_details[field.id] || 'N/A'
                  }
                })
              })
            }
          })
        }
      })
    }
    
    rows.push({ key: 'actions_row', label: 'Actions', type: 'actions' })

    return rows
  }, [departments, stages, companies, getTaskHierarchy, isStageApplicableToTask, expandedSections, expandedStages, expandedDocuments, getDocumentForTaskStage])

  // Render cell content for transposed view
  const renderCellContent = useCallback((row: any, task: any) => {
    const value = row.getValue ? row.getValue(task) : ''

    if (value === 'N/A') {
      return <span className="text-sm text-gray-400 italic">N/A</span>
    }

    switch (row.type) {
      case 'basic': return <span className="text-sm font-medium text-slate-800">{value}</span>
      case 'badge': return <Badge variant={value === 'completed' ? 'success' : value === 'in_progress' ? 'secondary' : 'outline'} className="text-xs font-semibold">{value}</Badge>
      case 'date': return <span className="text-sm text-slate-600">{value}</span>
      case 'stage':
        return (
          <EditableStageCell
            stage={row.stage}
            task={task}
            value={value}
            onSave={handleStageStatusSave}
            onDocumentUpload={handleStageDocumentUpload}
            // onShowDocuments={onViewStageDocument}
          />
        )
      case 'document':
        return (
          <div className="flex items-center gap-2 justify-center">
            <Badge variant={value === 'Uploaded' ? 'success' : 'outline'} className="text-xs">
              {value}
            </Badge>
            {value === 'Uploaded' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-green-600 hover:bg-green-100"
                onClick={() => handleViewDocument(task, { ...row.stage, documents: [row.document] })}
              >
                <Eye className="h-3 w-3" />
              </Button>
            )}
          </div>
        )
      case 'field':
        return <span className="text-xs text-gray-700">{value}</span>
      case 'actions': return (
        <div className="flex items-center justify-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => handleTaskEdit(task)} className="h-8 w-8 text-blue-600 hover:bg-blue-100"><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onTaskAction?.({type: 'delete', task})} className="h-8 w-8 text-red-600 hover:bg-red-100"><Trash2 className="h-4 w-4" /></Button>
        </div>
      )
      default: return <span className="text-sm text-slate-800">{value}</span>
    }
  }, [allDocuments, handleStageDocumentUpload, handleViewDocument, onTaskAction, handleTaskEdit])

  // Render enhanced transposed table
  const renderEnhancedTransposedTable = useCallback((tasks: any[], tableType: string) => {
    const rows = generateEnhancedTableRows(tasks)

    if (!tasks.length) {
      return (
        <div className="flex flex-col items-center justify-center p-16 bg-blue-50/30 rounded-lg border-2 border-dashed border-gray-200">
          <FileText className="h-12 w-12 text-gray-400" />
          <p className="mt-4 font-semibold text-gray-700">No {tableType} found</p>
          <p className="text-sm text-gray-500">Tasks with this status will appear here.</p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={expandAll}><Plus className="h-4 w-4" />Expand All</Button>
          <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={collapseAll}><Minus className="h-4 w-4" />Collapse All</Button>
        </div>

        <div className="border border-gray-200 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 400px)' }}>
          <Table className="min-w-full">
            <TableHeader className="sticky top-0 z-20 bg-blue-100/80 backdrop-blur-sm">
              <TableRow className="border-b-2 border-gray-200">
                <TableHead className="sticky left-0 z-30 bg-blue-600 font-bold text-white text-sm py-3 border-r border-blue-500 w-[60px] text-center">#</TableHead>
                <TableHead className="sticky left-[60px] z-30 bg-blue-600 font-bold text-white text-sm py-3 border-r border-blue-500 min-w-[250px]">Fields</TableHead>
                {tasks.map((task, index) => (
                  <TableHead key={`header-${task.id}`} className="font-semibold bg-blue-700 text-white min-w-[180px] text-center text-sm py-2 border-r border-blue-500">
                    <div className="flex flex-col items-center">
                       <span>{task.applicant_name || `Task ${task.id}`}</span>
                       <span className="text-xs opacity-75">{companies.get(task.company_id) || 'No Company'}</span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            
            <TableBody>
              {(tasksLoading || departmentsLoading || companiesLoading) ? (
                <TableRow>
                  <TableCell colSpan={tasks.length + 1} className="h-32 text-center">
                    <div className="flex justify-center items-center gap-2 text-blue-600">
                      <div className="h-5 w-5 border-2 border-t-blue-600 border-gray-200 rounded-full animate-spin"></div>
                      Loading {tableType}...
                    </div>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={tasks.length + 1} className="h-32 text-center text-red-600">
                    <div className="flex justify-center items-center gap-2"><AlertTriangle className="h-5 w-5" />{error}</div>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => {
                    if (row.type === 'section_header') {
                        const Icon = row.icon;
                        return (
                            <TableRow key={row.key} className="bg-gradient-to-r from-slate-100 to-slate-50 border-y-2 border-slate-300">
                                <TableCell colSpan={2} className="py-0 px-0 border-r border-slate-200">
                                  <div className="flex items-center justify-between px-3 py-2">
                                    <div className="flex items-center gap-3">
                                        <Icon className="h-5 w-5 text-slate-600" />
                                        <span className="font-bold text-slate-700 text-lg">{row.label}</span>
                                    </div>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleSectionExpansion(row.id)}>
                                        {expandedSections.has(row.id) ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                    </Button>
                                  </div>
                                </TableCell>
                             <TableCell  colSpan={tasks.length + 1} className="py-0 px-0 border-r border-slate-200"></TableCell>
                            </TableRow>
                        )
                    }

                    const rowBg = row.isSubSubRow ? 'bg-blue-25' : row.isSubRow ? 'bg-blue-50' : 'bg-white';
                    const hoverBg = row.isSubSubRow ? 'hover:bg-blue-50' : row.isSubRow ? 'hover:bg-blue-100' : 'hover:bg-slate-50';
                    
                    return (
                        <TableRow key={row.key} className={`${rowBg} ${hoverBg} border-b border-gray-100 group`}>
                            <TableCell className={`sticky left-0 z-10 ${rowBg} group-hover:${hoverBg.replace('hover:','')}-50 border-r border-gray-200 text-center text-sm text-slate-600 py-2 w-[60px]`}>
                              {row.type === 'basic' || row.type === 'badge' || row.type === 'date' ? (index + 1) : ''}
                            </TableCell>
                            <TableCell className={`sticky left-[60px] z-10 ${rowBg} group-hover:${hoverBg.replace('hover:','')}-50 border-r border-gray-200 font-semibold text-sm text-slate-700 py-2`}>
                                <div className="flex items-center gap-2">
                                  <div style={{ paddingLeft: row.isSubSubRow ? '32px' : row.isSubRow ? '16px' : '0px' }}>
                                    <TruncatedText text={row.label} maxLength={35} className="text-slate-700" />
                                  </div>
                                    {row.type === 'stage' && row.stage?.documents?.length > 0 && (
                                        <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-slate-600 hover:bg-slate-100" onClick={() => toggleStageExpansion(row.stage.id)}>
                                            {expandedStages.has(row.stage.id) ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                        </Button>
                                    )}
                                    {row.type === 'document' && row.document?.extractionSpecs?.length > 0 && (
                                        <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-slate-600 hover:bg-slate-100" onClick={() => toggleDocumentExpansion(row.document.id)}>
                                            {expandedDocuments.has(row.document.id) ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                        </Button>
                                    )}
                                </div>
                            </TableCell>
                            {tasks.map(task => (
                                <TableCell key={`${row.key}-${task.id}`} className="border-r border-gray-100 text-center text-sm py-2 px-3">
                                    {renderCellContent(row, task)}
                                </TableCell>
                            ))}
                        </TableRow>
                    )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }, [generateEnhancedTableRows, tasksLoading, departmentsLoading, companiesLoading, error, renderCellContent, expandedSections, expandedStages, expandedDocuments, toggleSectionExpansion, toggleStageExpansion, toggleDocumentExpansion, companies])

  // Enhanced normal table with better nested structure handling
  const renderEnhancedNormalTable = useCallback((tasks: any[], tableType: string) => {
    if (!tasks.length) {
      return (
        <div className="flex flex-col items-center justify-center p-16 bg-blue-50/30 rounded-lg border-2 border-dashed border-gray-200">
          <FileText className="h-12 w-12 text-gray-400" />
          <p className="mt-4 font-semibold text-gray-700">No {tableType} found</p>
          <p className="text-sm text-gray-500">Tasks with this status will appear here.</p>
        </div>
      )
    }

    const visibleStages = stages.filter(stage => stage).sort((a, b) => (a.order_num || 0) - (b.order_num || 0))

    const totalStageColumns = visibleStages.reduce((total, stage) => {
        let stageCols = 0;
        if (expandedStages.has(stage.id) && stage.documents && stage.documents.length > 0) {
            stage.documents.forEach(doc => {
                if (expandedDocuments.has(doc.id) && doc.extractionSpecs && doc.extractionSpecs.length > 0) {
                    stageCols += doc.extractionSpecs.length;
                } else {
                    stageCols += 1;
                }
            });
        } else {
            stageCols = 1;
        }
        return total + Math.max(1, stageCols);
    }, 0);

    return (
      <div className="border border-gray-200 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 350px)' }}>
        <Table className="min-w-full border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-20 bg-blue-100/80 backdrop-blur-sm">
            <TableRow className="h-12">
              <TableHead rowSpan={2} className="sticky left-0 bg-blue-600 border-r border-blue-500 w-[40px] z-30 text-white font-semibold text-center">#</TableHead>
              <TableHead rowSpan={2} className="sticky left-[40px] bg-blue-600 border-r border-blue-500 w-[80px] z-30 text-white font-semibold">ID</TableHead>
              <TableHead rowSpan={2} className="sticky left-[80px] bg-blue-600 border-r border-blue-500 w-[150px] z-30 text-white font-semibold">Applicant</TableHead>
              <TableHead rowSpan={2} className="bg-blue-600 border-r border-blue-500 text-white font-semibold text-center min-w-[120px]">Company</TableHead>
              <TableHead rowSpan={2} className="bg-blue-600 border-r border-blue-500 text-white font-semibold text-center min-w-[100px]">Status</TableHead>
              <TableHead colSpan={totalStageColumns} className="bg-blue-700 border-r border-blue-500 text-white text-center font-bold px-2">
                 <div className="flex items-center justify-center gap-2">
                  WORKFLOW STAGES
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-white hover:bg-blue-500" onClick={expandAll} title="Expand All"><Plus className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-white hover:bg-blue-500" onClick={collapseAll} title="Collapse All"><Minus className="h-3 w-3" /></Button>
                </div>
              </TableHead>
              <TableHead rowSpan={2} className="bg-blue-600 border-r border-blue-500 text-white font-semibold text-center min-w-[100px]">Actions</TableHead>
            </TableRow>
            <TableRow className="h-14">
              {visibleStages.map((stage) => {
                let stageCols = 0;
                let subHeaders = [];

                if (expandedStages.has(stage.id) && stage.documents?.length > 0) {
                    stage.documents.forEach(doc => {
                        if (expandedDocuments.has(doc.id) && doc.extractionSpecs?.length > 0) {
                            stageCols += doc.extractionSpecs.length;
                            doc.extractionSpecs.forEach(field => subHeaders.push({type: 'field', name: field.fieldName}));
                        } else {
                            stageCols += 1;
                            subHeaders.push({type: 'doc', name: doc.name, id: doc.id, hasFields: doc.extractionSpecs?.length > 0 });
                        }
                    });
                } else {
                    stageCols = 1;
                }
                stageCols = Math.max(1, stageCols);
                
                if (!expandedStages.has(stage.id) || stage.documents?.length === 0) {
                    return (
                         <TableHead key={stage.id} className="bg-blue-500 border-r border-blue-400 text-white text-center font-semibold min-w-[150px] px-2 py-2">
                             <div className="flex items-center justify-center gap-2">
                                <span className="truncate max-w-[100px]" title={stage.name}>{stage.name}</span>
                                {stage.documents?.length > 0 && (
                                    <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-white hover:bg-blue-400" onClick={() => toggleStageExpansion(stage.id)}>
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>
                         </TableHead>
                    );
                } else {
                    return (
                        <TableHead key={stage.id} colSpan={stageCols} className="bg-blue-500 border-r border-blue-400 text-white text-center font-semibold p-0">
                           <div className="flex flex-col h-full">
                                <div className="flex items-center justify-center gap-2 px-2 py-1 border-b border-blue-400">
                                    <span className="truncate max-w-[100px]" title={stage.name}>{stage.name}</span>
                                    <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-white hover:bg-blue-400" onClick={() => toggleStageExpansion(stage.id)}>
                                        <Minus className="h-3 w-3" />
                                    </Button>
                                </div>
                                <div className="flex-grow grid" style={{gridTemplateColumns: `repeat(${stageCols}, 1fr)`}}>
                                    {subHeaders.map((sub, i) => (
                                        <div key={i} className="text-xs font-normal bg-blue-400 border-r border-blue-300 last:border-r-0 flex items-center justify-center p-1 gap-1">
                                            <span className="truncate" title={sub.name}>{sub.name}</span>
                                            {sub.type === 'doc' && sub.hasFields && (
                                                 <Button variant="ghost" size="icon" className="h-4 w-4 p-0 text-white hover:bg-blue-300" onClick={() => toggleDocumentExpansion(sub.id)}>
                                                    <Plus className="h-2 w-2" />
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                           </div>
                        </TableHead>
                    );
                }
              })}
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y divide-gray-200">
            {(tasksLoading || departmentsLoading || companiesLoading) ? (
              <TableRow><TableCell colSpan={20} className="h-32 text-center text-gray-500">Loading...</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={20} className="h-32 text-center text-destructive">{error}</TableCell></TableRow>
            ) : (
              tasks.map((task) => (
                <TableRow key={task.id} className="group bg-white hover:bg-blue-50">
                  <TableCell className="sticky left-0 z-10 group-hover:bg-blue-50 bg-white border-r border-gray-200 text-sm text-slate-600 py-2 text-center">
                    {tasks.indexOf(task) + 1}
                  </TableCell>
                  <TableCell className="sticky left-[40px] z-10 group-hover:bg-blue-50 bg-white border-r border-gray-200 font-semibold text-sm text-slate-700 py-2">#{task.id}</TableCell>
                  <TableCell className="sticky left-[80px] z-10 group-hover:bg-blue-50 bg-white border-r border-gray-200 font-medium text-sm text-slate-700 py-2"><div className="max-w-[130px] truncate" title={task.applicant_name}>{task.applicant_name || 'N/A'}</div></TableCell>
                  <TableCell className="border-r border-gray-200 text-center text-sm py-2 px-3"><div className="max-w-[110px] truncate" title={companies.get(task.company_id)}>{companies.get(task.company_id) || 'N/A'}</div></TableCell>
                  <TableCell className="border-r border-gray-200 text-center text-sm py-2 px-3"><Badge variant={task.status === 'completed' ? 'success' : task.status === 'in_progress' ? 'secondary' : 'outline'} className="text-xs font-semibold">{task.status || 'pending'}</Badge></TableCell>

                  {visibleStages.map(stage => {
                      if (!isStageApplicableToTask(stage, task, departments)) {
                        let stageCols = 1;
                         if (expandedStages.has(stage.id) && stage.documents?.length > 0) {
                           stageCols = stage.documents.reduce((acc, doc) => acc + (expandedDocuments.has(doc.id) && doc.extractionSpecs?.length > 0 ? doc.extractionSpecs.length : 1), 0);
                         }
                        return <TableCell key={`${stage.id}-na`} colSpan={Math.max(1, stageCols)} className="border-r border-gray-200 text-center text-gray-400 italic text-xs">N/A</TableCell>
                      }

                      if (!expandedStages.has(stage.id) || !stage.documents || stage.documents.length === 0) {
                        return <TableCell key={stage.id} className="border-r border-gray-200"><EditableStageCell stage={stage} task={task} value={task.stages?.[stage.id]} allDocuments={allDocuments} onDocumentUpload={handleStageDocumentUpload} onViewDocument={handleViewDocument} /></TableCell>
                      }

                      return stage.documents.map(doc => {
                        const document = getDocumentForTaskStage(task, { ...stage, documents: [doc] })
                        if (!expandedDocuments.has(doc.id) || !doc.extractionSpecs || doc.extractionSpecs.length === 0) {
                            return <TableCell key={`${doc.id}`} className="border-r border-gray-200"><EditableStageCell stage={{ ...stage, documents: [doc] }} task={task} value={task.stages?.[stage.id]} allDocuments={allDocuments} onDocumentUpload={handleStageDocumentUpload} onViewDocument={handleViewDocument}/></TableCell>
                        } else {
                            return doc.extractionSpecs.map(field => (
                                <TableCell key={`${field.id || field.fieldName}`} className="border-r border-gray-200"><DocumentFieldCell document={document} field={field} task={task} /></TableCell>
                            ))
                        }
                      }).flat()
                  })}

                  <TableCell className="border-r border-gray-200 text-center text-sm py-2 px-3">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleTaskEdit(task)} className="h-8 w-8 text-blue-600 hover:bg-blue-100"><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => onTaskAction?.({type: 'delete', task})} className="h-8 w-8 text-red-600 hover:bg-red-100"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    )
  }, [stages, tasksLoading, departmentsLoading, companiesLoading, error, companies, isStageApplicableToTask, expandedStages, expandedDocuments, allDocuments, handleStageDocumentUpload, handleViewDocument, getDocumentForTaskStage, onTaskAction, handleTaskEdit, toggleStageExpansion, toggleDocumentExpansion])


  if (departmentsLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-blue-50/30">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto"></div>
          <p className="font-semibold text-blue-800">Loading Workspace...</p>
          <p className="text-sm text-blue-600">Fetching departments and tasks.</p>
        </div>
      </div>
    )
  }

  if (!departments.length) {
    return (
      <div className="flex-1 p-8 bg-blue-50/30">
        <Card className="border-2 border-dashed border-gray-300 bg-white">
          <CardHeader className="text-center items-center">
            <Building className="h-12 w-12 text-blue-400 mb-2" />
            <CardTitle className="text-xl">No Departments Found</CardTitle>
            <CardDescription className="text-blue-700">Please add departments via the Admin panel to start managing tasks.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => window.location.href = '/dashboard/departments'}>Go to Departments</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 bg-blue-50/30 min-h-screen">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Enhanced Task Manager</h2>
        </div>
      </div>

      <Tabs value={activeDepartmentTab} onValueChange={setActiveDepartmentTab} className="space-y-4">
        <TabsList className="grid w-full rounded-lg p-1 shadow-sm" style={{ gridTemplateColumns: `repeat(${departments.length}, 1fr)` }}>
          {departments.map(dept => (
            <TabsTrigger key={dept.id} value={dept.id.toString()} className="text-sm font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
              {dept.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {departments.map(dept => (
          <TabsContent key={dept.id} value={dept.id.toString()} className="space-y-4">
            <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
              <TabsList className="rounded-lg p-1 shadow-sm">
                <TabsTrigger value="enquiries" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                  Enquiries
                  <Badge variant="secondary">{enquiryTasks.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="wip-stages" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                  WIP Stages
                  <Badge variant="secondary">{getFilteredTasks('in_progress').length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="completed" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                  Completed
                  <Badge variant="secondary">{completedTasks.length}</Badge>
                </TabsTrigger>
              </TabsList>

              {/* WIP Stages Tab */}
              <TabsContent value="wip-stages" className="mt-4">
                <Card className="bg-white/80 backdrop-blur-sm shadow-md border-gray-100">
                  <CardHeader className="border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg text-slate-800">Enhanced WIP Stages - {dept.name}</CardTitle>
                        <CardDescription className="text-slate-600">
                          {isTransposedView ? 'Transposed view with expandable sections' : 'Interactive view with expandable documents and extraction fields'}.
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1 md:w-80">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Search tasks, names, companies..."
                            value={globalSearchTerm}
                            onChange={(e) => setGlobalSearchTerm(e.target.value)}
                            className="pl-10 pr-4"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2"
                          onClick={() => setIsTransposedView(!isTransposedView)}
                        >
                          {isTransposedView ? <TableProperties className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                          {isTransposedView ? 'Standard View' : 'Transposed View'}
                        </Button>
                        <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => handleExport(wipTasks, 'wip-stages')}>
                          <Download className="h-4 w-4" />Export
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4">
                      <Tabs value={activeFollowUpFilter} onValueChange={setActiveFollowUpFilter}>
                        <TabsList className="rounded-lg p-1 shadow-sm bg-slate-100">
                          <TabsTrigger value="all" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">All <Badge variant="outline">{getWIPTasksByFollowUp('all').length}</Badge></TabsTrigger>
                          <TabsTrigger value="bcl" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">BCL <Badge variant="outline">{getWIPTasksByFollowUp('bcl').length}</Badge></TabsTrigger>
                          <TabsTrigger value="officer" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">Officer <Badge variant="outline">{getWIPTasksByFollowUp('officer').length}</Badge></TabsTrigger>
                          <TabsTrigger value="client" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">Client <Badge variant="outline">{getWIPTasksByFollowUp('client').length}</Badge></TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 sm:p-4">
                    {isTransposedView ? renderEnhancedTransposedTable(wipTasks, 'WIP Stages') : renderEnhancedNormalTable(wipTasks, 'WIP Stages')}
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Other Tabs (Enquiries, Completed) follow a similar structure */}
              <TabsContent value="enquiries" className="mt-4">
                 <Card className="bg-white/80 backdrop-blur-sm shadow-md border-gray-100">
                   <CardHeader className="border-b border-gray-100 bg-white">
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                        <div>
                          <CardTitle className="text-lg text-slate-800">Enquiries - {dept.name}</CardTitle>
                          <CardDescription className="text-slate-600">{isTransposedView ? 'Transposed view' : 'Standard view'}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                           <Button className="flex items-center gap-2" onClick={() => setIsEnquiryDialogOpen(true)}><Plus className="h-4 w-4" />New Enquiry</Button>
                           <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => setIsTransposedView(!isTransposedView)}>
                             {isTransposedView ? <TableProperties className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                             {isTransposedView ? 'Standard View' : 'Transposed View'}
                           </Button>
                           <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => handleExport(enquiryTasks, 'enquiries')}><Download className="h-4 w-4" />Export</Button>
                        </div>
                      </div>
                   </CardHeader>
                   <CardContent className="p-2 sm:p-4">
                      {isTransposedView ? renderEnhancedTransposedTable(enquiryTasks, 'Enquiries') : renderEnhancedNormalTable(enquiryTasks, 'Enquiries')}
                   </CardContent>
                 </Card>
              </TabsContent>

              <TabsContent value="completed" className="mt-4">
                 <Card className="bg-white/80 backdrop-blur-sm shadow-md border-gray-100">
                   <CardHeader className="border-b border-gray-100 bg-white">
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                        <div>
                          <CardTitle className="text-lg text-slate-800">Completed Tasks - {dept.name}</CardTitle>
                          <CardDescription className="text-slate-600">{isTransposedView ? 'Transposed view' : 'Standard view'}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                           <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => setIsTransposedView(!isTransposedView)}>
                             {isTransposedView ? <TableProperties className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                             {isTransposedView ? 'Standard View' : 'Transposed View'}
                           </Button>
                           <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => handleExport(completedTasks, 'completed')}><Download className="h-4 w-4" />Export</Button>
                        </div>
                      </div>
                   </CardHeader>
                   <CardContent className="p-2 sm:p-4">
                      {isTransposedView ? renderEnhancedTransposedTable(completedTasks, 'Completed Tasks') : renderEnhancedNormalTable(completedTasks, 'Completed Tasks')}
                   </CardContent>
                 </Card>
              </TabsContent>

            </Tabs>
          </TabsContent>
        ))}
      </Tabs>

      <EditTaskDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        task={editingTask}
        departments={departments}
        onTaskUpdate={handleTaskUpdate}
      />

      <EnquiryDialog
        open={isEnquiryDialogOpen}
        onOpenChange={setIsEnquiryDialogOpen}
        onEnquiryCreated={handleEnquiryCreated}
      />

      <StageUploadDialog
        open={isStageUploadDialogOpen}
        onOpenChange={setIsStageUploadDialogOpen}
        selectedStageTask={selectedStageTask}
        getCurrentRequirements={getCurrentRequirements}
        fuzzyMatch={() => false}
        onTaskAction={handleTaskAction}
      />
    </div>
  )
}