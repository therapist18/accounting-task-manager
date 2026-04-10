// API endpoints for role assignments management
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const role = searchParams.get('role');
    const departmentId = searchParams.get('departmentId');
    const subdepartmentId = searchParams.get('subdepartmentId');
    const classId = searchParams.get('classId');

    let query = supabase.from('tm_role_assignments').select('*');

    // Filter by user if specified
    if (userId) {
      query = query.eq('user_id', userId);
    }

    // Filter by role if specified
    if (role) {
      query = query.eq('role', role);
    }

    // Filter by department if specified
    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    // Filter by subdepartment if specified
    if (subdepartmentId) {
      query = query.eq('subdepartment_id', subdepartmentId);
    }

    // Filter by class if specified
    if (classId) {
      query = query.eq('class_id', classId);
    }

    // Order by created_at descending
    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Role Assignments API Error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      totalCount: data?.length || 0
    });

  } catch (error) {
    console.error('Role Assignments API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.role || !body.user_id) {
      return NextResponse.json(
        { success: false, error: 'Role and user_id are required' },
        { status: 400 }
      );
    }

    // Validate that at least one hierarchy level is specified
    if (!body.department_id && !body.subdepartment_id && !body.class_id && !body.subclass_id) {
      return NextResponse.json(
        { success: false, error: 'At least one hierarchy level (department_id, subdepartment_id, class_id, or subclass_id) must be specified' },
        { status: 400 }
      );
    }

    const assignmentData = {
      role: body.role,
      user_id: body.user_id,
      department_id: body.department_id || null,
      subdepartment_id: body.subdepartment_id || null,
      class_id: body.class_id || null,
      subclass_id: body.subclass_id || null,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('tm_role_assignments')
      .insert([assignmentData])
      .select()
      .single();

    if (error) {
      console.error('Role Assignments POST Error:', error);
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
    console.error('Role Assignments POST Error:', error);
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

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Assignment ID is required' },
        { status: 400 }
      );
    }

    // Validate that at least one hierarchy level is specified if updating
    const hasHierarchyLevel = body.department_id || body.subdepartment_id || body.class_id || body.subclass_id;
    if (hasHierarchyLevel === undefined && !body.role && !body.user_id) {
      return NextResponse.json(
        { success: false, error: 'At least one field must be updated' },
        { status: 400 }
      );
    }

    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (body.role !== undefined) updateData.role = body.role;
    if (body.user_id !== undefined) updateData.user_id = body.user_id;
    if (body.department_id !== undefined) updateData.department_id = body.department_id;
    if (body.subdepartment_id !== undefined) updateData.subdepartment_id = body.subdepartment_id;
    if (body.class_id !== undefined) updateData.class_id = body.class_id;
    if (body.subclass_id !== undefined) updateData.subclass_id = body.subclass_id;

    const { data, error } = await supabase
      .from('tm_role_assignments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Role Assignments PUT Error:', error);
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
    console.error('Role Assignments PUT Error:', error);
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
        { success: false, error: 'Assignment ID is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('tm_role_assignments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Role Assignments DELETE Error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Role assignment deleted successfully'
    });

  } catch (error) {
    console.error('Role Assignments DELETE Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
