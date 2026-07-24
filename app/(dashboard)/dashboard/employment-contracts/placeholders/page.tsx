'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import supabase from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Database, Briefcase, BookText, Settings, Sliders, FileStack } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { EcPlaceholder, fetchPlaceholders, linkPlaceholderMasterField } from '../utils/ecPlaceholders';

interface MasterFieldOption {
  id: string;
  label: string;
  field_key: string;
  category: string | null;
}

export default function PlaceholderDataSourcesPage() {
  const [placeholders, setPlaceholders] = useState<EcPlaceholder[]>([]);
  const [masterFields, setMasterFields] = useState<MasterFieldOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    const [{ data: fields }, ecPlaceholders] = await Promise.all([
      supabase.from('tm_job_fields').select('id, label, field_key, category').order('label'),
      fetchPlaceholders(),
    ]);
    setMasterFields((fields || []) as MasterFieldOption[]);
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

  const handleLink = async (placeholder: EcPlaceholder, masterFieldId: string) => {
    setLinkingId(placeholder.id);
    try {
      const updated = await linkPlaceholderMasterField(placeholder.id, masterFieldId === '__none__' ? null : masterFieldId);
      if (updated) {
        setPlaceholders((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        toast({ title: masterFieldId === '__none__' ? 'Unlinked' : 'Linked to master field' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update link', variant: 'destructive' });
    } finally {
      setLinkingId(null);
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
          so the data source is defined once and shared everywhere. Working hours, benefits, leave and salary fields are resolved by the Job Profile / Offer cascade instead and aren't linkable here.
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
                            <Select
                              value={p.master_field_id || '__none__'}
                              onValueChange={(v) => handleLink(p, v)}
                              disabled={linkingId === p.id}
                            >
                              <SelectTrigger className={cn("h-8 text-xs w-72", !p.master_field_id && "border-amber-300 dark:border-amber-700")}>
                                <SelectValue placeholder="Not linked - using legacy default" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Not linked (falls back to legacy default)</SelectItem>
                                {masterFields.map((f) => (
                                  <SelectItem key={f.id} value={f.id}>
                                    {f.label} <span className="text-slate-400 font-mono text-[10px]">({f.field_key})</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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
