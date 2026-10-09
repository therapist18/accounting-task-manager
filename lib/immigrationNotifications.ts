// Immigration notifications + payments: the two tables the EFNS immigration web-automation writes
// into this app's shared Supabase project (immigration_notifications, immigration_payments), folded
// into one row shape so the Immigration Notifications page can list, group and filter both side by
// side.
//
// The automation's WhatsApp summary logic is mirrored here — the same short statuses
// (getShortMessage) and the same permit-type bands (getPermitType) — so a row reads in this app the
// way it reads in the WhatsApp group, and the permit-type tabs match what the group already uses.

import { getClientSupabaseInstance } from "@/lib/supabase"

export const IMMIGRATION_BUCKET = "immigration"
const NOTIFICATION_PDF_PREFIX = "daily-extractions/notification_pdfs"
const PAYMENT_PDF_PREFIX = "daily-extractions/payment_instructions"

export type ItemKind = "notification" | "payment"

export interface ImmigrationItem {
  // Stable across a refresh: `n-<id>` for a notification, `p-<id>` for a payment.
  key: string
  kind: ItemKind
  id: number | null
  name: string
  // The raw label for the row's Application type column (e.g. "SPECIAL PASS", "Dependent's pass").
  applicationType: string
  // The canonical group the row's permit-type tab belongs to (e.g. "DEPENDANT PASS").
  permitGroup: string
  // Human status, e.g. "APPROVED", "ISSUED", "PAID".
  status: string
  // The tab bucket for `status` — identical to `status` for now, kept separate so the two can drift
  // if the automation ever starts writing a normalized status column.
  statusKey: string
  date: string
  dateIso: string
  iso: string
  message: string
  feeType: string
  amount: string
  pdfUrl: string | null
  pdfName: string | null
}

// ── status ──────────────────────────────────────────────────────────────────
// Exactly the automation's UtilityHelpers.getShortMessage, so "Your permit has been Issued" becomes
// the same ISSUED band in this app as in WhatsApp.
export function shortNotifStatus(full: string): string {
  const m = (full || "").toLowerCase()
  if (m.includes("received")) return "APPLICATION RECEIVED"
  if (m.includes("deferred")) return "APPLICATION DEFERRED"
  if (m.includes("issued")) return "ISSUED"
  if (m.includes("invoice")) return "INVOICE"
  if (m.includes("cancellation")) return "CANCELLED"
  if (m.includes("reminder")) return "REMINDER"
  if (m.includes("approved")) return "APPROVED"
  if (m.includes("upload")) return "UPLOAD REQUIRED"
  if (m.includes("progress")) return "IN PROGRESS"
  if (m.includes("complied")) return "COMPILED"
  if (m.includes("edit")) return "TO BE EDITED"
  return "NOTIFICATION"
}

// Status tabs that come before the rest, in this order (mirrors how the automation groups a run's
// summary: approved first, then issued, then invoice-driven work). Anything else tabs alphabetically.
export const STATUS_PREFERRED = [
  "APPROVED",
  "ISSUED",
  "INVOICE",
  "NOT PAID",
  "PAID",
  "UPLOAD REQUIRED",
  "APPLICATION RECEIVED",
  "APPLICATION DEFERRED",
  "IN PROGRESS",
  "REMINDER",
  "CANCELLED",
  "COMPILED",
  "TO BE EDITED",
  "NOTIFICATION",
]

export function sortStatuses(statuses: string[]): string[] {
  return [...statuses].sort((a, b) => {
    const ia = STATUS_PREFERRED.indexOf(a)
    const ib = STATUS_PREFERRED.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })
}

// ── permit groups ───────────────────────────────────────────────────────────
// Notifications already carry a permit group (PERMIT, SPECIAL PASS, DEPENDANT PASS, FNS, PERMANENT
// RESIDENCE, CITIZENSHIP). Payments carry an application category instead, mapped onto the same
// groups so a single permit-type tab row covers both.
const PAYMENT_PERMIT_GROUP: Record<string, string> = {
  "permit issuance/renewal": "PERMIT",
  "permit renewal": "PERMIT",
  "permit issuance": "PERMIT",
  "dependent's pass": "DEPENDANT PASS",
  "dependant pass": "DEPENDANT PASS",
  "dependant's pass": "DEPENDANT PASS",
  "children & dependants": "DEPENDANT PASS",
  "special pass": "SPECIAL PASS",
  "foreign national application": "FNS",
  "foreign national certificate": "FNS",
  "permanent residence": "PERMANENT RESIDENCE",
  "extension of a visitor's pass": "VISITOR'S PASS",
  "re-entry pass application": "RE-ENTRY PASS",
  "lawful residents": "LAWFUL RESIDENT",
  "citizenship by marriage": "CITIZENSHIP",
  "persons with disability": "OTHER",
}

