import supabase from '@/lib/supabase/client';

// The "Employment Contract" document type in acc_portal_kyc (category =
// 'directors-docs', the individual-scoped half of that catalog - see
// bcl-registry's DocumentSidebar.tsx, which filters the same table by
// category). Filing the generated contract under this id makes it show up
// in the employee's own document list (acc_portal_directors_documents)
// alongside their other KYC documents, exactly the way Consultancy
// Contracts files its generated agreement under acc_portal_kyc_uploads via
// ACCOUNTANT_CONTRACT_DOCUMENT_ID (see ../../consultancy-contracts/utils/
// kycUpload.ts) - just the individual-scoped table instead of the
// company-scoped one, since a contract belongs to the employee.
//
// There's no migration for this: every other row in acc_portal_kyc
// (main_category/section ordering, department, etc.) was created through
// the Documents Settings admin UI (bcl-registry's /documents-settings), not
// SQL - add "Employment Contract" there under Director's Documents, then
// replace this placeholder with the row's real id.
export const EMPLOYMENT_CONTRACT_DOCUMENT_ID = '92a937db-1f0b-430f-8689-26192307f20b';

export interface SaveContractToIndividualResult {
  success: boolean;
  error?: string;
}

// Uploads the generated contract to the kyc-documents bucket and files it
// against the employee's registry record - same bucket/table
// individuals-documents.tsx, job-applicants and cv-generator already use for
// every other individual document, so the generated contract shows up
// wherever those do instead of living in a module-private table nothing
// else reads.
export function saveContractToIndividual(
  individualId: number,
  fileBlob: Blob,
  fileLabel: string
): Promise<SaveContractToIndividualResult> {
  return saveDocumentToIndividual(individualId, EMPLOYMENT_CONTRACT_DOCUMENT_ID, fileBlob, fileLabel);
}

// Same filing for any individual-scoped document type - employment letters
// file under their own letter type's acc_portal_kyc id (letterDocumentTypes.ts).
export async function saveDocumentToIndividual(
  individualId: number,
  documentId: string,
  fileBlob: Blob,
  fileLabel: string
): Promise<SaveContractToIndividualResult> {
  try {
    const filePath = `individual-documents/${individualId}/${documentId}/${Date.now()}_${fileLabel}.doc`;
    const { error: uploadError } = await supabase.storage
      .from('kyc-documents')
      .upload(filePath, fileBlob, { contentType: fileBlob.type });
    if (uploadError) return { success: false, error: uploadError.message };

    // Matches cv-generator/page.tsx's upsert shape/onConflict for this same
    // table - one row per (director_id, file_path), so re-generating with
    // an identical path (it won't be, Date.now() varies, but kept for
    // parity) updates rather than duplicates.
    const { error: upsertError } = await supabase.from('acc_portal_directors_documents').upsert({
      director_id: individualId,
      document_id: documentId,
      file_path: filePath,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'director_id,file_path' });
    if (upsertError) return { success: false, error: upsertError.message };

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to file the generated document against the employee record' };
  }
}
