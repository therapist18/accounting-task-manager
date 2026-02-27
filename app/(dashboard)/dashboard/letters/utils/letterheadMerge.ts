import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { supabase } from '@/lib/supabase/client';

export interface LetterContent {
  body: string;
  recipient?: string;
  subject?: string;
  date?: string;
  reference?: string;
  salutation?: string;
  valediction?: string;
  signatory?: {
    name: string;
    title?: string;
    signature?: string;
  };
}

/**
 * Downloads a letterhead template from Supabase Storage
 */
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

/**
 * Merges letter content into a letterhead template
 * The template should have placeholders like {{BODY}}, {{RECIPIENT}}, etc.
 */
export async function mergeLetterWithLetterhead(
  letterheadArrayBuffer: ArrayBuffer,
  content: LetterContent
): Promise<Blob | null> {
  try {
    const zip = new PizZip(letterheadArrayBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
    });

    // Prepare data for template
    const templateData = {
      BODY: content.body || '',
      RECIPIENT: content.recipient || '',
      SUBJECT: content.subject || '',
      DATE: content.date || new Date().toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      }),
      REFERENCE: content.reference || '',
      SALUTATION: content.salutation || 'Dear Sir/Madam,',
      VALEDICTION: content.valediction || 'Yours faithfully,',
      SIGNATORY_NAME: content.signatory?.name || '',
      SIGNATORY_TITLE: content.signatory?.title || '',
    };

    // Render the document
    doc.render(templateData);

    // Generate the merged document
    const output = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    return output;
  } catch (error) {
    console.error('Error merging letter with letterhead:', error);
    return null;
  }
}

/**
 * Complete workflow: Download letterhead, merge content, return blob
 */
export async function generateLetterWithLetterhead(
  letterheadFilePath: string,
  content: LetterContent
): Promise<Blob | null> {
  try {
    // Download the letterhead template
    const letterheadBuffer = await downloadLetterheadTemplate(letterheadFilePath);
    if (!letterheadBuffer) {
      throw new Error('Failed to download letterhead template');
    }

    // Merge content with template
    const mergedDocument = await mergeLetterWithLetterhead(letterheadBuffer, content);
    if (!mergedDocument) {
      throw new Error('Failed to merge letter with letterhead');
    }

    return mergedDocument;
  } catch (error) {
    console.error('Error in generateLetterWithLetterhead:', error);
    return null;
  }
}

/**
 * Convert Word document blob to PDF (requires backend conversion)
 * This is a placeholder - you'll need a backend service for actual conversion
 */
export async function convertDocxToPdf(docxBlob: Blob): Promise<Blob | null> {
  try {
    // Option 1: Use a backend API endpoint for conversion
    const formData = new FormData();
    formData.append('file', docxBlob, 'document.docx');

    const response = await fetch('/api/convert-to-pdf', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('PDF conversion failed');
    }

    return await response.blob();
  } catch (error) {
    console.error('Error converting to PDF:', error);
    // Fallback: return the docx blob if conversion fails
    return null;
  }
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
