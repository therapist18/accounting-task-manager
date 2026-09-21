import { after, NextRequest, NextResponse } from 'next/server'
import { getServiceClient, renewExpiringWatches, syncAccount } from '@/lib/email-center/ingest'

// Sync work (Gmail fetch + AI + PDF) can outlast Pub/Sub's ack deadline. Keep this within your Vercel
// plan's function limit.
export const maxDuration = 60

// Google Pub/Sub sends POST here when a Gmail mailbox changes ("push"). Validate with
// ?token=PUBSUB_WEBHOOK_SECRET in the subscription's push URL.
//
// The push only says "mailbox X changed". We acknowledge immediately (a slow non-2xx makes Pub/Sub
// redeliver) and run the shared, idempotent syncAccount() after the response is sent. Failures are
// recorded on the account (last_sync_error) and retried by the next push or "Sync now".
export async function POST(req: NextRequest) {
  const secret = process.env.PUBSUB_WEBHOOK_SECRET
  const token = new URL(req.url).searchParams.get('token')
  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const messageData = body?.message?.data
  if (!messageData) return NextResponse.json({ ok: true })

  let notification: { emailAddress: string; historyId: number }
  try {
    notification = JSON.parse(Buffer.from(messageData, 'base64').toString('utf-8'))
  } catch {
    return NextResponse.json({ ok: true })
  }

  after(async () => {
    try {
      const sb = getServiceClient()
      const { data: account } = await sb
        .from('email_accounts')
        .select('id')
        .eq('email', notification.emailAddress)
        .eq('status', 'active')
        .maybeSingle()
      if (!account) return
      await syncAccount(sb, account.id)
      await renewExpiringWatches(sb)
    } catch (err) {
      console.error('[gmail/webhook]', err)
    }
  })

  return NextResponse.json({ ok: true })
}
