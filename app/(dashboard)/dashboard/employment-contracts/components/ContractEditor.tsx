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
import { Loader2, Settings2, UserRound, RotateCcw, RefreshCw } from 'lucide-react';
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

  // Overrides a single {{token}} value for THIS contract only. Passing
  // `value === undefined` clears the override (falls back to the computed
  // default from buildStandardPlaceholderValues) - an explicit empty string
  // is kept as-is, since "blank this field out on the document" is a valid
  // deliberate choice distinct from "no override set".
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

  // Full resolved {{token}} -> value map for the Placeholders & Values tab -
  // same computation ContractPreview.tsx uses to render the document, so
  // what's shown here always matches what will actually be generated.
  const placeholderValues = useMemo(
    () => (employee ? buildStandardPlaceholderValues(employee, company, offer as EmploymentOffer, effectiveSettings, offer.placeholder_overrides, masterFieldValues) : {}),
    [employee, company, offer, effectiveSettings, masterFieldValues]
  );

  // Fetch clauses for profile-scoped placeholder filtering
  const [allClauses, setAllClauses] = useState<EcClause[]>([]);
  useEffect(() => {
    fetchClauses().then(setAllClauses);
  }, []);

  // Extract placeholder keys referenced by the selected job profile's clauses
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

  // Filter ecPlaceholders to only those referenced by the profile's linked
  // clauses. Placeholders are derived FROM clause content (detectTokens
  // above), so no profile selected, or a profile with zero clauses linked,
  // both correctly mean zero placeholders apply - there's nothing to fall
  // back to showing, since the whole point is "what does THIS profile
  // actually use." profilePlaceholderKeys is already [] in both cases, so
  // filtering against it naturally yields [] without a separate branch.
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

  return (
    <div className="flex flex-col h-full bg-[#fcfdff] dark:bg-slate-950 relative overflow-hidden">
      {/* Sleek Header */}
      <div className="px-6 py-5 border-b border-slate-200/50 dark:border-slate-800/50 shrink-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl z-10 flex items-center sticky top-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-indigo-50 dark:from-blue-900/50 dark:to-indigo-900/50 flex items-center justify-center border border-blue-200/50 dark:border-blue-700/30 shadow-inner">
            <UserRound className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 tracking-tight">
              {employee?.fullName}
            </h2>
            <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5">
              <span className="font-medium text-blue-600/80 dark:text-blue-400/80">EMP-{employee?.employeeNumber || '000000'}</span>
              <span>•</span>
              <span>{employee?.jobTitle || 'No Title'}</span>
              <span>•</span>
              <span>{employee?.department || 'No Dept'}</span>
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6 space-y-6 pb-24">
          
          {/* Contract Configuration */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl shadow-sm overflow-hidden transition-all hover:shadow-md">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-blue-500" /> Contract Configuration
              </h3>
            </div>
            <div className="p-6">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-500">Job Profile Base</Label>
                <SearchableSelect
                  value={selectedJobProfile?.id || null}
                  onChange={handleProfileChange}
                  placeholder="Select a job profile..."
                  searchPlaceholder="Search job profiles..."
                  options={positionProfiles.map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>
            </div>
          </div>

          {/* Data & Values */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Data & Values</h3>
                <p className="text-xs text-slate-500 mt-1">Placeholder tokens resolved for this contract, scoped to the selected job profile.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{profileScopedPlaceholders.length} / {ecPlaceholders.length} placeholders</span>
                <button
                  onClick={refreshMasterFieldValues}
                  disabled={isResolving}
                  title="Re-resolve master field values (e.g. after linking a placeholder on the Data Sources page)"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", isResolving && "animate-spin")} />
                </button>
              </div>
            </div>
            <div className="p-6">
              {profileScopedPlaceholders.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">
                  {selectedJobProfile
                    ? 'No placeholders are referenced by this profile\'s clauses.'
                    : 'Select a job profile to see available placeholders.'}
                </p>
              ) : (() => {
                // Group by entity_type (first type listed)
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
                  <div className="space-y-5">
                    {sortedEntities.map(([entityKey, group]) => (
                      <div key={entityKey}>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-2.5">
                          {group.label}
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 rounded-full">{group.placeholders.length}</Badge>
                          <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800"></div>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                          {group.placeholders.map((p) => {
                            const val = placeholderValues[p.key] ?? '';
                            const overrideVal = offer.placeholder_overrides?.[p.key];
                            const isOverridden = overrideVal !== undefined;
                            return (
                              <div
                                key={p.id}
                                className={cn(
                                  "rounded-lg border-l-[3px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 px-3 py-2 transition-colors hover:border-slate-300 dark:hover:border-slate-700",
                                  p.source_kind === 'master_field' && "border-l-slate-300 dark:border-l-slate-600",
                                  p.source_kind === 'settings_cascade' && "border-l-blue-300 dark:border-l-blue-700",
                                  p.source_kind === 'offer' && "border-l-purple-300 dark:border-l-purple-700",
                                )}
                              >
                                <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
                                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{p.label}</span>
                                  <span className="text-[9px] font-mono text-slate-400 shrink-0">{'{{' + p.key + '}}'}</span>
                                  {isOverridden && (
                                    <Badge variant="outline" className="text-[9px] h-4 px-1 rounded-full bg-amber-50 text-amber-700 border-amber-200 shrink-0">
                                      Override
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {p.editable ? (
                                    <Input
                                      className={cn(
                                        "h-7 text-xs transition-colors rounded-md flex-1",
                                        isOverridden
                                          ? "border-amber-200 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-900/10 focus-visible:ring-amber-500/20"
                                          : "border-slate-200 bg-white shadow-sm focus-visible:ring-blue-500/20"
                                      )}
                                      value={overrideVal ?? val}
                                      onChange={(e) => handlePlaceholderOverride(p.key, e.target.value)}
                                      placeholder="Leave blank for default"
                                    />
                                  ) : (
                                    <div className="flex-1 h-7 flex items-center px-2.5 bg-slate-50 dark:bg-slate-900 rounded-md border border-slate-100 dark:border-slate-800">
                                      <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{val || '—'}</span>
                                    </div>
                                  )}
                                  {p.editable && isOverridden && (
                                    <button
                                      type="button"
                                      title="Reset to default"
                                      onClick={() => handlePlaceholderOverride(p.key, undefined)}
                                      className="text-slate-400 hover:text-red-500 shrink-0"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}