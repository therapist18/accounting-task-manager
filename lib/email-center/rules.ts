// Deterministic KRA classification. KRA subjects are highly standardised, so matching the sender
// and subject is faster, free and more reliable than an LLM. Anything the rules are not sure about
// goes to Needs Review.
//
// The subject -> category rules are DATA: they live in the email_classification_rules table and are
// edited from the Email Center's Rules tab (loaded by rule-store.ts). DEFAULT_SUBJECT_RULES below is the
// built-in list the table was seeded from — used only when the table is missing or unreachable.

// A rule matches on subject and/or sender and names one of three behaviours:
//   ignore   match is stored under the Ignored tab (so it can be looked back on) and never opens a
//            case — UNLESS the rule is also hard_ignore, in which case it is dropped entirely, the
//            same as certificates/statements/system noise: never stored anywhere.
//   notify   match is stored and flagged urgent in Needs Review — an important notification that
//            needs attention but must NOT create a KRA task/case
//   classify match is classified into its category (opens a case at high confidence when the
//            category is case-creating)
export type RuleResult =
  // ruleId is the ignore rule that matched, so the Ignored tab can group what each rule caught.
  // hardIgnore mirrors the rule's own hard_ignore — carried here so ingestion doesn't need a second
  // lookup to know whether to store the match or drop it outright.
  | { action: "ignore"; categoryKey: null; confidence: number; ruleId?: string; hardIgnore?: boolean }
  | { action: "notify"; categoryKey: null; confidence: number; ruleId?: string; notifyPriority?: "urgent" | "informational" }
  // ruleId is the classify rule that matched (absent for the built-in noise-sender / thread-approval
  // shortcuts below, which aren't rows in the table) — lets a task remember which rule opened it.
  | { action: "classify"; categoryKey: string; confidence: number; ruleId?: string }

const KRA_SENDER_RE = /@([a-z0-9-]+\.)*kra\.go\.ke\s*>?$/i
// KRA PIN: A/P + 9 digits + letter (e.g. P052230924P)
const KRA_PIN_RE = /\b[AP]\d{9}[A-Z]\b/i

const NOISE_SENDER_RES = [
  /mailer-daemon@/i,
  /postmaster@/i,
  /no-?reply@.*(google|yahoo|gmail)\./i,
  /@accounts\.google\.com/i,
  /@(mail\.)?yahoo\./i,
  /@(.*\.)?mailspring\./i,
]

export type RuleMatchType = "contains" | "regex"

export interface SubjectRule {
  id?: string
  match_type: RuleMatchType
  pattern: string
  // Alternative subject wordings for the same rule (same match_type). The rule matches when the subject
  // matches its primary `pattern` OR any of these.
  extra_patterns?: string[]
  category_key: string
  confidence: number
  is_ignore?: boolean
  // An important-notification rule: store + flag (no task/case). Mutually exclusive with is_ignore.
  is_notify?: boolean
  // Optional sender filter (ignore/notify rules especially): match on the sender address. When
  // empty the rule matches on subject only; when both are set both must match.
  sender_pattern?: string
  // Alternative senders (same sender_match_type) — the rule matches a sender that matches
  // sender_pattern OR any of these, e.g. "ignore mail from either A or B" as one rule.
  extra_sender_patterns?: string[]
  sender_match_type?: RuleMatchType
  // Only meaningful when is_ignore is true: drop a match entirely instead of storing it under the
  // Ignored tab. For mail that has nothing to do with KRA at all.
  hard_ignore?: boolean
  // Only meaningful when is_notify is true: "urgent" (default) demands attention now; "informational"
  // still lands in Notifications but reads as FYI — a password-reset confirmation vs an account-locked
  // notice are both "notify", but only one of them is actually urgent.
  notify_priority?: "urgent" | "informational"
}

