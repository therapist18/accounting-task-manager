'use client';

import { useState } from 'react';
import { Calculator, Pencil, RotateCcw, Check, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  breakdownFromManual,
  computeStatutoryDeductions,
  resolveStatutoryDeductions,
  type ManualStatutoryFigures,
  type StatutoryDeductionsBreakdown,
} from '../utils/statutoryDeductions';

// The {{statutory_deductions_table}} row of the Contract Fields panel. The
// value is generated table markup, so instead of a text input showing raw
// HTML this shows a readable summary, and lets the user type the figures in
// when they couldn't be fetched from Payroll or computed (no payroll run, no
// gross salary) - or correct them. Manual figures are saved per contract in
// offer.settings_overrides.statutory_deductions_manual and win over both
// automatic sources (see resolveStatutoryDeductions).

const EDITABLE_LINES: Array<{ key: keyof ManualStatutoryFigures; label: string }> = [
  { key: 'grossSalary', label: 'Gross Salary' },
  { key: 'paye', label: 'PAYE' },
  { key: 'shif', label: 'SHIF/SHA (2.75%)' },
  { key: 'ahl', label: 'AHL – Housing Levy (1.5%)' },
  { key: 'nssf', label: 'NSSF' },
  { key: 'nita', label: 'NITA (employer)' },
];

const SOURCE_LABEL = { manual: 'Entered manually', payroll: 'From payroll', computed: 'Computed from gross salary' } as const;

const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-US')}`;

function toManual(b: StatutoryDeductionsBreakdown): ManualStatutoryFigures {
  return { grossSalary: Math.round(b.grossSalary), paye: Math.round(b.paye), shif: Math.round(b.shif), ahl: Math.round(b.ahl), nssf: Math.round(b.nssf), nita: Math.round(b.nita) };
}

export function StatutoryDeductionsField({
  grossSalary,
  payrollLine,
  manual,
  hidden,
  onManualChange,
}: {
  grossSalary: string;
  payrollLine: StatutoryDeductionsBreakdown | null;
  manual: ManualStatutoryFigures | null;
  // show_statutory_table === false (the preview toolbar toggle).
  hidden: boolean;
  onManualChange: (figures: ManualStatutoryFigures | undefined) => void;
}) {
  const resolved = resolveStatutoryDeductions(grossSalary, payrollLine, manual);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ManualStatutoryFigures | null>(null);

  const startEditing = () => {
    setDraft(resolved ? toManual(resolved.breakdown) : { grossSalary: 0, paye: 0, shif: 0, ahl: 0, nssf: 0, nita: 0 });
    setEditing(true);
  };

  if (hidden) {
    return <span className="italic text-slate-500">Hidden from the contract (toggle in the preview toolbar)</span>;
  }

  if (editing && draft) {
    const derived = breakdownFromManual(draft);
    const set = (key: keyof ManualStatutoryFigures, raw: string) =>
      setDraft({ ...draft, [key]: parseFloat(raw.replace(/,/g, '')) || 0 });
    return (
      <div className="space-y-2 py-1">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {EDITABLE_LINES.map((line) => (
            <label key={line.key} className="flex flex-col gap-0.5">
              <span className="text-sm text-slate-500">{line.label}</span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={draft[line.key] || ''}
                onChange={(e) => set(line.key, e.target.value)}
                className="h-8 text-base px-2"
              />
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-md px-2 py-1.5">
          <span>Taxable Pay <strong>{kes(derived.taxablePay)}</strong></span>
          <span>Net Pay <strong>{kes(derived.netPay)}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => draft.grossSalary > 0 && setDraft(toManual(computeStatutoryDeductions(draft.grossSalary)))}
            disabled={!(draft.grossSalary > 0)}
            className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            title="Fill PAYE/SHIF/AHL/NSSF/NITA from the gross salary at current statutory rates"
          >
            <Calculator className="w-3.5 h-3.5" /> Calculate from gross
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-8 px-2.5 rounded-md text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { onManualChange(draft); setEditing(false); }}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-custom-blue text-white text-sm hover:bg-blue-700"
          >
            <Check className="w-3.5 h-3.5" /> Use these figures
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      {resolved ? (
        <div className="min-w-0 flex-1">
          <div className="truncate text-base">
            Gross {kes(resolved.breakdown.grossSalary)} · Deductions {kes(resolved.breakdown.totalDeductions)} · <strong>Net {kes(resolved.breakdown.netPay)}</strong>
          </div>
          <div className={cn('text-sm', resolved.source === 'manual' ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-500')}>
            {SOURCE_LABEL[resolved.source]}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-1.5 text-amber-600 dark:text-amber-400 italic">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Couldn't fetch or compute the figures - enter them manually
        </div>
      )}
      <button
        type="button"
        onClick={startEditing}
        className="h-8 px-2.5 shrink-0 inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <Pencil className="w-3.5 h-3.5" /> {resolved ? 'Edit figures' : 'Enter figures'}
      </button>
      {manual && (
        <button
          type="button"
          onClick={() => onManualChange(undefined)}
          title="Discard the manual figures and use payroll / computed figures again"
          className="w-8 h-8 shrink-0 flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
