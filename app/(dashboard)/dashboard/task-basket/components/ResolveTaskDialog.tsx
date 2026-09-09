"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useToast } from "@/lib/hooks/use-toast"
import { resolveTaskBasketItem, TaskBasketItem, TASK_BASKET_MODULE_LABELS } from "@/lib/supabase/taskBasket"

interface ResolveTaskDialogProps {
  item: TaskBasketItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onResolved: (id: string) => void
}

export default function ResolveTaskDialog({ item, open, onOpenChange, onResolved }: ResolveTaskDialogProps) {
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  const handleResolve = async () => {
    if (!item) return
    setSubmitting(true)
    try {
      await resolveTaskBasketItem(item.id, note)
      toast({ title: "Marked resolved", description: `${item.company_name} moved out of the open basket.` })
      onResolved(item.id)
      setNote("")
      onOpenChange(false)
    } catch (error: any) {
      toast({ title: "Failed to resolve", description: error.message, variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark resolved</DialogTitle>
          <DialogDescription>
            {item ? `${item.company_name} — ${TASK_BASKET_MODULE_LABELS[item.module]} (${item.cycle_month})` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="resolution-note" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Note (optional)
          </Label>
          <Textarea
            id="resolution-note"
            placeholder="e.g. Statements received via WhatsApp, uploaded to the cycle."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleResolve} disabled={submitting}>
            {submitting ? "Resolving..." : "Mark Resolved"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
