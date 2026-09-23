"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Columns3, List, Loader2, Mail, Plus, RefreshCw, RotateCcw, Search, Wifi, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { CaseDialog, NewCaseDialog } from "./components/CaseDialogs"
import { CasesTable } from "./components/CasesTable"
import { EmailDialog } from "./components/EmailDialog"
import { MailboxesPanel } from "./components/MailboxesPanel"
import { EmailList, EmailSidebarView } from "./components/NeedsReview"
import { fetchCompanies, type Company } from "../companies/database"
import {
  COUNT_BADGE_CLASS, DISPOSITION_LABEL, PILL_BUTTON_CLASS, PRIMARY_PILL_BUTTON_CLASS, SearchSelect,
  TAB_LIST_CLASS, TAB_TRIGGER_CLASS, URGENT_BADGE_CLASS, api,
  type AccountRow, type CaseRow, type CategoryOption, type CompanyOption,
  type Disposition, type EmailRow, type StaffOption,
} from "./components/shared"

type Tab = "inprogress" | "completed" | "review" | "update" | "ignored" | "mailboxes"

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
//
// The `emails` state holds every dispositioned email that has a tab here (needs_review, update_only
// and ignore) as one sorted list; the tabs are client-side filters over it, so quick-classifying an
// email simply moves it between tabs without a reload.
const EMAIL_TABS = ["needs_review", "update_only", "ignore"] as const

function byReceivedDesc(list: EmailRow[]): EmailRow[] {
  return list.sort((a, b) => (a.received_at < b.received_at ? 1 : a.received_at > b.received_at ? -1 : 0))
}

