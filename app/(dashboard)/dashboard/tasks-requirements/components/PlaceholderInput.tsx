// @ts-nocheck

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AlignLeft, AlignCenter, AlignRight, Expand, CheckCircle2, X, Database, HelpCircle, Edit3, Save, Layers, ChevronDown } from 'lucide-react';
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
  onAIRefine?: () => void;
  isAIRefining?: boolean;
  resolvedOptions?: any[];
  masterFields?: Map<number, any>;
  showLabel?: boolean;
  formData?: Record<string, any>;
  requirementJobQuestions?: any;
  task?: any;
}

export const PlaceholderInput = ({
  resolveSourceValue, placeholder, value, originalValue, onChange, onSaveToDb, isSaving, onFileChange, imageStyles, onImageStyleChange, autoPopulated, isArrayItem = false, arrayIndex = null, blockName = null, onAIRefine, isAIRefining, resolvedOptions = [], masterFields, showLabel = true
}: PlaceholderInputProps) => {
  const fieldKey = isArrayItem ? `${blockName}_${arrayIndex}_${placeholder.name}` : placeholder.name;

  // tracks which specific source (Table/ID) is being edited inline
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

  const handleCancelEdit = () => {
    setEditingSource(null);
    setEditValue("");
  };

  const handleSaveEdit = async () => {
    await onSaveToDb(placeholder, editValue, editingSource, arrayIndex);
    setEditingSource(null);
  };
  const inputRef = useRef<HTMLInputElement>(null);

  // --- STATE A: INLINE EDITING MODE (Triggered by Pencil) ---
  if (editingSource) {
    return (
      <div className="space-y-1 animate-in fade-in zoom-in-95 duration-200">
        {showLabel && (
          <Label className="text-[10px] font-bold text-blue-600 uppercase tracking-tight flex items-center gap-1">
            <Edit3 className="h-2.5 w-2.5" /> Editing {editingSource.label}
          </Label>
        )}
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') handleCancelEdit();
            }}
            className="h-8 text-xs border-blue-400 ring-2 ring-blue-50"
          />
          <Button size="icon" onClick={handleSaveEdit} className="h-8 w-8 bg-green-600 hover:bg-green-700 shrink-0">
            <CheckCircle2 className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleCancelEdit} className="h-8 w-8 text-red-500 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // --- STATE B: MULTI-SOURCE VIEW (Popover) ---
  if (totalSources > 1 && placeholder.type !== 'image' && placeholder.type !== 'boolean') {
    return (
      <div className="space-y-1">
        {showLabel && <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{placeholder.display_value || placeholder.name.replace(/_/g, ' ')}</Label>}
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <div className={cn(
              "text-xs h-8 flex items-center px-2 rounded cursor-pointer border border-dashed border-blue-200 bg-blue-50/20 hover:bg-blue-50 transition-colors",
              !isValidValue(value) ? "text-red-500 italic" : "text-slate-900 font-medium"
            )}>
              <span className="truncate flex-1">{isValidValue(value) ? value : 'Missing'}</span>
              <div className="flex items-center gap-1.5 ml-2">
                <Badge variant="outline" className="text-[8px] h-4 px-1 uppercase bg-white border-blue-200 text-blue-600 font-bold">
                  {placeholder.source_logic || 'priority'}
                </Badge>
                <ChevronDown className="h-3 w-3 text-blue-400 shrink-0" />
              </div>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0 shadow-xl border-blue-100" align="end">
            <div className="p-2 bg-slate-50 border-b flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Select Source to Edit</span>
              <Layers className="h-3 w-3 text-slate-400" />
            </div>

            <div className="p-1 space-y-1 max-h-[300px] overflow-y-auto bg-white">
              {mIds.map((mid: string, idx: number) => {
                const mf = masterFields?.get ? masterFields.get(parseInt(mid)) : null;
                const sourceValue = resolveSourceValue ? resolveSourceValue('db', mid, placeholder, arrayIndex) : '';
                return (
                  <div key={`m-${mid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 group transition-all">
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-[9px] font-bold text-blue-600 flex items-center gap-1 uppercase">
                        <Database className="h-2.5 w-2.5" /> DB FIELD {idx + 1}
                      </span>
                      <span className="text-xs font-medium truncate text-slate-700 mt-0.5">{mf?.label || `Field #${mid}`}</span>
                      <span className="text-[10px] text-slate-400 italic truncate">{isValidValue(sourceValue) ? sourceValue : 'Empty'}</span>
                    </div>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleStartEdit(sourceValue, 'db', mid, mf?.label || `Field #${mid}`)}
                    >
                      <Edit3 className="h-4 w-4 text-blue-500" />
                    </Button>
                  </div>
                );
              })}

              {qIds.map((qid: string, idx: number) => {
                const sourceValue = resolveSourceValue ? resolveSourceValue('job', qid, placeholder, arrayIndex) : '';
                return (
                  <div key={`q-${qid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 group transition-all">
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-[9px] font-bold text-purple-600 flex items-center gap-1 uppercase">
                        <HelpCircle className="h-2.5 w-2.5" /> QUESTION
                      </span>
                      <span className="text-xs font-medium truncate text-slate-700 mt-0.5">ID: {qid}</span>
                      <span className="text-[10px] text-slate-400 italic truncate">{isValidValue(sourceValue) ? sourceValue : 'Empty'}</span>
                    </div>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleStartEdit(sourceValue, 'job', qid, `Question ${qid}`)}
                    >
                      <Edit3 className="h-4 w-4 text-purple-500" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // --- STATE C: SINGLE SOURCE VIEW (Direct Input) ---
  const FieldHeader = () => {
    const hasDefault = placeholder.default_value && placeholder.default_value.trim() !== '';
    return (
      <div className="flex items-center justify-between mb-2">
        {showLabel && (
          <Label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
            {placeholder.display_value || placeholder.name.replace(/_/g, ' ')}
          </Label>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {canSave && hasChanged && (
            <Button
              size="sm" variant="ghost"
              className="h-7 px-3 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 border border-green-200 rounded-md transition-colors"
              onClick={() => onSaveToDb(placeholder, value, null, arrayIndex)}
              disabled={isSaving}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              <span className="text-[10px] font-semibold">SAVE TO PROFILE</span>
            </Button>
          )}
        </div>
      </div>
    );
  };

  if (placeholder.is_digit_split) {
    const chars = processDigitSplit(value || '', placeholder.digit_count || 8);
    return (
      <div className="space-y-2">
        <FieldHeader />
        <div className={cn("flex flex-wrap gap-1.5 p-2 rounded-lg border", hasChanged && canSave ? "bg-amber-50 border-amber-300" : "bg-slate-50 border-slate-200")}>
          {Array.from({ length: placeholder.digit_count || 8 }).map((_, idx) => (
            <input key={idx} maxLength={1} value={chars[idx] || ''} onChange={(e) => {
              const char = e.target.value.slice(-1);
              let str = (value || '').padEnd(placeholder.digit_count, ' ');
              const newStr = str.substring(0, idx) + char + str.substring(idx + 1);
              onChange(newStr.trimEnd());
            }} className="w-8 h-9 text-center border border-slate-300 rounded-md font-mono font-bold text-sm bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
          ))}
        </div>
      </div>
    );
  }

  if (placeholder.type === 'image') {
    const style = imageStyles[fieldKey] || {};
    const defaultWidth = placeholder.image_width ? parseInt(placeholder.image_width) : 300;
    const defaultHeight = placeholder.image_height ? parseInt(placeholder.image_height) : 200;
    const imageWidth = style.imageWidth || defaultWidth;
    const imageHeight = style.imageHeight || defaultHeight;

    return (
      <div className="space-y-2">
        <FieldHeader />
        {value ? (
          <div className={cn("relative border-2 rounded-lg overflow-hidden flex items-center justify-center bg-white shadow-sm", hasChanged && canSave ? "border-amber-400 ring-2 ring-amber-50" : "border-slate-200")} style={{ maxWidth: `${imageWidth}px`, height: `${imageHeight}px` }}>
            <img src={value} className="max-h-full object-contain" style={{ textAlign: style.textAlign || 'center', maxWidth: style.maxWidth || '100%', width: `${imageWidth}px`, height: `${imageHeight}px` }} />
            <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button size="sm" variant="secondary" className="h-8 text-xs font-medium" onClick={() => document.getElementById(`file-${fieldKey}`)?.click()}>Replace</Button>
              <Button size="sm" variant="destructive" className="h-8 text-xs font-medium" onClick={() => onChange('')}>Remove</Button>
            </div>
          </div>
        ) : (
          <div className="text-xs italic border-2 border-dashed border-slate-300 rounded-lg p-6 text-center text-slate-400 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer" onClick={() => document.getElementById(`file-${fieldKey}`)?.click()}>
            Upload {placeholder.display_value || placeholder.name}
          </div>
        )}
        <input id={`file-${fieldKey}`} type="file" className="hidden" accept="image/jpeg,image/jpg,image/png" onChange={onFileChange} />
        {value && onImageStyleChange && (
          <ImagePlaceholderControls
            styles={style}
            onStyleChange={(key, val) => onImageStyleChange(fieldKey, key, val)}
          />
        )}
      </div>
    );
  }

  if (placeholder.type === 'boolean') {
    const opts = Array.isArray(value) ? value : (placeholder.boolean_conditions || []);
    return (
      <div className="space-y-2">
        <FieldHeader />
        <div className={cn("space-y-2 p-3 rounded-lg border", hasChanged && canSave ? "bg-amber-50 border-amber-300" : "bg-slate-50 border-slate-200")}>
          {opts.map((opt: any, idx: number) => (
            <div key={idx} className={cn("flex items-center gap-3 p-3 border rounded-md bg-white shadow-sm transition-all", opt.checked ? "border-blue-300 bg-blue-50/30" : "border-slate-200")}>
              <Checkbox checked={opt.checked || false} disabled={opt.hasDbLink} onCheckedChange={(checked) => {
                const newOpts = [...opts];
                if (placeholder.boolean_type === 'single') {
                  newOpts.forEach((o: any, i: number) => { if (!o.hasDbLink) o.checked = i === idx ? checked : false; });
                } else { if (!newOpts[idx].hasDbLink) newOpts[idx].checked = checked; }
                onChange(newOpts);
              }} className="h-4 w-4" />
              <Label className="text-xs font-medium flex-1 cursor-pointer">
                {opt.label && opt.label !== '✔' ? opt.label :
                  opt.comparison?.value ? opt.comparison.value :
                    opt.tag ? opt.tag.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) :
                      'Option'}
              </Label>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (placeholder.type === 'select' || resolvedOptions.length > 0) {
    return (
      <div className="">
        <FieldHeader />
        <Select value={String(value || '')} onValueChange={(val) => {
          const selected = options.find((o: any) => String(o.value) === val);
          onChange(selected ? selected.label : val);
        }}>
          <SelectTrigger className={cn("w-full bg-white h-8 text-xs", hasChanged && canSave ? "border-amber-400 ring-2 ring-amber-50" : "")}>
            <SelectValue>{getDisplayLabel(value, options)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((o: any, i: number) => <SelectItem key={i} value={String(o.value)}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="">
      <FieldHeader />
      <div className="relative">
        <Input
          ref={inputRef}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className={cn("bg-white h-8 text-xs transition-all pr-8", hasChanged && canSave ? "border-amber-400 ring-2 ring-amber-50" : "focus:border-blue-400")}
        />
        {hasChanged && canSave && <div className="absolute right-2.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />}
      </div>
    </div>
  );
};
