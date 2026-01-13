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
    Loader2, Wand2, Expand, CheckCircle2, X, Image as ImageIcon, Save, Sparkles
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
const isDate = (str) => {
    if (!str || typeof str !== 'string') return false;
    
    const datePatterns = [
        /^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/,
        /^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/,
        /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
    ];
    
    return datePatterns.some(pattern => pattern.test(str.trim()));
};

const processDigitSplit = (value, digitCount = 8) => {
    if (!value) return [];
    
    const strValue = String(value);
    const chars = isDate(strValue) 
        ? strValue.replace(/\D/g, '').split('')
        : strValue.split('');
    
    const result = [];
    for (let i = 1; i <= digitCount; i++) {
        result.push(chars[i - 1] || '');
    }
    return result;
};

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

const findPrimaryDirector = (relationshipData) => {
    if (!relationshipData?.directors?.length) return null;
    const directors = Array.isArray(relationshipData.directors)
        ? relationshipData.directors
        : [relationshipData.directors];
    return directors.find(d => d.is_primary) || directors[0];
};

const getOrdinalNumber = (index: number): string => {
    const num = index + 1;

    if (num % 100 >= 11 && num % 100 <= 13) {
        return `${num}th`;
    }

    switch (num % 10) {
        case 1: return `${num}st`;
        case 2: return `${num}nd`;
        case 3: return `${num}rd`;
        default: return `${num}th`;
    }
};

const getOrdinalWord = (index: number): string => {
    const words = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
    return words[index] || getOrdinalNumber(index);
};

const checkDocumentStatus = (
  documentId: string,
  entityId: string,
  entityType: string,
  sourceDataCache: Record<string, Record<number, any>>,
  dataSourceConfig?: {
    table: string;
    linking_variable: string;
    document_id_field: string;
  }
): boolean => {
  // Use provided config or fallback to defaults
  const config = dataSourceConfig || {
    table: 'acc_portal_kyc_uploads',
    linking_variable: entityType === 'company' ? 'company_id' : 'individual_id',
    document_id_field: 'kyc_document_id'
  };
  
  console.log('[checkDocumentStatus] Config:', config);
  console.log('[checkDocumentStatus] Looking for document:', documentId, 'entity:', entityId);
  
  // Get uploads from the specified table
  const uploads = sourceDataCache[config.table] || {};
  
  // Check if the document exists for this entity
  const documentFound = Object.values(uploads).some(upload => {
    // Must match the document ID using the specified field
    const uploadDocId = upload[config.document_id_field];
    if (uploadDocId !== documentId) return false;
    
    // Must have a file uploaded
    if (!upload.file_path) return false;
    
    // Match based on the specified linking variable
    return String(upload[config.linking_variable]) === String(entityId);
  });
  
  console.log('[checkDocumentStatus] Result:', documentFound);
  return documentFound;
};

const generateDocumentChecklist = (
  placeholder: any,
  entityId: string,
  entityType: string,
  sourceDataCache: Record<string, Record<number, any>>,
  availableDocuments: Array<{ id: string; display_name: string; name: string }>
): string => {
  const linkedDocs = placeholder.linked_document_ids || [];
  const format = placeholder.checklist_display_format || 'checkboxes';
  const dataSourceConfig = placeholder.checklist_data_source;
  
  console.log('[generateDocumentChecklist] Placeholder config:', {
    linkedDocs,
    format,
    dataSourceConfig,
    entityId,
    entityType
  });
  
  if (linkedDocs.length === 0) {
    return 'No documents configured for this checklist.';
  }
  
  const checklist = linkedDocs.map(docId => {
    const doc = availableDocuments.find(d => d.id === docId);
    const isFound = checkDocumentStatus(
      docId,
      entityId,
      entityType,
      sourceDataCache,
      dataSourceConfig // Pass the custom config
    );
    
    const docName = doc?.display_name || doc?.name || 'Unknown Document';
    const symbol = isFound ? '☑' : '☐';
    
    switch (format) {
      case 'bullets':
        return `• ${docName}${isFound ? ' ✓' : ''}`;
      case 'table':
        return `| ${symbol} | ${docName} | ${isFound ? 'Submitted' : 'Pending'} |`;
      default: // checkboxes
        return `${symbol}`;
    }
  });
  
  if (format === 'table') {
    return `| Status | Document | Notes |\n|--------|----------|-------|\n${checklist.join('\n')}`;
  }
  
  return checklist.join('\n');
};

// --- UNIFIED PLACEHOLDER PROCESSORS ---
const getTargetEntity = (placeholder, relationshipData, arrayIndex = null, sourceArray = null, entityIdMap = null, combinedCache = null, extractedData = null, companyData = null) => {
    // Priority 1: If we are inside an array loop (Block), use the current item
    if (sourceArray && arrayIndex !== null && sourceArray[arrayIndex]) {
        return sourceArray[arrayIndex];
    }

    // Determine requested type
    let entityType = 'company';
    if (Array.isArray(placeholder.entity_type)) {
        entityType = placeholder.entity_type[0];
    } else if (placeholder.entity_type) {
        entityType = placeholder.entity_type;
    }
    const normType = entityType?.toLowerCase()?.trim();

    // Priority 2: Use specific ID from entityIdMap if the types match
    if (entityIdMap) {
        // If placeholder wants a director and we have a specific director ID for this column
        if (normType === 'director' && entityIdMap.director) {
            const dirId = entityIdMap.director;
            return relationshipData?.directors?.find(d => String(d.id) === String(dirId)) || 
                   combinedCache?.['registry_individuals']?.[dirId];
        }

        // If placeholder wants a principal
        if (normType === 'principal' && entityIdMap.principal) {
            return relationshipData?.principal;
        }

        // If placeholder wants a company
        if (normType === 'company' && entityIdMap.company) {
            return relationshipData?.company || companyData || extractedData;
        }
    }

    // Priority 3: Fallback to Relationship Data logic (original logic)
    if (['dependant', 'dependent', 'spouse', 'child'].includes(normType)) {
        if (placeholder.dependant_relationship?.[0]) {
            const targetRel = placeholder.dependant_relationship[0].toLowerCase();
            return relationshipData?.dependants?.find(d => d.relationship?.toLowerCase() === targetRel);
        }
        return relationshipData?.dependants?.[0];
    }

    if (normType === 'director') {
        return placeholder.director_type === 'primary' 
            ? relationshipData?.directors?.find(d => d.is_primary) 
            : relationshipData?.directors?.[0];
    }

    if (normType === 'company') {
        return relationshipData?.company || companyData || extractedData;
    }

    return null;
};

