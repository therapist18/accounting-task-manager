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
    Image as ImageIcon, Loader2, Wand2, ZoomIn, ZoomOut, Expand, Minimize,
    Eye, Edit3, CheckCircle2, AlertCircle, X
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { saveAs } from 'file-saver';

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
                        <SelectItem value="small">Small</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                        <SelectItem value="full-width">Full Width</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Show Border</Label>
                <Button type="button" variant={styles.showBorder ? "default" : "outline"} size="sm" onClick={() => onStyleChange('showBorder', !styles.showBorder)} className="h-7 px-3">{styles.showBorder ? "On" : "Off"}</Button>
            </div>
            <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Padding (px)</Label>
                <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Top</Label><Input type="number" min="0" max="100" value={styles.paddingTop || 0} onChange={(e) => onStyleChange('paddingTop', parseInt(e.target.value) || 0)} className="h-7 text-xs" /></div>
                    <div><Label className="text-xs">Bottom</Label><Input type="number" min="0" max="100" value={styles.paddingBottom || 0} onChange={(e) => onStyleChange('paddingBottom', parseInt(e.target.value) || 0)} className="h-7 text-xs" /></div>
                </div>
            </div>
        </div>
    );
};

// --- HELPER: Safely Get Text Run Styles WITHOUT COLORS ---
const getTextRunStyles = (styleMap) => {
    const styles = {};
    
    // STRICT: No colors to prevent corruption
    
    // Font Size: Word uses Half-points (e.g., 24 = 12pt)
    if (styleMap['font-size']) {
        const match = styleMap['font-size'].match(/(\d+)/);
        if (match) {
            const parsed = parseInt(match[1]);
            if (!isNaN(parsed) && parsed > 0 && parsed < 200) {
                styles.size = parsed * 2; 
            }
        }
    }

    // Font styles
    if (styleMap['font-weight'] === 'bold' || parseInt(styleMap['font-weight']) >= 600) {
        styles.bold = true;
    }
    if (styleMap['font-style'] === 'italic') {
        styles.italics = true;
    }
    if (styleMap['text-decoration'] && styleMap['text-decoration'].includes('line-through')) {
        styles.strike = true;
    }
    if (styleMap['text-decoration'] && styleMap['text-decoration'].includes('underline')) {
        styles.underline = {};
    }

    return styles;
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

    const populateContent = useCallback((data, placeholders, styles) => {
        if (!selectedTemplate?.content || !placeholders) return '';
        let content = selectedTemplate.content;

        placeholders.forEach(placeholder => {
            const value = data[placeholder.name];
            const regex = new RegExp(`\\{${placeholder.name}\\}`, 'g');

            if (value && String(value).trim() !== '') {
                if (placeholder.type === 'image') {
                    const style = styles[placeholder.name] || { maxWidth: '100%', textAlign: 'center', showBorder: false, paddingTop: 0, paddingBottom: 0 };
                    const imageHtml = `<div style="text-align: ${style.textAlign || 'center'}; margin: 16px 0; padding-top: ${style.paddingTop || 0}px; padding-bottom: ${style.paddingBottom || 0}px;">
                            <img src="${value}" alt="${placeholder.name}" style="max-width: 100%; width: ${style.maxWidth}; height: auto; display: inline-block; border: ${style.showBorder ? '1px solid #e2e8f0' : 'none'};" />
                        </div>`;
                    content = content.replace(regex, imageHtml);
                } else {
                    content = content.replace(regex, String(value).replace(/\n/g, '<br />'));
                }
            } else {
                content = content.replace(regex, `<span style="background-color: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 3px; font-weight: bold;">{${placeholder.name}}</span>`);
            }
        });
        return content;
    }, [selectedTemplate]);

    // ... (Data Fetching Logic - getPlaceholderValue, smartFieldMatch, useEffect - Same as before)
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
                if (p.type === 'image') initStyles[p.name] = { maxWidth: '100%', textAlign: 'center' };
            });
            setFormData(initData); setAutoPopulatedFields(autoMap); setImageStyles(initStyles);
            setPreviewContent(populateContent(initData, placeholders, initStyles));
        }
    }, [isOpen, selectedTemplate, getPlaceholderValue, smartFieldMatch, populateContent]);

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
            if (file.size > 5 * 1024 * 1024) return toast({ title: "Too Large", description: "< 5MB only", variant: "destructive" });
            setUploadedFiles(prev => ({ ...prev, [name]: file }));
            const reader = new FileReader();
            reader.onloadend = () => handleInputChange(name, reader.result);
            reader.readAsDataURL(file);
        }
    };

    // --- GENERATE AND DOWNLOAD ---
    const generateAndDownload = async (outputType = 'word') => {
        setIsGenerating(true);
        try {
            const fileName = `${documentName.replace(/[^\w\s-]/g, '_')}_${formatDate(new Date(), 'YYYYMMDD')}`;
            const placeholders = selectedTemplate?.placeholders || [];

            console.log("[Gen] Populating content...");
            let fullHtml = populateContent(formData, placeholders, imageStyles, true);

            const parser = new DOMParser();
            const doc = parser.parseFromString(fullHtml, 'text/html');
            const rootElement = doc.body;

            if (outputType === 'word') {
                console.log("[Word Gen] Starting...");
                const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel, convertInchesToTwip, BorderStyle, Table, TableRow, TableCell, WidthType, VerticalAlign } = await import('docx');

                const getStyleMap = (styleStr) => {
                    if (!styleStr) return {};
                    return styleStr.split(';').reduce((acc, rule) => {
                        const [prop, val] = rule.split(':');
                        if (prop && val) acc[prop.trim().toLowerCase()] = val.trim();
                        return acc;
                    }, {});
                };

                const getAlignment = (styleMap, defaultAlign = AlignmentType.LEFT) => {
                    const align = styleMap['text-align'];
                    if (align === 'center') return AlignmentType.CENTER;
                    if (align === 'right') return AlignmentType.RIGHT;
                    if (align === 'justify') return AlignmentType.JUSTIFIED;
                    return defaultAlign;
                };

                const processWordImage = async (imgNode) => {
                    const src = imgNode.getAttribute('src');
                    const styleMap = getStyleMap(imgNode.getAttribute('style'));
                    if (!src) return null;

                    try {
                        let imageData;
                        if (src.startsWith('data:')) {
                            const base64 = src.split(',')[1];
                            const binaryStr = window.atob(base64);
                            const len = binaryStr.length;
                            const bytes = new Uint8Array(len);
                            for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);
                            imageData = bytes;
                        } else {
                            const res = await fetch(src, { mode: 'cors' });
                            const blob = await res.blob();
                            imageData = new Uint8Array(await blob.arrayBuffer());
                        }

                        const dimensions = await new Promise((resolve) => {
                            const img = new Image();
                            img.onload = () => resolve({ w: img.naturalWidth || 100, h: img.naturalHeight || 100 });
                            img.onerror = () => resolve({ w: 100, h: 100 });
                            img.src = src;
                        });

                        const maxWidth = 550;
                        let widthPercent = 100;
                        if (styleMap.width && styleMap.width.includes('%')) {
                            widthPercent = Math.min(100, Math.max(10, parseInt(styleMap.width) || 100));
                        }

                        let targetWidth = Math.floor((widthPercent / 100) * maxWidth);
                        if (isNaN(targetWidth) || targetWidth <= 0) targetWidth = 100;

                        let targetHeight = Math.floor((targetWidth / dimensions.w) * dimensions.h);
                        if (isNaN(targetHeight) || targetHeight <= 0) targetHeight = 100;

                        const parentStyle = getStyleMap(imgNode.parentElement?.getAttribute('style'));
                        const align = getAlignment(parentStyle, AlignmentType.CENTER);

                        // Simple Border (No colors)
                        const borderStyle = {};
                        if (styleMap.border && !styleMap.border.includes('none')) {
                            const b = { style: BorderStyle.SINGLE, size: 6 };
                            borderStyle.top = b; borderStyle.bottom = b; borderStyle.left = b; borderStyle.right = b;
                        }

                        return new Paragraph({
                            children: [new ImageRun({ data: imageData, transformation: { width: targetWidth, height: targetHeight } })],
                            alignment: align,
                            spacing: { before: 100, after: 100 },
                            border: Object.keys(borderStyle).length > 0 ? borderStyle : undefined
                        });
                    } catch (err) {
                        return new Paragraph({ children: [new TextRun({ text: "[Image Error]" })] });
                    }
                };

                const processNode = async (node) => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const text = node.textContent;
                        if (!text) return [];
                        const textSegments = text.split(/(\s+)/).filter(s => s.length > 0);
                        const parentStyle = node.parentNode?.nodeType === Node.ELEMENT_NODE ? getStyleMap(node.parentNode.getAttribute('style')) : {};
                        return textSegments.map(segment => ({
                            type: 'inline',
                            val: new TextRun({ text: segment, ...getTextRunStyles(parentStyle), space: /^\s+$/.test(segment) ? 'preserve' : undefined })
                        }));
                    }

                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const tagName = node.tagName.toLowerCase();
                        const styleMap = getStyleMap(node.getAttribute('style'));

                        if (tagName === 'img') {
                            const p = await processWordImage(node);
                            return p ? [{ type: 'block', val: p }] : [];
                        }

                        // --- TABLE HANDLING ---
                        if (tagName === 'table') {
                            const rows = [];
                            const trs = node.querySelectorAll('tr');
                            for (const tr of trs) {
                                const cells = [];
                                const tds = tr.querySelectorAll('td, th');
                                const cellWidthPercent = tds.length > 0 ? 100 / tds.length : 100;

                                for (const td of tds) {
                                    const cellChildren = [];
                                    for (const child of td.childNodes) {
                                        const res = await processNode(child);
                                        if (res) {
                                            const blocks = []; let inlines = [];
                                            res.forEach(item => {
                                                if (item.type === 'block') {
                                                    if(inlines.length) { blocks.push(new Paragraph({ children: inlines })); inlines=[]; }
                                                    blocks.push(item.val);
                                                } else inlines.push(item.val);
                                            });
                                            if(inlines.length) blocks.push(new Paragraph({ children: inlines }));
                                            cellChildren.push(...blocks);
                                        }
                                    }
                                    if (!cellChildren.length) cellChildren.push(new Paragraph({}));
                                    
                                    // Add Borders to Table Cells
                                    cells.push(new TableCell({
                                        children: cellChildren,
                                        width: { size: cellWidthPercent, type: WidthType.PERCENTAGE },
                                        verticalAlign: VerticalAlign.CENTER,
                                        borders: {
                                            top: { style: BorderStyle.SINGLE, size: 2 },
                                            bottom: { style: BorderStyle.SINGLE, size: 2 },
                                            left: { style: BorderStyle.SINGLE, size: 2 },
                                            right: { style: BorderStyle.SINGLE, size: 2 },
                                        },
                                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                                        shading: tagName === 'th' || td.tagName === 'TH' ? { fill: "EEEEEE" } : undefined
                                    }));
                                }
                                rows.push(new TableRow({ children: cells }));
                            }
                            return [{ type: 'block', val: new Table({ rows: rows, width: { size: 100, type: WidthType.PERCENTAGE } }) }];
                        }

                        const childrenData = [];
                        for (const child of node.childNodes) {
                            const res = await processNode(child);
                            if (res) childrenData.push(...res);
                        }

                        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                            const inlines = childrenData.filter(c => c.type === 'inline').map(c => c.val);
                            const level = parseInt(tagName[1]) || 1;
                            return [{ type: 'block', val: new Paragraph({ children: inlines.length ? inlines : [new TextRun("")], heading: HeadingLevel[`HEADING_${level}`], alignment: getAlignment(styleMap), spacing: { before: 240, after: 120 } }) }];
                        }

                        if (tagName === 'p' || tagName === 'div' || tagName === 'li') {
                            const hasBlockChildren = childrenData.some(c => c.type === 'block');
                            const align = getAlignment(styleMap);
                            if (hasBlockChildren) {
                                const blocks = [];
                                let currentInline = [];
                                const flush = () => { if (currentInline.length) { blocks.push({ type: 'block', val: new Paragraph({ children: currentInline, alignment: align }) }); currentInline = []; } };
                                childrenData.forEach(item => { if (item.type === 'block') { flush(); blocks.push(item); } else currentInline.push(item.val); });
                                flush();
                                return blocks;
                            } else {
                                if (!childrenData.length && tagName === 'p') return [{ type: 'block', val: new Paragraph({}) }];
                                if (!childrenData.length) return [];
                                return [{ type: 'block', val: new Paragraph({ children: childrenData.map(c => c.val), alignment: align, bullet: tagName === 'li' ? { level: 0 } : undefined, spacing: { after: 100 } }) }];
                            }
                        }

                        if (['b', 'strong', 'i', 'em', 'u', 'span'].includes(tagName)) {
                            return childrenData.map(child => {
                                if (child.type === 'inline') {
                                    const parentStyle = getStyleMap(node.getAttribute('style') || '');
                                    const styles = getTextRunStyles(parentStyle);
                                    return { type: 'inline', val: new TextRun({ text: child.val.root.text, ...child.val.options, ...styles }) };
                                }
                                return child;
                            });
                        }

                        if (tagName === 'br') return [{ type: 'inline', val: new TextRun({ break: 1 }) }];
                        return childrenData;
                    }
                    return [];
                };

                const processedNodes = [];
                for (const child of rootElement.childNodes) {
                    const res = await processNode(child);
                    if (res) processedNodes.push(...res);
                }

                const finalChildren = [];
                let stray = [];
                processedNodes.forEach(n => {
                    if (n.type === 'block') {
                        if (stray.length > 0) { finalChildren.push(new Paragraph({ children: stray })); stray = []; }
                        finalChildren.push(n.val);
                    } else { stray.push(n.val); }
                });
                if (stray.length > 0) finalChildren.push(new Paragraph({ children: stray }));

                const docxFile = new Document({
                    sections: [{ properties: { page: { margin: { top: convertInchesToTwip(1), right: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1) } } }, children: finalChildren.length ? finalChildren : [new Paragraph("")] }]
                });
                const blob = await Packer.toBlob(docxFile);
                saveAs(blob, `${fileName}.docx`);

            } else if (outputType === 'pdf') {
                console.log("[PDF Gen] Starting...");
                const html2pdf = (await import('html2pdf.js')).default;
                
                // Create offscreen container
                const pdfContainer = document.createElement('div');
                pdfContainer.style.position = 'absolute';
                pdfContainer.style.left = '-9999px';
                pdfContainer.style.top = '0px';
                pdfContainer.style.width = '210mm'; // A4
                pdfContainer.style.minHeight = '297mm';
                pdfContainer.style.padding = '25mm 20mm'; // Top/Bottom 25mm, Left/Right 20mm
                pdfContainer.style.backgroundColor = 'white';
                pdfContainer.style.fontFamily = 'Arial, sans-serif';
                pdfContainer.style.fontSize = '12pt';
                pdfContainer.style.lineHeight = '1.5';
                
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = fullHtml;
                
                // --- INJECT PDF STYLES ---
                const style = document.createElement('style');
                style.innerHTML = `
                    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                    th { background-color: #f0f0f0; font-weight: bold; }
                    img { max-width: 100%; height: auto; display: block; margin: 10px auto; }
                `;
                pdfContainer.appendChild(style);
                
                // Move content
                while (tempDiv.firstChild) {
                    pdfContainer.appendChild(tempDiv.firstChild);
                }
                
                document.body.appendChild(pdfContainer);

                // Wait for images
                const images = Array.from(pdfContainer.querySelectorAll('img'));
                await Promise.all(images.map(img => {
                    if (img.complete) return Promise.resolve();
                    return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
                }));

                const opt = {
                    margin: 0, // Handled by padding above
                    filename: `${fileName}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, logging: false },
                    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
                    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
                };
                
                await html2pdf().set(opt).from(pdfContainer).save();
                document.body.removeChild(pdfContainer);
                console.log("[PDF Gen] Complete");
            }

            toast({ title: "Success", description: "Downloaded successfully", className: "bg-green-500 text-white" });
            setActiveTab('preview');

        } catch (e) {
            console.error("Export Error:", e);
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally { setIsGenerating(false); }
    };

    const completionStats = useMemo(() => {
        const placeholders = selectedTemplate?.placeholders || [];
        const total = placeholders.length;
        if (total === 0) return { total: 0, filled: 0, percentage: 100 };
        const filled = placeholders.filter(p => formData[p.name] && String(formData[p.name]).trim() !== '').length;
        return { total, filled, percentage: Math.round((filled / total) * 100) };
    }, [formData, selectedTemplate]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            {/* UI Implementation remains same */}
            <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-0">
                <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500 rounded-lg"><Wand2 className="h-5 w-5 text-white" /></div>
                            <div>
                                <DialogTitle className="text-xl font-bold">{documentName}</DialogTitle>
                                <DialogDescription className="text-sm">Fill in fields and generate document</DialogDescription>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
                    </div>
                    <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">Completion: {completionStats.filled} of {completionStats.total} fields</span>
                            <span className="text-muted-foreground">{completionStats.percentage}%</span>
                        </div>
                        <Progress value={completionStats.percentage} className="h-2" />
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                        <TabsList className="mx-6 mt-4 grid w-[400px] grid-cols-2">
                            <TabsTrigger value="edit"><Edit3 className="h-4 w-4 mr-2" />Edit Fields</TabsTrigger>
                            <TabsTrigger value="preview"><Eye className="h-4 w-4 mr-2" />Preview</TabsTrigger>
                        </TabsList>

                        <div className="flex-1 overflow-hidden">
                            <TabsContent value="edit" className="h-full m-0 p-0">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-full">
                                    <ScrollArea className="h-full border-r bg-white">
                                        <div className="p-6 space-y-4">
                                            {availableTemplates?.length > 1 && (
                                                <div className="space-y-2 bg-blue-50 p-4 rounded-lg">
                                                    <Label className="text-sm font-semibold">Template</Label>
                                                    <Select value={selectedTemplate?.id} onValueChange={id => setSelectedTemplate(availableTemplates.find(t => t.id === id))}>
                                                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                                        <SelectContent>{availableTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.file_name}</SelectItem>)}</SelectContent>
                                                    </Select>
                                                </div>
                                            )}

                                            {selectedTemplate && (
                                                <div className="space-y-4">
                                                    {(selectedTemplate.placeholders || []).map(p => {
                                                        const isFilled = formData[p.name] && String(formData[p.name]).trim() !== '';
                                                        const isAutoPopulated = autoPopulatedFields.has(p.name);

                                                        if (p.type === 'image') {
                                                            const previewSrc = uploadedFiles[p.name] ? URL.createObjectURL(uploadedFiles[p.name]) : formData[p.name];
                                                            return (
                                                                <div key={p.id} className="space-y-3 p-4 border rounded-lg bg-gray-50">
                                                                    <div className="flex items-center justify-between">
                                                                        <Label className="text-base font-semibold flex items-center gap-2">
                                                                            <ImageIcon className="h-4 w-4" />{p.description || p.name}
                                                                        </Label>
                                                                        {isFilled && <Badge variant="success" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Added</Badge>}
                                                                    </div>
                                                                    <div className={`w-full h-48 border-2 border-dashed rounded-lg flex items-center justify-center p-2 ${isFilled ? 'bg-white border-blue-300' : 'bg-gray-100 border-gray-300'}`}>
                                                                        {previewSrc ? <img src={previewSrc} alt="Preview" className="max-h-full max-w-full object-contain rounded" /> : <div className="text-center text-muted-foreground"><ImageIcon className="mx-auto h-12 w-12 mb-2" /><p className="text-sm">No image</p></div>}
                                                                    </div>
                                                                    <Button asChild variant="outline" className="flex-1">
                                                                        <label className="cursor-pointer flex items-center justify-center gap-2">
                                                                            <FileUp className="h-4 w-4" />{previewSrc ? 'Change' : 'Upload'}
                                                                            <input id={p.name} type="file" accept="image/*" className="sr-only" onChange={e => handleFileChange(p.name, e)} />
                                                                        </label>
                                                                    </Button>
                                                                    {isFilled && (
                                                                        <div className="pt-2 border-t">
                                                                            <Label className="text-xs text-muted-foreground mb-2 block">Image Styling</Label>
                                                                            <ImagePlaceholderControls styles={imageStyles[p.name] || {}} onStyleChange={(key, val) => handleImageStyleChange(p.name, key, val)} />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        }

                                                        const isLongText = p.type === 'textarea' || (formData[p.name] && String(formData[p.name]).length > 100);
                                                        return (
                                                            <div key={p.id} className="space-y-2 p-4 border rounded-lg hover:border-blue-300 transition-colors">
                                                                <Label htmlFor={p.name} className="text-base font-semibold flex items-center gap-2">
                                                                    {p.description || p.name}
                                                                    {isFilled && <Badge variant="success" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Filled</Badge>}
                                                                </Label>
                                                                {isLongText ? (
                                                                    <Textarea id={p.name} value={formData[p.name] || ''} onChange={e => handleInputChange(p.name, e.target.value)} className="min-h-[100px]" placeholder={`Enter ${p.description || p.name}`} />
                                                                ) : (
                                                                    <Input id={p.name} type={p.type === 'date' ? 'date' : 'text'} value={p.type === 'date' ? formatDate(formData[p.name], 'YYYY-MM-DD') : (formData[p.name] || '')} onChange={e => handleInputChange(p.name, e.target.value)} placeholder={`Enter ${p.description || p.name}`} />
                                                                )}
                                                                {isAutoPopulated && <p className="text-xs text-blue-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Auto-filled from {autoPopulatedFields.get(p.name)}</p>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </ScrollArea>

                                    <div className="bg-gray-100 p-6 overflow-y-auto">
                                        <div className="max-w-3xl mx-auto">
                                            <div className="bg-white shadow-2xl rounded-lg overflow-hidden">
                                                <div className="bg-gray-200 px-4 py-2 flex items-center gap-2 border-b">
                                                    <div className="flex gap-1.5">
                                                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                                    </div>
                                                    <span className="text-xs text-muted-foreground ml-2">Live Preview</span>
                                                </div>
                                                <div dangerouslySetInnerHTML={{ __html: previewContent }} className="prose prose-sm max-w-none p-8" style={{ minHeight: '400px', fontFamily: 'Georgia, serif', lineHeight: '1.6' }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="preview" className="h-full m-0 p-0">
                                <div className="h-full bg-gray-100 p-8 overflow-y-auto">
                                    <div className="max-w-4xl mx-auto">
                                        <div className="bg-white shadow-2xl rounded-lg overflow-hidden">
                                            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 text-white">
                                                <h3 className="text-lg font-semibold">Document Preview</h3>
                                                <p className="text-sm text-blue-100">{documentName} • {formatDate(new Date(), 'YYYY-MM-DD')}</p>
                                            </div>
                                            <div dangerouslySetInnerHTML={{ __html: previewContent }} className="prose prose-base max-w-none p-12" style={{ minHeight: '800px', fontFamily: 'Georgia, serif', lineHeight: '1.8', fontSize: '14pt' }} />
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>

                <DialogFooter className="border-t px-6 py-4 bg-gray-50">
                    <div className="flex items-center justify-between w-full">
                        <div className="text-sm text-muted-foreground flex items-center gap-4">
                            {autoPopulatedFields.size > 0 && <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /><strong>{autoPopulatedFields.size}</strong> auto-filled</span>}
                            {completionStats.total > 0 && completionStats.filled < completionStats.total && <span className="flex items-center gap-2 text-amber-600"><AlertCircle className="h-4 w-4" />{completionStats.total - completionStats.filled} remaining</span>}
                        </div>
                        <div className='flex gap-2'>
                            <Button variant="outline" onClick={onClose} disabled={isGenerating}>Cancel</Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button disabled={isGenerating || !selectedTemplate} className="min-w-[200px]">
                                        {isGenerating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</> : <><Download className="mr-2 h-4 w-4" />Generate & Download</>}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => generateAndDownload('word')}><FileText className="mr-2 h-4 w-4" />Word (.docx)</DropdownMenuItem>
                                    {selectedTemplate?.file_type === 'text/html' && <DropdownMenuItem onClick={() => generateAndDownload('pdf')}><FileText className="mr-2 h-4 w-4" />PDF (.pdf)</DropdownMenuItem>}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}