// @ts-nocheck
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"

// Types
export interface Task {
  id: number;
  applicant_name: string;
  company_name: string;
  company_id: number;
  department_id: number;
  subdepartment_id: number;
  class_id?: string;
  subclass_id?: string;
  status: string;
  renewal_status?: string;
  nationality?: string;
  age?: number;
  individual_id: number;
  created_at: string;
  job_description?: string;
  job_level?: {
    level: number;
    class_id: string;
    subclass_id: string | null;
    department_id: number;
    subdepartment_id: number;
  };
  officer?: any;
  officer_name?: string;
  officer_ids?: string[];
  officer_id?: string;
  task_manager?: any;
  task_manager_name?: string;
  assigned_to_name?: string;
  dependant_member?: any[];
  dependnats_members?: any[];
  stages?: Record<string, any>;
  department?: any;
  subdepartment?: any;
  current_stage?: any;
  requirements?: any[];
  referenceDocuments?: Record<string, any[]>;
  report_doc_defaults?: any[];
}

export interface Department {
  id: number;
  name: string;
  stages: any[];
  tm_subdepartments?: any[];
}

export interface KycDocument {
  id: string;
  name: string;
  display_name?: string;
  fields: any[];
}

export interface DirectorDocument {
  id: number;
  director_id: number;
  document_id: string;
  file_path: string;
  extracted_details?: any;
  indicator?: boolean;
  created_at: string;
}

// Recursive helper to transform KYC fields, handling nested arrays
const transformKycFields = (fields: any[]): any[] => {
  if (!Array.isArray(fields)) return []

  return fields.map((field: any) => {
    const isArray = field.type === 'array' || field.isArray === true

    const transformedField: any = {
      id: field.id || field.fieldName || '',
      fieldName: field.name || field.fieldName || '',
      description: field.description || '',
      isRequired: field.isRequired !== false,
      fieldType: isArray ? 'array' : (field.type || field.fieldType || 'text'),
      parentField: field.parentField,
      isArray: isArray,
      isEffectiveTo: field.isEffectiveTo,
      isEffectiveFrom: field.isEffectiveFrom,
      isImmigrationDate: field.isImmigrationDate === true,
    }

    if (isArray && field.arrayConfig && Array.isArray(field.arrayConfig.fields)) {
      transformedField.arrayConfig = {
        maxItems: field.arrayConfig.maxItems,
        fields: transformKycFields(field.arrayConfig.fields)
      }
    }

    return transformedField
  })
}

/**
 * Fetch all companies from the database
 */
export const fetchCompanies = async (): Promise<Map<number, { name: string; prefix: string }>> => {
  try {
    const { data, error } = await supabase
      .from('acc_portal_company_duplicate')
      .select('id, company_name, company_prefix')

    if (error) throw error

    const companyMap = new Map(data?.map(c => [c.id, { name: c.company_name || '', prefix: c.company_prefix || '' }]) || [])
    return companyMap
  } catch (error) {
    console.error('Error fetching companies:', error)
    toast({
      title: "Error",
      description: "Failed to load company data.",
      variant: "destructive"
    })
    return new Map()
  }
}

/**
 * Fetch tasks with related data
 */
