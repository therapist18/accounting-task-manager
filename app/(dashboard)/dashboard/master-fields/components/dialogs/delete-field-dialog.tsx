"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { JobField } from "../types/database"
import { toast } from "@/lib/hooks/use-toast"

interface DeleteFieldDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  field: JobField | null
  onConfirm: (fieldId: string) => void
}

export function DeleteFieldDialog({ open, onOpenChange, field, onConfirm }: DeleteFieldDialogProps) {
  const handleConfirm = () => {
    if (field) {
      onConfirm(field.id)
      onOpenChange(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the field
            <strong className="font-medium"> "{field?.label}"</strong> and remove all associated data sources.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete Field
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
