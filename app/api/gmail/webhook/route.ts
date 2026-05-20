import { NextRequest, NextResponse } from 'next/server'
import { getGmailClient, parseEmailHeaders, extractTextBody } from '@/lib/gmail/client'
import { classifyEmail } from '@/lib/gmail/classifier'
import { createClient } from '@supabase/supabase-js'

// Google Pub/Sub sends POST here when a new Gmail message arrives.
// Validate with ?token=PUBSUB_WEBHOOK_SECRET in the subscription URL.
export async function POST(req: NextRequest) {
  // Verify secret token
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (token !== process.env.PUBSUB_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Decode Pub/Sub message
  const messageData = body?.message?.data
  if (!messageData) return NextResponse.json({ ok: true })

  let notification: { emailAddress: string; historyId: number }
  try {
    notification = JSON.parse(Buffer.from(messageData, 'base64').toString('utf-8'))
  } catch {
    return NextResponse.json({ ok: true })
  }

  const { emailAddress, historyId: newHistoryId } = notification

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: account } = await sb
    .from('email_accounts')
    .select('*')
    .eq('email', emailAddress)
    .eq('status', 'active')
    .maybeSingle()

  if (!account) return NextResponse.json({ ok: true })

  // Extract tokens from JSON token column
  const tokenData = typeof account.token === 'string' ? JSON.parse(account.token) : account.token
  const accessToken = tokenData?.access_token
  const refreshToken = account.refresh_token

  // Renew watch if expiring within 24 hours
  const watchExpiry = account.watch_expiry ? new Date(account.watch_expiry).getTime() : 0
  if (watchExpiry - Date.now() < 24 * 60 * 60 * 1000) {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: account.id }),
    }).catch(() => {})
  }

  try {
    const gmail = getGmailClient(accessToken, refreshToken, emailAddress)

    // Fetch new messages since last known historyId
    const historyRes = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: String(account.history_id),
      historyTypes: ['messageAdded'],
      labelId: 'INBOX',
    })

    const messages = (historyRes.data.history ?? [])
      .flatMap((h: any) => h.messagesAdded ?? [])
      .map((m: any) => m.message)

    for (const msg of messages) {
      if (!msg?.id) continue

      // Skip if already stored
      const { count } = await sb
        .from('emails')
        .select('id', { count: 'exact', head: true })
        .eq('gmail_message_id', msg.id)
      if ((count ?? 0) > 0) continue

      // Fetch full message
      const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' })
      const payload = full.data.payload
      const headers = payload?.headers ?? []

      const { subject, senderName, senderEmail, date } = parseEmailHeaders(headers)
      const bodyText = extractTextBody(payload)
      const snippet = full.data.snippet ?? ''

      // Resolve category id
      const { data: categories } = await sb.from('email_categories').select('id, name')
      const classification = await classifyEmail(subject, bodyText || snippet, senderEmail)
      const category = categories?.find((c) => c.name === classification.category)

      await sb.from('emails').insert({
        account_id: account.id,
        gmail_message_id: msg.id,
        gmail_thread_id: full.data.threadId,
        subject,
        sender_email: senderEmail,
        sender_name: senderName,
        snippet,
        body_plain: bodyText.slice(0, 10000),
        category_id: category?.id ?? null,
        category_confidence: classification.confidence,
        ai_summary: classification.summary,
        priority: classification.priority,
        labels: full.data.labelIds ?? [],
        received_at: date ? new Date(date).toISOString() : new Date().toISOString(),
      })
    }

    // Update historyId
    await sb
      .from('email_accounts')
      .update({ history_id: newHistoryId })
      .eq('id', account.id)
  } catch (err) {
    console.error('[gmail/webhook]', err)
  }

  return NextResponse.json({ ok: true })
}
