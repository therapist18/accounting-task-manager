import { NextRequest, NextResponse } from 'next/server'
import { getGmailClient } from '@/lib/gmail/client'
import { createClient } from '@supabase/supabase-js'

// POST /api/gmail/watch  — (re)setup watch for all active accounts or a specific one
export async function POST(req: NextRequest) {
  const { accountId } = await req.json().catch(() => ({}))

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const query = sb.from('email_accounts').select('*').eq('status', 'active')
  if (accountId) query.eq('id', accountId)

  const { data: accounts, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const topicName = process.env.PUBSUB_TOPIC_NAME
  if (!topicName) return NextResponse.json({ error: 'PUBSUB_TOPIC_NAME not configured' }, { status: 500 })

  const results = []
  for (const account of accounts ?? []) {
    try {
      const tokenData = typeof account.token === 'string' ? JSON.parse(account.token) : account.token
      const gmail = getGmailClient(tokenData?.access_token, account.refresh_token, account.email)
      // INBOX + SENT: sent mail is how BCL's replies to KRA are detected and attached to the case.
      const res = await gmail.users.watch({
        userId: 'me',
        requestBody: { topicName, labelIds: ['INBOX', 'SENT'] },
      })

      const expiry = res.data.expiration
        ? new Date(parseInt(res.data.expiration)).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

      // Never overwrite an existing history_id: doing so would skip every message that arrived since
      // the last sync. Only seed it for a mailbox that has none yet.
      const update: Record<string, unknown> = { watch_expiry: expiry }
      if (!account.history_id && res.data.historyId) update.history_id = parseInt(res.data.historyId)
      await sb.from('email_accounts').update(update).eq('id', account.id)

      results.push({ email: account.email, status: 'ok', expiry })
    } catch (err: any) {
      results.push({ email: account.email, status: 'error', message: err.message })
    }
  }

  return NextResponse.json({ results })
}
