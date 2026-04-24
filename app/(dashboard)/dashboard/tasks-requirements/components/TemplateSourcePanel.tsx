/**
 * TemplateSourcePanel - UI component for displaying the original template reference
 * Shows either an iframe preview for Word documents or a placeholder for HTML templates
 */

import React from 'react';
import { FileText, Code } from 'lucide-react';

interface TemplateSourcePanelProps {
  panelClasses: string;
  isWordTemplate: boolean;
  docPreviewUrl: string | null;
  setDocPreviewUrl: (url: string | null) => void;
}

export const TemplateSourcePanel = ({ panelClasses, isWordTemplate, docPreviewUrl, setDocPreviewUrl }: TemplateSourcePanelProps) => {
  return (
    <div className={`${panelClasses} bg-slate-50 overflow-y-auto transition-all duration-300`}>
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur px-4 py-2 border-b flex justify-between">
        <span className="text-[10px] font-bold text-slate-500">ORIGINAL REFERENCE</span>
      </div>
      <div className="p-4">
        {isWordTemplate ? (
          docPreviewUrl ? (
            <iframe
              src={docPreviewUrl}
              className="w-full h-[calc(100vh-250px)] border-0 rounded shadow bg-white"
              title="Original"
              onError={() => setDocPreviewUrl(null)}
            />
          ) : (
            <div className="h-[300px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed rounded">
              <FileText className="h-12 w-12 mb-2" />
              <p className="text-xs">Preview unavailable</p>
            </div>
          )
        ) : (
          <div className="bg-white rounded border p-6">
            <Code className="h-8 w-8 text-blue-500 mb-3" />
            <h3 className="font-semibold text-sm mb-2">HTML Template Source</h3>
            <p className="text-xs text-slate-600 italic">This template is HTML based. Use the Live Preview to see the output.</p>
          </div>
        )}
      </div>
    </div>
  );
};
