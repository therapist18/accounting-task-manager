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
  triggered_at: string
  resolved_at: string | null
  resolved_by: string | null
  resolution_note: string | null
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

export async function getOpenTaskBasketCount(): Promise<number> {
  const { count, error } = await supabase
    .from("task_basket_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
  if (error) throw new Error(`Failed to count open task basket items: ${error.message}`)
  return count || 0
}
