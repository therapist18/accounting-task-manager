// Immigration status alerts: people whose Current Immigration Status is in its grace period or has
// expired — the same people as the Imm Status Manager's Grace / Expired tabs in bcl-registry, which
// calculates them on request (bcl-registry's /api/immigration-status-alerts, cached ~10 minutes).
// The browser reads them through this app's /api/immigration-alerts, which holds the registry key.

import { createSessionResource } from "./sessionCache"

export type ImmigrationAlertStatus = "grace" | "expired"

export interface ImmigrationAlert {
  // Stable per person + document + status; moving from Grace to Expired gives a new key.
  key: string
  individual_id: number
  uploaded_doc_id: string | null
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
  // The task job level the alert belongs to (e.g. IMMIGRATION / KEP) — what the page is tabbed by.
  job_level: {
    department_id: number | null
    department_name: string | null
    subdepartment_id: number | null
    subdepartment_name: string | null
  } | null
}

export interface ImmigrationAlertsResult {
  generatedAt: string
  alerts: ImmigrationAlert[]
}

export const IMMIGRATION_ALERT_STATUS_LABELS: Record<ImmigrationAlertStatus, string> = {
  expired: "Expired",
  grace: "In grace period",
}

export const IMMIGRATION_ALERTS_PATH = "/dashboard/immigration-alerts"

// Browser side. `fresh` asks the registry to recalculate instead of using its cache.
export async function getImmigrationAlerts({ fresh = false } = {}): Promise<ImmigrationAlertsResult> {
  const res = await fetch(`/api/immigration-alerts${fresh ? "?fresh=1" : ""}`, { cache: "no-store" })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) throw new Error(json.error || `Failed to load immigration alerts (${res.status})`)
  return { generatedAt: json.generatedAt, alerts: json.alerts || [] }
}

// One shared copy for everything in the browser that shows alerts - the layout's notifier, the
// dashboard card and the alerts page. Each used to fetch on its own (and the notifier again on every
// window focus), so one session sent a steady stream of identical requests.
export const ALERTS_REFRESH_MS = 2 * 60 * 1000
export const immigrationAlertsResource = createSessionResource(() => getImmigrationAlerts(), { staleMs: ALERTS_REFRESH_MS })
