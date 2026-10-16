"use client"

import * as ExcelJS from "exceljs"
import { saveAs } from "file-saver"
import { formatDateToDMY } from "@/lib/dateUtils"
import { FREQUENCIES, IMMIGRATION_COMPONENTS, PAYMENT_MODES, PRICE_BASES, REQUIREMENTS, VALIDITY_UNITS, labelOf } from "./catalog"
import type { ImmigrationRow, JobRow } from "./columns"
import type { RateComponent, RateSettings } from "./types"

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF376BAE" } }

function finish(ws: ExcelJS.Worksheet, headerRow: number) {
  const row = ws.getRow(headerRow)
  row.font = { bold: true, color: { argb: "FFFFFFFF" } }
  row.fill = HEADER_FILL
  row.alignment = { wrapText: true, vertical: "middle" }
  row.height = 42
  ws.views = [{ state: "frozen", ySplit: headerRow, xSplit: 4 }]
  ws.columns.forEach((c) => { c.width = Math.max(12, Math.min(40, c.width ?? 14)) })
}

const comp = (c: RateComponent | undefined) => (!c || !c.on ? "N/A" : c.amount == null ? "" : c.currency === "USD" ? `USD ${c.amount}` : c.amount)

async function download(wb: ExcelJS.Workbook, name: string) {
  const buffer = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name)
}

export async function exportImmigrationRates(rows: ImmigrationRow[], asOf: string, settings: RateSettings) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Imm Rates")
  ws.addRow([`Immigration rates as of ${formatDateToDMY(asOf)} — ${settings.usd_rate} KES/USD, round up to ${settings.round_to}`]).font = { bold: true, size: 13 }
  ws.addRow([])
  const header = [
    "Sub Department", "Class", "Sub Class", "Effective From",
    ...IMMIGRATION_COMPONENTS.map((c) => `${c.code} ${c.label}`),
    "Issuance Paid at Bank", "Validity", "Total Official", "Facilitation After Discount", "Total Extra", "Total Help",
    "Total (without round-up)", "Less Paid at Bank", "Payable", "Final (rounded)", "Payment Terms", "Note",
  ]
  ws.addRow(header)
  for (const r of rows) {
    const b = r.breakdown
    const v = r.rates.validity
    const unit = VALIDITY_UNITS.find((u) => u.value === v.unit)
    ws.addRow([
      r.level.subdepartmentName, r.level.className ?? "", r.level.subclassName ?? "", r.version ? formatDateToDMY(r.version.effective_from) : "Not priced",
      ...IMMIGRATION_COMPONENTS.map((c) => comp(r.rates.components[c.key])),
      r.rates.issuancePaidAtBank ? "Yes" : "No",
      unit?.counted ? `${v.count ?? ""} ${unit.label}` : unit?.label ?? "",
      b.official, b.facilitationNet, b.extras, b.help, b.total, b.paidAtBank ? -b.paidAtBank : 0, b.payable, b.rounded,
      r.rates.payment.mode === "installments" ? r.rates.payment.installments.join(" + ") : labelOf(PAYMENT_MODES, r.rates.payment.mode),
      r.rates.note ?? "",
    ])
  }
  finish(ws, 3)
  await download(wb, `Immigration Rates ${asOf}.xlsx`)
}

export async function exportJobRates(rows: JobRow[], asOf: string, settings: RateSettings) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Job Rates")
  ws.addRow([`Job rates as of ${formatDateToDMY(asOf)} — VAT ${settings.vat_rate * 100}%, corporation tax ${settings.corp_tax_rate * 100}%`]).font = { bold: true, size: 13 }
  ws.addRow([])
  ws.addRow([
    "Department", "Category", "Job Offered", "Sub Class", "Effective From", "Applicable", "Exact / Estimated", "Frequency", "Must / Optional",
    "Specific Names", "Specific Registered Date", "Official Fee", "Consultancy Net", "Official + Consultancy", "Round-up", "Default Qty",
    "eTIMS: Consultancy (Net Invoice)", "eTIMS: VAT", "eTIMS: Gross Invoice", "eTIMS: Official + Gross", "Corporation Tax", "Net Income",
    "WhatsApp Text", "Stages", "Check-list",
  ])
  for (const r of rows) {
    const b = r.breakdown
    const x = r.rates
    ws.addRow([
      r.level.departmentName, r.level.subdepartmentName, r.level.className ?? "", r.level.subclassName ?? "", r.version ? formatDateToDMY(r.version.effective_from) : "Not priced",
      x.applicable ? "Yes" : "No", [labelOf(PRICE_BASES, x.basis), x.estimateNote].filter(Boolean).join(" "), labelOf(FREQUENCIES, x.frequency), labelOf(REQUIREMENTS, x.requirement),
      x.detailsPrompt, x.datePrompt, comp(x.officialFee), x.consultancyFee ?? "", b.total, b.rounded, x.defaultQty,
      round2(b.etimsGross), round2(b.etimsVat), round2(b.etimsInvoice), round2(b.etimsTotal), round2(b.corpTax), round2(b.net),
      x.whatsappText, x.stages, x.checklist,
    ])
  }
  finish(ws, 3)
  await download(wb, `Job Rates ${asOf}.xlsx`)
}

const round2 = (n: number) => Math.round(n * 100) / 100
