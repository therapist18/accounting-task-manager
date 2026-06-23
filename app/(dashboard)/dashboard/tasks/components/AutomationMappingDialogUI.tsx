// @ts-nocheck
"use client"

import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Loader2, Zap, User, Database, FileText, Webhook, ChevronRight, AlertCircle,
  CheckCircle2, Edit3, X, Paperclip, ArrowUpDown, Filter, Check,
  List, ChevronDown, HelpCircle, Eye, Lock
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

const ENTITY_TYPE_COLORS: Record<string, string> = {
  principal: 'bg-blue-100 text-blue-700 border-blue-200',
  dependant: 'bg-purple-100 text-purple-700 border-purple-200',
  sponsor: 'bg-amber-100 text-amber-700 border-amber-200',
  director: 'bg-green-100 text-green-700 border-green-200',
  company: 'bg-slate-100 text-slate-700 border-slate-200',
  understudy: 'bg-teal-100 text-teal-700 border-teal-200',
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
  showPreviewModal, setShowPreviewModal, previewingDocuments, setPreviewingDocuments,
}: AutomationMappingDialogUIProps) => {

  const renderFieldsTable = () => {
    if (!activeWebEntry?.fields || activeWebEntry.fields.length === 0) {
      return <div className="p-12 text-center text-slate-400 text-sm">No fields configured for this automation.</div>;
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
      <div className="flex flex-col h-full">
        <div className="px-4 py-2 bg-white border-b border-slate-100 flex flex-wrap gap-2">
          {Object.entries(entityGroupStats).map(([key, stats]) => {
            const pct = Math.round((stats.filled / stats.total) * 100);
            const allDone = stats.missing === 0;
            return (
              <div key={key} className={cn(
                "flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs",
                allDone ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"
              )}>
                <div className="flex flex-wrap gap-0.5">
                  {key.split(', ').map(t => (
                    <span key={t} className={cn(
                      "text-[8px] px-1 py-0.5 rounded uppercase font-semibold border",
                      ENTITY_TYPE_COLORS[t] || 'bg-slate-100 text-slate-600 border-slate-200'
                    )}>{t}</span>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", allDone ? "bg-green-500" : "bg-amber-500")} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={cn("font-semibold", allDone ? "text-green-700" : "text-amber-700")}>{pct}%</span>
                </div>
                {stats.defaultCount > 0 && (
                  <span className="text-[9px] text-slate-400 flex items-center gap-0.5">
                    <Lock className="h-2 w-2" />{stats.defaultCount}
                  </span>
                )}
              </div>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500">{processedFields.filter(f => !f.isMissing).length}/{processedFields.length} ready</span>
            {processedFields.filter(f => f.isMissing).length > 0 && (
              <Badge variant="destructive" className="h-5 px-2 text-[10px]">
                {processedFields.filter(f => f.isMissing).length} Missing
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200">
          <span className="text-xs font-semibold text-slate-500">{processedFields.length} fields configured</span>
          <Button
            variant={sortMissingFirst ? "default" : "outline"}
            size="sm"
            onClick={() => setSortMissingFirst(!sortMissingFirst)}
            className="h-7 text-xs"
          >
            <Filter className="h-3 w-3 mr-1.5" />
            {sortMissingFirst ? "Show All" : "Missing First"}
          </Button>
        </div>

        <div className="flex-1 overflow-hidden bg-white">
          <ScrollArea className="h-full">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-100 border-b-2 border-slate-300">
                <TableRow>
                  <TableHead className="w-12 px-2 py-3 text-center text-xs font-bold text-slate-600 border-r border-slate-200">#</TableHead>
                  <TableHead className="w-80 px-4 py-3 text-left text-xs font-bold text-slate-700 border-r border-slate-200">TARGET VARIABLE</TableHead>
                  <TableHead className="px-4 py-3 text-left text-xs font-bold text-slate-700 border-r border-slate-200">SOURCE LOGIC</TableHead>
                  <TableHead
                    className="w-44 px-4 py-3 text-left text-xs font-bold text-slate-700 border-r border-slate-200 cursor-pointer select-none hover:bg-slate-200 transition-colors"
                    onClick={() => setEntitySort(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
                  >
                    <div className="flex items-center gap-1">
                      ENTITIES
                      <ArrowUpDown className={cn("h-3 w-3 shrink-0", entitySort ? "text-blue-600" : "text-slate-300")} />
                    </div>
                  </TableHead>
                  <TableHead className="px-4 py-3 text-left text-xs font-bold text-slate-700">CURRENT VALUE</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
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
                    <TableRow key={`group-${fieldGroupKey}-${fIdx}`} className="bg-gradient-to-r from-slate-100 to-slate-50 border-y border-slate-300">
                      <TableCell colSpan={5} className="px-4 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-wrap gap-1">
                            {fieldGroupKey.split(', ').map(t => (
                              <span key={t} className={cn(
                                "text-[9px] px-1.5 py-0.5 rounded-full uppercase font-bold border",
                                ENTITY_TYPE_COLORS[t] || 'bg-slate-200 text-slate-600 border-slate-300'
                              )}>{t}</span>
                            ))}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {groupFieldsFilled}/{groupFieldsTotal} fields complete
                          </span>
                          <div className="flex-1 h-px bg-slate-200 ml-1" />
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
                          className="bg-blue-50/80 border-b border-blue-200 hover:bg-blue-100 cursor-pointer transition-colors"
                          onClick={() => toggleArrayFieldExpansion(field.variableName)}
                        >
                          <TableCell className="px-2 py-2 text-center text-xs font-bold text-blue-600 border-r border-blue-200 bg-blue-100/50">
                            {isExpanded ? <ChevronDown className="h-4 w-4 mx-auto" /> : <ChevronRight className="h-4 w-4 mx-auto" />}
                          </TableCell>
                          <TableCell colSpan={4} className="px-4 py-2">
                            <div className="flex items-center gap-3">
                              <div className="bg-blue-100 p-1 rounded text-blue-600"><List className="h-4 w-4" /></div>
                              <span className="text-sm font-bold text-slate-800">{field.efnsDisplayName || field.variableName}</span>
                              <div className="flex flex-wrap gap-1 ml-1">
                                {(field.entityTypes || []).map(type => (
                                  <Badge key={type} variant="outline" className={cn("text-[8px] h-4 px-1 uppercase font-medium", ENTITY_TYPE_COLORS[type] || 'bg-slate-100 text-slate-700')}>
                                    {type}
                                  </Badge>
                                ))}
                              </div>
                              <Badge className="bg-blue-600 text-white h-5 text-[10px] px-2 ml-auto">{arrayData.length} Items</Badge>
                            </div>
                          </TableCell>
                        </TableRow>

                        {isExpanded && arrayData.map((row, rowIndex) => (
                          (field.arrayItems || []).map((colItem, colIndex) => {
                            const uniqueKey = `${field.variableName} -${rowIndex} -${colIndex} `;
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
                              <TableRow key={uniqueKey} className={cn("group border-b border-slate-100", isItemEditing ? "bg-blue-50" : "hover:bg-slate-50")}>
                                <TableCell className="px-2 py-2 text-center text-xs font-mono text-slate-400 border-r bg-slate-50/30">
                                  {rowIndex + 1}.{colIndex + 1}
                                </TableCell>
                                <TableCell className="px-4 py-2 border-r relative">
                                  <div className="flex items-center gap-2 pl-6 relative">
                                    <div className="absolute left-3 top-0 bottom-0 w-px bg-blue-100"></div>
                                    <div className="absolute left-3 top-1/2 w-3 h-px bg-blue-200"></div>
                                    <span className="text-xs text-slate-700 font-medium">{colItem.displayName || colItem.variableName}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="px-4 py-2">
                                  <Badge variant="outline" className="text-[8px] h-4 uppercase">{colItem.sourceLogic || 'priority'}</Badge>
                                </TableCell>
                                <TableCell className="px-4 py-2">
                                  <div className="flex flex-wrap gap-1">
                                    {(colItem.entityTypes || field.entityTypes || []).map(type => (
                                      <Badge key={type} variant="outline" className={cn("text-[8px] h-4 px-1 uppercase", ENTITY_TYPE_COLORS[type] || 'bg-slate-100 text-slate-700')}>
                                        {type}
                                      </Badge>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell className="px-4 py-1">
                                  {isItemEditing ? (
                                    <div className="flex items-center gap-2">
                                      {isDropdown ? (
                                        <SearchableSelect
                                          value={editValue}
                                          onValueChange={(val) => setEditValue(val)}
                                          options={normalizedOptions}
                                          placeholder="Select..."
                                          buttonClassName="h-7 text-xs border-blue-400 w-full bg-white"
                                        />
                                      ) : (
                                        <Input
                                          autoFocus
                                          value={editValue}
                                          onChange={e => setEditValue(e.target.value)}
                                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); }}
                                          className="h-7 text-xs border-blue-400"
                                        />
                                      )}
                                      <Button
                                        size="icon"
                                        onClick={() => saveEdit(isDropdown, normalizedOptions)}
                                        className="h-7 w-7 bg-green-600 shrink-0"
                                      >
                                        <Check className="h-3 w-3" />
                                      </Button>
                                      <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-7 w-7 text-red-500 shrink-0"><X className="h-3 w-3" /></Button>
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
                                                "text-xs h-6 flex items-center px-2 rounded cursor-pointer border border-dashed border-blue-200 bg-blue-50/20 hover:bg-blue-50 transition-colors",
                                                isItemMissing ? "text-red-500 italic" : "text-slate-900"
                                              )}>
                                                <span className="truncate flex-1">{isItemMissing ? 'Missing' : rawValue}</span>
                                                <ChevronDown className="h-3 w-3 ml-2 text-blue-400 shrink-0" />
                                              </div>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-72 p-0 shadow-xl border-blue-100" align="end">
                                              <div className="p-2 bg-slate-50 border-b flex justify-between items-center">
                                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Array Row Sources</span>
                                                <Badge className="text-[8px] h-4 bg-blue-100 text-blue-700 border-blue-200 uppercase">{colItem.sourceLogic || 'priority'}</Badge>
                                              </div>
                                              <div className="p-1 space-y-1">
                                                {mIds.map((mid, mIdx) => {
                                                  const mDef = jobFields[String(mid)];
                                                  const mSource = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
                                                  const val = getFieldValue(String(mid), String(row.entityId));

                                                  return (
                                                    <div key={`am - ${mid} `} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 group">
                                                      <div className="flex flex-col min-w-0">
                                                        <span className="text-[9px] font-bold text-blue-600 flex items-center gap-1">
                                                          <Database className="h-2.5 w-2.5" /> Source {mIdx + 1}
                                                        </span>
                                                        <span className="text-[11px] font-medium truncate text-slate-700">{mDef?.label}</span>
                                                        <span className="text-[10px] text-slate-400 italic truncate">{isValidValue(val) ? val : 'Empty'}</span>
                                                      </div>
                                                      <Button
                                                        size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                                        onClick={() => mSource && startEditing(uniqueKey, mIdx, mSource.table, mSource.path, isValidValue(val) ? val : '', row.entityId, mSource.linking_variable)}
                                                      >
                                                        <Edit3 className="h-3 w-3 text-blue-500" />
                                                      </Button>
                                                    </div>
                                                  );
                                                })}

                                                {qIds.map((qid, qIdx) => {
                                                  const qDef = requirementJobQuestions.find(q => String(q.id) === String(qid));
                                                  const answers = sourceData['tm_tasks']?.[String(taskId)]?.job_specific_answers || {};
                                                  const val = answers[String(qid)] ?? answers[Number(qid)];

                                                  return (
                                                    <div key={`aq - ${qid} `} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 group">
                                                      <div className="flex flex-col min-w-0">
                                                        <span className="text-[9px] font-bold text-purple-600 flex items-center gap-1">
                                                          <HelpCircle className="h-2.5 w-2.5" /> Question
                                                        </span>
                                                        <span className="text-[11px] font-medium truncate text-slate-700">{qDef?.label || qid}</span>
                                                        <span className="text-[10px] text-slate-400 italic truncate">{isValidValue(val) ? val : 'Empty'}</span>
                                                      </div>
                                                      <Button
                                                        size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                                        onClick={() => startEditing(uniqueKey, 99 + qIdx, 'tm_tasks', `job_specific_answers ->> '${qid}'`, isValidValue(val) ? val : '', taskId, 'id')}
                                                      >
                                                        <Edit3 className="h-3 w-3 text-blue-500" />
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
                                              "text-xs h-6 flex items-center px-2 rounded cursor-pointer hover:bg-white border border-transparent hover:border-blue-200 transition-colors",
                                              isItemMissing ? "text-red-500 italic" : "text-slate-900"
                                            )}
                                            onClick={() => {
                                              if (!arrayPersist) return;
                                              startEditing(uniqueKey, 0, arrayPersist.table, arrayPersist.path, isItemMissing ? '' : rawValue, String(arrayEditId), arrayPersist.linking_variable || 'id');
                                            }}
                                          >
                                            <span className="truncate">{isItemMissing ? 'Missing' : rawValue}</span>
                                            {arrayPersist && <Edit3 className="h-3 w-3 ml-auto text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
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
                        <TableRow className="group border-b border-slate-200 hover:bg-slate-50">
                          <TableCell className="px-2 py-2 text-center text-xs font-mono text-slate-400 border-r bg-slate-50">{fIdx + 1}</TableCell>
                          <TableCell className="px-4 py-2 border-r">
                            <div className="flex items-center gap-2">
                              <Paperclip className="h-4 w-4 text-amber-600" />
                              <span className="text-sm font-semibold text-slate-900">{field.efnsDisplayName || field.variableName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-2">
                            <Badge variant="outline" className="text-[9px] border-amber-200 text-amber-700 bg-amber-50 uppercase">Asset Mapping</Badge>
                          </TableCell>
                          <TableCell className="px-4 py-2">
                            <div className="flex flex-wrap gap-1">
                              {(field.entityTypes || []).map(type => (
                                <Badge key={type} variant="outline" className={cn("text-[8px] h-4 px-1 uppercase", ENTITY_TYPE_COLORS[type] || 'bg-slate-100 text-slate-700')}>
                                  {type}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-2 border-r">
                            {foundDoc ? (
                              <div className="flex items-center gap-2">
                                <Badge className="bg-green-600 text-white h-6">Available</Badge>
                                <Button size="sm" variant="outline" onClick={() => handlePreviewDocument(foundDoc)} className="h-6 px-2 text-[10px]">
                                  <Eye className="h-3 w-3 mr-1" /> Preview
                                </Button>
                              </div>
                            ) : <Badge variant="destructive" className="h-6">Missing</Badge>}
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
                      <TableRow className={cn("group border-b border-slate-200 transition-colors", isDefaultField ? "bg-slate-50/60" : isEditing ? "bg-blue-50/50" : (field.fieldType === 'computed' ? "bg-purple-50/10" : "hover:bg-blue-50"))}>
                        <TableCell className="px-2 py-2 text-center text-xs font-mono text-slate-400 border-r bg-slate-50">{fIdx + 1}</TableCell>
                        <TableCell className="px-4 py-2 border-r">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              {isDefaultField && <Lock className="h-3 w-3 text-slate-400 shrink-0" />}
                              <span className={cn("text-sm font-semibold", isDefaultField ? "text-slate-500" : "text-slate-900")}>{field.efnsDisplayName || field.variableName}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono tracking-tighter">{field.variableName}</span>
                          </div>
                        </TableCell>

                        <TableCell className="px-4 py-2">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              {field.customFieldSource || 'System'}
                              <div className="flex flex-col gap-1">
                                {isDefaultField ? (
                                  <Badge variant="outline" className="text-[8px] h-5 border-slate-300 text-slate-500 bg-slate-100 gap-0.5">
                                    <Lock className="h-2 w-2" /> Preset Default
                                  </Badge>
                                ) : (
                                  <>
                                    {field.linkedMasterFields?.length > 0 && (
                                      <Badge variant="outline" className="text-[8px] h-5 border-blue-200 text-blue-700 bg-blue-50">
                                        Master Field
                                      </Badge>
                                    )}
                                    {field.linkedJobQuestionIds?.length > 0 && (
                                      <Badge variant="outline" className="text-[8px] h-5 border-purple-200 text-purple-700 bg-purple-50">
                                        Job Question
                                      </Badge>
                                    )}
                                    {(!field.linkedMasterFields?.length && !field.linkedJobQuestionIds?.length) && (
                                      <Badge variant="outline" className="text-[8px] h-5 border-slate-200 text-slate-600">
                                        Requirement
                                      </Badge>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {(field.entityTypes || []).map(type => (
                              <Badge key={type} variant="outline" className={cn("text-[8px] h-4 px-1 uppercase", ENTITY_TYPE_COLORS[type] || 'bg-slate-100 text-slate-700')}>
                                {type}
                              </Badge>
                            ))}
                            {(!field.entityTypes || field.entityTypes.length === 0) && (
                              <span className="text-[10px] text-slate-400">—</span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="px-4 py-1 border-r h-full">
                          {isDefaultField ? (
                            <div className="flex items-center gap-2 h-7">
                              <span className="text-sm text-slate-500 truncate flex-1">{field.resolvedValue}</span>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex items-center gap-0.5 text-[9px] font-medium text-slate-400 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 cursor-default shrink-0">
                                      <Lock className="h-2.5 w-2.5" /> Default
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="text-xs max-w-xs">
                                    This value is preset by the automation settings and cannot be changed here.
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
                                  buttonClassName="h-8 text-sm border-blue-400 w-full bg-white"
                                />
                              ) : (
                                <Input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); }} className="h-8 text-sm border-blue-400" />
                              )}
                              <Button size="icon" onClick={() => saveEdit(isDropdown, normalizedOptions)} className="h-8 w-8 bg-green-600 hover:bg-green-700"><Check className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-8 w-8 text-red-500"><X className="h-4 w-4" /></Button>
                            </div>
                          ) : (
                            (mIds.length + qIds.length) > 1 ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <div className={cn(
                                    "text-sm h-7 flex items-center px-2 rounded cursor-pointer border border-dashed border-blue-300 bg-blue-50/30 hover:bg-blue-50 transition-colors",
                                    isValueMissing ? "text-red-600 font-medium italic" : "text-slate-900"
                                  )}>
                                    {field.resolvedValue}
                                    <ChevronDown className="h-3 w-3 ml-auto text-blue-500" />
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 p-0 shadow-xl border-blue-100" align="end">
                                  <div className="p-2 bg-slate-50 border-b text-[10px] font-bold text-slate-500 uppercase">
                                    Linked Sources (Priority Order)
                                  </div>
                                  <div className="p-1 space-y-1">
                                    {mIds.map((mid, idx) => {
                                      const mDef = jobFields[String(mid)];
                                      const source = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
                                      const sourceVal = getFieldValue(String(mid), String(field.targetId));

                                      return (
                                        <div key={`m - ${mid} `} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 group">
                                          <div className="flex flex-col min-w-0">
                                            <span className="text-[10px] font-bold text-blue-600 flex items-center gap-1">
                                              <Database className="h-3 w-3" /> DB FIELD {idx + 1}
                                            </span>
                                            <span className="text-xs font-medium truncate text-slate-700">{mDef?.label}</span>
                                            <span className="text-[11px] text-slate-500 truncate italic">{isValidValue(sourceVal) ? sourceVal : 'Empty'}</span>
                                          </div>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                                            onClick={() => source && startEditing(field.variableName, idx, source.table, source.path, isValidValue(sourceVal) ? sourceVal : '', field.targetId, source.linking_variable)}
                                          >
                                            <Edit3 className="h-3 w-3 text-blue-500" />
                                          </Button>
                                        </div>
                                      );
                                    })}

                                    {qIds.map((qid, idx) => {
                                      const qDef = requirementJobQuestions.find(q => String(q.id) === String(qid));
                                      const sourceVal = getFieldValue(field.variableName, String(field.targetId));

                                      return (
                                        <div key={`q - ${qid} `} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 group">
                                          <div className="flex flex-col min-w-0">
                                            <span className="text-[10px] font-bold text-purple-600 flex items-center gap-1">
                                              <HelpCircle className="h-3 w-3" /> QUESTION
                                            </span>
                                            <span className="text-xs font-medium truncate text-slate-700">{qDef?.label || qid}</span>
                                            <span className="text-[11px] text-slate-500 truncate italic">{isValidValue(sourceVal) ? sourceVal : 'Empty'}</span>
                                          </div>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                                            onClick={() => startEditing(field.variableName, 99 + idx, 'tm_tasks', `job_specific_answers ->> '${qid}'`, isValidValue(sourceVal) ? sourceVal : '', taskId, 'id')}
                                          >
                                            <Edit3 className="h-3 w-3 text-blue-500" />
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
                                  "text-sm h-7 flex items-center px-2 rounded -my-1 transition-colors relative",
                                  persistenceSource ? "cursor-pointer border border-transparent hover:border-blue-400 hover:bg-blue-50" : "cursor-default",
                                  isValueMissing ? "text-red-600 font-medium italic" : "text-slate-900"
                                )}
                                onClick={() => {
                                  if (!persistenceSource) return;
                                  startEditing(field.variableName, 0, persistenceSource.table, persistenceSource.path, isValueMissing ? '' : field.resolvedValue, String(editTargetId), persistenceSource.linking_variable || 'id');
                                }}
                              >
                                {field.resolvedValue}
                                {persistenceSource && !isEditing && <Edit3 className="h-3 w-3 ml-auto text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2" />}
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
          </ScrollArea>
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
      <div className="space-y-4">
        {savedScreenshotDoc && (
          <Card className="border-green-300 bg-green-50/40 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">eTA Kenya Confirmation Screenshot</h4>
                  <p className="text-[10px] text-slate-500">{savedScreenshotDoc.file_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-green-600 text-white">Saved</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  onClick={() => {
                    setPreviewingDocuments({
                      document_display_name: 'eTA Kenya Confirmation Screenshot',
                      documents: [savedScreenshotDoc],
                      person_full_name: individualName || getPrimaryTargetEntityId(),
                      requirementId: ETA_SCREENSHOT_DOCUMENT_ID,
                    });
                    setShowPreviewModal(true);
                  }}
                >
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
              ? `${req.arrayFieldName} - ${req.displayName || req.name || req.variableName} `
              : req.displayName || req.efnsDisplayName || req.variableName;

            return (
              <Card key={idx} className={cn("overflow-hidden border transition-all", foundDoc ? "border-green-200 shadow-sm" : "border-red-200 bg-red-50/10")}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", foundDoc ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600")}><Paperclip className="h-4 w-4" /></div>
                    <div className="flex-1">
                      <h4 className="font-bold text-sm text-slate-900">{displayName}</h4>
                      <p className="text-[10px] text-slate-500">
                        Target: {req.isFromArray ? `${req.arrayVariableName}.${req.variableName} ` : req.variableName}
                      </p>
                      {req.isFromArray && (
                        <p className="text-[9px] text-blue-600 font-medium">Array Item</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {foundDoc && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePreviewDocument(foundDoc)}
                          className="h-8 px-2 text-xs"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Preview
                        </Button>
                        <Badge className="bg-green-600">Available</Badge>
                      </>
                    )}
                    {!foundDoc && <Badge variant="destructive">Missing</Badge>}
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
        <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl bg-white">
          {/* HEADER */}
          <div className="p-6 border-b bg-gradient-to-r from-blue-600 to-blue-500 flex items-center justify-between shadow-lg relative">
            <button
              onClick={onClose}
              className="absolute right-6 top-6 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 disabled:pointer-events-none z-50"
            >
              <X className="h-5 w-5 text-white" />
              <span className="sr-only">Close</span>
            </button>

            <div className="flex items-center gap-4 pr-8">
              <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center text-white backdrop-blur">
                <Zap className="h-6 w-6 fill-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-black text-white tracking-tight">
                  Data Mapping: {task?.applicant_details?.name || task?.applicant_name || individualName || "Applicant"}
                </DialogTitle>
                <div className="flex items-center gap-2 text-white/80 text-sm mt-0.5">
                  <span className="bg-white/10 px-1.5 py-0.5 rounded font-mono">Task #{task?.id}</span>
                  <span>•</span>
                  <span>ID: {getPrimaryTargetEntityId() || 'N/A'}</span>
                  {savedScreenshotDoc && (
                    <span className="flex items-center gap-1 bg-green-500/20 border border-green-400/30 px-2 py-0.5 rounded-full text-green-200 text-xs">
                      <CheckCircle2 className="h-3 w-3" /> Screenshot Saved
                    </span>
                  )}
                  {isSavingScreenshot && (
                    <span className="flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-full text-white/70 text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" /> Saving screenshot...
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <SearchableSelect
                value={selectedAutomationId}
                onValueChange={setSelectedAutomationId}
                options={entityAutomationMappings.map(m => ({ value: m.automationId, label: m.automation?.name || "Unnamed Flow" }))}
                placeholder="Select Workflow"
                buttonClassName="w-[250px] bg-white/10 border-white/20 text-white h-10"
                emptyMessage="No workflows found"
              />

              <div className="h-10 w-px bg-white/20" />

              <div className="flex items-center gap-2 bg-white/10 backdrop-blur px-3 py-2 rounded-lg border border-white/20">
                <User className="h-4 w-4 text-white" />
                <input
                  value={getPrimaryTargetEntityId()}
                  onChange={(e) => {
                    const primaryEntityType = getPrimaryEntityType();
                    if (primaryEntityType === 'principal') {
                      setCurrentIndividualId(e.target.value);
                    }
                  }}
                  placeholder="ID Number..."
                  className="w-28 outline-none text-sm font-semibold text-white bg-transparent placeholder:text-white/50"
                  disabled={getPrimaryEntityType() !== 'principal'}
                />
              </div>
            </div>
          </div>

          {/* CONTENT AREA */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {automationProgress && (
              <div className="p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${automationProgress.isRunning ? 'bg-blue-100' : automationProgress.error ? 'bg-red-100' : 'bg-green-100'}`}>
                      {automationProgress.isRunning ? (
                        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                      ) : automationProgress.error ? (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">
                        {automationProgress.isRunning ? 'Automation in Progress' : automationProgress.error ? 'Automation Failed' : 'Automation Complete'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {automationProgress.currentStep || 'Processing...'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      {automationProgress.progress}%
                    </div>
                    <div className="text-xs text-slate-500">
                      {automationProgress.isRunning ? 'Running' : 'Done'}
                    </div>
                  </div>
                </div>

                <div className="w-full bg-slate-200 rounded-full h-3 mb-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full transition-all duration-500 ease-out ${automationProgress.error ? 'bg-gradient-to-r from-red-400 to-red-500' : automationProgress.isRunning ? 'bg-gradient-to-r from-blue-500 to-indigo-500' : 'bg-gradient-to-r from-green-400 to-green-500'}`}
                    style={{ width: `${automationProgress.progress}%` }}
                  >
                    <div className="h-full w-full bg-white/20 animate-pulse" />
                  </div>
                </div>

                <div className="flex items-start gap-2 text-sm text-slate-700">
                  <div className="mt-0.5">
                    {automationProgress.isRunning ? (
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                    ) : automationProgress.error ? (
                      <div className="w-2 h-2 bg-red-500 rounded-full" />
                    ) : (
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                    )}
                  </div>
                  <p className="flex-1">
                    {automationProgress.message || 'Processing automation...'}
                  </p>
                </div>

                {automationProgress.error && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm font-medium text-red-700">
                      Error: {automationProgress.error}
                    </p>
                  </div>
                )}

                {automationJobId && (
                  <div className="mt-2 text-xs text-slate-400">
                    Job ID: {automationJobId}
                  </div>
                )}

                {automationProgress.logs && automationProgress.logs.length > 0 && (
                  <div className="mt-3 rounded-lg overflow-hidden border border-slate-700">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800">
                      <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider">Automation Logs</span>
                      <span className="text-[10px] text-slate-500">{automationProgress.logs.length} lines</span>
                    </div>
                    <ScrollArea className="h-52 bg-slate-950">
                      <div className="p-3 space-y-px font-mono">
                        {automationProgress.logs.map((log: any, i: number) => (
                          <div key={i} className={cn(
                            "text-[11px] leading-relaxed whitespace-pre-wrap break-all",
                            log.level === 'error' ? 'text-red-400' :
                              log.level === 'warn' ? 'text-yellow-400' :
                                'text-green-300'
                          )}>
                            <span className="text-slate-600 mr-2 select-none">
                              {new Date(log.timestamp).toLocaleTimeString()}
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

            {!selectedAutomationId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                <Webhook className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">Select a workflow to begin</p>
              </div>
            ) : (
              <>
                <div className="px-6 py-3 bg-slate-50 border-b flex items-center justify-between">
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="bg-white border border-slate-200 h-9">
                      <TabsTrigger value="fields" className="text-xs"><Database className="h-3 w-3 mr-2" />Fields</TabsTrigger>
                      <TabsTrigger value="documents" className="text-xs">
                        <FileText className="h-3 w-3 mr-2" />Documents
                        {savedScreenshotDoc && <span className="ml-1 h-2 w-2 rounded-full bg-green-500 inline-block" />}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {isLoadingData && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading data...
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-hidden">
                  <Tabs value={activeTab} className="h-full">
                    <TabsContent value="fields" className="h-full m-0">
                      {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                          <Loader2 className="h-8 w-8 animate-spin mb-2" />
                          <p>Loading configuration...</p>
                        </div>
                      ) : renderFieldsTable()}
                    </TabsContent>
                    <TabsContent value="documents" className="h-full p-6 overflow-auto">
                      {renderDocumentsSection()}
                    </TabsContent>
                  </Tabs>
                </div>
              </>
            )}
          </div>

          {/* FOOTER */}
          <div className="p-6 border-t bg-white flex justify-between items-center shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Automation Ready</span>
              <span className="text-sm text-blue-600 font-bold truncate max-w-[400px]">
                {selectedMapping?.automation?.name || "Select Workflow"}
              </span>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={onClose}
                className="px-6 font-semibold uppercase text-xs tracking-wide text-slate-500 hover:text-slate-700"
              >
                Close
              </Button>
              {isAutomationRunning && automationJobId && (
                <Button
                  variant="destructive"
                  onClick={stopAutomation}
                  className="px-6 h-11 font-bold uppercase text-xs tracking-wide"
                >
                  <X className="mr-2 h-4 w-4" />
                  Stop
                </Button>
              )}
              <Button
                onClick={handleRunAutomation}
                disabled={isAutomationRunning || isSavingScreenshot}
                className="px-10 bg-blue-600 hover:bg-blue-700 h-11 text-white font-bold uppercase text-xs tracking-wide transition-all"
              >
                {(isAutomationRunning || isSavingScreenshot) ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4 fill-white" />
                )}
                {isSavingScreenshot ? 'Saving Screenshot...' : 'Execute Workflow'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] flex flex-col p-0 overflow-hidden bg-slate-50">
          {showPreviewModal && previewingDocuments && (
            <>
              <DialogHeader className="p-4 border-b bg-white shrink-0 relative">
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
                >
                  <X className="h-5 w-5 text-slate-600" />
                  <span className="sr-only">Close</span>
                </button>

                <div className="flex items-center justify-between pr-8">
                  <div>
                    <DialogTitle className="text-xl">
                      <div className="flex items-center p-2">
                        <div className="bg-white p-2 rounded-lg border shadow-sm">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="flex flex-col">
                          <p className="text-xl font-bold text-slate-800 line-clamp-1">{previewingDocuments?.document_display_name || 'Document'}</p>
                        </div>
                      </div>
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">
                      Target: {previewingDocuments?.person_full_name || 'Unknown'}
                    </p>
                  </div>

                  <div className="text-sm font-medium bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-100">
                    {previewingDocuments?.documents?.length || 0} File(s)
                  </div>
                </div>
                <DialogDescription className="sr-only">
                  Document extraction and verification interface.
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-auto p-4">
                {previewingDocuments?.documents?.map((doc, index) => {
                  const docId = doc.id || `doc - ${index} `;

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
                        onDataChange={(fieldName, value) => {
                          handlePreviewDataChange(docId, fieldName, value);
                        }}
                        documentTypes={[]}
                        type={doc.director_id ? 'individual' : 'company'}
                        file={doc}
                        extractionStatus={doc.extraction_status || 'success'}
                        supabase={supabase}
                        onDialogClose={() => {
                          setShowPreviewModal(false);
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="p-6 border-t bg-white flex justify-between items-center shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Document Preview</span>
                  <span className="text-sm text-blue-600 font-bold">
                    {previewingDocuments?.document_display_name || 'Document'}
                  </span>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowPreviewModal(false)}
                  className="px-6 font-semibold uppercase text-xs tracking-wide text-slate-500 hover:text-slate-700"
                >
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
