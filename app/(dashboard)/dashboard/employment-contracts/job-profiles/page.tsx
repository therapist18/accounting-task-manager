'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import {
  Loader2, PlusCircle, Settings, Trash2, Briefcase, BookText,
  Search, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Columns2, FileText, Database, ChevronDown, Pencil, ShieldCheck, Laptop2,
  Users, Megaphone, Car,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { fetchCompanies, Company } from '../../companies/database';
import { EcJobProfile, fetchJobProfiles, deleteJobProfile, JobProfileScope } from '../utils/jobProfileData';
import { EcClause, fetchClauses } from '../utils/clauseLibraryData';
import { JobProfileEditor } from '../components/JobProfileEditor';
import { CompaniesSidebar } from '../components/CompaniesSidebar';
import { CONTRACT_SECTIONS } from '../utils/contractStructure';

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

  for (const entry of Object.entries(settings)) {
    const group = SETTINGS_GROUPS.find((g) => g.test.test(entry[0]));
    buckets.get(group?.label || 'Other')!.push(entry);
  }
  return Array.from(buckets.entries())
    .map(([label, items]) => ({ label, items }))
    .filter((g) => g.items.length > 0);
}

// Assigns a recognizable icon + color to a profile purely from its department
// name, so the list and detail header read at a glance instead of every row
// showing the same generic briefcase.
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
  return match || { icon: Briefcase, classes: 'bg-blue-50 text-custom-blue dark:bg-blue-500/10' };
}

const SECTION_BADGE_COLORS = [
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-teal-50 text-teal-700 border-teal-200',
  'bg-rose-50 text-rose-700 border-rose-200',
  'bg-amber-50 text-amber-700 border-amber-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
];

