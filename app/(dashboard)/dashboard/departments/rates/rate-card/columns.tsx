"use client"

import React from "react"
import { History, Undo2, Wand2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { formatDateToDMY } from "@/lib/dateUtils"
import { cn } from "@/lib/utils"
import {
  COMPONENT_BY_KEY, FREQUENCIES, GROUP_LABEL, IMMIGRATION_COMPONENTS, PAYMENT_MODES, PRICE_BASES, REQUIREMENTS, VALIDITY_UNITS,
} from "./catalog"
import { fmtKes, type ImmigrationBreakdown, type JobBreakdown } from "./calc"
import { ComponentCell, Figure, MiniSelect, NumberField, TextField } from "./cells"
import { IMMIGRATION_PRESETS, JOB_PRESETS } from "./presets"
import type { GridBand, GridColumn } from "./RateGrid"
import type { ImmigrationRates, JobLevel, JobRates, RateCardRow, RateSettings } from "./types"

export interface RowModel<R, B> {
  level: JobLevel
  /** Version in force on the "as of" date. */
  version: RateCardRow | undefined
  versionCount: number
  rates: R
  breakdown: B
  dirty: boolean
}

export type ImmigrationRow = RowModel<ImmigrationRates, ImmigrationBreakdown>
export type JobRow = RowModel<JobRates, JobBreakdown>

export interface ColumnContext<R> {
  settings: RateSettings
  onChange: (key: string, rates: R) => void
  onHistory: (level: JobLevel) => void
  onDiscard: (key: string) => void
  onPreset: (key: string, presetId: string) => void
}

// ── bands ────────────────────────────────────────────────────────────────────

export const IMMIGRATION_BANDS: Record<string, GridBand> = {
  status: { id: "status", label: "Rate", head: "bg-slate-100 text-slate-800" },
  official: { id: "official", label: GROUP_LABEL.official, head: "bg-custom-blue text-white border-white/20", tint: "bg-blue-50/70" },
  facilitation: { id: "facilitation", label: GROUP_LABEL.facilitation, head: "bg-emerald-600 text-white border-white/20", tint: "bg-emerald-50/70" },
  extra: { id: "extra", label: GROUP_LABEL.extra, head: "bg-amber-600 text-white border-white/20", tint: "bg-amber-50/70" },
  help: { id: "help", label: GROUP_LABEL.help, head: "bg-violet-600 text-white border-white/20", tint: "bg-violet-50/70" },
  totals: { id: "totals", label: "Totals (KES)", head: "bg-slate-700 text-white border-white/20", tint: "bg-slate-100" },
  payment: { id: "payment", label: "Payment Terms", head: "bg-slate-600 text-white border-white/20" },
}

export const JOB_BANDS: Record<string, GridBand> = {
  status: IMMIGRATION_BANDS.status,
  job: { id: "job", label: "Job", head: "bg-slate-600 text-white border-white/20" },
  capture: { id: "capture", label: "Capture on Quotation", head: "bg-slate-500 text-white border-white/20" },
  plain: { id: "plain", label: "Without eTIMS Invoice (KES)", head: "bg-custom-blue text-white border-white/20", tint: "bg-blue-50/70" },
  etims: { id: "etims", label: "With eTIMS Invoice — Claimable (KES)", head: "bg-emerald-600 text-white border-white/20", tint: "bg-emerald-50/70" },
  workflow: { id: "workflow", label: "Workflow", head: "bg-violet-600 text-white border-white/20" },
}

/** Toggleable column groups, for the Columns button. */
export const IMMIGRATION_GROUPS = [
  { id: "official", label: GROUP_LABEL.official },
  { id: "facilitation", label: GROUP_LABEL.facilitation },
  { id: "extra", label: GROUP_LABEL.extra },
  { id: "help", label: GROUP_LABEL.help },
  { id: "totals", label: "Totals" },
  { id: "payment", label: "Payment Terms" },
]

export const JOB_GROUPS = [
  { id: "job", label: "Job" },
  { id: "capture", label: "Capture on Quotation" },
  { id: "plain", label: "Without eTIMS Invoice" },
  { id: "etims", label: "With eTIMS Invoice" },
  { id: "workflow", label: "Workflow (WhatsApp, Stages, Checklist)" },
]

// ── shared pieces ────────────────────────────────────────────────────────────

const levelCell = (text: string | null | undefined, strong?: boolean) =>
  text ? <span className={cn("block leading-snug", strong ? "font-semibold text-slate-900" : "text-slate-700")}>{text}</span> : <span className="text-slate-300">—</span>

function stickyColumns<R extends RowModel<any, any>>(withDepartment: boolean): GridColumn<R>[] {
  const cols: GridColumn<R>[] = [
    { id: "idx", band: "status", header: "#", width: 52, render: (_r, i) => <span className="tabular-nums text-slate-500">{i + 1}</span> },
  ]
  if (withDepartment) {
    cols.push({ id: "dept", band: "status", header: "Department", width: 130, render: (r) => levelCell(r.level.departmentName, true) })
  }
  cols.push(
    { id: "sub", band: "status", header: withDepartment ? "Category (Sub Dept)" : "Sub Department", width: 160, render: (r) => levelCell(r.level.subdepartmentName, !withDepartment) },
    { id: "class", band: "status", header: withDepartment ? "Job Offered (Class)" : "Class", width: 200, render: (r) => levelCell(r.level.className) },
    { id: "subclass", band: "status", header: "Sub Class", width: 170, render: (r) => levelCell(r.level.subclassName) },
  )
  return cols
}

function StatusCell<R>({ row, ctx }: { row: RowModel<R, any>; ctx: ColumnContext<R> }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1 leading-tight">
        {row.dirty ? (
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-sm font-semibold text-amber-700">Edited</span>
        ) : row.version ? (
          <span className="text-sm text-slate-600" title={row.version.note || undefined}>
            From <span className="font-semibold text-slate-800">{formatDateToDMY(row.version.effective_from)}</span>
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-500">Not priced</span>
        )}
      </div>
      {row.dirty && (
        <button type="button" onClick={() => ctx.onDiscard(row.level.key)} title="Discard this row's edits" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200/70 hover:text-slate-800">
          <Undo2 className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => ctx.onHistory(row.level)}
        title={row.versionCount > 0 ? `${row.versionCount} version${row.versionCount === 1 ? "" : "s"} — view history` : "No saved versions yet"}
        className="relative rounded-md p-1.5 text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"
      >
        <History className="h-4 w-4" />
        {row.versionCount > 1 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1rem] rounded-full bg-custom-blue px-1 text-[10px] font-bold leading-4 text-white">{row.versionCount}</span>
        )}
      </button>
    </div>
  )
}

