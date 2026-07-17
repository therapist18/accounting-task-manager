'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FileText, Loader2, PlusCircle, Settings, Trash2, Code2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import supabase from '@/lib/supabase/client';
import { DocumentTemplateManager } from '../../templates/document-template-manager/page';
import { EMPLOYMENT_CONTRACT_DOCUMENT_ID } from '../utils/constants';

const EMPLOYMENT_CONTRACT_DOCUMENT = {
  id: EMPLOYMENT_CONTRACT_DOCUMENT_ID,
  name: 'Employment Contract',
  display_name: 'Employment Contract',
};

export default function EmploymentContractTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplates, setEditingTemplates] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTemplates = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('acc_portal_templates')
      .select('*')
      .eq('document_id', EMPLOYMENT_CONTRACT_DOCUMENT_ID)
      .order('file_name', { ascending: true });

    if (error) {
      console.error('Error fetching contract templates:', error);
      toast({ title: 'Error', description: 'Could not fetch contract templates.', variant: 'destructive' });
    } else {
      setTemplates(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCreateNew = () => {
    setEditingTemplates([]);
    setDialogOpen(true);
  };

  const handleEdit = (template: any) => {
    setEditingTemplates([template]);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingTemplates([]);
  };

  const handleDelete = async (templateId: string) => {
    const { error } = await supabase.from('acc_portal_templates').delete().eq('id', templateId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to delete template', variant: 'destructive' });
      return;
    }
    setTemplates(prev => prev.filter(t => t.id !== templateId));
    toast({ title: 'Success', description: 'Template deleted' });
  };

  return (
    <div className="h-[calc(100vh-2rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Contract Templates</h1>
          <p className="text-xs text-slate-500">Manage the templates offered when generating an employment contract</p>
        </div>
        <Button
          onClick={handleCreateNew}
          className="h-9 px-4 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-blue-500/10 border-0 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <PlusCircle className="mr-1.5 h-4 w-4" /> New Template
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed rounded-2xl border-slate-200 dark:border-slate-800">
              <FileText className="h-10 w-10 text-slate-300 mb-3" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">No templates yet</h3>
              <p className="text-xs text-slate-500 mt-1">Create your first employment contract template.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {templates.map(template => (
                <Card
                  key={template.id}
                  onClick={() => handleEdit(template)}
                  className="cursor-pointer border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
                >
                  <CardHeader className="p-5">
                    <CardTitle className="flex justify-between items-start gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                      <span className="flex items-center gap-2 min-w-0">
                        {template.file_type === 'text/html' ? (
                          <Code2 className="h-4 w-4 text-slate-400 shrink-0" />
                        ) : (
                          <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate">{template.file_name}</span>
                      </span>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                          onClick={(e) => { e.stopPropagation(); handleEdit(template); }}
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50"
                          onClick={(e) => { e.stopPropagation(); setDeletingId(template.id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardTitle>
                    <CardDescription className="flex flex-col gap-3 pt-2">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 text-slate-600 border-slate-200 rounded-full px-2 py-0.5">
                          {template.file_type === 'text/html' ? 'Text Editor' : 'DOCX File'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 text-slate-600 border-slate-200 rounded-full px-2 py-0.5">
                          {(template.placeholders?.length || 0)} placeholders
                        </Badge>
                      </div>
                      {template.description && (
                        <span className="text-xs text-slate-500 leading-normal">{template.description}</span>
                      )}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent className="rounded-2xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-slate-800">Are you sure?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500">
              This will permanently delete this template. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="h-9 px-4 rounded-full text-xs font-semibold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deletingId) handleDelete(deletingId); setDeletingId(null); }}
              className="h-9 px-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-md shadow-red-500/10 border-0"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DocumentTemplateManager
        document={EMPLOYMENT_CONTRACT_DOCUMENT}
        initialTemplates={editingTemplates}
        isOpen={dialogOpen}
        onClose={handleDialogClose}
        onTemplateUpdate={fetchTemplates}
        jobLevel={null}
      />
    </div>
  );
}
