import { useEffect, useMemo, useState } from 'react';
import { fetchCompanyEmployees, ContractEmployeeInfo } from '../utils/data';
import { EcJobProfile, fetchJobProfiles, matchJobProfile } from '../utils/jobProfileData';
import { EmploymentOffer, fetchLatestOffer } from '../utils/employmentOfferData';
import { resolveEffectiveSettings } from '../utils/clauseEngine';
import { buildStandardPlaceholderValues } from '../utils/standardPlaceholders';
import { useMasterFieldValues } from '../hooks/useMasterFieldValues';
import type { EcPlaceholder } from '../utils/ecPlaceholders';
import { fetchCompanies, Company } from '../../companies/database';
import { fetchClauses, EcClause } from '../utils/clauseLibraryData';
import { detectTokens } from '../utils/placeholderDetection';
import { SearchableSelect } from './SearchableSelect';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Settings2, UserRound, RotateCcw, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ENTITY_TYPES } from '@/lib/constants/entity-types';

interface ContractEditorProps {
  companyId: string | null;
  employeeId: string | null;
  contractData: any;
  setContractData: (data: any) => void;
  selectedJobProfile: EcJobProfile | null;
  setSelectedJobProfile: (profile: EcJobProfile | null) => void;
}

// Renders the specific source an admin configured for this placeholder
// (settings_key/offer_field, set via the Edit Source dialog in
// PlaceholderSources.tsx) rather than just the generic source_kind category -
// falls back to "Profile" when that specific source hasn't been set, since an
// unconfigured settings_cascade/offer placeholder still resolves off
// whatever's in the selected Job Profile/Offer record by default.
const getSourceLabel = (p: Pick<EcPlaceholder, 'source_kind' | 'settings_key' | 'offer_field'>) => {
  switch (p.source_kind) {
    case 'master_field':
      return 'Master Field';
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

      const [emps, jobProfiles, companies] = await Promise.all([
        fetchCompanyEmployees(companyId),
        fetchJobProfiles(companyId),
        fetchCompanies(),
      ]);
      const target = emps.find(e => String(e.individualId) === employeeId) || null;
      setEmployee(target);
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
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
    updateOffer({ placeholder_overrides: next });
  };

  const positionProfiles = profiles.filter(p => p.scope === 'position');

  const effectiveSettings = useMemo(() => resolveEffectiveSettings([
    selectedJobProfile, offer.settings_overrides ? { settings: offer.settings_overrides } : null,
  ]), [selectedJobProfile, offer]);

  const { ecPlaceholders, masterFieldValues, isResolving, refresh: refreshMasterFieldValues } = useMasterFieldValues(employee?.individualId, companyId);

  const placeholderValues = useMemo(
    () => (employee ? buildStandardPlaceholderValues(employee, company, offer as EmploymentOffer, effectiveSettings, offer.placeholder_overrides, masterFieldValues, selectedJobProfile) : {}),
    [employee, company, offer, effectiveSettings, masterFieldValues, selectedJobProfile]
  );

  const [allClauses, setAllClauses] = useState<EcClause[]>([]);
  useEffect(() => {
    fetchClauses().then(setAllClauses);
  }, []);

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

  if (!companyId || !employeeId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-[#F8F9FB] dark:bg-slate-900">
        <UserRound className="w-16 h-16 mb-4 text-slate-200 dark:text-slate-700" />
        <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">No Employee Selected</h3>
        <p className="text-sm">Select an employee from the sidebar to begin generating a contract.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-[#F8F9FB] dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-600" />
        <p className="text-sm">Loading context...</p>
      </div>
    );
  }

  // Calculate grouped placeholders
  const entityGroups = new Map<string, { placeholders: EcPlaceholder[]; label: string }>();
  for (const p of profileScopedPlaceholders) {
    const entity = (p.entity_type && p.entity_type.length > 0) ? p.entity_type[0] : 'none';
    if (!entityGroups.has(entity)) {
      const label = entity === 'none'
        ? 'General'
        : ENTITY_TYPES.find((t) => t.value === entity)?.label || entity;
      entityGroups.set(entity, { placeholders: [], label });
    }
    entityGroups.get(entity)!.placeholders.push(p);
  }
  const sortedEntities = Array.from(entityGroups.entries()).sort(([a], [b]) =>
    a === 'none' ? 1 : b === 'none' ? -1 : a.localeCompare(b)
  );

  return (
    <div className="flex flex-col h-full bg-[#fcfdff] dark:bg-slate-950 relative">
      {/* Sleek Header */}
      <div className="px-6 py-4 border-b border-slate-200/50 dark:border-slate-800/50 shrink-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl z-20 flex justify-between sticky top-0 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-indigo-50 dark:from-blue-900/50 dark:to-indigo-900/50 flex items-center justify-center border border-blue-200/50 dark:border-blue-700/30">
            <UserRound className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 tracking-tight leading-tight">
              {employee?.fullName}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-blue-600/80 dark:text-blue-400/80">EMP-{employee?.employeeNumber || '000000'}</span>
              <span>•</span>
              <span>{employee?.jobTitle || 'No Title'}</span>
              <span>•</span>
              <span>{employee?.department || 'No Dept'}</span>
            </div>
          </div>
        </div>
        <div className="w-full md:w-[320px] shrink-0">
          <SearchableSelect
            value={selectedJobProfile?.id || null}
            onChange={handleProfileChange}
            placeholder="Select a job profile..."
            searchPlaceholder="Search profiles..."
            options={positionProfiles.map((p) => ({ value: p.id, label: p.name }))}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-6xl mx-auto p-6 space-y-8 pb-24">
          {/* Data & Values Table Layout */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Data & Values</h3>
                <p className="text-sm text-slate-500">Document fields resolved specifically for this contract.</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="font-normal text-slate-600 dark:text-slate-400">
                  {profileScopedPlaceholders.length} / {ecPlaceholders.length} active
                </Badge>
                <button
                  onClick={refreshMasterFieldValues}
                  disabled={isResolving}
                  title="Refresh values"
                  className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("w-4 h-4", isResolving && "animate-spin")} />
                </button>
              </div>
            </div>

            {profileScopedPlaceholders.length === 0 ? (
              <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
                <p className="text-sm text-slate-500">
                  {selectedJobProfile
                    ? 'No placeholders are referenced by this profile\'s clauses.'
                    : 'Select a job profile to see available placeholders.'}
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 rounded-xl shadow-sm rounded-t-xl">
                {/* Global Table Header - stays pinned above the (also sticky)
                    entity group headers while the panel scrolls, so column
                    meaning is never lost even deep into a long list. */}
                <div className="hidden md:grid grid-cols-[220px_130px_1fr] gap-4 px-5 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200/70 dark:border-slate-800/70 rounded-t-xl text-xs font-semibold uppercase tracking-wider text-slate-500 sticky top-0 z-20 h-11">
                  <div>Field Label</div>
                  <div>Source</div>
                  <div>Resolved Value</div>
                </div>

                <div className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                  {sortedEntities.map(([entityKey, group]) => (
                    <div key={entityKey} className="relative">

                      {/* Sticky Entity Header - stacks directly below the
                          column header (top-11 matches its h-11). */}
                      <div className="sticky top-11 z-10 px-5 py-2.5 bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur-md border-b border-slate-200/70 dark:border-slate-800/70 flex items-center justify-between shadow-sm">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          {group.label}
                        </h4>
                        <span className="text-[10px] font-medium text-slate-500 bg-slate-200/50 dark:bg-slate-700/50 px-2 py-0.5 rounded-full">
                          {group.placeholders.length}
                        </span>
                      </div>

                      {/* Row Items */}
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/30">
                        {group.placeholders.map((p) => {
                          const val = placeholderValues[p.key] ?? '';
                          const overrideVal = offer.placeholder_overrides?.[p.key];
                          const isOverridden = overrideVal !== undefined;
                          // The value the contract would actually render right
                          // now (override wins, else the resolved default) -
                          // empty here means this field will render blank.
                          const effectiveVal = overrideVal ?? val;
                          const isMissing = !effectiveVal;

                          return (
                            <div
                              key={p.id}
                              className={cn(
                                "grid grid-cols-1 md:grid-cols-[220px_130px_1fr] gap-4 px-5 py-3 items-center hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors border-l-[3px]",
                                isMissing
                                  ? (p.required ? "border-l-red-400 dark:border-l-red-600" : "border-l-amber-300 dark:border-l-amber-600")
                                  : p.source_kind === 'master_field' ? "border-l-slate-300 dark:border-l-slate-600" :
                                    p.source_kind === 'settings_cascade' ? "border-l-blue-400 dark:border-l-blue-600" :
                                      p.source_kind === 'offer' ? "border-l-purple-400 dark:border-l-purple-600" :
                                        p.source_kind === 'job_profile' ? "border-l-emerald-400 dark:border-l-emerald-600" : "border-l-transparent"
                              )}
                            >
                              {/* Column 1: Field Label */}
                              <div className="flex items-center gap-2 pr-2">
                                {isMissing && (
                                  <span title={p.required ? "Missing (required)" : "Missing"}>
                                    <AlertCircle className={cn("w-3.5 h-3.5 shrink-0", p.required ? "text-red-500" : "text-amber-400")} />
                                  </span>
                                )}
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate" title={p.label}>
                                  {p.label}
                                </Label>
                                {isOverridden && (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 rounded-full bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 shrink-0">
                                    Override
                                  </Badge>
                                )}
                              </div>

                              {/* Column 2: Source */}
                              <div className="text-[13px] text-slate-500 dark:text-slate-400 hidden md:flex items-center">
                                <span className={cn(
                                  "px-2 py-0.5 rounded-md text-[11px] font-medium border truncate max-w-full",
                                  p.source_kind === 'master_field' ? "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" :
                                    p.source_kind === 'settings_cascade' ? "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50" :
                                      p.source_kind === 'offer' ? "bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/50" :
                                        p.source_kind === 'job_profile' ? "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50" :
                                          "bg-gray-50 text-gray-500 border-gray-100 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700/50"
                                )} title={getSourceLabel(p)}>
                                  {getSourceLabel(p)}
                                </span>
                              </div>

                              {/* Column 3: Value Input/Display & Reset */}
                              <div className="flex items-center gap-3">
                                {p.editable ? (
                                  <Input
                                    className={cn(
                                      "h-8 text-sm transition-colors rounded-md flex-1",
                                      isOverridden
                                        ? "border-amber-300 bg-amber-50/50 text-amber-900 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-100 focus-visible:ring-amber-500/30"
                                        : isMissing
                                        ? (p.required
                                          ? "border-red-200 bg-red-50/40 dark:border-red-900/40 dark:bg-red-900/10 focus-visible:ring-red-500/20"
                                          : "border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-900/10 focus-visible:ring-amber-500/20")
                                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus-visible:ring-blue-500/20"
                                    )}
                                    value={overrideVal ?? val}
                                    onChange={(e) => handlePlaceholderOverride(p.key, e.target.value)}
                                    placeholder="Leave blank for default"
                                  />
                                ) : (
                                  <div className={cn(
                                    "flex-1 min-h-[32px] flex items-center px-3 rounded-md border",
                                    isMissing
                                      ? (p.required
                                        ? "bg-red-50/50 border-red-200 dark:bg-red-900/10 dark:border-red-900/40"
                                        : "bg-amber-50/40 border-amber-200/70 dark:bg-amber-900/10 dark:border-amber-900/30")
                                      : "bg-slate-100/70 dark:bg-slate-900/70 border-slate-200/50 dark:border-slate-800"
                                  )}>
                                    <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
                                      {val || (
                                        <span className={cn("italic", p.required ? "text-red-400" : "text-amber-500/80")}>
                                          {p.required ? 'Missing (required)' : 'No value'}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                )}

                                <div className="w-8 shrink-0 flex justify-center">
                                  {p.editable && isOverridden && (
                                    <button
                                      type="button"
                                      title="Reset to default"
                                      onClick={() => handlePlaceholderOverride(p.key, undefined)}
                                      className="w-8 h-8 flex items-center justify-center rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:border-red-900/50 dark:hover:text-red-400 transition-all shadow-sm"
                                    >
                                      <RotateCcw className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}