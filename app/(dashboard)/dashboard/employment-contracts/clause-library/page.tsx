'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, PlusCircle, Settings, Trash2, BookText, Star, Briefcase, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Columns2, FileText, Search, List, Layers, } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { CONTRACT_SECTIONS } from '../utils/contractStructure';
import { EcClause, fetchClauses, createClause, updateClause, deleteClause } from '../utils/clauseLibraryData';
import { detectTokens, syncPlaceholdersFromContent } from '../utils/placeholderDetection';
import { fetchCompanies, Company } from '../../companies/database';
import { PlaceholderSources } from '../components/PlaceholderSources';
import { ClauseDialog } from '../components/ClauseDialog';

const EMPTY_DRAFT: Partial<EcClause> = {
  section_key: CONTRACT_SECTIONS[0].key,
  clause_key: '',
  label: '',
  content: '',
  is_default: false,
  company_id: null,
  variant_group: null,
  suggest_conditions: [],
  suggest_priority: 0,
};

function ClauseCard({
  clause, companies, selected, onSelect, onEdit, onDelete, compact,
}: {
  clause: EcClause;
  companies: Company[];
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "cursor-pointer border rounded-xl transition-all duration-200",
        compact ? "p-3.5" : "p-5",
        selected
          ? "border-custom-blue bg-blue-50 dark:bg-blue-900/20 shadow-md ring-1 ring-custom-blue/20"
          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("font-semibold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5", compact ? "text-sm" : "text-base")}>
            {clause.is_default && <Star className="h-4 w-4 text-amber-500 shrink-0" fill="currentColor" />}
            {clause.label}
          </p>
          <p className="text-sm text-slate-400 truncate">{clause.clause_key}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {clause.is_default && (
          <Badge className="text-xs font-semibold bg-amber-50 text-amber-700 border-amber-200 rounded-full px-2 py-0.5" variant="outline">Default</Badge>
        )}
        <Badge className="text-xs font-semibold bg-slate-50 text-slate-600 border-slate-200 rounded-full px-2 py-0.5" variant="outline">
          {clause.company_id ? (companies.find((c) => String(c.id) === clause.company_id)?.company_name || 'Company') : 'Global'}
        </Badge>
        {clause.suggest_conditions?.length > 0 && (
          <Badge className="text-xs font-semibold bg-purple-50 text-purple-700 border-purple-200 rounded-full px-2 py-0.5" variant="outline">
            Rule-suggested
          </Badge>
        )}
      </div>
    </div>
  );
}

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
  const [highlightPlaceholderKeys, setHighlightPlaceholderKeys] = useState<string[]>([]);
  const [placeholderRefreshKey, setPlaceholderRefreshKey] = useState(0);

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

  useEffect(() => {
    if (selectedClause) {
      setHighlightPlaceholderKeys(detectTokens(selectedClause.content));
    } else {
      setHighlightPlaceholderKeys([]);
    }
  }, [selectedClause]);

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

  type ClauseEntry = { kind: 'single'; clause: EcClause } | { kind: 'group'; key: string; clauses: EcClause[] };
  const sectionEntries = useMemo<ClauseEntry[]>(() => {
    const seenGroups = new Set<string>();
    const entries: ClauseEntry[] = [];
    for (const c of sectionClauses) {
      if (c.variant_group) {
        if (seenGroups.has(c.variant_group)) continue;
        seenGroups.add(c.variant_group);
        entries.push({ kind: 'group', key: c.variant_group, clauses: sectionClauses.filter((x) => x.variant_group === c.variant_group) });
      } else {
        entries.push({ kind: 'single', clause: c });
      }
    }
    return entries;
  }, [sectionClauses]);

  const groupNamesForSection = useMemo(() => {
    const set = new Set<string>();
    for (const c of clauses) {
      if (c.section_key === draft.section_key && c.variant_group) set.add(c.variant_group);
    }
    return Array.from(set).sort();
  }, [clauses, draft.section_key]);

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
      let saved: EcClause | null = null;
      if (editingId) {
        saved = await updateClause(editingId, payload);
        toast({ title: 'Clause updated', description: `"${saved?.label || draft.label}" saved.` });
      } else {
        saved = await createClause(payload);
        toast({ title: 'Clause created', description: `"${saved?.label || draft.label}" is now available to Job Profiles.` });
      }
      setDialogOpen(false);
      await load();
      await syncPlaceholdersFromContent([payload.content || '']);
      setPlaceholderRefreshKey((k) => k + 1);
      if (saved) {
        // Keep the preview in sync: refresh the selected clause (editing) or
        // select the newly created one (creating).
        setSelectedClause((prev) => (editingId && prev?.id !== saved.id ? prev : saved));
      }
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
    <div className="h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      {/* HEADER */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">Clause Library</h1>
          <div className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-full border border-slate-200 dark:border-slate-800/80 ml-3">
            <button
              onClick={() => togglePanel('sidebar')}
              title={collapsed.sidebar ? 'Show sections panel' : 'Hide sections panel'}
              className={cn(
                "p-1.5 rounded-full transition-colors",
                collapsed.sidebar ? "text-slate-400 hover:text-slate-600" : "bg-custom-blue text-white shadow-sm"
              )}
            >
              {collapsed.sidebar ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <button
              onClick={() => togglePanel('editor')}
              title={collapsed.editor ? 'Show clauses panel' : 'Hide clauses panel'}
              className={cn(
                "p-1.5 rounded-full transition-colors",
                collapsed.editor ? "text-slate-400 hover:text-slate-600" : "bg-custom-blue text-white shadow-sm"
              )}
            >
              <Columns2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => togglePanel('preview')}
              title={collapsed.preview ? 'Show preview panel' : 'Hide preview panel'}
              className={cn(
                "p-1.5 rounded-full transition-colors",
                collapsed.preview ? "text-slate-400 hover:text-slate-600" : "bg-custom-blue text-white shadow-sm"
              )}
            >
              {collapsed.preview ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="hidden lg:flex items-center bg-slate-50 dark:bg-slate-900 p-1 rounded-full border border-slate-200 dark:border-slate-800/80 shadow-sm gap-1">
          <Link href="/dashboard/employment-contracts" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-white dark:hover:bg-slate-800 rounded-full transition-all">Contracts</Link>
          <Link href="/dashboard/employment-contracts/job-profiles" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-white dark:hover:bg-slate-800 rounded-full transition-all"><Briefcase className="w-3.5 h-3.5" /> Job Profiles</Link>
        </div>
      </div>

      <PanelGroup direction="horizontal" className="flex-1 min-h-0 w-full">
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
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <List className="w-4 h-4 text-custom-blue" />
                Sections
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">21 standard contract sections</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {grouped.map(({ section, items }) => (
                  <button
                    key={section.key}
                    onClick={() => { setSelectedSectionKey(section.key); setSelectedClause(null); }}
                    className={cn(
                      "flex items-center w-full p-2.5 text-sm rounded-md transition-colors",
                      selectedSectionKey === section.key
                        ? "bg-custom-blue text-white font-medium shadow-sm"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    <BookText className="w-4 h-4 mr-2 shrink-0" />
                    <span className="truncate flex-1 text-left">{section.title}</span>
                    <Badge variant="outline" className="text-[10px] font-semibold rounded-full px-1.5 py-0 ml-1 tabular-nums">
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
          defaultSize={38}
          minSize={28}
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
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <BookText className="w-5 h-5 text-custom-blue" />
                    {CONTRACT_SECTIONS.find(s => s.key === selectedSectionKey)?.title || 'Select a section'}
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">Reusable wording — authored once, reused by every Job Profile</p>
                </div>
                <Button size="sm" className="h-9 text-sm" onClick={() => openNew()}>
                  <PlusCircle className="h-4 w-4 mr-1.5" /> New Clause
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-5">
              {isLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : sectionClauses.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed rounded-2xl border-slate-200 dark:border-slate-800">
                  <BookText className="h-12 w-12 text-slate-300 mb-3" />
                  <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">No clauses for this section</h3>
                  <p className="text-sm text-slate-500 mt-1">Add a clause to get started.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {sectionEntries.map((entry) =>
                    entry.kind === 'single' ? (
                      <ClauseCard
                        key={entry.clause.id}
                        clause={entry.clause}
                        companies={companies}
                        selected={selectedClause?.id === entry.clause.id}
                        onSelect={() => setSelectedClause(entry.clause)}
                        onEdit={() => { openEdit(entry.clause); setSelectedClause(entry.clause); }}
                        onDelete={() => setDeletingId(entry.clause.id)}
                      />
                    ) : (
                      <div key={entry.key} className="xl:col-span-2 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-3 bg-slate-100/60 dark:bg-slate-900/40">
                        <div className="flex items-center gap-2 px-1.5 pb-2">
                          <Layers className="h-4 w-4 text-custom-blue" />
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{entry.key}</p>
                          <Badge variant="outline" className="text-xs font-semibold rounded-full px-2 py-0 tabular-nums">
                            {entry.clauses.length} variant{entry.clauses.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {entry.clauses.map((clause) => (
                            <ClauseCard
                              key={clause.id}
                              clause={clause}
                              companies={companies}
                              selected={selectedClause?.id === clause.id}
                              onSelect={() => setSelectedClause(clause)}
                              onEdit={() => { openEdit(clause); setSelectedClause(clause); }}
                              onDelete={() => setDeletingId(clause.id)}
                              compact
                            />
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </ScrollArea>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* RIGHT PANEL: Clause content preview */}
        <Panel
          ref={previewPanelRef}
          defaultSize={44}
          minSize={30}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, preview: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, preview: false }))}
          className="bg-slate-100 dark:bg-slate-900 flex flex-col z-10 border-l border-slate-200 dark:border-slate-800 !overflow-auto"
        >
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-custom-blue" />
                Clause Preview
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Select a clause to preview its content</p>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {selectedClause ? (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      {selectedClause.is_default && <Star className="h-4 w-4 text-amber-500 shrink-0" fill="currentColor" />}
                      <p className="text-base font-bold text-slate-800 dark:text-slate-100">{selectedClause.label}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-slate-500">Key:</span> <span className="font-mono text-slate-700 dark:text-slate-200">{selectedClause.clause_key}</span></div>
                      <div><span className="text-slate-500">Scope:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedClause.company_id ? 'Company' : 'Global'}</span></div>
                      {selectedClause.variant_group && (
                        <div className="col-span-2"><span className="text-slate-500">Group:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedClause.variant_group}</span></div>
                      )}
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

                  {selectedClause.variant_group && (
                    <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                      <p className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-custom-blue" /> Other variants in &ldquo;{selectedClause.variant_group}&rdquo;
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {clauses
                          .filter((c) => c.section_key === selectedClause.section_key && c.variant_group === selectedClause.variant_group)
                          .map((c) => (
                            <button
                              key={c.id}
                              onClick={() => setSelectedClause(c)}
                              className={cn(
                                "text-sm rounded-full px-3 py-1 border transition-colors",
                                c.id === selectedClause.id
                                  ? "bg-custom-blue text-white border-custom-blue font-medium"
                                  : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              )}
                            >
                              {c.label}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">Content</p>
                    <div
                      className="prose prose-sm max-w-none text-slate-700 dark:text-slate-200 [&_strong]:text-slate-800 [&_strong]:dark:text-slate-100"
                      dangerouslySetInnerHTML={{ __html: selectedClause.content }}
                    />
                  </div>

                  <PlaceholderSources highlightKeys={highlightPlaceholderKeys} filterByKeys={highlightPlaceholderKeys} refreshKey={placeholderRefreshKey} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <FileText className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="text-sm text-slate-500">Select a clause to preview its rendered content</p>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>

      {/* Clause Editor Dialog */}
      <ClauseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        draft={draft}
        onDraftChange={setDraft}
        editingId={editingId}
        saving={saving}
        onSave={handleSave}
        condition={condition}
        onConditionChange={setCondition}
        companies={companies}
        groupNamesForSection={groupNamesForSection}
        clauses={clauses}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent className="rounded-2xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-slate-800">Delete this clause?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-500">
              Job Profiles referencing this clause will fall back to the section's default clause. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="h-9 px-4 rounded-full text-sm font-semibold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deletingId) handleDelete(deletingId); setDeletingId(null); }}
              className="h-9 px-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold shadow-md shadow-red-500/10 border-0"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}