export const fetchTasks = async (departmentId?: string, subdepartmentId?: string, companies?: Map<number, string>): Promise<Task[]> => {
  try {
    let query = supabase
      .from('tm_tasks')
      .select('*')
      .order('id', { ascending: false });

    if (departmentId) {
      // Convert to number and filter using job_level->>department_id
      const deptId = parseInt(departmentId, 10);
      if (!isNaN(deptId)) {
        query = query.eq('job_level->>department_id', deptId);
      }
    }

    if (subdepartmentId) {
      // Convert to number and filter using job_level->>subdepartment_id
      const subdeptId = parseInt(subdepartmentId, 10);
      if (!isNaN(subdeptId)) {
        query = query.eq('job_level->>subdepartment_id', subdeptId);
      }
    }

    const { data, error } = await query;

    if (error) throw error;

    // Fetch all requirements from tm_class_requirements
    const { data: requirementsData, error: requirementsError } = await supabase
      .from('tm_class_requirements')
      .select('*');

    if (requirementsError) {
      console.error('Error fetching requirements:', requirementsError);
    }

    // Process the data to ensure consistent structure
    const processedTasks = (data || []).map(task => {
      const jobLevel = task.job_level || {};
      const officer = task.participants_details?.find((p: any) => p.role?.includes('officer'));
      const taskManager = task.participants_details?.find((p: any) => p.role?.includes('task_manager'));
      const company = task.participants_details?.find((p: any) => p.role?.includes('sponsor') || p.role?.includes('company'));

      // Find matching requirements based on job_level with inheritance support
      // Collect all requirements that match at any level of the hierarchy
      const matchingRequirements = requirementsData?.filter((req: any) => {
        const reqJobLevel = req.job_level || {};

        // Exact match (most specific)
        if (String(reqJobLevel.department_id) === String(jobLevel.department_id) &&
          String(reqJobLevel.subdepartment_id) === String(jobLevel.subdepartment_id) &&
          String(reqJobLevel.class_id || 'null') === String(jobLevel.class_id || 'null') &&
          String(reqJobLevel.subclass_id || 'null') === String(jobLevel.subclass_id || 'null')) {
          return true;
        }

        // Match at class level (if task has subclass but requirement is at class level)
        if (jobLevel.subclass_id && !reqJobLevel.subclass_id &&
          String(reqJobLevel.department_id) === String(jobLevel.department_id) &&
          String(reqJobLevel.subdepartment_id) === String(jobLevel.subdepartment_id) &&
          String(reqJobLevel.class_id || 'null') === String(jobLevel.class_id || 'null')) {
          return true;
        }

        // Match at subdepartment level (if task has class but requirement is at subdepartment level)
        if (jobLevel.class_id && !reqJobLevel.class_id &&
          String(reqJobLevel.department_id) === String(jobLevel.department_id) &&
          String(reqJobLevel.subdepartment_id) === String(jobLevel.subdepartment_id)) {
          return true;
        }

        // Match at department level (if task has subdepartment but requirement is at department level)
        if (jobLevel.subdepartment_id && !reqJobLevel.subdepartment_id &&
          String(reqJobLevel.department_id) === String(jobLevel.department_id)) {
          return true;
        }

        return false;
      });

      // Merge all requirements from matching levels, with inheritance for reference requirements
      const allRequirements: any[] = [];
      matchingRequirements?.forEach((req: any) => {
        if (req.requirements) {
          allRequirements.push(...req.requirements);
        }
      });

      // For reference requirements, also collect from parent levels and deduplicate
      const referenceRequirements: any[] = [];
      matchingRequirements?.forEach((req: any) => {
        if (req.requirements) {
          req.requirements.forEach((r: any) => {
            if (r.category === 'reference') {
              referenceRequirements.push(r);
            }
          });
        }
      });

      // Merge reference requirements (deduplicate by id)
      const mergedReferenceRequirements = referenceRequirements.filter((req, index, self) =>
        index === self.findIndex(r => r.id === req.id)
      );

      // Remove reference requirements from allRequirements and add merged ones
      const nonReferenceRequirements = allRequirements.filter((r: any) => r.category !== 'reference');
      const finalRequirements = [...nonReferenceRequirements, ...mergedReferenceRequirements];

      const taskRequirements = {
        requirements: finalRequirements
      };

      // Find the single best matching requirements record to get its report_doc_defaults
      let bestMatch = null;
      if (jobLevel.subclass_id) {
        bestMatch = matchingRequirements?.find((r: any) => r.job_level?.subclass_id === jobLevel.subclass_id);
      }
      if (!bestMatch && jobLevel.class_id) {
        bestMatch = matchingRequirements?.find((r: any) => r.job_level?.class_id === jobLevel.class_id && !r.job_level?.subclass_id);
      }
      if (!bestMatch && jobLevel.subdepartment_id) {
        bestMatch = matchingRequirements?.find((r: any) => r.job_level?.subdepartment_id === jobLevel.subdepartment_id && !r.job_level?.class_id);
      }
      if (!bestMatch && jobLevel.department_id) {
        bestMatch = matchingRequirements?.find((r: any) => r.job_level?.department_id === jobLevel.department_id && !r.job_level?.subdepartment_id);
      }
      const reportDocDefaults = bestMatch?.report_doc_defaults || [];

      const processedTask: Task = {
        ...task,
        applicant_name: task.applicant_details?.name || task.applicant_name || '',
        company_name: company?.name || (company?.id && companies ? companies.get(Number(company.id)) : '') || '',
        department_id: jobLevel.department_id,
        subdepartment_id: jobLevel.subdepartment_id,
        class_id: jobLevel.class_id,
        subclass_id: jobLevel.subclass_id,
        job_level: {
          level: jobLevel.level || 0,
          class_id: jobLevel.class_id || '',
          subclass_id: jobLevel.subclass_id || null,
          department_id: jobLevel.department_id,
          subdepartment_id: jobLevel.subdepartment_id
        },
        officer: officer ? {
          id: officer.id,
          name: officer.name,
          email: officer.email || '',
          phone: officer.phone || ''
        } : undefined,
        task_manager: taskManager ? {
          id: taskManager.id,
          name: taskManager.name,
          email: taskManager.email || '',
          phone: taskManager.phone || ''
        } : undefined,
        requirements: taskRequirements?.requirements || [],
        report_doc_defaults: reportDocDefaults,
        referenceDocuments: {}
      };
      return processedTask;
    });

    // Fetch reference documents for tasks with reference requirements
    // Optimize by grouping fetches by sourceTable and linkingVariable
    const fetchGroups = new Map<string, { sourceTable: string, linkingVariable: string, linkingValues: any[], tasks: any[] }>();

    processedTasks.forEach(task => {
      const referenceRequirements = task.requirements?.filter((req: any) => req.category === 'reference') || [];
      if (referenceRequirements.length === 0) return;

      referenceRequirements.forEach(req => {
        if (!req.sourceTable || !req.linkingVariable) return;

        const linkingValue = task[req.linkingVariable] || (req.linkingVariable === 'director_id' ? task.individual_id : undefined);
        if (!linkingValue) return;

        const groupKey = `${req.sourceTable}|${req.linkingVariable}`;
        if (!fetchGroups.has(groupKey)) {
          fetchGroups.set(groupKey, {
            sourceTable: req.sourceTable,
            linkingVariable: req.linkingVariable,
            linkingValues: [],
            tasks: []
          });
        }
        const group = fetchGroups.get(groupKey)!;
        if (!group.linkingValues.includes(linkingValue)) {
          group.linkingValues.push(linkingValue);
        }
        group.tasks.push({ task, req, linkingValue });
      });
    });

    // Batch fetch all documents for each group
    const fetchPromises = Array.from(fetchGroups.values()).map(async (group) => {
      try {
        const { data, error } = await supabase
          .from(group.sourceTable)
          .select('*')
          .in(group.linkingVariable, group.linkingValues);

        if (error) throw error;
        return { group, data: data || [] };
      } catch (error) {
        console.error(`Error fetching reference documents for ${group.sourceTable}:`, error);
        return { group, data: [] };
      }
    });

    const fetchResults = await Promise.all(fetchPromises);

    // Create a map of (sourceTable + linkingVariable + linkingValue) -> documents
    const docsMap = new Map<string, any[]>();
    fetchResults.forEach(({ group, data }) => {
      group.linkingValues.forEach(linkingValue => {
        const key = `${group.sourceTable}|${group.linkingVariable}|${linkingValue}`;
        docsMap.set(key, data.filter((doc: any) => doc[group.linkingVariable] === linkingValue));
      });
    });

    // Match documents back to tasks
    const tasksWithRefDocs = processedTasks.map(task => {
      const referenceRequirements = task.requirements?.filter((req: any) => req.category === 'reference') || [];
      if (referenceRequirements.length === 0) return task;

      const referenceDocs: Record<string, any[]> = {};

      referenceRequirements.forEach(req => {
        if (!req.sourceTable || !req.linkingVariable) return;

        const linkingValue = task[req.linkingVariable] || (req.linkingVariable === 'director_id' ? task.individual_id : undefined);
        if (!linkingValue) return;

        const key = `${req.sourceTable}|${req.linkingVariable}|${linkingValue}`;
        const documents = docsMap.get(key) || [];

        // Filter by document_ids if specified in the requirement
        const filteredData = req.document_ids && req.document_ids.length > 0
          ? documents.filter((doc: any) => req.document_ids.includes(doc.document_id))
          : documents;

        referenceDocs[req.id || req.name] = filteredData;
      });

      return { ...task, referenceDocuments: referenceDocs };
    });

    return tasksWithRefDocs;
  } catch (error) {
    console.error('Error fetching tasks:', error);
    toast({
      title: "Error",
      description: "Failed to load tasks.",
      variant: "destructive"
    });
    return [];
  }
};

