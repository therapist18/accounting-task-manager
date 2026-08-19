'use client';

import { useEffect, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { CC_DOCUMENT_ID } from '../utils/ccTemplate';
import { fetchContractDocumentTypes, createContractDocumentType, ContractDocumentType } from '../utils/contractDocumentTypes';
import { ContractTypesSidebar } from '../components/ContractTypesSidebar';
import { ContractTemplateList } from '../components/ContractTemplateList';

// Shell only - which contract type is selected (left) and the list of its
// template variants (right, see ContractTemplateList.tsx). Editing a
// variant's content/placeholders happens in a dialog (ContractTemplateDialog.tsx),
// not inline here - matches templates/page.tsx (LettersPage)'s own
// list-then-dialog pattern instead of an always-visible full-page editor.
export default function ConsultancyContractSettingsPage() {
  const [documentTypes, setDocumentTypes] = useState<ContractDocumentType[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>(CC_DOCUMENT_ID);
  const [creatingType, setCreatingType] = useState(false);

  const selectedDocumentType = documentTypes.find((d) => d.id === selectedDocumentId) || null;

  useEffect(() => {
    (async () => {
      const types = await fetchContractDocumentTypes();
      setDocumentTypes(types);
    })();
  }, []);

  const handleCreateDocumentType = async (name: string) => {
    setCreatingType(true);
    try {
      const created = await createContractDocumentType(name);
      if (!created) return;
      setDocumentTypes((prev) => [...prev, created].sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name)));
      setSelectedDocumentId(created.id);
    } finally {
      setCreatingType(false);
    }
  };

  return (
    <div className="h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex-1 min-h-0 w-full relative">
        <PanelGroup direction="horizontal" autoSaveId="consultancy-contracts-settings-layout" className="h-full w-full">
          <Panel
            id="contract-types"
            order={0}
            defaultSize={22}
            minSize={16}
            maxSize={32}
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

          <Panel id="templates" order={1} defaultSize={78} minSize={50} className="flex flex-col z-10 overflow-hidden p-4">
            <ContractTemplateList
              documentId={selectedDocumentId}
              documentDisplayName={selectedDocumentType?.display_name || 'Contract Type'}
            />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
