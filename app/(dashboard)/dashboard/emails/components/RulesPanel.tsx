"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, ArrowRightCircle, Bell, CheckCircle2, EyeOff, FilePlus2, Info, Link2, Loader2, Mail, Pencil, Plus, Tag, Trash2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { HEAD_BLUE, TableLoading, SortTh, TD_CLASS, TH_CLASS, useSortedRows, zebraRow } from "./table"
import { PRIMARY_PILL_BUTTON_CLASS, SearchSelect, api, type CategoryOption, type RuleRow } from "./shared"

// The Rules tab: the subject rules that drive automatic classification, auto-ignore and important
// notifications, editable without a deploy. Rules are tried lowest "Order" first and the first match
// wins (so put specific rules above general ones); ignore rules are checked before notifications,
// which are checked before classification. Ignore and notify rules may also match on the sender
// address (instead of or in addition to the subject); classify rules match on the subject only. An
// email is only acted on automatically at 80% confidence or more; below that it goes to Needs Review
// — see lib/email-center/rules.ts and rule-store.ts.

const SORT_VALUE: Record<string, (r: RuleRow) => string | number> = {
  order: (r) => r.sort_order,
  match: (r) => r.match_type,
  pattern: (r) => r.pattern,
  category: (r) => r.category_key,
  confidence: (r) => r.confidence,
  active: (r) => (r.is_active ? 1 : 0),
  actions: (r) => r.updated_at ?? "", // most recently edited last
}

// What actually happens to a matching email — the one thing the Category pill alone doesn't say (a
// category name like "Demand / Penalty / Assessment" doesn't tell you whether it opens a task, only
// updates one, or is never stored at all). Checked in the same order ingestion itself decides it:
// ignore, then notify, then the category's own creates_case / attaches_to_case / disposition.
type Outcome = { icon: typeof FilePlus2; label: string; tone: string }

function ruleOutcome(r: RuleRow, cat: CategoryOption | undefined): Outcome {
  if (r.is_ignore) return { icon: EyeOff, label: "Ignored — stored, no task", tone: "text-slate-500" }
  if (r.is_notify) return { icon: Bell, label: "Notifications tab — flagged urgent, no task", tone: "text-amber-600" }
  if (cat?.creates_case) return { icon: FilePlus2, label: "Opens a task", tone: "text-emerald-600" }
  if (cat?.attaches_to_case) return { icon: Link2, label: "Updates an existing task only", tone: "text-blue-600" }
  if (cat?.disposition === "needs_review") return { icon: ArrowRightCircle, label: "Needs Review — no task", tone: "text-amber-600" }
  if (cat?.disposition === "ignore") return { icon: EyeOff, label: "Ignored — stored, no task", tone: "text-slate-500" }
  return { icon: XCircle, label: "Recognized as an Update only but not stored — stays in Gmail", tone: "text-slate-400" }
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// A rule's subject wordings, one per line in the editor: the first is the rule's primary pattern, the rest
// are alternative wordings. The rule matches when ANY of them matches.
const splitWordings = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

// Same matching the server does (contains = escaped, case-insensitive, any wording), so the tester never
// disagrees with ingestion. Reports which wording matched, which is what makes a long list easy to debug.
function testWordings(matchType: string, wordings: string[], sample: string): { state: "match" | "no" | "invalid" | "empty"; matched?: string } {
  if (!wordings.length || !sample.trim()) return { state: "empty" }
  let invalid = false
  for (const w of wordings) {
    try {
      const re = new RegExp(matchType === "contains" ? escapeRegex(w) : w, "i")
      if (re.test(sample)) return { state: "match", matched: w }
    } catch {
      invalid = true
    }
  }
  return { state: invalid ? "invalid" : "no" }
}

// One numbered section of the Add/Edit dialog: what to decide first comes first, and each step says what
// it is for, so the form reads top to bottom as "what happens -> what to look for -> how sure -> extras".
function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-custom-blue text-sm font-bold text-white">{n}</span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900 leading-7">{title}</h3>
          {hint && <p className="text-sm text-slate-500 -mt-0.5">{hint}</p>}
        </div>
      </div>
      <div className="pl-10 space-y-5">{children}</div>
    </section>
  )
}

