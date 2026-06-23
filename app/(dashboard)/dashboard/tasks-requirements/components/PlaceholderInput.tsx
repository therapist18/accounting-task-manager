// @ts-nocheck
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Expand, 
  CheckCircle2, 
  X, 
  Database, 
  HelpCircle, 
  Edit3, 
  Save, 
  Layers, 
  ChevronDown, 
  Sparkles, 
  Loader2 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ImagePlaceholderControls } from './ImagePlaceholderControls';
import { isValidValue, getDisplayLabel, processDigitSplit } from '../utils/templateUtils';

interface PlaceholderInputProps {
  resolveSourceValue?: (type: string, id: string, placeholder: any, arrayIndex: number | null) => string;
  placeholder: any;
  value: any;
  originalValue: any;
  onChange: (value: any) => void;
  onSaveToDb: (placeholder: any, value: any, source: any, arrayIndex: number | null) => Promise<void>;
  isSaving: boolean;
  onFileChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  imageStyles: Record<string, any>;
  onImageStyleChange?: (fieldKey: string, key: string, value: any) => void;
  autoPopulated?: boolean;
  isArrayItem?: boolean;
  arrayIndex?: number | null;
  blockName?: string | null;
  onAIRefine?: (placeholder: any) => void;
  isAIRefining?: boolean;
  resolvedOptions?: any[];
  masterFields?: Map<number, any>;
  showLabel?: boolean;
}

