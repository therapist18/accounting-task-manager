"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertCircle, Copy, Eye, EyeOff, Filter, History, Link2, Loader2, Pencil, Plus, RefreshCw, Unlink, Wifi, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import ClientCategoryFilter from "@/app/generic-components/ClientCategoryFilter"
import {
  companyMatchesCategoryFilters,
  DEFAULT_CATEGORY_FILTERS,
  type FilterState,
} from "@/app/generic-components/companyCategoryFilters"
import { cn } from "@/lib/utils"
import type { Company, KraEmailCredentials } from "../../companies/database"
import { Pagination } from "./Pagination"
import { HEAD_BLUE, TableLoading, SortTh, TD_CLASS, TH_CLASS, useSortedRows, zebraRow } from "./table"
import {
  PILL_BUTTON_ACTIVE_CLASS, PILL_BUTTON_CLASS, PRIMARY_PILL_BUTTON_CLASS, SearchSelect, api, fmtDateTime, needsReconnect,
  type AccountRow,
} from "./shared"

// The Mailboxes tab is company-first: every company (narrowed by the same Client Category Filter the
// company sidebars use) with whether it has a Gmail mailbox connected, so you can see at a glance which
// of the filtered companies are connected and which still need one. Mailboxes that aren't linked to any
// company are their own view (the "Unlinked mailboxes" chip), where they can be linked.

type ConnState = "connected" | "reconnect" | "not_connected"
// "failed" = companies with a mailbox Google no longer accepts (needs reconnecting).
export type MailboxView = "all" | "connected" | "not_connected" | "failed" | "unlinked"

interface CompanyRowData {
  company: Company
  kraEmail: string
  kraPassword: string
  accounts: AccountRow[]
  state: ConnState
  // Linked mailboxes that need reconnecting (revoked/expired token) - a company can be "connected"
  // through one healthy mailbox and still have a broken one.
  failing: number
  lastSync: string
  live: number
}

const watchActive = (a: AccountRow) => (a.watch_expiry ? new Date(a.watch_expiry).getTime() > Date.now() : false)

const STATE_RANK: Record<ConnState, number> = { connected: 0, reconnect: 1, not_connected: 2 }

const COMPANY_SORT: Record<string, (r: CompanyRowData) => string | number> = {
  company: (r) => r.company.company_name ?? "",
  kra_email: (r) => r.kraEmail.toLowerCase(),
  kra_password: (r) => (r.kraPassword ? 1 : 0),
  state: (r) => STATE_RANK[r.state],
  mailboxes: (r) => r.accounts.length,
  emails: (r) => r.accounts.reduce((sum, a) => sum + (a.email_count ?? 0), 0),
  first_email: (r) => r.accounts.map((a) => a.first_email_at).filter(Boolean).sort()[0] ?? "￿", // no data sorts last
  last_sync: (r) => r.lastSync,
  push: (r) => r.live,
  actions: (r) => (r.state === "connected" ? 1 : 0), // companies that still need a mailbox first
}

const ACCOUNT_SORT: Record<string, (a: AccountRow) => string | number> = {
  email: (a) => a.email,
  emails: (a) => a.email_count ?? 0,
  first_email: (a) => a.first_email_at ?? "￿",
  last_sync: (a) => a.last_synced_at ?? "",
  push: (a) => (watchActive(a) ? 1 : 0),
  link: (a) => a.label ?? a.email,
  sync: (a) => (a.status === "active" ? 1 : 0),
}

function StateBadge({ state }: { state: ConnState }) {
  if (state === "connected") return <Badge variant="outline" className="text-sm font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 rounded-full px-2.5 py-0.5">Connected</Badge>
  if (state === "reconnect") return <Badge variant="outline" className="text-sm font-semibold bg-amber-50 text-amber-700 border-amber-200 rounded-full px-2.5 py-0.5">Reconnect needed</Badge>
  return <Badge variant="outline" className="text-sm font-medium bg-slate-100 text-slate-600 border-slate-200 rounded-full px-2.5 py-0.5">Not connected</Badge>
}

