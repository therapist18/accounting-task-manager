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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Loader2, PlusCircle, Trash2, FileText, Pencil, Save, RefreshCw, ChevronDown, Check, ChevronsUpDown, Link2, X, Search, View, Download, UserCog, Users, User, Code, Hash, Database, Sparkles } from "lucide-react";
import { DocxLivePreview } from "@/components/DocxLivePreview";
import { DocumentTemplate as BaseDocumentTemplate } from "./types";
import { TableHeader, Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import supabase from "@/lib/supabase/client";
import TemplateEditor from "@/components/TemplateEditor";
import { Textarea } from "@/components/ui/textarea";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import InspectModule from 'docxtemplater/js/inspect-module';
import { renderAsync } from "docx-preview";

type EntityType = 'company' | 'principal' | 'director' | 'shareholder' | 'dependent' | 'employee' | 'understudy';
const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');
interface DocumentTemplate extends BaseDocumentTemplate {
  content?: string;
  isDirty?: boolean;
  entity_types?: EntityType[];
}

interface JobField {
  id: number;
  field_key: string;
  label: string;
  sources?: Array<{
    path: string;
    table: string;
    priority: number;
    source_type?: string;
  }>;
}

const sanitizeClassName = (cls: string | undefined): string => {
  if (!cls) return '';
  return String(cls).replace(/\s+/g, ' ').trim();
};

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
  className?: string; // Add className to props
  selectedBank?: { bank_id: string; bank_name: string } | null;
}

const PLACEHOLDER_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
  { value: 'ordinal', label: 'Ordinal (1st, 2nd, 3rd...)' },
  { value: 'select', label: 'Dropdown' },
  { value: 'array', label: 'Array/List' },
  { value: 'conditional', label: 'Conditional' },
  { value: 'boolean', label: 'Boolean/Checkbox' },
  { value: 'image', label: 'Image' },
  { value: 'document_checklist', label: 'Document Checklist' }, // NEW
];

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'company', label: 'Company' }, { value: 'principal', label: 'Principal' },
  { value: 'director', label: 'Director' }, { value: 'shareholder', label: 'Shareholder' },
  { value: 'dependent', label: 'Dependent' }, { value: 'employee', label: 'Employee' },
  { value: 'understudy', label: 'Understudy' },
];

const DEPENDANT_RELATIONSHIPS = [
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'daughter', label: 'Daughter' },
  { value: 'son', label: 'Son' },
  { value: 'husband', label: 'Husband' },
  { value: 'wife', label: 'Wife' },
  { value: 'mother_in_law', label: 'Mother-in-law' },
  { value: 'father_in_law', label: 'Father-in-law' },
];

// Update the Placeholder type to handle hierarchy
type ConditionalCondition = {
  tag: string;           // e.g., 'child_kenyan_id_no'
  label: string;         // e.g., 'Kenyan ID No: '
  master_field_id?: number; // The specific master field for this condition
};

type BooleanCondition = {
  tag: string;              // e.g., 'is_male', 'daily_frequency'
  label: string;            // Display text: 'Male', 'Daily'
  master_field_id?: number; // Optional - for DB-driven fields
  comparison?: {            // For DB fields
    field: string;          // e.g., 'gender'
    operator: 'equals' | 'not_equals' | 'contains';
    value: string;          // e.g., 'Male'
  };
};

type Placeholder = {
  id: string;
  name: string;
  description?: string;
  type: 'text' | 'number' | 'date' | 'select' | 'array' | 'conditional' | 'image' | 'boolean' | 'ordinal' | 'document_checklist';
  array_direction?: 'horizontal' | 'vertical';
  boolean_conditions?: BooleanCondition[];
  boolean_type?: 'single' | 'multiple';
  required: boolean;
  options?: string[];
  entity_type: EntityType[];
  master_field_ids?: number[];
  parent_name?: string;
  is_block_start?: boolean;
  director_type?: 'all' | 'primary';
  dependant_relationship?: string[];
  conditions?: ConditionalCondition[];
  ordinal_format?: 'number' | 'word' | 'custom';
  custom_ordinal_format?: string;
  // NEW: Document checklist fields
  linked_document_ids?: string[];
  checklist_display_format?: 'bullets' | 'checkboxes' | 'table';
  // NEW: Data source configuration
  checklist_data_source?: {
    table: 'acc_portal_kyc_uploads' | 'acc_portal_directors_documents';
    linking_variable: string; // e.g., 'company_id', 'director_id', 'individual_id'
    document_id_field: string; // e.g., 'kyc_document_id', 'document_id'
  };
  // NEW: Image size properties
  image_width?: string;
  image_height?: string;
  is_ai_generated?: boolean;
  ai_prompt?: string;
};

const getCleanText = (str: string) => str.replace(/<[^>]+>/g, '');
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

