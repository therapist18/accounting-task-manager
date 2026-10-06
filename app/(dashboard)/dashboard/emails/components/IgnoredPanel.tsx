"use client"

import { useEffect, useMemo, useState } from "react"
import { Bot, Inbox, ListFilter, Loader2, Search, Trash2, UserRound, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle, useCollapsiblePanel, PanelCollapseButton, CollapsedRail } from "@/components/ui/resizable"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { isAutomatedSender } from "@/lib/email-center/rules"
import { EmailsTable } from "./NeedsReview"
import { RuleInfoButton, ruleCategory } from "./RuleInfo"
import { DISPOSITION_LABEL, type CategoryOption, type Disposition, type EmailRow, type RuleRow } from "./shared"

// The Ignored tab: a searchable sidebar on the left (the ignore rules, then the automated senders, then
// mail Ignored Manually) and the mail for whichever entry is open on the right — the same shell as the
// "By company" sidebar. Selecting rows enables bulk actions: move to another tab, or delete from the app
// (the mail itself stays in Gmail).

type GroupKey = "all" | "automated" | "other" | `rule:${string}` | `sender:${string}`

const BULK_MOVE_TARGETS: Disposition[] = ["action_required", "update_only", "needs_review"]

function describeRule(rule: RuleRow) {
  const wordings = [rule.pattern, ...(rule.extra_patterns ?? [])].map((w) => w.trim()).filter(Boolean)
  const senders = [rule.sender_pattern, ...(rule.extra_sender_patterns ?? [])].map((w) => (w ?? "").trim()).filter(Boolean)
  return {
    sender: senders.length ? senders.join(" · ") : "Any sender",
    subjects: wordings.length ? wordings.join(" · ") : "Any subject",
    title: `${senders.length ? `From: ${senders.join("\n      ")}\n` : ""}${wordings.length ? `Subject: ${wordings.join("\n         ")}` : "Any subject"}`,
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</p>
}

function Row({
  icon, label, sub, meta, info, count, active, onClick, title, muted,
}: {
  icon: React.ReactNode
  label: string
  sub?: string
  // A third, smaller line — the category this rule's mail shows in the table.
  meta?: string
  // The rule's info icon (opens its details); sits inside the row, so the row can't be a <button>.
  info?: React.ReactNode
  count: number
  active: boolean
  onClick: () => void
  title?: string
  muted?: boolean
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onClick() } }}
      title={title}
      className={cn(
        "flex items-center w-full px-3 py-2 text-base rounded-md transition-colors text-left font-medium cursor-pointer",
        active ? "bg-custom-blue text-white shadow-xs" : "text-slate-700 hover:bg-slate-200/60",
        muted && !active && "opacity-60"
      )}
    >
      <span className={cn("mr-2 shrink-0", active ? "text-white" : "text-slate-400")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {sub && <span className={cn("block truncate text-sm font-normal", active ? "text-white/80" : "text-slate-500")}>{sub}</span>}
        {meta && <span className={cn("block truncate text-xs font-semibold", active ? "text-white/90" : "text-custom-blue")}>{meta}</span>}
      </span>
      {count > 0 && (
        <Badge
          variant="outline"
          className={cn(
            "text-sm font-semibold rounded-full px-2 py-0.5 ml-1 tabular-nums border shrink-0",
            active ? "bg-white/20 text-white border-white/30" : "bg-slate-100 text-slate-600 border-slate-200"
          )}
        >
          {count}
        </Badge>
      )}
      {info}
    </div>
  )
}

