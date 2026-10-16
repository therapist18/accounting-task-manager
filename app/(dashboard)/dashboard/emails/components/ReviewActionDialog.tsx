"use client"

import { useEffect, useMemo, useState } from "react"
import { Briefcase, ChevronDown, ChevronRight, EyeOff, Inbox, Lightbulb, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { senderPatterns, subjectWordings } from "@/lib/email-center/rules"
import {
  categoryAllowed, editRuleChanges, guessCategory, newRuleBody, previewRule, rankRules, ruleKindFor, ruleMatchesEmail, sameKind,
  senderMattersByDefault, suggestSenders, suggestWordings, widenRuleChanges,
  toSubjectRule, type ReviewAction, type RuleDraft,
} from "./ruleSuggest"
import { api, SearchSelect, fmtDateTime, ruleOutcome, type CategoryOption, type EmailRow, type RuleRow } from "./shared"

type RuleMode = "new" | "edit" | "skip"

// Needs Review's Create task / Mark as update / Ignore — for one email or a bulk selection. Before
// anything moves, this sums up what the picked mail has in common and proposes a rule for it (a new one,
// or a wider version of an existing rule it nearly fits), with a live count of the other Needs Review
// mail that rule would also sort. Confirming applies the action and saves the rule; the page then
// re-runs the rules over those other emails in the background (see confirmReviewAction in page.tsx).

export interface ReviewActionRequest {
  emails: EmailRow[]
  action: ReviewAction
}

export interface ReviewActionPlan {
  emails: EmailRow[]
  action: ReviewAction
  // Update / Ignore only: false = delete the emails from the app instead of filing them.
  keep: boolean
  // The task category (Create task), or the update category (Mark as update, kept). Null = leave as is.
  categoryKey: string | null
  rule: null | { mode: "create"; body: Record<string, unknown> } | { mode: "update"; rule: RuleRow; changes: Partial<RuleRow> }
  // Other Needs Review emails the saved rule should catch — reclassified in the background.
  similarIds: string[]
}

const TITLE: Record<ReviewAction, string> = { task: "Create task", update: "Mark as update", ignore: "Ignore" }

function PatternList({
  values, onChange, placeholder, disabled, mono, isNew,
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
  disabled?: boolean
  mono?: boolean
  isNew?: (value: string) => boolean
}) {
  return (
    <div className="space-y-1.5">
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={v}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(ev) => onChange(values.map((x, j) => (j === i ? ev.target.value : x)))}
            className={cn("h-9 text-base rounded-md border-slate-200", mono && "font-mono text-sm", isNew?.(v) && "border-amber-300 bg-amber-50/40")}
          />
          {values.length > 1 && (
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(values.filter((_, j) => j !== i))} className="h-9 w-9 p-0 text-slate-400 hover:text-red-600" title="Remove">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...values, ""])}
        className="inline-flex items-center gap-1 text-sm font-medium text-custom-blue hover:underline disabled:opacity-50 disabled:no-underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add another
      </button>
    </div>
  )
}

function ruleLabel(r: RuleRow): string {
  const subjects = [r.pattern, ...(r.extra_patterns ?? [])].map((w) => w.trim()).filter(Boolean)
  const senders = [r.sender_pattern, ...(r.extra_sender_patterns ?? [])].map((w) => (w ?? "").trim()).filter(Boolean)
  const subjectPart = subjects.length ? subjects.slice(0, 2).join(" · ") + (subjects.length > 2 ? ` (+${subjects.length - 2})` : "") : "Any subject"
  return senders.length ? `${subjectPart} — from ${senders.slice(0, 2).join(" · ")}${senders.length > 2 ? " …" : ""}` : subjectPart
}

