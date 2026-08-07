// @ts-nocheck
// Download helpers for existing (uploaded or builder-generated) letterhead
// .docx records - used by every card on the Letterheads page, not just newly
// built ones. Word is a straight passthrough of the stored file; PDF goes
// through mammoth -> the browser's native print pipeline (see
// utils/printExport.ts), the same real-vector-text approach the
// employment-contracts module uses instead of rasterizing with html2canvas.
// Known limitation: mammoth does not render real Word header/footer sections,
// so an uploaded letterhead whose branding lives in true header/footer XML
// (rather than floating body images) will print with no header image - this
// matches the equivalent limitation already accepted elsewhere.
import { supabase } from '@/lib/supabase/client';
import { saveAs } from 'file-saver';
import * as mammoth from 'mammoth';
import { printHtmlAsPdf } from './printExport';

async function downloadFileBlob(filePath: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from('letterheads').download(filePath);
  if (error || !data) throw new Error('Failed to download letterhead file');
  return data;
}

export async function downloadLetterheadWord(filePath: string, fileName: string): Promise<void> {
  const blob = await downloadFileBlob(filePath);
  saveAs(blob, fileName);
}

export async function downloadLetterheadPdf(filePath: string, fileName: string): Promise<void> {
  const blob = await downloadFileBlob(filePath);
  const arrayBuffer = await blob.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  await printHtmlAsPdf(result.value);
}
