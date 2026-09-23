// @ts-nocheck
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import { getWorkflowLogsForIndividual } from "./workflowSyncService"

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
// fetchAllDocuments pulls every row of acc_portal_directors_documents (hundreds of KB — it's
// the single largest request this module makes), so it gets a longer cache window than the
// other bulk lookups above to actually cut network volume instead of just deduping bursts.
const ALL_DOCUMENTS_CACHE_MS = 60000;

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
export const captureRequirementsDocumentsSnapshot = async (task: any, stageId: string, audit?: { by_id: string | null }): Promise<void> => {
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
    const { error } = await supabase.from('tm_tasks').update({ [column]: snapshot, updated_at: timestamp, updated_by_id: audit?.by_id ?? null }).eq('id', task.id);
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
export const autoGenerateDraftInvoice = async (task: any, audit?: { by_id: string | null }): Promise<void> => {
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
      .update({
        registry_metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
        updated_by_id: audit?.by_id ?? null,
      })
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

// Drops the cached fetchAllDocuments() promise so the next call re-hits the DB instead of
// returning a pre-mutation snapshot for up to BULK_LOOKUP_CACHE_MS. Needed after any direct
// write to acc_portal_directors_documents/acc_portal_kyc_uploads that a caller wants reflected
// immediately (e.g. ReassignDocumentTypeDialog retagging a document's document_id).
export const invalidateAllDocumentsCache = () => {
  allDocumentsCache = null;
};

/**
 * Fetch all documents from the database
 */
export const fetchAllDocuments = (): Promise<DirectorDocument[]> => {
  const now = Date.now();
  if (allDocumentsCache && now - allDocumentsCache.timestamp < ALL_DOCUMENTS_CACHE_MS) {
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

// Job-level-aware applicability check for a stage's document-type config (stage.documents[]
// entries carrying kycId/targetEntities/class_id/subdept_id/entityType) against a task —
// mirrors StageUploadDialog.tsx's own isDocumentApplicableToTask (the logic that decides which
// upload tabs a stage actually shows for a given task), kept here as the shared, canonical
// version so other document-type UI (ReassignDocumentTypeDialog, EditableStageCell's mismatch
// indicator) agrees with what the upload dialog itself considers valid for this job level,
// rather than re-deriving a looser approximation.
export const isStageDocumentApplicableToTask = (doc: any, task: any): boolean => {
  if (!doc?.isSpecial) return true;

  if (doc.targetEntities?.length > 0) {
    const taskClassId = task?.class_id?.toString();
    const taskSubdeptId = task?.subdepartment_id?.toString() || task?.subdepartment?.id?.toString();

    return doc.targetEntities.some((entity: any) => {
      const entityClassId = entity.job_level?.class_id?.toString();
      const entitySubdeptId = entity.job_level?.subdepartment_id?.toString();
      const entityDeptId = entity.job_level?.department_id?.toString();

      const deptMatch = !entityDeptId || entityDeptId === task?.department_id?.toString();
      if (!deptMatch) return false;

      const subdeptMatch = !entitySubdeptId || entitySubdeptId === taskSubdeptId;
      if (!subdeptMatch) return false;

      const classMatch = !entityClassId || entityClassId === taskClassId;
      if (!classMatch) return false;

      return true;
    });
  }

  const taskClassId = task?.class_id?.toString();
  const taskSubdeptId = task?.subdepartment?.id?.toString() || task?.subdepartment_id?.toString();
  const docClassId = doc.class_id?.toString();
  const docSubdeptId = doc.subdept_id?.toString();

  if (docClassId) {
    if (docClassId !== taskClassId) return false;
    if (docSubdeptId && docSubdeptId !== taskSubdeptId) return false;
    return true;
  }

  if (docSubdeptId) return docSubdeptId === taskSubdeptId;

  if (doc.entityType === 'class' && doc.class_id) {
    const classMatch = taskClassId === doc.class_id.toString();
    return doc.subdept_id ? classMatch && (taskSubdeptId === doc.subdept_id.toString()) : classMatch;
  }

  if (doc.entityType === 'subdept' && doc.subdept_id) {
    return taskSubdeptId === doc.subdept_id.toString();
  }

  return false;
};

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

// ─── Shared "link an existing document into a stage" mechanics ─────────────────────────────
// StageUploadDialog (per-stage, "use existing document" path) and LinkSourceDocumentDialog
// (whole-task, link-only) both end up writing a document reference into
// tm_tasks.source_document_id[stageId] and tm_tasks.stages[stageId].documents. They used to each
// carry their own copy of the status-advance rule, the "is this doc already spoken for"
// exclusion query, and the write-up/endorsement workflow-resolution pairing — which let the two
// dialogs disagree about what's available to link and what linking it should do. Centralized
// here so both dialogs produce the identical result for the identical action.

export const WRITE_UP_STAGE_ID = '072b9710-45df-4a05-ba65-01b4ef29d61d';
export const ENDORSEMENT_STAGE_IDS = ['6625f6d2-8017-4bf4-96c2-85335703164c', 'caefd742-5de5-4341-a3bb-81d7b9dd2b73'];

const STAGE_STATUS_MAPPING: Record<string, string> = {
  'a19b270e-6d1e-4e6d-b2bc-f21db72cde08': 'in_progress',
  [WRITE_UP_STAGE_ID]: 'write_up_completed',
  [ENDORSEMENT_STAGE_IDS[0]]: 'endorsed',
  [ENDORSEMENT_STAGE_IDS[1]]: 'endorsed',
};

const STATUS_PRIORITY: Record<string, number> = {
  pending: 0, new: 0, enquiry: 0,
  in_progress: 1,
  write_up_completed: 2,
  endorsed: 3,
};

const normalizeTaskStatus = (s: string | null | undefined): string => {
  if (!s) return 'pending';
  return s.toLowerCase().trim().replace(/[\s-]/g, '_');
};

/**
 * Given the task's current status and the stage that just got a document linked to it, returns
 * the task-level status it should advance to, or null if the stage doesn't gate a task status or
 * the task is already at/past that point. Status only ever moves forward here.
 */
export const computeAdvancedTaskStatus = (
  currentStatusRaw: string | null | undefined,
  stageId: string
): string | null => {
  const potentialNewStatus = STAGE_STATUS_MAPPING[stageId];
  if (!potentialNewStatus) return null;
  const currentPriority = STATUS_PRIORITY[normalizeTaskStatus(currentStatusRaw)] ?? 0;
  const newPriority = STATUS_PRIORITY[potentialNewStatus] ?? 0;
  return newPriority > currentPriority ? potentialNewStatus : null;
};

/**
 * Every document instance id referenced anywhere in a task's source_document_id map — these are
 * the documents that TRIGGERED this task (e.g. a renewal task created off an expiring document),
 * so they shouldn't also show up as something the task can "link" as if it were a fresh document.
 */
export const collectTaskTriggerDocumentIds = (sourceDocumentMap: any): Set<string> => {
  const triggerIds = new Set<string>();
  if (!sourceDocumentMap || typeof sourceDocumentMap !== 'object') return triggerIds;

  Object.values(sourceDocumentMap).forEach((stageEntries: any) => {
    if (!Array.isArray(stageEntries)) return;
    stageEntries.forEach((entry: any) => {
      [entry?.id, entry?.linked_document_id, entry?.uploaded_doc_id].forEach((candidate) => {
        if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
          triggerIds.add(String(candidate));
        }
      });
    });
  });

  return triggerIds;
};

/**
 * Client-side-only "does this task's stage have an eligible existing document sitting unlinked"
 * check — for EditableStageCell's small indicator on the Write Up/Endorsement stage cells in
 * DepartmentTasksManager's table. Deliberately lighter than getDocumentLinkAvailabilityContext/
 * isDocumentAvailableForLinking (which query document_workflow_logs and do a fresh per-task
 * Supabase call): this only uses data the table already has loaded — allDocuments and the current
 * department/subdepartment's own task list — so it's cheap enough to run per cell across a whole
 * table render. It's a hint to go open Link Source Documents, not the authoritative answer that
 * dialog itself computes when actually linking (which also checks workflow-log trigger docs).
 */
export const hasAvailableDocumentForStage = (
  task: {
    id: string | number;
    individual_id?: string | number;
    source_document_id?: Record<string, any>;
    stages?: Record<string, any>;
  },
  stage: { id: string; documents?: any[] },
  allDocuments: Array<{ id: string | number; director_id?: string | number; document_id?: string }>,
  allTasks: Array<{ id: string | number; stages?: Record<string, any> }>,
): boolean => {
  // Already linked on this task — nothing to flag.
  const existingDocs = task.stages?.[stage.id]?.documents;
  if (existingDocs && Object.keys(existingDocs).length > 0) return false;
  if (!task.individual_id) return false;

  const applicableKycIds = new Set(
    (stage.documents || [])
      .filter((doc: any) => isStageDocumentApplicableToTask(doc, task))
      .map((doc: any) => doc.kycId)
      .filter(Boolean),
  );
  if (applicableKycIds.size === 0) return false;

  const currentTaskTriggerIds = collectTaskTriggerDocumentIds(task.source_document_id);

  const candidateDocs = allDocuments.filter(
    (d) => String(d.director_id) === String(task.individual_id) && applicableKycIds.has(String(d.document_id)),
  );
  if (candidateDocs.length === 0) return false;

  return candidateDocs.some((doc) => {
    const docId = String(doc.id);
    if (currentTaskTriggerIds.has(docId)) return false;
    const linkedElsewhere = allTasks.some((otherTask) => {
      if (String(otherTask.id) === String(task.id)) return false;
      return Object.values(otherTask.stages || {}).some((stageData: any) =>
        Object.values(stageData?.documents || {}).some(
          (stageDoc: any) => String(stageDoc?.id) === docId || String(stageDoc?.linked_document_id) === docId,
        ),
      );
    });
    return !linkedElsewhere;
  });
};

export interface DocumentLinkAvailabilityContext {
  otherTasksData: any[];
  workflowDocMap: Record<string, any>;
  triggerDocIdsFromWorkflow: Set<string>;
}

// Both dialogs re-ran this same pair of queries (other completed tasks + workflow logs) from
// scratch on every open, including opening/closing the same task back to back or StageUploadDialog
// re-fetching on refreshTrigger — same short-lived in-flight/result cache pattern as
// fetchAllDocuments/fetchAllKycFields above, keyed per individual-or-company since the result
// only varies by who the task belongs to (the `.neq('id', task.id)` self-exclusion is the only
// per-task part, and matching on it loosely below still invalidates correctly on write).
const documentLinkAvailabilityCache = new Map<string, { promise: Promise<DocumentLinkAvailabilityContext>; timestamp: number }>();
const DOCUMENT_LINK_AVAILABILITY_CACHE_MS = 15000;

const documentLinkAvailabilityCacheKey = (
  task: { individual_id?: number | string; company_id?: number | string },
  isCompanyTask: boolean,
  companyId: number | string | null
) => (isCompanyTask ? `company:${companyId}` : `individual:${task.individual_id}`);

/**
 * Drops cached availability lookups for the individual/company a task belongs to. Call after any
 * write that could change what's "already claimed" for them — linking or unlinking a document on
 * any of their tasks changes what every OTHER task for that individual/company should now show.
 */
export const invalidateDocumentLinkAvailabilityCache = (
  task?: { individual_id?: number | string; company_id?: number | string },
  opts: { isCompanyTask?: boolean; companyId?: number | string | null } = {}
) => {
  if (!task) {
    documentLinkAvailabilityCache.clear();
    return;
  }
  documentLinkAvailabilityCache.delete(
    documentLinkAvailabilityCacheKey(task, opts.isCompanyTask ?? false, opts.companyId ?? null)
  );
};

/**
 * Fetches the data needed to decide which of an individual/company's existing documents are
 * still available to link onto this task: every OTHER task for that individual/company (to
 * exclude documents already linked to any stage of any of them, regardless of that other task's
 * or stage's status — a document claimed elsewhere shouldn't be offered here) and this
 * individual's workflow logs (to exclude the document(s) that triggered this task, and to flag
 * documents whose workflow was resolved as not-applicable). Shared by StageUploadDialog and
 * LinkSourceDocumentDialog.
 */
export const getDocumentLinkAvailabilityContext = (
  task: { id: string | number; individual_id?: number | string; company_id?: number | string },
  opts: { isCompanyTask?: boolean; companyId?: number | string | null } = {}
): Promise<DocumentLinkAvailabilityContext> => {
  const { isCompanyTask = false, companyId = null } = opts;

  const cacheKey = documentLinkAvailabilityCacheKey(task, isCompanyTask, companyId);
  const now = Date.now();
  const cached = documentLinkAvailabilityCache.get(cacheKey);
  if (cached && now - cached.timestamp < DOCUMENT_LINK_AVAILABILITY_CACHE_MS) {
    return cached.promise;
  }

  const promise = fetchDocumentLinkAvailabilityContext(task, isCompanyTask, companyId);
  documentLinkAvailabilityCache.set(cacheKey, { promise, timestamp: now });
  return promise;
};

const fetchDocumentLinkAvailabilityContext = async (
  task: { id: string | number; individual_id?: number | string; company_id?: number | string },
  isCompanyTask: boolean,
  companyId: number | string | null
): Promise<DocumentLinkAvailabilityContext> => {
  const otherTasksPromise = isCompanyTask
    ? (companyId
      ? supabase.from('tm_tasks').select('id, stages, company_id, status').eq('company_id', companyId).neq('id', task.id)
      : Promise.resolve({ data: [] as any[] }))
    : (task.individual_id
      ? supabase.from('tm_tasks').select('id, stages, individual_id, status').eq('individual_id', task.individual_id).neq('id', task.id)
      : Promise.resolve({ data: [] as any[] }));

  const workflowLogsPromise = isCompanyTask || !task.individual_id
    ? Promise.resolve([])
    : getWorkflowLogsForIndividual(task.individual_id as number);

  const [otherTasksRes, workflowLogs] = await Promise.all([otherTasksPromise, workflowLogsPromise]);

  const workflowDocMap: Record<string, any> = {};
  const triggerDocIdsFromWorkflow = new Set<string>();

  (workflowLogs || []).forEach((log: any) => {
    const isCompleted = log.resolutions && log.resolutions.length > 0;
    const tasksArray = Array.isArray(log.tasks) ? log.tasks : [];
    const isTriggerForCurrentTask = tasksArray.some((t: any) =>
      Array.isArray(t.taskIds) && t.taskIds.map(String).includes(String(task.id))
    );
    if (isTriggerForCurrentTask && log.uploaded_doc_id) {
      triggerDocIdsFromWorkflow.add(String(log.uploaded_doc_id));
    }
    const workflowDocInfo = {
      ...log,
      isWorkflowDocument: true,
      workflowAction: log.action_type,
      workflowOutcome: isCompleted ? log.resolutions[0]?.outcome : log.action_type,
      isCompleted,
    };
    if (log.uploaded_doc_id) workflowDocMap[log.uploaded_doc_id] = workflowDocInfo;
    if (log.document_type_id) workflowDocMap[log.document_type_id] = workflowDocInfo;
  });

  return {
    otherTasksData: (otherTasksRes as any)?.data || [],
    workflowDocMap,
    triggerDocIdsFromWorkflow,
  };
};

/**
 * Applies the same "is this existing document still eligible to link onto this task" rule
 * StageUploadDialog uses: not already linked to any stage of any OTHER task — regardless of that
 * task's or stage's own status, since a document claimed elsewhere shouldn't be offered here at
 * all — and not one of this task's own trigger documents. Also surfaces whether the document
 * carries a "not_applicable" workflow outcome (hasNoTaskOutcome) so a dialog can show-but-disable
 * it rather than hiding it outright.
 */
export const isDocumentAvailableForLinking = (
  doc: { id: string | number; task_id?: string | number },
  task: { id: string | number },
  ctx: DocumentLinkAvailabilityContext,
  currentTaskTriggerIds: Set<string>
): { available: boolean; hasNoTaskOutcome: boolean; workflowLogId?: any; workflowOutcome?: any } => {
  const docId = String(doc.id);
  const workflowDoc = ctx.workflowDocMap[docId];
  const hasNoTaskOutcome = Boolean(
    workflowDoc?.tasks?.some?.((t: any) => t.status === 'not_applicable')
  );

  if (currentTaskTriggerIds.has(docId) || ctx.triggerDocIdsFromWorkflow.has(docId)) {
    return { available: false, hasNoTaskOutcome, workflowLogId: workflowDoc?.id, workflowOutcome: workflowDoc?.workflowOutcome };
  }

  let available = !doc.task_id || String(doc.task_id) === String(task.id);
  if (available) {
    const isAlreadyLinkedToOtherTask = ctx.otherTasksData.some((otherTask: any) =>
      Object.values(otherTask.stages || {}).some((stageData: any) => {
        const stageDocuments = stageData?.documents || {};
        return Object.values(stageDocuments).some((stageDoc: any) =>
          String(stageDoc.id) === docId || String(stageDoc.linked_document_id) === docId
        );
      })
    );
    if (isAlreadyLinkedToOtherTask) available = false;
  }

  return { available, hasNoTaskOutcome, workflowLogId: workflowDoc?.id, workflowOutcome: workflowDoc?.workflowOutcome };
};

/**
 * Builds the updated stage entry + source_document_id entries for linking one or more EXISTING
 * documents onto a stage — the shared "commit" step behind both StageUploadDialog's "use
 * existing document" path and LinkSourceDocumentDialog. Pure/no DB writes: callers combine the
 * result into their own tm_tasks update (StageUploadDialog only ever touches one stage at a
 * time; LinkSourceDocumentDialog may touch several stages in one save).
 */
export const buildStageLinkUpdate = (params: {
  task: { stages?: Record<string, any>; source_document_id?: Record<string, any> };
  stageId: string;
  docsToLink: Array<{ id: string | number; document_id: string }>;
  kycDocuments: Map<string, { name?: string; display_name?: string }>;
  uploaderId: string | null;
  currentDate?: string;
}) => {
  const { task, stageId, docsToLink, kycDocuments, uploaderId } = params;
  const currentDate = params.currentDate || new Date().toISOString();

  const existingStageDocs = { ...(task.stages?.[stageId]?.documents || {}) };
  docsToLink.forEach((doc) => {
    const kycDoc = kycDocuments.get(doc.document_id);
    existingStageDocs[String(doc.id)] = {
      id: doc.id,
      document_id: doc.document_id,
      name: kycDoc?.display_name || kycDoc?.name || 'document',
      linked_at: currentDate,
      status: 'linked',
      uploaded_by_id: uploaderId,
    };
  });

  const updatedStageEntry = {
    ...task.stages?.[stageId],
    status: 'completed',
    date: currentDate.split('T')[0],
    completedAt: currentDate,
    documentsUploaded: Object.keys(existingStageDocs).length,
    lastUpdated: currentDate,
    uploaded_by_id: uploaderId,
    documents: existingStageDocs,
  };

  const existingSourceDocs: any[] = Array.isArray(task.source_document_id?.[stageId])
    ? task.source_document_id![stageId]
    : [];
  const dedupedByType = existingSourceDocs.filter(
    (d: any) => !docsToLink.some((nd) => nd.document_id === d.document_id)
  );
  const sourceDocsForStage = [
    ...dedupedByType,
    ...docsToLink.map((doc) => ({
      id: doc.id,
      document_id: doc.document_id,
      linked_at: currentDate,
      status: 'linked',
      linked_document_id: doc.id,
    })),
  ];

  return { updatedStageEntry, sourceDocsForStage };
};

/**
 * The inverse of buildStageLinkUpdate: removes one or more previously-linked documents from a
 * stage and reverts the stage's status based on what's left — no documents left drops it back to
 * in_progress, otherwise it steps back one level from wherever it was (endorsed → write_up,
 * completed/write_up → in_progress). Task-level status is deliberately left alone here: unlinking
 * shouldn't silently roll the whole task backward, only the stage's own record of what's linked.
 */
export const buildStageUnlinkUpdate = (params: {
  task: { stages?: Record<string, any>; source_document_id?: Record<string, any> };
  stageId: string;
  docIdsToUnlink: Array<string | number>;
  uploaderId: string | null;
  currentDate?: string;
}) => {
  const { task, stageId, docIdsToUnlink, uploaderId } = params;
  const currentDate = params.currentDate || new Date().toISOString();
  const unlinkIds = new Set(docIdsToUnlink.map(String));

  const existingStageDocs = { ...(task.stages?.[stageId]?.documents || {}) };
  Object.keys(existingStageDocs).forEach((key) => {
    if (unlinkIds.has(String(existingStageDocs[key]?.id))) {
      delete existingStageDocs[key];
    }
  });

  const remainingCount = Object.keys(existingStageDocs).length;
  const previousStatus = task.stages?.[stageId]?.status;
  const newStatus =
    remainingCount === 0 ? 'in_progress'
      : previousStatus === 'endorsed' ? 'write_up'
        : (previousStatus === 'completed' || previousStatus === 'write_up') ? 'in_progress'
          : (previousStatus || 'in_progress');

  const updatedStageEntry = {
    ...task.stages?.[stageId],
    status: newStatus,
    documentsUploaded: remainingCount,
    lastUpdated: currentDate,
    updated_by_id: uploaderId,
    documents: existingStageDocs,
    ...(newStatus !== 'completed' && { completedAt: null, date: null }),
  };

  const existingSourceDocs: any[] = Array.isArray(task.source_document_id?.[stageId])
    ? task.source_document_id![stageId]
    : [];
  const sourceDocsForStage = existingSourceDocs.filter((d: any) => !unlinkIds.has(String(d.id)));

  return { updatedStageEntry, sourceDocsForStage };
};

/**
 * Marks the original document(s) that triggered this task as renewed. Moved here from
 * StageUploadDialog so LinkSourceDocumentDialog (which can also complete the Write Up/
 * Endorsement stages) resolves the same workflow logs the same way instead of running its own
 * looser version of this.
 *
 * relatedDocumentTypeIds gets merged into each resolved log's payload.relatedDocumentTypeIds.
 * That field is what bcl-registry's Individual Document Manager actually matches a document
 * column against to decide its workflow-status badge (see documentWorkflowEngine.ts's
 * matchesRecord — it checks relatedDocumentTypeIds before falling back to the log's own single
 * documentTypeId/uploadedDocId), so a resolution recorded here only shows up for OTHER document
 * types produced by the same task (e.g. a Write Up PDF's Passport Endorsement) if their type ids
 * are present in this list — appending a resolution object alone does nothing for them.
 */
export const resolveOriginalDocumentWorkflow = async (
  task: { id: string | number; individual_id?: number | string },
  newDocumentId: string | number,
  documentTypeId: string,
  uploaderId: string | null,
  relatedDocumentTypeIds: string[] = []
): Promise<void> => {
  try {
    const { data: existingLogs, error: logsError } = await supabase
      .from('document_workflow_logs')
      .select('*')
      .eq('individual_id', task.individual_id)
      .order('created_at', { ascending: false });

    if (logsError) throw logsError;
    if (!existingLogs || existingLogs.length === 0) return;

    // Filter to find ALL workflow logs that actually triggered this current task — e.g. multiple
    // dependants may have triggered the task bundle, so all of them need resolving.
    const logsToResolve = existingLogs.filter((log: any) => {
      const tasks = Array.isArray(log.tasks) ? log.tasks : [];
      return tasks.some((t: any) => Array.isArray(t.taskIds) && t.taskIds.map(String).includes(String(task.id)));
    });
    if (logsToResolve.length === 0) return;

    await Promise.all(logsToResolve.map((logToResolve: any) => {
      const newResolution = {
        outcome: 'renewed',
        document_id: newDocumentId,
        renewed_by_document_type_id: documentTypeId,
        effectiveDate: new Date().toISOString().split('T')[0],
        note: `Document renewed through task completion (Task ID: ${task.id})`,
        createdAt: new Date().toISOString(),
      };
      const updatedResolutions = Array.isArray(logToResolve.resolutions) ? [...logToResolve.resolutions, newResolution] : [newResolution];
      const updatedTasks = Array.isArray(logToResolve.tasks)
        ? logToResolve.tasks.map((t: any) => {
          const isMatchingTask = Array.isArray(t.taskIds) && t.taskIds.map(String).includes(String(task.id));
          if (isMatchingTask || t.status === 'not_applicable' || ['pending_task_creation', 'task_created', 'task_initiated'].includes(String(t.status || ''))) {
            return { ...t, status: 'completed', note: 'Trigger document renewed by completed write-up task' };
          }
          return t;
        })
        : [];
      const existingRelatedIds = Array.isArray(logToResolve.payload?.relatedDocumentTypeIds)
        ? logToResolve.payload.relatedDocumentTypeIds.map(String)
        : [];
      const mergedRelatedIds = Array.from(new Set(
        [...existingRelatedIds, documentTypeId, ...relatedDocumentTypeIds].filter(Boolean).map(String)
      ));

      const updatedPayload = {
        ...(logToResolve.payload || {}),
        relatedDocumentTypeIds: mergedRelatedIds,
        activeWorkflow: {
          ...(logToResolve.payload?.activeWorkflow || {}),
          canProceed: false,
          isCompleted: true,
          currentAction: 'resolution',
          currentStatus: 'renewed',
          nextAction: null,
          lastUpdated: new Date().toISOString(),
        },
      };
      return supabase.from('document_workflow_logs').update({
        resolutions: updatedResolutions,
        tasks: updatedTasks,
        payload: updatedPayload,
        action_type: 'resolution',
        updated_at: new Date().toISOString(),
        updated_by_id: uploaderId,
      }).eq('id', logToResolve.id);
    }));

    toast({
      title: 'Documents Renewed',
      description: 'Original document workflows have been updated to reflect renewal',
      variant: 'default',
    });
  } catch (error) {
    console.error('Error resolving original document workflow:', error);
    toast({
      title: 'Workflow Resolution Error',
      description: 'Failed to update original document workflow',
      variant: 'destructive',
    });
  }
};

/**
 * If either the Write Up document or its Endorsement counterpart already has an existing
 * document_workflow_logs row (most commonly a resolution recorded manually on the registry
 * side, via ResolutionDialog or the "Sync with Paired Document" action there), attaches the
 * OTHER document to that SAME log's payload.pairedDocuments. Mirrors bcl-registry's
 * workflowService.findWorkflowRecord + setPairedDocuments exactly — this is the task-manager
 * side firing that same sync automatically at the moment it learns the precise pairing (both
 * stages just completed together), instead of requiring someone to click the registry's manual
 * action afterward. Does nothing if NEITHER document has an existing log yet — there's no
 * resolution to share between them.
 */
const syncPairedDocumentWorkflow = async (
  individualId: string | number,
  writeUpDoc: { documentTypeId: string; uploadedDocId: string } | null,
  endorsementDoc: { documentTypeId: string; uploadedDocId: string } | null,
): Promise<void> => {
  if (!writeUpDoc?.uploadedDocId || !endorsementDoc?.uploadedDocId) return;
  try {
    const { data: existingLogs, error } = await supabase
      .from('document_workflow_logs')
      .select('id, payload, uploaded_doc_id, updated_at')
      .eq('individual_id', individualId)
      .in('uploaded_doc_id', [writeUpDoc.uploadedDocId, endorsementDoc.uploadedDocId])
      .order('updated_at', { ascending: false });

    if (error) throw error;
    if (!existingLogs || existingLogs.length === 0) return;

    // If both documents somehow already have their own separate log, prefer the more recently
    // touched one as the surviving shared record — same "stays anchored, doesn't create a
    // second one" principle the registry side's findWorkflowRecord follows.
    const targetLog = existingLogs[0];

    const existingPaired: Array<{ documentTypeId: string; uploadedDocId: string }> = Array.isArray(targetLog.payload?.pairedDocuments)
      ? targetLog.payload.pairedDocuments
      : [];
    const key = (p: { documentTypeId: string; uploadedDocId: string }) => `${p.documentTypeId}::${p.uploadedDocId}`;
    const merged = new Map(existingPaired.map((p) => [key(p), p]));
    [writeUpDoc, endorsementDoc].forEach((p) => merged.set(key(p), p));

    const { error: updateError } = await supabase
      .from('document_workflow_logs')
      .update({
        payload: { ...(targetLog.payload || {}), pairedDocuments: Array.from(merged.values()) },
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetLog.id);
    if (updateError) throw updateError;
  } catch (error) {
    console.error('Error syncing paired document workflow:', error);
  }
};

/**
 * After a batch of stage updates lands (any of which may be the Write Up or an Endorsement
 * stage), fires resolveOriginalDocumentWorkflow exactly once, pointed at the Write Up document,
 * the moment BOTH stages are complete — whichever of the two completes second, in either order.
 * Guards against re-firing on a later re-save of a stage that was already done before this save.
 * Shared so StageUploadDialog and LinkSourceDocumentDialog trigger this renewal pairing
 * identically instead of StageUploadDialog's stage-pairing gate vs. LinkSourceDocumentDialog's
 * old per-document, un-paired trigger. Also fires syncPairedDocumentWorkflow so the two
 * documents' OWN resolutions (not just the original triggering document's) stay in sync with
 * each other, independent of whether a triggering log exists at all.
 */
export const maybeResolveWriteUpWorkflowPairing = async (params: {
  task: { id: string | number; individual_id?: number | string; stages?: Record<string, any>; linked_document_type_id?: string };
  updatedStages: Record<string, any>;
  touchedStageIds: string[];
  isCompanyTask?: boolean;
  uploaderId: string | null;
}): Promise<void> => {
  const { task, updatedStages, touchedStageIds, isCompanyTask, uploaderId } = params;
  if (isCompanyTask) return;

  const relevantStageIds = touchedStageIds.filter(
    (id) => id === WRITE_UP_STAGE_ID || ENDORSEMENT_STAGE_IDS.includes(id)
  );
  if (relevantStageIds.length === 0) return;

  try {
    const wasAlreadyCompleted = relevantStageIds.some((id) => task.stages?.[id]?.status === 'completed');
    const writeUpStageState = updatedStages[WRITE_UP_STAGE_ID];
    const writeUpDone = writeUpStageState?.status === 'completed';
    const endorsementDone = ENDORSEMENT_STAGE_IDS.some((id) => updatedStages[id]?.status === 'completed');

    if (!wasAlreadyCompleted && writeUpDone && endorsementDone) {
      // Point the resolution at the WRITE UP document specifically — that's the actual renewal
      // evidence — regardless of whether this save was the Write Up or the Endorsement (the one
      // that happened to complete the pair).
      const writeUpDocuments = Object.values(writeUpStageState?.documents || {});
      const workflowTargetDocument =
        (writeUpDocuments.find((doc: any) => doc.document_id === task.linked_document_type_id) as any) ||
        (writeUpDocuments[0] as any) ||
        null;
      const finalDocId = workflowTargetDocument?.id || null;

      // Independent of whether a triggering log exists (resolveOriginalDocumentWorkflow below
      // requires one) — if either document already has its own resolution, attach the other to
      // it. See syncPairedDocumentWorkflow.
      if (task.individual_id) {
        const endorsementDocuments = ENDORSEMENT_STAGE_IDS.flatMap((stageId) =>
          Object.values(updatedStages[stageId]?.documents || {})
        ) as any[];
        const endorsementTargetDocument = endorsementDocuments[0] || null;

        await syncPairedDocumentWorkflow(
          task.individual_id,
          (finalDocId && workflowTargetDocument?.document_id)
            ? { documentTypeId: workflowTargetDocument.document_id, uploadedDocId: finalDocId }
            : null,
          (endorsementTargetDocument?.id && endorsementTargetDocument?.document_id)
            ? { documentTypeId: endorsementTargetDocument.document_id, uploadedDocId: endorsementTargetDocument.id }
            : null,
        );
      }

      if (finalDocId) {
        const resolvedDocumentTypeId = workflowTargetDocument?.document_id || task.linked_document_type_id;
        if (resolvedDocumentTypeId) {
          // Every document type this Write Up/Endorsement pair produces — not just the one the
          // resolution is filed against — so bcl-registry shows the SAME workflow status for
          // both (e.g. the Endorsement column, not just the Write Up PDF's own column).
          const endorsementDocumentTypeIds = ENDORSEMENT_STAGE_IDS.flatMap((stageId) =>
            Object.values(updatedStages[stageId]?.documents || {}).map((doc: any) => doc.document_id)
          );
          const relatedDocumentTypeIds = [
            ...writeUpDocuments.map((doc: any) => doc.document_id),
            ...endorsementDocumentTypeIds,
          ].filter(Boolean);

          await resolveOriginalDocumentWorkflow(task, finalDocId, resolvedDocumentTypeId, uploaderId, relatedDocumentTypeIds);
        }
      }
    }
  } catch (workflowError) {
    console.error('Error updating workflow:', workflowError);
  }
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