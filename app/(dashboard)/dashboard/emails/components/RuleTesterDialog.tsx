"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, EyeOff, FlaskConical, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  appliesToCompany, classifyByRules, matchesSender, matchesSubject, stripReplyPrefix, subjectWordings,
  type SubjectRule,
} from "@/lib/email-center/rules"
import { AUTO_CONFIDENCE_THRESHOLD } from "@/lib/email-center/types"
import { ruleOutcome, type CategoryOption, type RuleRow } from "./shared"

// "Test a subject" — paste (or seed from a real email) a subject/sender and see which of the active
// rules would catch it, run through the exact same engine (classifyByRules) ingestion and Reclassify
// use, not a second hand-written approximation. Shared by the Rules tab's own toolbar button (a blank
// test) and the Needs Review tab's per-row "Test" action (seeded from that email).

// RuleRow (what the table edits) -> SubjectRule (what the real engine matches against) — just a field
// reshape (null -> undefined for the two optional sender fields).
function toSubjectRule(r: RuleRow): SubjectRule {
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

export function RuleTesterDialog({
  open,
  onOpenChange,
  rules,
  categories,
  initialSubject,
  initialSender,
  companies,
  initialCompany,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rules: RuleRow[]
  categories: CategoryOption[]
  // Seeds the fields the moment the dialog opens (e.g. from a specific email's own subject/sender) —
  // changing these while already open doesn't reset what's typed.
  initialSubject?: string
  initialSender?: string
  // Company-scoped rules ("only these" / "all except these") depend on whose mail it is, so the tester
  // takes an optional company too: pick from `companies`, or it is seeded from `initialCompany` (the
  // email being tested). With neither, the test runs as mail that belongs to no company.
  companies?: { id: string; company_name: string }[]
  initialCompany?: { id: string; name: string } | null
}) {
  const catByKey = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories])
  const [testSubject, setTestSubject] = useState("")
  const [testSender, setTestSender] = useState("")
  const [testCompany, setTestCompany] = useState("")
  const companyOptions = useMemo(
    () => companies ?? (initialCompany ? [{ id: initialCompany.id, company_name: initialCompany.name }] : []),
    [companies, initialCompany]
  )

  useEffect(() => {
    if (open) {
      setTestSubject(initialSubject ?? "")
      setTestSender(initialSender ?? "")
      setTestCompany(initialCompany?.id ?? "")
    }
    // Only seed on the open edge, not on every keystroke-adjacent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // A sender-only rule (no subject wording) matches ANY subject, including a blank one — so "nothing
  // typed yet" only means nothing to test once BOTH fields are empty, not just the subject.
  const hasInput = testSubject.trim() !== "" || testSender.trim() !== ""

  // Same order classification actually evaluates rules in (rule-store.ts's own query order) —
  // independent of whatever order the caller's own table happens to be sorted by right now.
  const activeRules = useMemo(
    () =>
      rules
        .filter((r) => r.is_active)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || (a.created_at ?? "").localeCompare(b.created_at ?? "")),
    [rules]
  )
  const activeSubjectRules = useMemo(() => activeRules.map(toSubjectRule), [activeRules])

  const rawTestResult = useMemo(
    () =>
      hasInput
        ? classifyByRules({ subject: testSubject, body: "", senderEmail: testSender, threadHasCase: false, companyId: testCompany || null, rules: activeSubjectRules })
        : null,
    [hasInput, testSubject, testSender, testCompany, activeSubjectRules]
  )
  // A notify match always wins regardless of confidence (see rules.ts); every other action still needs
  // to clear the same auto-confidence bar ingestion and Reclassify both gate on, or it stays Needs
  // Review rather than being acted on automatically.
  const testResult = rawTestResult && (rawTestResult.action === "notify" || rawTestResult.confidence >= AUTO_CONFIDENCE_THRESHOLD) ? rawTestResult : null
  const testWinnerRule = testResult?.ruleId ? activeRules.find((r) => r.id === testResult.ruleId) : undefined

  // Other active rules whose own subject/sender condition is also satisfied — shown for reference only
  // (first-match-wins across ignore -> notify -> classify is what the result above already resolved);
  // useful for spotting two rules that overlap, or a specific rule being shadowed by a broader one
  // above it.
  const cleanTestSubject = useMemo(() => stripReplyPrefix(testSubject), [testSubject])
  const otherMatches = useMemo(() => {
    if (!hasInput) return []
    return activeRules.filter((r) => {
      if (testWinnerRule && r.id === testWinnerRule.id) return false
      const sr = toSubjectRule(r)
      if (!appliesToCompany(sr, testCompany || null)) return false
      if (!matchesSender(sr, testSender)) return false
      if (r.is_ignore || r.is_notify) return matchesSubject(sr, cleanTestSubject)
      return subjectWordings(sr).length > 0 && matchesSubject(sr, cleanTestSubject)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRules, cleanTestSubject, testSender, testSubject, testCompany, testWinnerRule])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[96vw] max-h-[92vh] p-0 gap-0 border border-slate-200 shadow-xl rounded-2xl overflow-hidden bg-white flex flex-col">
        <div className="flex items-center gap-4 border-b border-slate-200 pl-6 pr-14 py-4 shrink-0">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-custom-blue/10 text-custom-blue shrink-0">
            <FlaskConical className="h-6 w-6" />
          </span>
          <div>
            <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900">Test a subject</DialogTitle>
            <DialogDescription className="text-base text-slate-500 mt-0.5">
              Paste a real subject (and sender, if it matters) to see which of the {activeRules.length} active rule{activeRules.length === 1 ? "" : "s"} would catch it, and what would actually happen.
            </DialogDescription>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-600">Subject</Label>
            <Input
              className="h-10 text-base rounded-md border-slate-200"
              value={testSubject}
              onChange={(e) => setTestSubject(e.target.value)}
              placeholder="e.g. Re: Pre-Assessment Notice – ABC Ltd"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-600">
              Sender <span className="text-slate-400 font-normal">— optional, but rules that name a sender need it to mean anything</span>
            </Label>
            <Input
              className="h-10 text-base rounded-md border-slate-200 font-mono"
              value={testSender}
              onChange={(e) => setTestSender(e.target.value.toLowerCase())}
              placeholder="e.g. admin.itax2@kra.go.ke"
            />
          </div>

          {companyOptions.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-600">
                Company <span className="text-slate-400 font-normal">— rules limited to certain companies only apply to their mail</span>
              </Label>
              <select
                value={testCompany}
                onChange={(e) => setTestCompany(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-base text-slate-800 focus:outline-none focus:ring-1 focus:ring-custom-blue"
              >
                <option value="">No company</option>
                {companyOptions.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.company_name}</option>
                ))}
              </select>
            </div>
          )}

          {hasInput && (
            <div className={cn(
              "rounded-lg border px-4 py-3 space-y-1",
              !testResult ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"
            )}>
              {!testResult ? (
                <p className="flex items-center gap-1.5 text-base font-medium text-amber-800">
                  <AlertTriangle className="h-5 w-5" /> Stays in Needs Review — {rawTestResult ? "the only match is below the 80% auto-confidence bar." : "nothing matches confidently."}
                </p>
              ) : testWinnerRule ? (
                (() => {
                  const outcome = ruleOutcome(testWinnerRule, catByKey.get(testWinnerRule.category_key))
                  const Icon = outcome.icon
                  return (
                    <>
                      <p className={cn("flex items-center gap-1.5 text-base font-semibold", outcome.tone)}>
                        <Icon className="h-5 w-5" /> {outcome.label}
                      </p>
                      <p className="text-sm text-slate-500">
                        Matched rule order <span className="font-mono">#{testWinnerRule.sort_order}</span> — {catByKey.get(testWinnerRule.category_key)?.name ?? testWinnerRule.category_key}
                        {testWinnerRule.notes ? <> · {testWinnerRule.notes}</> : null}
                      </p>
                    </>
                  )
                })()
              ) : (
                <p className="flex items-center gap-1.5 text-base font-semibold text-slate-600">
                  <EyeOff className="h-5 w-5" /> Ignored as System / Non-KRA — a built-in check (not a saved rule) recognizes this sender as automated/noise.
                </p>
              )}
            </div>
          )}

          {hasInput && otherMatches.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-600">
                Also matches ({otherMatches.length}) <span className="text-slate-400 font-normal">— shown for reference; the outcome above is what actually wins</span>
              </Label>
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {otherMatches.map((r) => {
                  const outcome = ruleOutcome(r, catByKey.get(r.category_key))
                  return (
                    <div key={r.id} className="flex items-center gap-2 px-3.5 py-2 text-sm">
                      <span className="font-mono text-slate-400 w-10 shrink-0">#{r.sort_order}</span>
                      <span className={cn("font-medium", outcome.tone)}>{outcome.label}</span>
                      <span className="text-slate-400 truncate">— {catByKey.get(r.category_key)?.name ?? r.category_key}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-white px-6 py-3.5 shrink-0 flex items-center justify-end">
          <Button size="sm" onClick={() => onOpenChange(false)} className="h-11 px-6 text-base font-semibold bg-custom-blue hover:bg-custom-blue/90 text-white rounded-lg shadow-xs">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
