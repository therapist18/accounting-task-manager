"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Clock, Columns3, History, Loader2, Plus, RefreshCw, RotateCcw, Search, Sparkles, Wifi, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { CaseDialog, NewCaseDialog } from "./components/CaseDialogs"
import { CasesTable } from "./components/CasesTable"
import { EmailDialog } from "./components/EmailDialog"
import { MailboxesPanel, type MailboxView } from "./components/MailboxesPanel"
import { IgnoredPanel } from "./components/IgnoredPanel"
import { RulesPanel } from "./components/RulesPanel"
import { SyncDialog } from "./components/SyncDialog"
import { CompanyPanels, matchesCompanySelection } from "./components/CompanyPanels"
import { EmailsTable } from "./components/NeedsReview"
import { fetchCompanies, fetchKraEmailCredentials, saveKraEmailPassword, type Company, type KraEmailCredentials } from "../companies/database"
import {
  COUNT_BADGE_CLASS, DISPOSITION_LABEL, PILL_BUTTON_ACTIVE_CLASS, PILL_BUTTON_CLASS, PRIMARY_PILL_BUTTON_CLASS, SearchSelect,
  TAB_LIST_CLASS, TAB_TRIGGER_CLASS, URGENT_BADGE_CLASS, api, needsReconnect,
  type AccountRow, type CaseRow, type CategoryOption, type CompanyOption,
  type Disposition, type EmailRow, type RuleRow, type StaffOption,
} from "./components/shared"

type Tab = "inprogress" | "completed" | "review" | "notifications" | "update" | "ignored" | "mailboxes" | "rules"

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

