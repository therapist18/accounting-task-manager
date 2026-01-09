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
import { Checkbox } from '@/components/ui/checkbox';

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

const base64Parser = async (dataURL) => {
    try {
        if (!dataURL) return null;

        // If it's already a base64 data URL, process it
        if (typeof dataURL === 'string' && dataURL.startsWith('data:')) {
            const matches = dataURL.match(/^data:(image\/[^;]+);base64,(.*)$/);
            if (!matches) return null;

            const mimeType = matches[1];
            const base64 = matches[2];
            const binaryStr = atob(base64);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            return bytes.buffer;
        }

        // If it's a URL, fetch and convert to base64
        if (typeof dataURL === 'string' && (dataURL.startsWith('http') || dataURL.startsWith('blob:'))) {
            const response = await fetch(dataURL);
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsArrayBuffer(blob);
            });
        }

        return null;
    } catch (error) {
        console.error('Error in base64Parser:', error);
        return null;
    }
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
                console.log('❌ No value found for placeholder, returning empty string');
                console.groupEnd();
                return '';
            }
        }

        console.log(`✅ Found value in JSON path: ${path}`, currentValue);
        console.groupEnd();
        return currentValue !== undefined && currentValue !== null ? String(currentValue) : '';
    } catch (error) {
        console.error(`[parseJsonValue] Error:`, error);
        return '';
    }
};

const normalizeString = (str) => !str ? '' : str.toLowerCase().replace(/[_\s-]/g, '');

const findPrimaryDirector = (relationshipData) => {
    if (!relationshipData?.directors?.length) return null;
    const directors = Array.isArray(relationshipData.directors)
        ? relationshipData.directors
        : [relationshipData.directors];
    return directors.find(d => d.is_primary) || directors[0];
};

const resolveConditionalValue = (conditions, targetEntity, combinedCache, masterFields) => {
    if (!conditions || !targetEntity) return null;
    const targetId = String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id);

    for (const condition of conditions) {
        const tag = condition.tag;

        // 1. Check direct field on entity
        if (targetEntity[tag]) return { value: `${condition.label || ''}${targetEntity[tag]}`, source: 'Direct' };
        const matchingKey = Object.keys(targetEntity).find(k => k.toLowerCase() === tag.toLowerCase());
        if (matchingKey && targetEntity[matchingKey]) return { value: `${condition.label || ''}${targetEntity[matchingKey]}`, source: 'Direct (Case-Insensitive)' };

        // 2. Check Master Field sources in Cache
        if (condition.master_field_id && masterFields) {
            const mf = masterFields.get(parseInt(condition.master_field_id, 10));
            if (mf?.sources) {
                for (const source of mf.sources) {
                    const tableData = combinedCache[source.table];
                    if (!tableData) continue;

                    let records = Object.values(tableData);

                    // Filter by document_id if provided
                    if (source.document_id) {
                        const requiredIds = Array.isArray(source.document_id) ? source.document_id : [source.document_id];
                        records = records.filter(r => requiredIds.includes(r.document_id || r.kyc_document_id));
                    }

                    const linkingVar = source.linking_variable || 'id';
                    const record = records.find(rec => {
                        const recId = String(rec[linkingVar] || rec.id || rec.individual_id || rec.director_id);
                        return recId === targetId || recId.startsWith(targetId + ' ');
                    });

                    if (record) {
                        const rawVal = source.path ? parseJsonValue(record, source.path) : record[tag];
                        if (rawVal) return { value: `${condition.label || ''}${rawVal}`, source: `Fresh DB: ${mf.label || source.table}` };
                    }
                }
            }
        }
    }
    return null;
};

