import type { ImmigrationAlertsResult } from "./immigrationAlerts"

// Server only (it reads the registry key): asks bcl-registry for the current Grace / Expired list. Needs BCL_REGISTRY_URL (the
// registry's base URL) and the shared read-only DOCUMENTS_REPORT_API_KEY, the same key bcl-registry's
// /api/documents-expiry-report uses.
export async function fetchImmigrationAlertsFromRegistry({ fresh = false } = {}): Promise<ImmigrationAlertsResult> {
  const baseUrl = process.env.BCL_REGISTRY_URL?.replace(/\/+$/, "")
  const apiKey = process.env.DOCUMENTS_REPORT_API_KEY
  if (!baseUrl) throw new Error("BCL_REGISTRY_URL is not configured")
  if (!apiKey) throw new Error("DOCUMENTS_REPORT_API_KEY is not configured")

  const res = await fetch(`${baseUrl}/api/immigration-status-alerts${fresh ? "?fresh=1" : ""}`, {
    headers: { "x-documents-api-key": apiKey },
    cache: "no-store",
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) throw new Error(json.error || `BCL Registry returned ${res.status}`)
  return { generatedAt: json.generatedAt, alerts: json.alerts || [] }
}
