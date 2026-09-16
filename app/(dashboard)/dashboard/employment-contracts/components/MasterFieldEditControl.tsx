'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Pencil, Loader2, Save, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect';
import { ecPlaceholderToDtmPlaceholder } from '../utils/ecPlaceholderAdapter';
import { saveEcMasterFieldValue, resolveEcPlaceholderSingle, resolveEntityScope } from '../utils/ecResolver';
import type { EcPlaceholder } from '../utils/ecPlaceholders';
import type { JobField } from '../../master-fields/components/types/database';

// Mirrors TemplateGenerationDialog.tsx's PlaceholderInput edit flow (source
// picker popover when linked to >1 master field, select-aware edit control
// when the chosen field is type='select', save-to-source via the shared
// writeMasterFieldSourceValue core) - simplified for EC's individual/company-
// only world, no director/dependant/job-question source types to pick between.
interface MasterFieldEditControlProps {
  placeholder: EcPlaceholder;
  masterFields: Map<number, JobField>;
  individualId: number | null | undefined;
  companyId: string | number | null | undefined;
  currentValue: string;
  onSaved: () => void;
}

function normalizeOptions(mf: JobField | undefined): SearchableSelectOption[] {
  const opts: any = mf?.type === 'select' ? mf?.options : null;
  if (!opts) return [];
  const list = Array.isArray(opts) ? opts : Array.isArray(opts.options) ? opts.options : null;
  if (!list) return [];
  return list.map((o: any) =>
    typeof o === 'string' ? { value: o, label: o } : { value: String(o.value ?? o.label), label: String(o.label ?? o.value) }
  );
}

export function MasterFieldEditControl({ placeholder, masterFields, individualId, companyId, currentValue, onSaved }: MasterFieldEditControlProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingValue, setLoadingValue] = useState(false);

  const linkedIds = ecPlaceholderToDtmPlaceholder(placeholder).master_field_ids || [];
  if (linkedIds.length === 0) return null;

  // Scoped to this placeholder's own entity_type - a field shared by both a
  // company-scoped and an employee-scoped placeholder (e.g. KRA PIN) must
  // only ever be editable/saveable against the source matching THIS
  // placeholder, not whichever entity id happens to be available.
  const scope = resolveEntityScope(placeholder.entity_type);
  const canEditWith = (id: number) => {
    const mf = masterFields.get(id);
    if (!mf?.sources?.length) return false;
    if (scope === 'company') return companyId != null && mf.sources.some((s) => s.source_type === 'company');
    if (scope === 'individual') return individualId != null && mf.sources.some((s) => s.source_type === 'individual');
    return mf.sources.some((s) => (s.source_type === 'company' ? companyId != null : individualId != null));
  };
  const editableIds = linkedIds.filter(canEditWith);
  if (editableIds.length === 0) return null; // no valid target for any linked field here

  // currentValue is the whole PLACEHOLDER's resolved value - for a field
  // linked to multiple master fields (e.g. an address merged from building
  // name + town + country), that's the concatenated string, not any single
  // source's own value. Pre-filling the edit box with it meant picking
  // "Town" to edit showed the entire merged address instead of just the
  // town - for a type='select' field, nothing in the options list matches
  // that string, so the dropdown opens with nothing selected and, worse,
  // saving would overwrite the town's source column with the full merged
  // text. Fetching this one field's own value (via the same resolver, with
  // a synthetic single-field placeholder) fixes both.
  const startEdit = async (id: number) => {
    setEditingFieldId(id);
    setPickerOpen(false);
    if (linkedIds.length === 1) {
      // Only one source at all - it's exactly currentValue, no fetch needed.
      setEditValue(currentValue);
      return;
    }
    setLoadingValue(true);
    setEditValue('');
    try {
      const synthetic: EcPlaceholder = {
        ...placeholder,
        id: `__edit_${id}`,
        key: '__value__',
        master_field_id: String(id),
        master_field_links: [{ master_field_id: String(id), display_priority: 1, strategy: 'fallback' }],
        type: 'text',
        conditions: [],
        boolean_conditions: [],
      };
      const values = await resolveEcPlaceholderSingle(synthetic, individualId, companyId);
      setEditValue(values['__value__'] ?? '');
    } finally {
      setLoadingValue(false);
    }
  };

  const cancelEdit = () => {
    setEditingFieldId(null);
    setEditValue('');
  };

  const handleSave = async () => {
    if (editingFieldId == null) return;
    setSaving(true);
    const result = await saveEcMasterFieldValue(editingFieldId, masterFields, editValue, individualId, companyId, placeholder.entity_type);
    setSaving(false);
    if (result.success) {
      toast({ title: 'Saved to source record' });
      cancelEdit();
      onSaved();
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to save value', variant: 'destructive' });
    }
  };

  if (editingFieldId != null) {
    const mf = masterFields.get(editingFieldId);
    const options = normalizeOptions(mf);
    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {loadingValue ? (
          <div className="h-10 flex-1 flex items-center px-3.5 rounded-md border border-slate-200 bg-slate-50">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
          </div>
        ) : options.length > 0 ? (
          <SearchableSelect
            // EC's SearchableSelect matches/returns by option `value`, but
            // (like TemplateGenerationDialog's own select-edit handling)
            // what gets stored and saved is always the option's LABEL, not
            // its value/id - a dropdown selection has to be indistinguishable
            // from someone typing that same label into a plain text field,
            // since that's what saveEcMasterFieldValue writes to the source
            // column. So: look up the option matching the current label to
            // find what value to show as "selected", and on change, resolve
            // the chosen value back to ITS label before storing it.
            value={options.find((o) => o.label === editValue)?.value ?? null}
            onChange={(val) => {
              const selected = options.find((o) => o.value === val);
              setEditValue(selected ? selected.label : val);
            }}
            options={options}
            placeholder="Select..."
            className="h-10 text-[15px] flex-1"
          />
        ) : (
          <Input
            className="h-10 text-[15px] px-3.5 flex-1"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder={mf?.label || 'Value'}
            autoFocus
          />
        )}
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-emerald-600 hover:bg-emerald-50" onClick={handleSave} disabled={saving || loadingValue} title="Save to source record">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-slate-400 hover:text-red-500" onClick={cancelEdit} disabled={saving} title="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (editableIds.length === 1) {
    return (
      <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-slate-400 hover:text-custom-blue" onClick={() => startEdit(editableIds[0])} title="Edit source value">
        <Pencil className="h-4 w-4" />
      </Button>
    );
  }

  // Multiple linked master fields - let the user pick which one to edit,
  // same as TemplateGenerationDialog's per-source popover, minus the
  // per-source live-resolved preview (not worth plumbing the resolver's
  // internal table cache into this component just for that).
  return (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-slate-400 hover:text-custom-blue" title="Edit source value">
          <Pencil className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="end">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">Edit which source?</p>
        {editableIds.map((id) => {
          const mf = masterFields.get(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => startEdit(id)}
              className="w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
            >
              <Pencil className="h-3 w-3 text-slate-400 shrink-0" />
              <span className="truncate">{mf?.label || `Field #${id}`}</span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
