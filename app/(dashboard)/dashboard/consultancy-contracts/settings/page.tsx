'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, Save, Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDefaultTemplate, updateTemplate, CcTemplate } from '../utils/ccTemplate';
import { detectTokens, syncPlaceholdersFromContent } from '../utils/placeholderDetection';
import { PlaceholderSources } from '../../employment-contracts/components/PlaceholderSources';

const TemplateEditor = dynamic(() => import('@/components/TemplateEditor'), { ssr: false });

// Consultancy owns (can delete) only the rows its own sync created - company
// facts shared with Employment Contracts must stay managed from EC's screen.
const CC_OWNED_GROUP = 'Consultancy Contract';

export default function ConsultancyContractSettingsPage() {
  const [template, setTemplate] = useState<CcTemplate | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [placeholderRefreshKey, setPlaceholderRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      const tmpl = await fetchDefaultTemplate();
      setTemplate(tmpl);
      setContent(tmpl?.content || '');
      setLoading(false);
    })();
  }, []);

  // Live token set drives the shared PlaceholderSources list beside the
  // editor - it narrows the registry down to what this template uses.
  const templateTokens = useMemo(() => detectTokens(content), [content]);

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    try {
      const updated = await updateTemplate(template.id, { content });
      if (!updated) {
        toast.error('Failed to save template');
        return;
      }
      setTemplate(updated);
      const newTokens = await syncPlaceholdersFromContent(content);
      setPlaceholderRefreshKey((k) => k + 1);
      toast.success(
        newTokens.length > 0
          ? `Template saved - ${newTokens.length} new placeholder${newTokens.length === 1 ? '' : 's'} detected`
          : 'Template saved'
      );
    } finally {
      setSaving(false);
    }
  };

  // Manual sync straight from the live (even unsaved) editor content - same
  // auto-detect the Save flow runs, exposed as the pane's toolbar action.
  const handleSyncPlaceholders = async () => {
    setSyncing(true);
    try {
      const newTokens = await syncPlaceholdersFromContent(content);
      setPlaceholderRefreshKey((k) => k + 1);
      toast.success(
        newTokens.length > 0
          ? `${newTokens.length} new placeholder${newTokens.length === 1 ? '' : 's'} detected`
          : 'No new placeholders found'
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-custom-blue" />
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">Contract Template</h1>
          <p className="hidden md:block text-sm text-slate-400 ml-2">
            The one standard Consultancy Agreement every client contract is generated from. Type <code className="text-[11px] bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{token}}'}</code> for any value that should vary per client - the placeholders pane stays in sync as you type.
          </p>
        </div>
        <Button size="sm" className="h-9 rounded-full gap-1.5 bg-custom-blue hover:bg-custom-blue/90" onClick={handleSave} disabled={saving || loading}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Template
        </Button>
      </div>

      <div className="flex-1 min-h-0 w-full relative">
        <PanelGroup direction="horizontal" autoSaveId="consultancy-contracts-settings-layout" className="h-full w-full">
          <Panel
            id="template"
            order={1}
            defaultSize={62}
            minSize={35}
            className="bg-white/50 dark:bg-slate-900/50 flex flex-col z-10 overflow-hidden"
          >
            <div className="flex-1 overflow-hidden p-4">
              {loading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : (
                <TemplateEditor
                  key={template?.id}
                  initialContent={content}
                  onChange={(c) => setContent(c.html)}
                  showHeaderFooterControls={false}
                  className="h-full"
                />
              )}
            </div>
          </Panel>

          <PanelResizeHandle className="relative flex w-2 items-center justify-center group outline-none cursor-col-resize z-20">
            <div className="h-full w-[2px] bg-slate-200/50 dark:bg-slate-800/50 transition-colors group-hover:bg-blue-400 group-active:bg-blue-500 dark:group-hover:bg-blue-500 dark:group-active:bg-blue-600 delay-75" />
          </PanelResizeHandle>

          <Panel
            id="placeholders"
            order={2}
            defaultSize={38}
            minSize={25}
            className="bg-slate-50 dark:bg-slate-950 flex flex-col z-10 overflow-hidden"
          >
            <div className="flex-1 min-h-0 overflow-hidden p-4">
              <PlaceholderSources
                filterByKeys={templateTokens}
                refreshKey={placeholderRefreshKey}
                fillHeight
                title="Placeholders Used in Template"
                clausesEnabled={false}
                allowedSourceKinds={['master_field']}
                deletableGroup={CC_OWNED_GROUP}
                typeScans={[content]}
                emptyMessage="No placeholders used yet - type {{tokens}} into the template on the left, then Sync."
                toolbar={
                  <Button size="sm" variant="outline" className="h-8 rounded-full gap-1.5" onClick={handleSyncPlaceholders} disabled={syncing}>
                    {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Sync
                  </Button>
                }
              />
            </div>
          </Panel>
        </PanelGroup>
      </div>

      <div className="px-5 py-2 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex items-center gap-1.5 text-[11px] text-slate-400">
        <Sparkles className="w-3 h-3" />
        Saving auto-detects any new {'{{tokens}}'} and adds them to the Placeholders registry (shared with Employment Contracts).
      </div>
    </div>
  );
}
