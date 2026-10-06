'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SettingsTable, SettingsGroupRow, SettingsRow, type SettingsAccent } from '../components/SettingsTable';
import { LetterTemplatesTab } from '../components/LetterTemplatesTab';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Loader2, PlusCircle, Trash2, Briefcase,
  Search, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Columns2, FileText, Database, ChevronDown, ShieldCheck, Laptop2,
  Users, Megaphone, Car, Link as LinkIcon, PlayCircle,
  Copy, Download, CheckCircle2, X, Check, ChevronsUpDown,
  ChevronDownIcon, ChevronUpIcon, Building2, RefreshCw, Mail,
  UserCog, Tag, FileSignature, ListChecks, Wallet, Clock, Gift, LogOut, CalendarDays, Sliders,
  type LucideIcon,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { fetchCompanies, Company } from '../../companies/database';
import {
  EcJobProfile, fetchJobProfiles, fetchGlobalJobProfiles, createJobProfile, updateJobProfile, deleteJobProfile,
  JobProfileScope,
} from '../utils/jobProfileData';
import { EcClause, fetchClauses } from '../utils/clauseLibraryData';
import { buildDefaultClauseMap } from '../utils/clauseEngine';
import type { ContractEmployeeInfo } from '../utils/data';
import { CONTRACT_SECTIONS } from '../utils/contractStructure';
import { DEFAULT_DEPARTMENT_OPTIONS, EMPLOYMENT_TYPE_OPTIONS, withCurrentValue } from '../utils/profileOptions';
import { ContractPreview } from '../components/ContractPreview';
import { DEFAULT_CONTRACT_THEME, type ContractThemeSettings } from '../utils/themeEngine';
import { MasterFieldEditControl, SourceValueEditor, linkedMasterFieldIds } from '../components/MasterFieldEditControl';
import { useMasterFieldValues } from '../hooks/useMasterFieldValues';
import type { EcPlaceholder } from '../utils/ecPlaceholders';
import { fetchCompanyDirectors, type CompanyDirectorOption } from '../utils/companySignatory';
import { fetchCompanySettings, upsertCompanySettings, fetchCompanyDepartmentsFromEmployees, type EcCompanySettings } from '../utils/companySettings';

// Buckets the "Fields" tab's dynamically-fetched ec_placeholders (source_kind
// = 'job_profile') into the same panel layout the tab used to hardcode,
// matched against each placeholder's own settings_key. Anything that matches
// no pattern falls into an "Other" panel rather than being silently dropped.
const SETTINGS_GROUPS: { label: string; description?: string; test: RegExp }[] = [
  { label: 'Employment Details', test: /^reports_to$|^work_location$/i },
  { label: 'Salary & Payment', test: /^salary_currency$|^payment_frequency$|^payment_day$/i },
  { label: 'Working Hours', test: /^working_|start_time|end_time|break_|rest_days|work_mode/i },
  { label: 'Benefits', test: /allowance|medical|pension/i },
  { label: 'Termination & Probation', test: /notice_|probation_|termination_/i },
  { label: 'Leave', test: /leave_days$/i },
];

// Icon + accent colour per Fields-tab group (SettingsGroupRow).
const SETTINGS_GROUP_STYLE: Record<string, { icon: LucideIcon; accent: SettingsAccent }> = {
  'Employment Details': { icon: Briefcase, accent: 'blue' },
  'Salary & Payment': { icon: Wallet, accent: 'emerald' },
  'Working Hours': { icon: Clock, accent: 'indigo' },
  'Benefits': { icon: Gift, accent: 'purple' },
  'Termination & Probation': { icon: LogOut, accent: 'rose' },
  'Leave': { icon: CalendarDays, accent: 'teal' },
  'Other': { icon: Sliders, accent: 'slate' },
};

// Excluded from the Job Profile Fields tab even though they're
// source_kind='settings_cascade' rows - standardPlaceholders.ts's HARDCODED
// layer resolves both unconditionally from the Company's Signatory Director
// selection (ec_company_settings.signatory_individual_id, via
// fetchSignatoryNameForCompany), which always wins over the generic
// settings-cascade dispatch. Editing them here would silently do nothing at
// contract-generation time; the real editor is the Signatory Director picker
// in the Company Details/Defaults tab.
const SETTINGS_TAB_EXCLUDED_KEYS = new Set(['signatory_name', 'signatory_title']);

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

const PROBATION_OPTIONS = ['Not Applicable', '1 Month', '3 Months', '6 Months'];
const NOTICE_OPTIONS = ['1 Week', '2 Weeks', '1 Month', '2 Months', '3 Months'];
const LEAVE_DAY_OPTIONS = ['7 Days', '14 Days', '21 Days', '30 Days', 'According to Company Policy'];
const ALLOWANCE_OPTIONS = ['No', 'Optional', 'Yes', 'According to Company Policy'];

// ec_placeholders (source_kind = 'job_profile') carries no widget-type/options
// info of its own - just key/label/default_value - so the Fields tab has no
// way to know a given settings_key should render as a curated dropdown
// instead of free text. This is a static fallback for the settings_keys the
// tab used to hardcode a <SettingSelect> for, keyed by settings_key, so
// switching that tab to be data-driven doesn't downgrade those to plain text
// inputs. Any settings_key not listed here (including brand-new placeholders
// added from Data Sources) renders as plain text - reasonable default given
// the schema has no options to draw from.
const KNOWN_SELECT_OPTIONS: Record<string, string[]> = {
  salary_currency: ['KES', 'USD', 'GBP', 'EUR'],
  payment_frequency: ['Monthly', 'Bi-weekly', 'Weekly'],
  working_days: ['Monday-Friday', 'Monday-Saturday', 'Shift Based', 'Flexible'],
  work_mode: ['On-site', 'Remote', 'Hybrid'],
  housing_allowance: ALLOWANCE_OPTIONS,
  transport_allowance: ALLOWANCE_OPTIONS,
  telephone_allowance: ALLOWANCE_OPTIONS,
  meal_allowance: ALLOWANCE_OPTIONS,
  probation_period: PROBATION_OPTIONS,
  notice_period: NOTICE_OPTIONS,
  probation_notice: NOTICE_OPTIONS,
  annual_leave_days: LEAVE_DAY_OPTIONS,
  sick_leave_days: LEAVE_DAY_OPTIONS,
  maternity_leave_days: LEAVE_DAY_OPTIONS,
  paternity_leave_days: LEAVE_DAY_OPTIONS,
  compassionate_leave_days: LEAVE_DAY_OPTIONS,
};
// Same idea for <input type="...">  - only start/end time genuinely need
// type="time" instead of the SettingInput default of "text".
const KNOWN_INPUT_TYPES: Record<string, string> = {
  start_time: 'time',
  end_time: 'time',
};

function StringListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  const [bulkText, setBulkText] = useState('');
  // The bulk-paste box only shows on demand - always-visible it doubled every
  // list's height.
  const [showBulk, setShowBulk] = useState(false);

  // Mirrors departments/upload-requirements/components/AddRequirementsDialog.tsx's
  // "Configuration Manager" bulk-add pattern (one item per line), but as a
  // real paste interception rather than re-splitting on every keystroke -
  // this box only ever holds one in-flight paste, so there's no persisted
  // bulk-input state to keep in sync with the row list below.
  const handleBulkPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    e.preventDefault();
    onChange([...items, ...lines]);
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 group">
          <Input
            className="h-9 text-base bg-white dark:bg-slate-900 border-slate-200 focus-visible:ring-1 focus-visible:ring-blue-500/50"
            placeholder={placeholder}
            value={item}
            onChange={(e) => onChange(items.map((it, ii) => (ii === i ? e.target.value : it)))}
          />
          <button type="button" onClick={() => onChange(items.filter((_, ii) => ii !== i))} className="text-slate-400 hover:text-red-500 shrink-0 transition-colors p-1.5 rounded-md hover:bg-red-50" title="Remove">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button type="button" className="text-sm font-medium text-custom-blue hover:underline inline-flex items-center gap-1" onClick={() => onChange([...items, ''])}>
          <PlusCircle className="h-4 w-4" /> Add item
        </button>
        <button type="button" className="text-sm text-slate-500 hover:text-slate-800 hover:underline" onClick={() => setShowBulk((v) => !v)}>
          {showBulk ? 'Hide paste box' : 'Paste a list'}
        </button>
      </div>
      {showBulk && (
        <Textarea
          autoFocus
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          onPaste={handleBulkPaste}
          placeholder="Paste a list - each line becomes its own item"
          className="min-h-[70px] text-base bg-white dark:bg-slate-900 border-slate-200"
        />
      )}
    </div>
  );
}

function FormField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {/* Empty in the settings tables - the label is the row's own first column. */}
      {label && <label className="text-base font-semibold text-slate-700 dark:text-slate-300">{label}</label>}
      {children}
    </div>
  );
}

function SettingInput({ label, settingKey, settings, onChange, placeholder, type = 'text', defaultValue }: {
  label: string; settingKey: string; settings: Record<string, any>; onChange: (key: string, value: string) => void; placeholder?: string; type?: string; defaultValue?: string;
}) {
  return (
    <FormField label={label}>
      <Input
        type={type}
        value={settings?.[settingKey] ?? defaultValue ?? ''}
        onChange={(e) => onChange(settingKey, e.target.value)}
        className="h-9 text-base bg-white dark:bg-slate-900 border-slate-200 focus-visible:ring-1 focus-visible:ring-blue-500/50"
        placeholder={placeholder || 'Not set'}
      />
    </FormField>
  );
}

