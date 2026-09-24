"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertCircle, Filter, History, Link2, Loader2, Plus, RefreshCw, Wifi, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import ClientCategoryFilter from "@/app/generic-components/ClientCategoryFilter"
import {
  companyMatchesCategoryFilters,
  DEFAULT_CATEGORY_FILTERS,
  type FilterState,
} from "@/app/generic-components/companyCategoryFilters"
import { cn } from "@/lib/utils"
import type { Company } from "../../companies/database"
import { Pagination } from "./Pagination"
import { HEAD_BLUE, SkeletonRows, SortTh, TD_CLASS, TH_CLASS, useSortedRows, zebraRow } from "./table"
import {
  PILL_BUTTON_ACTIVE_CLASS, PILL_BUTTON_CLASS, PRIMARY_PILL_BUTTON_CLASS, SearchSelect, api, fmtDateTime,
  type AccountRow,
} from "./shared"

// The Mailboxes tab is company-first: every company (narrowed by the same Client Category Filter the
// company sidebars use) with whether it has a Gmail mailbox connected, so you can see at a glance which
// of the filtered companies are connected and which still need one. Mailboxes that aren't linked to any
// company are their own view (the "Unlinked mailboxes" chip), where they can be linked.

type ConnState = "connected" | "reconnect" | "not_connected"
type View = "all" | "connected" | "not_connected" | "unlinked"

interface CompanyRowData {
  company: Company
  accounts: AccountRow[]
  state: ConnState
  lastSync: string
  live: number
}

const watchActive = (a: AccountRow) => (a.watch_expiry ? new Date(a.watch_expiry).getTime() > Date.now() : false)

const STATE_RANK: Record<ConnState, number> = { connected: 0, reconnect: 1, not_connected: 2 }

const COMPANY_SORT: Record<string, (r: CompanyRowData) => string | number> = {
  company: (r) => r.company.company_name ?? "",
  state: (r) => STATE_RANK[r.state],
  mailboxes: (r) => r.accounts.length,
  last_sync: (r) => r.lastSync,
  push: (r) => r.live,
  actions: (r) => (r.state === "connected" ? 1 : 0), // companies that still need a mailbox first
}

