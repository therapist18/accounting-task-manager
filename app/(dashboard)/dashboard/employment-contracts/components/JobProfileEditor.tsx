'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Plus, Trash2, Sparkles } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { CONTRACT_SECTIONS } from '../utils/contractStructure';
import { suggestClauseForSection } from '../utils/clauseEngine';
import { EcClause } from '../utils/clauseLibraryData';
import { EcJobProfile, JobProfileScope, createJobProfile, updateJobProfile } from '../utils/jobProfileData';

interface JobProfileEditorProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  clauses: EcClause[];
  profile: EcJobProfile | null; // null = creating new
  defaultScope: JobProfileScope;
  onSaved: () => void;
}

const COMMON_SETTINGS_HINTS = [
  'notice_period', 'probation_period', 'probation_notice',
  'working_days', 'working_hours', 'start_time', 'end_time', 'break_duration', 'rest_days', 'work_mode',
  'reports_to', 'work_location', 'job_level',
  'medical_cover', 'housing_allowance', 'transport_allowance', 'telephone_allowance', 'meal_allowance', 'pension_scheme',
  'annual_leave_days', 'sick_leave_days', 'maternity_leave_days', 'paternity_leave_days',
  'payment_frequency', 'payment_day',
  'salary_structure',
];

export function JobProfileEditor({ open, onClose, companyId, clauses, profile, defaultScope, onSaved }: JobProfileEditorProps) {
  const [scope, setScope] = useState<JobProfileScope>(defaultScope);
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [jobLevel, setJobLevel] = useState('');
  const [workArrangement, setWorkArrangement] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [settingsRows, setSettingsRows] = useState<{ key: string; value: string }[]>([]);
  const [sectionClauses, setSectionClauses] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (profile) {
      setScope(profile.scope);
      setName(profile.name);
      setDepartment(profile.department || '');
      setJobTitle(profile.job_title || '');
      setEmploymentType(profile.employment_type || '');
      setJobLevel(profile.job_level || '');
      setWorkArrangement(profile.work_arrangement || '');
      setIsActive(profile.is_active);
      setSettingsRows(Object.entries(profile.settings || {}).map(([key, value]) => ({ key, value: String(value) })));
      setSectionClauses(profile.section_clauses || {});
    } else {
      setScope(defaultScope);
      setName('');
      setDepartment('');
      setJobTitle('');
      setEmploymentType('');
      setJobLevel('');
      setWorkArrangement('');
      setIsActive(true);
      setSettingsRows([]);
      // Pre-fill suggested clauses from the library's suggest_conditions,
      // matched against the attributes about to be entered. Re-runs below
      // whenever those attributes change, but only for new profiles - never
      // silently overwrite an existing profile's explicit picks.
      setSectionClauses({});
    }
  }, [open, profile, defaultScope]);

  // Re-suggest clauses as the position attributes are filled in, for new
  // position-scope profiles only.
  useEffect(() => {
    if (profile || scope !== 'position') return;
    const facts = { employment_type: employmentType, job_level: jobLevel, work_arrangement: workArrangement, department };
    setSectionClauses((prev) => {
      const next = { ...prev };
      for (const section of CONTRACT_SECTIONS) {
        if (next[section.key]) continue; // don't clobber a manual pick
        const suggestion = suggestClauseForSection(clauses, section.key, facts);
        if (suggestion) next[section.key] = suggestion.id;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employmentType, jobLevel, workArrangement, department, scope, profile]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    if (scope === 'department' && !department.trim()) {
      toast({ title: 'Department required for a department-scope profile', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const settings = Object.fromEntries(settingsRows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value]));
    // Drop "Use section default" entries (stored as '' by the picker below)
    // rather than persisting a dead key - see resolveEffectiveClauses in
    // utils/clauseEngine.ts for why an explicit '' is dangerous to keep.
    const cleanSectionClauses = Object.fromEntries(Object.entries(sectionClauses).filter(([, v]) => !!v));
    const payload: Partial<EcJobProfile> = {
      scope,
      company_id: companyId,
      name: name.trim(),
      department: scope === 'company' ? null : (department.trim() || null),
      job_title: scope === 'position' ? (jobTitle.trim() || null) : null,
      employment_type: scope === 'position' ? (employmentType.trim() || null) : null,
      job_level: scope === 'position' ? (jobLevel.trim() || null) : null,
      work_arrangement: scope === 'position' ? (workArrangement.trim() || null) : null,
      settings,
      section_clauses: scope === 'position' ? cleanSectionClauses : {},
      is_active: isActive,
    };

    try {
      if (profile) {
        await updateJobProfile(profile.id, payload);
        toast({ title: 'Profile updated' });
      } else {
        await createJobProfile(payload);
        toast({ title: 'Profile created' });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save profile', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col rounded-2xl p-0">
        <DialogHeader className="sticky top-0 z-10 bg-white dark:bg-slate-900 px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800 rounded-t-2xl">
          <DialogTitle className="text-base font-bold">
            {profile ? 'Edit Profile' : 'New Profile'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto px-6 py-4">
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Scope</Label>
                <Select value={scope} onValueChange={(v) => setScope(v as JobProfileScope)} disabled={!!profile}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Company Defaults</SelectItem>
                    <SelectItem value="department">Department Defaults</SelectItem>
                    <SelectItem value="position">Position Profile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input
                  className="h-9"
                  placeholder={scope === 'company' ? 'Company Defaults' : scope === 'department' ? 'Finance Department Defaults' : 'Accountant - Permanent - Finance'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            {scope !== 'company' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Department</Label>
                  <Input className="h-9" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Finance" />
                </div>
                {scope === 'position' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Job Title</Label>
                    <Input className="h-9" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Accountant" />
                  </div>
                )}
              </div>
            )}

            {scope === 'position' && (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Employment Type</Label>
                  <Input className="h-9" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} placeholder="Permanent" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Job Level</Label>
                  <Input className="h-9" value={jobLevel} onChange={(e) => setJobLevel(e.target.value)} placeholder="JG3" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Work Arrangement</Label>
                  <Input className="h-9" value={workArrangement} onChange={(e) => setWorkArrangement(e.target.value)} placeholder="Office" />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border border-slate-200 dark:border-slate-800 rounded-lg px-3 h-9">
              <Label className="text-xs">Active (selectable when matching employees)</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-600">Settings</Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSettingsRows([...settingsRows, { key: '', value: '' }])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </div>
              <p className="text-[11px] text-slate-400">Common keys: {COMMON_SETTINGS_HINTS.join(', ')}</p>
              <div className="space-y-2">
                {settingsRows.map((row, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      className="h-8 text-xs flex-1"
                      placeholder="key (e.g. notice_period)"
                      value={row.key}
                      onChange={(e) => setSettingsRows(settingsRows.map((r, ri) => ri === i ? { ...r, key: e.target.value } : r))}
                    />
                    <Input
                      className="h-8 text-xs flex-[2]"
                      placeholder="value (e.g. 1 month)"
                      value={row.value}
                      onChange={(e) => setSettingsRows(settingsRows.map((r, ri) => ri === i ? { ...r, value: e.target.value } : r))}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600 shrink-0" onClick={() => setSettingsRows(settingsRows.filter((_, ri) => ri !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {scope === 'position' && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-600">Clause selection per section</Label>
                <div className="space-y-1.5">
                  {CONTRACT_SECTIONS.map((section) => {
                    const options = clauses.filter((c) => c.section_key === section.key);
                    return (
                      <div key={section.key} className="grid grid-cols-[minmax(140px,40%)_1fr] gap-3 items-center">
                        <span className="text-xs text-slate-600 dark:text-slate-400 truncate">{section.title}</span>
                        <Select
                          value={sectionClauses[section.key] || '__none__'}
                          onValueChange={(v) => setSectionClauses({ ...sectionClauses, [section.key]: v === '__none__' ? '' : v })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Use section default" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Use section default</SelectItem>
                            {options.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.label}{c.is_default ? ' (default)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Pre-filled from the Clause Library's suggestion rules where a match was found - review before saving.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="px-6 pb-6 pt-2 border-t border-slate-200 dark:border-slate-800">
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {profile ? 'Save changes' : 'Create profile'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
