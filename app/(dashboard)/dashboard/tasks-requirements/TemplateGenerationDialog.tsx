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
    Loader2, Wand2, Expand, CheckCircle2, X, Image as ImageIcon
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { saveAs } from 'file-saver';

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
    return (formatStr || 'YYYY-MM-DD').replace('YYYY', year).replace('MM', month).replace('DD', day);
};

const base64Parser = (dataURL) => {
    console.log('[base64Parser] Input type:', typeof dataURL, 'starts with:', String(dataURL).substring(0, 30));
    if (typeof dataURL !== 'string') {
        console.log('[base64Parser] ❌ Invalid - not a string');
        return null;
    }
    const regex = /^data:image\/(png|jpeg|jpg);base64,/;
    if (!regex.test(dataURL)) {
        console.log('[base64Parser] ❌ Invalid format - regex failed');
        return false;
    }
    const base64 = dataURL.replace(regex, "");
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) { bytes[i] = binaryStr.charCodeAt(i); }
    console.log('[base64Parser] ✅ Success, buffer size:', bytes.buffer.byteLength);
    return bytes.buffer;
};

const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
        console.log('[toBase64] ✅ Conversion complete, length:', reader.result?.length);
        resolve(reader.result);
    };
    reader.onerror = error => {
        console.error('[toBase64] ❌ Failed:', error);
        reject(error);
    };
});

const fetchImageAsBase64 = async (url) => {
    console.log('[fetchImageAsBase64] 📥 Fetching:', url);
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) {
            console.error('[fetchImageAsBase64] ❌ HTTP error:', response.status);
            return null;
        }
        const blob = await response.blob();
        console.log('[fetchImageAsBase64] ✅ Blob received:', blob.type, blob.size, 'bytes');
        const base64 = await toBase64(blob);
        console.log('[fetchImageAsBase64] ✅ Converted to base64, length:', base64?.length);
        return base64;
    } catch (error) {
        console.error('[fetchImageAsBase64] ❌ Error:', error);
        return null;
    }
};

