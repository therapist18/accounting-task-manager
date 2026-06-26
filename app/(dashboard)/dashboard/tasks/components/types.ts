export interface Stage {
  id: string;
  name: string;
  order_num: number;
  documents: Array<{
    id: string;
    name: string;
    kycId: string;
    inputType: string;
    isRequired: boolean;
    documentType: string;
    extractionSpecs?: Array<{
      id: string;
      fieldName: string;
      fieldType: string;
      isRequired: boolean;
      description?: string;
    }>;
  }>;
  follow_up: string;
  isSpecial: boolean;
  allocations: Record<string, any>;
  timeConfigs: Array<{
    days: number;
    hours: number;
    minutes: number;
    applicationType: string;
  }>;
  estimated_time: number;
  description?: string;
}

export interface Task {
  id: number;
  job_description: string;
  status: string;
  department_id: number;
  subdepartment_id: number;
  task_manager_id: number | null;
  task_assistant_id: number | null;
  date_initiated: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  account_used: string | null;
  batch: string | null;
  applied_by: string | null;
  applicant_type: string;
  class_id: string;
  subclass_id: string | null;
  applicant_name: string;
  officer_id: number | null;
  r_number: string | null;
  principal_member_name: string | null;
  renewal_status: string | null;
  individual_id: number;
  stages: Record<string, {
    date: string;
    status: string;
    completedAt: string;
  }>;
  selections: any;
  company_id: number;
  principal_member: number;
  dependant_member: Array<{
    id: number;
    name: string;
    relationship: string;
  }>;
  understudy: number | null;
  references: any[];
  department: {
    id: number;
    name: string;
  };
  subdepartment: {
    id: number;
    name: string;
  };
  current_stage: Stage | null;
}

export interface DepartmentTasksManagerProps {
  error?: string | null
  onTaskAction?: (action: string, task: Task) => void
  onStageDocumentUpload?: (task: Task, stage: Stage) => void
  onViewStageDocument?: (task: Task, stage: Stage, stageDoc: any, document: any) => void
  onShowUploadDialog?: (task: Task) => void
  applicantDocuments?: Record<number, any[]>
  getTaskStageStatus?: (taskId: string, stageId: string) => any
  handleStageStatusSave?: (stageId: string, taskId: string, date: string) => Promise<any>
  onTaskUpdate?: (updatedTask: Task) => void
  getCurrentRequirements?: () => any[]
  allDocuments?: any[];
  initialSearchTerm?: string;
  initialDeptId?: string;
  initialSubDeptId?: string;
}