export function IgnoredPanel({
  emails,
  rules,
  categories,
  companyNames,
  onOpen,
  onMove,
  onDelete,
  showTime,
  loading,
}: {
  // Every ignored email that passed the page's search and company filters.
  emails: EmailRow[]
  rules: RuleRow[]
  categories: CategoryOption[]
  companyNames?: Record<string, string>
  onOpen: (e: EmailRow) => void
  // Moves emails to another tab; resolves once done. Called with one email for a row's dropdown.
  onMove: (emails: EmailRow[], disposition: Disposition) => Promise<void>
  // Deletes ignored emails from the app; resolves once done.
  onDelete: (emails: EmailRow[]) => Promise<void>
  showTime: boolean
  loading: boolean
}) {
  const [group, setGroup] = useState<GroupKey>("all")
  const [sidebarSearch, setSidebarSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<EmailRow[] | null>(null)

  const ignoreRules = useMemo(() => rules.filter((r) => r.is_ignore), [rules])
  const ruleIds = useMemo(() => new Set(ignoreRules.map((r) => r.id)), [ignoreRules])

  // Which kind of ignored mail an email is. A rule id that no longer exists (rule deleted) falls back
  // to the same bucket as mail Ignored Manually.
  const kindOf = (e: EmailRow): "rule" | "automated" | "other" =>
    e.matched_rule_id && ruleIds.has(e.matched_rule_id) ? "rule" : isAutomatedSender(e.sender_email) ? "automated" : "other"

  const inGroup = (e: EmailRow, g: GroupKey): boolean => {
    if (g === "all") return true
    const kind = kindOf(e)
    if (g === "automated") return kind === "automated"
    if (g === "other") return kind === "other"
    if (g.startsWith("rule:")) return kind === "rule" && e.matched_rule_id === g.slice(5)
    return kind === "automated" && e.sender_email.toLowerCase() === g.slice(7)
  }

  // Counts per rule, per automated sender address, and for the two catch-all buckets.
  const { ruleCounts, senders, automatedCount, otherCount } = useMemo(() => {
    const ruleCounts = new Map<string, number>()
    const senderCounts = new Map<string, number>()
    let automatedCount = 0
    let otherCount = 0
    for (const e of emails) {
      const kind = kindOf(e)
      if (kind === "rule") ruleCounts.set(e.matched_rule_id!, (ruleCounts.get(e.matched_rule_id!) ?? 0) + 1)
      else if (kind === "automated") {
        automatedCount++
        const s = e.sender_email.toLowerCase()
        senderCounts.set(s, (senderCounts.get(s) ?? 0) + 1)
      } else otherCount++
    }
    const senders = [...senderCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    return { ruleCounts, senders, automatedCount, otherCount }
    // kindOf only reads ruleIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails, ruleIds])

  const visible = useMemo(
    () => (group === "all" ? emails : emails.filter((e) => inGroup(e, group))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [emails, group, ruleIds]
  )

  // The sidebar search narrows the rule and sender entries by what the person is looking for.
  const sq = sidebarSearch.trim().toLowerCase()
  const shownRules = useMemo(
    () => ignoreRules.filter((r) => { const d = describeRule(r); return !sq || `${d.sender} ${d.subjects}`.toLowerCase().includes(sq) }),
    [ignoreRules, sq]
  )
  const shownSenders = useMemo(() => senders.filter(([s]) => !sq || s.includes(sq)), [senders, sq])

  // If the open entry stops existing (rule deleted, or its last mail moved away), fall back to All.
  useEffect(() => {
    if (group.startsWith("rule:") && !ruleIds.has(group.slice(5))) setGroup("all")
    else if (group.startsWith("sender:") && !senders.some(([s]) => s === group.slice(7))) setGroup("all")
  }, [group, ruleIds, senders])

  // A selection belongs to the entry it was made in - deleting mail you can't see would be a trap.
  useEffect(() => setSelected(new Set()), [group])

  // Emails move or vanish after an action; drop selections that are no longer in the list.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const live = new Set(emails.map((e) => e.id))
      const next = new Set([...prev].filter((id) => live.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [emails])

  const selectedEmails = useMemo(() => emails.filter((e) => selected.has(e.id)), [emails, selected])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  const moveSelected = async (d: Disposition) => {
    const targets = selectedEmails.filter((e) => e.disposition !== d)
    if (!targets.length) return
    setBusy(true)
    try {
      await onMove(targets, d)
      setSelected(new Set())
    } finally {
      setBusy(false)
    }
  }

  const runDelete = async () => {
    if (!confirmDelete) return
    setBusy(true)
    try {
      await onDelete(confirmDelete)
      setSelected(new Set())
    } finally {
      setBusy(false)
      setConfirmDelete(null)
    }
  }

  const heading =
    group === "all" ? "All ignored"
      : group === "automated" ? "Automated senders"
      : group === "other" ? "Ignored Manually / other"
      : group.startsWith("sender:") ? group.slice(7)
      : (() => {
          const r = ignoreRules.find((x) => x.id === group.slice(5))
          if (!r) return "Rule"
          const d = describeRule(r)
          return `${d.sender} — ${d.subjects}`
        })()

  const sidebar = useCollapsiblePanel()

  return (
    <div className="flex-1 min-h-0 flex rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {sidebar.collapsed && <CollapsedRail onExpand={sidebar.expand} label="Ignore rules" />}
      <ResizablePanelGroup direction="horizontal" autoSaveId="email-center-ignored-layout" className="flex-1 min-h-0 h-full min-w-0">
        <ResizablePanel id="ignore-rules" order={1} defaultSize={26} minSize={18} maxSize={42} {...sidebar.panelProps} className="flex flex-col overflow-hidden bg-slate-50/40 border-r border-slate-200/80">
          <div className="flex flex-col h-full bg-slate-50/40">
            <div className="p-3 border-b border-slate-200/80 shrink-0 bg-white space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <ListFilter className="w-5 h-5 text-custom-blue" />
                  Ignore rules
                </h2>
                <PanelCollapseButton onClick={sidebar.collapse} />
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input
                  placeholder="Search rule, subject, sender…"
                  className="pl-10 h-10 text-base bg-slate-50 border-slate-200 rounded-md focus:bg-white focus-visible:ring-1 focus-visible:ring-custom-blue"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                />
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-2 space-y-0.5">
                <Row icon={<Inbox className="w-5 h-5" />} label="All ignored" count={emails.length} active={group === "all"} onClick={() => setGroup("all")} />

                <SectionLabel>Rules</SectionLabel>
                {shownRules.map((rule) => {
                  const key: GroupKey = `rule:${rule.id}`
                  const d = describeRule(rule)
                  return (
                    <Row
                      key={rule.id}
                      // A hard-ignore rule never stores anything (nothing to click into), so it gets a
                      // distinct icon rather than reading as a broken/unused rule sitting at 0.
                      icon={rule.hard_ignore ? <Trash2 className="w-5 h-5" /> : <ListFilter className="w-5 h-5" />}
                      label={d.sender}
                      sub={rule.hard_ignore ? `${d.subjects} · deleted, not stored` : d.subjects}
                      meta={rule.hard_ignore ? undefined : ruleCategory(rule, categories)}
                      info={<RuleInfoButton rule={rule} categories={categories} companyNames={companyNames} active={group === key} />}
                      count={ruleCounts.get(rule.id) ?? 0}
                      active={group === key}
                      onClick={() => setGroup(key)}
                      title={rule.hard_ignore ? `${d.title}\n\n(Ignore and delete — matching mail is dropped entirely, never shown here)` : d.title}
                      muted={!rule.is_active || (!rule.hard_ignore && !ruleCounts.get(rule.id))}
                    />
                  )
                })}
                {shownRules.length === 0 && (
                  <p className="px-3 py-2 text-sm text-slate-400 leading-snug">
                    {ignoreRules.length === 0 ? "No ignore rules yet — create one on the Rules tab." : "No rules match this search."}
                  </p>
                )}

                {(shownSenders.length > 0 || !sq) && (
                  <>
                    <SectionLabel>Automated senders</SectionLabel>
                    {!sq && (
                      <Row
                        icon={<Bot className="w-5 h-5" />}
                        label="All automated"
                        count={automatedCount}
                        active={group === "automated"}
                        onClick={() => setGroup("automated")}
                        title="Mail from no-reply@ / alerts@ addresses, ignored automatically"
                      />
                    )}
                    {shownSenders.map(([sender, n]) => (
                      <Row
                        key={sender}
                        icon={<Bot className="w-5 h-5" />}
                        label={sender}
                        count={n}
                        active={group === `sender:${sender}`}
                        onClick={() => setGroup(`sender:${sender}`)}
                        title={sender}
                      />
                    ))}
                    {!sq && senders.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">No automated mail ignored.</p>}
                  </>
                )}

                {!sq && (
                  <>
                    <SectionLabel>Other</SectionLabel>
                    <Row
                      icon={<UserRound className="w-5 h-5" />}
                      label="Ignored Manually"
                      count={otherCount}
                      active={group === "other"}
                      onClick={() => setGroup("other")}
                      title="Ignored Manually, or by a rule that has since been deleted"
                    />
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-slate-200/80 hover:bg-custom-blue/40 transition-colors" />

        <ResizablePanel id="ignored-mail" order={2} defaultSize={74} minSize={40} className="flex flex-col overflow-hidden bg-white">
          <div className="shrink-0 flex items-center gap-2 flex-wrap min-h-14 px-4 py-2 border-b border-slate-200/80">
            <p className="text-base font-semibold text-slate-800 truncate max-w-[36rem]" title={heading}>{heading}</p>
            <span className="text-base text-slate-500">{visible.length} email{visible.length === 1 ? "" : "s"}</span>

            {selected.size > 0 && (
              <div className="ml-auto flex items-center gap-2 flex-wrap rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5">
                <span className="text-base font-semibold text-blue-800">{selected.size} selected</span>
                <select
                  value=""
                  disabled={busy}
                  onChange={(ev) => { if (ev.target.value) moveSelected(ev.target.value as Disposition) }}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-base font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-custom-blue"
                  title="Move the selected emails to another tab"
                >
                  <option value="">Move to…</option>
                  {BULK_MOVE_TARGETS.map((d) => (
                    <option key={d} value={d}>{DISPOSITION_LABEL[d]}</option>
                  ))}
                </select>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmDelete(selectedEmails)} className="h-9 px-3 gap-1.5 rounded-md border-red-200 text-red-700 hover:bg-red-50 text-base font-medium">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setSelected(new Set())} className="h-9 px-2 text-slate-600" title="Clear selection">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          <EmailsTable
            emails={visible}
            categories={categories}
            onOpen={onOpen}
            onQuickClassify={(e, d) => onMove([e], d)}
            showTime={showTime}
            loading={loading}
            embedded
            emptyMessage={
              group.startsWith("rule:") && ignoreRules.find((x) => x.id === group.slice(5))?.hard_ignore
                ? "This rule deletes matches entirely — there's never anything to show here."
                : group.startsWith("rule:")
                  ? "This rule hasn't ignored any mail yet."
                  : "No ignored emails."
            }
            selection={{ selected, onToggle: toggle, onToggleAll: toggleAll }}
            onAllocate={(e, d) => { if (e.disposition !== d) onMove([e], d) }}
            ignoreRules={ignoreRules}
            rules={rules}
            allocateTargets={BULK_MOVE_TARGETS}
            onDeleteRow={(e) => setConfirmDelete([e])}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && !busy && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirmDelete?.length ?? 0} ignored email{confirmDelete?.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They are removed from the app but stay in Gmail. If a rule still matches them, they can come back the next time that mailbox is synced from a date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); runDelete() }} disabled={busy} className="bg-red-600 hover:bg-red-700">
              {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
