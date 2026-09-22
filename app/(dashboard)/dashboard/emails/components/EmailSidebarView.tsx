"use client"

import { useMemo } from "react"
import { Inbox, UserX } from "lucide-react"
import { cn } from "@/lib/utils"
import { EmailList } from "./EmailList"
import type { CategoryOption, Disposition, EmailRow } from "./types"

export const UNASSIGNED = "__unassigned__"

// A mailbox-client-style layout for Needs Review specifically — pick a company from the sidebar
// (like switching mailboxes in Yahoo Mail) and its emails render on the right. Reuses the same
// EmailList used by the flat list view; only the surrounding shell and the company picker differ.
// This is deliberately scoped to Needs Review — it only ever sees emails already kept in the
// database (case-linked or awaiting review), not a full per-company inbox of every message, so it
// needed no ingestion changes.
export function EmailSidebarView({
  emails,
  categories,
  selectedCompany,
  onSelectCompany,
  onOpen,
  onQuickClassify,
}: {
  emails: EmailRow[] // already search-filtered by the page; NOT company-filtered — that's this component's job
  categories: CategoryOption[]
  selectedCompany: string // "" = all, UNASSIGNED = no company, else a company id
  onSelectCompany: (id: string) => void
  onOpen: (e: EmailRow) => void
  onQuickClassify: (e: EmailRow, d: Disposition) => void
}) {
  const companies = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; count: number }>()
    let unassigned = 0
    for (const e of emails) {
      if (!e.company_id) { unassigned++; continue }
      const entry = byId.get(e.company_id) ?? { id: e.company_id, name: e.company_name ?? "Unnamed company", count: 0 }
      entry.count++
      byId.set(e.company_id, entry)
    }
    const list = [...byId.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    return { list, unassigned }
  }, [emails])

  const visibleEmails = useMemo(() => {
    if (!selectedCompany) return emails
    if (selectedCompany === UNASSIGNED) return emails.filter((e) => !e.company_id)
    return emails.filter((e) => e.company_id === selectedCompany)
  }, [emails, selectedCompany])

  return (
    <div className="flex gap-4 items-start">
      {/* Mailbox switcher */}
      <div className="w-64 shrink-0 border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Companies</p>
        </div>
        <div className="max-h-[calc(100vh-24rem)] overflow-y-auto p-2 space-y-0.5">
          <SidebarRow
            icon={<Inbox className="w-3.5 h-3.5" />}
            label="All companies"
            count={emails.length}
            active={!selectedCompany}
            onClick={() => onSelectCompany("")}
          />
          {companies.unassigned > 0 && (
            <SidebarRow
              icon={<UserX className="w-3.5 h-3.5" />}
              label="Unassigned"
              count={companies.unassigned}
              active={selectedCompany === UNASSIGNED}
              onClick={() => onSelectCompany(UNASSIGNED)}
            />
          )}
          {companies.list.length === 0 && companies.unassigned === 0 && (
            <p className="text-xs text-slate-400 px-3 py-4 text-center">Nothing to review.</p>
          )}
          {companies.list.length > 0 && <div className="my-1.5 border-t border-slate-100" />}
          {companies.list.map((c) => (
            <SidebarRow
              key={c.id}
              label={c.name}
              count={c.count}
              active={selectedCompany === c.id}
              onClick={() => onSelectCompany(c.id)}
            />
          ))}
        </div>
      </div>

      {/* Selected mailbox's emails */}
      <div className="flex-1 min-w-0">
        <EmailList emails={visibleEmails} categories={categories} onOpen={onOpen} onQuickClassify={onQuickClassify} />
      </div>
    </div>
  )
}

function SidebarRow({
  icon, label, count, active, onClick,
}: {
  icon?: React.ReactNode
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-colors",
        active ? "bg-custom-blue text-white shadow-sm" : "text-slate-700 hover:bg-slate-100"
      )}
    >
      {icon && <span className={cn("shrink-0", active ? "text-white" : "text-slate-400")}>{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {count > 0 && (
        <span
          className={cn(
            "shrink-0 inline-flex items-center justify-center font-bold tabular-nums px-2 py-0.5 rounded-full text-xs min-w-[1.375rem] leading-none",
            active ? "bg-white/25 text-white" : "bg-slate-200 text-slate-600"
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}