/**
 * Fetch and process stages for a department
 */
export const fetchStages = async (departmentId: string, departments: Department[]): Promise<any[]> => {
  try {
    const department = departments.find(d => d.id.toString() === departmentId.toString())
    if (!department) {
      console.warn(`Department with id ${departmentId} not found`)
      return []
    }

    const stages = department.stages || [];
    const uniqueStages = new Map();

    stages.forEach(stage => {
      if (!uniqueStages.has(stage.id)) {
        uniqueStages.set(stage.id, {
          ...stage,
          departmentId: department.id,
          departmentName: department.name
        })
      }
    })

    const allStages = Array.from(uniqueStages.values())
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0))

    return allStages
  } catch (error) {
    console.error('Error fetching stages:', error)
    toast({
      title: "Error",
      description: "Failed to load stages.",
      variant: "destructive"
    })
    return []
  }
}

/**
 * Stage IDs that gate the Processing/Issuance Requirements sections in the
 * tasks-requirements module. When one of these stages is marked completed,
 * the documents currently satisfying the matching requirement category get
 * snapshotted onto tm_tasks for audit purposes and the section locks.
 */
export const REQUIREMENTS_LOCK_STAGE_IDS = {
  PROCESSING: '30cf2d19-2138-4b8a-a4ec-307ce624ade3', // Pro. Upload Screenshot
  ISSUANCE: '76a954ea-f579-427c-b080-2348b778ab20',   // Issuance Upload Screenshot
  DEFERRED: 'cd1fac36-30f8-42e5-9d86-585427817ded',   // Deferred (Depends)
} as const;

