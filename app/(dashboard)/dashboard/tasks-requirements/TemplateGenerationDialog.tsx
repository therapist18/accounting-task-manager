// @ts-nocheck
"use client";

import React, {
    useState,
    useEffect,
    useCallback,
    useMemo
} from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import {
    Button
} from "@/components/ui/button";
import {
    Input
} from "@/components/ui/input";
import {
    Label
} from "@/components/ui/label";
import {
    Badge
} from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Separator
} from "@/components/ui/separator";
import {
    useToast
} from "@/components/ui/use-toast";
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Download,
    FileText,
    FileUp,
    Image as ImageIcon,
    Loader2,
    Wand2,
    ZoomIn,
    ZoomOut,
    Expand,
    Minimize
} from "lucide-react";
import {
    ToggleGroup,
    ToggleGroupItem
} from "@/components/ui/toggle-group";
import html2pdf from 'html2pdf.js';
import { asBlob } from 'html-docx-js-typescript';
import { saveAs } from 'file-saver';


// --- HELPER FUNCTIONS ---
function generateDocxBlobFromHtml(htmlContent, title) {
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w.org/TR/REC-html40'><head><meta charset='utf-8'><title>${title}</title></head><body>`;
    const footer = "</body></html>";
    const sourceHTML = header + htmlContent + footer;
    return new Blob([sourceHTML], {
        type: 'application/msword'
    });
}

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

