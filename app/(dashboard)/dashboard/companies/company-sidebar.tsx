// @ts-nocheck
'use client'

import { useState, useMemo } from "react"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight, Building2, Search, ChevronsUpDown, Eye, EyeOff, Star, RotateCcw, Settings, ChevronLeft, Filter, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import ClientCategoryFilter from "@/app/generic-components/ClientCategoryFilter"

// Type definitions for category filters
interface CategorySettings {
  clientStatus: Record<string, boolean>;
  sectionStatus?: Record<string, boolean>;
  operationalStatus?: Record<string, boolean>;
}

interface FilterState {
  categories: Record<string, boolean>;
  categorySettings: Record<string, CategorySettings>;
}

type Company = {
  id: string | number;
  company_name: string;
  description?: string;
  default_display?: boolean;
  registration_number?: string;
  email?: string;
  phone?: string;
  status?: string;
  order?: number;
}

interface CompanySidebarProps {
  companies: Company[];
  activeCompany: string;
  onCompanyClick: (companyId: string) => void;
  isCollapsed?: boolean;
  onCollapseToggle?: () => void;
  showDefaultDisplayOnly?: boolean;
  onToggleDefaultDisplay?: () => void;
  onCategoryFilterChange?: (filters: FilterState) => void;
  initialCategoryFilters?: FilterState | null;
  showCategoryFilter?: boolean;
}

const CATEGORY_DEFINITIONS = [
  { value: "acc", label: "ACC" },
  { value: "imm", label: "IMM" },
  { value: "audit", label: "Audit" },
  { value: "sheria", label: "Sheria" },
]

// Helper component to render index with company-specific colors
const CompanyIndexBadge = ({
  index,
  isActive,
  isDefault = false
}: {
  index: string;
  isActive: boolean;
  isDefault?: boolean;
}) => {
  return (
    <span className={cn(
      "flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium mr-2 flex-shrink-0 transition-all",
      isActive
        ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-200"
        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
    )}>
      {index}
    </span>
  )
}

