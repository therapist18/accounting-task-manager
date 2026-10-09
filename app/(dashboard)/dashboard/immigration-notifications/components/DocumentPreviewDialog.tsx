"use client"

import type { ComponentType } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import type { ImmigrationItem } from "@/lib/immigrationNotifications"
import { fmtDateTime } from "../../emails/components/shared"

// Read-only document viewer for a notification/payment PDF, reusing the KYC module's
// ExtractionPreview so the preview (the zoom/rotate document panel plus a details panel) behaves
// exactly like the document viewer in Tasks. There is no extraction here, so the right-hand panel
// is filled from the row's own columns rather than extracted fields.
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

export function DocumentPreviewDialog({
  item,
  onOpenChange,
}: {
  item: ImmigrationItem | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-full h-[95vh] p-0 overflow-hidden flex flex-col bg-gray-50">
        <DialogHeader className="p-4 border-b bg-white shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="truncate">{item?.name || "Document"}</span>
            {item?.status && <span className="text-sm font-normal text-muted-foreground">({item.status})</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden flex items-stretch justify-center">
          <div className="w-full max-w-[1800px] flex items-stretch min-w-0 min-h-0 h-full">
            {item?.pdfUrl ? (
              <Preview
                documentName={item.pdfName || item.name}
                extractedData={previewData(item)}
                fields={PREVIEW_FIELDS}
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
