// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, ChevronDown, Plus, Minus, Loader2, Settings, Search, X, TableProperties, RotateCcw, Pencil, AlertTriangle, Send, DownloadCloud, ArrowUpDown, ArrowUp, ArrowDown, Link as LinkIcon } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, Edit, Trash2, Download, Building, Briefcase } from "lucide-react"
import { EnquiryDialog } from "./components/EnquiryDialog"
import { format, isAfter, isEqual, isValid, parse, startOfToday } from 'date-fns';
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { EditTaskDialog } from "./components/EditTaskDialog"
import { fetchDepartments } from "../departments/departments/database"
import { DepartmentTasksManagerProps } from "./components/types"
import { StageUploadDialog } from "./components/StageUploadDialog"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import EditableStageCell from "./components/EditableStageCell"
import ExtractionPreview from "@/components/ExtractionPreview"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import { fetchTasks, fetchStages, fetchCompanies, fetchAllDocuments, fetchAllKycFields, fetchKycDocument, isDocumentOlderThanTask, formatDateValue, type Task as UtilTask, type Department, type KycDocument, type Document } from "./utils/taskManagerData"
import { LinkSourceDocumentDialog } from './components/LinkSourceDocumentDialog';
import { DocumentFieldCell } from './components/DocumentFieldCell';

