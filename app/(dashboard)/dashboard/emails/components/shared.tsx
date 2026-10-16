"use client"

import { ArrowRightCircle, Bell, EyeOff, FilePlus2, Link2, Trash2, XCircle } from "lucide-react"
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
  // The rule that auto-opened this case, if any (null for a manually-created case, or one opened
  // before this link existed) — already present on the list fetch (a plain column on email_case,
  // `select("*")`), so the Rules sidebar can group cases by it without a per-case fetch.
  created_by_rule_id?: string | null
  // The rule's own details (pattern/category/active) — present on the case detail fetch only.
  created_by_rule?: { pattern: string; category_name: string; is_active: boolean } | null
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
  // Who (a person, on a manual reclassification) and when — null classified_by_id means the system
  // classified it automatically (a rule, see classification_source), not that it's unknown.
  classified_by_id?: string | null
  classified_by_name?: string | null
  classified_at?: string | null
  // The ignore rule that caused this email to be stored as ignored (null for auto-ignored no-reply
  // mail and for mail ignored by hand).
  matched_rule_id?: string | null
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
  // How much mail is actually stored for this mailbox, and how far back — email_accounts columns,
  // kept current by a trigger on `emails` (20261004000000).
  // first_email_at is the earliest STORED email, not the mailbox's true oldest message in Gmail —
  // most mail (certificates, acknowledgements, system noise) is deliberately never stored at all.
  email_count?: number
  first_email_at?: string | null
  created_at?: string | null
  // Audit (20261013000000): who connected it, and every connect / reconnect / link / move / unlink since.
  created_by_id?: string | null
  audit_log?: MailboxAuditEntry[]
}

export interface MailboxAuditEntry {
  action: "connected" | "reconnected" | "linked" | "moved" | "unlinked"
  by_id: string | null
  at: string
  company_id?: string
  from_company_id?: string
}

// Sync errors that mean Google no longer accepts this mailbox's stored login (revoked, expired, password
// changed, client secret rotated) — as opposed to a one-off failure on a single message. Only the person
// who owns the mailbox can fix these, by connecting it again.
const AUTH_FAILURE_RE = /invalid_grant|expired or revoked|invalid_client|unauthorized_client|invalid credentials|login required|unauthenticated/i

// A mailbox that has stopped working until it is reconnected: no longer active, or its last sync was
// refused by Google's token check.
export const needsReconnect = (a: Pick<AccountRow, "status" | "last_sync_error">) =>
  a.status !== "active" || (!!a.last_sync_error && AUTH_FAILURE_RE.test(a.last_sync_error))

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
  // Only meaningful when is_ignore is true: drop a match entirely instead of storing it under the
  // Ignored tab — for mail that has nothing to do with KRA at all.
  hard_ignore: boolean
  is_notify: boolean
  // Only meaningful when is_notify is true: "urgent" demands attention now, "informational" still
  // lands in Notifications but reads as FYI.
  notify_priority: "urgent" | "informational"
  // Which companies' mail the rule applies to: all (default), only company_ids, or all except company_ids.
  company_scope?: "all" | "only" | "except"
  company_ids?: string[]
  sender_pattern: string | null
  // Alternative senders; the rule matches sender_pattern OR any of these.
  extra_sender_patterns: string[]
  sender_match_type: "contains" | "regex" | null
  created_at?: string | null
  created_by_name?: string | null
  updated_at: string | null
  updated_by_name?: string | null
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
  // Whether this category opens a new task, or only updates one that already exists — see
  // lib/email-center/categories.ts. Both come straight through from the API's full CATEGORIES list.
  creates_case?: boolean
  attaches_to_case?: boolean
}

export interface StaffOption {
  id: string
  name: string
}

// What actually happens to a matching email — the one thing the Category pill alone doesn't say (a
// category name like "Demand / Penalty / Assessment" doesn't tell you whether it opens a task, only
// updates one, or is never stored at all). Checked in the same order ingestion itself decides it:
// ignore, then notify, then the category's own creates_case / attaches_to_case / disposition. Shared
// (not RulesPanel-local) so the Rules table and the Excel export render the exact same wording.
export type RuleOutcome = { icon: typeof FilePlus2; label: string; tone: string }

export function ruleOutcome(r: RuleRow, cat: CategoryOption | undefined): RuleOutcome {
  if (r.is_ignore && r.hard_ignore) return { icon: Trash2, label: "Deleted — never stored, no task", tone: "text-red-600" }
  if (r.is_ignore) return { icon: EyeOff, label: "Ignored — stored, no task", tone: "text-slate-500" }
  if (r.is_notify) {
    return r.notify_priority === "informational"
      ? { icon: Bell, label: "Notifications tab — FYI, no task", tone: "text-blue-600" }
      : { icon: Bell, label: "Notifications tab — flagged urgent, no task", tone: "text-amber-600" }
  }
  if (cat?.creates_case) return { icon: FilePlus2, label: "Opens a task", tone: "text-emerald-600" }
  if (cat?.attaches_to_case) return { icon: Link2, label: "Updates an existing task only", tone: "text-blue-600" }
  if (cat?.disposition === "needs_review") return { icon: ArrowRightCircle, label: "Needs Review — no task", tone: "text-amber-600" }
  if (cat?.disposition === "ignore") return { icon: EyeOff, label: "Ignored — stored, no task", tone: "text-slate-500" }
  // update_only with neither creates_case nor attaches_to_case (return_ack, certificate, statement):
  // ingest.ts only ever finds a case to attach to via an existing threadCase (attaches_to_case is
  // false, so the findOpenCaseByPin fallback never runs) — so this is stored only when the mail
  // happens to land in the same Gmail thread as an already-tracked task; otherwise it's dropped.
  return { icon: XCircle, label: "Update only — attaches if it's part of an existing task's thread, otherwise dropped (stays in Gmail)", tone: "text-slate-400" }
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
  // JSON is part of this client's contract. A non-JSON body (most commonly the /login page when the
  // session has expired and middleware followed a redirect) used to parse as `{}` and be handed back
  // as if it were a real payload, so the caller crashed later on some `undefined.filter(...)`. Fail
  // here with a clear message instead of returning a payload with no fields.
  const contentType = res.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) {
    throw new Error(
      res.status === 401 || res.status === 403 || res.redirected
        ? "Your session has expired. Please sign in again."
        : `Request failed (${res.status})`
    )
  }
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
  onCreateOption,
}: {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  className?: string
  disabled?: boolean
  error?: boolean
  variant?: "pill" | "default"
  onCreateOption?: (query: string) => void
}) {
  return (
    <SearchableSelect
      value={value}
      onValueChange={onChange}
      options={options}
      onCreateOption={onCreateOption}
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
