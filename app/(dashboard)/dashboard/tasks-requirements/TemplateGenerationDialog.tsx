// @ts-nocheck
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { AlignCenter, AlignLeft, AlignRight, Download, FileText, FileUp, Loader2, Wand2, Expand, CheckCircle2, X, Image as ImageIcon, Save, Sparkles, View, MousePointer2, Layout, Code, ChevronDown, Layers } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { saveAs } from 'file-saver';
import supabase from "@/lib/supabase/client";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import ImageModule from 'docxtemplater-image-module-free';
import * as mammoth from "mammoth";
import { Checkbox } from '@/components/ui/checkbox';
import { EntityType, ENTITY_TYPES, DEPENDANT_RELATIONSHIPS } from "@/lib/constants/entity-types";
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { executeComputedField } from '../tasks/utils/automationComputedFunctions';
import { formatWhitespace, isDate, processDigitSplit, formatDate, base64Parser, toBase64, fetchImageAsBase64, parseJsonValue, normalizeString, findPrimaryDirector, getOrdinalNumber, getOrdinalWord, parseImageDimension, checkDocumentStatus, generateDocumentChecklist, EDITOR_PREVIEW_STYLES, extractDisplayValue } from './utils/templateUtils';
import { getTargetEntity, processPlaceholderValue, processTextField, isValidValue, resolveArrayData } from './utils/placeholderProcessors';
import { extractHeadersFooters, convertWordXmlToHtml, fetchTemplateBuffer as fetchTemplateBufferUtil } from './utils/wordDocumentUtils';
import { TemplateDialogHeader } from './components/TemplateDialogHeader';
import { TemplateSourcePanel } from './components/TemplateSourcePanel';
import { PreviewPanel } from './components/PreviewPanel';
import { PlaceholderInput } from './components/PlaceholderInput';
import { ArrayInputsPanel } from './components/ArrayInputsPanel';

// Common docxtemplater format functions
const formatFunctions = new Set([
    'upper', 'lower', 'capital', 'capitalize', 'title', 'camel', 'snake', 'kebab',
    'date', 'time', 'datetime', 'currency', 'number', 'int', 'float', 'round',
    'prettify', 'escape', 'unescape', 'html', 'raw', 'json', 'parse', 'stringify'
]);

const formatRegex = /\{\{\s*([a-zA-Z0-9_]+)\s*(\/([a-zA-Z0-9_]+))?\s*\}\}/g;

const applyFormat = (val, format) => {
    if (!val || typeof val !== 'string') return val;
    const str = String(val);

    switch (format?.toLowerCase()) {
        case 'upper':
        case 'uppercase':
            return str.toUpperCase();
        case 'lower':
        case 'lowercase':
            return str.toLowerCase();
        case 'capital':
        case 'capitalize':
            return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
        case 'title':
            return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
        case 'prettify':
            return JSON.stringify(val, null, 2);
        case 'escape':
            return escape(str);
        case 'unescape':
            return unescape(str);
        case 'html':
            return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        case 'raw':
            return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        case 'json':
            return JSON.stringify(val);
        case 'parse':
            return JSON.parse(val);
        case 'stringify':
            return JSON.stringify(val, null, 2);
        default:
            return str;
    }
};

