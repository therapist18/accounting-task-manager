'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, RotateCcw, Database, PenLine, Building2, FileText, AlertCircle, ImageIcon, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EcPlaceholder } from '../../employment-contracts/utils/ecPlaceholders';
import { MasterFieldEditControl } from '../../employment-contracts/components/MasterFieldEditControl';
import type { JobField } from '../../master-fields/components/types/database';
import { DirectorsPicker } from './DirectorsPicker';
import type { CompanyDirector } from '../hooks/useCompanyDirectors';
import { UploadModal } from '@/app/generic-components/UploadModal';

interface DataValuesPanelProps {
  companySelected: boolean;
  loading: boolean;
  placeholders: EcPlaceholder[];
  // Values resolved from linked master fields for the selected company.
  resolvedValues: Record<string, string>;
  // This company's saved overrides (cc_engagements.placeholder_overrides).
  overrides: Record<string, string>;
  onOverrideChange: (key: string, value: string | undefined) => void;
  // Raw tm_job_fields rows behind the linked placeholders, keyed by id - lets
  // MasterFieldEditControl edit-and-save-to-source without a second fetch.
  masterFields: Map<number, JobField>;
  companyId: string | null;
  onRefresh: () => void;
  // Directors/shareholders picker - see hooks/useCompanyDirectors.ts and
  // utils/directorsBlock.ts.
  directors: CompanyDirector[];
  selectedDirectorIds: string[];
  onDirectorsChange: (ids: string[]) => void;
}

// _vat_fee/_gross_fee tokens are always derived from the matching _net_fee
// value (see utils/feeCalculations.ts) - the admin only ever types the Net
// figure, so the computed siblings are hidden here rather than inviting a
// manual entry that gets silently superseded. directors_acknowledgement_block
// is likewise fully derived, from the Directors picker below rather than a
// text field (see utils/directorsBlock.ts).
function isComputedKey(key: string): boolean {
  return key.endsWith('_vat_fee') || key.endsWith('_gross_fee') || key === 'directors_acknowledgement_block';
}

