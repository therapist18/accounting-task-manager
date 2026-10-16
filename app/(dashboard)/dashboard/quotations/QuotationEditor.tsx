"use client"

import React, { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronRight, CreditCard,
  Download, FileText, Loader2, Lock, Plus, RefreshCw, Save, Trash2, User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DateInput } from "@/components/ui/date-input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { addDaysIso, dateFieldToIso, formatDateToDMY } from "@/lib/dateUtils"
import { useSessionResource } from "@/lib/sessionCache"
import { cn } from "@/lib/utils"
import {
  PILL_BUTTON_ACTIVE_CLASS, PILL_BUTTON_CLASS, PRIMARY_PILL_BUTTON_CLASS, SearchSelect,
} from "../emails/components/shared"
import { HEAD_NEUTRAL, TD_CLASS, TH_CLASS } from "../emails/components/table"
import { departmentsResource } from "../tasks/utils/taskManagerCache"
import {
  FREQUENCIES, IMMIGRATION_COMPONENTS, PAYMENT_MODES, PRICE_BASES, VALIDITY_UNITS,
  labelOf, normalizeImmigrationRates, normalizeJobRates,
} from "../departments/rates/rate-card/catalog"
import { fmtKes, immigrationBreakdown, jobBreakdown } from "../departments/rates/rate-card/calc"
import { NumberField, TextField } from "../departments/rates/rate-card/cells"
import {
  flattenJobLevels, indexVersions, rateCardsResource, rateSettingsResource, settingsOn, todayYmd, versionOn,
} from "../departments/rates/rate-card/data"
import type { ImmigrationRates, JobLevel, JobRates, RateCardRow } from "../departments/rates/rate-card/types"
import { cardTypeForDepartment } from "../departments/rates/rate-card/catalog"
import {
  STATUSES, PAYMENT_STATUS_BADGE, PAYMENT_STATUS_LABELS,
  canRevise, revisionLockReason, quotationPaymentSummary, defaultAllocations,
  companiesListResource, individualsResource,
  priceItem, quotationTotals, saveQuotation, reviseQuotation, recordPayment, deletePayment, matureToInvoice,
  type ClientType, type EtimsMode, type Quotation, type QuotationDraft,
  type QuotationItem, type QuotationPayment, type QuotationStatus,
} from "./data"
import { exportQuotation } from "./exportQuotation"

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

const ETIMS_MODE_OPTIONS: { value: EtimsMode; label: string; description: string }[] = [
  { value: "without", label: "Without eTIMS", description: "Standard pricing, fees rounded up" },
  { value: "with", label: "With eTIMS", description: "Fees grossed-up for corp. tax + VAT" },
  { value: "both", label: "Both sections", description: "Include both pricing columns (default)" },
]

const PROOF_TYPE_OPTIONS = [
  { value: "mpesa", label: "M-Pesa" },
  { value: "bank_slip", label: "Bank Slip" },
  { value: "other", label: "Other" },
]

function blankDraft(asProposal = false): QuotationDraft {
  const today = todayYmd()
  return {
    client_type: "company", company_id: null, individual_id: null, client_name: "",
    quote_date: today,
    valid_until: asProposal ? null : addDaysIso(today, 30),
    status: asProposal ? "proposal" : "draft",
    revision_number: 0, revised_at: null,
    proposal_date: asProposal ? today : null,
    etims_mode: "both",
    with_etims: true,
    settings: settingsOn(rateSettingsResource.getState().data, today),
    items: [], notes: "",
    payments: [],
  }
}

function itemFrom(level: JobLevel, version: RateCardRow): QuotationItem {
  const cardType = cardTypeForDepartment(level.departmentId)
  const rates = cardType === "immigration" ? normalizeImmigrationRates(version.rates as any) : normalizeJobRates(version.rates as any)
  return {
    id: newId(),
    job_key: level.key,
    job_path: `${level.departmentName} → ${level.path}`,
    department_id: level.departmentId,
    card_type: cardType,
    rate_card_id: version.id,
    rate_effective_from: version.effective_from,
    rates: clone(rates),
    quantity: cardType === "job" ? (rates as JobRates).defaultQty || 1 : 1,
    details: "",
    detail_date: "",
  }
}

function paymentText(r: ImmigrationRates) {
  if (r.payment.mode !== "installments") return labelOf(PAYMENT_MODES, r.payment.mode)
  const [dep, second] = r.payment.installments
  return second ? `Deposit ${fmtKes(dep)}, then ${fmtKes(second)}` : `Deposit ${fmtKes(dep)}, balance on completion`
}

