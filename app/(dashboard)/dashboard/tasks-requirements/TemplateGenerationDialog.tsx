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
import { AlignCenter, AlignLeft, AlignRight, Download, FileText, FileUp, Loader2, Wand2, Expand, CheckCircle2, X, Image as ImageIcon, Save, Sparkles, View, MousePointer2, Layout, Code, ChevronDown, Database, Layers, Edit3 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

// Around line 30
const EDITOR_PREVIEW_STYLES = `
  prose prose-sm sm:prose-base dark:prose-invert max-w-full focus:outline-none 
  font-serif
  [&_*]:whitespace-pre-wrap
  [&_p]:min-h-[1em]
  [&_p]:my-0 
  [&_first-child]:mt-0
  [&_last-child]:mb-0
  [&_table]:border-collapse [&_table]:border [&_table]:border-border [&_table]:w-full [&_table]:my-4
  [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:p-2 [&_th]:text-left
  [&_td]:border [&_td]:border-border [&_td]:p-2 relative
`.replace(/\s+/g, ' ').trim();
// Around line 43
const formatWhitespace = (val) => {
    if (val === null || val === undefined) return '';
    return String(val)
        // Convert 2 or more spaces to non-breaking spaces (&nbsp;)
        .replace(/  +/g, (match) => '&nbsp;'.repeat(match.length))
        // Ensure literal newlines are converted to HTML breaks
        .replace(/\n/g, '<br />');
};

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
        // If private, use Supabase to get a temporary authorized URL
        const path = url.split('/public/kyc-documents/')[1];
        const { data, error } = await supabase.storage
            .from('kyc-documents')
            .createSignedUrl(path, 60);

        const finalUrl = data?.signedUrl || url;
        const response = await fetch(finalUrl, { mode: 'cors' });
        if (!response.ok) return null;
        const blob = await response.blob();
        return await toBase64(blob);
    } catch (error) {
        return null;
    }
};

const parseJsonValue = (data, path) => {
    if (!path || !data) return '';
    try {
        let currentValue = data;
        const normalizedPath = path.replace(/->>/g, '->').replace(/'/g, '');

        const parts = normalizedPath.split(/->|\./);

        for (let i = 0; i < parts.length; i++) {
            const key = parts[i].trim();
            if (!key) continue;
            if (currentValue && currentValue.current !== undefined && key === 'current') {
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
                    if (foundKey) {
                        currentValue = currentValue[foundKey];
                    } else {
                        currentValue = undefined;
                    }
                }
            } else if (i < parts.length - 1) {
                return '';
            }
        }

        const finalValue = currentValue !== undefined && currentValue !== null ? String(currentValue) : '';
        return finalValue;
    } catch (error) {
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

const parseImageDimension = (dimension: string | undefined): number | null => {
    if (!dimension) return null;

    const cleaned = dimension.toString().trim();
    const numericValue = parseFloat(cleaned);

    if (isNaN(numericValue)) return null;

    return numericValue;
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
        document_id_field: 'document_id'
    };
    const uploads = sourceDataCache[config.table] || {};
    const documentFound = Object.values(uploads).some(upload => {
        const uploadDocId = upload[config.document_id_field];
        const uploadEntityId = upload[config.linking_variable];
        return uploadDocId === documentId && uploadEntityId === entityId;
        return String(upload[config.linking_variable]) === String(entityId);
    });
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
    if (linkedDocs.length === 0) {
        return '';
    }
    const checklist = linkedDocs.map(docId => {
        const doc = availableDocuments.find(d => d.id === docId);
        const isFound = checkDocumentStatus(
            docId,
            entityId,
            entityType,
            sourceDataCache,
            dataSourceConfig
        );

        const docName = doc?.display_name || doc?.name || 'Unknown Document';
        const symbol = isFound ? '✓' : '';

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

const getTargetEntity = (placeholder, relationshipData, arrayIndex = null, sourceArray = null, entityIdMap = null, combinedCache = null, extractedData = null, companyData = null) => {
    if (sourceArray && arrayIndex !== null && sourceArray[arrayIndex]) {
        return sourceArray[arrayIndex];
    }

    let entityType = 'company';
    if (Array.isArray(placeholder.entity_type)) {
        entityType = placeholder.entity_type[0];
    } else if (placeholder.entity_type) {
        entityType = placeholder.entity_type;
    }
    const normType = entityType?.toLowerCase()?.trim();
    if (entityIdMap) {
        if (normType === 'director' && entityIdMap.director) {
            const dirId = entityIdMap.director;
            return relationshipData?.directors?.find(d => String(d.id) === String(dirId)) ||
                combinedCache?.['registry_individuals']?.[dirId];
        }
        if (normType === 'principal' && entityIdMap.principal) {
            return relationshipData?.principal || extractedData;
        }
    }
    if (normType === 'principal') {
        return relationshipData?.principal || extractedData || personData;
    }

    if (normType === 'sponsor') {
        if (entityIdMap?.sponsor) {
            if (relationshipData?.sponsor && String(relationshipData.sponsor.id) === String(entityIdMap.sponsor)) {
                return relationshipData.sponsor;
            }
        }
        const sponsorResult = relationshipData?.sponsor || null;
        return sponsorResult;
    }

    if (['dependant', 'dependant', 'spouse', 'child'].includes(normType)) {
        if (placeholder.dependant_relationship?.[0]) {
            const targetRel = placeholder.dependant_relationship[0].toLowerCase();
            return relationshipData?.dependants?.find(d => d.relationship?.toLowerCase() === targetRel);
        }
        return relationshipData?.dependants?.[0];
    }

    if (normType === 'director') {
        const dir = placeholder.director_type === 'primary'
            ? relationshipData?.directors?.find(d => d.is_primary)
            : relationshipData?.directors?.[0];
        return dir || null;
    }

    if (normType === 'company') {
        return relationshipData?.company || companyData || extractedData;
    }

    return null;
};

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
        return {
            value: getOrdinalNumber(arrayIndex),
            source: 'Ordinal Generator'
        };
    }
};

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

const processConditionalField = (placeholder, targetEntity, combinedCache, masterFields) => {
    if (!placeholder.conditions || !targetEntity) return { value: '', source: null };

    const targetId = String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id || targetEntity.company_id);

    for (const condition of placeholder.conditions) {
        if (!condition.master_field_id) continue;

        const mf = masterFields.get(parseInt(condition.master_field_id, 10));
        if (!mf?.sources) continue;

        for (const source of mf.sources) {
            const tableData = combinedCache[source.table];
            if (!tableData) continue;

            const linkingVar = source.linking_variable || 'id';
            const record = Object.values(tableData).find(rec =>
                String(rec[linkingVar] || rec.id) === targetId
            );

            if (record) {
                let rawVal = source.path
                    ? parseJsonValue(record, source.path)
                    : record[condition.tag || mf.field_key];

                // FIX: If rawVal is an object (common in JSONB columns), try to get a string value
                if (rawVal && typeof rawVal === 'object') {
                    rawVal = rawVal.number || rawVal.value || rawVal.name || JSON.stringify(rawVal);
                }

                if (rawVal && String(rawVal).trim() !== '' && String(rawVal) !== '[object Object]') {
                    return {
                        value: `${condition.label || ''}${rawVal}`,
                        source: `Conditional: ${mf.label || source.table}`
                    };
                }
            }
        }
    }
    return { value: '', source: null };
};

const processBooleanField = (placeholder, targetEntity, combinedCache, masterFields, task) => {
    if (!placeholder.boolean_conditions) return { value: [], source: null };

    const targetId = targetEntity ? String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id || targetEntity.company_id) : null;
    const taskRecord = (combinedCache?.['tm_tasks'] && Object.values(combinedCache['tm_tasks'])[0]) || task;
    const jobAnswers = taskRecord?.job_specific_answers || {};

    const results = placeholder.boolean_conditions.map(condition => {
        let isChecked = false;

        // 1. Job Questions (Keep existing)
        const qId = condition.linked_job_question_id || placeholder.linked_job_question_id;
        if (qId && jobAnswers[qId]) {
            const actualAnswer = String(jobAnswers[qId]).trim().toLowerCase();
            const targetValue = String(condition.comparison?.value || '').trim().toLowerCase();
            if (condition.comparison?.operator === 'equals') isChecked = actualAnswer === targetValue;
            else if (condition.comparison?.operator === 'contains') isChecked = actualAnswer.includes(targetValue);
        }
        // 2. Master Field Logic
        else if (condition.master_field_id && targetId) {
            const mf = masterFields.get(parseInt(condition.master_field_id, 10));
            if (mf?.sources) {
                for (const source of mf.sources) {
                    const tableData = combinedCache[source.table];
                    if (!tableData) continue;

                    // Improved record lookup
                    const record = Object.values(tableData).find(r =>
                        String(r[source.linking_variable || 'id']) === targetId ||
                        String(r.id) === targetId ||
                        String(r.individual_id) === targetId
                    );

                    if (record) {
                        const fieldValue = source.path
                            ? parseJsonValue(record, source.path)
                            : record[condition.comparison?.field || mf.field_key || condition.tag];

                        if (fieldValue !== undefined && fieldValue !== null) {
                            if (condition.comparison) {
                                const { operator, value } = condition.comparison;
                                const strFieldValue = String(fieldValue).trim().toLowerCase();
                                const compareValue = String(value || '').trim().toLowerCase();

                                switch (operator) {
                                    case 'equals': isChecked = strFieldValue === compareValue; break;
                                    case 'not_equals': isChecked = strFieldValue !== compareValue; break;
                                    case 'contains': isChecked = strFieldValue.includes(compareValue); break;
                                    default: isChecked = Boolean(fieldValue);
                                }
                            } else {
                                isChecked = Boolean(fieldValue);
                            }
                        }
                        if (isChecked) break;
                    }
                }
            }
        }

        return {
            ...condition,
            checked: isChecked,
            hasDbLink: !!(qId || condition.master_field_id)
        };
    });

    return {
        value: results,
        source: results.some(r => r.checked) ? 'Logic Resolved' : null
    };
};

