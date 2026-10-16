import {
  DEFAULT_SUBJECT_RULES, appliesToCompany, isKraSender, matchesSender, matchesSubject, senderPatterns, stripReplyPrefix,
  subjectWordings, type SubjectRule,
} from "@/lib/email-center/rules"
import type { CategoryOption, EmailRow, RuleRow } from "./shared"

// Rule suggestions for mail sorted by hand in Needs Review: what the picked emails have in common
// (subject wording, sender), which existing rules they nearly fit, and what a new or widened rule would
// catch. All matching goes through the same engine ingestion and Reclassify use (lib/email-center/rules),
// so a preview here is what will actually happen. Pure functions — no I/O, no React.

// What the person chose to do with the emails in Needs Review.
export type ReviewAction = "task" | "update" | "ignore"

// The kind of rule that choice becomes. "Delete completely" (from Update or Ignore) is an
// ignore-and-delete rule: matching mail is dropped on arrival.
export type RuleKind = "task" | "update" | "ignore" | "hard_ignore"

export function ruleKindFor(action: ReviewAction, keep: boolean): RuleKind {
  if (action === "task") return "task"
  if (!keep) return "hard_ignore"
  return action
}

// RuleRow (what the tables edit) -> SubjectRule (what the engine matches against).
export function toSubjectRule(r: RuleRow): SubjectRule {
  return {
    id: r.id,
    match_type: r.match_type,
    pattern: r.pattern,
    extra_patterns: r.extra_patterns,
    category_key: r.category_key,
    confidence: r.confidence,
    is_ignore: r.is_ignore,
    is_notify: r.is_notify,
    hard_ignore: r.hard_ignore,
    notify_priority: r.notify_priority,
    sender_pattern: r.sender_pattern ?? undefined,
    extra_sender_patterns: r.extra_sender_patterns,
    sender_match_type: r.sender_match_type ?? undefined,
    company_scope: r.company_scope,
    company_ids: r.company_ids,
  }
}

// Whether a rule's own conditions (company, sender, subject) hold for an email — the per-rule test
// classifyByRules runs. A classify rule with no wording never matches (it would catch everything).
export function ruleMatchesEmail(rule: SubjectRule, e: EmailRow): boolean {
  if (!appliesToCompany(rule, e.company_id)) return false
  if (!matchesSender(rule, e.sender_email)) return false
  if (!rule.is_ignore && !rule.is_notify && !subjectWordings(rule).length) return false
  return matchesSubject(rule, stripReplyPrefix(e.subject ?? ""))
}

// ── subject wording ──────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "a", "an", "and", "at", "by", "dear", "for", "from", "in", "of", "on", "or", "our", "re", "the", "to", "with", "your", "is", "are",
])
// Words that only introduce the varying part that follows them ("… for the period 2023", "… ref 889").
const LEAD_IN_WORDS = new Set(["period", "ref", "reference", "no", "number", "dated", "date", "year", "month", "pin", "account"])
const PIN_RE = /^[AP]\d{9}[A-Z]$/i
const EDGE_PUNCT_RE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu
const COMPANY_SUFFIX_RE = /\s*\b(limited|ltd|plc|llp|llc|inc)\.?\s*$/i
const BREAK = "\u0000"

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// A subject cut into runs of "stable" words — the parts that stay the same from one notice to the next.
// The company's own name, KRA PINs, numbers/dates/references and addresses vary per email, so they split
// the subject instead of ending up in a wording that would then only ever match this one company.
function stableRuns(e: EmailRow): string[][] {
  let subject = stripReplyPrefix(e.subject ?? "")
  const name = (e.company_name ?? "").trim()
  if (name) {
    for (const variant of [name, name.replace(COMPANY_SUFFIX_RE, "")]) {
      if (variant.length >= 3) subject = subject.replace(new RegExp(escapeRegex(variant), "gi"), ` ${BREAK} `)
    }
  }
  const runs: string[][] = []
  let current: string[] = []
  for (const token of subject.split(/\s+/).filter(Boolean)) {
    const bare = token.replace(EDGE_PUNCT_RE, "")
    const variable = !bare || token.includes(BREAK) || /\d{2,}/.test(bare) || PIN_RE.test(bare) || bare.includes("@")
    if (variable) {
      if (current.length) runs.push(current)
      current = []
    } else {
      current.push(token)
    }
  }
  if (current.length) runs.push(current)
  return runs
}

