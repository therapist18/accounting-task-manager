"use client"

import { SearchableSelect, type Option } from "@/components/ui/searchable-select"
import { cn } from "@/lib/utils"
import { formatDateCell } from "../../summary-reports/components/reportCellRenderers"

// Shared building blocks for the Email Center — types + label maps (types.ts), shared chrome tokens
// (chrome.ts), date/metric/api helpers (utils.ts) and the SearchSelect dropdown every dialog/panel
// uses. Merged into one file so the module stays a handful of files instead of a dozen.

// ── types ───────────────────────────────────────────────────────────────────

export type Disposition = "action_required" | "update_only" | "ignore" | "needs_review"
export type ApprovalStatus = "not_responded" | "pending" | "approved" | "rejected" | "not_applicable"

export interface CaseRow {
  id: string
  case_ref: string
  company_id: string | null
  company_name: string | null
  gmail_thread_id: string | null
  category_key: string | null
  notice_type: string | null
  subject: string | null
  kra_pin: string | null
  kra_email_from: string | null
  kra_email_cc: string | null
  email_date: string | null
  deadline_date: string | null
  contents: string | null
  attachments_summary: string | null
  signing_officer_name: string | null
  signing_officer_position: string | null
  respond_date: string | null
  responded_by_id: string | null
  responded_by_name: string | null
  respond_contents: string | null
  promised_date: string | null
  approval_status: ApprovalStatus
  approval_date: string | null
  status: "open" | "closed"
  created_by_id: string | null
  created_by_name?: string | null
  assigned_to_id: string | null
  assigned_to_name: string | null
  assigned_by_name?: string | null
  assigned_at: string | null
  completed_by_id: string | null
  completed_by_name: string | null
  completed_at: string | null
}

export interface EmailRow {
  id: string
  gmail_message_id: string
  gmail_thread_id: string | null
  company_id: string | null
  company_name: string | null
  direction: "inbound" | "outbound"
  subject: string
  sender_email: string
  sender_name: string | null
  snippet: string | null
  ai_summary: string | null
  priority: "urgent" | "high" | "normal" | "low"
  is_read: boolean
  received_at: string
  has_attachments: boolean
  disposition: Disposition | null
  classification_source: string | null
  category_confidence: number | null
  review_reason: string | null
  kra_pin: string | null
  case_id: string | null
  category_key: string | null
  // "Handled by" audit trail for important notifications: who worked it and when (never a KRA
  // task/case). handled_at NULL = still active in the notifications basket.
  handled_by_id?: string | null
  handled_by_name?: string | null
  handled_at?: string | null
  // Present on rows from the list endpoint, so the email dialog can render from the table row with no
  // fetch of its own; only the body (kept in Gmail, not the database) is loaded on open.
  to_addresses?: string | null
  cc_addresses?: string | null
  attachments?: AttachmentRow[]
}

export interface EmailDetail extends EmailRow {
  body: string
}

export interface AttachmentRow {
  index: number
  filename: string
  mime_type: string | null
  size_bytes: number | null
  downloadable: boolean
}

export interface AccountRow {
  id: string
  email: string
  label: string | null
  status: string
  company_id: string | null
  company_name: string | null
  watch_expiry: string | null
  last_synced_at: string | null
  last_sync_error: string | null
}

// A subject -> category classification rule (email_classification_rules). `id` starts with "builtin-"
// when the table doesn't exist yet and the built-in list is shown read-only.
// A subject rule (email_classification_rules). `is_ignore` makes it an auto-ignore rule instead of a
// classify rule. `id` starts with "builtin-" when the table doesn't exist yet and the built-in list
// is shown read-only.
export interface RuleRow {
  id: string
  match_type: "contains" | "regex"
  pattern: string
  // Alternative subject wordings; the rule matches the primary pattern OR any of these.
  extra_patterns: string[]
  category_key: string
  confidence: number
  sort_order: number
  is_active: boolean
  notes: string | null
  is_ignore: boolean
  is_notify: boolean
  sender_pattern: string | null
  sender_match_type: "contains" | "regex" | null
  updated_at: string | null
}

