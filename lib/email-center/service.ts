import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Kept OUT of ingest.ts on purpose: every /api/email-center route and the auth helpers only need a
// service-role client, and importing it from ingest dragged the whole Gmail/googleapis dependency
// graph (~5k modules) into every one of those bundles — papering over a simple PATCH with a huge
// compiled route. Ingest imports this too, so nothing is duplicated.
export function getServiceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}