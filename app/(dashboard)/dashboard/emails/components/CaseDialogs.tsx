"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  CheckCircle2,
  Loader2,
  RotateCcw,
  Building2,
  Send,
  Mail,
  Paperclip,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  User,
  FileSpreadsheet,
  Calendar,
  Briefcase,
  Hash,
  FolderPlus,
  SendHorizontal,
  FileText
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  APPROVAL_LABEL,
  SearchSelect,
  api,
  fmtDate,
  fmtDateTime,
  type ApprovalStatus,
  type CaseRow,
  type CompanyOption,
  type StaffOption,
} from "./shared"

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
  "notice_type", "kra_pin", "deadline_date", "contents", "attachments_summary", "signing_officer_name", "signing_officer_position",
  "respond_date", "respond_contents", "promised_date", "approval_status", "approval_date", "company_id",
  "assigned_to_id",
] as const
type FieldKey = (typeof FIELDS)[number]

/* =========================================================================
   1. CASE DIALOG (View / Edit Existing Case)
   ========================================================================= */
export function CaseDialog({
  caseId,
  companies,
  staff,
  onClose,
  onCaseLoaded,
  onOpenEmail,
}: {
  caseId: string | null
  companies: CompanyOption[]
  staff: StaffOption[]
  onClose: () => void
  onCaseLoaded: (c: CaseRow) => void
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
      onCaseLoaded(res.case)
    } catch (e: any) {
      toast.error(e.message)
      onClose()
    } finally {
      setLoading(false)
    }
  }, [caseId, onClose, onCaseLoaded])

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
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0 gap-0 border-border/80 shadow-2xl">
        {/* Header */}
        <div className="border-b border-border/60 bg-muted/20 px-6 py-4">
          <DialogHeader className="gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
              <DialogTitle className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2.5">
                <FileSpreadsheet className="h-5 w-5 text-blue-600 shrink-0" />
                <span>{row ? `${row.company_name ?? "Unassigned company"} — ${row.notice_type ?? row.subject}` : "KRA Case"}</span>
              </DialogTitle>
              {row && (
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    closed
                      ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${closed ? "bg-slate-400" : "bg-emerald-500 animate-pulse"}`} />
                    {closed ? "Closed" : "Active Case"}
                  </span>
                  <span className="font-mono text-xs px-2 py-0.5 bg-background border border-border/60 rounded text-muted-foreground">
                    {row.case_ref}
                  </span>
                </div>
              )}
            </div>
            {row && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span>Origin:</span>
                <span className="font-medium text-foreground">{row.kra_email_from}</span>
              </p>
            )}
          </DialogHeader>
        </div>

        {(loading || !row) && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-medium">Loading case details…</span>
          </div>
        )}

        {row && !loading && (
          <div className="p-6 space-y-6">
            {/* Subject Banner */}
            <div className="flex items-start gap-3 bg-muted/40 border border-border/50 rounded-xl p-3.5 text-sm text-foreground/90 leading-relaxed">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase text-muted-foreground block mb-0.5">Email Subject</span>
                <span className="font-medium">{row.subject}</span>
              </div>
            </div>

            {/* Task Card: Assignment & Status Action */}
            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3.5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground block">
                      Case Assignee
                    </Label>
                    <SearchSelect
                      className="min-w-[240px] mt-1"
                      value={form.assigned_to_id ?? ""}
                      onChange={(v) => set("assigned_to_id", v)}
                      placeholder="— Unassigned —"
                      options={[{ value: "", label: "— Unassigned —" }, ...staff.map((s) => ({ value: s.id, label: s.name }))]}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {closed ? (
                    <Button variant="outline" size="sm" disabled={saving} onClick={() => patch({ status: "open" }, "Case reopened.")} className="gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5" /> Reopen Case
                    </Button>
                  ) : (
                    <Button size="sm" disabled={saving} onClick={() => patch({ status: "closed" }, "Case marked complete.")} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark Complete
                    </Button>
                  )}
                </div>
              </div>

              {/* Audit Trail */}
              <div className="pt-2.5 border-t border-border/50 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Opened by <strong className="font-medium text-foreground">{row.created_by_name ?? "System"}</strong> on {fmtDate(row.email_date)}</span>
                {row.assigned_to_name && (
                  <>
                    <span>·</span>
                    <span>Assigned to <strong className="font-medium text-foreground">{row.assigned_to_name}</strong>{row.assigned_by_name ? ` by ${row.assigned_by_name}` : ""}{row.assigned_at ? ` (${fmtDateTime(row.assigned_at)})` : ""}</span>
                  </>
                )}
                {closed && row.completed_by_name && (
                  <>
                    <span>·</span>
                    <span>Completed by <strong className="font-medium text-foreground">{row.completed_by_name}</strong> ({fmtDateTime(row.completed_at)})</span>
                  </>
                )}
              </div>
            </div>

            {/* TWO COLUMN WORKSPACE */}
            <div className="grid md:grid-cols-2 gap-6 items-start">
              {/* Left Column: From KRA */}
              <div className="rounded-xl border border-blue-200/70 dark:border-blue-900/40 bg-card p-4 space-y-3.5 shadow-xs">
                <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-md bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
                      <Building2 className="h-3.5 w-3.5" />
                    </span>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                      From KRA Notice
                    </h4>
                  </div>
                </div>

                <Field label="Company">
                  <SearchSelect
                    className="w-full"
                    value={form.company_id ?? ""}
                    onChange={(v) => {
                      set("company_id", v)
                      set("kra_pin", companies.find((c) => c.id === v)?.kra_pin ?? "")
                    }}
                    placeholder="— Unassigned —"
                    options={[{ value: "", label: "— Unassigned —" }, ...companies.map((c) => ({ value: c.id, label: c.company_name }))]}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Notice Type">
                    <Input value={form.notice_type ?? ""} onChange={(e) => set("notice_type", e.target.value)} />
                  </Field>
                  <Field label="KRA PIN">
                    <Input className="font-mono text-xs" value={form.kra_pin ?? ""} onChange={(e) => set("kra_pin", e.target.value)} />
                  </Field>
                </div>

                <Field label="Deadline Date (KRA)">
                  <Input type="date" value={form.deadline_date ?? ""} onChange={(e) => set("deadline_date", e.target.value)} />
                </Field>

                <Field label="Notice Contents / Details">
                  <Textarea rows={3} className="resize-none text-xs leading-relaxed" value={form.contents ?? ""} onChange={(e) => set("contents", e.target.value)} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Signing Officer">
                    <Input value={form.signing_officer_name ?? ""} onChange={(e) => set("signing_officer_name", e.target.value)} />
                  </Field>
                  <Field label="Officer Position">
                    <Input value={form.signing_officer_position ?? ""} onChange={(e) => set("signing_officer_position", e.target.value)} />
                  </Field>
                </div>

                <Field label="Attached Documents Summary">
                  <Input value={form.attachments_summary ?? ""} onChange={(e) => set("attachments_summary", e.target.value)} placeholder="e.g. letter.pdf, assessment.xlsx" />
                </Field>
              </div>

              {/* Right Column: BCL Response */}
              <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-900/40 bg-card p-4 space-y-3.5 shadow-xs">
                <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-md bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                      <Send className="h-3.5 w-3.5" />
                    </span>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      BCL Response & Follow-up
                    </h4>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Respond Date">
                    <Input type="date" value={form.respond_date ?? ""} onChange={(e) => set("respond_date", e.target.value)} />
                  </Field>
                  <Field label="Responded By">
                    <Input disabled className="bg-muted/40" value={row.respond_date ? row.responded_by_name ?? "BCL" : ""} />
                  </Field>
                </div>

                <Field label="Response Contents">
                  <Textarea rows={3} className="resize-none text-xs leading-relaxed" value={form.respond_contents ?? ""} onChange={(e) => set("respond_contents", e.target.value)} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Promised Follow-up Date">
                    <Input type="date" value={form.promised_date ?? ""} onChange={(e) => set("promised_date", e.target.value)} />
                  </Field>
                  <Field label="Approval Date">
                    <Input type="date" value={form.approval_date ?? ""} onChange={(e) => set("approval_date", e.target.value)} />
                  </Field>
                </div>

                <Field label="Approval Status">
                  <SearchSelect
                    className="w-full"
                    value={form.approval_status ?? ""}
                    onChange={(v) => set("approval_status", v)}
                    options={(Object.keys(APPROVAL_LABEL) as ApprovalStatus[]).map((s) => ({ value: s, label: APPROVAL_LABEL[s] }))}
                  />
                </Field>
              </div>
            </div>

            {/* Email Communications List */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span>Thread History ({emails.length})</span>
              </div>
              <div className="space-y-2">
                {emails.map((m) => {
                  const isInbound = m.direction === "inbound"
                  return (
                    <button
                      key={m.id}
                      onClick={() => onOpenEmail(m.id)}
                      className="group w-full flex items-center justify-between gap-4 p-3 rounded-lg border border-border/60 bg-muted/10 hover:bg-muted/30 hover:border-primary/40 transition-all text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${
                          isInbound 
                            ? "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400" 
                            : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                        }`}>
                          {isInbound ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                              {m.subject}
                            </span>
                            {m.has_attachments && <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{m.sender_email}</p>
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {fmtDateTime(m.received_at)}
                      </div>
                    </button>
                  )
                })}
                {!emails.length && (
                  <div className="p-4 rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">
                    No linked email messages recorded for this case.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {row && (
          <div className="border-t border-border/60 bg-muted/20 px-6 py-3.5 flex items-center justify-end gap-2.5">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save Changes
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* =========================================================================
   2. NEW CASE DIALOG (Manual Offline Case Ingestion)
   ========================================================================= */
const NEW_CASE_FORM = {
  company_id: "", notice_type: "", kra_pin: "", subject: "",
  kra_email_from: "", kra_email_cc: "", email_date: "", deadline_date: "",
  contents: "", attachments_summary: "",
  signing_officer_name: "", signing_officer_position: "",
}
type NewCaseFieldKey = keyof typeof NEW_CASE_FORM

export function NewCaseDialog({
  open,
  companies,
  onClose,
  onCreated,
}: {
  open: boolean
  companies: CompanyOption[]
  onClose: () => void
  onCreated: (c: CaseRow) => void
}) {
  const [form, setForm] = useState(NEW_CASE_FORM)
  const [saving, setSaving] = useState(false)

  const set = (k: NewCaseFieldKey, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const reset = () => setForm(NEW_CASE_FORM)

  const handleClose = () => {
    if (saving) return
    reset()
    onClose()
  }

  const create = async () => {
    if (!form.company_id) return toast.error("Please choose a company.")
    if (!form.notice_type.trim() && !form.subject.trim()) return toast.error("Give the case a notice type or subject.")
    setSaving(true)
    try {
      const res = await api<{ case: CaseRow }>("/api/email-center/cases", {
        method: "POST",
        body: JSON.stringify(form),
      })
      toast.success("Case created successfully.")
      onCreated(res.case)
      reset()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-3xl p-0 gap-0 border-border/80 shadow-2xl rounded-2xl overflow-hidden bg-background">
        {/* Header */}
        <div className="border-b border-border/60 bg-muted/30 px-6 py-5">
          <DialogHeader className="gap-1.5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                <FolderPlus className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="text-lg font-semibold tracking-tight">
                  Register Offline KRA Notice
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Record notices received via physical mail, hand delivery, or unlinked inboxes.
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Scrollable Form Body */}
        <div className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-6">
          
          {/* Section 1: Taxpayer & Notice Classification */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 pb-1 border-b border-border/40">
              <Building2 className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Taxpayer & Notice Classification
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-1">
                <Label className="text-xs font-medium">Company <span className="text-destructive">*</span></Label>
                <SearchSelect
                  className="w-full"
                  value={form.company_id}
                  onChange={(v) => {
                    set("company_id", v)
                    set("kra_pin", companies.find((c) => c.id === v)?.kra_pin ?? "")
                  }}
                  placeholder="Select company…"
                  options={companies.map((c) => ({ value: c.id, label: c.company_name }))}
                />
              </div>

              <div className="space-y-1.5 md:col-span-1">
                <Label className="text-xs font-medium">KRA PIN</Label>
                <div className="relative">
                  <Hash className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    className="pl-8 font-mono text-xs tracking-wide"
                    value={form.kra_pin}
                    onChange={(e) => set("kra_pin", e.target.value)}
                    placeholder="P051..."
                  />
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-1">
                <Label className="text-xs font-medium">Notice Type</Label>
                <div className="relative">
                  <FileText className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    className="pl-8 text-xs"
                    value={form.notice_type}
                    onChange={(e) => set("notice_type", e.target.value)}
                    placeholder="e.g. Pre-Assessment Notice"
                  />
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-1">
                <Label className="text-xs font-medium">Subject Line</Label>
                <Input
                  className="text-xs"
                  value={form.subject}
                  onChange={(e) => set("subject", e.target.value)}
                  placeholder="Official notice headline"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Timeline & Origin */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 pb-1 border-b border-border/40">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Dates & Ingestion Details
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Date Received</Label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    type="date"
                    className="pl-8 text-xs"
                    value={form.email_date}
                    onChange={(e) => set("email_date", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center justify-between">
                  <span>KRA Deadline</span>
                  <span className="text-[10px] text-amber-600 font-semibold uppercase">Action Req.</span>
                </Label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-amber-600/70" />
                  <Input
                    type="date"
                    className="pl-8 text-xs font-medium border-amber-200/80 focus-visible:ring-amber-500/20"
                    value={form.deadline_date}
                    onChange={(e) => set("deadline_date", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">KRA Sender Email / Desk</Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    className="pl-8 text-xs"
                    value={form.kra_email_from}
                    onChange={(e) => set("kra_email_from", e.target.value)}
                    placeholder="e.g. itax@kra.go.ke"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">KRA Email CC</Label>
                <div className="relative">
                  <SendHorizontal className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    className="pl-8 text-xs"
                    value={form.kra_email_cc}
                    onChange={(e) => set("kra_email_cc", e.target.value)}
                    placeholder="e.g. supervisor@kra.go.ke"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Content & Authority */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 pb-1 border-b border-border/40">
              <User className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Notice Content & Authority
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs font-medium">Notice Content Summary</Label>
                <Textarea
                  rows={3}
                  className="resize-none text-xs leading-relaxed"
                  value={form.contents}
                  onChange={(e) => set("contents", e.target.value)}
                  placeholder="Key issues, tax periods involved, assessments, demand amounts..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Signing Officer Name</Label>
                <div className="relative">
                  <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    className="pl-8 text-xs"
                    value={form.signing_officer_name}
                    onChange={(e) => set("signing_officer_name", e.target.value)}
                    placeholder="Officer full name"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Officer Position / Department</Label>
                <div className="relative">
                  <Briefcase className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    className="pl-8 text-xs"
                    value={form.signing_officer_position}
                    onChange={(e) => set("signing_officer_position", e.target.value)}
                    placeholder="e.g. Chief Tax Officer"
                  />
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs font-medium">Attached Documents Summary</Label>
                <div className="relative">
                  <Paperclip className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    className="pl-8 text-xs"
                    value={form.attachments_summary}
                    onChange={(e) => set("attachments_summary", e.target.value)}
                    placeholder="e.g. Assessment_Notice.pdf, Appendix_1.xlsx"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border/60 bg-muted/20 px-6 py-4 flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={create} disabled={saving} className="px-5 gap-2 bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Create Case
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}