import supabase from '@/lib/supabase/client';
import { buildWordDocBlob } from '@/lib/documentExport';

// The "Accountant Contract" document type in acc_portal_kyc - filing the
// generated contract under this id makes it show up in the company profile
// alongside the client's other KYC/compliance documents.
export const ACCOUNTANT_CONTRACT_DOCUMENT_ID = 'dcdd687b-5fd3-4bf5-a4c5-3156a562399d';

// Same bucket/path convention as tasks/components/FileUploadComponent.tsx's
// uploadFileToStorage (company-document branch) - kept consistent so this
// file sits alongside every other company document uploaded that way.
function normalizeCompanyName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export interface SaveToProfileResult {
  success: boolean;
  error?: string;
}

// Renders the contract to a Word (.doc) Blob and files it as a company KYC
// upload. Word, not PDF, because printElementAsPdf only drives the browser's
// native "Save as PDF" print dialog (no Blob it can hand back) - Word export
// is the only path here that produces a real file without a user-completed
// save dialog in the middle.
export async function saveContractToProfile(
  companyId: string | number,
  companyName: string,
  renderedHtml: string
): Promise<SaveToProfileResult> {
  try {
    const { data: docType } = await supabase
      .from('acc_portal_kyc')
      .select('name')
      .eq('id', ACCOUNTANT_CONTRACT_DOCUMENT_ID)
      .maybeSingle();
    const docName = docType?.name || 'Accountant Contract';

    const blob = buildWordDocBlob({ html: renderedHtml, title: `Consultancy Agreement - ${companyName}` });
    const normalizedCompanyName = normalizeCompanyName(companyName);
    const timestamp = Date.now();
    const filePath = `company-documents/${normalizedCompanyName}/${docName}/${timestamp}.doc`;

    const { error: uploadError } = await supabase.storage
      .from('kyc-documents')
      .upload(filePath, blob, { contentType: 'application/msword' });
    if (uploadError) return { success: false, error: uploadError.message };

    const { error: insertError } = await supabase.from('acc_portal_kyc_uploads').insert({
      company_id: companyId,
      kyc_document_id: ACCOUNTANT_CONTRACT_DOCUMENT_ID,
      document_id: ACCOUNTANT_CONTRACT_DOCUMENT_ID,
      file_path: filePath,
      status: 'active',
      document_type: 'upload',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (insertError) return { success: false, error: insertError.message };

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save contract to profile' };
  }
}
