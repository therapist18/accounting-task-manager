'use client';

// Shared placeholder registry browser for every module that reuses
// ec_placeholders (Employment Contracts' own full page, its Clause Library
// scoped view, and Consultancy Contracts' template page). The module using it
// passes data/behavior in via props:
//   - filterByKeys   - narrow to the tokens a clause/template actually uses
//   - clausesEnabled - EC computes a "Clause Usage" column from ec_clauses;
//                      Consultancy has no clause library, so it passes false
//   - allowedSourceKinds - EC exposes all four source kinds; Consultancy rows
//                      are company-scoped, so it restricts to master_field
//   - deletableGroup - Consultancy only lets CC-owned rows (group_label
//                      'Consultancy Contract') be deleted from its screen
//   - typeScans - raw template/clause content to classify each token's type
//                 with DTM's own detection ({{%token}} image, {{#token}}
//                 array, {{#condition_token}} conditional, else text); EC
//                 scans its fetched clauses, Consultancy passes [content]
//   - toolbar/title/emptyMessage - per-module header actions and copy

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Sliders, FileStack, Pencil, Trash2, Database, Search, ArrowUpDown, ArrowUp, ArrowDown, Shuffle, ListOrdered, ClipboardList } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { EcPlaceholder, PlaceholderSourceKind, fetchPlaceholders, updatePlaceholderDetails, deletePlaceholder } from '../utils/ecPlaceholders';
import { MasterFieldOption, fetchMasterFieldOptions, detectTokens } from '../utils/placeholderDetection';
import { EcClause, fetchClauses } from '../utils/clauseLibraryData';
import { ecPlaceholderToDtmPlaceholder, dtmPlaceholderToEcUpdates, getPlaceholderSourceText } from '../utils/ecPlaceholderAdapter';
import { PlaceholderFormDialog } from '../../templates/document-template-manager/components/PlaceholderFormDialog';
import { useTemplateData } from '../../templates/document-template-manager/hooks/useTemplateData';
import { detectPlaceholderTags, type DetectedPlaceholderTagType } from '../../templates/document-template-manager/utils';
import { useTableData } from '@/lib/tableUtils';
import { ENTITY_TYPES } from '@/lib/constants/entity-types';
import type { Placeholder } from '../../templates/document-template-manager/types';

interface PlaceholderSourcesProps {
  highlightKeys?: string[];
  filterByKeys?: string[];
  refreshKey?: number;
  fillHeight?: boolean;
  // Optional right-side header actions (e.g. Consultancy's "Sync from
  // template" button) - the parent owns the sync/refresh logic.
  toolbar?: ReactNode;
  // Header title. Default 'Placeholders Used'.
  title?: string;
  // EC-only "Clause Usage" column + clause-referenced delete warnings. Any
  // module without a clause library passes false to hide both.
  clausesEnabled?: boolean;
  // Which source kinds the inline Source select offers. EC = all four;
  // Consultancy (company-scoped resolution) = ['master_field']. When only one
  // kind is allowed the select collapses into a static badge.
  allowedSourceKinds?: PlaceholderSourceKind[];
  // When set, only rows whose group_label matches can be deleted from this
  // screen - shared rows are left to their owning module.
  deletableGroup?: string;
  // Empty-state text for the "no tokens to filter by" branch.
  emptyMessage?: ReactNode;
  // Raw content strings to classify each token's type with (see header note).
  typeScans?: string[];
}

type SortColumn = '#' | 'token' | 'group' | 'type' | 'source' | 'entity' | 'linked' | 'clauses' | 'default';
type SortDir = 'asc' | 'desc';

const ALL_SOURCE_KINDS: PlaceholderSourceKind[] = ['master_field', 'settings_cascade', 'job_profile', 'offer'];

const SOURCE_KIND_OPTIONS: { value: PlaceholderSourceKind; label: string; icon: ReactNode }[] = [
  { value: 'master_field', label: 'Master field', icon: <Database className="w-3 h-3 inline mr-1.5" /> },
  { value: 'settings_cascade', label: 'Settings cascade', icon: <Sliders className="w-3 h-3 inline mr-1.5" /> },
  { value: 'job_profile', label: 'Job profile field', icon: <ClipboardList className="w-3 h-3 inline mr-1.5" /> },
  { value: 'offer', label: 'Offer field', icon: <FileStack className="w-3 h-3 inline mr-1.5" /> },
];

