import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { fetchCompanyEmployees, ContractEmployeeInfo } from '../utils/data';
import { EcJobProfile, fetchJobProfiles, fetchGlobalJobProfiles, matchJobProfile } from '../utils/jobProfileData';
import { EmploymentOffer, fetchLatestOffer } from '../utils/employmentOfferData';
import { resolveEffectiveSettings } from '../utils/clauseEngine';
import { buildStandardPlaceholderValues } from '../utils/standardPlaceholders';
import { useMasterFieldValues } from '../hooks/useMasterFieldValues';
import type { EcPlaceholder } from '../utils/ecPlaceholders';
import type { JobField } from '../../master-fields/components/types/database';
import { fetchCompanies, Company } from '../../companies/database';
import { fetchSignatoryNameForCompany } from '../utils/companySettings';
import { fetchPayrollStatutoryLine } from '../utils/payrollIntegration';
import type { StatutoryDeductionsBreakdown } from '../utils/statutoryDeductions';
import { fetchClauses, EcClause } from '../utils/clauseLibraryData';
import { detectTokens } from '../utils/placeholderDetection';
import { SearchableSelect } from './SearchableSelect';
import { MasterFieldEditControl } from './MasterFieldEditControl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserRound, RotateCcw, RefreshCw, AlertCircle, FileText, CheckCircle2, Search, X, Wallet, FileSpreadsheet, Upload } from 'lucide-react';
import { generateEcContractExcel, EC_SHEET_NAME } from '../utils/ecExcelExport';
import { importEcContractExcel } from '../utils/ecExcelImport';
import { cn } from '@/lib/utils';
import { ENTITY_TYPES } from '@/lib/constants/entity-types';
import { useToast } from '@/components/ui/use-toast';

interface ContractEditorProps {
  companyId: string | null;
  employeeId: string | null;
  contractData: any;
  setContractData: (data: any) => void;
  selectedJobProfile: EcJobProfile | null;
  setSelectedJobProfile: (profile: EcJobProfile | null) => void;
}

const getSourceLabel = (
  p: Pick<EcPlaceholder, 'source_kind' | 'settings_key' | 'offer_field' | 'master_field_id' | 'master_field_links'>,
  masterFields: Map<number, JobField>
) => {
  switch (p.source_kind) {
    case 'master_field': {
      const linkedId = p.master_field_links?.[0]?.master_field_id ?? p.master_field_id;
      const field = linkedId != null ? masterFields.get(Number(linkedId)) : undefined;
      return p.settings_key || field?.label || field?.field_key || 'Not linked';
    }
    case 'settings_cascade':
      return p.settings_key || 'Profile';
    case 'job_profile':
      return p.settings_key || 'Profile';
    case 'offer':
      return p.offer_field || 'Profile';
    default:
      return 'Profile';
  }
};

