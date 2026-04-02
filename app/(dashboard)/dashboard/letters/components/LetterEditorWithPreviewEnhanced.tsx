'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Image as ImageIcon, File } from 'lucide-react';
import { useToast } from '@/lib/hooks/use-toast';

interface LetterEditorWithPreviewEnhancedProps {
  companyId?: string;
  selectedLetterhead?: {
    id: string;
    name: string;
    preview_image_url?: string;
    docx_url: string;
    pdf_url?: string; // Add PDF URL support
    body_box?: {
      top: number;
      left: number;
      right: number;
      bottom: number;
    };
  };
}

type PreviewMode = 'image' | 'pdf' | 'none';

export function LetterEditorWithPreviewEnhanced({
  companyId,
  selectedLetterhead
}: LetterEditorWithPreviewEnhancedProps) {
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('image');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>('');
  const { toast } = useToast();
  const editorRef = useRef<HTMLDivElement>(null);

  // Default body box positioning if not provided
  const bodyBox = selectedLetterhead?.body_box || {
    top: 180,
    left: 70,
    right: 70,
    bottom: 120
  };

  // Calculate editor dimensions based on body box
  const editorStyle = {
    position: 'absolute' as const,
    top: `${bodyBox.top}px`,
    left: `${bodyBox.left}px`,
    right: `${bodyBox.right}px`,
    bottom: `${bodyBox.bottom}px`,
    width: `calc(100% - ${bodyBox.left + bodyBox.right}px)`,
    height: `calc(100% - ${bodyBox.top + bodyBox.bottom}px)`,
  };

  // Generate PDF preview on demand
  const generatePdfPreview = async () => {
    if (!selectedLetterhead) return;

    setIsGenerating(true);
    try {
      const response = await fetch('/api/letterheads/generate-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          letterheadId: selectedLetterhead.id,
          content: content || 'Sample content for preview',
          format: 'pdf',
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPdfPreviewUrl(url);
        setPreviewMode('pdf');
      } else {
        throw new Error('Failed to generate PDF preview');
      }
    } catch (error) {
      toast({
        title: 'Preview generation failed',
        description: 'Could not generate PDF preview',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle download
  const handleDownload = async (format: 'docx' | 'pdf') => {
    if (!selectedLetterhead || !content.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please select a letterhead and enter content',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch('/api/letterheads/generate-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          letterheadId: selectedLetterhead.id,
          content: content,
          format: format,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate document');
      }

      // Get the blob and download it
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `letter.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Success!',
        description: `Letter downloaded as ${format.toUpperCase()}`,
      });

    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: 'Download failed',
        description: 'Failed to generate document',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Cleanup PDF preview URL on unmount
  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
  }, [pdfPreviewUrl]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Letter Editor</h2>
          <p className="text-muted-foreground">
            {selectedLetterhead
              ? `Using: ${selectedLetterhead.name}`
              : 'Select a letterhead to start writing'
            }
          </p>
        </div>

        {selectedLetterhead && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleDownload('docx')}
              disabled={isGenerating || !content.trim()}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Word
            </Button>
            <Button
              onClick={() => handleDownload('pdf')}
              disabled={isGenerating || !content.trim()}
            >
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        )}
      </div>

      {/* Preview Mode Controls */}
      {selectedLetterhead && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Preview Mode</h3>
                <p className="text-sm text-muted-foreground">
                  Choose how to display the letterhead background
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant={previewMode === 'image' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPreviewMode('image')}
                  disabled={!selectedLetterhead.preview_image_url}
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Image Preview
                </Button>

                <Button
                  variant={previewMode === 'pdf' ? 'default' : 'outline'}
                  size="sm"
                  onClick={generatePdfPreview}
                  disabled={isGenerating}
                >
                  <File className="h-4 w-4 mr-2" />
                  PDF Preview
                  {isGenerating && (
                    <div className="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                </Button>

                <Button
                  variant={previewMode === 'none' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPreviewMode('none')}
                >
                  No Background
                </Button>
              </div>
            </div>

            {/* Preview Status */}
            <div className="mt-4 flex gap-2">
              {selectedLetterhead.preview_image_url && (
                <Badge variant="secondary">
                  <ImageIcon className="h-3 w-3 mr-1" />
                  Image Available
                </Badge>
              )}
              {pdfPreviewUrl && (
                <Badge variant="secondary">
                  <File className="h-3 w-3 mr-1" />
                  PDF Generated
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Editor with Preview Background */}
      {selectedLetterhead ? (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div
              className="relative mx-auto"
              style={{
                width: '800px',
                height: '1050px',
                backgroundColor: '#f5f5f5'
              }}
            >
              {/* Preview Background */}
              {previewMode === 'image' && selectedLetterhead.preview_image_url && (
                <img
                  src={selectedLetterhead.preview_image_url}
                  alt="Letterhead Preview"
                  className="absolute inset-0 w-full h-full object-contain"
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {previewMode === 'pdf' && pdfPreviewUrl && (
                <iframe
                  src={pdfPreviewUrl}
                  className="absolute inset-0 w-full h-full border-0"
                  title="Letterhead PDF Preview"
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {previewMode === 'none' && (
                <div className="absolute inset-0 flex items-center justify-center bg-white">
                  <div className="text-center">
                    <FileText className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500">No background preview</p>
                    <p className="text-sm text-gray-400 mt-2">
                      Content will be positioned according to body box coordinates
                    </p>
                  </div>
                </div>
              )}

              {/* Fallback for missing previews */}
              {previewMode === 'image' && !selectedLetterhead.preview_image_url && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                  <div className="text-center">
                    <ImageIcon className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500">No image preview available</p>
                    <p className="text-sm text-gray-400 mt-2">
                      Generate a PDF preview or upload a letterhead with preview
                    </p>
                  </div>
                </div>
              )}

              {/* Content Editor Overlay */}
              <div ref={editorRef} style={editorStyle}>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Start typing your letter here..."
                  className="w-full h-full resize-none border-0 bg-transparent focus:ring-0 focus:ring-offset-0 p-0 text-base leading-relaxed"
                  style={{
                    fontFamily: '"Times New Roman", serif',
                    fontSize: '16px',
                    lineHeight: '1.5',
                    color: '#000000',
                    backgroundColor: 'transparent',
                  }}
                />
              </div>

              {/* Body Box Visualization (for debugging) */}
              {process.env.NODE_ENV === 'development' && (
                <div
                  className="absolute border-2 border-red-500 border-dashed pointer-events-none"
                  style={{
                    top: `${bodyBox.top}px`,
                    left: `${bodyBox.left}px`,
                    right: `${bodyBox.right}px`,
                    bottom: `${bodyBox.bottom}px`,
                  }}
                >
                  <div className="absolute -top-6 left-0 text-xs text-red-500 bg-white px-1">
                    Content Area ({bodyBox.top}, {bodyBox.left}, {bodyBox.right}, {bodyBox.bottom})
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        // No letterhead selected state
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Letterhead Selected
            </h3>
            <p className="text-gray-500 text-center max-w-md">
              Please select a letterhead from the letterheads page to start creating your letter.
              The letterhead preview will appear as the background for your content.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => window.open('/dashboard/letters/letterheads', '_blank')}
            >
              Manage Letterheads
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      {selectedLetterhead && (
        <Card>
          <CardContent className="pt-6">
            <h4 className="font-medium mb-3">How to use:</h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>• Choose preview mode: Image, PDF, or No Background</li>
              <li>• Type your letter content in the text area overlaid on the letterhead</li>
              <li>• The content will be positioned within the defined content area</li>
              <li>• Download as Word to get the merged document with your letterhead</li>
              <li>• Download as PDF for a ready-to-print version</li>
            </ul>

            {previewMode === 'pdf' && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>PDF Preview:</strong> Generated on-demand using the current content.
                  This shows exactly how the final PDF will look.
                </p>
              </div>
            )}

            {previewMode === 'image' && selectedLetterhead.preview_image_url && (
              <div className="mt-4 p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-green-800">
                  <strong>Image Preview:</strong> This is a static preview generated during upload.
                  The final document will use the original .docx file for perfect quality.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
