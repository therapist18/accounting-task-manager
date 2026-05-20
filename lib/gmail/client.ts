import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/gmail/callback`
  )
}

export function getAuthUrl() {
  const oauth2 = getOAuthClient()
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
}

export function getGmailClient(accessToken: string, refreshToken: string, emailAddress?: string) {
  const oauth2 = getOAuthClient()
  oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken })

  // Auto-save refreshed tokens back to DB using existing schema (token JSON column)
  if (emailAddress) {
    oauth2.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const updatedToken = {
          access_token: tokens.access_token,
          token_type: 'Bearer',
          expiry_time: tokens.expiry_date ?? (Date.now() + 3600 * 1000),
          last_refresh: new Date().toISOString(),
        }
        await sb.from('email_accounts').update({
          token:              updatedToken,
          token_expiry:       tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
          last_token_refresh: new Date().toISOString(),
        }).eq('email', emailAddress)
      }
    })
  }

  return google.gmail({ version: 'v1', auth: oauth2 })
}

export function parseEmailHeaders(headers: { name: string; value: string }[]) {
  const get = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

  const fromRaw = get('From')
  const match = fromRaw.match(/^(.*?)\s*<(.+?)>$/)

  return {
    subject: get('Subject'),
    senderName: match ? match[1].trim().replace(/^"|"$/g, '') : fromRaw,
    senderEmail: match ? match[2] : fromRaw,
    date: get('Date'),
  }
}

export function extractTextBody(payload: any): string {
  if (!payload) return ''

  const decode = (data: string) => Buffer.from(data, 'base64').toString('utf-8')

  const traverse = (part: any): string => {
    if (part.mimeType === 'text/plain' && part.body?.data) return decode(part.body.data)
    if (part.parts) {
      for (const p of part.parts) {
        const text = traverse(p)
        if (text) return text
      }
    }
    return ''
  }

  if (payload.mimeType === 'text/plain' && payload.body?.data) return decode(payload.body.data)
  return traverse(payload)
}
