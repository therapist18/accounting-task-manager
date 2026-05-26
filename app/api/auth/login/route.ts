import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import {
  authenticateScannerUserByIdentifier,
  linkScannerUserFirebaseUid,
  touchScannerUserLogin,
} from "@/lib/auth/scanner-users";

function invalidCredentials() {
  return NextResponse.json(
    { success: false, error: "Invalid login credentials." },
    { status: 401 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      identifier?: string;
      username?: string;
      email?: string;
      password?: string;
      client?: string;
    };
    const identifier =
      typeof body.identifier === "string" ? body.identifier.trim() :
      typeof body.username === "string" ? body.username.trim() :
      typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const client = typeof body.client === "string" ? body.client : "";

    if (!identifier) {
      return NextResponse.json(
        { success: false, error: "Email or username is required." },
        { status: 400 }
      );
    }
    if (!password) {
      return NextResponse.json(
        { success: false, error: "Password is required." },
        { status: 400 }
      );
    }

    const user = await authenticateScannerUserByIdentifier(identifier, password);
    if (!user || !user.isActive) return invalidCredentials();

    await touchScannerUserLogin(user.id, user.email);

    let customToken: string | null = null;
    let firebaseUid = user.firebaseUid;
    if (client !== "mobile") {
      firebaseUid = user.firebaseUid || `scanner:${user.id}`;
      if (!user.firebaseUid) await linkScannerUserFirebaseUid(user.id, firebaseUid);

      customToken = await getFirebaseAdminAuth().createCustomToken(firebaseUid, {
        scannerUserId: user.id,
        role: user.role,
      });
    }

    return NextResponse.json({
      success: true,
      customToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        role: user.role,
        companyId: user.primaryCompanyId,
        companyIds: user.companyIds,
        firebaseUid,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, error: "Login failed. Please try again." },
      { status: 500 }
    );
  }
}
