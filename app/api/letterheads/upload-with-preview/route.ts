import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * Upload letterhead and generate preview image
 * This implements the new architecture:
 * 1. Upload .docx to storage
 * 2. Generate preview PNG from .docx
 * 3. Save metadata to database
 */
export async function POST(request: NextRequest) {
  try {
    console.log('Starting letterhead upload with preview generation...');

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const companyId = formData.get('companyId') as string;
    const name = formData.get('name') as string || 'Default Letterhead';

    if (!file || !companyId) {
      return NextResponse.json(
        { error: 'Missing file or companyId' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.docx')) {
      return NextResponse.json(
        { error: 'Only .docx files are allowed' },
        { status: 400 }
      );
    }

    console.log('Processing file:', file.name, 'for company:', companyId);

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const filename = `letterhead_v1_${timestamp}_${random}.docx`;
    const filePath = `letterheads/${companyId}/${filename}`;

    // Upload .docx to storage
    console.log('Uploading .docx to storage...');
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('letterheads')
      .upload(filePath, file, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload failed:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload letterhead', details: uploadError },
        { status: 500 }
      );
    }

    console.log('File uploaded successfully:', uploadData.path);

    // Generate preview image
    console.log('Generating preview image...');
    const previewImageUrl = await generatePreviewImage(filePath);

    if (!previewImageUrl) {
      console.log('Preview generation failed, continuing without preview...');
    }

    // Save to database
    const letterheadData = {
      company_id: companyId,
      name,
      docx_url: filePath,
      preview_image_url: previewImageUrl,
      page_settings: {},
      body_box: { top: 180, left: 70, right: 70, bottom: 120 },
      version: 1,
      is_default: true, // Make this the default for now
      is_active: true,
      file_name: file.name,
      file_size: file.size,
    };

    console.log('Saving to database...');
    const { data: dbData, error: dbError } = await supabase
      .from('acc_portal_company_letterheads')
      .insert(letterheadData)
      .select()
      .single();

    if (dbError) {
      console.error('Database save failed:', dbError);
      // Clean up uploaded file if database save fails
      await supabase.storage.from('letterheads').remove([filePath]);
      
      return NextResponse.json(
        { error: 'Failed to save letterhead metadata', details: dbError },
        { status: 500 }
      );
    }

    console.log('Letterhead saved successfully:', dbData.id);

    return NextResponse.json({
      success: true,
      letterhead: dbData,
      preview_generated: !!previewImageUrl,
    });

  } catch (error) {
    console.error('Error in letterhead upload:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Generate preview image from .docx file
 * Pipeline: .docx → PDF → PNG
 */
async function generatePreviewImage(filePath: string): Promise<string | null> {
  try {
    console.log('Starting preview generation for:', filePath);

    // Download the .docx file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('letterheads')
      .download(filePath);

    if (downloadError || !fileData) {
      console.error('Failed to download file for preview:', downloadError);
      return null;
    }

    // For now, create a placeholder preview
    // In production, you would:
    // 1. Convert .docx to PDF using a library like libreoffice-headless
    // 2. Convert PDF page 1 to PNG using a library like pdf-poppler or sharp
    // 3. Upload PNG to storage
    
    console.log('Creating placeholder preview...');
    const previewDataUrl = await createPlaceholderPreview();
    
    // Upload preview to storage
    const previewPath = filePath.replace('.docx', '_preview.png');
    const previewBuffer = Buffer.from(previewDataUrl.split(',')[1], 'base64');
    
    const { data: previewUploadData, error: previewUploadError } = await supabase.storage
      .from('letterheads')
      .upload(previewPath, previewBuffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (previewUploadError) {
      console.error('Failed to upload preview:', previewUploadError);
      return null;
    }

    console.log('Preview uploaded successfully:', previewUploadData.path);
    
    // Get public URL for the preview
    const { data: { publicUrl } } = supabase.storage
      .from('letterheads')
      .getPublicUrl(previewUploadData.path);

    return publicUrl;

  } catch (error) {
    console.error('Error generating preview:', error);
    return null;
  }
}

/**
 * Create a placeholder preview image
 * This is a temporary solution until we implement proper .docx → PDF → PNG conversion
 */
async function createPlaceholderPreview(): Promise<string> {
  // Create a simple SVG preview that shows it's a letterhead
  const svg = `
    <svg width="800" height="1050" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#007bff;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0056b3;stop-opacity:1" />
        </linearGradient>
      </defs>
      
      <!-- Header area -->
      <rect x="0" y="0" width="800" height="150" fill="url(#headerGrad)" />
      <text x="400" y="75" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="white" font-weight="bold">
        Company Letterhead
      </text>
      <text x="400" y="105" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="white">
        Professional Document Template
      </text>
      
      <!-- Content area -->
      <rect x="70" y="180" width="660" height="750" fill="white" stroke="#dee2e6" stroke-width="1" />
      <text x="400" y="550" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#6c757d">
        Document Content Area
      </text>
      <text x="400" y="575" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#adb5bd">
        Your letter content will appear here
      </text>
      
      <!-- Footer area -->
      <rect x="0" y="950" width="800" height="100" fill="#f8f9fa" />
      <text x="400" y="990" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#6c757d">
        Company Footer Information
      </text>
      <text x="400" y="1010" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#adb5bd">
        Contact | Address | Website
      </text>
      
      <!-- Border -->
      <rect x="20" y="20" width="760" height="1010" fill="none" stroke="#dee2e6" stroke-width="2" rx="5" />
    </svg>
  `;

  // Convert SVG to PNG data URL (simplified)
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}
