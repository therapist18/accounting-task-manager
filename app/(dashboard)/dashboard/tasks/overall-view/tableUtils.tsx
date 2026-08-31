// @ts-nocheck
"use client"

import { format, isAfter, isEqual, isValid, parse, startOfToday } from 'date-fns';
import { Plus, Minus, LinkIcon, X, RefreshCw, Edit, UserPlus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import React, { useMemo, useCallback, useEffect, useState } from "react";
import supabase from '@/lib/supabase/client';
import { parseDate, DATE_FORMATS, DATE_FIELDS, findDatesInObject } from '@/app/generic-functions/dateUtils';

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

export interface TimeStatus {
  elapsed: number;
  remaining?: number;
  isOverdue: boolean;
  progress?: number;
  percentage?: string;
  formattedElapsed: string;
  formattedRemaining: string;
  formattedOverdue: string;
}

export interface TableHeader {
  id: string;
  label: string;
  default: boolean;
  width?: number; // <--- Change this from string to number
}

export const ENHANCED_TABLE_HEADERS_IMMIGRATION: TableHeader[] = [
  { id: 'id', label: 'ID', default: true, width: 48 }, // was 'w-12'
  { id: 'applicant_name', label: 'Applicant Full Name', default: true, width: 150 }, // was 'w-44'
  { id: 'company_name', label: 'Company Name', default: false, width: 150 }, // was 'w-48'
  { id: 'company_prefix', label: 'Company Prefix', default: true, width: 112 }, // was 'w-28'
  { id: 'sub_department', label: 'Sub Department', default: true, width: 100 }, // was 'w-28'
  { id: 'job_level', label: 'Class', default: true, width: 100 }, // was 'w-28'
  { id: 'renewal_status', label: 'Renewal/New', default: true, width: 100 }, // was 'w-28'
  { id: 'passport_number', label: 'Passport Number', default: false, width: 112 }, // was 'w-28'
  { id: 'duration', label: 'Duration', default: false, width: 112 }, // was 'w-28'
  { id: 'immigration_document_type', label: 'Current Immigration Document Type', default: false, width: 192 }, // was 'w-48'
  { id: 'immigration_expiry_date', label: 'Current Immigration Expiry Date', default: false, width: 160 }, // was 'w-40'
  { id: 'immigration_days_to_go', label: 'Days Remaining', default: false, width: 112 }, // was 'w-28'
  { id: 'current_stage_name', label: 'Current Stage Name', default: true, width: 168 }, // was 'w-42'
  { id: 'current_stage_status_value', label: 'Current Stage Status', default: true, width: 168 }, // was 'w-42'
  { id: 'current_stage_follow_up', label: 'Current Stage Follow-up', default: false, width: 112 }, // was 'w-28'
  { id: 'job_description', label: 'Job Description', default: false, width: 128 }, // was 'w-32'
  { id: 'nationality', label: 'Nationality', default: false, width: 128 }, // was 'w-32'
  { id: 'full_name', label: 'Full Name', default: false, width: 128 }, // was 'w-32'
  { id: 'age', label: 'Age', default: false, width: 80 }, // was 'w-20'
  { id: 'task_manager', label: 'Task Manager', default: false, width: 128 }, // was 'w-32'
  { id: 'task_assistant', label: 'Task Assistant', default: false, width: 128 }, // was 'w-32'
  // Every officer ever assigned across the task's officer-follow-up stages (not just the
  // current one) — same field id/semantics as summary-reports/stageColumnConfig.ts's
  // 'officers' SUMMARY_COLUMNS column via TASK_FIELD_TO_SUMMARY_COLUMN_ID's identity mapping.
  // Like promised_time/planned_execution above, only resolved on the Summary Reports page.
  { id: 'officers', label: 'Officers', default: false, width: 128 },
  { id: 'r_number', label: 'R Number', default: false, width: 112 }, // was 'w-28'
  { id: 'cancellation_reason', label: 'Cancellation Reason', default: true, width: 192 }, // was 'w-48'
  { id: 'cancellation_date', label: 'Cancellation Date', default: false, width: 160 }, // was 'w-40'
  { id: 'cancelled_by', label: 'Cancelled By', default: false, width: 128 }, // was 'w-32'
  // Same ids as SUMMARY_COLUMNS' computed_time columns (summary-reports/stageColumnConfig.ts)
  // deliberately — lets a memorized report select/deselect them like any other field via
  // TASK_FIELD_TO_SUMMARY_COLUMN_ID's identity mapping. Currently only resolved on the
  // Summary Reports page (via executionMath.ts's Promised/Planned/Actual Execution helpers);
  // selecting them in a report applied on the /reports page itself has no renderer yet there.
  { id: 'promised_time', label: 'Promised Time', default: false, width: 128 },
  { id: 'planned_execution', label: 'Planned Execution', default: false, width: 144 },
  { id: 'actual_execution', label: 'Actual Execution', default: false, width: 128 },
  { id: 'execution_delta', label: 'Actual Execution vs Promised', default: false, width: 176 },
  { id: 'stages_time_expected', label: 'Stages Time Expected', default: false, width: 144 },
];

export const ENHANCED_TABLE_HEADERS: TableHeader[] = [
  { id: 'id', label: 'Task Reference', default: true, width: 80 }, // was 'w-20'
  { id: 'applicant_name', label: 'Applicant Full Name', default: true, width: 192 }, // was 'w-48'
  { id: 'job_description', label: 'Job Description', default: true, width: 128 }, // was 'w-32'
  { id: 'job_level', label: 'Job Level', default: true, width: 128 }, // was 'w-32'
  { id: 'renewal_new', label: 'Renewal/New', default: false, width: 112 }, // was 'w-28'
  { id: 'task_manager', label: 'Task Manager', default: false, width: 128 }, // was 'w-32'
  { id: 'task_assistant', label: 'Task Assistant', default: false, width: 128 }, // was 'w-32'
  { id: 'cancellation_reason', label: 'Cancellation Reason', default: true, width: 192 }, // was 'w-48'
  { id: 'cancellation_date', label: 'Cancellation Date', default: true, width: 160 }, // was 'w-40'
  { id: 'cancelled_by', label: 'Cancelled By', default: true, width: 128 }, // was 'w-32'
];

export const STATS_HEADERS = [
  { id: 'stats_completed', label: 'Completed Stages', default: true },
  { id: 'stats_pending', label: 'Pending Stages', default: true },
  { id: 'stats_na', label: 'N/A Stages', default: false },
];

export const calculateAge = (dateOfBirth: string | null): number | null => {
  if (!dateOfBirth) return null;

  try {
    const birthDate = parseDate(dateOfBirth);
    if (!birthDate || isNaN(birthDate.getTime())) {
      const fallbackDate = new Date(dateOfBirth);
      if (isNaN(fallbackDate.getTime())) {
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

const calculateAgeFromDate = (birthDate: Date): number => {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
};

// --- Time & Duration Logic (Moved from ReportsPage) ---

export const formatDuration = (minutes: number): string => {
  if (isNaN(minutes) || !isFinite(minutes)) return 'N/A';

  const absMinutes = Math.abs(Math.round(minutes));
  const days = Math.floor(absMinutes / (60 * 24));
  const hours = Math.floor((absMinutes % (60 * 24)) / 60);
  const mins = absMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);

  return parts.join(' ');
};

export const getTimeStatus = (startTime: Date | string | null, estimatedMinutes: number): TimeStatus | null => {
  if (!startTime) return null;

  try {
    const startDate = parseDate(startTime instanceof Date ? startTime.toISOString() : startTime);
    if (!startDate) return null;

    const now = new Date();
    const elapsedMs = now.getTime() - startDate.getTime();
    const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));

    // If no estimated minutes, just return elapsed
    if (!estimatedMinutes || estimatedMinutes <= 0) {
      return {
        elapsed: Math.max(0, elapsedMinutes),
        remaining: 0,
        isOverdue: false,
        progress: 100,
        percentage: '100%',
        formattedElapsed: formatDuration(elapsedMinutes),
        formattedRemaining: '-',
        formattedOverdue: '-'
      };
    }

    const remainingMinutes = Math.max(0, estimatedMinutes - elapsedMinutes);
    const isOverdue = elapsedMinutes > estimatedMinutes;
    const progress = Math.min(100, Math.max(0, (elapsedMinutes / estimatedMinutes) * 100));

    return {
      elapsed: Math.max(0, elapsedMinutes),
      remaining: remainingMinutes,
      isOverdue,
      progress,
      percentage: `${Math.round(progress)}%`,
      formattedElapsed: formatDuration(elapsedMinutes),
      formattedRemaining: formatDuration(remainingMinutes),
      formattedOverdue: isOverdue ? formatDuration(elapsedMinutes - estimatedMinutes) : '0m'
    };
  } catch (e) {
    console.error("Error in getTimeStatus:", e);
    return null;
  }
};

export const calculateDaysRemaining = (expiryDate: Date | null): string => {
  if (!expiryDate) return '-';
  const today = startOfToday();
  const diffTime = expiryDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays.toString();
};

export const getSubDepartmentDisplay = (task: any, departments: any[]): string => {
  const jobLevel = task.job_level;

  if (!jobLevel || typeof jobLevel !== 'object' || jobLevel === null) {
    return 'N/A';
  }

  try {
    const department = departments.find(d => d.id == jobLevel.department_id);
    if (!department) {
      return 'N/A';
    }

    const subdepartment = department.tm_subdepartments?.find(
      (sd: any) => sd.id == jobLevel.subdepartment_id
    );

    if (jobLevel.subdepartment_id) {
      return subdepartment?.name || `SubDept ${jobLevel.subdepartment_id}`;
    }

    return 'N/A';
  } catch (error) {
    return 'N/A';
  }
};

// Class/Sub-Class are optional levels below Sub-Department — a task may sit at the
// subdepartment level with neither set, so both return 'N/A' rather than a fabricated
// name whenever the id isn't present on the job level.
export const getClassDisplay = (task: any, departments: any[]): string => {
  const jobLevel = task.job_level;
  if (!jobLevel?.class_id && !task.class_id) return 'N/A';

  try {
    const department = departments.find(d => d.id == (jobLevel?.department_id ?? task.department_id));
    const subdepartment = department?.tm_subdepartments?.find((sd: any) => sd.id == (jobLevel?.subdepartment_id ?? task.subdepartment_id));
    const classId = jobLevel?.class_id ?? task.class_id;
    const cls = subdepartment?.classes?.find((c: any) => c.id == classId);
    return cls?.name || `Class ${classId}`;
  } catch (error) {
    return 'N/A';
  }
};

export const getSubClassDisplay = (task: any, departments: any[]): string => {
  const jobLevel = task.job_level;
  if (!jobLevel?.subclass_id && !task.subclass_id) return 'N/A';

  try {
    const department = departments.find(d => d.id == (jobLevel?.department_id ?? task.department_id));
    const subdepartment = department?.tm_subdepartments?.find((sd: any) => sd.id == (jobLevel?.subdepartment_id ?? task.subdepartment_id));
    const classId = jobLevel?.class_id ?? task.class_id;
    const subclassId = jobLevel?.subclass_id ?? task.subclass_id;
    const cls = subdepartment?.classes?.find((c: any) => c.id == classId);
    const subCls = cls?.subClasses?.find((sc: any) => sc.id == subclassId);
    return subCls?.name || `Sub-Class ${subclassId}`;
  } catch (error) {
    return 'N/A';
  }
};

export const getJobLevelDisplay = (task: any, departments: any[]): string => {
  const jobLevel = task.job_level;
  if (!jobLevel) return 'N/A';

  if (typeof jobLevel === 'string') {
    const levels = jobLevel.split('>').map(s => s.trim());
    return levels[levels.length - 1] || 'N/A';
  }

  if (typeof jobLevel === 'object' && jobLevel !== null) {
    try {
      const department = departments.find(d => d.id == jobLevel.department_id);
      if (!department) return 'N/A';

      const subdepartment = department.tm_subdepartments?.find(
        (sd: any) => sd.id == jobLevel.subdepartment_id
      );

      // For level 3 (class)
      if (jobLevel.level === 3 && subdepartment?.classes?.length && jobLevel.class_id) {
        const classItem = subdepartment.classes.find(
          (c: any) => c.id == jobLevel.class_id
        );
        return classItem?.name || `Class ${jobLevel.class_id}`;
      }

      // For level 1 (department)
      if (jobLevel.level === 1) {
        return department.name || `Dept ${jobLevel.department_id}`;
      }

      // Fallback cases
      if (jobLevel.class_id) return `Class ${jobLevel.class_id}`;
      if (jobLevel.subclass_id) return `Subclass ${jobLevel.subclass_id}`;
      return 'N/A';
    } catch (error) {
      console.error('Error processing job level:', error);
    }
  }
  return 'N/A';
};

export const getCompanyNameFromParticipants = (task: any, companies?: Map<number, any>): string => {
  if (!task?.participants_details || !Array.isArray(task.participants_details)) {
    return 'N/A';
  }

  const company = task.participants_details.find((p: any) =>
    (Array.isArray(p.role) && (p.role.includes('company') || p.role.includes('sponsor'))) ||
    p.role === 'company' || p.role === 'sponsor'
  );

  // If company has a name, use it
  if (company?.name) {
    return company.name;
  }

  // Otherwise, look up the name from the companies map using the company id
  if (company?.id && companies instanceof Map) {
    const entry = companies.get(Number(company.id));
    return (typeof entry === 'object' ? entry?.name : entry) || 'N/A';
  }

  return 'N/A';
};

export const getCompanyPrefixFromParticipants = (task: any, companies?: Map<number, any>): string => {
  if (!task?.participants_details || !Array.isArray(task.participants_details)) {
    return 'N/A';
  }

  const company = task.participants_details.find((p: any) =>
    (Array.isArray(p.role) && (p.role.includes('company') || p.role.includes('sponsor'))) ||
    p.role === 'company' || p.role === 'sponsor'
  );

  if (company?.id && companies instanceof Map) {
    const entry = companies.get(Number(company.id));
    return (typeof entry === 'object' ? entry?.prefix : '') || 'N/A';
  }

  return 'N/A';
};

// Shared with SummaryTable.tsx and company-profiles' TaskListTable.tsx — a single
// definition so "Sponsor Name" always means the same participant lookup everywhere it's
// shown, rather than two hand-copied versions that could quietly drift apart.
export const getSponsorName = (task: any): string | null => {
  const sponsor = task?.participants_details?.find((p: any) =>
    (Array.isArray(p.role) && p.role.includes('sponsor')) || p.role === 'sponsor'
  );
  return sponsor?.name || null;
};

export const getStaffFromParticipants = (
  task: any,
  role: string,
  getStaffNameFn?: (userId: any) => string,
  departments?: any[],
  officers?: any[]
): string | null => {
  if (!task?.participants_details || !Array.isArray(task.participants_details)) {
    return null;
  }

  // For officer role, handle multiple officers with fallback logic
  if (role === 'officer') {
    // First, check for officer_ids array (new multi-officer support)
    if (task.officer_ids && Array.isArray(task.officer_ids) && task.officer_ids.length > 0) {
      if (getStaffNameFn) {
        const officerNames = task.officer_ids
          .map(id => getStaffNameFn(id))
          .filter(Boolean);
        return officerNames.length > 0 ? officerNames.join(', ') : null;
      }
      return task.officer_ids.join(', ');
    }

    // Fallback to officer_id (single string)
    if (task.officer_id && getStaffNameFn) {
      return getStaffNameFn(task.officer_id);
    }
  }

  // Check participants_details for the role
  const staff = task.participants_details.find((p: any) =>
    p.role && Array.isArray(p.role) ? p.role.includes(role) : p.role === role
  );

  if (staff && staff.id !== null) {
    if (getStaffNameFn) {
      const lookedUpName = getStaffNameFn(staff.id);
      return lookedUpName;
    }
    return staff.name || null;
  }

  // Fallback: check task's direct ID fields and look up name using getStaffName
  const roleToIdField: Record<string, string> = {
    'officer': 'officer_id',
    'task_manager': 'task_manager_id',
    'task_assistant': 'task_assistant_id'
  };

  const idField = roleToIdField[role];
  if (idField && task[idField] && getStaffNameFn) {
    return getStaffNameFn(task[idField]);
  }

  // Fallback: for officer role, try to get inherited officer from department/subdepartment
  if (role === 'officer' && departments && officers) {
    const inheritedOfficer = getInheritedOfficerForTask(task, departments, officers);
    if (inheritedOfficer) {
      return inheritedOfficer.displayName || inheritedOfficer.name || inheritedOfficer.full_name || null;
    }
  }

  return null;
};

// Helper function to get inherited officer for a task (moved from EnhancedTable)
const getInheritedOfficerForTask = (task: any, departments: any[] = [], officers: any[] = []) => {
  if (!task || !departments.length) return null;

  const department = departments.find(d =>
    d.id === task.department_id || d.id === task.department?.id
  );
  if (!department) return null;

  const subdepartment = department.tm_subdepartments?.find(s =>
    s.id === task.subdepartment_id || s.id === task.subdepartment?.id
  );
  if (!subdepartment) return null;

  // Filter officers by job level access
  const filteredOfficers = officers.filter(officer => {
    // Check if officer has access to this department/subdepartment/class
    const hasDeptAccess = officer.assignments?.some((a: any) =>
      a.department_id === department.id && (!a.subdepartment_id || a.subdepartment_id === subdepartment.id)
    );
    return hasDeptAccess;
  });

  return filteredOfficers.length > 0 ? filteredOfficers[0] : null;
};

// Helper function to get officers for the current stage of a task
export const getOfficersForCurrentStage = (
  task: any,
  stages: any[],
  getStaffNameFn?: (userId: any) => string
): string | null => {
  if (!task || !stages || !stages.length) return null;

  // Find the current stage for this task
  const sortedStages = [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  let currentStage = null;

  // Find the highest completed stage
  let highestCompletedIndex = -1;
  for (let i = 0; i < sortedStages.length; i++) {
    const stage = sortedStages[i];
    const stageData = task.stages?.[stage.id];
    if (stageData && (stageData.status === 'completed' || stageData.completedAt)) {
      highestCompletedIndex = i;
    }
  }

  if (highestCompletedIndex === -1) {
    currentStage = sortedStages[0];
  } else if (highestCompletedIndex + 1 < sortedStages.length) {
    currentStage = sortedStages[highestCompletedIndex + 1];
  } else {
    currentStage = sortedStages[highestCompletedIndex];
  }

  if (!currentStage) return null;

  // First, check task-stage specific officer_ids
  const stageData = task.stages?.[currentStage.id];
  if (stageData?.officer_ids && Array.isArray(stageData.officer_ids) && stageData.officer_ids.length > 0) {
    if (getStaffNameFn) {
      const officerNames = stageData.officer_ids
        .map(id => getStaffNameFn(id))
        .filter(Boolean);
      return officerNames.length > 0 ? officerNames.join(', ') : null;
    }
    return stageData.officer_ids.join(', ');
  }

  // Fallback to stage configuration officer_ids
  if (currentStage.officer_ids && Array.isArray(currentStage.officer_ids) && currentStage.officer_ids.length > 0) {
    if (getStaffNameFn) {
      const officerNames = currentStage.officer_ids
        .map(id => getStaffNameFn(id))
        .filter(Boolean);
      return officerNames.length > 0 ? officerNames.join(', ') : null;
    }
    return currentStage.officer_ids.join(', ');
  }

  // Fallback to stage configuration officer_id (single string)
  if (currentStage.officer_id && getStaffNameFn) {
    return getStaffNameFn(currentStage.officer_id);
  }

  return null;
};

export const getCompanyName = (task: any, companies: Map<number, any>): string => {
  // First try participants_details with companies map for lookup
  const participantsName = getCompanyNameFromParticipants(task, companies);
  if (participantsName !== 'N/A') {
    return participantsName;
  }

  // Fallback to companies map using company_id
  if (companies instanceof Map) {
    const entry = companies.get(task.company_id);
    return (typeof entry === 'object' ? entry?.name : entry) || 'N/A';
  }
  return 'N/A';
};

export const formatImmigrationDocumentType = (task: any, getEnhancedStatus: (task: any) => StatusInfo): string => {
  return getEnhancedStatus(task).documentType || '-';
};

export const formatImmigrationExpiryDate = (task: any, getEnhancedStatus: (task: any) => StatusInfo): string => {
  const date = getEnhancedStatus(task).date;
  return date ? format(date as Date, 'dd MMM yyyy') : '-';
};

export const formatImmigrationDaysToGo = (task: any, getEnhancedStatus: (task: any) => StatusInfo): React.ReactNode => {
  const statusInfo = getEnhancedStatus(task);
  if (!statusInfo.date) return '-';

  // Logic extracted from ReportsPage
  const days = Math.ceil((statusInfo.date.getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));

  return (
    <span className={`font-medium ${days < 0 ? 'text-red-600' : days <= 30 ? 'text-amber-600' : 'text-green-600'}`}>
      {days} days
    </span>
  );
};

export const getRawImmigrationDaysToGo = (task: any, getEnhancedStatus: (task: any) => StatusInfo): string => {
  const statusInfo = getEnhancedStatus(task);
  if (!statusInfo.date) return '-9999'; // For sorting
  const days = Math.ceil((statusInfo.date.getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
  return days.toString();
};

export const getCurrentStageFollowUp = (task: any, getStageStatus: (task: any) => StageStatusInfo): string => {
  const { stageFollowUp } = getStageStatus(task);
  return stageFollowUp || '-';
};

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

  const docsWithEffectiveTo = relevantDocs.flatMap(doc => {
    if (!doc.extracted_details) return [];
    const kycData = kycDocuments.get(doc.document_id);
    if (!kycData?.fields) return [];

    const effectiveToFields = kycData.fields
      .filter((f: any) => {
        const fieldName = f.name || f.fieldName || '';
        const isEffectiveTo = f.isEffectiveTo === true ||
          (f.fieldType === 'date' && fieldName === 'Expiry_Date');
        return isEffectiveTo;
      })
      .map((f: any) => f.name || f.fieldName)
      .filter(Boolean);

    if (effectiveToFields.length === 0) return [];

    const docType = kycData.display_name || kycData.name || 'Document';
    const extracted = doc.extracted_details || {};

    for (const field of effectiveToFields) {
      const dateValue = extracted[field];
      if (dateValue) {
        const date = parseDate(dateValue);
        const isValidDate = date && isValid(date);
        if (isValidDate) {
          return [{
            date,
            documentType: docType,
            document: doc,
            isEffectiveTo: true,
            sourceField: field
          }];
        }
      }
    }
    return [];
  });

  if (docsWithEffectiveTo.length > 0) {
    const latestDoc = docsWithEffectiveTo.reduce((latest, current) =>
      isAfter(current.date, latest.date) ? current : latest, docsWithEffectiveTo[0]);

    const today = startOfToday();
    const isFuture = isAfter(latestDoc.date, today) || isEqual(latestDoc.date, today);
    const timeDiff = latestDoc.date.getTime() - today.getTime();
    const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));
    const statusType = isFuture
      ? (daysRemaining <= 30 ? 'expiring_soon' : 'active')
      : 'expired';

    return {
      status: isFuture
        ? `Valid until ${format(latestDoc.date, 'dd MMM yyyy')}`
        : `Expired on ${format(latestDoc.date, 'dd MMM yyyy')}`,
      date: latestDoc.date,
      type: statusType,
      documentType: latestDoc.documentType,
      daysRemaining: isFuture ? daysRemaining : null
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
      ? `Valid until ${format(latestDateInfo.date, 'dd MMM yyyy')} (fallback)`
      : `Expired on ${format(latestDateInfo.date, 'dd MMM yyyy')} (fallback)`,
    date: latestDateInfo.date,
    type: statusType,
    documentType: latestDateInfo.documentType,
    daysRemaining: isFuture ? daysRemaining : null
  };
};

export const fetchAndEnhanceIndividuals = async (
  tasks: any[]
): Promise<{
  dependantsMap: Map<number, any>;
  applicantsMap: Map<number, any>;
}> => {
  try {
    const allIndividualIds = new Set<number>();
    tasks.forEach(task => { if (task.individual_id) allIndividualIds.add(task.individual_id); });
    tasks.forEach(task => {
      if (task.dependant_member && Array.isArray(task.dependant_member)) {
        task.dependant_member.forEach(dep => { if (dep?.id) allIndividualIds.add(dep.id); });
      }
    });

    if (allIndividualIds.size === 0) return { dependantsMap: new Map(), applicantsMap: new Map() };
    const individualIds = Array.from(allIndividualIds).filter(id => id != null);
    if (individualIds.length === 0) return { dependantsMap: new Map(), applicantsMap: new Map() };

    const { data, error } = await supabase
      .from('registry_individuals')
      .select('id, first_name, last_name, full_name, nationality, date_of_birth, relationships, r_number, employment_data')
      .in('id', individualIds);

    if (error) {
      console.error('Error fetching all individuals:', error);
      return { dependantsMap: new Map(), applicantsMap: new Map() };
    }

    const dependantsMap = new Map<number, any>();
    const applicantsMap = new Map<number, any>();

    data.forEach(individual => {
      const enhancedIndividual = {
        ...individual,
        age: calculateAge(individual.date_of_birth),
        individual_id: individual.id
      };
      const isApplicant = tasks.some(task => task.individual_id === individual.id);
      if (isApplicant) applicantsMap.set(individual.id, enhancedIndividual);

      const isDependant = tasks.some(task =>
        task.dependant_member && Array.isArray(task.dependant_member) && task.dependant_member.some(dep => dep?.id === individual.id)
      );
      if (isDependant) dependantsMap.set(individual.id, enhancedIndividual);
    });

    return { dependantsMap, applicantsMap };
  } catch (error) {
    console.error('Error in fetchAndEnhanceIndividuals:', error);
    return { dependantsMap: new Map(), applicantsMap: new Map() };
  }
};

export const createEnhancedTaskData = (
  tasks: any[],
  applicantsMap: Map<number, any>,
  dependantsMap: Map<number, any>
): {
  enhancedTasksData: Map<string, any>;
  taskDependants: Map<string, any[]>;
} => {
  const taskDependantsMap = new Map<string, any[]>();
  const enhancedTasksMap = new Map<string, any>();

  tasks.forEach((task, index) => {
    const taskId = task?.id != null ? task.id.toString() : `__missing_id_${index}__`;
    const applicantData = applicantsMap.get(task.individual_id);

    // Extract duration and renewal/new from job_specific_answers
    const jobSpecificAnswers = task.job_specific_answers || {};
    const duration = jobSpecificAnswers['1769582847128'] || null;
    const renewalNew = jobSpecificAnswers['1769582847129'] || null;

    enhancedTasksMap.set(taskId, {
      ...task,
      applicant_data: applicantData,
      full_name: applicantData?.full_name || task.full_name,
      nationality: applicantData?.nationality || task.nationality,
      age: applicantData?.age,
      r_number: applicantData?.r_number,
      duration: duration,
      renewal_status: renewalNew
    });

    if (task.dependant_member && Array.isArray(task.dependant_member)) {
      const taskDependants = task.dependant_member
        .filter(dep => dep?.id && dependantsMap.has(dep.id))
        .map(dep => ({
          ...dependantsMap.get(dep.id),
          relationship: dep.relationship || 'Dependant'
        }));

      if (taskDependants.length > 0) {
        taskDependantsMap.set(taskId, taskDependants);
      }
    }
  });

  return { enhancedTasksData: enhancedTasksMap, taskDependants: taskDependantsMap };
};

export const enhanceTasksWithIndividualData = async (
  tasks: any[]
): Promise<{
  enhancedTasksData: Map<string, any>;
  taskDependants: Map<string, any[]>;
}> => {
  if (!tasks || tasks.length === 0) return { enhancedTasksData: new Map(), taskDependants: new Map() };
  const { dependantsMap, applicantsMap } = await fetchAndEnhanceIndividuals(tasks);
  return createEnhancedTaskData(tasks, applicantsMap, dependantsMap);
};

// Attribute-based applicability — gates a stage on the TASK's own data (renewal status/
// nationality/age), separate from the structural applicable check above (which only looks at
// job-level: dept/subdept/class). Exported so DepartmentTasksManager.tsx and
// EditableStageCell.tsx both AND it onto their own existing structural checks instead of each
// re-implementing condition matching — see stagesdb.ts's StageApplicabilityCondition comment
// for why this stays a single shared evaluator.
//
// renewal_status is a real tm_tasks column, so it's always resolvable from the raw task as a
// fallback. nationality/age only exist on enhancedTasksData (createEnhancedTaskData above,
// joined from registry_individuals) — when that map isn't supplied or doesn't have this task
// (any caller outside the three in-scope files), a nationality/age condition is treated as
// passed rather than failing closed, so out-of-scope consumers see zero behavior change.
export const stageApplicabilityConditionsMet = (
  stage: any,
  task: any,
  enhancedTasksData: Map<string, any> = new Map()
): boolean => {
  const conditions = stage?.applicabilityConditions;
  if (!conditions || conditions.length === 0) return true;
  const enhanced = task?.id != null ? enhancedTasksData.get(task.id.toString()) : undefined;

  return conditions.every((condition: any) => {
    let actual: string | number | undefined;
    if (condition.field === 'renewal_status') {
      actual = enhanced?.renewal_status || task?.renewal_status;
    } else if (condition.field === 'nationality') {
      if (!enhanced) return true; // not evaluable outside the in-scope callers — don't block
      actual = enhanced.nationality;
    } else if (condition.field === 'age') {
      if (!enhanced) return true;
      actual = enhanced.age;
    } else {
      return true;
    }
    if (actual === undefined || actual === null || actual === '') return true;

    if (condition.operator === 'gte') return Number(actual) >= Number(condition.value);
    if (condition.operator === 'lte') return Number(actual) <= Number(condition.value);
    const same = String(actual).trim().toLowerCase() === String(condition.value).trim().toLowerCase();
    return condition.operator === 'not_equals' ? !same : same;
  });
};

// Reads StageAllocation.display (subdept/class/subclass tiering, same shape as the applicable
// check right below) — "optional" means the stage is structurally applicable but shouldn't be
// treated as the mandatory next step, or clutter the row list, unless the task already has
// data recorded for it. See DepartmentTasksManager.tsx's showOptionalStages toggle and row
// builder, and this file's own findNextApplicableStage.
export const isStageOptionalForTask = (stage: any, task: any, departments: any[] = []): boolean => {
  if (!task || !departments.length) return false;
  const dept = departments.find(d => d.id === (task.department?.id || task.department_id));
  if (!dept) return false;
  const subdept = dept.tm_subdepartments?.find((s: any) => s.id === (task.subdepartment?.id || task.subdepartment_id));
  if (subdept) {
    if (task.class_id) {
      const cls = subdept.classes?.find((c: any) => c.id.toString() === task.class_id.toString());
      const classStage = cls?.stages?.find((s: any) => s.stage_id === stage.id);
      if (classStage && typeof classStage.display === 'boolean') return classStage.display === false;
    }
    const subdeptStage = subdept.stages?.find((s: any) => s.stage_id === stage.id);
    if (subdeptStage && typeof subdeptStage.display === 'boolean') return subdeptStage.display === false;
  }
  return false;
};

// A stage counts as "has data" the moment anything's been recorded for it — even if not
// formally completed — so an optional stage a case actually went through never gets silently
// re-hidden/skipped once it's genuinely relevant.
const hasStageData = (task: any, stageId: string): boolean => {
  const d = task?.stages?.[stageId];
  return !!(d?.date || d?.status || d?.value || d?.completedAt);
};

export const getCurrentStageStatus = (
  task: any,
  stages: any[],
  departments: any[] = [],
  allDocuments: any[] = [],
  enhancedTasksData: Map<string, any> = new Map()
): StageStatusInfo => {
  if (!stages.length || !task) {
    return { stageName: 'No Stage', stageStatus: 'N/A', stageFollowUp: null };
  }

  const sortedStages = [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

  const isStageCompleted = (stage: any, task: any, allDocuments: any[] = []) => {
    if (!task || !stage) return false;
    const stageData = task.stages?.[stage.id];
    const requiresDocuments = stage.documents?.length > 0;

    const isCompleted = stageData && (
      stageData.status === 'completed' ||
      stageData.completedAt ||
      (stageData.documents && Object.keys(stageData.documents).length > 0)
    );

    if (isCompleted) return true;
    if (!requiresDocuments && stageData?.date) return true;
    if (requiresDocuments && stageData?.documents) {
      const hasUploadedDocs = Object.values(stageData.documents).some(
        (doc: any) => doc.status === 'uploaded' || doc.status === 'linked'
      );
      if (hasUploadedDocs) return true;
    }
    return false;
  };

  let highestCompletedIndex = -1;
  const completedStages: { index: number, stage: any }[] = [];

  for (let i = 0; i < sortedStages.length; i++) {
    const stage = sortedStages[i];
    const completed = isStageCompleted(stage, task, allDocuments);
    if (completed) {
      highestCompletedIndex = i;
      completedStages.push({ index: i, stage });
    }
  }

  let currentStage;
  let stageStatus = 'Pending';

  if (highestCompletedIndex === -1) {
    currentStage = findFirstApplicableStage(sortedStages, task, departments, enhancedTasksData) || sortedStages[0];
    if (currentStage) {
      const stageData = task.stages?.[currentStage.id];
      stageStatus = stageData?.status || currentStage.status || 'Pending';
    }
  } else {
    currentStage = sortedStages[highestCompletedIndex];
    const stageData = task.stages?.[currentStage.id];
    stageStatus = stageData?.status || currentStage.status || 'Completed';

    const nextStageIndex = highestCompletedIndex + 1;
    if (nextStageIndex < sortedStages.length) {
      const nextStage = findNextApplicableStage(
        currentStage,
        sortedStages.slice(nextStageIndex),
        task,
        departments,
        enhancedTasksData
      );

      if (nextStage) {
        currentStage = nextStage;
        const nextStageData = task.stages?.[nextStage.id];
        stageStatus = nextStageData?.status || nextStage.status || 'In Progress';
      }
    }
  }

  if (!currentStage) {
    return { stageName: 'No Stage', stageStatus: 'N/A', stageFollowUp: null };
  }

  return {
    stageName: currentStage.name || 'Unknown Stage',
    stageStatus,
    stageFollowUp: currentStage.follow_up || null
  };
};

// A stage is skipped when walking to "next" if it's optional (StageAllocation.display ===
// false) AND the task has no data for it yet — see isStageOptionalForTask/hasStageData above.
const isStageEligibleAsCurrent = (stage: any, task: any, departments: any[], enhancedTasksData: Map<string, any>): boolean => {
  if (!isStageApplicableToTask(stage, task, departments)) return false;
  if (!stageApplicabilityConditionsMet(stage, task, enhancedTasksData)) return false;
  if (isStageOptionalForTask(stage, task, departments) && !hasStageData(task, stage.id)) return false;
  return true;
};

const findFirstApplicableStage = (sortedStages: any[], task: any, departments: any[], enhancedTasksData: Map<string, any> = new Map()): any => {
  return sortedStages.find(stage => isStageEligibleAsCurrent(stage, task, departments, enhancedTasksData)) || null;
};

const findNextApplicableStage = (currentStage: any, remainingStages: any[], task: any, departments: any[], enhancedTasksData: Map<string, any> = new Map()): any => {
  return remainingStages.find(stage => isStageEligibleAsCurrent(stage, task, departments, enhancedTasksData)) || null;
};

const isStageApplicableToTask = (stage: any, task: any, departments: any[]): boolean => {
  if (!task || !departments.length) return true;
  const dept = departments.find(d => d.id === (task.department?.id || task.department_id));
  if (!dept) return true;
  const subdept = dept.tm_subdepartments?.find((s: any) => s.id === (task.subdepartment?.id || task.subdepartment_id));
  if (subdept) {
    const subdeptStage = subdept.stages?.find((s: any) => s.stage_id === stage.id);
    if (subdeptStage?.applicable === false) return false;
    if (task.class_id) {
      const cls = subdept.classes?.find((c: any) => c.id.toString() === task.class_id.toString());
      if (cls?.stages?.some((s: any) => s.stage_id === stage.id && s.applicable === false)) return false;
    }
  }
  const deptStage = dept.stages?.find((s: any) => s.stage_id === stage.id);
  return deptStage?.applicable !== false;
};

const StatusBadge = ({ status, type }: { status: string; type: string }) => {
  const getColor = () => {
    switch (type) {
      case 'active': return 'bg-green-800';
      case 'expiring_soon': return 'bg-blue-800';
      case 'expired': return 'bg-red-800';
      default: return 'bg-slate-600';
    }
  };
  return <Badge className={`whitespace-normal text-sm text-white ${getColor()}`}>{status}</Badge>;
};

const ExpandButton = ({ isExpanded, onClick, className = '' }: { isExpanded: boolean; onClick: () => void; className?: string; }) => (
  <Button variant="ghost" size="icon" className={`h-5 w-5 p-0 text-white hover:text-white ${className}`} onClick={onClick}>
    {isExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
  </Button>
);

export const renderImmigrationStatusCell = (
  task: any,
  getEnhancedStatus: (task: any) => StatusInfo,
  expandedStatuses: Set<string>,
  toggleExpansion: (id: string) => void
) => {
  const statusInfo = getEnhancedStatus(task);
  const isExpanded = task?.id ? expandedStatuses.has(task.id.toString()) : false;

  if (statusInfo.type === 'na') return <StatusBadge status={statusInfo.status} type={statusInfo.type} />;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <StatusBadge status={statusInfo.status} type={statusInfo.type} />
        {task?.id && <ExpandButton isExpanded={isExpanded} onClick={(e) => { e.stopPropagation(); toggleExpansion(task.id.toString()); }} />}
      </div>
      {isExpanded && (
        <div className="space-y-1 p-2 bg-slate-50 rounded border text-sm text-left">
          <div className="flex justify-between">
            <span className="font-medium">Document Type:</span><span>{statusInfo.documentType || 'Unknown'}</span>
          </div>
          {statusInfo.date && (
            <div className="flex justify-between">
              <span className="font-medium">Expiry Date:</span><span>{format(statusInfo.date, 'dd MMM yyyy')}</span>
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
              <span className="text-red-600 font-semibold">{Math.abs(statusInfo.daysRemaining || 0)} days</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const renderCurrentStageStatusCell = (task: any, getStageStatus: (task: any) => StageStatusInfo) => {
  const { stageStatus } = getStageStatus(task);
  return <span className={`whitespace-normal`}>{stageStatus}</span>;
};

export const getCellContent = (
  departments: any[],
  task: any,
  headerId: string,
  enhancedTasksData: Map<string, any>,
  taskDependants: Map<string, any[]>,
  expandedDependants: Set<string>,
  companies: Map<number, any>,
  getTaskHierarchy: (task: any) => any,
  getStaffName: (id: string) => string,
  getEnhancedStatus: (task: any) => StatusInfo,
  getStageStatus: (task: any) => StageStatusInfo,
  renderStatusCell: (task: any) => React.ReactNode,
  renderStageStatusCell: (task: any) => React.ReactNode,
  toggleDependants: (id: string) => void,
  setLinkingTask: (task: any) => void,
  setIsLinkDialogOpen: (open: boolean) => void,
  onCancelTask?: (task: any, reason: string) => void,
  setTaskToCancel?: (task: any) => void,
  setCancelDialogOpen?: (open: boolean) => void,
  onUncancelTask?: (task: any) => void,
  setTaskToUncancel?: (task: any) => void,
  setUncancelDialogOpen?: (open: boolean) => void,
  officers?: any[],
  stages?: any[],
  onEditOfficers?: (task: any) => void
) => {
  const enhancedTask = task?.id ? enhancedTasksData.get(task.id.toString()) || task : task;
  const taskDeps = task?.id ? taskDependants.get(task.id.toString()) || [] : [];
  const isExpanded = task?.id ? expandedDependants.has(task.id.toString()) : false;

  const simpleCellMap: Record<string, any> = {
    id: task.id,
    immigration_document_type: formatImmigrationDocumentType(task, getEnhancedStatus),
    immigration_expiry_date: formatImmigrationExpiryDate(task, getEnhancedStatus),
    immigration_days_to_go: formatImmigrationDaysToGo(task, getEnhancedStatus),
    current_stage_name: getStageStatus(task).stageName || 'N/A',
    current_stage_follow_up: getCurrentStageFollowUp(task, getStageStatus),
    company_name: getCompanyNameFromParticipants(task, companies),
    company_prefix: getCompanyPrefixFromParticipants(task, companies),
    sub_department: getSubDepartmentDisplay(task, departments),
    job_level: getJobLevelDisplay(task, departments),
    job_description: task.job_description || 'N/A',
    renewal_status: enhancedTask.renewal_status || task.renewal_status || 'New',
    passport_number: enhancedTask.passport_number || task.passport_number || 'N/A',
    duration: enhancedTask.duration || task.duration || 'N/A',
    nationality: enhancedTask.nationality || 'N/A',
    full_name: enhancedTask.full_name || 'N/A',
    age: enhancedTask.age?.toString() || 'N/A',
    r_number: enhancedTask.r_number?.toString() || 'N/A',
    task_manager: getStaffFromParticipants(task, 'task_manager', getStaffName, departments, officers) || <span className="text-red-500 font-semibold">Unallocated</span>,
    task_assistant: getStaffFromParticipants(task, 'task_assistant', getStaffName, departments, officers) || <span className="text-red-500 font-semibold">Unallocated</span>,
    cancellation_reason: task.cancellation_details?.reason || 'N/A',
    cancellation_date: task.cancellation_details?.cancelled_at ? format(new Date(task.cancellation_details.cancelled_at), 'dd MMM yyyy HH:mm') : 'N/A',
    cancelled_by: task.participants_details?.cancelled_by || 'N/A',
    // officer is intentionally NOT in simpleCellMap — handled in complexCellMap using stages JSON
  };

  if (headerId in simpleCellMap) return simpleCellMap[headerId];

  const complexCellMap: Record<string, React.ReactNode> = {
    applicant_name: (
      <div className="flex items-center justify-between gap-1 w-[300px]">
        <div className="flex-grow min-w-0">
          <Link
            href={`/dashboard/tasks/${task.id}`}
            className="font-medium truncate block hover:text-custom-blue hover:underline transition-colors cursor-pointer"
            title={`Open workspace for ${task.applicant_name || 'N/A'}`}
          >
            {task.applicant_name || 'N/A'}
          </Link>
        </div>
        <div className="flex gap-1 shrink-0">
          <Link
            href={`/dashboard/tasks/${task.id}`}
            className="h-6 w-6 rounded flex items-center justify-center hover:bg-blue-50 text-slate-400 hover:text-custom-blue transition-colors"
            title="Open job workspace"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          {taskDeps.length > 0 && (
            <ExpandButton isExpanded={isExpanded} onClick={() => toggleDependants(task.id.toString())} className="text-white hover:bg-green-100 flex-shrink-0" />
          )}
        </div>
      </div>
    ),
    actions: (
      <div className="flex gap-1 justify-center">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-blue-100 flex-shrink-0" title="Link source documents" onClick={() => { setLinkingTask(task); setIsLinkDialogOpen(true); }}>
          <LinkIcon className="h-4 w-4" />
        </Button>
        {onEditOfficers && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-purple-100 flex-shrink-0" title="Assign officers" onClick={(e) => { e.stopPropagation(); onEditOfficers(task); }}>
            <UserPlus className="h-4 w-4" />
          </Button>
        )}
        {task.status === 'cancel' ? (
          onUncancelTask && setTaskToUncancel && setUncancelDialogOpen && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-green-100 flex-shrink-0" title="Reactivate task" onClick={(e) => { e.stopPropagation(); setTaskToUncancel(task); setUncancelDialogOpen(true); }}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )
        ) : (
          onCancelTask && setTaskToCancel && setCancelDialogOpen && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-orange-100 flex-shrink-0" title="Cancel task" onClick={(e) => { e.stopPropagation(); setTaskToCancel(task); setCancelDialogOpen(true); }}>
              <X className="h-4 w-4" />
            </Button>
          )
        )}
      </div>
    ),
    officer: (stages ? getOfficersForCurrentStage(task, stages, getStaffName) : null) || getStaffFromParticipants(task, 'officer', getStaffName, departments, officers) || 'Unallocated',
    // immigration_status: renderStatusCell(task),
    current_stage_status_value: renderStageStatusCell(task),
  };

  if (headerId in complexCellMap) return complexCellMap[headerId];
  return task[headerId] || 'N/A';
};

export const getRawCellValue = (
  departments: any[],
  task: any,
  headerId: string,
  enhancedTasksData: Map<string, any>,
  companies: Map<number, any>,
  getStaffName: (id: string) => string,
  getEnhancedStatus: (task: any) => StatusInfo,
  getStageStatus: (task: any) => StageStatusInfo,
  officers?: any[]
): string => {
  const enhancedTask = task?.id ? enhancedTasksData.get(task.id.toString()) || task : task;

  const valueMap: Record<string, string> = {
    id: task.id?.toString() || '',
    applicant_name: task.applicant_name || 'N/A',
    immigration_document_type: formatImmigrationDocumentType(task, getEnhancedStatus),
    immigration_expiry_date: formatImmigrationExpiryDate(task, getEnhancedStatus),
    immigration_days_to_go: getRawImmigrationDaysToGo(task, getEnhancedStatus),
    // immigration_status: getEnhancedStatus(task).status,
    current_stage_name: getStageStatus(task).stageName || 'N/A',
    current_stage_status_value: getStageStatus(task).stageStatus || 'N/A',
    current_stage_follow_up: getCurrentStageFollowUp(task, getStageStatus),
    company_name: getCompanyNameFromParticipants(task, companies),
    company_prefix: getCompanyPrefixFromParticipants(task, companies),
    sub_department: getSubDepartmentDisplay(task, departments),
    job_level: getJobLevelDisplay(task, departments),
    job_description: task.job_description || 'N/A',
    renewal_status: enhancedTask.renewal_status || task.renewal_status || 'New',
    passport_number: enhancedTask.passport_number || task.passport_number || 'N/A',
    duration: enhancedTask.duration || task.duration || 'N/A',
    nationality: enhancedTask.nationality || 'N/A',
    full_name: enhancedTask.full_name || 'N/A',
    age: enhancedTask.age?.toString() || 'N/A',
    r_number: enhancedTask.r_number?.toString() || 'N/A',
    task_manager: getStaffFromParticipants(task, 'task_manager', getStaffName, departments, officers) || 'N/A',
    officer: getStaffFromParticipants(task, 'officer', getStaffName, departments, officers) || 'N/A',
    task_assistant: getStaffFromParticipants(task, 'task_assistant', getStaffName, departments, officers) || 'N/A',
    cancellation_reason: task.cancellation_details?.reason || 'N/A',
    cancellation_date: task.cancellation_details?.cancelled_at ? format(new Date(task.cancellation_details.cancelled_at), 'dd MMM yyyy HH:mm') : 'N/A',
    cancelled_by: task.participants_details?.cancelled_by || 'N/A'
  };

  return valueMap[headerId] || task[headerId]?.toString() || 'N/A';
};

export const STAGE_PRIORITY: Record<string, number> = {
  pending: 0,
  new: 0,
  enquiry: 0,
  in_progress: 1,
  write_up_completed: 2,
  endorsed: 3,
  skipped: -1,
};

export const sortTasks = (
  tasks: any[],
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null,
  companies: Map<number, any>,
  getCustomSortValue?: (task: any, key: string) => string | number | null
): any[] => {
  if (!sortConfig) return [...tasks];

  return [...tasks].sort((a, b) => {
    const getSortValue = (task: any, key: string) => {
      if (getCustomSortValue) {
        const custom = getCustomSortValue(task, key);
        if (custom !== null && custom !== undefined) return custom;
      }
      switch (key) {
        case 'applicant_name': return task.applicant_name?.toLowerCase() || '';
        case 'company_name': {
          const e = companies.get(task.company_id);
          return (typeof e === 'object' ? e?.name : e)?.toLowerCase() || '';
        }
        case 'status': return task.status?.toLowerCase() || '';
        default: return task[key]?.toString().toLowerCase() || '';
      }
    };

    const valueA = getSortValue(a, sortConfig.key);
    const valueB = getSortValue(b, sortConfig.key);

    if (valueA === valueB) return 0;
    if (!valueA && valueA !== 0) return 1;
    if (!valueB && valueB !== 0) return -1;

    const comparison = typeof valueA === 'number' && typeof valueB === 'number'
      ? valueA - valueB
      : String(valueA).localeCompare(String(valueB));
    return sortConfig.direction === 'asc' ? comparison : -comparison;
  });
};

export const filterTasksBySearch = (
  tasks: any[],
  searchTerm: string,
  enhancedTasksData: Map<string, any>,
  taskDependants: Map<string, any[]>,
  companies: Map<number, any>,
  getTaskHierarchy: (task: any) => any,
  getUserDisplayName: (id: string) => string
) => {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return tasks;

  return tasks.filter(task => {
    const enhancedTask = enhancedTasksData.get(task.id.toString()) || task;
    const hierarchy = getTaskHierarchy(task);

    const searchFields = [
      task.id?.toString(),
      task.applicant_name,
      task.job_description,
      task.status,
      task.renewal_status,
      enhancedTask.nationality,
      enhancedTask.age?.toString(),
      enhancedTask.r_number?.toString(),
      (() => { const e = companies.get(task.company_id); return typeof e === 'object' ? e?.name : e; })(),
      hierarchy?.department?.name,
      hierarchy?.subdepartment?.name,
      hierarchy?.class?.name,
      hierarchy?.subclass?.name,
      getUserDisplayName(task.task_manager_id),
      getUserDisplayName(task.officer_id),
      getUserDisplayName(task.task_assistant_id)
    ].filter(Boolean).join(' ').toLowerCase();

    if (searchFields.includes(term)) return true;

    const dependants = taskDependants.get(task.id.toString()) || [];
    if (dependants.length > 0) {
      const dependantText = dependants
        .map(dep => [dep.full_name, dep.nationality, dep.age, dep.r_number, dep.relationship].filter(Boolean).join(' '))
        .join(' ').toLowerCase();
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