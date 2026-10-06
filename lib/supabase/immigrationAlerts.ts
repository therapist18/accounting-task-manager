import { supabase } from "./client"

// immigration_status_alerts lives in the shared Supabase project (created by bcl-registry's
// supabase/migrations/20261013000000_create_immigration_status_alerts.sql) and is kept in step with
// the Imm Status Manager's Grace / Expired tabs by bcl-registry's /api/cron/immigration-status-alerts
// (daily, 7am EAT). This module only reads it.

export type ImmigrationAlertStatus = "grace" | "expired"

export interface ImmigrationAlert {
  id: number
  individual_id: number
  uploaded_doc_id: number | null
  document_type_id: string | null
  status: ImmigrationAlertStatus
  person_name: string | null
  principal_name: string | null
  relationship: string | null
  company_name: string | null
  company_prefix: string | null
  doc_type_name: string | null
  expiry_date: string | null
  days_to_go: number | null
  detected_at: string
  last_seen_at: string
  resolved_at: string | null
}

export const IMMIGRATION_ALERT_STATUS_LABELS: Record<ImmigrationAlertStatus, string> = {
  expired: "Expired",
  grace: "In grace period",
}

export const IMMIGRATION_ALERTS_PATH = "/dashboard/immigration-alerts"

// Open alerts (people currently in Grace or Expired), most urgent first.
export async function getOpenImmigrationAlerts(): Promise<ImmigrationAlert[]> {
  const { data, error } = await supabase
    .from("immigration_status_alerts")
    .select("*")
    .is("resolved_at", null)
    .order("days_to_go", { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data || []) as ImmigrationAlert[]
}
