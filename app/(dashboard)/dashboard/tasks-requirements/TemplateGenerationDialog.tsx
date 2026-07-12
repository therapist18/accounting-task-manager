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
import { AlignCenter, AlignLeft, AlignRight, Download, FileText, FileUp, Loader2, Wand2, Expand, CheckCircle2, X, Image as ImageIcon, Save, Sparkles, MousePointer2, Layout, Code, ChevronDown, Database, Layers, Edit3, Users } from "lucide-react";
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
import { PreviewPanel } from './components/PreviewPanel';
import { UploadModal } from '@/app/generic-components/UploadModal';
import { SearchableSelect } from '@/components/ui/searchable-select';

// Common docxtemplater format functions
const formatFunctions = new Set([
    'upper', 'lower', 'capital', 'capitalize', 'title', 'camel', 'snake', 'kebab',
    'date', 'time', 'datetime', 'currency', 'number', 'int', 'float', 'round',
    'prettify', 'escape', 'unescape', 'html', 'raw', 'json', 'parse', 'stringify'
]);

const formatRegex = /\{\{\s*([a-zA-Z0-9_]+)\s*(\/([a-zA-Z0-9_]+))?\s*\}\}/g;

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

// Anyone associated with the task's company under a given role (director/shareholder/
// employee/etc.), sourced from registry_individuals.employment_data.associations - same
// data the Letters module's signatory picker reads from (useLetterData.ts).
const getCompanyRegistryCandidates = (normType, companyAssociates) => {
    if (!companyAssociates?.length || !normType) return [];
    return companyAssociates.filter((ind: any) =>
        (ind.associations || []).some((a: any) => a.individual_type?.toLowerCase()?.includes(normType))
    );
};

// Used as a fallback when the task has no participant tagged with that role, and as the
// only resolution path for roles (shareholder/employee) that were never task participants
// at all. entityOverrides[normType] lets the user pick a specific person when more than one
// candidate matches.
const resolveCompanyRegistryFallback = (normType, companyAssociates, entityOverrides) => {
    const candidates = getCompanyRegistryCandidates(normType, companyAssociates);
    if (candidates.length === 0) return null;
    const overrideId = entityOverrides?.[normType];
    return (overrideId && candidates.find((c: any) => String(c.id) === String(overrideId))) || candidates[0];
};

