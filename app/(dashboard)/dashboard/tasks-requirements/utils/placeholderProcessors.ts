// @ts-nocheck

import { formatDate, parseJsonValue } from './templateUtils';

export const getTargetEntity = (
  placeholder: any,
  relationshipData: any,
  arrayIndex: number | null = null,
  sourceArray: any[] | null = null,
  entityIdMap: any = null,
  combinedCache: any = null,
  extractedData: any = null,
  companyData: any = null
): any => {
  if (sourceArray && arrayIndex !== null && sourceArray[arrayIndex]) {
    return sourceArray[arrayIndex];
  }

  let entityType = 'company';
  if (Array.isArray(placeholder.entity_type)) {
    entityType = placeholder.entity_type[0];
  } else if (placeholder.entity_type) {
    entityType = placeholder.entity_type;
  }
  const normType = entityType?.toLowerCase()?.trim();
  if (entityIdMap) {
    if (normType === 'director' && entityIdMap.director) {
      const dirId = entityIdMap.director;
      return relationshipData?.directors?.find((d: any) => String(d.id) === String(dirId)) ||
        combinedCache?.['registry_individuals']?.[dirId];
    }
    if (normType === 'principal' && entityIdMap.principal) {
      return relationshipData?.principal || extractedData;
    }
  }
  if (normType === 'principal') {
    return relationshipData?.principal || extractedData;
  }

  if (normType === 'sponsor') {
    if (entityIdMap?.sponsor) {
      if (relationshipData?.sponsor && String(relationshipData.sponsor.id) === String(entityIdMap.sponsor)) {
        return relationshipData.sponsor;
      }
    }
    const sponsorResult = relationshipData?.sponsor || null;
    return sponsorResult;
  }

  if (['dependant', 'dependant', 'spouse', 'child'].includes(normType)) {
    if (placeholder.dependant_relationship?.[0]) {
      const targetRel = placeholder.dependant_relationship[0].toLowerCase();
      return relationshipData?.dependants?.find((d: any) => d.relationship?.toLowerCase() === targetRel);
    }
    return relationshipData?.dependants?.[0];
  }

  if (normType === 'director') {
    const dir = placeholder.director_type === 'primary'
      ? relationshipData?.directors?.find((d: any) => d.is_primary)
      : relationshipData?.directors?.[0];
    return dir || null;
  }

  if (normType === 'company') {
    return relationshipData?.company || companyData || extractedData;
  }

  const fallbackLower = String(normType).toLowerCase().trim();
  const companyRegistries = ['registry_individuals', 'employment_data'];
  for (const reg of companyRegistries) {
    if (!combinedCache?.[reg]) continue;
    for (const item of Object.values(combinedCache[reg])) {
      const matches = item.associations?.some((a: any) =>
          a.individual_type?.toLowerCase().includes(fallbackLower)
      );
      if (matches) return item;
    }
  }

  return null;
};

export const processOrdinalField = (placeholder: any, arrayIndex: number | null) => {
  if (arrayIndex === null) return { value: '', source: null };

  const ordinalFormat = placeholder.ordinal_format || 'number';

  if (ordinalFormat === 'word') {
    return {
      value: getOrdinalWord(arrayIndex),
      source: 'Ordinal Generator'
    };
  } else if (ordinalFormat === 'custom') {
    const customFormat = placeholder.custom_ordinal_format || '.';
    const num = arrayIndex + 1;
    return {
      value: `${num}${customFormat}`,
      source: 'Custom Ordinal Generator'
    };
  } else {
    return {
      value: getOrdinalNumber(arrayIndex),
      source: 'Ordinal Generator'
    };
  }
};

const getOrdinalNumber = (index: number): string => {
  const num = index + 1;

  if (num % 100 >= 11 && num % 100 <= 13) {
    return `${num}th`;
  }

  switch (num % 10) {
    case 1: return `${num}st`;
    case 2: return `${num}nd`;
    case 3: return `${num}rd`;
    default: return `${num}th`;
  }
};

const getOrdinalWord = (index: number): string => {
  const words = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
  return words[index] || getOrdinalNumber(index);
};