/**
 * Process ordinal fields
 */
const processOrdinalField = (placeholder, arrayIndex) => {
    const ordinalFormat = placeholder.ordinal_format || 'number';
    
    if (ordinalFormat === 'word') {
        return {
            value: getOrdinalWord(arrayIndex),
            source: 'Ordinal Generator'
        };
    } else if (ordinalFormat === 'custom') {
        const customFormat = placeholder.custom_ordinal_format || '.';
        const num = arrayIndex + 1;
        return {
            value: `${num}${customFormat}`,
            source: 'Custom Ordinal Generator'
        };
    } else {
        // Default to number format
        return {
            value: getOrdinalNumber(arrayIndex),
            source: 'Ordinal Generator'
        };
    }
};

/**
 * Process current date fields
 */
const processCurrentDateField = (placeholder, masterFields) => {
    if (!placeholder.master_field_ids?.length || !masterFields) {
        return { value: '', source: null };
    }

    for (const id of placeholder.master_field_ids) {
        const mf = masterFields.get(parseInt(id, 10));
        if (mf?.date_config?.useCurrentDate) {
            return {
                value: formatDate(new Date(), mf.date_config.format || 'DD/MM/YYYY'),
                source: 'System Date'
            };
        }
    }

    return { value: '', source: null };
};

/**
 * Process conditional fields
 */
const processConditionalField = (placeholder, targetEntity, combinedCache, masterFields) => {
    if (!placeholder.conditions || !targetEntity) {
        return { value: '', source: null };
    }

    const targetId = String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id);

    for (const condition of placeholder.conditions) {
        const tag = condition.tag;

        // ONLY use Master Field Cache Lookup - no direct access
        if (condition.master_field_id && masterFields) {
            const mf = masterFields.get(parseInt(condition.master_field_id, 10));
            if (mf?.sources) {
                for (const source of mf.sources) {
                    const tableData = combinedCache[source.table];
                    if (!tableData) continue;

                    let records = Object.values(tableData);

                    if (source.document_id) {
                        const requiredIds = Array.isArray(source.document_id)
                            ? source.document_id
                            : [source.document_id];
                        records = records.filter(r =>
                            requiredIds.includes(r.document_id || r.kyc_document_id)
                        );
                    }

                    const linkingVar = source.linking_variable || 'id';

                    const record = records.find(rec => {
                        const recId = String(rec[linkingVar] || rec.id || rec.individual_id || rec.director_id);
                        return recId === targetId || recId.startsWith(targetId + ' ');
                    });

                    if (record) {
                        const rawVal = source.path
                            ? parseJsonValue(record, source.path)
                            : record[tag];
                        if (rawVal) {
                            return {
                                value: `${condition.label || ''}${rawVal}`,
                                source: `DB: ${mf.label || source.table}`
                            };
                        }
                    }
                }
            }
        }
    }

    return { value: '', source: null };
};

/**
 * Process boolean fields
 */
const processBooleanField = (placeholder, targetEntity, combinedCache, masterFields) => {
    if (!placeholder.boolean_conditions) {
        return { value: [], source: null };
    }

    const targetId = String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id);

    const results = placeholder.boolean_conditions.map(condition => {
        let isChecked = false;

        if (condition.master_field_id) {
            const mf = masterFields.get(parseInt(condition.master_field_id, 10));
            if (mf?.sources) {
                for (const source of mf.sources) {
                    const tableData = combinedCache[source.table];
                    if (!tableData) continue;

                    const record = Object.values(tableData).find(r =>
                        String(r[source.linking_variable || 'id']) === targetId
                    );

                    if (record) {
                        const fieldValue = source.path
                            ? parseJsonValue(record, source.path)
                            : record[condition.comparison?.field || condition.tag];

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
                            isChecked = Boolean(fieldValue);
                        }

                        if (isChecked) break;
                    }
                }
            }
        }

        return {
            tag: condition.tag,
            label: condition.label,
            checked: isChecked,
            hasDbLink: Boolean(condition.master_field_id)
        };
    });

    return {
        value: results,
        source: results.some(r => r.hasDbLink) ? 'Boolean (DB)' : 'Boolean (User Input)'
    };
};

/**
 * Process image fields
 */
