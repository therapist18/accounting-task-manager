import type {
  CardType, Frequency, ImmigrationRates, JobRates, PaymentMode, PriceBasis, RateSettings, Requirement, ValidityUnit,
} from "./types"

/** Department 1 uses the immigration rate card; every other department uses the job rate card. */
export const IMMIGRATION_DEPARTMENT_ID = 1

export const cardTypeForDepartment = (departmentId: number | string): CardType =>
  Number(departmentId) === IMMIGRATION_DEPARTMENT_ID ? "immigration" : "job"

export const DEFAULT_SETTINGS: RateSettings = { usd_rate: 135, vat_rate: 0.16, corp_tax_rate: 0.3, round_to: 1000 }

export type ComponentGroup = "official" | "facilitation" | "extra" | "help"

export interface ComponentDef {
  key: string
  /** Code used on the sheet (O-1, E-3, H-2…). */
  code: string
  label: string
  short: string
  group: ComponentGroup
  /** May be priced in USD and converted at the bank rate. */
  currency?: boolean
  /** Amount filled in when the tick is first switched on. */
  defaultAmount?: number
  /** Where the sheet says it applies ("Job" / "Class" columns) — shown as a hint. */
  appliesTo?: string
  /** Subtracted rather than added. */
  negative?: boolean
}

// The "Imm Rates" sheet's charge rows (its second column), in sheet order. Each becomes a column of
// the immigration rate table with its own applicability tick.
export const IMMIGRATION_COMPONENTS: ComponentDef[] = [
  { key: "processing", code: "O-1", label: "Processing / Application Fee", short: "Processing", group: "official", currency: true },
  { key: "bond", code: "O-2", label: "Issuance Bond Fee (3 Years)", short: "Bond (3 yrs)", group: "official", defaultAmount: 5000 },
  { key: "issuance", code: "O-3", label: "Issuance Fee", short: "Issuance", group: "official", currency: true },
  { key: "facilitation", code: "F-1", label: "Facilitation Before Discount", short: "Facilitation", group: "facilitation" },
  { key: "discount", code: "F-2", label: "Discount Given", short: "Discount", group: "facilitation", negative: true },
  { key: "e1", code: "E-1", label: "KRA - TCC - Company", short: "TCC Company", group: "extra", defaultAmount: 10000, appliesTo: "KEP · Class D + G" },
  { key: "e2", code: "E-2", label: "KRA - TCC - Personal", short: "TCC Personal", group: "extra", defaultAmount: 10000, appliesTo: "KEP · Class D + G" },
  { key: "e3", code: "E-3", label: "Rejection - Permit", short: "Rejection", group: "extra", defaultAmount: 600000, appliesTo: "KEP · Class D + G" },
  { key: "e4", code: "E-4", label: "Nationality", short: "Nationality", group: "extra", defaultAmount: 25000, appliesTo: "KEP + PR · Class D + G + PR (25,000 KEP + 100,000 PR)" },
  { key: "e5", code: "E-5", label: "Under-Age (Below 23)", short: "Under-Age", group: "extra", defaultAmount: 20000, appliesTo: "KEP · Class D" },
  { key: "e6", code: "E-6", label: "Degree - Issue", short: "Degree", group: "extra", defaultAmount: 10000, appliesTo: "KEP · Class D (5,000 KSP + 10,000 KEP)" },
  { key: "e7", code: "E-7", label: "Balance Sheet", short: "Balance Sheet", group: "extra", defaultAmount: 10000, appliesTo: "KEP · Class G" },
  { key: "e8", code: "E-8", label: "CR 12 - No Name in CR 12", short: "CR12", group: "extra", defaultAmount: 25000, appliesTo: "KEP · Class G" },
  { key: "e9", code: "E-9", label: "Over-Age (Above 21 but below 27 Years)", short: "Over-Age", group: "extra", defaultAmount: 50000, appliesTo: "PR + Citizenship" },
  { key: "h1", code: "H-1", label: "Passport Endorsement", short: "Endorsement", group: "help", defaultAmount: 2000 },
  { key: "h2", code: "H-2", label: "Alien - Biometrics Help (avoid queue & time wastage)", short: "Alien Biometrics", group: "help", defaultAmount: 2000 },
  { key: "h3", code: "H-3", label: "Alien - Fast Track within 3/4 Weeks (otherwise 8 weeks or more)", short: "Alien Fast-Track", group: "help", defaultAmount: 15000 },
  { key: "h4", code: "H-4", label: "Transport - back and forth between Nyayo & Office", short: "Transport", group: "help", defaultAmount: 1000 },
]

