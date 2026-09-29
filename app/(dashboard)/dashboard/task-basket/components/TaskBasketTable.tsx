"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays, format } from "date-fns";
import {
  TaskBasketItem,
  TaskBasketHistoryEntry,
  TASK_BASKET_MODULE_LABELS,
} from "@/lib/supabase/taskBasket";
// The Email Center's own table building blocks, so this module sorts, stripes, paginates and reports
// its Total / Completed / Missing exactly like the cases / emails / rules tables instead of growing a
// fourth table style. Click a header to sort by it; shift-click to stack a second sort level.
import {
  SortTh,
  StatsRows,
  TableLoading,
  TD_CLASS,
  useTableSort,
  zebraRow,
  type StatsColumn,
} from "../../emails/components/table";
import { Pagination } from "../../emails/components/Pagination";
import ResolveTaskDialog from "./ResolveTaskDialog";
import DeleteTaskDialog from "./DeleteTaskDialog";

interface TaskBasketTableProps {
  items: TaskBasketItem[];
  loading?: boolean;
  onItemResolved: (id: string) => void;
  onItemDeleted: (id: string) => void;
}

const COLUMN_COUNT = 11;

// Days an open item has been sitting in the basket — the "Overdue" column and its sort key. Resolved
// rows have no overdue clock, so they sort to 0 rather than to a negative age.
function daysOpen(item: TaskBasketItem): number {
  if (item.status !== "open") return 0;
  return Math.max(
    0,
    differenceInCalendarDays(new Date(), new Date(item.triggered_at)),
  );
}

// One accessor per sortable column; the cells themselves stay hand-written below. "#" is deliberately
// absent — useTableSort treats it as "original order" (clicking it toggles asc/desc on the incoming
// order), which is why the row number can be derived from the row's position rather than from a column.
const ACCESSORS: Record<string, (item: TaskBasketItem) => string | number> = {
  company: (i) => i.company_name,
  companyId: (i) => i.company_id,
  module: (i) => TASK_BASKET_MODULE_LABELS[i.module],
  cycle: (i) => i.cycle_month,
  contacts: (i) => i.contact_summary.length,
  reason: (i) => i.reason,
  triggered: (i) => i.triggered_at,
  overdue: daysOpen,
  status: (i) => i.status,
};

// Which columns the Total/Completed/Missing stats bar counts. Only the Status column carries a value:
// the shared columnStats treats a non-empty value as "Completed", so a resolved row counts as
// Completed and an open row (still missing its document) as Missing — Total / Missing / Completed in
// the row labels under the "#" column.
const STATS_COLUMNS: StatsColumn<TaskBasketItem>[] = [
  { id: "#" },
  { id: "company" },
  { id: "companyId" },
  { id: "module" },
  { id: "cycle" },
  { id: "contacts" },
  { id: "reason" },
  { id: "triggered" },
  { id: "overdue" },
  {
    id: "status",
    getValue: (i: TaskBasketItem) =>
      i.status === "resolved" ? "resolved" : "",
  },
  { id: "action" },
];

function ContactCell({ item }: { item: TaskBasketItem }) {
  if (!item.contact_summary?.length) {
    return (
      <span className="text-sm text-slate-400">No contact configured</span>
    );
  }
  return (
    <div className="space-y-0.5">
      {item.contact_summary.slice(0, 2).map((contact, i) => (
        <div key={i} className="text-sm text-slate-600">
          <span className="font-semibold">{contact.name}</span>{" "}
          <span className="text-slate-400">({contact.channel})</span>
        </div>
      ))}
      {item.contact_summary.length > 2 && (
        <div className="text-xs text-slate-400">
          +{item.contact_summary.length - 2} more
        </div>
      )}
    </div>
  );
}

