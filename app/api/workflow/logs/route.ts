// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const { individualId } = await request.json();

    if (!individualId) {
      return NextResponse.json(
        { error: 'Missing required field: individualId' },
        { status: 400 }
      );
    }

    // Fetch workflow logs using registry's table structure
    const { data, error } = await supabase
      .from('document_workflow_logs')
      .select('*')
      .eq('individual_id', individualId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Failed to fetch workflow logs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch workflow logs' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      data: data || []
    });

  } catch (error) {
    console.error('Error in workflow logs API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