function meetsCaseFilters(c: CaseRow, company: string, assignee: string, q: string): boolean {
  if (company && c.company_id !== company) return false
  if (assignee === "none" && c.assigned_to_id) return false
  else if (assignee && assignee !== "none" && c.assigned_to_id !== assignee) return false
  if (q) {
    const hay = `${c.subject ?? ""} ${c.kra_pin ?? ""} ${c.notice_type ?? ""} ${c.case_ref}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

function meetsEmailFilters(e: EmailRow, company: string, q: string): boolean {
  if (company && e.company_id !== company) return false
  if (q) {
    const hay = `${e.subject ?? ""} ${e.sender_email} ${e.snippet ?? ""}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

export default function EmailCenterPage() {
  const [tab, setTab] = useState<Tab>("inprogress")
  const [company, setCompany] = useState("")
  const [assignee, setAssignee] = useState("")
  const [search, setSearch] = useState("")

  // Needs Review has two views: the flat list (uses the shared `company` filter above, like every
  // other tab) and a mailbox-client-style sidebar (its own, separate company selection — switching
  // to this view doesn't touch or get touched by the shared filter, and switching tabs never loses
  // either one's state).
  const [reviewView, setReviewView] = useState<"list" | "sidebar">("list")
  const [reviewSidebarCompany, setReviewSidebarCompany] = useState("")

  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  // Full company records (with ACC/IMM/Audit/Sheria effective dates + cease details) for the Needs
  // Review sidebar's Client Category Filter — the thin CompanyOption list above doesn't carry those
  // fields. Fetched the same way every other module's company sidebar does: directly from Supabase
  // client-side, not through /api/email-center. Loaded once; the category filter itself is a
  // client-side predicate, so no refetch is needed as filters change.
  const [fullCompanies, setFullCompanies] = useState<Company[]>([])
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

  // The one place that fetches the actual case/email lists — every case (the per-status tab
  // filtering itself is applied client-side below) and every dispositioned email that has a tab
  // here (needs_review, update_only, ignore), merged into one sorted list the tabs slice.
  const loadAll = useCallback(async () => {
    const fetchLists = async () => {
      const [casesRes, reviewRes, updateRes, ignoreRes] = await Promise.all([
        api<{ cases: CaseRow[] }>("/api/email-center/cases?status=all"),
        api<{ emails: EmailRow[] }>(`/api/email-center/emails?disposition=${EMAIL_TABS[0]}&limit=200`),
        api<{ emails: EmailRow[] }>(`/api/email-center/emails?disposition=${EMAIL_TABS[1]}&limit=200`),
        api<{ emails: EmailRow[] }>(`/api/email-center/emails?disposition=${EMAIL_TABS[2]}&limit=200`),
      ])
      setCases(casesRes.cases)
      setEmails(byReceivedDesc([...reviewRes.emails, ...updateRes.emails, ...ignoreRes.emails]))
    }
    await Promise.all([loadOverview(), fetchLists()])
  }, [loadOverview])

  useEffect(() => {
    setLoading(true)
    loadAll()
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [loadAll])

  // Loaded once, independent of Refresh/Sync now — the Needs Review sidebar's company list and
  // Client Category Filter don't need to be as fresh as accounts/cases/emails.
  useEffect(() => {
    fetchCompanies().then(setFullCompanies).catch((e: any) => toast.error(e.message))
  }, [])

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
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
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

  const openCases = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cases.filter((c) => c.status === "open" && meetsCaseFilters(c, company, assignee, q))
  }, [cases, company, assignee, search])

  const closedCases = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cases.filter((c) => c.status === "closed" && meetsCaseFilters(c, company, assignee, q))
  }, [cases, company, assignee, search])

  const reviewEmails = useMemo(() => {
    const q = search.trim().toLowerCase()
    return emails.filter((e) => e.disposition === "needs_review" && meetsEmailFilters(e, company, q))
  }, [emails, company, search])

  const updateEmails = useMemo(() => {
    const q = search.trim().toLowerCase()
    return emails.filter((e) => e.disposition === "update_only" && meetsEmailFilters(e, company, q))
  }, [emails, company, search])

  const ignoredEmails = useMemo(() => {
    const q = search.trim().toLowerCase()
    return emails.filter((e) => e.disposition === "ignore" && meetsEmailFilters(e, company, q))
  }, [emails, company, search])

  // Search-only (no company filter) over the needs-review subset — the sidebar view does its own
  // company slicing from this, via reviewSidebarCompany, independent of the shared `company` filter
  // the list view uses above.
  const searchedReviewEmails = useMemo(() => {
    const q = search.trim().toLowerCase()
    return emails.filter(
      (e) => e.disposition === "needs_review" && (!q || `${e.subject ?? ""} ${e.sender_email} ${e.snippet ?? ""}`.toLowerCase().includes(q))
    )
  }, [emails, search])

  // ── counts, derived from what's already loaded — no separate server round trip for these ──

  const openCasesCount = useMemo(() => cases.filter((c) => c.status === "open").length, [cases])
  const closedCasesCount = useMemo(() => cases.filter((c) => c.status === "closed").length, [cases])
  const reviewCount = useMemo(() => emails.filter((e) => e.disposition === "needs_review").length, [emails])
  const updateCount = useMemo(() => emails.filter((e) => e.disposition === "update_only").length, [emails])
  const ignoreCount = useMemo(() => emails.filter((e) => e.disposition === "ignore").length, [emails])
  const unassignedMailboxes = useMemo(() => accounts.filter((a) => !a.company_id).length, [accounts])
  const pushHealthy = accounts.some((a) => a.watch_expiry && new Date(a.watch_expiry).getTime() > Date.now())

  const showFilters = tab !== "mailboxes"

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-50/50">
      {/* Title bar */}
      <div className="border-b border-slate-200/80 bg-white px-6 py-3.5 antialiased flex flex-col justify-center shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-none">
                Email Center
              </h1>
              <span className="text-[11px] font-semibold text-custom-blue bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                KRA Correspondence
              </span>
            </div>
            <div className="flex items-center text-xs text-slate-500 font-medium gap-1.5 flex-wrap">
              <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span>{openCasesCount} open case{openCasesCount === 1 ? "" : "s"}</span>
              <span className="text-slate-300">·</span>
              <span className={cn("inline-flex items-center gap-1 shrink-0 font-medium", pushHealthy ? "text-emerald-600" : "text-slate-400")}>
                {pushHealthy ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {pushHealthy ? "Live Push" : "Polling"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || loading} className={PILL_BUTTON_CLASS} title="Reload from the database">
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing || loading} className={PILL_BUTTON_CLASS} title="Check Gmail for new mail">
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync now
            </Button>
          </div>
        </div>
      </div>

      {unassignedMailboxes > 0 && (
        <button
          onClick={() => setTab("mailboxes")}
          className="mx-6 mt-3 flex items-center gap-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2 text-left shadow-xs hover:bg-amber-100/60 transition-colors"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
          <span>{unassignedMailboxes} mailbox{unassignedMailboxes === 1 ? "" : "es"} not linked to a company — their emails can't be matched to a client. <span className="underline font-bold">Link them →</span></span>
        </button>
      )}

      {/* Tabs */}
      <div className="px-6 py-2 flex items-center gap-4 border-b border-slate-200/80 bg-white antialiased shrink-0">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className={TAB_LIST_CLASS}>
            <TabsTrigger value="inprogress" className={TAB_TRIGGER_CLASS}>
              In Progress
              {openCasesCount > 0 && <span className={COUNT_BADGE_CLASS}>{openCasesCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="completed" className={TAB_TRIGGER_CLASS}>
              Completed
              {closedCasesCount > 0 && <span className={COUNT_BADGE_CLASS}>{closedCasesCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="review" className={TAB_TRIGGER_CLASS}>
              Needs Review
              {reviewCount > 0 && <span className={URGENT_BADGE_CLASS}>{reviewCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="update" className={TAB_TRIGGER_CLASS}>
              Update
              {updateCount > 0 && <span className={COUNT_BADGE_CLASS}>{updateCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="ignored" className={TAB_TRIGGER_CLASS}>
              Ignored
              {ignoreCount > 0 && <span className={COUNT_BADGE_CLASS}>{ignoreCount}</span>}
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
        <div className="border-b border-slate-200/80 antialiased flex flex-col bg-slate-50/60 shrink-0">
          <div className="px-6 py-2.5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2.5">
            <div className="relative group w-full lg:w-72 shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder={tab === "inprogress" || tab === "completed" ? "Search subject, PIN, case ref…" : "Search subject, sender, content…"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 pl-8 pr-3 bg-white border-slate-200 rounded-md text-xs font-medium focus-visible:ring-1 focus-visible:ring-custom-blue transition-all placeholder:text-slate-400 shadow-none"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {!(tab === "review" && reviewView === "sidebar") && (
                <SearchSelect
                  className="w-52"
                  value={company}
                  onChange={setCompany}
                  placeholder="All companies"
                  options={[{ value: "", label: "All companies" }, ...companies.map((c) => ({ value: c.id, label: c.company_name }))]}
                />
              )}

              {tab === "review" && (
                <div className="flex p-0.5 bg-slate-200/60 rounded-md border border-slate-200">
                  <button
                    onClick={() => setReviewView("list")}
                    className={cn(
                      "h-7 px-2.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-all",
                      reviewView === "list" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    )}
                    title="Flat list"
                  >
                    <List className="h-3.5 w-3.5" /> List
                  </button>
                  <button
                    onClick={() => setReviewView("sidebar")}
                    className={cn(
                      "h-7 px-2.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-all",
                      reviewView === "sidebar" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    )}
                    title="By company, mailbox-style"
                  >
                    <Columns3 className="h-3.5 w-3.5" /> By company
                  </button>
                </div>
              )}

              {(tab === "inprogress" || tab === "completed") && (
                <>
                  <SearchSelect
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
                  <Button size="sm" onClick={() => setNewCaseOpen(true)} className="h-8 px-3.5 rounded-md text-xs font-semibold bg-custom-blue hover:bg-custom-blue/90 text-white shadow-xs gap-1.5 flex items-center">
                    <Plus className="h-3.5 w-3.5" /> New case
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="px-6 py-4 flex-1 flex flex-col min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <>
            {(tab === "inprogress" || tab === "completed") && (
              <CasesTable cases={tab === "inprogress" ? openCases : closedCases} onOpen={(c) => setOpenCaseId(c.id)} />
            )}
            {tab === "review" && reviewView === "list" && (
              <div className="flex-1 min-h-0 flex flex-col">
                <EmailList
                  emails={reviewEmails}
                  categories={categories}
                  onOpen={(e) => setOpenEmailId(e.id)}
                  onQuickClassify={quickClassify}
                />
              </div>
            )}
            {tab === "review" && reviewView === "sidebar" && (
              <EmailSidebarView
                emails={searchedReviewEmails}
                companies={fullCompanies}
                categories={categories}
                selectedCompany={reviewSidebarCompany}
                onSelectCompany={setReviewSidebarCompany}
                onOpen={(e) => setOpenEmailId(e.id)}
                onQuickClassify={quickClassify}
              />
            )}
            {(tab === "update" || tab === "ignored") && (
              <div className="flex-1 min-h-0 flex flex-col">
                <EmailList
                  emails={tab === "update" ? updateEmails : ignoredEmails}
                  categories={categories}
                  onOpen={(e) => setOpenEmailId(e.id)}
                  onQuickClassify={quickClassify}
                  emptyMessage={tab === "update" ? "No emails marked Update only." : "No ignored emails."}
                />
              </div>
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
