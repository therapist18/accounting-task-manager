'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
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
import {
  Loader2, PlusCircle, Settings, Trash2, BookText, Star, Briefcase,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Columns2, FileText, Search, List,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
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
  const [selectedSectionKey, setSelectedSectionKey] = useState<string>(CONTRACT_SECTIONS[0].key);
  const [selectedClause, setSelectedClause] = useState<EcClause | null>(null);
  const [condition, setCondition] = useState<{ employment_type?: string; job_level?: string; work_arrangement?: string; department?: string }>({});

  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const editorPanelRef = useRef<ImperativePanelHandle>(null);
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const [collapsed, setCollapsed] = useState({ sidebar: false, editor: false, preview: false });

  const togglePanel = (key: keyof typeof collapsed) => {
    const ref = key === 'sidebar' ? sidebarPanelRef : key === 'editor' ? editorPanelRef : previewPanelRef;
    const panel = ref.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand(); else panel.collapse();
  };

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

  const sectionClauses = useMemo(() => {
    return grouped.find(g => g.section.key === selectedSectionKey)?.items || [];
  }, [grouped, selectedSectionKey]);

  const openNew = (sectionKey?: string) => {
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT, section_key: sectionKey || selectedSectionKey });
    setCondition({});
    setDialogOpen(true);
  };

  const openEdit = (clause: EcClause) => {
    setEditingId(clause.id);
    setDraft(clause);
    setSelectedClause(clause);
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
      if (selectedClause?.id === id) setSelectedClause(null);
      toast({ title: 'Clause deleted' });
    } else {
      toast({ title: 'Error', description: 'Failed to delete clause', variant: 'destructive' });
    }
  };

  return (
    <div className="max-h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100">Clause Library</h1>
          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-3">
            <button
              onClick={() => togglePanel('sidebar')}
              title={collapsed.sidebar ? 'Show sections panel' : 'Hide sections panel'}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                collapsed.sidebar ? "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" : "text-custom-blue bg-blue-50 dark:bg-blue-900/20"
              )}
            >
              {collapsed.sidebar ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <button
              onClick={() => togglePanel('editor')}
              title={collapsed.editor ? 'Show clauses panel' : 'Hide clauses panel'}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                collapsed.editor ? "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" : "text-custom-blue bg-blue-50 dark:bg-blue-900/20"
              )}
            >
              <Columns2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => togglePanel('preview')}
              title={collapsed.preview ? 'Show preview panel' : 'Hide preview panel'}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                collapsed.preview ? "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" : "text-custom-blue bg-blue-50 dark:bg-blue-900/20"
              )}
            >
              {collapsed.preview ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/dashboard/employment-contracts" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">Contracts</Link>
          <Link href="/dashboard/employment-contracts/job-profiles" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><Briefcase className="w-3.5 h-3.5" /> Job Profiles</Link>
          <Link href="/dashboard/employment-contracts/templates" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><Settings className="w-3.5 h-3.5" /> Templates</Link>
        </div>
      </div>

      <PanelGroup direction="horizontal" className="h-full w-full">
        {/* LEFT PANEL: Sections list */}
        <Panel
          ref={sidebarPanelRef}
          defaultSize={18}
          minSize={14}
          maxSize={28}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, sidebar: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, sidebar: false }))}
          className="bg-white dark:bg-slate-900 flex flex-col z-10 overflow-auto"
        >
          <div className="flex flex-col h-full border-r border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <List className="w-4 h-4 text-custom-blue" />
                Sections
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">21 standard contract sections</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5">
                {grouped.map(({ section, items }) => (
                  <button
                    key={section.key}
                    onClick={() => { setSelectedSectionKey(section.key); setSelectedClause(null); }}
                    className={cn(
                      "flex items-center w-full p-2 text-xs rounded-md transition-colors",
                      selectedSectionKey === section.key
                        ? "bg-custom-blue text-white font-medium shadow-sm"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    <BookText className="w-3.5 h-3.5 mr-2 shrink-0" />
                    <span className="truncate flex-1 text-left">{section.title}</span>
                    <Badge variant="outline" className="text-[9px] font-semibold rounded-full px-1.5 py-0 ml-1 tabular-nums">
                      {items.length}
                    </Badge>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* CENTER PANEL: Clause cards for selected section */}
        <Panel
          ref={editorPanelRef}
          defaultSize={50}
          minSize={30}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, editor: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, editor: false }))}
          className="bg-slate-50 dark:bg-slate-950 flex flex-col z-10 !overflow-auto"
        >
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <BookText className="w-4 h-4 text-custom-blue" />
                    {CONTRACT_SECTIONS.find(s => s.key === selectedSectionKey)?.title || 'Select a section'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Reusable wording — authored once, reused by every Job Profile</p>
                </div>
                <Button size="sm" className="h-8 text-xs" onClick={() => openNew()}>
                  <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> New Clause
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              {isLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : sectionClauses.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center border-2 border-dashed rounded-2xl border-slate-200 dark:border-slate-800">
                  <BookText className="h-10 w-10 text-slate-300 mb-3" />
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">No clauses for this section</h3>
                  <p className="text-xs text-slate-500 mt-1">Add a clause to get started.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sectionClauses.map((clause) => (
                    <div
                      key={clause.id}
                      onClick={() => { openEdit(clause); setSelectedClause(clause); }}
                      className={cn(
                        "cursor-pointer border rounded-xl p-4 transition-all duration-200",
                        selectedClause?.id === clause.id
                          ? "border-custom-blue bg-blue-50 dark:bg-blue-900/20 shadow-md ring-1 ring-custom-blue/20"
                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-md"
                      )}
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
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={(e) => { e.stopPropagation(); openEdit(clause); setSelectedClause(clause); }}>
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
                          {clause.company_id ? (companies.find((c) => String(c.id) === clause.company_id)?.company_name || 'Company') : 'Global'}
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
            </ScrollArea>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* RIGHT PANEL: Clause content preview */}
        <Panel
          ref={previewPanelRef}
          defaultSize={32}
          minSize={22}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, preview: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, preview: false }))}
          className="bg-slate-100 dark:bg-slate-900 flex flex-col z-10 border-l border-slate-200 dark:border-slate-800 !overflow-auto"
        >
          <div className="flex flex-col h-full">
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-custom-blue" />
                Clause Preview
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Select a clause to preview its content</p>
            </div>
            <div className="flex-1 overflow-auto p-3">
              {selectedClause ? (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      {selectedClause.is_default && <Star className="h-3.5 w-3.5 text-amber-500 shrink-0" fill="currentColor" />}
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{selectedClause.label}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-slate-500">Key:</span> <span className="font-mono text-slate-700 dark:text-slate-200">{selectedClause.clause_key}</span></div>
                      <div><span className="text-slate-500">Scope:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedClause.company_id ? 'Company' : 'Global'}</span></div>
                      {selectedClause.suggest_conditions?.length > 0 && (
                        <div className="col-span-2">
                          <span className="text-slate-500">Suggest when:</span>{' '}
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            {Object.entries(selectedClause.suggest_conditions[0] || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Content</p>
                    <div
                      className="prose prose-xs max-w-none text-slate-700 dark:text-slate-200 [&_strong]:text-slate-800 [&_strong]:dark:text-slate-100"
                      dangerouslySetInnerHTML={{ __html: selectedClause.content }}
                    />
                  </div>

                  {selectedClause.content?.includes('{{') && (
                    <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Placeholders Used</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(selectedClause.content.matchAll(/\{\{(\w+)\}\}/g)).map((m, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] font-mono bg-slate-50 text-slate-600 border-slate-200 rounded-full px-2 py-0.5">
                            {'{{' + m[1] + '}}'}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <FileText className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-xs text-slate-500">Select a clause to preview its rendered content</p>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>

      {/* Clause Editor Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col rounded-2xl p-0">
          <DialogHeader className="sticky top-0 z-10 bg-white dark:bg-slate-900 px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800 rounded-t-2xl">
            <DialogTitle className="text-base font-bold">{editingId ? 'Edit Clause' : 'New Clause'}</DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 overflow-auto px-6 py-4">
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
          </ScrollArea>

          <div className="px-6 pb-6 pt-2 border-t border-slate-200 dark:border-slate-800">
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {editingId ? 'Save changes' : 'Create clause'}
              </Button>
            </DialogFooter>
          </div>
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