const processImageField = (placeholder, targetEntity, combinedCache, masterFields) => {
    if (!placeholder.master_field_ids?.length) {
        return { value: '', source: null };
    }

    const searchId = String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id);
    for (const id of placeholder.master_field_ids) {
        const mf = masterFields.get(parseInt(id, 10));
        if (!mf?.sources) {
            continue;
        }

        for (const source of mf.sources) {
            const tableData = combinedCache[source.table];

            if (!tableData) {
                continue;
            }

            const linkingVar = source.linking_variable || 'id';
            const reqDocIds = Array.isArray(source.document_id)
                ? source.document_id
                : [source.document_id];

            const match = Object.values(tableData).find(d => {
                const docIdMatch = reqDocIds.includes(d.document_id || d.document_id);
                const entityIdMatch = String(d[linkingVar] || d.id) === searchId;
                return docIdMatch && entityIdMatch;
            });
            if (match?.file_path) {
                const imageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${match.file_path}`;
                return {
                    value: imageUrl,
                    source: 'Image Cache'
                };
            }
        }
    }
    return { value: '', source: null };
};


const processTextField = (placeholder, targetEntity, combinedCache, masterFields, computedFieldCache) => {
    if (!placeholder.master_field_ids?.length) {
        return { value: '', source: null };
    }

    const searchId = String(
        targetEntity.id || targetEntity.director_id ||
        targetEntity.individual_id || targetEntity.company_id
    );

    const allValues = [];
    const allSources = [];

    for (const id of placeholder.master_field_ids) {
        const mf = masterFields.get(parseInt(id, 10));
        if (!mf?.sources) continue;

        // Sort sources by priority
        const sortedSources = [...mf.sources].sort((a, b) => (a.priority || 999) - (b.priority || 999));

        for (const source of sortedSources) {
            // ── COMPUTED SOURCE HANDLING (NEW) ──
            if (source.is_computed) {
                const extractionMode = 'latest';
                const cacheKey = `${mf.id}_${searchId}_${extractionMode}`;

                if (!computedFieldCache) continue;
                const computedVal = computedFieldCache[cacheKey];

                if (computedVal === undefined) {
                    // Still loading — skip this source and try next
                    continue;
                }

                // Validate computed value (mirror AutomationMappingDialog logic)
                const errorStrings = [
                    'Document Not Found', 'Missing Document', 'No Document Specified',
                    'Field Not Found', 'Number Not Found', 'Missing', 'No Source', null, undefined, ''
                ];

                if (!errorStrings.includes(computedVal) && computedVal !== null) {
                    let finalVal = computedVal;

                    // Handle object results — extract the relevant sub-field if path indicates one
                    if (typeof computedVal === 'object' && computedVal !== null && source.path) {
                        const pathMatch = source.path.match(/['"]([\w_]+)['"]$/);
                        const fieldName = pathMatch ? pathMatch[1] : null;
                        if (fieldName && computedVal[fieldName]) {
                            finalVal = String(computedVal[fieldName]);
                        } else if (typeof computedVal === 'object') {
                            finalVal = computedVal.en || computedVal.name || computedVal.title ||
                                String(Object.values(computedVal)[0] || '');
                        }
                    }

                    if (finalVal && String(finalVal).trim() !== '') {
                        allValues.push(String(finalVal));
                        allSources.push(`Computed: ${mf.label || source.table}`);
                        break; // Found a valid computed value for this master field, move on
                    }
                }

                // Computed returned an error — fall through to next source
                continue;
            }

            // ── STANDARD DB SOURCE HANDLING (EXISTING) ──
            const tableData = combinedCache[source.table];
            if (!tableData) continue;

            const linkingVar = source.linking_variable || 'id';
            const record = Object.values(tableData).find(r => {
                const recordId = String(r[linkingVar] || r.id);
                return recordId === searchId;
            });

            if (record) {
                const val = source.path
                    ? parseJsonValue(record, source.path)
                    : (record[mf.field_key] || record[placeholder.name]);

                if (val && String(val).trim() !== '') {
                    allValues.push(val);
                    allSources.push(`DB: ${source.table}`);
                    break; // Found value from this master field, move on
                }
            }
        }
    }

    if (allValues.length > 0) {
        return {
            value: allValues.join(' '),
            source: allSources[0]
        };
    }

    return { value: '', source: null };
};

const isValidValue = (val: any, placeholderType?: string): boolean => {
    if (val === null || val === undefined) return false;

    // FIX: For booleans, an array of options is only valid if one is checked
    if (placeholderType === 'boolean' && Array.isArray(val)) {
        return val.some(opt => opt && opt.checked === true);
    }

    if (Array.isArray(val)) {
        return val.length > 0;
    }
    if (typeof val === 'string') {
        if (val === '') return false;
        const errorStrings = ['Missing', 'Missing Config', 'No Source', 'Computing...', 'Document Not Found', 'Field Not Found'];
        return !errorStrings.includes(val);
    }
    return Boolean(val);
};

const processPlaceholderValue = (placeholder, relationshipData, combinedCache, masterFields, entityIdMap = null, extractedData, companyData, arrayIndex = null, sourceArray = null, task = null, computedFieldCache = null) => {
    const logic = placeholder.source_logic || 'priority';
    const collectedValues: string[] = [];
    const sourceMetadata: string[] = [];
    const targetEntity = getTargetEntity(placeholder, relationshipData, arrayIndex, sourceArray, entityIdMap, combinedCache, extractedData, companyData);
    const targetId = targetEntity ? String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id || targetEntity.company_id) : null;
    console.group(`[FIELD PROCESS] ${placeholder.name}`);
    console.log("Target Entity ID:", targetId);
    console.log("Master Fields Linked:", placeholder.master_field_ids);
    if (placeholder.master_field_ids?.length > 0 && targetEntity) {
        for (const mid of placeholder.master_field_ids) {
            let result = { value: '', source: null };
            const mf = masterFields.get(parseInt(mid, 10));
            if (mf?.date_config?.useCurrentDate) {
                result = processCurrentDateField({ ...placeholder, master_field_ids: [mid] }, masterFields);
            } else {
                if (placeholder.type === 'ordinal') {
                    result = processOrdinalField(placeholder, arrayIndex);
                } else if (placeholder.type === 'image') {
                    result = processImageField({ ...placeholder, master_field_ids: [mid] }, targetEntity, combinedCache, masterFields);
                } else if (placeholder.type === 'boolean') {
                    result = processBooleanField({ ...placeholder, master_field_ids: [mid] }, targetEntity, combinedCache, masterFields);
                } else {
                    result = processTextField({ ...placeholder, master_field_ids: [mid] }, targetEntity, combinedCache, masterFields, computedFieldCache);
                }
            }
            if (isValidValue(result.value, placeholder.type)) {
                console.log(`✅ Found Value: "${result.value}" from Source: ${result.source}`);
                if (logic === 'priority') {
                    console.groupEnd();
                    return result;
                }
                collectedValues.push(String(result.value));
                sourceMetadata.push(result.source || 'DB');
            }
        }
    }
    if (placeholder.type === 'boolean' && placeholder.boolean_conditions?.length > 0 && targetEntity) {
        const result = processBooleanField(placeholder, targetEntity, combinedCache, masterFields, task);
        if (isValidValue(result.value, placeholder.type)) {
            const matchedLabel = result.value.find(v => v.checked)?.label;
            console.log(`✅ Found Boolean Match: "${matchedLabel}"`);
            if (logic === 'priority') { console.groupEnd(); return result; }
            collectedValues.push(result.value);
            sourceMetadata.push(result.source || 'Boolean (DB)');
        } else {
            console.log(`❌ No Boolean Match found for ${placeholder.name}`);
        }
    }

    // 3. ADDED: Handle Conditional logic (e.g. sponsor_r_number)
    if (placeholder.type === 'conditional' && placeholder.conditions?.length > 0 && targetEntity) {
        const result = processConditionalField(placeholder, targetEntity, combinedCache, masterFields);
        if (isValidValue(result.value)) {
            console.log(`✅ Found Conditional Match: "${result.value}"`);
            if (logic === 'priority') { console.groupEnd(); return result; }
            collectedValues.push(String(result.value));
            sourceMetadata.push(result.source || 'Conditional (DB)');
        }
    }

    const qIds = placeholder.linked_job_question_ids || (placeholder.linked_job_question_id ? [placeholder.linked_job_question_id] : []);
    if (qIds.length > 0) {
        const taskRecord = (combinedCache?.['tm_tasks'] && Object.values(combinedCache['tm_tasks'])[0]) || task;
        const answers = taskRecord?.job_specific_answers || {};

        for (const qId of qIds) {
            const answer = answers[String(qId)] ?? answers[Number(qId)];
            if (isValidValue(answer)) {
                if (logic === 'priority') return { value: String(answer), source: 'Job Question' };
                collectedValues.push(String(answer));
                sourceMetadata.push('Job Question');
            }
        }
    }
    const reqIds = placeholder.linked_requirement_ids || [];
    if (reqIds.length > 0 && targetId) {
        for (const rId of reqIds) {
            const isFound = checkDocumentStatus(rId, targetId, placeholder.entity_type?.[0] || 'company', combinedCache);
            if (isFound) {
                const val = "✓ Submitted";
                if (logic === 'priority') return { value: val, source: 'Requirement' };
                collectedValues.push(val);
                sourceMetadata.push('Requirement');
            }
        }
    }
    if (logic === 'all' && collectedValues.length > 0) {
        const finalResult = {
            value: collectedValues.join(' '),
            source: `Merged (${sourceMetadata[0]})`
        };
        return finalResult;
    }
    if (placeholder.default_value) {
        const defaultResult = { value: placeholder.default_value, source: 'Default' };
        return defaultResult;
    }

    const emptyResult = { value: '', source: null };
    return emptyResult;
};

const extractDisplayValue = (value) => {
    if (value === null || value === undefined) return '';

    if (Array.isArray(value)) {
        // If it's a list of condition objects (like prefix/possessive)
        const checkedItems = value.filter(opt => opt && opt.checked);

        if (checkedItems.length > 0) {
            return checkedItems.map(opt => {
                // Return label ("Mr") or the tag or the raw value
                return opt.label || opt.tag || opt.value || '';
            }).join(', ');
        }
        return '';
    }

    if (typeof value === 'object') {
        return value.value !== undefined ? String(value.value) : '';
    }

    return String(value);
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

const getDisplayLabel = (value, options) => {
    if (!options || !Array.isArray(options)) return value;
    const option = options.find(o =>
        String(o.value) === String(value) ||
        o.label === value ||
        o.value === value
    );
    return option ? option.label : value;
};

const PlaceholderInput = ({
    resolveSourceValue, placeholder, value, originalValue, onChange, onSaveToDb, isSaving, onFileChange, imageStyles, onImageStyleChange, autoPopulated, isArrayItem = false, arrayIndex = null, blockName = null, onAIRefine, isAIRefining, resolvedOptions = [], masterFields, showLabel = true
}) => {
    const fieldKey = isArrayItem ? `${blockName}_${arrayIndex}_${placeholder.name}` : placeholder.name;

    // tracks which specific source (Table/ID) is being edited inline
    const [editingSource, setEditingSource] = useState(null);
    const [editValue, setEditValue] = useState("");
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const hasChanged = JSON.stringify(value) !== JSON.stringify(originalValue);
    const canSave = (placeholder.master_field_ids?.length > 0) || (placeholder.linked_job_question_ids?.length > 0);

    const mIds = placeholder.master_field_ids || [];
    const qIds = placeholder.linked_job_question_ids || (placeholder.linked_job_question_id ? [placeholder.linked_job_question_id] : []);
    const totalSources = mIds.length + qIds.length;

    const options = resolvedOptions.length > 0
        ? resolvedOptions
        : (placeholder.options || []).map(o => typeof o === 'string' ? { label: o, value: o } : o);

    const handleStartEdit = (val, type, id, label) => {
        setEditValue(val || '');
        setEditingSource({ type, id, label });
        setIsPopoverOpen(false);
    };

    const handleCancelEdit = () => {
        setEditingSource(null);
        setEditValue("");
    };

    const handleSaveEdit = async () => {
        await onSaveToDb(placeholder, editValue, editingSource, arrayIndex);
        setEditingSource(null);
    };
    const inputRef = useRef(null);

    // --- STATE A: INLINE EDITING MODE (Triggered by Pencil) ---
    if (editingSource) {
        return (
            <div className="space-y-1 animate-in fade-in zoom-in-95 duration-200">
                {showLabel && (
                    <Label className="text-[10px] font-bold text-blue-600 uppercase tracking-tight flex items-center gap-1">
                        <Edit3 className="h-2.5 w-2.5" /> Editing {editingSource.label}
                    </Label>
                )}
                <div className="flex items-center gap-2">
                    <Input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit();
                            if (e.key === 'Escape') handleCancelEdit();
                        }}
                        className="h-8 text-xs border-blue-400 ring-2 ring-blue-50"
                    />
                    <Button size="icon" onClick={handleSaveEdit} className="h-8 w-8 bg-green-600 hover:bg-green-700 shrink-0">
                        <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={handleCancelEdit} className="h-8 w-8 text-red-500 shrink-0">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        );
    }

    // --- STATE B: MULTI-SOURCE VIEW (Popover) ---
    if (totalSources > 1 && placeholder.type !== 'image' && placeholder.type !== 'boolean') {
        return (
            <div className="space-y-1">
                {showLabel && <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{placeholder.display_value || placeholder.name.replace(/_/g, ' ')}</Label>}
                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                    <PopoverTrigger asChild>
                        <div className={cn(
                            "text-xs h-8 flex items-center px-2 rounded cursor-pointer border border-dashed border-blue-200 bg-blue-50/20 hover:bg-blue-50 transition-colors",
                            !isValidValue(value) ? "text-red-500 italic" : "text-slate-900 font-medium"
                        )}>
                            <span className="truncate flex-1">{isValidValue(value) ? value : 'Missing'}</span>
                            <div className="flex items-center gap-1.5 ml-2">
                                <Badge variant="outline" className="text-[8px] h-4 px-1 uppercase bg-white border-blue-200 text-blue-600 font-bold">
                                    {placeholder.source_logic || 'priority'}
                                </Badge>
                                <ChevronDown className="h-3 w-3 text-blue-400 shrink-0" />
                            </div>
                        </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0 shadow-xl border-blue-100" align="end">
                        <div className="p-2 bg-slate-50 border-b flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Select Source to Edit</span>
                            <Layers className="h-3 w-3 text-slate-400" />
                        </div>

                        <div className="p-1 space-y-1 max-h-[300px] overflow-y-auto bg-white">
                            {mIds.map((mid, idx) => {
                                const mf = masterFields?.get ? masterFields.get(parseInt(mid)) : null;
                                const sourceValue = resolveSourceValue ? resolveSourceValue('db', mid, placeholder, arrayIndex) : '';
                                return (
                                    <div key={`m-${mid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 group transition-all">
                                        <div className="flex flex-col min-w-0 pr-2">
                                            <span className="text-[9px] font-bold text-blue-600 flex items-center gap-1 uppercase">
                                                <Database className="h-2.5 w-2.5" /> DB FIELD {idx + 1}
                                            </span>
                                            <span className="text-xs font-medium truncate text-slate-700 mt-0.5">{mf?.label || `Field #${mid}`}</span>
                                            <span className="text-[10px] text-slate-400 italic truncate">{isValidValue(sourceValue) ? sourceValue : 'Empty'}</span>
                                        </div>
                                        <Button
                                            size="sm" variant="ghost"
                                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => handleStartEdit(sourceValue, 'db', mid, mf?.label || `Field #${mid}`)}
                                        >
                                            <Edit3 className="h-4 w-4 text-blue-500" />
                                        </Button>
                                    </div>
                                );
                            })}

                            {qIds.map((qid, idx) => {
                                const sourceValue = resolveSourceValue ? resolveSourceValue('job', qid, placeholder, arrayIndex) : '';
                                return (
                                    <div key={`q-${qid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 group transition-all">
                                        <div className="flex flex-col min-w-0 pr-2">
                                            <span className="text-[9px] font-bold text-purple-600 flex items-center gap-1 uppercase">
                                                <HelpCircle className="h-2.5 w-2.5" /> QUESTION
                                            </span>
                                            <span className="text-xs font-medium truncate text-slate-700 mt-0.5">ID: {qid}</span>
                                            <span className="text-[10px] text-slate-400 italic truncate">{isValidValue(sourceValue) ? sourceValue : 'Empty'}</span>
                                        </div>
                                        <Button
                                            size="sm" variant="ghost"
                                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => handleStartEdit(sourceValue, 'job', qid, `Question ${qid}`)}
                                        >
                                            <Edit3 className="h-4 w-4 text-purple-500" />
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        );
    }

    // --- STATE C: SINGLE SOURCE VIEW (Direct Input) ---
    const FieldHeader = () => {
        const hasDefault = placeholder.default_value && placeholder.default_value.trim() !== '';
        return (
            <div className="flex items-center justify-between mb-1.5">
                {showLabel && (
                    <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                        {placeholder.display_value || placeholder.name.replace(/_/g, ' ')}
                    </Label>
                )}
                <div className="flex items-center gap-2 ml-auto">
                    {canSave && hasChanged && (
                        <Button
                            size="sm" variant="ghost"
                            className="h-6 px-2 text-green-600 hover:text-green-700 hover:bg-green-50 border border-green-200"
                            onClick={() => onSaveToDb(placeholder, value, null, arrayIndex)}
                            disabled={isSaving}
                        >
                            <Save className="h-3 w-3 mr-1" />
                            <span className="text-[9px] font-bold">SAVE TO PROFILE</span>
                        </Button>
                    )}
                </div>
            </div>
        );
    };

    if (placeholder.is_digit_split) {
        const chars = processDigitSplit(value || '', placeholder.digit_count || 8);
        return (
            <div className="">
                <FieldHeader />
                <div className={cn("flex flex-wrap gap-1 p-1 rounded", hasChanged && canSave ? "bg-amber-50 border border-amber-200" : "")}>
                    {Array.from({ length: placeholder.digit_count || 8 }).map((_, idx) => (
                        <input key={idx} maxLength={1} value={chars[idx] || ''} onChange={(e) => {
                            const char = e.target.value.slice(-1);
                            let str = (value || '').padEnd(placeholder.digit_count, ' ');
                            const newStr = str.substring(0, idx) + char + str.substring(idx + 1);
                            onChange(newStr.trimEnd());
                        }} className="w-7 h-8 text-center border rounded font-mono font-bold text-sm bg-white" />
                    ))}
                </div>
            </div>
        );
    }

    if (placeholder.type === 'image') {
        const style = imageStyles[fieldKey] || {};
        return (
            <div className="">
                <FieldHeader />
                {value ? (
                    <div className={cn("relative border rounded overflow-hidden aspect-video flex items-center justify-center bg-white", hasChanged && canSave ? "border-amber-400" : "")}>
                        <img src={value} className="max-h-full object-contain" style={{ textAlign: style.textAlign || 'center', maxWidth: style.maxWidth || '100%' }} />
                        <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <Button size="sm" variant="secondary" className="h-7 text-[10px]" onClick={() => document.getElementById(`file-${fieldKey}`).click()}>Replace</Button>
                            <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => onChange('')}>Remove</Button>
                        </div>
                    </div>
                ) : <div className="text-xs italic border-2 border-dashed rounded p-4 text-center">Upload {placeholder.display_value || placeholder.name}</div>}
                <input id={`file-${fieldKey}`} type="file" className="hidden" accept="image/*" onChange={onFileChange} />
                {value && onImageStyleChange && (
                    <ImagePlaceholderControls
                        styles={style}
                        onStyleChange={(key, val) => onImageStyleChange(fieldKey, key, val)}
                    />
                )}
            </div>
        );
    }

    if (placeholder.type === 'boolean') {
        const opts = Array.isArray(value) ? value : (placeholder.boolean_conditions || []);
        return (
            <div className="">
                <FieldHeader />
                <div className={cn("space-y-2 p-2 rounded border", hasChanged && canSave ? "bg-amber-50 border-amber-300" : "bg-slate-50")}>
                    {opts.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 border rounded bg-white shadow-sm">
                            <Checkbox checked={opt.checked || false} disabled={opt.hasDbLink} onCheckedChange={(checked) => {
                                const newOpts = [...opts];
                                if (placeholder.boolean_type === 'single') {
                                    newOpts.forEach((o, i) => { if (!o.hasDbLink) o.checked = i === idx ? checked : false; });
                                } else { if (!newOpts[idx].hasDbLink) newOpts[idx].checked = checked; }
                                onChange(newOpts);
                            }} />
                            <Label className="text-xs flex-1">
                                {opt.label && opt.label !== '✔' ? opt.label :
                                    opt.comparison?.value ? opt.comparison.value :
                                        opt.tag ? opt.tag.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) :
                                            'Option'}
                            </Label>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (placeholder.type === 'select' || resolvedOptions.length > 0) {
        return (
            <div className="">
                <FieldHeader />
                <Select value={String(value || '')} onValueChange={(val) => {
                    const selected = options.find(o => String(o.value) === val);
                    onChange(selected ? selected.label : val);
                }}>
                    <SelectTrigger className={cn("w-full bg-white h-8 text-xs", hasChanged && canSave ? "border-amber-400 ring-2 ring-amber-50" : "")}>
                        <SelectValue>{getDisplayLabel(value, options)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((o, i) => <SelectItem key={i} value={String(o.value)}>{o.label}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
        );
    }

    return (
        <div className="">
            <FieldHeader />
            <div className="relative">
                <Input
                    ref={inputRef}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    className={cn("bg-white h-8 text-xs transition-all pr-8", hasChanged && canSave ? "border-amber-400 ring-2 ring-amber-50" : "focus:border-blue-400")}
                />
                {hasChanged && canSave && <div className="absolute right-2.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />}
            </div>
        </div>
    );
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
    const isWordTemplate = selectedTemplate?.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const [loadedDraft, setLoadedDraft] = useState(null);
    const [isLoadingDraft, setIsLoadingDraft] = useState(false);
    const [dataConflicts, setDataConflicts] = useState([]);
    const [showConflictBanner, setShowConflictBanner] = useState(false);
    const togglePanel = (panel) => setPanelsVisible(prev => ({ ...prev, [panel]: !prev[panel] }));
    const [requirementJobQuestions, setRequirementJobQuestions] = useState<any[]>([]);
    const [computedFieldCache, setComputedFieldCache] = useState<Record<string, any>>({});

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
                            task,
                            null,
                            null,
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
                task,
                null,
                null,
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

        const allIds = new Set();

        // --- FIX START: robustly collect all entity IDs ---
        // 1. Core Map IDs
        if (entityIdMap.company) allIds.add(String(entityIdMap.company));
        if (entityIdMap.principal) allIds.add(String(entityIdMap.principal));
        if (entityIdMap.sponsor) allIds.add(String(entityIdMap.sponsor));

        // 2. Arrays from Entity Map
        const dirIds = Array.isArray(entityIdMap.directors) ? entityIdMap.directors : (entityIdMap.director ? [entityIdMap.director] : []);
        dirIds.forEach(id => id && allIds.add(String(id)));

        const depIds = Array.isArray(entityIdMap.dependants) ? entityIdMap.dependants : [];
        depIds.forEach(id => id && allIds.add(String(id)));

        // 3. Objects from Relationship Data (fallback if not in Map)
        relationshipData?.directors?.forEach(d => (d.id || d.director_id) && allIds.add(String(d.id || d.director_id)));
        relationshipData?.dependants?.forEach(d => {
            // Handle both object {id: 1} and raw ID 1
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

        const tableConfigs = new Map();
        selectedTemplate.placeholders?.forEach(p => {
            // --- UPDATED: Collect IDs from all possible locations ---
            const allLinkedMasterIds = new Set([
                ...(p.master_field_ids || []),
                ...(p.conditions?.map(c => c.master_field_id).filter(Boolean) || []),
                ...(p.boolean_conditions?.map(c => c.master_field_id).filter(Boolean) || [])
            ]);

            allLinkedMasterIds.forEach(mId => {
                const masterField = masterFields.get(parseInt(mId));
                masterField?.sources?.forEach(source => {
                    if (!source.table) return;
                    if (!tableConfigs.has(source.table)) {
                        tableConfigs.set(source.table, { linkingVars: new Set() });
                    }
                    const config = tableConfigs.get(source.table);
                    config.linkingVars.add(source.linking_variable || 'id');
                });
            });
        });

        const tablesToFetch = Array.from(tableConfigs.keys());
        setFetchingTables(prev => new Set([...prev, ...tablesToFetch]));

        try {
            const fetchPromises = Array.from(tableConfigs.entries()).map(async ([table, config]) => {
                try {
                    const linkingVars = Array.from(config.linkingVars);
                    let query = supabase.from(table).select('*');

                    if (linkingVars.length === 1) {
                        query = query.in(linkingVars[0], idList);
                    } else {
                        const orConditions = linkingVars.map(linkVar => `${linkVar}.in.(${idList.join(',')})`).join(',');
                        query = query.or(orConditions);
                    }

                    const { data, error } = await query;
                    if (error) throw error;

                    const tableCache = {};
                    data?.forEach(row => {
                        const primaryId = String(row.id || row.director_id || row.individual_id || row.company_id);
                        if (primaryId && primaryId !== 'undefined') tableCache[primaryId] = row;
                        linkingVars.forEach(v => { if (row[v]) tableCache[String(row[v])] = row; });
                    });
                    return { table, cache: tableCache };
                } catch (err) {
                    console.error(`❌ Error fetching ${table}:`, err);
                    return { table, cache: null };
                }
            });

            const results = await Promise.all(fetchPromises);
            const newCacheEntries = {};
            const successfulTables = [];
            const failedTables = [];

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
                        variant: "default"
                    });
                }
            }

            if (failedTables.length > 0) {
                toast({
                    title: "Partial Data Load",
                    description: `Failed to load data from ${failedTables.length} table(s)`,
                    variant: "warning"
                });
            }
        } catch (error) {
            toast({
                title: "Data Load Failed",
                description: "Could not fetch additional data sources",
                variant: "destructive"
            });
        } finally {
            setFetchingTables(prev => {
                const newSet = new Set(prev);
                tablesToFetch.forEach(table => newSet.delete(table));
                return newSet;
            });
        }
    }, [isOpen, selectedTemplate?.id, entityIdMap, relationshipData, masterFields]);

    const resolveComputedFields = useCallback(async (updatedCache: Record<string, any>) => {
        if (!selectedTemplate?.placeholders || !masterFields) return;

        // 1. Collect all entity IDs we need to resolve for
        const allEntityIds = new Set<string>();

        if (entityIdMap?.company) allEntityIds.add(String(entityIdMap.company));
        if (entityIdMap?.principal) allEntityIds.add(String(entityIdMap.principal));
        if (entityIdMap?.sponsor) allEntityIds.add(String(entityIdMap.sponsor));

        const dirIds = Array.isArray(entityIdMap?.directors) ? entityIdMap.directors : (entityIdMap?.director ? [entityIdMap.director] : []);
        dirIds.forEach(id => id && allEntityIds.add(String(id)));

        relationshipData?.directors?.forEach(d => {
            const id = d.id || d.director_id;
            if (id) allEntityIds.add(String(id));
        });
        relationshipData?.dependants?.forEach(d => {
            const id = typeof d === 'object' ? (d.id || d.individual_id) : d;
            if (id) allEntityIds.add(String(id));
        });
        if (relationshipData?.principal) {
            const p = relationshipData.principal;
            const pid = typeof p === 'object' ? (p.id || p.individual_id) : p;
            if (pid) allEntityIds.add(String(pid));
        }
        if (relationshipData?.sponsor) {
            const s = relationshipData.sponsor;
            const sid = typeof s === 'object' ? (s.id || s.individual_id) : s;
            if (sid) allEntityIds.add(String(sid));
        }

        // 2. Find all master fields that have is_computed sources
        const computedJobs: Array<{
            fieldId: number;
            entityId: string;
            extractionMode: string;
            computedSource: any;
            cacheKey: string;
        }> = [];

        const allLinkedMasterIds = new Set<number>();
        selectedTemplate.placeholders.forEach(p => {
            (p.master_field_ids || []).forEach(id => allLinkedMasterIds.add(parseInt(id)));
        });

        // Build a document cache for computed functions
        // Collect all document IDs we need from computed sources
        const neededDocumentIds = new Set<string>();
        const neededEntityIds = new Set<string>();

        allLinkedMasterIds.forEach(mfId => {
            const mf = masterFields.get(mfId);
            if (!mf?.sources) return;

            mf.sources.forEach(source => {
                if (!source.is_computed) return;
                const docIds = Array.isArray(source.document_id) ? source.document_id : (source.document_id ? [source.document_id] : []);
                docIds.forEach(id => neededDocumentIds.add(id));
                allEntityIds.forEach(eid => neededEntityIds.add(eid));
            });
        });

        if (neededDocumentIds.size === 0) return; // No computed fields to resolve

        // 3. Fetch documents needed for computed fields
        let documentCache = { documents: [], docTypes: [] };
        try {
            const [docsResult, docTypesResult] = await Promise.all([
                supabase
                    .from('acc_portal_directors_documents')
                    .select('*')
                    .in('director_id', Array.from(neededEntityIds))
                    .in('document_id', Array.from(neededDocumentIds))
                    .neq('status', 'deleted'),
                supabase
                    .from('acc_portal_kyc')
                    .select('*')
                    .in('id', Array.from(neededDocumentIds))
            ]);

            documentCache = {
                documents: docsResult.data || [],
                docTypes: docTypesResult.data || []
            };
        } catch (err) {
            console.error('[resolveComputedFields] Failed to fetch documents:', err);
            return;
        }

        // 4. Build compute jobs for each master field × entity combination
        allLinkedMasterIds.forEach(mfId => {
            const mf = masterFields.get(mfId);
            if (!mf?.sources) return;

            mf.sources.forEach(source => {
                if (!source.is_computed) return;

                allEntityIds.forEach(entityId => {
                    const extractionMode = 'latest'; // Default, can be extended
                    const cacheKey = `${mfId}_${entityId}_${extractionMode}`;

                    computedJobs.push({
                        fieldId: mfId,
                        entityId,
                        extractionMode,
                        computedSource: source,
                        cacheKey
                    });
                }); 
            });
        });

        if (computedJobs.length === 0) return;

        // 5. Execute all computed fields
        const newComputedCache: Record<string, any> = {};

        await Promise.all(
            computedJobs.map(async ({ fieldId, entityId, extractionMode, computedSource, cacheKey }) => {
                try {
                    let functionToCall = computedSource.computed_function || 'extractFieldFromLatestDocument';
                    // Normalize function name (same logic as AutomationMappingDialog)
                    if (functionToCall === 'getLatestDocument' && computedSource.path) {
                        functionToCall = 'extractFieldFromLatestDocument';
                    }

                    const val = await executeComputedField(
                        functionToCall,
                        entityId,
                        computedSource.document_id || [],
                        computedSource.path,
                        extractionMode,
                        documentCache,
                        computedSource.computed_config
                    );

                    newComputedCache[cacheKey] = val;
                } catch (err) {
                    console.warn(`[resolveComputedFields] Failed for key ${cacheKey}:`, err);
                    newComputedCache[cacheKey] = null;
                }
            })
        );

        setComputedFieldCache(prev => ({ ...prev, ...newComputedCache }));
    }, [selectedTemplate, masterFields, entityIdMap, relationshipData]);

    useEffect(() => {
        if (isOpen && selectedTemplate?.id) {
            fetchMissingDataSources().then(() => {
                // After DB data is loaded, resolve computed fields
                resolveComputedFields(combinedCache);
            });
        }
    }, [isOpen, selectedTemplate?.id, fetchMissingDataSources]);

    useEffect(() => {
        if (isOpen && selectedTemplate?.id && masterFields && Object.keys(combinedCache).length > 0) {
            resolveComputedFields(combinedCache);
        }
    }, [isOpen, selectedTemplate?.id, Object.keys(combinedCache).length]);

    useEffect(() => {
        if (!isOpen || !selectedTemplate) return;
        if (loadedDraft && Object.keys(formData).length > 0) return;
        if (fetchingTables.size > 0) {
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
                    companyData
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
                const match = processPlaceholderValue(p, relationshipData, combinedCache, masterFields, entityIdMap, extractedData, companyData, task);
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
    }, [isOpen, selectedTemplate?.id, combinedCache, loadedDraft, fetchingTables, task, computedFieldCache]);

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

    const resolveArrayData = useCallback((blockPlaceholder, allPlaceholders, combinedCache, masterFields, entityIdMap, relationshipData, extractedData, companyData) => {
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
                    task
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

    const extractHeadersFooters = async (templateBuffer) => {
        const zip = new PizZip(templateBuffer);
        const headers = [];
        const footers = [];
        for (let i = 1; i <= 3; i++) {
            const headerFile = zip.file(`word/header${i}.xml`);
            if (headerFile) {
                const headerXml = headerFile.asText();
                headers.push({
                    index: i,
                    xml: headerXml,
                    html: await convertWordXmlToHtml(headerXml)
                });
            }
        }
        for (let i = 1; i <= 3; i++) {
            const footerFile = zip.file(`word/footer${i}.xml`);
            if (footerFile) {
                const footerXml = footerFile.asText();
                footers.push({
                    index: i,
                    xml: footerXml,
                    html: await convertWordXmlToHtml(footerXml)
                });
            }
        }

        return { headers, footers };
    };

    const convertWordXmlToHtml = async (xml) => {
        const tempZip = new PizZip();
        tempZip.file('word/document.xml', xml);
        tempZip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
            <Default Extension="xml" ContentType="application/xml"/>
            <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
            <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        </Types>`);

        const arrayBuffer = tempZip.generate({ type: 'arraybuffer' });

        // Convert using Mammoth
        const result = await mammoth.convertToHtml({ arrayBuffer });
        return result.value;
    };

    const renderArrayInputs = (blockName, blockData) => {
        const rows = Array.isArray(formData[blockName]) ? formData[blockName] : [];
        const isHorizontal = blockData?.config?.array_direction === 'horizontal';
        const children = blockData.children || [];

        if (isHorizontal) {
            // Keep existing horizontal digit-split rendering
            return (
                <div className="space-y-4 mt-2 border-l-2 border-blue-200 pl-4 py-2 bg-blue-50/20 rounded-r-lg">
                    <Badge className="bg-orange-600 uppercase text-[9px] tracking-tighter">
                        {blockName} (Horizontal)
                    </Badge>
                    {rows.length === 0 ? (
                        <div className="p-3 bg-white border rounded shadow-sm italic text-xs text-muted-foreground">
                            No items in {blockName}
                        </div>
                    ) : (
                        rows.map((row, idx) => (
                            <div key={idx} className="p-3 bg-white border rounded shadow-sm space-y-3">
                                {children.map(child => {
                                    let resolvedOptions = [];
                                    if (child.master_field_ids?.length > 0) {
                                        const mf = masterFields.get(parseInt(child.master_field_ids[0]));
                                        if (mf?.type === 'select') resolvedOptions = getDependentDropdownOptions(child, mf, row);
                                    }
                                    return (
                                        <PlaceholderInput
                                            key={child.id}
                                            placeholder={child}
                                            value={row[child.name]}
                                            originalValue={originalFormData[blockName]?.[idx]?.[child.name]}
                                            onChange={(val) => handleArrayInputChange(blockName, idx, child.name, val)}
                                            onSaveToDb={saveFieldToDatabase}
                                            resolvedOptions={resolvedOptions}
                                            masterFields={masterFields}
                                            imageStyles={imageStyles}
                                            onImageStyleChange={handleImageStyleChange}
                                            isArrayItem={true}
                                            arrayIndex={idx}
                                            blockName={blockName}
                                            resolveSourceValue={resolveSpecificSourceValue}
                                        />
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>
            );
        }

        // --- TRANSPOSED TABLE LAYOUT ---
        // Columns: [Field Label] [Entity 1] [Entity 2] [Entity 3] ...
        const entityLabel = blockData?.config?.entity_type?.[0] || blockData?.config?.entity_type || blockName;
        const colCount = rows.length + 1; // +1 for the field label column

        return (
            <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between">
                    <Badge className="bg-blue-600 uppercase text-[9px] tracking-tighter">
                        {blockName} — {rows.length} {String(entityLabel).toLowerCase()}(s)
                    </Badge>
                    <div className="flex gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2 text-blue-600 border-blue-200"
                            onClick={() => {
                                const emptyRow = children.reduce((acc, child) => ({ ...acc, [child.name]: '' }), {});
                                setFormData(prev => ({ ...prev, [blockName]: [...(prev[blockName] || []), emptyRow] }));
                            }}
                        >
                            + Add Row
                        </Button>
                    </div>
                </div>

                {rows.length === 0 ? (
                    <div className="p-4 bg-white border-2 border-dashed rounded text-xs text-muted-foreground italic text-center">
                        No {String(entityLabel).toLowerCase()}s found for {blockName}
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    {/* Field column header */}
                                    <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-wider text-[10px] w-[140px] border-r border-slate-200 sticky left-0 bg-slate-50 z-10">
                                        Field
                                    </th>
                                    {rows.map((_, idx) => (
                                        <th key={idx} className="px-3 py-2 text-center border-r border-slate-200 last:border-r-0 min-w-[180px]">
                                            <div className="flex items-center justify-between gap-1">
                                                <span className="font-bold text-blue-700 text-[10px] uppercase tracking-tight">
                                                    {String(entityLabel).charAt(0).toUpperCase() + String(entityLabel).slice(1)} {idx + 1}
                                                </span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-4 w-4 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full shrink-0"
                                                    onClick={() => {
                                                        const newRows = rows.filter((_, i) => i !== idx);
                                                        setFormData(prev => ({ ...prev, [blockName]: newRows }));
                                                    }}
                                                >
                                                    <X className="h-2.5 w-2.5" />
                                                </Button>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {children.map((child, childIdx) => {
                                    const isEvenRow = childIdx % 2 === 0;
                                    return (
                                        <tr
                                            key={child.id || child.name}
                                            className={cn(
                                                "border-b border-slate-100 last:border-b-0 hover:bg-blue-50/30 transition-colors",
                                                isEvenRow ? "bg-white" : "bg-slate-50/50"
                                            )}
                                        >

                                            {/* One input cell per entity/row */}
                                            {rows.map((row, rowIdx) => {
                                                let resolvedOptions = [];
                                                if (child.master_field_ids?.length > 0) {
                                                    const mf = masterFields.get(parseInt(child.master_field_ids[0]));
                                                    if (mf?.type === 'select') resolvedOptions = getDependentDropdownOptions(child, mf, row);
                                                }
                                                return (
                                                    <td
                                                        key={rowIdx}
                                                        className="px-2 py-1.5 border-r border-slate-100 last:border-r-0 align-middle"
                                                    >
                                                        <PlaceholderInput
                                                            placeholder={child}
                                                            value={row[child.name]}
                                                            originalValue={originalFormData[blockName]?.[rowIdx]?.[child.name]}
                                                            onChange={(val) => handleArrayInputChange(blockName, rowIdx, child.name, val)}
                                                            onSaveToDb={saveFieldToDatabase}
                                                            resolvedOptions={resolvedOptions}
                                                            onFileChange={(e) => {
                                                                const file = e.target.files[0];
                                                                if (file) {
                                                                    const r = new FileReader();
                                                                    r.onloadend = () => handleArrayInputChange(blockName, rowIdx, child.name, r.result);
                                                                    r.readAsDataURL(file);
                                                                }
                                                            }}
                                                            masterFields={masterFields}
                                                            imageStyles={imageStyles}
                                                            onImageStyleChange={handleImageStyleChange}
                                                            isArrayItem={true}
                                                            arrayIndex={rowIdx}
                                                            blockName={blockName}
                                                            requirementJobQuestions={requirementJobQuestions}
                                                            task={task}
                                                            formData={formData}
                                                            showLabel={false}
                                                            resolveSourceValue={resolveSpecificSourceValue}
                                                            isSaving={isSavingProfile}
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    const populateHtmlContent = useCallback((data, placeholders, styles) => {
        if (!selectedTemplate?.content) return '[NO TEMPLATE CONTENT]';

        // FIRST: Process the raw template content to preserve its native spaces/newlines
        let content = selectedTemplate.content
            .replace(/  +/g, (match) => '&nbsp;'.repeat(match.length))
            .replace(/\n/g, '<br />');

        let processedHeader = (headerContent || '')
            .replace(/  +/g, (match) => '&nbsp;'.repeat(match.length))
            .replace(/\n/g, '<br />');

        let processedFooter = (footerContent || '')
            .replace(/  +/g, (match) => '&nbsp;'.repeat(match.length))
            .replace(/\n/g, '<br />');

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
                            const childRegex = new RegExp(`\\{+\\s*%?\\s*${child.name}\\s*\\}+`, 'g');

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
                                    rowHtml = rowHtml.replace(childRegex, imageHtml);
                                } else {
                                    rowHtml = rowHtml.replace(childRegex, `<span style="color:#ccc; font-size: 8px;">[Empty Image: ${child.display_value || child.name}]</span>`);
                                }
                            } else {
                                // Standard text inside block
                                const value = extractDisplayValue(rawValue);
                                rowHtml = rowHtml.replace(childRegex, String(value || ''));
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
            const regex = new RegExp(`\\{+\\s*%?\\s*${cleanName}\\s*\\}+`, 'gi');

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
                const regex = new RegExp(`\\{+\\s*%?\\s*${cleanName}\\s*\\}+`, 'gi');
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
                // Apply formatting to the data being injected
                const formattedValue = formatWhitespace(value);

                const replacement = formattedValue ||
                    `<span style="background-color: #fef9c3; color: #854d0e; padding: 0 2px; border-radius: 2px;">[${placeholder.display_value || placeholder.name}]</span>`;

                universalReplace(regex, replacement);
            }
        });

        return `
    <div class="generated-document-container" style="font-family: 'Times New Roman', Times, serif; line-height: 1.5; color: #000; white-space: pre-wrap;">
        ${processedHeader ? `<div class="doc-header">${processedHeader}</div>` : ''}
        <div class="doc-body" style="min-height:800px; position: relative;">
            ${content}
        </div>
        ${processedFooter ? `<div class="doc-footer" style="border-top:0.5px solid #e2e8f0; font-size: 10px;">${processedFooter}</div>` : ''}
    </div>
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
                        const res = await fetch(publicUrl);
                        if (!res.ok) throw new Error(`Failed to fetch template: ${res.statusText}`);
                        const arrayBuffer = await res.arrayBuffer();
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
    }, [isOpen, selectedTemplate?.id, formData, imageStyles]); // Added dependencies to refresh on change

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

            console.log(`[SAVE FIELD DEBUG] Saving: ${placeholder.name} | Value: ${newValue}`);
            console.log(`[SAVE FIELD DEBUG] Target Entity found:`, targetEntity);
            console.log(`[SAVE FIELD DEBUG] Target ID resolved:`, entId);

            // ---------------------------------------------------------
            // 2. Determine Database Metadata (Table, Path, Linking Var)
            // ---------------------------------------------------------

            // CASE A: User selected a specific database source from the UI
            if (specificSource?.type === 'db') {
                const mf = masterFields.get(parseInt(specificSource.id));

                // Try to find the source matching the specific table requested
                // If not found, fall back to smart type matching
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
                entId = task?.id; // Override entId for job questions (always attached to task)
                sourceLabel = `Job Question: ${specificSource.id}`;
            }
            // CASE C: Default / Inline Edit (The Critical Fix)
            else {
                const mfId = placeholder.master_field_ids?.[0];
                if (!mfId) throw new Error("No Master Field ID linked to this placeholder");

                const mf = masterFields.get(parseInt(mfId));
                if (!mf || !mf.sources) throw new Error("Master Field configuration missing");

                // --- SMART SOURCE SELECTION ---
                // 1. Determine the effective type of the target entity
                let targetType = 'individual'; // Default to individual (Director, Sponsor, Principal, Dependant)

                const pTypes = Array.isArray(placeholder.entity_type) ? placeholder.entity_type : [placeholder.entity_type];

                if (pTypes.includes('company')) {
                    targetType = 'company';
                } else if (targetEntity && (targetEntity.company_name || targetEntity.registration_number)) {
                    // Heuristic: If the entity object looks like a company
                    targetType = 'company';
                }

                console.log(`[SAVE FIELD DEBUG] Detected Target Type: ${targetType}`);

                // 2. Find the source definition that matches this type
                // Note: Database usually uses 'company' or 'individual' as source_type
                const src = mf.sources.find(s => s.source_type === targetType)
                    || mf.sources[0]; // Fallback to first if no specific match

                if (!src) throw new Error(`No database source found for type '${targetType}'`);

                table = src.table;
                path = src.path;
                linkVar = src.linking_variable || 'id';

                // Double check for Sponsor/Individual mismatch
                // If we are saving an Individual but the table is a Company table, try to find an alternative
                if (targetType === 'individual' && table.includes('acc_portal_company')) {
                    console.warn(`[SAVE WARNING] Type is individual but table is ${table}. Attempting to find individual table...`);
                    const altSource = mf.sources.find(s => s.table === 'registry_individuals' || s.source_type === 'individual');
                    if (altSource) {
                        table = altSource.table;
                        path = altSource.path;
                        linkVar = altSource.linking_variable || 'id';
                        console.log(`[SAVE FIX] Switched to table: ${table}`);
                    }
                }
            }

            if (!entId || !table) {
                throw new Error(`Could not resolve database target. Table: ${table}, ID: ${entId}`);
            }

            // ---------------------------------------------------------
            // 3. Perform the Update
            // ---------------------------------------------------------
            console.log(`[SAVE EXECUTING] Updating ${table} where ${linkVar}=${entId}. Path: ${path}`);

            const { data: existing, error: findError } = await supabase.from(table).select('*').eq(linkVar, entId).maybeSingle();

            if (findError) {
                console.error("Error finding record:", findError);
                // Don't throw here, sometimes maybeSingle returns null without error, but if error exists we should know
            }

            let updatePayload = {};

            if (path && (path.includes('->') || path.includes('.'))) {
                // Handle JSON path updates (e.g., residential_address->>city)
                const pathParts = path.split(/->>|->|\./).map(p => p.trim().replace(/['"]/g, '')).filter(Boolean);
                const column = pathParts[0];
                const nestedPath = pathParts.slice(1);

                // Get existing JSON or empty object
                const existingJson = existing ? { ...(existing[column] || {}) } : {};

                // Helper to set deep value safely
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
                // Standard column update
                updatePayload[path || placeholder.name] = newValue;
            }

            const { error: updateError } = await supabase
                .from(table)
                .update({ ...updatePayload, updated_at: new Date().toISOString() })
                .eq(linkVar, entId);

            if (updateError) throw updateError;

            // ---------------------------------------------------------
            // 4. Fetch Updated Data & Refresh UI
            // ---------------------------------------------------------
            const { data: refreshedRecord, error: fetchError } = await supabase
                .from(table)
                .select('*')
                .eq(linkVar, entId)
                .single();

            if (fetchError) throw fetchError;

            // Update the Cache so resolvers see the new data
            setAdditionalCache(prev => ({
                ...prev,
                [table]: {
                    ...(prev[table] || {}),
                    [entId]: refreshedRecord
                }
            }));

            // Create a temporary cache object for immediate resolution
            const updatedCombinedCache = {
                ...combinedCache,
                ...additionalCache, // include existing additional cache
                [table]: {
                    ...(combinedCache[table] || {}),
                    ...(additionalCache[table] || {}),
                    [entId]: refreshedRecord
                }
            };

            const match = processPlaceholderValue(
                placeholder,
                relationshipData,
                updatedCombinedCache, // Use the new data
                masterFields,
                entityIdMap,
                extractedData,
                companyData,
                arrayIndex,
                sourceArray,
                task
            );

            const finalResolvedValue = placeholder.type === 'boolean' ? match.value : extractDisplayValue(match.value);

            // Sync UI state
            if (arrayIndex !== null && placeholder.parent_name) {
                handleArrayInputChange(placeholder.parent_name, arrayIndex, placeholder.name, finalResolvedValue);
            } else {
                handleInputChange(placeholder.name, finalResolvedValue);
            }

            // Sync originalFormData so "Save" buttons hide
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
            const response = await fetch('/api/ai/refine', { // Ensure this matches your route path
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
            return data.result; // This matches your Gemini route return
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
                const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/templates/${selectedTemplate.file_path}`;
                const res = await fetch(publicUrl);

                if (!res.ok) {
                    throw new Error("Failed to fetch template source from storage");
                }

                templateBuffer = await res.arrayBuffer();
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
            if (isWordTemplate) {
                let templateBuffer = docxTemplateBuffer.current;
                if (templateBuffer && typeof templateBuffer.then === 'function') {
                    templateBuffer = await templateBuffer;
                }

                if (!templateBuffer) {
                    throw new Error('No template buffer available for document generation');
                }

                const zip = new PizZip(templateBuffer);

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
                    <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50 flex-shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500 rounded-lg">
                                    <Wand2 className="h-5 w-5 text-white" />
                                </div>
                                <div>
                                    <DialogTitle className="text-xl font-bold">{documentName}</DialogTitle>
                                    <DialogDescription className="text-sm">Auto-populate and generate</DialogDescription>
                                    {loadedDraft && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <Badge variant="outline" className="ml-2 text-[8px] bg-amber-50 text-amber-700 border-amber-200">
                                                <FileText className="h-3 w-3" />
                                                <span className="font-medium">Draft in Progress</span>
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                Last saved {new Date(loadedDraft.created_at).toLocaleString()}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={discardDraft}
                                                disabled={isLoadingDraft}
                                                className="h-6 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                            >
                                                <X className="h-3 w-3 mr-1" />
                                                Discard Draft
                                            </Button>
                                        </div>
                                    )}

                                    {isLoadingDraft && (
                                        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Loading draft...
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <Label>{documentName}</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={refineAllFieldsWithAI}
                                    disabled={isGenerating}
                                    className="border-purple-200 text-purple-700 hover:bg-purple-50"
                                >
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    AI Refine
                                </Button>
                                {availableTemplates.length > 1 && (
                                    <Select value={selectedTemplate?.id} onValueChange={handleTemplateSelect}>
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
                                <span className="font-medium">
                                    {completionStats.filled}/{completionStats.total} Fields
                                    {loadedDraft && (
                                        <Badge variant="outline" className="ml-2 text-[8px] bg-amber-50 text-amber-700 border-amber-200">
                                            DRAFT
                                        </Badge>
                                    )}
                                </span>
                                <span>{completionStats.percentage}%</span>
                            </div>
                            <Progress
                                value={completionStats.percentage}
                                className={`h-1.5 ${loadedDraft ? '[&>div]:bg-amber-500' : ''}`}
                            />
                        </div>
                        {showConflictBanner && dataConflicts.length > 0 && loadedDraft && (
                            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 mt-0.5">
                                        <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-sm font-semibold text-amber-900 mb-1">
                                            ⚠️ Data Changes Detected
                                        </h4>
                                        <p className="text-xs text-amber-800 mb-2">
                                            The following fields have been updated in the database since this draft was saved:
                                        </p>
                                        <div className="space-y-1 mb-3">
                                            {dataConflicts.slice(0, 3).map((conflict, idx) => (
                                                <div key={idx} className="text-xs text-amber-700 font-mono bg-white/50 p-2 rounded">
                                                    <span className="font-semibold">{conflict.field}:</span>{' '}
                                                    <span className="line-through opacity-60">{String(conflict.draftValue).substring(0, 30)}</span>
                                                    {' → '}
                                                    <span className="font-semibold text-green-700">{String(conflict.liveValue).substring(0, 30)}</span>
                                                </div>
                                            ))}
                                            {dataConflicts.length > 3 && (
                                                <div className="text-xs text-amber-600 italic">
                                                    ...and {dataConflicts.length - 3} more field{dataConflicts.length - 3 > 1 ? 's' : ''}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="default"
                                                onClick={refreshWithLiveData}
                                                className="h-7 text-xs bg-amber-600 hover:bg-amber-700"
                                            >
                                                <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                                Refresh with Latest Data
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setShowConflictBanner(false)}
                                                className="h-7 text-xs text-amber-700 hover:bg-amber-100"
                                            >
                                                Keep Draft Values
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </DialogHeader>

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
                                                {renderArrayInputs(blockName, groupedPlaceholders.blocks[blockName])}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </ScrollArea>

                        <div className={`${panelClasses.preview} border-r relative bg-slate-100 overflow-y-auto transition-all duration-300`}>
                            <div className="sticky top-0 z-10 bg-white/90 backdrop-blur px-4 py-2 border-b flex justify-between">
                                <span className="text-[10px] font-bold text-slate-500">LIVE GENERATED DOCUMENT</span>
                                {isPreviewLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                            </div>
                            <div className="max-w-4xl mx-auto">
                                <div
                                    className={`bg-white shadow-xl min-h-[11in] ${EDITOR_PREVIEW_STYLES}`}
                                    style={{ whiteSpace: 'pre-wrap' }} // Add this
                                    dangerouslySetInnerHTML={{ __html: previewContent }}
                                />
                            </div>
                        </div>

                        {/* RIGHT PANEL: Original Template Reference */}
                        <div className={`${panelClasses.source} bg-slate-50 overflow-y-auto transition-all duration-300`}>
                            <div className="sticky top-0 z-10 bg-white/90 backdrop-blur px-4 py-2 border-b flex justify-between">
                                <span className="text-[10px] font-bold text-slate-500">ORIGINAL REFERENCE</span>
                            </div>
                            <div className="p-4">
                                {isWordTemplate ? (
                                    docPreviewUrl ? (
                                        <iframe
                                            src={docPreviewUrl}
                                            className="w-full h-[calc(100vh-250px)] border-0 rounded shadow bg-white"
                                            title="Original"
                                            onError={() => setDocPreviewUrl(null)}
                                        />
                                    ) : (
                                        <div className="h-[300px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed rounded">
                                            <FileText className="h-12 w-12 mb-2" />
                                            <p className="text-xs">Preview unavailable</p>
                                        </div>
                                    )
                                ) : (
                                    <div className="bg-white rounded border p-6">
                                        <Code className="h-8 w-8 text-blue-500 mb-3" />
                                        <h3 className="font-semibold text-sm mb-2">HTML Template Source</h3>
                                        <p className="text-xs text-slate-600 italic">This template is HTML based. Use the Live Preview to see the output.</p>
                                    </div>
                                )}
                            </div>
                        </div>
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