// @ts-nocheck
"use client";
import React, { useRef, useState, useEffect, useMemo } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
// --- MODIFICATION: Import Popover and Command for the Master Field Picker ---
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Loader2, PlusCircle, Trash2, FileText, Pencil, Save, RefreshCw, ChevronDown, Check, ChevronsUpDown, Link2, X, Search, View } from "lucide-react";
import { DocumentTemplate as BaseDocumentTemplate } from "./types";
import { TableHeader, Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import supabase from "@/lib/supabase/client";
import TemplateEditor from "@/components/TemplateEditor";
import { Textarea } from "@/components/ui/textarea";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import InspectModule from 'docxtemplater/js/inspect-module';

type EntityType = 'company' | 'principal' | 'director' | 'shareholder' | 'dependent' | 'employee';

// --- MODIFICATION: The entity_type field is now an array to support multi-select ---
interface DocumentTemplate extends BaseDocumentTemplate {
  content?: string;
  isDirty?: boolean;
  entity_types?: EntityType[]; // This is for the overall template
}

// --- MODIFICATION: JobField interface to hold master field data ---
interface JobField {
  id: number;
  field_key: string;
  label: string;
}

interface DocumentTemplateManagerProps {
  document: { id: string; name: string; display_name?: string; };
  initialTemplates?: DocumentTemplate[];
  isOpen: boolean;
  onClose: () => void;
  onTemplateUpdate: () => void;
  classId?: string;
}

const PLACEHOLDER_TYPES = [
  { value: 'text', label: 'Text' }, { value: 'date', label: 'Date' }, { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' }, { value: 'array', label: 'Array/List' }, { value: 'image', label: 'Image' },
];

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
    { value: 'company', label: 'Company' }, { value: 'principal', label: 'Principal' },
    { value: 'director', label: 'Director' }, { value: 'shareholder', label: 'Shareholder' },
    { value: 'dependent', label: 'Dependent' }, { value: 'employee', label: 'Employee' },
];

// --- MODIFICATION: Placeholder type now includes master_field_id and its own entity_type ---
type Placeholder = {
  id: string; name: string; description?: string; type: 'text' | 'number' | 'date' | 'select' | 'array';
  required: boolean; options?: string[];
  entity_type: EntityType; // Which entity this placeholder belongs to
  master_field_ids?: number[]; // Array of linked master field IDs
};

// --- MODIFICATION: Updated component for picking multiple master fields ---
function MasterFieldPicker({
  masterFields,
  selectedFieldIds = [],
  onSelect,
  onRemove,
  onClear,
}: {
  masterFields: JobField[];
  selectedFieldIds?: number[];
  onSelect: (fieldId: number) => void;
  onRemove: (fieldId: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedFields = useMemo(() =>
    masterFields.filter(f => selectedFieldIds.includes(f.id)),
  [masterFields, selectedFieldIds]);

  const filteredFields = useMemo(() => {
    if (!search) return masterFields;
    const searchLower = search.toLowerCase();
    return masterFields.filter(field =>
      field.label.toLowerCase().includes(searchLower) ||
      field.field_key.toLowerCase().includes(searchLower)
    );
  }, [masterFields, search]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
              <span className="truncate">
                {selectedFields.length > 0
                  ? `${selectedFields.length} field${selectedFields.length > 1 ? 's' : ''} selected`
                  : "Select master fields..."}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search master fields..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>No master fields found.</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {filteredFields.map((field) => {
                    const isSelected = selectedFieldIds.includes(field.id);
                    return (
                      <CommandItem
                        key={field.id}
                        value={field.label}
                        onSelect={() => {
                          if (isSelected) {
                            onRemove(field.id);
                          } else {
                            onSelect(field.id);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div>
                            <div className="font-medium">{field.label}</div>
                            <div className="text-xs text-muted-foreground">{field.field_key}</div>
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedFields.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {/* Selected fields chips */}
      {selectedFields.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedFields.map(field => (
            <Badge
              key={field.id}
              variant="secondary"
              className="flex items-center gap-1.5 pr-1.5"
            >
              <Link2 className="h-3 w-3" />
              <span className="max-w-[200px] truncate">{field.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(field.id);
                }}
                className="ml-1 rounded-full p-0.5 hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DocumentTemplateManager({ document, isOpen, onClose,initialTemplates, onTemplateUpdate, classId }: DocumentTemplateManagerProps) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [currentTemplateIndex, setCurrentTemplateIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaceholderFormOpen, setIsPlaceholderFormOpen] = useState(false);
  const [isEditingPlaceholder, setIsEditingPlaceholder] = useState<number | null>(null);
  // --- MODIFICATION: Default state for a new placeholder ---
  const [newPlaceholder, setNewPlaceholder] = useState<{
    name: string;
    description: string;
    type: 'text' | 'number' | 'date' | 'select' | 'array';
    required: boolean;
    entity_type: EntityType;
    master_field_ids?: number[];
    options?: string[];
  }>({
    name: '',
    description: '',
    type: 'text',
    required: true,
    entity_type: 'principal',
    master_field_ids: []
  });
  const [templateFiles, setTemplateFiles] = useState<Map<string, File>>(new Map());
  const [masterFields, setMasterFields] = useState<JobField[]>([]);
  const [placeholderSearch, setPlaceholderSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentTemplate = (currentTemplateIndex !== null && templates[currentTemplateIndex]) ? templates[currentTemplateIndex] : null;
  const masterFieldMap = useMemo(() => new Map(masterFields.map(f => [f.id, f.label])), [masterFields]);

  // --- MODIFICATION: State for managing horizontal panel visibility ---
  const [panelsVisible, setPanelsVisible] = useState({
    left: true,
    middle: true,
    right: true,
  });

  // --- MODIFICATION: Handler to toggle panel visibility, preventing the last panel from being hidden ---
  const togglePanel = (panel: 'left' | 'middle' | 'right') => {
    const currentlyVisibleCount = Object.values(panelsVisible).filter(Boolean).length;
    if (currentlyVisibleCount === 1 && panelsVisible[panel]) {
      toast({ title: "Cannot hide the last visible panel." });
      return;
    }
    setPanelsVisible(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  // --- MODIFICATION: useMemo hook to calculate dynamic grid classes based on panel visibility ---
  const panelClasses = useMemo(() => {
    const { left, middle, right } = panelsVisible;
    const visibleCount = [left, middle, right].filter(Boolean).length;

    if (visibleCount === 3) return { left: 'col-span-3', middle: 'col-span-5', right: 'col-span-4' };
    if (visibleCount === 2) {
      if (!left) return { left: 'hidden', middle: 'col-span-7', right: 'col-span-5' };
      if (!middle) return { left: 'hidden', middle: 'hidden', right: 'col-span-12' }; // Corrected logic
      if (!right) return { left: 'col-span-4', middle: 'col-span-8', right: 'hidden' };
    }
    if (visibleCount === 1) {
      if (left) return { left: 'col-span-12', middle: 'hidden', right: 'hidden' };
      if (middle) return { left: 'hidden', middle: 'col-span-12', right: 'hidden' };
      if (right) return { left: 'hidden', middle: 'hidden', right: 'col-span-12' };
    }
    // Fallback for no panels, though togglePanel prevents this
    return { left: 'hidden', middle: 'hidden', right: 'hidden' };
  }, [panelsVisible]);


  const filteredPlaceholders = useMemo(() => {
    if (!currentTemplate?.placeholders) return [];
    if (!placeholderSearch) return currentTemplate.placeholders;
    const searchLower = placeholderSearch.toLowerCase();
    return currentTemplate.placeholders.filter(p =>
      p.name.toLowerCase().includes(searchLower) ||
      p.type.toLowerCase().includes(searchLower) ||
      p.entity_type.toLowerCase().includes(searchLower) ||
      (p.master_field_ids || []).some(id =>
        masterFieldMap.get(id)?.toLowerCase().includes(searchLower)
      )
    );
  }, [currentTemplate?.placeholders, placeholderSearch, masterFieldMap]);

  // --- MODIFICATION: Fetch master fields when the dialog opens ---
  const fetchMasterFields = async () => {
    try {
      const { data, error } = await supabase.from('tm_job_fields').select('id, field_key, label').order('label');
      if (error) throw error;
      setMasterFields(data || []);
    } catch (error) {
      console.error('Error fetching master fields:', error);
      toast({ title: 'Could not load master fields', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMasterFields(); // Fetch master fields on open
      const initialData = initialTemplates?.map(t => ({
        ...t,
        name: t.file_name,
        entity_types: Array.isArray(t.entity_types) ? t.entity_types : []
      })) || [];
      setTemplates(initialData.map(t => ({ ...t, isDirty: false })));
      setCurrentTemplateIndex(initialData.length > 0 ? 0 : null);
    } else {
      setTemplates([]);
      setCurrentTemplateIndex(null);
    }
  }, [isOpen, initialTemplates]);

  const extractPlaceholders = async (source: { type: 'file', content: File } | { type: 'text', content: string }): Promise<string[]> => {
    // ... (no changes in this function)
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
              if (typeof window === 'undefined' || !source.content) return [];
              const parser = new DOMParser();
              const doc = parser.parseFromString(source.content, 'text/html');
              const textToParse = doc.body.textContent || '';
              const placeholderRegex = /\{+([^{}]+?)\}+/g;
              let match;
              while ((match = placeholderRegex.exec(textToParse)) !== null) {
                  if (match[1]) matches.add(match[1].trim());
              }
          }
          return Array.from(matches);
      } catch (error) {
          console.error('Error extracting placeholders:', error);
          toast({ title: 'Template Analysis Failed', description: 'Could not read placeholders.', variant: 'destructive' });
          return [];
      } finally {
          setIsProcessing(false);
      }
  };

  const autoGeneratePlaceholders = (extracted: string[]): Placeholder[] => extracted.map((name, index) => {
      const isImage = name.startsWith('%') && name.endsWith('%');
      const cleanName = isImage ? name.substring(1, name.length - 1) : name;
      return {
        id: `auto_${Date.now()}_${index}`,
        name: cleanName,
        description: ``,
        type: isImage ? 'image' : 'text',
        required: true,
        entity_type: 'principal',
        master_field_ids: []
      };
  });

  const mergePlaceholders = (existingPlaceholders: Placeholder[], extractedNames: string[]): Placeholder[] => {
      // ... (logic needs to be updated to preserve new fields)
      const existingMap = new Map(existingPlaceholders.map(p => [p.name, p]));
      const updatedPlaceholders: Placeholder[] = [];
      const processedNames = new Set<string>();
      for (const name of extractedNames) {
          const isImageTag = name.startsWith('%') && name.endsWith('%');
          const cleanName = isImageTag ? name.substring(1, name.length - 1) : name;
          if (processedNames.has(cleanName)) continue;
          const existingPlaceholder = existingMap.get(cleanName);
          if (existingPlaceholder) {
            updatedPlaceholders.push(existingPlaceholder);
          } else {
            updatedPlaceholders.push({
                id: `auto_${Date.now()}_${updatedPlaceholders.length}`,
                name: cleanName,
                description: '',
                type: isImageTag ? 'image' : 'text',
                required: true,
                entity_type: 'principal',
                master_field_id: undefined
            });
          }
          processedNames.add(cleanName);
      }
      return updatedPlaceholders;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // ... (no changes in this function)
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return toast({ title: 'Invalid file type', variant: 'destructive' });
    const extracted = await extractPlaceholders({ type: 'file', content: file });
    addNewFileTemplate(file, extracted);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addNewFileTemplate = (file: File, extractedPlaceholders: string[]) => {
    // ... (no changes in this function)
    const tempId = `temp_file_${Date.now()}`;
    const newTemplate: DocumentTemplate = {
      id: tempId, document_id: document.id,
      name: file.name.replace(/\.[^/.]+$/, ''),
      file_name: file.name, file_type: file.type, file_size: file.size,
      placeholders: autoGeneratePlaceholders(extractedPlaceholders),
      created_at: new Date().toISOString(),
      entity_types: [], // Default to an empty array
    };
    setTemplateFiles(prev => new Map(prev.set(tempId, file)));
    const updatedTemplates = [...templates, newTemplate];
    setTemplates(updatedTemplates);
    setCurrentTemplateIndex(updatedTemplates.length - 1);
    toast({ title: 'File Template Added', description: `Detected ${extractedPlaceholders.length} placeholders.` });
  };

  const addNewTextTemplate = () => {
    // ... (no changes in this function)
    const tempId = `temp_text_${Date.now()}`;
    const newTemplate: DocumentTemplate = {
      id: tempId, document_id: document.id,
      name: `New Text Template ${templates.filter(t => t.content !== undefined).length + 1}`,
      content: '<p>Start writing your template here...</p>', file_type: 'text/html',
      placeholders: [], created_at: new Date().toISOString(),
      entity_types: [], // Default to an empty array
    };
    const updatedTemplates = [...templates, newTemplate];
    setTemplates(updatedTemplates);
    setCurrentTemplateIndex(updatedTemplates.length - 1);
  };

  const handleEditorChange = (html: string) => {
    // ... (no changes in this function)
    if (currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    updatedTemplates[currentTemplateIndex].content = html;
    updatedTemplates[currentTemplateIndex].isDirty = true;
    setTemplates(updatedTemplates);
  };

  const handleTemplateNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // ... (no changes in this function)
    if (currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    updatedTemplates[currentTemplateIndex].name = e.target.value;
    setTemplates(updatedTemplates);
  };

  const handleEntityTypeToggle = (entityType: EntityType) => {
    // ... (no changes in this function)
    if (currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    const currentTypes = updatedTemplates[currentTemplateIndex].entity_types || [];
    const newTypes = currentTypes.includes(entityType)
      ? currentTypes.filter(et => et !== entityType)
      : [...currentTypes, entityType];
    updatedTemplates[currentTemplateIndex].entity_types = newTypes;
    setTemplates(updatedTemplates);
  };

  const handleRescanPlaceholders = async () => {
    // ... (no changes in this function)
    if (!currentTemplate || currentTemplate.content === undefined) return;
    const extracted = await extractPlaceholders({ type: 'text', content: currentTemplate.content });
    const updatedTemplates = [...templates];
    const existingPlaceholders = updatedTemplates[currentTemplateIndex].placeholders || [];
    updatedTemplates[currentTemplateIndex].placeholders = mergePlaceholders(existingPlaceholders, extracted);
    updatedTemplates[currentTemplateIndex].isDirty = false;
    setTemplates(updatedTemplates);
    toast({ title: 'Placeholders Updated', description: `Found ${extracted.length} placeholders.` });
  };

  const handleEditorBlur = () => { if (currentTemplate?.isDirty) handleRescanPlaceholders(); };

  const savePlaceholder = () => {
    // --- MODIFICATION: Save new placeholder fields ---
    if (!newPlaceholder.name.trim() || currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    const targetTemplate = updatedTemplates[currentTemplateIndex];
    const updatedPlaceholders = [...(targetTemplate.placeholders || [])];

    const placeholder: Placeholder = {
      id: isEditingPlaceholder !== null ? updatedPlaceholders[isEditingPlaceholder].id : `ph_${Date.now()}`,
      name: newPlaceholder.name.trim(),
      description: newPlaceholder.description.trim(),
      type: newPlaceholder.type,
      required: newPlaceholder.required,
      options: newPlaceholder.options,
      entity_type: newPlaceholder.entity_type,
      master_field_ids: Array.isArray(newPlaceholder.master_field_ids)
        ? [...newPlaceholder.master_field_ids]
        : [],
    };

    if (isEditingPlaceholder !== null) {
      updatedPlaceholders[isEditingPlaceholder] = placeholder;
    } else {
      updatedPlaceholders.push(placeholder);
    }

    targetTemplate.placeholders = updatedPlaceholders;
    setTemplates(updatedTemplates);
    setIsPlaceholderFormOpen(false);

    // Reset the form with proper default values
    setNewPlaceholder({
      name: '',
      description: '',
      type: 'text',
      required: true,
      entity_type: 'principal',
      master_field_ids: [],
      date_config: {
        useCurrentDate: true,
        format: 'YYYY-MM-DD'
      }
    });

    setIsEditingPlaceholder(null);
  };

  const editPlaceholder = (index: number) => {
    if (!currentTemplate || currentTemplateIndex === null) return;
    const placeholder = currentTemplate.placeholders?.[index];
    if (!placeholder) return;

    setNewPlaceholder({
      name: placeholder.name,
      description: placeholder.description || '',
      type: placeholder.type,
      required: placeholder.required,
      entity_type: placeholder.entity_type,
      master_field_ids: Array.isArray(placeholder.master_field_ids)
        ? [...placeholder.master_field_ids]
        : [],
      options: placeholder.options || [],
    });

    setIsEditingPlaceholder(index);
    setIsPlaceholderFormOpen(true);
  };

const removePlaceholder = (index: number) => {
  if (currentTemplateIndex === null) return;
  const updatedTemplates = [...templates];
  updatedTemplates[currentTemplateIndex].placeholders = updatedTemplates[currentTemplateIndex].placeholders?.filter((_, i) => i !== index);
  setTemplates(updatedTemplates);
};

  const uploadAndSaveAll = async () => {
    // --- MODIFICATION: The placeholders data will automatically include the new fields ---
    // No direct changes needed here, as the state already holds the correct structure.
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
          file_name: template.name, document_id: document.id, file_path: filePath,
          content: template.content, file_type: template.file_type, file_size: template.file_size,
          placeholders: template.placeholders || [], updated_at: new Date().toISOString(),
          created_by: user?.id, class_id: classId ? [classId] : undefined,
          entity_types: template.entity_types || [],
        };

        let error;
        if (template.id.startsWith('temp_')) {
          ({ error } = await supabase.from('acc_portal_templates').insert(templateData));
        } else {
          ({ error } = await supabase.from('acc_portal_templates').update(templateData).eq('id', template.id));
        }
        if (error) throw error;
      }
      await supabase.from('acc_portal_kyc').update({ has_template: templates.length > 0 }).eq('id', document.id);
      onTemplateUpdate();
      onClose();
      toast({ title: "Templates Saved Successfully" });
    } catch (error) {
      console.error('Error saving templates:', error);
      toast({ title: "Error Saving", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteTemplate = async (index: number) => {
    // ... (no changes in this function)
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

  const getTemplatePreviewUrl = (template: DocumentTemplate) => {
    // ... (no changes in this function)
    if (!template) return '';
    if (template.file_path) {
      const { data } = supabase.storage.from('templates').getPublicUrl(template.file_path);
      return `https://docs.google.com/gview?url=${data.publicUrl}&embedded=true`;
    }
    const file = templateFiles.get(template.id);
    if (file) {
      const blobUrl = URL.createObjectURL(file);
      return `https://docs.google.com/gview?url=${blobUrl}&embedded=true`;
    }
    return '';
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-screen h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Template Manager: {document.display_name || document.name}</DialogTitle>
            <DialogDescription>Create and manage templates by uploading a DOCX file or using the rich text editor.</DialogDescription>
          </DialogHeader>

          {/* --- MODIFICATION: Layout control toolbar --- */}
          <div className="flex items-center gap-2 px-6 py-2 border-b border-t">
            <View className="h-4 w-4 text-muted-foreground" />
            <Label className="mr-2">View Panels:</Label>
            <Button variant={panelsVisible.left ? 'secondary' : 'ghost'} size="sm" onClick={() => togglePanel('left')}>Templates</Button>
            <Button variant={panelsVisible.middle ? 'secondary' : 'ghost'} size="sm" onClick={() => togglePanel('middle')}>Editor</Button>
            <Button variant={panelsVisible.right ? 'secondary' : 'ghost'} size="sm" onClick={() => togglePanel('right')}>Placeholders</Button>
          </div>

          <div className="grid grid-cols-12 gap-6 py-4 flex-1 overflow-y-auto">
            {/* --- MODIFICATION: Left Panel with dynamic classes --- */}
            <div className={`${panelClasses.left} flex flex-col gap-6 h-full transition-all duration-300`}>
              <Card>
                <CardHeader><CardTitle className="text-lg">Add New Template</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2"><Label htmlFor="template-upload">Upload .docx File</Label><Input id="template-upload" type="file" accept=".docx" onChange={handleFileChange} disabled={isProcessing} ref={fileInputRef} /></div>
                  <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or</span></div></div>
                  <Button onClick={addNewTextTemplate} variant="outline" className="w-full"><PlusCircle className="mr-2 h-4 w-4" /> Create Text Template</Button>
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
                              <div className="flex items-center flex-wrap gap-1 mt-1">
                                {tpl.entity_types?.map(et => <Badge key={et} variant="secondary" className="capitalize">{et}</Badge>)}
                                <p className="text-xs text-muted-foreground">{tpl.placeholders?.length || 0} fields</p>
                              </div>
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

            {/* --- MODIFICATION: Middle Panel with dynamic classes --- */}
            <div className={`${panelClasses.middle} h-full transition-all duration-300`}>
              {currentTemplate ? (
                <Card className="h-full flex flex-col">
                  <CardHeader className="flex flex-row justify-between items-center">
                    <div><CardTitle>Template Editor</CardTitle><CardDescription>Edit the name, type, and content below.</CardDescription></div>
                    {currentTemplate.isDirty && (<Button size="sm" onClick={handleRescanPlaceholders}><RefreshCw className="mr-2 h-4 w-4" /> Re-scan</Button>)}
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label htmlFor="template-name">Template Name</Label><Input id="template-name" value={currentTemplate.name || ''} onChange={handleTemplateNameChange} /></div>
                        <div className="space-y-2"><Label htmlFor="entity-type">Template For</Label>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" className="w-full justify-between">
                                <span className="truncate pr-2">
                                  {currentTemplate.entity_types?.length > 0 ? currentTemplate.entity_types.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ') : "Select entities..."}
                                </span>
                                <ChevronDown className="h-4 w-4 opacity-50" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-[--radix-popover-trigger-width]">
                              {ENTITY_TYPES.map(t => (
                                <DropdownMenuCheckboxItem key={t.value} checked={currentTemplate.entity_types?.includes(t.value)} onCheckedChange={() => handleEntityTypeToggle(t.value)}>
                                  {t.label}
                                </DropdownMenuCheckboxItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                    </div>
                    <div className="space-y-2 flex-1 flex flex-col">
                      <Label>Content</Label>
                      {currentTemplate.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? (
                        <div className="w-full h-full border rounded-md"><iframe src={getTemplatePreviewUrl(currentTemplate)} className="w-full h-full" title={currentTemplate.name}></iframe></div>
                      ) : currentTemplate.content !== undefined ? (
                        <TemplateEditor key={currentTemplate.id} initialContent={currentTemplate.content} onChange={handleEditorChange} onBlur={handleEditorBlur} className="flex-1" />
                      ) : (
                        <div className="p-4 border rounded-md bg-muted text-center h-full flex items-center justify-center"><p className="text-sm text-muted-foreground">Content for .docx files cannot be edited here. <br /> Re-upload to make changes.</p></div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                 panelsVisible.middle && (
                  <div className="h-full flex items-center justify-center text-center border-2 border-dashed rounded-lg">
                    <div><h3 className="text-lg font-medium">No Template Selected</h3><p className="text-sm text-muted-foreground mt-1">Add or select a template to begin editing.</p></div>
                  </div>
                 )
              )}
            </div>

            {/* --- MODIFICATION: Right Panel with dynamic classes --- */}
            <div className={`${panelClasses.right} h-full transition-all duration-300`}>
             {panelsVisible.right && (
              <Card className="h-full flex flex-col">
                <CardHeader>
                  <div className="flex flex-row items-center justify-between">
                    <div><CardTitle>Placeholders</CardTitle><CardDescription>Fields for the selected template.</CardDescription></div>
                    <Button variant="outline" size="sm" onClick={() => setIsPlaceholderFormOpen(true)} disabled={!currentTemplate}><PlusCircle className="mr-2 h-4 w-4" /> Add</Button>
                  </div>
                  <div className="relative pt-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search placeholders..."
                      value={placeholderSearch}
                      onChange={(e) => setPlaceholderSearch(e.target.value)}
                      disabled={!currentTemplate || !currentTemplate.placeholders?.length}
                      className="pl-9"
                    />
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto min-h-[400px]">
                  {currentTemplate?.placeholders?.length > 0 ? (
                    filteredPlaceholders.length > 0 ? (
                      <Table className="border max-h-[calc(100vh - 300px)]">
                        <TableHeader className="bg-gray-100"><TableRow>
                          <TableHead className="border-r font-bold text-gray-700">Field</TableHead>
                          <TableHead className="border-r font-bold text-gray-700">Type</TableHead>
                          <TableHead className="border-r font-bold text-gray-700">Entity</TableHead>
                          <TableHead className="border-r font-bold text-gray-700">Linked Master Field</TableHead>
                          <TableHead className="text-right border-r font-bold text-gray-700">Actions</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {filteredPlaceholders.map((p) => {
                            const originalIndex = currentTemplate.placeholders.findIndex(orig => orig.id === p.id);
                            return (
                              <TableRow key={p.id}>
                                <TableCell className="border-r"><div className="font-mono text-sm font-medium">{`{${p.name}}`}</div></TableCell>
                                <TableCell className="border-r"><Badge variant="outline" className="capitalize">{p.type}</Badge></TableCell>
                                <TableCell className="border-r"><Badge variant="outline" className="capitalize">{p.entity_type}</Badge></TableCell>
                                <TableCell className="border-r">
                                  {p.master_field_ids && p.master_field_ids.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {p.master_field_ids.map((fieldId) => (
                                        <Badge key={fieldId} variant="secondary" className="font-normal">
                                          <Link2 className="h-3 w-3 mr-1"/>
                                          {masterFieldMap.get(fieldId) || `ID: ${fieldId}`}
                                        </Badge>
                                      ))}
                                    </div>
                                  ) : (
                                    <Badge variant="outline" className="font-normal text-muted-foreground">Not Linked</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editPlaceholder(originalIndex)}><Pencil className="h-3.5 w-3.5" /></Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removePlaceholder(originalIndex)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center p-6 h-full flex items-center justify-center"><p className="text-sm text-muted-foreground">No placeholders match your search.</p></div>
                    )
                  ) : ( <div className="text-center p-6 h-full flex items-center justify-center"><p className="text-sm text-muted-foreground">No placeholders found.</p></div>)}
                </CardContent>
              </Card>
             )}
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
          <DialogHeader>
            <DialogTitle>{isEditingPlaceholder !== null ? 'Edit' : 'Add'} Placeholder</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name (no spaces, e.g., client_name)</Label>
              <Input 
                id="name" 
                value={newPlaceholder.name} 
                onChange={(e) => setNewPlaceholder({ ...newPlaceholder, name: e.target.value.replace(/\s+/g, '_') })} 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea 
                id="description" 
                placeholder="A short description for this field" 
                value={newPlaceholder.description} 
                onChange={(e) => setNewPlaceholder({ ...newPlaceholder, description: e.target.value })} 
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select 
                  value={newPlaceholder.type} 
                  onValueChange={(v) => setNewPlaceholder({ ...newPlaceholder, type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLACEHOLDER_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Entity</Label>
                <Select 
                  value={newPlaceholder.entity_type} 
                  onValueChange={(v) => setNewPlaceholder({ ...newPlaceholder, entity_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {newPlaceholder.type === 'select' && (
              <div className="space-y-2">
                <Label>Options (one per line)</Label>
                <Textarea
                  placeholder="Option 1
Option 2
Option 3"
                  value={newPlaceholder.options?.join('\n') || ''}
                  onChange={(e) =>
                    setNewPlaceholder({
                      ...newPlaceholder,
                      options: e.target.value.split('\n').filter(Boolean),
                    })
                  }
                  rows={4}
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Link to Master Field (Optional)</Label>
              <MasterFieldPicker
                masterFields={masterFields}
                selectedFieldIds={newPlaceholder.master_field_ids || []}
                onSelect={(id) => setNewPlaceholder({
                  ...newPlaceholder,
                  master_field_ids: [...(newPlaceholder.master_field_ids || []), id]
                })}
                onRemove={(id) => setNewPlaceholder({
                  ...newPlaceholder,
                  master_field_ids: (newPlaceholder.master_field_ids || []).filter(fieldId => fieldId !== id)
                })}
                onClear={() => setNewPlaceholder({
                  ...newPlaceholder,
                  master_field_ids: []
                  })}
              />
            </div>
            <div className="flex items-center space-x-2 pt-2"><Checkbox id="required" checked={newPlaceholder.required} onCheckedChange={(c) => setNewPlaceholder({ ...newPlaceholder, required: !!c })} /><Label htmlFor="required">Required field</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsPlaceholderFormOpen(false)}>Cancel</Button><Button onClick={savePlaceholder} disabled={!newPlaceholder.name.trim()}>{isEditingPlaceholder !== null ? 'Update' : 'Add'} Placeholder</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}