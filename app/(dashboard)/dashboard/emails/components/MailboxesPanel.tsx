"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { AlertCircle, Loader2, Plus, RefreshCw, Wifi, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Pagination } from "./Pagination"
import { PRIMARY_PILL_BUTTON_CLASS, SearchSelect, api, fmtDateTime, type AccountRow, type CompanyOption } from "./shared"

export function MailboxesPanel({
  accounts,
  companies,
  onAccountLinked,
  onSynced,
}: {
  accounts: AccountRow[]
  companies: CompanyOption[]
  // Local merge — the company name is already in `companies`, so linking a mailbox never needs a
  // network round trip beyond the PATCH itself.
  onAccountLinked: (accountId: string, companyId: string | null) => void
  // An explicit, deliberate click ("sync this one mailbox") — the page does a real (light) reload
  // afterwards, since new mail may have just been pulled in.
  onSynced: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [page, setPage] = useState(0)

  useEffect(() => setPage(0), [accounts, itemsPerPage])

  const totalPages = Math.max(1, Math.ceil(accounts.length / itemsPerPage))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * itemsPerPage
  const visibleAccounts = accounts.slice(start, start + itemsPerPage)

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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl shadow-sm px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-800">Connected mailboxes</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Each Gmail mailbox belongs to one company — that link is how incoming KRA emails are matched to a client.
            Connecting several? Google will ask you to pick or sign into the mailbox each time — just repeat "Connect Gmail account" for the next one.
          </p>
        </div>
        <a href="/api/gmail/connect" className="shrink-0">
          <Button size="sm" className="h-8 px-3.5 text-xs font-semibold rounded-md shadow-xs bg-custom-blue hover:bg-custom-blue/90 text-white flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Connect Gmail account
          </Button>
        </a>
      </div>

      <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="text-center px-3.5 py-2.5 w-11 font-semibold uppercase tracking-wider border-b border-r border-slate-200 text-xs">#</th>
                <th className="text-left px-3.5 py-2.5 font-semibold uppercase tracking-wider border-b border-r border-slate-200 text-xs">Mailbox</th>
                <th className="text-left px-3.5 py-2.5 min-w-[240px] font-semibold uppercase tracking-wider border-b border-r border-slate-200 text-xs">Company</th>
                <th className="text-left px-3.5 py-2.5 font-semibold uppercase tracking-wider border-b border-r border-slate-200 text-xs">Last sync</th>
                <th className="text-left px-3.5 py-2.5 font-semibold uppercase tracking-wider border-b border-r border-slate-200 text-xs">Push</th>
                <th className="px-3.5 py-2.5 border-b border-slate-200" />
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((a, index) => {
                const watchActive = a.watch_expiry ? new Date(a.watch_expiry).getTime() > Date.now() : false
                const isEven = index % 2 === 0
                return (
                  <tr key={a.id} className={cn("transition-colors", isEven ? "bg-white hover:bg-slate-50/80" : "bg-slate-50/40 hover:bg-slate-100/70")}>
                    <td className="px-3.5 py-2.5 text-center text-slate-400 tabular-nums border-b border-r border-slate-100">{start + index + 1}</td>
                    <td className="px-3.5 py-2.5 border-b border-r border-slate-100">
                      <div className="font-semibold text-slate-800">{a.email}</div>
                      {a.last_sync_error && (
                        <div className="flex items-center gap-1 text-[11px] text-red-600 max-w-xs mt-0.5" title={a.last_sync_error}>
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span className="truncate">{a.last_sync_error}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 border-b border-r border-slate-100">
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
                    <td className="px-3.5 py-2.5 text-xs text-slate-500 whitespace-nowrap tabular-nums border-b border-r border-slate-100">{a.last_synced_at ? fmtDateTime(a.last_synced_at) : "Never"}</td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap border-b border-r border-slate-100">
                      {watchActive ? (
                        <Badge variant="outline" className="text-[10px] font-semibold gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 rounded-full px-2 py-0.5">
                          <Wifi className="w-3 h-3" /> Live
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] font-medium gap-1 bg-slate-100 text-slate-500 border-slate-200 rounded-full px-2 py-0.5">
                          <WifiOff className="w-3 h-3" /> Not watching
                        </Badge>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right border-b border-slate-100">
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md border-slate-200 hover:bg-slate-100" disabled={busy === a.id} onClick={() => sync(a)}>
                        {busy === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-slate-600" />}
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {!accounts.length && (
                <tr><td colSpan={6} className="py-12 text-center text-slate-400 text-xs">No mailboxes connected yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          totalItems={accounts.length}
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
