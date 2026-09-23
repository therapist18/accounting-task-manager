// @ts-nocheck

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Download, Trash2, RefreshCw, Save, FileText, Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { handleDocumentDownload } from '../generic-functions/documentSorting';
import { toast } from "@/lib/hooks/use-toast";

// Reusable DeleteConfirmationDialog component
const DeleteConfirmationDialog = ({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  title = 'Confirm Deletion',
  description = 'Are you sure you want to delete this document? This action cannot be undone.'
}) => (
  <Dialog open={isOpen} onOpenChange={onClose}>
    <DialogContent className="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle className="flex items-center text-destructive">
          <Trash2 className="h-5 w-5 mr-2" />
          {title}
        </DialogTitle>
        <DialogDescription className="pt-2">
          {description}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={isDeleting}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={onConfirm}
          disabled={isDeleting}
          className="flex items-center gap-2"
        >
          {isDeleting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Deleting...
            </>
          ) : (
            <>
              <Trash2 className="h-4 w-4" />
              Delete
            </>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

type DocumentActionsProps = {
  document: any;
  documentTypes: Array<{ id: string; name: string }>;
  supabase: any;
  onDelete?: (doc: any) => Promise<void>;
  onRetry?: (doc: any) => Promise<void>;
  onRetryWithAI?: (doc: any) => Promise<void>;
  onSave?: (doc: any) => Promise<void>;
  className?: string;
  showLabels?: boolean;
  onDownloadSuccess?: () => void;
  onDownloadError?: (error: Error) => void;
  deleteConfirmationTitle?: string;
  deleteConfirmationDescription?: string;
  showDeleteConfirmation?: boolean;
};

export const DocumentActions: React.FC<DocumentActionsProps> = ({
  document,
  documentTypes,
  supabase,
  onDelete,
  onRetry,
  onRetryWithAI,
  onSave,
  className = '',
  showLabels = true,
  onDownloadSuccess,
  onDownloadError,
  deleteConfirmationTitle = 'Delete Document',
  deleteConfirmationDescription = 'Are you sure you want to delete this document? This action cannot be undone.',
  showDeleteConfirmation = true,
}) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isRetryingWithAI, setIsRetryingWithAI] = useState(false);

  const handleDeleteClick = () => {
    if (showDeleteConfirmation) {
      setIsDeleteDialogOpen(true);
    } else if (onDelete) {
      handleDelete();
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      // Pass the document data to the onDelete callback
      await onDelete(document);
      if (showDeleteConfirmation) {
        setIsDeleteDialogOpen(false);
      }
      // Let the parent component handle success feedback
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error(error.message || 'Failed to delete document');
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRetry = async () => {
    if (!onRetry) return;
    setIsRetrying(true);
    try {
      await onRetry(document);
    } catch (error) {
      // Error handling usually done in parent/callback, but just in case
      console.error("Retry failed in Action wrapper", error);
    } finally {
      setIsRetrying(false);
    }
  }

  const handleRetryWithAI = async () => {
    if (!onRetryWithAI) return;
    setIsRetryingWithAI(true);
    try {
      await onRetryWithAI(document);
    } catch (error) {
      console.error("Retry with AI failed in Action wrapper", error);
    } finally {
      setIsRetryingWithAI(false);
    }
  }

  const handleDownload = async (format: 'document' | 'excel' | 'pdf' = 'document') => {
    if (!document?.file_path && !document?.fileUrl) {
      const error = new Error('No file available for download');
      onDownloadError?.(error);
      return;
    }

    try {
      await handleDocumentDownload(
        {
          ...document,
          file_path: document.file_path || document.fileUrl
        },
        format,
        document.document_display_name || document.documentName || 'document',
        documentTypes,
        document.document_id || document.kyc_document_id || document.type,
        supabase
      );
      onDownloadSuccess?.();
    } catch (error) {
      console.error('Download error:', error);
      onDownloadError?.(error);
    }
  };

  const hasFile = Boolean(document?.file_path || document?.fileUrl);
  const downloadTitle = hasFile ? 'Download Document' : 'No file available for download';

  const downloadButtonProps = hasFile ? {} : {
    'aria-disabled': true,
    'data-disabled': true,
    tabIndex: -1,
    style: { pointerEvents: 'none' } as React.CSSProperties
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {/* 1. Download */}
      <div className="relative group">
        <Button
          variant="outline"
          size="sm"
          onClick={() => hasFile && handleDownload('document')}
          title={downloadTitle}
          className={`flex items-center gap-1 ${!hasFile ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={!hasFile}
        >
          <Download className="h-4 w-4" />
          {showLabels && <span>Download</span>}
        </Button>
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg py-1 z-10 hidden group-hover:block">
          <button
            onClick={() => handleDownload('document')}
            className={`w-full text-left px-4 py-2 text-sm ${hasFile ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-400 cursor-not-allowed'} flex items-center gap-2`}
            disabled={!hasFile}
            title={hasFile ? 'Download original document' : 'No file available'}
            {...(!hasFile ? downloadButtonProps : {})}
          >
            <Download className="h-4 w-4" />
            <span>Download Document</span>
          </button>
          <button
            onClick={() => handleDownload('excel')}
            className={`w-full text-left px-4 py-2 text-sm ${hasFile ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-400 cursor-not-allowed'} flex items-center gap-2`}
            disabled={!hasFile}
            title={hasFile ? 'Download as Excel' : 'No file available'}
            {...(!hasFile ? downloadButtonProps : {})}
          >
            <FileText className="h-4 w-4 text-green-600" />
            <span>Download as Excel</span>
          </button>
          <button
            onClick={() => handleDownload('pdf')}
            className={`w-full text-left px-4 py-2 text-sm ${hasFile ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-400 cursor-not-allowed'} flex items-center gap-2`}
            disabled={!hasFile}
            title={hasFile ? 'Download as PDF' : 'No file available'}
            {...(!hasFile ? downloadButtonProps : {})}
          >
            <FileText className="h-4 w-4 text-red-600" />
            <span>Download as PDF</span>
          </button>
        </div>
      </div>

      {/* 2. Save */}
      {onSave && (
        <Button
          variant="default"
          size="sm"
          onClick={() => onSave(document)}
          title="Save Changes"
          className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white"
        >
          <Save className="h-4 w-4" />
          {showLabels && <span>Save</span>}
        </Button>
      )}

      {/* 3. Retry (Next to Delete) */}
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleRetry}
          title="Retry Extraction"
          className="flex items-center gap-1 hover:bg-blue-50 text-blue-600 border-blue-200"
          disabled={isRetrying}
        >
          {isRetrying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {showLabels && <span>Retry</span>}
        </Button>
      )}

      {/* 3b. Retry with AI */}
      {onRetryWithAI && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleRetryWithAI}
          title="Re-extract using AI instead of the local text/OCR parser — useful if some fields are still missing or wrong"
          className="flex items-center gap-1 border-purple-200 text-purple-600 hover:bg-purple-50"
          disabled={isRetryingWithAI}
        >
          {isRetryingWithAI ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {showLabels && <span>Re-extract with AI</span>}
        </Button>
      )}

      {/* 4. Delete */}
      {onDelete && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteClick}
            title="Delete Document"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center gap-1 border-red-200"
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {showLabels && <span>Delete</span>}
          </Button>

          {showDeleteConfirmation && (
            <DeleteConfirmationDialog
              isOpen={isDeleteDialogOpen}
              onClose={() => !isDeleting && setIsDeleteDialogOpen(false)}
              onConfirm={handleDelete}
              isDeleting={isDeleting}
              title={deleteConfirmationTitle}
              description={deleteConfirmationDescription}
            />
          )}
        </>
      )}
    </div>
  );
};

export default DocumentActions;