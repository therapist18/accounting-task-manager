'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Database, Briefcase, BookText, Settings, Sliders, FileStack, RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { EcPlaceholder, fetchPlaceholders, linkPlaceholderMasterField } from '../utils/ecPlaceholders';
import { MasterFieldOption, fetchMasterFieldOptions, syncPlaceholdersFromContent } from '../utils/placeholderDetection';
import { fetchClauses } from '../utils/clauseLibraryData';
import { MasterFieldPicker } from '../components/MasterFieldPicker';

export default function PlaceholderDataSourcesPage() {
  const [placeholders, setPlaceholders] = useState<EcPlaceholder[]>([]);
  const [masterFields, setMasterFields] = useState<MasterFieldOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const load = async () => {
    setIsLoading(true);
    const [fields, ecPlaceholders] = await Promise.all([
      fetchMasterFieldOptions(),
      fetchPlaceholders(),
    ]);
    setMasterFields(fields);
    setPlaceholders(ecPlaceholders);
    setIsLoading(false);
  };

  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, EcPlaceholder[]>();
    for (const p of placeholders) {
      if (!map.has(p.group_label)) map.set(p.group_label, []);
      map.get(p.group_label)!.push(p);
    }
    return Array.from(map.entries());
  }, [placeholders]);

  const handleLink = async (placeholder: EcPlaceholder, field: MasterFieldOption | null) => {
    setLinkingId(placeholder.id);
    try {
      const updated = await linkPlaceholderMasterField(placeholder.id, field?.id ?? null);
      if (updated) {
        setPlaceholders((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        toast({ title: field ? `Linked to ${field.label}` : 'Unlinked' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update link', variant: 'destructive' });
    } finally {
      setLinkingId(null);
    }
  };

  // Scans every clause's content for {{tokens}} not yet registered here -
  // the same "detect, then let the user assign a master field" flow as
  // Document Template Manager's Re-scan, just sourced from the whole Clause
  // Library instead of one uploaded document. New tokens land unlinked (or
  // fuzzy-auto-matched) under the "Custom" group, ready to link below.
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const clauses = await fetchClauses();
      const added = await syncPlaceholdersFromContent(clauses.map((c) => c.content));
      if (added.length > 0) {
        toast({ title: `Found ${added.length} new placeholder${added.length !== 1 ? 's' : ''}`, description: added.map((k) => `{{${k}}}`).join(', ') });
        await load();
      } else {
        toast({ title: 'Up to date', description: 'No new placeholders found in the Clause Library.' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to sync placeholders', variant: 'destructive' });
    } finally {
      setIsSyncing(false);
    }
  };

  const linkedCount = placeholders.filter((p) => p.source_kind === 'master_field' && p.master_field_id).length;
  const masterFieldTotal = placeholders.filter((p) => p.source_kind === 'master_field').length;

  return (
    <div className="h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      {/* HEADER */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-custom-blue" />
            Placeholder Data Sources
          </h1>
          {!isLoading && (
            <Badge variant="outline" className="text-xs font-semibold rounded-full px-2 py-0 tabular-nums">
              {linkedCount}/{masterFieldTotal} linked
            </Badge>
          )}
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleSync} disabled={isSyncing}>
            {isSyncing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Sync from Clause Library
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/dashboard/employment-contracts" className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">Contracts</Link>
          <Link href="/dashboard/employment-contracts/clause-library" className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><BookText className="w-4 h-4" /> Clauses</Link>
          <Link href="/dashboard/employment-contracts/job-profiles" className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><Briefcase className="w-4 h-4" /> Job Profiles</Link>
          <Link href="/dashboard/employment-contracts/templates" className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><Settings className="w-4 h-4" /> Templates</Link>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <p className="text-sm text-slate-500">
          Every <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{token}}'}</span> a contract clause can use, and where its value comes from.
          Identity fields (Employee / Company) link to a <span className="font-medium text-slate-700 dark:text-slate-300">Master Field</span> - the same registry Document Template Manager uses -
          so the data source is defined once and shared everywhere. New tokens typed into a clause are picked up automatically when the clause is saved, or via <span className="font-medium text-slate-700 dark:text-slate-300">Sync from Clause Library</span> above.
          Working hours, benefits, leave and salary fields are resolved by the Job Profile / Offer cascade instead and aren't linkable here.
        </p>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-5 space-y-6 max-w-4xl mx-auto">
            {grouped.map(([group, items]) => (
              <div key={group} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{group}</p>
                </div>
                <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                  {items.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0 shrink-0 w-56">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{p.label}</p>
                        <p className="text-xs font-mono text-slate-400 truncate">{'{{' + p.key + '}}'}</p>
                      </div>

                      <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
                        {p.source_kind === 'master_field' ? (
                          <>
                            {linkingId === p.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 shrink-0" />}
                            <MasterFieldPicker
                              masterFields={masterFields}
                              selectedFieldId={p.master_field_id}
                              onSelect={(field) => handleLink(p, field)}
                              disabled={linkingId === p.id}
                            />
                          </>
                        ) : p.source_kind === 'settings_cascade' ? (
                          <Badge variant="outline" className="text-xs font-medium bg-blue-50 text-blue-700 border-blue-200 rounded-full px-2.5 py-0.5 gap-1.5 shrink-0">
                            <Sliders className="w-3 h-3" /> Job Profile / Offer settings cascade
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs font-medium bg-purple-50 text-purple-700 border-purple-200 rounded-full px-2.5 py-0.5 gap-1.5 shrink-0">
                            <FileStack className="w-3 h-3" /> Employment Offer field
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
