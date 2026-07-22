import { useEffect, useState } from 'react';
import { fetchCompanyEmployees, ContractEmployeeInfo } from '../utils/data';
import { EcJobProfile, fetchJobProfiles, matchJobProfile } from '../utils/jobProfileData';
import { EmploymentOffer, fetchLatestOffer } from '../utils/employmentOfferData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, RefreshCw, Settings2, UserRound, Briefcase, Plus, Trash2 } from 'lucide-react';

interface ContractEditorProps {
  companyId: string | null;
  employeeId: string | null;
  contractData: any;
  setContractData: (data: any) => void;
  selectedJobProfile: EcJobProfile | null;
  setSelectedJobProfile: (profile: EcJobProfile | null) => void;
  onRefreshPreview: () => void;
}

export function ContractEditor({
  companyId,
  employeeId,
  contractData,
  setContractData,
  selectedJobProfile,
  setSelectedJobProfile,
  onRefreshPreview
}: ContractEditorProps) {
  const [employee, setEmployee] = useState<ContractEmployeeInfo | null>(null);
  const [profiles, setProfiles] = useState<EcJobProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [settingsRows, setSettingsRows] = useState<{ key: string; value: string }[]>([]);

  const offer: Partial<EmploymentOffer> = contractData.offer || {};
  const updateOffer = (patch: Partial<EmploymentOffer>) => {
    setContractData((prev: any) => ({ ...prev, offer: { ...(prev.offer || {}), ...patch } }));
  };

  useEffect(() => {
    async function loadData() {
      if (!companyId || !employeeId) {
        setEmployee(null);
        return;
      }
      setLoading(true);

      const [emps, jobProfiles] = await Promise.all([
        fetchCompanyEmployees(companyId),
        fetchJobProfiles(companyId),
      ]);
      const target = emps.find(e => String(e.individualId) === employeeId) || null;
      setEmployee(target);
      setProfiles(jobProfiles);

      const matched = target ? matchJobProfile(jobProfiles, target) : null;
      setSelectedJobProfile(matched);

      const individualId = target ? target.individualId : Number(employeeId);
      const existingOffer = target ? await fetchLatestOffer(companyId, individualId) : null;

      const nextOffer: Partial<EmploymentOffer> = existingOffer || {
        job_profile_id: matched?.id,
        company_id: String(companyId),
        individual_id: individualId,
        basic_salary: target?.basicSalary || null,
        currency: 'KES',
        allowances: [],
        start_date: target?.startDate || new Date().toISOString().split('T')[0],
        end_date: null,
        settings_overrides: {},
        section_clauses_overrides: {},
        status: 'draft',
      };

      setSettingsRows(Object.entries(nextOffer.settings_overrides || {}).map(([key, value]) => ({ key, value: String(value) })));
      setContractData((prev: any) => ({ ...prev, employee: target, offer: nextOffer }));

      setLoading(false);
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, employeeId]);

  // Keep the offer's job_profile_id in sync when the profile is switched manually.
  const handleProfileChange = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId) || null;
    setSelectedJobProfile(profile);
    updateOffer({ job_profile_id: profile?.id });
  };

  const commitSettingsRows = (rows: { key: string; value: string }[]) => {
    setSettingsRows(rows);
    updateOffer({ settings_overrides: Object.fromEntries(rows.filter(r => r.key.trim()).map(r => [r.key.trim(), r.value])) });
  };

  if (!companyId || !employeeId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-white dark:bg-slate-900">
        <UserRound className="w-16 h-16 mb-4 text-slate-200 dark:text-slate-700" />
        <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">No Employee Selected</h3>
        <p className="text-sm">Select an employee from the sidebar to begin generating a contract.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-white dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-custom-blue" />
        <p className="text-sm">Loading context...</p>
      </div>
    );
  }

  const positionProfiles = profiles.filter(p => p.scope === 'position');

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950 relative overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-md border border-blue-100 dark:border-blue-800/50">
              <Settings2 className="w-4 h-4 text-custom-blue" />
            </div>
            Contract Configuration
          </h2>
          <p className="text-sm text-slate-500 mt-1">Configure parameters and details for <span className="font-medium text-slate-700 dark:text-slate-300">{employee?.fullName}</span></p>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="mx-auto space-y-6 pb-20">

          {/* Employee Context Card */}
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
            <div className="flex items-center gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shrink-0">
                <UserRound className="w-6 h-6 text-slate-500 dark:text-slate-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">{employee?.fullName}</h3>
                <p className="text-sm text-slate-500 mt-0.5">{employee?.jobTitle || 'No position'} • {employee?.department || 'No department'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div className="space-y-1">
                <span className="text-xs text-slate-500 font-medium">Employee ID</span>
                <p className="font-medium text-slate-800 dark:text-slate-200">{employee?.employeeNumber || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-500 font-medium">Registry Salary</span>
                <p className="font-medium text-slate-800 dark:text-slate-200">KES {employee?.basicSalary?.toLocaleString() || 0}</p>
              </div>
            </div>
          </div>

          {/* Job Profile Card */}
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Briefcase className="w-4 h-4 text-custom-blue" /> Job Profile
            </h3>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                {positionProfiles.length === 0 ? 'No profiles configured for this company yet' : 'Reusable job package this hire draws from'}
              </Label>
              <Select value={selectedJobProfile?.id || ''} onValueChange={handleProfileChange}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-950/50 h-9 border-slate-200 dark:border-slate-800">
                  <SelectValue placeholder="Select a job profile..." />
                </SelectTrigger>
                <SelectContent>
                  {positionProfiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedJobProfile && positionProfiles.length > 0 && (
                <p className="text-xs text-amber-600">No profile auto-matched this employee's department/job title/employment type - pick one manually.</p>
              )}
            </div>
          </div>

          {/* Offer Card */}
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Settings2 className="w-4 h-4 text-custom-blue" /> Employment Offer
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              <div className="space-y-2 md:col-span-4">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Basic Salary</Label>
                <Input
                  type="number"
                  className="h-9 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800"
                  value={offer.basic_salary ?? ''}
                  onChange={(e) => updateOffer({ basic_salary: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Currency</Label>
                <Input
                  className="h-9 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800"
                  value={offer.currency ?? 'KES'}
                  onChange={(e) => updateOffer({ currency: e.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Start Date</Label>
                <Input
                  type="date"
                  className="h-9 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800"
                  value={offer.start_date || ''}
                  onChange={(e) => updateOffer({ start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">End Date</Label>
                <Input
                  type="date"
                  className="h-9 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800"
                  value={offer.end_date || ''}
                  onChange={(e) => updateOffer({ end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Negotiated overrides <span className="text-slate-400 font-normal">(only what differs from the Job Profile - e.g. a better medical cover)</span>
                </Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => commitSettingsRows([...settingsRows, { key: '', value: '' }])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </div>
              <div className="space-y-2">
                {settingsRows.map((row, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      className="h-8 text-xs flex-1"
                      placeholder="key (e.g. medical_cover)"
                      value={row.key}
                      onChange={(e) => commitSettingsRows(settingsRows.map((r, ri) => ri === i ? { ...r, key: e.target.value } : r))}
                    />
                    <Input
                      className="h-8 text-xs flex-[2]"
                      placeholder="value (e.g. Medical Cover B)"
                      value={row.value}
                      onChange={(e) => commitSettingsRows(settingsRows.map((r, ri) => ri === i ? { ...r, value: e.target.value } : r))}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600 shrink-0" onClick={() => commitSettingsRows(settingsRows.filter((_, ri) => ri !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {settingsRows.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No overrides - this hire inherits everything from the Job Profile as-is.</p>
                )}
              </div>
            </div>
          </div>

        </div>
      </ScrollArea>

      {/* Floating Action Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex justify-end">
        <button
          onClick={onRefreshPreview}
          disabled={!selectedJobProfile}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Update Preview
        </button>
      </div>
    </div>
  );
}
