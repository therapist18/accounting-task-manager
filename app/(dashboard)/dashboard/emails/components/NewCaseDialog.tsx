"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SearchSelect } from "./SearchSelect"
import type { CaseRow, CompanyOption } from "./types"
import { api } from "./utils"

const EMPTY = {
  company_id: "", notice_type: "", kra_pin: "", subject: "", deadline_date: "",
  contents: "", signing_officer_name: "", signing_officer_position: "",
}

// A staff-opened case — for a KRA notice that reached BCL some way this module doesn't watch (post,
// hand-delivered, a mailbox that isn't connected yet). Creates an email_case row directly; there's no
// triggering email, so created_by_id is the person filling this in, not the system.
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
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const reset = () => setForm(EMPTY)

  const handleClose = () => {
    if (saving) return
    reset()
    onClose()
  }

  const create = async () => {
    if (!form.company_id) return toast.error("Choose a company.")
    if (!form.notice_type.trim() && !form.subject.trim()) return toast.error("Give the case a notice type or subject.")
    setSaving(true)
    try {
      const res = await api<{ case: CaseRow }>("/api/email-center/cases", {
        method: "POST",
        body: JSON.stringify(form),
      })
      toast.success("Case created.")
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New KRA case</DialogTitle>
          <p className="text-xs text-slate-500">For a notice that reached BCL outside a watched mailbox — post, hand-delivered, or a mailbox not yet connected.</p>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Company *">
            <SearchSelect
              className="w-full"
              value={form.company_id}
              onChange={(v) => {
                set("company_id", v)
                // KRA PIN follows the company record — still freely editable afterward.
                set("kra_pin", companies.find((c) => c.id === v)?.kra_pin ?? "")
              }}
              placeholder="Select…"
              options={companies.map((c) => ({ value: c.id, label: c.company_name }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Notice type"><Input value={form.notice_type} onChange={(e) => set("notice_type", e.target.value)} placeholder="e.g. Pre-Assessment Notice" /></Field>
            <Field label="KRA PIN"><Input value={form.kra_pin} onChange={(e) => set("kra_pin", e.target.value)} placeholder="P0…" /></Field>
          </div>
          <Field label="Subject"><Input value={form.subject} onChange={(e) => set("subject", e.target.value)} /></Field>
          <Field label="Deadline date (KRA)"><Input type="date" value={form.deadline_date} onChange={(e) => set("deadline_date", e.target.value)} /></Field>
          <Field label="Contents (details)"><Textarea rows={3} value={form.contents} onChange={(e) => set("contents", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Signing officer"><Input value={form.signing_officer_name} onChange={(e) => set("signing_officer_name", e.target.value)} /></Field>
            <Field label="Officer position"><Input value={form.signing_officer_position} onChange={(e) => set("signing_officer_position", e.target.value)} /></Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button onClick={create} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Create case
          </Button>
        </div>
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
