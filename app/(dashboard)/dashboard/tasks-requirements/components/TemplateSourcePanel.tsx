import React from 'react';
import { FileText, Code, Sparkles, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TemplateSourcePanelProps {
  panelClasses: string;
  isWordTemplate: boolean;
  docPreviewUrl: string | null;
  setDocPreviewUrl: (url: string | null) => void;
}

export const TemplateSourcePanel = ({ panelClasses, isWordTemplate, docPreviewUrl, setDocPreviewUrl }: TemplateSourcePanelProps) => {
  return (
    <div className={cn(panelClasses, "bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 overflow-hidden flex flex-col border-l border-slate-200 dark:border-slate-800")}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-sm">
                <FileText className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-slate-850 dark:text-slate-200">
                Original Reference
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {isWordTemplate ? (
          docPreviewUrl ? (
            <iframe
              src={docPreviewUrl}
              className="w-full h-[calc(100vh-250px)] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl bg-white"
              title="Original Template Reference"
              onError={() => setDocPreviewUrl(null)}
            />
          ) : (
            <div className="h-[350px] flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 border-2 border-dashed border-slate-200 dark:border-slate-850 rounded-xl bg-white/50 dark:bg-slate-900/20 p-6 shadow-inner">
              <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-full mb-4 shadow-sm">
                <EyeOff className="h-8 w-8 text-slate-400" />
              </div>
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Preview Unavailable</h4>
              <p className="text-[11px] text-slate-500 text-center max-w-[200px] leading-relaxed">
                The original Word template reference document could not be rendered inline.
              </p>
            </div>
          )
        ) : (
          <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-md transition-all hover:shadow-lg">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl w-fit mb-4">
              <Code className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-250 mb-2">HTML Template Source</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              This template uses HTML structure. Direct references are styled dynamically in real time.
            </p>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-900 rounded-lg text-[10px] text-slate-450 dark:text-slate-500 font-bold uppercase tracking-wider border border-slate-200/60 dark:border-slate-800/80">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              Editable fields mapped to DOM
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
