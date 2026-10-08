import { useEffect, useMemo, useState } from 'react';
import { fetchCompanies, Company } from '../../companies/database';
import { fetchAllEmployeesGrouped, ContractEmployeeInfo } from '../utils/data';
import { Search, Building2, UserCircle, UserPlus, Loader2, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import ClientCategoryFilter from '@/app/generic-components/ClientCategoryFilter';
import {
  companyMatchesCategoryFilters,
  DEFAULT_CATEGORY_FILTERS,
  type FilterState,
} from '@/app/generic-components/companyCategoryFilters';

interface ContractsSidebarProps {
  selectedCompanyId: string | null;
  selectedEmployeeId: string | null;
  onCompanySelect: (id: string) => void;
  onSelectEmployee: (companyId: string, employeeId: string) => void;
  // Draft a contract/letter for someone who isn't in the registry (the
  // workspace's guest mode - see utils/guestPerson.ts).
  guestActive?: boolean;
  onSelectGuest?: () => void;
  // Bumped (e.g. after saving an external person to the registry) to re-fetch
  // the employee list so they show up without a page refresh.
  refreshKey?: number;
}

export function ContractsSidebar({ 
  selectedCompanyId, 
  selectedEmployeeId, 
  onCompanySelect,
  onSelectEmployee,
  guestActive = false,
  onSelectGuest,
  refreshKey = 0,
}: ContractsSidebarProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employeesByCompany, setEmployeesByCompany] = useState<Record<string, ContractEmployeeInfo[]>>({});
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [openCompanies, setOpenCompanies] = useState<Set<string>>(new Set());
  // Defaults to ACC / Active / Operational — same baseline as the other company
  // pickers (CompanySidebar) — see companyCategoryFilters.ts.
  const [categoryFilters, setCategoryFilters] = useState<FilterState | null>(DEFAULT_CATEGORY_FILTERS);
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false);

  useEffect(() => {
    async function loadCompanies() {
      setLoadingCompanies(true);
      const comps = await fetchCompanies();
      setCompanies(comps);
      setLoadingCompanies(false);
    }
    loadCompanies();
  }, []);

  // Load employees for every company up front instead of per company click.
  // Re-runs when refreshKey changes so a person saved to the registry from
  // the workspace appears under their company immediately.
  useEffect(() => {
    async function loadAllEmployees() {
      setLoadingEmployees(true);
      const grouped = await fetchAllEmployeesGrouped();
      setEmployeesByCompany(grouped);
      setLoadingEmployees(false);
    }
    loadAllEmployees();
  }, [refreshKey]);

  const handleToggleCompany = (companyId: string) => {
    const newOpen = new Set(openCompanies);
    if (newOpen.has(companyId)) {
      newOpen.delete(companyId);
      setOpenCompanies(newOpen);
      return;
    }

    newOpen.add(companyId);
    setOpenCompanies(newOpen);
    onCompanySelect(companyId);
  };

  const filteredCompanies = useMemo(() => {
    return companies
      .filter(c => c.company_name?.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter(c => companyMatchesCategoryFilters(c, categoryFilters));
  }, [companies, searchQuery, categoryFilters]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="px-5 pt-5 pb-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-custom-blue" />
            Entities
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 -mr-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md"
            onClick={() => setCategoryFilterOpen(true)}
            title="Filter by client category"
          >
            <Filter className="h-5 w-5" />
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
        <p className="text-sm text-slate-500 mb-4">Select employee for contract</p>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Search company..."
            className="pl-10 h-10 rounded-full text-base bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-custom-blue"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Guest mode entry - a contract/letter for someone who isn't in the
            registry at all. Needs an issuing company, so it stays disabled
            until one is picked. */}
        <Button
          variant="outline"
          onClick={onSelectGuest}
          disabled={!selectedCompanyId || !onSelectGuest}
          title={selectedCompanyId
            ? 'Draft a contract or letter for someone outside the registry'
            : 'Select the issuing company first'}
          className={cn(
            'w-full mt-4 h-10 justify-center gap-2 text-sm font-semibold rounded-lg transition-colors',
            guestActive
              ? 'bg-custom-blue hover:bg-custom-blue text-white shadow-sm border-transparent'
              : 'border-dashed text-slate-600 dark:text-slate-300 hover:text-custom-blue hover:border-custom-blue/50 hover:bg-slate-50 dark:hover:bg-slate-800'
          )}
        >
          <UserPlus className="w-4 h-4" />
          External person
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {loadingCompanies ? (
          <div className="flex flex-col items-center justify-center p-8 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mb-2" />
            <span className="text-base">Loading entities...</span>
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="p-4 text-center text-base text-slate-500">
            No entities found.
          </div>
        ) : (
          <div className="px-3 py-3 space-y-0.5">
            {filteredCompanies.map(company => {
              const compId = String(company.id);
              const isOpen = openCompanies.has(compId);
              const emps = employeesByCompany[compId] || [];
              const isLoadingEmps = loadingEmployees;

              return (
                <Collapsible 
                  key={compId} 
                  open={isOpen} 
                  onOpenChange={() => handleToggleCompany(compId)}
                >
                  <CollapsibleTrigger className={cn(
                    "flex items-center w-full px-3 py-2.5 text-base font-medium text-slate-700 dark:text-slate-200 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800",
                    selectedCompanyId === compId && !isOpen && "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium"
                  )}>
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                    )}
                    <span className="truncate flex-1 text-left">{company.company_name}</span>
                  </CollapsibleTrigger>
                  
                      <CollapsibleContent className="ml-[1.375rem] pl-2.5 mt-0.5 mb-2 border-l border-slate-200 dark:border-slate-800 space-y-0.5">
                    {isLoadingEmps ? (
                      <div className="flex items-center px-3 py-2 text-sm text-slate-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                        Loading employees...
                      </div>
                    ) : emps.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-slate-400 italic">
                        No employees found.
                      </div>
                    ) : (() => {
                      const isActive = (e: ContractEmployeeInfo) =>
                        (e.status || 'Active').toLowerCase() === 'active';
                      const activeEmps = emps.filter(isActive);
                      const inactiveEmps = emps.filter(e => !isActive(e));

                      const renderEmp = (emp: ContractEmployeeInfo) => {
                        const isSelected = selectedEmployeeId === String(emp.individualId) && selectedCompanyId === compId;
                        const active = isActive(emp);
                        return (
                          <div
                            key={emp.id}
                            onClick={() => onSelectEmployee(compId, String(emp.individualId))}
                            className={cn(
                              "flex items-center px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                              isSelected 
                                ? "bg-custom-blue text-white shadow-sm font-medium" 
                                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            )}
                          >
                            <UserCircle className={cn("w-5 h-5 mr-2.5 shrink-0", isSelected ? "text-white/80" : "text-slate-400")} />
                            <div className="flex-1 truncate min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-base font-medium">{emp.fullName}</span>
                                <span className={cn(
                                  "shrink-0 text-xs font-semibold px-1 py-px rounded-full leading-tight uppercase tracking-wide",
                                  isSelected
                                    ? (active ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800")
                                    : (active ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500")
                                )}>
                                  {active ? 'A' : 'I'}
                                </span>
                              </div>
                              <span className={cn(
                                "block text-sm truncate mt-0.5",
                                isSelected ? "text-blue-100" : "text-slate-400"
                              )}>
                                {emp.isGuest ? 'External person' : emp.jobTitle || 'Employee'}
                              </span>
                            </div>
                          </div>
                        );
                      };

                      return (
                        <>
                          {activeEmps.map(renderEmp)}
                          {activeEmps.length > 0 && inactiveEmps.length > 0 && (
                            <div className="flex items-center gap-2 py-2 px-3">
                              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                              <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold shrink-0">Inactive</span>
                              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                            </div>
                          )}
                          {inactiveEmps.map(renderEmp)}
                        </>
                      );
                    })()}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
