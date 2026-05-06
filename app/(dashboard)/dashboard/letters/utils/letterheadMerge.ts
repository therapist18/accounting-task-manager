import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { supabase } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * All structured fields that can be injected into an uploaded .docx letterhead template.
 *
 * Add these placeholders to your .docx templates exactly as shown (double curly braces):
 *
 *   {{DATE}}             — letter date, e.g. "6 May 2026"
 *   {{RECIPIENT}}        — recipient block (may contain newlines)
 *   {{SUBJECT}}          — subject line, uppercased
 *   {{REFERENCE}}        — reference / PIN number
 *   {{SALUTATION}}       — e.g. "Dear Sir/Madam,"
 *   {{BODY}}             — main letter body paragraphs
 *   {{VALEDICTION}}      — e.g. "Yours faithfully,"
 *   {{SIGNATORY_NAME}}   — signatory full name, uppercased
 *   {{SIGNATORY_TITLE}}  — signatory position/title
 *
 * The template's own header and footer XML are NEVER touched — they remain exactly
 * as designed in the uploaded file. Only the body placeholder tokens are replaced.
 *
 * If a placeholder is absent from a template the nullGetter returns '' so it fails
 * silently rather than throwing.
 */
export interface LetterContent {
  DATE?: string;
  RECIPIENT?: string;
  SUBJECT?: string;
  REFERENCE?: string;
  SALUTATION?: string;
  BODY?: string;
  VALEDICTION?: string;
  SIGNATORY_NAME?: string;
  SIGNATORY_TITLE?: string;

  // Legacy support — keep BODY alias so old call sites still work
  body?: string;
  recipient?: string;
  subject?: string;
  date?: string;
  reference?: string;
  salutation?: string;
  valediction?: string;
  signatory?: { name?: string; title?: string };
}

// ─── Supabase download ────────────────────────────────────────────────────────

export async function downloadLetterheadTemplate(filePath: string): Promise<ArrayBuffer | null> {
  try {
    const { data: fileData, error } = await supabase.storage
      .from('letterheads')
      .download(filePath);

    if (error || !fileData) {
      console.error('Error downloading letterhead:', error);
      return null;
    }
    return await fileData.arrayBuffer();
  } catch (error) {
    console.error('Error in downloadLetterheadTemplate:', error);
    return null;
  }
}

// ─── Merge ────────────────────────────────────────────────────────────────────

/**
 * Merges structured letter content into a .docx letterhead template.
 *
 * Supports both the new structured field names (DATE, RECIPIENT, …) and
 * the legacy lowercase aliases (date, recipient, …) so existing call sites
 * continue to work without changes.
 *
 * The template's header/footer XML is preserved untouched — docxtemplater
 * only replaces {{PLACEHOLDER}} tokens it finds in the document body.
 */
export async function mergeLetterWithLetterhead(
  letterheadArrayBuffer: ArrayBuffer,
  content: LetterContent,
): Promise<Blob | null> {
  try {
    const zip = new PizZip(letterheadArrayBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,   // converts \n inside a value to actual line breaks
      nullGetter: () => '', // missing placeholders → empty string, not an error
    });

    const today = new Date().toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    // Build the template data object.
    // New structured keys take precedence; legacy aliases are fallbacks.
    const templateData: Record<string, string> = {
      // ── Structured fields (new call sites) ──────────────────────────
      DATE: content.DATE ?? content.date ?? today,
      RECIPIENT: content.RECIPIENT ?? content.recipient ?? '',
      SUBJECT: content.SUBJECT ?? (content.subject ?? '').toUpperCase() ?? '',
      REFERENCE: content.REFERENCE ?? content.reference ?? '',
      SALUTATION: content.SALUTATION ?? content.salutation ?? 'Dear Sir/Madam,',
      BODY: content.BODY ?? content.body ?? '',
      VALEDICTION: content.VALEDICTION ?? content.valediction ?? 'Yours faithfully,',
      SIGNATORY_NAME: content.SIGNATORY_NAME ?? content.signatory?.name ?? '',
      SIGNATORY_TITLE: content.SIGNATORY_TITLE ?? content.signatory?.title ?? '',
    };

    doc.render(templateData);

    return doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  } catch (error) {
    console.error('Error merging letter with letterhead:', error);
    return null;
  }
}

// ─── Complete workflow ────────────────────────────────────────────────────────

/**
 * Downloads the letterhead template from Supabase Storage and merges content into it.
 * The template's header and footer are preserved as-is.
 */
export async function generateLetterWithLetterhead(
  letterheadFilePath: string,
  content: LetterContent,
): Promise<Blob | null> {
  try {
    const letterheadBuffer = await downloadLetterheadTemplate(letterheadFilePath);
    if (!letterheadBuffer) throw new Error('Failed to download letterhead template');

    const mergedDocument = await mergeLetterWithLetterhead(letterheadBuffer, content);
    if (!mergedDocument) throw new Error('Failed to merge letter with letterhead');

    return mergedDocument;
  } catch (error) {
    console.error('Error in generateLetterWithLetterhead:', error);
    return null;
  }
}

// ─── PDF conversion (placeholder for future server-side approach) ─────────────

/**
 * NOT USED on Vercel (no LibreOffice available).
 * Kept here for future migration to a VPS or Gotenberg microservice.
 */
export async function convertDocxToPdf(docxBlob: Blob): Promise<Blob | null> {
  try {
    const formData = new FormData();
    formData.append('file', docxBlob, 'document.docx');
    const response = await fetch('/api/convert-to-pdf', { method: 'POST', body: formData });
    if (!response.ok) throw new Error('PDF conversion failed');
    return await response.blob();
  } catch (error) {
    console.error('Error converting to PDF:', error);
    return null;
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}