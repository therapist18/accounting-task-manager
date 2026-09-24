"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { AlertCircle, Loader2, Plus, RefreshCw, Wifi, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Pagination } from "./Pagination"
import { HEAD_BLUE, SkeletonRows, SortTh, TD_CLASS, TH_CLASS, useSortedRows, zebraRow } from "./table"
import { PRIMARY_PILL_BUTTON_CLASS, SearchSelect, api, fmtDateTime, type AccountRow, type CompanyOption } from "./shared"

const watchActive = (a: AccountRow) => (a.watch_expiry ? new Date(a.watch_expiry).getTime() > Date.now() : false)

const SORT_VALUE: Record<string, (a: AccountRow) => string | number> = {
  email: (a) => a.email,
  company: (a) => a.company_name ?? "",
  last_sync: (a) => a.last_synced_at ?? "",
  push: (a) => (watchActive(a) ? 1 : 0),
}

export function MailboxesPanel({
  accounts,
  companies,
  onAccountLinked,
  onSynced,
  showTime,
  loading = false,
}: {
  accounts: AccountRow[]
  companies: CompanyOption[]
  // Local merge — the company name is already in `companies`, so linking a mailbox never needs a
  // network round trip beyond the PATCH itself.
  onAccountLinked: (accountId: string, companyId: string | null) => void
  // An explicit, deliberate click ("sync this one mailbox") — the page does a real (light) reload
  // afterwards, since new mail may have just been pulled in.
  onSynced: () => void
  showTime: boolean
  loading?: boolean
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [page, setPage] = useState(0)

  useEffect(() => setPage(0), [accounts, itemsPerPage])

  const { sort, sorted, toggle } = useSortedRows(accounts, SORT_VALUE, { key: "email", dir: "asc" })

  const totalPages = Math.max(1, Math.ceil(sorted.length / itemsPerPage))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * itemsPerPage
  const visibleAccounts = sorted.slice(start, start + itemsPerPage)

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

  const sync = async (a: AccountRow) => {
    setBusy(a.id)
    try {
      const res = await api<{ results: { ingested: number; failed: number; error?: string }[] }>(
        "/api/email-center/sync",
        { method: "POST", body: JSON.stringify({ accountId: a.id }) }
      )
      const r = res.results[0]
      if (r?.error) toast.error(r.error)
      else toast.success(`${r?.ingested ?? 0} new email(s)${r?.failed ? `, ${r.failed} failed` : ""}.`)
      onSynced()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl shadow-sm px-5 py-4">
        <div>
          <p className="text-lg font-semibold text-slate-900">Connected mailboxes</p>
          <p className="text-base text-slate-500 mt-1 max-w-3xl leading-relaxed">
            Each Gmail mailbox belongs to one company — that link is how incoming KRA emails are matched to a client.
            Connecting several? Google will ask you to pick or sign into the mailbox each time — just repeat "Connect Gmail account" for the next one.
          </p>
        </div>
        <a href="/api/gmail/connect" className="shrink-0">
          <Button size="sm" className={PRIMARY_PILL_BUTTON_CLASS}>
            <Plus className="w-5 h-5" /> Connect Gmail account
          </Button>
        </a>
      </div>

      <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
          <table className="w-full border-separate border-spacing-0 text-base">
            <thead className="sticky top-0 z-30 bg-white shadow-xs">
              <tr>
                <th className={cn(TH_CLASS, HEAD_BLUE, "w-11 text-center")}>#</th>
                <SortTh tone="blue" id="email" sort={sort} onSort={toggle} className="text-left">Mailbox</SortTh>
                <SortTh tone="blue" id="company" sort={sort} onSort={toggle} className="text-left min-w-[260px]">Company</SortTh>
                <SortTh tone="blue" id="last_sync" sort={sort} onSort={toggle} className="text-left">Last sync</SortTh>
                <SortTh tone="blue" id="push" sort={sort} onSort={toggle} className="text-left">Push</SortTh>
                <th className={cn(TH_CLASS, HEAD_BLUE, "w-16 border-r-0")}>Sync</th>
              </tr>
            </thead>
            <tbody>
              {loading && <SkeletonRows cols={6} />}
              {!loading && visibleAccounts.map((a, index) => {
                const live = watchActive(a)
                return (
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
                        error={!a.company_id}
                        value={a.company_id ?? ""}
                        disabled={busy === a.id}
                        onChange={(v) => assign(a, v)}
                        placeholder="— Not linked —"
                        options={[{ value: "", label: "— Not linked —" }, ...companies.map((c) => ({ value: c.id, label: c.company_name }))]}
                      />
                    </td>
                    <td className={cn(TD_CLASS, "text-slate-600 whitespace-nowrap tabular-nums")}>{a.last_synced_at ? fmtDateTime(a.last_synced_at, showTime) : "Never"}</td>
                    <td className={cn(TD_CLASS, "whitespace-nowrap")}>
                      {live ? (
                        <Badge variant="outline" className="text-sm font-semibold gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 rounded-full px-2.5 py-0.5">
                          <Wifi className="w-4 h-4" /> Live
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-sm font-medium gap-1 bg-slate-100 text-slate-500 border-slate-200 rounded-full px-2.5 py-0.5">
                          <WifiOff className="w-4 h-4" /> Not watching
                        </Badge>
                      )}
                    </td>
                    <td className={cn(TD_CLASS, "text-center border-r-0")}>
                      <Button variant="outline" size="sm" className="h-10 w-10 p-0 rounded-md border-slate-200 hover:bg-slate-100" disabled={busy === a.id} onClick={() => sync(a)}>
                        {busy === a.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5 text-slate-600" />}
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {!loading && !accounts.length && (
                <tr><td colSpan={6} className="py-16 text-center text-slate-400 text-base">No mailboxes match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          totalItems={sorted.length}
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
