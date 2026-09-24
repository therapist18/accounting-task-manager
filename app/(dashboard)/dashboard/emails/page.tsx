"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Clock, Columns3, History, Loader2, Plus, RefreshCw, RotateCcw, Search, Wifi, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { CaseDialog, NewCaseDialog } from "./components/CaseDialogs"
import { CasesTable } from "./components/CasesTable"
import { EmailDialog } from "./components/EmailDialog"
import { MailboxesPanel } from "./components/MailboxesPanel"
import { RulesPanel } from "./components/RulesPanel"
import { SyncDialog } from "./components/SyncDialog"
import { CompanyPanels, matchesCompanySelection } from "./components/CompanyPanels"
import { EmailsTable } from "./components/NeedsReview"
import { fetchCompanies, type Company } from "../companies/database"
import {
  COUNT_BADGE_CLASS, DISPOSITION_LABEL, PILL_BUTTON_ACTIVE_CLASS, PILL_BUTTON_CLASS, PRIMARY_PILL_BUTTON_CLASS, SearchSelect,
  TAB_LIST_CLASS, TAB_TRIGGER_CLASS, URGENT_BADGE_CLASS, api,
  type AccountRow, type CaseRow, type CategoryOption, type CompanyOption,
  type Disposition, type EmailRow, type RuleRow, type StaffOption,
} from "./components/shared"

type Tab = "inprogress" | "completed" | "review" | "update" | "ignored" | "mailboxes" | "rules"

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

