'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Search, Building2, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Company } from '../../companies/database';
import ClientCategoryFilter from '@/app/generic-components/ClientCategoryFilter';
import {
  companyMatchesCategoryFilters,
  DEFAULT_CATEGORY_FILTERS,
  type FilterState,
} from '@/app/generic-components/companyCategoryFilters';

interface CompaniesSidebarProps {
  companies: Company[];
  selectedCompanyId: string | null;
  onSelectCompany: (id: string | null) => void;
  // company_id -> engagement status, so the admin can see at a glance which
  // clients already have a saved contract vs. which are still unconfigured.
  engagementStatuses?: Record<string, 'draft' | 'active' | 'superseded'>;
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
};

export function CompaniesSidebar({ companies, selectedCompanyId, onSelectCompany, engagementStatuses = {} }: CompaniesSidebarProps) {
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
            Clients
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
        <p className="text-sm text-slate-500 mb-3">Select a client company</p>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search company..."
            className="pl-9 h-10 text-sm bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-lg"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {filteredCompanies.map((company) => {
            const compId = String(company.id);
            const isSelected = selectedCompanyId === compId;
            const status = engagementStatuses[compId];
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
                {status && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-semibold rounded-full px-2 py-0.5 ml-1 capitalize",
                      isSelected ? "bg-white/20 text-white border-white/30" : STATUS_STYLES[status]
                    )}
                  >
                    {status}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
