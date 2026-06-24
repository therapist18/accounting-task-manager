/**
 * PreviewPanel - displays live preview for HTML templates, or native docx-preview for Word templates
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { Loader2, FileText, Eye, Sparkles } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PreviewPanelProps {
  previewContent: string;
  isPreviewLoading: boolean;
  panelClasses: string;
  EDITOR_PREVIEW_STYLES: string;
  templateName?: string;
  documentType?: string;
  isWordTemplate?: boolean;
  docxBuffer?: ArrayBuffer | null;
}

export const PreviewPanel = ({
  previewContent,
  isPreviewLoading,
  panelClasses,
  EDITOR_PREVIEW_STYLES,
  templateName,
  documentType,
  isWordTemplate,
  docxBuffer,
}: PreviewPanelProps) => {
  const docxContainerRef = useRef<HTMLDivElement>(null);
  const hasHtmlContent = !isWordTemplate && previewContent && previewContent.trim().length > 0;

  useEffect(() => {
    if (!isWordTemplate || !docxBuffer || !docxContainerRef.current) return;

    let cancelled = false;

    import('docx-preview').then(({ renderAsync }) => {
      if (cancelled || !docxContainerRef.current) return;
      docxContainerRef.current.innerHTML = '';
      renderAsync(docxBuffer, docxContainerRef.current, undefined, {
        className: 'docx-preview',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        useBase64URL: true,
      }).catch((err) => {
        console.error('[PreviewPanel] docx-preview error:', err);
      });
    });

    return () => { cancelled = true; };
  }, [docxBuffer, isWordTemplate]);

  return (
    <div className={`${panelClasses} border-r relative bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden flex flex-col`}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-sm">
                  <FileText className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    {isWordTemplate ? 'Document Preview' : 'Live Preview'}
                    {isPreviewLoading && (
                      <span className="flex items-center gap-1.5 text-xs text-blue-600">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Generating</span>
                      </span>
                    )}
                  </h3>
                  {templateName && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">
                      {templateName}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {documentType && (
                <Badge variant="outline" className="text-xs font-medium bg-slate-50 border-slate-200">
                  {documentType}
                </Badge>
              )}
              <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 rounded-md border border-emerald-200">
                <Eye className="h-3 w-3 text-emerald-600" />
                <span className="text-xs font-medium text-emerald-700">
                  {isWordTemplate ? 'Doc' : 'Live'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {isWordTemplate ? (
        /* Native DOCX rendering via docx-preview */
        <div className="flex-1 overflow-auto bg-slate-100/80 dark:bg-slate-900/80 p-6 md:p-8 flex justify-center items-start">
          {docxBuffer ? (
            <div
              ref={docxContainerRef}
              className="docx-preview-container shadow-2xl rounded-xl border border-slate-200/50 dark:border-slate-800 bg-white max-w-[800px] w-full"
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 px-6 w-full">
              {isPreviewLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              ) : (
                <>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-full mb-4 shadow-inner">
                    <Sparkles className="h-8 w-8 text-slate-400" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 mb-1">No Document Preview</h4>
                  <p className="text-xs text-slate-500 text-center max-w-xs leading-relaxed">
                    Fill in the form fields to compile and render the Word document preview
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        /* HTML live preview */
        <ScrollArea className="flex-1 bg-slate-100/80 dark:bg-slate-900/80">
          <div className="max-w-4xl mx-auto p-6 md:p-8">
            {hasHtmlContent ? (
              <div className="relative">
                <div
                  className={cn(
                    "bg-white shadow-2xl rounded-xl overflow-hidden",
                    "border border-slate-200/60 dark:border-slate-800/60",
                    "min-h-[11in] px-8 md:px-12 pt-8 pb-8",
                    EDITOR_PREVIEW_STYLES
                  )}
                  style={{ whiteSpace: 'pre-wrap' }}
                  dangerouslySetInnerHTML={{ __html: previewContent }}
                  ref={(el) => {
                    if (el) {
                      const firstChild = el.firstElementChild;
                      if (firstChild) {
                        (firstChild as HTMLElement).style.marginTop = '0';
                        (firstChild as HTMLElement).style.paddingTop = '0';
                      }
                    }
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 px-6 bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-full mb-4 shadow-inner">
                  <Sparkles className="h-8 w-8 text-slate-400" />
                </div>
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 mb-1">No Preview Available</h4>
                <p className="text-xs text-slate-500 text-center max-w-xs leading-relaxed">
                  Fill in the form fields to generate a live preview of your HTML template
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};
