"use client"

import { useEffect, useState, type ComponentType } from "react"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import type { ImmigrationItem } from "@/lib/immigrationNotifications"
import { fmtDateTime } from "../../emails/components/shared"

// Read-only document viewer for a notification/payment PDF, reusing the KYC module's
// ExtractionPreview so the preview (the zoom/rotate document panel plus a details panel) behaves
// exactly like the document viewer in Tasks. The right-hand panel shows the record's document type's
// fields (/api/immigration-notifications/fields): the filed document's saved values, or — not filed
// yet — the type its status's "Filled from EFNS" rule picks, with what filing would read off the PDF.
// Without a rule (or with no fields on the type) it falls back to the row's own columns.
//
// ExtractionPreview is authored as a loosely-typed (@ts-nocheck) component whose `onDataChange`
// prop is declared required even though it is optional at runtime. Omitting it is precisely what
// makes the fields read-only; the cast below keeps the call site typed.

type PreviewProps = {
  documentName: string
  extractedData: Record<string, unknown>
  fields: unknown[]
  fileUrl: string
  fileName?: string
  expanded?: boolean
  showSaveButton?: boolean
  type?: string
}

const Preview = ExtractionPreview as unknown as ComponentType<PreviewProps>

// The details the dialog shows for the selected row, in display order.
const PREVIEW_FIELDS = [
  { id: "applicant", name: "applicant", type: "text", displayName: "Applicant" },
  { id: "record", name: "record", type: "text", displayName: "Record" },
  { id: "application_type", name: "application_type", type: "text", displayName: "Application type" },
  { id: "permit_group", name: "permit_group", type: "text", displayName: "Permit group" },
  { id: "status", name: "status", type: "text", displayName: "Status" },
  { id: "date", name: "date", type: "text", displayName: "Date" },
  { id: "details", name: "details", type: "text", displayName: "Message / Fee" },
  { id: "amount", name: "amount", type: "text", displayName: "Amount" },
  { id: "recorded", name: "recorded", type: "text", displayName: "Recorded" },
]

function previewData(item: ImmigrationItem): Record<string, unknown> {
  return {
    applicant: item.name,
    record: item.kind === "payment" ? "Payment" : "Notification",
    application_type: item.applicationType,
    permit_group: item.permitGroup,
    status: item.status,
    date: item.date,
    details: item.message,
    amount: item.amount,
    recorded: item.iso ? fmtDateTime(item.iso) : "",
  }
}

interface FieldPreview {
  source: "filed" | "preview" | "none"
  docTypeName: string | null
  stageName: string | null
  taskId: number | null
  fields: Array<{ id?: string; name?: string | null; type?: string | null }>
  values: Record<string, string>
  note?: "no_rule" | "no_fields" | null
}

export function DocumentPreviewDialog({
  item,
  onOpenChange,
}: {
  item: ImmigrationItem | null
  onOpenChange: (open: boolean) => void
}) {
  const [preview, setPreview] = useState<FieldPreview | null>(null)
  const [loadingFields, setLoadingFields] = useState(false)

  useEffect(() => {
    setPreview(null)
    if (!item?.id) return
    let cancelled = false
    setLoadingFields(true)
    fetch(`/api/immigration-notifications/fields?kind=${item.kind}&id=${item.id}`)
      .then((r) => r.json())
      .then((json) => !cancelled && json.success && setPreview(json))
      .catch(() => {})
      .finally(() => !cancelled && setLoadingFields(false))
    return () => {
      cancelled = true
    }
  }, [item?.kind, item?.id])

  // The doc type's fields when there are any; the row's columns otherwise.
  const typeFields = (preview?.fields || []).filter((f) => f?.name && f.type !== "array")
  const useTypeFields = !!preview && preview.source !== "none" && typeFields.length > 0
  const fields = useTypeFields
    ? typeFields.map((f) => ({ id: f.id || f.name, name: f.name, type: f.type === "date" ? "date" : "text" }))
    : PREVIEW_FIELDS
  const data = useTypeFields ? preview!.values : item ? previewData(item) : {}

  const caption = !preview
    ? null
    : preview.source === "filed"
      ? `${preview.docTypeName || "Document"} fields — filed on task #${preview.taskId}${preview.stageName ? ` › ${preview.stageName}` : ""}`
      : preview.source === "preview"
        ? `${preview.docTypeName || "Document"} fields — what filing to “${preview.stageName}” will fill (not filed yet)`
        : null
  const fallbackNote = !preview || useTypeFields
    ? null
    : preview.note === "no_fields"
      ? `“${preview.docTypeName}” has no fields configured — showing the record's details.`
      : "No stage document's “Filled from EFNS” rule takes this status — showing the record's details."

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-full h-[95vh] p-0 overflow-hidden flex flex-col bg-gray-50">
        <DialogHeader className="p-4 border-b bg-white shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="truncate">{item?.name || "Document"}</span>
            {item?.status && <span className="text-sm font-normal text-muted-foreground">({item.status})</span>}
          </DialogTitle>
          <p className="text-xs text-slate-500 flex items-center gap-1.5 min-h-4">
            {loadingFields ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Loading document fields…
              </>
            ) : (
              caption || fallbackNote
            )}
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden flex items-stretch justify-center">
          <div className="w-full max-w-[1800px] flex items-stretch min-w-0 min-h-0 h-full">
            {item?.pdfUrl ? (
              <Preview
                key={`${item.key}-${useTypeFields ? "type" : "row"}`}
                documentName={item.pdfName || item.name}
                extractedData={data}
                fields={fields}
                fileUrl={item.pdfUrl}
                fileName={item.pdfName || undefined}
                expanded
                showSaveButton={false}
                type={item.kind === "payment" ? "payment" : "notification"}
              />
            ) : (
              <div className="flex items-center justify-center h-full w-full text-sm text-slate-400">
                No document attached to this record.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