const getTargetEntity = (placeholder, relationshipData, arrayIndex = null, sourceArray = null, entityIdMap = null, combinedCache = null, extractedData = null, companyData = null, companyAssociates = null, entityOverrides = null) => {
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

    const resolveFromTaskParticipants = () => {
        if (entityIdMap) {
            if (normType === 'director' && entityIdMap.director) {
                const dirId = entityIdMap.director;
                return relationshipData?.directors?.find(d => String(d.id) === String(dirId)) ||
                    combinedCache?.['registry_individuals']?.[dirId];
            }
            if (normType === 'principal' && entityIdMap.principal) {
                return relationshipData?.principal || extractedData;
            }
            if (normType === 'shareholder' && entityIdMap.shareholder) {
                const shareId = entityIdMap.shareholder;
                return relationshipData?.shareholders?.find(s => String(s.id) === String(shareId)) ||
                    combinedCache?.['registry_individuals']?.[shareId];
            }
            if (normType === 'employee' && entityIdMap.employee) {
                const empId = entityIdMap.employee;
                return relationshipData?.employees?.find(e => String(e.id) === String(empId)) ||
                    combinedCache?.['employment_data']?.[empId];
            }
            if (normType === 'understudy' && entityIdMap.understudy) {
                const underId = entityIdMap.understudy;
                return relationshipData?.understudies?.find(u => String(u.id) === String(underId)) ||
                    combinedCache?.['registry_individuals']?.[underId];
            }
        }
        if (normType === 'principal') {
            return relationshipData?.principal || extractedData;
        }

        if (normType === 'sponsor') {
            if (entityIdMap?.sponsor) {
                if (relationshipData?.sponsor && String(relationshipData.sponsor.id) === String(entityIdMap.sponsor)) {
                    return relationshipData.sponsor;
                }
            }
            return relationshipData?.sponsor || null;
        }

        if (['dependant', 'spouse', 'child'].includes(normType)) {
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

    const taskResult = resolveFromTaskParticipants();
    if (taskResult) return taskResult;

    // No task participant matched this role - e.g. 'shareholder'/'employee' (which were
    // never task-participant concepts to begin with), or a 'director' with nobody tagged
    // as director on this specific task. Fall back to the company registry.
    if (normType && normType !== 'company') {
        const fallback = resolveCompanyRegistryFallback(normType, companyAssociates, entityOverrides);
        if (fallback) return fallback;

        const fallbackLower = String(normType).toLowerCase().trim();
        const companyRegistries = ['registry_individuals', 'employment_data'];
        for (const reg of companyRegistries) {
            if (!combinedCache?.[reg]) continue;
            for (const item of Object.values(combinedCache[reg])) {
                const matches = item.associations?.some((a: any) =>
                    a.individual_type?.toLowerCase().includes(fallbackLower)
                );
                if (matches) return item;
            }
        }
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

const processConditionalField = (placeholder, targetEntity, combinedCache, masterFields, computedFieldCache) => {
    if (!placeholder.conditions || !targetEntity) return { value: '', source: null };

    const targetId = String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id || targetEntity.company_id);

    for (const condition of placeholder.conditions) {
        if (condition.comparison) {
            const { field, operator, value: compareValue } = condition.comparison;

            if (!field) continue;

            let fieldValue = null;

            if (condition.master_field_id) {
                const mf = masterFields.get(parseInt(condition.master_field_id, 10));
                if (mf?.sources) {
                    for (const source of mf.sources) {
                        // Handle computed fields
                        if (source.is_computed && computedFieldCache) {
                            const extractionMode = 'latest';
                            const cacheKey = `${mf.id}_${targetId}_${extractionMode}`;
                            const computedVal = computedFieldCache[cacheKey];

                            if (computedVal !== undefined && computedVal !== null && computedVal !== '' &&
                                !['Document Not Found', 'Missing Document', 'Field Not Found', 'Missing', 'No Source'].includes(computedVal)) {
                                fieldValue = computedVal;
                                break;
                            }
                            continue;
                        }

                        // Handle regular database fields
                        const tableData = combinedCache[source.table];
                        if (!tableData) continue;

                        const linkingVar = source.linking_variable || 'id';
                        const record = Object.values(tableData).find(rec =>
                            String(rec[linkingVar] || rec.id) === targetId
                        );

                        if (record) {
                            fieldValue = source.path
                                ? parseJsonValue(record, source.path)
                                : record[field || mf.field_key];

                            if (fieldValue && typeof fieldValue === 'object') {
                                fieldValue = fieldValue.number || fieldValue.value || fieldValue.name || String(fieldValue);
                            }
                            break;
                        }
                    }
                }
            } else {
                fieldValue = targetEntity[field];
            }

            if (fieldValue === null || fieldValue === undefined) continue;

            const strFieldValue = String(fieldValue).trim().toLowerCase();
            const strCompareValue = String(compareValue || '').trim().toLowerCase();

            let conditionMet = false;
            switch (operator) {
                case 'equals':
                    conditionMet = strFieldValue === strCompareValue;
                    break;
                case 'not_equals':
                    conditionMet = strFieldValue !== strCompareValue;
                    break;
                case 'contains':
                    conditionMet = strFieldValue.includes(strCompareValue);
                    break;
                default:
                    conditionMet = Boolean(fieldValue);
            }

            if (conditionMet) {
                return {
                    value: `${condition.label || ''}${fieldValue}`,
                    source: 'Conditional Match'
                };
            }
        } else if (condition.master_field_id) {
            const mf = masterFields.get(parseInt(condition.master_field_id, 10));
            if (!mf?.sources) continue;

            for (const source of mf.sources) {
                // Handle computed fields
                if (source.is_computed && computedFieldCache) {
                    const extractionMode = 'latest';
                    const cacheKey = `${mf.id}_${targetId}_${extractionMode}`;
                    const computedVal = computedFieldCache[cacheKey];

                    if (computedVal !== undefined && computedVal !== null && computedVal !== '' &&
                        !['Document Not Found', 'Missing Document', 'Field Not Found', 'Missing', 'No Source'].includes(computedVal)) {
                        return {
                            value: `${condition.label || ''}${computedVal}`,
                            source: `Conditional: ${mf.label || 'Computed'}`
                        };
                    }
                    continue;
                }

                // Handle regular database fields
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

const processDocumentChecklistField = (placeholder, targetEntity, combinedCache) => {
    const checklistDataSources = placeholder.checklist_data_sources || [];
    const displayFormat = placeholder.checklist_display_format || 'bullets';
    const successLabel = placeholder.checklist_success_label || '✔';
    const notFoundLabel = placeholder.checklist_not_found_label || '✗';

    if (checklistDataSources.length === 0) {
        return { value: '', source: null };
    }

    const searchId = String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id || targetEntity.company_id);
    const checklistResults = [];
    for (const dataSource of checklistDataSources) {
        const { table, linking_variable, linked_document_ids = [], execution_mode = 'latest', label } = dataSource;
        const tableData = combinedCache[table];
        if (!tableData) {
            const itemLabel = label || placeholder.display_value || placeholder.name;
            checklistResults.push(`${notFoundLabel} ${itemLabel}`);
            continue;
        }
        let matches = Object.values(tableData).filter(d => {
            const entityIdMatch = String(d[linking_variable] || d.id) === searchId;
            if (!entityIdMatch) return false;

            if (linked_document_ids.length > 0) {
                return linked_document_ids.includes(d.document_id);
            }

            return true;
        });
        if (execution_mode === 'latest' && matches.length > 0) {
            matches = matches.sort((a, b) => {
                const aDate = a.issue_date ? new Date(a.issue_date).getTime() : 0;
                const bDate = b.issue_date ? new Date(b.issue_date).getTime() : 0;
                return bDate - aDate;
            });
            matches = [matches[0]];
        }

        // Use label from data source or placeholder display_value as fallback
        const itemLabel = label || placeholder.display_value || placeholder.name;

        if (matches.length > 0) {
            checklistResults.push(`${successLabel} ${itemLabel}`);
        } else {
            checklistResults.push(`${notFoundLabel} ${itemLabel}`);
        }
    }

    if (checklistResults.length === 0) {
        return { value: '', source: null };
    }

    // Join all checklist items with newlines
    return {
        value: checklistResults.join('\n'),
        source: 'Document Checklist'
    };
};

const processImageField = (placeholder, targetEntity, combinedCache, masterFields) => {
    // Current placeholders don't carry source_table/linking_variable directly - they resolve
    // through their master_field_ids' own sources[] instead, same as processTextField does for
    // text fields. Try that first before falling back to the older placeholder-level config.
    if (placeholder.master_field_ids?.length > 0 && targetEntity) {
        const candidateIds = [
            targetEntity?.id,
            targetEntity?.director_id,
            targetEntity?.individual_id,
            targetEntity?.company_id,
        ]
            .filter(Boolean)
            .map(String)
            .filter((v, i, arr) => arr.indexOf(v) === i);

        if (candidateIds.length > 0) {
            for (const mid of placeholder.master_field_ids) {
                const mf = masterFields.get(parseInt(mid, 10));
                if (!mf?.sources) continue;

                const sortedSources = [...mf.sources].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

                for (const source of sortedSources) {
                    const tableData = combinedCache[source.table];
                    if (!tableData) continue;

                    const linkingVar = source.linking_variable || 'id';
                    const docIds: string[] = Array.isArray(source.document_id)
                        ? source.document_id
                        : (source.document_id ? [source.document_id] : []);

                    let matches = Object.values(tableData).filter((r: any) => {
                        if (!candidateIds.includes(String(r[linkingVar]))) return false;
                        if (docIds.length > 0) return docIds.includes(r.document_id);
                        return true;
                    });

                    if (matches.length === 0) continue;

                    matches = matches.sort((a: any, b: any) => {
                        const aDate = a.issue_date ? new Date(a.issue_date).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
                        const bDate = b.issue_date ? new Date(b.issue_date).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
                        return bDate - aDate;
                    });

                    const match: any = matches[0];
                    if (match?.file_path) {
                        return {
                            value: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${match.file_path}`,
                            source: `Image: ${source.table}`,
                        };
                    }
                }
            }
        }
    }

    // Older placeholder-level config (source_table/linking_variable set directly on the
    // placeholder rather than resolved via master_field_ids) - kept for backward compatibility.
    const sourceTable = placeholder.source_table;
    const linkingVariable = placeholder.linking_variable;
    const documentTypeIds = placeholder.document_type_ids || [];
    const computedFunction = placeholder.computed_function || 'none';
    const executionMode = placeholder.execution_mode || 'latest';

    if (!sourceTable || !linkingVariable) {
        return { value: '', source: null };
    }

    const tableData = combinedCache[sourceTable];
    if (!tableData) {
        return { value: '', source: null };
    }

    const searchId = String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id || targetEntity.company_id);

    let matches = Object.values(tableData).filter(d => {
        const entityIdMatch = String(d[linkingVariable] || d.id) === searchId;
        if (!entityIdMatch) return false;

        if (documentTypeIds.length > 0) {
            return documentTypeIds.includes(d.document_id);
        }

        return true;
    });

    if (matches.length === 0) {
        return { value: '', source: null };
    }

    if (executionMode === 'latest' || computedFunction.includes('Latest')) {
        matches = matches.sort((a, b) => {
            const aDate = a.issue_date ? new Date(a.issue_date).getTime() : 0;
            const bDate = b.issue_date ? new Date(b.issue_date).getTime() : 0;
            return bDate - aDate;
        });
    }

    const match = matches[0];
    if (match?.file_path) {
        const imageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${match.file_path}`;
        return {
            value: imageUrl,
            source: `Image: ${sourceTable}`
        };
    }

    return { value: '', source: null };
};

const processTextField = (
    placeholder: any,
    targetEntity: any,
    combinedCache: Record<string, any>,
    masterFields: Map<number, any>,
    computedFieldCache: Record<string, any> | null,
) => {
    if (!placeholder.master_field_ids?.length) {
        return { value: '', source: null };
    }

    const candidateIds = [
        targetEntity?.id,
        targetEntity?.director_id,
        targetEntity?.individual_id,
        targetEntity?.company_id,
    ]
        .filter(Boolean)
        .map(String)
        .filter((v, i, arr) => arr.indexOf(v) === i);

    if (candidateIds.length === 0) {
        return { value: '', source: null };
    }

    const allValues: string[] = [];
    const allSources: string[] = [];

    for (const id of placeholder.master_field_ids) {
        const mf = masterFields.get(parseInt(id, 10));
        if (!mf?.sources) continue;

        // Sort by priority ascending so lower number = higher priority
        const sortedSources = [...mf.sources].sort(
            (a, b) => (a.priority ?? 999) - (b.priority ?? 999)
        );

        for (const source of sortedSources) {

            // ── COMPUTED SOURCE ──────────────────────────────────────────────
            if (source.is_computed) {
                if (!computedFieldCache) continue;

                const extractionMode = 'latest';
                let computedVal: any;

                for (const candidateId of candidateIds) {
                    const ck = `${mf.id}_${candidateId}_${extractionMode}`;
                    if (computedFieldCache[ck] !== undefined) {
                        computedVal = computedFieldCache[ck];
                        break;
                    }
                }

                if (computedVal === undefined) continue; // still loading

                const errorStrings = [
                    'Document Not Found', 'Missing Document', 'No Document Specified',
                    'Field Not Found', 'Number Not Found', 'Missing', 'No Source',
                ];

                if (computedVal !== null && !errorStrings.includes(computedVal)) {
                    let finalVal = computedVal;

                    if (typeof computedVal === 'object' && computedVal !== null && source.path) {
                        const pathMatch = source.path.match(/['"]([\w_]+)['"]$/);
                        const fieldName = pathMatch ? pathMatch[1] : null;
                        if (fieldName && computedVal[fieldName]) {
                            finalVal = String(computedVal[fieldName]);
                        } else {
                            finalVal = computedVal.en || computedVal.name || computedVal.title ||
                                String(Object.values(computedVal)[0] || '');
                        }
                    }

                    if (finalVal && String(finalVal).trim() !== '') {
                        allValues.push(String(finalVal));
                        allSources.push(`Computed: ${mf.label || source.table}`);
                        break; // found for this master field — stop trying sources
                    }
                }
                continue; // computed error → try next priority source
            }

            // ── STANDARD DB SOURCE ───────────────────────────────────────────
            const tableData = combinedCache[source.table];
            if (!tableData) continue;

            const linkingVar = source.linking_variable || 'id';

            // Document-scoped sources (source_type === 'document' or has document_id[])
            // are cached under a composite key: doc_<docId>_<entityId>
            const docIds: string[] = Array.isArray(source.document_id)
                ? source.document_id
                : (source.document_id ? [source.document_id] : []);

            let record: any = null;

            if (docIds.length > 0) {
                // Try composite key first: doc_<documentId>_<entityId>
                for (const docId of docIds) {
                    for (const candidateId of candidateIds) {
                        const compositeKey = `doc_${docId}_${candidateId}`;
                        if (tableData[compositeKey]) {
                            record = tableData[compositeKey];
                            break;
                        }
                    }
                    if (record) break;
                }

                // Fallback: scan table rows matching both entity ID and document_id
                if (!record) {
                    const allRows = Object.values(tableData);
                    for (const candidateId of candidateIds) {
                        record = allRows.find((r: any) =>
                            String(r[linkingVar]) === candidateId &&
                            docIds.includes(r.document_id)
                        ) || null;
                        if (record) break;
                    }
                }
            } else {
                // Standard entity-ID lookup
                for (const candidateId of candidateIds) {
                    record = Object.values(tableData).find((r: any) =>
                        String((r as any)[linkingVar]) === candidateId
                    ) || null;
                    if (record) break;
                }
            }

            if (record) {
                let val = source.path
                    ? parseJsonValue(record, source.path)
                    : ((record as any)[mf.field_key] || (record as any)[placeholder.name]);

                if (val && String(val).trim() !== '') {
                    allValues.push(String(val));
                    allSources.push(`DB(p${source.priority ?? '?'}): ${source.table}`);
                    break; // found a value at this priority — stop trying lower priorities
                }
                // value was empty → fall through to next priority source
            }
            // record not found → fall through to next priority source
        }
    }

    if (allValues.length > 0) {
        return { value: allValues.join(' '), source: allSources[0] };
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

const processPlaceholderValue = (placeholder, relationshipData, combinedCache, masterFields, entityIdMap = null, extractedData, companyData, arrayIndex = null, sourceArray = null, task = null, computedFieldCache = null, companyAssociates = null, entityOverrides = null) => {
    const logic = placeholder.source_logic || 'priority';
    const collectedValues: string[] = [];
    const sourceMetadata: string[] = [];
    const targetEntity = getTargetEntity(placeholder, relationshipData, arrayIndex, sourceArray, entityIdMap, combinedCache, extractedData, companyData, companyAssociates, entityOverrides);
    const targetId = targetEntity ? String(targetEntity.id || targetEntity.director_id || targetEntity.individual_id || targetEntity.company_id) : null;

    // System-date fields (date_config.useCurrentDate) don't depend on any target entity -
    // resolve them before the targetEntity-gated loop so an unresolved targetEntity (e.g.
    // entity_type left unset/unmatched for a plain "today's date" field) never blocks the
    // placeholder from populating.
    if (placeholder.master_field_ids?.length > 0 && masterFields) {
        for (const mid of placeholder.master_field_ids) {
            const mf = masterFields.get(parseInt(mid, 10));
            if (mf?.date_config?.useCurrentDate) {
                const result = processCurrentDateField({ ...placeholder, master_field_ids: [mid] }, masterFields);
                if (isValidValue(result.value, placeholder.type)) {
                    if (logic === 'priority') {
                        return result;
                    }
                    collectedValues.push(String(result.value));
                    sourceMetadata.push(result.source || 'System Date');
                }
            }
        }
    }

    if (placeholder.master_field_ids?.length > 0 && targetEntity) {
        for (const mid of placeholder.master_field_ids) {
            let result = { value: '', source: null };
            const mf = masterFields.get(parseInt(mid, 10));
            if (mf?.date_config?.useCurrentDate) {
                continue; // already resolved above, independent of targetEntity
            } else {
                if (placeholder.type === 'ordinal') {
                    result = processOrdinalField(placeholder, arrayIndex);
                } else if (placeholder.type === 'image') {
                    result = processImageField(placeholder, targetEntity, combinedCache, masterFields);
                } else if (placeholder.type === 'boolean') {
                    result = processBooleanField({ ...placeholder, master_field_ids: [mid] }, targetEntity, combinedCache, masterFields);
                } else {
                    result = processTextField({ ...placeholder, master_field_ids: [mid] }, targetEntity, combinedCache, masterFields, computedFieldCache);
                }
            }
            if (isValidValue(result.value, placeholder.type)) {
                if (logic === 'priority') {
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
            if (logic === 'priority') { return result; }
            collectedValues.push(result.value);
            sourceMetadata.push(result.source || 'Boolean (DB)');
        }
    }

    if (placeholder.type === 'conditional' && placeholder.conditions?.length > 0 && targetEntity) {
        const result = processConditionalField(placeholder, targetEntity, combinedCache, masterFields, computedFieldCache);
        if (isValidValue(result.value)) {
            if (logic === 'priority') { return result; }
            collectedValues.push(String(result.value));
            sourceMetadata.push(result.source || 'Conditional (DB)');
        }
    }

    if (placeholder.type === 'document_checklist' && placeholder.checklist_data_sources?.length > 0 && targetEntity) {
        const result = processDocumentChecklistField(placeholder, targetEntity, combinedCache);
        if (isValidValue(result.value)) {
            if (logic === 'priority') { return result; }
            collectedValues.push(String(result.value));
            sourceMetadata.push(result.source || 'Document Checklist');
        }
    }

    if (placeholder.type === 'image' && placeholder.source_table && placeholder.linking_variable && targetEntity) {
        const result = processImageField(placeholder, targetEntity, combinedCache, masterFields);
        if (isValidValue(result.value)) {
            if (logic === 'priority') { return result; }
            collectedValues.push(String(result.value));
            sourceMetadata.push(result.source || 'Image');
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
        const checkedItems = value.filter(opt => opt && opt.checked);

        if (checkedItems.length > 0) {
            return checkedItems.map(opt => {
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

export function resolveTemplatePlaceholders(template: any, ctx: {
    relationshipData: any
    sourceDataCache: Record<string, any>
    additionalCache?: Record<string, any>
    masterFields: Map<number, any>
    entityIdMap: any
    extractedData?: any
    companyData?: any
    task?: any
    computedFieldCache?: Record<string, any>
}): { filled: number; total: number; values: Record<string, any> } {
    if (!template?.placeholders?.length) return { filled: 0, total: 0, values: {} };

    const combinedCache = { ...(ctx.sourceDataCache || {}), ...(ctx.additionalCache || {}) };

    const topLevel: any[] = [];
    const seenDisplayValues = new Set<string>();
    template.placeholders.forEach((p: any) => {
        if (p.is_block_start || p.parent_name) return;
        const qId = p.boolean_conditions?.[0]?.linked_job_question_id;
        const uniqueKey = qId ? `q_${qId}` : (p.display_value || p.name);
        if (seenDisplayValues.has(uniqueKey) && p.type === 'boolean') return;
        seenDisplayValues.add(uniqueKey);
        topLevel.push(p);
    });

    const values: Record<string, any> = {};
    let filled = 0;
    topLevel.forEach((p) => {
        const match = processPlaceholderValue(
            p,
            ctx.relationshipData,
            combinedCache,
            ctx.masterFields,
            ctx.entityIdMap,
            ctx.extractedData,
            ctx.companyData,
            null,
            null,
            ctx.task,
            ctx.computedFieldCache
        );
        const val = p.type === 'boolean' ? match.value : extractDisplayValue(match.value);
        values[p.name] = val;
        if (isValidValue(val, p.type)) filled++;
    });

    return { filled, total: topLevel.length, values };
}

const ImagePlaceholderControls = ({ styles, onStyleChange }) => {
    const sizeMap = { small: '25%', medium: '50%', large: '75%', 'full-width': '100%' };
    const currentSizeKey = Object.keys(sizeMap).find(key => sizeMap[key] === styles.maxWidth) || 'full-width';

    return (
        <div className="flex items-center gap-1.5 pt-1 mt-1 border-t">
            <ToggleGroup
                type="single"
                value={styles.textAlign || 'center'}
                onValueChange={(align) => align && onStyleChange('textAlign', align)}
                className="bg-background rounded border h-6"
            >
                <ToggleGroupItem value="left" className="px-1.5"><AlignLeft className="h-2.5 w-2.5" /></ToggleGroupItem>
                <ToggleGroupItem value="center" className="px-1.5"><AlignCenter className="h-2.5 w-2.5" /></ToggleGroupItem>
                <ToggleGroupItem value="right" className="px-1.5"><AlignRight className="h-2.5 w-2.5" /></ToggleGroupItem>
            </ToggleGroup>
            <Select value={currentSizeKey} onValueChange={(size) => onStyleChange('maxWidth', sizeMap[size])}>
                <SelectTrigger className="w-12 h-6 text-[9px]"><SelectValue><Expand className="h-2.5 w-2.5" /></SelectValue></SelectTrigger>
                <SelectContent>
                    <SelectItem value="small">25%</SelectItem>
                    <SelectItem value="medium">50%</SelectItem>
                    <SelectItem value="large">75%</SelectItem>
                    <SelectItem value="full-width">100%</SelectItem>
                </SelectContent>
            </Select>
            <Input
                type="number"
                min="50"
                max="600"
                value={styles.imageWidth || 300}
                onChange={(e) => onStyleChange('imageWidth', parseInt(e.target.value) || 300)}
                className="h-6 w-14 text-[9px] px-1.5"
            />
            <span className="text-[9px] text-slate-400">×</span>
            <Input
                type="number"
                min="50"
                max="600"
                value={styles.imageHeight || 200}
                onChange={(e) => onStyleChange('imageHeight', parseInt(e.target.value) || 200)}
                className="h-6 w-14 text-[9px] px-1.5"
            />
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
    resolveSourceValue, placeholder, value, originalValue, onChange, onSaveToDb, isSaving, onFileChange, imageStyles, onImageStyleChange, autoPopulated, isArrayItem = false, arrayIndex = null, blockName = null, onAIRefine, isAIRefining, resolvedOptions = [], masterFields, showLabel = true, targetEntity = null, task = null
}) => {
    const fieldKey = isArrayItem ? `${blockName}_${arrayIndex}_${placeholder.name}` : placeholder.name;
    const [editingSource, setEditingSource] = useState(null);
    const [editValue, setEditValue] = useState("");
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);

    const uploadTarget = useMemo(() => {
        if (placeholder.type !== 'image' || !placeholder.master_field_ids?.length || !masterFields || !targetEntity) return null;
        for (const mid of placeholder.master_field_ids) {
            const mf = masterFields.get(parseInt(mid, 10));
            const source = mf?.sources?.[0];
            if (!source?.table) continue;
            const entityId = targetEntity.id || targetEntity.director_id || targetEntity.individual_id || targetEntity.company_id;
            if (!entityId) continue;
            const docIds = Array.isArray(source.document_id) ? source.document_id : (source.document_id ? [source.document_id] : []);
            return {
                targetTable: source.table,
                idFieldName: source.linking_variable || 'director_id',
                entityId: String(entityId),
                documentId: docIds[0] || null,
                isCompanyUpload: (source.linking_variable || '') === 'company_id',
            };
        }
        return null;
    }, [placeholder, masterFields, targetEntity]);
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

    // Manual override for this document only - writes straight to local formData via
    // onChange, same as a plain STATE C input does, and deliberately never calls
    // onSaveToDb so it doesn't touch the underlying source record.
    const [isManualEditing, setIsManualEditing] = useState(false);
    const [manualValue, setManualValue] = useState("");
    const handleStartManualEdit = () => {
        setManualValue(isValidValue(value) ? value : '');
        setIsManualEditing(true);
        setIsPopoverOpen(false);
    };
    const handleApplyManualEdit = () => {
        onChange(manualValue);
        setIsManualEditing(false);
    };
    const handleCancelManualEdit = () => setIsManualEditing(false);

    // --- STATE A: INLINE EDITING MODE (Triggered by Pencil) ---
    if (editingSource) {
        // Resolve dropdown options for the SPECIFIC master field being edited (not just
        // master_field_ids[0] - the popover lets you pick any of the placeholder's linked
        // fields, and each one can independently be a select-type field with its own options).
        // Mirrors the non-dependent branches of getDependentDropdownOptions (plain array or
        // { options: [...] }) - the dependency-chain branch needs formData/selectedTemplate
        // context that isn't available at this leaf component, so cascading dropdowns still
        // fall back to a plain text input here.
        const editSourceOptions = (() => {
            if (editingSource.type !== 'db' || !masterFields?.get) return [];
            const mf = masterFields.get(parseInt(editingSource.id, 10));
            const opts = mf?.options;
            if (!opts) return [];
            if (Array.isArray(opts)) return opts.map((o: any) => typeof o === 'string' ? { label: o, value: o } : o);
            if (Array.isArray(opts.options)) return opts.options.map((o: any) => typeof o === 'string' ? { label: o, value: o } : o);
            return [];
        })();

        return (
            <div className="space-y-1 animate-in fade-in zoom-in-95 duration-200">
                {showLabel && (
                    <Label className="text-[10px] font-bold text-blue-600 uppercase tracking-tight flex items-center gap-1">
                        <Edit3 className="h-2.5 w-2.5" /> Editing {editingSource.label}
                    </Label>
                )}
                <div className="flex items-center gap-2">
                    {editSourceOptions.length > 0 ? (
                        <SearchableSelect
                            value={editSourceOptions.find((o: any) => o.label === editValue)?.value ?? editValue ?? ''}
                            onValueChange={(val) => {
                                const selected = editSourceOptions.find((o: any) => String(o.value) === val);
                                setEditValue(selected ? selected.label : val);
                            }}
                            options={editSourceOptions}
                            placeholder="Select an option..."
                            buttonClassName="h-8 text-xs border-blue-400 ring-2 ring-blue-50 flex-1"
                        />
                    ) : (
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
                    )}
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
        if (isManualEditing) {
            return (
                <div className="space-y-1 animate-in fade-in zoom-in-95 duration-200">
                    {showLabel && (
                        <Label className="text-[10px] font-bold text-blue-600 uppercase tracking-tight flex items-center gap-1">
                            <Edit3 className="h-2.5 w-2.5" /> Custom Value (this document only)
                        </Label>
                    )}
                    <div className="flex items-center gap-2">
                        <Input
                            autoFocus
                            value={manualValue}
                            onChange={(e) => setManualValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleApplyManualEdit();
                                if (e.key === 'Escape') handleCancelManualEdit();
                            }}
                            className="h-8 text-xs border-blue-400 ring-2 ring-blue-50"
                        />
                        <Button size="icon" onClick={handleApplyManualEdit} className="h-8 w-8 bg-green-600 hover:bg-green-700 shrink-0">
                            <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={handleCancelManualEdit} className="h-8 w-8 text-red-500 shrink-0">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="mt-2 p-2 bg-blue-50/50 border border-blue-100 rounded text-[10px] text-blue-700">
                        <div className="font-medium">💡 Quick Custom Value Entry</div>
                        <div className="mt-1">Start typing directly in this field for immediate custom values without saving to profile.</div>
                    </div>
                </div>
            );
        }
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
                        <div className="p-1 border-t bg-white">
                            <Button
                                size="sm" variant="ghost"
                                className="w-full h-8 justify-start text-xs text-slate-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={handleStartManualEdit}
                            >
                                <Edit3 className="h-3.5 w-3.5 mr-2 text-slate-400" />
                                Type a custom value for this document
                            </Button>
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
                            <span className="text-xs font-bold">Save To Profile</span>
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
        const defaultWidth = placeholder.image_width ? parseInt(placeholder.image_width) : 300;
        const defaultHeight = placeholder.image_height ? parseInt(placeholder.image_height) : 200;
        const imageWidth = style.imageWidth || defaultWidth;
        const imageHeight = style.imageHeight || defaultHeight;

        return (
            <div className="">
                <FieldHeader />
                {value ? (
                    <div className={cn("relative border rounded overflow-hidden flex items-center justify-center bg-slate-50", hasChanged && canSave ? "border-amber-400" : "")} style={{ height: `${Math.min(imageHeight, 100)}px` }}>
                        <img src={value} className="max-h-full object-contain" style={{ textAlign: style.textAlign || 'center', maxWidth: style.maxWidth || '100%', width: `${imageWidth}px` }} />
                        <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                            <Button size="sm" variant="secondary" className="h-6 text-[9px] px-2" onClick={() => document.getElementById(`file-${fieldKey}`).click()}>Replace</Button>
                            {uploadTarget && (
                                <Button size="sm" variant="secondary" className="h-6 text-[9px] px-2" onClick={() => setUploadModalOpen(true)}>Save</Button>
                            )}
                            <Button size="sm" variant="destructive" className="h-6 text-[9px] px-2" onClick={() => onChange('')}>Remove</Button>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => uploadTarget ? setUploadModalOpen(true) : document.getElementById(`file-${fieldKey}`).click()}
                        className="w-full text-[10px] border border-dashed border-blue-300 rounded p-2 text-center cursor-pointer bg-blue-50/30 hover:bg-blue-50 hover:border-blue-400 transition-all group flex items-center gap-2"
                    >
                        <div className="p-1 bg-blue-100 rounded group-hover:bg-blue-200 transition-colors shrink-0">
                            <FileUp className="h-3.5 w-3.5 text-blue-500" />
                        </div>
                        <div className="text-left min-w-0">
                            <p className="font-semibold text-blue-700 truncate">{placeholder.display_value || placeholder.name}</p>
                            <p className="text-blue-400">
                                {uploadTarget ? 'Upload & save to profile' : 'Click to upload'}
                            </p>
                        </div>
                    </button>
                )}
                <input id={`file-${fieldKey}`} type="file" className="hidden" accept="image/jpeg,image/jpg,image/png" onChange={onFileChange} />
                {uploadTarget && uploadModalOpen && (
                    <UploadModal
                        isOpen={uploadModalOpen}
                        onClose={() => setUploadModalOpen(false)}
                        onSuccess={(newDocument: any) => {
                            setUploadModalOpen(false);
                            const filePath = newDocument?.file_path;
                            if (filePath) {
                                onChange(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${filePath}`);
                            }
                        }}
                        documentName={placeholder.display_value || placeholder.name}
                        entityName={targetEntity?.name || targetEntity?.full_name}
                        entityId={uploadTarget.entityId}
                        selectedMember={{ id: uploadTarget.entityId, full_name: targetEntity?.name || targetEntity?.full_name, type: uploadTarget.isCompanyUpload ? 'company' : 'individual', name: targetEntity?.name || targetEntity?.full_name }}
                        selectedDocumentId={uploadTarget.documentId || undefined}
                        selectedDoc={uploadTarget.documentId ? { id: uploadTarget.documentId } : undefined}
                        targetTable={uploadTarget.targetTable}
                        idFieldName={uploadTarget.idFieldName}
                        documentIdFieldName="document_id"
                        isCompanyUpload={uploadTarget.isCompanyUpload}
                    />
                )}
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
                <SearchableSelect
                    value={options.find(o => o.label === value)?.value != null ? String(options.find(o => o.label === value)?.value) : String(value || '')}
                    onValueChange={(val) => {
                        const selected = options.find(o => String(o.value) === val);
                        onChange(selected ? selected.label : val);
                    }}
                    options={options.map(o => ({ ...o, value: String(o.value) }))}
                    placeholder="Select an option..."
                    buttonClassName={cn("w-full bg-white h-8 text-xs", hasChanged && canSave ? "border-amber-400 ring-2 ring-amber-50" : "")}
                />
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

export default function TemplateGenerationComponent({ task, isOpen, onClose, template, availableTemplates = [], documentName, masterFields, entityIdMap, sourceDataCache, extractedData = {}, personData = {}, companyData = {}, relationshipData = { directors: [], dependants: [], company: {}, principal: null, understudy: null }, onDraftDiscarded, jobLevel, activeEntityType, activeEntityId, refreshDocuments }) {
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
    const [docxPreviewBuffer, setDocxPreviewBuffer] = useState<ArrayBuffer | null>(null);
    const [loadedDraft, setLoadedDraft] = useState(null);
    const [isLoadingDraft, setIsLoadingDraft] = useState(false);
    const [dataConflicts, setDataConflicts] = useState([]);
    const [showConflictBanner, setShowConflictBanner] = useState(false);
    const togglePanel = (panel) => setPanelsVisible(prev => ({ ...prev, [panel]: !prev[panel] }));
    const [requirementJobQuestions, setRequirementJobQuestions] = useState<any[]>([]);
    const [computedFieldCache, setComputedFieldCache] = useState<Record<string, any>>({});
    const [documentTablesReady, setDocumentTablesReady] = useState(false);
    const [companyAssociates, setCompanyAssociates] = useState<any[]>([]);
    const [entityOverrides, setEntityOverrides] = useState<Record<string, string>>({});
    const companyIdForAssociates = entityIdMap?.company || relationshipData?.company?.id || task?.company_id;

    useEffect(() => {
        if (!companyIdForAssociates) { setCompanyAssociates([]); return; }
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from('registry_individuals')
                .select('id, full_name, kra_pin, contact_details, employment_data')
                .order('full_name', { ascending: true });
            if (error || cancelled) return;
            const scoped = (data || [])
                .map((ind: any) => {
                    const associations = (ind.employment_data?.associations || []).filter(
                        (a: any) => String(a.company_id) === String(companyIdForAssociates)
                    );
                    return associations.length > 0 ? { ...ind, associations } : null;
                })
                .filter(Boolean);
            if (!cancelled) setCompanyAssociates(scoped);
        })();
        return () => { cancelled = true; };
    }, [companyIdForAssociates]);
    const templateZipBuffer = useRef<ArrayBuffer | null>(null); // Store raw zip data for preview
    const loadedTemplateId = useRef<string | null>(null);

    const fetchTemplateBuffer = useCallback(async (templateId: string, filePath: string): Promise<ArrayBuffer | null> => {
        const buffer = await fetchTemplateBufferUtil(templateId, filePath, templateZipBuffer.current, loadedTemplateId.current);
        if (buffer) {
            templateZipBuffer.current = buffer;
            loadedTemplateId.current = templateId;
        }

        return buffer;
    }, []);

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
    }, [JSON.stringify(task?.job_level), isOpen]);

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

    useEffect(() => {
        if (selectedTemplate?.id && loadedTemplateId.current !== selectedTemplate.id) {
            docxTemplateBuffer.current = null;
            templateZipBuffer.current = null;
            loadedTemplateId.current = null;
            setDocxPreviewBuffer(null);
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

    const entitySelectionState = useMemo(() => {
        if (!selectedTemplate?.placeholders?.length || !companyAssociates.length) return null;

        const hasTaskParticipant = (normType: string) => {
            if (normType === 'principal') return !!(relationshipData?.principal);
            if (normType === 'sponsor') return !!(relationshipData?.sponsor);
            if (['dependant', 'spouse', 'child'].includes(normType)) return (relationshipData?.dependants?.length || 0) > 0;
            if (normType === 'director') return (relationshipData?.directors?.length || 0) > 0;
            return false;
        };

        const entityTypeMappings = {
            'signatory': ['director', 'shareholder', 'employee', 'hr', 'accountant', 'understudy', 'manager', 'executive'],
            'signer': ['director', 'shareholder', 'employee', 'hr', 'accountant', 'understudy', 'manager', 'executive'],
            'approver': ['director', 'shareholder', 'employee', 'hr', 'accountant', 'manager', 'executive'],
            'responsible_party': ['director', 'shareholder', 'employee', 'hr', 'accountant', 'manager', 'executive', 'authorising_signatory', 'representative'],
            'authorised_person': ['director', 'shareholder', 'employee', 'hr', 'accountant', 'manager', 'executive'],
            'witness': ['witness'],
            'authorising_signatory': ['director', 'shareholder', 'employee', 'hr', 'accountant', 'manager', 'executive'],
            'service_provider': ['employee', 'service_provider', 'consultant', 'advisor', 'specialist'],
            'regulatory_official': ['regulatory_official'],
            'advisor': ['advisor', 'consultant', 'representative'],
            'consultant': ['advisor', 'consultant', 'specialist'],
            'representative': ['employee', 'hr', 'authorising_signatory', 'representative'],
            'business_owner': ['business_owner', 'principal', 'shareholder'],
            'manager': ['manager', 'supervisor', 'lead', 'executive'],
            'executive': ['director', 'principal', 'hr', 'manager', 'executive'],
            'partner': ['partner', 'business_owner'],
            'understudy': ['understudy']
        };

        const entitySelectors: any[] = [];
        const seenEntityTypes = new Set<string>();
        selectedTemplate.placeholders.forEach((p: any) => {
            const entityType = Array.isArray(p.entity_type) ? p.entity_type[0] : p.entity_type;
            const normType = entityType?.toLowerCase()?.trim();
            if (!normType || normType === 'company') return;

            if (hasTaskParticipant(normType)) return;

            if (seenEntityTypes.has(normType)) return;
            seenEntityTypes.add(normType);

            const getResolvedEntityTypes = (normType: string): string[] => {
                return entityTypeMappings[normType.toLowerCase()] || [normType];
            };

            const entityTypes = getResolvedEntityTypes(normType);
            let allCandidates: any[] = [];
            const matchedEntityTypes: string[] = [];

            for (const et of entityTypes) {
                const candidates = getCompanyRegistryCandidates(et, companyAssociates);
                if (candidates.length > 0) {
                    allCandidates.push(...candidates);
                    matchedEntityTypes.push(et);
                }
            }

            const uniqueCandidates = allCandidates.filter((candidate, index, self) =>
                self.findIndex(c => c.id === candidate.id) === index
            );

            if (uniqueCandidates.length > 0) {
                const allEntityTypes = [...new Set(matchedEntityTypes)];
                const entitySelector = {
                    targetEntityType: normType,
                    allEntityTypes: allEntityTypes,
                    candidates: uniqueCandidates,
                    primaryEntityType: normType,
                    isMultiCandidate: uniqueCandidates.length > 1,
                    isSingleCandidate: uniqueCandidates.length === 1
                };

                entitySelectors.push(entitySelector);
            }
        });

        if (entitySelectors.length === 0) return null;

        const hasMultiCandidateSelectors = entitySelectors.some(selector => selector.isMultiCandidate);

        if (hasMultiCandidateSelectors) {
            return {
                hasMultiCandidateSelectors: true,
                selectors: entitySelectors.filter(s => s.isMultiCandidate),
                singletons: entitySelectors.filter(s => s.isSingleCandidate)
            };
        }

        return {
            hasMultiCandidateSelectors: false,
            selectors: [],
            singletons: entitySelectors
        };
    }, [selectedTemplate, companyAssociates, relationshipData]);

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

        const combinedCacheWithAdditional = { ...sourceDataCache, ...additionalCache };
        const targetEntity = getTargetEntity(placeholder, relationshipData, arrayIndex, sourceArray, entityIdMap, combinedCacheWithAdditional, extractedData, companyData, companyAssociates, entityOverrides);

        if (type === 'job') {
            const taskRecord = (combinedCacheWithAdditional['tm_tasks'] && Object.values(combinedCacheWithAdditional['tm_tasks'])[0]) || task;
            const answers = taskRecord?.job_specific_answers || {};
            const val = answers[String(id)] ?? answers[Number(id)];
            return isValidValue(val) ? String(val) : '';
        }

        if (type === 'db' && targetEntity) {
            const mf = masterFields.get(parseInt(id));
            if (!mf) return '';
            const tempPlaceholder = { ...placeholder, master_field_ids: [id] };
            const result = processTextField(tempPlaceholder, targetEntity, combinedCacheWithAdditional, masterFields, computedFieldCache);
            return result.value || '';
        }

        return '';
    }, [isOpen, selectedTemplate, relationshipData, entityIdMap, sourceDataCache, additionalCache, extractedData, companyData, task, masterFields]);

    const panelClasses = useMemo(() => {
        const { form, preview, source } = panelsVisible;
        const hasPreviewContent = isWordTemplate ? !!docxPreviewBuffer : (previewContent && previewContent.trim().length > 0);
        const effectivePreview = preview && (hasPreviewContent || isPreviewLoading);
        const effectiveSource = source && isWordTemplate;

        const count = [form, effectivePreview, effectiveSource].filter(Boolean).length;
        if (count === 3) return { form: 'col-span-3', preview: 'col-span-5', source: 'col-span-4' };
        if (count === 2) {
            if (!form) return { form: 'hidden', preview: 'col-span-7', source: 'col-span-5' };
            if (!effectivePreview) return { form: 'col-span-5', preview: 'hidden', source: 'col-span-7' };
            return { form: 'col-span-4', preview: 'col-span-8', source: 'hidden' };
        }
        if (count === 1) {
            return { form: form ? 'col-span-12' : 'hidden', preview: effectivePreview ? 'col-span-12' : 'hidden', source: effectiveSource ? 'col-span-12' : 'hidden' };
        }
        return { form: form ? 'col-span-12' : 'hidden', preview: 'hidden', source: 'hidden' };
    }, [panelsVisible, isWordTemplate, docxPreviewBuffer, previewContent, isPreviewLoading]);

    const getTargetConfig = useCallback(() => {
        const isCompany = activeEntityType === 'company';
        const id = activeEntityId;

        if (id === undefined || id === null || id === 'undefined') {
            console.error('[TemplateGenerationComponent] Fatal: No valid ID for draft operation', { activeEntityType, activeEntityId });
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
        if (!opts) return [];

        // Simple array of options
        if (Array.isArray(opts)) {
            return opts.map(o => typeof o === 'string' ? { label: o, value: o } : o);
        }

        // Object with nested options array (e.g. { options: [...] })
        if (Array.isArray(opts.options)) {
            return opts.options.map(o => typeof o === 'string' ? { label: o, value: o } : o);
        }

        // Dependent dropdown config
        if (opts.isDependencyConfig) {
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
        }

        return [];
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
                            computedFieldCache,
                            companyAssociates,
                            entityOverrides
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
    }, [isOpen, selectedTemplate?.id, JSON.stringify(entityIdMap)]);

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

    const refreshWithLiveData = useCallback((overridesOverride?: Record<string, string>) => {
        const activeOverrides = overridesOverride || entityOverrides;
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
                computedFieldCache,
                companyAssociates,
                activeOverrides
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
    }, [formData, groupedPlaceholders, relationshipData, combinedCache, masterFields, entityIdMap, extractedData, companyData, companyAssociates, entityOverrides]);

    const handleEntityOverrideChange = useCallback((entityType: string, selectedId: string) => {
        const nextOverrides = { ...entityOverrides, [entityType]: selectedId };
        setEntityOverrides(nextOverrides);
        refreshWithLiveData(nextOverrides);
    }, [entityOverrides, refreshWithLiveData]);

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

        // Company registry fallback candidates (director/shareholder/employee/etc. with no
        // matching task participant) also need their source-table data (e.g. signature docs)
        // fetched, same as any other target entity - see getTargetEntity's fallback branch.
        companyAssociates.forEach((ind: any) => ind.id && allIds.add(String(ind.id)));

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
    }, [isOpen, selectedTemplate?.id, JSON.stringify(entityIdMap), JSON.stringify(relationshipData), masterFields, companyAssociates]);

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
        JSON.stringify(entityIdMap),
        JSON.stringify(relationshipData),
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
    }, [isOpen, selectedTemplate?.id, fetchMissingDataSources]);

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
                    computedFieldCache,
                    companyAssociates,
                    entityOverrides
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
                    computedFieldCache,
                    companyAssociates,
                    entityOverrides
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
            return rowData;
        });

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
                                        if (mf?.type === 'select' || (mf?.options && (Array.isArray(mf.options) || Array.isArray(mf.options?.options) || mf.options?.isDependencyConfig))) resolvedOptions = getDependentDropdownOptions(child, mf, row);
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
                                            {/* Field label column */}
                                            <td className="px-3 py-2 font-medium text-slate-700 text-[11px] border-r border-slate-200 sticky left-0 bg-inherit z-10">
                                                {child.display_value || child.name.replace(/_/g, ' ')}
                                            </td>

                                            {/* One input cell per entity/row */}
                                            {rows.map((row, rowIdx) => {
                                                let resolvedOptions = [];
                                                if (child.master_field_ids?.length > 0) {
                                                    const mf = masterFields.get(parseInt(child.master_field_ids[0]));
                                                    if (mf?.type === 'select' || (mf?.options && (Array.isArray(mf.options) || Array.isArray(mf.options?.options) || mf.options?.isDependencyConfig))) resolvedOptions = getDependentDropdownOptions(child, mf, row);
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
                            const childFormatSuffix = child.format || '';
                            const childRegex = new RegExp(`\\{+\\s*%?\\s*${child.name}${childFormatSuffix ? '\\s*\\/\\s*' + childFormatSuffix : ''}\\s*\\}+`, 'g');

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

            const targetEntity = getTargetEntity(placeholder, relationshipData, arrayIndex, sourceArray, entityIdMap, combinedCache, extractedData, companyData, companyAssociates, entityOverrides);

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

            let { error: updateError } = await supabase
                .from(table)
                .update({ ...updatePayload, updated_at: new Date().toISOString() })
                .eq(linkVar, entId);

            if (updateError && updateError.code === 'PGRST204') {
                const failedCol = updateError.message?.match(/'(\w+)'/)?.[1];
                if (failedCol && failedCol in updatePayload) {
                    delete updatePayload[failedCol];
                    const retry = await supabase
                        .from(table)
                        .update({ ...updatePayload, updated_at: new Date().toISOString() })
                        .eq(linkVar, entId);
                    if (retry.error) throw retry.error;
                } else {
                    throw updateError;
                }
            } else if (updateError) {
                throw updateError;
            }
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
                computedFieldCache,
                companyAssociates,
                entityOverrides
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
                const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/templates/${selectedTemplate.file_path}`;
                const res = await fetch(publicUrl);

                if (!res.ok) {
                    throw new Error("Failed to fetch template source from storage");
                }

                templateBuffer = await res.arrayBuffer();
                docxTemplateBuffer.current = templateBuffer; // Cache it for next time
            }

            let storagePath = null;
            let fileType = 'application/pdf';
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

                const renderedDocxBuffer = doc.getZip().generate({ type: "arraybuffer" });

                const html2pdf = (await import('html2pdf.js')).default;
                const { default: mammoth } = await import('mammoth');

                const docxHtml = await mammoth.convertToHtml({ buffer: renderedDocxBuffer }).then(r => r.value);
                const element = document.createElement('div');
                element.innerHTML = docxHtml;
                element.className = 'bg-white';
                element.style.width = '800px';

                const pdfBlob = await html2pdf()
                    .set({
                        margin: 10,
                        html2canvas: { scale: 2, useCORS: true, logging: false },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
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
                file_type: fileType,
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

                    let publicUrl: string;
                    if (filePath.startsWith('kyc-templates/')) {
                        const { data, error } = await supabase.storage
                            .from('templates')
                            .createSignedUrl(filePath, 3600);
                        if (error || !data?.signedUrl) throw new Error('Could not create signed URL for template');
                        publicUrl = data.signedUrl;
                    } else {
                        publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/templates/${filePath}`;
                    }

                    const res = await fetch(publicUrl);
                    if (!res.ok) throw new Error(`Failed to fetch template: ${res.statusText}`);
                    templateBuffer = await res.arrayBuffer();
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
        <div className="flex flex-col h-full w-full bg-white relative">
            {/* Compact Header Bar */}
            <div className="px-4 py-2 border-b bg-gradient-to-r from-blue-50/80 to-indigo-50/80 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-500 rounded-md shadow-sm shrink-0">
                        <Wand2 className="h-3.5 w-3.5 text-white" />
                    </div>
                    <h2 className="text-sm font-bold text-slate-800 truncate max-w-[200px] shrink-0">{documentName}</h2>
                    {loadedDraft && (
                        <Badge variant="outline" className="text-[7px] bg-amber-50 text-amber-700 border-amber-200 shrink-0 px-1.5 py-0">
                            <FileText className="h-2.5 w-2.5 mr-0.5" />
                            DRAFT
                        </Badge>
                    )}
                    {isLoadingDraft && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                            <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                        </span>
                    )}
                    {/* Inline progress */}
                    <div className="flex items-center gap-2 ml-2 min-w-0 flex-1">
                        <span className="text-[10px] font-medium text-slate-500 whitespace-nowrap shrink-0">
                            {completionStats.filled}/{completionStats.total}
                        </span>
                        <Progress
                            value={completionStats.percentage}
                            className={`h-1 flex-1 min-w-[60px] max-w-[120px] ${loadedDraft ? '[&>div]:bg-amber-500' : ''}`}
                        />
                        <span className="text-[10px] font-medium text-slate-400 shrink-0">{completionStats.percentage}%</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={refineAllFieldsWithAI}
                            disabled={isGenerating}
                            className="h-7 text-[10px] border-purple-200 text-purple-700 hover:bg-purple-50 px-2"
                        >
                            <Sparkles className="h-3 w-3 mr-1" />
                            AI Refine
                        </Button>
                        {availableTemplates.length > 1 && (
                            <Select value={selectedTemplate?.id} onValueChange={handleTemplateSelect}>
                                <SelectTrigger className="w-44 h-7 text-[10px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableTemplates.map(t => (
                                        <SelectItem key={t.id} value={t.id} className="text-[10px]">{t.file_name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <div className="flex bg-slate-100 p-0.5 rounded-md">
                            <Button
                                variant={panelsVisible.form ? 'secondary' : 'ghost'}
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={() => togglePanel('form')}
                            >
                                <MousePointer2 className="h-2.5 w-2.5 mr-0.5" />
                                Fields
                            </Button>
                            <Button
                                variant={panelsVisible.preview ? 'secondary' : 'ghost'}
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={() => togglePanel('preview')}
                            >
                                <Layout className="h-2.5 w-2.5 mr-0.5" />
                                Preview
                            </Button>
                            <Button
                                variant={panelsVisible.source ? 'secondary' : 'ghost'}
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={() => togglePanel('source')}
                            >
                                <FileText className="h-2.5 w-2.5 mr-0.5" />
                                Source
                            </Button>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                {loadedDraft && (
                    <div className="flex items-center gap-2 mt-1 ml-6">
                        <span className="text-[10px] text-muted-foreground">
                            Saved {new Date(loadedDraft.created_at).toLocaleString()}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={discardDraft}
                            disabled={isLoadingDraft}
                            className="h-5 text-[9px] text-red-600 hover:text-red-700 hover:bg-red-50 px-1.5"
                        >
                            <X className="h-2.5 w-2.5 mr-0.5" />
                            Discard
                        </Button>
                    </div>
                )}
            </div>

            {showConflictBanner && dataConflicts.length > 0 && loadedDraft && (
                <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center gap-3 text-[10px]">
                    <svg className="h-3.5 w-3.5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="font-semibold text-amber-800 shrink-0">Data Changed:</span>
                    <span className="text-amber-700 truncate min-w-0">
                        {dataConflicts.slice(0, 2).map(c => c.field).join(', ')}
                        {dataConflicts.length > 2 && ` +${dataConflicts.length - 2} more`}
                    </span>
                    <div className="flex items-center gap-1 ml-auto shrink-0">
                        <Button size="sm" variant="default" onClick={refreshWithLiveData} className="h-5 text-[9px] bg-amber-600 hover:bg-amber-700 px-2">
                            Refresh
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowConflictBanner(false)} className="h-5 text-[9px] text-amber-700 hover:bg-amber-100 px-2">
                            Keep Draft
                        </Button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-hidden grid grid-cols-12 gap-0">
                <ScrollArea className={`${panelClasses.form} border-r bg-white`}>
                    <div className="p-6 space-y-8">
                        {/* Entity Override Selectors */}
                        {entitySelectionState?.hasMultiCandidateSelectors && entitySelectionState.selectors.length > 0 && (
                            <div className="space-y-4">
                                <h4 className="flex items-center gap-2 font-black text-amber-600 text-[10px] tracking-widest uppercase border-b pb-2">
                                    <Users className="h-3 w-3" /> Auto-Selected Signatories &amp; Roles
                                </h4>
                                <p className="text-[11px] text-slate-500 -mt-2">
                                    Multiple people found for these roles. The first match was auto-selected. Click to change.
                                </p>
                                <div className="grid grid-cols-1 gap-y-3">
                                    {entitySelectionState.selectors.map((selector) => {
                                        const currentOverrideId = entityOverrides[selector.targetEntityType];
                                        const selectedId = currentOverrideId || selector.candidates[0]?.id;
                                        const selectedCandidate = selector.candidates.find(c => String(c.id) === String(selectedId)) || selector.candidates[0];
                                        const isAutoSelected = !currentOverrideId;

                                        return (
                                            <div key={selector.targetEntityType} className="flex flex-row items-center gap-6 p-3 rounded-lg border border-amber-200 bg-amber-50/40">
                                                <div className="w-1/3 flex flex-col">
                                                    <Label className="font-bold text-slate-700 text-xs uppercase tracking-tight">
                                                        {selector.targetEntityType.replace(/_/g, ' ')}
                                                    </Label>
                                                    <span className="text-[10px] text-slate-400 mt-0.5">
                                                        {selector.candidates.length} candidate{selector.candidates.length !== 1 ? 's' : ''}
                                                    </span>
                                                </div>
                                                <div className="flex-1 flex items-center gap-2">
                                                    <SearchableSelect
                                                        value={String(selectedId)}
                                                        onValueChange={(val) => handleEntityOverrideChange(selector.targetEntityType, val)}
                                                        options={selector.candidates.map((c: any) => ({
                                                            label: c.full_name || `Individual #${c.id}`,
                                                            value: String(c.id),
                                                        }))}
                                                        placeholder="Select a person..."
                                                        buttonClassName="h-8 text-xs bg-white"
                                                    />
                                                    {isAutoSelected && (
                                                        <Badge variant="outline" className="text-[8px] h-5 px-1.5 bg-blue-50 text-blue-600 border-blue-200 shrink-0 whitespace-nowrap">
                                                            <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Auto
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

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
                                        if (mf?.type === 'select' || (mf?.options && (Array.isArray(mf.options) || Array.isArray(mf.options?.options) || mf.options?.isDependencyConfig))) {
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
                                                    targetEntity={p.type === 'image' ? getTargetEntity(p, relationshipData, null, null, entityIdMap, combinedCache, extractedData, companyData, companyAssociates, entityOverrides) : undefined}
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

                <PreviewPanel
                    previewContent={previewContent}
                    isPreviewLoading={isPreviewLoading}
                    panelClasses={cn(panelClasses.preview, "bg-slate-100/30 dark:bg-slate-900/30 backdrop-blur-sm")}
                    EDITOR_PREVIEW_STYLES={EDITOR_PREVIEW_STYLES}
                    isWordTemplate={isWordTemplate}
                    docxBuffer={docxPreviewBuffer}
                />

                {/* RIGHT PANEL: Original Template Reference - only visible for Word templates */}
                {isWordTemplate && (
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
                )}
            </div>
            <div className="border-t px-6 py-3 bg-white flex justify-between flex-shrink-0">
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
            </div>
        </div>
    );
}