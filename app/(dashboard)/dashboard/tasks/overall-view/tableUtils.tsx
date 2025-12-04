// @ts-nocheck
"use client"

import { format, isAfter, isEqual, isValid, parse, startOfToday } from 'date-fns';
import { Plus, Minus, LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import React, { useMemo, useCallback } from "react";

// Types
interface TableHeader {
  id: string;
  label: string;
  default: boolean;
  width?: string;
}

interface StatusInfo {
  status: string;
  date: Date | null;
  type: 'active' | 'expiring_soon' | 'expired' | 'na';
  documentType: string | null;
  daysRemaining: number | null;
}

interface StageStatusInfo {
  stageName: string;
  stageStatus: string;
  stageFollowUp: string | null;
}

// Constants
const DATE_FORMATS = [
  'dd/MM/yyyy HH:mm:ss',
  'dd/MM/yyyy',
  'yyyy-MM-dd',
  'dd-MM-yyyy',
  'MM/dd/yyyy',
  'yyyy/MM/dd'
] as const;

const DATE_FIELDS = [
  'expiry', 'valid', 'date', 'until', 'effective',
  'expiration', 'expiry_date', 'valid_to', 'valid_until', 'up_to',
  'effective_date', 'effective_from', 'effective_to', 'with_effect_from'
] as const;

// Table headers configuration
export const ENHANCED_TABLE_HEADERS_IMMIGRATION: TableHeader[] = [
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

export const ENHANCED_TABLE_HEADERS: TableHeader[] = [
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

export const STATS_HEADERS = [
  { id: 'stats_completed', label: 'Completed Stages', default: true },
  { id: 'stats_pending', label: 'Pending Stages', default: true },
  { id: 'stats_na', label: 'N/A Stages', default: false },
];

// Date Utilities
export const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;

  for (const fmt of DATE_FORMATS) {
    const parsed = parse(dateStr, fmt, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  const parsed = new Date(dateStr);
  return isValid(parsed) ? parsed : null;
};

// Memoized date finder
const findDatesInObject = (obj: any, dateFields: readonly string[]): Date[] => {
  if (!obj) return [];

  if (Array.isArray(obj)) {
    return obj.flatMap(item => findDatesInObject(item, dateFields));
  }

  if (typeof obj !== 'object') return [];

  return Object.entries(obj).reduce<Date[]>((dates, [key, value]) => {
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

    return dates;
  }, []);
};

// Memoized age calculator
export const calculateAge = (dateOfBirth: string | null): number | null => {
  if (!dateOfBirth) return null;

  try {
    // First try parsing with our custom parseDate function
    const birthDate = parseDate(dateOfBirth);
    
    // If that fails, try direct Date parsing as fallback
    if (!birthDate || isNaN(birthDate.getTime())) {
      const fallbackDate = new Date(dateOfBirth);
      if (isNaN(fallbackDate.getTime())) {
        console.warn('Invalid date of birth:', dateOfBirth);
        return null;
      }
      return calculateAgeFromDate(fallbackDate);
    }

    return calculateAgeFromDate(birthDate);
  } catch (error) {
    console.error('Error calculating age:', error);
    return null;
  }
};

// Helper function to calculate age from a Date object
const calculateAgeFromDate = (birthDate: Date): number => {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
};

// Memoized immigration status getter
export const getEnhancedImmigrationStatus = (
  task: any,
  stages: any[] = [],
  allDocuments: any[] = [],
  kycDocuments: Map<string, any>
): StatusInfo => {
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

  const stageDocKycIds = new Set(statusStage.documents.map((d: any) => d.kycId));
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

  const allDatesWithTypes = relevantDocs.flatMap(doc => {
    if (!doc.extracted_details) return [];

    const kycData = kycDocuments.get(doc.document_id);
    const documentTypeName = kycData?.display_name || kycData?.name || 'Document';

    const dates = findDatesInObject(doc.extracted_details, DATE_FIELDS);
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

  const statusType = isFuture 
    ? (daysRemaining <= 30 ? 'expiring_soon' : 'active')
    : 'expired';

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

// Optimized stage status getter
export const getCurrentStageStatus = (
  task: any,
  stages: any[],
  departments: any[] = [],
  allDocuments: any[] = []
): StageStatusInfo => {
  if (!stages.length || !task) {
    return {
      stageName: 'No Stage',
      stageStatus: 'N/A',
      stageFollowUp: null
    };
  }

  const sortedStages = [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

  const isStageCompleted = (stage: any, task: any, allDocuments: any[] = []) => {
    if (!task || !stage) return false;
    
    const requiresDocuments = stage.documents?.length > 0;
    
    if (requiresDocuments) {
      const linkedDocumentData = task.source_document_id?.[stage.id];
      if (!linkedDocumentData) return false;

      if (allDocuments.length > 0) {
        const documentId = typeof linkedDocumentData === 'string' 
          ? linkedDocumentData 
          : linkedDocumentData.id;
        
        const linkedDoc = allDocuments.find(doc => doc.id === documentId);
        if (!linkedDoc || linkedDoc.indicator === true) return false;

        if (task.created_at && linkedDoc.created_at) {
          const docDate = new Date(linkedDoc.created_at);
          const taskDate = new Date(task.created_at);
          if (docDate < taskDate) return false;
        }
      }
      return true;
    }

    const stageData = task.stages?.[stage.id];
    return stageData && (
      stageData.status === 'completed' || 
      stageData.date || 
      stageData.completedAt
    );
  };

  // Find last completed stage
  let lastCompletedIndex = -1;
  for (let i = 0; i < sortedStages.length; i++) {
    if (isStageCompleted(sortedStages[i], task, allDocuments)) {
      lastCompletedIndex = i;
    }
  }

  // Determine current stage
  let currentStage;
  let stageStatus = 'Pending';

  if (lastCompletedIndex === -1) {
    currentStage = findFirstApplicableStage(sortedStages, task, departments) || sortedStages[0];
    stageStatus = currentStage?.status || 'Pending';
  } else {
    const nextStageIndex = lastCompletedIndex + 1;
    if (nextStageIndex < sortedStages.length) {
      currentStage = findNextApplicableStage(
        sortedStages[lastCompletedIndex], 
        sortedStages.slice(nextStageIndex), 
        task, 
        departments
      ) || sortedStages[nextStageIndex];
      
      stageStatus = currentStage?.status || 'Pending';
      
      if (currentStage && isStageCompleted(currentStage)) {
        stageStatus = 'Completed';
      }
    } else {
      currentStage = sortedStages[lastCompletedIndex];
      stageStatus = 'Completed';
    }
  }

  if (!currentStage) {
    return {
      stageName: 'No Stage',
      stageStatus: 'N/A',
      stageFollowUp: null
    };
  }

  return {
    stageName: currentStage.name || 'Unknown Stage',
    stageStatus,
    stageFollowUp: currentStage.follow_up || null
  };
};

// Helper functions for stage management
const findFirstApplicableStage = (sortedStages: any[], task: any, departments: any[]): any => {
  return sortedStages.find(stage => isStageApplicableToTask(stage, task, departments)) || null;
};

const findNextApplicableStage = (currentStage: any, remainingStages: any[], task: any, departments: any[]): any => {
  return remainingStages.find(stage => isStageApplicableToTask(stage, task, departments)) || null;
};

const isStageApplicableToTask = (stage: any, task: any, departments: any[]): boolean => {
  if (!task || !departments.length) return true;

  const dept = departments.find(d => d.id === (task.department?.id || task.department_id));
  if (!dept) return true;

  const subdept = dept.tm_subdepartments?.find((s: any) => 
    s.id === (task.subdepartment?.id || task.subdepartment_id)
  );

  if (subdept) {
    const subdeptStage = subdept.stages?.find((s: any) => s.stage_id === stage.id);
    if (subdeptStage?.applicable === false) return false;

    if (task.class_id) {
      const cls = subdept.classes?.find((c: any) => c.id.toString() === task.class_id.toString());
      if (cls?.stages?.some((s: any) => s.stage_id === stage.id && s.applicable === false)) {
        return false;
      }
    }
  }

  const deptStage = dept.stages?.find((s: any) => s.stage_id === stage.id);
  return deptStage?.applicable !== false;
};

// UI Components
const StatusBadge = ({ status, type }: { status: string; type: string }) => {
  const getColor = () => {
    switch (type) {
      case 'active': return 'bg-green-800';
      case 'expiring_soon': return 'bg-blue-800';
      case 'expired': return 'bg-red-800';
      default: return 'bg-slate-600';
    }
  };

  return (
    <Badge className={`whitespace-normal text-sm text-white ${getColor()}`}>
      {status}
    </Badge>
  );
};

const ExpandButton = ({ 
  isExpanded, 
  onClick,
  className = ''
}: { 
  isExpanded: boolean; 
  onClick: () => void;
  className?: string;
}) => (
  <Button
    variant="ghost"
    size="icon"
    className={`h-5 w-5 p-0 text-white hover:text-white ${className}`}
    onClick={onClick}
  >
    {isExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
  </Button>
);

// Cell Renderers
export const renderImmigrationStatusCell = (
  task: any,
  getEnhancedStatus: (task: any) => StatusInfo,
  expandedStatuses: Set<string>,
  toggleExpansion: (id: string) => void
) => {
  const statusInfo = getEnhancedStatus(task);
  const isExpanded = expandedStatuses.has(task.id.toString());

  if (statusInfo.type === 'na') {
    return <StatusBadge status={statusInfo.status} type={statusInfo.type} />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <StatusBadge status={statusInfo.status} type={statusInfo.type} />
        <ExpandButton 
          isExpanded={isExpanded} 
          onClick={() => toggleExpansion(task.id.toString())} 
        />
      </div>

      {isExpanded && (
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

export const renderCurrentStageStatusCell = (task: any, getStageStatus: (task: any) => StageStatusInfo) => {
  const { stageStatus } = getStageStatus(task);
  const getStatusColor = (status: string) => 'text-white'; // Add your color logic here

  return (
    <span className={`whitespace-normal text-sm ${getStatusColor(stageStatus)}`}>
      {stageStatus}
    </span>
  );
};

// Data processing
export const getCellContent = (
  task: any,
  headerId: string,
  enhancedTasksData: Map<string, any>,
  taskDependants: Map<string, any[]>,
  expandedDependants: Set<string>,
  companies: Map<number, string>,
  getTaskHierarchy: (task: any) => any,
  getStaffName: (id: string) => string,
  getEnhancedStatus: (task: any) => StatusInfo,
  getStageStatus: (task: any) => StageStatusInfo,
  renderStatusCell: (task: any) => React.ReactNode,
  renderStageStatusCell: (task: any) => React.ReactNode,
  toggleDependants: (id: string) => void,
  setLinkingTask: (task: any) => void,
  setIsLinkDialogOpen: (open: boolean) => void
) => {
  const enhancedTask = enhancedTasksData.get(task.id.toString()) || task;
  const taskDeps = taskDependants.get(task.id.toString()) || [];
  const isExpanded = expandedDependants.has(task.id.toString());

  const cellContentMap = {
    id: task.id,
    applicant_name: (
      <div className="flex items-center justify-between gap-1 w-[300px]">
        <div className="flex-grow">
          <div className="font-medium truncate" title={task.applicant_name}>
            {task.applicant_name || 'N/A'}
          </div>
        </div>
        <div className="flex gap-1">
          {taskDeps.length > 0 && (
            <ExpandButton
              isExpanded={isExpanded}
              onClick={() => toggleDependants(task.id.toString())}
              className="text-white hover:bg-green-100 flex-shrink-0"
            />
          )}
          <Button
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-white hover:bg-blue-100 flex-shrink-0"
            title="Link source documents"
            onClick={() => { 
              setLinkingTask(task); 
              setIsLinkDialogOpen(true); 
            }}
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    ),
    immigration_document_type: getEnhancedStatus(task).documentType || '-',
    immigration_expiry_date: getEnhancedStatus(task).date 
      ? format(getEnhancedStatus(task).date as Date, 'dd MMM yyyy') 
      : '-',
    immigration_status: renderStatusCell(task),
    current_stage_name: getStageStatus(task).stageName || 'N/A',
    current_stage_status_value: renderStageStatusCell(task),
    current_stage_follow_up: (() => {
      const { stageFollowUp } = getStageStatus(task);
      if (!stageFollowUp) return '-';
      return <span className="whitespace-nowrap text-sm text-white">{stageFollowUp}</span>;
    })(),
    company_name: companies.get(task.company_id) || 'N/A',
    job_level: (() => {
      const hierarchy = getTaskHierarchy(task);
      return hierarchy?.subclass?.name || hierarchy?.class?.name || 
             hierarchy?.subdepartment?.name || 'N/A';
    })(),
    renewal_new: <span className="text-sm font-semibold">{task.renewal_status || 'New'}</span>,
    case_status: <span className="text-sm font-semibold">{task.status || 'pending'}</span>,
    nationality: enhancedTask.nationality || 'N/A',
    age: enhancedTask.age?.toString() || 'N/A',
    task_manager: task.task_manager_id ? getStaffName(task.task_manager_id) : 'N/A',
    officer: task.officer_id ? getStaffName(task.officer_id) : 'N/A',
    task_assistant: task.task_assistant_id ? getStaffName(task.task_assistant_id) : 'N/A'
  };

  return cellContentMap[headerId as keyof typeof cellContentMap] || task[headerId] || 'N/A';
};

// Sorting and filtering
export const sortTasks = (
  tasks: any[],
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null,
  companies: Map<number, string>
) => {
  if (!sortConfig) return [...tasks];

  return [...tasks].sort((a, b) => {
    const getSortValue = (task: any, key: string) => {
      switch (key) {
        case 'applicant_name': return task.applicant_name?.toLowerCase() || '';
        case 'company_name': return companies.get(task.company_id)?.toLowerCase() || '';
        case 'status': return task.status?.toLowerCase() || '';
        default: return task[key]?.toString().toLowerCase() || '';
      }
    };

    const valueA = getSortValue(a, sortConfig.key);
    const valueB = getSortValue(b, sortConfig.key);

    if (valueA === valueB) return 0;
    if (!valueA) return 1;
    if (!valueB) return -1;

    const comparison = valueA.localeCompare(valueB);
    return sortConfig.direction === 'asc' ? comparison : -comparison;
  });
};

export const filterTasksBySearch = (
  tasks: any[],
  searchTerm: string,
  enhancedTasksData: Map<string, any>,
  taskDependants: Map<string, any[]>,
  companies: Map<number, string>,
  getTaskHierarchy: (task: any) => any,
  getUserDisplayName: (id: string) => string
) => {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return tasks;

  return tasks.filter(task => {
    const enhancedTask = enhancedTasksData.get(task.id.toString()) || task;
    const hierarchy = getTaskHierarchy(task);
    
    // Basic fields to search in
    const searchFields = [
      task.id?.toString(),
      task.applicant_name,
      task.job_description,
      task.status,
      task.renewal_status,
      enhancedTask.nationality,
      enhancedTask.age?.toString(),
      companies.get(task.company_id),
      hierarchy?.department?.name,
      hierarchy?.subdepartment?.name,
      hierarchy?.class?.name,
      hierarchy?.subclass?.name,
      getUserDisplayName(task.task_manager_id),
      getUserDisplayName(task.officer_id),
      getUserDisplayName(task.task_assistant_id)
    ].filter(Boolean).join(' ').toLowerCase();

    if (searchFields.includes(term)) return true;

    // Search in dependants
    const dependants = taskDependants.get(task.id.toString()) || [];
    if (dependants.length > 0) {
      const dependantText = dependants
        .map(dep => [dep.full_name, dep.nationality, dep.age, dep.relationship]
          .filter(Boolean)
          .join(' ')
        )
        .join(' ')
        .toLowerCase();

      if (dependantText.includes(term)) return true;
    }

    return false;
  });
};

export const isDocumentApplicable = (doc: any, task: any): boolean => {
  if (!doc || !task) return false;
  if (doc.isSpecial !== true) return true;
  if (!Array.isArray(doc.targetEntities) || doc.targetEntities.length === 0) return false;

  const taskClassId = task.class_id?.toString();
  const taskSubdeptId = task.subdepartment?.id?.toString() || task.subdepartment_id?.toString();

  return doc.targetEntities.some((entity: any) => {
    const classMatch = !entity.class_id || entity.class_id.toString() === taskClassId;
    const subdeptMatch = !entity.subdept_id || entity.subdept_id.toString() === taskSubdeptId;
    return classMatch && subdeptMatch;
  });
};