export default function DocumentTemplateManager({
  document,
  isOpen,
  onClose,
  initialTemplates = [],
  onTemplateUpdate,
  jobLevel = null,
  selectedBank = null,
  className = ''
}: DocumentTemplateManagerProps) {
  const containerClassName = `document-template-manager ${sanitizeClassName(className)}`.trim();
  const safeJobLevel = useMemo(() => {
    if (!jobLevel) {
      return {
        level: 0,
        department_id: null,
        subdepartment_id: null,
        class_id: null,
        subclass_id: null
      };
    }
    return jobLevel;
  }, [jobLevel]);
  const { toast } = useToast();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [currentTemplateIndex, setCurrentTemplateIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaceholderFormOpen, setIsPlaceholderFormOpen] = useState(false);
  const [isEditingPlaceholder, setIsEditingPlaceholder] = useState<number | null>(null);
  const [newPlaceholder, setNewPlaceholder] = useState<Placeholder>({
    id: '',
    name: '',
    description: '',
    type: 'text',
    required: false,
    entity_type: [],
    array_direction: 'vertical',
    checklist_data_source: {
      table: 'acc_portal_kyc_uploads',
      linking_variable: 'company_id',
      document_id_field: 'kyc_document_id'
    },
    image_width: '',
    image_height: ''
  });
  const [directorType, setDirectorType] = useState<'all' | 'primary'>('all');
  const [dependantRelationship, setDependantRelationship] = useState<string[]>([]);
  const [templateFiles, setTemplateFiles] = useState<Map<string, File>>(new Map());
  const [masterFields, setMasterFields] = useState<JobField[]>([]);
  const [placeholderSearch, setPlaceholderSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentTemplate = (currentTemplateIndex !== null && templates[currentTemplateIndex]) ? templates[currentTemplateIndex] : null;
  const masterFieldMap = useMemo(() => new Map(masterFields.map(f => [f.id, f.label])), [masterFields]);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [showLinkPrompt, setShowLinkPrompt] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState<Array<{ id: string; display_name: string; name: string }>>([]);

  // Extract scalar fields from conditional template
  const extractScalarFields = (templateContent: string): string[] => {
    // Simple regex to match {#field_name} patterns
    const scalarFieldRegex = /\{#([^{}]+)\}/g;
    const fields: string[] = [];
    let match;

    console.log('[SCALAR FIELD DETECTION] Template content:', templateContent);
    console.log('[SCALAR FIELD DETECTION] Regex pattern:', scalarFieldRegex);

    while ((match = scalarFieldRegex.exec(templateContent)) !== null) {
      fields.push(match[1]); // Extracts field name between {# and }
      console.log('[SCALAR FIELD DETECTION] Found scalar field:', match[1]);
    }

    console.log('[SCALAR FIELD DETECTION] Extracted fields:', fields);
    return fields;
  };

  // Handle auto-linking of scalar fields to master fields
  const handleAutoLinkFields = async (scalarFields: string[]) => {
    const linkingPromises = scalarFields.map(async (fieldName) => {
      // Find existing master field
      const existingField = masterFields.find(f =>
        f.field_key === fieldName ||
        f.label.toLowerCase().includes(fieldName.toLowerCase())
      );

      if (existingField) {
        return { fieldName, masterFieldId: existingField.id, alreadyLinked: true };
      } else {
        // Create new master field prompt
        return { fieldName, masterFieldId: null, needsCreation: true };
      }
    });

    const linkingResults = await Promise.all(linkingPromises);

    // Process results
    const needsCreation = linkingResults.filter(r => r.needsCreation);
    const alreadyLinked = linkingResults.filter(r => r.alreadyLinked);

    if (needsCreation.length > 0) {
      const fieldsToCreate = needsCreation.map(r => r.fieldName).join(', ');
      toast({
        title: "Master Fields Required",
        description: `The following master fields need to be created:\n\n${fieldsToCreate}\n\nPlease create them in the Master Fields section first.`,
        variant: "destructive",
        duration: 8000,
        action: (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAutoLinkFields(scalarFields)}
            >
              Link All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLinkPrompt(false)}
            >
              Skip
            </Button>
          </div>
        ),
      });
      return;
    }

    if (alreadyLinked.length > 0) {
      const linkedFields = alreadyLinked.map(r => r.fieldName).join(', ');
      const masterFieldIds = alreadyLinked.map(r => r.masterFieldId).filter(id => id !== null);

      // Add the linked fields to the placeholder
      setNewPlaceholder(prev => ({
        ...prev,
        master_field_ids: [...(prev.master_field_ids || []), ...masterFieldIds]
      }));

      toast({
        title: "Fields Linked Successfully",
        description: `Successfully linked ${linkedFields} to existing master fields.`,
        duration: 3000,
      });
    }

    setShowLinkPrompt(false);
  };

  const [panelsVisible, setPanelsVisible] = useState({
    left: true,
    middle: true,
    right: true,
  });

  // Update the document preview effect
  useEffect(() => {
    const loadDocumentPreview = async () => {
      if (!currentTemplate?.file_path) {
        setDocPreviewUrl(null);
        return;
      }

      try {
        // Get the public URL for the file
        const { data: { publicUrl } } = supabase.storage
          .from('templates')
          .getPublicUrl(currentTemplate.file_path);

        // Use the public URL in the Office Online Viewer
        const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicUrl)}`;
        setDocPreviewUrl(viewerUrl);

      } catch (error) {
        console.error('Error loading document:', error);
        setDocPreviewUrl(null);
        toast({
          title: 'Preview Error',
          description: 'Could not load document preview. The file may not be accessible.',
          variant: 'destructive'
        });
      }
    };

    loadDocumentPreview();
  }, [currentTemplate?.file_path]);

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const { data, error } = await supabase
          .from('acc_portal_kyc')
          .select('id, name, display_name, category')
          .order('display_name');

        if (error) throw error;
        setAvailableDocuments(data || []);
      } catch (error) {
        console.error('Error fetching documents:', error);
        toast({
          title: 'Could not load documents',
          description: error.message,
          variant: 'destructive'
        });
      }
    };

    if (isOpen) {
      fetchDocuments();
    }
  }, [isOpen]);

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

    // Ensure no whitespace in class names
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
        left: getClass('hidden'),
        middle: getClass('hidden'),
        right: getClass('col-span-12')
      };
      if (!right) return {
        left: getClass('col-span-4'),
        middle: getClass('col-span-8'),
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


  const filteredPlaceholders = useMemo(() => {
    if (!currentTemplate?.placeholders) return [];
    if (!placeholderSearch) return currentTemplate.placeholders;
    const searchLower = placeholderSearch.toLowerCase();
    return currentTemplate.placeholders.filter(p =>
      p.name.toLowerCase().includes(searchLower) ||
      p.type.toLowerCase().includes(searchLower) ||
      (Array.isArray(p.entity_type) ? p.entity_type : [p.entity_type]).some(et => et?.toLowerCase().includes(searchLower)) ||
      (p.master_field_ids || []).some(id =>
        masterFieldMap.get(id)?.toLowerCase().includes(searchLower)
      )
    );
  }, [currentTemplate?.placeholders, placeholderSearch, masterFieldMap]);

  const fetchMasterFields = async () => {
    try {
      const { data, error } = await supabase.from('tm_job_fields').select('*').order('label');
      if (error) throw error;
      setMasterFields(data || []);
    } catch (error) {
      console.error('Error fetching master fields:', error);
      toast({ title: 'Could not load master fields', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMasterFields();
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

  const validateTemplate = async (file: File): Promise<boolean> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = new PizZip(arrayBuffer);

      // Check if the file contains the required document.xml
      const fileList = Object.keys(zip.files);
      const hasDocumentXml = fileList.some(file =>
        file.startsWith('word/document') && file.endsWith('.xml')
      );

      if (!hasDocumentXml) {
        throw new Error('The uploaded file is not a valid Word document (missing document.xml)');
      }

      return true;
    } catch (error) {
      console.error('Template validation failed:', error);
      return false;
    }
  };

  const extractPlaceholders = async (source: { type: 'file', content: File } | { type: 'text', content: string }): Promise<Placeholder[]> => {
    console.group(`%c[SCANNER] Target: ${source.type}`, "color: #2563eb; font-weight: bold;");
    setIsProcessing(true);

    try {
      let rawTextContent = "";

      if (source.type === 'file') {
        const arrayBuffer = await source.content.arrayBuffer();
        const zip = new PizZip(arrayBuffer);
        // Word stores main content in document.xml
        let xmlContent = zip.files['word/document.xml'].asText();

        // Check for additional content files (header.xml, footer.xml)
        let headerContent = '';
        let footerContent = '';

        console.log('[SCANNER] Available files in zip:', Object.keys(zip.files));

        // Word documents can have multiple headers/footers with numbers (header1.xml, header2.xml, etc.)
        const headerFiles = Object.keys(zip.files).filter(file => file.startsWith('word/header') && file.endsWith('.xml'));
        const footerFiles = Object.keys(zip.files).filter(file => file.startsWith('word/footer') && file.endsWith('.xml'));

        console.log('[SCANNER] Found header files:', headerFiles);
        console.log('[SCANNER] Found footer files:', footerFiles);

        // Combine all header files
        if (headerFiles.length > 0) {
          headerContent = headerFiles.map(file => zip.files[file].asText()).join('\n');
          console.log('[SCANNER] Header content found (first 200 chars):', headerContent.substring(0, 200));
        }

        // Combine all footer files
        if (footerFiles.length > 0) {
          footerContent = footerFiles.map(file => zip.files[file].asText()).join('\n');
          console.log('[SCANNER] Footer content found (first 200 chars):', footerContent.substring(0, 200));
        }

        // Combine all parts for complete text extraction
        if (headerContent) {
          xmlContent = headerContent + xmlContent;
          console.log('[SCANNER] Added header to content');
        }

        if (footerContent) {
          xmlContent = xmlContent + footerContent;
          console.log('[SCANNER] Added footer to content');
        }

        // 1. Strip XML tags. 
        // 2. IMPORTANT: Remove zero-width joiners/spaces that Word inserts between characters in tags
        rawTextContent = xmlContent
          .replace(/<[^>]+>/g, '')
          .replace(/[\u200B-\u200D\uFEFF]/g, '');

        console.log('[SCANNER] Combined XML Content (first 200 chars):', xmlContent.substring(0, 200));
        console.log('[SCANNER] Combined Raw Text Content (first 200 chars):', rawTextContent.substring(0, 200));
        console.log('[SCANNER] Raw text content length:', rawTextContent.length);
      } else {
        // Clean HTML from the editor
        rawTextContent = getCleanText(source.content).replace(/[\u200B-\u200D\uFEFF]/g, '');
      }

      const tagRegex = /\{([#\/%])?\s*([a-zA-Z0-9_]+)\s*\}/g;
      const sequences = new Map(); // To track em_1, em_2 groups

      const results: Placeholder[] = [];
      const blockStack: string[] = [];
      const processedTags = new Set<string>();

      let match;
      while ((match = tagRegex.exec(rawTextContent)) !== null) {
        const prefix = match[1]; // #, /, %
        const tagName = match[2];
        const currentParent = blockStack.length > 0 ? blockStack[blockStack.length - 1] : undefined;
        const contextKey = currentParent ? `${currentParent}_${tagName}` : tagName;

        if (!prefix) {
          // Check if this is a numbered sequence (e.g., em_1)
          const digitMatch = tagName.match(/^(.+)_(\d+)$/);
          if (digitMatch) {
            const groupName = digitMatch[1]; // "em"
            const index = parseInt(digitMatch[2]); // 1, 2, 3...

            if (!sequences.has(groupName)) {
              sequences.set(groupName, { max: index, count: 1 });
            } else {
              const seq = sequences.get(groupName);
              seq.max = Math.max(seq.max, index);
              seq.count++;
            }
            continue; // Skip individual processing for now
          }
        }

        if (prefix === '#') {
          console.log(`%c[ARRAY DETECTED] {#${tagName}}`, "color: #059669");
          blockStack.push(tagName);
          if (!processedTags.has(contextKey)) {
            // Check if this is a conditional block (starts with 'condition_')
            if (tagName.startsWith('condition_')) {
              const conditionName = tagName.replace('condition_', '');
              results.push({
                id: `block_${tagName}_${Date.now()}`,
                name: tagName,
                type: 'conditional',
                required: true,
                entity_type: ['company', 'principal', 'director', 'shareholder', 'dependent', 'employee'], // Conditional can apply to any entity
                is_block_start: true,
                description: `Conditional block: {#${tagName}}`
              });
            } else {
              // Regular array block - determine entity type
              let blockEntity: EntityType = (tagName.endsWith('s') ? tagName.slice(0, -1) : tagName) as EntityType;
              let blockRelationships: string[] = [];

              if (blockEntity === 'dependent') {
                const relationshipPrefixes = ['father', 'mother', 'daughter', 'son', 'husband', 'wife', 'mother_in_law', 'father_in_law'];
                const tagNameLower = tagName.toLowerCase();

                for (const prefix of relationshipPrefixes) {
                  if (tagNameLower.startsWith(prefix + '_')) {
                    blockRelationships = [prefix];
                    console.log(`[BLOCK RELATIONSHIP DETECTED] ${tagName} -> ${prefix} (dependent)`);
                    break;
                  }
                }
              }

              results.push({
                id: `block_${tagName}_${Date.now()}`,
                name: tagName,
                type: 'array',
                required: true,
                entity_type: blockEntity,
                ...(blockRelationships.length > 0 && { dependant_relationship: blockRelationships }),
                is_block_start: true,
                description: `Repeating section: {#${tagName}}`
              });
            }
            processedTags.add(contextKey);
          }
        }
        else if (prefix === '/') {
          blockStack.pop();
        }
        else {
          if (processedTags.has(contextKey)) continue;

          console.log(`[FIELD DETECTED] {${tagName}} ${currentParent ? `(Inside ${currentParent})` : '(Global)'}`);

          const { ids: matchingFieldIds, sourceType } = findMatchingMasterFields(tagName, masterFields);

          let inferredEntity: EntityType = 'principal';
          let inferredRelationships: string[] = [];

          if (currentParent) {
            // Priority 1: Map to plural parent (e.g. #directors -> director)
            inferredEntity = (currentParent.endsWith('s') ? currentParent.slice(0, -1) : currentParent) as EntityType;
          } else if (sourceType) {
            // Priority 2: Use DB metadata
            inferredEntity = sourceType as EntityType;
          } else {
            // Priority 3: Check for relationship prefixes in tag name
            const relationshipPrefixes = ['father', 'mother', 'daughter', 'son', 'husband', 'wife', 'mother_in_law', 'father_in_law'];
            const tagNameLower = tagName.toLowerCase();

            for (const prefix of relationshipPrefixes) {
              if (tagNameLower.startsWith(prefix + '_')) {
                inferredEntity = 'dependent';
                inferredRelationships = [prefix];
                console.log(`[RELATIONSHIP DETECTED] ${tagName} -> ${prefix} (dependent)`);
                break;
              }
            }
          }

          results.push({
            id: `ph_${tagName}_${Date.now()}`,
            name: tagName,
            parent_name: currentParent,
            type: prefix === '%' ? 'image' : 'text',
            required: true,
            entity_type: inferredEntity,
            master_field_ids: matchingFieldIds,
            ...(inferredRelationships.length > 0 && { dependant_relationship: inferredRelationships }),
            description: currentParent ? `Inside ${currentParent}` : ''
          });
          processedTags.add(contextKey);
        }
      }
      sequences.forEach((data, groupName) => {
        // Only treat as a sequence if we found more than 1 (e.g., em_1 and em_2)
        if (data.count > 1) {
          results.push({
            id: `seq_${groupName}_${Date.now()}`,
            name: groupName,
            type: 'text', // Generator will handle splitting
            is_digit_split: true, // Custom flag
            digit_count: data.max,
            required: true,
            entity_type: 'company', // Default
            description: `Grouped Sequence (${groupName}_1 to ${groupName}_${data.max})`
          });
        }
      })
      console.groupEnd();
      return results;
    } catch (err) {
      console.error("[SCANNER] Error:", err);
      console.groupEnd();
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Word File Upload Handler
   */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Logic fix: calling unified extractor
      const extractedPlaceholders = await extractPlaceholders({ type: 'file', content: file });

      const tempId = `temp_file_${Date.now()}`;
      const newTemplate: DocumentTemplate = {
        id: tempId,
        document_id: document.id,
        name: file.name.replace(/\.[^/.]+$/, ''),
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        placeholders: extractedPlaceholders,
        created_at: new Date().toISOString(),
        entity_types: [],
      };

      setTemplateFiles(prev => new Map(prev.set(tempId, file)));
      setTemplates(prev => [...prev, newTemplate]);
      setCurrentTemplateIndex(templates.length);

      toast({
        title: "File Uploaded",
        description: `Successfully detected ${extractedPlaceholders.length} tags.`
      });
    } catch (error) {
      toast({ title: 'Error processing file', description: error.message, variant: 'destructive' });
    }
  };

  /**
   * Manual Editor Rescan Handler
   */
  const handleRescanPlaceholders = async () => {
    if (!currentTemplate || currentTemplateIndex === null) return;

    // Check if we scan the editor text or the file
    const source = currentTemplate.content
      ? { type: 'text', content: currentTemplate.content }
      : { type: 'file', content: templateFiles.get(currentTemplate.id)! };

    if (source.type === 'file' && !source.content) {
      toast({ title: "No source file found to rescan" });
      return;
    }

    const updatedPlaceholders = await extractPlaceholders(source);

    const updatedTemplates = [...templates];
    updatedTemplates[currentTemplateIndex].placeholders = updatedPlaceholders;
    updatedTemplates[currentTemplateIndex].isDirty = false;
    setTemplates(updatedTemplates);

    toast({ title: "Rescan Complete", description: `Updated ${updatedPlaceholders.length} fields.` });
  };

  const findMatchingMasterFields = (placeholderName: string, masterFields: JobField[]): { ids: number[], sourceType?: string } => {
    if (!placeholderName || !masterFields.length) return { ids: [] };

    const normalizedPlaceholder = placeholderName.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

    const matches = masterFields.filter(field => {
      const normalizedLabel = field.label.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      const normalizedKey = field.field_key.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

      const isMatch = (
        normalizedPlaceholder === normalizedLabel ||
        normalizedPlaceholder === normalizedKey ||
        normalizedPlaceholder.includes(normalizedLabel) ||
        normalizedLabel.includes(normalizedPlaceholder)
      );

      if (isMatch) console.log(`  -> Match Found: "${field.label}" (${field.field_key})`);
      return isMatch;
    });

    // Determine the most likely entity type based on master field sources
    const sourceTypes = matches.flatMap(field =>
      Array.isArray(field.sources) ? field.sources.map(s => s.source_type).filter(Boolean) : []
    );

    const mostCommonSource = sourceTypes.sort((a, b) =>
      sourceTypes.filter(v => v === a).length - sourceTypes.filter(v => v === b).length
    ).pop();

    return {
      ids: matches.map(field => field.id),
      sourceType: mostCommonSource
    };
  };


  const renderPlaceholderRows = () => {
    if (!currentTemplate?.placeholders) return null;

    const filtered = currentTemplate.placeholders.filter(p =>
      p.name.toLowerCase().includes(placeholderSearch.toLowerCase())
    );

    return filtered.map((p) => {
      const isChild = !!p.parent_name;
      const isBlock = p.is_block_start;
      const originalIndex = currentTemplate.placeholders.findIndex(orig => orig.id === p.id);

      return (
        <TableRow
          key={p.id}
          className={cn(
            isChild && "bg-muted/10 hover:bg-muted/20",
            isBlock && "bg-blue-50/40 hover:bg-blue-50/60"
          )}
        >
          <TableCell className="border-r">
            <div className="flex items-center gap-2 font-mono text-sm">
              <FileText className="h-3.5 w-3.5" />
              <span>{p.is_digit_split ? `${p.name}_[1-${p.digit_count}]` : `{${p.name}}`}</span>
              {p.is_digit_split && <Badge className="bg-orange-500">DIGIT SPLIT</Badge>}
            </div>
          </TableCell>
          <TableCell className="border-r">
            <div className={cn(
              "flex items-center gap-2 font-mono text-sm",
              isChild && "pl-8 border-l-2 border-blue-200 ml-2"
            )}>
              {isBlock ? (
                <Badge className="bg-blue-600 hover:bg-blue-700 h-5 px-1.5 text-[10px]">BLOCK</Badge>
              ) : isChild ? (
                <Link2 className="h-3 w-3 text-blue-400" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className={cn(isBlock && "font-bold text-blue-800")}>
                {isBlock ? `{#${p.name}}` : `{${p.name}}`}
              </span>
            </div>
          </TableCell>

          <TableCell className="border-r">
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="capitalize text-[10px]">
                {p.type}
              </Badge>
              {p.type === 'boolean' && p.boolean_type && (
                <Badge variant="secondary" className="text-[8px] bg-purple-100 text-purple-700">
                  {p.boolean_type === 'single' ? 'Radio' : 'Multi'}
                </Badge>
              )}
              {p.type === 'boolean' && p.boolean_conditions?.length > 0 && (
                <Badge variant="outline" className="text-[8px]">
                  {p.boolean_conditions.length} opts
                </Badge>
              )}
              {p.type === 'array' && (
                <Badge className="text-[8px] bg-orange-100 text-orange-700 hover:bg-orange-100">
                  {p.array_direction === 'horizontal' ? '→ Horizontal' : '↓ Vertical'}
                </Badge>
              )}
            </div>
          </TableCell>

          <TableCell className="border-r">
            <Badge variant="secondary" className={cn("capitalize text-[10px]", isChild && "bg-blue-100 text-blue-700")}>
              {p.entity_type}
            </Badge>
          </TableCell>

          <TableCell className="border-r">
            {p.type === 'document_checklist' && p.linked_document_ids?.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {p.linked_document_ids.slice(0, 3).map(docId => {
                  const doc = availableDocuments.find(d => d.id === docId);
                  return (
                    <Badge key={docId} variant="outline" className="text-[9px] bg-purple-50 text-purple-700">
                      {doc?.display_name || doc?.name || 'Doc'}
                    </Badge>
                  );
                })}
                {p.linked_document_ids.length > 3 && (
                  <Badge variant="outline" className="text-[9px]">
                    +{p.linked_document_ids.length - 3}
                  </Badge>
                )}
              </div>
            ) : p.type === 'boolean' && p.boolean_conditions?.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {p.boolean_conditions.slice(0, 3).map((cond) => (
                  <Badge key={`${p.id}-${cond.tag}`} variant="outline" className="text-[9px] bg-purple-50 text-purple-700">
                    {cond.label}
                  </Badge>
                ))}
                {p.boolean_conditions.length > 3 && (
                  <Badge variant="outline" className="text-[9px]">
                    +{p.boolean_conditions.length - 3}
                  </Badge>
                )}
              </div>
            ) : p.master_field_ids?.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {p.master_field_ids.map(id => (
                  <Badge key={id} variant="outline" className="text-[9px] bg-white">
                    {masterFieldMap.get(id) || id}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground italic">Not Linked</span>
            )}
          </TableCell>

          <TableCell className="border-r">
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="capitalize text-[10px]">
                {p.type}
              </Badge>
              {p.is_ai_generated && (
                <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[8px] h-4">
                  AI
                </Badge>
              )}
              {p.type === 'image' && (p.image_width || p.image_height) && (
                <Badge variant="secondary" className="text-[8px] bg-green-100 text-green-700">
                  {p.image_width || 'auto'} × {p.image_height || 'auto'}
                </Badge>
              )}
            </div>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editPlaceholder(originalIndex)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePlaceholder(originalIndex)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      );
    });
  };


  // Update the autoGeneratePlaceholders function to use source_type from master fields and detect array placeholders
  const autoGeneratePlaceholders = (extracted: string[], masterFields: JobField[] = []): Placeholder[] => {
    // First, identify array placeholders (they typically appear in the format "director" from "{#directors}")
    const arrayPlaceholders = extracted.filter(name =>
      name.endsWith('s') && // Simple heuristic: array names are often plural
      extracted.includes(name.slice(0, -1)) // Check if singular form exists
    );

    return extracted.map((name, index) => {
      const isImage = name.startsWith('%') && name.endsWith('%');
      const cleanName = isImage ? name.substring(1, name.length - 1) : name;
      const isArray = arrayPlaceholders.includes(name) ||
        (name.endsWith('s') && extracted.includes(name.slice(0, -1)));

      // Find matching master fields and get source type
      const { ids: matchingFieldIds, sourceType } = findMatchingMasterFields(cleanName, masterFields);

      return {
        id: `auto_${Date.now()}_${index}`,
        name: cleanName,
        description: matchingFieldIds.length > 0
          ? `Auto-linked to ${matchingFieldIds.length} field(s)`
          : isArray ? 'Array placeholder' : '',
        type: isImage ? 'image' : isArray ? 'array' : 'text',
        required: true,
        entity_type: (sourceType as EntityType) || 'principal', // Use source_type from master field or default to 'principal'
        master_field_ids: matchingFieldIds
      };
    });
  };

  // Update the mergePlaceholders function to use source_type from master fields and handle array placeholders
  const mergePlaceholders = (
    existingPlaceholders: Placeholder[],
    extractedNames: string[],
    masterFields: JobField[] = []
  ): Placeholder[] => {
    const existingMap = new Map(existingPlaceholders.map(p => [p.name, p]));
    const updatedPlaceholders: Placeholder[] = [];
    const processedNames = new Set<string>();

    // First, identify array placeholders
    const arrayPlaceholders = extractedNames.filter(name =>
      name.endsWith('s') && // Simple heuristic: array names are often plural
      extractedNames.includes(name.slice(0, -1)) // Check if singular form exists
    );

    for (const name of extractedNames) {
      const isImageTag = name.startsWith('%') && name.endsWith('%');
      const cleanName = isImageTag ? name.substring(1, name.length - 1) : name;

      // Check if this is an array placeholder
      const isArray = arrayPlaceholders.includes(name) ||
        (name.endsWith('s') && extractedNames.includes(name.slice(0, -1)));

      if (processedNames.has(cleanName)) continue;

      const existingPlaceholder = existingMap.get(cleanName);
      if (existingPlaceholder) {
        // Preserve existing placeholder but update the type if it's now detected as an array
        if (isArray && existingPlaceholder.type !== 'array') {
          updatedPlaceholders.push({
            ...existingPlaceholder,
            type: 'array',
            description: existingPlaceholder.description || 'Array placeholder'
          });
        } else {
          updatedPlaceholders.push(existingPlaceholder);
        }
      } else {
        // Find matching master fields and get source type
        const { ids: matchingFieldIds, sourceType } = findMatchingMasterFields(cleanName, masterFields);

        updatedPlaceholders.push({
          id: `auto_${Date.now()}_${updatedPlaceholders.length}`,
          name: cleanName,
          description: matchingFieldIds.length > 0
            ? `Auto-linked to ${matchingFieldIds.length} field(s)`
            : isArray ? 'Array placeholder' : '',
          type: isImageTag ? 'image' : isArray ? 'array' : 'text',
          required: true,
          entity_type: (sourceType as EntityType) || 'principal', // Use source_type from master field or default to 'principal'
          master_field_ids: matchingFieldIds
        });
      }
      processedNames.add(cleanName);
    }

    return updatedPlaceholders;
  };

  // Update the addNewFileTemplate function to accept masterFields
  const addNewFileTemplate = (file: File, extractedPlaceholders: string[], masterFields: JobField[] = []) => {
    const tempId = `temp_file_${Date.now()}`;
    const newTemplate: DocumentTemplate = {
      id: tempId,
      document_id: document.id,
      name: file.name.replace(/\.[^/.]+$/, ''),
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      placeholders: autoGeneratePlaceholders(extractedPlaceholders, masterFields),
      created_at: new Date().toISOString(),
      entity_types: [],
    };
    setTemplateFiles(prev => new Map(prev.set(tempId, file)));
    const updatedTemplates = [...templates, newTemplate];
    setTemplates(updatedTemplates);
    setCurrentTemplateIndex(updatedTemplates.length - 1);
    toast({
      title: 'File Template Added',
      description: `Detected ${extractedPlaceholders.length} placeholders. ${newTemplate.placeholders.filter(p => p.master_field_ids?.length).length
        } placeholders were automatically linked to master fields.`
    });
  };

  const addNewTextTemplate = () => {
    const tempId = `temp_text_${Date.now()}`;
    const newTemplate: DocumentTemplate = {
      id: tempId, document_id: document.id,
      name: `New Text Template ${templates.filter(t => t.content !== undefined).length + 1}`,
      content: '<p>Start writing your template here...</p>', file_type: 'text/html',
      placeholders: [], created_at: new Date().toISOString(),
      entity_types: [],
    };
    const updatedTemplates = [...templates, newTemplate];
    setTemplates(updatedTemplates);
    setCurrentTemplateIndex(updatedTemplates.length - 1);
  };

  const handleEditorChange = (content: { html: string; header?: string; footer?: string } | string) => {
    if (currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    // Handle both string (legacy) and object (new) formats
    if (typeof content === 'string') {
      updatedTemplates[currentTemplateIndex].content = content;
    } else {
      // Combine header, main content, and footer with proper separation
      const { html, header = '', footer = '' } = content;
      updatedTemplates[currentTemplateIndex].content = [
        header ? `<header>${header}</header>` : '',
        html,
        footer ? `<footer>${footer}</footer>` : ''
      ].join('\n\n');
    }
    updatedTemplates[currentTemplateIndex].isDirty = true;
    setTemplates(updatedTemplates);
  };

  const handleTemplateNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    updatedTemplates[currentTemplateIndex].name = e.target.value;
    setTemplates(updatedTemplates);
  };

  // Set default entity types for new placeholders
  useEffect(() => {
    if (currentTemplateIndex === null) return;

    const currentTemplate = templates[currentTemplateIndex];
    const entityTypes = currentTemplate.entity_types || [];

    // Only set default entity type for new placeholders if we have entity types defined
    if (entityTypes.length > 0) {
      const updatedTemplates = [...templates];
      const placeholders = [...(currentTemplate.placeholders || [])];
      let needsUpdate = false;

      // Only update placeholders that don't have an entity_type set
      const updatedPlaceholders = placeholders.map(p => {
        if (!p.entity_type) {
          needsUpdate = true;
          return {
            ...p,
            entity_type: entityTypes[0] // Set to first allowed entity type
          };
        }
        return p;
      });

      if (needsUpdate) {
        updatedTemplates[currentTemplateIndex] = {
          ...currentTemplate,
          placeholders: updatedPlaceholders
        };
        setTemplates(updatedTemplates);
      }
    }
  }, [currentTemplateIndex, templates, templates[currentTemplateIndex]?.entity_types]);

  const handleEntityTypeToggle = (entityType: EntityType) => {
    if (currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    const currentTypes = updatedTemplates[currentTemplateIndex].entity_types || [];
    const newTypes = currentTypes.includes(entityType)
      ? currentTypes.filter(et => et !== entityType)
      : [...currentTypes, entityType];
    updatedTemplates[currentTemplateIndex].entity_types = newTypes;
    setTemplates(updatedTemplates);
  };

  const handleEditorBlur = () => { if (currentTemplate?.isDirty) handleRescanPlaceholders(); };

  const savePlaceholder = () => {
    if (!newPlaceholder.name.trim()) return;

    const processedOptions = newPlaceholder.type === 'conditional'
      ? (newPlaceholder.conditions || []).map(c => `{#${c.tag}}${c.label}{${c.tag}}{/${c.tag}}`)
      : newPlaceholder.options;

    const placeholderToSave = {
      ...newPlaceholder,
      id: newPlaceholder.id || `placeholder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      is_ai_generated: newPlaceholder.is_ai_generated || false,
      ai_prompt: newPlaceholder.ai_prompt || '',
      options: processedOptions,
      entity_type: Array.isArray(newPlaceholder.entity_type)
        ? newPlaceholder.entity_type
        : newPlaceholder.entity_type ? [newPlaceholder.entity_type] : [],
      ...(newPlaceholder.entity_type?.includes('director') && { director_type: directorType }),
      ...(newPlaceholder.entity_type?.includes('dependent') && { dependant_relationship: dependantRelationship }),
      ...(newPlaceholder.type === 'boolean' && {
        boolean_conditions: newPlaceholder.boolean_conditions || [],
        boolean_type: newPlaceholder.boolean_type || 'single'
      }),
      ...(newPlaceholder.type === 'document_checklist' && {
        linked_document_ids: newPlaceholder.linked_document_ids || [],
        checklist_display_format: newPlaceholder.checklist_display_format || 'checkboxes',
        checklist_data_source: newPlaceholder.checklist_data_source || {
          table: 'acc_portal_kyc_uploads',
          linking_variable: 'company_id',
          document_id_field: 'kyc_document_id'
        }
      })
    };

    if (isEditingPlaceholder !== null) {
      const updatedTemplates = [...templates];
      const targetTemplate = updatedTemplates[currentTemplateIndex];
      const updatedPlaceholders = [...(targetTemplate.placeholders || [])];
      updatedPlaceholders[isEditingPlaceholder] = placeholderToSave;
      targetTemplate.placeholders = updatedPlaceholders;
      setTemplates(updatedTemplates);
    } else {
      const updatedTemplates = [...templates];
      const targetTemplate = updatedTemplates[currentTemplateIndex];
      const updatedPlaceholders = [...(targetTemplate.placeholders || [])];
      updatedPlaceholders.push(placeholderToSave);
      targetTemplate.placeholders = updatedPlaceholders;
      setTemplates(updatedTemplates);
    }

    setIsPlaceholderFormOpen(false);

    setNewPlaceholder({
      id: '',
      name: '',
      description: '',
      type: 'text',
      required: false,
      entity_type: [],
      conditions: [],
      boolean_conditions: [],
      boolean_type: 'single',
      array_direction: 'vertical',
      image_width: '',
      image_height: ''
    });

    setDirectorType('all');
    setDependantRelationship([]);
    setAvailableFields([]);
    setIsEditingPlaceholder(null);
  };

  const editPlaceholder = (index: number) => {
    if (!currentTemplate || currentTemplateIndex === null) return;
    const placeholder = currentTemplate.placeholders?.[index];
    if (!placeholder) return;

    // Ensure entity_type is always an array
    setNewPlaceholder({
      ...placeholder,
      entity_type: Array.isArray(placeholder.entity_type)
        ? placeholder.entity_type
        : placeholder.entity_type ? [placeholder.entity_type] : [],
      conditions: placeholder.conditions || [],
      boolean_conditions: placeholder.boolean_conditions || [],
      boolean_type: placeholder.boolean_type || 'single',
      is_ai_generated: placeholder.is_ai_generated || false, // Add this
      ai_prompt: placeholder.ai_prompt || '',
    });

    // Set director type if applicable
    if (placeholder.entity_type?.includes('director') && placeholder.director_type) {
      setDirectorType(placeholder.director_type as 'all' | 'primary');
    } else {
      setDirectorType('all');
    }

    // Set dependant relationship if applicable
    if (placeholder.entity_type?.includes('dependent') && placeholder.dependant_relationship) {
      setDependantRelationship(Array.isArray(placeholder.dependant_relationship) ? placeholder.dependant_relationship : []);
    } else {
      setDependantRelationship([]);
    }

    setIsEditingPlaceholder(index);
    setIsPlaceholderFormOpen(true);
  };

  const removePlaceholder = (index: number) => {
    if (currentTemplateIndex === null) return;
    const updatedTemplates = [...templates];
    updatedTemplates[currentTemplateIndex].placeholders = updatedTemplates[currentTemplateIndex].placeholders?.filter((_, i) => i !== index);
    setTemplates(updatedTemplates);
  };

  // Conditional builder functions
  const addCondition = () => {
    const newCondition: ConditionalCondition = {
      field: '',
      operator: 'exists',
      master_field_ids: [],
      value: ''
    };
    setNewPlaceholder(prev => ({
      ...prev,
      conditions: [...(prev.conditions || []), newCondition]
    }));
  };

  const updateCondition = (index: number, field: keyof ConditionalCondition, value: any) => {
    setNewPlaceholder(prev => {
      const updatedConditions = [...(prev.conditions || [])];
      updatedConditions[index] = {
        ...updatedConditions[index],
        [field]: value
      };
      return {
        ...prev,
        conditions: updatedConditions
      };
    });
  };

  const removeCondition = (index: number) => {
    setNewPlaceholder(prev => {
      const updatedConditions = [...(prev.conditions || [])];
      updatedConditions.splice(index, 1);
      return {
        ...prev,
        conditions: updatedConditions
      };
    });
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

        // --- MODIFICATION: Use job_level instead of class_id in the payload ---
        const templateData = {
          file_name: template.name,
          document_id: document.id,
          file_path: filePath,
          content: template.content,
          file_type: template.file_type,
          file_size: template.file_size,
          placeholders: template.placeholders || [],
          updated_at: new Date().toISOString(),
          created_by: user?.id,
          banks_associated: selectedBank ? [selectedBank] : [],
          job_level: jobLevel ? [jobLevel] : [],
          entity_types: template.entity_types || [],
        };

        let error;
        if (template.id.startsWith('temp_')) {
          ({ error } = await supabase.from('acc_portal_templates').insert(templateData));
        } else {
          // Exclude created_by from update if you don't want to change ownership
          const { created_by, ...updateData } = templateData;
          ({ error } = await supabase.from('acc_portal_templates').update(updateData).eq('id', template.id));
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
    if (!template) return '';
    if (template.file_path) {
      const { data } = supabase.storage.from('templates').getPublicUrl(template.file_path);
      return data.publicUrl;
    }
    const file = templateFiles.get(template.id);
    if (file) {
      const blobUrl = URL.createObjectURL(file);
      return blobUrl;
    }
    return '';
  };

  const handleDownload = async () => {
    if (!currentTemplate?.file_path) return;

    try {
      const { data, error } = await supabase.storage
        .from('templates')
        .download(currentTemplate.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentTemplate.file_name || 'document.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: 'Download Failed',
        description: 'Could not download the document. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Add this function for manual rescan with enhanced detection
  const handleManualRescan = async () => {
    if (!currentTemplate) return;

    try {
      setIsProcessing(true);

      // Use enhanced extractPlaceholders function that includes header/footer support
      let extracted: Placeholder[] = [];

      // If it's a file template, extract from file (includes header/footer)
      if (currentTemplate.file_name && templateFiles.has(currentTemplate.id)) {
        const file = templateFiles.get(currentTemplate.id);
        if (file) {
          extracted = await extractPlaceholders({ type: 'file', content: file });
        }
      } else {
        // Extract from editor content
        extracted = await extractPlaceholders({ type: 'text', content: currentTemplate.content || '' });
      }

      // Update placeholders in template with the extracted ones
      const updatedTemplates = [...templates];
      const existingPlaceholders = updatedTemplates[currentTemplateIndex].placeholders || [];

      updatedTemplates[currentTemplateIndex].placeholders = mergePlaceholders(
        existingPlaceholders,
        extracted,
        masterFields
      );

      updatedTemplates[currentTemplateIndex].isDirty = false;
      setTemplates(updatedTemplates);

      const linkedCount = updatedTemplates[currentTemplateIndex].placeholders
        .filter(p => p.master_field_ids?.length).length;

      toast({
        title: 'Manual Rescan Complete',
        description: `Found ${extracted.length} placeholders including header/footer. ${linkedCount} were automatically linked to master fields.`,
        variant: 'default'
      });

    } catch (error) {
      console.error('Error during manual rescan:', error);
      toast({
        title: 'Rescan Error',
        description: error instanceof Error ? error.message : 'Failed to rescan placeholders',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className={`max-w-screen h-[90vh] flex flex-col ${containerClassName}`}>
          <DialogHeader>
            <DialogTitle>Template Manager: {document.display_name || document.name}</DialogTitle>
            <DialogDescription>Create and manage templates by uploading a DOCX file or using the rich text editor.</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 px-6 py-2 border-b border-t">
            <View className="h-4 w-4 text-muted-foreground" />
            <Label className="mr-2">View Panels:</Label>
            <Button variant={panelsVisible.left ? 'secondary' : 'ghost'} size="sm" onClick={() => togglePanel('left')}>Templates</Button>
            <Button variant={panelsVisible.middle ? 'secondary' : 'ghost'} size="sm" onClick={() => togglePanel('middle')}>Editor</Button>
            <Button variant={panelsVisible.right ? 'secondary' : 'ghost'} size="sm" onClick={() => togglePanel('right')}>Placeholders</Button>
          </div>

          <div className="grid grid-cols-12 gap-6 py-4 flex-1 overflow-y-auto">
            {/* Left Panel */}
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

            {/* Middle Panel */}
            <div className={`${panelClasses.middle} h-full transition-all duration-300`}>
              {currentTemplate ? (
                <Card className="h-full flex flex-col">
                  <CardHeader className="flex flex-row justify-between items-center">
                    <div><CardTitle>Template Editor</CardTitle><CardDescription>Edit the name, type, and content below.</CardDescription></div>
                    {currentTemplate.isDirty && (<Button size="sm" onClick={handleRescanPlaceholders}><RefreshCw className="mr-2 h-4 w-4" /> Re-scan</Button>)}
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-4">
                    <div className="grid grid-cols-3 flex gap-4">
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
                      <div className="flex flex-col items-center justify-between"><Label htmlFor="entity-type"></Label>
                        {currentTemplate.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDownload}
                            className="ml-2"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleManualRescan}
                          disabled={isProcessing || currentTemplateIndex === null}
                          className="ml-2"
                        >
                          {isProcessing ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Manual Rescan
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2 flex-1 flex flex-col">
                      <Label>Content</Label>
                      {currentTemplate.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? (
                        <div className="w-full h-full border rounded-md overflow-hidden">
                          {docPreviewUrl ? (
                            <iframe
                              src={docPreviewUrl || ''}
                              className="w-full h-full border-0"
                              frameBorder="0"
                              title="Document Preview"
                              onError={(e) => {
                                console.error('Error loading document preview:', e);
                                setDocPreviewUrl(null);
                                toast({
                                  title: 'Preview Error',
                                  description: 'Could not load document preview. The file may not be accessible or the format is not supported.',
                                  variant: 'destructive'
                                });
                              }}
                            />
                          ) : templateFiles.get(currentTemplate.id) ? (
                            <div className="w-full h-full border rounded-md flex items-center justify-center">
                              <div className="text-center p-6">
                                <FileText className="h-12 w-12 mx-auto text-green-500 mb-3" />
                                <p className="text-sm font-medium text-gray-700">Word Document Uploaded</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {templateFiles.get(currentTemplate.id)?.name || 'Document ready for processing'}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <div className="text-center p-4">
                                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                                <p className="text-sm text-gray-500">No document available</p>
                                <p className="text-xs text-gray-400 mt-1">Upload a document to see preview</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <TemplateEditor
                          key={currentTemplate.id}
                          initialContent={currentTemplate.content || ''}
                          onChange={handleEditorChange}
                          onBlur={handleEditorBlur}
                          className="flex-1"
                        />
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

            {/* Right Panel */}
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
                              const isChild = !!p.parent_name;
                              const isBlock = p.is_block_start;
                              const originalIndex = currentTemplate.placeholders.findIndex(orig => orig.id === p.id);

                              return (
                                <TableRow
                                  key={p.id}
                                  className={cn(
                                    isChild && "bg-muted/10 hover:bg-muted/20",
                                    isBlock && "bg-blue-50/40 hover:bg-blue-50/60"
                                  )}
                                >
                                  <TableCell className="border-r">
                                    <div className={cn(
                                      "flex items-center gap-2 font-mono text-sm",
                                      isChild && "pl-8 border-l-2 border-blue-200 ml-2"
                                    )}>
                                      {isBlock ? (
                                        <Badge className="bg-blue-600 hover:bg-blue-700 h-5 px-1.5 text-[10px]">ARRAY</Badge>
                                      ) : isChild ? (
                                        <Link2 className="h-3 w-3 text-blue-400" />
                                      ) : (
                                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                      )}
                                      <span className={cn(isBlock && "font-bold text-blue-800")}>
                                        {isBlock ? `{#${p.name}}` : `{${p.name}}`}
                                      </span>
                                    </div>
                                  </TableCell>

                                  <TableCell className="border-r">
                                    <Badge variant="outline" className="capitalize text-[10px]">
                                      {p.type}
                                    </Badge>
                                  </TableCell>

                                  <TableCell className="border-r">
                                    <Badge
                                      variant="secondary"
                                      className={cn(
                                        "capitalize text-[10px]",
                                        isChild && "bg-blue-100 text-blue-700"
                                      )}
                                    >
                                      {p.entity_type}
                                    </Badge>
                                  </TableCell>

                                  <TableCell className="border-r">
                                    {p.master_field_ids?.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {p.master_field_ids.map(id => (
                                          <Badge key={id} variant="outline" className="text-[9px] bg-white">
                                            {masterFieldMap.get(id) || id}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground italic">Not Linked</span>
                                    )}
                                  </TableCell>

                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editPlaceholder(originalIndex)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePlaceholder(originalIndex)}>
                                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                      </Button>
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
                    ) : (<div className="text-center p-6 h-full flex items-center justify-center"><p className="text-sm text-muted-foreground">No placeholders found.</p></div>)}
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
                <div className="flex items-center justify-between">
                  <Label>Entity</Label>
                  {newPlaceholder.entity_type?.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-muted-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNewPlaceholder(prev => ({
                          ...prev,
                          entity_type: []
                        }));
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between"
                      >
                        {newPlaceholder.entity_type && newPlaceholder.entity_type.length > 0
                          ? newPlaceholder.entity_type
                            .map(et => ENTITY_TYPES.find(t => t.value === et)?.label || et)
                            .join(', ')
                          : 'Select entities...'}
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search entities..." />
                        <CommandList>
                          <CommandGroup className="max-h-[300px] overflow-y-auto">
                            {ENTITY_TYPES.map((type) => {
                              const isSelected = newPlaceholder.entity_type?.some(et => et === type.value);
                              return (
                                <CommandItem
                                  key={type.value}
                                  onSelect={() => {
                                    setNewPlaceholder(prev => ({
                                      ...prev,
                                      entity_type: isSelected
                                        ? prev.entity_type.filter(et => et !== type.value)
                                        : [...prev.entity_type, type.value]
                                    }));
                                  }}
                                  className="cursor-pointer"
                                >
                                  <div className="flex items-center">
                                    <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                                      {isSelected && <Check className="h-3 w-3" />}
                                    </div>
                                    <span>{type.label}</span>
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
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

            {newPlaceholder.type === 'conditional' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="space-y-0.5">
                    <Label className="text-base">Logic Blocks</Label>
                    <p className="text-xs text-muted-foreground">
                      Define sections that only appear if data exists.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newCond: ConditionalCondition = { tag: '', label: '' };
                      setNewPlaceholder(prev => ({
                        ...prev,
                        conditions: [...(prev.conditions || []), newCond]
                      }));
                    }}
                  >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add Logic Block
                  </Button>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {(newPlaceholder.conditions || []).length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/20">
                      <Code className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">No logic blocks added yet.</p>
                    </div>
                  )}

                  {(newPlaceholder.conditions || []).map((cond) => (
                    <div key={`${cond.tag}-${cond.master_field_id || 'no-master'}`} className="relative p-4 rounded-lg border bg-card shadow-sm space-y-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-destructive text-white hover:bg-destructive/90"
                        onClick={() => {
                          const updated = [...(newPlaceholder.conditions || [])];
                          const condIndex = updated.findIndex(c => c.tag === cond.tag);
                          if (condIndex > -1) {
                            updated.splice(condIndex, 1);
                          }
                          setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                            Variable Tag (e.g. child_id)
                          </Label>
                          <Input
                            placeholder="tag_name"
                            value={cond.tag}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\s+/g, '_').toLowerCase();
                              const updated = [...(newPlaceholder.conditions || [])];
                              updated[idx].tag = val;
                              setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                            }}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                            Display Prefix (e.g. ID No:)
                          </Label>
                          <Input
                            placeholder="Label text..."
                            value={cond.label}
                            onChange={(e) => {
                              const updated = [...(newPlaceholder.conditions || [])];
                              updated[idx].label = e.target.value;
                              setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                            }}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                          Link to Master Field
                        </Label>
                        <MasterFieldPicker
                          masterFields={masterFields}
                          selectedFieldIds={cond.master_field_id ? [cond.master_field_id] : []}
                          onSelect={(fieldId) => {
                            const updated = [...(newPlaceholder.conditions || [])];
                            updated[idx].master_field_id = fieldId;
                            setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                          }}
                          onRemove={() => {
                            const updated = [...(newPlaceholder.conditions || [])];
                            delete updated[idx].master_field_id;
                            setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                          }}
                          onClear={() => {
                            const updated = [...(newPlaceholder.conditions || [])];
                            delete updated[idx].master_field_id;
                            setNewPlaceholder(prev => ({ ...prev, conditions: updated }));
                          }}
                        />
                      </div>

                      <div className="pt-1 border-t">
                        <code className="text-[10px] text-blue-600">
                          Preview: {"{#"}{cond.tag || '...'}{"}"}{cond.label || ''}{"{"}{cond.tag || '...'}{"}"}{"{/"}{cond.tag || '...'}{"}"}
                        </code>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {newPlaceholder.type === 'boolean' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="space-y-0.5">
                    <Label className="text-base">Boolean Options</Label>
                    <p className="text-xs text-muted-foreground">
                      Create checkbox/radio options. Link to DB field for auto-population or leave unlinked for user input.
                    </p>
                  </div>
                  <Select
                    value={newPlaceholder.boolean_type || 'single'}
                    onValueChange={(v) => setNewPlaceholder(prev => ({ ...prev, boolean_type: v }))}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Radio (One)</SelectItem>
                      <SelectItem value="multiple">Checkboxes (Many)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newCond: BooleanCondition = { tag: '', label: '' };
                    setNewPlaceholder(prev => ({
                      ...prev,
                      boolean_conditions: [...(prev.boolean_conditions || []), newCond]
                    }));
                  }}
                >
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Add Option
                </Button>

                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {(newPlaceholder.boolean_conditions || []).map((cond) => (
                    <div key={`${cond.tag}-${cond.master_field_id || 'no-master'}`} className="relative p-4 rounded-lg border bg-card shadow-sm space-y-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-white border shadow-sm text-red-500 hover:bg-red-50"
                        onClick={() => {
                          const updated = [...(newPlaceholder.boolean_conditions || [])];
                          const condIndex = updated.findIndex(c => c.tag === cond.tag);
                          if (condIndex > -1) {
                            updated.splice(condIndex, 1);
                          }
                          setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                            Variable Tag (e.g., is_male)
                          </Label>
                          <Input
                            placeholder="tag_name"
                            value={cond.tag}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\s+/g, '_').toLowerCase();
                              const updated = [...(newPlaceholder.boolean_conditions || [])];
                              updated[idx].tag = val;
                              setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                            }}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                            Display Label (e.g., Male)
                          </Label>
                          <Input
                            placeholder="Label text..."
                            value={cond.label}
                            onChange={(e) => {
                              const updated = [...(newPlaceholder.boolean_conditions || [])];
                              updated[idx].label = e.target.value;
                              setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                            }}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-2">
                          Link to Master Field (Optional)
                          <Badge variant="outline" className="text-[8px]">Leave empty for user input</Badge>
                        </Label>
                        <MasterFieldPicker
                          masterFields={masterFields}
                          selectedFieldIds={cond.master_field_id ? [cond.master_field_id] : []}
                          onSelect={(fieldId) => {
                            const updated = [...(newPlaceholder.boolean_conditions || [])];
                            updated[idx].master_field_id = fieldId;
                            setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                          }}
                          onRemove={() => {
                            const updated = [...(newPlaceholder.boolean_conditions || [])];
                            delete updated[idx].master_field_id;
                            setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                          }}
                          onClear={() => {
                            const updated = [...(newPlaceholder.boolean_conditions || [])];
                            delete updated[idx].master_field_id;
                            setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                          }}
                        />
                      </div>

                      {cond.master_field_id && (
                        <div className="space-y-2 p-3 bg-blue-50 rounded border border-blue-200">
                          <Label className="text-[10px] font-bold text-blue-800">Comparison Rule</Label>
                          <div className="grid grid-cols-3 gap-2">
                            <Select
                              value={cond.comparison?.operator || 'equals'}
                              onValueChange={(v) => {
                                const updated = [...(newPlaceholder.boolean_conditions || [])];
                                updated[idx].comparison = {
                                  ...updated[idx].comparison,
                                  operator: v,
                                  field: updated[idx].comparison?.field || '',
                                  value: updated[idx].comparison?.value || ''
                                };
                                setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="equals">Equals</SelectItem>
                                <SelectItem value="not_equals">Not Equals</SelectItem>
                                <SelectItem value="contains">Contains</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Expected value"
                              value={cond.comparison?.value || ''}
                              onChange={(e) => {
                                const updated = [...(newPlaceholder.boolean_conditions || [])];
                                updated[idx].comparison = {
                                  ...updated[idx].comparison,
                                  operator: updated[idx].comparison?.operator || 'equals',
                                  field: updated[idx].comparison?.field || '',
                                  value: e.target.value
                                };
                                setNewPlaceholder(prev => ({ ...prev, boolean_conditions: updated }));
                              }}
                              className="h-7 text-xs col-span-2"
                            />
                          </div>
                        </div>
                      )}

                      <div className="pt-1 border-t">
                        <code className="text-[10px] text-blue-600">
                          Preview: {cond.label || '...'} {"{"}
                          {cond.master_field_id ? `#${cond.tag}` : cond.tag}
                          {"}"}
                        </code>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {newPlaceholder.type === 'array' && (
              <div className="space-y-3 p-4 rounded-lg bg-orange-50 border border-orange-200 shadow-sm">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-orange-600" />
                    <h4 className="font-medium text-orange-800">Array Direction</h4>
                  </div>
                  <p className="text-xs text-orange-700 pl-7">
                    Specify how the repeating data should flow in the document.
                  </p>
                </div>
                <Select
                  value={newPlaceholder.array_direction || 'vertical'}
                  onValueChange={(v: 'horizontal' | 'vertical') =>
                    setNewPlaceholder({ ...newPlaceholder, array_direction: v })
                  }
                >
                  <SelectTrigger className="bg-white border-orange-200">
                    <SelectValue placeholder="Select direction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vertical">
                      <div className="flex flex-col">
                        <span className="font-medium">Vertical (Default)</span>
                        <span className="text-[10px] text-muted-foreground">Repeats as new rows or paragraphs</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="horizontal">
                      <div className="flex flex-col">
                        <span className="font-medium">Horizontal</span>
                        <span className="text-[10px] text-muted-foreground">Repeats across columns in a single row</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {newPlaceholder.type === 'ordinal' && (
              <div className="space-y-3 p-4 rounded-lg bg-purple-50 border border-purple-200 shadow-sm">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Hash className="h-5 w-5 text-purple-600" />
                    <h4 className="font-medium text-purple-800">Ordinal Format</h4>
                  </div>
                  <p className="text-xs text-purple-700 pl-7">
                    Choose how ordinal numbers should be displayed in the array.
                  </p>
                </div>
                <Select
                  value={newPlaceholder.ordinal_format || 'number'}
                  onValueChange={(v: 'number' | 'word' | 'custom') =>
                    setNewPlaceholder({ ...newPlaceholder, ordinal_format: v })
                  }
                >
                  <SelectTrigger className="bg-white border-purple-200">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="number">
                      <div className="flex flex-col">
                        <span className="font-medium">Numbers (1st, 2nd, 3rd...)</span>
                        <span className="text-[10px] text-muted-foreground">Uses numeric ordinals</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="word">
                      <div className="flex flex-col">
                        <span className="font-medium">Words (First, Second, Third...)</span>
                        <span className="text-[10px] text-muted-foreground">Uses written ordinals</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="custom">
                      <div className="flex flex-col">
                        <span className="font-medium">Custom Format</span>
                        <span className="text-[10px] text-muted-foreground">Define your own format (e.g., 1., 2., 3.)</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <div className="p-2 bg-white rounded border border-purple-200">
                  <code className="text-xs text-purple-700">
                    Preview: {newPlaceholder.ordinal_format === 'word' ? 'First, Second, Third...' :
                      newPlaceholder.ordinal_format === 'custom' ?
                        (newPlaceholder.custom_ordinal_format ? `1${newPlaceholder.custom_ordinal_format}, 2${newPlaceholder.custom_ordinal_format}, 3${newPlaceholder.custom_ordinal_format}...` : '1., 2., 3....') :
                        '1st, 2nd, 3rd...'}
                  </code>
                </div>
                {newPlaceholder.ordinal_format === 'custom' && (
                  <div className="space-y-2">
                    <Label htmlFor="custom-format" className="text-sm font-medium text-purple-800">
                      Custom Format Pattern
                    </Label>
                    <Input
                      id="custom-format"
                      placeholder="Enter format (e.g., '.', ')', '. ')"
                      value={newPlaceholder.custom_ordinal_format || ''}
                      onChange={(e) => setNewPlaceholder({ ...newPlaceholder, custom_ordinal_format: e.target.value })}
                      className="bg-white border-purple-200"
                    />
                    <p className="text-xs text-purple-700">
                      Enter the suffix to add after each number. Examples: "." for "1., 2., 3.", ")" for "1), 2), 3)", ". " for "1. , 2. , 3. "
                    </p>
                  </div>
                )}
              </div>
            )}

            {newPlaceholder.type === 'document_checklist' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="space-y-0.5">
                    <Label className="text-base">Document Checklist</Label>
                    <p className="text-xs text-muted-foreground">
                      Select documents to track. Documents will be auto-checked when found.
                    </p>
                  </div>
                  <Select
                    value={newPlaceholder.checklist_display_format || 'checkboxes'}
                    onValueChange={(v: 'bullets' | 'checkboxes' | 'table') =>
                      setNewPlaceholder(prev => ({
                        ...prev,
                        checklist_display_format: v
                      }))
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checkboxes">☑ Checkboxes</SelectItem>
                      <SelectItem value="bullets">• Bullets</SelectItem>
                      <SelectItem value="table">📋 Table</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Linked Documents</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between"
                      >
                        {(newPlaceholder.linked_document_ids?.length || 0) > 0
                          ? `${newPlaceholder.linked_document_ids.length} document(s) selected`
                          : 'Select documents...'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search documents..." />
                        <CommandList>
                          <CommandEmpty>No documents found.</CommandEmpty>
                          <CommandGroup className="max-h-[300px] overflow-y-auto">
                            {availableDocuments.map((doc) => {
                              const isSelected = newPlaceholder.linked_document_ids?.includes(doc.id);
                              return (
                                <CommandItem
                                  key={doc.id}
                                  onSelect={() => {
                                    setNewPlaceholder(prev => ({
                                      ...prev,
                                      linked_document_ids: isSelected
                                        ? (prev.linked_document_ids || []).filter(id => id !== doc.id)
                                        : [...(prev.linked_document_ids || []), doc.id]
                                    }));
                                  }}
                                  className="cursor-pointer"
                                >
                                  <div className="flex items-center">
                                    <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'
                                      }`}>
                                      {isSelected && <Check className="h-3 w-3" />}
                                    </div>
                                    <div>
                                      <div className="font-medium">{doc.display_name || doc.name}</div>
                                      <div className="text-xs text-muted-foreground capitalize">{doc.category}</div>
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

                  {(newPlaceholder.linked_document_ids?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {newPlaceholder.linked_document_ids.map(docId => {
                        const doc = availableDocuments.find(d => d.id === docId);
                        return (
                          <Badge
                            key={docId}
                            variant="secondary"
                            className="flex items-center gap-1.5 pr-1.5"
                          >
                            <FileText className="h-3 w-3" />
                            <span className="max-w-[200px] truncate">
                              {doc?.display_name || doc?.name || docId}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNewPlaceholder(prev => ({
                                  ...prev,
                                  linked_document_ids: (prev.linked_document_ids || []).filter(id => id !== docId)
                                }));
                              }}
                              className="ml-1 rounded-full p-0.5 hover:bg-muted"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-3 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-purple-600" />
                    <h4 className="font-semibold text-purple-900">Data Source Configuration</h4>
                  </div>
                  <p className="text-xs text-purple-700">
                    Specify where to fetch document upload records from
                  </p>

                  <div className="grid grid-cols-3 gap-3">
                    {/* Table Selection */}
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-purple-800">Table</Label>
                      <Select
                        value={newPlaceholder.checklist_data_source?.table || 'acc_portal_kyc_uploads'}
                        onValueChange={(v: 'acc_portal_kyc_uploads' | 'acc_portal_directors_documents') =>
                          setNewPlaceholder(prev => ({
                            ...prev,
                            checklist_data_source: {
                              table: v,
                              linking_variable: prev.checklist_data_source?.linking_variable || 'company_id',
                              document_id_field: prev.checklist_data_source?.document_id_field || 'kyc_document_id'
                            }
                          }))
                        }
                      >
                        <SelectTrigger className="bg-white border-purple-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="acc_portal_kyc_uploads">
                            <div className="flex flex-col">
                              <span className="font-medium">KYC Uploads</span>
                              <span className="text-xs text-muted-foreground">acc_portal_kyc_uploads</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="acc_portal_directors_documents">
                            <div className="flex flex-col">
                              <span className="font-medium">Directors Documents</span>
                              <span className="text-xs text-muted-foreground">acc_portal_directors_documents</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Linking Variable */}
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-purple-800">Linking Variable</Label>
                      <Input
                        placeholder="company_id"
                        value={newPlaceholder.checklist_data_source?.linking_variable || ''}
                        onChange={(e) =>
                          setNewPlaceholder(prev => ({
                            ...prev,
                            checklist_data_source: {
                              table: prev.checklist_data_source?.table || 'acc_portal_kyc_uploads',
                              linking_variable: e.target.value,
                              document_id_field: prev.checklist_data_source?.document_id_field || 'kyc_document_id'
                            }
                          }))
                        }
                        className="bg-white border-purple-200 text-xs"
                      />
                      <p className="text-[10px] text-purple-600">
                        e.g., company_id, director_id, individual_id
                      </p>
                    </div>

                    {/* Document ID Field */}
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-purple-800">Document ID Field</Label>
                      <Input
                        placeholder="kyc_document_id"
                        value={newPlaceholder.checklist_data_source?.document_id_field || ''}
                        onChange={(e) =>
                          setNewPlaceholder(prev => ({
                            ...prev,
                            checklist_data_source: {
                              table: prev.checklist_data_source?.table || 'acc_portal_kyc_uploads',
                              linking_variable: prev.checklist_data_source?.linking_variable || 'company_id',
                              document_id_field: e.target.value
                            }
                          }))
                        }
                        className="bg-white border-purple-200 text-xs"
                      />
                      <p className="text-[10px] text-purple-600">
                        e.g., kyc_document_id, document_id
                      </p>
                    </div>
                  </div>

                  {/* Preview of Configuration */}
                  <div className="p-2 bg-white rounded border border-purple-200">
                    <code className="text-[10px] text-purple-800">
                      SELECT * FROM {newPlaceholder.checklist_data_source?.table || 'acc_portal_kyc_uploads'}<br />
                      WHERE {newPlaceholder.checklist_data_source?.linking_variable || 'company_id'} = entity_id<br />
                      AND {newPlaceholder.checklist_data_source?.document_id_field || 'kyc_document_id'} IN (selected_docs)
                    </code>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <p className="text-xs text-blue-800">
                    <strong>How it works:</strong> When generating the document, the system will check if these documents exist for the selected entity. Found documents will be marked as checked (☑), missing documents as unchecked (☐).
                  </p>
                </div>
              </div>
            )}

            {newPlaceholder.type === 'image' && (
              <div className="space-y-4 p-4 rounded-lg bg-green-50 border border-green-200 shadow-sm">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <View className="h-5 w-5 text-green-600" />
                    <h4 className="font-medium text-green-800">Image Size Configuration</h4>
                  </div>
                  <p className="text-xs text-green-700 pl-7">
                    Specify the dimensions for the image placeholder. Leave empty for auto-size.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="image-width" className="text-sm font-medium text-green-800">
                      Width
                    </Label>
                    <Input
                      id="image-width"
                      placeholder="e.g., 200px, 50%, 10cm"
                      value={newPlaceholder.image_width || ''}
                      onChange={(e) => setNewPlaceholder({ ...newPlaceholder, image_width: e.target.value })}
                      className="bg-white border-green-200"
                    />
                    <p className="text-xs text-green-600">
                      Enter width with unit (px, %, cm, in)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="image-height" className="text-sm font-medium text-green-800">
                      Height
                    </Label>
                    <Input
                      id="image-height"
                      placeholder="e.g., 150px, auto, 5cm"
                      value={newPlaceholder.image_height || ''}
                      onChange={(e) => setNewPlaceholder({ ...newPlaceholder, image_height: e.target.value })}
                      className="bg-white border-green-200"
                    />
                    <p className="text-xs text-green-600">
                      Enter height with unit (px, %, cm, in) or "auto"
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-white rounded border border-green-200">
                  <p className="text-xs text-green-800">
                    <strong>Examples:</strong><br />
                    • Fixed size: <code>200px</code> × <code>150px</code><br />
                    • Responsive: <code>100%</code> × <code>auto</code><br />
                    • Print: <code>5cm</code> × <code>3cm</code><br />
                    • Mixed: <code>300px</code> × <code>auto</code>
                  </p>
                </div>
              </div>
            )}

            {/* Debug logging */}
            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
              Debug: entity_type = {JSON.stringify(newPlaceholder.entity_type)}
            </div>

            {(newPlaceholder.entity_type || []).includes('director') && (
              <div className="space-y-3 p-4 rounded-lg bg-blue-50 border border-blue-200 shadow-sm">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <UserCog className="h-5 w-5 text-blue-600" />
                    <h4 className="font-medium text-blue-800">Director Type</h4>
                  </div>
                  <p className="text-sm text-blue-700 pl-7">
                    Choose whether this field applies to all directors or just the primary director
                  </p>
                </div>
                <Select
                  value={directorType}
                  onValueChange={(v: 'all' | 'primary') => setDirectorType(v)}
                >
                  <SelectTrigger className="mt-1 bg-white border-blue-200 hover:border-blue-300 focus:ring-2 focus:ring-blue-100">
                    <SelectValue placeholder="Select director type" className="text-blue-900" />
                  </SelectTrigger>
                  <SelectContent className="border-blue-100 shadow-lg">
                    <SelectItem value="all" className="flex items-center gap-2 hover:bg-blue-50 focus:bg-blue-50">
                      <Users className="h-4 w-4 text-blue-600" />
                      <span className="text-blue-900">All Directors</span>
                    </SelectItem>
                    <SelectItem value="primary" className="flex items-center gap-2 hover:bg-blue-50 focus:bg-blue-50">
                      <User className="h-4 w-4 text-blue-600" />
                      <span className="text-blue-900">Primary Director Only</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {(newPlaceholder.entity_type || []).includes('dependent') && (
              <div className="space-y-3 p-4 rounded-lg bg-green-50 border border-green-200 shadow-sm">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-green-600" />
                    <h4 className="font-medium text-green-800">Dependant Relationships</h4>
                  </div>
                  <p className="text-sm text-green-700 pl-7">
                    Select the relationship types this field applies to
                  </p>
                </div>
                <div className="space-y-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between bg-white border-green-200 hover:border-green-300 focus:ring-2 focus:ring-green-100"
                      >
                        {dependantRelationship.length > 0
                          ? dependantRelationship
                            .map(rel => DEPENDANT_RELATIONSHIPS.find(r => r.value === rel)?.label || rel)
                            .join(', ')
                          : 'Select relationships...'}
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search relationships..." />
                        <CommandList>
                          <CommandEmpty>No relationships found.</CommandEmpty>
                          <CommandGroup className="max-h-[300px] overflow-y-auto">
                            {DEPENDANT_RELATIONSHIPS.map((relationship) => {
                              const isSelected = dependantRelationship.includes(relationship.value);
                              return (
                                <CommandItem
                                  key={relationship.value}
                                  onSelect={() => {
                                    setDependantRelationship(prev =>
                                      isSelected
                                        ? prev.filter(r => r !== relationship.value)
                                        : [...prev, relationship.value]
                                    );
                                  }}
                                  className="cursor-pointer"
                                >
                                  <div className="flex items-center">
                                    <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-green-600 ${isSelected ? 'bg-green-600 text-white' : 'opacity-50'}`}>
                                      {isSelected && <Check className="h-3 w-3" />}
                                    </div>
                                    <span className="text-green-900">{relationship.label}</span>
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {dependantRelationship.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => setDependantRelationship([])}
                    >
                      Clear all
                    </Button>
                  )}
                </div>
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
            <div className="space-y-4 border-t pt-4 mt-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_ai_generated"
                  checked={newPlaceholder.is_ai_generated}
                  onCheckedChange={(c) => setNewPlaceholder({ ...newPlaceholder, is_ai_generated: !!c })}
                />
                <Label htmlFor="is_ai_generated" className="text-purple-700 font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4" /> AI Refinement Enabled
                </Label>
              </div>

              {newPlaceholder.is_ai_generated && (
                <div className="space-y-2 p-3 bg-purple-50 border border-purple-200 rounded-md animate-in fade-in slide-in-from-top-1">
                  <Label className="text-[11px] text-purple-800 uppercase font-bold">
                    AI Refinement Prompt
                  </Label>
                  <Textarea
                    placeholder="e.g. Write a professional role description for {applicant_full_name} who is a {applicant_position} at {company_name}. Tone: Formal."
                    value={newPlaceholder.ai_prompt}
                    onChange={(e) => setNewPlaceholder({ ...newPlaceholder, ai_prompt: e.target.value })}
                    rows={4}
                    className="bg-white border-purple-200 focus-visible:ring-purple-400"
                  />
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] text-purple-600 italic">
                      <strong>Tip:</strong> Use curly braces to reference other fields as context.
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="text-[9px] bg-purple-100 px-1.5 py-0.5 rounded text-purple-700 font-mono">{"{applicant_full_name}"}</span>
                      <span className="text-[9px] bg-purple-100 px-1.5 py-0.5 rounded text-purple-700 font-mono">{"{company_name}"}</span>
                      <span className="text-[9px] bg-purple-100 px-1.5 py-0.5 rounded text-purple-700 font-mono">{"{applicant_position}"}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsPlaceholderFormOpen(false)}>Cancel</Button><Button onClick={savePlaceholder} disabled={!newPlaceholder.name.trim()}>{isEditingPlaceholder !== null ? 'Update' : 'Add'} Placeholder</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}