// The three per-disposition fetches can in theory return the same row twice (a save or reclassify
// moving a row between dispositions mid-fetch); keep one copy per id so the tabs never render a
// duplicate key.
function uniqueByEmailId(list: EmailRow[]): EmailRow[] {
  const seen = new Set<string>()
  const out: EmailRow[] = []
  for (const e of list) {
    if (!seen.has(e.id)) {
      seen.add(e.id)
      out.push(e)
    }
  }
  return out
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
  // Which chip the Mailboxes tab is on. Lives here so the toolbar's failed-mailboxes indicator can jump
  // straight to the "Needs reconnect" view; the nonce tells the panel a jump was requested.
  const [mailboxView, setMailboxView] = useState<MailboxView>("all")
  const [mailboxFocusNonce, setMailboxFocusNonce] = useState(0)
  // The Notifications basket is a work queue: "active" (default) is what needs someone to take it on,
  // "handled" is the audit trail of who worked each notification and when.
  const [notificationFilter, setNotificationFilter] = useState<"active" | "handled">("active")
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
  // Each company's KRA portal mailbox login (kra_email_address / kra_email_password), shown on the
  // Mailboxes tab. Loaded separately so the password isn't part of the shared company records.
  const [kraCredentials, setKraCredentials] = useState<Map<string, KraEmailCredentials>>(new Map())
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
  // Shown the moment a rule is created: the rule changes what the mails already sitting in Needs
  // Review would be classified as, so offer to re-run them through it (or skip and leave them).
  // `pattern` is absent when the dialog was opened from the toolbar's "Reclassify" button instead.
  const [reclassifyPrompt, setReclassifyPrompt] = useState<{ pattern?: string; is_ignore?: boolean; is_notify?: boolean } | null>(null)
  const [reclassifying, setReclassifying] = useState(false)
  // 0→100 of a reclassify run, so the dialog shows a "10 of 128" progress bar like syncing does.
  const [reclassifyProgress, setReclassifyProgress] = useState<{ done: number; total: number } | null>(null)
  // A new rule was created this session and the Needs Review mails haven't been re-run through it
  // yet — the toolbar's Reclassify button glows until that happens.
  const [reclassifyDue, setReclassifyDue] = useState(false)
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
        // No &limit= here on purpose — this wants the whole tab, same as the comment above always
        // said; a leftover 200-row cap was silently hiding real mail once needs_review passed it
        // system-wide. The route's own default (25,000) is the actual ceiling now.
        api<{ emails: EmailRow[] }>(`/api/email-center/emails?disposition=${EMAIL_TABS[0]}`),
        api<{ emails: EmailRow[] }>(`/api/email-center/emails?disposition=${EMAIL_TABS[1]}`),
        api<{ emails: EmailRow[] }>(`/api/email-center/emails?disposition=${EMAIL_TABS[2]}`),
        // A rules problem must never take the whole page down with it.
        api<{ rules: RuleRow[]; source: "database" | "builtin" }>("/api/email-center/rules").catch(() => ({ rules: [] as RuleRow[], source: "builtin" as const })),
      ])
      setRules(rulesRes.rules)
      setRulesSource(rulesRes.source)
      setCases(casesRes.cases)
      setEmails(byReceivedDesc(uniqueByEmailId([...reviewRes.emails, ...updateRes.emails, ...ignoreRes.emails])))
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
    fetchKraEmailCredentials().then(setKraCredentials).catch((e: any) => toast.error(`Could not load KRA email credentials: ${e.message}`))
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

  // A rule was created (Rules tab or "Remember this"): add it to the local list and ask whether to
  // re-run the mails currently in Needs Review through it — that's how you see which ones the new
  // rule would now handle automatically. The Rules tab's own save() already appends the rule to
  // `rules` itself before calling this, so the add here has to be idempotent (by id) rather than
  // unconditional, or that path ends up with the same row twice — "Remember this", which has no
  // local rules list of its own, still gets its one and only add from here.
  const handleRuleCreated = useCallback((rule: RuleRow) => {
    setRules((prev) => (prev.some((r) => r.id === rule.id) ? prev : [...prev, rule]))
    setReclassifyDue(true)
    setReclassifyPrompt({ pattern: rule.pattern, is_ignore: rule.is_ignore, is_notify: rule.is_notify })
  }, [])

  // A wording was added to an existing rule from the email dialog: same follow-up as a new rule — offer to
  // re-run Needs Review through it.
  const handleRuleUpdated = useCallback((rule: RuleRow, addedWording: string) => {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? rule : r)))
    setReclassifyDue(true)
    setReclassifyPrompt({ pattern: addedWording, is_ignore: rule.is_ignore, is_notify: rule.is_notify })
  }, [])

  const runReclassify = async () => {
    setReclassifying(true)
    setReclassifyProgress({ done: 0, total: 0 })
    try {
      const listed = await api<{ ids: string[]; total: number }>("/api/email-center/reclassify", {
        method: "POST",
        body: JSON.stringify({ action: "list" }),
      })
      if (listed.ids.length === 0) {
        toast.info("Nothing in Needs Review to reclassify.")
        setReclassifyDue(false)
        return
      }
      setReclassifyProgress({ done: 0, total: listed.ids.length })
      let queue = [...listed.ids]
      let done = 0
      let changed = 0
      let opened = 0
      while (queue.length) {
        // Matches the server's own RUN_MAX (100) — was needlessly sending a quarter of that per
        // round trip, which meant 4x the HTTP overhead on a large backlog for no reason.
        const batch = queue.slice(0, 100)
        const res = await api<{ processed: number; changed: number; cases_opened: number }>("/api/email-center/reclassify", {
          method: "POST",
          body: JSON.stringify({ action: "run", ids: batch }),
        })
        queue = queue.slice(batch.length)
        done += res.processed
        changed += res.changed
        opened += res.cases_opened
        setReclassifyProgress({ done, total: listed.ids.length })
      }
      await loadAll()
      setReclassifyDue(false)
      if (changed === 0) toast.info(`Reclassified ${listed.ids.length} Needs Review mail(s) — none matched any rule.`)
      else if (changed === listed.ids.length) toast.success(`All ${changed} Needs Review mail(s) reclassified${opened ? ` — ${opened} case(s) opened` : ""}.`)
      else toast.success(`Reclassified ${changed} of ${listed.ids.length} Needs Review mail(s)${opened ? ` — ${opened} case(s) opened` : ""}.`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setReclassifying(false)
      setReclassifyProgress(null)
      setReclassifyPrompt(null)
    }
  }

  // Throws on failure so the Mailboxes tab's input can stay open; the local map is only updated once
  // the database has the password.
  const setKraPassword = useCallback(async (companyId: string, password: string) => {
    await saveKraEmailPassword(companyId, password)
    setKraCredentials((prev) => {
      const next = new Map(prev)
      const existing = next.get(companyId)
      next.set(companyId, { kra_email_address: existing?.kra_email_address ?? null, kra_email_password: password })
      return next
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

  // Important notifications are a work queue, not a task: "mark handled" records who and when on the
  // email row (handled_by_id / handled_at) and moves it from the active basket to the audit trail.
  const markHandled = async (email: EmailRow) => {
    try {
      const res = await api<{ email_patch: Partial<EmailRow> }>(`/api/email-center/emails/${email.id}`, {
        method: "PATCH",
        body: JSON.stringify({ handled: true }),
      })
      toast.success("Marked handled.")
      mergeEmail(email.id, res.email_patch)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  // Moves emails to another tab from the Ignored panel (one from a row's dropdown, or a whole selection).
  // Unlike quickClassify this never pops a case dialog open - with many emails that would be a wall of
  // dialogs; action-required ones simply appear under In Progress.
  const moveEmails = useCallback(async (targets: EmailRow[], disposition: Disposition) => {
    let moved = 0
    let opened = 0
    let firstError: string | null = null
    for (const email of targets) {
      try {
        const res = await api<{ email_patch: Partial<EmailRow>; case: CaseRow | null }>(
          `/api/email-center/emails/${email.id}`,
          { method: "PATCH", body: JSON.stringify({ disposition }) }
        )
        mergeEmail(email.id, res.email_patch)
        if (res.case) {
          upsertCase(res.case)
          opened++
        }
        moved++
      } catch (e: any) {
        firstError ??= e.message
      }
    }
    const label = DISPOSITION_LABEL[disposition].toLowerCase()
    if (moved) toast.success(`${moved} email${moved === 1 ? "" : "s"} marked ${label}${opened ? ` - ${opened} case${opened === 1 ? "" : "s"} opened` : ""}.`)
    if (firstError) toast.error(moved ? `${targets.length - moved} could not be moved: ${firstError}` : firstError)
  }, [mergeEmail, upsertCase])

  const deleteEmails = useCallback(async (targets: EmailRow[]) => {
    const gone = new Set<string>()
    try {
      for (let i = 0; i < targets.length; i += 200) {
        const res = await api<{ ids: string[] }>("/api/email-center/emails", {
          method: "DELETE",
          body: JSON.stringify({ ids: targets.slice(i, i + 200).map((e) => e.id) }),
        })
        res.ids.forEach((id) => gone.add(id))
      }
      toast.success(`${gone.size} email${gone.size === 1 ? "" : "s"} deleted.`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      if (gone.size) setEmails((prev) => prev.filter((e) => !gone.has(e.id)))
    }
  }, [])

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
  const baseReviewEmails = useMemo(() => emails.filter((e) => e.disposition === "needs_review" && e.category_key !== "notification" && meetsEmailFilters(e, q)), [emails, q])
  const baseNotificationEmails = useMemo(() => emails.filter((e) => e.category_key === "notification" && meetsEmailFilters(e, q)), [emails, q])
  const baseUpdateEmails = useMemo(() => emails.filter((e) => e.disposition === "update_only" && meetsEmailFilters(e, q)), [emails, q])
  const baseIgnoredEmails = useMemo(() => emails.filter((e) => e.disposition === "ignore" && meetsEmailFilters(e, q)), [emails, q])

  const passesCompany = useCallback(
    (companyId: string | null) => (byCompany ? matchesCompanySelection(companyId, sidebarCompany) : !company || companyId === company),
    [byCompany, sidebarCompany, company]
  )

  const openCases = useMemo(() => baseOpenCases.filter((c) => passesCompany(c.company_id)), [baseOpenCases, passesCompany])
  const closedCases = useMemo(() => baseClosedCases.filter((c) => passesCompany(c.company_id)), [baseClosedCases, passesCompany])
  const reviewEmails = useMemo(() => baseReviewEmails.filter((e) => passesCompany(e.company_id)), [baseReviewEmails, passesCompany])
  const notificationEmails = useMemo(
    () =>
      baseNotificationEmails
        .filter((e) => (notificationFilter === "active" ? !e.handled_at : !!e.handled_at))
        .filter((e) => passesCompany(e.company_id)),
    [baseNotificationEmails, notificationFilter, passesCompany]
  )
  const updateEmails = useMemo(() => baseUpdateEmails.filter((e) => passesCompany(e.company_id)), [baseUpdateEmails, passesCompany])
  const ignoredEmails = useMemo(() => baseIgnoredEmails.filter((e) => passesCompany(e.company_id)), [baseIgnoredEmails, passesCompany])

  const activeBase: { company_id: string | null }[] =
    tab === "inprogress" ? baseOpenCases
      : tab === "completed" ? baseClosedCases
      : tab === "review" ? baseReviewEmails
      : tab === "notifications" ? baseNotificationEmails
      : tab === "update" ? baseUpdateEmails
      : tab === "ignored" ? baseIgnoredEmails
      : []
  const activeCompanyIds = useMemo(() => activeBase.map((x) => x.company_id), [activeBase])

  // ── counts, derived from what's already loaded — no separate server round trip for these ──

  // Read from the already search/assignee-filtered base* lists (see meetsCaseFilters/meetsEmailFilters
  // above), not the raw cases/emails — so every tab badge (and the Notifications Active/Handled
  // toggle) reflects what a search would actually turn up in that tab, not the unfiltered total. Also
  // doubles as a quick "did this get stored anywhere at all?" check: search a subject/sender and watch
  // every badge, including Ignored, go to 0 if nothing matches in any tab.
  const openCasesCount = useMemo(() => baseOpenCases.length, [baseOpenCases])
  const closedCasesCount = useMemo(() => baseClosedCases.length, [baseClosedCases])
  const reviewCount = useMemo(() => baseReviewEmails.length, [baseReviewEmails])
  const notificationCount = useMemo(() => baseNotificationEmails.filter((e) => !e.handled_at).length, [baseNotificationEmails])
  const notificationHandledCount = useMemo(() => baseNotificationEmails.filter((e) => !!e.handled_at).length, [baseNotificationEmails])
  const updateCount = useMemo(() => baseUpdateEmails.length, [baseUpdateEmails])
  const ignoreCount = useMemo(() => baseIgnoredEmails.length, [baseIgnoredEmails])
  const unassignedMailboxes = useMemo(() => accounts.filter((a) => !a.company_id).length, [accounts])
  // Mailboxes Google no longer accepts (token revoked/expired) - nothing syncs from them until they are
  // connected again, so they get their own indicator in the toolbar.
  const failedMailboxes = useMemo(() => accounts.filter(needsReconnect).length, [accounts])
  const openFailedMailboxes = useCallback(() => {
    setMailboxView("failed")
    setMailboxFocusNonce((n) => n + 1)
    setTab("mailboxes")
  }, [])
  const pushHealthy = accounts.some((a) => a.watch_expiry && new Date(a.watch_expiry).getTime() > Date.now())

  const isCaseTab = tab === "inprogress" || tab === "completed"
  const isListTab = tab !== "mailboxes" && tab !== "rules"

  const emptyMessage = tab === "notifications"
    ? notificationFilter === "active" ? "All important notifications are handled." : "Nothing handled yet."
    : tab === "review" ? "Nothing needs review right now."
    : tab === "update" ? "No emails marked Update only."
    : "No ignored emails."

  const tabTable = (embedded: boolean) => {
    if (isCaseTab) {
      return <CasesTable cases={tab === "inprogress" ? openCases : closedCases} onOpen={(c) => setOpenCaseId(c.id)} showTime={showTime} embedded={embedded} loading={loading} />
    }
    if (tab === "ignored") {
      return (
        <IgnoredPanel
          emails={ignoredEmails}
          rules={rules}
          categories={categories}
          onOpen={(e) => setOpenEmailSeed(e)}
          onMove={moveEmails}
          onDelete={deleteEmails}
          showTime={showTime}
          loading={loading}
        />
      )
    }
    return (
      <EmailsTable
        emails={tab === "notifications" ? notificationEmails : tab === "review" ? reviewEmails : updateEmails}
        categories={categories}
        onOpen={(e) => setOpenEmailSeed(e)}
        onQuickClassify={quickClassify}
        showTime={showTime}
        loading={loading}
        emptyMessage={emptyMessage}
        embedded={embedded}
        notificationsMode={tab === "notifications"}
        onMarkHandled={markHandled}
      />
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-50/50">
      {/* Row 1: identity + global actions */}
      <div className="border-b border-slate-200/80 bg-white px-4 py-2.5 antialiased flex items-center gap-x-3 gap-y-2 flex-wrap shrink-0">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">KRA Email Center</h1>
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

        {failedMailboxes > 0 && (
          <button
            onClick={openFailedMailboxes}
            className="inline-flex items-center gap-2 text-base font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-3 py-1 hover:bg-red-100 transition-colors"
            title="Google no longer accepts these mailboxes' login, so nothing is syncing from them until they are reconnected"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            {failedMailboxes} mailbox{failedMailboxes === 1 ? "" : "es"} failed
            <span className="underline font-semibold">Fix →</span>
          </button>
        )}

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReclassifyPrompt({})}
            disabled={reclassifying || loading}
            title="Re-run the current rules against the mails in Needs Review"
            className={cn(
              PILL_BUTTON_CLASS,
              reclassifyDue
                ? "relative border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                : undefined
            )}
          >
            <Sparkles className={cn("h-5 w-5", reclassifyDue && "text-amber-500")} />
            Reclassify
            {reclassifyDue && (
              <span className="absolute -top-2 -right-2 flex h-3.5 w-3.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-amber-500" />
              </span>
            )}
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
            <TabsTrigger value="notifications" className={TAB_TRIGGER_CLASS}>
              Notifications
              {notificationCount > 0 && <span className={URGENT_BADGE_CLASS}>{notificationCount}</span>}
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
              {(unassignedMailboxes > 0 || failedMailboxes > 0) && <span className={URGENT_BADGE_CLASS}>{unassignedMailboxes + failedMailboxes}</span>}
            </TabsTrigger>
            <TabsTrigger value="rules" className={TAB_TRIGGER_CLASS}>
              Rules
              {rules.length > 0 && <span className={COUNT_BADGE_CLASS}>{rules.length}</span>}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {tab === "notifications" && (
            <div className="flex items-center gap-1 p-1 rounded-lg border border-slate-200 bg-white">
              <button
                onClick={() => setNotificationFilter("active")}
                className={cn(
                  "h-8 px-3 rounded-md text-base font-medium transition-colors whitespace-nowrap",
                  notificationFilter === "active" ? "bg-custom-blue text-white" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                Active ({notificationCount})
              </button>
              <button
                onClick={() => setNotificationFilter("handled")}
                title="The audit trail: who handled each notification, and when"
                className={cn(
                  "h-8 px-3 rounded-md text-base font-medium transition-colors whitespace-nowrap",
                  notificationFilter === "handled" ? "bg-custom-blue text-white" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                Handled ({notificationHandledCount})
              </button>
            </div>
          )}
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
          <RulesPanel rules={rules} source={rulesSource} categories={categories} loading={loading} search={search} onRulesChange={setRules} onRuleCreated={handleRuleCreated} />
        ) : tab === "mailboxes" ? (
          <MailboxesPanel
            accounts={accounts}
            companies={fullCompanies}
            kraCredentials={kraCredentials}
            view={mailboxView}
            onViewChange={setMailboxView}
            focusNonce={mailboxFocusNonce}
            onKraPasswordSave={setKraPassword}
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
        onRuleCreated={handleRuleCreated}
        rules={rules}
        onRuleUpdated={handleRuleUpdated}
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

      <AlertDialog open={!!reclassifyPrompt} onOpenChange={(o) => !o && !reclassifying && setReclassifyPrompt(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reclassify mails in Needs Review?</AlertDialogTitle>
            <AlertDialogDescription>
              {reclassifyPrompt?.pattern
                ? `The new ${reclassifyPrompt.is_ignore ? "ignore " : reclassifyPrompt.is_notify ? "important-notification " : ""}rule matches “${reclassifyPrompt.pattern}”. Run it against the mails currently in Needs Review now, so the ones it matches are ${reclassifyPrompt.is_ignore ? "ignored" : reclassifyPrompt.is_notify ? "flagged urgent" : "classified (and cases opened where needed)"} automatically?`
                : "Run the current rules against the mails currently in Needs Review? The ones the rules match confidently are classified (and cases opened where needed), ignored, or flagged as important notifications — the rest stay in Needs Review."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {reclassifying && reclassifyProgress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-slate-600">Reclassifying mails…</span>
                <span className="text-slate-500 tabular-nums">{reclassifyProgress.done} of {reclassifyProgress.total}</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={cn("h-full rounded-full bg-custom-blue transition-all duration-300", reclassifyProgress.total === 0 && "animate-pulse")}
                  style={{ width: `${reclassifyProgress.total ? Math.round((reclassifyProgress.done / reclassifyProgress.total) * 100) : 8}%` }}
                />
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reclassifying}>Skip</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); runReclassify() }} disabled={reclassifying} className="bg-custom-blue hover:bg-custom-blue/90">
              {reclassifying && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {reclassifying ? "Reclassifying…" : "Reclassify now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
