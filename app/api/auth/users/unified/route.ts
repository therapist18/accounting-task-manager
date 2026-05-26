// Unified API endpoint for user management in accounting-task-manager
import { NextRequest, NextResponse } from 'next/server';
import {
  listManagedScannerUsers,
  getManagedScannerUserById,
  createManagedScannerUser,
  updateManagedScannerUser,
  deleteManagedScannerUser
} from '@/lib/auth/scanner-users';
import { ensurePermission } from '@/lib/auth/access-controls';
import { requireAppSession } from '@/lib/auth/session';
import { toAuthErrorResponse } from '@/lib/auth/errors';
import type { ManagedAuthUserCreateInput, ManagedAuthUserUpdateInput } from '@/lib/auth/types';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAppSession(req);
    await ensurePermission(session.user, 'users.view');

    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');
    const companyId = searchParams.get('companyId');
    const payrollAccess = searchParams.get('payrollAccess') === 'true';
    const id = searchParams.get('id');

    // Handle single user request
    if (id) {
      const user = await getManagedScannerUserById(id);
      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

      // Transform based on role if specified
      if (role && user.role !== role) {
        return NextResponse.json({ error: "User role mismatch" }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        data: user
      });
    }

    // Handle list requests
    let users = await listManagedScannerUsers({ payrollAccessEnabled: payrollAccess });

    // Filter by company if specified
    if (companyId) {
      const companyIdNum = parseInt(companyId);
      users = users.filter(user =>
        user.companyIds.includes(companyIdNum) || user.primaryCompanyId === companyIdNum
      );
    }

    // Filter by role if specified
    if (role) {
      users = users.filter(user => user.role === role);
    }

    return NextResponse.json({
      success: true,
      data: users,
      totalCount: users.length,
      companyId: companyId || 'all',
      payrollAccess
    });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('Unified API Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAppSession(req);
    await ensurePermission(session.user, 'users.manage');

    const body = await req.json();
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');

    // Add role to input if specified in query params
    const input = {
      ...body,
      ...(role && { role })
    };

    const user = await createManagedScannerUser(input as ManagedAuthUserCreateInput);

    return NextResponse.json({
      success: true,
      data: user,
      message: "User created successfully"
    });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('Unified API POST Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create user" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAppSession(req);
    await ensurePermission(session.user, 'users.manage');

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const role = searchParams.get('role');

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const body = await req.json();

    // Add role to input if specified in query params
    const input = {
      ...body,
      ...(role && { role })
    };

    const user = await updateManagedScannerUser(id, input as ManagedAuthUserUpdateInput);

    return NextResponse.json({
      success: true,
      data: user,
      message: "User updated successfully"
    });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('Update user error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update user" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAppSession(req);
    await ensurePermission(session.user, 'users.manage');

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    await deleteManagedScannerUser(id);

    return NextResponse.json({
      success: true,
      message: "User deleted successfully"
    });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('Unified API DELETE Error:', error);
    return NextResponse.json(
      { success: false, error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
