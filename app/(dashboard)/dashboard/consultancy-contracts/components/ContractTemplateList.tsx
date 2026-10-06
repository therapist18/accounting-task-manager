'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PlusCircle, FileText, Loader2, Pencil, Trash2, Star } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { fetchTemplatesForDocument, createTemplateVariant, deleteTemplateVariant, CcTemplate } from '../utils/ccTemplate';
import { ContractTemplateDialog } from './ContractTemplateDialog';

interface ContractTemplateListProps {
  documentId: string;
  documentDisplayName: string;
  // Reuse options - Employment Contracts' Letter Templates tab lists letter
  // templates with this same component. Defaults are Consultancy's own.
  noun?: string; // "contract type" / "letter type"
  // Creates a new variant (default: a blank one via createTemplateVariant).
  createVariant?: (documentId: string, name: string) => Promise<{ id: string } | null>;
  dialogProps?: Pick<ComponentProps<typeof ContractTemplateDialog>, 'belongsToLabel' | 'showCompanyRoleField' | 'defaultEntityType'>;
}

// Replaces the always-visible template/placeholders editor panels that used
// to live directly in settings/page.tsx - a contract type can now hold
// several template variants (see ccTemplate.ts's fetchTemplatesForDocument),
// so this shows them as a list first, matching LettersPage's own
// TemplateDisplayArea + DocumentTemplateManager dialog pattern. Editing one
// variant's content/placeholders happens in ContractTemplateDialog.
export function ContractTemplateList({ documentId, documentDisplayName, noun = 'contract type', createVariant = createTemplateVariant, dialogProps }: ContractTemplateListProps) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<CcTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<CcTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const rows = await fetchTemplatesForDocument(documentId);
    setTemplates(rows);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await createVariant(documentId, newName.trim());
      if (!created) {
        toast({ title: 'Failed to create template', variant: 'destructive' });
        return;
      }
      setNewName('');
      setCreateDialogOpen(false);
      await refresh();
      setEditingTemplateId(created.id);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTemplate) return;
    setDeleting(true);
    try {
      const ok = await deleteTemplateVariant(deletingTemplate.id);
      if (ok) {
        toast({ title: 'Template deleted' });
        setDeletingTemplate(null);
        await refresh();
      } else {
        toast({ title: 'Failed to delete template', variant: 'destructive' });
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="h-full flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 shrink-0">
        <div>
          <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100">{documentDisplayName}</CardTitle>
          <CardDescription className="text-sm text-slate-400">Template variants for this {noun}. The default one is used for generation.</CardDescription>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="h-9 px-4 rounded-full bg-custom-blue hover:bg-custom-blue/90 text-white text-sm font-bold gap-1.5"
        >
          <PlusCircle className="h-4 w-4" /> Create New
        </Button>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-5">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : templates.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <div>
              <FileText className="h-10 w-10 mx-auto mb-3 text-slate-300" />
              <h3 className="text-base font-semibold text-slate-600 dark:text-slate-300">No templates yet</h3>
              <p className="text-sm text-slate-400 mt-1">Create the first one to get started.</p>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full pr-2">
            <div className="space-y-3">
              {templates.map((template) => (
                <Card key={template.id} className="border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="p-4">
                    <CardTitle className="flex justify-between items-center text-base font-semibold text-slate-800 dark:text-slate-100">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{template.file_name}</span>
                        {template.is_default && (
                          <Badge variant="outline" className="text-sm shrink-0 bg-amber-50 text-amber-700 border-amber-200 gap-1">
                            <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> Default
                          </Badge>
                        )}
                      </span>
                      <div className="flex gap-1.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-slate-400 hover:text-custom-blue" onClick={() => setEditingTemplateId(template.id)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-slate-400 hover:text-red-600" onClick={() => setDeletingTemplate(template)} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardTitle>
                    <CardDescription className="text-sm text-slate-400 pt-1">
                      {template.placeholders?.length || 0} placeholder{template.placeholders?.length === 1 ? '' : 's'}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Template</DialogTitle>
            <DialogDescription>
              Creates a new, blank template variant under "{documentDisplayName}". It won't be used by the generation page until you mark it (or another variant) as default.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="new-template-name">Name</Label>
            <Input
              id="new-template-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Standard, Retainer, Short Form"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingTemplate} onOpenChange={(open) => { if (!open) setDeletingTemplate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{deletingTemplate?.file_name}". This action cannot be undone.
              {deletingTemplate?.is_default && templates.length > 1 && ' This is the current default variant - no other variant will automatically take its place, so remember to set a new default afterwards.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editingTemplateId && (
        <ContractTemplateDialog
          isOpen={!!editingTemplateId}
          onClose={() => setEditingTemplateId(null)}
          templateId={editingTemplateId}
          documentId={documentId}
          onSaved={refresh}
          {...dialogProps}
        />
      )}
    </Card>
  );
}
