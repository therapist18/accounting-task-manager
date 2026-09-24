import { NextResponse } from "next/server"
import { ensurePermission } from "@/lib/auth/access-controls"
import { requireAppSession } from "@/lib/auth/session"
import { toAuthErrorResponse } from "@/lib/auth/errors"
import { getServiceClient } from "./service"
import type { Actor } from "./types"

// Every /api/email-center route authenticates the session user and requires emails.view, then talks
// to Supabase with the service role (the email tables have RLS on and no client policies, because
// they hold mailbox OAuth tokens and client correspondence).
export async function authorize(request: Request) {
  const session = await requireAppSession(request)
  await ensurePermission(session.user, "emails.view")
  const actor: Actor = { id: session.user.id, type: "user" }
  return { user: session.user, actor, sb: getServiceClient() }
}

export function fail(error: unknown, label: string) {
  const authResponse = toAuthErrorResponse(error)
  if (authResponse) return authResponse
  console.error(`[email-center] ${label}`, error)
  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : "Unexpected error" },
    { status: 500 }
  )
}

// The attachments column stores server-side storage paths; the client only ever sees an index it can
// download by (/api/email-center/emails/:id/attachments/:index) and whether that file was stored.
export function clientAttachments(raw: unknown) {
  return (Array.isArray(raw) ? raw : []).map((a: any, index: number) => ({
    index,
    filename: a.filename as string,
    mime_type: (a.mime_type ?? null) as string | null,
    size_bytes: (a.size_bytes ?? null) as number | null,
    downloadable: !!a.storage_path,
  }))
}

export async function companyNames(sb: ReturnType<typeof getServiceClient>, ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  const map = new Map<string, { name: string; kra_pin: string | null }>()
  if (!unique.length) return map
  const { data } = await sb
    .from("acc_portal_company_duplicate")
    .select("id, company_name, kra_pin")
    .in("id", unique)
  for (const c of data ?? []) map.set(String(c.id), { name: c.company_name, kra_pin: c.kra_pin ?? null })
  return map
}

export async function userNames(sb: ReturnType<typeof getServiceClient>, ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  const map = new Map<string, string>()
  if (!unique.length) return map
  const { data } = await sb.from("scanner_users").select("id, first_name, last_name, username").in("id", unique)
  for (const u of data ?? []) {
    map.set(String(u.id), [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || String(u.id))
  }
  return map
}
