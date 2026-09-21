"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "./NativeSelect"
import type { AccountRow, CompanyOption } from "./types"
import { api, fmtDateTime } from "./utils"

export function MailboxesPanel({
  accounts,
  companies,
  onChanged,
}: {
  accounts: AccountRow[]
  companies: CompanyOption[]
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  const assign = async (a: AccountRow, companyId: string) => {
    setBusy(a.id)
    try {
      await api(`/api/email-center/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ company_id: companyId || null }) })
      toast.success(`${a.email} linked.`)
      onChanged()
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
      onChanged()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Each Gmail mailbox belongs to one company — that link is how incoming KRA emails are matched to a company.
        </p>
        <a href="/api/gmail/connect">
          <Button size="sm" className="gap-1"><Plus className="w-4 h-4" /> Connect Gmail account</Button>
        </a>
      </div>

      <div className="border rounded-lg bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Mailbox</th>
              <th className="text-left px-3 py-2 min-w-[260px]">Company</th>
              <th className="text-left px-3 py-2">Last sync</th>
              <th className="text-left px-3 py-2">Push watch expires</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accounts.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">{a.email}</div>
                  {a.last_sync_error && <div className="text-[11px] text-red-600 max-w-xs truncate" title={a.last_sync_error}>{a.last_sync_error}</div>}
                </td>
                <td className="px-3 py-2">
                  <NativeSelect
                    className={a.company_id ? "w-full" : "w-full border-red-300"}
                    value={a.company_id ?? ""}
                    disabled={busy === a.id}
                    onChange={(e) => assign(a, e.target.value)}
                  >
                    <option value="">— Not linked —</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                  </NativeSelect>
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{a.last_synced_at ? fmtDateTime(a.last_synced_at) : "Never"}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{a.watch_expiry ? fmtDateTime(a.watch_expiry) : "Not watching"}</td>
                <td className="px-3 py-2 text-right">
                  <Button variant="outline" size="sm" disabled={busy === a.id} onClick={() => sync(a)}>
                    {busy === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </Button>
                </td>
              </tr>
            ))}
            {!accounts.length && (
              <tr><td colSpan={5} className="py-10 text-center text-slate-400">No mailboxes connected yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