function SettingSelect({ label, settingKey, options, settings, onChange, placeholder = 'Select', defaultValue }: {
  label: string; settingKey: string; options: string[]; settings: Record<string, any>; onChange: (key: string, value: string) => void; placeholder?: string; defaultValue?: string;
}) {
  const current = settings?.[settingKey] ? String(settings[settingKey]) : (defaultValue || null);
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
  const [detailTab, setDetailTab] = useState('details');
  // Page tabs: Job Profiles | Company Defaults | Letter Templates. Opened on
  // a given tab via ?tab= (e.g. the old /letters/settings route redirects to
  // ?tab=letters) - read once on mount rather than via useSearchParams, which
  // would need a Suspense boundary around the whole page.
  const [pageTab, setPageTab] = useState('profiles');
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'profiles' || tab === 'company' || tab === 'letters') setPageTab(tab);
  }, []);

  // Clauses tab: selected section (left column), clause search, and which
  // clause card is expanded.
  const [linkSectionKey, setLinkSectionKey] = useState<string>(CONTRACT_SECTIONS[0].key);
  const [linkSearch, setLinkSearch] = useState('');
  const [expandedClauseId, setExpandedClauseId] = useState<string | null>(null);

  const [draft, setDraft] = useState<EcJobProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDepartment, setCreateDepartment] = useState('');
  const [creating, setCreating] = useState(false);

  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());
  const [copySearch, setCopySearch] = useState('');
  const [copying, setCopying] = useState(false);

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
      const [globalData, allData] = await Promise.all([
        fetchGlobalJobProfiles(),
        fetchJobProfiles(),
      ]);
      setProfiles(globalData);
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

  useEffect(() => { setDetailTab('details'); setExpandedClauseId(null); }, [selectedProfileId]);

  const isDirty = useMemo(() => {
    if (!draft || !selectedProfile) return false;
    return JSON.stringify(draft) !== JSON.stringify(selectedProfile);
  }, [draft, selectedProfile]);

  // Re-fetches everything the initial mount fetches (companies, clause
  // library, job profiles) and re-syncs the open profile's draft, so data
  // changed in another tab/browser shows up here too. Refusing to run while
  // there are unsaved edits prevents the refresh from silently discarding
  // them, and the toast confirms what happened either way.
  const handleRefresh = async () => {
    if (isRefreshing) return;
    if (isDirty) {
      toast({ title: 'Unsaved changes', description: 'Save your edits before refreshing to avoid losing them.', variant: 'destructive' });
      return;
    }
    setIsRefreshing(true);
    try {
      const [comps, allClauses, allData] = await Promise.all([fetchCompanies(), fetchClauses(), fetchJobProfiles()]);
      setCompanies(comps);
      setClauses(allClauses);
      setAllProfiles(allData);
      setProfiles(
        selectedCompanyId === '__general__'
          ? allData.filter((p) => !p.company_id)
          : selectedCompanyId
          ? allData.filter((p) => String(p.company_id) === selectedCompanyId)
          : allData
      );
      if (selectedProfileId) {
        const fresh = allData.find((p) => p.id === selectedProfileId) || null;
        if (fresh) setDraft({ ...fresh });
        else setSelectedProfileId(null);
      }
      toast({ title: 'Data refreshed', description: 'Companies, clauses and job profiles reloaded.' });
    } catch {
      toast({ title: 'Refresh failed', description: 'Something went wrong reloading the data.', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  };

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

  const openNew = () => {
    setCreateName('');
    setCreateDepartment('');
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!createName.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const created = await createJobProfile({
        // Company/Department Defaults scopes are retired for now - nothing
        // in the resolution cascade reads them (see resolveEffectiveClauses
        // in utils/clauseEngine.ts). Every profile created here is a
        // self-contained Position profile.
        scope: 'position',
        company_id: selectedCompanyId === '__general__' ? null : selectedCompanyId,
        name: createName.trim(),
        department: createDepartment.trim() || null,
        is_active: true,
        settings: {},
        theme_settings: {},
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

  // Opens the destination picker for copying the selected profile - starts
  // with nothing checked so the user always makes an explicit choice.
  const openCopyDialog = () => {
    if (!selectedProfile) return;
    setCopyTargets(new Set());
    setCopySearch('');
    setCopyOpen(true);
  };

  const toggleCopyTarget = (id: string) => {
    setCopyTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConfirmCopy = async () => {
    if (!selectedProfile || copyTargets.size === 0) return;
    setCopying(true);
    try {
      const { id, created_at, updated_at, ...rest } = selectedProfile;
      const targets = Array.from(copyTargets);
      const created = await Promise.all(
        targets.map((targetId) =>
          createJobProfile({
            ...rest,
            company_id: targetId === '__general__' ? null : targetId,
            // A copy landing back in the same workspace it came from needs a
            // distinct name so it doesn't look identical in the list; a copy
            // moving to a different company/Global can keep the original name.
            name: targetId === String(selectedProfile.company_id ?? '__general__')
              ? `${selectedProfile.name} (Copy)`
              : selectedProfile.name,
          })
        )
      );
      const succeeded = created.filter((p): p is EcJobProfile => !!p);
      await loadProfiles(selectedCompanyId);
      if (succeeded.length === 1) setSelectedProfileId(succeeded[0].id);
      setCopyOpen(false);
      toast({
        title: succeeded.length > 1 ? `Copied to ${succeeded.length} destinations` : 'Profile copied',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to copy profile', variant: 'destructive' });
    } finally {
      setCopying(false);
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

  // Unlike sampleEmployee.companyId above (which defaults to 0 for typing
  // convenience elsewhere), this stays null when no real company is selected
  // ('__general__' or empty) - so MasterFieldEditControl's canEditWith check
  // (companyId != null) correctly treats "no company" as "nothing to save
  // against" instead of silently trying to write against a fake id 0.
  const realCompanyId = selectedCompanyId && selectedCompanyId !== '__general__' ? (Number(selectedCompanyId) || null) : null;

  // Company-scoped master fields ARE real/editable here even though the
  // employee is a fake stand-in (individualId: 0 - see sampleEmployee above)
  // - company_id is genuinely real, so saving a company fact from this
  // preview is safe. Individual-scoped fields never resolve here either way,
  // so MasterFieldEditControl.canEditWith already hides their edit control.
  const { ecPlaceholders: previewPlaceholders, masterFieldValues: previewMasterFieldValues, masterFields: previewMasterFields, refresh: refreshPreviewMasterFields } = useMasterFieldValues(0, realCompanyId);
  // Company Fields row being edited (pencil) - its value text becomes the editor.
  const [editingCompanyField, setEditingCompanyField] = useState<{ placeholderId: string; masterFieldId: number } | null>(null);
  const companyFieldPlaceholders = useMemo(
    () => previewPlaceholders.filter((p) => p.source_kind === 'master_field' && p.entity_type?.includes('company')),
    [previewPlaceholders]
  );

  // The "Fields" tab (below) renders these directly instead of a hardcoded
  // field list, so a new settings-cascade placeholder added from Data
  // Sources shows up here automatically. This tab is bound to
  // draft.settings[p.key] - the placeholder's own token name, which is
  // exactly what source_kind='settings_cascade' reads in
  // standardPlaceholders.ts (effectiveSettings[key]) - NOT what 'job_profile'
  // means there (a literal column on the EcJobProfile row itself, e.g.
  // key_responsibilities/requirements, already covered by their own
  // dedicated tabs/editors). Deliberately NOT settings_key - that column is
  // just an admin-facing description of where the value comes from (e.g.
  // "Job Profile Settings"), expected to repeat across many placeholders, so
  // it can't double as the storage slot without different placeholders
  // silently sharing one value (see standardPlaceholders.ts for the full
  // history). Bucketed via SETTINGS_GROUPS (matched against each
  // placeholder's key), same panel layout the tab used to hardcode; anything
  // unmatched lands in "Other". See SETTINGS_TAB_EXCLUDED_KEYS above for why
  // signatory_name/signatory_title never show up here despite matching
  // source_kind='settings_cascade'.
  const settingsFields = useMemo(
    () => previewPlaceholders.filter((p) => p.source_kind === 'settings_cascade' && !SETTINGS_TAB_EXCLUDED_KEYS.has(p.key)),
    [previewPlaceholders]
  );
  const groupedSettingsFields = useMemo(() => {
    const groups = SETTINGS_GROUPS.map((g) => ({ ...g, fields: [] as EcPlaceholder[] }));
    const other: EcPlaceholder[] = [];
    for (const p of settingsFields) {
      const group = groups.find((g) => g.test.test(p.key));
      (group ? group.fields : other).push(p);
    }
    const all = other.length > 0 ? [...groups, { label: 'Other', description: undefined, test: /(?:)/, fields: other }] : groups;
    return all.filter((g) => g.fields.length > 0);
  }, [settingsFields]);

  // Company-wide Employment Contract Engine settings (signatory + each
  // company's own Job Level/Employment Type/Department vocabulary) - lives
  // in ec_company_settings, one row per company, not tied to any Job
  // Profile (Company/Department Defaults scopes are retired - see
  // handleCreate above). Rendered in the top-level "Company Details/
  // Defaults" tab, not per-profile.
  const [companySettings, setCompanySettings] = useState<EcCompanySettings | null>(null);
  // Draft copy for the list editors (Job Levels/Employment Types/
  // Departments) - these use StringListEditor, which fires onChange on
  // every keystroke/paste, so they can't write to the DB on every change
  // like the Signatory dropdown does. Edited locally, persisted via the
  // explicit "Save Lists" button instead.
  const [companyListsDraft, setCompanyListsDraft] = useState<{ job_levels: string[]; employment_types: string[]; departments: string[] }>({ job_levels: [], employment_types: [], departments: [] });
  const [savingCompanyLists, setSavingCompanyLists] = useState(false);
  const [syncingDepartments, setSyncingDepartments] = useState(false);
  const [directors, setDirectors] = useState<CompanyDirectorOption[]>([]);
  const [savingSignatory, setSavingSignatory] = useState(false);
  // Options for the Department picker (New Position Profile dialog) -
  // company's own configured vocabulary (ec_company_settings.departments)
  // merged with whatever's actually on employee records, falling back to
  // DEFAULT_DEPARTMENT_OPTIONS only when the company has neither yet. Kept
  // separate from companyListsDraft.departments (that one's an unsaved edit
  // buffer for the Company Details/Defaults list editor; this is the
  // read-only merged list an actual picker consumes).
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);

  useEffect(() => {
    if (realCompanyId == null) { setCompanySettings(null); setDirectors([]); return; }
    fetchCompanySettings(realCompanyId).then((settings) => {
      setCompanySettings(settings);
      setCompanyListsDraft({
        job_levels: settings?.job_levels || [],
        employment_types: settings?.employment_types || [],
        departments: settings?.departments || [],
      });
    });
    fetchCompanyDirectors(realCompanyId).then(setDirectors);
  }, [realCompanyId]);

  useEffect(() => {
    if (realCompanyId == null) { setDepartmentOptions([]); return; }
    let cancelled = false;
    fetchCompanyDepartmentsFromEmployees(realCompanyId).then((fromEmployees) => {
      if (cancelled) return;
      const configured = companySettings?.departments || [];
      const real = [...configured, ...fromEmployees];
      const source = real.length > 0 ? real : DEFAULT_DEPARTMENT_OPTIONS;
      const seen = new Map<string, string>();
      for (const d of source) {
        const trimmed = d.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (!seen.has(key)) seen.set(key, trimmed);
      }
      setDepartmentOptions(Array.from(seen.values()).sort((a, b) => a.localeCompare(b)));
    });
    return () => { cancelled = true; };
  }, [realCompanyId, companySettings]);

  const handleSaveCompanyLists = async () => {
    if (realCompanyId == null) return;
    setSavingCompanyLists(true);
    const success = await upsertCompanySettings(realCompanyId, companyListsDraft);
    setSavingCompanyLists(false);
    if (success) {
      setCompanySettings((prev) => ({ ...(prev as EcCompanySettings || { id: '', company_id: String(realCompanyId), signatory_individual_id: null, created_at: '', updated_at: '' }), ...companyListsDraft }));
      toast({ title: 'Company lists saved' });
    } else {
      toast({ title: 'Error', description: 'Failed to save company lists', variant: 'destructive' });
    }
  };

  // Merges in any department name actually used by this company's employees
  // (case-insensitive) that isn't already in the draft list, rather than
  // replacing it outright - preserves department names someone typed here
  // deliberately (e.g. a not-yet-staffed department) instead of clobbering
  // them with what employees happen to be tagged with today.
  const handleSyncDepartmentsFromEmployees = async () => {
    if (realCompanyId == null) return;
    setSyncingDepartments(true);
    const found = await fetchCompanyDepartmentsFromEmployees(realCompanyId);
    setSyncingDepartments(false);
    if (found.length === 0) {
      toast({ title: 'No departments found', description: 'No employees with a department are on record for this company yet.' });
      return;
    }
    const existingKeys = new Set(companyListsDraft.departments.map((d) => d.toLowerCase()));
    const additions = found.filter((d) => !existingKeys.has(d.toLowerCase()));
    if (additions.length === 0) {
      toast({ title: 'Already up to date', description: 'Every department in use is already in this list.' });
      return;
    }
    setCompanyListsDraft((prev) => ({ ...prev, departments: [...prev.departments, ...additions] }));
    toast({ title: 'Departments added', description: `Added ${additions.length} department${additions.length === 1 ? '' : 's'} from employee records. Click "Save Lists" to keep them.` });
  };

  const handleChangeSignatory = async (directorId: string) => {
    if (realCompanyId == null) return;
    const nextId = directorId === '__unset__' ? null : Number(directorId);
    setSavingSignatory(true);
    const success = await upsertCompanySettings(realCompanyId, { signatory_individual_id: nextId });
    setSavingSignatory(false);
    if (success) {
      setCompanySettings((prev) => ({ ...(prev as EcCompanySettings || { id: '', company_id: String(realCompanyId), job_levels: [], employment_types: [], departments: [], created_at: '', updated_at: '' }), signatory_individual_id: nextId }));
      toast({ title: 'Signatory updated' });
    } else {
      toast({ title: 'Error', description: 'Failed to update signatory', variant: 'destructive' });
    }
  };

  // DB column defaults to '{}' - merge with the engine's defaults so the
  // preview always works with a complete theme set. Hoisted to component
  // scope because both the theme sidebar panel and the preview panel (which
  // sit in separate JSX scopes below) consume it.
  const draftTheme: ContractThemeSettings = { ...DEFAULT_CONTRACT_THEME, ...(draft?.theme_settings || {}) };

  return (
    <div className="h-[calc(100vh-1rem)] w-full flex flex-col bg-slate-50/50 dark:bg-slate-950/50 rounded-xl overflow-hidden shadow-[0_2px_10px_-3px_rgba(55,107,174,0.15)] border border-slate-200 dark:border-slate-800">

      <Tabs value={pageTab} onValueChange={setPageTab} className="flex-1 flex flex-col overflow-hidden">
      {/* GLOBAL HEADER - one compact row: company, page tabs, actions. */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0 relative z-20 flex-wrap">
        {/* Company - letter types are global, so the picker is off on that tab. */}
        <Popover open={companyDropdownOpen} onOpenChange={setCompanyDropdownOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              role="combobox"
              aria-expanded={companyDropdownOpen}
              disabled={pageTab === 'letters'}
              title={pageTab === 'letters' ? 'Letter templates apply to every company' : 'Switch company'}
              className="h-9 px-2 -ml-2 justify-start hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 max-w-[320px] disabled:opacity-100"
            >
              <Building2 className="h-4 w-4 shrink-0 text-custom-blue" />
              <span className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                {pageTab === 'letters'
                  ? 'All companies'
                  : selectedCompanyId === '__general__' ? 'General (No Company)' : companies.find(c => String(c.id) === selectedCompanyId)?.company_name || 'Select company...'}
              </span>
              {pageTab !== 'letters' && <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0 rounded-xl shadow-xl" align="start">
            <Command>
              <CommandInput placeholder="Search companies..." className="h-10 text-base" />
              <CommandList>
                <CommandEmpty>No company found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="General (No Company)"
                    onSelect={() => { setSelectedCompanyId('__general__'); setSelectedProfileId(null); setCompanyDropdownOpen(false); }}
                    className="text-base font-medium"
                  >
                    <Check className={cn("mr-2 h-4 w-4 text-blue-600", selectedCompanyId === '__general__' ? "opacity-100" : "opacity-0")} />
                    General (No Company)
                    <Badge variant="secondary" className="ml-auto text-sm">{allProfiles.filter((p) => !p.company_id).length}</Badge>
                  </CommandItem>
                  {companies.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.company_name}
                      onSelect={() => { setSelectedCompanyId(String(c.id)); setSelectedProfileId(null); setCompanyDropdownOpen(false); }}
                      className="text-base font-medium"
                    >
                      <Check className={cn("mr-2 h-4 w-4 text-blue-600", selectedCompanyId === String(c.id) ? "opacity-100" : "opacity-0")} />
                      {c.company_name}
                      <Badge variant="secondary" className="ml-auto text-sm">{companyCounts[c.id] || 0}</Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <TabsList className="h-auto p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200/80 dark:border-slate-700 gap-1">
          {([
            { value: 'profiles', label: 'Job Profiles', icon: Briefcase },
            { value: 'company', label: 'Company Defaults', icon: Building2 },
            { value: 'letters', label: 'Letter Templates', icon: Mail },
          ] as const).map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="h-8 px-3 gap-1.5 rounded-md text-base font-medium text-slate-600 dark:text-slate-300 data-[state=active]:bg-custom-blue data-[state=active]:text-white data-[state=active]:shadow-xs"
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            title="Reload companies, clauses and job profiles"
            className="h-9 gap-1.5 text-base shrink-0"
          >
            {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </Button>

          {/* Panel toggles - only the Job Profiles tab has these panels. */}
          {pageTab === 'profiles' && (
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
          )}
        </div>
      </div>

        <TabsContent value={'profiles'} className="flex-1 w-full relative overflow-auto bg-transparent">
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
                      <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 tracking-tight">Saved Profiles</h2>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full px-2.5 font-bold text-sm">{filteredProfiles.length}</Badge>
                    </div>
                    <div className="relative shadow-sm rounded-full">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input placeholder="Search profiles..." className="pl-9 h-10 rounded-full text-base bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-1 focus-visible:ring-blue-500/50 transition-all" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    <Button size="sm" className="h-10 w-full rounded-full text-base bg-custom-blue hover:bg-[#2d5a94] dark:bg-blue-600 dark:hover:bg-blue-700 text-white shadow-sm transition-all" disabled={!selectedCompanyId && selectedCompanyId !== '__general__'} onClick={openNew}>
                      <PlusCircle className="h-4 w-4 mr-2" /> Add Profile
                    </Button>
                  </div>

                  <ScrollArea className="flex-1 bg-transparent">
                    {isLoading ? (
                      <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                    ) : filteredProfiles.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-40 text-center m-6">
                        <div className="w-14 h-14 bg-white dark:bg-slate-900 shadow-sm border border-slate-200 rounded-2xl flex items-center justify-center mb-3">
                          <Briefcase className="h-6 w-6 text-slate-300" />
                        </div>
                        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">No profiles found</h3>
                        <p className="text-sm text-slate-500 mt-1">Create a new profile to start.</p>
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
                                <p className="text-sm text-slate-500 truncate mt-0.5 font-medium">
                                  {profile.department || scopeLabel(profile.scope)}
                                </p>
                              </div>
                              {profile.is_active === false && (
                                <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full text-slate-500 bg-slate-100 dark:bg-slate-800 mt-1 shrink-0">
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
                <PanelResizeHandle className="relative w-2 bg-slate-200/50 dark:bg-slate-800/50 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-10" />
              )}

              {/* PANEL 2: MAIN EDITOR */}
              <Panel
                ref={detailPanelRef}
                defaultSize={48}
                minSize={25}
                collapsible
                onCollapse={() => setCollapsed(prev => ({ ...prev, detail: true }))}
                onExpand={() => setCollapsed(prev => ({ ...prev, detail: false }))}
              >
                <div className="h-full w-full flex flex-col bg-slate-50/40 dark:bg-slate-950/40 relative border-r border-slate-200 dark:border-slate-800">
                  {draft && selectedProfile ? (() => {
                    const linkedSections = CONTRACT_SECTIONS.filter((s) => !!draft.section_clauses?.[s.key]).length;
                    const completedFields = settingsFields.filter((p) => !!(draft.settings || {})[p.key] || !!p.default_value).length;
                    const detailTabs = [
                      { value: 'details', label: 'Details', icon: Briefcase },
                      { value: 'fields', label: `Fields ${completedFields}/${settingsFields.length}`, icon: Database },
                      { value: 'clauses', label: `Clauses ${linkedSections}/${CONTRACT_SECTIONS.length}`, icon: LinkIcon },
                    ];
                    return (
                      <>
                        {/* Compact editor header - name, status, save; then the tab switch. */}
                        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 space-y-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {(() => {
                              const visual = getProfileVisual(draft.department);
                              return (
                                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', visual.classes)} title={draft.department || 'No department'}>
                                  <visual.icon className="w-4 h-4" />
                                </div>
                              );
                            })()}
                            <input
                              value={draft.name}
                              onChange={(e) => updateDraft({ name: e.target.value })}
                              className="flex-1 min-w-0 text-base font-semibold text-slate-900 dark:text-slate-100 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 px-2 h-9 -ml-2 rounded-md outline-none border border-transparent focus:border-slate-300 dark:focus:border-slate-700 focus:bg-white dark:focus:bg-slate-950 transition-colors truncate"
                              title="Profile name"
                            />
                            <button
                              type="button"
                              onClick={() => updateDraft({ is_active: !draft.is_active })}
                              title="Toggle active status"
                              className={cn(
                                'text-xs px-2.5 h-6 rounded-full font-bold uppercase tracking-wide shrink-0 transition-colors',
                                draft.is_active ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                              )}
                            >
                              {draft.is_active ? 'Active' : 'Inactive'}
                            </button>
                            <Button variant="outline" size="sm" className="h-9 px-3 text-base shrink-0" onClick={handleCancelEdits} disabled={!isDirty || saving}>Cancel</Button>
                            <div className="flex rounded-md bg-custom-blue shrink-0">
                              <Button size="sm" className="h-9 bg-transparent hover:bg-[#2d5a94] text-white rounded-r-none border-r border-[#2d5a94]/50 text-base font-semibold px-3 disabled:opacity-60" onClick={handleSaveProfile} disabled={!isDirty || saving}>
                                {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                                Save
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" className="h-9 bg-transparent hover:bg-[#2d5a94] text-white rounded-l-none px-2">
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem className="cursor-pointer text-base" onClick={openCopyDialog}>
                                    <Copy className="h-4 w-4 mr-2 text-slate-400" /> Copy Profile To...
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="cursor-pointer text-base text-red-600 focus:text-red-600 focus:bg-red-50" onClick={() => setDeletingId(selectedProfile.id)}>
                                    <Trash2 className="h-4 w-4 mr-2" /> Delete Profile
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200/80 dark:border-slate-700 w-fit max-w-full overflow-x-auto">
                            {detailTabs.map((tab) => (
                              <button
                                key={tab.value}
                                onClick={() => setDetailTab(tab.value)}
                                className={cn(
                                  'flex items-center gap-1.5 px-3 h-8 rounded-md text-base font-medium whitespace-nowrap transition-colors',
                                  detailTab === tab.value ? 'bg-custom-blue text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700'
                                )}
                              >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Clauses keeps its own two-column layout (sections | clause cards),
                            filling the panel's height - each column scrolls on its own. */}
                        {detailTab === 'clauses' ? (
                          <div className="flex-1 min-h-0">
                                  <div className="bg-slate-50 dark:bg-slate-950 flex h-full border-b border-slate-200 dark:border-slate-800">

                                    {/* Col 1: Sections (Sidebar style) */}
                                    <div className="w-[260px] border-r border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/30 flex flex-col shrink-0">
                                      <div className="p-5 border-b border-slate-200 dark:border-slate-800 space-y-3.5 bg-slate-50/50">
                                        <div>
                                          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">Contract Sections</p>
                                          <p className="text-sm text-slate-500 mt-0.5 font-medium">{CONTRACT_SECTIONS.length} sections to configure</p>
                                        </div>
                                        <div className="flex gap-2">
                                          <Button variant="outline" size="sm" className="flex-1 text-sm h-8 bg-white border-slate-200 shadow-sm hover:bg-blue-50 hover:text-blue-700" onClick={handleAutoFillDefaults}>Apply Defaults</Button>
                                          <Button variant="outline" size="sm" className="px-3 text-sm h-8 text-red-600 border-slate-200 bg-white shadow-sm hover:bg-red-50 hover:border-red-200" onClick={handleClearAllSelections} title="Clear All">Clear</Button>
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
                                                className={cn("flex items-center justify-between p-3 rounded-xl text-base font-semibold cursor-pointer transition-all", section.key === linkSectionKey ? "bg-white shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)] border border-slate-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800/50 dark:text-blue-400" : "text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800 border border-transparent")}
                                              >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                  {hasSelection ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <FileText className="w-4 h-4 shrink-0 opacity-40" />}
                                                  <span className="truncate">{section.title}</span>
                                                </div>
                                                <Badge variant="secondary" className={cn("text-sm h-4.5 px-2 min-w-[20px] flex items-center justify-center shrink-0 rounded-full font-bold", section.key === linkSectionKey ? "bg-blue-100 text-blue-700" : "bg-slate-200/70 text-slate-500")}>{count}</Badge>
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
                                          <p className="text-base text-slate-500 mt-1">Select a clause to apply to this section.</p>
                                        </div>
                                        <div className="relative w-[280px]">
                                          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                          <Input placeholder="Search clauses in section..." className="pl-9 h-10 rounded-full text-base bg-white border-slate-200 shadow-sm focus-visible:ring-1 focus-visible:ring-blue-500/50" value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} />
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
                                              <p className={cn("text-base font-semibold", !draft?.section_clauses?.[linkSectionKey] ? "text-blue-700" : "text-slate-600")}>No Clause</p>
                                              <p className="text-sm text-slate-500 mt-0.5">
                                                This section is left out of the contract until you apply a clause below.
                                                {defaultClauseMap[linkSectionKey] && <> Suggested: <span className="font-semibold">{clausesById[defaultClauseMap[linkSectionKey]]?.label}</span>.</>}
                                              </p>
                                            </div>
                                            <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0", !draft?.section_clauses?.[linkSectionKey] ? "border-custom-blue bg-custom-blue" : "border-slate-300")}>
                                              {!draft?.section_clauses?.[linkSectionKey] && <Check className="w-3.5 h-3.5 text-white" />}
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
                                                        <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">{clause.label}</h4>
                                                        {clause.is_default && <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs py-0 px-2 uppercase tracking-wider font-bold rounded-md">Default</Badge>}
                                                        {clause.company_id && <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-xs py-0 px-2 uppercase tracking-wider font-bold rounded-md">Company specific</Badge>}
                                                      </div>
                                                      <div className="flex items-center gap-4 text-sm text-slate-500 font-medium">
                                                        <span className="font-mono text-sm bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{clause.clause_key}</span>
                                                        <span>Used in {usageCount} profile{usageCount !== 1 ? 's' : ''}</span>
                                                      </div>
                                                    </div>

                                                    <div className="flex items-center gap-6 shrink-0">
                                                      {/* The Selection Button */}
                                                      <Button
                                                        size="sm"
                                                        variant={isSelected ? "default" : "outline"}
                                                        className={cn("h-10 rounded-full px-5 text-base font-semibold shadow-sm transition-all", isSelected ? "bg-custom-blue text-white" : "bg-white text-slate-700 hover:bg-slate-50")}
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          updateDraftSectionClauses((prev) => ({ ...prev, [linkSectionKey]: clause.id }));
                                                          if (!isExpanded) setExpandedClauseId(clause.id);
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
                                                                  <span key={p} className="text-sm font-mono bg-blue-50 text-blue-700 px-2 py-1 rounded-md">{'{{' + p + '}}'}</span>
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
                                                          <div className="bg-white border border-slate-200 rounded-xl p-5 text-base text-slate-500 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]">
                                                            No automated rules. Manual selection only.
                                                          </div>
                                                        ) : (
                                                          <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]">
                                                            <ul className="space-y-3 text-sm">
                                                              {Object.entries(conditions[0] || {}).filter(([, v]) => v).map(([key, value]) => {
                                                                const matches = facts[key as keyof typeof facts] === value;
                                                                return (
                                                                  <li key={key} className="flex justify-between items-center gap-3 border-b border-emerald-100/50 pb-2 last:border-0 last:pb-0">
                                                                    <span className="text-slate-600 font-medium capitalize">{key.replace(/_/g, ' ')}: <span className="font-bold text-slate-800">{value}</span></span>
                                                                    {matches ? (
                                                                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-sm px-1.5 py-0 border-transparent shadow-none">Matches</Badge>
                                                                    ) : (
                                                                      <Badge variant="outline" className="text-slate-400 text-sm px-1.5 py-0 shadow-none">No match</Badge>
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
                          </div>
                        ) : (
                        <ScrollArea className="flex-1">
                          <div className="p-4 space-y-4">
                            {detailTab === 'details' && (
                              <SettingsTable>
                                <SettingsGroupRow icon={Briefcase} accent="blue" label="Profile" description="The facts that match this profile to an employee." />
                                <SettingsRow label="Job Title">
                                  <Input value={draft.job_title || ''} onChange={(e) => updateDraft({ job_title: e.target.value })} className="h-9 text-base border-slate-200" placeholder="e.g. Software Developer" />
                                </SettingsRow>
                                <SettingsRow label="Department">
                                  <SearchableSelect
                                    value={draft.department || '__unset__'}
                                    onChange={(v) => updateDraft({ department: v === '__unset__' ? null : v })}
                                    placeholder="Select department"
                                    searchPlaceholder="Search departments..."
                                    options={[{ value: '__unset__', label: 'Not set' }, ...withCurrentValue(departmentOptions, draft.department).map((opt) => ({ value: opt, label: opt }))]}
                                  />
                                </SettingsRow>
                                <SettingsRow label="Employment Type">
                                  <SearchableSelect
                                    value={draft.employment_type || '__unset__'}
                                    onChange={(v) => updateDraft({ employment_type: v === '__unset__' ? null : v })}
                                    placeholder="Select type"
                                    searchPlaceholder="Search employment types..."
                                    options={[{ value: '__unset__', label: 'Not set' }, ...withCurrentValue(EMPLOYMENT_TYPE_OPTIONS, draft.employment_type).map((opt) => ({ value: opt, label: opt }))]}
                                  />
                                </SettingsRow>

                                <SettingsGroupRow icon={UserCog} accent="amber" label="Role" description="Listed in the contract's duties and appendix." />
                                <SettingsRow label="Key Responsibilities" alignTop>
                                  <StringListEditor items={draft.key_responsibilities || []} onChange={(v) => updateDraft({ key_responsibilities: v })} placeholder="e.g. Maintain accurate financial records" />
                                </SettingsRow>
                                <SettingsRow label="Equipment" alignTop>
                                  <StringListEditor items={draft.equipment || []} onChange={(v) => updateDraft({ equipment: v })} placeholder="e.g. Company laptop" />
                                </SettingsRow>

                                <SettingsGroupRow icon={Tag} accent="purple" label="Organisation" description="Labels used to group and find this profile." />
                                <SettingsRow label="Tags" alignTop>
                                  <StringListEditor items={draft.tags || []} onChange={(v) => updateDraft({ tags: v })} placeholder="e.g. Finance" />
                                </SettingsRow>
                              </SettingsTable>
                            )}

                            {/* Data-driven: whatever ec_placeholders rows are
                                source_kind = 'settings_cascade' (Data Sources admin) -
                                what standardPlaceholders.ts reads out of
                                effectiveSettings, i.e. exactly draft.settings. Grouped
                                via SETTINGS_GROUPS; a placeholder added there shows up
                                here with no code change. A field's default_value shows
                                as its value until overridden. */}
                            {detailTab === 'fields' && (
                              settingsFields.length === 0 ? (
                                <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                                  <p className="text-base text-slate-500">No settings fields configured yet - add them from Data Sources.</p>
                                </div>
                              ) : (
                                <SettingsTable>
                                  {groupedSettingsFields.map((group) => (
                                    <Fragment key={group.label}>
                                      <SettingsGroupRow
                                        label={group.label}
                                        description={group.description}
                                        icon={(SETTINGS_GROUP_STYLE[group.label] || SETTINGS_GROUP_STYLE.Other).icon}
                                        accent={(SETTINGS_GROUP_STYLE[group.label] || SETTINGS_GROUP_STYLE.Other).accent}
                                        count={`${group.fields.filter((p) => !!(draft.settings || {})[p.key] || !!p.default_value).length}/${group.fields.length} set`}
                                      />
                                      {group.fields.map((p) => {
                                        const options = KNOWN_SELECT_OPTIONS[p.key];
                                        const inputType = KNOWN_INPUT_TYPES[p.key];
                                        return (
                                          <SettingsRow key={p.id} label={p.label} title={p.settings_key ? `${p.label} - ${p.settings_key}` : p.label}>
                                            {options ? (
                                              <SettingSelect label="" settingKey={p.key} options={options} settings={draft.settings || {}} onChange={updateDraftSettings} defaultValue={p.default_value || undefined} />
                                            ) : (
                                              <SettingInput label="" settingKey={p.key} settings={draft.settings || {}} onChange={updateDraftSettings} placeholder={p.default_value || p.description || 'Not set'} defaultValue={p.default_value || undefined} type={inputType || 'text'} />
                                            )}
                                          </SettingsRow>
                                        );
                                      })}
                                    </Fragment>
                                  ))}
                                </SettingsTable>
                              )
                            )}

                          </div>
                        </ScrollArea>
                        )}
                      </>
                    );
                  })() : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-12">
                      <FileText className="w-10 h-10 text-slate-300 mb-3" />
                      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">No profile selected</h3>
                      <p className="text-base text-slate-500 max-w-[280px] mt-1">Select a job profile on the left, or add a new one.</p>
                    </div>
                  )}
                </div>
              </Panel>

              {!collapsed.preview && (
                <PanelResizeHandle className="relative w-2 bg-slate-200/50 dark:bg-slate-800/50 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-10" />
              )}

              {/* PANEL 3: PREVIEW (Document Style) */}
              <Panel
                ref={previewPanelRef}
                defaultSize={30}
                minSize={15}
                maxSize={80}
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
                      defaultTheme={draftTheme}
                      onThemeChange={(s) => updateDraft({ theme_settings: s })}
                      className="flex flex-col h-full bg-slate-100/70 dark:bg-slate-950/70 relative"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
                      <p className="text-base font-medium text-slate-500">Select a profile to preview document</p>
                    </div>
                  )}
                </div>
              </Panel>

            </PanelGroup>
        </TabsContent>

        <TabsContent value="letters" className="flex-1 min-h-0 w-full overflow-hidden mt-0">
          <LetterTemplatesTab />
        </TabsContent>

        <TabsContent value="company" className="flex-1 min-h-0 w-full overflow-hidden mt-0">
          {realCompanyId == null ? (
            <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
              <p className="text-base font-medium text-slate-500">Select a company from the header above to manage its Employment Contract settings.</p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              {/* Company-wide settings shared by every Job Profile under this
                  company - same two-column table design as the profile editor. */}
              <div className="p-4 max-w-5xl space-y-4">
                <SettingsTable>
                  <SettingsGroupRow icon={FileSignature} accent="emerald" label="Signatory" description="Signs the contract on the company's behalf - used by every job profile here." />
                  <SettingsRow label="Signatory Director">
                    <SearchableSelect
                      value={companySettings?.signatory_individual_id != null ? String(companySettings.signatory_individual_id) : '__unset__'}
                      onChange={handleChangeSignatory}
                      placeholder={directors.length === 0 ? 'No directors found for this company' : 'Select a director'}
                      searchPlaceholder="Search directors..."
                      disabled={savingSignatory || directors.length === 0}
                      options={[{ value: '__unset__', label: 'Not set' }, ...directors.map((d) => ({ value: String(d.id), label: d.full_name }))]}
                    />
                  </SettingsRow>

                  <SettingsGroupRow
                    icon={ListChecks}
                    accent="blue"
                    label="Picker Lists"
                    description="This company's own options for the job profile pickers. Leave a list empty to use the generic defaults."
                    action={
                      <Button size="sm" onClick={handleSaveCompanyLists} disabled={savingCompanyLists} className="h-8 text-sm">
                        {savingCompanyLists && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Save lists
                      </Button>
                    }
                  />
                  <SettingsRow label="Job Levels" alignTop>
                    <StringListEditor
                      items={companyListsDraft.job_levels}
                      onChange={(v) => setCompanyListsDraft((prev) => ({ ...prev, job_levels: v }))}
                      placeholder="e.g. Senior"
                    />
                  </SettingsRow>
                  <SettingsRow label="Employment Types" alignTop>
                    <StringListEditor
                      items={companyListsDraft.employment_types}
                      onChange={(v) => setCompanyListsDraft((prev) => ({ ...prev, employment_types: v }))}
                      placeholder="e.g. Permanent"
                    />
                  </SettingsRow>
                  <SettingsRow
                    alignTop
                    label={
                      <div className="space-y-1">
                        <div>Departments</div>
                        <button
                          type="button"
                          onClick={handleSyncDepartmentsFromEmployees}
                          disabled={syncingDepartments}
                          className="text-sm font-medium text-custom-blue hover:underline disabled:opacity-50 disabled:no-underline inline-flex items-center gap-1"
                          title="Add any department in use by this company's employees but missing from this list"
                        >
                          {syncingDepartments && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Sync from employees
                        </button>
                      </div>
                    }
                  >
                    <StringListEditor
                      items={companyListsDraft.departments}
                      onChange={(v) => setCompanyListsDraft((prev) => ({ ...prev, departments: v }))}
                      placeholder="e.g. Finance"
                    />
                  </SettingsRow>

                  {companyFieldPlaceholders.length > 0 && (
                    <>
                      <SettingsGroupRow
                        icon={Database}
                        accent="amber"
                        label="Company Fields"
                        count={companyFieldPlaceholders.length}
                        description="Company facts used by this company's clauses - editing one saves it to the company record."
                      />
                      {companyFieldPlaceholders.map((p) => {
                        const val = previewMasterFieldValues[p.key] || '';
                        return (
                          <SettingsRow key={p.id} label={p.label}>
                            {editingCompanyField?.placeholderId === p.id ? (
                              <SourceValueEditor
                                placeholder={p}
                                masterFieldId={editingCompanyField.masterFieldId}
                                masterFields={previewMasterFields}
                                individualId={null}
                                companyId={realCompanyId}
                                initialValue={linkedMasterFieldIds(p).length === 1 ? val : undefined}
                                onDone={() => setEditingCompanyField(null)}
                                onSaved={refreshPreviewMasterFields}
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="flex-1 truncate">
                                  {val || <span className="italic text-amber-600">No value</span>}
                                </span>
                                <MasterFieldEditControl
                                  placeholder={p}
                                  masterFields={previewMasterFields}
                                  individualId={null}
                                  companyId={realCompanyId}
                                  onStartEdit={(masterFieldId) => setEditingCompanyField({ placeholderId: p.id, masterFieldId })}
                                />
                              </div>
                            )}
                          </SettingsRow>
                        );
                      })}
                    </>
                  )}
                </SettingsTable>
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6 shadow-xl border-slate-200">
          <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            New Position Profile
          </DialogTitle>
          <div className="space-y-5 pt-5">
            <div className="space-y-2">
              <label className="text-base font-semibold text-slate-700 dark:text-slate-300">Profile Name</label>
              <Input autoFocus value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. Senior Accountant" className="h-10 rounded-xl text-base shadow-sm border-slate-200" />
            </div>
            <div className="space-y-2">
              <label className="text-base font-semibold text-slate-700 dark:text-slate-300">Department</label>
              <SearchableSelect
                value={createDepartment || '__unset__'}
                onChange={(v) => setCreateDepartment(v === '__unset__' ? '' : v)}
                placeholder="Select a department"
                searchPlaceholder="Search departments..."
                className="rounded-xl"
                options={[
                  { value: '__unset__', label: 'Not set' },
                  ...withCurrentValue(departmentOptions, createDepartment).map((opt) => ({ value: opt, label: opt })),
                ]}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-8">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} className="rounded-full font-semibold text-slate-600 hover:bg-slate-100">Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="rounded-full font-semibold bg-custom-blue hover:bg-[#2d5a94] text-white shadow-sm px-6">{creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Create Profile</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6 shadow-xl border-slate-200 flex flex-col max-h-[80vh]">
          <DialogTitle className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Copy "{selectedProfile?.name}" To...
          </DialogTitle>
          <p className="text-base text-slate-500 -mt-3">Select one or more destinations. A copy is created in each.</p>

          <div className="relative shadow-sm rounded-full shrink-0 mt-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search companies..."
              className="pl-9 h-10 rounded-full text-base bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              value={copySearch}
              onChange={(e) => setCopySearch(e.target.value)}
            />
          </div>

          <ScrollArea className="flex-1 -mx-2 px-2 my-2 border border-slate-200 dark:border-slate-800 rounded-xl">
            <div className="flex flex-col p-1.5">
              {'general (no company)'.includes(copySearch.toLowerCase()) && (
                <label
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  onClick={() => toggleCopyTarget('__general__')}
                >
                  <Checkbox checked={copyTargets.has('__general__')} />
                  <span className="text-base font-medium text-slate-700 dark:text-slate-300">General (No Company)</span>
                  <Badge variant="secondary" className="ml-auto text-xs uppercase tracking-wide">Global</Badge>
                </label>
              )}
              {companies
                .filter((c) => c.company_name.toLowerCase().includes(copySearch.toLowerCase()))
                .map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    onClick={() => toggleCopyTarget(String(c.id))}
                  >
                    <Checkbox checked={copyTargets.has(String(c.id))} />
                    <span className="text-base font-medium text-slate-700 dark:text-slate-300 truncate">{c.company_name}</span>
                  </label>
                ))}
            </div>
          </ScrollArea>

          <div className="flex justify-between items-center gap-3 pt-2 shrink-0">
            <span className="text-sm text-slate-500 font-medium">
              {copyTargets.size} selected
            </span>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setCopyOpen(false)} className="rounded-full font-semibold text-slate-600 hover:bg-slate-100">Cancel</Button>
              <Button onClick={handleConfirmCopy} disabled={copying || copyTargets.size === 0} className="rounded-full font-semibold bg-custom-blue hover:bg-[#2d5a94] text-white shadow-sm px-6">
                {copying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Copy Profile
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent className="rounded-2xl max-w-sm shadow-xl border-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold">Delete this profile?</AlertDialogTitle>
            <AlertDialogDescription className="text-base text-slate-500">This action cannot be undone.</AlertDialogDescription>
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
