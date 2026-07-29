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
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Loader2, PlusCircle, Settings, Trash2, Briefcase, BookText,
  Search, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Columns2, FileText, Database, ChevronDown, Pencil, ShieldCheck, Laptop2,
  Users, Megaphone, Car, LayoutTemplate, UserCog, FileCheck, Building, Heart, Link as LinkIcon, PlayCircle,
  Copy, History, Download, Edit2, AlertCircle, CheckCircle2, Clock, DollarSign, HeartPulse, Scale, ShieldAlert,
  ChevronRight, ArrowRight, X
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
  const [linkModalOpen, setLinkModalOpen] = useState(false);

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

  const [allProfiles, setAllProfiles] = useState<EcJobProfile[]>([]);

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

  const tabs: { value: string; label: string; icon: any }[] = [
    { value: 'overview', label: 'Overview', icon: LayoutTemplate },
    { value: 'responsibilities', label: 'Responsibilities', icon: UserCog },
    { value: 'employment_rules', label: 'Employment Rules', icon: FileCheck },
    { value: 'working_arrangement', label: 'Working Arrangement', icon: Building },
    { value: 'benefits', label: 'Benefits & Compensation', icon: Heart },
    { value: 'contract_rules', label: 'Contract Rules', icon: FileText },
    { value: 'clauses', label: `Linked Clauses (${clauseSelections.length || 24})`, icon: LinkIcon },
    { value: 'preview', label: 'Preview', icon: PlayCircle },
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
              title={collapsed.preview ? 'Show summary panel' : 'Hide summary panel'}
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
                <Button size="sm" className="h-9 w-full text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-sm" onClick={() => openNew('position')} disabled={!selectedCompanyId}>
                  <PlusCircle className="h-4 w-4 mr-2" /> Add Job Profile
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 bg-white">
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
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm mt-0.5",
                          visual.classes
                        )}>
                          <VisualIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold truncate text-slate-900 dark:text-slate-100">{profile.name}</p>
                          <p className="text-[11px] text-slate-500 truncate mt-1">
                            {profile.department || scopeLabel(profile.scope)}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {profile.job_level || 'Mid Level'}
                          </p>
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

        {/* RIGHT PANEL: Profile detail */}
        <Panel
          ref={previewPanelRef}
          defaultSize={60}
          minSize={40}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, preview: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, preview: false }))}
          className="bg-slate-50 dark:bg-slate-900 flex flex-col z-10 !overflow-auto"
        >
          <div className="flex flex-col h-full">
            {selectedProfile ? (() => {
              const visual = getProfileVisual(selectedProfile.department);
              const VisualIcon = visual.icon;
              return (
                <>
                  {/* Header */}
                  <div className="px-8 py-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex flex-col gap-4 min-w-0">
                        <div className="flex items-center gap-4">
                           <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm text-white", "bg-indigo-600")}>
                             <VisualIcon className="w-7 h-7" />
                           </div>
                           <div className="min-w-0">
                             <div className="flex items-center gap-3 mb-1">
                               <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">{selectedProfile.name}</h2>
                               <Badge className="bg-emerald-50 text-emerald-600 hover:bg-emerald-50 border-emerald-200 text-xs px-2 py-0 rounded-full h-6 shrink-0">Active</Badge>
                             </div>
                             <p className="text-sm text-slate-600 dark:text-slate-400 font-medium truncate">
                               {selectedProfile.department || scopeLabel(selectedProfile.scope)} • {selectedProfile.job_level || 'Mid Level'} • {selectedProfile.employment_type || 'Permanent'}
                             </p>
                             <p className="text-xs text-slate-500 mt-1">
                               Reports to: <span className="font-medium text-slate-700">{selectedProfile.settings?.reports_to || 'Finance Manager'}</span>
                             </p>
                           </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end justify-between gap-4 shrink-0 h-full">
                        <div className="flex gap-6 text-[11px] text-slate-500 text-right">
                          <div className="flex flex-col gap-1">
                             <p>Created: <span className="font-medium text-slate-700">{new Date(selectedProfile.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span></p>
                             <p>Last Updated: <span className="font-medium text-slate-700">{new Date(selectedProfile.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span></p>
                          </div>
                          <div className="flex flex-col gap-1 text-left">
                             <p>By: <span className="font-medium text-slate-700">Jane Admin</span></p>
                             <p>By: <span className="font-medium text-slate-700">Jane Admin</span></p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <Button variant="outline" size="sm" className="h-9 px-4 rounded-full font-semibold">Cancel</Button>
                          <Button variant="outline" size="sm" className="h-9 px-4 rounded-full font-semibold">Save Draft</Button>
                          <div className="flex rounded-full shadow-sm bg-blue-600">
                            <Button size="sm" className="h-9 bg-transparent hover:bg-blue-700 text-white rounded-l-full rounded-r-none border-r border-blue-700 font-semibold px-4">
                              Save Job Profile
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" className="h-9 bg-transparent hover:bg-blue-700 text-white rounded-r-full rounded-l-none px-2.5">
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-xl">
                                <DropdownMenuItem onClick={() => openEdit(selectedProfile)}>
                                  <Pencil className="h-4 w-4 mr-2" /> Edit Profile
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
                          <div className="p-8 max-w-[1400px] mx-auto space-y-6">
                            
                            {/* Top row */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                              {/* Left: Basic Info (col-span-7) */}
                              <div className="lg:col-span-7 flex flex-col gap-6">
                                {/* Basic Information Card */}
                                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                                  <h3 className="text-sm font-bold text-slate-800 mb-5">Basic Information</h3>
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                    <div className="space-y-1.5">
                                      <label className="text-[11px] font-semibold text-slate-500">Job Title <span className="text-red-500">*</span></label>
                                      <Input value={selectedProfile.job_title || selectedProfile.name || ''} readOnly className="h-9 text-xs bg-slate-50/50" />
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-[11px] font-semibold text-slate-500">Job Code</label>
                                      <Input value="ACC-001" readOnly className="h-9 text-xs bg-slate-50/50" />
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-[11px] font-semibold text-slate-500">Department <span className="text-red-500">*</span></label>
                                      <div className="relative">
                                        <Input value={selectedProfile.department || 'Finance Department'} readOnly className="h-9 text-xs bg-slate-50/50 pr-8" />
                                        <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-[11px] font-semibold text-slate-500">Job Level <span className="text-red-500">*</span></label>
                                      <div className="relative">
                                        <Input value={selectedProfile.job_level || 'Mid Level'} readOnly className="h-9 text-xs bg-slate-50/50 pr-8" />
                                        <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-[11px] font-semibold text-slate-500">Employment Types <span className="text-red-500">*</span></label>
                                      <div className="flex items-center gap-1.5 p-1 border border-slate-200 rounded-md bg-slate-50/50 min-h-9 flex-wrap relative pr-8">
                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-[10px] font-medium py-0 h-5">Permanent <X className="h-3 w-3 ml-1 opacity-50" /></Badge>
                                        <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50 text-[10px] font-medium py-0 h-5">Probation <X className="h-3 w-3 ml-1 opacity-50" /></Badge>
                                        <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-[11px] font-semibold text-slate-500">Reports To <span className="text-red-500">*</span></label>
                                      <div className="relative">
                                        <Input value={selectedProfile.settings?.reports_to || 'Finance Manager'} readOnly className="h-9 text-xs bg-slate-50/50 pr-8" />
                                        <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-[11px] font-semibold text-slate-500">Job Family</label>
                                      <div className="relative">
                                        <Input value="Finance & Accounting" readOnly className="h-9 text-xs bg-slate-50/50 pr-8" />
                                        <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-[11px] font-semibold text-slate-500">Work Location <span className="text-red-500">*</span></label>
                                      <div className="relative">
                                        <Input value="Head Office - Nairobi" readOnly className="h-9 text-xs bg-slate-50/50 pr-8" />
                                        <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-[11px] font-semibold text-slate-500">Contract Theme</label>
                                      <div className="relative">
                                        <Input value="Corporate Blue" readOnly className="h-9 text-xs bg-slate-50/50 pr-8" />
                                        <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                      </div>
                                    </div>
                                    <div className="space-y-1.5 col-span-2">
                                      <label className="text-[11px] font-semibold text-slate-500">Default Contract Type</label>
                                      <div className="relative w-[calc(50%-12px)]">
                                        <Input value="Permanent Employment Contract" readOnly className="h-9 text-xs bg-slate-50/50 pr-8" />
                                        <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                      </div>
                                    </div>
                                    <div className="space-y-1.5 col-span-2">
                                      <label className="text-[11px] font-semibold text-slate-500">Job Summary</label>
                                      <div className="relative">
                                        <textarea readOnly className="w-full min-h-[80px] p-3 text-xs border border-slate-200 rounded-md bg-slate-50/50 resize-none text-slate-700" value={selectedProfile.job_description || "Responsible for maintaining accurate financial records, preparing financial reports, managing accounts payable and receivable, reconciling bank statements and supporting month-end and year-end close activities."} />
                                        <span className="absolute bottom-2 right-2 text-[10px] text-slate-400">174/500</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Row 2 under Basic Info: Qualifications and Skills */}
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 mb-4">Qualifications & Experience</h3>
                                    {selectedProfile.requirements?.length ? (
                                      <ul className="space-y-2 text-xs text-slate-600 list-disc pl-4">
                                        {selectedProfile.requirements.map((item, i) => <li key={i}>{item}</li>)}
                                      </ul>
                                    ) : (
                                      <ul className="space-y-2 text-xs text-slate-600 list-disc pl-4">
                                        <li>Bachelor's degree in Accounting, Finance or related field.</li>
                                        <li>CPA Section 4 or equivalent professional qualification.</li>
                                        <li>Minimum 2 years of relevant accounting experience.</li>
                                        <li>Strong knowledge of accounting principles and standards.</li>
                                        <li>Proficiency in ERP and MS Excel.</li>
                                      </ul>
                                    )}
                                  </div>
                                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 mb-4">Core Skills</h3>
                                    <div className="flex flex-wrap gap-2">
                                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-[10px]">Financial Reporting</Badge>
                                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-[10px]">Account Reconciliation</Badge>
                                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-[10px]">Tax Compliance</Badge>
                                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-[10px]">Budgeting & Forecasting</Badge>
                                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-[10px]">Excel (Advanced)</Badge>
                                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-[10px]">ERP Systems</Badge>
                                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-[10px]">Attention to Detail</Badge>
                                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-[10px]">Analytical Thinking</Badge>
                                      <Button variant="outline" size="sm" className="h-6 text-[10px] rounded-full border-dashed text-blue-600 border-blue-200 hover:bg-blue-50">
                                        <PlusCircle className="h-3 w-3 mr-1" /> Add Skill
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Middle: Snapshot & Competencies (col-span-3) */}
                              <div className="lg:col-span-3 flex flex-col gap-6">
                                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                                  <div className="flex items-center gap-2 mb-5">
                                    <FileCheck className="w-4 h-4 text-slate-400" />
                                    <h3 className="text-sm font-bold text-slate-800">Employment Snapshot</h3>
                                  </div>
                                  <div className="space-y-4 text-xs">
                                    <div className="flex justify-between items-center"><span className="text-slate-500">Notice Period (Default)</span><span className="font-semibold text-slate-800">2 Months</span></div>
                                    <div className="flex justify-between items-center"><span className="text-slate-500">Probation Period</span><span className="font-semibold text-slate-800">3 Months</span></div>
                                    <div className="flex justify-between items-center"><span className="text-slate-500">Annual Leave</span><span className="font-semibold text-slate-800">21 Days</span></div>
                                    <div className="flex justify-between items-center"><span className="text-slate-500">Sick Leave</span><span className="font-semibold text-slate-800">14 Days</span></div>
                                    <div className="flex justify-between items-center"><span className="text-slate-500">Overtime Eligible</span><span className="font-semibold text-slate-800">Yes</span></div>
                                    <div className="flex justify-between items-center"><span className="text-slate-500">Remote Work Allowed</span><span className="font-semibold text-slate-800">No</span></div>
                                  </div>
                                </div>
                                
                                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                                  <h3 className="text-sm font-bold text-slate-800 mb-5">Key Competencies</h3>
                                  <div className="space-y-4">
                                    {[
                                      { label: 'Financial Accuracy', val: 90 },
                                      { label: 'Reporting', val: 85 },
                                      { label: 'Analysis', val: 80 },
                                      { label: 'Compliance', val: 85 },
                                      { label: 'Communication', val: 70 },
                                    ].map(comp => (
                                      <div key={comp.label} className="space-y-1.5">
                                        <div className="flex justify-between text-[11px]">
                                          <span className="text-slate-600 font-medium flex items-center gap-2">
                                            <CheckCircle2 className="h-3 w-3 text-blue-500" /> {comp.label}
                                          </span>
                                          <span className="text-slate-500 font-bold">{comp.val}%</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${comp.val}%` }} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              
                              {/* Right: Tags, Quick Actions, Assets (col-span-2) */}
                              <div className="lg:col-span-2 flex flex-col gap-6">
                                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                                  <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-bold text-slate-800">Job Tags</h3>
                                    <button className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-[11px] font-semibold"><Edit2 className="h-3 w-3" /> Edit</button>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium text-[10px] py-0 border-transparent">Finance</Badge>
                                    <Badge variant="secondary" className="bg-sky-50 text-sky-700 hover:bg-sky-100 font-medium text-[10px] py-0 border-transparent">Accounting</Badge>
                                    <Badge variant="secondary" className="bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium text-[10px] py-0 border-transparent">Reports</Badge>
                                    <Badge variant="secondary" className="bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 font-medium text-[10px] py-0 border-transparent">Analysis</Badge>
                                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium text-[10px] py-0 border-transparent">Reconciliation</Badge>
                                  </div>
                                </div>
                                
                                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                                  <h3 className="text-sm font-bold text-slate-800 mb-4">Quick Actions</h3>
                                  <div className="space-y-3">
                                    <button className="flex items-center gap-3 text-xs text-slate-600 hover:text-blue-600 w-full font-medium">
                                      <Copy className="h-4 w-4 text-slate-400" /> Duplicate Job Profile
                                    </button>
                                    <button className="flex items-center gap-3 text-xs text-slate-600 hover:text-blue-600 w-full font-medium">
                                      <History className="h-4 w-4 text-slate-400" /> View Job Profile History
                                    </button>
                                    <button className="flex items-center gap-3 text-xs text-slate-600 hover:text-blue-600 w-full font-medium">
                                      <Download className="h-4 w-4 text-slate-400" /> Download Job Description
                                    </button>
                                    <button className="flex items-center gap-3 text-xs text-slate-600 hover:text-blue-600 w-full font-medium">
                                      <FileText className="h-4 w-4 text-slate-400" /> Generate Contract Preview
                                    </button>
                                  </div>
                                </div>
                                
                                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                                  <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-bold text-slate-800">Equipment & Assets</h3>
                                    <button className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-[11px] font-semibold"><Edit2 className="h-3 w-3" /> Edit</button>
                                  </div>
                                  <ul className="space-y-2.5 text-xs text-slate-600 font-medium">
                                    <li className="flex items-center gap-2.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Laptop</li>
                                    <li className="flex items-center gap-2.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Access Card</li>
                                    <li className="flex items-center gap-2.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Company Email</li>
                                    <li className="flex items-center gap-2.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Office Stationery</li>
                                    <li className="flex items-center gap-2.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Calculator</li>
                                  </ul>
                                  <Button variant="link" size="sm" className="h-auto p-0 mt-4 text-[11px] font-semibold text-blue-600">
                                    <PlusCircle className="h-3.5 w-3.5 mr-1" /> Add Equipment
                                  </Button>
                                </div>
                              </div>
                            </div>
                            
                            {/* Matched Clauses Section */}
                            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                               <div className="flex items-center gap-2 mb-6">
                                 <h3 className="text-sm font-bold text-slate-800">Matched Clauses</h3>
                                 <span className="text-[11px] text-slate-500 font-medium">(Auto-linked by rules based on this job profile)</span>
                               </div>
                               
                               <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                  {[
                                    { icon: Clock, iconColor: 'text-teal-600', iconBg: 'bg-teal-50', title: 'Working Hours', subtitle: 'Standard Office Hours', source: 'Working Arrangement', req: 'Required' },
                                    { icon: DollarSign, iconColor: 'text-purple-600', iconBg: 'bg-purple-50', title: 'Compensation', subtitle: 'Basic Salary Clause', source: 'Compensation Rules', req: 'Required' },
                                    { icon: HeartPulse, iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50', title: 'Benefits', subtitle: 'Medical Cover Benefit', source: 'Benefits Rules', req: 'Optional', reqColor: 'text-amber-600', reqBg: 'bg-amber-50' },
                                    { icon: ShieldAlert, iconColor: 'text-rose-600', iconBg: 'bg-rose-50', title: 'Termination', subtitle: 'Notice Period - Mid Level', source: 'Employment Rules', req: 'Required' },
                                    { icon: Scale, iconColor: 'text-blue-600', iconBg: 'bg-blue-50', title: 'Obligations', subtitle: 'Confidentiality Clause', source: 'Contract Rules', req: 'Required' },
                                  ].map((card, i) => (
                                    <div key={i} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3 hover:border-blue-300 transition-colors">
                                      <div className="flex items-start justify-between">
                                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", card.iconBg, card.iconColor)}>
                                          <card.icon className="w-4 h-4" />
                                        </div>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-1">{card.title}</p>
                                        <p className="text-xs font-semibold text-slate-700">{card.subtitle}</p>
                                        <p className="text-[10px] text-slate-500 mt-1">Source: {card.source}</p>
                                        <p className="text-[10px] text-slate-500">Confidence: 100%</p>
                                      </div>
                                      <div className="mt-auto flex justify-end">
                                        <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-sm", card.req === 'Required' ? "text-emerald-600 bg-emerald-50" : (card.reqColor || "text-amber-600") + " " + (card.reqBg || "bg-amber-50"))}>{card.req}</span>
                                      </div>
                                    </div>
                                  ))}
                                  
                                  <div 
                                    className="border border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:border-blue-400 hover:bg-blue-50/50 transition-colors cursor-pointer"
                                    onClick={() => setLinkModalOpen(true)}
                                  >
                                     <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 pointer-events-none">
                                       <PlusCircle className="h-5 w-5" />
                                     </Button>
                                     <p className="text-xs font-semibold text-blue-600 text-center">View all 24<br/>matched clauses</p>
                                  </div>
                               </div>
                               
                               <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-100">
                                 <div className="flex items-center gap-2 text-xs text-slate-500">
                                   <AlertCircle className="w-4 h-4 text-blue-500" />
                                   Clauses are automatically matched based on your configuration. You can review and override them in the Linked Clauses tab.
                                 </div>
                                 <div className="flex items-center gap-3">
                                   <Button variant="outline" size="sm" className="h-9 px-4 rounded-full font-semibold">Preview Contract</Button>
                                   <Button size="sm" className="h-9 px-6 rounded-full font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
                                     Save Job Profile <ChevronDown className="w-4 h-4" />
                                   </Button>
                                 </div>
                               </div>
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="responsibilities" className="m-0 p-8">
                          <div className="bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                            <h3 className="text-sm font-bold text-slate-800 mb-4">Key Responsibilities</h3>
                            {selectedProfile.key_responsibilities?.length ? (
                              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300 list-disc pl-4">
                                {selectedProfile.key_responsibilities.map((item, i) => <li key={i}>{item}</li>)}
                              </ul>
                            ) : <p className="text-sm text-slate-400 italic">No responsibilities added yet. Use Edit Profile to add some.</p>}
                          </div>
                        </TabsContent>

                        <TabsContent value="benefits" className="m-0 p-8 space-y-4">
                          {settingsGroups.length === 0 ? (
                            <div className="text-sm text-slate-400 italic border border-dashed rounded-2xl p-6 border-slate-200 dark:border-slate-800 text-center">No settings configured.</div>
                          ) : (
                            settingsGroups.map((group) => (
                              <div key={group.label} className="bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-300 mb-4">{group.label}</p>
                                <div className="space-y-2">
                                  {group.items.map(([key, value]) => (
                                    <div key={key} className="flex justify-between text-sm gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                                      <span className="text-slate-500 font-mono truncate">{key}</span>
                                      <span className="text-slate-800 dark:text-slate-200 font-medium text-right">{String(value)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))
                          )}
                        </TabsContent>

                        <TabsContent value="clauses" className="m-0 p-8">
                          {clauseSelections.length === 0 ? (
                            <div className="text-sm text-slate-400 italic border border-dashed rounded-2xl p-6 border-slate-200 dark:border-slate-800 text-center">
                              No clause overrides - uses section defaults.
                            </div>
                          ) : (
                            <div className="bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                              <div className="space-y-3">
                                {clauseSelections.map(({ sectionKey, sectionTitle, clauseLabel, isDefault, color }) => (
                                  <div key={sectionKey} className="flex items-center justify-between gap-4 text-sm py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                    <Badge variant="outline" className={cn("text-xs font-semibold rounded-full px-3 py-0.5 shrink-0 border-transparent", color)}>{sectionTitle}</Badge>
                                    <span className="text-slate-700 dark:text-slate-300 truncate flex-1">{clauseLabel}</span>
                                    <Badge variant="outline" className={cn("text-xs font-semibold rounded-full px-3 py-0.5 shrink-0", isDefault ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200")}>
                                      {isDefault ? 'Default' : 'Custom'}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </TabsContent>

                        {/* Fallback for other tabs */}
                        {['employment_rules', 'working_arrangement', 'contract_rules', 'preview'].map(v => (
                           <TabsContent key={v} value={v} className="m-0 p-8">
                              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
                                This section is under construction.
                              </div>
                           </TabsContent>
                        ))}
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

      {/* Link Clauses Modal */}
      <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
        <DialogContent className="max-w-[1100px] p-0 gap-0 overflow-hidden rounded-2xl">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-start">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <LinkIcon className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900">Link Contract Clauses</DialogTitle>
                <p className="text-sm text-slate-500 mt-1">Review and manage contract clauses linked to this job profile.</p>
              </div>
            </div>
          </div>
          
          <div className="p-6 bg-slate-50/50 flex gap-6">
             <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4 flex-1 shadow-sm">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500"><UserCog className="w-5 h-5" /></div>
                   <div>
                     <p className="text-xs text-slate-500">Job Profile</p>
                     <p className="text-sm font-bold text-slate-900">Accountant</p>
                     <p className="text-[11px] text-slate-500">Finance Department • Mid Level</p>
                   </div>
                </div>
                <div className="w-px h-10 bg-slate-200"></div>
                <div>
                   <p className="text-xs text-slate-500">Employment Type</p>
                   <p className="text-sm font-medium text-slate-900">Permanent, Probation</p>
                </div>
                <div className="w-px h-10 bg-slate-200"></div>
                <div>
                   <p className="text-xs text-slate-500">Work Arrangement</p>
                   <p className="text-sm font-medium text-slate-900">Office Based</p>
                   <p className="text-[11px] text-slate-500">Mon - Fri, 8:00 AM - 5:00 PM</p>
                </div>
                <div className="w-px h-10 bg-slate-200"></div>
                <div>
                   <p className="text-xs text-slate-500">Notice Period <span className="text-[10px] text-slate-400">(Default)</span></p>
                   <p className="text-sm font-medium text-slate-900">2 Months</p>
                </div>
             </div>
             
             <div className="bg-white border border-slate-200 rounded-xl p-4 w-48 shadow-sm flex flex-col justify-center text-center shrink-0">
               <p className="text-xs text-slate-500">Total Clauses Linked</p>
               <p className="text-3xl font-bold text-slate-900 my-1">24</p>
               <div className="flex justify-center"><p className="text-[11px] font-medium text-blue-600 bg-blue-50 rounded-full py-0.5 px-2 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Auto-linked by rules</p></div>
             </div>
          </div>
          
          <div className="flex border-t border-slate-200 h-[480px]">
             {/* Col 1: Sections */}
             <div className="w-64 border-r border-slate-200 bg-white flex flex-col">
               <div className="p-4 border-b border-slate-100">
                 <p className="text-sm font-bold text-slate-800">Contract Sections</p>
                 <p className="text-xs text-slate-500 mt-0.5">21 sections</p>
               </div>
               <ScrollArea className="flex-1">
                 <div className="p-2 space-y-1">
                   {['Contract Heading', 'Parties', 'Appointment', 'Place of Work', 'Duties & Responsibilities', 'Working Hours', 'Remuneration', 'Benefits', 'Statutory Deductions', 'Leave Entitlements', 'Employee Obligations', 'Performance Expectations', 'Termination', 'General Provisions', 'Acceptance'].map((sec, i) => (
                     <div key={i} className={cn("flex items-center justify-between p-2 rounded-lg text-xs font-medium cursor-pointer transition-colors", sec === 'Parties' ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50")}>
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 opacity-70" /> {sec}
                        </div>
                        <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5 min-w-[20px] flex items-center justify-center border-transparent", sec === 'Parties' ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500")}>{sec === 'Parties' ? '2' : '1'}</Badge>
                     </div>
                   ))}
                   <Button variant="link" className="w-full text-xs text-blue-600 mt-2 h-8"><ChevronDown className="w-3 h-3 mr-1" /> View all sections</Button>
                 </div>
               </ScrollArea>
               <div className="p-4 border-t border-slate-200 bg-slate-50/50">
                 <Button variant="outline" className="w-full text-xs h-10 bg-white border-blue-200 text-blue-600 hover:bg-blue-50 relative">
                   <LinkIcon className="w-3.5 h-3.5 mr-2 mb-2" /> <span className="mb-2">Auto-Link Clauses</span>
                   <p className="text-[9px] text-slate-500 absolute bottom-1.5 w-full text-center">Re-run rules to refresh matches</p>
                 </Button>
               </div>
             </div>
             
             {/* Col 2: Clauses in "Parties" */}
             <div className="w-80 border-r border-slate-200 bg-slate-50/50 flex flex-col">
               <div className="p-4 border-b border-slate-100 bg-white">
                 <p className="text-sm font-bold text-slate-800">Clauses in "Parties"</p>
                 <p className="text-xs text-slate-500 mt-0.5">2 clauses available</p>
               </div>
               <div className="p-3 border-b border-slate-200 bg-slate-50/50">
                 <div className="flex gap-2">
                   <div className="relative flex-1">
                     <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                     <Input placeholder="Search clauses..." className="h-8 pl-8 text-xs bg-white border-slate-200" />
                   </div>
                   <Button variant="outline" size="sm" className="h-8 text-[11px] px-2 bg-white font-medium border-slate-200">All Status <ChevronDown className="w-3 h-3 ml-1" /></Button>
                 </div>
               </div>
               <ScrollArea className="flex-1 p-4">
                 <div className="space-y-4">
                   {/* Selected Clause Card */}
                   <div className="bg-white border-2 border-blue-500 rounded-xl p-4 shadow-sm relative cursor-pointer">
                     <div className="absolute top-4 right-4 w-4 h-4 rounded-full border-4 border-blue-500 bg-white"></div>
                     <div className="flex items-center gap-1.5 mb-1">
                       <div className="w-2.5 h-2.5 bg-amber-400 rounded-sm"></div>
                       <p className="text-sm font-bold text-slate-900">Standard Parties</p>
                     </div>
                     <p className="text-[10px] text-slate-500 font-mono mb-4 pl-4">standard_parties</p>
                     
                     <div className="flex items-center gap-2 mb-4">
                       <Badge variant="secondary" className="bg-amber-50 text-amber-700 hover:bg-amber-100 text-[10px] py-0 border-transparent font-medium">Default</Badge>
                       <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[10px] py-0 border-transparent font-medium">Active</Badge>
                     </div>
                     
                     <div className="space-y-2 text-[11px]">
                       <div className="flex justify-between"><span className="text-slate-500">Scope:</span><span className="font-medium text-slate-700">Global</span></div>
                       <div className="flex justify-between items-center"><span className="text-slate-500">Matches: 100%</span><div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 w-full"></div></div></div>
                       <div className="text-slate-500 pt-2 border-t border-slate-100 mt-2">Used in 48 job profiles</div>
                     </div>
                   </div>
                   
                   {/* Unselected Clause Card */}
                   <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-slate-300 cursor-pointer transition-colors relative">
                     <div className="absolute top-4 right-4 w-4 h-4 rounded-full border border-slate-300 bg-white"></div>
                     <p className="text-sm font-bold text-slate-900 mb-1">Formal Corporate Style</p>
                     <p className="text-[10px] text-slate-500 font-mono mb-4">formal_corporate_style</p>
                     
                     <div className="flex items-center gap-2 mb-4">
                       <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[10px] py-0 border-transparent font-medium">Active</Badge>
                     </div>
                     
                     <div className="space-y-2 text-[11px]">
                       <div className="flex justify-between"><span className="text-slate-500">Scope:</span><span className="font-medium text-slate-700">Global</span></div>
                       <div className="flex justify-between items-center"><span className="text-slate-500">Matches: 68%</span><div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 w-[68%]"></div></div></div>
                       <div className="text-slate-500 pt-2 border-t border-slate-100 mt-2">Used in 15 job profiles</div>
                     </div>
                   </div>
                 </div>
                 <p className="text-[11px] text-slate-400 text-center mt-5 mb-2">Showing 1 to 2 of 2 clauses</p>
               </ScrollArea>
             </div>
             
             {/* Col 3: Match Details & Preview */}
             <div className="flex-1 bg-white flex flex-col">
               <div className="p-6 flex gap-8 h-full">
                 <div className="w-64 space-y-6 flex flex-col">
                   <div>
                     <p className="text-sm font-bold text-slate-800 mb-1">Match Details</p>
                     <p className="text-[11px] text-slate-500 mb-4">Why this clause was selected</p>
                     <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                       <p className="text-xs font-bold text-emerald-700 flex items-center gap-2 mb-2"><CheckCircle2 className="w-4 h-4" /> Best Match</p>
                       <p className="text-[10px] text-emerald-600 mb-4">This clause best matches the job profile rules.</p>
                       <ul className="space-y-3 text-[11px]">
                         <li className="flex justify-between items-center"><span className="flex items-center gap-1.5 text-slate-600"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Employment Type:</span><span className="font-medium text-emerald-600">Matched</span></li>
                         <li className="flex justify-between items-center"><span className="flex items-center gap-1.5 text-slate-600"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Job Level: Mid Level</span><span className="font-medium text-emerald-600">Matched</span></li>
                         <li className="flex justify-between items-center"><span className="flex items-center gap-1.5 text-slate-600"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Work Arrangement: Offi...</span><span className="font-medium text-emerald-600">Matched</span></li>
                         <li className="flex justify-between items-center"><span className="flex items-center gap-1.5 text-slate-600"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Jurisdiction: Kenya</span><span className="font-medium text-emerald-600">Matched</span></li>
                         <li className="flex justify-between items-center"><span className="flex items-center gap-1.5 text-slate-600"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Company Type: Registe...</span><span className="font-medium text-emerald-600">Matched</span></li>
                       </ul>
                     </div>
                   </div>
                   
                   <div className="space-y-6 flex-1">
                     <div>
                       <p className="text-xs font-bold text-slate-800 mb-3">Match Score</p>
                       <div className="flex items-center gap-4">
                         <div className="w-14 h-14 rounded-full border-4 border-emerald-500 flex items-center justify-center text-sm font-bold text-emerald-700 bg-emerald-50 shrink-0">100%</div>
                         <div>
                           <p className="text-xs font-bold text-slate-700">Perfect Match</p>
                           <p className="text-[10px] text-slate-500 mt-1">All rule conditions are satisfied.</p>
                         </div>
                       </div>
                     </div>
                     <div>
                       <p className="text-xs font-bold text-slate-800 mb-3">Rule Source</p>
                       <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                         <p className="text-[11px] font-semibold text-slate-700 mb-2">Parties Selection Rule</p>
                         <div className="flex justify-between items-center">
                           <Badge variant="secondary" className="bg-purple-50 text-purple-700 hover:bg-purple-50 text-[9px] py-0 border-transparent font-medium">Priority: 1 (Highest)</Badge>
                           <Button variant="link" className="h-auto p-0 text-[10px] text-blue-600 font-semibold">View Rule</Button>
                         </div>
                       </div>
                     </div>
                   </div>
                 </div>
                 
                 <div className="flex-1 flex flex-col">
                   <p className="text-sm font-bold text-slate-800 mb-1">Clause Preview</p>
                   <p className="text-[11px] text-slate-500 mb-4">Preview how it will appear in the contract</p>
                   
                   <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex-1 flex flex-col relative overflow-hidden">
                     <div className="flex justify-between items-start mb-4">
                       <div>
                         <p className="text-sm font-bold text-slate-900">Standard Parties</p>
                         <p className="text-[10px] text-slate-500 font-mono mt-0.5">Key: standard_parties</p>
                       </div>
                       <Badge variant="outline" className="text-[10px] font-semibold bg-white">Global</Badge>
                     </div>
                     <p className="text-[10px] font-bold text-slate-600 mb-2 uppercase tracking-wider">Content</p>
                     <div className="text-[11px] text-slate-700 leading-relaxed space-y-3 flex-1 overflow-auto pr-2">
                       <p>This Employment Contract ("<strong>Contract</strong>") is entered into on <strong>{"{{contract_date}}"}</strong> between:</p>
                       <p><strong>{"{{company_name}}"}</strong>, a company incorporated under the laws of the Republic of Kenya (Company No. <strong>{"{{company_registration_number}}"}</strong>), with its registered office at <strong>{"{{company_address}}"}</strong> (hereinafter referred to as "<strong>the Employer</strong>"); and</p>
                       <p><strong>{"{{employee_name}}"}</strong>, an adult of sound mind, holder of Kenya National Identity Card No. <strong>{"{{national_id}}"}</strong> / Passport No. <strong>{"{{passport_number}}"}</strong>, KRA PIN <strong>{"{{kra_pin}}"}</strong>, of <strong>{"{{employee_address}}"}</strong> (hereinafter referred to as "<strong>the Employee</strong>").</p>
                       <p>The Employer and the Employee are individually referred to as a "<strong>Party</strong>" and collectively as "<strong>the Parties</strong>".</p>
                     </div>
                     
                     <div className="pt-4 border-t border-slate-200 mt-4">
                       <p className="text-[10px] font-bold text-slate-600 mb-3 uppercase tracking-wider">Placeholders Used</p>
                       <div className="flex flex-wrap gap-2">
                         {['{{contract_date}}', '{{company_name}}', '{{company_registration_number}}', '{{company_address}}', '{{employee_name}}', '{{national_id}}', '{{passport_number}}', '{{kra_pin}}', '{{employee_address}}'].map(p => (
                           <span key={p} className="text-[10px] font-mono bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-md">{p}</span>
                         ))}
                       </div>
                     </div>
                   </div>
                 </div>
               </div>
             </div>
          </div>
          
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
            <Button variant="outline" className="h-9 px-6 rounded-full text-xs font-semibold" onClick={() => setLinkModalOpen(false)}>Cancel</Button>
            <Button className="h-9 px-6 rounded-full text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setLinkModalOpen(false)}><CheckCircle2 className="w-4 h-4 mr-2" /> Save Links</Button>
          </div>
        </DialogContent>
      </Dialog>

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