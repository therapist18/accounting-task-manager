import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase/client';
import { fetchCompanyEmployees, ContractEmployeeInfo } from '../utils/data';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, RefreshCw, Settings2, UserRound, FileText } from 'lucide-react';
import { EMPLOYMENT_CONTRACT_DOCUMENT_ID } from '../utils/constants';

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
          probationPeriod: '3 Months',
          noticePeriod: '1 Month',
          leaveDays: '21',
          workingHours: '8:00 AM - 5:00 PM',
          useLetterhead: false,
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

      <ScrollArea className="flex-1 p-4">
        <div className="max-w-2xl mx-auto space-y-6 pb-20">
          
          {/* Employee Context Read-only Panel */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-slate-50/50 dark:bg-slate-900/50">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <UserRound className="w-4 h-4 text-slate-400" />
                Employee Context
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="block text-xs text-slate-400">Name</span>
                  <span className="font-medium">{employee?.fullName}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400">Employee Number</span>
                  <span className="font-medium">{employee?.employeeNumber}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400">Position</span>
                  <span className="font-medium">{employee?.jobTitle || '-'}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400">Department</span>
                  <span className="font-medium">{employee?.department || '-'}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400">Basic Salary</span>
                  <span className="font-medium">KES {employee?.basicSalary?.toLocaleString() || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>

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
                {templates.map(t => {
                  const isSupported = t.file_type !== 'text/html';
                  return (
                    <SelectItem key={t.id} value={t.id} disabled={!isSupported}>
                      {t.file_name}{!isSupported && ' (unsupported - text template)'}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Configurable Parameters */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-700 border-b pb-2">Contract Variables</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Start Date</Label>
                <Input 
                  type="date" 
                  value={contractData.startDate || ''} 
                  onChange={(e) => setContractData({...contractData, startDate: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End Date</Label>
                <Input 
                  type="date" 
                  value={contractData.endDate || ''} 
                  onChange={(e) => setContractData({...contractData, endDate: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Probation Period</Label>
                <Input 
                  value={contractData.probationPeriod || ''} 
                  onChange={(e) => setContractData({...contractData, probationPeriod: e.target.value})}
                  placeholder="e.g. 3 Months"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notice Period</Label>
                <Input 
                  value={contractData.noticePeriod || ''} 
                  onChange={(e) => setContractData({...contractData, noticePeriod: e.target.value})}
                  placeholder="e.g. 1 Month"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Leave Days per Year</Label>
                <Input 
                  type="number"
                  value={contractData.leaveDays || ''} 
                  onChange={(e) => setContractData({...contractData, leaveDays: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Working Hours</Label>
                <Input 
                  value={contractData.workingHours || ''} 
                  onChange={(e) => setContractData({...contractData, workingHours: e.target.value})}
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 mt-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Use Company Letterhead</Label>
                <p className="text-[11px] text-slate-500">Insert company logo and branding</p>
              </div>
              <Switch 
                checked={contractData.useLetterhead || false}
                onCheckedChange={(c) => setContractData({...contractData, useLetterhead: c})}
              />
            </div>
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
