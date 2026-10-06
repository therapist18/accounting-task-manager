'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, Save, RefreshCw, Star } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { fetchTemplateById, updateTemplate, setDefaultTemplateVariant, CcTemplate } from '../utils/ccTemplate';
import { resolveCompanyRole } from '../utils/ccResolver';
import { extractPlaceholders, mergePlaceholders } from '../../templates/document-template-manager/utils';
import { useTemplateData } from '../../templates/document-template-manager/hooks/useTemplateData';
import { PlaceholderPanel } from '../../templates/document-template-manager/components/PlaceholderPanel';
import { PlaceholderFormDialog } from '../../templates/document-template-manager/components/PlaceholderFormDialog';
import type { Placeholder } from '../../templates/document-template-manager/types';

const TemplateEditor = dynamic(() => import('@/components/TemplateEditor'), { ssr: false });

interface ContractTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
  documentId: string;
  // Bumped by the caller after close so its own template list refetches -
  // mirrors LettersPage's templateVersion/onTemplateUpdate pattern.
  onSaved: () => void;
  // Reuse options - Employment Contracts' Letter Templates tab uses this
  // same dialog for letter templates. Defaults are Consultancy's own.
  // Placeholders table "Belongs To" column; null hides it.
  belongsToLabel?: ((p: Placeholder) => string) | null;
  showCompanyRoleField?: boolean;
  // entity_type a newly added placeholder starts with.
  defaultEntityType?: string[];
}

const consultancyBelongsTo = (p: Placeholder) => {
  const role = resolveCompanyRole({ key: p.name, company_role: p.company_role });
  const label = role === 'consultant' ? 'Consultant' : 'Client';
  return p.company_role ? label : `${label} (auto)`;
};

