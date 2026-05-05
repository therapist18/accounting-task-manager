import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SIGNATURE_DOC_TYPE_ID = "67d9f93a-6b2b-4e19-86a3-ea7925c3d6ab";

export async function POST(request) {
  try {
    const { signatoryId, file, fileName, fileType } = await request.json();

    console.log('Request received:', { signatoryId, fileName, fileType });

    if (!signatoryId || !file || !fileName || !fileType) {
      console.log('Missing required fields:', { signatoryId, hasFile: !!file });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let base64Data;
    if (file.startsWith('data:')) {
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      base64Data = file.split(',')[1];
    } else {
      base64Data = file;
    }

    if (!base64Data) {
      return NextResponse.json({ error: 'Invalid file data' }, { status: 400 });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Generate file path following UploadModal pattern
    const timestamp = Date.now();

    // Normalize signatory name for path (similar to entityPathName in UploadModal)
    const signatoryPathName = signatoryId
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '');

    // Document type folder structure
    const documentTypeFolder = 'signature_documents';
    const documentTypeId = SIGNATURE_DOC_TYPE_ID;

    // Generate file path following UploadModal pattern: individual-documents/{entity}/{documentType}/{fileName}
    const filePath = `individual-documents/${signatoryPathName}/${documentTypeId}/${fileName}`;

    // Upload to Supabase storage
    console.log('Uploading to storage:', { filePath, fileType, bufferSize: buffer.length });

    // Check if file size is reasonable (max 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
    if (buffer.length > MAX_FILE_SIZE) {
      console.error('File too large:', { size: buffer.length, maxSize: MAX_FILE_SIZE });
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
    }

    // Validate file type (handle both direct type and data URL MIME types)
    const normalizedFileType = fileType.toLowerCase();
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

    // Extract MIME type from data URL if needed
    let actualMimeType = normalizedFileType;
    if (normalizedFileType.startsWith('data:')) {
      const mimeTypeMatch = normalizedFileType.match(/data:([^;]+)/);
      if (mimeTypeMatch) {
        actualMimeType = mimeTypeMatch[1].toLowerCase();
      }
    }

    if (!allowedTypes.includes(actualMimeType)) {
      console.error('Invalid file type:', { fileType, actualMimeType, allowedTypes });
      return NextResponse.json({
        error: 'Invalid file type. Only PNG, JPG, GIF, and WebP images are allowed.',
        details: `Detected type: ${actualMimeType}`
      }, { status: 400 });
    }

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('kyc-documents')
      .upload(filePath, buffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: actualMimeType
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      console.error('Storage error details:', {
        message: uploadError.message,
        details: uploadError.details,
        hint: uploadError.hint,
        code: uploadError.code
      });
      console.error('Upload attempt details:', {
        filePath,
        fileSize: buffer.length,
        fileType,
        bucket: 'kyc-documents'
      });
      return NextResponse.json({
        error: 'Failed to upload file to storage',
        details: uploadError.message
      }, { status: 500 });
    }

    console.log('Storage upload successful:', { uploadData });

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('kyc-documents')
      .getPublicUrl(filePath);

    // Insert or update document record
    console.log('Attempting to save document record:', {
      director_id: signatoryId,
      document_id: SIGNATURE_DOC_TYPE_ID,
      file_path: filePath
    });

    // First try to find existing record
    const { data: existingRecord, error: findError } = await supabase
      .from('acc_portal_directors_documents')
      .select('*')
      .eq('director_id', signatoryId)
      .eq('document_id', SIGNATURE_DOC_TYPE_ID)
      .single();

    let docData, docError;

    if (existingRecord) {
      // Update existing record
      const { data, error } = await supabase
        .from('acc_portal_directors_documents')
        .update({
          file_path: filePath,
          created_at: new Date().toISOString()
        })
        .eq('id', existingRecord.id)
        .select()
        .single();

      docData = data;
      docError = error;
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from('acc_portal_directors_documents')
        .insert({
          director_id: signatoryId,
          document_id: SIGNATURE_DOC_TYPE_ID,
          file_path: filePath,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      docData = data;
      docError = error;
    }

    if (docError) {
      console.error('Database insert error:', docError);
      console.error('Error details:', {
        message: docError.message,
        details: docError.details,
        hint: docError.hint,
        code: docError.code
      });
      return NextResponse.json({
        error: 'Failed to save document record',
        details: docError.message
      }, { status: 500 });
    }

    console.log('Document record saved successfully:', { docData });

    return NextResponse.json({
      success: true,
      documentId: docData.id,
      fileUrl: publicUrl,
      filePath: filePath
    });

  } catch (error) {
    console.error('Signature upload error:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