// Helper component for truncated text with tooltip and company-specific styling
const CompanyTruncatedText = ({
  text,
  className = "",
  isActive = false,
  isDefault = false
}: {
  text: string;
  className?: string;
  isActive?: boolean;
  isDefault?: boolean;
}) => {
  const textColor = isActive && isDefault
    ? "text-blue-800 dark:text-blue-100"
    : isActive
      ? "text-blue-700 dark:text-blue-100"
      : isDefault
        ? "text-blue-600 dark:text-blue-200"
        : "text-gray-700 dark:text-gray-200"

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 min-w-0">
            <span className={`block whitespace-nowrap ${textColor} ${className}`}>
              {text}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p className="text-sm">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Helper function to filter companies by default display
const filterCompaniesByDefaultDisplay = <T extends { default_display?: boolean }>(items: T[], showDefaultOnly: boolean): T[] => {
  if (!showDefaultOnly) return items
  return items.filter(item => item.default_display === true)
}

// Helper function to check if company should be visible based on default display filter
const shouldShowCompany = (company: { default_display?: boolean }, showDefaultOnly: boolean): boolean => {
  if (!showDefaultOnly) return true
  return company.default_display === true
}

// Helper function to calculate status using date parsing
const calculateStatus = (fromDateStr: string | null | undefined, toDateStr: string | null | undefined): 'Active' | 'Inactive' | 'N/A' => {
  if (!fromDateStr || fromDateStr === 'N/A') return 'N/A';

  const fromDate = new Date(fromDateStr.includes('/') ? fromDateStr.split('/').reverse().join('-') : fromDateStr);
  const toDate = toDateStr && toDateStr !== 'N/A' ? new Date(toDateStr.includes('/') ? toDateStr.split('/').reverse().join('-') : toDateStr) : null;
  const now = new Date();

  if (!fromDate || isNaN(fromDate.getTime())) return 'N/A';

  // If we have a toDate, check if current date is within the range
  if (toDate && !isNaN(toDate.getTime())) {
    return (now >= fromDate && now <= toDate) ? 'Active' : 'Inactive';
  }

  // If no toDate, just check if current date is after fromDate
  return now >= fromDate ? 'Active' : 'Inactive';
};

// Operational status is derived from client status first
const calculateOperationalStatus = (clientFromDate: string | null | undefined, clientToDate: string | null | undefined, ceaseDate: string | null | undefined): 'Operational' | 'Ceased' | 'Terminated' | 'N/A' => {
  const clientStatus = calculateStatus(clientFromDate, clientToDate);

  if (clientStatus === 'N/A') return 'N/A';
  if (clientStatus === 'Inactive') return 'Terminated';
  if (ceaseDate && ceaseDate !== 'N/A') return 'Ceased';

  return 'Operational';
};

// Helper to extract cease details for a specific category
const getCeaseDetailsForCategory = (ceaseDetails: any, category: string) => {
  if (!ceaseDetails) return { ceased_date: null, cease_reason: null };

  const parsed = typeof ceaseDetails === 'string' ? JSON.parse(ceaseDetails) : ceaseDetails;

  // Handle array format
  if (Array.isArray(parsed)) {
    const item = parsed.find((item: any) => item.category === category);
    return item ? { ceased_date: item.ceased_date, cease_reason: item.cease_reason } : { ceased_date: null, cease_reason: null };
  }

  // Handle object format for backward compatibility
  return {
    ceased_date: parsed?.[category]?.ceased_date || null,
    cease_reason: parsed?.[category]?.cease_reason || null
  };
};

const matchesClientStatusFilter = (
  currentStatus: 'Active' | 'Inactive' | 'N/A',
  clientFilters?: Record<string, boolean>
) => {
  if (!clientFilters || clientFilters.All) return true
  if (currentStatus === 'N/A') return false // N/A doesn't match any specific status
  if (currentStatus === 'Inactive') {
    return !!(clientFilters.Inactive || clientFilters['Inactive (terminated)'])
  }

  return !!clientFilters[currentStatus]
}

const matchesOperationalStatusFilter = (
  currentStatus: 'Operational' | 'Ceased' | 'Terminated' | 'N/A',
  operationalFilters?: Record<string, boolean>
) => {
  if (!operationalFilters || operationalFilters.All) return true
  if (currentStatus === 'N/A') return false // N/A doesn't match any specific status
  return !!operationalFilters[currentStatus]
}

export function CompanySidebar({
  companies,
  activeCompany,
  onCompanyClick,
  isCollapsed = false,
  onCollapseToggle,
  showDefaultDisplayOnly = false,
  onToggleDefaultDisplay = () => { },
  onCategoryFilterChange,
  initialCategoryFilters = null,
  showCategoryFilter = true,
}: CompanySidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false)

  // Count default display items
  const defaultDisplayCounts = useMemo(() => {
    let totalDefault = 0
    let totalItems = 0

    companies.forEach(company => {
      totalItems++
      if (company.default_display) totalDefault++
    })

    return { totalDefault, totalItems }
  }, [companies])

  const filteredCompanies = useMemo(() => {
    // Early return if no companies
    if (!companies || companies.length === 0) {
      return [];
    }
    let comps = [...companies]

    // 1. Apply ordering
    comps = comps.sort((a, b) => (a.order || 0) - (b.order || 0))
  
    // 2. Apply default display filter
    if (showDefaultDisplayOnly) {
      const beforeDefault = comps.length;
      comps = comps.filter(company => shouldShowCompany(company, showDefaultDisplayOnly))
    }

    // 3. Apply category filtering (same logic as company-categories page)
    if (initialCategoryFilters) {
      const activeCategoryLabels = Object.entries(initialCategoryFilters.categories)
        .filter(([label, isActive]) => isActive && label !== 'All Categories')
        .map(([label]) => label);

       if (activeCategoryLabels.length > 0) {
        const beforeCategory = comps.length;
        comps = comps.filter(company => {
          return activeCategoryLabels.some(label => {
            const cat = CATEGORY_DEFINITIONS.find(category => category.label === label)
            if (!cat) return false

            // 1. Check Client Status (Active/Inactive)
            const currentStatus = calculateStatus(company[`${cat.value}_client_effective_from`], company[`${cat.value}_client_effective_to`]);
            const clientFilters = initialCategoryFilters.categorySettings[label]?.clientStatus;
            const matchesClientStatus = !clientFilters || clientFilters.All || !!clientFilters[currentStatus];

            // 2. Check Operational Status (Operational/Ceased/Terminated/N/A)
            const ceaseData = getCeaseDetailsForCategory(company.cease_details, cat.value);
            const currentOperationalStatus = calculateOperationalStatus(
              company[`${cat.value}_client_effective_from`],
              company[`${cat.value}_client_effective_to`],
              ceaseData.ceased_date
            );
            const operationalFilters = initialCategoryFilters.categorySettings[label]?.operationalStatus;
            const matchesOperationalStatus = !operationalFilters || operationalFilters.All || !!operationalFilters[currentOperationalStatus];
            const matches = matchesClientStatus && matchesOperationalStatus;
                     return matches;
          });
        });
         }
    }

    // 4. Apply search filter
    if (searchQuery.trim()) {
      const beforeSearch = comps.length;
      const query = searchQuery.toLowerCase()
      comps = comps.filter(company =>
        company.company_name.toLowerCase().includes(query) ||
        (company.registration_number && company.registration_number.toLowerCase().includes(query)) ||
        (company.email && company.email.toLowerCase().includes(query))
      )
        }
        return comps
  }, [companies, searchQuery, showDefaultDisplayOnly, initialCategoryFilters])

  // Add loading state
  const isLoading = !companies || companies.length === 0

  if (isCollapsed) {
    return (
      <div className="w-full h-full flex flex-col bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 py-4 items-center">
        <TooltipProvider delayDuration={0}>
          <div className="flex flex-col items-center gap-4 w-full px-2">
            <Button variant="ghost" size="icon" onClick={onCollapseToggle} className="h-8 w-8 text-gray-400">
              <ChevronRight size={18} />
            </Button>
            <Separator className="w-8" />
            {filteredCompanies.map((company) => (
              <Tooltip key={company.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={activeCompany === company.id.toString() ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => onCompanyClick(company.id.toString())}
                    className={cn(
                      "h-10 w-10 rounded-xl shrink-0 transition-all",
                      activeCompany === company.id.toString()
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                        : "text-gray-500 hover:bg-gray-100"
                    )}
                  >
                    <Building2 size={20} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-medium">{company.company_name}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Companies</h3>
          </div>

          <div className="flex items-center gap-1">
            {/* Category Filter Dialog */}
            {showCategoryFilter && (
              <ClientCategoryFilter
                open={categoryFilterOpen}
                onOpenChange={setCategoryFilterOpen}
                onFilterChange={onCategoryFilterChange}
                initialFilters={initialCategoryFilters}
                showSectionStatus={false}
                showOperationalStatus={true}
              />
            )}

            {/* Add Collapse Toggle Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onCollapseToggle}
              className="h-8 w-8 text-gray-400 hover:text-gray-700"
            >
              <ChevronLeft size={18} />
            </Button>

            {/* Default Display Toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showDefaultDisplayOnly ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-8 px-2 text-xs",
                      showDefaultDisplayOnly
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    )}
                    onClick={onToggleDefaultDisplay}
                  >
                    {showDefaultDisplayOnly ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm">
                    {showDefaultDisplayOnly ? 'Show All Items' : 'Show Default Only'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {defaultDisplayCounts.totalDefault} of {defaultDisplayCounts.totalItems} items marked as default
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Settings/Info Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" side="bottom" align="end">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-sm mb-2">Display Settings</h4>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center justify-between">
                        <span>Total Companies:</span>
                        <Badge variant="outline">{defaultDisplayCounts.totalItems}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Default Display:</span>
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                          <Star className="h-3 w-3 mr-1" />
                          {defaultDisplayCounts.totalDefault}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Currently Showing:</span>
                        <Badge variant="outline">
                          {showDefaultDisplayOnly ? defaultDisplayCounts.totalDefault : defaultDisplayCounts.totalItems}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <p className="text-xs text-gray-500">
                      Items marked with ★ are set as default display. Use the eye icon to toggle between showing all items or only default items.
                    </p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search companies..."
            className="pl-9 h-9 text-sm rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus-visible:ring-1 focus-visible:ring-blue-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter Status */}
        {(showDefaultDisplayOnly || searchQuery) && (
          <div className="flex items-center gap-2 flex-wrap">
            {showDefaultDisplayOnly && (
              <Badge variant="secondary" className="text-xs">
                <Star className="h-3 w-3 mr-1" />
                Default Only
              </Badge>
            )}
            {searchQuery && (
              <Badge variant="outline" className="text-xs">
                <Search className="h-3 w-3 mr-1" />
                "{searchQuery}"
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredCompanies.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
            {searchQuery ? (
              <div>
                <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No companies found for "{searchQuery}"</p>
              </div>
            ) : showDefaultDisplayOnly ? (
              <div>
                <Star className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No default display items found</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={onToggleDefaultDisplay}
                >
                  Show All Items
                </Button>
              </div>
            ) : (
              <div>
                <Building2 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No companies found</p>
              </div>
            )}
          </div>
        ) : (
          filteredCompanies.map((company, index) => {
            const isActive = activeCompany === company.id.toString()

            return (
              <div key={company.id} className="space-y-1">
                <button
                  className={cn(
                    "w-full flex items-center justify-between p-3 text-left transition-all duration-200 group relative rounded-lg",
                    isActive
                      ? company.default_display
                        ? "bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-100 font-medium shadow-sm border border-blue-200"
                        : "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-100 font-medium shadow-sm"
                      : company.default_display
                        ? "bg-blue-50/50 dark:bg-blue-900/20 text-gray-700 dark:text-gray-200 hover:bg-blue-100/70 dark:hover:bg-blue-900/40"
                        : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                  )}
                  onClick={() => onCompanyClick(company.id.toString())}
                >
                  <div className="flex items-center space-x-2">
                    <CompanyIndexBadge
                      index={`${index + 1}`}
                      isActive={isActive}
                      isDefault={company.default_display === true}
                    />
                    <div className="flex-1 min-w-0">
                      <CompanyTruncatedText
                        text={company.company_name}
                        className="font-medium text-sm"
                        isActive={isActive}
                        isDefault={company.default_display === true}
                      />
                      {company.registration_number && (
                        <CompanyTruncatedText
                          text={`Reg: ${company.registration_number}`}
                          className="text-xs text-gray-500 dark:text-gray-400"
                          isActive={isActive}
                          isDefault={company.default_display === true}
                        />
                      )}
                    </div>
                  </div>
                  {company.status && (
                    <Badge
                      variant={company.status === 'active' ? 'default' : 'secondary'}
                      className="h-5 text-xs"
                    >
                      {company.status}
                    </Badge>
                  )}
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Footer with stats when filtering */}
      {showDefaultDisplayOnly && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Showing default display items</span>
            <Badge variant="outline" className="text-xs">
              <Star className="h-3 w-3 mr-1" />
              {defaultDisplayCounts.totalDefault} / {defaultDisplayCounts.totalItems}
            </Badge>
          </div>
        </div>
      )}
    </div>
  )
}
