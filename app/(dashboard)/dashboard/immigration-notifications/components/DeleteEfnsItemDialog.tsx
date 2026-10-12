"use client"

// Deletes an EFNS record from the page — to re-test an older record end to end: with "Re-capture" on,
// the EFNS automation picks the record up again within about a minute (WhatsApp off) and auto-filing
// files it again. A filed record can also take its document back off the task, so the re-filing
// doesn't land next to the old copy.

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { ImmigrationItem } from "@/lib/immigrationNotifications"
import { KIND_LABEL } from "./statusStyles"

export function DeleteEfnsItemDialog({
  item,
  onOpenChange,
  onDeleted,
}: {
  item: ImmigrationItem | null
  onOpenChange: (open: boolean) => void
  onDeleted: (queued: boolean) => void
}) {
  const [resync, setResync] = useState(true)
  const [unfile, setUnfile] = useState(true)
  const [busy, setBusy] = useState(false)
  const filed = item?.filingStatus === "filed" && !!item?.filing?.document_id

  useEffect(() => {
    if (item) {
      setResync(true)
      setUnfile(true)
    }
  }, [item])

  const handleDelete = async () => {
    if (!item?.id) return
    setBusy(true)
    try {
      const res = await fetch("/api/immigration-notifications/resync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: item.kind, id: item.id, resync, unfile: filed && unfile }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) throw new Error(json.error || "Delete failed")
      if (json.warning) toast.warning(json.warning)
      toast.success(
        resync && json.requestId
          ? "Deleted — queued for re-capture. The EFNS automation picks it up within a minute."
          : "Record deleted",
      )
      onDeleted(!!(resync && json.requestId))
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || "Delete failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(open) => !busy && onOpenChange(open)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this {item ? KIND_LABEL[item.kind].toLowerCase() : "record"}?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-slate-800">{item?.applicant || item?.name}</span>
            {" · "}
            {item?.permitGroup} · {item?.statusKey}
            {item?.date ? ` · ${item.date}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-slate-600">Removes the record and its PDF from the database.</p>

          <div className="flex items-start gap-2.5">
            <Checkbox id="efns-resync" checked={resync} onCheckedChange={(v) => setResync(v === true)} className="mt-0.5" />
            <Label htmlFor="efns-resync" className="font-normal leading-snug cursor-pointer">
              <span className="font-medium text-slate-800">Re-capture it from EFNS</span>
              <span className="block text-xs text-slate-500">
                The automation fetches just this record again (WhatsApp off) on its next minute check, then auto-filing
                files it again.
              </span>
            </Label>
          </div>

          {filed && (
            <div className="flex items-start gap-2.5">
              <Checkbox id="efns-unfile" checked={unfile} onCheckedChange={(v) => setUnfile(v === true)} className="mt-0.5" />
              <Label htmlFor="efns-unfile" className="font-normal leading-snug cursor-pointer">
                <span className="font-medium text-slate-800">
                  Also remove the document it filed onto task #{item?.filing?.task_id}
                </span>
                <span className="block text-xs text-slate-500">
                  Takes it off “{item?.filing?.stage_name || "the stage"}” (the stage is no longer complete if that was its only
                  document), so the re-filing doesn’t sit next to the old copy.
                </span>
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
