// @ts-nocheck
"use client"

// Tailwind JIT safelist — classes below are dynamically constructed in status tabs / badge arrays
// bg-sky-600 bg-teal-600 bg-amber-500 bg-emerald-600 bg-violet-600 bg-red-600 bg-slate-800
// bg-sky-500 bg-teal-500 bg-amber-500 bg-emerald-500 bg-violet-500 bg-red-500
// bg-white/25 bg-custom-blue

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { unstable_batchedUpdates } from 'react-dom'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Settings, Search, X, TableProperties, RotateCcw, Edit, AlertCircle, Plus, Minus, Download, Trash2, ChevronDown, Send, DownloadCloud, Eye, FileText, Save, PanelLeftClose, PanelLeftOpen, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, EyeOff, CheckCircle2, XCircle, Briefcase, Loader2, LinkIcon, RefreshCw, UserPlus, LayoutGrid, Settings2, Clock, GitCompare, Lock as LockIcon, AlertTriangle } from "lucide-react"
import { DeleteConfirmationDialog } from "./components/DeleteConfirmationDialog"
import { CancelConfirmationDialog } from "./components/CancelConfirmationDialog"
import { EnquiryDialog } from "./components/EnquiryDialog"
import { format } from 'date-fns';
import { toast } from "@/lib/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { fetchDepartments } from "../departments/departments/database"
import { DepartmentTasksManagerProps } from "./components/types"
import { StageUploadDialog } from "./components/StageUploadDialog"
import { UploadModal } from "@/app/generic-components/UploadModal"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import { fetchTasks, fetchStages, fetchCompanies, fetchAllDocuments, invalidateAllDocumentsCache, fetchAllKycFields, fetchKycDocument, formatDateValue, type Task as UtilTask, type Department, type KycDocument, type Document, fetchTasksDuplicate, fetchDocumentWorkflowLogs, REQUIREMENTS_LOCK_STAGE_IDS, STAGE_TAB_LINKS, captureRequirementsDocumentsSnapshot, fetchUploadedDocumentsForTasks, getLinkedDocumentsForTaskStage } from "./utils/taskManagerData"
import { LinkSourceDocumentDialog } from './components/LinkSourceDocumentDialog';
import { StandardTable } from './overall-view/StandardTable';
import { EnhancedTable } from './overall-view/EnhancedTable';
import { ENHANCED_TABLE_HEADERS_IMMIGRATION, STATS_HEADERS, calculateAge, getEnhancedImmigrationStatus, getCurrentStageStatus, renderImmigrationStatusCell, renderCurrentStageStatusCell, getCellContent as utilGetCellContent, sortTasks, getStaffName, getEnhancedImmigrationStatusWrapper, getCurrentStageStatusWrapper, filterTasksBySearch, ENHANCED_TABLE_HEADERS, isDocumentApplicable, fetchAndEnhanceIndividuals, getRawCellValue, enhanceTasksWithIndividualData, STAGE_PRIORITY, stageApplicabilityConditionsMet, isStageOptionalForTask } from './overall-view/tableUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { OtherDialog } from "./components/OtherDialog"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import EditableStageCell from "./components/EditableStageCell"
import { NewCompanyInquiryDialog } from "./components/NewCompanyInquiryDialog"
import { ExtractionPreviewDialog } from "./components/ExtractionPreviewDialog"
import { ClassSelectionDialog } from "./components/ClassSelectionDialog"
import { AssignOfficersDialog } from "./components/AssignOfficersDialog"
import { SendRequirementsDialog } from "../tasks-requirements/components/SendRequirementsDialog"
import { resolveAutomationFieldData } from "../tasks-requirements/utils/resolveAutomationFieldData"
import { detectExistingWorkflowForIndividual, detectTaskConflictsForJobLevel, evaluateWorkflowRestrictionsForBundle, formatWorkflowRestrictionReason, taskBundleService } from "./utils/workflowBundleHelpers"
import { determineCurrentStage, getStageProgress } from './utils/stageUtils'
import { calculateStageDate } from './utils/dateUtils'
import { fetchUserAssignmentData, hasJobLevelAccess, getOfficerDisplayName, userService } from "@/lib/shared-user-assignment-service"
import { useCurrentUser, hasPermission } from "@/lib/hooks/use-current-user"
import { cn } from "@/lib/utils"
import {
  getCanonicalCurrentStage,
  getCurrentOfficerStage,
  getStageOfficerIds,
  taskHasStageOfficer,
  isTaskWithClient,
  computeStageDeltaDays,
} from "../reports/utils/reportStageLogic"

// Same terminal-status list summary-reports/page.tsx uses to scope its Department/Sub-department
// tab counts to the "live pipeline" — tasks that are still enquiry/WIP, not already wrapped up.
// tm_tasks is fetched per-department here (not all-at-once like Summary Reports), so counts for
// departments/sub-departments other than the currently active one can't be derived from the
// `tasks` state — they're fetched separately as a lightweight { job_level, status } scan.
const TERMINAL_STATUSES = ['write_up_completed', 'endorsed', 'completed', 'archived', 'cancel'];

