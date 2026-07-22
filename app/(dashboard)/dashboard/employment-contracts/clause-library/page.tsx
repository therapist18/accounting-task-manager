'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, PlusCircle, Settings, Trash2, BookText, Star } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { CONTRACT_SECTIONS } from '../utils/contractStructure';
import { EcClause, fetchClauses, createClause, updateClause, deleteClause } from '../utils/clauseLibraryData';
import { fetchCompanies, Company } from '../../companies/database';

const EMPTY_DRAFT: Partial<EcClause> = {
  section_key: CONTRACT_SECTIONS[0].key,
  clause_key: '',
  label: '',
  content: '',
  is_default: false,
  company_id: null,
  suggest_conditions: [],
  suggest_priority: 0,
};

export default function ClauseLibraryPage() {
  const [clauses, setClauses] = useState<EcClause[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<EcClause>>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Suggestion condition editing is a single AND-ed condition set in this UI
  // (ec_clauses.suggest_conditions supports an array for future OR cases).
  const [condition, setCondition] = useState<{ employment_type?: string; job_level?: string; work_arrangement?: string; department?: string }>({});

  const load = async () => {
    setIsLoading(true);
    const [c, comps] = await Promise.all([fetchClauses(), fetchCompanies()]);
    setClauses(c);
    setCompanies(comps);
    setIsLoading(false);
  };

  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, EcClause[]>();
    for (const c of clauses) {
      if (!map.has(c.section_key)) map.set(c.section_key, []);
      map.get(c.section_key)!.push(c);
    }
    return CONTRACT_SECTIONS.map((s) => ({ section: s, items: map.get(s.key) || [] }));
  }, [clauses]);

  const openNew = (sectionKey?: string) => {
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT, section_key: sectionKey || CONTRACT_SECTIONS[0].key });
    setCondition({});
    setDialogOpen(true);
  };

  const openEdit = (clause: EcClause) => {
    setEditingId(clause.id);
    setDraft(clause);
    setCondition(clause.suggest_conditions?.[0] || {});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!draft.clause_key?.trim() || !draft.label?.trim() || !draft.content?.trim()) {
      toast({ title: 'Missing fields', description: 'Section, key, label and content are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const hasCondition = Object.values(condition).some((v) => !!v);
    const payload: Partial<EcClause> = {
      ...draft,
      suggest_conditions: hasCondition ? [condition] : [],
    };
    try {
      if (editingId) {
        await updateClause(editingId, payload);
        toast({ title: 'Clause updated' });
      } else {
        await createClause(payload);
        toast({ title: 'Clause created' });
      }
      setDialogOpen(false);
      await load();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save clause', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteClause(id);
    if (ok) {
      setClauses((prev) => prev.filter((c) => c.id !== id));
      toast({ title: 'Clause deleted' });
    } else {
      toast({ title: 'Error', description: 'Failed to delete clause', variant: 'destructive' });
    }
  };

  return (
    <div className="h-[calc(100vh-2rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Clause Library</h1>
          <p className="text-xs text-slate-500">Reusable wording per contract section - authored once, reused by every Job Profile</p>
        </div>
        <Button
          onClick={() => openNew()}
          className="h-9 px-4 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-blue-500/10 border-0 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <PlusCircle className="mr-1.5 h-4 w-4" /> New Clause
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-8">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            grouped.map(({ section, items }) => (
              <div key={section.key}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <BookText className="h-4 w-4 text-slate-400" />
                    {section.title}
                    <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 text-slate-500 border-slate-200 rounded-full px-2 py-0.5">
                      {items.length}
                    </Badge>
                  </h2>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500" onClick={() => openNew(section.key)}>
                    <PlusCircle className="h-3.5 w-3.5 mr-1" /> Add clause
                  </Button>
                </div>

                {items.length === 0 ? (
                  <div className="text-xs text-slate-400 italic border border-dashed rounded-xl p-4 border-slate-200 dark:border-slate-800">
                    No clauses yet for this section.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {items.map((clause) => (
                      <div
                        key={clause.id}
                        onClick={() => openEdit(clause)}
                        className="cursor-pointer border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
                              {clause.is_default && <Star className="h-3.5 w-3.5 text-amber-500 shrink-0" fill="currentColor" />}
                              {clause.label}
                            </p>
                            <p className="text-xs text-slate-400 truncate">{clause.clause_key}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={(e) => { e.stopPropagation(); openEdit(clause); }}>
                              <Settings className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={(e) => { e.stopPropagation(); setDeletingId(clause.id); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-3">
                          {clause.is_default && (
                            <Badge className="text-[10px] font-semibold bg-amber-50 text-amber-700 border-amber-200 rounded-full px-2 py-0.5" variant="outline">Default</Badge>
                          )}
                          <Badge className="text-[10px] font-semibold bg-slate-50 text-slate-600 border-slate-200 rounded-full px-2 py-0.5" variant="outline">
                            {clause.company_id ? (companies.find((c) => String(c.id) === clause.company_id)?.company_name || 'Company-specific') : 'Global'}
                          </Badge>
                          {clause.suggest_conditions?.length > 0 && (
                            <Badge className="text-[10px] font-semibold bg-purple-50 text-purple-700 border-purple-200 rounded-full px-2 py-0.5" variant="outline">
                              Rule-suggested
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">{editingId ? 'Edit Clause' : 'New Clause'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Section</Label>
                <Select value={draft.section_key} onValueChange={(v) => setDraft({ ...draft, section_key: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTRACT_SECTIONS.map((s) => (
                      <SelectItem key={s.key} value={s.key}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Clause key</Label>
                <Input
                  className="h-9"
                  placeholder="e.g. standard_office"
                  value={draft.clause_key || ''}
                  onChange={(e) => setDraft({ ...draft, clause_key: e.target.value.trim().toLowerCase().replace(/\s+/g, '_') })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input className="h-9" placeholder="e.g. Standard Office Hours" value={draft.label || ''} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Content</Label>
              <Textarea
                className="min-h-[160px] font-mono text-xs"
                placeholder="<p>The Employee shall work {{working_days}}, {{working_hours}}.</p>"
                value={draft.content || ''}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              />
              <p className="text-[11px] text-slate-400">HTML with {'{{tokens}}'} - employee/company fields (employee_name, kra_pin, ...) and settings keys (working_hours, notice_period, benefits, ...) both resolve here.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Scope</Label>
                <Select value={draft.company_id || '__global__'} onValueChange={(v) => setDraft({ ...draft, company_id: v === '__global__' ? null : v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__global__">Global (any company)</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={String(c.id)} value={String(c.id)}>{c.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between border border-slate-200 dark:border-slate-800 rounded-lg px-3 h-9 mt-[22px]">
                <Label className="text-xs">Default for section</Label>
                <Switch checked={!!draft.is_default} onCheckedChange={(v) => setDraft({ ...draft, is_default: v })} />
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-3">
              <Label className="text-xs font-semibold text-slate-600">Suggest this clause when... (optional)</Label>
              <div className="grid grid-cols-2 gap-3">
                <Input className="h-8 text-xs" placeholder="Employment type" value={condition.employment_type || ''} onChange={(e) => setCondition({ ...condition, employment_type: e.target.value || undefined })} />
                <Input className="h-8 text-xs" placeholder="Job level" value={condition.job_level || ''} onChange={(e) => setCondition({ ...condition, job_level: e.target.value || undefined })} />
                <Input className="h-8 text-xs" placeholder="Work arrangement" value={condition.work_arrangement || ''} onChange={(e) => setCondition({ ...condition, work_arrangement: e.target.value || undefined })} />
                <Input className="h-8 text-xs" placeholder="Department" value={condition.department || ''} onChange={(e) => setCondition({ ...condition, department: e.target.value || undefined })} />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-slate-500 shrink-0">Priority (ties broken by highest)</Label>
                <Input
                  type="number"
                  className="h-8 text-xs w-20"
                  value={draft.suggest_priority ?? 0}
                  onChange={(e) => setDraft({ ...draft, suggest_priority: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingId ? 'Save changes' : 'Create clause'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent className="rounded-2xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-slate-800">Delete this clause?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500">
              Job Profiles referencing this clause will fall back to the section's default clause. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="h-9 px-4 rounded-full text-xs font-semibold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deletingId) handleDelete(deletingId); setDeletingId(null); }}
              className="h-9 px-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-md shadow-red-500/10 border-0"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
