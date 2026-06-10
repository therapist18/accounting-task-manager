// @ts-nocheck
"use client"

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Loader2, Zap, Database, FileText, Webhook, ChevronRight, AlertCircle,
  CheckCircle2, Edit3, X, Paperclip, ArrowUpDown, Filter, Check,
  List, ChevronDown, HelpCircle, Eye, Lock, Search, Settings, Calculator,
  Info, Terminal
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  principal: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  dependant: 'bg-sky-100 text-sky-700 border-sky-200',
  sponsor: 'bg-amber-100 text-amber-700 border-amber-200',
  director: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  company: 'bg-slate-100 text-slate-700 border-slate-200',
  understudy: 'bg-teal-100 text-teal-700 border-teal-200',
};

interface AutomationMappingDialogUIProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  setActiveTab: (v: string) => void;
  task?: any;
  taskId?: string;
  individualName: string;
  selectedAutomationId: string;
  setSelectedAutomationId: (id: string) => void;
  entityAutomationMappings: any[];
  selectedMapping: any;
  activeWebEntry: any;
  isLoading: boolean;
  isLoadingData: boolean;
  isAutomationRunning: boolean;
  isSavingScreenshot: boolean;
  automationProgress: any;
  automationJobId: string | null;
  logsEndRef: React.RefObject<HTMLDivElement>;
  getPrimaryTargetEntityId: () => string;
  getPrimaryEntityType: () => string;
  setCurrentIndividualId: (id: string) => void;
  savedScreenshotDoc: any;
  sortedFields: any[];
  processedFields: any[];
  sortMissingFirst: boolean;
  setSortMissingFirst: (v: boolean) => void;
  entitySort: 'asc' | 'desc' | null;
  setEntitySort: (v: any) => void;
  editingCell: any;
  editValue: string;
  setEditValue: (v: string) => void;
  expandedArrayFields: Set<string>;
  jobFields: Record<string, any>;
  requirementJobQuestions: any[];
  sourceData: Record<string, Record<string, any>>;
  getArrayFieldData: (field: any) => any[];
  toggleArrayFieldExpansion: (name: string) => void;
  getFieldValue: (id: string, entityId: string, sourceIdx?: number, extractionMode?: string) => any;
  startEditing: (...args: any[]) => void;
  saveEdit: (isDropdown?: boolean, opts?: any[]) => void;
  cancelEditing: () => void;
  documentFiles: any[];
  resolveTargetEntityId: (field: any) => any;
  handlePreviewDocument: (doc: any) => void;
  setPreviewingDocuments: (v: any) => void;
  setShowPreviewModal: (v: boolean) => void;
  showPreviewModal: boolean;
  previewingDocuments: any;
  getFileUrl: (path: string) => string;
  handleSaveEditedDocument: (doc: any, data: Record<string, any>) => Promise<void>;
  handlePreviewDataChange: (docId: string, field: string, value: any) => void;
  handleRunAutomation: () => void;
  stopAutomation: () => void;
}

