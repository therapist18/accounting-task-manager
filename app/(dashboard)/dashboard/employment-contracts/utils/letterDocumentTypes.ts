import supabase from '@/lib/supabase/client';
import type { ContractDocumentType } from '../../consultancy-contracts/utils/contractDocumentTypes';

// The set of employment letter "kinds" (Resignation Letter, Termination
// Letter, ...) letters/settings lets an admin switch between - each one is an
// acc_portal_kyc row in the Letters section of Director's Documents, exactly
// like the existing "Cancellation Letter" type in Documents Settings, so a
// generated letter files against the employee's registry record the same way
// any other individual document does (see registryDocumentUpload.ts).
// Mirrors consultancy-contracts' contractDocumentTypes.ts, which does the
// same for 'contract-docs'.
export type LetterDocumentType = ContractDocumentType;

// Copied from that existing Letters row rather than invented, so letter
// types created here sit in the same Documents Settings section as the ones
// created there. subcategory/main_category are matched case-insensitively on
// read (ilike, no wildcards) since rows created in the admin UI aren't
// guaranteed a canonical casing - see contractDocumentTypes.ts.
const LETTER_KYC_SPEC = {
  department: 'Directors',
  category: 'directors-docs',
  subcategory: 'employee-docs',
  main_category: 'Letters',
  main_category_number: 20,
  document_type: 'one-off',
  has_template: 'true',
  listed: false,
};

export async function fetchLetterDocumentTypes(): Promise<LetterDocumentType[]> {
  const { data, error } = await supabase
    .from('acc_portal_kyc')
    .select('id, name, display_name')
    .ilike('subcategory', LETTER_KYC_SPEC.subcategory)
    .ilike('main_category', LETTER_KYC_SPEC.main_category)
    .order('display_name', { ascending: true });

  if (error) {
    console.error('Error fetching letter document types:', error);
    return [];
  }
  return (data || []) as LetterDocumentType[];
}

export async function createLetterDocumentType(name: string): Promise<LetterDocumentType | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase
    .from('acc_portal_kyc')
    .insert([{ name: trimmed, display_name: trimmed, ...LETTER_KYC_SPEC }])
    .select('id, name, display_name')
    .single();

  if (error) {
    console.error('Error creating letter document type:', error);
    return null;
  }
  return data as LetterDocumentType;
}
