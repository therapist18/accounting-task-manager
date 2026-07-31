'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from './SearchableSelect';
import { ScrollArea } from '@/components/ui/scroll-area';
import TemplateEditor from '@/components/TemplateEditor';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, ChevronDown, ChevronUp, LayoutList, Wand2, CircleAlert, Info } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { CONTRACT_SECTIONS } from '../utils/contractStructure';
import type { EcClause } from '../utils/clauseLibraryData';
import { EMPLOYMENT_TYPE_OPTIONS, WORK_ARRANGEMENT_OPTIONS, withCurrentValue } from '../utils/profileOptions';
import type { Company } from '../../companies/database';

export interface ClauseSuggestionCondition {
  employment_type?: string;
  job_level?: string;
  work_arrangement?: string;
  department?: string;
}

interface ClauseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: Partial<EcClause>;
  onDraftChange: (draft: Partial<EcClause>) => void;
  editingId: string | null;
  saving: boolean;
  onSave: () => void;
  condition: ClauseSuggestionCondition;
  onConditionChange: (condition: ClauseSuggestionCondition) => void;
  companies: Company[];
  groupNamesForSection: string[];
  clauses: EcClause[];
}

type ClauseFieldKey = 'clause_key' | 'label' | 'content';

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}

export function ClauseDialog({
  open,
  onOpenChange,
  draft,
  onDraftChange,
  editingId,
  saving,
  onSave,
  condition,
  onConditionChange,
  companies,
  groupNamesForSection,
  clauses,
}: ClauseDialogProps) {
  const [showSuggest, setShowSuggest] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const setDraft = (patch: Partial<EcClause>) => onDraftChange({ ...draft, ...patch });

  useEffect(() => {
    setSubmitAttempted(false);
  }, [open, editingId]);

  // Clauses already defined in the section the user is currently authoring
  // (excluding this one) - drives duplicate-key and default-clause guidance.
  const siblings = useMemo(
    () => clauses.filter((c) => c.section_key === draft.section_key && c.id !== editingId),
    [clauses, draft.section_key, editingId]
  );

  const otherDefault = siblings.find((c) => c.is_default);
  const noDefaultInSection = siblings.length > 0 && !siblings.some((c) => c.is_default);

  // Tiptap leaves <p></p> behind for an empty doc, so "has content" means
  // the HTML contains visible text, not just wrapper tags.
  const hasVisibleContent = useMemo(() => {
    if (!draft.content) return false;
    return draft.content.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').trim().length > 0;
  }, [draft.content]);

  const errors = useMemo<Partial<Record<ClauseFieldKey, string>>>(() => {
    const errs: Partial<Record<ClauseFieldKey, string>> = {};
    const key = (draft.clause_key || '').trim();
    if (!key) {
      errs.clause_key = 'Clause key is required.';
    } else if (!/^[a-z0-9_]+$/.test(key)) {
      errs.clause_key = 'Use only lowercase letters, numbers and underscores.';
    } else if (siblings.some((c) => c.clause_key === key)) {
      errs.clause_key = `A clause with key "${key}" already exists in this section - use a different key.`;
    }
    if (!(draft.label || '').trim()) {
      errs.label = 'Label is required.';
    }
    if (!hasVisibleContent) {
      errs.content = 'Content is required - add clause wording or at least one {{token}}.';
    }
    return errs;
  }, [draft.clause_key, draft.label, draft.content, hasVisibleContent, siblings]);

  const hasErrors = Object.keys(errors).length > 0;

  // Before the first submit attempt only surface issues the user has already
  // started fixing (format/duplicate), so an empty new-clause dialog stays calm.
  const visibleError = (field: ClauseFieldKey): string | undefined => {
    if (submitAttempted) return errors[field];
    if (field === 'clause_key') return (draft.clause_key || '').trim() ? errors.clause_key : undefined;
    if (field === 'label') return (draft.label || '').trim() ? errors.label : undefined;
    if (field === 'content') return hasVisibleContent ? errors.content : undefined;
    return undefined;
  };

  const handleSaveClick = () => {
    setSubmitAttempted(true);
    if (hasErrors) {
      toast({
        title: 'Cannot save clause',
        description: Object.values(errors)[0],
        variant: 'destructive',
      });
      return;
    }
    onSave();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col rounded-2xl p-0 overflow-hidden gap-0">
        <DialogHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-t-2xl shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                {editingId ? 'Edit Clause' : 'New Clause'}
              </DialogTitle>
              <p className="text-sm text-slate-500 mt-0.5">
                {editingId ? 'Refine the wording and configuration for this reusable clause.' : 'Author a reusable clause — it becomes available to every Job Profile.'}
              </p>
            </div>
            {editingId && draft.clause_key && (
              <Badge variant="outline" className="font-mono text-xs px-3 py-1 rounded-full bg-slate-50 text-slate-600 border-slate-200">
                {draft.section_key}/{draft.clause_key}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-950/30">
          <div className="p-6 space-y-5">
            {/* Identity + Scope */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <LayoutList className="w-4 h-4 text-custom-blue" />
                Identity &amp; Scope
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <Field label="Section">
                  <SearchableSelect
                    value={draft.section_key || null}
                    onChange={(v) => setDraft({ section_key: v })}
                    searchPlaceholder="Search sections..."
                    options={CONTRACT_SECTIONS.map((s) => ({ value: s.key, label: s.title }))}
                  />
                </Field>
                <Field label="Clause key">
                  <Input
                    className={cn("h-10", visibleError('clause_key') && "border-red-400 focus-visible:ring-red-400")}
                    placeholder="e.g. standard_office"
                    value={draft.clause_key || ''}
                    onChange={(e) => setDraft({ clause_key: e.target.value.trim().toLowerCase().replace(/\s+/g, '_') })}
                  />
                  {visibleError('clause_key') && (
                    <p className="text-xs text-red-600 flex items-start gap-1">
                      <CircleAlert className="w-3.5 h-3.5 mt-px shrink-0" /> {visibleError('clause_key')}
                    </p>
                  )}
                </Field>
                <Field label="Label">
                  <Input
                    className={cn("h-10", visibleError('label') && "border-red-400 focus-visible:ring-red-400")}
                    placeholder="e.g. Standard Office Hours"
                    value={draft.label || ''}
                    onChange={(e) => setDraft({ label: e.target.value })}
                  />
                  {visibleError('label') && (
                    <p className="text-xs text-red-600 flex items-start gap-1">
                      <CircleAlert className="w-3.5 h-3.5 mt-px shrink-0" /> {visibleError('label')}
                    </p>
                  )}
                </Field>
                <Field label="Scope">
                  <SearchableSelect
                    value={draft.company_id || '__global__'}
                    onChange={(v) => setDraft({ company_id: v === '__global__' ? null : v })}
                    searchPlaceholder="Search companies..."
                    options={[{ value: '__global__', label: 'Global (any company)' }, ...companies.map((c) => ({ value: String(c.id), label: c.company_name }))]}
                  />
                </Field>
                <Field label="Variant group (optional)">
                  <Input
                    className="h-10"
                    list="variant-group-options"
                    placeholder="e.g. Working Hours"
                    value={draft.variant_group || ''}
                    onChange={(e) => setDraft({ variant_group: e.target.value || null })}
                  />
                  <datalist id="variant-group-options">
                    {groupNamesForSection.map((g) => <option key={g} value={g} />)}
                  </datalist>
                </Field>
                <div className="flex items-center justify-between border border-slate-200 dark:border-slate-800 rounded-xl px-4 h-10 mt-[22px] bg-white">
                  <Label className="text-sm text-slate-600 dark:text-slate-300">Default for section</Label>
                  <Switch checked={!!draft.is_default} onCheckedChange={(v) => setDraft({ is_default: v })} />
                </div>
              </div>
              {draft.is_default && otherDefault && (
                <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 flex items-start gap-1.5">
                  <CircleAlert className="w-3.5 h-3.5 mt-px shrink-0" />
                  <span><strong>{otherDefault.label}</strong> is already marked default for this section - contract generation keeps the first default it finds, so this one will only win if it is listed first.</span>
                </p>
              )}
              {!draft.is_default && noDefaultInSection && (
                <p className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 mt-px shrink-0" />
                  <span>No default clause is set for this section yet - marking one gives Job Profiles a fallback when a linked clause is removed.</span>
                </p>
              )}
              <p className="text-xs text-slate-400">Clauses sharing a variant group show up as alternatives of one component (e.g. Office Hours vs Shift Hours).</p>
            </div>

            {/* Content Editor */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">Content</h4>
                <span className="text-[11px] text-slate-400">Use {'{{tokens}}'} — employee/company fields (employee_name, kra_pin, ...) and settings keys (working_hours, notice_period, ...)</span>
              </div>
              <div className={cn("rounded-lg overflow-hidden", visibleError('content') && "ring-2 ring-red-400")}>
                <TemplateEditor
                  key={editingId || 'new'}
                  initialContent={draft.content || ''}
                  onChange={(content) => setDraft({ content: content.html })}
                  showHeaderFooterControls={false}
                  className="min-h-[320px]"
                />
              </div>
              {visibleError('content') && (
                <p className="text-xs text-red-600 flex items-start gap-1 px-1 mt-1.5">
                  <CircleAlert className="w-3.5 h-3.5 mt-px shrink-0" /> {visibleError('content')}
                </p>
              )}
              {!visibleError('content') && hasVisibleContent && !/\{\{[\w-]+\}\}/.test(draft.content || '') && (
                <p className="text-xs text-slate-400 px-1 mt-1.5 flex items-start gap-1">
                  <Info className="w-3.5 h-3.5 mt-px shrink-0" />
                  <span>No {'{{tokens}}'} detected - this clause will read identically for every employee. Insert tokens like {'{{employee_name}}'} or {'{{working_hours}}'} to personalize it.</span>
                </p>
              )}
            </div>

            {/* Suggest conditions */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSuggest((s) => !s)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-custom-blue" />
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Suggest this clause when...</span>
                  <Badge variant="outline" className="text-[10px] font-semibold rounded-full px-2 py-0 text-slate-400">
                    {Object.values(condition).filter((v) => v).length ? `${Object.values(condition).filter((v) => v).length} rule(s)` : 'Optional'}
                  </Badge>
                </div>
                {showSuggest ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {showSuggest && (
                <div className="px-5 pb-5 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4">
                    <SearchableSelect
                      value={condition.employment_type || '__any__'}
                      onChange={(v) => onConditionChange({ ...condition, employment_type: v === '__any__' ? undefined : v })}
                      placeholder="Employment type"
                      searchPlaceholder="Search employment types..."
                      options={[{ value: '__any__', label: 'Any employment type' }, ...withCurrentValue(EMPLOYMENT_TYPE_OPTIONS, condition.employment_type).map((opt) => ({ value: opt, label: opt }))]}
                    />
                    <Input className="h-9 text-sm" placeholder="Job level" value={condition.job_level || ''} onChange={(e) => onConditionChange({ ...condition, job_level: e.target.value || undefined })} />
                    <SearchableSelect
                      value={condition.work_arrangement || '__any__'}
                      onChange={(v) => onConditionChange({ ...condition, work_arrangement: v === '__any__' ? undefined : v })}
                      placeholder="Work arrangement"
                      searchPlaceholder="Search work arrangements..."
                      options={[{ value: '__any__', label: 'Any work arrangement' }, ...withCurrentValue(WORK_ARRANGEMENT_OPTIONS, condition.work_arrangement).map((opt) => ({ value: opt, label: opt }))]}
                    />
                    <Input className="h-9 text-sm" placeholder="Department" value={condition.department || ''} onChange={(e) => onConditionChange({ ...condition, department: e.target.value || undefined })} />
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <Label className="text-sm text-slate-500 shrink-0">Priority (ties broken by highest)</Label>
                    <Input
                      type="number"
                      className="h-9 text-sm w-20"
                      value={draft.suggest_priority ?? 0}
                      onChange={(e) => setDraft({ suggest_priority: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-10 px-5 rounded-full text-sm font-semibold">
            Cancel
          </Button>
          <Button onClick={handleSaveClick} disabled={saving} className="h-10 px-6 rounded-full text-sm font-semibold shadow-md shadow-blue-500/10">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {editingId ? 'Save changes' : 'Create clause'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