export function ContractEditor({
  companyId,
  employeeId,
  contractData,
  setContractData,
  selectedJobProfile,
  setSelectedJobProfile,
}: ContractEditorProps) {
  const [employee, setEmployee] = useState<ContractEmployeeInfo | null>(null);
  const [profiles, setProfiles] = useState<EcJobProfile[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(false);
  const [signatoryName, setSignatoryName] = useState('');
  const [payrollStatutoryLine, setPayrollStatutoryLine] = useState<StatutoryDeductionsBreakdown | null>(null);
  const [dataFilter, setDataFilter] = useState<'all' | 'with' | 'missing'>('all');
  const [fieldSearch, setFieldSearch] = useState('');
  const { toast } = useToast();

  // Height of the sticky toolbar+column-header block, measured live so the
  // per-entity group headers below can stick right underneath it instead of
  // guessing a fixed pixel offset that would drift whenever the toolbar wraps
  // to a second line (mobile) or the column header row hides (below md).
  const stickyHeaderObserverRef = useRef<ResizeObserver | null>(null);
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0);
  // A callback ref rather than a plain ref + mount-only effect: the toolbar
  // block only exists once an employee is actually selected - until then this
  // component returns the "No Employee Selected"/loading placeholder, which
  // has no toolbar to measure. A mount-only effect would observe nothing in
  // that case and leave stickyHeaderHeight stuck at 0, pinning the group
  // headers to the very top of the scrollport where the toolbar (z-30) hides
  // them behind it. React re-invokes the callback ref whenever the toolbar
  // (re)mounts, so the observer always latches onto the real element.
  const stickyHeaderRef = useCallback((el: HTMLDivElement | null) => {
    stickyHeaderObserverRef.current?.disconnect();
    stickyHeaderObserverRef.current = null;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setStickyHeaderHeight(entry.contentRect.height);
    });
    observer.observe(el);
    stickyHeaderObserverRef.current = observer;
  }, []);
  useEffect(() => () => stickyHeaderObserverRef.current?.disconnect(), []);

  useEffect(() => {
    let cancelled = false;
    fetchSignatoryNameForCompany(companyId).then((name) => { if (!cancelled) setSignatoryName(name); });
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    fetchPayrollStatutoryLine(companyId, employee?.individualId).then((line) => { if (!cancelled) setPayrollStatutoryLine(line); });
    return () => { cancelled = true; };
  }, [companyId, employee?.individualId]);

  const offer: Partial<EmploymentOffer> = contractData.offer || {};
  const updateOffer = (patch: Partial<EmploymentOffer>) => {
    setContractData((prev: any) => ({ ...prev, offer: { ...(prev.offer || {}), ...patch } }));
  };

  useEffect(() => {
    async function loadData() {
      if (!companyId || !employeeId) {
        setEmployee(null);
        return;
      }
      setLoading(true);

      const [emps, companyProfiles, globalProfiles, companies] = await Promise.all([
        fetchCompanyEmployees(companyId),
        fetchJobProfiles(companyId),
        fetchGlobalJobProfiles(),
        fetchCompanies(),
      ]);
      const target = emps.find(e => String(e.individualId) === employeeId) || null;
      setEmployee(target);
      
      const hasOwnPositionProfiles = companyProfiles.some((p) => p.scope === 'position' && p.is_active);
      const jobProfiles = hasOwnPositionProfiles ? companyProfiles : [...companyProfiles, ...globalProfiles];
      setProfiles(jobProfiles);
      setCompany(companies.find((c) => String(c.id) === String(companyId)) || null);

      const matched = target ? matchJobProfile(jobProfiles, target) : null;
      setSelectedJobProfile(matched);

      const individualId = target ? target.individualId : Number(employeeId);
      const existingOffer = target ? await fetchLatestOffer(companyId, individualId) : null;

      const nextOffer: Partial<EmploymentOffer> = existingOffer || {
        job_profile_id: matched?.id,
        company_id: String(companyId),
        individual_id: individualId,
        basic_salary: target?.basicSalary || null,
        currency: 'KES',
        allowances: [],
        start_date: target?.startDate || new Date().toISOString().split('T')[0],
        end_date: null,
        settings_overrides: {},
        placeholder_overrides: {},
        status: 'draft',
      };

      setContractData((prev: any) => ({
        ...prev,
        employee: target,
        offer: nextOffer,
      }));

      setLoading(false);
    }
    loadData();
  }, [companyId, employeeId]);

  const handleProfileChange = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId) || null;
    setSelectedJobProfile(profile);
    updateOffer({ job_profile_id: profile?.id });
  };

  const handlePlaceholderOverride = (key: string, value: string | undefined) => {
    const next = { ...(offer.placeholder_overrides || {}) };
    if (value === undefined) delete next[key];
    else next[key] = value;
    updateOffer({ placeholder_overrides: next });
  };

  const handleRefreshMasterFieldValues = async () => {
    try {
      await refreshMasterFieldValues();
      toast({ title: 'Refreshed', description: 'Data & Values updated with the latest source data.' });
    } catch (err: any) {
      toast({ title: 'Refresh failed', description: err?.message || 'Could not fetch the latest values.', variant: 'destructive' });
    }
  };

  const [exportingExcel, setExportingExcel] = useState(false);
  const [importingExcel, setImportingExcel] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      await generateEcContractExcel({
        employeeName: employee?.fullName || 'Employee',
        jobProfileName: selectedJobProfile?.name || 'No Profile',
        placeholders: profileScopedPlaceholders,
        placeholderValues,
        basicSalary: offer.basic_salary,
        currency: offer.currency,
      });
      toast({ title: 'Exported', description: 'Contract fields exported to Excel.' });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err?.message || 'Could not export contract fields.', variant: 'destructive' });
    } finally {
      setExportingExcel(false);
    }
  };

  const handleImportExcel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportingExcel(true);
    try {
      const result = await importEcContractExcel(file, profileScopedPlaceholders, placeholderValues);
      if (!result) {
        toast({ title: 'Import failed', description: `"${EC_SHEET_NAME}" sheet not found — import a file exported from this page.`, variant: 'destructive' });
        return;
      }
      const offerPatch: Record<string, any> = {};
      if (Object.keys(result.placeholderOverrides).length > 0) {
        offerPatch.placeholder_overrides = { ...(offer.placeholder_overrides || {}), ...result.placeholderOverrides };
      }
      if (result.basicSalary !== undefined) offerPatch.basic_salary = result.basicSalary;
      if (result.currency !== undefined) offerPatch.currency = result.currency;
      if (Object.keys(offerPatch).length > 0) updateOffer(offerPatch);
      toast({
        title: 'Imported',
        description: `${result.fieldsChanged} field(s) updated${result.skippedLocked ? `, ${result.skippedLocked} read-only field(s) skipped` : ''}.`,
      });
    } catch (err: any) {
      toast({ title: 'Import failed', description: err?.message || 'Could not import this file.', variant: 'destructive' });
    } finally {
      setImportingExcel(false);
    }
  };

  const positionProfiles = profiles.filter(p => p.scope === 'position');
  const effectiveSettings = useMemo(() => resolveEffectiveSettings([
    selectedJobProfile, offer.settings_overrides ? { settings: offer.settings_overrides } : null,
  ]), [selectedJobProfile, offer]);

  const { ecPlaceholders, masterFieldValues, masterFields, isResolving, refresh: refreshMasterFieldValues } = useMasterFieldValues(employee?.individualId, companyId);

  const placeholderValues = useMemo(
    () => (employee ? buildStandardPlaceholderValues(employee, company, offer as EmploymentOffer, effectiveSettings, offer.placeholder_overrides, masterFieldValues, selectedJobProfile, ecPlaceholders, signatoryName, payrollStatutoryLine) : {}),
    [employee, company, offer, effectiveSettings, masterFieldValues, selectedJobProfile, ecPlaceholders, signatoryName, payrollStatutoryLine]
  );

  const [allClauses, setAllClauses] = useState<EcClause[]>([]);
  useEffect(() => { fetchClauses().then(setAllClauses); }, []);

  const profilePlaceholderKeys = useMemo(() => {
    if (!selectedJobProfile) return [];
    const clauseIds = new Set(Object.values(selectedJobProfile.section_clauses || {}));
    const profileClauses = allClauses.filter((c) => clauseIds.has(c.id));
    const keys = new Set<string>();
    for (const clause of profileClauses) {
      for (const token of detectTokens(clause.content)) keys.add(token);
    }
    return Array.from(keys);
  }, [selectedJobProfile, allClauses]);

  const profileScopedPlaceholders = useMemo(() => {
    if (!selectedJobProfile) return [];
    return ecPlaceholders.filter((p) => profilePlaceholderKeys.includes(p.key));
  }, [ecPlaceholders, selectedJobProfile, profilePlaceholderKeys]);

  const placeholderIsMissing = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of profileScopedPlaceholders) {
      const val = placeholderValues[p.key] ?? '';
      const overrideVal = offer.placeholder_overrides?.[p.key];
      const effectiveVal = overrideVal ?? val;
      map.set(p.id, !effectiveVal);
    }
    return map;
  }, [profileScopedPlaceholders, placeholderValues, offer.placeholder_overrides]);

  const missingCount = useMemo(() => profileScopedPlaceholders.filter((p) => placeholderIsMissing.get(p.id)).length, [profileScopedPlaceholders, placeholderIsMissing]);
  const withDataCount = profileScopedPlaceholders.length - missingCount;

  const dataFilteredPlaceholders = useMemo(() => {
    let result = profileScopedPlaceholders;
    if (dataFilter !== 'all') {
      result = result.filter((p) => {
        const missing = !!placeholderIsMissing.get(p.id);
        return dataFilter === 'missing' ? missing : !missing;
      });
    }
    const query = fieldSearch.trim().toLowerCase();
    if (query) {
      result = result.filter((p) =>
        p.label?.toLowerCase().includes(query) ||
        p.key?.toLowerCase().includes(query) ||
        p.group_label?.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query)
      );
    }
    return result;
  }, [profileScopedPlaceholders, dataFilter, placeholderIsMissing, fieldSearch]);

  if (!companyId || !employeeId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-slate-50 dark:bg-slate-950/50">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-full shadow-sm mb-4">
          <UserRound className="w-10 h-10 text-slate-300 dark:text-slate-700" />
        </div>
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No Employee Selected</h3>
        <p className="text-sm mt-1 max-w-sm text-center">Please select an employee from the sidebar to begin reviewing or generating a contract.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-slate-50 dark:bg-slate-950/50">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-600" />
        <p className="text-sm font-medium tracking-wide animate-pulse">Loading workspace...</p>
      </div>
    );
  }

  const entityGroups = new Map<string, { placeholders: EcPlaceholder[]; label: string }>();
  for (const p of dataFilteredPlaceholders) {
    const entity = (p.entity_type && p.entity_type.length > 0) ? p.entity_type[0] : 'none';
    if (!entityGroups.has(entity)) {
      const label = entity === 'none' ? 'General' : ENTITY_TYPES.find((t) => t.value === entity)?.label || entity;
      entityGroups.set(entity, { placeholders: [], label });
    }
    entityGroups.get(entity)!.placeholders.push(p);
  }
  const sortedEntities = Array.from(entityGroups.entries()).sort(([a], [b]) => a === 'none' ? 1 : b === 'none' ? -1 : a.localeCompare(b));

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950 relative">
      {/* Sleek Hero Header */}
      <div className="px-8 py-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-30 sticky top-0 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-inner flex items-center justify-center text-white font-bold text-lg">
            {employee?.fullName?.charAt(0) || <UserRound className="w-6 h-6" />}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {employee?.fullName}
            </h2>
            <div className="flex items-center gap-2 mt-1 text-sm text-slate-500 dark:text-slate-400">
              <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-medium border-0">
                EMP-{employee?.employeeNumber || '000000'}
              </Badge>
              <span>•</span>
              <span className="font-medium">{employee?.jobTitle || 'No Title'}</span>
              <span>•</span>
              <span>{employee?.department || 'No Dept'}</span>
            </div>
          </div>
        </div>
        <div className="w-full md:w-[340px] shrink-0">
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Job Profile Assignment</Label>
          <SearchableSelect
            value={selectedJobProfile?.id || null}
            onChange={handleProfileChange}
            placeholder="Select a job profile..."
            searchPlaceholder="Search profiles..."
            options={positionProfiles.map((p) => ({ value: p.id, label: p.company_id ? p.name : `${p.name} (Generic)` }))}
          />
        </div>
      </div>

      <ScrollArea className="flex-1 [&>[data-radix-scroll-area-viewport]>div]:!block">
        <div className="max-w-[1000px] mx-auto p-6 pb-12">

          {/* Compensation - Basic Salary & Currency get their own dedicated
              inputs (writing straight to offer.basic_salary/offer.currency)
              instead of the generic placeholder-override control below -
              basic_salary is the one figure every salary-derived value reads
              directly (the {{basic_salary}}/{{gross_salary}} tokens and the
              statutory_deductions_table PAYE/SHIF/AHL/NSSF breakdown all
              compute off offer.basic_salary itself, see
              standardPlaceholders.ts), so a placeholder_overrides string
              would only patch the displayed text in one spot and leave those
              other computations stale. See ec_placeholders' `editable`
              column comment - these two rows are deliberately not editable
              there so this card is the one place to change them. */}
          <div className="mb-6 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200/60 dark:border-slate-800 p-5">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-indigo-500" /> Compensation
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4">
              <div>
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Basic Salary</Label>
                <Input
                  type="number"
                  min={0}
                  value={offer.basic_salary ?? ''}
                  onChange={(e) => updateOffer({ basic_salary: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="e.g. 120000"
                  className="h-11 text-[15px] px-3.5"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Currency</Label>
                <select
                  value={offer.currency || 'KES'}
                  onChange={(e) => updateOffer({ currency: e.target.value })}
                  className="h-11 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 text-[15px] text-slate-900 dark:text-slate-100"
                >
                  {['KES', 'USD', 'GBP', 'EUR'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Sticky toolbar + column header block - pinned to the top of the
              ScrollArea's own scrollport while reviewing a long field list.
              Height is measured (see stickyHeaderRef) so the per-entity group
              headers further down know exactly how far to stick below it. */}
          <div
            ref={stickyHeaderRef}
            className="sticky top-0 z-30 -mx-6 px-6 pb-2 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm"
          >
          {/* Toolbar: Stats & Filters */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-1 pb-4">
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-500" /> Contract Fields
              </h3>
              <p className="text-sm text-slate-500 mt-1">Review and override placeholders resolved for this document.</p>
            </div>

            <div className="flex items-center gap-4">
              {/* Field search */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  placeholder="Search fields..."
                  className="h-9 w-48 pl-9 pr-8 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm"
                />
                {fieldSearch && (
                  <button
                    onClick={() => setFieldSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Modern Segmented Control */}
              <div className="p-1 bg-slate-200/50 dark:bg-slate-800/80 rounded-lg inline-flex items-center shadow-inner">
                {([
                  { key: 'all', label: 'All Fields', count: profileScopedPlaceholders.length },
                  { key: 'with', label: 'With Data', count: withDataCount },
                  { key: 'missing', label: 'Missing', count: missingCount },
                ] as const).map((tab) => {
                  const isActive = dataFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setDataFilter(tab.key)}
                      className={cn(
                        "px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2",
                        isActive 
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm" 
                          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                      )}
                    >
                      {tab.label}
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-bold", 
                        isActive 
                          ? (tab.key === 'missing' && tab.count > 0 ? "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400" : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300") 
                          : "bg-transparent text-inherit"
                      )}>
                        {tab.count}
                      </span>
                    </button>
                  )
                })}
              </div>

              <button
                onClick={handleRefreshMasterFieldValues}
                disabled={isResolving}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-600 bg-white dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm disabled:opacity-50"
                title="Refresh master field values"
              >
                <RefreshCw className={cn("w-4 h-4", isResolving && "animate-spin text-indigo-500")} />
              </button>

              <button
                onClick={handleExportExcel}
                disabled={exportingExcel || profileScopedPlaceholders.length === 0}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-600 bg-white dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm disabled:opacity-50"
                title="Export contract fields to Excel"
              >
                {exportingExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              </button>
              <button
                onClick={() => importFileRef.current?.click()}
                disabled={importingExcel}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-600 bg-white dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm disabled:opacity-50"
                title="Import contract fields from Excel"
              >
                {importingExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              </button>
              <input ref={importFileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportExcel} />
            </div>
          </div>

          {/* Column definitions header - only when there's a list to label */}
          {profileScopedPlaceholders.length > 0 && dataFilteredPlaceholders.length > 0 && (
            <div className="hidden md:grid grid-cols-[35%_20%_1fr] gap-4 px-4 py-2 border-b border-slate-200 dark:border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-400">
              <div>Placeholder Field</div>
              <div>Data Source</div>
              <div>Resolved Output</div>
            </div>
          )}
          </div>

          {/* Empty States */}
          {profileScopedPlaceholders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 bg-white/50 dark:bg-slate-900/30 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl">
              <FileText className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-4" />
              <h4 className="text-slate-700 dark:text-slate-300 font-medium">No Fields Available</h4>
              <p className="text-sm text-slate-500 mt-1">
                {selectedJobProfile ? 'This profile\'s clauses don\'t reference any dynamic placeholders.' : 'Select a job profile above to load required contract fields.'}
              </p>
            </div>
          ) : dataFilteredPlaceholders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 bg-white/50 dark:bg-slate-900/30 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl">
              <CheckCircle2 className="w-12 h-12 text-emerald-400/50 mb-4" />
              <h4 className="text-slate-700 dark:text-slate-300 font-medium">You're All Set</h4>
              <p className="text-sm text-slate-500 mt-1">
                {fieldSearch.trim()
                  ? `No fields match "${fieldSearch.trim()}".`
                  : dataFilter === 'missing' ? 'Awesome! No fields are missing data.' : 'No matching fields found for this filter.'}
              </p>
            </div>
          ) : (
            
            /* Main Content List */
            <div className="space-y-8 mt-4">
              {sortedEntities.map(([entityKey, group]) => (
                <div key={entityKey} className="space-y-3">

                  {/* Entity Group Header - sticks directly below the toolbar
                      block above, whose live-measured height is stickyHeaderHeight */}
                  <div
                    className="flex items-center gap-3 sticky z-20 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-md py-2 shadow-[0_1px_0_0_rgba(0,0,0,0.03)] dark:shadow-none"
                    style={{ top: stickyHeaderHeight }}
                  >
                    <h4 className="text-sm font-bold tracking-wide text-slate-800 dark:text-slate-200 uppercase">
                      {group.label}
                    </h4>
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
                  </div>

                  {/* Rows Container */}
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200/60 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                    {group.placeholders.map((p) => {
                      const val = placeholderValues[p.key] ?? '';
                      const overrideVal = offer.placeholder_overrides?.[p.key];
                      const isOverridden = overrideVal !== undefined;
                      const effectiveVal = overrideVal ?? val;
                      const isMissing = !effectiveVal;

                      return (
                        <PlaceholderRow 
                          key={p.id}
                          placeholder={p}
                          value={val}
                          overrideValue={overrideVal}
                          isMissing={isMissing}
                          isOverridden={isOverridden}
                          masterFields={masterFields}
                          employee={employee}
                          companyId={companyId}
                          onOverride={(v) => handlePlaceholderOverride(p.key, v)}
                          onRefresh={refreshMasterFieldValues}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ----------------------------------------------------------------------
// Extracted Sub-Component for Sleeker Row Rendering
// ----------------------------------------------------------------------

function PlaceholderRow({
  placeholder: p,
  value,
  overrideValue,
  isMissing,
  isOverridden,
  masterFields,
  employee,
  companyId,
  onOverride,
  onRefresh
}: {
  placeholder: EcPlaceholder;
  value: string;
  overrideValue: string | undefined;
  isMissing: boolean;
  isOverridden: boolean;
  masterFields: Map<number, JobField>;
  employee: ContractEmployeeInfo | null;
  companyId: string | null;
  onOverride: (val: string | undefined) => void;
  onRefresh: () => void;
}) {
  const effectiveVal = overrideValue ?? value;
  const sourceLabel = getSourceLabel(p, masterFields);

  return (
    <div className={cn(
      "grid grid-cols-1 md:grid-cols-[35%_20%_1fr] gap-4 p-5 items-center transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 group relative overflow-hidden",
      isMissing && p.required ? "bg-rose-50/30 dark:bg-rose-900/10" : ""
    )}>
      
      {/* Visual Status Indicator (Left Bar) */}
      <div className={cn(
        "absolute left-0 top-0 bottom-0 w-[3px]",
        isMissing ? (p.required ? "bg-rose-500" : "bg-amber-400") :
        isOverridden ? "bg-indigo-500" : "bg-transparent"
      )} />

      {/* Column 1: Field Label & Status */}
      <div className="flex flex-col gap-1 pr-2 pl-2">
        <div className="flex items-center gap-2">
          {isMissing && (
            <AlertCircle className={cn(
              "w-4 h-4 shrink-0", 
              p.required ? "text-rose-500 animate-pulse" : "text-amber-500"
            )} />
          )}
          <Label className={cn(
            "text-sm font-semibold truncate",
            isMissing && p.required ? "text-rose-900 dark:text-rose-200" : "text-slate-700 dark:text-slate-200"
          )} title={p.label}>
            {p.label}
          </Label>
        </div>
        <div className="flex gap-2">
          {isOverridden && (
            <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider h-5 px-1.5 rounded bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30">
              Modified
            </Badge>
          )}
          <span className="text-xs text-slate-400 font-mono">{`{{${p.key}}}`}</span>
        </div>
      </div>

      {/* Column 2: Data Source Tag */}
      <div className="hidden md:flex items-center">
        <span className={cn(
          "px-2.5 py-1 rounded-md text-xs font-medium truncate max-w-full inline-flex items-center gap-1.5 border",
          p.source_kind === 'master_field' ? "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" :
          p.source_kind === 'settings_cascade' ? "bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800" :
          p.source_kind === 'offer' ? "bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800" :
          p.source_kind === 'job_profile' ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800" :
          "bg-gray-50 text-gray-500 border-gray-100 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700"
        )} title={sourceLabel}>
          {sourceLabel}
        </span>
      </div>

      {/* Column 3: Value Control */}
      <div className="flex items-center gap-3">
        {p.editable ? (
          <Input
            className={cn(
              "h-11 text-[15px] px-3.5 transition-all rounded-lg flex-1 border-transparent hover:border-slate-300 focus:border-indigo-500 shadow-none focus:shadow-sm bg-slate-50 dark:bg-slate-950 dark:hover:border-slate-700",
              isOverridden && "border-indigo-200 bg-indigo-50/30 text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-900/10 dark:text-indigo-100",
              isMissing && (p.required
                ? "border-rose-200 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-900/10"
                : "border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-900/10")
            )}
            value={effectiveVal}
            onChange={(e) => onOverride(e.target.value)}
            placeholder={p.required ? "Value is required..." : "Optional / Leave blank"}
          />
        ) : (
          <div className={cn(
            "flex-1 min-h-[44px] flex items-center px-3.5 rounded-lg",
            isMissing
              ? (p.required ? "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400" : "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400")
              : "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200"
          )}>
            <span className="text-[15px] truncate">
              {effectiveVal || (
                <span className="italic opacity-70">
                  {p.required ? 'Missing (Required)' : 'No value computed'}
                </span>
              )}
            </span>
          </div>
        )}

        {/* Supplementary Actions */}
        <div className="flex items-center justify-end shrink-0 w-[80px] gap-1">
          {p.source_kind === 'master_field' && (
            <MasterFieldEditControl
              placeholder={p}
              masterFields={masterFields}
              individualId={employee?.individualId}
              companyId={companyId}
              currentValue={value}
              onSaved={onRefresh}
            />
          )}

          {p.editable && isOverridden ? (
            <button
              type="button"
              title="Revert to computed default"
              onClick={() => onOverride(undefined)}
              className="w-9 h-9 flex items-center justify-center rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-900/30 dark:hover:border-rose-900/50 transition-colors shadow-sm"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-9 h-9" /> // Spacer for alignment consistency
          )}
        </div>
      </div>
    </div>
  );
}