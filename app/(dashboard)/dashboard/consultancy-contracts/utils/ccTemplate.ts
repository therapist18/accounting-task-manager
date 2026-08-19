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
}

// This module keeps exactly one standard template per contract-type document
// (no per-company variants, no clause library) - the earliest row for a given
// document_id is "the" template for that contract type. Defaults to the
// original Consultancy Agreement document so existing callers (the main
// generation page) keep working unchanged; Settings passes whichever
// contract type is selected in its sidebar - see contractDocumentTypes.ts.
// Auto-creates the row on first read so Settings/Preview never have to
// special-case "no template yet".
export async function fetchDefaultTemplate(
  documentId: string = CC_DOCUMENT_ID,
  defaultFileName: string = 'Standard Bookkeeping & Consultancy Agreement'
): Promise<CcTemplate | null> {
  const { data, error } = await supabase
    .from('acc_portal_templates')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching consultancy contract template:', error);
    return null;
  }
  if (data) {
      const template = data as CcTemplate;
      template.theme_settings = template.classification?.theme_settings || {};
      template.consultant_company_id = template.classification?.consultant_company_id ?? null;
      return template;
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
  return created as CcTemplate;
}

export async function updateTemplate(
  id: string,
  patch: Partial<Pick<CcTemplate, 'file_name' | 'content' | 'file_path' | 'file_type' | 'file_size' | 'placeholders' | 'entity_types' | 'classification' | 'use_letterhead' | 'theme_settings' | 'consultant_company_id'>>,
  existingClassification?: Record<string, any>
): Promise<CcTemplate | null> {
  const { theme_settings, consultant_company_id, ...restPatch } = patch;

  // theme_settings/consultant_company_id both live inside classification -
  // merge onto whatever the caller already has loaded (existingClassification)
  // so patching one doesn't clobber the other when only one is passed.
  let finalPatch = { ...restPatch };
  if (theme_settings !== undefined || consultant_company_id !== undefined) {
    finalPatch.classification = {
      ...existingClassification,
      ...restPatch.classification,
      ...(theme_settings !== undefined && { theme_settings }),
      ...(consultant_company_id !== undefined && { consultant_company_id }),
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

  const template = data as CcTemplate;
  template.theme_settings = template.classification?.theme_settings || {};
  template.consultant_company_id = template.classification?.consultant_company_id ?? null;
  return template;
}