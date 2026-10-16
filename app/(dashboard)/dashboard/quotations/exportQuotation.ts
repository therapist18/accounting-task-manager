"use client"

import * as ExcelJS from "exceljs"
import { saveAs } from "file-saver"
import { formatDateToDMY } from "@/lib/dateUtils"
import { IMMIGRATION_COMPONENTS, normalizeImmigrationRates } from "../departments/rates/rate-card/catalog"
import type { ImmigrationRates } from "../departments/rates/rate-card/types"
import { STATUSES, PAYMENT_STATUS_LABELS, priceItem, type Quotation } from "./data"

const MONEY = "#,##0.00"
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF376BAE" } }

async function download(wb: ExcelJS.Workbook, name: string) {
  const buffer = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name)
}

/** One quotation as a client-ready sheet: header, priced lines, totals. */
export async function exportQuotation(q: Quotation) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(q.quote_number)
  const mode = q.etims_mode ?? (q.with_etims ? "with" : "without")
  const showPlain = mode !== "with"
  const showEtims = mode !== "without"

  // Columns: #, Service, Details, Qty, [plain cols], [etims cols], Total
  const extraCols = (showPlain ? 2 : 0) + (showEtims ? 3 : 0)
  ws.columns = [{ width: 5 }, { width: 52 }, { width: 30 }, { width: 8 },
    ...Array(extraCols).fill({ width: 16 }), { width: 16 }]

  ws.addRow(["", q.status === "proposal" ? "PROPOSAL" : "QUOTATION"]).font = { bold: true, size: 16 }
  ws.addRow(["", `Number: ${q.quote_number}`])
  if (q.revision_number > 0) ws.addRow(["", `Revision: ${q.revision_number}`])
  ws.addRow(["", `Client: ${q.client_name}`])
  ws.addRow(["", `Date: ${formatDateToDMY(q.quote_date)}${q.valid_until ? `   ·   Valid until: ${formatDateToDMY(q.valid_until)}` : ""}`])
  ws.addRow(["", `Status: ${STATUSES.find((s) => s.value === q.status)?.label ?? q.status}   ·   Pricing: ${mode === "both" ? "Without & With eTIMS" : mode === "with" ? "With eTIMS" : "Without eTIMS"}`])
  ws.addRow([])

  const headerCols = ["#", "Service", "Details", "Qty",
    ...(showPlain ? ["Official (KES)", "BCL Fees (KES)"] : []),
    ...(showEtims ? ["eTIMS Official", "eTIMS BCL (net)", "VAT (KES)"] : []),
    "Total (KES)"]
  const header = ws.addRow(headerCols)
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.fill = HEADER_FILL

  q.items.forEach((it, i) => {
    const pPlain = priceItem(it, q.settings, false)
    const pEtims = priceItem(it, q.settings, true)
    let service = it.job_path
    if (it.card_type === "immigration") {
      const r = normalizeImmigrationRates(it.rates as ImmigrationRates)
      const extras = IMMIGRATION_COMPONENTS.filter((c) => (c.group === "extra" || c.group === "help") && r.components[c.key]?.on).map((c) => c.label)
      if (extras.length) service += `\nIncludes: ${extras.join(", ")}`
    }
    const row = ws.addRow([
      i + 1, service,
      [it.details, it.detail_date ? formatDateToDMY(it.detail_date) : ""].filter(Boolean).join(" · "),
      it.quantity,
      ...(showPlain ? [pPlain.official, pPlain.consultancy] : []),
      ...(showEtims ? [pEtims.official, pEtims.consultancy, pEtims.vat] : []),
      (showEtims ? pEtims : pPlain).total,
    ])
    row.alignment = { wrapText: true, vertical: "top" }
    if (pPlain.paidAtBank > 0) {
      ws.addRow(["", "   Issuance fee paid by the client directly at the bank", "", "", pPlain.paidAtBank]).font = { italic: true, color: { argb: "FF64748B" } }
    }
  })

  ws.addRow([])
  const money = (label: string, value: number, bold = false) => {
    const row = ws.addRow(["", "", "", "", ...Array(extraCols - 1).fill(""), label, value])
    row.font = { bold }
  }
  money("Official fees", q.totals.official)
  money("BCL fees", q.totals.consultancy)
  if (showEtims) money("VAT", q.totals.vat)
  money("Total payable", q.totals.total, true)
  if (q.totals.paid_at_bank > 0) money("Paid at bank by client", q.totals.paid_at_bank)

  // Payments summary
  if (q.payments?.length) {
    ws.addRow([])
    ws.addRow(["", "Payments"]).font = { bold: true }
    for (const p of q.payments) {
      ws.addRow(["", `${formatDateToDMY(p.payment_date)} — KES ${p.amount.toLocaleString("en-KE")}${p.proof_type ? ` (${p.proof_type})` : ""}${p.proof_note ? ` — ${p.proof_note}` : ""}`])
    }
    money("Total paid", q.payments.reduce((s, p) => s + p.amount, 0))
  }

  ws.eachRow((row) => row.eachCell((cell) => { if (typeof cell.value === "number" && Number(cell.col) > 4) cell.numFmt = MONEY }))
  if (q.notes) {
    ws.addRow([])
    ws.addRow(["", "Notes"]).font = { bold: true }
    ws.addRow(["", q.notes]).alignment = { wrapText: true }
  }
  await download(wb, `${q.quote_number} - ${q.client_name}.xlsx`)
}

/** The list as shown (current filters). */
export async function exportQuotationList(list: Quotation[]) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Quotations")
  const header = ws.addRow(["Quote #", "Date", "Client", "Client Type", "Services", "Official", "BCL Fees", "VAT", "Total", "eTIMS Mode", "Status", "Payment Status", "Revision", "Valid Until", "By"])
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.fill = HEADER_FILL
  for (const q of list) {
    ws.addRow([
      q.quote_number, formatDateToDMY(q.quote_date), q.client_name, q.client_type,
      q.items.map((i) => i.job_path).join("\n"),
      q.totals.official, q.totals.consultancy, q.totals.vat, q.totals.total,
      q.etims_mode ?? (q.with_etims ? "with" : "without"),
      STATUSES.find((s) => s.value === q.status)?.label ?? q.status,
      PAYMENT_STATUS_LABELS[q.payment_status ?? "unpaid"],
      q.revision_number > 0 ? `Rev. ${q.revision_number}` : "—",
      q.valid_until ? formatDateToDMY(q.valid_until) : "",
      q.updated_by_name || q.created_by_name || "",
    ]).alignment = { wrapText: true, vertical: "top" }
  }
  ws.columns.forEach((c, i) => { c.width = [14, 12, 32, 12, 50, 14, 14, 12, 14, 12, 12, 12, 10, 12, 18][i] })
  ws.views = [{ state: "frozen", ySplit: 1 }]
  await download(wb, `Quotations ${new Date().toISOString().slice(0, 10)}.xlsx`)
}
