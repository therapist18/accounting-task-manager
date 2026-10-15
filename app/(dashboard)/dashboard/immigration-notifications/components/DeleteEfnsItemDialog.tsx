"use client"

// Deletes EFNS record(s) from the page — one row, or the whole ticked selection — to re-test older
// records end to end: with "Re-capture" on, the EFNS automation picks each one up again within about
// a minute (WhatsApp off) and auto-filing files it again. A filed record can also take its document
// back off the task, so the re-filing doesn't land next to the old copy.

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { ImmigrationItem } from "@/lib/immigrationNotifications"
import { KIND_LABEL } from "./statusStyles"

export function DeleteEfnsItemDialog({
  items,
  onOpenChange,
  onDeleted,
}: {
  /** The record(s) to delete — one entry for a row's trash button, many for a bulk delete. */
  items: ImmigrationItem[]
  onOpenChange: (open: boolean) => void
  onDeleted: (queued: boolean) => void
}) {
  const [resync, setResync] = useState(true)
  const [unfile, setUnfile] = useState(true)
  const [busy, setBusy] = useState(false)

  const open = items.length > 0
  const count = items.length
  const single = count === 1 ? items[0] : null
  // Only the rows that actually have a filed document need the "un-file" option.
  const filedItems = useMemo(
    () => items.filter((i) => i.filingStatus === "filed" && !!i.filing?.document_id),
    [items],
  )
  const filed = filedItems.length > 0
  // The tasks the selection filed onto, for the un-file label (a handful of ids, then "…").
  const filedTaskIds = useMemo(() => {
    const ids = [...new Set(filedItems.map((i) => i.filing?.task_id).filter((id): id is number => id != null))]
    return ids
  }, [filedItems])

  useEffect(() => {
    if (open) {
      setResync(true)
      setUnfile(true)
    }
  }, [open, items])

  const handleDelete = async () => {
    const targets = items.filter((i) => i.id != null).map((i) => ({ kind: i.kind, id: i.id as number }))
    if (targets.length === 0) return
    setBusy(true)
    try {
      const res = await fetch("/api/immigration-notifications/resync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: targets, resync, unfile: filed && unfile }),
      })
      const json = await res.json().catch(() => ({}))
      // Bulk: a partial run (some rows already gone, one failed) still deletes the rest, so take
      // what came back and reload — only a run that deleted nothing is a hard failure.
      const partial = count > 1 && (json.deleted ?? 0) > 0
      if ((!res.ok || !json.success) && !partial) throw new Error(json.error || "Delete failed")
      if (json.warning) toast.warning(json.warning)
      if (json.failed > 0) {
        toast.warning(
          `${json.failed} of the ${count} record${count === 1 ? "" : "s"} could not be deleted`,
        )
      }

      const deleted: number = json.deleted ?? (res.ok ? targets.length : 0)
      if (count === 1) {
        toast.success(
          resync && json.requestId
            ? "Deleted — queued for re-capture. The EFNS automation picks it up within a minute."
            : "Record deleted",
        )
      } else {
        toast.success(
          resync && json.requestId
            ? `Deleted ${deleted} record${deleted === 1 ? "" : "s"} — queued for re-capture. The EFNS automation picks them up within a minute.`
            : `Deleted ${deleted} record${deleted === 1 ? "" : "s"}`,
        )
      }
      onDeleted(!!(resync && json.requestId))
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || "Delete failed")
    } finally {
      setBusy(false)
    }
  }

  const title = single
    ? `Delete this ${KIND_LABEL[single.kind].toLowerCase()}?`
    : `Delete ${count} records?`

  return (
    <Dialog open={open} onOpenChange={(open) => !busy && onOpenChange(open)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {single ? (
              <>
                <span className="font-medium text-slate-800">{single.applicant || single.name}</span>
                {" · "}
                {single.permitGroup} · {single.statusKey}
                {single.date ? ` · ${single.date}` : ""}
              </>
            ) : (
              <>
                <span className="font-medium text-slate-800">
                  {items.slice(0, 3).map((i) => i.applicant || i.name).join(", ")}
                </span>
                {count > 3 ? ` and ${count - 3} more` : ""} · {count} records selected
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            {count === 1
              ? "Removes the record and its PDF from the database."
              : `Removes the ${count} records and their PDFs from the database.`}
          </p>

          <div className="flex items-start gap-2.5">
            <Checkbox id="efns-resync" checked={resync} onCheckedChange={(v) => setResync(v === true)} className="mt-0.5" />
            <Label htmlFor="efns-resync" className="font-normal leading-snug cursor-pointer">
              <span className="font-medium text-slate-800">
                {count === 1 ? "Re-capture it from EFNS" : `Re-capture them from EFNS`}
              </span>
              <span className="block text-xs text-slate-500">
                {count === 1
                  ? "The automation fetches just this record again (WhatsApp off) on its next minute check, then auto-filing files it again."
                  : `The automation fetches these ${count} records again (WhatsApp off) on its next minute check, then auto-filing files them again.`}
              </span>
            </Label>
          </div>

          {filed && (
            <div className="flex items-start gap-2.5">
              <Checkbox id="efns-unfile" checked={unfile} onCheckedChange={(v) => setUnfile(v === true)} className="mt-0.5" />
              <Label htmlFor="efns-unfile" className="font-normal leading-snug cursor-pointer">
                <span className="font-medium text-slate-800">
                  {single ? (
                    <>Also remove the document it filed onto task #{single.filing?.task_id}</>
                  ) : (
                    <>
                      Also remove the {filedItems.length} document{filedItems.length === 1 ? "" : "s"} it filed
                      {filedTaskIds.length > 0 && (
                        <>
                          {" "}onto{" "}
                          {filedTaskIds.slice(0, 4).map((id, idx) => (
                            <span key={id}>{idx > 0 && " · "}task #{id}</span>
                          ))}
                          {filedTaskIds.length > 4 && " …"}
                        </>
                      )}
                    </>
                  )}
                </span>
                <span className="block text-xs text-slate-500">
                  {count === 1
                    ? `Takes it off “${single?.filing?.stage_name || "the stage"}” (the stage is no longer complete if that was its only document), so the re-filing doesn’t sit next to the old copy.`
                    : "Takes each one off its stage (a stage is no longer complete if that was its only document), so the re-filing doesn’t sit next to the old copies."}
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
            {count === 1 ? "Delete" : `Delete ${count} records`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
