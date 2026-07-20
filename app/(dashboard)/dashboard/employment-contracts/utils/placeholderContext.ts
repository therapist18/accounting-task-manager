import supabase from '@/lib/supabase/client';
import { processPlaceholderValue, isValidValue } from '../../tasks-requirements/utils/placeholderProcessors';

// Builds the ctx object expected by processPlaceholderValue
// (app/(dashboard)/dashboard/tasks-requirements/utils/placeholderProcessors.ts) so Employment
// Contracts can reuse that master-field/entity resolution engine instead of re-implementing it.
export async function buildPlaceholderContext(companyId: string | number, individualId: number) {
  const [masterFieldsRes, companyRes, individualRes, employeeRes] = await Promise.all([
    supabase.from('tm_job_fields').select('*'),
    supabase.from('acc_portal_company_duplicate').select('*').eq('id', companyId).maybeSingle(),
    supabase.from('registry_individuals').select('*').eq('id', individualId).maybeSingle(),
    supabase.from('registry_employees').select('*').eq('company_id', companyId).eq('individual_id', individualId).maybeSingle(),
  ]);

  const masterFields = new Map<number, any>();
  (masterFieldsRes.data || []).forEach((mf: any) => masterFields.set(mf.id, mf));

  const companyRow = companyRes.data || {};
  const individualRow = individualRes.data || {};
  const employeeRow = employeeRes.data || {};

  // combinedCache mirrors the shape processPlaceholderValue/getTargetEntity expect:
  // { [table_name]: { [any_key]: row } } - only values() are iterated, keys are unused.
  const combinedCache: Record<string, any> = {
    acc_portal_company_duplicate: companyRow.id ? { [companyRow.id]: companyRow } : {},
    registry_individuals: individualRow.id ? { [individualRow.id]: individualRow } : {},
    registry_employees: employeeRow.id ? { [employeeRow.id]: employeeRow } : {},
    employment_data: employeeRow.id ? { [employeeRow.id]: employeeRow } : {},
  };

  const relationshipData = {
    company: companyRow,
    principal: { ...individualRow, ...employeeRow, id: individualRow.id }, // employee is the "principal" subject of the contract
  };

  return {
    ctx: {
      relationshipData,
      sourceDataCache: combinedCache,
      masterFields,
      entityIdMap: null,
      extractedData: individualRow,
      companyData: companyRow,
      task: null,
      computedFieldCache: {},
    },
    masterFields,
  };
}

// Mirrors the display-value extraction in TemplateGenerationDialog.tsx's own
// resolveTemplatePlaceholders wrapper - kept local (rather than importing that 3700-line
// component file just for this) so we don't drag docxtemplater/mammoth/html2pdf into this
// page's bundle. The actual resolution logic below is the real, reused implementation.
function extractDisplayValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    const checked = value.filter((opt) => opt && opt.checked);
    return checked.length > 0 ? checked.map((opt) => opt.label || opt.tag || opt.value || '').join(', ') : '';
  }
  if (typeof value === 'object') {
    return value.value !== undefined ? String(value.value) : '';
  }
  return String(value);
}

export function resolveContractPlaceholders(
  template: any,
  ctx: Awaited<ReturnType<typeof buildPlaceholderContext>>['ctx']
): { values: Record<string, string>; resolvedNames: Set<string> } {
  const values: Record<string, string> = {};
  const resolvedNames = new Set<string>();

  (template?.placeholders || []).forEach((p: any) => {
    const match = processPlaceholderValue(
      p,
      ctx.relationshipData,
      ctx.sourceDataCache,
      ctx.masterFields,
      ctx.entityIdMap,
      ctx.extractedData,
      ctx.companyData,
      null,
      null,
      ctx.task,
      ctx.computedFieldCache
    );
    // Unlike TemplateGenerationDialog's own wrapper, we always flatten to a display string -
    // this module only has plain text inputs, not the specialized boolean/checkbox UI that
    // wrapper feeds elsewhere, so a raw array value here would break a controlled <Input>.
    const validityCheck = p.type === 'boolean' ? match.value : extractDisplayValue(match.value);
    values[p.name] = extractDisplayValue(match.value);
    if (isValidValue(validityCheck, p.type)) resolvedNames.add(p.name);
  });

  return { values, resolvedNames };
}
