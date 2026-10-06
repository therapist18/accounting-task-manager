'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Pencil, Loader2, Save, X, ChevronDown, Layers, Database, CheckCircle2, Edit3 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect';
import { ecPlaceholderToDtmPlaceholder } from '../utils/ecPlaceholderAdapter';
import { saveEcMasterFieldValue, resolveEcPlaceholderSingle, resolveEcPlaceholderValues, resolveEntityScope } from '../utils/ecResolver';
import type { EcPlaceholder } from '../utils/ecPlaceholders';
import type { JobField } from '../../master-fields/components/types/database';

// Mirrors TemplateGenerationDialog.tsx's PlaceholderInput edit flow (source
// picker popover when linked to >1 master field, select-aware edit control
// when the chosen field is type='select', save-to-source via the shared
// writeMasterFieldSourceValue core) - simplified for EC's individual/company-
// only world, no director/dependant/job-question source types to pick between.
//
// Split in two so the editor always takes over the row's VALUE cell instead
// of squeezing a second input into the narrow actions column:
//  - MasterFieldEditControl: just the pencil (or "Edit which source?" picker)
//    in the actions column - it only reports which field to edit.
//  - SourceValueEditor: the input/select + save/cancel, rendered by the row
//    in place of the value itself.

function normalizeOptions(mf: JobField | undefined): SearchableSelectOption[] {
  const opts: any = mf?.type === 'select' ? mf?.options : null;
  if (!opts) return [];
  const list = Array.isArray(opts) ? opts : Array.isArray(opts.options) ? opts.options : null;
  if (!list) return [];
  return list.map((o: any) =>
    typeof o === 'string' ? { value: o, label: o } : { value: String(o.value ?? o.label), label: String(o.label ?? o.value) }
  );
}

// Which of a placeholder's linked master fields can actually be saved back
// here - scoped to the placeholder's own entity_type, so a field shared by a
// company-scoped and an employee-scoped placeholder (e.g. KRA PIN) is only
// ever saved against the source matching THIS placeholder.
function editableLinkedIds(
  placeholder: EcPlaceholder,
  masterFields: Map<number, JobField>,
  individualId: number | null | undefined,
  companyId: string | number | null | undefined
): number[] {
  const scope = resolveEntityScope(placeholder.entity_type);
  return linkedMasterFieldIds(placeholder).filter((id) => {
    const mf = masterFields.get(id);
    if (!mf?.sources?.length) return false;
    if (scope === 'company') return companyId != null && mf.sources.some((s) => s.source_type === 'company');
    if (scope === 'individual') return individualId != null && mf.sources.some((s) => s.source_type === 'individual');
    return mf.sources.some((s) => (s.source_type === 'company' ? companyId != null : individualId != null));
  });
}

interface MasterFieldEditControlProps {
  placeholder: EcPlaceholder;
  masterFields: Map<number, JobField>;
  individualId: number | null | undefined;
  companyId: string | number | null | undefined;
  // Called with the master field to edit - the row then swaps its value cell
  // for a SourceValueEditor on that field.
  onStartEdit: (masterFieldId: number) => void;
}

