"use client"

import { useState } from "react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/lib/hooks/use-toast"
import { deleteTaskBasketItem, TaskBasketItem, TASK_BASKET_MODULE_LABELS } from "@/lib/supabase/taskBasket"

interface DeleteTaskDialogProps {
  item: TaskBasketItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: (id: string) => void
}

export default function DeleteTaskDialog({ item, open, onOpenChange, onDeleted }: DeleteTaskDialogProps) {
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()

  const handleDelete = async () => {
    if (!item) return
    setDeleting(true)
    try {
      await deleteTaskBasketItem(item.id)
      toast({ title: "Record deleted", description: `${item.company_name} removed from the basket.` })
      onDeleted(item.id)
      onOpenChange(false)
    } catch (error: any) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this record?</AlertDialogTitle>
          <AlertDialogDescription>
            {item
              ? `${item.company_name} (ID ${item.company_id}) — ${TASK_BASKET_MODULE_LABELS[item.module]} (${item.cycle_month}) will be removed from the shared basket permanently.`
              : ""}
            <span className="mt-2 block">
              Use &ldquo;Mark Resolved&rdquo; instead if the document simply arrived — a resolved row keeps its
              audit trail. If this company is still missing the document, the next daily compliance run
              will add it back.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleting ? "Deleting..." : "Delete record"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
