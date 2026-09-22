"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Paperclip } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SearchSelect } from "./SearchSelect"
import {
  DISPOSITION_LABEL,
  type AttachmentRow,
  type CaseRow,
  type CategoryOption,
  type Disposition,
  type EmailDetail,
  type EmailRow,
} from "./types"
import { api, fmtDateTime } from "./utils"

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
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="pr-8 text-base leading-snug">{email?.subject || "Email"}</DialogTitle>
        </DialogHeader>

        {!email ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="flex flex-col gap-4 overflow-y-auto">
            <div className="text-sm">
              <p className="font-medium text-slate-800">{email.company_name ?? "Unassigned company"}</p>
              <p className="text-slate-600">
                {email.direction === "outbound" ? "To" : "From"}: {email.sender_name ? `${email.sender_name} <${email.sender_email}>` : email.sender_email}
              </p>
              {email.to_addresses && <p className="text-xs text-slate-400">To: {email.to_addresses}</p>}
              {email.cc_addresses && <p className="text-xs text-slate-400">Cc: {email.cc_addresses}</p>}
              <p className="text-xs text-slate-400">{fmtDateTime(email.received_at)}{email.kra_pin ? ` · ${email.kra_pin}` : ""}</p>
            </div>

            {email.review_reason && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
                {email.review_reason}
              </div>
            )}

            {email.ai_summary && email.ai_summary !== email.snippet && (
              <div className="bg-blue-50 border border-blue-100 rounded-md p-3">
                <p className="text-xs font-semibold text-blue-700 mb-1">Summary</p>
                <p className="text-sm text-blue-900">{email.ai_summary}</p>
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
                      className="inline-flex items-center gap-1 text-xs border rounded-md px-2 py-1 text-blue-700 hover:bg-blue-50"
                    >
                      <Paperclip className="w-3 h-3" /> {a.filename}
                    </a>
                  ) : (
                    <span key={a.index} className="inline-flex items-center gap-1 text-xs border rounded-md px-2 py-1 text-slate-400">
                      <Paperclip className="w-3 h-3" /> {a.filename} (not stored)
                    </span>
                  )
                )}
              </div>
            )}

            <pre className="border rounded-md p-3 bg-white text-sm text-slate-700 whitespace-pre-wrap font-sans max-h-72 overflow-y-auto">
              {email.body || email.snippet || "No preview available."}
            </pre>

            <div className="flex flex-wrap items-end gap-3 border-t pt-3">
              <div className="space-y-1">
                <p className="text-xs text-slate-500">Category</p>
                <SearchSelect
                  className="w-56"
                  value={categoryKey}
                  onChange={setCategoryKey}
                  placeholder="—"
                  options={[{ value: "", label: "—" }, ...categories.map((c) => ({ value: c.key, label: c.name }))]}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-slate-500">Treat as</p>
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
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Save
              </Button>
              {email.case_id && (
                <Button variant="outline" onClick={() => onOpenCase(email.case_id!)}>Open case</Button>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Choosing “Action required” opens a KRA case (a task under KRA ITAX EMAILS).
              The correction is saved with your user id.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
