"use client"

import { useState } from "react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/lib/hooks/use-toast"
import { deleteTaskBasketItems, TaskBasketItem } from "@/lib/supabase/taskBasket"

interface BulkDeleteDialogProps {
  items: TaskBasketItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: (ids: string[]) => void
}

export default function BulkDeleteDialog({ items, open, onOpenChange, onDeleted }: BulkDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()

  const openCount = items.filter((i) => i.status === "open").length
  const resolvedCount = items.length - openCount

  const handleDelete = async () => {
    if (!items.length) return
    setDeleting(true)
    try {
      const { deletedIds } = await deleteTaskBasketItems(items.map((i) => i.id))
      toast({ title: `${deletedIds.length} record${deletedIds.length === 1 ? "" : "s"} deleted`, description: "Removed from the shared basket." })
      onDeleted(deletedIds)
      onOpenChange(false)
    } catch (error: any) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {items.length} record{items.length === 1 ? "" : "s"}?</AlertDialogTitle>
          <AlertDialogDescription>
            {items.length} row{items.length === 1 ? "" : "s"} will be removed from the shared basket permanently
            {resolvedCount > 0 ? `, including ${resolvedCount} resolved row${resolvedCount === 1 ? "" : "s"} and their audit trail` : ""}.
            <span className="mt-2 block">
              Use &ldquo;Mark Resolved&rdquo; instead if the documents simply arrived — a resolved row keeps its
              audit trail. Any company that is still missing its document will be added back by the next daily
              compliance run.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
            {deleting ? "Deleting..." : `Delete ${items.length} record${items.length === 1 ? "" : "s"}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
