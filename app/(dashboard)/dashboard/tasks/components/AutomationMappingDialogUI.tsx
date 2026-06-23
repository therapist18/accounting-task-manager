// @ts-nocheck
"use client"

import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  Loader2, Zap, User, Database, FileText, Webhook, ChevronRight, AlertCircle,
  CheckCircle2, Edit3, X, Paperclip, ArrowUpDown, Filter, Check,
  List, ChevronDown, HelpCircle, Eye, Lock, Settings, Activity, Clock
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ExtractionPreview } from "@/components/ExtractionPreview";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isValidValue, ETA_SCREENSHOT_DOCUMENT_ID } from '../utils/AutomationMappingDialog';

// Refined colors to match the new aesthetic
const ENTITY_TYPE_COLORS: Record<string, string> = {
  principal: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  dependant: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  sponsor: 'bg-amber-50 text-amber-700 border-amber-200',
  director: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  company: 'bg-slate-100 text-slate-700 border-slate-200',
  understudy: 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

interface AutomationMappingDialogUIProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  isAutomationRunning: boolean;
  isLoadingData: boolean;
  isSavingScreenshot: boolean;
  task: any;
  taskId?: string;
  individualName: string;
  savedScreenshotDoc: any;
  selectedAutomationId: string;
  setSelectedAutomationId: (id: string) => void;
  entityAutomationMappings: any[];
  selectedMapping: any;
  activeWebEntry: any;
  automationProgress: any;
  automationJobId: string | null;
  logsEndRef: React.RefObject<HTMLDivElement>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  processedFields: any[];
  sortedFields: any[];
  sortMissingFirst: boolean;
  setSortMissingFirst: (val: boolean) => void;
  entitySort: 'asc' | 'desc' | null;
  setEntitySort: (updater: any) => void;
  editingCell: any;
  editValue: string;
  setEditValue: (val: string) => void;
  saveEdit: (isDropdown?: boolean, dropdownOptions?: { label: string; value: string }[]) => void;
  cancelEditing: () => void;
  startEditing: (fieldId: string, sourceIdx: number, table: string, path: string, val: string, entityId: string, linkingVariable: string, fieldType?: string, computedFunction?: string, masterFieldId?: string | number) => void;
  expandedArrayFields: Set<string>;
  toggleArrayFieldExpansion: (fieldVariableName: string) => void;
  jobFields: Record<string, any>;
  sourceData: Record<string, Record<string, any>>;
  requirementJobQuestions: any[];
  documentFiles: any[];
  computedFieldsPreview: Record<string, string>;
  getArrayFieldData: (field: any) => any[];
  getFieldValue: (fieldIdOrVariable: string, entityId: string, sourceIdx?: number, extractionMode?: string, preserveArray?: boolean) => any;
  resolveTargetEntityId: (field: any) => string | undefined;
  getFileUrl: (filePath: string) => string;
  handlePreviewDocument: (doc: any) => void;
  handleSaveEditedDocument: (doc: any, editedData: Record<string, any>) => Promise<void>;
  handlePreviewDataChange: (docId: string, fieldName: string, value: any) => void;
  getPrimaryTargetEntityId: () => string;
  getPrimaryEntityType: () => string;
  setCurrentIndividualId: (id: string) => void;
  stopAutomation: () => Promise<void>;
  handleRunAutomation: () => Promise<void>;
  showPreviewModal: boolean;
  setShowPreviewModal: (val: boolean) => void;
  previewingDocuments: any;
  setPreviewingDocuments: (val: any) => void;
  supabase: any; // Assuming passed for ExtractionPreview
}