// Joins words into a wording, dropping leading/trailing filler words and punctuation ("for the period"
// adds nothing a rule needs).
function phraseOf(tokens: string[]): string {
  let start = 0
  let end = tokens.length
  const bare = (t: string) => t.replace(EDGE_PUNCT_RE, "").toLowerCase()
  while (start < end && STOPWORDS.has(bare(tokens[start]))) start++
  while (end > start && (STOPWORDS.has(bare(tokens[end - 1])) || LEAD_IN_WORDS.has(bare(tokens[end - 1])))) end--
  return tokens.slice(start, end).join(" ").replace(EDGE_PUNCT_RE, "")
}

// Too generic to be worth a rule on its own ("Notice", "KRA").
function isSpecific(phrase: string): boolean {
  return phrase.length >= 4 && (phrase.includes(" ") || phrase.length >= 6)
}

// Subject wordings that between them cover the emails: the most telling phrase shared by the most
// emails first, then the best one for whatever that left uncovered, and so on (at most `max`). A phrase
// scores by how many emails it covers times its length (capped), so a short generic phrase shared by
// all doesn't beat a precise one shared by most.
export function suggestWordings(emails: EmailRow[], max = 5): string[] {
  const subjects = emails.map((e) => stripReplyPrefix(e.subject ?? "").toLowerCase())
  let uncovered = emails.map((_, i) => i)
  const out: string[] = []
  while (uncovered.length && out.length < max) {
    const candidates = new Map<string, string>()
    for (const i of uncovered.slice(0, 25)) {
      for (const run of stableRuns(emails[i])) {
        for (let from = 0; from < run.length; from++) {
          for (let len = 1; len <= Math.min(10, run.length - from); len++) {
            const phrase = phraseOf(run.slice(from, from + len))
            if (isSpecific(phrase)) candidates.set(phrase.toLowerCase(), phrase)
          }
        }
      }
    }
    let best: { lower: string; phrase: string; score: number } | null = null
    for (const [lower, phrase] of candidates) {
      const covers = uncovered.filter((i) => subjects[i].includes(lower)).length
      const score = covers * Math.min(phrase.length, 40) + phrase.length / 1000
      if (covers && (!best || score > best.score)) best = { lower, phrase, score }
    }
    if (!best) break
    out.push(best.phrase)
    const hit = best.lower
    uncovered = uncovered.filter((i) => !subjects[i].includes(hit))
  }
  return out
}

// ── sender ───────────────────────────────────────────────────────────────────

// Shared mail providers: "@gmail.com" says nothing about who sent it.
const PUBLIC_DOMAINS = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "aol.com"])

// One address when they all come from it; "@domain" when they share an organisation's domain; up to
// three addresses otherwise; nothing when the senders are all over the place.
export function suggestSenders(emails: EmailRow[]): string[] {
  const addresses = [...new Set(emails.map((e) => e.sender_email.trim().toLowerCase()).filter(Boolean))]
  if (addresses.length <= 1) return addresses
  const domains = [...new Set(addresses.map((a) => a.split("@")[1] ?? ""))]
  if (domains.length === 1 && domains[0] && !PUBLIC_DOMAINS.has(domains[0])) return [`@${domains[0]}`]
  return addresses.length <= 3 ? addresses : []
}

// KRA mail arrives from several addresses for the same kind of notice, so a sender filter would only
// narrow a rule meant for KRA mail; for anyone else the sender is usually the most reliable signal.
export function senderMattersByDefault(emails: EmailRow[]): boolean {
  return emails.length > 0 && !emails.some((e) => isKraSender(e.sender_email))
}

// ── category ─────────────────────────────────────────────────────────────────

