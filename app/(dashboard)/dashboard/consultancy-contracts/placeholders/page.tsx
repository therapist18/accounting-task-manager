'use client';

import { useEffect, useMemo, useState } from 'react';
import { Braces, Loader2, Search, Trash2, RefreshCw, Database, PenLine, Link2, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  EcPlaceholder, fetchPlaceholders, updatePlaceholderDetails, deletePlaceholder,
} from '../../employment-contracts/utils/ecPlaceholders';
import { MasterFieldOption, fetchMasterFieldOptions, detectTokens, syncPlaceholdersFromContent } from '../utils/placeholderDetection';
import { fetchDefaultTemplate } from '../utils/ccTemplate';

// This module deliberately reuses ec_placeholders (Employment Contracts'
// registry) rather than a parallel table - see the note in
// 20260813000000_consultancy_contract_engine.sql. This page only ever shows
// the subset of rows the contract template actually references, and only
// rows this module itself created (group_label 'Consultancy Contract') can
// be deleted from here - deleting a row shared with Employment Contracts
// (e.g. company_kra_pin) from this screen would silently break EC's own
// contracts too.
const OWNED_GROUP = 'Consultancy Contract';

export default function ConsultancyPlaceholdersPage() {
  const [placeholders, setPlaceholders] = useState<EcPlaceholder[]>([]);
  const [masterFields, setMasterFields] = useState<MasterFieldOption[]>([]);
  const [templateContent, setTemplateContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [deletingP, setDeletingP] = useState<EcPlaceholder | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setIsLoading(true);
    const [fields, ph, tmpl] = await Promise.all([fetchMasterFieldOptions(), fetchPlaceholders(), fetchDefaultTemplate()]);
    setMasterFields(fields);
    setPlaceholders(ph);
    setTemplateContent(tmpl?.content || '');
    setIsLoading(false);
  };

  useEffect(() => { load(); }, []);

  const relevantKeys = useMemo(() => new Set(detectTokens(templateContent)), [templateContent]);
  const relevant = useMemo(() => placeholders.filter((p) => relevantKeys.has(p.key)), [placeholders, relevantKeys]);

  const masterFieldMap = useMemo(() => new Map(masterFields.map((f) => [String(f.id), f.label])), [masterFields]);

  const filtered = useMemo(() => {
    if (!search) return relevant;
    const q = search.toLowerCase();
    return relevant.filter((p) =>
      p.key.toLowerCase().includes(q) ||
      p.label.toLowerCase().includes(q) ||
      p.group_label.toLowerCase().includes(q)
    );
  }, [relevant, search]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const tmpl = await fetchDefaultTemplate();
      const newTokens = await syncPlaceholdersFromContent(tmpl?.content || '');
      await load();
      toast.success(newTokens.length > 0 ? `${newTokens.length} new placeholder${newTokens.length === 1 ? '' : 's'} detected` : 'No new placeholders found');
    } finally {
      setSyncing(false);
    }
  };

  const patch = async (p: EcPlaceholder, updates: Parameters<typeof updatePlaceholderDetails>[1]) => {
    try {
      const updated = await updatePlaceholderDetails(p.id, updates);
      if (updated) setPlaceholders((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update placeholder');
    }
  };

  const handleDelete = async () => {
    if (!deletingP) return;
    setDeleting(true);
    const ok = await deletePlaceholder(deletingP.id);
    setDeleting(false);
    if (ok) {
      setPlaceholders((prev) => prev.filter((p) => p.id !== deletingP.id));
      toast.success('Placeholder deleted');
    } else {
      toast.error('Failed to delete placeholder');
    }
    setDeletingP(null);
  };

  return (
    <div className="h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <Braces className="w-5 h-5 text-custom-blue" />
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">Placeholders</h1>
          <p className="hidden md:block text-sm text-slate-400 ml-2">Every {'{{token}}'} this contract's template uses. Company facts (name, KRA PIN, ...) are shared with Employment Contracts' own registry.</p>
        </div>
        <Button size="sm" variant="outline" className="h-9 rounded-full gap-1.5" onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Sync from template
        </Button>
      </div>

      <div className="p-4 flex-1 overflow-hidden flex flex-col">
        <div className="relative mb-3 shrink-0 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search placeholders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-full text-sm"
          />
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            {relevant.length === 0 ? 'No placeholders yet - type {{tokens}} into the template in Settings, then Sync.' : 'No placeholders match your search.'}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="text-xs font-bold border px-2 py-2">Token</TableHead>
                  <TableHead className="text-xs font-bold border px-2 py-2">Group</TableHead>
                  <TableHead className="text-xs font-bold border px-2 py-2">Linked Master Field</TableHead>
                  <TableHead className="text-xs font-bold border px-2 py-2">Default Value</TableHead>
                  <TableHead className="text-xs font-bold border px-2 py-2 text-center">Editable</TableHead>
                  <TableHead className="text-xs font-bold border px-2 py-2 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const owned = p.group_label === OWNED_GROUP;
                  return (
                  <TableRow key={p.id}>
                    <TableCell className="border px-2 py-2">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{p.label}</p>
                      <p className="text-xs font-mono text-slate-400">{'{{' + p.key + '}}'}</p>
                    </TableCell>
                    <TableCell className="border px-2 py-2">
                      <Badge variant="secondary" className={cn("text-[10px] gap-1", !owned && "bg-indigo-50 text-indigo-700 border-indigo-200")}>
                        {!owned && <ShieldAlert className="w-2.5 h-2.5" />}
                        {p.group_label}
                      </Badge>
                    </TableCell>
                    <TableCell className="border px-2 py-2">
                      {p.source_kind === 'master_field' ? (
                        <Select
                          value={p.master_field_id ?? undefined}
                          onValueChange={(v) => patch(p, { master_field_id: v })}
                        >
                          <SelectTrigger className="h-7 text-xs rounded-lg w-full min-w-[160px]">
                            <SelectValue placeholder="Not linked">
                              {p.master_field_id ? (masterFieldMap.get(String(p.master_field_id)) || 'Not linked') : undefined}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {masterFields.map((f) => (
                              <SelectItem key={f.id} value={String(f.id)}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          <Link2 className="w-2.5 h-2.5 mr-1" />
                          {p.source_kind}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="border px-2 py-2">
                      <Input
                        defaultValue={p.default_value || ''}
                        onBlur={(e) => { if (e.target.value !== (p.default_value || '')) patch(p, { default_value: e.target.value || null }); }}
                        className="h-7 text-xs rounded-lg"
                        placeholder="—"
                      />
                    </TableCell>
                    <TableCell className="border px-2 py-2 text-center">
                      <Switch checked={p.editable} onCheckedChange={(checked) => patch(p, { editable: checked })} />
                    </TableCell>
                    <TableCell className="text-right border px-2 py-2">
                      {owned ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-red-600"
                          onClick={() => setDeletingP(p)}
                          title="Delete placeholder"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <span className="text-[10px] text-slate-300" title="Shared with Employment Contracts - delete it from there instead">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AlertDialog open={!!deletingP} onOpenChange={(open) => !open && setDeletingP(null)}>
        <AlertDialogContent className="rounded-2xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-slate-800">Delete this placeholder?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-500">
              Deletes <span className="font-mono">{deletingP ? '{{' + deletingP.key + '}}' : ''}</span> from the registry. Any place it's still typed into the template will render blank. This cannot be undone.
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
