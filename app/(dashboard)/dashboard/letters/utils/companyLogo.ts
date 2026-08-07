import { supabase } from '@/lib/supabase/client';

// The "Company Logo" KYC document type - uploaded once per company via the
// normal KYC upload flow, reused here as the letterhead builder's optional
// "use existing company logo" source instead of asking users to re-upload.
const COMPANY_LOGO_DOCUMENT_ID = 'f7a75607-bff9-4995-8bde-0256e86da435';

export async function fetchCompanyLogoUrl(companyId: number | string): Promise<string | null> {
  const { data, error } = await supabase
    .from('acc_portal_kyc_uploads')
    .select('file_path')
    .eq('company_id', companyId)
    .eq('document_id', COMPANY_LOGO_DOCUMENT_ID)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.file_path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${data.file_path}`;
}
