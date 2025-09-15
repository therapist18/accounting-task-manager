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
    // Check if the date is valid
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
};
export const getCurrentStageStatus = (
  task: any,
  stages: any[],
  departments: any[],
  allDocuments: any[] = []
) => {
  console.log('🔍 getCurrentStageStatus called for task:', task.id, 'applicant:', task.applicant_name);
  
  // Early return if no stages or task
  if (!stages.length || !task) {
    console.log('❌ No stages or task found');
    return {
      stageName: 'No Stage',
      stageStatus: 'N/A',
      stageFollowUp: null
    };
  }

  // Sort stages by order_num for proper sequence
  const sortedStages = [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  console.log('📋 Sorted stages:', sortedStages.map(s => ({ id: s.id, name: s.name, order: s.order_num })));
  
  // Helper function to check if a stage is truly completed based on ACTUAL data
  const isStageCompleted = (stage: any) => {
    console.log(`🔄 Checking completion for stage: ${stage.name} (${stage.id})`);
    
    // Check if stage has documents requirement
    const requiresDocuments = stage.documents && stage.documents.length > 0;
    console.log('📄 Stage requires documents:', requiresDocuments);
    
    if (requiresDocuments) {
      console.log('🔍 Checking document requirements...');
      
      // For document-based stages, check for linked documents
      const linkedDocumentData = task.source_document_id?.[stage.id];
      console.log('🔗 Linked document data:', linkedDocumentData);
      const hasLinkedDocument = !!linkedDocumentData;
      console.log('📎 Has linked document:', hasLinkedDocument);
      
      if (!hasLinkedDocument) {
        console.log('❌ Missing linked document for upload stage');
        return false;
      }
      
      // Verify the linked document exists and is valid
      if (allDocuments.length > 0) {
        const documentId = typeof linkedDocumentData === 'string' 
          ? linkedDocumentData 
          : linkedDocumentData.id;
        console.log('🔍 Looking for document ID:', documentId);
        
        const linkedDoc = allDocuments.find(doc => doc.id === documentId);
        console.log('📋 Found linked document:', linkedDoc ? { 
          id: linkedDoc.id, 
          indicator: linkedDoc.indicator, 
          created_at: linkedDoc.created_at,
          document_id: linkedDoc.document_id 
        } : 'NOT FOUND');
        
        // Document should exist and not be marked as indicator-only
        if (!linkedDoc || linkedDoc.indicator === true) {
          console.log('❌ Document not found or is indicator-only');
          return false;
        }
        
        // Check if document is older than task (which makes it invalid)
        if (task.created_at && linkedDoc.created_at) {
          const docDate = new Date(linkedDoc.created_at);
          const taskDate = new Date(task.created_at);
          const isOldDoc = docDate < taskDate;
          console.log('📅 Document age check:', {
            docDate: docDate.toISOString(),
            taskDate: taskDate.toISOString(),
            isOldDoc
          });
          if (isOldDoc) {
            console.log('❌ Document is older than task');
            return false;
          }
        }
      }
      
      console.log('✅ Stage with documents is completed (has valid linked document)');
      return true;
    } else {
      // For stages without document requirements, check stored stage data
      const stageData = task.stages?.[stage.id];
      const hasDateOrStatus = stageData && (
        stageData.status === 'completed' || 
        stageData.date || 
        stageData.completedAt
      );
      
      console.log('✅ Stage without documents completion check:', {
        hasStoredData: !!stageData,
        hasDateOrStatus,
        stageData
      });
      
      return hasDateOrStatus;
    }
  };
  
  // Find the last completed stage using ACTUAL completion detection
  let lastCompletedStage = null;
  let lastCompletedIndex = -1;
  
  console.log('🔍 Checking all stages for completion using ACTUAL data...');
  for (let i = 0; i < sortedStages.length; i++) {
    const stage = sortedStages[i];
    
    console.log(`\n--- Stage ${i + 1}: ${stage.name} ---`);
    const completed = isStageCompleted(stage);
    
    if (completed) {
      console.log(`✅ Stage ${stage.name} is COMPLETED`);
      lastCompletedStage = stage;
      lastCompletedIndex = i;
    } else {
      console.log(`❌ Stage ${stage.name} is NOT completed`);
    }
  }
  
  console.log('\n🎯 Final completion analysis:');
  console.log('Last completed stage:', lastCompletedStage?.name || 'NONE');
  console.log('Last completed index:', lastCompletedIndex);
  
  // Determine current stage based on completion status
  let currentStage;
  let stageStatus = 'Pending'; // Default fallback
  
  if (lastCompletedStage === null) {
    // No stages completed - current stage is the first applicable stage
    console.log('🎯 No stages completed, finding first applicable stage...');
    currentStage = findFirstApplicableStage(sortedStages, task, departments) || sortedStages[0];
    // Use the predefined status from the stage configuration
    stageStatus = currentStage?.status || 'Pending';
    console.log('📍 Current stage (first):', currentStage?.name, 'Status:', stageStatus);
  } else {
    // Check if there's a next stage after the last completed one
    const nextStageIndex = lastCompletedIndex + 1;
    console.log('🎯 Last completed stage index:', lastCompletedIndex, 'Next stage index:', nextStageIndex);
    
    if (nextStageIndex < sortedStages.length) {
      // Find the next applicable stage
      console.log('🔍 Finding next applicable stage...');
      currentStage = findNextApplicableStage(
        lastCompletedStage, 
        sortedStages.slice(nextStageIndex), 
        task, 
        departments
      ) || sortedStages[nextStageIndex];
      
      // Use the predefined status from the stage configuration
      stageStatus = currentStage?.status || 'Pending';
      console.log('📍 Current stage (next):', currentStage?.name, 'Status:', stageStatus);
      
      // Check if the current stage is actually completed
      if (currentStage) {
        const isCurrentStageCompleted = isStageCompleted(currentStage);
        if (isCurrentStageCompleted) {
          stageStatus = 'Completed';
          console.log('📊 Current stage is actually completed');
        }
      }
    } else {
      // All stages completed - current stage is the last stage
      console.log('🎯 All stages completed');
      currentStage = lastCompletedStage;
      stageStatus = 'Completed';
    }
  }
  
  if (!currentStage) {
    console.log('❌ No current stage determined');
    return {
      stageName: 'No Stage',
      stageStatus: 'N/A',
      stageFollowUp: null
    };
  }

  console.log('\n🏁 FINAL RESULT:');
  console.log('Current Stage:', currentStage.name);
  console.log('Stage Status:', stageStatus);
  console.log('Stage Follow-up:', currentStage.follow_up);

  return {
    stageName: currentStage.name || 'Unknown Stage',
    stageStatus: stageStatus,
    stageFollowUp: currentStage.follow_up || null
  };
};

// Helper function to find the first applicable stage
const findFirstApplicableStage = (sortedStages: any[], task: any, departments: any[]): any => {
  for (const stage of sortedStages) {
    if (isStageApplicableToTask(stage, task, departments)) {
      return stage;
    }
  }
  return null;
};

// Updated helper function to find the next applicable stage
const findNextApplicableStage = (currentStage: any, remainingStages: any[], task: any, departments: any[]): any => {
  for (const stage of remainingStages) {
    if (isStageApplicableToTask(stage, task, departments)) {
      return stage;
    }
  }
  return null;
};

// Helper function to check if a stage is applicable to a task
const isStageApplicableToTask = (stage: any, task: any, departments: any[]): boolean => {
  try {
    if (!task || !departments.length) return true;

    const dept = departments.find(d => d.id === task.department?.id || d.id === task.department_id);
    if (!dept) return true;

    const subdept = dept.tm_subdepartments?.find(s => 
      s.id === task.subdepartment?.id || s.id === task.subdepartment_id
    );

    // Check subdepartment level applicability
    if (subdept) {
      const subdeptStage = subdept.stages?.find(s => s.stage_id === stage.id);
      if (subdeptStage && subdeptStage.applicable === false) return false;

      // Check class level applicability
      if (task.class_id) {
        const cls = subdept.classes?.find(c => c.id.toString() === task.class_id.toString());
        if (cls) {
          const classStage = cls.stages?.find(s => s.stage_id === stage.id);
          if (classStage && classStage.applicable === false) return false;
        }
      }
    }

    // Check department level applicability
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
  getEnhancedImmigrationStatus: any,
  expandedImmigrationStatus: any,
  toggleImmigrationStatusExpansion: any
) => {
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
};

export const renderCurrentStageStatusCell = (
  task: any,
  getCurrentStageStatus: any
) => {
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
};

export const getCellContent = (
  task: any,
  headerId: string,
  enhancedTasksData: Map<string, any>,
  taskDependants: Map<string, any[]>,
  expandedDependants: Set<string>,
  companies: Map<number, string>,
  getTaskHierarchy: any,
  getStaffName: any,
  getEnhancedImmigrationStatus: any,
  getCurrentStageStatus: any,
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
};