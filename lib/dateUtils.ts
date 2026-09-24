// Date helpers for the DD/MM/YYYY entry convention used by <DateInput> (components/ui/date-input.tsx).
// Ported from the Company Bank Accounts module in bcl-registry, with two fixes: plain ISO dates are
// parsed as LOCAL calendar days (new Date("2026-09-18") is UTC midnight, which is the previous day in
// some time zones) and impossible dates like 31/02/2026 are rejected instead of rolling into March.

const pad = (n: number) => String(n).padStart(2, "0")

function localDate(year: number, month: number, day: number): Date | null {
  const d = new Date(year, month - 1, day)
  // Reject rollovers: 31/02 -> 03/03 would otherwise look like a valid date.
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d : null
}

export function parseDateString(input: string | Date | null | undefined): Date | null {
  if (!input) return null
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input
  if (typeof input !== "string") return null
  const text = input.trim()

  let m = text.match(/^(\d{4})[-/](\d{2})[-/](\d{2})(?:$|T|\s)/)
  if (m) return localDate(Number(m[1]), Number(m[2]), Number(m[3]))

  m = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (m) return localDate(Number(m[3]), Number(m[2]), Number(m[1]))

  return null
}

export function formatDateToDMY(input: string | Date | null | undefined): string | null {
  const d = parseDateString(input)
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : null
}

export function formatDateToIso(input: string | Date | null | undefined): string | null {
  const d = parseDateString(input)
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null
}

// What a date field holds -> what the API wants. "" (empty) is a valid "no date"; anything typed that
// isn't a real date comes back as "invalid" so the caller can stop the save instead of silently clearing it.
export function dateFieldToIso(value: string | null | undefined): string | "invalid" {
  if (!value || !value.trim()) return ""
  return formatDateToIso(value) ?? "invalid"
}

export function todayIso(): string {
  return formatDateToIso(new Date())!
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseDateString(iso) ?? new Date()
  d.setDate(d.getDate() + days)
  return formatDateToIso(d)!
}
