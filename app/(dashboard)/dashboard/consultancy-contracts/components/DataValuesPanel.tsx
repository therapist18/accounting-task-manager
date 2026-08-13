'use client';

import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, RotateCcw, Database, PenLine, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EcPlaceholder } from '../../employment-contracts/utils/ecPlaceholders';

interface DataValuesPanelProps {
  companySelected: boolean;
  loading: boolean;
  placeholders: EcPlaceholder[];
  // Values resolved from linked master fields for the selected company.
  resolvedValues: Record<string, string>;
  // This company's saved overrides (cc_engagements.placeholder_overrides).
  overrides: Record<string, string>;
  onOverrideChange: (key: string, value: string | undefined) => void;
}

// _vat_fee/_gross_fee tokens are always derived from the matching _net_fee
// value (see utils/feeCalculations.ts) - the admin only ever types the Net
// figure, so the computed siblings are hidden here rather than inviting a
// manual entry that gets silently superseded.
function isComputedFeeKey(key: string): boolean {
  return key.endsWith('_vat_fee') || key.endsWith('_gross_fee');
}

export function DataValuesPanel({ companySelected, loading, placeholders, resolvedValues, overrides, onOverrideChange }: DataValuesPanelProps) {
  const grouped = useMemo(() => {
    const groups = new Map<string, EcPlaceholder[]>();
    for (const p of placeholders) {
      if (isComputedFeeKey(p.key)) continue;
      if (!groups.has(p.group_label)) groups.set(p.group_label, []);
      groups.get(p.group_label)!.push(p);
    }
    return Array.from(groups.entries());
  }, [placeholders]);

  if (!companySelected) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8">
        <Building2 className="w-10 h-10 text-slate-300 mb-3" />
        <p className="text-sm font-medium text-slate-500">Select a client company</p>
        <p className="text-xs text-slate-400 mt-1">Its data & values will appear here for review.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-5 space-y-6">
        {grouped.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No placeholders configured yet - add them from Settings.</p>
        )}
        {grouped.map(([group, items]) => (
          <div key={group}>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2.5">{group}</h3>
            <div className="space-y-3">
              {items.map((p) => {
                const sourceValue = resolvedValues[p.key] ?? p.default_value ?? '';
                const hasOverride = Object.prototype.hasOwnProperty.call(overrides, p.key);
                const value = hasOverride ? overrides[p.key] : sourceValue;
                const linked = p.source_kind === 'master_field' && !!p.master_field_id;

                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        {p.label}
                        {p.required && <span className="text-red-400">*</span>}
                      </Label>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className={cn(
                          "text-[10px] gap-1",
                          linked ? "bg-slate-50 text-slate-500 border-slate-200" : "bg-blue-50 text-blue-600 border-blue-200"
                        )}>
                          {linked ? <Database className="w-2.5 h-2.5" /> : <PenLine className="w-2.5 h-2.5" />}
                          {linked ? 'Master field' : 'Manual'}
                        </Badge>
                        {hasOverride && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-slate-400 hover:text-custom-blue"
                            title="Reset to source value"
                            onClick={() => onOverrideChange(p.key, undefined)}
                          >
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <Input
                      value={value}
                      disabled={!p.editable}
                      placeholder={sourceValue ? undefined : `{{${p.key}}}`}
                      onChange={(e) => onOverrideChange(p.key, e.target.value)}
                      className={cn("h-9 text-sm rounded-lg", hasOverride && "border-custom-blue/50 bg-blue-50/30 dark:bg-blue-950/10")}
                    />
                    {p.description && <p className="text-[11px] text-slate-400 mt-1">{p.description}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
