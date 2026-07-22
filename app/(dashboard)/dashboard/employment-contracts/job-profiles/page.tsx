'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, PlusCircle, Settings, Trash2, Briefcase } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { fetchCompanies, Company } from '../../companies/database';
import { EcJobProfile, fetchJobProfiles, deleteJobProfile, JobProfileScope } from '../utils/jobProfileData';
import { EcClause, fetchClauses } from '../utils/clauseLibraryData';
import { JobProfileEditor } from '../components/JobProfileEditor';

export default function JobProfilesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [profiles, setProfiles] = useState<EcJobProfile[]>([]);
  const [clauses, setClauses] = useState<EcClause[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<EcJobProfile | null>(null);
  const [newScope, setNewScope] = useState<JobProfileScope>('position');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [comps, allClauses] = await Promise.all([fetchCompanies(), fetchClauses()]);
      setCompanies(comps);
      setClauses(allClauses);
      if (comps.length > 0) setCompanyId(String(comps[0].id));
    })();
  }, []);

  const loadProfiles = async (id: string) => {
    if (!id) return;
    setIsLoading(true);
    setProfiles(await fetchJobProfiles(id));
    setIsLoading(false);
  };

  useEffect(() => { if (companyId) loadProfiles(companyId); }, [companyId]);

  const positionProfiles = useMemo(() => profiles.filter((p) => p.scope === 'position'), [profiles]);
  const defaultProfiles = useMemo(() => profiles.filter((p) => p.scope !== 'position'), [profiles]);

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
      toast({ title: 'Profile deleted' });
    } else {
      toast({ title: 'Error', description: 'Could not delete - it may still be referenced by an Employment Offer.', variant: 'destructive' });
    }
  };

  const renderCard = (profile: EcJobProfile) => (
    <div
      key={profile.id}
      onClick={() => openEdit(profile)}
      className="cursor-pointer border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{profile.name}</p>
          <p className="text-xs text-slate-400 truncate">
            {[profile.department, profile.job_title, profile.employment_type].filter(Boolean).join(' • ') || 'No attributes set'}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={(e) => { e.stopPropagation(); openEdit(profile); }}>
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
        {profile.job_level && (
          <Badge variant="outline" className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 border-indigo-200 rounded-full px-2 py-0.5">{profile.job_level}</Badge>
        )}
        <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 text-slate-600 border-slate-200 rounded-full px-2 py-0.5">
          {Object.keys(profile.section_clauses || {}).length} clause overrides
        </Badge>
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-2rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Job Profiles</h1>
          <p className="text-xs text-slate-500">Reusable "job packages" - configure once, reuse for every hire in that role</p>
        </div>
        <Select value={companyId} onValueChange={setCompanyId}>
          <SelectTrigger className="h-9 w-64 shrink-0"><SelectValue placeholder="Select company..." /></SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={String(c.id)} value={String(c.id)}>{c.company_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6">
          {!companyId ? (
            <div className="flex flex-col items-center justify-center h-64 text-center text-slate-500">
              <Briefcase className="h-10 w-10 text-slate-300 mb-3" />
              Select a company to manage its job profiles.
            </div>
          ) : (
            <Tabs defaultValue="position">
              <div className="flex items-center justify-between mb-4">
                <TabsList className="bg-slate-100 dark:bg-slate-800">
                  <TabsTrigger value="position" className="text-xs">Position Profiles</TabsTrigger>
                  <TabsTrigger value="defaults" className="text-xs">Company &amp; Department Defaults</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="position">
                <div className="flex justify-end mb-3">
                  <Button size="sm" className="h-8 text-xs" onClick={() => openNew('position')}>
                    <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> New Position Profile
                  </Button>
                </div>
                {isLoading ? (
                  <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : positionProfiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-center border-2 border-dashed rounded-2xl border-slate-200 dark:border-slate-800 text-slate-400 text-sm">
                    No position profiles yet for this company.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {positionProfiles.map(renderCard)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="defaults">
                <div className="flex justify-end gap-2 mb-3">
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openNew('department')}>
                    <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> New Department Defaults
                  </Button>
                  <Button size="sm" className="h-8 text-xs" onClick={() => openNew('company')}>
                    <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> New Company Defaults
                  </Button>
                </div>
                {isLoading ? (
                  <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : defaultProfiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-center border-2 border-dashed rounded-2xl border-slate-200 dark:border-slate-800 text-slate-400 text-sm">
                    No company or department defaults configured - optional, position profiles work fine without them.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {defaultProfiles.map(renderCard)}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </ScrollArea>

      {companyId && (
        <JobProfileEditor
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          companyId={companyId}
          clauses={clauses}
          profile={editingProfile}
          defaultScope={newScope}
          onSaved={() => loadProfiles(companyId)}
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
