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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Loader2, PlusCircle, Settings, Trash2, Briefcase, BookText,
  Search, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Columns2, FileText, Database, ChevronDown, ShieldCheck, Laptop2,
  Users, Megaphone, Car, LayoutTemplate, UserCog, FileCheck, Link as LinkIcon, PlayCircle,
  Copy, Download, AlertCircle, CheckCircle2, ChevronRight, X, FileSignature,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { fetchCompanies, Company } from '../../companies/database';
import {
  EcJobProfile, fetchJobProfiles, createJobProfile, updateJobProfile, deleteJobProfile,
  JobProfileScope, findCompanyDefaults, findDepartmentDefaults,
} from '../utils/jobProfileData';
import { EcClause, fetchClauses } from '../utils/clauseLibraryData';
import {
  resolveEffectiveSettings, resolveEffectiveClauses, buildDefaultClauseMap, assembleContractHtml,
} from '../utils/clauseEngine';


import { buildStandardPlaceholderValues } from '../utils/standardPlaceholders';
import { replacePlaceholders } from '../../tasks-requirements/utils/templateFormatters';
import type { ContractEmployeeInfo } from '../utils/data';
import { CompaniesSidebar } from '../components/CompaniesSidebar';
import { CONTRACT_SECTIONS } from '../utils/contractStructure';
import { EMPLOYMENT_TYPE_OPTIONS, WORK_ARRANGEMENT_OPTIONS, withCurrentValue } from '../utils/profileOptions';

const SETTINGS_GROUPS: { label: string; test: RegExp }[] = [
  { label: 'Compensation & Benefits', test: /allowance|medical|pension|salary|payment/i },
  { label: 'Working Hours', test: /^working_|start_time|end_time|break_|rest_days|work_mode/i },
  { label: 'Leave', test: /leave_days$/i },
  { label: 'Termination & Probation', test: /notice_|probation_/i },
];

function groupSettings(settings: Record<string, any>): { label: string; items: [string, any][] }[] {
  const buckets = new Map<string, [string, any][]>();
  for (const group of SETTINGS_GROUPS) buckets.set(group.label, []);
  buckets.set('Other', []);

  for (const entry of Object.entries(settings || {})) {
    const group = SETTINGS_GROUPS.find((g) => g.test.test(entry[0]));
    buckets.get(group?.label || 'Other')!.push(entry);
  }
  return Array.from(buckets.entries())
    .map(([label, items]) => ({ label, items }))
    .filter((g) => g.items.length > 0);
}

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

// Which settings keys belong on which editable tab - mirrors SETTINGS_GROUPS
// above but split across the three thematic tabs instead of one dumping
// ground, plus "Contract Rules" catches anything that doesn't match any of
// them so no key is ever silently hidden.
const EMPLOYMENT_RULES_HINTS = [
  'notice_period', 'probation_period', 'probation_notice', 'termination_reason', 'confirmation_required',
  'confidentiality_policy', 'intellectual_property_policy', 'data_protection_policy', 'code_of_conduct_policy',
  'disciplinary_policy', 'company_property_policy',
];
const WORKING_ARRANGEMENT_HINTS = [
  'working_days', 'working_hours', 'start_time', 'end_time', 'break_duration', 'rest_days', 'work_mode',
  'remote_work_allowed', 'remote_days', 'weekend_work', 'weekend_approval_required', 'overtime_eligible',
  'overtime_approval_required', 'overtime_compensation',
];
const BENEFITS_HINTS = [
  'salary_currency', 'salary_min', 'salary_max', 'medical_cover', 'housing_allowance', 'transport_allowance', 'telephone_allowance', 'meal_allowance', 'internet_allowance', 'pension_scheme',
  'annual_leave_days', 'sick_leave_days', 'maternity_leave_days', 'paternity_leave_days', 'compassionate_leave_days',
  'payment_frequency', 'payment_day', 'bonus_scheme',
];
const ALL_KNOWN_SETTINGS_HINTS = ['reports_to', ...EMPLOYMENT_RULES_HINTS, ...WORKING_ARRANGEMENT_HINTS, ...BENEFITS_HINTS];

const JOB_LEVEL_OPTIONS = ['Entry Level', 'Junior', 'Mid-Level', 'Senior', 'Manager', 'Executive'];
const PROBATION_OPTIONS = ['Not Applicable', '1 Month', '3 Months', '6 Months'];
const NOTICE_OPTIONS = ['1 Week', '2 Weeks', '1 Month', '2 Months', '3 Months'];
const LEAVE_DAY_OPTIONS = ['7 Days', '14 Days', '21 Days', '30 Days', 'According to Company Policy'];
const PAYMENT_FREQUENCY_OPTIONS = ['Monthly', 'Bi-weekly', 'Weekly'];
const ALLOWANCE_OPTIONS = ['No', 'Optional', 'Yes', 'According to Company Policy'];

// Bullet-list editor for Requirements / Key Responsibilities - free-form
// prose lines, distinct from the short keyword chips TagListEditor handles.
function StringListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            className="h-8 text-xs bg-white dark:bg-slate-900"
            placeholder={placeholder}
            value={item}
            onChange={(e) => onChange(items.map((it, ii) => (ii === i ? e.target.value : it)))}
          />
          <button type="button" onClick={() => onChange(items.filter((_, ii) => ii !== i))} className="text-slate-400 hover:text-red-600 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => onChange([...items, ''])}>
        <PlusCircle className="h-3 w-3 mr-1.5" /> Add
      </Button>
    </div>
  );
}

// Chip editor for Skills / Job Tags / Equipment - type + Enter (or comma) to
// add, click the x to remove. Used for short keyword-style lists.
function TagListEditor({ items, onChange, placeholder, badgeClassName }: { items: string[]; onChange: (items: string[]) => void; placeholder: string; badgeClassName?: string }) {
  const [value, setValue] = useState('');
  const addTag = () => {
    const v = value.trim();
    if (!v || items.includes(v)) { setValue(''); return; }
    onChange([...items, v]);
    setValue('');
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item, i) => (
        <Badge key={i} variant="secondary" className={cn("font-medium text-[10px] py-0.5 pl-2.5 pr-1.5 h-6 flex items-center gap-1 border-transparent", badgeClassName || "bg-blue-50 text-blue-700 hover:bg-blue-100")}>
          {item}
          <button type="button" onClick={() => onChange(items.filter((_, ii) => ii !== i))} className="hover:opacity-70">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
        onBlur={addTag}
        placeholder={placeholder}
        className="text-xs h-6 px-2.5 border border-dashed border-slate-300 dark:border-slate-700 rounded-full outline-none focus:border-blue-400 bg-transparent w-36"
      />
    </div>
  );
}