type RuleAction = "classify" | "ignore" | "notify"

const ACTIONS: Array<{ value: RuleAction; title: string; hint: string; icon: typeof Tag; tone: string }> = [
  { value: "classify", title: "Classify", hint: "Sort it into a KRA category — opens or updates a case.", icon: Tag, tone: "border-custom-blue bg-blue-50/60 ring-custom-blue" },
  { value: "ignore", title: "Ignore", hint: "Send it to the Ignored tab, under this rule. No case is opened.", icon: EyeOff, tone: "border-slate-400 bg-slate-50 ring-slate-400" },
  { value: "notify", title: "Flag as important", hint: "Keep it in Needs Review, marked urgent. No case is opened.", icon: Bell, tone: "border-amber-400 bg-amber-50 ring-amber-400" },
]

type Draft = {
  id: string | null
  is_ignore: boolean
  is_notify: boolean
  match_type: "contains" | "regex"
  // Subject wordings, one per line: the first is the rule's primary pattern, the rest are alternatives.
  wordings: string
  sender_match_type: "contains" | "regex"
  sender_pattern: string
  category_key: string
  confidence: string
  sort_order: string
  notes: string
  is_active: boolean
}

const emptyDraft = (nextOrder: number): Draft => ({
  id: null, is_ignore: false, is_notify: false, match_type: "contains", wordings: "", sender_match_type: "contains", sender_pattern: "",
  category_key: "", confidence: "90", sort_order: String(nextOrder), notes: "", is_active: true,
})

