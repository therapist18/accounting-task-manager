'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Settings } from 'lucide-react';
import { ContractsSidebar } from './components/ContractsSidebar';
import { ContractEditor } from './components/ContractEditor';
import { ContractPreview } from './components/ContractPreview';

export default function EmploymentContractsPage() {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [contractData, setContractData] = useState<any>({});
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  // We keep track of preview trigger to refresh the docx
  const [previewKey, setPreviewKey] = useState(0);

  const handleEmployeeSelect = (companyId: string, employeeId: string) => {
    setSelectedCompanyId(companyId);
    setSelectedEmployeeId(employeeId);
    // Reset contract data when new employee is selected
    setContractData({});
    setSelectedTemplate(null);
  };

  return (
    <div className="h-[calc(100vh-2rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100">Employment Contracts</h1>
        <Link
          href="/dashboard/employment-contracts/templates"
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          Manage Templates
        </Link>
      </div>
      <PanelGroup direction="horizontal" className="h-full w-full">
        {/* LEFT PANEL: Hierarchy (Companies -> Employees) */}
        <Panel defaultSize={20} minSize={15} maxSize={30} className="bg-white dark:bg-slate-900 flex flex-col z-10">
          <ContractsSidebar
            selectedCompanyId={selectedCompanyId}
            selectedEmployeeId={selectedEmployeeId}
            onSelectEmployee={handleEmployeeSelect}
            onCompanySelect={setSelectedCompanyId}
          />
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* CENTER PANEL: Configuration & Form */}
        <Panel defaultSize={40} minSize={30} className="bg-slate-50 dark:bg-slate-950 flex flex-col z-10">
          <ContractEditor
            companyId={selectedCompanyId}
            employeeId={selectedEmployeeId}
            contractData={contractData}
            setContractData={setContractData}
            selectedTemplate={selectedTemplate}
            setSelectedTemplate={setSelectedTemplate}
            onRefreshPreview={() => setPreviewKey(prev => prev + 1)}
          />
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* RIGHT PANEL: Live Document Preview */}
        <Panel defaultSize={40} minSize={30} className="bg-slate-100 dark:bg-slate-900 flex flex-col z-10 border-l border-slate-200 dark:border-slate-800">
          <ContractPreview
            key={previewKey}
            contractData={contractData}
            selectedTemplate={selectedTemplate}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}
