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
  officer_sections?: Array<{ id: string, name: string, stage_ids: string[] }>;
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

// tm_class_requirements is small (a handful of KB) and gets re-read by both fetchTasks and
// by callers that need expected/promised time (e.g. summary-reports) within the same page
// load. A bare 5s in-flight/result cache means two callers racing on the same load share one
// network round trip instead of issuing back-to-back identical `select('*')` queries, while
// still staying fresh across separate page loads or a manual refresh.
let classRequirementsCache: { promise: Promise<any[]>; timestamp: number } | null = null;
const CLASS_REQUIREMENTS_CACHE_MS = 5000;

// acc_portal_directors_documents/acc_portal_kyc are company-wide, unfiltered `select('*')`
// tables fetched in full by several pages (DepartmentTasksManager, summary-reports, reports,
// immigration-tracker) purely to resolve read-only document previews/dates — and several of
// those callers re-fetch on every silent refresh (e.g. after a single task edit triggers a
// full page reload). A short result cache means that reload reuses the same in-flight/recent
// response instead of re-pulling the entire table over the network again a few seconds later.
let allDocumentsCache: { promise: Promise<DirectorDocument[]>; timestamp: number } | null = null;
let allKycFieldsCache: { promise: Promise<{ fieldsMap: Record<string, any[]>; kycDocsMap: Map<string, KycDocument> }>; timestamp: number } | null = null;
const BULK_LOOKUP_CACHE_MS = 15000;

export const fetchClassRequirements = (): Promise<any[]> => {
  const now = Date.now();
  if (classRequirementsCache && now - classRequirementsCache.timestamp < CLASS_REQUIREMENTS_CACHE_MS) {
    return classRequirementsCache.promise;
  }
  const promise = supabase
    .from('tm_class_requirements')
    .select('*')
    .then(({ data, error }) => {
      if (error) {
        console.error('Error fetching requirements:', error);
        return [];
      }
      return data || [];
    });
  classRequirementsCache = { promise, timestamp: now };
  return promise;
};

/**
 * Fetch tasks with related data
 */
