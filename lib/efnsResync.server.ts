// Deleting an EFNS record from the Immigration Notifications page, optionally un-filing what it filed
// onto a task and queueing it to be captured again by the EFNS automation (efns_sync_requests — see
// supabase/migrations/20261017000000_efns_sync_requests.sql). Used to re-test older records end to
// end: delete → the automation re-captures it (WhatsApp off) → auto-filing picks it up again.

import "server-only"
import { createServerSupabaseClient } from "@/lib/supabase"
import { IMMIGRATION_BUCKET, immigrationPdfPath, type ItemKind } from "@/lib/immigrationNotifications"

type Sb = ReturnType<typeof createServerSupabaseClient>

export interface EfnsSyncRequest {
  id: number
  created_at: string
  status: "pending" | "running" | "done" | "error"
  targets: any[]
  started_at: string | null
  finished_at: string | null
  result: { recaptured: number; missing: number; items: Array<{ kind: ItemKind; label: string; new_id: number | null }> } | null
  error: string | null
}

/** What identifies the record to the automation's duplicate check (its portal row). */
function syncTarget(kind: ItemKind, row: any) {
  return kind === "notification"
    ? { kind, permit_type: row.permit_type, case_type: row.case_type, name: row.name, date: row.date }
    : {
        kind,
        payment_type: row.payment_type,
        application_name: row.application_name,
        applicant_name: row.applicant_name,
        application_category: row.application_category,
        fee_type: row.fee_type,
        date_issued: row.date_issued,
      }
}

/**
 * Takes a filed document back off its task: removes the stored PDF and the document row, and drops it
 * from the stage (and source_document_id). A stage left with no documents is no longer complete.
 * The task's overall status isn't rolled back.
 */
async function unfileDocument(sb: Sb, filing: any): Promise<string | null> {
  const documentId = filing?.document_id
  if (!documentId) return null
  const { data: doc } = await sb.from("acc_portal_directors_documents").select("id, file_path").eq("id", documentId).maybeSingle()
  if (doc?.file_path) await sb.storage.from("kyc-documents").remove([doc.file_path]).then(() => {}, () => {})
  if (doc) {
    const { error } = await sb.from("acc_portal_directors_documents").delete().eq("id", documentId)
    if (error) return `Couldn't delete the filed document: ${error.message}`
  }

  if (filing.task_id && filing.stage_id) {
    const { data: task } = await sb.from("tm_tasks").select("id, stages, source_document_id").eq("id", filing.task_id).maybeSingle()
    if (task) {
      const stages = { ...(task.stages || {}) }
      const entry = stages[filing.stage_id]
      if (entry) {
        const documents = { ...(entry.documents || {}) }
        delete documents[String(documentId)]
        const remaining = Object.keys(documents).length
        const next: any = { ...entry, documents, documentsUploaded: remaining, lastUpdated: new Date().toISOString() }
        if (remaining === 0) {
          delete next.status
          delete next.completedAt
          delete next.date
        }
        stages[filing.stage_id] = next
      }
      const sources = { ...(task.source_document_id || {}) }
      if (Array.isArray(sources[filing.stage_id])) {
        sources[filing.stage_id] = sources[filing.stage_id].filter((d: any) => String(d.id ?? d.linked_document_id) !== String(documentId))
      }
      const { error } = await sb
        .from("tm_tasks")
        .update({ stages, source_document_id: sources, updated_at: new Date().toISOString() })
        .eq("id", task.id)
      if (error) return `Removed the document but couldn't update the task: ${error.message}`
    }
  }
  return null
}

export async function deleteEfnsItem(input: {
  kind: ItemKind
  id: number
  /** Also take the document it filed off the task (when it was filed). */
  unfile: boolean
  /** Queue it for the automation to capture again. */
  resync: boolean
  byId?: string | null
}): Promise<{ success: boolean; error?: string; requestId?: number | null; warning?: string | null }> {
  const sb = createServerSupabaseClient()
  const table = input.kind === "notification" ? "immigration_notifications" : "immigration_payments"
  const { data: row, error } = await sb.from(table).select("*").eq("id", input.id).maybeSingle()
  if (error || !row) return { success: false, error: error?.message || "Record not found" }

  const warning = input.unfile && row.filing_status === "filed" ? await unfileDocument(sb, row.filing) : null
  if (input.unfile && row.filing_status === "filed" && row.filing?.document_id) {
    // Audit: a staff member took the filed document back off the task.
    await sb
      .from("efns_filing_events")
      .insert({
        item_kind: input.kind,
        item_id: input.id,
        task_id: row.filing.task_id ?? null,
        stage_id: row.filing.stage_id ?? null,
        stage_name: row.filing.stage_name ?? null,
        kyc_document_id: row.filing.kyc_document_id ?? null,
        document_id: String(row.filing.document_id),
        action: "unfiled",
        linked_by: "staff",
        actor_id: input.byId ?? null,
        matched_by: row.filing.matched_by ?? null,
      })
      .then(
        () => {},
        () => {},
      )
  }

  // The record's PDF (a re-capture renders and uploads it again).
  const pdfPath = immigrationPdfPath(input.kind, input.kind === "notification" ? row.pdf_file_name : row.payment_instructions_file_name)
  if (pdfPath) await sb.storage.from(IMMIGRATION_BUCKET).remove([pdfPath]).then(() => {}, () => {})

  const { error: delErr } = await sb.from(table).delete().eq("id", input.id)
  if (delErr) return { success: false, error: `Couldn't delete the record: ${delErr.message}`, warning }

  let requestId: number | null = null
  if (input.resync) {
    // One pending request collects everything deleted before the automation next polls.
    const target = syncTarget(input.kind, row)
    const { data: pending } = await sb
      .from("efns_sync_requests")
      .select("id, targets")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
    if (pending?.[0]) {
      requestId = pending[0].id
      const { error: updErr } = await sb
        .from("efns_sync_requests")
        .update({ targets: [...(pending[0].targets || []), target] })
        .eq("id", requestId)
      if (updErr) return { success: true, requestId: null, warning: `Deleted, but couldn't queue the re-capture: ${updErr.message}` }
    } else {
      const { data: created, error: insErr } = await sb
        .from("efns_sync_requests")
        .insert({ targets: [target], requested_by: input.byId ?? null })
        .select("id")
        .single()
      if (insErr) return { success: true, requestId: null, warning: `Deleted, but couldn't queue the re-capture: ${insErr.message}` }
      requestId = created.id
    }
  }
  return { success: true, requestId, warning }
}

/** The latest requested syncs, newest first. */
export async function listSyncRequests(limit = 5): Promise<EfnsSyncRequest[]> {
  const sb = createServerSupabaseClient()
  const { data, error } = await sb.from("efns_sync_requests").select("*").order("created_at", { ascending: false }).limit(limit)
  if (error) throw new Error(error.message)
  return (data || []) as EfnsSyncRequest[]
}
