import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, ListChecks, Building2, UserCircle, Users, User, Shield, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContractPlaceholderListProps {
  placeholders: any[];
  values: Record<string, any>;
  resolvedNames: Set<string>;
  loading: boolean;
  onChange: (name: string, value: string) => void;
}

const ENTITY_LABELS: Record<string, string> = {
  company: 'Company',
  principal: 'Employee',
  director: 'Director',
  dependant: 'Dependant',
  spouse: 'Spouse',
  child: 'Child',
  understudy: 'Understudy',
  sponsor: 'Sponsor',
};

const ENTITY_ICONS: Record<string, any> = {
  company: Building2,
  principal: UserCircle,
  director: Users,
  dependant: User,
  understudy: User,
  sponsor: Shield,
  spouse: Heart,
  child: User,
};

function getEntityType(p: any): string {
  if (Array.isArray(p.entity_type)) return p.entity_type[0] || 'other';
  return p.entity_type || 'other';
}

export function ContractPlaceholderList({ placeholders, values, resolvedNames, loading, onChange }: ContractPlaceholderListProps) {
  const grouped = useMemo(() => {
    if (!placeholders || placeholders.length === 0) return [];

    const map = new Map<string, any[]>();
    for (const p of placeholders) {
      const entity = getEntityType(p);
      if (!map.has(entity)) map.set(entity, []);
      map.get(entity)!.push(p);
    }

    const order = ['company', 'principal', 'director', 'dependant', 'spouse', 'child', 'understudy', 'sponsor', 'other'];
    const sorted: { key: string; label: string; items: any[] }[] = [];
    for (const key of order) {
      if (map.has(key)) {
        sorted.push({ key, label: ENTITY_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1), items: map.get(key)! });
      }
    }
    return sorted;
  }, [placeholders]);

  if (!placeholders || placeholders.length === 0) return null;

  return (
    <div className="space-y-4 flex-1">
      <h3 className="text-sm font-bold text-slate-700 border-b pb-2 flex items-center gap-2 sticky top-0 bg-white dark:bg-slate-900 z-10">
        <ListChecks className="w-4 h-4" /> Template Placeholders
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
      </h3>

      {grouped.map((group) => {
        const Icon = ENTITY_ICONS[group.key] || ListChecks;
        return (
          <div key={group.key} className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{group.label}</span>
              <Badge variant="outline" className="text-sm text-slate-400 border-slate-200 rounded-full px-1.5 py-0 ml-0.5">
                {group.items.length}
              </Badge>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {group.items.map((p, i) => {
                const isAutoFilled = resolvedNames.has(p.name);
                return (
                  <div
                    key={p.id || p.name}
                    className={cn(
                      "grid grid-cols-[minmax(120px,38%)_1fr] gap-3 items-center px-3 py-1.5",
                      i % 2 === 1 && "bg-slate-50/60 dark:bg-slate-900/40"
                    )}
                  >
                    <label className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1 min-w-0">
                      <span className="truncate capitalize">{p.description || p.name.replace(/_/g, ' ')}</span>
                      {p.required && <span className="text-red-500 shrink-0">*</span>}
                      {isAutoFilled && (
                        <Badge variant="outline" className="text-sm font-semibold bg-emerald-50 text-emerald-600 border-emerald-200 rounded-full px-1.5 py-0 shrink-0">
                          auto
                        </Badge>
                      )}
                    </label>
                    <Input
                      className="h-8 text-sm bg-white dark:bg-slate-950"
                      value={values[p.name] ?? ''}
                      onChange={(e) => onChange(p.name, e.target.value)}
                      placeholder={`Enter ${p.name.replace(/_/g, ' ')}...`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
