"use client"

import React, { useState } from "react"
import { toast } from "sonner"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DateInput } from "@/components/ui/date-input"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { dateFieldToIso, formatDateToDMY } from "@/lib/dateUtils"
import { cn } from "@/lib/utils"
import { PRIMARY_PILL_BUTTON_CLASS } from "../../../emails/components/shared"
import { HEAD_NEUTRAL, TD_CLASS, TH_CLASS, TableLoading } from "../../../emails/components/table"
import { DEFAULT_SETTINGS } from "./catalog"
import { fmtKes } from "./calc"
import { deleteRateSettings, saveRateSettings, settingsOn, todayYmd, versionEnd } from "./data"
import type { RateSettings, RateSettingsRow } from "./types"

const pct = (n: number) => `${Math.round(n * 10000) / 100}%`

// Values every rate card and quotation uses, effective-dated like the rates themselves: a quotation
// dated in an earlier period is priced with that period's bank rate / VAT.
export function RateSettingsPanel({ rows, loading, userName }: { rows: RateSettingsRow[] | undefined; loading: boolean; userName: string | null }) {
  const current = settingsOn(rows, todayYmd())
  const [form, setForm] = useState({ date: todayYmd(), usd: "", vat: "", tax: "", round: "", note: "" })
  const [saving, setSaving] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const field = (k: keyof typeof form, placeholder: string) => (
    <Input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder={placeholder} className="h-10 text-base" inputMode="decimal" />
  )

  const submit = async () => {
    const iso = dateFieldToIso(form.date)
    if (!iso || iso === "invalid") return toast.error("Enter a valid effective date.")
    const num = (text: string, fallback: number) => (text.trim() === "" ? fallback : Number(text.replace(/[,%]/g, "")))
    const settings: RateSettings = {
      usd_rate: num(form.usd, current.usd_rate),
      vat_rate: form.vat.trim() === "" ? current.vat_rate : num(form.vat, 0) / 100,
      corp_tax_rate: form.tax.trim() === "" ? current.corp_tax_rate : num(form.tax, 0) / 100,
      round_to: num(form.round, current.round_to),
    }
    if (Object.values(settings).some((v) => !Number.isFinite(v) || v < 0) || settings.corp_tax_rate >= 1) {
      return toast.error("Check the values — they must be positive numbers, and corporation tax below 100%.")
    }
    setSaving(true)
    try {
      await saveRateSettings(iso, settings, form.note.trim(), userName)
      toast.success(`Settings saved, effective ${formatDateToDMY(iso)}`)
      setForm({ date: todayYmd(), usd: "", vat: "", tax: "", round: "", note: "" })
    } catch (e: any) {
      toast.error(e?.message || "Could not save the settings")
    } finally {
      setSaving(false)
    }
  }

  const list = rows || []

  return (
    <div className="p-4 space-y-4 max-w-6xl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Bank rate (KES per USD)", fmtKes(current.usd_rate, true)],
          ["VAT on consultancy", pct(current.vat_rate)],
          ["Corporation tax (eTIMS gross-up)", pct(current.corp_tax_rate)],
          ["Round totals up to", fmtKes(current.round_to)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="text-sm font-medium text-slate-500">{label}</div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-lg font-semibold text-slate-900">New settings version</h3>
        <p className="text-base text-slate-500 mb-3">Leave a field blank to keep today&apos;s value. Saving on a date that already has a version corrects it.</p>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="space-y-1.5"><Label className="text-base">Effective from</Label><DateInput value={form.date} onChange={(date) => setForm((f) => ({ ...f, date }))} className="h-10 text-base" /></div>
          <div className="space-y-1.5"><Label className="text-base">KES per USD</Label>{field("usd", String(current.usd_rate))}</div>
          <div className="space-y-1.5"><Label className="text-base">VAT %</Label>{field("vat", String(current.vat_rate * 100))}</div>
          <div className="space-y-1.5"><Label className="text-base">Corp. tax %</Label>{field("tax", String(current.corp_tax_rate * 100))}</div>
          <div className="space-y-1.5"><Label className="text-base">Round up to</Label>{field("round", String(current.round_to))}</div>
          <Button onClick={submit} disabled={saving} className={PRIMARY_PILL_BUTTON_CLASS}>
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />} Save version
          </Button>
        </div>
        <div className="mt-3">{field("note", "Note (optional)")}</div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              {["Effective", "KES / USD", "VAT", "Corp. tax", "Round up", "Note", "Saved by", ""].map((h) => (
                <th key={h} className={cn(TH_CLASS, HEAD_NEUTRAL)}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoading cols={8} />
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-base text-slate-500">
                  No settings saved yet — the defaults ({DEFAULT_SETTINGS.usd_rate} KES/USD, {pct(DEFAULT_SETTINGS.vat_rate)} VAT, {pct(DEFAULT_SETTINGS.corp_tax_rate)} corporation tax) are used.
                </td>
              </tr>
            ) : (
              list.map((r, i) => {
                const end = versionEnd(list, i)
                return (
                  <tr key={r.id} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                    <td className={cn(TD_CLASS, "whitespace-nowrap")}>
                      <span className="font-semibold">{formatDateToDMY(r.effective_from)}</span>
                      <span className="text-sm text-slate-500"> {end ? `to ${formatDateToDMY(end)}` : "onwards"}</span>
                    </td>
                    <td className={cn(TD_CLASS, "tabular-nums")}>{r.settings.usd_rate}</td>
                    <td className={cn(TD_CLASS, "tabular-nums")}>{pct(r.settings.vat_rate)}</td>
                    <td className={cn(TD_CLASS, "tabular-nums")}>{pct(r.settings.corp_tax_rate)}</td>
                    <td className={cn(TD_CLASS, "tabular-nums")}>{fmtKes(r.settings.round_to)}</td>
                    <td className={cn(TD_CLASS, "text-sm")}>{r.note || "—"}</td>
                    <td className={cn(TD_CLASS, "text-sm")}>{r.created_by_name || "—"}</td>
                    <td className={TD_CLASS}>
                      {confirmId === r.id ? (
                        <Button
                          size="sm"
                          className="h-8 bg-red-600 text-white hover:bg-red-700"
                          onClick={async () => {
                            try { await deleteRateSettings(r.id); toast.success("Version deleted") } catch (e: any) { toast.error(e?.message || "Could not delete") }
                            setConfirmId(null)
                          }}
                        >
                          Confirm
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="h-8 border-red-200 text-red-700 hover:bg-red-50" onClick={() => setConfirmId(r.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