export const AutomationMappingDialogUI = ({
  isOpen, onClose, activeTab, setActiveTab,
  task, taskId, individualName,
  selectedAutomationId, setSelectedAutomationId, entityAutomationMappings, selectedMapping, activeWebEntry,
  isLoading, isLoadingData, isAutomationRunning, isSavingScreenshot,
  automationProgress, automationJobId, logsEndRef,
  getPrimaryTargetEntityId, getPrimaryEntityType, setCurrentIndividualId, savedScreenshotDoc,
  sortedFields, processedFields, sortMissingFirst, setSortMissingFirst, entitySort, setEntitySort,
  editingCell, editValue, setEditValue, expandedArrayFields,
  jobFields, requirementJobQuestions, sourceData,
  getArrayFieldData, toggleArrayFieldExpansion, getFieldValue, startEditing, saveEdit, cancelEditing,
  documentFiles, resolveTargetEntityId, handlePreviewDocument, setPreviewingDocuments, setShowPreviewModal,
  showPreviewModal, previewingDocuments, getFileUrl, handleSaveEditedDocument, handlePreviewDataChange,
  handleRunAutomation, stopAutomation,
}: AutomationMappingDialogUIProps) => {

  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const missingCount = processedFields.filter(f => f.isMissing).length;
  const totalCount = processedFields.length;
  const filledCount = totalCount - missingCount;
  const readinessPct = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;

  const isDocumentsView = activeTab === 'documents';

  const displayFields = useMemo(() => {
    let fields = showMissingOnly ? sortedFields.filter(f => f.isMissing) : sortedFields;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      fields = fields.filter(f =>
        (f.efnsDisplayName || '').toLowerCase().includes(q) ||
        (f.variableName || '').toLowerCase().includes(q)
      );
    }
    return fields;
  }, [sortedFields, showMissingOnly, searchQuery]);

  // ── Data source label/icon per field ──────────────────────────────────────
  const renderDataSource = (field: any) => {
    if (field.fieldType === 'array') {
      return (
        <div className="flex items-center gap-1.5 text-blue-500">
          <List className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs">Array</span>
        </div>
      );
    }
    if (field.fieldType === 'document') {
      return (
        <div className="flex items-center gap-1.5 text-amber-500">
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs">Document</span>
        </div>
      );
    }
    if (field.fieldType === 'computed') {
      return (
        <div className="flex items-center gap-1.5 text-purple-500">
          <Calculator className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs">Computed</span>
        </div>
      );
    }
    if (field.isDefault) {
      return (
        <div className="flex items-center gap-1.5 text-slate-400">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs">Preset Default</span>
        </div>
      );
    }
    if (field.linkedMasterFields?.length > 0) {
      return (
        <div className="flex items-center gap-1.5 text-slate-500">
          <Database className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="text-xs">Master: {field.linkedMasterFields[0]}</span>
        </div>
      );
    }
    if (field.linkedJobQuestionIds?.length > 0) {
      return (
        <div className="flex items-center gap-1.5 text-violet-500">
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs">Job Question</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-slate-400">
        <Settings className="h-3.5 w-3.5 shrink-0" />
        <span className="text-xs">Direct Entry</span>
      </div>
    );
  };

  // ── Inline value cell with editing ──────────────────────────────────────
  const renderMappedValue = (field: any, fIdx: number) => {
    const isEditing = editingCell?.fieldId === field.variableName;
    const entityCategory = field.entityTypes?.includes('company') ? 'company' : 'individual';
    const mIds = field.linkedMasterFields || [];
    const qIds = field.linkedJobQuestionIds || [];

    // DOCUMENT
    if (field.fieldType === 'document') {
      const foundDoc = documentFiles.find(d => field.linkedKycDocuments?.includes(d.document_id) && String(d.owner_id) === String(field.targetId));
      return foundDoc ? (
        <div className="flex items-center gap-1.5 justify-end">
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Available</span>
          <Button size="sm" variant="ghost" onClick={() => handlePreviewDocument(foundDoc)} className="h-6 px-1.5 text-[10px] text-slate-500 hover:text-slate-700">
            <Eye className="h-3 w-3 mr-0.5" /> Preview
          </Button>
        </div>
      ) : (
        <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">Missing</span>
      );
    }

    // ARRAY — expand toggle
    if (field.fieldType === 'array') {
      const arrayData = getArrayFieldData(field);
      const isExpanded = expandedArrayFields.has(field.variableName);
      return (
        <button
          onClick={() => toggleArrayFieldExpansion(field.variableName)}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 ml-auto"
        >
          {arrayData.length} items
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      );
    }

    // EDITING
    if (isEditing) {
      let fieldOptions = null;
      if (mIds.length > 0) fieldOptions = jobFields[String(mIds[0])]?.options;
      const normalizedOptions = Array.isArray(fieldOptions)
        ? fieldOptions.map((opt: any) => typeof opt === 'string' ? { label: opt, value: opt } : opt)
        : [];
      const isDropdown = normalizedOptions.length > 0;

      return (
        <div className="flex items-center gap-1.5 justify-end">
          {isDropdown ? (
            <SearchableSelect value={editValue} onValueChange={setEditValue} options={normalizedOptions} placeholder="Select..." buttonClassName="h-7 text-xs border-indigo-300 w-36" />
          ) : (
            <Input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); }} className="h-7 text-xs w-36 border-indigo-300" />
          )}
          <Button size="icon" onClick={() => saveEdit(isDropdown, normalizedOptions)} className="h-6 w-6 bg-emerald-600 hover:bg-emerald-700 shrink-0"><Check className="h-3 w-3" /></Button>
          <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-6 w-6 text-red-500 shrink-0"><X className="h-3 w-3" /></Button>
        </div>
      );
    }

    const isValueMissing = field.isMissing;

    // DEFAULT (read-only)
    if (field.isDefault) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm text-slate-500 truncate max-w-[180px] block text-right cursor-default">{field.resolvedValue}</span>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">Preset — cannot be edited here</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    let persistenceSource: any = null;
    let editTargetId = field.targetId;
    if (mIds.length > 0) {
      const mDef = jobFields[String(mIds[0])];
      persistenceSource = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
    } else if (qIds.length > 0) {
      persistenceSource = { table: 'tm_tasks', path: `job_specific_answers ->> '${qIds[0]}'`, linking_variable: 'id' };
      editTargetId = taskId;
    }

    // MULTI-SOURCE popover
    if ((mIds.length + qIds.length) > 1) {
      return (
        <Popover>
          <PopoverTrigger asChild>
            <div className={cn(
              "text-sm flex items-center justify-end gap-1 px-2 py-1 rounded cursor-pointer hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors ml-auto",
              isValueMissing ? "text-slate-400 italic" : "text-slate-700"
            )}>
              <span className="truncate max-w-[180px]">{isValueMissing ? '—' : field.resolvedValue}</span>
              <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0 shadow-xl" align="end">
            <div className="p-2 bg-slate-50 border-b text-[10px] font-bold text-slate-500 uppercase tracking-wide">
              Linked Sources (Priority Order)
            </div>
            <div className="p-1 space-y-0.5">
              {mIds.map((mid, idx) => {
                const mDef = jobFields[String(mid)];
                const source = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
                const sourceVal = getFieldValue(String(mid), String(field.targetId));
                return (
                  <div key={`m-${mid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded group">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] font-bold text-blue-600 flex items-center gap-1"><Database className="h-2.5 w-2.5" /> DB Field {idx + 1}</span>
                      <span className="text-xs font-medium truncate text-slate-700">{mDef?.label}</span>
                      <span className="text-[10px] text-slate-400 italic truncate">{isValidValue(sourceVal) ? sourceVal : 'Empty'}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      onClick={() => source && startEditing(field.variableName, idx, source.table, source.path, isValidValue(sourceVal) ? sourceVal : '', field.targetId, source.linking_variable)}>
                      <Edit3 className="h-3 w-3 text-blue-500" />
                    </Button>
                  </div>
                );
              })}
              {qIds.map((qid, idx) => {
                const qDef = requirementJobQuestions.find(q => String(q.id) === String(qid));
                const sourceVal = getFieldValue(field.variableName, String(field.targetId));
                return (
                  <div key={`q-${qid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded group">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] font-bold text-violet-600 flex items-center gap-1"><HelpCircle className="h-2.5 w-2.5" /> Question</span>
                      <span className="text-xs font-medium truncate text-slate-700">{qDef?.label || qid}</span>
                      <span className="text-[10px] text-slate-400 italic truncate">{isValidValue(sourceVal) ? sourceVal : 'Empty'}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      onClick={() => startEditing(field.variableName, 99 + idx, 'tm_tasks', `job_specific_answers ->> '${qid}'`, isValidValue(sourceVal) ? sourceVal : '', taskId, 'id')}>
                      <Edit3 className="h-3 w-3 text-violet-500" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      );
    }

    // SINGLE SOURCE — click-to-edit
    return (
      <div
        className={cn(
          "text-sm flex items-center justify-end gap-1 px-2 py-1 rounded transition-colors group/val relative",
          persistenceSource ? "cursor-pointer hover:bg-slate-50 hover:border hover:border-slate-200 border border-transparent" : "cursor-default",
          isValueMissing ? "text-slate-300 italic" : "text-slate-700 font-medium"
        )}
        onClick={() => {
          if (!persistenceSource) return;
          startEditing(field.variableName, 0, persistenceSource.table, persistenceSource.path, isValueMissing ? '' : field.resolvedValue, String(editTargetId), persistenceSource.linking_variable || 'id');
        }}
      >
        <span className="truncate max-w-[180px]">{isValueMissing ? '—' : field.resolvedValue}</span>
        {persistenceSource && <Edit3 className="h-3 w-3 text-slate-400 opacity-0 group-hover/val:opacity-100 shrink-0" />}
      </div>
    );
  };

  // ── Documents section ───────────────────────────────────────────────────
  const renderDocumentsSection = () => {
    const normalDocFields = activeWebEntry?.fields?.filter((f: any) => f.fieldType === 'document') || [];
    const arrayDocFields = activeWebEntry?.fields?.filter((f: any) => f.fieldType === 'array')
      ?.flatMap((field: any) =>
        (field.arrayItems || [])
          .filter((colItem: any) => colItem.type === 'document')
          .map((colItem: any) => ({
            ...colItem,
            arrayFieldName: field.displayName || field.efnsDisplayName || field.variableName,
            arrayVariableName: field.variableName,
            isFromArray: true,
          }))
      ) || [];
    const allDocFields = [...normalDocFields, ...arrayDocFields];

    return (
      <div className="space-y-4">
        {savedScreenshotDoc && (
          <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">eTA Kenya Confirmation Screenshot</h4>
                  <p className="text-[10px] text-slate-500">{savedScreenshotDoc.file_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5">Saved</span>
                <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => {
                  setPreviewingDocuments({ document_display_name: 'eTA Kenya Confirmation Screenshot', documents: [savedScreenshotDoc], person_full_name: individualName || getPrimaryTargetEntityId(), requirementId: ETA_SCREENSHOT_DOCUMENT_ID });
                  setShowPreviewModal(true);
                }}>
                  <Eye className="h-3 w-3 mr-1" /> View
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {allDocFields.length === 0 && !savedScreenshotDoc && (
          <div className="p-12 text-center text-slate-400">No document assets configured.</div>
        )}
        <div className="grid grid-cols-2 gap-4">
          {allDocFields.map((req, idx) => {
            const targetId = resolveTargetEntityId(req);
            const foundDoc = documentFiles.find(d => req.linkedKycDocuments?.includes(d.document_id) && String(d.owner_id) === String(targetId));
            const displayName = req.isFromArray
              ? `${req.arrayFieldName} - ${req.displayName || req.name || req.variableName}`
              : req.displayName || req.efnsDisplayName || req.variableName;
            return (
              <Card key={idx} className={cn("overflow-hidden border transition-all", foundDoc ? "border-emerald-200 shadow-sm" : "border-red-200 bg-red-50/10")}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", foundDoc ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600")}><Paperclip className="h-4 w-4" /></div>
                    <div className="flex-1">
                      <h4 className="font-bold text-sm text-slate-900">{displayName}</h4>
                      <p className="text-[10px] text-slate-500">Target: {req.isFromArray ? `${req.arrayVariableName}.${req.variableName}` : req.variableName}</p>
                      {req.isFromArray && <p className="text-[9px] text-blue-600 font-medium">Array Item</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {foundDoc ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handlePreviewDocument(foundDoc)} className="h-8 px-2 text-xs">
                          <Eye className="h-3 w-3 mr-1" /> Preview
                        </Button>
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5">Available</span>
                      </>
                    ) : (
                      <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">Missing</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl bg-white rounded-xl">

          {/* ── HEADER ───────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-3 bg-[#1C1C2E] shrink-0 rounded-t-xl">
            <div className="flex items-center gap-3">
              {/* Logo mark */}
              <div className="h-8 w-8 bg-indigo-500 rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/30">
                <Zap className="h-4.5 w-4.5 text-white fill-white" style={{ height: '18px', width: '18px' }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold text-sm tracking-tight">Automation Engine</span>
                  <span className="text-[10px] bg-white/10 text-slate-400 px-1.5 py-0.5 rounded font-mono">v2.4.0</span>
                </div>
                <div className="text-slate-400 text-[11px] flex items-center gap-1.5 mt-0.5">
                  <span className="font-medium text-slate-300 uppercase tracking-wide text-[10px]">{individualName || task?.applicant_details?.name || 'Applicant'}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-400">Task #{task?.id}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-400">♦ {getPrimaryTargetEntityId() || '—'}</span>
                  {savedScreenshotDoc && (
                    <span className="flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-full text-emerald-300 text-[10px] ml-1">
                      <CheckCircle2 className="h-2.5 w-2.5" /> Screenshot Saved
                    </span>
                  )}
                  {isSavingScreenshot && (
                    <span className="flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-full text-slate-400 text-[10px] ml-1">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" /> Saving…
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <SearchableSelect
                value={selectedAutomationId}
                onValueChange={setSelectedAutomationId}
                options={entityAutomationMappings.map(m => ({ value: m.automationId, label: m.automation?.name || 'Unnamed Flow' }))}
                placeholder="Select Workflow"
                buttonClassName="w-[200px] bg-white/10 border-white/10 text-white h-8 text-sm hover:bg-white/15"
                emptyMessage="No workflows found"
              />
              <button
                onClick={onClose}
                className="text-slate-500 hover:text-slate-300 transition-colors rounded-lg p-1.5 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </div>
            <DialogTitle className="sr-only">
              Automation Engine — {task?.applicant_details?.name || individualName || 'Applicant'}
            </DialogTitle>
          </div>

          {/* ── BODY: sidebar + main ──────────────────────────────────────── */}
          <div className="flex-1 flex overflow-hidden bg-[#F8F9FC]">

            {/* SIDEBAR */}
            <div className="w-52 shrink-0 border-r border-slate-200/80 bg-white flex flex-col overflow-y-auto">

              {/* Readiness Score */}
              <div className="px-4 pt-5 pb-4 border-b border-slate-100">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Readiness Score</p>
                <div className="flex items-end justify-between mb-1.5">
                  <div>
                    <span className={cn("text-2xl font-bold tabular-nums", readinessPct === 100 ? "text-emerald-600" : "text-slate-800")}>{readinessPct}%</span>
                    <span className="text-xs text-slate-400 ml-1">Complete</span>
                  </div>
                  <span className="text-[10px] text-slate-400 pb-0.5">{filledCount}/{totalCount}</span>
                </div>
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700", readinessPct === 100 ? "bg-emerald-500" : "bg-indigo-500")}
                    style={{ width: `${readinessPct}%` }}
                  />
                </div>
              </div>

              {/* Navigation */}
              <div className="p-3">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">Navigation</p>
                <nav className="space-y-0.5">
                  <button
                    onClick={() => { setShowMissingOnly(false); if (isDocumentsView) setActiveTab('fields'); }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left",
                      !isDocumentsView && !showMissingOnly
                        ? "bg-indigo-50 text-indigo-700 font-semibold"
                        : "text-slate-500 hover:bg-slate-50 font-medium"
                    )}
                  >
                    <span>All Fields</span>
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded-md min-w-[22px] text-center",
                      !isDocumentsView && !showMissingOnly ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400"
                    )}>{totalCount}</span>
                  </button>

                  <button
                    onClick={() => { setShowMissingOnly(true); if (isDocumentsView) setActiveTab('fields'); }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left",
                      !isDocumentsView && showMissingOnly
                        ? "bg-red-50 text-red-700 font-semibold"
                        : "text-slate-500 hover:bg-slate-50 font-medium"
                    )}
                  >
                    <span>Missing Data</span>
                    {missingCount > 0 && (
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded-md min-w-[22px] text-center",
                        !isDocumentsView && showMissingOnly ? "bg-red-100 text-red-600" : "bg-red-50 text-red-400"
                      )}>{missingCount}</span>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveTab('documents')}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left",
                      isDocumentsView
                        ? "bg-indigo-50 text-indigo-700 font-semibold"
                        : "text-slate-500 hover:bg-slate-50 font-medium"
                    )}
                  >
                    <span>Documents</span>
                    {savedScreenshotDoc && <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block shrink-0" />}
                  </button>
                </nav>
              </div>

              {/* Divider */}
              <div className="mx-4 border-t border-slate-100 my-1" />

              {/* Show Console */}
              <div className="p-3">
                <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors font-medium">
                  <Terminal className="h-3.5 w-3.5 shrink-0" />
                  <span>Show Console</span>
                </button>
              </div>

              {/* Pro Tip */}
              <div className="p-3 mt-auto">
                <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3">
                  <div className="flex items-start gap-2">
                    <Info className="h-3.5 w-3.5 text-indigo-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-indigo-600 mb-1 uppercase tracking-wide">Pro Tip</p>
                      <p className="text-[10px] text-indigo-500/80 leading-relaxed">
                        Fields marked with <Lock className="inline h-2.5 w-2.5" /> are automation defaults and cannot be edited.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Automation progress banner */}
              {automationProgress && (
                <div className="px-5 py-3 bg-white border-b border-slate-200 shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("p-1.5 rounded-full", automationProgress.isRunning ? "bg-indigo-100" : automationProgress.error ? "bg-red-100" : "bg-emerald-100")}>
                        {automationProgress.isRunning ? <Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> : automationProgress.error ? <AlertCircle className="h-4 w-4 text-red-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{automationProgress.isRunning ? 'Automation in Progress' : automationProgress.error ? 'Automation Failed' : 'Automation Complete'}</p>
                        <p className="text-[10px] text-slate-400">{automationProgress.currentStep || 'Processing…'}</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-indigo-600">{automationProgress.progress}%</span>
                  </div>
                  <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-2">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", automationProgress.error ? "bg-red-500" : automationProgress.isRunning ? "bg-indigo-500" : "bg-emerald-500")}
                      style={{ width: `${automationProgress.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500">{automationProgress.message}</p>
                  {automationProgress.error && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">Error: {automationProgress.error}</div>
                  )}
                  {automationJobId && <p className="text-[10px] text-slate-400 mt-1">Job ID: {automationJobId}</p>}
                  {automationProgress.logs?.length > 0 && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-slate-200">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1C1C2E]">
                        <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider">Automation Logs</span>
                        <span className="text-[10px] text-slate-500">{automationProgress.logs.length} lines</span>
                      </div>
                      <ScrollArea className="h-40 bg-slate-950">
                        <div className="p-3 space-y-px font-mono">
                          {automationProgress.logs.map((log: any, i: number) => (
                            <div key={i} className={cn("text-[10px] leading-relaxed whitespace-pre-wrap break-all", log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-emerald-300')}>
                              <span className="text-slate-600 mr-2 select-none">{new Date(log.timestamp).toLocaleTimeString()}</span>
                              {log.message}
                            </div>
                          ))}
                          <div ref={logsEndRef} />
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              )}

              {!selectedAutomationId ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                    <Webhook className="h-8 w-8 text-slate-300" />
                  </div>
                  <p className="text-sm font-medium text-slate-400">Select a workflow to begin</p>
                  <p className="text-xs text-slate-300 mt-1">Use the dropdown in the header</p>
                </div>
              ) : isDocumentsView ? (
                <div className="flex-1 overflow-auto p-6">
                  {renderDocumentsSection()}
                </div>
              ) : (
                <>
                  {/* Search + Sort bar */}
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200/80 shrink-0">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      <input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search field or variable..."
                        className="w-full pl-9 pr-3 h-8 text-sm border border-slate-200 rounded-lg bg-slate-50/80 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 focus:bg-white placeholder:text-slate-400 transition-all"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] text-slate-400 font-medium mr-0.5">Sort by:</span>
                      <button
                        onClick={() => setEntitySort(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
                        className={cn(
                          "flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors",
                          entitySort ? "border-indigo-200 bg-indigo-50 text-indigo-600" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        Entity <ArrowUpDown className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setSortMissingFirst(!sortMissingFirst)}
                        className={cn(
                          "flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors",
                          sortMissingFirst ? "border-amber-200 bg-amber-50 text-amber-600" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        Status <Filter className="h-3 w-3" />
                      </button>
                      {isLoadingData && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 ml-1" />}
                    </div>
                  </div>

                  {/* Fields Table */}
                  {isLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                      <Loader2 className="h-7 w-7 animate-spin mb-2 text-indigo-400" />
                      <p className="text-sm">Loading configuration…</p>
                    </div>
                  ) : !activeWebEntry?.fields?.length ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">No fields configured for this automation.</div>
                  ) : (
                    <div className="flex-1 overflow-hidden bg-white">
                      <ScrollArea className="h-full">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-white">
                            <TableRow className="hover:bg-transparent border-b border-slate-200">
                              <TableHead className="w-10 px-3 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">#</TableHead>
                              <TableHead className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Field Details</TableHead>
                              <TableHead className="w-52 px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Entity Context</TableHead>
                              <TableHead className="w-44 px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data Source</TableHead>
                              <TableHead className="w-56 px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mapped Value</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {displayFields.map((field, fIdx) => {
                              const isEditing = editingCell?.fieldId === field.variableName;

                              // ── ARRAY parent row ──
                              if (field.fieldType === 'array') {
                                const arrayData = getArrayFieldData(field);
                                const isExpanded = expandedArrayFields.has(field.variableName);
                                const entityCategory = field.entityTypes?.includes('company') ? 'company' : 'individual';

                                return (
                                  <React.Fragment key={`arr-${fIdx}`}>
                                    <TableRow
                                      className="border-b border-slate-100 bg-blue-50/20 hover:bg-blue-50/40 cursor-pointer transition-colors"
                                      onClick={() => toggleArrayFieldExpansion(field.variableName)}
                                    >
                                      <TableCell className="px-3 py-3 text-center">
                                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 mx-auto text-blue-400" /> : <ChevronRight className="h-3.5 w-3.5 mx-auto text-slate-300" />}
                                      </TableCell>
                                      <TableCell className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                          <div className="p-1 bg-blue-100 rounded-md text-blue-500"><List className="h-3.5 w-3.5" /></div>
                                          <div>
                                            <p className="text-sm font-semibold text-slate-800">{field.efnsDisplayName || field.variableName}</p>
                                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{field.variableName}</p>
                                          </div>
                                        </div>
                                      </TableCell>
                                      <TableCell className="px-4 py-3">
                                        <div className="flex flex-wrap gap-1">
                                          {(field.entityTypes || []).map(type => (
                                            <span key={type} className={cn("text-[9px] px-2 py-0.5 rounded-full uppercase font-bold border tracking-wide", ENTITY_TYPE_COLORS[type] || 'bg-slate-100 text-slate-600 border-slate-200')}>{type}</span>
                                          ))}
                                        </div>
                                      </TableCell>
                                      <TableCell className="px-4 py-3">{renderDataSource(field)}</TableCell>
                                      <TableCell className="px-4 py-3 text-right">
                                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">{arrayData.length} items</span>
                                      </TableCell>
                                    </TableRow>

                                    {isExpanded && arrayData.map((row, rowIndex) =>
                                      (field.arrayItems || []).map((colItem, colIndex) => {
                                        const uniqueKey = `${field.variableName}-${rowIndex}-${colIndex}`;
                                        const isItemEditing = editingCell?.fieldId === uniqueKey;
                                        const rawValue = row[colItem.variableName];
                                        const isItemMissing = !isValidValue(rawValue);
                                        const masterFieldId = colItem.linkedMasterFields?.[0];
                                        const masterField = masterFieldId ? jobFields[String(masterFieldId)] : null;
                                        const fieldOptions = masterField?.options;
                                        const normalizedOptions = Array.isArray(fieldOptions) ? fieldOptions.map((opt: any) => typeof opt === 'string' ? { label: opt, value: opt } : opt) : [];
                                        const isDropdown = normalizedOptions.length > 0;
                                        const firstMasterId = colItem.linkedMasterFields?.[0];
                                        const firstQId = colItem.linkedJobQuestionIds?.[0];
                                        let arrayPersist: any = null;
                                        let arrayEditId = row.entityId;
                                        if (firstMasterId) {
                                          const mDef = jobFields[String(firstMasterId)];
                                          arrayPersist = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
                                        } else if (firstQId) {
                                          arrayPersist = { table: 'tm_tasks', path: `job_specific_answers ->> '${firstQId}'`, linking_variable: 'id' };
                                          arrayEditId = taskId;
                                        }

                                        return (
                                          <TableRow key={uniqueKey} className={cn("group border-b border-slate-100", isItemEditing ? "bg-indigo-50/30" : "hover:bg-slate-50/60")}>
                                            <TableCell className="px-3 py-2.5 text-center text-[10px] font-mono text-slate-300">{rowIndex + 1}.{colIndex + 1}</TableCell>
                                            <TableCell className="px-4 py-2.5">
                                              <div className="flex items-center gap-2 pl-5 relative">
                                                <div className="absolute left-2 top-0 bottom-0 w-px bg-blue-100" />
                                                <div className="absolute left-2 top-1/2 w-2.5 h-px bg-blue-200" />
                                                <span className="text-xs text-slate-600 font-medium">{colItem.displayName || colItem.variableName}</span>
                                              </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2.5">
                                              <div className="flex flex-wrap gap-1">
                                                {(colItem.entityTypes || field.entityTypes || []).map(type => (
                                                  <span key={type} className={cn("text-[9px] px-2 py-0.5 rounded-full uppercase font-bold border tracking-wide", ENTITY_TYPE_COLORS[type] || 'bg-slate-100 text-slate-600 border-slate-200')}>{type}</span>
                                                ))}
                                              </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2.5">
                                              <span className="text-[10px] text-slate-400 uppercase font-medium">{colItem.sourceLogic || 'priority'}</span>
                                            </TableCell>
                                            <TableCell className="px-4 py-2.5">
                                              {isItemEditing ? (
                                                <div className="flex items-center gap-1.5 justify-end">
                                                  {isDropdown ? (
                                                    <SearchableSelect value={editValue} onValueChange={setEditValue} options={normalizedOptions} placeholder="Select..." buttonClassName="h-7 text-xs border-indigo-300 w-36" />
                                                  ) : (
                                                    <Input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); }} className="h-7 text-xs w-32 border-indigo-300" />
                                                  )}
                                                  <Button size="icon" onClick={() => saveEdit(isDropdown, normalizedOptions)} className="h-6 w-6 bg-emerald-600 hover:bg-emerald-700 shrink-0"><Check className="h-3 w-3" /></Button>
                                                  <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-6 w-6 text-red-500 shrink-0"><X className="h-3 w-3" /></Button>
                                                </div>
                                              ) : (() => {
                                                const mIds2 = colItem.linkedMasterFields || [];
                                                const qIds2 = colItem.linkedJobQuestionIds || [];
                                                const totalSources = mIds2.length + qIds2.length;

                                                if (totalSources > 1) {
                                                  return (
                                                    <Popover>
                                                      <PopoverTrigger asChild>
                                                        <div className={cn("text-xs flex items-center justify-end gap-1 px-2 py-1 rounded cursor-pointer border border-dashed border-blue-200 hover:bg-blue-50/30 ml-auto", isItemMissing ? "text-slate-300 italic" : "text-slate-700 font-medium")}>
                                                          <span className="truncate max-w-[140px]">{isItemMissing ? '—' : rawValue}</span>
                                                          <ChevronDown className="h-3 w-3 text-blue-400 shrink-0" />
                                                        </div>
                                                      </PopoverTrigger>
                                                      <PopoverContent className="w-72 p-0 shadow-xl" align="end">
                                                        <div className="p-2 bg-slate-50 border-b text-[9px] font-bold text-slate-500 uppercase tracking-wide">Array Row Sources</div>
                                                        <div className="p-1 space-y-0.5">
                                                          {mIds2.map((mid, mIdx) => {
                                                            const mDef = jobFields[String(mid)];
                                                            const mSource = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
                                                            const val = getFieldValue(String(mid), String(row.entityId));
                                                            return (
                                                              <div key={`am-${mid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded group">
                                                                <div className="flex flex-col min-w-0">
                                                                  <span className="text-[9px] font-bold text-blue-600 flex items-center gap-1"><Database className="h-2.5 w-2.5" /> Source {mIdx + 1}</span>
                                                                  <span className="text-[11px] font-medium truncate text-slate-700">{mDef?.label}</span>
                                                                  <span className="text-[10px] text-slate-400 italic">{isValidValue(val) ? val : 'Empty'}</span>
                                                                </div>
                                                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                                                  onClick={() => mSource && startEditing(uniqueKey, mIdx, mSource.table, mSource.path, isValidValue(val) ? val : '', row.entityId, mSource.linking_variable)}>
                                                                  <Edit3 className="h-3 w-3 text-blue-500" />
                                                                </Button>
                                                              </div>
                                                            );
                                                          })}
                                                          {qIds2.map((qid, qIdx) => {
                                                            const qDef = requirementJobQuestions.find(q => String(q.id) === String(qid));
                                                            const answers = sourceData['tm_tasks']?.[String(taskId)]?.job_specific_answers || {};
                                                            const val = answers[String(qid)] ?? answers[Number(qid)];
                                                            return (
                                                              <div key={`aq-${qid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded group">
                                                                <div className="flex flex-col min-w-0">
                                                                  <span className="text-[9px] font-bold text-violet-600 flex items-center gap-1"><HelpCircle className="h-2.5 w-2.5" /> Question</span>
                                                                  <span className="text-[11px] font-medium truncate text-slate-700">{qDef?.label || qid}</span>
                                                                  <span className="text-[10px] text-slate-400 italic">{isValidValue(val) ? val : 'Empty'}</span>
                                                                </div>
                                                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                                                  onClick={() => startEditing(uniqueKey, 99 + qIdx, 'tm_tasks', `job_specific_answers ->> '${qid}'`, isValidValue(val) ? val : '', taskId, 'id')}>
                                                                  <Edit3 className="h-3 w-3 text-violet-500" />
                                                                </Button>
                                                              </div>
                                                            );
                                                          })}
                                                        </div>
                                                      </PopoverContent>
                                                    </Popover>
                                                  );
                                                }

                                                return (
                                                  <div
                                                    className={cn("text-xs flex items-center justify-end gap-1 px-2 py-1 rounded group/av transition-colors",
                                                      arrayPersist ? "cursor-pointer hover:bg-slate-50 border border-transparent hover:border-slate-200" : "cursor-default",
                                                      isItemMissing ? "text-slate-300 italic" : "text-slate-700 font-medium")}
                                                    onClick={() => { if (!arrayPersist) return; startEditing(uniqueKey, 0, arrayPersist.table, arrayPersist.path, isItemMissing ? '' : rawValue, String(arrayEditId), arrayPersist.linking_variable || 'id'); }}
                                                  >
                                                    <span className="truncate max-w-[140px]">{isItemMissing ? '—' : rawValue}</span>
                                                    {arrayPersist && <Edit3 className="h-3 w-3 text-slate-400 opacity-0 group-hover/av:opacity-100 shrink-0" />}
                                                  </div>
                                                );
                                              })()}
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })
                                    )}
                                  </React.Fragment>
                                );
                              }

                              // ── STANDARD / DOCUMENT / COMPUTED row ──
                              return (
                                <TableRow
                                  key={`row-${fIdx}`}
                                  className={cn(
                                    "border-b border-slate-100 transition-colors group",
                                    field.isDefault ? "bg-slate-50/50" : isEditing ? "bg-indigo-50/20" : "hover:bg-slate-50/60"
                                  )}
                                >
                                  <TableCell className="px-3 py-3.5 text-center">
                                    <span className="text-xs font-mono text-slate-300">{fIdx + 1}</span>
                                  </TableCell>

                                  <TableCell className="px-4 py-3.5">
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        {field.isDefault && <Lock className="h-3 w-3 text-slate-300 shrink-0" />}
                                        <span className={cn("text-sm font-semibold", field.isDefault ? "text-slate-400" : "text-slate-800")}>
                                          {field.efnsDisplayName || field.variableName}
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{field.variableName}</span>
                                    </div>
                                  </TableCell>

                                  <TableCell className="px-4 py-3.5">
                                    <div className="flex flex-wrap gap-1">
                                      {(field.entityTypes || []).map(type => (
                                        <span key={type} className={cn("text-[9px] px-2 py-0.5 rounded-full uppercase font-bold border tracking-wide", ENTITY_TYPE_COLORS[type] || 'bg-slate-100 text-slate-600 border-slate-200')}>
                                          {type}
                                        </span>
                                      ))}
                                      {(!field.entityTypes || field.entityTypes.length === 0) && (
                                        <span className="text-[10px] text-slate-300">—</span>
                                      )}
                                    </div>
                                  </TableCell>

                                  <TableCell className="px-4 py-3.5">{renderDataSource(field)}</TableCell>

                                  <TableCell className="px-4 py-3.5 text-right">{renderMappedValue(field, fIdx)}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── FOOTER ───────────────────────────────────────────────────── */}
          <div className="px-6 py-3.5 border-t border-slate-200 bg-white flex justify-between items-center shrink-0">
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Automation Ready</p>
              <p className="text-sm font-bold text-slate-800">{selectedMapping?.automation?.name || 'Select Workflow'}</p>
            </div>
            <div className="flex items-center gap-2.5">
              <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 px-5 h-9 text-sm">
                Cancel
              </Button>
              {isAutomationRunning && automationJobId && (
                <Button variant="destructive" onClick={stopAutomation} className="px-5 h-9">
                  <X className="mr-2 h-4 w-4" /> Stop
                </Button>
              )}
              <Button
                onClick={handleRunAutomation}
                disabled={isAutomationRunning || isSavingScreenshot}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 h-9 font-bold text-xs tracking-wide rounded-lg shadow-sm shadow-emerald-600/20 transition-all"
              >
                {(isAutomationRunning || isSavingScreenshot)
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Zap className="mr-2 h-4 w-4 fill-white" />
                }
                {isSavingScreenshot ? 'Saving Screenshot…' : 'Execute Automation'}
              </Button>
            </div>
          </div>

        </DialogContent>
      </Dialog>

      {/* ── DOCUMENT PREVIEW MODAL ───────────────────────────────────────── */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] flex flex-col p-0 overflow-hidden bg-slate-50 rounded-xl">
          {showPreviewModal && previewingDocuments && (
            <>
              <DialogHeader className="p-4 border-b bg-white shrink-0 relative">
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="absolute right-4 top-4 rounded-lg opacity-70 transition-opacity hover:opacity-100 p-1 hover:bg-slate-100"
                >
                  <X className="h-4 w-4 text-slate-600" />
                  <span className="sr-only">Close</span>
                </button>
                <div className="flex items-center justify-between pr-8">
                  <div>
                    <DialogTitle className="text-xl">
                      <div className="flex items-center gap-2 p-1">
                        <div className="bg-white p-2 rounded-lg border shadow-sm">
                          <FileText className="h-5 w-5 text-indigo-500" />
                        </div>
                        <p className="text-xl font-bold text-slate-800 line-clamp-1">{previewingDocuments?.document_display_name || 'Document'}</p>
                      </div>
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground pl-1">Target: {previewingDocuments?.person_full_name || 'Unknown'}</p>
                  </div>
                  <div className="text-sm font-medium bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full border border-indigo-100">
                    {previewingDocuments?.documents?.length || 0} File(s)
                  </div>
                </div>
                <DialogDescription className="sr-only">Document extraction and verification interface.</DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-auto p-4">
                {previewingDocuments?.documents?.map((doc, index) => {
                  const docId = doc.id || `doc-${index}`;
                  return (
                    <div key={docId} className="p-0 lg:p-4">
                      <ExtractionPreview
                        key={docId}
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

              <div className="p-5 border-t bg-white flex justify-between items-center shrink-0">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Document Preview</p>
                  <p className="text-sm font-bold text-slate-800">{previewingDocuments?.document_display_name || 'Document'}</p>
                </div>
                <Button variant="outline" onClick={() => setShowPreviewModal(false)} className="px-6 text-slate-500 h-9 rounded-lg">
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};