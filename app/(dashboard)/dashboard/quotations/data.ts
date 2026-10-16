"use client"

import { supabase } from "@/lib/supabase/client"
import { createSessionResource } from "@/lib/sessionCache"
import { fetchCompanies } from "../companies/database"
import { fetchIndividuals } from "../individuals/database"
import { etimsGrossUp, immigrationBreakdown, jobBreakdown, roundUp } from "../departments/rates/rate-card/calc"
import { normalizeImmigrationRates, normalizeJobRates } from "../departments/rates/rate-card/catalog"
import type { CardType, ImmigrationRates, JobRates, RateSettings, RatesPayload } from "../departments/rates/rate-card/types"

// Quotations (tm_quotations): a client, a date, and lines priced from the rate cards in force on that
// date. Each line carries its own copy of the rate (editable per quotation — e.g. ticking an extra
// charge, adjusting an estimated fee), so later rate changes never alter a quotation already raised.
//
// Lifecycle: proposal → draft (quotation) → sent → accepted → invoice
//                                         → rejected / expired
// A proposal matures to a quotation when the user is satisfied and raises it formally.
// A quotation can be revised up to 3 times; after 3 revisions OR 10 days since the last revision it
// is locked (the client must approve or reject). Once accepted and fully paid it matures to an invoice.

export type QuotationStatus = "proposal" | "draft" | "sent" | "accepted" | "rejected" | "expired" | "invoice"
export type ClientType = "company" | "individual" | "other"
/** Controls which pricing section(s) appear on the document. */
export type EtimsMode = "without" | "with" | "both"
export type PaymentStatus = "unpaid" | "partial" | "paid" | "overpaid"

export const STATUSES: { value: QuotationStatus; label: string; badge: string }[] = [
  { value: "proposal", label: "Proposal", badge: "bg-slate-100 text-slate-600 border-slate-200" },
  { value: "draft", label: "Draft", badge: "bg-slate-100 text-slate-600 border-slate-200" },
  { value: "sent", label: "Sent", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "accepted", label: "Accepted", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "rejected", label: "Rejected", badge: "bg-red-50 text-red-700 border-red-200" },
  { value: "expired", label: "Expired", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "invoice", label: "Invoice", badge: "bg-violet-50 text-violet-700 border-violet-200" },
]

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
  overpaid: "Overpaid",
}

export const PAYMENT_STATUS_BADGE: Record<PaymentStatus, string> = {
  unpaid: "bg-slate-100 text-slate-500 border-slate-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  overpaid: "bg-blue-50 text-blue-700 border-blue-200",
}

export interface QuotationItem {
  id: string
  job_key: string
  /** "IMMIGRATION → KEP → Class G" */
  job_path: string
  department_id: number
  card_type: CardType
  /** The rate-card version this line was priced from. */
  rate_card_id: number | null
  rate_effective_from: string | null
  rates: RatesPayload
  quantity: number
  /** Captured against the rate's "Specific Names" prompt. */
  details: string
  /** Captured against the rate's "Specific Registered Date" prompt. */
  detail_date: string
}

export interface QuotationTotals {
  /** Government fees BCL collects. */
  official: number
  /** Government fees the client pays at the bank themselves (shown, not billed). */
  paid_at_bank: number
  /** BCL's fees (facilitation, extras, help, consultancy) — grossed up when invoiced with eTIMS. */
  consultancy: number
  vat: number
  /** What the client pays BCL. */
  total: number
}

/** A single payment recorded against a quotation. */
export interface QuotationPayment {
  id: string
  amount: number
  payment_date: string
  proof_type: "mpesa" | "bank_slip" | "other" | null
  /** Raw text pasted from an M-Pesa message or a description of the bank slip. */
  proof_note: string | null
  /** URL of an uploaded proof image/PDF, if any. */
  proof_url: string | null
  /** How the payment is split across line items (item_id → amount). */
  allocations: Array<{ item_id: string; amount: number }>
  recorded_by: string | null
  recorded_at: string
}