const resolveArrayData = (blockPlaceholder, allPlaceholders, combinedCache, masterFields, entityIdMap, relationshipData) => {
    console.group(`🔄 Processing Array Block: ${blockPlaceholder.name || 'unnamed-block'}`);
    console.log('📦 Block Configuration:', {
        name: blockPlaceholder.name,
        type: blockPlaceholder.entity_type,
        isPrimaryOnly: blockPlaceholder.director_type === 'primary',
        isHorizontal: blockPlaceholder.array_direction === 'horizontal',
        masterFieldIds: blockPlaceholder.master_field_ids || []
    });

    const entityType = Array.isArray(blockPlaceholder.entity_type)
        ? blockPlaceholder.entity_type[0]
        : (blockPlaceholder.entity_type || 'director');
    const blockName = blockPlaceholder.name;
    const isPrimaryOnly = blockPlaceholder.director_type === 'primary';
    const isHorizontal = blockPlaceholder.array_direction === 'horizontal';

    let sourceArray = [];
    console.log('🔍 Available Relationship Data:', {
        directors: relationshipData?.directors?.length || 0,
        dependants: relationshipData?.dependants?.length || 0,
        company: relationshipData?.company ? 'Available' : 'Not Available'
    });

    // Identify child fields
    const childFields = allPlaceholders.filter(p =>
        (p.parent_name === blockName || (p.description && p.description.toLowerCase().includes(blockName.toLowerCase())))
        && p.id !== blockPlaceholder.id
        && !p.is_block_start
    );
    
    // Log field types for debugging
    console.log(`👶 Child Fields (${childFields.length}):`, childFields.map(f => ({
        name: f.name,
        type: f.type || 'text', // Default to 'text' if type is not specified
        isArray: f.is_array || false,
        entityType: f.entity_type,
        master_field_ids: f.master_field_ids || []
    })));
    
    // Log the block's type information
    console.log(`📌 Block '${blockName}' has entityType: '${entityType}', type: '${blockPlaceholder.type || 'block'}'`);

    // --- Handle Horizontal/Digit-splitting blocks ---
    const isDigitSplitting = isHorizontal || (
        childFields.length === 1 &&
        childFields[0].master_field_ids?.[0] === blockPlaceholder.master_field_ids?.[0]
    );

    if (isDigitSplitting && blockPlaceholder.master_field_ids?.[0]) {
        const masterFieldId = blockPlaceholder.master_field_ids[0];
        const mf = masterFields.get(parseInt(masterFieldId, 10));
        console.log(`🔢 Processing Digit-Splitting Block for Master Field:`, {
            masterFieldId,
            masterFieldLabel: mf?.label || 'Unknown',
            sources: mf?.sources || []
        });

        if (mf?.sources) {
            let targetEntity = entityType === 'company' ? relationshipData.company :
                (isPrimaryOnly ? relationshipData.directors?.find(d => d.is_primary === true) : relationshipData.directors?.[0]);

            console.log('🎯 Target Entity for Digit Splitting:', {
                entityType,
                isPrimaryOnly,
                targetEntityId: targetEntity?.id || 'Not Found',
                targetEntityName: targetEntity?.name || targetEntity?.full_name || 'N/A'
            });

            if (targetEntity) {
                for (const source of mf.sources) {
                    const tableData = combinedCache[source.table];
                    if (!tableData) {
                        console.log(`ℹ️ No data in cache for table: ${source.table}`);
                        continue;
                    }

                    const record = Object.values(tableData).find(r =>
                        String(r[source.linking_variable || 'id']) === String(targetEntity.id)
                    );

                    if (record) {
                        let value = source.path
                            ? parseJsonValue(record, source.path)
                            : record[mf.field_key];

                        console.log('📊 Found Source Data:', {
                            table: source.table,
                            path: source.path,
                            linkingVar: source.linking_variable,
                            value: value ? `${String(value).substring(0, 50)}${String(value).length > 50 ? '...' : ''}` : 'Empty/Null',
                            valueLength: String(value).length
                        });

                        if (value) {
                            const chars = String(value).split('');
                            console.log(`✨ Split into ${chars.length} characters:`, chars.join(' '));
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

    // --- Handle Director/Dependant Blocks ---
    if (entityType === 'director' || entityType === 'dependant') {
        // Only use the entityType to determine the data source
        sourceArray = relationshipData[`${entityType}s`] || [];
        console.log(`🔍 Using ${entityType}s from relationship data:`, sourceArray);

        if (isPrimaryOnly && sourceArray.length > 0) {
            const primary = sourceArray.find(d => d.is_primary) || sourceArray[0];
            sourceArray = primary ? [primary] : [];
        }

        console.log(`👥 Found ${sourceArray.length} ${entityType}(s)`, sourceArray);
    }
    else if (['dependant', 'dependent'].includes(entityType?.toLowerCase()) && relationshipData?.dependants) {
        if (blockPlaceholder.dependant_relationship) {
            const targets = Array.isArray(blockPlaceholder.dependant_relationship)
                ? blockPlaceholder.dependant_relationship.map(r => r.toLowerCase())
                : [blockPlaceholder.dependant_relationship.toLowerCase()];
            sourceArray = relationshipData.dependants.filter(d =>
                targets.includes(d.relationship?.toLowerCase())
            );
            console.log(`👨‍👩‍👧‍👦 Filtered ${sourceArray.length} Dependants by Relationship:`, targets);
        } else {
            sourceArray = relationshipData.dependants;
            console.log(`👨‍👩‍👧‍👦 Using all ${sourceArray.length} Dependants`);
        }
    }

    if (sourceArray.length === 0) {
        console.warn(`⚠️ No source array found for block: ${blockName}`, {
            entityType,
            isPrimaryOnly,
            availableDirectors: relationshipData?.directors?.length || 0,
            availableDependants: relationshipData?.dependants?.length || 0
        });
        console.groupEnd();
        return [];
    }

    console.log(`🔄 Processing ${sourceArray.length} items for block: ${blockName}`);

    // Map each entity to row data
    const result = sourceArray.map((item, index) => {
        console.group(`📝 Item ${index + 1}/${sourceArray.length}: ${item.name || item.full_name || `ID: ${item.id}`}`);
        console.log(`🔤 Item type: ${typeof item}`, item);
        const rowData = {};

        childFields.forEach(field => {
            console.group(`🔍 Field: ${field.name}`);
            let val = '';

            if (field.type === 'conditional') {
                console.log('🔄 Resolving conditional field with conditions:', field.conditions);
                const res = resolveConditionalValue(field.conditions, item, combinedCache, masterFields);
                val = res ? res.value : '';
                console.log(`✅ Resolved value:`, { value: val, source: res?.source || 'No match' });
            }
            else if (field.name.toLowerCase().includes('name')) {
                val = item.full_name || item.name || '';
                console.log(`👤 Resolved name field:`, { value: val, source: 'Direct from item' });
            }
            else if (field.master_field_ids?.length > 0) {
                console.log('🔎 Checking master field references:', field.master_field_ids);

                for (const mId of field.master_field_ids) {
                    const mf = masterFields.get(parseInt(mId));
                    console.log(`  - Master Field ${mId}:`, {
                        label: mf?.label,
                        field_key: mf?.field_key,
                        sources: mf?.sources?.map(s => `${s.table}${s.path ? ` (${s.path})` : ''}`) || []
                    });

                    if (!mf?.sources) continue;

                    for (const source of mf.sources) {
                        const table = combinedCache[source.table];
                        if (!table) {
                            console.log(`  ℹ️ No data in cache for table: ${source.table}`);
                            continue;
                        }

                        const linkingVar = source.linking_variable || 'id';
                        const record = Object.values(table).find(r => {
                            const matchesLinkingVar = String(r[linkingVar] || r.id) === String(item.id);

                            // If there's a document_id in the source, check that too
                            if (source.document_id) {
                                const docId = Array.isArray(source.document_id) ? source.document_id[0] : source.document_id;
                                return matchesLinkingVar && String(r.document_id || r.id) === String(docId);
                            }

                            return matchesLinkingVar;
                        });

                        if (record) {
                            let rawVal;

                            // For image/document fields, check file_path
                            if (field.type === 'image' && record.file_path) {
                                rawVal = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${record.file_path}`;
                                console.log(`  📸 Found image file_path:`, {
                                    file_path: record.file_path,
                                    fullUrl: rawVal
                                });
                            } else {
                                // Standard field lookup - try multiple fallbacks
                                rawVal = source.path
                                    ? parseJsonValue(record, source.path)
                                    : (record[mf.field_key] || record[field.name]);
                            }

                            if (rawVal) {
                                val = rawVal;
                                console.log(`  ✅ Found value in ${source.table}:`, {
                                    value: typeof val === 'string' && val.length > 100 ? `${val.substring(0, 50)}...` : val,
                                    path: source.path || 'N/A',
                                    fieldKey: mf.field_key,
                                    linkingVar,
                                    recordId: record.id || 'unknown'
                                });
                                break;
                            }
                        }
                    }
                    if (val) break;
                }

                if (!val) {
                    console.log('  ⚠️ No value found in any master field source');
                }
            }

            rowData[field.name] = val || '';
            console.log(`   💾 Setting field '${field.name}' (type: ${field.type || 'text'}) to:`, 
                field.type === 'image' ? '[Image Data]' : 
                typeof val === 'string' && val.length > 50 ? val.substring(0, 50) + '...' : val
            );
            console.groupEnd(); // Field group
            return val;
        });

        console.log(`📊 Final row data:`, JSON.parse(JSON.stringify(rowData))); // Clean circular references
        console.groupEnd(); // Item group
        return rowData;
    });

    console.log(`✅ Processed ${result.length} items for block: ${blockName}`, {
        sampleItem: result[0] || 'No items'
    });
    console.groupEnd(); // Block group

    return result;
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
                                                typeof field.oldValue === 'object' ? (
                                                    <pre className="text-xs whitespace-pre-wrap break-words">
                                                        {JSON.stringify(field.oldValue, null, 2)}
                                                    </pre>
                                                ) : (
                                                    <span>{String(field.oldValue)}</span>
                                                )
                                            ) : (
                                                <span className="italic text-gray-400">Empty</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs font-medium text-muted-foreground">New:</span>
                                        <div className="p-2 bg-green-50 border border-green-200 rounded text-xs font-medium min-h-[40px] flex items-center">
                                            {field.newValue ? (
                                                typeof field.newValue === 'object' ? (
                                                    <pre className="text-xs whitespace-pre-wrap break-words">
                                                        {JSON.stringify(field.newValue, null, 2)}
                                                    </pre>
                                                ) : (
                                                    <span>{String(field.newValue)}</span>
                                                )
                                            ) : (
                                                <span className="italic text-gray-400">Empty</span>
                                            )}
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

        const allIds = new Set();
        if (entityIdMap.company) allIds.add(String(entityIdMap.company));
        const dirIds = Array.isArray(entityIdMap.directors) ? entityIdMap.directors : [entityIdMap.director];
        dirIds.forEach(id => id && allIds.add(String(id)));
        relationshipData?.dependants?.forEach(d => d.id && allIds.add(String(d.id)));

        const tables = new Map();
        selectedTemplate.placeholders?.forEach(p => {
            p.master_field_ids?.forEach(mId => {
                masterFields.get(parseInt(mId))?.sources?.forEach(s => {
                    if (!s.table) return;
                    if (!tables.has(s.table)) tables.set(s.table, s.linking_variable || 'id');
                });
            });
        });

        const idList = Array.from(allIds).filter(Boolean);
        for (const [table, linkVar] of tables.entries()) {
            if (fetchingTables.has(table)) continue;
            setFetchingTables(prev => new Set(prev).add(table));
            try {
                const { data, error } = await supabase.from(table).select('*').in(linkVar, idList);
                if (error) throw error;
                setAdditionalCache(prev => {
                    const cache = { ...(prev[table] || {}) };
                    data?.forEach(row => {
                        const id = row.id || row.director_id || row.individual_id;
                        if (id) cache[id] = row;
                        if (row[linkVar]) cache[row[linkVar]] = row;
                    });
                    return { ...prev, [table]: cache };
                });
            } catch (err) { console.error(`Fetch Error ${table}:`, err); }
            finally { setFetchingTables(prev => { const n = new Set(prev); n.delete(table); return n; }); }
        }
    }, [isOpen, selectedTemplate, masterFields, entityIdMap, relationshipData]);

    useEffect(() => {
        if (isOpen) {
            setAdditionalCache({});
            setTimeout(fetchMissingDataSources, 50);
        }
    }, [isOpen, selectedTemplate?.id]);


    const getPlaceholderValue = useCallback((placeholder) => {
        const placeholderId = placeholder.id || 'unknown';
        const placeholderName = placeholder.name || 'unnamed';

        console.group(`🔍 [${placeholderId}] Processing placeholder: ${placeholderName}`);

        // Log detailed placeholder metadata
        const placeholderDetails = {
            id: placeholderId,
            name: placeholderName,
            type: placeholder.type || 'text',
            entity_type: placeholder.entity_type || 'unknown',
            master_field_ids: placeholder.master_field_ids || [],
            is_digit_split: placeholder.is_digit_split || false,
            digit_count: placeholder.digit_count || 0,
            director_type: placeholder.director_type || 'any',
            parent_name: placeholder.parent_name || 'none',
            is_block_start: placeholder.is_block_start || false,
            description: placeholder.description || 'no description',
            created_at: placeholder.created_at || 'unknown',
            updated_at: placeholder.updated_at || 'never'
        };

        console.log('📋 Placeholder Metadata:', JSON.stringify(placeholderDetails, null, 2));

        // Log source data cache info
        console.log('💾 Source Data Cache Keys:', Object.keys(sourceDataCache || {}));
        console.log('✨ Additional Cache Keys:', Object.keys(additionalCache || {}));

        // Log master fields info if available
        if (placeholder.master_field_ids?.length > 0) {
            console.log('🔑 Master Field References:', placeholder.master_field_ids.map(id => {
                const mf = masterFields?.get(parseInt(id, 10));
                return {
                    id,
                    label: mf?.label || 'Unknown',
                    field_key: mf?.field_key || 'N/A',
                    sources: mf?.sources?.map(s => ({
                        table: s.table || 'unknown',
                        path: s.path || 'N/A',
                        document_id: s.document_id || 'any'
                    })) || []
                };
            }));
        }

        const ids = placeholder.master_field_ids || [];
        const combinedCache = { ...sourceDataCache, ...additionalCache };
        const isPrimaryDirectorReq = placeholder.director_type === 'primary';

        // 1. Normalize Placeholder Entity Type
        let pEntityType = 'company';
        if (Array.isArray(placeholder.entity_type)) {
            pEntityType = placeholder.entity_type[0];
        } else if (placeholder.entity_type) {
            pEntityType = placeholder.entity_type;
        }
        const isDependantType = pEntityType && ['dependant', 'dependent'].includes(pEntityType.toLowerCase()?.trim());

        // 2. Resolve the Target Subject (The person/entity this field refers to)
        let targetEntity = null;
        let sourceLabel = "";

        if (isDependantType && relationshipData?.dependants) {
            // Try to match by dependant_relationship or infer from field name keywords
            if (placeholder.dependant_relationship?.[0]) {
                const targetRel = placeholder.dependant_relationship[0].toLowerCase();
                targetEntity = relationshipData.dependants.find(d => d.relationship?.toLowerCase() === targetRel);
            }
            if (!targetEntity) {
                const fieldName = placeholder.name.toLowerCase();
                const relKeywords = { 'father': ['father'], 'mother': ['mother'], 'wife': ['wife', 'spouse'], 'husband': ['husband', 'spouse'], 'child': ['child'] };
                for (const [rel, keywords] of Object.entries(relKeywords)) {
                    if (keywords.some(k => fieldName.includes(k))) {
                        targetEntity = relationshipData.dependants.find(d => d.relationship?.toLowerCase() === rel);
                        if (targetEntity) break;
                    }
                }
            }
            sourceLabel = targetEntity ? `Dependant (${targetEntity.relationship})` : "";
            console.log('🔹 Dependant resolved:', {
                targetEntity,
                source: 'relationshipData.dependants',
                relationship: placeholder.dependant_relationship,
                sourceLabel
            });
            // Replace the director resolution section with this updated version
        } else if (pEntityType === 'director') {
            console.log('🔍 Looking up director details in data sources...');

            // Try to find director in master fields first
            if (ids.length > 0 && masterFields) {
                for (const id of ids) {
                    const mf = masterFields.get(parseInt(id, 10));
                    if (mf?.sources) {
                        console.log(`🔹 Checking master field ${mf.id} (${mf.name}):`, {
                            sources: mf.sources,
                            placeholderName: placeholder.name
                        });

                        for (const source of mf.sources) {
                            const tableData = combinedCache[source.table];
                            if (!tableData) {
                                console.log(`   - No data in cache for table: ${source.table}`);
                                continue;
                            }

                            const records = Object.values(tableData);
                            console.log(`   - Found ${records.length} records in ${source.table}`);

                            // Try to find the most relevant record
                            let record = null;

                            // If we have a specific director ID, use it
                            if (relationshipData?.directors?.[0]?.id) {
                                const directorId = String(relationshipData.directors[0].id);
                                const linkingVar = source.linking_variable || 'id';
                                record = records.find(r =>
                                    String(r[linkingVar] || r.id || r.individual_id || r.director_id) === directorId
                                );
                            }

                            // If no specific ID or no match, try to find by name or other criteria
                            if (!record && placeholder.name) {
                                const nameField = source.path?.includes('first_name') ? 'first_name' :
                                    source.path?.includes('last_name') ? 'last_name' :
                                        'name';

                                record = records.find(r => {
                                    const recordName = String(r[source.path] || r[nameField] || '');
                                    return recordName && placeholder.name.toLowerCase().includes(recordName.toLowerCase());
                                });
                            }

                            if (record) {
                                const value = source.path ? parseJsonValue(record, source.path) : record[placeholder.name];
                                console.log(`   ✅ Found value in ${source.table}:`, {
                                    recordId: record.id,
                                    sourcePath: source.path,
                                    value
                                });

                                if (value) {
                                    sourceLabel = `Data Source: ${source.table}${source.path ? '.' + source.path : ''}`;
                                    return {
                                        value,
                                        source: sourceLabel,
                                        rawRecord: record // Include raw record for debugging
                                    };
                                }
                            } else {
                                console.log(`   ❌ No matching record found in ${source.table}`);
                            }
                        }
                    }
                }
            }

            // Fallback to relationship data if no match found in data sources
            if (relationshipData?.directors?.length) {
                console.log('ℹ️ Falling back to relationship data for director');
                targetEntity = relationshipData.directors[0];
                sourceLabel = "Director (Fallback)";
            }
        } else if (pEntityType === 'company') {
            targetEntity = relationshipData.company;
            sourceLabel = "Company";
        }

        // 3. Handle System/Date fields (don't need an entity)
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

        if (!targetEntity) return { value: '', source: null };

        if (placeholder.type === 'conditional' && placeholder.conditions) {

            for (const condition of placeholder.conditions) {
                const tag = condition.tag;
                const mId = condition.master_field_id;

                // P1: Direct field access on entity
                if (targetEntity[tag]) return { value: `${condition.label || ''}${targetEntity[tag]}`, source: `${sourceLabel} Direct` };

                // P2: Case-insensitive direct access
                const matchKey = Object.keys(targetEntity).find(k => k.toLowerCase() === tag.toLowerCase());
                if (matchKey && targetEntity[matchKey]) return { value: `${condition.label || ''}${targetEntity[matchKey]}`, source: `${sourceLabel} Direct (Inferred)` };

                // P3: Master Field Broad Cache Lookup
                if (mId && masterFields) {
                    const mf = masterFields.get(parseInt(mId, 10));
                    if (mf?.sources) {
                        for (const source of mf.sources) {
                            const tableData = combinedCache[source.table];
                            if (!tableData) continue;

                            let records = Object.values(tableData);

                            // Filter by document_id if provided
                            if (source.document_id) {
                                const reqDocIds = Array.isArray(source.document_id) ? source.document_id : [source.document_id];
                                records = records.filter(r => reqDocIds.includes(r.document_id || r.kyc_document_id));
                            }

                            const linkingVar = source.linking_variable || 'id';
                            const searchId = String(targetEntity.id);
                            const record = records.find(rec => {
                                const recId = String(rec[linkingVar] || rec.id || rec.individual_id || rec.director_id);
                                return recId === searchId || recId.startsWith(searchId + ' ');
                            });

                            if (record) {
                                const condVal = source.path ? parseJsonValue(record, source.path) : record[tag];
                                if (condVal && typeof condVal !== 'object') {
                                    return { value: `${condition.label || ''}${condVal}`, source: `Conditional - ${mf.label} (Fresh)` };
                                }
                            }
                        }
                    }
                }
            }
            return { value: '', source: null };
        }

        // Add to getPlaceholderValue function
        if (placeholder.type === 'boolean' && placeholder.boolean_conditions) {
            const results = [];

            for (const condition of placeholder.boolean_conditions) {
                let isChecked = false;

                // Scenario 1: DB-driven (has master_field_id)
                if (condition.master_field_id) {
                    const mf = masterFields.get(parseInt(condition.master_field_id, 10));
                    if (mf?.sources) {
                        for (const source of mf.sources) {
                            const tableData = combinedCache[source.table];
                            if (!tableData) continue;

                            const searchId = String(targetEntity.id);
                            const record = Object.values(tableData).find(r =>
                                String(r[source.linking_variable || 'id']) === searchId
                            );

                            if (record) {
                                const fieldValue = source.path
                                    ? parseJsonValue(record, source.path)
                                    : record[condition.comparison?.field || condition.tag];

                                // Evaluate comparison
                                if (condition.comparison) {
                                    const { operator, value } = condition.comparison;
                                    const strValue = String(fieldValue).toLowerCase();
                                    const compareValue = String(value).toLowerCase();

                                    switch (operator) {
                                        case 'equals':
                                            isChecked = strValue === compareValue;
                                            break;
                                        case 'not_equals':
                                            isChecked = strValue !== compareValue;
                                            break;
                                        case 'contains':
                                            isChecked = strValue.includes(compareValue);
                                            break;
                                    }
                                } else {
                                    // If no comparison, treat as boolean
                                    isChecked = Boolean(fieldValue);
                                }

                                if (isChecked) break;
                            }
                        }
                    }
                }
                // Scenario 2: User input (no master_field_id)
                // Value will be set manually in form

                results.push({
                    tag: condition.tag,
                    label: condition.label,
                    checked: isChecked,
                    hasDbLink: Boolean(condition.master_field_id)
                });
            }

            return {
                value: results,
                source: results.some(r => r.hasDbLink) ? 'Boolean (DB)' : 'Boolean (User Input)'
            };
        }

        // --- CASE B: Name Fields ---
        if (placeholder.name.toLowerCase().includes('name')) {
            return { value: targetEntity.full_name || targetEntity.name || '', source: `${sourceLabel} - Relationship Data` };
        }

        // --- CASE C: Image/Signature Fields ---
        if (placeholder.type === 'image' || placeholder.name.startsWith('%')) {
            for (const id of ids) {
                const mf = masterFields.get(parseInt(id, 10));
                if (!mf?.sources) continue;
                for (const source of mf.sources) {
                    const tableData = combinedCache[source.table];
                    if (!tableData) continue;
                    const linkingVar = source.linking_variable || 'id';
                    const searchId = String(targetEntity.id);
                    const reqDocIds = Array.isArray(source.document_id) ? source.document_id : [source.document_id];

                    const match = Object.values(tableData).find(d =>
                        reqDocIds.includes(d.document_id || d.kyc_document_id) &&
                        String(d[linkingVar] || d.id) === searchId
                    );

                    if (match?.file_path) {
                        return {
                            value: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${match.file_path}`,
                            source: 'Fresh Image Cache'
                        };
                    }
                }
            }
        }

        // --- CASE D: Standard Master Field Text Lookup ---
        for (const id of ids) {
            const mf = masterFields.get(parseInt(id, 10));
            if (!mf?.sources) continue;
            for (const source of mf.sources) {
                const tableData = combinedCache[source.table];
                if (!tableData) continue;
                const linkingVar = source.linking_variable || 'id';
                const searchId = String(targetEntity.id);
                const record = Object.values(tableData).find(r => String(r[linkingVar] || r.id) === searchId);
                if (record) {
                    const val = source.path ? parseJsonValue(record, source.path) : record[placeholder.name];
                    if (val) return { value: val, source: `Broad Fresh Lookup` };
                }
            }
        }

        console.warn(`⚠️ No value found for placeholder "${placeholder.name}" after checking all sources`, {
            placeholder: placeholder.name,
            type: placeholder.type,
            entity_type: placeholder.entity_type,
            master_field_ids: placeholder.master_field_ids,
            available_keys: [...new Set([
                ...Object.keys(sourceDataCache || {}),
                ...Object.keys(additionalCache || {})
            ])]
        });

        // Log potential matches for debugging
        if (placeholder.master_field_ids?.length > 0) {
            const potentialValues = [];
            placeholder.master_field_ids.forEach(id => {
                const mf = masterFields?.get(parseInt(id, 10));
                if (mf?.sources) {
                    mf.sources.forEach(source => {
                        const table = source.table;
                        const cache = { ...(sourceDataCache || {}), ...(additionalCache || {}) };
                        if (cache[table]) {
                            Object.entries(cache[table]).forEach(([key, value]) => {
                                if (value && typeof value === 'object') {
                                    potentialValues.push({
                                        source: table,
                                        key,
                                        available_fields: Object.keys(value)
                                    });
                                }
                            });
                        }
                    });
                }
            });

            if (potentialValues.length > 0) {
                console.log('🔍 Potential data sources found (but no direct match):', potentialValues);
            }
        }

        console.groupEnd();
        return { value: '', source: 'Not Found' };
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
            const combinedCache = { ...sourceDataCache, ...additionalCache };

            groupedPlaceholders.topLevel.forEach(p => {
                let match = getPlaceholderValue(p);

                // Special handling for boolean types
                if (p.type === 'boolean') {
                    if (match.value && Array.isArray(match.value)) {
                        // Already in correct format from getPlaceholderValue
                        initData[p.name] = match.value;
                    } else if (p.boolean_conditions) {
                        // Initialize with unchecked options for user input
                        initData[p.name] = p.boolean_conditions.map(cond => ({
                            tag: cond.tag,
                            label: cond.label,
                            checked: false,
                            hasDbLink: false
                        }));
                    }
                } else {
                    if (!match.value) match = smartFieldMatch(p.name);
                    initData[p.name] = match.value || '';
                }

                if (match.value) autoMap.set(p.name, match.source);
            });

            Object.keys(groupedPlaceholders.blocks).forEach(blockName => {
                const block = groupedPlaceholders.blocks[blockName];
                const resolvedRows = resolveArrayData(
                    block.config,
                    selectedTemplate.placeholders,
                    combinedCache,
                    masterFields,
                    entityIdMap,
                    relationshipData
                );
                initData[blockName] = resolvedRows;
                if (resolvedRows.length > 0) autoMap.set(blockName, `Auto-populated`);
            });

            setFormData(initData);
            setOriginalFormData(JSON.parse(JSON.stringify(initData)));
            setAutoPopulatedFields(autoMap);

            setTimeout(() => {
                if (docxTemplateBuffer.current) updateWordPreview(initData, imageStyles);
                else setPreviewContent(populateHtmlContent(initData, selectedTemplate.placeholders || [], imageStyles));
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
        const rows = Array.isArray(formData[blockName]) ? formData[blockName] : [];
        const isHorizontal = blockData?.config?.array_direction === 'horizontal';

        return (
            <div className="space-y-4 mt-2 border-l-2 border-blue-200 pl-4 py-2 bg-blue-50/20 rounded-r-lg">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                        <Badge className={`${isHorizontal ? 'bg-orange-600' : 'bg-blue-600'} uppercase text-[9px] tracking-tighter`}>
                            {blockName} {isHorizontal && '(Horizontal)'}
                        </Badge>
                    </div>
                </div>

                {rows.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic p-3 text-center">No data found.</div>
                ) : isHorizontal ? (
                    /* HORIZONTAL UI - Character Boxes */
                    <div className="p-3 bg-white border rounded shadow-sm">
                        <Label className="text-[9px] font-bold text-slate-400 uppercase block mb-2">
                            {blockData.children[0]?.name.replace(/_/g, ' ')}
                        </Label>
                        <div className="flex flex-wrap gap-1">
                            {rows.map((row, idx) => {
                                const rowValue = row && typeof row === 'object' ? Object.values(row)[0] : row;
                                return (
                                    <input
                                        key={idx}
                                        value={rowValue || ''}
                                        onChange={(e) => {
                                            if (blockData?.children?.[0]?.name) {
                                                handleArrayInputChange(blockName, idx, blockData.children[0].name, e.target.value);
                                            }
                                        }}
                                        className="w-7 h-9 text-center border rounded font-mono font-bold text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-100 outline-none"
                                        maxLength={1}
                                    />
                                );
                            })}
                        </div>
                        <p className="text-[8px] text-muted-foreground mt-2 italic">Data is split across horizontal boxes</p>
                    </div>
                ) : (
                    /* **NORMAL RENDERING FOR REGULAR BLOCKS** */
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
    function createCell(value) {
        const displayValue = value !== undefined && value !== null ? value : '&nbsp;';
        console.log('Creating cell with value:', { value, displayValue });
        return `<span style="
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 30px;
    border: 1px solid #000;
    text-align: center;
    line-height: 1;
    font-family: monospace;
    font-weight: bold;
    background: #fff;
    padding: 0 8px;
  ">${displayValue}</span>`;
    }
    // Debug function to log with timestamp and style
    const debugLog = (...args) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [TEMPLATE_DEBUG]`, ...args);
    };

    const populateHtmlContent = useCallback((data, placeholders, styles) => {
        if (!selectedTemplate?.content) {
            console.error('❌ No template content available!', {
                selectedTemplate: selectedTemplate ? {
                    ...selectedTemplate,
                    content: selectedTemplate.content ? '[CONTENT PRESENT]' : '[NO CONTENT]'
                } : 'No template',
                stack: new Error().stack
            });
            return '[NO TEMPLATE CONTENT]';
        }
        if (!selectedTemplate?.content) {
            return '';
        }
        let content = selectedTemplate.content;
        Object.keys(groupedPlaceholders.blocks).forEach(blockName => {
            const block = groupedPlaceholders.blocks[blockName];
            const blockConfig = block.config || {};
            const isHorizontal = blockConfig.array_direction === 'horizontal';

            const blockRegex = new RegExp(`\\{#${blockName}\\}([\\s\\S]*?)\\{/${blockName}\\}`, 'g');
            const rows = Array.isArray(data[blockName]) ? data[blockName] : [];

            content = content.replace(blockRegex, (_, innerTemplate) => {
                if (rows.length === 0) return '';

                if (isHorizontal) {
                    // We don't want to repeat the 'innerTemplate' (which might contain the label)
                    // We just want to render the digits side-by-side
                    const childName = block.children[0]?.name || 'd';
                    const cells = rows.map(row => {
                        const value = row[childName] ?? '';
                        return `<span style="display:inline-block;width:25px;height:30px;border:1px solid #000;text-align:center;line-height:30px;font-weight:bold;margin-right:2px;background:#fff;color:#000;">${value}</span>`;
                    }).join('');

                    return `<div style="display:flex;align-items:center;margin:5px 0;">${cells}</div>`;
                }
                return rows.map(row => {
                    let rowHtml = innerTemplate;
                    block.children.forEach(child => {
                        let value = row?.[child.name] ?? '';
                        const childRegex = new RegExp(`\\{+\\s*${child.name}\\s*\\}+`, 'g');

                        // ADD THIS CHECK:
                        if (child.type === 'image' && value && typeof value === 'string' && value.startsWith('http')) {
                            const style = styles[child.name] || {};
                            const imgWidth = style.imageWidth ? `${style.imageWidth}px` : "120px"; // Default size for table cells
                            value = `<img src="${value}" style="width:${imgWidth}; height:auto;" />`;
                        }

                        rowHtml = rowHtml.replace(childRegex, value);
                    });
                    return rowHtml;
                }).join('');
            });
        });

        console.log('🔍 All placeholders and values:', {
            placeholders: groupedPlaceholders.topLevel.map(p => ({
                name: p.name,
                type: p.type,
                is_digit_split: p.is_digit_split,
                digit_count: p.digit_count,
                value: data[p.name],
                rawValue: data[p.name]
            }))
        });

        groupedPlaceholders.topLevel.forEach(placeholder => {
            console.log('🔧 Processing placeholder:', {
                name: placeholder.name,
                cleanName: placeholder.name.replace(/[{}]/g, '').trim(),
                value: data[placeholder.name],
                type: placeholder.type,
                is_digit_split: placeholder.is_digit_split,
                digit_count: placeholder.digit_count
            });
            const value = data[placeholder.name];
            const cleanName = placeholder.name.replace(/[{}]/g, '').trim();
            if (placeholder.is_digit_split) {
                const chars = String(value || '').split('');
                const count = placeholder.digit_count || 8;
                for (let i = 1; i <= count; i++) {
                    // This Regex matches {em_1}, {EM_1}, {{ em_1 }}, etc.
                    const seqRegex = new RegExp(`\\{+\\s*${cleanName}_${i}\\s*\\}+`, 'gi');
                    const charVal = chars[i - 1] || '&nbsp;';
                    content = content.replace(seqRegex, charVal);
                }
                // Also try to replace the root tag {em} if used as a backup
                const baseRegex = new RegExp(`\\{+\\s*${cleanName}\\s*\\}+`, 'gi');
                content = content.replace(baseRegex, value || '');
                return;
            }
            // ✅ BOOLEAN / CHECKBOX LOGIC
            if (placeholder.type === 'boolean') {
                const options = Array.isArray(value)
                    ? value
                    : placeholder.boolean_conditions || [];

                options.forEach(option => {
                    const rawTag = option.tag.replace(/[{}]/g, '').trim();

                    const optRegex = new RegExp(
                        `\\{+\\s*(?:<[^>]*>)*\\s*${rawTag}\\s*(?:<[^>]*>)*\\s*\\}+`,
                        'gi'
                    );

                    const checkedHTML = `<b style="
          color:#16a34a;
          background:#dcfce7;
          border:1px solid #16a34a;
          padding:0 2px;
          font-family:monospace;
        ">[X]</b>`;

                    const uncheckedHTML = `<span style="
          color:#6b7280;
          border:1px solid #d1d5db;
          padding:0 2px;
          font-family:monospace;
        ">[&nbsp;&nbsp;]</span>`;

                    content = content.replace(
                        optRegex,
                        option.checked ? checkedHTML : uncheckedHTML
                    );
                });

                // Replace parent summary placeholder (e.g. {gender})
                const parentName = placeholder.name.replace(/[{}]/g, '').trim();
                const parentRegex = new RegExp(`\\{+\\s*${parentName}\\s*\\}+`, 'gi');

                const summary = options
                    .filter(o => o.checked)
                    .map(o => o.label)
                    .join(', ');

                content = content.replace(parentRegex, summary || '');
                return;
            }

            // ✅ STANDARD TEXT / IMAGE PLACEHOLDERS
            const regex = new RegExp(`\\{+\\s*${cleanName}\\s*\\}+`, 'gi');

            if (value !== undefined && value !== null && String(value).trim() !== '') {
                if (placeholder.type === 'image') {
                    const style = styles[placeholder.name] || {};
                    const imgWidth = style.imageWidth
                        ? `${style.imageWidth}px`
                        : style.maxWidth || '100%';

                    content = content.replace(
                        regex,
                        `<div style="text-align:${style.textAlign || 'center'};margin:5px 0;">
            <img src="${value}" style="width:${imgWidth};height:auto;max-width:100%;" />
          </div>`
                    );
                } else {
                    const formattedValue = /<[a-z][\s\S]*>/i.test(String(value))
                        ? value
                        : String(value).replace(/\n/g, '<br />');

                    content = content.replace(regex, formattedValue);
                }
            } else {
                content = content.replace(
                    regex,
                    `<span style="background:#fef08a;padding:2px 4px;color:#854d0e;">
          [${placeholder.name}]
        </span>`
                );
            }
        });

        return content;
    }, [selectedTemplate, groupedPlaceholders]);

    const prepareRenderData = useCallback(async (data) => {
        const renderData = {};
        const imagePromises = [];

        // 1. Process Array Blocks and nested images
        for (const blockName of Object.keys(groupedPlaceholders.blocks)) {
            const block = groupedPlaceholders.blocks[blockName];
            const rows = JSON.parse(JSON.stringify(data[blockName] || [])); // Deep clone to avoid mutating state

            for (const row of rows) {
                for (const child of block.children) {
                    // If child is an image, convert its URL to Base64 for Docxtemplater
                    if (child.type === 'image' && row[child.name] && String(row[child.name]).startsWith('http')) {
                        const promise = fetchImageAsBase64(row[child.name]).then(b64 => {
                            row[child.name] = b64;
                        });
                        imagePromises.push(promise);
                    }
                }
            }
            renderData[blockName] = rows;
        }

        if (!selectedTemplate) return renderData;

        // 2. Process Top Level Placeholders
        (selectedTemplate.placeholders || []).forEach(p => {
            const val = data[p.name];
            const baseKey = p.name.replace(/[%#{}]/g, '').trim();

            // Skip children (handled above)
            if (p.parent_name || p.is_block_start) return;

            if (p.is_digit_split) {
                const strVal = String(val || '');
                const count = p.digit_count || 8;
                for (let i = 1; i <= count; i++) {
                    renderData[`${baseKey.toLowerCase()}_${i}`] = strVal[i - 1] || "";
                    renderData[`${baseKey.toUpperCase()}_${i}`] = strVal[i - 1] || "";
                }
                renderData[baseKey] = strVal;
            } else if (p.type === 'image' && val) {
                if (typeof val === 'string' && val.startsWith('http')) {
                    imagePromises.push(fetchImageAsBase64(val).then(b64 => {
                        renderData[baseKey] = b64;
                    }));
                } else {
                    renderData[baseKey] = val;
                }
            } else {
                renderData[baseKey] = val || "";
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

            // Process all images first
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
                    return s ? [s.imageWidth || 300, s.imageHeight || 200] : [300, 200];
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

            // Set the data and render
            doc.setData(processedData);
            doc.render();

            // Generate the document
            const out = doc.getZip().generate({ type: "arraybuffer" });

            // Convert to HTML for preview
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
                            return { src: '' }; // Return empty source on error
                        });
                    })
                }
            );

            // Update the preview content
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
            const original = originalFormData[placeholder.name];
            const current = formData[placeholder.name];

            // Handle boolean fields differently
            if (placeholder.type === 'boolean') {
                if (Array.isArray(original) && Array.isArray(current)) {
                    // Check if any checkbox state changed
                    const hasChanged = current.some((opt, idx) => {
                        const origOpt = original[idx];
                        return origOpt?.checked !== opt?.checked;
                    });

                    if (hasChanged) {
                        // For boolean, store the entire options array
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
                // Original logic for non-boolean fields
                const originalStr = String(original || '');
                const currentStr = String(current || '');

                if (original !== current && (currentStr.trim() !== '' || originalStr.trim() !== '')) {
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

    const generateAndDownload = async (type) => {
        console.log(`[generateAndDownload] Starting ${type.toUpperCase()} document generation`);
        setIsGenerating(true);

        try {
            const fileName = `${documentName.replace(/[^\w\s-]/g, '_')}_${formatDate(new Date(), 'YYYYMMDD')}`;
            console.log(`[generateAndDownload] Generated file name: ${fileName}`);

            if (!docxTemplateBuffer.current) {
                const errorMsg = 'No template buffer available for document generation';
                console.error('[generateAndDownload] Error:', errorMsg);
                toast({ title: "Error", description: errorMsg, variant: "destructive" });
                return;
            }

            console.log('[generateAndDownload] Preparing render data...');
            const renderData = await prepareRenderData(formData);
            console.log('[generateAndDownload] Render data prepared:', Object.keys(renderData).length > 0);

            console.log('[generateAndDownload] Initializing document generation...');
            const zip = new PizZip(docxTemplateBuffer.current);

            const imageModule = new ImageModule({
                centered: false,
                getImage: (tag) => {
                    console.log(`[generateAndDownload] Processing image tag: ${tag ? 'tag exists' : 'empty tag'}`);
                    return base64Parser(tag);
                },
                getSize: (img, tag, name) => {
                    const s = imageStyles[name];
                    const size = s ? [s.imageWidth || 300, s.imageHeight || 200] : [300, 200];
                    console.log(`[generateAndDownload] Image size for ${name || 'unnamed'}:`, size);
                    return size;
                }
            });

            console.log('[generateAndDownload] Creating Docxtemplater instance...');
            const doc = new Docxtemplater(zip, {
                modules: [imageModule],
                linebreaks: true,
                paragraphLoop: true,
                nullGetter: () => ""
            });

            console.log('[generateAndDownload] Setting and rendering document data...');
            doc.setData(renderData);
            try {
                doc.render();
                console.log('[generateAndDownload] Document rendered successfully');
            } catch (renderError) {
                console.error('[generateAndDownload] Error rendering document:', renderError);
                throw new Error(`Failed to render document: ${renderError.message}`);
            }

            console.log(`[generateAndDownload] Generating ${type.toUpperCase()} blob...`);
            const blob = doc.getZip().generate({
                type: "blob",
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            });
            console.log('[generateAndDownload] Blob generated:', blob.size > 0 ? `${Math.round(blob.size / 1024)}KB` : 'empty');

            if (type === 'word') {
                console.log('[generateAndDownload] Initiating Word document download...');
                try {
                    saveAs(blob, `${fileName}.docx`);
                    console.log('[generateAndDownload] Word download initiated');
                    toast({
                        title: "Success",
                        description: `Document downloaded as ${fileName}.docx`
                    });
                } catch (saveError) {
                    console.error('[generateAndDownload] Error saving Word document:', saveError);
                    throw new Error(`Failed to save Word document: ${saveError.message}`);
                }
            } else {
                console.log('[generateAndDownload] Preparing PDF generation...');
                try {
                    const html2pdf = (await import('html2pdf.js')).default;
                    console.log('[generateAndDownload] html2pdf loaded');

                    const element = document.createElement('div');
                    element.innerHTML = previewContent;
                    element.className = EDITOR_PREVIEW_STYLES + ' p-10 bg-white';
                    element.style.width = '800px';

                    console.log('[generateAndDownload] Starting PDF generation...');
                    await html2pdf()
                        .set({
                            margin: 10,
                            filename: `${fileName}.pdf`,
                            html2canvas: {
                                scale: 2,
                                useCORS: true,
                                logging: true,
                                onclone: (clonedDoc) => {
                                    console.log('[html2canvas] Document cloned for rendering');
                                }
                            },
                            jsPDF: {
                                unit: 'mm',
                                format: 'a4',
                                orientation: 'portrait'
                            }
                        })
                        .from(element)
                        .save();
                    console.log('[generateAndDownload] PDF generated and download initiated');
                } catch (pdfError) {
                    console.error('[generateAndDownload] Error generating PDF:', pdfError);
                    throw new Error(`Failed to generate PDF: ${pdfError.message}`);
                }
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error('[generateAndDownload] Unhandled error:', e);
            toast({
                title: "Error",
                description: errorMessage,
                variant: "destructive"
            });
        } finally {
            console.log('[generateAndDownload] Cleaning up...');
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

                                            {p.is_digit_split ? (
                                                /* DIGIT SPLIT INPUT BOXES */
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {Array.from({ length: p.digit_count || 8 }).map((_, idx) => {
                                                        const val = String(formData[p.name] || '');
                                                        return (
                                                            <input
                                                                key={idx}
                                                                maxLength={1}
                                                                value={val[idx] || ''}
                                                                onChange={(e) => {
                                                                    const char = e.target.value.slice(-1);
                                                                    let currentStr = val.padEnd(p.digit_count, ' ');
                                                                    const newStr = currentStr.substring(0, idx) + char + currentStr.substring(idx + 1);
                                                                    handleInputChange(p.name, newStr.trimEnd());
                                                                }}
                                                                className="w-7 h-8 text-center border rounded font-mono font-bold text-sm focus:border-blue-400 outline-none bg-white"
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            ) : p.type === 'image' ? (
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
                                            ) : p.type === 'boolean' ? (
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-2">
                                                        <Label className="font-semibold uppercase text-[11px]">
                                                            {p.name.replace(/_/g, ' ')}
                                                        </Label>
                                                        {autoPopulatedFields.has(p.name) && (
                                                            <Badge variant="secondary" className="text-[9px] bg-green-50 text-green-600">
                                                                Auto
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    <div className="space-y-2 pl-2">
                                                        {(Array.isArray(formData[p.name]) ? formData[p.name] : p.boolean_conditions || []).map((option, idx) => {
                                                            const isChecked = Array.isArray(formData[p.name])
                                                                ? formData[p.name][idx]?.checked
                                                                : false;

                                                            const isDisabled = Array.isArray(formData[p.name])
                                                                ? formData[p.name][idx]?.hasDbLink
                                                                : false;

                                                            return (
                                                                <div key={idx} className="flex items-center gap-2 p-2 border rounded bg-white">
                                                                    <Checkbox
                                                                        id={`${p.name}-${idx}`}
                                                                        checked={isChecked}
                                                                        disabled={isDisabled}
                                                                        onCheckedChange={(checked) => {
                                                                            setFormData(prev => {
                                                                                const options = [...(Array.isArray(prev[p.name]) ? prev[p.name] : p.boolean_conditions || [])];

                                                                                if (p.boolean_type === 'single') {
                                                                                    // Radio behavior - uncheck others
                                                                                    options.forEach((opt, i) => {
                                                                                        if (!opt.hasDbLink) {
                                                                                            opt.checked = i === idx ? checked : false;
                                                                                        }
                                                                                    });
                                                                                } else {
                                                                                    // Checkbox behavior
                                                                                    if (!options[idx].hasDbLink) {
                                                                                        options[idx].checked = checked;
                                                                                    }
                                                                                }

                                                                                return { ...prev, [p.name]: options };
                                                                            });
                                                                        }}
                                                                    />
                                                                    <Label
                                                                        htmlFor={`${p.name}-${idx}`}
                                                                        className={`text-xs cursor-pointer ${isDisabled ? 'text-muted-foreground' : ''}`}
                                                                    >
                                                                        {option.label}
                                                                        {isDisabled && (
                                                                            <Badge variant="outline" className="ml-2 text-[8px]">
                                                                                Auto-filled
                                                                            </Badge>
                                                                        )}
                                                                    </Label>
                                                                    {isChecked && (
                                                                        <CheckCircle2 className="h-3 w-3 text-green-500 ml-auto" />
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ) : (
                                                /* TEXT/OTHER TYPES */
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