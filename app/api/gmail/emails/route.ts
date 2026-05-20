import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClient, parseEmailHeaders, extractTextBody } from '@/lib/gmail/client'
import { classifyEmail } from '@/lib/gmail/classifier'

// GET /api/gmail/emails — fetches directly from Gmail API, caches classifications in DB
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const categoryId = searchParams.get('category')
  const unreadOnly = searchParams.get('unread') === 'true'
  const search     = searchParams.get('search') ?? ''
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── 1. Load connected account ──────────────────────────────────────────────
  const { data: account } = await sb
    .from('email_accounts')
    .select('*')
    .eq('status', 'active')
    .not('refresh_token', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!account) {
    return NextResponse.json({ emails: [], total: 0, page: 1, limit })
  }

  const tokenData   = typeof account.token === 'string' ? JSON.parse(account.token) : account.token
  const accessToken = tokenData?.access_token
  const gmail       = getGmailClient(accessToken, account.refresh_token, account.email)

  // ── 2. Build Gmail query string ────────────────────────────────────────────
  const parts: string[] = ['in:inbox']
  if (unreadOnly)    parts.push('is:unread')
  if (search.trim()) parts.push(search.trim())
  const gmailQuery = parts.join(' ')

  // ── 3. List message IDs from Gmail ────────────────────────────────────────
  let messageIds: string[] = []
  try {
    const listRes = await gmail.users.messages.list({
      userId:     'me',
      maxResults: limit,
      q:          gmailQuery,
    })
    messageIds = (listRes.data.messages ?? []).map((m: any) => m.id).filter(Boolean)
  } catch (err) {
    console.error('[gmail/emails list]', err)
    return NextResponse.json({ error: 'Failed to fetch from Gmail' }, { status: 502 })
  }

  if (messageIds.length === 0) {
    return NextResponse.json({ emails: [], total: 0, page: 1, limit })
  }

  // ── 4. Load cached rows from DB (to avoid re-classifying) ─────────────────
  const { data: cached } = await sb
    .from('emails')
    .select(`id, gmail_message_id, subject, sender_email, sender_name,
             snippet, ai_summary, priority, is_read, is_starred,
             received_at, category_id,
             email_categories ( id, name, color, icon )`)
    .in('gmail_message_id', messageIds)

  const cachedMap = new Map((cached ?? []).map((e: any) => [e.gmail_message_id, e]))

  // ── 5. Load categories for classification ─────────────────────────────────
  const { data: categories } = await sb.from('email_categories').select('id, name')
  const catMap = new Map((categories ?? []).map((c: any) => [c.name, c.id]))

  // ── 6. Fetch + classify any uncached messages (in parallel, capped at 10) ─
  const uncachedIds = messageIds.filter(id => !cachedMap.has(id))
  const toFetch     = uncachedIds.slice(0, 15) // cap per request to stay fast

  await Promise.allSettled(
    toFetch.map(async (msgId) => {
      try {
        const full    = await gmail.users.messages.get({ userId: 'me', id: msgId, format: 'full' })
        const payload = full.data.payload
        const headers = payload?.headers ?? []
        const { subject, senderName, senderEmail, date } = parseEmailHeaders(headers)
        const bodyText = extractTextBody(payload)
        const snippet  = full.data.snippet ?? ''

        const classification = await classifyEmail(subject, bodyText || snippet, senderEmail)
        const categoryDbId   = catMap.get(classification.category) ?? null

        const row = {
          account_id:          account.id,
          gmail_message_id:    msgId,
          gmail_thread_id:     full.data.threadId,
          subject,
          sender_email:        senderEmail,
          sender_name:         senderName,
          snippet,
          body_plain:          bodyText.slice(0, 10000),
          category_id:         categoryDbId,
          category_confidence: classification.confidence,
          ai_summary:          classification.summary,
          priority:            classification.priority,
          labels:              full.data.labelIds ?? [],
          is_read:             !(full.data.labelIds ?? []).includes('UNREAD'),
          received_at:         date ? new Date(date).toISOString() : new Date().toISOString(),
        }

        const { data: inserted } = await sb
          .from('emails')
          .upsert(row, { onConflict: 'gmail_message_id' })
          .select(`id, gmail_message_id, subject, sender_email, sender_name,
                   snippet, ai_summary, priority, is_read, is_starred,
                   received_at, category_id,
                   email_categories ( id, name, color, icon )`)
          .single()

        if (inserted) cachedMap.set(msgId, inserted)
      } catch (err) {
        console.error('[gmail/emails fetch]', msgId, err)
      }
    })
  )

  // ── 7. Build response in Gmail order ──────────────────────────────────────
  let emails = messageIds
    .map(id => cachedMap.get(id))
    .filter(Boolean)

  // Apply category filter (client-side on the result set)
  if (categoryId) emails = emails.filter((e: any) => e.category_id === categoryId)

  return NextResponse.json({ emails, total: emails.length, page: 1, limit })
}

// PATCH /api/gmail/emails — mark read, star, reclassify
export async function PATCH(req: NextRequest) {
  const { id, is_read, is_starred, category_id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (is_read     !== undefined) updates.is_read     = is_read
  if (is_starred  !== undefined) updates.is_starred  = is_starred
  if (category_id !== undefined) updates.category_id = category_id

  const { data, error } = await sb.from('emails').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
