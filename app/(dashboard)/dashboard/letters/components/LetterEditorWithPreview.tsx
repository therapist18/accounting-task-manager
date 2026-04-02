'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Download, FileText, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/lib/hooks/use-toast';

interface LetterEditorWithPreviewProps {
  companyId?: string;
  selectedLetterhead?: {
    id: string;
    name: string;
    preview_image_url?: string;
    docx_url: string;
    body_box?: {
      top: number;
      left: number;
      right: number;
      bottom: number;
    };
  };
}

export function LetterEditorWithPreview({
  companyId,
  selectedLetterhead
}: LetterEditorWithPreviewProps) {
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const editorRef = useRef<HTMLDivElement>(null);

  // Add logging for component lifecycle
  console.log('📝 LetterEditorWithPreview rendered:', {
    companyId,
    selectedLetterhead: selectedLetterhead ? {
      id: selectedLetterhead.id,
      name: selectedLetterhead.name,
      hasPreview: !!selectedLetterhead.preview_image_url,
      previewUrl: selectedLetterhead.preview_image_url
    } : null,
    bodyBox: selectedLetterhead?.body_box
  });

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

  // Handle download
  const handleDownload = async (format: 'docx' | 'pdf') => {
    console.log('🔽 Download initiated:', { format, letterheadId: selectedLetterhead?.id, hasContent: !!content.trim() });

    if (!selectedLetterhead || !content.trim()) {
      console.log('❌ Download validation failed:', {
        hasLetterhead: !!selectedLetterhead,
        hasContent: !!content.trim()
      });

      toast({
        title: 'Missing information',
        description: 'Please select a letterhead and enter content',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    console.log('⏳ Starting document generation...');

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

      console.log('📡 API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ API Error:', errorData);
        throw new Error(errorData.error || 'Failed to generate document');
      }

      // Get the blob and download it
      const blob = await response.blob();
      console.log('📦 Blob received:', {
        size: blob.size,
        type: blob.type,
        format: format
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `letter.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log('✅ Download completed successfully');
      toast({
        title: 'Success!',
        description: `Letter downloaded as ${format.toUpperCase()}`,
      });

    } catch (error) {
      console.error('❌ Download failed:', error);
      toast({
        title: 'Download failed',
        description: 'Failed to generate document',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      console.log('🏁 Download process finished');
    }
  };

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
              {/* Preview Image Background */}
              {selectedLetterhead.preview_image_url ? (
                (() => {
                  console.log('🖼️ Rendering preview image:', {
                    url: selectedLetterhead.preview_image_url,
                    letterheadId: selectedLetterhead.id,
                    bodyBox: bodyBox
                  });
                  return (
                    <img
                      src={selectedLetterhead.preview_image_url}
                      alt="Letterhead Preview"
                      className="absolute inset-0 w-full h-full object-contain"
                      style={{ pointerEvents: 'none' }}
                      onLoad={() => console.log('✅ Preview image loaded successfully')}
                      onError={(e) => console.error('❌ Preview image failed to load:', e)}
                    />
                  );
                })()
              ) : (
                (() => {
                  console.log('⚠️ No preview image available:', {
                    letterheadId: selectedLetterhead?.id,
                    hasPreviewUrl: !!selectedLetterhead?.preview_image_url
                  });
                  return (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                      <div className="text-center">
                        <ImageIcon className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-500">No preview available</p>
                        <p className="text-sm text-gray-400 mt-2">
                          The letterhead will appear here
                        </p>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Content Editor Overlay */}
              <div ref={editorRef} style={editorStyle}>
                <Textarea
                  value={content}
                  onChange={(e) => {
                    const newContent = e.target.value;
                    console.log('✏️ Content changed:', {
                      length: newContent.length,
                      words: newContent.split(' ').filter(w => w).length,
                      lines: newContent.split('\n').length
                    });
                    setContent(newContent);
                  }}
                  onFocus={() => console.log('🎯 Editor focused')}
                  onBlur={() => console.log('🎯 Editor blurred')}
                  placeholder="Start typing your letter here..."
                  className="w-full h-full resize-none border-0 bg-transparent focus:ring-0 focus:ring-offset-0 p-0 text-base leading-relaxed"
                  style={{
                    fontFamily: '"Times New Roman", serif',
                    fontSize: '16px',
                    lineHeight: '1.5',
                    color: '#000000',
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
              <li>• Type your letter content in the text area overlaid on the letterhead</li>
              <li>• The content will be positioned within the defined content area</li>
              <li>• Download as Word to get the merged document with your letterhead</li>
              <li>• Download as PDF for a ready-to-print version</li>
            </ul>

            {selectedLetterhead.preview_image_url && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> This is a preview of your letterhead. The final document
                  will use the original .docx file for perfect quality.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