// Resolve the (entityType, entityId) pairs present on a task, mirroring the
// column/relationship resolution used by RequirementsTableCombined.
const resolveTaskEntities = (task: any): Array<{ entityType: string; entityId: number }> => {
  const entities: Array<{ entityType: string; entityId: number }> = [];
  const seen = new Set<string>();
  const add = (entityType: string, entityId: any) => {
    if (!entityId) return;
    const key = `${entityType}:${entityId}`;
    if (seen.has(key)) return;
    seen.add(key);
    entities.push({ entityType, entityId: Number(entityId) });
  };

  const participants = task.participants_details || [];
  const applicant = task.applicant_details || {};

  if (applicant.type === 'company') add('company', applicant.id);
  if (task.company_id) add('company', task.company_id);

  if (applicant.type === 'individual' && applicant.id) {
    const roles = Array.isArray(applicant.role) ? applicant.role : (applicant.role ? [applicant.role] : []);
    if (roles.includes('dependant') || roles.includes('dependent')) add('dependant', applicant.id);
    else if (roles.includes('director') || roles.includes('shareholder')) add('director', applicant.id);
    else if (roles.includes('understudy')) add('understudy', applicant.id);
    else add('principal', applicant.id);
  }
  if (task.individual_id) add('principal', task.individual_id);

  participants.forEach((p: any) => {
    if (p.type !== 'individual' || !p.id) return;
    const roles = Array.isArray(p.role) ? p.role : (p.role ? [p.role] : []);
    if (roles.includes('director') || roles.includes('shareholder')) add('director', p.id);
    if (roles.includes('dependant') || roles.includes('dependent')) add('dependant', p.id);
    if (roles.includes('understudy')) add('understudy', p.id);
    if (roles.includes('sponsor')) add('sponsor', p.id);
    if (roles.includes('principal') || roles.includes('applicant')) add('principal', p.id);
  });

  if (task.understudy) add('understudy', task.understudy);

  return entities;
};