function meetsCaseFilters(c: CaseRow, assignee: string, q: string): boolean {
  if (assignee === "none" && c.assigned_to_id) return false
  else if (assignee && assignee !== "none" && c.assigned_to_id !== assignee) return false
  if (q) {
    const hay = `${c.subject ?? ""} ${c.kra_pin ?? ""} ${c.notice_type ?? ""} ${c.case_ref}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

function meetsEmailFilters(e: EmailRow, q: string): boolean {
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

  // "By company" swaps the toolbar's company dropdown for a resizable company sidebar on every list
  // tab; its selection is separate from the dropdown's, so switching modes never loses either one.
  const [byCompany, setByCompany] = useState(false)
  const [sidebarCompany, setSidebarCompany] = useState("")
  // Timestamps show HH:mm by default, like the other modules; the toolbar button hides it.
  const [showTime, setShowTime] = useState(true)

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
  const [rules, setRules] = useState<RuleRow[]>([])
  const [rulesSource, setRulesSource] = useState<"database" | "builtin">("database")

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [openCaseId, setOpenCaseId] = useState<string | null>(null)
  // The email behind the open dialog, captured as a row (from a table or a case thread) — the dialog
  // renders straight from it, so opening an email never waits on a request for its details.
  const [openEmailSeed, setOpenEmailSeed] = useState<EmailRow | null>(null)
  const [newCaseOpen, setNewCaseOpen] = useState(false)
  // "Sync from date" dialog; presetIds is set when it is opened from one company's row.
  const [syncFromOpen, setSyncFromOpen] = useState(false)
  const [syncFromIds, setSyncFromIds] = useState<string[] | undefined>(undefined)
  const [companiesLoading, setCompaniesLoading] = useState(true)

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
      const [casesRes, reviewRes, updateRes, ignoreRes, rulesRes] = await Promise.all([
        api<{ cases: CaseRow[] }>("/api/email-center/cases?status=all"),
        api<{ emails: EmailRow[] }>(`/api/email-center/emails?disposition=${EMAIL_TABS[0]}&limit=200`),
        api<{ emails: EmailRow[] }>(`/api/email-center/emails?disposition=${EMAIL_TABS[1]}&limit=200`),
        api<{ emails: EmailRow[] }>(`/api/email-center/emails?disposition=${EMAIL_TABS[2]}&limit=200`),
        // A rules problem must never take the whole page down with it.
        api<{ rules: RuleRow[]; source: "database" | "builtin" }>("/api/email-center/rules").catch(() => ({ rules: [] as RuleRow[], source: "builtin" as const })),
      ])
      setRules(rulesRes.rules)
      setRulesSource(rulesRes.source)
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
    fetchCompanies().then(setFullCompanies).catch((e: any) => toast.error(e.message)).finally(() => setCompaniesLoading(false))
  }, [])

  // After a "Sync from date" run: reload what it pulled in, without the "Reloaded." toast.
  const reloadQuietly = useCallback(() => {
    loadAll().catch((e: any) => toast.error(e.message))
  }, [loadAll])

  const openSyncFrom = useCallback((ids?: string[]) => {
    setSyncFromIds(ids)
    setSyncFromOpen(true)
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
  // Prefer the live copy in `emails` (kept current by local merges) over the row captured on open; emails
  // opened from a case thread that aren't in any tab just use the captured row.
  const openEmail = useMemo(
    () => (openEmailSeed ? emails.find((e) => e.id === openEmailSeed.id) ?? openEmailSeed : null),
    [emails, openEmailSeed]
  )
  const openCase = useMemo(() => (openCaseId ? cases.find((c) => c.id === openCaseId) ?? null : null), [cases, openCaseId])

  const closeEmail = useCallback(() => setOpenEmailSeed(null), [])

  // ── client-side filtering (no network involved in any of this) ──
  //
  // Each tab first gets a "base" list (search + assignee applied, company NOT applied). The company
  // narrowing — the toolbar dropdown, or the "By company" sidebar when that's on — is applied on top,
  // so the sidebar's per-company counts are always computed from the base lists.

  const q = search.trim().toLowerCase()

  const baseOpenCases = useMemo(() => cases.filter((c) => c.status === "open" && meetsCaseFilters(c, assignee, q)), [cases, assignee, q])
  const baseClosedCases = useMemo(() => cases.filter((c) => c.status === "closed" && meetsCaseFilters(c, assignee, q)), [cases, assignee, q])
  const baseReviewEmails = useMemo(() => emails.filter((e) => e.disposition === "needs_review" && meetsEmailFilters(e, q)), [emails, q])
  const baseUpdateEmails = useMemo(() => emails.filter((e) => e.disposition === "update_only" && meetsEmailFilters(e, q)), [emails, q])
  const baseIgnoredEmails = useMemo(() => emails.filter((e) => e.disposition === "ignore" && meetsEmailFilters(e, q)), [emails, q])

  const passesCompany = useCallback(
    (companyId: string | null) => (byCompany ? matchesCompanySelection(companyId, sidebarCompany) : !company || companyId === company),
    [byCompany, sidebarCompany, company]
  )

  const openCases = useMemo(() => baseOpenCases.filter((c) => passesCompany(c.company_id)), [baseOpenCases, passesCompany])
  const closedCases = useMemo(() => baseClosedCases.filter((c) => passesCompany(c.company_id)), [baseClosedCases, passesCompany])
  const reviewEmails = useMemo(() => baseReviewEmails.filter((e) => passesCompany(e.company_id)), [baseReviewEmails, passesCompany])
  const updateEmails = useMemo(() => baseUpdateEmails.filter((e) => passesCompany(e.company_id)), [baseUpdateEmails, passesCompany])
  const ignoredEmails = useMemo(() => baseIgnoredEmails.filter((e) => passesCompany(e.company_id)), [baseIgnoredEmails, passesCompany])

  const activeBase: { company_id: string | null }[] =
    tab === "inprogress" ? baseOpenCases
      : tab === "completed" ? baseClosedCases
      : tab === "review" ? baseReviewEmails
      : tab === "update" ? baseUpdateEmails
      : tab === "ignored" ? baseIgnoredEmails
      : []
  const activeCompanyIds = useMemo(() => activeBase.map((x) => x.company_id), [activeBase])

  // ── counts, derived from what's already loaded — no separate server round trip for these ──

  const openCasesCount = useMemo(() => cases.filter((c) => c.status === "open").length, [cases])
  const closedCasesCount = useMemo(() => cases.filter((c) => c.status === "closed").length, [cases])
  const reviewCount = useMemo(() => emails.filter((e) => e.disposition === "needs_review").length, [emails])
  const updateCount = useMemo(() => emails.filter((e) => e.disposition === "update_only").length, [emails])
  const ignoreCount = useMemo(() => emails.filter((e) => e.disposition === "ignore").length, [emails])
  const unassignedMailboxes = useMemo(() => accounts.filter((a) => !a.company_id).length, [accounts])
  const pushHealthy = accounts.some((a) => a.watch_expiry && new Date(a.watch_expiry).getTime() > Date.now())

  const isCaseTab = tab === "inprogress" || tab === "completed"
  const isListTab = tab !== "mailboxes" && tab !== "rules"

  const emptyMessage = tab === "review" ? "Nothing needs review right now." : tab === "update" ? "No emails marked Update only." : "No ignored emails."

  const tabTable = (embedded: boolean) => {
    if (isCaseTab) {
      return <CasesTable cases={tab === "inprogress" ? openCases : closedCases} onOpen={(c) => setOpenCaseId(c.id)} showTime={showTime} embedded={embedded} loading={loading} />
    }
    return (
      <EmailsTable
        emails={tab === "review" ? reviewEmails : tab === "update" ? updateEmails : ignoredEmails}
        categories={categories}
        onOpen={(e) => setOpenEmailSeed(e)}
        onQuickClassify={quickClassify}
        showTime={showTime}
        loading={loading}
        emptyMessage={emptyMessage}
        embedded={embedded}
      />
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-50/50">
      {/* Row 1: identity + global actions */}
      <div className="border-b border-slate-200/80 bg-white px-4 py-2.5 antialiased flex items-center gap-x-3 gap-y-2 flex-wrap shrink-0">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Email Center</h1>
        <span className="text-sm font-semibold text-custom-blue bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
          KRA Correspondence
        </span>
        <div className="hidden md:flex items-center text-base text-slate-500 gap-1.5">
          <span>{openCasesCount} open case{openCasesCount === 1 ? "" : "s"}</span>
          <span className="text-slate-300">·</span>
          <span className={cn("inline-flex items-center gap-1 font-medium", pushHealthy ? "text-emerald-600" : "text-slate-400")}>
            {pushHealthy ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {pushHealthy ? "Live Push" : "Polling"}
          </span>
        </div>

        {unassignedMailboxes > 0 && (
          <button
            onClick={() => setTab("mailboxes")}
            className="inline-flex items-center gap-1.5 text-base font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 hover:bg-amber-100 transition-colors"
            title="These mailboxes' emails can't be matched to a client until they're linked to a company"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            {unassignedMailboxes} mailbox{unassignedMailboxes === 1 ? "" : "es"} not linked
            <span className="underline font-semibold">Link →</span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTime((v) => !v)}
            className={cn(PILL_BUTTON_CLASS, showTime && "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100")}
            title="Show or hide the time on timestamps"
          >
            <Clock className="h-5 w-5" />
            {showTime ? "Hide Time" : "Show Time"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || loading} className={PILL_BUTTON_CLASS} title="Reload from the database">
            {refreshing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />}
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing || loading} className={PILL_BUTTON_CLASS} title="Check Gmail for new mail">
            {syncing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
            Sync now
          </Button>
          <Button variant="outline" size="sm" onClick={() => openSyncFrom()} disabled={loading} className={PILL_BUTTON_CLASS} title="Pull in older mail from a chosen date">
            <History className="h-5 w-5" />
            Sync from date
          </Button>
        </div>
      </div>

      {/* Row 2: tabs + filters */}
      <div className="border-b border-slate-200/80 bg-slate-50/60 px-4 py-2 antialiased flex items-center gap-x-4 gap-y-2 flex-wrap shrink-0">
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
            <TabsTrigger value="rules" className={TAB_TRIGGER_CLASS}>
              Rules
              {rules.length > 0 && <span className={COUNT_BADGE_CLASS}>{rules.length}</span>}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input
              placeholder={
                tab === "mailboxes" ? "Search mailbox, company, status…"
                  : tab === "rules" ? "Search rules…"
                  : isCaseTab ? "Search subject, PIN, case ref…"
                  : "Search subject, sender, content…"
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-10 pr-3 bg-white border-slate-200 rounded-md text-base focus-visible:ring-1 focus-visible:ring-custom-blue placeholder:text-slate-400 shadow-none"
            />
          </div>

          {isListTab && !byCompany && (
            <SearchSelect
              className="w-52"
              value={company}
              onChange={setCompany}
              placeholder="All companies"
              options={[{ value: "", label: "All companies" }, ...companies.map((c) => ({ value: c.id, label: c.company_name }))]}
            />
          )}

          {isCaseTab && (
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
          )}

          {isListTab && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setByCompany((v) => !v)}
              className={cn(PILL_BUTTON_CLASS, byCompany && PILL_BUTTON_ACTIVE_CLASS)}
              title="Show a resizable company sidebar and browse one company at a time"
            >
              <Columns3 className="h-5 w-5" /> By company
            </Button>
          )}

          {isCaseTab && (
            <Button size="sm" onClick={() => setNewCaseOpen(true)} className={PRIMARY_PILL_BUTTON_CLASS}>
              <Plus className="h-5 w-5" /> New case
            </Button>
          )}
        </div>
      </div>

      {/* Body — tables own their scrolling and fill whatever height is left */}
      <div className="px-3 py-3 flex-1 min-h-0 flex flex-col overflow-hidden">
        {tab === "rules" ? (
          <RulesPanel rules={rules} source={rulesSource} categories={categories} loading={loading} search={search} onRulesChange={setRules} />
        ) : tab === "mailboxes" ? (
          <MailboxesPanel
            accounts={accounts}
            companies={fullCompanies}
            search={search}
            onAccountLinked={updateAccountCompany}
            onSynced={handleRefresh}
            onSyncFrom={openSyncFrom}
            showTime={showTime}
            loading={loading || companiesLoading}
          />
        ) : byCompany ? (
          <CompanyPanels companies={fullCompanies} companyIds={activeCompanyIds} selected={sidebarCompany} onSelect={setSidebarCompany}>
            {tabTable(true)}
          </CompanyPanels>
        ) : (
          tabTable(false)
        )}
      </div>

      <CaseDialog
        caseId={openCaseId}
        initialCase={openCase}
        companies={companies}
        staff={staff}
        onClose={closeCase}
        onCaseLoaded={upsertCase}
        onOpenEmail={(e) => setOpenEmailSeed(e)}
      />
      <EmailDialog
        email={openEmail}
        categories={categories}
        onClose={closeEmail}
        onEmailChanged={mergeEmail}
        onCaseOpened={upsertCase}
        onOpenCase={(id) => { setOpenEmailSeed(null); setOpenCaseId(id) }}
        onRuleCreated={(r) => setRules((prev) => [...prev, r])}
      />
      <SyncDialog
        open={syncFromOpen}
        accounts={accounts}
        presetIds={syncFromIds}
        onClose={() => setSyncFromOpen(false)}
        onFinished={reloadQuietly}
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
