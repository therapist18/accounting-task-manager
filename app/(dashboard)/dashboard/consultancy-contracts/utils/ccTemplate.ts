import supabase from '@/lib/supabase/client';
import type { Placeholder } from '../../templates/document-template-manager/types';
import { EntityType } from '@/lib/constants/entity-types';

export const CC_DOCUMENT_ID = 'dcdd687b-5fd3-4bf5-a4c5-3156a562399d';

export interface CcTemplate {
  id: string;
  document_id: string;
  file_name: string;
  content?: string;
  file_path?: string;
  file_type?: string;
  file_size?: number;
  placeholders: Placeholder[];
  entity_types: EntityType[];
  classification: Record<string, any>;
  use_letterhead: boolean;
  created_at: string;
  updated_at: string;

  // Computed property for theme settings (stored in classification.theme_settings)
  theme_settings?: Record<string, any>;

  // Which companies row is "the Consultant" (our own company, as opposed to
  // the Client selected per-engagement) - a single platform-wide choice like
  // theme_settings, stored in classification.consultant_company_id rather
  // than a dedicated column so no migration is needed to introduce it.
  consultant_company_id?: string | number | null;

  // Deprecated in favour of consultant_entity_ids (see below) - kept
  // read-only for backward compat with templates saved before the
  // per-entity-type pickers existed. No longer written by the UI.
  consultant_signatory_id?: string | number | null;

  // Which individual resolves each individual-scoped Consultant entity_type
  // (e.g. { director: '12', employee: '47' }) - a template's Consultant
  // placeholders can span more than just directors/shareholders (an
  // `entity_type: 'employee'` placeholder needs an employee, not a
  // signatory), so this is one explicit choice per distinct type found among
  // the template's Consultant placeholders, not a single fixed field.
  // Explicit, not auto-picked - see page.tsx's per-entity-type dropdowns.
  consultant_entity_ids?: Record<string, string>;

  // A contract-type document can now hold several template variants (see
  // fetchTemplatesForDocument) - exactly one per document_id is flagged
  // is_default, and that's the one the main generation page renders from
  // (fetchDefaultTemplate). Stored in classification like the fields above,
  // not a dedicated column.
  is_default?: boolean;
}

function withComputedFields(row: any): CcTemplate {
  const template = row as CcTemplate;
  template.theme_settings = template.classification?.theme_settings || {};
  template.consultant_company_id = template.classification?.consultant_company_id ?? null;
  template.consultant_signatory_id = template.classification?.consultant_signatory_id ?? null;
  // Backward compat: a template saved before per-entity-type pickers existed
  // only has the old single consultant_signatory_id - treat it as that
  // signatory's `director` bucket rather than losing the saved choice.
  template.consultant_entity_ids = template.classification?.consultant_entity_ids
    || (template.classification?.consultant_signatory_id
      ? { director: String(template.classification.consultant_signatory_id) }
      : {});
  template.is_default = !!template.classification?.is_default;
  return template;
}

// This module keeps exactly one DEFAULT template per contract-type document,
// but a document can now hold several variants (see fetchTemplatesForDocument/
// createTemplateVariant) - the one flagged classification.is_default is "the"
// template the main generation page renders from. Falls back to the
// earliest-created row when none is flagged (nothing here auto-assigns
// is_default - that's always the user's own "Set as Default" click in
// ContractTemplateDialog, even for a brand-new type's first/only row), so
// pre-existing single-template documents keep working unchanged. Auto-
// creates a row on first read so Settings/Preview never have to special-case
// "no template yet".
export async function fetchDefaultTemplate(
  documentId: string = CC_DOCUMENT_ID,
  defaultFileName: string = 'Standard Bookkeeping & Consultancy Agreement'
): Promise<CcTemplate | null> {
  const { data, error } = await supabase
    .from('acc_portal_templates')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching consultancy contract template:', error);
    return null;
  }
  if (data && data.length > 0) {
    const templates: CcTemplate[] = data.map(withComputedFields);
    return templates.find((t) => t.is_default) || templates[0];
  }

  const { data: created, error: createError } = await supabase
    .from('acc_portal_templates')
    .insert([{
      document_id: documentId,
      file_name: defaultFileName,
      content: '',
      file_type: 'text/html',
      placeholders: [],
      entity_types: ['company'],
      classification: { theme_settings: {} },
      use_letterhead: false,
    }])
    .select()
    .single();

  if (createError) {
    console.error('Error creating consultancy contract template:', createError);
    return null;
  }
  return withComputedFields(created);
}

