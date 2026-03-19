"use client"

import React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { toast } from "@/hooks/use-toast"

interface ExtractionPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  previewDocument: any
  handleDeleteDocument: (documentId: string) => Promise<void>
  handleTaskAction: (action: any) => void
  setIsDocumentPreviewOpen: (open: boolean) => void
  setPreviewDocument: (document: any) => void
}

export function ExtractionPreviewDialog({
  open,
  onOpenChange,
  previewDocument,
  handleDeleteDocument,
  handleTaskAction,
  setIsDocumentPreviewOpen,
  setPreviewDocument
}: ExtractionPreviewDialogProps) {
  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setPreviewDocument(null)
      setIsDocumentPreviewOpen(false)
    }
    onOpenChange(isOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-none w-full h-full p-0 m-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Document Preview</DialogTitle>
          <DialogDescription>Preview of the extracted document data</DialogDescription>
        </DialogHeader>
        {previewDocument && (
          <ExtractionPreview
            documentName={previewDocument.documentName}
            extractedData={previewDocument.extractedData || {}}
            fields={previewDocument.fields || []}
            // Handle data changes
            onDataChange={(field, value) => {
              console.log(`Field ${field} updated to:`, value);
              // Optional: Update local preview state if needed
            }}
            // Handle Deletion - explicitly pass the handler
            onDelete={async (doc) => {
              try {
                const docId = previewDocument.documentId || previewDocument.id;
                if (docId) {
                  await handleDeleteDocument(docId);
                  setPreviewDocument(null);
                  setIsDocumentPreviewOpen(false);
                }
              } catch (error) {
                console.error('Error deleting document:', error);
                // toast is handled in handleDeleteDocument or ExtractionPreview wrapper
              }
            }}
            // Handle Retry - explicitly pass the handler
            onRetryExtraction={async (doc) => {
              try {
                const docId = previewDocument.documentId || previewDocument.id;
                if (docId) {
                  handleTaskAction({
                    type: 'retry-extraction',
                    documentId: docId,
                    taskId: previewDocument.taskId
                  });
                  toast({ title: "Processing", description: "Retry extraction request sent." });
                }
              } catch (error) {
                console.error('Error retrying extraction:', error);
                toast({ title: "Error", description: "Failed to retry extraction", variant: "destructive" });
              }
            }}
            // Handle Save
            onSave={async (data) => {
              try {
                // Add your save logic here. Example:
                // await supabase.from('extracted_data').update(data).eq('id', previewDocument.documentId);
                console.log('Saving document data:', data);
                toast({ title: "Success", description: "Document details saved." });
                // Optionally close preview
                // setPreviewDocument(null); 
              } catch (error) {
                console.error('Error saving document:', error);
                toast({ title: "Error", description: "Failed to save document", variant: "destructive" });
              }
            }}
            fileUrl={previewDocument.fileUrl}
            fileName={previewDocument.fileName}
            expanded={true}
            file={previewDocument.file}
            type={previewDocument.type}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