export interface Quotation {
  id: number
  quote_number: string
  client_type: ClientType
  company_id: number | null
  individual_id: number | null
  client_name: string
  quote_date: string
  valid_until: string | null
  status: QuotationStatus
  /** How many times this quotation has been revised (0 = original). Max 3. */
  revision_number: number
  /** ISO timestamp of the last revision; null for the first version. */
  revised_at: string | null
  /** Date the proposal was originally raised (null for quotations created directly). */
  proposal_date: string | null
  /**
   * Which pricing sections to include on the document:
   * "without" = only the no-eTIMS section, "with" = only the eTIMS section,
   * "both" = include both sections side-by-side (default).
   */
  etims_mode: EtimsMode
  /** Kept for backward compatibility; derived from etims_mode. */
  with_etims: boolean
  settings: RateSettings
  items: QuotationItem[]
  totals: QuotationTotals
  payments: QuotationPayment[]
  payment_status: PaymentStatus
  notes: string | null
  created_by_name: string | null
  created_at: string
  updated_by_name: string | null
  updated_at: string
}

export type QuotationDraft = Omit<Quotation, "id" | "quote_number" | "created_at" | "updated_at" | "created_by_name" | "updated_by_name" | "totals" | "payment_status"> & {
  id?: number
  quote_number?: string
}

// ── revision helpers ──────────────────────────────────────────────────────────

const REVISION_LIMIT = 3
const REVISION_LOCK_DAYS = 10

/** Days elapsed since `isoTimestamp` (using today's local date). */
function daysSince(isoTimestamp: string | null | undefined): number | null {
  if (!isoTimestamp) return null
  const then = new Date(isoTimestamp).getTime()
  const now = Date.now()
  return Math.floor((now - then) / 86_400_000)
}

/**
 * Returns true if this quotation can still be revised.
 * • Proposals are never locked (they aren't yet formal quotations).
 * • Quotations: locked after 3 revisions OR after 10 days since the last revision.
 */
export function canRevise(q: Quotation | QuotationDraft): boolean {
  if (q.status === "proposal") return true
  if (q.revision_number >= REVISION_LIMIT) return false
  const d = daysSince(q.revised_at)
  if (d !== null && d >= REVISION_LOCK_DAYS) return false
  return true
}

export function revisionLockReason(q: Quotation | QuotationDraft): string | null {
  if (q.status === "proposal") return null
  if (q.revision_number >= REVISION_LIMIT) return `Maximum of ${REVISION_LIMIT} revisions reached.`
  const d = daysSince(q.revised_at)
  if (d !== null && d >= REVISION_LOCK_DAYS) return `Locked — ${REVISION_LOCK_DAYS} days have elapsed since the last revision.`
  return null
}

// ── payment helpers ───────────────────────────────────────────────────────────

export interface PaymentSummary {
  paid: number
  balance: number
  overpayment: number
  status: PaymentStatus
}

export function quotationPaymentSummary(q: Quotation | QuotationDraft, total?: number): PaymentSummary {
  const grandTotal = total ?? (q as Quotation).totals?.total ?? 0
  const paid = ((q as Quotation).payments || []).reduce((s, p) => s + p.amount, 0)
  const diff = grandTotal - paid
  const overpayment = diff < 0 ? Math.abs(diff) : 0
  const balance = diff > 0 ? diff : 0
  let status: PaymentStatus = "unpaid"
  if (paid === 0) status = "unpaid"
  else if (paid >= grandTotal) status = paid > grandTotal ? "overpaid" : "paid"
  else status = "partial"
  return { paid, balance, overpayment, status }
}

/** Proportional default allocation of a payment amount across quotation items. */
export function defaultAllocations(items: QuotationItem[], settings: RateSettings, withEtims: boolean, paymentAmount: number): Array<{ item_id: string; amount: number }> {
  const totals = items.map((it) => ({ id: it.id, total: priceItem(it, settings, withEtims).total }))
  const grand = totals.reduce((s, t) => s + t.total, 0)
  if (grand === 0) return items.map((it) => ({ item_id: it.id, amount: 0 }))
  let remaining = paymentAmount
  return totals.map((t, i) => {
    if (i === totals.length - 1) return { item_id: t.id, amount: Math.round(remaining * 100) / 100 }
    const share = Math.round((t.total / grand) * paymentAmount * 100) / 100
    remaining -= share
    return { item_id: t.id, amount: share }
  })
}

// ── pricing ──────────────────────────────────────────────────────────────────

export interface LinePrice {
  unitOfficial: number
  unitConsultancy: number
  unitVat: number
  unitTotal: number
  official: number
  paidAtBank: number
  consultancy: number
  vat: number
  total: number
}