// Enhanced table headers with granular breakdown
const ENHANCED_TABLE_HEADERS = [
  { id: 'id', label: 'Task ID', default: true, width: 'w-20' },
  { id: 'applicant_name', label: 'Applicant Name', default: true, width: 'w-48' },
  { id: 'immigration_document_type', label: 'Current Immigration Doc Type', default: true, width: 'w-48' },
  { id: 'immigration_expiry_date', label: 'Current Immigration Expiry Date', default: false, width: 'w-40' },
  { id: 'immigration_status', label: 'Current Immigration Status', default: true, width: 'w-48' },
  { id: 'current_stage_name', label: 'Current Stage Name', default: false, width: 'w-48' },
  { id: 'current_stage_status_value', label: 'Current Stage Status', default: true, width: 'w-48' },
  { id: 'current_stage_follow_up', label: 'Current Stage Follow-up', default: false, width: 'w-40' },
  { id: 'company_name', label: 'Company Name', default: true, width: 'w-48' },
  { id: 'job_level', label: 'Job Level', default: true, width: 'w-32' },
  { id: 'renewal_new', label: 'Renewal/New', default: false, width: 'w-28' },
  { id: 'case_status', label: 'Case Status', default: false, width: 'w-28' },
  { id: 'nationality', label: 'Nationality', default: false, width: 'w-32' },
  { id: 'age', label: 'Age', default: true, width: 'w-20' },
  { id: 'task_manager', label: 'Task Manager', default: true, width: 'w-32' },
  { id: 'officer', label: 'Officer', default: true, width: 'w-32' },
  { id: 'task_assistant', label: 'Task Assistant', default: true, width: 'w-32' },
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
  handleStageStatusSave,
  onTaskUpdate,
  getCurrentRequirements
}: DepartmentTasksManagerProps) {
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
  const [isEnquiryDialogOpen, setIsEnquiryDialogOpen] = useState(false)
  const [selectedStageTask, setSelectedStageTask] = useState<{ task: any, stage: any } | null>(null)
  const [isStageUploadDialogOpen, setIsStageUploadDialogOpen] = useState(false)
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
  const [isPushingCase, setIsPushingCase] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [globalSearchTerm, setGlobalSearchTerm] = useState<string>('')
  const [visibleHeaders, setVisibleHeaders] = useState<Set<string>>(new Set(ENHANCED_TABLE_HEADERS.filter(h => h.default).map(h => h.id)))
  const [visibleStats, setVisibleStats] = useState<Set<string>>(new Set(STATS_HEADERS.filter(h => h.default).map(h => h.id)))
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
  const [activeOfficerTab, setActiveOfficerTab] = useState<string | null>(null)
  const [activeManagerTab, setActiveManagerTab] = useState<string | null>(null)
  const [activeAssistantTab, setActiveAssistantTab] = useState<string | null>(null)
  const [subdepartmentOfficers, setSubdepartmentOfficers] = useState<Array<{ id: string, name: string }>>([])
  const [subdepartmentManagers, setSubdepartmentManagers] = useState<Array<{ id: string, name: string }>>([])
  const [subdepartmentAssistants, setSubdepartmentAssistants] = useState<Array<{ id: string, name: string }>>([])
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkingTask, setLinkingTask] = useState<UtilTask | null>(null);
  const [dataLoading, setDataLoading] = useState({ departments: true, companies: true, documents: true, kycFields: true, tasks: true, stages: false, users: true })
  const [isClassSelectionOpen, setIsClassSelectionOpen] = useState(false);
  const [selectedTaskForPush, setSelectedTaskForPush] = useState<{ task: UtilTask; targetDeptId: number; targetSubDeptId: number; targetSubDeptName: string; isApplicant: boolean } | null>(null);
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);
  const [tableRows, setTableRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [taskDependants, setTaskDependants] = useState<Map<string, any[]>>(new Map());
  const [enhancedTasksData, setEnhancedTasksData] = useState<Map<string, any>>(new Map());

  const calculateAge = useCallback((dateOfBirth: string | null): number | null => {
    if (!dateOfBirth) return null;

    try {
      const birthDate = new Date(dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      return age;
    } catch (error) {
      console.error('Error calculating age:', error);
      return null;
    }
  }, []);

  // Enhanced function to fetch all dependants and applicant data
  const fetchAllDependantsAndApplicants = useCallback(async (tasks: UtilTask[]) => {
    try {
      const allIndividualIds = new Set<number>();
      
      // Collect applicant IDs
      tasks.forEach(task => {
        if (task.individual_id) {
          allIndividualIds.add(task.individual_id);
        }
      });

      // Collect dependant IDs
      tasks.forEach(task => {
        if (task.dependant_member && Array.isArray(task.dependant_member)) {
          task.dependant_member.forEach(dep => {
            if (dep?.id) {
              allIndividualIds.add(dep.id);
            }
          });
        }
      });

      if (allIndividualIds.size === 0) return { dependantsMap: new Map(), applicantsMap: new Map() };

      // Fetch all unique individuals (both applicants and dependants) in a single query
      const { data, error } = await supabase
        .from('registry_individuals')
        .select('id, full_name, nationality, date_of_birth, relationships')
        .in('id', Array.from(allIndividualIds));

      if (error) {
        console.error('Error fetching all individuals:', error);
        return { dependantsMap: new Map(), applicantsMap: new Map() };
      }

      // Separate dependants and applicants
      const dependantsMap = new Map<number, any>();
      const applicantsMap = new Map<number, any>();
      
      data.forEach(individual => {
        const enhancedIndividual = {
          ...individual,
          age: calculateAge(individual.date_of_birth),
          individual_id: individual.id
        };

        // Check if this individual is an applicant
        const isApplicant = tasks.some(task => task.individual_id === individual.id);
        
        if (isApplicant) {
          applicantsMap.set(individual.id, enhancedIndividual);
        }

        // Check if this individual is a dependant
        const isDependant = tasks.some(task => 
          task.dependant_member && Array.isArray(task.dependant_member) &&
          task.dependant_member.some(dep => dep?.id === individual.id)
        );

        if (isDependant) {
          dependantsMap.set(individual.id, enhancedIndividual);
        }
      });

      return { dependantsMap, applicantsMap };
    } catch (error) {
      console.error('Error in fetchAllDependantsAndApplicants:', error);
      return { dependantsMap: new Map(), applicantsMap: new Map() };
    }
  }, [calculateAge]);

  // Enhanced useEffect to handle both dependants and applicants
  useEffect(() => {
    const fetchAndMapIndividuals = async () => {
      if (!tasks.length) return;
      
      const { dependantsMap, applicantsMap } = await fetchAllDependantsAndApplicants(tasks);
      
      // Map each task to its dependants
      const taskDependantsMap = new Map<string, any[]>();
      const enhancedTasksMap = new Map<string, any>();
      
      tasks.forEach(task => {
        // Enhance task with applicant data
        const applicantData = applicantsMap.get(task.individual_id);
        enhancedTasksMap.set(task.id.toString(), {
          ...task,
          applicant_data: applicantData,
          nationality: applicantData?.nationality || task.nationality,
          age: applicantData?.age || task.age
        });

        // Map dependants
        if (task.dependant_member && Array.isArray(task.dependant_member)) {
          const taskDependants = task.dependant_member
            .filter(dep => dep?.id && dependantsMap.has(dep.id))
            .map(dep => ({
              ...dependantsMap.get(dep.id),
              relationship: dep.relationship || 'Dependant'
            }));
          
          if (taskDependants.length > 0) {
            taskDependantsMap.set(task.id.toString(), taskDependants);
          }
        }
      });
      
      setTaskDependants(taskDependantsMap);
      setEnhancedTasksData(enhancedTasksMap);
    };
    
    fetchAndMapIndividuals();
  }, [tasks, fetchAllDependantsAndApplicants]);

  const getStaffName = useCallback((userId) => {
    if (!userId) return '';
    const user = tmUsers.get(parseInt(userId.toString()));
    return user?.name || `User ${userId}`;
  }, [tmUsers]);

  const getCurrentOfficer = useCallback((officerHistory) => {
    if (!officerHistory || !Array.isArray(officerHistory)) return null;
    return officerHistory.find(officer => !officer.end_date) || null;
  }, []);

  const getCurrentManager = useCallback((managerHistory) => {
    if (!managerHistory || !Array.isArray(managerHistory)) return null;
    return managerHistory.find(manager => !manager.end_date) || null;
  }, []);

  const getCurrentAssistants = useCallback((assistantHistory) => {
    if (!assistantHistory || !Array.isArray(assistantHistory)) return [];
    return assistantHistory.filter(assistant => !assistant.end_date);
  }, []);

  const getDocumentForTaskStage = useCallback((
    task: UtilTask,
    stage: { id: string; documents?: { kycId: string }[] },
  ): Document | undefined => {
    const linkedDocumentData = task.source_document_id?.[stage.id];
    if (linkedDocumentData) {
      const documentId = typeof linkedDocumentData === 'string'
        ? linkedDocumentData
        : linkedDocumentData.id;
      return allDocuments.find(doc => doc.id === documentId);
    }
    return undefined;
  }, [allDocuments]);

  const getActiveStaffFromSubdepartment = useCallback((subdepartmentId: string) => {
    if (!subdepartmentId || !departments.length) {
      return { officers: [], managers: [], assistants: [] };
    }

    const department = departments.find(d => d.id.toString() === activeDepartmentTab);
    if (!department) return { officers: [], managers: [], assistants: [] };

    const subdepartment = department.tm_subdepartments?.find(s => s.id.toString() === subdepartmentId);
    if (!subdepartment) return { officers: [], managers: [], assistants: [] };

    const activeOfficers = subdepartment.officer_history
      ? subdepartment.officer_history.filter(h => !h.end_date)
      : [];
    const activeManagers = subdepartment.manager_history
      ? subdepartment.manager_history.filter(h => !h.end_date)
      : [];
    const activeAssistantsHistory = subdepartment.assistant_history
      ? subdepartment.assistant_history.filter(h => !h.end_date)
      : [];

    const officers = activeOfficers.map(oh => {
      const user = tmUsers.get(parseInt(oh.id.toString()));
      const displayName = user?.name || `Officer ${oh.id}`;
      return {
        id: oh.id.toString(),
        name: displayName,
        email: user?.email || '',
        display_name: displayName
      };
    }).filter(o => o.name !== `Officer ${o.id}`);

    const managers = activeManagers.map(mh => {
      const user = tmUsers.get(parseInt(mh.id.toString()));
      const displayName = user?.name || `Manager ${mh.id}`;
      return {
        id: mh.id.toString(),
        name: displayName,
        email: user?.email || '',
        display_name: displayName
      };
    }).filter(m => m.name !== `Manager ${m.id}`);

    const assistants = activeAssistantsHistory.map(ah => {
      const user = tmUsers.get(parseInt(ah.id.toString()));
      const displayName = user?.name || `Assistant ${ah.id}`;
      return {
        id: ah.id.toString(),
        name: displayName,
        email: user?.email || '',
        display_name: displayName
      };
    }).filter(a => a.name !== `Assistant ${a.id}`);

    return { officers, managers, assistants };
  }, [departments, activeDepartmentTab, tmUsers]);

  const fetchTmUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('tm_users').select('*')
      if (error) throw error

      const usersMap = new Map()
      data?.forEach(user => {
        usersMap.set(user.id, user)
      })
      setTmUsers(usersMap)
      return usersMap
    } catch (error) {
      console.error('Error fetching tm_users:', error)
      return new Map()
    }
  }, [])

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

  const getKycFields = useCallback((doc: any) => {
    if (!doc.kycId) return Promise.resolve([]);
    return Promise.resolve(allKycFields[doc.kycId] || []);
  }, [allKycFields])

  const isDocumentApplicableToTask = useCallback((doc: any, task: any) => {
    if (!doc.isSpecial) return true;

    if (doc.targetEntities && Array.isArray(doc.targetEntities) && doc.targetEntities.length > 0) {
      return doc.targetEntities.some((entity: any) => {
        const classMatch = entity.class_id ? entity.class_id.toString() === task.class_id?.toString() : true;
        const subdeptMatch = entity.subdept_id ? entity.subdept_id.toString() === task.subdepartment?.id?.toString() : true;
        return classMatch && subdeptMatch;
      });
    }

    const taskClassId = task.class_id?.toString();
    const taskSubdeptId = task.subdepartment?.id?.toString();

    if (doc.entityType === 'class' && doc.class_id) {
      const classMatch = taskClassId === doc.class_id.toString();
      if (doc.subdept_id) {
        return classMatch && taskSubdeptId === doc.subdept_id.toString();
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

    if (doc.class_id && doc.subdept_id) {
      return (
        taskSubdeptId === doc.subdept_id?.toString() &&
        taskClassId === doc.class_id?.toString()
      )
    }

    if (doc.subdept_id && !doc.class_id) {
      return taskSubdeptId === doc.subdept_id?.toString()
    }

    return false
  }, [])

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

  const determineCurrentStage = useCallback((task: any, stages: any[]) => {
    if (!task.stages || !stages.length) return null;

    const applicableStages = stages
      .filter(stage => isStageApplicableToTask(stage, task))
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0))

    let lastStageWithEvidence = null
    let currentStage = null

    for (const stage of applicableStages) {
      const stageStatus = task.stages[stage.id]
      const hasLinkedDocument = !!getDocumentForTaskStage(task, stage);
      const hasDate = stageStatus && (stageStatus.status === 'completed' || stageStatus.date)

      if (hasLinkedDocument || hasDate) {
        lastStageWithEvidence = stage
      }
    }

    if (lastStageWithEvidence) {
      const lastStageIndex = applicableStages.findIndex(s => s.id === lastStageWithEvidence.id)
      if (lastStageIndex < applicableStages.length - 1) {
        currentStage = applicableStages[lastStageIndex + 1]
      } else {
        currentStage = lastStageWithEvidence
      }
    }

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

    if (!currentStage && task.current_stage_id) {
      currentStage = stages.find(s => s.id === task.current_stage_id)
    }

    return currentStage
  }, [isStageApplicableToTask, getDocumentForTaskStage])

  const getCurrentStageStatus = useCallback((task: UtilTask) => {
    const currentStage = determineCurrentStage(task, stages);
    if (!currentStage) {
      return {
        stageName: 'No Stage',
        stageStatus: 'N/A',
        stageFollowUp: null
      };
    }

    const department = departments.find(d => d.id === task.department_id);
    const subdepartment = department?.tm_subdepartments?.find(s => s.id === task.subdepartment_id);

    let stageStatus = currentStage.status || 'Pending';

    const departmentStage = department?.stages?.find(s => s.id === currentStage.id);
    if (departmentStage?.status) {
      stageStatus = departmentStage.status;
    }

    const subdepartmentStage = subdepartment?.stages?.find(s => s.stage_id === currentStage.id);
    if (!stageStatus && subdepartmentStage?.status) {
      stageStatus = subdepartmentStage.status;
    }

    if (!stageStatus && task.stages?.[currentStage.id]?.status) {
      stageStatus = task.stages[currentStage.id].status;
    }

    return {
      stageName: currentStage.name,
      stageStatus: stageStatus,
      stageFollowUp: currentStage.follow_up || null
    };
  }, [determineCurrentStage, stages, departments]);

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

    const allDatesWithTypes = relevantDocs.flatMap(doc => {
      if (!doc.extracted_details) return [];

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
 
    const latestDateInfo = allDatesWithTypes.reduce((latest, current) =>
      isAfter(current.date, latest.date) ? current : latest, allDatesWithTypes[0]);
 
    const today = startOfToday();
    const isFuture = isAfter(latestDateInfo.date, today) || isEqual(latestDateInfo.date, today);
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
      daysRemaining: isFuture ? daysRemaining : null
    };
  }, [stages, allDocuments, kycDocuments]);
 
  const enhancedHandleStageStatusSave = useCallback(async (
    stageId: string,
    taskId: string,
    value: string,
    updatedExtractedDetails?: Record<string, any>
  ) => {
    try {
      if (handleStageStatusSave) {
        await handleStageStatusSave(stageId, taskId, value, updatedExtractedDetails)
      }
 
      const task = tasks.find(t => t.id.toString() === taskId.toString())
      if (!task) return
 
      const updatedStages = {
        ...task.stages,
        [stageId]: {
          status: 'completed',
          date: value,
          completedAt: new Date().toISOString()
        }
      }
 
      const currentStage = determineCurrentStage({ ...task, stages: updatedStages }, stages)
 
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
 
      await loadTasksData(activeDepartmentTab, activeSubdepartmentTab)
 
    } catch (error) {
      console.error('Error updating stage status:', error)
      toast({
        title: "Error",
        description: "Failed to update stage status.",
        variant: "destructive"
      })
    }
  }, [handleStageStatusSave, tasks, stages, determineCurrentStage, loadTasksData, activeDepartmentTab, activeSubdepartmentTab])
 
  const getUserDisplayName = useCallback((userId: number | null | undefined) => {
    if (!userId) return 'N/A'
    const user = tmUsers.get(userId)
    return user?.name || 'Unknown User'
  }, [tmUsers])
 
  const getDefaultSubdepartments = useCallback(() => {
    if (!activeDepartmentTab || !departments.length) return []
    const currentDept = departments.find(d => d.id.toString() === activeDepartmentTab)
    if (!currentDept) return []
    return currentDept.tm_subdepartments?.filter(sub => sub.default_display) || []
  }, [activeDepartmentTab, departments])
 
  const getTaskHierarchy = useCallback((task: any) => {
    if (!task || !departments.length) return null
    const dept = departments.find(d => d.id === task.department?.id)
    if (!dept) return null
    const subdept = dept.tm_subdepartments?.find(s => s.id === task.subdepartment?.id)
    const cls = subdept?.classes?.find(c => c.id.toString() === task.class_id?.toString())
    const subCls = cls?.subClasses?.find(sc => sc.id.toString() === task.subclass_id?.toString())
    return { department: dept, subdepartment: subdept, class: cls, subclass: subCls }
  }, [departments])
 
  const toggleImmigrationStatusExpansion = useCallback((taskId: string) => {
    setExpandedImmigrationStatus(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }))
  }, [])
 
  const toggleSectionExpansion = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId)
      } else {
        newSet.add(sectionId)
      }
      return newSet
    })
  }, [])
 
  const toggleStageExpansion = useCallback((stageId: string) => {
    setExpandedStages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(stageId)) {
        newSet.delete(stageId)
      } else {
        newSet.add(stageId)
      }
      return newSet
    })
  }, [])
 
  const toggleDocumentExpansion = useCallback((docId: string) => {
    setExpandedDocuments(prev => {
      const newSet = new Set(prev)
      if (newSet.has(docId)) {
        newSet.delete(docId)
      } else {
        newSet.add(docId)
      }
      return newSet
    })
  }, [])
 
  const toggleDependantsExpansion = useCallback((taskId: string) => {
    setExpandedDependants(prev => {
      const newSet = new Set(prev)
      if (newSet.has(taskId)) {
        newSet.delete(taskId)
      } else {
        newSet.add(taskId)
      }
      return newSet
    })
  }, [])
  
  const expandAll = () => {
    setExpandedSections(new Set(['case_details', 'stages', 'stats']))
    const allStageIds = stages.map(s => s.id)
    setExpandedStages(new Set(allStageIds))
    const allDocIds = stages.flatMap(s => s.documents?.map(d => d.id) || [])
    setExpandedDocuments(new Set(allDocIds))
    
    const allTaskIdsWithDependants = tasks.filter(t => 
      t.dependant_member && Array.isArray(t.dependant_member) && t.dependant_member.length > 0
    ).map(t => t.id.toString());
    setExpandedDependants(new Set(allTaskIdsWithDependants));
  }
 
  const collapseAll = () => {
    setExpandedSections(new Set())
    setExpandedStages(new Set())
    setExpandedDocuments(new Set())
    setExpandedDependants(new Set())
  }
 
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
 
  const getFilteredTasks = useCallback((status?: string) => {
    if (!departments.length || !activeDepartmentTab || !tasks.length) return []
    const currentDept = departments.find(d => d.id.toString() === activeDepartmentTab)
    if (!currentDept) return []
 
    let filteredTasks = tasks.filter(task =>
      task &&
      task.department?.id?.toString() === currentDept.id.toString() &&
      (!status || task.status === status)
    )
 
    if (activeSubdepartmentTab) {
      filteredTasks = filteredTasks.filter(task =>
        task.subdepartment?.id?.toString() === activeSubdepartmentTab
      )
    }
 
    if (activeSubTab === 'wip-stages') {
      if (activeFollowUpFilter === 'bcl') {
        if (activeManagerTab) {
          filteredTasks = filteredTasks.filter(task => {
            const isManagerMatch = task.task_manager_id?.toString() === activeManagerTab;
 
            if (activeAssistantTab === 'no-assistant') {
              return isManagerMatch && !task.task_assistant_id;
            } else if (activeAssistantTab) {
              const isAssistantMatch = task.task_assistant_id?.toString() === activeAssistantTab;
              return isManagerMatch && isAssistantMatch;
            } else {
              return isManagerMatch;
            }
          });
        } else if (activeAssistantTab && activeAssistantTab !== 'no-assistant') {
          filteredTasks = filteredTasks.filter(task =>
            task.task_assistant_id?.toString() === activeAssistantTab
          );
        }
      } else if (activeFollowUpFilter === 'officer') {
        if (activeOfficerTab) {
          filteredTasks = filteredTasks.filter(task =>
            task.officer_id?.toString() === activeOfficerTab
          );
        }
      }
    }
 
    return filteredTasks
  }, [tasks, departments, activeDepartmentTab, activeSubdepartmentTab, activeSubTab, activeFollowUpFilter, activeManagerTab, activeAssistantTab, activeOfficerTab])
 
  const getAssistantsForManager = useCallback((managerId: string) => {
    if (!managerId) return [];
 
    const managerTasks = tasks.filter(task =>
      task.task_manager_id?.toString() === managerId &&
      task.task_assistant_id
    );
 
    const assistantIds = [...new Set(
      managerTasks.map(task => task.task_assistant_id?.toString())
    )].filter(Boolean);
 
    return assistantIds.map(assistantId => {
      const user = tmUsers.get(parseInt(assistantId || '0'));
      const taskCount = managerTasks.filter(
        task => task.task_assistant_id?.toString() === assistantId
      ).length;
 
      return {
        id: assistantId,
        name: user?.name || `Assistant ${assistantId}`,
        taskCount
      };
    });
  }, [tasks, tmUsers]);
 
  const getTaskCountForManager = useCallback((managerId: string) => {
    const managerTasks = getFilteredTasks('in_progress').filter(task =>
      task.task_manager_id?.toString() === managerId
    );
    return managerTasks.length;
  }, [getFilteredTasks]);
 
  const getTaskCountForAssistant = useCallback((assistantId: string) => {
    const assistantTasks = getFilteredTasks('in_progress').filter(task =>
      task.task_assistant_id?.toString() === assistantId
    );
    return assistantTasks.length;
  }, [getFilteredTasks]);
 
  const getTaskCountForManagerWithoutAssistant = useCallback((managerId: string) => {
    const managerOnlyTasks = getFilteredTasks('in_progress').filter(task =>
      task.task_manager_id?.toString() === managerId && !task.task_assistant_id
    );
    return managerOnlyTasks.length;
  }, [getFilteredTasks]);
 
  const getTaskCountForOfficer = useCallback((officerId: string) => {
    const officerTasks = getFilteredTasks('in_progress').filter(task =>
      task.officer_id?.toString() === officerId
    );
    return officerTasks.length;
  }, [getFilteredTasks]);
 
  const getWIPTasksByFollowUp = useCallback((followUpFilter: string) => {
    const wipTasks = getFilteredTasks('in_progress')
    if (followUpFilter === 'all') return wipTasks
 
    return wipTasks.filter(task => {
      const currentStage = determineCurrentStage(task, stages)
      if (!currentStage) return false
      const stageFollowUp = currentStage.follow_up?.toLowerCase() || null
 
      switch (followUpFilter) {
        case 'bcl': return stageFollowUp === 'bcl'
        case 'officer': return stageFollowUp === 'officer'
        case 'client': return stageFollowUp === 'client'
        default: return true
      }
    })
  }, [getFilteredTasks, stages, determineCurrentStage])
 
  const filterTasksBySearch = useCallback((tasks: any[]) => {
    if (!globalSearchTerm.trim()) return tasks
  
    const searchTerm = globalSearchTerm.toLowerCase()
  
    return tasks.filter(task => {
      // Get enhanced task data
      const enhancedTask = enhancedTasksData.get(task.id.toString()) || task;
      
      const basicFields = [
        task.id?.toString(),
        task.applicant_name,
        task.job_description,
        task.status,
        task.renewal_status,
        enhancedTask.nationality,
        enhancedTask.age?.toString(),
        companies.get(task.company_id),
        getTaskHierarchy(task)?.department?.name,
        getTaskHierarchy(task)?.subdepartment?.name,
        getTaskHierarchy(task)?.class?.name,
        getTaskHierarchy(task)?.subclass?.name,
        getUserDisplayName(task.task_manager_id),
        getUserDisplayName(task.officer_id),
        getUserDisplayName(task.task_assistant_id)
      ].filter(Boolean).join(' ').toLowerCase()
  
      if (basicFields.includes(searchTerm)) return true
  
      // Search in dependants
      const taskDeps = taskDependants.get(task.id.toString()) || [];
      if (taskDeps.length > 0) {
        const dependantsText = taskDeps.map(dep =>
          [dep.full_name, dep.nationality, dep.age?.toString(), dep.relationship].filter(Boolean).join(' ')
        ).join(' ').toLowerCase()
  
        if (dependantsText.includes(searchTerm)) return true
      }
  
      return false
    })
  }, [globalSearchTerm, companies, getTaskHierarchy, getUserDisplayName, enhancedTasksData, taskDependants])
  
  const enquiryTasks = useMemo(() => filterTasksBySearch(getFilteredTasks('enquiry')), [getFilteredTasks, filterTasksBySearch])
  const wipTasks = useMemo(() => filterTasksBySearch(getWIPTasksByFollowUp(activeFollowUpFilter)), [getWIPTasksByFollowUp, activeFollowUpFilter, filterTasksBySearch])
  const completedTasks = useMemo(() => filterTasksBySearch(getFilteredTasks('completed')), [getFilteredTasks, filterTasksBySearch])
 
  // Enhanced Excel export function
  const handleExport = useCallback(async (tasks: any[], tableType: string) => {
    if (!tasks.length) {
      toast({ title: "No Data", description: "No data available to export.", variant: "destructive" })
      return
    }
 
    try {
      const workbook = XLSX.utils.book_new();
      
      // Prepare data for export
      const exportData = [];
      
      for (const task of tasks) {
        const enhancedTask = enhancedTasksData.get(task.id.toString()) || task;
        const taskDeps = taskDependants.get(task.id.toString()) || [];
        const statusInfo = getEnhancedImmigrationStatus(task);
        const stageStatusInfo = getCurrentStageStatus(task);
        
        // Add main applicant row
        const mainRow = {
          'Task ID': task.id,
          'Type': 'Applicant',
          'Name': task.applicant_name,
          'Nationality': enhancedTask.nationality || 'N/A',
          'Age': enhancedTask.age || 'N/A',
          'Relationship': 'Principal',
          'Company': companies.get(task.company_id) || 'N/A',
          'Job Level': getTaskHierarchy(task)?.subclass?.name || getTaskHierarchy(task)?.class?.name || 'N/A',
          'Immigration Status': statusInfo.status,
          'Immigration Document Type': statusInfo.documentType || 'N/A',
          'Immigration Expiry Date': statusInfo.date ? format(statusInfo.date, 'dd MMM yyyy') : 'N/A',
          'Current Stage': stageStatusInfo.stageName,
          'Stage Status': stageStatusInfo.stageStatus,
          'Stage Follow-up': stageStatusInfo.stageFollowUp || 'N/A',
          'Task Manager': getStaffName(task.task_manager_id),
          'Officer': getStaffName(task.officer_id),
          'Task Assistant': getStaffName(task.task_assistant_id),
          'Case Status': task.status,
          'Renewal Status': task.renewal_status || 'New'
        };
        
        exportData.push(mainRow);
        
        // Add dependants rows
        taskDeps.forEach(dep => {
          const depRow = {
            'Task ID': task.id,
            'Type': 'Dependant',
            'Name': dep.full_name,
            'Nationality': dep.nationality || 'N/A',
            'Age': dep.age || 'N/A',
            'Relationship': dep.relationship || 'Dependant',
            'Company': companies.get(task.company_id) || 'N/A',
            'Job Level': getTaskHierarchy(task)?.subclass?.name || getTaskHierarchy(task)?.class?.name || 'N/A',
            'Immigration Status': 'N/A',
            'Immigration Document Type': 'N/A',
            'Immigration Expiry Date': 'N/A',
            'Current Stage': 'N/A',
            'Stage Status': 'N/A',
            'Stage Follow-up': 'N/A',
            'Task Manager': getStaffName(task.task_manager_id),
            'Officer': getStaffName(task.officer_id),
            'Task Assistant': getStaffName(task.task_assistant_id),
            'Case Status': task.status,
            'Renewal Status': task.renewal_status || 'New'
          };
          
          exportData.push(depRow);
        });
      }
      
      // Create worksheet
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, tableType);
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const filename = `${tableType}_${timestamp}.xlsx`;
      
      // Save file
      XLSX.writeFile(workbook, filename);
      
      toast({ 
        title: "Export Successful", 
        description: `${tableType} data exported to ${filename}` 
      });
      
    } catch (error) {
      console.error('Export error:', error);
      toast({ 
        title: "Export Failed", 
        description: "Failed to export data to Excel.", 
        variant: "destructive" 
      });
    }
  }, [enhancedTasksData, taskDependants, getEnhancedImmigrationStatus, getCurrentStageStatus, companies, getTaskHierarchy, getStaffName]);
 
  const getClassesForSubdepartment = useCallback((deptId: number, subDeptId: number) => {
    const department = departments.find(d => d.id === deptId);
    if (!department) return [];
 
    const subdepartment = department.tm_subdepartments?.find(s => s.id === subDeptId);
    return subdepartment?.classes || [];
  }, [departments]);
 
  const handlePushCase = useCallback(async (task: UtilTask, targetSubDeptId: number, targetSubDeptName: string) => {
    const targetDeptId = 1;
    if (targetSubDeptId === 6) { // Alien subdepartment
      const classes = getClassesForSubdepartment(targetDeptId, targetSubDeptId);
      if (classes.length > 0) {
        setSelectedTaskForPush({
          task,
          targetDeptId,
          targetSubDeptId,
          targetSubDeptName,
          isApplicant: true // Start with applicant
        });
        setAvailableClasses(classes);
        setIsClassSelectionOpen(true);
        return;
      }
    }
 
    await executePushCase(task, targetDeptId, targetSubDeptId, targetSubDeptName, null, null);
  }, [getClassesForSubdepartment]);
 
  const executePushCase = useCallback(async (
    task: UtilTask,
    targetDeptId: number,
    targetSubDeptId: number,
    targetSubDeptName: string,
    applicantClassId: string | null,
    dependantClassId: string | null
  ) => {
    setIsPushingCase(true);
    toast({
      title: "Pushing Case...",
      description: `Creating new task(s) in ${targetSubDeptName}.`
    });
 
    try {
      const tasksToCreate = [];
 
      // Clean task data - EXCLUDE problematic columns
      const {
        id,
        created_at,
        updated_at,
        current_stage_id,
        current_stage_started_at,
        stages,
        department, // EXCLUDE
        dependant_member, // EXCLUDE  
        dependnats_members, // EXCLUDE (typo in original)
        ...cleanTaskData
      } = task;
 
      // Create main task data
      const mainTaskData = {
        ...cleanTaskData,
        department_id: targetDeptId,
        subdepartment_id: targetSubDeptId,
        class_id: applicantClassId,
        subclass_id: null,
        status: 'in_progress',
        created_by: 'system',
        date_initiated: new Date().toISOString(),
        stages: {},
        current_stage_id: null,
        current_stage_started_at: null,
      };
 
      // Add main task
      tasksToCreate.push({
        ...mainTaskData,
        applicant_name: task.applicant_name,
        individual_id: task.individual_id
      });
 
      // Handle dependants
      const { dependantsMap } = await fetchAllDependantsAndApplicants([task]);
      const dependants = [];
      let skippedMinors = 0;
 
      if (task.dependant_member && Array.isArray(task.dependant_member)) {
        task.dependant_member.forEach(dep => {
          if (dep?.id && dependantsMap.has(dep.id)) {
            const dependantData = dependantsMap.get(dep.id);
            dependants.push({
              ...dependantData,
              relationship: dep.relationship || 'Dependant'
            });
          }
        });
      }
 
      if (dependants.length > 0) {
        for (const dependant of dependants) {
          // For Alien cases, only create tasks for adults (18+)
          if (targetSubDeptId === 6) { // Alien
            const age = dependant.age;
            if (age === null || age < 18) {
              console.log(`Skipping minor dependant: ${dependant.full_name} (age: ${age})`);
              skippedMinors++;
              continue;
            }
          }
 
          // Create task for dependant
          tasksToCreate.push({
            ...mainTaskData,
            class_id: dependantClassId || applicantClassId, // Use dependant class if different
            applicant_name: dependant.full_name,
            individual_id: dependant.individual_id,
            relationship: dependant.relationship
          });
        }
      }
 
      // Insert all tasks
      const { data: newTasks, error } = await supabase
        .from('tm_tasks')
        .insert(tasksToCreate)
        .select();
 
      if (error) throw error;
 
      const mainTask = newTasks[0];
      const dependantTasks = newTasks.slice(1);
 
      let successMessage = `Main case pushed to ${targetSubDeptName} successfully. New Task ID: ${mainTask.id}`;
 
      if (dependantTasks.length > 0) {
        successMessage += `\n${dependantTasks.length} dependant task(s) also created.`;
      }
 
      if (targetSubDeptId === 6 && skippedMinors > 0) {
        successMessage += `\nNote: ${skippedMinors} minor dependant(s) were skipped for Alien cases.`;
      }
 
      toast({
        title: "Success",
        description: successMessage,
        variant: "default"
      });
 
      await refreshAllData();
    } catch (error) {
      console.error(`Error pushing case to ${targetSubDeptName}:`, error);
      toast({
        title: "Error",
        description: `Failed to push case: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setIsPushingCase(false);
    }
  }, [refreshAllData, fetchAllDependantsAndApplicants]);
 
  const handleDownloadZip = useCallback(async (task: UtilTask) => {
    setIsDownloading(true);
    toast({
      title: "Preparing Download",
      description: "Collecting and organizing documents..."
    });
 
    try {
      const userDocuments = allDocuments.filter(doc =>
        doc.director_id === task.individual_id
      );
 
      if (userDocuments.length === 0) {
        toast({
          title: "No Documents",
          description: "No documents found for this applicant to download.",
          variant: "default"
        });
        setIsDownloading(false);
        return;
      }
 
      const zip = new JSZip();
      const bucketName = 'kyc-documents';
 
      const jobLevel = getTaskHierarchy(task)?.subclass?.name ||
        getTaskHierarchy(task)?.class?.name ||
        getTaskHierarchy(task)?.subdepartment?.name ||
        'Unknown';
      const folderName = `${task.applicant_name || 'Applicant'} - ${jobLevel}`;
 
      const documentStageMap = new Map();
 
      stages.forEach(stage => {
        if (stage.documents && stage.documents.length > 0) {
          stage.documents.forEach(stageDoc => {
            documentStageMap.set(stageDoc.kycId, stage.name);
          });
        }
      });
 
      const downloadPromises = userDocuments.map(async (doc, index) => {
        if (!doc.file_path) return;
 
        const filePath = doc.file_path.startsWith(bucketName)
          ? doc.file_path
          : `${bucketName}/${doc.file_path}`;
 
        const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
        const originalFileName = doc.file_path.split('/').pop() || 'document';
        const fileExtension = originalFileName.split('.').pop();
 
        let newFileName = originalFileName;
 
        if (doc.document_id) {
          const stageName = documentStageMap.get(doc.document_id);
          if (stageName) {
            newFileName = `${stageName}.${fileExtension}`;
 
            let counter = 1;
            while (Array.from(zip.folder(folderName)?.files || {}).some(file =>
              file.includes(newFileName)
            )) {
              newFileName = `${stageName}_${counter}.${fileExtension}`;
              counter++;
            }
          }
        }
 
        try {
          const response = await fetch(fileUrl);
          if (!response.ok) {
            console.error(`Failed to fetch ${fileUrl}: ${response.statusText}`);
            return;
          }
          const blob = await response.blob();
          zip.folder(folderName)?.file(newFileName, blob);
        } catch (error) {
          console.error(`Error downloading file ${originalFileName}:`, error);
        }
      });
 
      await Promise.all(downloadPromises);
 
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${folderName}.zip`);
 
      toast({
        title: "Download Started",
        description: `Downloading ${folderName}.zip with organized documents.`
      });
    } catch (error) {
      console.error("Error creating ZIP file:", error);
      toast({
        title: "Error",
        description: "Failed to create ZIP file.",
        variant: "destructive"
      });
    } finally {
      setIsDownloading(false);
    }
  }, [allDocuments, getTaskHierarchy, stages]);
 
  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
 
    const formats = [
      'dd/MM/yyyy HH:mm:ss',
      'dd/MM/yyyy',
      'yyyy-MM-dd',
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
 
    const parsed = new Date(dateStr);
    return isValid(parsed) ? parsed : null;
  };
 
  const findDatesInObject = (obj: any, dateFields: string[]): Date[] => {
    if (!obj) return [];
 
    const dates: Date[] = [];
 
    if (Array.isArray(obj)) {
      return obj.flatMap(item => findDatesInObject(item, dateFields));
    }
 
    if (typeof obj === 'object') {
      for (const key in obj) {
        const value = obj[key];
 
        const isDateField = dateFields.some(field =>
          key.toLowerCase().includes(field.toLowerCase())
        );
 
        if (isDateField && value) {
          const parsedDate = typeof value === 'string' ? parseDate(value) : null;
          if (parsedDate) {
            dates.push(parsedDate);
          }
        }
 
        if (value && typeof value === 'object') {
          dates.push(...findDatesInObject(value, dateFields));
        }
      }
    }
 
    return dates;
  };
 
  const renderStaffTabs = () => {
    if (activeFollowUpFilter === 'bcl' && activeSubdepartmentTab) {
      return (
        <div className="space-y-3">
          {/* Manager Tabs */}
          {subdepartmentManagers.length > 0 && (
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">Task Managers</Label>
              <div className="flex space-x-2 overflow-x-auto pb-2">
                <Button
                  variant={!activeManagerTab ? "default" : "outline"}
                  onClick={() => setActiveManagerTab(null)}
                  className="whitespace-nowrap text-sm"
                  size="sm"
                >
                  All Managers
                </Button>
                {subdepartmentManagers.map((manager) => (
                  <Button
                    key={`manager-${manager.id}`}
                    variant={activeManagerTab === manager.id ? "default" : "outline"}
                    onClick={() => setActiveManagerTab(manager.id)}
                    className="whitespace-nowrap text-sm flex items-center gap-2"
                    size="sm"
                  >
                    {manager.name}
                    <Badge variant="secondary" className="text-xs">
                      {getTaskCountForManager(manager.id)}
                    </Badge>
                  </Button>
                ))}
              </div>
            </div>
          )}
 
          {/* Assistant Tabs - Show when a manager is selected */}
          {activeManagerTab && (
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">Task Assistants</Label>
              <div className="flex space-x-2 overflow-x-auto pb-2">
                <Button
                  variant={!activeAssistantTab ? "default" : "outline"}
                  onClick={() => setActiveAssistantTab(null)}
                  className="whitespace-nowrap text-sm"
                  size="sm"
                >
                  All Tasks (Manager + Assistants)
                </Button>
                <Button
                  variant={activeAssistantTab === 'no-assistant' ? "default" : "outline"}
                  onClick={() => setActiveAssistantTab('no-assistant')}
                  className="whitespace-nowrap text-sm flex items-center gap-2"
                  size="sm"
                >
                  No Assistant (Manager Only)
                  <Badge variant="secondary" className="text-xs">
                    {getTaskCountForManagerWithoutAssistant(activeManagerTab)}
                  </Badge>
                </Button>
                {subdepartmentAssistants.map((assistant) => (
                  <Button
                    key={`assistant-${assistant.id}`}
                    variant={activeAssistantTab === assistant.id ? "default" : "outline"}
                    onClick={() => setActiveAssistantTab(assistant.id)}
                    className="whitespace-nowrap text-sm flex items-center gap-2"
                    size="sm"
                  >
                    {assistant.name}
                    <Badge variant="secondary" className="text-xs">
                      {getTaskCountForAssistant(assistant.id)}
                    </Badge>
                  </Button>
                ))}
              </div>
            </div>
          )}
 
          {/* Show assistant tabs without manager selection for overview */}
          {!activeManagerTab && subdepartmentAssistants.length > 0 && (
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">Task Assistants (All Managers)</Label>
              <div className="flex space-x-2 overflow-x-auto pb-2">
                <Button
                  variant={!activeAssistantTab ? "default" : "outline"}
                  onClick={() => setActiveAssistantTab(null)}
                  className="whitespace-nowrap text-sm"
                  size="sm"
                >
                  All Assistants
                </Button>
                {subdepartmentAssistants.map((assistant) => (
                  <Button
                    key={`assistant-${assistant.id}`}
                    variant={activeAssistantTab === assistant.id ? "default" : "outline"}
                    onClick={() => setActiveAssistantTab(assistant.id)}
                    className="whitespace-nowrap text-sm flex items-center gap-2"
                    size="sm"
                  >
                    {assistant.name}
                    <Badge variant="secondary" className="text-xs">
                      {getTaskCountForAssistant(assistant.id)}
                    </Badge>
                  </Button>
                ))}
              </div>
            </div>
          )}
 
          {/* No staff message */}
          {subdepartmentManagers.length === 0 && subdepartmentAssistants.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-4">
              No BCL staff assigned to this subdepartment
            </div>
          )}
        </div>
      );
    }
 
    if (activeFollowUpFilter === 'officer' && activeSubdepartmentTab) {
      return (
        <div className="space-y-3">
          {/* Officer Tabs */}
          {subdepartmentOfficers.length > 0 ? (
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">Officers</Label>
              <div className="flex space-x-2 overflow-x-auto pb-2">
                <Button
                  variant={!activeOfficerTab ? "default" : "outline"}
                  onClick={() => setActiveOfficerTab(null)}
                  className="whitespace-nowrap text-sm"
                  size="sm"
                >
                  All Officers
                </Button>
                {subdepartmentOfficers.map((officer) => (
                  <Button
                    key={`officer-${officer.id}`}
                    variant={activeOfficerTab === officer.id ? "default" : "outline"}
                    onClick={() => setActiveOfficerTab(officer.id)}
                    className="whitespace-nowrap text-sm flex items-center gap-2"
                    size="sm"
                  >
                    {officer.name}
                    <Badge variant="secondary" className="text-xs">
                      {getTaskCountForOfficer(officer.id)}
                    </Badge>
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 text-sm py-4">
              No officers assigned to this subdepartment
            </div>
          )}
        </div>
      );
    }
 
    return null;
  };
 
  const renderImmigrationStatusCell = useCallback((task: any) => {
    const statusInfo = getEnhancedImmigrationStatus(task);
    const isExpanded = expandedImmigrationStatus.has(task.id.toString());
 
    const getColor = (type: string) => {
      switch (type) {
        case 'active': return 'bg-green-800 text-white';
        case 'expiring_soon': return 'bg-blue-800 text-white';
        case 'expired': return 'bg-red-800 text-white';
        default: return 'bg-slate-600 text-white';
      }
    };
 
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge
            className={`whitespace-normal text-sm ${getColor(statusInfo.type)}`}
          >
            {statusInfo.status}
          </Badge>
          {statusInfo.type !== 'na' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0 text-white hover:text-white"
              onClick={() => toggleImmigrationStatusExpansion(task.id.toString())}
            >
              {isExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            </Button>
          )}
        </div>
 
        {isExpanded && statusInfo.type !== 'na' && (
          <div className="space-y-1 p-2 bg-slate-50 rounded border text-sm text-left">
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
 
  const renderCurrentStageStatusCell = useCallback((task: any) => {
    const stageStatusInfo = getCurrentStageStatus(task);
 
    const getStatusColor = (status: string) => {
      switch (status.toLowerCase()) {
        case 'completed': return 'text-white';
        case 'pending': return 'text-white';
        case 'in_progress': return 'text-white';
        case 'to enquire': return 'text-white';
        case 'to raise bill': return 'text-white';
        case 'to approve': return 'text-white';
        case 'to submit': return 'text-white';
        case 'to review': return 'text-white';
        case 'to process': return 'text-white';
        case 'n/a': return 'text-white';
        default:
          if (status.toLowerCase().startsWith('to ')) {
            return 'text-white';
          }
          return 'text-white';
      }
    };
 
    return (
      <div className="space-y-2">
        <span
          className={`whitespace-normal text-sm ${getStatusColor(stageStatusInfo.stageStatus)}`}
        >
          {stageStatusInfo.stageStatus}
        </span>
      </div>
    );
  }, [getCurrentStageStatus]);
 
  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }
 
  const sortTasks = (tasksToSort: UtilTask[], sortConfig: any) => {
    let sortableItems = [...tasksToSort]
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
  }
 
  const getSortedTasks = useCallback((tasksToRender: UtilTask[]) => {
    return sortTasks(tasksToRender, sortConfig)
  }, [sortConfig, companies])
 
  const getCellContent = useCallback((task: any, headerId: string) => {
    const enhancedTask = enhancedTasksData.get(task.id.toString()) || task;
    
    switch (headerId) {
      case 'id': return task.id;
      case 'applicant_name': 
        const taskDeps = taskDependants.get(task.id.toString()) || [];
        return (
          <div className="flex items-center justify-between gap-1 w-[300px]">
            <div className="flex-grow">
              <div className="font-medium truncate" title={task.applicant_name}>{task.applicant_name || 'N/A'}</div>
            </div>
            <div className="flex gap-1">
              {taskDeps.length > 0 && (
                <Button
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-white hover:bg-green-100 flex-shrink-0"
                  title={`${taskDeps.length} dependant(s)`}
                  onClick={() => toggleDependantsExpansion(task.id.toString())}
                >
                  {expandedDependants.has(task.id.toString()) ? 
                    <Minus className="h-4 w-4" /> : 
                    <Plus className="h-4 w-4" />
                  }
                </Button>
              )}
              <Button
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-white hover:bg-blue-100 flex-shrink-0"
                title="Link source documents"
                onClick={() => { setLinkingTask(task); setIsLinkDialogOpen(true); }}
              >
                <LinkIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
        case 'immigration_document_type': return getEnhancedImmigrationStatus(task).documentType || '-';
        case 'immigration_expiry_date': {
          const statusInfo = getEnhancedImmigrationStatus(task);
          return statusInfo.date ? format(statusInfo.date, 'dd MMM yyyy') : '-';
        }
        case 'immigration_status': return renderImmigrationStatusCell(task);
        case 'current_stage_name': return getCurrentStageStatus(task).stageName || 'N/A';
        case 'current_stage_status_value': return renderCurrentStageStatusCell(task);
        case 'current_stage_follow_up': {
          const statusInfo = getCurrentStageStatus(task);
          if (!statusInfo.stageFollowUp) return '-';
          const getFollowUpTextColor = (followUp) => {
            switch (followUp?.toLowerCase()) {
              case 'bcl': return 'text-white';
              case 'officer': return 'text-white';
              case 'client': return 'text-white';
              default: return 'text-white';
            }
          };
          return <span className={`whitespace-nowrap text-sm ${getFollowUpTextColor(statusInfo.stageFollowUp)}`}>{statusInfo.stageFollowUp}</span>;
        }
        case 'company_name': return companies.get(task.company_id) || 'N/A';
        case 'job_level': return getTaskHierarchy(task)?.subclass?.name || getTaskHierarchy(task)?.class?.name || getTaskHierarchy(task)?.subdepartment?.name || 'N/A';
        case 'renewal_new': return <span className="text-sm font-semibold">{task.renewal_status || 'New'}</span>;
        case 'case_status': return <span className="text-sm font-semibold">{task.status || 'pending'}</span>;
        case 'nationality': return enhancedTask.nationality || 'N/A';
        case 'age': return enhancedTask.age?.toString() || 'N/A';
        case 'task_manager':
          return task.task_manager_id ? (
            <div className="flex flex-col">
              <span className="font-medium">{getStaffName(task.task_manager_id)}</span>
            </div>
          ) : 'N/A';
        case 'officer':
          return task.officer_id ? (
            <div className="flex flex-col">
              <span className="font-medium">{getStaffName(task.officer_id)}</span>
            </div>
          ) : 'N/A';
        case 'task_assistant':
          return task.task_assistant_id ? (
            <div className="flex flex-col">
              <span className="font-medium">{getStaffName(task.task_assistant_id)}</span>
            </div>
          ) : 'N/A';
        default: return task[headerId] || 'N/A';
      }
    }, [companies, getTaskHierarchy, getUserDisplayName, getEnhancedImmigrationStatus, getCurrentStageStatus, renderImmigrationStatusCell, renderCurrentStageStatusCell, setLinkingTask, setIsLinkDialogOpen, getStaffName, taskDependants, expandedDependants, toggleDependantsExpansion, enhancedTasksData]);
 
  const generateEnhancedTableRows = useCallback(async (tasks: UtilTask[]) => {
    if (!tasks.length) return []
 
    const allStages = stages
      .filter(stage => stage && visibleStageIds.has(stage.id.toString()))
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0))
    const rows = []
 
    // Stats Section
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
 
                const linkedDocument = getDocumentForTaskStage(task, { ...stage, documents: [doc] });
                const isOldDoc = linkedDocument && task.created_at &&
                  isDocumentOlderThanTask(linkedDocument.created_at, task.created_at);
                const hasIndicator = linkedDocument?.indicator === true;
 
                return {
                  hasDocument: !!linkedDocument,
                  isOldDocument: isOldDoc,
                  hasIndicator,
                  status: hasIndicator ? 'Preview Not Available' :
                    isOldDoc ? 'Old Document - No Preview' :
                      (linkedDocument ? 'Linked' : 'Not Linked')
                };
              }
            })
 
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
 
                      const linkedDocument = getDocumentForTaskStage(task, { ...stage, documents: [doc] })
 
                      if (!linkedDocument || !linkedDocument.extracted_details || linkedDocument.indicator === true) return 'N/A'
                      const value = linkedDocument.extracted_details[field.fieldName] || linkedDocument.extracted_details[field.id] || 'N/A'
                      return { value }
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
  }, [stages, isStageApplicableToTask, expandedSections, expandedStages, expandedDocuments, getKycFields, visibleStats, kycDocuments, allDocuments, visibleStageIds, getDocumentForTaskStage])
 
    // Task stage handlers
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
      const document = getDocumentForTaskStage(task, stage);
 
      if (!document) {
        toast({
          title: 'No Linked Document',
         description: `No document has been linked for this stage yet. Please use the 'Link' button to link a document first.`,
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

     const kycId = document.document_id;
     if (!kycId) {
       toast({
         title: 'Error',
         description: 'No KYC document ID found.',
         variant: 'destructive',
       });
       return;
     }

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

     const documentName = kycData.display_name || kycData.name || 'Document';
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

     const extractedData = { ...(document.extracted_details || {}) };
     fields.forEach(field => {
       if (extractedData[field.id] === undefined) {
         extractedData[field.id] = '';
       }
     });

     const bucketName = 'kyc-documents';
     const filePath = document.file_path?.startsWith(bucketName)
       ? document.file_path
       : `${bucketName}/${document.file_path}`;
     const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
     const fileName = document.file_path?.split('/').pop() || documentName;

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

 
 const handleTaskEdit = (task: any) => {
  setEditingTask(task);
  setEditDialogOpen(true)
}

const handleTaskUpdate = (updatedTask: any) => {
  onTaskUpdate?.(updatedTask);
  setEditDialogOpen(false);
  setEditingTask(null);
  loadTasksData(activeDepartmentTab, activeSubdepartmentTab);
}

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

  const renderCellContent = useCallback((row: any, task: any) => {
    const value = row.getValue ? row.getValue(task) : '';
 
    if (value === 'N/A' || (typeof value === 'object' && value?.status === 'N/A')) {
      return <span className="text-sm text-gray-400 italic">N/A</span>;
    }
 
    if (row.type === 'stage' && row.stage && task.stages?.[row.stage.id]) {
      const stageData = task.stages[row.stage.id];
      return (
        <div className="flex flex-col items-center gap-0.5">
          {stageData.date && (
            <span className="text-sm font-medium text-slate-800">
              {formatDateValue(stageData.date)}
            </span>
          )}
        </div>
      );
    }
 
    if (row.type === 'field') {
      const fieldValue = typeof value === 'object' ? value.value : value;
      const isOldDoc = typeof value === 'object' ? value.isOldDocument : false;
 
      if (row.field?.fieldType?.toLowerCase() === 'date') {
        const formattedDate = formatDateValue(fieldValue);
        return (
          <div className="flex items-center gap-1">
            <span className="text-sm text-slate-700" title={formattedDate}>{formattedDate}</span>
            {isOldDoc && <AlertTriangle className="h-3 w-3 text-orange-500" title="Document is older than task creation" />}
          </div>
        );
      }
      return (
        <div className="flex items-center gap-1">
          <span className="text-sm text-gray-700">{fieldValue}</span>
          {isOldDoc && <AlertTriangle className="h-3 w-3 text-orange-500" title="Document is older than task creation" />}
        </div>
      );
    }
 
    switch (row.type) {
      case 'badge': return <span className="text-sm font-semibold">{value}</span>
      case 'date': return <span className="text-sm text-slate-600">{formatDateValue(value)}</span>;
      case 'stat': return <span className="text-sm font-semibold">{value}</span>
 
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
            <span
              className="text-sm"
            >
              {docValue.status}
            </span>
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
              <DropdownMenuItem
                onClick={() => handlePushCase(task, 6, 'Alien')}
                disabled={isPushingCase}
              >
                <Send className="mr-2 h-4 w-4" /> Push to Alien
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handlePushCase(task, 7, 'Re-Entry Pass')}
                disabled={isPushingCase}
              >
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
  }, [handleStageDocumentUpload, handleViewDocument, onTaskAction, handleTaskEdit, enhancedHandleStageStatusSave, allDocuments, handlePushCase, handleDownloadZip, isPushingCase, isDownloading, getKycFields])
 
  const loadRows = useCallback(async (tasks: any[]) => {
    if (!tasks || tasks.length === 0) return;
    setLoading(true);
    try {
      const rows = await generateEnhancedTableRows(tasks);
      setTableRows(rows);
    } catch (error) {
      console.error('Error generating table rows:', error);
      toast({
        title: "Error",
        description: "Failed to generate table rows.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [generateEnhancedTableRows, toast]);
 
  const renderStandardTable = useCallback((tasks: any[], tableType: string) => {
    const sortedTasks = getSortedTasks(tasks || []);
 
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
 
    // Filter headers based on visibility settings
    const visibleTableHeaders = ENHANCED_TABLE_HEADERS.filter(header =>
      visibleHeaders.has(header.id)
    );
 
    const totalStageColumns = visibleStages.reduce((total, stage) => {
      if (!isStageApplicableToTask(stage, tasks[0])) {
        return total + 1;
      }
      if (expandedStages.has(stage.id) && stage.documents && stage.documents.length > 0) {
        return total + stage.documents.reduce((docTotal, doc) => {
          if (expandedDocuments.has(doc.id) && doc.kycId && kycFieldsMap.has(doc.kycId)) {
            const fields = kycFieldsMap.get(doc.kycId) || [];
            return docTotal + (fields.length > 0 ? fields.length : 1);
          }
          return docTotal + 1;
        }, 0);
      }
      return total + 1;
    }, 0);
 
    const SortableHeader = ({ sortKey, children, className, rowSpan = 1 }) => {
      const isSorted = sortConfig?.key === sortKey;
      return (
        <TableHead className={className} onClick={() => requestSort(sortKey)} rowSpan={rowSpan}>
          <div className="flex items-center justify-center gap-2 cursor-pointer">
            {children}
            {isSorted ? (
              sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
            ) : <ArrowUpDown className="h-4 w-4 opacity-30" />}
          </div>
        </TableHead>
      )
    }
 
    return (
      <div className="border border-slate-200 rounded-lg bg-blue-500 overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <Table className="min-w-full border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-20 bg-blue-500/80 backdrop-blur-sm">
            <TableRow className="h-12">
              {/* Render only visible headers */}
              {visibleTableHeaders.map(header => (
                <SortableHeader
                  key={header.id}
                  rowSpan={2}
                  sortKey={header.id}
                  className={`bg-blue-500 border-r border-b-2 border-slate-300 text-white font-semibold text-center align-middle ${header.width || 'w-auto'} hover:bg-slate-200`}
                >
                  {header.label}
                </SortableHeader>
              ))}
 
              {/* Workflow stages section */}
              <TableHead colSpan={totalStageColumns} className="bg-blue-500 border-r border-b-2 border-slate-300 text-white text-center font-bold px-2 align-middle">
                <div className="flex items-center justify-center gap-2">
                  WORKFLOW STAGES
                  <Button variant="ghost" size="icon" className="h-6 w-6 p-0 text-white hover:bg-slate-200" onClick={expandAll} title="Expand All"><Plus className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 p-0 text-white hover:bg-slate-200" onClick={collapseAll} title="Collapse All"><Minus className="h-4 w-4" /></Button>
                </div>
              </TableHead>
              <TableHead rowSpan={2} className="bg-blue-500 border-r-0 border-b-2 border-slate-300 text-white font-semibold text-center w-[120px] sticky right-0 z-20 align-middle">
                Actions
              </TableHead>
            </TableRow>
            <TableRow className="h-14">
              {/* Stage Sub-Headers */}
              {visibleStages.map(stage => {
                const subHeaderBaseClasses = "bg-blue-400 border-r border-b border-slate-300 text-white text-center text-sm font-medium align-middle p-1 whitespace-nowrap";
                if (!expandedStages.has(stage.id) || !stage.documents || stage.documents.length === 0) {
                  return <TableHead key={`subhead-stage-${stage.id}`} className={subHeaderBaseClasses}><div className="flex items-center justify-center gap-1">{stage.name} <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-slate-500 hover:bg-slate-200" onClick={() => toggleStageExpansion(stage.id)}><Plus className="h-3 w-3" /></Button></div></TableHead>
                }
 
                return stage.documents.map(doc => {
                  const kycData = kycDocuments.get(doc.kycId);
                  const docDisplayName = kycData?.display_name || kycData?.name || doc.display_name || 'Document';
                  const isOldDoc = false;
                  const hasIndicator = false;
 
                  if (!expandedDocuments.has(doc.id) || !doc.kycId || !kycFieldsMap.has(doc.kycId) || kycFieldsMap.get(doc.kycId).length === 0 || hasIndicator || isOldDoc) {
                    return <TableHead key={`subhead-doc-${doc.id}`} className={subHeaderBaseClasses}><div className="flex items-center justify-center gap-1">{docDisplayName} <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-slate-500 hover:bg-slate-200" onClick={() => toggleDocumentExpansion(doc.id)}><Plus className="h-3 w-3" /></Button></div></TableHead>
                  }
 
                  const kycFields = kycFieldsMap.get(doc.kycId) || [];
                  return kycFields.map(field => (
                    <TableHead key={`subhead-field-${field.id}`} className={subHeaderBaseClasses}>{field.fieldName}</TableHead>
                  ))
                }).flat()
              })}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-200">
            {(dataLoading.tasks || dataLoading.stages || dataLoading.companies) ? (
              <TableRow><TableCell colSpan={visibleTableHeaders.length + totalStageColumns + 1} className="h-32 text-center text-slate-500">Loading...</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={visibleTableHeaders.length + totalStageColumns + 1} className="h-32 text-center text-destructive">{error}</TableCell></TableRow>
            ) : (
              <>
                {sortedTasks.map((task) => (
                  <React.Fragment key={task.id}>
                    {/* Main task row */}
                    <TableRow className="group bg-white hover:bg-blue-50/50">
                      {/* DYNAMICALLY RENDERED CELLS BASED ON VISIBLE HEADERS */}
                      {visibleTableHeaders.map(header => {
                        const cellContent = getCellContent(task, header.id);
                        const isComplex = React.isValidElement(cellContent);
                        return (
                          <TableCell key={`${task.id}-${header.id}`} className="border border-gray-200 text-sm p-2 align-middle text-center">
                            {isComplex ? cellContent : <div className="max-w-[180px] mx-auto truncate" title={cellContent}>{cellContent}</div>}
                          </TableCell>
                        );
                      })}
                      {/* STAGE CELLS - ALWAYS USE EditableStageCell */}
                      {visibleStages.map(stage => {
                        if (!isStageApplicableToTask(stage, task)) {
                          return <TableCell key={`${stage.id}-na`} className="border border-gray-200 text-center text-slate-400 italic text-sm align-middle">N/A</TableCell>
                        }
 
                        // ALWAYS use EditableStageCell - this ensures automation buttons appear
                        if (!expandedStages.has(stage.id) || !stage.documents || stage.documents.length === 0) {
                          return (
                            <TableCell key={stage.id} className="border border-gray-200 p-1 align-middle">
                              <EditableStageCell
                                stage={stage}
                                task={task}
                                value={task.stages?.[stage.id]}
                                allDocuments={allDocuments}
                                onDocumentUpload={handleStageDocumentUpload}
                                onShowDocuments={handleViewDocument}
                                getKycFields={getKycFields}
                                onSave={enhancedHandleStageStatusSave}
                              />
                            </TableCell>
                          )
                        }
 
                        return stage.documents.map(doc => {
                          const linkedDocumentForType = getDocumentForTaskStage(task, { ...stage, documents: [doc] });
                          const isOldDoc = linkedDocumentForType && task.created_at && isDocumentOlderThanTask(linkedDocumentForType.created_at, task.created_at);
                          const hasIndicator = linkedDocumentForType?.indicator === true;
 
                          if (!expandedDocuments.has(doc.id) || !doc.kycId || !kycFieldsMap.has(doc.kycId) || kycFieldsMap.get(doc.kycId).length === 0 || hasIndicator || isOldDoc) {
                            return (
                              <TableCell key={`${doc.id}`} className="border border-gray-200 p-1 align-middle">
                                {/* ALWAYS use EditableStageCell for consistency and automation buttons */}
                                <EditableStageCell
                                  stage={{ ...stage, documents: [doc] }}
                                  task={task}
                                  value={task.stages?.[stage.id]}
                                  allDocuments={allDocuments}
                                  onDocumentUpload={handleStageDocumentUpload}
                                  onShowDocuments={handleViewDocument}
                                  getKycFields={getKycFields}
                                  onSave={enhancedHandleStageStatusSave}
                                />
                              </TableCell>
                            )
                          } else {
                            const kycFields = kycFieldsMap.get(doc.kycId) || [];
                            return kycFields.map(field => (
                              <TableCell key={`${field.id || field.fieldName}`} className="border border-gray-200 p-1 align-middle">
                                <DocumentFieldCell document={linkedDocumentForType} field={field} isOldDocument={isOldDoc} />
                              </TableCell>
                            ))
                          }
                        }).flat()
                      })}
                      {/* ACTIONS CELL */}
                      <TableCell className="text-center text-sm p-2 align-middle sticky right-0 bg-white group-hover:bg-blue-50/50 border-l border-gray-200">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleTaskEdit(task)} className="h-8 w-8 text-blue-600 hover:bg-blue-100" title="Edit Task"><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => onTaskAction?.({ type: 'delete', task })} className="h-8 w-8 text-red-600 hover:bg-red-100" title="Delete Task"><Trash2 className="h-4 w-4" /></Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:bg-slate-100" title="More Actions"><ChevronDown className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handlePushCase(task, 6, 'Alien')} disabled={isPushingCase}><Send className="mr-2 h-4 w-4" /> Push to Alien</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handlePushCase(task, 7, 'Re-Entry Pass')} disabled={isPushingCase}><Send className="mr-2 h-4 w-4" /> Push to Re-Entry</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDownloadZip(task)} disabled={isDownloading}><DownloadCloud className="mr-2 h-4 w-4" /> Download Docs</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
 
                    {/* Dependant rows */}
                    {expandedDependants.has(task.id.toString()) && (() => {
                      const taskDeps = taskDependants.get(task.id.toString()) || [];
                      return taskDeps.map((dependant, depIndex) => (
                        <TableRow key={`${task.id}-dep-${depIndex}`} className="group bg-orange-50/30 hover:bg-orange-100/50 border-l-4 border-orange-400">
                          {/* DEPENDANT CELLS BASED ON VISIBLE HEADERS */}
                          {visibleTableHeaders.map(header => {
                            let cellContent = '';
                            switch (header.id) {
                              case 'id': cellContent = `${task.id}-D${depIndex + 1}`; break;
                              case 'applicant_name': cellContent = (
                                <div className="flex items-center gap-2">
                                  <div className="text-xs bg-orange-200 text-orange-800 px-2 py-1 rounded">DEP</div>
                                  <div>
                                    <div className="font-medium">{dependant.full_name}</div>
                                    <div className="text-xs text-gray-500">{dependant.relationship}</div>
                                  </div>
                                </div>
                              ); break;
                              case 'nationality': cellContent = dependant.nationality || 'N/A'; break;
                              case 'age': cellContent = dependant.age?.toString() || 'N/A'; break;
                              case 'company_name': cellContent = companies.get(task.company_id) || 'N/A'; break;
                              case 'job_level': cellContent = getTaskHierarchy(task)?.subclass?.name || getTaskHierarchy(task)?.class?.name || 'N/A'; break;
                              case 'task_manager': cellContent = getStaffName(task.task_manager_id); break;
                              case 'officer': cellContent = getStaffName(task.officer_id); break;
                              case 'task_assistant': cellContent = getStaffName(task.task_assistant_id); break;
                              case 'case_status': cellContent = task.status || 'N/A'; break;
                              case 'renewal_new': cellContent = task.renewal_status || 'New'; break;
                              default: cellContent = '-'; break;
                            }
                            
                            const isComplex = React.isValidElement(cellContent);
                            return (
                              <TableCell key={`${task.id}-dep-${depIndex}-${header.id}`} className="border border-gray-200 text-sm p-2 align-middle text-center bg-orange-50/20">
                                {isComplex ? cellContent : <div className="max-w-[180px] mx-auto truncate" title={cellContent}>{cellContent}</div>}
                              </TableCell>
                            );
                          })}
                          {/* STAGE CELLS FOR DEPENDANTS - Show N/A */}
                          {visibleStages.map(stage => {
                            if (!expandedStages.has(stage.id) || !stage.documents || stage.documents.length === 0) {
                              return <TableCell key={`${stage.id}-dep-na`} className="border border-gray-200 text-center text-slate-400 italic text-sm align-middle bg-orange-50/20">N/A</TableCell>
                            }
                            return stage.documents.map(doc => {
                              if (!expandedDocuments.has(doc.id) || !doc.kycId || !kycFieldsMap.has(doc.kycId) || kycFieldsMap.get(doc.kycId).length === 0) {
                                return <TableCell key={`${doc.id}-dep-na`} className="border border-gray-200 text-center text-slate-400 italic text-sm align-middle bg-orange-50/20">N/A</TableCell>
                              } else {
                                const kycFields = kycFieldsMap.get(doc.kycId) || [];
                                return kycFields.map(field => (
                                  <TableCell key={`${field.id || field.fieldName}-dep-na`} className="border border-gray-200 text-center text-slate-400 italic text-sm align-middle bg-orange-50/20">N/A</TableCell>
                                ))
                              }
                            }).flat()
                          })}
                          {/* ACTIONS CELL FOR DEPENDANTS */}
                          <TableCell className="text-center text-sm p-2 align-middle sticky right-0 bg-orange-50/20 border-l border-gray-200">
                            <span className="text-xs text-gray-500">Dependant</span>
                          </TableCell>
                        </TableRow>
                      ));
                    })()}
                  </React.Fragment>
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    )
  }, [stages, dataLoading, error, companies, isStageApplicableToTask, expandedStages, expandedDocuments, allDocuments, handleStageDocumentUpload, handleViewDocument, onTaskAction, handleTaskEdit, toggleStageExpansion, toggleDocumentExpansion, getKycFields, kycDocuments, visibleStageIds, sortConfig, enhancedHandleStageStatusSave, handlePushCase, handleDownloadZip, isPushingCase, isDownloading, getDocumentForTaskStage, getSortedTasks, visibleHeaders, getCellContent, taskDependants, expandedDependants, getTaskHierarchy, getStaffName]);
 
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
  
    // Calculate header structure with dependants from registry_individuals
    const headerStructure = []
    tasks.forEach(task => {
      headerStructure.push({ type: 'principal', task })
      
      // Use fetched dependants instead of dependants_members
      const taskDeps = taskDependants.get(task.id.toString()) || []
      if (expandedDependants.has(task.id.toString()) && taskDeps.length > 0) {
        taskDeps.forEach((dep, index) => {
          headerStructure.push({ type: 'dependant', task, dependant: dep, index })
        })
      }
    })
  
    const totalColumns = headerStructure.length;
    const visibleCaseDetailHeaders = ENHANCED_TABLE_HEADERS.filter(header =>
      visibleHeaders.has(header.id)
    );
  
    return (
      <div className="space-y-4">
        <div className="border-2 border-slate-300 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          <Table className="min-w-full border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-20 bg-slate-100/80 backdrop-blur-sm">
              {/* Case Details Rows */}
              {expandedSections.has('case_details') && visibleCaseDetailHeaders.map((header, index) => (
                <TableRow key={header.id} className="bg-blue-600 text-white group border-b border-slate-200">
                  <TableCell className="sticky left-0 z-10 bg-blue-600 text-white group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 text-center w-20">
                    {index + 1}
                  </TableCell>
                  <TableCell className="sticky left-8 z-10 bg-blue-600 text-white group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm p-2 min-w-[400px]">
                    {header.label}
                  </TableCell>
                  {headerStructure.map((item, colIndex) => (
                    <TableCell key={`${header.id}-${colIndex}`} className={`text-center text-sm py-1 px-2 align-middle bg-blue-500 text-white border border-gray-100 w-[200px] ${item.type === 'dependant' ? 'bg-orange-500' : ''}`}>
                      {item.type === 'principal'
                        ? getCellContent(item.task, header.id)
                        : (() => {
                          switch (header.id) {
                            case 'applicant_name': 
                              return (
                                <div className="flex flex-col">
                                  <span>{item.dependant.full_name || 'N/A'}</span>
                                  <span className="text-xs text-gray-500">{item.dependant.relationship || 'Dependant'}</span>
                                </div>
                              );
                            case 'nationality': 
                              return item.dependant.nationality || 'N/A';
                            case 'age': 
                              return item.dependant.age?.toString() || 'N/A';
                            case 'case_status': 
                              return (
                                <div className="flex flex-col">
                                  <span className="text-sm">{item.dependant.relationship || 'Dependant'}</span>
                                  <span className="text-xs text-gray-500">{item.dependant.nationality || ''}</span>
                                </div>
                              );
                            default: return <span className="text-sm text-gray-400">-</span>;
                          }
                        })()
                      }
                    </TableCell>
                  ))}
                </TableRow>
              ))}
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
                      {row.stageOrder || (row.type !== 'stage' && row.type !== 'document' && row.type !== 'field' && row.type !== 'actions' ? (index + 1) : '')}
                    </TableCell>
                    <TableCell className={`sticky left-8 z-10 ${rowBg.split('/')[0]} group-hover:bg-blue-50/50 border border-gray-100 font-medium text-sm text-slate-700 p-2 min-w-[400px]`}>
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
                          <span className="text-sm text-gray-400">-</span>
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
 }, [loading, error, tableRows, renderCellContent, expandedSections, expandedStages, expandedDocuments, expandedDependants, toggleSectionExpansion, toggleStageExpansion, toggleDocumentExpansion, getCellContent, visibleHeaders, taskDependants]);

 const defaultSubdepartments = getDefaultSubdepartments()

 useEffect(() => {
   if (isTransposedView && tasks && tasks.length > 0) {
     loadRows(tasks);
   }
 }, [tasks, isTransposedView, loadRows]);

 useEffect(() => {
   if (stages && stages.length > 0) {
     setVisibleStageIds(new Set(stages.map(s => s.id.toString())))
   } else {
     setVisibleStageIds(new Set())
   }
 }, [stages])

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

 useEffect(() => {
   const performInitialLoad = async () => {
     try {
       setDataLoading(prev => ({ ...prev, departments: true, companies: true, documents: true, kycFields: true, users: true }))

       const [departmentsData, companiesData, documentsData, kycFieldsData, usersData] = await Promise.all([
         fetchDepartments(),
         fetchCompanies(),
         fetchAllDocuments(),
         fetchAllKycFields(),
         fetchTmUsers()
       ]);

       setCompanies(companiesData);
       setAllDocuments(documentsData);
       setAllKycFields(kycFieldsData.fieldsMap);
       setKycDocuments(kycFieldsData.kycDocsMap);
       setTmUsers(usersData);
       setDepartments(departmentsData);

       setDataLoading(prev => ({
         ...prev,
         departments: false,
         companies: false,
         documents: false,
         kycFields: false,
         users: false
       }));

       if (departmentsData.length > 0) {
         const firstDept = departmentsData[0];
         setActiveDepartmentTab(firstDept.id.toString());
         const defaultSubs = firstDept.tm_subdepartments?.filter(sub => sub.default_display) || [];
         if (defaultSubs.length > 0) {
           setActiveSubdepartmentTab(defaultSubs[0].id.toString());
         }
       }
     } catch (error) {
       console.error('Error loading initial data:', error);
       toast({
         title: "Error",
         description: "Failed to load initial data.",
         variant: "destructive"
       });
       setDataLoading({
         departments: false,
         companies: false,
         documents: false,
         kycFields: false,
         tasks: false,
         stages: false,
         users: false
       });
     }
   };

   performInitialLoad();
 }, [fetchTmUsers]);

 useEffect(() => {
   if (activeDepartmentTab && departments.length > 0) {
     loadTasksData(activeDepartmentTab, activeSubdepartmentTab)
   }
 }, [activeDepartmentTab, activeSubdepartmentTab, loadTasksData])

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

 useEffect(() => {
   if (activeSubdepartmentTab && tmUsers.size > 0) {
     const staffData = getActiveStaffFromSubdepartment(activeSubdepartmentTab);
     setSubdepartmentOfficers(staffData.officers);
     setSubdepartmentManagers(staffData.managers);
     setSubdepartmentAssistants(staffData.assistants);

     // If we have an active manager tab but no active assistant tab, and the manager has assistants,
     // auto-select the first assistant if there's only one
     if (activeManagerTab && !activeAssistantTab) {
       const managerAssistants = getAssistantsForManager(activeManagerTab);
       if (managerAssistants.length === 1) {
         setActiveAssistantTab(managerAssistants[0].id);
       }
     }
   } else {
     setSubdepartmentOfficers([]);
     setSubdepartmentManagers([]);
     setSubdepartmentAssistants([]);
   }
 }, [
   activeSubdepartmentTab,
   activeManagerTab,
   activeAssistantTab,
   getActiveStaffFromSubdepartment,
   tmUsers,
   getAssistantsForManager
 ]);

 useEffect(() => {
   if (activeManagerTab) {
     const managerAssistants = getAssistantsForManager(activeManagerTab);
     setSubdepartmentAssistants(managerAssistants);

     // Auto-select the first assistant if there's only one
     if (managerAssistants.length === 1) {
       setActiveAssistantTab(managerAssistants[0].id);
     } else {
       setActiveAssistantTab(null);
     }
   } else {
     // Reset to all assistants when no manager is selected
     if (activeSubdepartmentTab && tmUsers.size > 0) {
       const staffData = getActiveStaffFromSubdepartment(activeSubdepartmentTab);
       setSubdepartmentAssistants(staffData.assistants);
     } else {
       setSubdepartmentAssistants([]);
     }
     setActiveAssistantTab(null);
   }
 }, [activeManagerTab, activeSubdepartmentTab, getAssistantsForManager, getActiveStaffFromSubdepartment, tmUsers]);

 useEffect(() => {
   setActiveOfficerTab(null);
   setActiveManagerTab(null);
   setActiveAssistantTab(null);
 }, [activeFollowUpFilter]);

 const isAnyDataLoading = Object.values(dataLoading).some(loading => loading)

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
                         <div className="space-y-4">
                           <Tabs value={activeFollowUpFilter} onValueChange={setActiveFollowUpFilter}>
                             <TabsList className="rounded-lg p-1 shadow-sm bg-slate-100">
                               <TabsTrigger value="all" className="text-sm md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">All <Badge variant="outline">{wipTasks.length}</Badge></TabsTrigger>
                               <TabsTrigger value="bcl" className="text-sm md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">BCL <Badge variant="outline">{getWIPTasksByFollowUp('bcl').length}</Badge></TabsTrigger>
                               <TabsTrigger value="officer" className="text-sm md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">Officers <Badge variant="outline">{getWIPTasksByFollowUp('officer').length}</Badge></TabsTrigger>
                               <TabsTrigger value="client" className="text-sm md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">Client <Badge variant="outline">{getWIPTasksByFollowUp('client').length}</Badge></TabsTrigger>
                             </TabsList>
                           </Tabs>

                           {/* Enhanced Staff Tabs */}
                           {(activeFollowUpFilter === 'bcl' || activeFollowUpFilter === 'officer') && activeSubdepartmentTab && (
                             <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                               {renderStaffTabs()}
                             </div>
                           )}
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
       users={Array.from(tmUsers.values())}
       officers={Array.from(tmUsers.values()).filter(u => u.role === 'officer')}
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
           refreshAllData();
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
               setPreviewDocument(null);
               toast({ title: "Success", description: "Document details saved." });
             }}
             file={previewDocument.file}
             type={previewDocument.type}
           />
         )}
       </DialogContent>
     </Dialog>

     {/* Enhanced Class Selection Dialog for Alien Cases */}
     <Dialog open={isClassSelectionOpen} onOpenChange={setIsClassSelectionOpen}>
       <DialogContent className="max-w-lg">
         <DialogHeader>
           <DialogTitle>Select Classes for Alien Case</DialogTitle>
           <DialogDescription>
             Choose the appropriate classes for {selectedTaskForPush?.task.applicant_name} and dependants under Alien subdepartment.
           </DialogDescription>
         </DialogHeader>

         <div className="space-y-6">
           {/* Applicant Class Selection */}
           <div className="space-y-3">
             <h4 className="font-medium text-sm">
               Class for Applicant: {selectedTaskForPush?.task.applicant_name}
             </h4>
             <div className="grid gap-2">
               {availableClasses.map((classItem) => (
                 <Button
                   key={`applicant-${classItem.id}`}
                   variant="outline"
                   className="w-full justify-start h-auto p-3 text-left"
                   onClick={() => {
                     setSelectedTaskForPush(prev => prev ? { ...prev, applicantClassId: classItem.id.toString() } : null);
                   }}
                 >
                   <div className="flex items-center gap-3">
                     <div className={`w-4 h-4 rounded-full border-2 ${
                       selectedTaskForPush?.applicantClassId === classItem.id.toString() 
                         ? 'bg-blue-500 border-blue-500' 
                         : 'border-gray-300'
                     }`}>
                       {selectedTaskForPush?.applicantClassId === classItem.id.toString() && (
                         <div className="w-2 h-2 bg-white rounded-full m-0.5" />
                       )}
                     </div>
                     <div>
                       <div className="font-semibold">{classItem.name}</div>
                       {classItem.description && (
                         <div className="text-sm text-muted-foreground">
                           {classItem.description}
                         </div>
                       )}
                     </div>
                   </div>
                 </Button>
               ))}
             </div>
           </div>

           {/* Dependants Class Selection */}
           {(() => {
             const taskDeps = taskDependants.get(selectedTaskForPush?.task.id.toString() || '') || [];
             const adultDependants = taskDeps.filter(dep => dep.age === null || dep.age >= 18);
             
             if (adultDependants.length > 0) {
               return (
                 <div className="space-y-3">
                   <h4 className="font-medium text-sm">
                     Class for Dependants ({adultDependants.length} adult dependants)
                   </h4>
                   <div className="text-xs text-gray-600 mb-2">
                     {adultDependants.map(dep => dep.full_name).join(', ')}
                   </div>
                   <div className="grid gap-2">
                     {availableClasses.map((classItem) => (
                       <Button
                         key={`dependant-${classItem.id}`}
                         variant="outline"
                         className="w-full justify-start h-auto p-3 text-left"
                         onClick={() => {
                           setSelectedTaskForPush(prev => prev ? { ...prev, dependantClassId: classItem.id.toString() } : null);
                         }}
                       >
                         <div className="flex items-center gap-3">
                           <div className={`w-4 h-4 rounded-full border-2 ${
                             selectedTaskForPush?.dependantClassId === classItem.id.toString() 
                               ? 'bg-orange-500 border-orange-500' 
                               : 'border-gray-300'
                           }`}>
                             {selectedTaskForPush?.dependantClassId === classItem.id.toString() && (
                               <div className="w-2 h-2 bg-white rounded-full m-0.5" />
                             )}
                           </div>
                           <div>
                             <div className="font-semibold">{classItem.name}</div>
                             {classItem.description && (
                               <div className="text-sm text-muted-foreground">
                                 {classItem.description}
                               </div>
                             )}
                           </div>
                         </div>
                       </Button>
                     ))}
                   </div>
                 </div>
               );
             }
             return null;
           })()}
         </div>

         <div className="flex justify-end gap-2 pt-4">
           <Button
             variant="outline"
             onClick={() => {
               setIsClassSelectionOpen(false);
               setSelectedTaskForPush(null);
             }}
           >
             Cancel
           </Button>
           <Button
             onClick={async () => {
               if (selectedTaskForPush) {
                 setIsClassSelectionOpen(false);
                 await executePushCase(
                   selectedTaskForPush.task,
                   selectedTaskForPush.targetDeptId,
                   selectedTaskForPush.targetSubDeptId,
                   selectedTaskForPush.targetSubDeptName,
                   selectedTaskForPush.applicantClassId || null,
                   selectedTaskForPush.dependantClassId || selectedTaskForPush.applicantClassId || null
                 );
                 setSelectedTaskForPush(null);
               }
             }}
             disabled={!selectedTaskForPush?.applicantClassId}
           >
             Push Case
           </Button>
         </div>
       </DialogContent>
     </Dialog>
   </div>
 )
}