// First match wins, so order from most to least specific.
export const DEFAULT_SUBJECT_RULES: SubjectRule[] = ([
  [/notice of intention to verify/i, "verification_notice", 0.97],
  [/pre-?\s?assess?ment/i, "pre_assessment", 0.97],
  [/failure to (file|lodge)|non-?\s?fil(er|ing)|nil return.*(not|failure)/i, "failure_to_file", 0.95],
  [/(agency|demand|penalty|assessment) notice|notice of (assessment|demand)|outstanding (tax|liab)|tax arrears|default assessment/i, "demand_penalty", 0.93],
  [/(tax )?(audit|investigation)|notice of (audit|investigation)/i, "audit_notice", 0.9],
  [/appoint(ed|ment)? as .*(withholding|agent)|withholding (vat )?agent/i, "appointment_notice", 0.9],
  [/request for (documents?|information|records|clarification)|submission of (documents|records)|provide (documents|records)/i, "document_request", 0.85],
  [/withholding (tax )?certificate|tax compliance certificate|\btcc\b/i, "certificate", 0.93],
  [/acknowledg(e)?ment|successfully (received|filed|submitted)|return (received|filed)|payment (receipt|confirmation)/i, "return_ack", 0.9],
  [/statement|ledger/i, "statement", 0.8],
] as Array<[RegExp, string, number]>).map(([re, category_key, confidence]) => ({
  match_type: "regex" as const,
  pattern: re.source,
  category_key,
  confidence,
}))

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Compiled once per distinct rule; null = an invalid pattern, which is skipped instead of throwing
// (a typo in one rule must never stop email ingestion).
const compiled = new Map<string, RegExp | null>()

export function compileRule(rule: Pick<SubjectRule, "match_type" | "pattern">): RegExp | null {
  const key = `${rule.match_type}:${rule.pattern}`
  if (compiled.has(key)) return compiled.get(key)!
  let re: RegExp | null = null
  try {
    re = new RegExp(rule.match_type === "contains" ? escapeRegex(rule.pattern.trim()) : rule.pattern, "i")
  } catch {
    re = null
  }
  compiled.set(key, re)
  return re
}

// Every subject wording a rule carries: its primary pattern plus any alternative wordings, trimmed and
// without blanks.
export function subjectWordings(rule: Pick<SubjectRule, "pattern" | "extra_patterns">): string[] {
  return [rule.pattern, ...(rule.extra_patterns ?? [])].map((w) => (w ?? "").trim()).filter(Boolean)
}

// Whether an email's SUBJECT matches a rule: any one of its wordings is enough. A rule with no subject
// wording at all matches any subject (a sender-only ignore/notify rule).
function matchesSubject(rule: SubjectRule, cleanSubject: string): boolean {
  const wordings = subjectWordings(rule)
  if (!wordings.length) return true
  return wordings.some((pattern) => !!compileRule({ match_type: rule.match_type, pattern })?.test(cleanSubject))
}

// Every sender a rule carries: its primary sender_pattern plus any alternatives, trimmed and
// without blanks. Mirrors subjectWordings exactly.
export function senderPatterns(rule: Pick<SubjectRule, "sender_pattern" | "extra_sender_patterns">): string[] {
  return [rule.sender_pattern, ...(rule.extra_sender_patterns ?? [])].map((w) => (w ?? "").trim()).filter(Boolean)
}

// Whether an email's SENDER matches a rule's optional sender filter: any one of its senders is enough.
// A rule with no sender filter at all matches any sender.
function matchesSender(rule: SubjectRule, senderEmail: string): boolean {
  const senders = senderPatterns(rule)
  if (!senders.length) return true
  const sender = senderEmail.trim()
  return senders.some((pattern) => !!compileRule({ match_type: rule.sender_match_type ?? "contains", pattern })?.test(sender))
}

export function isKraSender(senderEmail: string): boolean {
  return KRA_SENDER_RE.test(senderEmail.trim())
}

export function isNoiseSender(senderEmail: string): boolean {
  return NOISE_SENDER_RES.some((re) => re.test(senderEmail))
}

// A "no-reply" address (noreply@x.com, no-reply@x.com, donotreply@x.com, ...). Automated mail from
// these is never deliberately sent to a person, so ingestion auto-ignores it — stored under the
// Ignored tab so it can still be seen, distinct from the noise senders above that are dropped
// entirely. The Email Center reuses this same check to render the ignored tab's "Automated" filter.
export function isNoReplySender(senderEmail: string): boolean {
  const local = (senderEmail.trim().split("@")[0] ?? "").replace(/\+.*$/, "").trim().toLowerCase()
  return /no[\W_]*reply|do[\W_]*not[\W_]*reply|donotreply/i.test(local)
}

