"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Briefcase, Copy, FileImage, FileSpreadsheet, FileText, Lightbulb, Loader2, Mail, Paperclip } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  DISPOSITION_BADGE, DISPOSITION_LABEL, SearchSelect, api, avatarTone, fmtDateTime, initials, senderName,
  type AttachmentRow, type CaseRow, type CategoryOption, type Disposition, type EmailRow, type RuleRow,
} from "./shared"

// Message bodies live in Gmail, not the database, so the body is the one thing this dialog ever fetches
// (and only once per email — cached for the page's lifetime). Everything else comes from the row the
// caller already has: the emails table, or a case's thread history.
const bodyCache = new Map<string, string>()

const cleanSubject = (subject: string) => subject.replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "").trim()

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied.`)
  } catch {
    toast.error("Could not copy to the clipboard.")
  }
}

function fileSize(bytes: number | null): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function AttachmentIcon({ name }: { name: string }) {
  if (/\.(xlsx?|csv)$/i.test(name)) return <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
  if (/\.(png|jpe?g|gif|webp)$/i.test(name)) return <FileImage className="h-6 w-6 text-violet-600" />
  return <FileText className="h-6 w-6 text-red-500" />
}

export function EmailDialog({
  email,
  categories,
  onClose,
  // Merges straight into whichever local copy of this email the page is holding; no refetch of any
  // list is ever needed for a classification change.
  onEmailChanged,
  // Only called when this reclassification opened a brand-new case — the PATCH route hands back the
  // full row it just built, so the page can add it to its case list with no follow-up fetch.
  onCaseOpened,
  onOpenCase,
  onRuleCreated,
  rules = [],
  onRuleUpdated,
}: {
  email: EmailRow | null
  categories: CategoryOption[]
  onClose: () => void
  onEmailChanged: (id: string, patch: Partial<EmailRow>) => void
  onCaseOpened: (c: CaseRow) => void
  onOpenCase: (caseId: string) => void
  onRuleCreated?: (rule: RuleRow) => void
  // Existing rules, so "Remember this" can add this subject as another wording of one instead of always
  // creating a new rule; onRuleUpdated gets the saved rule and the wording that was added.
  rules?: RuleRow[]
  onRuleUpdated?: (rule: RuleRow, addedWording: string) => void
}) {
  // Keep the last email around so the content doesn't blank out during the dialog's close animation.
  const lastRef = useRef<EmailRow | null>(null)
  if (email) lastRef.current = email
  const shown = email ?? lastRef.current
  const emailId = email?.id ?? null

  const [body, setBody] = useState<string | null>(null)
  const [bodyLoading, setBodyLoading] = useState(false)
  const [disposition, setDisposition] = useState<Disposition | "">("")
  const [categoryKey, setCategoryKey] = useState("")
  const [makeRule, setMakeRule] = useState(false)
  const [rulePattern, setRulePattern] = useState("")
  // "" = create a new rule; otherwise the id of an existing rule to add this wording to.
  const [addToRuleId, setAddToRuleId] = useState("")
  const [saving, setSaving] = useState(false)

  // Read through refs so the effect runs once per opened email, not on every local merge of the row.
  const emailRef = useRef(email)
  emailRef.current = email
  const changedRef = useRef(onEmailChanged)
  changedRef.current = onEmailChanged

  useEffect(() => {
    const row = emailRef.current
    if (!emailId || !row) return
    let alive = true

    setDisposition(row.disposition ?? "")
    setCategoryKey(row.category_key ?? "")
    setMakeRule(false)
    setAddToRuleId("")
    setRulePattern(cleanSubject(row.subject ?? ""))

    if (!row.is_read) {
      api(`/api/email-center/emails/${emailId}`, { method: "PATCH", body: JSON.stringify({ is_read: true }) })
        .then(() => changedRef.current(emailId, { is_read: true }))
        .catch(() => {})
    }

    const cached = bodyCache.get(emailId)
    if (cached !== undefined) {
      setBody(cached)
      setBodyLoading(false)
    } else {
      setBody(null)
      setBodyLoading(true)
      api<{ body: string }>(`/api/email-center/emails/${emailId}?bodyOnly=1`)
        .then((res) => {
          bodyCache.set(emailId, res.body)
          if (alive) setBody(res.body)
        })
        .catch((e) => { if (alive) toast.error(`Could not load the full message: ${e.message}`) })
        .finally(() => { if (alive) setBodyLoading(false) })
    }
    return () => { alive = false }
  }, [emailId])

  const save = async () => {
    if (!shown) return
    setSaving(true)
    try {
      const res = await api<{ case_id: string | null; email_patch: Partial<EmailRow>; case: CaseRow | null }>(
        `/api/email-center/emails/${shown.id}`,
        { method: "PATCH", body: JSON.stringify({ disposition: disposition || undefined, category_key: categoryKey || undefined }) }
      )
      toast.success("Classification saved.")
      onEmailChanged(shown.id, res.email_patch)
      if (res.case) onCaseOpened(res.case)

      if (makeRule && rulePattern.trim() && (disposition === "ignore" || categoryKey)) {
        const isIgnoreRule = disposition === "ignore"
        // An important-notification email (category "notification") is Remembered as a notify rule —
        // flagged urgent in Needs Review, never a task/case. A real category turns it back into a
        // classify rule.
        const isNotifyRule = !isIgnoreRule && categoryKey === "notification"
        const target = addToRuleId ? rules.find((r) => r.id === addToRuleId) : undefined
        try {
          if (target) {
            // Another way of wording a subject this rule already handles: widen it instead of adding a rule.
            const wording = rulePattern.trim()
            const known = [target.pattern, ...(target.extra_patterns ?? [])].some((w) => w.trim().toLowerCase() === wording.toLowerCase())
            if (known) {
              toast.info("That wording is already part of the rule.")
            } else {
              const updated = await api<{ rule: RuleRow }>(`/api/email-center/rules/${target.id}`, {
                method: "PATCH",
                body: JSON.stringify({ extra_patterns: [...(target.extra_patterns ?? []), wording] }),
              })
              onRuleUpdated?.(updated.rule, wording)
              toast.success("Wording added to the existing rule — future emails like this are handled by it.")
            }
          } else {
          const created = await api<{ rule: RuleRow }>("/api/email-center/rules", {
            method: "POST",
            body: JSON.stringify(
              isIgnoreRule
                ? { pattern: rulePattern.trim(), match_type: "contains", is_ignore: true, confidence: 0.9 }
                : isNotifyRule
                  ? { pattern: rulePattern.trim(), match_type: "contains", is_notify: true, confidence: 0.9 }
                  : { pattern: rulePattern.trim(), match_type: "contains", category_key: categoryKey, confidence: 0.9 }
            ),
          })
          onRuleCreated?.(created.rule)
          toast.success(
            isIgnoreRule
              ? "Rule added — future emails with this subject are ignored automatically."
              : isNotifyRule
                ? "Rule added — future emails like this are flagged urgent as important notifications."
                : "Rule added — future emails with this subject are classified automatically."
          )
          }
        } catch (e: any) {
          toast.warning(`Classification saved, but the rule wasn't added: ${e.message}`)
        }
      }

      if (res.case_id && !shown.case_id) onOpenCase(res.case_id)
      else onClose()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const cat = shown?.category_key ? categories.find((c) => c.key === shown.category_key) : null
  const attachments: AttachmentRow[] = shown?.attachments ?? []
  const name = shown ? senderName(shown) : ""
  const outbound = shown?.direction === "outbound"
  const hasChange = !!shown && (disposition !== (shown.disposition ?? "") || categoryKey !== (shown.category_key ?? ""))
  // "Treat as → Ignored" turns Remember this into an ignore rule: no category needed. An email whose
  // category is "notification" (an important notification) is Remembered as a notify rule instead.
  const useIgnoreRule = disposition === "ignore"
  const useNotifyRule = !useIgnoreRule && categoryKey === "notification"
  // Existing rules of the same kind this subject could be added to. Only plain-text ("contains") rules:
  // the subject is added as-is, and in a regex rule it would be read as a pattern.
  const candidateRules = rules.filter(
    (r) =>
      !r.id.startsWith("builtin-") &&
      r.match_type === "contains" &&
      (useIgnoreRule ? r.is_ignore : useNotifyRule ? r.is_notify : !r.is_ignore && !r.is_notify && r.category_key === categoryKey)
  )

  return (
    <Dialog open={!!email} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl w-[96vw] h-[90vh] p-0 gap-0 border border-slate-200 shadow-xl rounded-2xl overflow-hidden bg-white flex flex-col">
        <DialogDescription className="sr-only">Read the email and change how it is classified.</DialogDescription>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 pl-6 pr-14 h-14 shrink-0">
          <Mail className="h-5 w-5 text-custom-blue" />
          <span className="text-base font-semibold text-slate-700">{outbound ? "Sent to KRA" : "Inbox"}</span>
          {shown && !shown.is_read && <span className="h-2 w-2 rounded-full bg-custom-blue" title="Was unread" />}
          <div className="ml-auto flex items-center gap-2">
            {shown?.case_id && (
              <Button variant="outline" size="sm" onClick={() => onOpenCase(shown.case_id!)} className="h-10 gap-2 rounded-md border-slate-200 bg-white text-base font-medium">
                <Briefcase className="h-5 w-5" /> Open case
              </Button>
            )}
          </div>
        </div>

        {shown && (
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
            {/* Reading pane */}
            <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar px-8 py-6">
              <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900 leading-snug">
                {shown.subject || "(no subject)"}
              </DialogTitle>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {shown.disposition && (
                  <span className={cn("text-sm font-semibold px-2.5 py-0.5 rounded-full border", DISPOSITION_BADGE[shown.disposition])}>
                    {DISPOSITION_LABEL[shown.disposition]}
                  </span>
                )}
                {cat && (
                  <span
                    className="text-sm font-semibold px-2.5 py-0.5 rounded-full border"
                    style={{ background: `${cat.color ?? "#6b7280"}14`, color: cat.color ?? "#6b7280", borderColor: `${cat.color ?? "#6b7280"}33` }}
                  >
                    {cat.name}
                  </span>
                )}
                {shown.case_id && <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">In a case</span>}
                {(shown.priority === "urgent" || shown.priority === "high") && (
                  <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200 capitalize">{shown.priority}</span>
                )}
              </div>

              {/* Record ids — for looking a specific mail up in the database (e.g. confirming a
                  reclassify actually deleted it) rather than anything a user needs day to day. */}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1">
                  ID <span className="font-mono text-slate-500">{shown.id}</span>
                  <button type="button" onClick={() => copyToClipboard(shown.id, "Email ID")} className="p-0.5 rounded hover:bg-slate-100 hover:text-slate-700" title="Copy email ID">
                    <Copy className="h-3 w-3" />
                  </button>
                </span>
                <span className="inline-flex items-center gap-1">
                  Gmail ID <span className="font-mono text-slate-500">{shown.gmail_message_id}</span>
                  <button type="button" onClick={() => copyToClipboard(shown.gmail_message_id, "Gmail message ID")} className="p-0.5 rounded hover:bg-slate-100 hover:text-slate-700" title="Copy Gmail message ID">
                    <Copy className="h-3 w-3" />
                  </button>
                </span>
              </div>

              {/* Sender row */}
              <div className="mt-5 flex items-start gap-3 pb-5 border-b border-slate-200">
                <span className={cn("h-11 w-11 rounded-full text-white flex items-center justify-center text-base font-semibold shrink-0", avatarTone(shown.sender_email))}>
                  {initials(name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-lg font-semibold text-slate-900">{name}</span>
                    <span className="text-base text-slate-500 break-all">&lt;{shown.sender_email}&gt;</span>
                  </div>
                  <div className="mt-0.5 text-sm text-slate-500 space-y-0.5">
                    {shown.to_addresses && <p className="break-words"><span className="font-medium text-slate-600">to</span> {shown.to_addresses}</p>}
                    {shown.cc_addresses && <p className="break-words"><span className="font-medium text-slate-600">cc</span> {shown.cc_addresses}</p>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base text-slate-700 tabular-nums">{fmtDateTime(shown.received_at, true)}</p>
                  {shown.company_name && <p className="text-sm text-slate-500 mt-0.5">{shown.company_name}</p>}
                </div>
              </div>

              {shown.review_reason && (
                <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900">
                  <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-amber-600" />
                  <span><span className="font-semibold">Why this needs review: </span>{shown.review_reason}</span>
                </div>
              )}

              {shown.ai_summary && shown.ai_summary !== shown.snippet && (
                <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-3">
                  <p className="text-sm font-semibold text-custom-blue mb-1">Summary</p>
                  <p className="text-base text-slate-800 leading-relaxed">{shown.ai_summary}</p>
                </div>
              )}

              {/* Body */}
              <div className="mt-6">
                <div className={cn("text-base leading-relaxed whitespace-pre-wrap break-words", bodyLoading ? "text-slate-400" : "text-slate-800")}>
                  {body || shown.snippet || "No preview available."}
                </div>
                {bodyLoading && (
                  <div className="mt-3 space-y-2" aria-label="Loading the full message">
                    <div className="h-3.5 w-11/12 rounded bg-slate-200/80 animate-pulse" />
                    <div className="h-3.5 w-9/12 rounded bg-slate-200/80 animate-pulse" />
                    <div className="h-3.5 w-10/12 rounded bg-slate-200/80 animate-pulse" />
                  </div>
                )}
              </div>

              {/* Attachments */}
              {attachments.length > 0 && (
                <div className="mt-8 pt-5 border-t border-slate-200">
                  <p className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Paperclip className="h-4 w-4" /> {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {attachments.map((a) => {
                      const inner = (
                        <>
                          <span className="h-11 w-11 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0"><AttachmentIcon name={a.filename} /></span>
                          <span className="min-w-0">
                            <span className="block text-base font-medium text-slate-800 truncate" title={a.filename}>{a.filename}</span>
                            <span className="block text-sm text-slate-500">{a.downloadable ? fileSize(a.size_bytes) || "Download" : "Not stored"}</span>
                          </span>
                        </>
                      )
                      return a.downloadable ? (
                        <a
                          key={a.index}
                          href={`/api/email-center/emails/${shown.id}/attachments/${a.index}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-custom-blue/50 hover:bg-blue-50/40 transition-colors"
                        >
                          {inner}
                        </a>
                      ) : (
                        <div key={a.index} className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 opacity-70">{inner}</div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Classification side panel */}
            <aside className="lg:w-[22rem] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-50 overflow-y-auto custom-scrollbar p-5 space-y-6">
              <section className="space-y-3">
                <h3 className="text-base font-semibold text-slate-800">Classification</h3>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-600">Category</label>
                  <SearchSelect
                    className="w-full"
                    value={categoryKey}
                    onChange={setCategoryKey}
                    placeholder="—"
                    options={[{ value: "", label: "—" }, ...categories.map((c) => ({ value: c.key, label: c.name }))]}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-600">Treat as</label>
                  <SearchSelect
                    className="w-full"
                    value={disposition}
                    onChange={(v) => setDisposition(v as Disposition)}
                    placeholder="—"
                    options={[
                      { value: "", label: "—" },
                      ...(Object.keys(DISPOSITION_LABEL) as Disposition[]).map((d) => ({ value: d, label: DISPOSITION_LABEL[d] })),
                    ]}
                  />
                </div>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {shown.case_id
                    ? "This email is part of a KRA case."
                    : "Choosing “Action required” opens a KRA case for this email."}
                </p>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <Checkbox checked={makeRule} onCheckedChange={(v) => setMakeRule(v === true)} disabled={!categoryKey && !useIgnoreRule} className="mt-0.5" />
                  <span>
                    <span className="flex items-center gap-1.5 text-base font-medium text-slate-800"><Lightbulb className="h-4 w-4 text-amber-500" /> Remember this</span>
                    <span className="block text-sm text-slate-500 mt-0.5 leading-relaxed">
                      {useIgnoreRule
                        ? "Ignore future emails whose subject contains this text."
                        : useNotifyRule
                          ? "Flag future emails whose subject contains this text as important notifications — stored and urgent, no task or case."
                          : categoryKey
                            ? "Classify future emails whose subject contains this text as the chosen category."
                            : "Pick a category — or set Treat as to “Ignored” to ignore these instead."}
                    </span>
                  </span>
                </label>
                {makeRule && (categoryKey || useIgnoreRule) && candidateRules.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-600">Save as</label>
                    <SearchSelect
                      className="w-full"
                      value={addToRuleId}
                      onChange={setAddToRuleId}
                      options={[
                        { value: "", label: "A new rule" },
                        ...candidateRules.map((r) => ({
                          value: r.id,
                          label: `Add to: ${r.pattern || "any subject"}${r.extra_patterns?.length ? ` (+${r.extra_patterns.length} more)` : ""}`,
                        })),
                      ]}
                    />
                    <p className="text-sm text-slate-400">Adding it to an existing rule keeps every wording of one kind of notice together.</p>
                  </div>
                )}
                {makeRule && (categoryKey || useIgnoreRule) && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-600">{addToRuleId ? "Wording to add" : "Subject contains"}</label>
                    <Input value={rulePattern} onChange={(e) => setRulePattern(e.target.value)} className="h-10 text-base rounded-md border-slate-200" />
                    <p className="text-sm text-slate-400">Trim it to the part that identifies this kind of notice.</p>
                  </div>
                )}
              </section>

              <section className="space-y-2 text-sm">
                <h3 className="text-base font-semibold text-slate-800">Details</h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  <dt className="text-slate-500">Company</dt>
                  <dd className="text-slate-800 font-medium break-words">{shown.company_name ?? <span className="text-red-500">Unassigned</span>}</dd>
                  {shown.kra_pin && (<><dt className="text-slate-500">KRA PIN</dt><dd className="text-slate-800 font-mono">{shown.kra_pin}</dd></>)}
                  {(shown.classification_source || shown.disposition === "needs_review") && (
                    <>
                      <dt className="text-slate-500">Classified by</dt>
                      <dd className="text-slate-800 capitalize">
                        {shown.disposition === "needs_review"
                          ? "Needs review"
                          : `${shown.classification_source}${shown.category_confidence !== null ? ` · ${Math.round(shown.category_confidence * 100)}%` : ""}`}
                      </dd>
                    </>
                  )}
                  {shown.matched_rule_id && shown.classification_source !== "manual" && (() => {
                    // Which rule decided this email — the rule may have been deleted since.
                    const rule = rules?.find((r) => r.id === shown.matched_rule_id)
                    if (!rule) return (<><dt className="text-slate-500">Rule</dt><dd className="text-slate-400">A rule that has since been deleted</dd></>)
                    const subjects = [rule.pattern, ...(rule.extra_patterns ?? [])].map((w) => w.trim()).filter(Boolean)
                    const senders = [rule.sender_pattern, ...(rule.extra_sender_patterns ?? [])].map((w) => (w ?? "").trim()).filter(Boolean)
                    const kind = rule.is_ignore ? (rule.hard_ignore ? "Ignore and delete" : "Ignore") : rule.is_notify ? "Important notification" : "Classify"
                    return (
                      <>
                        <dt className="text-slate-500">Rule</dt>
                        <dd className="text-slate-800 break-words">
                          <span className="font-medium">{kind}{rule.is_active === false ? " (inactive)" : ""}</span>
                          <span className="block text-slate-600">From: {senders.length ? senders.join(" · ") : "any sender"}</span>
                          <span className="block text-slate-600">Subject: {subjects.length ? subjects.join(" · ") : "any subject"}</span>
                        </dd>
                      </>
                    )
                  })()}
                  {shown.classification_source === "manual" && (
                    <>
                      <dt className="text-slate-500">Reclassified by</dt>
                      <dd className="text-slate-800">
                        {shown.classified_by_name ?? "Staff"}{shown.classified_at && ` · ${fmtDateTime(shown.classified_at, true)}`}
                      </dd>
                    </>
                  )}
                </dl>
              </section>
            </aside>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-200 bg-white px-6 py-3.5 flex items-center gap-3 shrink-0">
          {hasChange && <span className="text-sm text-amber-700 font-medium">Unsaved classification change</span>}
          <div className="ml-auto flex items-center gap-2.5">
            <Button variant="ghost" size="sm" onClick={onClose} className="h-11 px-5 text-base font-medium text-slate-600 hover:text-slate-900 rounded-lg">Close</Button>
            <Button size="sm" onClick={save} disabled={saving || !shown} className="h-11 px-6 text-base font-semibold bg-custom-blue hover:bg-custom-blue/90 text-white rounded-lg shadow-xs gap-2">
              {saving && <Loader2 className="w-5 h-5 animate-spin" />} Save classification
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