export interface CompanyOption {
  id: string
  company_name: string
  kra_pin: string | null
}

export interface CategoryOption {
  id: string
  key: string
  name: string
  color: string | null
  disposition: Disposition | null
}

export interface StaffOption {
  id: string
  name: string
}

export const DISPOSITION_LABEL: Record<Disposition, string> = {
  action_required: "Action required",
  update_only: "Update only",
  ignore: "Ignored",
  needs_review: "Needs review",
}

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  not_responded: "Not responded",
  pending: "Pending KRA",
  approved: "Approved",
  rejected: "Rejected",
  not_applicable: "N/A",
}

// ── shared chrome tokens ─────────────────────────────────────────────────────
// Matches the Passport Endorsement Tracking module's design language (rounded-full pill
// tabs/buttons on the custom-blue accent, soft-tint status badges) so this module reads as part of
// the same app instead of a bolted-on page.

export const TAB_LIST_CLASS = "bg-slate-100/90 p-1 h-auto rounded-lg border border-slate-200/80 flex-wrap gap-1"
export const TAB_TRIGGER_CLASS =
  "group gap-2 rounded-md px-4 h-10 text-base font-medium text-slate-600 hover:text-slate-900 hover:bg-white/70 transition-all data-[state=active]:bg-custom-blue data-[state=active]:text-white data-[state=active]:shadow-xs"
export const COUNT_BADGE_CLASS =
  "inline-flex items-center justify-center font-semibold tabular-nums px-1.5 py-0.5 rounded-full text-sm min-w-[1.25rem] leading-none bg-slate-200 text-slate-700 group-data-[state=active]:bg-white/20 group-data-[state=active]:text-white"
export const URGENT_BADGE_CLASS =
  "inline-flex items-center justify-center font-semibold tabular-nums px-1.5 py-0.5 rounded-full text-sm min-w-[1.25rem] leading-none bg-amber-500 text-white"

export const PILL_BUTTON_CLASS =
  "h-10 px-3.5 rounded-md text-base font-medium gap-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all shadow-none"
export const PILL_BUTTON_ACTIVE_CLASS = "bg-custom-blue border-custom-blue text-white hover:bg-custom-blue hover:text-white"
export const PRIMARY_PILL_BUTTON_CLASS =
  "h-10 px-4 rounded-md text-base font-semibold gap-2 text-white shadow-xs transition-all disabled:opacity-70 bg-custom-blue hover:bg-custom-blue/90"

// Soft pill badges (bg-*-50 / text-*-700 / border-*-200) — same convention as the passport module's
// STEP_BADGE_CLASSES, gentler than solid-fill badges for a table with many rows.
export const APPROVAL_BADGE: Record<ApprovalStatus, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  not_responded: "bg-slate-100 text-slate-600 border-slate-200",
  not_applicable: "bg-slate-100 text-slate-500 border-slate-200",
}

export const DISPOSITION_BADGE: Record<Disposition, string> = {
  action_required: "bg-red-50 text-red-700 border-red-200",
  update_only: "bg-blue-50 text-blue-700 border-blue-200",
  ignore: "bg-slate-100 text-slate-500 border-slate-200",
  needs_review: "bg-amber-50 text-amber-700 border-amber-200",
}

// Table header colour bands (mirrors GROUP_ACCENTS in the passport module's HandlingTable): each
// phase of the sheet keeps a distinct identity across the header row and its column tint.
export const FROM_KRA_BAND = { header: "bg-custom-blue text-white", tint: "bg-blue-50/60" }
export const RESPOND_BAND = { header: "bg-emerald-600 text-white", tint: "bg-emerald-50/60" }
export const TRACKING_BAND = { header: "bg-slate-600 text-white", tint: "bg-slate-100" }

