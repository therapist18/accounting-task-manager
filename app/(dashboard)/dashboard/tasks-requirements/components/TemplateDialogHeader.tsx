/**
 * TemplateDialogHeader - UI component for the dialog header
 * Displays document name, template selection, AI refine button, draft status, and completion stats
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Wand2, FileText, X, Loader2, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface TemplateDialogHeaderProps {
  documentName: string;
  onClose: () => void;
  isGenerating: boolean;
  refineAllFieldsWithAI: () => void;
  availableTemplates: any[];
  selectedTemplate: any;
  handleTemplateSelect: (templateId: string) => void;
  loadedDraft: any;
  isLoadingDraft: boolean;
  discardDraft: () => void;
  completionStats: { total: number; filled: number; percentage: number };
  showConflictBanner: boolean;
  dataConflicts: any[];
  setShowConflictBanner: (show: boolean) => void;
  refreshWithLiveData: () => void;
}

export const TemplateDialogHeader = ({
  documentName,
  onClose,
  isGenerating,
  refineAllFieldsWithAI,
  availableTemplates,
  selectedTemplate,
  handleTemplateSelect,
  loadedDraft,
  isLoadingDraft,
  discardDraft,
  completionStats,
  showConflictBanner,
  dataConflicts,
  setShowConflictBanner,
  refreshWithLiveData
}: TemplateDialogHeaderProps) => {
  return (
    <DialogHeader className="border-b border-slate-200/60 dark:border-slate-800/80 px-6 py-4 bg-white/50 backdrop-blur-md dark:bg-slate-950/50 relative z-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left Section: Document title & draft status */}
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-md shadow-blue-500/20 shrink-0">
            <Wand2 className="h-5 w-5 text-white" />
          </div>
          <div className="space-y-1 min-w-0">
            <DialogTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 truncate">
              {documentName}
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span>Auto-populate, refine fields, and generate files</span>
            </DialogDescription>

            {loadedDraft && (
              <div className="flex flex-wrap items-center gap-2 mt-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30 flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  <span>Draft Restored</span>
                </Badge>
                <span className="text-[10px] text-slate-400 font-medium">
                  Saved: {new Date(loadedDraft.created_at).toLocaleString()}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={discardDraft}
                  disabled={isLoadingDraft}
                  className="h-5 px-2 text-[10px] font-bold text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md transition-all gap-1 border border-transparent hover:border-red-200/50"
                >
                  <X className="h-2.5 w-2.5" />
                  Discard Draft
                </Button>
              </div>
            )}

            {isLoadingDraft && (
              <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400 font-medium animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                Loading draft from storage...
              </div>
            )}
          </div>
        </div>

        {/* Right Section: Action Controls */}
        <div className="flex items-center flex-wrap gap-2.5 self-end md:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={refineAllFieldsWithAI}
            disabled={isGenerating}
            className="h-9 px-4 border-purple-200 hover:border-purple-300 hover:bg-purple-50 text-purple-700 dark:border-purple-950 dark:hover:bg-purple-950/40 dark:text-purple-400 font-bold text-xs rounded-xl shadow-sm hover:shadow transition-all duration-200 gap-1.5"
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-purple-500 fill-purple-200 dark:fill-transparent" />
            )}
            AI Refine
          </Button>

          {availableTemplates.length > 1 && (
            <Select value={selectedTemplate?.id} onValueChange={handleTemplateSelect}>
              <SelectTrigger className="w-56 h-9 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold shadow-sm focus:ring-blue-500/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200/80 dark:border-slate-800">
                {availableTemplates.map((t: any) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs font-medium rounded-lg">{t.file_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose} 
            className="h-9 w-9 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-900 shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress Section */}
      <div className="mt-4 space-y-1.5 bg-slate-50/50 dark:bg-slate-900/30 p-2.5 px-3.5 rounded-xl border border-slate-100 dark:border-slate-900/50">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <span>Progress:</span>
            <span className="text-blue-600 dark:text-blue-400 font-extrabold">{completionStats.filled}/{completionStats.total} Fields</span>
            {loadedDraft && (
              <Badge variant="outline" className="text-[8px] font-black h-4 px-1.5 bg-amber-500/10 text-amber-600 border-amber-500/20">
                DRAFT
              </Badge>
            )}
          </span>
          <span className="font-extrabold text-slate-700 dark:text-slate-300">{completionStats.percentage}%</span>
        </div>
        <Progress
          value={completionStats.percentage}
          className={cn(
            "h-1.5 rounded-full overflow-hidden bg-slate-200/60 dark:bg-slate-800/80 shadow-inner",
            loadedDraft 
              ? "[&>div]:bg-gradient-to-r [&>div]:from-amber-400 [&>div]:to-orange-500" 
              : "[&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-indigo-600"
          )}
        />
      </div>

      {/* Conflict Warning card */}
      {showConflictBanner && dataConflicts.length > 0 && loadedDraft && (
        <div className="mt-3 p-4 bg-amber-50/50 border border-amber-200/80 rounded-xl shadow-sm dark:bg-amber-950/20 dark:border-amber-950/40 animate-in slide-in-from-top-2 duration-350">
          <div className="flex items-start gap-3.5">
            <div className="p-1.5 bg-amber-100 rounded-lg text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 shrink-0">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="flex-1 space-y-2">
              <div>
                <h4 className="text-xs font-black text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                  Data Updates Detected in Profile
                </h4>
                <p className="text-[11px] text-amber-700/90 dark:text-amber-400/90 leading-relaxed mt-0.5">
                  The client database was updated since this draft was saved. Choose whether to import updates or continue editing draft values:
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[140px] overflow-y-auto pr-1">
                {dataConflicts.slice(0, 4).map((conflict: any, idx: number) => (
                  <div key={idx} className="text-[10px] text-amber-800 dark:text-amber-400 font-mono bg-white/70 dark:bg-slate-900/60 p-2 rounded-lg border border-amber-200/40 dark:border-amber-950/30 flex flex-col justify-between">
                    <span className="font-bold text-amber-900 dark:text-amber-300 truncate mb-1">
                      {conflict.field.replace(/_/g, ' ')}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="line-through opacity-50 truncate max-w-[45%]">{String(conflict.draftValue || 'empty')}</span>
                      <span className="text-[9px] text-slate-400">→</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 truncate max-w-[45%]">{String(conflict.liveValue || 'empty')}</span>
                    </div>
                  </div>
                ))}
                {dataConflicts.length > 4 && (
                  <div className="text-[10px] text-amber-600 dark:text-amber-400 italic font-semibold p-1 col-span-2">
                    ...and {dataConflicts.length - 4} more field conflicts.
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="default"
                  onClick={refreshWithLiveData}
                  className="h-7 px-3 text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg gap-1.5 shadow-sm"
                >
                  <RefreshCw className="h-3 w-3 animate-spin-slow" />
                  Apply Database Updates
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowConflictBanner(false)}
                  className="h-7 px-3 text-[10px] font-bold text-amber-700 hover:bg-amber-100/50 border-amber-200 dark:text-amber-300 dark:border-amber-950 rounded-lg"
                >
                  Keep Draft Values
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DialogHeader>
  );
};
