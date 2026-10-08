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
  fileLabel: string,
  extension: 'pdf' | 'doc' = 'pdf'
): Promise<SaveContractToIndividualResult> {
  return saveDocumentToIndividual(individualId, EMPLOYMENT_CONTRACT_DOCUMENT_ID, fileBlob, fileLabel, extension);
}

// Same filing for any individual-scoped document type - employment letters
// file under their own letter type's acc_portal_kyc id (letterDocumentTypes.ts).
// PDF by default (server-rendered, see renderPdfBlob in
// lib/documentExport.ts); 'doc' only for the Word fallback when PDF
// rendering is unavailable.
export async function saveDocumentToIndividual(
  individualId: number,
  documentId: string,
  fileBlob: Blob,
  fileLabel: string,
  extension: 'pdf' | 'doc' = 'pdf'
): Promise<SaveContractToIndividualResult> {
  try {
    const filePath = `individual-documents/${individualId}/${documentId}/${Date.now()}_${fileLabel}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('kyc-documents')
      .upload(filePath, fileBlob, { contentType: fileBlob.type });
    if (uploadError) return { success: false, error: uploadError.message };

    // One row per (document_id, director_id): the table is read everywhere
    // as "this person's <document type>", so the write is keyed the same
    // way - if a row already exists for this person + document type,
    // re-generating updates that row to point at the new file (latest
    // content wins) instead of appending another copy. Select-then-write
    // rather than an ON CONFLICT upsert because this table is owned by the
    // external registry app: there's no guarantee a unique constraint on
    // (director_id, document_id) exists there for upsert to target.
    //
    // Every existing row for the pair is repointed (they can only be past
    // generations of this same generated document - historical rows from
    // before this one-row-per-doc behaviour), so no reader can still pick
    // up a stale file. The old blobs stay in the bucket untouched.
    //
    // acc_portal_directors_documents has no status column - selecting or
    // writing one fails the whole request with a 400.
    const now = new Date().toISOString();
    const { data: existingRows, error: selectError } = await supabase
      .from('acc_portal_directors_documents')
      .select('id')
      .eq('director_id', individualId)
      .eq('document_id', documentId);
    if (selectError) return { success: false, error: selectError.message };

    if (existingRows && existingRows.length > 0) {
      const { error: updateError } = await supabase
        .from('acc_portal_directors_documents')
        .update({
          file_path: filePath,
          updated_at: now,
        })
        .in('id', existingRows.map((r: any) => r.id));
      if (updateError) return { success: false, error: updateError.message };
    } else {
      const { error: insertError } = await supabase.from('acc_portal_directors_documents').insert({
        director_id: individualId,
        document_id: documentId,
        file_path: filePath,
        created_at: now,
        updated_at: now,
      });
      if (insertError) return { success: false, error: insertError.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to file the generated document against the employee record' };
  }
}
