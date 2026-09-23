"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Mail, Paperclip } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DISPOSITION_LABEL, SearchSelect, api, fmtDateTime,
  type AttachmentRow, type CaseRow, type CategoryOption, type Disposition, type EmailDetail, type EmailRow,
} from "./shared"

export function EmailDialog({
  emailId,
  categories,
  onClose,
  // Merges straight into whichever local copy of this email the page is holding (the Needs Review
  // list); no refetch of that list is ever needed for a classification change.
  onEmailChanged,
  // Only called when this reclassification opened a brand-new case — the PATCH route hands back the
  // full row it just built, so the page can add it to its case list with no follow-up fetch.
  onCaseOpened,
  onOpenCase,
}: {
  emailId: string | null
  categories: CategoryOption[]
  onClose: () => void
  onEmailChanged: (id: string, patch: Partial<EmailRow>) => void
  onCaseOpened: (c: CaseRow) => void
  onOpenCase: (caseId: string) => void
}) {
  const [email, setEmail] = useState<EmailDetail | null>(null)
  const [attachments, setAttachments] = useState<AttachmentRow[]>([])
  const [disposition, setDisposition] = useState<Disposition | "">("")
  const [categoryKey, setCategoryKey] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!emailId) return
    setEmail(null)
    api<{ email: EmailDetail; attachments: AttachmentRow[] }>(`/api/email-center/emails/${emailId}`)
      .then((res) => {
        setEmail(res.email)
        setAttachments(res.attachments)
        setDisposition(res.email.disposition ?? "")
        setCategoryKey(res.email.category_key ?? "")
        if (!res.email.is_read) {
          api(`/api/email-center/emails/${emailId}`, { method: "PATCH", body: JSON.stringify({ is_read: true }) })
            .then(() => onEmailChanged(emailId, { is_read: true }))
            .catch(() => {})
        }
      })
      .catch((e) => {
        toast.error(e.message)
        onClose()
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailId])

  const save = async () => {
    if (!email) return
    setSaving(true)
    try {
      const res = await api<{ case_id: string | null; email_patch: Partial<EmailRow>; case: CaseRow | null }>(
        `/api/email-center/emails/${email.id}`,
        { method: "PATCH", body: JSON.stringify({ disposition: disposition || undefined, category_key: categoryKey || undefined }) }
      )
      toast.success("Classification saved.")
      onEmailChanged(email.id, res.email_patch)
      if (res.case) onCaseOpened(res.case)
      if (res.case_id && !email.case_id) onOpenCase(res.case_id)
      else onClose()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!emailId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] p-0 gap-0 border border-slate-200 shadow-xl rounded-xl overflow-hidden bg-white flex flex-col">
        <div className="border-b border-slate-200/80 bg-white px-6 py-4 shrink-0">
          <DialogHeader className="gap-1.5">
            <div className="flex items-center gap-3 pr-8">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-custom-blue/10 text-custom-blue shrink-0">
                <Mail className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold text-slate-900 truncate">{email?.subject || "Email"}</DialogTitle>
                <p className="text-xs text-slate-500 mt-0.5">{email?.case_id ? "Linked to a KRA case" : "Not linked to a case"}</p>
              </div>
            </div>
          </DialogHeader>
        </div>

        {!email ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2 text-custom-blue" /> Loading…
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 bg-slate-50/40 custom-scrollbar">
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 space-y-2 shadow-xs text-xs">
              <p className="text-sm font-semibold text-slate-900">{email.company_name ?? <span className="text-red-500 font-normal">Unassigned company</span>}</p>
              <div className="text-slate-600 space-y-0.5">
                <p>
                  <span className="text-slate-400 font-medium">{email.direction === "outbound" ? "To" : "From"}:</span> {email.sender_name ? `${email.sender_name} <${email.sender_email}>` : email.sender_email}
                </p>
                {email.to_addresses && <p><span className="text-slate-400 font-medium">To:</span> {email.to_addresses}</p>}
                {email.cc_addresses && <p><span className="text-slate-400 font-medium">Cc:</span> {email.cc_addresses}</p>}
              </div>
              <p className="text-[11px] text-slate-400 tabular-nums pt-1 border-t border-slate-100">{fmtDateTime(email.received_at)}{email.kra_pin ? ` · ${email.kra_pin}` : ""}</p>
            </div>

            {email.review_reason && (
              <div className="rounded-xl bg-amber-50/60 border border-amber-200 p-3.5 text-xs text-amber-900 font-medium shadow-xs">
                {email.review_reason}
              </div>
            )}

            {email.ai_summary && email.ai_summary !== email.snippet && (
              <div className="rounded-xl bg-blue-50/60 border border-blue-200/80 p-3.5 shadow-xs">
                <p className="text-[11px] font-bold uppercase tracking-wider text-custom-blue mb-1">AI Summary</p>
                <p className="text-xs text-slate-800 leading-relaxed">{email.ai_summary}</p>
              </div>
            )}

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a) =>
                  a.downloadable ? (
                    <a
                      key={a.index}
                      href={`/api/email-center/emails/${email.id}/attachments/${a.index}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs border border-slate-200 rounded-md px-2.5 py-1 text-custom-blue bg-white hover:bg-slate-50 transition-colors shadow-xs"
                    >
                      <Paperclip className="w-3.5 h-3.5" /> {a.filename}
                    </a>
                  ) : (
                    <span key={a.index} className="inline-flex items-center gap-1.5 text-xs border border-slate-200 rounded-md px-2.5 py-1 text-slate-400 bg-slate-50">
                      <Paperclip className="w-3.5 h-3.5" /> {a.filename} (not stored)
                    </span>
                  )
                )}
              </div>
            )}

            <pre className="rounded-xl border border-slate-200/80 p-4 bg-white text-xs text-slate-700 whitespace-pre-wrap font-sans max-h-72 overflow-y-auto leading-relaxed shadow-xs">
              {email.body || email.snippet || "No preview available."}
            </pre>

            <div className="rounded-xl border border-slate-200/80 bg-white p-4 space-y-3 shadow-xs">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Category</p>
                  <SearchSelect
                    className="w-56"
                    value={categoryKey}
                    onChange={setCategoryKey}
                    placeholder="—"
                    options={[{ value: "", label: "—" }, ...categories.map((c) => ({ value: c.key, label: c.name }))]}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Treat as</p>
                  <SearchSelect
                    className="w-48"
                    value={disposition}
                    onChange={(v) => setDisposition(v as Disposition)}
                    placeholder="—"
                    options={[
                      { value: "", label: "—" },
                      ...(Object.keys(DISPOSITION_LABEL) as Disposition[]).map((d) => ({ value: d, label: DISPOSITION_LABEL[d] })),
                    ]}
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Choosing “Action required” opens a KRA case (a task under KRA ITAX EMAILS).
                The correction is saved with your user id.
              </p>
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 bg-slate-50/80 px-6 py-3 flex items-center justify-end gap-2.5 shrink-0">
          {email?.case_id && (
            <Button variant="outline" size="sm" onClick={() => onOpenCase(email.case_id!)} className="h-8 px-3 text-xs font-medium rounded-md border-slate-200">Open case</Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 px-3 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-md">Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving} className="h-8 px-4 text-xs font-semibold bg-custom-blue hover:bg-custom-blue/90 text-white rounded-md shadow-xs gap-1.5">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