const ACCOUNT_SORT: Record<string, (a: AccountRow) => string | number> = {
  email: (a) => a.email,
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

export function MailboxesPanel({
  accounts,
  companies,
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
  const [view, setView] = useState<View>("all")
  const [categoryFilters, setCategoryFilters] = useState<FilterState | null>(DEFAULT_CATEGORY_FILTERS)
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [page, setPage] = useState(0)

  const q = search.trim().toLowerCase()

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
        const active = linked.filter((a) => a.status === "active")
        return {
          company,
          accounts: linked,
          state: (active.length ? "connected" : linked.length ? "reconnect" : "not_connected") as ConnState,
          lastSync: linked.map((a) => a.last_synced_at ?? "").sort().pop() ?? "",
          live: linked.filter(watchActive).length,
        }
      })
      .filter((r) => !q || `${r.company.company_name} ${r.company.kra_pin ?? ""} ${r.accounts.map((a) => a.email).join(" ")}`.toLowerCase().includes(q))
  }, [companies, categoryFilters, accountsByCompany, q])

  const counts = {
    all: baseRows.length,
    connected: baseRows.filter((r) => r.state === "connected").length,
    not_connected: baseRows.filter((r) => r.state !== "connected").length,
    unlinked: unlinked.length,
  }

  const companyRows = useMemo(
    () => (view === "connected" ? baseRows.filter((r) => r.state === "connected") : view === "not_connected" ? baseRows.filter((r) => r.state !== "connected") : baseRows),
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
      toast.success(`${a.email} linked.`)
      onAccountLinked(a.id, companyId || null)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
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

  const activeAccounts = accounts.filter((a) => a.status === "active")
  const linkOptions = useMemo(
    () => companies.map((c) => ({ value: String(c.id), label: c.company_name })),
    [companies]
  )
  const categoryActive = categoryFilters !== DEFAULT_CATEGORY_FILTERS

  const VIEWS: Array<[View, string]> = [
    ["all", "All companies"],
    ["connected", "Connected"],
    ["not_connected", "Not connected"],
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
                onClick={() => setView(value)}
                className={cn(
                  "h-9 px-3.5 rounded-md text-base font-medium flex items-center gap-2 transition-all",
                  view === value ? "bg-custom-blue text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-white/70"
                )}
              >
                {label}
                <span className={cn(
                  "inline-flex items-center justify-center font-semibold tabular-nums px-1.5 py-0.5 rounded-full text-sm min-w-[1.25rem] leading-none",
                  view === value ? "bg-white/20 text-white" : value === "unlinked" && counts.unlinked > 0 ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-700"
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
            <table className="w-full min-w-[1150px] border-separate border-spacing-0 text-base">
              <thead className="sticky top-0 z-30 bg-white shadow-xs">
                <tr>
                  <SortTh tone="blue" id="#" sort={companySort.sort} onSort={companySort.toggle} className="w-16 text-center">#</SortTh>
                  <SortTh tone="blue" id="company" sort={companySort.sort} onSort={companySort.toggle} className="text-left min-w-[260px]">Company</SortTh>
                  <SortTh tone="blue" id="state" sort={companySort.sort} onSort={companySort.toggle} className="text-left min-w-[170px]">Status</SortTh>
                  <SortTh tone="blue" id="mailboxes" sort={companySort.sort} onSort={companySort.toggle} className="text-left min-w-[260px]">Mailbox</SortTh>
                  <SortTh tone="blue" id="last_sync" sort={companySort.sort} onSort={companySort.toggle} className="text-left min-w-[150px]">Last sync</SortTh>
                  <SortTh tone="blue" id="push" sort={companySort.sort} onSort={companySort.toggle} className="text-left min-w-[150px]">Push</SortTh>
                  <SortTh tone="blue" id="actions" sort={companySort.sort} onSort={companySort.toggle} className="min-w-[250px] text-left border-r-0">Actions</SortTh>
                </tr>
              </thead>
              <tbody>
                {loading && <SkeletonRows cols={7} />}
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
                      <td className={cn(TD_CLASS, "whitespace-nowrap")}><StateBadge state={r.state} /></td>
                      <td className={TD_CLASS}>
                        {connectedOnce ? (
                          <div className="space-y-1.5">
                            {r.accounts.map((a) => (
                              <div key={a.id}>
                                <div className="text-slate-800 break-all">{a.email}</div>
                                {a.last_sync_error && (
                                  <div className="flex items-center gap-1 text-sm text-red-600 mt-0.5" title={a.last_sync_error}>
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span className="truncate max-w-[16rem]">{a.last_sync_error}</span>
                                  </div>
                                )}
                              </div>
                            ))}
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
                              <Button variant="outline" size="sm" disabled={busy === key || r.state !== "connected"} onClick={() => sync(key, r.accounts.filter((a) => a.status === "active"))} className="h-9 px-3 gap-1.5 rounded-md border-slate-200 text-base font-medium" title="Check Gmail for new mail now">
                                {busy === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-slate-600" />} Sync
                              </Button>
                              <Button variant="outline" size="sm" disabled={r.state !== "connected"} onClick={() => onSyncFrom(r.accounts.filter((a) => a.status === "active").map((a) => a.id))} className="h-9 px-3 gap-1.5 rounded-md border-slate-200 text-base font-medium" title="Pull in older mail from a chosen date">
                                <History className="w-4 h-4 text-slate-600" /> From date
                              </Button>
                              <a href={`/api/gmail/connect?company=${encodeURIComponent(cid)}`} title={r.state === "reconnect" ? "Sign in again to restore access" : "Connect another mailbox for this company"}>
                                <Button variant="outline" size="sm" className={cn("h-9 px-3 gap-1.5 rounded-md text-base font-medium", r.state === "reconnect" ? "border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100" : "border-slate-200")}>
                                  <Plus className="w-4 h-4" /> {r.state === "reconnect" ? "Reconnect" : "Mailbox"}
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
                  <tr><td colSpan={7} className="py-16 text-center text-slate-400 text-base">
                    {companies.length === 0 ? "No companies loaded." : "No companies match this filter."}
                  </td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-base">
              <thead className="sticky top-0 z-30 bg-white shadow-xs">
                <tr>
                  <SortTh tone="blue" id="#" sort={accountSort.sort} onSort={accountSort.toggle} className="w-16 text-center">#</SortTh>
                  <SortTh tone="blue" id="email" sort={accountSort.sort} onSort={accountSort.toggle} className="text-left min-w-[260px]">Mailbox</SortTh>
                  <SortTh tone="blue" id="link" sort={accountSort.sort} onSort={accountSort.toggle} className="text-left min-w-[300px]">Link to company</SortTh>
                  <SortTh tone="blue" id="last_sync" sort={accountSort.sort} onSort={accountSort.toggle} className="text-left min-w-[150px]">Last sync</SortTh>
                  <SortTh tone="blue" id="push" sort={accountSort.sort} onSort={accountSort.toggle} className="text-left min-w-[150px]">Push</SortTh>
                  <SortTh tone="blue" id="sync" sort={accountSort.sort} onSort={accountSort.toggle} className="w-28 border-r-0">Sync</SortTh>
                </tr>
              </thead>
              <tbody>
                {loading && <SkeletonRows cols={6} />}
                {!loading && pageAccountRows.map((a, index) => (
                  <tr key={a.id} className={cn("transition-colors", zebraRow(index))}>
                    <td className={cn(TD_CLASS, "text-center text-slate-400 tabular-nums font-medium")}>{start + index + 1}</td>
                    <td className={TD_CLASS}>
                      <div className="font-semibold text-slate-900">{a.email}</div>
                      {a.last_sync_error && (
                        <div className="flex items-center gap-1 text-sm text-red-600 max-w-xs mt-0.5" title={a.last_sync_error}>
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span className="truncate">{a.last_sync_error}</span>
                        </div>
                      )}
                    </td>
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
                      <Button variant="outline" size="sm" className="h-10 w-10 p-0 rounded-md border-slate-200 hover:bg-slate-100" disabled={busy === `a-${a.id}` || a.status !== "active"} onClick={() => sync(`a-${a.id}`, [a])}>
                        {busy === `a-${a.id}` ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5 text-slate-600" />}
                      </Button>
                    </td>
                  </tr>
                ))}
                {!loading && pageAccountRows.length === 0 && (
                  <tr><td colSpan={6} className="py-16 text-center text-slate-400 text-base">
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
    </div>
  )
}
