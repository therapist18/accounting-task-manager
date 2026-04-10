// Unified API endpoint for user management in accounting-task-manager
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

// Role assignments helper function
async function getRoleAssignmentsByUserId(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('tm_role_assignments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// Load role assignments for multiple users
async function loadRoleAssignmentsForUsers(users: any[]): Promise<any[]> {
  const usersWithAssignments = await Promise.all(
    users.map(async (user: any) => {
      const roleAssignments = await getRoleAssignmentsByUserId(user.id);
      return {
        ...user,
        roleAssignments
      };
    })
  );
  return usersWithAssignments;
}

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

    // Filter by company if specified - temporarily disabled due to JSON parsing issues
    // TODO: Fix company_ids JSONB filtering
    // if (companyId) {
    //   query = query.contains('company_ids', `"${companyId}"`);
    // }

    // Filter by payroll access if specified
    if (payrollAccess !== null) {
      const hasPayrollAccess = payrollAccess === 'true';
      query = query.eq('payroll_access_enabled', hasPayrollAccess);
    }

    // Handle single user request
    if (id) {
      const { data, error } = await query;

      if (error) {
        console.error('Unified API Error:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      if (!data || data.length === 0) {
        return NextResponse.json(
          { success: false, error: "User not found" },
          { status: 404 }
        );
      }

      // Transform single user and load roleAssignments
      const transformedUser = {
        id: data[0].id,
        firebaseUid: data[0].firebase_uid,
        payrollAccessEnabled: data[0].payroll_access_enabled,
        role: data[0].role,
        username: data[0].username,
        email: data[0].email,
        firstName: data[0].first_name,
        lastName: data[0].last_name,
        displayName: data[0].first_name && data[0].last_name
          ? `${data[0].first_name} ${data[0].last_name}`.trim()
          : data[0].first_name || data[0].last_name || data[0].username || 'Unknown',
        isActive: data[0].is_active,
        primaryCompanyId: data[0].company_id,
        companyIds: data[0].company_ids || [],
        hasAllCompanyAccess: data[0].company_ids?.includes("all") || false,
        isAdmin: data[0].role === 'company_admin' || data[0].role === 'general_admin',
        isSuperAdmin: false,
        clerkUserId: data[0].clerk_user_id,
        createdAt: data[0].created_at,
        updatedAt: data[0].updated_at,
        lastLogin: data[0].last_login,
        hasPassword: Boolean(data[0].password && data[0].password.trim()),
        roleAssignments: undefined // Will be loaded from tm_role_assignments table
      };

      // Load role assignments for single user
      const usersWithAssignments = await loadRoleAssignmentsForUsers([transformedUser]);

      return NextResponse.json({
        success: true,
        data: usersWithAssignments[0]
      });
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
    let transformedData = (data || []).map(user => ({
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
      roleAssignments: undefined // Will be loaded from tm_role_assignments table
    }));

    // Load role assignments from tm_role_assignments table
    transformedData = await loadRoleAssignmentsForUsers(transformedData);

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
