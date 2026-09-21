"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Loader2, RefreshCw, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CaseDialog } from "./components/CaseDialog"
import { CasesTable } from "./components/CasesTable"
import { EmailDialog } from "./components/EmailDialog"
import { EmailList } from "./components/EmailList"
import { MailboxesPanel } from "./components/MailboxesPanel"
import { NativeSelect } from "./components/NativeSelect"
import {
  DISPOSITION_LABEL,
  type AccountRow,
  type CaseRow,
  type CategoryOption,
  type CompanyOption,
  type Counts,
  type Disposition,
  type EmailRow,
  type StaffOption,
} from "./components/types"
import { api } from "./components/utils"

type Tab = "cases" | "review" | "mailboxes"

const EMPTY_COUNTS: Counts = { needs_review: 0, open_cases: 0, unassigned_mailboxes: 0 }

// Email Center: KRA emails from every connected company mailbox, grouped into cases — each case is a
// task (department 2 / subdepartment 28, "KRA ITAX EMAILS") laid out as the
// "KRA CORESPONDENCE PLATFORM" sheet. Updates and noise never reach this page; anything the
// classifier is unsure about is held in Needs Review.
export default function EmailCenterPage() {
  const [tab, setTab] = useState<Tab>("cases")
  const [company, setCompany] = useState("")
  const [assignee, setAssignee] = useState("")
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [caseStatus, setCaseStatus] = useState<"open" | "closed" | "all">("open")

  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS)
  const [cases, setCases] = useState<CaseRow[]>([])
  const [emails, setEmails] = useState<EmailRow[]>([])

  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [openCaseId, setOpenCaseId] = useState<string | null>(null)
  const [openEmailId, setOpenEmailId] = useState<string | null>(null)

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const loadOverview = useCallback(async () => {
    const res = await api<{
      accounts: AccountRow[]; companies: CompanyOption[]; categories: CategoryOption[]
      staff: StaffOption[]; counts: Counts
    }>("/api/email-center")
    setAccounts(res.accounts)
    setCompanies(res.companies)
    setCategories(res.categories)
    setStaff(res.staff)
    setCounts(res.counts)
  }, [])

  const loadTab = useCallback(async () => {
    const params = new URLSearchParams()
    if (company) params.set("company", company)
    if (query) params.set("q", query)

    if (tab === "cases") {
      params.set("status", caseStatus)
      if (assignee) params.set("assignee", assignee)
      const res = await api<{ cases: CaseRow[] }>(`/api/email-center/cases?${params}`)
      setCases(res.cases)
    } else if (tab === "review") {
      params.set("disposition", "needs_review")
      const res = await api<{ emails: EmailRow[] }>(`/api/email-center/emails?${params}`)
      setEmails(res.emails)
    }
  }, [tab, company, assignee, query, caseStatus])

  const refresh = useCallback(async () => {
    try {
      await Promise.all([loadOverview(), loadTab()])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [loadOverview, loadTab])

  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  // New mail reaches the server through the Gmail push webhook; a light poll keeps this page current.
  useEffect(() => {
    const t = setInterval(() => { refresh() }, 60_000)
    return () => clearInterval(t)
  }, [refresh])

  const runSync = useCallback(async (quiet: boolean) => {
    setSyncing(true)
    try {
      const res = await api<{ results: { email: string; ingested: number; failed: number; error?: string }[] }>(
        "/api/email-center/sync",
        { method: "POST", body: "{}" }
      )
      const ingested = res.results.reduce((n, r) => n + r.ingested, 0)
      const errors = res.results.filter((r) => r.error || r.failed)
      if (!quiet || ingested > 0) {
        if (errors.length) toast.warning(`${ingested} new email(s); ${errors.length} mailbox(es) had issues — see Mailboxes.`)
        else toast.success(`${ingested} new email(s) from ${res.results.length} mailbox(es).`)
      }
      await refresh()
    } catch (e: any) {
      if (!quiet) toast.error(e.message)
    } finally {
      setSyncing(false)
    }
  }, [refresh])

  // Catch-up sync once when the page opens. It also renews any Gmail push watch about to lapse
  // (there is no scheduler), so an opened Email Center always leaves push in a healthy state.
  const syncedOnOpen = useRef(false)
  useEffect(() => {
    if (syncedOnOpen.current) return
    syncedOnOpen.current = true
    runSync(true)
  }, [runSync])

  const quickClassify = async (email: EmailRow, disposition: Disposition) => {
    try {
      const res = await api<{ case_id: string | null }>(`/api/email-center/emails/${email.id}`, {
        method: "PATCH",
        body: JSON.stringify({ disposition }),
      })
      toast.success(`Marked as ${DISPOSITION_LABEL[disposition].toLowerCase()}.`)
      await refresh()
      if (disposition === "action_required" && res.case_id) setOpenCaseId(res.case_id)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const closeCase = useCallback(() => setOpenCaseId(null), [])
  const closeEmail = useCallback(() => setOpenEmailId(null), [])

  const showFilters = tab !== "mailboxes"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Email Center</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            KRA correspondence across all company mailboxes · {counts.open_cases} open case(s)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => runSync(false)} disabled={syncing} className="gap-2">
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Sync now
        </Button>
      </div>

      {counts.unassigned_mailboxes > 0 && (
        <button
          onClick={() => setTab("mailboxes")}
          className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-left"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {counts.unassigned_mailboxes} mailbox(es) are not linked to a company — their emails can’t be matched to a client. Link them →
        </button>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="cases">KRA Cases</TabsTrigger>
          <TabsTrigger value="review" className="gap-2">
            Needs Review
            {counts.needs_review > 0 && <Badge className="bg-amber-500 hover:bg-amber-500 h-5 px-1.5">{counts.needs_review}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="mailboxes">Mailboxes</TabsTrigger>
        </TabsList>
      </Tabs>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder={tab === "cases" ? "Search subject, PIN, case ref…" : "Search subject, sender, content…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <NativeSelect value={company} onChange={(e) => setCompany(e.target.value)} className="max-w-[260px]">
            <option value="">All companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </NativeSelect>

          {tab === "cases" && (
            <>
              <NativeSelect value={caseStatus} onChange={(e) => setCaseStatus(e.target.value as typeof caseStatus)}>
                <option value="open">Open cases</option>
                <option value="closed">Completed cases</option>
                <option value="all">All cases</option>
              </NativeSelect>
              <NativeSelect value={assignee} onChange={(e) => setAssignee(e.target.value)} className="max-w-[220px]">
                <option value="">Anyone</option>
                <option value="none">Unassigned</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </NativeSelect>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          {tab === "cases" && <CasesTable cases={cases} onOpen={(c) => setOpenCaseId(c.id)} />}
          {tab === "review" && (
            <EmailList
              emails={emails}
              categories={categories}
              onOpen={(e) => setOpenEmailId(e.id)}
              onQuickClassify={quickClassify}
            />
          )}
          {tab === "mailboxes" && <MailboxesPanel accounts={accounts} companies={companies} onChanged={refresh} />}
        </>
      )}

      <CaseDialog
        caseId={openCaseId}
        companies={companies}
        staff={staff}
        onClose={closeCase}
        onChanged={refresh}
        onOpenEmail={(id) => setOpenEmailId(id)}
      />
      <EmailDialog
        emailId={openEmailId}
        categories={categories}
        onClose={closeEmail}
        onChanged={refresh}
        onOpenCase={(id) => { setOpenEmailId(null); setOpenCaseId(id) }}
      />
    </div>
  )
}
