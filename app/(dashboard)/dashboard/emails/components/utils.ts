import type { CaseRow } from "./types"

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

// Sheet style: 21.08.2026
export function fmtDate(ymd: string | null | undefined): string {
  if (!ymd) return ""
  const [y, m, d] = ymd.slice(0, 10).split("-")
  return `${d}.${m}.${y}`
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ""
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Africa/Nairobi",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
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

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) throw new Error(json.error || `Request failed (${res.status})`)
  return json as T
}
