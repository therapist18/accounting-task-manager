'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, PlusCircle, Settings2, Trash2, Pencil, List, LayoutGrid, Database, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTemplateData } from '../../templates/document-template-manager/hooks/useTemplateData';
import { PlaceholderFormDialog } from '../../templates/document-template-manager/components/PlaceholderFormDialog';
import type { Placeholder } from '../../templates/document-template-manager/types';
import { fetchBiodataTemplate, updateBiodataPlaceholders, type BiodataTemplate } from '../utils/biodataConfig';
import { BIODATA_SECTIONS, type BiodataSection } from '../utils/biodataStructure';

const emptyPlaceholder = (sectionKey: string): Placeholder => ({
  id: crypto.randomUUID(),
  name: '',
  type: 'text',
  required: false,
  entity_type: ['individual'],
  master_field_ids: [],
  linked_job_question_ids: [],
  linked_requirement_ids: [],
  default_value: '',
  section_key: sectionKey,
});

function PlaceholderCard({
  placeholder, masterFieldLabel, onEdit, onDelete,
}: {
  placeholder: Placeholder;
  masterFieldLabel: string | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onEdit}
      className="cursor-pointer border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-4 hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
            {placeholder.display_value || placeholder.name || 'Untitled'}
          </p>
          <p className="text-xs font-mono text-slate-400 truncate">{'{{' + (placeholder.name || '') + '}}'}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        <Badge variant="outline" className="text-[10px] font-medium bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 capitalize">
          {placeholder.type}
        </Badge>
        {masterFieldLabel ? (
          <Badge variant="outline" className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1">
            <Database className="h-3 w-3" /> {masterFieldLabel}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] font-medium bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800">
            Not linked
          </Badge>
        )}
      </div>
    </div>
  );
}