// The most likely category among the allowed ones: what the emails are already tagged as, what the
// person's own rules (even below the confidence bar) and the built-in KRA wordings say. "" when none fit.
export function guessCategory(
  emails: EmailRow[],
  rules: RuleRow[],
  categories: CategoryOption[],
  allowed: (c: CategoryOption) => boolean
): string {
  const byKey = new Map(categories.map((c) => [c.key, c]))
  const ok = (key: string | null | undefined) => !!key && !!byKey.get(key) && allowed(byKey.get(key)!)
  const classifyRules = rules.filter((r) => r.is_active && !r.is_ignore && !r.is_notify).map(toSubjectRule)
  const votes = new Map<string, number>()
  const vote = (key: string, n: number) => votes.set(key, (votes.get(key) ?? 0) + n)
  for (const e of emails) {
    if (ok(e.category_key)) vote(e.category_key!, 3)
    const own = classifyRules.find((r) => ruleMatchesEmail(r, e))
    if (own && ok(own.category_key)) vote(own.category_key, 2)
    const subject = stripReplyPrefix(e.subject ?? "")
    const builtin = DEFAULT_SUBJECT_RULES.find((r) => matchesSubject(r, subject))
    if (builtin && ok(builtin.category_key)) vote(builtin.category_key, 1)
  }
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
}

// Which categories each kind of rule may file mail under.
export function categoryAllowed(kind: RuleKind, c: CategoryOption): boolean {
  if (kind === "task") return !!c.creates_case
  if (kind === "update") return c.disposition === "update_only"
  return false
}

// ── existing rules ───────────────────────────────────────────────────────────

const words = (text: string) =>
  new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOPWORDS.has(w)))

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const w of a) if (b.has(w)) shared++
  return shared / (a.size + b.size - shared)
}

// Whether an existing rule is the same kind as the one being suggested (and can take another wording:
// plain-text rules only — a wording added to a regex rule would be read as a pattern).
export function sameKind(r: RuleRow, kind: RuleKind, catByKey: Map<string, CategoryOption>): boolean {
  if (r.id.startsWith("builtin-") || r.match_type !== "contains") return false
  if (kind === "ignore") return r.is_ignore && !r.hard_ignore
  if (kind === "hard_ignore") return r.is_ignore && r.hard_ignore
  if (r.is_ignore || r.is_notify) return false
  const cat = catByKey.get(r.category_key)
  return !!cat && categoryAllowed(kind, cat)
}

export interface RuleCandidate {
  rule: RuleRow
  score: number
  // How many of the picked emails the rule's subject / sender condition already matches.
  subjectHits: number
  senderHits: number
}

// Existing rules of the same kind, closest first: similar wording, a subject or sender condition the
// emails already satisfy (a near miss — e.g. right subject, but the rule names another sender).
export function rankRules(rules: RuleRow[], kind: RuleKind, emails: EmailRow[], wordings: string[], categories: CategoryOption[]): RuleCandidate[] {
  const catByKey = new Map(categories.map((c) => [c.key, c]))
  const mine = words(wordings.join(" "))
  const n = Math.max(emails.length, 1)
  return rules
    .filter((r) => sameKind(r, kind, catByKey))
    .map((rule) => {
      const sr = toSubjectRule(rule)
      const theirs = subjectWordings(sr)
      const similarity = Math.max(0, ...theirs.map((w) => jaccard(mine, words(w))))
      const subjectHits = theirs.length ? emails.filter((e) => matchesSubject(sr, stripReplyPrefix(e.subject ?? ""))).length : 0
      const senderHits = senderPatterns(sr).length ? emails.filter((e) => matchesSender(sr, e.sender_email)).length : 0
      const score = similarity + (0.8 * subjectHits) / n + (0.6 * senderHits) / n
      return { rule, score, subjectHits, senderHits }
    })
    .sort((a, b) => b.score - a.score)
}

// ── the rule that will be saved ──────────────────────────────────────────────

export interface RuleDraft {
  wordings: string[]
  senders: string[]
  useSubject: boolean
  useSender: boolean
}

// Trimmed, without blanks or case-insensitive repeats.
export const clean = (list: string[]) => {
  const seen = new Set<string>()
  return list.map((w) => w.trim()).filter((w) => w && !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase()))
}

