import { useEffect, useState } from 'react';
import { fetchCompanies, Company } from '../../companies/database';
import { fetchCompanyEmployees, ContractEmployeeInfo } from '../utils/data';
import { Search, Building2, UserCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';

interface ContractsSidebarProps {
  selectedCompanyId: string | null;
  selectedEmployeeId: string | null;
  onCompanySelect: (id: string) => void;
  onSelectEmployee: (companyId: string, employeeId: string) => void;
}

export function ContractsSidebar({ 
  selectedCompanyId, 
  selectedEmployeeId, 
  onCompanySelect,
  onSelectEmployee 
}: ContractsSidebarProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employeesByCompany, setEmployeesByCompany] = useState<Record<string, ContractEmployeeInfo[]>>({});
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingEmployeesFor, setLoadingEmployeesFor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [openCompanies, setOpenCompanies] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadCompanies() {
      setLoadingCompanies(true);
      const comps = await fetchCompanies();
      setCompanies(comps);
      setLoadingCompanies(false);
    }
    loadCompanies();
  }, []);

  const handleToggleCompany = async (companyId: string) => {
    const newOpen = new Set(openCompanies);
    if (newOpen.has(companyId)) {
      newOpen.delete(companyId);
      setOpenCompanies(newOpen);
      return;
    }
    
    newOpen.add(companyId);
    setOpenCompanies(newOpen);
    onCompanySelect(companyId);

    if (!employeesByCompany[companyId]) {
      setLoadingEmployeesFor(companyId);
      const emps = await fetchCompanyEmployees(companyId);
      setEmployeesByCompany(prev => ({ ...prev, [companyId]: emps }));
      setLoadingEmployeesFor(null);
    }
  };

  const filteredCompanies = companies.filter(c => 
    c.company_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-custom-blue" />
          Entities
        </h2>
        <p className="text-xs text-slate-500 mb-3">Select employee for contract</p>
        
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search company..." 
            className="pl-9 h-9 text-sm bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-custom-blue"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {loadingCompanies ? (
          <div className="flex flex-col items-center justify-center p-8 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mb-2" />
            <span className="text-sm">Loading entities...</span>
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-500">
            No entities found.
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredCompanies.map(company => {
              const compId = String(company.id);
              const isOpen = openCompanies.has(compId);
              const emps = employeesByCompany[compId] || [];
              const isLoadingEmps = loadingEmployeesFor === compId;

              return (
                <Collapsible 
                  key={compId} 
                  open={isOpen} 
                  onOpenChange={() => handleToggleCompany(compId)}
                >
                  <CollapsibleTrigger className={cn(
                    "flex items-center w-full p-2 text-sm rounded-md transition-colors hover:bg-slate-100 dark:hover:bg-slate-800",
                    selectedCompanyId === compId && !isOpen && "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium"
                  )}>
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                    )}
                    <span className="truncate flex-1 text-left">{company.company_name}</span>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="pl-6 pr-2 py-1 space-y-1">
                    {isLoadingEmps ? (
                      <div className="flex items-center p-2 text-xs text-slate-400">
                        <Loader2 className="w-3 h-3 animate-spin mr-2" />
                        Loading employees...
                      </div>
                    ) : emps.length === 0 ? (
                      <div className="p-2 text-xs text-slate-400 italic">
                        No employees found.
                      </div>
                    ) : (
                      emps.map(emp => {
                        const isSelected = selectedEmployeeId === String(emp.individualId) && selectedCompanyId === compId;
                        return (
                          <div
                            key={emp.id}
                            onClick={() => onSelectEmployee(compId, String(emp.individualId))}
                            className={cn(
                              "flex items-center p-2 text-xs rounded-md cursor-pointer transition-colors",
                              isSelected 
                                ? "bg-custom-blue text-white shadow-sm font-medium" 
                                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            )}
                          >
                            <UserCircle className={cn("w-4 h-4 mr-2 shrink-0", isSelected ? "text-white/80" : "text-slate-400")} />
                            <div className="flex-1 truncate">
                              <span className="block truncate">{emp.fullName}</span>
                              <span className={cn(
                                "block text-[10px] truncate",
                                isSelected ? "text-blue-100" : "text-slate-400"
                              )}>
                                {emp.jobTitle || 'Employee'}
                              </span>
                            </div>
                          </div>
                        )
                      })
                    )}
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
