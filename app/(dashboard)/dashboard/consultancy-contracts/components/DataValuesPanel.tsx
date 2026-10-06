// @ts-nocheck
'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Loader2, RotateCcw, Database, PenLine, Building2, FileText, AlertCircle, ImageIcon, UploadCloud, Plus, X, AlignLeft, AlignCenter, AlignRight, Expand } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Placeholder } from '../../templates/document-template-manager/types';
import { MasterFieldEditControl, SourceValueEditor, linkedMasterFieldIds } from '../../employment-contracts/components/MasterFieldEditControl';
import type { JobField } from '../../master-fields/components/types/database';
import { UploadModal } from '@/app/generic-components/UploadModal';
import { resolveCompanyRole } from '../utils/ccResolver';
import { blockImageFieldKey, type ImageStyle, type ImageStyleMap } from '../utils/imageStyles';

type CcPlaceholder = Placeholder & { key: string };

interface DataValuesPanelProps {
  companySelected: boolean;
  loading: boolean;
  placeholders: CcPlaceholder[];
  // Full placeholder list including block parents (used to derive block
  // configurations for array rendering).
  allPlaceholders?: CcPlaceholder[];
  // Values resolved from linked master fields for the selected company.
  resolvedValues: Record<string, string>;
  // Resolved array/block data — block name → array of row objects keyed by
  // child placeholder key.
  arrayData?: Record<string, Record<string, string>[]>;
  // This company's saved overrides (cc_engagements.placeholder_overrides).
  overrides: Record<string, string>;
  onOverrideChange: (key: string, value: string | undefined) => void;
  // Raw tm_job_fields rows behind the linked placeholders, keyed by id - lets
  // MasterFieldEditControl edit-and-save-to-source without a second fetch.
  masterFields: Map<number, JobField>;
  // The Client (selected in the sidebar) and the Consultant (picked in the
  // header, see page.tsx's handleConsultantChange) are two different
  // companies in the same document - each placeholder's own company_role
  // (see ccPlaceholderAdapter.ts's resolveCompanyRole) decides which one it
  // reads from AND, critically, which one MasterFieldEditControl's "save to
  // source" writes back to. Without this, every edit silently wrote into the
  // Client's record even for Consultant-scoped fields.
  companyId: string | null;
  consultantCompanyId: string | null;
  onRefresh: () => void;
  // Array/block editing callbacks — see page.tsx for state management.
  onCellChange?: (blockName: string, rowIdx: number, childKey: string, value: string) => void;
  onDeleteColumn?: (blockName: string, colIdx: number) => void;
  onAddEntity?: (blockName: string) => void;
  // Per-instance image size/align overrides (see utils/imageStyles.ts) and
  // the setter for this panel's image controls - see ImageSizeControls.
  imageStyles?: ImageStyleMap;
  onImageStyleChange?: (fieldKey: string, styleKey: keyof ImageStyle, value: any) => void;
}

// _vat_fee/_gross_fee tokens are always derived from the matching _net_fee
// value (see utils/feeCalculations.ts) - the admin only ever types the Net
// figure, so the computed siblings are hidden here rather than inviting a
// manual entry that gets silently superseded. directors_acknowledgement_block
// is likewise fully derived - from page.tsx's own directors selection state
// via utils/directorsBlock.ts, not editable through this panel at all.
function isComputedKey(key: string): boolean {
  return key.endsWith('_vat_fee') || key.endsWith('_gross_fee') || key === 'directors_acknowledgement_block';
}