// A single template variant by id, for ContractTemplateDialog.tsx (opened
// against one specific variant, unlike fetchDefaultTemplate/
// fetchTemplatesForDocument which key off the parent document).
export async function fetchTemplateById(id: string): Promise<CcTemplate | null> {
  const { data, error } = await supabase
    .from('acc_portal_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching template:', error);
    return null;
  }
  return data ? withComputedFields(data) : null;
}

// Every template variant for a contract-type document, for Settings' template
// list (see components/ContractTemplateDialog.tsx and settings/page.tsx) -
// unlike fetchDefaultTemplate, this does NOT auto-create anything, since an
// empty list is a normal, valid state there ("no variants yet, click Create").
export async function fetchTemplatesForDocument(documentId: string): Promise<CcTemplate[]> {
  const { data, error } = await supabase
    .from('acc_portal_templates')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching contract templates:', error);
    return [];
  }
  return (data || []).map(withComputedFields);
}

// Creates a new, blank template variant under a contract-type document.
// Never auto-flagged default - that's the user's call (ContractTemplateDialog's
// "Set as Default" button), not something to decide on their behalf. Until
// they do, fetchDefaultTemplate's own fallback (earliest row when none is
// flagged) still picks something so the generation page never breaks.
export async function createTemplateVariant(documentId: string, fileName: string): Promise<CcTemplate | null> {
  const { data, error } = await supabase
    .from('acc_portal_templates')
    .insert([{
      document_id: documentId,
      file_name: fileName,
      content: '',
      file_type: 'text/html',
      placeholders: [],
      entity_types: ['company'],
      classification: { theme_settings: {} },
      use_letterhead: false,
    }])
    .select()
    .single();

  if (error) {
    console.error('Error creating template variant:', error);
    return null;
  }
  return withComputedFields(data);
}

// Flags exactly one variant as default for its document - unsets every
// sibling first (classification is per-row, so "exactly one" has to be
// enforced here rather than by a DB constraint).
export async function setDefaultTemplateVariant(documentId: string, templateId: string): Promise<boolean> {
  const siblings = await fetchTemplatesForDocument(documentId);
  const results = await Promise.all(siblings.map((t) => {
    const shouldBeDefault = t.id === templateId;
    if (t.is_default === shouldBeDefault) return Promise.resolve(true);
    return supabase
      .from('acc_portal_templates')
      .update({ classification: { ...t.classification, is_default: shouldBeDefault }, updated_at: new Date().toISOString() })
      .eq('id', t.id)
      .then(({ error }: { error: any }) => {
        if (error) console.error('Error updating default flag:', error);
        return !error;
      });
  }));
  return results.every(Boolean);
}

// Deletes a template variant. Deliberately does NOT auto-promote a new
// default if the deleted one was it - that's the user's call, same as
// creation. fetchDefaultTemplate's own earliest-row fallback still keeps the
// generation page working (renders the earliest remaining variant) until
// they explicitly set one via ContractTemplateDialog's "Set as Default".
export async function deleteTemplateVariant(id: string): Promise<boolean> {
  const { error } = await supabase.from('acc_portal_templates').delete().eq('id', id);
  if (error) {
    console.error('Error deleting template variant:', error);
    return false;
  }
  return true;
}

export async function updateTemplate(
  id: string,
  patch: Partial<Pick<CcTemplate, 'file_name' | 'content' | 'file_path' | 'file_type' | 'file_size' | 'placeholders' | 'entity_types' | 'classification' | 'use_letterhead' | 'theme_settings' | 'consultant_company_id' | 'consultant_entity_ids' | 'is_default'>>,
  existingClassification?: Record<string, any>
): Promise<CcTemplate | null> {
  const { theme_settings, consultant_company_id, consultant_entity_ids, is_default, ...restPatch } = patch;

  // theme_settings/consultant_company_id/consultant_entity_ids/is_default
  // all live inside classification - merge onto whatever the caller already
  // has loaded (existingClassification) so patching one doesn't clobber the
  // others when only one is passed.
  let finalPatch = { ...restPatch };
  if (theme_settings !== undefined || consultant_company_id !== undefined || consultant_entity_ids !== undefined || is_default !== undefined) {
    finalPatch.classification = {
      ...existingClassification,
      ...restPatch.classification,
      ...(theme_settings !== undefined && { theme_settings }),
      ...(consultant_company_id !== undefined && { consultant_company_id }),
      ...(consultant_entity_ids !== undefined && { consultant_entity_ids }),
      ...(is_default !== undefined && { is_default }),
    };
  }

  const { data, error } = await supabase
    .from('acc_portal_templates')
    .update({ ...finalPatch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating consultancy contract template:', error);
    throw error;
  }

  return withComputedFields(data);
}
