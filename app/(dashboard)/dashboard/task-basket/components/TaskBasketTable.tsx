"use client"

import { useState } from "react"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { differenceInCalendarDays } from "date-fns"
import { TaskBasketItem, TASK_BASKET_MODULE_LABELS } from "@/lib/supabase/taskBasket"
import ResolveTaskDialog from "./ResolveTaskDialog"

interface TaskBasketTableProps {
  items: TaskBasketItem[]
  onItemResolved: (id: string) => void
}

function ContactCell({ item }: { item: TaskBasketItem }) {
  if (!item.contact_summary?.length) {
    return <span className="text-xs text-slate-400">No contact configured</span>
  }
  return (
    <div className="space-y-0.5">
      {item.contact_summary.slice(0, 2).map((contact, i) => (
        <div key={i} className="text-xs text-slate-600">
          <span className="font-semibold">{contact.name}</span>{" "}
          <span className="text-slate-400">({contact.channel})</span>
        </div>
      ))}
      {item.contact_summary.length > 2 && (
        <div className="text-[11px] text-slate-400">+{item.contact_summary.length - 2} more</div>
      )}
    </div>
  )
}

export default function TaskBasketTable({ items, onItemResolved }: TaskBasketTableProps) {
  const [resolvingItem, setResolvingItem] = useState<TaskBasketItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  if (!items.length) {
    return (
      <div className="py-16 text-center text-sm text-slate-400">
        Nothing here — every company is compliant for this filter.
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Overdue</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const daysOverdue = Math.max(0, differenceInCalendarDays(new Date(), new Date(item.triggered_at)))
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-semibold text-slate-800">{item.company_name}</TableCell>
                  <TableCell className="text-xs text-slate-600">{TASK_BASKET_MODULE_LABELS[item.module]}</TableCell>
                  <TableCell className="text-xs text-slate-600 max-w-[220px]">{item.reason}</TableCell>
                  <TableCell><ContactCell item={item} /></TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {item.status === "open" ? `${daysOverdue} day${daysOverdue === 1 ? "" : "s"}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={item.status === "open"
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-emerald-300 bg-emerald-50 text-emerald-700"}
                    >
                      {item.status === "open" ? "Open" : "Resolved"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.status === "open" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setResolvingItem(item)
                          setDialogOpen(true)
                        }}
                      >
                        Mark Resolved
                      </Button>
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        {item.resolution_note || "Resolved"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <ResolveTaskDialog
        item={resolvingItem}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onResolved={onItemResolved}
      />
    </>
  )
}