/**
 * Without eTIMS: official + BCL fees, rounded up (the sheets' "Round-up Final - Total").
 * With eTIMS: BCL fees grossed up for corporation tax with VAT on top; nothing rounded, so the VAT
 * shown is exactly what the invoice carries.
 */
export function priceItem(item: QuotationItem, settings: RateSettings, withEtims: boolean): LinePrice {
  let official = 0
  let consultancy = 0
  let paidAtBank = 0
  if (item.card_type === "immigration") {
    const b = immigrationBreakdown(normalizeImmigrationRates(item.rates as ImmigrationRates), settings)
    official = b.official - b.paidAtBank
    paidAtBank = b.paidAtBank
    consultancy = b.facilitationNet + b.extras + b.help
  } else {
    const b = jobBreakdown(normalizeJobRates(item.rates as JobRates), settings)
    official = b.official
    consultancy = b.consultancy
  }
  const qty = Math.max(0, Number(item.quantity) || 0)
  let unitConsultancy = consultancy
  let unitVat = 0
  let unitTotal: number
  if (withEtims) {
    const e = etimsGrossUp(consultancy, settings)
    unitConsultancy = e.gross
    unitVat = e.vat
    unitTotal = official + e.invoice
  } else {
    unitTotal = roundUp(official + consultancy, settings.round_to)
    // The round-up is BCL's, so it shows under consultancy.
    unitConsultancy = unitTotal - official
  }
  return {
    unitOfficial: official, unitConsultancy, unitVat, unitTotal,
    official: official * qty, paidAtBank: paidAtBank * qty, consultancy: unitConsultancy * qty, vat: unitVat * qty, total: unitTotal * qty,
  }
}

export function quotationTotals(items: QuotationItem[], settings: RateSettings, withEtims: boolean): QuotationTotals {
  const t: QuotationTotals = { official: 0, paid_at_bank: 0, consultancy: 0, vat: 0, total: 0 }
  for (const item of items) {
    const p = priceItem(item, settings, withEtims)
    t.official += p.official
    t.paid_at_bank += p.paidAtBank
    t.consultancy += p.consultancy
    t.vat += p.vat
    t.total += p.total
  }
  const r2 = (n: number) => Math.round(n * 100) / 100
  return { official: r2(t.official), paid_at_bank: r2(t.paid_at_bank), consultancy: r2(t.consultancy), vat: r2(t.vat), total: r2(t.total) }
}

/** Normalize a row from the DB (handles older rows that don't have new fields yet). */
export function normalizeQuotation(raw: any): Quotation {
  const etims_mode: EtimsMode = raw.etims_mode ?? (raw.with_etims ? "with" : "without")
  return {
    ...raw,
    revision_number: raw.revision_number ?? 0,
    revised_at: raw.revised_at ?? null,
    proposal_date: raw.proposal_date ?? null,
    etims_mode,
    with_etims: etims_mode !== "without",
    payments: raw.payments ?? [],
    payment_status: raw.payment_status ?? "unpaid",
  } as Quotation
}

// ── caches ───────────────────────────────────────────────────────────────────

export const companiesListResource = createSessionResource(() => fetchCompanies(), { staleMs: 10 * 60_000 })
export const individualsResource = createSessionResource(() => fetchIndividuals(), { staleMs: 10 * 60_000 })

