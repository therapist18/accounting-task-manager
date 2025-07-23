// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TruncatedText } from "@/app/(dashboard)/dashboard/departments/documents+fields/types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
// Corrected: Added Link icon for the new button
import { Eye, ChevronDown, Plus, Minus, Loader2, Settings, Search, Users, X, TableProperties, RotateCcw, Pencil, AlertTriangle, Send, DownloadCloud, ArrowUpDown, ArrowUp, ArrowDown, Link as LinkIcon, FileArchive } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, Edit, Trash2, Download, Building, Upload, Briefcase } from "lucide-react"
import { EnquiryDialog } from "./components/EnquiryDialog"
import { format, parseISO, isAfter, isEqual, isValid, parse, startOfToday } from 'date-fns';
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { EditTaskDialog } from "./components/EditTaskDialog"
import { fetchDepartments } from "../departments/departments/database"
import { DepartmentTasksManagerProps, Task } from "./components/types"
import { StageUploadDialog } from "./components/StageUploadDialog"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import EditableStageCell from "./components/EditableStageCell"
import ExtractionPreview from "@/components/ExtractionPreview"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { fetchTasks, fetchStages, fetchCompanies, fetchAllDocuments, fetchAllKycFields, fetchKycDocument, isDocumentOlderThanTask, formatDateValue, type Task as UtilTask, type Department, type KycDocument, type Document } from "./utils/taskManagerData"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

interface LinkSourceDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: UtilTask;
  stages: any[];
  allDocuments: Document[];
  kycDocuments: Map<string, KycDocument>;
  onLinkSuccess: () => void;
  isStageApplicableToTask: (stage: any, task: any) => boolean;
}

// Import extracted components
import { LinkSourceDocumentDialog } from './components/LinkSourceDocumentDialog';
import { DocumentFieldCell } from './components/DocumentFieldCell';
import { DocumentStageCell } from './components/DocumentStageCell';

