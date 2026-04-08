// Unified API endpoint for user management in accounting-task-manager
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const companyId = searchParams.get('companyId');
    const payrollAccess = searchParams.get('payrollAccess');
    const id = searchParams.get('id');

    let query = supabase.from('scanner_users').select('*');

    // Filter by role if specified
    if (role) {
      query = query.eq('role', role);
    }

    // Filter by company if specified
    if (companyId) {
      query = query.contains('company_ids', [parseInt(companyId)]);
    }

    // Filter by payroll access if specified
    if (payrollAccess !== null) {
      const hasPayrollAccess = payrollAccess === 'true';
      query = query.eq('payroll_access_enabled', hasPayrollAccess);
    }

    // Filter by specific ID if specified
    if (id) {
      query = query.eq('id', id);
    }

    // Order by first_name and last_name instead of display_name
    const { data, error } = await query.order('first_name').order('last_name');

    if (error) {
      console.error('Unified API Error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Transform data to match regisry project structure (camelCase)
    const transformedData = (data || []).map(user => ({
      id: user.id,
      firebaseUid: user.firebase_uid,
      payrollAccessEnabled: user.payroll_access_enabled,
      role: user.role,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      displayName: user.first_name && user.last_name
        ? `${user.first_name} ${user.last_name}`.trim()
        : user.first_name || user.last_name || user.username || 'Unknown',
      isActive: user.is_active,
      primaryCompanyId: user.company_id,
      companyIds: user.company_ids || [],
      hasAllCompanyAccess: user.company_ids?.includes("all") || false,
      isAdmin: user.role === 'company_admin' || user.role === 'general_admin',
      isSuperAdmin: false,
      clerkUserId: user.clerk_user_id,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLogin: user.last_login,
      hasPassword: Boolean(user.password && user.password.trim()),
      jobLevels: user.job_levels || []
    }));

    return NextResponse.json({
      success: true,
      data: transformedData,
      totalCount: transformedData.length,
      role: role || 'all',
      companyId: companyId || 'all',
      payrollAccess: payrollAccess
    });

  } catch (error) {
    console.error('Unified API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');

    // Prepare user data
    const userData = {
      username: body.username,
      email: body.email,
      first_name: body.firstName,
      last_name: body.lastName,
      role: role || body.role,
      is_active: body.isActive ?? true,
      company_ids: body.hasAllCompanyAccess ? ["all"] : body.companyIds || [],
      payroll_access_enabled: body.payrollAccessEnabled ?? true,
      job_levels: body.jobLevels || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      password: body.password || null
    };

    const { data, error } = await supabase
      .from('scanner_users')
      .insert([userData])
      .select()
      .single();

    if (error) {
      console.error('Unified API POST Error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Unified API POST Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const role = searchParams.get('role');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: any = {
      username: body.username,
      email: body.email,
      first_name: body.firstName,
      last_name: body.lastName,
      role: role || body.role,
      is_active: body.isActive,
      company_ids: body.hasAllCompanyAccess ? ["all"] : body.companyIds || [],
      payroll_access_enabled: body.payrollAccessEnabled,
      job_levels: body.jobLevels || [],
      updated_at: new Date().toISOString()
    };

    // Only update password if provided
    if (body.password) {
      updateData.password = body.password;
    }

    const { data, error } = await supabase
      .from('scanner_users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Unified API PUT Error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Unified API PUT Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('scanner_users')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Unified API DELETE Error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Unified API DELETE Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
