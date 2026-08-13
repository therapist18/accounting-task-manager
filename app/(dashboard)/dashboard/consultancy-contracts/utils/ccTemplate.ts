import supabase from '@/lib/supabase/client';

export interface CcTemplate {
  id: string;
  name: string;
  content: string;
  theme_settings: Record<string, any>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// This module keeps exactly one standard document (no per-company variants,
// no clause library) - the default row is "the" template. Auto-creates it on
// first read so Settings/Preview never have to special-case "no template yet".
export async function fetchDefaultTemplate(): Promise<CcTemplate | null> {
  const { data, error } = await supabase
    .from('cc_templates')
    .select('*')
    .eq('is_default', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching consultancy contract template:', error);
    return null;
  }
  if (data) return data as CcTemplate;

  const { data: created, error: createError } = await supabase
    .from('cc_templates')
    .insert([{ name: 'Standard Bookkeeping & Consultancy Agreement', content: '', is_default: true }])
    .select()
    .single();

  if (createError) {
    console.error('Error creating consultancy contract template:', createError);
    return null;
  }
  return created as CcTemplate;
}

export async function updateTemplate(id: string, patch: Partial<Pick<CcTemplate, 'name' | 'content' | 'theme_settings'>>): Promise<CcTemplate | null> {
  const { data, error } = await supabase
    .from('cc_templates')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating consultancy contract template:', error);
    throw error;
  }
  return data as CcTemplate;
}
