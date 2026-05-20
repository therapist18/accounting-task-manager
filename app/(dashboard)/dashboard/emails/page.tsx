"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@supabase/supabase-js"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  HelpCircle, CreditCard, Briefcase, Users, Scale,
  Building2, Megaphone, Wrench, MoreHorizontal, Inbox,
  RefreshCw, Search, Star, StarOff, Mail, MailOpen,
  AlertCircle, AlertTriangle, Minus, ArrowDown,
  ExternalLink, CheckCheck, Wifi, WifiOff
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"

// ─── Types ───────────────────────────────────────────────────────────────────

interface Category {
  id: string
  name: string
  color: string
  icon: string
  count?: number
}

interface Email {
  id: string
  gmail_message_id: string
  subject: string
  sender_email: string
  sender_name: string
  snippet: string
  ai_summary: string
  priority: "urgent" | "high" | "normal" | "low"
  is_read: boolean
  is_starred: boolean
  received_at: string
  category_id: string | null
  email_categories: { id: string; name: string; color: string; icon: string } | null
}

interface EmailAccount {
  id: string
  email: string
  watch_expiry: string | null
  is_active: boolean
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  HelpCircle, CreditCard, Briefcase, Users, Scale,
  Building2, Megaphone, Wrench, MoreHorizontal, Inbox,
}

function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Inbox
  return <Icon className={className} />
}

const PRIORITY_CONFIG = {
  urgent: { label: "Urgent", color: "bg-red-100 text-red-700", icon: AlertCircle },
  high:   { label: "High",   color: "bg-orange-100 text-orange-700", icon: AlertTriangle },
  normal: { label: "Normal", color: "bg-gray-100 text-gray-600", icon: Minus },
  low:    { label: "Low",    color: "bg-blue-100 text-blue-600", icon: ArrowDown },
}

