/**
 * PreviewPanel - UI component for displaying live generated document preview
 * Shows the rendered template content with styling
 */

import React from 'react';
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
}

export const PreviewPanel = ({
  previewContent,
  isPreviewLoading,
  panelClasses,
  EDITOR_PREVIEW_STYLES,
  templateName,
  documentType
}: PreviewPanelProps) => {
  const hasContent = previewContent && previewContent.trim().length > 0;

  return (
    <div className={`${panelClasses} border-r relative bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden flex flex-col`}>
      {/* Enhanced Header */}
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
                    Live Preview
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
                <span className="text-xs font-medium text-emerald-700">Live</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Document Content Area */}
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto">
          {hasContent ? (
            <div className="relative">
              {/* Paper-like document container */}
              <div
                className={cn(
                  "bg-white shadow-2xl rounded-lg overflow-hidden",
                  "border border-slate-200",
                  "min-h-[11in] px-6 md:px-8 pt-0 pb-4",
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
              {/* Subtle paper texture overlay */}
              <div className="absolute inset-0 pointer-events-none rounded-lg opacity-[0.02] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjMDAwIi8+Cjwvc3ZnPg==')]" />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 px-6 bg-white rounded-lg border-2 border-dashed border-slate-200 shadow-sm">
              <div className="p-4 bg-slate-50 rounded-full mb-4">
                <Sparkles className="h-8 w-8 text-slate-400" />
              </div>
              <h4 className="text-sm font-medium text-slate-700 mb-1">No Preview Available</h4>
              <p className="text-xs text-slate-500 text-center max-w-xs">
                Fill in the form fields to generate a live preview of your document
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
