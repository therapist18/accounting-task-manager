/**
 * PreviewPanel - UI component for displaying live generated document preview
 * Shows the rendered template content with styling
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PreviewPanelProps {
  previewContent: string;
  isPreviewLoading: boolean;
  panelClasses: string;
  EDITOR_PREVIEW_STYLES: string;
}

export const PreviewPanel = ({ previewContent, isPreviewLoading, panelClasses, EDITOR_PREVIEW_STYLES }: PreviewPanelProps) => {
  return (
    <div className={`${panelClasses} border-r relative bg-slate-100 overflow-y-auto transition-all duration-300`}>
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur px-4 py-2 border-b flex justify-between">
        <span className="text-[10px] font-bold text-slate-500">LIVE GENERATED DOCUMENT</span>
        {isPreviewLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
      </div>
      <div className="max-w-4xl mx-auto">
        <div
          className={`bg-white shadow-xl min-h-[11in] ${EDITOR_PREVIEW_STYLES}`}
          style={{ whiteSpace: 'pre-wrap' }}
          dangerouslySetInnerHTML={{ __html: previewContent }}
        />
      </div>
    </div>
  );
};
