"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Columns3, List, Loader2, Mail, Plus, RefreshCw, RotateCcw, Search, Wifi, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { CaseDialog } from "./components/CaseDialog"
import { CasesTable } from "./components/CasesTable"
import {
  PILL_BUTTON_CLASS,
  PRIMARY_PILL_BUTTON_CLASS,
  TAB_LIST_CLASS,
  TAB_TRIGGER_CLASS,
  URGENT_BADGE_CLASS,
} from "./components/chrome"
import { EmailDialog } from "./components/EmailDialog"
import { EmailList } from "./components/EmailList"
import { EmailSidebarView } from "./components/EmailSidebarView"
import { MailboxesPanel } from "./components/MailboxesPanel"
import { NewCaseDialog } from "./components/NewCaseDialog"
import { SearchSelect } from "./components/SearchSelect"
import {
  DISPOSITION_LABEL,
  type AccountRow,
  type CaseRow,
  type CategoryOption,
  type CompanyOption,
  type Disposition,
  type EmailRow,
  type StaffOption,
} from "./components/types"
import { api } from "./components/utils"

type Tab = "cases" | "review" | "mailboxes"

// Email Center: KRA emails from every connected company mailbox, grouped into cases — each case is a
// task (department 2 / subdepartment 28, "KRA ITAX EMAILS") laid out as the
// "KRA CORESPONDENCE PLATFORM" sheet. Updates and noise never reach this page; anything the
// classifier is unsure about is held in Needs Review.
//
// Everything (mailboxes, companies, staff, every case, every needs-review email) is fetched ONCE on
// load; switching tabs or changing a filter only re-slices what's already in memory — nothing here
// triggers a network call. The only two things that talk to the server again after that are the
// explicit "Refresh" button (reload from the database) and "Sync now" (actually go check Gmail).
// A save inside a dialog updates just that one row in local state from the save's own response,
// never the whole list.
export default function EmailCenterPage() {
  const [tab, setTab] = useState<Tab>("cases")
  const [company, setCompany] = useState("")
  const [assignee, setAssignee] = useState("")
  const [search, setSearch] = useState("")
  const [caseStatus, setCaseStatus] = useState<"open" | "closed" | "all">("open")

  // Needs Review has two views: the flat list (uses the shared `company` filter above, like every
  // other tab) and a mailbox-client-style sidebar (its own, separate company selection — switching
  // to this view doesn't touch or get touched by the shared filter, and switching tabs never loses
  // either one's state).
  const [reviewView, setReviewView] = useState<"list" | "sidebar">("list")
  const [reviewSidebarCompany, setReviewSidebarCompany] = useState("")

  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [cases, setCases] = useState<CaseRow[]>([])
  const [emails, setEmails] = useState<EmailRow[]>([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [openCaseId, setOpenCaseId] = useState<string | null>(null)
  const [openEmailId, setOpenEmailId] = useState<string | null>(null)
  const [newCaseOpen, setNewCaseOpen] = useState(false)

  // Companies and staff barely change within a session, unlike accounts, which "Refresh"/"Sync now"
  // want current. Only the very first overview call fetches them; every later one asks the server to
  // skip that query (?light=1) and this just keeps what it already has.
  const hasFullOverview = useRef(false)
  const loadOverview = useCallback(async () => {
    const light = hasFullOverview.current
    const res = await api<{
      accounts: AccountRow[]; companies: CompanyOption[] | null; categories: CategoryOption[]
      staff: StaffOption[] | null
    }>(`/api/email-center${light ? "?light=1" : ""}`)
    setAccounts(res.accounts)
    setCategories(res.categories)
    if (res.companies) setCompanies(res.companies)
    if (res.staff) setStaff(res.staff)
    hasFullOverview.current = true
  }, [])

  // The one place that fetches the actual case/email lists — every case (status=all; the status
  // filter itself is applied client-side below) and every email currently awaiting review.
  const loadAll = useCallback(async () => {
    await Promise.all([
      loadOverview(),
      api<{ cases: CaseRow[] }>("/api/email-center/cases?status=all").then((r) => setCases(r.cases)),
      api<{ emails: EmailRow[] }>("/api/email-center/emails?disposition=needs_review&limit=200").then((r) => setEmails(r.emails)),
    ])
  }, [loadOverview])

  useEffect(() => {
    setLoading(true)
    loadAll()
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [loadAll])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadAll()
      toast.success("Reloaded.")
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setRefreshing(false)
    }
  }, [loadAll])

  // The only thing that ever talks to Gmail — a full, real check of every mailbox. Also renews any
  // Gmail push watch close to expiring (there is no scheduler and no automatic background sync).
  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await api<{ results: { email: string; ingested: number; failed: number; error?: string }[] }>(
        "/api/email-center/sync",
        { method: "POST", body: JSON.stringify({ mode: "manual" }) }
      )
      const ingested = res.results.reduce((n, r) => n + r.ingested, 0)
      const errors = res.results.filter((r) => r.error || r.failed)
      if (errors.length) toast.warning(`${ingested} new email(s); ${errors.length} mailbox(es) had issues — see Mailboxes.`)
      else toast.success(`${ingested} new email(s) from ${res.results.length} mailbox(es).`)
      await loadAll()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSyncing(false)
    }
  }, [loadAll])

  // Returning from Google's OAuth screen (see /api/gmail/callback): surface the result and jump to
  // the Mailboxes tab so the "Connect Gmail account" button for the next mailbox is right there.
  // The mailbox — and anything its own first sync just found — is already reflected in the
  // mount-time loadAll() above, since the callback syncs the mailbox before redirecting here.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connectedEmail = params.get("email")
    const synced = params.get("synced")
    const error = params.get("error")
    if (params.get("connected") === "true") {
      const n = synced !== null ? Number(synced) : null
      const suffix = n ? ` — ${n} email(s) pulled in already.` : "."
      toast.success((connectedEmail ? `Connected ${connectedEmail}` : "Mailbox connected") + suffix)
      setTab("mailboxes")
    } else if (error) {
      toast.error(`Could not connect: ${error.replace(/_/g, " ")}`)
      setTab("mailboxes")
    } else {
      return
    }
    window.history.replaceState({}, "", window.location.pathname)
  }, [])

  // ── local mutators: every dialog save lands here instead of triggering a reload ──

  const upsertCase = useCallback((c: CaseRow) => {
    setCases((prev) => {
      const i = prev.findIndex((x) => x.id === c.id)
      if (i === -1) return [c, ...prev]
      const next = [...prev]
      next[i] = c
      return next
    })
  }, [])

  const mergeEmail = useCallback((id: string, patch: Partial<EmailRow>) => {
    setEmails((prev) => {
      // A disposition change away from "needs_review" means it no longer belongs in this list.
      if (patch.disposition && patch.disposition !== "needs_review") {
        return prev.filter((e) => e.id !== id)
      }
      return prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
    })
  }, [])

  const updateAccountCompany = useCallback((accountId: string, companyId: string | null) => {
    const companyName = companyId ? companies.find((c) => c.id === companyId)?.company_name ?? null : null
    setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, company_id: companyId, company_name: companyName } : a)))
  }, [companies])

  const quickClassify = async (email: EmailRow, disposition: Disposition) => {
    try {
      const res = await api<{ case_id: string | null; email_patch: Partial<EmailRow>; case: CaseRow | null }>(
        `/api/email-center/emails/${email.id}`,
        { method: "PATCH", body: JSON.stringify({ disposition }) }
      )
      toast.success(`Marked as ${DISPOSITION_LABEL[disposition].toLowerCase()}.`)
      mergeEmail(email.id, res.email_patch)
      if (res.case) upsertCase(res.case)
      if (disposition === "action_required" && res.case_id) setOpenCaseId(res.case_id)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const closeCase = useCallback(() => setOpenCaseId(null), [])
  const closeEmail = useCallback(() => setOpenEmailId(null), [])

  // ── client-side filtering (no network involved in any of this) ──

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cases.filter((c) => {
      if (company && c.company_id !== company) return false
      if (caseStatus !== "all" && c.status !== caseStatus) return false
      if (assignee === "none" && c.assigned_to_id) return false
      else if (assignee && assignee !== "none" && c.assigned_to_id !== assignee) return false
      if (q) {
        const hay = `${c.subject ?? ""} ${c.kra_pin ?? ""} ${c.notice_type ?? ""} ${c.case_ref}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [cases, company, caseStatus, assignee, search])

  const filteredEmails = useMemo(() => {
    const q = search.trim().toLowerCase()
    return emails.filter((e) => {
      if (company && e.company_id !== company) return false
      if (q) {
        const hay = `${e.subject ?? ""} ${e.sender_email} ${e.snippet ?? ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [emails, company, search])

  // Search-only (no company filter) — the sidebar view does its own company slicing from this, via
  // reviewSidebarCompany, independent of the shared `company` filter the list view uses above.
  const searchedEmails = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return emails
    return emails.filter((e) => `${e.subject ?? ""} ${e.sender_email} ${e.snippet ?? ""}`.toLowerCase().includes(q))
  }, [emails, search])

  // ── counts, derived from what's already loaded — no separate server round trip for these ──

  const openCasesCount = useMemo(() => cases.filter((c) => c.status === "open").length, [cases])
  const unassignedMailboxes = useMemo(() => accounts.filter((a) => !a.company_id).length, [accounts])
  const pushHealthy = accounts.some((a) => a.watch_expiry && new Date(a.watch_expiry).getTime() > Date.now())

  const showFilters = tab !== "mailboxes"

  return (
    <div className="flex flex-col flex-1 overflow-auto bg-slate-50">
      {/* Title bar */}
      <div className="border-b border-slate-200 bg-white px-8 py-5 antialiased flex flex-col justify-center">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex flex-col gap-1.5">
            <h1 className="text-[22px] font-black text-slate-900 uppercase tracking-tight truncate leading-none">
              Email Center
            </h1>
            <div className="flex items-center text-sm text-slate-500 font-semibold gap-1 flex-wrap">
              <Mail className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="text-blue-600 font-bold">KRA Correspondence</span>
              <span className="text-slate-300 mx-0.5">/</span>
              <span className="text-slate-500">{openCasesCount} open case{openCasesCount === 1 ? "" : "s"}</span>
              <span className="text-slate-300 mx-0.5">/</span>
              <span className={cn("inline-flex items-center gap-1 shrink-0", pushHealthy ? "text-emerald-600" : "text-slate-400")}>
                {pushHealthy ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {pushHealthy ? "Live" : "Polling"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing || loading} className={PILL_BUTTON_CLASS} title="Reload from the database">
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button variant="outline" onClick={handleSync} disabled={syncing || loading} className={PILL_BUTTON_CLASS} title="Check Gmail for new mail">
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync now
            </Button>
          </div>
        </div>
      </div>

      {unassignedMailboxes > 0 && (
        <button
          onClick={() => setTab("mailboxes")}
          className="mx-8 mt-4 flex items-center gap-2 text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-left shadow-sm"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {unassignedMailboxes} mailbox{unassignedMailboxes === 1 ? "" : "es"} not linked to a company — their emails can't be matched to a client. Link them →
        </button>
      )}

      {/* Tabs */}
      <div className="px-8 py-3 flex items-center gap-4 border-b border-slate-200 bg-white antialiased">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className={TAB_LIST_CLASS}>
            <TabsTrigger value="cases" className={TAB_TRIGGER_CLASS}>KRA Cases</TabsTrigger>
            <TabsTrigger value="review" className={TAB_TRIGGER_CLASS}>
              Needs Review
              {emails.length > 0 && <span className={URGENT_BADGE_CLASS}>{emails.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="mailboxes" className={TAB_TRIGGER_CLASS}>
              Mailboxes
              {unassignedMailboxes > 0 && <span className={URGENT_BADGE_CLASS}>{unassignedMailboxes}</span>}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="border-b border-slate-200 antialiased flex flex-col bg-white">
          <div className="px-8 py-3 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
            <div className="relative group w-full lg:w-[320px] shrink-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder={tab === "cases" ? "Search subject, PIN, case ref…" : "Search subject, sender, content…"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 pl-11 pr-4 bg-white border-slate-300 rounded-full text-sm font-medium focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:border-blue-500 transition-all placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-2.5 flex-wrap shrink-0">
              {/* In the sidebar view, company selection happens in the sidebar itself — this filter
                  would just be a second, disconnected way to do the same thing. */}
              {!(tab === "review" && reviewView === "sidebar") && (
                <SearchSelect
                  variant="pill"
                  className="w-52"
                  value={company}
                  onChange={setCompany}
                  placeholder="All companies"
                  options={[{ value: "", label: "All companies" }, ...companies.map((c) => ({ value: c.id, label: c.company_name }))]}
                />
              )}

              {tab === "review" && (
                <div className="flex p-0.5 bg-slate-100 rounded-full border border-slate-200">
                  <button
                    onClick={() => setReviewView("list")}
                    className={cn(
                      "h-9 px-3 rounded-full text-sm font-bold flex items-center gap-1.5 transition-colors",
                      reviewView === "list" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                    title="Flat list"
                  >
                    <List className="h-3.5 w-3.5" /> List
                  </button>
                  <button
                    onClick={() => setReviewView("sidebar")}
                    className={cn(
                      "h-9 px-3 rounded-full text-sm font-bold flex items-center gap-1.5 transition-colors",
                      reviewView === "sidebar" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                    title="By company, mailbox-style"
                  >
                    <Columns3 className="h-3.5 w-3.5" /> By company
                  </button>
                </div>
              )}

              {tab === "cases" && (
                <>
                  <SearchSelect
                    variant="pill"
                    className="w-40"
                    value={caseStatus}
                    onChange={(v) => setCaseStatus(v as typeof caseStatus)}
                    options={[
                      { value: "open", label: "Open cases" },
                      { value: "closed", label: "Completed" },
                      { value: "all", label: "All cases" },
                    ]}
                  />
                  <SearchSelect
                    variant="pill"
                    className="w-44"
                    value={assignee}
                    onChange={setAssignee}
                    placeholder="Anyone"
                    options={[
                      { value: "", label: "Anyone" },
                      { value: "none", label: "Unassigned" },
                      ...staff.map((s) => ({ value: s.id, label: s.name })),
                    ]}
                  />
                  <Button onClick={() => setNewCaseOpen(true)} className={PRIMARY_PILL_BUTTON_CLASS} style={{ backgroundColor: "#376bae" }}>
                    <Plus className="h-3.5 w-3.5" /> New case
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="px-8 py-5 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <>
            {tab === "cases" && <CasesTable cases={filteredCases} onOpen={(c) => setOpenCaseId(c.id)} />}
            {tab === "review" && reviewView === "list" && (
              <EmailList
                emails={filteredEmails}
                categories={categories}
                onOpen={(e) => setOpenEmailId(e.id)}
                onQuickClassify={quickClassify}
              />
            )}
            {tab === "review" && reviewView === "sidebar" && (
              <EmailSidebarView
                emails={searchedEmails}
                categories={categories}
                selectedCompany={reviewSidebarCompany}
                onSelectCompany={setReviewSidebarCompany}
                onOpen={(e) => setOpenEmailId(e.id)}
                onQuickClassify={quickClassify}
              />
            )}
            {tab === "mailboxes" && (
              <MailboxesPanel
                accounts={accounts}
                companies={companies}
                onAccountLinked={updateAccountCompany}
                onSynced={handleRefresh}
              />
            )}
          </>
        )}
      </div>

      <CaseDialog
        caseId={openCaseId}
        companies={companies}
        staff={staff}
        onClose={closeCase}
        onCaseLoaded={upsertCase}
        onOpenEmail={(id) => setOpenEmailId(id)}
      />
      <EmailDialog
        emailId={openEmailId}
        categories={categories}
        onClose={closeEmail}
        onEmailChanged={mergeEmail}
        onCaseOpened={upsertCase}
        onOpenCase={(id) => { setOpenEmailId(null); setOpenCaseId(id) }}
      />
      <NewCaseDialog
        open={newCaseOpen}
        companies={companies}
        onClose={() => setNewCaseOpen(false)}
        onCreated={(c) => {
          upsertCase(c)
          setNewCaseOpen(false)
          setOpenCaseId(c.id)
        }}
      />
    </div>
  )
}
