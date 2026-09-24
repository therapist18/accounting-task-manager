"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  FileSpreadsheet,
  FolderPlus,
  Loader2,
  Mail,
  Paperclip,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DateInput } from "@/components/ui/date-input"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { dateFieldToIso } from "@/lib/dateUtils"
import { useCurrentUser } from "@/lib/hooks/use-current-user"
import {
  APPROVAL_BADGE,
  APPROVAL_LABEL,
  COUNT_BADGE_CLASS,
  SearchSelect,
  TAB_LIST_CLASS,
  TAB_TRIGGER_CLASS,
  api,
  avatarTone,
  daysBetween,
  fmtDate,
  fmtDateTime,
  initials,
  senderName,
  todayYmd,
  type ApprovalStatus,
  type CaseRow,
  type CompanyOption,
  type EmailRow,
  type StaffOption,
} from "./shared"

// BCL staff list for the Case Assignee dropdown, served by /api/auth/users/company10 (the same
// endpoint Passport Endorsement / Immigration use for "Handled by" — internal staff only, which is
// exactly who a KRA case gets assigned to). Module-cached so the dialog only fetches it once per
// page lifetime instead of on every open.
type CompanyUser = { id: string; displayName: string; companyIds: number[]; primaryCompanyId: number | null }

let company10Promise: Promise<StaffOption[]> | null = null
function fetchCompany10Users(): Promise<StaffOption[]> {
  company10Promise ??= api<{ data: CompanyUser[] }>("/api/auth/users/company10")
    .then((r) => r.data.map((u) => ({ id: u.id, name: u.displayName })))
    .catch((e) => {
      company10Promise = null
      throw e
    })
  return company10Promise
}

const FIELDS = [
  "notice_type", "kra_pin", "deadline_date", "contents", "attachments_summary", "signing_officer_name", "signing_officer_position",
  "respond_date", "respond_contents", "promised_date", "approval_status", "approval_date", "company_id",
  "assigned_to_id", "responded_by_id",
] as const
type FieldKey = (typeof FIELDS)[number]

// Date columns are shown/typed as DD/MM/YYYY (DateInput) but stored and sent as YYYY-MM-DD; these are
// compared and saved through dateFieldToIso so a half-typed date can never silently clear a field.
const DATE_FIELD_LABELS: Partial<Record<FieldKey, string>> = {
  deadline_date: "Deadline date",
  respond_date: "Respond date",
  promised_date: "Promised follow-up date",
  approval_date: "Approval date",
}
const isDateField = (f: FieldKey) => f in DATE_FIELD_LABELS
const comparable = (f: FieldKey, v: string) => (isDateField(f) ? dateFieldToIso(v) : v)

const formFromRow = (row: CaseRow) =>
  Object.fromEntries(FIELDS.map((f) => [f, isDateField(f) ? String((row as any)[f] ?? "").slice(0, 10) : (row as any)[f] ?? ""])) as Record<FieldKey, string>

const INPUT = "h-10 text-base rounded-md border-slate-200 bg-white"
const INPUT_DISABLED = "disabled:opacity-100 disabled:bg-slate-100 disabled:text-slate-700 disabled:cursor-not-allowed"
const TEXTAREA = "resize-none text-base rounded-md border-slate-200 bg-white leading-relaxed"

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm font-medium text-slate-600">{label}</Label>
      {children}
      {hint && <p className="text-sm text-slate-400">{hint}</p>}
    </div>
  )
}

/* =========================================================================
   1. CASE DIALOG (View / Edit Existing Case)
   =========================================================================
   Opens instantly from the case row the table already holds. The only request it makes is one
   background call for what a list row can't carry: the thread's emails (already in the same shape as
   the email list, so opening one needs no request for its details) and the audit names. */
