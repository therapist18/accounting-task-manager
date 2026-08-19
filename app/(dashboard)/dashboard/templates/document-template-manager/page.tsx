// @ts-nocheck
"use client";

import React, { useRef, useState, useEffect, useMemo } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Save, RefreshCw, ChevronDown, FileText, Code, Hash, View } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useTableData, type TableOption } from "@/lib/tableUtils";
import type { DocumentTemplate, Placeholder, JobField, JobQuestion, Requirement, EntityType } from "./types";
import { useTemplateData } from "./hooks/useTemplateData";
import { extractPlaceholders, mergePlaceholders, validateTemplate } from "./utils";
import { TemplateListPanel } from "./components/TemplateListPanel";
import { TemplateEditorPanel } from "./components/TemplateEditorPanel";
import { PlaceholderPanel } from "./components/PlaceholderPanel";
import { PlaceholderFormDialog } from "./components/PlaceholderFormDialog";
import { Button } from "@/components/ui/button";

interface DocumentTemplateManagerProps {
  document: { id: string; name: string; display_name?: string; };
  initialTemplates?: DocumentTemplate[];
  isOpen: boolean;
  onClose: () => void;
  onTemplateUpdate: () => void;
  jobLevel?: {
    level: number;
    department_id?: number | null;
    subdepartment_id?: number | null;
    class_id?: number | null;
    subclass_id?: number | null;
  } | null;
  className?: string;
  selectedBank?: { bank_id: string; bank_name: string } | null;
}

