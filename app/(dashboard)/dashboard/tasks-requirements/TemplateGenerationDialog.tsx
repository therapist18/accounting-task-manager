// @ts-nocheck
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    AlignCenter, AlignLeft, AlignRight, Download, FileText, FileUp,
    Image as ImageIcon, Loader2, Wand2, Expand,
    Eye, Edit3, CheckCircle2, AlertCircle, X
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { saveAs } from 'file-saver';

// --- ADDED: Core libraries for robust Word generation ---
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import ImageModule from 'docxtemplater-image-module-free';

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

// Robust base64 to ArrayBuffer converter
const base64Parser = (dataURL) => {
    if (typeof dataURL !== 'string') return null;
    const regex = /^data:image\/(png|jpeg|jpg);base64,/;
    if (!regex.test(dataURL)) return false;
    const base64 = dataURL.replace(regex, "");
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes.buffer;
};

const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

const parseJsonValue = (data, path) => {
    if (!path || !data) return '';
    try {
        if (path.includes('->>') || path.includes('->')) {
            let parts = path.split('->>');
            if (parts.length === 1) parts = path.split('->');
            let currentValue = data[parts[0].trim()];
            for (let i = 1; i < parts.length; i++) {
                const key = parts[i].replace(/['"]/g, '').trim();
                if (typeof currentValue === 'string') {
                    try { currentValue = JSON.parse(currentValue); } catch (e) { }
                }
                if (key.includes('.')) {
                    const nestedKeys = key.split('.');
                    for (const nestedKey of nestedKeys) {
                        if (currentValue && typeof currentValue === 'object') currentValue = currentValue[nestedKey];
                        else return '';
                    }
                } else {
                    if (currentValue && typeof currentValue === 'object') {
                        if (currentValue[key] !== undefined) currentValue = currentValue[key];
                        else {
                            const lowerKey = key.toLowerCase();
                            const foundKey = Object.keys(currentValue).find(k => k.toLowerCase() === lowerKey);
                            currentValue = foundKey ? currentValue[foundKey] : '';
                        }
                    } else return '';
                }
            }
            return currentValue || '';
        }
        if (path.includes('.')) return path.split('.').reduce((obj, part) => obj && obj[part], data) || '';
        return data[path] || '';
    } catch (error) {
        console.error(`Error parsing JSON path '${path}':`, error);
        return '';
    }
};

const normalizeString = (str) => !str ? '' : str.toLowerCase().replace(/[_\s-]/g, '');

// --- IMAGE CONTROLS COMPONENT ---
const ImagePlaceholderControls = ({ styles, onStyleChange }) => {
    const sizeMap = { small: '25%', medium: '50%', large: '75%', 'full-width': '100%' };
    const currentSizeKey = Object.keys(sizeMap).find(key => sizeMap[key] === styles.maxWidth) || 'full-width';
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <ToggleGroup type="single" value={styles.textAlign || 'center'} onValueChange={(align) => align && onStyleChange('textAlign', align)} className="bg-background rounded-md border h-9">
                    <ToggleGroupItem value="left" className="px-2"><AlignLeft className="h-4 w-4" /></ToggleGroupItem>
                    <ToggleGroupItem value="center" className="px-2"><AlignCenter className="h-4 w-4" /></ToggleGroupItem>
                    <ToggleGroupItem value="right" className="px-2"><AlignRight className="h-4 w-4" /></ToggleGroupItem>
                </ToggleGroup>
                <Select value={currentSizeKey} onValueChange={(size) => onStyleChange('maxWidth', sizeMap[size])}>
                    <SelectTrigger className="w-14 h-9"><SelectValue><Expand className="h-4 w-4" /></SelectValue></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="small">Small (25%)</SelectItem>
                        <SelectItem value="medium">Medium (50%)</SelectItem>
                        <SelectItem value="large">Large (75%)</SelectItem>
                        <SelectItem value="full-width">Full Width</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Word Export Dimensions (px)</Label>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <Label className="text-xs">Width</Label>
                        <Input 
                            type="number" 
                            value={styles.imageWidth || 300} 
                            onChange={(e) => onStyleChange('imageWidth', parseInt(e.target.value) || 300)} 
                            className="h-7 text-xs" 
                        />
                    </div>
                    <div>
                        <Label className="text-xs">Height</Label>
                        <Input 
                            type="number" 
                            value={styles.imageHeight || 200} 
                            onChange={(e) => onStyleChange('imageHeight', parseInt(e.target.value) || 200)} 
                            className="h-7 text-xs" 
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function TemplateGenerationDialog({
    isOpen, onClose, template, availableTemplates, documentName, onSave,
    masterFields, entityIdMap, sourceDataCache,
    extractedData = {}, personData = {}, companyData = {},
}) {
    const { toast } = useToast();
    const [formData, setFormData] = useState({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [autoPopulatedFields, setAutoPopulatedFields] = useState(new Map());
    const [manuallyEditedFields, setManuallyEditedFields] = useState(new Set());
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [uploadedFiles, setUploadedFiles] = useState({});
    const [imageStyles, setImageStyles] = useState({});
    const [activeTab, setActiveTab] = useState('edit');

    useEffect(() => {
        if (isOpen) {
            setSelectedTemplate(template || (availableTemplates && availableTemplates[0]) || null);
            setUploadedFiles({});
            setImageStyles({});
            setActiveTab('edit');
        }
    }, [isOpen, template, availableTemplates]);

// --- ROBUST DOCX GENERATION ---
const generateDocxBlob = async (template, values, imageStylesMap, buffer) => {
    try {
        const zip = new PizZip(buffer);
        const renderData = {};
        const placeholders = template.placeholders || [];

        // 1. Process Data
        for (const p of placeholders) {
            let value = values[p.name];
            // Normalize key: remove {% and %} for docxtemplater mapping
            let renderKey = p.name.replace(/^\{%/, '').replace(/\}$/, '');

            if (p.type === 'image') {
                if (value && typeof value === 'string' && value.startsWith('data:image')) {
                    renderData[renderKey] = value;
                } else if (value instanceof File) {
                    renderData[renderKey] = await toBase64(value);
                } else {
                    renderData[renderKey] = null;
                }
            } else if (p.type === 'checkbox') {
                renderData[renderKey] = value ? '☑' : '☐';
            } else {
                renderData[renderKey] = value || '';
            }
        }

        // 2. Image Module Config
        const imageModule = new ImageModule({
            centered: false,
            getImage: (tagValue) => base64Parser(tagValue),
            getSize: (img, tagValue, tagName) => {
                // Try to find styles by tag name or original placeholder name
                const styles = imageStylesMap[tagName] || imageStylesMap[`{%${tagName}}`];
                if (styles?.imageWidth) return [styles.imageWidth, styles.imageHeight];
                
                const pConfig = placeholders.find(p => p.name.includes(tagName));
                if (pConfig?.imageConfig) return [pConfig.imageConfig.width, pConfig.imageConfig.height];
                
                return [300, 200]; 
            }
        });

        // 3. Initialize Docxtemplater
        const doc = new Docxtemplater(zip, {
            modules: [imageModule],
            paragraphLoop: true,
            linebreaks: true,
            nullGetter: () => "" 
        });

        doc.setData(renderData);
        doc.render(); 

        return doc.getZip().generate({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
    } catch (err) {
        console.error("Internal Docx Generation Error:", err);
        throw err;
    }
};

// --- HTML TO WORD CONVERTER (Robust Version) ---
const generateDocxFromHtml = async (htmlString) => {
    const { 
        Document, Packer, Paragraph, TextRun, ImageRun, 
        Table, TableRow, TableCell, WidthType, BorderStyle 
    } = await import('docx');

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const root = doc.body;

    // Helper to recursively process nodes with inherited styles
    const processNode = async (node, inheritedStyles = {}) => {
        const styles = { ...inheritedStyles };

        // 1. Handle Text Nodes
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            if (!text || text.trim() === '') return [];
            return [new TextRun({ 
                text: text, 
                size: styles.size || 24, 
                bold: !!styles.bold, 
                italics: !!styles.italics,
                underline: !!styles.underline ? {} : undefined,
                color: styles.color || undefined
            })];
        }

        // 2. Handle Elements
        if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();

            // Update styles based on tag
            if (tagName === 'strong' || tagName === 'b') styles.bold = true;
            if (tagName === 'i' || tagName === 'em') styles.italics = true;
            if (tagName === 'u') styles.underline = true;
            if (tagName === 'h1') { styles.bold = true; styles.size = 48; }
            if (tagName === 'h2') { styles.bold = true; styles.size = 36; }
            if (tagName === 'h3') { styles.bold = true; styles.size = 30; }

            // Handle Images separately (Blocks)
            if (tagName === 'img') {
                const src = node.getAttribute('src');
                if (!src) return [];
                try {
                    let imageData;
                    if (src.startsWith('data:')) {
                        imageData = base64Parser(src);
                    } else {
                        const res = await fetch(src, { mode: 'cors' });
                        imageData = await res.arrayBuffer();
                    }
                    return [new ImageRun({ 
                        data: imageData, 
                        transformation: { width: 400, height: 300 } 
                    })];
                } catch (e) {
                    return [new TextRun({ text: "[Image Error]", color: "FF0000" })];
                }
            }

            // Handle Br tag
            if (tagName === 'br') {
                return [new TextRun({ break: 1 })];
            }

            // Process all children with current styles
            const children = [];
            for (const child of node.childNodes) {
                const results = await processNode(child, styles);
                children.push(...results);
            }

            // Handle block-level elements
            if (['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4'].includes(tagName)) {
                // Return a Paragraph as a single item in an array
                return [new Paragraph({ children: children.length ? children : [new TextRun("")] })];
            }

            // Inline elements just return their processed children
            return children;
        }
        return [];
    };

    const docxContent = [];
    for (const child of root.childNodes) {
        const results = await processNode(child);
        results.forEach(res => {
            // Ensure block level items are handled correctly
            if (res instanceof Paragraph || res instanceof Table) {
                docxContent.push(res);
            } else {
                // Wrap stray TextRuns/Images in a paragraph
                docxContent.push(new Paragraph({ children: [res] }));
            }
        });
    }

    // Fallback if empty
    if (docxContent.length === 0) docxContent.push(new Paragraph(""));

    const docxFile = new Document({
        sections: [{ children: docxContent }]
    });

    return await Packer.toBlob(docxFile);
};
// --- MAIN GENERATE AND DOWNLOAD HANDLER ---
const generateAndDownload = async (outputType = 'word') => {
    if (!selectedTemplate) {
        toast({ title: "Error", description: "No template selected", variant: "destructive" });
        return;
    }

    setIsGenerating(true);
    const fileName = `${documentName.replace(/[^\w\s-]/g, '_')}_${formatDate(new Date(), 'YYYYMMDD')}`;

    try {
        if (outputType === 'word') {
            // SCENARIO A: Pre-existing Word Template (.docx)
            if (selectedTemplate.file_path) {
                console.log("[Word Export] Using pre-existing DOCX template...");
                const bucket = "templates"; 
                const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${selectedTemplate.file_path}`;
                
                const response = await fetch(fileUrl);
                if (!response.ok) throw new Error(`Could not download Word template (Status: ${response.status})`);
                
                const arrayBuffer = await response.arrayBuffer();
                const blob = await generateDocxBlob(selectedTemplate, formData, imageStyles, arrayBuffer);
                
                saveAs(blob, `${fileName}.docx`);
                toast({ title: "Success", description: "Word document generated from template" });
            } 
            // SCENARIO B: Fallback - Convert HTML Template to Word (.docx)
            else {
                console.log("[Word Export] No file path found. Converting HTML to Word...");
                const htmlString = populateContent(formData, selectedTemplate.placeholders || [], imageStyles);
                const blob = await generateDocxFromHtml(htmlString);
                
                saveAs(blob, `${fileName}.docx`);
                toast({ title: "Success", description: "Converted HTML template to Word document" });
            }

        } else if (outputType === 'pdf') {
            // Existing PDF Logic...
            const html2pdf = (await import('html2pdf.js')).default;
            const htmlString = populateContent(formData, selectedTemplate.placeholders, imageStyles);
            const element = document.createElement('div');
            element.innerHTML = htmlString;
            element.className = 'prose max-w-none p-10';
            element.style.fontFamily = 'serif';
            element.style.width = '800px';

            const opt = {
                margin: 10,
                filename: `${fileName}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, logging: false },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            await html2pdf().set(opt).from(element).save();
            toast({ title: "Success", description: "PDF document downloaded" });
        }
    } catch (error) {
        console.error("Export Error:", error);
        toast({ 
            title: "Export Failed", 
            description: error.message || "An unexpected error occurred", 
            variant: "destructive" 
        });
    } finally {
        setIsGenerating(false);
    }
};

    // --- REUSE POPULATE CONTENT FOR PREVIEW ---
    const populateContent = useCallback((data, placeholders, styles) => {
        if (!selectedTemplate?.content || !placeholders) return '';
        let content = selectedTemplate.content;

        placeholders.forEach(placeholder => {
            const value = data[placeholder.name];
            const regex = new RegExp(`\\{${placeholder.name}\\}`, 'g');

            if (value && String(value).trim() !== '') {
                if (placeholder.type === 'image') {
                    const style = styles[placeholder.name] || { maxWidth: '100%', textAlign: 'center' };
                    const imageHtml = `<div style="text-align: ${style.textAlign || 'center'}; margin: 16px 0;">
                            <img src="${value}" style="max-width: 100%; width: ${style.maxWidth}; height: auto;" />
                        </div>`;
                    content = content.replace(regex, imageHtml);
                } else {
                    content = content.replace(regex, String(value).replace(/\n/g, '<br />'));
                }
            } else {
                content = content.replace(regex, `<span style="background-color: #fef08a; padding: 2px 4px;">{${placeholder.name}}</span>`);
            }
        });
        return content;
    }, [selectedTemplate]);

    // ... (rest of helper logic: getPlaceholderValue, smartFieldMatch, handleInputChange remain the same) ...
    const getPlaceholderValue = useCallback((placeholder) => {
        const ids = placeholder.master_field_ids || [];
        if (ids.length === 0 || !masterFields) return { value: '', source: null };
        const values = [];
        let sourceName = 'Master Field';
        for (const id of ids) {
            const masterField = masterFields.get(parseInt(id, 10));
            if (!masterField) continue;
            if (masterField.date_config?.useCurrentDate) return { value: formatDate(new Date(), masterField.date_config.format), source: 'System' };
            const entityId = entityIdMap[placeholder.entity_type || 'principal'];
            if (!entityId) continue;
            if (masterField.sources) {
                for (const source of masterField.sources) {
                    if (placeholder.name.startsWith('%')) {
                        const documents = Object.values(sourceDataCache?.acc_portal_kyc_uploads || {});
                        const validIds = masterField.sources?.flatMap(s => s.document_id || []) || [];
                        const doc = documents.find(d => validIds.includes(d.kyc_document_id) && d.company_id === entityIdMap?.company);
                        if (doc) return { value: doc.file_path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${doc.file_path}` : '', source: 'Document' };
                    } else if (source.table && sourceDataCache[source.table]) {
                        const records = Object.values(sourceDataCache[source.table]);
                        const record = records.find(r => String(r[source.linking_variable || 'id']) === String(entityId));
                        if (record) {
                            const val = parseJsonValue(record, source.path);
                            if (val) { values.push(String(val)); sourceName = 'Master Field'; break; }
                        }
                    }
                }
            }
        }
        return values.length > 0 ? { value: values.join(' '), source: sourceName } : { value: '', source: null };
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
            setPreviewContent(populateContent(next, selectedTemplate.placeholders, imageStyles));
            return next;
        });
        if (!manuallyEditedFields.has(name)) setManuallyEditedFields(prev => new Set(prev).add(name));
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
            const next = { ...prev, [name]: { ...(prev[name] || {}), [key]: value } };
            setPreviewContent(populateContent(formData, selectedTemplate.placeholders, next));
            return next;
        });
    };

    useEffect(() => {
        if (isOpen && selectedTemplate) {
            const initData = {}, initStyles = {}, autoMap = new Map();
            const placeholders = selectedTemplate.placeholders || [];
            placeholders.forEach(p => {
                let match = getPlaceholderValue(p);
                if (!match.value) match = smartFieldMatch(p.name);
                initData[p.name] = match.value || '';
                if (match.value) autoMap.set(p.name, match.source);
                if (p.type === 'image') {
                    initStyles[p.name] = { 
                        maxWidth: '100%', 
                        textAlign: 'center',
                        imageWidth: p.imageConfig?.width || 300,
                        imageHeight: p.imageConfig?.height || 200
                    };
                }
            });
            setFormData(initData); setAutoPopulatedFields(autoMap); setImageStyles(initStyles);
            setPreviewContent(populateContent(initData, placeholders, initStyles));
        }
    }, [isOpen, selectedTemplate, getPlaceholderValue, smartFieldMatch, populateContent]);

    const completionStats = useMemo(() => {
        const placeholders = selectedTemplate?.placeholders || [];
        const total = placeholders.length;
        if (total === 0) return { total: 0, filled: 0, percentage: 100 };
        const filled = placeholders.filter(p => formData[p.name] && String(formData[p.name]).trim() !== '').length;
        return { total, filled, percentage: Math.round((filled / total) * 100) };
    }, [formData, selectedTemplate]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-0">
                {/* Header Section */}
                <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500 rounded-lg"><Wand2 className="h-5 w-5 text-white" /></div>
                            <div>
                                <DialogTitle className="text-xl font-bold">{documentName}</DialogTitle>
                                <DialogDescription className="text-sm">Auto-populate fields and generate robust Word docs</DialogDescription>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
                    </div>
                    <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">Form Progress: {completionStats.filled}/{completionStats.total} Fields</span>
                            <span className="text-muted-foreground">{completionStats.percentage}%</span>
                        </div>
                        <Progress value={completionStats.percentage} className="h-2" />
                    </div>
                </DialogHeader>

                {/* Tabs Section */}
                <div className="flex-1 overflow-hidden">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                        <TabsList className="mx-6 mt-4 grid w-[400px] grid-cols-2">
                            <TabsTrigger value="edit"><Edit3 className="h-4 w-4 mr-2" />Field Editor</TabsTrigger>
                            <TabsTrigger value="preview"><Eye className="h-4 w-4 mr-2" />Document Preview</TabsTrigger>
                        </TabsList>

                        <div className="flex-1 overflow-hidden">
                            <TabsContent value="edit" className="h-full m-0 p-0">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-full">
                                    <ScrollArea className="h-full border-r bg-white">
                                        <div className="p-6 space-y-4">
                                            {selectedTemplate && (selectedTemplate.placeholders || []).map(p => {
                                                const isFilled = formData[p.name] && String(formData[p.name]).trim() !== '';
                                                
                                                if (p.type === 'image') {
                                                    const previewSrc = uploadedFiles[p.name] ? URL.createObjectURL(uploadedFiles[p.name]) : formData[p.name];
                                                    return (
                                                        <div key={p.id} className="space-y-3 p-4 border rounded-lg bg-gray-50">
                                                            <Label className="text-base font-semibold flex items-center gap-2">
                                                                <ImageIcon className="h-4 w-4" />{p.description || p.name}
                                                            </Label>
                                                            <div className="w-full h-48 border-2 border-dashed rounded-lg flex items-center justify-center bg-white">
                                                                {previewSrc ? <img src={previewSrc} className="max-h-full object-contain" /> : <p className="text-xs text-muted-foreground">No image provided</p>}
                                                            </div>
                                                            <Button asChild variant="outline" className="w-full">
                                                                <label className="cursor-pointer">
                                                                    <FileUp className="h-4 w-4 mr-2" />Upload Image
                                                                    <input type="file" accept="image/*" className="sr-only" onChange={e => handleFileChange(p.name, e)} />
                                                                </label>
                                                            </Button>
                                                            {isFilled && <ImagePlaceholderControls styles={imageStyles[p.name] || {}} onStyleChange={(key, val) => handleImageStyleChange(p.name, key, val)} />}
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div key={p.id} className="space-y-2 p-4 border rounded-lg">
                                                        <Label className="font-semibold">{p.description || p.name}</Label>
                                                        <Input 
                                                            value={formData[p.name] || ''} 
                                                            onChange={e => handleInputChange(p.name, e.target.value)} 
                                                            placeholder="Enter text..."
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </ScrollArea>
                                    
                                    <div className="bg-gray-100 p-6 overflow-y-auto hidden lg:block">
                                        <div className="bg-white shadow-lg p-12 min-h-full prose prose-sm max-w-none" 
                                             style={{ fontFamily: 'serif' }}
                                             dangerouslySetInnerHTML={{ __html: previewContent }} />
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="preview" className="h-full m-0 p-0 overflow-y-auto bg-gray-100">
                                <div className="max-w-4xl mx-auto my-8 bg-white shadow-2xl p-16 min-h-screen prose max-w-none"
                                     style={{ fontFamily: 'serif' }}
                                     dangerouslySetInnerHTML={{ __html: previewContent }} />
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>

                {/* Footer Section */}
                <DialogFooter className="border-t px-6 py-4 bg-gray-50">
                    <div className="flex items-center justify-between w-full">
                        <div className="text-xs text-muted-foreground">
                             {autoPopulatedFields.size} fields auto-matched from records.
                        </div>
                        <div className='flex gap-2'>
                            <Button variant="outline" onClick={onClose}>Cancel</Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button disabled={isGenerating || !selectedTemplate}>
                                        {isGenerating ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                                        Generate & Export
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => generateAndDownload('word')}>Word Document (.docx)</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => generateAndDownload('pdf')}>PDF Document (.pdf)</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}