// Their own table columns (Emails / First email), not a sub-line under the address — how much mail
// is stored for this mailbox, and how far back. Blank until at least one email has been stored, so a
// freshly-connected mailbox doesn't read as broken.
function EmailCountCell({ a }: { a: AccountRow }) {
  return a.email_count ? (
    <span className="tabular-nums" title="How many emails are stored for this mailbox — not every message it's ever received, since most mail (certificates, acknowledgements, system noise) is deliberately never stored.">
      {a.email_count.toLocaleString()}
    </span>
  ) : (
    <span className="text-slate-300">—</span>
  )
}

function FirstEmailCell({ a, showTime }: { a: AccountRow; showTime: boolean }) {
  return a.first_email_at ? (
    <span className="tabular-nums" title="The earliest STORED email for this mailbox — not necessarily its very first message in Gmail, since most mail is never stored at all.">
      {fmtDateTime(a.first_email_at, showTime)}
    </span>
  ) : (
    <span className="text-slate-300">—</span>
  )
}

function PushBadge({ live }: { live: boolean }) {
  return live ? (
    <Badge variant="outline" className="text-sm font-semibold gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 rounded-full px-2.5 py-0.5">
      <Wifi className="w-4 h-4" /> Live
    </Badge>
  ) : (
    <Badge variant="outline" className="text-sm font-medium gap-1 bg-slate-100 text-slate-500 border-slate-200 rounded-full px-2.5 py-0.5">
      <WifiOff className="w-4 h-4" /> Not watching
    </Badge>
  )
}

// The password stays masked until its eye is clicked; copy works either way. With no password saved
// the cell is an input; with one saved, the pencil turns it back into an input to change it.
// `revealAll` is the toolbar's global toggle: flipping it sets every row, and a row's own eye can
// still override it afterwards.
function KraPassword({ value, revealAll, onSave }: { value: string; revealAll: boolean; onSave: (password: string) => Promise<void> }) {
  const [shown, setShown] = useState(revealAll)
  useEffect(() => setShown(revealAll), [revealAll])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)

  if (!value || editing) {
    const save = async () => {
      const password = draft.trim()
      if (!password) return
      setSaving(true)
      try {
        await onSave(password)
        toast.success("Password saved.")
        setDraft("")
        setEditing(false)
      } catch (e: any) {
        toast.error(e.message ?? "Could not save the password.")
      } finally {
        setSaving(false)
      }
    }
    const cancel = () => { setDraft(""); setEditing(false) }
    return (
      <div className="flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); else if (e.key === "Escape" && editing) cancel() }}
          placeholder={editing ? "New password" : "Enter password"}
          disabled={saving}
          autoComplete="off"
          autoFocus={editing}
          className="h-9 w-40 text-base font-mono"
        />
        <Button size="sm" onClick={save} disabled={saving || !draft.trim()} className="h-9 px-3 rounded-md bg-custom-blue hover:bg-custom-blue/90 text-white text-base font-medium">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
        </Button>
        {editing && (
          <Button variant="outline" size="sm" onClick={cancel} disabled={saving} className="h-9 px-3 rounded-md border-slate-200 text-base font-medium">
            Cancel
          </Button>
        )}
      </div>
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success("Password copied.")
    } catch {
      toast.error("Could not copy to the clipboard.")
    }
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-slate-800 break-all">{shown ? value : "•".repeat(Math.min(value.length, 12))}</span>
      <button type="button" onClick={() => setShown((v) => !v)} className="p-1 rounded text-slate-500 hover:bg-slate-100 shrink-0" title={shown ? "Hide password" : "Show password"}>
        {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
      <button type="button" onClick={copy} className="p-1 rounded text-slate-500 hover:bg-slate-100 shrink-0" title="Copy password">
        <Copy className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => setEditing(true)} className="p-1 rounded text-slate-500 hover:bg-slate-100 shrink-0" title="Change password">
        <Pencil className="w-4 h-4" />
      </button>
    </div>
  )
}

