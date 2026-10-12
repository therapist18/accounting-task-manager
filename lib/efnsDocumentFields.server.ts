// Fills a filed EFNS document's KYC fields straight from the document — no AI.
//
// The document type's fields (acc_portal_kyc.fields) decide what gets filled. EFNS PDFs are printed
// portal pages laid out as "Label: value" rows (notifications: "Applicant Name:", "File R:", "Date
// Generated:"; receipts: "Received from:", "Invoice Number", "Receipt Number"…), so each field takes
// the value of the label that matches its name. Fields the PDF has no label for fall back to what the
// EFNS automation already stored on the item row (applicant, dependant, file number, message, fee…).
// Anything still unmatched is left empty for the operator — or "Re-extract with AI" in the preview.
//
// The result is keyed by field name, the same shape StageUploadDialog's extraction saves into
// acc_portal_directors_documents.extracted_details, so the task-stage preview shows it as-is.

import "server-only"
import type { ItemKind } from "@/lib/immigrationNotifications"

export interface KycField {
  id?: string
  name?: string | null
  type?: string | null
  isArray?: boolean
}

export interface EfnsFieldFill {
  /** Field name → value, for the fields that were filled. */
  values: Record<string, string>
  /** Where each filled value came from. */
  sources: Record<string, "pdf" | "efns">
  /** Field names nothing matched. */
  missing: string[]
  /** Every label/value pair read off the PDF (kept for the audit trail and later re-fills). */
  pdfLabels: Record<string, string>
}

/** Lower-case alphanumerics only: "File R:" → "filer", "file_number" → "filenumber". */
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

const clean = (v: unknown) => {
  const s = String(v ?? "")
    .replace(/^\s*:\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
  return s === "-" ? "" : s
}

/**
 * Field names whose PDF label is worded differently (all normalized). A field first tries its own
 * name as the label, then these, in order.
 */
const FIELD_LABEL_ALIASES: Record<string, string[]> = {
  filer: ["filenumber", "filer", "fileno"],
  filenumber: ["filer", "fileno"],
  rnumber: ["filer", "filenumber"],
  permitclass: ["applicationtype", "permittype"],
  permittype: ["applicationtype"],
  nameoforganization: ["company", "companyname", "organization", "organisation", "employer", "nameoforganisation"],
  companyname: ["company", "nameoforganization", "organization", "employer"],
  dateandtimegenerated: ["dategenerated"],
  dategenerated: ["dateandtimegenerated"],
  dateandtime: ["date", "dategenerated", "invoicedate"],
  date: ["dategenerated", "invoicedate"],
  ecitizenconveniencefee: ["ecitizenfee"],
  ecitizenfee: ["ecitizenconveniencefee"],
  creditaccount: ["credit"],
  invoicenumber: ["invoiceno"],
  invoiceno: ["invoicenumber"],
  invoicedate: ["date"],
  amount: ["total", "amountpaid"],
  paymentstatus: ["status"],
  receivedfrom: ["invoicedto"],
}

/**
 * The PDF's text as lines, each a list of the text runs on it left to right. pdfjs gives positioned
 * runs; a printed table row's label and value are separate runs on the same baseline.
 */
async function pdfLines(pdf: Uint8Array): Promise<string[][]> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const doc = await pdfjs.getDocument({ data: pdf, useSystemFonts: true, isEvalSupported: false }).promise
  const out: string[][] = []
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const rows = new Map<number, Array<{ x: number; s: string }>>()
      for (const item of content.items as any[]) {
        if (!item?.str?.trim()) continue
        const y = Math.round(item.transform[5])
        const row = rows.get(y) || []
        row.push({ x: item.transform[4], s: item.str.trim() })
        rows.set(y, row)
      }
      for (const [, row] of [...rows].sort((a, b) => b[0] - a[0])) {
        out.push(row.sort((a, b) => a.x - b.x).map((r) => r.s))
      }
    }
  } finally {
    await doc.destroy().catch(() => {})
  }
  return out
}

