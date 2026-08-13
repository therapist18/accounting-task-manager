'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDefaultTemplate, updateTemplate, CcTemplate } from '../utils/ccTemplate';
import { syncPlaceholdersFromContent } from '../utils/placeholderDetection';

const TemplateEditor = dynamic(() => import('@/components/TemplateEditor'), { ssr: false });

export default function ConsultancyContractSettingsPage() {
  const [template, setTemplate] = useState<CcTemplate | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const tmpl = await fetchDefaultTemplate();
      setTemplate(tmpl);
      setContent(tmpl?.content || '');
      setLoading(false);
    })();
  }, []);

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
      toast.success(
        newTokens.length > 0
          ? `Template saved - ${newTokens.length} new placeholder${newTokens.length === 1 ? '' : 's'} detected`
          : 'Template saved'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-custom-blue" />
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">Contract Template</h1>
          <p className="hidden md:block text-sm text-slate-400 ml-2">
            The one standard Consultancy Agreement every client contract is generated from. Type <code className="text-[11px] bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{token}}'}</code> for any value that should vary per client.
          </p>
        </div>
        <Button size="sm" className="h-9 rounded-full gap-1.5 bg-custom-blue hover:bg-custom-blue/90" onClick={handleSave} disabled={saving || loading}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Template
        </Button>
      </div>
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
      <div className="px-5 py-2 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex items-center gap-1.5 text-[11px] text-slate-400">
        <Sparkles className="w-3 h-3" />
        Saving auto-detects any new {'{{tokens}}'} and adds them to the Placeholders registry.
      </div>
    </div>
  );
}
