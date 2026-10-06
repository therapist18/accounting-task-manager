import { supabase } from "./client"

// task_basket_items lives in the shared Supabase project (created by kra-tools'
// supabase/migrations/20260909_create_task_basket.sql) and is populated by kra-tools'
// pages/api/cron/populate-task-basket.ts. This module only reads it and marks items resolved
// — the compliance checks themselves live in kra-tools, next to the data they read.

export type TaskBasketModule = "bank_statements" | "file_management" | "tax_receipts"
export type TaskBasketStatus = "open" | "resolved"

export const TASK_BASKET_MODULE_LABELS: Record<TaskBasketModule, string> = {
  bank_statements: "Bank Statement Requests",
  file_management: "File Management",
  tax_receipts: "Payment Receipts",
}

export interface TaskBasketContact {
  individualId: number
  name: string
  position: string
  channel: string
  value: string
}

// Appended by kra-tools' task-basket sync while an item stays open (and once more when it closes
// itself): { checked_at, still_pending } for a progress tick, plus the richer late_upload record
// with received_accounts/total_accounts and auto_resolved.
export interface TaskBasketHistoryEntry {
  checked_at: string
  event?: "late_upload"
  still_pending?: boolean
  received_accounts?: number
  total_accounts?: number
  auto_resolved?: boolean
}

// Why the company hasn't delivered, as kra-tools staff recorded it (kra-tools'
// supabase/migrations/20261006_task_basket_comments.sql): a client's logged response to a
// request/reminder, or a note on a bank account for the month ("merged statement — not uploaded").
// The item is still in the basket because nothing has been uploaded/recorded yet.
export interface TaskBasketComment {
  source: "client_response" | "account_note"
  text: string
  account?: string
  expected_date?: string | null
  by?: string | null
  at?: string | null
}

export const TASK_BASKET_COMMENT_SOURCE_LABELS: Record<TaskBasketComment["source"], string> = {
  client_response: "Client response",
  account_note: "Account note",
}

export interface TaskBasketItem {
  id: string
  company_id: number
  company_name: string
  module: TaskBasketModule
  cycle_month: string
  department: string
  status: TaskBasketStatus
  reason: string
  contact_summary: TaskBasketContact[]
  history: TaskBasketHistoryEntry[]
  triggered_at: string
  resolved_at: string | null
  resolved_by: string | null
  resolution_note: string | null
  has_comments: boolean
  comments: TaskBasketComment[]
}

export interface TaskBasketFilters {
  module?: TaskBasketModule | "all"
  status?: TaskBasketStatus | "all"
  cycleMonth?: string // 'YYYY-MM'
}

export async function getTaskBasketItems(filters: TaskBasketFilters = {}): Promise<TaskBasketItem[]> {
  let query = supabase
    .from("task_basket_items")
    .select("*")
    .order("triggered_at", { ascending: false })

  if (filters.module && filters.module !== "all") query = query.eq("module", filters.module)
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status)
  if (filters.cycleMonth) query = query.eq("cycle_month", filters.cycleMonth)

  const { data, error } = await query
  if (error) throw new Error(`Failed to load task basket items: ${error.message}`)
  if (!data?.length) return []

  const companyIds = [...new Set(data.map((row: any) => row.company_id))]
  const { data: companies, error: companiesError } = await supabase
    .from("acc_portal_company_duplicate")
    .select("id, company_name")
    .in("id", companyIds)
  if (companiesError) throw new Error(`Failed to load company names: ${companiesError.message}`)

  const nameById = new Map((companies || []).map((c: any) => [c.id, c.company_name]))

  return data.map((row: any) => ({
    ...row,
    company_name: nameById.get(row.company_id) || `Company #${row.company_id}`,
    contact_summary: row.contact_summary || [],
    history: row.history || [],
    // Absent until the comments migration has run — treated as "no comments".
    comments: row.comments || [],
    has_comments: !!row.has_comments,
  }))
}

export async function resolveTaskBasketItem(id: string, resolutionNote: string): Promise<void> {
  const response = await fetch("/api/task-basket/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, resolution_note: resolutionNote }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || "Failed to resolve task basket item.")
  }
}

export async function deleteTaskBasketItem(id: string): Promise<void> {
  const response = await fetch("/api/task-basket/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || "Failed to delete task basket item.")
  }
}

// The routes cap one request at 500 ids; a larger selection is sent in chunks.
const BULK_CHUNK_SIZE = 500

async function postInChunks(url: string, ids: string[], extra: Record<string, unknown>, failure: string) {
  const results: any[] = []
  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids.slice(i, i + BULK_CHUNK_SIZE), ...extra }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error || failure)
    }
    results.push(await response.json())
  }
  return results
}

// Only open rows are resolved server-side; `skipped` is how many of the selection were already
// resolved (or gone), so the caller can say so instead of claiming all N were done.
export async function resolveTaskBasketItems(
  ids: string[],
  resolutionNote: string,
): Promise<{ resolvedIds: string[]; skipped: number }> {
  const results = await postInChunks("/api/task-basket/resolve", ids, { resolution_note: resolutionNote }, "Failed to resolve task basket items.")
  return {
    resolvedIds: results.flatMap((r) => r.resolvedIds || []),
    skipped: results.reduce((sum, r) => sum + (r.skipped || 0), 0),
  }
}

export async function deleteTaskBasketItems(ids: string[]): Promise<{ deletedIds: string[] }> {
  const results = await postInChunks("/api/task-basket/delete", ids, {}, "Failed to delete task basket items.")
  return { deletedIds: results.flatMap((r) => r.deletedIds || []) }
}

export async function getOpenTaskBasketCount(): Promise<number> {
  const { count, error } = await supabase
    .from("task_basket_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
  if (error) throw new Error(`Failed to count open task basket items: ${error.message}`)
  return count || 0
}
