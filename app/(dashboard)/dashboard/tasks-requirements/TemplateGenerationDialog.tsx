// @ts-nocheck
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
    AlignCenter, AlignLeft, AlignRight, Download, FileText, FileUp,
    Loader2, Wand2, Expand, CheckCircle2, X, Image as ImageIcon, Save
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { saveAs } from 'file-saver';
import supabase from "@/lib/supabase/client";

// --- Generation Libraries ---
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import ImageModule from 'docxtemplater-image-module-free';
import * as mammoth from "mammoth";

// --- SHARED STYLING ---
const EDITOR_PREVIEW_STYLES = `
  prose prose-sm sm:prose-base dark:prose-invert max-w-full focus:outline-none 
  [&_table]:border-collapse [&_table]:border [&_table]:border-border [&_table]:w-full [&_table]:my-4
  [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:p-2 [&_th]:text-left
  [&_td]:border [&_td]:border-border [&_td]:p-2 relative
  [&_img]:rounded-lg [&_img]:border [&_img]:border-border [&_img]:max-w-full [&_img]:mx-auto
`.replace(/\s+/g, ' ').trim();

// --- HELPER FUNCTIONS ---
const formatDate = (date, formatStr) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    if (!formatStr) return `${year}-${month}-${day}`;

    return formatStr
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day);
};

const base64Parser = (dataURL) => {
    if (typeof dataURL !== 'string') return null;
    const regex = /^data:image\/(png|jpeg|jpg);base64,/;
    if (!regex.test(dataURL)) return false;
    const base64 = dataURL.replace(regex, "");
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) { bytes[i] = binaryStr.charCodeAt(i); }
    return bytes.buffer;
};

const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

const fetchImageAsBase64 = async (url) => {
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) return null;
        const blob = await response.blob();
        return await toBase64(blob);
    } catch (error) {
        console.error('[fetchImageAsBase64] Error:', error);
        return null;
    }
};

