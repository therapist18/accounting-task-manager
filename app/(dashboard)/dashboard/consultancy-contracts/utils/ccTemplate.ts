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
}

// This module keeps exactly one standard document (no per-company variants,
// no clause library) - the default row is "the" template. Auto-creates it on
// first read so Settings/Preview never have to special-case "no template yet".
export async function fetchDefaultTemplate(): Promise<CcTemplate | null> {
  const { data, error } = await supabase
    .from('acc_portal_templates')
    .select('*')
    .eq('document_id', CC_DOCUMENT_ID)
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
      return template;
    }

  const { data: created, error: createError } = await supabase
    .from('acc_portal_templates')
    .insert([{
      document_id: CC_DOCUMENT_ID,
      file_name: 'Standard Bookkeeping & Consultancy Agreement',
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
  patch: Partial<Pick<CcTemplate, 'file_name' | 'content' | 'file_path' | 'file_type' | 'file_size' | 'placeholders' | 'entity_types' | 'classification' | 'use_letterhead' | 'theme_settings'>>
): Promise<CcTemplate | null> {
  const { theme_settings, ...restPatch } = patch;
  
  // If theme_settings is provided, merge it into classification
  let finalPatch = { ...restPatch };
  if (theme_settings) {
    finalPatch.classification = {
      ...restPatch.classification,
      theme_settings,
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
  return template;
}