export const fetchTasks = async (
  departmentId?: string,
  subdepartmentId?: string,
  companies?: Map<number, string>,
  // statusFilter pushes an `.in('status', ...)` down into the query instead of the caller
  // fetching everything and filtering client-side. includeRequirements (default true, so
  // every existing caller is unaffected) skips the tm_class_requirements match/reportDocDefaults
  // computation and the whole reference-documents fetch below for callers that never read
  // task.requirements/report_doc_defaults/referenceDocuments (confirmed via repo-wide grep for
  // summary-reports and passport-endorsement) — those two do a full-table select('*') across
  // either every department or a whole department's task history just to throw this work away.
  options?: { statusFilter?: string[]; includeRequirements?: boolean }
): Promise<Task[]> => {
  const includeRequirements = options?.includeRequirements !== false;
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

    if (options?.statusFilter?.length) {
      query = query.in('status', options.statusFilter);
    }

    // Requirements don't depend on the tasks query, so fetch both at once instead of
    // chaining requirements after tasks resolves.
    const [{ data, error }, requirementsData] = await Promise.all([
      query,
      includeRequirements ? fetchClassRequirements() : Promise.resolve([]),
    ]);

    if (error) throw error;

    // Process the data to ensure consistent structure
    const processedTasks = (data || []).map(task => {
      const jobLevel = task.job_level || {};
      const officer = task.participants_details?.find((p: any) => p.role?.includes('officer'));
      const taskManager = task.participants_details?.find((p: any) => p.role?.includes('task_manager'));
      const company = task.participants_details?.find((p: any) => p.role?.includes('sponsor') || p.role?.includes('company'));

      let taskRequirements: { requirements: any[] } = { requirements: [] };
      let reportDocDefaults: any[] = [];

      if (includeRequirements) {
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

        taskRequirements = {
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
        reportDocDefaults = bestMatch?.report_doc_defaults || [];
      }

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

    if (!includeRequirements) {
      return processedTasks;
    }

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

/**
 * Stage IDs that deep-link into a specific JobWorkspace tab from the task
 * table's stage cell (EditableStageCell). 'billing' and 'requirements' stages
 * also get an inline preview; 'automation' stages resolve a task-specific
 * automationId via the stage's document targetEntities (see
 * currentAutomationConfig in EditableStageCell.tsx) so the redirect can open
 * the Automation tab scrolled to the right automation.
 */
export const STAGE_TAB_LINKS = {
  BILL: { stageId: '916f9494-35f8-422c-aeda-44a695094445', tab: 'billing' as const },          // Bill(Quote) Raised & Sent
  REQUIREMENTS: { stageId: '713bd644-f464-4f0f-9f02-7c422550b59d', tab: 'requirements' as const }, // Req. Checklist Sent
  APPLICATION_FORM: { stageId: 'd59923c0-45ad-48be-aa26-211dea362372', tab: 'automation' as const }, // Application Form
  PROCESSING: { stageId: REQUIREMENTS_LOCK_STAGE_IDS.PROCESSING, tab: 'automation' as const },
  ISSUANCE: { stageId: REQUIREMENTS_LOCK_STAGE_IDS.ISSUANCE, tab: 'automation' as const },
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
 * Auto-create a draft billing entry the first time a task's Bill(Quote)
 * Raised & Sent stage completes. Creates a real draft in the invoice
 * generator's invoice_gen_invoice_drafts table, then stores the draft ID
 * in the task's registry_metadata.billing array.
 * Only fires if the task has no billing items yet.
 *
 * Uses task.job_level to fetch the matching rate entry from rates_history
 * and pre-populate the invoice line items.
 */
export const autoGenerateDraftInvoice = async (task: any): Promise<void> => {
  const existingBilling = task.registry_metadata?.billing || [];
  if (existingBilling.length > 0) return;

  const invoiceNumber = `DRAFT-${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];
  const clientName = task.applicant_name || 'Client';
  const jobLevel = task.job_level || {};

  // ── Fetch rate entry based on job_level ──────────────────────────────
  let invoiceItems: any[] = [];
  let subtotal = 0;

  if (jobLevel.department_id && jobLevel.subdepartment_id) {
    try {
      const { data: rateHistory } = await supabase
        .from('rates_history')
        .select('*')
        .eq('department_id', jobLevel.department_id)
        .eq('is_active', true)
        .order('effective_from', { ascending: false })
        .limit(1);

      if (rateHistory && rateHistory.length > 0) {
        const ratesData = rateHistory[0].rates_data || [];

        // Fetch the department tree to build entity paths for matching
        const { data: dept } = await supabase
          .from('tm_departments')
          .select('id, name, tm_subdepartments(*)')
          .eq('id', jobLevel.department_id)
          .single();

        if (dept) {
          const subdept = (dept.tm_subdepartments || []).find(
            (s: any) => String(s.id) === String(jobLevel.subdepartment_id)
          );

          if (subdept) {
            let cls = null;
            let subclass = null;
            if (jobLevel.class_id) {
              cls = (subdept.classes || []).find(
                (c: any) => String(c.id) === String(jobLevel.class_id)
              );
            }
            if (jobLevel.subclass_id && cls) {
              subclass = (cls.subClasses || []).find(
                (sc: any) => String(sc.id) === String(jobLevel.subclass_id)
              );
            }

            // Build entity paths (same logic as invoice generator)
            const buildPath = (names: string[]) => names.filter(Boolean).join(' → ');
            const subPath = buildPath([subdept.name]);
            const classPath = buildPath([subdept.name, cls?.name]);
            const subclassPath = buildPath([subdept.name, cls?.name, subclass?.name]);

            // Match rate entry: exact match first, then fall back
            let entry: any = null;
            if (subclass) {
              entry = ratesData.find((r: any) => r.entityType === 'subclass' && r.entityPath === subclassPath);
            }
            if (!entry && cls) {
              entry = ratesData.find((r: any) => r.entityType === 'class' && r.entityPath === classPath);
            }
            if (!entry) {
              entry = ratesData.find((r: any) => r.entityType === 'subdepartment' && r.entityPath === subPath);
            }

            // Build line items from the matched rate entry
            if (entry) {
              let nextId = Date.now();
              const addItem = (name: string, rate: number, description = '') => {
                const qty = 1;
                const amt = qty * (Math.max(0, Number(rate) || 0));
                invoiceItems.push({
                  id: { value: nextId++, isEmpty: false },
                  name: { value: name, isEmpty: false },
                  description: { value: description, isEmpty: false },
                  quantity: { value: qty, isEmpty: false },
                  rate: { value: Math.max(0, Number(rate) || 0), isEmpty: false },
                  amount: { value: amt, isEmpty: false },
                });
                subtotal += amt;
              };

              addItem('Processing Fee', entry.processingFee?.rate, 'Processing fee amount');
              addItem('Issuance Fee', entry.issuanceFee?.rate, 'Issuance fee amount');

              // Extra consideration items
              const extra = entry.extraConsideration || {};
              Object.entries(extra).forEach(([key, item]: [string, any]) => {
                if (item && item.applicable !== false && item.value) {
                  addItem(key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()), item.value);
                }
              });

              // Convenience fee items
              const conv = entry.convenienceFee || {};
              Object.entries(conv).forEach(([key, item]: [string, any]) => {
                if (item && item.applicable !== false && item.value) {
                  addItem(key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()), item.value);
                }
              });
            }
          }
        }
      }
    } catch (rateErr) {
      // Rate fetch is best-effort — continue with empty items
    }
  }

  const draftData = {
    job_level: jobLevel.department_id ? {
      department_id: jobLevel.department_id || null,
      subdepartment_id: jobLevel.subdepartment_id || null,
      class_id: jobLevel.class_id || null,
      subclass_id: jobLevel.subclass_id || null,
      level: jobLevel.level || null,
    } : null,
    invoice: {
      invoice_number: { value: invoiceNumber, isEmpty: false },
      invoice_type: { value: 'Pro-forma Invoice', isEmpty: false },
      invoice_date: { value: today, isEmpty: false },
      due_date: { value: today, isEmpty: false },
      payment_terms: { value: 'Due on Receipt', isEmpty: false },
      currency: { value: 'Ksh', isEmpty: false },
      number_format: { value: '', isEmpty: false },
      subtotal: { value: subtotal, isEmpty: false },
      vat: { value: 0, isEmpty: false },
      total: { value: subtotal, isEmpty: false },
      amount_in_words: { value: '', isEmpty: true },
      is_rounded_up: { value: false, isEmpty: false },
      is_rounded_down: { value: false, isEmpty: false },
      rounding_adjustment: { value: 0, isEmpty: false },
      status: { value: 'draft', isEmpty: false },
      credit_note_reason: { value: '', isEmpty: true },
      discount_type: { value: 'none', isEmpty: false },
      discount_value: { value: 0, isEmpty: false },
      original_total: { value: subtotal, isEmpty: false },
      discounted_total: { value: subtotal, isEmpty: false },
      discount_breakdown: { isEmpty: false },
      conversion_rate: { value: 1, isEmpty: false },
      original_invoice_reference: null,
    },
    business: {
      name: { value: 'Booksmart Consultancy Limited', isEmpty: false },
      kra_pin: { value: 'P051642956N', isEmpty: false },
      address: { value: '39549 - 00623 Nairobi', isEmpty: false },
      country: { value: 'Kenya', isEmpty: false },
      email: { value: 'info@booksmartconsult.com', isEmpty: false },
      phone: { value: '+254 700 298298', isEmpty: false },
      logo: { value: '/logo.png', isEmpty: false },
    },
    client: {
      id: { value: String(task.company_id || ''), isEmpty: !task.company_id },
      name: { value: clientName, isEmpty: !clientName },
      type: { value: '', isEmpty: true },
      kra_pin: { value: '', isEmpty: true },
      address: { value: '', isEmpty: true },
      country: { value: 'Kenya', isEmpty: false },
      email: { value: '', isEmpty: true },
      phone: { value: '', isEmpty: true },
      is_wh_vat_agent: { value: false, isEmpty: false },
      source_type: { value: '', isEmpty: false },
      registration_number: { value: '', isEmpty: true },
      industry: { value: '', isEmpty: true },
      account_manager: { value: '', isEmpty: true },
      id_number: { value: '', isEmpty: true },
      passport_number: { value: '', isEmpty: true },
      nationality: { value: '', isEmpty: true },
    },
    items: invoiceItems,
    taxes: {
      include_taxes: { value: false, isEmpty: false },
      selected_taxes: { value: [], isEmpty: false },
      withholding_tax: { value: 0, isEmpty: false },
      withholding_vat: { value: 0, isEmpty: false },
      balance: { value: subtotal, isEmpty: false },
      withholding_tax_applicable: { value: false, isEmpty: false },
      withholding_vat_applicable: { value: false, isEmpty: false },
      country: { value: 'Kenya', isEmpty: false },
      country_tax_rates: { value: [], isEmpty: true },
    },
    payment_details: {
      bank: null,
      mpesa: null,
      usdbankdetails: null,
    },
    additional_info: {
      terms: { value: '', isEmpty: true },
      notes: { value: '', isEmpty: true },
      attachments: { value: [], isEmpty: true },
      additional_info: { value: '', isEmpty: true },
    },
    signature: {
      image: { value: '', isEmpty: true },
      label: { value: '', isEmpty: true },
    },
    qr_code: {
      cu_in: { value: '', isEmpty: true },
      trader_system_invoice_no: { value: '', isEmpty: true },
      invoice_date: { value: '', isEmpty: true },
      link: { value: '', isEmpty: true },
    },
    invoice_type: 'Pro-forma Invoice',
    sub_title: {
      value: 'This is not a tax invoice',
      isEmpty: false,
      className: 'text-sm font-bold text-red-600 mt-1 uppercase',
    },
    recurring_invoice: null,
    status: {
      payment: 'pending',
      stages: [
        { name: 'pro_forma', status: 'pending', internal_status: 'pending', completedAt: null, dependsOn: [] },
        { name: 'payment', status: 'pending', internal_status: 'pending', completedAt: null, dependsOn: ['pro_forma'] },
        { name: 'fee_note', status: 'pending', internal_status: 'pending', completedAt: null, dependsOn: ['payment'] },
        { name: 'credit_note', status: 'N/A', internal_status: 'N/A', completedAt: null, dependsOn: ['fee_note'] },
        { name: 'e_tims', status: 'pending', internal_status: 'pending', completedAt: null, dependsOn: ['fee_note'] },
        { name: 'qb_post', status: 'pending', internal_status: 'pending', completedAt: null, dependsOn: ['e_tims'] },
      ],
    },
  };

  try {
    const { data: draftRow, error: draftError } = await supabase
      .from('invoice_gen_invoice_drafts')
      .insert({
        draft_data: draftData,
        type: 'Pro-forma Invoice',
        invoice_number: invoiceNumber,
        status: 'draft',
      })
      .select('id')
      .single();

    if (draftError) throw draftError;

    const billingItem = {
      id: Math.random().toString(36).substr(2, 9),
      invoiceNumber,
      description: invoiceItems.length > 0
        ? `Auto-generated pro-forma — ${invoiceItems.length} line item(s), subtotal ${subtotal.toLocaleString()}`
        : 'Auto-generated pro-forma — pending review',
      amount: subtotal,
      date: today,
      status: 'draft',
      autoGenerated: true,
      draftId: draftRow.id,
    };

    const updatedMetadata = { ...(task.registry_metadata || {}), billing: [billingItem] };
    const { error: updateError } = await supabase
      .from('tm_tasks')
      .update({ registry_metadata: updatedMetadata })
      .eq('id', task.id);
    if (updateError) throw updateError;
  } catch (error: any) {
    // Supabase errors are plain {message, details, hint, code} objects and log fine, but a
    // thrown native Error/TypeError logs as "{}" here (message is non-enumerable), which is
    // why this failure previously showed no detail at all. Log every field explicitly instead.
    console.error('Error auto-generating draft invoice:', {
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      code: error?.code,
      raw: error,
    });
    // Previously swallowed here, so callers (e.g. BillingTab's handleGenerateInvoice) always
    // saw a resolved promise and showed a false "success" toast even when nothing was created.
    throw error;
  }
};

/**
 * Fetch all documents from the database
 */
export const fetchAllDocuments = (): Promise<DirectorDocument[]> => {
  const now = Date.now();
  if (allDocumentsCache && now - allDocumentsCache.timestamp < BULK_LOOKUP_CACHE_MS) {
    return allDocumentsCache.promise;
  }
  const promise = supabase
    .from('acc_portal_directors_documents')
    .select('*')
    .order('director_id', { ascending: true })
    .then(({ data, error }) => {
      if (error) {
        console.error('Error fetching documents:', error)
        toast({
          title: "Error",
          description: "Failed to load documents data.",
          variant: "destructive"
        })
        return []
      }
      return data || []
    });
  allDocumentsCache = { promise, timestamp: now };
  return promise;
}

// Resolves the document(s) linked to a task's stage, filtering out any `isSpecial` document
// whose `targetEntities` don't match the task's class/subdepartment. Extracted from
// DepartmentTasksManager.tsx's original inline `getDocumentForTaskStage` so every module
// resolving a stage's linked document (DepartmentTasksManager, SummaryTable, ...) applies the
// same applicability rule instead of some doing a plain id lookup that ignores it. Named
// distinctly from the pre-existing `getDocumentForTaskStage` below (an unrelated, older
// director_id+kycId lookup used by StandardTable.tsx/ReportTable.tsx) to avoid colliding with it.
export const getLinkedDocumentsForTaskStage = (
  task: { source_document_id?: Record<string, any>; class_id?: string | number; subdepartment?: { id?: string | number }; subdepartment_id?: string | number },
  stage: { id: string },
  allDocuments: DirectorDocument[]
): DirectorDocument[] => {
  const linkedDocumentData = task.source_document_id?.[stage.id];
  if (!linkedDocumentData) return [];

  const taskClassId = task.class_id?.toString();
  const taskSubdeptId = task.subdepartment?.id?.toString() || task.subdepartment_id?.toString();
  const documentRefs = Array.isArray(linkedDocumentData) ? linkedDocumentData : [linkedDocumentData];

  return documentRefs
    .map((ref: any) => {
      const documentId = typeof ref === 'string' ? ref : ref.id;
      const doc: any = allDocuments.find((d: any) => d.id.toString() === documentId?.toString());
      if (!doc) return null;
      if (!doc.isSpecial) return doc;
      if (Array.isArray(doc.targetEntities) && doc.targetEntities.length > 0) {
        const isApplicable = doc.targetEntities.some((entity: any) => {
          const classMatch = !entity.class_id || entity.class_id.toString() === taskClassId;
          const subdeptMatch = !entity.subdept_id || entity.subdept_id.toString() === taskSubdeptId;
          return classMatch && subdeptMatch;
        });
        return isApplicable ? doc : null;
      }
      return doc;
    })
    .filter((doc: any): doc is DirectorDocument => !!doc);
};

/**
 * Fetch all KYC fields for all document types
 */
export const fetchAllKycFields = (): Promise<{
  fieldsMap: Record<string, any[]>;
  kycDocsMap: Map<string, KycDocument>;
}> => {
  const now = Date.now();
  if (allKycFieldsCache && now - allKycFieldsCache.timestamp < BULK_LOOKUP_CACHE_MS) {
    return allKycFieldsCache.promise;
  }
  const promise = (async () => {
    try {
      const { data, error } = await supabase
        .from('acc_portal_kyc')
        .select('id, fields, name, display_name')
        .order('display_name', { ascending: true })

      if (error) throw error

      const fieldsMap: Record<string, any[]> = {}
      const kycDocsMap = new Map<string, KycDocument>()

      // Transform and store fields by kycId and cache KYC documents. kycDocsMap must include
      // every doc type regardless of whether it has fields (matching fetchJobWorkspaceData's
      // behavior) - it's used elsewhere purely for id->display_name lookups (e.g.
      // SendRequirementsDialog's accepted-types labels), and doc types with no fields defined
      // were previously missing from the map entirely, falling back to a generic "Document" label.
      data?.forEach(doc => {
        if (!doc.id) return
        const fields = doc.fields ? transformKycFields(doc.fields) : []
        if (doc.fields) fieldsMap[doc.id] = fields
        kycDocsMap.set(doc.id, {
          id: doc.id,
          name: doc.name,
          display_name: doc.display_name,
          fields
        })
      })

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
  })();
  allKycFieldsCache = { promise, timestamp: now };
  return promise;
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