export function DataValuesPanel({
  companySelected, loading, placeholders, allPlaceholders, resolvedValues, arrayData, overrides, onOverrideChange,
  masterFields, companyId, consultantCompanyId, onRefresh,
  onCellChange, onDeleteColumn, onAddEntity, imageStyles, onImageStyleChange,
}: DataValuesPanelProps) {
  const [dataFilter, setDataFilter] = useState<'all' | 'with' | 'missing'>('all');

  // Derive block configurations from allPlaceholders (block parents whose
  // is_block_start is true) so we can render array sections.
  const blockConfigs = useMemo(() => {
    if (!allPlaceholders?.length) return [];
    return allPlaceholders
      .filter((p) => p.is_block_start)
      .map((block) => {
        const children = allPlaceholders.filter((c) => c.parent_name === block.key);
        return { config: block, children };
      });
  }, [allPlaceholders]);

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
    const groups = new Map<string, CcPlaceholder[]>();
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
      <div className="p-4 space-y-4">
        {/* Toolbar: title + All/With Data/Missing filter - same segmented
            control as employment-contracts/components/ContractEditor.tsx's
            own Contract Fields toolbar. */}
        <div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
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
                  companyId={resolveCompanyRole(p) === 'consultant' ? consultantCompanyId : companyId}
                  onOverride={(v) => onOverrideChange(p.key, v)}
                  onRefresh={onRefresh}
                  imageStyle={imageStyles?.[p.key]}
                  onImageStyleChange={onImageStyleChange ? (styleKey, val) => onImageStyleChange(p.key, styleKey, val) : undefined}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Array / block placeholders — rendered as transposed tables, one
            section per block, with columns for each entity (e.g. director). */}
        {blockConfigs.map(({ config: block, children }) => {
          const rows = arrayData?.[block.key] || [];
          const entityTypeRaw = Array.isArray(block.entity_type)
            ? block.entity_type[0]
            : block.entity_type || block.key;
          const entityLabel = String(entityTypeRaw).charAt(0).toUpperCase() + String(entityTypeRaw).slice(1);
          if (children.length === 0) return null;
          return (
            <ArrayBlockSection
              key={block.id}
              blockName={block.key}
              blockLabel={block.label || block.key}
              entityLabel={entityLabel}
              childrenPlaceholders={children}
              rows={rows}
              masterFields={masterFields}
              companyId={companyId}
              onRefresh={onRefresh}
              onCellChange={onCellChange}
              onDeleteColumn={onDeleteColumn}
              onAddEntity={onAddEntity}
              imageStyles={imageStyles}
              onImageStyleChange={onImageStyleChange}
            />
          );
        })}
      </div>
    </ScrollArea>
  );
}

