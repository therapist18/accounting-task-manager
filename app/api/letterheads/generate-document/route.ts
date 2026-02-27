import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

/**
 * Generate document with letterhead and content
 * Downloads the original .docx, merges content, and returns the result
 */
export async function POST(request: NextRequest) {
  console.log('🚀 Document generation API called');

  try {
    console.log('📥 Parsing request body...');
    const { letterheadId, content, format } = await request.json();

    console.log('📋 Request details:', {
      letterheadId,
      format,
      contentLength: content?.length,
      contentPreview: content?.substring(0, 100) + (content?.length > 100 ? '...' : '')
    });

    if (!letterheadId || !content || !format) {
      console.log('❌ Validation failed:', {
        hasLetterheadId: !!letterheadId,
        hasContent: !!content,
        hasFormat: !!format
      });

      return NextResponse.json(
        { error: 'Missing letterheadId, content, or format' },
        { status: 400 }
      );
    }

    if (!['docx', 'pdf'].includes(format)) {
      console.log('❌ Invalid format:', format);
      return NextResponse.json(
        { error: 'Format must be docx or pdf' },
        { status: 400 }
      );
    }

    console.log('🔍 Fetching letterhead from database...');
    // Fetch letterhead from database
    const { data: letterhead, error: fetchError } = await supabase
      .from('acc_portal_company_letterheads')
      .select('*')
      .eq('id', letterheadId)
      .single();

    if (fetchError || !letterhead) {
      console.error('❌ Database fetch failed:', fetchError);
      return NextResponse.json(
        { error: 'Letterhead not found', details: fetchError },
        { status: 404 }
      );
    }

    console.log('✅ Letterhead found:', {
      id: letterhead.id,
      name: letterhead.name,
      hasDocxUrl: !!letterhead.docx_url,
      hasPreviewUrl: !!letterhead.preview_image_url,
      bodyBox: letterhead.body_box
    });

    console.log('📁 Downloading .docx file from storage...');
    // Download the original .docx file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('letterheads')
      .download(letterhead.docx_url);

    if (downloadError || !fileData) {
      console.error('❌ File download failed:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download letterhead file', details: downloadError },
        { status: 500 }
      );
    }

    console.log('✅ File downloaded successfully:', {
      size: fileData.size,
      type: fileData.type,
      url: letterhead.docx_url
    });

    console.log('📄 Processing document template...');
    // Process the document
    const buffer = Buffer.from(await fileData.arrayBuffer());
    console.log('📦 Buffer created:', { size: buffer.length });

    const zip = new PizZip(buffer);
    console.log('🗜️ PizZip initialized');

    // Create a new document with merged content
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    console.log('📝 Docxtemplater initialized');

    // Replace {{BODY}} placeholder with actual content
    // First, check if the template uses {{BODY}} or just BODY
    let templateContent = doc.getFullText();
    console.log('🔍 Template content analysis:', {
      totalLength: templateContent.length,
      hasBodyPlaceholder: templateContent.includes('{{BODY}}') || templateContent.includes('BODY'),
      hasBraceBody: templateContent.includes('{{BODY}}'),
      hasPlainBody: templateContent.includes('BODY')
    });

    let hasBodyPlaceholder = templateContent.includes('{{BODY}}') || templateContent.includes('BODY');

    if (hasBodyPlaceholder) {
      console.log('🔄 Replacing BODY placeholder...');
      // Replace the placeholder
      doc.setData({
        BODY: content,
      });
      doc.render();
      console.log('✅ Template rendered successfully');
    } else {
      // If no placeholder, we'll need to insert content
      console.log('⚠️ No BODY placeholder found, creating simple document');

      // Create a simple document structure
      const simpleContent = `
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p>
              <w:r>
                <w:t>${content.replace(/\n/g, '</w:t></w:r></w:p><w:p><w:r><w:t>')}</w:t>
              </w:r>
            </w:p>
          </w:body>
        </w:document>
      `;

      // This is a simplified approach - in production you'd want more sophisticated handling
      console.log('📝 Using fallback template rendering');
      doc.setData({ BODY: content });
      doc.render();
    }

    // Get the generated document
    const generatedBuffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    console.log('✅ Document generated successfully:', {
      originalSize: buffer.length,
      generatedSize: generatedBuffer.length,
      compression: generatedBuffer.length < buffer.length ? 'compressed' : 'expanded'
    });

    // Convert Buffer to Uint8Array for NextResponse
    const uint8Array = new Uint8Array(generatedBuffer);

    // Return as DOCX
    if (format === 'docx') {
      return new NextResponse(uint8Array, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="letter.docx"`,
        },
      });
    }

    // For PDF, we'd need to convert DOCX to PDF
    // For now, return the DOCX with a note
    console.log('PDF conversion not implemented yet, returning DOCX');
    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="letter.pdf"`,
        'X-Note': 'PDF conversion not implemented - returning DOCX format',
      },
    });

  } catch (error) {
    console.error('Error generating document:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