export function MasterFieldEditControl({ placeholder, masterFields, individualId, companyId, onStartEdit }: MasterFieldEditControlProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const editableIds = editableLinkedIds(placeholder, masterFields, individualId, companyId);
  if (editableIds.length === 0) return null; // no valid target for any linked field here

  if (editableIds.length === 1) {
    return (
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-slate-400 hover:text-custom-blue" onClick={() => onStartEdit(editableIds[0])} title="Edit source value">
        <Pencil className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-slate-400 hover:text-custom-blue" title="Edit source value">
          <Pencil className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="end">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 py-1">Edit which source?</p>
        {editableIds.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => { setPickerOpen(false); onStartEdit(id); }}
            className="w-full text-left text-base px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
          >
            <Pencil className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{masterFields.get(id)?.label || `Field #${id}`}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

interface SourceValueEditorProps {
  placeholder: EcPlaceholder;
  masterFieldId: number;
  masterFields: Map<number, JobField>;
  individualId: number | null | undefined;
  companyId: string | number | null | undefined;
  // This one field's own value, when the caller already has it (single-link
  // placeholder = its resolved value; multi-source popover = the per-source
  // value it loaded). Omitted -> fetched here.
  initialValue?: string;
  // Shown above the input - which source is being edited.
  label?: string;
  onDone: () => void;
  onSaved: () => void;
}

// The edit control itself: select (for type='select' master fields) or
// input, plus save-to-source and cancel - fills the value cell.
export function SourceValueEditor({
  placeholder, masterFieldId, masterFields, individualId, companyId, initialValue, label, onDone, onSaved,
}: SourceValueEditorProps) {
  const [editValue, setEditValue] = useState(initialValue ?? '');
  const [loadingValue, setLoadingValue] = useState(initialValue === undefined);
  const [saving, setSaving] = useState(false);

  // The placeholder's resolved value is the MERGED string for a field linked
  // to several master fields (e.g. building + town + country) - editing one
  // source has to start from that source's OWN value, or saving would write
  // the whole merged text into one column. Resolved via a synthetic
  // single-field placeholder.
  useEffect(() => {
    if (initialValue !== undefined) return;
    let cancelled = false;
    const synthetic: EcPlaceholder = {
      ...placeholder,
      id: `__edit_${masterFieldId}`,
      key: '__value__',
      master_field_id: String(masterFieldId),
      master_field_links: [{ master_field_id: String(masterFieldId), display_priority: 1, strategy: 'fallback' }],
      type: 'text',
      conditions: [],
      boolean_conditions: [],
    };
    resolveEcPlaceholderSingle(synthetic, individualId, companyId)
      .then((values) => { if (!cancelled) setEditValue(values['__value__'] ?? ''); })
      .finally(() => { if (!cancelled) setLoadingValue(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterFieldId]);

  const handleSave = async () => {
    setSaving(true);
    const result = await saveEcMasterFieldValue(masterFieldId, masterFields, editValue, individualId, companyId, placeholder.entity_type);
    setSaving(false);
    if (result.success) {
      toast({ title: 'Saved to source record' });
      onDone();
      onSaved();
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to save value', variant: 'destructive' });
    }
  };

  const mf = masterFields.get(masterFieldId);
  const options = normalizeOptions(mf);

  return (
    <div className="space-y-1 min-w-0">
      {label && (
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 flex items-center gap-1">
          <Edit3 className="h-3.5 w-3.5" /> Editing {label}
        </p>
      )}
      <div className="flex items-center gap-1.5">
        {loadingValue ? (
          <div className="h-9 flex-1 flex items-center px-3 rounded-md border border-slate-200 bg-slate-50">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        ) : options.length > 0 ? (
          <SearchableSelect
            // What gets stored and saved is the option's LABEL (same as
            // TemplateGenerationDialog) - a dropdown choice must be
            // indistinguishable from typing that label, since that's what
            // saveEcMasterFieldValue writes to the source column.
            value={options.find((o) => o.label === editValue)?.value ?? null}
            onChange={(val) => {
              const selected = options.find((o) => o.value === val);
              setEditValue(selected ? selected.label : val);
            }}
            options={options}
            placeholder="Select..."
            className="h-9 text-base flex-1"
          />
        ) : (
          <Input
            autoFocus
            className="h-9 text-base px-3 flex-1 border-blue-400 ring-2 ring-blue-50"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onDone(); }}
            placeholder={mf?.label || 'Value'}
          />
        )}
        <Button type="button" size="icon" className="h-9 w-9 shrink-0 bg-green-600 hover:bg-green-700" onClick={handleSave} disabled={saving || loadingValue} title="Save to source record">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-red-500" onClick={onDone} disabled={saving} title="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Multi-source value control - the value cell for a placeholder linked to
// more than one master field. Same design and behaviour as
// TemplateGenerationDialog.tsx's PlaceholderInput STATE B: a dashed trigger
// showing the resolved value + the link strategy (ALL = merge, PRIORITY =
// fallback), a "Select source to edit" popover listing every linked field
// (DB FIELD n) with its OWN current value and a pencil to edit/save that
// source, and a "Type a custom value for this document" footer for a
// one-off value. EC's "this document only" value is the contract's
// placeholder override (offer.placeholder_overrides) - it never touches the
// source records, exactly like TGD's manual entry never calls onSaveToDb.
// ----------------------------------------------------------------------------

interface MultiSourceValueControlProps {
  placeholder: EcPlaceholder;
  masterFields: Map<number, JobField>;
  individualId: number | null | undefined;
  companyId: string | number | null | undefined;
  // Resolved (merged/priority) value, and the per-contract override if any.
  value: string;
  overrideValue: string | undefined;
  // Undefined when the placeholder isn't editable - no custom value entry.
  onOverride?: (val: string | undefined) => void;
  onSaved: () => void;
}

export function linkedMasterFieldIds(placeholder: EcPlaceholder): number[] {
  if (placeholder.source_kind !== 'master_field') return [];
  return (ecPlaceholderToDtmPlaceholder(placeholder).master_field_ids || []).map((id: any) => Number(id));
}

export function MultiSourceValueControl({
  placeholder, masterFields, individualId, companyId, value, overrideValue, onOverride, onSaved,
}: MultiSourceValueControlProps) {
  const [open, setOpen] = useState(false);
  const [sourceValues, setSourceValues] = useState<Record<string, string> | null>(null);
  const [loadingSources, setLoadingSources] = useState(false);

  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);

  const [manualEditing, setManualEditing] = useState(false);
  const [manualValue, setManualValue] = useState('');

  const linkedIds = linkedMasterFieldIds(placeholder);
  const effectiveValue = overrideValue ?? value;
  const strategy = placeholder.master_field_links?.[0]?.strategy === 'merge' ? 'all' : 'priority';
  const editableIds = editableLinkedIds(placeholder, masterFields, individualId, companyId);

  // Each linked field's OWN value (not the merged/priority result), resolved
  // with one synthetic single-field placeholder per link in a single fetch -
  // loaded when the popover opens, like TGD's resolveSourceValue per row.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingSources(true);
    const synthetics: EcPlaceholder[] = linkedIds.map((id) => ({
      ...placeholder,
      id: `__src_${id}`,
      key: `__src_${id}`,
      master_field_id: String(id),
      master_field_links: [{ master_field_id: String(id), display_priority: 1, strategy: 'fallback' }],
      type: 'text',
      conditions: [],
      boolean_conditions: [],
    }));
    resolveEcPlaceholderValues(synthetics, individualId, companyId)
      .then(({ values }) => { if (!cancelled) setSourceValues(values); })
      .finally(() => { if (!cancelled) setLoadingSources(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placeholder.id, individualId, companyId]);

  const startSourceEdit = (id: number) => {
    setEditingFieldId(id);
    setOpen(false);
  };

  const startManualEdit = () => {
    setManualValue(effectiveValue || '');
    setManualEditing(true);
    setOpen(false);
  };
  const applyManualEdit = () => { onOverride?.(manualValue); setManualEditing(false); };

  // --- Editing one source (pencil) - same editor as single-source rows ---
  if (editingFieldId != null) {
    return (
      <SourceValueEditor
        placeholder={placeholder}
        masterFieldId={editingFieldId}
        masterFields={masterFields}
        individualId={individualId}
        companyId={companyId}
        initialValue={sourceValues?.[`__src_${editingFieldId}`]}
        label={masterFields.get(editingFieldId)?.label || `Field #${editingFieldId}`}
        onDone={() => setEditingFieldId(null)}
        onSaved={() => { setSourceValues(null); onSaved(); }}
      />
    );
  }

  // --- Custom value for this document ---
  if (manualEditing) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 flex items-center gap-1">
          <Edit3 className="h-3.5 w-3.5" /> Custom value (this document only)
        </p>
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyManualEdit(); if (e.key === 'Escape') setManualEditing(false); }}
            className="h-9 text-base px-3 flex-1 border-blue-400 ring-2 ring-blue-50"
          />
          <Button type="button" size="icon" className="h-9 w-9 shrink-0 bg-green-600 hover:bg-green-700" onClick={applyManualEdit} title="Apply">
            <CheckCircle2 className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-red-500" onClick={() => setManualEditing(false)} title="Cancel">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-2 bg-blue-50/50 border border-blue-100 rounded text-sm text-blue-700">
          <div className="font-medium">💡 Quick Custom Value Entry</div>
          <div className="mt-0.5">Start typing directly in this field for immediate custom values without saving to profile.</div>
        </div>
      </div>
    );
  }

  // --- Multi-source trigger + "Select source to edit" popover ---
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-full h-9 flex items-center gap-2 px-3 rounded-md text-left text-base border border-dashed border-blue-200 bg-blue-50/30 hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 transition-colors',
            effectiveValue ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-red-500 italic'
          )}
          title={effectiveValue || undefined}
        >
          <span className="truncate flex-1">{effectiveValue || 'Missing'}</span>
          <Badge variant="outline" className="text-xs h-5 px-1.5 uppercase bg-white dark:bg-slate-900 border-blue-200 text-blue-600 font-bold shrink-0">
            {strategy}
          </Badge>
          <ChevronDown className="h-4 w-4 text-blue-400 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 shadow-xl border-blue-100" align="end">
        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border-b flex justify-between items-center">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Select source to edit</span>
          <Layers className="h-4 w-4 text-slate-400" />
        </div>

        <div className="p-1 space-y-0.5 max-h-[300px] overflow-y-auto bg-white dark:bg-slate-950">
          {linkedIds.map((id, idx) => {
            const mf = masterFields.get(id);
            const sourceValue = sourceValues?.[`__src_${id}`] ?? '';
            const editable = editableIds.includes(id);
            return (
              <div key={id} className="flex items-center justify-between px-2 py-1.5 rounded-md border border-transparent hover:bg-slate-50 hover:border-slate-200 dark:hover:bg-slate-900 group transition-all">
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-xs font-bold text-blue-600 flex items-center gap-1 uppercase">
                    <Database className="h-3.5 w-3.5" /> DB Field {idx + 1}
                  </span>
                  <span className="text-base font-medium truncate text-slate-700 dark:text-slate-200">{mf?.label || `Field #${id}`}</span>
                  <span className="text-sm text-slate-400 italic truncate">
                    {loadingSources ? 'Loading…' : sourceValue || 'Empty'}
                  </span>
                </div>
                {editable && (
                  <Button
                    type="button" size="icon" variant="ghost"
                    className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => startSourceEdit(id)}
                    disabled={loadingSources}
                    title="Edit and save to the source record"
                  >
                    <Edit3 className="h-4 w-4 text-blue-500" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {onOverride && (
          <div className="p-1 border-t bg-white dark:bg-slate-950">
            <Button
              type="button" size="sm" variant="ghost"
              className="w-full h-9 justify-start text-base text-slate-600 hover:text-blue-700 hover:bg-blue-50"
              onClick={startManualEdit}
            >
              <Pencil className="h-4 w-4 mr-2 text-slate-400" />
              Type a custom value for this document
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
