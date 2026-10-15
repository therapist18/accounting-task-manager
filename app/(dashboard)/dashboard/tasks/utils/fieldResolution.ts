import supabase from '@/lib/supabase/client';
import { executeComputedField } from './automationComputedFunctions';
import { parseJsonValue, cleanFieldValue, formatDateValue, isValidValue } from './AutomationMappingDialog';

export interface FieldResolutionContext {
  sourceData: Record<string, Record<string, any>>;
  jobFields: Record<string, any>;
  webData: any[];
  selectedAutomationId: string;
  masterFieldComputedValues: Record<string, any>;
  relationshipData: any;
  taskId?: string;
  currentIndividualId?: string;
  task?: any;
  isLoading?: boolean;
  isLoadingData?: boolean;
}

export interface FetchSourceDataParams {
  selectedAutomationId: string;
  webData: any[];
  jobFields: Record<string, any>;
  relationshipData: any;
  taskId?: string;
  currentIndividualId?: string;
  task?: any;
}

export const resolveTargetEntityIdImpl = (field: any, ctx: FieldResolutionContext): any => {
  const { relationshipData, currentIndividualId, task } = ctx;
  const types = field.entityTypes || [];
  if (types.includes('dependant')) {
    if (field.dependantRelationships && field.dependantRelationships.length > 0) {
      const dep = relationshipData?.dependants?.find((d: any) =>
        field.dependantRelationships.includes(d.relationship?.toLowerCase())
      );
      if (dep?.id) return dep.id;
    } else {
      const dep = relationshipData?.dependants?.[0];
      if (dep?.id) return dep.id;
    }
  }
  if (types.includes('sponsor') && relationshipData?.sponsor?.id) {
    return relationshipData.sponsor.id;
  }
  if (types.includes('director') && relationshipData?.directors?.[0]?.id) {
    return relationshipData.directors[0].id;
  }
  if (types.includes('understudy') && relationshipData?.understudy?.id) {
    return relationshipData.understudy.id;
  }
  if (types.includes('principal')) {
    const pid = relationshipData?.principal?.id || currentIndividualId;
    if (pid) return pid;
  }
  if (types.includes('company')) {
    const companyId = relationshipData?.company?.id || task?.company_id;
    if (companyId) return companyId;
  }
  return undefined;
};

export const resolveEntityIdsForArrayImpl = (field: any, relationshipData: any, ctx: { currentIndividualId?: string; task?: any }): string[] => {
  const { currentIndividualId, task } = ctx;
  const types = field.entityTypes || [];
  const collectedIds = new Set<string>();
  types.forEach((type: string) => {
    const t = type.toLowerCase();
    if (t === 'principal') {
      const pid = relationshipData?.principal?.id || currentIndividualId;
      if (pid) collectedIds.add(String(pid));
    }
    if (t === 'dependant') {
      if (field.dependantRelationships && field.dependantRelationships.length > 0) {
        relationshipData?.dependants?.forEach((d: any) => {
          if (field.dependantRelationships.includes(d.relationship?.toLowerCase())) {
            collectedIds.add(String(d.id));
          }
        });
      } else {
        relationshipData?.dependants?.forEach((d: any) => collectedIds.add(String(d.id)));
      }
    }
    if (t === 'sponsor' && relationshipData?.sponsor?.id) {
      collectedIds.add(String(relationshipData.sponsor.id));
    }
    if (t === 'understudy' && relationshipData?.understudy?.id) {
      collectedIds.add(String(relationshipData.understudy.id));
    }
    if (t === 'director') {
      relationshipData?.directors?.forEach((d: any) => collectedIds.add(String(d.id)));
    }
    if (t === 'company') {
      const cid = relationshipData?.company?.id || task?.company_id;
      if (cid) collectedIds.add(String(cid));
    }
  });
  return Array.from(collectedIds);
};

const getSourceValueImpl = (table: string, path: string, entityId: string, extractionMode: 'latest' | 'all' | undefined, ctx: FieldResolutionContext): any => {
  const tableData = ctx.sourceData[table];
  if (!tableData) return "Missing";
  const record = tableData[entityId];
  if (!record) return "Missing";
  const val = parseJsonValue(record, path, extractionMode);
  return val !== undefined && val !== null ? String(val) : "Missing";
};

