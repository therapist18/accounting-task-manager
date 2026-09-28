import { CATEGORY_BY_KEY } from "./categories"
import { compileRule, type RuleMatchType } from "./rules"

export interface RuleInput {
  is_ignore?: boolean
  is_notify?: boolean
  // Only meaningful when is_ignore is true: drop a match entirely instead of storing it under Ignored.
  hard_ignore?: boolean
  match_type?: RuleMatchType
  pattern?: string
  extra_patterns?: string[]
  sender_pattern?: string
  extra_sender_patterns?: string[]
  sender_match_type?: RuleMatchType
  category_key?: string
  confidence?: number
  sort_order?: number
  is_active?: boolean
  notes?: string | null
}

// Shared by the create and edit routes. `full` = a create (a subject and/or sender pattern, and a
// category for classify rules, are required); a partial edit only validates the fields that were sent.
export function parseRuleBody(
  raw: unknown,
  partial: boolean
): { ok: true; value: RuleInput } | { ok: false; error: string } {
  const body = (raw ?? {}) as Record<string, unknown>
  const value: RuleInput = {}

  if ("is_ignore" in body) value.is_ignore = !!body.is_ignore
  if ("is_notify" in body) value.is_notify = !!body.is_notify
  if ("hard_ignore" in body) value.hard_ignore = !!body.hard_ignore
  if ("match_type" in body) {
    if (body.match_type !== "contains" && body.match_type !== "regex") return { ok: false, error: "Match type must be 'contains' or 'regex'." }
    value.match_type = body.match_type
  }
  if ("pattern" in body) {
    const pattern = typeof body.pattern === "string" ? body.pattern.trim() : ""
    if (pattern.length > 300) return { ok: false, error: "Pattern is too long (300 characters max)." }
    value.pattern = pattern
  }
  if ("extra_patterns" in body) {
    if (!Array.isArray(body.extra_patterns)) return { ok: false, error: "Extra wordings must be a list." }
    const seen = new Set<string>()
    const list: string[] = []
    for (const raw of body.extra_patterns) {
      const w = typeof raw === "string" ? raw.trim() : ""
      if (!w) continue
      if (w.length > 300) return { ok: false, error: "A wording is too long (300 characters max)." }
      if (seen.has(w.toLowerCase())) continue
      seen.add(w.toLowerCase())
      list.push(w)
    }
    if (list.length > 30) return { ok: false, error: "Too many wordings for one rule (30 max)." }
    value.extra_patterns = list
  }
  if ("sender_pattern" in body) {
    const sender_pattern = typeof body.sender_pattern === "string" ? body.sender_pattern.trim() : ""
    if (sender_pattern.length > 300) return { ok: false, error: "Sender pattern is too long (300 characters max)." }
    value.sender_pattern = sender_pattern
  }
  if ("extra_sender_patterns" in body) {
    if (!Array.isArray(body.extra_sender_patterns)) return { ok: false, error: "Extra senders must be a list." }
    const seen = new Set<string>()
    const list: string[] = []
    for (const raw of body.extra_sender_patterns) {
      const w = typeof raw === "string" ? raw.trim() : ""
      if (!w) continue
      if (w.length > 300) return { ok: false, error: "A sender is too long (300 characters max)." }
      if (seen.has(w.toLowerCase())) continue
      seen.add(w.toLowerCase())
      list.push(w)
    }
    if (list.length > 30) return { ok: false, error: "Too many senders for one rule (30 max)." }
    value.extra_sender_patterns = list
  }
  if ("sender_match_type" in body) {
    if (body.sender_match_type !== "contains" && body.sender_match_type !== "regex") return { ok: false, error: "Sender match type must be 'contains' or 'regex'." }
    value.sender_match_type = body.sender_match_type
  }
  if ("category_key" in body) {
    if (typeof body.category_key !== "string" || !CATEGORY_BY_KEY.has(body.category_key)) return { ok: false, error: "Unknown category." }
    value.category_key = body.category_key
  }
  if ("confidence" in body) {
    const c = Number(body.confidence)
    if (!Number.isFinite(c) || c < 0 || c > 1) return { ok: false, error: "Confidence must be between 0 and 1." }
    value.confidence = Math.round(c * 100) / 100
  }
  if ("sort_order" in body) {
    const n = Number(body.sort_order)
    if (!Number.isInteger(n)) return { ok: false, error: "Order must be a whole number." }
    value.sort_order = n
  }
  if ("is_active" in body) value.is_active = !!body.is_active
  if ("notes" in body) value.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : null

  // A wording is a wording: if the primary one was left empty, the first extra becomes the primary, and
  // one that just repeats the primary is dropped. Same idea for senders.
  if (value.extra_patterns) {
    if (!value.pattern && !partial && value.extra_patterns.length) value.pattern = value.extra_patterns.shift()
    if (value.pattern) value.extra_patterns = value.extra_patterns.filter((w) => w.toLowerCase() !== value.pattern!.toLowerCase())
  }
  if (value.extra_sender_patterns) {
    if (!value.sender_pattern && !partial && value.extra_sender_patterns.length) value.sender_pattern = value.extra_sender_patterns.shift()
    if (value.sender_pattern) {
      value.extra_sender_patterns = value.extra_sender_patterns.filter((w) => w.toLowerCase() !== value.sender_pattern!.toLowerCase())
    }
  }

  if (!partial) {
    // Ignore and notify rules are not mutually exclusive flags from the API; the UI enforces that.
    if (value.is_ignore && value.is_notify) return { ok: false, error: "A rule can't both ignore and notify." }
    if (!value.is_ignore) value.hard_ignore = false
    if (!value.pattern && !value.sender_pattern) return { ok: false, error: "Set a subject pattern or a sender to match." }
    if (value.is_ignore) {
      // The DB keeps category_key NOT NULL; "system_noise" is the ignore-disposition category and is
      // ignored for ignore rules anyway.
      value.category_key = "system_noise"
    } else if (value.is_notify) {
      // Same idea for notifications — "notification" carries the needs_review disposition.
      value.category_key = "notification"
    } else {
      if (!value.pattern) return { ok: false, error: "A classify rule needs a subject pattern." }
      if (!value.category_key) return { ok: false, error: "Category is required." }
    }
    value.match_type ??= "contains"
  }

  if (value.pattern && value.match_type) {
    if (!compileRule({ match_type: value.match_type, pattern: value.pattern })) {
      return { ok: false, error: "That isn't a valid regular expression." }
    }
  }
  if (value.extra_patterns?.length && value.match_type) {
    for (const w of value.extra_patterns) {
      if (!compileRule({ match_type: value.match_type, pattern: w })) return { ok: false, error: `"${w}" isn't a valid regular expression.` }
    }
  }
  if (value.sender_pattern) {
    if (!compileRule({ match_type: value.sender_match_type ?? "contains", pattern: value.sender_pattern })) {
      return { ok: false, error: "That isn't a valid regular expression for the sender." }
    }
  }
  if (value.extra_sender_patterns?.length) {
    const senderMatchType = value.sender_match_type ?? "contains"
    for (const w of value.extra_sender_patterns) {
      if (!compileRule({ match_type: senderMatchType, pattern: w })) return { ok: false, error: `"${w}" isn't a valid regular expression for the sender.` }
    }
  }
  return { ok: true, value }
}
