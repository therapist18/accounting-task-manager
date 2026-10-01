"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useToast } from "@/lib/hooks/use-toast"
import { resolveTaskBasketItems, TaskBasketItem } from "@/lib/supabase/taskBasket"

interface BulkResolveDialogProps {
  /** The selected rows. Only the open ones are sent; resolved ones in the selection are ignored. */
  items: TaskBasketItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onResolved: (ids: string[], note: string) => void
}

export default function BulkResolveDialog({ items, open, onOpenChange, onResolved }: BulkResolveDialogProps) {
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  const openItems = items.filter((i) => i.status === "open")
  const alreadyResolved = items.length - openItems.length

  const handleResolve = async () => {
    if (!openItems.length) return
    setSubmitting(true)
    try {
      const { resolvedIds, skipped } = await resolveTaskBasketItems(openItems.map((i) => i.id), note)
      toast({
        title: `${resolvedIds.length} marked resolved`,
        description: skipped ? `${skipped} were already resolved or no longer exist.` : "Moved out of the open basket.",
      })
      onResolved(resolvedIds, note || "")
      setNote("")
      onOpenChange(false)
    } catch (error: any) {
      toast({ title: "Failed to resolve", description: error.message, variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark {openItems.length} resolved</DialogTitle>
          <DialogDescription>
            The same note is saved on every selected row.
            {alreadyResolved > 0 && ` ${alreadyResolved} selected row${alreadyResolved === 1 ? " is" : "s are"} already resolved and will be left as they are.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="bulk-resolution-note" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Note (optional)
          </Label>
          <Textarea
            id="bulk-resolution-note"
            placeholder="e.g. Documents received at the front desk."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleResolve} disabled={submitting || openItems.length === 0}>
            {submitting ? "Resolving..." : `Mark ${openItems.length} Resolved`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
