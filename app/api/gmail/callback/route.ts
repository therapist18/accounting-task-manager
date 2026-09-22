import { NextRequest, NextResponse } from 'next/server'
import { getGmailClient } from '@/lib/gmail/client'
import { createClient } from '@supabase/supabase-js'
import { getServiceClient, renewWatch, syncAccount, type AccountRow } from '@/lib/email-center/ingest'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// A first sync can involve a real backfill (Gmail calls + PDF downloads + AI classification for
// several messages) — give it real room instead of the platform's short default.
export const maxDuration = 60

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

    // Fetch Gmail profile for the email address only — history_id is deliberately left unset below
    // (not set to the profile's current historyId) so the sync that follows does a real backfill
    // instead of an incremental check that would find nothing: history.list only returns changes
    // *after* a given historyId, so seeding it to "now" would skip every KRA email already sitting
    // in the mailbox at the moment it's connected.
    const gmail = getGmailClient(access_token, refresh_token)
    console.log('Fetching Gmail profile...')
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const emailAddress = profile.data.emailAddress!

    console.log('Connected account:', emailAddress)

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

    // history_id is deliberately absent: on INSERT (a brand-new mailbox) the column is left at its
    // default (null), which is what makes the sync below do a real backfill. On UPDATE (reconnecting
    // one that already existed) omitting the key leaves its current cursor untouched — no reason to
    // force a wasted re-backfill of a mailbox that already has one, and if that cursor turns out to
    // be stale, the sync's own 404 fallback already handles that.
    const accountPayload = {
      email:              emailAddress,
      label:              emailAddress.split('@')[0],
      token:              tokenJson,
      refresh_token:      refresh_token ?? null,
      token_expiry:       expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status:             'active',
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

    const sbSvc = getServiceClient()

    // Sync this one mailbox immediately — no need to wait for the next push or a manual "Sync now".
    // Runs before renewWatch below: with history_id still unset (see accountPayload above), this
    // does a real backfill and, on success, sets the cursor itself; renewWatch's own "don't overwrite
    // an existing history_id" check then leaves that alone. Never blocks the connection itself — a
    // slow or failed first sync just means "Sync now" still works as a fallback, same as before.
    let ingested = 0
    try {
      const result = await syncAccount(sbSvc, account.id)
      ingested = result.ingested
      if (result.error) console.warn('[gmail/callback] initial sync reported an error', result.error)
    } catch (err) {
      console.warn('[gmail/callback] initial sync failed', err)
    }

    // Auto-setup Gmail push watch (INBOX + SENT, optional — needs Pub/Sub configured). Shared with
    // the sync path so a freshly-connected mailbox watches the same labels as every other one.
    await renewWatch(sbSvc, account as AccountRow).catch((err) =>
      console.warn('[gmail/callback] watch setup failed', err)
    )

    // connected=true tells the page to jump straight to the Mailboxes tab and toast, so the
    // "Connect Gmail account" button for the next mailbox is immediately in view — connecting
    // 40+ accounts back to back stays a two-click loop (Connect → pick account → Allow → repeat)
    // instead of hunting back to the tab each time. synced carries the initial sync's count so that
    // toast can say what was actually found, not just "connected".
    return NextResponse.redirect(
      `${APP_URL}/dashboard/emails?connected=true&email=${encodeURIComponent(emailAddress)}&synced=${ingested}`
    )
  } catch (err) {
    console.error('[gmail/callback]', err)
    return NextResponse.redirect(`${APP_URL}/dashboard/emails?error=server_error`)
  }
}