export function MailboxesPanel({
  accounts,
  companies,
  kraCredentials,
  onKraPasswordSave,
  view,
  onViewChange,
  focusNonce,
  search,
  onAccountLinked,
  onSynced,
  onSyncFrom,
  showTime,
  loading = false,
}: {
  accounts: AccountRow[]
  // Full company records (the Client Category Filter needs their ACC/IMM/Audit/Sheria dates).
  companies: Company[]
  // company id → the KRA portal mailbox login stored on the company record.
  kraCredentials: Map<string, KraEmailCredentials>
  // Saves a password for a company that has none yet; rejects if the save fails.
  onKraPasswordSave: (companyId: string, password: string) => Promise<void>
  // Which chip is open - owned by the page so the toolbar's failed-mailboxes indicator can open the
  // "Needs reconnect" view. focusNonce bumps each time that indicator is clicked.
  view: MailboxView
  onViewChange: (view: MailboxView) => void
  focusNonce: number
  search: string
  // Local merge — the company name is already known, so linking a mailbox never needs a network round
  // trip beyond the PATCH itself.
  onAccountLinked: (accountId: string, companyId: string | null) => void
  // An explicit, deliberate click ("sync this one mailbox") — the page does a real (light) reload
  // afterwards, since new mail may have just been pulled in.
  onSynced: () => void
  // Opens the "Sync from date" dialog, optionally starting with specific mailboxes selected.
  onSyncFrom: (accountIds?: string[]) => void
  showTime: boolean
  loading?: boolean
}) {
  const [categoryFilters, setCategoryFilters] = useState<FilterState | null>(DEFAULT_CATEGORY_FILTERS)
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false)
  const [revealPasswords, setRevealPasswords] = useState(false)
  // A move/unlink waiting for the person to confirm it (toCompanyId null = unlink).
  const [pendingReassign, setPendingReassign] = useState<{ account: AccountRow; fromName: string; toCompanyId: string | null } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [page, setPage] = useState(0)

  const q = search.trim().toLowerCase()

  // Jumping here from the failed-mailboxes indicator: drop the client-category filter too, so a failing
  // mailbox on a company the default filter hides can't be missed.
  useEffect(() => {
    if (focusNonce > 0) setCategoryFilters(null)
  }, [focusNonce])

  const accountsByCompany = useMemo(() => {
    const map = new Map<string, AccountRow[]>()
    for (const a of accounts) {
      if (!a.company_id) continue
      const list = map.get(String(a.company_id)) ?? []
      list.push(a)
      map.set(String(a.company_id), list)
    }
    return map
  }, [accounts])

  const unlinked = useMemo(
    () => accounts.filter((a) => !a.company_id).filter((a) => !q || `${a.email} ${a.label ?? ""} ${a.last_sync_error ?? ""}`.toLowerCase().includes(q)),
    [accounts, q]
  )

  // Companies after the category filter and the search (the state chips then narrow further).
  const baseRows: CompanyRowData[] = useMemo(() => {
    return companies
      .filter((c) => companyMatchesCategoryFilters(c, categoryFilters))
      .map((company) => {
        const linked = accountsByCompany.get(String(company.id)) ?? []
        const healthy = linked.filter((a) => !needsReconnect(a))
        const creds = kraCredentials.get(String(company.id))
        return {
          company,
          kraEmail: (creds?.kra_email_address ?? company.kra_email_address ?? "").trim().toLowerCase(),
          kraPassword: creds?.kra_email_password ?? "",
          accounts: linked,
          state: (healthy.length ? "connected" : linked.length ? "reconnect" : "not_connected") as ConnState,
          failing: linked.length - healthy.length,
          lastSync: linked.map((a) => a.last_synced_at ?? "").sort().pop() ?? "",
          live: linked.filter(watchActive).length,
        }
      })
      .filter((r) => !q || `${r.company.company_name} ${r.company.kra_pin ?? ""} ${r.kraEmail} ${r.accounts.map((a) => a.email).join(" ")}`.toLowerCase().includes(q))
  }, [companies, kraCredentials, categoryFilters, accountsByCompany, q])

  const counts = {
    all: baseRows.length,
    connected: baseRows.filter((r) => r.state === "connected").length,
    not_connected: baseRows.filter((r) => r.state !== "connected").length,
    failed: baseRows.filter((r) => r.failing > 0).length,
    unlinked: unlinked.length,
  }

  const companyRows = useMemo(
    () =>
      view === "connected" ? baseRows.filter((r) => r.state === "connected")
        : view === "not_connected" ? baseRows.filter((r) => r.state !== "connected")
        : view === "failed" ? baseRows.filter((r) => r.failing > 0)
        : baseRows,
    [baseRows, view]
  )

  const companySort = useSortedRows(companyRows, COMPANY_SORT, { key: "company", dir: "asc" })
  const accountSort = useSortedRows(unlinked, ACCOUNT_SORT, { key: "email", dir: "asc" })

  useEffect(() => setPage(0), [view, categoryFilters, q, itemsPerPage, accounts.length])

  const showingUnlinked = view === "unlinked"
  const list = showingUnlinked ? accountSort.sorted : companySort.sorted
  const totalPages = Math.max(1, Math.ceil(list.length / itemsPerPage))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * itemsPerPage
  const pageCompanyRows = companySort.sorted.slice(start, start + itemsPerPage)
  const pageAccountRows = accountSort.sorted.slice(start, start + itemsPerPage)

  const assign = async (a: AccountRow, companyId: string) => {
    setBusy(a.id)
    try {
      await api(`/api/email-center/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ company_id: companyId || null }) })
      toast.success(companyId ? `${a.email} linked.` : `${a.email} unlinked.`)
      onAccountLinked(a.id, companyId || null)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  // Moving or unlinking only changes where NEW mail is matched — emails and cases already pulled in
  // keep their company — so say so before doing it.
  const reassign = (account: AccountRow, fromName: string, toCompanyId: string | null) =>
    setPendingReassign({ account, fromName, toCompanyId })

  const pendingToName = pendingReassign?.toCompanyId
    ? companies.find((c) => String(c.id) === pendingReassign.toCompanyId)?.company_name ?? "the selected company"
    : null

  const confirmReassign = async () => {
    if (!pendingReassign) return
    const { account, toCompanyId } = pendingReassign
    setPendingReassign(null)
    await assign(account, toCompanyId ?? "")
  }

  // Syncs each of the given mailboxes in turn (a company can have more than one).
  const sync = async (key: string, targets: AccountRow[]) => {
    setBusy(key)
    try {
      let ingested = 0
      for (const a of targets) {
        const res = await api<{ results: { ingested: number; failed: number; error?: string }[] }>(
          "/api/email-center/sync",
          { method: "POST", body: JSON.stringify({ accountId: a.id }) }
        )
        const r = res.results[0]
        if (r?.error) toast.error(`${a.email}: ${r.error}`)
        else ingested += r?.ingested ?? 0
      }
      toast.success(`${ingested} new email(s).`)
      onSynced()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const activeAccounts = accounts.filter((a) => !needsReconnect(a))
  const linkOptions = useMemo(
    () => companies.map((c) => ({ value: String(c.id), label: c.company_name })),
    [companies]
  )
  const categoryActive = categoryFilters !== DEFAULT_CATEGORY_FILTERS

  const VIEWS: Array<[MailboxView, string]> = [
    ["all", "All companies"],
    ["connected", "Connected"],
    ["not_connected", "Not connected"],
    ["failed", "Needs reconnect"],
    ["unlinked", "Unlinked mailboxes"],
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      {/* Summary + actions */}
      <div className="shrink-0 bg-white border border-slate-200 rounded-xl shadow-sm px-5 py-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-slate-900">
              Mailboxes by company
              {!loading && <span className="ml-3 text-base font-medium text-slate-500">{counts.connected} of {counts.all} connected</span>}
            </p>
            <p className="text-base text-slate-500 mt-1 max-w-3xl leading-relaxed">
              Every company in the current filter, and whether it has a Gmail mailbox connected. Each mailbox belongs to one company — that link is how incoming KRA emails are matched to a client.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => onSyncFrom()} disabled={activeAccounts.length === 0} className={PILL_BUTTON_CLASS} title="Pull in older mail from a chosen date">
              <History className="h-5 w-5" /> Sync from date
            </Button>
            <a href="/api/gmail/connect">
              <Button size="sm" className={PRIMARY_PILL_BUTTON_CLASS}>
                <Plus className="w-5 h-5" /> Connect Gmail account
              </Button>
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex p-1 bg-slate-100 rounded-lg border border-slate-200 gap-1 flex-wrap">
            {VIEWS.map(([value, label]) => (
              <button
                key={value}
                onClick={() => onViewChange(value)}
                className={cn(
                  "h-9 px-3.5 rounded-md text-base font-medium flex items-center gap-2 transition-all",
                  view === value ? "bg-custom-blue text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-white/70"
                )}
              >
                {label}
                <span className={cn(
                  "inline-flex items-center justify-center font-semibold tabular-nums px-1.5 py-0.5 rounded-full text-sm min-w-[1.25rem] leading-none",
                  view === value ? "bg-white/20 text-white"
                    : value === "unlinked" && counts.unlinked > 0 ? "bg-amber-500 text-white"
                    : value === "failed" && counts.failed > 0 ? "bg-red-500 text-white"
                    : "bg-slate-200 text-slate-700"
                )}>
                  {counts[value]}
                </span>
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCategoryFilterOpen(true)}
            disabled={showingUnlinked}
            className={cn(PILL_BUTTON_CLASS, categoryActive && PILL_BUTTON_ACTIVE_CLASS)}
            title={showingUnlinked ? "Category filters apply to companies" : "Filter companies by client category"}
          >
            <Filter className="h-5 w-5" /> Client category
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevealPasswords((v) => !v)}
            disabled={showingUnlinked}
            className={cn(PILL_BUTTON_CLASS, revealPasswords && PILL_BUTTON_ACTIVE_CLASS)}
            title={revealPasswords ? "Mask every KRA email password" : "Show every KRA email password"}
          >
            {revealPasswords ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            {revealPasswords ? "Hide passwords" : "Show passwords"}
          </Button>
          <ClientCategoryFilter
            open={categoryFilterOpen}
            onOpenChange={setCategoryFilterOpen}
            onFilterChange={setCategoryFilters}
            initialFilters={categoryFilters}
            showSectionStatus={false}
            showOperationalStatus={true}
            hideCategoryFilterButton
          />
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
          {!showingUnlinked ? (
            <table className="w-full min-w-[1900px] border-separate border-spacing-0 text-base">
              <thead className="sticky top-0 z-30 bg-white shadow-xs">
                <tr>
                  <SortTh tone="blue" id="#" sort={companySort.sort} onSort={companySort.toggle} className="w-16 text-center">#</SortTh>
                  <SortTh tone="blue" id="company" sort={companySort.sort} onSort={companySort.toggle} className="text-left min-w-[260px]">Company</SortTh>
                  <SortTh tone="blue" id="kra_email" sort={companySort.sort} onSort={companySort.toggle} className="text-left min-w-[240px]">KRA email</SortTh>
                  <SortTh tone="blue" id="kra_password" sort={companySort.sort} onSort={companySort.toggle} className="text-left min-w-[200px]">KRA email password</SortTh>
                  <SortTh tone="blue" id="state" sort={companySort.sort} onSort={companySort.toggle} className="text-left min-w-[170px]">Status</SortTh>
                  <SortTh tone="blue" id="mailboxes" sort={companySort.sort} onSort={companySort.toggle} className="text-left min-w-[340px]">Mailbox</SortTh>
                  <SortTh tone="blue" id="emails" sort={companySort.sort} onSort={companySort.toggle} className="text-left min-w-[100px]">Emails</SortTh>
                  <SortTh tone="blue" id="first_email" sort={companySort.sort} onSort={companySort.toggle} className="text-left min-w-[140px]">First email</SortTh>
                  <SortTh tone="blue" id="last_sync" sort={companySort.sort} onSort={companySort.toggle} className="text-left min-w-[150px]">Last sync</SortTh>
                  <SortTh tone="blue" id="push" sort={companySort.sort} onSort={companySort.toggle} className="text-left min-w-[150px]">Push</SortTh>
                  <SortTh tone="blue" id="actions" sort={companySort.sort} onSort={companySort.toggle} className="min-w-[250px] text-left border-r-0">Actions</SortTh>
                </tr>
              </thead>
              <tbody>
                {loading && <TableLoading cols={11} />}
                {!loading && pageCompanyRows.map((r, index) => {
                  const cid = String(r.company.id)
                  const key = `c-${cid}`
                  const connectedOnce = r.accounts.length > 0
                  return (
                    <tr key={cid} className={cn("transition-colors", zebraRow(index))}>
                      <td className={cn(TD_CLASS, "text-center text-slate-400 tabular-nums font-medium")}>{start + index + 1}</td>
                      <td className={TD_CLASS}>
                        <div className="font-semibold text-slate-900 leading-snug">{r.company.company_name}</div>
                        {r.company.kra_pin && <div className="text-sm text-slate-500 mt-0.5 font-mono">{r.company.kra_pin}</div>}
                      </td>
                      <td className={TD_CLASS}>
                        {r.kraEmail ? <div className="text-slate-800 break-all">{r.kraEmail}</div> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={TD_CLASS}><KraPassword value={r.kraPassword} revealAll={revealPasswords} onSave={(pw) => onKraPasswordSave(cid, pw)} /></td>
                      <td className={cn(TD_CLASS, "whitespace-nowrap")}><StateBadge state={r.state} /></td>
                      <td className={TD_CLASS}>
                        {connectedOnce ? (
                          <div className="space-y-1.5">
                            {r.accounts.map((a) => (
                              <div key={a.id}>
                                <div className="text-slate-800 break-all">{a.email}</div>
                                {needsReconnect(a) && (
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="outline" className="text-sm font-semibold bg-red-50 text-red-700 border-red-200 rounded-full px-2.5 py-0.5">Reconnect needed</Badge>
                                    <a href={`/api/gmail/connect?company=${encodeURIComponent(cid)}`} className="text-sm font-semibold text-red-700 underline" title="Sign in to this Google account again to restore access">Reconnect</a>
                                  </div>
                                )}
                                {a.last_sync_error && (
                                  <div className="flex items-center gap-1 text-sm text-red-600 mt-0.5" title={a.last_sync_error}>
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span className="truncate max-w-[16rem]">{a.last_sync_error}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5 mt-1">
                                  <SearchSelect
                                    className="w-48"
                                    value=""
                                    disabled={busy === a.id}
                                    onChange={(companyId) => { if (companyId && companyId !== cid) reassign(a, r.company.company_name, companyId) }}
                                    placeholder="Move to company…"
                                    options={linkOptions.filter((o) => o.value !== cid)}
                                  />
                                  <Button variant="outline" size="sm" disabled={busy === a.id} onClick={() => reassign(a, r.company.company_name, null)} className="h-9 px-3 gap-1.5 rounded-md border-slate-200 text-base font-medium" title="Detach this mailbox from the company">
                                    {busy === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4 text-slate-600" />} Unlink
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={cn(TD_CLASS, "whitespace-nowrap tabular-nums text-slate-600")}>
                        {connectedOnce ? (
                          <div className="space-y-1.5">
                            {r.accounts.map((a) => <div key={a.id}><EmailCountCell a={a} /></div>)}
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={cn(TD_CLASS, "whitespace-nowrap tabular-nums text-slate-600")}>
                        {connectedOnce ? (
                          <div className="space-y-1.5">
                            {r.accounts.map((a) => <div key={a.id}><FirstEmailCell a={a} showTime={showTime} /></div>)}
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={cn(TD_CLASS, "whitespace-nowrap tabular-nums text-slate-600")}>
                        {connectedOnce ? (
                          <div className="space-y-1.5">
                            {r.accounts.map((a) => <div key={a.id}>{a.last_synced_at ? fmtDateTime(a.last_synced_at, showTime) : "Never"}</div>)}
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={cn(TD_CLASS, "whitespace-nowrap")}>
                        {connectedOnce ? (
                          <div className="space-y-1.5">
                            {r.accounts.map((a) => <div key={a.id}><PushBadge live={watchActive(a)} /></div>)}
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={cn(TD_CLASS, "border-r-0")}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {connectedOnce ? (
                            <>
                              <Button variant="outline" size="sm" disabled={busy === key || r.state !== "connected"} onClick={() => sync(key, r.accounts.filter((a) => !needsReconnect(a)))} className="h-9 px-3 gap-1.5 rounded-md border-slate-200 text-base font-medium" title="Check Gmail for new mail now">
                                {busy === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-slate-600" />} Sync
                              </Button>
                              <Button variant="outline" size="sm" disabled={r.state !== "connected"} onClick={() => onSyncFrom(r.accounts.filter((a) => !needsReconnect(a)).map((a) => a.id))} className="h-9 px-3 gap-1.5 rounded-md border-slate-200 text-base font-medium" title="Pull in older mail from a chosen date">
                                <History className="w-4 h-4 text-slate-600" /> From date
                              </Button>
                              <a href={`/api/gmail/connect?company=${encodeURIComponent(cid)}`} title={r.failing > 0 ? "Sign in again to restore access" : "Connect another mailbox for this company"}>
                                <Button variant="outline" size="sm" className={cn("h-9 px-3 gap-1.5 rounded-md text-base font-medium", r.failing > 0 ? "border-red-300 text-red-800 bg-red-50 hover:bg-red-100" : "border-slate-200")}>
                                  <Plus className="w-4 h-4" /> {r.failing > 0 ? "Reconnect" : "Mailbox"}
                                </Button>
                              </a>
                            </>
                          ) : (
                            <>
                              <a href={`/api/gmail/connect?company=${encodeURIComponent(cid)}`}>
                                <Button size="sm" className="h-9 px-3 gap-1.5 rounded-md bg-custom-blue hover:bg-custom-blue/90 text-white text-base font-semibold">
                                  <Plus className="w-4 h-4" /> Connect Gmail
                                </Button>
                              </a>
                              {counts.unlinked > 0 && (
                                <SearchSelect
                                  className="w-52"
                                  value=""
                                  disabled={!!busy}
                                  onChange={(accountId) => { const a = accounts.find((x) => x.id === accountId); if (a) assign(a, cid) }}
                                  placeholder="Link existing…"
                                  options={accounts.filter((a) => !a.company_id).map((a) => ({ value: a.id, label: a.email }))}
                                />
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!loading && pageCompanyRows.length === 0 && (
                  <tr><td colSpan={11} className="py-16 text-center text-slate-400 text-base">
                    {companies.length === 0 ? "No companies loaded." : "No companies match this filter."}
                  </td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[1150px] border-separate border-spacing-0 text-base">
              <thead className="sticky top-0 z-30 bg-white shadow-xs">
                <tr>
                  <SortTh tone="blue" id="#" sort={accountSort.sort} onSort={accountSort.toggle} className="w-16 text-center">#</SortTh>
                  <SortTh tone="blue" id="email" sort={accountSort.sort} onSort={accountSort.toggle} className="text-left min-w-[260px]">Mailbox</SortTh>
                  <SortTh tone="blue" id="emails" sort={accountSort.sort} onSort={accountSort.toggle} className="text-left min-w-[100px]">Emails</SortTh>
                  <SortTh tone="blue" id="first_email" sort={accountSort.sort} onSort={accountSort.toggle} className="text-left min-w-[140px]">First email</SortTh>
                  <SortTh tone="blue" id="link" sort={accountSort.sort} onSort={accountSort.toggle} className="text-left min-w-[300px]">Link to company</SortTh>
                  <SortTh tone="blue" id="last_sync" sort={accountSort.sort} onSort={accountSort.toggle} className="text-left min-w-[150px]">Last sync</SortTh>
                  <SortTh tone="blue" id="push" sort={accountSort.sort} onSort={accountSort.toggle} className="text-left min-w-[150px]">Push</SortTh>
                  <SortTh tone="blue" id="sync" sort={accountSort.sort} onSort={accountSort.toggle} className="w-28 border-r-0">Sync</SortTh>
                </tr>
              </thead>
              <tbody>
                {loading && <TableLoading cols={8} />}
                {!loading && pageAccountRows.map((a, index) => (
                  <tr key={a.id} className={cn("transition-colors", zebraRow(index))}>
                    <td className={cn(TD_CLASS, "text-center text-slate-400 tabular-nums font-medium")}>{start + index + 1}</td>
                    <td className={TD_CLASS}>
                      <div className="font-semibold text-slate-900">{a.email}</div>
                      {needsReconnect(a) && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-sm font-semibold bg-red-50 text-red-700 border-red-200 rounded-full px-2.5 py-0.5">Reconnect needed</Badge>
                          <a href="/api/gmail/connect" className="text-sm font-semibold text-red-700 underline" title="Sign in to this Google account again to restore access">Reconnect</a>
                        </div>
                      )}
                      {a.last_sync_error && (
                        <div className="flex items-center gap-1 text-sm text-red-600 max-w-xs mt-0.5" title={a.last_sync_error}>
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span className="truncate">{a.last_sync_error}</span>
                        </div>
                      )}
                    </td>
                    <td className={cn(TD_CLASS, "whitespace-nowrap tabular-nums text-slate-600")}><EmailCountCell a={a} /></td>
                    <td className={cn(TD_CLASS, "whitespace-nowrap tabular-nums text-slate-600")}><FirstEmailCell a={a} showTime={showTime} /></td>
                    <td className={TD_CLASS}>
                      <SearchSelect
                        className="w-full"
                        error
                        value=""
                        disabled={busy === a.id}
                        onChange={(v) => assign(a, v)}
                        placeholder="— Not linked —"
                        options={linkOptions}
                      />
                    </td>
                    <td className={cn(TD_CLASS, "text-slate-600 whitespace-nowrap tabular-nums")}>{a.last_synced_at ? fmtDateTime(a.last_synced_at, showTime) : "Never"}</td>
                    <td className={cn(TD_CLASS, "whitespace-nowrap")}><PushBadge live={watchActive(a)} /></td>
                    <td className={cn(TD_CLASS, "text-center border-r-0")}>
                      <Button variant="outline" size="sm" className="h-10 w-10 p-0 rounded-md border-slate-200 hover:bg-slate-100" disabled={busy === `a-${a.id}` || needsReconnect(a)} onClick={() => sync(`a-${a.id}`, [a])}>
                        {busy === `a-${a.id}` ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5 text-slate-600" />}
                      </Button>
                    </td>
                  </tr>
                ))}
                {!loading && pageAccountRows.length === 0 && (
                  <tr><td colSpan={8} className="py-16 text-center text-slate-400 text-base">
                    <Link2 className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    Every mailbox is linked to a company.
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        <Pagination
          totalItems={list.length}
          itemsPerPage={itemsPerPage}
          currentPage={safePage}
          onPageChange={setPage}
          onItemsPerPageChange={(n) => setItemsPerPage(n)}
          sticky={false}
          className="shrink-0 border-t border-slate-200"
        />
      </div>

      <AlertDialog open={!!pendingReassign} onOpenChange={(o) => !o && setPendingReassign(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingToName ? `Move ${pendingReassign?.account.email} to ${pendingToName}?` : `Unlink ${pendingReassign?.account.email}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingToName
                ? `New emails will be matched to ${pendingToName}. Emails already synced stay with ${pendingReassign?.fromName}.`
                : `New emails won't be matched to any company until it is linked again. Emails already synced stay with ${pendingReassign?.fromName}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReassign} className={pendingToName ? "bg-custom-blue hover:bg-custom-blue/90" : "bg-red-600 hover:bg-red-700"}>
              {pendingToName ? "Move mailbox" : "Unlink"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