export function DocumentTemplateManager({
  document,
  initialTemplates = [],
  isOpen,
  onClose,
  onTemplateUpdate,
  jobLevel = null,
  className = "",
  selectedBank = null
}: DocumentTemplateManagerProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { tables, loadingTables } = useTableData();
  
  const { masterFields, jobQuestions, requirements, kycDocuments, documentTypes } = useTemplateData(isOpen, jobLevel);

  const [templates, setTemplates] = useState<DocumentTemplate[]>(initialTemplates);
  const [currentTemplateIndex, setCurrentTemplateIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [placeholderSearch, setPlaceholderSearch] = useState('');
  const [placeholderDialogOpen, setPlaceholderDialogOpen] = useState(false);
  const [editingPlaceholderIndex, setEditingPlaceholderIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [templateFiles, setTemplateFiles] = useState<Map<string, File>>(new Map());
  const templateFilesRef = useRef(templateFiles);
  
  // Keep ref in sync
  useEffect(() => {
    templateFilesRef.current = templateFiles;
  }, [templateFiles]);
  
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [panelsVisible, setPanelsVisible] = useState({
    left: true,
    middle: true,
    right: true,
  });

  const currentTemplate = currentTemplateIndex !== null ? templates[currentTemplateIndex] : null;

  const togglePanel = (panel: 'left' | 'middle' | 'right') => {
    const currentlyVisibleCount = Object.values(panelsVisible).filter(Boolean).length;
    if (currentlyVisibleCount === 1 && panelsVisible[panel]) {
      toast({ title: "Cannot hide the last visible panel." });
      return;
    }
    setPanelsVisible(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  const panelClasses = useMemo(() => {
    const { left, middle, right } = panelsVisible;
    const visibleCount = [left, middle, right].filter(Boolean).length;

    const getClass = (className: string) => className.replace(/\s+/g, ' ').trim();

    if (visibleCount === 3) return {
      left: getClass('col-span-3'),
      middle: getClass('col-span-5'),
      right: getClass('col-span-4')
    };
    if (visibleCount === 2) {
      if (!left) return {
        left: getClass('hidden'),
        middle: getClass('col-span-7'),
        right: getClass('col-span-5')
      };
      if (!middle) return {
        left: getClass('col-span-12'),
        middle: getClass('hidden'),
        right: getClass('hidden')
      };
      if (!right) return {
        left: getClass('col-span-7'),
        middle: getClass('col-span-5'),
        right: getClass('hidden')
      };
    }
    if (visibleCount === 1) {
      if (left) return {
        left: getClass('col-span-12'),
        middle: getClass('hidden'),
        right: getClass('hidden')
      };
      if (middle) return {
        left: getClass('hidden'),
        middle: getClass('col-span-12'),
        right: getClass('hidden')
      };
      if (right) return {
        left: getClass('hidden'),
        middle: getClass('hidden'),
        right: getClass('col-span-12')
      };
    }
    return {
      left: getClass('hidden'),
      middle: getClass('hidden'),
      right: getClass('hidden')
    };
  }, [panelsVisible]);

  // Fetch existing templates for the document when dialog opens
  // Only fetch if we're creating a new template (initialTemplates is empty)
  useEffect(() => {
    const fetchExistingTemplates = async () => {
      if (!isOpen || !document?.id) return;
      
      // If initialTemplates is provided, use it instead of fetching all templates
      if (initialTemplates.length > 0) {
        const mappedTemplates = initialTemplates.map(t => ({
          ...t,
          name: t.name || t.file_name,
          entity_types: Array.isArray(t.entity_types) ? t.entity_types : []
        }));
        setTemplates(mappedTemplates);
        setCurrentTemplateIndex(0);
        return;
      }

      // When creating a new template, start with empty templates
      setTemplates([]);
      setCurrentTemplateIndex(null);
    };

    fetchExistingTemplates();
  }, [isOpen, document?.id, initialTemplates]);

  // Fetch template file from Supabase storage when a template with file_path is selected
  useEffect(() => {
    const fetchTemplateFile = async () => {
      if (!currentTemplate?.file_path || !currentTemplate?.id) return;
      
      // Skip if we already have the file (check using ref to avoid dependency issues)
      if (templateFilesRef.current.has(currentTemplate.id)) return;
      
      try {
        // file_path is already a bucket-relative path (e.g. "kyc-templates/<id>-<ts>"),
        // same convention TemplateGenerationDialog.tsx reads from - not a full URL, so no
        // parsing is needed. The bucket is always 'templates' (matches TemplateGenerationDialog.tsx's
        // hardcoded .../public/templates/${file_path} URL construction).
        const { data, error } = await supabase.storage
          .from('templates')
          .download(currentTemplate.file_path);
        
        if (error) {
          console.error('Error fetching template file:', error);
          // Mark as missing so UI shows appropriate message
          setTemplates(prev => {
            const idx = prev.findIndex(t => t.id === currentTemplate.id);
            if (idx === -1) return prev;
            const newTemplates = [...prev];
            newTemplates[idx] = { ...newTemplates[idx], _fileMissing: true } as any;
            return newTemplates;
          });
          return;
        }
        
        if (data) {
          // Create a File object from the blob
          const file = new File([data], currentTemplate.file_name || 'template.docx', {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          });
          
          // Store in templateFiles Map using functional update
          setTemplateFiles(prev => {
            const newFiles = new Map(prev);
            newFiles.set(currentTemplate.id, file);
            return newFiles;
          });
        }
      } catch (error) {
        console.error('Error fetching template file:', error);
      }
    };
    
    fetchTemplateFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTemplate?.id, currentTemplate?.file_path]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isValid = await validateTemplate(file);
    if (!isValid) {
      toast({ title: 'Invalid file format', description: 'Please upload a valid .docx file', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const extractedPlaceholders = await extractPlaceholders({ type: 'file', content: file }, masterFields);

      const newTemplate: DocumentTemplate = {
        id: crypto.randomUUID(),
        document_id: document.id,
        name: file.name.replace('.docx', ''),
        file_name: file.name,
        file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        file_size: file.size,
        placeholders: extractedPlaceholders,
        entity_types: ['company'],
        banks_associated: selectedBank ? [selectedBank] : [],
        job_level: jobLevel ? [jobLevel] : [],
        isDirty: false
      };

      const newFiles = new Map(templateFiles);
      newFiles.set(newTemplate.id, file);
      setTemplateFiles(newFiles);

      setTemplates(prev => [...prev, newTemplate]);
      setCurrentTemplateIndex(templates.length);
      toast({ title: 'Template uploaded successfully', description: `Extracted ${extractedPlaceholders.length} placeholders` });
    } catch (error) {
      console.error('Error processing file:', error);
      toast({ title: 'Error processing file', description: 'Failed to extract placeholders', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddTextTemplate = () => {
    const newTemplate: DocumentTemplate = {
      id: crypto.randomUUID(),
      document_id: document.id,
      name: `Text Template ${templates.length + 1}`,
      content: '',
      file_type: 'text/html',
      placeholders: [],
      entity_types: ['company'],
      banks_associated: selectedBank ? [selectedBank] : [],
      job_level: jobLevel ? [jobLevel] : [],
      isDirty: false
    };
    setTemplates(prev => [...prev, newTemplate]);
    setCurrentTemplateIndex(templates.length);
  };

  const handleTemplateSelect = (index: number) => {
    setCurrentTemplateIndex(index);
  };

  const handleTemplateDelete = (index: number) => {
    const deletedTemplate = templates[index];
    const newFiles = new Map(templateFiles);
    newFiles.delete(deletedTemplate.id);
    setTemplateFiles(newFiles);

    const newTemplates = templates.filter((_, i) => i !== index);
    setTemplates(newTemplates);
    if (currentTemplateIndex === index) {
      setCurrentTemplateIndex(newTemplates.length > 0 ? 0 : null);
    } else if (currentTemplateIndex !== null && currentTemplateIndex > index) {
      setCurrentTemplateIndex(currentTemplateIndex - 1);
    }
    toast({ title: 'Template deleted' });
  };

  const handleTemplateNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (currentTemplateIndex === null) return;
    const newTemplates = [...templates];
    newTemplates[currentTemplateIndex] = { ...newTemplates[currentTemplateIndex], name: e.target.value };
    setTemplates(newTemplates);
  };

  const handleTemplateFieldChange = (field: string, value: any) => {
    if (currentTemplateIndex === null) return;
    const newTemplates = [...templates];
    newTemplates[currentTemplateIndex] = { ...newTemplates[currentTemplateIndex], [field]: value };
    setTemplates(newTemplates);
  };

  const handleClassificationFieldChange = (field: string, value: any) => {
    if (currentTemplateIndex === null) return;
    const newTemplates = [...templates];
    newTemplates[currentTemplateIndex] = {
      ...newTemplates[currentTemplateIndex],
      classification: { ...newTemplates[currentTemplateIndex].classification, [field]: value },
    };
    setTemplates(newTemplates);
  };

  const handleEditorChange = (content: { html: string; header?: string; footer?: string } | string) => {
    if (currentTemplateIndex === null) return;
    const newTemplates = [...templates];
    const contentStr = typeof content === 'string' ? content : content.html;
    newTemplates[currentTemplateIndex] = { 
      ...newTemplates[currentTemplateIndex], 
      content: contentStr,
      isDirty: true 
    };
    setTemplates(newTemplates);
  };

  const handleEditorBlur = () => {
    if (currentTemplateIndex === null) return;
    const newTemplates = [...templates];
    newTemplates[currentTemplateIndex] = { ...newTemplates[currentTemplateIndex], isDirty: false };
    setTemplates(newTemplates);
  };

  const handleRescanPlaceholders = async () => {
    if (!currentTemplate || currentTemplateIndex === null) return;

    const source = currentTemplate.content
      ? { type: 'text' as const, content: currentTemplate.content }
      : templateFiles.get(currentTemplate.id)
      ? { type: 'file' as const, content: templateFiles.get(currentTemplate.id)! }
      : null;

    if (!source) return;

    setIsProcessing(true);
    try {
      const extractedPlaceholders = await extractPlaceholders(source, masterFields);
      const existingPlaceholders = currentTemplate.placeholders || [];
      const merged = mergePlaceholders(existingPlaceholders, extractedPlaceholders, masterFields);

      const newTemplates = [...templates];
      newTemplates[currentTemplateIndex].placeholders = merged;
      newTemplates[currentTemplateIndex].isDirty = false;
      setTemplates(newTemplates);

      toast({ title: "Content Synced", description: "Updated tag list while preserving your field settings." });
    } catch (error) {
      console.error('Error rescaning placeholders:', error);
      toast({ title: 'Error rescaning', description: 'Failed to rescan placeholders', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualRescan = async () => {
    if (!currentTemplate || currentTemplateIndex === null) return;

    try {
      setIsProcessing(true);

      let extracted: any[] = [];

      // Determine scan source
      if (currentTemplate.file_name && templateFiles.has(currentTemplate.id)) {
        const file = templateFiles.get(currentTemplate.id);
        if (file) {
          extracted = await extractPlaceholders({ type: 'file', content: file }, masterFields);
        }
      } else {
        extracted = await extractPlaceholders({
          type: 'text',
          content: currentTemplate.content || ''
        }, masterFields);
      }

      // Perform the safe merge
      const updatedTemplates = [...templates];
      const existingPlaceholders = updatedTemplates[currentTemplateIndex].placeholders || [];

      // Pass the arrays of Placeholder objects
      const merged = mergePlaceholders(
        existingPlaceholders,
        extracted,
        masterFields
      );

      updatedTemplates[currentTemplateIndex].placeholders = merged;
      updatedTemplates[currentTemplateIndex].isDirty = false;
      setTemplates(updatedTemplates);

      // UI Feedback
      const newlyAdded = merged.filter(m => !existingPlaceholders.find(e => e.name === m.name)).length;
      const preserved = merged.length - newlyAdded;

      toast({
        title: 'Sync Complete',
        description: `Synced ${merged.length} tags. Preserved logic for ${preserved} existing fields and added ${newlyAdded} new ones.`,
        variant: 'default'
      });

    } catch (error) {
      console.error('Error during manual rescan:', error);
      toast({
        title: 'Rescan Error',
        description: 'Failed to rescan template. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEntityTypeToggle = (entityType: EntityType) => {
    if (currentTemplateIndex === null) return;
    const newTemplates = [...templates];
    const currentEntityTypes = newTemplates[currentTemplateIndex].entity_types || [];
    const updatedEntityTypes = currentEntityTypes.includes(entityType)
      ? currentEntityTypes.filter(et => et !== entityType)
      : [...currentEntityTypes, entityType];
    newTemplates[currentTemplateIndex] = { ...newTemplates[currentTemplateIndex], entity_types: updatedEntityTypes };
    setTemplates(newTemplates);
  };

  const handleClearEntityTypes = () => {
    if (currentTemplateIndex === null) return;
    const newTemplates = [...templates];
    newTemplates[currentTemplateIndex] = { ...newTemplates[currentTemplateIndex], entity_types: [] };
    setTemplates(newTemplates);
  };

  const handleToggleLetterhead = () => {
    if (currentTemplateIndex === null) return;
    const newTemplates = [...templates];
    newTemplates[currentTemplateIndex] = {
      ...newTemplates[currentTemplateIndex],
      use_letterhead: !newTemplates[currentTemplateIndex].use_letterhead
    };
    setTemplates(newTemplates);
  };

  const handleAddPlaceholder = () => {
    if (currentTemplateIndex === null) return;
    const newPlaceholder: Placeholder = {
      id: crypto.randomUUID(),
      name: '',
      type: 'text',
      required: true,
      entity_type: ['company'],
      master_field_ids: [],
      linked_job_question_ids: [],
      linked_requirement_ids: []
    };
    setEditingPlaceholderIndex(null);
    setPlaceholderDialogOpen(true);
  };

  // PlaceholderPanel's onEdit/onRemove both call back as (placeholder, index) -
  // see PlaceholderRow's onClick handlers in PlaceholderPanel.tsx. These two
  // handlers only ever declared a single `index` parameter, so they were
  // actually receiving the placeholder OBJECT in that slot (JS binds
  // positionally) - editingPlaceholderIndex ended up set to an object,
  // placeholders[editingPlaceholderIndex] resolved to undefined, and the
  // dialog opened with the blank "new placeholder" fallback every time,
  // making edits look like they were never populating and removes silently
  // no-op (filtering by `i !== index` against an object never matches).
  const handleEditPlaceholder = (_placeholder: Placeholder, index: number) => {
    setEditingPlaceholderIndex(index);
    setPlaceholderDialogOpen(true);
  };

  const handleRemovePlaceholder = (_placeholder: Placeholder, index: number) => {
    if (currentTemplateIndex === null) return;
    const newTemplates = [...templates];
    newTemplates[currentTemplateIndex] = {
      ...newTemplates[currentTemplateIndex],
      placeholders: newTemplates[currentTemplateIndex].placeholders?.filter((_, i) => i !== index) || []
    };
    setTemplates(newTemplates);
    toast({ title: 'Placeholder removed' });
  };

  const handleSavePlaceholder = (placeholder: Placeholder) => {
    if (currentTemplateIndex === null) return;
    const newTemplates = [...templates];
    const currentPlaceholders = newTemplates[currentTemplateIndex].placeholders || [];

    if (editingPlaceholderIndex !== null) {
      // Ensure we're updating the correct placeholder by ID, not just index
      const existingIndex = currentPlaceholders.findIndex(p => p.id === placeholder.id);
      if (existingIndex !== -1) {
        currentPlaceholders[existingIndex] = placeholder;
      } else {
        currentPlaceholders[editingPlaceholderIndex] = placeholder;
      }
    } else {
      currentPlaceholders.push(placeholder);
    }

    newTemplates[currentTemplateIndex] = { ...newTemplates[currentTemplateIndex], placeholders: currentPlaceholders };
    setTemplates(newTemplates);
    setPlaceholderDialogOpen(false);
    setEditingPlaceholderIndex(null);
    toast({ title: 'Placeholder saved' });
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      for (const template of templates) {
        const file = templateFiles.get(template.id);
        if (file) {
          const fileName = `${Date.now()}_${file.name}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('templates')
            .upload(fileName, file);

          if (uploadError) throw uploadError;

          // Store the bucket-relative path, not a public URL - TemplateGenerationDialog.tsx
          // (and this module's own fetchTemplateFile) build the public URL themselves from
          // file_path + the 'templates' bucket, so a full URL here would double up.
          const { error: dbError } = await supabase
            .from('acc_portal_templates')
            .upsert({
              id: template.id,
              document_id: document.id,
              file_name: template.name,
              file_path: fileName,
              file_type: template.file_type,
              file_size: template.file_size,
              placeholders: template.placeholders,
              entity_types: template.entity_types,
              banks_associated: template.banks_associated,
              job_level: template.job_level,
              use_letterhead: template.use_letterhead ?? false,
              classification: template.classification ?? {}
            });

          if (dbError) throw dbError;
        } else if (template.content) {
          const { error: dbError } = await supabase
            .from('acc_portal_templates')
            .upsert({
              id: template.id,
              document_id: document.id,
              file_name: template.name,
              content: template.content,
              file_type: template.file_type,
              file_size: template.file_size,
              placeholders: template.placeholders,
              entity_types: template.entity_types,
              banks_associated: template.banks_associated,
              job_level: template.job_level,
              use_letterhead: template.use_letterhead ?? false,
              classification: template.classification ?? {}
            });

          if (dbError) throw dbError;
        } else if (template.file_path) {
          // Existing file-based template with no new file selected this session - without
          // this branch, edits to placeholders/metadata on an already-uploaded template
          // were silently dropped (neither the `file` nor `template.content` branch ran).
          const { error: dbError } = await supabase
            .from('acc_portal_templates')
            .upsert({
              id: template.id,
              document_id: document.id,
              file_name: template.name,
              file_path: template.file_path,
              file_type: template.file_type,
              file_size: template.file_size,
              placeholders: template.placeholders,
              entity_types: template.entity_types,
              banks_associated: template.banks_associated,
              job_level: template.job_level,
              use_letterhead: template.use_letterhead ?? false,
              classification: template.classification ?? {}
            });

          if (dbError) throw dbError;
        }
      }
      toast({ title: 'Templates saved successfully' });
      onTemplateUpdate();
      onClose();
    } catch (error) {
      console.error('Error saving templates:', error);
      toast({ title: 'Error saving templates', description: 'Please try again', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!currentTemplate?.file_path) return;

    try {
      // file_path is already the bucket-relative path (may include a subfolder like
      // "kyc-templates/...") - stripping it down to just the basename would look in the
      // bucket root and miss the file.
      const { data: fileData, error } = await supabase.storage
        .from('templates')
        .download(currentTemplate.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(fileData);
      if (typeof document !== 'undefined') {
        const a = document.createElement('a');
        a.href = url;
        a.download = currentTemplate.file_name || currentTemplate.file_path.split('/').pop() || 'template.docx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);

      toast({ title: 'Template downloaded successfully' });
    } catch (error) {
      console.error('Error downloading template:', error);
      toast({ title: 'Error downloading template', description: 'Please try again', variant: 'destructive' });
    }
  };

  const currentPlaceholder = editingPlaceholderIndex !== null && currentTemplate && currentTemplate.placeholders?.[editingPlaceholderIndex]
    ? currentTemplate.placeholders[editingPlaceholderIndex]
    : {
        id: crypto.randomUUID(),
        name: '',
        type: 'text' as const,
        required: true,
        entity_type: ['company' as EntityType],
        master_field_ids: [],
        linked_job_question_ids: [],
        linked_requirement_ids: []
      };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={cn("max-w-screen h-[90vh] p-0 overflow-hidden", className)}>
        <DialogHeader className="px-6 py-4 border-b bg-white">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-bold">Document Template Manager</DialogTitle>
              <DialogDescription>
                Manage templates for <span className="font-semibold">{document.display_name || document.name}</span>
              </DialogDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleRescanPlaceholders} disabled={!currentTemplate || isProcessing}>
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Re-scan
              </Button>
              <Button onClick={handleSaveAll} disabled={isSaving || templates.length === 0}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save All
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-2 px-6 py-2 border-b border-t">
          <View className="h-4 w-4 text-muted-foreground" />
          <Label className="mr-2">View Panels:</Label>
          <Button variant={panelsVisible.left ? 'secondary' : 'ghost'} size="sm" onClick={() => togglePanel('left')}>Templates</Button>
          <Button variant={panelsVisible.middle ? 'secondary' : 'ghost'} size="sm" onClick={() => togglePanel('middle')}>Editor</Button>
          <Button variant={panelsVisible.right ? 'secondary' : 'ghost'} size="sm" onClick={() => togglePanel('right')}>Placeholders</Button>
        </div>

        <div className="grid grid-cols-12 gap-6 py-4 flex-1 overflow-y-auto h-[calc(90vh-150px)]">
          {isLoadingTemplates ? (
            <div className="col-span-12 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading templates...</p>
              </div>
            </div>
          ) : (
            <>
              <div className={`${panelClasses.left} flex flex-col gap-6 h-full transition-all duration-300`}>
                <TemplateListPanel
                  templates={templates}
                  currentTemplateIndex={currentTemplateIndex}
                  onTemplateSelect={handleTemplateSelect}
                  onTemplateDelete={handleTemplateDelete}
                  onFileUpload={handleFileUpload}
                  onAddTextTemplate={handleAddTextTemplate}
                  isProcessing={isProcessing}
                  fileInputRef={fileInputRef}
                />
              </div>

          <div className={`${panelClasses.middle} h-full transition-all duration-300`}>
            <TemplateEditorPanel
              currentTemplate={currentTemplate}
              templateFiles={templateFiles}
              onTemplateNameChange={handleTemplateNameChange}
              onTemplateFieldChange={handleTemplateFieldChange}
              onClassificationFieldChange={handleClassificationFieldChange}
              onEditorChange={handleEditorChange}
              onEditorBlur={handleEditorBlur}
              onRescanPlaceholders={handleRescanPlaceholders}
              onManualRescan={handleManualRescan}
              onEntityTypeToggle={handleEntityTypeToggle}
              onClearEntityTypes={handleClearEntityTypes}
              onDownloadTemplate={handleDownloadTemplate}
              onToggleLetterhead={handleToggleLetterhead}
              isProcessing={isProcessing}
            />
          </div>

          <div className={`${panelClasses.right} h-full transition-all duration-300`}>
            <PlaceholderPanel
              placeholders={currentTemplate?.placeholders || []}
              placeholderSearch={placeholderSearch}
              onPlaceholderSearchChange={setPlaceholderSearch}
              onAddPlaceholder={handleAddPlaceholder}
              onEditPlaceholder={handleEditPlaceholder}
              onRemovePlaceholder={handleRemovePlaceholder}
              masterFields={masterFields}
              jobQuestions={jobQuestions}
              requirements={requirements}
              variant="table"
              showAddButton
            />
          </div>
            </>
          )}
        </div>

        <PlaceholderFormDialog
          isOpen={placeholderDialogOpen}
          onClose={() => {
            setPlaceholderDialogOpen(false);
            setEditingPlaceholderIndex(null);
          }}
          placeholder={currentPlaceholder}
          masterFields={masterFields}
          jobQuestions={jobQuestions}
          requirements={requirements}
          kycDocuments={kycDocuments}
          documentTypes={documentTypes}
          tables={tables}
          loadingTables={loadingTables}
          onSave={handleSavePlaceholder}
          onChange={(updates) => {
            if (editingPlaceholderIndex !== null && currentTemplateIndex !== null) {
              const newTemplates = [...templates];
              const currentPlaceholders = newTemplates[currentTemplateIndex].placeholders || [];
              currentPlaceholders[editingPlaceholderIndex] = { ...currentPlaceholders[editingPlaceholderIndex], ...updates };
              newTemplates[currentTemplateIndex] = { ...newTemplates[currentTemplateIndex], placeholders: currentPlaceholders };
              setTemplates(newTemplates);
            }
          }}
          isEditing={editingPlaceholderIndex !== null}
        />
      </DialogContent>
    </Dialog>
  );
}
