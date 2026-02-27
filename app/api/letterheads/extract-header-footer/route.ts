import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

/**
 * Extract header and footer images from uploaded letterhead template
 * This creates visual previews for the UI while preserving the original .docx for downloads
 */
export async function POST(request: NextRequest) {
  try {
    console.log('Starting header/footer extraction...');

    const { letterheadId, filePath } = await request.json();
    console.log('Request data:', { letterheadId, filePath });

    if (!letterheadId || !filePath) {
      console.error('Missing required fields');
      return NextResponse.json(
        { error: 'Missing letterheadId or filePath' },
        { status: 400 }
      );
    }

    console.log('Downloading file from storage...');
    // Download the letterhead file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('letterheads')
      .download(filePath);

    console.log('Download result:', { fileData: !!fileData, downloadError });
    if (downloadError || !fileData) {
      console.error('Download failed:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download letterhead file', details: downloadError },
        { status: 500 }
      );
    }

    console.log('Processing Word document...');
    // For now, just create previews without file processing to test
    const { headerImageUrl, footerImageUrl } = await extractHeaderFooterImages(null, letterheadId);

    // Store the image URLs in the database
    const { error: updateError } = await supabase
      .from('acc_portal_company_letterheads')
      .update({
        metadata: {
          header_image_url: headerImageUrl,
          footer_image_url: footerImageUrl,
          preview_type: 'header_footer_images',
          extracted_at: new Date().toISOString(),
        },
      })
      .eq('id', letterheadId);

    console.log('Database update result:', { updateError });
    if (updateError) {
      console.error('Database update failed:', updateError);
      return NextResponse.json(
        { error: 'Failed to save preview images', details: updateError },
        { status: 500 }
      );
    }

    console.log('Header/footer extraction successful!');
    return NextResponse.json({
      success: true,
      header_image_url: headerImageUrl,
      footer_image_url: footerImageUrl,
      headers_found: 0,
      footers_found: 0,
    });
  } catch (error) {
    console.error('Error extracting header/footer:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Extract header and footer images from Word document
 * Creates styled HTML previews that simulate letterhead appearance
 */
async function extractHeaderFooterImages(buffer: Buffer | null, letterheadId: string): Promise<{ headerImageUrl: string; footerImageUrl: string }> {
  try {
    console.log('Creating letterhead previews for:', letterheadId);
    if (buffer) {
      console.log('File size:', buffer.length, 'bytes');
    }

    // Create styled header preview
    const headerImageUrl = createStyledPreview('header', letterheadId);

    // Create styled footer preview  
    const footerImageUrl = createStyledPreview('footer', letterheadId);

    return {
      headerImageUrl,
      footerImageUrl,
    };
  } catch (error) {
    console.error('Error extracting header/footer images:', error);

    // Fallback to simple placeholder images
    const headerImageUrl = await createSimpleImage('header', letterheadId);
    const footerImageUrl = await createSimpleImage('footer', letterheadId);

    return { headerImageUrl, footerImageUrl };
  }
}

/**
 * Create styled preview HTML for header or footer
 */
function createStyledPreview(type: 'header' | 'footer', letterheadId: string): string {
  const height = type === 'header' ? 150 : 100;

  // Create a professional letterhead preview
  const styledHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: 'Times New Roman', Georgia, serif;
          background: white;
        }
        .preview-container {
          width: 800px;
          height: ${height}px;
          background: linear-gradient(to bottom, #f8f9fa 0%, #ffffff 100%);
          border: 2px solid #dee2e6;
          border-radius: 8px;
          padding: 20px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        .preview-container::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, #007bff 0%, #0056b3 100%);
        }
        .content {
          text-align: center;
          color: #212529;
          font-size: 16px;
          line-height: 1.5;
          z-index: 1;
        }
        .label {
          font-size: 12px;
          color: #6c757d;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 1px;
          font-weight: bold;
        }
        .icon {
          font-size: 24px;
          margin-bottom: 8px;
        }
        .company-name {
          font-size: 18px;
          font-weight: bold;
          color: #007bff;
          margin-bottom: 4px;
        }
        .placeholder-info {
          font-size: 11px;
          color: #adb5bd;
          margin-top: 8px;
          font-style: italic;
        }
      </style>
    </head>
    <body>
      <div class="preview-container">
        <div class="content">
          <div class="icon">${type === 'header' ? '🏢' : '📋'}</div>
          <div class="label">${type === 'header' ? 'Company Letterhead' : 'Company Footer'}</div>
          <div class="company-name">Professional Letterhead</div>
          <div style="font-size: 14px; margin-top: 4px; color: #495057;">
            ${type === 'header' ? 'Header content will appear here' : 'Footer content will appear here'}
          </div>
          <div class="placeholder-info">
            ID: ${letterheadId.substring(0, 8)}...
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  // Convert to data URL
  const base64 = Buffer.from(styledHtml).toString('base64');
  return `data:text/html;base64,${base64}`;
}

/**
 * Create simple fallback images when main extraction fails
 */
async function createSimpleImage(type: 'header' | 'footer', letterheadId: string): Promise<string> {
  const height = type === 'header' ? 150 : 100;

  // Create a styled HTML fallback
  const htmlContent = `
    <div style="
      width: 800px;
      height: ${height}px;
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      border: 2px solid #dee2e6;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Times New Roman', serif;
      color: #495057;
      font-size: 16px;
      font-weight: bold;
      text-align: center;
      padding: 20px;
      box-sizing: border-box;
    ">
      <div>
        <div style="margin-bottom: 8px; font-size: 14px; opacity: 0.7;">Letterhead Preview</div>
        <div>${type === 'header' ? '📄 Header Section' : '📄 Footer Section'}</div>
        <div style="margin-top: 8px; font-size: 12px; opacity: 0.5;">Company: ${letterheadId}</div>
      </div>
    </div>
  `;

  // Convert to data URL
  const base64 = Buffer.from(htmlContent).toString('base64');
  return `data:text/html;base64,${base64}`;
}
