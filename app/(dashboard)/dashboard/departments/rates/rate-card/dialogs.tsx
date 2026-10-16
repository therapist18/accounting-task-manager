"use client"

import React, { useEffect, useState } from "react"
import { History, Loader2, Pencil, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DateInput } from "@/components/ui/date-input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { dateFieldToIso, formatDateToDMY } from "@/lib/dateUtils"
import { cn } from "@/lib/utils"
import { PILL_BUTTON_CLASS, PRIMARY_PILL_BUTTON_CLASS } from "../../../emails/components/shared"
import { TD_CLASS, TH_CLASS, HEAD_NEUTRAL } from "../../../emails/components/table"
import { normalizeImmigrationRates, normalizeJobRates } from "./catalog"
import { fmtKes, immigrationBreakdown, jobBreakdown } from "./calc"
import { settingsOn, todayYmd, versionEnd } from "./data"
import type { JobLevel, RateCardRow, RateSettingsRow } from "./types"

export function SaveRatesDialog({
  open, onOpenChange, count, defaultDate, onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  defaultDate: string
  onSave: (effectiveFrom: string, note: string) => Promise<void>
}) {
  const [date, setDate] = useState(defaultDate)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDate(defaultDate)
      setNote("")
      setError(null)
    }
  }, [open, defaultDate])

  const submit = async () => {
    const iso = dateFieldToIso(date)
    if (!iso || iso === "invalid") {
      setError("Enter a valid effective date (DD/MM/YYYY).")
      return
    }
    setSaving(true)
    try {
      await onSave(iso, note.trim())
      onOpenChange(false)
    } catch (e: any) {
      setError(e?.message || "Could not save the rates.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Save {count} changed rate{count === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription className="text-base">
            Only the job levels you edited get a new version. Everything else keeps the rate it already has. A job level that already has a version starting on this date has that version corrected instead.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-base">Effective from</Label>
            <DateInput value={date} onChange={setDate} className="h-10 text-base" />
            <p className="text-sm text-slate-500">The previous rate stays in force until the day before.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-base">Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2027 rate review" className="text-base" rows={2} />
          </div>
          {error && <p className="text-base text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className={PILL_BUTTON_CLASS}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className={PRIMARY_PILL_BUTTON_CLASS}>
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            Save rates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RateHistoryDialog({
  level, versions, settingsRows, onClose, onLoad, onDelete,
}: {
  level: JobLevel | null
  versions: RateCardRow[]
  settingsRows: RateSettingsRow[] | undefined
  onClose: () => void
  /** Put a version's values into the editor (to base a new version on it). */
  onLoad: (version: RateCardRow) => void
  onDelete: (version: RateCardRow) => Promise<void>
}) {
  const [deleting, setDeleting] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const today = todayYmd()

  const summary = (v: RateCardRow) => {
    const s = settingsOn(settingsRows, v.effective_from)
    if (v.card_type === "immigration") {
      const b = immigrationBreakdown(normalizeImmigrationRates(v.rates as any), s)
      return [
        ["Official", fmtKes(b.official)],
        ["Facilitation", fmtKes(b.facilitationNet)],
        ["Extra + Help", fmtKes(b.extras + b.help)],
        ["Final", fmtKes(b.rounded)],
      ]
    }
    const b = jobBreakdown(normalizeJobRates(v.rates as any), s)
    return [
      ["Official", fmtKes(b.official)],
      ["Consultancy", fmtKes(b.consultancy)],
      ["Round-up", fmtKes(b.rounded)],
      ["eTIMS total", fmtKes(b.etimsTotal, true)],
    ]
  }

  return (
    <Dialog open={!!level} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <History className="h-5 w-5 text-custom-blue" /> Rate history
          </DialogTitle>
          <DialogDescription className="text-base">
            {level ? `${level.departmentName} → ${level.path}` : ""}. Each version applies from its date until the next version starts.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-auto rounded-md border border-slate-200">
          {versions.length === 0 ? (
            <div className="px-6 py-10 text-center text-base text-slate-500">No saved rates for this job level yet.</div>
          ) : (
            <table className="w-full border-separate border-spacing-0 text-left">
              <thead className="sticky top-0">
                <tr>
                  {["Effective", "Figures (KES)", "Note", "Saved by", ""].map((h) => (
                    <th key={h} className={cn(TH_CLASS, HEAD_NEUTRAL, "text-sm")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {versions.map((v, i) => {
                  const end = versionEnd(versions, i)
                  const current = v.effective_from <= today && (!end || end >= today)
                  return (
                    <tr key={v.id} className={current ? "bg-blue-50/60" : i % 2 ? "bg-slate-50" : "bg-white"}>
                      <td className={cn(TD_CLASS, "whitespace-nowrap")}>
                        <div className="font-semibold text-slate-900">{formatDateToDMY(v.effective_from)}</div>
                        <div className="text-sm text-slate-500">{end ? `to ${formatDateToDMY(end)}` : "onwards"}</div>
                        {current && <span className="mt-1 inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 text-xs font-semibold text-custom-blue">In force today</span>}
                        {v.effective_from > today && <span className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 text-xs font-semibold text-amber-700">Upcoming</span>}
                      </td>
                      <td className={TD_CLASS}>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
                          {summary(v).map(([k, val]) => (
                            <React.Fragment key={k}>
                              <span className="text-slate-500">{k}</span>
                              <span className="text-right font-medium tabular-nums text-slate-800">{val}</span>
                            </React.Fragment>
                          ))}
                        </div>
                      </td>
                      <td className={cn(TD_CLASS, "text-sm max-w-[220px]")}>{v.note || <span className="text-slate-300">—</span>}</td>
                      <td className={cn(TD_CLASS, "text-sm whitespace-nowrap")}>
                        <div>{v.updated_by_name || v.created_by_name || "—"}</div>
                        <div className="text-slate-500">{formatDateToDMY(v.updated_at)}</div>
                      </td>
                      <td className={cn(TD_CLASS, "whitespace-nowrap")}>
                        <div className="flex items-center gap-1.5">
                          <Button variant="outline" size="sm" className="h-8 gap-1.5 border-slate-200 text-sm" onClick={() => onLoad(v)} title="Put these values in the editor; save to create or correct a version">
                            <Pencil className="h-3.5 w-3.5" /> Edit from this
                          </Button>
                          {confirmId === v.id ? (
                            <Button
                              size="sm"
                              className="h-8 gap-1.5 bg-red-600 text-sm text-white hover:bg-red-700"
                              disabled={deleting === v.id}
                              onClick={async () => {
                                setDeleting(v.id)
                                try { await onDelete(v) } finally { setDeleting(null); setConfirmId(null) }
                              }}
                            >
                              {deleting === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Confirm
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" className="h-8 border-red-200 text-red-700 hover:bg-red-50" onClick={() => setConfirmId(v.id)} title="Delete this version; the previous one then runs on">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