function PlaceholderRow({
  placeholder: p, resolvedValue, overrideValue, isMissing, masterFields, companyId, onOverride, onRefresh,
  imageStyle, onImageStyleChange,
}: {
  placeholder: CcPlaceholder;
  resolvedValue: string;
  overrideValue: string | undefined;
  isMissing: boolean;
  masterFields: Map<number, JobField>;
  companyId: string | null;
  onOverride: (val: string | undefined) => void;
  onRefresh: () => void;
  imageStyle?: ImageStyle;
  onImageStyleChange?: (styleKey: keyof ImageStyle, value: any) => void;
}) {
  const isOverridden = overrideValue !== undefined;
  const effectiveVal = overrideValue ?? resolvedValue;
  const linked = p.source_kind === 'master_field' && !!p.master_field_id;
  const sourceLabel = linked ? (masterFields.get(Number(p.master_field_id))?.label || 'Master field') : 'Manual';

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  // Save-to-source editing (pencil) takes over the value control.
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
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
      "grid grid-cols-1 md:grid-cols-[35%_20%_1fr] gap-3.5 p-3.5 items-center transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 relative overflow-hidden",
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
        <div className="">
          {isOverridden && (
            <Badge variant="outline" className="text-[9px] uppercase font-bold tracking-wider h-4 px-1 rounded bg-blue-50 text-custom-blue border-blue-200 dark:bg-blue-500/20 dark:border-blue-500/30">
              Modified
            </Badge>
          )}
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
        {editingFieldId != null ? (
          <div className="flex-1 min-w-0">
            <SourceValueEditor
              placeholder={p}
              masterFieldId={editingFieldId}
              masterFields={masterFields}
              individualId={null}
              companyId={companyId}
              initialValue={linkedMasterFieldIds(p).length === 1 ? resolvedValue : undefined}
              onDone={() => setEditingFieldId(null)}
              onSaved={onRefresh}
            />
          </div>
        ) : p.type === 'image' ? (
          <div className="flex-1">
            {effectiveVal ? (
              <>
                {/* Preview box height mirrors TemplateGenerationDialog's own
                    PlaceholderInput (Math.min(imageHeight, 100)px). A live
                    imageStyle override (set below via ImageSizeControls)
                    takes priority over the placeholder's own configured
                    image_width/image_height, same precedence TGD uses. */}
                <div
                  className="relative border rounded overflow-hidden flex items-center justify-center bg-slate-50 group"
                  style={{ height: `${Math.min(imageStyle?.imageHeight || (p.image_height ? parseInt(p.image_height) : 200), 100)}px` }}
                >
                  <img
                    src={effectiveVal}
                    className="max-h-full object-contain"
                    style={{
                      width: `${imageStyle?.imageWidth || (p.image_width ? parseInt(p.image_width) : 300)}px`,
                      maxWidth: imageStyle?.maxWidth || '100%',
                      textAlign: imageStyle?.textAlign || 'center',
                    }}
                  />
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
                {onImageStyleChange && (
                  <ImageSizeControls
                    style={imageStyle || {}}
                    onChange={onImageStyleChange}
                    defaultWidth={p.image_width ? parseInt(p.image_width) : undefined}
                    defaultHeight={p.image_height ? parseInt(p.image_height) : undefined}
                  />
                )}
              </>
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
          {linked && editingFieldId == null && (
            <MasterFieldEditControl
              placeholder={p}
              masterFields={masterFields}
              individualId={null}
              companyId={companyId}
              onStartEdit={setEditingFieldId}
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

// Align/size controls for one rendered image occurrence, mirroring
// TemplateGenerationDialog's own ImagePlaceholderControls so image
// placeholders get the same adjustable-size treatment in Consultancy
// Contracts as they already have in Task Requirements' templates. Writes
// through onChange (page.tsx's handleImageStyleChange) into the shared
// imageStyles map that both this panel and ContractPreview read from.
function ImageSizeControls({
  style,
  onChange,
  defaultWidth,
  defaultHeight,
}: {
  style: ImageStyle;
  onChange: (styleKey: keyof ImageStyle, value: any) => void;
  // The placeholder's own configured image_width/image_height (from the
  // Settings placeholder dialog) - shown pre-filled in the number inputs
  // until the user actually overrides one, so the dialog's specified size
  // is what a fresh control reflects, not an empty box.
  defaultWidth?: number;
  defaultHeight?: number;
}) {
  const sizeMap: Record<string, string> = { small: '25%', medium: '50%', large: '75%', full: '100%' };
  const currentSizeKey = Object.keys(sizeMap).find((k) => sizeMap[k] === style.maxWidth) || 'full';

  return (
    <div className="flex items-center gap-1.5 pt-1.5 mt-1.5 border-t border-slate-100 dark:border-slate-800">
      <ToggleGroup
        type="single"
        value={style.textAlign || 'left'}
        onValueChange={(align) => align && onChange('textAlign', align)}
        className="bg-white dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 h-6"
      >
        <ToggleGroupItem value="left" className="px-1.5 h-6"><AlignLeft className="h-2.5 w-2.5" /></ToggleGroupItem>
        <ToggleGroupItem value="center" className="px-1.5 h-6"><AlignCenter className="h-2.5 w-2.5" /></ToggleGroupItem>
        <ToggleGroupItem value="right" className="px-1.5 h-6"><AlignRight className="h-2.5 w-2.5" /></ToggleGroupItem>
      </ToggleGroup>
      <Select value={currentSizeKey} onValueChange={(size) => onChange('maxWidth', sizeMap[size])}>
        <SelectTrigger className="w-12 h-6 text-[9px]"><SelectValue><Expand className="h-2.5 w-2.5" /></SelectValue></SelectTrigger>
        <SelectContent>
          <SelectItem value="small">25%</SelectItem>
          <SelectItem value="medium">50%</SelectItem>
          <SelectItem value="large">75%</SelectItem>
          <SelectItem value="full">100%</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="number"
        min={20}
        max={800}
        placeholder="w"
        value={style.imageWidth ?? defaultWidth ?? ''}
        onChange={(e) => onChange('imageWidth', parseInt(e.target.value) || undefined)}
        className="h-6 w-14 text-[9px] px-1.5"
      />
      <span className="text-[9px] text-slate-400">×</span>
      <Input
        type="number"
        min={20}
        max={800}
        placeholder="h"
        value={style.imageHeight ?? defaultHeight ?? ''}
        onChange={(e) => onChange('imageHeight', parseInt(e.target.value) || undefined)}
        className="h-6 w-14 text-[9px] px-1.5"
      />
    </div>
  );
}

function ArrayBlockSection({
  blockName,
  blockLabel,
  entityLabel,
  childrenPlaceholders,
  rows,
  masterFields,
  companyId,
  onRefresh,
  onCellChange,
  onDeleteColumn,
  onAddEntity,
  imageStyles,
  onImageStyleChange,
}: {
  blockName: string;
  blockLabel: string;
  entityLabel: string;
  childrenPlaceholders: CcPlaceholder[];
  rows: Record<string, string>[];
  masterFields: Map<number, JobField>;
  companyId: string | null;
  onRefresh: () => void;
  onCellChange?: (blockName: string, rowIdx: number, childKey: string, value: string) => void;
  onDeleteColumn?: (blockName: string, colIdx: number) => void;
  onAddEntity?: (blockName: string) => void;
  imageStyles?: ImageStyleMap;
  onImageStyleChange?: (fieldKey: string, styleKey: keyof ImageStyle, value: any) => void;
}) {
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; childKey: string } | null>(null);

  if (rows.length === 0) {
    return (
      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 flex items-center gap-2">
          <span className="w-1.5 h-3 bg-indigo-500 rounded-full" />
          {blockLabel}
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-indigo-50 text-indigo-600 border-indigo-200">0 {entityLabel.toLowerCase()}s</Badge>
        </h4>
        <div className="p-4 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400 text-center italic">
          No {entityLabel.toLowerCase()} records found for {blockName}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 flex items-center gap-2">
        <span className="w-1.5 h-3 bg-indigo-500 rounded-full" />
        {blockLabel}
        <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-indigo-50 text-indigo-600 border-indigo-200">
          {rows.length} {rows.length === 1 ? entityLabel.toLowerCase() : `${entityLabel.toLowerCase()}s`}
        </Badge>
      </h4>
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200/60 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <th className="text-left px-3.5 py-2.5 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px] w-[140px] border-r border-slate-200 dark:border-slate-800 sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                  Field
                </th>
                {rows.map((_, idx) => (
                  <th key={idx} className="px-4 py-2 text-center border-r border-slate-200 dark:border-slate-800 last:border-r-0 min-w-[180px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <Badge variant="outline" className="font-extrabold text-indigo-700 bg-indigo-50/50 border-indigo-200 dark:text-indigo-400 dark:bg-indigo-950/40 dark:border-indigo-900 text-[10px] uppercase tracking-wide">
                        {entityLabel} {idx + 1}
                      </Badge>
                      {onDeleteColumn && (
                        <button
                          type="button"
                          title={`Remove ${entityLabel} ${idx + 1}`}
                          onClick={() => onDeleteColumn(blockName, idx)}
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                {onAddEntity && (
                  <th className="px-2 py-2 text-center min-w-[60px]">
                    <button
                      type="button"
                      title={`Add ${entityLabel}`}
                      onClick={() => onAddEntity(blockName)}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors mx-auto border border-dashed border-indigo-300 dark:border-indigo-800"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {childrenPlaceholders.map((child, childIdx) => {
                const isEven = childIdx % 2 === 0;
                return (
                  <tr
                    key={child.id}
                    className={cn(
                      "border-b border-slate-100 last:border-b-0 hover:bg-indigo-50/10 dark:border-slate-900 dark:hover:bg-indigo-950/15 transition-colors align-middle",
                      isEven ? "bg-white dark:bg-slate-950" : "bg-slate-50/50 dark:bg-slate-900/30"
                    )}
                  >
                    <td className="px-3.5 py-2 font-bold text-slate-600 dark:text-slate-400 text-[10.5px] uppercase border-r border-slate-200 dark:border-slate-800 sticky left-0 bg-inherit z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                      {child.label || child.key.replace(/_/g, ' ')}
                    </td>
                    {rows.map((row, rowIdx) => {
                      const val = row[child.key] || '';
                      const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.childKey === child.key;
                      const isImage = child.type === 'image';
                      return (
                        <td
                          key={rowIdx}
                          className="px-2 py-1 border-r border-slate-100 dark:border-slate-850 last:border-r-0 align-middle"
                        >
                          {isImage ? (
                            <ArrayImageCell
                              value={val}
                              placeholderKey={child.key}
                              imageWidth={child.image_width}
                              imageHeight={child.image_height}
                              rowIdx={rowIdx}
                              blockName={blockName}
                              onCellChange={onCellChange}
                              style={imageStyles?.[blockImageFieldKey(blockName, rowIdx, child.key)]}
                              onStyleChange={onImageStyleChange ? (styleKey, val2) => onImageStyleChange(blockImageFieldKey(blockName, rowIdx, child.key), styleKey, val2) : undefined}
                            />
                          ) : isEditing && onCellChange ? (
                            <Input
                              className="h-7 text-[11px] px-2 py-1 border-indigo-300 dark:border-indigo-700 bg-indigo-50/30 dark:bg-indigo-950/20 focus:ring-1 focus:ring-indigo-400"
                              autoFocus
                              value={val}
                              onChange={(e) => onCellChange(blockName, rowIdx, child.key, e.target.value)}
                              onBlur={() => setEditingCell(null)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { setEditingCell(null); e.currentTarget.blur(); } }}
                            />
                          ) : (
                            <div
                              className={cn(
                                "min-h-[28px] flex items-center px-2 py-1 rounded text-[11px] cursor-text hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors",
                                val ? "text-slate-700 dark:text-slate-200 font-medium" : "text-slate-400 italic"
                              )}
                              onClick={() => onCellChange && setEditingCell({ rowIdx, childKey: child.key })}
                            >
                              {val || <span className="opacity-60">Click to edit</span>}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    {onAddEntity && (
                      <td className="px-2 py-1 border-r border-slate-100 dark:border-slate-850 last:border-r-0 align-middle">
                        <div className="min-h-[28px]" />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ArrayImageCell({
  value,
  placeholderKey,
  imageWidth,
  imageHeight,
  rowIdx,
  blockName,
  onCellChange,
  style,
  onStyleChange,
}: {
  value: string;
  placeholderKey: string;
  imageWidth?: string | null;
  imageHeight?: string | null;
  rowIdx: number;
  blockName: string;
  onCellChange?: (blockName: string, rowIdx: number, childKey: string, value: string) => void;
  style?: ImageStyle;
  onStyleChange?: (styleKey: keyof ImageStyle, value: any) => void;
}) {
  const hasValue = !!value && (value.startsWith('http') || value.startsWith('data:image'));
  // Bounded the same way as PlaceholderRow's single-value image preview
  // (see TemplateGenerationDialog's PlaceholderInput). A live style override
  // (set below via ImageSizeControls) takes priority over the placeholder's
  // own configured image_width/image_height.
  const cellHeight = Math.min(style?.imageHeight || (imageHeight ? parseInt(imageHeight) : 200), 100);
  const cellMaxWidth = style?.maxWidth || imageWidth || undefined;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onCellChange) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        onCellChange(blockName, rowIdx, placeholderKey, reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCellChange) onCellChange(blockName, rowIdx, placeholderKey, '');
  };

  if (hasValue) {
    return (
      <div>
        <div className="relative border rounded overflow-hidden bg-slate-50 dark:bg-slate-950 group" style={{ height: `${cellHeight}px` }}>
          <img src={value} className="w-full h-full object-contain" style={{ maxWidth: cellMaxWidth, textAlign: style?.textAlign || 'left' }} />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
            <label className="h-6 bg-white/20 hover:bg-white/30 text-white rounded px-2 text-[9px] cursor-pointer">
              Replace
              <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
            </label>
            <button type="button" onClick={handleClear} className="h-6 bg-red-500/80 hover:bg-red-500 text-white rounded px-2 text-[9px]">
              Clear
            </button>
          </div>
        </div>
        {onStyleChange && (
          <ImageSizeControls
            style={style || {}}
            onChange={onStyleChange}
            defaultWidth={imageWidth ? parseInt(imageWidth) : undefined}
            defaultHeight={imageHeight ? parseInt(imageHeight) : undefined}
          />
        )}
      </div>
    );
  }

  return (
    <label className="flex items-center justify-center h-[44px] w-full border border-dashed border-slate-300 dark:border-slate-700 rounded cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors">
      <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
      <span className="flex items-center gap-1 text-[10px] text-slate-400">
        <ImageIcon className="w-3 h-3" />
        Upload
      </span>
    </label>
  );
}
