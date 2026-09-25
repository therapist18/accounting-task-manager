import { CATEGORY_BY_KEY } from "./categories"
import { DEFAULT_SUBJECT_RULES, type RuleMatchType, type SubjectRule } from "./rules"
import type { getServiceClient } from "./service"

// Loads the subject -> category rules from email_classification_rules. Kept apart from rules.ts (pure,
// no I/O) so the matching logic stays trivially testable.
//
// Ingestion classifies many emails per sync, so the active rules are cached for a short while instead of
// being re-queried per message; saving a rule drops the cache on this instance straight away (other
// instances pick the change up when their cache expires, at most CACHE_MS later).

const CACHE_MS = 60_000
let cache: { at: number; rules: SubjectRule[] } | null = null

export const RULES_TABLE = "email_classification_rules"

// Columns every rule read/write uses. extra_patterns arrived in a later migration, so it is kept apart:
// if that column doesn't exist yet the callers retry without it and treat every rule as having no extra
// wordings, instead of failing (and, for ingestion, silently falling back to the built-in list).
export const RULE_COLUMNS_BASE =
  "id, match_type, pattern, category_key, confidence, sort_order, is_active, notes, is_ignore, is_notify, sender_pattern, sender_match_type, updated_at"
export const RULE_COLUMNS = `${RULE_COLUMNS_BASE}, extra_patterns`
export const isMissingExtraColumn = (error: { message?: string } | null | undefined) =>
  !!error && /extra_patterns/i.test(error.message ?? "")
export const EXTRA_MIGRATION_MESSAGE =
  "Saving several wordings for one rule needs the 20260927000000_email_rule_extra_patterns.sql migration applied first."

// A rule row as the client sees it: numeric confidence, and always a wordings array.
export function normalizeRuleRow(r: any) {
  return { ...r, confidence: Number(r.confidence), extra_patterns: Array.isArray(r.extra_patterns) ? r.extra_patterns : [] }
}

export function invalidateRulesCache() {
  cache = null
}

export async function loadSubjectRules(sb: ReturnType<typeof getServiceClient>): Promise<SubjectRule[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rules

  const read = (columns: string) =>
    sb
      .from(RULES_TABLE)
      .select(columns)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })

  let { data, error } = await read(`${RULE_COLUMNS_BASE}, extra_patterns`)
  if (isMissingExtraColumn(error)) ({ data, error } = await read(RULE_COLUMNS_BASE))

  // Table not created yet / unreachable: keep classifying with the built-in list rather than failing
  // every email. (An existing-but-empty table is respected — that is a deliberate "no rules".)
  if (error) {
    console.warn("[email-center] rules table unavailable, using built-in rules:", error.message)
    return DEFAULT_SUBJECT_RULES
  }

  const rules: SubjectRule[] = (data ?? [])
    .filter((r: any) => CATEGORY_BY_KEY.has(r.category_key))
    .map((r: any) => ({
      id: r.id,
      match_type: r.match_type as RuleMatchType,
      pattern: r.pattern,
      extra_patterns: Array.isArray(r.extra_patterns) ? (r.extra_patterns as string[]) : [],
      category_key: r.category_key,
      confidence: Number(r.confidence),
      is_ignore: !!r.is_ignore,
      is_notify: !!r.is_notify,
      sender_pattern: r.sender_pattern ?? undefined,
      sender_match_type: (r.sender_match_type as RuleMatchType | undefined) ?? undefined,
    }))

  cache = { at: Date.now(), rules }
  return rules
}