function validityText(r: ImmigrationRates) {
  const unit = VALIDITY_UNITS.find((u) => u.value === r.validity.unit)
  if (!unit || unit.value === "one_off") return ""
  return unit.counted ? `${r.validity.count ?? "?"} ${unit.label.toLowerCase()}` : unit.label
}

export function QuotationEditor({
  open, quotation, userName, onClose,
}: {
  open: boolean
  /** null = new quotation/proposal */
  quotation: Quotation | null
  userName: string | null
  onClose: () => void
}) {
  const departments = useSessionResource(departmentsResource)
  const rateCards = useSessionResource(rateCardsResource)
  const settingsRes = useSessionResource(rateSettingsResource)
  const companies = useSessionResource(companiesListResource)
  const individuals = useSessionResource(individualsResource)

  const [draft, setDraft] = useState<QuotationDraft>(blankDraft)
  const [quoteDateText, setQuoteDateText] = useState("")
  const [validText, setValidText] = useState("")
  const [deptFilter, setDeptFilter] = useState("")
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showPayments, setShowPayments] = useState(false)
  const [paymentForm, setPaymentForm] = useState<null | {
    amount: string; date: string; proof_type: QuotationPayment["proof_type"]; proof_note: string
    allocations: Array<{ item_id: string; amount: string }>
  }>(null)
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [maturingToInvoice, setMaturingToInvoice] = useState(false)

  useEffect(() => {
    if (!open) return
    const d: QuotationDraft = quotation ? clone(quotation) : blankDraft(false)
    setDraft(d)
    setQuoteDateText(d.quote_date)
    setValidText(d.valid_until || "")
    setDirty(false)
    setShowPayments(false)
    setPaymentForm(null)
  }, [open, quotation])

  const update = (patch: Partial<QuotationDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
  }
  const updateItem = (id: string, patch: Partial<QuotationItem>) =>
    update({ items: draft.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) })

  const levels = useMemo(() => flattenJobLevels(departments.data || []), [departments.data])
  const versions = useMemo(() => indexVersions(rateCards.data || []), [rateCards.data])

  // Priceable services on the quotation date (offered for jobs)
  const priceable = useMemo(() => {
    const out: { level: JobLevel; version: RateCardRow; label: string }[] = []
    const settings = settingsOn(settingsRes.data, draft.quote_date)
    for (const level of levels) {
      if (deptFilter && String(level.departmentId) !== deptFilter) continue
      const version = versionOn(versions.get(level.key), draft.quote_date)
      if (!version) continue
      let price: number
      if (version.card_type === "immigration") {
        price = immigrationBreakdown(normalizeImmigrationRates(version.rates as any), settings).rounded
      } else {
        const r = normalizeJobRates(version.rates as any)
        if (!r.applicable) continue
        price = jobBreakdown(r, settings).rounded
      }
      out.push({ level, version, label: `${level.departmentName} → ${level.path} — KES ${fmtKes(price)}` })
    }
    return out
  }, [levels, versions, settingsRes.data, draft.quote_date, deptFilter])

  const departmentOptions = useMemo(() => {
    const seen = new Map<number, string>()
    levels.forEach((l) => seen.set(l.departmentId, l.departmentName))
    return [{ value: "", label: "All departments" }, ...Array.from(seen, ([id, name]) => ({ value: String(id), label: name }))]
  }, [levels])

  const companyOptions = useMemo(() => (companies.data || []).map((c) => ({ value: String(c.id), label: c.company_name })), [companies.data])
  const individualOptions = useMemo(() => (individuals.data || []).map((i) => ({ value: String(i.id), label: i.full_name })), [individuals.data])

  // Use the "with" mode for pricing totals in the editor (the etims_mode only affects the document sections)
  const useEtimsForPricing = draft.etims_mode !== "without"
  const totals = quotationTotals(draft.items, draft.settings, useEtimsForPricing)
  const paymentsData: QuotationPayment[] = (draft as any).payments ?? []
  const paymentSummary = quotationPaymentSummary({ ...draft, payments: paymentsData } as any, totals.total)

  const isExisting = !!draft.id
  const lockReason = isExisting ? revisionLockReason(draft) : null
  const isLocked = !!lockReason && draft.status !== "proposal"
  const isProposal = draft.status === "proposal"
  const canShowPayments = isExisting && (draft.status === "accepted" || draft.status === "invoice")

  const setQuoteDate = (text: string) => {
    setQuoteDateText(text)
    const iso = dateFieldToIso(text)
    if (iso && iso !== "invalid" && iso !== draft.quote_date) update({ quote_date: iso, settings: settingsOn(settingsRes.data, iso) })
  }

  const reprice = () => {
    let missing = 0
    const items = draft.items.map((it) => {
      const level = levels.find((l) => l.key === it.job_key)
      const version = level && versionOn(versions.get(it.job_key), draft.quote_date)
      if (!level || !version) { missing += 1; return it }
      return { ...itemFrom(level, version), id: it.id, quantity: it.quantity, details: it.details, detail_date: it.detail_date }
    })
    update({ items, settings: settingsOn(settingsRes.data, draft.quote_date) })
    toast.message(missing
      ? `Repriced; ${missing} line${missing === 1 ? "" : "s"} have no rate on this date and were left as-is.`
      : `All lines repriced at the ${formatDateToDMY(draft.quote_date)} rates.`)
  }

  const validate = (): string | null => {
    if (!draft.client_name.trim()) return "Choose the client."
    if (draft.items.length === 0) return "Add at least one service."
    const v = dateFieldToIso(validText)
    if (v === "invalid") return "The valid-until date isn't a real date."
    return null
  }

  const handleSave = async (andExport = false) => {
    const problem = validate()
    if (problem) return toast.error(problem)
    const valid = dateFieldToIso(validText)
    setSaving(true)
    try {
      const draftWithValid = { ...draft, valid_until: valid && valid !== "invalid" ? valid : null }
      let saved: Quotation
      // If editing an existing quotation (not proposal), bump the revision counter
      if (isExisting && draft.status !== "proposal" && canRevise(draft)) {
        saved = await reviseQuotation(quotation!, draftWithValid, userName)
      } else {
        saved = await saveQuotation(draftWithValid, userName)
      }
      setDraft(clone(saved))
      setDirty(false)
      toast.success(`${saved.quote_number} saved`)
      if (andExport) await exportQuotation(saved)
    } catch (e: any) {
      toast.error(/tm_quotations/.test(e?.message || "")
        ? "The quotations table doesn't exist yet — apply the rate card migration first."
        : e?.message || "Could not save the quotation")
    } finally {
      setSaving(false)
    }
  }

  const handleMatureToInvoice = async () => {
    if (!quotation) return
    setMaturingToInvoice(true)
    try {
      const saved = await matureToInvoice(quotation, userName)
      setDraft(clone(saved))
      toast.success(`${saved.quote_number} matured to invoice`)
    } catch (e: any) {
      toast.error(e?.message || "Could not mature to invoice")
    } finally {
      setMaturingToInvoice(false)
    }
  }

  const openPaymentForm = () => {
    const allocations = draft.items.map((it) => ({ item_id: it.id, amount: "" }))
    setPaymentForm({ amount: "", date: todayYmd(), proof_type: "mpesa", proof_note: "", allocations })
  }

  const updatePaymentAllocation = (itemId: string, value: string) => {
    setPaymentForm((f) => f ? ({ ...f, allocations: f.allocations.map((a) => a.item_id === itemId ? { ...a, amount: value } : a) }) : f)
  }

  const autoAllocate = () => {
    if (!paymentForm) return
    const amount = parseFloat(paymentForm.amount) || 0
    const allocs = defaultAllocations(draft.items, draft.settings, useEtimsForPricing, amount)
    setPaymentForm((f) => f ? ({ ...f, allocations: allocs.map((a) => ({ item_id: a.item_id, amount: String(a.amount) })) }) : f)
  }

  const handleRecordPayment = async () => {
    if (!paymentForm || !quotation) return
    const amount = parseFloat(paymentForm.amount)
    if (!amount || amount <= 0) return toast.error("Enter a valid payment amount.")
    const dateIso = dateFieldToIso(paymentForm.date)
    if (!dateIso || dateIso === "invalid") return toast.error("Enter a valid payment date.")
    setRecordingPayment(true)
    try {
      const saved = await recordPayment(
        quotation,
        {
          amount,
          payment_date: dateIso,
          proof_type: paymentForm.proof_type,
          proof_note: paymentForm.proof_note || null,
          proof_url: null,
          allocations: paymentForm.allocations.map((a) => ({ item_id: a.item_id, amount: parseFloat(a.amount) || 0 })),
          recorded_by: userName,
        },
        userName,
      )
      setDraft(clone(saved))
      setPaymentForm(null)
      toast.success(`Payment of KES ${fmtKes(amount)} recorded`)
    } catch (e: any) {
      toast.error(e?.message || "Could not record the payment")
    } finally {
      setRecordingPayment(false)
    }
  }

  const handleDeletePayment = async (paymentId: string) => {
    if (!quotation || !window.confirm("Delete this payment record?")) return
    try {
      const saved = await deletePayment(quotation, paymentId, userName)
      setDraft(clone(saved))
      toast.success("Payment deleted")
    } catch (e: any) {
      toast.error(e?.message || "Could not delete the payment")
    }
  }

  const close = () => {
    if (dirty && !window.confirm("Discard the changes to this quotation?")) return
    onClose()
  }

  const ClientTypeButton = ({ value, icon: Icon, label }: { value: ClientType; icon: any; label: string }) => (
    <Button
      type="button" variant="outline" size="sm"
      onClick={() => update({ client_type: value, company_id: null, individual_id: null, client_name: "" })}
      className={cn(PILL_BUTTON_CLASS, draft.client_type === value && PILL_BUTTON_ACTIVE_CLASS)}
    >
      <Icon className="h-4 w-4" /> {label}
    </Button>
  )

  const statusBadge = STATUSES.find((s) => s.value === draft.status)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-[min(1400px,96vw)] h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-slate-200 shrink-0">
          <DialogTitle className="text-2xl flex items-center gap-2 flex-wrap">
            <FileText className="h-6 w-6 text-custom-blue" />
            {draft.quote_number || (isProposal ? "New Proposal" : "New Quotation")}
            {draft.id && (
              <span className={cn("ml-1 rounded-full border px-2.5 py-0.5 text-sm font-semibold", statusBadge?.badge)}>
                {statusBadge?.label}
              </span>
            )}
            {isExisting && !isProposal && draft.revision_number > 0 && (
              <span className="rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-sm font-semibold px-2.5 py-0.5">
                Rev. {draft.revision_number}{draft.revision_number >= 3 ? " (final)" : ""}
              </span>
            )}
            {canShowPayments && (
              <span className={cn("rounded-full border text-sm font-semibold px-2.5 py-0.5", PAYMENT_STATUS_BADGE[paymentSummary.status])}>
                {PAYMENT_STATUS_LABELS[paymentSummary.status]}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-base">
            Priced from the rates in force on the quotation date. Each line keeps its own copy of the rate, so later rate changes don&apos;t alter this quotation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto px-5 py-4 space-y-4 bg-slate-50/50">

          {/* Lock warning */}
          {isLocked && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 flex items-start gap-2.5 text-base text-slate-700">
              <Lock className="h-5 w-5 text-slate-400 mt-0.5 shrink-0" />
              <span><strong>Locked for revisions.</strong> {lockReason} You can still update status and record payments.</span>
            </div>
          )}

          {/* Document type + Client + Terms */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
            {/* Document type selector (new quotation only) */}
            {!isExisting && (
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <span className="text-base font-medium text-slate-700 mr-2">Document type</span>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => update({ status: "proposal", proposal_date: todayYmd(), valid_until: null })}
                  className={cn(PILL_BUTTON_CLASS, isProposal && PILL_BUTTON_ACTIVE_CLASS)}
                >
                  Proposal
                </Button>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => update({ status: "draft", proposal_date: null, valid_until: addDaysIso(draft.quote_date, 30) })}
                  className={cn(PILL_BUTTON_CLASS, !isProposal && PILL_BUTTON_ACTIVE_CLASS)}
                >
                  Quotation
                </Button>
                <span className="ml-2 text-sm text-slate-500">
                  {isProposal ? "A proposal is informal and doesn't start the revision clock." : "A quotation is formal and can be revised up to 3 times."}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5 space-y-2">
                <Label className="text-base">Client</Label>
                <div className="flex gap-2 flex-wrap">
                  <ClientTypeButton value="company" icon={Building2} label="Company" />
                  <ClientTypeButton value="individual" icon={User} label="Individual" />
                  <ClientTypeButton value="other" icon={User} label="Other / walk-in" />
                </div>
                {draft.client_type === "company" && (
                  <SearchSelect
                    value={draft.company_id ? String(draft.company_id) : ""}
                    onChange={(v) => update({ company_id: v ? Number(v) : null, client_name: companyOptions.find((o) => o.value === v)?.label || "" })}
                    options={companyOptions}
                    placeholder={companies.loading ? "Loading companies…" : "Select a company…"}
                  />
                )}
                {draft.client_type === "individual" && (
                  <SearchSelect
                    value={draft.individual_id ? String(draft.individual_id) : ""}
                    onChange={(v) => update({ individual_id: v ? Number(v) : null, client_name: individualOptions.find((o) => o.value === v)?.label || "" })}
                    options={individualOptions}
                    placeholder={individuals.loading ? "Loading individuals…" : "Select an individual…"}
                  />
                )}
                {draft.client_type === "other" && (
                  <Input value={draft.client_name} onChange={(e) => update({ client_name: e.target.value })} placeholder="Client name" className="h-10 text-base" />
                )}
              </div>
              <div className="lg:col-span-2 space-y-2">
                <Label className="text-base">Date</Label>
                <DateInput value={quoteDateText} onChange={setQuoteDate} className="h-10 text-base" />
              </div>
              {!isProposal && (
                <div className="lg:col-span-2 space-y-2">
                  <Label className="text-base">Valid until</Label>
                  <DateInput value={validText} onChange={(t) => { setValidText(t); setDirty(true) }} className="h-10 text-base" />
                </div>
              )}
              <div className="lg:col-span-3 space-y-2">
                <Label className="text-base">Status</Label>
                <SearchSelect value={draft.status} onChange={(v) => v && update({ status: v as QuotationStatus })} options={STATUSES} />
              </div>
            </div>

            {/* eTIMS mode selector */}
            <div className="pt-2 border-t border-slate-100">
              <Label className="text-base mb-2 block">Pricing sections to include</Label>
              <div className="flex gap-2 flex-wrap">
                {ETIMS_MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update({ etims_mode: opt.value, with_etims: opt.value !== "without" })}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm font-medium text-left transition-all",
                      draft.etims_mode === opt.value
                        ? "border-custom-blue bg-custom-blue text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <div className="font-semibold">{opt.label}</div>
                    <div className={cn("text-xs", draft.etims_mode === opt.value ? "text-white/80" : "text-slate-500")}>{opt.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Add services */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-2 w-56">
                <Label className="text-base">Department</Label>
                <SearchSelect value={deptFilter} onChange={setDeptFilter} options={departmentOptions} placeholder="All departments" />
              </div>
              <div className="space-y-2 flex-1 min-w-[320px]">
                <Label className="text-base">Add a service (job level priced on {formatDateToDMY(draft.quote_date)})</Label>
                <SearchSelect
                  value=""
                  onChange={(key) => {
                    const p = priceable.find((x) => x.level.key === key)
                    if (p) update({ items: [...draft.items, itemFrom(p.level, p.version)] })
                  }}
                  options={priceable.map((p) => ({ value: p.level.key, label: p.label }))}
                  placeholder={rateCards.loading || departments.loading ? "Loading rates…" : priceable.length ? `Search ${priceable.length} priced services…` : "No priced services on this date"}
                />
              </div>
              {draft.items.length > 0 && (
                <Button variant="outline" size="sm" onClick={reprice} className={PILL_BUTTON_CLASS} title="Re-read every line's rate as at the quotation date">
                  <RefreshCw className="h-4 w-4" /> Reprice
                </Button>
              )}
            </div>

            <div className="overflow-auto rounded-md border border-slate-200">
              <table className="w-full border-separate border-spacing-0 text-left">
                <thead>
                  <tr>
                    {["#", "Service", "Details", "Options", "Qty",
                      ...(draft.etims_mode !== "with" ? ["Official (KES)", "BCL Fees"] : []),
                      ...(draft.etims_mode !== "without" ? ["eTIMS Official", "eTIMS BCL", "VAT"] : []),
                      "Total (KES)", ""].map((h) => (
                      <th key={h} className={cn(TH_CLASS, HEAD_NEUTRAL, "text-sm", /KES|Qty|VAT/.test(h) && "text-right")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.items.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-10 text-center text-base text-slate-500">
                        No services yet — pick one above.
                      </td>
                    </tr>
                  ) : (
                    draft.items.map((it, i) => (
                      <ItemRow
                        key={it.id}
                        index={i}
                        item={it}
                        draft={draft}
                        onChange={(patch) => updateItem(it.id, patch)}
                        onRemove={() => update({ items: draft.items.filter((x) => x.id !== it.id) })}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals + notes */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 rounded-lg border border-slate-200 bg-white p-4 space-y-2">
              <Label className="text-base">Notes</Label>
              <Textarea value={draft.notes || ""} onChange={(e) => update({ notes: e.target.value })} rows={4} className="text-base" placeholder="Terms, assumptions, documents needed…" />
            </div>
            <div className="lg:col-span-5 rounded-lg border border-slate-200 bg-white p-4">
              <dl className="space-y-1.5 text-base">
                <TotalLine label="Official (government) fees" value={totals.official} />
                <TotalLine label={useEtimsForPricing ? "BCL fees (net invoice)" : "BCL fees"} value={totals.consultancy} />
                {useEtimsForPricing && <TotalLine label={`VAT ${Math.round(draft.settings.vat_rate * 100)}%`} value={totals.vat} />}
                <div className="border-t border-slate-200 pt-2 mt-2">
                  <TotalLine label="Total payable to BCL" value={totals.total} strong />
                </div>
                {totals.paid_at_bank > 0 && (
                  <TotalLine label="Plus: issuance fees the client pays at the bank" value={totals.paid_at_bank} muted />
                )}
                {canShowPayments && (
                  <>
                    <div className="border-t border-slate-200 pt-2 mt-2 space-y-1">
                      <TotalLine label="Paid" value={paymentSummary.paid} />
                      {paymentSummary.balance > 0 && <TotalLine label="Balance" value={paymentSummary.balance} muted />}
                      {paymentSummary.overpayment > 0 && <TotalLine label="Overpayment" value={paymentSummary.overpayment} />}
                    </div>
                  </>
                )}
                <p className="pt-1 text-sm text-slate-500">
                  Rates: {draft.settings.usd_rate} KES/USD as at {formatDateToDMY(draft.quote_date)}.
                </p>
              </dl>
            </div>
          </div>

          {/* Payments section — only when accepted or invoice */}
          {canShowPayments && (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPayments((v) => !v)}
                className="w-full flex items-center gap-2 px-4 py-3 text-base font-semibold text-slate-900 hover:bg-slate-50 transition-colors"
              >
                <CreditCard className="h-5 w-5 text-custom-blue" />
                Payments
                <span className={cn("ml-1 rounded-full border text-sm px-2 py-0.5", PAYMENT_STATUS_BADGE[paymentSummary.status])}>
                  {PAYMENT_STATUS_LABELS[paymentSummary.status]}
                </span>
                {paymentSummary.paid > 0 && <span className="text-sm text-slate-500 font-normal">KES {fmtKes(paymentSummary.paid)} of {fmtKes(totals.total)}</span>}
                {showPayments ? <ChevronDown className="ml-auto h-4 w-4" /> : <ChevronRight className="ml-auto h-4 w-4" />}
              </button>

              {showPayments && (
                <div className="border-t border-slate-100 px-4 pb-4 space-y-3">
                  {/* Existing payments list */}
                  {paymentsData.length > 0 && (
                    <div className="overflow-auto rounded-md border border-slate-200 mt-3">
                      <table className="w-full text-sm text-left border-separate border-spacing-0">
                        <thead>
                          <tr>
                            {["Date", "Amount (KES)", "Proof", "Recorded by", ""].map((h) => (
                              <th key={h} className={cn(TH_CLASS, HEAD_NEUTRAL, "text-sm")}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {paymentsData.map((p, i) => (
                            <tr key={p.id} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                              <td className={TD_CLASS}>{formatDateToDMY(p.payment_date)}</td>
                              <td className={cn(TD_CLASS, "font-semibold tabular-nums text-right")}>{fmtKes(p.amount)}</td>
                              <td className={TD_CLASS}>
                                <span className="capitalize">{p.proof_type || "—"}</span>
                                {p.proof_note && <p className="text-slate-500 text-xs truncate max-w-[200px]" title={p.proof_note}>{p.proof_note}</p>}
                              </td>
                              <td className={TD_CLASS}>{p.recorded_by || "—"}</td>
                              <td className={TD_CLASS}>
                                <button
                                  type="button"
                                  title="Delete this payment record"
                                  onClick={() => handleDeletePayment(p.id)}
                                  className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Record new payment form */}
                  {paymentForm ? (
                    <div className="rounded-md border border-slate-200 p-4 space-y-3 bg-slate-50/50">
                      <div className="text-base font-semibold text-slate-900">Record a payment</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-sm">Amount (KES)</Label>
                          <Input
                            value={paymentForm.amount}
                            onChange={(e) => setPaymentForm((f) => f ? ({ ...f, amount: e.target.value }) : f)}
                            inputMode="decimal"
                            placeholder="0"
                            className="h-10 text-base"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-sm">Payment date</Label>
                          <DateInput
                            value={paymentForm.date}
                            onChange={(d) => setPaymentForm((f) => f ? ({ ...f, date: d }) : f)}
                            className="h-10 text-base"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-sm">Proof type</Label>
                          <SearchSelect
                            value={paymentForm.proof_type ?? ""}
                            onChange={(v) => setPaymentForm((f) => f ? ({ ...f, proof_type: (v || null) as any }) : f)}
                            options={PROOF_TYPE_OPTIONS}
                            placeholder="Select…"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-sm">Proof note (paste M-Pesa message or describe the bank slip)</Label>
                        <Textarea
                          value={paymentForm.proof_note}
                          onChange={(e) => setPaymentForm((f) => f ? ({ ...f, proof_note: e.target.value }) : f)}
                          rows={3}
                          className="text-base font-mono text-sm"
                          placeholder="Paste M-Pesa confirmation or enter bank slip details…"
                        />
                      </div>
                      {/* Item allocation */}
                      {draft.items.length > 1 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Allocate to items</Label>
                            <button type="button" onClick={autoAllocate} className="text-xs text-custom-blue hover:underline">
                              Auto-split proportionally
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            {draft.items.map((it) => {
                              const alloc = paymentForm.allocations.find((a) => a.item_id === it.id)
                              return (
                                <div key={it.id} className="flex items-center gap-2">
                                  <span className="flex-1 text-sm text-slate-700 truncate">{it.job_path}</span>
                                  <NumberField
                                    value={alloc ? parseFloat(alloc.amount) || null : null}
                                    onCommit={(v) => updatePaymentAllocation(it.id, String(v ?? ""))}
                                    className="w-32"
                                    placeholder="0"
                                  />
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2 justify-end pt-1">
                        <Button variant="outline" size="sm" onClick={() => setPaymentForm(null)} className={PILL_BUTTON_CLASS}>Cancel</Button>
                        <Button size="sm" onClick={handleRecordPayment} disabled={recordingPayment} className={PRIMARY_PILL_BUTTON_CLASS}>
                          {recordingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Record Payment
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={openPaymentForm} className={PILL_BUTTON_CLASS}>
                        <Plus className="h-4 w-4" /> Record Payment
                      </Button>
                      {paymentSummary.status === "paid" && draft.status !== "invoice" && (
                        <Button size="sm" onClick={handleMatureToInvoice} disabled={maturingToInvoice} className={PRIMARY_PILL_BUTTON_CLASS}>
                          {maturingToInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Mature to Invoice
                        </Button>
                      )}
                      {paymentSummary.status === "overpaid" && (
                        <span className="text-sm text-blue-600 font-medium flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4" />
                          Overpaid by KES {fmtKes(paymentSummary.overpayment)} — balance to apply or refund
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3 shrink-0 flex-wrap">
          {dirty && <span className="mr-auto text-base text-amber-700">Unsaved changes</span>}
          <Button variant="outline" onClick={close} className={PILL_BUTTON_CLASS}>Close</Button>
          <Button variant="outline" onClick={() => handleSave(true)} disabled={saving} className={PILL_BUTTON_CLASS}>
            <Download className="h-5 w-5" /> Save &amp; export
          </Button>
          <Button onClick={() => handleSave(false)} disabled={saving} className={PRIMARY_PILL_BUTTON_CLASS}>
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            {isExisting && !isProposal && canRevise(draft) ? `Save (Rev. ${(draft.revision_number ?? 0) + 1})` : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TotalLine({ label, value, strong, muted }: { label: string; value: number; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", muted && "text-slate-500")}>
      <dt className={cn(strong ? "font-semibold text-slate-900" : "text-slate-600")}>{label}</dt>
      <dd className={cn("tabular-nums", strong ? "text-2xl font-bold text-slate-900" : "font-medium")}>{fmtKes(value, true)}</dd>
    </div>
  )
}

function ItemRow({
  index, item, draft, onChange, onRemove,
}: {
  index: number
  item: QuotationItem
  draft: QuotationDraft
  onChange: (patch: Partial<QuotationItem>) => void
  onRemove: () => void
}) {
  const useEtims = draft.etims_mode !== "without"
  const price = priceItem(item, draft.settings, useEtims)
  const isImm = item.card_type === "immigration"
  const imm = isImm ? normalizeImmigrationRates(item.rates as ImmigrationRates) : null
  const job = !isImm ? normalizeJobRates(item.rates as JobRates) : null
  const setRates = (rates: ImmigrationRates | JobRates) => onChange({ rates })

  const zebra = index % 2 ? "bg-slate-50" : "bg-white"
  const fig = (v: number) => <span className="block text-right tabular-nums font-medium">{fmtKes(v, useEtims)}</span>

  return (
    <tr className={zebra}>
      <td className={cn(TD_CLASS, "text-slate-500 tabular-nums")}>{index + 1}</td>
      <td className={cn(TD_CLASS, "min-w-[260px]")}>
        <div className="font-semibold text-slate-900 leading-snug">{item.job_path}</div>
        <div className="text-sm text-slate-500">
          Rate from {formatDateToDMY(item.rate_effective_from)}
          {imm && validityText(imm) && ` · ${validityText(imm)}`}
          {job?.frequency && ` · ${labelOf(FREQUENCIES, job.frequency)}`}
          {job?.basis && job.basis !== "fixed" && ` · ${labelOf(PRICE_BASES, job.basis)}${job.estimateNote ? ` ${job.estimateNote}` : ""}`}
        </div>
        {imm && <div className="text-sm text-slate-500">Payment: {paymentText(imm)}</div>}
      </td>
      <td className={cn(TD_CLASS, "min-w-[200px] space-y-1.5")}>
        <TextField value={item.details} onCommit={(details) => onChange({ details })} placeholder={job?.detailsPrompt || "Names / reference"} />
        {job?.datePrompt && (
          <DateInput value={item.detail_date} onChange={(detail_date) => onChange({ detail_date })} placeholder={job.datePrompt} className="h-9 text-sm" />
        )}
      </td>
      <td className={cn(TD_CLASS, "min-w-[300px]")}>
        {imm && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {IMMIGRATION_COMPONENTS.filter((c) => c.group === "extra" || c.group === "help").map((c) => {
                const comp = imm.components[c.key]
                const on = !!comp?.on
                return (
                  <button
                    key={c.key}
                    type="button"
                    title={`${c.label}${c.appliesTo ? ` — ${c.appliesTo}` : ""}`}
                    onClick={() => setRates({ ...imm, components: { ...imm.components, [c.key]: { ...comp, on: !on, amount: comp?.amount ?? c.defaultAmount ?? 0 } } })}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                      on ? "border-custom-blue bg-custom-blue text-white" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    {c.code} {c.short}{on ? ` ${fmtKes(comp?.amount ?? 0)}` : ""}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="shrink-0">Discount</span>
              <NumberField
                value={imm.components.discount?.on ? imm.components.discount.amount : 0}
                onCommit={(v) => setRates({ ...imm, components: { ...imm.components, discount: { on: !!v, amount: v ?? 0 } } })}
                className="h-8 w-28"
              />
              <span className="shrink-0">Facilitation</span>
              <NumberField
                value={imm.components.facilitation?.amount ?? 0}
                onCommit={(v) => setRates({ ...imm, components: { ...imm.components, facilitation: { on: true, amount: v ?? 0 } } })}
                className="h-8 w-28"
              />
            </div>
          </div>
        )}
        {job && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="shrink-0">Official</span>
            <NumberField
              value={job.officialFee.on ? job.officialFee.amount : 0}
              onCommit={(v) => setRates({ ...job, officialFee: { ...job.officialFee, on: true, amount: v ?? 0 } })}
              className="h-8 w-28"
              title={job.officialFee.currency === "USD" ? "USD" : "KES"}
            />
            <span className="shrink-0">Consultancy</span>
            <NumberField value={job.consultancyFee} onCommit={(v) => setRates({ ...job, consultancyFee: v })} className="h-8 w-28" />
          </div>
        )}
      </td>
      <td className={cn(TD_CLASS, "w-20")}>
        <NumberField value={item.quantity} onCommit={(v) => onChange({ quantity: v && v > 0 ? v : 1 })} />
      </td>
      {draft.etims_mode !== "with" && (
        <>
          <td className={TD_CLASS}>
            {fig(price.official)}
            {price.paidAtBank > 0 && <span className="block text-right text-xs text-slate-500">+ {fmtKes(price.paidAtBank)} at bank</span>}
          </td>
          <td className={TD_CLASS}>{fig(price.consultancy)}</td>
        </>
      )}
      {draft.etims_mode !== "without" && (
        <>
          <td className={TD_CLASS}>{fig(price.official)}</td>
          <td className={TD_CLASS}>{fig(price.consultancy)}</td>
          <td className={TD_CLASS}>{fig(price.vat)}</td>
        </>
      )}
      <td className={cn(TD_CLASS, "bg-blue-50/60")}>
        <span className="block text-right tabular-nums font-bold text-slate-900">{fmtKes(price.total, useEtims)}</span>
      </td>
      <td className={TD_CLASS}>
        <button type="button" onClick={onRemove} title="Remove this line" className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  )
}
