'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2, PlusCircle, Settings, Trash2, Briefcase, BookText,
  Search, User, Pencil,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { fetchCompanies, Company } from '../../companies/database';
import { EcJobProfile, fetchJobProfiles, deleteJobProfile, JobProfileScope } from '../utils/jobProfileData';
import { EcClause, fetchClauses } from '../utils/clauseLibraryData';
import { JobProfileEditor } from '../components/JobProfileEditor';
import { CONTRACT_SECTIONS } from '../utils/contractStructure';

// Purely a display grouping over the free-form settings bag - no schema
// backing, just makes a flat key/value list scan like the mockup's
// dedicated Compensation/Working Hours/etc tabs would.
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
    return Object.entries(selectedProfile.section_clauses || {}).map(([sectionKey, clauseId]) => {
      const section = CONTRACT_SECTIONS.find((s) => s.key === sectionKey);
      const clause = clauses.find((c) => c.id === clauseId);
      return { sectionKey, sectionTitle: section?.title || sectionKey, clauseLabel: clause?.label || 'Unknown' };
    });
  }, [selectedProfile, clauses]);

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
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 shrink-0">Job Profiles</h1>
          <Select value={selectedCompanyId} onValueChange={(v) => { setSelectedCompanyId(v); setSelectedProfileId(null); }}>
            <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Select company..." /></SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={String(c.id)} value={String(c.id)}>{c.company_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link href="/dashboard/employment-contracts" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">Contracts</Link>
          <Link href="/dashboard/employment-contracts/clause-library" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><BookText className="w-3.5 h-3.5" /> Clauses</Link>
          <Link href="/dashboard/employment-contracts/templates" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><Settings className="w-3.5 h-3.5" /> Templates</Link>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Profile list */}
        <div className="w-72 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 shrink-0 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search profiles..."
                className="pl-9 h-9 text-sm bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-[11px] flex-1" onClick={() => openNew('company')} disabled={!selectedCompanyId}>Company</Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px] flex-1" onClick={() => openNew('department')} disabled={!selectedCompanyId}>Dept</Button>
              <Button size="sm" className="h-7 text-[11px] flex-1" onClick={() => openNew('position')} disabled={!selectedCompanyId}>
                <PlusCircle className="h-3 w-3 mr-1" /> Profile
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filteredProfiles.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">No profiles yet.</div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredProfiles.map((profile) => {
                  const isSelected = selectedProfileId === profile.id;
                  return (
                    <div
                      key={profile.id}
                      onClick={() => setSelectedProfileId(profile.id)}
                      className={cn(
                        "flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors",
                        isSelected ? "bg-custom-blue text-white shadow-sm" : "hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-md flex items-center justify-center shrink-0",
                        isSelected ? "bg-white/20" : "bg-blue-50 dark:bg-blue-900/30"
                      )}>
                        <Briefcase className={cn("w-4 h-4", isSelected ? "text-white" : "text-custom-blue")} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">{profile.name}</p>
                        <p className={cn("text-[11px] truncate", isSelected ? "text-blue-100" : "text-slate-400")}>
                          {profile.department || scopeLabel(profile.scope)}
                          {!profile.is_active && ' · Inactive'}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-semibold rounded-full px-1.5 py-0 shrink-0 tabular-nums",
                          isSelected ? "bg-white/20 text-white border-white/30" : "bg-slate-50 text-slate-500 border-slate-200"
                        )}
                      >
                        {Object.keys(profile.section_clauses || {}).length}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* RIGHT: Detail panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedProfile ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <User className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">Select a profile to view its details</p>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{selectedProfile.name}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {[selectedProfile.department, selectedProfile.job_level && `Job Level: ${selectedProfile.job_level}`, selectedProfile.employment_type && `Employment Type: ${selectedProfile.employment_type}`].filter(Boolean).join(' • ') || scopeLabel(selectedProfile.scope)}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openEdit(selectedProfile)}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Profile
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-red-600" onClick={() => setDeletingId(selectedProfile.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4">
                  <Tabs defaultValue="overview">
                    <TabsList className="bg-slate-100 dark:bg-slate-800 mb-4">
                      <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                      <TabsTrigger value="settings" className="text-xs">Settings</TabsTrigger>
                      <TabsTrigger value="clauses" className="text-xs">Linked Clauses ({clauseSelections.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-3">
                      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-3">Profile Information</p>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div><span className="text-slate-500">Scope:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{scopeLabel(selectedProfile.scope)}</span></div>
                          <div><span className="text-slate-500">Active:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedProfile.is_active ? 'Yes' : 'No'}</span></div>
                          {selectedProfile.department && <div><span className="text-slate-500">Department:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedProfile.department}</span></div>}
                          {selectedProfile.job_title && <div><span className="text-slate-500">Job Title:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedProfile.job_title}</span></div>}
                          {selectedProfile.employment_type && <div><span className="text-slate-500">Employment Type:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedProfile.employment_type}</span></div>}
                          {selectedProfile.job_level && <div><span className="text-slate-500">Job Level:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedProfile.job_level}</span></div>}
                          {selectedProfile.work_arrangement && <div><span className="text-slate-500">Work Mode:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{selectedProfile.work_arrangement}</span></div>}
                          <div><span className="text-slate-500">Last Updated:</span> <span className="font-medium text-slate-700 dark:text-slate-200">{new Date(selectedProfile.updated_at).toLocaleDateString()}</span></div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="settings" className="space-y-3">
                      {settingsGroups.length === 0 ? (
                        <div className="text-xs text-slate-400 italic border border-dashed rounded-xl p-4 border-slate-200 dark:border-slate-800">No settings configured.</div>
                      ) : (
                        settingsGroups.map((group) => (
                          <div key={group.label} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">{group.label}</p>
                            <div className="space-y-1">
                              {group.items.map(([key, value]) => (
                                <div key={key} className="flex justify-between text-xs gap-3">
                                  <span className="text-slate-500 font-mono truncate">{key}</span>
                                  <span className="text-slate-700 dark:text-slate-200 font-medium text-right">{String(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </TabsContent>

                    <TabsContent value="clauses" className="space-y-3">
                      {clauseSelections.length === 0 ? (
                        <div className="text-xs text-slate-400 italic border border-dashed rounded-xl p-4 border-slate-200 dark:border-slate-800">
                          No clause overrides - every section uses its section default.
                        </div>
                      ) : (
                        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                          <div className="space-y-2">
                            {clauseSelections.map(({ sectionKey, sectionTitle, clauseLabel }) => (
                              <div key={sectionKey} className="flex items-center justify-between text-xs gap-3 py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                <span className="text-slate-500 shrink-0">{sectionTitle}</span>
                                <Badge variant="outline" className="text-[10px] font-semibold bg-blue-50 text-blue-700 border-blue-200 rounded-full px-2 py-0.5 truncate max-w-[60%]">
                                  {clauseLabel}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </div>

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