// The "just the template and placeholders panels" editor for ONE template
// variant - moved out of settings/page.tsx (which now just lists variants,
// see ContractTemplateList.tsx) into its own dialog, matching how
// DocumentTemplateManager is a dialog LettersPage opens per template rather
// than an always-visible full-page editor.
export function ContractTemplateDialog({
  isOpen, onClose, templateId, documentId, onSaved,
  belongsToLabel = consultancyBelongsTo, showCompanyRoleField = true, defaultEntityType = ['company'],
}: ContractTemplateDialogProps) {
  const { masterFields } = useTemplateData(true, null);
  const { toast } = useToast();
  const [template, setTemplate] = useState<CcTemplate | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [placeholderSearch, setPlaceholderSearch] = useState('');
  const [placeholderDialogOpen, setPlaceholderDialogOpen] = useState(false);
  const [editingPlaceholder, setEditingPlaceholder] = useState<Placeholder | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    (async () => {
      const tmpl = await fetchTemplateById(templateId);
      setTemplate(tmpl);
      setContent(tmpl?.content || '');
      setLoading(false);
    })();
  }, [isOpen, templateId]);

  const handleAddPlaceholder = useCallback(() => {
    const newPlaceholder: Placeholder = {
      id: crypto.randomUUID(),
      name: '',
      type: 'text',
      required: true,
      entity_type: defaultEntityType as any,
      master_field_ids: [],
      linked_job_question_ids: [],
      linked_requirement_ids: [],
      default_value: '',
    };
    setEditingPlaceholder(newPlaceholder);
    setPlaceholderDialogOpen(true);
  }, []);

  const handleEditPlaceholder = useCallback((placeholder: Placeholder) => {
    setEditingPlaceholder(placeholder);
    setPlaceholderDialogOpen(true);
  }, []);

  const handleRemovePlaceholder = useCallback(async (placeholder: Placeholder) => {
    if (!template) return;
    const newPlaceholders = template.placeholders.filter(p => p.id !== placeholder.id);
    const updated = await updateTemplate(template.id, { placeholders: newPlaceholders });
    if (updated) {
      setTemplate(updated);
      toast({ title: 'Placeholder removed' });
    }
  }, [template, toast]);

  const handleSavePlaceholder = useCallback(async (placeholder: Placeholder) => {
    if (!template) return;
    const existingIndex = template.placeholders.findIndex(p => p.id === placeholder.id);
    const newPlaceholders = [...template.placeholders];
    if (existingIndex >= 0) newPlaceholders[existingIndex] = placeholder;
    else newPlaceholders.push(placeholder);

    const updated = await updateTemplate(template.id, { placeholders: newPlaceholders });
    if (updated) {
      setTemplate(updated);
      setPlaceholderDialogOpen(false);
      setEditingPlaceholder(null);
      toast({ title: 'Placeholder saved' });
    }
  }, [template, toast]);

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    try {
      const updated = await updateTemplate(template.id, { content });
      if (!updated) {
        toast({ title: 'Failed to save template', variant: 'destructive' });
        return;
      }
      setTemplate(updated);
      toast({ title: 'Template saved' });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async () => {
    if (!template || template.is_default) return;
    setSettingDefault(true);
    try {
      const ok = await setDefaultTemplateVariant(documentId, template.id);
      if (ok) {
        setTemplate({ ...template, is_default: true });
        toast({ title: 'Set as default - this is now the variant the generation page uses' });
        onSaved();
      } else {
        toast({ title: 'Failed to set as default', variant: 'destructive' });
      }
    } finally {
      setSettingDefault(false);
    }
  };

  const handleRescanPlaceholders = async () => {
    if (!template) return;
    const source = template.content ? { type: 'text' as const, content: template.content } : null;
    if (!source) return;

    setIsProcessing(true);
    try {
      const extractedPlaceholders = await extractPlaceholders(source, masterFields);
      const existingPlaceholders = template.placeholders || [];
      const merged = mergePlaceholders(existingPlaceholders, extractedPlaceholders, masterFields);

      const updated = await updateTemplate(template.id, { placeholders: merged });
      if (updated) {
        setTemplate(updated);
        toast({ title: "Content Synced", description: "Updated placeholder list while preserving your field settings." });
      }
    } catch (error) {
      console.error('Error rescanning placeholders:', error);
      toast({ title: 'Error rescanning', description: 'Failed to rescan placeholders', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-screen h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 py-3 border-b bg-white dark:bg-slate-900 shrink-0 flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="w-5 h-5 text-custom-blue shrink-0" />
            <div className="min-w-0">
              <DialogTitle className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 truncate flex items-center gap-2">
                {template?.file_name || 'Template'}
                {template?.is_default && (
                  <Badge variant="outline" className="text-sm bg-amber-50 text-amber-700 border-amber-200 gap-1">
                    <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> Default
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-400">
                Type <code className="text-sm bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{token}}'}</code> for any value that should vary per client - use Re-scan to update placeholders.
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!template?.is_default && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSetDefault}
                disabled={!template || settingDefault}
                className="h-9 rounded-full gap-1.5"
                title="Make this the variant the main generation page uses"
              >
                {settingDefault ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                Set as Default
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRescanPlaceholders}
              disabled={!template || isProcessing}
              className="h-9 rounded-full gap-1.5"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Re-scan
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-full gap-1.5 bg-custom-blue hover:bg-custom-blue/90"
              onClick={handleSave}
              disabled={saving || !template}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Template
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 w-full relative">
          <PanelGroup direction="horizontal" autoSaveId="consultancy-contracts-template-dialog-layout" className="h-full w-full">
            <Panel id="template" order={1} defaultSize={62} minSize={35} className="bg-white/50 dark:bg-slate-900/50 flex flex-col z-10 overflow-hidden">
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

            <Panel id="placeholders" order={2} defaultSize={38} minSize={25} className="bg-slate-50 dark:bg-slate-950 flex flex-col z-10 overflow-hidden">
              <div className="flex-1 min-h-0 overflow-hidden p-4">
                <PlaceholderPanel
                  placeholders={template?.placeholders || []}
                  placeholderSearch={placeholderSearch}
                  onPlaceholderSearchChange={setPlaceholderSearch}
                  masterFields={masterFields}
                  jobQuestions={[]}
                  requirements={[]}
                  variant="table"
                  title="Placeholders"
                  description="Fields detected in template"
                  emptyMessage="No placeholders detected. Type &#123;&#123;tokens&#125;&#125; in the template and click Re-scan."
                  showAddButton
                  onAddPlaceholder={handleAddPlaceholder}
                  onEditPlaceholder={handleEditPlaceholder}
                  onRemovePlaceholder={handleRemovePlaceholder}
                  belongsToLabel={belongsToLabel || undefined}
                />
              </div>
            </Panel>
          </PanelGroup>
        </div>

        <PlaceholderFormDialog
          isOpen={placeholderDialogOpen}
          onClose={() => {
            setPlaceholderDialogOpen(false);
            setEditingPlaceholder(null);
          }}
          placeholder={editingPlaceholder || {
            id: crypto.randomUUID(),
            name: '',
            type: 'text',
            required: true,
            entity_type: defaultEntityType as any,
            master_field_ids: [],
            linked_job_question_ids: [],
            linked_requirement_ids: [],
            default_value: '',
          }}
          masterFields={masterFields}
          jobQuestions={[]}
          requirements={[]}
          kycDocuments={[]}
          documentTypes={[]}
          tables={[]}
          loadingTables={false}
          onSave={handleSavePlaceholder}
          onChange={(updates) => setEditingPlaceholder(prev => prev ? { ...prev, ...updates } : null)}
          isEditing={!!editingPlaceholder}
          showCompanyRoleField={showCompanyRoleField}
        />
      </DialogContent>
    </Dialog>
  );
}
