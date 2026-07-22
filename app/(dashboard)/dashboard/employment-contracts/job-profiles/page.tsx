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
import {
  Loader2, PlusCircle, Settings, Trash2, Briefcase, BookText, Building2,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Columns2, FileText, User,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { fetchCompanies, Company } from '../../companies/database';
import { EcJobProfile, fetchJobProfiles, deleteJobProfile, JobProfileScope } from '../utils/jobProfileData';
import { EcClause, fetchClauses } from '../utils/clauseLibraryData';
import { JobProfileEditor } from '../components/JobProfileEditor';
import { CONTRACT_SECTIONS } from '../utils/contractStructure';
import { CompaniesSidebar } from '../components/CompaniesSidebar';

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
  const [selectedProfile, setSelectedProfile] = useState<EcJobProfile | null>(null);

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
    })();
  }, []);

  const loadProfiles = async (id: string) => {
    if (!id) return;
    setIsLoading(true);
    setProfiles(await fetchJobProfiles(id));
    setIsLoading(false);
  };

  useEffect(() => { if (selectedCompanyId) loadProfiles(selectedCompanyId); }, [selectedCompanyId]);

  const positionProfiles = useMemo(() => profiles.filter((p) => p.scope === 'position'), [profiles]);
  const defaultProfiles = useMemo(() => profiles.filter((p) => p.scope !== 'position'), [profiles]);

  const companyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of profiles) {
      counts[p.company_id] = (counts[p.company_id] || 0) + 1;
    }
    return counts;
  }, [profiles]);

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
      if (selectedProfile?.id === id) setSelectedProfile(null);
      toast({ title: 'Profile deleted' });
    } else {
      toast({ title: 'Error', description: 'Could not delete - it may still be referenced by an Employment Offer.', variant: 'destructive' });
    }
  };

  const selectedCompany = useMemo(() =>
    companies.find(c => String(c.id) === selectedCompanyId) || null,
    [companies, selectedCompanyId]
  );

  const selectedCompanyClauses = useMemo(() => {
    if (!selectedProfile) return [];
    return Object.entries(selectedProfile.section_clauses || {}).map(([sectionKey, clauseId]) => {
      const section = CONTRACT_SECTIONS.find(s => s.key === sectionKey);
      const clause = clauses.find(c => c.id === clauseId);
      return { sectionKey, sectionTitle: section?.title || sectionKey, clauseLabel: clause?.label || 'Unknown', clauseKey: clause?.clause_key || '' };
    });
  }, [selectedProfile, clauses]);

  const renderCard = (profile: EcJobProfile) => (
    <div
      key={profile.id}
      onClick={() => { openEdit(profile); setSelectedProfile(profile); }}
      className={cn(
        "cursor-pointer border rounded-xl p-4 transition-all duration-200",
        selectedProfile?.id === profile.id
          ? "border-custom-blue bg-blue-50 dark:bg-blue-900/20 shadow-md ring-1 ring-custom-blue/20"
          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{profile.name}</p>
          <p className="text-xs text-slate-400 truncate">
            {[profile.department, profile.job_title, profile.employment_type].filter(Boolean).join(' • ') || 'No attributes set'}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={(e) => { e.stopPropagation(); openEdit(profile); setSelectedProfile(profile); }}>
            <Settings className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={(e) => { e.stopPropagation(); setDeletingId(profile.id); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-3">
        {!profile.is_active && (
          <Badge variant="outline" className="text-[10px] font-semibold bg-slate-100 text-slate-500 border-slate-200 rounded-full px-2 py-0.5">Inactive</Badge>
        )}
        <Badge variant="outline" className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 border-indigo-200 rounded-full px-2 py-0.5">
          {profile.scope}
        </Badge>
        {profile.job_level && (
          <Badge variant="outline" className="text-[10px] font-semibold bg-purple-50 text-purple-700 border-purple-200 rounded-full px-2 py-0.5">{profile.job_level}</Badge>
        )}
        <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 text-slate-600 border-slate-200 rounded-full px-2 py-0.5">
          {Object.keys(profile.section_clauses || {}).length} clauses
        </Badge>
      </div>
    </div>
  );

  return (
    <div className="max-h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100">Job Profiles</h1>
          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-3">
            <button
              onClick={() => togglePanel('sidebar')}
              title={collapsed.sidebar ? 'Show entities panel' : 'Hide entities panel'}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                collapsed.sidebar ? "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" : "text-custom-blue bg-blue-50 dark:bg-blue-900/20"
              )}
            >
              {collapsed.sidebar ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <button
              onClick={() => togglePanel('editor')}
              title={collapsed.editor ? 'Show profiles panel' : 'Hide profiles panel'}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                collapsed.editor ? "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" : "text-custom-blue bg-blue-50 dark:bg-blue-900/20"
              )}
            >
              <Columns2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => togglePanel('preview')}
              title={collapsed.preview ? 'Show details panel' : 'Hide details panel'}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                collapsed.preview ? "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" : "text-custom-blue bg-blue-50 dark:bg-blue-900/20"
              )}
            >
              {collapsed.preview ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/dashboard/employment-contracts" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">Contracts</Link>
          <Link href="/dashboard/employment-contracts/clause-library" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><BookText className="w-3.5 h-3.5" /> Clauses</Link>
          <Link href="/dashboard/employment-contracts/templates" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><Settings className="w-3.5 h-3.5" /> Templates</Link>
        </div>
      </div>

      <PanelGroup direction="horizontal" className="h-full w-full">
        {/* LEFT PANEL: Companies sidebar */}
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
            selectedCompanyId={selectedCompanyId}
            onSelectCompany={(id) => { setSelectedCompanyId(id || ''); setSelectedProfile(null); }}
            companyCounts={companyCounts}
            subtitle="Manage job profiles"
          />
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* CENTER PANEL: Profile cards */}
        <Panel
          ref={editorPanelRef}
          defaultSize={50}
          minSize={30}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, editor: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, editor: false }))}
          className="bg-slate-50 dark:bg-slate-950 flex flex-col z-10 !overflow-auto"
        >
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-custom-blue" />
                    {selectedCompany?.company_name || 'Select a company'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Reusable job packages — configure once, reuse for every hire in that role
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openNew('department')} disabled={!selectedCompanyId}>
                    <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> Dept Defaults
                  </Button>
                  <Button size="sm" className="h-8 text-xs" onClick={() => openNew('position')} disabled={!selectedCompanyId}>
                    <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> New Profile
                  </Button>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              {isLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Tabs defaultValue="position">
                  <TabsList className="bg-slate-100 dark:bg-slate-800 mb-4">
                    <TabsTrigger value="position" className="text-xs">Position Profiles ({positionProfiles.length})</TabsTrigger>
                    <TabsTrigger value="defaults" className="text-xs">Company &amp; Dept Defaults ({defaultProfiles.length})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="position">
                    {positionProfiles.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-40 text-center border-2 border-dashed rounded-2xl border-slate-200 dark:border-slate-800">
                        <Briefcase className="h-10 w-10 text-slate-300 mb-3" />
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">No position profiles yet</h3>
                        <p className="text-xs text-slate-500 mt-1">Create a profile to define contract terms for a role.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {positionProfiles.map(renderCard)}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="defaults">
                    {defaultProfiles.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-40 text-center border-2 border-dashed rounded-2xl border-slate-200 dark:border-slate-800">
                        <Building2 className="h-10 w-10 text-slate-300 mb-3" />
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">No defaults configured</h3>
                        <p className="text-xs text-slate-500 mt-1">Optional — position profiles work without them.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {defaultProfiles.map(renderCard)}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </ScrollArea>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* RIGHT PANEL: Profile details preview */}
        <Panel
          ref={previewPanelRef}
          defaultSize={32}
          minSize={22}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, preview: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, preview: false }))}
          className="bg-slate-100 dark:bg-slate-900 flex flex-col z-10 border-l border-slate-200 dark:border-slate-800 !overflow-auto"
        >
          <div className="flex flex-col h-full">
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-custom-blue" />
                Profile Details
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Select a profile to view its configuration</p>
            </div>
            <div className="flex-1 overflow-auto p-3">
              {selectedProfile ? (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{selectedProfile.name}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-slate-500">Scope:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedProfile.scope}</span></div>
                      <div><span className="text-slate-500">Active:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedProfile.is_active ? 'Yes' : 'No'}</span></div>
                      {selectedProfile.department && <div><span className="text-slate-500">Department:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedProfile.department}</span></div>}
                      {selectedProfile.job_title && <div><span className="text-slate-500">Job Title:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedProfile.job_title}</span></div>}
                      {selectedProfile.employment_type && <div><span className="text-slate-500">Type:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedProfile.employment_type}</span></div>}
                      {selectedProfile.job_level && <div><span className="text-slate-500">Level:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedProfile.job_level}</span></div>}
                      {selectedProfile.work_arrangement && <div><span className="text-slate-500">Work Mode:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedProfile.work_arrangement}</span></div>}
                    </div>
                  </div>

                  {Object.keys(selectedProfile.settings || {}).length > 0 && (
                    <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Settings</p>
                      <div className="space-y-1">
                        {Object.entries(selectedProfile.settings).map(([key, value]) => (
                          <div key={key} className="flex justify-between text-xs">
                            <span className="text-slate-500 font-mono">{key}</span>
                            <span className="text-slate-700 dark:text-slate-200 font-medium">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedCompanyClauses.length > 0 && (
                    <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Clause Selections</p>
                      <div className="space-y-1.5">
                        {selectedCompanyClauses.map(({ sectionKey, sectionTitle, clauseLabel }) => (
                          <div key={sectionKey} className="flex items-start justify-between text-xs gap-2">
                            <span className="text-slate-500 shrink-0">{sectionTitle}</span>
                            <span className="text-slate-700 dark:text-slate-200 font-medium text-right">{clauseLabel}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <User className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-xs text-slate-500">Select a profile to view its settings and clause selections</p>
                </div>
              )}
            </div>
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
