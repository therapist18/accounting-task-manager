// @ts-nocheck
"use client"

import { format, isAfter, isEqual, isValid, parse, startOfToday } from 'date-fns';
import { Plus, Minus, LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import React from "react";

// Enhanced table headers with granular breakdown
export const ENHANCED_TABLE_HEADERS_IMMIGRATION = [
  { id: 'id', label: 'Task ID', default: true, width: 'w-20' },
  { id: 'applicant_name', label: 'Applicant Name', default: true, width: 'w-48' },
  { id: 'company_name', label: 'Company Name', default: true, width: 'w-48' },
  { id: 'job_level', label: 'Job Level', default: true, width: 'w-32' },
  { id: 'renewal_new', label: 'Renewal/New', default: true, width: 'w-28' },
  { id: 'immigration_document_type', label: 'Current Immigration Doc Type', default: false, width: 'w-48' },
  { id: 'immigration_expiry_date', label: 'Current Immigration Expiry Date', default: false, width: 'w-40' },
  { id: 'immigration_status', label: 'Current Immigration Status', default: true, width: 'w-48' },
  { id: 'current_stage_name', label: 'Current Stage Name', default: true, width: 'w-48' },
  { id: 'current_stage_status_value', label: 'Current Stage Status', default: true, width: 'w-48' },
  { id: 'current_stage_follow_up', label: 'Current Stage Follow-up', default: false, width: 'w-40' },
  { id: 'job_description', label: 'Job Description', default: false, width: 'w-32' },
  { id: 'case_status', label: 'Case Status', default: false, width: 'w-28' },
  { id: 'nationality', label: 'Nationality', default: false, width: 'w-32' },
  { id: 'age', label: 'Age', default: false, width: 'w-20' },
  { id: 'task_manager', label: 'Task Manager', default: false, width: 'w-32' },
  { id: 'officer', label: 'Officer', default: false, width: 'w-32' },
  { id: 'task_assistant', label: 'Task Assistant', default: false, width: 'w-32' },
];

export const ENHANCED_TABLE_HEADERS = [
  { id: 'id', label: 'Task ID', default: true, width: 'w-20' },
  { id: 'applicant_name', label: 'Applicant Name', default: true, width: 'w-48' },
  { id: 'job_description', label: 'Job Description', default: true, width: 'w-32' },
  { id: 'job_level', label: 'Job Level', default: true, width: 'w-32' },
  { id: 'renewal_new', label: 'Renewal/New', default: false, width: 'w-28' },
  { id: 'case_status', label: 'Case Status', default: false, width: 'w-28' },
  { id: 'task_manager', label: 'Task Manager', default: false, width: 'w-32' },
  { id: 'officer', label: 'Officer', default: false, width: 'w-32' },
  { id: 'task_assistant', label: 'Task Assistant', default: false, width: 'w-32' },
];

// Stats options
export const STATS_HEADERS = [
  { id: 'stats_completed', label: 'Completed Stages', default: true },
  { id: 'stats_pending', label: 'Pending Stages', default: true },
  { id: 'stats_na', label: 'N/A Stages', default: false },
];

export const parseDate = (dateStr: string): Date | null => {
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

export const findDatesInObject = (obj: any, dateFields: string[]): Date[] => {
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

export const calculateAge = (dateOfBirth: string | null): number | null => {
  if (!dateOfBirth) return null;

  try {
    const birthDate = new Date(dateOfBirth);
    if (isNaN(birthDate.getTime())) {
      console.warn('Invalid date of birth:', dateOfBirth);
      return null;
    }

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
};

export const getEnhancedImmigrationStatus = (
  task: any,
  stages: any[],
  allDocuments: any[],
  kycDocuments: Map<string, any>
) => {
  const statusStageId = "072b9710-45df-4a05-ba65-01b4ef29d61d";
  const statusStage = stages.find(s => s.id === statusStageId);

  if (!statusStage?.documents?.length) {
    return { status: "N/A", date: null, type: 'na', documentType: null, daysRemaining: null };
  }

  const stageDocKycIds = new Set(statusStage.documents.map(d => d.kycId));
  const relevantDocs = allDocuments.filter(doc =>
    doc.director_id === task.individual_id &&
    stageDocKycIds.has(doc.document_id) &&
    doc.extracted_details
  );

  if (!relevantDocs.length) {
    return { status: "No Status Doc", date: null, type: 'na', documentType: null, daysRemaining: null };
  }

  const dateFields = [
    'expiry', 'valid', 'date', 'until', 'effective', 'expiration', 'expiry_date',
    'valid_to', 'valid_until', 'up_to', 'effective_date', 'effective_from',
    'effective_to', 'with_effect_from'
  ];

  const allDatesWithTypes = relevantDocs.flatMap(doc => {
    if (!doc.extracted_details) return [];
    const kycData = kycDocuments.get(doc.document_id);
    const documentTypeName = kycData?.display_name || kycData?.name || 'Document';
    const dates = findDatesInObject(doc.extracted_details, dateFields);
    return dates.map(date => ({ date, documentType: documentTypeName, document: doc }));
  });

  if (!allDatesWithTypes.length) {
    return { status: "No Date Found", date: null, type: 'na', documentType: null, daysRemaining: null };
  }

  const latestDateInfo = allDatesWithTypes.reduce((latest, current) =>
    isAfter(current.date, latest.date) ? current : latest, allDatesWithTypes[0]);

  const today = startOfToday();
  const isFuture = isAfter(latestDateInfo.date, today) || isEqual(latestDateInfo.date, today);
  const timeDiff = latestDateInfo.date.getTime() - today.getTime();
  const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

  let statusType = isFuture ? (daysRemaining <= 30 ? 'expiring_soon' : 'active') : 'expired';

  return {
    status: isFuture
      ? `Valid until ${format(latestDateInfo.date, 'dd MMM yyyy')}`
      : `Expired on ${format(latestDateInfo.date, 'dd MMM yyyy')}`,
    date: latestDateInfo.date,
    type: statusType,
    documentType: latestDateInfo.documentType,
    daysRemaining: isFuture ? daysRemaining : null
  };
};
// OPTIMIZATION: Removed noisy console logs. The logic is sound but should not be run during render.
// It will be used as a one-time calculation utility instead.
export const getCurrentStageStatus = (
  task: any,
  stages: any[],
  departments: any[],
  allDocuments: any[] = []
) => {
  if (!stages.length || !task) {
    return { stageName: 'No Stage', stageStatus: 'N/A', stageFollowUp: null };
  }

  const sortedStages = [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

  const isStageCompleted = (stage: any) => {
    const requiresDocuments = stage.documents && stage.documents.length > 0;
    if (requiresDocuments) {
      const linkedDocumentData = task.source_document_id?.[stage.id];
      if (!linkedDocumentData) return false;

      if (allDocuments.length > 0) {
        const documentId = typeof linkedDocumentData === 'string' ? linkedDocumentData : linkedDocumentData.id;
        const linkedDoc = allDocuments.find(doc => doc.id === documentId);
        if (!linkedDoc || linkedDoc.indicator === true) return false;
        if (task.created_at && linkedDoc.created_at) {
          if (new Date(linkedDoc.created_at) < new Date(task.created_at)) return false;
        }
      }
      return true;
    } else {
      const stageData = task.stages?.[stage.id];
      return stageData && (stageData.status === 'completed' || stageData.date || stageData.completedAt);
    }
  };

  let lastCompletedStage = null;
  let lastCompletedIndex = -1;
  for (let i = 0; i < sortedStages.length; i++) {
    const stage = sortedStages[i];
    if (isStageCompleted(stage)) {
      lastCompletedStage = stage;
      lastCompletedIndex = i;
    }
  }

  let currentStage;
  let stageStatus = 'Pending';

  if (lastCompletedStage === null) {
    currentStage = findFirstApplicableStage(sortedStages, task, departments) || sortedStages[0];
    stageStatus = currentStage?.status || 'Pending';
  } else {
    const nextStageIndex = lastCompletedIndex + 1;
    if (nextStageIndex < sortedStages.length) {
      currentStage = findNextApplicableStage(lastCompletedStage, sortedStages.slice(nextStageIndex), task, departments) || sortedStages[nextStageIndex];
      stageStatus = currentStage?.status || 'Pending';
      if (currentStage && isStageCompleted(currentStage)) {
        stageStatus = 'Completed';
      }
    } else {
      currentStage = lastCompletedStage;
      stageStatus = 'Completed';
    }
  }

  if (!currentStage) {
    return { stageName: 'No Stage', stageStatus: 'N/A', stageFollowUp: null };
  }

  return {
    stageName: currentStage.name || 'Unknown Stage',
    stageStatus: stageStatus,
    stageFollowUp: currentStage.follow_up || null
  };
};

const findFirstApplicableStage = (sortedStages: any[], task: any, departments: any[]): any => {
  for (const stage of sortedStages) {
    if (isStageApplicableToTask(stage, task, departments)) {
      return stage;
    }
  }
  return null;
};

const findNextApplicableStage = (currentStage: any, remainingStages: any[], task: any, departments: any[]): any => {
  for (const stage of remainingStages) {
    if (isStageApplicableToTask(stage, task, departments)) {
      return stage;
    }
  }
  return null;
};

const isStageApplicableToTask = (stage: any, task: any, departments: any[]): boolean => {
  try {
    if (!task || !departments.length) return true;

    const dept = departments.find(d => d.id === task.department?.id || d.id === task.department_id);
    if (!dept) return true;

    const subdept = dept.tm_subdepartments?.find(s => s.id === task.subdepartment?.id || s.id === task.subdepartment_id);
    if (subdept) {
      const subdeptStage = subdept.stages?.find(s => s.stage_id === stage.id);
      if (subdeptStage && subdeptStage.applicable === false) return false;

      if (task.class_id) {
        const cls = subdept.classes?.find(c => c.id.toString() === task.class_id.toString());
        if (cls) {
          const classStage = cls.stages?.find(s => s.stage_id === stage.id);
          if (classStage && classStage.applicable === false) return false;
        }
      }
    }

    const deptStage = dept.stages?.find(s => s.stage_id === stage.id);
    if (deptStage && deptStage.applicable === false) return false;

    return true;
  } catch (error) {
    console.error('Error in isStageApplicableToTask:', error);
    return true;
  }
};

export const renderImmigrationStatusCell = (
  task: any,
  expandedImmigrationStatus: any,
  toggleImmigrationStatusExpansion: any
) => {
  // OPTIMIZATION: Read pre-calculated status from the task object
  const statusInfo = task._immigrationStatusInfo;
  if (!statusInfo) return null;

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
        <Badge className={`whitespace-normal text-sm ${getColor(statusInfo.type)}`}>
          {statusInfo.status}
        </Badge>
        {statusInfo.type !== 'na' && (
          <Button
            variant="ghost" size="icon"
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
};

export const renderCurrentStageStatusCell = (task: any) => {
  // OPTIMIZATION: Read pre-calculated status from the task object
  const stageStatusInfo = task._currentStageInfo;
  if (!stageStatusInfo) return null;

  return (
    <span className="whitespace-normal text-sm text-white">
      {stageStatusInfo.stageStatus}
    </span>
  );
};

// OPTIMIZATION: This function is now much faster. It simply reads pre-calculated properties
// from the enhancedTask object instead of running expensive calculations during render.
export const getCellContent = (
  task: any,
  headerId: string,
  enhancedTasksData: Map<string, any>,
  taskDependants: Map<string, any[]>,
  expandedDependants: Set<string>,
  companies: Map<number, string>,
  getTaskHierarchy: any,
  getStaffName: any,
  renderImmigrationStatusCell: any,
  renderCurrentStageStatusCell: any,
  toggleDependantsExpansion: any,
  setLinkingTask: any,
  setIsLinkDialogOpen: any
) => {
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
                variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-green-100 flex-shrink-0"
                title={`${taskDeps.length} dependant(s)`}
                onClick={() => toggleDependantsExpansion(task.id.toString())}
              >
                {expandedDependants.has(task.id.toString()) ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </Button>
            )}
            <Button
              variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-blue-100 flex-shrink-0"
              title="Link source documents"
              onClick={() => { setLinkingTask(task); setIsLinkDialogOpen(true); }}
            >
              <LinkIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    case 'immigration_document_type': return enhancedTask._immigrationStatusInfo?.documentType || '-';
    case 'immigration_expiry_date': {
      const date = enhancedTask._immigrationStatusInfo?.date;
      return date ? format(date, 'dd MMM yyyy') : '-';
    }
    case 'immigration_status': return renderImmigrationStatusCell(enhancedTask);
    case 'current_stage_name': return enhancedTask._currentStageInfo?.stageName || 'N/A';
    case 'current_stage_status_value': return renderCurrentStageStatusCell(enhancedTask);
    case 'current_stage_follow_up': {
      const followUp = enhancedTask._currentStageInfo?.stageFollowUp;
      if (!followUp) return '-';
      const getFollowUpTextColor = (f) => {
        switch (f?.toLowerCase()) {
          case 'bcl': return 'text-white';
          case 'officer': return 'text-white';
          case 'client': return 'text-white';
          default: return 'text-white';
        }
      };
      return <span className={`whitespace-nowrap text-sm ${getFollowUpTextColor(followUp)}`}>{followUp}</span>;
    }
    case 'company_name': return companies.get(task.company_id) || 'N/A';
    case 'job_level': return getTaskHierarchy(task)?.subclass?.name || getTaskHierarchy(task)?.class?.name || getTaskHierarchy(task)?.subdepartment?.name || 'N/A';
    case 'renewal_new': return <span className="text-sm font-semibold">{task.renewal_status || 'New'}</span>;
    case 'case_status': return <span className="text-sm font-semibold">{task.status || 'pending'}</span>;
    case 'nationality': return enhancedTask.nationality || 'N/A';
    case 'age': return enhancedTask.age?.toString() || 'N/A';
    case 'task_manager': return task.task_manager_id ? <span className="font-medium">{getStaffName(task.task_manager_id)}</span> : 'N/A';
    case 'officer': return task.officer_id ? <span className="font-medium">{getStaffName(task.officer_id)}</span> : 'N/A';
    case 'task_assistant': return task.task_assistant_id ? <span className="font-medium">{getStaffName(task.task_assistant_id)}</span> : 'N/A';
    default: return task[headerId] || 'N/A';
  }
};


export const sortTasks = (tasksToSort: any[], sortConfig: any, companies: Map<number, string>) => {
  let sortableItems = [...tasksToSort]
  if (sortConfig) {
    sortableItems.sort((a, b) => {
      const getSortableValue = (task, key) => {
        switch (key) {
          case 'applicant_name': return task.applicant_name?.toLowerCase() || ''
          case 'company_name': return companies.get(task.company_id)?.toLowerCase() || ''
          case 'status': return task.status?.toLowerCase() || ''
          // Add cases for new pre-calculated fields if sorting is needed
          case 'current_stage_name': return task._currentStageInfo?.stageName?.toLowerCase() || '';
          case 'immigration_expiry_date': return task._immigrationStatusInfo?.date || new Date(0);
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
};

export const filterTasksBySearch = (
  tasks: any[],
  globalSearchTerm: string,
  enhancedTasksData: Map<string, any>,
  taskDependants: Map<string, any[]>,
  companies: Map<number, string>,
  getTaskHierarchy: any,
  getUserDisplayName: any
) => {
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
      getUserDisplayName(task.task_assistant_id),
      // Include pre-calculated fields in search
      enhancedTask._currentStageInfo?.stageName,
      enhancedTask._currentStageInfo?.stageFollowUp,
      enhancedTask._immigrationStatusInfo?.documentType,
      enhancedTask._immigrationStatusInfo?.status,
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
};