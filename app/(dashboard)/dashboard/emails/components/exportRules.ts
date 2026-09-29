// Rules tab -> styled .xlsx export, built on the shared excelExport engine.
import { exportRowsToExcel, hexToArgb, timestampedFilename, TONE_ARGB, type ExcelColumn } from "./excelExport"
import { ruleOutcome, type CategoryOption, type RuleRow } from "./shared"

const wordingsOf = (r: RuleRow) => [r.pattern, ...(r.extra_patterns ?? [])].filter(Boolean).join("\n")
const sendersOf = (r: RuleRow) => [r.sender_pattern, ...(r.extra_sender_patterns ?? [])].filter(Boolean).join("\n")

const actionOf = (r: RuleRow, cat: CategoryOption | undefined) => {
  if (r.is_ignore && r.hard_ignore) return "Ignore & delete"
  if (r.is_ignore) return "Ignore"
  if (r.is_notify) return "Flag as important"
  return cat?.name ?? r.category_key
}

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "")

export async function exportRulesToExcel(rules: RuleRow[], categories: CategoryOption[]): Promise<void> {
  const catByKey = new Map(categories.map((c) => [c.key, c]))
  const ordered = [...rules].sort((a, b) => a.sort_order - b.sort_order)
  const activeCount = rules.filter((r) => r.is_active).length

  const columns: ExcelColumn<RuleRow>[] = [
    { header: "#", width: 5, align: "center", value: (_r, i) => String(i + 1) },
    { header: "Order", width: 8, align: "center", value: (r) => String(r.sort_order) },
    { header: "Match type", width: 12, value: (r) => (r.match_type === "regex" ? "Regex" : "Contains") },
    { header: "Subject wordings", width: 42, wrap: true, value: (r) => wordingsOf(r) || "Any subject" },
    { header: "Sender", width: 30, wrap: true, value: (r) => sendersOf(r) || "Any sender" },
    { header: "Sender match type", width: 14, value: (r) => (sendersOf(r) ? (r.sender_match_type === "regex" ? "Regex" : "Contains") : "") },
    {
      header: "Action / Category", width: 24,
      value: (r) => actionOf(r, catByKey.get(r.category_key)),
      color: (r) => (r.is_ignore || r.is_notify ? null : hexToArgb(catByKey.get(r.category_key)?.color, "FF334155")),
      bold: (r) => !r.is_ignore && !r.is_notify,
    },
    {
      header: "Result", width: 34,
      value: (r) => ruleOutcome(r, catByKey.get(r.category_key)).label,
      color: (r) => TONE_ARGB[ruleOutcome(r, catByKey.get(r.category_key)).tone] ?? "FF334155",
      bold: () => true,
    },
    {
      header: "Priority", width: 12, align: "center",
      value: (r) => (r.is_notify ? (r.notify_priority === "informational" ? "FYI" : "Urgent") : ""),
      color: (r) => (r.is_notify ? (r.notify_priority === "informational" ? "FF2563EB" : "FFD97706") : null),
      bold: (r) => r.is_notify,
    },
    { header: "Confidence", width: 12, align: "center", value: (r) => `${Math.round(r.confidence * 100)}%` },
    { header: "Active", width: 9, align: "center", value: (r) => (r.is_active ? "Yes" : "No"), color: (r) => (r.is_active ? "FF059669" : "FF94A3B8") },
    { header: "Created", width: 22, value: (r) => fmt(r.created_at) },
    { header: "Created by", width: 18, value: (r) => r.created_by_name ?? (r.created_at ? "System" : "") },
    { header: "Last updated", width: 22, value: (r) => fmt(r.updated_at) },
    { header: "Updated by", width: 18, value: (r) => r.updated_by_name ?? "" },
    { header: "Notes", width: 34, wrap: true, value: (r) => r.notes ?? "" },
  ]

  await exportRowsToExcel({
    title: "KRA EMAIL CLASSIFICATION RULES",
    subtitle: `${rules.length} rule${rules.length === 1 ? "" : "s"}  ·  ${activeCount} active, ${rules.length - activeCount} inactive  ·  Generated: ${new Date().toLocaleString()}`,
    sheetName: "Classification Rules",
    filename: timestampedFilename("kra-classification-rules"),
    columns,
    rows: ordered,
    rowMuted: (r) => !r.is_active,
  })
}
