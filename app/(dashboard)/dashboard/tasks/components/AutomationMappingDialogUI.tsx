// @ts-nocheck
"use client"

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Loader2, Zap, Database, FileText, Webhook, ChevronRight, AlertCircle,
  CheckCircle2, Edit3, X, Paperclip, ChevronDown, HelpCircle, Eye, Lock, 
  Search, Settings, Calculator, CornerDownRight, Play, Square, FileWarning,
  List
} from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isValidValue, ETA_SCREENSHOT_DOCUMENT_ID } from '../utils/AutomationMappingDialog';
import supabase from '@/lib/supabase/client';

const ENTITY_TYPE_COLORS: Record<string, string> = {
  principal: 'bg-indigo-50 text-indigo-700 border-indigo-200/50',
  dependant: 'bg-sky-50 text-sky-700 border-sky-200/50',
  sponsor: 'bg-amber-50 text-amber-700 border-amber-200/50',
  director: 'bg-emerald-50 text-emerald-700 border-emerald-200/50',
  company: 'bg-slate-100 text-slate-700 border-slate-200/50',
  understudy: 'bg-teal-50 text-teal-700 border-teal-200/50',
};

// --- Custom Circular Progress Ring ---
const CircularProgress = ({ value, className }: { value: number, className?: string }) => {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const isComplete = value === 100;

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <svg className="transform -rotate-90 w-10 h-10">
        <circle cx="20" cy="20" r={radius} stroke="currentColor" strokeWidth="3" fill="transparent" className="text-slate-100" />
        <circle cx="20" cy="20" r={radius} stroke="currentColor" strokeWidth="3" fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("transition-all duration-1000 ease-out", isComplete ? "text-emerald-500" : "text-indigo-600")}
        />
      </svg>
      <span className={cn("absolute text-[10px] font-bold", isComplete ? "text-emerald-600" : "text-indigo-700")}>
        {value}%
      </span>
    </div>
  );
};

interface AutomationMappingDialogUIProps {
  // ... (Keep existing props exactly the same)
  isOpen: boolean; onClose: () => void; activeTab: string; setActiveTab: (v: string) => void;
  task?: any; taskId?: string; individualName: string; selectedAutomationId: string;
  setSelectedAutomationId: (id: string) => void; entityAutomationMappings: any[]; selectedMapping: any; activeWebEntry: any;
  isLoading: boolean; isLoadingData: boolean; isAutomationRunning: boolean; isSavingScreenshot: boolean;
  automationProgress: any; automationJobId: string | null; logsEndRef: React.RefObject<HTMLDivElement>;
  getPrimaryTargetEntityId: () => string; getPrimaryEntityType: () => string; setCurrentIndividualId: (id: string) => void;
  savedScreenshotDoc: any; sortedFields: any[]; processedFields: any[]; sortMissingFirst: boolean; setSortMissingFirst: (v: boolean) => void;
  entitySort: 'asc' | 'desc' | null; setEntitySort: (v: any) => void; editingCell: any; editValue: string; setEditValue: (v: string) => void;
  expandedArrayFields: Set<string>; jobFields: Record<string, any>; requirementJobQuestions: any[]; sourceData: Record<string, Record<string, any>>;
  getArrayFieldData: (field: any) => any[]; toggleArrayFieldExpansion: (name: string) => void; getFieldValue: (id: string, entityId: string, sourceIdx?: number, extractionMode?: string) => any;
  startEditing: (...args: any[]) => void; saveEdit: (isDropdown?: boolean, opts?: any[]) => void; cancelEditing: () => void; documentFiles: any[];
  resolveTargetEntityId: (field: any) => any; handlePreviewDocument: (doc: any) => void; setPreviewingDocuments: (v: any) => void;
  setShowPreviewModal: (v: boolean) => void; showPreviewModal: boolean; previewingDocuments: any; getFileUrl: (path: string) => string;
  handleSaveEditedDocument: (doc: any, data: Record<string, any>) => Promise<void>; handlePreviewDataChange: (docId: string, field: string, value: any) => void;
  handleRunAutomation: () => void; stopAutomation: () => void;
}

