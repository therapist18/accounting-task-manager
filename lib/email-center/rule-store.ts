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

export function invalidateRulesCache() {
  cache = null
}

export async function loadSubjectRules(sb: ReturnType<typeof getServiceClient>): Promise<SubjectRule[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rules

  const { data, error } = await sb
    .from(RULES_TABLE)
    .select("id, match_type, pattern, category_key, confidence")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

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
      category_key: r.category_key,
      confidence: Number(r.confidence),
    }))

  cache = { at: Date.now(), rules }
  return rules
}
