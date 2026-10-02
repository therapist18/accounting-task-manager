"use client"

import { useEffect, useMemo, useState } from "react"
import { Inbox, ListFilter, Loader2, Search, Trash2, UserRound, X } from "lucide-react"
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
import { CasesTable } from "./CasesTable"
import type { CaseRow, RuleRow } from "./shared"

// Same sidebar shell as IgnoredPanel / RuleMatchedEmailsPanel, for In Progress: grouped by which
// classify rule opened the case (created_by_rule_id), with row selection and bulk delete. Deleting a
// case here does NOT delete its emails — they go back to Needs Review (see the DELETE handler in
// app/api/email-center/cases/route.ts) since that correspondence is real, stored mail worth keeping
// even once the task wrapper around it is gone.

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

export function CasesRulePanel({
  cases,
  rules,
  onOpen,
  onDelete,
  showTime,
  loading,
  showStats,
  visibleColumns,
}: {
  // Every case for this tab that passed the page's search/company/assignee filters.
  cases: CaseRow[]
  // Classify rules that can open a case (creates_case categories) — only these appear in the sidebar.
  rules: RuleRow[]
  onOpen: (c: CaseRow) => void
  // Deletes cases; their emails go back to Needs Review rather than being deleted. Resolves once done.
  onDelete: (cases: CaseRow[]) => Promise<void>
  showTime: boolean
  loading: boolean
  showStats: boolean
  visibleColumns: Record<string, boolean>
}) {
  const [group, setGroup] = useState<GroupKey>("all")
  const [sidebarSearch, setSidebarSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<CaseRow[] | null>(null)

  const ruleIds = useMemo(() => new Set(rules.map((r) => r.id)), [rules])
  const kindOf = (c: CaseRow): "rule" | "other" =>
    c.created_by_rule_id && ruleIds.has(c.created_by_rule_id) ? "rule" : "other"

  const inGroup = (c: CaseRow, g: GroupKey): boolean => {
    if (g === "all") return true
    const kind = kindOf(c)
    if (g === "other") return kind === "other"
    return kind === "rule" && c.created_by_rule_id === g.slice(5)
  }

  const { ruleCounts, otherCount } = useMemo(() => {
    const ruleCounts = new Map<string, number>()
    let otherCount = 0
    for (const c of cases) {
      const kind = kindOf(c)
      if (kind === "rule") ruleCounts.set(c.created_by_rule_id!, (ruleCounts.get(c.created_by_rule_id!) ?? 0) + 1)
      else otherCount++
    }
    return { ruleCounts, otherCount }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases, ruleIds])

  const visible = useMemo(
    () => (group === "all" ? cases : cases.filter((c) => inGroup(c, group))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cases, group, ruleIds]
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
      const live = new Set(cases.map((c) => c.id))
      const next = new Set([...prev].filter((id) => live.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [cases])

  const selectedCases = useMemo(() => cases.filter((c) => selected.has(c.id)), [cases, selected])

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
      : group === "other" ? "Not opened by a rule (manual)"
      : (() => {
          const r = rules.find((x) => x.id === group.slice(5))
          if (!r) return "Rule"
          const d = describeRule(r)
          return `${d.sender} — ${d.subjects}`
        })()

  const sidebar = useCollapsiblePanel()

  return (
    <div className="flex-1 min-h-0 flex rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {sidebar.collapsed && <CollapsedRail onExpand={sidebar.expand} label="Opened by rule" />}
      <ResizablePanelGroup direction="horizontal" autoSaveId="email-center-cases-rule-layout" className="flex-1 min-h-0 h-full min-w-0">
        <ResizablePanel id="cases-rules" order={1} defaultSize={26} minSize={18} maxSize={42} {...sidebar.panelProps} className="flex flex-col overflow-hidden bg-slate-50/40 border-r border-slate-200/80">
          <div className="flex flex-col h-full bg-slate-50/40">
            <div className="p-3 border-b border-slate-200/80 shrink-0 bg-white space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <ListFilter className="w-5 h-5 text-custom-blue" />
                  Opened by rule
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
                <Row icon={<Inbox className="w-5 h-5" />} label="All" count={cases.length} active={group === "all"} onClick={() => setGroup("all")} />

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
                    {rules.length === 0 ? "No case-opening rules yet." : "No rules match this search."}
                  </p>
                )}

                {!sq && (
                  <>
                    <SectionLabel>Other</SectionLabel>
                    <Row
                      icon={<UserRound className="w-5 h-5" />}
                      label="Not opened by a rule"
                      count={otherCount}
                      active={group === "other"}
                      onClick={() => setGroup("other")}
                      title="Opened by hand, or by a rule that has since been deleted"
                    />
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-slate-200/80 hover:bg-custom-blue/40 transition-colors" />

        <ResizablePanel id="cases-rule-list" order={2} defaultSize={74} minSize={40} className="flex flex-col overflow-hidden bg-white">
          <div className="shrink-0 flex items-center gap-2 flex-wrap min-h-14 px-4 py-2 border-b border-slate-200/80">
            <p className="text-base font-semibold text-slate-800 truncate max-w-[36rem]" title={heading}>{heading}</p>
            <span className="text-base text-slate-500">{visible.length} case{visible.length === 1 ? "" : "s"}</span>

            {selected.size > 0 && (
              <div className="ml-auto flex items-center gap-2 flex-wrap rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5">
                <span className="text-base font-semibold text-blue-800">{selected.size} selected</span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmDelete(selectedCases)} className="h-9 px-3 gap-1.5 rounded-md border-red-200 text-red-700 hover:bg-red-50 text-base font-medium">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setSelected(new Set())} className="h-9 px-2 text-slate-600" title="Clear selection">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          <CasesTable
            cases={visible}
            onOpen={onOpen}
            onDelete={onDelete}
            showTime={showTime}
            loading={loading}
            embedded
            showStats={showStats}
            visibleColumns={visibleColumns}
            selection={{ selected, onToggle: toggle, onToggleAll: toggleAll }}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && !busy && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirmDelete?.length ?? 0} case{confirmDelete?.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The task is removed, but its emails aren't deleted — they go back to Needs Review so the correspondence stays reviewable. This can't be undone (the case's tracked dates, approval status and assignment are gone).
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
