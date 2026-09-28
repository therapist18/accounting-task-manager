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

// Columns every rule read/write uses, plus three that arrived in later, independent migrations
// (extra_patterns 20260927, hard_ignore 20261001, extra_sender_patterns 20261002) — a database can
// have any subset of them applied, not necessarily all-or-nothing (e.g. extra_patterns applied with
// real saved wordings, hard_ignore not yet). withOptionalColumnFallback() below drops ONLY the
// specific column Postgres reports missing and retries, one at a time — never all three together,
// which would otherwise make a column that genuinely exists (with real data in it) disappear from
// every response just because a DIFFERENT, unrelated column hadn't been added yet.
export const RULE_COLUMNS_BASE =
  "id, match_type, pattern, category_key, confidence, sort_order, is_active, notes, is_ignore, is_notify, sender_pattern, sender_match_type, created_at, created_by_id, updated_at, updated_by_id"
const OPTIONAL_RULE_COLUMNS = ["extra_patterns", "hard_ignore", "extra_sender_patterns"] as const
export type OptionalRuleColumn = (typeof OPTIONAL_RULE_COLUMNS)[number]
export const RULE_COLUMNS = `${RULE_COLUMNS_BASE}, ${OPTIONAL_RULE_COLUMNS.join(", ")}`

// The column list for a read, given the set already known to be missing.
export function ruleColumns(dropped: ReadonlySet<string> = new Set()): string {
  return [RULE_COLUMNS_BASE, ...OPTIONAL_RULE_COLUMNS.filter((c) => !dropped.has(c))].join(", ")
}

// A write payload with the already-known-missing keys removed.
export function withoutDroppedColumns<T extends Record<string, unknown>>(row: T, dropped: ReadonlySet<string>): Partial<T> {
  const copy: Partial<T> = { ...row }
  for (const k of dropped) delete (copy as any)[k]
  return copy
}

// Column-name substring match against the error text — deliberately not a strict "does not exist"
// parse, since Postgres and PostgREST phrase a missing column differently (a raw SQL error vs.
// PostgREST's own "could not find the 'x' column ... in the schema cache" for insert/update) and
// this works against either without needing to know which one produced it.
function missingRuleColumn(error: { message?: string } | null | undefined): OptionalRuleColumn | null {
  const msg = error?.message ?? ""
  return OPTIONAL_RULE_COLUMNS.find((c) => new RegExp(c, "i").test(msg)) ?? null
}
export const isMissingExtraColumn = (error: { message?: string } | null | undefined) => missingRuleColumn(error) === "extra_patterns"
export const isMissingHardIgnoreColumn = (error: { message?: string } | null | undefined) => missingRuleColumn(error) === "hard_ignore"
export const isMissingExtraSenderColumn = (error: { message?: string } | null | undefined) => missingRuleColumn(error) === "extra_sender_patterns"
export const EXTRA_MIGRATION_MESSAGE =
  "Saving several wordings for one rule needs the 20260927000000_email_rule_extra_patterns.sql migration applied first."
export const EXTRA_SENDER_MIGRATION_MESSAGE =
  "Saving several senders for one rule needs the 20261002000000_email_rule_extra_sender_patterns.sql migration applied first."

// Runs `run` with an ever-shrinking set of "known missing" optional columns: on an error naming one
// of the three, that column is added to `dropped` and `run` is retried — up to once per optional
// column, so at most 4 attempts. `guard`, if given, is checked right before a column would actually
// be dropped; returning a message aborts the retry instead (used to refuse silently discarding real
// extra_patterns/extra_sender_patterns data rather than saving the rule without it).
export async function withOptionalColumnFallback<T>(
  run: (dropped: ReadonlySet<OptionalRuleColumn>) => Promise<{ data: T | null; error: any }>,
  guard?: (col: OptionalRuleColumn) => string | void
): Promise<{ data: T | null; error: any; dropped: Set<OptionalRuleColumn>; blocked?: string }> {
  const dropped = new Set<OptionalRuleColumn>()
  for (let attempt = 0; attempt <= OPTIONAL_RULE_COLUMNS.length; attempt++) {
    const res = await run(dropped)
    if (!res.error) return { ...res, dropped }
    const missing = missingRuleColumn(res.error)
    if (!missing || dropped.has(missing)) return { ...res, dropped }
    const blocked = guard?.(missing)
    if (blocked) return { data: null, error: res.error, dropped, blocked }
    dropped.add(missing)
  }
  return { data: null, error: new Error("email_classification_rules: too many missing columns"), dropped }
}

// A rule row as the client sees it: numeric confidence, always a wordings array, and hard_ignore
// defaulted (false) for a row read before that column existed.
export function normalizeRuleRow(r: any) {
  return {
    ...r,
    confidence: Number(r.confidence),
    extra_patterns: Array.isArray(r.extra_patterns) ? r.extra_patterns : [],
    hard_ignore: !!r.hard_ignore,
    extra_sender_patterns: Array.isArray(r.extra_sender_patterns) ? r.extra_sender_patterns : [],
  }
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
      // Redundant with is_active for a soft-deleted rule (delete also clears is_active) but explicit
      // about what actually excludes it from classification, now that the two are separate concepts.
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })

  const { data, error } = await withOptionalColumnFallback<any[]>((dropped) => read(ruleColumns(dropped)))

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
      hard_ignore: !!r.hard_ignore,
      sender_pattern: r.sender_pattern ?? undefined,
      extra_sender_patterns: Array.isArray(r.extra_sender_patterns) ? (r.extra_sender_patterns as string[]) : [],
      sender_match_type: (r.sender_match_type as RuleMatchType | undefined) ?? undefined,
    }))

  cache = { at: Date.now(), rules }
  return rules
}