export function CaseDialog({
  caseId,
  initialCase,
  companies,
  staff,
  onClose,
  onCaseLoaded,
  onOpenEmail,
}: {
  caseId: string | null
  initialCase: CaseRow | null
  companies: CompanyOption[]
  staff: StaffOption[]
  onClose: () => void
  onCaseLoaded: (c: CaseRow) => void
  onOpenEmail: (email: EmailRow) => void
}) {
  const [saving, setSaving] = useState(false)
  const [row, setRow] = useState<CaseRow | null>(null)
  const [form, setForm] = useState<Record<FieldKey, string>>({} as Record<FieldKey, string>)
  const [emails, setEmails] = useState<EmailRow[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [company10, setCompany10] = useState<StaffOption[]>([])
  const [tab, setTab] = useState("notice")
  // "Responded by" is audit data the server fills in; only a SuperAdmin may override it.
  const { user } = useCurrentUser()
  const isSuperAdmin = !!user?.isSuperAdmin

  const initialRef = useRef(initialCase)
  initialRef.current = initialCase

  // While closing (caseId null) the last case stays on screen for the exit animation; while switching to
  // another case, hide the previous one until the new row is seeded.
  const shown = row && (!caseId || row.id === caseId) ? row : null

  // Populate the Case Assignee dropdown from the BCL staff endpoint on first open; falls back to
  // the page-level staff list (overview) until that resolves or if it fails.
  useEffect(() => {
    if (!caseId) return
    let alive = true
    fetchCompany10Users()
      .then((users) => { if (alive) setCompany10(users) })
      .catch(() => {})
    return () => { alive = false }
  }, [caseId])

  // `resetForm` is false for the background enrich on open, so it never overwrites what the user has
  // already started typing; it's true after a save/complete, when the form should mirror the server.
  const load = useCallback(async (resetForm: boolean) => {
    if (!caseId) return
    try {
      const res = await api<{ case: CaseRow; emails: EmailRow[] }>(`/api/email-center/cases/${caseId}`)
      setRow(res.case)
      setEmails(res.emails)
      if (resetForm) setForm(formFromRow(res.case))
      onCaseLoaded(res.case)
    } catch (e: any) {
      toast.error(e.message)
      if (!initialRef.current) onClose()
    } finally {
      setThreadLoading(false)
    }
  }, [caseId, onClose, onCaseLoaded])

  useEffect(() => {
    if (!caseId) return
    const seed = initialRef.current
    setTab("notice")
    setEmails([])
    setThreadLoading(true)
    setRow(seed)
    if (seed) setForm(formFromRow(seed))
    load(!seed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  const set = (k: FieldKey, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const patch = async (body: Record<string, string | null>, success: string) => {
    if (!row) return
    setSaving(true)
    try {
      await api(`/api/email-center/cases/${row.id}`, { method: "PATCH", body: JSON.stringify(body) })
      toast.success(success)
      await load(true)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const dirtyFields = row
    ? FIELDS.filter((f) => comparable(f, form[f] ?? "") !== String(formFromRow(row)[f] ?? ""))
    : []
  const dirty = dirtyFields.length > 0

  const save = async () => {
    if (!row || !dirty) return
    const changes: Record<string, string | null> = {}
    for (const f of dirtyFields) {
      if (isDateField(f)) {
        const iso = dateFieldToIso(form[f])
        if (iso === "invalid") return toast.error(`${DATE_FIELD_LABELS[f]} isn't a valid date — use DD/MM/YYYY.`)
        changes[f] = iso || null
      } else {
        changes[f] = form[f] === "" ? null : form[f]
      }
    }
    await patch(changes, "Case updated.")
  }

  const closed = shown?.status === "closed"
  const deadlineDays = shown?.deadline_date ? daysBetween(todayYmd(), shown.deadline_date) : null
  const assignees = company10.length ? company10 : staff

  return (
    <Dialog open={!!caseId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl w-[96vw] h-[90vh] p-0 gap-0 rounded-2xl border border-slate-200 shadow-xl overflow-hidden bg-white flex flex-col">
        <DialogDescription className="sr-only">KRA tax notice tracking, communication records and response workflow.</DialogDescription>

        {/* Header */}
        <div className="flex items-center gap-4 border-b border-slate-200 bg-white pl-6 pr-14 py-4 shrink-0">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-custom-blue/10 text-custom-blue shrink-0">
            <FileSpreadsheet className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900 truncate">
              {shown ? `${shown.company_name ?? "Unassigned company"} — ${shown.notice_type ?? shown.subject ?? "Case"}` : "KRA case"}
            </DialogTitle>
            {shown && (
              <p className="text-base text-slate-500 mt-0.5">
                <span className="font-mono">{shown.case_ref}</span>
                {shown.kra_pin && <> · PIN <span className="font-mono">{shown.kra_pin}</span></>}
                {shown.email_date && <> · received {fmtDate(shown.email_date)}</>}
              </p>
            )}
          </div>
          {shown && (
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full border", APPROVAL_BADGE[shown.approval_status])}>
                {APPROVAL_LABEL[shown.approval_status]}
              </span>
              <span className={cn(
                "inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full border",
                closed ? "bg-slate-100 text-slate-700 border-slate-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
              )}>
                <span className={cn("h-2 w-2 rounded-full", closed ? "bg-slate-400" : "bg-emerald-500")} />
                {closed ? "Closed" : "Active"}
              </span>
            </div>
          )}
        </div>

        {/* Key facts */}
        {shown && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 px-6 py-3.5 bg-slate-50 border-b border-slate-200 shrink-0">
            <div className="min-w-0">
              <p className="text-sm text-slate-500">Client</p>
              <p className="text-base font-semibold text-slate-900 truncate">{shown.company_name ?? <span className="text-red-500">Unassigned</span>}</p>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-slate-500">KRA sender</p>
              <p className="text-base font-medium text-slate-800 truncate" title={shown.kra_email_from ?? ""}>{shown.kra_email_from || "—"}</p>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-slate-500">Deadline</p>
              <p className="text-base font-semibold tabular-nums flex items-center gap-2">
                <span className={deadlineDays !== null && deadlineDays < 0 && !closed ? "text-red-600" : "text-slate-900"}>{shown.deadline_date ? fmtDate(shown.deadline_date) : "—"}</span>
                {deadlineDays !== null && !closed && (
                  <span className={cn(
                    "text-sm font-semibold px-2 py-0.5 rounded-full border",
                    deadlineDays < 0 ? "bg-red-50 text-red-700 border-red-200" : deadlineDays <= 7 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  )}>
                    {deadlineDays < 0 ? `${-deadlineDays}d overdue` : deadlineDays === 0 ? "Due today" : `${deadlineDays}d left`}
                  </span>
                )}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-slate-500">Subject</p>
              <p className="text-base font-medium text-slate-800 truncate" title={shown.subject ?? ""}>{shown.subject || "—"}</p>
            </div>
          </div>
        )}

        {!shown ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-custom-blue" />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
            {/* Main: tabs */}
            <Tabs value={tab} onValueChange={setTab} className="flex-1 min-w-0 min-h-0 flex flex-col">
              <div className="px-6 pt-4 shrink-0">
                <TabsList className={TAB_LIST_CLASS}>
                  <TabsTrigger value="notice" className={TAB_TRIGGER_CLASS}>Notice from KRA</TabsTrigger>
                  <TabsTrigger value="response" className={TAB_TRIGGER_CLASS}>BCL response</TabsTrigger>
                  <TabsTrigger value="thread" className={TAB_TRIGGER_CLASS}>
                    Email thread
                    {emails.length > 0 && <span className={COUNT_BADGE_CLASS}>{emails.length}</span>}
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-5">
                <TabsContent value="notice" className="mt-0">
                  <div className="grid md:grid-cols-2 gap-x-6 gap-y-5">
                    <Field label="Company" className="md:col-span-2">
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
                    <Field label="Notice type">
                      <Input className={INPUT} value={form.notice_type ?? ""} onChange={(e) => set("notice_type", e.target.value)} />
                    </Field>
                    <Field label="KRA PIN">
                      <Input className={cn(INPUT, "font-mono")} value={form.kra_pin ?? ""} onChange={(e) => set("kra_pin", e.target.value)} />
                    </Field>
                    <Field label="Deadline date (KRA)">
                      <DateInput className={INPUT} value={form.deadline_date ?? ""} onChange={(v) => set("deadline_date", v)} />
                    </Field>
                    <Field label="Attached documents">
                      <Input className={INPUT} value={form.attachments_summary ?? ""} onChange={(e) => set("attachments_summary", e.target.value)} placeholder="e.g. letter.pdf, assessment.xlsx" />
                    </Field>
                    <Field label="Signing officer">
                      <Input className={INPUT} value={form.signing_officer_name ?? ""} onChange={(e) => set("signing_officer_name", e.target.value)} />
                    </Field>
                    <Field label="Officer position">
                      <Input className={INPUT} value={form.signing_officer_position ?? ""} onChange={(e) => set("signing_officer_position", e.target.value)} />
                    </Field>
                    <Field label="What KRA is asking for" hint="Periods, taxes, records — a short summary of the notice." className="md:col-span-2">
                      <Textarea rows={5} className={TEXTAREA} value={form.contents ?? ""} onChange={(e) => set("contents", e.target.value)} />
                    </Field>
                  </div>
                </TabsContent>

                <TabsContent value="response" className="mt-0">
                  <div className="grid md:grid-cols-2 gap-x-6 gap-y-5">
                    <Field label="Respond date">
                      <DateInput className={INPUT} value={form.respond_date ?? ""} onChange={(v) => set("respond_date", v)} />
                    </Field>
                    <Field
                      label="Responded by"
                      hint={isSuperAdmin ? "Only a SuperAdmin can change who is recorded as the responder." : "Recorded automatically when the respond date is first saved."}
                    >
                      {isSuperAdmin ? (
                        <SearchSelect
                          className="w-full"
                          value={form.responded_by_id ?? ""}
                          onChange={(v) => set("responded_by_id", v)}
                          placeholder="— Not recorded —"
                          options={[{ value: "", label: "— Not recorded —" }, ...assignees.map((u) => ({ value: u.id, label: u.name }))]}
                        />
                      ) : (
                        <Input disabled className={cn(INPUT, INPUT_DISABLED)} value={row?.respond_date ? row.responded_by_name ?? "BCL" : ""} placeholder="Not responded yet" />
                      )}
                    </Field>
                    <Field label="Response contents" className="md:col-span-2">
                      <Textarea rows={5} className={TEXTAREA} value={form.respond_contents ?? ""} onChange={(e) => set("respond_contents", e.target.value)} />
                    </Field>
                    <Field label="Promised follow-up date">
                      <DateInput className={INPUT} value={form.promised_date ?? ""} onChange={(v) => set("promised_date", v)} />
                    </Field>
                    <Field label="Approval status">
                      <SearchSelect
                        className="w-full"
                        value={form.approval_status ?? ""}
                        onChange={(v) => set("approval_status", v)}
                        options={(Object.keys(APPROVAL_LABEL) as ApprovalStatus[]).map((s) => ({ value: s, label: APPROVAL_LABEL[s] }))}
                      />
                    </Field>
                    <Field label="Approval date">
                      <DateInput className={INPUT} value={form.approval_date ?? ""} onChange={(v) => set("approval_date", v)} />
                    </Field>
                  </div>
                </TabsContent>

                <TabsContent value="thread" className="mt-0">
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden bg-white">
                    {threadLoading && emails.length === 0 && Array.from({ length: 3 }, (_, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                        <div className="h-10 w-10 rounded-full bg-slate-200/80 animate-pulse shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3.5 w-1/3 rounded bg-slate-200/80 animate-pulse" />
                          <div className="h-3.5 w-2/3 rounded bg-slate-200/60 animate-pulse" />
                        </div>
                      </div>
                    ))}
                    {emails.map((m) => {
                      const name = senderName(m)
                      const inbound = m.direction === "inbound"
                      return (
                        <button
                          key={m.id}
                          onClick={() => onOpenEmail(m)}
                          className="group w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
                        >
                          <span className={cn("h-10 w-10 rounded-full text-white flex items-center justify-center text-base font-semibold shrink-0", avatarTone(m.sender_email))}>
                            {initials(name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={cn("text-base truncate", m.is_read ? "font-medium text-slate-800" : "font-bold text-slate-900")}>{name}</span>
                              <span className={cn("inline-flex items-center gap-0.5 text-sm shrink-0", inbound ? "text-custom-blue" : "text-emerald-600")}>
                                {inbound ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                                {inbound ? "Received" : "Sent"}
                              </span>
                              {m.has_attachments && <Paperclip className="h-4 w-4 text-slate-400 shrink-0" />}
                            </div>
                            <p className="text-base text-slate-700 truncate group-hover:text-custom-blue transition-colors">{m.subject}</p>
                            {m.snippet && <p className="text-sm text-slate-400 truncate">{m.snippet}</p>}
                          </div>
                          <span className="text-sm text-slate-500 whitespace-nowrap shrink-0 tabular-nums">{fmtDateTime(m.received_at, true)}</span>
                        </button>
                      )
                    })}
                    {!threadLoading && emails.length === 0 && (
                      <div className="py-12 text-center text-base text-slate-400">
                        <Mail className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                        No email messages are linked to this case.
                      </div>
                    )}
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            {/* Aside: assignment, status, history */}
            <aside className="lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-50 overflow-y-auto custom-scrollbar p-5 space-y-6">
              <section className="space-y-3">
                <h3 className="text-base font-semibold text-slate-800">Assignment</h3>
                <Field label="Case assignee">
                  <SearchSelect
                    className="w-full"
                    value={form.assigned_to_id ?? ""}
                    onChange={(v) => set("assigned_to_id", v)}
                    placeholder="— Unassigned —"
                    options={[{ value: "", label: "— Unassigned —" }, ...assignees.map((s) => ({ value: s.id, label: s.name }))]}
                  />
                </Field>
                {closed ? (
                  <Button variant="outline" disabled={saving} onClick={() => patch({ status: "open" }, "Case reopened.")} className="w-full h-10 gap-2 rounded-md border-slate-300 bg-white text-base font-medium">
                    <RotateCcw className="w-5 h-5" /> Reopen case
                  </Button>
                ) : (
                  <Button disabled={saving} onClick={() => patch({ status: "closed" }, "Case marked complete.")} className="w-full h-10 gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-base font-semibold shadow-xs">
                    <CheckCircle2 className="w-5 h-5" /> Mark complete
                  </Button>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-base font-semibold text-slate-800">History</h3>
                <ol className="relative border-l border-slate-300 ml-1.5 space-y-4 text-base">
                  <HistoryItem tone="blue" title="Case opened" detail={`${shown.created_by_name ?? (shown.created_by_id ? "Staff" : "System (from email)")} · ${fmtDate(shown.email_date)}`} />
                  {shown.assigned_to_name && (
                    <HistoryItem
                      tone="blue"
                      title={`Assigned to ${shown.assigned_to_name}`}
                      detail={`${shown.assigned_by_name ? `by ${shown.assigned_by_name} · ` : ""}${fmtDateTime(shown.assigned_at, true)}`}
                    />
                  )}
                  {shown.respond_date && (
                    <HistoryItem tone="emerald" title="Response sent to KRA" detail={`${shown.responded_by_name ?? "BCL"} · ${fmtDate(shown.respond_date)}`} />
                  )}
                  {closed && shown.completed_at && (
                    <HistoryItem tone="slate" title="Completed" detail={`${shown.completed_by_name ?? "Staff"} · ${fmtDateTime(shown.completed_at, true)}`} />
                  )}
                </ol>
              </section>
            </aside>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-200 bg-white px-6 py-3.5 flex items-center gap-3 shrink-0">
          {dirty && <span className="text-sm text-amber-700 font-medium">{dirtyFields.length} unsaved change{dirtyFields.length === 1 ? "" : "s"}</span>}
          <div className="ml-auto flex items-center gap-2.5">
            <Button variant="ghost" size="sm" onClick={onClose} className="h-11 px-5 text-base font-medium text-slate-600 hover:text-slate-900 rounded-lg">Close</Button>
            <Button size="sm" onClick={save} disabled={saving || !dirty} className="h-11 px-6 text-base font-semibold bg-custom-blue hover:bg-custom-blue/90 text-white rounded-lg shadow-xs gap-2">
              {saving && <Loader2 className="w-5 h-5 animate-spin" />}
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function HistoryItem({ tone, title, detail }: { tone: "blue" | "emerald" | "slate"; title: string; detail: string }) {
  const dot = tone === "blue" ? "bg-custom-blue" : tone === "emerald" ? "bg-emerald-500" : "bg-slate-500"
  return (
    <li className="ml-4">
      <span className={cn("absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-slate-50", dot)} />
      <p className="font-medium text-slate-800 leading-snug">{title}</p>
      <p className="text-sm text-slate-500">{detail}</p>
    </li>
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

function FormSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid lg:grid-cols-[15rem_1fr] gap-x-10 gap-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">{description}</p>
      </div>
      <div className="grid md:grid-cols-2 gap-x-6 gap-y-5">{children}</div>
    </section>
  )
}

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
    const emailDate = dateFieldToIso(form.email_date)
    const deadline = dateFieldToIso(form.deadline_date)
    if (emailDate === "invalid") return toast.error("Date received isn't a valid date — use DD/MM/YYYY.")
    if (deadline === "invalid") return toast.error("KRA deadline isn't a valid date — use DD/MM/YYYY.")
    setSaving(true)
    try {
      const res = await api<{ case: CaseRow }>("/api/email-center/cases", {
        method: "POST",
        body: JSON.stringify({ ...form, email_date: emailDate, deadline_date: deadline }),
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
      <DialogContent className="max-w-5xl w-[96vw] max-h-[92vh] p-0 gap-0 border border-slate-200 shadow-xl rounded-2xl overflow-hidden bg-white flex flex-col">
        <DialogDescription className="sr-only">Record a KRA notice received outside the connected mailboxes.</DialogDescription>

        <div className="flex items-center gap-4 border-b border-slate-200 pl-6 pr-14 py-4 shrink-0">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-custom-blue/10 text-custom-blue shrink-0">
            <FolderPlus className="h-6 w-6" />
          </span>
          <div>
            <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900">Register offline KRA notice</DialogTitle>
            <p className="text-base text-slate-500 mt-0.5">Record notices received by physical mail, hand delivery or an unlinked inbox.</p>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-8 py-7 space-y-8 divide-y divide-slate-100 [&>section:not(:first-child)]:pt-8">
          <FormSection title="Client & notice" description="Who the notice is for and what kind of notice it is.">
            <Field label="Company *" className="md:col-span-2">
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
            </Field>
            <Field label="Notice type">
              <Input className={INPUT} value={form.notice_type} onChange={(e) => set("notice_type", e.target.value)} placeholder="e.g. Pre-Assessment Notice" />
            </Field>
            <Field label="KRA PIN">
              <Input className={cn(INPUT, "font-mono")} value={form.kra_pin} onChange={(e) => set("kra_pin", e.target.value)} placeholder="P051…" />
            </Field>
            <Field label="Subject line" className="md:col-span-2">
              <Input className={INPUT} value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="Official notice headline" />
            </Field>
          </FormSection>

          <FormSection title="Dates & sender" description="When it arrived, when KRA wants a response, and who sent it.">
            <Field label="Date received">
              <DateInput className={INPUT} value={form.email_date} onChange={(v) => set("email_date", v)} />
            </Field>
            <Field label="KRA deadline">
              <DateInput className={cn(INPUT, "border-amber-200 bg-amber-50/40")} value={form.deadline_date} onChange={(v) => set("deadline_date", v)} />
            </Field>
            <Field label="KRA sender email / desk">
              <Input className={INPUT} value={form.kra_email_from} onChange={(e) => set("kra_email_from", e.target.value)} placeholder="e.g. itax@kra.go.ke" />
            </Field>
            <Field label="KRA email CC">
              <Input className={INPUT} value={form.kra_email_cc} onChange={(e) => set("kra_email_cc", e.target.value)} placeholder="e.g. supervisor@kra.go.ke" />
            </Field>
          </FormSection>

          <FormSection title="Notice content" description="What the notice says and who signed it.">
            <Field label="Summary" className="md:col-span-2">
              <Textarea
                rows={4}
                className={TEXTAREA}
                value={form.contents}
                onChange={(e) => set("contents", e.target.value)}
                placeholder="Key issues, tax periods involved, assessments, demand amounts…"
              />
            </Field>
            <Field label="Signing officer name">
              <Input className={INPUT} value={form.signing_officer_name} onChange={(e) => set("signing_officer_name", e.target.value)} placeholder="Officer full name" />
            </Field>
            <Field label="Officer position / department">
              <Input className={INPUT} value={form.signing_officer_position} onChange={(e) => set("signing_officer_position", e.target.value)} placeholder="e.g. Chief Tax Officer" />
            </Field>
            <Field label="Attached documents" className="md:col-span-2">
              <Input className={INPUT} value={form.attachments_summary} onChange={(e) => set("attachments_summary", e.target.value)} placeholder="e.g. Assessment_Notice.pdf, Appendix_1.xlsx" />
            </Field>
          </FormSection>
        </div>

        <div className="border-t border-slate-200 bg-white px-6 py-3.5 shrink-0 flex items-center justify-end gap-2.5">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={saving} className="h-11 px-5 text-base font-medium text-slate-600 hover:text-slate-900 rounded-lg">
            Cancel
          </Button>
          <Button size="sm" onClick={create} disabled={saving} className="h-11 px-6 text-base font-semibold bg-custom-blue hover:bg-custom-blue/90 text-white rounded-lg shadow-xs gap-2">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            Create case
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
