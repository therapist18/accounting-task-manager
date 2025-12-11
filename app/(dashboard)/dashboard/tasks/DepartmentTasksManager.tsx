// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { unstable_batchedUpdates } from 'react-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Settings, Search, X, TableProperties, RotateCcw, Pencil, AlertCircle, Plus, Minus, Download, Edit, Trash2, ChevronDown, Send, DownloadCloud, Eye, FileText, Save, PanelLeftClose, PanelLeftOpen, ChevronRight, EyeOff, CheckCircle2, XCircle, Briefcase } from "lucide-react"
import { DeleteConfirmationDialog } from "./components/DeleteConfirmationDialog"
import { EnquiryDialog } from "./components/EnquiryDialog"
import { format } from 'date-fns';
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { EditTaskDialog } from "./components/EditTaskDialog"
import { fetchDepartments } from "../departments/departments/database"
import { DepartmentTasksManagerProps } from "./components/types"
import { StageUploadDialog } from "./components/StageUploadDialog"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import { fetchTasks, fetchStages, fetchCompanies, fetchAllDocuments, fetchAllKycFields, fetchKycDocument, formatDateValue, type Task as UtilTask, type Department, type KycDocument, type Document } from "./utils/taskManagerData"
import { LinkSourceDocumentDialog } from './components/LinkSourceDocumentDialog';
import { StandardTable } from './overall-view/StandardTable';
import { EnhancedTable } from './overall-view/EnhancedTable';
import { ENHANCED_TABLE_HEADERS_IMMIGRATION, STATS_HEADERS, calculateAge, getEnhancedImmigrationStatus, getCurrentStageStatus, renderImmigrationStatusCell, renderCurrentStageStatusCell, getCellContent as utilGetCellContent, sortTasks, filterTasksBySearch, ENHANCED_TABLE_HEADERS, isDocumentApplicable, fetchAndEnhanceIndividuals, getRawCellValue, enhanceTasksWithIndividualData } from './overall-view/tableUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { OtherDialog } from "./components/OtherDialog"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import EditableStageCell from "./components/EditableStageCell"

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
  const [isOtherDialogOpen, setIsOtherDialogOpen] = useState(false)
  const [selectedStageTask, setSelectedStageTask] = useState<{ task: any, stage: any } | null>(null)
  const [isStageUploadDialogOpen, setIsStageUploadDialogOpen] = useState(false)
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
  const [isPushingCase, setIsPushingCase] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [globalSearchTerm, setGlobalSearchTerm] = useState<string>('')
  const [currentTableHeaders, setCurrentTableHeaders] = useState(ENHANCED_TABLE_HEADERS)
  const [visibleHeaders, setVisibleHeaders] = useState<Set<string>>(new Set(ENHANCED_TABLE_HEADERS.filter(h => h.default).map(h => h.id)))
  const [visibleStats, setVisibleStats] = useState<Set<string>>(new Set(STATS_HEADERS.filter(h => h.default).map(h => h.id)))
  const [visibleStageIds, setVisibleStageIds] = useState<Set<string>>(new Set())
  const [showNAStages, setShowNAStages] = useState<boolean>(false);
  const [expandedDependants, setExpandedDependants] = useState<Set<string>>(new Set())
  const [kycDocuments, setKycDocuments] = useState<Map<string, KycDocument>>(new Map())
  const [allKycFields, setAllKycFields] = useState<Record<string, any[]>>({})
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())
  const [isDocumentPreviewOpen, setIsDocumentPreviewOpen] = useState(false);
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['case_details', 'stages']))
  const [expandedImmigrationStatus, setExpandedImmigrationStatus] = useState<Set<string>>(new Set())
  const [activeReport, setActiveReport] = useState<any | null>(null);
  const [areTabsVisible, setAreTabsVisible] = useState(true);
  const [isAllExpanded, setIsAllExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [stageDialogKey, setStageDialogKey] = useState(0);
  useEffect(() => {
    const headers = activeDepartmentTab === '1'
      ? ENHANCED_TABLE_HEADERS_IMMIGRATION
      : ENHANCED_TABLE_HEADERS;
    setCurrentTableHeaders(headers);
    setVisibleHeaders(new Set(headers.filter(h => h.default).map(h => h.id)));
  }, [activeDepartmentTab]);
  const [tmUsers, setTmUsers] = useState<Map<number, any>>(new Map())
  const [activeOfficerTab, setActiveOfficerTab] = useState<string | null>(null)
  const [activeManagerTab, setActiveManagerTab] = useState<string | null>(null)
  const [activeAssistantTab, setActiveAssistantTab] = useState<string | null>(null)
  const [subdepartmentOfficers, setSubdepartmentOfficers] = useState<Array<{ id: string, name: string }>>([])
  const [subdepartmentManagers, setSubdepartmentManagers] = useState<Array<{ id: string, name: string }>>([])
  const [subdepartmentAssistants, setSubdepartmentAssistants] = useState<Array<{ id: string, name: string }>>([])
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkingTask, setLinkingTask] = useState<UtilTask | null>(null);
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [selectedAutomation, setSelectedAutomation] = useState<any>(null);
  const [isClassSelectionOpen, setIsClassSelectionOpen] = useState(false);
  const [selectedTaskForPush, setSelectedTaskForPush] = useState<{
    task: UtilTask;
    targetDeptId: number;
    targetSubDeptId: number;
    targetSubDeptName: string;
    isApplicant: boolean;
    applicantAge: number | null;
    applicantClassId?: string;
    dependantClasses?: Map<string, string>;
  } | null>(null);
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);
  const [tableRows, setTableRows] = useState([]);
  const [taskDependants, setTaskDependants] = useState<Map<string, any[]>>(new Map());
  const [enhancedTasksData, setEnhancedTasksData] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const depts = await fetchDepartments();
        setDepartments(depts);
      } catch (error) {
        console.error('Error loading departments:', error);
      }
    };
    loadDepartments();
    console.log('Departments data:', JSON.stringify(departments, null, 2));
  }, []);

  const isStageApplicableToTask = useCallback((stage: any, task: any, departments: any[]): boolean => {
    if (!task || !stage || !Array.isArray(departments) || departments.length === 0) {
      return true; // Default to applicable if data is missing
    }

    try {
      const dept = departments.find(d => d?.id === (task.department?.id || task.department_id));
      if (!dept) return true;

      const subdept = dept.tm_subdepartments?.find((s: any) => s?.id === (task.subdepartment?.id || task.subdepartment_id));
      if (!subdept) return true;

      if (task.class_id) {
        const cls = subdept.classes?.find((c: any) => c?.id?.toString() === task.class_id?.toString());
        const classStage = cls?.stages?.find((s: any) => s.stage_id === stage.id);
        if (classStage && typeof classStage.applicable === 'boolean') {
          return classStage.applicable;
        }
      }

      const subdeptStage = subdept.stages?.find((s: any) => s.stage_id === stage.id);
      if (subdeptStage && typeof subdeptStage.applicable === 'boolean') {
        return subdeptStage.applicable;
      }

      return true; // Default to applicable if no override is found
    } catch (error) {
      console.error('Error in isStageApplicableToTask:', error);
      return true; // Failsafe
    }
  }, []);

  // Add this useEffect near the top of your component, with other state declarations
  useEffect(() => {
    const loadKycData = async () => {
      try {
        const { kycDocsMap } = await fetchAllKycFields();
        setKycDocuments(kycDocsMap);
      } catch (error) {
        console.error('Error loading KYC documents:', error);
      }
    };

    loadKycData();
  }, []);

  useEffect(() => {
    const enhanceTaskData = async () => {
      if (!tasks.length) return;

      const { enhancedTasksData, taskDependants } = await enhanceTasksWithIndividualData(tasks);

      setTaskDependants(taskDependants);
      setEnhancedTasksData(enhancedTasksData);
    };

    enhanceTaskData();
  }, [tasks]);

  const getStaffName = useCallback((userId) => {
    if (!userId) return '';
    const user = tmUsers.get(parseInt(userId.toString()));
    return user?.name || `User ${userId}`;
  }, [tmUsers]);

  const getDocumentForTaskStage = useCallback((
    task: UtilTask,
    stage: {
      id: string;
      documents?: Array<{
        kycId: string;
        isSpecial?: boolean;
        targetEntities?: Array<{
          class_id?: string | number;
          subdept_id?: string | number;
          entityType?: 'class' | 'subdept' | 'subclass';
        }>;
      }>
    },
  ): Document[] => {
    const linkedDocumentData = task.source_document_id?.[stage.id];

    if (!linkedDocumentData) {
      return [];
    }

    // Get task's class and subdepartment IDs for comparison
    const taskClassId = task.class_id?.toString();
    const taskSubdeptId = task.subdepartment?.id?.toString() || task.subdepartment_id?.toString();

    // Handle both single document and array of documents
    const documentRefs = Array.isArray(linkedDocumentData)
      ? linkedDocumentData
      : [linkedDocumentData];

    const linkedDocs = documentRefs
      .map(ref => {
        const documentId = typeof ref === 'string' ? ref : ref.id;
        const doc = allDocuments.find(doc => doc.id.toString() === documentId.toString());

        if (!doc) return null;

        // For non-special documents, always include them
        if (!doc.isSpecial) return doc;

        // For special documents, check target entities
        if (Array.isArray(doc.targetEntities) && doc.targetEntities.length > 0) {
          const isApplicable = doc.targetEntities.some(entity => {
            const classMatch = !entity.class_id || entity.class_id.toString() === taskClassId;
            const subdeptMatch = !entity.subdept_id || entity.subdept_id.toString() === taskSubdeptId;
            return classMatch && subdeptMatch;
          });

          return isApplicable ? doc : null;
        }

        // For backward compatibility, include the document if no target entities are defined
        return doc;
      })
      .filter((doc): doc is Document => !!doc);

    return linkedDocs;
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
      const [tasksData, stagesData] = await Promise.all([
        fetchTasks(departmentId, subdepartmentId),
        departmentId ? fetchStages(departmentId, departments) : Promise.resolve([])
      ])

      setTasks(tasksData)
      setStages(stagesData)

    } catch (error) {
      console.error('Error loading tasks data:', error)
      toast({
        title: "Error",
        description: "Failed to load tasks data.",
        variant: "destructive"
      })
    }
  }, [departments])

  const refreshAllData = useCallback(async () => {
    try {
      const [
        documentsData,
        { fieldsMap, kycDocsMap },
        usersData,
        tasksData = null
      ] = await Promise.all([
        fetchAllDocuments(),
        fetchAllKycFields(),
        fetchTmUsers(),
        activeDepartmentTab ? loadTasksData(activeDepartmentTab, activeSubdepartmentTab) : Promise.resolve(null)
      ]);

      // Batch state updates
      unstable_batchedUpdates(() => {
        setAllDocuments(documentsData);
        setAllKycFields(fieldsMap);
        setKycDocuments(kycDocsMap);
        setTmUsers(usersData);
      });

      if (tasksData === null && activeDepartmentTab) {
        // If tasks weren't loaded in the initial batch, load them now
        await loadTasksData(activeDepartmentTab, activeSubdepartmentTab);
      }

      toast({
        title: "Success",
        description: "Data refreshed successfully.",
        variant: "default"
      });
    } catch (error) {
      console.error('Error refreshing data:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to refresh data.",
        variant: "destructive"
      });
    }
  }, [activeDepartmentTab, activeSubdepartmentTab, loadTasksData, fetchTmUsers])

  const getKycFields = useCallback((doc: any) => {
    if (!doc.kycId) return Promise.resolve([]);
    return Promise.resolve(allKycFields[doc.kycId] || []);
  }, [allKycFields])

  interface Stage {
    id: string;
    name: string;
    order_num?: number;
    documents?: Array<{ id: string }>;
  }

  interface TaskStageData {
    status?: string;
    date?: string;
    completedAt?: string;
  }

  interface Task {
    id: string;
    stages?: Record<string, TaskStageData>;
    source_document_id?: Record<string, string | { id: string }>;
    created_at?: string;
  }

  interface Document {
    id: string;
    indicator?: boolean;
    created_at?: string;
  }

  const determineCurrentStage = (task: Task | null, stages: Stage[]): Stage | null => {
    if (!task || !stages.length) return null;

    // Sort stages by order_num once
    const sortedStages = [...stages].sort((a, b) => (a.order_num ?? 0) - (b.order_num ?? 0));

    const isStageCompleted = (stage: Stage): boolean => {
      const stageData = task.stages?.[stage.id];
      const requiresDocuments = Boolean(stage.documents?.length);

      if (requiresDocuments) {
        const documentRef = task.source_document_id?.[stage.id];
        if (!documentRef) return false;

        const documentId = typeof documentRef === 'string' ? documentRef : documentRef.id;
        const linkedDoc = allDocuments.find(doc => doc.id === documentId) as Document | undefined;

        if (!linkedDoc?.indicator) {
          // If task has no creation date or document has no creation date, consider it valid
          if (!task.created_at || !linkedDoc?.created_at) return true;

          // Only invalidate if document is older than the task
          return new Date(linkedDoc.created_at) >= new Date(task.created_at);
        }
        return false;
      }

      // For non-document stages, check completion status
      return Boolean(
        stageData?.status === 'completed' ||
        stageData?.date ||
        stageData?.completedAt
      );
    };

    // Find the last completed stage
    const lastCompletedIndex = sortedStages.reduce<number>((lastIndex, stage, index) => {
      return isStageCompleted(stage) ? index : lastIndex;
    }, -1);

    // Determine the appropriate stage to return
    if (lastCompletedIndex === -1) return sortedStages[0] || null;
    return sortedStages[lastCompletedIndex + 1] ?? sortedStages[lastCompletedIndex];
  };

  // Create wrapper functions for utility functions
  const getEnhancedImmigrationStatusWrapper = useCallback((task: any) => {
    return getEnhancedImmigrationStatus(task, stages, allDocuments, kycDocuments);
  }, [stages, allDocuments, kycDocuments]);

  const getCurrentStageStatusWrapper = useCallback((task: UtilTask) => {
    return getCurrentStageStatus(task, stages, departments, allDocuments);
  }, [stages, departments, allDocuments]);

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
      const newSet = new Set(prev);
      if (newSet.has(docId)) {
        newSet.delete(docId);
      } else {
        newSet.add(docId);
      }
      return newSet;
    });
  }, []);

  const toggleDependantsExpansion = useCallback((taskId: string) => {
    setExpandedDependants(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  }, []);

  const expandAll = () => {
    setExpandedSections(new Set(['case_details', 'stages', 'stats']));
    const allStageIds = stages.map(s => s.id);
    setExpandedStages(new Set(allStageIds));
    const allDocIds = stages.flatMap(s => s.documents?.map(d => d.id) || []);
    setExpandedDocuments(new Set(allDocIds));

    const allTaskIdsWithDependants = tasks.filter(t =>
      t.dependant_member && Array.isArray(t.dependant_member) && t.dependant_member.length > 0
    ).map(t => t.id.toString());
    setExpandedDependants(new Set(allTaskIdsWithDependants));
    setIsAllExpanded(true);
  };

  const collapseAll = () => {
    setExpandedSections(new Set())
    setExpandedStages(new Set())
    setExpandedDocuments(new Set())
    setExpandedDependants(new Set())
    setIsAllExpanded(false);
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

  const filterTasksBySearchWrapper = useCallback((tasks: any[]) => {
    return filterTasksBySearch(
      tasks,
      globalSearchTerm,
      enhancedTasksData,
      taskDependants,
      companies,
      getTaskHierarchy,
      getUserDisplayName
    );
  }, [globalSearchTerm, enhancedTasksData, taskDependants, companies, getTaskHierarchy, getUserDisplayName]);

  const enquiryTasks = useMemo(() => filterTasksBySearchWrapper(getFilteredTasks('enquiry')), [getFilteredTasks, filterTasksBySearchWrapper])
  const wipTasks = useMemo(() => filterTasksBySearchWrapper(getWIPTasksByFollowUp(activeFollowUpFilter)), [getWIPTasksByFollowUp, activeFollowUpFilter, filterTasksBySearchWrapper])
  const completedTasks = useMemo(() => filterTasksBySearchWrapper(getFilteredTasks('write_up_completed')), [getFilteredTasks, filterTasksBySearchWrapper])

  const handleExport = useCallback(async (tasks: any[], tableType: string) => {
    if (!tasks.length) {
      toast({ title: "No Data", description: "No data available to export.", variant: "destructive" });
      return;
    }

    try {
      const workbook = XLSX.utils.book_new();
      const exportData = [];

      for (const task of tasks) {
        const enhancedTask = enhancedTasksData.get(task.id.toString()) || task;
        const taskDeps = taskDependants.get(task.id.toString()) || [];

        // Main row (Applicant)
        const mainRow = {
          'Task ID': getRawCellValue(departments, task, 'id', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Type': 'Applicant',
          'Name': getRawCellValue(departments, task, 'applicant_name', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Nationality': getRawCellValue(departments, task, 'nationality', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Age': getRawCellValue(departments, task, 'age', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Relationship': 'Principal',
          'Company': getRawCellValue(departments, task, 'company_name', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Job Level': getRawCellValue(departments, task, 'job_level', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Immigration Status': getRawCellValue(departments, task, 'immigration_status', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Immigration Document Type': getRawCellValue(departments, task, 'immigration_document_type', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Immigration Expiry Date': getRawCellValue(departments, task, 'immigration_expiry_date', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Current Stage': getRawCellValue(departments, task, 'current_stage_name', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Stage Status': getRawCellValue(departments, task, 'current_stage_status_value', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Stage Follow-up': getRawCellValue(departments, task, 'current_stage_follow_up', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Task Manager': getRawCellValue(departments, task, 'task_manager', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Officer': getRawCellValue(departments, task, 'officer', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Task Assistant': getRawCellValue(departments, task, 'task_assistant', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Case Status': getRawCellValue(departments, task, 'case_status', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
          'Renewal Status': getRawCellValue(departments, task, 'renewal_new', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper)
        };
        exportData.push(mainRow);

        // Dependant rows
        taskDeps.forEach(dep => {
          const depRow = {
            'Task ID': task.id,
            'Type': 'Dependant',
            'Name': dep.full_name,
            'Nationality': dep.nationality || 'N/A',
            'Age': dep.age?.toString() || 'N/A',
            'Relationship': dep.relationship || 'Dependant',
            'Company': getRawCellValue(departments, task, 'company_name', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
            'Job Level': getRawCellValue(departments, task, 'job_level', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
            'Immigration Status': 'N/A',
            'Immigration Document Type': 'N/A',
            'Immigration Expiry Date': 'N/A',
            'Current Stage': 'N/A',
            'Stage Status': 'N/A',
            'Stage Follow-up': 'N/A',
            'Task Manager': getRawCellValue(departments, task, 'task_manager', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
            'Officer': getRawCellValue(departments, task, 'officer', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
            'Task Assistant': getRawCellValue(departments, task, 'task_assistant', enhancedTasksData, companies, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper),
            'Case Status': task.status,
            'Renewal Status': task.renewal_status || 'New'
          };
          exportData.push(depRow);
        });
      }

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(workbook, worksheet, tableType);

      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const filename = `${tableType}_${timestamp}.xlsx`;

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
  }, [
    enhancedTasksData,
    taskDependants,
    departments,
    companies,
    getStaffName,
    getEnhancedImmigrationStatusWrapper,
    getCurrentStageStatusWrapper
  ]);
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
        const enhancedTask = enhancedTasksData.get(task.id.toString()) || task;
        let applicantAge = enhancedTask.age;
        if (applicantAge === undefined || applicantAge === null) {
          applicantAge = calculateAge(task.date_of_birth);
        }
        setSelectedTaskForPush({ task, targetDeptId, targetSubDeptId, targetSubDeptName, isApplicant: true, applicantAge, applicantClassId: undefined, dependantClasses: new Map() });
        setAvailableClasses(classes);
        setIsClassSelectionOpen(true);
        return;
      }
    }
    await executePushCase(task, targetDeptId, targetSubDeptId, targetSubDeptName, null, null);
  }, [getClassesForSubdepartment, enhancedTasksData]);

  const executePushCase = useCallback(async (
    task: UtilTask,
    targetDeptId: number,
    targetSubDeptId: number,
    targetSubDeptName: string,
    applicantClassId: string | null,
    dependantClassId: string | null
  ) => {
    setIsPushingCase(true);
    toast({ title: "Pushing Case...", description: `Creating new task(s) in ${targetSubDeptName}.` });
    const isReEntry = targetSubDeptId === 7;
    const isPrincipalMember = task.applicant_type === 'principal' || task.principal_member === true;
    const isAlien = targetSubDeptId === 6;

    try {
      const tasksToCreate = [];
      const currentDate = new Date().toISOString();
      const stages = {};

      // Update stage statuses based on the target department
      if (isAlien || isReEntry) {
        stages['1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa'] = {
          date: currentDate,
          status: 'write_up_completed',
          completedAt: currentDate,
          updatedAt: currentDate
        };
        stages['a19b270e-6d1e-4e6d-b2bc-f21db72cde08'] = {
          date: currentDate,
          status: 'in_progress',
          completedAt: currentDate,
          updatedAt: currentDate
        };
        stages['9ccdbfa6-8d76-49db-b8d4-09742c734905'] = {
          date: currentDate,
          status: 'write_up_completed',
          completedAt: currentDate,
          updatedAt: currentDate
        };
      }

      // Use the new function from tableUtils
      const { dependantsMap } = await fetchAndEnhanceIndividuals([task]);
      const dependants = [];
      let skippedMinors = 0;

      if (isReEntry) {
        if (!isPrincipalMember) {
          tasksToCreate.push({
            status: 'in_progress',
            department_id: targetDeptId,
            subdepartment_id: targetSubDeptId,
            class_id: applicantClassId ? Number(applicantClassId) : null,
            subclass_id: null,
            created_by: 'system',
            date_initiated: currentDate,
            stages: { ...stages },
            task_manager_id: task.task_manager_id ? Number(task.task_manager_id) : null,
            task_assistant_id: task.task_assistant_id ? Number(task.task_assistant_id) : null,
            officer_id: task.officer_id ? Number(task.officer_id) : null,
            account_used: task.account_used ? String(task.account_used) : null,
            batch: task.batch ? String(task.batch) : null,
            applied_by: task.applied_by ? String(task.applied_by) : null,
            applicant_type: 'dependant',
            r_number: task.r_number ? String(task.r_number) : null,
            principal_member_name: task.principal_member_name ? String(task.principal_member_name) : null,
            renewal_status: task.renewal_status ? String(task.renewal_status) : null,
            selections: task.selections ? JSON.stringify(task.selections) : null,
            company_id: task.company_id ? Number(task.company_id) : null,
            principal_member: false,
            understudy: task.understudy ? String(task.understudy) : null,
            references: task.references ? JSON.stringify(task.references) : '[]',
            job_description: task.job_description ? String(task.job_description) : null,
            document_id: null,
            source_document_id: null,
            applicant_name: String(task.applicant_name || ''),
            individual_id: String(task.individual_id || '')
          });
        }

        if (task.dependant_member && Array.isArray(task.dependant_member)) {
          task.dependant_member.forEach(dep => {
            if (dep?.id && dependantsMap.has(dep.id)) {
              dependants.push({
                ...dependantsMap.get(dep.id),
                relationship: dep.relationship || 'Dependant'
              });
            }
          });

          for (const dependant of dependants) {
            tasksToCreate.push({
              status: 'in_progress',
              department_id: Number(targetDeptId) || null,
              subdepartment_id: Number(targetSubDeptId) || null,
              class_id: dependantClassId || applicantClassId ? Number(dependantClassId || applicantClassId) : null,
              subclass_id: null,
              created_by: 'system',
              date_initiated: currentDate,
              stages: { ...stages },
              task_manager_id: task.task_manager_id ? Number(task.task_manager_id) : null,
              task_assistant_id: task.task_assistant_id ? Number(task.task_assistant_id) : null,
              officer_id: task.officer_id ? Number(task.officer_id) : null,
              account_used: task.account_used ? String(task.account_used) : null,
              batch: task.batch ? String(task.batch) : null,
              applied_by: task.applied_by ? String(task.applied_by) : null,
              applicant_type: 'dependant',
              r_number: task.r_number ? String(task.r_number) : null,
              principal_member_name: task.principal_member_name ? String(task.principal_member_name) : null,
              renewal_status: task.renewal_status ? String(task.renewal_status) : null,
              selections: task.selections ? JSON.stringify(task.selections) : null,
              company_id: task.company_id ? Number(task.company_id) : null,
              principal_member: false,
              understudy: task.understudy ? String(task.understudy) : null,
              references: task.references ? JSON.stringify(task.references) : '[]',
              job_description: task.job_description ? String(task.job_description) : null,
              document_id: null,
              source_document_id: null,
              applicant_name: String(dependant.full_name || ''),
              individual_id: String(dependant.individual_id || '')
            });
          }
        }
      } else {
        const baseTaskData = {
          status: 'in_progress',
          department_id: Number(targetDeptId) || null,
          subdepartment_id: Number(targetSubDeptId) || null,
          class_id: applicantClassId ? Number(applicantClassId) : null,
          subclass_id: null,
          created_by: 'system',
          date_initiated: currentDate,
          stages: { ...stages },
          task_manager_id: task.task_manager_id ? Number(task.task_manager_id) : null,
          task_assistant_id: task.task_assistant_id ? Number(task.task_assistant_id) : null,
          officer_id: task.officer_id ? Number(task.officer_id) : null,
          account_used: task.account_used ? String(task.account_used) : null,
          batch: task.batch ? String(task.batch) : null,
          applied_by: task.applied_by ? String(task.applied_by) : null,
          applicant_type: isPrincipalMember ? 'principal' : 'dependant',
          r_number: task.r_number ? String(task.r_number) : null,
          principal_member_name: task.principal_member_name ? String(task.principal_member_name) : null,
          renewal_status: task.renewal_status ? String(task.renewal_status) : null,
          selections: task.selections ? JSON.stringify(task.selections) : null,
          company_id: task.company_id ? Number(task.company_id) : null,
          principal_member: Boolean(isPrincipalMember),
          understudy: task.understudy ? String(task.understudy) : null,
          references: task.references ? JSON.stringify(task.references) : '[]',
          job_description: task.job_description ? String(task.job_description) : null,
          document_id: null,
          source_document_id: null,
          applicant_name: String(task.applicant_name || ''),
          individual_id: String(task.individual_id || '')
        };

        tasksToCreate.push(baseTaskData);

        if (task.dependant_member && Array.isArray(task.dependant_member)) {
          task.dependant_member.forEach(dep => {
            if (dep?.id && dependantsMap.has(dep.id)) {
              dependants.push({
                ...dependantsMap.get(dep.id),
                relationship: dep.relationship || 'Dependant'
              });
            }
          });

          for (const dependant of dependants) {
            if (isAlien) {
              const age = dependant.age;
              if (age === null || age < 18) {
                skippedMinors++;
                continue;
              }
            }

            tasksToCreate.push({
              ...baseTaskData,
              class_id: dependantClassId || applicantClassId,
              applicant_name: dependant.full_name,
              individual_id: dependant.individual_id,
              applicant_type: 'dependant',
              principal_member: false
            });
          }
        }
      }

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
  }, [refreshAllData]);

  const handleDownloadZip = useCallback(async (task: UtilTask) => {
    setIsDownloading(true);
    toast({ title: "Preparing Download", description: "Collecting and organizing documents..." });
    try {
      const userDocuments = allDocuments.filter(doc => doc.director_id === task.individual_id);
      if (userDocuments.length === 0) { toast({ title: "No Documents", description: "No documents found for this applicant to download.", variant: "default" }); setIsDownloading(false); return; }
      const zip = new JSZip(); const bucketName = 'kyc-documents';
      const jobLevel = getTaskHierarchy(task)?.subclass?.name || getTaskHierarchy(task)?.class?.name || getTaskHierarchy(task)?.subdepartment?.name || 'Unknown';
      const folderName = `${task.applicant_name || 'Applicant'} - ${jobLevel}`;
      const documentStageMap = new Map();
      stages.forEach(stage => { if (stage.documents && stage.documents.length > 0) stage.documents.forEach(stageDoc => documentStageMap.set(stageDoc.kycId, stage.name)); });
      const downloadPromises = userDocuments.map(async (doc, index) => {
        if (!doc.file_path) return;
        const filePath = doc.file_path.startsWith(bucketName) ? doc.file_path : `${bucketName}/${doc.file_path}`;
        const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
        const originalFileName = doc.file_path.split('/').pop() || 'document'; const fileExtension = originalFileName.split('.').pop(); let newFileName = originalFileName;
        if (doc.document_id) {
          const stageName = documentStageMap.get(doc.document_id);
          if (stageName) {
            newFileName = `${stageName}.${fileExtension}`;
            let counter = 1;
            while (Array.from(zip.folder(folderName)?.files || {}).some(file => file.includes(newFileName))) { newFileName = `${stageName}_${counter}.${fileExtension}`; counter++; }
          }
        }
        try {
          const response = await fetch(fileUrl);
          if (!response.ok) return;
          const blob = await response.blob();
          zip.folder(folderName)?.file(newFileName, blob);
        } catch (error) { console.error(`Error downloading file ${originalFileName}:`, error); }
      });
      await Promise.all(downloadPromises);
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${folderName}.zip`);
      toast({ title: "Download Started", description: `Downloading ${folderName}.zip with organized documents.` });
    } catch (error) {
      console.error("Error creating ZIP file:", error);
      toast({ title: "Error", description: "Failed to create ZIP file.", variant: "destructive" });
    } finally { setIsDownloading(false); }
  }, [allDocuments, getTaskHierarchy, stages]);

  const enhancedHandleStageStatusSave = useCallback(async (
    stageId: string,
    taskId: string,
    value: string,
    { extractedData, documentId, ...rest } = {} as {
      extractedData?: Record<string, any>,
      documentId?: string,
      [key: string]: any
    }
  ) => {
    try {
      const task = tasks.find(t => t.id.toString() === taskId.toString());
      if (!task) {
        console.error('❌ Task not found in local state');
        return;
      }

      // 1. Define Priority Levels
      const STATUS_PRIORITY: Record<string, number> = {
        'pending': 0,
        'new': 0,
        'enquiry': 0,
        'in_progress': 1,
        'write_up_completed': 2,
        'endorsed': 3
      };

      // 2. Map Stage IDs to Target Statuses
      const STAGE_STATUS_MAPPING: Record<string, string> = {
        'a19b270e-6d1e-4e6d-b2bc-f21db72cde08': 'in_progress',       // Start / In Progress
        '072b9710-45df-4a05-ba65-01b4ef29d61d': 'write_up_completed', // Write Up Completed
        '6625f6d2-8017-4bf4-96c2-85335703164c': 'endorsed',          // Endorsement
        'caefd742-5de5-4341-a3bb-81d7b9dd2b73': 'endorsed'           // Endorsement (Alternative)
      };

      // 3. Normalize Status Strings for Comparison
      const normalizeStatus = (s: string | null | undefined) => {
        if (!s) return 'pending';
        return s.toLowerCase().trim().replace(/[\s-]/g, '_');
      };

      let statusValue = value;
      let updatedExtractedDetails = rest;

      if (typeof value === 'object' && value !== null) {
        // If value is an object, it's the extracted data
        extractedData = value;
        statusValue = 'completed';
      } else if (rest && typeof rest === 'object') {
        // Handle the case where extractedData is in the rest parameter
        updatedExtractedDetails = rest;
      }

      const currentStatusRaw = task.status;
      const currentStatusKey = normalizeStatus(currentStatusRaw);
      const potentialNewStatus = STAGE_STATUS_MAPPING[stageId.toLowerCase()];
      const isSkipped = updatedExtractedDetails?.status === 'skipped';

      let taskStatusUpdate = {};
      const timestamp = new Date().toISOString();


      // 4. Determine if Status Should Update (only for completed stages, not skipped)
      if (potentialNewStatus && !isSkipped) {
        const currentPriority = STATUS_PRIORITY[currentStatusKey] ?? 0;
        const newPriority = STATUS_PRIORITY[potentialNewStatus] ?? 0;

        if (newPriority > currentPriority) {
          taskStatusUpdate = { status: potentialNewStatus };
        }
      }

      const stageUpdate: any = {
        ...task.stages?.[stageId],
        date: statusValue, // Use statusValue instead of value
        updatedAt: timestamp
      };

      // Handle extracted data if provided
      if (extractedData && Object.keys(extractedData).length > 0) {
        stageUpdate.extractedData = extractedData;
        stageUpdate.extracted_at = timestamp;

        // Save extracted data to the document if documentId is provided
        if (documentId) {
          const { error: docError } = await supabase
            .from('acc_portal_directors_documents')
            .update({
              extracted_details: extractedData,
              updated_at: timestamp
            })
            .eq('id', documentId);

          if (docError) {
            console.error('Error updating document extracted details:', docError);
            throw new Error('Failed to update document with extracted data');
          }
        }
      }
      if (isSkipped) {
        stageUpdate.status = 'skipped';
        stageUpdate.skippedAt = updatedExtractedDetails.skippedAt || timestamp;
        stageUpdate.skippedBy = updatedExtractedDetails.skippedBy || 'system';
        stageUpdate.reason = updatedExtractedDetails.reason || 'Not specified';
      } else {
        stageUpdate.status = 'completed';
        stageUpdate.completedAt = timestamp;
      }

      const updatedStages = {
        ...task.stages,
        [stageId]: stageUpdate
      };

      // Calculate current stage for metadata
      const currentStage = determineCurrentStage({ ...task, stages: updatedStages }, stages);

      // 6. Build Payload
      const updateData: any = {
        ...taskStatusUpdate,
        stages: updatedStages,
        updated_at: timestamp
      };

      // 7. Execute Update
      const { error } = await supabase
        .from('tm_tasks')
        .update(updateData)
        .eq('id', taskId);

      if (error) throw error;

      // 8. Refresh Data
      await loadTasksData(activeDepartmentTab, activeSubdepartmentTab);

      const successMessage = isSkipped
        ? 'Stage marked as skipped'
        : ('status' in taskStatusUpdate)
          ? `Stage completed & Status updated to ${taskStatusUpdate.status?.replace(/_/g, ' ')}`
          : 'Stage completed';

      toast({ title: "Success", description: successMessage });

    } catch (error) {
      console.error('❌ Error in enhancedHandleStageStatusSave:', error);
      toast({
        title: "Error",
        description: "Failed to update stage status.",
        variant: "destructive"
      });
    }
  }, [tasks, stages, determineCurrentStage, loadTasksData, activeDepartmentTab, activeSubdepartmentTab]);

  const generateEnhancedTableRows = useCallback(async (tasks: UtilTask[]) => {
    if (!tasks.length) return [];

    console.log('Generating table rows with stages:', {
      allStages: stages?.map(s => ({ id: s.id, name: s.name, status: s.status })),
      visibleStageIds: Array.from(visibleStageIds),
      showNAStages
    });

    // Filter stages based on visibility
    const allStages = stages
      .filter(stage => stage && visibleStageIds.has(stage.id.toString()))
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

    console.log('Final filtered stages:', allStages.map(s => ({ id: s.id, name: s.name })));
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
            const applicableStages = allStages.filter(stage => {
              if (!task || !departments.length) return false;
              const dept = departments.find(d => d.id === task.department?.id);
              if (!dept) return false;
              return true; // Simplified - actual logic is now in EditableStageCell
            });
            const completedStages = applicableStages.filter(stage => task.stages?.[stage.id]?.status === 'write_up_completed');
            return `${completedStages.length}/${applicableStages.length}`;
          }
        })
      }
      if (visibleStats.has('stats_pending')) {
        rows.push({
          key: 'stats_pending',
          label: 'Pending Stages',
          type: 'stat',
          getValue: (task: any) => {
            const applicableStages = allStages.filter(stage => {
              if (!task || !departments.length) return false;
              const dept = departments.find(d => d.id === task.department?.id);
              if (!dept) return false;
              return true; // Simplified - actual logic is now in EditableStageCell
            });
            const pendingStages = applicableStages.filter(stage => !task.stages?.[stage.id] || task.stages?.[stage.id]?.status === 'pending');
            return `${pendingStages.length}/${applicableStages.length}`;
          }
        })
      }
      if (visibleStats.has('stats_na')) {
        rows.push({
          key: 'stats_na',
          label: 'N/A Stages',
          type: 'stat',
          getValue: (task: any) => {
            const totalStages = allStages.length;
            const applicableStages = allStages.filter(stage => {
              if (!task || !departments.length) return false;
              const dept = departments.find(d => d.id === task.department?.id);
              if (!dept) return false;
              return true; // Simplified - actual logic is now in EditableStageCell
            });
            const naStages = totalStages - applicableStages.length;
            return `${naStages}/${totalStages}`;
          }
        })
      }
    }

    // Stages Section
    rows.push({ key: 'section_header_stages', type: 'section_header', label: 'Stages', id: 'stages', icon: Briefcase });

    if (expandedSections.has('stages')) {
      for (const stage of allStages) {
        const isApplicableToAnyTask = tasks.some(task => isStageApplicableToTask(stage, task, departments));

        if (showNAStages || isApplicableToAnyTask) {
          rows.push({
            key: `stage_${stage.id}`,
            label: `${stage.name}`,
            type: 'stage',
            stage,
            stageId: stage.id,
            stageOrder: stage.order_num || 0,
            getValue: (task: UtilTask) => isStageApplicableToTask(stage, task, departments) ? task.stages?.[stage.id] : 'N/A'
          });

          if (expandedStages.has(stage.id) && stage.documents && stage.documents.length > 0) {
            for (const doc of stage.documents) {
              const kycData = kycDocuments.get(doc.kycId);
              const docDisplayName = kycData?.display_name || kycData?.name || doc.display_name || doc.name || 'Document';

              // Add the document row
              rows.push({
                key: `doc_${stage.id}_${doc.id}`,
                label: docDisplayName,
                type: 'document',  // Ensure type is 'document'
                stage,
                document: {
                  ...doc,
                  stageId: stage.id,
                  document_id: doc.kycId,
                  name: docDisplayName
                },
                isSubRow: true,
                getValue: (task: UtilTask) => {
                  // Check if stage is applicable to this task
                  if (!isStageApplicableToTask(stage, task, departments)) {
                    return 'N/A';
                  }

                  // Get all linked documents for this task and stage
                  const linkedDocuments = task.source_document_id?.[stage.id];
                  // Ensure linkedDocuments is an array before calling find
                  const documentsArray = Array.isArray(linkedDocuments)
                    ? linkedDocuments
                    : linkedDocuments ? [linkedDocuments] : [];

                  // Find if this specific document is linked
                  const linkedDocument = documentsArray.find(
                    (d: any) => d.document_id === doc.kycId
                  );

                  // Check if document is applicable to this task
                  const isApplicable = isDocumentApplicable(doc, task);

                  // If document is not applicable, return N/A
                  if (!isApplicable) {
                    return 'N/A';
                  }

                  // Document is applicable, check if it has an indicator
                  const hasIndicator = linkedDocument?.indicator === true;

                  return {
                    hasDocument: !!linkedDocument,
                    hasIndicator,
                    isApplicable: true,
                    status: hasIndicator
                      ? 'Preview Not Available'
                      : (linkedDocument ? 'Linked' : 'Not Linked')
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
                        if (!isStageApplicableToTask(stage, task, departments)) return 'N/A'

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
    }

    rows.push({ key: 'section_header_actions', type: 'section_header', label: 'Actions', id: 'actions', icon: Pencil })

    if (expandedSections.has('actions')) {
      rows.push({ key: 'actions_row', type: 'actions', label: 'Actions', id: 'actions' })
    }

    return rows
  }, [stages, expandedSections, expandedStages, expandedDocuments, getKycFields, visibleStats, kycDocuments, allDocuments, visibleStageIds, getDocumentForTaskStage, departments])

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

    // INCREMENT KEY TO FORCE FRESH INSTANCE
    setStageDialogKey(prev => prev + 1);
    setIsStageUploadDialogOpen(true)
  }, [departments])

  const handleDeleteDocument = useCallback(async (documentId: string) => {
    try {
      toast({
        title: 'Success',
        description: 'Document deleted successfully',
        variant: 'default',
      });

      // Close the preview
      setPreviewDocument(null);

      // Refresh the tasks to update the UI
      await loadTasksData(activeDepartmentTab, activeSubdepartmentTab);
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete document',
        variant: 'destructive',
      });
    }
  }, [activeDepartmentTab, activeSubdepartmentTab, loadTasksData]);

  const handleViewDocument = useCallback(async (task: any, stage: any) => {
    try {
      const linkedDocs = getDocumentForTaskStage(task, stage);

      if (linkedDocs.length === 0) {
        toast({
          title: 'No Linked Document',
          description: `No document has been linked for this stage yet. Please use the 'Link' button to link a document first.`,
          variant: 'default',
        });
        return;
      }

      // Use the first linked document for preview
      const document = linkedDocs[0];

      if (document.indicator === true) {
        toast({
          title: 'Preview not available',
          description: 'Document preview is not available for this document.',
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
        },
        onDelete: () => handleDeleteDocument(document.id)
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

  const renderCellContent = useCallback((row: any, task: any, columnType?: 'date' | 'actions') => {
    const value = row.getValue?.(task) ?? '';

    // Early return for N/A values
    if (value === 'N/A' || (typeof value === 'object' && value?.status === 'N/A')) {
      return <span className="text-sm text-gray-400 italic">N/A</span>;
    }

    // Handle document object with hasDocument, hasIndicator, and status
    if (typeof value === 'object' && value !== null && 'hasDocument' in value) {
      const { hasDocument, hasIndicator, status, isApplicable, documentInfo } = value;

      // If document is not applicable, show N/A
      if (isApplicable === false) {
        return <span className="text-sm text-gray-400 italic">N/A</span>;
      }

      const statusContent = (
        <div className="flex items-center gap-1">
          {hasDocument ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <span className={`text-sm ${hasDocument ? 'text-blue-600 hover:underline cursor-pointer' : 'text-slate-700'}`}>
            {status}
          </span>
        </div>
      );

      // Only show popover for linked documents with additional info
      if (hasDocument && documentInfo) {
        return (
          <Popover>
            <PopoverTrigger asChild>
              {statusContent}
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-2">
                <h4 className="font-medium leading-none">Document Details</h4>
                <div className="text-sm text-muted-foreground">
                  {documentInfo.name && <p><span className="font-medium">Name:</span> {documentInfo.name}</p>}
                  {documentInfo.type && <p><span className="font-medium">Type:</span> {documentInfo.type}</p>}
                  {documentInfo.uploadedAt && (
                    <p><span className="font-medium">Uploaded:</span> {new Date(documentInfo.uploadedAt).toLocaleDateString()}</p>
                  )}
                  {documentInfo.size && (
                    <p><span className="font-medium">Size:</span> {formatFileSize(documentInfo.size)}</p>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        );
      }

      return statusContent;
    }

    // Handle stage data display with columnType
    if (row.type === 'stage' && row.stage) {
      return renderEditableStageCell(row, task, columnType || 'date');
    }
    // Handle field type
    if (row.type === 'field') {
      return renderFieldContent(row, value);
    }

    // Handle different row types
    switch (row.type) {
      case 'badge':
      case 'stat':
        return <span className="text-sm font-semibold">{value}</span>;

      case 'date':
        return <span className="text-sm text-slate-600">{formatDateValue(value)}</span>;

      case 'actions':
        return renderActionButtons(row, task);

      default:
        return <span className="text-sm text-slate-800">{value}</span>;
    }
  }, [
    handleStageDocumentUpload,
    handleViewDocument,
    onTaskAction,
    handleTaskEdit,
    enhancedHandleStageStatusSave,
    allDocuments,
    handlePushCase,
    handleDownloadZip,
    isPushingCase,
    isDownloading,
    getKycFields
  ]);

  const renderEditableStageCell = (row: any, task: any, renderMode: 'date' | 'actions' = 'date') => {
    const requiresUpload = row.stage?.requires_upload !== false;
    const linkedDocs = getDocumentForTaskStage(task, row.stage);
    const stageData = task.stages?.[row.stage.id];
    const cellValue = stageData?.date || stageData?.status || null;

    return (
      <EditableStageCell
        key={`${row.stage.id}-${renderMode}`}
        stage={row.stage}
        task={task}
        value={cellValue}
        onSave={enhancedHandleStageStatusSave}
        onDocumentUpload={handleStageDocumentUpload}
        onShowDocuments={handleViewDocument}
        requiresUpload={requiresUpload}
        departments={departments}
        onAutomationClick={(e) => handleAutomationClick(e, row.stage, task.id)}
        getKycFields={getKycFields}
        linkedDocuments={linkedDocs}
        renderMode={renderMode}
        taskName={task.name}
        clientName={task.client_name || task.clientName}
        onFetchData={() => loadTasksData(activeDepartmentTab, activeSubdepartmentTab)}
      />
    );
  };

  const renderFieldContent = (row: any, value: any) => {
    const fieldValue = typeof value === 'object' ? value.value : value;
    const isOldDoc = typeof value === 'object' && value.isOldDocument;

    if (row.field?.fieldType?.toLowerCase() === 'date') {
      const formattedDate = formatDateValue(fieldValue);
      return (
        <div className="flex items-center gap-1">
          <span className="text-sm text-slate-700" title={formattedDate}>
            {formattedDate}
          </span>
          {isOldDoc && (
            <AlertTriangle
              className="h-3 w-3 text-orange-500"
              title="Document is older than task creation"
            />
          )}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1">
        <span className="text-sm text-gray-700">{fieldValue}</span>
        {isOldDoc && (
          <AlertTriangle
            className="h-3 w-3 text-orange-500"
            title="Document is older than task creation"
          />
        )}
      </div>
    );
  };

  const renderActionButtons = (row: any, task: any) => {
    return (
      <div className="flex items-center justify-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleTaskEdit(task)}
          className="h-8 w-8 text-blue-600 hover:bg-blue-100"
          title="Edit Task"
        >
          <Edit className="h-4 w-4" />
        </Button>

        <DeleteButton task={task} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-600 hover:bg-slate-100"
              title="More Actions"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <ActionMenuItems task={task} />
        </DropdownMenu>
      </div>
    );
  };

  const DeleteButton = ({ task }: { task: any }) => {
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const handleDelete = async () => {
      try {
        setIsDeleting(true);

        const { error } = await supabase
          .from('tm_tasks')
          .delete()
          .eq('id', task.id);

        if (error) throw error;

        setTasks(prevTasks => prevTasks.filter(t => t.id !== task.id));
        toast({
          title: 'Success',
          description: 'Task deleted successfully',
          variant: 'default'
        });
      } catch (error) {
        console.error('Error deleting task:', error);
        toast({
          title: 'Error',
          description: 'Failed to delete task. Please try again.',
          variant: 'destructive'
        });
      } finally {
        setIsDeleting(false);
        setDeleteDialogOpen(false);
      }
    };

    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            setDeleteDialogOpen(true);
          }}
          className="h-8 w-8 text-red-600 hover:bg-red-100"
          title="Delete Task"
          disabled={isDeleting}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <DeleteConfirmationDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDelete}
          loading={isDeleting}
        />
      </>
    );
  };

  const ActionMenuItems = ({ task }: { task: any }) => {
    return (
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
        <DropdownMenuItem
          onClick={() => handleDownloadZip(task)}
          disabled={isDownloading}
        >
          <DownloadCloud className="mr-2 h-4 w-4" /> Download Docs
        </DropdownMenuItem>
      </DropdownMenuContent>
    );
  };

  const handleAutomationClick = (e: React.MouseEvent, stage: any, taskId: string) => {
    e.stopPropagation();
    if (stage.automation) {
      setSelectedAutomation({
        ...stage.automation,
        stageId: stage.id,
        taskId
      });
      setAutomationDialogOpen(true);
    }
  };

  const loadRows = useCallback(async (tasks: any[]) => {
    if (!tasks || tasks.length === 0) return;
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
    }
  }, [generateEnhancedTableRows, toast]);

  const getSortedTasks = useCallback((tasksToRender: UtilTask[]) => {
    return sortTasks(tasksToRender, sortConfig, companies)
  }, [sortConfig, companies])

  const getCellContentWrapper = useCallback((task: any, headerId: string) => {
    return utilGetCellContent(
      departments,
      task,
      headerId,
      enhancedTasksData,
      taskDependants,
      expandedDependants,
      companies,
      getTaskHierarchy,
      getStaffName,
      getEnhancedImmigrationStatusWrapper,
      getCurrentStageStatusWrapper,
      (task) => renderImmigrationStatusCell(
        task,
        getEnhancedImmigrationStatusWrapper,
        expandedImmigrationStatus,
        (id) => {
          // Wrap the toggle in a function to prevent immediate execution
          toggleImmigrationStatusExpansion(id);
        }
      ),
      (task) => renderCurrentStageStatusCell(task, getCurrentStageStatusWrapper),
      (id) => {
        // Wrap the toggle in a function to prevent immediate execution
        toggleDependantsExpansion(id);
      },
      setLinkingTask,
      setIsLinkDialogOpen
    );
  }, [
    enhancedTasksData,
    taskDependants,
    expandedDependants,
    companies,
    getTaskHierarchy,
    getStaffName,
    getEnhancedImmigrationStatusWrapper,
    getCurrentStageStatusWrapper,
    expandedImmigrationStatus,
    toggleImmigrationStatusExpansion,
    toggleDependantsExpansion,
    setLinkingTask,
    setIsLinkDialogOpen
  ]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

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

  const handleNewEnquiryClick = () => {
    if (activeDepartmentTab === '1') {
      setIsEnquiryDialogOpen(true)
    } else {
      setIsOtherDialogOpen(true)
    }
  }

  const defaultSubdepartments = getDefaultSubdepartments()

  useEffect(() => {
    if (isTransposedView && tasks && tasks.length > 0) {
      loadRows(tasks);
    }
  }, [tasks, isTransposedView, loadRows]);

  useEffect(() => {
    if (stages && stages.length > 0) {
      // Show all stages if showNAStages is true, otherwise filter out N/A stages
      const applicableStages = showNAStages
        ? [...stages]
        : stages.filter(stage => !stage.status || stage.status !== 'N/A');

      console.log('Setting initial visible stages:', {
        allStages: stages.map(s => ({ id: s.id, name: s.name, status: s.status })),
        applicableStages: applicableStages.map(s => ({ id: s.id, name: s.name, status: s.status })),
        showNAStages
      });
      setVisibleStageIds(new Set(applicableStages.map(s => s.id.toString())));
    } else {
      setVisibleStageIds(new Set());
    }
  }, [stages, showNAStages])

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
      }
    };

    performInitialLoad();
  }, []);

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

  if (!departments.length) {
    return (
      <div className="flex-1 p-8 bg-slate-50/30 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-400 mx-auto"></div>
          <p className="text-slate-700">Loading departments...</p>
        </div>
      </div>
    )
  }

  const activeDept = departments.find(d => d.id.toString() === activeDepartmentTab);
  const activeSubDept = defaultSubdepartments.find(s => s.id.toString() === activeSubdepartmentTab);
  const activeStatus = {
    'enquiries': 'Enquiries',
    'wip-stages': 'WIP Stages',
    'write_up_completed': 'Write Up Completed',
    'endorsed': 'Endorsement Completed'
  }[activeSubTab] || '';

  let wipFilter = '';
  if (activeSubTab === 'wip-stages') {
    wipFilter = {
      'all': 'All Follow-ups',
      'bcl': 'BCL Follow-up',
      'officer': 'Officer Follow-up',
      'client': 'Client Follow-up'
    }[activeFollowUpFilter] || '';
  }

  const breadcrumbParts = [
    activeDept?.name,
    activeSubDept?.name || (defaultSubdepartments.length > 0 ? 'All Subdepartments' : null),
    activeStatus,
    (activeSubTab === 'wip-stages' ? wipFilter : null)
  ].filter(Boolean);

  return (
    <div className="flex-1 space-y-2 px-2 bg-slate-50/30 min-h-screen">
      <div className="flex justify-between items-center px-1">
        <h2 className="text-2xl font-bold text-slate-900">Task Manager</h2>
        {!areTabsVisible && (
          <div className="text-sm text-slate-600 font-medium flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-800">Viewing:</span>
            {breadcrumbParts.map((part, index) => (
              <React.Fragment key={index}>
                <span className="bg-slate-100 px-2 py-1 rounded-md">{part}</span>
                {index < breadcrumbParts.length - 1 && <ChevronRight className="h-4 w-4 text-slate-400" />}
              </React.Fragment>
            ))}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAreTabsVisible(!areTabsVisible)}
          className={`ml-auto transition-all ${!areTabsVisible ? 'bg-slate-100' : ''}`}
        >
          {areTabsVisible ? <PanelLeftClose className="h-4 w-4 mr-2" /> : <PanelLeftOpen className="h-4 w-4 mr-2" />}
          {areTabsVisible ? 'Hide Navigation' : 'Show Navigation'}
        </Button>
      </div>

      <Tabs value={activeDepartmentTab} onValueChange={setActiveDepartmentTab} className="space-y-2">
        {areTabsVisible && (
          <TabsList className="grid w-full rounded-lg p-1 shadow-sm" style={{ gridTemplateColumns: `repeat(${departments.length}, 1fr)` }}>
            {departments.map(dept => (
              <TabsTrigger key={dept.id} value={dept.id.toString()} className="text-sm font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                {dept.name}
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        {departments.map(dept => (
          <TabsContent key={dept.id} value={dept.id.toString()} className="space-y-4">
            {/* Subdepartment Tabs */}
            {areTabsVisible && defaultSubdepartments.length > 0 && (
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
              {areTabsVisible && (
                <TabsList className="rounded-lg p-1 shadow-sm">
                  <TabsTrigger value="enquiries" className="text-sm md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                    Enquiries <Badge variant="secondary">{enquiryTasks.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="wip-stages" className="text-sm md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                    WIP Stages <Badge variant="secondary">{wipTasks.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="write_up_completed" className="text-sm md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                    Write Up Completed <Badge variant="secondary">{completedTasks.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="endorsed" className="text-sm md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md rounded-md">
                    Endorsement Completed <Badge variant="secondary">{getFilteredTasks('endorsed').length}</Badge>
                  </TabsTrigger>
                </TabsList>
              )}

              {/* All Tabs Content */}
              {['enquiries', 'wip-stages', 'write_up_completed', 'endorsed'].map(tabValue => {
                const isWipTab = tabValue === 'wip-stages';
                let tasksToRender, title;
                if (tabValue === 'enquiries') { tasksToRender = enquiryTasks; title = 'Enquiries'; }
                else if (tabValue === 'wip-stages') { tasksToRender = wipTasks; title = 'WIP Stages'; }
                else if (tabValue === 'endorsed') { tasksToRender = getFilteredTasks('endorsed'); title = 'Endorsement Completed'; }
                else { tasksToRender = completedTasks; title = 'Write Up Completed'; }

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
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            {tabValue === 'enquiries' && (
                              <Button
                                className="flex items-center gap-2"
                                onClick={handleNewEnquiryClick}
                              >
                                <Plus className="h-4 w-4" />
                                New Enquiry
                              </Button>
                            )}
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

                            {isTransposedView && !activeReport && (
                              <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => isAllExpanded ? collapseAll() : expandAll()}>
                                {isAllExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                {isAllExpanded ? 'Collapse All' : 'Expand All'}
                              </Button>
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
                              <PopoverContent className="w-80 h-[65vh] overflow-y-auto">
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
                                    {currentTableHeaders.map((header) => (
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
                                        setVisibleHeaders(new Set(currentTableHeaders.filter(h => h.default).map(h => h.id)))
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
                                        setVisibleHeaders(new Set(currentTableHeaders.map(h => h.id)))
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

                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-2"
                              onClick={() => setShowNAStages(!showNAStages)}
                            >
                              {showNAStages ? (
                                <>
                                  <EyeOff className="h-4 w-4" /> Hide N/A Stages
                                </>
                              ) : (
                                <>
                                  <Eye className="h-4 w-4" /> Show N/A Stages
                                </>
                              )}
                            </Button>

                            <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => handleExport(tasksToRender, title)}>
                              <Download className="h-4 w-4" />Export to Excel
                            </Button>

                            <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={refreshAllData}>
                              <RotateCcw className="h-4 w-4" />Refresh
                            </Button>
                          </div>
                        </div>

                        {/* {isWipTab && areTabsVisible && (
                            <div className="space-y-4 pt-4">
                              <Tabs value={activeFollowUpFilter} onValueChange={setActiveFollowUpFilter}>
                                <TabsList className="rounded-lg p-1 shadow-sm bg-slate-100">
                                  <TabsTrigger value="all" className="text-sm md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">All <Badge variant="outline">{wipTasks.length}</Badge></TabsTrigger>
                                  <TabsTrigger value="bcl" className="text-sm md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">BCL <Badge variant="outline">{getWIPTasksByFollowUp('bcl').length}</Badge></TabsTrigger>
                                  <TabsTrigger value="officer" className="text-sm md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">Officers <Badge variant="outline">{getWIPTasksByFollowUp('officer').length}</Badge></TabsTrigger>
                                  <TabsTrigger value="client" className="text-sm md:text-sm gap-2 font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:shadow-sm rounded-md">Client <Badge variant="outline">{getWIPTasksByFollowUp('client').length}</Badge></TabsTrigger>
                                </TabsList>
                              </Tabs>

                              {(activeFollowUpFilter === 'bcl' || activeFollowUpFilter === 'officer') && activeSubdepartmentTab && (
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                  {renderStaffTabs()}
                                </div>
                              )}
                            </div>
                          )} */}
                      </CardHeader>
                      <CardContent className="p-2 sm:p-4">
                        {isTransposedView ? (
                          <EnhancedTable
                            departments={departments}
                            tasks={tasksToRender}
                            tableType={title}
                            ENHANCED_TABLE_HEADERS_IMMIGRATION={currentTableHeaders}
                            visibleHeaders={visibleHeaders}
                            taskDependants={taskDependants}
                            expandedDependants={expandedDependants}
                            expandedSections={expandedSections}
                            companies={companies}
                            tableRows={tableRows}
                            loading={false}
                            error={error}
                            kycDocuments={kycDocuments}
                            getCellContent={getCellContentWrapper}
                            renderCellContent={renderCellContent}
                            toggleSectionExpansion={toggleSectionExpansion}
                            toggleStageExpansion={toggleStageExpansion}
                            toggleDocumentExpansion={toggleDocumentExpansion}
                            getTaskHierarchy={getTaskHierarchy}
                            getStaffName={getStaffName}
                            onDocumentPreview={async (doc) => {
                              console.log('Document preview clicked:', doc);
                              setPreviewDocument(doc);

                              // If there's a document ID, try to fetch the extracted data
                              if (doc.document_id) {
                                try {
                                  const { data: extractionData, error } = await supabase
                                    .from('document_extractions')
                                    .select('extracted_data')
                                    .eq('document_id', doc.document_id)
                                    .single();

                                  if (extractionData?.extracted_data) {
                                    setExtractedData(extractionData.extracted_data);
                                  } else {
                                    setExtractedData({});
                                  }
                                } catch (error) {
                                  console.error('Error fetching extraction data:', error);
                                  setExtractedData({});
                                }
                              } else {
                                setExtractedData({});
                              }

                              setIsDocumentPreviewOpen(true);
                            }}
                            onDeleteTask={async (task) => {
                              try {
                                setIsDeleting(true);

                                const { error } = await supabase
                                  .from('tm_tasks')
                                  .delete()
                                  .eq('id', task.id);

                                if (error) throw error;

                                // Update tasks list by removing the deleted task
                                setTasks(prevTasks => prevTasks.filter(t => t.id !== task.id));

                                toast({
                                  title: 'Success',
                                  description: 'Task deleted successfully',
                                  variant: 'default'
                                });

                              } catch (error) {
                                console.error('Error deleting task:', error);
                                toast({
                                  title: 'Error',
                                  description: 'Failed to delete task. Please try again.',
                                  variant: 'destructive'
                                });
                              } finally {
                                setIsDeleting(false);
                              }
                            }}
                          />
                        ) : (

                          <StandardTable
                            departments={departments}
                            tasks={tasksToRender}
                            tableType={title}
                            ENHANCED_TABLE_HEADERS_IMMIGRATION={currentTableHeaders}
                            stages={stages}
                            companies={companies}
                            visibleHeaders={visibleHeaders}
                            visibleStageIds={visibleStageIds}
                            expandedStages={expandedStages}
                            expandedDocuments={expandedDocuments}
                            expandedDependants={expandedDependants}
                            taskDependants={taskDependants}
                            kycDocuments={kycDocuments}
                            allDocuments={allDocuments}
                            sortConfig={sortConfig}
                            error={error}
                            isPushingCase={isPushingCase}
                            isDownloading={isDownloading}
                            enhancedTasksData={enhancedTasksData}
                            getCellContent={getCellContentWrapper}
                            getSortedTasks={getSortedTasks}
                            getDocumentForTaskStage={getDocumentForTaskStage}
                            getTaskHierarchy={getTaskHierarchy}
                            getStaffName={getStaffName}
                            requestSort={requestSort}
                            handleTaskEdit={handleTaskEdit}
                            handleStageDocumentUpload={handleStageDocumentUpload}
                            handleViewDocument={handleViewDocument}
                            handlePushCase={handlePushCase}
                            handleDownloadZip={handleDownloadZip}
                            onTaskAction={onTaskAction}
                            enhancedHandleStageStatusSave={enhancedHandleStageStatusSave}
                            getKycFields={getKycFields}
                            toggleStageExpansion={toggleStageExpansion}
                            toggleDocumentExpansion={toggleDocumentExpansion}
                          />
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                );
              })}
            </Tabs>
          </TabsContent>
        ))}
      </Tabs>
      {activeDepartmentTab === '1' ? (
        <EnquiryDialog
          open={isEnquiryDialogOpen}
          onOpenChange={setIsEnquiryDialogOpen}
          onEnquiryCreated={handleEnquiryCreated}
          departments={departments}
          users={Array.from(tmUsers.values())}
          officers={Array.from(tmUsers.values()).filter(u => u.role === 'officer')}
        />
      ) : (
        <OtherDialog
          open={isOtherDialogOpen}
          onOpenChange={setIsOtherDialogOpen}
          onEnquiryCreated={handleEnquiryCreated}
          departments={departments}
          users={Array.from(tmUsers.values())}
          officers={Array.from(tmUsers.values()).filter(u => u.role === 'officer')}
        />
      )}
      <EditTaskDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        task={editingTask}
        departments={departments}
        users={Array.from(tmUsers.values())}
        officers={Array.from(tmUsers.values()).filter(u => u.role === 'officer')}
        allDocuments={allDocuments}
        onTaskUpdate={handleTaskUpdate}
      />

      <StageUploadDialog
        key={stageDialogKey} // <--- THIS IS THE CRITICAL FIX
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
              fileName={previewDocument.fileName}
              extractedData={previewDocument.extractedData || {}}
              fields={previewDocument.fields || []}
              // Handle data changes
              onDataChange={(field, value) => {
                console.log(`Field ${field} updated to:`, value);
                // Optional: Update local preview state if needed
              }}
              // Handle Deletion - explicitly pass the handler
              onDelete={async (doc) => {
                try {
                  const docId = previewDocument.documentId || previewDocument.id;
                  if (docId) {
                    await handleDeleteDocument(docId);
                    setPreviewDocument(null);
                    setIsDocumentPreviewOpen(false);
                  }
                } catch (error) {
                  console.error('Error deleting document:', error);
                  // toast is handled in handleDeleteDocument or ExtractionPreview wrapper
                }
              }}
              // Handle Retry - explicitly pass the handler
              onRetryExtraction={async (doc) => {
                try {
                  const docId = previewDocument.documentId || previewDocument.id;
                  if (docId) {
                    handleTaskAction({
                      type: 'retry-extraction',
                      documentId: docId,
                      taskId: previewDocument.taskId
                    });
                    toast({ title: "Processing", description: "Retry extraction request sent." });
                  }
                } catch (error) {
                  console.error('Error retrying extraction:', error);
                  toast({ title: "Error", description: "Failed to retry extraction", variant: "destructive" });
                }
              }}
              // Handle Save
              onSave={async (data) => {
                try {
                  // Add your save logic here. Example:
                  // await supabase.from('extracted_data').update(data).eq('id', previewDocument.documentId);
                  console.log('Saving document data:', data);
                  toast({ title: "Success", description: "Document details saved." });
                  // Optionally close preview
                  // setPreviewDocument(null); 
                } catch (error) {
                  console.error('Error saving document:', error);
                  toast({ title: "Error", description: "Failed to save document", variant: "destructive" });
                }
              }}
              file={previewDocument.file}
              type={previewDocument.type}
              expanded={true}
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
            {(selectedTaskForPush?.applicantAge === null || selectedTaskForPush?.applicantAge === undefined) ? (
              <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-yellow-400" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                      Age verification required for applicant: <strong>{selectedTaskForPush?.task.applicant_name}</strong>
                      <br />
                      Please update the applicant's date of birth in the case details before selecting a class.
                      <br />
                      <span className="text-xs text-gray-600">
                        Current DOB: {selectedTaskForPush?.task.date_of_birth || 'Not specified'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <h4 className="font-medium text-sm">
                  Class for Applicant: {selectedTaskForPush?.task.applicant_name}
                  <span className="text-muted-foreground font-normal"> (Age: {selectedTaskForPush?.applicantAge})</span>
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
                        <div className={`w-4 h-4 rounded-full border-2 ${selectedTaskForPush?.applicantClassId === classItem.id.toString()
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
            )}

            {/* Dependants Class Selection */}
            {(() => {
              const taskDeps = taskDependants.get(selectedTaskForPush?.task.id.toString() || '') || [];
              // Only include dependants with known age >= 18
              const adultDependants = taskDeps.filter(dep => dep.age !== null && dep.age >= 18);
              const unknownAgeDependants = taskDeps.filter(dep => dep.age === null);

              return (
                <div className="space-y-6">
                  {/* Known Adult Dependants */}
                  {adultDependants.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm border-b pb-1">
                        Adult Dependants
                      </h4>
                      {adultDependants.map((dependant, index) => (
                        <div key={`adult-${dependant.id}`} className="space-y-2">
                          <div className="font-medium text-sm">
                            {dependant.full_name} (Age: {dependant.age})
                          </div>
                          <div className="grid gap-2 pl-4">
                            {availableClasses.map((classItem) => (
                              <Button
                                key={`adult-${dependant.id}-${classItem.id}`}
                                variant="outline"
                                className="w-full justify-start h-auto p-3 text-left"
                                onClick={() => {
                                  setSelectedTaskForPush(prev => {
                                    if (!prev) return null;
                                    const updatedDependantClasses = new Map(prev.dependantClasses || new Map());
                                    updatedDependantClasses.set(dependant.id, classItem.id.toString());
                                    return { ...prev, dependantClasses: updatedDependantClasses };
                                  });
                                }}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-4 h-4 rounded-full border-2 ${selectedTaskForPush?.dependantClasses?.get(dependant.id) === classItem.id.toString()
                                    ? 'bg-orange-500 border-orange-500'
                                    : 'border-gray-300'
                                    }`}>
                                    {selectedTaskForPush?.dependantClasses?.get(dependant.id) === classItem.id.toString() && (
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
                      ))}
                    </div>
                  )}

                  {/* Unknown Age Dependants */}
                  {unknownAgeDependants.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm text-amber-600 border-b border-amber-200 pb-1">
                        Dependants with Unknown Age
                      </h4>
                      <div className="text-sm text-amber-700 bg-amber-50 p-3 rounded-md">
                        <p className="font-medium mb-2">Age Verification Required</p>
                        <p>Please verify the age for these dependants before proceeding:</p>
                        <ul className="list-disc pl-5 mt-1 space-y-1">
                          {unknownAgeDependants.map(dep => (
                            <li key={`unknown-${dep.id}`}>
                              {dep.full_name} (Age not specified)
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              );
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
                  const adultDependants = (taskDependants.get(selectedTaskForPush.task.id.toString()) || [])
                    .filter(dep => dep.age !== null && dep.age >= 18);
                  const anyAdultWithoutClass = adultDependants.some(dep =>
                    !selectedTaskForPush?.dependantClasses?.has(dep.id)
                  );
                  const unknownAgeDependants = (taskDependants.get(selectedTaskForPush.task.id.toString()) || [])
                    .filter(dep => dep.age === null);
                  const isPushDisabled =
                    selectedTaskForPush?.applicantAge === null ||
                    !selectedTaskForPush?.applicantClassId ||
                    anyAdultWithoutClass ||
                    unknownAgeDependants.length > 0;
                  if (!isPushDisabled) {
                    await executePushCase(
                      selectedTaskForPush.task,
                      selectedTaskForPush.targetDeptId,
                      selectedTaskForPush.targetSubDeptId,
                      selectedTaskForPush.targetSubDeptName,
                      selectedTaskForPush.applicantClassId || null,
                      selectedTaskForPush.dependantClassId || selectedTaskForPush.applicantClassId || null
                    );
                  }
                  setSelectedTaskForPush(null);
                }
              }}
              disabled={
                !selectedTaskForPush ||
                selectedTaskForPush.applicantAge === null ||
                selectedTaskForPush.applicantAge === undefined ||
                !selectedTaskForPush.applicantClassId ||
                (() => {
                  const deps = taskDependants.get(selectedTaskForPush.task.id.toString()) || [];
                  // Check for any unknown age dependants
                  if (deps.some(dep => dep.age === null || dep.age === undefined)) return true;

                  // Check for adult dependants without selected classes
                  const adultDeps = deps.filter(dep => dep.age !== null && dep.age !== undefined && dep.age >= 18);
                  if (adultDeps.length === 0) return false;

                  return !selectedTaskForPush.dependantClasses ||
                    adultDeps.some(dep => !selectedTaskForPush.dependantClasses?.has(dep.id));
                })()
              }
            >
              Push Case
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