const SOURCE_KIND_LABELS: Record<PlaceholderSourceKind, string> = Object.fromEntries(
  SOURCE_KIND_OPTIONS.map((o) => [o.value, o.label])
) as Record<PlaceholderSourceKind, string>;

// Types DTM's detectPlaceholderTags infers from the {{prefix}} in content.
const TYPE_LABELS: Record<DetectedPlaceholderTagType, string> = {
  text: 'Text',
  image: 'Image',
  array: 'Array',
  conditional: 'Conditional',
};

const EC_HIDDEN_SECTIONS = {
  uiVisibility: true,
  aiRefinement: true,
  jobQuestions: true,
  requirements: true,
};

const entityTypeLabel = (type: string) => ENTITY_TYPES.find((t) => t.value === type)?.label || type;
const strategyLabel = (s: string) => s === 'merge' ? 'Merge' : 'Fallback';
const StrategyIcon = ({ strategy }: { strategy: string }) =>
  strategy === 'merge' ? <Shuffle className="w-3 h-3" /> : <ListOrdered className="w-3 h-3" />;

export function PlaceholderSources({
  highlightKeys, filterByKeys, refreshKey = 0, fillHeight = false,
  toolbar, title = 'Placeholders Used', clausesEnabled = true,
  allowedSourceKinds = ALL_SOURCE_KINDS, deletableGroup, emptyMessage, typeScans,
}: PlaceholderSourcesProps) {
  const [placeholders, setPlaceholders] = useState<EcPlaceholder[]>([]);
  const [masterFields, setMasterFields] = useState<MasterFieldOption[]>([]);
  const [clauses, setClauses] = useState<EcClause[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [sortColumn, setSortColumn] = useState<SortColumn>('#');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [editingEc, setEditingEc] = useState<EcPlaceholder | null>(null);
  const [draft, setDraft] = useState<Placeholder | null>(null);
  const { masterFields: dtmMasterFields, jobQuestions, requirements, kycDocuments, documentTypes } = useTemplateData(!!editingEc, null);
  const { tables, loadingTables } = useTableData();
  const [changingKindId, setChangingKindId] = useState<string | null>(null);
  const [deletingP, setDeletingP] = useState<EcPlaceholder | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const [fields, ecPlaceholders, ecClauses] = await Promise.all([
        fetchMasterFieldOptions(),
        fetchPlaceholders(),
        clausesEnabled ? fetchClauses() : Promise.resolve([]),
      ]);
      setMasterFields(fields);
      setPlaceholders(ecPlaceholders);
      setClauses(ecClauses);
      setIsLoading(false);
    })();
  }, [refreshKey, clausesEnabled]);

  // Which clauses actually reference each placeholder's {{token}} - scanned
  // from real clause content (detectTokens), not from any stored link, since
  // nothing records that relationship anywhere else. A placeholder can be
  // configured with a source and still be referenced by zero clauses (dead/
  // orphaned) or by several (shared across sections).
  const clauseUsage = useMemo(() => {
    const map = new Map<string, EcClause[]>();
    for (const clause of clauses) {
      for (const token of detectTokens(clause.content)) {
        if (!map.has(token)) map.set(token, []);
        map.get(token)!.push(clause);
      }
    }
    return map;
  }, [clauses]);

  // Per-token type inferred by DTM's own tag detection (see detectPlaceholderTags).
  // Scans the explicit typeScans content (e.g. Consultancy's live template) plus
  // every fetched clause - first tag seen for a key wins, mirroring DTM's
  // processedTags dedupe, so a placeholder used as {{%logo}} shows "Image".
  const detectedTypes = useMemo(() => {
    const map = new Map<string, DetectedPlaceholderTagType>();
    const scan = (text: string) => {
      for (const tag of detectPlaceholderTags(text, 2)) {
        if (!map.has(tag.key)) map.set(tag.key, tag.type);
      }
    };
    if (typeScans) typeScans.forEach(scan);
    if (clausesEnabled) clauses.forEach((c) => scan(c.content));
    return map;
  }, [typeScans, clauses, clausesEnabled]);

  // tm_job_fields ids arrive as numbers, while ec_placeholders stores
  // master_field_id as a number but master_field_links[].master_field_id as a
  // string - normalize every lookup to String() so all linked fields resolve.
  const masterFieldMap = useMemo(() => new Map(masterFields.map((f) => [String(f.id), f.label])), [masterFields]);

  const toggleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="w-3 h-3 ml-1 text-slate-300" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1 text-custom-blue" />
      : <ArrowDown className="w-3 h-3 ml-1 text-custom-blue" />;
  };

  const getLinkedLabels = (p: EcPlaceholder) => {
    if (p.source_kind !== 'master_field') return [];
    const ids: Array<{ label: string; priority: number; strategy: string }> = [];
    if (p.master_field_links && p.master_field_links.length > 0) {
      for (const link of p.master_field_links.sort((a, b) => a.display_priority - b.display_priority)) {
        const label = masterFieldMap.get(String(link.master_field_id));
        if (label) ids.push({ label, priority: link.display_priority, strategy: link.strategy || 'fallback' });
      }
    } else if (p.master_field_id) {
      const label = masterFieldMap.get(String(p.master_field_id));
      if (label) ids.push({ label, priority: 1, strategy: 'fallback' });
    }
    return ids;
  };

  const getEntityLabels = (p: EcPlaceholder): string[] =>
    (p.entity_type || []).map((t) => entityTypeLabel(t));

  const sortedPlaceholders = useMemo(() => {
    let list = search
      ? placeholders.filter((p) => {
          const q = search.toLowerCase();
          const linkedLabels = getLinkedLabels(p);
          const entityLabels = getEntityLabels(p);
          const typeLabel = TYPE_LABELS[detectedTypes.get(p.key) as DetectedPlaceholderTagType] || '';
          return (
            p.key.toLowerCase().includes(q) ||
            p.label.toLowerCase().includes(q) ||
            p.group_label.toLowerCase().includes(q) ||
            typeLabel.toLowerCase().includes(q) ||
            linkedLabels.some((l) => l.label.toLowerCase().includes(q)) ||
            entityLabels.some((l) => l.toLowerCase().includes(q))
          );
        })
      : [...placeholders];

    // Filter by keys when filterByKeys is provided - an empty array is a
    // real filter (the selected clause has zero detected tokens), not "no
    // filter", so it must still narrow the list down to nothing.
    if (filterByKeys) {
      list = list.filter((p) => filterByKeys.includes(p.key));
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case '#':
          cmp = 0;
          break;
        case 'token':
          cmp = a.key.localeCompare(b.key);
          break;
        case 'group':
          cmp = a.group_label.localeCompare(b.group_label);
          break;
        case 'type':
          cmp = (TYPE_LABELS[detectedTypes.get(a.key) as DetectedPlaceholderTagType] || '').localeCompare(
            TYPE_LABELS[detectedTypes.get(b.key) as DetectedPlaceholderTagType] || ''
          );
          break;
        case 'source':
          cmp = a.source_kind.localeCompare(b.source_kind);
          break;
        case 'entity':
          cmp = getEntityLabels(a).join(', ').localeCompare(getEntityLabels(b).join(', '));
          break;
        case 'linked':
          cmp = getLinkedLabels(a).map((l) => l.label).join(', ').localeCompare(getLinkedLabels(b).map((l) => l.label).join(', '));
          break;
        case 'clauses':
          cmp = (clauseUsage.get(a.key)?.length || 0) - (clauseUsage.get(b.key)?.length || 0);
          break;
        case 'default':
          cmp = (a.default_value || '').localeCompare(b.default_value || '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [placeholders, search, masterFieldMap, sortColumn, sortDir, filterByKeys, clauseUsage, detectedTypes]);

  const openEdit = (placeholder: EcPlaceholder) => {
    setEditingEc(placeholder);
    setDraft(ecPlaceholderToDtmPlaceholder(placeholder));
  };

  const closeEdit = () => {
    setEditingEc(null);
    setDraft(null);
  };

  const handleSaveEdit = async (updated: Placeholder) => {
    if (!editingEc) return;
    const ecUpdates = dtmPlaceholderToEcUpdates(updated, editingEc);

    // Guard against two 'offer' placeholders pointing at the same offer_field -
    // standardPlaceholders.ts's generic resolver reads that column literally
    // (offer[offer_field]), so a collision means both read the exact same
    // EmploymentOffer field. NOT applied to settings_key: that column is just
    // an admin-facing description of where a settings_cascade/job_profile
    // placeholder's value comes from (e.g. "Job Profile Settings"), expected
    // to repeat across many placeholders that share a source - resolution is
    // keyed off each placeholder's own `key` instead (see
    // standardPlaceholders.ts), so settings_key duplicates are harmless.
    if (editingEc.source_kind === 'offer' && ecUpdates.offer_field) {
      const conflict = placeholders.find((p) =>
        p.id !== editingEc.id && p.source_kind === 'offer' && p.offer_field === ecUpdates.offer_field
      );
      if (conflict) {
        toast({
          title: 'Offer field already in use',
          description: `"${ecUpdates.offer_field}" is already the source for "${conflict.label}" (${conflict.key}). Two placeholders sharing an offer field will always show the same value - pick a different one.`,
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      const persisted = await updatePlaceholderDetails(editingEc.id, ecUpdates);
      if (persisted) {
        setPlaceholders((prev) => prev.map((p) => (p.id === persisted.id ? persisted : p)));
        toast({ title: 'Placeholder updated' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save placeholder', variant: 'destructive' });
    } finally {
      closeEdit();
    }
  };

  // Quick inline kind switch, right in the Source column - the actual
  // settings_key/offer_field text is edited via the Source field in the main
  // add/edit dialog (openEdit above), not here. Switching away from
  // 'master_field' clears its links rather than leaving stale ones that
  // would silently keep winning inside resolveEcPlaceholderValues.
  const handleChangeSourceKind = async (placeholder: EcPlaceholder, nextKind: PlaceholderSourceKind) => {
    if (nextKind === placeholder.source_kind) return;
    if (!allowedSourceKinds.includes(nextKind)) return;
    setChangingKindId(placeholder.id);
    try {
      // Auto-default settings_key/offer_field to the placeholder's own key
      // when switching into a kind that needs one and it's still empty -
      // matches the seed data's own convention (settings_key === the token
      // key for virtually every row) and avoids a silent resolution gap:
      // without this, switching kind here alone leaves the underlying
      // column null, so standardPlaceholders.ts's generic resolver reads
      // effectiveSettings[undefined]/offer[undefined] and always renders
      // blank until someone separately opens the Edit dialog to type it in.
      const needsSettingsKey = (nextKind === 'settings_cascade' || nextKind === 'job_profile') && !placeholder.settings_key;
      const needsOfferField = nextKind === 'offer' && !placeholder.offer_field;

      const persisted = await updatePlaceholderDetails(placeholder.id, {
        source_kind: nextKind,
        ...(nextKind !== 'master_field' ? { master_field_id: null, master_field_links: [] } : {}),
        ...(needsSettingsKey ? { settings_key: placeholder.key } : {}),
        ...(needsOfferField ? { offer_field: placeholder.key } : {}),
      });
      if (persisted) {
        setPlaceholders((prev) => prev.map((p) => (p.id === persisted.id ? persisted : p)));
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to change source kind', variant: 'destructive' });
    } finally {
      setChangingKindId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingP) return;
    setDeleting(true);
    const ok = await deletePlaceholder(deletingP.id);
    setDeleting(false);
    if (ok) {
      setPlaceholders((prev) => prev.filter((p) => p.id !== deletingP.id));
      toast({ title: 'Placeholder deleted' });
    } else {
      toast({ title: 'Error', description: 'Failed to delete placeholder', variant: 'destructive' });
    }
    setDeletingP(null);
  };

  return (
    <div ref={sectionRef} className={cn("bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800", fillHeight ? "h-full flex flex-col overflow-hidden p-4" : "p-4")}>
      <div className="flex items-center justify-between mb-3 shrink-0">
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{title}</p>
        <div className="flex items-center gap-2 shrink-0">
          {toolbar}
          <p className="text-xs text-slate-400">
            {filterByKeys
              ? `${sortedPlaceholders.length} / ${placeholders.length} total`
              : `${placeholders.length} total`}
          </p>
        </div>
      </div>

      <div className="relative mb-3 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search placeholders..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={placeholders.length === 0}
          className="pl-9 h-9 rounded-full text-sm"
        />
      </div>

      {isLoading ? (
        <div className={cn("flex justify-center items-center", fillHeight ? "flex-1" : "py-8")}>
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : sortedPlaceholders.length === 0 ? (
        <p className={cn("text-sm text-slate-500 text-center", fillHeight ? "flex-1 flex items-center justify-center" : "py-6")}>
          {filterByKeys && filterByKeys.length === 0
            ? (emptyMessage ?? 'No placeholders specified for this item.')
            : placeholders.length === 0
            ? 'No placeholders detected yet.'
            : 'No placeholders match your search.'}
        </p>
      ) : (
        <div className={cn("rounded-lg border border-slate-200 dark:border-slate-800", fillHeight ? "flex-1 min-h-0 overflow-auto" : "overflow-auto max-h-[560px]")}>
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-900">
              <TableRow>
                <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700 px-2 py-2 w-10">
                  <button onClick={() => toggleSort('#')} className="flex items-center gap-0">
                    # <SortIcon col="#" />
                  </button>
                </TableHead>
                <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700 px-2 py-2">
                  <button onClick={() => toggleSort('token')} className="flex items-center gap-0">
                    Token <SortIcon col="token" />
                  </button>
                </TableHead>
                <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700 px-2 py-2">
                  <button onClick={() => toggleSort('group')} className="flex items-center gap-0">
                    Group <SortIcon col="group" />
                  </button>
                </TableHead>
                <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700 px-2 py-2">
                  <button onClick={() => toggleSort('type')} className="flex items-center gap-0">
                    Type <SortIcon col="type" />
                  </button>
                </TableHead>
                <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700 px-2 py-2">
                  <button onClick={() => toggleSort('source')} className="flex items-center gap-0">
                    Source <SortIcon col="source" />
                  </button>
                </TableHead>
                <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700 px-2 py-2">
                  <button onClick={() => toggleSort('entity')} className="flex items-center gap-0">
                    Entity Type <SortIcon col="entity" />
                  </button>
                </TableHead>
                <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700 px-2 py-2">
                  <button onClick={() => toggleSort('linked')} className="flex items-center gap-0">
                    Linked Master Field <SortIcon col="linked" />
                  </button>
                </TableHead>
                <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700 px-2 py-2">
                  <button onClick={() => toggleSort('default')} className="flex items-center gap-0">
                    Default Value <SortIcon col="default" />
                  </button>
                </TableHead>
                {clausesEnabled && (
                  <TableHead className="font-bold text-slate-600 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700 px-2 py-2">
                    <button onClick={() => toggleSort('clauses')} className="flex items-center gap-0">
                      Clause Usage <SortIcon col="clauses" />
                    </button>
                  </TableHead>
                )}
                <TableHead className="text-right font-bold text-slate-600 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700 px-2 py-2">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPlaceholders.map((p, idx) => {
                const linkedLabels = getLinkedLabels(p);
                const entityLabels = getEntityLabels(p);
                const usedByClauses = clauseUsage.get(p.key) || [];
                return (
                <TableRow
                  key={p.id}
                  className={cn(highlightKeys?.includes(p.key) && "bg-amber-50/60 dark:bg-amber-900/10")}
                >
                  <TableCell className="border border-slate-200 dark:border-slate-700 px-2 py-2 text-xs text-slate-400 text-center">{idx + 1}</TableCell>
                  <TableCell className="border border-slate-200 dark:border-slate-700 px-2 py-2">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{p.label}</p>
                    <p className="text-xs font-mono text-slate-400">{'{{' + p.key + '}}'}</p>
                  </TableCell>
                  <TableCell className="border border-slate-200 dark:border-slate-700 px-2 py-2">
                    <Badge variant="secondary" className="text-[10px]">{p.group_label}</Badge>
                  </TableCell>
                  <TableCell className="border border-slate-200 dark:border-slate-700 px-2 py-2">
                    {(() => {
                      const t = detectedTypes.get(p.key);
                      if (!t) return <span className="text-xs text-slate-300">—</span>;
                      const styles: Record<DetectedPlaceholderTagType, string> = {
                        text: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
                        image: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800',
                        array: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800',
                        conditional: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800',
                      };
                      return (
                        <Badge variant="outline" className={`text-[10px] font-medium ${styles[t]}`}>
                          {TYPE_LABELS[t]}
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="border border-slate-200 dark:border-slate-700 px-2 py-2">
                    {allowedSourceKinds.length <= 1 ? (
                      <Badge variant="outline" className="text-[10px] font-medium bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                        {SOURCE_KIND_LABELS[p.source_kind] || p.source_kind}
                      </Badge>
                    ) : (
                      <Select
                        value={p.source_kind}
                        onValueChange={(v) => handleChangeSourceKind(p, v as PlaceholderSourceKind)}
                        disabled={changingKindId === p.id}
                      >
                        <SelectTrigger className={cn(
                          "h-7 text-xs font-medium rounded-full border px-2.5 gap-1.5 w-auto",
                          p.source_kind === 'master_field' && "bg-slate-50 text-slate-600 border-slate-200",
                          p.source_kind === 'settings_cascade' && "bg-blue-50 text-blue-700 border-blue-200",
                          p.source_kind === 'job_profile' && "bg-emerald-50 text-emerald-700 border-emerald-200",
                          p.source_kind === 'offer' && "bg-purple-50 text-purple-700 border-purple-200",
                        )}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedSourceKinds.map((kind) => {
                            const option = SOURCE_KIND_OPTIONS.find((o) => o.value === kind)!;
                            return (
                              <SelectItem key={kind} value={kind}>{option.icon}{option.label}</SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}
                    <p className="text-[10px] font-mono text-slate-400 mt-1">
                      {getPlaceholderSourceText(p) || <span className="italic text-red-400">not set - edit to set</span>}
                    </p>
                  </TableCell>
                  <TableCell className="border border-slate-200 dark:border-slate-700 px-2 py-2">
                    {entityLabels.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {entityLabels.map((label) => (
                          <Badge key={label} variant="secondary" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </TableCell>
                  <TableCell className="border border-slate-200 dark:border-slate-700 px-2 py-2">
                    {p.source_kind === 'master_field' ? (
                      linkedLabels.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {linkedLabels.map((item, li) => (
                            <Badge key={item.label} variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1">
                              <StrategyIcon strategy={item.strategy} />
                              <span>{item.label}</span>
                              {linkedLabels.length > 1 && (
                                <span className="text-[10px] text-emerald-400 font-bold">#{item.priority}</span>
                              )}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-red-500 italic">Not linked</span>
                      )
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </TableCell>
                  <TableCell className="border border-slate-200 dark:border-slate-700 px-2 py-2">
                    <span className="text-xs text-slate-500">{p.default_value || '—'}</span>
                  </TableCell>
                  {clausesEnabled && (
                    <TableCell className="border border-slate-200 dark:border-slate-700 px-2 py-2">
                      {usedByClauses.length > 0 ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200"
                          title={usedByClauses.map((c) => c.label).join(', ')}
                        >
                          Linked · {usedByClauses.length} clause{usedByClauses.length === 1 ? '' : 's'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                          Not linked
                        </Badge>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-right border border-slate-200 dark:border-slate-700 px-2 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-custom-blue"
                      onClick={() => openEdit(p)}
                      title="Edit placeholder"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {deletableGroup && p.group_label !== deletableGroup ? (
                      <span className="text-[10px] text-slate-300" title="Shared with another module - delete it from its owning module instead">—</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-red-600"
                        onClick={() => setDeletingP(p)}
                        title="Delete placeholder"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {draft && (
        <PlaceholderFormDialog
          isOpen={!!editingEc}
          onClose={closeEdit}
          placeholder={draft}
          masterFields={dtmMasterFields}
          jobQuestions={jobQuestions}
          requirements={requirements}
          kycDocuments={kycDocuments}
          documentTypes={documentTypes}
          tables={tables}
          loadingTables={loadingTables}
          onSave={handleSaveEdit}
          onChange={(updates) => setDraft((prev) => (prev ? { ...prev, ...updates } : prev))}
          isEditing
          hiddenSections={EC_HIDDEN_SECTIONS}
          showSourceField
        />
      )}

      <AlertDialog open={!!deletingP} onOpenChange={(open) => !open && setDeletingP(null)}>
        <AlertDialogContent className="rounded-2xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-slate-800">Delete this placeholder?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-500">
              {deletingP && (() => {
                const usedBy = clauseUsage.get(deletingP.key) || [];
                return (
                  <>
                    Deletes <span className="font-mono">{'{{' + deletingP.key + '}}'}</span> ("{deletingP.label}") from the registry.{' '}
                    {clausesEnabled && usedBy.length > 0 ? (
                      <>It's currently referenced by <strong>{usedBy.length} clause{usedBy.length === 1 ? '' : 's'}</strong> ({usedBy.map((c) => c.label).join(', ')}) - those will render blank where it was used.</>
                    ) : clausesEnabled ? (
                      "It isn't referenced by any clause right now."
                    ) : (
                      "Any place it's still typed into the template will render blank."
                    )}{' '}
                    This cannot be undone.
                  </>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="h-9 px-4 rounded-full text-sm font-semibold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="h-9 px-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold shadow-md shadow-red-500/10 border-0"
            >
              {deleting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin inline" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