/**
 * Snapshot the documents currently satisfying a task's Processing (or
 * Issuance) requirements onto tm_tasks, for audit purposes and so the
 * Report Documents section can render the exact documents that were locked
 * in rather than whatever is "latest" at render time.
 */
export const captureRequirementsDocumentsSnapshot = async (task: any, stageId: string): Promise<void> => {
  const normalizedStageId = (stageId || '').toLowerCase();
  const category = normalizedStageId === REQUIREMENTS_LOCK_STAGE_IDS.PROCESSING
    ? 'processing'
    : normalizedStageId === REQUIREMENTS_LOCK_STAGE_IDS.ISSUANCE
      ? 'issuance'
      : null;
  if (!category) return;

  const requirements = (task.requirements || []).filter((r: any) => (r.category || '').toLowerCase() === category);
  if (requirements.length === 0) return;

  const entities = resolveTaskEntities(task);
  const companyEntities = entities.filter(e => e.entityType === 'company');
  const individualEntities = entities.filter(e => e.entityType !== 'company');
  const companyIds = companyEntities.map(e => e.entityId);
  const individualIds = individualEntities.map(e => e.entityId);
  const docTypeIds = Array.from(new Set(requirements.flatMap((r: any) => r.document_ids || (r.document_id ? [r.document_id] : []))));
  if (docTypeIds.length === 0) return;

  try {
    const [companyDocsRes, individualDocsRes] = await Promise.all([
      companyIds.length
        ? supabase.from('acc_portal_kyc_uploads').select('*').in('company_id', companyIds).in('document_id', docTypeIds)
        : Promise.resolve({ data: [] as any[] }),
      individualIds.length
        ? supabase.from('acc_portal_directors_documents').select('*').in('director_id', individualIds).in('document_id', docTypeIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const companyDocs = companyDocsRes.data || [];
    const individualDocs = individualDocsRes.data || [];
    const timestamp = new Date().toISOString();
    const snapshot: any[] = [];

    requirements.forEach((req: any) => {
      const docIds: string[] = req.document_ids || (req.document_id ? [req.document_id] : []);
      if (docIds.length === 0) return;
      const allowedEntityTypes = req.entityTypes || (req.applicantType ? [req.applicantType] : []);

      entities
        .filter(e => allowedEntityTypes.length === 0 || allowedEntityTypes.includes(e.entityType))
        .forEach(entity => {
          const isCompany = entity.entityType === 'company';
          const pool = isCompany ? companyDocs : individualDocs;
          const idField = isCompany ? 'company_id' : 'director_id';
          const matches = pool.filter((d: any) => d[idField] === entity.entityId && docIds.includes(d.document_id));
          if (matches.length === 0) return;

          const matchesByDocType = new Map<string, any[]>();
          matches.forEach((d: any) => {
            if (!matchesByDocType.has(d.document_id)) matchesByDocType.set(d.document_id, []);
            matchesByDocType.get(d.document_id)!.push(d);
          });

          matchesByDocType.forEach((docs, documentTypeId) => {
            snapshot.push({
              requirementId: req.id,
              documentTypeId,
              entityType: entity.entityType,
              entityId: entity.entityId,
              sourceTable: isCompany ? 'acc_portal_kyc_uploads' : 'acc_portal_directors_documents',
              documentRecordIds: docs.map((d: any) => d.id),
              capturedAt: timestamp,
            });
          });
        });
    });

    const column = category === 'processing' ? 'processing_requirements_documents' : 'issuance_requirements_documents';
    const { error } = await supabase.from('tm_tasks').update({ [column]: snapshot }).eq('id', task.id);
    if (error) throw error;
  } catch (error) {
    console.error(`Error capturing ${category} requirements documents snapshot:`, error);
  }
};

/**
 * Fetch all documents from the database
 */
export const fetchAllDocuments = async (): Promise<DirectorDocument[]> => {
  try {
    const { data, error } = await supabase
      .from('acc_portal_directors_documents')
      .select('*')
      .order('director_id', { ascending: true })

    if (error) throw error

    return data || []
  } catch (error) {
    console.error('Error fetching documents:', error)
    toast({
      title: "Error",
      description: "Failed to load documents data.",
      variant: "destructive"
    })
    return []
  }
}

/**
 * Fetch all KYC fields for all document types
 */
export const fetchAllKycFields = async (): Promise<{
  fieldsMap: Record<string, any[]>;
  kycDocsMap: Map<string, KycDocument>;
}> => {
  try {
    console.log('Fetching all KYC fields...')
    const { data, error } = await supabase
      .from('acc_portal_kyc')
      .select('id, fields, name, display_name')
      .order('display_name', { ascending: true })

    if (error) throw error

    const fieldsMap: Record<string, any[]> = {}
    const kycDocsMap = new Map<string, KycDocument>()

    // Transform and store fields by kycId and cache KYC documents
    data?.forEach(doc => {
      if (doc.id && doc.fields) {
        fieldsMap[doc.id] = transformKycFields(doc.fields)
        kycDocsMap.set(doc.id, {
          id: doc.id,
          name: doc.name,
          display_name: doc.display_name,
          fields: transformKycFields(doc.fields)
        })
      }
    })

    console.log(`Fetched KYC fields for ${Object.keys(fieldsMap).length} document types`)

    return { fieldsMap, kycDocsMap }
  } catch (error) {
    console.error('Error fetching KYC fields:', error)
    toast({
      title: 'Error',
      description: 'Failed to load KYC fields',
      variant: 'destructive',
    })
    return { fieldsMap: {}, kycDocsMap: new Map() }
  }
}

/**
 * Fetch single KYC document by kycId
 */
export const fetchKycDocument = async (kycId: string): Promise<KycDocument | null> => {
  try {
    const { data, error } = await supabase
      .from('acc_portal_kyc')
      .select('id, fields, name, display_name')
      .eq('id', kycId)
      .single()

    if (error) throw error

    return {
      id: data.id,
      name: data.name,
      display_name: data.display_name,
      fields: transformKycFields(data.fields || [])
    }
  } catch (error) {
    console.error('Error fetching KYC document:', error)
    return null
  }
}

/**
 * Helper function to check if document is older than task creation
 */
export const isDocumentOlderThanTask = (documentDate: string, taskDate: string): boolean => {
  try {
    const docDate = new Date(documentDate)
    const tskDate = new Date(taskDate)
    return docDate < tskDate
  } catch (error) {
    console.error('Error comparing dates:', error)
    return false
  }
}

/**
 * Format date to dd/MM/yyyy HH:mm format
 */
export const formatDateValue = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return 'N/A'

  try {
    let date: Date

    if (typeof dateString === 'string') {
      if (/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(dateString)) {
        return dateString
      }
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
        return dateString
      }
      date = new Date(dateString)
    } else {
      date = dateString
    }

    if (isNaN(date.getTime())) return 'Invalid Date'

    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')

    return `${day}/${month}/${year} ${hours}:${minutes}`
  } catch (e) {
    console.error('Error formatting date:', dateString, e)
    return 'Invalid Date'
  }
}

/**
 * Fetch all tasks duplicate data
 */
export const fetchTasksDuplicate = async (): Promise<any[]> => {
  try {
    const { data, error } = await supabase
      .from('tm_tasks')
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      console.error('Error fetching tasks duplicate:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching tasks duplicate:', error);
    throw error;
  }
};

/**
 * Fetch all document workflow logs
 */
export const fetchDocumentWorkflowLogs = async (): Promise<any[]> => {
  try {
    const { data, error } = await supabase
      .from('document_workflow_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching document workflow logs:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching document workflow logs:', error);
    throw error;
  }
};

/**
 * Get document for task and stage
 */
export const getDocumentForTaskStage = (
  task: Task,
  stage: any,
  documents: DirectorDocument[] = []
): DirectorDocument | null => {
  if (!task.individual_id || !stage.documents?.[0]?.kycId) return null

  const relevantDocs = documents.filter(doc =>
    doc.director_id === task.individual_id &&
    doc.document_id === stage.documents[0].kycId
  )

  if (relevantDocs.length === 0) return null

  return relevantDocs[0] // Already sorted by created_at desc
}

/**
 * Fetch all uploaded individual and company documents for a list of tasks
 */
export const fetchUploadedDocumentsForTasks = async (tasks: any[]) => {
  const individualIds = new Set<number>();
  const companyIds = new Set<number>();

  tasks.forEach(task => {
    if (task.individual_id) individualIds.add(task.individual_id);
    if (task.applicant_details?.id && task.applicant_details?.type !== 'company') {
      individualIds.add(task.applicant_details.id);
    }
    if (task.company_id) companyIds.add(task.company_id);
    if (task.applicant_details?.id && task.applicant_details?.type === 'company') {
      companyIds.add(task.applicant_details.id);
    }
    // Also dependants
    const dependants = task.dependants_members || task.dependant_member || [];
    dependants.forEach((d: any) => {
      if (d.id) {
        const numericId = Number(d.id);
        if (!isNaN(numericId)) individualIds.add(numericId);
      }
    });
  });

  const indIdsArr = Array.from(individualIds).filter(id => Boolean(id) && !isNaN(Number(id)));
  const coIdsArr = Array.from(companyIds).filter(id => Boolean(id) && !isNaN(Number(id)));

  const promises = [];
  if (indIdsArr.length > 0) {
    promises.push(
      supabase
        .from('acc_portal_directors_documents')
        .select('*, acc_portal_kyc (id, name, display_name)')
        .in('director_id', indIdsArr)
    );
  } else {
    promises.push(Promise.resolve({ data: [] }));
  }

  if (coIdsArr.length > 0) {
    promises.push(
      supabase
        .from('acc_portal_kyc_uploads')
        .select('*, acc_portal_kyc (id, name, display_name)')
        .in('company_id', coIdsArr)
    );
  } else {
    promises.push(Promise.resolve({ data: [] }));
  }

  const [indRes, coRes] = await Promise.all(promises);

  const individualDocsMap: Record<number, any[]> = {};
  if (indRes.data) {
    indRes.data.forEach((doc: any) => {
      const dirId = Number(doc.director_id);
      if (!individualDocsMap[dirId]) individualDocsMap[dirId] = [];
      individualDocsMap[dirId].push(doc);
    });
  }

  const companyDocsMap: Record<number, any[]> = {};
  if (coRes.data) {
    coRes.data.forEach((doc: any) => {
      const compId = Number(doc.company_id);
      if (!companyDocsMap[compId]) companyDocsMap[compId] = [];
      companyDocsMap[compId].push(doc);
    });
  }

  return { individualDocsMap, companyDocsMap };
};