export default function TemplateGenerationDialog({
    task, isOpen, onClose, template, availableTemplates = [],
    documentName, masterFields, entityIdMap, sourceDataCache,
    extractedData = {}, personData = {}, companyData = {},
    relationshipData = { directors: [], dependants: [], company: {}, principal: null, understudy: null },
    onDraftDiscarded, jobLevel,
    activeEntityType,
    activeEntityId, refreshDocuments
}) {
    const [panelsVisible, setPanelsVisible] = useState({ form: true, preview: true, source: true });
    const { toast } = useToast();
    const [formData, setFormData] = useState(() => {
        const defaultValues = template?.placeholders?.reduce((acc, placeholder) => {
            acc[placeholder.name] = placeholder.default_value || '';
            return acc;
        }, {});

        return {
            ...extractedData,
            ...personData,
            ...companyData,
            directors: relationshipData.directors || [],
            company: relationshipData.company || {},
            principal: relationshipData.principal || null,
            ...defaultValues
        };
    });
    const [originalFormData, setOriginalFormData] = useState({ ...formData });
    const [refiningFields, setRefiningFields] = useState(new Set());
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [docPreviewUrl, setDocPreviewUrl] = useState(null);
    const [autoPopulatedFields, setAutoPopulatedFields] = useState(new Map());
    const [manuallyEditedFields, setManuallyEditedFields] = useState(new Set());
    const [selectedTemplate, setSelectedTemplate] = useState(template);
    const [uploadedFiles, setUploadedFiles] = useState({});
    const [imageStyles, setImageStyles] = useState({});
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [additionalCache, setAdditionalCache] = useState({});
    const [fetchingTables, setFetchingTables] = useState(new Set());
    const [availableDocuments, setAvailableDocuments] = useState([]);
    const [headerContent, setHeaderContent] = useState('');
    const [footerContent, setFooterContent] = useState('');
    const docxTemplateBuffer = useRef(null);
    const loadedTemplateId = useRef<string | null>(null);
    const isWordTemplate = selectedTemplate?.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    // Centralized function to fetch template buffer with caching
    const fetchTemplateBuffer = useCallback(async (templateId: string, filePath: string): Promise<ArrayBuffer | null> => {
        const buffer = await fetchTemplateBufferUtil(templateId, filePath, docxTemplateBuffer.current, loadedTemplateId.current);

        // Cache the buffer and template ID if successful
        if (buffer) {
            docxTemplateBuffer.current = buffer;
            loadedTemplateId.current = templateId;
        }

        return buffer;
    }, []);

    const [loadedDraft, setLoadedDraft] = useState(null);
    const [isLoadingDraft, setIsLoadingDraft] = useState(false);
    const [dataConflicts, setDataConflicts] = useState([]);
    const [showConflictBanner, setShowConflictBanner] = useState(false);
    const togglePanel = (panel) => setPanelsVisible(prev => ({ ...prev, [panel]: !prev[panel] }));
    const [requirementJobQuestions, setRequirementJobQuestions] = useState<any[]>([]);
    const [computedFieldCache, setComputedFieldCache] = useState<Record<string, any>>({});
    const [documentTablesReady, setDocumentTablesReady] = useState(false);

    useEffect(() => {
        const fetchJobQuestions = async () => {
            if (!task?.job_level) return;

            const jl = task.job_level;
            let query = supabase
                .from('tm_class_requirements')
                .select('*')
                .eq('job_level->>department_id', String(jl.department_id))
                .eq('job_level->>subdepartment_id', String(jl.subdepartment_id));

            if (jl.class_id) {
                query = query.eq('job_level->>class_id', String(jl.class_id));
            } else {
                query = query.is('job_level->>class_id', null);
            }

            if (jl.subclass_id) {
                query = query.eq('job_level->>subclass_id', String(jl.subclass_id));
            } else {
                query = query.is('job_level->>subclass_id', null);
            }

            const { data: requirement } = await query.maybeSingle();
            if (requirement) {
                setRequirementJobQuestions(requirement.job_specific_questions || []);
            }
        };

        fetchJobQuestions();
    }, [task?.job_level, isOpen]);

    useEffect(() => {
        if (!selectedTemplate?.placeholders) return;

        const defaultStyles = {};

        selectedTemplate.placeholders.forEach(placeholder => {
            if (placeholder.type === 'image') {
                const style = {};

                // Apply default values from placeholder configuration
                if (placeholder.image_width) {
                    // Extract numeric value from "150px" format
                    const widthValue = parseInt(placeholder.image_width.replace('px', ''));
                    if (!isNaN(widthValue)) {
                        style.imageWidth = widthValue;
                    }
                }

                if (placeholder.image_height) {
                    // Extract numeric value from "150px" format
                    const heightValue = parseInt(placeholder.image_height.replace('px', ''));
                    if (!isNaN(heightValue)) {
                        style.imageHeight = heightValue;
                    }
                }

                // Only set if we have default values and no existing custom style
                if ((style.imageWidth || style.imageHeight) && !imageStyles[placeholder.name]) {
                    defaultStyles[placeholder.name] = style;
                }
            }
        });

        if (Object.keys(defaultStyles).length > 0) {
            setImageStyles(prev => ({ ...prev, ...defaultStyles }));
        }
    }, [selectedTemplate]);

    // Clear buffer when template changes
    useEffect(() => {
        if (selectedTemplate?.id && loadedTemplateId.current !== selectedTemplate.id) {
            docxTemplateBuffer.current = null;
            loadedTemplateId.current = null;
        }
    }, [selectedTemplate?.id]);

    const groupedPlaceholders = useMemo(() => {
        if (!selectedTemplate?.placeholders) return { topLevel: [], blocks: {} };

        const topLevel = [];
        const blocks = {};
        const seenDisplayValues = new Set();

        selectedTemplate.placeholders.forEach(p => {
            if (p.is_block_start) {
                blocks[p.name] = { config: p, children: [] };
            } else if (p.parent_name && blocks[p.parent_name]) {
                blocks[p.parent_name].children.push(p);
            } else if (!p.parent_name) {
                const qId = p.boolean_conditions?.[0]?.linked_job_question_id;
                const uniqueKey = qId ? `q_${qId}` : p.display_value || p.name;

                if (seenDisplayValues.has(uniqueKey) && p.type === 'boolean') {
                    return;
                }

                seenDisplayValues.add(uniqueKey);
                topLevel.push(p);
            }
        });
        return { topLevel, blocks };
    }, [selectedTemplate]);

    const resolveSpecificSourceValue = useCallback((type, id, placeholder, arrayIndex = null, computedFieldCache = null) => {
        if (!isOpen) return '';

        // 1. Resolve Target Entity Logic
        let sourceArray = null;
        if (arrayIndex !== null && placeholder.parent_name) {
            const blockName = placeholder.parent_name;
            const blockPlaceholder = selectedTemplate?.placeholders?.find(p => p.name === blockName && p.is_block_start);
            if (blockPlaceholder) {
                const entityType = Array.isArray(blockPlaceholder.entity_type) ? blockPlaceholder.entity_type[0] : (blockPlaceholder.entity_type || 'director');
                const normType = entityType.toLowerCase().trim();

                if (normType === 'director') {
                    sourceArray = relationshipData.directors || [];
                    if (blockPlaceholder.director_type === 'primary' && sourceArray.length > 0) {
                        const primary = sourceArray.find(d => d.is_primary) || sourceArray[0];
                        sourceArray = primary ? [primary] : [];
                    }
                } else if (['dependant', 'dependant', 'spouse', 'child', 'father', 'mother', 'son', 'daughter'].includes(normType)) {
                    sourceArray = relationshipData.dependants || [];
                    if (blockPlaceholder.dependant_relationship?.length > 0) {
                        const targetRels = blockPlaceholder.dependant_relationship.map(rel => rel.toLowerCase());
                        sourceArray = sourceArray.filter(d => targetRels.includes(d.relationship?.toLowerCase()));
                    } else if (['spouse', 'child', 'father', 'mother', 'son', 'daughter'].includes(normType)) {
                        sourceArray = sourceArray.filter(d => d.relationship?.toLowerCase() === normType);
                    }
                }
            }
        }

        // Reusing the getTargetEntity logic we defined outside (make sure getTargetEntity is imported or available)
        // If getTargetEntity is defined outside component, we pass args. If inside, we use it directly.
        // Assuming getTargetEntity is defined at module level (top of file):
        const combinedCacheWithAdditional = { ...sourceDataCache, ...additionalCache };
        const targetEntity = getTargetEntity(placeholder, relationshipData, arrayIndex, sourceArray, entityIdMap, combinedCacheWithAdditional, extractedData, companyData);

        if (type === 'job') {
            const taskRecord = (combinedCacheWithAdditional['tm_tasks'] && Object.values(combinedCacheWithAdditional['tm_tasks'])[0]) || task;
            const answers = taskRecord?.job_specific_answers || {};
            const val = answers[String(id)] ?? answers[Number(id)];
            return isValidValue(val) ? String(val) : '';
        }

        if (type === 'db' && targetEntity) {
            const mf = masterFields.get(parseInt(id));
            if (!mf) return '';

            // Construct a temp placeholder to use the existing resolver logic for a single field
            const tempPlaceholder = { ...placeholder, master_field_ids: [id] };
            const result = processTextField(tempPlaceholder, targetEntity, combinedCacheWithAdditional, masterFields, computedFieldCache);
            return result.value || '';
        }

        return '';
    }, [isOpen, selectedTemplate, relationshipData, entityIdMap, sourceDataCache, additionalCache, extractedData, companyData, task, masterFields]);

    const panelClasses = useMemo(() => {
        const { form, preview, source } = panelsVisible;
        const count = [form, preview, source].filter(Boolean).length;
        if (count === 3) return { form: 'col-span-3', preview: 'col-span-5', source: 'col-span-4' };
        if (count === 2) {
            if (!form) return { form: 'hidden', preview: 'col-span-7', source: 'col-span-5' };
            if (!preview) return { form: 'col-span-5', preview: 'hidden', source: 'col-span-7' };
            return { form: 'col-span-4', preview: 'col-span-8', source: 'hidden' };
        }
        return { form: form ? 'col-span-12' : 'hidden', preview: preview ? 'col-span-12' : 'hidden', source: source ? 'col-span-12' : 'hidden' };
    }, [panelsVisible]);

    const getTargetConfig = useCallback(() => {
        const isCompany = activeEntityType === 'company';
        const id = activeEntityId;

        if (id === undefined || id === null || id === 'undefined') {
            console.error('[TemplateGenerationDialog] Fatal: No valid ID for draft operation', { activeEntityType, activeEntityId });
            return null;
        }

        return {
            table: isCompany ? 'acc_portal_kyc_uploads' : 'acc_portal_directors_documents',
            idColumn: isCompany ? 'company_id' : 'director_id',
            docIdColumn: isCompany ? 'document_id' : 'document_id',
            entityId: id
        };
    }, [activeEntityType, activeEntityId]);

    const getDependentDropdownOptions = useCallback((placeholder, masterField, currentRow = null) => {
        const opts = masterField?.options;
        if (!opts?.isDependencyConfig) return Array.isArray(opts) ? opts.map(o => typeof o === 'string' ? { label: o, value: o } : o) : [];
        const parentId = opts.dependencyConfig?.dependentFieldId;
        if (!parentId) return [];
        const parentPlaceholder = selectedTemplate.placeholders.find(p => p.master_field_ids?.includes(parentId));
        if (!parentPlaceholder) return [];
        const parentLabel = (currentRow || formData)[parentPlaceholder.name];
        if (!parentLabel) return [];
        const parentMF = masterFields.get(parentId);
        let parentVal = parentLabel;
        if (Array.isArray(parentMF?.options)) {
            const match = parentMF.options.find(o => (typeof o === 'string' ? o : o.label) === parentLabel);
            if (match) parentVal = typeof match === 'string' ? match : match.value;
        }
        return opts.manualMapping?.[parentVal] || [];
    }, [formData, masterFields, selectedTemplate]);

    const loadExistingDraft = useCallback(async () => {
        const config = getTargetConfig();
        if (!isOpen || !selectedTemplate || !config) return;

        setIsLoadingDraft(true);
        try {
            const kycDocId = selectedTemplate.document_id;

            const { data: draftData, error } = await supabase
                .from(config.table)
                .select('*')
                .eq(config.docIdColumn, kycDocId)
                .eq(config.idColumn, config.entityId) // Uses strictly verified ID
                .eq('status', 'draft')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (draftData) {
                setLoadedDraft(draftData);
                await parseDraftAndPopulateForm(draftData);
                toast({
                    title: "Draft Loaded",
                    description: "Previous work has been restored",
                    variant: "default"
                });
            }
        } catch (error) {
            console.error('Error loading draft:', error);
            toast({
                title: "Draft Load Failed",
                description: "Could not load previous draft",
                variant: "destructive"
            });
        } finally {
            setIsLoadingDraft(false);
        }
    }, [isOpen, selectedTemplate, getTargetConfig]);

    const discardDraft = useCallback(async () => {
        if (!loadedDraft) return;
        const config = getTargetConfig();

        setIsLoadingDraft(true);
        try {
            // 1. Storage cleanup
            if (loadedDraft.file_path) {
                await supabase.storage.from('kyc-documents').remove([loadedDraft.file_path]);
            }

            // 2. DB cleanup
            const { error: dbError } = await supabase
                .from(config.table)
                .delete()
                .eq('id', loadedDraft.id);

            if (dbError) throw dbError;

            // 3. UI Sync
            setLoadedDraft(null);
            if (onDraftDiscarded) onDraftDiscarded();
            if (refreshDocuments) await refreshDocuments();

            toast({ title: "Draft Discarded" });
        } catch (error) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsLoadingDraft(false);
        }
    }, [loadedDraft, getTargetConfig, refreshDocuments, onDraftDiscarded]);

    const detectDataConflicts = useCallback((draftFormData: any, liveFormData: any) => {
        const conflicts: Array<{
            field: string;
            draftValue: any;
            liveValue: any;
            source: string;
        }> = [];

        // Check top-level placeholders
        selectedTemplate?.placeholders?.forEach(placeholder => {
            const fieldName = placeholder.name;
            const draftValue = draftFormData[fieldName];
            const liveValue = liveFormData[fieldName];
            if (!draftValue && !liveValue) return;
            const draftStr = typeof draftValue === 'object'
                ? JSON.stringify(draftValue)
                : String(draftValue || '');
            const liveStr = typeof liveValue === 'object'
                ? JSON.stringify(liveValue)
                : String(liveValue || '');
            if (liveValue && draftStr !== liveStr) {
                conflicts.push({
                    field: fieldName,
                    draftValue,
                    liveValue,
                    source: 'Database'
                });
            }
        });

        // Check array items fields
        Object.keys(groupedPlaceholders.blocks).forEach(blockName => {
            const draftArray = draftFormData[blockName] || [];
            const liveArray = liveFormData[blockName] || [];
            const children = groupedPlaceholders.blocks[blockName].children;

            // Check each row in the array
            const maxRows = Math.max(draftArray.length, liveArray.length);
            for (let i = 0; i < maxRows; i++) {
                const draftRow = draftArray[i] || {};
                const liveRow = liveArray[i] || {};

                children.forEach(child => {
                    const fieldName = `${blockName}[${i}].${child.name}`;
                    const draftValue = draftRow[child.name];
                    const liveValue = liveRow[child.name];

                    if (!draftValue && !liveValue) return;
                    const draftStr = typeof draftValue === 'object'
                        ? JSON.stringify(draftValue)
                        : String(draftValue || '');
                    const liveStr = typeof liveValue === 'object'
                        ? JSON.stringify(liveValue)
                        : String(liveValue || '');
                    if (liveValue && draftStr !== liveStr) {
                        conflicts.push({
                            field: fieldName,
                            draftValue,
                            liveValue,
                            source: 'Database'
                        });
                    }
                });
            }
        });

        setDataConflicts(conflicts);
        setShowConflictBanner(conflicts.length > 0);

        return conflicts;
    }, [selectedTemplate, groupedPlaceholders]);

    const parseDraftAndPopulateForm = useCallback(async (draft: any) => {
        try {
            if (draft.metadata && typeof draft.metadata === 'object') {
                if (draft.metadata.formData) {
                    const draftFormData = draft.metadata.formData;
                    const liveData = {};
                    const liveAutoMap = new Map();

                    groupedPlaceholders.topLevel.forEach(p => {
                        const match = processPlaceholderValue(
                            p,
                            relationshipData,
                            combinedCache,
                            masterFields,
                            entityIdMap,
                            extractedData,
                            companyData,
                            null,               // arrayIndex
                            null,               // sourceArray
                            task,
                            computedFieldCache
                        );

                        let val = p.type === 'boolean' ? match.value : extractDisplayValue(match.value);

                        if (val) {
                            liveData[p.name] = val;
                            if (match.source) liveAutoMap.set(p.name, match.source);
                        }

                        // Smart Match fallback
                        if (!liveData[p.name]) {
                            const smartMatch = smartFieldMatch(p.name);
                            if (smartMatch.value) {
                                liveData[p.name] = smartMatch.value;
                                liveAutoMap.set(p.name, smartMatch.source);
                            }
                        }
                    });

                    // Generate live data for array items fields
                    Object.keys(groupedPlaceholders.blocks).forEach(blockName => {
                        const blockConfig = groupedPlaceholders.blocks[blockName].config;
                        const children = groupedPlaceholders.blocks[blockName].children;
                        const resolvedArray = resolveArrayData(
                            blockConfig,
                            selectedTemplate.placeholders,
                            combinedCache,
                            masterFields,
                            entityIdMap,
                            relationshipData,
                            extractedData,
                            companyData,
                            task,
                            computedFieldCache
                        );

                        if (resolvedArray.length > 0) {
                            liveData[blockName] = resolvedArray;
                        }
                    });

                    const conflicts = await detectDataConflicts(draftFormData, liveData);
                    setFormData(draftFormData);
                    setOriginalFormData(JSON.parse(JSON.stringify(draftFormData)));
                    if (draft.metadata.imageStyles) {
                        setImageStyles(draft.metadata.imageStyles);
                    }
                    setTimeout(() => {
                        if (docxTemplateBuffer.current) {
                            updateWordPreview(draftFormData, draft.metadata.imageStyles || {});
                        } else {
                            setPreviewContent(populateHtmlContent(draftFormData, selectedTemplate?.placeholders || [], draft.metadata.imageStyles || {}));
                        }
                    }, 100);

                    return;
                }
            }
            if (!draft.file_content) {
                return;
            }

            const base64Data = draft.file_content.split('base64,')[1];
            const binaryStr = atob(base64Data);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            const arrayBuffer = bytes.buffer;
            const zip = new PizZip(arrayBuffer);
            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
            });
            const xmlContent = zip.file('word/document.xml')?.asText();

            if (!xmlContent) {
                console.warn('[parseDraftAndPopulateForm] Could not extract XML from draft');
                return;
            }
            const extractedValues = {};

            selectedTemplate.placeholders?.forEach(placeholder => {
                const placeholderName = placeholder.name;
                const regex = new RegExp(`<w:t[^>]*>([^<]*)</w:t>`, 'g');
                let match;
                let foundValue = null;
                while ((match = regex.exec(xmlContent)) !== null) {
                    const text = match[1];
                    if (text && text.trim() && !text.includes('{') && !text.includes('}')) {
                        foundValue = text;
                    }
                }

                if (foundValue) {
                    extractedValues[placeholderName] = foundValue;
                }
            });
            setFormData(prev => ({
                ...prev,
                ...extractedValues
            }));
            setOriginalFormData(prev => ({
                ...prev,
                ...extractedValues
            }));

        } catch (error) {
            toast({
                title: "Error Loading Draft",
                description: "Could not parse draft content. Starting fresh.",
                variant: "destructive"
            });
        }
    }, [selectedTemplate, formData, detectDataConflicts, task]);

    useEffect(() => {
        if (isOpen && selectedTemplate && entityIdMap) {
            loadExistingDraft();
        }
    }, [isOpen, selectedTemplate?.id, entityIdMap]);

    const combinedCache = useMemo(() => ({
        ...sourceDataCache,
        ...additionalCache
    }), [sourceDataCache, additionalCache]);

    const handleTemplateSelect = useCallback((templateId) => {
        const newTemplate = availableTemplates.find(t => t.id === templateId);
        if (newTemplate) {
            setSelectedTemplate(newTemplate);
            toast({
                title: "Template Changed",
                description: `Switched to "${newTemplate.file_name}"`,
                variant: "default"
            });
        }
    }, [availableTemplates]);

    const refreshWithLiveData = useCallback(() => {
        const initData = { ...formData };
        const autoMap = new Map();
        groupedPlaceholders.topLevel.forEach(p => {
            const match = processPlaceholderValue(
                p,
                relationshipData,
                combinedCache,
                masterFields,
                entityIdMap,
                extractedData,
                companyData,
                null,               // arrayIndex
                null,               // sourceArray
                task,
                computedFieldCache
            );

            let val = p.type === 'boolean' ? match.value : extractDisplayValue(match.value);

            if (val) {
                initData[p.name] = val;
                if (match.source) autoMap.set(p.name, match.source);
            }
        });

        setFormData(initData);
        setOriginalFormData(JSON.parse(JSON.stringify(initData)));
        setAutoPopulatedFields(autoMap);
        setDataConflicts([]);
        setShowConflictBanner(false);

        toast({
            title: "Refreshed",
            description: "Form updated with latest database values",
        });
    }, [formData, groupedPlaceholders, relationshipData, combinedCache, masterFields, entityIdMap, extractedData, companyData]);

    const fetchMissingDataSources = useCallback(async () => {
        if (!isOpen || !selectedTemplate || !masterFields) return;

        const allIds = new Set<string>();

        if (entityIdMap.company) allIds.add(String(entityIdMap.company));
        if (entityIdMap.principal) allIds.add(String(entityIdMap.principal));
        if (entityIdMap.sponsor) allIds.add(String(entityIdMap.sponsor));

        const dirIds = Array.isArray(entityIdMap.directors)
            ? entityIdMap.directors
            : (entityIdMap.director ? [entityIdMap.director] : []);
        dirIds.forEach(id => id && allIds.add(String(id)));

        const depIds = Array.isArray(entityIdMap.dependants) ? entityIdMap.dependants : [];
        depIds.forEach(id => id && allIds.add(String(id)));

        relationshipData?.directors?.forEach(d => (d.id || d.director_id) && allIds.add(String(d.id || d.director_id)));
        relationshipData?.dependants?.forEach(d => {
            const id = typeof d === 'object' ? (d.id || d.individual_id) : d;
            if (id) allIds.add(String(id));
        });
        if (relationshipData?.principal) {
            const p = relationshipData.principal;
            const pid = typeof p === 'object' ? (p.id || p.individual_id) : p;
            if (pid) allIds.add(String(pid));
        }
        if (relationshipData?.sponsor) {
            const s = relationshipData.sponsor;
            const sid = typeof s === 'object' ? (s.id || s.individual_id) : s;
            if (sid) allIds.add(String(sid));
        }

        const idList = Array.from(allIds).filter(Boolean);
        if (idList.length === 0) return;
        interface TableConfig {
            linkingVars: Set<string>;
            documentIds: Set<string>;
            hasDocFilter: boolean;
        }

        const tableConfigs = new Map<string, TableConfig>();

        selectedTemplate.placeholders?.forEach(p => {
            const allLinkedMasterIds = new Set([
                ...(p.master_field_ids || []),
                ...(p.conditions?.map((c: any) => c.master_field_id).filter(Boolean) || []),
                ...(p.boolean_conditions?.map((c: any) => c.master_field_id).filter(Boolean) || []),
            ]);

            allLinkedMasterIds.forEach(mId => {
                const masterField = masterFields.get(parseInt(mId));
                masterField?.sources?.forEach((source: any) => {
                    if (!source.table) return;

                    if (!tableConfigs.has(source.table)) {
                        tableConfigs.set(source.table, {
                            linkingVars: new Set(),
                            documentIds: new Set(),
                            hasDocFilter: false,
                        });
                    }

                    const cfg = tableConfigs.get(source.table)!;
                    cfg.linkingVars.add(source.linking_variable || 'id');

                    // Capture document_id filters from the source config
                    const docIds: string[] = Array.isArray(source.document_id)
                        ? source.document_id
                        : (source.document_id ? [source.document_id] : []);

                    if (docIds.length > 0) {
                        docIds.forEach(id => cfg.documentIds.add(id));
                        cfg.hasDocFilter = true;
                    }
                });
            });
        });

        const tablesToFetch = Array.from(tableConfigs.keys());
        setFetchingTables(prev => new Set([...prev, ...tablesToFetch]));

        try {
            const fetchPromises = Array.from(tableConfigs.entries()).map(async ([table, config]) => {
                try {
                    const linkingVars = Array.from(config.linkingVars);
                    const docIds = Array.from(config.documentIds);

                    // Build the base query filtered by entity IDs
                    let query = supabase.from(table).select('*');

                    if (linkingVars.length === 1) {
                        query = query.in(linkingVars[0], idList);
                    } else {
                        const orConditions = linkingVars
                            .map(lv => `${lv}.in.(${idList.join(',')})`)
                            .join(',');
                        query = query.or(orConditions);
                    }

                    // When the source specifies document_id filters we must include
                    // those rows too — they're the fallback source rows.
                    // We use an OR so we get:
                    //   (entity rows)  OR  (document-filtered rows for this entity)
                    //
                    // Actually the entity ID filter already scopes to the right entity.
                    // The document_id filter just narrows to a specific document type.
                    // So we add it as an additional AND filter only for this table when
                    // EVERY source on this table has a doc filter (meaning the table is
                    // purely a document-uploads table).  If some sources have no doc
                    // filter we must fetch all entity rows regardless.
                    if (config.hasDocFilter && docIds.length > 0) {
                        // Check if ALL sources for this table have doc filters.
                        // If so, we can safely add the .in('document_id', docIds) filter
                        // to avoid pulling every row for the entity.
                        // If not (mixed), skip the document_id filter so non-doc rows
                        // still come through.
                        const allSourcesHaveDocFilter = (() => {
                            let allHave = true;
                            tableConfigs.get(table)!.documentIds.size > 0
                                ? null
                                : (allHave = false);
                            return allHave;
                        })();

                        const { data: docRows, error: docErr } = await supabase
                            .from(table)
                            .select('*')
                            .in('document_id', docIds)
                            .in(linkingVars[0], idList);  // still scoped to entity

                        if (!docErr && docRows) {
                            // These will be merged into the cache below alongside
                            // the main query results.
                            const { data: mainRows, error: mainErr } = await query;
                            if (mainErr) throw mainErr;

                            const combined = [...(mainRows || []), ...docRows];
                            // Deduplicate by row id
                            const seen = new Set<string>();
                            const deduped = combined.filter(row => {
                                const key = String(row.id || row.director_id || row.individual_id || row.company_id);
                                if (seen.has(key + JSON.stringify(row))) return false;
                                seen.add(key + JSON.stringify(row));
                                return true;
                            });

                            const tableCache: Record<string, any> = {};
                            deduped.forEach(row => {
                                const primaryId = String(row.id || row.director_id || row.individual_id || row.company_id);
                                if (primaryId && primaryId !== 'undefined') tableCache[primaryId] = row;
                                linkingVars.forEach(v => { if (row[v]) tableCache[String(row[v])] = row; });
                                // Also key by document_id so processTextField can find it
                                if (row.document_id) tableCache[`doc_${row.document_id}_${String(row[linkingVars[0]])}`] = row;
                            });

                            return { table, cache: tableCache };
                        }
                    }

                    const { data, error } = await query;
                    if (error) throw error;

                    const tableCache: Record<string, any> = {};
                    data?.forEach(row => {
                        const primaryId = String(row.id || row.director_id || row.individual_id || row.company_id);
                        if (primaryId && primaryId !== 'undefined') tableCache[primaryId] = row;
                        linkingVars.forEach(v => { if (row[v]) tableCache[String(row[v])] = row; });
                        if (row.document_id) tableCache[`doc_${row.document_id}_${String(row[linkingVars[0]])}`] = row;
                    });
                    return { table, cache: tableCache };
                } catch (err) {
                    console.error(`❌ Error fetching ${table}:`, err);
                    return { table, cache: null };
                }
            });

            const results = await Promise.all(fetchPromises);
            const newCacheEntries: Record<string, any> = {};
            const successfulTables: string[] = [];
            const failedTables: string[] = [];

            results.forEach(res => {
                if (res.cache) {
                    newCacheEntries[res.table] = res.cache;
                    successfulTables.push(res.table);
                } else {
                    failedTables.push(res.table);
                }
            });

            if (Object.keys(newCacheEntries).length > 0) {
                setAdditionalCache(prev => ({ ...prev, ...newCacheEntries }));
                if (successfulTables.length > 0) {
                    toast({
                        title: "Data Loaded",
                        description: `Successfully loaded data from ${successfulTables.length} table(s)`,
                    });
                }
            }

            if (failedTables.length > 0) {
                toast({
                    title: "Partial Data Load",
                    description: `Failed to load data from ${failedTables.length} table(s)`,
                    variant: "warning",
                });
            }
        } catch (error) {
            toast({
                title: "Data Load Failed",
                description: "Could not fetch additional data sources",
                variant: "destructive",
            });
        } finally {
            setFetchingTables(prev => {
                const newSet = new Set(prev);
                tablesToFetch.forEach(table => newSet.delete(table));
                return newSet;
            });
        }
    }, [isOpen, selectedTemplate?.id, entityIdMap, relationshipData, masterFields]);

    const resolveComputedFields = useCallback(async (_updatedCache: Record<string, any>) => {
        if (!selectedTemplate?.placeholders || !masterFields) return;

        // ── 1. Collect every entity ID we might need ──────────────────────────────
        const allEntityIds = new Set<string>();

        if (entityIdMap?.company) allEntityIds.add(String(entityIdMap.company));
        if (entityIdMap?.principal) allEntityIds.add(String(entityIdMap.principal));
        if (entityIdMap?.sponsor) allEntityIds.add(String(entityIdMap.sponsor));

        const dirIds = Array.isArray(entityIdMap?.directors)
            ? entityIdMap.directors
            : (entityIdMap?.director ? [entityIdMap.director] : []);
        dirIds.forEach((id: any) => id && allEntityIds.add(String(id)));

        const addAllIds = (obj: any) => {
            if (!obj) return;
            if (typeof obj !== 'object') { allEntityIds.add(String(obj)); return; }
            [obj.id, obj.director_id, obj.individual_id, obj.company_id]
                .filter(Boolean)
                .forEach((id: any) => allEntityIds.add(String(id)));
        };
        relationshipData?.directors?.forEach(addAllIds);
        relationshipData?.dependants?.forEach(addAllIds);
        addAllIds(relationshipData?.principal);
        addAllIds(relationshipData?.sponsor);

        const entityIdArray = Array.from(allEntityIds).filter(Boolean);
        if (entityIdArray.length === 0) { setDocumentTablesReady(true); return; }

        // ── 2. Collect every master field ID referenced in the template ───────────
        const allLinkedMasterIds = new Set<number>();
        selectedTemplate.placeholders.forEach((p: any) => {
            (p.master_field_ids || []).forEach((id: any) => allLinkedMasterIds.add(parseInt(id)));
        });
        interface PlanEntry {
            linkingVar: string;
            docIds: Set<string>;
            isDocScoped: boolean;
        }

        const tableFetchPlan = new Map<string, PlanEntry>();

        const ensureTable = (table: string, linkingVar: string, docIds: string[] = []) => {
            if (!table) return;
            if (!tableFetchPlan.has(table)) {
                tableFetchPlan.set(table, {
                    linkingVar: linkingVar || 'id',
                    docIds: new Set(),
                    isDocScoped: false,
                });
            }
            const entry = tableFetchPlan.get(table)!;
            // Keep the first linkingVar seen (highest priority source wins)
            if (!entry.linkingVar) entry.linkingVar = linkingVar || 'id';
            if (docIds.length > 0) {
                docIds.forEach(id => entry.docIds.add(id));
                entry.isDocScoped = true;
            }
        };

        const computedJobs: Array<{ mfId: number; source: any }> = [];

        allLinkedMasterIds.forEach(mfId => {
            const mf = masterFields.get(mfId);
            if (!mf?.sources) return;

            mf.sources.forEach((source: any) => {
                if (!source.table) return;

                const docIds: string[] = Array.isArray(source.document_id)
                    ? source.document_id.filter(Boolean)
                    : (source.document_id ? [source.document_id] : []);

                if (source.is_computed) {
                    // Computed sources: register their table so we can pre-fetch docs
                    ensureTable(source.table, source.linking_variable, docIds);
                    computedJobs.push({ mfId, source });
                } else {
                    // Non-computed sources: register for fetchMissingDataSources-style fetching
                    // so processTextField priority fallback has the data it needs
                    ensureTable(source.table, source.linking_variable, docIds);
                }
            });
        });

        // Also register tables needed by document_checklist / image placeholders
        selectedTemplate.placeholders.forEach((p: any) => {
            if (p.type === 'document_checklist' && p.checklist_data_sources) {
                p.checklist_data_sources.forEach((ds: any) => {
                    ensureTable(ds.table, ds.linking_variable, ds.linked_document_ids || []);
                });
            }
            if (p.type === 'image' && p.source_table) {
                ensureTable(p.source_table, p.linking_variable, p.document_type_ids || []);
            }
        });

        // ── 4. Fetch all required tables ─────────────────────────────────────────
        //
        // documentCache accumulates rows in the shape executeComputedField expects:
        //   { documents: any[], docTypes: any[] }
        //
        // additionalCache is updated so processTextField / checklist / image
        // rendering can find the rows without a second round-trip.

        const documentCache: { documents: any[]; docTypes: any[] } = {
            documents: [],
            docTypes: [],
        };

        try {
            const fetchPromises: Promise<void>[] = [];

            tableFetchPlan.forEach((entry, table) => {
                const { linkingVar, docIds, isDocScoped } = entry;
                const docIdsArray = Array.from(docIds);

                // Build query scoped to our entity IDs
                let q = supabase
                    .from(table)
                    .select('*')
                    .in(linkingVar, entityIdArray);

                // If this table is doc-scoped, add the document_id filter so we don't
                // pull every upload row for the entity — only the relevant document types.
                if (isDocScoped && docIdsArray.length > 0) {
                    q = q.in('document_id', docIdsArray);
                }

                fetchPromises.push(
                    q.then(({ data, error }) => {
                        if (error) {
                            console.error(`❌ [resolveComputedFields] fetch ${table}:`, error.message);
                            return;
                        }
                        if (!data?.length) return;

                        // Feed into documentCache for executeComputedField
                        documentCache.documents.push(...data);

                        // Feed into additionalCache for UI rendering
                        const tableCache: Record<string, any> = {};
                        data.forEach((row: any) => {
                            // Primary key index
                            const pk = String(row.id ?? row.director_id ?? row.individual_id ?? row.company_id ?? '');
                            if (pk && pk !== 'undefined') tableCache[pk] = row;

                            // linking_variable index (may differ from pk)
                            const lv = row[linkingVar];
                            if (lv) tableCache[String(lv)] = row;

                            // Composite doc key: doc_<documentId>_<entityId>
                            // Used by processTextField for doc-scoped lookups
                            if (row.document_id) {
                                tableCache[`doc_${row.document_id}_${String(row[linkingVar] ?? pk)}`] = row;
                            }
                        });

                        setAdditionalCache(prev => ({
                            ...prev,
                            [table]: { ...(prev[table] || {}), ...tableCache },
                        }));
                    }).catch(err => {
                        console.error(`❌ [resolveComputedFields] fetch ${table}:`, err);
                    })
                );
            });

            // Also fetch docType metadata from acc_portal_kyc for any collected doc IDs
            const allDocIds = new Set<string>();
            tableFetchPlan.forEach(entry => entry.docIds.forEach(id => allDocIds.add(id)));
            if (allDocIds.size > 0) {
                fetchPromises.push(
                    supabase
                        .from('acc_portal_kyc')
                        .select('*')
                        .in('id', Array.from(allDocIds))
                        .then(({ data }) => { if (data) documentCache.docTypes.push(...data); })
                        .catch(() => { /* non-fatal */ })
                );
            }

            await Promise.all(fetchPromises);
        } catch (err) {
            console.error('❌ [resolveComputedFields] fetch phase failed:', err);
        }

        // Signal that document tables are ready even when there are no computed jobs
        setDocumentTablesReady(true);
        if (computedJobs.length === 0) return;

        // ── 5. Execute computed fields using the pre-fetched cache ────────────────
        const newComputedCache: Record<string, any> = {};

        await Promise.all(
            computedJobs.flatMap(({ mfId, source }) =>
                entityIdArray.map(async (entityId) => {
                    const extractionMode = 'latest';
                    const cacheKey = `${mfId}_${entityId}_${extractionMode}`;

                    // Reuse already-resolved value to avoid redundant work
                    if (computedFieldCache[cacheKey] !== undefined) {
                        newComputedCache[cacheKey] = computedFieldCache[cacheKey];
                        return;
                    }

                    const docIds: string[] = Array.isArray(source.document_id)
                        ? source.document_id.filter(Boolean)
                        : (source.document_id ? [source.document_id] : []);

                    // Normalise legacy function name
                    let functionToCall: string = source.computed_function || 'extractFieldFromLatestDocument';
                    if (functionToCall === 'getLatestDocument' && source.path) {
                        functionToCall = 'extractFieldFromLatestDocument';
                    }

                    try {
                        const val = await executeComputedField(
                            functionToCall,
                            entityId,
                            docIds,
                            source.path,
                            extractionMode,
                            documentCache,          // pre-fetched — no extra DB calls
                            source.computed_config,
                        );
                        newComputedCache[cacheKey] = val;
                    } catch (err) {
                        console.error(`❌ computedField mf=${mfId} entity=${entityId}:`, err);
                        newComputedCache[cacheKey] = null;
                    }
                })
            )
        );

        if (Object.keys(newComputedCache).length > 0) {
            setComputedFieldCache(prev => ({ ...prev, ...newComputedCache }));
        }
    }, [
        selectedTemplate,
        masterFields,
        entityIdMap,
        relationshipData,
        computedFieldCache,
    ]);

    useEffect(() => {
        if (!isOpen || !selectedTemplate?.id) return;

        const loadAndResolve = async () => {
            await fetchMissingDataSources();
            const freshDocCache = await resolveComputedFields(combinedCache);
            if (freshDocCache && Object.keys(freshDocCache).length > 0) {
                setAdditionalCache(prev => ({ ...prev, ...freshDocCache }));
            }
        };

        loadAndResolve();
    }, [isOpen, selectedTemplate?.id]);

    useEffect(() => {
        if (isOpen && selectedTemplate?.id && masterFields) {
            resolveComputedFields(combinedCache);
        }
    }, [isOpen, selectedTemplate?.id, masterFields]);

    useEffect(() => {
        if (!isOpen || !selectedTemplate) return;
        if (loadedDraft && Object.keys(formData).length > 0) return;
        if (fetchingTables.size > 0) {
            return;
        }
        if (!documentTablesReady) {
            return;
        }
        const init = { ...formData };
        const autoMap = new Map(autoPopulatedFields);
        let hasChanged = false;
        Object.keys(groupedPlaceholders.blocks).forEach(name => {
            const currentRows = init[name] || [];
            const needsPopulating = currentRows.length === 0 || currentRows.some(row => {
                return groupedPlaceholders.blocks[name].children.some(child => {
                    const isDbLinked = child.master_field_ids?.length > 0;
                    const isEmpty = !row[child.name] || row[child.name] === '';
                    return isDbLinked && isEmpty;
                });
            });

            if (needsPopulating) {
                const resolvedRows = resolveArrayData(
                    groupedPlaceholders.blocks[name].config,
                    selectedTemplate.placeholders,
                    combinedCache,
                    masterFields,
                    entityIdMap,
                    relationshipData,
                    extractedData,
                    companyData,
                    computedFieldCache
                );
                const actuallyFoundDbData = resolvedRows.some(row =>
                    Object.entries(row).some(([key, val]) => {
                        if (key.startsWith('__')) return false; // Ignore source tags
                        const sourceTag = row[`__${key}_source`];
                        const isRealDbSource = sourceTag && !['System Date', 'Ordinal Generator'].includes(sourceTag);
                        return isRealDbSource && val !== '';
                    })
                );

                if (actuallyFoundDbData) {
                    init[name] = resolvedRows;
                    autoMap.set(name, `Auto-populated (${resolvedRows.length} items)`);
                    hasChanged = true;
                }
            }
        });
        groupedPlaceholders.topLevel.forEach(p => {
            if (!init[p.name] || init[p.name] === '') {
                const match = processPlaceholderValue(
                    p,
                    relationshipData,
                    combinedCache,
                    masterFields,
                    entityIdMap,
                    extractedData,
                    companyData,
                    null,               // arrayIndex
                    null,               // sourceArray
                    task,
                    computedFieldCache
                );
                let val = p.type === 'boolean' ? match.value : extractDisplayValue(match.value);
                if (val && val !== '') {
                    init[p.name] = val;
                    if (match.source) autoMap.set(p.name, match.source);
                    hasChanged = true;
                }
            }
        });

        if (hasChanged) {
            setFormData(init);
            setOriginalFormData(JSON.parse(JSON.stringify(init)));
            setAutoPopulatedFields(autoMap);
        }
    }, [isOpen, selectedTemplate?.id, combinedCache, loadedDraft, fetchingTables, task, computedFieldCache, documentTablesReady]);

    useEffect(() => {
        const fetchAvailableDocuments = async () => {
            if (!isOpen) return;

            try {
                const { data, error } = await supabase
                    .from('acc_portal_kyc')
                    .select('id, name, display_name, category')
                    .order('display_name');

                if (error) throw error;

                setAvailableDocuments(data || []);
                window.__availableDocuments = data || [];
            } catch (error) {
                console.error('Error fetching available documents:', error);
            }
        };

        fetchAvailableDocuments();

        return () => {
            window.__availableDocuments = undefined;
        };
    }, [isOpen]);

    const smartFieldMatch = useCallback((placeholderName) => {
        const normalized = normalizeString(placeholderName);
        const sources = [{ data: extractedData }, { data: personData }, { data: companyData }];
        for (const { data } of sources) {
            if (!data) continue;
            for (const key of Object.keys(data)) {
                if (normalizeString(key) === normalized) return { value: data[key], source: 'Smart Match' };
            }
        }
        return { value: '', source: null };
    }, [extractedData, personData, companyData]);

    const resolveArrayData = useCallback((blockPlaceholder, allPlaceholders, combinedCache, masterFields, entityIdMap, relationshipData, extractedData, companyData, computedFieldCache) => {
        const entityType = Array.isArray(blockPlaceholder.entity_type)
            ? blockPlaceholder.entity_type[0]
            : (blockPlaceholder.entity_type || 'director');
        const blockName = blockPlaceholder.name;
        const isPrimaryOnly = blockPlaceholder.director_type === 'primary';
        const isHorizontal = blockPlaceholder.array_direction === 'horizontal';

        let sourceArray = [];

        const childFields = allPlaceholders.filter(p =>
            (p.parent_name === blockName || (p.description && p.description.toLowerCase().includes(blockName.toLowerCase())))
            && p.id !== blockPlaceholder.id
            && !p.is_block_start
        );

        const isDigitSplitting = isHorizontal || (
            childFields.length === 1 &&
            childFields[0].master_field_ids?.[0] === blockPlaceholder.master_field_ids?.[0]
        );

        if (isDigitSplitting && blockPlaceholder.master_field_ids?.[0]) {
            const masterFieldId = blockPlaceholder.master_field_ids[0];
            const mf = masterFields.get(parseInt(masterFieldId, 10));

            if (mf?.sources) {
                let targetEntity = entityType === 'company' ? relationshipData.company :
                    (isPrimaryOnly ? relationshipData.directors?.find(d => d.is_primary === true) : relationshipData.directors?.[0]);

                if (targetEntity) {
                    for (const source of mf.sources) {
                        const tableData = combinedCache[source.table];
                        if (!tableData) continue;

                        const record = Object.values(tableData).find(r =>
                            String(r[source.linking_variable || 'id']) === String(targetEntity.id)
                        );

                        if (record) {
                            let value = source.path
                                ? parseJsonValue(record, source.path)
                                : record[mf.field_key];

                            if (value) {
                                const chars = String(value).split('');
                                console.groupEnd();
                                return chars.map(char => ({
                                    [childFields[0]?.name || 'value']: char
                                }));
                            }
                        }
                    }
                }
            }
        }
        const normalizedEntityType = entityType.toLowerCase().trim();
        if (normalizedEntityType === 'director') {
            sourceArray = relationshipData.directors || [];
            if (isPrimaryOnly && sourceArray.length > 0) {
                const primary = sourceArray.find(d => d.is_primary) || sourceArray[0];
                sourceArray = primary ? [primary] : [];
            }
        } else if (['dependant', 'dependant', 'spouse', 'child', 'father', 'mother', 'son', 'daughter'].includes(normalizedEntityType)) {
            sourceArray = relationshipData.dependants || [];
            if (blockPlaceholder.dependant_relationship?.length > 0) {
                const targetRels = blockPlaceholder.dependant_relationship.map(rel => rel.toLowerCase());
                sourceArray = sourceArray.filter(d =>
                    targetRels.includes(d.relationship?.toLowerCase())
                );
            }
            else if (['spouse', 'child', 'father', 'mother', 'son', 'daughter'].includes(normalizedEntityType)) {
                sourceArray = sourceArray.filter(d =>
                    d.relationship?.toLowerCase() === normalizedEntityType
                );
            }
        }

        if (sourceArray.length === 0) {
            console.warn(`⚠️ No source array found for block: ${blockName} (entity type: ${entityType})`);
            console.groupEnd();
            return [];
        }

        const result = sourceArray.map((item, index) => {
            const rowData = {};

            childFields.forEach(field => {
                const processed = processPlaceholderValue(
                    field,
                    relationshipData,
                    combinedCache,
                    masterFields,
                    entityIdMap,   // Argument 5: entityIdMap
                    extractedData, // Argument 6: extractedData
                    companyData,   // Argument 7: companyData
                    index,         // Argument 8: arrayIndex (Critical Fix)
                    sourceArray,
                    task,
                    computedFieldCache
                );
                // For boolean fields, preserve the structure (array of options)
                if (field.type === 'boolean') {
                    rowData[field.name] = processed.value;
                } else {
                    rowData[field.name] = extractDisplayValue(processed.value);
                }

                if (processed.source) {
                    rowData[`__${field.name}_source`] = processed.source;
                }
            });
            console.groupEnd();
            return rowData;
        });

        console.groupEnd();
        return result;
    }, [extractedData, personData, companyData, task]);

    const handleInputChange = (name, val) => {
        setFormData(prev => {
            const newState = { ...prev, [name]: val };

            // DEDUPLICATION SYNC: 
            // If 'val' is a boolean array (the checkboxes), check if other 
            // placeholders need to be updated based on this selection.
            if (Array.isArray(val) && val[0]?.linked_job_question_id) {
                const selectedTag = val.find(opt => opt.checked)?.tag;

                // Look for other placeholders in the template linked to the same question
                selectedTemplate.placeholders.forEach(otherPh => {
                    if (otherPh.name === name) return; // skip self

                    const otherQId = otherPh.boolean_conditions?.[0]?.linked_job_question_id;
                    const masterQId = val[0].linked_job_question_id;

                    if (otherQId === masterQId) {
                        // This other placeholder (e.g. between_10_99p) is part of the same group.
                        // We set its formData value to '✔' or '' based on the selection.
                        const isMatch = otherPh.boolean_conditions[0].tag === selectedTag;
                        // Note: Generation logic usually expects the boolean array or the processed string
                        // For document generation, we update its individual state
                        newState[otherPh.name] = isMatch ? val : val.map(v => ({ ...v, checked: false }));
                    }
                });
            }

            if (docxTemplateBuffer.current) {
                updateWordPreview(newState, imageStyles);
            } else {
                // Use async update for HTML templates to convert images to base64
                (async () => {
                    const base64Data = await prepareRenderData(newState);
                    setPreviewContent(populateHtmlContent(base64Data, selectedTemplate?.placeholders || [], imageStyles));
                })();
            }

            return newState;
        });

        if (!manuallyEditedFields.has(name)) {
            setManuallyEditedFields(prev => new Set(prev).add(name));
        }
    };

    const handleFileChange = (name, e) => {
        const file = e.target.files[0];
        if (file) {
            setUploadedFiles(prev => ({ ...prev, [name]: file }));
            const reader = new FileReader();
            reader.onloadend = () => handleInputChange(name, reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleImageStyleChange = (name, key, value) => {
        setImageStyles(prev => {
            const newStyles = { ...prev, [name]: { ...(prev[name] || {}), [key]: value } };

            if (docxTemplateBuffer.current) {
                updateWordPreview(formData, newStyles);
            } else {
                // Use async update for HTML templates to convert images to base64
                (async () => {
                    const base64Data = await prepareRenderData(formData);
                    setPreviewContent(populateHtmlContent(base64Data, selectedTemplate?.placeholders || [], newStyles));
                })();
            }

            return newStyles;
        });
    };

    const handleArrayInputChange = (blockName, index, fieldName, value) => {
        setFormData(prev => {
            const updatedArray = [...(prev[blockName] || [])];
            if (!updatedArray[index]) updatedArray[index] = {};
            updatedArray[index] = { ...updatedArray[index], [fieldName]: value };

            const newState = { ...prev, [blockName]: updatedArray };

            if (docxTemplateBuffer.current) {
                updateWordPreview(newState, imageStyles);
            } else {
                // Use async update for HTML templates to convert images to base64
                (async () => {
                    const base64Data = await prepareRenderData(newState);
                    setPreviewContent(populateHtmlContent(base64Data, selectedTemplate?.placeholders || [], imageStyles));
                })();
            }

            return newState;
        });

        setManuallyEditedFields(prev => new Set(prev).add(`${blockName}[${index}].${fieldName}`));
    };

    const populateHtmlContent = useCallback((data, placeholders, styles) => {
        if (!selectedTemplate?.content) return '[NO TEMPLATE CONTENT]';

        // FIRST: Process the raw template content to preserve its native spaces/newlines
        let content = selectedTemplate.content
            .trimStart() // Remove leading whitespace/newlines
            .replace(/  +/g, (match) => '&nbsp;'.repeat(match.length))
            .replace(/\n/g, '<br />')
            .replace(/^(<br\s*\/?>)+/, '') // Remove leading <br> tags
            .replace(/^(<p[^>]*>\s*<\/p>)+/, '') // Remove leading empty <p> tags
            .replace(/^(<div[^>]*>\s*<\/div>)+/, ''); // Remove leading empty <div> tags

        let processedHeader = (headerContent || '')
            .trimStart()
            .replace(/  +/g, (match) => '&nbsp;'.repeat(match.length))
            .replace(/\n/g, '<br />')
            .replace(/^(<br\s*\/?>)+/, '')
            .replace(/^(<p[^>]*>\s*<\/p>)+/, '')
            .replace(/^(<div[^>]*>\s*<\/div>)+/, '');

        let processedFooter = (footerContent || '')
            .trimStart()
            .replace(/  +/g, (match) => '&nbsp;'.repeat(match.length))
            .replace(/\n/g, '<br />')
            .replace(/^(<br\s*\/?>)+/, '')
            .replace(/^(<p[^>]*>\s*<\/p>)+/, '')
            .replace(/^(<div[^>]*>\s*<\/div>)+/, '');

        // AUTO-DETECT AND FIX TABLE STRUCTURE
        // Check if there's a table with placeholders that should be inside a repeating block
        const tableRegex = /(<table[^>]*>)([\s\S]*?)(<\/table>)/gi;
        const blockPlaceholders = Object.keys(groupedPlaceholders.blocks);

        content = content.replace(tableRegex, (match, tableOpen, tableContent, tableClose) => {
            // Check if any block placeholders are in table content
            const hasBlockPlaceholder = blockPlaceholders.some(blockName =>
                tableContent.includes(`{#${blockName}}`) || tableContent.includes(`{/${blockName}}`)
            );

            if (!hasBlockPlaceholder) return match;

            // Find all <tr> elements in table
            const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            const rows = [];
            let trMatch;

            while ((trMatch = trRegex.exec(tableContent)) !== null) {
                rows.push(trMatch[0]);
            }

            if (rows.length < 2) return match; // Need at least header + data row

            // Assume first row is header, rest are data rows
            const headerRow = rows[0];
            const dataRows = rows.slice(1);

            // Check if data rows contain placeholders from any block
            const dataRowsHavePlaceholders = dataRows.some(row =>
                blockPlaceholders.some(blockName =>
                    row.includes(`{${blockName}.`) || row.includes(`{#${blockName}}`)
                )
            );

            if (!dataRowsHavePlaceholders) return match;

            // Find which block data rows belong to
            let targetBlock = null;
            for (const blockName of blockPlaceholders) {
                if (dataRows.some(row => row.includes(`{${blockName}.`))) {
                    targetBlock = blockName;
                    break;
                }
            }

            if (!targetBlock) return match;

            // Reconstruct table with block tags around data rows
            const newDataRows = dataRows.map(row => row).join('\n');
            return `${tableOpen}${headerRow}\n{#${targetBlock}}\n${newDataRows}\n{/${targetBlock}}\n${tableClose}`;
        });

        const universalReplace = (regex, replacement) => {
            content = content.replace(regex, replacement);
            processedHeader = processedHeader.replace(regex, replacement);
            processedFooter = processedFooter.replace(regex, replacement);
        };

        // 1. PROCESS REPEATING BLOCKS/TABLES
        Object.keys(groupedPlaceholders.blocks).forEach(blockName => {
            const block = groupedPlaceholders.blocks[blockName];
            const blockConfig = block.config || {};
            const isHorizontal = blockConfig.array_direction === 'horizontal';

            const blockRegex = new RegExp(`\\{#${blockName}\\}([\\s\\S]*?)\\{/${blockName}\\}`, 'g');
            const rows = Array.isArray(data[blockName]) ? data[blockName] : [];

            // Handle the block replacement in content, header, and footer
            const processBlockInText = (text) => {
                return text.replace(blockRegex, (_, innerTemplate) => {
                    if (rows.length === 0) return '';

                    // Handle Horizontal Logic (often used for digit-splitting styles)
                    if (isHorizontal) {
                        const childName = block.children[0]?.name || 'd';
                        const cells = rows.map(row => {
                            const value = extractDisplayValue(row[childName]);
                            return `<span style="display:inline-block;width:25px;height:30px;border:1px solid #000;text-align:center;line-height:30px;font-weight:bold;margin-right:2px;background:#fff;color:#000;">${value || '&nbsp;'}</span>`;
                        }).join('');
                        return `<div style="display:flex;align-items:center;">${cells}</div>`;
                    }

                    // Handle Standard Vertical Rows
                    return rows.map((row, rowIndex) => {
                        let rowHtml = innerTemplate;
                        block.children.forEach(child => {
                            const rawValue = row?.[child.name];
                            const cleanChildName = child.name.replace(/[{}]/g, '').trim();

                            // Handle dynamic format suffixes from template syntax for block children
                            const childFormatRegex = new RegExp(`\\{+\\s*%?\\s*${cleanChildName}\\s*(?:\\/\\s*([a-zA-Z0-9_]+))?\\s*\\}+`, 'g');

                            if (child.type === 'image') {
                                const value = typeof rawValue === 'string' ? rawValue : extractDisplayValue(rawValue);
                                if (value && (value.startsWith('http') || value.startsWith('data:image'))) {
                                    const styleKey = `${blockName}_${rowIndex}_${child.name}`;
                                    const style = styles[styleKey] || styles[child.name] || {};

                                    // Use custom style if available, otherwise use default values from placeholder configuration
                                    let imgWidth = "120px"; // default fallback for blocks
                                    if (style.imageWidth) {
                                        imgWidth = `${style.imageWidth}px`;
                                    } else if (child.image_width) {
                                        imgWidth = child.image_width;
                                    }

                                    const textAlign = style.textAlign || 'center';

                                    const imageHtml = `<div style="text-align:${textAlign};">
                                    <img src="${value}" style="width:${imgWidth}; height:auto; display:block; margin:${textAlign === 'center' ? '0 auto' : '0'}; border-radius: 2px;" 
                                         onerror="console.error('[HTML IMAGE DEBUG] Failed to load image:', '${value}'); this.style.display='none'; this.nextElementSibling.style.display='block';" />
                                    <div style="display:none; color:red; font-size:10px; border:1px solid red; margin:5px 0;">
                                        ❌ Failed to load: ${value.substring(0, 50)}...
                                    </div>
                                </div>`;
                                    rowHtml = rowHtml.replace(childFormatRegex, imageHtml);
                                } else {
                                    rowHtml = rowHtml.replace(childFormatRegex, `<span style="color:#ccc; font-size: 8px;">[Empty Image: ${child.display_value || child.name}]</span>`);
                                }
                            } else {
                                // Standard text inside block with format suffix support
                                const value = extractDisplayValue(rawValue);
                                rowHtml = rowHtml.replace(childFormatRegex, (match, formatSuffix) => {
                                    let formattedValue = value;
                                    if (formatSuffix) {
                                        formattedValue = applyFormat(value, formatSuffix);
                                    }
                                    return String(formattedValue || '');
                                });
                            }
                        });
                        return rowHtml;
                    }).join('');
                });
            };

            content = processBlockInText(content);
            processedHeader = processBlockInText(processedHeader);
            processedFooter = processBlockInText(processedFooter);
        });

        // 2. PROCESS TOP LEVEL PLACEHOLDERS
        (placeholders || []).forEach(placeholder => {
            if (placeholder.parent_name) return;

            const rawValue = data[placeholder.name];
            const cleanName = placeholder.name.replace(/[{}]/g, '').trim();
            const formatSuffix = placeholder.format || '';
            const regex = new RegExp(`\\{+\\s*%?\\s*${cleanName}${formatSuffix ? '\\s*\\/\\s*' + formatSuffix : ''}\\s*\\}+`, 'gi');

            // Handle Digit Splitting (Sequences like {passport_1}, {passport_2})
            if (placeholder.is_digit_split) {
                const chars = processDigitSplit(rawValue, placeholder.digit_count || 8);
                for (let i = 1; i <= (placeholder.digit_count || 8); i++) {
                    const seqRegex = new RegExp(`\\{+\\s*%?\\s*${cleanName}_${i}\\s*\\}+`, 'gi');
                    universalReplace(seqRegex, chars[i - 1] || '&nbsp;');
                }
                universalReplace(regex, extractDisplayValue(rawValue) || '');
            } else if (placeholder.type === 'image') {
                const value = typeof rawValue === 'string' ? rawValue : extractDisplayValue(rawValue);
                const cleanName = placeholder.name.replace(/[{}]/g, '').trim();
                const imageFormatSuffix = placeholder.format || '';
                const regex = new RegExp(`\\{+\\s*%?\\s*${cleanName}${imageFormatSuffix ? '\\s*\\/\\s*' + imageFormatSuffix : ''}\\s*\\}+`, 'gi');
                if (value && (value.startsWith('http') || value.startsWith('data:image'))) {
                    const style = styles[placeholder.name] || {};

                    // Use custom style if available, otherwise use default values from placeholder configuration
                    let imgWidth = "200px"; // default fallback
                    if (style.imageWidth) {
                        imgWidth = `${style.imageWidth}px`;
                    } else if (placeholder.image_width) {
                        imgWidth = placeholder.image_width;
                    }

                    const textAlign = style.textAlign || 'center';

                    const imageHtml = `<div style="text-align:${textAlign};">
        <img src="${value}" style="width:${imgWidth}; height:auto; max-width:100%; display:inline-block; border-radius: 4px;" 
             onerror="console.error('[HTML IMAGE DEBUG] Failed to load image:', '${value}'); this.style.display='none'; this.nextElementSibling.style.display='block';" />
        <div style="display:none; color:red; font-size:10px; border:1px solid red; margin:5px 0;">
            ❌ Failed to load: ${value.substring(0, 50)}...
        </div>
    </div>`;

                    universalReplace(regex, imageHtml);
                } else {
                    universalReplace(regex, `<div style="border:1px dashed #cbd5e1; padding:10px; text-align:center; color:#94a3b8; font-size:10px; border-radius:4px;">[Upload Image: ${placeholder.display_value || placeholder.name}]</div>`);
                }
            } else {
                const value = extractDisplayValue(rawValue);

                // Handle dynamic format suffixes from template syntax (e.g., /upper, /capital, /lower)
                // Match placeholder with any format suffix
                const formatRegex = new RegExp(`\\{+\\s*%?\\s*${cleanName}\\s*(?:\\/\\s*([a-zA-Z0-9_]+))?\\s*\\}+`, 'gi');

                universalReplace(formatRegex, (match, formatSuffix) => {
                    let formattedValue = value;
                    // Apply case formatting if format suffix is present
                    if (formatSuffix) {
                        formattedValue = applyFormat(value, formatSuffix);
                    }
                    // Apply whitespace formatting
                    formattedValue = formatWhitespace(formattedValue);

                    return formattedValue ||
                        `<span style="background-color: #fef9c3; color: #854d0e; padding: 0 2px; border-radius: 2px;">[${placeholder.display_value || placeholder.name}]</span>`;
                });
            }
        });

        return `
        ${processedHeader ? `<div class="doc-header" style="margin: 0; padding: 0;">${processedHeader}</div>` : ''}
        <div class="doc-body" style="font-family: 'Times New Roman', Times, serif; line-height: 1.5; color: #000; white-space: pre-wrap; margin: 0; padding: 0;">
            ${content}
        </div>
        ${processedFooter ? `<div class="doc-footer" style="border-top:0.5px solid #e2e8f0; font-size: 10px; margin: 0; padding: 0;">${processedFooter}</div>` : ''}
`;

    }, [selectedTemplate, groupedPlaceholders, headerContent, footerContent]);

    const prepareRenderData = useCallback(async (data) => {
        const renderData = {};
        const imagePromises = [];

        for (const blockName of Object.keys(groupedPlaceholders.blocks)) {
            const block = groupedPlaceholders.blocks[blockName];
            const rows = JSON.parse(JSON.stringify(data[blockName] || []));
            for (const row of rows) {
                for (const child of block.children) {
                    // Use raw value for images
                    const displayValue = child.type === 'image' && typeof row[child.name] === 'string'
                        ? row[child.name]  // ✅ Preserve raw string
                        : extractDisplayValue(row[child.name]);

                    row[child.name] = displayValue;

                    if (child.type === 'image' && displayValue && displayValue.startsWith('http')) {
                        const promise = fetchImageAsBase64(displayValue).then(b64 => {
                            if (b64) {
                                row[child.name] = b64;
                            }
                        });
                        imagePromises.push(promise);  // ← THIS LINE WAS MISSING
                    }
                }
            }
            renderData[blockName] = rows;
        }

        if (!selectedTemplate) return renderData;

        (selectedTemplate.placeholders || []).forEach(p => {
            const val = data[p.name];
            const baseKey = p.name.replace(/[%#{}]/g, '').trim();

            if (p.parent_name || p.is_block_start) return;

            if (p.is_digit_split) {
                const strVal = extractDisplayValue(val);
                const chars = processDigitSplit(strVal, p.digit_count || 8);
                const count = p.digit_count || 8;
                for (let i = 1; i <= count; i++) {
                    renderData[`${baseKey.toLowerCase()}_${i}`] = chars[i - 1] || "";
                    renderData[`${baseKey.toUpperCase()}_${i}`] = chars[i - 1] || "";
                }
                renderData[baseKey] = strVal;
            }
            else if (p.type === 'boolean') {
                const options = Array.isArray(val) ? val : [];
                options.forEach(opt => {
                    if (opt && opt.tag) {
                        renderData[opt.tag] = opt.checked ? extractDisplayValue([opt].filter(o => o.checked)) : "";
                    }
                });
                renderData[baseKey] = extractDisplayValue(val);
            }
            else if (p.type === 'image') {
                const displayValue = typeof val === 'string' ? val : extractDisplayValue(val);
                if (displayValue && displayValue.startsWith('http')) {
                    imagePromises.push(fetchImageAsBase64(displayValue).then(b64 => {
                        renderData[baseKey] = b64 || displayValue;
                    }));
                } else {
                    renderData[baseKey] = displayValue;
                }
            }
            else {
                renderData[baseKey] = extractDisplayValue(val);
            }
        });

        await Promise.all(imagePromises);
        return renderData;
    }, [groupedPlaceholders, selectedTemplate]);

    const updateWordPreview = useCallback(async (data, styles) => {
        if (!docxTemplateBuffer.current) return;

        try {
            setIsPreviewLoading(true);
            let templateBuffer = docxTemplateBuffer.current;
            if (templateBuffer && typeof templateBuffer.then === 'function') {
                templateBuffer = await templateBuffer;
            }

            if (!templateBuffer) return;

            const zip = new PizZip(templateBuffer);
            const renderData = await prepareRenderData(data);

            const processedData = { ...renderData };
            const imagePromises = Object.entries(renderData)
                .filter(([_, value]) => value && typeof value === 'string' &&
                    (value.startsWith('http') || value.startsWith('data:image')))
                .map(async ([key, value]) => {
                    try {
                        const buffer = await base64Parser(value);
                        if (buffer) {
                            processedData[key] = `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
                        }
                    } catch (err) {
                        console.warn(`⚠️ Failed to process image for ${key}:`, err);
                    }
                });

            await Promise.all(imagePromises);

            const imageModule = new ImageModule({
                centered: false,
                getImage: (tag) => {
                    if (!tag) return null;
                    try {
                        if (tag.startsWith('data:image')) {
                            const base64Data = tag.split('base64,')[1];
                            const binaryStr = atob(base64Data);
                            const len = binaryStr.length;
                            const bytes = new Uint8Array(len);
                            for (let i = 0; i < len; i++) {
                                bytes[i] = binaryStr.charCodeAt(i);
                            }
                            return bytes.buffer;
                        }
                        return null;
                    } catch (error) {
                        console.error('Error processing image:', error);
                        return null;
                    }
                },
                getSize: (img, tag, name) => {
                    const s = styles[name];

                    // Use custom style if available, otherwise try to get default from placeholder configuration
                    if (s && (s.imageWidth || s.imageHeight)) {
                        return [s.imageWidth || 300, s.imageHeight || 200];
                    }

                    // Try to find the placeholder and use its default values
                    const placeholder = selectedTemplate?.placeholders?.find(p => p.name === name && p.type === 'image');
                    if (placeholder) {
                        const defaultWidth = placeholder.image_width ? parseInt(placeholder.image_width.replace('px', '')) : 300;
                        const defaultHeight = placeholder.image_height ? parseInt(placeholder.image_height.replace('px', '')) : 200;
                        return [defaultWidth, defaultHeight];
                    }

                    return [300, 200];
                },
            });

            const doc = new Docxtemplater();
            doc.loadZip(zip);
            doc.attachModule(imageModule);
            doc.setOptions({
                paragraphLoop: true,
                linebreaks: true,
                nullGetter: () => ""
            });

            doc.setData(processedData);
            doc.render();

            const out = doc.getZip().generate({ type: "arraybuffer" });

            const result = await mammoth.convertToHtml(
                { arrayBuffer: out },
                {
                    styleMap: [
                        "p => p:fresh",
                        "table => table.border-collapse.table-auto.w-full.my-4",
                        "td => td.border.p-2",
                        "th => th.border.bg-muted.p-2.font-bold"
                    ],
                    convertImage: mammoth.images.imgElement(function (image) {
                        return image.read("base64").then(function (imageBuffer) {
                            return {
                                src: "data:" + (image.contentType || 'image/png') + ";base64," + imageBuffer
                            };
                        }).catch(err => {
                            console.warn('Failed to convert image in preview:', err);
                            return { src: '' };
                        });
                    })
                }
            );

            setPreviewContent(result.value);

        } catch (err) {
            console.error("❌ [updateWordPreview] Error:", err);
            toast({
                title: "Preview Error",
                description: err.message || 'Failed to generate preview',
                variant: "destructive"
            });
        } finally {
            setIsPreviewLoading(false);
        }
    }, [selectedTemplate, toast, prepareRenderData]);

    useEffect(() => {
        if (!isOpen) return;

        const updatePreview = async () => {
            const current = availableTemplates.find(t => t.id === selectedTemplate?.id) || availableTemplates[0] || template;

            if (current?.file_path && current?.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                if (!docxTemplateBuffer.current) {
                    setIsPreviewLoading(true);

                    // Fix: Handle both old and new storage path structures
                    let publicUrl;
                    if (current.file_path.startsWith('kyc-templates/')) {
                        // New structure: use signed URL for private bucket
                        const { data, error } = await supabase.storage
                            .from('templates')
                            .createSignedUrl(current.file_path, 3600); // 1 hour expiry

                        if (error) {
                            console.error('Error creating signed URL:', error);
                            setIsPreviewLoading(false);
                            return;
                        }
                        publicUrl = data.signedUrl;
                    } else {
                        // Old structure: use public URL
                        publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/templates/${current.file_path}`;
                    }

                    // Use Microsoft Office Online Viewer for consistent preview
                    setDocPreviewUrl(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicUrl)}`);

                    try {
                        const arrayBuffer = await fetchTemplateBuffer(current.id, current.file_path);
                        if (!arrayBuffer) {
                            throw new Error('Failed to fetch template buffer');
                        }
                        docxTemplateBuffer.current = arrayBuffer;

                        // Update preview after loading
                        setTimeout(() => {
                            updateWordPreview(formData, imageStyles);
                        }, 100);
                    } catch (error) {
                        console.error('Error loading template:', error);
                        toast({
                            title: "Template Loading Error",
                            description: "Could not load the Word document template",
                            variant: "destructive"
                        });
                    } finally {
                        setIsPreviewLoading(false);
                    }
                } else {
                    updateWordPreview(formData, imageStyles);
                }
            } else {
                // HTML template
                setIsPreviewLoading(true);
                try {
                    const base64Data = await prepareRenderData(formData);
                    setPreviewContent(populateHtmlContent(base64Data, current?.placeholders || [], imageStyles));
                } catch (err) {
                    console.error('Preview error:', err);
                } finally {
                    setIsPreviewLoading(false);
                }
            }
        };

        updatePreview();
    }, [isOpen, selectedTemplate?.id, formData, imageStyles, fetchTemplateBuffer]); // Added dependencies to refresh on change

    useEffect(() => {
        if (isOpen && (headerContent || footerContent) && formData) {
            if (docxTemplateBuffer.current) {
                updateWordPreview(formData, imageStyles);
            } else {
                setPreviewContent(populateHtmlContent(formData, selectedTemplate?.placeholders || [], imageStyles));
            }
        }
    }, [headerContent, footerContent, isOpen]);

    const changedFields = useMemo(() => {
        const changes = [];

        groupedPlaceholders.topLevel.forEach(placeholder => {
            const original = originalFormData[placeholder.name];
            const current = formData[placeholder.name];

            if (placeholder.type === 'boolean') {
                if (Array.isArray(original) && Array.isArray(current)) {
                    const hasChanged = current.some((opt, idx) => {
                        const origOpt = original[idx];
                        return origOpt?.checked !== opt?.checked;
                    });

                    if (hasChanged) {
                        let targetInfo = null;

                        if (placeholder.master_field_ids?.length > 0) {
                            const masterField = masterFields.get(parseInt(placeholder.master_field_ids[0]));
                            if (masterField?.sources?.[0]) {
                                const source = masterField.sources.find(s =>
                                    s.source_type === (placeholder.entity_type || 'company')
                                ) || masterField.sources[0];

                                let entityId = entityIdMap[placeholder.entity_type || 'company'];

                                if (placeholder.director_type === 'primary') {
                                    const primaryDir = findPrimaryDirector({ ...sourceDataCache, ...additionalCache });
                                    entityId = primaryDir?.id || primaryDir?.director_id || primaryDir?.individual_id;
                                }

                                targetInfo = {
                                    table: source.table,
                                    path: source.path,
                                    linkingVariable: source.linking_variable || 'id',
                                    entityId: entityId
                                };
                            }
                        }

                        changes.push({
                            placeholder,
                            oldValue: original,
                            newValue: current,
                            targetInfo,
                            source: autoPopulatedFields.get(placeholder.name)
                        });
                    }
                }
            } else {
                const originalStr = String(original || '');
                const currentStr = String(current || '');

                if (original !== current && (currentStr.trim() !== '' || originalStr.trim() !== '')) {
                    let targetInfo = null;

                    if (placeholder.master_field_ids?.length > 0) {
                        const masterField = masterFields.get(parseInt(placeholder.master_field_ids[0]));
                        if (masterField?.sources?.[0]) {
                            const source = masterField.sources.find(s =>
                                s.source_type === (placeholder.entity_type || 'company')
                            ) || masterField.sources[0];

                            let entityId = entityIdMap[placeholder.entity_type || 'company'];

                            if (placeholder.director_type === 'primary') {
                                const primaryDir = findPrimaryDirector({ ...sourceDataCache, ...additionalCache });
                                entityId = primaryDir?.id || primaryDir?.director_id || primaryDir?.individual_id;
                            }

                            targetInfo = {
                                table: source.table,
                                path: source.path,
                                linkingVariable: source.linking_variable || 'id',
                                entityId: entityId
                            };
                        }
                    }

                    changes.push({
                        placeholder,
                        oldValue: original,
                        newValue: current,
                        targetInfo,
                        source: autoPopulatedFields.get(placeholder.name)
                    });
                }
            }
        });

        return changes;
    }, [formData, originalFormData, groupedPlaceholders, masterFields, entityIdMap, autoPopulatedFields, sourceDataCache, additionalCache]);

    const handleUpdateProfile = async () => {
        setIsSavingProfile(true);

        try {
            // 1. Group changes by Table and Entity ID to minimize DB calls
            const groups = changedFields.reduce((acc, change) => {
                if (!change.targetInfo?.table || !change.targetInfo?.entityId) return acc;
                const key = `${change.targetInfo.table}:${change.targetInfo.entityId}`;
                if (!acc[key]) {
                    acc[key] = {
                        table: change.targetInfo.table,
                        entityId: change.targetInfo.entityId,
                        linkingVariable: change.targetInfo.linkingVariable || 'id',
                        changes: []
                    };
                }
                acc[key].changes.push(change);
                return acc;
            }, {});

            const results = [];

            // 2. Process each entity group
            for (const key in groups) {
                const { table, entityId, linkingVariable, changes } = groups[key];

                // 3. Fetch current state from DB to avoid wiping out sibling JSON fields
                const { data: existingRecord, error: fetchError } = await supabase
                    .from(table)
                    .select('*')
                    .eq(linkingVariable, entityId)
                    .maybeSingle();

                if (fetchError) throw fetchError;

                let updatePayload = {};
                const recordToUpdate = existingRecord || {};

                for (const change of changes) {
                    const { path } = change.targetInfo;
                    const valueToSave = change.newValue;

                    if (path) {
                        // Parse path: "residential_address_details -> location -> city" 
                        // or "metadata->>'phone'"
                        const pathParts = path
                            .split(/->>|->|\./) // Split by Supabase operators OR dots
                            .map(p => p.trim().replace(/['"]/g, ''))
                            .filter(Boolean);

                        const column = pathParts[0];
                        const nestedPath = pathParts.slice(1);

                        if (nestedPath.length > 0) {
                            // It's a JSON column update
                            // Initialize with existing JSON data if available
                            const existingJson = { ...(recordToUpdate[column] || {}) };
                            const updatedJson = setDeepValue(existingJson, nestedPath, valueToSave);
                            updatePayload[column] = updatedJson;
                        } else {
                            // Standard column update
                            updatePayload[column] = valueToSave;
                        }
                    }
                }

                // 4. Push update to Supabase
                if (Object.keys(updatePayload).length > 0) {
                    const { error: updateError } = await supabase
                        .from(table)
                        .update({ ...updatePayload, updated_at: new Date().toISOString() })
                        .eq(linkingVariable, entityId);

                    results.push({ success: !updateError, error: updateError });
                }
            }

            const successCount = results.filter(r => r.success).length;
            if (successCount > 0) {
                toast({
                    title: "Profile Updated",
                    description: `Successfully saved changes to ${successCount} record(s).`,
                });
                setOriginalFormData(JSON.parse(JSON.stringify(formData)));
                setManuallyEditedFields(new Set());
            }
        } catch (error) {
            console.error('[Update Profile] Error:', error);
            toast({
                title: "Update Failed",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setIsSavingProfile(false);
        }
    };

    const setDeepValue = (obj, pathParts, value) => {
        let current = obj;
        for (let i = 0; i < pathParts.length - 1; i++) {
            const key = pathParts[i];
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        current[pathParts[pathParts.length - 1]] = value;
        return obj;
    };

    const saveFieldToDatabase = async (placeholder, newValue, specificSource = null, arrayIndex = null) => {
        setIsSavingProfile(true);
        try {
            let table, path, linkVar, entId, sourceLabel = "Profile";

            // ---------------------------------------------------------
            // 1. Resolve Target Entity (Who are we saving this for?)
            // ---------------------------------------------------------
            let sourceArray = null;
            if (arrayIndex !== null && placeholder.parent_name) {
                const blockName = placeholder.parent_name;
                const blockPlaceholder = selectedTemplate?.placeholders?.find(p => p.name === blockName && p.is_block_start);
                if (blockPlaceholder) {
                    const entityType = Array.isArray(blockPlaceholder.entity_type) ? blockPlaceholder.entity_type[0] : (blockPlaceholder.entity_type || 'director');
                    // Normalize type for matching
                    const normType = entityType.toLowerCase();
                    if (normType === 'director') sourceArray = relationshipData.directors;
                    else if (['dependant', 'spouse', 'child'].includes(normType)) sourceArray = relationshipData.dependants;
                }
            }

            const targetEntity = getTargetEntity(placeholder, relationshipData, arrayIndex, sourceArray, entityIdMap, combinedCache, extractedData, companyData);

            // Determine the ID immediately
            entId = targetEntity?.id || targetEntity?.individual_id || targetEntity?.director_id || targetEntity?.company_id;

            // Fallback: If getTargetEntity returns a generic object without ID, try the map
            if (!entId && placeholder.entity_type) {
                const typeKey = Array.isArray(placeholder.entity_type) ? placeholder.entity_type[0] : placeholder.entity_type;
                entId = entityIdMap[typeKey];
            }
            if (specificSource?.type === 'db') {
                const mf = masterFields.get(parseInt(specificSource.id));
                let src = mf?.sources?.find(s => s.table === specificSource.table);

                if (!src) {
                    const pEnt = Array.isArray(placeholder.entity_type) ? placeholder.entity_type[0] : (placeholder.entity_type || 'company');
                    const targetType = (pEnt === 'company') ? 'company' : 'individual';
                    src = mf?.sources?.find(s => s.source_type === targetType) || mf?.sources?.[0];
                }

                if (!src) throw new Error(`Source configuration not found for Master Field ${specificSource.id}`);

                table = src.table;
                path = src.path;
                linkVar = src.linking_variable || 'id';
                sourceLabel = `Master Field: ${mf?.label || specificSource.id}`;
            }
            // CASE B: User selected a Job Question source
            else if (specificSource?.type === 'job') {
                table = 'tm_tasks';
                path = `job_specific_answers->>'${specificSource.id}'`;
                linkVar = 'id';
                entId = task?.id;
                sourceLabel = `Job Question: ${specificSource.id}`;
            }
            else {
                const mfId = placeholder.master_field_ids?.[0];
                if (!mfId) throw new Error("No Master Field ID linked to this placeholder");

                const mf = masterFields.get(parseInt(mfId));
                if (!mf || !mf.sources) throw new Error("Master Field configuration missing");

                let targetType = 'individual';

                const pTypes = Array.isArray(placeholder.entity_type) ? placeholder.entity_type : [placeholder.entity_type];

                if (pTypes.includes('company')) {
                    targetType = 'company';
                } else if (targetEntity && (targetEntity.company_name || targetEntity.registration_number)) {
                    targetType = 'company';
                }

                const src = mf.sources.find(s => s.source_type === targetType)
                    || mf.sources[0]; // Fallback to first if no specific match

                if (!src) throw new Error(`No database source found for type '${targetType}'`);

                table = src.table;
                path = src.path;
                linkVar = src.linking_variable || 'id';

                if (targetType === 'individual' && table.includes('acc_portal_company')) {
                    const altSource = mf.sources.find(s => s.table === 'registry_individuals' || s.source_type === 'individual');
                    if (altSource) {
                        table = altSource.table;
                        path = altSource.path;
                        linkVar = altSource.linking_variable || 'id';
                    }
                }
            }

            if (!entId || !table) {
                throw new Error(`Could not resolve database target. Table: ${table}, ID: ${entId}`);
            }

            const { data: existing, error: findError } = await supabase.from(table).select('*').eq(linkVar, entId).maybeSingle();

            let updatePayload = {};

            if (path && (path.includes('->') || path.includes('.'))) {
                const pathParts = path.split(/->>|->|\./).map(p => p.trim().replace(/['"]/g, '')).filter(Boolean);
                const column = pathParts[0];
                const nestedPath = pathParts.slice(1);
                const existingJson = existing ? { ...(existing[column] || {}) } : {};
                const setDeepValue = (obj, parts, val) => {
                    let current = obj;
                    for (let i = 0; i < parts.length - 1; i++) {
                        const key = parts[i];
                        if (!(key in current) || typeof current[key] !== 'object') {
                            current[key] = {};
                        }
                        current = current[key];
                    }
                    current[parts[parts.length - 1]] = val;
                    return obj;
                };

                updatePayload[column] = setDeepValue(existingJson, nestedPath, newValue);
            } else {
                updatePayload[path || placeholder.name] = newValue;
            }

            const { error: updateError } = await supabase
                .from(table)
                .update({ ...updatePayload, updated_at: new Date().toISOString() })
                .eq(linkVar, entId);

            if (updateError) throw updateError;
            const { data: refreshedRecord, error: fetchError } = await supabase
                .from(table)
                .select('*')
                .eq(linkVar, entId)
                .single();

            if (fetchError) throw fetchError;

            setAdditionalCache(prev => ({
                ...prev,
                [table]: {
                    ...(prev[table] || {}),
                    [entId]: refreshedRecord
                }
            }));

            const updatedCombinedCache = {
                ...combinedCache,
                ...additionalCache,
                [table]: {
                    ...(combinedCache[table] || {}),
                    ...(additionalCache[table] || {}),
                    [entId]: refreshedRecord
                }
            };

            const match = processPlaceholderValue(
                placeholder,
                relationshipData,
                updatedCombinedCache,
                masterFields,
                entityIdMap,
                extractedData,
                companyData,
                arrayIndex,
                sourceArray,
                task,
                computedFieldCache
            );

            const finalResolvedValue = placeholder.type === 'boolean' ? match.value : extractDisplayValue(match.value);
            if (arrayIndex !== null && placeholder.parent_name) {
                handleArrayInputChange(placeholder.parent_name, arrayIndex, placeholder.name, finalResolvedValue);
            } else {
                handleInputChange(placeholder.name, finalResolvedValue);
            }
            setOriginalFormData(prev => {
                const updated = JSON.parse(JSON.stringify(prev));
                if (arrayIndex !== null && placeholder.parent_name) {
                    if (!updated[placeholder.parent_name]) updated[placeholder.parent_name] = [];
                    if (!updated[placeholder.parent_name][arrayIndex]) updated[placeholder.parent_name][arrayIndex] = {};
                    updated[placeholder.parent_name][arrayIndex][placeholder.name] = finalResolvedValue;
                } else {
                    updated[placeholder.name] = finalResolvedValue;
                }
                return updated;
            });

            toast({ title: "Field Updated", description: `Synced with ${sourceLabel}` });

        } catch (e) {
            console.error('Save Error:', e);
            toast({ title: "Save Error", description: e.message, variant: "destructive" });
        } finally {
            setIsSavingProfile(false);
        }
    };

    const refineFieldWithAI = async (placeholder, allFormData) => {
        if (!placeholder.ai_prompt) return null;
        const regex = /\{([^}]+)\}/g;
        const finalPrompt = placeholder.ai_prompt.replace(regex, (match, key) => {
            const val = allFormData[key];
            return (val && typeof val !== 'object') ? val : match;
        });
        try {
            const response = await fetch('/api/ai/refine', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: finalPrompt,
                    fieldName: placeholder.name
                })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'AI Refinement failed');
            }

            const data = await response.json();
            return data.result;
        } catch (err) {
            toast({
                title: "AI Error",
                description: err.message,
                variant: "destructive"
            });
            return null;
        }
    };

    const refineAllFieldsWithAI = useCallback(async () => {
        const aiFields = selectedTemplate.placeholders?.filter(p => p.is_ai_generated && p.ai_prompt) || [];
        if (aiFields.length === 0) {
            toast({
                title: "No AI Fields",
                description: "No fields with AI prompts found in this template",
                variant: "destructive"
            });
            return;
        }

        setIsGenerating(true);

        try {
            const batchRequest = aiFields.map(field => {
                const regex = /\{([^}]+)\}/g;
                const finalPrompt = field.ai_prompt.replace(regex, (match, key) => {
                    const val = formData[key];
                    return (val && typeof val !== 'object') ? val : match;
                });

                return {
                    fieldName: field.name,
                    prompt: finalPrompt
                };
            });
            const response = await fetch('/api/ai/refine', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: batchRequest })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Batch AI refinement failed');
            }

            const data = await response.json();
            const updatedData = { ...formData };
            data.results.forEach(result => {
                if (result.success && result.value) {
                    updatedData[result.fieldName] = result.value;
                }
            });

            setFormData(updatedData);

            const successCount = data.results.filter(r => r.success).length;
            toast({
                title: "AI Refine Complete",
                description: `Successfully refined ${successCount}/${aiFields.length} fields`,
            });

        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to refine fields with AI",
                variant: "destructive"
            });
        } finally {
            setIsGenerating(false);
        }
    }, [formData, selectedTemplate, toast]);

    const handleSingleFieldAIRefine = async (placeholder) => {
        setRefiningFields(prev => new Set(prev).add(placeholder.name));

        const refinedValue = await refineFieldWithAI(placeholder, formData);

        if (refinedValue) {
            handleInputChange(placeholder.name, refinedValue);
            toast({
                title: "AI Refined",
                description: `Refined content for ${placeholder.name}`,
            });
        } else {
            toast({
                title: "Refinement Failed",
                description: "Could not generate AI content. Check your API settings.",
                variant: "destructive"
            });
        }

        setRefiningFields(prev => {
            const next = new Set(prev);
            next.delete(placeholder.name);
            return next;
        });
    };

    const completionStats = useMemo(() => {
        let totalFields = groupedPlaceholders.topLevel.length;
        let filledFields = groupedPlaceholders.topLevel.filter(p =>
            formData[p.name] && String(formData[p.name]).trim() !== ''
        ).length;

        Object.keys(groupedPlaceholders.blocks).forEach(blockName => {
            const rows = Array.isArray(formData[blockName]) ? formData[blockName] : [];
            if (rows.length > 0) {
                totalFields += rows.length * groupedPlaceholders.blocks[blockName].children.length;
                rows.forEach(row => {
                    if (row && typeof row === 'object') {
                        groupedPlaceholders.blocks[blockName].children.forEach(child => {
                            if (row[child.name] && String(row[child.name]).trim() !== '') {
                                filledFields++;
                            }
                        });
                    }
                });
            }
        });

        return {
            total: totalFields,
            filled: filledFields,
            percentage: totalFields ? Math.round((filledFields / totalFields) * 100) : 0
        };
    }, [formData, groupedPlaceholders]);

    const saveAsDraft = async () => {
        const config = getTargetConfig();
        if (!config) {
            toast({ title: "Error", description: "Entity context missing", variant: "destructive" });
            return;
        }

        setIsGenerating(true);
        try {
            const kycDocId = selectedTemplate?.document_id || template?.document_id;
            // --- 1. ROBUST BUFFER RECOVERY ---
            let templateBuffer = docxTemplateBuffer.current;
            // If buffer is missing and it's a Word template, try fetching it now
            if (!templateBuffer && isWordTemplate) {
                templateBuffer = await fetchTemplateBuffer(selectedTemplate.id, selectedTemplate.file_path);
                if (!templateBuffer) {
                    throw new Error("Failed to fetch template source from storage");
                }
                docxTemplateBuffer.current = templateBuffer; // Cache it for next time
            }

            let storagePath = null;
            if (isWordTemplate && templateBuffer) {
                const renderData = await prepareRenderData(formData);
                const zip = new PizZip(templateBuffer);
                const doc = new Docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                    nullGetter: () => ""
                });

                doc.setData(renderData);
                doc.render();
                const docBlob = doc.getZip().generate({
                    type: "blob",
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                });
                const timestamp = Date.now();
                const entityFolder = activeEntityType === 'company' ? 'company-documents' : 'individuals-documents';
                const path = `${entityFolder}/${config.entityId}/${kycDocId}_${timestamp}.docx`;

                const { data: storageData, error: storageError } = await supabase.storage
                    .from('kyc-documents')
                    .upload(path, docBlob, { cacheControl: '3600', upsert: true });
                if (storageError) {
                    throw storageError;
                }
                storagePath = storageData.path;
            } else if (isWordTemplate && !templateBuffer) {
                const renderData = await prepareRenderData(formData);
                const htmlContent = populateHtmlContent(renderData, selectedTemplate?.placeholders || [], imageStyles);
                const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
                const timestamp = Date.now();
                const entityFolder = activeEntityType === 'company' ? 'company-documents' : 'individuals-documents';
                const path = `${entityFolder}/${config.entityId}/${kycDocId}_${timestamp}_fallback.html`;
                const { data: storageData, error: storageError } = await supabase.storage
                    .from('kyc-documents')
                    .upload(path, htmlBlob, { cacheControl: '3600', upsert: true });
                if (storageError) {
                    throw storageError;
                }
                storagePath = storageData.path;
            } else {
                const renderData = await prepareRenderData(formData);
                const htmlContent = populateHtmlContent(renderData, selectedTemplate?.placeholders || [], imageStyles);

                const element = document.createElement('div');
                element.innerHTML = htmlContent;
                element.className = EDITOR_PREVIEW_STYLES + ' bg-white';
                element.style.width = '800px';

                // Import html2pdf dynamically
                const html2pdf = (await import('html2pdf.js')).default;

                const pdfBlob = await html2pdf()
                    .set({
                        margin: 10,
                        html2canvas: {
                            scale: 2,
                            useCORS: true,
                            logging: false
                        },
                        jsPDF: {
                            unit: 'mm',
                            format: 'a4',
                            orientation: 'portrait'
                        }
                    })
                    .from(element)
                    .output('blob');
                const timestamp = Date.now();
                const entityFolder = activeEntityType === 'company' ? 'company-documents' : 'individuals-documents';
                const path = `${entityFolder}/${config.entityId}/${kycDocId}_${timestamp}.pdf`;
                const { data: storageData, error: storageError } = await supabase.storage
                    .from('kyc-documents')
                    .upload(path, pdfBlob, { cacheControl: '3600', upsert: true });
                if (storageError) {
                    throw storageError;
                }
                storagePath = storageData.path;
            }
            const draftMetadata = {
                formData: formData,
                imageStyles: imageStyles,
                savedAt: new Date().toISOString(),
                templateId: selectedTemplate?.id,
                activeEntityType,
                activeEntityId
            };
            const payload = {
                [config.idColumn]: config.entityId,
                [config.docIdColumn]: kycDocId,
                file_path: storagePath,
                file_type: isWordTemplate ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf',
                status: 'draft',
                metadata: draftMetadata,
                updated_at: new Date().toISOString()
            };
            const { data: existingDraft, error: existingDraftError } = await supabase
                .from(config.table)
                .select('id, file_path')
                .eq(config.docIdColumn, kycDocId)
                .eq(config.idColumn, config.entityId)
                .eq('status', 'draft')
                .maybeSingle();

            let result;
            if (existingDraft) {
                if (existingDraft.file_path && storagePath && existingDraft.file_path !== storagePath) {
                    await supabase.storage.from('kyc-documents').remove([existingDraft.file_path]);
                }
                result = await supabase.from(config.table).update(payload).eq('id', existingDraft.id).select();
            } else {
                result = await supabase.from(config.table).insert([{ ...payload, created_at: new Date().toISOString() }]).select();
            }

            if (result.error) {
                console.error('❌ [saveAsDraft] Database error:', result.error);
                throw result.error;
            }
            setLoadedDraft(result.data[0]);
            setOriginalFormData(JSON.parse(JSON.stringify(formData)));
            setManuallyEditedFields(new Set());

            toast({ title: "Draft Saved", description: "Progress has been stored successfully." });
            if (refreshDocuments) await refreshDocuments();

        } catch (e) {
            console.error('❌ [saveAsDraft] Error:', e);
            console.error('❌ [saveAsDraft] Error stack:', e.stack);
            toast({ title: "Save Error", description: e.message, variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };

    const generateAndDownload = async (type) => {
        setIsGenerating(true);
        try {
            const fileName = `${documentName.replace(/[^\w\s-]/g, '_')}_${formatDate(new Date(), 'YYYYMMDD')}`;
            const renderData = await prepareRenderData(formData);

            // Pre-convert any remaining HTTP image URLs to base64 before docxtemplater renders
            const imageConversionPromises = Object.entries(renderData).map(async ([key, value]) => {
                if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('blob:'))) {
                    const b64 = await fetchImageAsBase64(value);
                    if (b64) renderData[key] = b64;
                }
            });
            await Promise.all(imageConversionPromises);
            if (isWordTemplate) {
                let templateBuffer = docxTemplateBuffer.current;

                // Resolve promise if the ref was set before the fetch completed
                if (templateBuffer && typeof (templateBuffer as any).then === 'function') {
                    templateBuffer = await templateBuffer;
                }

                // If still missing, fetch it now (same pattern as saveAsDraft)
                if (!templateBuffer) {
                    const filePath = selectedTemplate?.file_path;
                    if (!filePath) throw new Error('No template file path available');

                    templateBuffer = await fetchTemplateBuffer(selectedTemplate.id, filePath);
                    if (!templateBuffer) {
                        throw new Error('Failed to fetch template buffer');
                    }
                    docxTemplateBuffer.current = templateBuffer;   // cache for next time
                }

                // At this point templateBuffer is guaranteed to be an ArrayBuffer
                const zip = new PizZip(templateBuffer as ArrayBuffer);

                const imageModule = new ImageModule({
                    centered: false,
                    getImage: (tag) => {
                        if (!tag) return null;
                        try {
                            if (tag.startsWith('data:image')) {
                                const base64Data = tag.split('base64,')[1];
                                if (!base64Data) {
                                    console.error('Invalid base64 image data');
                                    return null;
                                }
                                const binaryStr = atob(base64Data);
                                const len = binaryStr.length;
                                const bytes = new Uint8Array(len);
                                for (let i = 0; i < len; i++) {
                                    bytes[i] = binaryStr.charCodeAt(i);
                                }
                                return bytes.buffer;
                            }
                            // All HTTP/blob URLs should have been converted to base64 already
                            // If we still get one here, log a warning
                            if (tag.startsWith('http') || tag.startsWith('blob:')) {
                                console.warn('Image URL not pre-converted to base64:', tag.substring(0, 80));
                                return null;
                            }
                            return null;
                        } catch (error) {
                            console.error('getImage error for tag:', tag?.substring(0, 80), error);
                            return null;
                        }
                    },
                    getSize: (img, tag, name) => {
                        const placeholder = selectedTemplate?.placeholders?.find(p => p.name === name);
                        if (placeholder?.type === 'image') {
                            const width = parseImageDimension(placeholder.image_width);
                            const height = parseImageDimension(placeholder.image_height);
                            return [width || 300, height || 200];
                        }
                        const s = imageStyles[name] || {};
                        return [s.imageWidth || 300, s.imageHeight || 200];
                    }
                });

                const doc = new Docxtemplater(zip, {
                    modules: [imageModule],
                    linebreaks: true,
                    paragraphLoop: true,
                    nullGetter: () => ""
                });

                doc.setData(renderData);
                doc.render();

                const docxBuffer = doc.getZip().generate({
                    type: "arraybuffer",
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                });

                if (type === 'word') {
                    const blob = new Blob([docxBuffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
                    saveAs(blob, `${fileName}.docx`);
                    toast({ title: "Success", description: `Document downloaded as ${fileName}.docx` });
                } else {
                    const result = await mammoth.convertToHtml({ arrayBuffer: docxBuffer });
                    const html2pdf = (await import('html2pdf.js')).default;
                    const element = document.createElement('div');
                    element.className = EDITOR_PREVIEW_STYLES + ' p-10 bg-white';
                    element.style.width = '800px';
                    element.innerHTML = result.value;

                    await html2pdf()
                        .set({
                            margin: 10,
                            filename: `${fileName}.pdf`,
                            image: { type: 'jpeg', quality: 0.98 },
                            html2canvas: { scale: 2, useCORS: true, logging: false },
                            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                        })
                        .from(element)
                        .save();
                }
            }
            else {
                const htmlContent = populateHtmlContent(
                    renderData,
                    selectedTemplate?.placeholders || [],
                    imageStyles
                );

                if (type === 'word') {
                    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' " +
                        "xmlns:w='urn:schemas-microsoft-com:office:word' " +
                        "xmlns='http://www.w3.org/TR/REC-html40'>" +
                        "<head><meta charset='utf-8'><title>Export</title></head><body>";
                    const footer = "</body></html>";
                    const sourceHTML = header + htmlContent + footer;

                    const blob = new Blob(['\ufeff', sourceHTML], {
                        type: 'application/msword'
                    });
                    saveAs(blob, `${fileName}.doc`);
                    toast({ title: "Success", description: `Document downloaded as ${fileName}.doc` });
                } else {
                    const element = document.createElement('div');
                    element.innerHTML = htmlContent;
                    element.className = EDITOR_PREVIEW_STYLES + ' bg-white';
                    element.style.whiteSpace = 'pre-wrap';
                    element.style.width = '800px';
                    element.style.padding = '20px';

                    document.body.appendChild(element);

                    const html2pdf = (await import('html2pdf.js')).default;
                    await html2pdf()
                        .set({
                            margin: 10,
                            filename: `${fileName}.pdf`,
                            image: { type: 'jpeg', quality: 0.98 },
                            html2canvas: { scale: 2, useCORS: true, letterRendering: true },
                            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                        })
                        .from(element)
                        .save();

                    document.body.removeChild(element);
                    toast({ title: "Success", description: `Document downloaded as ${fileName}.pdf` });
                }
            }
        } catch (e) {
            console.error('[generateAndDownload] Error:', e);
            toast({
                title: "Error",
                description: e instanceof Error ? e.message : String(e),
                variant: "destructive"
            });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="max-w-[98vw] w-full h-[95vh] flex flex-col p-0">
                    <TemplateDialogHeader
                        documentName={documentName}
                        onClose={onClose}
                        isGenerating={isGenerating}
                        refineAllFieldsWithAI={refineAllFieldsWithAI}
                        availableTemplates={availableTemplates}
                        selectedTemplate={selectedTemplate}
                        handleTemplateSelect={handleTemplateSelect}
                        loadedDraft={loadedDraft}
                        isLoadingDraft={isLoadingDraft}
                        discardDraft={discardDraft}
                        completionStats={completionStats}
                        showConflictBanner={showConflictBanner}
                        dataConflicts={dataConflicts}
                        setShowConflictBanner={setShowConflictBanner}
                        refreshWithLiveData={refreshWithLiveData}
                    />

                    <div className="flex items-center gap-2 px-6 py-2 border-b bg-white">
                        <View className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-xs font-semibold mr-2">View Panels:</Label>
                        <div className="flex bg-slate-100 p-1 rounded-md">
                            <Button
                                variant={panelsVisible.form ? 'secondary' : 'ghost'}
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => togglePanel('form')}
                            >
                                <MousePointer2 className="h-3 w-3 mr-1" />
                                Form Fields
                            </Button>
                            <Button
                                variant={panelsVisible.preview ? 'secondary' : 'ghost'}
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => togglePanel('preview')}
                            >
                                <Layout className="h-3 w-3 mr-1" />
                                Live Preview
                            </Button>
                            <Button
                                variant={panelsVisible.source ? 'secondary' : 'ghost'}
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => togglePanel('source')}
                            >
                                <FileText className="h-3 w-3 mr-1" />
                                Template Source
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden grid grid-cols-12 gap-0">
                        <ScrollArea className={`${panelClasses.form} border-r bg-white`}>
                            <div className="p-6 space-y-8">
                                {/* Section Header */}
                                <div className="space-y-4">
                                    <h4 className="flex items-center gap-2 font-black text-blue-600 text-[10px] tracking-widest uppercase border-b pb-2">
                                        <Layout className="h-3 w-3" /> General Document Fields
                                    </h4>

                                    <div className="grid grid-cols-1 gap-y-1">
                                        {groupedPlaceholders.topLevel.map((p, idx) => {
                                            let resolvedOptions = [];
                                            if (p.master_field_ids?.length > 0) {
                                                const mf = masterFields.get(parseInt(p.master_field_ids[0]));
                                                if (mf?.type === 'select') {
                                                    resolvedOptions = getDependentDropdownOptions(p, mf);
                                                }
                                            }

                                            return (
                                                <div
                                                    key={`${p.id || p.name}-${p.name}`}
                                                    className="flex flex-row items-start gap-6 p-2 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors"
                                                >
                                                    {/* COLUMN 1: ID Badge + Right Aligned Label */}
                                                    <div className="w-1/3 flex items-start">
                                                        <Label className="font-bold text-slate-700 text-xs leading-relaxed uppercase tracking-tight">
                                                            {p.name.replace(/_/g, ' ')}
                                                        </Label>
                                                    </div>

                                                    {/* COLUMN 2: Input Control */}
                                                    <div className="flex-1 min-w-0">
                                                        <PlaceholderInput
                                                            placeholder={p}
                                                            value={formData[p.name]}
                                                            onChange={(val) => handleInputChange(p.name, val)}
                                                            onSaveToDb={saveFieldToDatabase}
                                                            masterFields={masterFields}
                                                            resolvedOptions={resolvedOptions}
                                                            onFileChange={(e) => handleFileChange(p.name, e)}
                                                            imageStyles={imageStyles}
                                                            onImageStyleChange={handleImageStyleChange}
                                                            autoPopulated={autoPopulatedFields.get(p.name)}
                                                            originalValue={originalFormData[p.name]}
                                                            requirementJobQuestions={requirementJobQuestions}  // NEW
                                                            task={task}                                         // NEW
                                                            formData={formData}
                                                            isArrayItem={false}
                                                            onAIRefine={handleSingleFieldAIRefine}
                                                            isAIRefining={refiningFields.has(p.name)}
                                                            showLabel={false} // Hides the internal vertical label
                                                            resolveSourceValue={resolveSpecificSourceValue}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Repeating Sections Logic */}
                                {Object.keys(groupedPlaceholders.blocks).length > 0 && (
                                    <div className="space-y-4 pt-4 border-t">
                                        <h4 className="flex items-center gap-2 font-black text-blue-600 text-[10px] tracking-widest uppercase border-b pb-2">
                                            <Layers className="h-3 w-3" /> Repeating Tables / Blocks
                                        </h4>
                                        {Object.keys(groupedPlaceholders.blocks).map(blockName => (
                                            <div key={blockName}>
                                                <ArrayInputsPanel
                                                    blockName={blockName}
                                                    blockData={groupedPlaceholders.blocks[blockName]}
                                                    formData={formData}
                                                    originalFormData={originalFormData}
                                                    onArrayInputChange={handleArrayInputChange}
                                                    onFileChange={handleFileChange}
                                                    handleImageStyleChange={handleImageStyleChange}
                                                    imageStyles={imageStyles}
                                                    masterFields={masterFields}
                                                    saveFieldToDatabase={saveFieldToDatabase}
                                                    isSavingProfile={isSavingProfile}
                                                    resolveSpecificSourceValue={resolveSpecificSourceValue}
                                                    getDependentDropdownOptions={getDependentDropdownOptions}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </ScrollArea>

                        <PreviewPanel
                            previewContent={previewContent}
                            isPreviewLoading={isPreviewLoading}
                            panelClasses={panelClasses.preview}
                            EDITOR_PREVIEW_STYLES={EDITOR_PREVIEW_STYLES}
                        />

                        {/* RIGHT PANEL: Original Template Reference */}
                        <TemplateSourcePanel
                            panelClasses={panelClasses.source}
                            isWordTemplate={isWordTemplate}
                            docPreviewUrl={docPreviewUrl}
                            setDocPreviewUrl={setDocPreviewUrl}
                        />
                    </div>
                    <DialogFooter className="border-t px-6 py-3 bg-white flex justify-between flex-shrink-0">
                        <div className="text-[10px] flex items-center gap-1.5">
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                            {isWordTemplate ? 'Word + Images' : 'HTML'}
                        </div>
                        <div className='flex gap-2'>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={saveAsDraft}
                                // ADD isPreviewLoading here
                                disabled={isGenerating || isPreviewLoading}
                            >
                                {isGenerating || isPreviewLoading ? (
                                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                {loadedDraft ? 'Update Draft' : 'Save as Draft'}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button size="sm" disabled={isGenerating} className="bg-blue-600">
                                        {isGenerating ? (
                                            <Loader2 className="animate-spin mr-2 h-4 w-4" />
                                        ) : (
                                            <Download className="mr-2 h-4 w-4" />
                                        )}
                                        Download
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => generateAndDownload('word')}>
                                        <FileText className="h-4 w-4 mr-2 text-blue-600" />
                                        Word
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => generateAndDownload('pdf')}>
                                        <FileText className="h-4 w-4 mr-2 text-red-600" />
                                        PDF
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}