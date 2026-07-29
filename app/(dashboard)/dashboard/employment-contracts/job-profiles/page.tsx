'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { saveAs } from 'file-saver';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchableSelect } from '../components/SearchableSelect';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Loader2, PlusCircle, Trash2, Briefcase, BookText,
  Search, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Columns2, FileText, Database, ChevronDown, ShieldCheck, Laptop2,
  Users, Megaphone, Car, LayoutTemplate, UserCog, FileCheck, Link as LinkIcon, PlayCircle,
  Copy, Download, AlertCircle, CheckCircle2, ChevronRight, X, FileSignature, Check, ChevronsUpDown,
  ChevronDownIcon, ChevronUpIcon,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { fetchCompanies, Company } from '../../companies/database';
import {
  EcJobProfile, fetchJobProfiles, createJobProfile, updateJobProfile, deleteJobProfile,
  JobProfileScope,
} from '../utils/jobProfileData';
import { EcClause, fetchClauses } from '../utils/clauseLibraryData';
import { buildDefaultClauseMap } from '../utils/clauseEngine';
import type { ContractEmployeeInfo } from '../utils/data';
import { CONTRACT_SECTIONS } from '../utils/contractStructure';
import { EMPLOYMENT_TYPE_OPTIONS, WORK_ARRANGEMENT_OPTIONS, withCurrentValue } from '../utils/profileOptions';
import { ContractPreview } from '../components/ContractPreview';

const SETTINGS_GROUPS: { label: string; test: RegExp }[] = [
  { label: 'Compensation & Benefits', test: /allowance|medical|pension|salary|payment/i },
  { label: 'Working Hours', test: /^working_|start_time|end_time|break_|rest_days|work_mode/i },
  { label: 'Leave', test: /leave_days$/i },
  { label: 'Termination & Probation', test: /notice_|probation_/i },
];