// ─── Supabase client (browser) ───────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EmailsPage() {
  const [account, setAccount] = useState<EmailAccount | null>(null)
  const [accountLoading, setAccountLoading] = useState(true)

  const [categories, setCategories] = useState<Category[]>([])
  const [emails, setEmails] = useState<Email[]>([])
  const [total, setTotal] = useState(0)

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [search, setSearch] = useState("")
  const [filterUnread, setFilterUnread] = useState(false)

  const [loading, setLoading] = useState(false)
  const [realtime, setRealtime] = useState(false)

  // ── Fetch account ──────────────────────────────────────────────────────────

  useEffect(() => {
    const sb = getSupabase()
    // Filter for the account that has a refresh_token (the properly connected one)
    // and order by most recently connected
    sb.from("email_accounts")
      .select("*")
      .eq("status", "active")
      .not("refresh_token", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) console.error("[email_accounts fetch]", error)
        setAccount(data?.[0] ?? null)
        setAccountLoading(false)
      })
  }, [])

  // ── Fetch categories with counts ───────────────────────────────────────────

  const loadCategories = useCallback(async () => {
    const sb = getSupabase()
    const { data: cats } = await sb.from("email_categories").select("*").order("sort_order")
    if (!cats) return

    const { data: counts } = await sb
      .from("emails")
      .select("category_id")

    const countMap: Record<string, number> = {}
    for (const e of counts ?? []) {
      if (e.category_id) countMap[e.category_id] = (countMap[e.category_id] ?? 0) + 1
    }

    setCategories(cats.map((c) => ({ ...c, count: countMap[c.id] ?? 0 })))
  }, [])

  // ── Fetch emails ───────────────────────────────────────────────────────────

  const loadEmails = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: "50" })
    if (selectedCategory) params.set("category", selectedCategory)
    if (filterUnread) params.set("unread", "true")
    if (search) params.set("search", search)

    const res = await fetch(`/api/gmail/emails?${params}`)
    const json = await res.json()
    setEmails(json.emails ?? [])
    setTotal(json.total ?? 0)
    setLoading(false)
  }, [selectedCategory, filterUnread, search])

  useEffect(() => {
    if (account) {
      loadEmails()
      loadCategories()
    }
  }, [account, loadEmails, loadCategories])

  // ── Auto-refresh every 60s to pick up new Gmail messages ─────────────────

  useEffect(() => {
    if (!account) return
    const interval = setInterval(() => {
      loadEmails()
      loadCategories()
    }, 60_000)
    return () => clearInterval(interval)
  }, [account, loadEmails, loadCategories])

  // ── Supabase Realtime (fires when webhook inserts new rows) ───────────────

  useEffect(() => {
    if (!account) return
    const sb = getSupabase()
    const channel = sb
      .channel("emails-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "emails" }, () => {
        loadEmails()
        loadCategories()
      })
      .subscribe((status) => setRealtime(status === "SUBSCRIBED"))

    return () => { sb.removeChannel(channel) }
  }, [account, loadEmails, loadCategories])

  // ── Mark read ──────────────────────────────────────────────────────────────

  const markRead = async (email: Email) => {
    if (email.is_read) return
    await fetch("/api/gmail/emails", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: email.id, is_read: true }),
    })
    setEmails((prev) => prev.map((e) => e.id === email.id ? { ...e, is_read: true } : e))
  }

  const toggleStar = async (email: Email, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !email.is_starred
    await fetch("/api/gmail/emails", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: email.id, is_starred: next }),
    })
    setEmails((prev) => prev.map((em) => em.id === email.id ? { ...em, is_starred: next } : em))
  }

  const openEmail = (email: Email) => {
    setSelectedEmail(email)
    markRead(email)
  }

  // ─── No account connected ────────────────────────────────────────────────

  if (!accountLoading && !account) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-6">
        <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center">
          <Mail className="w-10 h-10 text-blue-500" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-800">Connect your Gmail</h2>
          <p className="text-slate-500 mt-2 max-w-md">
            Link your corporate Gmail account to start receiving and categorizing emails in real-time.
          </p>
        </div>
        <a href="/api/gmail/connect">
          <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Mail className="w-5 h-5" />
            Connect Gmail Account
          </Button>
        </a>
        <p className="text-xs text-slate-400 max-w-sm text-center">
          You&apos;ll be redirected to Google to authorize read-only access to your inbox.
        </p>
      </div>
    )
  }

  // ─── Stats ───────────────────────────────────────────────────────────────

  const unreadCount = emails.filter((e) => !e.is_read).length
  const urgentCount = emails.filter((e) => e.priority === "urgent").length

  // ─── Main layout ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Email Inbox</h2>
          {account && (
            <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
              {realtime
                ? <><Wifi className="w-3 h-3 text-green-500" /> Live updates · {account.email}</>
                : <><WifiOff className="w-3 h-3 text-slate-400" /> {account.email}</>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadEmails(); loadCategories() }} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
          <a href="/api/gmail/connect">
            <Button variant="outline" size="sm">Reconnect Gmail</Button>
          </a>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Emails", value: total, icon: Mail, color: "text-blue-600 bg-blue-50" },
          { label: "Unread", value: unreadCount, icon: MailOpen, color: "text-indigo-600 bg-indigo-50" },
          { label: "Urgent", value: urgentCount, icon: AlertCircle, color: "text-red-600 bg-red-50" },
          { label: "Categories", value: categories.length, icon: Inbox, color: "text-emerald-600 bg-emerald-50" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border border-slate-200">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", color)}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Body: categories sidebar + email list */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Categories sidebar */}
        <Card className="w-56 shrink-0 border border-slate-200 overflow-hidden">
          <CardHeader className="p-3 pb-2 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Categories</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <button
              onClick={() => { setSelectedCategory(null); setFilterUnread(false) }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                !selectedCategory && !filterUnread
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <Inbox className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">All Mail</span>
              <span className="text-xs text-slate-400">{total}</span>
            </button>

            <button
              onClick={() => { setSelectedCategory(null); setFilterUnread(true) }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors mt-1",
                filterUnread && !selectedCategory
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <MailOpen className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">Unread</span>
              {unreadCount > 0 && (
                <span className="text-xs bg-blue-600 text-white rounded-full px-1.5 py-0.5 leading-none">{unreadCount}</span>
              )}
            </button>

            <div className="my-2 border-t border-slate-100" />

            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); setFilterUnread(false) }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                  selectedCategory === cat.id
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <CategoryIcon name={cat.icon} className="w-4 h-4 shrink-0" style={{ color: cat.color } as any} />
                <span className="flex-1 text-left truncate">{cat.name}</span>
                {(cat.count ?? 0) > 0 && (
                  <span className="text-xs text-slate-400">{cat.count}</span>
                )}
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Email list */}
        <Card className="flex-1 border border-slate-200 overflow-hidden flex flex-col">
          {/* Search bar */}
          <div className="p-3 border-b border-slate-100 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by subject, sender, or content…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-sm h-9"
              />
            </div>
            {emails.some((e) => !e.is_read) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-slate-500 gap-1"
                onClick={async () => {
                  const unread = emails.filter((e) => !e.is_read)
                  await Promise.all(unread.map((e) =>
                    fetch("/api/gmail/emails", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: e.id, is_read: true }),
                    })
                  ))
                  setEmails((prev) => prev.map((e) => ({ ...e, is_read: true })))
                }}
              >
                <CheckCheck className="w-4 h-4" />
                Mark all read
              </Button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading && emails.length === 0 && (
              <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading emails…
              </div>
            )}

            {!loading && emails.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-slate-400 gap-2">
                <Inbox className="w-8 h-8" />
                <p className="text-sm">No emails found</p>
              </div>
            )}

            {emails.map((email) => {
              const PriorityIcon = PRIORITY_CONFIG[email.priority]?.icon ?? Minus
              return (
                <div
                  key={email.id}
                  onClick={() => openEmail(email)}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors",
                    !email.is_read && "bg-blue-50/40"
                  )}
                >
                  {/* Unread dot */}
                  <div className="mt-1.5 shrink-0">
                    {!email.is_read
                      ? <span className="w-2 h-2 rounded-full bg-blue-500 block" />
                      : <span className="w-2 h-2 block" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("text-sm truncate", !email.is_read ? "font-semibold text-slate-900" : "text-slate-700")}>
                        {email.sender_name || email.sender_email}
                      </p>
                      <span className="text-xs text-slate-400 shrink-0">
                        {email.received_at
                          ? formatDistanceToNow(new Date(email.received_at), { addSuffix: true })
                          : ""}
                      </span>
                    </div>
                    <p className={cn("text-sm truncate mt-0.5", !email.is_read ? "font-medium text-slate-800" : "text-slate-600")}>
                      {email.subject || "(no subject)"}
                    </p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {email.ai_summary || email.snippet}
                    </p>

                    {/* Tags row */}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {email.email_categories && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: `${email.email_categories.color}20`, color: email.email_categories.color }}
                        >
                          {email.email_categories.name}
                        </span>
                      )}
                      {email.priority !== "normal" && (
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-0.5", PRIORITY_CONFIG[email.priority]?.color)}>
                          <PriorityIcon className="w-3 h-3" />
                          {PRIORITY_CONFIG[email.priority]?.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Star */}
                  <button
                    onClick={(e) => toggleStar(email, e)}
                    className="mt-1 shrink-0 text-slate-300 hover:text-yellow-400 transition-colors"
                  >
                    {email.is_starred
                      ? <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      : <StarOff className="w-4 h-4" />}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          {total > 0 && (
            <div className="p-3 border-t border-slate-100 text-xs text-slate-400 text-center">
              Showing {emails.length} of {total} emails
            </div>
          )}
        </Card>
      </div>

      {/* Email detail modal */}
      <Dialog open={!!selectedEmail} onOpenChange={(open) => !open && setSelectedEmail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold pr-8 leading-snug">
              {selectedEmail?.subject || "(no subject)"}
            </DialogTitle>
          </DialogHeader>

          {selectedEmail && (
            <div className="flex flex-col gap-4 overflow-y-auto">
              {/* Meta */}
              <div className="flex items-start justify-between gap-4 text-sm">
                <div>
                  <p className="font-medium text-slate-800">
                    {selectedEmail.sender_name || selectedEmail.sender_email}
                  </p>
                  <p className="text-slate-500">{selectedEmail.sender_email}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {selectedEmail.received_at
                      ? new Date(selectedEmail.received_at).toLocaleString()
                      : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {selectedEmail.email_categories && (
                    <span
                      className="text-xs px-2 py-1 rounded-full font-medium"
                      style={{
                        background: `${selectedEmail.email_categories.color}20`,
                        color: selectedEmail.email_categories.color,
                      }}
                    >
                      {selectedEmail.email_categories.name}
                    </span>
                  )}
                  {selectedEmail.priority !== "normal" && (
                    <span className={cn("text-xs px-2 py-1 rounded-full font-medium", PRIORITY_CONFIG[selectedEmail.priority]?.color)}>
                      {PRIORITY_CONFIG[selectedEmail.priority]?.label} Priority
                    </span>
                  )}
                </div>
              </div>

              {/* AI Summary */}
              {selectedEmail.ai_summary && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-blue-700 mb-1">AI Summary</p>
                  <p className="text-sm text-blue-800">{selectedEmail.ai_summary}</p>
                </div>
              )}

              {/* Body */}
              <div className="border border-slate-100 rounded-lg p-4 bg-white text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                {selectedEmail.snippet || "No preview available."}
              </div>

              {/* Open in Gmail */}
              <div className="flex justify-end pt-2 border-t border-slate-100">
                <a
                  href={`https://mail.google.com/mail/u/0/#inbox/${selectedEmail.gmail_message_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="gap-2">
                    <ExternalLink className="w-4 h-4" />
                    Open in Gmail
                  </Button>
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
