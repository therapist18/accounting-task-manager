// Re-exported from the shared, app-wide retry helper (lib/supabaseRetry.ts) — kept here too since the
// email-center module's ingestion pipeline (heavy concurrent Gmail + Supabase traffic during a big
// backfill) is what this was originally written for, and every existing import in this module already
// points at "./retry".
export { withRetry, withSupabaseRetry } from "@/lib/supabaseRetry"
