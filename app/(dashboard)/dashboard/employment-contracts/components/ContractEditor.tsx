import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchCompanyEmployees, ContractEmployeeInfo } from '../utils/data';
import { EcJobProfile, fetchJobProfiles, matchJobProfile, findCompanyDefaults, findDepartmentDefaults } from '../utils/jobProfileData';
import { EmploymentOffer, fetchLatestOffer } from '../utils/employmentOfferData';
import { EcClause, fetchClauses } from '../utils/clauseLibraryData';
import { resolveEffectiveClauses, resolveEffectiveSettings } from '../utils/clauseEngine';
import { buildStandardPlaceholderValues } from '../utils/standardPlaceholders';
import { useMasterFieldValues } from '../hooks/useMasterFieldValues';
import type { EcPlaceholder } from '../utils/ecPlaceholders';
import { CONTRACT_SECTIONS } from '../utils/contractStructure';
import { fetchCompanies, Company } from '../../companies/database';
import { SearchableSelect } from './SearchableSelect';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, Settings2, UserRound, Briefcase,
  ChevronDown, MapPin, ClipboardList, Clock, Banknote, Heart,
  ShieldCheck, Umbrella, CheckSquare, BarChart, FileText, CheckCircle, FileSignature, Folder,
  ExternalLink, Star, RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContractEditorProps {
  companyId: string | null;
  employeeId: string | null;
  contractData: any;
  setContractData: (data: any) => void;
  selectedJobProfile: EcJobProfile | null;
  setSelectedJobProfile: (profile: EcJobProfile | null) => void;
}

