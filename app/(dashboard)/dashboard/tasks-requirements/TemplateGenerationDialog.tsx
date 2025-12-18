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
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger
} from "@/components/ui/tabs";
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
    Minimize,
    Eye,
    Edit3,
    CheckCircle2,
    AlertCircle,
    X
} from "lucide-react";
import {
    ToggleGroup,
    ToggleGroupItem
} from "@/components/ui/toggle-group";
import {
    Progress
} from "@/components/ui/progress";
import {
    ScrollArea
} from "@/components/ui/scroll-area";
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

const normalizeString = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/[_\s-]/g, '');
};

// --- ROBUST JSON PARSER FOR NESTED DATA & ARRAYS ---
const parseJsonValue = (data, path) => {
    if (!path || !data) return '';

    try {
        let current = data;
        // 1. Normalize the path.
        // Replace '->>' (Postgres JSON text access) and '->' (Postgres JSON object access) with dots for uniform traversal
        // Example: "physical_address_details->>'full_physical_address'" becomes "physical_address_details.full_physical_address"
        const normalizedPath = path
            .replace(/->>/g, '.')
            .replace(/->/g, '.')
            .replace(/['"]/g, ''); // Remove quotes often found in SQL paths

        const keys = normalizedPath.split('.').map(k => k.trim()).filter(k => k);

        for (const key of keys) {
            if (current === null || current === undefined) return '';

            // 2. Handle Arrays automatically
            // If the current object is an array (e.g., physical_address_details is [{...}]),
            // and we are trying to access a property, assume we want the first item.
            if (Array.isArray(current)) {
                current = current.length > 0 ? current[0] : null;
                if (current === null) return '';
            }

            // 3. Handle stringified JSON
            // Sometimes the DB returns a JSON column as a string
            if (typeof current === 'string') {
                try {
                    const parsed = JSON.parse(current);
                    if (parsed && typeof parsed === 'object') {
                        current = parsed;
                        // If parsing revealed an array, unwrap it immediately
                        if (Array.isArray(current)) {
                            current = current.length > 0 ? current[0] : null;
                        }
                    }
                } catch (e) {
                    // Not a JSON string, continue normally
                }
            }

            // 4. Access the property
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return ''; // Key not found
            }
        }

        // 5. Final output processing
        if (current === null || current === undefined) return '';
        if (typeof current === 'object') return JSON.stringify(current); // Should rarely happen if path is complete
        return String(current);

    } catch (error) {
        console.error(`Error parsing JSON path '${path}':`, error);
        return '';
    }
};


// --- IMAGE CONTROLS COMPONENT ---
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
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <ToggleGroup 
                    type="single" 
                    value={styles.textAlign || 'center'} 
                    onValueChange={(align) => align && onStyleChange('textAlign', align)} 
                    className="bg-background rounded-md border h-9"
                >
                    <ToggleGroupItem value="left" className="px-2" title="Align Left"><AlignLeft className="h-4 w-4" /></ToggleGroupItem>
                    <ToggleGroupItem value="center" className="px-2" title="Align Center"><AlignCenter className="h-4 w-4" /></ToggleGroupItem>
                    <ToggleGroupItem value="right" className="px-2" title="Align Right"><AlignRight className="h-4 w-4" /></ToggleGroupItem>
                </ToggleGroup>
                <Select value={currentSizeKey} onValueChange={(size) => onStyleChange('maxWidth', sizeMap[size])}>
                    <SelectTrigger className="w-14 h-9" title="Image Size"><SelectValue>{iconMap[currentSizeKey]}</SelectValue></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="small">Small (25%)</SelectItem>
                        <SelectItem value="medium">Medium (50%)</SelectItem>
                        <SelectItem value="large">Large (75%)</SelectItem>
                        <SelectItem value="full-width">Full Width</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Show Border</Label>
                <Button
                    type="button"
                    variant={styles.showBorder ? "default" : "outline"}
                    size="sm"
                    onClick={() => onStyleChange('showBorder', !styles.showBorder)}
                    className="h-7 px-3"
                >
                    {styles.showBorder ? "On" : "Off"}
                </Button>
            </div>
            <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Padding (px)</Label>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <Label htmlFor="padding-top" className="text-xs">Top</Label>
                        <Input
                            id="padding-top"
                            type="number"
                            min="0" max="100"
                            value={styles.paddingTop || 0}
                            onChange={(e) => onStyleChange('paddingTop', parseInt(e.target.value) || 0)}
                            className="h-7 text-xs"
                        />
                    </div>
                    <div>
                        <Label htmlFor="padding-bottom" className="text-xs">Bottom</Label>
                        <Input
                            id="padding-bottom"
                            type="number"
                            min="0" max="100"
                            value={styles.paddingBottom || 0}
                            onChange={(e) => onStyleChange('paddingBottom', parseInt(e.target.value) || 0)}
                            className="h-7 text-xs"
                        />
                    </div>
                </div>
            </div>
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

    // --- CONTENT POPULATION FOR PREVIEW ---
    const populateContent = useCallback((data, placeholders, styles) => {
        if (!selectedTemplate?.content || !placeholders) return '';
        let content = selectedTemplate.content;

        placeholders.forEach(placeholder => {
            const value = data[placeholder.name];
            const regex = new RegExp(`\\{${placeholder.name}\\}`, 'g');

            if (value && String(value).trim() !== '') {
                if (placeholder.type === 'image') {
                    const style = styles[placeholder.name] || {
                        maxWidth: '100%',
                        textAlign: 'center',
                        showBorder: false,
                        paddingTop: 0,
                        paddingBottom: 0
                    };

                    const widthPercentage = parseInt(style.maxWidth) || 100;
                    const maxWidthPx = Math.round((widthPercentage / 100) * 600);
                    const borderStyle = style.showBorder ? '1px solid #e2e8f0' : 'none';

                    let imageHtml = `
                        <div style="
                            text-align: ${style.textAlign || 'center'};
                            margin: 16px 0;
                            padding-top: ${style.paddingTop || 0}px;
                            padding-bottom: ${style.paddingBottom || 0}px;
                        ">
                            <img 
                                src="${value}" 
                                alt="${placeholder.name}" 
                                style="
                                    max-width: ${maxWidthPx}px;
                                    width: ${style.maxWidth}; 
                                    height: auto; 
                                    display: inline-block;
                                    border: ${borderStyle};
                                    border-radius: ${style.showBorder ? '4px' : '0'};
                                    object-fit: contain;
                                " 
                                onerror="this.onerror=null; this.style.display='none';"
                            />
                        </div>
                    `;
                    content = content.replace(regex, imageHtml);
                } else {
                    const formattedValue = String(value).replace(/\n/g, '<br />');
                    content = content.replace(regex, formattedValue);
                }
            } else {
                const highlightedPlaceholder = `<span style="background-color: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 3px; font-weight: bold;">{${placeholder.name}}</span>`;
                content = content.replace(regex, highlightedPlaceholder);
            }
        });

        return content;
    }, [selectedTemplate]);

    // --- DATA FETCHING LOGIC ---
    const getPlaceholderValue = useCallback((placeholder) => {
        const ids = placeholder.master_field_ids || [];
        if (ids.length === 0 || !masterFields) return { value: '', source: null };
        
        const values = [];
        let sourceName = 'Master Field';
        
        for (const id of ids) {
            const masterField = masterFields.get(parseInt(id, 10));
            if (!masterField) continue;
            
            if (masterField.date_config?.useCurrentDate) {
                return {
                    value: formatDate(new Date(), masterField.date_config.format),
                    source: 'System (Current Date)'
                };
            }
            
            const targetEntityType = placeholder.entity_type || 'principal';
            const entityId = entityIdMap[targetEntityType];
            if (!entityId) continue;
            
            if (masterField.sources) {
                for (const source of masterField.sources) {
                    // 1. Handle Linked Documents (Images)
                    if (placeholder.name.startsWith('%')) {
                        const documents = Object.values(sourceDataCache?.acc_portal_kyc_uploads || {});
                        const validDocumentIds = masterField.sources?.flatMap(s => s.document_id || []) || [];
                        const matchingDoc = documents.find(doc => {
                            const matchesType = validDocumentIds.includes(doc.kyc_document_id);
                            const matchesCompany = doc.company_id === entityIdMap?.company;
                            return matchesType && matchesCompany;
                        });
                        if (matchingDoc) {
                            const imageUrl = matchingDoc.file_path
                                ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${matchingDoc.file_path}`
                                : '';
                            return { value: imageUrl, source: 'Document' };
                        }
                    } 
                    // 2. Handle Data Tables
                    else if (source.table && sourceDataCache[source.table]) {
                        const records = Object.values(sourceDataCache[source.table]);
                        const linkingVar = source.linking_variable || 'id';
                        const record = records.find(r => String(r[linkingVar] || '') === String(entityId));
                        
                        if (record) {
                            // Use our robust JSON parser here
                            const value = parseJsonValue(record, source.path);
                            if (value) {
                                values.push(String(value));
                                sourceName = 'Master Field';
                                break;
                            }
                        }
                    }
                }
            }
        }

        if (values.length > 0) {
            return { value: values.join(' '), source: sourceName };
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

    const handleImageStyleChange = (name, key, value) => {
        setImageStyles(prevStyles => {
            const newStyles = { ...prevStyles, [name]: { ...(prevStyles[name] || {}), [key]: value } };
            setPreviewContent(populateContent(formData, selectedTemplate.placeholders, newStyles));
            return newStyles;
        });
    };

    useEffect(() => {
        if (isOpen && selectedTemplate) {
            const initialFormData = {};
            const initialImageStyles = {};
            const autoPopulated = new Map();
            const placeholders = selectedTemplate.placeholders || [];

            placeholders.forEach(placeholder => {
                let matchResult = getPlaceholderValue(placeholder);
                if (!matchResult.value) matchResult = smartFieldMatch(placeholder.name);

                initialFormData[placeholder.name] = matchResult.value || '';
                if (matchResult.value && matchResult.source) {
                    autoPopulated.set(placeholder.name, matchResult.source);
                }

                if (placeholder.type === 'image') {
                    initialImageStyles[placeholder.name] = {
                        maxWidth: '100%', textAlign: 'center', showBorder: false, paddingTop: 0, paddingBottom: 0
                    };
                }
            });

            setFormData(initialFormData);
            setAutoPopulatedFields(autoPopulated);
            setManuallyEditedFields(new Set());
            setImageStyles(initialImageStyles);
            setPreviewContent(populateContent(initialFormData, placeholders, initialImageStyles));
        }
    }, [isOpen, selectedTemplate, getPlaceholderValue, smartFieldMatch, populateContent]);

    const handleInputChange = (placeholderName, value) => {
        const updatedFormData = { ...formData, [placeholderName]: value };
        setFormData(updatedFormData);
        if (!manuallyEditedFields.has(placeholderName)) {
            setManuallyEditedFields(prev => new Set(prev).add(placeholderName));
        }
        setPreviewContent(populateContent(updatedFormData, selectedTemplate.placeholders, imageStyles));
    };

    const handleFileChange = (placeholderName, e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                toast({ title: "File Too Large", description: "Image must be < 5MB.", variant: "destructive" });
                return;
            }
            setUploadedFiles(prev => ({ ...prev, [placeholderName]: file }));
            const reader = new FileReader();
            reader.onloadend = () => handleInputChange(placeholderName, reader.result);
            reader.readAsDataURL(file);
        }
    };

    // --- DOCUMENT GENERATION ---
    const generateAndDownload = async (outputType = 'word') => {
        setIsGenerating(true);
        try {
            const fileName = `${documentName.replace(/[^\w\s-]/g, '_')}_${formatDate(new Date(), 'YYYYMMDD')}`;
            const placeholders = selectedTemplate?.placeholders || [];

            if (outputType === 'word') {
                const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel, convertInchesToTwip, BorderStyle } = await import('docx');
                
                // Parse HTML content into paragraphs
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = populateContent(formData, placeholders, imageStyles);
                
                const paragraphs = [];
                
                const processNode = async (node, inheritedAlignment = AlignmentType.LEFT) => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const text = node.textContent;
                        // Avoid adding empty text nodes that can cause formatting issues, but preserve meaningful whitespace
                        if (text) return [new TextRun({ text })];
                        return [];
                    }

                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const tagName = node.tagName.toLowerCase();
                        const style = node.getAttribute('style') || '';
                        
                        // Extract text alignment
                        const textAlignMatch = style.match(/text-align:\s*(left|center|right|justify)/i);
                        const nodeAlignment = textAlignMatch 
                            ? ({
                                'left': AlignmentType.LEFT, 'center': AlignmentType.CENTER, 
                                'right': AlignmentType.RIGHT, 'justify': AlignmentType.JUSTIFIED
                            }[textAlignMatch[1].toLowerCase()] || inheritedAlignment)
                            : inheritedAlignment;
                        
                        // --- IMAGE HANDLING START ---
                        if (tagName === 'img') {
                            const src = node.getAttribute('src');
                            if (!src) return [];

                            try {
                                let imageData;
                                // 1. Base64 Handling
                                if (src.startsWith('data:')) {
                                    const base64Match = src.match(/^data:([^;]+);base64,(.+)$/);
                                    if (!base64Match) throw new Error('Invalid Base64');
                                    // Use proper decoding
                                    const binaryString = window.atob(base64Match[2]);
                                    const len = binaryString.length;
                                    const bytes = new Uint8Array(len);
                                    for (let i = 0; i < len; i++) {
                                        bytes[i] = binaryString.charCodeAt(i);
                                    }
                                    imageData = bytes;
                                } 
                                // 2. URL Fetching (e.g. Supabase Storage)
                                else {
                                    const response = await fetch(src, { 
                                        mode: 'cors', // Ensure CORS is handled
                                        credentials: 'omit' // Usually needed for public storage buckets
                                    });
                                    if (!response.ok) throw new Error('Fetch failed');
                                    const blob = await response.blob();
                                    imageData = new Uint8Array(await blob.arrayBuffer());
                                }

                                if (!imageData || imageData.length === 0) throw new Error('Empty image data');

                                // Calculate dimensions safely
                                const imgStyle = node.getAttribute('style') || '';
                                const widthMatch = imgStyle.match(/width:\s*(\d+)%/i);
                                const widthPercentage = widthMatch ? parseInt(widthMatch[1]) : 100;
                                
                                // Max width in Word (approx 6 inches or 600px equivalent for 72dpi)
                                // docx expects pixels for transformation
                                const pixelWidth = Math.round((widthPercentage / 100) * 550); 
                                const pixelHeight = Math.round(pixelWidth * 0.75); // Default 4:3 aspect ratio

                                const imageRun = new ImageRun({
                                    data: imageData,
                                    transformation: {
                                        width: pixelWidth,
                                        height: pixelHeight,
                                    },
                                });

                                // Padding Logic
                                const parent = node.parentElement;
                                const parentStyle = parent?.getAttribute('style') || '';
                                const ptMatch = parentStyle.match(/padding-top:\s*(\d+)px/i);
                                const pbMatch = parentStyle.match(/padding-bottom:\s*(\d+)px/i);
                                const spacingBefore = ptMatch ? parseInt(ptMatch[1]) * 20 : 200; // *20 converts px to twips roughly
                                const spacingAfter = pbMatch ? parseInt(pbMatch[1]) * 20 : 200;

                                // Alignment from parent div (since img is inline)
                                const parentAlignMatch = parentStyle.match(/text-align:\s*(left|center|right)/i);
                                const imgAlign = parentAlignMatch 
                                    ? ({'left':AlignmentType.LEFT,'center':AlignmentType.CENTER,'right':AlignmentType.RIGHT}[parentAlignMatch[1].toLowerCase()]) 
                                    : AlignmentType.CENTER;

                                // Create a dedicated paragraph for the image
                                const imgParagraph = new Paragraph({
                                    children: [imageRun],
                                    alignment: imgAlign,
                                    spacing: { before: spacingBefore, after: spacingAfter }
                                });

                                // Check for border
                                const borderMatch = imgStyle.match(/border:\s*([^;]+)/i);
                                if (borderMatch && !borderMatch[1].includes('none')) {
                                    imgParagraph.border = {
                                        top: { style: BorderStyle.SINGLE, size: 6, color: "E2E8F0" },
                                        bottom: { style: BorderStyle.SINGLE, size: 6, color: "E2E8F0" },
                                        left: { style: BorderStyle.SINGLE, size: 6, color: "E2E8F0" },
                                        right: { style: BorderStyle.SINGLE, size: 6, color: "E2E8F0" },
                                    };
                                }

                                paragraphs.push(imgParagraph);
                            } catch (error) {
                                console.error('Image processing failed:', error);
                                // Fallback text
                                paragraphs.push(new Paragraph({
                                    children: [new TextRun({ text: `[Image Error: ${error.message}]`, color: "red", italics: true })],
                                    alignment: AlignmentType.CENTER
                                }));
                            }
                            return []; // Image is handled by pushing a paragraph, return empty for current flow
                        }
                        // --- IMAGE HANDLING END ---

                        if (['h1', 'h2', 'h3'].includes(tagName)) {
                            const levelMap = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3 };
                            paragraphs.push(new Paragraph({
                                text: node.textContent || '',
                                heading: levelMap[tagName],
                                alignment: nodeAlignment,
                                spacing: { before: 240, after: 120 }
                            }));
                            return [];
                        }

                        if (tagName === 'p' || tagName === 'div') {
                            const childrenRuns = [];
                            for (const child of node.childNodes) {
                                childrenRuns.push(...(await processNode(child, nodeAlignment)));
                            }
                            if (childrenRuns.length > 0) {
                                paragraphs.push(new Paragraph({
                                    children: childrenRuns,
                                    alignment: nodeAlignment,
                                    spacing: { after: 120 }
                                }));
                            }
                            return [];
                        }

                        if (tagName === 'br') return [new TextRun({ break: 1 })];
                        if (tagName === 'strong' || tagName === 'b') return [new TextRun({ text: node.textContent, bold: true })];
                        
                        // Recursive processing for other elements
                        const runs = [];
                        for (const child of node.childNodes) {
                            runs.push(...(await processNode(child, nodeAlignment)));
                        }
                        return runs;
                    }
                    return [];
                };

                for (const child of tempDiv.childNodes) {
                    await processNode(child);
                }

                const doc = new Document({
                    sections: [{
                        properties: {
                            page: { margin: { top: convertInchesToTwip(1), right: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1) } }
                        },
                        children: paragraphs.length > 0 ? paragraphs : [new Paragraph({ children: [new TextRun('')] })],
                    }],
                });

                const blob = await Packer.toBlob(doc);
                saveAs(blob, `${fileName}.docx`);

            } else if (outputType === 'pdf') {
                const html2pdf = (await import('html2pdf.js')).default;
                const element = document.createElement('div');
                element.innerHTML = populateContent(formData, placeholders, imageStyles);
                element.style.padding = '40px';
                element.style.fontFamily = 'Arial, sans-serif';

                const opt = {
                    margin: 0.5,
                    filename: `${fileName}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, logging: false },
                    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
                };
                await html2pdf().set(opt).from(element).save();
            }

            toast({ title: "Success", description: "Document downloaded successfully.", className: "bg-green-500 text-white" });
            setActiveTab('preview');

        } catch (error) {
            console.error("Generation Error:", error);
            toast({ title: "Generation Failed", description: error.message || "Unknown error", variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
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
            <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-0">
                <DialogHeader className="px-6 py-4 border-b bg-muted/20">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg"><Wand2 className="h-5 w-5 text-primary" /></div>
                            <div>
                                <DialogTitle>{documentName}</DialogTitle>
                                <DialogDescription>Generate and export your document</DialogDescription>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
                    </div>
                    <div className="mt-4 flex items-center gap-4">
                        <Progress value={completionStats.percentage} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground font-medium">{completionStats.percentage}% Complete</span>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                        <div className="px-6 pt-2 border-b">
                            <TabsList className="w-[400px]">
                                <TabsTrigger value="edit" className="flex-1">Edit Fields</TabsTrigger>
                                <TabsTrigger value="preview" className="flex-1">Preview</TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="edit" className="flex-1 overflow-hidden m-0 p-0">
                            <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
                                {/* Form */}
                                <ScrollArea className="h-full border-r p-6">
                                    <div className="space-y-6 pb-20">
                                        {availableTemplates?.length > 1 && (
                                            <div className="space-y-2">
                                                <Label>Select Template</Label>
                                                <Select value={selectedTemplate?.id} onValueChange={id => setSelectedTemplate(availableTemplates.find(t => t.id === id))}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>{availableTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.file_name}</SelectItem>)}</SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        {selectedTemplate?.placeholders?.map(p => {
                                            const isFilled = formData[p.name] && String(formData[p.name]).trim() !== '';
                                            const isAuto = autoPopulatedFields.has(p.name);

                                            if (p.type === 'image') {
                                                const previewSrc = uploadedFiles[p.name] ? URL.createObjectURL(uploadedFiles[p.name]) : formData[p.name];
                                                return (
                                                    <div key={p.id} className="p-4 border rounded-lg space-y-3 bg-card">
                                                        <div className="flex justify-between">
                                                            <Label>{p.name}</Label>
                                                            {isFilled && <Badge variant="secondary" className="text-[10px] h-5"><CheckCircle2 className="w-3 h-3 mr-1"/> Ready</Badge>}
                                                        </div>
                                                        <div className="h-32 border-2 border-dashed rounded flex items-center justify-center bg-muted/10">
                                                            {previewSrc ? <img src={previewSrc} className="h-full w-full object-contain" alt="" /> : <ImageIcon className="text-muted-foreground h-8 w-8" />}
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button asChild variant="outline" size="sm" className="flex-1">
                                                                <label className="cursor-pointer">
                                                                    <FileUp className="h-3 w-3 mr-2" /> Upload
                                                                    <input type="file" className="hidden" accept="image/*" onChange={e => handleFileChange(p.name, e)} />
                                                                </label>
                                                            </Button>
                                                        </div>
                                                        {isFilled && <ImagePlaceholderControls styles={imageStyles[p.name] || {}} onStyleChange={(key, v) => handleImageStyleChange(p.name, key, v)} />}
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div key={p.id} className="space-y-2">
                                                    <div className="flex justify-between">
                                                        <Label>{p.description || p.name} {p.required && <span className="text-red-500">*</span>}</Label>
                                                        {isAuto && <span className="text-[10px] text-blue-500 flex items-center"><Wand2 className="w-3 h-3 mr-1"/> Auto-filled</span>}
                                                    </div>
                                                    {p.type === 'textarea' ? (
                                                        <Textarea 
                                                            value={formData[p.name] || ''} 
                                                            onChange={e => handleInputChange(p.name, e.target.value)}
                                                            className={isAuto ? "bg-blue-50/50" : ""}
                                                        />
                                                    ) : (
                                                        <Input 
                                                            type={p.type === 'date' ? 'date' : 'text'}
                                                            value={p.type === 'date' ? formatDate(formData[p.name], 'YYYY-MM-DD') : (formData[p.name] || '')}
                                                            onChange={e => handleInputChange(p.name, e.target.value)}
                                                            className={isAuto ? "bg-blue-50/50" : ""}
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                                {/* Live Preview Small */}
                                <div className="hidden lg:block bg-muted/30 p-8 overflow-y-auto">
                                    <div className="bg-white shadow-lg rounded-sm min-h-[500px] p-8" dangerouslySetInnerHTML={{ __html: previewContent }} />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="preview" className="flex-1 bg-muted/30 p-8 overflow-y-auto">
                            <div className="max-w-[210mm] mx-auto bg-white shadow-xl min-h-[297mm] p-[20mm]" dangerouslySetInnerHTML={{ __html: previewContent }} />
                        </TabsContent>
                    </Tabs>
                </div>

                <DialogFooter className="p-4 border-t">
                    <div className="flex justify-between w-full items-center">
                        <span className="text-xs text-muted-foreground">{autoPopulatedFields.size} fields auto-populated</span>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={onClose}>Cancel</Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button disabled={isGenerating}>
                                        {isGenerating ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                                        Generate
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => generateAndDownload('word')}>Word (.docx)</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => generateAndDownload('pdf')}>PDF (.pdf)</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}