export default function DepartmentTasksManager({ error, onTaskAction, handleStageStatusSave, onTaskUpdate, getCurrentRequirements, initialSearchTerm, initialDeptId, initialSubDeptId }: DepartmentTasksManagerProps) {
  // Gates the blanket "complete/skip stages in order" rule — superadmins and anyone explicitly
  // granted tasks.bypass_sequential_stages (toggled per role in the Access Control Matrix,
  // settings/access-controls) can update any stage at any time; everyone else must clear
  // (complete or skip) earlier applicable stages first. See EditableStageCell.tsx's
  // enforceStageOrder prop and enhancedHandleStageStatusSave's own save-time guard below.
  const { user: currentUser } = useCurrentUser();
  const enforceStageOrder = !hasPermission(currentUser, 'tasks.bypass_sequential_stages');
  const [departments, setDepartments] = useState<Department[]>([])
  const [companies, setCompanies] = useState<Map<number, { name: string; prefix: string }>>(new Map())
  const [activeDepartmentTab, setActiveDepartmentTab] = useState<string>("")
  const [activeSubTab, setActiveSubTab] = useState<string>("wip-stages")
  const [activeSubdepartmentTab, setActiveSubdepartmentTab] = useState<string>("")
  const initialSubDeptApplied = useRef(false)
  // Overview/Officers/Managers/Clients perspective — replaces the old activeFollowUpFilter
  // (All/BCL/Officer/Client) toggle, which had no live UI wired to it (setActiveFollowUpFilter
  // was never called outside its own useState default) and only worked within the WIP tab.
  // This applies across every status tab, same as reports/page.tsx's activePerspective.
  const [activePerspective, setActivePerspective] = useState<'overview' | 'officers' | 'managers' | 'clients'>('overview')
  const [officerFilterMode, setOfficerFilterMode] = useState<'current' | 'history'>('current')
  const [activeOfficerTab, setActiveOfficerTab] = useState<string>('all')
  const [taskManagerFilterMode, setTaskManagerFilterMode] = useState<'current' | 'history'>('current')
  const [activeTaskManagerTab, setActiveTaskManagerTab] = useState<string>('all')
  const [isTransposedView, setIsTransposedView] = useState<boolean>(true)
  const [showTime, setShowTime] = useState<boolean>(true)
  const [showDelta, setShowDelta] = useState<boolean>(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<any>(null)
  const [tasks, setTasks] = useState<UtilTask[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [allDocuments, setAllDocuments] = useState<Document[]>([])
  const [isEnquiryDialogOpen, setIsEnquiryDialogOpen] = useState(false)
  const [isOtherDialogOpen, setIsOtherDialogOpen] = useState(false)
  const [selectedStageTask, setSelectedStageTask] = useState<{ task: any, stage: any } | null>(null)
  const [isStageUploadDialogOpen, setIsStageUploadDialogOpen] = useState(false)
  const [reportDocUpload, setReportDocUpload] = useState<{
    task: any;
    reportDoc: any;
    entityType: 'principal' | 'dependant' | 'company';
    entityId: number | string;
    entityName: string;
  } | null>(null)
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
  const [isPushingCase, setIsPushingCase] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isLoadingTasks, setIsLoadingTasks] = useState(false)
  const [isRefreshingAllData, setIsRefreshingAllData] = useState(false)
  // Live-pipeline (non-terminal-status) task counts per department_id / subdepartment_id,
  // fetched independently of the per-department `tasks` state — see fetchLiveTaskCounts below.
  const [liveTaskCountsByDept, setLiveTaskCountsByDept] = useState<Record<string, number>>({})
  const [liveTaskCountsBySubdept, setLiveTaskCountsBySubdept] = useState<Record<string, number>>({})
  const [globalSearchTerm, setGlobalSearchTerm] = useState<string>(initialSearchTerm || '')
  const [currentTableHeaders, setCurrentTableHeaders] = useState(ENHANCED_TABLE_HEADERS)
  const [visibleHeaders, setVisibleHeaders] = useState<Set<string>>(new Set(ENHANCED_TABLE_HEADERS.filter(h => h.default).map(h => h.id)))
  const [visibleStats, setVisibleStats] = useState<Set<string>>(new Set(STATS_HEADERS.filter(h => h.default).map(h => h.id)))
  const [visibleStageIds, setVisibleStageIds] = useState<Set<string>>(new Set())
  const [showNAStages, setShowNAStages] = useState<boolean>(false);
  // Optional/branch stages (StageAllocation.display === false, e.g. "Deferred (Depends)") are
  // hidden from the transposed table by default unless a visible task already has data for
  // them (see the row-builder below) — this toggle overrides that, same convention as
  // showNAStages right above it.
  const [showOptionalStages, setShowOptionalStages] = useState<boolean>(false);
  const [showStats, setShowStats] = useState<boolean>(true);
  const [expandedDependants, setExpandedDependants] = useState<Set<string>>(new Set())
  const [kycDocuments, setKycDocuments] = useState<Map<string, KycDocument>>(new Map())
  const [allKycFields, setAllKycFields] = useState<Record<string, any[]>>({})
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())
  const [isDocumentPreviewOpen, setIsDocumentPreviewOpen] = useState(false);
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['case_details', 'stages', 'actions']))
  const [expandedImmigrationStatus, setExpandedImmigrationStatus] = useState<Set<string>>(new Set())
  const [activeReport, setActiveReport] = useState<any | null>(null);
  const [areTabsVisible, setAreTabsVisible] = useState(true);
  const [isAllExpanded, setIsAllExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [stageDialogKey, setStageDialogKey] = useState(0);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [enhancedCurrentPage, setEnhancedCurrentPage] = useState(1);
  const [enhancedColumnsPerPage, setEnhancedColumnsPerPage] = useState(10);
  const [enhancedTotalColumns, setEnhancedTotalColumns] = useState(0);
  const enhancedTableRef = useRef<any>(null);
  const realtimeSubscriptionRef = useRef<any>(null);
  const [reportDocDefaults, setReportDocDefaults] = useState<any[]>([]);
  const [allIndividualDocuments, setAllIndividualDocuments] = useState<Record<number, any[]>>({});
  const [allCompanyDocuments, setAllCompanyDocuments] = useState<Record<number, any[]>>({});
  useEffect(() => {
    if (initialSearchTerm) setGlobalSearchTerm(initialSearchTerm);
  }, [initialSearchTerm]);
  useEffect(() => {
    const headers = activeDepartmentTab === '1'
      ? ENHANCED_TABLE_HEADERS_IMMIGRATION
      : ENHANCED_TABLE_HEADERS;
    const filteredHeaders = activeSubTab === 'cancelled'
      ? headers
      : headers.filter(h => h.id !== 'cancellation_reason');

    setCurrentTableHeaders(filteredHeaders);
    setVisibleHeaders(new Set(filteredHeaders.filter(h => h.default && h.id !== 'cancellation_reason').map(h => h.id)));
  }, [activeDepartmentTab, activeSubTab]);
  const [tmUsers, setTmUsers] = useState<Map<number, any>>(new Map())
  const [subdepartmentOfficers, setSubdepartmentOfficers] = useState<Array<{ id: string, name: string }>>([])
  const [subdepartmentManagers, setSubdepartmentManagers] = useState<Array<{ id: string, name: string }>>([])
  const [subdepartmentAssistants, setSubdepartmentAssistants] = useState<Array<{ id: string, name: string }>>([])
  const [unifiedOfficers, setUnifiedOfficers] = useState<any[]>([])
  const [unifiedManagers, setUnifiedManagers] = useState<any[]>([])
  const [unifiedAssistants, setUnifiedAssistants] = useState<any[]>([])
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkingTask, setLinkingTask] = useState<UtilTask | null>(null);
  const [taskToCancel, setTaskToCancel] = useState<any>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [taskToUncancel, setTaskToUncancel] = useState<any>(null);
  const [uncancelDialogOpen, setUncancelDialogOpen] = useState(false);
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [selectedAutomation, setSelectedAutomation] = useState<any>(null);
  const [isClassSelectionOpen, setIsClassSelectionOpen] = useState(false);
  const [availableBundles, setAvailableBundles] = useState<any[]>([]);
  const [loadingBundles, setLoadingBundles] = useState(false);
  const [selectedTaskForPush, setSelectedTaskForPush] = useState<{
    task: UtilTask;
    targetDeptId: number;
    targetSubDeptId: number;
    targetSubDeptName: string;
    isApplicant: boolean;
    applicantAge: number | null;
    applicantClassId?: string;
    dependantClasses?: Map<string, string>;
    bundle?: any;
  } | null>(null);
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);
  const [requirementsDialogTask, setRequirementsDialogTask] = useState<any>(null);
  const [automationWebdataMapState, setAutomationWebdataMapState] = useState<Record<string, { name: string; webdata: any[] }>>({});
  const [requirementsDialogFieldData, setRequirementsDialogFieldData] = useState<{
    jobFieldsRecord: Record<string, any>
    fieldSourceDataCache: Record<string, Record<string, any>>
    fieldMasterComputedCache: Record<string, any>
    relationshipData: any[]
  }>({ jobFieldsRecord: {}, fieldSourceDataCache: {}, fieldMasterComputedCache: {}, relationshipData: [] });
  const [tableRows, setTableRows] = useState([]);
  const [taskDependants, setTaskDependants] = useState<Map<string, any[]>>(new Map());
  const [enhancedTasksData, setEnhancedTasksData] = useState<Map<string, any>>(new Map());
  const [companyInquiryDialogOpen, setCompanyInquiryDialogOpen] = useState(false);
  const [realOfficers, setRealOfficers] = useState<any[]>([]);
  const [userData, setUserData] = useState<any>(null);
  const [assignOfficersDialogOpen, setAssignOfficersDialogOpen] = useState(false);
  const [selectedTaskForOfficers, setSelectedTaskForOfficers] = useState<any>(null);
  const [selectedStageForOfficers, setSelectedStageForOfficers] = useState<any>(null);

  // Structural (job-level) applicability — unchanged from before. Attribute-based
  // applicability (renewal status/nationality/age) is layered on separately via
  // stageApplicabilityConditionsMet (tableUtils.tsx), ANDed in below, so a "For Fresh only"
  // stage renders N/A for a Renewal task the same way a structurally-N/A stage always has.
  const isStageApplicableToTask = useCallback((stage: any, task: any, departments: any[]): boolean => {
    if (!stageApplicabilityConditionsMet(stage, task, enhancedTasksData)) return false;

    if (!task || !stage || !Array.isArray(departments) || departments.length === 0) {
      return true;
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

      return true;
    } catch (error) {
      console.error('Error in isStageApplicableToTask:', error);
      return true; // Failsafe
    }
  }, [enhancedTasksData]);

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
    const fetchReportDocDefaults = async () => {
      if (!activeDepartmentTab) { setReportDocDefaults([]); return; }
      try {
        const deptTasks = tasks.filter(t => String(t.department_id) === String(activeDepartmentTab));
        const jobLevels = new Map<string, any>();

        deptTasks.forEach(task => {
          const jl = task.job_level || {};
          const key = JSON.stringify({
            department_id: Number(jl.department_id || activeDepartmentTab),
            subdepartment_id: jl.subdepartment_id || null,
            class_id: jl.class_id || null,
            subclass_id: jl.subclass_id || null
          });
          if (!jobLevels.has(key)) {
            jobLevels.set(key, {
              department_id: Number(jl.department_id || activeDepartmentTab),
              subdepartment_id: jl.subdepartment_id || null,
              class_id: jl.class_id || null,
              subclass_id: jl.subclass_id || null,
              level: jl.level || 1
            });
          }
        });

        if (jobLevels.size === 0) {
          jobLevels.set('default', {
            department_id: Number(activeDepartmentTab),
            subdepartment_id: null,
            class_id: null,
            subclass_id: null,
            level: 1
          });
        }

        const allDefaults: any[] = [];
        // Normalize ids as strings so rows whose job_level stores class_id/subclass_id
        // as strings match tasks whose job_level stores them as numbers (and vice versa).
        const normId = (v: any) => (v === null || v === undefined || v === '') ? null : String(v);
        const matchesJobLevel = (rowJobLevel: any, jobLevel: any) =>
          normId(rowJobLevel?.subdepartment_id) === normId(jobLevel.subdepartment_id) &&
          normId(rowJobLevel?.class_id) === normId(jobLevel.class_id) &&
          normId(rowJobLevel?.subclass_id) === normId(jobLevel.subclass_id);

        // Fetch every class-requirements row for this department in a single round trip,
        // then resolve each task job level's match client-side instead of one query per
        // unique job level.
        const { data: allRequirementRows, error: reqError } = await supabase
          .from('tm_class_requirements')
          .select('job_level, report_doc_defaults')
          .eq('job_level->>department_id', String(activeDepartmentTab));

        if (!reqError && Array.isArray(allRequirementRows)) {
          for (const [_, jobLevel] of jobLevels) {
            const match = allRequirementRows.find((row: any) => matchesJobLevel(row.job_level, jobLevel));
            if (match?.report_doc_defaults) {
              allDefaults.push(...match.report_doc_defaults);
            }
          }
        }

        const uniqueDefaults = Array.from(
          new Map(allDefaults
            .filter((d: any) => d.isVisible !== false)
            .map((d: any) => [d.documentId, d]))
            .values()
        ).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

        setReportDocDefaults(uniqueDefaults);
      } catch (err) {
        console.error('Error fetching report doc defaults:', err);
        setReportDocDefaults([]);
      }
    };
    fetchReportDocDefaults();
  }, [activeDepartmentTab, activeSubdepartmentTab, tasks]);

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
    const userIdStr = userId.toString();
    const unifiedOfficer = unifiedOfficers.find(o => o.id === userIdStr);
    if (unifiedOfficer) {
      return unifiedOfficer.full_name || unifiedOfficer.name || unifiedOfficer.displayName || `Officer ${userId}`;
    }

    const unifiedManager = unifiedManagers.find(m => m.id === userIdStr);
    if (unifiedManager) {
      return unifiedManager.full_name || unifiedManager.name || unifiedManager.displayName || `Manager ${userId}`;
    }

    const unifiedAssistant = unifiedAssistants.find(a => a.id === userIdStr);
    if (unifiedAssistant) {
      return unifiedAssistant.full_name || unifiedAssistant.name || unifiedAssistant.displayName || `Assistant ${userId}`;
    }

    const officer = subdepartmentOfficers.find(o => o.id === userIdStr);
    if (officer) return officer.name;

    const manager = subdepartmentManagers.find(m => m.id === userIdStr);
    if (manager) return manager.name;

    const assistant = subdepartmentAssistants.find(a => a.id === userIdStr);
    if (assistant) return assistant.name;

    const user = tmUsers.get(parseInt(userIdStr));
    return user?.name || `User ${userId}`;
  }, [tmUsers, subdepartmentOfficers, subdepartmentManagers, subdepartmentAssistants, unifiedOfficers, unifiedManagers, unifiedAssistants]);

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
  ): Document[] => getLinkedDocumentsForTaskStage(task, stage, allDocuments), [allDocuments]);

  const fetchOfficersFromApi = useCallback(async () => {
    try {
      const unifiedUserData = await userService.getAllUserData({ payrollAccess: true }, departments);
      const officerArray = unifiedUserData.officers;
      setRealOfficers(officerArray);
      setUserData(unifiedUserData);
      return officerArray;
    } catch (error) {
      console.error('Error fetching officers from API:', error);
      setRealOfficers([]);
      setUserData(null);
      return [];
    }
  }, [departments]);

  useEffect(() => {
    fetchOfficersFromApi();
  }, [fetchOfficersFromApi]);

  const getActiveStaffFromSubdepartment = useCallback((subdepartmentId: string) => {
    if (!subdepartmentId || !departments.length || !realOfficers) {
      return { officers: [], managers: [], assistants: [] };
    }

    const department = departments.find(d => d.id.toString() === activeDepartmentTab);
    if (!department) return { officers: [], managers: [], assistants: [] };

    const subdepartment = department.tm_subdepartments?.find(s => s.id.toString() === subdepartmentId);
    if (!subdepartment) return { officers: [], managers: [], assistants: [] };

    const departmentForInheritance = {
      ...department,
      officers_history: []
    };

    const subdepartmentUsers = userService.getSubdepartmentUsers(
      realOfficers.map(o => ({
        id: o.id,
        displayName: getOfficerDisplayName(o),
        email: o.email,
        role: 'officer',
        firstName: o.firstName,
        lastName: o.lastName,
        isActive: o.isActive,
        assignments: o.assignments || [],
        username: o.username || null,
        createdAt: o.createdAt || new Date().toISOString()
      })),
      department.id.toString(),
      subdepartment.id.toString()
    );

    let activeOfficers = [];
    if (subdepartmentUsers.officers.length > 0 && realOfficers && realOfficers.length > 0) {
      const inheritedOfficer = subdepartmentUsers.officers[0];
      const realOfficer = realOfficers.find(officer =>
        officer.id === inheritedOfficer.id.toString() ||
        officer.id === inheritedOfficer.id
      );

      if (realOfficer) {
        activeOfficers = [{
          id: realOfficer.id,
          name: `${realOfficer.firstName} ${realOfficer.lastName}`.trim(),
          email: realOfficer.email,
          isActive: realOfficer.isActive
        }];
      }
    }

    const officers = activeOfficers.map(oh => {
      const displayName = getOfficerDisplayName(oh);
      return {
        id: oh.id.toString(),
        name: displayName,
        email: oh.email || '',
        display_name: displayName,
        isInherited: true
      };
    });

    const managers = subdepartmentUsers.managers.map(m => ({
      id: m.id,
      name: m.displayName || m.name || `Manager ${m.id}`,
      email: m.email || '',
      display_name: m.displayName || m.name || `Manager ${m.id}`
    }));

    const assistants = subdepartmentUsers.assistants.map(a => ({
      id: a.id,
      name: a.displayName || a.name || `Assistant ${a.id}`,
      email: a.email || '',
      display_name: a.displayName || a.name || `Assistant ${a.id}`
    }));

    return { officers, managers, assistants };
  }, [departments, activeDepartmentTab, tmUsers, realOfficers]);

  const loadUserAssignmentData = useCallback(async () => {
    try {
      const unifiedUserData = await userService.getAllUserData({ payrollAccess: true }, departments);
      const usersMap = new Map()
      if (unifiedUserData?.allUsers) {
        unifiedUserData.allUsers.forEach(user => {
          usersMap.set(parseInt(user.id), user)
        })
      }
      setTmUsers(usersMap)
      setUnifiedOfficers(unifiedUserData.officers || [])
      setUnifiedManagers(unifiedUserData.managers || [])
      setUnifiedAssistants(unifiedUserData.assistants || [])
      return { usersMap, userAssignmentData: unifiedUserData }
    } catch (error) {
      console.error('Error fetching user assignment data:', error)
      return { usersMap: new Map(), userAssignmentData: null }
    }
  }, [departments])

  const tasksCacheRef = useRef<Map<string, { tasks: UtilTask[], stages: any[], timestamp: number }>>(new Map())
  const tableRowsCacheRef = useRef<Map<string, { rows: any[], timestamp: number }>>(new Map())
  const CACHE_DURATION = 5 * 60 * 1000

  // Cached and fetched per DEPARTMENT only — subdepartmentId is accepted for call-site
  // compatibility (most callers pass activeSubdepartmentTab) but deliberately ignored here.
  // getFilteredTasks already narrows the loaded department's tasks down to the active
  // sub-department client-side, so fetching per-subdepartment on top of that was fetching the
  // same department's data over and over (once per subdept tab ever visited) and — worse —
  // meant every subdept tab click re-ran this effect and could flash the loading state on a
  // cache miss/expiry. Loading once per department and filtering the rest client-side means
  // switching subdepartment (or status/perspective) tabs never touches the network again.
  const clearTasksCache = useCallback((departmentId?: string, _subdepartmentId?: string) => {
    const cacheKey = departmentId || 'all';
    tasksCacheRef.current.delete(cacheKey);
    tableRowsCacheRef.current.clear();
  }, []);

  const loadTasksData = useCallback(async (departmentId?: string, _subdepartmentId?: string, forceRefresh: boolean = false, silent: boolean = false) => {
    if (!departmentId) return null;

    const cacheKey = departmentId;

    // Clear cache if force refresh is requested
    if (forceRefresh) {
      tasksCacheRef.current.delete(cacheKey);
      tableRowsCacheRef.current.clear();
    }

    const cached = tasksCacheRef.current.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < CACHE_DURATION && !forceRefresh) {
      setTasks(cached.tasks);
      setStages(cached.stages);
      return cached;
    }

    try {
      if (!silent) setIsLoadingTasks(true);
      const [tasksData, stagesData] = await Promise.all([
        fetchTasks(departmentId, undefined, companies),
        fetchStages(departmentId, departments)
      ])

      const { individualDocsMap, companyDocsMap } = await fetchUploadedDocumentsForTasks(tasksData);
      setAllIndividualDocuments(individualDocsMap);
      setAllCompanyDocuments(companyDocsMap);

      setTasks(tasksData)
      setStages(stagesData)

      const nextValue = {
        tasks: tasksData,
        stages: stagesData,
        timestamp: now
      }

      tasksCacheRef.current.set(cacheKey, nextValue)
      return nextValue

    } catch (error) {
      console.error('Error loading tasks data:', error)
      toast({
        title: "Error",
        description: "Failed to load tasks data.",
        variant: "destructive"
      })
      return null
    } finally {
      if (!silent) setIsLoadingTasks(false);
    }
  }, [departments, companies])

  // Refetches allDocuments (bypassing fetchAllDocuments' own cache, which would otherwise still
  // return the pre-mutation snapshot for up to 15s) alongside tasks/stages. Used after a direct
  // write to a document's own row — e.g. ReassignDocumentTypeDialog retagging document_id — so
  // the table's mismatch indicator and document-type labels reflect the fix immediately instead
  // of on the next incidental refresh.
  const refreshDocumentsAndTasks = useCallback(async () => {
    invalidateAllDocumentsCache();
    const documentsData = await fetchAllDocuments();
    setAllDocuments(documentsData);
    await loadTasksData(activeDepartmentTab, activeSubdepartmentTab, true, true);
  }, [activeDepartmentTab, activeSubdepartmentTab, loadTasksData]);

  // Lightweight scan (job_level + status only, not the full tm_tasks row) across every
  // department at once — used purely to badge the Department/Sub-department tabs with live
  // (non-terminal) task counts, independent of loadTasksData's per-department fetch/cache.
  const fetchLiveTaskCounts = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('tm_tasks').select('job_level, status');
      if (error) throw error;

      const byDept: Record<string, number> = {};
      const bySubdept: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        if (TERMINAL_STATUSES.includes(row.status)) return;
        const deptId = row.job_level?.department_id;
        const subdeptId = row.job_level?.subdepartment_id;
        if (deptId != null) byDept[deptId] = (byDept[deptId] || 0) + 1;
        if (subdeptId != null) bySubdept[subdeptId] = (bySubdept[subdeptId] || 0) + 1;
      });

      setLiveTaskCountsByDept(byDept);
      setLiveTaskCountsBySubdept(bySubdept);
    } catch (error) {
      console.error('Error loading live task counts:', error);
    }
  }, []);

  const refreshAllData = useCallback(async () => {
    setIsRefreshingAllData(true);
    try {
      const [
        documentsData,
        { fieldsMap, kycDocsMap },
        { usersMap: usersData },
        tasksData = null,
        tasksDuplicateData,
        documentWorkflowLogsData
      ] = await Promise.all([
        fetchAllDocuments(),
        fetchAllKycFields(),
        loadUserAssignmentData(),
        activeDepartmentTab ? loadTasksData(activeDepartmentTab, activeSubdepartmentTab, false, true) : Promise.resolve(null),
        fetchTasksDuplicate(),
        fetchDocumentWorkflowLogs(),
        fetchLiveTaskCounts(),
      ]);

      // Batch state updates
      unstable_batchedUpdates(() => {
        setAllDocuments(documentsData);
        setAllKycFields(fieldsMap);
        setKycDocuments(kycDocsMap);
        setTmUsers(usersData);
        // You can add state setters for the new data if needed
        // setTasksDuplicate(tasksDuplicateData);
        // setDocumentWorkflowLogs(documentWorkflowLogsData);
      });

      if (tasksData === null && activeDepartmentTab) {
        // If tasks weren't loaded in the initial batch, load them now
        await loadTasksData(activeDepartmentTab, activeSubdepartmentTab, false, true);
      }

      toast({
        title: "Success",
        description: "Data refreshed successfully.",
        variant: "success"
      });
    } catch (error) {
      console.error('Error refreshing data:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to refresh data.",
        variant: "destructive"
      });
    } finally {
      setIsRefreshingAllData(false);
    }
  }, [activeDepartmentTab, activeSubdepartmentTab, loadTasksData, loadUserAssignmentData, fetchLiveTaskCounts])

  // Department-scoped only, deliberately not narrowed to activeSubdepartmentTab: `tasks` now
  // holds the whole active department (loadTasksData caches per-department, see its own
  // comment), so a realtime change for a task in a currently-inactive sub-department is still
  // relevant to that cached state — it must stay in sync so switching to that sub-department's
  // tab later (a pure client-side filter, no refetch) shows the update instead of stale data.
  // This also means the realtime subscription below never needs to resubscribe on subdept
  // tab switches, only on a genuine department change.
  const isTaskRelevantToActiveView = useCallback((task: any) => {
    if (!task || !activeDepartmentTab) return false;

    const jobLevel = task.job_level || {};
    const departmentId = jobLevel.department_id ?? task.department_id;

    return departmentId?.toString() === activeDepartmentTab;
  }, [activeDepartmentTab])

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

    // A stage is eligible to be "current" when it's applicable (structural + attribute
    // conditions, via isStageApplicableToTask above) and, if it's optional
    // (StageAllocation.display === false — see isStageOptionalForTask), only once the task
    // actually has data for it. Mirrors getCurrentStageStatus's findFirstApplicableStage/
    // findNextApplicableStage (tableUtils.tsx) so this component's own current-stage pointer
    // (used for save-time metadata and the Assign Officers dialog) never disagrees with what
    // the Current Stage columns show. Previously this walk didn't filter by applicability at
    // all, unlike every other current-stage implementation in the codebase.
    const isStageEligibleAsCurrent = (stage: Stage): boolean => {
      if (!isStageApplicableToTask(stage, task, departments)) return false;
      if (isStageOptionalForTask(stage, task, departments)) {
        const stageData = task.stages?.[stage.id];
        const hasData = !!(stageData?.date || stageData?.status || stageData?.value || stageData?.completedAt);
        if (!hasData) return false;
      }
      return true;
    };

    // Determine the appropriate stage to return
    if (lastCompletedIndex === -1) {
      return sortedStages.find(isStageEligibleAsCurrent) || sortedStages[0] || null;
    }
    const nextEligible = sortedStages.slice(lastCompletedIndex + 1).find(isStageEligibleAsCurrent);
    return nextEligible ?? sortedStages[lastCompletedIndex];
  };

  // Create wrapper functions for utility functions
  const getEnhancedImmigrationStatusWrapper = useCallback((task: any) => {
    return getEnhancedImmigrationStatus(task, stages, allDocuments, kycDocuments);
  }, [stages, allDocuments, kycDocuments]);

  const getCurrentStageStatusWrapper = useCallback((task: UtilTask) => {
    return getCurrentStageStatus(task, stages, departments, allDocuments, enhancedTasksData);
  }, [stages, departments, allDocuments, enhancedTasksData]);

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
    setExpandedSections(new Set(['case_details', 'stages', 'stats', 'report_docs', 'actions']));
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

    // Map 'cancelled' to 'cancel' for proper filtering
    const statusToFilter = status === 'cancelled' ? 'cancel' : status;

    let filteredTasks = tasks.filter(task =>
      task &&
      task.department_id?.toString() === currentDept.id.toString() &&
      (!statusToFilter || task.status === statusToFilter)
    )

    if (activeSubdepartmentTab) {
      filteredTasks = filteredTasks.filter(task =>
        task.subdepartment_id?.toString() === activeSubdepartmentTab
      )
    }

    return filteredTasks
  }, [tasks, departments, activeDepartmentTab, activeSubdepartmentTab])

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

  const allTasksInScope = useMemo(() => filterTasksBySearchWrapper(getFilteredTasks()), [getFilteredTasks, filterTasksBySearchWrapper])
  const enquiryTasks = useMemo(() => filterTasksBySearchWrapper(getFilteredTasks('enquiry')), [getFilteredTasks, filterTasksBySearchWrapper])
  const wipTasks = useMemo(() => filterTasksBySearchWrapper(getFilteredTasks('in_progress')), [getFilteredTasks, filterTasksBySearchWrapper])
  const completedTasks = useMemo(() => filterTasksBySearchWrapper(getFilteredTasks('write_up_completed')), [getFilteredTasks, filterTasksBySearchWrapper])
  const endorsedTasks = useMemo(() => filterTasksBySearchWrapper(getFilteredTasks('endorsed')), [getFilteredTasks, filterTasksBySearchWrapper])
  const cancelledTasks = useMemo(() => filterTasksBySearchWrapper(getFilteredTasks('cancelled')), [getFilteredTasks, filterTasksBySearchWrapper])
  // "All Enquiry + WIP" — same TERMINAL_STATUSES-based union summary-reports/page.tsx's
  // STATUS_LABELS.active tab uses, scoped through the same department/subdepartment filter as
  // every other status tab.
  const activeEnquiryWipTasks = useMemo(
    () => filterTasksBySearchWrapper(getFilteredTasks().filter((task: any) => !TERMINAL_STATUSES.includes(task.status))),
    [getFilteredTasks, filterTasksBySearchWrapper]
  )
  const activeTabConfig = useMemo(() => {
    switch (activeSubTab) {
      case 'all':
        return { tasks: allTasksInScope, title: 'All Tasks' }
      case 'enquiries':
        return { tasks: enquiryTasks, title: 'Enquiries' }
      case 'active':
        return { tasks: activeEnquiryWipTasks, title: 'All Enquiry + WIP' }
      case 'endorsed':
        return { tasks: endorsedTasks, title: 'Endorsement Completed' }
      case 'cancelled':
        return { tasks: cancelledTasks, title: 'Cancelled' }
      case 'write_up_completed':
        return { tasks: completedTasks, title: 'Write Up Completed' }
      case 'wip-stages':
      default:
        return { tasks: wipTasks, title: 'WIP Stages' }
    }
  }, [activeSubTab, allTasksInScope, enquiryTasks, wipTasks, activeEnquiryWipTasks, completedTasks, endorsedTasks, cancelledTasks])

  // Layered on top of a status tab's task list, exactly like reports/page.tsx's
  // tasksByFilters — 'overview' passes everything through untouched. Extracted as a reusable
  // callback (rather than inlined only for the active tab) so the status-pill counts below can
  // apply the same officers/managers/clients narrowing to every tab, not just the selected one.
  const applyPerspectiveFilter = useCallback((tasksToFilter: any[]) => {
    return tasksToFilter.filter((task: any) => {
      if (activePerspective === 'officers') {
        if (officerFilterMode === 'current') {
          if (!getCurrentOfficerStage(task, stages, departments)) return false
          if (activeOfficerTab === '__unallocated__') {
            if (getStageOfficerIds(task, stages, 'current', departments).length !== 0) return false
          } else if (activeOfficerTab !== 'all' && !taskHasStageOfficer(task, stages, [activeOfficerTab], 'current', departments)) return false
        } else {
          if (activeOfficerTab === '__unallocated__') {
            if (getStageOfficerIds(task, stages, 'history', departments).length !== 0) return false
          } else if (activeOfficerTab !== 'all' && !taskHasStageOfficer(task, stages, [activeOfficerTab], 'history', departments)) return false
        }
      }
      if (activePerspective === 'managers') {
        if (getCanonicalCurrentStage(task, stages, departments)?.follow_up?.toLowerCase() !== 'bcl') return false
        if (activeTaskManagerTab === '__unallocated__') {
          if (task.task_manager_id) return false
        } else if (activeTaskManagerTab !== 'all' && task.task_manager_id?.toString() !== activeTaskManagerTab) return false
      }
      if (activePerspective === 'clients' && !isTaskWithClient(task, stages, departments)) return false
      return true
    })
  }, [activePerspective, activeOfficerTab, officerFilterMode, activeTaskManagerTab, stages, departments])

  const tasksByPerspective = useMemo(
    () => applyPerspectiveFilter(activeTabConfig.tasks),
    [activeTabConfig.tasks, applyPerspectiveFilter]
  )

  const displayedTasks = tasksByPerspective
  const activeTabTitle = activeTabConfig.title

  // Status-pill counts — each tab's own task pool run through the same perspective filter as
  // the active tab, so the pills reflect every active filter (search bar included, since each
  // pool below is already search-filtered) and not just the one currently selected.
  const statusTabCounts = useMemo(() => ({
    all: applyPerspectiveFilter(allTasksInScope).length,
    enquiries: applyPerspectiveFilter(enquiryTasks).length,
    active: applyPerspectiveFilter(activeEnquiryWipTasks).length,
    wipStages: applyPerspectiveFilter(wipTasks).length,
    writeUpCompleted: applyPerspectiveFilter(completedTasks).length,
    endorsed: applyPerspectiveFilter(endorsedTasks).length,
    cancelled: applyPerspectiveFilter(cancelledTasks).length,
  }), [applyPerspectiveFilter, allTasksInScope, enquiryTasks, activeEnquiryWipTasks, wipTasks, completedTasks, endorsedTasks, cancelledTasks])

  // Subdepartment/All-Subdepartments pill badges: when a search term is active, recompute counts
  // client-side from the already-loaded active department's tasks instead of the lightweight
  // liveTaskCountsBySubdept DB scan, which only knows job_level/status and has no applicant/
  // company data to match the search term against. Deliberately NOT restricted to non-terminal
  // statuses here (unlike liveTaskCountsBySubdept) — while searching, the badge answers "how many
  // matches live under this subdepartment", not "how many are still in the live pipeline", so a
  // match sitting in a terminal status (e.g. write_up_completed) must still count. No search term
  // -> keep using the DB-wide live counts (accurate across every department without a full load).
  const searchAwareSubdeptCounts = useMemo(() => {
    if (!globalSearchTerm.trim() || !activeDepartmentTab) return null
    const matchPool = filterTasksBySearchWrapper(
      tasks.filter((t: any) => t.department_id?.toString() === activeDepartmentTab)
    )
    const bySubdept: Record<string, number> = {}
    matchPool.forEach((t: any) => {
      const id = t.subdepartment_id?.toString()
      if (!id) return
      bySubdept[id] = (bySubdept[id] || 0) + 1
    })
    return { total: matchPool.length, bySubdept }
  }, [globalSearchTerm, activeDepartmentTab, tasks, filterTasksBySearchWrapper])

  // Officers/managers actually relevant to the active department/subdepartment scope — same
  // userService.getDepartmentUsers narrowing reports/page.tsx uses for its person pill lists.
  const perspectiveDepartmentUsers = useMemo(() => {
    if (!activeDepartmentTab) return { officers: [], managers: [] }
    const allUsers = [...unifiedOfficers, ...unifiedManagers]
    return activeSubdepartmentTab
      ? userService.getSubdepartmentUsers(allUsers, activeDepartmentTab, activeSubdepartmentTab)
      : userService.getDepartmentUsers(allUsers, activeDepartmentTab)
  }, [activeDepartmentTab, activeSubdepartmentTab, unifiedOfficers, unifiedManagers])

  // Badge counts for the Officers/Managers/Clients perspective pills — deliberately sourced
  // from activeTabConfig.tasks (the status tab's own pool, not narrowed by whichever person tab
  // is currently selected) so switching officer/manager tabs never zeroes out other tabs' counts,
  // same as reports/page.tsx's officerTaskCounts/taskManagerTaskCounts.
  const officerTaskCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 }
    const pool = officerFilterMode === 'current'
      ? activeTabConfig.tasks.filter((t: any) => getCurrentOfficerStage(t, stages, departments) !== null)
      : activeTabConfig.tasks
    perspectiveDepartmentUsers.officers.forEach((o: any) => {
      const oTasks = pool.filter((t: any) => getStageOfficerIds(t, stages, officerFilterMode, departments).includes(o.id.toString()))
      counts[o.id.toString()] = oTasks.length
      counts.all += oTasks.length
    })
    const unallocated = pool.filter((t: any) => getStageOfficerIds(t, stages, officerFilterMode, departments).length === 0)
    counts.__unallocated__ = unallocated.length
    counts.all += unallocated.length
    return counts
  }, [activeTabConfig.tasks, perspectiveDepartmentUsers.officers, officerFilterMode, stages, departments])

  const taskManagerTaskCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 }
    const pool = activeTabConfig.tasks.filter((t: any) => getCanonicalCurrentStage(t, stages, departments)?.follow_up?.toLowerCase() === 'bcl')
    perspectiveDepartmentUsers.managers.forEach((m: any) => {
      const mTasks = pool.filter((t: any) => t.task_manager_id?.toString() === m.id.toString())
      counts[m.id.toString()] = mTasks.length
      counts.all += mTasks.length
    })
    const unallocated = pool.filter((t: any) => !t.task_manager_id)
    counts.__unallocated__ = unallocated.length
    counts.all += unallocated.length
    return counts
  }, [activeTabConfig.tasks, perspectiveDepartmentUsers.managers, stages, departments])

  const clientsAwaitingCount = useMemo(
    () => activeTabConfig.tasks.filter((t: any) => isTaskWithClient(t, stages, departments)).length,
    [activeTabConfig.tasks, stages, departments]
  )

  const getClassesForSubdepartment = useCallback((deptId: number, subDeptId: number) => {
    const department = departments.find(d => d.id === deptId);
    if (!department) return [];

    const subdepartment = department.tm_subdepartments?.find(s => s.id === subDeptId);
    return subdepartment?.classes || [];
  }, [departments]);

  const fetchAvailableBundles = useCallback(async () => {
    if (!departments.length) return;

    setLoadingBundles(true);
    try {
      const bundles: any[] = [];
      const { data: allBundles } = await supabase
        .from('tm_task_bundles')
        .select('*')
        .contains('trigger_job_level', { department_id: 1 });

      if (allBundles) {
        for (const bundle of allBundles) {
          const triggerJobLevel = bundle.trigger_job_level;
          if (triggerJobLevel?.department_id === 1) {
            const department = departments.find(d => d.id === 1);
            const subdepartment = department?.tm_subdepartments?.find(s => s.id === triggerJobLevel.subdepartment_id);
            const classInfo = triggerJobLevel.class_id
              ? subdepartment?.classes?.find(c => c.id === triggerJobLevel.class_id)
              : null;

            bundles.push({
              ...bundle,
              displayName: classInfo
                ? `${subdepartment?.name || 'Unknown'} - ${classInfo.name || 'Class'}`
                : subdepartment?.name || 'Unknown Subdepartment',
              subdepartmentName: subdepartment?.name || 'Unknown',
              className: classInfo?.name || null,
              targetSubDeptId: triggerJobLevel.subdepartment_id,
              targetClassId: triggerJobLevel.class_id || null,
            });
          }
        }
      }

      setAvailableBundles(bundles);
    } catch (error) {
      console.error('Error fetching bundles:', error);
      toast({
        title: "Error",
        description: "Failed to load available task bundles.",
        variant: "destructive"
      });
    } finally {
      setLoadingBundles(false);
    }
  }, [departments]);

  useEffect(() => {
    if (departments.length > 0) {
      fetchAvailableBundles();
    }
  }, [departments, fetchAvailableBundles]);

  const handlePushCase = useCallback(async (task: UtilTask, bundle: any) => {
    const targetDeptId = 1;
    const targetSubDeptId = bundle.targetSubDeptId;
    const targetSubDeptName = bundle.subdepartmentName;
    if (bundle.targetClassId === null && bundle.trigger_job_level?.subdepartment_id) {
      const classes = getClassesForSubdepartment(targetDeptId, targetSubDeptId);
      if (classes.length > 0) {
        const enhancedTask = enhancedTasksData.get(task.id.toString()) || task;
        let applicantAge = enhancedTask.age;
        if (applicantAge === undefined || applicantAge === null) {
          applicantAge = calculateAge(task.date_of_birth);
        }
        setSelectedTaskForPush({
          task,
          targetDeptId,
          targetSubDeptId,
          targetSubDeptName,
          isApplicant: true,
          applicantAge,
          applicantClassId: undefined,
          dependantClasses: new Map(),
          bundle: bundle // Pass the bundle information
        });
        setAvailableClasses(classes);
        setIsClassSelectionOpen(true);
        return;
      }
    }

    await executePushCase(task, targetDeptId, targetSubDeptId, targetSubDeptName, bundle.targetClassId, null, bundle);
  }, [getClassesForSubdepartment, enhancedTasksData]);

  const executePushCase = useCallback(async (
    task: UtilTask,
    targetDeptId: number,
    targetSubDeptId: number,
    targetSubDeptName: string,
    applicantClassId: string | null,
    dependantClassId: string | null,
    bundle: any
  ) => {
    setIsPushingCase(true);
    toast({ title: "Pushing Case...", description: `Creating bundle task(s) in ${targetSubDeptName}.` });

    try {
      const currentDate = new Date().toISOString();
      if (!bundle?.task_rules?.length) {
        throw new Error(`No task rules configured for ${targetSubDeptName}.`);
      }

      const dependants = taskDependants.get(task.id.toString()) || [];
      const isPrincipalMember = task.applicant_type === 'principal' || task.principal_member === true;
      const sharedParticipants = Array.isArray(task.participants_details)
        ? task.participants_details.filter((participant: any) =>
          !['principal', 'dependant'].includes(String(participant.role || '').toLowerCase())
        )
        : [];
      const stages = {
        '1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa': {
          date: currentDate,
          status: 'completed',
          completedAt: currentDate,
          updatedAt: currentDate
        },
        'a19b270e-6d1e-4e6d-b2bc-f21db72cde08': {
          date: currentDate,
          status: 'completed',
          completedAt: currentDate,
          updatedAt: currentDate
        },
        '9ccdbfa6-8d76-49db-b8d4-09742c734905': {
          date: currentDate,
          status: 'completed',
          completedAt: currentDate,
          updatedAt: currentDate
        }
      };

      const taskRows = [];
      const skippedDuplicates: any[] = [];
      const skippedWorkflowRestrictions: any[] = [];
      const workflowSummaryCache = new Map<number, any>();
      const duplicateConflictCache = new Map<string, any[]>();

      const getWorkflowSummaryForTarget = async (personId: number) => {
        if (!workflowSummaryCache.has(personId)) {
          workflowSummaryCache.set(personId, await detectExistingWorkflowForIndividual(personId));
        }
        return workflowSummaryCache.get(personId);
      };

      const getConflictCacheKey = (personId: number, jobLevel: any) => {
        const normalizedLevel = jobLevel || {};
        return JSON.stringify({
          personId,
          department_id: normalizedLevel.department_id ?? null,
          subdepartment_id: normalizedLevel.subdepartment_id ?? null,
          class_id: normalizedLevel.class_id ?? null,
          subclass_id: normalizedLevel.subclass_id ?? null,
          level: normalizedLevel.level ?? null,
        });
      };

      const getTaskConflictsForTarget = async (personId: number, jobLevel: any) => {
        const cacheKey = getConflictCacheKey(personId, jobLevel);
        if (!duplicateConflictCache.has(cacheKey)) {
          duplicateConflictCache.set(cacheKey, await detectTaskConflictsForJobLevel(personId, jobLevel));
        }
        return duplicateConflictCache.get(cacheKey) || [];
      };

      const allTargets = [
        ...(isPrincipalMember ? [{ id: task.individual_id, full_name: task.applicant_name, applicantType: 'principal' as const }] : []),
        ...dependants.map((dependant: any) => ({
          id: dependant.individual_id || dependant.id,
          full_name: dependant.full_name,
          applicantType: 'dependant' as const,
        })),
        ...(!isPrincipalMember && dependants.length === 0 ? [{ id: task.individual_id, full_name: task.applicant_name, applicantType: 'dependant' as const }] : []),
      ];
      const uniqueTargets = Array.from(new Map(allTargets.map((item) => [Number(item.id), item])).values());

      const workflowSummaries = await Promise.all(
        uniqueTargets.map(async (target: any) => [Number(target.id), await getWorkflowSummaryForTarget(Number(target.id))] as const)
      );
      const workflowSummaryLookup = new Map<number, any>(workflowSummaries);
      const existingWorkflowDocTypes = new Set<string>();
      workflowSummaryLookup.forEach((summary: any) => {
        if (!summary?.documentTypeSummary) return;
        Array.from(summary.documentTypeSummary.keys()).forEach((docTypeId: string) => existingWorkflowDocTypes.add(String(docTypeId)));
      });

      const buildTaskRow = async (target: any, applicantType: 'principal' | 'dependant', rule: any) => {
        const personId = Number(target.individual_id || target.id);
        const workflowSummary = workflowSummaryLookup.get(personId) || await getWorkflowSummaryForTarget(personId);
        const relatedDocumentTypeId = rule.related_document_type_id ? String(rule.related_document_type_id) : null;
        const hasWorkflowForDocumentElsewhere = relatedDocumentTypeId ? existingWorkflowDocTypes.has(relatedDocumentTypeId) : false;
        const hasWorkflowForDocumentOnTarget = relatedDocumentTypeId
          ? workflowSummary?.documentTypeSummary?.has(relatedDocumentTypeId)
          : false;

        if (relatedDocumentTypeId && applicantType === 'dependant' && hasWorkflowForDocumentElsewhere && !hasWorkflowForDocumentOnTarget) {
          skippedWorkflowRestrictions.push({
            targetName: target.full_name || target.applicant_name || task.applicant_name,
            ruleLabel: rule.label || rule.job_type,
            blockingReasons: ['not_involved_existing_workflow'],
          });
          return;
        }

        if (relatedDocumentTypeId) {
          const restrictionSummary = evaluateWorkflowRestrictionsForBundle(
            workflowSummary?.workflowLogs || [],
            {
              trigger_document_type_id: relatedDocumentTypeId,
              task_rules: [],
            } as any
          );

          if (restrictionSummary.hasBlockingWorkflow) {
            skippedWorkflowRestrictions.push({
              targetName: target.full_name || target.applicant_name || task.applicant_name,
              ruleLabel: rule.label || rule.job_type,
              blockingReasons: restrictionSummary.blockingReasons,
            });
            return;
          }
        }

        const conflicts = await getTaskConflictsForTarget(personId, rule.job_level || bundle.trigger_job_level);
        if (conflicts.length > 0) {
          skippedDuplicates.push({
            targetName: target.full_name || target.applicant_name || task.applicant_name,
            ruleLabel: rule.label || rule.job_type,
            conflictIds: conflicts.map((item: any) => item.id),
          });
          return;
        }

        taskRows.push({
          status: 'in_progress',
          created_by: 'bundle_push',
          date_initiated: currentDate,
          applied_by: target.full_name || target.applicant_name || task.applicant_name,
          applicant_type: applicantType,
          individual_id: personId,
          stages: { ...stages },
          job_description: rule.job_type || task.job_description || targetSubDeptName,
          job_level: rule.job_level || bundle.trigger_job_level,
          applicant_details: {
            id: personId,
            name: target.full_name || target.applicant_name || task.applicant_name,
            role: applicantType,
            type: 'individual',
            full_name: target.full_name || target.applicant_name || task.applicant_name,
          },
          participants_details: sharedParticipants,
          job_specific_answers: task.job_specific_answers || null,
          registry_metadata: {
            triggered_from: 'department_tasks_push',
            triggered_at: currentDate,
            source_task_id: task.id,
            bundle_id: bundle.id,
            bundle_rule_id: rule.id,
            push_target_subdepartment_id: targetSubDeptId,
            push_target_subdepartment_name: targetSubDeptName,
          },
        });
      };

      for (const rule of bundle.task_rules) {
        const appliesToPrincipal = rule.targets?.some((target: any) => target.type === 'principal');
        const dependantTarget = rule.targets?.find((target: any) => target.type === 'dependant' || target.type === 'dependant_all');

        if (appliesToPrincipal && isPrincipalMember) {
          await buildTaskRow({
            id: task.individual_id,
            full_name: task.applicant_name,
          }, 'principal', rule);
        }

        if (dependantTarget && dependants.length > 0) {
          for (const dependant of dependants) {
            const age = dependant.age;
            if (dependantTarget.type === 'dependant') {
              if (age === null || age === undefined) continue;
              if (dependantTarget.ageFrom && age < dependantTarget.ageFrom) continue;
              if (dependantTarget.ageTo && age > dependantTarget.ageTo) continue;
            }

            await buildTaskRow({
              id: dependant.individual_id || dependant.id,
              full_name: dependant.full_name,
              individual_id: dependant.individual_id || dependant.id,
            }, 'dependant', rule);
          }
        }

        if (!isPrincipalMember && appliesToPrincipal === false && (!dependantTarget || dependants.length === 0)) {
          await buildTaskRow({
            id: task.individual_id,
            full_name: task.applicant_name,
          }, 'dependant', rule);
        }
      }

      if (!taskRows.length) {
        throw new Error(
          skippedWorkflowRestrictions.length > 0
            ? 'All bundle-generated tasks were skipped because related document workflows are in blocking states.'
            : skippedDuplicates.length > 0
              ? 'All bundle-generated tasks were skipped because active duplicates already exist.'
              : 'The configured bundle did not produce any tasks for this case.'
        );
      }

      const { data: newTasks, error } = await supabase
        .from('tm_tasks')
        .insert(taskRows)
        .select();

      if (error) throw error;

      let successMessage = `Created ${newTasks.length} bundle task(s) for ${targetSubDeptName}.`;
      if (skippedDuplicates.length > 0) {
        successMessage += `\n${skippedDuplicates.length} duplicate target(s) were skipped.`;
      }
      if (skippedWorkflowRestrictions.length > 0) {
        const workflowReasons = Array.from(
          new Set(
            skippedWorkflowRestrictions.flatMap((item: any) =>
              (item.blockingReasons || []).map(formatWorkflowRestrictionReason)
            )
          )
        );
        successMessage += `\n${skippedWorkflowRestrictions.length} target(s) were skipped because document workflow restrictions are active${workflowReasons.length ? `: ${workflowReasons.join(", ")}` : ""}.`;
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
  }, [refreshAllData, taskDependants]);

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

  const updateTaskStageOfficers = useCallback(async (taskId: string, stageId: string, officerIds: string[]) => {
    try {
      const { data: currentTask } = await supabase
        .from('tm_tasks')
        .select('stages')
        .eq('id', taskId)
        .single();

      if (!currentTask) throw new Error('Task not found');

      const existingStages = currentTask.stages || {};
      const timestamp = new Date().toISOString();

      const updatedStages = {
        ...existingStages,
        [stageId]: {
          ...existingStages[stageId],
          officer_ids: officerIds,
          updatedAt: timestamp
        }
      };

      const { error } = await supabase
        .from('tm_tasks')
        .update({
          stages: updatedStages,
          updated_at: timestamp
        })
        .eq('id', taskId);

      if (error) throw error;

      setTasks(prevTasks => prevTasks.map(t =>
        t.id.toString() === taskId.toString()
          ? { ...t, stages: updatedStages, updated_at: timestamp }
          : t
      ));
      clearTasksCache(activeDepartmentTab, activeSubdepartmentTab);

      toast({
        title: "Success",
        description: "Officers updated successfully",
        variant: "success"
      });
    } catch (error: any) {
      console.error('Error updating task stage officers:', error);
      toast({
        title: "Error",
        description: `Failed to update officers: ${error.message}`,
        variant: "destructive"
      });
    }
  }, [activeDepartmentTab, activeSubdepartmentTab, clearTasksCache]);

  const updateAllTaskStageOfficers = useCallback(async (taskId: string, stageAssignments: Record<string, string[]>) => {
    if (!taskId) {
      toast({
        title: "Error",
        description: "Task ID is required to update officers",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data: currentTask } = await supabase
        .from('tm_tasks')
        .select('stages')
        .eq('id', taskId)
        .single();

      if (!currentTask) throw new Error('Task not found');

      const existingStages = currentTask.stages || {};
      const timestamp = new Date().toISOString();

      const updatedStages = { ...existingStages };

      // Update all stages with their assigned officers
      Object.entries(stageAssignments).forEach(([stageId, officerIds]) => {
        if (stageId !== 'all') { // Skip the 'all' key
          updatedStages[stageId] = {
            ...existingStages[stageId],
            officer_ids: officerIds,
            updatedAt: timestamp
          };
        }
      });

      const { error } = await supabase
        .from('tm_tasks')
        .update({
          stages: updatedStages,
          updated_at: timestamp
        })
        .eq('id', taskId);

      if (error) throw error;

      setTasks(prevTasks => prevTasks.map(t =>
        t.id.toString() === taskId.toString()
          ? { ...t, stages: updatedStages, updated_at: timestamp }
          : t
      ));
      clearTasksCache(activeDepartmentTab, activeSubdepartmentTab);

      toast({
        title: "Success",
        description: "All stage officers updated successfully",
        variant: "success"
      });
    } catch (error: any) {
      console.error('Error updating all task stage officers:', error);
      toast({
        title: "Error",
        description: `Failed to update officers: ${error.message}`,
        variant: "destructive"
      });
    }
  }, [activeDepartmentTab, activeSubdepartmentTab, clearTasksCache]);

  const updateTaskOfficer = useCallback(async (taskId: string, officerId: string | null, stageId: string) => {
    if (!taskId || !stageId) {
      toast({
        title: "Error",
        description: "Task ID and Stage ID are required to update officer",
        variant: "destructive"
      });
      return;
    }

    console.log('[updateTaskOfficer] Task ID:', taskId, 'Stage ID:', stageId, 'Officer ID:', officerId);

    try {
      const { data: currentTask } = await supabase
        .from('tm_tasks')
        .select('stages')
        .eq('id', taskId)
        .single();

      if (!currentTask) throw new Error('Task not found');

      const existingStages = currentTask.stages || {};
      const timestamp = new Date().toISOString();

      const updatedStages = { ...existingStages };

      console.log('[updateTaskOfficer] Existing stages keys:', Object.keys(existingStages));
      console.log('[updateTaskOfficer] Updating stage:', stageId, 'Current data:', existingStages[stageId]);

      // Update the specific stage's officer_ids
      if (officerId) {
        updatedStages[stageId] = {
          ...existingStages[stageId],
          officer_ids: [officerId],
          updatedAt: timestamp
        };
      } else {
        // Remove officer assignment
        updatedStages[stageId] = {
          ...existingStages[stageId],
          officer_ids: [],
          updatedAt: timestamp
        };
      }

      console.log('[updateTaskOfficer] Updated stage data:', updatedStages[stageId]);

      const { error } = await supabase
        .from('tm_tasks')
        .update({
          stages: updatedStages,
          updated_at: timestamp
        })
        .eq('id', taskId);

      if (error) throw error;

      setTasks(prevTasks => prevTasks.map(t =>
        t.id.toString() === taskId.toString()
          ? { ...t, stages: updatedStages, updated_at: timestamp }
          : t
      ));
      clearTasksCache(activeDepartmentTab, activeSubdepartmentTab);

      toast({
        title: "Success",
        description: "Officer updated successfully",
        variant: "success"
      });
    } catch (error: any) {
      console.error('Error updating task officer:', error);
      toast({
        title: "Error",
        description: `Failed to update officer: ${error.message}`,
        variant: "destructive"
      });
    }
  }, [activeDepartmentTab, activeSubdepartmentTab, clearTasksCache]);

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

      // 2. Map Stage IDs to Target Statuses — fallback for stages predating the
      // per-stage triggers_task_status config (see stagesdb.ts's Stage.triggers_task_status,
      // set via add-stage-dialog.tsx / edit-stage-dialog.tsx's "Task Status Transition" picker).
      // Kept so existing stages using these exact IDs keep working even if never explicitly
      // configured with the field.
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
      // Resolve the status this stage completion should trigger, most-specific first:
      // class-level allocation override -> subdept-level allocation override -> the stage's
      // own default (triggers_task_status) -> the hardcoded ID map (legacy fallback). This lets
      // the SAME shared stage (e.g. a department-wide "Endorsement" stage) trigger different
      // statuses for different classes — e.g. jump straight to 'endorsed' for classes with a
      // real Write Up step, but only to 'write_up_completed' for a class (like Extension of
      // Visitor's Pass) whose pipeline skips Write Up entirely, so it still surfaces in the
      // Passport Endorsement Tracker before being marked fully endorsed.
      // '' at any level is an explicit "never trigger a status here" override, distinct from
      // undefined/absent which means "inherit from the next level down".
      const resolveConfiguredTrigger = (): string | undefined => {
        try {
          const dept = departments.find((d: any) => d?.id === (task.department?.id || task.department_id));
          const subdept = dept?.tm_subdepartments?.find((s: any) => s?.id === (task.subdepartment?.id || task.subdepartment_id));
          if (subdept) {
            if (task.class_id) {
              const cls = subdept.classes?.find((c: any) => c?.id?.toString() === task.class_id?.toString());
              const classAlloc = cls?.stages?.find((s: any) => s.stage_id === stageId);
              if (classAlloc && classAlloc.triggers_task_status !== undefined) return classAlloc.triggers_task_status;
            }
            const subdeptAlloc = subdept.stages?.find((s: any) => s.stage_id === stageId);
            if (subdeptAlloc && subdeptAlloc.triggers_task_status !== undefined) return subdeptAlloc.triggers_task_status;
          }
        } catch (error) {
          console.error('Error resolving stage status trigger override:', error);
        }
        const stageDef = stages?.find((s: any) => s.id === stageId);
        return stageDef?.triggers_task_status;
      };
      // undefined means "nothing configured at any level" -> fall back to the hardcoded map.
      // Any resolved string (including '') is used as-is: '' correctly falls through the
      // `if (potentialNewStatus && ...)` check below and triggers no status change at all,
      // rather than being mistaken for "not configured" and silently falling back to the map.
      const resolvedTrigger = resolveConfiguredTrigger();
      const potentialNewStatus = resolvedTrigger !== undefined ? resolvedTrigger.trim() : STAGE_STATUS_MAPPING[stageId.toLowerCase()];
      const isSkipped = updatedExtractedDetails?.status === 'skipped';
      const isCleared = updatedExtractedDetails?.isCleared === true;

      // Blanket "complete/skip stages in order" guard — the actual save-time enforcement behind
      // EditableStageCell.tsx's stagesBlockingOrder and this file's getStageMergedState, which
      // are UI-only locks a save triggered through any other path wouldn't otherwise respect.
      // Clearing/undoing a stage is always allowed regardless of order since it can only move a
      // task backward, never skip ahead. enforceStageOrder is false for superadmins and anyone
      // granted tasks.bypass_sequential_stages (Access Control Matrix).
      // A stage that already has its own data was already rendered as editable (see the "already
      // has data" exemption in EditableStageCell.tsx/getStageMergedState) — never retroactively
      // block updating/re-saving it just because an earlier stage is still open.
      const currentStageOwnData = task?.stages?.[stageId];
      const currentStageHasData = !!(currentStageOwnData?.date || currentStageOwnData?.status || currentStageOwnData?.value || currentStageOwnData?.completedAt);
      if (enforceStageOrder && !isCleared && !currentStageHasData) {
        const sortedStages = [...(stages || [])].sort((a: any, b: any) => (a.order_num || 0) - (b.order_num || 0));
        const enhancedTaskEntry = enhancedTasksData.get(task.id?.toString());
        const enhancedTasksMap = enhancedTaskEntry ? new Map([[task.id.toString(), enhancedTaskEntry]]) : undefined;
        for (const other of sortedStages) {
          if (other.id === stageId) break;
          if (!isStageApplicableToTask(other, task, departments)) continue;
          if (!stageApplicabilityConditionsMet(other, task, enhancedTasksMap)) continue;
          const otherData = task?.stages?.[other.id];
          if (isStageOptionalForTask(other, task, departments)) {
            const hasData = !!(otherData?.date || otherData?.status || otherData?.value || otherData?.completedAt);
            if (!hasData) continue;
          }
          if (otherData?.status !== 'completed' && otherData?.status !== 'skipped') {
            toast({
              title: "Complete Earlier Stages First",
              description: `"${other.name}" must be completed or skipped before this stage.`,
              variant: "destructive"
            });
            return;
          }
        }
      }

      let taskStatusUpdate = {};
      const timestamp = new Date().toISOString();


      // 4. Determine if Status Should Update (only for completed stages, not skipped/cleared)
      if (potentialNewStatus && !isSkipped && !isCleared) {
        const currentPriority = STATUS_PRIORITY[currentStatusKey] ?? 0;
        const newPriority = STATUS_PRIORITY[potentialNewStatus] ?? 0;

        if (newPriority > currentPriority) {
          taskStatusUpdate = { status: potentialNewStatus };
        }
      }

      const stageUpdate: any = {
        ...task.stages?.[stageId],
        date: statusValue, // Use statusValue instead of value
        updatedAt: timestamp,
        officer_ids: task.stages?.[stageId]?.officer_ids || stages?.find((s: any) => s.id === stageId)?.officer_ids || []
      };

      // Handle extracted data if provided
      if (extractedData && Object.keys(extractedData).length > 0) {
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

      // Clearing removes the stage's entry entirely rather than leaving a stub with
      // status: 'in_progress' - a leftover stub is picked up as-is by getCurrentStageStatus
      // (overall-view/tableUtils.tsx) and rendered as the stage's status, so a "cleared"
      // stage would still show "In Progress" instead of looking untouched.
      const updatedStages = { ...task.stages };
      if (isCleared) {
        delete updatedStages[stageId];
      } else {
        updatedStages[stageId] = stageUpdate;
      }

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

      // 7b. Snapshot Processing/Issuance requirement documents when their gating stage completes
      if (!isSkipped && !isCleared) {
        const normalizedStageId = stageId.toLowerCase();
        if (normalizedStageId === REQUIREMENTS_LOCK_STAGE_IDS.PROCESSING || normalizedStageId === REQUIREMENTS_LOCK_STAGE_IDS.ISSUANCE) {
          await captureRequirementsDocumentsSnapshot({ ...task, stages: updatedStages }, normalizedStageId);
        }
      }

      // 8. Update local state directly
      setTasks(prevTasks => prevTasks.map(t =>
        t.id.toString() === taskId.toString()
          ? { ...t, ...taskStatusUpdate, stages: updatedStages, updated_at: timestamp }
          : t
      ));
      clearTasksCache(activeDepartmentTab, activeSubdepartmentTab);

      const successMessage = isSkipped
        ? 'Stage marked as skipped'
        : isCleared
          ? 'Stage cleared'
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
  }, [tasks, stages, departments, enforceStageOrder, enhancedTasksData, isStageApplicableToTask, determineCurrentStage, activeDepartmentTab, activeSubdepartmentTab, clearTasksCache]);

  const generateEnhancedTableRows = useCallback(async (tasks: UtilTask[]) => {
    if (!tasks.length) return [];

    // Create cache key based on tasks, stages, and visibility settings
    const cacheKey = JSON.stringify({
      taskIds: tasks.map(t => t.id).sort(),
      stageIds: stages.map(s => s.id).sort(),
      visibleStageIds: Array.from(visibleStageIds).sort(),
      showNAStages,
      showOptionalStages,
      showDelta,
      expandedSections: Array.from(expandedSections).sort(),
      visibleStats: Array.from(visibleStats).sort(),
      reportDocDefaults: reportDocDefaults?.map(d => d.id) || []
    });

    const cached = tableRowsCacheRef.current.get(cacheKey);
    const now = Date.now();

    // Return cached rows if still valid
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return cached.rows;
    }

    // Filter stages based on visibility
    const allStages = stages
      .filter(stage => stage && visibleStageIds.has(stage.id.toString()))
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

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
      let lastRenderedStage: any = null;
      for (let stageIdx = 0; stageIdx < allStages.length; stageIdx++) {
        const stage = allStages[stageIdx];
        const isApplicableToAnyTask = tasks.some(task => isStageApplicableToTask(stage, task, departments));

        // Optional/branch stages (StageAllocation.display === false, e.g. "Deferred
        // (Depends)") stay hidden by default — same "relevant to anyone in the visible set"
        // convention as the N/A check above — unless it's actually required (non-optional) for
        // at least one visible task, or a task already has data recorded for it (a case that
        // genuinely went down that branch keeps showing it even with the toggle off).
        const isNonOptionalForAnyTask = tasks.some(task =>
          isStageApplicableToTask(stage, task, departments) && !isStageOptionalForTask(stage, task, departments)
        );
        const hasDataForAnyTask = tasks.some(task => {
          const stageData = task.stages?.[stage.id];
          return !!(stageData?.date || stageData?.status || stageData?.value || stageData?.completedAt);
        });
        const shouldHideAsOptional = !isNonOptionalForAnyTask && !hasDataForAnyTask;

        if ((showNAStages || isApplicableToAnyTask) && (showOptionalStages || !shouldHideAsOptional)) {
          // "Show Δ" — one row per gap between two rendered stage rows, showing the day-count
          // between them per task (walking back through every stage since lastRenderedStage if
          // this stage's immediate predecessor isn't dated yet). Same algorithm as
          // reports/StandardReportView.tsx's Δ column — see computeStageDeltaDays.
          if (showDelta && lastRenderedStage) {
            const priorStages = allStages.slice(0, stageIdx);
            rows.push({
              key: `delta_${lastRenderedStage.id}_${stage.id}`,
              label: 'Δ',
              type: 'delta',
              isSubRow: false,
              getValue: (task: UtilTask) => computeStageDeltaDays(task, priorStages, stage)
            });
          }
          lastRenderedStage = stage;

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

    // Report Docs Section
    if (reportDocDefaults && reportDocDefaults.length > 0) {
      rows.push({ key: 'section_header_report_docs', type: 'section_header', label: `Report Documents (${reportDocDefaults.length})`, id: 'report_docs', icon: FileText });

      if (expandedSections.has('report_docs')) {
        reportDocDefaults.forEach((doc, idx) => {
          rows.push({
            key: `report_doc_${doc.id}`,
            label: doc.documentName || 'Unknown Document',
            type: 'report_doc',
            reportDoc: doc,
            stageOrder: doc.order + 1,
            isSubRow: false,
            getValue: () => doc
          });
        });
      }
    }

    rows.push({ key: 'section_header_actions', type: 'section_header', label: 'Actions', id: 'actions', icon: Edit })

    if (expandedSections.has('actions')) {
      rows.push({ key: 'actions_row', type: 'actions', label: 'Actions', id: 'actions' })
    }

    // Cache the generated rows
    tableRowsCacheRef.current.set(cacheKey, {
      rows,
      timestamp: now
    });

    return rows
  }, [stages, expandedSections, expandedStages, expandedDocuments, getKycFields, visibleStats, kycDocuments, allDocuments, visibleStageIds, getDocumentForTaskStage, departments, showDelta, showNAStages, showOptionalStages, isStageApplicableToTask, reportDocDefaults])

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

  const handleReportDocUpload = useCallback((task: any, reportDoc: any, entityType: 'principal' | 'dependant' | 'company', entityId: number | string, entityName: string) => {
    setReportDocUpload({ task, reportDoc, entityType, entityId, entityName });
  }, []);

  const handleReportDocUploadSuccess = useCallback(async () => {
    setReportDocUpload(null);
    await loadTasksData(activeDepartmentTab, activeSubdepartmentTab, true, true);
  }, [activeDepartmentTab, activeSubdepartmentTab, loadTasksData]);

  const handleDeleteDocument = useCallback(async (documentId: string) => {
    console.log('[DEBUG] DepartmentTasksManager.handleDeleteDocument called with documentId:', documentId, typeof documentId);
    try {
      const docToDelete = allDocuments.find(doc => doc.id === documentId);
      console.log('[DEBUG] DepartmentTasksManager.handleDeleteDocument: lookup in allDocuments', {
        found: !!docToDelete,
        allDocumentsCount: allDocuments.length,
        sampleIdType: allDocuments[0] ? typeof allDocuments[0].id : 'n/a',
        docToDelete,
      });

      if (docToDelete?.file_path) {
        const filePath = docToDelete.file_path.startsWith('kyc-documents/')
          ? docToDelete.file_path.substring('kyc-documents/'.length)
          : docToDelete.file_path;
        const { data: storageData, error: storageError } = await supabase.storage.from('kyc-documents').remove([filePath]);
        console.log('[DEBUG] DepartmentTasksManager.handleDeleteDocument: storage remove result', { filePath, storageData, storageError });
      } else {
        console.warn('[DEBUG] DepartmentTasksManager.handleDeleteDocument: no file_path found, skipping storage removal');
      }

      const { data: deletedRows, error: dbError } = await supabase
        .from('acc_portal_directors_documents')
        .delete()
        .eq('id', documentId)
        .select();

      console.log('[DEBUG] DepartmentTasksManager.handleDeleteDocument: db delete result', {
        documentId,
        deletedRows,
        deletedCount: deletedRows?.length ?? 0,
        dbError,
      });

      if (dbError) throw dbError;

      if (!deletedRows || deletedRows.length === 0) {
        console.error('[DEBUG] DepartmentTasksManager.handleDeleteDocument: delete matched 0 rows - likely wrong id or blocked by RLS policy', documentId);
        throw new Error(`No document row was deleted for id ${documentId}. Check that the id is correct and that RLS policies allow DELETE on acc_portal_directors_documents.`);
      }

      toast({
        title: 'Success',
        description: 'Document deleted successfully',
        variant: 'success',
      });

      // Close the preview
      setPreviewDocument(null);

      // Refresh the tasks silently to update the UI without showing loading state
      await loadTasksData(activeDepartmentTab, activeSubdepartmentTab, true, true);
    } catch (error) {
      console.error('[DEBUG] DepartmentTasksManager.handleDeleteDocument: caught error', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete document',
        variant: 'destructive',
      });
    }
  }, [allDocuments, activeDepartmentTab, activeSubdepartmentTab, loadTasksData]);

  // Clear cache when manually refreshing
  const clearCacheAndRefresh = useCallback(() => {
    tasksCacheRef.current.clear();
    tableRowsCacheRef.current.clear();
    refreshAllData();
  }, [refreshAllData]);

  const handleViewDocument = useCallback(async (task: any, stage: any) => {
    try {
      const linkedDocs = getDocumentForTaskStage(task, stage);

      if (linkedDocs.length === 0) {
        toast({
          title: 'No Linked Document',
          description: `No document has been linked for this stage yet. Please use the 'Link' button to link a document first.`,
          variant: 'warning',
        });
        return;
      }

      // Use the first linked document for preview
      const document = linkedDocs[0];

      if (document.indicator === true) {
        toast({
          title: 'Preview not available',
          description: 'Document preview is not available for this document.',
          variant: 'warning',
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
        onDelete: () => handleDeleteDocument(document)
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

  const handleTaskEdit = (task: UtilTask) => {
    console.log('[handleTaskEdit] Opening edit for task:', {
      id: task.id,
      job_description: task.job_description,
      job_level: task.job_level,
      individual_id: task.individual_id,
      company_id: task.company_id,
      applicant_details: task.applicant_details,
      participants_details: task.participants_details,
      job_specific_answers: task.job_specific_answers,
      date_initiated: task.date_initiated,
      renewal_status: task.renewal_status,
      duration: task.duration,
    });
    // Get the department for this task
    const department = departments.find(d =>
      d.id === task.department_id ||
      d.id.toString() === task.department_id?.toString()
    );
    const entityTypes = department?.entity_types || [];
    setEditingTask(task);
    if (entityTypes.includes('company')) {
      setCompanyInquiryDialogOpen(true);
    } else {
      setEditDialogOpen(true);
    }
  };

  const handleTaskUpdate = (updatedTask: any) => {
    onTaskUpdate?.(updatedTask);
    setEditDialogOpen(false);
    setEditingTask(null);
    setTasks(prevTasks => prevTasks.map(t => t.id === updatedTask.id ? updatedTask : t));
    const cacheKey = `${activeDepartmentTab}-${activeSubdepartmentTab || 'all'}`;
    tasksCacheRef.current.delete(cacheKey);
  }

  const handleCancelTask = async (task: any, reason: string) => {
    try {
      const { error } = await supabase
        .from('tm_tasks')
        .update({
          status: 'cancel',
          cancellation_details: {
            reason: reason,
            cancelled_at: new Date().toISOString(),
            cancelled_by: userData?.user?.id || null,
            previous_status: task.status || 'pending'
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id);

      if (error) throw error;

      // Update tasks list
      setTasks(prevTasks =>
        prevTasks.map(t =>
          t.id === task.id
            ? {
              ...t,
              status: 'cancel',
              cancellation_details: {
                reason: reason,
                cancelled_at: new Date().toISOString(),
                cancelled_by: userData?.user?.id || null,
                previous_status: task.status || 'pending'
              },
              updated_at: new Date().toISOString()
            }
            : t
        )
      );

      // Clear cache and reload silently (local state already updated above)
      clearTasksCache(activeDepartmentTab, activeSubdepartmentTab);
      await loadTasksData(activeDepartmentTab, activeSubdepartmentTab, true, true);

      toast({
        title: 'Success',
        description: 'Task cancelled successfully',
        variant: 'default'
      });

    } catch (error) {
      console.error('Error cancelling task:', error);
      toast({
        title: 'Error',
        description: 'Failed to cancel task. Please try again.',
        variant: 'destructive'
      });
    }
  }

  const handleUncancelTask = async (task: any) => {
    try {
      const previousStatus = task.cancellation_details?.previous_status || 'pending';

      const { error } = await supabase
        .from('tm_tasks')
        .update({
          status: previousStatus,
          cancellation_details: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id);

      if (error) throw error;

      // Update tasks list
      setTasks(prevTasks =>
        prevTasks.map(t =>
          t.id === task.id
            ? {
              ...t,
              status: previousStatus,
              cancellation_details: null,
              updated_at: new Date().toISOString()
            }
            : t
        )
      );

      // Clear cache and reload silently (local state already updated above)
      clearTasksCache(activeDepartmentTab, activeSubdepartmentTab);
      await loadTasksData(activeDepartmentTab, activeSubdepartmentTab, true, true);

      toast({
        title: "Task reactivated successfully",
        description: "The task has been restored to its previous status."
      });
    } catch (err) {
      console.error('Error reactivating task:', err);
      toast({
        title: "Error",
        description: "Failed to reactivate task. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleEnquiryCreated = useCallback((result: any) => {
    setTasks(prevTasks => {
      const exists = prevTasks.some(t => t.id === result.id);
      return exists
        ? prevTasks.map(t => t.id === result.id ? result : t)
        : [result, ...prevTasks];
    });
    // Invalidate cache so the next navigation triggers a fresh fetch
    const cacheKey = `${activeDepartmentTab}-${activeSubdepartmentTab || 'all'}`;
    tasksCacheRef.current.delete(cacheKey);
    onTaskUpdate?.(result);
  }, [activeDepartmentTab, activeSubdepartmentTab, onTaskUpdate])

  const handleTaskAction = useCallback((action: { type: string; taskId?: string | number;[key: string]: any }) => {
    const STATUS_PRIORITY: Record<string, number> = {
      pending: 0, new: 0, enquiry: 0, in_progress: 1, write_up_completed: 2, endorsed: 3
    };
    const STATUS_TAB_MAP: Record<string, string> = {
      enquiry: 'enquiries', new: 'enquiries', pending: 'enquiries',
      in_progress: 'wip-stages',
      write_up_completed: 'write_up_completed',
      endorsed: 'endorsed',
      cancelled: 'cancelled'
    };

    switch (action.type) {
      case 'task-updated':
        if (action.task?.id) {
          let nextStatus: string | undefined;
          setTasks(prevTasks =>
            prevTasks.map(existingTask => {
              if (existingTask.id !== action.task.id) return existingTask;

              // Never downgrade status from a higher-priority local state
              // (guards against stale task refs in dialogs opened before a realtime update)
              const existingPriority = STATUS_PRIORITY[existingTask.status] ?? -1;
              const incomingPriority = STATUS_PRIORITY[action.task?.status] ?? -1;
              const effectiveStatus = incomingPriority >= existingPriority
                ? action.task.status
                : existingTask.status;

              nextStatus = effectiveStatus;

              return {
                ...existingTask,
                ...action.task,
                status: effectiveStatus,
                stages: action.task.stages || existingTask.stages,
                source_document_id: action.task.source_document_id ?? existingTask.source_document_id,
                updated_at: action.task.updated_at || existingTask.updated_at
              };
            })
          );
          clearTasksCache(activeDepartmentTab, activeSubdepartmentTab);

          // Auto-switch to the tab where the task now lives when status changed
          if (nextStatus && STATUS_TAB_MAP[nextStatus] && STATUS_TAB_MAP[nextStatus] !== activeSubTab) {
            setActiveSubTab(STATUS_TAB_MAP[nextStatus]);
          }

          // A stage upload inserts straight into acc_portal_directors_documents (individual
          // tasks) or acc_portal_kyc_uploads (company tasks) via Supabase, bypassing this
          // component entirely — allDocuments/allCompanyDocuments (only ever populated by
          // refreshAllData's fetch calls) would otherwise stay stale until a manual Refresh,
          // which is exactly why the preview icon wouldn't show up right after a successful
          // upload. Merge the newly-inserted row(s) in immediately instead of waiting on that
          // refetch.
          if (action.newDocuments?.length) {
            setAllDocuments(prevDocs => {
              const byId = new Map(prevDocs.map((d: any) => [d.id, d]));
              action.newDocuments.forEach((d: any) => byId.set(d.id, d));
              return Array.from(byId.values());
            });
          }
          if (action.newCompanyDocuments?.length && action.companyId) {
            setAllCompanyDocuments(prev => {
              const existing = prev[action.companyId] || [];
              const byId = new Map(existing.map((d: any) => [d.id, d]));
              action.newCompanyDocuments.forEach((d: any) => byId.set(d.id, d));
              return { ...prev, [action.companyId]: Array.from(byId.values()) };
            });
          }

          // After a stage upload, silently confirm DB state matches the optimistic update
          if (action.source === 'stage-upload') {
            loadTasksData(activeDepartmentTab, activeSubdepartmentTab, true, true);
          }
        }
        break
      case 'refresh':
      case 'refresh-data':
        refreshAllData()
        break
      default:
        onTaskAction?.(action)
    }
  }, [onTaskAction, activeDepartmentTab, activeSubdepartmentTab, activeSubTab, refreshAllData, loadTasksData])

  // The transposed view's stage rows normally split into 4 sub-columns (Date/Status/Upload/
  // Other — see EnhancedTable's MemoizedTableRow). When a stage is N/A for a task (not
  // applicable to its job level) or locked (an unmet dependency), that's the SAME state
  // regardless of sub-column, so showing it 4 times just repeats identical text across 4 boxes.
  // This tells EnhancedTable when that's the case so it can render ONE merged cell instead —
  // returns null for the normal case (still render the 4-way split).
  // Mirrors EditableStageCell.tsx's own handleJumpToStage — scrolls the named blocking stage's
  // cell (same task, different stage, found via the data-stage-cell attribute every stage cell
  // carries, whether rendered by EditableStageCell itself or by this transposed merged-state
  // path below) into view and briefly flashes it. Plain DOM lookup since the target is rendered
  // by a sibling cell this callback has no other reference to.
  const handleJumpToStage = useCallback((taskId: any, targetStageId: string) => {
    if (typeof document === 'undefined' || taskId == null) return;
    const el = document.querySelector(`[data-stage-cell="${taskId}::${targetStageId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    el.classList.remove('stage-jump-highlight');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('stage-jump-highlight');
    setTimeout(() => el.classList.remove('stage-jump-highlight'), 1500);
  }, []);

  const getStageMergedState = useCallback((row: any, task: any): React.ReactNode | null => {
    if (row.type !== 'stage' || !row.stage) return null;
    const value = row.getValue?.(task) ?? '';
    if (value === 'N/A' || (typeof value === 'object' && value?.status === 'N/A')) {
      return <span className="text-sm text-gray-400 italic">N/A</span>;
    }

    // Mirrors EditableStageCell.tsx's own isDependencyMet check (tasks/components/
    // EditableStageCell.tsx) — duplicated rather than shared since that component computes it
    // from its own stage/task props and there's no exported helper for it yet.
    const deps = row.stage?.dependencies || [];
    if (deps.length > 0) {
      const waitingOn: { id: string; name: string }[] = [];
      for (const dep of deps) {
        const parentStageData = task?.stages?.[dep.stageId];
        const hasData = parentStageData?.date || parentStageData?.value || parentStageData?.status;
        const isCompleted = parentStageData?.status === 'completed';
        const unmet = (dep.dependencyType === 'visible_when_completed' || dep.dependencyType === 'sequential')
          ? !isCompleted
          : dep.dependencyType === 'visible_when_started' ? !hasData : false;
        if (unmet) waitingOn.push({ id: dep.stageId, name: dep.stageName || 'Unknown' });
      }
      if (waitingOn.length > 0) {
        return (
          <div data-stage-cell={`${task?.id}::${row.stage.id}`} className="mx-auto w-fit">
            <HoverCard openDelay={100} closeDelay={200}>
              <HoverCardTrigger asChild>
                <div className="flex items-center gap-1.5 px-1 py-0.5 rounded bg-gray-50 border border-dashed border-gray-200 cursor-help">
                  <LockIcon className="h-3 w-3 text-gray-300 shrink-0" />
                  <span className="text-[10px] text-gray-300 italic truncate">Locked</span>
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="w-auto max-w-xs">
                <p className="text-xs text-slate-500 mb-1.5">Waiting for:</p>
                <div className="flex flex-col items-start gap-1">
                  {waitingOn.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="text-xs text-blue-600 hover:underline text-left"
                      title="Jump to this stage"
                      onClick={(e) => { e.stopPropagation(); handleJumpToStage(task?.id, s.id); }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>
        );
      }
    }

    // Mirrors EditableStageCell.tsx's own stagesBlockingOrder check (same duplication
    // rationale as the dependency block above) — the blanket "complete/skip stages in order"
    // rule, gated by enforceStageOrder (true unless the user has tasks.bypass_sequential_stages
    // or is a superadmin).
    // A stage that already has its own data must always render it — the lock only stops a
    // still-empty stage being entered before its predecessors, never hides existing data.
    const ownStageData = task?.stages?.[row.stage.id];
    const rowStageHasData = !!(ownStageData?.date || ownStageData?.status || ownStageData?.value || ownStageData?.completedAt);
    if (enforceStageOrder && stages.length > 0 && !rowStageHasData) {
      const sorted = [...stages].sort((a: any, b: any) => (a.order_num || 0) - (b.order_num || 0));
      const enhancedTaskEntry = enhancedTasksData.get(task.id?.toString());
      const orderWaitingOn: { id: string; name: string }[] = [];
      for (const other of sorted) {
        if (other.id === row.stage.id) break;
        if (!isStageApplicableToTask(other, task, departments)) continue;
        if (!stageApplicabilityConditionsMet(other, task, enhancedTaskEntry ? new Map([[task.id.toString(), enhancedTaskEntry]]) : undefined)) continue;
        const otherData = task?.stages?.[other.id];
        if (isStageOptionalForTask(other, task, departments)) {
          const hasData = !!(otherData?.date || otherData?.status || otherData?.value || otherData?.completedAt);
          if (!hasData) continue;
        }
        if (otherData?.status !== 'completed' && otherData?.status !== 'skipped') orderWaitingOn.push({ id: other.id, name: other.name || 'Unknown' });
      }
      if (orderWaitingOn.length > 0) {
        return (
          <div data-stage-cell={`${task?.id}::${row.stage.id}`} className="mx-auto w-fit">
            <HoverCard openDelay={100} closeDelay={200}>
              <HoverCardTrigger asChild>
                <div className="flex items-center gap-1.5 px-1 py-0.5 rounded bg-gray-50 border border-dashed border-gray-200 cursor-help">
                  <LockIcon className="h-3 w-3 text-gray-300 shrink-0" />
                  <span className="text-[10px] text-gray-300 italic truncate">Locked</span>
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="w-auto max-w-xs">
                <p className="text-xs text-slate-500 mb-1.5">Waiting for:</p>
                <div className="flex flex-col items-start gap-1">
                  {orderWaitingOn.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="text-xs text-blue-600 hover:underline text-left"
                      title="Jump to this stage"
                      onClick={(e) => { e.stopPropagation(); handleJumpToStage(task?.id, s.id); }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>
        );
      }
    }
    return null;
  }, [enforceStageOrder, stages, departments, isStageApplicableToTask, enhancedTasksData, handleJumpToStage]);

  const renderCellContent = useCallback((row: any, task: any, columnType?: 'date' | 'actions' | 'combined' | 'status' | 'upload' | 'other') => {
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
    // Handle report document cells (uses EditableStageCell for a uniform look/feel with stages)
    if (row.type === 'report_doc') {
      return renderReportDocCell(row, task, columnType || 'combined');
    }
    // "Show Δ" row/column — day-gap between two stage dates (computeStageDeltaDays).
    if (row.type === 'delta') {
      const { days } = value as { days: number | null; bridgedFrom: any | null };
      if (days === null) return <span className="text-slate-300 text-sm">—</span>;
      return (
        <span className={cn(
          "text-sm font-bold tabular-nums",
          days < 0 ? "text-red-600" : days > 30 ? "text-rose-500" : days > 14 ? "text-amber-500" : "text-slate-500"
        )}>
          {days >= 0 ? `+${days}d` : `${days}d`}
        </span>
      );
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
    getKycFields,
    handleReportDocUpload
  ]);

  const renderReportDocCell = (row: any, task: any, renderMode: 'date' | 'actions' | 'combined' | 'status' | 'upload' | 'other' = 'combined') => {
    const { reportDoc, entityType, entityId, entityName, colRecords = [] } = row;

    // Synthetic "stage" so EditableStageCell can render report docs identically to task stages
    const reportDocStage = {
      id: `report-doc-${reportDoc.documentId}-${entityType}-${entityId}`,
      name: reportDoc.documentName,
      documents: [{ id: reportDoc.documentId, kycId: reportDoc.documentId, name: reportDoc.documentName }],
      follow_up: null,
      estimated_time: 0,
    };

    return (
      <EditableStageCell
        key={reportDocStage.id}
        stage={reportDocStage}
        task={task}
        value={colRecords.length > 0 ? 'uploaded' : ''}
        onSave={async () => { }}
        onDocumentUpload={isReadOnly ? undefined : () => handleReportDocUpload(task, reportDoc, entityType, entityId, entityName)}
        departments={departments}
        getKycFields={getKycFields}
        linkedDocuments={colRecords}
        renderMode={renderMode}
        taskName={task.applicant_name}
        clientName={task.client_name || task.clientName}
        onFetchData={() => loadTasksData(activeDepartmentTab, activeSubdepartmentTab, true, true)}
        readOnly={isReadOnly}
      />
    );
  };

  const renderEditableStageCell = (row: any, task: any, renderMode: 'date' | 'actions' | 'status' | 'upload' | 'other' = 'date') => {
    const requiresUpload = row.stage?.requires_upload !== false;
    const linkedDocs = getDocumentForTaskStage(task, row.stage);
    const stageData = task.stages?.[row.stage.id];
    const cellValue = stageData?.date || stageData?.status || null;

    return (
      <EditableStageCell
        key={`${row.stage.id}-${renderMode}`}
        stage={row.stage}
        stages={stages}
        task={task}
        value={cellValue}
        onSave={isReadOnly ? undefined : enhancedHandleStageStatusSave}
        onDocumentUpload={isReadOnly ? undefined : handleStageDocumentUpload}
        onShowDocuments={handleViewDocument}
        requiresUpload={requiresUpload}
        departments={departments}
        enhancedTaskData={enhancedTasksData.get(task.id?.toString())}
        onAutomationClick={isReadOnly ? undefined : (e) => handleAutomationClick(e, row.stage, task.id)}
        getKycFields={getKycFields}
        kycDocuments={kycDocuments}
        linkedDocuments={linkedDocs}
        renderMode={renderMode}
        taskName={task.name}
        clientName={task.client_name || task.clientName}
        onFetchData={() => loadTasksData(activeDepartmentTab, activeSubdepartmentTab, true, true)}
        onDocumentTypeFixed={refreshDocumentsAndTasks}
        officers={realOfficers}
        onOfficerChange={isReadOnly ? undefined : updateTaskOfficer}
        readOnly={isReadOnly}
        onOpenRequirements={handleOpenRequirements}
        showTime={showTime}
        enforceStageOrder={enforceStageOrder}
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
    if (isReadOnly) {
      return (
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setLinkingTask(task); setIsLinkDialogOpen(true); }}
            className="h-8 w-8 text-blue-600 hover:bg-blue-100"
            title="View linked documents"
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { setLinkingTask(task); setIsLinkDialogOpen(true); }}
          className="h-8 w-8 text-blue-600 hover:bg-blue-100"
          title="Link source documents"
        >
          <LinkIcon className="h-4 w-4" />
        </Button>

        {availableBundles.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-emerald-600 hover:bg-emerald-100"
                title="Push case to another department"
                disabled={isPushingCase}
              >
                {isPushingCase ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {availableBundles.map((bundle) => (
                <DropdownMenuItem
                  key={bundle.id}
                  onClick={() => handlePushCase(task, bundle)}
                  disabled={isPushingCase}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Push to {bundle.displayName}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setSelectedTaskForOfficers(task);
            setSelectedStageForOfficers(determineCurrentStage(task, stages));
            setAssignOfficersDialogOpen(true);
          }}
          className="h-8 w-8 text-purple-600 hover:bg-purple-100"
          title="Assign officers"
        >
          <UserPlus className="h-4 w-4" />
        </Button>

        {task.status === 'cancel' ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setTaskToUncancel(task); setUncancelDialogOpen(true); }}
            className="h-8 w-8 text-green-600 hover:bg-green-100"
            title="Reactivate task"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setTaskToCancel(task); setCancelDialogOpen(true); }}
            className="h-8 w-8 text-orange-600 hover:bg-orange-100"
            title="Cancel task"
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleTaskEdit(task)}
          className="h-8 w-8 text-slate-600 hover:bg-slate-100"
          title="Edit Task"
        >
          <Edit className="h-4 w-4" />
        </Button>

        <DeleteButton task={task} />
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
        {loadingBundles ? (
          <DropdownMenuItem disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading bundles...
          </DropdownMenuItem>
        ) : availableBundles.length > 0 ? (
          availableBundles.map((bundle) => (
            <DropdownMenuItem
              key={bundle.id}
              onClick={() => handlePushCase(task, bundle)}
              disabled={isPushingCase}
            >
              <Send className="mr-2 h-4 w-4" />
              Push to {bundle.displayName}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>
            <AlertCircle className="mr-2 h-4 w-4" />
            No task bundles available
          </DropdownMenuItem>
        )}
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

  const handleOpenRequirements = useCallback(async (task: any) => {
    try {
      // The task already has requirements and job_level from fetchTasks
      // We only need to fetch job_specific_questions from class requirements
      // and build the automationWebdataMap from the task's requirements

      // Fetch class requirements to get job_specific_questions
      const { data: requirementsData, error } = await supabase
        .from('tm_class_requirements')
        .select('*');

      if (error) {
        console.error('Error fetching requirements:', error);
      }

      // Filter requirements matching this task's job level
      const taskDeptId = task.department_id || task.department?.id;
      const taskSubdeptId = task.subdepartment_id || task.subdepartment?.id;
      const taskClassId = task.class_id || task.class?.id;

      const matchingReq = (requirementsData || []).find((req: any) => {
        const rjl = req.job_level || {};
        if (String(rjl.department_id) === String(taskDeptId) &&
          String(rjl.subdepartment_id) === String(taskSubdeptId) &&
          String(rjl.class_id || 'null') === String(taskClassId || 'null')) {
          return true;
        }
        return false;
      });

      // Build automationWebdataMap from the task's existing requirements AND from
      // stage/document targetEntities matching this task's job level - same two-source
      // linkage fetchJobWorkspaceData.ts uses for RequirementsTab.tsx. Without the
      // stage-linked source, any client-requirement field sourced from a stage-level
      // automation (rather than a requirement's own web_automation) would silently show
      // as blank/"Pending Input" only when this dialog is opened from DepartmentTasksManager.
      const automationIds = new Set<string>();
      (task.requirements || []).forEach((req: any) => {
        if (req.web_automation?.automationId) automationIds.add(req.web_automation.automationId);
      });
      const jlKey = (jl: any) => `${jl?.subdepartment_id}:${jl?.class_id || 0}:${jl?.subclass_id || 0}`;
      const taskJobLevelKey = jlKey(task.job_level || {});
      (stages || []).forEach((stage: any) => {
        (stage.documents || []).forEach((doc: any) => {
          (doc.targetEntities || []).forEach((te: any) => {
            if (te.automationId && te.job_level && jlKey(te.job_level) === taskJobLevelKey) {
              automationIds.add(te.automationId);
            }
          });
        });
      });

      let automationWebdataMap: Record<string, { name: string; webdata: any[] }> = {};
      let autos: any[] = [];
      if (automationIds.size > 0) {
        const { data } = await supabase
          .from('tm_automations')
          .select('*')
          .in('id', Array.from(automationIds));
        autos = data || [];

        autos.forEach((auto: any) => {
          if (auto.webdata?.length > 0) {
            automationWebdataMap[auto.id] = { name: auto.name || 'Unknown', webdata: auto.webdata };
          }
        });
      }

      // Same relationshipData shape as RequirementsTab.tsx (job-workspace) - keeps
      // field resolution identical between both places SendRequirementsDialog opens from.
      const participants = task.participants_details || [];
      const applicant = task.applicant_details || {};
      const companyParticipant = participants.find((p: any) => p.type === 'company');
      const isApplicantDependant = applicant.role === 'dependant' || (Array.isArray(applicant.role) && applicant.role.includes('dependant'));
      let principal = participants.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal'));
      let dependants = participants
        .filter((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('dependant') : p.role === 'dependant'))
        .map((dep: any) => ({ id: dep.id, name: dep.name, relationship: dep.relationship || 'dependant' }));
      if (isApplicantDependant) {
        if (!dependants.find((d: any) => d.id === applicant.id)) {
          dependants.push({ id: applicant.id || task?.individual_id, name: applicant.name, relationship: applicant.relationship || 'dependant' });
        }
      } else if (!principal) {
        principal = { id: applicant.id || task?.individual_id, name: applicant.name, role: applicant.role };
      }
      const relationshipData = [{
        company: { id: companyParticipant?.id || task?.company_id, name: companyParticipant?.name || task?.company_name || 'Company', type: 'company' },
        principal: principal ? { id: principal.id, name: principal.name, role: principal.role } : null,
        directors: participants
          .filter((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? (p.role.includes('director') || p.role.includes('shareholder')) : (p.role === 'director' || p.role === 'shareholder')))
          .map((d: any) => ({ id: d.id, name: d.name, role: d.role })),
        dependants,
        understudy: (() => {
          const up = participants.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('understudy') : p.role === 'understudy'));
          return up ? { id: up.id, name: up.name } : null;
        })(),
        sponsor: (() => {
          const sp = participants.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('sponsor') : p.role === 'sponsor'));
          return sp ? { id: sp.id, name: sp.name } : null;
        })()
      }];

      const fieldData = await resolveAutomationFieldData(autos, relationshipData, task);

      // Enrich task with job_specific_questions from class requirements, keep existing requirements and job_level
      const enrichedTask = {
        ...task,
        job_specific_questions: matchingReq?.job_specific_questions || [],
      };

      setRequirementsDialogTask(enrichedTask);
      setAutomationWebdataMapState(automationWebdataMap);
      setRequirementsDialogFieldData({ ...fieldData, relationshipData });
    } catch (err) {
      console.error('Error in handleOpenRequirements:', err);
      setRequirementsDialogTask(task);
    }
  }, [stages]);

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

  const getSortValueForTask = useCallback((task: any, key: string): string | number | null => {
    if (key.startsWith('stage_')) {
      const stageId = key.replace('stage_', '');
      const stageData = task.stages?.[stageId];
      if (!stageData) return -1;
      const status = stageData.status || 'pending';
      return STAGE_PRIORITY[status] ?? 0;
    }
    return null;
  }, []);

  const getSortedTasks = useCallback((tasksToRender: UtilTask[]) => {
    return sortTasks(tasksToRender, sortConfig, companies, getSortValueForTask)
  }, [sortConfig, companies, getSortValueForTask])

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
      setIsLinkDialogOpen,
      handleCancelTask,
      setTaskToCancel,
      setCancelDialogOpen,
      handleUncancelTask,
      setTaskToUncancel,
      setUncancelDialogOpen,
      realOfficers,
      stages,
      (task) => {
        setSelectedTaskForOfficers(task);
        setSelectedStageForOfficers(determineCurrentStage(task, stages));
        setAssignOfficersDialogOpen(true);
      }
    );
  }, [
    departments,
    realOfficers,
    stages,
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
    setIsLinkDialogOpen,
    handleCancelTask,
    setTaskToCancel,
    setCancelDialogOpen,
    handleUncancelTask,
    setTaskToUncancel,
    setUncancelDialogOpen
  ]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const handleNewEnquiryClick = () => {
    // Determine which dialog to open based on department entity types
    const currentDept = departments.find(d => String(d.id) === activeDepartmentTab);
    const entityTypes = currentDept?.entity_types || [];

    if (entityTypes.includes('company')) {
      setIsOtherDialogOpen(true);  // Company departments use NewCompanyInquiryDialog
    } else {
      setIsEnquiryDialogOpen(true); // Individual departments use EnquiryDialog
    }
  }

  const defaultSubdepartments = getDefaultSubdepartments()

  useEffect(() => {
    if (!isTransposedView) return;

    if (displayedTasks.length > 0) {
      loadRows(displayedTasks);
      return;
    }

    setTableRows(prevRows => (prevRows.length === 0 ? prevRows : []));
  }, [displayedTasks, isTransposedView, loadRows]);

  useEffect(() => {
    if (stages && stages.length > 0) {
      const applicableStages = showNAStages
        ? [...stages]
        : stages.filter(stage => !stage.status || stage.status !== 'N/A');
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
        const [departmentsData, companiesData, documentsData, kycFieldsData, { usersMap: usersData }] = await Promise.all([
          fetchDepartments(),
          fetchCompanies(),
          fetchAllDocuments(),
          fetchAllKycFields(),
          loadUserAssignmentData(),
          fetchLiveTaskCounts(),
        ]);

        setCompanies(companiesData);
        setAllDocuments(documentsData);
        setAllKycFields(kycFieldsData.fieldsMap);
        setKycDocuments(kycFieldsData.kycDocsMap);
        setTmUsers(usersData);
        setDepartments(departmentsData);

        if (departmentsData.length > 0) {
          const targetDept = initialDeptId
            ? (departmentsData.find((d: any) => d.id.toString() === initialDeptId) || departmentsData[0])
            : departmentsData[0];
          setActiveDepartmentTab(targetDept.id.toString());
          // activeSubdepartmentTab is set by the useEffect that watches activeDepartmentTab/departments
          // (it will honour initialSubDeptId on the first run via initialSubDeptApplied ref)
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

  // Deliberately NOT keyed on activeSubdepartmentTab — loadTasksData fetches/caches a whole
  // department at once, so switching sub-department tabs must stay a pure client-side filter
  // (getFilteredTasks) instead of re-triggering this effect and risking a loading-state flash.
  useEffect(() => {
    if (activeDepartmentTab && departments.length > 0) {
      loadTasksData(activeDepartmentTab);
    }
  }, [activeDepartmentTab, departments.length, loadTasksData])

  // Realtime subscription for tm_tasks table
  useEffect(() => {
    if (!activeDepartmentTab) return;

    if (realtimeSubscriptionRef.current) {
      supabase.removeChannel(realtimeSubscriptionRef.current);
      realtimeSubscriptionRef.current = null;
    }

    const subscription = supabase
      .channel(`tm_tasks_changes:${activeDepartmentTab}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tm_tasks'
        },
        async (payload) => {
          const newTask = payload.new as any;
          const oldTask = payload.old as any;
          const isRelevant = isTaskRelevantToActiveView(newTask) || isTaskRelevantToActiveView(oldTask);

          if (!isRelevant) return;

          if (payload.eventType === 'UPDATE') {
            const REALTIME_STATUS_PRIORITY: Record<string, number> = {
              pending: 0, new: 0, enquiry: 0, in_progress: 1, write_up_completed: 2, endorsed: 3
            };
            // Merge DB columns into existing enriched task — no loading state.
            // The raw DB payload lacks enriched fields (department_id/subdepartment_id are
            // stored inside job_level jsonb, not as top-level columns; company_name is
            // join-computed). Spreading newTask over t would overwrite those enriched fields
            // with null, causing getFilteredTasks to drop the task. Re-apply enrichment here.
            setTasks(prevTasks => prevTasks.map(t => {
              if (t.id?.toString() !== newTask?.id?.toString()) return t;
              const existingPriority = REALTIME_STATUS_PRIORITY[t.status] ?? -1;
              const incomingPriority = REALTIME_STATUS_PRIORITY[newTask.status] ?? -1;
              const jobLevel = newTask.job_level || t.job_level || {};
              return {
                ...t,
                ...newTask,
                status: incomingPriority >= existingPriority ? newTask.status : t.status,
                // Re-apply job_level-derived fields — raw DB column may be null
                department_id: jobLevel.department_id ?? t.department_id,
                subdepartment_id: jobLevel.subdepartment_id ?? t.subdepartment_id,
                class_id: jobLevel.class_id ?? t.class_id,
                subclass_id: jobLevel.subclass_id ?? t.subclass_id,
                // Preserve enriched display fields that are not direct DB columns
                company_name: t.company_name,
                applicant_name: newTask.applicant_details?.name || newTask.applicant_name || t.applicant_name,
                // Preserve enriched array/object fields when DB returns null
                officer_ids: newTask.officer_ids ?? t.officer_ids,
                officer_id: newTask.officer_id ?? t.officer_id,
                participants_details: newTask.participants_details ?? t.participants_details,
              };
            }));
            clearTasksCache(activeDepartmentTab);
          } else if (payload.eventType === 'INSERT') {
            clearTasksCache(activeDepartmentTab);
            // Use silent mode so the insert doesn't flash a full-table loading spinner
            await loadTasksData(activeDepartmentTab, undefined, true, true);
            toast({
              title: "New Task Added",
              description: "A new task has been added to the current view.",
              variant: "success"
            });
          } else if (payload.eventType === 'DELETE') {
            setTasks(prevTasks => prevTasks.filter(t => t.id?.toString() !== oldTask?.id?.toString()));
            clearTasksCache(activeDepartmentTab);
            toast({
              title: "Task Removed",
              description: "A task has been removed from the current view.",
              variant: "default"
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime subscription established for tm_tasks');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Realtime subscription error for tm_tasks');
          toast({
            title: "Realtime Error",
            description: "Failed to establish realtime connection. Manual refresh may be needed.",
            variant: "destructive"
          });
        }
      });

    realtimeSubscriptionRef.current = subscription;

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
        if (realtimeSubscriptionRef.current === subscription) {
          realtimeSubscriptionRef.current = null;
        }
        console.log('Realtime subscription cleaned up');
      }
    };
  }, [activeDepartmentTab, clearTasksCache, isTaskRelevantToActiveView, loadTasksData]); // Re-subscribe only on a real department change — see isTaskRelevantToActiveView's own comment

  useEffect(() => {
    if (activeDepartmentTab && departments.length > 0) {
      const currentDept = departments.find(d => d.id.toString() === activeDepartmentTab)
      if (currentDept) {
        // On first load, honour the subdept from the URL before falling back to default
        if (initialSubDeptId && !initialSubDeptApplied.current) {
          setActiveSubdepartmentTab(initialSubDeptId)
          initialSubDeptApplied.current = true
        } else {
          const defaultSubs = currentDept.tm_subdepartments?.filter(sub => sub.default_display) || []
          if (defaultSubs.length > 0) {
            setActiveSubdepartmentTab(defaultSubs[0].id.toString())
          } else {
            setActiveSubdepartmentTab("")
          }
        }
      }
    }
  }, [activeDepartmentTab, departments])

  // Populates subdepartmentOfficers/Managers/Assistants — still consumed by getStaffName's
  // userId->display-name resolution even though the old per-manager/assistant tab UI that used
  // to also live here (activeManagerTab/activeAssistantTab, dead — no button ever set them) is
  // gone.
  useEffect(() => {
    if (activeSubdepartmentTab && tmUsers.size > 0) {
      const staffData = getActiveStaffFromSubdepartment(activeSubdepartmentTab);
      setSubdepartmentOfficers(staffData.officers);
      setSubdepartmentManagers(staffData.managers);
      setSubdepartmentAssistants(staffData.assistants);
    } else {
      setSubdepartmentOfficers([]);
      setSubdepartmentManagers([]);
      setSubdepartmentAssistants([]);
    }
  }, [activeSubdepartmentTab, getActiveStaffFromSubdepartment, tmUsers]);

  // Reset perspective's person selection whenever the perspective itself changes — same as
  // reports/page.tsx switching activePerspective clearing its own officer/manager tab.
  useEffect(() => {
    setActiveOfficerTab('all');
    setActiveTaskManagerTab('all');
  }, [activePerspective]);

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
  const activeStatusConfig = {
    'enquiries': { label: 'Enquiries', color: 'bg-sky-100 text-sky-700 border-sky-200' },
    'active': { label: 'All Enquiry + WIP', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
    'wip-stages': { label: 'WIP Stages', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    'write_up_completed': { label: 'Write Up Completed', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    'endorsed': { label: 'Endorsed', color: 'bg-violet-100 text-violet-700 border-violet-200' },
    'cancelled': { label: 'Cancelled', color: 'bg-red-100 text-red-700 border-red-200' },
  }[activeSubTab];

  const activePerspectiveLabel = {
    'overview': null,
    'officers': 'Officers',
    'managers': 'Managers',
    'clients': 'Clients'
  }[activePerspective];

  return (
    <div className="flex flex-col h-full antialiased bg-white min-h-screen">
      {/* Header Bar */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between relative">
        <div className="flex items-center gap-8">
          <h1 className="text-[22px] font-black text-slate-900 uppercase tracking-tight leading-none text-center">Task Tracking (Stages)</h1>
          <div className="flex items-center text-base font-bold gap-2">
            {activeDept && (
              <span className="text-slate-900">{activeDept.name}</span>
            )}
            {activeSubDept && (
              <>
                <ChevronRight className="h-4 w-4 text-slate-400" />
                <span className="text-slate-600">{activeSubDept.name}</span>
              </>
            )}
            {!activeSubDept && defaultSubdepartments.length > 0 && (
              <>
                <ChevronRight className="h-4 w-4 text-slate-400" />
                <span className="text-slate-600">All Subdepartments</span>
              </>
            )}
            {activeStatusConfig && (
              <>
                <ChevronRight className="h-4 w-4 text-slate-400" />
                <span className="font-bold text-slate-700">{activeStatusConfig.label}</span>
              </>
            )}
            {activePerspectiveLabel && (
              <>
                <ChevronRight className="h-4 w-4 text-slate-400" />
                <span className="text-slate-500">{activePerspectiveLabel}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 flex justify-end">

          <div className="flex items-center gap-2">
            {isTransposedView && !activeReport && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-4 rounded-full text-sm font-bold gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                onClick={() => isAllExpanded ? collapseAll() : expandAll()}
              >
                {isAllExpanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {isAllExpanded ? 'Collapse All' : 'Expand All'}
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
                    (showTime || showDelta || showNAStages || showStats)
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <Eye className="h-3.5 w-3.5" />
                  View Options
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setShowTime(!showTime)} className="flex items-center gap-2 cursor-pointer">
                  {showTime ? <EyeOff className="h-4 w-4 text-blue-600" /> : <Eye className="h-4 w-4 text-slate-400" />}
                  <span>{showTime ? 'Hide Time' : 'Show Time'}</span>
                  {showTime && <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowDelta(!showDelta)} className="flex items-center gap-2 cursor-pointer">
                  {showDelta ? <EyeOff className="h-4 w-4 text-blue-600" /> : <Eye className="h-4 w-4 text-slate-400" />}
                  <span>{showDelta ? 'Hide Time Gaps' : 'Show Time Gaps'}</span>
                  {showDelta && <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowNAStages(!showNAStages)} className="flex items-center gap-2 cursor-pointer">
                  {showNAStages ? <EyeOff className="h-4 w-4 text-blue-600" /> : <Eye className="h-4 w-4 text-slate-400" />}
                  <span>{showNAStages ? 'Hide N/A Stages' : 'Show N/A Stages'}</span>
                  {showNAStages && <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowOptionalStages(!showOptionalStages)} className="flex items-center gap-2 cursor-pointer">
                  {showOptionalStages ? <EyeOff className="h-4 w-4 text-blue-600" /> : <Eye className="h-4 w-4 text-slate-400" />}
                  <span>{showOptionalStages ? 'Hide Optional Stages' : 'Show Optional Stages'}</span>
                  {showOptionalStages && <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowStats(!showStats)} className="flex items-center gap-2 cursor-pointer">
                  {showStats ? <EyeOff className="h-4 w-4 text-blue-600" /> : <Eye className="h-4 w-4 text-slate-400" />}
                  <span>{showStats ? 'Hide Stats' : 'Show Stats'}</span>
                  {showStats && <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 ml-auto" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
                    (visibleHeaders.size + visibleStageIds.size) < (currentTableHeaders.length + stages.length)
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Columns ({visibleHeaders.size + visibleStageIds.size})
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
                          <Label htmlFor={stat.id} className="text-sm font-normal cursor-pointer">{stat.label}</Label>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2 border-t pt-2">
                    <h5 className="text-sm font-medium text-slate-700">Case Details ({visibleHeaders.size})</h5>
                    {currentTableHeaders.map((header) => (
                      <div key={header.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={header.id}
                          checked={visibleHeaders.has(header.id)}
                          onCheckedChange={() => toggleHeaderVisibility(header.id)}
                        />
                        <Label htmlFor={header.id} className="text-sm font-normal cursor-pointer">{header.label}</Label>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 border-t pt-2">
                    <h5 className="text-sm font-medium text-slate-700">Visible Stages ({visibleStageIds.size})</h5>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                      {[...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0)).map((stage) => (
                        <div key={`vis-${stage.id}`} className="flex items-center space-x-2">
                          <Checkbox
                            id={`stage-vis-${stage.id}`}
                            checked={visibleStageIds.has(stage.id.toString())}
                            onCheckedChange={() => toggleStageVisibility(stage.id.toString())}
                          />
                          <Label htmlFor={`stage-vis-${stage.id}`} className="text-sm font-normal cursor-pointer">{stage.name}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t">
                    <Button variant="outline" size="sm" onClick={() => {
                      const defaultHeaders = currentTableHeaders.filter(h => h.default && (activeSubTab === 'cancelled' || h.id !== 'cancellation_reason'));
                      setVisibleHeaders(new Set(defaultHeaders.map(h => h.id)));
                      if (isTransposedView) setVisibleStats(new Set(STATS_HEADERS.filter(s => s.default).map(s => s.id)));
                      setVisibleStageIds(new Set(stages.map(s => s.id.toString())));
                    }}>Show Default</Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      setVisibleHeaders(new Set(currentTableHeaders.map(h => h.id)));
                      if (isTransposedView) setVisibleStats(new Set(STATS_HEADERS.map(s => s.id)));
                      setVisibleStageIds(new Set(stages.map(s => s.id.toString())));
                    }}>Reset</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
                !isReadOnly
                  ? "bg-blue-50 border-blue-300 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
              onClick={() => setIsReadOnly(!isReadOnly)}
            >
              {isReadOnly ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {isReadOnly ? 'Read Only' : 'Edit Mode'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 px-4 rounded-full text-sm font-bold gap-2 transition-all",
                !areTabsVisible
                  ? "bg-blue-50 border-blue-300 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
              onClick={() => setAreTabsVisible(!areTabsVisible)}
            >
              {areTabsVisible ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
              {areTabsVisible ? 'Hide Navigation' : 'Show Navigation'}
            </Button>
          </div>
        </div>
      </div>

      {/* Department Tabs - Pill-style */}
      {areTabsVisible && (
        <div className="px-6 py-3 flex items-center border-b border-slate-200 bg-white">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-full border border-slate-200">
            {departments.map(dept => {
              const isActive = activeDepartmentTab === dept.id.toString();
              const count = liveTaskCountsByDept[dept.id.toString()] ?? liveTaskCountsByDept[dept.id] ?? 0;
              return (
                <button
                  key={dept.id}
                  onClick={() => setActiveDepartmentTab(dept.id.toString())}
                  className={cn(
                    "group px-5 py-2 text-sm font-bold rounded-full transition-all flex items-center gap-2",
                    isActive
                      ? "bg-custom-blue text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  {dept.name}
                  {count > 0 && (
                    <span className={cn(
                      "inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm",
                      isActive ? "bg-white/25 text-white" : "bg-custom-blue text-white"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Subdepartment Tabs - Pill-style */}
      {areTabsVisible && defaultSubdepartments.length > 0 && (() => {
        const MAX_VISIBLE = 12;
        const visibleSubdepts = defaultSubdepartments.slice(0, MAX_VISIBLE);
        const overflowSubdepts = defaultSubdepartments.slice(MAX_VISIBLE);
        return (
          <div className="px-6 py-2.5 flex items-center justify-between border-b border-slate-200 bg-white">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-full border border-slate-200">
              <button
                onClick={() => setActiveSubdepartmentTab("")}
                className={cn(
                  "group px-4 py-1.5 text-sm font-bold rounded-full transition-all flex items-center gap-2",
                  activeSubdepartmentTab === ""
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                All Subdepartments
                {(searchAwareSubdeptCounts ? searchAwareSubdeptCounts.total : (liveTaskCountsByDept[activeDepartmentTab] ?? 0)) > 0 && (
                  <span className={cn(
                    "inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm",
                    activeSubdepartmentTab === "" ? "bg-custom-blue text-white" : "bg-slate-400 text-white"
                  )}>
                    {searchAwareSubdeptCounts ? searchAwareSubdeptCounts.total : (liveTaskCountsByDept[activeDepartmentTab] ?? 0)}
                  </span>
                )}
              </button>
              {visibleSubdepts.map(subdept => {
                const isActive = activeSubdepartmentTab === subdept.id.toString();
                const count = searchAwareSubdeptCounts
                  ? (searchAwareSubdeptCounts.bySubdept[subdept.id.toString()] ?? 0)
                  : (liveTaskCountsBySubdept[subdept.id.toString()] ?? liveTaskCountsBySubdept[subdept.id] ?? 0);
                return (
                  <button
                    key={subdept.id}
                    onClick={() => setActiveSubdepartmentTab(subdept.id.toString())}
                    className={cn(
                      "group px-4 py-1.5 text-sm font-bold rounded-full transition-all flex items-center gap-2",
                      isActive
                        ? "bg-custom-blue text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    {subdept.name}
                    {count > 0 && (
                      <span className={cn(
                        "inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm",
                        isActive ? "bg-white/25 text-white" : "bg-custom-blue text-white"
                      )}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
              {overflowSubdepts.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="group px-4 py-1.5 text-sm font-bold rounded-full transition-all flex items-center gap-1 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 hover:border-slate-300">
                      +{overflowSubdepts.length} more
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 max-h-[40vh] overflow-y-auto">
                    {overflowSubdepts.map(subdept => {
                      const isActive = activeSubdepartmentTab === subdept.id.toString();
                      const count = searchAwareSubdeptCounts
                        ? (searchAwareSubdeptCounts.bySubdept[subdept.id.toString()] ?? 0)
                        : (liveTaskCountsBySubdept[subdept.id.toString()] ?? liveTaskCountsBySubdept[subdept.id] ?? 0);
                      return (
                        <DropdownMenuItem
                          key={subdept.id}
                          onClick={() => setActiveSubdepartmentTab(subdept.id.toString())}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <span className={cn("font-semibold", isActive && "text-custom-blue")}>{subdept.name}</span>
                          {count > 0 && (
                            <span className="text-xs tabular-nums text-slate-400">{count}</span>
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="flex gap-4">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-full border border-slate-200">
              <button
                onClick={() => setIsTransposedView(true)}
                className={cn(
                  "px-4 py-1.5 text-sm font-bold rounded-full transition-all flex items-center gap-1.5",
                  isTransposedView
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                <LayoutGrid className="h-3 w-3" /> Transposed
              </button>
              <button
                onClick={() => setIsTransposedView(false)}
                className={cn(
                  "px-4 py-1.5 text-sm font-bold rounded-full transition-all flex items-center gap-1.5",
                  !isTransposedView
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                <TableProperties className="h-3 w-3" /> Standard
              </button>
            </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-4 rounded-full text-sm font-bold gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                onClick={refreshAllData}
                disabled={isRefreshingAllData}
              >
                {isRefreshingAllData ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                {isRefreshingAllData ? "Refreshing..." : "Refresh"}
              </Button></div>
          </div>
        );
      })()}

      <div className="flex justify-between border-b border-slate-200">
        {/* Status Tabs Bar - Pill-style matching StatusFilterBar — always visible */}
        <div className="px-8 py-2.5 flex items-center bg-white">
          <div className="flex gap-1.5">
            {[
              { id: 'all', label: 'All Tasks', count: statusTabCounts.all, activeHex: '#475569', badgeHex: '#64748b' },
              { id: 'enquiries', label: 'Enquiries', count: statusTabCounts.enquiries, activeHex: '#0284c7', badgeHex: '#0ea5e9' },
              { id: 'active', label: 'All Enquiry + WIP', count: statusTabCounts.active, activeHex: '#0d9488', badgeHex: '#14b8a6' },
              { id: 'wip-stages', label: 'WIP Stages', count: statusTabCounts.wipStages, activeHex: '#f59e0b', badgeHex: '#f59e0b' },
              { id: 'write_up_completed', label: 'Write Up Completed', count: statusTabCounts.writeUpCompleted, activeHex: '#059669', badgeHex: '#10b981' },
              { id: 'endorsed', label: 'Endorsed', count: statusTabCounts.endorsed, activeHex: '#7c3aed', badgeHex: '#8b5cf6' },
              { id: 'cancelled', label: 'Cancelled', count: statusTabCounts.cancelled, activeHex: '#dc2626', badgeHex: '#ef4444' },
            ].map(tab => {
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id)}
                  className={cn(
                    "group h-9 px-4 text-sm font-bold rounded-2xl transition-all flex items-center gap-2",
                    isActive ? "shadow-sm" : "bg-white text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300"
                  )}
                  style={isActive ? { backgroundColor: tab.activeHex, color: '#fff' } : undefined}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span
                      className="inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm"
                      style={isActive ? { backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff' } : { backgroundColor: tab.badgeHex, color: '#fff' }}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Search Input */}
          <div className="relative group w-[320px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search tasks, applicants, companies..."
              value={globalSearchTerm}
              onChange={(e) => setGlobalSearchTerm(e.target.value)}
              className="w-full h-10 pl-11 pr-10 bg-white border-slate-300 rounded-full text-sm font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
            />
            {globalSearchTerm && (
              <button
                onClick={() => setGlobalSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          {/* Action Buttons */}
          {activeSubTab === 'enquiries' && (
            <Button
              variant="outline"
              size="sm"
              className="h-10 px-6 rounded-full text-base font-extrabold gap-2.5 border-2 border-blue-500 text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all animate-pulse"
              onClick={handleNewEnquiryClick}
            >
              <Plus className="h-4 w-4" />
              New Enquiry
            </Button>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {[
                { id: 'overview' as const, label: 'Overview' },
                { id: 'officers' as const, label: 'Officers', count: officerTaskCounts.all },
                { id: 'managers' as const, label: 'Managers', count: taskManagerTaskCounts.all },
                { id: 'clients' as const, label: 'Clients', count: clientsAwaitingCount },
              ].map(p => {
                const isActive = activePerspective === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setActivePerspective(p.id)}
                    className={cn(
                      "h-9 px-4 text-sm font-bold rounded-2xl transition-all flex items-center gap-2",
                      isActive ? "shadow-sm" : "bg-white text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300"
                    )}
                    // Same custom-blue (#376bae) summary-reports' Overview/Officers/Managers/
                    // Clients row uses — was bg-slate-800 here, the one visible mismatch between
                    // the two modules' otherwise-matching tab color schemes.
                    style={isActive ? { backgroundColor: '#376bae', color: '#fff' } : undefined}
                  >
                    {p.label}
                    {typeof p.count === 'number' && p.count > 0 && (
                      <span className={cn(
                        "inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm",
                        isActive ? "bg-white/25 text-white" : "bg-slate-800 text-white"
                      )}>
                        {p.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {isTransposedView && enhancedTotalColumns > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Cols {((enhancedCurrentPage - 1) * enhancedColumnsPerPage) + 1}–{Math.min(enhancedCurrentPage * enhancedColumnsPerPage, enhancedTotalColumns)} of {enhancedTotalColumns}
                </span>
                <Select
                  value={String(enhancedColumnsPerPage)}
                  onValueChange={(value) => {
                    setEnhancedColumnsPerPage(Number(value));
                    setEnhancedCurrentPage(1);
                    enhancedTableRef.current?.setColumnsPerPage(Number(value));
                    enhancedTableRef.current?.setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[65px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 10, 15, 20, 50].map(size => (
                      <SelectItem key={size} value={String(size)}>{size}/pg</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => { setEnhancedCurrentPage(1); enhancedTableRef.current?.setCurrentPage(1); }}
                    disabled={enhancedCurrentPage === 1}
                  >
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => { const p = Math.max(1, enhancedCurrentPage - 1); setEnhancedCurrentPage(p); enhancedTableRef.current?.setCurrentPage(p); }}
                    disabled={enhancedCurrentPage === 1}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="px-2 text-xs font-bold text-slate-600 tabular-nums">{enhancedCurrentPage}/{Math.max(1, Math.ceil(enhancedTotalColumns / enhancedColumnsPerPage))}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => { const tp = Math.max(1, Math.ceil(enhancedTotalColumns / enhancedColumnsPerPage)); const p = Math.min(tp, enhancedCurrentPage + 1); setEnhancedCurrentPage(p); enhancedTableRef.current?.setCurrentPage(p); }}
                    disabled={enhancedCurrentPage >= Math.ceil(enhancedTotalColumns / enhancedColumnsPerPage)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => { const tp = Math.max(1, Math.ceil(enhancedTotalColumns / enhancedColumnsPerPage)); setEnhancedCurrentPage(tp); enhancedTableRef.current?.setCurrentPage(tp); }}
                    disabled={enhancedCurrentPage >= Math.ceil(enhancedTotalColumns / enhancedColumnsPerPage)}
                  >
                    <ChevronsRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="h-6 w-px bg-slate-200 mx-1" />

        </div>
      </div>

      {/* Overview/Officers/Managers/Clients perspective + Column Pagination — Always visible. */}
      <div className="border-b border-slate-200 bg-white px-8 py-2.5 flex justify-end">
        {activePerspective === 'officers' && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveOfficerTab('all')}
              className={cn("h-9 px-4 text-sm font-bold rounded-2xl transition-all flex items-center gap-2", activeOfficerTab === 'all' ? "bg-violet-600 text-white shadow-sm" : "bg-white text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300")}
            >
              All
              {officerTaskCounts.all > 0 && (
                <span className={cn("inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm", activeOfficerTab === 'all' ? "bg-white/25 text-white" : "bg-violet-500 text-white")}>{officerTaskCounts.all}</span>
              )}
            </button>
            {perspectiveDepartmentUsers.officers.map((o: any) => {
              const isActive = activeOfficerTab === o.id.toString();
              const count = officerTaskCounts[o.id.toString()] || 0;
              return (
                <button
                  key={o.id}
                  onClick={() => setActiveOfficerTab(o.id.toString())}
                  className={cn("h-9 px-4 text-sm font-bold rounded-2xl transition-all flex items-center gap-2", isActive ? "bg-violet-600 text-white shadow-sm" : "bg-white text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300")}
                >
                  {getOfficerDisplayName(o)}
                  {count > 0 && (
                    <span className={cn("inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm", isActive ? "bg-white/25 text-white" : "bg-violet-500 text-white")}>{count}</span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setActiveOfficerTab('__unallocated__')}
              className={cn("h-9 px-4 text-sm font-bold rounded-2xl transition-all flex items-center gap-2", activeOfficerTab === '__unallocated__' ? "bg-amber-500 text-white shadow-sm" : "bg-white text-amber-600 hover:text-amber-700 border border-amber-200 hover:border-amber-300")}
            >
              Unallocated
              {(officerTaskCounts.__unallocated__ || 0) > 0 && (
                <span className={cn("inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm", activeOfficerTab === '__unallocated__' ? "bg-white/25 text-white" : "bg-amber-500 text-white")}>{officerTaskCounts.__unallocated__ || 0}</span>
              )}
            </button>

            <Select value={officerFilterMode} onValueChange={(v) => setOfficerFilterMode(v as 'current' | 'history')}>
              <SelectTrigger className="h-9 px-4 text-sm font-bold rounded-2xl border border-slate-200 w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Stage In Basket Now</SelectItem>
                <SelectItem value="history">Stage Ever In Basket</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {activePerspective === 'managers' && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveTaskManagerTab('all')}
              className={cn("h-9 px-4 text-sm font-bold rounded-2xl transition-all flex items-center gap-2", activeTaskManagerTab === 'all' ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300")}
            >
              All
              {taskManagerTaskCounts.all > 0 && (
                <span className={cn("inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm", activeTaskManagerTab === 'all' ? "bg-white/25 text-white" : "bg-indigo-500 text-white")}>{taskManagerTaskCounts.all}</span>
              )}
            </button>
            {perspectiveDepartmentUsers.managers.map((m: any) => {
              const isActive = activeTaskManagerTab === m.id.toString();
              const count = taskManagerTaskCounts[m.id.toString()] || 0;
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveTaskManagerTab(m.id.toString())}
                  className={cn("h-9 px-4 text-sm font-bold rounded-2xl transition-all flex items-center gap-2", isActive ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300")}
                >
                  {getOfficerDisplayName(m)}
                  {count > 0 && (
                    <span className={cn("inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm", isActive ? "bg-white/25 text-white" : "bg-indigo-500 text-white")}>{count}</span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setActiveTaskManagerTab('__unallocated__')}
              className={cn("h-9 px-4 text-sm font-bold rounded-2xl transition-all flex items-center gap-2", activeTaskManagerTab === '__unallocated__' ? "bg-amber-500 text-white shadow-sm" : "bg-white text-amber-600 hover:text-amber-700 border border-amber-200 hover:border-amber-300")}
            >
              Unallocated
              {(taskManagerTaskCounts.__unallocated__ || 0) > 0 && (
                <span className={cn("inline-flex items-center justify-center font-bold tabular-nums px-3 py-1 rounded-full text-sm min-w-[2rem] leading-none shadow-sm", activeTaskManagerTab === '__unallocated__' ? "bg-white/25 text-white" : "bg-amber-500 text-white")}>{taskManagerTaskCounts.__unallocated__ || 0}</span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1">
        {activeDept && (
          <div className="overflow-hidden">
            {isTransposedView ? (
              <EnhancedTable
                ref={enhancedTableRef}
                departments={departments}
                tasks={displayedTasks}
                tableType={activeTabTitle}
                ENHANCED_TABLE_HEADERS_IMMIGRATION={currentTableHeaders}
                visibleHeaders={visibleHeaders}
                taskDependants={taskDependants}
                expandedDependants={expandedDependants}
                expandedSections={expandedSections}
                companies={companies}
                tableRows={tableRows}
                loading={isLoadingTasks}
                error={error}
                kycDocuments={kycDocuments}
                enhancedTasksData={enhancedTasksData}
                getCellContent={getCellContentWrapper}
                renderCellContent={renderCellContent}
                getStageMergedState={getStageMergedState}
                toggleSectionExpansion={toggleSectionExpansion}
                toggleStageExpansion={toggleStageExpansion}
                toggleDocumentExpansion={toggleDocumentExpansion}
                getTaskHierarchy={getTaskHierarchy}
                getStaffName={getStaffName}
                readOnly={isReadOnly}
                areTabsVisible={areTabsVisible}
                reportDocDefaults={reportDocDefaults}
                allIndividualDocuments={allIndividualDocuments}
                allCompanyDocuments={allCompanyDocuments}
                hideInternalPagination={true}
                onTotalColumnsChange={setEnhancedTotalColumns}
                onDocumentPreview={async (doc) => {
                  setPreviewDocument(doc);
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
                tasks={displayedTasks}
                tableType={activeTabTitle}
                ENHANCED_TABLE_HEADERS_IMMIGRATION={currentTableHeaders}
                stages={stages}
                showDelta={showDelta}
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
                dataLoading={{ tasks: isLoadingTasks }}
                error={error}
                isPushingCase={isPushingCase}
                isDownloading={isDownloading}
                enhancedTasksData={enhancedTasksData}
                getCellContent={getCellContentWrapper}
                renderCellContent={renderCellContent}
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
                readOnly={isReadOnly}
                areTabsVisible={areTabsVisible}
                showStats={showStats}
                reportDocDefaults={reportDocDefaults}
                allIndividualDocuments={allIndividualDocuments}
                allCompanyDocuments={allCompanyDocuments}
                expandedSections={expandedSections}
                toggleSectionExpansion={toggleSectionExpansion}
              />
            )}
          </div>
        )}
      </div>

      <EnquiryDialog
        open={isEnquiryDialogOpen}
        onOpenChange={setIsEnquiryDialogOpen}
        onEnquiryCreated={handleEnquiryCreated}
        departments={departments}
        userData={userData}
      />
      <NewCompanyInquiryDialog
        open={isOtherDialogOpen}
        onOpenChange={setIsOtherDialogOpen}
        onEnquiryCreated={handleEnquiryCreated}
        departments={departments}
        userData={userData}
      />
      <EnquiryDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        taskToEdit={editingTask}
        departments={departments}
        userData={userData}
        onEnquiryCreated={handleTaskUpdate}
      />
      <AssignOfficersDialog
        open={assignOfficersDialogOpen}
        onOpenChange={setAssignOfficersDialogOpen}
        task={selectedTaskForOfficers}
        officers={realOfficers}
        stages={stages}
        departments={departments}
        officerSections={departments.find(d => d.id.toString() === activeDepartmentTab)?.officer_sections || []}
        initialStageAssignments={selectedTaskForOfficers?.stages ? Object.entries(selectedTaskForOfficers.stages).reduce((acc, [stageId, stageData]: [string, any]) => {
          if (stageData?.officer_ids) {
            acc[stageId] = stageData.officer_ids;
          }
          return acc;
        }, {} as Record<string, string[]>) : {}}
        onAssign={(stageAssignments) => updateAllTaskStageOfficers(selectedTaskForOfficers?.id, stageAssignments)}
      />
      {
        companyInquiryDialogOpen && editingTask && (
          <NewCompanyInquiryDialog
            open={companyInquiryDialogOpen}
            onOpenChange={setCompanyInquiryDialogOpen}
            initialData={editingTask}  // Pass the task data as initialData
            departments={departments}
            userData={userData}
            onEnquiryCreated={(updatedTask) => {
              handleTaskUpdate(updatedTask);
              setCompanyInquiryDialogOpen(false);
            }}
          />
        )
      }
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

      {
        linkingTask && (
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
        )
      }

      <CancelConfirmationDialog
        open={cancelDialogOpen}
        onOpenChange={(open) => {
          setCancelDialogOpen(open);
          if (!open) setTaskToCancel(null);
        }}
        onConfirm={async (reason: string) => {
          if (taskToCancel && handleCancelTask) {
            await handleCancelTask(taskToCancel, reason);
            setCancelDialogOpen(false);
            setTaskToCancel(null);
          }
        }}
      />

      <Dialog open={uncancelDialogOpen} onOpenChange={(open) => {
        setUncancelDialogOpen(open);
        if (!open) setTaskToUncancel(null);
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-green-600">Reactivate Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to reactivate this task? It will be restored to its previous status.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setUncancelDialogOpen(false);
                setTaskToUncancel(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={async () => {
                if (taskToUncancel) {
                  await handleUncancelTask(taskToUncancel);
                  setUncancelDialogOpen(false);
                  setTaskToUncancel(null);
                }
              }}
            >
              Reactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExtractionPreviewDialog
        open={!!previewDocument}
        onOpenChange={(isOpen) => !isOpen && setPreviewDocument(null)}
        previewDocument={previewDocument}
        handleDeleteDocument={handleDeleteDocument}
        handleTaskAction={handleTaskAction}
        setIsDocumentPreviewOpen={setIsDocumentPreviewOpen}
        setPreviewDocument={setPreviewDocument}
      />

      <ClassSelectionDialog
        open={isClassSelectionOpen}
        onOpenChange={setIsClassSelectionOpen}
        selectedTaskForPush={selectedTaskForPush}
        availableClasses={availableClasses}
        taskDependants={taskDependants}
        setSelectedTaskForPush={setSelectedTaskForPush}
        executePushCase={executePushCase}
      />

      {requirementsDialogTask && (
        <SendRequirementsDialog
          isOpen={!!requirementsDialogTask}
          onClose={() => setRequirementsDialogTask(null)}
          selectedApplicant={requirementsDialogTask.applicant_name || requirementsDialogTask.client_name || ''}
          tasks={[requirementsDialogTask]}
          taskClassRequirements={{ [requirementsDialogTask.id]: { requirements: requirementsDialogTask.requirements, job_level: requirementsDialogTask.job_level, job_specific_questions: requirementsDialogTask.job_specific_questions } }}
          automationWebdataMap={automationWebdataMapState}
          allCompanyDocuments={allCompanyDocuments}
          allIndividualDocuments={allIndividualDocuments}
          fieldSourceDataCache={requirementsDialogFieldData.fieldSourceDataCache}
          fieldMasterComputedCache={requirementsDialogFieldData.fieldMasterComputedCache}
          jobFieldsRecord={requirementsDialogFieldData.jobFieldsRecord}
          relationshipData={requirementsDialogFieldData.relationshipData}
          kycDocsMap={kycDocuments}
        />
      )}
    </div >
  )
}