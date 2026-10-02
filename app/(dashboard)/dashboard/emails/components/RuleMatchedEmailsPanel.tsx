"use client"

import { useEffect, useMemo, useState } from "react"
import { Inbox, ListFilter, Loader2, Search, Sparkles, Trash2, UserRound, X } from "lucide-react"
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
import { EmailsTable } from "./NeedsReview"
import type { CategoryOption, Disposition, EmailRow, RuleRow } from "./shared"

// A sidebar grouped by which rule matched, for a tab that isn't Ignored — Notifications (grouped by
// notify rule) and Update (grouped by classify rule). Same shell as IgnoredPanel (search, per-rule
// counts, row selection, bulk delete), minus the ignore-specific bits (no "Automated senders" bucket,
// no hard_ignore icon) that don't apply here.

type GroupKey = "all" | "other" | `rule:${string}`

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
  icon, label, sub, count, active, onClick, title, muted,
}: {
  icon: React.ReactNode
  label: string
  sub?: string
  count: number
  active: boolean
  onClick: () => void
  title?: string
  muted?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex items-center w-full px-3 py-2 text-base rounded-md transition-colors text-left font-medium",
        active ? "bg-custom-blue text-white shadow-xs" : "text-slate-700 hover:bg-slate-200/60",
        muted && !active && "opacity-60"
      )}
    >
      <span className={cn("mr-2 shrink-0", active ? "text-white" : "text-slate-400")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {sub && <span className={cn("block truncate text-sm font-normal", active ? "text-white/80" : "text-slate-500")}>{sub}</span>}
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
    </button>
  )
}