const parseJsonValue = (data, path) => {
    if (!path || !data) return '';
    try {
        let currentValue = data;

        // Clean the path: remove single quotes often found in Postgres JSON paths
        // e.g., "details->>'code'" becomes "details->>code"
        const cleanPath = path.replace(/'/g, '');
        const parts = cleanPath.split(/->>|->/);

        for (let i = 0; i < parts.length; i++) {
            const key = parts[i].trim();
            if (!key) continue;

            // If we are at a level that has a 'current' property (standard registry structure), 
            // and the key we are looking for is NOT 'current', automatically move into 'current'.
            if (currentValue && currentValue.current !== undefined && key !== 'current') {
                currentValue = currentValue.current;
            }

            // Handle Array access if the data is an array
            if (Array.isArray(currentValue)) {
                currentValue = currentValue[0]; // Default to first item
            }

            if (currentValue && typeof currentValue === 'object') {
                if (currentValue[key] !== undefined) {
                    currentValue = currentValue[key];
                } else {
                    // Case-insensitive fallback
                    const lowerKey = key.toLowerCase();
                    const foundKey = Object.keys(currentValue).find(k => k.toLowerCase() === lowerKey);
                    currentValue = foundKey ? currentValue[foundKey] : undefined;
                }
            } else if (i < parts.length - 1) {
                // We have more path to go but no more object
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

const ImagePlaceholderControls = ({ styles, onStyleChange }) => {
    const sizeMap = { small: '25%', medium: '50%', large: '75%', 'full-width': '100%' };
    const currentSizeKey = Object.keys(sizeMap).find(key => sizeMap[key] === styles.maxWidth) || 'full-width';
    return (
        <div className="space-y-3 pt-2 border-t mt-2">
            <div className="flex items-center gap-2">
                <ToggleGroup type="single" value={styles.textAlign || 'center'} onValueChange={(align) => align && onStyleChange('textAlign', align)} className="bg-background rounded-md border h-8">
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
                    <Input type="number" min="50" max="600" value={styles.imageWidth || 300} onChange={(e) => onStyleChange('imageWidth', parseInt(e.target.value) || 300)} className="h-7 text-xs" />
                </div>
                <div>
                    <Label className="text-[10px]">Height (px)</Label>
                    <Input type="number" min="50" max="600" value={styles.imageHeight || 200} onChange={(e) => onStyleChange('imageHeight', parseInt(e.target.value) || 200)} className="h-7 text-xs" />
                </div>
            </div>
        </div>
    );
};

const resolveArrayData = (blockPlaceholder, allPlaceholders, sourceDataCache, masterFields, entityIdMap) => {
    const entityType = blockPlaceholder.entity_type || 'director'; 
    const blockName = blockPlaceholder.name; 
    const isPrimaryOnly = blockPlaceholder.director_type === 'primary';
    
    let sourceArray = [];
    
    // 1. Find the raw data array (Existing Logic)
    const potentialPaths = [`${entityType}s_details`, `${entityType}_details`, blockName, 'directors', 'contacts'];
    
    Object.entries(sourceDataCache).forEach(([key, tableData]) => {
        if (!tableData) return;
        const records = Array.isArray(tableData) ? tableData : Object.values(tableData);
        for (const record of records) {
            for (const path of potentialPaths) {
                if (record[path] && Array.isArray(record[path])) {
                    sourceArray = isPrimaryOnly 
                        ? record[path].filter(item => item?.is_primary === true || item?.is_primary === 'true')
                        : record[path];
                    break;
                }
            }
            if (sourceArray.length > 0) break;
        }
    });

    if (sourceArray.length === 0) return [];

    // 2. Filter child fields
    const childFields = allPlaceholders.filter(p => 
        (p.parent_name === blockName || (p.description && p.description.toLowerCase().includes(blockName.toLowerCase()))) 
        && p.id !== blockPlaceholder.id 
    );
    
    return sourceArray.map((item) => {
        const rowData = {};
        const individualId = item.id || item.director_id || item.individual_id;
        
        childFields.forEach(field => {
            let val = '';
            const isImage = field.name.startsWith('%') || field.type === 'image';

            // --- IMAGE RESOLUTION LOGIC ---
            if (isImage && individualId) {
                const mIds = field.master_field_ids || [];
                for (const mId of mIds) {
                    const mf = masterFields.get(parseInt(mId));
                    if (!mf?.sources) continue;

                    // Find which KYC document ID this master field expects
                    const requiredKycIds = mf.sources
                        .filter(s => s.document_id)
                        .flatMap(s => Array.isArray(s.document_id) ? s.document_id : [s.document_id]);

                    if (requiredKycIds.length > 0) {
                        // Look in acc_portal_directors_documents (individual docs) 
                        // or acc_portal_kyc_uploads (company docs)
                        const allDocs = [
                            ...(Object.values(sourceDataCache['acc_portal_directors_documents'] || {})),
                            ...(Object.values(sourceDataCache['acc_portal_kyc_uploads'] || {}))
                        ];

                        const matchingDoc = allDocs.find(doc => {
                            const docKycId = doc.kyc_document_id || doc.document_id;
                            const docOwnerId = doc.director_id || doc.individual_id || doc.company_id;
                            
                            return requiredKycIds.includes(docKycId) && 
                                   String(docOwnerId) === String(individualId);
                        });

                        if (matchingDoc?.file_path) {
                            val = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${matchingDoc.file_path}`;
                            break;
                        }
                    }
                }
            } 
            // --- TEXT RESOLUTION LOGIC (Existing) ---
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
                    if (item[field.name] !== undefined) val = item[field.name];
                    else {
                        const matchingKey = Object.keys(item).find(k => k.toLowerCase() === fieldName);
                        if (matchingKey) val = item[matchingKey];
                        else if (fieldName.includes('name')) val = item.full_name || item.name || item.director_name || '';
                        else if (fieldName.includes('role')) val = item.role || (Array.isArray(item.roles) ? item.roles.join(', ') : '');
                    }
                }
            }

            rowData[field.name] = val || '';
        });
        return rowData;
    });
};

const findPrimaryDirector = (sourceDataCache) => {
    const potentialPaths = ['directors_details', 'director_details', 'directors', 'registry_individuals'];
    
    for (const key of Object.keys(sourceDataCache)) {
        const tableData = sourceDataCache[key];
        if (!tableData) continue;
        
        const records = Array.isArray(tableData) ? tableData : Object.values(tableData);
        
        for (const record of records) {
            // Check if the record itself is the primary director
            if (record.is_primary === true || record.is_primary === 'true') {
                return record;
            }
            
            // Check if the record contains a nested array of directors (common in company objects)
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
export default function TemplateGenerationDialog({
    isOpen, onClose, template, availableTemplates = [], documentName, masterFields,
    entityIdMap, sourceDataCache, extractedData = {}, personData = {}, companyData = {},
}) {
    const { toast } = useToast();
    const [formData, setFormData] = useState({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [docPreviewUrl, setDocPreviewUrl] = useState(null);
    const [autoPopulatedFields, setAutoPopulatedFields] = useState(new Map());
    const [manuallyEditedFields, setManuallyEditedFields] = useState(new Set());
    const [selectedTemplate, setSelectedTemplate] = useState(template);
    const [uploadedFiles, setUploadedFiles] = useState({});
    const [imageStyles, setImageStyles] = useState({});

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

    useEffect(() => {
        if (isOpen && selectedTemplate && Object.keys(sourceDataCache).length > 0) {
            console.log('[Init] Resolving template data with cache:', sourceDataCache);
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
                    sourceDataCache, 
                    masterFields, 
                    entityIdMap
                );
                
                console.log(`[Init] Resolved Block: ${blockName}`, resolvedRows);
                
                // Ensure we have an array with at least one empty object if no data
                if (resolvedRows.length === 0 && blockName === 'directors') {
                    // For directors, we want to show the rows even if they're empty
                    initData[blockName] = [{}];
                    console.log(`[Init] Initialized empty directors array`);
                } else {
                    initData[blockName] = resolvedRows;
                }
                
                if (resolvedRows.length > 0) {
                    autoMap.set(blockName, 'Entity Details Array');
                    console.log(`[Init] Set ${blockName} in formData with ${resolvedRows.length} rows`, resolvedRows);
                }
            });

            console.log('[Init] Setting initial form data:', initData);
            setFormData(initData);
            setAutoPopulatedFields(autoMap);
            
            // Force update the preview after a short delay to ensure formData is set
            setTimeout(() => {
                if (docxTemplateBuffer.current) {
                    updateWordPreview(initData, imageStyles);
                } else {
                    setPreviewContent(populateHtmlContent(initData, selectedTemplate.placeholders || [], imageStyles));
                }
            }, 100);
        }
    }, [isOpen, selectedTemplate?.id, groupedPlaceholders, sourceDataCache]);

    // Update handleInputChange to handle array updates
    const handleArrayInputChange = (blockName, index, fieldName, value) => {
        setFormData(prev => {
            // Create a new array with the updated value
            const updatedArray = [...(prev[blockName] || [])];
            
            // Ensure we have an object at this index
            if (!updatedArray[index]) {
                updatedArray[index] = {};
            }
            
            // Update the specific field
            updatedArray[index] = {
                ...updatedArray[index],
                [fieldName]: value
            };
            
            // Create the new state
            const newState = {
                ...prev,
                [blockName]: updatedArray
            };
            
            // Log the update for debugging
            console.log(`[handleArrayInputChange] Updated ${blockName}[${index}].${fieldName}`, {
                value,
                newState
            });
            
            // Trigger preview update
            if (docxTemplateBuffer.current) {
                updateWordPreview(newState, imageStyles);
            } else {
                setPreviewContent(populateHtmlContent(newState, selectedTemplate?.placeholders || [], imageStyles));
            }
            
            return newState;
        });
    };

    // UI: Render Array Inputs
    const renderArrayInputs = (blockName, blockData) => {
        const rows = formData[blockName] || [];
        console.log(`[renderArrayInputs] Rendering ${blockName} with ${rows.length} rows`, rows);
        
        return (
            <div className="space-y-4 mt-2 border-l-2 border-blue-200 pl-4 py-2 bg-blue-50/20 rounded-r-lg">
                <div className="flex items-center justify-between px-1">
                    <Badge className="bg-blue-600 uppercase text-[9px] tracking-tighter">{blockName}</Badge>
                    <Button 
                        variant="ghost" 
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
                    <div className="text-xs text-muted-foreground italic p-2">
                        No {blockName} found. Click "ADD ROW" to add one.
                    </div>
                ) : (
                    rows.map((row, idx) => (
                        <div key={idx} className="p-3 bg-white border rounded shadow-sm relative group mb-2">
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-white border shadow-sm text-red-500 hover:bg-red-50" 
                                onClick={() => {
                                    const newRows = rows.filter((_, i) => i !== idx);
                                    setFormData(prev => ({ ...prev, [blockName]: newRows }));
                                }}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                            
                            <div className="space-y-3">
                                {blockData.children.map(child => {
                                    // Special handling for director_name field
                                    const fieldName = child.name.toLowerCase();
                                    let fieldValue = '';
                                    
                                    // Try different possible field names to find the value
                                    if (row[child.name]) {
                                        fieldValue = row[child.name];
                                    } else if (row[fieldName]) {
                                        fieldValue = row[fieldName];
                                    } else if (fieldName.includes('name') && row.director_name) {
                                        fieldValue = row.director_name;
                                    } else if (fieldName.includes('position') && row.position) {
                                        fieldValue = row.position;
                                    } else if (fieldName.includes('role') && row.role) {
                                        fieldValue = row.role;
                                    }
                                    
                                    return (
                                        <div key={child.id}>
                                            <Label className="text-[9px] font-bold text-slate-400 uppercase">
                                                {child.name}
                                            </Label>
                                            <Input 
                                                value={fieldValue || ''} 
                                                onChange={(e) => handleArrayInputChange(blockName, idx, child.name, e.target.value)}
                                                className="h-7 text-xs border-slate-100 focus:border-blue-200"
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
        if (!selectedTemplate?.content) return '';
        let content = selectedTemplate.content;

        // Handle Array Blocks first
        Object.keys(groupedPlaceholders.blocks).forEach(blockName => {
            const blockRegex = new RegExp(`\\{#${blockName}\\}([\\s\\S]*?)\\{/${blockName}\\}`, 'g');
            const rows = data[blockName] || [];
            
            content = content.replace(blockRegex, (_, innerTemplate) => {
                return rows.map(row => {
                    let rowHtml = innerTemplate;
                    groupedPlaceholders.blocks[blockName].children.forEach(child => {
                        const val = row[child.name] || `[${child.name}]`;
                        rowHtml = rowHtml.replace(new RegExp(`\\{${child.name}\\}`, 'g'), val);
                    });
                    return rowHtml;
                }).join('');
            });
        });

        // Handle remaining Top Level placeholders
        groupedPlaceholders.topLevel.forEach(placeholder => {
            const value = data[placeholder.name];
            const regex = new RegExp(`\\{{1,2}${placeholder.name}\\}{1,2}`, 'g');
            if (value && String(value).trim() !== '') {
              // Inside populateHtmlContent
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
    }, [selectedTemplate]);

    const prepareRenderData = useCallback(async (data) => {
        const renderData = {};
        const imagePromises = [];

        // 1. Add Arrays (Blocks) - e.g., directors: [...]
        Object.keys(groupedPlaceholders.blocks).forEach(blockName => {
            renderData[blockName] = data[blockName] || [];
        });

        // 2. Add Top-Level Fields ONLY
        (selectedTemplate.placeholders || []).forEach(p => {
            // CRITICAL: If the field is inside a block, SKIP it. 
            // It will be handled by the array added in step 1.
            const isChild = p.parent_name || (p.description && p.description.toLowerCase().includes('inside'));
            if (isChild || p.is_block_start) return;

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
            console.log('\n=== [updateWordPreview] START ===');
            setIsPreviewLoading(true);
            const zip = new PizZip(docxTemplateBuffer.current);
            const renderData = {};

            const imagePromises = [];
            (selectedTemplate.placeholders || []).forEach(p => {
                let val = data[p.name];
                let key = p.name.replace(/^\{+/, '').replace(/\}+$/, '').replace(/^%/, '').replace(/^#/, '');

                console.log(`\n[Placeholder: ${key}]`);
                console.log('  Type:', p.type);
                console.log('  Value type:', typeof val);
                console.log('  Value preview:', String(val).substring(0, 50));

                if (p.type === 'image' && val) {
                    if (val.startsWith('data:image')) {
                        console.log('  ✅ Base64 image');
                        renderData[key] = val;
                    } else if (val.startsWith('http')) {
                        console.log('  📥 Remote image - queuing fetch');
                        imagePromises.push(
                            fetchImageAsBase64(val).then(base64 => {
                                renderData[key] = base64;
                                console.log(`  ✅ Fetched ${key}`);
                            })
                        );
                    } else {
                        console.log('  ❌ Unknown format');
                        renderData[key] = null;
                    }
                } else if (p.type === 'image') {
                    console.log('  ⚪ No value');
                    renderData[key] = null;
                } else {
                    renderData[key] = val || `[${p.name}]`;
                }
            });

            console.log(`\n[Waiting for ${imagePromises.length} image(s)...]`);
            await Promise.all(imagePromises);
            console.log('✅ All images ready');
            console.log('RenderData keys:', Object.keys(renderData));

            const imageModule = new ImageModule({
                centered: false,
                getImage: (tag) => {
                    console.log('[ImageModule.getImage] Called');
                    return base64Parser(tag);
                },
                getSize: (img, tag, name) => {
                    const s = styles[name] || styles[`{%${name}}`];
                    const size = s ? [s.imageWidth || 300, s.imageHeight || 200] : [300, 200];
                    console.log('[ImageModule.getSize]', name, '→', size);
                    return size;
                },
            });

            const doc = new Docxtemplater(zip, {
                modules: [imageModule],
                paragraphLoop: true,
                linebreaks: true,
                nullGetter: () => ""
            });

            console.log('\n[Rendering document...]');
            doc.setData(renderData);
            doc.render();
            const out = doc.getZip().generate({ type: "arraybuffer" });
            console.log('✅ Document generated, size:', out.byteLength, 'bytes');

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
            console.log('✅ Mammoth HTML conversion complete');
            console.log('=== [updateWordPreview] END ===\n');
            setPreviewContent(result.value);
        } catch (err) {
            console.error("❌ [updateWordPreview] Error:", err);
            toast({ title: "Preview Error", description: err.message, variant: "destructive" });
        } finally {
            setIsPreviewLoading(false);
        }
    }, [selectedTemplate, toast]);

    // Update preview when form data or template changes
    useEffect(() => {
        if (!isOpen) return;
        
        const updatePreview = async () => {
            const current = availableTemplates.find(t => t.id === selectedTemplate?.id) || availableTemplates[0] || template;
            
            if (current?.file_path && current?.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                if (!docxTemplateBuffer.current) {
                    setIsPreviewLoading(true);
                    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/templates/${current.file_path}`;
                    console.log('[Template Load] Fetching:', publicUrl);

                    setDocPreviewUrl(`https://docs.google.com/viewer?url=${encodeURIComponent(publicUrl)}&embedded=true`);

                    try {
                        const res = await fetch(publicUrl);
                        docxTemplateBuffer.current = await res.arrayBuffer();
                        console.log('[Template Load] ✅ Loaded, size:', docxTemplateBuffer.current.byteLength);
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

    // Add these at the top of your component state declarations
const [additionalCache, setAdditionalCache] = useState({});
const [fetchingTables, setFetchingTables] = useState(new Set());

// Function to fetch missing tables dynamically
const fetchMissingTable = useCallback(async (tableName) => {
    if (fetchingTables.has(tableName) || sourceDataCache[tableName] || additionalCache[tableName]) return;

    setFetchingTables(prev => new Set(prev).add(tableName));
    console.log(`[Dynamic Fetch] 📡 Fetching missing table: ${tableName}`);

    try {
        // Construct query - we filter by company_id or director_id if possible to keep it efficient
        // We use the entityIdMap to know which records to fetch
        const companyId = entityIdMap.company;
        const directorId = entityIdMap.director || entityIdMap.principal;

        let query = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${tableName}?select=*`;
        
        // Add basic filters based on common column names to avoid fetching entire tables
        if (tableName.includes('director')) {
            if (directorId) query += `&director_id=eq.${directorId}`;
        } else if (tableName.includes('kyc') || tableName.includes('company')) {
            if (companyId) query += `&company_id=eq.${companyId}`;
        }

        const response = await fetch(query, {
            headers: {
                'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
            }
        });

        if (!response.ok) throw new Error(`Failed to fetch ${tableName}`);
        
        const data = await response.json();
        console.log(`[Dynamic Fetch] ✅ received ${data.length} rows for ${tableName}`);

        setAdditionalCache(prev => ({
            ...prev,
            [tableName]: data.reduce((acc, row) => ({ ...acc, [row.id || row.director_id]: row }), {})
        }));
    } catch (err) {
        console.error(`[Dynamic Fetch] ❌ Error fetching ${tableName}:`, err);
    } finally {
        setFetchingTables(prev => {
            const next = new Set(prev);
            next.delete(tableName);
            return next;
        });
    }
}, [entityIdMap, sourceDataCache, additionalCache, fetchingTables]);

// Effect to scan for missing tables whenever the template or cache changes
useEffect(() => {
    if (!isOpen || !selectedTemplate || !masterFields) return;

    selectedTemplate.placeholders?.forEach(p => {
        const ids = p.master_field_ids || [];
        ids.forEach(mId => {
            const mf = masterFields.get(parseInt(mId));
            mf?.sources?.forEach(source => {
                if (source.table && !sourceDataCache[source.table] && !additionalCache[source.table]) {
                    fetchMissingTable(source.table);
                }
            });
        });
    });
}, [isOpen, selectedTemplate, masterFields, sourceDataCache, additionalCache, fetchMissingTable]);

const getPlaceholderValue = useCallback((placeholder) => {
    const ids = placeholder.master_field_ids || [];
    if (ids.length === 0 || !masterFields) return { value: '', source: null };

    // Combine the base cache with the dynamically fetched cache
    const combinedCache = { ...sourceDataCache, ...additionalCache };

    const isImageType = placeholder.type === 'image' || placeholder.name.startsWith('%');
    const isPrimaryDirectorReq = placeholder.director_type === 'primary';

    // --- RESOLVE TARGET ID ---
    let targetId = entityIdMap[placeholder.entity_type || 'company'];
    let primaryDirector = null;

    if (isPrimaryDirectorReq) {
        primaryDirector = findPrimaryDirector(combinedCache); // Use combined cache here too
        if (primaryDirector) {
            targetId = primaryDirector.id || primaryDirector.director_id || primaryDirector.individual_id;
        } else {
            return { value: '', source: null };
        }
    }

    for (const id of ids) {
        const masterField = masterFields.get(parseInt(id, 10));
        if (!masterField || !masterField.sources) continue;

        for (const source of masterField.sources) {
            const tableName = source.table || (isPrimaryDirectorReq ? 'acc_portal_directors_documents' : 'acc_portal_kyc_uploads');
            const tableData = combinedCache[tableName]; // Look in combined cache

            if (!tableData) {
                // If table is still missing, the useEffect above will trigger a fetch
                // This call will return empty for now, but will re-run once additionalCache updates
                continue; 
            }

            if (isImageType) {
                const linkingVar = source.linking_variable || (isPrimaryDirectorReq ? 'director_id' : 'company_id');
                const requiredDocIds = Array.isArray(source.document_id) ? source.document_id : [source.document_id];

                const docs = Object.values(tableData);
                const foundDoc = docs.find(d => {
                    const docKycId = d.kyc_document_id || d.document_id;
                    const docOwnerId = d[linkingVar] || d.director_id || d.individual_id || d.company_id;
                    return String(docOwnerId) === String(targetId) && requiredDocIds.includes(docKycId);
                });

                if (foundDoc?.file_path) {
                    return {
                        value: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${foundDoc.file_path}`,
                        source: `${isPrimaryDirectorReq ? 'Primary ' : ''}${masterField.label}`
                    };
                }
            } else {
                // Text resolution...
                const records = Object.values(tableData);
                const record = records.find(r => String(r[source.linking_variable || 'id']) === String(targetId));
                if (record) {
                    const val = parseJsonValue(record, source.path);
                    if (val) return { value: val, source: masterField.label };
                }
            }
        }
    }
    return { value: '', source: null };
}, [masterFields, entityIdMap, sourceDataCache, additionalCache]); // Added additionalCache to deps

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

    const handleInputChange = (name, val) => {
        setFormData(prev => {
            const next = { ...prev, [name]: val };
            if (docxTemplateBuffer.current) updateWordPreview(next, imageStyles);
            else setPreviewContent(populateHtmlContent(next, selectedTemplate?.placeholders || [], imageStyles));
            return next;
        });
        if (!manuallyEditedFields.has(name)) setManuallyEditedFields(prev => new Set(prev).add(name));
    };

    const handleFileChange = (name, e) => {
        const file = e.target.files[0];
        if (file) {
            console.log('[File Upload]', file.name, file.type, file.size, 'bytes');
            setUploadedFiles(prev => ({ ...prev, [name]: file }));
            const reader = new FileReader();
            reader.onloadend = () => handleInputChange(name, reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleImageStyleChange = (name, key, value) => {
        setImageStyles(prev => {
            const next = { ...prev, [name]: { ...(prev[name] || {}), [key]: value } };
            if (docxTemplateBuffer.current) updateWordPreview(formData, next);
            else setPreviewContent(populateHtmlContent(formData, selectedTemplate?.placeholders || [], next));
            return next;
        });
    };

    useEffect(() => {
        if (isOpen && selectedTemplate) {
            const initData = {}, initStyles = {}, autoMap = new Map();
            (selectedTemplate.placeholders || []).forEach(p => {
                let match = getPlaceholderValue(p);
                if (!match.value) match = smartFieldMatch(p.name);
                initData[p.name] = match.value || '';
                if (match.value) autoMap.set(p.name, match.source);
                if (p.type === 'image') initStyles[p.name] = { maxWidth: '100%', textAlign: 'center', imageWidth: p.imageConfig?.width || 300, imageHeight: p.imageConfig?.height || 200 };
            });
            setFormData(initData); setAutoPopulatedFields(autoMap); setImageStyles(initStyles);
        }
    }, [isOpen, selectedTemplate?.id]);

    const completionStats = useMemo(() => {
        const placeholders = selectedTemplate?.placeholders || [];
        const filled = placeholders.filter(p => formData[p.name] && String(formData[p.name]).trim() !== '').length;
        return { total: placeholders.length, filled, percentage: placeholders.length ? Math.round((filled / placeholders.length) * 100) : 0 };
    }, [formData, selectedTemplate]);

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
                    saveAs(blob, fileName);
                    toast({ title: "Success", description: `Document downloaded as ${fileName}` });
                } else {
                    // PDF logic remains the same (converts current previewContent to PDF)
                    const html2pdf = (await import('html2pdf.js')).default;
                    const element = document.createElement('div');
                    element.innerHTML = previewContent;
                    element.className = EDITOR_PREVIEW_STYLES + ' p-10 bg-white';
                    element.style.width = '800px';
                    await html2pdf().set({
                        margin: 10,
                        filename: fileName,
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
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[98vw] w-full h-[95vh] flex flex-col p-0">
                <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500 rounded-lg"><Wand2 className="h-5 w-5 text-white" /></div>
                            <div>
                                <DialogTitle className="text-xl font-bold">{documentName}</DialogTitle>
                                <DialogDescription className="text-sm">Auto-populate and generate</DialogDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {availableTemplates.length > 1 && (
                                <Select value={selectedTemplate?.id} onValueChange={(v) => setSelectedTemplate(availableTemplates.find(t => t.id === v))}>
                                    <SelectTrigger className="w-64 h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>{availableTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.file_name}</SelectItem>)}</SelectContent>
                                </Select>
                            )}
                            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
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
                            {/* Top Level Fields */}
                       {/* Inside the sidebar ScrollArea */}
<div className="space-y-4">
    <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">General Fields</Label>
    {groupedPlaceholders.topLevel.map(p => (
        <div key={p.id} className="space-y-2 p-3 border rounded-lg bg-slate-50/50">
            <div className="flex justify-between items-center">
                <Label className="font-semibold uppercase text-[11px]">{p.name.replace(/_/g, ' ')}</Label>
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
                                <Button size="sm" variant="secondary" className="h-7 text-[10px]" onClick={() => document.getElementById(`file-${p.id}`).click()}>
                                    Replace
                                </Button>
                                <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => handleInputChange(p.name, '')}>
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
                    
                    {/* Size and Alignment Controls */}
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

                            {/* Array Blocks */}
                            <div className="space-y-4 pt-4 border-t">
                                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Repeating Sections</Label>
                                {Object.keys(groupedPlaceholders.blocks).map(blockName => (
                                    <div key={blockName}>
                                        {renderArrayInputs(blockName, groupedPlaceholders.blocks[blockName])}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </ScrollArea>

                    <div className="col-span-5 border-r relative bg-slate-100 overflow-y-auto">
                        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur px-4 py-2 border-b flex justify-between">
                            <span className="text-[10px] font-bold text-slate-500">LIVE PREVIEW</span>
                            {isPreviewLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                        </div>
                        <div className="p-8">
                            <div className={`bg-white shadow-xl p-12 min-h-[11in] ${EDITOR_PREVIEW_STYLES}`} dangerouslySetInnerHTML={{ __html: previewContent }} />
                        </div>
                    </div>

                    {isWordTemplate ? (
                        <div className="col-span-4 bg-slate-50 overflow-y-auto">
                            <div className="sticky top-0 z-10 bg-white/90 backdrop-blur px-4 py-2 border-b">
                                <span className="text-[10px] font-bold text-slate-500">ORIGINAL TEMPLATE</span>
                            </div>
                            <div className="p-4">
                                {docPreviewUrl ? (
                                    <iframe src={docPreviewUrl} className="w-full h-[calc(100vh-200px)] border-0 rounded shadow" title="Original" onError={() => setDocPreviewUrl(null)} />
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
                                    {isGenerating ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                                    Download
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => generateAndDownload('word')}><FileText className="h-4 w-4 mr-2 text-blue-600" />Word</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => generateAndDownload('pdf')}><FileText className="h-4 w-4 mr-2 text-red-600" />PDF</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}