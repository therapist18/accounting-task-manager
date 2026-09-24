import { CATEGORY_BY_KEY } from "./categories"
import { compileRule, type RuleMatchType } from "./rules"

export interface RuleInput {
  match_type?: RuleMatchType
  pattern?: string
  category_key?: string
  confidence?: number
  sort_order?: number
  is_active?: boolean
  notes?: string | null
}

// Shared by the create and edit routes. `full` = a create (pattern and category are required); a
// partial edit only validates the fields that were sent.
export function parseRuleBody(
  raw: unknown,
  partial: boolean
): { ok: true; value: RuleInput } | { ok: false; error: string } {
  const body = (raw ?? {}) as Record<string, unknown>
  const value: RuleInput = {}

  if ("match_type" in body) {
    if (body.match_type !== "contains" && body.match_type !== "regex") return { ok: false, error: "Match type must be 'contains' or 'regex'." }
    value.match_type = body.match_type
  }
  if ("pattern" in body) {
    const pattern = typeof body.pattern === "string" ? body.pattern.trim() : ""
    if (!pattern) return { ok: false, error: "Pattern is required." }
    if (pattern.length > 300) return { ok: false, error: "Pattern is too long (300 characters max)." }
    value.pattern = pattern
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

  if (!partial) {
    if (!value.pattern) return { ok: false, error: "Pattern is required." }
    if (!value.category_key) return { ok: false, error: "Category is required." }
    value.match_type ??= "contains"
  }

  if (value.pattern && value.match_type) {
    if (!compileRule({ match_type: value.match_type, pattern: value.pattern })) {
      return { ok: false, error: "That isn't a valid regular expression." }
    }
  }
  return { ok: true, value }
}