export const quotationsResource = createSessionResource(async () => {
  const pageSize = 1000
  const out: Quotation[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("tm_quotations")
      .select("*")
      .order("quote_date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw error
    out.push(...((data || []).map(normalizeQuotation)))
    if (!data || data.length < pageSize) return out
  }
}, { staleMs: 60_000 })

// ── writes ───────────────────────────────────────────────────────────────────

export async function saveQuotation(draft: QuotationDraft, userName: string | null): Promise<Quotation> {
  const useEtims = draft.etims_mode !== "without"
  const totals = quotationTotals(draft.items, draft.settings, useEtims)
  const draftPayments: QuotationPayment[] = (draft as any).payments ?? []
  const { status: pmtStatus } = quotationPaymentSummary({ payments: draftPayments } as any, totals.total)
  const row = {
    client_type: draft.client_type,
    company_id: draft.client_type === "company" ? draft.company_id : null,
    individual_id: draft.client_type === "individual" ? draft.individual_id : null,
    client_name: draft.client_name,
    quote_date: draft.quote_date,
    valid_until: draft.valid_until || null,
    status: draft.status,
    revision_number: draft.revision_number ?? 0,
    revised_at: draft.revised_at ?? null,
    proposal_date: draft.proposal_date ?? null,
    etims_mode: draft.etims_mode ?? "without",
    with_etims: useEtims,
    settings: draft.settings,
    items: draft.items,
    totals,
    payments: (draft as any).payments ?? [],
    payment_status: pmtStatus,
    notes: draft.notes || null,
    updated_by_name: userName,
    updated_at: new Date().toISOString(),
  }
  const query = draft.id
    ? supabase.from("tm_quotations").update(row).eq("id", draft.id)
    : supabase.from("tm_quotations").insert({ ...row, created_by_name: userName })
  const { data, error } = await query.select("*").single()
  if (error) throw error
  const saved = normalizeQuotation(data)
  quotationsResource.mutate((current) => {
    const rest = (current || []).filter((q) => q.id !== saved.id)
    return [saved, ...rest].sort((a, b) => (a.quote_date < b.quote_date ? 1 : a.quote_date > b.quote_date ? -1 : b.id - a.id))
  })
  return saved
}

/** Bump the revision number and mark the timestamp; saves the whole quotation. */
export async function reviseQuotation(q: Quotation, updatedDraft: QuotationDraft, userName: string | null): Promise<Quotation> {
  const draft: QuotationDraft = {
    ...updatedDraft,
    revision_number: q.revision_number + 1,
    revised_at: new Date().toISOString(),
  }
  return saveQuotation(draft, userName)
}

/** Record a payment against a quotation; updates the payment_status and patches the cache. */
export async function recordPayment(q: Quotation, payment: Omit<QuotationPayment, "id" | "recorded_at">, userName: string | null): Promise<Quotation> {
  const newPayment: QuotationPayment = {
    ...payment,
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    recorded_by: userName,
    recorded_at: new Date().toISOString(),
  }
  const payments = [...q.payments, newPayment]
  const useEtims = q.etims_mode !== "without"
  const { status: pmtStatus } = quotationPaymentSummary({ ...q, payments }, q.totals.total)
  const row = {
    payments,
    payment_status: pmtStatus,
    updated_by_name: userName,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase.from("tm_quotations").update(row).eq("id", q.id).select("*").single()
  if (error) throw error
  const saved = normalizeQuotation(data)
  quotationsResource.mutate((current) => (current || []).map((x) => (x.id === saved.id ? saved : x)))
  return saved
}

/** Remove a payment by its local id. */
export async function deletePayment(q: Quotation, paymentId: string, userName: string | null): Promise<Quotation> {
  const payments = q.payments.filter((p) => p.id !== paymentId)
  const { status: pmtStatus } = quotationPaymentSummary({ ...q, payments }, q.totals.total)
  const row = { payments, payment_status: pmtStatus, updated_by_name: userName, updated_at: new Date().toISOString() }
  const { data, error } = await supabase.from("tm_quotations").update(row).eq("id", q.id).select("*").single()
  if (error) throw error
  const saved = normalizeQuotation(data)
  quotationsResource.mutate((current) => (current || []).map((x) => (x.id === saved.id ? saved : x)))
  return saved
}

/** Mature an accepted, fully-paid quotation into an invoice. */
export async function matureToInvoice(q: Quotation, userName: string | null): Promise<Quotation> {
  const row = { status: "invoice" as QuotationStatus, updated_by_name: userName, updated_at: new Date().toISOString() }
  const { data, error } = await supabase.from("tm_quotations").update(row).eq("id", q.id).select("*").single()
  if (error) throw error
  const saved = normalizeQuotation(data)
  quotationsResource.mutate((current) => (current || []).map((x) => (x.id === saved.id ? saved : x)))
  return saved
}

export async function setQuotationStatus(q: Quotation, status: QuotationStatus, userName: string | null) {
  const { data, error } = await supabase
    .from("tm_quotations")
    .update({ status, updated_by_name: userName, updated_at: new Date().toISOString() })
    .eq("id", q.id)
    .select("*")
    .single()
  if (error) throw error
  quotationsResource.mutate((current) => (current || []).map((x) => (x.id === q.id ? normalizeQuotation(data) : x)))
}

export async function deleteQuotation(id: number) {
  const { error } = await supabase.from("tm_quotations").delete().eq("id", id)
  if (error) throw error
  quotationsResource.mutate((current) => (current || []).filter((q) => q.id !== id))
}
