'use client';

import { useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Columns2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BiodataSidebar } from './components/BiodataSidebar';
import { BiodataEditor } from './components/BiodataEditor';
import { BiodataPreview } from './components/BiodataPreview';
import type { Individual } from '../individuals/database';

export default function MatrimonialBiodataPage() {
  const [selectedIndividual, setSelectedIndividual] = useState<Individual | null>(null);
  const [biodataConfig, setBiodataConfig] = useState<any>({ theme: 'theme1' });

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

  const handleIndividualSelect = (individual: Individual) => {
    setSelectedIndividual(individual);
  };

  return (
    <div className="h-screen w-full overflow-hidden bg-[#f3f4f6] dark:bg-[#0a0a0a] flex flex-col shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0 z-10 shadow-sm relative">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Matrimonial Biodata
          </h1>

          <div className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-full border border-slate-200 dark:border-slate-800/80">
            <button
              onClick={() => togglePanel('sidebar')}
              title={collapsed.sidebar ? 'Show entities panel' : 'Hide entities panel'}
              className={cn(
                "p-1.5 rounded-full transition-all",
                collapsed.sidebar ? "text-slate-400 hover:text-slate-600" : "bg-custom-blue text-white shadow-sm"
              )}
            >
              {collapsed.sidebar ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <button
              onClick={() => togglePanel('editor')}
              title={collapsed.editor ? 'Show configuration panel' : 'Hide configuration panel'}
              className={cn(
                "p-1.5 rounded-full transition-all",
                collapsed.editor ? "text-slate-400 hover:text-slate-600" : "bg-custom-blue text-white shadow-sm"
              )}
            >
              <Columns2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => togglePanel('preview')}
              title={collapsed.preview ? 'Show preview panel' : 'Hide preview panel'}
              className={cn(
                "p-1.5 rounded-full transition-all",
                collapsed.preview ? "text-slate-400 hover:text-slate-600" : "bg-custom-blue text-white shadow-sm"
              )}
            >
              {collapsed.preview ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 min-h-0 w-full relative">
        <PanelGroup 
          direction="horizontal" 
          autoSaveId="biodata-workspace-layout"
          className="h-full w-full"
        >
          {/* LEFT PANEL: Individuals Sidebar */}
          <Panel
            ref={sidebarPanelRef}
            id="sidebar"
            order={1}
            defaultSize={20}
            minSize={15}
            maxSize={30}
            collapsible
            collapsedSize={0}
            onCollapse={() => setCollapsed(prev => ({ ...prev, sidebar: true }))}
            onExpand={() => setCollapsed(prev => ({ ...prev, sidebar: false }))}
            className="bg-white/50 dark:bg-slate-900/50 flex flex-col z-10 overflow-hidden"
          >
            <BiodataSidebar
              selectedIndividualId={selectedIndividual?.id?.toString() || null}
              onSelectIndividual={handleIndividualSelect}
            />
          </Panel>

          <PanelResizeHandle className="relative flex w-2 items-center justify-center group outline-none cursor-col-resize z-20">
            <div className="h-full w-[2px] bg-slate-200/50 dark:bg-slate-800/50 transition-colors group-hover:bg-blue-400 group-active:bg-blue-500 dark:group-hover:bg-blue-500 dark:group-active:bg-blue-600 delay-75" />
          </PanelResizeHandle>

          {/* CENTER PANEL: Configuration & Form */}
          <Panel
            ref={editorPanelRef}
            id="editor"
            order={2}
            defaultSize={30}
            minSize={25}
            collapsible
            collapsedSize={0}
            onCollapse={() => setCollapsed(prev => ({ ...prev, editor: true }))}
            onExpand={() => setCollapsed(prev => ({ ...prev, editor: false }))}
            className="bg-slate-50 dark:bg-slate-950 flex flex-col z-10 overflow-hidden shadow-[0_0_15px_rgba(0,0,0,0.02)]"
          >
            <BiodataEditor
              selectedIndividual={selectedIndividual}
              biodataConfig={biodataConfig}
              setBiodataConfig={setBiodataConfig}
            />
          </Panel>

          <PanelResizeHandle className="relative flex w-2 items-center justify-center group outline-none cursor-col-resize z-20">
            <div className="h-full w-[2px] bg-slate-200/50 dark:bg-slate-800/50 transition-colors group-hover:bg-blue-400 group-active:bg-blue-500 dark:group-hover:bg-blue-500 dark:group-active:bg-blue-600 delay-75" />
          </PanelResizeHandle>

          {/* RIGHT PANEL: Live Document Preview */}
          <Panel
            ref={previewPanelRef}
            id="preview"
            order={3}
            defaultSize={50}
            minSize={35}
            collapsible
            collapsedSize={0}
            onCollapse={() => setCollapsed(prev => ({ ...prev, preview: true }))}
            onExpand={() => setCollapsed(prev => ({ ...prev, preview: false }))}
            className="bg-slate-100/80 dark:bg-slate-900/80 flex flex-col z-10 overflow-hidden"
          >
            <BiodataPreview
              selectedIndividual={selectedIndividual}
              biodataConfig={biodataConfig}
            />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
