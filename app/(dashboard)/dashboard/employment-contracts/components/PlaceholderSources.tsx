'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Sliders, FileStack, Pencil, Database, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { EcPlaceholder, fetchPlaceholders, updatePlaceholderDetails } from '../utils/ecPlaceholders';
import { MasterFieldOption, fetchMasterFieldOptions } from '../utils/placeholderDetection';
import { ecPlaceholderToDtmPlaceholder, dtmPlaceholderToEcUpdates } from '../utils/ecPlaceholderAdapter';
import { PlaceholderFormDialog } from '../../templates/document-template-manager/components/PlaceholderFormDialog';
import { useTemplateData } from '../../templates/document-template-manager/hooks/useTemplateData';
import { useTableData } from '@/lib/tableUtils';
import type { Placeholder } from '../../templates/document-template-manager/types';

interface PlaceholderSourcesProps {
  highlightKeys?: string[];
}

type SortColumn = '#' | 'token' | 'group' | 'source' | 'linked' | 'default';
type SortDir = 'asc' | 'desc';

const EC_HIDDEN_SECTIONS = {
  entityContext: true,
  uiVisibility: true,
  aiRefinement: true,
  jobQuestions: true,
  requirements: true,
};

export function PlaceholderSources({ highlightKeys }: PlaceholderSourcesProps) {
  const [placeholders, setPlaceholders] = useState<EcPlaceholder[]>([]);
  const [masterFields, setMasterFields] = useState<MasterFieldOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [sortColumn, setSortColumn] = useState<SortColumn>('#');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [editingEc, setEditingEc] = useState<EcPlaceholder | null>(null);
  const [draft, setDraft] = useState<Placeholder | null>(null);
  const { masterFields: dtmMasterFields, jobQuestions, requirements, kycDocuments, documentTypes } = useTemplateData(!!editingEc, null);
  const { tables, loadingTables } = useTableData();

  const sectionRef = useRef<HTMLDivElement>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    (async () => {
      setIsLoading(true);
      const [fields, ecPlaceholders] = await Promise.all([fetchMasterFieldOptions(), fetchPlaceholders()]);
      setMasterFields(fields);
      setPlaceholders(ecPlaceholders);
      setIsLoading(false);
    })();
  }, []);

  const masterFieldMap = useMemo(() => new Map(masterFields.map((f) => [f.id, f.label])), [masterFields]);

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

  const getLinkedLabel = (p: EcPlaceholder) => {
    if (p.source_kind === 'master_field' && p.master_field_id) {
      return masterFieldMap.get(p.master_field_id) || '';
    }
    return '';
  };

  const sortedPlaceholders = useMemo(() => {
    const list = search
      ? placeholders.filter((p) => {
          const q = search.toLowerCase();
          return (
            p.key.toLowerCase().includes(q) ||
            p.label.toLowerCase().includes(q) ||
            p.group_label.toLowerCase().includes(q) ||
            (p.master_field_id && masterFieldMap.get(p.master_field_id)?.toLowerCase().includes(q))
          );
        })
      : [...placeholders];

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
        case 'source':
          cmp = a.source_kind.localeCompare(b.source_kind);
          break;
        case 'linked':
          cmp = getLinkedLabel(a).localeCompare(getLinkedLabel(b));
          break;
        case 'default':
          cmp = (a.default_value || '').localeCompare(b.default_value || '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [placeholders, search, masterFieldMap, sortColumn, sortDir]);

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
    try {
      const persisted = await updatePlaceholderDetails(editingEc.id, dtmPlaceholderToEcUpdates(updated));
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

  return (
    <div ref={sectionRef} className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Placeholders Used</p>
        <p className="text-xs text-slate-400">{placeholders.length} total</p>
      </div>

      <div className="relative mb-3">
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
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : sortedPlaceholders.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-6">
          {placeholders.length === 0 ? 'No placeholders detected yet.' : 'No placeholders match your search.'}
        </p>
      ) : (
        <div className="overflow-auto max-h-80">
          <Table>
            <TableHeader>
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
                  <button onClick={() => toggleSort('source')} className="flex items-center gap-0">
                    Source <SortIcon col="source" />
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
                <TableHead className="text-right font-bold text-slate-600 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700 px-2 py-2">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPlaceholders.map((p, idx) => (
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
                    {p.source_kind === 'master_field' ? (
                      <Badge variant="outline" className="text-xs font-medium bg-slate-50 text-slate-600 border-slate-200 rounded-full px-2.5 py-0.5 gap-1.5">
                        <Database className="w-3 h-3" /> Master field
                      </Badge>
                    ) : p.source_kind === 'settings_cascade' ? (
                      <Badge variant="outline" className="text-xs font-medium bg-blue-50 text-blue-700 border-blue-200 rounded-full px-2.5 py-0.5 gap-1.5">
                        <Sliders className="w-3 h-3" /> Settings cascade
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs font-medium bg-purple-50 text-purple-700 border-purple-200 rounded-full px-2.5 py-0.5 gap-1.5">
                        <FileStack className="w-3 h-3" /> Offer field
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="border border-slate-200 dark:border-slate-700 px-2 py-2">
                    {p.source_kind === 'master_field' ? (
                      p.master_field_id && masterFieldMap.get(p.master_field_id) ? (
                        <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                          {masterFieldMap.get(p.master_field_id)}
                        </Badge>
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
                  <TableCell className="text-right border border-slate-200 dark:border-slate-700 px-2 py-2">
                    {p.source_kind === 'master_field' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-custom-blue"
                        onClick={() => openEdit(p)}
                        title="Edit placeholder"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
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
        />
      )}
    </div>
  );
}
