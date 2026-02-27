import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('company_id');

    let query = supabase
      .from('acc_portal_company_letterheads')
      .select('*')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching letterheads:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in letterheads GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { company_id, name, description, file_path, file_name, file_size, contact_details, is_default, metadata } = body;

    if (!company_id || !name || !file_path || !file_name) {
      return NextResponse.json(
        { error: 'Missing required fields: company_id, name, file_path, file_name' },
        { status: 400 }
      );
    }

    if (is_default) {
      const { error: updateError } = await supabase
        .from('acc_portal_company_letterheads')
        .update({ is_default: false })
        .eq('company_id', company_id)
        .eq('is_default', true);

      if (updateError) {
        console.error('Error updating default letterhead:', updateError);
      }
    }

    const { data, error } = await supabase
      .from('acc_portal_company_letterheads')
      .insert({
        company_id,
        name,
        description,
        file_path,
        file_name,
        file_size,
        contact_details,
        is_default: is_default || false,
        metadata
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating letterhead:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in letterheads POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    const { id, company_id, name, description, contact_details, is_default, is_active, metadata } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    if (is_default && company_id) {
      const { error: updateError } = await supabase
        .from('acc_portal_company_letterheads')
        .update({ is_default: false })
        .eq('company_id', company_id)
        .eq('is_default', true)
        .neq('id', id);

      if (updateError) {
        console.error('Error updating default letterhead:', updateError);
      }
    }

    const updateData: any = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (contact_details !== undefined) updateData.contact_details = contact_details;
    if (is_default !== undefined) updateData.is_default = is_default;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (metadata !== undefined) updateData.metadata = metadata;

    const { data, error } = await supabase
      .from('acc_portal_company_letterheads')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating letterhead:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in letterheads PATCH:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('acc_portal_company_letterheads')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error deleting letterhead:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in letterheads DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
