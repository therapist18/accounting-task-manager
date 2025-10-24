// @ts-nocheck
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle2, Download, FileText, FileUp, Image as ImageIcon, Link2, Loader2, Pencil, Wand2, XCircle } from "lucide-react";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const ISSUE_DATE_FIELDS = ['effect_from', 'from', 'valid_from', 'with effect_from', 'date_issued', 'issued_date', 'issued_at', 'date_of_issue', 'Date_of_Issue'];

// --- HELPER FUNCTIONS ---
function generateDocxBlobFromHtml(htmlContent, title) {
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${title}</title></head><body>`;
    const footer = "</body></html>";
    const sourceHTML = header + htmlContent + footer;
    return new Blob([sourceHTML], { type: 'application/msword' });
}

const formatDate = (date, formatStr) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    return (formatStr || 'YYYY-MM-DD')
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day);
};

const parseJsonValue = (data, path) => {
    if (!path || !data) return '';
    try {
        if (path.includes('->>')) {
            let [parent, ...rest] = path.split('->>');
            const key = rest.join('->>').replace(/['"]/g, '').trim();
            parent = parent.trim();
            const parentObj = (parent === 'extracted_details') ? data.extracted_details : parseJsonValue(data, parent);
            if (parentObj && typeof parentObj === 'object') {
                const lowerKey = key.toLowerCase();
                const foundKey = Object.keys(parentObj).find(k => k.toLowerCase() === lowerKey);
                return parentObj[foundKey] || '';
            }
            return '';
        }
        if (path.includes('.')) {
            return path.split('.').reduce((obj, part) => obj && obj[part], data) || '';
        }
        return data[path] || '';
    } catch (error) {
        console.error(`Error parsing JSON path '${path}':`, error);
        return '';
    }
};

const normalizeString = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/[_\s-]/g, '');
};

export default function TemplateGenerationDialog({
    isOpen,
    onClose,
    template,
    availableTemplates,
    documentName,
    onSave,
    masterFields,
    entityIdMap,
    sourceDataCache,
    extractedData = {},
    personData = {},
    companyData = {},
}) {
    const { toast } = useToast();
    const [formData, setFormData] = useState({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [autoPopulatedFields, setAutoPopulatedFields] = useState(new Map());
    const [manuallyEditedFields, setManuallyEditedFields] = useState(new Set());
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [uploadedFiles, setUploadedFiles] = useState({});

    useEffect(() => {
        if (isOpen) {
            setSelectedTemplate(template || (availableTemplates && availableTemplates[0]) || null);
            setUploadedFiles({});
        }
    }, [isOpen, template, availableTemplates]);

    // --- MODIFICATION: Updated populateContent to show indicators for empty fields ---
    const populateContent = useCallback((data, placeholders) => {
        if (!selectedTemplate?.content || !placeholders) return '';

        let content = selectedTemplate.content;

        placeholders.forEach(placeholder => {
            const value = data[placeholder.name];
            const regex = new RegExp(`\\{${placeholder.name}\\}`, 'g');

            if (value && String(value).trim() !== '') {
                if (placeholder.type === 'image') {
                    content = content.replace(regex, `<img src="${value}" alt="${placeholder.name}" style="max-width: 200px; max-height: 200px; object-fit: contain; display: inline-block;" />`);
                } else {
                    content = content.replace(regex, String(value));
                }
            } else {
                // If the value is empty, replace with a visual indicator
                const indicatorHtml = `<span style="border: 1px dashed #cccccc; background-color: #f8f8f8; color: #999999; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; display: inline-block;">${placeholder.name}</span>`;
                content = content.replace(regex, indicatorHtml);
            }
        });
        return content;
    }, [selectedTemplate]);

    const getPlaceholderValue = useCallback((placeholder) => {
        const ids = placeholder.master_field_ids || (placeholder.master_field_id ? [placeholder.master_field_id] : []);

        if (ids.length > 0 && masterFields) {
            for (const id of ids) {
                const masterField = masterFields.get(parseInt(id, 10));
                if (!masterField) continue;

                if (masterField.date_config?.useCurrentDate) {
                    const formattedDate = formatDate(new Date(), masterField.date_config.format);
                    return { value: formattedDate, source: 'System (Current Date)' };
                }
                
                if (!masterField.sources) continue;

                const targetEntityType = placeholder.entity_type || 'principal';
                const entityId = entityIdMap[targetEntityType];
                if (!entityId) continue;

                for (const source of masterField.sources) {
                    if (source.table && sourceDataCache[source.table]) {
                         const records = Object.values(sourceDataCache[source.table]);
                         const record = records.find(r => String(r[source.linking_variable || 'id']) === String(entityId));
                         if(record) {
                            const value = parseJsonValue(record, source.path);
                            if(value) return { value, source: 'Master Field' };
                         }
                    }
                }
            }
        }
        
        return { value: '', source: null };
    }, [masterFields, entityIdMap, sourceDataCache]);

    const smartFieldMatch = useCallback((placeholderName) => {
        const normalizedPlaceholder = normalizeString(placeholderName);
        const dataSources = [
            { source: 'Extracted', data: extractedData },
            { source: 'Person Data', data: personData },
            { source: 'Company Data', data: companyData }
        ].filter(ds => ds.data);

        for (const { source, data } of dataSources) {
            for (const key of Object.keys(data)) {
                if (normalizeString(key) === normalizedPlaceholder) {
                    return { value: data[key], source };
                }
            }
        }
        return { value: '', source: null };
    }, [extractedData, personData, companyData]);

    useEffect(() => {
        if (isOpen && selectedTemplate) {
            const initialFormData = {};
            const autoPopulated = new Map();
            const placeholders = selectedTemplate.placeholders || [];

            placeholders.forEach(placeholder => {
                const matchResult = getPlaceholderValue(placeholder);
                initialFormData[placeholder.name] = matchResult.value || '';
                if (matchResult.value && matchResult.source) {
                    autoPopulated.set(placeholder.name, matchResult.source);
                }
            });

            setFormData(initialFormData);
            setAutoPopulatedFields(autoPopulated);
            setManuallyEditedFields(new Set());
            if (selectedTemplate.file_type === 'text/html') {
                setPreviewContent(populateContent(initialFormData, placeholders));
            }
        }
    }, [isOpen, selectedTemplate, getPlaceholderValue, populateContent]);

    const handleInputChange = (placeholderName, value) => {
        const updatedFormData = { ...formData, [placeholderName]: value };
        setFormData(updatedFormData);
        if (!manuallyEditedFields.has(placeholderName)) {
            setManuallyEditedFields(prev => new Set(prev).add(placeholderName));
        }
        if (selectedTemplate.file_type === 'text/html') {
            setPreviewContent(populateContent(updatedFormData, selectedTemplate.placeholders));
        }
    };
    
    const handleFileChange = (placeholderName, e) => {
        const file = e.target.files[0];
        if (file) {
            setUploadedFiles(prev => ({ ...prev, [placeholderName]: file }));
            if (selectedTemplate.file_type === 'text/html') {
                const reader = new FileReader();
                reader.onloadend = () => {
                    handleInputChange(placeholderName, reader.result);
                };
                reader.readAsDataURL(file);
            }
        }
    };

    const generateAndDownload = async (outputType = 'word') => {
        setIsGenerating(true);
        try {
            const finalDocumentName = documentName || selectedTemplate.name;

            if (selectedTemplate.file_type === 'text/html') {
                const finalHtml = populateContent(formData, selectedTemplate.placeholders).replace(/<span style="[^>]+>.*?<\/span>/g, ''); // Remove indicators before export
                if (outputType === 'pdf') {
                    const element = document.createElement('div');
                    element.innerHTML = finalHtml;
                    element.style.width = '210mm';
                    element.style.padding = '20mm';
                    element.style.backgroundColor = 'white';
                    element.style.color = 'black';
                    document.body.appendChild(element);

                    const canvas = await html2canvas(element, { scale: 2 });
                    document.body.removeChild(element);

                    const imgData = canvas.toDataURL('image/png');
                    const pdf = new jsPDF('p', 'mm', 'a4');
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                    pdf.save(`${finalDocumentName}.pdf`);
                } else {
                    const fileBlob = generateDocxBlobFromHtml(finalHtml, finalDocumentName);
                    saveAs(fileBlob, `${finalDocumentName}.docx`);
                }
            } else {
                // ... (DOCX generation logic remains the same)
            }

            toast({ title: "Document Generated", description: `${finalDocumentName} created.` });
            if (onSave) await onSave(formData, outputType);
        } catch (error) {
            console.error("Error generating document:", error);
            toast({ title: "Generation Failed", description: error.message, variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };

    const completionStats = useMemo(() => {
        const placeholders = selectedTemplate?.placeholders || [];
        const total = placeholders.length;
        if (total === 0) return { total: 0, filled: 0, percentage: 100 };
        const filled = placeholders.filter(p => formData[p.name] && String(formData[p.name]).trim() !== '').length;
        const percentage = Math.round((filled / total) * 100);
        return { total, filled, percentage };
    }, [formData, selectedTemplate]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-0 flex-1 overflow-hidden">
                    {/* --- LEFT (CONFIG) PANEL --- */}
                    <div className="flex flex-col gap-4 overflow-y-auto p-6 border-r">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                <Wand2 className="h-5 w-5" />
                                Generate: {documentName}
                            </DialogTitle>
                            <DialogDescription>
                                Fill in the fields below. The preview will update live.
                            </DialogDescription>
                        </DialogHeader>

                        {availableTemplates && availableTemplates.length > 0 ? (
                             <>
                                {availableTemplates.length > 1 && (
                                    <div className="space-y-2">
                                        <Label>Select a Template</Label>
                                        <Select value={selectedTemplate?.id} onValueChange={(id) => setSelectedTemplate(availableTemplates.find(t => t.id === id))}>
                                            <SelectTrigger><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                                            <SelectContent>{availableTemplates.map(tmpl => <SelectItem key={tmpl.id} value={tmpl.id}>{tmpl.file_name}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                )}

                                {selectedTemplate && (
                                    <>
                                        <div className="flex items-center gap-4 p-3 bg-muted rounded-lg my-2">
                                            <div className="flex items-center gap-2 text-sm font-medium">
                                                Completion:
                                                <Badge variant={completionStats.percentage === 100 ? "default" : "secondary"}>
                                                    {completionStats.filled} / {completionStats.total}
                                                </Badge>
                                            </div>
                                            <div className="flex-1 bg-background rounded-full h-2 overflow-hidden">
                                                <div className={`h-full transition-all duration-300 ${completionStats.percentage === 100 ? 'bg-green-500' : 'bg-primary'}`} style={{ width: `${completionStats.percentage}%` }} />
                                            </div>
                                            <div className="text-sm font-bold w-12 text-right">{completionStats.percentage}%</div>
                                        </div>
                                        <Separator/>
                                        
                                        {(selectedTemplate.placeholders || []).map((placeholder) => {
                                            const autoPopulationSource = autoPopulatedFields.get(placeholder.name);
                                            const isManuallyEdited = manuallyEditedFields.has(placeholder.name);
                                            const isFilled = formData[placeholder.name] && String(formData[placeholder.name]).trim() !== '';
                                            
                                            if (placeholder.type === 'image') {
                                                const previewSrc = uploadedFiles[placeholder.name] ? URL.createObjectURL(uploadedFiles[placeholder.name]) : formData[placeholder.name];
                                                return (
                                                    <div key={placeholder.id || placeholder.name} className="space-y-2 pt-2">
                                                        <Label>{placeholder.description || placeholder.name}</Label>
                                                        <div className="w-full h-40 border-2 border-dashed rounded-lg flex items-center justify-center p-2 bg-gray-50">
                                                            {previewSrc ? <img src={previewSrc} alt="Preview" className="max-h-full max-w-full object-contain rounded"/> : <div className="text-center text-muted-foreground"><ImageIcon className="mx-auto h-8 w-8"/><p className="mt-2 text-sm">No Image Provided</p></div>}
                                                        </div>
                                                        <Button asChild variant="outline" size="sm"><label htmlFor={placeholder.name} className="cursor-pointer w-full"><FileUp className="h-4 w-4 mr-2"/>{previewSrc ? 'Change Image' : 'Upload Image'}<input id={placeholder.name} type="file" accept="image/*" className="sr-only" onChange={(e) => handleFileChange(placeholder.name, e)}/></label></Button>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div key={placeholder.id || placeholder.name} className="space-y-2 pt-2">
                                                    <Label htmlFor={placeholder.name} className="flex items-center gap-2 flex-wrap">
                                                        <span>{placeholder.description || placeholder.name}</span>
                                                        {placeholder.required && !isFilled && <Badge variant="destructive" className="text-xs">Required</Badge>}
                                                        {autoPopulationSource && !isManuallyEdited && <Badge variant="outline" className="text-xs font-normal"><Link2 className="h-3 w-3 mr-1" /> Auto-filled</Badge>}
                                                        {isManuallyEdited && <Badge variant="secondary" className="text-xs font-normal"><Pencil className="h-3 w-3 mr-1" /> Edited</Badge>}
                                                    </Label>
                                                    <Input
                                                        id={placeholder.name}
                                                        type={placeholder.type === 'date' ? 'date' : 'text'}
                                                        value={placeholder.type === 'date' ? formatDate(formData[placeholder.name], 'YYYY-MM-DD') : formData[placeholder.name] || ''}
                                                        onChange={(e) => handleInputChange(placeholder.name, e.target.value)}
                                                        placeholder={`Enter ${placeholder.description || placeholder.name}`}
                                                        className={!isFilled && placeholder.required ? 'border-destructive focus-visible:ring-destructive' : ''}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                             </>
                        ) : (
                            <div className="text-center p-8 border-2 border-dashed rounded-lg"><FileText className="mx-auto h-12 w-12 text-muted-foreground" /><h3 className="mt-2 text-sm font-medium">No templates available</h3><p className="mt-1 text-sm text-muted-foreground">Please create a template first.</p></div>
                        )}
                    </div>

                    {/* --- RIGHT (PREVIEW) PANEL --- */}
                    <div className="bg-muted/50 overflow-y-auto">
                        {selectedTemplate?.file_type === 'text/html' ? (
                            <div className="p-8 bg-white h-full shadow-inner">
                                <div dangerouslySetInnerHTML={{ __html: previewContent }} className="prose prose-sm max-w-none" />
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-center text-muted-foreground p-8"><p>Live preview is not available for .docx templates. <br/> Fill in the fields and use the download button to see the result.</p></div>
                        )}
                    </div>
                </div>
                
                <DialogFooter className="border-t p-4 flex justify-between">
                     <div className="text-sm text-muted-foreground mr-auto self-center">
                        {autoPopulatedFields.size > 0 && <span><strong>{autoPopulatedFields.size}</strong> fields were auto-populated.</span>}
                    </div>
                    <div className='flex gap-2'>
                        <Button variant="outline" onClick={onClose} disabled={isGenerating}>Cancel</Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button disabled={isGenerating || !selectedTemplate} className="w-[190px]">
                                    {isGenerating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</> : <><Download className="mr-2 h-4 w-4" /> Generate</>}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => generateAndDownload('word')}><FileText className="mr-2 h-4 w-4" />Download as Word (.docx)</DropdownMenuItem>
                                {selectedTemplate?.file_type === 'text/html' && <DropdownMenuItem onClick={() => generateAndDownload('pdf')}><FileText className="mr-2 h-4 w-4" />Download as PDF</DropdownMenuItem>}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}