export const AutomationMappingDialogUI = ({
  isOpen, onClose, isLoading, isAutomationRunning, isLoadingData, isSavingScreenshot,
  task, taskId, individualName, savedScreenshotDoc,
  selectedAutomationId, setSelectedAutomationId, entityAutomationMappings, selectedMapping, activeWebEntry,
  automationProgress, automationJobId, logsEndRef,
  activeTab, setActiveTab,
  processedFields, sortedFields, sortMissingFirst, setSortMissingFirst, entitySort, setEntitySort,
  editingCell, editValue, setEditValue, saveEdit, cancelEditing, startEditing,
  expandedArrayFields, toggleArrayFieldExpansion,
  jobFields, sourceData, requirementJobQuestions, documentFiles, computedFieldsPreview,
  getArrayFieldData, getFieldValue, resolveTargetEntityId, getFileUrl,
  handlePreviewDocument, handleSaveEditedDocument, handlePreviewDataChange,
  getPrimaryTargetEntityId, getPrimaryEntityType, setCurrentIndividualId,
  stopAutomation, handleRunAutomation,
  showPreviewModal, setShowPreviewModal, previewingDocuments, setPreviewingDocuments, supabase
}: AutomationMappingDialogUIProps) => {

  const renderFieldsTable = () => {
    if (!activeWebEntry?.fields || activeWebEntry.fields.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full opacity-50">
          <Database className="w-16 h-16 mb-4 text-slate-300" />
          <p className="text-lg font-bold text-slate-400">No fields configured for this automation.</p>
        </div>
      );
    }
    
    const entityGroupStats = (() => {
      const groups: Record<string, { total: number; filled: number; missing: number; defaultCount: number }> = {};
      processedFields.forEach(f => {
        const types = (f.entityTypes && f.entityTypes.length > 0) ? f.entityTypes : ['—'];
        const key = types.slice().sort().join(', ');
        if (!groups[key]) groups[key] = { total: 0, filled: 0, missing: 0, defaultCount: 0 };
        groups[key].total++;
        if (f.isDefault) { groups[key].defaultCount++; groups[key].filled++; }
        else if (!f.isMissing) groups[key].filled++;
        else groups[key].missing++;
      });
      return groups;
    })();
    let lastGroupKey = '__init__';

    return (
      <div className="flex flex-col h-full bg-white relative">
        {/* Stats Sub-Header */}
        <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap gap-3 bg-slate-50/60 sticky top-0 z-20">
          {Object.entries(entityGroupStats).map(([key, stats]) => {
            const pct = Math.round((stats.filled / stats.total) * 100);
            const allDone = stats.missing === 0;
            return (
              <div key={key} className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs shadow-sm",
                allDone ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"
              )}>
                <div className="flex flex-wrap gap-1">
                  {key.split(', ').map(t => (
                    <span key={t} className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded-md uppercase font-bold tracking-wider",
                      ENTITY_TYPE_COLORS[t] || 'bg-slate-100 text-slate-600 border border-slate-200'
                    )}>{t}</span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2 ml-1">
                  <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden inset-shadow-sm">
                    <div className={cn("h-full rounded-full transition-all", allDone ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={cn("font-bold text-[10px]", allDone ? "text-emerald-700" : "text-amber-700")}>{pct}%</span>
                </div>
                {stats.defaultCount > 0 && (
                  <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-0.5 ml-1">
                    <Lock className="h-3 w-3" />{stats.defaultCount}
                  </span>
                )}
              </div>
            );
          })}
          <div className="ml-auto flex items-center gap-4">
             <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
               <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
               {processedFields.filter(f => !f.isMissing).length}/{processedFields.length} Ready
             </div>
             {processedFields.filter(f => f.isMissing).length > 0 && (
               <div className="text-[11px] font-bold text-rose-500 flex items-center gap-1.5">
                 <span className="inline-block w-2 h-2 rounded-full bg-rose-500"></span>
                 {processedFields.filter(f => f.isMissing).length} Missing
               </div>
             )}
             <div className="h-4 w-px bg-slate-300 mx-1" />
            <Button
              variant={sortMissingFirst ? "default" : "outline"}
              size="sm"
              onClick={() => setSortMissingFirst(!sortMissingFirst)}
              className={cn(
                "h-7 text-[10px] font-bold uppercase tracking-wider px-3",
                sortMissingFirst ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"
              )}
            >
              <Filter className="h-3 w-3 mr-1.5" />
              {sortMissingFirst ? "Show All" : "Missing First"}
            </Button>
          </div>
        </div>

        {/* Table Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          <Table className="w-full border-collapse">
            <TableHeader className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm shadow-[0_1px_3px_rgba(0,0,0,0.05)] border-b border-slate-200">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 px-4 py-3 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-100">#</TableHead>
                <TableHead className="w-80 px-6 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-100">Target Variable</TableHead>
                <TableHead className="px-6 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-100">Source Logic</TableHead>
                <TableHead
                  className="w-48 px-6 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-100 cursor-pointer select-none hover:bg-slate-50 transition-colors group"
                  onClick={() => setEntitySort(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
                >
                  <div className="flex items-center justify-between">
                    Entities
                    <ArrowUpDown className={cn("h-3.5 w-3.5 shrink-0 transition-colors", entitySort ? "text-indigo-600" : "text-slate-300 group-hover:text-slate-400")} />
                  </div>
                </TableHead>
                <TableHead className="px-6 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Current Value</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-slate-100">
              {sortedFields.map((field, fIdx) => {
                const isEditing = editingCell?.fieldId === field.variableName;
                const entityCategory = field.entityTypes?.includes('company') ? 'company' : 'individual';

                const fieldGroupKey = (field.entityTypes && field.entityTypes.length > 0)
                  ? field.entityTypes.slice().sort().join(', ')
                  : '—';
                
                const showGroupHeader = !entitySort && fieldGroupKey !== lastGroupKey;
                if (showGroupHeader) lastGroupKey = fieldGroupKey;
                
                const groupFieldsTotal = showGroupHeader ? sortedFields.filter(f => {
                  const k = (f.entityTypes && f.entityTypes.length > 0) ? f.entityTypes.slice().sort().join(', ') : '—';
                  return k === fieldGroupKey;
                }).length : 0;
                
                const groupFieldsFilled = showGroupHeader ? sortedFields.filter(f => {
                  const k = (f.entityTypes && f.entityTypes.length > 0) ? f.entityTypes.slice().sort().join(', ') : '—';
                  return k === fieldGroupKey && !f.isMissing;
                }).length : 0;

                const groupHeaderRow = showGroupHeader ? (
                  <TableRow key={`group-${fieldGroupKey}-${fIdx}`} className="bg-indigo-50/40 hover:bg-indigo-50/40">
                    <TableCell colSpan={5} className="px-6 py-2 border-y border-indigo-100/50">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-[9px] font-black text-indigo-500 uppercase tracking-[0.15em]">
                          <Database className="w-3.5 h-3.5" /> {fieldGroupKey.replace(/, /g, ' & ')}
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                          {groupFieldsFilled}/{groupFieldsTotal} Complete
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null;

                // =========================================================
                // CASE: ARRAY FIELDS
                // =========================================================
                if (field.fieldType === 'array') {
                  const arrayData = getArrayFieldData(field);
                  const isExpanded = expandedArrayFields.has(field.variableName);

                  return (
                    <React.Fragment key={`field-${fIdx}`}>
                      {groupHeaderRow}
                      <TableRow
                        className={cn(
                           "transition-colors cursor-pointer group border-b border-slate-200",
                           isExpanded ? "bg-indigo-50/20 hover:bg-indigo-50/40" : "bg-white hover:bg-slate-50/50"
                        )}
                        onClick={() => toggleArrayFieldExpansion(field.variableName)}
                      >
                        <TableCell className="px-4 py-3.5 text-center text-[11px] font-bold text-slate-400 border-r border-slate-100">
                           {isExpanded ? <ChevronDown className="h-4 w-4 mx-auto text-indigo-500" /> : <ChevronRight className="h-4 w-4 mx-auto text-slate-400 group-hover:text-indigo-400 transition-colors" />}
                        </TableCell>
                        <TableCell colSpan={4} className="px-6 py-3.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="bg-indigo-100/80 p-1.5 rounded-md text-indigo-600 shadow-sm"><List className="h-3.5 w-3.5" /></div>
                              <span className="text-xs font-bold text-slate-900">{field.efnsDisplayName || field.variableName}</span>
                              <div className="flex flex-wrap gap-1 ml-2">
                                {(field.entityTypes || []).map(type => (
                                  <Badge key={type} variant="outline" className={cn("text-[9px] h-5 px-1.5 uppercase font-bold tracking-wider", ENTITY_TYPE_COLORS[type] || 'bg-slate-50 text-slate-600 border-slate-200')}>
                                    {type}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-200 font-bold text-[10px] px-2 shadow-sm">
                              {arrayData.length} Items
                            </Badge>
                          </div>
                        </TableCell>
                      </TableRow>

                      {isExpanded && arrayData.map((row, rowIndex) => (
                        (field.arrayItems || []).map((colItem, colIndex) => {
                          const uniqueKey = `${field.variableName}-${rowIndex}-${colIndex}`;
                          const isItemEditing = editingCell?.fieldId === uniqueKey;
                          const rawValue = row[colItem.variableName];
                          const isItemMissing = !isValidValue(rawValue);

                          const masterFieldId = colItem.linkedMasterFields?.[0];
                          const masterField = masterFieldId ? jobFields[String(masterFieldId)] : null;
                          const fieldOptions = masterField?.options;
                          const normalizedOptions = Array.isArray(fieldOptions)
                            ? fieldOptions.map((opt: any) => typeof opt === 'string' ? { label: opt, value: opt } : opt)
                            : [];
                          const isDropdown = normalizedOptions.length > 0;

                          const firstMasterId = colItem.linkedMasterFields?.[0];
                          const firstQId = colItem.linkedJobQuestionIds?.[0];
                          let arrayPersist = null;
                          let arrayEditId = row.entityId;

                          if (firstMasterId) {
                            const mDef = jobFields[String(firstMasterId)];
                            arrayPersist = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
                          } else if (firstQId) {
                            arrayPersist = { table: 'tm_tasks', path: `job_specific_answers ->> '${firstQId}'`, linking_variable: 'id' };
                            arrayEditId = taskId;
                          }

                          return (
                            <TableRow key={uniqueKey} className={cn("group border-b border-slate-100", isItemEditing ? "bg-indigo-50/50" : "bg-slate-50/30 hover:bg-slate-50")}>
                              <TableCell className="px-4 py-2 text-center text-[10px] font-mono font-semibold text-slate-400 border-r border-slate-100 relative">
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-100"></div>
                                {rowIndex + 1}.{colIndex + 1}
                              </TableCell>
                              <TableCell className="px-6 py-2 border-r border-slate-100 relative">
                                <div className="flex items-center gap-2 pl-4 relative">
                                  <div className="absolute left-0 top-1/2 w-3 h-px bg-indigo-200"></div>
                                  <span className="text-[11px] text-slate-700 font-semibold">{colItem.displayName || colItem.variableName}</span>
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-2 border-r border-slate-100">
                                <Badge variant="outline" className="text-[9px] h-5 uppercase font-bold tracking-wider text-slate-500 bg-white">{colItem.sourceLogic || 'priority'}</Badge>
                              </TableCell>
                              <TableCell className="px-6 py-2 border-r border-slate-100">
                                <div className="flex flex-wrap gap-1">
                                  {(colItem.entityTypes || field.entityTypes || []).map(type => (
                                    <Badge key={type} variant="outline" className={cn("text-[8px] h-4 px-1.5 uppercase font-bold tracking-wider", ENTITY_TYPE_COLORS[type] || 'bg-slate-50 text-slate-600')}>
                                      {type}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-1.5">
                                {isItemEditing ? (
                                  <div className="flex items-center gap-2">
                                    {isDropdown ? (
                                      <SearchableSelect
                                        value={editValue}
                                        onValueChange={(val) => setEditValue(val)}
                                        options={normalizedOptions}
                                        placeholder="Select..."
                                        buttonClassName="h-8 text-xs border-indigo-400 ring-2 ring-indigo-100 w-full bg-white shadow-sm"
                                      />
                                    ) : (
                                      <Input
                                        autoFocus
                                        value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); }}
                                        className="h-8 text-xs border-indigo-400 ring-2 ring-indigo-100 shadow-sm"
                                      />
                                    )}
                                    <Button size="icon" onClick={() => saveEdit(isDropdown, normalizedOptions)} className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700 shrink-0 shadow-sm rounded-lg"><Check className="h-4 w-4" /></Button>
                                    <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-8 w-8 text-rose-500 hover:bg-rose-50 shrink-0 rounded-lg"><X className="h-4 w-4" /></Button>
                                  </div>
                                ) : (
                                  (() => {
                                    const mIds = colItem.linkedMasterFields || [];
                                    const qIds = colItem.linkedJobQuestionIds || [];
                                    const totalSources = mIds.length + qIds.length;

                                    if (totalSources > 1) {
                                      return (
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <div className={cn(
                                              "text-[11px] h-7 flex items-center px-2.5 rounded-md cursor-pointer border border-dashed transition-colors shadow-sm",
                                              isItemMissing ? "border-rose-300 bg-rose-50/50 text-rose-600 font-bold" : "border-indigo-200 bg-white hover:border-indigo-400 text-slate-900 font-medium"
                                            )}>
                                              <span className="truncate flex-1">{isItemMissing ? 'Missing Value' : rawValue}</span>
                                              <ChevronDown className="h-3.5 w-3.5 ml-2 text-indigo-400 shrink-0" />
                                            </div>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-80 p-0 shadow-xl border-indigo-100 rounded-xl overflow-hidden" align="end">
                                            <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Array Sources</span>
                                              <Badge className="text-[9px] h-5 bg-indigo-100 text-indigo-700 hover:bg-indigo-100 uppercase tracking-wider">{colItem.sourceLogic || 'priority'}</Badge>
                                            </div>
                                            <div className="p-1.5 space-y-1 bg-white">
                                              {/* Source rendering identical logic but updated styles */}
                                              {mIds.map((mid, mIdx) => {
                                                const mDef = jobFields[String(mid)];
                                                const mSource = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
                                                const val = getFieldValue(String(mid), String(row.entityId));
                                                return (
                                                  <div key={`am-${mid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 group transition-all">
                                                    <div className="flex flex-col min-w-0">
                                                      <span className="text-[9px] font-bold text-indigo-600 flex items-center gap-1 uppercase tracking-widest mb-0.5">
                                                        <Database className="h-2.5 w-2.5" /> Source {mIdx + 1}
                                                      </span>
                                                      <span className="text-xs font-bold truncate text-slate-800">{mDef?.label}</span>
                                                      <span className="text-[10px] text-slate-500 italic truncate mt-0.5">{isValidValue(val) ? val : 'Empty'}</span>
                                                    </div>
                                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-indigo-600 hover:bg-indigo-50 rounded-md" onClick={() => mSource && startEditing(uniqueKey, mIdx, mSource.table, mSource.path, isValidValue(val) ? val : '', row.entityId, mSource.linking_variable)}>
                                                      <Edit3 className="h-3.5 w-3.5" />
                                                    </Button>
                                                  </div>
                                                );
                                              })}
                                              {/* Questions similarly... */}
                                            </div>
                                          </PopoverContent>
                                        </Popover>
                                      );
                                    } else {
                                      return (
                                        <div
                                          className={cn(
                                            "text-[11px] h-7 flex items-center px-2.5 rounded-md cursor-pointer border border-transparent transition-colors",
                                            isItemMissing ? "text-rose-600 font-bold" : "text-slate-900 font-medium",
                                            arrayPersist && "hover:bg-indigo-50/50 hover:border-indigo-200"
                                          )}
                                          onClick={() => {
                                            if (!arrayPersist) return;
                                            startEditing(uniqueKey, 0, arrayPersist.table, arrayPersist.path, isItemMissing ? '' : rawValue, String(arrayEditId), arrayPersist.linking_variable || 'id');
                                          }}
                                        >
                                          <span className="truncate">{isItemMissing ? 'Missing Value' : rawValue}</span>
                                          {arrayPersist && <Edit3 className="h-3.5 w-3.5 ml-auto text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                        </div>
                                      );
                                    }
                                  })()
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ))}
                    </React.Fragment>
                  );
                }

                // =========================================================
                // CASE: DOCUMENT FIELDS
                // =========================================================
                if (field.fieldType === 'document') {
                  const targetId = field.targetId;
                  const foundDoc = documentFiles.find(d => field.linkedKycDocuments?.includes(d.document_id) && String(d.owner_id) === String(targetId));

                  return (
                    <React.Fragment key={`doc-${fIdx}`}>
                      {groupHeaderRow}
                      <TableRow className="group border-b border-slate-100 hover:bg-slate-50/50 bg-white">
                        <TableCell className="px-4 py-3.5 text-center text-[11px] font-bold text-slate-400 border-r border-slate-100">{fIdx + 1}</TableCell>
                        <TableCell className="px-6 py-3.5 border-r border-slate-100">
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-md bg-amber-50 text-amber-600 border border-amber-100 shadow-sm"><Paperclip className="h-3.5 w-3.5" /></div>
                            <span className="text-[11px] font-bold text-slate-900">{field.efnsDisplayName || field.variableName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-3.5 border-r border-slate-100">
                          <Badge variant="outline" className="text-[9px] border-amber-200 text-amber-700 bg-amber-50 uppercase tracking-wider font-bold">Asset Mapping</Badge>
                        </TableCell>
                        <TableCell className="px-6 py-3.5 border-r border-slate-100">
                          <div className="flex flex-wrap gap-1">
                            {(field.entityTypes || []).map(type => (
                              <Badge key={type} variant="outline" className={cn("text-[8px] h-4 px-1.5 uppercase font-bold tracking-wider", ENTITY_TYPE_COLORS[type] || 'bg-slate-50 text-slate-600')}>
                                {type}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-3.5">
                          {foundDoc ? (
                            <div className="flex items-center gap-3">
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200 shadow-sm font-bold text-[10px] px-2.5 py-0.5">Available</Badge>
                              <Button size="sm" variant="outline" onClick={() => handlePreviewDocument(foundDoc)} className="h-7 px-3 text-[10px] font-bold text-indigo-600 border-indigo-200 hover:bg-indigo-50 rounded-md">
                                <Eye className="h-3.5 w-3.5 mr-1.5" /> View
                              </Button>
                            </div>
                          ) : <Badge variant="outline" className="bg-rose-50 text-rose-600 border-rose-200 shadow-sm font-bold text-[10px] px-2.5 py-0.5">Missing</Badge>}
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                }

                // =========================================================
                // CASE: STANDARD FIELDS (Text, Number, Date, Computed)
                // =========================================================
                const isValueMissing = field.isMissing;
                const isDefaultField = field.isDefault;
                const mIds = field.linkedMasterFields || [];
                const qIds = field.linkedJobQuestionIds || [];

                let persistenceSource = null;
                let editTargetId = field.targetId;
                let fieldOptions = null;
                
                if (mIds.length > 0) {
                  const mDef = jobFields[String(mIds[0])];
                  persistenceSource = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
                  fieldOptions = mDef?.options;
                } else if (qIds.length > 0) {
                  persistenceSource = { table: 'tm_tasks', path: `job_specific_answers ->> '${qIds[0]}'`, linking_variable: 'id' };
                  editTargetId = taskId;
                }

                const normalizedOptions = Array.isArray(fieldOptions)
                  ? fieldOptions.map((opt: any) => typeof opt === 'string' ? { label: opt, value: opt } : opt)
                  : [];
                const isDropdown = normalizedOptions.length > 0;

                return (
                  <React.Fragment key={`std-${fIdx}`}>
                    {groupHeaderRow}
                    <TableRow className={cn(
                      "group border-b border-slate-100 transition-colors", 
                      isDefaultField ? "bg-slate-50/50" : isEditing ? "bg-indigo-50/40" : (field.fieldType === 'computed' ? "bg-fuchsia-50/10 hover:bg-fuchsia-50/30" : "bg-white hover:bg-slate-50/50")
                    )}>
                      <TableCell className="px-4 py-3.5 text-center text-[11px] font-bold text-slate-400 border-r border-slate-100">{fIdx + 1}</TableCell>
                      <TableCell className="px-6 py-3.5 border-r border-slate-100">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {isDefaultField && <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                            <span className={cn("text-[11px] font-bold", isDefaultField ? "text-slate-500" : "text-slate-900")}>{field.efnsDisplayName || field.variableName}</span>
                          </div>
                          <span className="text-[9px] text-slate-400 font-mono tracking-tight">{field.variableName}</span>
                        </div>
                      </TableCell>

                      <TableCell className="px-6 py-3.5 border-r border-slate-100">
                        <div className="flex flex-col gap-1.5 items-start">
                          <span className="text-[11px] font-semibold text-slate-600">{field.customFieldSource || 'System Mapping'}</span>
                          {isDefaultField ? (
                            <Badge variant="outline" className="text-[9px] h-5 border-slate-200 text-slate-500 bg-slate-100 gap-1 font-bold uppercase tracking-wider">
                              <Lock className="h-2.5 w-2.5" /> Preset Default
                            </Badge>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {field.linkedMasterFields?.length > 0 && (
                                <Badge variant="outline" className="text-[9px] h-5 border-indigo-200 text-indigo-700 bg-indigo-50 uppercase tracking-wider font-bold">DB Field</Badge>
                              )}
                              {field.linkedJobQuestionIds?.length > 0 && (
                                <Badge variant="outline" className="text-[9px] h-5 border-fuchsia-200 text-fuchsia-700 bg-fuchsia-50 uppercase tracking-wider font-bold">Question</Badge>
                              )}
                              {(!field.linkedMasterFields?.length && !field.linkedJobQuestionIds?.length) && (
                                <Badge variant="outline" className="text-[9px] h-5 border-slate-200 text-slate-500 uppercase tracking-wider font-bold">Requirement</Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="px-6 py-3.5 border-r border-slate-100">
                        <div className="flex flex-wrap gap-1">
                          {(field.entityTypes || []).map(type => (
                            <Badge key={type} variant="outline" className={cn("text-[8px] h-4 px-1.5 uppercase font-bold tracking-wider", ENTITY_TYPE_COLORS[type] || 'bg-slate-50 text-slate-600')}>
                              {type}
                            </Badge>
                          ))}
                          {(!field.entityTypes || field.entityTypes.length === 0) && (
                            <span className="text-[10px] text-slate-400 font-bold">—</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="px-6 py-2.5">
                        {isDefaultField ? (
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-medium text-slate-600 truncate max-w-[200px]">{field.resolvedValue}</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="bg-slate-100 border-slate-200 text-slate-500 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 cursor-help">
                                    <Lock className="h-2.5 w-2.5 mr-1" /> Locked
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs max-w-xs font-medium">
                                  This value is preset by the automation configuration and cannot be edited.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        ) : isEditing ? (
                          <div className="flex items-center gap-2">
                            {isDropdown ? (
                              <SearchableSelect
                                value={editValue}
                                onValueChange={(val) => setEditValue(val)}
                                options={normalizedOptions}
                                placeholder="Select..."
                                buttonClassName="h-8 text-xs border-indigo-400 ring-2 ring-indigo-100 w-full bg-white shadow-sm"
                              />
                            ) : (
                              <Input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); }} className="h-8 text-xs border-indigo-400 ring-2 ring-indigo-100 shadow-sm" />
                            )}
                            <Button size="icon" onClick={() => saveEdit(isDropdown, normalizedOptions)} className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700 shrink-0 shadow-sm rounded-lg"><Check className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-8 w-8 text-rose-500 hover:bg-rose-50 shrink-0 rounded-lg"><X className="h-4 w-4" /></Button>
                          </div>
                        ) : (
                          (mIds.length + qIds.length) > 1 ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <div className={cn(
                                  "text-[11px] h-8 flex items-center px-3 rounded-md cursor-pointer border border-dashed transition-all shadow-sm",
                                  isValueMissing ? "border-rose-300 bg-rose-50/50 text-rose-600 font-bold" : "border-indigo-200 bg-white hover:border-indigo-400 text-slate-900 font-medium"
                                )}>
                                  <span className="truncate">{isValueMissing ? 'Missing Value' : field.resolvedValue}</span>
                                  <ChevronDown className="h-3.5 w-3.5 ml-auto text-indigo-400 shrink-0" />
                                </div>
                              </PopoverTrigger>
                              <PopoverContent className="w-80 p-0 shadow-xl border-indigo-100 rounded-xl overflow-hidden" align="end">
                                <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Linked Sources</span>
                                  <Badge className="text-[9px] h-5 bg-indigo-100 text-indigo-700 hover:bg-indigo-100 uppercase tracking-wider">Priority Logic</Badge>
                                </div>
                                <div className="p-1.5 space-y-1 bg-white">
                                  {/* Rendering logic similar to original, updated styles */}
                                  {mIds.map((mid, idx) => {
                                      const mDef = jobFields[String(mid)];
                                      const source = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
                                      const sourceVal = getFieldValue(String(mid), String(field.targetId));

                                      return (
                                        <div key={`m-${mid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 group transition-all">
                                          <div className="flex flex-col min-w-0">
                                            <span className="text-[9px] font-bold text-indigo-600 flex items-center gap-1 uppercase tracking-widest mb-0.5">
                                              <Database className="h-2.5 w-2.5" /> DB FIELD {idx + 1}
                                            </span>
                                            <span className="text-xs font-bold truncate text-slate-800">{mDef?.label}</span>
                                            <span className="text-[10px] text-slate-500 truncate italic mt-0.5">{isValidValue(sourceVal) ? sourceVal : 'Empty'}</span>
                                          </div>
                                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-indigo-600 hover:bg-indigo-50 rounded-md" onClick={() => source && startEditing(field.variableName, idx, source.table, source.path, isValidValue(sourceVal) ? sourceVal : '', field.targetId, source.linking_variable)}>
                                            <Edit3 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      );
                                  })}
                                  {/* ... Questions loop ... */}
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <div
                              className={cn(
                                "text-[11px] h-8 flex items-center px-3 rounded-md transition-colors relative",
                                persistenceSource ? "cursor-pointer border border-transparent hover:border-indigo-300 hover:bg-indigo-50 hover:shadow-sm" : "cursor-default",
                                isValueMissing ? "text-rose-600 font-bold" : "text-slate-900 font-medium"
                              )}
                              onClick={() => {
                                if (!persistenceSource) return;
                                startEditing(field.variableName, 0, persistenceSource.table, persistenceSource.path, isValueMissing ? '' : field.resolvedValue, String(editTargetId), persistenceSource.linking_variable || 'id');
                              }}
                            >
                              <span className="truncate pr-6">{isValueMissing ? 'Missing Value' : field.resolvedValue}</span>
                              {persistenceSource && !isEditing && <Edit3 className="h-3.5 w-3.5 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity absolute right-3 top-1/2 -translate-y-1/2" />}
                            </div>
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const renderDocumentsSection = () => {
    // Document tab remains mostly the same logically, updated visually to match the new styling.
    const normalDocFields = activeWebEntry?.fields?.filter((f: any) => f.fieldType === 'document') || [];
    const arrayDocFields = activeWebEntry?.fields?.filter((f: any) => f.fieldType === 'array')
      ?.flatMap((field: any) => {
        return (field.arrayItems || [])
          .filter((colItem: any) => colItem.type === 'document')
          .map((colItem: any) => ({
            ...colItem,
            arrayFieldName: field.displayName || field.efnsDisplayName || field.variableName,
            arrayVariableName: field.variableName,
            isFromArray: true
          }));
      }) || [];

    const allDocFields = [...normalDocFields, ...arrayDocFields];

    return (
      <div className="space-y-6 p-8 bg-slate-50/50 min-h-full">
        {savedScreenshotDoc && (
          <Card className="border-emerald-300 bg-emerald-50 shadow-sm rounded-xl overflow-hidden">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-emerald-100 text-emerald-600 shadow-inner">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 tracking-tight">eTA Kenya Confirmation Screenshot</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-medium">{savedScreenshotDoc.file_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-emerald-600 text-white font-bold text-[10px] px-3 py-1 shadow-sm">Saved</Badge>
                <Button size="sm" variant="outline" className="h-8 px-4 text-xs font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-100 rounded-lg"
                  onClick={() => {
                    setPreviewingDocuments({ document_display_name: 'eTA Kenya Confirmation Screenshot', documents: [savedScreenshotDoc], person_full_name: individualName || getPrimaryTargetEntityId(), requirementId: ETA_SCREENSHOT_DOCUMENT_ID });
                    setShowPreviewModal(true);
                  }}>
                  <Eye className="h-3.5 w-3.5 mr-2" /> View File
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {allDocFields.length === 0 && !savedScreenshotDoc && (
          <div className="flex flex-col items-center justify-center p-16 opacity-50">
            <FileText className="w-16 h-16 mb-4 text-slate-300" />
            <p className="text-lg font-bold text-slate-400">No document assets required for this flow.</p>
          </div>
        )}

        {allDocFields.length > 0 && (
          <div>
             <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Required Documents</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {allDocFields.map((req, idx) => {
                const targetId = resolveTargetEntityId(req);
                const foundDoc = documentFiles.find(d => req.linkedKycDocuments?.includes(d.document_id) && String(d.owner_id) === String(targetId));
                const displayName = req.isFromArray ? `${req.arrayFieldName} - ${req.displayName || req.name || req.variableName}` : req.displayName || req.efnsDisplayName || req.variableName;

                return (
                  <Card key={idx} className={cn("overflow-hidden border transition-all rounded-xl", foundDoc ? "border-emerald-200 shadow-sm bg-white" : "border-rose-200 bg-rose-50/30")}>
                    <CardContent className="p-5 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn("p-2.5 rounded-xl shadow-inner", foundDoc ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600")}><Paperclip className="h-5 w-5" /></div>
                        <div className="flex-1">
                          <h4 className="font-bold text-sm text-slate-900 line-clamp-1">{displayName}</h4>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[10px] text-slate-500 font-mono tracking-tight">{req.variableName}</span>
                             {req.isFromArray && <Badge variant="outline" className="text-[8px] h-4 px-1.5 uppercase font-bold tracking-wider text-indigo-600 border-indigo-200 bg-indigo-50">Array Item</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {foundDoc ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handlePreviewDocument(foundDoc)} className="h-8 px-3 text-[10px] font-bold text-indigo-600 border-indigo-200 hover:bg-indigo-50 rounded-lg">
                              <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview
                            </Button>
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200 shadow-sm font-bold text-[10px] px-2.5 py-0.5">Available</Badge>
                          </>
                        ) : (
                           <Badge variant="outline" className="bg-rose-50 text-rose-600 border-rose-200 shadow-sm font-bold text-[10px] px-2.5 py-0.5">Missing</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-[1500px] w-[98vw] h-[92vh] flex flex-col p-0 overflow-hidden bg-[#F8FAFC] border-none shadow-2xl rounded-2xl">
          
          {/* HEADER (Matches DocsColumnVisibility) */}
          <div className="flex bg-white border-b border-slate-200 shrink-0 z-20">
            <div className="px-6 py-4 flex items-center justify-between w-full">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100 shrink-0">
                  <Zap className="text-white w-5 h-5 fill-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-slate-900 tracking-tight leading-none">
                    Data Mapping: {task?.applicant_details?.name || task?.applicant_name || individualName || "Applicant"}
                  </DialogTitle>
                  <p className="text-xs font-medium text-slate-500 flex items-center gap-2 mt-1.5">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold font-mono border border-slate-200">
                      Task #{task?.id}
                    </span>
                    <span className="inline-flex items-center gap-1.5 ml-1">
                      <User className="w-3 h-3 text-indigo-500" />
                      Entity ID: {getPrimaryTargetEntityId() || 'N/A'}
                    </span>
                    {isSavingScreenshot && (
                       <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-bold border border-indigo-100 ml-2">
                         <Loader2 className="w-3 h-3 animate-spin" /> Saving Screenshot...
                       </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-1 items-center justify-center px-8">
                 {/* Empty space in header, workflow select moved to sidebar */}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {isAutomationRunning && automationJobId && (
                  <Button onClick={stopAutomation} size="sm" className="h-9 px-4 bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-300 font-bold text-xs rounded-md shadow-sm transition-all">
                    <X className="h-3.5 w-3.5 mr-1.5" /> Stop Automation
                  </Button>
                )}
                <Button
                  onClick={handleRunAutomation}
                  disabled={isAutomationRunning || isSavingScreenshot || !selectedAutomationId}
                  size="sm"
                  className="h-9 px-6 bg-indigo-600 text-white hover:bg-indigo-700 font-black text-xs shadow-md rounded-md transition-all uppercase tracking-wide"
                >
                  {(isAutomationRunning || isSavingScreenshot) ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2 fill-white" />
                  )}
                  {isSavingScreenshot ? 'Saving...' : isAutomationRunning ? 'Running...' : 'Execute Workflow'}
                </Button>
                <div className="h-8 w-[1px] mx-1 bg-slate-200" />
                <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          {/* MAIN LAYOUT */}
          <div className="flex-1 overflow-hidden">
            <ResizablePanelGroup direction="horizontal" className="h-full">
              
              {/* LEFT SIDEBAR (Dark Mode Aesthetic) */}
              <ResizablePanel defaultSize={20} minSize={18} className="bg-[#0F172A] flex flex-col relative z-10 shadow-[4px_0_24px_rgba(0,0,0,0.1)] border-r border-slate-800">
                <div className="p-5 flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">
                  
                  {/* Configuration Section */}
                  <div className="space-y-3">
                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-1.5">
                       <Settings className="w-3.5 h-3.5" /> Setup Environment
                     </span>
                     <div className="space-y-4">
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Select Workflow</label>
                           <SearchableSelect
                             value={selectedAutomationId}
                             onValueChange={setSelectedAutomationId}
                             options={entityAutomationMappings.map(m => ({ value: m.automationId, label: m.automation?.name || "Unnamed Flow" }))}
                             placeholder="Select Workflow..."
                             buttonClassName="w-full bg-[#1E293B] border-slate-700 text-white h-10 rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors shadow-inner"
                             emptyMessage="No workflows found"
                           />
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Target Individual ID</label>
                           <div className="relative">
                             <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                             <input
                               value={getPrimaryTargetEntityId()}
                               onChange={(e) => {
                                 if (getPrimaryEntityType() === 'principal') setCurrentIndividualId(e.target.value);
                               }}
                               placeholder="ID Number..."
                               disabled={getPrimaryEntityType() !== 'principal'}
                               className="w-full pl-9 h-10 rounded-lg outline-none text-xs font-semibold text-white bg-[#1E293B] border border-slate-700 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
                             />
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Divider */}
                  <div className="h-px w-full bg-slate-800/50" />

                  {/* Progress Section (Dynamic) */}
                  <div className="space-y-3 flex-1 flex flex-col min-h-0">
                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-1.5 shrink-0">
                       <Activity className="w-3.5 h-3.5" /> Execution Status
                     </span>
                     
                     {!automationProgress ? (
                        <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center px-4">
                           <Webhook className="w-12 h-12 mb-3 text-slate-400" />
                           <p className="text-[11px] font-bold text-slate-400 leading-tight">Ready to map data and execute workflow.</p>
                        </div>
                     ) : (
                        <div className="flex flex-col flex-1 min-h-0 gap-4">
                           {/* Status Card */}
                           <div className={cn(
                              "p-3.5 rounded-xl border flex flex-col gap-3 shadow-lg",
                              automationProgress.isRunning ? "bg-indigo-950/40 border-indigo-500/30 shadow-indigo-900/20" : 
                              automationProgress.error ? "bg-rose-950/40 border-rose-500/30 shadow-rose-900/20" : 
                              "bg-emerald-950/40 border-emerald-500/30 shadow-emerald-900/20"
                           )}>
                              <div className="flex items-center justify-between">
                                 <div className="flex items-center gap-2.5">
                                    {automationProgress.isRunning ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                                    ) : automationProgress.error ? (
                                      <AlertCircle className="h-4 w-4 text-rose-400" />
                                    ) : (
                                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                    )}
                                    <span className={cn(
                                       "text-xs font-bold",
                                       automationProgress.isRunning ? "text-indigo-300" : automationProgress.error ? "text-rose-300" : "text-emerald-300"
                                    )}>
                                       {automationProgress.isRunning ? 'Running' : automationProgress.error ? 'Failed' : 'Completed'}
                                    </span>
                                 </div>
                                 <span className="text-xl font-black text-white">{automationProgress.progress}%</span>
                              </div>
                              
                              <div className="w-full bg-[#0F172A] rounded-full h-2 overflow-hidden border border-slate-800">
                                <div
                                  className={cn(
                                     "h-full rounded-full transition-all duration-500 relative overflow-hidden", 
                                     automationProgress.error ? "bg-rose-500" : automationProgress.isRunning ? "bg-indigo-500" : "bg-emerald-500"
                                  )}
                                  style={{ width: `${automationProgress.progress}%` }}
                                >
                                   {automationProgress.isRunning && <div className="absolute inset-0 bg-white/20 animate-pulse" />}
                                </div>
                              </div>
                              
                              <p className="text-[11px] text-slate-300 font-medium leading-tight">
                                {automationProgress.message || 'Processing automation...'}
                              </p>
                              {automationProgress.error && (
                                <p className="text-[10px] text-rose-400 font-medium mt-1 bg-rose-950/50 p-2 rounded-md border border-rose-900/50">
                                  {automationProgress.error}
                                </p>
                              )}
                           </div>

                           {/* Logs Terminal */}
                           {automationProgress.logs && automationProgress.logs.length > 0 && (
                             <div className="flex flex-col flex-1 min-h-0 bg-[#020617] rounded-xl border border-slate-800 shadow-inner overflow-hidden">
                               <div className="px-3 py-2 bg-[#0F172A] border-b border-slate-800 flex justify-between items-center shrink-0">
                                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Clock className="w-3 h-3" /> System Logs</span>
                                  <span className="text-[9px] font-mono text-slate-600">{automationProgress.logs.length} lines</span>
                               </div>
                               <ScrollArea className="flex-1 p-3">
                                 <div className="space-y-1.5 font-mono text-[10px]">
                                   {automationProgress.logs.map((log: any, i: number) => (
                                     <div key={i} className={cn(
                                       "leading-relaxed break-words",
                                       log.level === 'error' ? 'text-rose-400' :
                                       log.level === 'warn' ? 'text-amber-400' : 'text-emerald-300/90'
                                     )}>
                                       <span className="text-slate-600 mr-2 select-none">
                                         [{new Date(log.timestamp).toLocaleTimeString()}]
                                       </span>
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
                  </div>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle className="bg-slate-300 border-none w-px z-20" />

              {/* RIGHT MAIN PANEL (Light Mode Aesthetic) */}
              <ResizablePanel defaultSize={80} className="bg-white flex flex-col h-full relative z-0">
                {!selectedAutomationId ? (
                   <div className="flex-1 flex flex-col items-center justify-center opacity-30">
                     <Webhook className="w-24 h-24 mb-6 text-slate-300" />
                     <h2 className="text-2xl font-black text-slate-400 tracking-tight">No Workflow Selected</h2>
                     <p className="text-sm font-semibold text-slate-500 mt-2">Choose an automation workflow from the left sidebar to begin mapping.</p>
                   </div>
                ) : (
                  <>
                    <div className="px-6 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
                      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto -mb-px">
                        <TabsList className="bg-transparent h-12 p-0 space-x-6">
                          <TabsTrigger 
                             value="fields" 
                             className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 text-slate-500 font-bold text-xs uppercase tracking-wider rounded-none h-full px-1"
                          >
                            <Database className="h-4 w-4 mr-2" /> Mapping Fields
                          </TabsTrigger>
                          <TabsTrigger 
                             value="documents" 
                             className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 text-slate-500 font-bold text-xs uppercase tracking-wider rounded-none h-full px-1"
                          >
                            <FileText className="h-4 w-4 mr-2" /> Required Assets
                            {savedScreenshotDoc && <span className="ml-2 h-2 w-2 rounded-full bg-emerald-500 inline-block shadow-[0_0_8px_rgba(16,185,129,0.8)]" />}
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                      
                      {isLoadingData && (
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching Source Data...
                        </div>
                      )}
                    </div>

                    <div className="flex-1 overflow-hidden relative bg-slate-50/30">
                      <Tabs value={activeTab} className="h-full flex flex-col">
                        <TabsContent value="fields" className="flex-1 overflow-hidden m-0 data-[state=active]:flex flex-col">
                          {isLoading ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-50">
                              <Loader2 className="h-10 w-10 animate-spin mb-4 text-indigo-500" />
                              <p className="text-sm font-bold">Loading configuration matrix...</p>
                            </div>
                          ) : renderFieldsTable()}
                        </TabsContent>
                        <TabsContent value="documents" className="flex-1 overflow-y-auto m-0 data-[state=active]:block">
                          {renderDocumentsSection()}
                        </TabsContent>
                      </Tabs>
                    </div>
                  </>
                )}
              </ResizablePanel>

            </ResizablePanelGroup>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Preview Modal (Updated Header Aesthetic) */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-0 overflow-hidden bg-[#F8FAFC] border-none shadow-2xl rounded-2xl">
          {showPreviewModal && previewingDocuments && (
            <>
              <div className="flex bg-white border-b border-slate-200 shrink-0 z-20">
                <div className="px-6 py-4 flex items-center justify-between w-full">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100 shrink-0">
                      <FileText className="text-white w-5 h-5" />
                    </div>
                    <div>
                      <DialogTitle className="text-lg font-bold text-slate-900 tracking-tight leading-none line-clamp-1">
                        {previewingDocuments?.document_display_name || 'Document Verification'}
                      </DialogTitle>
                      <p className="text-xs font-medium text-slate-500 mt-1.5 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-indigo-500" />
                          Target Entity: {previewingDocuments?.person_full_name || 'Unknown'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 font-bold text-xs px-3 py-1 shadow-sm">
                      {previewingDocuments?.documents?.length || 0} File(s) Extracted
                    </Badge>
                    <div className="h-8 w-[1px] mx-1 bg-slate-200" />
                    <Button variant="ghost" size="icon" onClick={() => setShowPreviewModal(false)} className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto bg-slate-50 relative">
                {previewingDocuments?.documents?.map((doc, index) => {
                  const docId = doc.id || `doc-${index}`;
                  return (
                    <div key={docId} className="h-full">
                      <ExtractionPreview
                        documentName={previewingDocuments?.document_display_name || 'Document'}
                        extractedData={doc.edited_details || doc.extracted_details || {}}
                        fields={doc.document_fields || []}
                        fileUrl={getFileUrl(doc.file_path)}
                        fileName={doc.file_name || 'document.pdf'}
                        expanded={true}
                        showSaveButton={true}
                        onSave={(data) => handleSaveEditedDocument(doc, data)}
                        onDataChange={(fieldName, value) => { handlePreviewDataChange(docId, fieldName, value); }}
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