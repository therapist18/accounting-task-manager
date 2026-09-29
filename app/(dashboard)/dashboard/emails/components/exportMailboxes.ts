// Mailboxes tab -> styled .xlsx export. Two shapes (by-company rows, and unlinked mailboxes), since
// that's the same split the tab's own two table layouts use.
//
// The KRA email PASSWORD is deliberately never included — only whether one is saved. Unlike viewing
// it masked-with-reveal in the app, a downloaded spreadsheet is far easier to forward, leave in a
// Downloads folder, or attach to the wrong email; exporting a real credential into a file this
// casually is a risk the on-screen masking was specifically built to avoid.
import { exportRowsToExcel, timestampedFilename, type ExcelColumn } from "./excelExport"
import { fmtDateTime, needsReconnect, type AccountRow } from "./shared"
import type { CompanyRowData } from "./MailboxesPanel"

const watchActive = (a: AccountRow) => (a.watch_expiry ? new Date(a.watch_expiry).getTime() > Date.now() : false)

const STATE_LABEL: Record<CompanyRowData["state"], string> = {
  connected: "Connected",
  reconnect: "Reconnect needed",
  not_connected: "Not connected",
}
const STATE_ARGB: Record<CompanyRowData["state"], string> = {
  connected: "FF059669",
  reconnect: "FFB91C1C",
  not_connected: "FF64748B",
}

export async function exportMailboxCompaniesToExcel(rows: CompanyRowData[], scopeLabel: string): Promise<void> {
  const connectedCount = rows.filter((r) => r.state === "connected").length

  const columns: ExcelColumn<CompanyRowData>[] = [
    { header: "#", width: 5, align: "center", value: (_r, i) => String(i + 1) },
    { header: "Company", width: 30, value: (r) => r.company.company_name },
    { header: "KRA PIN", width: 16, value: (r) => r.company.kra_pin ?? "" },
    { header: "KRA email", width: 28, value: (r) => r.kraEmail },
    { header: "Password saved", width: 14, align: "center", value: (r) => (r.kraPassword ? "Yes" : "No") },
    { header: "Status", width: 16, value: (r) => STATE_LABEL[r.state], color: (r) => STATE_ARGB[r.state], bold: () => true },
    { header: "Mailbox(es)", width: 32, wrap: true, value: (r) => r.accounts.map((a) => a.email).join("\n") || "" },
    { header: "Emails stored", width: 14, align: "center", value: (r) => r.accounts.reduce((s, a) => s + (a.email_count ?? 0), 0).toString() },
    {
      header: "First email", width: 16, align: "center",
      value: (r) => {
        const dates = r.accounts.map((a) => a.first_email_at).filter(Boolean) as string[]
        return dates.length ? fmtDateTime(dates.sort()[0], false) : ""
      },
    },
    { header: "Last sync", width: 18, align: "center", value: (r) => (r.lastSync ? fmtDateTime(r.lastSync, true) : "Never") },
    { header: "Push", width: 12, align: "center", value: (r) => (r.live > 0 ? "Live" : "Not watching"), color: (r) => (r.live > 0 ? "FF059669" : "FF94A3B8") },
    { header: "Needs reconnect", width: 14, align: "center", value: (r) => (r.failing > 0 ? `${r.failing}` : ""), color: (r) => (r.failing > 0 ? "FFB91C1C" : null), bold: (r) => r.failing > 0 },
  ]

  await exportRowsToExcel({
    title: "KRA MAILBOXES BY COMPANY",
    subtitle: `${scopeLabel}  ·  ${rows.length} compan${rows.length === 1 ? "y" : "ies"} (${connectedCount} connected)  ·  Generated: ${new Date().toLocaleString()}`,
    sheetName: "Mailboxes",
    filename: timestampedFilename("kra-mailboxes-by-company"),
    columns,
    rows,
  })
}

export async function exportUnlinkedMailboxesToExcel(accounts: AccountRow[]): Promise<void> {
  const columns: ExcelColumn<AccountRow>[] = [
    { header: "#", width: 5, align: "center", value: (_a, i) => String(i + 1) },
    { header: "Mailbox", width: 32, value: (a) => a.email },
    {
      header: "Status", width: 16, value: (a) => (needsReconnect(a) ? "Reconnect needed" : "Connected"),
      color: (a) => (needsReconnect(a) ? "FFB91C1C" : "FF059669"), bold: () => true,
    },
    { header: "Emails stored", width: 14, align: "center", value: (a) => String(a.email_count ?? 0) },
    { header: "First email", width: 16, align: "center", value: (a) => (a.first_email_at ? fmtDateTime(a.first_email_at, false) : "") },
    { header: "Last sync", width: 18, align: "center", value: (a) => (a.last_synced_at ? fmtDateTime(a.last_synced_at, true) : "Never") },
    { header: "Push", width: 12, align: "center", value: (a) => (watchActive(a) ? "Live" : "Not watching"), color: (a) => (watchActive(a) ? "FF059669" : "FF94A3B8") },
    { header: "Last sync error", width: 36, wrap: true, value: (a) => a.last_sync_error ?? "" },
  ]

  await exportRowsToExcel({
    title: "UNLINKED MAILBOXES",
    subtitle: `${accounts.length} mailbox${accounts.length === 1 ? "" : "es"} not linked to a company  ·  Generated: ${new Date().toLocaleString()}`,
    sheetName: "Unlinked Mailboxes",
    filename: timestampedFilename("kra-unlinked-mailboxes"),
    columns,
    rows: accounts,
  })
}
