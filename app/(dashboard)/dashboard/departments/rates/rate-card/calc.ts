import { IMMIGRATION_COMPONENTS } from "./catalog"
import type { ImmigrationRates, JobRates, RateComponent, RateSettings } from "./types"

// The sheets' formulas, in one place so the rate tables and quotations always agree.

export const roundUp = (value: number, step: number) => (step > 0 ? Math.ceil(value / step) * step : value)

/** A component's value in KES (USD converted at the bank rate); 0 when it doesn't apply. */
export function componentKes(c: RateComponent | undefined, settings: RateSettings): number {
  if (!c || !c.on || c.amount == null || !Number.isFinite(Number(c.amount))) return 0
  return Number(c.amount) * (c.currency === "USD" ? settings.usd_rate : 1)
}

export interface ImmigrationBreakdown {
  official: number
  facilitation: number
  discount: number
  facilitationNet: number
  extras: number
  help: number
  /** Official + facilitation after discount + extras + help ("Without Round-up"). */
  total: number
  /** Issuance fee the client pays at the bank themselves. */
  paidAtBank: number
  /** What BCL bills: total less paid at bank. */
  payable: number
  /** Payable rounded up ("Round-up Final - Total"). */
  rounded: number
}

export function immigrationBreakdown(r: ImmigrationRates, settings: RateSettings): ImmigrationBreakdown {
  const kes = (key: string) => componentKes(r.components[key], settings)
  let official = 0
  let extras = 0
  let help = 0
  for (const c of IMMIGRATION_COMPONENTS) {
    if (c.group === "official") official += kes(c.key)
    else if (c.group === "extra") extras += kes(c.key)
    else if (c.group === "help") help += kes(c.key)
  }
  const facilitation = kes("facilitation")
  const discount = Math.abs(kes("discount"))
  const facilitationNet = facilitation - discount
  const total = official + facilitationNet + extras + help
  const paidAtBank = r.issuancePaidAtBank ? kes("issuance") : 0
  const payable = total - paidAtBank
  return { official, facilitation, discount, facilitationNet, extras, help, total, paidAtBank, payable, rounded: roundUp(payable, settings.round_to) }
}

export interface JobBreakdown {
  official: number
  consultancy: number
  /** Official + consultancy (no eTIMS invoice). */
  total: number
  rounded: number
  /** With an eTIMS invoice: consultancy grossed up so that, after corporation tax, BCL still nets `consultancy`. */
  etimsGross: number
  etimsVat: number
  etimsInvoice: number
  etimsTotal: number
  corpTax: number
  net: number
}

export function etimsGrossUp(consultancy: number, settings: RateSettings) {
  const gross = settings.corp_tax_rate < 1 ? consultancy / (1 - settings.corp_tax_rate) : consultancy
  const vat = gross * settings.vat_rate
  const corpTax = gross * settings.corp_tax_rate
  return { gross, vat, invoice: gross + vat, corpTax, net: gross - corpTax }
}

export function jobBreakdown(r: JobRates, settings: RateSettings): JobBreakdown {
  const official = componentKes(r.officialFee, settings)
  const consultancy = Number(r.consultancyFee) || 0
  const total = official + consultancy
  const e = etimsGrossUp(consultancy, settings)
  return {
    official, consultancy, total, rounded: roundUp(total, settings.round_to),
    etimsGross: e.gross, etimsVat: e.vat, etimsInvoice: e.invoice, etimsTotal: official + e.invoice, corpTax: e.corpTax, net: e.net,
  }
}

const KES = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 })
const KES2 = new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtKes = (value: number | null | undefined, decimals = false) =>
  value == null || !Number.isFinite(value) ? "—" : (decimals ? KES2 : KES).format(value)