const DEPARTMENT_VISUALS: { test: RegExp; icon: typeof Briefcase; classes: string }[] = [
  { test: /audit/i, icon: ShieldCheck, classes: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  { test: /admin|reception/i, icon: Users, classes: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  { test: /ict|it\b|software|tech|engineering/i, icon: Laptop2, classes: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' },
  { test: /human resources|^hr\b|hr department/i, icon: Users, classes: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' },
  { test: /marketing/i, icon: Megaphone, classes: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400' },
  { test: /operations|driver|transport|logistics/i, icon: Car, classes: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400' },
  { test: /financ/i, icon: Briefcase, classes: 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400' },
];

function getProfileVisual(department: string | null) {
  const match = department ? DEPARTMENT_VISUALS.find((d) => d.test.test(department)) : undefined;
  return match || { icon: Briefcase, classes: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' };
}

const SECTION_BADGE_COLORS = [
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-teal-50 text-teal-700 border-teal-200',
  'bg-rose-50 text-rose-700 border-rose-200',
  'bg-amber-50 text-amber-700 border-amber-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
];

const JOB_LEVEL_OPTIONS = ['Entry Level', 'Junior', 'Mid-Level', 'Senior', 'Manager', 'Executive'];
const PROBATION_OPTIONS = ['Not Applicable', '1 Month', '3 Months', '6 Months'];
const NOTICE_OPTIONS = ['1 Week', '2 Weeks', '1 Month', '2 Months', '3 Months'];
const LEAVE_DAY_OPTIONS = ['7 Days', '14 Days', '21 Days', '30 Days', 'According to Company Policy'];
const ALLOWANCE_OPTIONS = ['No', 'Optional', 'Yes', 'According to Company Policy'];

function StringListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 group">
          <Input
            className="h-10 text-sm bg-white dark:bg-slate-900 border-slate-200 shadow-sm focus-visible:ring-1 focus-visible:ring-blue-500/50"
            placeholder={placeholder}
            value={item}
            onChange={(e) => onChange(items.map((it, ii) => (ii === i ? e.target.value : it)))}
          />
          <button type="button" onClick={() => onChange(items.filter((_, ii) => ii !== i))} className="text-slate-400 hover:text-red-500 shrink-0 transition-colors p-1.5 rounded-lg hover:bg-red-50">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="h-9 text-xs rounded-lg border-dashed border-slate-300 dark:border-slate-700 bg-transparent hover:bg-slate-50 text-slate-600" onClick={() => onChange([...items, ''])}>
        <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> Add Item
      </Button>
    </div>
  );
}

function FormField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</label>
      {children}
    </div>
  );
}

function SettingInput({ label, settingKey, settings, onChange, placeholder, type = 'text' }: {
  label: string; settingKey: string; settings: Record<string, any>; onChange: (key: string, value: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <FormField label={label}>
      <Input
        type={type}
        value={settings?.[settingKey] || ''}
        onChange={(e) => onChange(settingKey, e.target.value)}
        className="h-10 text-sm bg-white dark:bg-slate-900 border-slate-200 shadow-sm focus-visible:ring-1 focus-visible:ring-blue-500/50"
        placeholder={placeholder || 'Not set'}
      />
    </FormField>
  );
}

function SettingSelect({ label, settingKey, options, settings, onChange, placeholder = 'Select' }: {
  label: string; settingKey: string; options: string[]; settings: Record<string, any>; onChange: (key: string, value: string) => void; placeholder?: string;
}) {
  const current = settings?.[settingKey] ? String(settings[settingKey]) : null;
  return (
    <FormField label={label}>
      <SearchableSelect
        value={current || '__unset__'}
        onChange={(v) => onChange(settingKey, v === '__unset__' ? '' : v)}
        placeholder={placeholder}
        searchPlaceholder={`Search ${label.toLowerCase() || 'options'}...`}
        options={[
          { value: '__unset__', label: 'Not set' },
          ...withCurrentValue(options, current).map((opt) => ({ value: opt, label: opt })),
        ]}
      />
    </FormField>
  );
}

function SectionPanel({ title, description, children, className }: {
  title: string; description?: string; children: ReactNode; className?: string;
}) {
  return (
    <div className={cn("bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800/60 p-6 md:p-8 shadow-[0_1px_3px_0_rgb(0,0,0,0.02)]", className)}>
      <div className="mb-7">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">{title}</h3>
        {description && <p className="text-sm text-slate-500 mt-1.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export default function JobProfilesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [profiles, setProfiles] = useState<EcJobProfile[]>([]);
  const [allProfiles, setAllProfiles] = useState<EcJobProfile[]>([]);
  const [clauses, setClauses] = useState<EcClause[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailTab, setDetailTab] = useState('overview');
  
  const [linkSectionKey, setLinkSectionKey] = useState<string>(CONTRACT_SECTIONS[0].key);
  const [linkSearch, setLinkSearch] = useState('');
  const [expandedClauseId, setExpandedClauseId] = useState<string | null>(null);

  const [draft, setDraft] = useState<EcJobProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createScope, setCreateScope] = useState<JobProfileScope>('position');
  const [createName, setCreateName] = useState('');
  const [createDepartment, setCreateDepartment] = useState('');
  const [creating, setCreating] = useState(false);

  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const editorPanelRef = useRef<ImperativePanelHandle>(null);
  const detailPanelRef = useRef<ImperativePanelHandle>(null);
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const [collapsed, setCollapsed] = useState({ sidebar: false, editor: false, detail: false, preview: false });

  const togglePanel = (key: keyof typeof collapsed) => {
    const ref = key === 'sidebar' ? sidebarPanelRef : key === 'editor' ? editorPanelRef : key === 'detail' ? detailPanelRef : previewPanelRef;
    const panel = ref.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand(); else panel.collapse();
  };

  useEffect(() => {
    (async () => {
      const [comps, allClauses] = await Promise.all([fetchCompanies(), fetchClauses()]);
      setCompanies(comps);
      setClauses(allClauses);
      if (comps.length > 0) setSelectedCompanyId(String(comps[0].id));
      const allProfilesData = await fetchJobProfiles();
      setAllProfiles(allProfilesData);
      setIsLoading(false);
    })();
  }, []);

  const companyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of allProfiles) {
      if (p.company_id) counts[p.company_id] = (counts[p.company_id] || 0) + 1;
    }
    return counts;
  }, [allProfiles]);

  const loadProfiles = async (id: string) => {
    if (!id) return;
    setIsLoading(true);
    if (id === '__general__') {
      const allData = await fetchJobProfiles();
      setProfiles(allData);
      setAllProfiles(allData);
    } else {
      const [data, allData] = await Promise.all([
        fetchJobProfiles(id),
        fetchJobProfiles(),
      ]);
      setProfiles(data);
      setAllProfiles(allData);
    }
    setIsLoading(false);
  };

  useEffect(() => { if (selectedCompanyId) loadProfiles(selectedCompanyId); }, [selectedCompanyId]);

  const filteredProfiles = useMemo(
    () => profiles.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [profiles, searchQuery]
  );

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) || null,
    [profiles, selectedProfileId]
  );

  useEffect(() => {
    setDraft(selectedProfile ? { ...selectedProfile } : null);
  }, [selectedProfileId, selectedProfile]);

  useEffect(() => { setDetailTab('overview'); }, [selectedProfileId]);

  const isDirty = useMemo(() => {
    if (!draft || !selectedProfile) return false;
    return JSON.stringify(draft) !== JSON.stringify(selectedProfile);
  }, [draft, selectedProfile]);

  const updateDraft = (patch: Partial<EcJobProfile>) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  const updateDraftSettings = (key: string, value: string) =>
    setDraft((prev) => (prev ? { ...prev, settings: { ...(prev.settings || {}), [key]: value } } : prev));
  // Builds the next section_clauses off `prev` (the latest committed draft),
  // not the render-scope `draft` closure - so two clause picks in the same
  // React batch (e.g. quick successive clicks) both land instead of the
  // second one clobbering section_clauses back to a version missing the first.
  const updateDraftSectionClauses = (updater: (prev: Record<string, string>) => Record<string, string>) =>
    setDraft((prev) => (prev ? { ...prev, section_clauses: updater(prev.section_clauses || {}) } : prev));

  const clausesById = useMemo(() => Object.fromEntries(clauses.map((c) => [c.id, c])), [clauses]);
  const defaultClauseMap = useMemo(() => buildDefaultClauseMap(clauses), [clauses]);

  const clauseSelections = useMemo(() => {
    if (!draft) return [];
    return Object.entries(draft.section_clauses || {}).map(([sectionKey, clauseId], i) => {
      const section = CONTRACT_SECTIONS.find((s) => s.key === sectionKey);
      const clause = clauses.find((c) => c.id === clauseId);
      return {
        sectionKey,
        sectionTitle: section?.title || sectionKey,
        clauseLabel: clause?.label || 'Unknown',
        isDefault: !!clause?.is_default,
        color: SECTION_BADGE_COLORS[i % SECTION_BADGE_COLORS.length],
      };
    });
  }, [draft, clauses]);

  const openNew = (scope: JobProfileScope) => {
    setCreateScope(scope);
    setCreateName('');
    setCreateDepartment('');
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!createName.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    if (createScope === 'department' && !createDepartment.trim()) {
      toast({ title: 'Department required for a department-scope profile', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const created = await createJobProfile({
        scope: createScope,
        company_id: selectedCompanyId,
        name: createName.trim(),
        department: createScope === 'company' ? null : (createDepartment.trim() || null),
        is_active: true,
        settings: {},
        section_clauses: {},
        requirements: [],
        key_responsibilities: [],
        skills: [],
        tags: [],
        equipment: [],
      });
      if (created) {
        await loadProfiles(selectedCompanyId);
        setSelectedProfileId(created.id);
        setCreateOpen(false);
        toast({ title: 'Profile created' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create profile', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { id, created_at, updated_at, company_id, scope, ...rest } = draft;
      const updated = await updateJobProfile(id, rest);
      if (updated) {
        await loadProfiles(selectedCompanyId);
        toast({ title: 'Profile saved' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save profile', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdits = () => { if (selectedProfile) setDraft({ ...selectedProfile }); };

  const handleAutoFillDefaults = () => {
    if (!draft) return;
    updateDraftSectionClauses((prev) => {
      const next = { ...prev };
      for (const section of CONTRACT_SECTIONS) {
        if (defaultClauseMap[section.key]) {
          next[section.key] = defaultClauseMap[section.key];
        }
      }
      return next;
    });
  };

  const handleClearAllSelections = () => {
    if (!draft) return;
    updateDraftSectionClauses(() => ({}));
  };

  const handleDuplicate = async () => {
    if (!selectedProfile) return;
    try {
      const { id, created_at, updated_at, ...rest } = selectedProfile;
      const created = await createJobProfile({ ...rest, name: `${selectedProfile.name} (Copy)` });
      if (created) {
        await loadProfiles(selectedCompanyId);
        setSelectedProfileId(created.id);
        toast({ title: 'Profile duplicated' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to duplicate profile', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteJobProfile(id);
    if (ok) {
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      if (selectedProfileId === id) setSelectedProfileId(null);
      toast({ title: 'Profile deleted' });
    } else {
      toast({ title: 'Error', description: 'Could not delete - it may still be referenced by an Employment Offer.', variant: 'destructive' });
    }
  };

  const scopeLabel = (scope: JobProfileScope) => scope === 'company' ? 'Company Defaults' : scope === 'department' ? 'Department Defaults' : 'Position';

  // A stand-in employee so the shared ContractPreview component (same one the
  // main Employment Contracts editor uses) can resolve and render this draft
  // profile's clauses/settings without a real employee/offer existing yet.
  const sampleEmployee: ContractEmployeeInfo = useMemo(() => ({
    id: 'sample', individualId: 0, companyId: Number(selectedCompanyId) || 0,
    fullName: 'Sample Employee', firstName: 'Sample', lastName: 'Employee',
    employeeNumber: 'EMP-0000', kraPin: 'A000000000Z', nationalId: '12345678', nssfNumber: 'NS0001', nhifNumber: 'NH0001', shifNumber: '',
    department: draft?.department || '', jobTitle: draft?.job_title || draft?.name || '',
    employmentType: draft?.employment_type || '', employmentStatus: 'Active', jobLevel: draft?.job_level || '',
    reportsTo: String(draft?.settings?.reports_to || ''), workLocation: draft?.work_location || '',
    workArrangement: draft?.work_arrangement || '', status: 'Active', basicSalary: 0, grossSalary: 0,
    bankName: '', bankBranch: '', bankAccount: '', contactEmail: '', contactPhone: '', startDate: '',
  }), [draft, selectedCompanyId]);

  const tabs: { value: string; label: string; icon: any }[] = [
    { value: 'overview', label: 'Overview', icon: LayoutTemplate },
    { value: 'requirements', label: 'Requirements', icon: ShieldCheck },
    { value: 'responsibilities', label: 'Responsibilities', icon: UserCog },
    { value: 'employment_rules', label: 'Employment Rules', icon: FileCheck },
    { value: 'working_arrangement', label: 'Working Arrangement', icon: Briefcase },
    { value: 'benefits', label: 'Benefits & Compensation', icon: CheckCircle2 },
    { value: 'clauses', label: `Linked Clauses (${clauseSelections.length})`, icon: LinkIcon },
  ];

  return (
    <div className="h-[calc(100vh-1rem)] w-full flex flex-col bg-slate-50/50 dark:bg-slate-950/50 rounded-xl overflow-hidden shadow-[0_2px_10px_-3px_rgba(55,107,174,0.15)] border border-slate-200 dark:border-slate-800">
      
      {/* GLOBAL HEADER */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0 gap-4 relative z-20 shadow-[0_1px_2px_0_rgb(0,0,0,0.02)]">
        
        {/* Left Side: Prominent Company Selector */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center justify-center w-10 h-10 bg-custom-blue rounded-xl shadow-sm shrink-0">
            <LayoutTemplate className="h-5 w-5 text-white" />
          </div>
          
          <div className="flex flex-col min-w-0">
            <Popover open={companyDropdownOpen} onOpenChange={setCompanyDropdownOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" role="combobox" aria-expanded={companyDropdownOpen} className="h-auto px-1 py-0.5 -ml-1 justify-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 max-w-[300px] md:max-w-[400px]">
                  <span className="text-xl font-extrabold text-slate-900 dark:text-slate-100 truncate tracking-tight">
                    {selectedCompanyId === '__general__' ? 'General (No Company)' : companies.find(c => String(c.id) === selectedCompanyId)?.company_name || 'Select Workspace...'}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0 rounded-xl shadow-xl" align="start">
                <Command>
                  <CommandInput placeholder="Search companies..." className="h-10 text-sm" />
                  <CommandList>
                    <CommandEmpty>No company found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="General (No Company)"
                        onSelect={() => { setSelectedCompanyId('__general__'); setSelectedProfileId(null); setCompanyDropdownOpen(false); }}
                        className="text-sm font-medium"
                      >
                        <Check className={cn("mr-2 h-4 w-4 text-blue-600", selectedCompanyId === '__general__' ? "opacity-100" : "opacity-0")} />
                        General (No Company)
                      </CommandItem>
                      {companies.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.company_name}
                          onSelect={() => { setSelectedCompanyId(String(c.id)); setSelectedProfileId(null); setCompanyDropdownOpen(false); }}
                          className="text-sm font-medium"
                        >
                          <Check className={cn("mr-2 h-4 w-4 text-blue-600", selectedCompanyId === String(c.id) ? "opacity-100" : "opacity-0")} />
                          {c.company_name}
                          <Badge variant="secondary" className="ml-auto text-xs">{companyCounts[c.id] || 0}</Badge>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium px-0.5 whitespace-nowrap mt-0.5">
              <span>Settings</span>
              <ChevronRight className="h-3 w-3 shrink-0" />
              <span className="text-blue-600 dark:text-blue-400 font-semibold">Job Profiles</span>
              {selectedProfile && (
                <>
                  <ChevronRight className="h-3 w-3 shrink-0" />
                  <span className="text-slate-700 dark:text-slate-300 truncate max-w-[200px]">{selectedProfile.name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Quick Links & Panel Toggles */}
        <div className="flex items-center gap-5 shrink-0">
          <div className="hidden lg:flex items-center bg-slate-50 dark:bg-slate-900 p-1 rounded-full border border-slate-200 dark:border-slate-800/80 shadow-sm gap-1">
            <Link href="/dashboard/employment-contracts" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-white dark:hover:bg-slate-800 rounded-full transition-all"><FileSignature className="w-3.5 h-3.5" /> Contracts</Link>
            <Link href="/dashboard/employment-contracts/clause-library" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-white dark:hover:bg-slate-800 rounded-full transition-all"><BookText className="w-3.5 h-3.5" /> Clauses</Link>
          </div>

          <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 hidden md:block"></div>

          <div className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-full border border-slate-200 dark:border-slate-800/80">
            <button onClick={() => togglePanel('editor')} title={collapsed.editor ? 'Show profiles list' : 'Hide profiles list'} className={cn("p-1.5 rounded-full transition-all", collapsed.editor ? "text-slate-400 hover:text-slate-600" : "bg-custom-blue text-white shadow-sm dark:bg-slate-800 dark:text-blue-600")}>
              <PanelLeftClose className="w-4 h-4" />
            </button>
            <button onClick={() => togglePanel('detail')} title={collapsed.detail ? 'Show editor panel' : 'Hide editor panel'} className={cn("p-1.5 rounded-full transition-all", collapsed.detail ? "text-slate-400 hover:text-slate-600" : "bg-custom-blue text-white shadow-sm dark:bg-slate-800 dark:text-blue-600")}>
              <Columns2 className="w-4 h-4" />
            </button>
            <button onClick={() => togglePanel('preview')} title={collapsed.preview ? 'Show preview panel' : 'Hide preview panel'} className={cn("p-1.5 rounded-full transition-all", collapsed.preview ? "text-slate-400 hover:text-slate-600" : "bg-custom-blue text-white shadow-sm dark:bg-slate-800 dark:text-blue-600")}>
              {collapsed.preview ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full relative overflow-hidden bg-transparent">
        <PanelGroup direction="horizontal" className="h-full w-full">

          {/* PANEL 1: PROFILES LIST */}
          <Panel
            ref={editorPanelRef}
            defaultSize={22}
            minSize={18}
            maxSize={30}
            collapsible
            onCollapse={() => setCollapsed(prev => ({ ...prev, editor: true }))}
            onExpand={() => setCollapsed(prev => ({ ...prev, editor: false }))}
          >
            <div className="h-full w-full flex flex-col bg-slate-50 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-800">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 shrink-0 space-y-4 bg-white/50 dark:bg-slate-900/50">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 tracking-tight">Saved Profiles</h2>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full px-2.5 font-bold text-xs">{filteredProfiles.length}</Badge>
                </div>
                <div className="relative shadow-sm rounded-full">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input placeholder="Search profiles..." className="pl-9 h-9 rounded-full text-sm bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-1 focus-visible:ring-blue-500/50 transition-all" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-9 w-full rounded-full text-sm bg-custom-blue hover:bg-[#2d5a94] dark:bg-blue-600 dark:hover:bg-blue-700 text-white shadow-sm transition-all" disabled={!selectedCompanyId && selectedCompanyId !== '__general__'}>
                      <PlusCircle className="h-4 w-4 mr-2" /> Add Profile
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 rounded-xl shadow-lg border-slate-200">
                    <DropdownMenuItem className="rounded-lg cursor-pointer" onClick={() => openNew('position')}>New Position Profile</DropdownMenuItem>
                    <DropdownMenuItem className="rounded-lg cursor-pointer" onClick={() => openNew('department')}>New Department Defaults</DropdownMenuItem>
                    <DropdownMenuItem className="rounded-lg cursor-pointer" onClick={() => openNew('company')}>New Company Defaults</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <ScrollArea className="flex-1 bg-transparent">
                {isLoading ? (
                  <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                ) : filteredProfiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-center m-6">
                    <div className="w-14 h-14 bg-white dark:bg-slate-900 shadow-sm border border-slate-200 rounded-2xl flex items-center justify-center mb-3">
                      <Briefcase className="h-6 w-6 text-slate-300" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">No profiles found</h3>
                    <p className="text-xs text-slate-500 mt-1">Create a new profile to start.</p>
                  </div>
                ) : (
                  <div className="flex flex-col p-3 gap-1.5">
                    {filteredProfiles.map((profile) => {
                      const isSelected = selectedProfileId === profile.id;
                      const visual = getProfileVisual(profile.department);
                      const VisualIcon = visual.icon;
                      return (
                        <div
                          key={profile.id}
                          onClick={() => setSelectedProfileId(profile.id)}
                          className={cn(
                            "group flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all border",
                            isSelected
                              ? "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] ring-1 ring-blue-500/20"
                              : "bg-transparent border-transparent hover:bg-white/60 dark:hover:bg-slate-800/50 hover:border-slate-200"
                          )}
                        >
                          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5", visual.classes)}>
                            <VisualIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={cn("text-base font-semibold truncate tracking-tight transition-colors", isSelected ? "text-blue-700 dark:text-blue-400" : "text-slate-800 dark:text-slate-200 group-hover:text-slate-900")}>{profile.name}</p>
                            <p className="text-xs text-slate-500 truncate mt-0.5 font-medium">
                              {profile.department || scopeLabel(profile.scope)}
                            </p>
                          </div>
                          {profile.is_active === false && (
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full text-slate-500 bg-slate-100 dark:bg-slate-800 mt-1 shrink-0">
                              Inactive
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          </Panel>

          {!collapsed.editor && (
            <PanelResizeHandle className="relative w-1.5 bg-slate-200/50 dark:bg-slate-800/50 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-10" />
          )}

          {/* PANEL 2: MAIN EDITOR */}
          <Panel
            ref={detailPanelRef}
            defaultSize={53}
            minSize={40}
            collapsible
            onCollapse={() => setCollapsed(prev => ({ ...prev, detail: true }))}
            onExpand={() => setCollapsed(prev => ({ ...prev, detail: false }))}
          >
            <div className="h-full w-full flex flex-col bg-slate-50/40 dark:bg-slate-950/40 relative border-r border-slate-200 dark:border-slate-800">
              {draft && selectedProfile ? (() => {
                const visual = getProfileVisual(draft.department);
                const VisualIcon = visual.icon;
                return (
                  <>
                    {/* Editor Header */}
                    <div className="px-8 py-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 shadow-[0_1px_2px_0_rgb(0,0,0,0.01)] z-10">
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                        <div className="flex flex-col gap-3 min-w-0 flex-1">
                          <div className="flex items-start gap-5">
                            <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm mt-0.5 border border-white/50", visual.classes)}>
                              <VisualIcon className="w-7 h-7" />
                            </div>
                            <div className="min-w-0 flex flex-col gap-1 w-full">
                              <div className="flex items-center gap-3 flex-wrap">
                                <input
                                  value={draft.name}
                                  onChange={(e) => updateDraft({ name: e.target.value })}
                                  className="text-xl font-extrabold text-slate-900 dark:text-slate-100 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 px-2 py-1 -ml-2 rounded-lg outline-none border border-transparent focus:border-slate-300 dark:focus:border-slate-700 focus:bg-white dark:focus:bg-slate-950 transition-colors w-full max-w-lg truncate tracking-tight"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateDraft({ is_active: !draft.is_active })}
                                  title="Toggle active status"
                                >
                                  <Badge className={cn(
                                    "text-xs px-2.5 py-0.5 rounded-full h-5 shrink-0 cursor-pointer shadow-sm border-transparent transition-colors font-bold uppercase tracking-wider",
                                    draft.is_active ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                                  )}>
                                    {draft.is_active ? 'Active' : 'Inactive'}
                                  </Badge>
                                </button>
                              </div>
                              <p className="text-sm text-slate-500 font-medium truncate px-0.5 flex items-center gap-2">
                                <span>{draft.department || scopeLabel(draft.scope)}</span>
                                {draft.job_level && <><span className="w-1 h-1 rounded-full bg-slate-300"></span><span>{draft.job_level}</span></>}
                                {draft.employment_type && <><span className="w-1 h-1 rounded-full bg-slate-300"></span><span>{draft.employment_type}</span></>}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 lg:self-start ml-20 lg:ml-0 mt-2 lg:mt-0">
                          <Button variant="outline" size="sm" className="h-9 px-4 rounded-full text-sm font-semibold border-slate-200 shadow-sm hover:bg-slate-50 bg-white" onClick={handleCancelEdits} disabled={!isDirty || saving}>Cancel</Button>
                          <div className="flex rounded-full shadow-sm bg-custom-blue">
                            <Button size="sm" className="h-9 bg-transparent hover:bg-[#2d5a94] text-white rounded-l-full rounded-r-none border-r border-[#2d5a94]/50 text-sm font-semibold px-5 disabled:opacity-60 transition-colors" onClick={handleSaveProfile} disabled={!isDirty || saving}>
                              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                              Save Changes
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" className="h-9 bg-transparent hover:bg-[#2d5a94] text-white rounded-r-full rounded-l-none px-2.5">
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-xl shadow-lg border-slate-200">
                                <DropdownMenuItem className="rounded-lg cursor-pointer text-sm font-medium" onClick={handleDuplicate}>
                                  <Copy className="h-4 w-4 mr-2 text-slate-400" /> Duplicate Profile
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="rounded-lg cursor-pointer text-sm font-medium text-red-600 focus:text-red-600 focus:bg-red-50" onClick={() => setDeletingId(selectedProfile.id)}>
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete Profile
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-1 overflow-hidden bg-transparent">
                      <Tabs value={detailTab === 'preview' ? 'overview' : detailTab} onValueChange={setDetailTab} className="flex-1 flex flex-col overflow-hidden">
                        
                        {/* Tabs Header */}
                        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 lg:px-8 shrink-0 overflow-x-auto scrollbar-hide z-0">
                          <TabsList className="bg-transparent h-14 p-0 border-none inline-flex w-max gap-6">
                            {tabs.filter(t => t.value !== 'preview').map((tab) => {
                              const Icon = tab.icon;
                              const isActive = detailTab === tab.value;
                              return (
                                <TabsTrigger
                                  key={tab.value}
                                  value={tab.value}
                                  className={cn(
                                    "h-14 rounded-none border-b-[3px] font-semibold text-sm px-1 transition-all gap-2.5 whitespace-nowrap bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none",
                                    isActive 
                                      ? "border-blue-600 text-blue-700 dark:border-blue-500 dark:text-blue-400" 
                                      : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 dark:hover:text-slate-300"
                                  )}
                                >
                                  <Icon className={cn("w-4 h-4", isActive ? "text-blue-600" : "text-slate-400")} />
                                  {tab.label}
                                </TabsTrigger>
                              );
                            })}
                          </TabsList>
                        </div>

                        <ScrollArea className="flex-1 bg-slate-50/50 dark:bg-slate-950/30">
                          <div className="p-6 lg:p-8">
                            <TabsContent value="overview" className="m-0 focus:outline-none">
                              <div className="max-w-4xl mx-auto space-y-6 lg:space-y-8">
                                <SectionPanel title="Profile Identity" description="The stable facts that identify this role.">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                    <FormField label="Job Title"><Input value={draft.job_title || ''} onChange={(e) => updateDraft({ job_title: e.target.value })} className="h-10 text-sm bg-white dark:bg-slate-900 border-slate-200 shadow-sm" placeholder="e.g. Software Developer" /></FormField>
                                    <FormField label={`Department${draft.scope === 'department' ? ' *' : ''}`}><Input value={draft.department || ''} onChange={(e) => updateDraft({ department: e.target.value })} className="h-10 text-sm bg-white dark:bg-slate-900 border-slate-200 shadow-sm" placeholder="e.g. ICT" /></FormField>
                                    <FormField label="Job Level">
                                      <SearchableSelect
                                        value={draft.job_level || '__unset__'}
                                        onChange={(v) => updateDraft({ job_level: v === '__unset__' ? null : v })}
                                        placeholder="Select level"
                                        searchPlaceholder="Search levels..."
                                        options={[{ value: '__unset__', label: 'Not set' }, ...withCurrentValue(JOB_LEVEL_OPTIONS, draft.job_level).map((opt) => ({ value: opt, label: opt }))]}
                                      />
                                    </FormField>
                                    <FormField label="Employment Type">
                                      <SearchableSelect
                                        value={draft.employment_type || '__unset__'}
                                        onChange={(v) => updateDraft({ employment_type: v === '__unset__' ? null : v })}
                                        placeholder="Select type"
                                        searchPlaceholder="Search types..."
                                        options={[{ value: '__unset__', label: 'Not set' }, ...withCurrentValue(EMPLOYMENT_TYPE_OPTIONS, draft.employment_type).map((opt) => ({ value: opt, label: opt }))]}
                                      />
                                    </FormField>
                                    <FormField label="Work Arrangement">
                                      <SearchableSelect
                                        value={draft.work_arrangement || '__unset__'}
                                        onChange={(v) => updateDraft({ work_arrangement: v === '__unset__' ? null : v })}
                                        placeholder="Select arrangement"
                                        searchPlaceholder="Search arrangements..."
                                        options={[{ value: '__unset__', label: 'Not set' }, ...withCurrentValue(WORK_ARRANGEMENT_OPTIONS, draft.work_arrangement).map((opt) => ({ value: opt, label: opt }))]}
                                      />
                                    </FormField>
                                  </div>
                                </SectionPanel>

                                <SectionPanel title="Job Summary" description="This is the role purpose that can feed the job description appendix.">
                                  <Textarea className="min-h-[160px] text-sm bg-white dark:bg-slate-900 border-slate-200 shadow-sm p-4 leading-relaxed" placeholder="A short summary of what this role does..." value={draft.job_description || ''} onChange={(e) => updateDraft({ job_description: e.target.value })} />
                                </SectionPanel>
                              </div>
                            </TabsContent>

                            <TabsContent value="requirements" className="m-0 focus:outline-none">
                              <div className="max-w-4xl mx-auto space-y-6">
                                <SectionPanel title="Qualifications & Experience">
                                  <StringListEditor items={draft.requirements || []} onChange={(v) => updateDraft({ requirements: v })} placeholder="e.g. Bachelor's degree in Computer Science" />
                                </SectionPanel>
                              </div>
                            </TabsContent>

                            <TabsContent value="responsibilities" className="m-0 focus:outline-none">
                              <div className="max-w-4xl mx-auto space-y-6">
                                <SectionPanel title="Key Responsibilities">
                                  <StringListEditor items={draft.key_responsibilities || []} onChange={(v) => updateDraft({ key_responsibilities: v })} placeholder="e.g. Maintain accurate financial records" />
                                </SectionPanel>
                              </div>
                            </TabsContent>

                            <TabsContent value="employment_rules" className="m-0 focus:outline-none">
                              <div className="max-w-4xl mx-auto space-y-6">
                                <SectionPanel title="Employment & Termination">
                                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    <div className="grid grid-cols-[200px_1fr] sm:grid-cols-[240px_1fr] gap-6 py-5 items-center"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">Probation Period</span><SettingSelect label="" settingKey="probation_period" options={PROBATION_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /></div>
                                    <div className="grid grid-cols-[200px_1fr] sm:grid-cols-[240px_1fr] gap-6 py-5 items-center"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">Notice Period</span><SettingSelect label="" settingKey="notice_period" options={NOTICE_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /></div>
                                  </div>
                                </SectionPanel>
                              </div>
                            </TabsContent>

                            <TabsContent value="working_arrangement" className="m-0 focus:outline-none">
                              <div className="max-w-4xl mx-auto space-y-6">
                                <SectionPanel title="Schedule & Overtime">
                                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    <div className="grid grid-cols-[200px_1fr] sm:grid-cols-[240px_1fr] gap-6 py-5 items-center"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">Working Days</span><SettingSelect label="" settingKey="working_days" options={['Monday-Friday', 'Monday-Saturday', 'Shift Based', 'Flexible']} settings={draft.settings || {}} onChange={updateDraftSettings} /></div>
                                    <div className="grid grid-cols-[200px_1fr] sm:grid-cols-[240px_1fr] gap-6 py-5 items-center"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">Start Time</span><SettingInput label="" settingKey="start_time" settings={draft.settings || {}} onChange={updateDraftSettings} placeholder="08:00" type="time" /></div>
                                    <div className="grid grid-cols-[200px_1fr] sm:grid-cols-[240px_1fr] gap-6 py-5 items-center"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">End Time</span><SettingInput label="" settingKey="end_time" settings={draft.settings || {}} onChange={updateDraftSettings} placeholder="17:00" type="time" /></div>
                                  </div>
                                </SectionPanel>
                              </div>
                            </TabsContent>

                            <TabsContent value="benefits" className="m-0 focus:outline-none">
                              <div className="max-w-4xl mx-auto space-y-6">
                                <SectionPanel title="Compensation">
                                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    <div className="grid grid-cols-[200px_1fr] sm:grid-cols-[240px_1fr] gap-6 py-5 items-center"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">Currency</span><SettingSelect label="" settingKey="salary_currency" options={['KES', 'USD', 'GBP', 'EUR']} settings={draft.settings || {}} onChange={updateDraftSettings} /></div>
                                    <div className="grid grid-cols-[200px_1fr] sm:grid-cols-[240px_1fr] gap-6 py-5 items-center"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">Annual Leave</span><SettingSelect label="" settingKey="annual_leave_days" options={LEAVE_DAY_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /></div>
                                  </div>
                                </SectionPanel>
                              </div>
                            </TabsContent>

                            {/* Linked Clauses: Merged Panels Layout */}
                            <TabsContent value="clauses" className="m-0 h-[750px] -mx-6 lg:-mx-8 -mt-6 lg:-mt-8 mb-8 focus:outline-none">
                              <div className="bg-slate-50 dark:bg-slate-950 flex h-full border-b border-slate-200 dark:border-slate-800">
                                
                                {/* Col 1: Sections (Sidebar style) */}
                                <div className="w-[260px] border-r border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/30 flex flex-col shrink-0">
                                  <div className="p-5 border-b border-slate-200 dark:border-slate-800 space-y-3.5 bg-slate-50/50">
                                    <div>
                                      <p className="text-base font-bold text-slate-900 dark:text-slate-100">Contract Sections</p>
                                      <p className="text-xs text-slate-500 mt-0.5 font-medium">{CONTRACT_SECTIONS.length} sections to configure</p>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button variant="outline" size="sm" className="flex-1 text-xs h-8 bg-white border-slate-200 shadow-sm hover:bg-blue-50 hover:text-blue-700" onClick={handleAutoFillDefaults}>Apply Defaults</Button>
                                      <Button variant="outline" size="sm" className="px-3 text-xs h-8 text-red-600 border-slate-200 bg-white shadow-sm hover:bg-red-50 hover:border-red-200" onClick={handleClearAllSelections} title="Clear All">Clear</Button>
                                    </div>
                                  </div>
                                  <ScrollArea className="flex-1">
                                    <div className="p-3 space-y-1">
                                      {CONTRACT_SECTIONS.map((section) => {
                                        const count = clauses.filter((c) => c.section_key === section.key).length;
                                        const hasSelection = !!draft?.section_clauses?.[section.key];
                                        return (
                                          <div
                                            key={section.key}
                                            onClick={() => { setLinkSectionKey(section.key); setLinkSearch(''); setExpandedClauseId(null); }}
                                            className={cn("flex items-center justify-between p-3 rounded-xl text-sm font-semibold cursor-pointer transition-all", section.key === linkSectionKey ? "bg-white shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)] border border-slate-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800/50 dark:text-blue-400" : "text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800 border border-transparent")}
                                          >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                              {hasSelection ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <FileText className="w-4 h-4 shrink-0 opacity-40" />}
                                              <span className="truncate">{section.title}</span>
                                            </div>
                                            <Badge variant="secondary" className={cn("text-xs h-4.5 px-2 min-w-[20px] flex items-center justify-center shrink-0 rounded-full font-bold", section.key === linkSectionKey ? "bg-blue-100 text-blue-700" : "bg-slate-200/70 text-slate-500")}>{count}</Badge>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </ScrollArea>
                                </div>

                                {/* Col 2: Main Area - Cards + Previews */}
                                <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-950">
                                  <div className="px-8 py-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white/50 dark:bg-slate-900/20 shrink-0 shadow-[0_1px_2px_0_rgb(0,0,0,0.01)]">
                                    <div>
                                      <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                        {CONTRACT_SECTIONS.find((s) => s.key === linkSectionKey)?.title}
                                      </p>
                                      <p className="text-sm text-slate-500 mt-1">Select a clause to apply to this section.</p>
                                    </div>
                                    <div className="relative w-[280px]">
                                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                      <Input placeholder="Search clauses in section..." className="pl-9 h-10 rounded-full text-sm bg-white border-slate-200 shadow-sm focus-visible:ring-1 focus-visible:ring-blue-500/50" value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} />
                                    </div>
                                  </div>

                                  <ScrollArea className="flex-1 p-8">
                                    <div className="space-y-5 max-w-5xl mx-auto">
                                      
                                      {/* Deselect / Default Option */}
                                      <div 
                                        className={cn(
                                          "flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer bg-white",
                                          !draft?.section_clauses?.[linkSectionKey] ? "border-blue-500 shadow-[0_4px_12px_-4px_rgba(37,99,235,0.2)] ring-1 ring-blue-500/20" : "border-slate-200 border-dashed hover:border-slate-400 shadow-sm"
                                        )}
                                        onClick={() => { if (!draft) return; updateDraftSectionClauses((prev) => { const next = { ...prev }; delete next[linkSectionKey]; return next; }); setExpandedClauseId(null); }}
                                      >
                                        <div>
                                          <p className={cn("text-sm font-bold", !draft?.section_clauses?.[linkSectionKey] ? "text-blue-700" : "text-slate-600")}>No Clause</p>
                                          <p className="text-xs text-slate-500 mt-0.5">
                                            This section is left out of the contract until you apply a clause below.
                                            {defaultClauseMap[linkSectionKey] && <> Suggested: <span className="font-semibold">{clausesById[defaultClauseMap[linkSectionKey]]?.label}</span>.</>}
                                          </p>
                                        </div>
                                        <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0", !draft?.section_clauses?.[linkSectionKey] ? "border-custom-blue bg-custom-blue" : "border-slate-300")}>
                                          {!draft?.section_clauses?.[linkSectionKey] && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                      </div>

                                      {/* Clause Cards Feed */}
                                      {clauses
                                        .filter((c) => c.section_key === linkSectionKey && c.label.toLowerCase().includes(linkSearch.toLowerCase()))
                                        .sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || a.label.localeCompare(b.label))
                                        .map((clause) => {
                                          const isSelected = draft?.section_clauses?.[linkSectionKey] === clause.id;
                                          const isExpanded = expandedClauseId === clause.id;
                                          const usageCount = allProfiles.filter((p) => p.section_clauses?.[linkSectionKey] === clause.id).length;
                                          const conditions = (clause as any)?.suggest_conditions as Array<Record<string, string>> | undefined;
                                          const facts = { employment_type: draft?.employment_type, job_level: draft?.job_level, work_arrangement: draft?.work_arrangement, department: draft?.department };

                                          return (
                                            <div
                                              key={clause.id}
                                              className={cn(
                                                "bg-white dark:bg-slate-900 border rounded-2xl overflow-hidden transition-all duration-200",
                                                isSelected ? "border-blue-500 shadow-[0_4px_12px_-4px_rgba(37,99,235,0.15)] ring-1 ring-blue-500/20" : "border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-slate-300"
                                              )}
                                            >
                                              {/* Card Header (Clickable to expand) */}
                                              <div 
                                                className="p-5 flex items-center justify-between cursor-pointer group"
                                                onClick={() => setExpandedClauseId(isExpanded ? null : clause.id)}
                                              >
                                                <div className="flex-1 min-w-0 pr-6">
                                                  <div className="flex items-center gap-3 mb-1.5">
                                                    <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">{clause.label}</h4>
                                                    {clause.is_default && <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs py-0 px-2 uppercase tracking-wider font-bold rounded-md">Default</Badge>}
                                                    {clause.company_id && <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-xs py-0 px-2 uppercase tracking-wider font-bold rounded-md">Company specific</Badge>}
                                                  </div>
                                                  <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
                                                    <span className="font-mono text-xs bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{clause.clause_key}</span>
                                                    <span>Used in {usageCount} profile{usageCount !== 1 ? 's' : ''}</span>
                                                  </div>
                                                </div>
                                                
                                                <div className="flex items-center gap-6 shrink-0">
                                                  {/* The Selection Button */}
                                                  <Button
                                                    size="sm"
                                                    variant={isSelected ? "default" : "outline"}
                                                    className={cn("h-9 rounded-full px-5 text-sm font-bold shadow-sm transition-all", isSelected ? "bg-custom-blue text-white" : "bg-white text-slate-700 hover:bg-slate-50")}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      updateDraftSectionClauses((prev) => ({ ...prev, [linkSectionKey]: clause.id }));
                                                      if(!isExpanded) setExpandedClauseId(clause.id);
                                                    }}
                                                  >
                                                    {isSelected ? <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Applied</> : "Apply Clause"}
                                                  </Button>
                                                  
                                                  <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-600 transition-colors">
                                                    {isExpanded ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
                                                  </div>
                                                </div>
                                              </div>

                                              {/* Expanded Content (Rules & Preview) */}
                                              {isExpanded && (
                                                <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-6 flex flex-col xl:flex-row gap-8">
                                                  
                                                  {/* HTML Preview (Styled like a document snippet) */}
                                                  <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Content Preview</p>
                                                    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
                                                      <div
                                                        className="prose prose-sm max-w-none text-slate-700 dark:text-slate-300 leading-relaxed [&_table]:w-full [&_table]:my-4 [&_td]:p-2 [&_th]:p-2 [&_td]:align-top"
                                                        dangerouslySetInnerHTML={{ __html: clause.content }}
                                                      />
                                                      {clause.content?.includes('{{') && (
                                                        <div className="pt-4 border-t border-slate-100 mt-5 shrink-0">
                                                          <div className="flex flex-wrap gap-2">
                                                            {Array.from(new Set(Array.from(clause.content.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]))).map((p) => (
                                                              <span key={p} className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-1 rounded-md">{'{{' + p + '}}'}</span>
                                                            ))}
                                                          </div>
                                                        </div>
                                                      )}
                                                    </div>
                                                  </div>

                                                  {/* Rules sidebar inside card */}
                                                  <div className="w-full xl:w-[280px] shrink-0">
                                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Suggestion Rules</p>
                                                    {!conditions?.length ? (
                                                      <div className="bg-white border border-slate-200 rounded-xl p-5 text-sm text-slate-500 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]">
                                                        No automated rules. Manual selection only.
                                                      </div>
                                                    ) : (
                                                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]">
                                                        <ul className="space-y-3 text-xs">
                                                          {Object.entries(conditions[0] || {}).filter(([, v]) => v).map(([key, value]) => {
                                                            const matches = facts[key as keyof typeof facts] === value;
                                                            return (
                                                              <li key={key} className="flex justify-between items-center gap-3 border-b border-emerald-100/50 pb-2 last:border-0 last:pb-0">
                                                                <span className="text-slate-600 font-medium capitalize">{key.replace(/_/g, ' ')}: <span className="font-bold text-slate-800">{value}</span></span>
                                                                {matches ? (
                                                                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs px-1.5 py-0 border-transparent shadow-none">Matches</Badge>
                                                                ) : (
                                                                  <Badge variant="outline" className="text-slate-400 text-xs px-1.5 py-0 shadow-none">No match</Badge>
                                                                )}
                                                              </li>
                                                            );
                                                          })}
                                                        </ul>
                                                      </div>
                                                    )}
                                                  </div>

                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                    </div>
                                  </ScrollArea>
                                </div>
                              </div>
                            </TabsContent>
                          </div>
                        </ScrollArea>
                      </Tabs>
                    </div>
                  </>
                );
              })() : (
                <div className="flex flex-col items-center justify-center h-full text-center p-12 bg-slate-50/40 dark:bg-slate-950/40">
                  <div className="w-24 h-24 bg-white dark:bg-slate-900 shadow-sm rounded-[2rem] flex items-center justify-center mb-6 border border-slate-200 dark:border-slate-800">
                    <FileText className="w-10 h-10 text-blue-500/40" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2 tracking-tight">No Profile Selected</h3>
                  <p className="text-sm text-slate-500 max-w-[280px] leading-relaxed">Select a job profile from the left sidebar to view or edit its details, or create a new profile.</p>
                </div>
              )}
            </div>
          </Panel>

          {!collapsed.preview && (
            <PanelResizeHandle className="relative w-1.5 bg-slate-200/50 dark:bg-slate-800/50 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-10" />
          )}

          {/* PANEL 3: PREVIEW (Document Style) */}
          <Panel
            ref={previewPanelRef}
            defaultSize={25}
            minSize={20}
            maxSize={45}
            collapsible
            onCollapse={() => setCollapsed(prev => ({ ...prev, preview: true }))}
            onExpand={() => setCollapsed(prev => ({ ...prev, preview: false }))}
          >
            <div className="h-full w-full flex flex-col bg-slate-100/70 dark:bg-slate-950/70 overflow-hidden relative">
              <button
                onClick={() => togglePanel('preview')}
                title="Hide preview panel"
                className="absolute top-4 right-4 z-30 text-slate-400 hover:text-slate-700 hover:bg-white dark:hover:bg-slate-800 rounded-lg h-8 w-8 flex items-center justify-center transition-colors shadow-sm bg-white/80 dark:bg-slate-900/80 backdrop-blur"
              >
                <X className="w-4 h-4" />
              </button>

              {selectedProfile && draft ? (
                <ContractPreview
                  contractData={{ employee: sampleEmployee }}
                  selectedJobProfile={draft}
                  previewOnly
                  className="flex flex-col h-full bg-slate-100/70 dark:bg-slate-950/70 relative"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
                  <p className="text-sm font-medium text-slate-500">Select a profile to preview document</p>
                </div>
              )}
            </div>
          </Panel>

        </PanelGroup>
      </div>

      {/* Dialogs */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6 shadow-xl border-slate-200">
          <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
            New {createScope === 'company' ? 'Company Defaults' : createScope === 'department' ? 'Department Defaults' : 'Position'} Profile
          </DialogTitle>
          <div className="space-y-5 pt-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Profile Name</label>
              <Input autoFocus value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. Senior Accountant" className="h-10 rounded-xl text-sm shadow-sm border-slate-200" />
            </div>
            {createScope !== 'company' && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Department {createScope === 'department' && <span className="text-red-500">*</span>}</label>
                <Input value={createDepartment} onChange={(e) => setCreateDepartment(e.target.value)} placeholder="e.g. Finance" className="h-10 rounded-xl text-sm shadow-sm border-slate-200" />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-8">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} className="rounded-full font-semibold text-slate-600 hover:bg-slate-100">Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="rounded-full font-semibold bg-custom-blue hover:bg-[#2d5a94] text-white shadow-sm px-6">{creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Create Profile</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent className="rounded-2xl max-w-sm shadow-xl border-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Delete this profile?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-500">This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-5 gap-3">
            <AlertDialogCancel className="rounded-full font-semibold border-slate-200 shadow-sm mt-0 hover:bg-slate-50">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deletingId) handleDelete(deletingId); setDeletingId(null); }} className="rounded-full font-semibold bg-red-600 hover:bg-red-700 text-white shadow-sm border-0">Delete Profile</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
