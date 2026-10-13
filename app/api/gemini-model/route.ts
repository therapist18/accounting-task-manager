import { NextResponse } from 'next/server';
import { getActiveGeminiModel } from '@/lib/gemini-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Lets browser-side extraction code use the shared Gemini model setting. */
export async function GET() {
  return NextResponse.json({ model: await getActiveGeminiModel() });
}