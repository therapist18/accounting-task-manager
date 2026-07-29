'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Building2, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Company } from '../../companies/database';
import ClientCategoryFilter from '@/app/generic-components/ClientCategoryFilter';
import {
  companyMatchesCategoryFilters,
  DEFAULT_CATEGORY_FILTERS,
  type FilterState,
} from '@/app/generic-components/companyCategoryFilters';

export interface SidebarItem {
  id: string;
  label: string;
  count: number;
}

interface CompaniesSidebarProps {
  companies: Company[];
  selectedCompanyId: string | null;
  onSelectCompany: (id: string | null) => void;
  /** Extra items shown above the company list, e.g. "Platform Defaults" */
  topItems?: SidebarItem[];
  /** Items to render per company */
  companyCounts?: Record<string, number>;
  /** Label shown under heading */
  subtitle?: string;
  /** Placeholder for search input */
  searchPlaceholder?: string;
}

export function CompaniesSidebar({
  companies,
  selectedCompanyId,
  onSelectCompany,
  topItems = [],
  companyCounts = {},
  subtitle = 'Select company',
  searchPlaceholder = 'Search company...',
}: CompaniesSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilters, setCategoryFilters] = useState<FilterState | null>(DEFAULT_CATEGORY_FILTERS);
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false);

  const filteredCompanies = useMemo(() =>
    companies
      .filter(c => c.company_name?.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter(c => companyMatchesCategoryFilters(c, categoryFilters)),
    [companies, searchQuery, categoryFilters]
  );

  return (
    <div className="flex flex-col h-full border-r border-slate-200 dark:border-slate-800">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-gradient-to-b from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-custom-blue" />
            Entities
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-slate-700"
            onClick={() => setCategoryFilterOpen(true)}
            title="Filter by client category"
          >
            <Filter className="h-4 w-4" />
          </Button>
          <ClientCategoryFilter
            open={categoryFilterOpen}
            onOpenChange={setCategoryFilterOpen}
            onFilterChange={setCategoryFilters}
            initialFilters={categoryFilters}
            showSectionStatus={false}
            showOperationalStatus={true}
            hideCategoryFilterButton
          />
        </div>
        <p className="text-sm text-slate-500 mb-3">{subtitle}</p>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            placeholder={searchPlaceholder}
            className="pl-9 h-10 text-sm bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-lg"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {topItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectCompany(item.id)}
              className={cn(
                "flex items-center w-full p-2.5 text-sm rounded-lg transition-colors font-medium",
                selectedCompanyId === item.id
                  ? "bg-custom-blue text-white shadow-md"
                  : "bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700"
              )}
            >
              <Building2 className="w-4 h-4 mr-2.5 shrink-0" />
              <span className="truncate flex-1 text-left">{item.label}</span>
              <Badge variant="outline" className="text-[10px] font-semibold rounded-full px-2 py-0.5 ml-1 tabular-nums">
                {item.count}
              </Badge>
            </button>
          ))}
          {topItems.length > 0 && filteredCompanies.length > 0 && (
            <div className="h-px bg-slate-200 dark:bg-slate-700 my-2" />
          )}
          {filteredCompanies.map((company) => {
            const compId = String(company.id);
            const count = companyCounts[compId] ?? 0;
            const isSelected = selectedCompanyId === compId;
            return (
              <button
                key={compId}
                onClick={() => onSelectCompany(compId)}
                className={cn(
                  "flex items-center w-full p-2.5 text-sm rounded-lg transition-colors",
                  isSelected
                    ? "bg-custom-blue text-white font-medium shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                <Building2 className="w-4 h-4 mr-2.5 shrink-0" />
                <span className="truncate flex-1 text-left">{company.company_name}</span>
                <Badge variant="outline" className="text-[10px] font-semibold rounded-full px-2 py-0.5 ml-1 tabular-nums">
                  {count}
                </Badge>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
