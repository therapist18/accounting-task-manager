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
import { Wand2, FileText, X, Loader2, Sparkles } from "lucide-react";

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
    <DialogHeader>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500 rounded-lg">
            <Wand2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <DialogTitle className="text-xl font-bold">{documentName}</DialogTitle>
            <DialogDescription className="text-sm">Auto-populate and generate</DialogDescription>
            {loadedDraft && (
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="ml-2 text-[8px] bg-amber-50 text-amber-700 border-amber-200">
                  <FileText className="h-3 w-3" />
                  <span className="font-medium">Draft in Progress</span>
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Last saved {new Date(loadedDraft.created_at).toLocaleString()}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={discardDraft}
                  disabled={isLoadingDraft}
                  className="h-6 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="h-3 w-3 mr-1" />
                  Discard Draft
                </Button>
              </div>
            )}

            {isLoadingDraft && (
              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading draft...
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <Label>{documentName}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refineAllFieldsWithAI}
            disabled={isGenerating}
            className="border-purple-200 text-purple-700 hover:bg-purple-50"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            AI Refine
          </Button>
          {availableTemplates.length > 1 && (
            <Select value={selectedTemplate?.id} onValueChange={handleTemplateSelect}>
              <SelectTrigger className="w-64 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableTemplates.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.file_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">
            {completionStats.filled}/{completionStats.total} Fields
            {loadedDraft && (
              <Badge variant="outline" className="ml-2 text-[8px] bg-amber-50 text-amber-700 border-amber-200">
                DRAFT
              </Badge>
            )}
          </span>
          <span>{completionStats.percentage}%</span>
        </div>
        <Progress
          value={completionStats.percentage}
          className={`h-1.5 ${loadedDraft ? '[&>div]:bg-amber-500' : ''}`}
        />
      </div>
      {showConflictBanner && dataConflicts.length > 0 && loadedDraft && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-late-900 mb-1">
                ⚠️ Data Changes Detected
              </h4>
              <p className="text-xs text-amber-800 mb-2">
                The following fields have been updated in the database since this draft was saved:
              </p>
              <div className="space-y-1 mb-3">
                {dataConflicts.slice(0, 3).map((conflict: any, idx: number) => (
                  <div key={idx} className="text-xs text-amber-700 font-mono bg-white/50 p-2 rounded">
                    <span className="font-semibold">{conflict.field}:</span>{' '}
                    <span className="line-through opacity-60">{String(conflict.draftValue).substring(0, 30)}</span>
                    {' → '}
                    <span className="font-semibold text-green-700">{String(conflict.liveValue).substring(0, 30)}</span>
                  </div>
                ))}
                {dataConflicts.length > 3 && (
                  <div className="text-xs text-amber-600 italic">
                    ...and {dataConflicts.length - 3} more field{dataConflicts.length - 3 > 1 ? 's' : ''}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={refreshWithLiveData}
                  className="h-7 text-xs bg-amber-600 hover:bg-amber-700"
                >
                  <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.001 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh with Latest Data
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowConflictBanner(false)}
                  className="h-7 text-xs text-amber-700 hover:bg-amber-100"
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