export function RuleMatchedEmailsPanel({
  emails,
  rules,
  categories,
  onOpen,
  onQuickClassify,
  onDelete,
  showTime,
  loading,
  sidebarTitle,
  otherLabel,
  otherHint,
  emptyMessage,
  notificationsMode = false,
  onMarkHandled,
  onReclassify,
  reclassifying,
  showStats,
  visibleColumns,
}: {
  // Every email for this tab that passed the page's search/company filters.
  emails: EmailRow[]
  // The rule subset relevant to this tab (notify rules for Notifications, classify rules for Update) —
  // only these appear in the sidebar, so an email matched by an ignore rule elsewhere never shows here.
  rules: RuleRow[]
  categories: CategoryOption[]
  onOpen: (e: EmailRow) => void
  onQuickClassify: (e: EmailRow, d: Disposition) => void
  // Deletes emails from the app; resolves once done.
  onDelete: (emails: EmailRow[]) => Promise<void>
  showTime: boolean
  loading: boolean
  sidebarTitle: string
  otherLabel: string
  otherHint: string
  emptyMessage: string
  notificationsMode?: boolean
  onMarkHandled?: (e: EmailRow) => void
  // Present only for the Update tab: re-runs the current rules against this tab's own mail (so a rule
  // correction can be re-applied to mail it already classified, not just to Needs Review). Absent for
  // Notifications — those don't offer this.
  onReclassify?: () => void
  reclassifying?: boolean
  // Both owned by the page's shared toolbar (Stats / Columns buttons).
  showStats: boolean
  visibleColumns: Record<string, boolean>
}) {
  const [group, setGroup] = useState<GroupKey>("all")
  const [sidebarSearch, setSidebarSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<EmailRow[] | null>(null)

  const ruleIds = useMemo(() => new Set(rules.map((r) => r.id)), [rules])
  const kindOf = (e: EmailRow): "rule" | "other" => (e.matched_rule_id && ruleIds.has(e.matched_rule_id) ? "rule" : "other")

  const inGroup = (e: EmailRow, g: GroupKey): boolean => {
    if (g === "all") return true
    const kind = kindOf(e)
    if (g === "other") return kind === "other"
    return kind === "rule" && e.matched_rule_id === g.slice(5)
  }

  const { ruleCounts, otherCount } = useMemo(() => {
    const ruleCounts = new Map<string, number>()
    let otherCount = 0
    for (const e of emails) {
      const kind = kindOf(e)
      if (kind === "rule") ruleCounts.set(e.matched_rule_id!, (ruleCounts.get(e.matched_rule_id!) ?? 0) + 1)
      else otherCount++
    }
    return { ruleCounts, otherCount }
    // kindOf only reads ruleIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails, ruleIds])

  const visible = useMemo(
    () => (group === "all" ? emails : emails.filter((e) => inGroup(e, group))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [emails, group, ruleIds]
  )

  const sq = sidebarSearch.trim().toLowerCase()
  const shownRules = useMemo(
    () => rules.filter((r) => { const d = describeRule(r); return !sq || `${d.sender} ${d.subjects}`.toLowerCase().includes(sq) }),
    [rules, sq]
  )

  useEffect(() => {
    if (group.startsWith("rule:") && !ruleIds.has(group.slice(5))) setGroup("all")
  }, [group, ruleIds])

  useEffect(() => setSelected(new Set()), [group])

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
    group === "all" ? "All"
      : group === "other" ? otherLabel
      : (() => {
          const r = rules.find((x) => x.id === group.slice(5))
          if (!r) return "Rule"
          const d = describeRule(r)
          return `${d.sender} — ${d.subjects}`
        })()

  const sidebar = useCollapsiblePanel()

  return (
    <div className="flex-1 min-h-0 flex rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {sidebar.collapsed && <CollapsedRail onExpand={sidebar.expand} label="Rules" />}
      <ResizablePanelGroup direction="horizontal" autoSaveId="email-center-rule-matched-layout" className="flex-1 min-h-0 h-full min-w-0">
        <ResizablePanel id="rule-matched-rules" order={1} defaultSize={26} minSize={18} maxSize={42} {...sidebar.panelProps} className="flex flex-col overflow-hidden bg-slate-50/40 border-r border-slate-200/80">
          <div className="flex flex-col h-full bg-slate-50/40">
            <div className="p-3 border-b border-slate-200/80 shrink-0 bg-white space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <ListFilter className="w-5 h-5 text-custom-blue" />
                  {sidebarTitle}
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
                <Row icon={<Inbox className="w-5 h-5" />} label="All" count={emails.length} active={group === "all"} onClick={() => setGroup("all")} />

                <SectionLabel>Rules</SectionLabel>
                {shownRules.map((rule) => {
                  const key: GroupKey = `rule:${rule.id}`
                  const d = describeRule(rule)
                  return (
                    <Row
                      key={rule.id}
                      icon={<ListFilter className="w-5 h-5" />}
                      label={d.sender}
                      sub={d.subjects}
                      count={ruleCounts.get(rule.id) ?? 0}
                      active={group === key}
                      onClick={() => setGroup(key)}
                      title={d.title}
                      muted={!rule.is_active || !ruleCounts.get(rule.id)}
                    />
                  )
                })}
                {shownRules.length === 0 && (
                  <p className="px-3 py-2 text-sm text-slate-400 leading-snug">
                    {rules.length === 0 ? "No rules of this kind yet — create one on the Rules tab." : "No rules match this search."}
                  </p>
                )}

                {!sq && (
                  <>
                    <SectionLabel>Other</SectionLabel>
                    <Row
                      icon={<UserRound className="w-5 h-5" />}
                      label={otherLabel}
                      count={otherCount}
                      active={group === "other"}
                      onClick={() => setGroup("other")}
                      title={otherHint}
                    />
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-slate-200/80 hover:bg-custom-blue/40 transition-colors" />

        <ResizablePanel id="rule-matched-mail" order={2} defaultSize={74} minSize={40} className="flex flex-col overflow-hidden bg-white">
          <div className="shrink-0 flex items-center gap-2 flex-wrap min-h-14 px-4 py-2 border-b border-slate-200/80">
            <p className="text-base font-semibold text-slate-800 truncate max-w-[36rem]" title={heading}>{heading}</p>
            <span className="text-base text-slate-500">{visible.length} email{visible.length === 1 ? "" : "s"}</span>

            {onReclassify && (
              <Button
                size="sm"
                variant="outline"
                disabled={reclassifying}
                onClick={onReclassify}
                className="h-9 px-3 gap-1.5 rounded-md border-slate-200 text-base font-medium"
                title="Re-run the current rules against every Update-only mail — useful after correcting a rule"
              >
                {reclassifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Reclassify
              </Button>
            )}

            {selected.size > 0 && (
              <div className="ml-auto flex items-center gap-2 flex-wrap rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5">
                <span className="text-base font-semibold text-blue-800">{selected.size} selected</span>
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
            onQuickClassify={onQuickClassify}
            showTime={showTime}
            loading={loading}
            embedded
            emptyMessage={group.startsWith("rule:") ? "This rule hasn't matched any mail yet." : emptyMessage}
            selection={{ selected, onToggle: toggle, onToggleAll: toggleAll }}
            notificationsMode={notificationsMode}
            onMarkHandled={onMarkHandled}
            showStats={showStats}
            visibleColumns={visibleColumns}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && !busy && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirmDelete?.length ?? 0} email{confirmDelete?.length === 1 ? "" : "s"}?
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
