'use client';

import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CompanyDirector } from '../hooks/useCompanyDirectors';

interface DirectorsPickerProps {
  directors: CompanyDirector[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

// Multi-select counterpart to the Letter Generation Engine's single-select
// "Directors" picker (letters/components/LetterControls.tsx) - a consultancy
// engagement's acknowledgement section can be signed by more than one
// director/shareholder at once, so this lets several be chosen instead of
// exactly one. Selection drives utils/directorsBlock.ts, which
// ContractPreview.tsx merges in as {{directors_acknowledgement_block}}.
export function DirectorsPicker({ directors, selectedIds, onChange }: DirectorsPickerProps) {
  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id]);
  };

  const selectedDirectors = directors.filter((d) => selectedIds.includes(d.id));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          Directors / Shareholders Acknowledging
        </label>
      </div>

      {directors.length === 0 ? (
        <p className="text-xs text-slate-400 italic py-2">No directors or shareholders found for this company.</p>
      ) : (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="w-full h-9 px-3 flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {selectedDirectors.length === 0
                    ? 'Select signatories'
                    : `${selectedDirectors.length} selected`}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width] min-w-[16rem]">
              {directors.map((d) => (
                <DropdownMenuCheckboxItem
                  key={d.id}
                  checked={selectedIds.includes(d.id)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => toggle(d.id)}
                  className="text-xs"
                >
                  <span className="flex-1 truncate">{d.name}</span>
                  <Badge variant="outline" className="ml-2 text-[9px] shrink-0">{d.position}</Badge>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {selectedDirectors.length > 0 && (
            <div className={cn("flex flex-wrap gap-1 mt-2")}>
              {selectedDirectors.map((d) => (
                <Badge key={d.id} variant="outline" className="text-[10px] gap-1 bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900">
                  {d.name}
                </Badge>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
