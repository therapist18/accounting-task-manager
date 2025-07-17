import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'KYC ID is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('acc_portal_kyc')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching KYC document:', error);
      return NextResponse.json(
        { error: 'Failed to fetch KYC document' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'KYC document not found' },
        { status: 404 }
      );
    }

    // Transform the fields to match the expected format
    const fields = data.fields?.map((field: any) => ({
      id: field.id || `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: field.name || field.fieldName || '',
      type: field.type || 'text',
      isRequired: field.isRequired || field.required || false,
      description: field.description || '',
      ...(field.arrayConfig && {
        arrayConfig: {
          ...field.arrayConfig,
          fields: field.arrayConfig.fields?.map((subField: any) => ({
            id: subField.id || `subfield-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: subField.name || subField.fieldName || '',
            type: subField.type || 'text',
            isRequired: subField.isRequired || subField.required || false,
          })) || []
        }
      })
    })) || [];

    return NextResponse.json({ fields });
  } catch (error) {
    console.error('Error in KYC fields API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
