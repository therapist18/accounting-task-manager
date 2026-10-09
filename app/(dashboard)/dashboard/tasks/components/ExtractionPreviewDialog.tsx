"use client"

import React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { toast } from "@/lib/hooks/use-toast"
import { performExtraction } from "@/lib/extractionUtils"
import { supabase } from "@/lib/supabase/client"

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

  const runExtraction = async (forceAI: boolean = false) => {
    if (!previewDocument?.fileUrl) {
      toast({ title: 'Error', description: 'No file available to extract.', variant: 'destructive' });
      return;
    }
    try {
      toast({
        title: 'Processing',
        description: forceAI ? 'Re-extracting with AI...' : 'Re-extracting document...'
      });

      const result = await performExtraction(
        previewDocument.fileUrl,
        previewDocument.fields || [],
        previewDocument.documentName,
        undefined,
        previewDocument.fileName,
        undefined,
        forceAI
      );

      const extractedData = typeof result.extractedData === 'string'
        ? JSON.parse(result.extractedData)
        : (result.extractedData || {});

      const docId = previewDocument.documentId || previewDocument.id;
      if (docId) {
        await supabase
          .from('acc_portal_directors_documents')
          .update({
            extracted_details: extractedData,
            updated_at: new Date().toISOString()
          })
          .eq('id', docId);
      }

      setPreviewDocument((prev: any) => prev ? {
        ...prev,
        extractedData
      } : null);

      handleTaskAction({
        type: forceAI ? 'retry-extraction-ai' : 'retry-extraction',
        documentId: docId,
        taskId: previewDocument.taskId,
        extractedData
      });

      toast({
        title: result.success ? 'Success' : 'Extraction complete',
        description: result.message || (result.success ? 'Document re-extracted successfully.' : 'Some fields may need manual review.'),
        variant: result.success ? 'success' : 'default'
      });
    } catch (error: any) {
      console.error('Error retrying extraction:', error);
      toast({ title: 'Error', description: error?.message || 'Failed to retry extraction', variant: 'destructive' });
    }
  };

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
              setPreviewDocument((prev: any) => prev ? {
                ...prev,
                extractedData: {
                  ...(prev.extractedData || {}),
                  [field]: value
                }
              } : null);
            }}
            // Handle Deletion - explicitly pass the handler
            onDelete={async (doc) => {
              try {
                const docId = previewDocument.documentId || previewDocument.id;
                console.log('[DEBUG] ExtractionPreviewDialog onDelete wrapper:', {
                  docId,
                  previewDocumentId: previewDocument.id,
                  previewDocumentDocumentId: previewDocument.documentId,
                  docArgFromExtractionPreview: doc,
                });
                if (docId) {
                  await handleDeleteDocument(docId);
                  console.log('[DEBUG] ExtractionPreviewDialog: handleDeleteDocument resolved for', docId);
                  setPreviewDocument(null);
                  setIsDocumentPreviewOpen(false);
                } else {
                  console.warn('[DEBUG] ExtractionPreviewDialog onDelete: no docId resolved, skipping delete', previewDocument);
                }
              } catch (error) {
                console.error('[DEBUG] ExtractionPreviewDialog onDelete: error thrown by handleDeleteDocument', error);
              }
            }}
            // Handle Retry
            onRetryExtraction={() => runExtraction(false)}
            // Handle Retry with AI
            onRetryExtractionWithAI={() => runExtraction(true)}
            // Handle Save
            onSave={async (data) => {
              try {
                const docId = previewDocument.documentId || previewDocument.id;
                if (docId) {
                  const { error } = await supabase
                    .from('acc_portal_directors_documents')
                    .update({
                      extracted_details: data,
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', docId);
                  if (error) throw error;
                }
                setPreviewDocument((prev: any) => prev ? {
                  ...prev,
                  extractedData: data
                } : null);
                toast({ title: "Success", description: "Document details saved.", variant: "success" });
              } catch (error: any) {
                console.error('Error saving document:', error);
                toast({ title: "Error", description: error?.message || "Failed to save document", variant: "destructive" });
              }
            }}
            fileUrl={previewDocument.fileUrl}
            fileName={previewDocument.fileName}
            expanded={true}
            file={previewDocument.file}
            type={previewDocument.type}
            supabase={supabase}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}