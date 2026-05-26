import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ success: false, error: "Use /api/auth/access-controls/roles." }, { status: 410 });
}

export async function PUT() {
  return NextResponse.json({ success: false, error: "Use /api/auth/access-controls/roles." }, { status: 410 });
}
