"use client"

import React, { useMemo, useState } from "react"
import { toast } from "sonner"
import { Copy, Download, FileSpreadsheet, Loader2, Plus, RotateCcw, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDateToDMY } from "@/lib/dateUtils"
import { useCurrentUser } from "@/lib/hooks/use-current-user"
import { useSessionResource } from "@/lib/sessionCache"
import { cn } from "@/lib/utils"
import {
  COUNT_BADGE_CLASS, PILL_BUTTON_CLASS, PRIMARY_PILL_BUTTON_CLASS, SearchSelect, TAB_LIST_CLASS, TAB_TRIGGER_CLASS,
} from "../emails/components/shared"
import { SortTh, TD_CLASS, TH_CLASS, HEAD_NEUTRAL, TableLoading, useTableSort, zebraRow } from "../emails/components/table"
import { Pagination } from "../emails/components/Pagination"
import { fmtKes } from "../departments/rates/rate-card/calc"
import { settingsOn, todayYmd, rateSettingsResource } from "../departments/rates/rate-card/data"
import {
  STATUSES, PAYMENT_STATUS_BADGE, PAYMENT_STATUS_LABELS,
  deleteQuotation, quotationsResource, setQuotationStatus,
  type Quotation, type QuotationStatus,
} from "./data"
import { QuotationEditor } from "./QuotationEditor"
import { exportQuotation, exportQuotationList } from "./exportQuotation"

type StatusTab = "all" | QuotationStatus

const CLIENT_TYPES = [
  { value: "", label: "All clients" },
  { value: "company", label: "Companies" },
  { value: "individual", label: "Individuals" },
  { value: "other", label: "Other / walk-in" },
]

const SORT: Record<string, (q: Quotation) => string | number> = {
  number: (q) => q.quote_number,
  date: (q) => q.quote_date,
  client: (q) => q.client_name,
  total: (q) => q.totals?.total ?? 0,
  status: (q) => q.status,
  valid: (q) => q.valid_until ?? "",
  payment: (q) => q.payment_status,
}