export const PERMIT_GROUP_PREFERRED = [
  "PERMIT",
  "SPECIAL PASS",
  "DEPENDANT PASS",
  "FNS",
  "PERMANENT RESIDENCE",
  "CITIZENSHIP",
  "VISITOR'S PASS",
  "RE-ENTRY PASS",
  "LAWFUL RESIDENT",
  "OTHER",
]

export function paymentPermitGroup(category: string | null | undefined): string {
  const key = (category || "").trim().toLowerCase()
  if (!key) return "OTHER"
  return PAYMENT_PERMIT_GROUP[key] ?? key.toUpperCase()
}

export function sortPermitGroups(groups: string[]): string[] {
  return [...groups].sort((a, b) => {
    const ia = PERMIT_GROUP_PREFERRED.indexOf(a)
    const ib = PERMIT_GROUP_PREFERRED.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })
}

// ── mapping ─────────────────────────────────────────────────────────────────
const toDisplayDate = (raw: unknown): { display: string; iso: string } => {
  const s = String(raw ?? "").trim()
  if (!s) return { display: "", iso: "" }
  const m = /^(\d{4})[/-](\d{2})[/-](\d{2})/.exec(s)
  if (!m) return { display: "", iso: "" }
  return { display: `${m[3]}/${m[2]}/${m[1]}`, iso: `${m[1]}-${m[2]}-${m[3]}` }
}

const storageUrl = (path: string): string | null => {
  try {
    const { data } = getClientSupabaseInstance().storage.from(IMMIGRATION_BUCKET).getPublicUrl(path)
    return data?.publicUrl ?? null
  } catch {
    return null
  }
}

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" ? (value as Record<string, any>) : {}

function mapNotification(row: Record<string, any>): ImmigrationItem {
  const { display, iso: dateIso } = toDisplayDate(row.date)
  const status = shortNotifStatus(String(row.message || ""))
  const rawType = String(row.permit_type || row.case_type || "").trim()
  const permitGroup = rawType ? rawType.toUpperCase() : "NOTIFICATION"
  const pdfName = row.pdf_file_name ? String(row.pdf_file_name) : null
  return {
    key: `n-${row.id}`,
    kind: "notification",
    id: typeof row.id === "number" ? row.id : null,
    name: String(row.name || "Unknown"),
    applicationType: rawType || "Notification",
    permitGroup,
    status,
    statusKey: status,
    date: display,
    dateIso,
    iso: String(row.created_at || ""),
    message: String(row.message || ""),
    feeType: "",
    amount: "",
    pdfUrl: pdfName ? storageUrl(`${NOTIFICATION_PDF_PREFIX}/${pdfName}`) : null,
    pdfName,
  }
}

function mapPayment(row: Record<string, any>): ImmigrationItem {
  const { display, iso: dateIso } = toDisplayDate(row.date_issued)
  const category = String(row.application_category || row.application_name || "").trim()
  const status = String(row.invoice_status || "Not Paid")
  const pdfName = row.payment_instructions_file_name ? String(row.payment_instructions_file_name) : null
  const amount = row.payment_amount ?? row.amount
  return {
    key: `p-${row.id}`,
    kind: "payment",
    id: typeof row.id === "number" ? row.id : null,
    name: String(row.applicant_name || row.application_name || "Unknown"),
    applicationType: category || "Payment",
    permitGroup: paymentPermitGroup(category),
    status,
    statusKey: status.toUpperCase(),
    date: display,
    dateIso,
    iso: String(row.created_at || ""),
    message: String(row.fee_type || ""),
    feeType: String(row.fee_type || ""),
    amount: amount != null && amount !== "" ? String(amount) : "",
    pdfUrl: pdfName ? storageUrl(`${PAYMENT_PDF_PREFIX}/${pdfName}`) : null,
    pdfName,
  }
}

// ── fetch ───────────────────────────────────────────────────────────────────
type SupabaseClientLike = ReturnType<typeof getClientSupabaseInstance>

const PAGE = 1000
const MAX_ROWS = 20000

async function fetchAll(supabase: SupabaseClientLike, table: string): Promise<Record<string, any>[]> {
  const rows: Record<string, any>[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const batch = (data ?? []) as Record<string, any>[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows
}

// Everything, newest record first. The two tables together are only a few thousand rows, so like
// Immigration Alerts this fetches once and lets the tabs/search/column filters re-slice in memory.
export async function fetchImmigrationItems(): Promise<ImmigrationItem[]> {
  const supabase = getClientSupabaseInstance()
  const [notifications, payments] = await Promise.all([
    fetchAll(supabase, "immigration_notifications"),
    fetchAll(supabase, "immigration_payments"),
  ])
  const items = [
    ...(notifications ?? []).map((r) => mapNotification(asRecord(r))),
    ...(payments ?? []).map((r) => mapPayment(asRecord(r))),
  ]
  items.sort((a, b) => {
    const ak = a.iso || a.dateIso
    const bk = b.iso || b.dateIso
    return bk.localeCompare(ak)
  })
  return items
}
