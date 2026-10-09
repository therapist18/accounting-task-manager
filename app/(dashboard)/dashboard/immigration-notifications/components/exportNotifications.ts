import type { ImmigrationItem } from "@/lib/immigrationNotifications"
import { exportRowsToExcel, timestampedFilename, type ExcelColumn } from "../../emails/components/excelExport"

// The rows exactly as filtered and sorted on screen, through the app's shared styled-workbook
// engine so this export reads as one system with the Email Center's exports.

const RED = "FFDC2626"
const GREEN = "FF059669"
const AMBER = "FFD97706"

const STATUS_ARGB: Record<string, string> = {
  APPROVED: GREEN,
  ISSUED: GREEN,
  PAID: GREEN,
  COMPILED: GREEN,
  CANCELLED: RED,
  "NOT PAID": RED,
  "UPLOAD REQUIRED": AMBER,
  REMINDER: AMBER,
}

export async function exportItemsToExcel(rows: ImmigrationItem[], scopeLabel: string) {
  const columns: ExcelColumn<ImmigrationItem>[] = [
    { header: "#", width: 6, align: "center", value: (_r, i) => String(i + 1) },
    { header: "Applicant", width: 34, value: (r) => r.name },
    { header: "Record", width: 14, value: (r) => (r.kind === "payment" ? "Payment" : "Notification") },
    { header: "Application type", width: 26, value: (r) => r.applicationType },
    { header: "Status", width: 20, value: (r) => r.status, color: (r) => STATUS_ARGB[r.statusKey] ?? null },
    { header: "Date", width: 14, value: (r) => r.date },
    {
      header: "Message / Fee",
      width: 46,
      wrap: true,
      value: (r) => [r.message, r.amount ? `Amount: ${r.amount}` : ""].filter(Boolean).join(" · "),
    },
    { header: "Recorded", width: 20, value: (r) => r.iso },
    { header: "Document", width: 44, value: (r) => r.pdfName || "" },
  ]

  await exportRowsToExcel({
    title: "IMMIGRATION NOTIFICATIONS",
    subtitle: `${scopeLabel} · ${rows.length} row${rows.length === 1 ? "" : "s"}`,
    sheetName: "Immigration",
    filename: timestampedFilename("immigration-notifications"),
    columns,
    rows,
  })
}