export function ReviewActionDialog({
  request,
  reviewEmails,
  rules,
  categories,
  onClose,
  onConfirm,
  onCategoryCreated,
}: {
  request: ReviewActionRequest | null
  // Every email in Needs Review (not just what the current filters show) — the rule applies to all of it.
  reviewEmails: EmailRow[]
  rules: RuleRow[]
  categories: CategoryOption[]
  onClose: () => void
  // Applies the plan; the dialog stays open (busy) until it resolves, then the page closes it.
  onConfirm: (plan: ReviewActionPlan) => Promise<void>
  onCategoryCreated?: (category: CategoryOption) => void
}) {
  const emails = useMemo(() => request?.emails ?? [], [request])
  const action: ReviewAction = request?.action ?? "task"
  const catByKey = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories])

  const [keep, setKeep] = useState(true)
  const [categoryKey, setCategoryKey] = useState("")
  // What to do about a rule: create one, edit an existing one (editId), or leave the rules alone.
  const [ruleMode, setRuleMode] = useState<RuleMode>("skip")
  const [editId, setEditId] = useState("")
  // The editor's contents. In "new" mode they start from what the emails have in common (`seed`); in
  // "edit" mode from the picked rule, widened with those suggestions.
  const [wordings, setWordings] = useState<string[]>([""])
  const [senders, setSenders] = useState<string[]>([""])
  const [useSubject, setUseSubject] = useState(true)
  const [useSender, setUseSender] = useState(false)
  const [showSimilar, setShowSimilar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [categoryCreateError, setCategoryCreateError] = useState("")

  const commonWordings = useMemo(() => suggestWordings(emails), [emails])
  // The suggested rule for these emails — "new" mode starts from (and returns to) it.
  const seed = useMemo<RuleDraft>(() => {
    const w = commonWordings
    const s = suggestSenders(emails)
    const senderOn = s.length > 0 && senderMattersByDefault(emails)
    return { wordings: w.length ? w : [""], senders: s.length ? s : [""], useSubject: w.length > 0 || !senderOn, useSender: senderOn }
  }, [emails, commonWordings])

  const loadDraft = (d: RuleDraft) => {
    setWordings(d.wordings.length ? d.wordings : [""])
    setSenders(d.senders.length ? d.senders : [""])
    setUseSubject(d.useSubject)
    setUseSender(d.useSender)
  }

  // Fresh suggestions every time the dialog opens on a new set of emails.
  useEffect(() => {
    if (!request) return
    setKeep(true)
    setRuleMode("skip")
    setEditId("")
    setShowSimilar(false)
    setCategoryCreateError("")
    loadDraft(seed)
    const k = ruleKindFor(request.action, true)
    setCategoryKey(k === "task" || k === "update" ? guessCategory(request.emails, rules, categories, (c) => categoryAllowed(k, c)) : "")
    // only on open — rules/categories changing underneath shouldn't wipe what's being edited
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  const kind = ruleKindFor(action, keep)
  const filesWithCategory = kind === "task" || kind === "update"
  const categoryOptions = useMemo(() => categories.filter((c) => categoryAllowed(kind, c)), [categories, kind])

  const draft: RuleDraft = { wordings, senders, useSubject, useSender }
  const subjectWordingsGiven = useSubject && wordings.some((w) => w.trim())
  const sendersGiven = useSender && senders.some((s) => s.trim())

  // Ranked on the suggestion, not on what's being typed, so the list doesn't reshuffle mid-edit.
  const candidates = useMemo(
    () => rankRules(rules, kind, emails, seed.useSubject ? seed.wordings : [], categories),
    [rules, kind, emails, seed, categories]
  )
  const suggested = candidates.filter((c) => c.score >= 0.25).slice(0, 3)
  const existing = ruleMode === "edit" && editId ? rules.find((r) => r.id === editId) ?? null : null
  const saveRule = ruleMode !== "skip"

  // Switching between Keep and Delete changes the rule's kind; a picked rule of the old kind no longer fits.
  useEffect(() => {
    if (existing && !sameKind(existing, kind, catByKey)) {
      setEditId("")
      loadDraft(seed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, kind, catByKey])

  const chooseMode = (mode: RuleMode) => {
    if (mode === ruleMode) return
    setRuleMode(mode)
    // Leaving an edited rule behind: back to the suggestion, so a new rule never starts from someone
    // else's wordings.
    if (mode !== "edit" && editId) {
      setEditId("")
      loadDraft(seed)
    }
    if (mode === "edit" && !editId && suggested[0]) pickRule(suggested[0].rule.id)
  }

  // Loads an existing rule into the editor: everything it already has, plus the suggested wordings and
  // senders it is missing (marked "new"), all of which can be changed or removed before saving.
  const pickRule = (id: string) => {
    const r = rules.find((x) => x.id === id)
    if (!r) return
    setEditId(id)
    const widened = toSubjectRule({ ...r, ...widenRuleChanges(r, seed) })
    const w = subjectWordings(widened)
    const s = senderPatterns(widened)
    loadDraft({ wordings: w, senders: s, useSubject: w.length > 0, useSender: s.length > 0 })
    if (filesWithCategory) setCategoryKey(r.category_key)
  }

  const ruleValid =
    ruleMode === "edit" && !existing ? false
      : filesWithCategory
        ? subjectWordingsGiven && !!categoryKey
        : subjectWordingsGiven || sendersGiven
  const changes = useMemo(
    () => (existing ? editRuleChanges(existing, draft, categoryKey) : {}),
    // draft is rebuilt every render from the four values below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [existing, wordings, senders, useSubject, useSender, categoryKey]
  )
  const originalWordings = useMemo(() => new Set(existing ? subjectWordings(toSubjectRule(existing)).map((w) => w.toLowerCase()) : []), [existing])
  const originalSenders = useMemo(() => new Set(existing ? senderPatterns(toSubjectRule(existing)).map((w) => w.toLowerCase()) : []), [existing])

  const preview = useMemo(
    () => (saveRule && ruleValid ? previewRule(kind, categoryKey, draft, existing) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saveRule, ruleValid, kind, categoryKey, wordings, senders, useSubject, useSender, existing]
  )
  const selectedIds = useMemo(() => new Set(emails.map((e) => e.id)), [emails])
  const selectedHits = useMemo(() => (preview ? emails.filter((e) => ruleMatchesEmail(preview, e)).length : 0), [preview, emails])
  const similar = useMemo(
    () => (preview ? reviewEmails.filter((e) => !selectedIds.has(e.id) && ruleMatchesEmail(preview, e)) : []),
    [preview, reviewEmails, selectedIds]
  )

  // ── the auto summary ──
  const summary = useMemo(() => {
    const senderCounts = new Map<string, number>()
    const companyNames = new Set<string>()
    let unassigned = 0
    let first = ""
    let last = ""
    for (const e of emails) {
      const s = e.sender_email.toLowerCase()
      senderCounts.set(s, (senderCounts.get(s) ?? 0) + 1)
      if (e.company_name) companyNames.add(e.company_name)
      else unassigned++
      if (!first || e.received_at < first) first = e.received_at
      if (!last || e.received_at > last) last = e.received_at
    }
    return {
      senders: [...senderCounts.entries()].sort((a, b) => b[1] - a[1]),
      companies: [...companyNames],
      unassigned,
      first,
      last,
    }
  }, [emails])

  const n = emails.length
  const plural = (word: string, count = n) => `${count} ${word}${count === 1 ? "" : "s"}`
  const needsCategory = action === "task" || (action === "update" && keep && saveRule)
  const canConfirm = n > 0 && !saving && (!needsCategory || !!categoryKey) && (!saveRule || ruleValid)

  const confirmLabel =
    action === "task" ? `Create ${plural("task")}`
      : !keep ? `Delete ${plural("email")}`
      : action === "update" ? `Mark ${plural("email")} as update`
      : `Ignore ${plural("email")}`

  const outcome = saveRule
    ? ruleOutcome(
        existing ?? ({ is_ignore: kind === "ignore" || kind === "hard_ignore", hard_ignore: kind === "hard_ignore", is_notify: false, notify_priority: "urgent" } as RuleRow),
        catByKey.get(categoryKey || existing?.category_key || "")
      )
    : null
  const OutcomeIcon = outcome?.icon

  const confirm = async () => {
    if (!request || !canConfirm) return
    const plan: ReviewActionPlan = {
      emails,
      action,
      keep: action === "task" || keep,
      categoryKey: action === "task" || (action === "update" && keep) ? categoryKey || null : null,
      rule: !saveRule
        ? null
        : existing
          ? Object.keys(changes).length ? { mode: "update", rule: existing, changes } : null
          : { mode: "create", body: newRuleBody(kind, categoryKey, draft) },
      similarIds: saveRule ? similar.map((e) => e.id) : [],
    }
    setSaving(true)
    try {
      await onConfirm(plan)
    } finally {
      setSaving(false)
    }
  }

  const createCategory = async (name: string) => {
    if (creatingCategory || !name.trim()) return
    setCategoryCreateError("")
    setCreatingCategory(true)
    try {
      const result = await api<{ category: CategoryOption }>("/api/email-center/categories", {
        method: "POST", body: JSON.stringify({ name }),
      })
      onCategoryCreated?.(result.category)
      setCategoryKey(result.category.key)
      setCategoryCreateError("")
    } catch (error: any) {
      setCategoryCreateError(error.message || "Could not create task type.")
    } finally {
      setCreatingCategory(false)
    }
  }

  const HeaderIcon = action === "task" ? Briefcase : !keep ? Trash2 : action === "update" ? Inbox : EyeOff

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-2xl w-[96vw] max-h-[90vh] p-0 gap-0 border border-slate-200 shadow-xl rounded-2xl overflow-hidden bg-white flex flex-col">
        <div className="flex items-center gap-3 border-b border-slate-200 pl-5 pr-12 py-3 shrink-0">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg shrink-0", !keep && action !== "task" ? "bg-red-50 text-red-600" : "bg-custom-blue/10 text-custom-blue")}>
            <HeaderIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">{TITLE[action]} — {plural("email")}</DialogTitle>
            <DialogDescription className="text-sm text-slate-500 mt-0.5">
              {saveRule
                ? <>Sort {n === 1 ? "this email" : "these emails"} and teach a rule how to handle similar mail.</>
                : <>Sort {n === 1 ? "this email" : "these emails"} only. You can add a rule later.</>}
            </DialogDescription>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4">
          {/* What the picked mail is */}
          <section className="rounded-lg bg-slate-50 px-3.5 py-3 space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <Sparkles className="h-3.5 w-3.5 text-custom-blue" /> Email summary
            </h3>
            {n === 1 ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900 leading-snug">{emails[0].subject || "(no subject)"}</p>
                {(emails[0].ai_summary || emails[0].snippet) && (
                  <p className="text-sm text-slate-600 leading-snug line-clamp-2">{emails[0].ai_summary || emails[0].snippet}</p>
                )}
              </div>
            ) : (
              <ul className="space-y-0.5 text-sm text-slate-700">
                {emails.slice(0, 4).map((e) => (
                  <li key={e.id} className="truncate" title={e.subject}>• {e.subject || "(no subject)"}</li>
                ))}
                {n > 4 && <li className="text-slate-400">+ {n - 4} more</li>}
              </ul>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-slate-500">From</dt>
              <dd className="text-slate-800 break-all">
                {summary.senders.slice(0, 3).map(([s, c]) => (n > 1 ? `${s} (${c})` : s)).join(" · ")}
                {summary.senders.length > 3 && ` · ${summary.senders.length - 3} other sender${summary.senders.length - 3 === 1 ? "" : "s"}`}
              </dd>
              <dt className="text-slate-500">Company</dt>
              <dd className="text-slate-800">
                {summary.companies.length === 0
                  ? <span className="text-red-500">Unassigned</span>
                  : summary.companies.length <= 2
                    ? summary.companies.join(" · ")
                    : `${summary.companies.length} companies`}
                {summary.companies.length > 0 && summary.unassigned > 0 && ` · ${summary.unassigned} unassigned`}
              </dd>
              <dt className="text-slate-500">Received</dt>
              <dd className="text-slate-800 tabular-nums">
                {summary.first === summary.last ? fmtDateTime(summary.first) : `${fmtDateTime(summary.first, false)} – ${fmtDateTime(summary.last, false)}`}
              </dd>
            </dl>
          </section>

          {/* What happens to them now */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-800">Sort {n === 1 ? "this email" : "these emails"}</h3>
            {action !== "task" && (
              <div className="grid sm:grid-cols-2 gap-2">
                {[
                  { value: true, title: action === "update" ? "Keep in the Update tab" : "Keep in the Ignored tab", hint: "Stays in the app, filed out of the way." },
                  { value: false, title: "Delete completely", hint: "Removed from the app — it stays in Gmail." },
                ].map((o) => (
                  <button
                    key={String(o.value)}
                    type="button"
                    onClick={() => setKeep(o.value)}
                    className={cn(
                      "text-left rounded-lg border px-3 py-2 transition-colors",
                      keep === o.value
                        ? o.value ? "border-custom-blue bg-blue-50/60 ring-1 ring-custom-blue" : "border-red-400 bg-red-50/60 ring-1 ring-red-400"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    )}
                  >
                    <span className={cn("block text-sm font-semibold", keep === o.value && !o.value ? "text-red-700" : "text-slate-800")}>{o.title}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">{o.hint}</span>
                  </button>
                ))}
              </div>
            )}
            {filesWithCategory && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">
                  {action === "task" ? "Kind of task (notice type)" : "Update type"}
                  {action === "update" && !saveRule && <span className="text-slate-400 font-normal"> — optional</span>}
                </label>
                <SearchSelect
                  className="w-full"
                  value={categoryKey}
                  onChange={setCategoryKey}
                  onCreateOption={action === "task" ? (query) => void createCategory(query) : undefined}
                  disabled={creatingCategory}
                  placeholder={action === "task" ? "What is KRA asking for? e.g. Pre-Assessment Notice…" : "What kind of update is it? e.g. Return / Payment Acknowledgement…"}
                  options={categoryOptions.map((c) => ({ value: c.key, label: c.name }))}
                  error={needsCategory && !categoryKey}
                />
                {creatingCategory && <p className="text-sm text-slate-500">Creating task type…</p>}
                {categoryCreateError && <p className="text-sm text-red-600">{categoryCreateError}</p>}
                <p className="text-xs text-slate-500 leading-snug">
                  {action === "task"
                    ? <>Choose what KRA is asking for. Search existing types or create a new one.{categoryKey ? " Suggested from the subject; change it if needed." : ""}</>
                    : <>Choose the update category.{categoryKey ? " Suggested from the subject; change it if needed." : ""}</>}
                  {ruleMode === "edit" && existing && categoryKey !== existing.category_key && <span className="block text-amber-700 font-medium">This also changes the rule&apos;s type.</span>}
                </p>
              </div>
            )}
          </section>

          {/* The rule */}
          <section className="border-t border-slate-200 pt-3 space-y-3">
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <Lightbulb className="h-4 w-4 text-amber-500" /> Next time mail like this arrives
              </h3>
              <div className="grid sm:grid-cols-3 gap-2">
                {([
                  { mode: "new", title: "Create a new rule", hint: "Use these emails as a starting point." },
                  {
                    mode: "edit",
                    title: "Edit an existing rule",
                    hint: candidates.length ? (suggested.length ? `${suggested.length} close match${suggested.length === 1 ? "" : "es"} found` : "Choose a rule to adapt") : "No rules available",
                  },
                  { mode: "skip", title: "Skip — no rule", hint: "Sort this selection only." },
                ] as { mode: RuleMode; title: string; hint: string }[]).map((o) => {
                  const disabled = o.mode === "edit" && candidates.length === 0
                  return (
                    <button
                      key={o.mode}
                      type="button"
                      disabled={disabled}
                      onClick={() => chooseMode(o.mode)}
                      className={cn(
                      "text-left rounded-lg border px-3 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                        ruleMode === o.mode ? "border-custom-blue bg-blue-50/60 ring-1 ring-custom-blue" : "border-slate-200 bg-white hover:bg-slate-50"
                      )}
                    >
                      <span className="block text-sm font-semibold text-slate-800">{o.title}</span>
                      <span className="block text-xs text-slate-500 mt-0.5 leading-snug">{o.hint}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {saveRule && (
              <>
                {ruleMode === "edit" && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-slate-600">Rule to edit</p>
                    {suggested.length > 0 && (
                      <div className="space-y-1.5">
                        {suggested.map((c) => (
                          <RuleChoice
                            key={c.rule.id}
                            active={editId === c.rule.id}
                            onClick={() => pickRule(c.rule.id)}
                            title={ruleLabel(c.rule)}
                            sub={[
                              filesWithCategory ? catByKey.get(c.rule.category_key)?.name ?? c.rule.category_key : null,
                              c.subjectHits ? `subject already matches ${c.subjectHits} of ${n}` : null,
                              c.senderHits ? `sender matches ${c.senderHits} of ${n}` : null,
                              c.rule.is_active ? null : "inactive — will be turned back on",
                            ].filter(Boolean).join(" · ")}
                            badge="Close match"
                          />
                        ))}
                      </div>
                    )}
                    <SearchSelect
                      className="w-full"
                      value={editId && !suggested.some((c) => c.rule.id === editId) ? editId : ""}
                      onChange={(v) => v && pickRule(v)}
                      placeholder={suggested.length ? "…or pick another rule" : "Pick the rule to edit…"}
                      options={candidates
                        .filter((c) => !suggested.some((s) => s.rule.id === c.rule.id))
                        .map((c) => ({ value: c.rule.id, label: `${ruleLabel(c.rule)}${filesWithCategory ? ` — ${catByKey.get(c.rule.category_key)?.name ?? c.rule.category_key}` : ""}` }))}
                    />
                  </div>
                )}

                {(ruleMode === "new" || existing) && (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer">
                          <Checkbox checked={useSubject} onCheckedChange={(v) => setUseSubject(v === true)} />
                          Subject contains {wordings.length > 1 && <span className="text-slate-400 font-normal">(any of)</span>}
                        </label>
                        <PatternList
                          values={wordings}
                          onChange={setWordings}
                          placeholder="e.g. Pre-Assessment Notice"
                          disabled={!useSubject}
                          isNew={existing ? (v) => !!v.trim() && !originalWordings.has(v.trim().toLowerCase()) : undefined}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer">
                          <Checkbox checked={useSender} onCheckedChange={(v) => setUseSender(v === true)} />
                          Sender contains {senders.length > 1 && <span className="text-slate-400 font-normal">(any of)</span>}
                        </label>
                        <PatternList
                          values={senders}
                          onChange={setSenders}
                          placeholder="e.g. @example.com"
                          disabled={!useSender}
                          mono
                          isNew={existing ? (v) => !!v.trim() && !originalSenders.has(v.trim().toLowerCase()) : undefined}
                        />
                      </div>
                    </div>
                    <p className="text-sm text-slate-400 -mt-2">
                      {existing
                        ? "This is the whole rule — the ones marked “new” were added from these emails. Change or remove anything before saving."
                        : "Trim each wording to the part that identifies this kind of mail — names, PINs and reference numbers were left out on purpose."}
                    </p>
                  </>
                )}

                {ruleMode === "edit" && !existing ? (
                  <p className="text-sm font-medium text-amber-700">Pick the rule to edit.</p>
                ) : !ruleValid ? (
                  <p className="text-sm font-medium text-amber-700">
                    {filesWithCategory
                      ? !categoryKey ? `Pick the ${action === "task" ? "notice" : "update"} type above to save the rule.` : "Give the rule at least one subject wording."
                      : "Give the rule a subject wording or a sender."}
                  </p>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 space-y-1.5">
                    {outcome && OutcomeIcon && (
                      <p className={cn("flex items-center gap-1.5 text-base font-semibold", outcome.tone)}>
                        <OutcomeIcon className="h-5 w-5 shrink-0" /> From now on: {outcome.label}
                      </p>
                    )}
                    <p className={cn("text-sm", selectedHits < n ? "text-amber-700 font-medium" : "text-slate-600")}>
                      Matches {selectedHits} of the {plural("picked email")}{selectedHits < n && " — add a wording or sender for the rest"}.
                    </p>
                    {existing && Object.keys(changes).length === 0 && (
                      <p className="text-sm text-slate-500">No changes to the rule — it&apos;s saved as it is.</p>
                    )}
                    {similar.length > 0 ? (
                      <div>
                        <button type="button" onClick={() => setShowSimilar((v) => !v)} className="inline-flex items-center gap-1 text-sm font-semibold text-custom-blue hover:underline">
                          {showSimilar ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {plural("more email", similar.length)} in Needs Review {similar.length === 1 ? "looks" : "look"} the same — sorted in the background once you confirm
                        </button>
                        {showSimilar && (
                          <ul className="mt-1.5 max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
                            {similar.slice(0, 50).map((e) => (
                              <li key={e.id} className="px-3 py-1.5 flex gap-2">
                                <span className="text-slate-400 tabular-nums shrink-0">{fmtDateTime(e.received_at, false)}</span>
                                <span className="text-slate-500 shrink-0 max-w-[10rem] truncate">{e.company_name ?? "Unassigned"}</span>
                                <span className="text-slate-800 truncate" title={e.subject}>{e.subject}</span>
                              </li>
                            ))}
                            {similar.length > 50 && <li className="px-3 py-1.5 text-slate-400">+ {similar.length - 50} more</li>}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No other email in Needs Review matches it right now.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-3 flex items-center gap-3 shrink-0">
          <div className="ml-auto flex items-center gap-2.5">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving} className="h-10 px-4 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg">Cancel</Button>
            <Button
              size="sm"
              onClick={confirm}
              disabled={!canConfirm}
              className={cn(
                "h-10 px-5 text-sm font-semibold text-white rounded-lg shadow-xs gap-2",
                !keep && action !== "task" ? "bg-red-600 hover:bg-red-700" : "bg-custom-blue hover:bg-custom-blue/90"
              )}
            >
              {saving && <Loader2 className="w-5 h-5 animate-spin" />}
              {confirmLabel}{saveRule && ruleValid ? (existing ? (Object.keys(changes).length ? " & update rule" : "") : " & save rule") : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RuleChoice({ active, onClick, title, sub, badge }: { active: boolean; onClick: () => void; title: string; sub?: string; badge?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border px-3.5 py-2 transition-colors flex items-start gap-2.5",
        active ? "border-custom-blue bg-blue-50/60 ring-1 ring-custom-blue" : "border-slate-200 bg-white hover:bg-slate-50"
      )}
    >
      <span className={cn("mt-1 h-4 w-4 shrink-0 rounded-full border-2", active ? "border-custom-blue bg-custom-blue shadow-[inset_0_0_0_2px_white]" : "border-slate-300")} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-base font-medium text-slate-800 truncate">{title}</span>
          {badge && <span className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">{badge}</span>}
        </span>
        {sub && <span className="block text-sm text-slate-500 truncate">{sub}</span>}
      </span>
    </button>
  )
}