export function RulesPanel({
  rules,
  source,
  categories,
  loading,
  search,
  onRulesChange,
  onRuleCreated,
}: {
  rules: RuleRow[]
  source: "database" | "builtin"
  categories: CategoryOption[]
  loading: boolean
  search: string
  onRulesChange: (update: (prev: RuleRow[]) => RuleRow[]) => void
  onRuleCreated?: (rule: RuleRow) => void
}) {
  const readOnly = source === "builtin"
  const catByKey = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rules
    return rules.filter((r) => `${r.pattern} ${(r.extra_patterns ?? []).join(" ")} ${r.sender_pattern ?? ""} ${catByKey.get(r.category_key)?.name ?? r.category_key} ${r.notes ?? ""}`.toLowerCase().includes(q))
  }, [rules, search, catByKey])

  // outcome needs catByKey (a rule alone doesn't say what its category does), so it's merged in here
  // rather than living in the module-level SORT_VALUE like every other column.
  const sortAccessors = useMemo(
    () => ({ ...SORT_VALUE, outcome: (r: RuleRow) => ruleOutcome(r, catByKey.get(r.category_key)).label }),
    [catByKey]
  )
  const { sort, sorted, toggle } = useSortedRows(visible, sortAccessors, { key: "order", dir: "asc" })

  const [draft, setDraft] = useState<Draft | null>(null)
  const [sample, setSample] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<RuleRow | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)

  const nextOrder = (rules.reduce((max, r) => Math.max(max, r.sort_order), 0) || 0) + 10

  const openNew = () => { setSample(""); setDraft(emptyDraft(nextOrder)) }
  const openEdit = (r: RuleRow) => {
    setSample("")
    setDraft({
      id: r.id, is_ignore: r.is_ignore, is_notify: r.is_notify, match_type: r.match_type, wordings: [r.pattern, ...(r.extra_patterns ?? [])].filter(Boolean).join("\n"),
      sender_match_type: r.sender_match_type ?? "contains", sender_pattern: r.sender_pattern ?? "",
      category_key: r.category_key,
      confidence: String(Math.round(r.confidence * 100)), sort_order: String(r.sort_order), notes: r.notes ?? "", is_active: r.is_active,
    })
  }

  const save = async () => {
    if (!draft) return
    const lines = splitWordings(draft.wordings)
    if (!lines.length && !draft.sender_pattern.trim()) return toast.error("Add at least one subject wording, or a sender, to match.")
    if (!draft.is_ignore && !draft.is_notify && !lines.length) return toast.error("A classify rule needs at least one subject wording.")
    if (!draft.is_ignore && !draft.is_notify && !draft.category_key) return toast.error("Choose a category.")
    const confidence = Number(draft.confidence) / 100
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return toast.error("Confidence must be between 0 and 100.")
    const payload = {
      is_ignore: draft.is_ignore,
      is_notify: draft.is_notify,
      match_type: draft.match_type,
      pattern: lines[0] ?? "",
      extra_patterns: lines.slice(1),
      sender_pattern: draft.sender_pattern.trim() || null,
      sender_match_type: draft.sender_match_type,
      // The table keeps category_key NOT NULL; ignore rules carry "system_noise" and notify rules
      // carry "notification" — neither name a real category.
      category_key: draft.is_ignore ? "system_noise" : draft.is_notify ? "notification" : draft.category_key,
      confidence,
      sort_order: Number(draft.sort_order) || nextOrder,
      is_active: draft.is_active,
      notes: draft.notes,
    }
    setSaving(true)
    try {
      if (draft.id) {
        const res = await api<{ rule: RuleRow }>(`/api/email-center/rules/${draft.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        onRulesChange((prev) => prev.map((r) => (r.id === draft.id ? res.rule : r)))
        toast.success("Rule updated.")
      } else {
        const res = await api<{ rule: RuleRow }>("/api/email-center/rules", { method: "POST", body: JSON.stringify(payload) })
        onRulesChange((prev) => [...prev, res.rule])
        toast.success("Rule added.")
        onRuleCreated?.(res.rule)
      }
      setDraft(null)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (r: RuleRow, is_active: boolean) => {
    onRulesChange((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active } : x)))
    try {
      await api(`/api/email-center/rules/${r.id}`, { method: "PATCH", body: JSON.stringify({ is_active }) })
    } catch (e: any) {
      onRulesChange((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: r.is_active } : x)))
      toast.error(e.message)
    }
  }

  const remove = async () => {
    if (!deleting) return
    try {
      await api(`/api/email-center/rules/${deleting.id}`, { method: "DELETE" })
      onRulesChange((prev) => prev.filter((r) => r.id !== deleting.id))
      toast.success("Rule deleted.")
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setDeleting(null)
    }
  }

  const wordingCount = draft ? splitWordings(draft.wordings).length : 0
  const test = draft ? testWordings(draft.match_type, splitWordings(draft.wordings), sample) : { state: "empty" as const, matched: undefined }
  const result = test.state

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="shrink-0 flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl shadow-sm px-5 py-3">
        <div className="flex items-center gap-2.5">
          <p className="text-lg font-semibold text-slate-900">Classification rules</p>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-slate-200 bg-slate-50 text-base font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            title="How rules work"
          >
            <Info className="h-5 w-5 text-custom-blue" /> How rules work
          </button>
        </div>
        <Button size="sm" onClick={openNew} disabled={readOnly} className={cn(PRIMARY_PILL_BUTTON_CLASS, "shrink-0")}>
          <Plus className="w-5 h-5" /> Add rule
        </Button>
      </div>

      {readOnly && (
        <div className="shrink-0 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900">
          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-amber-600" />
          <span>
            The rules table isn't editable right now (table or migration missing), so these are the built-in rules (read-only).
            Apply the migrations
            <span className="font-mono"> 20260924000000_email_classification_rules.sql, </span>
            <span className="font-mono"> 20260925000000_email_ignore_rules.sql </span>
            and
            <span className="font-mono"> 20260926000000_email_notify_and_sender_rules.sql </span>
            to make them editable — classification keeps working with the built-in list until then.
          </span>
        </div>
      )}

      <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
          <table className="w-full min-w-[1220px] border-separate border-spacing-0 text-base">
            <thead className="sticky top-0 z-30 bg-white shadow-xs">
              <tr>
                <SortTh tone="blue" id="#" sort={sort} onSort={toggle} className="w-16 text-center">#</SortTh>
                <SortTh tone="blue" id="order" sort={sort} onSort={toggle} className="w-24 text-left">Order</SortTh>
                <SortTh tone="blue" id="match" sort={sort} onSort={toggle} className="w-32 text-left">Match</SortTh>
                <SortTh tone="blue" id="pattern" sort={sort} onSort={toggle} className="min-w-[320px] text-left">Subject wordings / sender</SortTh>
                <SortTh tone="blue" id="category" sort={sort} onSort={toggle} className="min-w-[220px] text-left">Category</SortTh>
                <SortTh tone="blue" id="outcome" sort={sort} onSort={toggle} className="min-w-[220px] text-left">Result</SortTh>
                <SortTh tone="blue" id="confidence" sort={sort} onSort={toggle} className="w-36 text-left">Confidence</SortTh>
                <SortTh tone="blue" id="active" sort={sort} onSort={toggle} className="w-28 text-left">Active</SortTh>
                <SortTh tone="blue" id="actions" sort={sort} onSort={toggle} className="w-32 border-r-0 text-left">Actions</SortTh>
              </tr>
            </thead>
            <tbody>
              {loading && <TableLoading cols={9} />}
              {!loading && sorted.map((r, index) => {
                const cat = catByKey.get(r.category_key)
                const auto = r.confidence >= 0.8
                return (
                  <tr key={r.id} className={cn("transition-colors", zebraRow(index), !r.is_active && "opacity-60")}>
                    <td className={cn(TD_CLASS, "text-center text-slate-400 tabular-nums font-medium")}>{index + 1}</td>
                    <td className={cn(TD_CLASS, "tabular-nums font-medium")}>{r.sort_order}</td>
                    <td className={TD_CLASS}>
                      <span className={cn("text-sm font-semibold px-2.5 py-0.5 rounded-full border", r.match_type === "regex" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-slate-100 text-slate-700 border-slate-200")}>
                        {r.match_type === "regex" ? "Regex" : "Contains"}
                      </span>
                    </td>
                    <td className={cn(TD_CLASS, "text-sm text-slate-800 break-all")}>
                      {(() => {
                        const wordings = [r.pattern, ...(r.extra_patterns ?? [])].filter(Boolean)
                        // Plain "contains" wordings read as ordinary sentences; only a genuine regex line
                        // gets the code styling + a "pattern" hint, so staff don't mistake one for the other.
                        return wordings.length
                          ? wordings.map((w, i) => (
                              <div key={i} className="flex items-baseline gap-1.5">
                                {i > 0 && <span className="text-slate-400 shrink-0">or</span>}
                                {r.match_type === "regex" ? (
                                  <span className="inline-flex items-baseline gap-1.5 min-w-0">
                                    <span className="font-mono bg-violet-50 text-violet-800 rounded px-1.5 py-0.5 break-all">{w}</span>
                                    <span className="text-sm font-sans text-violet-400 shrink-0" title="This line is a pattern (regular expression), not exact wording.">pattern</span>
                                  </span>
                                ) : (
                                  <span className="break-all">“{w}”</span>
                                )}
                              </div>
                            ))
                          : <span className="text-slate-400">Any subject</span>
                      })()}
                      {r.sender_pattern && (
                        <div className="flex items-center gap-1.5 font-sans text-sm text-slate-500 mt-0.5">
                          <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          from <span className="font-mono">{r.sender_pattern}</span>
                          <span className="text-slate-400">{r.sender_match_type === "regex" ? "regex" : "contains"}</span>
                        </div>
                      )}
                      {r.notes && <div className="font-sans text-sm text-slate-400 mt-0.5">{r.notes}</div>}
                    </td>
                    <td className={TD_CLASS}>
                      {r.is_ignore ? (
                        <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-300">Ignore</span>
                      ) : r.is_notify ? (
                        <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">Notify</span>
                      ) : cat ? (
                        <span
                          className="text-sm font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap"
                          style={{ background: `${cat.color ?? "#6b7280"}14`, color: cat.color ?? "#6b7280", borderColor: `${cat.color ?? "#6b7280"}33` }}
                        >
                          {cat.name}
                        </span>
                      ) : <span className="text-red-500">{r.category_key}</span>}
                    </td>
                    <td className={TD_CLASS}>
                      {(() => {
                        const outcome = ruleOutcome(r, cat)
                        const Icon = outcome.icon
                        return (
                          <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", outcome.tone)}>
                            <Icon className="h-4 w-4 shrink-0" /> {outcome.label}
                          </span>
                        )
                      })()}
                    </td>
                    <td className={cn(TD_CLASS, "whitespace-nowrap")}>
                      <span className="tabular-nums font-medium">{Math.round(r.confidence * 100)}%</span>
                      <span className={cn("ml-2 text-sm", auto ? "text-emerald-600" : "text-amber-600")}>{auto ? "Auto" : "Review"}</span>
                    </td>
                    <td className={TD_CLASS}>
                      <Switch checked={r.is_active} disabled={readOnly} onCheckedChange={(v) => toggleActive(r, v)} />
                    </td>
                    <td className={cn(TD_CLASS, "border-r-0")}>
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" disabled={readOnly} onClick={() => openEdit(r)} className="h-9 w-9 p-0 rounded-md border-slate-200" title="Edit rule">
                          <Pencil className="w-4 h-4 text-slate-600" />
                        </Button>
                        <Button variant="outline" size="sm" disabled={readOnly} onClick={() => setDeleting(r)} className="h-9 w-9 p-0 rounded-md border-slate-200 hover:bg-red-50 hover:border-red-200" title="Delete rule">
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={9} className="py-16 text-center text-slate-400 text-base">No rules match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* How rules work */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-2xl w-[96vw] max-h-[92vh] p-0 gap-0 border border-slate-200 shadow-xl rounded-2xl overflow-hidden bg-white flex flex-col">
          <div className="flex items-center gap-4 border-b border-slate-200 pl-6 pr-14 py-4 shrink-0">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-custom-blue/10 text-custom-blue shrink-0">
              <Info className="h-6 w-6" />
            </span>
            <div>
              <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900">How rules work</DialogTitle>
              <DialogDescription className="text-base text-slate-500 mt-0.5">What a rule matches, and what happens to an email when it does.</DialogDescription>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-5 space-y-5 text-base text-slate-700 leading-relaxed">
            <section>
              <h3 className="text-base font-semibold text-slate-900 mb-1.5">What a rule matches</h3>
              <p>
                A rule matches an email's <span className="font-medium text-slate-900">subject</span>. Ignore and notification rules can also match
                the <span className="font-medium text-slate-900">sender</span> address, alone or together with the subject.
                A rule can list <span className="font-medium text-slate-900">several subject wordings</span> — one per line — and it matches when the
                subject contains <span className="font-medium text-slate-900">any one</span> of them.
              </p>
            </section>

            <section>
              <h3 className="text-base font-semibold text-slate-900 mb-2">What a rule does</h3>
              <div className="grid gap-2.5">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="font-semibold text-slate-900">Classify</p>
                  <p className="text-slate-600">Picks the email's category. At <span className="font-medium">80% confidence or more</span> it is handled automatically (a case is opened when the category calls for one); below that it goes to Needs Review.</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="font-semibold text-slate-900">Ignore</p>
                  <p className="text-slate-600">Drops the email without storing it or opening a case. It stays in Gmail.</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="font-semibold text-slate-900">Important notification</p>
                  <p className="text-slate-600">Stores the email and flags it urgent in Needs Review, but never creates a task or case.</p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-base font-semibold text-slate-900 mb-1.5">Order</h3>
              <p>
                Rules are tried in order (lowest number first) and the <span className="font-medium text-slate-900">first match wins</span>, so put specific rules above general ones.
                Ignore rules are checked before notifications, and notifications before classification.
              </p>
            </section>

            <section>
              <h3 className="text-base font-semibold text-slate-900 mb-1.5">When changes apply</h3>
              <p>
                Changes apply to <span className="font-medium text-slate-900">new emails only</span> — emails already stored keep the classification they have.
                Use <span className="font-medium text-slate-900">Reclassify</span> in the toolbar to run what's currently in Needs Review through the updated rules.
              </p>
            </section>
          </div>

          <div className="border-t border-slate-200 bg-white px-6 py-3.5 shrink-0 flex items-center justify-end">
            <Button size="sm" onClick={() => setInfoOpen(false)} className="h-11 px-6 text-base font-semibold bg-custom-blue hover:bg-custom-blue/90 text-white rounded-lg shadow-xs">Got it</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add / edit */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && !saving && setDraft(null)}>
        <DialogContent className="max-w-4xl w-[96vw] max-h-[94vh] p-0 gap-0 border border-slate-200 shadow-xl rounded-2xl overflow-hidden bg-white flex flex-col">
          <div className="border-b border-slate-200 pl-8 pr-14 py-5 shrink-0">
            <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900">{draft?.id ? "Edit rule" : "Add rule"}</DialogTitle>
            <DialogDescription className="text-base text-slate-500 mt-0.5">Decide what happens to matching emails, then what to look for.</DialogDescription>
          </div>

          {draft && (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-8 py-7 space-y-9">
              {/* 1 - what the rule does. Everything below adapts to this choice. */}
              <Step n={1} title="What should happen to matching emails?">
                <div className="grid sm:grid-cols-3 gap-3">
                  {ACTIONS.map((a) => {
                    const current: RuleAction = draft.is_ignore ? "ignore" : draft.is_notify ? "notify" : "classify"
                    const Icon = a.icon
                    return (
                      <button
                        key={a.value}
                        type="button"
                        onClick={() => setDraft({ ...draft, is_ignore: a.value === "ignore", is_notify: a.value === "notify" })}
                        className={cn(
                          "text-left rounded-xl border px-4 py-3 transition-colors",
                          current === a.value ? `${a.tone} ring-1` : "border-slate-200 bg-white hover:bg-slate-50"
                        )}
                      >
                        <span className="flex items-center gap-2 text-base font-semibold text-slate-900"><Icon className="h-5 w-5 text-slate-600" /> {a.title}</span>
                        <span className="block text-sm text-slate-500 mt-1 leading-snug">{a.hint}</span>
                      </button>
                    )
                  })}
                </div>
              </Step>

              {/* 2 - what to look for: sender (ignore / flag only), then subject */}
              <Step
                n={2}
                title="Which emails does it match?"
                hint={draft.is_ignore || draft.is_notify ? "Match on the sender, the subject, or both — when you fill in both, both must match." : "Classify rules apply to mail from KRA (@kra.go.ke) and match on the subject."}
              >
                {(draft.is_ignore || draft.is_notify) && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-slate-600">Sender <span className="text-slate-400 font-normal">— optional, blank = any sender</span></Label>
                    <div className="grid sm:grid-cols-[1fr_11rem] gap-3">
                      <Input
                        className="h-10 text-base rounded-md border-slate-200 font-mono bg-white"
                        value={draft.sender_pattern}
                        onChange={(e) => setDraft({ ...draft, sender_pattern: e.target.value })}
                        placeholder="e.g. admin.itax2@kra.go.ke"
                      />
                      <SearchSelect
                        className="w-full"
                        value={draft.sender_match_type}
                        onChange={(v) => setDraft({ ...draft, sender_match_type: v as Draft["sender_match_type"] })}
                        options={[{ value: "contains", label: "Contains text" }, { value: "regex", label: "Regular expression" }]}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <Label className="text-sm font-medium text-slate-600">
                      {draft.match_type === "regex" ? "Subject expressions" : "Subject wordings"}
                      <span className="text-slate-400 font-normal"> — one per line{(draft.is_ignore || draft.is_notify) && ", optional if you set a sender"}</span>
                    </Label>
                    <div className="w-44">
                      <SearchSelect
                        className="w-full"
                        value={draft.match_type}
                        onChange={(v) => setDraft({ ...draft, match_type: v as Draft["match_type"] })}
                        options={[{ value: "contains", label: "Contains text" }, { value: "regex", label: "Regular expression" }]}
                      />
                    </div>
                  </div>
                  <Textarea
                    rows={5}
                    className={cn("text-base rounded-md border-slate-200 font-mono leading-relaxed", result === "invalid" && "border-red-300")}
                    value={draft.wordings}
                    onChange={(e) => setDraft({ ...draft, wordings: e.target.value })}
                    placeholder={draft.match_type === "regex"
                      ? "pre-?assess(ment)?\nnotice of pre.?assessment"
                      : "Payment against Payment Registration Number\nSuccessful completion of payment registration"}
                  />
                  <p className="text-sm text-slate-400">
                    The rule matches when the subject contains <span className="font-medium text-slate-500">any</span> line. Not case-sensitive.
                    {draft.match_type === "regex" ? " Each line is a JavaScript regular expression." : ""}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                  <Label className="text-sm font-medium text-slate-600">Try it — paste a real subject</Label>
                  <Input className="h-10 text-base rounded-md border-slate-200 bg-white" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="e.g. Re: Pre-Assessment Notice – ABC Ltd" />
                  <p className={cn(
                    "text-base flex items-center gap-1.5 min-h-6",
                    result === "match" && "text-emerald-700", result === "no" && "text-slate-500", result === "invalid" && "text-red-600"
                  )}>
                    {result === "match" && (<><CheckCircle2 className="h-5 w-5" /> This subject would match{wordingCount > 1 && test.matched ? <> — via <span className="font-mono text-sm">{test.matched}</span></> : "."}</>)}
                    {result === "no" && (<><XCircle className="h-5 w-5" /> This subject would not match.</>)}
                    {result === "invalid" && (<><XCircle className="h-5 w-5" /> One of the lines isn't a valid regular expression.</>)}
                  </p>
                </div>
              </Step>

              {/* 3 - the outcome detail: only a classify rule has a category to pick */}
              {!draft.is_ignore && !draft.is_notify && (
                <Step n={3} title="Which category?" hint="What kind of KRA email this is — the category decides whether a case is opened or updated.">
                  <SearchSelect
                    className="w-full"
                    value={draft.category_key}
                    onChange={(v) => setDraft({ ...draft, category_key: v })}
                    placeholder="Choose a category…"
                    options={categories.map((c) => ({ value: c.key, label: c.name }))}
                  />
                </Step>
              )}

              {/* Last - tuning and housekeeping */}
              <Step
                n={draft.is_ignore || draft.is_notify ? 3 : 4}
                title="Settings"
                hint="Usually fine as they are."
              >
                <div className="grid sm:grid-cols-2 gap-x-5 gap-y-5">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-slate-600">Confidence (%)</Label>
                    <Input type="number" min={0} max={100} className="h-10 text-base rounded-md border-slate-200" value={draft.confidence} onChange={(e) => setDraft({ ...draft, confidence: e.target.value })} />
                    <p className="text-sm text-slate-400">80 or more is handled automatically; less goes to Needs Review.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-slate-600">Order</Label>
                    <Input type="number" className="h-10 text-base rounded-md border-slate-200" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} />
                    <p className="text-sm text-slate-400">Lower numbers are tried first; the first match wins. Ignore rules are checked before notifications, which are checked before classification.</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-600">Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <Textarea rows={2} className="resize-none text-base rounded-md border-slate-200" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                  <span className="text-base text-slate-700">Rule is active</span>
                </label>
              </Step>
            </div>
          )}

          <div className="border-t border-slate-200 bg-white px-8 py-4 shrink-0 flex items-center justify-end gap-2.5">
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving} className="h-11 px-5 text-base font-medium text-slate-600 rounded-lg">Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving} className="h-11 px-6 text-base font-semibold bg-custom-blue hover:bg-custom-blue/90 text-white rounded-lg shadow-xs gap-2">
              {saving && <Loader2 className="w-5 h-5 animate-spin" />} {draft?.id ? "Save rule" : "Add rule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {(deleting?.pattern || deleting?.sender_pattern) ? (
                <>Emails matching <span className="font-mono font-medium">{deleting?.pattern || "any subject"}</span>
                  {deleting?.sender_pattern ? <> from <span className="font-mono font-medium">{deleting.sender_pattern}</span></> : null} will no longer be
                  {deleting?.is_ignore ? " automatically ignored by it." : deleting?.is_notify ? " flagged as important notifications by it." : " classified automatically by it."}</>
              ) : "This rule will be removed."}
              Emails already stored keep their classification. You can switch a rule off instead if you might want it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-red-600 hover:bg-red-700">Delete rule</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
