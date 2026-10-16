// Shapes of the rate-card data stored in tm_rate_cards.rates / tm_rate_settings.settings
// (see supabase/migrations/20261019000000_rate_cards_and_quotations.sql).

export type Currency = "KES" | "USD"
export type CardType = "immigration" | "job"

/** One priced component with its applicability tick: `on: false` is the sheet's "N/A". */
export interface RateComponent {
  on: boolean
  amount: number | null
  currency?: Currency
}

export type ValidityUnit = "one_off" | "days" | "months" | "years" | "permanent" | "lifetime"

export interface Validity {
  count: number | null
  unit: ValidityUnit
}

export type PaymentMode = "all_advance" | "advance_no_deposit" | "installments"

export interface PaymentTerms {
  mode: PaymentMode
  /** For "installments": the amount due at each step (first = deposit). */
  installments: number[]
}

/** "Imm Rates" sheet, transposed: each of the sheet's charge rows is a column here. */
export interface ImmigrationRates {
  /** O-1, O-2, O-3, facilitation, discount, E-1…E-9, H-1…H-4 — keyed by IMMIGRATION_COMPONENTS[].key */
  components: Record<string, RateComponent>
  /** The client pays the issuance fee straight to the bank, so it is shown but not billed by us. */
  issuancePaidAtBank: boolean
  validity: Validity
  payment: PaymentTerms
  note?: string
}

export type PriceBasis = "fixed" | "exact" | "estimated"
export type Frequency = "one_off" | "monthly" | "quarterly" | "yearly" | "case_based"
export type Requirement = "must" | "optional"

/** "Acc Rates" sheet: one row per job offered. */
export interface JobRates {
  /** "Applicable 1 Tick" — whether this job is offered at all. */
  applicable: boolean
  basis: PriceBasis | null
  /** Free text for estimated prices, e.g. "15-120 k". */
  estimateNote: string
  frequency: Frequency | null
  requirement: Requirement | null
  officialFee: RateComponent
  consultancyFee: number | null
  /** "No of Items (People etc)" — the default quantity on a quotation. */
  defaultQty: number
  /** "Specific Names" — what has to be captured on the quotation (e.g. "Company Name ?"). */
  detailsPrompt: string
  /** "Specific Registered Date" — the date to capture, if any (e.g. "VAT Reg Date"). */
  datePrompt: string
  whatsappText: string
  stages: string
  checklist: string
  note?: string
}

export type RatesPayload = ImmigrationRates | JobRates

export interface RateSettings {
  usd_rate: number
  vat_rate: number
  corp_tax_rate: number
  round_to: number
}

export interface RateSettingsRow {
  id: number
  effective_from: string
  settings: RateSettings
  note: string | null
  created_by_name: string | null
  created_at: string
}

export interface RateCardRow<R extends RatesPayload = RatesPayload> {
  id: number
  job_key: string
  department_id: number
  subdepartment_id: number | null
  class_id: string | null
  subclass_id: string | null
  job_path: string
  card_type: CardType
  effective_from: string
  rates: R
  note: string | null
  created_by_name: string | null
  created_at: string
  updated_by_name: string | null
  updated_at: string
}

/** A priceable leaf of the department tree (subdepartment, class or subclass). */
export interface JobLevel {
  key: string
  departmentId: number
  departmentName: string
  subdepartmentId: number
  subdepartmentName: string
  classId: string | null
  className: string | null
  subclassId: string | null
  subclassName: string | null
  /** "KEP → Class G", without the department. */
  path: string
  order: number
}

export interface ImmigrationPreset {
  id: string
  label: string
  components: Record<string, RateComponent & { optional?: boolean }>
  issuancePaidAtBank: boolean
  gratis: boolean
  validity: Validity
  payment: PaymentTerms
  sheetTotal: number | null
  note: string
}

export interface JobPreset {
  id: string
  department: string
  category: string
  job: string
  basis: PriceBasis | null
  estimateNote: string
  frequency: Frequency | null
  requirement: Requirement | null
  detailsPrompt: string
  officialFee: number | null
  officialNote: string
  consultancyFee: number | null
}