export default function MatrimonialBiodataSettingsPage() {
  const { masterFields } = useTemplateData(true, null);
  const { toast } = useToast();
  const [template, setTemplate] = useState<BiodataTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSectionKey, setSelectedSectionKey] = useState<string>(BIODATA_SECTIONS[0].key);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlaceholder, setEditingPlaceholder] = useState<Placeholder | null>(null);
  const [deletingPlaceholder, setDeletingPlaceholder] = useState<Placeholder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const tmpl = await fetchBiodataTemplate();
    setTemplate(tmpl);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const masterFieldMap = useMemo(() => new Map(masterFields.map((f) => [f.id, f.label])), [masterFields]);

  const grouped = useMemo(() => {
    const placeholders = template?.placeholders || [];
    const map = new Map<string, Placeholder[]>();
    for (const p of placeholders) {
      const key = p.section_key || BIODATA_SECTIONS[0].key;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return BIODATA_SECTIONS.map((section) => ({ section, items: map.get(section.key) || [] }));
  }, [template]);

  const sectionPlaceholders = useMemo(
    () => grouped.find((g) => g.section.key === selectedSectionKey)?.items || [],
    [grouped, selectedSectionKey]
  );

  const openNew = () => {
    setEditingPlaceholder(emptyPlaceholder(selectedSectionKey));
    setDialogOpen(true);
  };

  const openEdit = (placeholder: Placeholder) => {
    setEditingPlaceholder(placeholder);
    setDialogOpen(true);
  };

  const handleSave = async (placeholder: Placeholder) => {
    if (!template) return;
    if (!placeholder.name?.trim()) {
      toast({ title: 'Missing field name', description: 'Give this placeholder a name (its {{token}}).', variant: 'destructive' });
      return;
    }
    const existingIndex = template.placeholders.findIndex((p) => p.id === placeholder.id);
    const nextPlaceholders = [...template.placeholders];
    if (existingIndex >= 0) nextPlaceholders[existingIndex] = placeholder;
    else nextPlaceholders.push(placeholder);

    const updated = await updateBiodataPlaceholders(template.id, nextPlaceholders);
    if (updated) {
      setTemplate(updated);
      setDialogOpen(false);
      setEditingPlaceholder(null);
      toast({ title: existingIndex >= 0 ? 'Placeholder updated' : 'Placeholder created' });
    } else {
      toast({ title: 'Error', description: 'Failed to save placeholder', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!template || !deletingPlaceholder) return;
    const nextPlaceholders = template.placeholders.filter((p) => p.id !== deletingPlaceholder.id);
    const updated = await updateBiodataPlaceholders(template.id, nextPlaceholders);
    if (updated) {
      setTemplate(updated);
      toast({ title: 'Placeholder deleted' });
    } else {
      toast({ title: 'Error', description: 'Failed to delete placeholder', variant: 'destructive' });
    }
    setDeletingPlaceholder(null);
  };

  return (
    <div className="h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <Settings2 className="w-5 h-5 text-custom-blue" />
        <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">Matrimonial Biodata Settings</h1>
        <p className="hidden md:block text-sm text-slate-400 ml-2">Maintain data-source placeholders within each biodata section.</p>
      </div>

      <PanelGroup direction="horizontal" className="flex-1 min-h-0 w-full">
        {/* LEFT PANEL: Sections list */}
        <Panel defaultSize={22} minSize={16} maxSize={32} className="bg-white dark:bg-slate-900 flex flex-col z-10 overflow-auto">
          <div className="flex flex-col h-full border-r border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <List className="w-4 h-4 text-custom-blue" />
                Sections
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{BIODATA_SECTIONS.length} maintained sections</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {grouped.map(({ section, items }) => (
                  <button
                    key={section.key}
                    onClick={() => setSelectedSectionKey(section.key)}
                    className={cn(
                      "flex items-center w-full p-2.5 text-sm rounded-md transition-colors",
                      selectedSectionKey === section.key
                        ? "bg-custom-blue text-white font-medium shadow-sm"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    <LayoutGrid className="w-4 h-4 mr-2 shrink-0" />
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

        {/* MAIN PANEL: Placeholder cards for selected section */}
        <Panel minSize={40} className="bg-slate-50 dark:bg-slate-950 flex flex-col z-10 !overflow-auto">
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-custom-blue" />
                    {BIODATA_SECTIONS.find((s) => s.key === selectedSectionKey)?.title}
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {grouped.find((g) => g.section.key === selectedSectionKey)?.section.layout === 'grid'
                      ? 'Renders as dynamic rows in both print themes - any placeholder added here appears automatically.'
                      : 'Rendered by its well-known token in the print themes; new placeholders here surface in the editor, not the printed layout.'}
                  </p>
                </div>
                <Button size="sm" className="h-9 text-sm" onClick={openNew} disabled={!template}>
                  <PlusCircle className="h-4 w-4 mr-1.5" /> New Placeholder
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-5">
              {loading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : sectionPlaceholders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed rounded-2xl border-slate-200 dark:border-slate-800">
                  <FileText className="h-12 w-12 text-slate-300 mb-3" />
                  <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">No placeholders for this section</h3>
                  <p className="text-sm text-slate-500 mt-1">Add one to get started.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {sectionPlaceholders.map((p) => (
                    <PlaceholderCard
                      key={p.id}
                      placeholder={p}
                      masterFieldLabel={(p.master_field_ids || []).map((id) => masterFieldMap.get(id)).filter(Boolean).join(', ') || null}
                      onEdit={() => openEdit(p)}
                      onDelete={() => setDeletingPlaceholder(p)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </Panel>
      </PanelGroup>

      {editingPlaceholder && (
        <PlaceholderFormDialog
          isOpen={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditingPlaceholder(null); }}
          placeholder={editingPlaceholder}
          masterFields={masterFields}
          jobQuestions={[]}
          requirements={[]}
          kycDocuments={[]}
          documentTypes={[]}
          tables={[]}
          loadingTables={false}
          onSave={handleSave}
          onChange={(updates) => setEditingPlaceholder((prev) => (prev ? { ...prev, ...updates } : prev))}
          isEditing={!!template?.placeholders.some((p) => p.id === editingPlaceholder.id)}
          hiddenSections={{ jobQuestions: true, requirements: true }}
        />
      )}

      <AlertDialog open={!!deletingPlaceholder} onOpenChange={(open) => !open && setDeletingPlaceholder(null)}>
        <AlertDialogContent className="rounded-2xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-slate-800">Delete this placeholder?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-500">
              Deletes <span className="font-mono">{'{{' + (deletingPlaceholder?.name || '') + '}}'}</span> from the registry.
              Any resolved or overridden value for it will stop showing on the editor and print themes. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="h-9 px-4 rounded-full text-sm font-semibold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