export const processCurrentDateField = (placeholder: any, masterFields: Map<number, any>) => {
  if (!placeholder.master_field_ids?.length || !masterFields) {
    return { value: '', source: null };
  }

  for (const id of placeholder.master_field_ids) {
    const mf = masterFields.get(parseInt(id, 10));
    if (mf?.date_config?.useCurrentDate) {
      return {
        value: formatDate(new Date(), mf.date_config.format || 'DD/MM/YYYY'),
        source: 'System Date'
      };
    }
  }

  return { value: '', source: null };
};

export const processConditionalField = (
  placeholder: any,
  targetEntity: any,
  combinedCache: Record<string, any>,
  masterFields: Map<number, any>,
  computedFieldCache: Record<string, any> | null
) => {
  if (!placeholder.conditions || !targetEntity) return { value: '', source: null };

  const targetId = String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id || targetEntity.company_id);

  for (const condition of placeholder.conditions) {
    if (condition.comparison) {
      const { field, operator, value: compareValue } = condition.comparison;

      if (!field) continue;

      let fieldValue = null;

      if (condition.master_field_id) {
        const mf = masterFields.get(parseInt(condition.master_field_id, 10));
        if (mf?.sources) {
          for (const source of mf.sources) {
            // Handle computed fields
            if (source.is_computed && computedFieldCache) {
              const extractionMode = 'latest';
              const cacheKey = `${mf.id}_${targetId}_${extractionMode}`;
              const computedVal = computedFieldCache[cacheKey];

              if (computedVal !== undefined && computedVal !== null && computedVal !== '' &&
                !['Document Not Found', 'Missing Document', 'Field Not Found', 'Missing', 'No Source'].includes(computedVal)) {
                fieldValue = computedVal;
                break;
              }
              continue;
            }

            // Handle regular database fields
            const tableData = combinedCache[source.table];
            if (!tableData) continue;

            const linkingVar = source.linking_variable || 'id';
            const record = Object.values(tableData).find((rec: any) =>
              String(rec[linkingVar] || rec.id) === targetId
            );

            if (record) {
              const fieldName = (field as string) || mf.field_key || '';
              fieldValue = source.path
                ? parseJsonValue(record, source.path)
                // @ts-ignore - Dynamic field access
                : record[fieldName];

              if (fieldValue && typeof fieldValue === 'object') {
                // @ts-ignore - Dynamic property access
                fieldValue = fieldValue.number || fieldValue.value || fieldValue.name || String(fieldValue);
              }
              break;
            }
          }
        }
      } else {
        // @ts-ignore - Dynamic field access on targetEntity
        fieldValue = targetEntity[(field as string)];
      }

      if (fieldValue === null || fieldValue === undefined) continue;

      const strFieldValue = String(fieldValue).trim().toLowerCase();
      const strCompareValue = String(compareValue || '').trim().toLowerCase();

      let conditionMet = false;
      switch (operator) {
        case 'equals':
          conditionMet = strFieldValue === strCompareValue;
          break;
        case 'not_equals':
          conditionMet = strFieldValue !== strCompareValue;
          break;
        case 'contains':
          conditionMet = strFieldValue.includes(strCompareValue);
          break;
        default:
          conditionMet = Boolean(fieldValue);
      }

      if (conditionMet) {
        return {
          value: `${condition.label || ''}${fieldValue}`,
          source: 'Conditional Match'
        };
      }
    }
  }
  return { value: '', source: null };
};