const ENHANCED_TABLE_HEADERS = [
  { id: 'id', label: 'Task ID', default: true, width: 'w-20' },
  { id: 'applicant_name', label: 'Applicant Name', default: true, width: 'w-48' },
  { id: 'current_immigration_status', label: 'Current Immigration Status', default: true, width: 'w-64' },
  { id: 'company_name', label: 'Company Name', default: true, width: 'w-48' },
  { id: 'job_level', label: 'Job Level', default: true, width: 'w-32' },
  { id: 'renewal_new', label: 'Renewal/New', default: false, width: 'w-28' },
  { id: 'case_status', label: 'Case Status', default: false, width: 'w-28' },
  { id: 'nationality', label: 'Nationality', default: false, width: 'w-32' },
  { id: 'age', label: 'Age', default: false, width: 'w-20' },
  { id: 'task_manager', label: 'Task Manager', default: false, width: 'w-32' },
  { id: 'officer', label: 'Officer', default: false, width: 'w-32' },
  { id: 'task_assistant', label: 'Task Assistant', default: false, width: 'w-32' },
]
// Stats options
const STATS_HEADERS = [
  { id: 'stats_completed', label: 'Completed Stages', default: true },
  { id: 'stats_pending', label: 'Pending Stages', default: true },
  { id: 'stats_na', label: 'N/A Stages', default: false },
]

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
  // State management
  const [departments, setDepartments] = useState<Department[]>([])
  const [companies, setCompanies] = useState<Map<number, string>>(new Map())
  const [activeDepartmentTab, setActiveDepartmentTab] = useState<string>("")
  const [activeSubTab, setActiveSubTab] = useState<string>("wip-stages")
  const [activeSubdepartmentTab, setActiveSubdepartmentTab] = useState<string>("")
  const [activeFollowUpFilter, setActiveFollowUpFilter] = useState<string>("all")
  const [isTransposedView, setIsTransposedView] = useState<boolean>(true)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<any>(null)
  const [tasks, setTasks] = useState<UtilTask[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [allDocuments, setAllDocuments] = useState<Document[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [isEnquiryDialogOpen, setIsEnquiryDialogOpen] = useState(false)
  const [selectedStageTask, setSelectedStageTask] = useState<{ task: any, stage: any } | null>(null)
  const [isStageUploadDialogOpen, setIsStageUploadDialogOpen] = useState(false)
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
  const [isPushingCase, setIsPushingCase] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [globalSearchTerm, setGlobalSearchTerm] = useState<string>('')
  const [visibleHeaders, setVisibleHeaders] = useState<Set<string>>(
    new Set(ENHANCED_TABLE_HEADERS.filter(h => h.default).map(h => h.id))
  )
  const [visibleStats, setVisibleStats] = useState<Set<string>>(
    new Set(STATS_HEADERS.filter(h => h.default).map(h => h.id))
  )
  const [visibleStageIds, setVisibleStageIds] = useState<Set<string>>(new Set())
  const [expandedDependants, setExpandedDependants] = useState<Set<string>>(new Set())
  const [kycDocuments, setKycDocuments] = useState<Map<string, KycDocument>>(new Map())
  const [allKycFields, setAllKycFields] = useState<Record<string, any[]>>({})
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['case_details', 'stages']))
  const [expandedImmigrationStatus, setExpandedImmigrationStatus] = useState<Set<string>>(new Set())
  const [tmUsers, setTmUsers] = useState<Map<number, any>>(new Map())

  // NEW: State for the LinkSourceDocumentDialog
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkingTask, setLinkingTask] = useState<UtilTask | null>(null);

  const [dataLoading, setDataLoading] = useState({
    departments: true,
    companies: true,
    documents: true,
    kycFields: true,
    tasks: true,
    stages: false,
    users: true
  })

  // NEW LOGIC: This function now ONLY returns a document if it's explicitly linked in `source_document_id`.
  // This enforces the new workflow where documents must be linked to be displayed.
  const getDocumentForTaskStage = useCallback((
    task: UtilTask,
    stage: { id: string; documents?: { kycId: string }[] },
  ): Document | undefined => {
    // 1. Check for a specifically linked source document for this stage
    const linkedDocumentId = task.source_document_id?.[stage.id];
    if (linkedDocumentId) {
      // Find the document instance from allDocuments by its unique ID
      const linkedDoc = allDocuments.find(doc => doc.id === linkedDocumentId);
      return linkedDoc;
    }

    // 2. If no document is linked for this stage, return undefined.
    // The UI will now only show documents that are explicitly linked.
    return undefined;
  }, [allDocuments]);


  // NEW: Function to fetch tm_users data
  const fetchTmUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('tm_users')
        .select('*')

      if (error) throw error

      const usersMap = new Map()
      data?.forEach(user => {
        const displayName = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email
        usersMap.set(user.id, {
          ...user,
          display_name: displayName
        })
      })

      setTmUsers(usersMap)
      return usersMap
    } catch (error) {
      console.error('Error fetching tm_users:', error)
      return new Map()
    }
  }, [])

  // Load all initial data
  const loadInitialData = useCallback(async () => {
    try {
      setDataLoading(prev => ({ ...prev, departments: true, companies: true, documents: true, kycFields: true, users: true }))

      // Load departments first
      const departmentsData = await fetchDepartments()
      setDepartments(departmentsData)
      setDataLoading(prev => ({ ...prev, departments: false }))

      // Set initial active department
      if (departmentsData.length > 0) {
        setActiveDepartmentTab(departmentsData[0].id.toString())
        // Set first default subdepartment as active
        const firstDept = departmentsData[0]
        const defaultSubs = firstDept.tm_subdepartments?.filter(sub => sub.default_display) || []
        if (defaultSubs.length > 0) {
          setActiveSubdepartmentTab(defaultSubs[0].id.toString())
        }
      }

      // Load other data in parallel
      const [companiesData, documentsData, kycFieldsData, usersData] = await Promise.all([
        fetchCompanies(),
        fetchAllDocuments(),
        fetchAllKycFields(),
        fetchTmUsers()
      ])

      setCompanies(companiesData)
      setDataLoading(prev => ({ ...prev, companies: false }))

      setAllDocuments(documentsData)
      setDataLoading(prev => ({ ...prev, documents: false }))

      setAllKycFields(kycFieldsData.fieldsMap)
      setKycDocuments(kycFieldsData.kycDocsMap)
      setDataLoading(prev => ({ ...prev, kycFields: false }))

      setTmUsers(usersData)
      setDataLoading(prev => ({ ...prev, users: false }))

    } catch (error) {
      console.error('Error loading initial data:', error)
      toast({
        title: "Error",
        description: "Failed to load initial data.",
        variant: "destructive"
      })
      setDataLoading({
        departments: false,
        companies: false,
        documents: false,
        kycFields: false,
        tasks: false,
        stages: false,
        users: false
      })
    }
  }, [fetchTmUsers])

  // Load tasks data
  const loadTasksData = useCallback(async (departmentId?: string, subdepartmentId?: string) => {
    try {
      setDataLoading(prev => ({ ...prev, tasks: true, stages: true }))

      const [tasksData, stagesData] = await Promise.all([
        fetchTasks(departmentId, subdepartmentId),
        departmentId ? fetchStages(departmentId, departments) : Promise.resolve([])
      ])

      setTasks(tasksData)
      setDataLoading(prev => ({ ...prev, tasks: false }))

      setStages(stagesData)
      setDataLoading(prev => ({ ...prev, stages: false }))

    } catch (error) {
      console.error('Error loading tasks data:', error)
      toast({
        title: "Error",
        description: "Failed to load tasks data.",
        variant: "destructive"
      })
      setDataLoading(prev => ({ ...prev, tasks: false, stages: false }))
    }
  }, [departments])

  // Refresh all data
  const refreshAllData = useCallback(async () => {
    try {
      const [documentsData, kycFieldsData, usersData] = await Promise.all([
        fetchAllDocuments(),
        fetchAllKycFields(),
        fetchTmUsers()
      ])

      setAllDocuments(documentsData)
      setAllKycFields(kycFieldsData.fieldsMap)
      setKycDocuments(kycFieldsData.kycDocsMap)
      setTmUsers(usersData)

      // Refresh tasks and stages
      if (activeDepartmentTab) {
        await loadTasksData(activeDepartmentTab, activeSubdepartmentTab)
      }

      toast({
        title: "Success",
        description: "Data refreshed successfully.",
        variant: "default"
      })
    } catch (error) {
      console.error('Error refreshing data:', error)
      toast({
        title: "Error",
        description: "Failed to refresh data.",
        variant: "destructive"
      })
    }
  }, [activeDepartmentTab, activeSubdepartmentTab, loadTasksData, fetchTmUsers])

  // Get KYC fields for a document from the pre-fetched fields
  const getKycFields = useCallback((doc: any) => {
    if (!doc.kycId) {
      return Promise.resolve([]);
    }
    return Promise.resolve(allKycFields[doc.kycId] || []);
  }, [allKycFields])

  // Helper function to check if a document applies to the current task (similar to StageUploadDialog)
  const isDocumentApplicableToTask = useCallback((doc: any, task: any) => {
    // If it's not a special document, it applies to all tasks
    if (!doc.isSpecial) {
      return true;
    }

    // Check if document has targetEntities
    if (doc.targetEntities && Array.isArray(doc.targetEntities) && doc.targetEntities.length > 0) {
      const matchesTarget = doc.targetEntities.some((entity: any) => {
        const classMatch = entity.class_id ?
          entity.class_id.toString() === task.class_id?.toString() :
          true;
        const subdeptMatch = entity.subdept_id ?
          entity.subdept_id.toString() === task.subdepartment?.id?.toString() :
          true;
        return classMatch && subdeptMatch;
      });

      return matchesTarget;
    }

    // For special documents, check if they're applicable to the current task's hierarchy
    const taskClassId = task.class_id?.toString();
    const taskSubdeptId = task.subdepartment?.id?.toString();

    // Check entity type targeting
    if (doc.entityType === 'class' && doc.class_id) {
      const classMatch = taskClassId === doc.class_id.toString();
      if (doc.subdept_id) {
        const subdeptMatch = taskSubdeptId === doc.subdept_id.toString();
        return classMatch && subdeptMatch;
      }
      return classMatch;
    }

    if (doc.entityType === 'subdept' && doc.subdept_id) {
      return taskSubdeptId === doc.subdept_id?.toString()
    }

    if (doc.entityType === 'subclass' && doc.subclass_id && doc.class_id && doc.subdept_id) {
      return (
        taskSubdeptId === doc.subdept_id?.toString() &&
        taskClassId === doc.class_id?.toString() &&
        task.subclass_id?.toString() === doc.subclass_id?.toString()
      )
    }

    // Fallback: if document has targeting properties but no entityType
    if (doc.class_id && doc.subdept_id) {
      return (
        taskSubdeptId === doc.subdept_id?.toString() &&
        taskClassId === doc.class_id?.toString()
      )
    }

    if (doc.subdept_id && !doc.class_id) {
      return taskSubdeptId === doc.subdept_id?.toString()
    }

    // For special documents without clear targeting, don't show them
    return false
  }, [])

  // Check if a stage document is applicable to a task
  const isStageDocumentApplicable = useCallback((stage: any, task: any) => {
    if (!stage.documents || stage.documents.length === 0) return false;

    // Check if any document in this stage is applicable to the task
    return stage.documents.some(doc => isDocumentApplicableToTask(doc, task));
  }, [isDocumentApplicableToTask])

  // Check if stage is applicable to task
  const isStageApplicableToTask = useCallback((stage: any, task: any) => {
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
  }, [departments])

  const toggleImmigrationStatusExpansion = (taskId: string) => {
    setExpandedImmigrationStatus(prev => {
      const newSet = new Set(prev)
      if (newSet.has(taskId)) {
        newSet.delete(taskId)
      } else {
        newSet.add(taskId)
      }
      return newSet
    })
  }

  // 4. Enhanced current stage determination logic
  const determineCurrentStage = useCallback((task: any, stages: any[]) => {
    if (!task.stages || !stages.length) return null

    // Get applicable stages in order
    const applicableStages = stages
      .filter(stage => isStageApplicableToTask(stage, task))
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0))

    // NEW: Find the last stage that has either a document or a date
    let lastStageWithEvidence = null
    let currentStage = null

    for (const stage of applicableStages) {
      const stageStatus = task.stages[stage.id]

      // Check if this stage has a LINKED document
      const hasDocument = !!getDocumentForTaskStage(task, stage);

      // Check if this stage has a date
      const hasDate = stageStatus && (stageStatus.status === 'completed' || stageStatus.date)

      if (hasDocument || hasDate) {
        lastStageWithEvidence = stage
      }
    }

    // If we found a stage with evidence, use it as current stage
    if (lastStageWithEvidence) {
      const lastStageIndex = applicableStages.findIndex(s => s.id === lastStageWithEvidence.id)

      // Current stage is either the next stage after the last one with evidence,
      // or the last stage with evidence if it's the final stage
      if (lastStageIndex < applicableStages.length - 1) {
        currentStage = applicableStages[lastStageIndex + 1]
      } else {
        currentStage = lastStageWithEvidence
      }
    }

    // Fallback to the original logic if no evidence found
    if (!currentStage) {
      for (const stage of applicableStages) {
        const stageStatus = task.stages[stage.id]

        if (stageStatus && (stageStatus.status === 'completed' || stageStatus.date)) {
          lastStageWithEvidence = stage
        } else {
          currentStage = stage
          break
        }
      }

      if (!currentStage && lastStageWithEvidence) {
        currentStage = lastStageWithEvidence
      }

      if (!currentStage && applicableStages.length > 0) {
        currentStage = applicableStages[0]
      }
    }

    // Final fallback to database value
    if (!currentStage && task.current_stage_id) {
      currentStage = stages.find(s => s.id === task.current_stage_id)
    }

    return currentStage
  }, [isStageApplicableToTask, getDocumentForTaskStage])

  const getEnhancedImmigrationStatus = useCallback((task: UtilTask) => {
    const statusStageId = "072b9710-45df-4a05-ba65-01b4ef29d61d";
    const statusStage = stages.find(s => s.id === statusStageId);

    if (!statusStage?.documents?.length) {
      return {
        status: "N/A",
        date: null,
        type: 'na',
        documentType: null,
        daysRemaining: null
      };
    }

    const stageDocKycIds = new Set(statusStage.documents.map(d => d.kycId));

    const relevantDocs = allDocuments.filter(doc =>
      doc.director_id === task.individual_id &&
      stageDocKycIds.has(doc.document_id) &&
      doc.extracted_details
    );

    if (!relevantDocs.length) {
      return {
        status: "No Status Doc",
        date: null,
        type: 'na',
        documentType: null,
        daysRemaining: null
      };
    }

    const dateFields = [
      'expiry', 'valid', 'date', 'until', 'effective',
      'expiration', 'expiry_date', 'valid_to', 'valid_until', 'up_to',
      'effective_date', 'effective_from', 'effective_to', 'with_effect_from'
    ];

    // Find all dates with their associated document types
    const allDatesWithTypes = relevantDocs.flatMap(doc => {
      if (!doc.extracted_details) return [];

      // Get document type name from KYC data
      const kycData = kycDocuments.get(doc.document_id);
      const documentTypeName = kycData?.display_name || kycData?.name || 'Document';

      const dates = findDatesInObject(doc.extracted_details, dateFields);
      return dates.map(date => ({
        date,
        documentType: documentTypeName,
        document: doc
      }));
    });

    if (!allDatesWithTypes.length) {
      return {
        status: "No Date Found",
        date: null,
        type: 'na',
        documentType: null,
        daysRemaining: null
      };
    }

    // Find the furthest future date (current status)
    const latestDateInfo = allDatesWithTypes.reduce((latest, current) =>
      isAfter(current.date, latest.date) ? current : latest, allDatesWithTypes[0]);

    const today = startOfToday();
    const isFuture = isAfter(latestDateInfo.date, today) || isEqual(latestDateInfo.date, today);

    // Calculate days remaining
    const timeDiff = latestDateInfo.date.getTime() - today.getTime();
    const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

    let statusType = 'na';
    if (isFuture) {
      statusType = daysRemaining <= 30 ? 'expiring_soon' : 'active';
    } else {
      statusType = 'expired';
    }

    return {
      status: isFuture
        ? `Valid until ${format(latestDateInfo.date, 'dd MMM yyyy')}`
        : `Expired on ${format(latestDateInfo.date, 'dd MMM yyyy')}`,
      date: latestDateInfo.date,
      type: statusType,
      documentType: latestDateInfo.documentType,
      daysRemaining: isFuture ? daysRemaining : 0
    };
  }, [stages, allDocuments, kycDocuments]);

  const renderImmigrationStatusCell = useCallback((task: any) => {
    const statusInfo = getEnhancedImmigrationStatus(task);
    const isExpanded = expandedImmigrationStatus.has(task.id.toString());

    const getBadgeColor = (type: string) => {
      switch (type) {
        case 'active': return 'bg-green-100 text-green-800 border-green-300';
        case 'expiring_soon': return 'bg-blue-100 text-blue-800 border-blue-300';
        case 'expired': return 'bg-red-100 text-red-800 border-red-300';
        default: return 'bg-slate-100 text-slate-600 border-slate-300';
      }
    };

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`whitespace-normal text-xs ${getBadgeColor(statusInfo.type)}`}
          >
            {statusInfo.status}
          </Badge>
          {statusInfo.type !== 'na' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0 text-slate-500 hover:text-slate-800"
              onClick={() => toggleImmigrationStatusExpansion(task.id.toString())}
            >
              {isExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            </Button>
          )}
        </div>

        {isExpanded && statusInfo.type !== 'na' && (
          <div className="space-y-1 p-2 bg-slate-50 rounded border text-xs">
            <div className="flex justify-between">
              <span className="font-medium">Document Type:</span>
              <span>{statusInfo.documentType || 'Unknown'}</span>
            </div>
            {statusInfo.date && (
              <div className="flex justify-between">
                <span className="font-medium">Expiry Date:</span>
                <span>{format(statusInfo.date, 'dd MMM yyyy')}</span>
              </div>
            )}
            {statusInfo.type !== 'expired' && statusInfo.daysRemaining !== null && (
              <div className="flex justify-between">
                <span className="font-medium">Days Remaining:</span>
                <span className={statusInfo.daysRemaining <= 30 ? 'text-blue-600 font-semibold' : 'text-green-600'}>
                  {statusInfo.daysRemaining} days
                </span>
              </div>
            )}
            {statusInfo.type === 'expired' && (
              <div className="flex justify-between">
                <span className="font-medium">Days Overdue:</span>
                <span className="text-red-600 font-semibold">
                  {Math.abs(statusInfo.daysRemaining || 0)} days
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }, [getEnhancedImmigrationStatus, expandedImmigrationStatus, toggleImmigrationStatusExpansion]);


  // NEW: Enhanced handleStageStatusSave that updates current_stage
  const enhancedHandleStageStatusSave = useCallback(async (
    stageId: string,
    taskId: string,
    value: string,
    updatedExtractedDetails?: Record<string, any>
  ) => {
    try {
      // Call the original save function
      if (handleStageStatusSave) {
        await handleStageStatusSave(stageId, taskId, value, updatedExtractedDetails)
      }

      // Find the task and update current stage
      const task = tasks.find(t => t.id.toString() === taskId.toString())
      if (!task) return

      // Update the task's stages data
      const updatedStages = {
        ...task.stages,
        [stageId]: {
          status: 'completed',
          date: value,
          completedAt: new Date().toISOString()
        }
      }

      // Determine the new current stage
      const currentStage = determineCurrentStage({ ...task, stages: updatedStages }, stages)

      // Update the database
      const updateData: any = {
        stages: updatedStages,
        updated_at: new Date().toISOString()
      }

      if (currentStage) {
        updateData.current_stage_id = currentStage.id
        updateData.current_stage_started_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('tm_tasks')
        .update(updateData)
        .eq('id', taskId)

      if (error) throw error

      // Refresh data
      await loadTasksData(activeDepartmentTab, activeSubdepartmentTab)

      console.log('Stage status and current stage updated successfully')

    } catch (error) {
      console.error('Error updating stage status and current stage:', error)
      toast({
        title: "Error",
        description: "Failed to update stage status.",
        variant: "destructive"
      })
    }
  }, [handleStageStatusSave, tasks, stages, determineCurrentStage, loadTasksData, activeDepartmentTab, activeSubdepartmentTab])

  // Get default subdepartments for current department
  const getDefaultSubdepartments = useCallback(() => {
    if (!activeDepartmentTab || !departments.length) return []

    const currentDept = departments.find(d => d.id.toString() === activeDepartmentTab)
    if (!currentDept) return []

    return currentDept.tm_subdepartments?.filter(sub => sub.default_display) || []
  }, [activeDepartmentTab, departments])

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

  // Toggle dependants expansion for the transposed view
  const toggleDependantsExpansion = (taskId: string) => {
    setExpandedDependants(prev => {
      const newSet = new Set(prev)
      if (newSet.has(taskId)) {
        newSet.delete(taskId)
      } else {
        newSet.add(taskId)
      }
      return newSet
    })
  }

  // Expand/Collapse all functions
  const expandAll = () => {
    setExpandedSections(new Set(['case_details', 'stages', 'stats']))
    const allStageIds = stages.map(s => s.id)
    setExpandedStages(new Set(allStageIds))
    const allDocIds = stages.flatMap(s => s.documents?.map(d => d.id) || [])
    setExpandedDocuments(new Set(allDocIds))
    const allTaskIdsWithDependants = tasks.filter(t => t.dependnats_members?.length > 0).map(t => t.id.toString());
    setExpandedDependants(new Set(allTaskIdsWithDependants));
  }

  const collapseAll = () => {
    setExpandedSections(new Set())
    setExpandedStages(new Set())
    setExpandedDocuments(new Set())
    setExpandedDependants(new Set())
  }

  // Handle header visibility toggle
  const toggleHeaderVisibility = (headerId: string) => {
    setVisibleHeaders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(headerId)) {
        newSet.delete(headerId)
      } else {
        newSet.add(headerId)
      }
      return newSet
    })
  }

  // Handle stats visibility toggle
  const toggleStatsVisibility = (statId: string) => {
    setVisibleStats(prev => {
      const newSet = new Set(prev)
      if (newSet.has(statId)) {
        newSet.delete(statId)
      } else {
        newSet.add(statId)
      }
      return newSet
    })
  }

  // Handle stage visibility toggle
  const toggleStageVisibility = (stageId: string) => {
    setVisibleStageIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(stageId)) {
        newSet.delete(stageId)
      } else {
        newSet.add(stageId)
      }
      return newSet
    })
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

  const handleViewDocument = useCallback(async (task: any, stage: any) => {
    try {
      // THIS NOW USES THE NEW LOGIC, so it gets the LINKED document
      const document = getDocumentForTaskStage(task, stage);

      if (!document) {
        toast({
          title: 'No Linked Document',
          description: `No document has been linked for this stage yet. Please use the 'Link' button on the applicant row.`,
          variant: 'default',
        });
        return;
      }
      if (document.indicator === true) {
        toast({
          title: 'Preview not available',
          description: 'Document preview is not available for this document.',
          variant: 'default',
        });
        return;
      }

      // Check if document is older than task creation and prevent preview
      const isOldDocument = task.created_at &&
        isDocumentOlderThanTask(document.created_at, task.created_at);

      if (isOldDocument) {
        toast({
          title: 'Preview not available',
          description: 'Document is older than task creation - preview disabled.',
          variant: 'default',
        });
        return;
      }

      // Get KYC document data using document_id
      const kycId = document.document_id;
      if (!kycId) {
        toast({
          title: 'Error',
          description: 'No KYC document ID found.',
          variant: 'destructive',
        });
        return;
      }

      // Get KYC document from cache or fetch it
      let kycData = kycDocuments.get(kycId);
      if (!kycData) {
        kycData = await fetchKycDocument(kycId);
        if (kycData) {
          setKycDocuments(prev => new Map(prev.set(kycId, kycData)));
        }
      }

      if (!kycData) {
        toast({
          title: 'Error',
          description: 'Failed to load document configuration.',
          variant: 'destructive',
        });
        return;
      }

      // Use KYC document display_name or name, not stage document name
      const documentName = kycData.display_name || kycData.name || 'Document';

      // Get KYC fields from the KYC document data
      const kycFields = kycData.fields || [];
      const fields = kycFields.map(field => ({
        id: field.id || field.fieldName,
        name: field.fieldName,
        type: field.fieldType,
        required: field.isRequired,
        description: field.description,
        isArray: field.isArray,
        arrayConfig: field.arrayConfig
      }));

      // Prepare extracted data, ensuring all fields are present
      const extractedData = { ...(document.extracted_details || {}) };
      fields.forEach(field => {
        if (extractedData[field.id] === undefined) {
          extractedData[field.id] = '';
        }
      });

      // Format file URL
      const bucketName = 'kyc-documents';
      const filePath = document.file_path?.startsWith(bucketName)
        ? document.file_path
        : `${bucketName}/${document.file_path}`;
      const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
      const fileName = document.file_path?.split('/').pop() || documentName;

      // Prepare preview data
      const previewData = {
        documentId: document.id,
        documentName,
        fileUrl,
        fileName,
        extractedData,
        fields,
        type: kycData.documentType || 'document',
        file: {
          name: fileName,
          type: fileName.split('.').pop()?.toLowerCase() || 'pdf',
          url: fileUrl
        }
      };

      setPreviewDocument(previewData);
    } catch (error) {
      console.error('Error preparing document for view:', error);
      toast({
        title: 'Error',
        description: `Failed to load document: ${error.message}`,
        variant: 'destructive',
      });
    }
  }, [getDocumentForTaskStage, kycDocuments]);


  // Handle new enquiry creation
  const handleEnquiryCreated = useCallback(async (newEnquiry: any) => {
    try {
      setTasks(prevTasks => [newEnquiry, ...prevTasks])
      await loadTasksData(activeDepartmentTab, activeSubdepartmentTab);

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
  }, [loadTasksData, activeDepartmentTab, activeSubdepartmentTab])

  // Handle task actions
  const handleTaskAction = useCallback((action: { type: string; taskId?: string | number;[key: string]: any }) => {
    switch (action.type) {
      case 'refresh':
      case 'refresh-data':
        refreshAllData()
        break
      default:
        onTaskAction?.(action)
    }
  }, [onTaskAction, refreshAllData])

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

  // NEW: Get user display name helper
  const getUserDisplayName = useCallback((userId: number | null | undefined) => {
    if (!userId) return 'N/A'
    const user = tmUsers.get(userId)
    return user?.display_name || 'Unknown User'
  }, [tmUsers])

  // Filter tasks by department and status
  const getFilteredTasks = useCallback((status?: string) => {
    if (!departments.length || !activeDepartmentTab || !tasks.length) return []
    const currentDept = departments.find(d => d.id.toString() === activeDepartmentTab)
    if (!currentDept) return []

    let filteredTasks = tasks.filter(task =>
      task &&
      task.department?.id?.toString() === currentDept.id.toString() &&
      (!status || task.status === status)
    )

    // Filter by subdepartment if one is selected
    if (activeSubdepartmentTab) {
      filteredTasks = filteredTasks.filter(task =>
        task.subdepartment?.id?.toString() === activeSubdepartmentTab
      )
    }

    return filteredTasks
  }, [tasks, departments, activeDepartmentTab, activeSubdepartmentTab])

  // Filter WIP tasks by follow-up
  const getWIPTasksByFollowUp = useCallback((followUpFilter: string) => {
    const wipTasks = getFilteredTasks('in_progress')
    if (followUpFilter === 'all') return wipTasks

    return wipTasks.filter(task => {
      if (!task.current_stage_id) return false
      const currentStage = stages.find(s => s.id === task.current_stage_id)
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

  // Global search functionality
  const filterTasksBySearch = useCallback((tasks: any[]) => {
    if (!globalSearchTerm.trim()) return tasks

    const searchTerm = globalSearchTerm.toLowerCase()

    return tasks.filter(task => {
      // Search in basic task fields
      const basicFields = [
        task.id?.toString(),
        task.applicant_name,
        task.job_description,
        task.status,
        task.renewal_status,
        task.nationality,
        task.age?.toString(),
        companies.get(task.company_id),
        getTaskHierarchy(task)?.department?.name,
        getTaskHierarchy(task)?.subdepartment?.name,
        getTaskHierarchy(task)?.class?.name,
        getTaskHierarchy(task)?.subclass?.name,
        // Add staff names to search
        getUserDisplayName(task.task_manager_id),
        getUserDisplayName(task.officer_id),
        getUserDisplayName(task.task_assistant_id)
      ].filter(Boolean).join(' ').toLowerCase()

      if (basicFields.includes(searchTerm)) return true

      // Search in dependants
      if (task.dependnats_members && Array.isArray(task.dependnats_members)) {
        const dependantsText = task.dependnats_members.map(dep =>
          [dep.name, dep.nationality, dep.age?.toString(), dep.relationship].filter(Boolean).join(' ')
        ).join(' ').toLowerCase()

        if (dependantsText.includes(searchTerm)) return true
      }

      return false
    })
  }, [globalSearchTerm, companies, getTaskHierarchy, getUserDisplayName])

  // Memoized task lists with search filtering
  const enquiryTasks = useMemo(() => filterTasksBySearch(getFilteredTasks('enquiry')), [getFilteredTasks, filterTasksBySearch])
  const wipTasks = useMemo(() => filterTasksBySearch(getWIPTasksByFollowUp(activeFollowUpFilter)), [getWIPTasksByFollowUp, activeFollowUpFilter, filterTasksBySearch])
  const completedTasks = useMemo(() => filterTasksBySearch(getFilteredTasks('completed')), [getFilteredTasks, filterTasksBySearch])

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

  const handlePushCase = useCallback(async (task: UtilTask, targetSubDeptId: number, targetSubDeptName: string) => {
    setIsPushingCase(true)
    toast({ title: "Pushing Case...", description: `Creating a new task in ${targetSubDeptName}.` })

    try {
      // Create clean task data without ID and other system fields
      const { id, created_at, updated_at, current_stage_id, current_stage_started_at, stages, ...cleanTaskData } = task;

      const taskData = {
        ...cleanTaskData,
        subdepartment_id: targetSubDeptId,
        class_id: null,
        subclass_id: null,
        status: 'in_progress',
        created_by: 'system',
        date_initiated: new Date().toISOString(),
        stages: {},
        current_stage_id: null,
        current_stage_started_at: null
      };

      console.log('Pushing task data:', taskData);

      const { data: newTask, error } = await supabase
        .from('tm_tasks')
        .insert([taskData])
        .select()
        .single()

      if (error) {
        console.error('Supabase error details:', error);
        throw error;
      }

      toast({ title: "Success", description: `Case pushed to ${targetSubDeptName} successfully. New Task ID: ${newTask.id}` })
      await refreshAllData()
    } catch (error) {
      console.error(`Error pushing case to ${targetSubDeptName}:`, error)
      toast({ title: "Error", description: `Failed to push case. ${error.message}`, variant: "destructive" })
    } finally {
      setIsPushingCase(false)
    }
  }, [refreshAllData])
  // Handler to download all documents for a user as a ZIP file
  const handleDownloadZip = useCallback(async (task: UtilTask) => {
    setIsDownloading(true)
    toast({ title: "Preparing Download", description: "Collecting documents..." })

    try {
      const userDocuments = allDocuments.filter(doc => doc.director_id === task.individual_id)
      if (userDocuments.length === 0) {
        toast({ title: "No Documents", description: "No documents found for this applicant to download.", variant: "default" })
        setIsDownloading(false)
        return
      }

      const zip = new JSZip()
      const bucketName = 'kyc-documents'

      const downloadPromises = userDocuments.map(async (doc) => {
        if (!doc.file_path) return
        const filePath = doc.file_path.startsWith(bucketName) ? doc.file_path : `${bucketName}/${doc.file_path}`
        const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`
        const fileName = doc.file_path.split('/').pop() || 'document'

        try {
          const response = await fetch(fileUrl)
          if (!response.ok) {
            console.error(`Failed to fetch ${fileUrl}: ${response.statusText}`)
            return // Skip this file
          }
          const blob = await response.blob()
          zip.file(fileName, blob)
        } catch (error) {
          console.error(`Error downloading file ${fileName}:`, error)
        }
      })

      await Promise.all(downloadPromises)

      const content = await zip.generateAsync({ type: "blob" })
      saveAs(content, `${task.applicant_name || 'applicant'}_documents.zip`)
      toast({ title: "Download Started", description: "Your ZIP file is being downloaded." })
    } catch (error) {
      console.error("Error creating ZIP file:", error)
      toast({ title: "Error", description: "Failed to create ZIP file.", variant: "destructive" })
    } finally {
      setIsDownloading(false)
    }
  }, [allDocuments])

  // Helper function to parse date from various formats
  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;

    // Try different date formats
    const formats = [
      'dd/MM/yyyy HH:mm:ss',  // 07/10/2024 14:25:23
      'dd/MM/yyyy',          // 13/06/2025
      'yyyy-MM-dd',          // 2021-08-27
      'dd-MM-yyyy',
      'MM/dd/yyyy',
      'yyyy/MM/dd'
    ];

    for (const fmt of formats) {
      const parsed = parse(dateStr, fmt, new Date());
      if (isValid(parsed)) {
        return parsed;
      }
    }

    // Try default Date parsing as fallback
    const parsed = new Date(dateStr);
    return isValid(parsed) ? parsed : null;
  };

  // Recursive function to find dates in an object (including arrays)
  const findDatesInObject = (obj: any, dateFields: string[]): Date[] => {
    if (!obj) return [];

    const dates: Date[] = [];

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.flatMap(item => findDatesInObject(item, dateFields));
    }

    // Handle objects
    if (typeof obj === 'object') {
      for (const key in obj) {
        const value = obj[key];

        // Check if this key is a date field we're interested in
        const isDateField = dateFields.some(field =>
          key.toLowerCase().includes(field.toLowerCase())
        );

        if (isDateField && value) {
          const parsedDate = typeof value === 'string' ? parseDate(value) : null;
          if (parsedDate) {
            dates.push(parsedDate);
          }
        }

        // Recursively check nested objects and arrays
        if (value && typeof value === 'object') {
          dates.push(...findDatesInObject(value, dateFields));
        }
      }
    }

    return dates;
  };

  // FIXED: Handler to calculate current immigration status - removed passport_expiry_date
  const getImmigrationStatus = useCallback((task: UtilTask) => {
    const statusStageId = "072b9710-45df-4a05-ba65-01b4ef29d61d";
    const statusStage = stages.find(s => s.id === statusStageId);

    if (!statusStage?.documents?.length) {
      return { status: "N/A", date: null, type: 'na' };
    }

    const stageDocKycIds = new Set(statusStage.documents.map(d => d.kycId));

    const relevantDocs = allDocuments.filter(doc =>
      doc.director_id === task.individual_id &&
      stageDocKycIds.has(doc.document_id)
    );

    if (!relevantDocs.length) {
      return { status: "No Status Doc", date: null, type: 'na' };
    }

    // FIXED: Removed passport_expiry_date from the date fields list
    const dateFields = [
      'expiry', 'valid', 'date', 'until', 'effective',
      'expiration', 'expiry_date', 'valid_to', 'valid_until', 'up_to',
      'effective_date', 'effective_from', 'effective_to', 'with_effect_from'
    ];

    // Find all dates in the relevant documents
    const allDates = relevantDocs.flatMap(doc => {
      if (!doc.extracted_details) return [];
      return findDatesInObject(doc.extracted_details, dateFields);
    });

    // Find the latest date
    const latestDate = allDates.length > 0
      ? allDates.reduce((latest, current) =>
        isAfter(current, latest) ? current : latest, allDates[0])
      : null;

    // Format the status
    if (latestDate) {
      const today = startOfToday();
      const isFuture = isAfter(latestDate, today) || isEqual(latestDate, today);

      return {
        status: isFuture
          ? `Active until ${format(latestDate, 'dd MMM yyyy')}`
          : `Expired on ${format(latestDate, 'dd MMM yyyy')}`,
        date: latestDate,
        type: isFuture ? 'active' : 'expired'
      };
    }

    return { status: "No Date Found", date: null, type: 'na' };
  }, [stages, allDocuments]);

  const generateEnhancedTableRows = useCallback(async (tasks: UtilTask[]) => {
    if (!tasks.length) return []

    const allStages = stages
      .filter(stage => stage && visibleStageIds.has(stage.id.toString()))
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0))
    const rows = []

    // Stats Section (unchanged)
    rows.push({ key: 'section_header_stats', type: 'section_header', label: 'Statistics', id: 'stats', icon: Briefcase });

    if (expandedSections.has('stats')) {
      if (visibleStats.has('stats_completed')) {
        rows.push({
          key: 'stats_completed',
          label: 'Completed Stages',
          type: 'stat',
          getValue: (task: any) => {
            const applicableStages = allStages.filter(stage => isStageApplicableToTask(stage, task))
            const completedStages = applicableStages.filter(stage => task.stages?.[stage.id]?.status === 'completed')
            return `${completedStages.length}/${applicableStages.length}`
          }
        })
      }
      if (visibleStats.has('stats_pending')) {
        rows.push({
          key: 'stats_pending',
          label: 'Pending Stages',
          type: 'stat',
          getValue: (task: any) => {
            const applicableStages = allStages.filter(stage => isStageApplicableToTask(stage, task))
            const pendingStages = applicableStages.filter(stage => !task.stages?.[stage.id] || task.stages?.[stage.id]?.status === 'pending')
            return `${pendingStages.length}/${applicableStages.length}`
          }
        })
      }
      if (visibleStats.has('stats_na')) {
        rows.push({
          key: 'stats_na',
          label: 'N/A Stages',
          type: 'stat',
          getValue: (task: any) => {
            const totalStages = allStages.length
            const applicableStages = allStages.filter(stage => isStageApplicableToTask(stage, task))
            const naStages = totalStages - applicableStages.length
            return `${naStages}/${totalStages}`
          }
        })
      }
    }

    // Case Details Section
    rows.push({ key: 'section_header_case_details', type: 'section_header', label: 'Case Details', id: 'case_details', icon: Users });

    if (expandedSections.has('case_details')) {
      if (visibleHeaders.has('id')) {
        rows.push({ key: 'id', label: 'Task ID', type: 'basic', getValue: (task: any) => `${task.id}` })
      }
      if (visibleHeaders.has('applicant_name')) {
        rows.push({ key: 'applicant_name', label: 'Applicant Name', type: 'basic', getValue: (task: any) => task.applicant_name || 'N/A' })
      }
      if (visibleHeaders.has('current_immigration_status')) {
        rows.push({
          key: 'current_immigration_status',
          label: 'Current Immigration Status',
          type: 'immigration_status',
          getValue: (task: any) => task // Pass the whole task for complex rendering
        })
      }
      if (visibleHeaders.has('company_name')) {
        rows.push({ key: 'company_name', label: 'Company Name', type: 'basic', getValue: (task: any) => companies.get(task.company_id) || 'N/A' })
      }
      if (visibleHeaders.has('job_level')) {
        rows.push({ key: 'job_level', label: 'Job Level', type: 'basic', getValue: (task: any) => getTaskHierarchy(task)?.subclass?.name || getTaskHierarchy(task)?.class?.name || getTaskHierarchy(task)?.subdepartment?.name || 'N/A' })
      }
      if (visibleHeaders.has('renewal_new')) {
        rows.push({ key: 'renewal_new', label: 'Renewal/New', type: 'badge', getValue: (task: any) => task.renewal_status || 'New' })
      }
      if (visibleHeaders.has('case_status')) {
        rows.push({ key: 'case_status', label: 'Case Status', type: 'badge', getValue: (task: any) => task.status || 'pending' })
      }
      if (visibleHeaders.has('nationality')) {
        rows.push({ key: 'nationality', label: 'Nationality', type: 'basic', getValue: (task: any) => task.nationality || 'N/A' })
      }
      if (visibleHeaders.has('age')) {
        rows.push({ key: 'age', label: 'Age', type: 'basic', getValue: (task: any) => task.age?.toString() || 'N/A' })
      }
      // NEW: Add staff fields
      if (visibleHeaders.has('task_manager')) {
        rows.push({ key: 'task_manager', label: 'Task Manager', type: 'basic', getValue: (task: any) => getUserDisplayName(task.task_manager_id) })
      }
      if (visibleHeaders.has('officer')) {
        rows.push({ key: 'officer', label: 'Officer', type: 'basic', getValue: (task: any) => getUserDisplayName(task.officer_id) })
      }
      if (visibleHeaders.has('task_assistant')) {
        rows.push({ key: 'task_assistant', label: 'Task Assistant', type: 'basic', getValue: (task: any) => getUserDisplayName(task.task_assistant_id) })
      }
    }

    // Stages Section
    rows.push({ key: 'section_header_stages', type: 'section_header', label: 'Stages', id: 'stages', icon: Briefcase });

    if (expandedSections.has('stages')) {
      for (const stage of allStages) {
        rows.push({
          key: `stage_${stage.id}`,
          label: `${stage.name}`,
          type: 'stage',
          stage,
          stageId: stage.id,
          stageOrder: stage.order_num || 0,
          getValue: (task: UtilTask) => isStageApplicableToTask(stage, task) ? task.stages?.[stage.id] : 'N/A'
        })

        if (expandedStages.has(stage.id) && stage.documents && stage.documents.length > 0) {
          for (const doc of stage.documents) {
            // Get document name from KYC data with proper fallback
            const kycData = kycDocuments.get(doc.kycId);
            const docDisplayName = kycData?.display_name || kycData?.name || doc.display_name || doc.name || 'Document';

            rows.push({
              key: `doc_${stage.id}_${doc.id}`,
              label: docDisplayName,
              type: 'document',
              stage,
              document: doc,
              isSubRow: true,
              getValue: (task: UtilTask) => {
                if (!isStageApplicableToTask(stage, task)) return 'N/A';

                const document = getDocumentForTaskStage(task, { ...stage, documents: [doc] }, allDocuments);
                const isOldDoc = document && task.created_at &&
                  isDocumentOlderThanTask(document.created_at, task.created_at);
                const hasIndicator = document?.indicator === true;

                return {
                  hasDocument: !!document,
                  isOldDocument: isOldDoc,
                  hasIndicator,
                  status: hasIndicator ? 'Preview Not Available' :
                    isOldDoc ? 'Old Document - No Preview' :
                      (document ? 'Uploaded' : 'Not Uploaded')
                };
              }
            })

            // Only show fields if document is expanded AND it does not have an indicator AND is not old
            if (expandedDocuments.has(doc.id) && doc.kycId) {
              const kycFields = await getKycFields(doc);
              if (kycFields && kycFields.length > 0) {
                kycFields.forEach(field => {
                  rows.push({
                    key: `field_${stage.id}_${doc.id}_${field.id || field.fieldName}`,
                    label: `${field.fieldName}`,
                    type: 'field',
                    stage,
                    document: doc,
                    field,
                    isSubRow: true,
                    isSubSubRow: true,
                    getValue: (task: UtilTask) => {
                      if (!isStageApplicableToTask(stage, task)) return 'N/A'
                      const document = getDocumentForTaskStage(task, { ...stage, documents: [doc] }, allDocuments)

                      // Check if document is old
                      const isOldDoc = document && task.created_at &&
                        isDocumentOlderThanTask(document.created_at, task.created_at)

                      // Return N/A if no document, no details, has an indicator, OR is old
                      if (!document || !document.extracted_details || document.indicator === true || isOldDoc) return 'N/A'

                      const value = document.extracted_details[field.fieldName] || document.extracted_details[field.id] || 'N/A'
                      return { value, isOldDocument: false } // Since we already filtered out old docs above
                    }
                  })
                })
              }
            }
          }
        }
      }
    }

    rows.push({ key: 'section_header_actions', type: 'section_header', label: 'Actions', id: 'actions', icon: Pencil })

    if (expandedSections.has('actions')) {
      rows.push({ key: 'actions_row', type: 'actions', label: 'Actions', id: 'actions' })
    }

    return rows
  }, [departments, stages, companies, getTaskHierarchy, isStageApplicableToTask, expandedSections, expandedStages, expandedDocuments, getKycFields, visibleHeaders, visibleStats, kycDocuments, allDocuments, visibleStageIds, getUserDisplayName])

  // Enhanced render cell content for transposed view
  const renderCellContent = useCallback((row: any, task: any) => {
    const value = row.getValue ? row.getValue(task) : '';

    if (row.type === 'immigration_status') {
      return renderImmigrationStatusCell(task);
    }

    if (value === 'N/A' || (typeof value === 'object' && value?.status === 'N/A')) {
      return <span className="text-sm text-gray-400 italic">N/A</span>;
    }

    // Handle stage dates if this is a stage cell
    if (row.type === 'stage' && row.stage && task.stages?.[row.stage.id]) {
      const stageData = task.stages[row.stage.id];
      return (
        <div className="flex flex-col items-center gap-0.5">
          {stageData.date && (
            <span className="text-xs font-medium text-slate-800">
              {formatDateValue(stageData.date)}
            </span>
          )}
        </div>
      );
    }

    // Handle document field dates
    if (row.type === 'field') {
      const fieldValue = typeof value === 'object' ? value.value : value;
      const isOldDoc = typeof value === 'object' ? value.isOldDocument : false;

      if (row.field?.fieldType?.toLowerCase() === 'date') {
        const formattedDate = formatDateValue(fieldValue);
        return (
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-700" title={formattedDate}>{formattedDate}</span>
            {isOldDoc && <AlertTriangle className="h-3 w-3 text-orange-500" title="Document is older than task creation" />}
          </div>
        );
      }
      return (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-700">{fieldValue}</span>
          {isOldDoc && <AlertTriangle className="h-3 w-3 text-orange-500" title="Document is older than task creation" />}
        </div>
      );
    }

    switch (row.type) {
      case 'immigration_status':
        return renderImmigrationStatusCell(task);
      case 'basic': return <span className="text-sm font-medium text-slate-800">{value}</span>;
      case 'badge': return <Badge variant={value === 'completed' ? 'default' : value === 'in_progress' ? 'secondary' : 'outline'} className="text-xs font-semibold">{value}</Badge>;
      case 'date': return <span className="text-sm text-slate-600">{formatDateValue(value)}</span>;
      case 'stat': return <Badge variant="outline" className="text-xs font-semibold">{value}</Badge>;
      case 'stage':
        return (
          <EditableStageCell
            key={row.stage.id}
            stage={row.stage}
            task={task}
            value={task.stages?.[row.stage.id]?.status}
            onSave={enhancedHandleStageStatusSave}
            onDocumentUpload={handleStageDocumentUpload}
            onShowDocuments={handleViewDocument}
            getKycFields={getKycFields}
            allDocuments={allDocuments}
          />
        )
      case 'document':
        const docValue = typeof value === 'object' ? value : { hasDocument: false, status: value };
        return (
          <div className="flex items-center gap-2 justify-center">
            <Badge
              variant={docValue.hasDocument ? 'default' : 'outline'}
              className={`text-xs ${docValue.isOldDocument ? 'border-orange-500 text-orange-700' : ''}`}
            >
              {docValue.status}
            </Badge>
            {/* Conditionally render Eye button only if document exists, has no indicator, and is not old */}
            {docValue.hasDocument && !docValue.hasIndicator && !docValue.isOldDocument && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-green-600 hover:bg-green-100"
                onClick={() => handleViewDocument(task, { ...row.stage, documents: [row.document] })}
              >
                <Eye className="h-3 w-3" />
              </Button>
            )}
            {docValue.isOldDocument && (
              <AlertTriangle className="h-3 w-3 text-orange-500" title="Document is older than task creation - preview disabled" />
            )}
          </div>
        )
      case 'actions': return (
        <div className="flex items-center justify-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => handleTaskEdit(task)} className="h-8 w-8 text-blue-600 hover:bg-blue-100" title="Edit Task"><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onTaskAction?.({ type: 'delete', task })} className="h-8 w-8 text-red-600 hover:bg-red-100" title="Delete Task"><Trash2 className="h-4 w-4" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:bg-slate-100" title="More Actions">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handlePushCase(task, 27, 'Alien')} disabled={isPushingCase}>
                <Send className="mr-2 h-4 w-4" /> Push to Alien
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePushCase(task, 7, 'Re-Entry Pass')} disabled={isPushingCase}>
                <Send className="mr-2 h-4 w-4" /> Push to Re-Entry
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownloadZip(task)} disabled={isDownloading}>
                <DownloadCloud className="mr-2 h-4 w-4" /> Download Docs
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
      default: return <span className="text-sm text-slate-800">{value}</span>
    }
  }, [handleStageDocumentUpload, handleViewDocument, onTaskAction, handleTaskEdit, enhancedHandleStageStatusSave, renderImmigrationStatusCell, allDocuments, handlePushCase, handleDownloadZip, isPushingCase, isDownloading])

  // State for enhanced table rendering
  const [tableRows, setTableRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Function to load rows for enhanced table
  const loadRows = useCallback(async (tasks: any[]) => {
    setLoading(true);
    const rows = await generateEnhancedTableRows(tasks);
    setTableRows(rows);
    setLoading(false);
  }, [generateEnhancedTableRows]);

  // Effect to load rows when tasks or view settings change
  useEffect(() => {
    if (isTransposedView) {
      loadRows(tasks);
    }
  }, [tasks, isTransposedView, loadRows, expandedSections, expandedStages, expandedDocuments, visibleHeaders, visibleStats, visibleStageIds]);

  // Effect to initialize/reset visible stages when stages data changes
  useEffect(() => {
    if (stages && stages.length > 0) {
      setVisibleStageIds(new Set(stages.map(s => s.id.toString())))
    } else {
      setVisibleStageIds(new Set())
    }
  }, [stages])

  // Effect to fetch KYC data for expanded documents in standard view
  useEffect(() => {
    if (isTransposedView) return;

    const idsToFetch = new Set<string>();
    stages.forEach(stage => {
      if (expandedStages.has(stage.id)) {
        stage.documents?.forEach(doc => {
          if (expandedDocuments.has(doc.id) && doc.kycId && !kycDocuments.has(doc.kycId)) {
            idsToFetch.add(doc.kycId);
          }
        });
      }
    });

    if (idsToFetch.size > 0) {
      idsToFetch.forEach(async (id) => {
        const kycDoc = await fetchKycDocument(id);
        if (kycDoc) {
          setKycDocuments(prev => new Map(prev.set(id, kycDoc)));
        }
      });
    }
  }, [isTransposedView, stages, expandedStages, expandedDocuments, kycDocuments]);

  // Initial data loading
  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  // Load tasks and stages when department or subdepartment changes
  useEffect(() => {
    if (activeDepartmentTab && departments.length > 0) {
      loadTasksData(activeDepartmentTab, activeSubdepartmentTab)
    }
  }, [activeDepartmentTab, activeSubdepartmentTab, departments, loadTasksData])

  // Update activeSubdepartmentTab when department changes
  useEffect(() => {
    if (activeDepartmentTab && departments.length > 0) {
      const currentDept = departments.find(d => d.id.toString() === activeDepartmentTab)
      if (currentDept) {
        const defaultSubs = currentDept.tm_subdepartments?.filter(sub => sub.default_display) || []
        if (defaultSubs.length > 0) {
          setActiveSubdepartmentTab(defaultSubs[0].id.toString())
        } else {
          setActiveSubdepartmentTab("")
        }
      }
    }
  }, [activeDepartmentTab, departments])

  // Check if any data is still loading
  const isAnyDataLoading = Object.values(dataLoading).some(loading => loading)

  // Sorting handler
  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  // Memoized sorted tasks for standard view
  const getSortedTasks = (tasksToRender: UtilTask[]) => {
    return useMemo(() => {
      let sortableItems = [...tasksToRender]
      if (sortConfig) {
        sortableItems.sort((a, b) => {
          const getSortableValue = (task, key) => {
            switch (key) {
              case 'applicant_name': return task.applicant_name?.toLowerCase() || ''
              case 'company_name': return companies.get(task.company_id)?.toLowerCase() || ''
              case 'status': return task.status?.toLowerCase() || ''
              default: return task[key] || ''
            }
          }

          const valueA = getSortableValue(a, sortConfig.key)
          const valueB = getSortableValue(b, sortConfig.key)

          if (valueA === null || valueA === undefined) return 1
          if (valueB === null || valueB === undefined) return -1

          let comparison = 0
          if (valueA > valueB) {
            comparison = 1
          } else if (valueA < valueB) {
            comparison = -1
          }

          return sortConfig.direction === 'asc' ? comparison : comparison * -1
        })
      }
      return sortableItems
    }, [tasksToRender, sortConfig, companies])
  }

  const renderStandardTable = useCallback((tasks: any[], tableType: string) => {
    const sortedTasks = getSortedTasks(tasks);

    if (!sortedTasks.length) {
      return (
        <div className="flex flex-col items-center justify-center p-16 bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-200">
          <FileText className="h-12 w-12 text-slate-400" />
          <p className="mt-4 font-semibold text-slate-700">No {tableType} found</p>
          <p className="text-sm text-slate-500">Tasks with this status will appear here.</p>
        </div>
      )
    }

    const kycFieldsMap = new Map(
      Array.from(kycDocuments.entries()).map(([kycId, kycDoc]) => [kycId, kycDoc.fields || []])
    );

    const visibleStages = stages
      .filter(stage => stage && visibleStageIds.has(stage.id.toString()))
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0))

    const totalStageColumns = visibleStages.reduce((total, stage) => {
      let stageCols = 0;
      if (expandedStages.has(stage.id) && stage.documents && stage.documents.length > 0) {
        stage.documents.forEach(doc => {
          if (expandedDocuments.has(doc.id) && doc.kycId) {
            const kycFields = kycFieldsMap.get(doc.kycId) || [];
            stageCols += kycFields.length || 1;
          } else {
            stageCols += 1;
          }
        });
      } else {
        stageCols = 1;
      }
      return total + Math.max(1, stageCols);
    }, 0);

    const SortableHeader = ({ sortKey, children, className }) => {
      const isSorted = sortConfig?.key === sortKey;
      return (
        <TableHead className={className} onClick={() => requestSort(sortKey)}>
          <div className="flex items-center justify-center gap-2">
            {children}
            {isSorted ? (
              sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
            ) : <ArrowUpDown className="h-4 w-4 opacity-30" />}
          </div>
        </TableHead>
      )
    }

    return (
      <div className="border border-slate-200 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <Table className="min-w-full border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-20 bg-slate-100/80 backdrop-blur-sm">
            <TableRow className="h-12">
              <SortableHeader rowSpan={2} sortKey="applicant_name" className="sticky left-0 bg-blue-600 border-r border-slate-300 w-[200px] z-30 text-white font-semibold p-2 cursor-pointer hover:bg-blue-700">Applicant</SortableHeader>
              <SortableHeader rowSpan={2} sortKey="current_immigration_status" className="bg-blue-600 border-r border-slate-300 text-white font-semibold text-center w-[200px] cursor-pointer hover:bg-blue-700">Immigration Status</SortableHeader>
              <SortableHeader rowSpan={2} sortKey="company_name" className="bg-blue-600 border-r border-slate-300 text-white font-semibold text-center w-[180px] cursor-pointer hover:bg-blue-700">Company</SortableHeader>
              <SortableHeader rowSpan={2} sortKey="status" className="bg-blue-600 border-r border-slate-300 text-white font-semibold text-center w-[100px] cursor-pointer hover:bg-blue-700">Status</SortableHeader>
              <TableHead colSpan={totalStageColumns} className="bg-blue-600 border-r border-slate-300 text-white text-center font-bold px-2">
                <div className="flex items-center justify-center gap-2">
                  WORKFLOW STAGES
                  <Button variant="ghost" size="icon" className="h-6 w-6 p-0 text-white hover:bg-blue-600" onClick={expandAll} title="Expand All"><Plus className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 p-0 text-white hover:bg-blue-600" onClick={collapseAll} title="Collapse All"><Minus className="h-4 w-4" /></Button>
                </div>
              </TableHead>
              <TableHead rowSpan={2} className="bg-blue-600 border-r-0 text-white font-semibold text-center w-[100px]">Actions</TableHead>
            </TableRow>
            <TableRow className="h-14">
              {visibleStages.map((stage) => {
                let stageCols = 0;
                let subHeaders = [];

                if (expandedStages.has(stage.id) && stage.documents?.length > 0) {
                  stage.documents.forEach(doc => {
                    // Get document name from KYC data with proper fallback
                    const kycData = kycDocuments.get(doc.kycId);
                    const docDisplayName = kycData?.display_name || kycData?.name || doc.display_name || doc.name || 'Document';

                    if (expandedDocuments.has(doc.id) && doc.kycId) {
                      const kycFields = kycFieldsMap.get(doc.kycId) || [];
                      if (kycFields.length > 0) {
                        stageCols += kycFields.length;
                        kycFields.forEach(field => subHeaders.push({ type: 'field', name: field.fieldName }));
                      } else {
                        stageCols += 1;
                        subHeaders.push({ type: 'doc', name: docDisplayName, id: doc.id, hasFields: false });
                      }
                    } else {
                      stageCols += 1;
                      const hasKycFields = doc.kycId && kycFieldsMap.has(doc.kycId) && kycFieldsMap.get(doc.kycId).length > 0;
                      subHeaders.push({ type: 'doc', name: docDisplayName, id: doc.id, hasFields: hasKycFields });
                    }
                  });
                } else {
                  stageCols = 1;
                }
                stageCols = Math.max(1, stageCols);

                if (!expandedStages.has(stage.id) || stage.documents?.length === 0) {
                  return (
                    <TableHead key={stage.id} className="bg-blue-500 border-r border-slate-500 text-white text-center font-semibold min-w-[150px] px-2 py-2 align-middle">
                      <div className="flex items-center justify-center gap-2">
                        <span className="truncate max-w-[100px]" title={stage.name}>{stage.name}</span>
                        {stage.documents?.length > 0 && (
                          <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-white hover:bg-slate-500" onClick={() => toggleStageExpansion(stage.id)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableHead>
                  );
                } else {
                  return (
                    <TableHead key={stage.id} colSpan={stageCols} className="bg-blue-500 border-r border-slate-500 text-white text-center font-semibold p-0 align-top">
                      <div className="flex flex-col h-full">
                        <div className="flex items-center justify-center gap-2 px-2 py-1 border-b border-slate-500">
                          <span className="truncate max-w-[100px]" title={stage.name}>{stage.name}</span>
                          <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-white hover:bg-slate-500" onClick={() => toggleStageExpansion(stage.id)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex-grow grid" style={{ gridTemplateColumns: `repeat(${stageCols}, 1fr)` }}>
                          {subHeaders.map((sub, i) => (
                            <div key={i} className="text-xs font-normal bg-slate-500 border-r border-slate-400 last:border-r-0 flex items-center justify-center p-1 gap-1 min-w-[120px]">
                              <span className="truncate" title={sub.name}>{sub.name}</span>
                              {sub.type === 'doc' && sub.hasFields && (
                                <Button variant="ghost" size="icon" className="h-4 w-4 p-0 text-white hover:bg-slate-400" onClick={() => toggleDocumentExpansion(sub.id)}>
                                  {expandedDocuments.has(sub.id) ? <Minus className="h-2 w-2" /> : <Plus className="h-2 w-2" />}
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

          <TableBody className="divide-y divide-slate-200">
            {(dataLoading.tasks || dataLoading.stages || dataLoading.companies) ? (
              <TableRow><TableCell colSpan={20} className="h-32 text-center text-slate-500">Loading...</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={20} className="h-32 text-center text-destructive">{error}</TableCell></TableRow>
            ) : (
              sortedTasks.map((task) => (
                <TableRow key={task.id} className="group bg-white hover:bg-blue-50/50">
                  {/* MODIFIED: Applicant Name cell with new Link button */}
                  <TableCell className="sticky left-0 z-10 group-hover:bg-blue-50/50 bg-white border border-gray-100 font-medium text-sm text-slate-800 p-2 align-middle">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-grow">
                        <div className="truncate" title={task.applicant_name}>{task.applicant_name || 'N/A'}</div>
                        <div className="text-xs text-slate-500">ID: {task.id}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-blue-500 hover:bg-blue-100 flex-shrink-0"
                        title="Link source documents"
                        onClick={() => {
                          setLinkingTask(task);
                          setIsLinkDialogOpen(true);
                        }}
                      >
                        <LinkIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="border border-gray-100 text-center text-sm p-2 align-middle">
                    {renderImmigrationStatusCell(task)}
                  </TableCell>
                  <TableCell className="border border-gray-100 text-center text-sm p-2 align-middle"><div className="max-w-[160px] mx-auto truncate" title={companies.get(task.company_id)}>{companies.get(task.company_id) || 'N/A'}</div></TableCell>
                  <TableCell className="border border-gray-100 text-center text-sm p-2 align-middle"><Badge variant={task.status === 'completed' ? 'success' : task.status === 'in_progress' ? 'secondary' : 'outline'} className="text-xs font-semibold">{task.status || 'pending'}</Badge></TableCell>

                  {visibleStages.map(stage => {
                    const document = getDocumentForTaskStage(task, stage);
                    if (!isStageApplicableToTask(stage, task)) {
                      let stageCols = 1;
                      if (expandedStages.has(stage.id) && stage.documents?.length > 0) {
                        stageCols = stage.documents.reduce((acc, doc) => {
                          if (expandedDocuments.has(doc.id) && doc.kycId) {
                            const kycFields = kycFieldsMap.get(doc.kycId) || [];
                            return acc + (kycFields.length || 1);
                          }
                          return acc + 1;
                        }, 0);
                      }
                      return <TableCell key={`${stage.id}-na`} colSpan={Math.max(1, stageCols)} className="border border-gray-100 text-center text-slate-400 italic text-xs align-middle">N/A</TableCell>
                    }

                    if (!expandedStages.has(stage.id) || !stage.documents || stage.documents.length === 0) {
                      return <TableCell key={stage.id} className="border border-gray-100 p-1 align-middle"><EditableStageCell stage={stage} task={task} value={task.stages?.[stage.id]} allDocuments={allDocuments} onDocumentUpload={handleStageDocumentUpload} onShowDocuments={handleViewDocument} getKycFields={getKycFields} onSave={enhancedHandleStageStatusSave} /></TableCell>
                    }

                    return stage.documents.map(doc => {
                      // This now gets the single linked document, or undefined
                      const linkedDocumentForType = getDocumentForTaskStage(task, { ...stage, documents: [doc] });

                      const isOldDoc = linkedDocumentForType && task.created_at &&
                        isDocumentOlderThanTask(linkedDocumentForType.created_at, task.created_at)
                      const hasIndicator = linkedDocumentForType?.indicator === true;

                      if (!expandedDocuments.has(doc.id) || !doc.kycId || !kycFieldsMap.has(doc.kycId) || kycFieldsMap.get(doc.kycId).length === 0 || hasIndicator || isOldDoc) {
                        return (
                          <TableCell key={`${doc.id}`} className="border border-gray-100 p-1 align-middle">
                            <DocumentStageCell
                              stage={{ ...stage, documents: [doc] }}
                              task={task}
                              onDocumentUpload={handleStageDocumentUpload}
                              onShowDocuments={handleViewDocument}
                              getKycFields={getKycFields}
                              allDocuments={allDocuments}
                              isStageApplicableToTask={isStageApplicableToTask}
                              isDocumentApplicableToTask={isDocumentApplicableToTask}
                              kycDocuments={kycDocuments}
                              // Pass the determined linked document to the cell
                              linkedDocument={linkedDocumentForType}
                            />
                          </TableCell>
                        )
                      } else {
                        const kycFields = kycFieldsMap.get(doc.kycId) || [];
                        return kycFields.map(field => (
                          <TableCell key={`${field.id || field.fieldName}`} className="border border-gray-100 p-1 align-middle">
                            <DocumentFieldCell document={linkedDocumentForType} field={field} isOldDocument={isOldDoc} />
                          </TableCell>
                        ))
                      }
                    }).flat()
                  })}

                  <TableCell className="text-center text-sm p-2 align-middle">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleTaskEdit(task)} className="h-8 w-8 text-blue-600 hover:bg-blue-100" title="Edit Task"><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => onTaskAction?.({ type: 'delete', task })} className="h-8 w-8 text-red-600 hover:bg-red-100" title="Delete Task"><Trash2 className="h-4 w-4" /></Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:bg-slate-100" title="More Actions">
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handlePushCase(task, 27, 'Alien')} disabled={isPushingCase}>
                            <Send className="mr-2 h-4 w-4" /> Push to Alien
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePushCase(task, 7, 'Re-Entry Pass')} disabled={isPushingCase}>
                            <Send className="mr-2 h-4 w-4" /> Push to Re-Entry
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDownloadZip(task)} disabled={isDownloading}>
                            <DownloadCloud className="mr-2 h-4 w-4" /> Download Docs
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    )
  }, [stages, dataLoading, error, companies, isStageApplicableToTask, expandedStages, expandedDocuments, allDocuments, handleStageDocumentUpload, handleViewDocument, onTaskAction, handleTaskEdit, toggleStageExpansion, toggleDocumentExpansion, getKycFields, kycDocuments, isDocumentApplicableToTask, visibleStageIds, sortConfig, enhancedHandleStageStatusSave, handlePushCase, handleDownloadZip, isPushingCase, isDownloading, getDocumentForTaskStage, renderImmigrationStatusCell, getSortedTasks])

  const renderEnhancedTransposedTable = useCallback((tasks: any[], tableType: string) => {
    if (!tasks.length) {
      return (
        <div className="flex flex-col items-center justify-center p-16 bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-200">
          <FileText className="h-12 w-12 text-slate-400" />
          <p className="mt-4 font-semibold text-slate-700">No {tableType} found</p>
          <p className="text-sm text-slate-500">Tasks with this status will appear here.</p>
        </div>
      )
    }

    // Calculate header structure with dependants positioned next to principal
    const headerStructure = []
    tasks.forEach(task => {
      headerStructure.push({ type: 'principal', task })
      if (expandedDependants.has(task.id.toString()) && task.dependnats_members?.length > 0) {
        task.dependnats_members.forEach((dep, index) => {
          headerStructure.push({ type: 'dependant', task, dependant: dep, index })
        })
      }
    })

    const totalColumns = headerStructure.length

    return (
      <div className="space-y-4">
        <div className="border-2 border-slate-300 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          <Table className="min-w-full border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-20 bg-slate-100/80 backdrop-blur-sm">
              {/* Row 1: Task IDs */}
              <TableRow className="border-b-2 border-slate-400">
                <TableHead className="sticky left-0 z-30 bg-blue-600 font-bold text-white text-sm py-3 border-r-2 border-slate-400 w-20" rowSpan={6}>
                  Order
                </TableHead>
                <TableHead className="sticky left-20 z-30 bg-blue-600 font-bold text-white text-sm py-3 border-r-2 border-slate-400 w-[300px]" rowSpan={6}>
                  Fields
                </TableHead>
                {headerStructure.map((item, index) => (
                  <TableHead key={`header-${index}`} className={`font-semibold text-white min-w-[200px] text-center text-sm py-2 border-r border-slate-400 border-b ${item.type === 'principal' ? 'bg-blue-500' : 'bg-orange-500'}`}>
                    {item.type === 'principal' ? (
                      <div className="font-bold">{`Task ${item.task.id}`}</div>
                    ) : (
                      <div className="font-bold text-xs">{`Dep ${item.index + 1}`}</div>
                    )}
                  </TableHead>
                ))}
              </TableRow>

              {/* Row 2: Names */}
              <TableRow className="border-b-2 border-slate-400 bg-blue-500 text-white">
                {headerStructure.map((item, index) => (
                  <TableHead key={`name-${index}`} className={`font-semibold text-white min-w-[200px] text-center text-sm border-r border-slate-400 border-b py-2 ${item.type === 'principal' ? 'bg-blue-500' : 'bg-orange-500'}`}>
                    {item.type === 'principal' ? (
                      <div className="flex items-center justify-center gap-1">
                        <span className="font-bold">{item.task.applicant_name || 'N/A'}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 p-0 text-white hover:bg-blue-600"
                          onClick={() => {
                            setLinkingTask(item.task);
                            setIsLinkDialogOpen(true);
                          }}
                          title="Link Source Document"
                        >
                          <LinkIcon className="h-3 w-3" />
                        </Button>
                        {item.task.dependnats_members && Array.isArray(item.task.dependnats_members) && item.task.dependnats_members.length > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 p-0 text-white hover:bg-blue-600"
                            onClick={() => toggleDependantsExpansion(item.task.id.toString())}
                          >
                            {expandedDependants.has(item.task.id.toString()) ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-bold text-xs">{item.dependant.name || `Dependant ${item.index + 1}`}</span>
                        <span className="text-xs opacity-80">{item.dependant.relationship || 'Dependant'}</span>
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>

              {/* Row 3: Current Immigration Status */}
              <TableRow className="border-b-2 border-slate-400 bg-slate-50 text-slate-700">
                {headerStructure.map((item, index) => {
                  let statusComponent = <span className="text-xs text-gray-400">-</span>;
                  if (item.type === 'principal') {
                    statusComponent = renderImmigrationStatusCell(item.task);
                  }

                  return (
                    <TableHead key={`status-${index}`} className={`font-medium min-w-[200px] text-center text-xs border-r border-slate-400 border-b py-2 ${item.type === 'principal' ? '' : 'bg-orange-50'}`}>
                      {statusComponent}
                    </TableHead>
                  );
                })}
              </TableRow>

              {/* Row 4: Company Names */}
              <TableRow className="border-b-2 border-slate-400 bg-blue-500 text-white">
                {headerStructure.map((item, index) => (
                  <TableHead key={`company-${index}`} className={`font-semibold text-white min-w-[200px] text-center text-sm border-r border-slate-400 border-b py-2 ${item.type === 'principal' ? 'bg-blue-500' : 'bg-orange-500'}`}>
                    {item.type === 'principal' ? (
                      companies.get(item.task.company_id) || 'No Company'
                    ) : ''}
                  </TableHead>
                ))}
              </TableRow>

              {/* Row 5: Job Level */}
              <TableRow className="border-b-2 border-slate-400 bg-blue-500 text-white">
                {headerStructure.map((item, index) => (
                  <TableHead key={`job-${index}`} className={`font-semibold text-white min-w-[200px] text-center text-sm border-r border-slate-400 border-b py-2 ${item.type === 'principal' ? 'bg-blue-500' : 'bg-orange-500'}`}>
                    {item.type === 'principal' ? (
                      getTaskHierarchy(item.task)?.subclass?.name || getTaskHierarchy(item.task)?.class?.name || getTaskHierarchy(item.task)?.subdepartment?.name || 'N/A'
                    ) : ''}
                  </TableHead>
                ))}
              </TableRow>

              {/* Row 6: Current Stage (New) */}
              <TableRow className="border-b-2 border-slate-400 bg-slate-100 text-slate-700">
                {headerStructure.map((item, index) => {
                  let currentStageInfo = null;
                  if (item.type === 'principal') {
                    const currentStage = determineCurrentStage(item.task, stages);
                    currentStageInfo = currentStage ? currentStage.name : 'No Stage';
                  }

                  return (
                    <TableHead key={`current-stage-${index}`} className={`font-medium min-w-[200px] text-center text-xs border-r border-slate-400 border-b py-2 ${item.type === 'principal' ? '' : 'bg-orange-50'}`}>
                      {item.type === 'principal' ? (
                        <Badge variant="outline" className="text-xs">
                          {currentStageInfo}
                        </Badge>
                      ) : ''}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-slate-200">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={totalColumns + 2} className="h-32 text-center">
                    <div className="flex justify-center items-center gap-2 text-slate-600">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Loading table data...
                    </div>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={totalColumns + 2} className="h-32 text-center text-red-600 border border-gray-100">
                    <div className="flex justify-center items-center gap-2"><AlertTriangle className="h-5 w-5" />{error}</div>
                  </TableCell>
                </TableRow>
              ) : (
                tableRows.map((row, index) => {
                  const rowBg = row.isSubSubRow ? 'bg-slate-100/50' : row.isSubRow ? 'bg-slate-50/60' : 'bg-white';
                  const hoverBg = 'hover:bg-blue-50/50';

                  if (row.type === 'section_header') {
                    const Icon = row.icon;
                    return (
                      <TableRow key={row.key} className="bg-slate-200 border-y-2 border-slate-400 hover:bg-slate-200 border-b">
                        <TableCell className="py-0 px-0" colSpan={2}>
                          <div className="flex items-center justify-between px-3 py-2">
                            <div className="flex items-center gap-3">
                              <Icon className="h-5 w-5 text-slate-600" />
                              <span className="font-bold text-slate-700 text-lg">{row.label}</span>
                            </div>
                            <div className="py-0 px-0 text-right">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleSectionExpansion(row.id)}>
                                {expandedSections.has(row.id) ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell colSpan={totalColumns} className="py-0 px-0"></TableCell>
                      </TableRow>
                    )
                  }

                  return (
                    <TableRow key={row.key} className={`${rowBg} ${hoverBg} group border-b border-slate-200`}>
                      <TableCell className={`sticky left-0 z-10 ${rowBg.split('/')[0]} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 text-center w-20`}>
                        {row.stageOrder || (row.type === 'basic' || row.type === 'badge' || row.type === 'date' || row.type === 'stat' ? (index + 1) : '')}
                      </TableCell>
                      <TableCell className={`sticky left-20 z-10 ${rowBg.split('/')[0]} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 min-w-[400px]`}>
                        <div className="flex items-center gap-2 justify-between">
                          <div style={{ paddingLeft: row.isSubSubRow ? '32px' : row.isSubRow ? '16px' : '0px' }}>
                            <span className={row.type === 'stage' ? 'font-semibold' : ''}>{row.label}</span>
                          </div>
                          {row.type === 'stage' && row.stage?.documents?.length > 0 && (
                            <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-slate-500 hover:text-slate-800" onClick={() => toggleStageExpansion(row.stage.id)}>
                              {expandedStages.has(row.stage.id) ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                            </Button>
                          )}
                          {row.type === 'document' && row.document?.kycId && (
                            <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-slate-500 hover:text-slate-800" onClick={() => toggleDocumentExpansion(row.document.id)}>
                              {expandedDocuments.has(row.document.id) ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      {headerStructure.map((item, colIndex) => (
                        <TableCell key={`${row.key}-${colIndex}`} className={`text-center text-sm py-1 px-2 align-middle border border-gray-100 w-[200px] ${item.type === 'dependant' ? 'bg-orange-50/50' : ''}`}>
                          {item.type === 'principal' ? (
                            renderCellContent(row, item.task)
                          ) : (
                            // Render dependant data
                            row.key === 'applicant_name' && item.dependant.name ? item.dependant.name :
                              row.key === 'nationality' && item.dependant.nationality ? item.dependant.nationality :
                                row.key === 'age' && item.dependant.age ? item.dependant.age.toString() :
                                  row.key === 'case_status' ? <Badge variant="outline">{item.dependant.relationship || 'Dependant'}</Badge> :
                                    <span className="text-xs text-gray-400">-</span>
                          )}
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
  }, [loading, error, tableRows, renderCellContent, expandedSections, expandedStages, expandedDocuments, expandedDependants, toggleSectionExpansion, toggleStageExpansion, toggleDocumentExpansion, companies, toggleDependantsExpansion, getTaskHierarchy, getImmigrationStatus])

  const defaultSubdepartments = getDefaultSubdepartments()

  // Loading state for all initial data
  if (dataLoading.departments || isAnyDataLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50/30">
        <div className="text-center space-y-3">
          <Loader2 className="h-12 w-12 animate-spin text-slate-600 mx-auto" />
          <p className="font-semibold text-slate-800">Loading Workspace...</p>
          <p className="text-sm text-slate-600">
            {dataLoading.departments ? 'Loading departments...' :
              dataLoading.companies ? 'Loading companies...' :
                dataLoading.documents ? 'Loading documents...' :
                  dataLoading.kycFields ? 'Loading KYC fields...' :
                    dataLoading.users ? 'Loading users...' :
                      dataLoading.tasks ? 'Loading tasks...' :
                        dataLoading.stages ? 'Loading stages...' : 'Finalizing...'}
          </p>
        </div>
      </div>
    )
  }

  if (!departments.length) {
    return (
      <div className="flex-1 p-8 bg-slate-50/30">
        <Card className="border-2 border-dashed border-slate-300 bg-white">
          <CardHeader className="text-center items-center">
            <Building className="h-12 w-12 text-slate-400 mb-2" />
            <CardTitle className="text-xl">No Departments Found</CardTitle>
            <CardDescription className="text-slate-700">Please add departments via the Admin panel to start managing tasks.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => window.location.href = '/dashboard/departments'}>Go to Departments</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-2 p-2 bg-slate-50/30 min-h-screen">
      <Tabs value={activeDepartmentTab} onValueChange={setActiveDepartmentTab} className="space-y-2">
        <TabsList className="grid w-full rounded-lg p-1 shadow-sm" style={{ gridTemplateColumns: `repeat(${departments.length}, 1fr)` }}>
          {departments.map(dept => (
            <TabsTrigger key={dept.id} value={dept.id.toString()} className="text-sm font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
              {dept.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {departments.map(dept => (
          <TabsContent key={dept.id} value={dept.id.toString()} className="space-y-4">
            {/* Subdepartment Tabs */}
            {defaultSubdepartments.length > 0 && (
              <Tabs value={activeSubdepartmentTab} onValueChange={setActiveSubdepartmentTab}>
                <TabsList className="rounded-lg p-1 shadow-sm bg-slate-100">
                  <TabsTrigger value="" className="text-sm font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">
                    All Subdepartments
                  </TabsTrigger>
                  {defaultSubdepartments.map(subdept => (
                    <TabsTrigger key={subdept.id} value={subdept.id.toString()} className="text-sm font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">
                      {subdept.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}

            <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
              <TabsList className="rounded-lg p-1 shadow-sm">
                <TabsTrigger value="enquiries" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                  Enquiries <Badge variant="secondary">{enquiryTasks.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="wip-stages" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                  WIP Stages <Badge variant="secondary">{wipTasks.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="completed" className="text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                  Completed <Badge variant="secondary">{completedTasks.length}</Badge>
                </TabsTrigger>
              </TabsList>

              {/* All Tabs Content */}
              {['enquiries', 'wip-stages', 'completed'].map(tabValue => {
                const isWipTab = tabValue === 'wip-stages';
                let tasksToRender, title;
                if (tabValue === 'enquiries') { tasksToRender = enquiryTasks; title = 'Enquiries'; }
                else if (tabValue === 'wip-stages') { tasksToRender = wipTasks; title = 'WIP Stages'; }
                else { tasksToRender = completedTasks; title = 'Completed Tasks'; }

                return (
                  <TabsContent key={tabValue} value={tabValue} className="mt-4">
                    <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-slate-100">
                      <CardHeader className="border-b border-slate-100 bg-white">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                          <div>
                            <CardTitle className="text-lg text-slate-800">
                              {title} - {dept.name}
                              {activeSubdepartmentTab && defaultSubdepartments.find(s => s.id.toString() === activeSubdepartmentTab) &&
                                ` - ${defaultSubdepartments.find(s => s.id.toString() === activeSubdepartmentTab)?.name}`
                              }
                            </CardTitle>
                            <CardDescription className="text-slate-600">
                              Showing {tasksToRender.length} {globalSearchTerm ? 'filtered ' : ''}tasks {isTransposedView ? '(Transposed View)' : '(Standard View)'}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            {tabValue === 'enquiries' && <Button className="flex items-center gap-2" onClick={() => setIsEnquiryDialogOpen(true)}><Plus className="h-4 w-4" />New Enquiry</Button>}
                            <div className="relative">
                              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                              <Input
                                placeholder="Search tasks, applicants, companies..."
                                value={globalSearchTerm}
                                onChange={(e) => setGlobalSearchTerm(e.target.value)}
                                className="pl-8 w-64"
                              />
                              {globalSearchTerm && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-1 top-1 h-6 w-6"
                                  onClick={() => setGlobalSearchTerm('')}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>

                            {isTransposedView && (
                              <>
                                <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={expandAll}><Plus className="h-4 w-4" />Expand All</Button>
                                <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={collapseAll}><Minus className="h-4 w-4" />Collapse All</Button>
                              </>
                            )}

                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-2"
                              onClick={() => setIsTransposedView(!isTransposedView)}
                            >
                              {isTransposedView ? <TableProperties className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                              {isTransposedView ? 'Standard View' : 'Transposed View'}
                            </Button>

                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="flex items-center gap-2">
                                  <Settings className="h-4 w-4" />
                                  {isTransposedView ? `Fields (${visibleHeaders.size + visibleStats.size + visibleStageIds.size})` : `Columns (${visibleHeaders.size + visibleStageIds.size})`}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-80">
                                <div className="space-y-4">
                                  <div className="space-y-2">
                                    <h4 className="font-medium">
                                      {isTransposedView ? 'Visible Fields & Rows' : 'Visible Columns'}
                                    </h4>
                                    <p className="text-sm text-muted-foreground">
                                      {isTransposedView ? 'Select which fields and stages to display' : 'Select which columns to display'}
                                    </p>
                                  </div>
                                  {/* Stats Fields (only in transposed view) */}
                                  {isTransposedView && (
                                    <div className="space-y-2 border-t pt-2">
                                      <h5 className="text-sm font-medium text-slate-700">Statistics ({visibleStats.size})</h5>
                                      {STATS_HEADERS.map((stat) => (
                                        <div key={stat.id} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={stat.id}
                                            checked={visibleStats.has(stat.id)}
                                            onCheckedChange={() => toggleStatsVisibility(stat.id)}
                                          />
                                          <Label
                                            htmlFor={stat.id}
                                            className="text-sm font-normal cursor-pointer"
                                          >
                                            {stat.label}
                                          </Label>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {/* Case Details Fields */}
                                  <div className="space-y-2 border-t pt-2">
                                    <h5 className="text-sm font-medium text-slate-700">Case Details ({visibleHeaders.size})</h5>
                                    {ENHANCED_TABLE_HEADERS.map((header) => (
                                      <div key={header.id} className="flex items-center space-x-2">
                                        <Checkbox
                                          id={header.id}
                                          checked={visibleHeaders.has(header.id)}
                                          onCheckedChange={() => toggleHeaderVisibility(header.id)}
                                        />
                                        <Label
                                          htmlFor={header.id}
                                          className="text-sm font-normal cursor-pointer"
                                        >
                                          {header.label}
                                        </Label>
                                      </div>
                                    ))}

                                  </div>

                                  {/* Visible Stages Section */}
                                  <div className="space-y-2 border-t pt-2">
                                    <h5 className="text-sm font-medium text-slate-700">Visible Stages ({visibleStageIds.size})</h5>
                                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                                      {stages.sort((a, b) => (a.order_num || 0) - (b.order_num || 0)).map((stage) => (
                                        <div key={`vis-${stage.id}`} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={`stage-vis-${stage.id}`}
                                            checked={visibleStageIds.has(stage.id.toString())}
                                            onCheckedChange={() => toggleStageVisibility(stage.id.toString())}
                                          />
                                          <Label
                                            htmlFor={`stage-vis-${stage.id}`}
                                            className="text-sm font-normal cursor-pointer"
                                          >
                                            {stage.name}
                                          </Label>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="flex gap-2 pt-2 border-t">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setVisibleHeaders(new Set(ENHANCED_TABLE_HEADERS.filter(h => h.default).map(h => h.id)))
                                        if (isTransposedView) setVisibleStats(new Set(STATS_HEADERS.filter(s => s.default).map(s => s.id)))
                                        setVisibleStageIds(new Set(stages.map(s => s.id.toString())))
                                      }}
                                    >
                                      Show All
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setVisibleHeaders(new Set(ENHANCED_TABLE_HEADERS.map(h => h.id)))
                                        if (isTransposedView) setVisibleStats(new Set(STATS_HEADERS.map(s => s.id)))
                                        setVisibleStageIds(new Set(stages.map(s => s.id.toString())))
                                      }}
                                    >
                                      Reset
                                    </Button>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>

                            <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => handleExport(tasksToRender, title)}>
                              <Download className="h-4 w-4" />Export to Excel
                            </Button>

                            <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={refreshAllData}>
                              <RotateCcw className="h-4 w-4" />Refresh
                            </Button>
                          </div>
                        </div>

                        {isWipTab && (
                          <div className="mt-4">
                            <Tabs value={activeFollowUpFilter} onValueChange={setActiveFollowUpFilter}>
                              <TabsList className="rounded-lg p-1 shadow-sm bg-slate-100">
                                <TabsTrigger value="all" className="text-xs md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">All <Badge variant="outline">{wipTasks.length}</Badge></TabsTrigger>
                                <TabsTrigger value="bcl" className="text-xs md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">BCL <Badge variant="outline">{getWIPTasksByFollowUp('bcl').length}</Badge></TabsTrigger>
                                <TabsTrigger value="officer" className="text-xs md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">Officer <Badge variant="outline">{getWIPTasksByFollowUp('officer').length}</Badge></TabsTrigger>
                                <TabsTrigger value="client" className="text-xs md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">Client <Badge variant="outline">{getWIPTasksByFollowUp('client').length}</Badge></TabsTrigger>
                              </TabsList>
                            </Tabs>
                          </div>
                        )}
                      </CardHeader>
                      <CardContent className="p-2 sm:p-4">
                        {isTransposedView ? renderEnhancedTransposedTable(tasksToRender, title) : renderStandardTable(tasksToRender, title)}
                      </CardContent>
                    </Card>
                  </TabsContent>
                );
              })}
            </Tabs>
          </TabsContent>
        ))}
      </Tabs>

      <EditTaskDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        task={editingTask}
        departments={departments}
        tmUsers={tmUsers}
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
        onStageCompleted={(stageId, taskId, stageData) => {
          // This will be called when a stage is completed in StageUploadDialog
          enhancedHandleStageStatusSave(stageId, taskId, stageData.date || new Date().toLocaleDateString('en-GB'), stageData)
        }}
      />

      {linkingTask && (
        <LinkSourceDocumentDialog
          open={isLinkDialogOpen}
          onOpenChange={setIsLinkDialogOpen}
          task={linkingTask}
          stages={stages}
          allDocuments={allDocuments}
          kycDocuments={kycDocuments}
          isStageApplicableToTask={isStageApplicableToTask}
          onLinkSuccess={() => {
            setIsLinkDialogOpen(false);
            setLinkingTask(null);
            refreshAllData(); // Refresh data to show the newly linked documents
          }}
        />
      )}

      {/* Extraction Preview Dialog */}
      <Dialog open={!!previewDocument} onOpenChange={(isOpen) => !isOpen && setPreviewDocument(null)}>
        <DialogContent className="max-w-none w-full h-full p-0 m-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Document Preview</DialogTitle>
            <DialogDescription>Preview of the extracted document data</DialogDescription>
          </DialogHeader>
          {previewDocument && (
            <ExtractionPreview
              documentId={previewDocument.documentId}
              documentName={previewDocument.documentName}
              fileUrl={previewDocument.fileUrl}
              extractedData={previewDocument.extractedData}
              fields={previewDocument.fields}
              onClose={() => setPreviewDocument(null)}
              onSave={(updatedData) => {
                console.log("Saving updated data:", updatedData);
                setPreviewDocument(null);
                toast({ title: "Success", description: "Document details saved." });
              }}
              file={previewDocument.file}
              type={previewDocument.type}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}