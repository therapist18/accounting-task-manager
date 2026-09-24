// Deterministic KRA classification. KRA subjects are highly standardised, so matching the sender
// and subject is faster, free and more reliable than an LLM. Anything the rules are not sure about
// goes to Needs Review.
//
// The subject -> category rules are DATA: they live in the email_classification_rules table and are
// edited from the Email Center's Rules tab (loaded by rule-store.ts). DEFAULT_SUBJECT_RULES below is the
// built-in list the table was seeded from — used only when the table is missing or unreachable.

export interface RuleResult {
  categoryKey: string
  confidence: number
}

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
  category_key: string
  confidence: number
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

export function isKraSender(senderEmail: string): boolean {
  return KRA_SENDER_RE.test(senderEmail.trim())
}

export function isNoiseSender(senderEmail: string): boolean {
  return NOISE_SENDER_RES.some((re) => re.test(senderEmail))
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

  if (isNoiseSender(senderEmail) && !isKraSender(senderEmail)) {
    return { categoryKey: "system_noise", confidence: 0.92 }
  }
  if (!isKraSender(senderEmail)) return null

  const cleanSubject = subject.replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "").trim()

  // A KRA reply on a thread we already track is most likely the answer to our extension request.
  if (threadHasCase && detectApproval(body)) {
    return { categoryKey: "extension_response", confidence: 0.85 }
  }

  for (const rule of rules) {
    const re = compileRule(rule)
    if (re?.test(cleanSubject)) return { categoryKey: rule.category_key, confidence: rule.confidence }
  }
  return null
}
