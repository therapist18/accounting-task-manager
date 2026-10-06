'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { FileStack, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContractDocumentType } from '../utils/contractDocumentTypes';

interface ContractTypesSidebarProps {
  documentTypes: ContractDocumentType[];
  selectedDocumentId: string | null;
  onSelect: (documentId: string) => void;
  onCreate: (name: string) => Promise<void>;
  creating: boolean;
  // Wording overrides so employment-contracts' letter settings can reuse this
  // sidebar for letter types.
  labels?: Partial<typeof DEFAULT_LABELS>;
  footer?: ReactNode;
}

const DEFAULT_LABELS = {
  title: 'Contract Types',
  addTooltip: 'Add a new contract type',
  empty: 'No contract types yet - add one to get started.',
  dialogTitle: 'New Contract Type',
  dialogDescription: 'Creates a new document type (e.g. "Service Agreement", "Lease Agreement") with its own standard template, separate from every other contract type.',
  namePlaceholder: 'e.g. Service Agreement',
};

export function ContractTypesSidebar({ documentTypes, selectedDocumentId, onSelect, onCreate, creating, labels: labelOverrides, footer }: ContractTypesSidebarProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await onCreate(newName);
    setNewName('');
    setDialogOpen(false);
  };

  return (
    <div className="flex flex-col h-full border-r border-slate-200 dark:border-slate-800">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-gradient-to-b from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/50">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileStack className="w-4 h-4 text-custom-blue" />
            {labels.title}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-slate-700"
            onClick={() => setDialogOpen(true)}
            title={labels.addTooltip}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3 py-3 space-y-0.5">
          {documentTypes.map((doc) => {
            const isSelected = selectedDocumentId === doc.id;
            return (
              <button
                key={doc.id}
                onClick={() => onSelect(doc.id)}
                className={cn(
                  "flex items-center w-full px-3 py-2.5 text-base font-medium rounded-lg transition-colors text-left",
                  isSelected
                    ? "bg-custom-blue text-white font-medium shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                <span className="truncate">{doc.display_name || doc.name}</span>
              </button>
            );
          })}
          {documentTypes.length === 0 && (
            <p className="text-sm text-slate-400 px-2.5 py-4 text-center">{labels.empty}</p>
          )}
        </div>
      </ScrollArea>

      {footer && <div className="p-3 border-t border-slate-200 dark:border-slate-800 shrink-0">{footer}</div>}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.dialogTitle}</DialogTitle>
            <DialogDescription>{labels.dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="new-contract-type-name">Name</Label>
            <Input
              id="new-contract-type-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={labels.namePlaceholder}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