const parseJsonValue = (data, path) => {
    if (!path || !data) return '';
    try {
        let currentValue = data;
        const cleanPath = path.replace(/'/g, '');
        const parts = cleanPath.split(/->>|->/);

        for (let i = 0; i < parts.length; i++) {
            const key = parts[i].trim();
            if (!key) continue;

            if (currentValue && currentValue.current !== undefined && key !== 'current') {
                currentValue = currentValue.current;
            }

            if (Array.isArray(currentValue)) {
                currentValue = currentValue[0];
            }

            if (currentValue && typeof currentValue === 'object') {
                if (currentValue[key] !== undefined) {
                    currentValue = currentValue[key];
                } else {
                    const lowerKey = key.toLowerCase();
                    const foundKey = Object.keys(currentValue).find(k => k.toLowerCase() === lowerKey);
                    currentValue = foundKey ? currentValue[foundKey] : undefined;
                }
            } else if (i < parts.length - 1) {
                return '';
            }
        }

        return currentValue !== undefined && currentValue !== null ? String(currentValue) : '';
    } catch (error) {
        console.error(`[parseJsonValue] Error:`, error);
        return '';
    }
};

const normalizeString = (str) => !str ? '' : str.toLowerCase().replace(/[_\s-]/g, '');

const findPrimaryDirector = (sourceDataCache) => {
    const potentialPaths = ['directors_details', 'director_details', 'directors'];

    for (const key of Object.keys(sourceDataCache)) {
        const tableData = sourceDataCache[key];
        if (!tableData) continue;

        const records = Array.isArray(tableData) ? tableData : Object.values(tableData);

        for (const record of records) {
            if (record.is_primary === true || record.is_primary === 'true') {
                return record;
            }

            for (const path of potentialPaths) {
                if (record[path] && Array.isArray(record[path])) {
                    const primary = record[path].find(d => d.is_primary === true || d.is_primary === 'true');
                    if (primary) return primary;
                }
            }
        }
    }
    return null;
};

const resolveArrayData = (blockPlaceholder, allPlaceholders, sourceDataCache, masterFields, entityIdMap, relationshipData) => {
    const entityType = Array.isArray(blockPlaceholder.entity_type)
        ? blockPlaceholder.entity_type[0]
        : (blockPlaceholder.entity_type || 'director');
    const blockName = blockPlaceholder.name;
    const isPrimaryOnly = blockPlaceholder.director_type === 'primary';

    let sourceArray = [];

    // Special handling for directors block
    if (blockName === 'directors' && entityType === 'director' && relationshipData?.directors) {
        sourceArray = isPrimaryOnly
            ? relationshipData.directors.filter(item => item?.is_primary === true || item?.is_primary === 'true')
            : relationshipData.directors;

    }

    // Special handling for contacts block
    if (blockName === 'contacts' && entityType === 'director' && relationshipData?.directors) {
        sourceArray = isPrimaryOnly
            ? relationshipData.directors.filter(item => item?.is_primary === true || item?.is_primary === 'true')
            : relationshipData.directors;
    }

    // **NEW: Special handling for dependant blocks (spouse, child, etc.)**
    const isDependantType = ['dependant', 'dependent'].includes(entityType?.toLowerCase());
    if (isDependantType && relationshipData?.dependants) {
        // Check if block has specific relationship requirement
        if (blockPlaceholder.dependant_relationship) {
            const targetRelationships = Array.isArray(blockPlaceholder.dependant_relationship)
                ? blockPlaceholder.dependant_relationship.map(r => r.toLowerCase())
                : [blockPlaceholder.dependant_relationship.toLowerCase()];

            sourceArray = relationshipData.dependants.filter(d =>
                targetRelationships.includes(d.relationship?.toLowerCase())
            );
        } else {
            // No specific relationship - use all dependants
            sourceArray = relationshipData.dependants;
        }
    }

    // Fallback: search in sourceDataCache if no data found yet
    if (sourceArray.length === 0) {
        const potentialPaths = [`${entityType}s_details`, `${entityType}_details`, blockName, 'directors', 'contacts', 'dependants'];

        Object.entries(sourceDataCache).forEach(([key, tableData]) => {
            if (!tableData || sourceArray.length > 0) return;
            const records = Array.isArray(tableData) ? tableData : Object.values(tableData);

            for (const record of records) {
                for (const path of potentialPaths) {
                    if (record[path] && Array.isArray(record[path])) {
                        sourceArray = isPrimaryOnly
                            ? record[path].filter(item => item?.is_primary === true || item?.is_primary === 'true')
                            : record[path];

                        if (sourceArray.length > 0) {
                            break;
                        }
                    }
                }
                if (sourceArray.length > 0) break;
            }
        });
    }

    if (sourceArray.length === 0) {
        return [];
    }

    const childFields = allPlaceholders.filter(p => {
        if (p.director_type === 'primary') return false;

        const belongsToBlock = (
            p.parent_name === blockName ||
            (p.description && p.description.toLowerCase().includes(blockName.toLowerCase()))
        );

        const isNotBlockTag = p.id !== blockPlaceholder.id && !p.is_block_start;
        return belongsToBlock && isNotBlockTag;
    });

    return sourceArray.map((item, itemIdx) => {
        const rowData = {};
        const individualId = item.id || item.director_id || item.individual_id;

        childFields.forEach(field => {
            let val = '';
            const isImage = field.name.startsWith('%') || field.type === 'image';
            const isConditional = field.type === 'conditional';

            // Handle conditional fields
            if (isConditional && field.conditions) {
                // Try each condition until we find a value
                for (const condition of field.conditions) {
                    const conditionTag = condition.tag;
                    const masterFieldId = condition.master_field_id;

                    // Try to get value from master field
                    if (masterFieldId && masterFields) {
                        const mf = masterFields.get(parseInt(masterFieldId, 10));
                        if (mf?.sources?.[0]?.path) {
                            const condVal = parseJsonValue(item, mf.sources[0].path);
                            if (condVal) {
                                val = `${condition.label || ''}${condVal}`;
                                break;
                            }
                        }
                    }

                    // Try direct field access
                    if (item[conditionTag]) {
                        val = `${condition.label || ''}${item[conditionTag]}`;
                        break;
                    }
                }
            }
            // Handle image fields
            else if (isImage && individualId) {
                const mIds = field.master_field_ids || [];
                for (const mId of mIds) {
                    const mf = masterFields.get(parseInt(mId));
                    if (!mf?.sources) continue;

                    for (const source of mf.sources) {
                        if (source.table === 'acc_portal_directors_documents' && source.document_id) {
                            const requiredDocIds = Array.isArray(source.document_id) ? source.document_id : [source.document_id];
                            const linkingVar = source.linking_variable || 'director_id';

                            const allDocs = Object.values(sourceDataCache['acc_portal_directors_documents'] || {})
                                .concat(Object.values(sourceDataCache['acc_portal_kyc_uploads'] || {}));

                            const matchingDoc = allDocs.find(doc => {
                                const docKycId = doc.kyc_document_id || doc.document_id;
                                const docOwnerId = doc[linkingVar] || doc.director_id || doc.individual_id;

                                return requiredDocIds.includes(docKycId) &&
                                    String(docOwnerId) === String(individualId);
                            });

                            if (matchingDoc?.file_path) {
                                val = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${matchingDoc.file_path}`;
                                break;
                            }
                        }
                    }
                    if (val) break;
                }
            }
            // Handle text fields
            else {
                if (field.master_field_ids?.length > 0) {
                    for (const mId of field.master_field_ids) {
                        const mf = masterFields.get(parseInt(mId));
                        if (mf?.sources?.[0]?.path) {
                            val = parseJsonValue(item, mf.sources[0].path);
                            if (val) break;
                        }
                    }
                }

                if (!val) {
                    const fieldName = field.name.toLowerCase();

                    if (item[field.name] !== undefined) {
                        val = item[field.name];
                    } else {
                        const matchingKey = Object.keys(item).find(k => k.toLowerCase() === fieldName);
                        if (matchingKey) {
                            val = item[matchingKey];
                        } else if (fieldName.includes('name')) {
                            val = item.full_name || item.name || '';
                        } else if (fieldName.includes('relationship')) {
                            val = item.relationship || '';
                        }
                    }
                }
            }
            rowData[field.name] = val || '';
        });
        return rowData;
    });
};

const ImagePlaceholderControls = ({ styles, onStyleChange }) => {
    const sizeMap = { small: '25%', medium: '50%', large: '75%', 'full-width': '100%' };
    const currentSizeKey = Object.keys(sizeMap).find(key => sizeMap[key] === styles.maxWidth) || 'full-width';

    return (
        <div className="space-y-3 pt-2 border-t mt-2">
            <div className="flex items-center gap-2">
                <ToggleGroup
                    type="single"
                    value={styles.textAlign || 'center'}
                    onValueChange={(align) => align && onStyleChange('textAlign', align)}
                    className="bg-background rounded-md border h-8"
                >
                    <ToggleGroupItem value="left" className="px-2"><AlignLeft className="h-3 w-3" /></ToggleGroupItem>
                    <ToggleGroupItem value="center" className="px-2"><AlignCenter className="h-3 w-3" /></ToggleGroupItem>
                    <ToggleGroupItem value="right" className="px-2"><AlignRight className="h-3 w-3" /></ToggleGroupItem>
                </ToggleGroup>
                <Select value={currentSizeKey} onValueChange={(size) => onStyleChange('maxWidth', sizeMap[size])}>
                    <SelectTrigger className="w-14 h-8"><SelectValue><Expand className="h-3 w-3" /></SelectValue></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="small">25%</SelectItem>
                        <SelectItem value="medium">50%</SelectItem>
                        <SelectItem value="large">75%</SelectItem>
                        <SelectItem value="full-width">100%</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <Label className="text-[10px]">Width (px)</Label>
                    <Input
                        type="number"
                        min="50"
                        max="600"
                        value={styles.imageWidth || 300}
                        onChange={(e) => onStyleChange('imageWidth', parseInt(e.target.value) || 300)}
                        className="h-7 text-xs"
                    />
                </div>
                <div>
                    <Label className="text-[10px]">Height (px)</Label>
                    <Input
                        type="number"
                        min="50"
                        max="600"
                        value={styles.imageHeight || 200}
                        onChange={(e) => onStyleChange('imageHeight', parseInt(e.target.value) || 200)}
                        className="h-7 text-xs"
                    />
                </div>
            </div>
        </div>
    );
};

// --- Update Profile Dialog Component ---
const UpdateProfileDialog = ({ open, onOpenChange, changedFields, onSave, isSaving }) => {
    if (!changedFields || changedFields.length === 0) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Save className="h-5 w-5 text-blue-600" />
                        Update Profile Data
                    </DialogTitle>
                    <DialogDescription>
                        Review and confirm {changedFields.length} change{changedFields.length > 1 ? 's' : ''} to be saved to the database
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[55vh] pr-4">
                    <div className="space-y-4">
                        {changedFields.map((field, idx) => (
                            <div key={idx} className="p-4 border rounded-lg bg-slate-50">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <Label className="font-semibold text-sm">
                                            {field.placeholder.name.replace(/_/g, ' ').toUpperCase()}
                                        </Label>
                                        <div className="flex gap-2 mt-1">
                                            <Badge variant="outline" className="text-[9px]">
                                                {field.placeholder.entity_type || 'general'}
                                            </Badge>
                                            {field.placeholder.director_type === 'primary' && (
                                                <Badge className="text-[9px] bg-purple-100 text-purple-700">
                                                    Primary Director
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    {field.source && (
                                        <Badge variant="secondary" className="text-[9px]">
                                            {field.source}
                                        </Badge>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <span className="text-xs font-medium text-muted-foreground">Original:</span>
                                        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs min-h-[40px] flex items-center">
                                            {field.oldValue ? (
                                                <span>{field.oldValue}</span>
                                            ) : (
                                                <span className="italic text-gray-400">Empty</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs font-medium text-muted-foreground">New:</span>
                                        <div className="p-2 bg-green-50 border border-green-200 rounded text-xs font-medium min-h-[40px] flex items-center">
                                            {field.newValue}
                                        </div>
                                    </div>
                                </div>

                                {field.targetInfo && (
                                    <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded">
                                        <div className="text-[10px] text-blue-800 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold">Table:</span>
                                                <code className="bg-white px-1.5 py-0.5 rounded">{field.targetInfo.table}</code>
                                            </div>
                                            {field.targetInfo.path && (
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold">Path:</span>
                                                    <code className="bg-white px-1.5 py-0.5 rounded">{field.targetInfo.path}</code>
                                                </div>
                                            )}
                                            {field.targetInfo.entityId && (
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold">Entity ID:</span>
                                                    <code className="bg-white px-1.5 py-0.5 rounded">{field.targetInfo.entityId}</code>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button
                        onClick={onSave}
                        disabled={isSaving}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4 mr-2" />
                                Save {changedFields.length} Change{changedFields.length > 1 ? 's' : ''}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default function TemplateGenerationDialog({
    isOpen, onClose, template, availableTemplates = [], documentName, masterFields,
    entityIdMap, sourceDataCache, extractedData = {}, personData = {}, companyData = {},
    relationshipData = { directors: [] },
}) {
    const { toast } = useToast();

    // Initialize form data with relationship data
    const [formData, setFormData] = useState(() => ({
        ...extractedData,
        ...personData,
        ...companyData,
        directors: relationshipData.directors || [],
        company: relationshipData.company || {}
    }));

    const [originalFormData, setOriginalFormData] = useState({ ...formData });
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [docPreviewUrl, setDocPreviewUrl] = useState(null);
    const [autoPopulatedFields, setAutoPopulatedFields] = useState(new Map());
    const [manuallyEditedFields, setManuallyEditedFields] = useState(new Set());
    const [selectedTemplate, setSelectedTemplate] = useState(template);
    const [uploadedFiles, setUploadedFiles] = useState({});
    const [imageStyles, setImageStyles] = useState({});
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [additionalCache, setAdditionalCache] = useState({});
    const [fetchingTables, setFetchingTables] = useState(new Set());

    const docxTemplateBuffer = useRef(null);
    const isWordTemplate = selectedTemplate?.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    useEffect(() => {
    if (!selectedTemplate?.placeholders) return;

    console.log('=== CONDITIONAL FIELDS ===');
    selectedTemplate.placeholders.forEach((field, index) => {
        if (field.type === 'conditional') {
            console.group(`Field ${index + 1}: ${field.name}`);
            console.log('Field Details:', {
                name: field.name,
                entity_type: field.entity_type,
                director_type: field.director_type,
                conditions: field.conditions?.map(c => ({
                    tag: c.tag,
                    label: c.label,
                    master_field_id: c.master_field_id
                }))
            });
            console.groupEnd();
        }
    });
    console.log('==========================');
}, [selectedTemplate]);

    const groupedPlaceholders = useMemo(() => {
        if (!selectedTemplate?.placeholders) return { topLevel: [], blocks: {} };

        const topLevel = [];
        const blocks = {};

        selectedTemplate.placeholders.forEach(p => {
            if (p.is_block_start) {
                blocks[p.name] = { config: p, children: [] };
            } else if (p.parent_name && blocks[p.parent_name]) {
                blocks[p.parent_name].children.push(p);
            } else if (!p.parent_name) {
                topLevel.push(p);
            }
        });

        return { topLevel, blocks };
    }, [selectedTemplate]);

    const fetchMissingDataSources = useCallback(async () => {
        if (!isOpen || !selectedTemplate || !masterFields) return;
        // Collect all required data sources from placeholders
        const requiredSources = new Map(); // table -> { linkingVars: Set, entityIds: Map<entityType, Set<id>> }

        // Find primary director if needed
        const primaryDirector = findPrimaryDirector({ ...sourceDataCache, ...additionalCache });
        const rawPrimaryId = primaryDirector?.id || primaryDirector?.director_id || primaryDirector?.individual_id;
        const primaryDirectorId = typeof rawPrimaryId === 'string' && rawPrimaryId.includes(' ')
            ? rawPrimaryId.split(' ')[0]
            : rawPrimaryId;

        const getEntityId = (placeholder) => {
            // Handle entity_type as string or array
            const entityType = Array.isArray(placeholder.entity_type)
                ? placeholder.entity_type[0]
                : (placeholder.entity_type || 'company');

            // Special handling for director types
            if (entityType === 'director' || placeholder.director_type) {
                if (placeholder.director_type === 'primary') {
                    return primaryDirectorId ||
                        (Array.isArray(entityIdMap.directors) && entityIdMap.directors[0]) ||
                        entityIdMap.director;
                }
                // For non-primary directors, return array of director IDs
                return entityIdMap.directors || entityIdMap.director;
            }

            // Special handling for dependants - match by relationship
            const isDependantType = Array.isArray(entityType)
                ? entityType.some(t => ['dependant', 'dependent'].includes(t.toLowerCase()))
                : (entityType === 'dependant' || entityType === 'dependent');

            if (isDependantType && relationshipData?.dependants) {
                // First, check if we have a specific dependant_relationship defined in the placeholder
                if (placeholder.dependant_relationship?.[0]) {
                    const targetRelationship = placeholder.dependant_relationship[0].toLowerCase();
                    const matchingDependant = relationshipData.dependants.find(
                        d => d.relationship?.toLowerCase() === targetRelationship
                    );

                    if (matchingDependant) {
                        return matchingDependant.id;
                    }
                }

                // Fallback: Try to infer relationship from field name
                const fieldName = placeholder.name.toLowerCase();
                const relationshipKeywords = {
                    'father': ['father', 'dad'],
                    'mother': ['mother', 'mom', 'mum'],
                    'wife': ['wife', 'spouse'],
                    'husband': ['husband', 'spouse'],
                    'daughter': ['daughter'],
                    'son': ['son'],
                    'child': ['child', 'children']
                };

                for (const [relationship, keywords] of Object.entries(relationshipKeywords)) {
                    if (keywords.some(keyword => fieldName.includes(keyword))) {
                        const matchingDependant = relationshipData.dependants.find(
                            d => d.relationship?.toLowerCase() === relationship
                        );
                        if (matchingDependant) {
                            return matchingDependant.id;
                        }
                    }
                }
                return relationshipData.dependants.map(d => d.id);
            }

            // Handle other entity types
            const idValue = entityIdMap[entityType];
            return idValue;
        };
        // Process all placeholders
        selectedTemplate.placeholders?.forEach(placeholder => {
            const masterFieldIds = placeholder.master_field_ids || [];
            const entityId = getEntityId(placeholder);
            const entityType = Array.isArray(placeholder.entity_type)
                ? placeholder.entity_type[0]?.toLowerCase() || 'company'
                : (placeholder.entity_type?.toLowerCase() || 'company');
            masterFieldIds.forEach(mId => {
                const masterField = masterFields.get(parseInt(mId, 10));
                if (!masterField?.sources) return;

                const relevantSources = masterField.sources.filter(source => {
                    // Handle primary director case
                    if (placeholder.director_type === 'primary' || entityType === 'primary') {
                        return ['individual', 'director'].includes(source.source_type?.toLowerCase());
                    }

                    // Handle multiple entity types
                    if (entityType.includes(',')) {
                        return entityType.split(',').some(type =>
                            type.trim() === source.source_type?.toLowerCase()
                        );
                    }

                    // Default case
                    return source.source_type?.toLowerCase() === entityType;
                });

                relevantSources.forEach(source => {
                    if (!source.table) return;

                    if (!requiredSources.has(source.table)) {
                        requiredSources.set(source.table, {
                            linkingVars: new Set(),
                            entityIds: new Map() // entityType -> Set of IDs
                        });
                    }

                    const tableInfo = requiredSources.get(source.table);
                    const linkingVar = source.linking_variable || 'id';
                    tableInfo.linkingVars.add(linkingVar);

                    if (!tableInfo.entityIds.has(entityType)) {
                        tableInfo.entityIds.set(entityType, new Set());
                    }

                    const ids = Array.isArray(entityId) ? entityId : [entityId];
                    ids.forEach(id => {
                        if (id) {
                            tableInfo.entityIds.get(entityType).add(id);
                        }
                    });
                });
            });
        });

        // Fetch missing tables
        for (const [tableName, tableInfo] of requiredSources.entries()) {
            // Skip if already in cache
            if (sourceDataCache[tableName] || additionalCache[tableName] || fetchingTables.has(tableName)) {
                continue;
            }
            setFetchingTables(prev => new Set(prev).add(tableName));
            try {
                const orConditions = [];
                for (const [entityType, entityIds] of tableInfo.entityIds.entries()) {
                    const ids = Array.from(entityIds);
                    // In the fetchMissingDataSources function, update the query construction:
                    if (ids.length > 0) {
                        // Ensure we're working with primitive values, not objects
                        const cleanIds = ids.map(id => {
                            if (id && typeof id === 'object') {
                                return id.id || id.director_id || id.individual_id || id.company_id;
                            }
                            return id;
                        }).filter(Boolean); // Remove any null/undefined values

                        if (cleanIds.length > 0) {
                            const linkingVar = Array.from(tableInfo.linkingVars)[0]; // Get first linking var
                            orConditions.push(`${linkingVar}.in.(${cleanIds.map(id => `"${id}"`).join(',')})`);
                        }
                    }
                }

                let query = supabase.from(tableName).select('*');

                if (orConditions.length > 0) {
                    query = query.or(orConditions.join(','));
                }

                const { data, error } = await query;

                if (error) throw error;
                // Cache the data
                setAdditionalCache(prev => ({
                    ...prev,
                    [tableName]: (data || []).reduce((acc, row) => {
                        if (!row || typeof row !== 'object') {
                            return acc;
                        }

                        // Use multiple possible keys
                        const key = row.id || row.director_id || row.individual_id || row.company_id;
                        if (key) {
                            acc[key] = row; // Store the entire row object
                        }
                        return acc;
                    }, {})
                }));

            } catch (err) {
                console.error(`[fetchMissingDataSources] ❌ Error fetching ${tableName}:`, err);
            } finally {
                setFetchingTables(prev => {
                    const next = new Set(prev);
                    next.delete(tableName);
                    return next;
                });
            }
        }
    }, [isOpen, selectedTemplate, masterFields, entityIdMap, sourceDataCache, additionalCache, fetchingTables]);

    // Trigger systematic fetch on mount/template change
    useEffect(() => {
        fetchMissingDataSources();
    }, [fetchMissingDataSources]);

    const getPlaceholderValue = useCallback((placeholder) => {
        const ids = placeholder.master_field_ids || [];
        const combinedCache = { ...sourceDataCache, ...additionalCache };
        const isPrimaryDirectorReq = placeholder.director_type === 'primary';

        // Normalize Placeholder Entity Type
        let pEntityType = 'company';
        if (Array.isArray(placeholder.entity_type)) {
            pEntityType = placeholder.entity_type[0];
        } else if (placeholder.entity_type) {
            pEntityType = placeholder.entity_type;
        }

        // Special handling for dependant fields using relationshipData
        const isDependantType = ['dependant', 'dependent'].includes(pEntityType.toLowerCase());

        if (isDependantType && relationshipData?.dependants) {
            let targetDependant = null;

            // 1. Try to match by dependant_relationship
            if (placeholder.dependant_relationship?.[0]) {
                const targetRelationship = placeholder.dependant_relationship[0].toLowerCase();
                targetDependant = relationshipData.dependants.find(
                    d => d.relationship?.toLowerCase() === targetRelationship
                );
            }

            // 2. If no match, try to infer from field name
            if (!targetDependant) {
                const fieldName = placeholder.name.toLowerCase();
                const relationshipKeywords = {
                    'father': ['father', 'dad'],
                    'mother': ['mother', 'mom', 'mum'],
                    'wife': ['wife', 'spouse_name'],
                    'husband': ['husband', 'spouse_name'],
                    'daughter': ['daughter'],
                    'son': ['son'],
                    'child': ['child']
                };

                for (const [relationship, keywords] of Object.entries(relationshipKeywords)) {
                    if (keywords.some(keyword => fieldName.includes(keyword))) {
                        targetDependant = relationshipData.dependants.find(
                            d => d.relationship?.toLowerCase() === relationship
                        );
                        if (targetDependant) {
                            break;
                        }
                    }
                }
            }

            // 3. If we found a target dependant, extract the value
            if (targetDependant) {
                // Handle name fields
                if (placeholder.name.toLowerCase().includes('name')) {
                    const result = {
                        value: targetDependant.name || targetDependant.full_name || '',
                        source: `Dependant (${targetDependant.relationship}) - Relationship Data`
                    };
                    return result;
                }

                // Handle ID/document fields - need to fetch from cache
                if (ids.length > 0 && masterFields) {
                    for (const id of ids) {
                        const mf = masterFields.get(parseInt(id, 10));
                        if (!mf?.sources) continue;

                        for (const source of mf.sources) {
                            const tableData = combinedCache[source.table];
                            if (!tableData) continue;

                            const records = Object.values(tableData);
                            const linkingVar = source.linking_variable || 'id';

                            // Find record matching the dependant's ID
                            const record = records.find(rec => {
                                const recordId = String(rec[linkingVar] || rec.id || rec.individual_id);
                                const searchId = String(targetDependant.id);
                                return recordId === searchId || recordId.startsWith(searchId + ' ');
                            });

                            if (record) {
                                let val = source.path ? parseJsonValue(record, source.path) : '';

                                // Try direct field access if path didn't work
                                if (!val) {
                                    const fieldName = placeholder.name.toLowerCase();
                                    if (record[fieldName]) {
                                        val = record[fieldName];
                                    }
                                }

                                if (val) {
                                    return {
                                        value: val,
                                        source: `Dependant (${targetDependant.relationship}) - ${mf.label || source.table}`
                                    };
                                }
                            }
                        }
                    }
                }
                return {
                    value: '',
                    source: `Dependant (${targetDependant.relationship})`
                };
            }
            return { value: '', source: null };
        }

        // Special handling for director fields using relationshipData
        if (pEntityType === 'director' && relationshipData?.directors) {
            let targetDirector = null;
            if (isPrimaryDirectorReq) {
                targetDirector = relationshipData.directors.find(d => d.is_primary === true || d.is_primary === 'true');
            } else if (placeholder.name.toLowerCase().includes('primary')) {
                targetDirector = relationshipData.directors.find(d => d.is_primary === true || d.is_primary === 'true');
            } else {
                targetDirector = relationshipData.directors[0];
            }

            if (targetDirector) {
                // Handle name fields
                if (placeholder.name.toLowerCase().includes('name')) {
                    const result = {
                        value: targetDirector.name || targetDirector.full_name || '',
                        source: 'Director - Relationship Data'
                    };
                    return result;
                }

                // Handle signature/image fields
                if (placeholder.type === 'image' || placeholder.name.startsWith('%')) {
                    if (ids.length > 0 && masterFields) {
                        for (const id of ids) {
                            const mf = masterFields.get(parseInt(id, 10));
                            if (mf?.sources) {
                                for (const source of mf.sources) {
                                    if (source.table === 'acc_portal_directors_documents' && source.document_id) {
                                        const requiredDocIds = Array.isArray(source.document_id) ? source.document_id : [source.document_id];
                                        const linkingVar = source.linking_variable || 'director_id';

                                        const allDocs = Object.values(combinedCache['acc_portal_directors_documents'] || {})
                                            .concat(Object.values(combinedCache['acc_portal_kyc_uploads'] || {}));

                                        const matchingDoc = allDocs.find(doc => {
                                            const docKycId = doc.kyc_document_id || doc.document_id;
                                            const docOwnerId = doc[linkingVar] || doc.director_id || doc.individual_id;

                                            return requiredDocIds.includes(docKycId) &&
                                                String(docOwnerId) === String(targetDirector.id);
                                        });

                                        if (matchingDoc?.file_path) {
                                            const result = {
                                                value: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${matchingDoc.file_path}`,
                                                source: 'Director Signature - Documents'
                                            };
                                            return result;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    const result = { value: '', source: null };
                    return result;
                }

                if (placeholder.type === 'conditional' && placeholder.conditions) {
                    // Get the target entity based on entity_type
                    let targetEntity = null;

                    if (isDependantType && relationshipData?.dependants) {
                        // For dependants, try to match by relationship
                        if (placeholder.dependant_relationship?.[0]) {
                            const targetRelationship = placeholder.dependant_relationship[0].toLowerCase();
                            targetEntity = relationshipData.dependants.find(
                                d => d.relationship?.toLowerCase() === targetRelationship
                            );
                        }
                    } else if (pEntityType === 'director' && relationshipData?.directors) {
                        targetEntity = isPrimaryDirectorReq
                            ? relationshipData.directors.find(d => d.is_primary === true || d.is_primary === 'true')
                            : relationshipData.directors[0];

                    } else if (pEntityType === 'company' && relationshipData?.company) {
                        targetEntity = relationshipData.company;
                    }

                    if (!targetEntity) {
                        return { value: '', source: null };
                    }
                    for (const condition of placeholder.conditions) {
                        const conditionTag = condition.tag;
                        const masterFieldId = condition.master_field_id;

                        if (targetEntity[conditionTag]) {
                            const result = {
                                value: `${condition.label || ''}${targetEntity[conditionTag]}`,
                                source: `Conditional - Direct (${conditionTag})`
                            };
                            return result;
                        }

                        // Try case-insensitive field matching
                        const lowerConditionTag = conditionTag.toLowerCase();
                        const matchingKey = Object.keys(targetEntity).find(k => k.toLowerCase() === lowerConditionTag);

                        if (matchingKey && targetEntity[matchingKey]) {
                            const result = {
                                value: `${condition.label || ''}${targetEntity[matchingKey]}`,
                                source: `Conditional - Direct Case-Insensitive (${matchingKey})`
                            };
                            return result;
                        }

                        // SECOND: Try to get value from master field
                        if (masterFieldId && masterFields) {
                            const mf = masterFields.get(parseInt(masterFieldId, 10));
                            if (mf?.sources) {
                                for (const source of mf.sources) {
                                    const tableData = combinedCache[source.table];
                                    if (!tableData) {
                                        continue;
                                    }
                                    const records = Object.values(tableData);
                                    const linkingVar = source.linking_variable || 'id';
                                    const record = records.find(rec => {
                                        const recordId = String(rec[linkingVar] || rec.id || rec.individual_id);
                                        const searchId = String(targetEntity.id);
                                        const matches = recordId === searchId || recordId.startsWith(searchId + ' ');
                                        return matches;
                                    });

                                    if (record) {
                                        const condVal = source.path ? parseJsonValue(record, source.path) : record[conditionTag];
                                        if (condVal) {
                                            const result = {
                                                value: `${condition.label || ''}${condVal}`,
                                                source: `Conditional - ${mf.label || source.table} (via ${source.path || conditionTag})`
                                            };
                                            return result;
                                        } else {
                                        }
                                    }
                                }
                            }
                        }
                    }

                    return { value: '', source: null };
                }
            }
        }

        // 1. Handle Current Date
        if (ids.length > 0 && masterFields) {
            for (const id of ids) {
                const mf = masterFields.get(parseInt(id, 10));
                if (mf?.date_config?.useCurrentDate) {
                    return {
                        value: formatDate(new Date(), mf.date_config.format || 'DD/MM/YYYY'),
                        source: 'System Date'
                    };
                }
            }
        }

        if (ids.length === 0 || !masterFields) return { value: '', source: null };

        // 2. Resolve Target ID
        let targetId = entityIdMap[pEntityType];
        const primaryDirectorRecord = isPrimaryDirectorReq ? findPrimaryDirector(combinedCache) : null;

        if (isPrimaryDirectorReq) {
            if (!primaryDirectorRecord) return { value: '', source: null };
            targetId = primaryDirectorRecord.id || primaryDirectorRecord.director_id || primaryDirectorRecord.individual_id;
        } else if (pEntityType === 'director' && !targetId) {
            targetId = entityIdMap.director;
        }

        const isImageType = placeholder.type === 'image' || placeholder.name.startsWith('%');

        for (const id of ids) {
            const masterField = masterFields.get(parseInt(id, 10));
            if (!masterField?.sources) continue;

            const relevantSources = masterField.sources.filter(source => {
                const sType = (source.source_type || '').toLowerCase();
                const pType = pEntityType.toLowerCase();

                if (pType === 'company') return sType === 'company';
                if (pType === 'director' || isPrimaryDirectorReq) {
                    return sType === 'individual' || sType === 'director';
                }
                return sType === pType;
            }).sort((a, b) => (a.priority || 99) - (b.priority || 99));

            const sourcesToTry = relevantSources.length > 0 ? relevantSources :
                (pEntityType !== 'company' ? masterField.sources.filter(s => s.source_type === 'individual') : []);

            for (const source of sourcesToTry) {
                const tableData = combinedCache[source.table];
                if (!tableData) continue;

                const records = Object.values(tableData);
                const linkingVar = source.linking_variable || 'id';

                const doesRecordMatchTarget = (record) => {
                    if (!targetId || !record) return false;
                    const recordId = String(record[linkingVar] || record.id || record.director_id || record.individual_id);
                    const searchId = String(targetId);
                    return recordId === searchId || recordId.startsWith(searchId + ' ');
                };

                if (isImageType) {
                    const requiredDocIds = Array.isArray(source.document_id) ? source.document_id : [source.document_id].filter(Boolean);
                    const foundDoc = records.find(d => {
                        const docKycId = d.kyc_document_id || d.document_id;
                        return requiredDocIds.includes(docKycId) && doesRecordMatchTarget(d);
                    });

                    if (foundDoc?.file_path) {
                        return {
                            value: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${foundDoc.file_path}`,
                            source: `${isPrimaryDirectorReq ? 'Primary Director - ' : ''}${masterField.label || 'Document'}`
                        };
                    }
                } else {
                    const record = records.find(doesRecordMatchTarget);

                    if (record) {
                        let val = source.path ? parseJsonValue(record, source.path) : '';

                        if (!val && (placeholder.name.toLowerCase().includes('name') || (source.path && source.path.includes('name')))) {
                            val = [record.first_name, record.middle_name, record.last_name]
                                .filter(Boolean).join(' ').trim() || record.full_name || record.name || '';
                        }

                        if (val) {
                            return {
                                value: val,
                                source: `${isPrimaryDirectorReq ? 'Primary Director - ' : ''}${masterField.label || 'Field'}`
                            };
                        }
                    }
                }
            }
        }
   const result = { value: '', source: null };
        return result;
    }, [masterFields, entityIdMap, sourceDataCache, additionalCache, relationshipData]);

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

    useEffect(() => {
        if (isOpen && selectedTemplate && Object.keys(sourceDataCache).length > 0) {
            const initData = {};
            const autoMap = new Map();

            // 1. Resolve Top Level Fields
            groupedPlaceholders.topLevel.forEach(p => {
                let match = getPlaceholderValue(p);
                if (!match.value) match = smartFieldMatch(p.name);
                initData[p.name] = match.value || '';
                if (match.value) autoMap.set(p.name, match.source);
            });

            // 2. Resolve Array Blocks
            Object.keys(groupedPlaceholders.blocks).forEach(blockName => {
                const block = groupedPlaceholders.blocks[blockName];
                const resolvedRows = resolveArrayData(
                    block.config,
                    selectedTemplate.placeholders,
                    { ...sourceDataCache, ...additionalCache },
                    masterFields,
                    entityIdMap,
                    relationshipData
                );
                initData[blockName] = resolvedRows;

                if (resolvedRows.length > 0) {
                    autoMap.set(blockName, `${resolvedRows.length} row${resolvedRows.length > 1 ? 's' : ''} auto-populated`);
                }
            });
            setFormData(initData);
            setOriginalFormData(JSON.parse(JSON.stringify(initData)));
            setAutoPopulatedFields(autoMap);

            setTimeout(() => {
                if (docxTemplateBuffer.current) {
                    updateWordPreview(initData, imageStyles);
                } else {
                    setPreviewContent(populateHtmlContent(initData, selectedTemplate.placeholders || [], imageStyles));
                }
            }, 100);
        }
    }, [isOpen, selectedTemplate?.id, groupedPlaceholders, sourceDataCache, additionalCache]);

    const handleArrayInputChange = (blockName, index, fieldName, value) => {
        setFormData(prev => {
            const updatedArray = [...(prev[blockName] || [])];
            if (!updatedArray[index]) updatedArray[index] = {};
            updatedArray[index] = { ...updatedArray[index], [fieldName]: value };

            const newState = { ...prev, [blockName]: updatedArray };

            if (docxTemplateBuffer.current) {
                updateWordPreview(newState, imageStyles);
            } else {
                setPreviewContent(populateHtmlContent(newState, selectedTemplate?.placeholders || [], imageStyles));
            }

            return newState;
        });
        setManuallyEditedFields(prev => new Set(prev).add(`${blockName}[${index}].${fieldName}`));
    };

    const renderArrayInputs = (blockName, blockData) => {
        const rows = formData[blockName] || [];

        return (
            <div className="space-y-4 mt-2 border-l-2 border-blue-200 pl-4 py-2 bg-blue-50/20 rounded-r-lg">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                        <Badge className="bg-blue-600 uppercase text-[9px] tracking-tighter">
                            {blockName}
                        </Badge>
                        {rows.length > 0 && (
                            <Badge variant="outline" className="text-[9px]">
                                {rows.length} row{rows.length > 1 ? 's' : ''}
                            </Badge>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] text-blue-600 hover:text-blue-700"
                        onClick={() => {
                            const emptyRow = {};
                            blockData.children.forEach(c => emptyRow[c.name] = '');
                            setFormData(prev => ({
                                ...prev,
                                [blockName]: [...(prev[blockName] || []), emptyRow]
                            }));
                        }}
                    >
                        + ADD ROW
                    </Button>
                </div>

                {rows.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic p-3 bg-white/50 rounded border border-dashed text-center">
                        No {blockName} found. Click "ADD ROW" to create entries.
                    </div>
                ) : (
                    rows.map((row, idx) => (
                        <div key={idx} className="p-3 bg-white border rounded shadow-sm relative group mb-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-white border shadow-sm text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => {
                                    const newRows = rows.filter((_, i) => i !== idx);
                                    setFormData(prev => ({ ...prev, [blockName]: newRows }));
                                }}
                            >
                                <X className="h-3 w-3" />
                            </Button>

                            <div className="space-y-3">
                                {blockData.children.map(child => {
                                    const fieldValue = row[child.name] || '';

                                    return (
                                        <div key={child.id}>
                                            <Label className="text-[9px] font-bold text-slate-400 uppercase">
                                                {child.name.replace(/_/g, ' ')}
                                            </Label>
                                            {child.type === 'image' ? (
                                                <div className="space-y-2">
                                                    {fieldValue ? (
                                                        <div className="relative group rounded overflow-hidden border aspect-video flex items-center justify-center bg-gray-50">
                                                            <img src={fieldValue} alt={child.name} className="max-h-full object-contain" />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <Button
                                                                    size="sm"
                                                                    variant="destructive"
                                                                    className="h-6 text-[10px]"
                                                                    onClick={() => handleArrayInputChange(blockName, idx, child.name, '')}
                                                                >
                                                                    Remove
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="h-20 border-2 border-dashed rounded flex items-center justify-center text-xs text-gray-400">
                                                            No image
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <Input
                                                    value={fieldValue}
                                                    onChange={(e) => handleArrayInputChange(blockName, idx, child.name, e.target.value)}
                                                    className="h-7 text-xs border-slate-100 focus:border-blue-200"
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        );
    };

    const populateHtmlContent = useCallback((data, placeholders, styles) => {
        if (!selectedTemplate?.content) return '';
        let content = selectedTemplate.content;

        Object.keys(groupedPlaceholders.blocks).forEach(blockName => {
            const blockRegex = new RegExp(`\\{#${blockName}\\}([\\s\\S]*?)\\{/${blockName}\\}`, 'g');
            const rows = data[blockName] || [];

            content = content.replace(blockRegex, (_, innerTemplate) => {
                if (rows.length === 0) {
                    return `<div class="text-gray-400 italic text-sm my-2">[No ${blockName} data]</div>`;
                }

                return rows.map(row => {
                    let rowHtml = innerTemplate;
                    groupedPlaceholders.blocks[blockName].children.forEach(child => {
                        const val = row[child.name] || `[${child.name}]`;

                        if (child.type === 'image' && val && val.startsWith('http')) {
                            rowHtml = rowHtml.replace(
                                new RegExp(`\\{${child.name}\\}`, 'g'),
                                `<img src="${val}" style="max-width: 200px; height: auto;" />`
                            );
                        } else {
                            rowHtml = rowHtml.replace(new RegExp(`\\{${child.name}\\}`, 'g'), val);
                        }
                    });
                    return rowHtml;
                }).join('');
            });
        });

        groupedPlaceholders.topLevel.forEach(placeholder => {
            const value = data[placeholder.name];
            const regex = new RegExp(`\\{{1,2}${placeholder.name}\\}{1,2}`, 'g');

            if (value && String(value).trim() !== '') {
                if (placeholder.type === 'image') {
                    const style = styles[placeholder.name] || { maxWidth: '100%', textAlign: 'center' };
                    const imgWidth = style.imageWidth ? `${style.imageWidth}px` : (style.maxWidth || '100%');

                    content = content.replace(regex, `
                        <div style="text-align: ${style.textAlign || 'center'}; margin: 10px 0; width: 100%;">
                            <img 
                                src="${value}" 
                                style="width: ${imgWidth}; height: auto; max-width: 100%; display: inline-block;" 
                            />
                        </div>
                    `);
                } else {
                    const formattedValue = /<[a-z][\s\S]*>/i.test(String(value)) ? value : String(value).replace(/\n/g, '<br />');
                    content = content.replace(regex, formattedValue);
                }
            } else {
                content = content.replace(regex, `<span style="background-color: #fef08a; padding: 2px 4px; color: #854d0e;">[${placeholder.name}]</span>`);
            }
        });

        return content;
    }, [selectedTemplate, groupedPlaceholders]);

    const prepareRenderData = useCallback(async (data) => {
        const renderData = {};
        const imagePromises = [];

        Object.keys(groupedPlaceholders.blocks).forEach(blockName => {
            renderData[blockName] = data[blockName] || [];
        });

        (selectedTemplate.placeholders || []).forEach(p => {
            const isChild = p.parent_name || p.is_block_start;
            if (isChild) return;

            let val = data[p.name];
            let key = p.name.replace(/[%#{}]/g, '');

            if (p.type === 'image' && val) {
                if (typeof val === 'string' && val.startsWith('http')) {
                    imagePromises.push(fetchImageAsBase64(val).then(b64 => { renderData[key] = b64; }));
                } else {
                    renderData[key] = val;
                }
            } else {
                renderData[key] = val || "";
            }
        });

        await Promise.all(imagePromises);
        return renderData;
    }, [groupedPlaceholders, selectedTemplate]);

    const updateWordPreview = useCallback(async (data, styles) => {
        if (!docxTemplateBuffer.current) return;

        try {
            setIsPreviewLoading(true);
            const zip = new PizZip(docxTemplateBuffer.current);
            const renderData = await prepareRenderData(data);

            const imageModule = new ImageModule({
                centered: false,
                getImage: (tag) => base64Parser(tag),
                getSize: (img, tag, name) => {
                    const s = styles[name];
                    return s ? [s.imageWidth || 300, s.imageHeight || 200] : [300, 200];
                },
            });

            const doc = new Docxtemplater(zip, {
                modules: [imageModule],
                paragraphLoop: true,
                linebreaks: true,
                nullGetter: () => ""
            });

            doc.setData(renderData);
            doc.render();
            const out = doc.getZip().generate({ type: "arraybuffer" });

            const result = await mammoth.convertToHtml({ arrayBuffer: out }, {
                styleMap: [
                    "p => p:fresh",
                    "table => table.border-collapse.table-auto.w-full.my-4",
                    "td => td.border.p-2",
                    "th => th.border.bg-muted.p-2.font-bold"
                ],
                convertImage: mammoth.images.imgElement(function (image) {
                    return image.read("base64").then(function (imageBuffer) {
                        return {
                            src: "data:" + image.contentType + ";base64," + imageBuffer
                        };
                    });
                })
            });

            setPreviewContent(result.value);
        } catch (err) {
            console.error("❌ [updateWordPreview] Error:", err);
            toast({ title: "Preview Error", description: err.message, variant: "destructive" });
        } finally {
            setIsPreviewLoading(false);
        }
    }, [selectedTemplate, toast, prepareRenderData]);

    const handleInputChange = (name, val) => {
        setFormData(prev => ({ ...prev, [name]: val }));
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
        setImageStyles(prev => ({ ...prev, [name]: { ...(prev[name] || {}), [key]: value } }));
    };

    useEffect(() => {
        if (!isOpen) return;

        const updatePreview = async () => {
            const current = availableTemplates.find(t => t.id === selectedTemplate?.id) || availableTemplates[0] || template;

            if (current?.file_path && current?.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                if (!docxTemplateBuffer.current) {
                    setIsPreviewLoading(true);
                    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/templates/${current.file_path}`;

                    setDocPreviewUrl(`https://docs.google.com/viewer?url=${encodeURIComponent(publicUrl)}&embedded=true`);

                    try {
                        const res = await fetch(publicUrl);
                        docxTemplateBuffer.current = await res.arrayBuffer();
                    } catch (error) {
                        console.error('Error loading template:', error);
                        return;
                    }
                }
                updateWordPreview(formData, imageStyles);
            } else {
                docxTemplateBuffer.current = null;
                setDocPreviewUrl(null);
                setPreviewContent(populateHtmlContent(formData, current?.placeholders || [], imageStyles));
            }
        };

        updatePreview();
    }, [isOpen, selectedTemplate?.id, formData, imageStyles]);

    const changedFields = useMemo(() => {
        const changes = [];

        groupedPlaceholders.topLevel.forEach(placeholder => {
            const original = originalFormData[placeholder.name] || '';
            const current = formData[placeholder.name] || '';

            if (original !== current && (current.trim() !== '' || original.trim() !== '')) {
                let targetInfo = null;

                if (placeholder.master_field_ids?.length > 0) {
                    const masterField = masterFields.get(parseInt(placeholder.master_field_ids[0]));
                    if (masterField?.sources?.[0]) {
                        // Find the source matching the entity type
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
        });

        return changes;
    }, [formData, originalFormData, groupedPlaceholders, masterFields, entityIdMap, autoPopulatedFields, sourceDataCache, additionalCache]);

    const handleUpdateProfile = async () => {
        setIsSavingProfile(true);

        try {
            const updates = [];

            for (const change of changedFields) {
                if (!change.targetInfo?.table || !change.targetInfo?.entityId) continue;

                const { table, path, linkingVariable, entityId } = change.targetInfo;

                if (path) {
                    // For JSONB fields
                    const pathParts = path.replace(/'/g, '').split(/->>|->/);
                    const updatePayload = {};

                    // Build nested structure for JSONB update
                    let current = updatePayload;
                    for (let i = 0; i < pathParts.length - 1; i++) {
                        const part = pathParts[i].trim();
                        if (part) {
                            current[part] = {};
                            current = current[part];
                        }
                    }

                    const finalKey = pathParts[pathParts.length - 1].trim();
                    if (finalKey) {
                        current[finalKey] = change.newValue;
                    }

                    updates.push({ table, id: entityId, linkingVariable, data: updatePayload });
                }
            }

            // Execute updates
            const results = [];
            for (const update of updates) {
                const { error, data } = await supabase
                    .from(update.table)
                    .update(update.data)
                    .eq(update.linkingVariable || 'id', update.id)
                    .select();

                if (error) {
                    console.error(`Error updating ${update.table}:`, error);
                    results.push({ success: false, error });
                } else {
                    results.push({ success: true, data });
                }
            }

            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            if (successCount > 0) {
                toast({
                    title: "Profile Updated",
                    description: `Successfully saved ${successCount} change${successCount > 1 ? 's' : ''}${failCount > 0 ? ` (${failCount} failed)` : ''}`,
                });

                setOriginalFormData(JSON.parse(JSON.stringify(formData)));
                setManuallyEditedFields(new Set());
                setShowUpdateDialog(false);
            } else {
                throw new Error('All updates failed');
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

    const completionStats = useMemo(() => {
        let totalFields = groupedPlaceholders.topLevel.length;
        let filledFields = groupedPlaceholders.topLevel.filter(p =>
            formData[p.name] && String(formData[p.name]).trim() !== ''
        ).length;

        Object.keys(groupedPlaceholders.blocks).forEach(blockName => {
            const rows = formData[blockName] || [];
            if (rows.length > 0) {
                totalFields += rows.length * groupedPlaceholders.blocks[blockName].children.length;
                rows.forEach(row => {
                    groupedPlaceholders.blocks[blockName].children.forEach(child => {
                        if (row[child.name] && String(row[child.name]).trim() !== '') {
                            filledFields++;
                        }
                    });
                });
            }
        });

        return {
            total: totalFields,
            filled: filledFields,
            percentage: totalFields ? Math.round((filledFields / totalFields) * 100) : 0
        };
    }, [formData, groupedPlaceholders]);

    const generateAndDownload = async (type) => {
        setIsGenerating(true);

        try {
            const fileName = `${documentName.replace(/[^\w\s-]/g, '_')}_${formatDate(new Date(), 'YYYYMMDD')}`;

            if (docxTemplateBuffer.current) {
                const zip = new PizZip(docxTemplateBuffer.current);
                const renderData = await prepareRenderData(formData);

                const imageModule = new ImageModule({
                    centered: false,
                    getImage: (tag) => base64Parser(tag),
                    getSize: (img, tag, name) => {
                        const s = imageStyles[name];
                        return s ? [s.imageWidth || 300, s.imageHeight || 200] : [300, 200];
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

                const blob = doc.getZip().generate({
                    type: "blob",
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                });

                if (type === 'word') {
                    saveAs(blob, `${fileName}.docx`);
                    toast({ title: "Success", description: `Document downloaded as ${fileName}.docx` });
                } else {
                    const html2pdf = (await import('html2pdf.js')).default;
                    const element = document.createElement('div');
                    element.innerHTML = previewContent;
                    element.className = EDITOR_PREVIEW_STYLES + ' p-10 bg-white';
                    element.style.width = '800px';
                    await html2pdf().set({
                        margin: 10,
                        filename: `${fileName}.pdf`,
                        html2canvas: { scale: 2, useCORS: true },
                        jsPDF: { unit: 'mm', format: 'a4' }
                    }).from(element).save();
                }
            }
        } catch (e) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="max-w-[98vw] w-full h-[95vh] flex flex-col p-0">
                    <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50 flex-shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500 rounded-lg">
                                    <Wand2 className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <DialogTitle className="text-xl font-bold">{documentName}</DialogTitle>
                                    <DialogDescription className="text-sm">Auto-populate and generate</DialogDescription>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {changedFields.length > 0 && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowUpdateDialog(true)}
                                        className="border-green-200 text-green-700 hover:bg-green-50"
                                    >
                                        <Save className="h-4 w-4 mr-2" />
                                        Update Profile ({changedFields.length})
                                    </Button>
                                )}
                                {availableTemplates.length > 1 && (
                                    <Select value={selectedTemplate?.id} onValueChange={(v) => setSelectedTemplate(availableTemplates.find(t => t.id === v))}>
                                        <SelectTrigger className="w-64 h-9">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableTemplates.map(t => (
                                                <SelectItem key={t.id} value={t.id}>{t.file_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                                <Button variant="ghost" size="icon" onClick={onClose}>
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>
                        </div>
                        <div className="mt-2 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-medium">{completionStats.filled}/{completionStats.total} Fields</span>
                                <span>{completionStats.percentage}%</span>
                            </div>
                            <Progress value={completionStats.percentage} className="h-1.5" />
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-hidden grid grid-cols-12 gap-0">
                        <ScrollArea className="col-span-3 border-r bg-white">
                            <div className="p-4 space-y-6">
                                <div className="space-y-4">
                                    <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                        General Fields
                                    </Label>
                                    {groupedPlaceholders.topLevel.map(p => (
                                        <div key={p.id} className="space-y-2 p-3 border rounded-lg bg-slate-50/50">
                                            <div className="flex justify-between items-center">
                                                <Label className="font-semibold uppercase text-[11px]">
                                                    {p.name.replace(/_/g, ' ')}
                                                </Label>
                                                {autoPopulatedFields.has(p.name) && (
                                                    <Badge variant="secondary" className="text-[9px] bg-blue-50 text-blue-600">
                                                        {autoPopulatedFields.get(p.name)}
                                                    </Badge>
                                                )}
                                            </div>

                                            {p.type === 'image' ? (
                                                <div className="space-y-3">
                                                    {formData[p.name] ? (
                                                        <div className="relative group rounded-md overflow-hidden border bg-white aspect-video flex items-center justify-center">
                                                            <img
                                                                src={formData[p.name]}
                                                                alt={p.name}
                                                                className="max-h-full object-contain"
                                                            />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    variant="secondary"
                                                                    className="h-7 text-[10px]"
                                                                    onClick={() => document.getElementById(`file-${p.id}`).click()}
                                                                >
                                                                    Replace
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="destructive"
                                                                    className="h-7 text-[10px]"
                                                                    onClick={() => handleInputChange(p.name, '')}
                                                                >
                                                                    Remove
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            variant="outline"
                                                            className="w-full h-20 border-dashed border-2 flex flex-col gap-1"
                                                            onClick={() => document.getElementById(`file-${p.id}`).click()}
                                                        >
                                                            <ImageIcon className="h-4 w-4 text-slate-400" />
                                                            <span className="text-[10px] text-slate-500">Upload {p.name}</span>
                                                        </Button>
                                                    )}
                                                    <input
                                                        id={`file-${p.id}`}
                                                        type="file"
                                                        className="hidden"
                                                        accept="image/*"
                                                        onChange={(e) => handleFileChange(p.name, e)}
                                                    />

                                                    <ImagePlaceholderControls
                                                        styles={imageStyles[p.name] || {}}
                                                        onStyleChange={(key, val) => handleImageStyleChange(p.name, key, val)}
                                                    />
                                                </div>
                                            ) : (
                                                <Input
                                                    value={formData[p.name] || ''}
                                                    onChange={e => handleInputChange(p.name, e.target.value)}
                                                    className="bg-white h-8 text-xs"
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {Object.keys(groupedPlaceholders.blocks).length > 0 && (
                                    <div className="space-y-4 pt-4 border-t">
                                        <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                            Repeating Sections
                                        </Label>
                                        {Object.keys(groupedPlaceholders.blocks).map(blockName => (
                                            <div key={blockName}>
                                                {renderArrayInputs(blockName, groupedPlaceholders.blocks[blockName])}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </ScrollArea>

                        <div className="col-span-5 border-r relative bg-slate-100 overflow-y-auto">
                            <div className="sticky top-0 z-10 bg-white/90 backdrop-blur px-4 py-2 border-b flex justify-between">
                                <span className="text-[10px] font-bold text-slate-500">LIVE PREVIEW</span>
                                {isPreviewLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                            </div>
                            <div className="p-8">
                                <div
                                    className={`bg-white shadow-xl p-12 min-h-[11in] ${EDITOR_PREVIEW_STYLES}`}
                                    dangerouslySetInnerHTML={{ __html: previewContent }}
                                />
                            </div>
                        </div>

                        {isWordTemplate ? (
                            <div className="col-span-4 bg-slate-50 overflow-y-auto">
                                <div className="sticky top-0 z-10 bg-white/90 backdrop-blur px-4 py-2 border-b">
                                    <span className="text-[10px] font-bold text-slate-500">ORIGINAL TEMPLATE</span>
                                </div>
                                <div className="p-4">
                                    {docPreviewUrl ? (
                                        <iframe
                                            src={docPreviewUrl}
                                            className="w-full h-[calc(100vh-200px)] border-0 rounded shadow"
                                            title="Original"
                                            onError={() => setDocPreviewUrl(null)}
                                        />
                                    ) : (
                                        <div className="h-[calc(100vh-200px)] flex items-center justify-center">
                                            <FileText className="h-12 w-12 text-slate-300" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="col-span-4 bg-slate-50 p-8">
                                <div className="bg-white rounded border p-6">
                                    <FileText className="h-8 w-8 text-blue-500 mb-3" />
                                    <h3 className="font-semibold mb-2">HTML Template</h3>
                                    <p className="text-xs text-slate-600">Preview shows generated output</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="border-t px-6 py-3 bg-white flex justify-between flex-shrink-0">
                        <div className="text-[10px] flex items-center gap-1.5">
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                            {isWordTemplate ? 'Word + Images' : 'HTML'}
                        </div>
                        <div className='flex gap-2'>
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

            <UpdateProfileDialog
                open={showUpdateDialog}
                onOpenChange={setShowUpdateDialog}
                changedFields={changedFields}
                onSave={handleUpdateProfile}
                isSaving={isSavingProfile}
            />
        </>
    );
}