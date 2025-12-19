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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    AlignCenter, AlignLeft, AlignRight, Download, FileText, FileUp,
    Loader2, Wand2, Expand, Eye, Edit3, CheckCircle2, X, Image as ImageIcon
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

// --- SHARED STYLING (Matches TemplateEditor.tsx) ---
const EDITOR_PREVIEW_STYLES = `
  prose prose-sm sm:prose-base dark:prose-invert max-w-full focus:outline-none 
  [&_table]:border-collapse [&_table]:border [&_table]:border-border [&_table]:w-full [&_table]:my-4
  [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:p-2 [&_th]:text-left
  [&_td]:border [&_td]:border-border [&_td]:p-2 relative
  [&_img]:rounded-lg [&_img]:border [&_img]:border-border [&_img]:max-w-full
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

const parseJsonValue = (data, path) => {
    if (!path || !data) return '';
    try {
        if (path.includes('->>') || path.includes('->')) {
            let parts = path.split('->>');
            if (parts.length === 1) parts = path.split('->');
            let currentValue = data[parts[0].trim()];
            for (let i = 1; i < parts.length; i++) {
                const key = parts[i].replace(/['"]/g, '').trim();
                if (typeof currentValue === 'string') { try { currentValue = JSON.parse(currentValue); } catch (e) { } }
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
    } catch (error) { return ''; }
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
                        <SelectItem value="small">Small (25%)</SelectItem>
                        <SelectItem value="medium">Medium (50%)</SelectItem>
                        <SelectItem value="large">Large (75%)</SelectItem>
                        <SelectItem value="full-width">Full Width</SelectItem>
                    </SelectContent>
                </Select>
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
    const [autoPopulatedFields, setAutoPopulatedFields] = useState(new Map());
    const [manuallyEditedFields, setManuallyEditedFields] = useState(new Set());
    const [selectedTemplate, setSelectedTemplate] = useState(template);
    const [uploadedFiles, setUploadedFiles] = useState({});
    const [imageStyles, setImageStyles] = useState({});
    const [activeTab, setActiveTab] = useState('edit');

    const docxTemplateBuffer = useRef(null);

    // --- REUSE POPULATE CONTENT FOR HTML TEMPLATES ---
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
                content = content.replace(regex, `<span style="background-color: #fef08a; padding: 2px 4px; border: 1px dashed #eab308; color: #854d0e;">[${placeholder.name}]</span>`);
            }
        });
        return content;
    }, [selectedTemplate]);

    // --- WORD PREVIEW GENERATOR (Mammoth + Docxtemplater) ---
    const updateWordPreview = useCallback(async (data, styles) => {
        if (!docxTemplateBuffer.current) return;
        try {
            setIsPreviewLoading(true);
            const zip = new PizZip(docxTemplateBuffer.current);
            const renderData = {};
            (selectedTemplate.placeholders || []).forEach(p => {
                let val = data[p.name];
                let key = p.name.replace(/^\{+/, '').replace(/\}+$/, '');
                if (p.type === 'image') renderData[key] = val?.startsWith('data:image') ? val : null;
                else renderData[key] = val || `[${p.name}]`;
            });

            const imageModule = new ImageModule({
                centered: false,
                getImage: (tag) => base64Parser(tag),
                getSize: () => [150, 100],
            });

            const doc = new Docxtemplater(zip, { modules: [imageModule], paragraphLoop: true, linebreaks: true });
            doc.setData(renderData);
            doc.render();
            const out = doc.getZip().generate({ type: "arraybuffer" });

            const result = await mammoth.convertToHtml({ arrayBuffer: out }, {
                styleMap: [
                    "p => p:fresh",
                    "table => table.border-collapse.table-auto.w-full.my-4",
                    "td => td.border.p-2",
                    "th => th.border.bg-muted.p-2.font-bold"
                ]
            });
            setPreviewContent(result.value);
        } catch (err) {
            console.error("Word preview error", err);
        } finally {
            setIsPreviewLoading(false);
        }
    }, [selectedTemplate]);

    // --- INITIAL LOAD & TEMPLATE SWITCH ---
    useEffect(() => {
        if (!isOpen) return;
        const load = async () => {
            const current = availableTemplates.find(t => t.id === selectedTemplate?.id) || availableTemplates[0] || template;
            setSelectedTemplate(current);
            if (current?.file_path) {
                setIsPreviewLoading(true);
                const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/templates/${current.file_path}`;
                const res = await fetch(fileUrl);
                docxTemplateBuffer.current = await res.arrayBuffer();
                updateWordPreview(formData, imageStyles);
            } else {
                docxTemplateBuffer.current = null;
                setPreviewContent(populateHtmlContent(formData, current?.placeholders || [], imageStyles));
            }
        };
        load();
    }, [isOpen, selectedTemplate?.id]);

    const getPlaceholderValue = useCallback((placeholder) => {
        const ids = placeholder.master_field_ids || [];
        if (ids.length === 0 || !masterFields) return { value: '', source: null };
        const values = [];
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
                            if (val) { values.push(String(val)); break; }
                        }
                    }
                }
            }
        }
        return values.length > 0 ? { value: values.join(' '), source: 'Master Field' } : { value: '', source: null };
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
            if (type === 'word') {
                let blob;
                if (docxTemplateBuffer.current) {
                    const zip = new PizZip(docxTemplateBuffer.current);
                    const renderData = {};
                    (selectedTemplate.placeholders || []).forEach(p => {
                        let val = formData[p.name];
                        let key = p.name.replace(/^\{+/, '').replace(/\}+$/, '');
                        renderData[key] = p.type === 'image' ? (val?.startsWith('data:image') ? val : null) : (val || "");
                    });
                    const imageModule = new ImageModule({ centered: false, getImage: (tag) => base64Parser(tag), getSize: (img, tag, name) => {
                        const s = imageStyles[name] || imageStyles[`{%${name}}`];
                        return s ? [s.imageWidth || 300, s.imageHeight || 200] : [300, 200];
                    }});
                    const doc = new Docxtemplater(zip, { modules: [imageModule], linebreaks: true });
                    doc.setData(renderData); doc.render();
                    blob = doc.getZip().generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
                }
                saveAs(blob, `${fileName}.docx`);
            } else {
                const html2pdf = (await import('html2pdf.js')).default;
                const element = document.createElement('div');
                element.innerHTML = previewContent;
                element.className = EDITOR_PREVIEW_STYLES + ' p-10 bg-white';
                element.style.width = '800px';
                await html2pdf().set({ margin: 10, filename: `${fileName}.pdf`, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4' }}).from(element).save();
            }
            toast({ title: "Success", description: "Document exported successfully" });
        } catch (e) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally { setIsGenerating(false); }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-0">
                <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500 rounded-lg"><Wand2 className="h-5 w-5 text-white" /></div>
                            <div>
                                <DialogTitle className="text-xl font-bold">{documentName}</DialogTitle>
                                <DialogDescription className="text-sm">Auto-populate and live preview your template</DialogDescription>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
                    </div>
                    <div className="mt-2 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">Progress: {completionStats.filled}/{completionStats.total} Fields</span>
                            <span>{completionStats.percentage}%</span>
                        </div>
                        <Progress value={completionStats.percentage} className="h-1.5" />
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                        <div className="flex justify-between items-center bg-muted/20 px-4 py-2 border-b">
                            {availableTemplates.length > 1 ? (
                                <Select value={selectedTemplate?.id} onValueChange={(v) => setSelectedTemplate(availableTemplates.find(t => t.id === v))}>
                                    <SelectTrigger className="w-64 h-8 text-xs"><SelectValue placeholder="Select Template" /></SelectTrigger>
                                    <SelectContent>{availableTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.file_name}</SelectItem>)}</SelectContent>
                                </Select>
                            ) : <div />}
                            <TabsList className="grid w-[300px] grid-cols-2 h-8">
                                <TabsTrigger value="edit" className="text-xs"><Edit3 className="h-3.3 w-3.5 mr-1.5" />Editor</TabsTrigger>
                                <TabsTrigger value="preview" className="text-xs"><Eye className="h-3.5 w-3.5 mr-1.5" />Full View</TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="flex-1 overflow-hidden">
                            <TabsContent value="edit" className="h-full m-0 p-0">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-full">
                                    <ScrollArea className="h-full border-r bg-white">
                                        <div className="p-6 space-y-4">
                                            {selectedTemplate?.placeholders?.map(p => (
                                                <div key={p.id} className="space-y-2 p-4 border rounded-lg bg-slate-50/50">
                                                    <div className="flex justify-between items-center">
                                                        <Label className="font-semibold text-xs text-slate-700">{p.description || p.name}</Label>
                                                        {autoPopulatedFields.has(p.name) && !manuallyEditedFields.has(p.name) && <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-600 border-blue-100">Auto</Badge>}
                                                    </div>
                                                    {p.type === 'image' ? (
                                                        <div className="space-y-2">
                                                            <div className="w-full h-32 border border-dashed rounded bg-white flex items-center justify-center overflow-hidden">
                                                                {formData[p.name] ? <img src={formData[p.name]} className="max-h-full object-contain" /> : <ImageIcon className="h-6 w-6 text-slate-200" />}
                                                            </div>
                                                            <Button asChild variant="outline" size="sm" className="w-full h-8 text-xs">
                                                                <label className="cursor-pointer"><FileUp className="h-3 w-3 mr-2" />Upload Image<input type="file" accept="image/*" className="sr-only" onChange={e => handleFileChange(p.name, e)} /></label>
                                                            </Button>
                                                            <ImagePlaceholderControls styles={imageStyles[p.name] || {}} onStyleChange={(k,v) => handleImageStyleChange(p.name, k, v)} />
                                                        </div>
                                                    ) : (
                                                        <Input value={formData[p.name] || ''} onChange={e => handleInputChange(p.name, e.target.value)} className="bg-white h-9 text-sm" placeholder={`Enter ${p.name}...`} />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                    <div className="relative bg-slate-100 p-8 overflow-y-auto hidden lg:block">
                                        {isPreviewLoading && <div className="absolute inset-0 z-10 bg-white/40 backdrop-blur-sm flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>}
                                        <div className={`bg-white shadow-xl p-12 min-h-full mx-auto max-w-[800px] ${EDITOR_PREVIEW_STYLES}`} style={{ fontFamily: 'serif' }} dangerouslySetInnerHTML={{ __html: previewContent }} />
                                    </div>
                                </div>
                            </TabsContent>
                            <TabsContent value="preview" className="h-full m-0 p-0 overflow-y-auto bg-slate-200 p-8">
                                <div className={`max-w-[850px] mx-auto bg-white shadow-2xl p-20 min-h-[11in] relative ${EDITOR_PREVIEW_STYLES}`} style={{ fontFamily: 'serif' }}>
                                    {isPreviewLoading && <div className="absolute inset-0 flex items-center justify-center bg-white/60"><Loader2 className="h-10 w-10 animate-spin text-blue-500" /></div>}
                                    <div dangerouslySetInnerHTML={{ __html: previewContent }} />
                                </div>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>

                <DialogFooter className="border-t px-6 py-3 bg-white flex items-center justify-between">
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 font-medium">
                        <CheckCircle2 className="h-3 w-3 text-green-500" /> Real-time preview active
                    </div>
                    <div className='flex gap-2'>
                        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" disabled={isGenerating || !selectedTemplate} className="bg-blue-600 hover:bg-blue-700">
                                    {isGenerating ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                                    Generate Document
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => generateAndDownload('word')}><FileText className="h-4 w-4 mr-2 text-blue-600" />Word Document (.docx)</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => generateAndDownload('pdf')}><FileText className="h-4 w-4 mr-2 text-red-600" />PDF Document (.pdf)</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}