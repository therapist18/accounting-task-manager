"use client"

import { useEffect, useMemo, useState } from "react"
import { Briefcase, EyeOff, Inbox, Loader2, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { EmailsTable } from "./NeedsReview"
import type { ReviewAction } from "./ruleSuggest"
import type { CategoryOption, EmailRow, RuleRow } from "./shared"

// Needs Review: the EmailsTable plus row checkboxes, a bulk-action bar (Create tasks / Mark as update /
// Ignore / Delete) and a per-row delete. Create task / update / ignore — for one row or a selection —
// go through the page's ReviewActionDialog, which also offers a rule for mail like it. Mail that turns
// up here and simply isn't needed can be deleted outright instead.
export function ReviewPanel({
  emails,
  categories,
  rules,
  onOpen,
  onAction,
  onDelete,
  showTime,
  loading,
  emptyMessage,
  embedded,
  showStats,
  visibleColumns,
}: {
  emails: EmailRow[]
  categories: CategoryOption[]
  rules: RuleRow[]
  onOpen: (e: EmailRow) => void
  // Opens the action dialog for these emails (a row's button, or the selection).
  onAction: (emails: EmailRow[], action: ReviewAction) => void
  // Deletes emails from the app; resolves once done.
  onDelete: (emails: EmailRow[]) => Promise<void>
  showTime: boolean
  loading: boolean
  emptyMessage: string
  embedded: boolean
  showStats: boolean
  visibleColumns: Record<string, boolean>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<EmailRow[] | null>(null)

  // Emails move or vanish after an action; drop selections that are no longer in the list.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const live = new Set(emails.map((e) => e.id))
      const next = new Set([...prev].filter((id) => live.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [emails])

  const selectedEmails = useMemo(() => emails.filter((e) => selected.has(e.id)), [emails, selected])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  // The selection clears itself once the emails leave Needs Review (see the effect above), so a
  // cancelled dialog keeps it.
  const actOnSelected = (action: ReviewAction) => {
    if (selectedEmails.length) onAction(selectedEmails, action)
  }

  const runDelete = async () => {
    if (!confirmDelete) return
    setBusy(true)
    try {
      await onDelete(confirmDelete)
      setSelected(new Set())
    } finally {
      setBusy(false)
      setConfirmDelete(null)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      {selected.size > 0 && (
        <div className="shrink-0 flex items-center gap-2 flex-wrap rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5">
          <span className="text-base font-semibold text-blue-800">{selected.size} selected</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => actOnSelected("task")} className="h-9 px-3 gap-1.5 rounded-md border-slate-200 bg-white hover:bg-slate-100 text-base font-medium" title="Open a task for each selected email">
            <Briefcase className="w-4 h-4" /> Create tasks
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => actOnSelected("update")} className="h-9 px-3 gap-1.5 rounded-md border-slate-200 bg-white hover:bg-slate-100 text-base font-medium" title="Informational — keep in the Update tab, or delete">
            <Inbox className="w-4 h-4" /> Mark as update
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => actOnSelected("ignore")} className="h-9 px-3 gap-1.5 rounded-md border-slate-200 bg-white hover:bg-slate-100 text-base font-medium" title="Not needed — keep in the Ignored tab, or delete">
            <EyeOff className="w-4 h-4" /> Ignore
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmDelete(selectedEmails)} className="h-9 px-3 gap-1.5 rounded-md border-red-200 text-red-700 hover:bg-red-50 text-base font-medium">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setSelected(new Set())} className="h-9 px-2 text-slate-600 ml-auto" title="Clear selection">
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      <EmailsTable
        emails={emails}
        categories={categories}
        onOpen={onOpen}
        onQuickClassify={(e, d) => onAction([e], d === "action_required" ? "task" : d === "update_only" ? "update" : "ignore")}
        showTime={showTime}
        loading={loading}
        emptyMessage={emptyMessage}
        embedded={embedded}
        showStats={showStats}
        visibleColumns={visibleColumns}
        rules={rules}
        selection={{ selected, onToggle: toggle, onToggleAll: toggleAll }}
        onDeleteRow={(e) => setConfirmDelete([e])}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && !busy && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirmDelete?.length ?? 0} email{confirmDelete?.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They are removed from the app but stay in Gmail. They can come back the next time that mailbox is synced from a date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); runDelete() }} disabled={busy} className="bg-red-600 hover:bg-red-700">
              {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