function HistoryList({ history }: { history: TaskBasketHistoryEntry[] }) {
  if (!history?.length) {
    return <p className="text-sm text-slate-400">No checks recorded yet.</p>;
  }
  return (
    <ol className="space-y-1.5">
      {history.map((entry, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium text-slate-700">
            {format(new Date(entry.checked_at), "dd MMM yyyy, HH:mm")}
          </span>
          {entry.still_pending === false ? (
            <span className="text-emerald-700">
              Uploaded — item closed automatically
              {typeof entry.received_accounts === "number" &&
              typeof entry.total_accounts === "number"
                ? ` (${entry.received_accounts}/${entry.total_accounts} statements received)`
                : ""}
            </span>
          ) : (
            <span className="text-slate-600">
              Still missing
              {typeof entry.received_accounts === "number" &&
              typeof entry.total_accounts === "number"
                ? ` — ${entry.received_accounts} of ${entry.total_accounts} statements received`
                : ""}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function TaskBasketTable({
  items,
  loading = false,
  onItemResolved,
  onItemDeleted,
}: TaskBasketTableProps) {
  const [resolvingItem, setResolvingItem] = useState<TaskBasketItem | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<TaskBasketItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [page, setPage] = useState(0);
  const { levels, sorted, toggle } = useTableSort<TaskBasketItem>(
    items,
    ACCESSORS,
    [{ key: "company", dir: "asc" }],
  );

  // Any filter change hands us a new list, so the old page number can point past its end.
  useEffect(() => {
    setPage(0);
    setExpandedId(null);
  }, [items]);

  // The row number counts the whole sorted list, not the page, so paging never renumbers the list.
  const pageStart = page * itemsPerPage;
  const pageRows = sorted
    .slice(pageStart, pageStart + itemsPerPage)
    .map((item, i) => ({ item, number: pageStart + i + 1 }));

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0">
        {!loading && !items.length ? (
          <div className="py-16 text-center text-sm text-slate-400">
            Nothing here — every company is compliant for this filter.
          </div>
        ) : (
          <div className="overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
              <table className="w-full min-w-[1420px] border-separate border-spacing-0 text-base">
                <thead className="sticky top-0 z-30 bg-white shadow-xs">
                  <tr>
                    <SortTh
                      id="#"
                      levels={levels}
                      onSort={toggle}
                      tone="blue"
                      className="w-16 text-center"
                    >
                      #
                    </SortTh>
                    <SortTh
                      id="companyId"
                      levels={levels}
                      onSort={toggle}
                      tone="blue"
                      className="text-center w-16"
                    >
                      Company ID
                    </SortTh>
                    <SortTh
                      id="company"
                      levels={levels}
                      onSort={toggle}
                      tone="blue"
                      className="text-left min-w-[220px]"
                    >
                      Company
                    </SortTh>
                    <SortTh
                      id="module"
                      levels={levels}
                      onSort={toggle}
                      tone="blue"
                      className="text-left min-w-[170px]"
                    >
                      Module
                    </SortTh>
                    <SortTh
                      id="cycle"
                      levels={levels}
                      onSort={toggle}
                      tone="blue"
                      className="text-left"
                    >
                      Cycle
                    </SortTh>
                    <SortTh
                      id="contacts"
                      levels={levels}
                      onSort={toggle}
                      tone="blue"
                      className="text-left min-w-[200px]"
                    >
                      Contact
                    </SortTh>
                    <SortTh
                      id="reason"
                      levels={levels}
                      onSort={toggle}
                      tone="blue"
                      className="text-left min-w-[260px]"
                    >
                      Reason
                    </SortTh>
                    <SortTh
                      id="triggered"
                      levels={levels}
                      onSort={toggle}
                      tone="blue"
                      className="text-left"
                    >
                      Triggered
                    </SortTh>
                    <SortTh
                      id="overdue"
                      levels={levels}
                      onSort={toggle}
                      tone="blue"
                      className="text-left"
                    >
                      Overdue
                    </SortTh>
                    <SortTh
                      id="status"
                      levels={levels}
                      onSort={toggle}
                      tone="blue"
                      className="text-left"
                    >
                      Status
                    </SortTh>
                    <th className="px-3 py-2.5 text-base font-semibold text-right border-b border-slate-200/80 whitespace-nowrap">
                      Action
                    </th>
                  </tr>
                  {/* Total / Completed / Missing, frozen with the rest of the header, counted over the
                  whole filtered list — not just the visible page. */}
                  {!loading && (
                    <StatsRows rows={items} columns={STATS_COLUMNS} />
                  )}
                </thead>
                <tbody>
                  {loading ? (
                    <TableLoading
                      cols={COLUMN_COUNT}
                      label="Loading task basket…"
                    />
                  ) : (
                    pageRows.map(({ item, number }, index) => {
                      const overdue = daysOpen(item);
                      const isOpen = item.status === "open";
                      const expanded = expandedId === item.id;
                      return [
                        <tr key={item.id} className={zebraRow(index)}>
                          <td
                            className={cn(
                              TD_CLASS,
                              "text-center text-slate-400 tabular-nums",
                            )}
                          >
                            {number}
                          </td>
                          <td
                            className={cn(
                              TD_CLASS,
                              "text-center tabular-nums text-slate-500",
                            )}
                          >
                            {item.company_id}
                          </td>
                          <td
                            className={cn(
                              TD_CLASS,
                              "font-semibold text-slate-800",
                            )}
                          >
                            {item.company_name}
                          </td>
                          <td className={TD_CLASS}>
                            {TASK_BASKET_MODULE_LABELS[item.module]}
                          </td>
                          <td className={TD_CLASS}>{item.cycle_month}</td>
                          <td className={TD_CLASS}>
                            <ContactCell item={item} />
                          </td>
                          <td className={cn(TD_CLASS, "max-w-[280px]")}>
                            {item.reason}
                          </td>
                          <td className={TD_CLASS}>
                            {format(new Date(item.triggered_at), "dd MMM yyyy")}
                          </td>
                          <td className={TD_CLASS}>
                            {isOpen ? (
                              <span
                                className={cn(
                                  "font-medium",
                                  overdue >= 14
                                    ? "text-red-600"
                                    : overdue >= 7
                                      ? "text-amber-600"
                                      : "text-slate-600",
                                )}
                              >
                                {overdue} day{overdue === 1 ? "" : "s"}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className={TD_CLASS}>
                            <Badge
                              variant="outline"
                              className={
                                isOpen
                                  ? "border-amber-300 bg-amber-50 text-amber-700"
                                  : "border-emerald-300 bg-emerald-50 text-emerald-700"
                              }
                            >
                              {isOpen ? "Open" : "Resolved"}
                            </Badge>
                          </td>
                          <td
                            className={cn(
                              TD_CLASS,
                              "text-right whitespace-nowrap",
                            )}
                          >
                            {isOpen ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setResolvingItem(item);
                                  setDialogOpen(true);
                                }}
                              >
                                Mark Resolved
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400">
                                {item.resolution_note || "Resolved"}
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="ml-1"
                              onClick={() =>
                                setExpandedId(expanded ? null : item.id)
                              }
                            >
                              {expanded ? "Hide" : "Details"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="ml-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => {
                                setDeletingItem(item);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>,
                        expanded ? (
                          <tr
                            key={`${item.id}-detail`}
                            className="bg-slate-50/60"
                          >
                            <td
                              className={cn(TD_CLASS, "bg-inherit")}
                              colSpan={COLUMN_COUNT}
                            >
                              <div className="grid gap-4 md:grid-cols-2 py-1">
                                <div>
                                  <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
                                    Reason
                                  </p>
                                  <p className="text-sm text-slate-700">
                                    {item.reason}
                                  </p>
                                  <p className="mt-2 mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
                                    Contacts ({item.contact_summary.length})
                                  </p>
                                  {item.contact_summary.length ? (
                                    <ul className="space-y-0.5">
                                      {item.contact_summary.map(
                                        (contact, i) => (
                                          <li
                                            key={i}
                                            className="text-sm text-slate-700"
                                          >
                                            <span className="font-medium">
                                              {contact.name}
                                            </span>
                                            {contact.position ? (
                                              <span className="text-slate-500">
                                                {" "}
                                                — {contact.position}
                                              </span>
                                            ) : null}
                                            <span className="text-slate-400">
                                              {" "}
                                              ({contact.channel}:{" "}
                                              {contact.value})
                                            </span>
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  ) : (
                                    <p className="text-sm text-slate-400">
                                      No contact configured.
                                    </p>
                                  )}
                                </div>
                                <div>
                                  <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
                                    Check history
                                  </p>
                                  <HistoryList history={item.history} />
                                  {item.status === "resolved" && (
                                    <p className="mt-2 text-sm text-emerald-700">
                                      Resolved{" "}
                                      {item.resolved_at
                                        ? format(
                                            new Date(item.resolved_at),
                                            "dd MMM yyyy, HH:mm",
                                          )
                                        : ""}
                                      {item.resolved_by
                                        ? ` by ${item.resolved_by}`
                                        : " automatically"}
                                      {item.resolution_note
                                        ? ` — ${item.resolution_note}`
                                        : ""}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null,
                      ];
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {!loading && items.length > 0 && (
        <Pagination
          totalItems={items.length}
          itemsPerPage={itemsPerPage}
          currentPage={page}
          onPageChange={setPage}
          onItemsPerPageChange={setItemsPerPage}
          sticky={false}
          className="shrink-0 border-t border-slate-200"
        />
      )}

      <ResolveTaskDialog
        item={resolvingItem}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onResolved={onItemResolved}
      />
      <DeleteTaskDialog
        item={deletingItem}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDeleted={onItemDeleted}
      />
    </>
  );
}