const IMMIGRATION_PRESET_OPTIONS = IMMIGRATION_PRESETS.map((p) => ({ value: p.id, label: `${p.label}${p.sheetTotal != null ? ` — ${fmtKes(p.sheetTotal)}` : ""}` }))
const JOB_PRESET_OPTIONS = JOB_PRESETS.map((p) => ({ value: p.id, label: `${p.department} · ${p.job}` }))

function PresetPicker({ options, onPick }: { options: { value: string; label: string }[]; onPick: (id: string) => void }) {
  return (
    <SearchableSelect
      value=""
      onValueChange={(v) => v && onPick(v)}
      options={options}
      placeholder="Fill from sheet…"
      searchPlaceholder="Search the rate sheet…"
      buttonClassName="h-9 text-sm font-normal rounded-md border-dashed border-slate-300 bg-white text-slate-500 shadow-none hover:bg-slate-50"
      popoverClassName="w-[460px]"
    />
  )
}

const presetColumn = <R,>(): GridColumn<RowModel<R, any>> => ({
  id: "preset",
  band: "status",
  header: (
    <span className="inline-flex items-center gap-1.5">
      <Wand2 className="h-4 w-4" /> Sheet preset
    </span>
  ),
  title: "Copy a column of the rate sheet into this row (then adjust and save)",
  width: 180,
  render: () => null,
})

// ── immigration ──────────────────────────────────────────────────────────────