/** "Label: value" pairs from the PDF, keyed by normalized label (first occurrence wins). */
export async function readPdfLabels(pdf: Uint8Array): Promise<Record<string, string>> {
  const lines = await pdfLines(pdf)
  const labels: Record<string, string> = {}
  const put = (label: string, value: string) => {
    const key = norm(label)
    const v = clean(value)
    if (key && key.length <= 40 && !(key in labels)) labels[key] = v
  }
  // Unmarked two-column rows ("Total" | "KES 5000", "PAYMENT STATUS" | "Not Paid") are weaker than
  // "Label:" rows, so they only fill labels nothing else claimed.
  const weak: Array<[string, string]> = []
  for (let i = 0; i < lines.length; i++) {
    const runs = lines[i]
    if (runs.length >= 2) {
      // "Applicant Name:" | "PATEL …"   or   "Fee Type" | ": Processing Fee"
      const [label, ...rest] = runs
      if (/:\s*$/.test(label) || /^\s*:/.test(rest[0] || "")) put(label.replace(/:\s*$/, ""), rest.join(" "))
      else if (runs.length === 2 && !/\d/.test(label)) weak.push([label, rest[0]])
      continue
    }
    // Title lines on receipts: "Department of Immigration services", "Payment Acknowledgement".
    if (i < 4 && runs.length === 1 && !/:/.test(runs[0])) {
      if (/^department of\b/i.test(runs[0])) put("department", runs[0])
      else if (/acknowledg|receipt/i.test(runs[0])) put("receipt type", runs[0])
    }
    const text = runs[0] || ""
    const inline = text.match(/^([A-Za-z][A-Za-z0-9 .\/()&'-]{1,40}?)\s*:\s*(.+)$/)
    if (inline && !/^https?$/i.test(inline[1])) {
      // "CREDIT: Revenue/ Immigration/ Fee"
      put(inline[1], inline[2])
    } else if (/:\s*$/.test(text) && i + 1 < lines.length && lines[i + 1].length === 1 && !/:/.test(lines[i + 1][0])) {
      // "Applicant Name:" on its own line, value on the next (invoices)
      put(text.replace(/:\s*$/, ""), lines[i + 1][0])
    }
  }
  for (const [label, value] of weak) put(label, value)
  return labels
}

/** What the EFNS automation stored on the item, keyed by normalized field name. */
function itemRowValues(kind: ItemKind, row: any): Record<string, string> {
  const v: Record<string, string> = {}
  const set = (keys: string[], value: unknown) => {
    const s = clean(value)
    if (s) for (const k of keys) if (!(k in v)) v[k] = s
  }
  set(["filer", "filenumber", "rnumber", "fileno"], row.file_number)
  set(["dependantname", "dependentname"], row.printable_dependant)
  set(["nameoforganization", "companyname", "company", "organization", "employer"], row.printable_company)
  set(["status"], row.status)
  if (kind === "notification") {
    set(["applicantname", "applicant"], row.printable_applicant || row.name)
    set(["applicationtype", "permitclass", "permittype"], row.case_type || row.permit_type)
    set(["message", "notificationmessage", "notification"], row.message)
  } else {
    set(["applicantname", "applicant"], row.printable_applicant || row.applicant_name)
    set(["applicationtype"], row.application_name)
    set(["applicationcategory", "category"], row.application_category)
    set(["feetype"], row.fee_type)
    set(["paymentstatus", "invoicestatus"], row.invoice_status)
    set(["amount"], row.payment_amount ?? row.amount)
    set(["billreferencenumber", "billreference"], row.bill_reference_number)
  }
  return v
}

/**
 * "2026-10-09 16:35:34" → "09/10/2026" (the format manual extraction saves dates in), keeping the
 * time — "09/10/2026 16:35:34" — when the field is a date-and-time one.
 */
const toDisplayDate = (value: string, withTime: boolean) => {
  const m = value.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}:\d{2}(?::\d{2})?))?/)
  if (!m) return value
  const date = `${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[1]}`
  return withTime && m[4] ? `${date} ${m[4]}` : date
}

/** The currency on an amount like "KES 10000". */
const currencyOf = (amount: string | undefined) => amount?.match(/^([A-Z]{3})\b/)?.[1] || ""

/**
 * Fills `fields` (the document type's acc_portal_kyc.fields) from the PDF's labels, then the item row.
 * Unnamed fields and array fields are skipped. Never throws on an unreadable PDF — it just falls back
 * to the row.
 */
export async function fillEfnsDocumentFields(
  fields: KycField[] | null | undefined,
  pdf: Uint8Array | null,
  kind: ItemKind,
  itemRow: any,
): Promise<EfnsFieldFill> {
  let pdfLabels: Record<string, string> = {}
  if (pdf) {
    try {
      pdfLabels = await readPdfLabels(pdf)
    } catch (e) {
      console.warn("[efns-fields] could not read PDF text:", (e as Error)?.message)
    }
  }
  const rowValues = itemRowValues(kind, itemRow)

  const values: Record<string, string> = {}
  const sources: Record<string, "pdf" | "efns"> = {}
  const missing: string[] = []

  for (const field of fields || []) {
    const name = String(field?.name ?? "").trim()
    if (!name || field?.type === "array" || field?.isArray) continue
    const key = norm(name)
    const candidates = [key, ...(FIELD_LABEL_ALIASES[key] || [])]

    let value = ""
    let source: "pdf" | "efns" = "pdf"
    for (const c of candidates) {
      if (pdfLabels[c]) {
        value = pdfLabels[c]
        break
      }
    }
    if (!value && /currency$/.test(key)) {
      // "Currency" / "eCitizen Fee Currency": the code printed on the matching amount.
      value = key === "currency" ? currencyOf(pdfLabels.amount || pdfLabels.total) : currencyOf(pdfLabels[key.replace(/currency$/, "")] || pdfLabels.ecitizenconveniencefee)
    }
    if (!value) {
      for (const c of candidates) {
        if (rowValues[c]) {
          value = rowValues[c]
          source = "efns"
          break
        }
      }
    }
    if (!value) {
      missing.push(name)
      continue
    }
    values[name] = field?.type === "date" ? toDisplayDate(value, /time/.test(key)) : value
    sources[name] = source
  }

  return { values, sources, missing, pdfLabels }
}
