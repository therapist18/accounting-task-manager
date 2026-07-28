'use client';

import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Sparkles, Briefcase, Settings2, FileText, CheckCircle2, ChevronRight, FileSignature } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { CONTRACT_SECTIONS } from '../utils/contractStructure';
import { suggestClauseForSection } from '../utils/clauseEngine';
import { EcClause } from '../utils/clauseLibraryData';
import { EcJobProfile, JobProfileScope, createJobProfile, updateJobProfile } from '../utils/jobProfileData';
import { EMPLOYMENT_TYPE_OPTIONS, WORK_ARRANGEMENT_OPTIONS, withCurrentValue } from '../utils/profileOptions';

interface JobProfileEditorProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  clauses: EcClause[];
  profile: EcJobProfile | null;
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

function StringListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            className="h-9 text-xs bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
            placeholder={placeholder}
            value={item}
            onChange={(e) => onChange(items.map((it, ii) => (ii === i ? e.target.value : it)))}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-slate-400 hover:text-red-600 shrink-0"
            onClick={() => onChange(items.filter((_, ii) => ii !== i))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => onChange([...items, ''])}>
        <Plus className="h-3.5 w-3.5 mr-1.5" /> Add
      </Button>
    </div>
  );
}

export function JobProfileEditor({ open, onClose, companyId, clauses, profile, defaultScope, onSaved }: JobProfileEditorProps) {
  const [scope, setScope] = useState<JobProfileScope>(defaultScope);
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [jobLevel, setJobLevel] = useState('');
  const [workArrangement, setWorkArrangement] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [requirements, setRequirements] = useState<string[]>([]);
  const [keyResponsibilities, setKeyResponsibilities] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [settingsRows, setSettingsRows] = useState<{ key: string; value: string }[]>([]);
  const [sectionClauses, setSectionClauses] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

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
      setJobDescription(profile.job_description || '');
      setRequirements(profile.requirements?.length ? profile.requirements : []);
      setKeyResponsibilities(profile.key_responsibilities?.length ? profile.key_responsibilities : []);
      setIsActive(profile.is_active);
      setSettingsRows(Object.entries(profile.settings || {}).map(([key, value]) => ({ key, value: String(value) })));
      setSectionClauses(profile.section_clauses || {});
      setActiveTab('details');
    } else {
      setScope(defaultScope);
      setName('');
      setDepartment('');
      setJobTitle('');
      setEmploymentType('');
      setJobLevel('');
      setWorkArrangement('');
      setJobDescription('');
      setRequirements([]);
      setKeyResponsibilities([]);
      setIsActive(true);
      setSettingsRows([]);
      setSectionClauses({});
      setActiveTab('details');
    }
  }, [open, profile, defaultScope]);

  useEffect(() => {
    if (profile || scope !== 'position') return;
    const facts = { employment_type: employmentType, job_level: jobLevel, work_arrangement: workArrangement, department };
    setSectionClauses((prev) => {
      const next = { ...prev };
      for (const section of CONTRACT_SECTIONS) {
        if (next[section.key]) continue;
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
      setActiveTab('details');
      return;
    }
    if (scope === 'department' && !department.trim()) {
      toast({ title: 'Department required for a department-scope profile', variant: 'destructive' });
      setActiveTab('details');
      return;
    }

    setSaving(true);
    const settings = Object.fromEntries(settingsRows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value]));
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
      job_description: scope === 'position' ? (jobDescription.trim() || null) : null,
      requirements: scope === 'position' ? requirements.filter((r) => r.trim()) : [],
      key_responsibilities: scope === 'position' ? keyResponsibilities.filter((r) => r.trim()) : [],
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

  const getScopeBadge = () => {
    switch(scope) {
      case 'company': return <Badge variant="secondary" className="bg-slate-100 text-slate-700">Company Wide</Badge>;
      case 'department': return <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">Department Level</Badge>;
      case 'position': return <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">Specific Position</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col rounded-2xl p-0 overflow-hidden shadow-2xl border-slate-200/60 dark:border-slate-800/60">
        <DialogHeader className="shrink-0 bg-white dark:bg-slate-900 px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800/60 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 via-transparent to-purple-50/50 dark:from-blue-900/10 dark:to-purple-900/10 pointer-events-none" />
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <Briefcase className="w-5 h-5 text-custom-blue" />
                {profile ? 'Edit Job Profile' : 'Create Job Profile'}
              </DialogTitle>
              <DialogDescription className="text-slate-500 mt-1.5 max-w-xl">
                {scope === 'company' && 'Establish company-wide default settings and clauses for all contracts.'}
                {scope === 'department' && 'Set default contract terms that apply to all roles within a specific department.'}
                {scope === 'position' && 'Configure exact contract clauses, terms, and conditions for a specific role.'}
              </DialogDescription>
            </div>
            <div className="shrink-0">
              {getScopeBadge()}
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
            <TabsList className="bg-transparent h-12 w-full justify-start gap-6 p-0 border-none">
              <TabsTrigger 
                value="details" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-custom-blue data-[state=active]:text-custom-blue rounded-none px-0 font-medium text-sm text-slate-500 h-full transition-colors"
              >
                <Briefcase className="w-4 h-4 mr-2" />
                Basic Details
              </TabsTrigger>
              {scope === 'position' && (
                <TabsTrigger 
                  value="clauses" 
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-custom-blue data-[state=active]:text-custom-blue rounded-none px-0 font-medium text-sm text-slate-500 h-full transition-colors"
                >
                  <FileSignature className="w-4 h-4 mr-2" />
                  Clauses & Sections
                  {Object.keys(sectionClauses).length > 0 && (
                    <Badge variant="secondary" className="ml-2 bg-blue-100 text-blue-700 hover:bg-blue-100 px-1.5 py-0 text-[10px]">
                      {Object.keys(sectionClauses).length}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
              <TabsTrigger 
                value="settings" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-custom-blue data-[state=active]:text-custom-blue rounded-none px-0 font-medium text-sm text-slate-500 h-full transition-colors"
              >
                <Settings2 className="w-4 h-4 mr-2" />
                Settings & Variables
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 bg-slate-50/50 dark:bg-slate-950/50 px-6 py-6">
            <div className="max-w-4xl mx-auto space-y-6 pb-4">
              
              <TabsContent value="details" className="m-0 space-y-6">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">Identity & Scope</h3>
                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-600">Profile Scope</Label>
                      <Select value={scope} onValueChange={(v) => setScope(v as JobProfileScope)} disabled={!!profile}>
                        <SelectTrigger className="h-10 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="company">Company Defaults</SelectItem>
                          <SelectItem value="department">Department Defaults</SelectItem>
                          <SelectItem value="position">Position Profile</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-slate-400">Determines where these settings apply in the hierarchy.</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-600">Profile Name <span className="text-red-500">*</span></Label>
                      <Input
                        className="h-10 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                        placeholder={scope === 'company' ? 'Company Defaults' : scope === 'department' ? 'Finance Department Defaults' : 'Senior Accountant'}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {scope !== 'company' && (
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">Categorization</h3>
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-slate-600">Department {scope === 'department' && <span className="text-red-500">*</span>}</Label>
                        <Input className="h-10 bg-slate-50 dark:bg-slate-950" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Finance" />
                      </div>
                      {scope === 'position' && (
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-slate-600">Job Title</Label>
                          <Input className="h-10 bg-slate-50 dark:bg-slate-950" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Accountant" />
                        </div>
                      )}
                    </div>

                    {scope === 'position' && (
                      <div className="grid grid-cols-3 gap-5">
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-slate-600">Employment Type</Label>
                          <Select value={employmentType || '__unset__'} onValueChange={(v) => setEmploymentType(v === '__unset__' ? '' : v)}>
                            <SelectTrigger className="h-10 bg-slate-50 dark:bg-slate-950"><SelectValue placeholder="Select type" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__unset__" className="text-slate-400 italic">Not set</SelectItem>
                              {withCurrentValue(EMPLOYMENT_TYPE_OPTIONS, employmentType).map((opt) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-slate-600">Job Level</Label>
                          <Input className="h-10 bg-slate-50 dark:bg-slate-950" value={jobLevel} onChange={(e) => setJobLevel(e.target.value)} placeholder="JG3" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-slate-600">Work Arrangement</Label>
                          <Select value={workArrangement || '__unset__'} onValueChange={(v) => setWorkArrangement(v === '__unset__' ? '' : v)}>
                            <SelectTrigger className="h-10 bg-slate-50 dark:bg-slate-950"><SelectValue placeholder="Select arrangement" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__unset__" className="text-slate-400 italic">Not set</SelectItem>
                              {withCurrentValue(WORK_ARRANGEMENT_OPTIONS, workArrangement).map((opt) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {scope === 'position' && (
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">Job Content</h3>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-600">Job Description</Label>
                      <Textarea
                        className="min-h-[100px] text-xs bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                        placeholder="A short summary of what this role does..."
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-slate-600">Key Responsibilities</Label>
                        <StringListEditor items={keyResponsibilities} onChange={setKeyResponsibilities} placeholder="e.g. Maintain accurate financial records" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-slate-600">Requirements</Label>
                        <StringListEditor items={requirements} onChange={setRequirements} placeholder="e.g. Bachelor's degree in Accounting" />
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-bold text-slate-800 dark:text-slate-100">Profile Status</Label>
                    <p className="text-xs text-slate-500 mt-0.5">When active, this profile can be selected when creating new contracts.</p>
                  </div>
                  <Switch checked={isActive} onCheckedChange={setIsActive} className="data-[state=checked]:bg-custom-blue" />
                </div>
              </TabsContent>

              {scope === 'position' && (
                <TabsContent value="clauses" className="m-0 space-y-4">
                  <div className="flex items-start justify-between bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                    <div>
                      <h3 className="text-sm font-bold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        Smart Clause Selection
                      </h3>
                      <p className="text-xs text-blue-700/80 dark:text-blue-300/80 mt-1 max-w-xl">
                        Select which specific clauses apply to this role. Some clauses may have been pre-filled based on the department, level, and employment type you provided. Leave as "Use Section Default" to inherit from department or company defaults.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {CONTRACT_SECTIONS.map((section) => {
                      const allOptions = clauses.filter((c) => c.section_key === section.key);
                      if (allOptions.length === 0) return null; // Only show sections that have clause variants

                      // Ungrouped clauses stand alone (default first, then A-Z);
                      // clauses sharing a variant_group are alternatives of one
                      // component (e.g. Office Hours vs Shift Hours) and are
                      // listed together under that group's label instead of
                      // scattered through the flat list.
                      const byDefaultThenLabel = (a: EcClause, b: EcClause) =>
                        (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || a.label.localeCompare(b.label);
                      const ungrouped = allOptions.filter((c) => !c.variant_group).sort(byDefaultThenLabel);
                      const optionGroups = new Map<string, EcClause[]>();
                      for (const c of allOptions) {
                        if (c.variant_group) {
                          if (!optionGroups.has(c.variant_group)) optionGroups.set(c.variant_group, []);
                          optionGroups.get(c.variant_group)!.push(c);
                        }
                      }
                      for (const group of optionGroups.values()) group.sort(byDefaultThenLabel);

                      const selectedClauseId = sectionClauses[section.key];
                      const selectedClause = allOptions.find(c => c.id === selectedClauseId);
                      const isOverridden = !!selectedClauseId && selectedClauseId !== '__none__';

                      return (
                        <div key={section.key} className={cn(
                          "bg-white dark:bg-slate-900 p-4 rounded-xl border shadow-sm transition-colors",
                          isOverridden ? "border-blue-200 dark:border-blue-800/50" : "border-slate-200 dark:border-slate-800"
                        )}>
                          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <FileText className={cn("w-4 h-4", isOverridden ? "text-custom-blue" : "text-slate-400")} />
                                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{section.title}</h4>
                                {isOverridden && (
                                  <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200 py-0 h-5">Custom Selected</Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mb-3">{section.description || `Select the appropriate clause variant for ${section.title.toLowerCase()}.`}</p>

                              {selectedClause && (
                                <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                    {selectedClause.label}
                                  </p>
                                  <div
                                    className="prose prose-xs max-w-none text-[11px] text-slate-500 leading-relaxed max-h-32 overflow-y-auto [&_strong]:text-slate-700 [&_strong]:dark:text-slate-200 [&_p]:mb-1.5 last:[&_p]:mb-0"
                                    dangerouslySetInnerHTML={{ __html: selectedClause.content || '<p>No content added yet.</p>' }}
                                  />
                                </div>
                              )}
                            </div>
                            <div className="w-full md:w-72 shrink-0">
                              <Select
                                value={sectionClauses[section.key] || '__none__'}
                                onValueChange={(v) => setSectionClauses({ ...sectionClauses, [section.key]: v === '__none__' ? '' : v })}
                              >
                                <SelectTrigger className={cn("h-10 text-xs w-full", isOverridden && "border-blue-200 bg-blue-50/30 dark:bg-blue-900/10")}>
                                  <SelectValue placeholder="Use section default" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__" className="text-slate-500 italic">Use section default</SelectItem>
                                  {ungrouped.map((c) => (
                                    <SelectItem key={c.id} value={c.id} className="text-xs">
                                      {c.label} {c.is_default && <span className="text-[10px] text-slate-400 ml-1">(Default)</span>}
                                    </SelectItem>
                                  ))}
                                  {Array.from(optionGroups.entries()).map(([group, items]) => (
                                    <SelectGroup key={group}>
                                      <SelectLabel>{group}</SelectLabel>
                                      {items.map((c) => (
                                        <SelectItem key={c.id} value={c.id} className="text-xs">
                                          {c.label} {c.is_default && <span className="text-[10px] text-slate-400 ml-1">(Default)</span>}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              )}

              <TabsContent value="settings" className="m-0 space-y-5">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-custom-blue" />
                        Contract Variables
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">Define numeric values, durations, and specific terms that populate the clauses.</p>
                    </div>
                    <Button size="sm" onClick={() => setSettingsRows([...settingsRows, { key: '', value: '' }])} className="h-8 shadow-sm">
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Variable
                    </Button>
                  </div>
                  
                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-lg p-3 mb-5">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Common Variable Keys to Use:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {COMMON_SETTINGS_HINTS.map(hint => (
                        <Badge key={hint} variant="outline" className="bg-white dark:bg-slate-900 text-[10px] text-slate-500 cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition-colors"
                          onClick={() => {
                            if (!settingsRows.some(r => r.key === hint)) {
                              setSettingsRows([...settingsRows, { key: hint, value: '' }]);
                            }
                          }}
                        >
                          {hint}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {settingsRows.length === 0 ? (
                      <div className="text-center py-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                        <Settings2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No variables added</p>
                        <p className="text-xs text-slate-400 mt-1">Click common keys above or add custom ones.</p>
                      </div>
                    ) : (
                      settingsRows.map((row, i) => (
                        <div key={i} className="flex gap-3 items-center group">
                          <div className="flex-1 space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold pl-1">Key</Label>
                            <Input
                              className="h-10 text-xs font-mono bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                              placeholder="e.g. notice_period"
                              value={row.key}
                              onChange={(e) => setSettingsRows(settingsRows.map((r, ri) => ri === i ? { ...r, key: e.target.value } : r))}
                            />
                          </div>
                          <div className="flex-[2] space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold pl-1">Value</Label>
                            <Input
                              className="h-10 text-xs bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                              placeholder="e.g. 1 month"
                              value={row.value}
                              onChange={(e) => setSettingsRows(settingsRows.map((r, ri) => ri === i ? { ...r, value: e.target.value } : r))}
                            />
                          </div>
                          <div className="pt-6 shrink-0">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-10 w-10 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity" 
                              onClick={() => setSettingsRows(settingsRows.filter((_, ri) => ri !== i))}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>

            </div>
          </ScrollArea>
        </Tabs>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex items-center justify-between">
          <Button variant="ghost" onClick={onClose} className="text-slate-500">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="shadow-md shadow-blue-500/10 min-w-[120px]">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {profile ? 'Save Changes' : 'Create Profile'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