export const PlaceholderInput = ({
  resolveSourceValue, 
  placeholder, 
  value, 
  originalValue, 
  onChange, 
  onSaveToDb, 
  isSaving, 
  onFileChange, 
  imageStyles, 
  onImageStyleChange, 
  autoPopulated, 
  isArrayItem = false, 
  arrayIndex = null, 
  blockName = null, 
  onAIRefine, 
  isAIRefining, 
  resolvedOptions = [], 
  masterFields, 
  showLabel = false
}: PlaceholderInputProps) => {
  const fieldKey = isArrayItem ? `${blockName}_${arrayIndex}_${placeholder.name}` : placeholder.name;

  const [editingSource, setEditingSource] = useState<any>(null);
  const [editValue, setEditValue] = useState("");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const hasChanged = JSON.stringify(value) !== JSON.stringify(originalValue);
  const canSave = (placeholder.master_field_ids?.length > 0) || (placeholder.linked_job_question_ids?.length > 0);

  const mIds = placeholder.master_field_ids || [];
  const qIds = placeholder.linked_job_question_ids || (placeholder.linked_job_question_id ? [placeholder.linked_job_question_id] : []);
  const totalSources = mIds.length + qIds.length;

  const options = resolvedOptions.length > 0
    ? resolvedOptions
    : (placeholder.options || []).map((o: any) => typeof o === 'string' ? { label: o, value: o } : o);

  const handleStartEdit = (val: string, type: string, id: string, label: string) => {
    setEditValue(val || '');
    setEditingSource({ type, id, label });
    setIsPopoverOpen(false);
  };

  const handleSaveEdit = async () => {
    await onSaveToDb(placeholder, editValue, editingSource, arrayIndex);
    setEditingSource(null);
  };

  // --- Meta Column (Actions & Status) ---
  const MetaSection = () => (
    <div className="flex flex-col gap-1">
      {showLabel && (
        <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
          {placeholder.display_value || placeholder.name.replace(/_/g, ' ')}
        </Label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {canSave && hasChanged && (
          <button
            onClick={() => onSaveToDb(placeholder, value, null, arrayIndex)}
            disabled={isSaving}
            className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 hover:text-amber-700 transition-colors uppercase tracking-tight"
          >
            <Save className="h-3 w-3" /> Save Profile
          </button>
        )}
        {onAIRefine && placeholder.ai_prompt && (
          <button
            onClick={() => onAIRefine(placeholder)}
            disabled={isAIRefining}
            className="flex items-center gap-1.5 text-[10px] font-bold text-purple-600 hover:text-purple-700 transition-colors uppercase tracking-tight"
          >
            {isAIRefining ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            AI Refine
          </button>
        )}
        {autoPopulated && !hasChanged && (
          <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/50">
            Synced
          </span>
        )}
      </div>
    </div>
  );

  // --- Layout Helper ---
  const Layout = ({ children }: { children: React.ReactNode }) => (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center w-full group">
      <div className="md:col-span-4 flex items-center">
        <MetaSection />
      </div>
      <div className="md:col-span-8">
        {children}
      </div>
    </div>
  );

  // --- Inline Edit Mode (When overriding a source) ---
  if (editingSource) {
    return (
      <div className="flex items-center gap-3 w-full py-1.5 border-y border-blue-100 dark:border-blue-900/30 bg-blue-50/20 dark:bg-blue-950/10 px-2 rounded-md">
        <div className="flex-1">
          <div className="text-[9px] font-bold text-blue-600 uppercase mb-1 flex items-center gap-1">
            <Edit3 className="h-2.5 w-2.5" /> Editing {editingSource.label}
          </div>
          <Input 
            autoFocus 
            value={editValue} 
            onChange={(e) => setEditValue(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
            className="h-8 text-xs" 
          />
        </div>
        <div className="flex items-center gap-1 pt-4">
          <Button size="icon" onClick={handleSaveEdit} className="h-8 w-8 bg-green-600 hover:bg-green-700 shrink-0"><CheckCircle2 className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => setEditingSource(null)} className="h-8 w-8 text-red-500 shrink-0"><X className="h-4 w-4" /></Button>
        </div>
      </div>
    );
  }

  // --- 1. Multi-Source View (Popover) ---
  if (totalSources > 1 && placeholder.type !== 'image' && placeholder.type !== 'boolean') {
    const isMissing = !isValidValue(value);
    return (
      <Layout>
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <div className={cn(
              "text-xs h-10 flex items-center justify-between px-3 rounded-lg border cursor-pointer bg-white dark:bg-slate-950 transition-all shadow-sm",
              isMissing 
                ? "border-red-200 text-red-500 bg-red-50/30 dark:border-red-900/50 dark:bg-red-950/20" 
                : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
            )}>
              <span className="truncate font-semibold tracking-tight">{isMissing ? 'Missing Value' : value}</span>
              <div className="flex items-center gap-2 shrink-0 border-l border-slate-100 dark:border-slate-800 pl-3 ml-2">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-tighter">{placeholder.source_logic || 'priority'}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", isPopoverOpen && "rotate-180")} />
              </div>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0 shadow-xl border-slate-200 dark:border-slate-800 overflow-hidden" align="end">
            <div className="bg-slate-50 dark:bg-slate-900 px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data Sources</span>
              <Layers className="h-3 w-3 text-slate-400" />
            </div>
            <div className="p-1 max-h-64 overflow-y-auto">
              {mIds.map((mid: string, idx: number) => {
                const mf = masterFields?.get ? masterFields.get(parseInt(mid)) : null;
                const sourceVal = resolveSourceValue ? resolveSourceValue('db', mid, placeholder, arrayIndex) : '';
                return (
                  <div key={`m-${mid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-md group/item">
                    <div className="min-w-0 pr-2">
                      <div className="text-[8px] font-bold text-blue-600 uppercase">DB Field {idx + 1}</div>
                      <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">{mf?.label || `Field #${mid}`}</div>
                      <div className="text-[10px] text-slate-500 italic truncate">{isValidValue(sourceVal) ? sourceVal : 'Empty'}</div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover/item:opacity-100" onClick={() => handleStartEdit(sourceVal, 'db', mid, mf?.label || `Field #${mid}`)}>
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
              {qIds.map((qid: string) => {
                const sourceVal = resolveSourceValue ? resolveSourceValue('job', qid, placeholder, arrayIndex) : '';
                return (
                  <div key={`q-${qid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-md group/item">
                    <div className="min-w-0 pr-2">
                      <div className="text-[8px] font-bold text-purple-600 uppercase">Job Question</div>
                      <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">Question ID: {qid}</div>
                      <div className="text-[10px] text-slate-500 italic truncate">{isValidValue(sourceVal) ? sourceVal : 'Empty'}</div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover/item:opacity-100" onClick={() => handleStartEdit(sourceVal, 'job', qid, `Question ${qid}`)}>
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </Layout>
    );
  }

  // --- 2. Digit Split ---
  if (placeholder.is_digit_split) {
    const chars = processDigitSplit(value || '', placeholder.digit_count || 8);
    return (
      <Layout>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: placeholder.digit_count || 8 }).map((_, idx) => (
            <input 
              key={idx} 
              maxLength={1} 
              value={chars[idx] || ''} 
              onChange={(e) => {
                const char = e.target.value.slice(-1);
                let str = (value || '').padEnd(placeholder.digit_count, ' ');
                const newStr = str.substring(0, idx) + char + str.substring(idx + 1);
                onChange(newStr.trimEnd());
              }} 
              className="w-8 h-9 text-center border border-slate-200 dark:border-slate-800 rounded font-mono text-sm font-bold bg-white dark:bg-slate-950 focus:ring-1 focus:ring-blue-500 outline-none transition-all shadow-sm" 
            />
          ))}
        </div>
      </Layout>
    );
  }

  // --- 3. Image / Signature ---
  if (placeholder.type === 'image') {
    const style = imageStyles[fieldKey] || {};
    const defaultWidth = placeholder.image_width ? parseInt(placeholder.image_width) : 300;
    const defaultHeight = placeholder.image_height ? parseInt(placeholder.image_height) : 150;
    const imageWidth = style.imageWidth || defaultWidth;
    const imageHeight = style.imageHeight || defaultHeight;

    return (
      <Layout>
        <div className="space-y-3">
          {value ? (
            <div className="relative inline-block border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white shadow-sm group">
              <img 
                src={value} 
                alt="Upload Preview"
                className="object-contain" 
                style={{ width: `${imageWidth}px`, height: `${imageHeight}px` }} 
              />
              <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                <Button size="sm" variant="secondary" className="h-7 text-[10px] font-bold" onClick={() => document.getElementById(`file-${fieldKey}`)?.click()}>Replace</Button>
                <Button size="sm" variant="destructive" className="h-7 text-[10px] font-bold" onClick={() => onChange('')}>Remove</Button>
              </div>
            </div>
          ) : (
            <button 
              className="w-full h-24 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg flex flex-col items-center justify-center gap-1.5 text-slate-400 hover:text-blue-500 hover:border-blue-300 dark:hover:border-blue-900 transition-all bg-slate-50/30 dark:bg-slate-950/30"
              onClick={() => document.getElementById(`file-${fieldKey}`)?.click()}
            >
              <Expand className="h-5 w-5 opacity-50" />
              <span className="text-[10px] font-bold uppercase tracking-tight">Upload Image</span>
            </button>
          )}
          <input id={`file-${fieldKey}`} type="file" className="hidden" accept="image/*" onChange={onFileChange} />
          {value && onImageStyleChange && (
            <ImagePlaceholderControls styles={style} onStyleChange={(key, val) => onImageStyleChange(fieldKey, key, val)} />
          )}
        </div>
      </Layout>
    );
  }

  // --- 4. Boolean / Checkboxes ---
  if (placeholder.type === 'boolean') {
    const opts = Array.isArray(value) ? value : (placeholder.boolean_conditions || []);
    return (
      <Layout>
        <div className="flex flex-col gap-2.5">
          {opts.map((opt: any, idx: number) => (
            <div key={idx} className="flex items-center gap-3">
              <Checkbox 
                id={`${fieldKey}-${idx}`}
                checked={opt.checked || false} 
                disabled={opt.hasDbLink} 
                onCheckedChange={(checked) => {
                  const newOpts = [...opts];
                  if (placeholder.boolean_type === 'single') {
                    newOpts.forEach((o: any, i: number) => { if (!o.hasDbLink) o.checked = i === idx ? checked : false; });
                  } else { if (!newOpts[idx].hasDbLink) newOpts[idx].checked = checked; }
                  onChange(newOpts);
                }} 
              />
              <Label htmlFor={`${fieldKey}-${idx}`} className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                {opt.label && opt.label !== '✔' ? opt.label : opt.comparison?.value || opt.tag || 'Option'}
              </Label>
            </div>
          ))}
        </div>
      </Layout>
    );
  }

  // --- 5. Select Dropdown ---
  if (placeholder.type === 'select' || options.length > 0) {
    return (
      <Layout>
        <Select value={String(value || '')} onValueChange={(val) => {
          const selected = options.find((o: any) => String(o.value) === val);
          onChange(selected ? selected.label : val);
        }}>
          <SelectTrigger className={cn(
            "h-10 text-xs font-bold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm",
            hasChanged && canSave && "border-amber-400 ring-2 ring-amber-400/10"
          )}>
            <SelectValue>{getDisplayLabel(value, options)}</SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {options.map((o: any, i: number) => (
              <SelectItem key={i} value={String(o.value)} className="text-xs font-medium">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Layout>
    );
  }

  // --- 6. Standard Text Input (Default) ---
  return (
    <Layout>
      <div className="relative">
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-10 text-xs font-bold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm transition-all focus-visible:ring-1 pr-8",
            hasChanged && canSave 
              ? "border-amber-400 focus-visible:ring-amber-400/30" 
              : "focus-visible:ring-blue-500/30"
          )}
        />
        {hasChanged && canSave && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
          </div>
        )}
      </div>
    </Layout>
  );
};