export const processBooleanField = (
  placeholder: any,
  targetEntity: any,
  combinedCache: Record<string, any>,
  masterFields: Map<number, any>,
  task: any
) => {
  if (!placeholder.boolean_conditions) return { value: [], source: null };

  const targetId = targetEntity ? String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id || targetEntity.company_id) : null;
  const taskRecord = (combinedCache?.['tm_tasks'] && Object.values(combinedCache['tm_tasks'])[0]) || task;
  const jobAnswers = taskRecord?.job_specific_answers || {};

  const results = placeholder.boolean_conditions.map((condition: any) => {
    let isChecked = false;

    // 1. Job Questions
    const qId = condition.linked_job_question_id || placeholder.linked_job_question_id;
    if (qId && jobAnswers[qId]) {
      const actualAnswer = String(jobAnswers[qId]).trim().toLowerCase();
      const targetValue = String(condition.comparison?.value || '').trim().toLowerCase();
      if (condition.comparison?.operator === 'equals') isChecked = actualAnswer === targetValue;
      else if (condition.comparison?.operator === 'contains') isChecked = actualAnswer.includes(targetValue);
    }
    // 2. Master Field Logic
    else if (condition.master_field_id && targetId) {
      const mf = masterFields.get(parseInt(condition.master_field_id, 10));
      if (mf?.sources) {
        for (const source of mf.sources) {
          const tableData = combinedCache[source.table];
          if (!tableData) continue;

          const record = Object.values(tableData).find((r: any) =>
            String(r[source.linking_variable || 'id']) === targetId ||
            String(r.id) === targetId ||
            String(r.individual_id) === targetId
          );

          if (record) {
            const fieldValue = source.path
              ? parseJsonValue(record, source.path)
              : record[condition.comparison?.field || mf.field_key || condition.tag];

            if (fieldValue !== undefined && fieldValue !== null) {
              if (condition.comparison) {
                const { operator, value } = condition.comparison;
                const strFieldValue = String(fieldValue).trim().toLowerCase();
                const compareValue = String(value || '').trim().toLowerCase();

                switch (operator) {
                  case 'equals': isChecked = strFieldValue === compareValue; break;
                  case 'not_equals': isChecked = strFieldValue !== compareValue; break;
                  case 'contains': isChecked = strFieldValue.includes(compareValue); break;
                  default: isChecked = Boolean(fieldValue);
                }
              } else {
                isChecked = Boolean(fieldValue);
              }
            }
          }
          if (isChecked) break;
        }
      }
    }

    return {
      ...condition,
      checked: isChecked,
      hasDbLink: !!(qId || condition.master_field_id)
    };
  });

  return {
    value: results,
    source: results.some((r: any) => r.checked) ? 'Logic Resolved' : null
  };
};

export const processDocumentChecklistField = (
  placeholder: any,
  targetEntity: any,
  combinedCache: Record<string, any>
) => {
  const checklistDataSources = placeholder.checklist_data_sources || [];
  const displayFormat = placeholder.checklist_display_format || 'bullets';
  const successLabel = placeholder.checklist_success_label || '✔';
  const notFoundLabel = placeholder.checklist_not_found_label || '✗';

  if (checklistDataSources.length === 0) {
    return { value: '', source: null };
  }

  const searchId = String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id || targetEntity.company_id);
  const checklistResults = [];
  for (const dataSource of checklistDataSources) {
    const { table, linking_variable, linked_document_ids = [], execution_mode = 'latest', label } = dataSource;
    const tableData = combinedCache[table];
    if (!tableData) {
      const itemLabel = label || placeholder.display_value || placeholder.name;
      checklistResults.push(`${notFoundLabel} ${itemLabel}`);
      continue;
    }
    let matches = Object.values(tableData).filter((d: any) => {
      const entityIdMatch = String(d[linking_variable] || d.id) === searchId;
      if (!entityIdMatch) return false;

      if (linked_document_ids.length > 0) {
        return linked_document_ids.includes(d.document_id);
      }

      return true;
    });
    if (execution_mode === 'latest' && matches.length > 0) {
      matches = matches.sort((a: any, b: any) => {
        const aDate = a.issue_date ? new Date(a.issue_date).getTime() : 0;
        const bDate = b.issue_date ? new Date(b.issue_date).getTime() : 0;
        return bDate - aDate;
      });
      matches = [matches[0]];
    }

    const itemLabel = label || placeholder.display_value || placeholder.name;

    if (matches.length > 0) {
      checklistResults.push(`${successLabel} ${itemLabel}`);
    } else {
      checklistResults.push(`${notFoundLabel} ${itemLabel}`);
    }
  }

  if (checklistResults.length === 0) {
    return { value: '', source: null };
  }

  return {
    value: checklistResults.join('\n'),
    source: 'Document Checklist'
  };
};

