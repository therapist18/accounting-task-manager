import { NextRequest, NextResponse } from 'next/server'
import { getGmailClient } from '@/lib/gmail/client'
import { createClient } from '@supabase/supabase-js'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  console.log('=== Gmail OAuth Callback ===')
  console.log('Code received:', !!code)
  console.log('Error:', error)

  if (error || !code) {
    return NextResponse.redirect(`${APP_URL}/dashboard/emails?error=oauth_denied`)
  }

  try {
    const redirectUri = `${APP_URL}/api/gmail/callback`
    console.log('Redirect URI for token exchange:', redirectUri)
    console.log('Client ID:', process.env.GOOGLE_CLIENT_ID)
    console.log('Client Secret configured:', !!process.env.GOOGLE_CLIENT_SECRET)

    // Exchange code for tokens — same as birthday module (raw fetch, no googleapis wrapper)
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type:    'authorization_code',
        redirect_uri:  redirectUri,
      }).toString(),
    })

    console.log('Token exchange status:', tokenResponse.status)
    const tokenData = await tokenResponse.json()
    console.log('Token exchange result:', JSON.stringify({ ...tokenData, access_token: tokenData.access_token ? '[SET]' : '[MISSING]', refresh_token: tokenData.refresh_token ? '[SET]' : '[MISSING]' }))

    if (tokenData.error) {
      console.error('Token exchange error:', tokenData.error, tokenData.error_description)
      return NextResponse.redirect(`${APP_URL}/dashboard/emails?error=${encodeURIComponent(tokenData.error)}`)
    }

    const { access_token, refresh_token, expires_in } = tokenData

    // Fetch Gmail profile to get email address + current historyId
    const gmail = getGmailClient(access_token, refresh_token)
    console.log('Fetching Gmail profile...')
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const emailAddress = profile.data.emailAddress!
    const historyId = parseInt(profile.data.historyId ?? '0')

    console.log('Connected account:', emailAddress)
    console.log('History ID:', historyId)

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // ── Build token JSON matching existing email_accounts schema ──
    const tokenJson = {
      access_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: expires_in || 3600,
      scope: tokenData.scope || '',
      expiry_time: Date.now() + (expires_in || 3600) * 1000,
      last_refresh: new Date().toISOString(),
    }

    const accountPayload = {
      email:              emailAddress,
      label:              emailAddress.split('@')[0],
      token:              tokenJson,
      refresh_token:      refresh_token ?? null,
      token_expiry:       expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status:             'active',
      history_id:         historyId,
      last_token_refresh: new Date().toISOString(),
      updated_at:         new Date().toISOString(),
    }

    // ── Manual upsert: check if row exists, then update or insert ──
    console.log('Checking for existing record (email:', emailAddress, ')...')
    const { data: existing } = await sb
      .from('email_accounts')
      .select('id')
      .eq('email', emailAddress)
      .maybeSingle()

    let account: any
    let dbErr: any

    if (existing?.id) {
      console.log('Existing account found — updating id:', existing.id)
      const { data, error } = await sb
        .from('email_accounts')
        .update(accountPayload)
        .eq('id', existing.id)
        .select()
        .single()
      account = data
      dbErr = error
    } else {
      console.log('No existing account — inserting new row...')
      const { data, error } = await sb
        .from('email_accounts')
        .insert({ ...accountPayload, created_at: new Date().toISOString() })
        .select()
        .single()
      account = data
      dbErr = error
    }

    console.log('DB result — error:', dbErr, '| account id:', account?.id)

    if (dbErr || !account) {
      console.error('DB save failed:', JSON.stringify(dbErr))
      return NextResponse.redirect(`${APP_URL}/dashboard/emails?error=db_error`)
    }

    // Auto-setup Gmail push watch (optional — needs Pub/Sub configured)
    await setupWatch(gmail, account.id, sb)

    return NextResponse.redirect(`${APP_URL}/dashboard/emails?connected=true`)
  } catch (err) {
    console.error('[gmail/callback]', err)
    return NextResponse.redirect(`${APP_URL}/dashboard/emails?error=server_error`)
  }
}

async function setupWatch(gmail: any, accountId: string, sb: any) {
  const topicName = process.env.PUBSUB_TOPIC_NAME
  if (!topicName) return

  try {
    const res = await gmail.users.watch({
      userId: 'me',
      requestBody: { topicName, labelIds: ['INBOX'] },
    })

    const expiry = res.data.expiration
      ? new Date(parseInt(res.data.expiration)).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await sb
      .from('email_accounts')
      .update({ history_id: parseInt(res.data.historyId ?? '0'), watch_expiry: expiry })
      .eq('id', accountId)
  } catch (err) {
    console.warn('[gmail/watch setup]', err)
  }
}