// Editable key/value card for a thematic slice of the free-form `settings`
// bag. `hints` are the keys this card owns; clicking one that isn't set yet
// adds it, and a custom key/value row covers anything not in the list.
function SettingsEditorCard({ title, hints, settings, onChange, excludeKnown }: {
  title: string; hints: string[]; settings: Record<string, any>; onChange: (next: Record<string, any>) => void; excludeKnown?: boolean;
}) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const safeSettings = settings || {};
  const entries = excludeKnown
    ? Object.entries(safeSettings).filter(([k]) => !ALL_KNOWN_SETTINGS_HINTS.includes(k))
    : Object.entries(safeSettings).filter(([k]) => hints.includes(k));
  const remainingHints = hints.filter((h) => safeSettings[h] === undefined);

  const setKey = (key: string, value: string) => onChange({ ...safeSettings, [key]: value });
  const removeKey = (key: string) => { const next = { ...safeSettings }; delete next[key]; onChange(next); };

  return (
    <div className="bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
      <p className="text-sm font-bold text-slate-800 dark:text-slate-300 mb-4">{title}</p>
      <div className="space-y-2.5">
        {entries.length === 0 && <p className="text-xs text-slate-400 italic mb-1">Nothing set yet.</p>}
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-500 w-40 truncate shrink-0" title={key}>{key}</span>
            <Input className="h-8 text-xs flex-1 bg-white dark:bg-slate-900" value={String(value)} onChange={(e) => setKey(key, e.target.value)} />
            <button type="button" onClick={() => removeKey(key)} className="text-slate-400 hover:text-red-600 shrink-0"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      {remainingHints.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4">
          {remainingHints.map((hint) => (
            <button key={hint} type="button" onClick={() => setKey(hint, '')} className="text-[10px] font-mono text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-full px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-900 hover:text-slate-800 dark:hover:text-slate-200">
              + {hint}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
        <Input className="h-8 text-xs font-mono bg-white dark:bg-slate-900" placeholder="custom_key" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
        <Input className="h-8 text-xs bg-white dark:bg-slate-900" placeholder="value" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs shrink-0 px-2.5" onClick={() => { if (!newKey.trim()) return; setKey(newKey.trim(), newValue); setNewKey(''); setNewValue(''); }}>
          <PlusCircle className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function FormField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-[11px] font-semibold text-slate-500">{label}</label>
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
        className="h-9 text-xs bg-white dark:bg-slate-900"
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
      <Select value={current || '__unset__'} onValueChange={(v) => onChange(settingKey, v === '__unset__' ? '' : v)}>
        <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-900">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__unset__" className="text-slate-400 italic">Not set</SelectItem>
          {withCurrentValue(options, current).map((opt) => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

function SettingSwitch({ label, settingKey, settings, onChange }: {
  label: string; settingKey: string; settings: Record<string, any>; onChange: (key: string, value: string) => void;
}) {
  const checked = String(settings?.[settingKey] || '').toLowerCase() === 'yes';
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <Switch checked={checked} onCheckedChange={(next) => onChange(settingKey, next ? 'Yes' : 'No')} />
    </div>
  );
}

function SectionPanel({ title, description, children, className }: {
  title: string; description?: string; children: ReactNode; className?: string;
}) {
  return (
    <div className={cn("bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-sm", className)}>
      <div className="mb-4">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{title}</h3>
        {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export default function JobProfilesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
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

  // Local editable copy - every field on the page reads/writes `draft`, and
  // nothing hits the database until Save Changes. Re-syncs whenever the
  // selection changes OR the underlying profiles list refreshes (e.g. right
  // after a successful save), so a save clears the dirty state instead of
  // leaving stale local edits around.
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
  const updateDraftSettingsObject = (next: Record<string, any>) => updateDraft({ settings: next });

  const settingsGroups = useMemo(() => (draft ? groupSettings(draft.settings || {}) : []), [draft]);

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

  const handleDownloadJobDescription = () => {
    if (!draft) return;
    const parts = [`<h1>${draft.name}</h1>`];
    if (draft.job_title) parts.push(`<p><strong>${draft.job_title}</strong></p>`);
    if (draft.job_description) parts.push(`<p>${draft.job_description.replace(/\n/g, '<br/>')}</p>`);
    if (draft.key_responsibilities?.length) parts.push(`<h2>Key Responsibilities</h2><ul>${draft.key_responsibilities.map((r) => `<li>${r}</li>`).join('')}</ul>`);
    if (draft.requirements?.length) parts.push(`<h2>Requirements</h2><ul>${draft.requirements.map((r) => `<li>${r}</li>`).join('')}</ul>`);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${draft.name} Job Description</title></head><body>${parts.join('')}</body></html>`;
    saveAs(new Blob([html], { type: 'application/msword' }), `${draft.name.replace(/\s+/g, '_')}_Job_Description.doc`);
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

  // ── Preview tab: reuses the same cascade + assembly engine the real
  // Contract Editor uses, layered as Company Defaults -> Department Defaults
  // -> this profile (itself, always winning). A Job Profile isn't tied to a
  // real employee, so identity placeholders come from a clearly-labeled
  // sample employee - only the profile/company data is real.
  const companyDefaults = useMemo(() => (selectedCompanyId ? findCompanyDefaults(profiles, selectedCompanyId) : undefined), [profiles, selectedCompanyId]);
  const departmentDefaults = useMemo(() => (selectedCompanyId ? findDepartmentDefaults(profiles, selectedCompanyId, draft?.department) : undefined), [profiles, selectedCompanyId, draft?.department]);

  const previewEffectiveSettings = useMemo(() => resolveEffectiveSettings([
    companyDefaults, departmentDefaults, draft ? { settings: draft.settings } : null,
  ]), [companyDefaults, departmentDefaults, draft]);

  const previewEffectiveClauses = useMemo(() => resolveEffectiveClauses([
    companyDefaults, departmentDefaults, draft ? { section_clauses: draft.section_clauses } : null,
  ], defaultClauseMap), [companyDefaults, departmentDefaults, draft, defaultClauseMap]);

  const previewCompany = useMemo(() => companies.find((c) => String(c.id) === selectedCompanyId) || null, [companies, selectedCompanyId]);

  const previewEmployeeValues = useMemo(() => {
    const sampleEmployee: ContractEmployeeInfo = {
      id: 'sample', individualId: 0, companyId: Number(selectedCompanyId) || 0,
      fullName: 'Sample Employee', firstName: 'Sample', lastName: 'Employee',
      employeeNumber: 'EMP-0000', kraPin: '', nationalId: '', nssfNumber: '', nhifNumber: '', shifNumber: '',
      department: draft?.department || '', jobTitle: draft?.job_title || draft?.name || '',
      employmentType: draft?.employment_type || '', employmentStatus: 'Active', jobLevel: draft?.job_level || '',
      reportsTo: String(draft?.settings?.reports_to || ''), workLocation: draft?.work_location || '',
      workArrangement: draft?.work_arrangement || '', status: 'Active', basicSalary: 0, grossSalary: 0,
      bankName: '', bankBranch: '', bankAccount: '', contactEmail: '', contactPhone: '', startDate: '',
    };
    return buildStandardPlaceholderValues(sampleEmployee, previewCompany, undefined, previewEffectiveSettings);
  }, [draft, previewCompany, previewEffectiveSettings, selectedCompanyId]);

  const previewHtml = useMemo(() => {
    if (!draft) return '';
    const linkedKeys = Object.keys(draft.section_clauses || {});
    if (linkedKeys.length === 0) return '';
    const body = assembleContractHtml({
      sectionKeys: linkedKeys,
      clausesById,
      effectiveClauses: previewEffectiveClauses,
      effectiveSettings: previewEffectiveSettings,
      employeePlaceholderValues: previewEmployeeValues,
      includeToc: false,
    });
    return replacePlaceholders(body, { ...previewEffectiveSettings, ...previewEmployeeValues });
  }, [draft, clausesById, previewEffectiveClauses, previewEffectiveSettings, previewEmployeeValues]);

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
    <div className="max-h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/50 dark:border-slate-800/50 bg-white dark:bg-slate-900 shrink-0 gap-3 relative z-20">
        <div className="flex items-center gap-4 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500">
            <LayoutTemplate className="h-5 w-5" />
          </Button>
          <div className="flex flex-col">
            <h1 className="text-base font-bold text-slate-800 dark:text-slate-100 leading-tight">
              Job Profiles
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mt-0.5">
              <span>Settings</span>
              <ChevronRight className="h-3 w-3" />
              <span>Job Profiles</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-slate-700 dark:text-slate-300">{selectedProfile ? selectedProfile.name : 'All'}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-slate-100/50 dark:bg-slate-800/50 p-1 rounded-lg border border-slate-200/50 dark:border-slate-700/50 ml-4">
            <button
              onClick={() => togglePanel('sidebar')}
              title={collapsed.sidebar ? 'Show entities panel' : 'Hide entities panel'}
              className={cn(
                "p-1.5 rounded-md transition-all",
                collapsed.sidebar ? "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" : "bg-white dark:bg-slate-700 text-blue-600 shadow-sm"
              )}
            >
              {collapsed.sidebar ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <button
              onClick={() => togglePanel('editor')}
              title={collapsed.editor ? 'Show profiles panel' : 'Hide profiles panel'}
              className={cn(
                "p-1.5 rounded-md transition-all",
                collapsed.editor ? "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" : "bg-white dark:bg-slate-700 text-blue-600 shadow-sm"
              )}
            >
              <Columns2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => togglePanel('preview')}
              title={collapsed.preview ? 'Show preview panel' : 'Hide preview panel'}
              className={cn(
                "p-1.5 rounded-md transition-all",
                collapsed.preview ? "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" : "bg-white dark:bg-slate-700 text-blue-600 shadow-sm"
              )}
            >
              {collapsed.preview ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 bg-slate-50 dark:bg-slate-900 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm">
          <Link href="/dashboard/employment-contracts" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg transition-colors">Contracts</Link>
          <Link href="/dashboard/employment-contracts/clause-library" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg transition-colors"><BookText className="w-3.5 h-3.5" /> Clauses</Link>
          <Link href="/dashboard/employment-contracts/templates" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg transition-colors"><Settings className="w-3.5 h-3.5" /> Templates</Link>
          <Link href="/dashboard/employment-contracts/placeholders" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg transition-colors"><Database className="w-3.5 h-3.5" /> Data Sources</Link>
        </div>
      </div>

      <PanelGroup direction="horizontal" className="h-full w-full">
        {/* LEFT PANEL: Companies */}
        <Panel
          ref={sidebarPanelRef}
          defaultSize={18}
          minSize={14}
          maxSize={28}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, sidebar: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, sidebar: false }))}
          className="bg-white dark:bg-slate-900 flex flex-col z-10 overflow-auto"
        >
          <CompaniesSidebar
            companies={companies}
            selectedCompanyId={selectedCompanyId || null}
            onSelectCompany={(id) => { setSelectedCompanyId(id || ''); setSelectedProfileId(null); }}
            companyCounts={companyCounts}
            subtitle="Manage job profiles"
            topItems={[{ id: '__general__', label: 'General', count: allProfiles.filter(p => !p.company_id).length }]}
          />
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* CENTER PANEL: Profile list */}
        <Panel
          ref={editorPanelRef}
          defaultSize={22}
          minSize={18}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, editor: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, editor: false }))}
          className="bg-white dark:bg-slate-950 flex flex-col z-10 !overflow-auto"
        >
          <div className="flex flex-col h-full border-r border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 shrink-0 space-y-4">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Job Profiles</h2>
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search profiles..."
                    className="pl-9 h-9 text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-full"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-9 w-full text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-sm" disabled={!selectedCompanyId}>
                      <PlusCircle className="h-4 w-4 mr-2" /> Add Job Profile
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuItem onClick={() => openNew('position')}>New Position Profile</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openNew('department')}>New Department Defaults</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openNew('company')}>New Company Defaults</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <ScrollArea className="flex-1 bg-white dark:bg-slate-950">
              {isLoading ? (
                <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : filteredProfiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center border-2 border-dashed rounded-2xl border-slate-200 dark:border-slate-800 m-4">
                  <Briefcase className="h-10 w-10 text-slate-300 mb-3" />
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">No profiles yet</h3>
                  <p className="text-xs text-slate-500 mt-1">Create a new profile to get started.</p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {filteredProfiles.map((profile) => {
                    const isSelected = selectedProfileId === profile.id;
                    const visual = getProfileVisual(profile.department);
                    const VisualIcon = visual.icon;
                    return (
                      <div
                        key={profile.id}
                        onClick={() => setSelectedProfileId(profile.id)}
                        className={cn(
                          "flex items-start gap-3 p-4 cursor-pointer transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0 relative",
                          isSelected ? "bg-slate-50 dark:bg-slate-800/50" : "hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                        )}
                      >
                        {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />}
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm mt-0.5", visual.classes)}>
                          <VisualIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold truncate text-slate-900 dark:text-slate-100">{profile.name}</p>
                          <p className="text-[11px] text-slate-500 truncate mt-1">
                            {profile.department || scopeLabel(profile.scope)}
                          </p>
                          {profile.job_level && <p className="text-[11px] text-slate-500 truncate">{profile.job_level}</p>}
                        </div>
                        <span className={cn(
                          "text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0",
                          profile.is_active !== false ? "text-emerald-600 bg-emerald-50" : "text-slate-500 bg-slate-100"
                        )}>
                          {profile.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:border-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* DETAIL PANEL: Profile editor */}
        <Panel
          ref={detailPanelRef}
          defaultSize={42}
          minSize={30}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, detail: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, detail: false }))}
          className="bg-slate-50 dark:bg-slate-900 flex flex-col z-10 !overflow-auto"
        >
          <div className="flex flex-col h-full">
            {draft && selectedProfile ? (() => {
              const visual = getProfileVisual(draft.department);
              const VisualIcon = visual.icon;
              return (
                <>
                  {/* Header */}
                  <div className="px-8 py-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex flex-col gap-4 min-w-0">
                        <div className="flex items-center gap-4">
                           <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm", visual.classes)}>
                             <VisualIcon className="w-7 h-7" />
                           </div>
                           <div className="min-w-0">
                             <div className="flex items-center gap-3 mb-1">
                               <input
                                 value={draft.name}
                                 onChange={(e) => updateDraft({ name: e.target.value })}
                                 className="text-2xl font-bold text-slate-900 dark:text-slate-100 bg-transparent outline-none border-b border-transparent focus:border-blue-300 min-w-0"
                                 style={{ width: `${Math.max(draft.name.length, 8)}ch` }}
                               />
                               <button
                                 type="button"
                                 onClick={() => updateDraft({ is_active: !draft.is_active })}
                                 title="Toggle active status"
                               >
                                 <Badge className={cn(
                                   "text-xs px-2 py-0 rounded-full h-6 shrink-0 cursor-pointer",
                                   draft.is_active ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-200"
                                 )}>
                                   {draft.is_active ? 'Active' : 'Inactive'}
                                 </Badge>
                               </button>
                             </div>
                             <p className="text-sm text-slate-600 dark:text-slate-400 font-medium truncate">
                               {draft.department || scopeLabel(draft.scope)}
                               {draft.job_level ? ` • ${draft.job_level}` : ''}
                               {draft.employment_type ? ` • ${draft.employment_type}` : ''}
                             </p>
                             {draft.scope === 'position' && (
                               <p className="text-xs text-slate-500 mt-1">
                                 Reports to: <span className="font-medium text-slate-700 dark:text-slate-300">{draft.settings?.reports_to || 'Not set'}</span>
                               </p>
                             )}
                           </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end justify-between gap-4 shrink-0 h-full">
                        <div className="flex gap-6 text-[11px] text-slate-500 text-right">
                          <div className="flex flex-col gap-1">
                             <p>Created: <span className="font-medium text-slate-700 dark:text-slate-300">{new Date(draft.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span></p>
                             <p>Last Updated: <span className="font-medium text-slate-700 dark:text-slate-300">{new Date(draft.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span></p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Button variant="outline" size="sm" className="h-9 px-4 rounded-full font-semibold" onClick={handleCancelEdits} disabled={!isDirty || saving}>Cancel</Button>
                          <div className="flex rounded-full shadow-sm bg-blue-600">
                            <Button size="sm" className="h-9 bg-transparent hover:bg-blue-700 text-white rounded-l-full rounded-r-none border-r border-blue-700 font-semibold px-4 disabled:opacity-60" onClick={handleSaveProfile} disabled={!isDirty || saving}>
                              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                              Save Changes
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" className="h-9 bg-transparent hover:bg-blue-700 text-white rounded-r-full rounded-l-none px-2.5">
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-xl">
                                <DropdownMenuItem onClick={handleDuplicate}>
                                  <Copy className="h-4 w-4 mr-2" /> Duplicate Job Profile
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setDeletingId(selectedProfile.id)}>
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete Profile
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <Tabs value={detailTab} onValueChange={setDetailTab} className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
                    <div className="px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 overflow-x-auto">
                      <TabsList className="bg-transparent h-14 w-max justify-start gap-8 p-0 border-none">
                        {tabs.map((tab) => {
                          const Icon = tab.icon;
                          return (
                            <TabsTrigger
                              key={tab.value}
                              value={tab.value}
                              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none px-0 font-semibold text-[13px] text-slate-500 h-full whitespace-nowrap transition-colors flex items-center gap-2 hover:text-slate-700"
                            >
                              <Icon className="w-4 h-4" />
                              {tab.label}
                            </TabsTrigger>
                          );
                        })}
                      </TabsList>
                    </div>

                    <ScrollArea className="flex-1">
                        <TabsContent value="overview" className="m-0 focus:outline-none">
                          <div className="p-8 max-w-[1180px] mx-auto space-y-6">
                            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
                              <div className="space-y-6">
                                <SectionPanel title="Profile Identity" description="The stable facts that identify this role and help the contract engine match the right profile.">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
                                    <FormField label="Job Title">
                                      <Input value={draft.job_title || ''} onChange={(e) => updateDraft({ job_title: e.target.value })} className="h-9 text-xs" placeholder="e.g. Software Developer" />
                                    </FormField>
                                    <FormField label={`Department${draft.scope === 'department' ? ' *' : ''}`}>
                                      <Input value={draft.department || ''} onChange={(e) => updateDraft({ department: e.target.value })} className="h-9 text-xs" placeholder="e.g. ICT" />
                                    </FormField>
                                    <FormField label="Job Level">
                                      <Select value={draft.job_level || '__unset__'} onValueChange={(v) => updateDraft({ job_level: v === '__unset__' ? null : v })}>
                                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select level" /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__unset__" className="text-slate-400 italic">Not set</SelectItem>
                                          {withCurrentValue(JOB_LEVEL_OPTIONS, draft.job_level).map((opt) => (
                                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormField>
                                    <FormField label="Employment Type">
                                      <Select value={draft.employment_type || '__unset__'} onValueChange={(v) => updateDraft({ employment_type: v === '__unset__' ? null : v })}>
                                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select type" /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__unset__" className="text-slate-400 italic">Not set</SelectItem>
                                          {withCurrentValue(EMPLOYMENT_TYPE_OPTIONS, draft.employment_type).map((opt) => (
                                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormField>
                                    <FormField label="Reports To">
                                      <Input value={draft.settings?.reports_to || ''} onChange={(e) => updateDraftSettings('reports_to', e.target.value)} className="h-9 text-xs" placeholder="e.g. Head of ICT" />
                                    </FormField>
                                    <FormField label="Work Location">
                                      <Input value={draft.work_location || ''} onChange={(e) => updateDraft({ work_location: e.target.value })} className="h-9 text-xs" placeholder="e.g. Head Office" />
                                    </FormField>
                                    <FormField label="Work Arrangement">
                                      <Select value={draft.work_arrangement || '__unset__'} onValueChange={(v) => updateDraft({ work_arrangement: v === '__unset__' ? null : v })}>
                                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select arrangement" /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__unset__" className="text-slate-400 italic">Not set</SelectItem>
                                          {withCurrentValue(WORK_ARRANGEMENT_OPTIONS, draft.work_arrangement).map((opt) => (
                                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormField>

                                  </div>
                                </SectionPanel>

                                <SectionPanel title="Job Summary" description="This is the role purpose that can feed the job description appendix.">
                                  <Textarea
                                    className="min-h-[120px] text-xs"
                                    placeholder="A short summary of what this role does..."
                                    value={draft.job_description || ''}
                                    onChange={(e) => updateDraft({ job_description: e.target.value })}
                                  />
                                </SectionPanel>
                              </div>

                              <div className="space-y-6">
                                <SectionPanel title="Contract Readiness">
                                  <div className="space-y-3 text-xs">
                                    {[
                                      { label: 'Identity', done: !!(draft.job_title && draft.department && draft.job_level) },
                                      { label: 'Employment rules', done: !!(draft.employment_type && draft.settings?.notice_period) },
                                      { label: 'Working arrangement', done: !!(draft.work_arrangement && draft.settings?.working_days) },
                                      { label: 'Clauses', done: clauseSelections.length > 0 },
                                    ].map((item) => (
                                      <div key={item.label} className="flex items-center justify-between gap-3">
                                        <span className="text-slate-600">{item.label}</span>
                                        <Badge variant="outline" className={cn("rounded-full border-transparent text-[10px]", item.done ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                                          {item.done ? 'Set' : 'Missing'}
                                        </Badge>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-4 flex gap-2">
                                    <Button variant="outline" size="sm" className="h-8 flex-1 text-xs" onClick={() => togglePanel('preview')}>Preview</Button>
                                    <Button size="sm" className="h-8 flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setDetailTab('clauses')}>Clauses</Button>
                                  </div>
                                </SectionPanel>

                                <SectionPanel title="Supporting Details" description="Useful context, but not the first thing users need to solve.">
                                  <div className="space-y-5">
                                    <FormField label="Tags">
                                      <TagListEditor items={draft.tags || []} onChange={(v) => updateDraft({ tags: v })} placeholder="Add a tag" badgeClassName="bg-indigo-50 text-indigo-700 hover:bg-indigo-100" />
                                    </FormField>
                                    <FormField label="Equipment & Assets">
                                      <TagListEditor items={draft.equipment || []} onChange={(v) => updateDraft({ equipment: v })} placeholder="Add an item" badgeClassName="bg-emerald-50 text-emerald-700 hover:bg-emerald-100" />
                                    </FormField>
                                  </div>
                                </SectionPanel>

                                <SectionPanel title="Quick Actions">
                                  <div className="space-y-3">
                                    <button onClick={handleDuplicate} className="flex items-center gap-3 text-xs text-slate-600 hover:text-blue-600 w-full font-medium">
                                      <Copy className="h-4 w-4 text-slate-400" /> Duplicate profile
                                    </button>
                                    <button onClick={handleDownloadJobDescription} className="flex items-center gap-3 text-xs text-slate-600 hover:text-blue-600 w-full font-medium">
                                      <Download className="h-4 w-4 text-slate-400" /> Download job description
                                    </button>
                                  </div>
                                </SectionPanel>
                              </div>
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="requirements" className="m-0 p-8">
                          <div className="max-w-[980px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <SectionPanel title="Qualifications & Experience" description="Recruitment-facing requirements; these can appear in the job description but should not drive clause selection unless you later add rules for them.">
                              <StringListEditor items={draft.requirements || []} onChange={(v) => updateDraft({ requirements: v })} placeholder="e.g. Bachelor's degree in Computer Science" />
                            </SectionPanel>
                            <SectionPanel title="Core Skills" description="Short skill tags for scanning and filtering.">
                              <TagListEditor items={draft.skills || []} onChange={(v) => updateDraft({ skills: v })} placeholder="Type a skill, press Enter" badgeClassName="bg-blue-50 text-blue-700 hover:bg-blue-100" />
                            </SectionPanel>
                          </div>
                        </TabsContent>

                        <TabsContent value="responsibilities" className="m-0 p-8">
                          <SectionPanel title="Key Responsibilities" description="Contract appendix content: the concrete duties attached to this role." className="max-w-2xl">
                            <StringListEditor items={draft.key_responsibilities || []} onChange={(v) => updateDraft({ key_responsibilities: v })} placeholder="e.g. Maintain accurate financial records" />
                          </SectionPanel>
                        </TabsContent>

                        <TabsContent value="employment_rules" className="m-0 p-8">
                          <div className="max-w-[980px] mx-auto space-y-6">
                            <SectionPanel title="Employment & Termination" description="These fields should influence probation, notice and termination clauses.">
                              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {[
                                  { label: 'Employment Type', node: <Select value={draft.employment_type || '__unset__'} onValueChange={(v) => updateDraft({ employment_type: v === '__unset__' ? null : v })}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select type" /></SelectTrigger><SelectContent><SelectItem value="__unset__" className="text-slate-400 italic">Not set</SelectItem>{withCurrentValue(EMPLOYMENT_TYPE_OPTIONS, draft.employment_type).map((opt) => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent></Select> },
                                  { label: 'Probation Period', node: <SettingSelect label="" settingKey="probation_period" options={PROBATION_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Notice Period', node: <SettingSelect label="" settingKey="notice_period" options={NOTICE_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Probation Notice', node: <SettingSelect label="" settingKey="probation_notice" options={NOTICE_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Confirmation Required', node: <SettingSelect label="" settingKey="confirmation_required" options={['Yes', 'No']} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Termination Reason Rule', node: <SettingInput label="" settingKey="termination_reason" settings={draft.settings || {}} onChange={updateDraftSettings} placeholder="e.g. According to contract and applicable law" /> },
                                ].map(({ label, node }) => (
                                  <div key={label} className="grid grid-cols-[180px_1fr] gap-4 py-3 items-center">
                                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
                                    <div>{node}</div>
                                  </div>
                                ))}
                              </div>
                            </SectionPanel>

                            <SectionPanel title="Contractual Policies" description="Use these as clause-selection signals; the clause wording still lives in the Clause Library.">
                              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {[
                                  { label: 'Confidentiality', node: <SettingSwitch label="" settingKey="confidentiality_policy" settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Intellectual Property', node: <SettingSwitch label="" settingKey="intellectual_property_policy" settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Data Protection', node: <SettingSwitch label="" settingKey="data_protection_policy" settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Code of Conduct', node: <SettingSwitch label="" settingKey="code_of_conduct_policy" settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Disciplinary Policy', node: <SettingSwitch label="" settingKey="disciplinary_policy" settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Company Property', node: <SettingSwitch label="" settingKey="company_property_policy" settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                ].map(({ label, node }) => (
                                  <div key={label} className="grid grid-cols-[180px_1fr] gap-4 py-3 items-center">
                                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
                                    <div>{node}</div>
                                  </div>
                                ))}
                              </div>
                            </SectionPanel>
                          </div>
                        </TabsContent>

                        <TabsContent value="working_arrangement" className="m-0 p-8">
                          <div className="max-w-[980px] mx-auto space-y-6">
                            <SectionPanel title="Normal Schedule" description="The basic working pattern that feeds working-hours and remote-work clauses.">
                              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {[
                                  { label: 'Work Mode', node: <Select value={draft.work_arrangement || '__unset__'} onValueChange={(v) => updateDraft({ work_arrangement: v === '__unset__' ? null : v })}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select arrangement" /></SelectTrigger><SelectContent><SelectItem value="__unset__" className="text-slate-400 italic">Not set</SelectItem>{withCurrentValue(WORK_ARRANGEMENT_OPTIONS, draft.work_arrangement).map((opt) => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent></Select> },
                                  { label: 'Working Days', node: <SettingSelect label="" settingKey="working_days" options={['Monday-Friday', 'Monday-Saturday', 'Shift Based', 'Flexible']} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Rest Days', node: <SettingSelect label="" settingKey="rest_days" options={['Saturday & Sunday', 'Sunday', 'As rostered', 'According to Company Policy']} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Start Time', node: <SettingInput label="" settingKey="start_time" settings={draft.settings || {}} onChange={updateDraftSettings} placeholder="08:00" type="time" /> },
                                  { label: 'End Time', node: <SettingInput label="" settingKey="end_time" settings={draft.settings || {}} onChange={updateDraftSettings} placeholder="17:00" type="time" /> },
                                  { label: 'Break', node: <SettingSelect label="" settingKey="break_duration" options={['30 Minutes', '45 Minutes', '1 Hour', 'According to Company Policy']} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                ].map(({ label, node }) => (
                                  <div key={label} className="grid grid-cols-[180px_1fr] gap-4 py-3 items-center">
                                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
                                    <div>{node}</div>
                                  </div>
                                ))}
                              </div>
                            </SectionPanel>

                            <SectionPanel title="Remote, Weekend & Overtime Rules">
                              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {[
                                  { label: 'Remote Work Allowed', node: <SettingSwitch label="" settingKey="remote_work_allowed" settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Remote Days', node: <SettingSelect label="" settingKey="remote_days" options={['Up to 1 day per week', 'Up to 2 days per week', 'Up to 3 days per week', 'As approved']} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Weekend Work', node: <SettingSelect label="" settingKey="weekend_work" options={['No', 'Occasional', 'Shift Based', 'As required']} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Weekend Approval Required', node: <SettingSwitch label="" settingKey="weekend_approval_required" settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Overtime Eligible', node: <SettingSwitch label="" settingKey="overtime_eligible" settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Overtime Approval Required', node: <SettingSwitch label="" settingKey="overtime_approval_required" settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Overtime Compensation', node: <SettingSelect label="" settingKey="overtime_compensation" options={['According to Company Policy', 'Paid', 'Time off in lieu', 'Not applicable']} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                ].map(({ label, node }) => (
                                  <div key={label} className="grid grid-cols-[180px_1fr] gap-4 py-3 items-center">
                                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
                                    <div>{node}</div>
                                  </div>
                                ))}
                              </div>
                            </SectionPanel>
                          </div>
                        </TabsContent>

                        <TabsContent value="benefits" className="m-0 p-8">
                          <div className="max-w-[980px] mx-auto space-y-6">
                            <SectionPanel title="Salary Structure" description="Set a role range here; the actual employee salary can still be entered on the offer/contract.">
                              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {[
                                  { label: 'Currency', node: <SettingSelect label="" settingKey="salary_currency" options={['KES', 'USD', 'GBP', 'EUR']} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Minimum', node: <SettingInput label="" settingKey="salary_min" settings={draft.settings || {}} onChange={updateDraftSettings} placeholder="100000" /> },
                                  { label: 'Maximum', node: <SettingInput label="" settingKey="salary_max" settings={draft.settings || {}} onChange={updateDraftSettings} placeholder="180000" /> },
                                  { label: 'Pay Frequency', node: <SettingSelect label="" settingKey="payment_frequency" options={PAYMENT_FREQUENCY_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                ].map(({ label, node }) => (
                                  <div key={label} className="grid grid-cols-[180px_1fr] gap-4 py-3 items-center">
                                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
                                    <div>{node}</div>
                                  </div>
                                ))}
                              </div>
                            </SectionPanel>

                            <SectionPanel title="Allowances & Benefits">
                              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {[
                                  { label: 'Medical Cover', node: <SettingSelect label="" settingKey="medical_cover" options={['No', 'Standard Company Scheme', 'Enhanced Scheme', 'According to Company Policy']} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Housing Allowance', node: <SettingSelect label="" settingKey="housing_allowance" options={ALLOWANCE_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Transport Allowance', node: <SettingSelect label="" settingKey="transport_allowance" options={ALLOWANCE_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Telephone Allowance', node: <SettingSelect label="" settingKey="telephone_allowance" options={ALLOWANCE_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Internet Allowance', node: <SettingSelect label="" settingKey="internet_allowance" options={ALLOWANCE_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Meal Allowance', node: <SettingSelect label="" settingKey="meal_allowance" options={ALLOWANCE_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Pension', node: <SettingSelect label="" settingKey="pension_scheme" options={['No', 'Applicable', 'After Confirmation', 'According to Company Policy']} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Bonus', node: <SettingSelect label="" settingKey="bonus_scheme" options={['No', 'Performance-Based', 'Discretionary', 'According to Company Policy']} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                ].map(({ label, node }) => (
                                  <div key={label} className="grid grid-cols-[180px_1fr] gap-4 py-3 items-center">
                                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
                                    <div>{node}</div>
                                  </div>
                                ))}
                              </div>
                            </SectionPanel>

                            <SectionPanel title="Leave">
                              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {[
                                  { label: 'Annual Leave', node: <SettingSelect label="" settingKey="annual_leave_days" options={LEAVE_DAY_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Sick Leave', node: <SettingSelect label="" settingKey="sick_leave_days" options={LEAVE_DAY_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Maternity Leave', node: <SettingSelect label="" settingKey="maternity_leave_days" options={LEAVE_DAY_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Paternity Leave', node: <SettingSelect label="" settingKey="paternity_leave_days" options={LEAVE_DAY_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Compassionate Leave', node: <SettingSelect label="" settingKey="compassionate_leave_days" options={LEAVE_DAY_OPTIONS} settings={draft.settings || {}} onChange={updateDraftSettings} /> },
                                  { label: 'Payment Day', node: <SettingInput label="" settingKey="payment_day" settings={draft.settings || {}} onChange={updateDraftSettings} placeholder="e.g. Last working day" /> },
                                ].map(({ label, node }) => (
                                  <div key={label} className="grid grid-cols-[180px_1fr] gap-4 py-3 items-center">
                                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
                                    <div>{node}</div>
                                  </div>
                                ))}
                              </div>
                            </SectionPanel>
                          </div>
                        </TabsContent>

                        <TabsContent value="clauses" className="">
                          <div className="flex overflow-hidden dark:bg-slate-950" style={{ maxHeight: 'calc(100vh - 280px)' }}>
                            {/* Col 1: Sections */}
                            <div className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0">
                              <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Contract Sections</p>
                                <p className="text-xs text-slate-500 mt-0.5">{CONTRACT_SECTIONS.length} sections</p>
                              </div>
                              <ScrollArea className="flex-1">
                                <div className="p-2 space-y-1">
                                  {CONTRACT_SECTIONS.map((section) => {
                                    const count = clauses.filter((c) => c.section_key === section.key).length;
                                    const hasSelection = !!draft?.section_clauses?.[section.key];
                                    return (
                                      <div
                                        key={section.key}
                                        onClick={() => { setLinkSectionKey(section.key); setLinkSearch(''); }}
                                        className={cn("flex items-center justify-between p-2 rounded-lg text-xs font-medium cursor-pointer transition-colors", section.key === linkSectionKey ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800")}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <FileText className="w-3.5 h-3.5 opacity-70 shrink-0" />
                                          <span className="truncate">{section.title}</span>
                                          {hasSelection && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                                        </div>
                                        <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5 min-w-[20px] flex items-center justify-center border-transparent shrink-0", section.key === linkSectionKey ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500")}>{count}</Badge>
                                      </div>
                                    );
                                  })}
                                </div>
                              </ScrollArea>
                            </div>

                            {/* Col 2: Clauses in selected section */}
                            <div className="w-80 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col shrink-0">
                              <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">Clauses in &ldquo;{CONTRACT_SECTIONS.find((s) => s.key === linkSectionKey)?.title}&rdquo;</p>
                                <p className="text-xs text-slate-500 mt-0.5">{clauses.filter((c) => c.section_key === linkSectionKey).length} clauses available</p>
                              </div>
                              <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                <div className="relative">
                                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                                  <Input placeholder="Search clauses..." className="h-8 pl-8 text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800" value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} />
                                </div>
                              </div>
                              <ScrollArea className="flex-1 p-4">
                                <div className="space-y-3">
                                  <button
                                    type="button"
                                    onClick={() => { if (!draft) return; const next = { ...(draft.section_clauses || {}) }; delete next[linkSectionKey]; updateDraft({ section_clauses: next }); }}
                                    className={cn(
                                      "w-full text-left bg-white dark:bg-slate-950 border rounded-xl p-3 text-xs font-medium transition-colors",
                                      !draft?.section_clauses?.[linkSectionKey] ? "border-blue-500 text-blue-700" : "border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:border-slate-400"
                                    )}
                                  >
                                    Use section default {defaultClauseMap[linkSectionKey] && `(${clausesById[defaultClauseMap[linkSectionKey]]?.label || 'none'})`}
                                  </button>
                                  {clauses
                                    .filter((c) => c.section_key === linkSectionKey && c.label.toLowerCase().includes(linkSearch.toLowerCase()))
                                    .sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || a.label.localeCompare(b.label))
                                    .map((clause) => {
                                      const isSelected = draft?.section_clauses?.[linkSectionKey] === clause.id;
                                      const usageCount = allProfiles.filter((p) => p.section_clauses?.[linkSectionKey] === clause.id).length;
                                      return (
                                        <div
                                          key={clause.id}
                                          onClick={() => updateDraft({ section_clauses: { ...(draft?.section_clauses || {}), [linkSectionKey]: clause.id } })}
                                          className={cn(
                                            "bg-white dark:bg-slate-950 border rounded-xl p-4 shadow-sm relative cursor-pointer transition-colors",
                                            isSelected ? "border-2 border-blue-500" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                                          )}
                                        >
                                          <div className={cn("absolute top-4 right-4 w-4 h-4 rounded-full border-2 bg-white dark:bg-slate-950", isSelected ? "border-blue-500" : "border-slate-300")} />
                                          <p className="text-sm font-bold text-slate-900 dark:text-slate-100 pr-6">{clause.label}</p>
                                          <p className="text-[10px] text-slate-500 font-mono mb-3">{clause.clause_key}</p>
                                          <div className="flex items-center gap-2 mb-3 flex-wrap">
                                            {clause.is_default && <Badge variant="secondary" className="bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 hover:bg-amber-100 text-[10px] py-0 border-transparent font-medium">Section Default</Badge>}
                                            {clause.variant_group && <Badge variant="secondary" className="bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 hover:bg-purple-100 text-[10px] py-0 border-transparent font-medium">{clause.variant_group}</Badge>}
                                          </div>
                                          <div className="space-y-1.5 text-[11px]">
                                            <div className="flex justify-between"><span className="text-slate-500">Scope:</span><span className="font-medium text-slate-700 dark:text-slate-300">{clause.company_id ? 'Company' : 'Global'}</span></div>
                                            <div className="text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800 mt-2">Used in {usageCount} job profile{usageCount !== 1 ? 's' : ''}</div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              </ScrollArea>
                            </div>

                            {/* Col 3: Suggestion rules & preview */}
                            <div className="flex-1 bg-white dark:bg-slate-950 flex flex-col min-w-0">
                              <div className="p-6 flex gap-8 h-full min-h-0">
                                {(() => {
                                  const selectedClauseId = draft?.section_clauses?.[linkSectionKey];
                                  const selectedClause = selectedClauseId ? clausesById[selectedClauseId] : undefined;
                                  const conditions = (selectedClause as any)?.suggest_conditions as Array<Record<string, string>> | undefined;
                                  const facts = { employment_type: draft?.employment_type, job_level: draft?.job_level, work_arrangement: draft?.work_arrangement, department: draft?.department };
                                  return (
                                    <>
                                      <div className="w-64 space-y-6 flex flex-col shrink-0">
                                        <div>
                                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">Suggestion Rules</p>
                                          <p className="text-[11px] text-slate-500 mb-4">Why this clause might apply</p>
                                          {!selectedClause ? (
                                            <p className="text-xs text-slate-400 italic">Select a clause to see details.</p>
                                          ) : !conditions?.length ? (
                                            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-xs text-slate-500">No suggestion rules defined for this clause - it's a manual pick.</div>
                                          ) : (
                                            <div className="bg-emerald-50/50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/20 rounded-xl p-4">
                                              <ul className="space-y-2 text-[11px]">
                                                {Object.entries(conditions[0] || {}).filter(([, v]) => v).map(([key, value]) => {
                                                  const matches = facts[key as keyof typeof facts] === value;
                                                  return (
                                                    <li key={key} className="flex justify-between items-center gap-2">
                                                      <span className="text-slate-600 dark:text-slate-400">{key.replace(/_/g, ' ')}: {value}</span>
                                                      <span className={cn("font-medium shrink-0", matches ? "text-emerald-600" : "text-slate-400")}>{matches ? 'Matches' : 'No match'}</span>
                                                    </li>
                                                  );
                                                })}
                                              </ul>
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex-1 flex flex-col min-w-0">
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">Clause Preview</p>
                                        <p className="text-[11px] text-slate-500 mb-4">Preview how it will appear in the contract</p>
                                        {!selectedClause ? (
                                          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex-1 flex items-center justify-center text-sm text-slate-400">
                                            Select a clause on the left to preview it.
                                          </div>
                                        ) : (
                                          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex-1 flex flex-col relative overflow-hidden min-h-0">
                                            <div className="flex justify-between items-start mb-4 shrink-0">
                                              <div>
                                                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{selectedClause.label}</p>
                                                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Key: {selectedClause.clause_key}</p>
                                              </div>
                                              <Badge variant="outline" className="text-[10px] font-semibold bg-white dark:bg-slate-950 shrink-0">{selectedClause.company_id ? 'Company' : 'Global'}</Badge>
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-2 uppercase tracking-wider shrink-0">Content</p>
                                            <div
                                              className="prose prose-xs max-w-none text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed flex-1 overflow-auto pr-2 [&_strong]:text-slate-900 dark:[&_strong]:text-slate-100"
                                              dangerouslySetInnerHTML={{ __html: selectedClause.content }}
                                            />
                                            {selectedClause.content?.includes('{{') && (
                                              <div className="pt-4 border-t border-slate-200 dark:border-slate-700 mt-4 shrink-0">
                                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-3 uppercase tracking-wider">Placeholders Used</p>
                                                <div className="flex flex-wrap gap-2">
                                                  {Array.from(new Set(Array.from(selectedClause.content.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]))).map((p) => (
                                                    <span key={p} className="text-[10px] font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-600 px-2 py-1 rounded-md">{'{{' + p + '}}'}</span>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </TabsContent>


                    </ScrollArea>
                  </Tabs>
                </>
              );
            })() : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <FileText className="w-10 h-10 text-slate-300 mb-3" />
                <p className="text-xs text-slate-500">Select a profile to view details</p>
              </div>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* PREVIEW PANEL: Sticky right */}
        <Panel
          ref={previewPanelRef}
          defaultSize={25}
          minSize={18}
          maxSize={45}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, preview: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, preview: false }))}
          className="bg-white dark:bg-slate-950 flex flex-col z-10 !overflow-auto"
        >
          <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Contract Preview</p>
                  <p className="text-xs text-slate-500 mt-0.5">Based on linked clauses</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setDetailTab('clauses')}
                    title="Manage linked clauses"
                    className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                  >
                    <LinkIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {draft ? (
                <div className="p-4">
                  {previewHtml ? (
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 text-xs leading-relaxed text-black">
                      <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-40 text-center border-2 border-dashed rounded-lg border-slate-200 dark:border-slate-800">
                      <LinkIcon className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="text-sm font-medium text-slate-500">No clauses linked</p>
                      <p className="text-xs text-slate-400 mt-1">Link clauses in the Clauses tab to build a preview.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <FileText className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-sm text-slate-500">Select a profile to preview</p>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>



      {/* New Job Profile - minimal creation step; everything else is filled
          in on the live-editable Overview tab right after creating. */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogTitle className="text-lg font-bold">
            New {createScope === 'company' ? 'Company Defaults' : createScope === 'department' ? 'Department Defaults' : 'Position'} Profile
          </DialogTitle>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Name</label>
              <Input
                autoFocus
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={createScope === 'company' ? 'Company Defaults' : createScope === 'department' ? 'Finance Department Defaults' : 'Senior Accountant'}
                className="h-10"
              />
            </div>
            {createScope !== 'company' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Department {createScope === 'department' && <span className="text-red-500">*</span>}</label>
                <Input value={createDepartment} onChange={(e) => setCreateDepartment(e.target.value)} placeholder="Finance" className="h-10" />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create Profile
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent className="rounded-2xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-slate-800">Delete this profile?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500">
              This cannot be undone. Deletion is blocked while any Employment Offer still references it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="h-9 px-4 rounded-full text-xs font-semibold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deletingId) handleDelete(deletingId); setDeletingId(null); }}
              className="h-9 px-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-md shadow-red-500/10 border-0"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
