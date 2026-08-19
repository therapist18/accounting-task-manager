import supabase from '@/lib/supabase/client';

// The set of contract "kinds" this module's Settings sidebar lets an admin
// switch between (Consultancy Agreement, Service Agreement, Lease Agreement,
// ...) - each one is just an acc_portal_kyc row tagged subcategory
// 'contract-docs', exactly like any other document type in the KYC document
// registry. acc_portal_templates.document_id references acc_portal_kyc.id,
// so picking one here is what fetchDefaultTemplate (ccTemplate.ts) then
// fetches/creates the one standard template for.
export interface ContractDocumentType {
  id: string;
  name: string;
  display_name: string;
}

// Existing rows in acc_portal_kyc predate a canonical casing for this
// subcategory - some were tagged 'Contract Docs', others 'contract-docs'.
// ilike (case-insensitive, no wildcards = exact match ignoring case) reads
// both without requiring a data migration; every row this module creates
// going forward writes the lowercase form so new data is at least consistent.
const CONTRACT_DOCS_SUBCATEGORY = 'contract-docs';

export async function fetchContractDocumentTypes(): Promise<ContractDocumentType[]> {
  const { data, error } = await supabase
    .from('acc_portal_kyc')
    .select('id, name, display_name')
    .ilike('subcategory', CONTRACT_DOCS_SUBCATEGORY)
    .order('display_name', { ascending: true });

  if (error) {
    console.error('Error fetching contract document types:', error);
    return [];
  }
  return (data || []) as ContractDocumentType[];
}

export async function createContractDocumentType(name: string): Promise<ContractDocumentType | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase
    .from('acc_portal_kyc')
    .insert([{
      name: trimmed,
      display_name: trimmed,
      category: 'company-docs',
      subcategory: CONTRACT_DOCS_SUBCATEGORY,
      main_category: trimmed,
    }])
    .select('id, name, display_name')
    .single();

  if (error) {
    console.error('Error creating contract document type:', error);
    return null;
  }
  return data as ContractDocumentType;
}