export const COMPONENT_BY_KEY = Object.fromEntries(IMMIGRATION_COMPONENTS.map((c) => [c.key, c]))

export const GROUP_LABEL: Record<ComponentGroup, string> = {
  official: "Official (Government)",
  facilitation: "Facilitation (BCL)",
  extra: "Extra Charges",
  help: "Help",
}

export const VALIDITY_UNITS: { value: ValidityUnit; label: string; counted: boolean }[] = [
  { value: "one_off", label: "One-off", counted: false },
  { value: "days", label: "Days", counted: true },
  { value: "months", label: "Months", counted: true },
  { value: "years", label: "Years", counted: true },
  { value: "permanent", label: "Permanent", counted: false },
  { value: "lifetime", label: "Life-Time", counted: false },
]

export const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "all_advance", label: "All in advance" },
  { value: "advance_no_deposit", label: "Advance, no deposit" },
  { value: "installments", label: "Deposit + balance" },
]

export const PRICE_BASES: { value: PriceBasis; label: string }[] = [
  { value: "fixed", label: "Fixed" },
  { value: "exact", label: "Exact" },
  { value: "estimated", label: "Estimated" },
]

export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "one_off", label: "One-Off" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "case_based", label: "Case Based" },
]

export const REQUIREMENTS: { value: Requirement; label: string }[] = [
  { value: "must", label: "Must" },
  { value: "optional", label: "Optional" },
]

export const labelOf = <V extends string>(list: { value: V; label: string }[], value: V | null | undefined) =>
  list.find((o) => o.value === value)?.label ?? ""

export function emptyImmigrationRates(): ImmigrationRates {
  const components: ImmigrationRates["components"] = {}
  for (const c of IMMIGRATION_COMPONENTS) {
    components[c.key] = { on: false, amount: null, ...(c.currency ? { currency: "KES" as const } : {}) }
  }
  components.facilitation.on = true
  return { components, issuancePaidAtBank: false, validity: { count: null, unit: "one_off" }, payment: { mode: "all_advance", installments: [] }, note: "" }
}

export function emptyJobRates(): JobRates {
  return {
    applicable: true,
    basis: "fixed",
    estimateNote: "",
    frequency: "one_off",
    requirement: null,
    officialFee: { on: true, amount: 0, currency: "KES" },
    consultancyFee: null,
    defaultQty: 1,
    detailsPrompt: "",
    datePrompt: "",
    whatsappText: "",
    stages: "",
    checklist: "",
    note: "",
  }
}

/** Fill in anything a stored row is missing (older rows, newly added components). */
export function normalizeImmigrationRates(raw: Partial<ImmigrationRates> | null | undefined): ImmigrationRates {
  const base = emptyImmigrationRates()
  if (!raw) return base
  const components = { ...base.components }
  for (const [key, value] of Object.entries(raw.components || {})) {
    components[key] = { ...components[key], ...value }
  }
  return {
    ...base,
    ...raw,
    components,
    validity: { ...base.validity, ...(raw.validity || {}) },
    payment: { ...base.payment, ...(raw.payment || {}), installments: [...(raw.payment?.installments || [])] },
  }
}

export function normalizeJobRates(raw: Partial<JobRates> | null | undefined): JobRates {
  const base = emptyJobRates()
  if (!raw) return base
  return { ...base, ...raw, officialFee: { ...base.officialFee, ...(raw.officialFee || {}) } }
}
