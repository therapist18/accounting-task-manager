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
  List, ChevronDown, ChevronUp, Eye, Lock, Settings, Activity, Clock
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

// Softened colors for entity tags to reduce visual noise
const ENTITY_TYPE_COLORS: Record<string, string> = {
  principal: 'bg-blue-50 text-blue-700',
  dependant: 'bg-slate-100 text-slate-600',
  sponsor: 'bg-slate-100 text-slate-600',
  director: 'bg-slate-100 text-slate-600',
  company: 'bg-slate-100 text-slate-600',
  understudy: 'bg-slate-100 text-slate-600',
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
  supabase: any;
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

  const arrayFieldNames = useMemo(() =>
    sortedFields.filter(f => f.fieldType === 'array').map(f => f.variableName),
    [sortedFields]);

  const allExpanded = arrayFieldNames.length > 0 && arrayFieldNames.every(name => expandedArrayFields.has(name));

  const handleToggleAllArrays = () => {
    arrayFieldNames.forEach(name => {
      if (allExpanded && expandedArrayFields.has(name)) {
        toggleArrayFieldExpansion(name);
      } else if (!allExpanded && !expandedArrayFields.has(name)) {
        toggleArrayFieldExpansion(name);
      }
    });
  };

  const renderFieldsTable = () => {
    if (!activeWebEntry?.fields || activeWebEntry.fields.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full opacity-50">
          <Database className="w-12 h-12 mb-4 text-slate-300" />
          <p className="text-base font-medium text-slate-500">No fields configured for this automation.</p>
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
        {/* Simplified Stats Sub-Header */}
        <div className="px-6 py-2 border-b border-slate-200 flex flex-wrap gap-6 bg-slate-50/50 sticky top-0 z-20 items-center min-h-[48px]">
          <div className="flex flex-wrap gap-4 flex-1">
            {Object.entries(entityGroupStats).map(([key, stats]) => {
              const pct = Math.round((stats.filled / stats.total) * 100);
              const allDone = stats.missing === 0;
              return (
                <div key={key} className="flex items-center gap-2 text-sm uppercase tracking-wide">
                  <span className="font-medium text-slate-700">{key}</span>
                  <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", allDone ? "bg-emerald-500" : "bg-blue-500")} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={cn("font-medium text-xs", allDone ? "text-emerald-600" : "text-slate-500")}>{pct}%</span>
                  {stats.defaultCount > 0 && (
                    <span className="text-xs text-slate-400 flex items-center ml-1">
                      <Lock className="h-3 w-3 mr-0.5" />{stats.defaultCount}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              {processedFields.filter(f => !f.isMissing).length}/{processedFields.length} Ready
            </div>
            {processedFields.filter(f => f.isMissing).length > 0 && (
              <div className="text-sm font-medium text-red-500 flex items-center gap-1.5 ml-2">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span>
                {processedFields.filter(f => f.isMissing).length} Missing
              </div>
            )}
            <div className="h-4 w-px bg-slate-300 mx-2" />

            {arrayFieldNames.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleToggleAllArrays} className="h-8 text-sm font-medium text-slate-600">
                {allExpanded ? <ChevronUp className="h-4 w-4 mr-1.5" /> : <ChevronDown className="h-4 w-4 mr-1.5" />}
                {allExpanded ? "Collapse Arrays" : "Expand Arrays"}
              </Button>
            )}

            <Button
              variant={sortMissingFirst ? "default" : "outline"}
              size="sm"
              onClick={() => setSortMissingFirst(!sortMissingFirst)}
              className={cn("h-8 text-sm font-medium", sortMissingFirst ? "bg-blue-600 text-white" : "text-slate-600")}
            >
              <Filter className="h-3.5 w-3.5 mr-1.5" />
              {sortMissingFirst ? "Show All" : "Missing First"}
            </Button>
          </div>
        </div>

        {/* Clean Table Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          <Table className="w-full border-collapse">
            <TableHeader className="sticky top-0 z-10 bg-blue-600 shadow-sm border-b border-slate-200">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 px-4 py-3 text-center text-sm border-r font-semibold text-white">#</TableHead>
                <TableHead className="w-80 px-6 py-3 text-left text-sm border-r font-semibold text-white">Target Variable</TableHead>
                <TableHead className="px-6 py-3 text-left text-sm border-r font-semibold text-white">Source Logic</TableHead>
                <TableHead
                  className="w-48 px-6 py-3 text-left text-sm border-r font-semibold text-white cursor-pointer select-none hover:bg-slate-50 transition-colors group"
                  onClick={() => setEntitySort(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
                >
                  <div className="flex items-center justify-between">
                    Entities
                    <ArrowUpDown className={cn("h-3.5 w-3.5 shrink-0 transition-colors", entitySort ? "text-blue-600" : "text-slate-300 group-hover:text-slate-400")} />
                  </div>
                </TableHead>
                <TableHead className="px-6 py-3 text-left text-sm border-r font-semibold text-white">Current Value</TableHead>
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
                  <TableRow key={`group-${fieldGroupKey}-${fIdx}`} className="bg-blue-50 hover:bg-slate-50">
                    <TableCell colSpan={5} className="px-6 py-2 border-y border-slate-200">
                      <div className="gap-2 flex">
                        <div className="h-6 w-1 bg-blue-600 rounded-md"></div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                            {fieldGroupKey.replace(/, /g, ' & ')}
                          </span>
                          <span className="text-xs text-slate-500">
                            ({groupFieldsFilled}/{groupFieldsTotal} Complete)
                          </span>
                        </div>
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
                          "transition-colors cursor-pointer group",
                          isExpanded ? "bg-slate-50" : "bg-white hover:bg-slate-50/50"
                        )}
                        onClick={() => toggleArrayFieldExpansion(field.variableName)}
                      >
                        <TableCell className="px-4 py-3 text-center text-sm font-medium text-slate-400 border-r">
                          {isExpanded ? <ChevronDown className="h-4 w-4 mx-auto text-slate-600" /> : <ChevronRight className="h-4 w-4 mx-auto text-slate-400 group-hover:text-slate-600 transition-colors" />}
                        </TableCell>
                        <TableCell colSpan={4} className="px-6 py-3 border-r">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <List className="h-4 w-4 text-slate-400" />
                              <span className="text-sm font-medium text-slate-900">{field.efnsDisplayName || field.variableName}</span>
                              <div className="flex flex-wrap gap-1 ml-2">
                                {(field.entityTypes || []).map(type => (
                                  <span key={type} className={cn("text-xs px-2 py-0.5 rounded-full font-medium", ENTITY_TYPE_COLORS[type] || 'bg-slate-100 text-slate-600')}>
                                    {type}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              {arrayData.length} Items
                            </span>
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
                            <TableRow key={uniqueKey} className={cn("group", isItemEditing ? "bg-blue-50/50" : "bg-white hover:bg-slate-50")}>
                              <TableCell className="px-4 py-2 text-center text-xs text-slate-400 border-r">
                                {rowIndex + 1}.{colIndex + 1}
                              </TableCell>
                              <TableCell className="px-6 py-2 pl-12 relative border-r">
                                <div className="absolute left-6 top-1/2 w-4 h-px bg-slate-200"></div>
                                <span className="text-sm text-slate-700">{colItem.displayName || colItem.variableName}</span>
                              </TableCell>
                              <TableCell className="px-6 py-2 border-r">
                                <span className="text-xs text-slate-500">{colItem.sourceLogic || 'Priority'}</span>
                              </TableCell>
                              <TableCell className="px-6 py-2 border-r">
                                <div className="flex flex-wrap gap-1">
                                  {(colItem.entityTypes || field.entityTypes || []).map(type => (
                                    <span key={type} className={cn("text-xs px-2 py-0.5 rounded-full font-medium", ENTITY_TYPE_COLORS[type] || 'bg-slate-100 text-slate-600')}>
                                      {type}
                                    </span>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-1.5 border-r">
                                {isItemEditing ? (
                                  <div className="flex items-center gap-2">
                                    {isDropdown ? (
                                      <SearchableSelect
                                        value={editValue}
                                        onValueChange={(val) => setEditValue(val)}
                                        options={normalizedOptions}
                                        placeholder="Select..."
                                        buttonClassName="h-8 text-sm border-blue-300 w-full bg-white"
                                      />
                                    ) : (
                                      <Input
                                        autoFocus
                                        value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); }}
                                        className="h-8 text-sm border-blue-300"
                                      />
                                    )}
                                    <Button size="icon" onClick={() => saveEdit(isDropdown, normalizedOptions)} className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700 shrink-0 rounded-md"><Check className="h-4 w-4" /></Button>
                                    <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-8 w-8 text-slate-400 hover:bg-slate-100 shrink-0 rounded-md"><X className="h-4 w-4" /></Button>
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
                                              "text-sm h-8 flex items-center px-2.5 rounded-md cursor-pointer border border-transparent transition-colors",
                                              isItemMissing ? "text-red-500 font-medium" : "text-slate-800 hover:bg-slate-100"
                                            )}>
                                              <span className="truncate flex-1">{isItemMissing ? 'Missing Value' : rawValue}</span>
                                              <ChevronDown className="h-3.5 w-3.5 ml-2 text-slate-400 shrink-0" />
                                            </div>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-80 p-0 shadow-lg border-slate-200 rounded-lg overflow-hidden" align="end">
                                            <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                              <span className="text-xs font-semibold text-slate-600">Array Sources</span>
                                              <span className="text-xs text-slate-500">{colItem.sourceLogic || 'Priority'}</span>
                                            </div>
                                            <div className="p-1 space-y-1 bg-white">
                                              {mIds.map((mid, mIdx) => {
                                                const mDef = jobFields[String(mid)];
                                                const mSource = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
                                                const val = getFieldValue(String(mid), String(row.entityId));
                                                return (
                                                  <div key={`am-${mid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-md border border-transparent group transition-all">
                                                    <div className="flex flex-col min-w-0">
                                                      <span className="text-xs font-medium text-slate-500 mb-0.5">Source {mIdx + 1}</span>
                                                      <span className="text-sm text-slate-800 truncate">{mDef?.label}</span>
                                                      <span className="text-xs text-slate-400 truncate mt-0.5">{isValidValue(val) ? val : 'Empty'}</span>
                                                    </div>
                                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-blue-600 hover:bg-blue-50 rounded-md" onClick={() => mSource && startEditing(uniqueKey, mIdx, mSource.table, mSource.path, isValidValue(val) ? val : '', row.entityId, mSource.linking_variable)}>
                                                      <Edit3 className="h-3.5 w-3.5" />
                                                    </Button>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </PopoverContent>
                                        </Popover>
                                      );
                                    } else {
                                      return (
                                        <div
                                          className={cn(
                                            "text-sm h-8 flex items-center px-2.5 rounded-md cursor-pointer border border-transparent transition-colors group",
                                            isItemMissing ? "text-red-500 font-medium" : "text-slate-800",
                                            arrayPersist && "hover:bg-slate-50 hover:border-slate-200"
                                          )}
                                          onClick={() => {
                                            if (!arrayPersist) return;
                                            startEditing(uniqueKey, 0, arrayPersist.table, arrayPersist.path, isItemMissing ? '' : rawValue, String(arrayEditId), arrayPersist.linking_variable || 'id');
                                          }}
                                        >
                                          <span className="truncate">{isItemMissing ? 'Missing Value' : rawValue}</span>
                                          {arrayPersist && <Edit3 className="h-3.5 w-3.5 ml-auto text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
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
                      <TableRow className="group bg-white hover:bg-slate-50">
                        <TableCell className="px-4 py-3 text-center text-sm font-medium text-slate-400 border-r">{fIdx + 1}</TableCell>
                        <TableCell className="px-6 py-3 border-r">
                          <div className="flex items-center gap-2">
                            <Paperclip className="h-4 w-4 text-slate-400" />
                            <span className="text-sm font-medium text-slate-800">{field.efnsDisplayName || field.variableName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-3 border-r">
                          <span className="text-xs text-slate-500">Asset Mapping</span>
                        </TableCell>
                        <TableCell className="px-6 py-3 border-r">
                          <div className="flex flex-wrap gap-1">
                            {(field.entityTypes || []).map(type => (
                              <span key={type} className={cn("text-xs px-2 py-0.5 rounded-full font-medium", ENTITY_TYPE_COLORS[type] || 'bg-slate-100 text-slate-600')}>
                                {type}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-3 border-r">
                          {foundDoc ? (
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Available</span>
                              <Button size="sm" variant="ghost" onClick={() => handlePreviewDocument(foundDoc)} className="h-7 px-2 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md">
                                <Eye className="h-3.5 w-3.5 mr-1" /> View
                              </Button>
                            </div>
                          ) : <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Missing</span>}
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
                      "group transition-colors",
                      isDefaultField ? "bg-slate-50/50" : isEditing ? "bg-blue-50/40" : (field.fieldType === 'computed' ? "bg-slate-50/30" : "bg-white hover:bg-slate-50")
                    )}>
                      <TableCell className="px-4 py-3 text-center text-sm font-medium text-slate-400 border-r">{fIdx + 1}</TableCell>
                      <TableCell className="px-6 py-3 border-r">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            {isDefaultField && <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                            <span className={cn("text-sm font-medium", isDefaultField ? "text-slate-500" : "text-slate-800")}>{field.efnsDisplayName || field.variableName}</span>
                          </div>
                          <span className="text-xs text-slate-400">{field.variableName}</span>
                        </div>
                      </TableCell>

                      <TableCell className="px-6 py-3 border-r">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="text-xs text-slate-600">{field.customFieldSource || 'System Mapping'}</span>
                          {isDefaultField ? (
                            <span className="text-xs text-slate-400 flex items-center">
                              <Lock className="h-3 w-3 mr-1" /> Default
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {field.linkedMasterFields?.length > 0 && (
                                <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">DB Field</span>
                              )}
                              {field.linkedJobQuestionIds?.length > 0 && (
                                <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Question</span>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="px-6 py-3 border-r">
                        <div className="flex flex-wrap gap-1">
                          {(field.entityTypes || []).map(type => (
                            <span key={type} className={cn("text-xs px-2 py-0.5 rounded-full font-medium", ENTITY_TYPE_COLORS[type] || 'bg-slate-100 text-slate-600')}>
                              {type}
                            </span>
                          ))}
                          {(!field.entityTypes || field.entityTypes.length === 0) && (
                            <span className="text-sm text-slate-400">—</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="px-6 py-2.5 border-r">
                        {isDefaultField ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-600 truncate max-w-[200px]">{field.resolvedValue}</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Lock className="h-3.5 w-3.5 text-slate-400 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-sm max-w-xs font-normal">
                                  Preset by automation configuration.
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
                                buttonClassName="h-8 text-sm border-blue-300 w-full bg-white"
                              />
                            ) : (
                              <Input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); }} className="h-8 text-sm border-blue-300" />
                            )}
                            <Button size="icon" onClick={() => saveEdit(isDropdown, normalizedOptions)} className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700 shrink-0 rounded-md"><Check className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-8 w-8 text-slate-400 hover:bg-slate-100 shrink-0 rounded-md"><X className="h-4 w-4" /></Button>
                          </div>
                        ) : (
                          (mIds.length + qIds.length) > 1 ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <div className={cn(
                                  "text-sm h-8 flex items-center px-2.5 rounded-md cursor-pointer border border-transparent transition-all",
                                  isValueMissing ? "text-red-500 font-medium hover:bg-red-50" : "text-slate-800 hover:bg-slate-100"
                                )}>
                                  <span className="truncate">{isValueMissing ? 'Missing Value' : field.resolvedValue}</span>
                                  <ChevronDown className="h-4 w-4 ml-auto text-slate-400 shrink-0" />
                                </div>
                              </PopoverTrigger>
                              <PopoverContent className="w-80 p-0 shadow-lg border-slate-200 rounded-lg overflow-hidden" align="end">
                                <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                  <span className="text-xs font-medium text-slate-600">Linked Sources</span>
                                  <span className="text-xs text-slate-500">Priority Logic</span>
                                </div>
                                <div className="p-1.5 space-y-1 bg-white">
                                  {mIds.map((mid, idx) => {
                                    const mDef = jobFields[String(mid)];
                                    const source = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
                                    const sourceVal = getFieldValue(String(mid), String(field.targetId));

                                    return (
                                      <div key={`m-${mid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-md border border-transparent group transition-all">
                                        <div className="flex flex-col min-w-0">
                                          <span className="text-xs font-medium text-slate-500 mb-0.5">DB Field {idx + 1}</span>
                                          <span className="text-sm text-slate-800 truncate">{mDef?.label}</span>
                                          <span className="text-xs text-slate-400 truncate mt-0.5">{isValidValue(sourceVal) ? sourceVal : 'Empty'}</span>
                                        </div>
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-blue-600 hover:bg-blue-50 rounded-md" onClick={() => source && startEditing(field.variableName, idx, source.table, source.path, isValidValue(sourceVal) ? sourceVal : '', field.targetId, source.linking_variable)}>
                                          <Edit3 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <div
                              className={cn(
                                "text-sm h-8 flex items-center px-2.5 rounded-md transition-colors relative group",
                                persistenceSource ? "cursor-pointer border border-transparent hover:bg-slate-100" : "cursor-default",
                                isValueMissing ? "text-red-500 font-medium" : "text-slate-800"
                              )}
                              onClick={() => {
                                if (!persistenceSource) return;
                                startEditing(field.variableName, 0, persistenceSource.table, persistenceSource.path, isValueMissing ? '' : field.resolvedValue, String(editTargetId), persistenceSource.linking_variable || 'id');
                              }}
                            >
                              <span className="truncate pr-6">{isValueMissing ? 'Missing Value' : field.resolvedValue}</span>
                              {persistenceSource && !isEditing && <Edit3 className="h-4 w-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity absolute right-3 top-1/2 -translate-y-1/2" />}
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
      <div className="space-y-6 p-8 bg-slate-50 min-h-full">
        {savedScreenshotDoc && (
          <Card className="border-emerald-200 bg-emerald-50 shadow-sm rounded-xl overflow-hidden">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-medium text-sm text-slate-900">eTA Kenya Confirmation Screenshot</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{savedScreenshotDoc.file_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Saved</span>
                <Button size="sm" variant="outline" className="h-8 px-4 text-xs font-medium text-emerald-700 border-emerald-200 hover:bg-emerald-100 rounded-lg"
                  onClick={() => {
                    setPreviewingDocuments({ document_display_name: 'eTA Kenya Confirmation Screenshot', documents: [savedScreenshotDoc], person_full_name: individualName || getPrimaryTargetEntityId(), requirementId: ETA_SCREENSHOT_DOCUMENT_ID });
                    setShowPreviewModal(true);
                  }}>
                  <Eye className="h-4 w-4 mr-2" /> View File
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {allDocFields.length === 0 && !savedScreenshotDoc && (
          <div className="flex flex-col items-center justify-center p-16 opacity-50">
            <FileText className="w-16 h-16 mb-4 text-slate-300" />
            <p className="text-lg font-medium text-slate-500">No document assets required for this flow.</p>
          </div>
        )}

        {allDocFields.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Required Documents</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {allDocFields.map((req, idx) => {
                const targetId = resolveTargetEntityId(req);
                const foundDoc = documentFiles.find(d => req.linkedKycDocuments?.includes(d.document_id) && String(d.owner_id) === String(targetId));
                const displayName = req.isFromArray ? `${req.arrayFieldName} - ${req.displayName || req.name || req.variableName}` : req.displayName || req.efnsDisplayName || req.variableName;

                return (
                  <Card key={idx} className={cn("overflow-hidden transition-all rounded-xl", foundDoc ? "border-slate-200 shadow-sm bg-white" : "border-red-200 bg-red-50/50")}>
                    <CardContent className="p-5 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn("p-2 rounded-lg", foundDoc ? "bg-slate-100 text-slate-500" : "bg-red-100 text-red-600")}><Paperclip className="h-5 w-5" /></div>
                        <div className="flex-1">
                          <h4 className="font-medium text-sm text-slate-900 line-clamp-1">{displayName}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-slate-500">{req.variableName}</span>
                            {req.isFromArray && <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Array Item</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {foundDoc ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handlePreviewDocument(foundDoc)} className="h-8 px-3 text-xs font-medium text-blue-600 border-blue-200 hover:bg-blue-50 rounded-lg">
                              <Eye className="h-4 w-4 mr-1.5" /> Preview
                            </Button>
                            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Available</span>
                          </>
                        ) : (
                          <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Missing</span>
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
        <DialogContent className="max-w-[1500px] w-[98vw] h-[92vh] flex flex-col p-0 overflow-hidden bg-white border-none shadow-2xl rounded-2xl">

          {/* HEADER */}
          <div className="flex bg-white border-b border-slate-200 shrink-0 z-20">
            <div className="px-6 py-4 flex items-center justify-between w-full">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm shrink-0">
                  <Zap className="text-white w-5 h-5 fill-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold text-slate-900 leading-none">
                    Data Mapping: {task?.applicant_details?.name || task?.applicant_name || individualName || "Applicant"}
                  </DialogTitle>
                  <p className="text-sm text-slate-500 flex items-center gap-2 mt-1.5">
                    <span className="inline-flex items-center text-slate-600">
                      Task #{task?.id}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="inline-flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      ID: {getPrimaryTargetEntityId() || 'N/A'}
                    </span>
                    {isSavingScreenshot && (
                      <span className="inline-flex items-center gap-1.5 text-blue-600 text-xs font-medium ml-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving Screenshot...
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {isAutomationRunning && automationJobId && (
                  <Button onClick={stopAutomation} size="sm" variant="outline" className="h-9 px-4 text-red-600 border-red-200 hover:bg-red-50 font-medium text-sm rounded-lg transition-all">
                    <X className="h-4 w-4 mr-1.5" /> Stop Automation
                  </Button>
                )}
                <Button
                  onClick={handleRunAutomation}
                  disabled={isAutomationRunning || isSavingScreenshot || !selectedAutomationId}
                  size="sm"
                  className="h-9 px-6 bg-blue-600 text-white hover:bg-blue-700 font-medium text-sm rounded-lg transition-all"
                >
                  {(isAutomationRunning || isSavingScreenshot) ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2 fill-white" />
                  )}
                  {isSavingScreenshot ? 'Saving...' : isAutomationRunning ? 'Running...' : 'Execute Workflow'}
                </Button>
                <div className="h-8 w-px mx-1 bg-slate-200" />
                <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          {/* MAIN LAYOUT */}
          <div className="flex-1 overflow-hidden">
            <ResizablePanelGroup direction="horizontal" className="h-full">

              {/* LEFT SIDEBAR */}
              <ResizablePanel defaultSize={20} minSize={18} className="bg-slate-50 flex flex-col relative z-10 border-r border-slate-200">
                <div className="p-5 flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">

                  {/* Configuration Section */}
                  <div className="space-y-4">
                    <span className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                      <Settings className="w-6 h-6 text-slate-400" /> Setup Environment
                    </span>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-500">Select Workflow</label>
                        <SearchableSelect
                          value={selectedAutomationId}
                          onValueChange={setSelectedAutomationId}
                          options={entityAutomationMappings.map(m => ({ value: m.automationId, label: m.automation?.name || "Unnamed Flow" }))}
                          placeholder="Select Workflow..."
                          buttonClassName="w-full bg-white border-slate-200 text-slate-900 h-10 rounded-lg text-sm hover:bg-slate-50 transition-colors shadow-sm"
                          emptyMessage="No workflows found"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-500">Target Individual ID</label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <input
                            value={getPrimaryTargetEntityId()}
                            onChange={(e) => {
                              if (getPrimaryEntityType() === 'principal') setCurrentIndividualId(e.target.value);
                            }}
                            placeholder="ID Number..."
                            disabled={getPrimaryEntityType() !== 'principal'}
                            className="w-full pl-9 h-10 rounded-lg outline-none text-sm text-slate-900 bg-white border border-slate-200 placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="h-px w-full bg-slate-200" />

                  {/* Progress Section */}
                  <div className="space-y-4 flex-1 flex flex-col min-h-0">
                    <span className="text-lg font-semibold text-slate-700 flex items-center gap-2 shrink-0">
                      <Activity className="w-6 h-6 text-slate-400" /> Execution Status
                    </span>

                    {!automationProgress ? (
                      <div className="flex-1 flex flex-col items-center justify-center opacity-50 text-center px-4">
                        <Webhook className="w-10 h-10 mb-3 text-slate-400" />
                        <p className="text-sm font-medium text-slate-500">Ready to map data and execute workflow.</p>
                      </div>
                    ) : (
                      <div className="flex flex-col flex-1 min-h-0 gap-4">
                        {/* Console-like Status Container */}
                        <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden shadow-lg">
                          <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                              execution_status.log
                            </span>
                            <div className="flex gap-2">
                              <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                              <div className="w-2 h-2 rounded-full bg-red-500"></div>
                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            </div>
                          </div>
                          <div className="p-4 font-mono text-xs space-y-2">
                            <div className="text-slate-400">
                              <span className="text-emerald-400">$</span> <span className="text-slate-300">automation workflow</span>
                            </div>
                            <div className="text-slate-400">
                              <span className="text-emerald-400">→</span> <span className="text-slate-400">Status:</span> <span className={cn(
                                automationProgress.isRunning ? "text-blue-400 animate-pulse" : automationProgress.error ? "text-red-400" : "text-emerald-400"
                              )}>{automationProgress.isRunning ? '[ RUNNING ]' : automationProgress.error ? '[ FAILED ]' : '[ COMPLETED ]'}</span>
                            </div>
                            <div className="text-slate-400">
                              <span className="text-emerald-400">→</span> <span className="text-slate-400">Progress:</span> <span className="text-cyan-400">{automationProgress.progress}%</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded h-1 overflow-hidden border border-slate-700 my-2">
                              <div
                                className={cn(
                                  "h-full transition-all duration-500",
                                  automationProgress.error ? "bg-red-500" : automationProgress.isRunning ? "bg-blue-500" : "bg-emerald-500"
                                )}
                                style={{ width: `${automationProgress.progress}%` }}
                              >
                                {automationProgress.isRunning && <div className="absolute inset-0 bg-white/10 animate-pulse" />}
                              </div>
                            </div>
                            <div className="text-slate-400">
                              <span className="text-emerald-400">→</span> <span className="text-slate-400">Message:</span> <span className="text-slate-300">{automationProgress.message || 'Processing automation...'}</span>
                            </div>
                            {automationProgress.error && (
                              <div className="text-red-400 border border-red-500/30 rounded px-2 py-1 bg-red-950/20">
                                <span className="text-red-500">⚠</span> Error: {automationProgress.error}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Logs Terminal */}
                        {automationProgress.logs && automationProgress.logs.length > 0 && (
                          <div className="flex flex-col flex-1 min-h-0 bg-slate-900 rounded-lg border border-slate-700 overflow-hidden shadow-lg">
                            <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center shrink-0">
                              <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                                output.log
                              </span>
                              <span className="text-xs text-slate-500">{automationProgress.logs.length} lines</span>
                            </div>
                            <ScrollArea className="flex-1 p-3">
                              <div className="space-y-0.5 font-mono text-xs">
                                {automationProgress.logs.map((log: any, i: number) => (
                                  <div key={i} className={cn(
                                    "break-words",
                                    log.level === 'error' ? 'text-red-400' :
                                      log.level === 'warn' ? 'text-yellow-400' : 'text-slate-300'
                                  )}>
                                    <span className="text-slate-500 mr-3 select-none">
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

              <ResizableHandle withHandle className="bg-slate-200 border-none w-px z-20" />

              {/* RIGHT MAIN PANEL */}
              <ResizablePanel defaultSize={80} className="bg-white flex flex-col h-full relative z-0">
                {!selectedAutomationId ? (
                  <div className="flex-1 flex flex-col items-center justify-center opacity-50">
                    <Webhook className="w-20 h-20 mb-4 text-slate-300" />
                    <h2 className="text-xl font-medium text-slate-500">No Workflow Selected</h2>
                    <p className="text-sm text-slate-400 mt-2">Choose an automation workflow from the sidebar.</p>
                  </div>
                ) : (
                  <>
                    <div className="px-6 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
                      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto -mb-px">
                        <TabsList className="bg-transparent h-12 p-0 space-x-6">
                          <TabsTrigger
                            value="fields"
                            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 text-slate-500 font-medium text-sm rounded-none h-full px-1"
                          >
                            <Database className="h-4 w-4 mr-2" /> Mapping Fields
                          </TabsTrigger>
                          <TabsTrigger
                            value="documents"
                            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 text-slate-500 font-medium text-sm rounded-none h-full px-1"
                          >
                            <FileText className="h-4 w-4 mr-2" /> Required Assets
                            {savedScreenshotDoc && <span className="ml-2 h-2 w-2 rounded-full bg-emerald-500 inline-block" />}
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>

                      {isLoadingData && (
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                          <Loader2 className="h-4 w-4 animate-spin" /> Fetching Data...
                        </div>
                      )}
                    </div>

                    <div className="flex-1 overflow-hidden relative bg-white">
                      <Tabs value={activeTab} className="h-full flex flex-col">
                        <TabsContent value="fields" className="flex-1 overflow-hidden m-0 data-[state=active]:flex flex-col">
                          {isLoading ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                              <Loader2 className="h-8 w-8 animate-spin mb-4 text-blue-500" />
                              <p className="text-sm font-medium">Loading configuration matrix...</p>
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

      {/* Document Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-0 overflow-hidden bg-slate-50 border-none shadow-2xl rounded-2xl">
          {showPreviewModal && previewingDocuments && (
            <>
              <div className="flex bg-white border-b border-slate-200 shrink-0 z-20">
                <div className="px-6 py-4 flex items-center justify-between w-full">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                      <FileText className="text-slate-600 w-5 h-5" />
                    </div>
                    <div>
                      <DialogTitle className="text-lg font-semibold text-slate-900 line-clamp-1">
                        {previewingDocuments?.document_display_name || 'Document Verification'}
                      </DialogTitle>
                      <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5">
                          Target Entity: {previewingDocuments?.person_full_name || 'Unknown'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                      {previewingDocuments?.documents?.length || 0} File(s)
                    </span>
                    <div className="h-8 w-px mx-1 bg-slate-200" />
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