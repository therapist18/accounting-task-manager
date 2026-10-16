import { NextRequest, NextResponse } from "next/server"
import { authorize, clientAttachments, companyNames, fail, userNames } from "@/lib/email-center/api"
import { categoryByKey } from "@/lib/email-center/categories"
import { RULE_COLUMNS_BASE, RULES_TABLE } from "@/lib/email-center/rule-store"
import { APPROVAL_STATUSES } from "@/lib/email-center/types"

type Ctx = { params: Promise<{ id: string }> }

const YMD = /^\d{4}-\d{2}-\d{2}$/
const DATE_FIELDS = ["deadline_date", "respond_date", "promised_date", "approval_date"] as const
const TEXT_FIELDS = [
  "notice_type",
  "contents",
  "attachments_summary",
  "signing_officer_name",
  "signing_officer_position",
  "respond_contents",
  "kra_pin",
] as const

// GET /api/email-center/cases/:id — the case and the emails in its thread. Thread emails come back in
// the same shape as the email list's rows (everything but the body, which lives in Gmail), so opening
// one from the case dialog needs no request of its own for its details.
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const { sb } = await authorize(request)
    const { id } = await params

    const { data: c } = await sb.from("email_case").select("*").eq("id", id).maybeSingle()
    if (!c) return NextResponse.json({ success: false, error: "Case not found." }, { status: 404 })

    const { data: emails } = await sb
      .from("emails")
      .select(
        `id, gmail_message_id, gmail_thread_id, company_id, direction, subject, sender_email, sender_name,
         snippet, ai_summary, priority, is_read, received_at, has_attachments, disposition,
         classification_source, category_confidence, category_key, review_reason, kra_pin, case_id,
         to_addresses, cc_addresses, attachments, handled_by_id, handled_at`
      )
      .eq("case_id", id)
      .order("received_at", { ascending: true })

    // Which rule (if any) auto-opened this — created_by_rule_id arrived in the 20260929000000
    // migration, so a missing column just means "not known" rather than failing the whole dialog.
    let createdByRule: { pattern: string; category_name: string; is_active: boolean } | null = null
    if (c.created_by_rule_id) {
      const { data: rule } = await sb.from(RULES_TABLE).select(RULE_COLUMNS_BASE).eq("id", c.created_by_rule_id).maybeSingle()
      if (rule) {
        createdByRule = {
          pattern: rule.pattern,
          category_name: (await categoryByKey(sb, rule.category_key))?.name ?? rule.category_key,
          is_active: !!rule.is_active,
        }
      }
    }

    const [companies, users] = await Promise.all([
      companyNames(sb, [c.company_id]),
      userNames(sb, [
        c.responded_by_id, c.assigned_to_id, c.assigned_by_id, c.completed_by_id, c.created_by_id,
        ...(emails ?? []).map((e: any) => e.handled_by_id),
      ]),
    ])
    const name = (uid: string | null) => (uid ? users.get(String(uid)) ?? null : null)
    const companyName = c.company_id ? companies.get(String(c.company_id))?.name ?? null : null

    return NextResponse.json({
      success: true,
      case: {
        ...c,
        company_name: c.company_id ? companies.get(String(c.company_id))?.name ?? null : null,
        responded_by_name: name(c.responded_by_id),
        assigned_to_name: name(c.assigned_to_id),
        assigned_by_name: name(c.assigned_by_id),
        completed_by_name: name(c.completed_by_id),
        created_by_name: c.created_by_id ? name(c.created_by_id) : "System (from email)",
        created_by_rule: createdByRule,
      },
      emails: (emails ?? []).map(({ attachments, ...e }: any) => ({
        ...e,
        attachments: clientAttachments(attachments),
        company_name: e.company_id === c.company_id ? companyName : null,
        handled_by_name: e.handled_by_id ? name(e.handled_by_id) : null,
      })),
    })
  } catch (error) {
    return fail(error, "case GET")
  }
}

