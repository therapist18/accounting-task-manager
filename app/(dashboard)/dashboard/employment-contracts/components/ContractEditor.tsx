import { useEffect, useMemo, useState } from 'react';
import { fetchCompanyEmployees, ContractEmployeeInfo } from '../utils/data';
import { EcJobProfile, fetchJobProfiles, matchJobProfile, findCompanyDefaults, findDepartmentDefaults } from '../utils/jobProfileData';
import { EcContractTemplate, fetchContractTemplates } from '../utils/contractTemplateData';
import { EmploymentOffer, fetchLatestOffer } from '../utils/employmentOfferData';
import { EcClause, fetchClauses } from '../utils/clauseLibraryData';
import { resolveEffectiveClauses, resolveEffectiveSettings, buildDefaultClauseMap } from '../utils/clauseEngine';
import { CONTRACT_SECTIONS, type ContractSectionKey } from '../utils/contractStructure';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2, RefreshCw, Settings2, UserRound, Briefcase, Plus, Trash2, LayoutTemplate,
  Check, ListChecks, ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContractEditorProps {
  companyId: string | null;
  employeeId: string | null;
  contractData: any;
  setContractData: (data: any) => void;
  selectedJobProfile: EcJobProfile | null;
  setSelectedJobProfile: (profile: EcJobProfile | null) => void;
  onRefreshPreview: () => void;
}

// Purely a visual progress readout - all four areas below render together,
// nothing here gates content. "Done" is a light heuristic, not a real
// workflow gate (there's no cross-component state to know when a document
// has actually been generated from in here).
const STEPS = [
  { key: 1, title: 'Employee & Position', subtitle: 'Basic Information' },
  { key: 2, title: 'Contract Terms', subtitle: 'Configure Terms' },
  { key: 3, title: 'Sections & Clauses', subtitle: 'Review & Adjust' },
  { key: 4, title: 'Preview & Generate', subtitle: 'Preview Contract' },
] as const;

