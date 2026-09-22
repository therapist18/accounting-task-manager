import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectUri = `${baseUrl}/api/gmail/callback`

  console.log('=== Gmail OAuth Initiation ===')
  console.log('Client ID:', clientId)
  console.log('Redirect URI:', redirectUri)

  if (!clientId) {
    console.error('ERROR: GOOGLE_CLIENT_ID not configured')
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 500 })
  }

  const scope = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ].join(' ')

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scope)}&` +
    `access_type=offline&` +
    // select_account forces the account chooser every time, even when only one Google account is
    // signed into the browser — without it Google can silently reuse the last-picked account and
    // you'd reconnect the same mailbox instead of moving to the next one.
    `prompt=${encodeURIComponent('consent select_account')}`

  console.log('Redirecting to:', authUrl)
  return NextResponse.redirect(authUrl)
}
