'use client';

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Download, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import * as mammoth from 'mammoth';

interface LetterheadPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  letterheadId: string;
  letterheadName: string;
  filePath: string;
  fileName: string;
}

export function LetterheadPreviewDialog({
  open,
  onOpenChange,
  letterheadId,
  letterheadName,
  filePath,
  fileName,
}: LetterheadPreviewDialogProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (open && filePath) {
      loadPreview();
    }
  }, [open, filePath]);

  useEffect(() => {
    if (htmlContent && iframeRef.current) {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body {
                  font-family: 'Calibri', 'Arial', sans-serif;
                  margin: 2cm;
                  padding: 0;
                  background: white;
                }
                img {
                  max-width: 100%;
                  height: auto;
                }
                table {
                  border-collapse: collapse;
                  width: 100%;
                }
                td, th {
                  border: 1px solid #ddd;
                  padding: 8px;
                }
              </style>
            </head>
            <body>
              ${htmlContent}
            </body>
          </html>
        `);
        iframeDoc.close();
      }
    }
  }, [htmlContent]);

  const loadPreview = async () => {
    try {
      setLoading(true);
      setError(null);

      // Download file from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('letterheads')
        .download(filePath);

      if (downloadError || !fileData) {
        throw new Error('Failed to download letterhead file');
      }

      // Convert to ArrayBuffer for mammoth
      const arrayBuffer = await fileData.arrayBuffer();

      // Convert Word document to HTML using mammoth
      const result = await mammoth.convertToHtml({ arrayBuffer });

      setHtmlContent(result.value);
      setLoading(false);
    } catch (err) {
      console.error('Error loading preview:', err);
      setError(err instanceof Error ? err.message : 'Failed to load preview');
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('letterheads')
        .download(filePath);

      if (downloadError || !fileData) {
        throw new Error('Failed to download file');
      }

      // Create download link
      const url = window.URL.createObjectURL(fileData);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading file:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{letterheadName}</DialogTitle>
              <DialogDescription className="mt-1">
                Preview of letterhead document
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto border rounded-lg bg-gray-50">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                <p className="text-sm text-muted-foreground">Loading preview...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <X className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <p className="text-sm font-medium mb-2">Failed to load preview</p>
                <p className="text-xs text-muted-foreground mb-4">{error}</p>
                <Button variant="outline" size="sm" onClick={loadPreview}>
                  Try Again
                </Button>
              </div>
            </div>
          )}

          <iframe
            ref={iframeRef}
            className="w-full h-full border-0"
            style={{
              display: loading || error ? 'none' : 'block',
              minHeight: '600px',
            }}
            title="Letterhead Preview"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
