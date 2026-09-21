"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Loader2, Paperclip, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { NativeSelect } from "./NativeSelect"
import { APPROVAL_LABEL, type ApprovalStatus, type CaseRow, type CompanyOption, type StaffOption } from "./types"
import { api, fmtDate, fmtDateTime } from "./utils"

interface ThreadEmail {
  id: string
  direction: "inbound" | "outbound"
  subject: string
  sender_email: string
  snippet: string | null
  received_at: string
  has_attachments: boolean
}

const FIELDS = [
  "notice_type", "kra_pin", "deadline_date", "contents", "signing_officer_name", "signing_officer_position",
  "respond_date", "respond_contents", "promised_date", "approval_status", "approval_date", "company_id",
  "assigned_to_id",
] as const
type FieldKey = (typeof FIELDS)[number]

export function CaseDialog({
  caseId,
  companies,
  staff,
  onClose,
  onChanged,
  onOpenEmail,
}: {
  caseId: string | null
  companies: CompanyOption[]
  staff: StaffOption[]
  onClose: () => void
  onChanged: () => void
  onOpenEmail: (emailId: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [row, setRow] = useState<CaseRow | null>(null)
  const [form, setForm] = useState<Record<FieldKey, string>>({} as Record<FieldKey, string>)
  const [emails, setEmails] = useState<ThreadEmail[]>([])

  const load = useCallback(async () => {
    if (!caseId) return
    setLoading(true)
    try {
      const res = await api<{ case: CaseRow; emails: ThreadEmail[] }>(`/api/email-center/cases/${caseId}`)
      setRow(res.case)
      setEmails(res.emails)
      setForm(Object.fromEntries(FIELDS.map((f) => [f, (res.case as any)[f] ?? ""])) as Record<FieldKey, string>)
    } catch (e: any) {
      toast.error(e.message)
      onClose()
    } finally {
      setLoading(false)
    }
  }, [caseId, onClose])

  useEffect(() => {
    setRow(null)
    load()
  }, [load])

  const set = (k: FieldKey, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const patch = async (body: Record<string, string | null>, success: string) => {
    if (!row) return
    setSaving(true)
    try {
      await api(`/api/email-center/cases/${row.id}`, { method: "PATCH", body: JSON.stringify(body) })
      toast.success(success)
      await load()
      onChanged()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    if (!row) return
    const changes: Record<string, string | null> = {}
    for (const f of FIELDS) {
      const before = ((row as any)[f] ?? "") as string
      if ((form[f] ?? "") !== before) changes[f] = form[f] === "" ? null : form[f]
    }
    if (!Object.keys(changes).length) return toast.info("Nothing to save.")
    await patch(changes, "Case updated.")
  }

  const closed = row?.status === "closed"

  return (
    <Dialog open={!!caseId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8 leading-snug">
            {row ? `${row.company_name ?? "Unassigned company"} — ${row.notice_type ?? row.subject}` : "KRA case"}
          </DialogTitle>
          {row && (
            <p className="text-xs text-slate-500">
              {row.case_ref} · from {row.kra_email_from}
            </p>
          )}
        </DialogHeader>

        {(loading || !row) && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        )}

        {row && !loading && (
          <div className="space-y-6">
            <p className="text-sm text-slate-600 bg-slate-50 rounded-md p-3">{row.subject}</p>

            {/* Task: assignment + completion (KRA / KRA ITAX EMAILS) */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <Field label="Assigned to">
                  <NativeSelect
                    className="min-w-[220px]"
                    value={form.assigned_to_id ?? ""}
                    onChange={(e) => set("assigned_to_id", e.target.value)}
                  >
                    <option value="">— Unassigned —</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </NativeSelect>
                </Field>
                {closed ? (
                  <Button variant="outline" disabled={saving} onClick={() => patch({ status: "open" }, "Case reopened.")}>
                    <RotateCcw className="w-4 h-4 mr-2" /> Reopen
                  </Button>
                ) : (
                  <Button disabled={saving} onClick={() => patch({ status: "closed" }, "Case marked complete.")}>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Mark complete
                  </Button>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Opened by {row.created_by_name ?? "System (from email)"} on {fmtDate(row.email_date)}
                {row.assigned_to_name && ` · assigned to ${row.assigned_to_name}${row.assigned_by_name ? ` by ${row.assigned_by_name}` : ""}${row.assigned_at ? ` on ${fmtDateTime(row.assigned_at)}` : ""}`}
                {closed && row.completed_by_name && ` · completed by ${row.completed_by_name}${row.completed_at ? ` on ${fmtDateTime(row.completed_at)}` : ""}`}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-700">From KRA</h4>
                <Field label="Company">
                  <NativeSelect className="w-full" value={form.company_id ?? ""} onChange={(e) => set("company_id", e.target.value)}>
                    <option value="">— Unassigned —</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                  </NativeSelect>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Notice type"><Input value={form.notice_type ?? ""} onChange={(e) => set("notice_type", e.target.value)} /></Field>
                  <Field label="KRA PIN"><Input value={form.kra_pin ?? ""} onChange={(e) => set("kra_pin", e.target.value)} /></Field>
                </div>
                <Field label="Deadline date (KRA)"><Input type="date" value={form.deadline_date ?? ""} onChange={(e) => set("deadline_date", e.target.value)} /></Field>
                <Field label="Contents (details)"><Textarea rows={3} value={form.contents ?? ""} onChange={(e) => set("contents", e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Signing officer"><Input value={form.signing_officer_name ?? ""} onChange={(e) => set("signing_officer_name", e.target.value)} /></Field>
                  <Field label="Officer position"><Input value={form.signing_officer_position ?? ""} onChange={(e) => set("signing_officer_position", e.target.value)} /></Field>
                </div>
                {row.attachments_summary && (
                  <p className="text-xs text-slate-500 flex items-center gap-1"><Paperclip className="w-3 h-3" /> {row.attachments_summary}</p>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-700">When BCL responds</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Respond date"><Input type="date" value={form.respond_date ?? ""} onChange={(e) => set("respond_date", e.target.value)} /></Field>
                  <Field label="Responded by"><Input disabled value={row.respond_date ? row.responded_by_name ?? "BCL" : ""} /></Field>
                </div>
                <Field label="Respond contents"><Textarea rows={3} value={form.respond_contents ?? ""} onChange={(e) => set("respond_contents", e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Promised time date"><Input type="date" value={form.promised_date ?? ""} onChange={(e) => set("promised_date", e.target.value)} /></Field>
                  <Field label="Approval date"><Input type="date" value={form.approval_date ?? ""} onChange={(e) => set("approval_date", e.target.value)} /></Field>
                </div>
                <Field label="Approval status">
                  <NativeSelect className="w-full" value={form.approval_status ?? ""} onChange={(e) => set("approval_status", e.target.value)}>
                    {(Object.keys(APPROVAL_LABEL) as ApprovalStatus[]).map((s) => <option key={s} value={s}>{APPROVAL_LABEL[s]}</option>)}
                  </NativeSelect>
                </Field>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Save changes
              </Button>
            </div>

            {/* Emails in this case */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Emails in this case</h4>
              <div className="space-y-1.5">
                {emails.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onOpenEmail(m.id)}
                    className="w-full text-left border rounded-md px-3 py-2 hover:bg-slate-50"
                  >
                    <div className="flex justify-between gap-2 text-[11px] text-slate-500">
                      <span>{m.direction === "outbound" ? "BCL → KRA" : "KRA → BCL"}</span>
                      <span>{fmtDateTime(m.received_at)}</span>
                    </div>
                    <div className="text-sm text-slate-800 truncate">{m.subject}</div>
                  </button>
                ))}
                {!emails.length && <p className="text-xs text-slate-400">None linked.</p>}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-500">{label}</Label>
      {children}
    </div>
  )
}