export const AutomationMappingDialogUI = ({
  isOpen, onClose, activeTab, setActiveTab, task, taskId, individualName, selectedAutomationId, setSelectedAutomationId,
  entityAutomationMappings, selectedMapping, activeWebEntry, isLoading, isLoadingData, isAutomationRunning, isSavingScreenshot,
  automationProgress, automationJobId, logsEndRef, getPrimaryTargetEntityId, savedScreenshotDoc, sortedFields, processedFields,
  sortMissingFirst, setSortMissingFirst, editingCell, editValue, setEditValue, expandedArrayFields, jobFields, requirementJobQuestions, sourceData,
  getArrayFieldData, toggleArrayFieldExpansion, getFieldValue, startEditing, saveEdit, cancelEditing, documentFiles,
  resolveTargetEntityId, handlePreviewDocument, setPreviewingDocuments, setShowPreviewModal, showPreviewModal, previewingDocuments, getFileUrl,
  handleSaveEditedDocument, handlePreviewDataChange, handleRunAutomation, stopAutomation,
}: AutomationMappingDialogUIProps) => {

  const [searchQuery, setSearchQuery] = useState('');

  const missingCount = processedFields.filter(f => f.isMissing).length;
  const totalCount = processedFields.length;
  const readinessPct = totalCount > 0 ? Math.round(((totalCount - missingCount) / totalCount) * 100) : 0;
  const isDocumentsView = activeTab === 'documents';
  const showMissingOnly = activeTab === 'missing';

  const displayFields = useMemo(() => {
    let fields = showMissingOnly ? sortedFields.filter(f => f.isMissing) : sortedFields;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      fields = fields.filter(f => (f.efnsDisplayName || '').toLowerCase().includes(q) || (f.variableName || '').toLowerCase().includes(q));
    }
    return fields;
  }, [sortedFields, showMissingOnly, searchQuery]);

  const renderDataSource = (field: any) => {
    if (field.fieldType === 'array') return <Badge variant="outline" className="bg-blue-50/50 text-blue-600 border-blue-200"><List className="h-3 w-3 mr-1" /> Array</Badge>;
    if (field.fieldType === 'document') return <Badge variant="outline" className="bg-amber-50/50 text-amber-600 border-amber-200"><Paperclip className="h-3 w-3 mr-1" /> Document</Badge>;
    if (field.fieldType === 'computed') return <Badge variant="outline" className="bg-purple-50/50 text-purple-600 border-purple-200"><Calculator className="h-3 w-3 mr-1" /> Computed</Badge>;
    if (field.isDefault) return <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200"><Lock className="h-3 w-3 mr-1" /> Preset</Badge>;
    if (field.linkedMasterFields?.length > 0) return <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200"><Database className="h-3 w-3 mr-1 text-slate-400" /> System DB</Badge>;
    if (field.linkedJobQuestionIds?.length > 0) return <Badge variant="outline" className="bg-violet-50/50 text-violet-600 border-violet-200"><HelpCircle className="h-3 w-3 mr-1" /> Questionnaire</Badge>;
    return <Badge variant="outline" className="bg-slate-50 text-slate-400 border-slate-200"><Settings className="h-3 w-3 mr-1" /> Direct Entry</Badge>;
  };

  const renderMappedValue = (field: any, uniqueKey: string, persistenceSource: any, isValueMissing: boolean, editTargetId: string, customRawValue?: any, options?: any) => {
    const isEditing = editingCell?.fieldId === uniqueKey;
    const rawValue = customRawValue !== undefined ? customRawValue : field.resolvedValue;

    if (isEditing) {
      const isDropdown = options && options.length > 0;
      return (
        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end animate-in fade-in zoom-in-95 duration-200">
          {isDropdown ? (
            <SearchableSelect value={editValue} onValueChange={setEditValue} options={options} placeholder="Select value..." buttonClassName="h-8 text-sm border-indigo-500 ring-2 ring-indigo-500/20 w-full max-w-[200px]" />
          ) : (
            <Input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); }} className="h-8 text-sm w-full max-w-[200px] border-indigo-500 ring-2 ring-indigo-500/20 bg-white" placeholder="Enter value..." />
          )}
          <Button size="icon" onClick={() => saveEdit(isDropdown, options)} className="h-8 w-8 bg-indigo-600 hover:bg-indigo-700 shrink-0 shadow-sm"><CheckCircle2 className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 shrink-0"><X className="h-4 w-4" /></Button>
        </div>
      );
    }

    if (field.isDefault) {
      return (
        <TooltipProvider><Tooltip><TooltipTrigger asChild>
          <div className="text-sm text-slate-500 font-mono bg-slate-50 px-2 py-1 rounded border border-slate-100 cursor-default truncate max-w-[220px]">
            {rawValue}
          </div>
        </TooltipTrigger><TooltipContent className="text-xs">System preset. Cannot be changed.</TooltipContent></Tooltip></TooltipProvider>
      );
    }

    return (
      <div
        className={cn(
          "group/val relative flex items-center justify-between gap-2 px-3 py-1.5 rounded-md transition-all border max-w-[260px] w-full",
          persistenceSource ? "cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 hover:shadow-sm" : "cursor-default border-transparent",
          isValueMissing ? "border-red-200 bg-red-50/30 text-red-600" : "border-transparent hover:border-slate-200 bg-slate-50/50 text-slate-800"
        )}
        onClick={() => {
          if (!persistenceSource) return;
          startEditing(uniqueKey, 0, persistenceSource.table, persistenceSource.path, isValueMissing ? '' : rawValue, String(editTargetId), persistenceSource.linking_variable || 'id');
        }}
      >
        <span className={cn("truncate text-sm font-medium", isValueMissing && "italic opacity-80")}>
          {isValueMissing ? 'Action Required' : rawValue}
        </span>
        {persistenceSource && (
          <div className={cn("shrink-0 rounded p-1 transition-opacity", isValueMissing ? "bg-red-100 text-red-600 opacity-100" : "opacity-0 group-hover/val:opacity-100 text-indigo-500 bg-indigo-100")}>
            <Edit3 className="h-3 w-3" />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-[95vw] w-[1300px] h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl bg-[#FDFDFE] rounded-xl font-sans">

          {/* --- TOP HEADER --- */}
          <div className="bg-[#0B0F19] flex items-center justify-between px-6 py-4 shrink-0 text-white shadow-md relative z-20">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20 border border-white/10">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-base tracking-wide">Data Mapping Engine</h2>
                  <Badge variant="outline" className="bg-white/5 border-white/10 text-slate-300 text-[10px] px-1.5 h-4">v2.4</Badge>
                </div>
                <div className="text-slate-400 text-xs flex items-center gap-2 mt-0.5 font-medium">
                  <span className="text-indigo-300">{individualName || task?.applicant_details?.name || 'Applicant'}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-600" />
                  <span>Task #{task?.id}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              {/* Readiness Score */}
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full pr-4 pl-1 py-1">
                <CircularProgress value={readinessPct} />
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Readiness</span>
                  {/* <span className="text-sm font-medium leading-none mt-0.5">{filledCount} <span className="text-slate-500">/ {totalCount}</span></span> */}
                </div>
              </div>

              {/* Workflow Selector */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-medium hidden sm:inline-block">Workflow:</span>
                <SearchableSelect
                  value={selectedAutomationId}
                  onValueChange={setSelectedAutomationId}
                  options={entityAutomationMappings.map(m => ({ value: m.automationId, label: m.automation?.name || 'Unnamed Flow' }))}
                  placeholder="Select a workflow..."
                  buttonClassName="w-[240px] bg-white/10 border-white/15 text-white h-9 text-sm hover:bg-white/20 focus:ring-offset-[#0B0F19]"
                />
              </div>

              <div className="w-px h-6 bg-white/10 mx-1" />
              <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors rounded-full p-2 hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <DialogTitle className="sr-only">Data Mapping Engine</DialogTitle>
          </div>

          {/* --- MAIN LAYOUT --- */}
          <div className="flex-1 flex flex-col overflow-hidden relative bg-[#F4F5F8]">
            
            {/* TOOLBAR: Tabs & Search */}
            <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0 shadow-sm relative z-10">
              <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-lg border border-slate-200/50">
                <button onClick={() => setActiveTab('fields')} className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2", activeTab === 'fields' ? "bg-white text-indigo-700 shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50")}>
                  All Data <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-none px-1.5 font-mono">{totalCount}</Badge>
                </button>
                <button onClick={() => setActiveTab('missing')} className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2", activeTab === 'missing' ? "bg-white text-rose-600 shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50")}>
                  Action Needed 
                  {missingCount > 0 && <Badge variant="destructive" className="bg-rose-500 px-1.5 shadow-sm">{missingCount}</Badge>}
                </button>
                <button onClick={() => setActiveTab('documents')} className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2", activeTab === 'documents' ? "bg-white text-indigo-700 shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50")}>
                  Documents
                  {savedScreenshotDoc && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                </button>
              </div>

              {!isDocumentsView && (
                <div className="flex items-center gap-3">
                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search variables..."
                      className="w-64 pl-9 pr-3 h-9 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white placeholder:text-slate-400 transition-all shadow-sm"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSortMissingFirst(!sortMissingFirst)} className={cn("h-9 border-slate-200", sortMissingFirst && "bg-indigo-50 text-indigo-700 border-indigo-200")}>
                    <FileWarning className="h-4 w-4 mr-2" /> Prioritize Missing
                  </Button>
                </div>
              )}
            </div>

            {/* AUTOMATION PROGRESS BANNER */}
            {automationProgress && (
              <div className="bg-slate-900 text-slate-300 px-6 py-4 shrink-0 shadow-inner border-b border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", automationProgress.isRunning ? "bg-indigo-500/20 text-indigo-400" : automationProgress.error ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400")}>
                      {automationProgress.isRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : automationProgress.error ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{automationProgress.isRunning ? 'Executing Workflow...' : automationProgress.error ? 'Execution Failed' : 'Execution Complete'}</h3>
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">{automationProgress.currentStep || 'Initializing...'}</p>
                    </div>
                  </div>
                  <span className="text-2xl font-light text-white tabular-nums">{automationProgress.progress}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-3">
                  <div className={cn("h-full rounded-full transition-all duration-500", automationProgress.error ? "bg-rose-500" : automationProgress.isRunning ? "bg-indigo-500" : "bg-emerald-500")} style={{ width: `${automationProgress.progress}%` }} />
                </div>
                {automationProgress.logs?.length > 0 && (
                  <div className="bg-black/50 border border-white/10 rounded-lg p-3 font-mono text-[11px] h-32 overflow-y-auto custom-scrollbar">
                    {automationProgress.logs.map((log: any, i: number) => (
                      <div key={i} className={cn("leading-relaxed whitespace-pre-wrap break-all mb-1", log.level === 'error' ? 'text-rose-400' : log.level === 'warn' ? 'text-amber-400' : 'text-emerald-300/90')}>
                        <span className="text-slate-600 mr-3 select-none">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        {log.message}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </div>
            )}

            {/* CONTENT AREA */}
            <ScrollArea className="flex-1 px-6 py-6 h-full">
              {!selectedAutomationId ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="h-20 w-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6 shadow-inner border border-indigo-100">
                    <Webhook className="h-10 w-10 text-indigo-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800">No Workflow Selected</h3>
                  <p className="text-slate-500 max-w-sm mt-2 text-sm">Please select an automation workflow from the dropdown menu above to begin mapping data.</p>
                </div>
              ) : isLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-4" />
                  <p className="text-slate-500 font-medium">Loading configuration mapping...</p>
                </div>
              ) : isDocumentsView ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
                   {/* Documents Logic Restyled */}
                   {(() => {
                      const docs = activeWebEntry?.fields?.filter((f: any) => f.fieldType === 'document') || [];
                      const arrayDocs = activeWebEntry?.fields?.filter((f: any) => f.fieldType === 'array')?.flatMap((field: any) => (field.arrayItems || []).filter((ci: any) => ci.type === 'document').map((ci: any) => ({ ...ci, arrayFieldName: field.efnsDisplayName || field.variableName, isFromArray: true }))) || [];
                      const all = [...docs, ...arrayDocs];
                      
                      if(all.length === 0 && !savedScreenshotDoc) return <div className="col-span-full py-12 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">No documents required for this workflow.</div>;

                      return (
                        <>
                          {savedScreenshotDoc && (
                            <Card className="border-emerald-200 bg-emerald-50/50 shadow-sm hover:shadow transition-all group">
                              <CardContent className="p-5 flex flex-col h-full justify-between gap-4">
                                <div className="flex items-start justify-between">
                                  <div className="p-2.5 rounded-lg bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div>
                                  <Badge variant="outline" className="bg-emerald-100/50 text-emerald-700 border-emerald-200">Saved</Badge>
                                </div>
                                <div>
                                  <h4 className="font-semibold text-slate-900 text-sm leading-tight mb-1">eTA Confirmation</h4>
                                  <p className="text-xs text-slate-500 truncate" title={savedScreenshotDoc.file_name}>{savedScreenshotDoc.file_name}</p>
                                </div>
                                <Button variant="outline" className="w-full bg-white hover:bg-emerald-50 hover:text-emerald-700 border-emerald-200 transition-colors" onClick={() => {
                                  setPreviewingDocuments({ document_display_name: 'eTA Screenshot', documents: [savedScreenshotDoc], person_full_name: individualName });
                                  setShowPreviewModal(true);
                                }}><Eye className="h-4 w-4 mr-2" /> View Screenshot</Button>
                              </CardContent>
                            </Card>
                          )}
                          {all.map((req, idx) => {
                            const targetId = resolveTargetEntityId(req);
                            const foundDoc = documentFiles.find(d => req.linkedKycDocuments?.includes(d.document_id) && String(d.owner_id) === String(targetId));
                            const name = req.isFromArray ? `${req.arrayFieldName} — ${req.displayName || req.variableName}` : req.displayName || req.variableName;
                            
                            return (
                              <Card key={idx} className={cn("transition-all group", foundDoc ? "border-slate-200 hover:border-indigo-300 shadow-sm hover:shadow" : "border-rose-200 bg-rose-50/30")}>
                                <CardContent className="p-5 flex flex-col h-full justify-between gap-4">
                                  <div className="flex items-start justify-between">
                                    <div className={cn("p-2.5 rounded-lg", foundDoc ? "bg-indigo-50 text-indigo-600" : "bg-rose-100 text-rose-600")}><Paperclip className="h-5 w-5" /></div>
                                    {foundDoc ? <Badge variant="outline" className="bg-slate-50 text-slate-600">Available</Badge> : <Badge variant="destructive" className="bg-rose-500 shadow-sm">Missing</Badge>}
                                  </div>
                                  <div>
                                    <h4 className="font-semibold text-slate-900 text-sm leading-tight mb-1">{name}</h4>
                                    <p className="text-xs text-slate-400 font-mono truncate">{req.variableName}</p>
                                  </div>
                                  {foundDoc ? (
                                    <Button variant="outline" className="w-full bg-white hover:bg-indigo-50 hover:text-indigo-700 transition-colors" onClick={() => handlePreviewDocument(foundDoc)}><Eye className="h-4 w-4 mr-2" /> Preview File</Button>
                                  ) : (
                                    <Button variant="outline" disabled className="w-full border-rose-200 text-rose-400 bg-white/50">Upload Required</Button>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                        </>
                      );
                   })()}
                 </div>
              ) : (
                <div className="flex flex-col space-y-3 pb-10">
                  {/* List Header */}
                  <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 sticky top-0 bg-[#F4F5F8] z-10">
                    <div className="col-span-4">Data Point</div>
                    <div className="col-span-3">Context & Source</div>
                    <div className="col-span-5 text-right pr-2">Mapped Value</div>
                  </div>

                  {displayFields.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">No fields match your current filters.</div>
                  ) : (
                    displayFields.map((field, fIdx) => {
                      // ARRAY ROW
                      if (field.fieldType === 'array') {
                        const arrayData = getArrayFieldData(field);
                        const isExpanded = expandedArrayFields.has(field.variableName);
                        const entityCategory = field.entityTypes?.includes('company') ? 'company' : 'individual';

                        return (
                          <div key={field.variableName} className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-2">
                            {/* Parent Row */}
                            <div 
                              className="grid grid-cols-12 gap-4 p-4 items-center cursor-pointer hover:bg-blue-50/30 transition-colors"
                              onClick={() => toggleArrayFieldExpansion(field.variableName)}
                            >
                              <div className="col-span-4 flex items-center gap-3">
                                <div className={cn("p-1.5 rounded transition-colors", isExpanded ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400")}>
                                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">{field.efnsDisplayName || field.variableName}</p>
                                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{field.variableName}</p>
                                </div>
                              </div>
                              <div className="col-span-3 flex flex-col items-start gap-1.5">
                                <div className="flex flex-wrap gap-1">
                                  {(field.entityTypes || []).map((t: string) => <Badge key={t} variant="outline" className={cn("text-[9px] uppercase", ENTITY_TYPE_COLORS[t])}>{t}</Badge>)}
                                </div>
                                {renderDataSource(field)}
                              </div>
                              <div className="col-span-5 flex justify-end items-center">
                                <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border-blue-200">{arrayData.length} Entries</Badge>
                              </div>
                            </div>

                            {/* Children Rows */}
                            {isExpanded && (
                              <div className="bg-slate-50/50 border-t border-slate-100 relative">
                                <div className="absolute left-6 top-0 bottom-6 w-px bg-slate-200" />
                                {arrayData.map((row, rIdx) => 
                                  (field.arrayItems || []).map((colItem, cIdx) => {
                                    const uKey = `${field.variableName}-${rIdx}-${cIdx}`;
                                    const rawVal = row[colItem.variableName];
                                    const isMissing = !isValidValue(rawVal);
                                    
                                    // Persistence logic simplified for UI implementation
                                    let pSource: any = null;
                                    let editTargetId = row.entityId;
                                    const mDefId = colItem.linkedMasterFields?.[0];
                                    const qDefId = colItem.linkedJobQuestionIds?.[0];
                                    let opts = null;

                                    if (mDefId) {
                                      const mDef = jobFields[String(mDefId)];
                                      pSource = mDef?.sources?.find((s:any) => s.source_type === entityCategory) || mDef?.sources?.[0];
                                      opts = Array.isArray(mDef?.options) ? mDef.options.map((o:any) => typeof o === 'string' ? {label: o, value: o} : o) : [];
                                    } else if (qDefId) {
                                      pSource = { table: 'tm_tasks', path: `job_specific_answers ->> '${qDefId}'`, linking_variable: 'id' };
                                      editTargetId = taskId;
                                    }

                                    return (
                                      <div key={uKey} className="grid grid-cols-12 gap-4 px-4 py-3 items-center group/child hover:bg-white transition-colors relative ml-8 border-b border-slate-100 last:border-0">
                                        <div className="absolute left-[-24px] top-1/2 w-4 h-px bg-slate-200" />
                                        <div className="col-span-4 flex items-center gap-3 pl-2">
                                          <div className="bg-white border shadow-sm h-6 min-w-[24px] rounded text-[10px] font-bold text-slate-400 flex items-center justify-center font-mono">
                                            {rIdx + 1}.{cIdx + 1}
                                          </div>
                                          <span className="text-sm text-slate-700 font-medium">{colItem.displayName || colItem.variableName}</span>
                                        </div>
                                        <div className="col-span-3">
                                          <span className="text-xs text-slate-500 bg-slate-100/80 px-2 py-1 rounded border border-slate-200">{colItem.sourceLogic || 'priority'} mapping</span>
                                        </div>
                                        <div className="col-span-5 flex justify-end">
                                          {renderMappedValue(colItem, uKey, pSource, isMissing, editTargetId, rawVal, opts)}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }

                      // NORMAL ROW
                      const isMissing = field.isMissing;
                      const mIds = field.linkedMasterFields || [];
                      const qIds = field.linkedJobQuestionIds || [];
                      let pSource: any = null;
                      let editTargetId = field.targetId;
                      let opts = null;
                      
                      if (mIds.length > 0) {
                        const mDef = jobFields[String(mIds[0])];
                        pSource = mDef?.sources?.find((s:any) => s.source_type === (field.entityTypes?.includes('company') ? 'company' : 'individual')) || mDef?.sources?.[0];
                        opts = Array.isArray(mDef?.options) ? mDef.options.map((o:any) => typeof o === 'string' ? {label: o, value: o} : o) : [];
                      } else if (qIds.length > 0) {
                        pSource = { table: 'tm_tasks', path: `job_specific_answers ->> '${qIds[0]}'`, linking_variable: 'id' };
                        editTargetId = taskId;
                      }

                      return (
                        <div key={field.variableName} className={cn(
                          "grid grid-cols-12 gap-4 p-4 items-center bg-white rounded-xl border shadow-sm transition-all group",
                          isMissing ? "border-rose-200/60 ring-1 ring-inset ring-rose-50" : "border-slate-200 hover:border-indigo-200 hover:shadow"
                        )}>
                          <div className="col-span-4 flex items-start gap-3">
                            <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border", isMissing ? "bg-rose-50 border-rose-100 text-rose-500" : "bg-slate-50 border-slate-100 text-slate-400")}>
                              {field.isDefault ? <Lock className="h-4 w-4" /> : isMissing ? <FileWarning className="h-4 w-4" /> : <Database className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className={cn("text-sm font-semibold truncate", isMissing ? "text-rose-700" : "text-slate-800")}>{field.efnsDisplayName || field.variableName}</p>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{field.variableName}</p>
                            </div>
                          </div>
                          <div className="col-span-3 flex flex-col items-start gap-1.5">
                            <div className="flex flex-wrap gap-1">
                              {(field.entityTypes || []).map((t: string) => <Badge key={t} variant="outline" className={cn("text-[9px] uppercase", ENTITY_TYPE_COLORS[t])}>{t}</Badge>)}
                            </div>
                            {renderDataSource(field)}
                          </div>
                          <div className="col-span-5 flex justify-end items-center">
                            {field.fieldType === 'document' ? (
                              (() => {
                                const foundDoc = documentFiles.find(d => field.linkedKycDocuments?.includes(d.document_id) && String(d.owner_id) === String(field.targetId));
                                return foundDoc ? (
                                  <Button size="sm" variant="outline" onClick={() => handlePreviewDocument(foundDoc)} className="h-8 text-xs bg-slate-50 hover:bg-slate-100 border-slate-200"><Eye className="h-3 w-3 mr-1.5" /> Preview File</Button>
                                ) : (
                                  <Badge variant="destructive" className="bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 shadow-none"><AlertCircle className="h-3 w-3 mr-1" /> Missing</Badge>
                                );
                              })()
                            ) : (
                              renderMappedValue(field, field.variableName, pSource, isMissing, String(editTargetId), undefined, opts)
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* --- BOTTOM ACTION BAR --- */}
          <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-20">
            <div className="flex items-center gap-4">
              <div className={cn("px-3 py-1.5 rounded-lg border font-medium flex items-center gap-2 text-sm", readinessPct === 100 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700")}>
                {readinessPct === 100 ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {readinessPct === 100 ? "Data complete & ready" : `${missingCount} field${missingCount !== 1 ? 's' : ''} require attention`}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={onClose} className="text-slate-500 hover:bg-slate-100 font-medium px-6 h-10">
                Close
              </Button>
              {isAutomationRunning && automationJobId && (
                <Button variant="destructive" onClick={stopAutomation} className="h-10 px-6 font-semibold shadow-sm">
                  <Square className="mr-2 h-4 w-4 fill-current" /> Halt Execution
                </Button>
              )}
              <Button
                onClick={handleRunAutomation}
                disabled={isAutomationRunning || isSavingScreenshot || !selectedAutomationId}
                className={cn(
                  "h-10 px-8 font-semibold text-white shadow-md transition-all",
                  isAutomationRunning ? "bg-indigo-500 opacity-80" : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg hover:-translate-y-0.5"
                )}
              >
                {(isAutomationRunning || isSavingScreenshot) ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4 fill-white" />
                )}
                {isSavingScreenshot ? 'Saving Data...' : isAutomationRunning ? 'Running...' : 'Execute Automation'}
              </Button>
            </div>
          </div>

        </DialogContent>
      </Dialog>

      {/* --- DOCUMENT PREVIEW MODAL (Kept relatively the same but slightly restyled) --- */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] flex flex-col p-0 overflow-hidden bg-slate-50/95 backdrop-blur-sm rounded-xl border border-slate-200 shadow-2xl">
          {showPreviewModal && previewingDocuments && (
            <>
              <DialogHeader className="p-4 border-b bg-white shrink-0 shadow-sm relative">
                <div className="flex items-center justify-between pr-8">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-50 p-2.5 rounded-lg border border-indigo-100">
                      <FileText className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <DialogTitle className="text-lg font-bold text-slate-800 tracking-tight">
                        {previewingDocuments?.document_display_name || 'Document Verification'}
                      </DialogTitle>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">Assigned to: <span className="text-slate-700">{previewingDocuments?.person_full_name || 'Unknown Entity'}</span></p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-600 border border-slate-200 h-7 px-3">
                    {previewingDocuments?.documents?.length || 0} File(s) Attached
                  </Badge>
                </div>
                <button onClick={() => setShowPreviewModal(false)} className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                  <X className="h-5 w-5" />
                </button>
                <DialogDescription className="sr-only">Document review and data extraction</DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                {previewingDocuments?.documents?.map((doc, index) => {
                  const docId = doc.id || `doc-${index}`;
                  return (
                    <div key={docId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-4 last:mb-0">
                      <ExtractionPreview
                        documentName={previewingDocuments?.document_display_name || 'Document'}
                        extractedData={doc.edited_details || doc.extracted_details || {}}
                        fields={doc.document_fields || []}
                        fileUrl={getFileUrl(doc.file_path)}
                        fileName={doc.file_name || 'document.pdf'}
                        expanded={true}
                        showSaveButton={true}
                        onSave={(data) => handleSaveEditedDocument(doc, data)}
                        onDataChange={(fieldName, value) => handlePreviewDataChange(docId, fieldName, value)}
                        documentTypes={[]}
                        type={doc.director_id ? 'individual' : 'company'}
                        file={doc}
                        extractionStatus={doc.extraction_status || 'success'}
                        supabase={supabase}
                        onDialogClose={() => setShowPreviewModal(false)}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};