export function ContractEditor({
  companyId,
  employeeId,
  contractData,
  setContractData,
  selectedJobProfile,
  setSelectedJobProfile,
  onRefreshPreview
}: ContractEditorProps) {
  const [employee, setEmployee] = useState<ContractEmployeeInfo | null>(null);
  const [profiles, setProfiles] = useState<EcJobProfile[]>([]);
  const [templates, setTemplates] = useState<EcContractTemplate[]>([]);
  const [clauses, setClauses] = useState<EcClause[]>([]);
  const [loading, setLoading] = useState(false);
  const [settingsRows, setSettingsRows] = useState<{ key: string; value: string }[]>([]);

  const offer: Partial<EmploymentOffer> = contractData.offer || {};
  const updateOffer = (patch: Partial<EmploymentOffer>) => {
    setContractData((prev: any) => ({ ...prev, offer: { ...(prev.offer || {}), ...patch } }));
  };

  const [allowanceRows, setAllowanceRows] = useState<{ label: string; amount: string }[]>([]);

  useEffect(() => {
    async function loadData() {
      if (!companyId || !employeeId) {
        setEmployee(null);
        return;
      }
      setLoading(true);

      const [emps, jobProfiles, companyTemplates, allClauses] = await Promise.all([
        fetchCompanyEmployees(companyId),
        fetchJobProfiles(companyId),
        fetchContractTemplates(companyId),
        fetchClauses(),
      ]);
      const target = emps.find(e => String(e.individualId) === employeeId) || null;
      setEmployee(target);
      setProfiles(jobProfiles);
      setTemplates(companyTemplates);
      setClauses(allClauses);

      const matched = target ? matchJobProfile(jobProfiles, target) : null;
      setSelectedJobProfile(matched);

      // Pick the effective template: company is_default -> any company -> platform is_default -> any platform
      const companyDefault = companyTemplates.find(t => t.company_id === String(companyId) && t.is_default);
      const companyAny = companyTemplates.find(t => t.company_id === String(companyId));
      const platformDefault = companyTemplates.find(t => !t.company_id && t.is_default);
      const effectiveTemplate = companyDefault || companyAny || platformDefault || companyTemplates[0] || null;

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
        status: 'draft',
      };

      setSettingsRows(Object.entries(nextOffer.settings_overrides || {}).map(([key, value]) => ({ key, value: String(value) })));
      setAllowanceRows(
        Array.isArray(nextOffer.allowances)
          ? nextOffer.allowances.map((a: any) => ({ label: a.label || '', amount: a.amount != null ? String(a.amount) : '' }))
          : []
      );
      setContractData((prev: any) => ({
        ...prev,
        employee: target,
        offer: nextOffer,
        selectedTemplateId: prev.selectedTemplateId || effectiveTemplate?.id || null,
      }));

      setLoading(false);
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, employeeId]);

  // Keep the offer's job_profile_id in sync when the profile is switched manually.
  const handleProfileChange = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId) || null;
    setSelectedJobProfile(profile);
    updateOffer({ job_profile_id: profile?.id });
  };

  const handleTemplateChange = (templateId: string) => {
    setContractData((prev: any) => ({ ...prev, selectedTemplateId: templateId || null }));
  };

  const commitSettingsRows = (rows: { key: string; value: string }[]) => {
    setSettingsRows(rows);
    updateOffer({ settings_overrides: Object.fromEntries(rows.filter(r => r.key.trim()).map(r => [r.key.trim(), r.value])) });
  };

  const commitAllowanceRows = (rows: { label: string; amount: string }[]) => {
    setAllowanceRows(rows);
    updateOffer({
      allowances: rows
        .filter(r => r.label.trim())
        .map(r => ({ label: r.label.trim(), amount: r.amount ? Number(r.amount) : undefined })),
    });
  };

  const activeTemplate = templates.find(t => t.id === contractData.selectedTemplateId) || templates[0] || null;
  const positionProfiles = profiles.filter(p => p.scope === 'position');

  // Same cascade-resolution engine ContractPreview.tsx uses for the real
  // render, so the Contract Summary + Sections & Clauses cards below show
  // exactly what will actually be generated, not an approximation.
  const clausesById = useMemo(() => Object.fromEntries(clauses.map(c => [c.id, c])), [clauses]);
  const defaultClauseMap = useMemo(() => buildDefaultClauseMap(clauses), [clauses]);
  const companyDefaults = useMemo(() => companyId ? findCompanyDefaults(profiles, companyId) : undefined, [profiles, companyId]);
  const departmentDefaults = useMemo(() => companyId ? findDepartmentDefaults(profiles, companyId, employee?.department) : undefined, [profiles, companyId, employee]);

  const effectiveSettings = useMemo(() => resolveEffectiveSettings([
    companyDefaults, departmentDefaults, selectedJobProfile, offer.settings_overrides ? { settings: offer.settings_overrides } : null,
  ]), [companyDefaults, departmentDefaults, selectedJobProfile, offer]);

  const effectiveClauses = useMemo(() => resolveEffectiveClauses([
    companyDefaults, departmentDefaults, selectedJobProfile, offer.section_clauses_overrides ? { section_clauses: offer.section_clauses_overrides } : null,
  ], defaultClauseMap), [companyDefaults, departmentDefaults, selectedJobProfile, offer, defaultClauseMap]);

  const sectionRows = useMemo(() => {
    const includedKeys = new Set(activeTemplate?.section_keys || CONTRACT_SECTIONS.map(s => s.key));
    return CONTRACT_SECTIONS.map((section) => {
      const excluded = !includedKeys.has(section.key as ContractSectionKey);
      const clauseId = effectiveClauses[section.key];
      const isConfigured = !excluded && clauseId && clauseId !== defaultClauseMap[section.key];
      const clauseLabel = clauseId ? clausesById[clauseId]?.label : undefined;
      return {
        section,
        status: excluded ? 'Excluded' : isConfigured ? 'Configured' : 'Included',
        clauseLabel,
      };
    });
  }, [activeTemplate, effectiveClauses, defaultClauseMap, clausesById]);

  const termsReady = !!(selectedJobProfile && offer.basic_salary && offer.start_date);

  if (!companyId || !employeeId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-white dark:bg-slate-900">
        <UserRound className="w-16 h-16 mb-4 text-slate-200 dark:text-slate-700" />
        <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">No Employee Selected</h3>
        <p className="text-sm">Select an employee from the sidebar to begin generating a contract.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-white dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-custom-blue" />
        <p className="text-sm">Loading context...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950 relative overflow-hidden">
      {/* Progress header - readout only, everything below is always visible */}
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
        <div className="flex items-center">
          {STEPS.map((s, i) => {
            const isDone = s.key === 1 || (s.key === 2 && termsReady) || (s.key === 3 && termsReady);
            return (
              <div key={s.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                    isDone ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                  )}>
                    {isDone ? <Check className="w-3.5 h-3.5" /> : s.key}
                  </span>
                  <span className="hidden lg:block text-left">
                    <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{s.title}</span>
                    <span className="block text-[10px] text-slate-400">{s.subtitle}</span>
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn("flex-1 h-px mx-2", isDone ? "bg-emerald-200" : "bg-slate-200 dark:bg-slate-800")} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ScrollArea className="flex-1 overflow-auto">
        <div className="flex flex-col lg:flex-row items-start gap-4 p-4 md:p-6 pb-20">

          {/* LEFT: Employee & Position + Contract Terms */}
          <div className="w-full lg:flex-1 lg:min-w-0 space-y-4">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
              <div className="flex items-center gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shrink-0">
                  <UserRound className="w-6 h-6 text-slate-500 dark:text-slate-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">{employee?.fullName}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{employee?.jobTitle || 'No position'} • {employee?.department || 'No department'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 font-medium">Employee ID</span>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{employee?.employeeNumber || 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 font-medium">Employment Type</span>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{employee?.employmentType || 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 font-medium">Work Arrangement</span>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{employee?.workArrangement || 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 font-medium">Registry Salary</span>
                  <p className="font-medium text-slate-800 dark:text-slate-200">KES {employee?.basicSalary?.toLocaleString() || 0}</p>
                </div>
              </div>
            </div>

            {/* Contract Summary - quick-glance recap of the resolved cascade */}
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-3">
                <ClipboardList className="w-4 h-4 text-custom-blue" /> Contract Summary
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-slate-500">Notice Period:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{effectiveSettings.notice_period || 'N/A'}</span></div>
                <div><span className="text-slate-500">Probation:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{effectiveSettings.probation_period || 'N/A'}</span></div>
                <div><span className="text-slate-500">Working Hours:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{[effectiveSettings.working_days, effectiveSettings.working_hours].filter(Boolean).join(' • ') || 'N/A'}</span></div>
                <div><span className="text-slate-500">Basic Salary:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{offer.currency || 'KES'} {offer.basic_salary?.toLocaleString() || 0}</span></div>
                <div><span className="text-slate-500">Pay Frequency:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{effectiveSettings.payment_frequency || 'N/A'}</span></div>
                <div><span className="text-slate-500">Contract Duration:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{offer.end_date ? `Until ${offer.end_date}` : 'Indefinite'}</span></div>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                <LayoutTemplate className="w-4 h-4 text-custom-blue" /> Contract Template
              </h3>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {templates.length === 0 ? 'No templates configured for this company yet' : 'Controls which sections appear and the visual theme'}
                </Label>
                <Select
                  value={contractData.selectedTemplateId || ''}
                  onValueChange={handleTemplateChange}
                  disabled={templates.length === 0}
                >
                  <SelectTrigger className="bg-slate-50 dark:bg-slate-950/50 h-9 border-slate-200 dark:border-slate-800">
                    <SelectValue placeholder={templates.length === 0 ? 'No templates available' : 'Select a template...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}{t.is_default ? ' (default)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {templates.length === 0 && (
                  <p className="text-xs text-slate-400">
                    Create a template under{' '}
                    <a href="/dashboard/employment-contracts/templates" className="text-custom-blue hover:underline">Manage Templates</a>
                    {' '}to control section layout and theme.
                  </p>
                )}
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                <Briefcase className="w-4 h-4 text-custom-blue" /> Job Profile
              </h3>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {positionProfiles.length === 0 ? 'No profiles configured for this company yet' : 'Reusable job package this hire draws from'}
                </Label>
                <Select value={selectedJobProfile?.id || ''} onValueChange={handleProfileChange}>
                  <SelectTrigger className="bg-slate-50 dark:bg-slate-950/50 h-9 border-slate-200 dark:border-slate-800">
                    <SelectValue placeholder="Select a job profile..." />
                  </SelectTrigger>
                  <SelectContent>
                    {positionProfiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!selectedJobProfile && positionProfiles.length > 0 && (
                  <p className="text-xs text-amber-600">No profile auto-matched this employee's department/job title/employment type - pick one manually.</p>
                )}
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                <Settings2 className="w-4 h-4 text-custom-blue" /> Employment Offer
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Basic Salary</Label>
                  <Input
                    type="number"
                    className="h-9 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800"
                    value={offer.basic_salary ?? ''}
                    onChange={(e) => updateOffer({ basic_salary: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Currency</Label>
                  <Input
                    className="h-9 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800"
                    value={offer.currency ?? 'KES'}
                    onChange={(e) => updateOffer({ currency: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Start Date</Label>
                  <Input
                    type="date"
                    className="h-9 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800"
                    value={offer.start_date || ''}
                    onChange={(e) => updateOffer({ start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">End Date</Label>
                  <Input
                    type="date"
                    className="h-9 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800"
                    value={offer.end_date || ''}
                    onChange={(e) => updateOffer({ end_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Allowances</Label>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => commitAllowanceRows([...allowanceRows, { label: '', amount: '' }])}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                </div>
                <div className="space-y-2">
                  {allowanceRows.map((row, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        className="h-8 text-xs flex-[2]"
                        placeholder="Allowance name (e.g. Housing Allowance)"
                        value={row.label}
                        onChange={(e) => commitAllowanceRows(allowanceRows.map((r, ri) => ri === i ? { ...r, label: e.target.value } : r))}
                      />
                      <Input
                        type="number"
                        className="h-8 text-xs flex-1"
                        placeholder="Amount"
                        value={row.amount}
                        onChange={(e) => commitAllowanceRows(allowanceRows.map((r, ri) => ri === i ? { ...r, amount: e.target.value } : r))}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600 shrink-0" onClick={() => commitAllowanceRows(allowanceRows.filter((_, ri) => ri !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {allowanceRows.length === 0 && (
                    <p className="text-xs text-slate-400 italic">No allowances configured.</p>
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Settings overrides <span className="text-slate-400 font-normal">(only what differs from the Job Profile)</span>
                  </Label>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => commitSettingsRows([...settingsRows, { key: '', value: '' }])}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                </div>
                <div className="space-y-2">
                  {settingsRows.map((row, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        className="h-8 text-xs flex-1"
                        placeholder="key (e.g. medical_cover)"
                        value={row.key}
                        onChange={(e) => commitSettingsRows(settingsRows.map((r, ri) => ri === i ? { ...r, key: e.target.value } : r))}
                      />
                      <Input
                        className="h-8 text-xs flex-[2]"
                        placeholder="value (e.g. Medical Cover B)"
                        value={row.value}
                        onChange={(e) => commitSettingsRows(settingsRows.map((r, ri) => ri === i ? { ...r, value: e.target.value } : r))}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600 shrink-0" onClick={() => commitSettingsRows(settingsRows.filter((_, ri) => ri !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {settingsRows.length === 0 && (
                    <p className="text-xs text-slate-400 italic">No overrides - this hire inherits everything from the Job Profile as-is.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Sections & Clauses - always visible alongside the terms, not gated behind a step */}
          <div className="w-full lg:w-[300px] shrink-0 lg:sticky lg:top-0">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-1">
                <ListChecks className="w-4 h-4 text-custom-blue" /> Sections & Clauses
              </h3>
              <p className="text-xs text-slate-500 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                To change a clause selection, edit the Job Profile.
              </p>
              <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
                {sectionRows.map(({ section, status, clauseLabel }) => (
                  <div
                    key={section.key}
                    className={cn(
                      "flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs",
                      status === 'Excluded' && "opacity-50"
                    )}
                    title={clauseLabel}
                  >
                    <span className="truncate text-slate-700 dark:text-slate-200">{section.title}</span>
                    <span className={cn(
                      "text-[10px] font-semibold rounded-full px-2 py-0.5 shrink-0",
                      status === 'Configured' && "bg-amber-50 text-amber-700",
                      status === 'Included' && "bg-emerald-50 text-emerald-700",
                      status === 'Excluded' && "bg-slate-100 text-slate-500"
                    )}>
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </ScrollArea>

      {/* Floating Action Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex justify-end">
        <button
          onClick={onRefreshPreview}
          disabled={!selectedJobProfile}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Update Preview
        </button>
      </div>
    </div>
  );
}
