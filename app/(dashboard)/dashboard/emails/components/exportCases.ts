// In Progress / Completed tabs -> styled .xlsx export, mirroring CasesTable's own columns (split
// "Client / Ref" into two sortable columns instead of one merged cell, since a spreadsheet benefits
// from that more than the on-screen table does).
import { exportRowsToExcel, timestampedFilename, type ExcelColumn } from "./excelExport"
import { APPROVAL_LABEL, caseMetrics, fmtDate, fmtDateTime, todayYmd, type CaseRow } from "./shared"

const ROW_TINT_ARGB: Record<string, string> = {
  overdue: "FFFEF2F2",
  pending: "FFFFFBEB",
  approved: "FFECFDF5",
}

const APPROVAL_ARGB: Record<string, string> = {
  approved: "FF047857",
  pending: "FFB45309",
  rejected: "FFB91C1C",
  not_responded: "FF475569",
  not_applicable: "FF64748B",
}

export async function exportCasesToExcel(cases: CaseRow[], scopeLabel: string): Promise<void> {
  const today = todayYmd()
  const openCount = cases.filter((c) => c.status === "open").length

  const columns: ExcelColumn<CaseRow>[] = [
    { header: "#", width: 5, align: "center", value: (_c, i) => String(i + 1) },
    { header: "Case Ref", width: 16, value: (c) => c.case_ref },
    { header: "Company", width: 28, value: (c) => c.company_name ?? "" },
    { header: "KRA email from", width: 26, value: (c) => c.kra_email_from ?? "" },
    { header: "KRA email CC to", width: 26, value: (c) => c.kra_email_cc ?? "" },
    { header: "Email date", width: 14, align: "center", value: (c) => fmtDate(c.email_date) },
    { header: "Deadline date (KRA)", width: 16, align: "center", value: (c) => fmtDate(c.deadline_date) },
    { header: "Subject", width: 36, wrap: true, value: (c) => c.subject ?? "" },
    { header: "Contents (details)", width: 40, wrap: true, value: (c) => c.contents ?? "" },
    { header: "Attached (PDF/Excel)", width: 24, wrap: true, value: (c) => c.attachments_summary ?? "" },
    { header: "Signing officer name", width: 22, value: (c) => c.signing_officer_name ?? "" },
    { header: "Signing officer position", width: 24, value: (c) => c.signing_officer_position ?? "" },
    { header: "Days given to respond", width: 14, align: "center", value: (c) => caseMetrics(c, today).daysGiven?.toString() ?? "" },
    { header: "Days: email → today", width: 14, align: "center", value: (c) => caseMetrics(c, today).daysSince?.toString() ?? "" },
    { header: "Respond date", width: 14, align: "center", value: (c) => fmtDate(c.respond_date) },
    { header: "Responded by", width: 18, value: (c) => c.responded_by_name ?? "" },
    { header: "Respond contents", width: 36, wrap: true, value: (c) => c.respond_contents ?? "" },
    { header: "Promised time date", width: 16, align: "center", value: (c) => fmtDate(c.promised_date) },
    {
      header: "Days remaining", width: 14, align: "center",
      value: (c) => caseMetrics(c, today).daysRemaining?.toString() ?? "",
      color: (c) => (caseMetrics(c, today).state === "overdue" ? "FFB91C1C" : null),
      bold: (c) => caseMetrics(c, today).state === "overdue",
    },
    { header: "Approval", width: 14, value: (c) => APPROVAL_LABEL[c.approval_status], color: (c) => APPROVAL_ARGB[c.approval_status] ?? null, bold: () => true },
    { header: "Assigned to", width: 18, value: (c) => c.assigned_to_name ?? "" },
    { header: "Status", width: 12, align: "center", value: (c) => (c.status === "open" ? "Open" : "Completed"), color: (c) => (c.status === "open" ? "FFB45309" : "FF059669"), bold: () => true },
  ]

  await exportRowsToExcel({
    title: "KRA CORRESPONDENCE — CASES",
    subtitle: `${scopeLabel}  ·  ${cases.length} case${cases.length === 1 ? "" : "s"} (${openCount} open, ${cases.length - openCount} completed)  ·  Generated: ${new Date().toLocaleString()}`,
    sheetName: "Cases",
    filename: timestampedFilename("kra-cases"),
    columns,
    rows: cases,
    rowFill: (c) => {
      const state = caseMetrics(c, today).state
      return state !== "normal" ? ROW_TINT_ARGB[state] ?? null : null
    },
  })
}
