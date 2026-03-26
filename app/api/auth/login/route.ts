import { NextRequest, NextResponse } from 'next/server';

// Import Firebase Admin for real authentication
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';

// Mock user database - in a real app, this would be your actual user database
const MOCK_USERS = {
  'superadmin': {
    id: '1',
    email: 'admin@taskmanager.com',
    username: 'superadmin',
    displayName: 'Super Admin',
    role: 'admin',
    password: 'Bcladmin', // In production, this would be hashed
  },
  'user': {
    id: '2',
    email: 'user@taskmanager.com',
    username: 'user',
    displayName: 'Regular User',
    role: 'user',
    password: 'password', // In production, this would be hashed
  }
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { identifier, password } = body;

    // Validate input
    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Identifier and password are required' },
        { status: 400 }
      );
    }

    // Find user by identifier (username or email)
    const user = Object.values(MOCK_USERS).find(
      u => u.username === identifier || u.email === identifier
    );

    if (!user || user.password !== password) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Generate Firebase UID format like registry
    const firebaseUid = `scanner:${user.id}`;

    // Use real Firebase Admin SDK to create custom token
    const auth = getFirebaseAdminAuth();
    let customToken;
    try {
      customToken = await auth.createCustomToken(firebaseUid, {
        scannerUserId: user.id,
        role: user.role,
      });
    } catch (error) {
      console.error('Firebase Admin error:', error);
      // Fallback to mock token if Firebase Admin fails
      customToken = `mock_token_${user.id}_${Date.now()}`;
    }

    // Return success with custom token
    return NextResponse.json({
      success: true,
      data: {
        customToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