export function DataValuesPanel({
  companySelected, loading, placeholders, resolvedValues, overrides, onOverrideChange,
  masterFields, companyId, onRefresh, directors, selectedDirectorIds, onDirectorsChange,
}: DataValuesPanelProps) {
  const [dataFilter, setDataFilter] = useState<'all' | 'with' | 'missing'>('all');

  const scopedPlaceholders = useMemo(
    () => placeholders.filter((p) => !isComputedKey(p.key)),
    [placeholders]
  );

  const placeholderIsMissing = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of scopedPlaceholders) {
      const sourceValue = resolvedValues[p.key] ?? p.default_value ?? '';
      const effectiveVal = Object.prototype.hasOwnProperty.call(overrides, p.key) ? overrides[p.key] : sourceValue;
      map.set(p.id, !effectiveVal);
    }
    return map;
  }, [scopedPlaceholders, resolvedValues, overrides]);

  const missingCount = useMemo(() => scopedPlaceholders.filter((p) => placeholderIsMissing.get(p.id)).length, [scopedPlaceholders, placeholderIsMissing]);
  const withDataCount = scopedPlaceholders.length - missingCount;

  const dataFilteredPlaceholders = useMemo(() => {
    if (dataFilter === 'all') return scopedPlaceholders;
    return scopedPlaceholders.filter((p) => {
      const missing = !!placeholderIsMissing.get(p.id);
      return dataFilter === 'missing' ? missing : !missing;
    });
  }, [scopedPlaceholders, dataFilter, placeholderIsMissing]);

  const grouped = useMemo(() => {
    const groups = new Map<string, EcPlaceholder[]>();
    for (const p of dataFilteredPlaceholders) {
      if (!groups.has(p.group_label)) groups.set(p.group_label, []);
      groups.get(p.group_label)!.push(p);
    }
    return Array.from(groups.entries());
  }, [dataFilteredPlaceholders]);

  if (!companySelected) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8">
        <Building2 className="w-10 h-10 text-slate-300 mb-3" />
        <p className="text-sm font-medium text-slate-500">Select a client company</p>
        <p className="text-xs text-slate-400 mt-1">Its data & values will appear here for review.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-5 space-y-6">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2.5">Directors / Shareholders</h3>
          <DirectorsPicker directors={directors} selectedIds={selectedDirectorIds} onChange={onDirectorsChange} />
        </div>

        {/* Toolbar: title + All/With Data/Missing filter - same segmented
            control as employment-contracts/components/ContractEditor.tsx's
            own Contract Fields toolbar. */}
        <div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-custom-blue" /> Contract Fields
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Review and override placeholders resolved for this agreement.</p>
            </div>
            <div className="p-0.5 bg-slate-200/50 dark:bg-slate-800/80 rounded-lg inline-flex items-center shadow-inner shrink-0">
              {([
                { key: 'all', label: 'All', count: scopedPlaceholders.length },
                { key: 'with', label: 'With Data', count: withDataCount },
                { key: 'missing', label: 'Missing', count: missingCount },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setDataFilter(tab.key)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1.5",
                    dataFilter === tab.key
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                  )}
                >
                  {tab.label}
                  <span className={cn(
                    "text-[9px] px-1.5 py-px rounded-full font-bold",
                    dataFilter === tab.key
                      ? (tab.key === 'missing' && tab.count > 0 ? "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400" : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300")
                      : "bg-transparent"
                  )}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Column definitions header - 3-column structure (Field / Source /
              Value), same as ContractEditor.tsx's own column header row. */}
          {dataFilteredPlaceholders.length > 0 && (
            <div className="hidden md:grid grid-cols-[35%_20%_1fr] gap-4 px-4 py-1.5 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <div>Placeholder Field</div>
              <div>Data Source</div>
              <div>Resolved Output</div>
            </div>
          )}
        </div>

        {grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-4 bg-white/50 dark:bg-slate-900/30 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl">
            <p className="text-sm text-slate-400 text-center">
              {scopedPlaceholders.length === 0 ? 'No placeholders configured yet - add them from Settings.' : 'No matching fields for this filter.'}
            </p>
          </div>
        )}
        {grouped.map(([group, items]) => (
          <div key={group} className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">{group}</h4>
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200/60 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
              {items.map((p) => (
                <PlaceholderRow
                  key={p.id}
                  placeholder={p}
                  resolvedValue={resolvedValues[p.key] ?? p.default_value ?? ''}
                  overrideValue={overrides[p.key]}
                  isMissing={!!placeholderIsMissing.get(p.id)}
                  masterFields={masterFields}
                  companyId={companyId}
                  onOverride={(v) => onOverrideChange(p.key, v)}
                  onRefresh={onRefresh}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function PlaceholderRow({
  placeholder: p, resolvedValue, overrideValue, isMissing, masterFields, companyId, onOverride, onRefresh,
}: {
  placeholder: EcPlaceholder;
  resolvedValue: string;
  overrideValue: string | undefined;
  isMissing: boolean;
  masterFields: Map<number, JobField>;
  companyId: string | null;
  onOverride: (val: string | undefined) => void;
  onRefresh: () => void;
}) {
  const isOverridden = overrideValue !== undefined;
  const effectiveVal = overrideValue ?? resolvedValue;
  const linked = p.source_kind === 'master_field' && !!p.master_field_id;
  const sourceLabel = linked ? (masterFields.get(Number(p.master_field_id))?.label || 'Master field') : 'Manual';

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const uploadTarget = useMemo(() => {
    if (p.type !== 'image' || !p.master_field_id || !masterFields) return null;
    const mf = masterFields.get(Number(p.master_field_id));
    const source = mf?.sources?.[0];
    if (!source?.table || !companyId) return null;
    const docIds = Array.isArray(source.document_id) ? source.document_id : (source.document_id ? [source.document_id] : []);
    return {
      targetTable: source.table,
      idFieldName: source.linking_variable || 'company_id',
      entityId: String(companyId),
      documentId: docIds[0] || null,
      isCompanyUpload: (source.linking_variable || '') === 'company_id',
    };
  }, [p, masterFields, companyId]);

  return (
    <div className={cn(
      "grid grid-cols-1 md:grid-cols-[35%_20%_1fr] gap-4 p-4 items-center transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 relative overflow-hidden",
      isMissing && p.required ? "bg-rose-50/30 dark:bg-rose-900/10" : ""
    )}>
      <div className={cn(
        "absolute left-0 top-0 bottom-0 w-[3px]",
        isMissing ? (p.required ? "bg-rose-500" : "bg-amber-400") : isOverridden ? "bg-custom-blue" : "bg-transparent"
      )} />

      {/* Column 1: Field Label & Status */}
      <div className="flex flex-col gap-1 pr-2 pl-2">
        <div className="flex items-center gap-2">
          {isMissing && (
            <AlertCircle className={cn("w-3.5 h-3.5 shrink-0", p.required ? "text-rose-500" : "text-amber-500")} />
          )}
          <Label className={cn(
            "text-xs font-semibold truncate",
            isMissing && p.required ? "text-rose-900 dark:text-rose-200" : "text-slate-700 dark:text-slate-200"
          )} title={p.label}>
            {p.label}
            {p.required && <span className="text-red-400 ml-0.5">*</span>}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          {isOverridden && (
            <Badge variant="outline" className="text-[9px] uppercase font-bold tracking-wider h-4 px-1 rounded bg-blue-50 text-custom-blue border-blue-200 dark:bg-blue-500/20 dark:border-blue-500/30">
              Modified
            </Badge>
          )}
          <span className="text-[10px] text-slate-400 font-mono">{`{{${p.key}}}`}</span>
        </div>
      </div>

      {/* Column 2: Data Source Tag */}
      <div className="hidden md:flex items-center">
        <span className={cn(
          "px-2 py-0.5 rounded-md text-[10px] font-medium truncate max-w-full inline-flex items-center gap-1.5 border",
          linked ? "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                 : "bg-blue-50 text-custom-blue border-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800"
        )} title={sourceLabel}>
          {linked ? <Database className="w-2.5 h-2.5" /> : <PenLine className="w-2.5 h-2.5" />}
          {sourceLabel}
        </span>
      </div>

      {/* Column 3: Value Control */}
      <div className="flex items-center gap-2">
        {p.type === 'image' ? (
          <div className="flex-1">
            {effectiveVal ? (
              <div className="relative border rounded overflow-hidden flex items-center justify-center bg-slate-50 h-[40px] group">
                <img src={effectiveVal} className="max-h-full object-contain" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  {uploadTarget && (
                    <button type="button" onClick={() => setUploadModalOpen(true)} className="h-6 bg-white/20 hover:bg-white/30 text-white rounded px-2 text-[9px]">
                      Upload New
                    </button>
                  )}
                  {isOverridden && (
                    <button type="button" onClick={() => onOverride(undefined)} className="h-6 bg-red-500/80 hover:bg-red-500 text-white rounded px-2 text-[9px]">
                      Reset
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => uploadTarget && setUploadModalOpen(true)}
                disabled={!uploadTarget}
                className={cn("w-full h-[40px] border border-dashed rounded-lg flex items-center justify-center text-xs gap-2 transition-colors", uploadTarget ? "border-slate-300 hover:border-custom-blue hover:bg-blue-50/50 text-slate-500 hover:text-custom-blue" : "border-slate-200 bg-slate-50 text-slate-400 opacity-50 cursor-not-allowed")}
              >
                <UploadCloud className="w-4 h-4" />
                {uploadTarget ? "Upload Image" : "Missing Config"}
              </button>
            )}
            {uploadModalOpen && uploadTarget && (
              <UploadModal
                isOpen={uploadModalOpen}
                onClose={() => setUploadModalOpen(false)}
                title={`Upload ${p.label}`}
                table={uploadTarget.targetTable}
                documentId={uploadTarget.documentId || ''}
                entityId={uploadTarget.entityId}
                idFieldName={uploadTarget.idFieldName}
                isCompanyUpload={uploadTarget.isCompanyUpload}
                onUploadComplete={() => {
                  setUploadModalOpen(false);
                  onRefresh();
                }}
              />
            )}
          </div>
        ) : p.editable ? (
          <Input
            className={cn(
              "h-9 text-sm rounded-lg flex-1",
              isOverridden && "border-custom-blue/50 bg-blue-50/30 dark:bg-blue-950/10",
              isMissing && !isOverridden && (p.required
                ? "border-rose-200 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-900/10"
                : "border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-900/10")
            )}
            value={effectiveVal}
            onChange={(e) => onOverride(e.target.value)}
            placeholder={p.required ? "Value is required..." : `{{${p.key}}}`}
          />
        ) : (
          <div className="flex-1 min-h-[36px] flex items-center px-3 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200">
            <span className="text-sm truncate">{effectiveVal || <span className="italic opacity-70 text-slate-400">No value computed</span>}</span>
          </div>
        )}

        <div className="flex items-center justify-end shrink-0 gap-1">
          {linked && (
            <MasterFieldEditControl
              placeholder={p}
              masterFields={masterFields}
              individualId={null}
              companyId={companyId}
              currentValue={resolvedValue}
              onSaved={onRefresh}
            />
          )}
          {isOverridden && (
            <button
              type="button"
              title="Reset to source value"
              onClick={() => onOverride(undefined)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-custom-blue transition-colors shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