// PATCH /api/email-center/cases/:id — staff edits the manual columns, assigns the case, or completes it.
// Task audit lives on the row: who assigned it (assigned_by_id/at), to whom, who completed it
// (completed_by_id/at) — always the session user's id, never a name.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { sb, actor, user } = await authorize(request)
    const { id } = await params
    const body = (await request.json()) as Record<string, unknown>

    const { data: current } = await sb.from("email_case").select("*").eq("id", id).maybeSingle()
    if (!current) return NextResponse.json({ success: false, error: "Case not found." }, { status: 404 })

    const now = new Date().toISOString()
    const patch: Record<string, unknown> = {}
    for (const f of DATE_FIELDS) {
      if (!(f in body)) continue
      const v = body[f]
      if (v === null || v === "") patch[f] = null
      else if (typeof v === "string" && YMD.test(v)) patch[f] = v
      else return NextResponse.json({ success: false, error: `${f} must be YYYY-MM-DD.` }, { status: 400 })
    }
    for (const f of TEXT_FIELDS) {
      if (!(f in body)) continue
      const v = body[f]
      patch[f] = typeof v === "string" && v.trim() ? v.trim() : null
    }
    if ("approval_status" in body) {
      if (!(APPROVAL_STATUSES as string[]).includes(String(body.approval_status))) {
        return NextResponse.json({ success: false, error: "Invalid approval status." }, { status: 400 })
      }
      patch.approval_status = body.approval_status
    }
    if ("company_id" in body) patch.company_id = body.company_id ? String(body.company_id) : null

    // Assignment
    if ("assigned_to_id" in body) {
      const to = body.assigned_to_id ? String(body.assigned_to_id) : null
      if (to) {
        const { data: user } = await sb.from("scanner_users").select("id").eq("id", to).maybeSingle()
        if (!user) return NextResponse.json({ success: false, error: "Assignee not found." }, { status: 400 })
      }
      if ((current.assigned_to_id ?? null) !== to) {
        patch.assigned_to_id = to
        patch.assigned_by_id = to ? actor.id : null
        patch.assigned_at = to ? now : null
      }
    }

    // Completion
    if ("status" in body) {
      if (body.status !== "open" && body.status !== "closed") {
        return NextResponse.json({ success: false, error: "Invalid status." }, { status: 400 })
      }
      if (body.status !== current.status) {
        patch.status = body.status
        patch.completed_by_id = body.status === "closed" ? actor.id : null
        patch.completed_at = body.status === "closed" ? now : null
      }
    }

    // Who is recorded as the responder is audit data — the server sets it (below), and only a SuperAdmin
    // may override it by hand.
    if ("responded_by_id" in body) {
      if (!user.isSuperAdmin) {
        return NextResponse.json({ success: false, error: "Only a SuperAdmin can change who responded." }, { status: 403 })
      }
      const by = body.responded_by_id ? String(body.responded_by_id) : null
      if (by) {
        const { data: responder } = await sb.from("scanner_users").select("id").eq("id", by).maybeSingle()
        if (!responder) return NextResponse.json({ success: false, error: "Responder not found." }, { status: 400 })
      }
      patch.responded_by_id = by
    }

    // Whoever records the response date is the responder, unless one is already recorded (or a
    // SuperAdmin just set it explicitly).
    if (patch.respond_date && !current.respond_date && !current.responded_by_id && !("responded_by_id" in patch)) {
      patch.responded_by_id = actor.id
    }

    const changed = Object.entries(patch).some(([k, v]) => (current[k] ?? null) !== (v ?? null))
    if (!changed) return NextResponse.json({ success: true, unchanged: true })

    const { error } = await sb
      .from("email_case")
      .update({ ...patch, updated_by_id: actor.id, updated_at: now })
      .eq("id", id)
    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (error) {
    return fail(error, "case PATCH")
  }
}