// --- UPDATED COMPACT IMAGE CONTROLS ---
const ImagePlaceholderControls = ({
    styles,
    onStyleChange
}) => {
    const sizeMap = {
        small: '25%',
        medium: '50%',
        large: '75%',
        'full-width': '100%'
    };
    const currentSizeKey = Object.keys(sizeMap).find(key => sizeMap[key] === styles.maxWidth) || 'full-width';

    const iconMap = {
        small: <ZoomOut className="h-4 w-4" />,
        medium: <Expand className="h-4 w-4" />,
        large: <ZoomIn className="h-4 w-4" />,
       'full-width': <Minimize className="h-4 w-4 rotate-45" />
    };

    return (
        <div className="flex items-center gap-2">
            <ToggleGroup type="single" value={styles.textAlign || 'center'} onValueChange={(align) => align && onStyleChange('textAlign', align)} className="bg-background rounded-md border h-9">
                <ToggleGroupItem value="left" className="px-2"><AlignLeft className="h-4 w-4" /></ToggleGroupItem>
                <ToggleGroupItem value="center" className="px-2"><AlignCenter className="h-4 w-4" /></ToggleGroupItem>
                <ToggleGroupItem value="right" className="px-2"><AlignRight className="h-4 w-4" /></ToggleGroupItem>
            </ToggleGroup>
            <Select value={currentSizeKey} onValueChange={(size) => onStyleChange('maxWidth', sizeMap[size])}>
                <SelectTrigger className="w-14 h-9">
                    <SelectValue>{iconMap[currentSizeKey]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                    <SelectItem value="full-width">Full Width</SelectItem>
                </SelectContent>
            </Select>
        </div>
    );
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
    const {
        toast
    } = useToast();
    const [formData, setFormData] = useState({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [autoPopulatedFields, setAutoPopulatedFields] = useState(new Map());
    const [manuallyEditedFields, setManuallyEditedFields] = useState(new Set());
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [uploadedFiles, setUploadedFiles] = useState({});
    const [imageStyles, setImageStyles] = useState({});

    useEffect(() => {
        if (isOpen) {
            console.log("--- Dialog Opened: Resetting State ---");
            setSelectedTemplate(template || (availableTemplates && availableTemplates[0]) || null);
            setUploadedFiles({});
            setImageStyles({});
        }
    }, [isOpen, template, availableTemplates]);

    const populateContent = useCallback((data, placeholders, styles) => {
        if (!selectedTemplate ?.content || !placeholders) return '';
        let content = selectedTemplate.content;

        placeholders.forEach(placeholder => {
            const value = data[placeholder.name];
            const regex = new RegExp(`\\{${placeholder.name}\\}`, 'g');

            if (value && String(value).trim() !== '') {
                if (placeholder.type === 'image') {
                    const style = styles[placeholder.name] || {
                        maxWidth: '100%',
                        textAlign: 'center'
                    };
                    const imageHtml = `
                        <div style="text-align: ${style.textAlign || 'center'};">
                            <img src="${value}" alt="${placeholder.name}" style="max-width: ${style.maxWidth || '100%'}; height: auto; display: inline-block;" />
                        </div>
                    `;
                    content = content.replace(regex, imageHtml);
                } else {
                    // For text, replace newlines with <br> for proper HTML rendering
                    const formattedValue = String(value).replace(/\n/g, '<br />');
                    content = content.replace(regex, formattedValue);
                }
            } else {
                const indicatorHtml = `<span style="border: 1px dashed #e0e0e0; background-color: #fafafa; color: #b0b0b0; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.85em; display: inline-block;">[${placeholder.name}]</span>`;
                content = content.replace(regex, indicatorHtml);
            }
        });
        return content;
    }, [selectedTemplate]);

    const getPlaceholderValue = useCallback((placeholder) => {
        const ids = placeholder.master_field_ids || [];
        if (ids.length === 0 || !masterFields) return { value: '', source: null };
        
        console.log(`[getPlaceholderValue] Processing placeholder: "${placeholder.name}"`, { placeholder });

        const values = [];
        let sourceName = 'Master Field';

        for (const id of ids) {
            const masterField = masterFields.get(parseInt(id, 10));
            if (!masterField) {
                console.warn(`MasterField with ID ${id} not found.`);
                continue;
            }

            if (masterField.date_config ?.useCurrentDate) {
                return { value: formatDate(new Date(), masterField.date_config.format), source: 'System (Current Date)' };
            }

            const targetEntityType = placeholder.entity_type || 'principal';
            const entityId = entityIdMap[targetEntityType];
            if (!entityId) {
                console.log(`No entityId found for type: ${targetEntityType}`);
                continue;
            }

            if (masterField.sources) {
                for (const source of masterField.sources) {
                    // ** NEW: Handle image from document source **
                    if (placeholder.type === 'image' && source.source_type === 'document' && source.table && sourceDataCache[source.table]) {
                        console.log(`[Image Source] Trying to find document for placeholder "${placeholder.name}"`);
                        const records = Object.values(sourceDataCache[source.table]);
                        const record = records.find(r => 
                            String(r[source.linking_variable || 'director_id']) === String(entityId) &&
                            source.document_id.includes(r.document_type_id) 
                        );

                        if (record && record.file_url) {
                            console.log(`[Image Source] Found document image for "${placeholder.name}": ${record.file_url}`);
                            return { value: record.file_url, source: 'Master Field (Document)' };
                        }
                    } 
                    // Handle regular table sources
                    else if (source.table && sourceDataCache[source.table]) {
                        const records = Object.values(sourceDataCache[source.table]);
                        const record = records.find(r => String(r[source.linking_variable || 'id']) === String(entityId));
                        if (record) {
                            const value = parseJsonValue(record, source.path);
                            if (value) {
                                values.push(String(value));
                                sourceName = 'Master Field';
                                break; // Found value for this master field, move to the next one
                            }
                        }
                    }
                }
            }
        }
        
        if (values.length > 0) {
            // ** NEW: Concatenate values if multiple master fields were found **
            const finalValue = values.join(' ');
            console.log(`[getPlaceholderValue] Success for "${placeholder.name}". Final value: "${finalValue}"`);
            return { value: finalValue, source: sourceName };
        }

        return { value: '', source: null };
    }, [masterFields, entityIdMap, sourceDataCache]);


    const smartFieldMatch = useCallback((placeholderName) => {
        const normalizedPlaceholder = normalizeString(placeholderName);
        const dataSources = [{
            source: 'Extracted',
            data: extractedData
        }, {
            source: 'Person Data',
            data: personData
        }, {
            source: 'Company Data',
            data: companyData
        }].filter(ds => ds.data);

        for (const {
                source,
                data
            } of dataSources) {
            for (const key of Object.keys(data)) {
                if (normalizeString(key) === normalizedPlaceholder) {
                    console.log(`[smartFieldMatch] Found match for "${placeholderName}" in ${source}.`);
                    return {
                        value: data[key],
                        source
                    };
                }
            }
        }
        return {
            value: '',
            source: null
        };
    }, [extractedData, personData, companyData]);

    const handleImageStyleChange = (name, key, value) => {
        setImageStyles(prevStyles => {
            const newStyles = { ...prevStyles,
                [name]: { ...(prevStyles[name] || {}),
                    [key]: value
                }
            };
            if (selectedTemplate.file_type === 'text/html') {
                setPreviewContent(populateContent(formData, selectedTemplate.placeholders, newStyles));
            }
            return newStyles;
        });
    };

    useEffect(() => {
        if (isOpen && selectedTemplate) {
            console.log("--- useEffect: Populating Form Data ---", { selectedTemplate });
            const initialFormData = {};
            const initialImageStyles = {};
            const autoPopulated = new Map();
            const placeholders = selectedTemplate.placeholders || [];

            placeholders.forEach(placeholder => {
                let matchResult = getPlaceholderValue(placeholder);
                if (!matchResult.value) {
                    matchResult = smartFieldMatch(placeholder.name);
                }

                initialFormData[placeholder.name] = matchResult.value || '';
                if (matchResult.value && matchResult.source) {
                    autoPopulated.set(placeholder.name, matchResult.source);
                }

                if (placeholder.type === 'image') {
                    initialImageStyles[placeholder.name] = {
                        maxWidth: '100%',
                        textAlign: 'center'
                    };
                }
            });

            console.log("Initial Form Data:", initialFormData);
            console.log("Auto-populated Fields:", autoPopulated);

            setFormData(initialFormData);
            setAutoPopulatedFields(autoPopulated);
            setManuallyEditedFields(new Set());
            setImageStyles(initialImageStyles);

            if (selectedTemplate.file_type === 'text/html') {
                setPreviewContent(populateContent(initialFormData, placeholders, initialImageStyles));
            } else {
                setPreviewContent('');
            }
        }
    }, [isOpen, selectedTemplate, getPlaceholderValue, smartFieldMatch, populateContent]);

    const handleInputChange = (placeholderName, value) => {
        const updatedFormData = { ...formData,
            [placeholderName]: value
        };
        setFormData(updatedFormData);
        if (!manuallyEditedFields.has(placeholderName)) {
            setManuallyEditedFields(prev => new Set(prev).add(placeholderName));
        }
        if (selectedTemplate.file_type === 'text/html') {
            setPreviewContent(populateContent(updatedFormData, selectedTemplate.placeholders, imageStyles));
        }
    };

    const handleFileChange = (placeholderName, e) => {
        const file = e.target.files[0];
        if (file) {
            setUploadedFiles(prev => ({ ...prev,
                [placeholderName]: file
            }));
            if (selectedTemplate.file_type === 'text/html') {
                const reader = new FileReader();
                reader.onloadend = () => handleInputChange(placeholderName, reader.result);
                reader.readAsDataURL(file);
            }
        }
    };

    const generateAndDownload = async (outputType = 'word') => {
        setIsGenerating(true);
        try {
            const fileName = `${documentName}_${formatDate(new Date(), 'YYYYMMDD')}`;

            if (outputType === 'word') {
                const blob = await asBlob(previewContent);
                saveAs(blob, `${fileName}.docx`);
            } else if (outputType === 'pdf') {
                const contentElement = document.createElement('div');
                contentElement.innerHTML = previewContent;
                const opt = {
                    margin: 0.5,
                    filename: `${fileName}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2 },
                    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
                };
                html2pdf().from(contentElement).set(opt).save();
            }

            toast({
                title: "Download Started",
                description: `Your ${outputType} document is being downloaded.`,
                variant: "success",
            });

        } catch (error) {
            console.error("Error generating document:", error);
            toast({
                title: "Generation Failed",
                description: "An unexpected error occurred while generating the document.",
                variant: "destructive",
            });
        } finally {
            setIsGenerating(false);
        }
    };

    const completionStats = useMemo(() => {
        const placeholders = selectedTemplate ?.placeholders || [];
        const total = placeholders.length;
        if (total === 0) return {
            total: 0,
            filled: 0,
            percentage: 100
        };
        const filled = placeholders.filter(p => formData[p.name] && String(formData[p.name]).trim() !== '').length;
        const percentage = Math.round((filled / total) * 100);
        return {
            total,
            filled,
            percentage
        };
    }, [formData, selectedTemplate]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[90vw] w-full h-[95vh] flex flex-col p-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-0 flex-1 overflow-hidden">
                    {/* LEFT PANEL */}
                    <div className="flex flex-col overflow-y-auto border-r bg-white dark:bg-gray-950 p-6 space-y-6">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                <Wand2 className="h-5 w-5" />
                                Generate: {documentName}
                            </DialogTitle>
                        </DialogHeader>
                        
                        {availableTemplates?.length > 0 ? (
                            <>
                                {availableTemplates.length > 1 && (
                                    <div className="space-y-2">
                                        <Label>Select Template</Label>
                                        <Select value={selectedTemplate?.id} onValueChange={id => setSelectedTemplate(availableTemplates.find(t => t.id === id))}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{availableTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.file_name}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                )}
                                {selectedTemplate && (
                                    <div className="space-y-4">
                                        <Separator/>
                                        {(selectedTemplate.placeholders || []).map(p => {
                                            const isFilled = formData[p.name] && String(formData[p.name]).trim() !== '';
                                            
                                            // ** IMAGE PLACEHOLDER **
                                            if (p.type === 'image') {
                                                const previewSrc = uploadedFiles[p.name] ? URL.createObjectURL(uploadedFiles[p.name]) : formData[p.name];
                                                return (
                                                    <div key={p.id} className="space-y-3 pt-4">
                                                        <Label>{p.description || p.name}</Label>
                                                        <div className="w-full h-40 border-2 border-dashed rounded-lg flex items-center justify-center p-2 bg-gray-50">
                                                            {previewSrc ? (
                                                                <img src={previewSrc} alt="Preview" className="max-h-full max-w-full object-contain rounded"/>
                                                            ) : (
                                                                <div className="text-center text-muted-foreground"><ImageIcon className="mx-auto h-10 w-10"/><p className="mt-2 text-sm">No Image</p></div>
                                                            )}
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <Button asChild variant="outline" className="flex-grow"><label htmlFor={p.name} className="cursor-pointer w-full"><FileUp className="h-4 w-4 mr-2"/>{previewSrc ? 'Change' : 'Upload'}<input id={p.name} type="file" accept="image/*" className="sr-only" onChange={e => handleFileChange(p.name, e)}/></label></Button>
                                                            <ImagePlaceholderControls styles={imageStyles[p.name] || {}} onStyleChange={(key, val) => handleImageStyleChange(p.name, key, val)}/>
                                                        </div>
                                                        <Separator className="pt-4"/>
                                                    </div>
                                                );
                                            }

                                            // ** NEW: SELECT (DROPDOWN) PLACEHOLDER **
                                            const masterField = p.master_field_ids && masterFields ? masterFields.get(parseInt(p.master_field_ids[0], 10)) : null;
                                            if (masterField && masterField.type === 'select') {
                                                const options = (masterField.options && masterField.options[0]) ? masterField.options[0].split('\n') : [];
                                                return (
                                                    <div key={p.id} className="space-y-2 pt-4">
                                                        <Label htmlFor={p.name} className="flex items-center gap-2"><span>{p.description || p.name}</span>{p.required && !isFilled && <Badge variant="destructive">Required</Badge>}</Label>
                                                        <Select value={formData[p.name] || ''} onValueChange={value => handleInputChange(p.name, value)}>
                                                            <SelectTrigger className={!isFilled && p.required ? 'border-destructive' : ''}><SelectValue placeholder="Select an option" /></SelectTrigger>
                                                            <SelectContent>
                                                                {options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                        <Separator className="pt-4"/>
                                                    </div>
                                                );
                                            }

                                            // ** DEFAULT: DATE & TEXT PLACEHOLDER **
                                            return (
                                                <div key={p.id} className="space-y-2 pt-4">
                                                    <Label htmlFor={p.name} className="flex items-center gap-2"><span>{p.description || p.name}</span>{p.required && !isFilled && <Badge variant="destructive">Required</Badge>}</Label>
                                                    <Input
                                                        id={p.name}
                                                        type={p.type === 'date' ? 'date' : 'text'}
                                                        value={p.type === 'date' ? formatDate(formData[p.name], 'YYYY-MM-DD') : (formData[p.name] || '')}
                                                        onChange={e => handleInputChange(p.name, e.target.value)}
                                                        className={!isFilled && p.required ? 'border-destructive' : ''}
                                                    />
                                                    <Separator className="pt-4"/>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center p-8"><FileText className="mx-auto h-12 w-12 text-muted-foreground"/><h3 className="mt-4 font-medium">No Templates Available</h3></div>
                        )}
                    </div>
                    {/* RIGHT PANEL */}
                    <div className="bg-gray-100 dark:bg-gray-900 p-8 overflow-y-auto">
                        {selectedTemplate?.file_type === 'text/html' ? (
                            <div className="bg-white h-full shadow-lg rounded-sm p-12 mx-auto" style={{width: '210mm'}}>
                                <div dangerouslySetInnerHTML={{ __html: previewContent }} className="prose prose-sm max-w-none"/>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-center text-muted-foreground"><p>Live preview unavailable for this file type.</p></div>
                        )}
                    </div>
                </div>
                {/* FOOTER */}
                <DialogFooter className="border-t p-4 flex justify-between items-center bg-gray-50/50 dark:bg-black/50">
                    <div className="text-sm text-muted-foreground">{autoPopulatedFields.size > 0 && <span><strong>{autoPopulatedFields.size}</strong> fields auto-populated.</span>}</div>
                    <div className='flex gap-2'>
                        <Button variant="outline" onClick={onClose} disabled={isGenerating}>Cancel</Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button disabled={isGenerating || !selectedTemplate} className="w-[200px]">{isGenerating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Generating...</> : <><Download className="mr-2 h-4 w-4"/>Generate & Download</>}</Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => generateAndDownload('word')}><FileText className="mr-2 h-4 w-4"/>Word (.docx)</DropdownMenuItem>
                                {selectedTemplate?.file_type === 'text/html' && <DropdownMenuItem onClick={() => generateAndDownload('pdf')}><FileText className="mr-2 h-4 w-4"/>PDF</DropdownMenuItem>}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}