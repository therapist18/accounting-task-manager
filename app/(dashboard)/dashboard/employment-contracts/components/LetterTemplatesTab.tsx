'use client';

import { useEffect, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ContractTypesSidebar } from '../../consultancy-contracts/components/ContractTypesSidebar';
import { ContractTemplateList } from '../../consultancy-contracts/components/ContractTemplateList';
import { fetchLetterDocumentTypes, createLetterDocumentType, type LetterDocumentType } from '../utils/letterDocumentTypes';
import {
  convertLegacyLetterTemplates, createLetterTemplate, missingStandardLetters, seedStandardLetters,
} from '../utils/letterTemplateStore';
import type { Placeholder } from '../../templates/document-template-manager/types';

const byName = (a: LetterDocumentType, b: LetterDocumentType) =>
  (a.display_name || a.name).localeCompare(b.display_name || b.name);

// "Belongs To" column of the template editor's Placeholders table - where the
// workspace gets the value from.
const letterSourceLabel = (p: Placeholder) =>
  (p.master_field_ids || []).length > 0 ? 'Master field' : 'Typed in letter';

// Letter Templates tab of the Job Profiles settings page. Letter templates
// are the same records as consultancy contract templates, so this is the
// Consultancy Contracts settings screen reused as-is: letter types on the
// left (ContractTypesSidebar), the selected type's template variants on the
// right (ContractTemplateList), each edited in ContractTemplateDialog
// (template + PlaceholderPanel with re-scan and master-field linking).
// Letter types are global (Director's Documents > Letters, see
// letterDocumentTypes.ts), so this tab ignores the page's company picker.
export function LetterTemplatesTab() {
  const { toast } = useToast();
  const [types, setTypes] = useState<LetterDocumentType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState(false);
  const [seeding, setSeeding] = useState(false);
  // The type whose templates are ready to list - set once any templates
  // saved before templates held the whole letter have been converted.
  const [readyTypeId, setReadyTypeId] = useState<string | null>(null);

  const selectedType = types.find((t) => t.id === selectedTypeId) || null;
  const typeName = selectedType ? selectedType.display_name || selectedType.name : '';
  const missing = missingStandardLetters(types);

  useEffect(() => {
    fetchLetterDocumentTypes().then((rows) => {
      setTypes(rows);
      setSelectedTypeId((prev) => prev || rows[0]?.id || null);
    });
  }, []);

  useEffect(() => {
    if (!selectedTypeId) return;
    let cancelled = false;
    setReadyTypeId(null);
    convertLegacyLetterTemplates(selectedTypeId).finally(() => { if (!cancelled) setReadyTypeId(selectedTypeId); });
    return () => { cancelled = true; };
  }, [selectedTypeId]);

  const handleCreateType = async (name: string) => {
    setCreatingType(true);
    try {
      const created = await createLetterDocumentType(name);
      if (!created) {
        toast({ title: 'Failed to create letter type', variant: 'destructive' });
        return;
      }
      setTypes((prev) => [...prev, created].sort(byName));
      setSelectedTypeId(created.id);
    } finally {
      setCreatingType(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const created = await seedStandardLetters(types);
      setTypes((prev) => [...prev, ...created].sort(byName));
      if (!selectedTypeId && created[0]) setSelectedTypeId(created[0].id);
      toast({
        title: created.length === missing.length ? `Added ${created.length} standard letter${created.length === 1 ? '' : 's'}` : `Added ${created.length} of ${missing.length} standard letters`,
        variant: created.length === missing.length ? undefined : 'destructive',
      });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <PanelGroup direction="horizontal" autoSaveId="job-profiles-letter-templates-layout" className="h-full w-full">
      <Panel id="letter-types" order={0} defaultSize={22} minSize={16} maxSize={32} className="flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
        <ContractTypesSidebar
          documentTypes={types}
          selectedDocumentId={selectedTypeId}
          onSelect={setSelectedTypeId}
          onCreate={handleCreateType}
          creating={creatingType}
          labels={{
            title: 'Letter Types',
            addTooltip: 'Add a new letter type',
            empty: 'No letter types yet - add the standard letters or create one.',
            dialogTitle: 'New Letter Type',
            dialogDescription: "Creates a new letter document type under Director's Documents > Letters, with its own templates. Letter types apply to every company.",
            namePlaceholder: 'e.g. Warning Letter',
          }}
          footer={missing.length > 0 && (
            <Button variant="outline" size="sm" className="w-full h-9 gap-1.5 text-base" onClick={handleSeed} disabled={seeding}>
              {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Add standard letters ({missing.length})
            </Button>
          )}
        />
      </Panel>

      <PanelResizeHandle className="relative w-2 bg-slate-200/50 dark:bg-slate-800/50 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-10" />

      <Panel id="letter-templates" order={1} defaultSize={78} minSize={50} className="flex flex-col overflow-hidden p-4">
        {!selectedType ? (
          <div className="h-full flex items-center justify-center text-base text-slate-400">Select or create a letter type.</div>
        ) : readyTypeId !== selectedType.id ? (
          <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : (
          <ContractTemplateList
            key={selectedType.id}
            documentId={selectedType.id}
            documentDisplayName={typeName}
            noun="letter type"
            createVariant={(documentId, name) => createLetterTemplate(documentId, name, typeName)}
            dialogProps={{ belongsToLabel: letterSourceLabel, showCompanyRoleField: false, defaultEntityType: ['employee'] }}
          />
        )}
      </Panel>
    </PanelGroup>
  );
}
