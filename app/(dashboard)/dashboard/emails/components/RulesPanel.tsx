"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, Trash2, XCircle } from "lucide-react"
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
import { HEAD_BLUE, SkeletonRows, SortTh, TD_CLASS, TH_CLASS, useSortedRows, zebraRow } from "./table"
import { PRIMARY_PILL_BUTTON_CLASS, SearchSelect, api, type CategoryOption, type RuleRow } from "./shared"

// The Rules tab: the subject -> category rules that drive automatic classification, editable without a
// deploy. Rules are tried lowest "Order" first and the first match wins (so put specific rules above
// general ones). An email is only acted on automatically at 80% confidence or more; below that it goes
// to Needs Review — see lib/email-center/rules.ts and rule-store.ts.

const SORT_VALUE: Record<string, (r: RuleRow) => string | number> = {
  order: (r) => r.sort_order,
  match: (r) => r.match_type,
  pattern: (r) => r.pattern,
  category: (r) => r.category_key,
  confidence: (r) => r.confidence,
  active: (r) => (r.is_active ? 1 : 0),
  actions: (r) => r.updated_at ?? "", // most recently edited last
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Same matching the server does (contains = escaped, case-insensitive), so the tester never disagrees with ingestion.
function testRule(matchType: string, pattern: string, sample: string): "match" | "no" | "invalid" | "empty" {
  if (!pattern.trim() || !sample.trim()) return "empty"
  try {
    const re = new RegExp(matchType === "contains" ? escapeRegex(pattern.trim()) : pattern, "i")
    return re.test(sample) ? "match" : "no"
  } catch {
    return "invalid"
  }
}

type Draft = { id: string | null; match_type: "contains" | "regex"; pattern: string; category_key: string; confidence: string; sort_order: string; notes: string; is_active: boolean }

const emptyDraft = (nextOrder: number): Draft => ({
  id: null, match_type: "contains", pattern: "", category_key: "", confidence: "90", sort_order: String(nextOrder), notes: "", is_active: true,
})

export function RulesPanel({
  rules,
  source,
  categories,
  loading,
  search,
  onRulesChange,
}: {
  rules: RuleRow[]
  source: "database" | "builtin"
  categories: CategoryOption[]
  loading: boolean
  search: string
  onRulesChange: (update: (prev: RuleRow[]) => RuleRow[]) => void
}) {
  const readOnly = source === "builtin"
  const catByKey = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rules
    return rules.filter((r) => `${r.pattern} ${catByKey.get(r.category_key)?.name ?? r.category_key} ${r.notes ?? ""}`.toLowerCase().includes(q))
  }, [rules, search, catByKey])

  const { sort, sorted, toggle } = useSortedRows(visible, SORT_VALUE, { key: "order", dir: "asc" })

  const [draft, setDraft] = useState<Draft | null>(null)
  const [sample, setSample] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<RuleRow | null>(null)

  const nextOrder = (rules.reduce((max, r) => Math.max(max, r.sort_order), 0) || 0) + 10

  const openNew = () => { setSample(""); setDraft(emptyDraft(nextOrder)) }
  const openEdit = (r: RuleRow) => {
    setSample("")
    setDraft({
      id: r.id, match_type: r.match_type, pattern: r.pattern, category_key: r.category_key,
      confidence: String(Math.round(r.confidence * 100)), sort_order: String(r.sort_order), notes: r.notes ?? "", is_active: r.is_active,
    })
  }

  const save = async () => {
    if (!draft) return
    if (!draft.pattern.trim()) return toast.error("Enter the text or pattern to match.")
    if (!draft.category_key) return toast.error("Choose a category.")
    const confidence = Number(draft.confidence) / 100
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return toast.error("Confidence must be between 0 and 100.")
    const payload = {
      match_type: draft.match_type,
      pattern: draft.pattern.trim(),
      category_key: draft.category_key,
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

  const result = draft ? testRule(draft.match_type, draft.pattern, sample) : "empty"

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl shadow-sm px-5 py-4">
        <div>
          <p className="text-lg font-semibold text-slate-900">Classification rules</p>
          <p className="text-base text-slate-500 mt-1 max-w-3xl leading-relaxed">
            Each rule matches an email's subject and picks its category. Rules are tried in order and the first match wins.
            At 80% confidence or more an email is handled automatically; below that it goes to Needs Review.
            Changes apply to new emails only — emails already stored keep the classification they have.
          </p>
        </div>
        <Button size="sm" onClick={openNew} disabled={readOnly} className={cn(PRIMARY_PILL_BUTTON_CLASS, "shrink-0")}>
          <Plus className="w-5 h-5" /> Add rule
        </Button>
      </div>

      {readOnly && (
        <div className="shrink-0 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900">
          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-amber-600" />
          <span>
            The rules table doesn't exist yet, so these are the built-in rules (read-only). Apply the migration
            <span className="font-mono"> 20260924000000_email_classification_rules.sql </span>
            to make them editable — classification keeps working with the built-in list until then.
          </span>
        </div>
      )}

      <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
          <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-base">
            <thead className="sticky top-0 z-30 bg-white shadow-xs">
              <tr>
                <SortTh tone="blue" id="#" sort={sort} onSort={toggle} className="w-16 text-center">#</SortTh>
                <SortTh tone="blue" id="order" sort={sort} onSort={toggle} className="w-24 text-left">Order</SortTh>
                <SortTh tone="blue" id="match" sort={sort} onSort={toggle} className="w-32 text-left">Match</SortTh>
                <SortTh tone="blue" id="pattern" sort={sort} onSort={toggle} className="min-w-[320px] text-left">Subject pattern</SortTh>
                <SortTh tone="blue" id="category" sort={sort} onSort={toggle} className="min-w-[240px] text-left">Category</SortTh>
                <SortTh tone="blue" id="confidence" sort={sort} onSort={toggle} className="w-36 text-left">Confidence</SortTh>
                <SortTh tone="blue" id="active" sort={sort} onSort={toggle} className="w-28 text-left">Active</SortTh>
                <SortTh tone="blue" id="actions" sort={sort} onSort={toggle} className="w-32 border-r-0 text-left">Actions</SortTh>
              </tr>
            </thead>
            <tbody>
              {loading && <SkeletonRows cols={8} />}
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
                    <td className={cn(TD_CLASS, "font-mono text-sm text-slate-800 break-all")}>
                      {r.pattern}
                      {r.notes && <div className="font-sans text-sm text-slate-400 mt-0.5">{r.notes}</div>}
                    </td>
                    <td className={TD_CLASS}>
                      {cat ? (
                        <span
                          className="text-sm font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap"
                          style={{ background: `${cat.color ?? "#6b7280"}14`, color: cat.color ?? "#6b7280", borderColor: `${cat.color ?? "#6b7280"}33` }}
                        >
                          {cat.name}
                        </span>
                      ) : <span className="text-red-500">{r.category_key}</span>}
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
                <tr><td colSpan={8} className="py-16 text-center text-slate-400 text-base">No rules match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / edit */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && !saving && setDraft(null)}>
        <DialogContent className="max-w-2xl w-[96vw] max-h-[92vh] p-0 gap-0 border border-slate-200 shadow-xl rounded-2xl overflow-hidden bg-white flex flex-col">
          <div className="border-b border-slate-200 pl-6 pr-14 py-4 shrink-0">
            <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900">{draft?.id ? "Edit rule" : "Add rule"}</DialogTitle>
            <DialogDescription className="text-base text-slate-500 mt-0.5">Choose what to look for in the subject and which category it means.</DialogDescription>
          </div>

          {draft && (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-5 space-y-5">
              <div className="grid sm:grid-cols-[11rem_1fr] gap-x-5 gap-y-5">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-600">Match type</Label>
                  <SearchSelect
                    className="w-full"
                    value={draft.match_type}
                    onChange={(v) => setDraft({ ...draft, match_type: v as Draft["match_type"] })}
                    options={[{ value: "contains", label: "Contains text" }, { value: "regex", label: "Regular expression" }]}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-600">{draft.match_type === "regex" ? "Regular expression" : "Subject contains"}</Label>
                  <Input
                    className={cn("h-10 text-base rounded-md border-slate-200 font-mono", result === "invalid" && "border-red-300")}
                    value={draft.pattern}
                    onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
                    placeholder={draft.match_type === "regex" ? "e.g. pre-?assess(ment)?" : "e.g. Notice of Intention to Verify"}
                  />
                  <p className="text-sm text-slate-400">Not case-sensitive. {draft.match_type === "contains" ? "Matches anywhere in the subject." : "Uses JavaScript regular-expression syntax."}</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                <Label className="text-sm font-medium text-slate-600">Try it — paste a real subject</Label>
                <Input className="h-10 text-base rounded-md border-slate-200 bg-white" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="e.g. Re: Pre-Assessment Notice – ABC Ltd" />
                <p className={cn(
                  "text-base flex items-center gap-1.5 min-h-6",
                  result === "match" && "text-emerald-700", result === "no" && "text-slate-500", result === "invalid" && "text-red-600"
                )}>
                  {result === "match" && (<><CheckCircle2 className="h-5 w-5" /> This subject would match.</>)}
                  {result === "no" && (<><XCircle className="h-5 w-5" /> This subject would not match.</>)}
                  {result === "invalid" && (<><XCircle className="h-5 w-5" /> That isn't a valid regular expression.</>)}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">Category</Label>
                <SearchSelect
                  className="w-full"
                  value={draft.category_key}
                  onChange={(v) => setDraft({ ...draft, category_key: v })}
                  placeholder="Choose a category…"
                  options={categories.map((c) => ({ value: c.key, label: c.name }))}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-x-5 gap-y-5">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-600">Confidence (%)</Label>
                  <Input type="number" min={0} max={100} className="h-10 text-base rounded-md border-slate-200" value={draft.confidence} onChange={(e) => setDraft({ ...draft, confidence: e.target.value })} />
                  <p className="text-sm text-slate-400">80 or more is handled automatically; less goes to Needs Review.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-600">Order</Label>
                  <Input type="number" className="h-10 text-base rounded-md border-slate-200" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} />
                  <p className="text-sm text-slate-400">Lower numbers are tried first; the first match wins.</p>
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
            </div>
          )}

          <div className="border-t border-slate-200 bg-white px-6 py-3.5 shrink-0 flex items-center justify-end gap-2.5">
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
              Emails with a subject matching <span className="font-mono font-medium">{deleting?.pattern}</span> will no longer be classified automatically
              by it. Emails already stored keep their classification. You can switch a rule off instead if you might want it back.
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
