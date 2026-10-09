"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/lib/hooks/use-toast"
import type { TaskBasketItem } from "@/lib/supabase/taskBasket"
import { buildBasketReport, defaultReportMessage, downloadReport, type ReportFormat } from "@/lib/taskBasket/report"

// Download a company's Task Basket report, or send it to the client by email / WhatsApp. Recipients
// start from the items' contact_summary — the contacts kra-tools' report routing resolved when the
// item was pushed — and can be edited (one per line).

const splitLines = (s: string) => s.split(/[\n,;]+/).map((v) => v.trim()).filter(Boolean)

export default function SendReportDialog({
  open,
  onOpenChange,
  companyName,
  items,
  cycleMonth,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = the overall report (download only — there is no single client to send it to). */
  companyName: string | null
  items: TaskBasketItem[]
  cycleMonth?: string
}) {
  const { toast } = useToast()
  const [format, setFormat] = useState<ReportFormat>("pdf")
  const [emails, setEmails] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState<"download" | "send" | null>(null)

  const contacts = useMemo(() => {
    const all = items.flatMap((i) => i.contact_summary || [])
    return {
      emails: [...new Set(all.filter((c) => /email/i.test(c.channel)).map((c) => c.value))],
      whatsapp: [...new Set(all.filter((c) => /wa|whatsapp/i.test(c.channel)).map((c) => c.value))],
    }
  }, [items])

  useEffect(() => {
    if (!open) return
    setEmails(contacts.emails.join("\n"))
    setWhatsapp(contacts.whatsapp.join("\n"))
    setMessage(companyName ? defaultReportMessage(companyName, items) : "")
  }, [open, contacts, companyName, items])

  const build = () => buildBasketReport(items, format, { companyName: companyName || undefined, cycleMonth })

  const handleDownload = async () => {
    setBusy("download")
    try {
      downloadReport(await build())
    } catch (error: any) {
      toast({ title: "Could not build the report", description: error.message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const handleSend = async () => {
    const to = { emails: splitLines(emails), whatsapp: splitLines(whatsapp) }
    if (!to.emails.length && !to.whatsapp.length) {
      toast({ title: "Add a recipient", description: "Enter at least one email address or WhatsApp number/group.", variant: "destructive" })
      return
    }
    setBusy("send")
    try {
      const file = await build()
      const res = await fetch("/api/task-basket/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_ids: items.map((i) => i.id),
          company_name: companyName,
          subject: `Outstanding items — ${companyName}${cycleMonth ? ` (${cycleMonth})` : ""}`,
          message,
          emails: to.emails,
          whatsapp: to.whatsapp,
          file: { base64: file.base64, fileName: file.fileName, mimeType: file.mimeType },
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Send failed")
      const failed = (body.results || []).filter((r: any) => !r.success)
      toast({
        title: failed.length ? `Sent with ${failed.length} failure(s)` : "Report sent",
        description: failed.length
          ? failed.map((f: any) => `${f.channel} ${f.to}: ${f.error}`).join("\n")
          : `${body.sentCount} recipient(s) — logged on the items' history.`,
        variant: failed.length && !body.sentCount ? "destructive" : undefined,
      })
      if (!failed.length) onOpenChange(false)
    } catch (error: any) {
      toast({ title: "Send failed", description: error.message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl">
        <DialogHeader>
          <DialogTitle>{companyName ? `Report — ${companyName}` : "Task Basket report"}</DialogTitle>
          <DialogDescription>
            {items.length} item{items.length === 1 ? "" : "s"}
            {cycleMonth ? ` · cycle ${cycleMonth}` : ""} — outstanding items with their deadlines, and anything received after the deadline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium">Format</span>
            {(["pdf", "xlsx"] as const).map((f) => (
              <label key={f} className="flex items-center gap-1.5">
                <input type="radio" name="report-format" checked={format === f} onChange={() => setFormat(f)} className="accent-custom-blue" />
                {f === "pdf" ? "PDF" : "Excel"}
              </label>
            ))}
          </div>

          {companyName && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Email recipients</Label>
                  <Textarea rows={3} className="mt-1 font-mono text-xs" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="one per line" />
                </div>
                <div>
                  <Label>WhatsApp (number or group)</Label>
                  <Textarea rows={3} className="mt-1 font-mono text-xs" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="2547XXXXXXXX or group link" />
                </div>
              </div>
              {!contacts.emails.length && !contacts.whatsapp.length && (
                <p className="text-xs text-amber-700">No contacts are configured for this company in the report routing — type them in.</p>
              )}
              <div>
                <Label>Message</Label>
                <Textarea rows={8} className="mt-1 text-sm" value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleDownload} disabled={!!busy || !items.length}>
            {busy === "download" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
            Download
          </Button>
          {companyName && (
            <Button onClick={handleSend} disabled={!!busy || !items.length}>
              {busy === "send" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
              Send to client
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