// ── helpers ──────────────────────────────────────────────────────────────────

const DAY = 86_400_000

// "Today" as a Kenya calendar date — deadlines are whole local days, so a browser in another time
// zone must not shift a case across midnight.
export function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date())
}

const utc = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`)

export function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null
  return Math.round((utc(to) - utc(from)) / DAY)
}

// Date display follows the app-wide convention (dd/MM/yyyy, plus HH:mm when "Show Time" is on) via
// the same formatDateCell the Reports / Summary Reports / Immigration modules use.
// Date-only values (a case's email/deadline/respond dates) never get a time appended — they have none.
export function fmtDate(ymd: string | null | undefined): string {
  if (!ymd) return ""
  const [y, m, d] = ymd.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

// Full timestamps (email received, last sync, completed/assigned at …): honours the Show/Hide Time toggle.
export function fmtDateTime(iso: string | null | undefined, showTime = true): string {
  if (!iso) return ""
  return formatDateCell(iso, showTime)
}

export interface CaseMetrics {
  daysGiven: number | null // K: deadline - email date
  daysSince: number | null // L: today - email date
  daysRemaining: number | null // Q: promised date - today
  state: "overdue" | "pending" | "approved" | "normal"
}

export function caseMetrics(c: CaseRow, today = todayYmd()): CaseMetrics {
  const daysGiven = daysBetween(c.email_date, c.deadline_date)
  const daysSince = daysBetween(c.email_date, today)
  const daysRemaining = daysBetween(today, c.promised_date)

  let state: CaseMetrics["state"] = "normal"
  if (c.status === "open") {
    const pastDeadlineUnanswered = !!c.deadline_date && c.deadline_date < today && !c.respond_date
    const pastPromisedUnapproved =
      !!c.promised_date && c.promised_date < today && c.approval_status !== "approved"
    if (pastDeadlineUnanswered || pastPromisedUnapproved) state = "overdue"
    else if (c.approval_status === "approved") state = "approved"
    else if (c.respond_date && c.approval_status === "pending") state = "pending"
  }
  return { daysGiven, daysSince, daysRemaining, state }
}

// "Wanjiku Kamau <w@x.com>" -> "Wanjiku Kamau"; falls back to the address' local part.
export function senderName(e: Pick<EmailRow, "sender_name" | "sender_email">): string {
  return e.sender_name?.trim() || e.sender_email.split("@")[0] || e.sender_email
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "")).toUpperCase()
}

// Stable avatar colour per sender, so the same person looks the same everywhere.
const AVATAR_TONES = [
  "bg-blue-600", "bg-emerald-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-cyan-700", "bg-indigo-600", "bg-teal-600",
]
export function avatarTone(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_TONES[h % AVATAR_TONES.length]
}

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) throw new Error(json.error || `Request failed (${res.status})`)
  return json as T
}

// ── SearchSelect ────────────────────────────────────────────────────────────
// Thin wrapper over the app's existing SearchableSelect (Popover + Command, already used across
// other modules) so every dropdown in this module — company/staff pickers with long, growing lists
// especially — is searchable instead of a plain <select>, with one place to keep the styling
// consistent. Sized to match IDM's h-10 / text-base inputs.
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className,
  disabled,
  error,
  variant = "default",
}: {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  className?: string
  disabled?: boolean
  error?: boolean
  variant?: "pill" | "default"
}) {
  return (
    <SearchableSelect
      value={value}
      onValueChange={onChange}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      buttonClassName={cn(
        "h-10 text-base font-normal rounded-md border-slate-200 bg-white text-slate-700 shadow-none hover:bg-slate-50 focus-visible:ring-1 focus-visible:ring-custom-blue",
        variant === "pill" && "rounded-md",
        error && "border-red-300 text-red-600"
      )}
    />
  )
}