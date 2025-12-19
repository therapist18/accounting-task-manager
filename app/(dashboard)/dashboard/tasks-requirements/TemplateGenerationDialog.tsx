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

    const populateHtmlContent = useCallback((data, placeholders, styles) => {
        if (!selectedTemplate?.content) return '';
        let content = selectedTemplate.content;
        placeholders.forEach(placeholder => {
            const value = data[placeholder.name];
            const regex = new RegExp(`\\{{1,2}${placeholder.name}\\}{1,2}`, 'g');
            if (value && String(value).trim() !== '') {
                if (placeholder.type === 'image') {
                    const style = styles[placeholder.name] || { maxWidth: '100%', textAlign: 'center' };
                    content = content.replace(regex, `<div style="text-align: ${style.textAlign}; margin: 16px 0;"><img src="${value}" style="max-width: 100%; width: ${style.maxWidth}; height: auto;" /></div>`);
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

    useEffect(() => {
        if (!isOpen) return;
        const load = async () => {
            const current = availableTemplates.find(t => t.id === selectedTemplate?.id) || availableTemplates[0] || template;
            setSelectedTemplate(current);

            if (current?.file_path && current?.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                setIsPreviewLoading(true);
                const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/templates/${current.file_path}`;
                console.log('[Template Load] Fetching:', publicUrl);

                setDocPreviewUrl(`https://docs.google.com/viewer?url=${encodeURIComponent(publicUrl)}&embedded=true`);

                const res = await fetch(publicUrl);
                docxTemplateBuffer.current = await res.arrayBuffer();
                console.log('[Template Load] ✅ Loaded, size:', docxTemplateBuffer.current.byteLength);
                updateWordPreview(formData, imageStyles);
            } else {
                docxTemplateBuffer.current = null;
                setDocPreviewUrl(null);
                setPreviewContent(populateHtmlContent(formData, current?.placeholders || [], imageStyles));
            }
        };
        load();
    }, [isOpen, selectedTemplate?.id]);

    const getPlaceholderValue = useCallback((placeholder) => {
        const ids = placeholder.master_field_ids || [];
        if (ids.length === 0 || !masterFields) return { value: '', source: null };

        // The placeholder defines which entity it belongs to (e.g., 'company' or 'individual')
        const targetEntityType = placeholder.entity_type || 'individual';

        for (const id of ids) {
            const masterField = masterFields.get(parseInt(id, 10));
            if (!masterField) continue;

            // 1. Handle special Date Config
            if (masterField.date_config?.useCurrentDate) {
                return { value: formatDate(new Date(), masterField.date_config.format), source: 'System' };
            }

            const entityId = entityIdMap[targetEntityType];
            if (!entityId) continue;

            if (masterField.sources) {
                // FILTER: Only look at sources that match the placeholder's entity_type
                const validSources = masterField.sources.filter(s => s.source_type === targetEntityType);

                for (const source of validSources) {
                    // 2. Handle Document Path Sources (Placeholders starting with %)
                    if (placeholder.name.startsWith('%')) {
                        const uploads = Object.values(sourceDataCache?.acc_portal_kyc_uploads || {});
                        const docIds = source.document_id || [];
                        const doc = uploads.find(d =>
                            docIds.includes(d.kyc_document_id) &&
                            d.company_id === entityIdMap?.company
                        );
                        if (doc?.file_path) {
                            return {
                                value: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${doc.file_path}`,
                                source: 'Document'
                            };
                        }
                    }
                    // 3. Handle Table Sources
                    else if (source.table && sourceDataCache[source.table]) {
                        const records = Object.values(sourceDataCache[source.table]);
                        const record = records.find(r => String(r[source.linking_variable || 'id']) === String(entityId));
                        if (record) {
                            const val = parseJsonValue(record, source.path);
                            if (val) return { value: val, source: `Master Field (${targetEntityType})` };
                        }
                    }
                }
            }
        }
        return { value: '', source: null };
    }, [masterFields, entityIdMap, sourceDataCache]);
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
        console.log('\n╔════════════════════════════════════╗');
        console.log('║   GENERATE AND DOWNLOAD START      ║');
        console.log('╚════════════════════════════════════╝');
        console.log('Type:', type);
        setIsGenerating(true);
        try {
            const fileName = `${documentName.replace(/[^\w\s-]/g, '_')}_${formatDate(new Date(), 'YYYYMMDD')}`;

            if (docxTemplateBuffer.current) {
                console.log('\n[Using Word Template]');
                const zip = new PizZip(docxTemplateBuffer.current);
                const renderData = {};

                const imagePromises = [];
                (selectedTemplate.placeholders || []).forEach(p => {
                    let val = formData[p.name];
                    let key = p.name.replace(/^\{+/, '').replace(/\}+$/, '').replace(/^%/, '').replace(/^#/, '');

                    console.log(`\n[Field: ${key}]`);
                    console.log('  Type:', p.type);
                    console.log('  Has value:', !!val);

                    if (p.type === 'image' && val) {
                        if (val.startsWith('data:image')) {
                            console.log('  ✅ Base64');
                            renderData[key] = val;
                        } else if (val.startsWith('http')) {
                            console.log('  📥 Fetching remote');
                            imagePromises.push(
                                fetchImageAsBase64(val).then(base64 => {
                                    renderData[key] = base64;
                                    console.log(`  ✅ ${key} fetched`);
                                })
                            );
                        } else {
                            console.log('  ❌ Unknown format');
                            renderData[key] = null;
                        }
                    } else if (p.type === 'image') {
                        renderData[key] = null;
                    } else {
                        renderData[key] = val || "";
                    }
                });

                console.log(`\n[Waiting for ${imagePromises.length} image(s)...]`);
                await Promise.all(imagePromises);
                console.log('✅ All images processed');

                const imageModule = new ImageModule({
                    centered: false,
                    getImage: (tag) => base64Parser(tag),
                    getSize: (img, tag, name) => {
                        const s = imageStyles[name] || imageStyles[`{%${name}}`];
                        return s ? [s.imageWidth || 300, s.imageHeight || 200] : [300, 200];
                    }
                });

                const doc = new Docxtemplater(zip, {
                    modules: [imageModule],
                    linebreaks: true,
                    nullGetter: () => ""
                });

                console.log('\n[Rendering final document...]');
                doc.setData(renderData);
                doc.render();

                const blob = doc.getZip().generate({
                    type: "blob",
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                });
                console.log('✅ Blob generated, size:', blob.size, 'bytes');

                if (type === 'word') {
                    saveAs(blob, `${fileName}.docx`);
                    toast({ title: "Success ✅", description: "Word document with images downloaded" });
                } else {
                    console.log('[Converting to PDF...]');
                    const html2pdf = (await import('html2pdf.js')).default;
                    const element = document.createElement('div');
                    element.innerHTML = previewContent;
                    element.className = EDITOR_PREVIEW_STYLES + ' p-10 bg-white';
                    element.style.width = '800px';
                    await html2pdf().set({
                        margin: 10,
                        filename: `${fileName}.pdf`,
                        image: { type: 'jpeg', quality: 0.98 },
                        html2canvas: { scale: 2, useCORS: true },
                        jsPDF: { unit: 'mm', format: 'a4' }
                    }).from(element).save();
                    toast({ title: "Success ✅", description: "PDF downloaded" });
                }
            } else {
                console.log('\n[Using HTML Template]');
                if (type === 'word') {
                    const blob = new Blob(['\ufeff', previewContent], { type: 'application/msword' });
                    saveAs(blob, `${fileName}.doc`);
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
                toast({ title: "Success ✅", description: "Document exported" });
            }
            console.log('╔════════════════════════════════════╗');
            console.log('║   GENERATE AND DOWNLOAD SUCCESS    ║');
            console.log('╚════════════════════════════════════╝\n');
        } catch (e) {
            console.error('❌ [Generation Error]:', e);
            toast({ title: "Error ❌", description: e.message, variant: "destructive" });
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
                        <div className="p-4 space-y-4">
                            <Label className="text-xs font-bold text-slate-500 uppercase">Inputs</Label>
                            {selectedTemplate?.placeholders?.map(p => (
                                <div key={p.id} className="space-y-2 p-3 border rounded-lg bg-slate-50/50">
                                    <div className="flex justify-between items-center">
                                        <Label className="font-semibold uppercase">{p.name}</Label>
                                        {autoPopulatedFields.has(p.name) && !manuallyEditedFields.has(p.name) && (
                                            <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-600">Auto</Badge>
                                        )}
                                    </div>
                                    {p.type === 'image' ? (
                                        <div className="space-y-2">
                                            <div className="w-full h-24 border border-dashed rounded bg-white flex items-center justify-center overflow-hidden">
                                                {formData[p.name] ? <img src={formData[p.name]} className="max-h-full max-w-full object-contain" alt="preview" /> : <ImageIcon className="h-6 w-6 text-slate-200" />}
                                            </div>
                                            <Button asChild variant="outline" size="sm" className="w-full h-8 text-xs">
                                                <label className="cursor-pointer"><FileUp className="h-3 w-3 mr-2" />Upload<input type="file" accept="image/*" className="sr-only" onChange={e => handleFileChange(p.name, e)} /></label>
                                            </Button>
                                            <ImagePlaceholderControls styles={imageStyles[p.name] || {}} onStyleChange={(k, v) => handleImageStyleChange(p.name, k, v)} />
                                        </div>
                                    ) : (
                                        <Input value={formData[p.name] || ''} onChange={e => handleInputChange(p.name, e.target.value)} className="bg-white h-8 text-xs" placeholder={`Enter...`} />
                                    )}
                                </div>
                            ))}
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