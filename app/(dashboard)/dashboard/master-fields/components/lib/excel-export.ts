import * as XLSX from "xlsx"
import type { JobField } from "../types/database"

export const exportToExcel = async (fields: JobField[]) => {
  // Prepare data for Excel export
  const excelData = fields.map((field) => ({
    "Field Key": field.field_key,
    Label: field.label,
    Type: field.type,
    Required: field.is_required ? "Yes" : "No",
    Options: field.options ? JSON.stringify(field.options) : "",
    "Number of Sources": field.sources?.length || 0,
    Sources:
      field.sources
        ?.map((source) => `${source.source_type}:${source.table}.${source.path} (Priority: ${source.priority})`)
        .join("; ") || "",
    "Created At": new Date(field.created_at).toLocaleDateString(),
    "Updated At": new Date(field.updated_at).toLocaleDateString(),
  }))

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(excelData)

  // Auto-size columns
  const colWidths = [
    { wch: 20 }, // Field Key
    { wch: 25 }, // Label
    { wch: 10 }, // Type
    { wch: 10 }, // Required
    { wch: 30 }, // Options
    { wch: 15 }, // Number of Sources
    { wch: 50 }, // Sources
    { wch: 15 }, // Created At
    { wch: 15 }, // Updated At
  ]
  ws["!cols"] = colWidths

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, "Job Fields")

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().split("T")[0]
  const filename = `job-fields-${timestamp}.xlsx`

  // Write and download file
  XLSX.writeFile(wb, filename)
}