export function immigrationColumns(ctx: ColumnContext<ImmigrationRates>, visible: Record<string, boolean>) {
  const set = (r: ImmigrationRow, patch: Partial<ImmigrationRates>) => ctx.onChange(r.level.key, { ...r.rates, ...patch })
  const setComponent = (r: ImmigrationRow, key: string, value: ImmigrationRates["components"][string]) =>
    set(r, { components: { ...r.rates.components, [key]: value } })

  const componentColumn = (key: string): GridColumn<ImmigrationRow> => {
    const def = COMPONENT_BY_KEY[key]
    return {
      id: key,
      band: def.group,
      header: (
        <span>
          <span className="block text-xs font-bold opacity-80">{def.code}</span>
          {def.short}
        </span>
      ),
      title: [def.label, def.appliesTo ? `Applies to: ${def.appliesTo}` : "", def.defaultAmount ? `Default ${fmtKes(def.defaultAmount)}` : ""].filter(Boolean).join("\n"),
      width: def.currency ? 190 : 150,
      render: (r) => (
        <ComponentCell
          value={r.rates.components[key]}
          onChange={(v) => setComponent(r, key, v)}
          withCurrency={def.currency}
          defaultAmount={def.defaultAmount}
          usdRate={ctx.settings.usd_rate}
        />
      ),
    }
  }

  const figure = (id: string, band: string, header: string, value: (b: ImmigrationBreakdown) => number, opts: { strong?: boolean; title?: string; negative?: boolean } = {}): GridColumn<ImmigrationRow> => ({
    id, band, header, title: opts.title, width: 130, computed: true,
    render: (r) => {
      const v = value(r.breakdown)
      return <Figure value={v === 0 ? "—" : `${opts.negative && v ? "−" : ""}${fmtKes(v)}`} strong={opts.strong} tone={v === 0 ? "muted" : opts.negative ? "negative" : undefined} />
    },
  })

  const cols: GridColumn<ImmigrationRow>[] = [
    { id: "status", band: "status", header: "Effective", width: 190, render: (r) => <StatusCell row={r} ctx={ctx} /> },
    { ...presetColumn<ImmigrationRates>(), render: (r) => <PresetPicker options={IMMIGRATION_PRESET_OPTIONS} onPick={(id) => ctx.onPreset(r.level.key, id)} /> },
  ]

  if (visible.official !== false) {
    cols.push(
      componentColumn("processing"),
      componentColumn("bond"),
      componentColumn("issuance"),
      {
        id: "paidAtBank", band: "official", header: "Issuance paid by client at bank", width: 120,
        title: "The client pays the issuance fee at the bank themselves — it is shown on the quotation but not billed by BCL",
        render: (r) => (
          <label className="flex items-center justify-center gap-2 cursor-pointer">
            <Checkbox checked={r.rates.issuancePaidAtBank} onCheckedChange={(c) => set(r, { issuancePaidAtBank: !!c })} />
            <span className="text-sm text-slate-600">{r.rates.issuancePaidAtBank ? "Yes" : "No"}</span>
          </label>
        ),
      },
      {
        id: "validity", band: "official", header: "Validity", width: 190,
        render: (r) => {
          const unit = VALIDITY_UNITS.find((u) => u.value === r.rates.validity.unit)
          return (
            <div className="flex items-center gap-1.5">
              {unit?.counted && (
                <NumberField value={r.rates.validity.count} onCommit={(count) => set(r, { validity: { ...r.rates.validity, count } })} className="w-14 shrink-0" />
              )}
              <MiniSelect
                value={r.rates.validity.unit}
                options={VALIDITY_UNITS}
                onChange={(u) => set(r, { validity: { unit: u ?? "one_off", count: VALIDITY_UNITS.find((x) => x.value === u)?.counted ? r.rates.validity.count : null } })}
              />
            </div>
          )
        },
      },
      figure("officialTotal", "official", "Total Official", (b) => b.official, { strong: true }),
    )
  }
  if (visible.facilitation !== false) {
    cols.push(componentColumn("facilitation"), componentColumn("discount"), figure("facilitationNet", "facilitation", "After Discount", (b) => b.facilitationNet, { strong: true }))
  }
  if (visible.extra !== false) {
    cols.push(...IMMIGRATION_COMPONENTS.filter((c) => c.group === "extra").map((c) => componentColumn(c.key)), figure("extrasTotal", "extra", "Total Extra", (b) => b.extras, { strong: true }))
  }
  if (visible.help !== false) {
    cols.push(...IMMIGRATION_COMPONENTS.filter((c) => c.group === "help").map((c) => componentColumn(c.key)), figure("helpTotal", "help", "Total Help", (b) => b.help, { strong: true }))
  }
  if (visible.totals !== false) {
    cols.push(
      figure("total", "totals", "Official + Extra + Help", (b) => b.total, { title: "Without round-up" }),
      figure("bank", "totals", "Paid at Bank", (b) => b.paidAtBank, { negative: true, title: "Issuance fee the client pays at the bank" }),
      figure("payable", "totals", "Payable", (b) => b.payable),
      figure("rounded", "totals", `Final (round-up ${fmtKes(ctx.settings.round_to)})`, (b) => b.rounded, { strong: true }),
    )
  }
  if (visible.payment !== false) {
    cols.push({
      id: "payment", band: "payment", header: "Deposit / Instalments", width: 250,
      title: "e.g. G Class: 100,000 deposit; PR: 150,000 + 200,000",
      render: (r) => {
        const p = r.rates.payment
        const setPayment = (patch: Partial<ImmigrationRates["payment"]>) => set(r, { payment: { ...p, ...patch } })
        return (
          <div className="space-y-1.5">
            <MiniSelect value={p.mode} options={PAYMENT_MODES} onChange={(m) => setPayment({ mode: m ?? "all_advance", installments: m === "installments" ? (p.installments.length ? p.installments : [0]) : [] })} />
            {p.mode === "installments" && (
              <div className="flex items-center gap-1">
                {[0, 1].map((i) => (
                  <NumberField
                    key={i}
                    value={p.installments[i] ?? null}
                    placeholder={i === 0 ? "Deposit" : "Balance"}
                    title={i === 0 ? "Deposit" : "Second instalment (leave blank for the balance on completion)"}
                    onCommit={(v) => {
                      const next = [...p.installments]
                      next[i] = v ?? 0
                      setPayment({ installments: i === 1 && v == null ? next.slice(0, 1) : next })
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      },
    })
  }
  return cols
}

export const immigrationSticky = () => stickyColumns<ImmigrationRow>(false)

// ── job (other departments) ──────────────────────────────────────────────────

export function jobColumns(ctx: ColumnContext<JobRates>, visible: Record<string, boolean>) {
  const set = (r: JobRow, patch: Partial<JobRates>) => ctx.onChange(r.level.key, { ...r.rates, ...patch })
  const figure = (id: string, band: string, header: string, value: (b: JobBreakdown) => number, opts: { strong?: boolean; decimals?: boolean; title?: string } = {}): GridColumn<JobRow> => ({
    id, band, header, title: opts.title, width: 125, computed: true,
    render: (r) => {
      const v = value(r.breakdown)
      return <Figure value={v === 0 ? "—" : fmtKes(v, opts.decimals)} strong={opts.strong} tone={v === 0 ? "muted" : undefined} />
    },
  })

  const cols: GridColumn<JobRow>[] = [
    { id: "status", band: "status", header: "Effective", width: 190, render: (r) => <StatusCell row={r} ctx={ctx} /> },
    { ...presetColumn<JobRates>(), render: (r) => <PresetPicker options={JOB_PRESET_OPTIONS} onPick={(id) => ctx.onPreset(r.level.key, id)} /> },
  ]

  if (visible.job !== false) {
    cols.push(
      {
        id: "applicable", band: "job", header: "Applicable", width: 100, title: "Applicable 1 Tick — untick if BCL doesn't offer this job",
        render: (r) => (
          <div className="flex justify-center">
            <Checkbox checked={r.rates.applicable} onCheckedChange={(c) => set(r, { applicable: !!c })} />
          </div>
        ),
      },
      {
        id: "basis", band: "job", header: "Exact / Estimated", width: 170,
        render: (r) => (
          <div className="space-y-1">
            <MiniSelect value={r.rates.basis} options={PRICE_BASES} onChange={(basis) => set(r, { basis })} />
            {r.rates.basis === "estimated" && <TextField value={r.rates.estimateNote} onCommit={(estimateNote) => set(r, { estimateNote })} placeholder="e.g. 15-120 k" className="text-sm h-8" />}
          </div>
        ),
      },
      { id: "frequency", band: "job", header: "Frequency", width: 140, render: (r) => <MiniSelect value={r.rates.frequency} options={FREQUENCIES} onChange={(frequency) => set(r, { frequency })} /> },
      { id: "requirement", band: "job", header: "Must / Optional", width: 130, render: (r) => <MiniSelect value={r.rates.requirement} options={REQUIREMENTS} onChange={(requirement) => set(r, { requirement })} /> },
      { id: "qty", band: "job", header: "Default Qty", title: "No of items (people etc.) — the starting quantity on a quotation", width: 95, render: (r) => <NumberField value={r.rates.defaultQty} onCommit={(v) => set(r, { defaultQty: v && v > 0 ? v : 1 })} /> },
      { id: "note", band: "job", header: "Note", title: "Internal note about this job level", width: 220, render: (r) => <TextField value={r.rates.note} onCommit={(note) => set(r, { note })} placeholder="Internal note…" /> },
    )
  }
  if (visible.capture !== false) {
    cols.push(
      { id: "detailsPrompt", band: "capture", header: "Specific Names", title: "What to capture when quoting, e.g. \"Company Name ?\"", width: 200, render: (r) => <TextField value={r.rates.detailsPrompt} onCommit={(detailsPrompt) => set(r, { detailsPrompt })} placeholder="e.g. Company Name ?" /> },
      { id: "datePrompt", band: "capture", header: "Specific Registered Date", title: "A date to capture when quoting, e.g. \"VAT Reg Date\"", width: 170, render: (r) => <TextField value={r.rates.datePrompt} onCommit={(datePrompt) => set(r, { datePrompt })} placeholder="e.g. VAT Reg Date" /> },
    )
  }
  if (visible.plain !== false) {
    cols.push(
      {
        id: "official", band: "plain", header: "Official Fee", width: 190,
        render: (r) => <ComponentCell value={r.rates.officialFee} onChange={(officialFee) => set(r, { officialFee })} withCurrency usdRate={ctx.settings.usd_rate} />,
      },
      { id: "consultancy", band: "plain", header: "Consultancy Net", width: 140, render: (r) => <NumberField value={r.rates.consultancyFee} onCommit={(consultancyFee) => set(r, { consultancyFee })} /> },
      figure("total", "plain", "Official + Consultancy", (b) => b.total),
      figure("rounded", "plain", `Round-up (${fmtKes(ctx.settings.round_to)})`, (b) => b.rounded, { strong: true }),
    )
  }
  if (visible.etims !== false) {
    const pct = (n: number) => `${Math.round(n * 1000) / 10}%`
    cols.push(
      figure("gross", "etims", "Consultancy (Net Invoice)", (b) => b.etimsGross, { decimals: true, title: `Consultancy ÷ (1 − ${pct(ctx.settings.corp_tax_rate)} corporation tax)` }),
      figure("vat", "etims", `VAT ${pct(ctx.settings.vat_rate)}`, (b) => b.etimsVat, { decimals: true }),
      figure("invoice", "etims", "Gross Invoice", (b) => b.etimsInvoice, { decimals: true }),
      figure("etimsTotal", "etims", "Official + Gross", (b) => b.etimsTotal, { decimals: true, strong: true }),
      figure("corpTax", "etims", `Corp. Tax ${pct(ctx.settings.corp_tax_rate)}`, (b) => b.corpTax, { decimals: true }),
      figure("net", "etims", "Net Income", (b) => b.net, { decimals: true }),
    )
  }
  if (visible.workflow !== false) {
    cols.push(
      { id: "whatsapp", band: "workflow", header: "WhatsApp Text", width: 240, render: (r) => <TextField multiline value={r.rates.whatsappText} onCommit={(whatsappText) => set(r, { whatsappText })} /> },
      { id: "stages", band: "workflow", header: "Stages", width: 200, render: (r) => <TextField multiline value={r.rates.stages} onCommit={(stages) => set(r, { stages })} /> },
      { id: "checklist", band: "workflow", header: "Check-list", width: 220, render: (r) => <TextField multiline value={r.rates.checklist} onCommit={(checklist) => set(r, { checklist })} /> },
    )
  }
  return cols
}

export const jobSticky = () => stickyColumns<JobRow>(true)
