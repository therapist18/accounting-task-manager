// @ts-nocheck
"use client";
import React, { useRef, useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, PlusCircle, Trash2, FileText, Pencil, Save, RefreshCw } from "lucide-react";
import { DocumentTemplate as BaseDocumentTemplate } from "./types";
import { TableHeader, Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import supabase from "@/lib/supabase/client";
import TemplateEditor from "@/components/TemplateEditor";
import { Textarea } from "@/components/ui/textarea";

// --- CORE FIX: Import Docxtemplater, PizZip, and the InspectModule ---
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import InspectModule from 'docxtemplater/js/inspect-module';


interface DocumentTemplate extends BaseDocumentTemplate {
  content?: string;
  isDirty?: boolean;
}

interface DocumentTemplateManagerProps {
  document: {
    id: string;
    name: string;
    display_name?: string;
    templates?: DocumentTemplate[];
  };
  isOpen: boolean;
  onClose: () => void;
  onTemplateUpdate: (documentId: string, templates: DocumentTemplate[]) => void;
  classId?: string;
}

const PLACEHOLDER_TYPES = [
  { value: 'text', label: 'Text' }, { value: 'date', label: 'Date' }, { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' }, { value: 'array', label: 'Array/List' }, { value: 'image', label: 'Image' },
];

type Placeholder = {
  id: string; name: string; description?: string; type: 'text' | 'number' | 'date' | 'select' | 'array';
  required: boolean; options?: string[];
};

export default function DocumentTemplateManager({ document, isOpen, onClose, onTemplateUpdate, classId }: DocumentTemplateManagerProps) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [currentTemplateIndex, setCurrentTemplateIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaceholderFormOpen, setIsPlaceholderFormOpen] = useState(false);
  const [isEditingPlaceholder, setIsEditingPlaceholder] = useState<number | null>(null);
  const [newPlaceholder, setNewPlaceholder] = useState<any>({ name: '', description: '', type: 'text', required: true });
  const [templateFiles, setTemplateFiles] = useState<Map<string, File>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentTemplate = (currentTemplateIndex !== null && templates[currentTemplateIndex]) ? templates[currentTemplateIndex] : null;

 useEffect(() => {
    if (isOpen) {
      const initialTemplates = document.templates || [];
      setTemplates(initialTemplates.map(t => ({ ...t, isDirty: false })));
      setCurrentTemplateIndex(initialTemplates.length > 0 ? 0 : null);
    } else {
      setTemplates([]);
      setCurrentTemplateIndex(null);
    }
  }, [isOpen, document.templates]);

const extractPlaceholders = async (source: { type: 'file', content: File } | { type: 'text', content: string }): Promise<string[]> => {
    setIsProcessing(true);
    try {
      const matches = new Set<string>();

      if (source.type === 'file') {
        const arrayBuffer = await source.content.arrayBuffer();
        const zip = new PizZip(arrayBuffer);
        const inspectModule = new InspectModule();
        new Docxtemplater(zip, { modules: [inspectModule] });
        const tags = inspectModule.getAllTags();
        Object.keys(tags).forEach(tag => matches.add(tag));
      } else {
        // Handle text content without using DOM methods
        const textToParse = source.content
          .replace(/<[^>]*>?/gm, '') // Remove HTML tags
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();

        const placeholderRegex = /{{\s*([^{}\s]+)\s*}}|{\s*([^{}\s]+)\s*}/g;
        let match;
        while ((match = placeholderRegex.exec(textToParse)) !== null) {
          const placeholder = match[1] || match[2];
          if (placeholder) {
            matches.add(placeholder.trim());
          }
        }
      }
      return Array.from(matches);
    } catch (error) {
      console.error('Error extracting placeholders:', error);
      toast({
        title: 'Template Analysis Failed',
        description: 'Could not read placeholders from the file. It may be corrupt or in an unsupported format.',
        variant: 'destructive',
      });
      return [];
    } finally {
      setIsProcessing(false);
    }
  };
    const autoGeneratePlaceholders = (extracted: string[]): Placeholder[] => extracted.map((name, index) => ({ id: `auto_${Date.now()}_${index}`, name, description: ``, type: 'text', required: true }));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return toast({ title: 'Invalid file type', variant: 'destructive' });
    const extracted = await extractPlaceholders({ type: 'file', content: file });
    addNewFileTemplate(file, extracted);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addNewFileTemplate = (file: File, extractedPlaceholders: string[]) => {
    const tempId = `temp_file_${Date.now()}`;
    const newTemplate: DocumentTemplate = {
      id: tempId, document_id: document.id,
      name: file.name.replace(/\.[^/.]+$/, ''),
      file_name: file.name, file_type: file.type, file_size: file.size,
      placeholders: autoGeneratePlaceholders(extractedPlaceholders),
      created_at: new Date().toISOString(),
    };
    setTemplateFiles(prev => new Map(prev.set(tempId, file)));
    const updatedTemplates = [...templates, newTemplate];
    setTemplates(updatedTemplates);
    setCurrentTemplateIndex(updatedTemplates.length - 1);
    toast({ title: 'File Template Added', description: `Detected ${extractedPlaceholders.length} placeholders.` });
  };

  const addNewTextTemplate = () => {
    const tempId = `temp_text_${Date.now()}`;
    const newTemplate: DocumentTemplate = {
      id: tempId, document_id: document.id,
      name: `New Text Template ${templates.filter(t => t.content !== undefined).length + 1}`,
      content: '<p>Start writing your template here...</p>',
      file_type: 'text/html',
      placeholders: [],
      created_at: new Date().toISOString(),
    };
    const updatedTemplates = [...templates, newTemplate];
    setTemplates(updatedTemplates);
    setCurrentTemplateIndex(updatedTemplates.length - 1);
  };

  const handleEditorChange = (html: string) => {
    if (currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    updatedTemplates[currentTemplateIndex].content = html;
    updatedTemplates[currentTemplateIndex].isDirty = true;
    setTemplates(updatedTemplates);
  };

  const handleTemplateNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    updatedTemplates[currentTemplateIndex].name = e.target.value;
    setTemplates(updatedTemplates);
  };

   const handleRescanPlaceholders = async () => {
    if (!currentTemplate || currentTemplate.content === undefined) return;
    const extracted = await extractPlaceholders({ type: 'text', content: currentTemplate.content });
    const updatedTemplates = [...templates];
    updatedTemplates[currentTemplateIndex].placeholders = autoGeneratePlaceholders(extracted);
    updatedTemplates[currentTemplateIndex].isDirty = false;
    setTemplates(updatedTemplates);
    toast({ title: 'Placeholders Updated', description: `Found ${extracted.length} placeholders.` });
  };

  const handleEditorBlur = () => {
    if (currentTemplate?.isDirty) {
      handleRescanPlaceholders();
    }
  };

  const savePlaceholder = () => {
    if (!newPlaceholder.name.trim() || currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    const targetTemplate = updatedTemplates[currentTemplateIndex];
    const updatedPlaceholders = [...(targetTemplate.placeholders || [])];
    const placeholder: Placeholder = {
      id: isEditingPlaceholder !== null ? updatedPlaceholders[isEditingPlaceholder].id : `ph_${Date.now()}`,
      name: newPlaceholder.name.trim(), description: newPlaceholder.description.trim(), type: newPlaceholder.type,
      required: newPlaceholder.required, options: newPlaceholder.options,
    };
    if (isEditingPlaceholder !== null) updatedPlaceholders[isEditingPlaceholder] = placeholder;
    else updatedPlaceholders.push(placeholder);
    targetTemplate.placeholders = updatedPlaceholders;
    setTemplates(updatedTemplates);
    setIsPlaceholderFormOpen(false);
    setNewPlaceholder({ name: '', description: '', type: 'text', required: true, options: [] });
    setIsEditingPlaceholder(null);
  };

  const editPlaceholder = (index: number) => {
    if (!currentTemplate) return;
    const placeholder = currentTemplate.placeholders?.[index];
    if (!placeholder) return;
    setNewPlaceholder({ ...placeholder, description: placeholder.description || '', options: placeholder.options || [] });
    setIsPlaceholderFormOpen(true);
    setIsEditingPlaceholder(index);
  };

  const removePlaceholder = (index: number) => {
    if (currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    updatedTemplates[currentTemplateIndex].placeholders = updatedTemplates[currentTemplateIndex].placeholders?.filter((_, i) => i !== index);
    setTemplates(updatedTemplates);
  };

  const uploadAndSaveAll = async () => {
    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      for (const template of templates) {
        let filePath = template.file_path;
        if (template.id.startsWith('temp_') && !template.content) {
          const fileToUpload = templateFiles.get(template.id);
          if (!fileToUpload) throw new Error(`File for ${template.file_name} not found.`);
          const storagePath = `kyc-templates/${document.id}-${Date.now()}`;
          const { data, error } = await supabase.storage.from('templates').upload(storagePath, fileToUpload);
          if (error) throw error;
          filePath = data.path;
        }

        const templateData = {
          file_name: template.name, document_id: document.id, file_path: filePath, content: template.content,
          file_type: template.file_type, file_size: template.file_size,
          placeholders: template.placeholders || [], updated_at: new Date().toISOString(), created_by: user?.id,
          class_id: classId ? [classId] : undefined,
        };

        const { error } = template.id.startsWith('temp_')
          ? await supabase.from('acc_portal_templates').insert(templateData)
          : await supabase.from('acc_portal_templates').update(templateData).eq('id', template.id);
        if (error) throw error;
      }

      await supabase.from('acc_portal_kyc').update({ has_template: templates.length > 0 }).eq('id', document.id);
      onTemplateUpdate(document.id, templates);
      onClose();
      toast({ title: "Templates Saved" });
    } catch (error) {
      console.error('Error saving templates:', error);
      toast({ title: "Error Saving", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteTemplate = async (index: number) => {
    const templateToDelete = templates[index];
    if (!templateToDelete) return;

    if (!templateToDelete.id.startsWith('temp_')) {
      if (templateToDelete.file_path) {
        await supabase.storage.from('templates').remove([templateToDelete.file_path]);
      }
      await supabase.from('acc_portal_templates').delete().eq('id', templateToDelete.id);
    }

    const updatedTemplates = templates.filter((_, i) => i !== index);
    setTemplates(updatedTemplates);
    if (index === currentTemplateIndex) {
      setCurrentTemplateIndex(updatedTemplates.length > 0 ? Math.max(0, index - 1) : null);
    } else if (currentTemplateIndex && index < currentTemplateIndex) {
      setCurrentTemplateIndex(currentTemplateIndex - 1);
    }
    toast({ title: "Template Removed" });
  };
    
  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-screen h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Template Manager: {document.display_name || document.name}</DialogTitle>
            <DialogDescription>Create and manage templates by uploading a DOCX file or using the rich text editor.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-12 gap-6 py-4 flex-1 overflow-y-auto">
            {/* Column 1: Add & Queue */}
            <div className="col-span-3 flex flex-col gap-6 h-full">
              <Card>
                <CardHeader><CardTitle className="text-lg">Add New Template</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="template-upload">Upload .docx File</Label>
                    <Input id="template-upload" type="file" accept=".docx" onChange={handleFileChange} disabled={isProcessing} ref={fileInputRef} />
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                    <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or</span></div>
                  </div>
                  <Button onClick={addNewTextTemplate} variant="outline" className="w-full">
                    <PlusCircle className="mr-2 h-4 w-4" /> Create Text Template
                  </Button>
                </CardContent>
              </Card>

              <Card className="flex-1 flex flex-col">
                <CardHeader><CardTitle className="text-lg">Template Queue</CardTitle></CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  {templates.length > 0 ? (
                    <div className="border rounded-md">
                      {templates.map((tpl, idx) => (
                        <div key={tpl.id} className={`p-3 border-b last:border-b-0 flex items-center justify-between gap-2 hover:bg-muted/50 cursor-pointer ${idx === currentTemplateIndex ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`} onClick={() => setCurrentTemplateIndex(idx)}>
                          <div className="flex items-center gap-3 flex-grow truncate">
                            <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                            <div className="truncate">
                              <p className="font-medium truncate">{tpl.name}</p>
                              <p className="text-xs text-muted-foreground">{tpl.placeholders?.length || 0} fields</p>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={(e) => { e.stopPropagation(); deleteTemplate(idx); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-center p-8"><h3 className="text-sm font-medium">Queue is empty</h3></div>}
                </CardContent>
              </Card>
            </div>

            {/* Column 2: Editor */}
            <div className="col-span-5 h-full">
              {currentTemplate ? (
                <Card className="h-full flex flex-col">
                  <CardHeader className="flex flex-row justify-between items-center">
                    <div>
                      <CardTitle>Template Editor</CardTitle>
                      <CardDescription>Edit the name and content below.</CardDescription>
                    </div>
                    {currentTemplate.isDirty && (
                      <Button size="sm" onClick={handleRescanPlaceholders}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Re-scan Placeholders
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="template-name">Template Name</Label>
                      <Input id="template-name" value={currentTemplate.name || ''} onChange={handleTemplateNameChange} />
                    </div>
                    <div className="space-y-2 flex-1 flex flex-col">
                      <Label>Content</Label>
                      {currentTemplate.content !== undefined ? (
                        <TemplateEditor
                          key={currentTemplate.id}
                          initialContent={currentTemplate.content}
                          onChange={handleEditorChange}
                          onBlur={handleEditorBlur}
                          className="flex-1"
                        />
                      ) : (
                        <div className="p-4 border rounded-md bg-muted text-center h-full flex items-center justify-center">
                          <p className="text-sm text-muted-foreground">Content for .docx files cannot be edited here. <br /> Re-upload the file to make changes.</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="h-full flex items-center justify-center text-center border-2 border-dashed rounded-lg">
                  <div>
                    <h3 className="text-lg font-medium">No Template Selected</h3>
                    <p className="text-sm text-muted-foreground mt-1">Add or select a template to begin editing.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Column 3: Placeholders */}
            <div className="col-span-4 h-full">
              <Card className="h-full flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div><CardTitle>Placeholders</CardTitle><CardDescription>Fields for the selected template.</CardDescription></div>
                  <Button variant="outline" size="sm" onClick={() => setIsPlaceholderFormOpen(true)} disabled={!currentTemplate}><PlusCircle className="mr-2 h-4 w-4" /> Add</Button>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  {currentTemplate?.placeholders?.length > 0 ? (
                    <Table>
                      <TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {currentTemplate.placeholders.map((p, index) => (
                          <TableRow key={p.id}>
                            <TableCell><div className="font-mono text-sm font-medium">{`{${p.name}}`}</div></TableCell>
                            <TableCell><Badge variant="outline" className="capitalize">{p.type}</Badge></TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editPlaceholder(index)}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removePlaceholder(index)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center p-6 h-full flex items-center justify-center"><p className="text-sm text-muted-foreground">No placeholders found.</p></div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isProcessing}>Cancel</Button>
            <Button onClick={uploadAndSaveAll} disabled={isProcessing || templates.length === 0}>{isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save All Templates</>}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Placeholder Form Dialog */}
      <Dialog open={isPlaceholderFormOpen} onOpenChange={setIsPlaceholderFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{isEditingPlaceholder !== null ? 'Edit' : 'Add'} Placeholder</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label htmlFor="name">Name (no spaces, e.g., client_name)</Label><Input id="name" value={newPlaceholder.name} onChange={(e) => setNewPlaceholder({ ...newPlaceholder, name: e.target.value.replace(/\s+/g, '_') })} /></div>
            {/* --- FIX: Corrected a typo from `neweholder` to `newPlaceholder`. --- */}
            <div className="space-y-2"><Label htmlFor="description">Description</Label><Textarea id="description" placeholder="A short description for this field" value={newPlaceholder.description} onChange={(e) => setNewPlaceholder({ ...newPlaceholder, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="type">Type</Label><Select value={newPlaceholder.type} onValueChange={(v) => setNewPlaceholder({ ...newPlaceholder, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PLACEHOLDER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="flex items-end"><div className="flex items-center space-x-2"><Checkbox id="required" checked={newPlaceholder.required} onCheckedChange={(c) => setNewPlaceholder({ ...newPlaceholder, required: !!c })} /><Label htmlFor="required">Required field</Label></div></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsPlaceholderFormOpen(false)}>Cancel</Button><Button onClick={savePlaceholder} disabled={!newPlaceholder.name.trim()}>{isEditingPlaceholder !== null ? 'Update' : 'Add'} Placeholder</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}