// PATCH body for an existing rule edited in full: its subject wordings and senders replaced by the
// draft's (an unticked side is cleared), its category by `categoryKey` for a classify rule, and turned
// back on if it was off. Only the fields that actually change.
export function editRuleChanges(rule: RuleRow, draft: RuleDraft, categoryKey: string): Partial<RuleRow> {
  const changes: Partial<RuleRow> = {}
  const wordings = draft.useSubject ? clean(draft.wordings) : []
  const senders = draft.useSender ? clean(draft.senders) : []
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
  if (!same(wordings, subjectWordings(rule))) {
    changes.pattern = wordings[0] ?? ""
    changes.extra_patterns = wordings.slice(1)
  }
  if (!same(senders, senderPatterns(rule))) {
    changes.sender_pattern = senders[0] ?? ""
    changes.extra_sender_patterns = senders.slice(1)
  }
  if (!rule.is_ignore && !rule.is_notify && categoryKey && categoryKey !== rule.category_key) changes.category_key = categoryKey
  if (!rule.is_active) changes.is_active = true
  return changes
}

// POST body for a brand-new rule.
export function newRuleBody(kind: RuleKind, categoryKey: string, draft: RuleDraft): Record<string, unknown> {
  const wordings = draft.useSubject ? clean(draft.wordings) : []
  const senders = draft.useSender ? clean(draft.senders) : []
  return {
    match_type: "contains",
    pattern: wordings[0] ?? "",
    extra_patterns: wordings.slice(1),
    sender_pattern: senders[0] ?? "",
    extra_sender_patterns: senders.slice(1),
    sender_match_type: "contains",
    confidence: 0.9,
    ...(kind === "ignore" || kind === "hard_ignore"
      ? { is_ignore: true, hard_ignore: kind === "hard_ignore" }
      : { category_key: categoryKey }),
    notes: "Created from Needs Review",
  }
}

// An existing rule widened to cover the draft — what "Edit existing rule" starts the editor from: the
// draft's wordings are added as alternatives, and its senders too when the rule already filters on
// sender (adding one to a rule with no sender filter would narrow it to just that sender). A
// sender-only rule never gets a wording, for the same reason. Empty when the rule already has everything.
export function widenRuleChanges(rule: RuleRow, draft: RuleDraft): Partial<RuleRow> {
  const changes: Partial<RuleRow> = {}
  const sr = toSubjectRule(rule)
  const known = new Set(subjectWordings(sr).map((w) => w.toLowerCase()))
  if (draft.useSubject && known.size) {
    const added = clean(draft.wordings).filter((w) => !known.has(w.toLowerCase()))
    if (added.length) changes.extra_patterns = [...(rule.extra_patterns ?? []), ...added].slice(0, 30)
  }
  if (draft.useSender && senderPatterns(sr).length) {
    const added = clean(draft.senders).filter((s) => !senderPatterns(sr).some((p) => p.toLowerCase() === s.toLowerCase()))
    if (added.length) changes.extra_sender_patterns = [...(rule.extra_sender_patterns ?? []), ...added].slice(0, 30)
  }
  return changes
}

// The rule as it will match once saved — a new one from its POST body, or an existing one with the
// edits applied — for previewing what it catches.
export function previewRule(kind: RuleKind, categoryKey: string, draft: RuleDraft, existing: RuleRow | null): SubjectRule {
  if (existing) return toSubjectRule({ ...existing, ...editRuleChanges(existing, draft, categoryKey) })
  const body = newRuleBody(kind, categoryKey, draft) as any
  return {
    match_type: "contains",
    pattern: body.pattern,
    extra_patterns: body.extra_patterns,
    sender_pattern: body.sender_pattern || undefined,
    extra_sender_patterns: body.extra_sender_patterns,
    sender_match_type: "contains",
    category_key: body.category_key ?? "system_noise",
    confidence: body.confidence,
    is_ignore: !!body.is_ignore,
    hard_ignore: !!body.hard_ignore,
  }
}