export const processImageField = (
  placeholder: any,
  targetEntity: any,
  combinedCache: Record<string, any>,
  masterFields: Map<number, any>
) => {
  const sourceTable = placeholder.source_table;
  const linkingVariable = placeholder.linking_variable;
  const documentTypeIds = placeholder.document_type_ids || [];
  const computedFunction = placeholder.computed_function || 'none';
  const executionMode = placeholder.execution_mode || 'latest';

  if (!sourceTable || !linkingVariable) {
    return { value: '', source: null };
  }

  const tableData = combinedCache[sourceTable];
  if (!tableData) {
    return { value: '', source: null };
  }

  const searchId = String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id || targetEntity.company_id);

  let matches = Object.values(tableData).filter((d: any) => {
    const entityIdMatch = String(d[linkingVariable] || d.id) === searchId;
    if (!entityIdMatch) return false;

    if (documentTypeIds.length > 0) {
      return documentTypeIds.includes(d.document_id);
    }

    return true;
  });

  if (matches.length === 0) {
    return { value: '', source: null };
  }

  if (executionMode === 'latest' || computedFunction.includes('Latest')) {
    matches = matches.sort((a: any, b: any) => {
      const aDate = a.issue_date ? new Date(a.issue_date).getTime() : 0;
      const bDate = b.issue_date ? new Date(b.issue_date).getTime() : 0;
      return bDate - aDate;
    });
  }

  const match = matches[0] as any;
  if (match?.file_path) {
    const imageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${match.file_path}`;
    return {
      value: imageUrl,
      source: `Image: ${sourceTable}`
    };
  }

  return { value: '', source: null };
};

export const processTextField = (
  placeholder: any,
  targetEntity: any,
  combinedCache: Record<string, any>,
  masterFields: Map<number, any>,
  computedFieldCache: Record<string, any> | null,
) => {
  if (!placeholder.master_field_ids?.length) {
    return { value: '', source: null };
  }

  const candidateIds = [
    targetEntity?.id,
    targetEntity?.director_id,
    targetEntity?.individual_id,
    targetEntity?.company_id,
  ]
    .filter(Boolean)
    .map(String)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  if (candidateIds.length === 0) {
    return { value: '', source: null };
  }

  const allValues: string[] = [];
  const allSources: string[] = [];

  for (const id of placeholder.master_field_ids) {
    const mf = masterFields.get(parseInt(id, 10));
    if (!mf?.sources) continue;

    const sortedSources = [...mf.sources].sort(
      (a: any, b: any) => (a.priority ?? 999) - (b.priority ?? 999)
    );

    for (const source of sortedSources) {
      if (source.is_computed) {
        if (!computedFieldCache) continue;

        const extractionMode = 'latest';
        let computedVal: any;

        for (const candidateId of candidateIds) {
          const ck = `${mf.id}_${candidateId}_${extractionMode}`;
          if (computedFieldCache[ck] !== undefined) {
            computedVal = computedFieldCache[ck];
            break;
          }
        }

        if (computedVal === undefined) continue;

        const errorStrings = [
          'Document Not Found', 'Missing Document', 'No Document Specified',
          'Field Not Found', 'Number Not Found', 'Missing', 'No Source',
        ];

        if (computedVal !== null && !errorStrings.includes(computedVal)) {
          let finalVal = computedVal;

          if (typeof computedVal === 'object' && computedVal !== null && source.path) {
            const pathMatch = source.path.match(/['"]([\w_]+)['"]$/);
            const fieldName = pathMatch ? pathMatch[1] : null;
            if (fieldName && computedVal[fieldName]) {
              finalVal = String(computedVal[fieldName]);
            } else {
              finalVal = computedVal.en || computedVal.name || computedVal.title ||
                String(Object.values(computedVal)[0] || '');
            }
          }

          if (finalVal && String(finalVal).trim() !== '') {
            allValues.push(String(finalVal));
            allSources.push(`Computed: ${mf.label || source.table}`);
            break;
          }
        }
        continue;
      }

      const tableData = combinedCache[source.table];
      if (!tableData) continue;

      const linkingVar = source.linking_variable || 'id';

      const docIds: string[] = Array.isArray(source.document_id)
        ? source.document_id
        : (source.document_id ? [source.document_id] : []);

      let record: any = null;

      if (docIds.length > 0) {
        for (const docId of docIds) {
          for (const candidateId of candidateIds) {
            const compositeKey = `doc_${docId}_${candidateId}`;
            if (tableData[compositeKey]) {
              record = tableData[compositeKey];
              break;
            }
          }
          if (record) break;
        }

        if (!record) {
          const allRows = Object.values(tableData);
          for (const candidateId of candidateIds) {
            record = allRows.find((r: any) =>
              String(r[linkingVar]) === candidateId &&
              docIds.includes(r.document_id)
            ) || null;
            if (record) break;
          }
        }
      } else {
        for (const candidateId of candidateIds) {
          record = Object.values(tableData).find((r: any) =>
            String(r[linkingVar]) === candidateId
          ) || null;
          if (record) break;
        }
      }

      if (record) {
        let val = source.path
          ? parseJsonValue(record, source.path)
          : (record[mf.field_key] || record[placeholder.name]);

        if (val && String(val).trim() !== '') {
          allValues.push(String(val));
          allSources.push(`DB(p${source.priority ?? '?'}): ${source.table}`);
          break;
        }
      }
    }
  }

  if (allValues.length > 0) {
    return { value: allValues.join(' '), source: allSources[0] };
  }

  return { value: '', source: null };
};

export const isValidValue = (val: any, placeholderType?: string): boolean => {
  if (val === null || val === undefined) return false;

  if (placeholderType === 'boolean' && Array.isArray(val)) {
    return val.some((opt: any) => opt && opt.checked === true);
  }

  if (Array.isArray(val)) {
    return val.length > 0;
  }
  if (typeof val === 'string') {
    if (val === '') return false;
    const errorStrings = ['Missing', 'Missing Config', 'No Source', 'Computing...', 'Document Not Found', 'Field Not Found'];
    return !errorStrings.includes(val);
  }
  return Boolean(val);
};

export const processPlaceholderValue = (
  placeholder: any,
  relationshipData: any,
  combinedCache: Record<string, any>,
  masterFields: Map<number, any>,
  entityIdMap: any = null,
  extractedData: any = null,
  companyData: any = null,
  arrayIndex: number | null = null,
  sourceArray: any[] | null = null,
  task: any = null,
  computedFieldCache: Record<string, any> | null = null
): { value: any; source: string | null } => {
  const logic = placeholder.source_logic || 'priority';
  const collectedValues: string[] = [];
  const sourceMetadata: string[] = [];
  const targetEntity = getTargetEntity(placeholder, relationshipData, arrayIndex, sourceArray, entityIdMap, combinedCache, extractedData, companyData);
  const targetId = targetEntity ? String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id || targetEntity.company_id) : null;

  // Check for current date fields first (don't require targetEntity)
  if (placeholder.master_field_ids?.length > 0) {
    for (const mid of placeholder.master_field_ids) {
      const mf = masterFields.get(parseInt(mid, 10));
      if (mf?.date_config?.useCurrentDate) {
        const result = processCurrentDateField({ ...placeholder, master_field_ids: [mid] }, masterFields);
        if (isValidValue(result.value, placeholder.type)) {
          return result;
        }
      }
    }
  }

  if (placeholder.master_field_ids?.length > 0 && targetEntity) {
    for (const mid of placeholder.master_field_ids) {
      let result: { value: any; source: string | null } = { value: '', source: null };
      const mf = masterFields.get(parseInt(mid, 10));
      if (mf?.date_config?.useCurrentDate) {
        // Already handled above, skip
        continue;
      } else {
        if (placeholder.type === 'ordinal') {
          result = processOrdinalField(placeholder, arrayIndex);
        } else if (placeholder.type === 'image') {
          result = processImageField(placeholder, targetEntity, combinedCache, masterFields);
        } else if (placeholder.type === 'boolean') {
          result = processBooleanField({ ...placeholder, master_field_ids: [mid] }, targetEntity, combinedCache, masterFields, task);
        } else {
          result = processTextField({ ...placeholder, master_field_ids: [mid] }, targetEntity, combinedCache, masterFields, computedFieldCache);
        }
      }
      if (isValidValue(result.value, placeholder.type)) {
        if (logic === 'priority') {
          return result;
        }
        collectedValues.push(String(result.value));
        sourceMetadata.push(result.source || 'DB');
      }
    }
  }

  if (placeholder.type === 'boolean' && placeholder.boolean_conditions?.length > 0 && targetEntity) {
    const result = processBooleanField(placeholder, targetEntity, combinedCache, masterFields, task);
    if (isValidValue(result.value, placeholder.type)) {
      const matchedLabel = result.value.find((v: any) => v.checked)?.label;
      if (logic === 'priority') return result;
      collectedValues.push(String(result.value));
      sourceMetadata.push(result.source || 'Boolean (DB)');
    }
  }

  if (placeholder.type === 'conditional' && placeholder.conditions?.length > 0 && targetEntity) {
    const result = processConditionalField(placeholder, targetEntity, combinedCache, masterFields, computedFieldCache);
    if (isValidValue(result.value)) {
      if (logic === 'priority') return result;
      collectedValues.push(String(result.value));
      sourceMetadata.push(result.source || 'Conditional (DB)');
    }
  }

  if (placeholder.type === 'document_checklist' && placeholder.checklist_data_sources?.length > 0 && targetEntity) {
    const result = processDocumentChecklistField(placeholder, targetEntity, combinedCache);
    if (isValidValue(result.value)) {
      if (logic === 'priority') return result;
      collectedValues.push(String(result.value));
      sourceMetadata.push(result.source || 'Document Checklist');
    }
  }

  if (placeholder.type === 'image' && placeholder.source_table && placeholder.linking_variable && targetEntity) {
    const result = processImageField(placeholder, targetEntity, combinedCache, masterFields);
    if (isValidValue(result.value)) {
      if (logic === 'priority') return result;
      collectedValues.push(String(result.value));
      sourceMetadata.push(result.source || 'Image');
    }
  }

  const qIds = placeholder.linked_job_question_ids || (placeholder.linked_job_question_id ? [placeholder.linked_job_question_id] : []);
  if (qIds.length > 0) {
    const taskRecord = (combinedCache?.['tm_tasks'] && Object.values(combinedCache['tm_tasks'])[0]) || task;
    const answers = taskRecord?.job_specific_answers || {};

    for (const qId of qIds) {
      const answer = answers[String(qId)] ?? answers[Number(qId)];
      if (isValidValue(answer)) {
        if (logic === 'priority') return { value: String(answer), source: 'Job Question' };
        collectedValues.push(String(answer));
        sourceMetadata.push('Job Question');
      }
    }
  }

  const reqIds = placeholder.linked_requirement_ids || [];
  if (reqIds.length > 0 && targetId) {
    for (const rId of reqIds) {
      const isFound = checkDocumentStatus(rId, targetId, placeholder.entity_type?.[0] || 'company', combinedCache);
      if (isFound) {
        const val = "✓ Submitted";
        if (logic === 'priority') return { value: val, source: 'Requirement' };
        collectedValues.push(val);
        sourceMetadata.push('Requirement');
      }
    }
  }

  if (logic === 'all' && collectedValues.length > 0) {
    const finalResult = {
      value: collectedValues.join(' '),
      source: `Merged (${sourceMetadata[0]})`
    };
    return finalResult;
  }

  if (placeholder.default_value) {
    const defaultResult = { value: placeholder.default_value, source: 'Default' };
    return defaultResult;
  }

  const emptyResult = { value: '', source: null };
  return emptyResult;
};

const checkDocumentStatus = (
  documentId: string,
  entityId: string,
  entityType: string,
  sourceDataCache: Record<string, Record<number, any>>,
  dataSourceConfig?: {
    table: string;
    linking_variable: string;
    document_id_field: string;
  }
): boolean => {
  const config = dataSourceConfig || {
    table: 'acc_portal_kyc_uploads',
    linking_variable: entityType === 'company' ? 'company_id' : 'individual_id',
    document_id_field: 'document_id'
  };
  const uploads = sourceDataCache[config.table] || {};
  const documentFound = Object.values(uploads).some((upload: any) => {
    const uploadDocId = upload[config.document_id_field];
    const uploadEntityId = upload[config.linking_variable];
    return uploadDocId === documentId && uploadEntityId === entityId;
  });
  return documentFound;
};
