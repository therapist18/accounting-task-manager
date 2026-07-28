import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchCompanyEmployees, ContractEmployeeInfo } from '../utils/data';
import { EcJobProfile, fetchJobProfiles, matchJobProfile, findCompanyDefaults, findDepartmentDefaults } from '../utils/jobProfileData';
import { EcContractTemplate, fetchContractTemplates } from '../utils/contractTemplateData';
import { EmploymentOffer, fetchLatestOffer } from '../utils/employmentOfferData';
import { EcClause, fetchClauses } from '../utils/clauseLibraryData';
import { resolveEffectiveClauses, resolveEffectiveSettings, buildDefaultClauseMap } from '../utils/clauseEngine';
import { buildStandardPlaceholderValues } from '../utils/standardPlaceholders';
import { useMasterFieldValues } from '../hooks/useMasterFieldValues';
import { CONTRACT_SECTIONS, type ContractSectionKey } from '../utils/contractStructure';
import { fetchCompanies, Company } from '../../companies/database';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, RefreshCw, Settings2, UserRound, Briefcase, Plus, Trash2, LayoutTemplate,
  Check, Edit2, ChevronDown, MapPin, ClipboardList, Clock, Banknote, Heart,
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

// Mirrors the token groups documented in utils/standardPlaceholders.ts, so
// this list stays a straightforward reflection of what that function
// actually computes rather than an independent guess at the field set.
// `editable: false` fields already have a dedicated editor elsewhere (Offer
// Adjustments) - shown here read-only to avoid two controls fighting over
// the same value.
const PLACEHOLDER_GROUPS: { title: string; fields: { key: string; label: string; editable: boolean; hint?: string }[] }[] = [
  {
    title: 'Employee Identity', fields: [
      { key: 'employee_name', label: 'Full Name', editable: true },
      { key: 'employee_first_name', label: 'First Name', editable: true },
      { key: 'employee_last_name', label: 'Last Name', editable: true },
      { key: 'employee_id', label: 'Employee ID', editable: true },
      { key: 'national_id', label: 'National ID', editable: true },
      { key: 'kra_pin', label: 'KRA PIN', editable: true },
      { key: 'nssf_number', label: 'NSSF Number', editable: true },
      { key: 'shif_number', label: 'SHIF Number', editable: true },
      { key: 'nhif_number', label: 'NHIF Number', editable: true },
      { key: 'bank_name', label: 'Bank Name', editable: true },
      { key: 'bank_branch', label: 'Bank Branch', editable: true },
      { key: 'bank_account', label: 'Bank Account', editable: true },
      { key: 'contact_email', label: 'Contact Email', editable: true },
      { key: 'contact_phone', label: 'Contact Phone', editable: true },
    ],
  },
  {
    title: 'Company Identity', fields: [
      { key: 'company_name', label: 'Company Name', editable: true },
      { key: 'company_address', label: 'Company Address', editable: true },
      { key: 'company_kra_pin', label: 'Company KRA PIN', editable: true },
      { key: 'company_email', label: 'Company Email', editable: true },
      { key: 'company_registration_number', label: 'Registration Number', editable: true },
    ],
  },
  {
    title: 'Employment Details', fields: [
      { key: 'department', label: 'Department', editable: true },
      { key: 'job_title', label: 'Job Title', editable: true },
      { key: 'employment_type', label: 'Employment Type', editable: true },
      { key: 'employment_status', label: 'Employment Status', editable: true },
      { key: 'job_level', label: 'Job Level', editable: true },
      { key: 'reports_to', label: 'Reports To', editable: true },
      { key: 'work_location', label: 'Work Location', editable: true },
      { key: 'work_arrangement', label: 'Work Arrangement', editable: true },
    ],
  },
  {
    title: 'Salary & Payment', fields: [
      { key: 'basic_salary', label: 'Basic Salary', editable: false, hint: 'Offer Adjustments' },
      { key: 'currency', label: 'Currency', editable: false, hint: 'Offer Adjustments' },
      { key: 'payment_frequency', label: 'Payment Frequency', editable: true },
      { key: 'payment_day', label: 'Payment Day', editable: true },
      { key: 'allowances', label: 'Allowances', editable: true },
    ],
  },
  {
    title: 'Dates', fields: [
      { key: 'start_date', label: 'Start Date', editable: false, hint: 'Offer Adjustments' },
      { key: 'end_date', label: 'End Date', editable: false, hint: 'Offer Adjustments' },
    ],
  },
  {
    title: 'Working Hours', fields: [
      { key: 'working_days', label: 'Working Days', editable: true },
      { key: 'working_hours', label: 'Working Hours', editable: true },
      { key: 'start_time', label: 'Start Time', editable: true },
      { key: 'end_time', label: 'End Time', editable: true },
      { key: 'break_duration', label: 'Break Duration', editable: true },
      { key: 'rest_days', label: 'Rest Days', editable: true },
      { key: 'work_mode', label: 'Work Mode', editable: true },
    ],
  },
  {
    title: 'Benefits', fields: [
      { key: 'medical_cover', label: 'Medical Cover', editable: true },
      { key: 'housing_allowance', label: 'Housing Allowance', editable: true },
      { key: 'transport_allowance', label: 'Transport Allowance', editable: true },
      { key: 'telephone_allowance', label: 'Telephone Allowance', editable: true },
      { key: 'meal_allowance', label: 'Meal Allowance', editable: true },
      { key: 'pension_scheme', label: 'Pension Scheme', editable: true },
    ],
  },
  {
    title: 'Termination & Probation', fields: [
      { key: 'notice_period', label: 'Notice Period', editable: true },
      { key: 'probation_period', label: 'Probation Period', editable: true },
      { key: 'probation_notice', label: 'Probation Notice', editable: true },
      { key: 'termination_reason', label: 'Termination Reason', editable: true },
    ],
  },
  {
    title: 'Leave', fields: [
      { key: 'annual_leave_days', label: 'Annual Leave Days', editable: true },
      { key: 'sick_leave_days', label: 'Sick Leave Days', editable: true },
      { key: 'maternity_leave_days', label: 'Maternity Leave Days', editable: true },
      { key: 'paternity_leave_days', label: 'Paternity Leave Days', editable: true },
      { key: 'compassionate_leave_days', label: 'Compassionate Leave Days', editable: true },
    ],
  },
];

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
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(false);
  const [settingsRows, setSettingsRows] = useState<{ key: string; value: string }[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [activePanelTab, setActivePanelTab] = useState<'sections' | 'placeholders'>('sections');

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

      const [emps, jobProfiles, companyTemplates, allClauses, companies] = await Promise.all([
        fetchCompanyEmployees(companyId),
        fetchJobProfiles(companyId),
        fetchContractTemplates(companyId),
        fetchClauses(),
        fetchCompanies(),
      ]);
      const target = emps.find(e => String(e.individualId) === employeeId) || null;
      setEmployee(target);
      setProfiles(jobProfiles);
      setTemplates(companyTemplates);
      setClauses(allClauses);
      setCompany(companies.find((c) => String(c.id) === String(companyId)) || null);

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
        placeholder_overrides: {},
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
  // resolution falls back through Job Profile -> Department -> Company ->
  // section default (see resolveEffectiveClauses in utils/clauseEngine.ts).
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

  const { ecPlaceholders, masterFieldValues } = useMasterFieldValues(employee?.individualId, companyId);

  // Full resolved {{token}} -> value map for the Placeholders & Values tab -
  // same computation ContractPreview.tsx uses to render the document, so
  // what's shown here always matches what will actually be generated.
  const placeholderValues = useMemo(
    () => (employee ? buildStandardPlaceholderValues(employee, company, offer as EmploymentOffer, effectiveSettings, offer.placeholder_overrides, ecPlaceholders, masterFieldValues) : {}),
    [employee, company, offer, effectiveSettings, ecPlaceholders, masterFieldValues]
  );

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
        clauseId,
        excluded,
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
    <div className="flex flex-col h-full bg-[#fcfdff] dark:bg-slate-950 relative overflow-hidden">
      {/* Sleek Header */}
      <div className="px-6 py-5 border-b border-slate-200/50 dark:border-slate-800/50 shrink-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl z-10 flex items-center justify-between sticky top-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-indigo-50 dark:from-blue-900/50 dark:to-indigo-900/50 flex items-center justify-center border border-blue-200/50 dark:border-blue-700/30 shadow-inner">
            <UserRound className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 tracking-tight">
              {employee?.fullName}
            </h2>
            <div className="flex items-center gap-2 text-[13px] text-slate-500 mt-0.5">
              <span className="font-medium text-blue-600/80 dark:text-blue-400/80">EMP-{employee?.employeeNumber || '000000'}</span>
              <span>•</span>
              <span>{employee?.jobTitle || 'No Title'}</span>
              <span>•</span>
              <span>{employee?.department || 'No Dept'}</span>
            </div>
          </div>
        </div>
        <Button
          onClick={onRefreshPreview}
          disabled={!selectedJobProfile}
          className="h-10 px-5 text-[13px] font-medium bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-md rounded-full transition-all flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Update Preview
        </Button>
      </div>

      <ScrollArea className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6 pb-24">
          
          <Tabs defaultValue="setup" className="w-full">
            <TabsList className="w-full h-12 grid grid-cols-3 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl mb-6 shadow-inner">
              <TabsTrigger value="setup" className="rounded-lg text-[13px] font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm">Setup & Details</TabsTrigger>
              <TabsTrigger value="clauses" className="rounded-lg text-[13px] font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm">Sections & Clauses</TabsTrigger>
              <TabsTrigger value="placeholders" className="rounded-lg text-[13px] font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm">Data & Values</TabsTrigger>
            </TabsList>

            {/* SETUP TAB */}
            <TabsContent value="setup" className="space-y-6 mt-0">
              {/* Contract Configuration */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl shadow-sm overflow-hidden transition-all hover:shadow-md">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-blue-500" /> Contract Configuration
                  </h3>
                </div>
                <div className="p-6 grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[12px] font-medium text-slate-500">Contract Template</Label>
                    <Select value={contractData.selectedTemplateId || ''} onValueChange={handleTemplateChange} disabled={templates.length === 0}>
                      <SelectTrigger className="h-10 text-[13px] bg-slate-50/50 dark:bg-slate-900 hover:bg-slate-50 transition-colors border-slate-200 rounded-xl">
                        <SelectValue placeholder="Select a template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}{t.is_default ? ' (default)' : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[12px] font-medium text-slate-500">Job Profile Base</Label>
                    <Select value={selectedJobProfile?.id || ''} onValueChange={handleProfileChange}>
                      <SelectTrigger className="h-10 text-[13px] bg-slate-50/50 dark:bg-slate-900 hover:bg-slate-50 transition-colors border-slate-200 rounded-xl">
                        <SelectValue placeholder="Select a job profile..." />
                      </SelectTrigger>
                      <SelectContent>
                        {positionProfiles.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Offer Adjustments */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl shadow-sm overflow-hidden transition-all hover:shadow-md">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-emerald-500" /> Offer Adjustments
                  </h3>
                </div>
                <div className="p-6 grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[12px] font-medium text-slate-500">Basic Salary</Label>
                    <Input type="number" className="h-10 text-[13px] border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white transition-colors" value={offer.basic_salary ?? ''} onChange={(e) => updateOffer({ basic_salary: e.target.value === '' ? null : Number(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[12px] font-medium text-slate-500">Currency</Label>
                    <Input className="h-10 text-[13px] border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white transition-colors" value={offer.currency ?? 'KES'} onChange={(e) => updateOffer({ currency: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[12px] font-medium text-slate-500">Start Date</Label>
                    <Input type="date" className="h-10 text-[13px] border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white transition-colors" value={offer.start_date || ''} onChange={(e) => updateOffer({ start_date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[12px] font-medium text-slate-500">End Date (Optional)</Label>
                    <Input type="date" className="h-10 text-[13px] border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white transition-colors" value={offer.end_date || ''} onChange={(e) => updateOffer({ end_date: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Employee & Summary Info */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl shadow-sm p-6 space-y-4 hover:shadow-md transition-shadow">
                  <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 pb-2">Employee Details</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center"><span className="text-[13px] text-slate-500">Employment Type</span><span className="text-[13px] font-medium text-slate-900 dark:text-slate-200">{employee?.employmentType || 'N/A'}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[13px] text-slate-500">Job Level</span><span className="text-[13px] font-medium text-slate-900 dark:text-slate-200">{employee?.jobLevel || 'N/A'}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[13px] text-slate-500">Reports To</span><span className="text-[13px] font-medium text-slate-900 dark:text-slate-200">{employee?.reportsTo || 'N/A'}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[13px] text-slate-500">Location</span><span className="text-[13px] font-medium text-slate-900 dark:text-slate-200">{employee?.workLocation || 'N/A'}</span></div>
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl shadow-sm p-6 space-y-4 hover:shadow-md transition-shadow">
                  <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 pb-2">Contract Terms Summary</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center"><span className="text-[13px] text-slate-500">Notice Period</span><span className="text-[13px] font-medium text-slate-900 dark:text-slate-200">{effectiveSettings.notice_period || 'N/A'}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[13px] text-slate-500">Probation Period</span><span className="text-[13px] font-medium text-slate-900 dark:text-slate-200">{effectiveSettings.probation_period || 'N/A'}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[13px] text-slate-500">Working Hours</span><span className="text-[13px] font-medium text-slate-900 dark:text-slate-200">{effectiveSettings.working_hours || 'N/A'}</span></div>
                    <div className="flex justify-between items-center"><span className="text-[13px] text-slate-500">Pay Frequency</span><span className="text-[13px] font-medium text-slate-900 dark:text-slate-200">{effectiveSettings.payment_frequency || 'Monthly'}</span></div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* CLAUSES TAB */}
            <TabsContent value="clauses" className="mt-0">
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Sections & Clauses</h3>
                    <p className="text-[12px] text-slate-500 mt-1">Review and customize clauses for this specific contract</p>
                  </div>
                  <button
                    onClick={toggleAllSections}
                    className="h-8 text-[12px] font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  >
                    {expandedSections.size === CONTRACT_SECTIONS.length ? 'Collapse All' : 'Expand All'}
                  </button>
                </div>
                <div className="p-2">
                  <div className="divide-y divide-slate-100/50 dark:divide-slate-800/30">
                    {sectionRows.map(({ section, status, clauseLabel, clauseId, excluded }, index) => {
                      let badgeStyles = "";
                      switch(status) {
                        case 'Included': badgeStyles = "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30"; break;
                        case 'Configured': badgeStyles = "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border-amber-200 dark:border-amber-500/30"; break;
                        case 'Excluded': badgeStyles = "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700"; break;
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
                        <div key={section.key} className={cn("rounded-xl my-1 overflow-hidden transition-colors", status === 'Excluded' && "opacity-60", isExpanded && "bg-slate-50 dark:bg-slate-900/50")}>
                          <div
                            onClick={() => toggleSection(section.key)}
                            className="flex items-center justify-between px-4 py-3 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                            title={clauseLabel}
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                                {getSectionIcon(section.key)}
                              </div>
                              <span className="text-[14px] font-medium text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                {index + 1}. {section.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-4">
                              <span className={cn("text-[11px] font-semibold px-2.5 py-0.5 rounded-full border", badgeStyles)}>
                                {status}
                              </span>
                              <ChevronDown className={cn("w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-transform", isExpanded && "rotate-180")} />
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="px-4 pb-4 pt-2 space-y-4 ml-[52px]">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-[12px] font-medium text-slate-500">Clause Override</Label>
                                  <Link
                                    href="/dashboard/employment-contracts/clause-library"
                                    target="_blank"
                                    className="text-[11px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                  >
                                    <ExternalLink className="w-3 h-3" /> Edit Library
                                  </Link>
                                </div>
                                <Select
                                  value={overrideValue}
                                  onValueChange={(v) => handleSectionClauseOverride(section.key, v)}
                                  disabled={excluded}
                                >
                                  <SelectTrigger className="h-9 text-[13px] bg-white dark:bg-slate-900 rounded-lg">
                                    <SelectValue placeholder="Use default" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">Use default (Job Profile / Company / Section default)</SelectItem>
                                    {ungrouped.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>{c.label}{c.is_default ? ' (default)' : ''}</SelectItem>
                                    ))}
                                    {Array.from(optionGroups.entries()).map(([group, items]) => (
                                      <SelectGroup key={group}>
                                        <SelectLabel>{group}</SelectLabel>
                                        {items.map((c) => (
                                          <SelectItem key={c.id} value={c.id}>{c.label}{c.is_default ? ' (default)' : ''}</SelectItem>
                                        ))}
                                      </SelectGroup>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {excluded ? (
                                <p className="text-[12px] text-slate-400 italic bg-white/50 p-3 rounded-lg border border-slate-100">Excluded by the selected template.</p>
                              ) : resolvedClause ? (
                                <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
                                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                                    <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                                      {resolvedClause.is_default && <Star className="w-3.5 h-3.5 text-amber-500" fill="currentColor" />}
                                      {resolvedClause.label}
                                    </p>
                                    <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full">{resolvedClause.clause_key}</span>
                                  </div>
                                  <div
                                    className="prose prose-sm max-w-none text-slate-600 dark:text-slate-300 max-h-60 overflow-auto scrollbar-thin scrollbar-thumb-slate-200 [&_strong]:text-slate-800 [&_strong]:dark:text-slate-100"
                                    dangerouslySetInnerHTML={{ __html: resolvedClause.content }}
                                  />
                                </div>
                              ) : (
                                <p className="text-[12px] text-amber-600 italic bg-amber-50 p-3 rounded-lg border border-amber-100">No clause resolved for this section.</p>
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
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Data & Values</h3>
                  <p className="text-[12px] text-slate-500 mt-1">Review placeholder tokens and optionally override them for this contract.</p>
                </div>
                <div className="p-6 space-y-8">
                  {PLACEHOLDER_GROUPS.map((group) => (
                    <div key={group.title} className="space-y-3">
                      <h4 className="text-[12px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        {group.title}
                        <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800"></div>
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                        {group.fields.map((f) => {
                          const overrideVal = offer.placeholder_overrides?.[f.key];
                          const computedVal = placeholderValues[f.key] ?? '';
                          const isOverridden = overrideVal !== undefined;
                          return (
                            <div key={f.key} className="flex flex-col gap-1.5 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group/field border border-transparent hover:border-slate-100 dark:hover:border-slate-800">
                              <div className="flex items-center justify-between">
                                <span className="text-[12px] font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5" title={`{{${f.key}}}`}>
                                  {f.label}
                                  {isOverridden && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Overridden"></span>}
                                </span>
                                {f.editable && isOverridden && (
                                  <button
                                    type="button"
                                    title="Reset to default"
                                    onClick={() => handlePlaceholderOverride(f.key, undefined)}
                                    className="text-slate-400 hover:text-red-500 opacity-0 group-hover/field:opacity-100 transition-opacity"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              {f.editable ? (
                                <Input
                                  className={cn(
                                    "h-8 text-[13px] transition-colors rounded-lg",
                                    isOverridden 
                                      ? "border-amber-200 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-900/10 focus-visible:ring-amber-500/20" 
                                      : "border-slate-200 bg-white shadow-sm focus-visible:ring-blue-500/20"
                                  )}
                                  value={overrideVal ?? computedVal}
                                  onChange={(e) => handlePlaceholderOverride(f.key, e.target.value)}
                                  placeholder="Leave blank for default"
                                />
                              ) : (
                                <div className="h-8 flex items-center px-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                                  <span className="text-[13px] text-slate-700 dark:text-slate-300 truncate w-full">{computedVal || '—'}</span>
                                  {f.hint && <span className="text-[10px] text-slate-400 italic shrink-0 ml-2">{f.hint}</span>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
               </div>
            </TabsContent>
          </Tabs>

        </div>
      </ScrollArea>
    </div>
  );
}