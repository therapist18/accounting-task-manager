import { supabase } from '@/lib/supabase/client';

export interface LetterheadFile {
  id: string;
  company_id: number;
  name: string;
  file_path: string;
  file_name: string;
  contact_details?: {
    phone?: string;
    email?: string;
    address?: string;
    website?: string;
  };
}

export async function getLetterheadFile(letterheadId: string): Promise<Blob | null> {
  try {
    const { data: letterhead, error: fetchError } = await supabase
      .from('acc_portal_company_letterheads')
      .select('file_path')
      .eq('id', letterheadId)
      .single();

    if (fetchError || !letterhead) {
      console.error('Error fetching letterhead:', fetchError);
      return null;
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('company-documents')
      .download(letterhead.file_path);

    if (downloadError || !fileData) {
      console.error('Error downloading letterhead file:', downloadError);
      return null;
    }

    return fileData;
  } catch (error) {
    console.error('Error in getLetterheadFile:', error);
    return null;
  }
}

export async function getLetterheadUrl(letterheadId: string): Promise<string | null> {
  try {
    const { data: letterhead, error } = await supabase
      .from('acc_portal_company_letterheads')
      .select('file_path')
      .eq('id', letterheadId)
      .single();

    if (error || !letterhead) {
      console.error('Error fetching letterhead:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('company-documents')
      .getPublicUrl(letterhead.file_path);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Error in getLetterheadUrl:', error);
    return null;
  }
}

export async function downloadLetterhead(letterheadId: string, fileName?: string): Promise<void> {
  const fileBlob = await getLetterheadFile(letterheadId);
  
  if (!fileBlob) {
    throw new Error('Failed to download letterhead file');
  }

  const url = window.URL.createObjectURL(fileBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'letterhead.docx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
