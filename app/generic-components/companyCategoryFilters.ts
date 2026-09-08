// Shared company category-filtering logic (ACC/IMM/Audit/Sheria + Active/Inactive +
// Operational/Ceased/Terminated), used everywhere a company list needs to respect the
// same ClientCategoryFilter state — company-sidebar.tsx (the canonical implementation
// this was extracted from), ContractsSidebar.tsx, and any future company picker.

export interface CategorySettings {
  clientStatus: Record<string, boolean>;
  sectionStatus?: Record<string, boolean>;
  operationalStatus?: Record<string, boolean>;
}

export interface FilterState {
  categories: Record<string, boolean>;
  categorySettings: Record<string, CategorySettings>;
}

export const CATEGORY_DEFINITIONS = [
  { value: "acc", label: "ACC" },
  { value: "imm", label: "IMM" },
  { value: "audit", label: "Audit" },
  { value: "sheria", label: "Sheria" },
] as const;

// Default filter: ACC category, Active client status, Operational status — matches
// ClientCategoryFilter's own built-in default (see its useEffect) so a consumer that
// wires this up starts in the same state the dialog would otherwise self-initialize to.
export const DEFAULT_CATEGORY_FILTERS: FilterState = {
  categories: { 'All Categories': false, ACC: true, IMM: false, Audit: false, Sheria: false },
  categorySettings: {
    ACC: {
      clientStatus: { All: false, Active: true, 'Inactive (terminated)': false, 'N/A': false },
      operationalStatus: { All: false, Operational: true, Ceased: false, Terminated: false, 'N/A': false },
    },
  },
}

export const calculateStatus = (
  fromDateStr: string | null | undefined,
  toDateStr: string | null | undefined,
): 'Active' | 'Inactive' | 'N/A' => {
  if (!fromDateStr || fromDateStr === 'N/A') return 'N/A';

  const fromDate = new Date(fromDateStr.includes('/') ? fromDateStr.split('/').reverse().join('-') : fromDateStr);
  const toDate = toDateStr && toDateStr !== 'N/A' ? new Date(toDateStr.includes('/') ? toDateStr.split('/').reverse().join('-') : toDateStr) : null;
  const now = new Date();

  if (!fromDate || isNaN(fromDate.getTime())) return 'N/A';

  if (toDate && !isNaN(toDate.getTime())) {
    return (now >= fromDate && now <= toDate) ? 'Active' : 'Inactive';
  }

  return now >= fromDate ? 'Active' : 'Inactive';
};

// Operational status is derived from client status first — inactive relationships are
// terminated, ceased is only meaningful for an otherwise-active client.
export const calculateOperationalStatus = (
  clientFromDate: string | null | undefined,
  clientToDate: string | null | undefined,
  ceaseDate: string | null | undefined,
): 'Operational' | 'Ceased' | 'Terminated' | 'N/A' => {
  const clientStatus = calculateStatus(clientFromDate, clientToDate);

  if (clientStatus === 'N/A') return 'N/A';
  if (clientStatus === 'Inactive') return 'Terminated';
  if (ceaseDate && ceaseDate !== 'N/A') return 'Ceased';

  return 'Operational';
};

export const getCeaseDetailsForCategory = (ceaseDetails: any, category: string) => {
  if (!ceaseDetails) return { ceased_date: null, cease_reason: null };

  const parsed = typeof ceaseDetails === 'string' ? JSON.parse(ceaseDetails) : ceaseDetails;

  if (Array.isArray(parsed)) {
    const item = parsed.find((entry: any) => entry.category === category);
    return item ? { ceased_date: item.ceased_date, cease_reason: item.cease_reason } : { ceased_date: null, cease_reason: null };
  }

  return {
    ceased_date: parsed?.[category]?.ceased_date || null,
    cease_reason: parsed?.[category]?.cease_reason || null,
  };
};

// The predicate itself — a company matches when it satisfies at least one selected
// category's client-status AND operational-status filters (same "any selected category"
// semantics as company-sidebar.tsx's own filteredCompanies memo).
export const companyMatchesCategoryFilters = (company: any, filters: FilterState | null | undefined): boolean => {
  if (!filters) return true;
  if (!company) return false;

  const activeCategoryLabels = Object.entries(filters.categories || {})
    .filter(([label, isActive]) => isActive && label !== 'All Categories')
    .map(([label]) => label);

  if (activeCategoryLabels.length === 0) return true;

  return activeCategoryLabels.some((label) => {
    const cat = CATEGORY_DEFINITIONS.find((category) => category.label === label);
    if (!cat) return false;

    const currentStatus = calculateStatus(company[`${cat.value}_client_effective_from`], company[`${cat.value}_client_effective_to`]);
    const clientFilters = filters.categorySettings[label]?.clientStatus;
    // The checkbox for a lapsed relationship is labeled 'Inactive (terminated)', not
    // 'Inactive' — map calculateStatus's plain 'Inactive' onto that key before lookup.
    const clientStatusKey = currentStatus === 'Inactive' ? 'Inactive (terminated)' : currentStatus;
    const matchesClientStatus = !clientFilters || clientFilters.All || !!clientFilters[clientStatusKey];
    if (!matchesClientStatus) return false;

    const ceaseData = getCeaseDetailsForCategory(company.cease_details, cat.value);
    const currentOperationalStatus = calculateOperationalStatus(
      company[`${cat.value}_client_effective_from`],
      company[`${cat.value}_client_effective_to`],
      ceaseData.ceased_date,
    );
    const operationalFilters = filters.categorySettings[label]?.operationalStatus;
    const matchesOperationalStatus = !operationalFilters || operationalFilters.All || !!operationalFilters[currentOperationalStatus];

    return matchesOperationalStatus;
  });
};
