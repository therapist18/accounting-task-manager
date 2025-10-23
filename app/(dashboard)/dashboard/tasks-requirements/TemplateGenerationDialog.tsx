// @ts-nocheck
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle2, Download, FileText, Link2, Loader2, Wand2, XCircle } from "lucide-react";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// --- HELPER FUNCTIONS ---
function generateDocxBlobFromHtml(htmlContent, title) {
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${title}</title></head><body>`;
    const footer = "</body></html>";
    const sourceHTML = header + htmlContent + footer;
    return new Blob([sourceHTML], { type: 'application/msword' });
}

const parseJsonValue = (data, path) => {
    if (!data || !path) return undefined;
    if (path.includes('->>') || path.includes('->')) {
        const parts = path.split(/(->>|->)/);
        const column = parts[0].trim().replace(/['"]/g, '');
        const jsonPath = parts[2].trim().replace(/['"]/g, '');
        const jsonData = data[column];
        if (!jsonData || typeof jsonData !== 'object') return undefined;
        return jsonPath.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), jsonData);
    }
    return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), data);
};

const normalizeString = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/[_\s-]/g, '');
};


export default function TemplateGenerationDialog({
    isOpen,
    onClose,
    template,
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

    const populateContent = useCallback((data) => {
        if (!template?.content) return '';
        let content = template.content;
        Object.keys(data).forEach(key => {
            const value = data[key] || '';
            const regex = new RegExp(`\\{${key}\\}`, 'g');
            content = content.replace(regex, value);
        });
        return content;
    }, [template]);

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

const getPlaceholderValue = useCallback((placeholder) => {
    console.log(`\n--- Processing placeholder: {${placeholder.name}} ---`);

    const ids = placeholder.master_field_ids || (placeholder.master_field_id ? [placeholder.master_field_id] : []);
    const targetDocumentId = placeholder.document_id; // Check for a specific document_id

    if (ids.length > 0 && masterFields && sourceDataCache && entityIdMap) {
        const values = ids.flatMap(id => {
            const masterFieldId = parseInt(id, 10);
            if (isNaN(masterFieldId) || !masterFields.has(masterFieldId)) {
                return [];
            }

            const masterField = masterFields.get(masterFieldId);
            if (!masterField?.sources) {
                return [];
            }

            const targetEntityType = placeholder.entity_type || 'principal';
            const entityId = entityIdMap[targetEntityType];

            if (entityId) {
                return masterField.sources.map(source => {
                    if (source.type === 'documents' && sourceDataCache[source.table]) {
                        let documents = Object.values(sourceDataCache[source.table]);

                        // 1. If a specific document_id is provided, use that document.
                        if (targetDocumentId) {
                            const specificDoc = documents.find(doc => doc.id === targetDocumentId);
                            if (specificDoc) {
                                return parseJsonValue(specificDoc, source.path);
                            }
                        }

                        // 2. If no document_id, find the latest document.
                        const latestDoc = documents.reduce((latest, current) => {
                            let latestDate = null;
                            let currentDate = null;

                            for (const field of ISSUE_DATE_FIELDS) {
                                if (latest && latest[field]) {
                                    latestDate = new Date(latest[field]);
                                    break;
                                }
                            }

                            for (const field of ISSUE_DATE_FIELDS) {
                                if (current[field]) {
                                    currentDate = new Date(current[field]);
                                    break;
                                }
                            }

                            if (currentDate && (!latestDate || currentDate > latestDate)) {
                                return current;
                            }
                            return latest;
                        }, null);

                        if (latestDoc) {
                            return parseJsonValue(latestDoc, source.path);
                        }
                    } else {
                        // Fallback for non-document sources
                        const allRecords = Object.values(sourceDataCache[source.table] || {});
                        const linkingVariable = source.linking_variable || 'id';
                        const record = allRecords.find(rec => rec[linkingVariable] === entityId);
                        if (record) {
                            return parseJsonValue(record, source.path);
                        }
                    }
                    return null;
                });
            }
            return [];
        }).filter(v => v !== null && v !== undefined && String(v).trim() !== '');

        if (values.length > 0) {
            const finalValue = values.join(' ');
            return { value: finalValue, source: 'Master Field' };
        }
    }

    // Fallback to smart match
    return smartFieldMatch(placeholder.name);
}, [masterFields, entityIdMap, sourceDataCache, smartFieldMatch]);

    useEffect(() => {
        if (isOpen && template) {
            console.groupCollapsed("📊 Populating Template Generation Dialog");
            console.log("Received Props:", { template, masterFields, entityIdMap, sourceDataCache, extractedData });

            const initialFormData = {};
            const autoPopulated = new Map();

            (template.placeholders || []).forEach(placeholder => {
                const matchResult = getPlaceholderValue(placeholder);
                initialFormData[placeholder.name] = matchResult.value || '';
                if (matchResult.value && matchResult.source) {
                    autoPopulated.set(placeholder.name, matchResult.source);
                }
            });

            console.log("\nFinal Populated Form Data:", initialFormData);
            console.log("Auto-populated Fields Map:", autoPopulated);
            setFormData(initialFormData);
            setAutoPopulatedFields(autoPopulated);
            setManuallyEditedFields(new Set());

            if (template.file_type === 'text/html') {
                const preview = populateContent(initialFormData);
                setPreviewContent(preview);
                console.log("Generated HTML Preview Content:", preview);
            }
            console.groupEnd();
        }
    }, [isOpen, template, getPlaceholderValue, populateContent]);

    const handleInputChange = (placeholderName, value) => {
        const updatedFormData = { ...formData, [placeholderName]: value };
        setFormData(updatedFormData);
        if (!manuallyEditedFields.has(placeholderName)) {
            setManuallyEditedFields(prev => new Set(prev).add(placeholderName));
        }
        if (template.file_type === 'text/html') {
            setPreviewContent(populateContent(updatedFormData));
        }
    };

    const generateAndDownload = async (outputType = 'word') => {
        setIsGenerating(true);
        try {
            const finalDocumentName = documentName || template.name;

            if (template.file_type === 'text/html') {
                const finalHtml = previewContent;
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
                const response = await fetch(template.public_url);
                if (!response.ok) throw new Error("Could not fetch the template file.");

                const arrayBuffer = await response.arrayBuffer();
                const zip = new PizZip(arrayBuffer);
                const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

                doc.setData(formData);
                doc.render();

                const out = doc.getZip().generate({
                    type: 'blob',
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                });
                saveAs(out, `${finalDocumentName}.docx`);
            }

            toast({
                title: "Document Generated",
                description: `${finalDocumentName} has been created successfully.`,
            });

            if (onSave) {
                await onSave(formData, outputType);
            }
        } catch (error) {
            console.error("Error generating document:", error);
            toast({
                title: "Generation Failed",
                description: error.message || "An unexpected error occurred.",
                variant: "destructive",
            });
        } finally {
            setIsGenerating(false);
        }
    };

    const completionStats = useMemo(() => {
        const placeholders = template?.placeholders || [];
        const total = placeholders.length;
        if (total === 0) return { total: 0, filled: 0, percentage: 100 };
        const filled = Object.values(formData).filter(v => v && String(v).trim() !== '').length;
        const percentage = Math.round((filled / total) * 100);
        return { total, filled, percentage };
    }, [formData, template]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <Wand2 className="h-5 w-5" />
                        Generate: {template?.name}
                    </DialogTitle>
                    <DialogDescription>
                        Fill in the required fields below. Data from linked master fields and document extraction has been used to pre-fill the form.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-4 p-3 bg-muted rounded-lg my-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        Completion:
                        <Badge variant={completionStats.percentage === 100 ? "default" : "secondary"}>
                            {completionStats.filled} / {completionStats.total} fields
                        </Badge>
                    </div>
                    <div className="flex-1 bg-background rounded-full h-2 overflow-hidden">
                        <div
                            className={`h-full transition-all duration-300 ${completionStats.percentage === 100 ? 'bg-green-500' : 'bg-primary'}`}
                            style={{ width: `${completionStats.percentage}%` }}
                        />
                    </div>
                    <div className="text-sm font-bold w-12 text-right">{completionStats.percentage}%</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 overflow-hidden">
                    <div className="flex flex-col gap-4 overflow-y-auto pr-4">
                        {template?.placeholders && template.placeholders.length > 0 ? (
                            template.placeholders.map((placeholder) => {
                                const autoPopulationSource = autoPopulatedFields.get(placeholder.name);
                                const isManuallyEdited = manuallyEditedFields.has(placeholder.name);
                                const isFilled = formData[placeholder.name] && String(formData[placeholder.name]).trim() !== '';
                                const isMasterFieldSource = autoPopulationSource === 'Master Field';
                                return (
                                    <div key={placeholder.id || placeholder.name} className="space-y-2">
                                        <Label htmlFor={placeholder.name} className="flex items-center gap-2 flex-wrap">
                                            <span>{placeholder.description || placeholder.name}</span>
                                            {autoPopulationSource && !isManuallyEdited && (
                                                <Badge variant="outline" className={`text-xs font-normal ${isMasterFieldSource ? 'border-blue-500 text-blue-600' : 'border-green-500 text-green-600'}`}>
                                                    {isMasterFieldSource ? <Link2 className="h-3 w-3 mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                                                    Auto-filled from {autoPopulationSource}
                                                </Badge>
                                            )}
                                            {isManuallyEdited && <Badge variant="secondary" className="text-xs font-normal">Edited</Badge>}
                                            {!isFilled && (
                                                <Badge variant="destructive" className="text-xs font-normal">
                                                    <XCircle className="h-3 w-3 mr-1" /> Required
                                                </Badge>
                                            )}
                                        </Label>
                                        <Input
                                            id={placeholder.name}
                                            type={placeholder.type || 'text'}
                                            value={formData[placeholder.name] || ''}
                                            onChange={(e) => handleInputChange(placeholder.name, e.target.value)}
                                            placeholder={`Enter ${placeholder.description || placeholder.name}`}
                                            className={!isFilled ? 'border-destructive focus-visible:ring-destructive' : ''}
                                        />
                                    </div>
                                );
                            })
                        ) : (
                            <div className="flex items-center justify-center h-full text-center text-muted-foreground"><p>No placeholders defined.</p></div>
                        )}
                    </div>
                    <div className="bg-muted/50 rounded-lg overflow-y-auto">
                        {template?.file_type === 'text/html' ? (
                            <div className="p-6 bg-white h-full">
                                <div
                                    dangerouslySetInnerHTML={{ __html: previewContent }}
                                    className="prose prose-sm max-w-none"
                                />
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-center text-muted-foreground">
                                <p>Live preview is not available for .docx templates.</p>
                            </div>
                        )}
                    </div>
                </div>
                <Separator className="my-4" />
                <DialogFooter>
                    <div className="text-sm text-muted-foreground mr-auto">
                        {autoPopulatedFields.size > 0 && (
                            <span><strong>{autoPopulatedFields.size}</strong> fields were auto-populated.</span>
                        )}
                    </div>
                    <Button variant="outline" onClick={onClose} disabled={isGenerating}>Cancel</Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button disabled={isGenerating || completionStats.percentage < 100} className="w-[190px]">
                                {isGenerating ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
                                ) : (
                                    <><Download className="mr-2 h-4 w-4" /> Generate & Download</>
                                )}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => generateAndDownload('word')}>
                                <FileText className="mr-2 h-4 w-4" />
                                Download as Word (.docx)
                            </DropdownMenuItem>
                            {template?.file_type === 'text/html' && (
                                <DropdownMenuItem onClick={() => generateAndDownload('pdf')}>
                                    <FileText className="mr-2 h-4 w-4" />
                                    Download as PDF
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}