export default function JobProfilesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [profiles, setProfiles] = useState<EcJobProfile[]>([]);
  const [clauses, setClauses] = useState<EcClause[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<EcJobProfile | null>(null);
  const [newScope, setNewScope] = useState<JobProfileScope>('position');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailTab, setDetailTab] = useState('overview');

  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
  const editorPanelRef = useRef<ImperativePanelHandle>(null);
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const [collapsed, setCollapsed] = useState({ sidebar: false, editor: false, preview: false });

  const togglePanel = (key: keyof typeof collapsed) => {
    const ref = key === 'sidebar' ? sidebarPanelRef : key === 'editor' ? editorPanelRef : previewPanelRef;
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
      const allProfiles = await fetchJobProfiles();
      setAllProfiles(allProfiles);
      setIsLoading(false);
    })();
  }, []);

  const [allProfiles, setAllProfiles] = useState<EcJobProfile[]>([]);

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
    const data = await fetchJobProfiles(id);
    setProfiles(data);
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

  const settingsGroups = useMemo(
    () => selectedProfile ? groupSettings(selectedProfile.settings || {}) : [],
    [selectedProfile]
  );

  const clauseSelections = useMemo(() => {
    if (!selectedProfile) return [];
    return Object.entries(selectedProfile.section_clauses || {}).map(([sectionKey, clauseId], i) => {
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
  }, [selectedProfile, clauses]);

  useEffect(() => { setDetailTab('overview'); }, [selectedProfileId]);

  const openNew = (scope: JobProfileScope) => {
    setEditingProfile(null);
    setNewScope(scope);
    setEditorOpen(true);
  };

  const openEdit = (profile: EcJobProfile) => {
    setEditingProfile(profile);
    setEditorOpen(true);
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

  return (
    <div className="max-h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/50 dark:border-slate-800/50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shrink-0 gap-3 relative z-20">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="text-lg font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400 bg-clip-text text-transparent shrink-0">
            Job Profiles
          </h1>
          <div className="flex items-center gap-1 bg-slate-100/50 dark:bg-slate-800/50 p-1 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
            <button
              onClick={() => togglePanel('sidebar')}
              title={collapsed.sidebar ? 'Show entities panel' : 'Hide entities panel'}
              className={cn(
                "p-1.5 rounded-md transition-all",
                collapsed.sidebar ? "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" : "bg-white dark:bg-slate-700 text-custom-blue shadow-sm"
              )}
            >
              {collapsed.sidebar ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <button
              onClick={() => togglePanel('editor')}
              title={collapsed.editor ? 'Show profiles panel' : 'Hide profiles panel'}
              className={cn(
                "p-1.5 rounded-md transition-all",
                collapsed.editor ? "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" : "bg-white dark:bg-slate-700 text-custom-blue shadow-sm"
              )}
            >
              <Columns2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => togglePanel('preview')}
              title={collapsed.preview ? 'Show summary panel' : 'Hide summary panel'}
              className={cn(
                "p-1.5 rounded-md transition-all",
                collapsed.preview ? "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" : "bg-white dark:bg-slate-700 text-custom-blue shadow-sm"
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
        {/* LEFT PANEL: Profile list */}
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
          />
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* CENTER PANEL: Profile list & detail */}
        <Panel
          ref={editorPanelRef}
          defaultSize={34}
          minSize={26}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, editor: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, editor: false }))}
          className="bg-slate-50 dark:bg-slate-950 flex flex-col z-10 !overflow-auto"
        >
          <div className="flex flex-col h-full">
            <div className="px-4 pt-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0 gap-3">
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100 px-1 pb-2.5 border-b-2 border-custom-blue text-custom-blue">
                  Job Profiles
                </span>
              </div>
              <div className="pb-2.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-8 text-xs" disabled={!selectedCompanyId}>
                      <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> Add Job Profile <ChevronDown className="h-3 w-3 ml-1.5 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => openNew('position')}>New Position Profile</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openNew('department')}>New Department Defaults</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openNew('company')}>New Company Defaults</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search profiles..."
                  className="pl-9 h-8 text-xs bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                {selectedCompanyId ? companies.find(c => String(c.id) === selectedCompanyId)?.company_name || 'Company' : 'All Companies'}
                {' · '}{filteredProfiles.length} profile{filteredProfiles.length !== 1 ? 's' : ''}
              </p>
            </div>

            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : filteredProfiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center border-2 border-dashed rounded-2xl border-slate-200 dark:border-slate-800 m-4">
                  <Briefcase className="h-10 w-10 text-slate-300 mb-3" />
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">No profiles yet</h3>
                  <p className="text-xs text-slate-500 mt-1">Create a new profile to get started.</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredProfiles.map((profile) => {
                    const isSelected = selectedProfileId === profile.id;
                    const visual = getProfileVisual(profile.department);
                    const VisualIcon = visual.icon;
                    return (
                      <div
                        key={profile.id}
                        onClick={() => setSelectedProfileId(profile.id)}
                        className={cn(
                          "flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors",
                          isSelected ? "bg-custom-blue text-white shadow-sm" : "hover:bg-slate-100 dark:hover:bg-slate-800"
                        )}
                      >
                        <div className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                          isSelected ? "bg-white/20" : visual.classes
                        )}>
                          <VisualIcon className={cn("w-4.5 h-4.5", isSelected && "text-white")} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate">{profile.name}</p>
                          <p className={cn("text-[11px] truncate", isSelected ? "text-blue-100" : "text-slate-400")}>
                            {profile.department || scopeLabel(profile.scope)}
                            {!profile.is_active && ' · Inactive'}
                          </p>
                        </div>
                        <span className={cn(
                          "text-xs font-bold shrink-0 tabular-nums",
                          isSelected ? "text-white" : "text-slate-300 dark:text-slate-600"
                        )}>
                          {Object.keys(profile.section_clauses || {}).length}
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

        {/* RIGHT PANEL: Profile detail */}
        <Panel
          ref={previewPanelRef}
          defaultSize={48}
          minSize={30}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, preview: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, preview: false }))}
          className="bg-slate-100 dark:bg-slate-900 flex flex-col z-10 border-l border-slate-200 dark:border-slate-800 !overflow-auto"
        >
          <div className="flex flex-col h-full">
            {selectedProfile ? (() => {
              const visual = getProfileVisual(selectedProfile.department);
              const VisualIcon = visual.icon;
              const tabs: [string, string][] = [
                ['overview', 'Overview'],
                ['description', 'Job Description'],
                ['requirements', 'Requirements'],
                ['responsibilities', `Key Responsibilities (${selectedProfile.key_responsibilities?.length || 0})`],
                ['compensation', 'Compensation'],
                ['clauses', `Linked Clauses (${clauseSelections.length})`],
              ];
              return (
                <>
                  {/* Header */}
                  <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", visual.classes)}>
                          <VisualIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">{selectedProfile.name}</h2>
                          <p className="text-[12px] text-slate-500 truncate">
                            {selectedProfile.scope === 'position'
                              ? [selectedProfile.department, selectedProfile.job_level && `Job Level: ${selectedProfile.job_level}`, selectedProfile.employment_type && `Employment Type: ${selectedProfile.employment_type}`].filter(Boolean).join(' · ') || scopeLabel(selectedProfile.scope)
                              : scopeLabel(selectedProfile.scope)}
                            {!selectedProfile.is_active && ' · Inactive'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openEdit(selectedProfile)}>
                          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Profile
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="h-8 px-2">
                              More <ChevronDown className="h-3 w-3 ml-1 opacity-70" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => openEdit(selectedProfile)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit Profile
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setDeletingId(selectedProfile.id)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete Profile
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <Tabs value={detailTab} onValueChange={setDetailTab} className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 overflow-x-auto">
                      <TabsList className="bg-transparent h-10 w-max justify-start gap-5 p-0 border-none">
                        {tabs.map(([value, label]) => (
                          <TabsTrigger
                            key={value}
                            value={value}
                            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-custom-blue data-[state=active]:text-custom-blue rounded-none px-0 font-medium text-xs text-slate-500 h-full whitespace-nowrap transition-colors"
                          >
                            {label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </div>

                    <ScrollArea className="flex-1">
                      <div className="p-4">
                        <TabsContent value="overview" className="m-0 space-y-3">
                          <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-3">Profile Information</p>
                            <div className="space-y-2 text-[12px]">
                              <div className="flex justify-between gap-2"><span className="text-slate-500">Job Title</span><span className="font-medium text-slate-700 dark:text-slate-200 text-right">{selectedProfile.job_title || scopeLabel(selectedProfile.scope)}</span></div>
                              <div className="flex justify-between gap-2"><span className="text-slate-500">Department</span><span className="font-medium text-slate-700 dark:text-slate-200 text-right">{selectedProfile.department || '—'}</span></div>
                              <div className="flex justify-between gap-2"><span className="text-slate-500">Job Level</span><span className="font-medium text-slate-700 dark:text-slate-200 text-right">{selectedProfile.job_level || '—'}</span></div>
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-slate-500">Employment Type</span>
                                {selectedProfile.employment_type ? (
                                  <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">{selectedProfile.employment_type}</Badge>
                                ) : <span className="font-medium text-slate-700 dark:text-slate-200">—</span>}
                              </div>
                              <div className="flex justify-between gap-2"><span className="text-slate-500">Reports To</span><span className="font-medium text-slate-700 dark:text-slate-200 text-right">{selectedProfile.settings?.reports_to || '—'}</span></div>
                              <div className="flex justify-between gap-2"><span className="text-slate-500">Created On</span><span className="font-medium text-slate-700 dark:text-slate-200 text-right">{new Date(selectedProfile.created_at).toLocaleDateString()}</span></div>
                              <div className="flex justify-between gap-2"><span className="text-slate-500">Last Updated</span><span className="font-medium text-slate-700 dark:text-slate-200 text-right">{new Date(selectedProfile.updated_at).toLocaleDateString()}</span></div>
                            </div>
                          </div>

                          <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-3">Key Responsibilities ({selectedProfile.key_responsibilities?.length || 0})</p>
                            {selectedProfile.key_responsibilities?.length ? (
                              <ul className="space-y-1.5 text-[12px] text-slate-600 dark:text-slate-300 list-disc pl-4">
                                {selectedProfile.key_responsibilities.slice(0, 4).map((item, i) => <li key={i}>{item}</li>)}
                              </ul>
                            ) : <p className="text-[12px] text-slate-400 italic">None listed yet.</p>}
                            {selectedProfile.key_responsibilities?.length > 0 && (
                              <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-xs" onClick={() => setDetailTab('responsibilities')}>View All Responsibilities</Button>
                            )}
                          </div>

                          <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-3">Linked Clauses ({clauseSelections.length})</p>
                            {clauseSelections.length ? (
                              <div className="space-y-1.5">
                                {clauseSelections.slice(0, 4).map(({ sectionKey, sectionTitle, clauseLabel, isDefault, color }) => (
                                  <div key={sectionKey} className="flex items-center justify-between gap-2 text-[11px]">
                                    <Badge variant="outline" className={cn("text-[9px] font-semibold rounded-full px-1.5 py-0 shrink-0", color)}>{sectionTitle}</Badge>
                                    <span className="text-slate-600 dark:text-slate-300 truncate flex-1 text-right">{clauseLabel}</span>
                                    <Badge variant="outline" className={cn("text-[9px] font-semibold rounded-full px-1.5 py-0 shrink-0", isDefault ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-amber-50 text-amber-600 border-amber-200")}>
                                      {isDefault ? 'Default' : 'Custom'}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-[12px] text-slate-400 italic">No clause overrides - uses section defaults.</p>}
                            {clauseSelections.length > 0 && (
                              <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-xs" onClick={() => setDetailTab('clauses')}>View All Linked Clauses</Button>
                            )}
                          </div>
                        </TabsContent>

                        <TabsContent value="description" className="m-0">
                          <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                            {selectedProfile.job_description ? (
                              <p className="text-[12px] text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">{selectedProfile.job_description}</p>
                            ) : (
                              <p className="text-[12px] text-slate-400 italic">No job description added yet. Use Edit Profile to add one.</p>
                            )}
                          </div>
                        </TabsContent>

                        <TabsContent value="requirements" className="m-0">
                          <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                            {selectedProfile.requirements?.length ? (
                              <ul className="space-y-1.5 text-[12px] text-slate-600 dark:text-slate-300 list-disc pl-4">
                                {selectedProfile.requirements.map((item, i) => <li key={i}>{item}</li>)}
                              </ul>
                            ) : <p className="text-[12px] text-slate-400 italic">No requirements added yet. Use Edit Profile to add some.</p>}
                          </div>
                        </TabsContent>

                        <TabsContent value="responsibilities" className="m-0">
                          <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                            {selectedProfile.key_responsibilities?.length ? (
                              <ul className="space-y-1.5 text-[12px] text-slate-600 dark:text-slate-300 list-disc pl-4">
                                {selectedProfile.key_responsibilities.map((item, i) => <li key={i}>{item}</li>)}
                              </ul>
                            ) : <p className="text-[12px] text-slate-400 italic">No responsibilities added yet. Use Edit Profile to add some.</p>}
                          </div>
                        </TabsContent>

                        <TabsContent value="compensation" className="m-0 space-y-2">
                          {settingsGroups.length === 0 ? (
                            <div className="text-[12px] text-slate-400 italic border border-dashed rounded-xl p-4 border-slate-200 dark:border-slate-800">No settings configured.</div>
                          ) : (
                            settingsGroups.map((group) => (
                              <div key={group.label} className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                                <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-2">{group.label}</p>
                                <div className="space-y-1">
                                  {group.items.map(([key, value]) => (
                                    <div key={key} className="flex justify-between text-[11px] gap-2">
                                      <span className="text-slate-500 font-mono truncate">{key}</span>
                                      <span className="text-slate-700 dark:text-slate-200 font-medium text-right">{String(value)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))
                          )}
                        </TabsContent>

                        <TabsContent value="clauses" className="m-0">
                          {clauseSelections.length === 0 ? (
                            <div className="text-[12px] text-slate-400 italic border border-dashed rounded-xl p-4 border-slate-200 dark:border-slate-800">
                              No clause overrides - uses section defaults.
                            </div>
                          ) : (
                            <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                              <div className="space-y-2">
                                {clauseSelections.map(({ sectionKey, sectionTitle, clauseLabel, isDefault, color }) => (
                                  <div key={sectionKey} className="flex items-center justify-between gap-2 text-[12px] py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                    <Badge variant="outline" className={cn("text-[10px] font-semibold rounded-full px-2 py-0 shrink-0", color)}>{sectionTitle}</Badge>
                                    <span className="text-slate-600 dark:text-slate-300 truncate flex-1 text-right">{clauseLabel}</span>
                                    <Badge variant="outline" className={cn("text-[10px] font-semibold rounded-full px-2 py-0 shrink-0", isDefault ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-amber-50 text-amber-600 border-amber-200")}>
                                      {isDefault ? 'Default' : 'Custom'}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </TabsContent>
                      </div>
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
      </PanelGroup>

      {selectedCompanyId && (
        <JobProfileEditor
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          companyId={selectedCompanyId}
          clauses={clauses}
          profile={editingProfile}
          defaultScope={newScope}
          onSaved={() => loadProfiles(selectedCompanyId)}
        />
      )}

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