export const getFieldValueImpl = (
  fieldIdOrVariable: string,
  entityId: string,
  sourceIdx: number = 0,
  extractionMode: string = 'latest',
  preserveArray: boolean = false,
  ctx: FieldResolutionContext
): any => {
  const { webData, selectedAutomationId, sourceData, isLoadingData, jobFields, isLoading, masterFieldComputedValues, taskId } = ctx;
  const activeAuto = webData.find(w => w.automationId === selectedAutomationId);
  const fieldDef = activeAuto?.fields?.find((f: any) => f.variableName === fieldIdOrVariable || String(f.id) === String(fieldIdOrVariable));

  const jobQuestionIds = fieldDef?.linkedJobQuestionIds || [];

  if (jobQuestionIds.length > 0) {
    const taskRecord = sourceData['tm_tasks']?.[String(taskId)];
    if (!taskRecord) return isLoadingData ? "Loading Task Data..." : "Missing Task Data";

    const answers = taskRecord.job_specific_answers || {};

    for (const qId of jobQuestionIds) {
      const answer = answers[String(qId)] ?? answers[Number(qId)];
      if (answer !== undefined && answer !== null && String(answer).trim() !== "") {
        return String(answer);
      }
    }
    return "Missing";
  }

  const field = jobFields[fieldIdOrVariable];
  if (!field) return isLoading ? "Loading Config..." : "Missing Config";

  const sortedSources = field.sources?.slice().sort((a: any, b: any) => (a.priority || 999) - (b.priority || 999)) || [];

  for (let i = 0; i < sortedSources.length; i++) {
    const source = sortedSources[i];
    if (!source) continue;

    if (source.is_computed) {
      const key = `${field.id}_${entityId}_${extractionMode}`;
      const val = masterFieldComputedValues[key];

      if (val === undefined) return isLoadingData ? "Computing..." : "Computing...";
      if (typeof val === 'string' && !val.startsWith('{')) {
        const isErrorString = val === 'Document Not Found' || val === 'Missing Document' ||
          val === 'No Document Specified' || val === 'Field Not Found' ||
          val === 'Number Not Found' || val === 'Missing' || val === 'No Source';
        if (!isErrorString) return val;
      } else {
        let parsedVal = val;
        if (typeof val === 'string' && val.startsWith('{')) { try { parsedVal = JSON.parse(val); } catch (e) { } }
        if (typeof parsedVal === 'object' && parsedVal !== null && source.path) {
          const pathMatch = source.path.match(/['"]([\w_]+)['"]$/);
          const fieldName = pathMatch ? pathMatch[1] : null;
          if (fieldName && parsedVal[fieldName]) return String(parsedVal[fieldName]);
        }
        const isValid = val !== null && val !== undefined && !((Array.isArray(val) && val.length === 0) || val === '');
        if (isValid) {
          if (typeof parsedVal === 'object' && parsedVal !== null) { return parsedVal.en || parsedVal.name || parsedVal.title || String(Object.values(parsedVal)[0]); }
          return String(val);
        }
      }
      continue;
    }

    let lookupId = String(entityId);
    if (source.table === 'tm_tasks' && (!source.linking_variable || source.linking_variable === 'id')) lookupId = String(taskId);
    const value = getSourceValueImpl(source.table, source.path, lookupId, extractionMode as 'latest' | 'all', ctx);
    if (value !== null && value !== undefined && value !== '' && value !== 'Missing') return value;
  }

  if (fieldDef?.default_value) {
    return fieldDef.default_value;
  }

  if (fieldDef?.fieldType === 'image') {
    const imageProps: any = {
      url: "Missing",
      width: fieldDef.image_width || 'auto',
      height: fieldDef.image_height || 'auto',
      alignment: fieldDef.image_alignment || 'left'
    };
    if (fieldDef.default_value && fieldDef.default_value !== "Missing") {
      imageProps.url = fieldDef.default_value;
    }
    return JSON.stringify(imageProps);
  }

  return "Missing";
};

export const resolveVariableValueImpl = (fieldDef: any, targetEntityId: string, ctx: FieldResolutionContext): any => {
  if (fieldDef.defaultValue && fieldDef.defaultValue !== 'Missing' && fieldDef.defaultValue !== '') {
    return fieldDef.defaultValue;
  }
  const logic = fieldDef.sourceLogic || 'priority';
  const masterIds = fieldDef.linkedMasterFields || [];
  const questionIds = fieldDef.linkedJobQuestionIds || [];
  const extractionMode = fieldDef.extractionMode || 'latest';
  const collectedValues: string[] = [];
  for (const mid of masterIds) {
    const val = getFieldValueImpl(String(mid), String(targetEntityId), 0, extractionMode, false, ctx);
    if (isValidValue(val)) {
      if (logic === 'priority') return val;
      collectedValues.push(val);
    }
  }
  const taskRecord = ctx.sourceData['tm_tasks']?.[String(ctx.taskId)];
  const answers = taskRecord?.job_specific_answers || {};
  for (const qId of questionIds) {
    const answer = answers[String(qId)] ?? answers[Number(qId)];
    if (isValidValue(answer)) {
      const cleanAnswer = cleanFieldValue(answer);
      if (logic === 'priority') return cleanAnswer;
      collectedValues.push(cleanAnswer);
    }
  }
  if (logic === 'all' && collectedValues.length > 0) {
    return collectedValues.join(' ');
  }
  if (fieldDef.default_value && fieldDef.default_value !== 'Missing') return fieldDef.default_value;
  return "Missing";
};

export const getArrayFieldDataImpl = (field: any, ctx: FieldResolutionContext): any[] => {
  const entityIds = resolveEntityIdsForArrayImpl(field, ctx.relationshipData, { currentIndividualId: ctx.currentIndividualId, task: ctx.task });
  const arrayData: any[] = [];

  entityIds.forEach((entityId, index) => {
    const rowValues: any = {};

    field.arrayItems?.forEach((col: any) => {
      const val = resolveVariableValueImpl(col, String(entityId), ctx);

      let finalVal = val;
      if (col.type === 'date' && isValidValue(val)) {
        finalVal = formatDateValue(val, col.dateFormat);
      }

      rowValues[col.variableName] = cleanFieldValue(finalVal);
    });

    if (Object.keys(rowValues).length > 0) {
      arrayData.push({ ...rowValues, entityId, index });
    }
  });
  return arrayData;
};

const TABLE_KEY_OVERRIDES: Record<string, string> = {
  registry_individuals: 'id',
};

export async function fetchSourceDataImpl(params: FetchSourceDataParams): Promise<{ sourceData: Record<string, Record<string, any>>; masterFieldComputedValues: Record<string, any> | null }> {
  const { selectedAutomationId, webData, jobFields, relationshipData, taskId, currentIndividualId, task } = params;
  if (!selectedAutomationId || Object.keys(jobFields).length === 0 || !webData.length) {
    return { sourceData: {}, masterFieldComputedValues: null };
  }

  const arrayCtx = { currentIndividualId, task };
  const targetCtx: FieldResolutionContext = {
    sourceData: {}, jobFields, webData, selectedAutomationId, masterFieldComputedValues: {},
    relationshipData, taskId, currentIndividualId, task
  };

  const standardFetchQueue = new Map<string, { table: string, ids: Set<string>, linkingVariable: string }>();
  const addToQueue = (table: string, linkingVar: string, id: string) => {
    const queueKey = `${table}:${linkingVar}`;
    if (!standardFetchQueue.has(queueKey)) {
      standardFetchQueue.set(queueKey, { table, ids: new Set(), linkingVariable: linkingVar });
    }
    standardFetchQueue.get(queueKey)!.ids.add(id);
  };
  const computedRequirements = { individualIds: new Set<string>(), documentIds: new Set<string>() };
  const activeAutomation = webData.find(w => w.automationId === selectedAutomationId);
  const fieldsToProcess = activeAutomation?.fields || [];
  const computedMasterFields: any[] = [];

  fieldsToProcess.forEach((field: any) => {
    const questionIds = field.linkedJobQuestionIds || [];
    if (questionIds.length > 0) { if (taskId) addToQueue('tm_tasks', 'id', String(taskId)); return; }
    const isArray = field.fieldType === 'array';
    const cols = isArray ? (field.arrayItems || []) : [{ linkedMasterFieldId: field.linkedMasterFields?.[0] || field.masterFieldIds?.[0] }];

    // If this is an array and any sub-items are linked to job questions, we need tm_tasks
    // in sourceData so that job_specific_answers is available for dependency evaluation.
    if (isArray && taskId) {
      const hasArrayItemQuestions = (field.arrayItems || []).some((it: any) => (it.linkedJobQuestionIds || []).length > 0);
      if (hasArrayItemQuestions) addToQueue('tm_tasks', 'id', String(taskId));
    }

    let entityIds: string[] = [];
    if (isArray) {
      entityIds = resolveEntityIdsForArrayImpl(field, relationshipData, arrayCtx);
    } else {
      const targetId = resolveTargetEntityIdImpl(field, targetCtx);
      if (targetId) entityIds = [String(targetId)];
    }
    cols.forEach((col: any) => {
      const fieldIds = col.linkedMasterFields || (col.linkedMasterFieldId ? [col.linkedMasterFieldId] : []);
      const mid = fieldIds[0] || field.linkedMasterFields?.[0] || field.masterFieldIds?.[0];
      if (!mid) return;
      const jobField = jobFields[mid];
      if (!jobField) return;
      const computedSource = jobField.sources?.find((s: any) => s.is_computed === true);
      if (computedSource) {
        const extractionMode = col.extractionMode || field.extractionMode || 'latest';
        (computedSource.document_id || []).forEach((did: string) => computedRequirements.documentIds.add(did));
        entityIds.forEach(id => { computedRequirements.individualIds.add(String(id)); computedMasterFields.push({ field: jobField, entityId: String(id), extractionMode, computedSource }); });
      }
      jobField.sources?.forEach((source: any) => {
        if (source.is_computed) return;
        if (!source.table) return;
        const linkingVar = source.linking_variable || 'id';
        if (source.table === 'tm_tasks' && (!source.linking_variable || source.linking_variable === 'id')) { if (taskId) addToQueue(source.table, linkingVar, String(taskId)); }
        else { entityIds.forEach(id => { addToQueue(source.table, linkingVar, String(id)); }); }
      });
    });
  });

  const newSourceData: Record<string, Record<string, any>> = {};
  const documentCache: { documents: any[]; docTypes: any[] } = { documents: [], docTypes: [] };
  const fetchPromises: Promise<any>[] = [];
  for (const [, { table, ids, linkingVariable }] of standardFetchQueue.entries()) {
    const idArray = Array.from(ids);
    if (idArray.length === 0) continue;
    const effectiveLinkingVar = TABLE_KEY_OVERRIDES[table] || linkingVariable;
    fetchPromises.push(supabase.from(table).select('*').in(effectiveLinkingVar, idArray).then(({ data, error }: { data: any[] | null; error: any }) => {
      if (!error && data) {
        if (!newSourceData[table]) newSourceData[table] = {};
        data.forEach((record: any) => {
          const recordKey = String(record[effectiveLinkingVar]);
          newSourceData[table][recordKey] = record;
          if (table === 'tm_tasks' && record.id) {
            newSourceData[table][String(record.id)] = record;
          }
        });
        if (table === 'acc_portal_directors_documents') {
          documentCache.documents.push(...data);
        }
      }
    }));
  }

  // Same wave as the loop above, not a separate awaited step - neededDocTypes/
  // remainingPeople only depend on computedRequirements (built purely from field
  // metadata above), never on the standardFetchQueue results, so there's no reason
  // to wait for that batch to land before firing these off too.
  const neededDocTypes = Array.from(computedRequirements.documentIds);
  if (neededDocTypes.length > 0) {
    const remainingPeople = Array.from(computedRequirements.individualIds);
    fetchPromises.push(
      supabase.from('acc_portal_kyc').select('*').in('id', neededDocTypes).then(({ data }: { data: any[] | null }) => { if (data) documentCache.docTypes = data; }),
      supabase.from('acc_portal_directors_documents').select('*').in('director_id', remainingPeople).in('document_id', neededDocTypes).neq('status', 'deleted').then(({ data }: { data: any[] | null }) => { if (data) documentCache.documents.push(...data); })
    );
  }
  await Promise.all(fetchPromises);

  let newComputedValues: Record<string, any> | null = null;
  if (computedMasterFields.length > 0) {
    newComputedValues = {};
    for (const item of computedMasterFields) {
      const { field, entityId, extractionMode, computedSource } = item;
      let functionToCall = computedSource.computed_function || 'extractFieldFromLatestDocument';
      if (functionToCall === 'getLatestDocument' && computedSource.path) { functionToCall = 'extractFieldFromLatestDocument'; }
      const val = await executeComputedField(functionToCall, entityId, computedSource.document_id || [], computedSource.path, extractionMode, documentCache, computedSource.computed_config);
      newComputedValues[`${field.id}_${entityId}_${extractionMode}`] = val;
    }
  }

  return { sourceData: newSourceData, masterFieldComputedValues: newComputedValues };
}