// Alert-style addresses (alerts@x.com, alerts-noreply@x.com). Same treatment as no-reply: automated
// mail, auto-ignored. Deliberately NOT "info@" — too many real company mailboxes use info@ as their
// actual address, and those mails still need normal handling.
export function isAlertSender(senderEmail: string): boolean {
  const local = (senderEmail.trim().split("@")[0] ?? "").replace(/\+.*$/, "").trim().toLowerCase()
  return /^(alerts?|alerts?[\W_]?noreply|noreply[\W_]?alerts?)$/i.test(local)
}

// Anything automated enough that ingestion should never ask a person to review it: no-reply and
// alert-style senders. This is what auto-ignore actually runs on.
export function isAutomatedSender(senderEmail: string): boolean {
  return isNoReplySender(senderEmail) || isAlertSender(senderEmail)
}

export function extractPin(...texts: Array<string | null | undefined>): string | null {
  for (const t of texts) {
    const m = t?.match(KRA_PIN_RE)
    if (m) return m[0].toUpperCase()
  }
  return null
}

// Removes quoted history so words in our own earlier request ("kindly approve...") are not mistaken
// for KRA's answer.
export function stripQuoted(body: string): string {
  const lines = body.split(/\r?\n/)
  const out: string[] = []
  for (const line of lines) {
    if (/^\s*>/.test(line)) continue
    if (/^\s*On .{5,120}wrote:\s*$/i.test(line)) break
    if (/^\s*-{2,}\s*(original|forwarded) message/i.test(line)) break
    if (/^\s*From:\s.+@/i.test(line) && out.length > 0) break
    out.push(line)
  }
  return out.join("\n")
}

export function detectApproval(body: string): "approved" | "rejected" | null {
  const fresh = stripQuoted(body).slice(0, 1500)
  if (/\b(not|cannot|unable to|regret)\b[^.]{0,40}\b(approve|approved|grant|granted|allow|allowed)\b|\b(declined|rejected|denied|not approved)\b/i.test(fresh)) {
    return "rejected"
  }
  if (/\b(approved|granted|allowed|accepted|kindly note (that )?the extension)\b/i.test(fresh)) return "approved"
  return null
}

export function classifyByRules(input: {
  subject: string
  body: string
  senderEmail: string
  threadHasCase: boolean
  rules?: SubjectRule[]
}): RuleResult | null {
  const { subject, body, senderEmail, threadHasCase, rules = DEFAULT_SUBJECT_RULES } = input

  const cleanSubject = subject.replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "").trim()

  // Ignore rules apply to every sender — they exist to keep noise (newsletters, automated mail,
  // non-KRA senders that would otherwise sit in Needs Review) out of the app. They win over
  // everything else, so matching email is never stored and never opens a case. A rule can match on
  // subject, on the sender address, or both.
  for (const rule of rules) {
    if (rule.is_ignore) {
      if (matchesSubject(rule, cleanSubject) && matchesSender(rule, senderEmail)) {
        return { action: "ignore", categoryKey: null, confidence: rule.confidence, ruleId: rule.id, hardIgnore: !!rule.hard_ignore }
      }
    }
  }

  // Notify rules: subject/sender-driven important notifications. Like ignore they apply to any
  // sender and name no category; unlike ignore the mail is stored — flagged in Notifications so
  // someone sees it, with no KRA task/case opened. notify_priority decides how loudly.
  for (const rule of rules) {
    if (rule.is_notify) {
      if (matchesSubject(rule, cleanSubject) && matchesSender(rule, senderEmail)) {
        return {
          action: "notify", categoryKey: null, confidence: rule.confidence, ruleId: rule.id,
          notifyPriority: rule.notify_priority === "informational" ? "informational" : "urgent",
        }
      }
    }
  }

  if (isNoiseSender(senderEmail) && !isKraSender(senderEmail)) {
    return { action: "classify", categoryKey: "system_noise", confidence: 0.92 }
  }
  if (!isKraSender(senderEmail)) return null

  // A KRA reply on a thread we already track is most likely the answer to our extension request.
  if (threadHasCase && detectApproval(body)) {
    return { action: "classify", categoryKey: "extension_response", confidence: 0.85 }
  }

  for (const rule of rules) {
    if (rule.is_ignore || rule.is_notify) continue
    // A classify rule with no wording would match every subject — never let that happen.
    if (subjectWordings(rule).length && matchesSubject(rule, cleanSubject)) {
      return { action: "classify", categoryKey: rule.category_key, confidence: rule.confidence, ruleId: rule.id }
    }
  }
  return null
}
