import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Two-column settings table (label | value) for the Job Profiles settings
// screens - same design as the Employment Contracts workspace's fields table
// and the Email Center tables: one bordered card, thin gridlines, group rows
// as full-width uppercase headers, compact cells. Replaces the per-section
// decorated cards (icon chip + accent colour + paragraph) those screens used.

export const SETTINGS_TD = 'px-3 py-2.5 text-base text-slate-700 dark:text-slate-200 border-b border-slate-200/70 dark:border-slate-800 align-middle';

export function SettingsTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-clip', className)}>
      <table className="w-full table-fixed border-separate border-spacing-0 text-base [&>tbody>tr:last-child>td]:border-b-0">
        <colgroup>
          <col className="w-[34%]" />
          <col />
        </colgroup>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export type SettingsAccent = 'blue' | 'emerald' | 'amber' | 'indigo' | 'purple' | 'teal' | 'rose' | 'slate';

// Each group gets a colour: a tinted header with an icon chip and a coloured
// left edge, so a long settings table reads as distinct sections.
const ACCENTS: Record<SettingsAccent, { row: string; chip: string; label: string; edge: string }> = {
  blue: { row: 'bg-blue-50/70 dark:bg-blue-950/30', chip: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300', label: 'text-blue-800 dark:text-blue-200', edge: 'shadow-[inset_3px_0_0_0_#3b82f6]' },
  emerald: { row: 'bg-emerald-50/70 dark:bg-emerald-950/30', chip: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300', label: 'text-emerald-800 dark:text-emerald-200', edge: 'shadow-[inset_3px_0_0_0_#10b981]' },
  amber: { row: 'bg-amber-50/70 dark:bg-amber-950/30', chip: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300', label: 'text-amber-800 dark:text-amber-200', edge: 'shadow-[inset_3px_0_0_0_#f59e0b]' },
  indigo: { row: 'bg-indigo-50/70 dark:bg-indigo-950/30', chip: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300', label: 'text-indigo-800 dark:text-indigo-200', edge: 'shadow-[inset_3px_0_0_0_#6366f1]' },
  purple: { row: 'bg-purple-50/70 dark:bg-purple-950/30', chip: 'bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300', label: 'text-purple-800 dark:text-purple-200', edge: 'shadow-[inset_3px_0_0_0_#a855f7]' },
  teal: { row: 'bg-teal-50/70 dark:bg-teal-950/30', chip: 'bg-teal-100 text-teal-600 dark:bg-teal-500/20 dark:text-teal-300', label: 'text-teal-800 dark:text-teal-200', edge: 'shadow-[inset_3px_0_0_0_#14b8a6]' },
  rose: { row: 'bg-rose-50/70 dark:bg-rose-950/30', chip: 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300', label: 'text-rose-800 dark:text-rose-200', edge: 'shadow-[inset_3px_0_0_0_#f43f5e]' },
  slate: { row: 'bg-slate-50 dark:bg-slate-950', chip: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300', label: 'text-slate-700 dark:text-slate-200', edge: 'shadow-[inset_3px_0_0_0_#94a3b8]' },
};

// Full-width group header row - icon + accent colour, optional one-line
// description, a count/progress pill and a right-aligned action (e.g.
// "Save lists", "Sync from Employees").
export function SettingsGroupRow({ label, description, count, action, icon: Icon, accent = 'slate' }: {
  label: string;
  description?: string;
  count?: string | number;
  action?: ReactNode;
  icon?: LucideIcon;
  accent?: SettingsAccent;
}) {
  const a = ACCENTS[accent];
  return (
    <tr>
      <td colSpan={2} className={cn('px-3 py-2 border-b border-slate-200/80 dark:border-slate-800', a.row, a.edge)}>
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', a.chip)}>
              <Icon className="w-4 h-4" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cn('text-sm font-bold uppercase tracking-wide', a.label)}>{label}</span>
              {count !== undefined && (
                <span className="text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-full bg-white/80 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700">
                  {count}
                </span>
              )}
            </div>
            {description && <p className="text-sm text-slate-500 dark:text-slate-400 truncate" title={description}>{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </td>
    </tr>
  );
}

// One setting: label (with an optional tooltip, e.g. the settings_key) and
// its control/value.
export function SettingsRow({ label, title, alignTop, children, className }: {
  label: ReactNode;
  title?: string;
  alignTop?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn('bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60 transition-colors', className)}>
      <td className={cn(SETTINGS_TD, 'border-r font-semibold text-slate-800 dark:text-slate-100', alignTop && 'align-top pt-4')} title={title}>
        {label}
      </td>
      <td className={cn(SETTINGS_TD, alignTop && 'align-top')}>{children}</td>
    </tr>
  );
}
