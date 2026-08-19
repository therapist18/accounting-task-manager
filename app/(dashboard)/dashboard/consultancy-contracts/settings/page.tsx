'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, Save, Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { fetchDefaultTemplate, updateTemplate, CcTemplate, CC_DOCUMENT_ID } from '../utils/ccTemplate';
import { fetchContractDocumentTypes, createContractDocumentType, ContractDocumentType } from '../utils/contractDocumentTypes';
import { ContractTypesSidebar } from '../components/ContractTypesSidebar';
import { extractPlaceholders, mergePlaceholders, validateTemplate } from '../../templates/document-template-manager/utils';
import { useTemplateData } from '../../templates/document-template-manager/hooks/useTemplateData';
import { PlaceholderPanel } from '../../templates/document-template-manager/components/PlaceholderPanel';
import { PlaceholderFormDialog } from '../../templates/document-template-manager/components/PlaceholderFormDialog';
import type { Placeholder, JobField, JobQuestion, Requirement } from '../../templates/document-template-manager/types';
import { EntityType } from '@/lib/constants/entity-types';

const TemplateEditor = dynamic(() => import('@/components/TemplateEditor'), { ssr: false });

export default function ConsultancyContractSettingsPage() {
  const { masterFields } = useTemplateData(true, null);
  const { toast } = useToast();
  const [documentTypes, setDocumentTypes] = useState<ContractDocumentType[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>(CC_DOCUMENT_ID);
  const [creatingType, setCreatingType] = useState(false);
  const [template, setTemplate] = useState<CcTemplate | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [placeholderSearch, setPlaceholderSearch] = useState('');
  const [panelsVisible, setPanelsVisible] = useState({
    left: true,
    right: true,
  });

  const selectedDocumentType = documentTypes.find((d) => d.id === selectedDocumentId) || null;

  const togglePanel = (panel: 'left' | 'right') => {
    const currentlyVisibleCount = Object.values(panelsVisible).filter(Boolean).length;
    if (currentlyVisibleCount === 1 && panelsVisible[panel]) {
      toast({ title: "Cannot hide the last visible panel." });
      return;
    }
    setPanelsVisible(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  const panelClasses = useMemo(() => {
    const { left, right } = panelsVisible;
    const visibleCount = [left, right].filter(Boolean).length;
    if (visibleCount === 2) return { left: 'col-span-7', right: 'col-span-5' };
    if (visibleCount === 1) return { left: left ? 'col-span-12' : 'hidden', right: right ? 'col-span-12' : 'hidden' };
    return { left: 'hidden', right: 'hidden' };
  }, [panelsVisible]);

  const [placeholderDialogOpen, setPlaceholderDialogOpen] = useState(false);
  const [editingPlaceholder, setEditingPlaceholder] = useState<Placeholder | null>(null);

  const handleAddPlaceholder = useCallback(() => {
    const newPlaceholder: Placeholder = {
      id: crypto.randomUUID(),
      name: '',
      type: 'text',
      required: true,
      entity_type: ['company'],
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
  }, [template, updateTemplate, toast]);

  const handleSavePlaceholder = useCallback(async (placeholder: Placeholder) => {
    if (!template) return;
    const existingIndex = template.placeholders.findIndex(p => p.id === placeholder.id);
    const newPlaceholders = [...template.placeholders];
    
    if (existingIndex >= 0) {
      newPlaceholders[existingIndex] = placeholder;
    } else {
      newPlaceholders.push(placeholder);
    }

    const updated = await updateTemplate(template.id, { placeholders: newPlaceholders });
    if (updated) {
      setTemplate(updated);
      setPlaceholderDialogOpen(false);
      setEditingPlaceholder(null);
      toast({ title: 'Placeholder saved' });
    }
  }, [template, updateTemplate, toast]);

  useEffect(() => {
    (async () => {
      const types = await fetchContractDocumentTypes();
      setDocumentTypes(types);
    })();
  }, []);

  useEffect(() => {
    setLoading(true);
    // Cleared up front, not just on arrival - otherwise the Placeholder
    // panel keeps showing the PREVIOUS contract type's fields for the
    // instant between selecting a new one and its fetch resolving.
    setTemplate(null);
    setContent('');
    (async () => {
      const tmpl = await fetchDefaultTemplate(selectedDocumentId, selectedDocumentType?.display_name);
      setTemplate(tmpl);
      setContent(tmpl?.content || '');
      setLoading(false);
    })();
    // selectedDocumentType is looked up from documentTypes by id, not a
    // stable reference - re-running on it would refetch every time
    // documentTypes reloads, not just when the selection itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocumentId]);

  const handleCreateDocumentType = async (name: string) => {
    setCreatingType(true);
    try {
      const created = await createContractDocumentType(name);
      if (!created) {
        toast({ title: 'Failed to create contract type', variant: 'destructive' });
        return;
      }
      setDocumentTypes((prev) => [...prev, created].sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name)));
      setSelectedDocumentId(created.id);
      toast({ title: 'Contract type created' });
    } finally {
      setCreatingType(false);
    }
  };

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
    } finally {
      setSaving(false);
    }
  };

  const handleRescanPlaceholders = async () => {
    if (!template) return;

    const source = template.content
      ? { type: 'text' as const, content: template.content }
      : null;

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
    <div className="h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-custom-blue" />
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
            {selectedDocumentType?.display_name || 'Contract Template'}
          </h1>
          <p className="hidden md:block text-sm text-slate-400 ml-2">
            The one standard document every {selectedDocumentType?.display_name || 'contract'} is generated from. Type <code className="text-[11px] bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{{token}}'}</code> for any value that should vary per client - use Re-scan to update placeholders.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            disabled={saving}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Template
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full relative">
        <PanelGroup direction="horizontal" autoSaveId="consultancy-contracts-settings-layout" className="h-full w-full">
          <Panel
            id="contract-types"
            order={0}
            defaultSize={18}
            minSize={14}
            maxSize={28}
            className="flex flex-col z-10 overflow-hidden"
          >
            <ContractTypesSidebar
              documentTypes={documentTypes}
              selectedDocumentId={selectedDocumentId}
              onSelect={setSelectedDocumentId}
              onCreate={handleCreateDocumentType}
              creating={creatingType}
            />
          </Panel>

          <PanelResizeHandle className="relative flex w-2 items-center justify-center group outline-none cursor-col-resize z-20">
            <div className="h-full w-[2px] bg-slate-200/50 dark:bg-slate-800/50 transition-colors group-hover:bg-blue-400 group-active:bg-blue-500 dark:group-hover:bg-blue-500 dark:group-active:bg-blue-600 delay-75" />
          </PanelResizeHandle>

          <Panel
            id="template"
            order={1}
            defaultSize={62}
            minSize={35}
            className={cn("bg-white/50 dark:bg-slate-900/50 flex flex-col z-10 overflow-hidden", panelsVisible.left ? '' : 'hidden')}
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

          <PanelResizeHandle className={cn("relative flex w-2 items-center justify-center group outline-none cursor-col-resize z-20", panelsVisible.left ? '' : 'hidden')}>
            <div className="h-full w-[2px] bg-slate-200/50 dark:bg-slate-800/50 transition-colors group-hover:bg-blue-400 group-active:bg-blue-500 dark:group-hover:bg-blue-500 dark:group-active:bg-blue-600 delay-75" />
          </PanelResizeHandle>

          <Panel
            id="placeholders"
            order={2}
            defaultSize={38}
            minSize={25}
            className={cn("bg-slate-50 dark:bg-slate-950 flex flex-col z-10 overflow-hidden", panelsVisible.right ? '' : 'hidden')}
          >
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
          entity_type: ['company'],
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
      />
    </div>
  );
}