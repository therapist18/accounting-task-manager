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

      if (tpls) {
        setTemplates(tpls);
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
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 relative">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-custom-blue" />
            Contract Configuration
          </h2>
          <p className="text-xs text-slate-500">Configure parameters for {employee?.fullName}</p>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4 overflow-auto">
        <div className="max-w-2xl mx-auto space-y-6 pb-20">

          {/* Employee Context Read-only Panel - Compact */}
          <div className="bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <UserRound className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-600">Employee Context</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
              <div className="flex items-baseline gap-1.5">
                <span className="text-slate-400 shrink-0">Name</span>
                <span className="font-medium truncate">{employee?.fullName}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-slate-400 shrink-0">No.</span>
                <span className="font-medium truncate">{employee?.employeeNumber}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-slate-400 shrink-0">Dept</span>
                <span className="font-medium truncate">{employee?.department || '-'}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-slate-400 shrink-0">Position</span>
                <span className="font-medium truncate">{employee?.jobTitle || '-'}</span>
              </div>
              <div className="flex items-baseline gap-1.5 col-span-2">
                <span className="text-slate-400 shrink-0">Salary</span>
                <span className="font-medium">KES {employee?.basicSalary?.toLocaleString() || 0}</span>
              </div>
            </div>
          </div>

          {/* Template Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Template Selection
            </Label>
            <Select
              value={selectedTemplate?.id || ''}
              onValueChange={(val) => {
                const t = templates.find(x => x.id === val);
                setSelectedTemplate(t);
              }}
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Choose a contract template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.file_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Document Themes & Branding Strategy */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <Label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                Document Theme
              </Label>
              <Select
                value={contractData.documentTheme || 'corporate'}
                onValueChange={(val) => setContractData({ ...contractData, documentTheme: val })}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Select a theme..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="corporate">Corporate</SelectItem>
                  <SelectItem value="legal">Legal</SelectItem>
                  <SelectItem value="modern">Modern</SelectItem>
                  <SelectItem value="executive">Executive</SelectItem>
                  <SelectItem value="minimal">Minimal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-3">
              <Label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                Branding Strategy
              </Label>
              <Select
                value={contractData.brandingStrategy || 'none'}
                onValueChange={(val) => setContractData({ ...contractData, brandingStrategy: val })}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Select branding strategy..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="embedded">Embedded in Template</SelectItem>
                  <SelectItem value="company_letterhead">Use Company Letterhead</SelectItem>
                  <SelectItem value="theme_header">Use Theme Header</SelectItem>
                  <SelectItem value="none">None (Clean Document)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Contract Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Start Date</Label>
              <Input
                type="date"
                value={contractData.startDate || ''}
                onChange={(e) => setContractData({ ...contractData, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End Date</Label>
              <Input
                type="date"
                value={contractData.endDate || ''}
                onChange={(e) => setContractData({ ...contractData, endDate: e.target.value })}
              />
            </div>
          </div>

          {/* Placeholders resolved from the selected template */}
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
