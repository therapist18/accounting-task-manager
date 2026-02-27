import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import * as mammoth from 'mammoth';

/**
 * Generate a preview image from a letterhead .docx file
 * This endpoint converts the first page of the letterhead to HTML,
 * which can then be rendered as a preview in the UI
 */
export async function POST(request: NextRequest) {
  try {
    console.log('Starting preview generation...');

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

    console.log('Converting to Buffer...');
    // Convert to Buffer first, then to ArrayBuffer
    const buffer = Buffer.from(await fileData.arrayBuffer());
    console.log('Buffer size:', buffer.length);

    console.log('Converting to HTML with mammoth...');
    // Convert Word document to HTML using mammoth
    const result = await mammoth.convertToHtml({ buffer });
    console.log('Mammoth result length:', result.value?.length);
    console.log('Mammoth messages:', result.messages);

    console.log('Updating database with preview...');
    // Store the HTML preview in the database
    const { error: updateError } = await supabase
      .from('acc_portal_company_letterheads')
      .update({
        metadata: {
          preview_html: result.value,
          preview_generated_at: new Date().toISOString(),
        },
      })
      .eq('id', letterheadId);

    console.log('Database update result:', { updateError });
    if (updateError) {
      console.error('Database update failed:', updateError);
      return NextResponse.json(
        { error: 'Failed to save preview', details: updateError },
        { status: 500 }
      );
    }

    console.log('Preview generation successful!');
    return NextResponse.json({
      success: true,
      preview_html: result.value,
    });
  } catch (error) {
    console.error('Error generating preview:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
