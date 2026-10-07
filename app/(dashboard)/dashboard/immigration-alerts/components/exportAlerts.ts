import type { ImmigrationAlert } from "@/lib/immigrationAlerts"
import { exportRowsToExcel, timestampedFilename, type ExcelColumn } from "../../emails/components/excelExport"
import { ALERT_COLUMNS, ALERT_VALUE } from "./ImmigrationAlertsTable"

const WIDTHS: Record<string, number> = {
  person: 30, relationship: 16, principal: 28, company: 34, prefix: 14,
  job_level: 14, document: 34, expiry: 14, days: 16, status: 18,
}

// The rows exactly as filtered and sorted on screen, in the app's standard Excel layout.
export async function exportAlertsToExcel(rows: ImmigrationAlert[], scopeLabel: string) {
  const columns: ExcelColumn<ImmigrationAlert>[] = [
    { header: "#", width: 6, align: "center", value: (_r, i) => String(i + 1) },
    ...ALERT_COLUMNS.map((c) => ({
      header: c.label,
      width: WIDTHS[c.id] ?? 18,
      value: (r: ImmigrationAlert) => ALERT_VALUE[c.id](r),
      ...(c.id === "status" || c.id === "days"
        ? { color: (r: ImmigrationAlert) => (r.status === "expired" ? "FFDC2626" : "FFD97706") }
        : {}),
    })),
  ]
  const expired = rows.filter((r) => r.status === "expired").length
  await exportRowsToExcel({
    title: "Immigration Alerts",
    subtitle: `${scopeLabel} — people whose current immigration status is expired or in its grace period`,
    sheetName: "Immigration Alerts",
    filename: timestampedFilename("Immigration_Alerts"),
    columns,
    rows,
    stats: [
      { label: "Total", value: rows.length },
      { label: "Expired", value: expired, color: "FFDC2626" },
      { label: "In grace period", value: rows.length - expired, color: "FFD97706" },
    ],
  })
}
