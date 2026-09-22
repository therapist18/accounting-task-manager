"use client"

import { useState } from "react"
import { toast } from "sonner"
import { AlertCircle, Loader2, Plus, RefreshCw, Wifi, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { SearchSelect } from "./SearchSelect"
import { PRIMARY_PILL_BUTTON_CLASS } from "./chrome"
import type { AccountRow, CompanyOption } from "./types"
import { api, fmtDateTime } from "./utils"

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl shadow-sm px-5 py-4">
        <div>
          <p className="text-sm font-bold text-slate-800">Connected mailboxes</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Each Gmail mailbox belongs to one company — that link is how incoming KRA emails are matched to a client.
            Connecting several? Google will ask you to pick or sign into the mailbox each time — just repeat "Connect Gmail account" for the next one.
          </p>
        </div>
        <a href="/api/gmail/connect" className="shrink-0">
          <Button className={cn(PRIMARY_PILL_BUTTON_CLASS)} style={{ backgroundColor: "#376bae" }}>
            <Plus className="w-4 h-4" /> Connect Gmail account
          </Button>
        </a>
      </div>

      <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 w-11">#</th>
                <th className="text-left px-4 py-3">Mailbox</th>
                <th className="text-left px-4 py-3 min-w-[240px]">Company</th>
                <th className="text-left px-4 py-3">Last sync</th>
                <th className="text-left px-4 py-3">Push</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map((a, index) => {
                const watchActive = a.watch_expiry ? new Date(a.watch_expiry).getTime() > Date.now() : false
                return (
                  <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 text-center text-slate-400 tabular-nums">{index + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{a.email}</div>
                      {a.last_sync_error && (
                        <div className="flex items-center gap-1 text-[11px] text-red-600 max-w-xs mt-0.5" title={a.last_sync_error}>
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span className="truncate">{a.last_sync_error}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{a.last_synced_at ? fmtDateTime(a.last_synced_at) : "Never"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {watchActive ? (
                        <Badge variant="outline" className="text-[10px] font-bold gap-1 bg-emerald-50 text-emerald-700 border-emerald-200">
                          <Wifi className="w-3 h-3" /> Live
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] font-bold gap-1 bg-slate-100 text-slate-500 border-slate-200">
                          <WifiOff className="w-3 h-3" /> Not watching
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-full" disabled={busy === a.id} onClick={() => sync(a)}>
                        {busy === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {!accounts.length && (
                <tr><td colSpan={6} className="py-12 text-center text-slate-400 text-sm">No mailboxes connected yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