// Quotations raised from the rate cards (Settings → Rates). The whole list is loaded once into the
// session cache; tabs, search and sorting slice it in memory, and saves patch it in place.
export default function QuotationsPage() {
  const { user } = useCurrentUser()
  const userName = (user?.displayName || user?.name || user?.email || null) as string | null
  const quotations = useSessionResource(quotationsResource)

  const [tab, setTab] = useState<StatusTab>("all")
  const [search, setSearch] = useState("")
  const [clientType, setClientType] = useState("")
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(50)
  const [editing, setEditing] = useState<{ open: boolean; quotation: Quotation | null }>({ open: false, quotation: null })
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const all = quotations.data || []
  const today = todayYmd()

  // A sent quotation past its valid-until date reads as expired without anyone having to mark it.
  const effectiveStatus = (q: Quotation): QuotationStatus =>
    (q.status === "sent" && q.valid_until && q.valid_until < today ? "expired" : q.status)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length }
    for (const q of all) c[effectiveStatus(q)] = (c[effectiveStatus(q)] || 0) + 1
    return c
  }, [all]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return all.filter((q) => {
      if (tab !== "all" && effectiveStatus(q) !== tab) return false
      if (clientType && q.client_type !== clientType) return false
      return !s || `${q.quote_number} ${q.client_name} ${q.items.map((i) => i.job_path).join(" ")}`.toLowerCase().includes(s)
    })
  }, [all, tab, search, clientType]) // eslint-disable-line react-hooks/exhaustive-deps

  const { levels, sorted, toggle } = useTableSort(filtered, SORT, [])
  const pageRows = sorted.slice(page * perPage, (page + 1) * perPage)
  const totalValue = filtered.reduce((sum, q) => sum + (q.totals?.total ?? 0), 0)

  const missingTable = /tm_quotations/.test(quotations.error?.message ?? "")

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await quotationsResource.refresh()
    } catch (e: any) {
      toast.error(e?.message || "Could not reload quotations")
    } finally {
      setRefreshing(false)
    }
  }

  const duplicate = (q: Quotation) => {
    const date = todayYmd()
    setEditing({
      open: true,
      quotation: {
        ...q, id: undefined as any, quote_number: "", status: "draft", quote_date: date,
        revision_number: 0, revised_at: null,
        settings: settingsOn(rateSettingsResource.getState().data, date),
        notes: q.notes ? `${q.notes}\n(Copied from ${q.quote_number})` : `Copied from ${q.quote_number}`,
      },
    })
  }

  const cols = 13

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-50/50">
      {/* Header */}
      <div className="border-b border-slate-200/80 bg-white px-4 py-2.5 antialiased flex items-center gap-x-3 gap-y-2 flex-wrap shrink-0">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Quotations</h1>
        <span className="text-sm font-semibold text-custom-blue bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">From the Rate Card</span>
        <div className="hidden md:flex items-center text-base text-slate-500 gap-1.5">
          <span>{filtered.length} document{filtered.length === 1 ? "" : "s"}</span>
          <span className="text-slate-300">·</span>
          <span>KES {fmtKes(totalValue)} quoted</span>
          {quotations.refreshing && (
            <span className="inline-flex items-center gap-1 text-slate-400" title="Showing what was loaded earlier while the latest data comes in">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || quotations.loading} className={PILL_BUTTON_CLASS}>
            {refreshing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />} Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportQuotationList(sorted)} disabled={!sorted.length} className={PILL_BUTTON_CLASS}>
            <Download className="h-5 w-5" /> Export
          </Button>
          <Button onClick={() => setEditing({ open: true, quotation: null })} className={PRIMARY_PILL_BUTTON_CLASS}>
            <Plus className="h-5 w-5" /> New
          </Button>
        </div>
      </div>

      {/* Tabs + filters */}
      <div className="border-b border-slate-200/80 bg-slate-50/60 px-4 py-2 antialiased flex items-center gap-x-4 gap-y-2 flex-wrap shrink-0">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as StatusTab); setPage(0) }}>
          <TabsList className={TAB_LIST_CLASS}>
            <TabsTrigger value="all" className={TAB_TRIGGER_CLASS}>All<span className={COUNT_BADGE_CLASS}>{counts.all || 0}</span></TabsTrigger>
            {STATUSES.map((s) => (
              <TabsTrigger key={s.value} value={s.value} className={TAB_TRIGGER_CLASS}>
                {s.label}
                {(counts[s.value] || 0) > 0 && <span className={COUNT_BADGE_CLASS}>{counts[s.value]}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }} placeholder="Search number, client, service…" className="h-10 w-72 pl-9 text-base" />
          </div>
          <SearchSelect value={clientType} onChange={(v) => { setClientType(v); setPage(0) }} options={CLIENT_TYPES} placeholder="All clients" className="w-44" />
        </div>
      </div>

      {missingTable && (
        <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-800">
          The quotations table doesn&apos;t exist yet. Apply <code className="font-mono text-sm">supabase/migrations/20261019000000_rate_cards_and_quotations.sql</code>, then press Refresh.
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto bg-white">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead className="sticky top-0 z-30">
            <tr>
              <th className={cn(TH_CLASS, HEAD_NEUTRAL, "w-12")}>#</th>
              <SortTh id="number" levels={levels} onSort={toggle}>Quote #</SortTh>
              <SortTh id="date" levels={levels} onSort={toggle}>Date</SortTh>
              <SortTh id="client" levels={levels} onSort={toggle}>Client</SortTh>
              <th className={cn(TH_CLASS, HEAD_NEUTRAL)}>Services</th>
              <th className={cn(TH_CLASS, HEAD_NEUTRAL, "text-right")}>Official</th>
              <th className={cn(TH_CLASS, HEAD_NEUTRAL, "text-right")}>BCL Fees</th>
              <SortTh id="total" levels={levels} onSort={toggle} className="text-right">Total (KES)</SortTh>
              <SortTh id="status" levels={levels} onSort={toggle}>Status</SortTh>
              <SortTh id="valid" levels={levels} onSort={toggle}>Valid Until</SortTh>
              <SortTh id="payment" levels={levels} onSort={toggle}>Payment</SortTh>
              <th className={cn(TH_CLASS, HEAD_NEUTRAL)}>Rev.</th>
              <th className={cn(TH_CLASS, HEAD_NEUTRAL)}></th>
            </tr>
          </thead>
          <tbody>
            {quotations.loading ? (
              <TableLoading cols={cols} />
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={cols} className="px-6 py-14 text-center text-base text-slate-500">
                  {all.length === 0 ? "No quotations yet — press New to raise one from the rate card." : "No quotations match these filters."}
                </td>
              </tr>
            ) : (
              pageRows.map((q, i) => {
                const status = effectiveStatus(q)
                const badge = STATUSES.find((s) => s.value === status)
                const pmtBadge = PAYMENT_STATUS_BADGE[q.payment_status ?? "unpaid"]
                return (
                  <tr key={q.id} className={cn(zebraRow(i), "cursor-pointer")} onClick={() => setEditing({ open: true, quotation: q })}>
                    <td className={cn(TD_CLASS, "tabular-nums text-slate-500")}>{page * perPage + i + 1}</td>
                    <td className={cn(TD_CLASS, "font-semibold text-custom-blue whitespace-nowrap")}>{q.quote_number}</td>
                    <td className={cn(TD_CLASS, "whitespace-nowrap")}>{formatDateToDMY(q.quote_date)}</td>
                    <td className={TD_CLASS}>
                      <div className="font-medium text-slate-900">{q.client_name}</div>
                      <div className="text-sm text-slate-500 capitalize">
                        {q.client_type === "other" ? "Walk-in" : q.client_type}
                        {q.etims_mode && q.etims_mode !== "without" ? ` · eTIMS ${q.etims_mode === "both" ? "(both)" : ""}` : ""}
                      </div>
                    </td>
                    <td className={cn(TD_CLASS, "text-sm max-w-[380px]")}>
                      {q.items.slice(0, 2).map((it) => <div key={it.id} className="truncate">{it.job_path}</div>)}
                      {q.items.length > 2 && <div className="text-slate-500">+{q.items.length - 2} more</div>}
                    </td>
                    <td className={cn(TD_CLASS, "text-right tabular-nums")}>{fmtKes(q.totals?.official)}</td>
                    <td className={cn(TD_CLASS, "text-right tabular-nums")}>{fmtKes(q.totals?.consultancy)}</td>
                    <td className={cn(TD_CLASS, "text-right tabular-nums font-bold text-slate-900")}>{fmtKes(q.totals?.total, q.with_etims)}</td>
                    <td className={TD_CLASS} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={q.status}
                        onChange={async (e) => {
                          try { await setQuotationStatus(q, e.target.value as QuotationStatus, userName) } catch (err: any) { toast.error(err?.message || "Could not update the status") }
                        }}
                        className={cn("h-8 rounded-full border px-2 text-sm font-semibold outline-none cursor-pointer", badge?.badge)}
                        title={status !== q.status ? "Past its valid-until date" : undefined}
                      >
                        {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      {status !== q.status && <div className="mt-0.5 text-xs font-medium text-amber-700">Past valid date</div>}
                    </td>
                    <td className={cn(TD_CLASS, "whitespace-nowrap")}>{q.valid_until ? formatDateToDMY(q.valid_until) : "—"}</td>
                    <td className={TD_CLASS}>
                      {q.status === "accepted" || q.status === "invoice" ? (
                        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", pmtBadge)}>
                          {PAYMENT_STATUS_LABELS[q.payment_status ?? "unpaid"]}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className={cn(TD_CLASS, "text-sm text-slate-500")}>
                      {q.status !== "proposal" && q.revision_number > 0 ? (
                        <span className="rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold px-2 py-0.5">
                          Rev.{q.revision_number}
                        </span>
                      ) : q.status === "proposal" ? (
                        <span className="text-slate-400 text-xs">Proposal</span>
                      ) : "—"}
                    </td>
                    <td className={cn(TD_CLASS, "whitespace-nowrap")} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button type="button" title="Export to Excel" onClick={() => exportQuotation(q)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200/70 hover:text-slate-800">
                          <FileSpreadsheet className="h-4 w-4" />
                        </button>
                        <button type="button" title="Copy into a new quotation" onClick={() => duplicate(q)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200/70 hover:text-slate-800">
                          <Copy className="h-4 w-4" />
                        </button>
                        {confirmDelete === q.id ? (
                          <Button
                            size="sm"
                            className="h-8 bg-red-600 text-white hover:bg-red-700"
                            onClick={async () => {
                              try { await deleteQuotation(q.id); toast.success(`${q.quote_number} deleted`) } catch (err: any) { toast.error(err?.message || "Could not delete") }
                              setConfirmDelete(null)
                            }}
                          >
                            Delete
                          </Button>
                        ) : (
                          <button type="button" title="Delete" onClick={() => setConfirmDelete(q.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <Pagination totalItems={sorted.length} itemsPerPage={perPage} currentPage={page} onPageChange={setPage} onItemsPerPageChange={(n) => { setPerPage(n); setPage(0) }} />

      <QuotationEditor
        open={editing.open}
        quotation={editing.quotation}
        userName={userName}
        onClose={() => setEditing({ open: false, quotation: null })}
      />
    </div>
  )
}
