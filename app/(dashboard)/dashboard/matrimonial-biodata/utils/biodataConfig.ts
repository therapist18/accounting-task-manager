import { supabase } from '@/lib/supabase/client';
import type { Placeholder } from '../../templates/document-template-manager/types';

export const BIODATA_DOC_NAME = 'Matrimonial Biodata Settings';

export interface BiodataTemplate {
  id: string;
  document_id: string;
  placeholders: Placeholder[];
}

function humanize(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function seedPlaceholder(key: string, sectionKey: string): Placeholder {
  return {
    id: crypto.randomUUID(),
    name: key,
    display_value: humanize(key),
    type: 'text',
    required: false,
    entity_type: ['individual'],
    master_field_ids: [],
    linked_job_question_ids: [],
    linked_requirement_ids: [],
    default_value: '',
    section_key: sectionKey,
  };
}

// One-time migration path: the fields BiodataEditor/BiodataPreview used to
// hardcode directly (biodataConfig.personal?.dob etc.) before the placeholder
// registry existed. Seeded once into an empty template so existing behavior
// survives the switch to a linkable registry, and so users have something to
// link to a Master Field immediately instead of starting from a blank list.
const DEFAULT_PLACEHOLDER_KEYS: Array<{ section: string; keys: string[] }> = [
  { section: 'header', keys: ['full_name', 'phone', 'email', 'address'] },
  { section: 'personal', keys: ['dob', 'tob', 'birth_place', 'height', 'religion', 'community', 'nationality', 'marital_status'] },
  { section: 'career', keys: ['education', 'occupation', 'hobbies', 'languages'] },
  { section: 'family', keys: ['father_name', 'father_desc', 'mother_name', 'mother_desc', 'maternal_desc'] },
  { section: 'roots', keys: ['roots_text'] },
];

export function buildDefaultBiodataPlaceholders(): Placeholder[] {
  return DEFAULT_PLACEHOLDER_KEYS.flatMap(({ section, keys }) => keys.map((key) => seedPlaceholder(key, section)));
}

export async function fetchBiodataTemplate(): Promise<BiodataTemplate | null> {
  // 1. find or create kyc doc
  let { data: kycDoc } = await supabase
    .from('acc_portal_kyc')
    .select('id')
    .eq('name', BIODATA_DOC_NAME)
    .maybeSingle();

  if (!kycDoc) {
    const { data: newDoc, error } = await supabase
      .from('acc_portal_kyc')
      .insert([{
        name: BIODATA_DOC_NAME,
        display_name: BIODATA_DOC_NAME,
        category: 'system-settings',
        subcategory: 'biodata',
        main_category: 'Settings'
      }])
      .select('id')
      .single();
    
    if (error) {
        console.error("Error creating KYC doc", error);
        return null;
    }
    kycDoc = newDoc;
  }

  if (!kycDoc) return null;

  // 2. find or create template
  let { data: template } = await supabase
    .from('acc_portal_templates')
    .select('id, document_id, placeholders')
    .eq('document_id', kycDoc.id)
    .maybeSingle();

  if (!template) {
    const { data: newTemplate, error } = await supabase
      .from('acc_portal_templates')
      .insert([{
        document_id: kycDoc.id,
        file_name: 'Biodata Settings Template',
        content: '',
        file_type: 'application/json',
        placeholders: buildDefaultBiodataPlaceholders(),
        entity_types: ['individual'],
        classification: {}
      }])
      .select('id, document_id, placeholders')
      .single();

    if (error) {
        console.error("Error creating template", error);
        return null;
    }
    template = newTemplate;
  } else if (!template.placeholders || template.placeholders.length === 0) {
    // Template row already existed (e.g. created before the placeholder
    // registry existed) but has never been seeded - same one-time migration
    // as the fresh-insert branch above.
    const seeded = await updateBiodataPlaceholders(template.id, buildDefaultBiodataPlaceholders());
    if (seeded) template = seeded;
  }

  return template as BiodataTemplate;
}

export async function updateBiodataPlaceholders(id: string, placeholders: Placeholder[]): Promise<BiodataTemplate | null> {
  const { data, error } = await supabase
    .from('acc_portal_templates')
    .update({ placeholders })
    .eq('id', id)
    .select('id, document_id, placeholders')
    .single();

  if (error) {
    console.error("Error updating placeholders", error);
    return null;
  }
  return data as BiodataTemplate;
}
