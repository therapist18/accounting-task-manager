'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { Settings, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Columns2, BookText, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContractsSidebar } from './components/ContractsSidebar';
import { ContractEditor } from './components/ContractEditor';
import { ContractPreview } from './components/ContractPreview';
import { EcJobProfile } from './utils/jobProfileData';

export default function EmploymentContractsPage() {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [contractData, setContractData] = useState<any>({});
  const [selectedJobProfile, setSelectedJobProfile] = useState<EcJobProfile | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

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

  const handleEmployeeSelect = (companyId: string, employeeId: string) => {
    setSelectedCompanyId(companyId);
    setSelectedEmployeeId(employeeId);
    setContractData({});
    setSelectedJobProfile(null);
  };

  return (
    <div className="max-h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100">Employment Contracts</h1>
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
              title={collapsed.editor ? 'Show configuration panel' : 'Hide configuration panel'}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                collapsed.editor ? "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" : "text-custom-blue bg-blue-50 dark:bg-blue-900/20"
              )}
            >
              <Columns2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => togglePanel('preview')}
              title={collapsed.preview ? 'Show preview panel' : 'Hide preview panel'}
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
          <Link
            href="/dashboard/employment-contracts/clause-library"
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <BookText className="w-3.5 h-3.5" />
            Clauses
          </Link>
          <Link
            href="/dashboard/employment-contracts/job-profiles"
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Briefcase className="w-3.5 h-3.5" />
            Job Profiles
          </Link>
          <Link
            href="/dashboard/employment-contracts/templates"
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Templates
          </Link>
        </div>
      </div>
      <PanelGroup direction="horizontal" className="h-full w-full">
        {/* LEFT PANEL: Hierarchy (Companies -> Employees) */}
        <Panel
          ref={sidebarPanelRef}
          defaultSize={20}
          minSize={15}
          maxSize={30}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, sidebar: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, sidebar: false }))}
          className="bg-white dark:bg-slate-900 flex flex-col z-10 overflow-auto"
        >
          <ContractsSidebar
            selectedCompanyId={selectedCompanyId}
            selectedEmployeeId={selectedEmployeeId}
            onSelectEmployee={handleEmployeeSelect}
            onCompanySelect={setSelectedCompanyId}
          />
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* CENTER PANEL: Configuration & Form */}
        <Panel
          ref={editorPanelRef}
          defaultSize={40}
          minSize={30}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, editor: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, editor: false }))}
          className="bg-slate-50 dark:bg-slate-950 flex flex-col z-10 !overflow-auto"
        >
          <ContractEditor
            companyId={selectedCompanyId}
            employeeId={selectedEmployeeId}
            contractData={contractData}
            setContractData={setContractData}
            selectedJobProfile={selectedJobProfile}
            setSelectedJobProfile={setSelectedJobProfile}
            onRefreshPreview={() => setPreviewKey(prev => prev + 1)}
          />
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* RIGHT PANEL: Live Document Preview */}
        <Panel
          ref={previewPanelRef}
          defaultSize={40}
          minSize={30}
          collapsible
          collapsedSize={0}
          onCollapse={() => setCollapsed(prev => ({ ...prev, preview: true }))}
          onExpand={() => setCollapsed(prev => ({ ...prev, preview: false }))}
          className="bg-slate-100 dark:bg-slate-900 flex flex-col z-10 border-l border-slate-200 dark:border-slate-800 !overflow-auto"
        >
          <ContractPreview
            key={previewKey}
            contractData={contractData}
            setContractData={setContractData}
            selectedJobProfile={selectedJobProfile}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}