// Needs Review / Notifications / Update / Ignored tabs -> styled .xlsx export, one shared function
// since all four are the same EmailRow shape — only the title/subtitle/filename differ per tab.
import { exportRowsToExcel, hexToArgb, TONE_ARGB, timestampedFilename, type ExcelColumn } from "./excelExport"
import { DISPOSITION_BADGE, DISPOSITION_LABEL, fmtDateTime, type CategoryOption, type EmailRow } from "./shared"

// DISPOSITION_BADGE/APPROVAL_BADGE store full Tailwind class strings (e.g. "bg-amber-50 text-amber-700
// border-amber-200"); pulling just the text-color out of one and looking it up in TONE_ARGB keeps this
// in step with the on-screen badge colors without hand-duplicating a second color table here.
function dispositionArgb(tone: string): string {
  const match = /text-(\w+)-(\d+)/.exec(tone)
  return match ? TONE_ARGB[`text-${match[1]}-${match[2]}`] ?? TONE_ARGB[`text-${match[1]}-600`] ?? "FF334155" : "FF334155"
}

export async function exportEmailsToExcel(
  emails: EmailRow[],
  categories: CategoryOption[],
  opts: { title: string; tabLabel: string; filenameBase: string; notificationsMode?: boolean }
): Promise<void> {
  const catByKey = new Map(categories.map((c) => [c.key, c]))
  const showTime = true // exports always carry the time, regardless of the page's "Hide Time" toggle

  const columns: ExcelColumn<EmailRow>[] = [
    { header: "#", width: 5, align: "center", value: (_e, i) => String(i + 1) },
    { header: "Company", width: 26, value: (e) => e.company_name ?? "Unassigned", color: (e) => (e.company_name ? null : "FFDC2626") },
    { header: "From", width: 30, value: (e) => (e.sender_name ? `${e.sender_name} <${e.sender_email}>` : e.sender_email) },
    { header: "Subject", width: 40, wrap: true, value: (e) => e.subject || "(no subject)" },
    { header: "Summary", width: 46, wrap: true, value: (e) => e.ai_summary || e.snippet || "" },
    { header: "Received", width: 18, align: "center", value: (e) => fmtDateTime(e.received_at, showTime) },
    {
      header: "Category", width: 24,
      value: (e) => (e.category_key ? catByKey.get(e.category_key)?.name ?? e.category_key : ""),
      color: (e) => (e.category_key ? hexToArgb(catByKey.get(e.category_key)?.color, "FF334155") : null),
    },
    {
      header: opts.notificationsMode ? "Handled" : "Status", width: 16, align: "center",
      value: (e) =>
        opts.notificationsMode
          ? (e.handled_at ? "Handled" : "Active")
          : e.disposition ? DISPOSITION_LABEL[e.disposition] : "",
      color: (e) =>
        opts.notificationsMode
          ? (e.handled_at ? "FF059669" : "FFD97706")
          : e.disposition ? dispositionArgb(DISPOSITION_BADGE[e.disposition]) : null,
      bold: () => true,
    },
    { header: "Case", width: 12, align: "center", value: (e) => (e.case_id ? "Yes" : "—") },
    { header: "Handled by", width: 18, value: (e) => e.handled_by_name ?? "" },
    { header: "Handled at", width: 18, align: "center", value: (e) => (e.handled_at ? fmtDateTime(e.handled_at, showTime) : "") },
    { header: "Review reason", width: 32, wrap: true, value: (e) => e.review_reason ?? "" },
  ]

  await exportRowsToExcel({
    title: opts.title,
    subtitle: `${opts.tabLabel}  ·  ${emails.length} email${emails.length === 1 ? "" : "s"}  ·  Generated: ${new Date().toLocaleString()}`,
    sheetName: opts.tabLabel.slice(0, 31), // Excel's own sheet-name length limit
    filename: timestampedFilename(opts.filenameBase),
    columns,
    rows: emails,
    rowMuted: (e) => !!e.handled_at,
  })
}
