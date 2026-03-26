import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_SESSION_COOKIE, getSessionCookieOptions } from "@/lib/auth/session";

// Import Firebase Admin for real authentication
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";

// Mock user database
const MOCK_USERS = {
  '1': {
    id: '1',
    email: 'admin@taskmanager.com',
    username: 'superadmin',
    displayName: 'Super Admin',
    role: 'admin',
    isActive: true,
  },
  '2': {
    id: '2',
    email: 'user@taskmanager.com',
    username: 'user',
    displayName: 'Regular User',
    role: 'user',
    isActive: true,
  }
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken } = body;

    if (!idToken) {
      return NextResponse.json(
        { error: "ID token is required" },
        { status: 400 }
      );
    }

    // Verify ID token using real Firebase Admin SDK
    const auth = getFirebaseAdminAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(idToken, false);
    } catch (error) {
      console.error("Token verification failed:", error);
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 }
      );
    }

    // Extract user ID from Firebase UID
    let userId: string;
    if (decodedToken.uid.startsWith('scanner:')) {
      userId = decodedToken.uid.replace('scanner:', '');
    } else if (decodedToken.uid.startsWith('task_manager_')) {
      userId = decodedToken.uid.replace('task_manager_', '');
    } else {
      return NextResponse.json(
        { error: "Invalid token user" },
        { status: 401 }
      );
    }

    // Get user from database
    const user = MOCK_USERS[userId as keyof typeof MOCK_USERS];
    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: "User not found or inactive" },
        { status: 404 }
      );
    }

    // Create session data
    const sessionData = {
      tokenUid: decodedToken.uid,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        isActive: user.isActive,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      }
    };

    // Create session cookie
    const cookieStore = await cookies();
    cookieStore.set(
      AUTH_SESSION_COOKIE,
      JSON.stringify(sessionData),
      getSessionCookieOptions()
    );

    return NextResponse.json({
      success: true,
      data: sessionData
    });

  } catch (error) {
    console.error("Session creation error:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(AUTH_SESSION_COOKIE)?.value;

    if (!sessionCookie) {
      return NextResponse.json({
        authenticated: false,
        user: null
      });
    }

    try {
      const sessionData = JSON.parse(sessionCookie);
      return NextResponse.json({
        authenticated: true,
        user: sessionData.user
      });
    } catch (parseError) {
      console.error("Session parse error:", parseError);
      return NextResponse.json({
        authenticated: false,
        user: null
      });
    }

  } catch (error) {
    console.error("Session retrieval error:", error);
    return NextResponse.json({
      authenticated: false,
      user: null
    });
  }
}
