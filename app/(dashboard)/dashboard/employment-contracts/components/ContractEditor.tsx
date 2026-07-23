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
  Check, Edit2, ChevronDown, MapPin, ClipboardList, Clock, Banknote, Heart, 
  ShieldCheck, Umbrella, CheckSquare, BarChart, FileText, CheckCircle, FileSignature, Folder
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

const STEPS = [
  { key: 1, title: 'Employee & Position', subtitle: 'Basic Information' },
  { key: 2, title: 'Contract Terms', subtitle: 'Configure Terms' },
  { key: 3, title: 'Sections & Clauses', subtitle: 'Review & Adjust' },
  { key: 4, title: 'Preview & Generate', subtitle: 'Preview Contract' },
] as const;

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
  }, [companyId, employeeId]);

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
    <div className="flex flex-col h-full bg-[#F8F9FB] dark:bg-slate-950 relative overflow-hidden">
      {/* Progress header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 shadow-sm z-10">
        <div className="flex items-center">
          {STEPS.map((s, i) => {
            const isDone = s.key === 1 || (s.key === 2 && termsReady) || (s.key === 3 && termsReady);
            return (
              <div key={s.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-3 shrink-0">
                  <span className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors",
                    isDone ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400"
                  )}>
                    {s.key === 4 ? s.key : (isDone ? <Check className="w-4 h-4" /> : s.key)}
                  </span>
                  <span className="hidden lg:block text-left">
                    <span className={cn("block text-[13px] font-semibold", s.key === 4 ? "text-blue-700" : "text-slate-700")}>{s.title}</span>
                    <span className="block text-[11px] text-slate-400">{s.subtitle}</span>
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn("flex-1 h-[2px] mx-4", isDone ? "bg-blue-100" : "bg-slate-100")} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ScrollArea className="flex-1 overflow-auto">
        <div className="grid grid-cols-2 items-start gap-5 p-5 pb-24 mx-auto">

          {/* LEFT COLUMN: Employee, Summary, and Configuration Blocks */}
          <div className="w-full col-span-1 shrink-0 space-y-5">
            
            {/* Employee & Position Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Employee & Position</h3>
                <button className="text-[13px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1.5">
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
              </div>
              
              <div className="p-5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 overflow-hidden">
                    {/* Placeholder image representation */}
                    <UserRound className="w-7 h-7 text-slate-400" />
                  </div>
                  <div>
                    <h4 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{employee?.fullName}</h4>
                    <p className="text-[13px] text-slate-500 mt-0.5">EMP-{employee?.employeeNumber || '000000'}</p>
                    <p className="text-[13px] text-slate-500 truncate">{employee?.fullName?.toLowerCase().replace(' ', '.')}@example.com</p>
                    <p className="text-[13px] text-slate-500">+254 712 345 678</p>
                  </div>
                </div>
              </div>

              <div className="px-5 py-2">
                <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  <div className="flex justify-between items-center py-2.5">
                    <span className="text-[13px] text-slate-500">Position</span>
                    <span className="text-[13px] font-medium text-slate-900 dark:text-slate-200 text-right">{employee?.jobTitle || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5">
                    <span className="text-[13px] text-slate-500">Department</span>
                    <span className="text-[13px] font-medium text-slate-900 dark:text-slate-200 text-right">{employee?.department || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5">
                    <span className="text-[13px] text-slate-500">Employment Type</span>
                    <span className="text-[13px] font-medium text-slate-900 dark:text-slate-200 text-right">{employee?.employmentType || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5">
                    <span className="text-[13px] text-slate-500">Job Level</span>
                    <span className="text-[13px] font-medium text-slate-900 dark:text-slate-200 text-right">{employee?.jobLevel || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5">
                    <span className="text-[13px] text-slate-500">Reports To</span>
                    <span className="text-[13px] font-medium text-slate-900 dark:text-slate-200 text-right">{employee?.reportsTo || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5">
                    <span className="text-[13px] text-slate-500">Work Location</span>
                    <span className="text-[13px] font-medium text-slate-900 dark:text-slate-200 text-right">{employee?.workLocation || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5">
                    <span className="text-[13px] text-slate-500">Start Date</span>
                    <span className="text-[13px] font-medium text-slate-900 dark:text-slate-200 text-right">
                      {offer.start_date ? new Date(offer.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Contract Summary Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Contract Summary</h3>
              </div>
              <div className="px-5 py-2">
                <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  <div className="flex justify-between items-center py-3">
                    <span className="text-[13px] text-slate-500">Notice Period</span>
                    <span className="text-[13px] font-medium text-slate-900 dark:text-slate-200">{effectiveSettings.notice_period || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-[13px] text-slate-500">Probation Period</span>
                    <span className="text-[13px] font-medium text-slate-900 dark:text-slate-200">{effectiveSettings.probation_period || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-[13px] text-slate-500">Working Hours</span>
                    <span className="text-[13px] font-medium text-slate-900 dark:text-slate-200">{effectiveSettings.working_hours || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-[13px] text-slate-500">Basic Salary</span>
                    <span className="text-[13px] font-medium text-slate-900 dark:text-slate-200">{offer.currency || 'KES'} {offer.basic_salary?.toLocaleString(undefined, {minimumFractionDigits: 2}) || '0.00'}</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-[13px] text-slate-500">Pay Frequency</span>
                    <span className="text-[13px] font-medium text-slate-900 dark:text-slate-200">{effectiveSettings.payment_frequency || 'Monthly'}</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-[13px] text-slate-500">Contract Duration</span>
                    <span className="text-[13px] font-medium text-slate-900 dark:text-slate-200">{offer.end_date ? `Until ${offer.end_date}` : 'Indefinite'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Restyled Maintained Sections - Forms */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-5 space-y-5">
              
              {/* Template Select */}
              <div>
                <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-200 mb-2">Contract Template</h3>
                <Select value={contractData.selectedTemplateId || ''} onValueChange={handleTemplateChange} disabled={templates.length === 0}>
                  <SelectTrigger className="bg-slate-50/50 h-9 border-slate-200 text-[13px]">
                    <SelectValue placeholder="Select a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}{t.is_default ? ' (default)' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Job Profile Select */}
              <div>
                <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-200 mb-2">Job Profile Base</h3>
                <Select value={selectedJobProfile?.id || ''} onValueChange={handleProfileChange}>
                  <SelectTrigger className="bg-slate-50/50 h-9 border-slate-200 text-[13px]">
                    <SelectValue placeholder="Select a job profile..." />
                  </SelectTrigger>
                  <SelectContent>
                    {positionProfiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Offer Editor (Salary & Dates) */}
              <div>
                <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-200 mb-3 flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-blue-600" /> Offer Adjustments
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[12px] font-medium text-slate-500">Basic Salary</Label>
                    <Input type="number" className="h-8 text-[13px] border-slate-200" value={offer.basic_salary ?? ''} onChange={(e) => updateOffer({ basic_salary: e.target.value === '' ? null : Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px] font-medium text-slate-500">Currency</Label>
                    <Input className="h-8 text-[13px] border-slate-200" value={offer.currency ?? 'KES'} onChange={(e) => updateOffer({ currency: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px] font-medium text-slate-500">Start Date</Label>
                    <Input type="date" className="h-8 text-[13px] border-slate-200" value={offer.start_date || ''} onChange={(e) => updateOffer({ start_date: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px] font-medium text-slate-500">End Date</Label>
                    <Input type="date" className="h-8 text-[13px] border-slate-200" value={offer.end_date || ''} onChange={(e) => updateOffer({ end_date: e.target.value })} />
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* MIDDLE COLUMN: Sections & Clauses List */}
          <div className="flex-1 w-full col-span-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col h-fit lg:sticky lg:top-5">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 mb-0.5">Sections & Clauses</h3>
                <p className="text-[13px] text-slate-500">Review and customize clauses for this contract</p>
              </div>
              <button className="text-[12px] font-medium border border-slate-200 text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-50 transition-colors shrink-0">
                Expand All
              </button>
            </div>
            
            <div className="p-2">
              <div className="divide-y divide-slate-50 dark:divide-slate-800/30">
                {sectionRows.map(({ section, status, clauseLabel }, index) => {
                  let badgeStyles = "";
                  switch(status) {
                    case 'Included': badgeStyles = "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"; break;
                    case 'Configured': badgeStyles = "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"; break;
                    case 'Excluded': badgeStyles = "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"; break;
                  }

                  return (
                    <div 
                      key={section.key}
                      className={cn(
                        "flex items-center justify-between px-3 py-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer transition-colors group",
                        status === 'Excluded' && "opacity-60"
                      )}
                      title={clauseLabel}
                    >
                      <div className="flex items-center gap-4">
                        {getSectionIcon(section.key)}
                        <span className="text-[14px] font-medium text-slate-700 dark:text-slate-200 group-hover:text-slate-900">
                          {index + 1}. {section.title}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <span className={cn("text-[11px] font-semibold px-2.5 py-0.5 rounded-full", badgeStyles)}>
                          {status}
                        </span>
                        <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend Footer */}
            <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-6 text-[12px] text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Included
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Configured
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-600"></span> Excluded
              </div>
            </div>
          </div>

        </div>
      </ScrollArea>

      {/* Floating Action Bar */}
      <div className="absolute bottom-0 left-0 right-0 px-6 py-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">

        {/* Active Configurations Summary */}
        <div className="hidden xl:flex items-center gap-5 flex-1 min-w-0 pr-5 border-r border-slate-200 dark:border-slate-800">
           <span className="text-[12px] font-semibold text-slate-900 dark:text-slate-100 shrink-0">Active Configurations</span>
           <div className="flex items-center gap-5 min-w-0 overflow-hidden">
             <div className="flex items-center gap-2 min-w-0">
               <UserRound className="w-4 h-4 text-emerald-500 shrink-0" />
               <div className="flex flex-col min-w-0">
                 <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Employment Type</span>
                 <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 leading-tight truncate">{employee?.employmentType || 'N/A'}</span>
               </div>
             </div>
             <div className="flex items-center gap-2 min-w-0">
               <Briefcase className="w-4 h-4 text-amber-500 shrink-0" />
               <div className="flex flex-col min-w-0">
                 <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Job Level</span>
                 <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 leading-tight truncate">{employee?.jobLevel || 'N/A'}</span>
               </div>
             </div>
             <div className="flex items-center gap-2 min-w-0">
               <Clock className="w-4 h-4 text-blue-500 shrink-0" />
               <div className="flex flex-col min-w-0">
                 <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Working Schedule</span>
                 <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 leading-tight truncate">{effectiveSettings.working_hours || 'N/A'}</span>
               </div>
             </div>
           </div>
           <button className="ml-auto shrink-0 text-[12px] font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-md px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
             <Settings2 className="w-3.5 h-3.5 text-slate-500" /> Edit Configurations
           </button>
        </div>

        <div className="flex items-center justify-end w-full xl:w-auto shrink-0">
          <button
            onClick={onRefreshPreview}
            disabled={!selectedJobProfile}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Update Preview
          </button>
        </div>
      </div>
    </div>
  );
}