const processImageField = (placeholder, targetEntity, combinedCache, masterFields) => {
    if (!placeholder.master_field_ids?.length) {
        return { value: '', source: null };
    }

    const searchId = String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id);

    for (const id of placeholder.master_field_ids) {
        const mf = masterFields.get(parseInt(id, 10));
        if (!mf?.sources) continue;

        for (const source of mf.sources) {
            const tableData = combinedCache[source.table];
            if (!tableData) continue;

            const linkingVar = source.linking_variable || 'id';
            const reqDocIds = Array.isArray(source.document_id)
                ? source.document_id
                : [source.document_id];

            const match = Object.values(tableData).find(d =>
                reqDocIds.includes(d.document_id || d.kyc_document_id) &&
                String(d[linkingVar] || d.id) === searchId
            );

            if (match?.file_path) {
                return {
                    value: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${match.file_path}`,
                    source: 'Image Cache'
                };
            }
        }
    }

    return { value: '', source: null };
};

/**
 * Process text fields using master field sources - handles MULTIPLE master fields
 */
const processTextField = (placeholder, targetEntity, combinedCache, masterFields) => {
    if (!placeholder.master_field_ids?.length) {
        return { value: '', source: null };
    }

    const searchId = String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id);
    const allValues = [];
    const allSources = [];

    // Iterate through ALL master field IDs
    for (const id of placeholder.master_field_ids) {
        const mf = masterFields.get(parseInt(id, 10));
        if (!mf?.sources) continue;

        for (const source of mf.sources) {
            const tableData = combinedCache[source.table];
            if (!tableData) continue;

            const linkingVar = source.linking_variable || 'id';

            const record = Object.values(tableData).find(r =>
                String(r[linkingVar] || r.id) === searchId
            );

            if (record) {
                const val = source.path
                    ? parseJsonValue(record, source.path)
                    : (record[mf.field_key] || record[placeholder.name]);

                if (val) {
                    allValues.push(val);
                    allSources.push(`DB: ${source.table}`);
                }
            }
        }
    }

    // If we found values, combine them
    if (allValues.length > 0) {
        // For names and similar fields, join with space
        const combinedValue = allValues.join(' ');
        const combinedSource = allSources[0]; // Use first source for display
        
        return {
            value: combinedValue,
            source: combinedSource
        };
    }

    return { value: '', source: null };
};

/**
 * MAIN UNIFIED PROCESSOR - handles all placeholder types
 */
const processPlaceholderValue = (placeholder, relationshipData, combinedCache, masterFields, entityIdMap = null, extractedData, companyData, arrayIndex = null, sourceArray = null) => {
    console.group(`🔍 Processing: ${placeholder.name} (${placeholder.type || 'text'})`);
    
    // Log entity_type for debugging
    if (placeholder.entity_type) {
        console.log(`🏷️ entity_type: ${placeholder.entity_type}`);
    }

    // CHECK FOR CURRENT DATE FIRST (before getting target entity)
    if (placeholder.master_field_ids?.length) {
        const dateResult = processCurrentDateField(placeholder, masterFields);
        if (dateResult.value) {
            console.log('✅ Current date field detected');
            console.groupEnd();
            return dateResult;
        }
    }

    // Get target entity
    const targetEntity = getTargetEntity(placeholder, relationshipData, arrayIndex, sourceArray, entityIdMap, combinedCache, extractedData, companyData);

    if (!targetEntity) {
        console.warn('⚠️ No target entity found');
        console.log('🔍 Debug - relationshipData.company:', relationshipData.company);
        console.log('🔍 Debug - placeholder.entity_type:', placeholder.entity_type);
        console.groupEnd();
        return { value: '', source: null };
    }

    console.log('Target Entity:', targetEntity?.name || targetEntity?.full_name || targetEntity?.id);

    let result = { value: '', source: null };

    // Route to appropriate processor based on field type
    switch (placeholder.type) {
        case 'document_checklist': {
            // Get available documents from a prop or fetch them
            // For now, we'll use an empty array - this should be passed as a prop
            const availableDocuments = window.__availableDocuments || [];
            
            const entityId = String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id || targetEntity.company_id);
            const entityType = Array.isArray(placeholder.entity_type) 
                ? placeholder.entity_type[0] 
                : placeholder.entity_type || 'company';
            
            result = {
                value: generateDocumentChecklist(
                    placeholder,
                    entityId,
                    entityType,
                    combinedCache,
                    availableDocuments
                ),
                source: 'Document Checklist'
            };
            break;
        }
        
        case 'ordinal':
            if (arrayIndex !== null) {
                result = processOrdinalField(placeholder, arrayIndex);
            }
            break;

        case 'conditional':
            result = processConditionalField(placeholder, targetEntity, combinedCache, masterFields);
            break;

        case 'boolean':
            result = processBooleanField(placeholder, targetEntity, combinedCache, masterFields);
            break;

        case 'image':
            result = processImageField(placeholder, targetEntity, combinedCache, masterFields);
            break;

        default:
            // For all other text fields, use master field sources
            result = processTextField(placeholder, targetEntity, combinedCache, masterFields);
    }

    console.log('Result:', result);
    console.groupEnd();

    return result;
};

/**
 * Extract display value from processed result
 */
const extractDisplayValue = (value) => {
    if (value === null || value === undefined) {
        return '';
    }

    if (Array.isArray(value)) {
        return value
            .filter(opt => opt && opt.checked)
            .map(opt => {
                if (!opt) return '';
                if (typeof opt === 'string') return opt;

                const possibleProps = ['label', 'display', 'text', 'value', 'name', 'title'];
                for (const prop of possibleProps) {
                    if (opt[prop] && typeof opt[prop] === 'string') {
                        return opt[prop];
                    }
                }

                if (opt.label && typeof opt.label === 'object') {
                    if (opt.label.label) return opt.label.label;
                    if (opt.label.display) return opt.label.display;
                }

                return opt.tag || '';
            })
            .filter(Boolean)
            .join(', ');
    }

    if (typeof value === 'object') {
        if (value.value !== undefined) {
            return String(value.value);
        }

        console.warn('Unexpected object value:', value);
        return '';
    }

    return String(value);
};

// --- UI COMPONENTS ---

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

/**
 * Unified placeholder input renderer
 */
const PlaceholderInput = ({ 
    placeholder, 
    value, 
    onChange, 
    onFileChange,
    imageStyles,
    onImageStyleChange,
    autoPopulated,
    isArrayItem = false,
    arrayIndex = null,
    blockName = null
}) => {
    const fieldKey = isArrayItem ? `${blockName}_${arrayIndex}_${placeholder.name}` : placeholder.name;
    
      if (placeholder.type === 'document_checklist') {
        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">
                        {placeholder.name.replace(/_/g, ' ')}
                    </Label>
                    {autoPopulated && (
                        <Badge variant="secondary" className="text-[9px]">
                            {autoPopulated}
                        </Badge>
                    )}
                </div>
                <div className="p-3 bg-slate-50 rounded border space-y-1.5">
                    {value ? (
                        <div className="text-xs whitespace-pre-line font-mono">
                            {value}
                        </div>
                    ) : (
                        <div className="text-xs text-muted-foreground italic">
                            No checklist data available
                        </div>
                    )}
                </div>
                <p className="text-[8px] text-muted-foreground italic">
                    ☑ = Document found, ☐ = Document missing
                </p>
            </div>
        );
    }

    if (placeholder.is_digit_split) {
        const val = String(value || '');
        const chars = processDigitSplit(val, placeholder.digit_count || 8);
        
        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">
                        {placeholder.name.replace(/_/g, ' ')}
                    </Label>
                    {autoPopulated && (
                        <Badge variant="secondary" className="text-[9px]">
                            {autoPopulated}
                        </Badge>
                    )}
                </div>
                <div className="flex flex-wrap gap-1">
                    {Array.from({ length: placeholder.digit_count || 8 }).map((_, idx) => {
                        const displayVal = chars[idx] || '';
                        return (
                            <input
                                key={idx}
                                maxLength={1}
                                value={displayVal}
                                onChange={(e) => {
                                    const char = e.target.value.slice(-1);
                                    let currentStr = val.padEnd(placeholder.digit_count, ' ');
                                    const newStr = currentStr.substring(0, idx) + char + currentStr.substring(idx + 1);
                                    onChange(newStr.trimEnd());
                                }}
                                className="w-7 h-8 text-center border rounded font-mono font-bold text-sm focus:border-blue-400 outline-none bg-white"
                            />
                        );
                    })}
                </div>
            </div>
        );
    }

    if (placeholder.type === 'image') {
        const imageStyleKey = isArrayItem ? `${blockName}_${arrayIndex}_${placeholder.name}` : placeholder.name;
        const styles = imageStyles[imageStyleKey] || {};
        
        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">
                        {placeholder.name.replace(/_/g, ' ')}
                    </Label>
                    {autoPopulated && (
                        <Badge variant="secondary" className="text-[9px]">
                            {autoPopulated}
                        </Badge>
                    )}
                </div>
                {value ? (
                    <div className="relative group rounded-md overflow-hidden border bg-white aspect-video flex items-center justify-center">
                        <img
                            src={value}
                            alt={placeholder.name}
                            className="max-h-full object-contain"
                            style={{
                                textAlign: styles.textAlign || 'center',
                                maxWidth: styles.maxWidth || '100%'
                            }}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 text-[10px]"
                                onClick={() => document.getElementById(`file-${fieldKey}`).click()}
                            >
                                Replace
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-[10px]"
                                onClick={() => onChange('')}
                            >
                                Remove
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button
                        variant="outline"
                        className="w-full h-20 border-dashed border-2 flex flex-col gap-1"
                        onClick={() => document.getElementById(`file-${fieldKey}`).click()}
                    >
                        <ImageIcon className="h-4 w-4 text-slate-400" />
                        <span className="text-[10px] text-slate-500">Upload {placeholder.name}</span>
                    </Button>
                )}
                <input
                    id={`file-${fieldKey}`}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={onFileChange}
                />
                <ImagePlaceholderControls
                    styles={styles}
                    onStyleChange={(key, val) => onImageStyleChange(imageStyleKey, key, val)}
                />
            </div>
        );
    }

    if (placeholder.type === 'boolean') {
        const options = Array.isArray(value) ? value : (placeholder.boolean_conditions || []);
        
        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">
                        {placeholder.name.replace(/_/g, ' ')}
                    </Label>
                    {autoPopulated && (
                        <Badge variant="secondary" className="text-[9px]">
                            {autoPopulated}
                        </Badge>
                    )}
                </div>
                <div className="space-y-2 bg-slate-50 p-2 rounded border">
                    {options.map((option, idx) => {
                        const isChecked = option?.checked || false;
                        const isDisabled = option?.hasDbLink || false;
                        
                        const getOptionLabel = (opt) => {
                            if (!opt) return '';
                            if (typeof opt === 'string') return opt;
                            if (opt.label && typeof opt.label === 'string') return opt.label;
                            if (opt.label && typeof opt.label === 'object' && opt.label.label) return opt.label.label;
                            return opt.tag || 'Option';
                        };
                        
                        return (
                            <div key={idx} className="flex items-center gap-2 p-2 border rounded bg-white">
                                <Checkbox
                                    id={`${fieldKey}-${idx}`}
                                    checked={isChecked}
                                    disabled={isDisabled}
                                    onCheckedChange={(checked) => {
                                        const newOptions = [...options];
                                        
                                        if (placeholder.boolean_type === 'single') {
                                            newOptions.forEach((opt, i) => {
                                                if (!opt.hasDbLink) {
                                                    opt.checked = i === idx ? checked : false;
                                                }
                                            });
                                        } else {
                                            if (!newOptions[idx].hasDbLink) {
                                                newOptions[idx].checked = checked;
                                            }
                                        }
                                        
                                        onChange(newOptions);
                                    }}
                                />
                                <Label
                                    htmlFor={`${fieldKey}-${idx}`}
                                    className={`text-xs cursor-pointer flex-1 ${isDisabled ? 'text-muted-foreground' : ''}`}
                                >
                                    {getOptionLabel(option)}
                                </Label>
                                {isDisabled && (
                                    <Badge variant="outline" className="text-[8px] bg-blue-50 text-blue-700">
                                        Auto-filled
                                    </Badge>
                                )}
                                {isChecked && !isDisabled && (
                                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-[10px] font-bold text-slate-400 uppercase">
                    {placeholder.name.replace(/_/g, ' ')}
                </Label>
                {autoPopulated && (
                    <Badge variant="secondary" className="text-[9px]">
                        {autoPopulated}
                    </Badge>
                )}
            </div>
            <Input
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                className="bg-white h-8 text-xs"
            />
        </div>
    );
};

export default function TemplateGenerationDialog({
    isOpen, onClose, template, availableTemplates = [], documentName, masterFields,
    entityIdMap, sourceDataCache, extractedData = {}, personData = {}, companyData = {},
    relationshipData = { directors: [], dependants: [], company: {}, principal: null, understudy: null },
}) {
    const { toast } = useToast();
    
    // Debug: Log the relationshipData structure
    useEffect(() => {
        if (isOpen && relationshipData) {
            console.log('🔗 TemplateGenerationDialog received relationshipData:', {
                company: relationshipData.company,
                directors: relationshipData.directors,
                dependants: relationshipData.dependants,
                principal: relationshipData.principal,
                understudy: relationshipData.understudy
            });
        }
    }, [isOpen, relationshipData]);

    // Debug: Log applicant_details.type from all data sources
    useEffect(() => {
        if (isOpen) {
            console.log('📋 Applicant Details Type Logging:');
            console.log('extractedData:', extractedData);
            console.log('personData:', personData);
            console.log('companyData:', companyData);
            
            // Log applicant_details.type if it exists in any data source
            if (extractedData?.applicant_details?.type) {
                console.log('🏢 applicant_details.type from extractedData:', extractedData.applicant_details.type);
            }
            if (personData?.applicant_details?.type) {
                console.log('👤 applicant_details.type from personData:', personData.applicant_details.type);
            }
            if (companyData?.applicant_details?.type) {
                console.log('🏢 applicant_details.type from companyData:', companyData.applicant_details.type);
            }
            if (relationshipData?.company?.type) {
                console.log('🏢 company.type from relationshipData:', relationshipData.company.type);
            }
            
            // Log the type field directly from each data source
            if (extractedData?.type) {
                console.log('🏢 extractedData.type:', extractedData.type);
            }
            if (personData?.type) {
                console.log('👤 personData.type:', personData.type);
            }
            if (companyData?.type) {
                console.log('🏢 companyData.type:', companyData.type);
            }
        }
    }, [isOpen, extractedData, personData, companyData, relationshipData]);

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
 const [availableDocuments, setAvailableDocuments] = useState<Array<{ id: string; display_name: string; name: string }>>([]);

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
            } catch (err) { 
                console.error(`Fetch Error ${table}:`, err); 
            } finally { 
                setFetchingTables(prev => { 
                    const n = new Set(prev); 
                    n.delete(table); 
                    return n; 
                }); 
            }
        }
    }, [isOpen, selectedTemplate, masterFields, entityIdMap, relationshipData]);

    useEffect(() => {
        if (isOpen) {
            setAdditionalCache({});
            setTimeout(fetchMissingDataSources, 50);
        }
    }, [isOpen, selectedTemplate?.id]);

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
                
                // Make available globally for the processor functions
                window.__availableDocuments = data || [];
            } catch (error) {
                console.error('Error fetching available documents:', error);
            }
        };

        fetchAvailableDocuments();
        
        return () => {
            // Cleanup
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

    const resolveArrayData = useCallback((blockPlaceholder, allPlaceholders, combinedCache, masterFields, entityIdMap, relationshipData, extractedData, companyData) => {
        console.group(`🔄 Processing Array Block: ${blockPlaceholder.name || 'unnamed-block'}`);

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

        // HANDLE DIFFERENT ENTITY TYPES FOR ARRAYS
        const normalizedEntityType = entityType.toLowerCase().trim();
        
        if (normalizedEntityType === 'director') {
            sourceArray = relationshipData.directors || [];
            if (isPrimaryOnly && sourceArray.length > 0) {
                const primary = sourceArray.find(d => d.is_primary) || sourceArray[0];
                sourceArray = primary ? [primary] : [];
            }
        } else if (['dependant', 'dependent', 'spouse', 'child', 'father', 'mother', 'son', 'daughter'].includes(normalizedEntityType)) {
            sourceArray = relationshipData.dependants || [];
            console.log(`🔍 Found ${sourceArray.length} total dependants:`, sourceArray);
            
            // Filter by relationship if specified in block config
            if (blockPlaceholder.dependant_relationship?.length > 0) {
                const targetRels = blockPlaceholder.dependant_relationship.map(rel => rel.toLowerCase());
                console.log(`🎯 Filtering by block config relationships: "${targetRels.join(', ')}"`);
                
                sourceArray = sourceArray.filter(d => 
                    targetRels.includes(d.relationship?.toLowerCase())
                );
                console.log(`📊 After filtering by "${targetRels.join(', ')}": ${sourceArray.length} items`);
            }
            // Or filter by entity type name itself (e.g., "spouse", "child") - only if no specific relationships configured
            else if (['spouse', 'child', 'father', 'mother', 'son', 'daughter'].includes(normalizedEntityType)) {
                console.log(`🎯 Filtering by entity type: "${normalizedEntityType}"`);
                
                // Use the entity type directly as relationship filter
                sourceArray = sourceArray.filter(d =>
                    d.relationship?.toLowerCase() === normalizedEntityType
                );
                console.log(`📊 After filtering by entity type "${normalizedEntityType}": ${sourceArray.length} items`);
            }
        }

        if (sourceArray.length === 0) {
            console.warn(`⚠️ No source array found for block: ${blockName} (entity type: ${entityType})`);
            console.groupEnd();
            return [];
        }

        console.log(`✅ Found ${sourceArray.length} items for ${blockName}`);

        const result = sourceArray.map((item, index) => {
            console.group(`📝 Item ${index + 1}/${sourceArray.length}`);
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
        sourceArray    // Argument 9: sourceArray (Critical Fix)
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

            console.log(`📊 Final row data:`, rowData);
            console.groupEnd();
            return rowData;
        });

        console.groupEnd();
        return result;
    }, [extractedData, personData, companyData]);

    useEffect(() => {
        if (isOpen && selectedTemplate && Object.keys(sourceDataCache).length > 0) {
            const initData = {};
            const autoMap = new Map();
            const combinedCache = { ...sourceDataCache, ...additionalCache };

            groupedPlaceholders.topLevel.forEach(p => {
                const match = processPlaceholderValue(
                    p,
                    relationshipData,
                    combinedCache,
                    masterFields
                );

                if (p.type === 'boolean') {
                    initData[p.name] = match.value;
                } else {
                    initData[p.name] = extractDisplayValue(match.value);
                }

                if (match.source) {
                    autoMap.set(p.name, match.source);
                }

                if (!initData[p.name] && p.type !== 'boolean') {
                    const smartMatch = smartFieldMatch(p.name);
                    if (smartMatch.value) {
                        initData[p.name] = smartMatch.value;
                        autoMap.set(p.name, smartMatch.source);
                    }
                }
            });

            Object.keys(groupedPlaceholders.blocks).forEach(blockName => {
                const block = groupedPlaceholders.blocks[blockName];
                const resolvedRows = resolveArrayData(
                    block.config,
                    selectedTemplate.placeholders,
                    combinedCache,
                    masterFields,
                    entityIdMap,
                    relationshipData,
                    extractedData,
                    companyData
                );
                initData[blockName] = resolvedRows;
                if (resolvedRows.length > 0) {
                    autoMap.set(blockName, `Auto-populated (${resolvedRows.length} items)`);
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

    const handleInputChange = (name, val) => {
        setFormData(prev => {
            const newState = { ...prev, [name]: val };
            
            if (docxTemplateBuffer.current) {
                updateWordPreview(newState, imageStyles);
            } else {
                setPreviewContent(populateHtmlContent(newState, selectedTemplate?.placeholders || [], imageStyles));
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
                setPreviewContent(populateHtmlContent(formData, selectedTemplate?.placeholders || [], newStyles));
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
                    <div className="p-3 bg-white border rounded shadow-sm">
                        <Label className="text-[9px] font-bold text-slate-400 uppercase block mb-2">
                            {blockData.children[0]?.name.replace(/_/g, ' ')}
                        </Label>
                        <div className="flex flex-wrap gap-1">
                            {rows.map((row, idx) => {
                                const rowValue = row && typeof row === 'object' ? extractDisplayValue(Object.values(row)[0]) : extractDisplayValue(row);
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
                                    const fieldValue = row[child.name];
                                    const autoSource = row[`__${child.name}_source`];

                                    return (
                                        <div key={child.id}>
                                            <PlaceholderInput
                                                placeholder={child}
                                                value={fieldValue}
                                                onChange={(val) => handleArrayInputChange(blockName, idx, child.name, val)}
                                                onFileChange={(e) => {
                                                    const file = e.target.files[0];
                                                    if (file) {
                                                        const reader = new FileReader();
                                                        reader.onloadend = () => handleArrayInputChange(blockName, idx, child.name, reader.result);
                                                        reader.readAsDataURL(file);
                                                    }
                                                }}
                                                imageStyles={imageStyles}
                                                onImageStyleChange={handleImageStyleChange}
                                                autoPopulated={autoSource}
                                                isArrayItem={true}
                                                arrayIndex={idx}
                                                blockName={blockName}
                                            />
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
        if (!selectedTemplate?.content) {
            console.error('❌ No template content available!');
            return '[NO TEMPLATE CONTENT]';
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
                    const childName = block.children[0]?.name || 'd';
                    const cells = rows.map(row => {
                        const value = extractDisplayValue(row[childName]);
                        return `<span style="display:inline-block;width:25px;height:30px;border:1px solid #000;text-align:center;line-height:30px;font-weight:bold;margin-right:2px;background:#fff;color:#000;">${value || '&nbsp;'}</span>`;
                    }).join('');

                    return `<div style="display:flex;align-items:center;margin:5px 0;">${cells}</div>`;
                }

                return rows.map((row, rowIndex) => {
                    let rowHtml = innerTemplate;
                    
                    block.children.forEach(child => {
                        const rawValue = row?.[child.name];
                        let value = extractDisplayValue(rawValue);

                        const childRegex = new RegExp(`\\{+\\s*${child.name}\\s*\\}+`, 'g');

                        if (child.type === 'image' && value && value.startsWith('http')) {
                            const styleKey = `${blockName}_${rowIndex}_${child.name}`;
                            const style = styles[styleKey] || styles[child.name] || {};
                            const imgWidth = style.imageWidth ? `${style.imageWidth}px` : "120px";
                            const textAlign = style.textAlign || 'center';
                            value = `<div style="text-align:${textAlign};"><img src="${value}" style="width:${imgWidth}; height:auto;" /></div>`;
                        }
                        else if (child.is_digit_split) {
                            const chars = processDigitSplit(value, child.digit_count || 8);
                            const count = child.digit_count || 8;
                            for (let i = 1; i <= count; i++) {
                                const seqRegex = new RegExp(`\\{+\\s*${child.name}_${i}\\s*\\}+`, 'gi');
                                const charVal = chars[i - 1] || '&nbsp;';
                                rowHtml = rowHtml.replace(seqRegex, charVal);
                            }
                            const baseRegex = new RegExp(`\\{+\\s*${child.name}\\s*\\}+`, 'gi');
                            rowHtml = rowHtml.replace(baseRegex, value || '');
                            return;
                        }

                        rowHtml = rowHtml.replace(childRegex, value || '');
                    });
                    
                    return rowHtml;
                }).join('');
            });
        });

        groupedPlaceholders.topLevel.forEach(placeholder => {
            const rawValue = data[placeholder.name];
            const cleanName = placeholder.name.replace(/[{}]/g, '').trim();

            if (placeholder.is_digit_split) {
                const chars = processDigitSplit(rawValue, placeholder.digit_count || 8);
                const count = placeholder.digit_count || 8;
                for (let i = 1; i <= count; i++) {
                    const seqRegex = new RegExp(`\\{+\\s*${cleanName}_${i}\\s*\\}+`, 'gi');
                    const charVal = chars[i - 1] || '&nbsp;';
                    content = content.replace(seqRegex, charVal);
                }
                const baseRegex = new RegExp(`\\{+\\s*${cleanName}\\s*\\}+`, 'gi');
                content = content.replace(baseRegex, extractDisplayValue(rawValue) || '');
                return;
            }

            let value = extractDisplayValue(rawValue);
            const regex = new RegExp(`\\{+\\s*${cleanName}\\s*\\}+`, 'gi');

            if (value) {
               
                if (placeholder.type === 'document_checklist') {
                    // Format the checklist for HTML display
                    const lines = String(value).split('\n');
                    const formattedLines = lines.map(line => {
                        // Style checked items in green, unchecked in gray
                        if (line.startsWith('☑')) {
                            return `<div style="color: #16a34a; padding: 2px 0;">✓ ${line.substring(1).trim()}</div>`;
                        } else if (line.startsWith('☐')) {
                            return `<div style="color: #9ca3af; padding: 2px 0;">☐ ${line.substring(1).trim()}</div>`;
                        } else if (line.startsWith('•')) {
                            return `<div style="padding: 2px 0;">${line}</div>`;
                        } else if (line.startsWith('|')) {
                            // Table row - will be handled by table formatting
                            return line;
                        }
                        return line;
                    });
                    // Check if it's a table format
                    if (lines.some(line => line.startsWith('|'))) {
                        // Convert markdown table to HTML
                        const tableHtml = `
                            <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
                                ${formattedLines.map(line => {
                                    if (!line.startsWith('|')) return '';
                                    const cells = line.split('|').filter(Boolean);
                                    const isHeader = line.includes('Status') && line.includes('Document');
                                    const tag = isHeader ? 'th' : 'td';
                                    return `<tr>
                                        ${cells.map(cell => `<${tag} style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">${cell.trim()}</${tag}>`).join('')}
                                    </tr>`;
                                }).join('')}
                            </table>
                        `;
                        content = content.replace(regex, tableHtml);
                    } else {
                        content = content.replace(regex, `<div style="padding: 5px 0;">${formattedLines.join('')}</div>`);
                    }
                }
                else if (placeholder.type === 'image' && value.startsWith('http')) {
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
                } else if (placeholder.type === 'boolean') {
                    const options = Array.isArray(rawValue) ? rawValue : [];

                    options.forEach(option => {
                        if (option && option.tag) {
                            const rawTag = String(option.tag).replace(/[{}]/g, '').trim();
                            const optRegex = new RegExp(`\\{+\\s*${rawTag}\\s*\\}+`, 'gi');

                            const displayLabel = extractDisplayValue([option].filter(o => o.checked));

                            if (option.checked) {
                                content = content.replace(optRegex, `<span style="color:#16a34a; font-weight:bold;">${displayLabel}</span>`);
                            } else {
                                content = content.replace(optRegex, `<span style="color:#ccc;">[ ]</span>`);
                            }
                        }
                    });

                    content = content.replace(regex, value);
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

        for (const blockName of Object.keys(groupedPlaceholders.blocks)) {
            const block = groupedPlaceholders.blocks[blockName];
            const rows = JSON.parse(JSON.stringify(data[blockName] || []));

            for (const row of rows) {
                for (const child of block.children) {
                    const displayValue = extractDisplayValue(row[child.name]);
                    row[child.name] = displayValue;

                    if (child.type === 'image' && displayValue && displayValue.startsWith('http')) {
                        const promise = fetchImageAsBase64(displayValue).then(b64 => {
                            row[child.name] = b64;
                        });
                        imagePromises.push(promise);
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
                const displayValue = extractDisplayValue(val);
                if (displayValue && displayValue.startsWith('http')) {
                    imagePromises.push(fetchImageAsBase64(displayValue).then(b64 => {
                        renderData[baseKey] = b64;
                    }));
                } else {
                    renderData[baseKey] = displayValue;
                }
            } else {
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
            
            // Ensure we have the template buffer, await if it's a promise
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
    }, [isOpen, selectedTemplate?.id]);

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
            const updates = [];

            for (const change of changedFields) {
                if (!change.targetInfo?.table || !change.targetInfo?.entityId) continue;

                const { table, path, linkingVariable, entityId } = change.targetInfo;

                if (path) {
                    const pathParts = path.replace(/'/g, '').split(/->>|->/);
                    const updatePayload = {};

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

    const generateSampleData = useCallback(() => {
        const sampleData = { ...formData };
        
        // Generate sample data for top-level fields
        groupedPlaceholders.topLevel.forEach(placeholder => {
            if (!sampleData[placeholder.name] || String(sampleData[placeholder.name]).trim() === '') {
                switch (placeholder.type) {
                    case 'text':
                        sampleData[placeholder.name] = placeholder.name.includes('email') 
                            ? 'john.doe@example.com'
                            : placeholder.name.includes('phone') 
                            ? '+1 234 567 8900'
                            : placeholder.name.includes('name')
                            ? 'John Doe'
                            : placeholder.name.includes('address')
                            ? '123 Main St, City, State 12345'
                            : `Sample ${placeholder.name}`;
                        break;
                    case 'number':
                        sampleData[placeholder.name] = Math.floor(Math.random() * 1000) + 1;
                        break;
                    case 'date':
                        const date = new Date();
                        date.setFullYear(date.getFullYear() - Math.floor(Math.random() * 10));
                        sampleData[placeholder.name] = formatDate(date, 'MM/DD/YYYY');
                        break;
                    case 'boolean':
                        sampleData[placeholder.name] = placeholder.boolean_type === 'multiple' 
                            ? [{ checked: true, label: 'Option 1' }, { checked: false, label: 'Option 2' }]
                            : [{ checked: true, label: placeholder.options?.[0] || 'Yes' }];
                        break;
                    case 'select':
                        sampleData[placeholder.name] = placeholder.options?.[0] || 'Option 1';
                        break;
                    case 'image':
                        sampleData[placeholder.name] = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
                        break;
                    case 'ordinal':
                        sampleData[placeholder.name] = '1st';
                        break;
                    default:
                        sampleData[placeholder.name] = `Sample ${placeholder.name}`;
                }
            }
        });

        // Generate sample data for block fields
        Object.keys(groupedPlaceholders.blocks).forEach(blockName => {
            const block = groupedPlaceholders.blocks[blockName];
            const existingRows = Array.isArray(sampleData[blockName]) ? sampleData[blockName] : [];
            
            // Add sample rows if block is empty
            if (existingRows.length === 0) {
                const sampleRows = [];
                for (let i = 0; i < 2; i++) { // Add 2 sample rows
                    const row = {};
                    block.children.forEach(child => {
                        switch (child.type) {
                            case 'text':
                                row[child.name] = child.name.includes('email') 
                                    ? `user${i + 1}@example.com`
                                    : child.name.includes('phone') 
                                    ? `+1 234 567 89${i}0`
                                    : child.name.includes('name')
                                    ? `User ${i + 1}`
                                    : `Sample ${child.name} ${i + 1}`;
                                break;
                            case 'number':
                                row[child.name] = Math.floor(Math.random() * 100) + 1;
                                break;
                            case 'date':
                                const date = new Date();
                                date.setFullYear(date.getFullYear() - Math.floor(Math.random() * 5));
                                row[child.name] = formatDate(date, 'MM/DD/YYYY');
                                break;
                            case 'boolean':
                                row[child.name] = child.boolean_type === 'multiple' 
                                    ? [{ checked: i === 0, label: 'Option 1' }, { checked: i === 1, label: 'Option 2' }]
                                    : [{ checked: i === 0, label: child.options?.[0] || 'Yes' }];
                                break;
                            case 'select':
                                row[child.name] = child.options?.[i % (child.options?.length || 1)] || 'Option 1';
                                break;
                            case 'ordinal':
                                row[child.name] = getOrdinalNumber(i);
                                break;
                            default:
                                row[child.name] = `Sample ${child.name} ${i + 1}`;
                        }
                    });
                    sampleRows.push(row);
                }
                sampleData[blockName] = sampleRows;
            }
        });

        setFormData(sampleData);
        toast({
            title: "AI Auto-Fill Complete",
            description: "Sample data has been populated for all empty fields",
        });
    }, [formData, groupedPlaceholders]);

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

            // Ensure we have the template buffer, await if it's a promise
            let templateBuffer = docxTemplateBuffer.current;
            if (templateBuffer && typeof templateBuffer.then === 'function') {
                templateBuffer = await templateBuffer;
            }

            if (!templateBuffer) {
                const errorMsg = 'No template buffer available for document generation';
                console.error('[generateAndDownload] Error:', errorMsg);
                toast({ title: "Error", description: errorMsg, variant: "destructive" });
                return;
            }

            // Debug: Check what we're passing to PizZip
            console.log('[generateAndDownload] templateBuffer type:', typeof templateBuffer);
            console.log('[generateAndDownload] templateBuffer is ArrayBuffer:', templateBuffer instanceof ArrayBuffer);
            console.log('[generateAndDownload] templateBuffer length:', templateBuffer?.byteLength);

            const renderData = await prepareRenderData(formData);
            
            // Pre-process all images to convert them to buffers synchronously
            const processedRenderData = JSON.parse(JSON.stringify(renderData));
            const imageCache = new Map();
            
            const processImagesRecursively = (obj, path = '') => {
                for (const [key, value] of Object.entries(obj)) {
                    if (value && typeof value === 'string' && (value.startsWith('http') || value.startsWith('data:image'))) {
                        if (!imageCache.has(value)) {
                            // Convert image to buffer synchronously (this should already be done by prepareRenderData)
                            imageCache.set(value, value);
                        }
                    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
                        processImagesRecursively(value, `${path}.${key}`);
                    } else if (Array.isArray(value)) {
                        value.forEach((item, index) => {
                            if (item && typeof item === 'object') {
                                processImagesRecursively(item, `${path}.${key}[${index}]`);
                            }
                        });
                    }
                }
            };
            processImagesRecursively(processedRenderData);

            const zip = new PizZip(templateBuffer);

            const imageModule = new ImageModule({
                centered: false,
                getImage: (tag) => {
                    if (!tag) return null;
                    try {
                        if (tag.startsWith('data:image')) {
                            const base64Data = tag.split('base64,')[1];
                            if (!base64Data) return null;
                            
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
                    const styleKeys = [name, name?.split('_').slice(2).join('_')];
                    let s = null;
                    
                    for (const key of styleKeys) {
                        if (key && imageStyles[key]) {
                            s = imageStyles[key];
                            break;
                        }
                    }
                    
                    if (!s) {
                        s = imageStyles[name] || {};
                    }
                    
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
                toast({
                    title: "Success",
                    description: `Document downloaded as ${fileName}.docx`
                });
            } else {
                const html2pdf = (await import('html2pdf.js')).default;
                const element = document.createElement('div');
                element.innerHTML = previewContent;
                element.className = EDITOR_PREVIEW_STYLES + ' p-10 bg-white';
                element.style.width = '800px';

                await html2pdf()
                    .set({
                        margin: 10,
                        filename: `${fileName}.pdf`,
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
                    .save();
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error('[generateAndDownload] Error:', e);
            toast({
                title: "Error",
                description: errorMessage,
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
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={generateSampleData}
                                    className="border-purple-200 text-purple-700 hover:bg-purple-50"
                                >
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    AI Auto-Fill
                                </Button>
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
                                        <div key={p.id} className="p-3 border rounded-lg bg-slate-50/50">
                                            <PlaceholderInput
                                                placeholder={p}
                                                value={formData[p.name]}
                                                onChange={(val) => handleInputChange(p.name, val)}
                                                onFileChange={(e) => handleFileChange(p.name, e)}
                                                imageStyles={imageStyles}
                                                onImageStyleChange={handleImageStyleChange}
                                                autoPopulated={autoPopulatedFields.get(p.name)}
                                                isArrayItem={false}
                                            />
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
);}