import supabase from '@/lib/supabase/client';
import { ContractThemeSettings, DEFAULT_CONTRACT_THEME, BrandingStrategy } from './themeEngine';
import { defaultSectionKeys, type ContractSectionKey } from './contractStructure';

export interface EcContractTemplate {
  id: string;
  company_id: string | null; // null = platform default
  name: string;
  section_keys: ContractSectionKey[];
  theme_settings: ContractThemeSettings;
  branding_strategy: BrandingStrategy;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchContractTemplates(companyId?: string | number): Promise<EcContractTemplate[]> {
  let query = supabase.from('ec_contract_templates').select('*').order('name', { ascending: true });
  if (companyId) {
    query = query.or(`company_id.eq.${String(companyId)},company_id.is.null`);
  }
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching contract templates:', error);
    return [];
  }
  return (data || []) as EcContractTemplate[];
}

export async function fetchContractTemplateById(id: string): Promise<EcContractTemplate | null> {
  const { data, error } = await supabase
    .from('ec_contract_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as EcContractTemplate;
}

/** The template a company should generate with: its own is_default row, else the platform default. */
export async function fetchEffectiveContractTemplate(companyId: string | number): Promise<EcContractTemplate | null> {
  const templates = await fetchContractTemplates(companyId);
  if (templates.length === 0) return null;
  const companyDefault = templates.find((t) => t.company_id === String(companyId) && t.is_default);
  if (companyDefault) return companyDefault;
  const companyAny = templates.find((t) => t.company_id === String(companyId));
  if (companyAny) return companyAny;
  const platformDefault = templates.find((t) => !t.company_id && t.is_default);
  return platformDefault || templates.find((t) => !t.company_id) || null;
}

export async function createContractTemplate(template: Partial<EcContractTemplate>): Promise<EcContractTemplate | null> {
  const { data, error } = await supabase
    .from('ec_contract_templates')
    .insert([{
      section_keys: defaultSectionKeys(),
      theme_settings: DEFAULT_CONTRACT_THEME,
      branding_strategy: 'theme_header',
      ...template,
    }])
    .select()
    .single();

  if (error) {
    console.error('Error creating contract template:', error);
    throw error;
  }
  return data as EcContractTemplate;
}

export async function updateContractTemplate(id: string, patch: Partial<EcContractTemplate>): Promise<EcContractTemplate | null> {
  const { data, error } = await supabase
    .from('ec_contract_templates')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating contract template:', error);
    throw error;
  }
  return data as EcContractTemplate;
}

export async function deleteContractTemplate(id: string): Promise<boolean> {
  const { error } = await supabase.from('ec_contract_templates').delete().eq('id', id);
  if (error) {
    console.error('Error deleting contract template:', error);
    return false;
  }
  return true;
}
