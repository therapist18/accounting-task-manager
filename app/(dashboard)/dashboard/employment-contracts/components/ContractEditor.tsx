import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase/client';
import { fetchCompanyEmployees, ContractEmployeeInfo } from '../utils/data';
import { buildPlaceholderContext, resolveContractPlaceholders } from '../utils/placeholderContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, RefreshCw, Settings2, UserRound, FileText } from 'lucide-react';
import { EMPLOYMENT_CONTRACT_DOCUMENT_ID } from '../utils/constants';
import { ContractPlaceholderList } from './ContractPlaceholderList';

interface ContractEditorProps {
  companyId: string | null;
  employeeId: string | null;
  contractData: any;
  setContractData: (data: any) => void;
  selectedTemplate: any;
  setSelectedTemplate: (template: any) => void;
  onRefreshPreview: () => void;
}

export function ContractEditor({
  companyId,
  employeeId,
  contractData,
  setContractData,
  selectedTemplate,
  setSelectedTemplate,
  onRefreshPreview
}: ContractEditorProps) {
  const [employee, setEmployee] = useState<ContractEmployeeInfo | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPlaceholders, setLoadingPlaceholders] = useState(false);
  const [resolvedNames, setResolvedNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadData() {
      if (!companyId || !employeeId) {
        setEmployee(null);
        return;
      }
      setLoading(true);

      // Fetch employee data
      const emps = await fetchCompanyEmployees(companyId);
      const target = emps.find(e => String(e.individualId) === employeeId) || null;
      setEmployee(target);

      if (target) {
        // Initialize contract fields
        setContractData((prev: any) => ({
          ...prev,
          employee: target,
          startDate: target.startDate || new Date().toISOString().split('T')[0],
          endDate: '',
          placeholderValues: {},
        }));
      }

      // Fetch templates configured for Employment Contracts (see Manage Templates settings)
      const { data: tpls } = await supabase
        .from('acc_portal_templates')
        .select('*')
        .eq('document_id', EMPLOYMENT_CONTRACT_DOCUMENT_ID)
        .order('file_name');

      if (tpls && tpls.length > 0) {
        setTemplates(tpls);

        if (target) {
          // Auto-select template based on fallback priority
          let bestTemplate = null;
          let bestScore = -1;

          for (const t of tpls) {
            let score = 0;
            let disqualified = false;

            const checkMatch = (templateVal: string | null | undefined, empVal: string | null | undefined, weight: number) => {
              if (templateVal) {
                if (!empVal || templateVal.toLowerCase() !== empVal.toLowerCase()) {
                  disqualified = true;
                } else {
                  score += weight;
                }
              }
            };

            const c = t.classification || {};
            checkMatch(c.company_id, String(companyId), 1000);
            checkMatch(c.department_id, target.department, 100);
            checkMatch(c.position_id, target.jobTitle, 10);
            checkMatch(c.contract_duration, target.employmentType, 1);

            if (c.is_general) {
              score += 0.5; // fallback
            } else if (!c.company_id && !c.department_id && !c.position_id && !c.contract_duration) {
              // Not general but no specific conditions? Treat as low priority fallback
              score += 0.1;
            }

            if (!disqualified && score > bestScore) {
              bestScore = score;
              bestTemplate = t;
            }
          }

          if (bestTemplate) {
            setSelectedTemplate(bestTemplate);
          } else {
            // Default to first if none matched (should rarely happen if there's a general template)
            setSelectedTemplate(tpls[0]);
          }
        }
      } else {
        setTemplates([]);
        setSelectedTemplate(null);
      }

      setLoading(false);
    }
    loadData();
  }, [companyId, employeeId]);

  // When a template is picked, resolve its placeholders from company/employee data using the
  // same master-field resolution engine as the tasks-requirements template generator, so this
  // module doesn't re-implement that lookup logic.
  useEffect(() => {
    async function resolvePlaceholders() {
      if (!selectedTemplate?.placeholders?.length || !employee || !companyId) {
        setResolvedNames(new Set());
        return;
      }

      setLoadingPlaceholders(true);
      try {
        const { ctx } = await buildPlaceholderContext(companyId, employee.individualId);
        const { values, resolvedNames: resolved } = resolveContractPlaceholders(selectedTemplate, ctx);
        setContractData((prev: any) => ({
          ...prev,
          placeholderValues: values,
        }));
        setResolvedNames(resolved);
      } finally {
        setLoadingPlaceholders(false);
      }
    }
    resolvePlaceholders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate?.id, employee?.individualId, companyId]);

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
                <span className="text-xs text-slate-500 font-medium">Basic Salary</span>
                <p className="font-medium text-slate-800 dark:text-slate-200">KES {employee?.basicSalary?.toLocaleString() || 0}</p>
              </div>
            </div>
          </div>

          {/* Template & Dates Card */}
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <FileText className="w-4 h-4 text-custom-blue" /> Document Settings
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              <div className="space-y-2 md:col-span-6">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Template</Label>
                <Select
                  value={selectedTemplate?.id || ''}
                  onValueChange={(val) => {
                    const t = templates.find(x => x.id === val);
                    setSelectedTemplate(t);
                  }}
                >
                  <SelectTrigger className="bg-slate-50 dark:bg-slate-950/50 h-9 border-slate-200 dark:border-slate-800 transition-colors hover:bg-slate-100 dark:hover:bg-slate-900">
                    <SelectValue placeholder="Choose a contract template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.file_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Start Date</Label>
                <Input
                  type="date"
                  className="h-9 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 transition-colors hover:bg-slate-100 dark:hover:bg-slate-900"
                  value={contractData.startDate || ''}
                  onChange={(e) => setContractData({ ...contractData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">End Date</Label>
                <Input
                  type="date"
                  className="h-9 bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 transition-colors hover:bg-slate-100 dark:hover:bg-slate-900"
                  value={contractData.endDate || ''}
                  onChange={(e) => setContractData({ ...contractData, endDate: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Placeholders Card */}
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Settings2 className="w-4 h-4 text-custom-blue" /> Variables & Fields
            </h3>
            <ContractPlaceholderList
              placeholders={selectedTemplate?.placeholders || []}
              values={contractData.placeholderValues || {}}
              resolvedNames={resolvedNames}
              loading={loadingPlaceholders}
              onChange={(name, value) => setContractData({
                ...contractData,
                placeholderValues: { ...(contractData.placeholderValues || {}), [name]: value },
              })}
            />
          </div>

        </div>
      </ScrollArea>

      {/* Floating Action Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex justify-end">
        <button
          onClick={onRefreshPreview}
          disabled={!selectedTemplate}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Update Preview
        </button>
      </div>
    </div>
  );
}