// Helper to map section keys to the corresponding icons shown in the design
const getSectionIcon = (key: string) => {
  const iconProps = { className: "w-[18px] h-[18px] text-slate-400" };
  switch (key) {
    case 'parties': return <UserRound {...iconProps} className="w-[18px] h-[18px] text-blue-500" />;
    case 'appointment': return <Briefcase {...iconProps} className="w-[18px] h-[18px] text-emerald-500" />;
    case 'place_of_work': return <MapPin {...iconProps} className="w-[18px] h-[18px] text-indigo-500" />;
    case 'duties': return <ClipboardList {...iconProps} className="w-[18px] h-[18px] text-rose-400" />;
    case 'working_hours': return <Clock {...iconProps} className="w-[18px] h-[18px] text-amber-500" />;
    case 'remuneration': return <Banknote {...iconProps} className="w-[18px] h-[18px] text-emerald-500" />;
    case 'benefits': return <Heart {...iconProps} className="w-[18px] h-[18px] text-orange-400" />;
    case 'deductions': return <ShieldCheck {...iconProps} className="w-[18px] h-[18px] text-emerald-500" />;
    case 'leave': return <Umbrella {...iconProps} className="w-[18px] h-[18px] text-teal-500" />;
    case 'obligations': return <CheckSquare {...iconProps} className="w-[18px] h-[18px] text-emerald-500" />;
    case 'performance': return <BarChart {...iconProps} className="w-[18px] h-[18px] text-blue-400" />;
    case 'termination': return <FileText {...iconProps} className="w-[18px] h-[18px] text-blue-400" />;
    case 'general': return <CheckSquare {...iconProps} className="w-[18px] h-[18px] text-emerald-500" />;
    case 'acceptance': return <CheckCircle {...iconProps} className="w-[18px] h-[18px] text-emerald-500" />;
    case 'signatures': return <FileSignature {...iconProps} className="w-[18px] h-[18px] text-emerald-500" />;
    case 'appendix': return <Folder {...iconProps} className="w-[18px] h-[18px] text-blue-400" />;
    default: return <FileText {...iconProps} />;
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
  const [clauses, setClauses] = useState<EcClause[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

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

      const [emps, jobProfiles, allClauses, companies] = await Promise.all([
        fetchCompanyEmployees(companyId),
        fetchJobProfiles(companyId),
        fetchClauses(),
        fetchCompanies(),
      ]);
      const target = emps.find(e => String(e.individualId) === employeeId) || null;
      setEmployee(target);
      setProfiles(jobProfiles);
      setClauses(allClauses);
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
        section_clauses_overrides: {},
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

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAllSections = () => {
    setExpandedSections((prev) =>
      prev.size === CONTRACT_SECTIONS.length ? new Set() : new Set(CONTRACT_SECTIONS.map((s) => s.key))
    );
  };

  // Overrides the clause used for a section on THIS contract only (stored on
  // the employment offer) - distinct from the Job Profile's own section
  // clause picks, which stay untouched. '__none__' clears the override so
  // resolution falls back through Job Profile -> Department -> Company -
  // and, if none of those have a pick either, the section stays unresolved
  // (no silent default-clause fallback; see resolveEffectiveClauses in
  // utils/clauseEngine.ts).
  const handleSectionClauseOverride = (sectionKey: string, value: string) => {
    const next = { ...(offer.section_clauses_overrides || {}) };
    if (value === '__none__') {
      delete next[sectionKey];
    } else {
      next[sectionKey] = value;
    }
    updateOffer({ section_clauses_overrides: next });
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

  const clausesById = useMemo(() => Object.fromEntries(clauses.map(c => [c.id, c])), [clauses]);
  const companyDefaults = useMemo(() => companyId ? findCompanyDefaults(profiles, companyId) : undefined, [profiles, companyId]);
  const departmentDefaults = useMemo(() => companyId ? findDepartmentDefaults(profiles, companyId, employee?.department) : undefined, [profiles, companyId, employee]);

  const effectiveSettings = useMemo(() => resolveEffectiveSettings([
    companyDefaults, departmentDefaults, selectedJobProfile, offer.settings_overrides ? { settings: offer.settings_overrides } : null,
  ]), [companyDefaults, departmentDefaults, selectedJobProfile, offer]);

  const effectiveClauses = useMemo(() => resolveEffectiveClauses([
    companyDefaults, departmentDefaults, selectedJobProfile, offer.section_clauses_overrides ? { section_clauses: offer.section_clauses_overrides } : null,
  ]), [companyDefaults, departmentDefaults, selectedJobProfile, offer]);

  // Temporary diagnostic logging for the clause-resolution cascade - remove
  // once the no-default-fallback behavior is confirmed working end to end.
  useEffect(() => {
    console.log('[ContractEditor] clause resolution', {
      companyDefaults_section_clauses: companyDefaults?.section_clauses,
      departmentDefaults_section_clauses: departmentDefaults?.section_clauses,
      selectedJobProfile_section_clauses: selectedJobProfile?.section_clauses,
      offer_section_clauses_overrides: offer.section_clauses_overrides,
      effectiveClauses,
      unresolvedSections: CONTRACT_SECTIONS.map((s) => s.key).filter((k) => !effectiveClauses[k]),
    });
  }, [companyDefaults, departmentDefaults, selectedJobProfile, offer, effectiveClauses]);

  const { ecPlaceholders, masterFieldValues } = useMasterFieldValues(employee?.individualId, companyId);

  // Full resolved {{token}} -> value map for the Placeholders & Values tab -
  // same computation ContractPreview.tsx uses to render the document, so
  // what's shown here always matches what will actually be generated.
  const placeholderValues = useMemo(
    () => (employee ? buildStandardPlaceholderValues(employee, company, offer as EmploymentOffer, effectiveSettings, offer.placeholder_overrides, ecPlaceholders, masterFieldValues) : {}),
    [employee, company, offer, effectiveSettings, ecPlaceholders, masterFieldValues]
  );

  const sectionRows = useMemo(() => {
    return CONTRACT_SECTIONS.map((section) => {
      const clauseId = effectiveClauses[section.key];
      const clauseLabel = clauseId ? clausesById[clauseId]?.label : undefined;
      return {
        section,
        status: clauseId ? 'Configured' : 'Not Configured',
        clauseLabel,
        clauseId,
      };
    });
  }, [effectiveClauses, clausesById]);

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
        <div className="max-w-4xl mx-auto p-6 space-y-6 pb-24">
          
          <Tabs defaultValue="setup-clauses" className="w-full">
            <TabsList className="w-full h-12 grid grid-cols-2 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl mb-6 shadow-inner">
              <TabsTrigger value="setup-clauses" className="rounded-lg text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm">Setup & Clauses</TabsTrigger>
              <TabsTrigger value="placeholders" className="rounded-lg text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm">Data & Values</TabsTrigger>
            </TabsList>

            {/* SETUP & CLAUSES TAB */}
            <TabsContent value="setup-clauses" className="space-y-6 mt-0">
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
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Sections & Clauses</h3>
                    <p className="text-xs text-slate-500 mt-1">Review and customize clauses for this specific contract</p>
                  </div>
                  <button
                    onClick={toggleAllSections}
                    className="h-8 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  >
                    {expandedSections.size === CONTRACT_SECTIONS.length ? 'Collapse All' : 'Expand All'}
                  </button>
                </div>
                <div className="p-2">
                  <div className="divide-y divide-slate-100/50 dark:divide-slate-800/30">
                    {sectionRows.map(({ section, status, clauseLabel, clauseId }, index) => {
                      let badgeStyles = "";
                      switch(status) {
                        case 'Configured': badgeStyles = "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30"; break;
                        case 'Not Configured': badgeStyles = "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 border-red-200 dark:border-red-500/30"; break;
                      }
                      const isExpanded = expandedSections.has(section.key);
                      const resolvedClause = clauseId ? clausesById[clauseId] : undefined;
                      const options = clauses.filter((c) => c.section_key === section.key);
                      const ungrouped = options.filter((c) => !c.variant_group);
                      const optionGroups = new Map<string, EcClause[]>();
                      for (const c of options) {
                        if (c.variant_group) {
                          if (!optionGroups.has(c.variant_group)) optionGroups.set(c.variant_group, []);
                          optionGroups.get(c.variant_group)!.push(c);
                        }
                      }
                      const overrideValue = offer.section_clauses_overrides?.[section.key] || '__none__';

                      return (
                        <div key={section.key} className={cn("rounded-xl my-1 overflow-hidden transition-colors", isExpanded && "bg-slate-50 dark:bg-slate-900/50")}>
                          <div
                            onClick={() => toggleSection(section.key)}
                            className="flex items-center justify-between px-4 py-3 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                            title={clauseLabel}
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                                {getSectionIcon(section.key)}
                              </div>
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                {index + 1}. {section.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-4">
                              <span className={cn("text-xs font-semibold px-2.5 py-0.5 rounded-full border", badgeStyles)}>
                                {status}
                              </span>
                              <ChevronDown className={cn("w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-transform", isExpanded && "rotate-180")} />
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="px-4 pb-4 pt-2 space-y-4 ml-[52px]">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs font-medium text-slate-500">Clause Override</Label>
                                  <Link
                                    href="/dashboard/employment-contracts/clause-library"
                                    target="_blank"
                                    className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                  >
                                    <ExternalLink className="w-3 h-3" /> Edit Library
                                  </Link>
                                </div>
                                <SearchableSelect
                                  value={overrideValue}
                                  onChange={(v) => handleSectionClauseOverride(section.key, v)}
                                  placeholder="No override"
                                  searchPlaceholder="Search clauses..."
                                  options={[
                                    { value: '__none__', label: "No override (use Job Profile / Department / Company's pick, if any)" },
                                    ...ungrouped.map((c) => ({ value: c.id, label: `${c.label}${c.is_default ? ' (default)' : ''}` })),
                                    ...Array.from(optionGroups.entries()).flatMap(([group, items]) =>
                                      items.map((c) => ({ value: c.id, label: `${c.label}${c.is_default ? ' (default)' : ''}`, group }))
                                    ),
                                  ]}
                                />
                              </div>

                              {resolvedClause ? (
                                <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
                                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                                      {resolvedClause.is_default && <Star className="w-3.5 h-3.5 text-amber-500" fill="currentColor" />}
                                      {resolvedClause.label}
                                    </p>
                                    <span className="text-xs font-mono text-slate-400 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full">{resolvedClause.clause_key}</span>
                                  </div>
                                  <div
                                    className="prose prose-sm max-w-none text-slate-600 dark:text-slate-300 max-h-60 overflow-auto scrollbar-thin scrollbar-thumb-slate-200 [&_strong]:text-slate-800 [&_strong]:dark:text-slate-100"
                                    dangerouslySetInnerHTML={{ __html: resolvedClause.content }}
                                  />
                                </div>
                              ) : (
                                <p className="text-xs text-amber-600 italic bg-amber-50 p-3 rounded-lg border border-amber-100">No clause resolved for this section.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* PLACEHOLDERS TAB */}
            <TabsContent value="placeholders" className="mt-0">
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Data & Values</h3>
                    <p className="text-xs text-slate-500 mt-1">Placeholder tokens and their resolved values for this contract.</p>
                  </div>
                  <span className="text-xs text-slate-400">{ecPlaceholders.length} placeholders</span>
                </div>
                <div className="p-6 space-y-8">
                  {ecPlaceholders.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">No placeholders registered yet. Save a clause with {'{{tokens}}'} to create them.</p>
                  ) : (() => {
                    const groups = new Map<string, EcPlaceholder[]>();
                    for (const p of ecPlaceholders) {
                      if (!groups.has(p.group_label)) groups.set(p.group_label, []);
                      groups.get(p.group_label)!.push(p);
                    }
                    return Array.from(groups.entries()).map(([groupLabel, items]) => (
                      <div key={groupLabel} className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                          {groupLabel}
                          <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800"></div>
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                          {items.map((p) => {
                            const val = placeholderValues[p.key] ?? '';
                            const overrideVal = offer.placeholder_overrides?.[p.key];
                            const isOverridden = overrideVal !== undefined;
                            return (
                              <div key={p.id} className="flex flex-col gap-1.5 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group/field border border-transparent hover:border-slate-100 dark:hover:border-slate-800">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate" title={`{{${p.key}}}`}>
                                      {p.label}
                                    </span>
                                    <span className="text-[10px] font-mono text-slate-400 shrink-0">{'{{' + p.key + '}}'}</span>
                                    {isOverridden && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Overridden"></span>}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className={cn(
                                      "text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
                                      p.source_kind === 'master_field' && "bg-slate-50 text-slate-500 border-slate-200",
                                      p.source_kind === 'settings_cascade' && "bg-blue-50 text-blue-600 border-blue-200",
                                      p.source_kind === 'offer' && "bg-purple-50 text-purple-600 border-purple-200",
                                    )}>{p.source_kind === 'master_field' ? 'Master field' : p.source_kind === 'settings_cascade' ? 'Settings' : 'Offer'}</span>
                                    {p.editable && isOverridden && (
                                      <button
                                        type="button"
                                        title="Reset to default"
                                        onClick={() => handlePlaceholderOverride(p.key, undefined)}
                                        className="text-slate-400 hover:text-red-500 opacity-0 group-hover/field:opacity-100 transition-opacity"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {p.editable ? (
                                  <Input
                                    className={cn(
                                      "h-8 text-sm transition-colors rounded-lg",
                                      isOverridden
                                        ? "border-amber-200 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-900/10 focus-visible:ring-amber-500/20"
                                        : "border-slate-200 bg-white shadow-sm focus-visible:ring-blue-500/20"
                                    )}
                                    value={overrideVal ?? val}
                                    onChange={(e) => handlePlaceholderOverride(p.key, e.target.value)}
                                    placeholder="Leave blank for default"
                                  />
                                ) : (
                                  <div className="h-8 flex items-center px-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                                    <span className="text-sm text-slate-700 dark:text-slate-300 truncate w-full">{val || '—'}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </TabsContent>
          </Tabs>

        </div>
      </ScrollArea>
    </div>
  );
}