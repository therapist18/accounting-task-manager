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

const parseJsonValue = (data, path) => {
    if (!path || !data) return '';
    try {
        // Handle PostgreSQL JSON operator (->>, ->, #>, #>>)
        if (path.includes('->>') || path.includes('->')) {
            // Split on ->> first (for text extraction)
            let parts = path.split('->>');
            
            if (parts.length === 1) {
                // Try splitting on -> (for JSON extraction)
                parts = path.split('->');
            }
            
            // First part is the column name
            let currentValue = data[parts[0].trim()];
            
            // Process remaining parts
            for (let i = 1; i < parts.length; i++) {
                const key = parts[i].replace(/['"]/g, '').trim();
                
                // If currentValue is a string, try to parse it as JSON
                if (typeof currentValue === 'string') {
                    try {
                        currentValue = JSON.parse(currentValue);
                    } catch (e) {
                        // If it fails, it might already be the value we need
                        console.log('Could not parse JSON string:', currentValue);
                    }
                }
                
                // Handle nested path like "location.city"
                if (key.includes('.')) {
                    const nestedKeys = key.split('.');
                    for (const nestedKey of nestedKeys) {
                        if (currentValue && typeof currentValue === 'object') {
                            currentValue = currentValue[nestedKey];
                        } else {
                            return '';
                        }
                    }
                } else {
                    // Simple key access
                    if (currentValue && typeof currentValue === 'object') {
                        // Try exact match first
                        if (currentValue[key] !== undefined) {
                            currentValue = currentValue[key];
                        } else {
                            // Try case-insensitive match
                            const lowerKey = key.toLowerCase();
                            const foundKey = Object.keys(currentValue).find(k => k.toLowerCase() === lowerKey);
                            currentValue = foundKey ? currentValue[foundKey] : '';
                        }
                    } else {
                        return '';
                    }
                }
            }
            
            return currentValue || '';
        }
        
        // Handle dot notation (e.g., "user.name")
        if (path.includes('.')) {
            return path.split('.').reduce((obj, part) => obj && obj[part], data) || '';
        }
        
        // Simple property access
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
            {/* Alignment and Size */}
            <div className="flex items-center gap-2">
                <ToggleGroup 
                    type="single" 
                    value={styles.textAlign || 'center'} 
                    onValueChange={(align) => align && onStyleChange('textAlign', align)} 
                    className="bg-background rounded-md border h-9"
                >
                    <ToggleGroupItem value="left" className="px-2" title="Align Left">
                        <AlignLeft className="h-4 w-4" />
                    </ToggleGroupItem>
                    <ToggleGroupItem value="center" className="px-2" title="Align Center">
                        <AlignCenter className="h-4 w-4" />
                    </ToggleGroupItem>
                    <ToggleGroupItem value="right" className="px-2" title="Align Right">
                        <AlignRight className="h-4 w-4" />
                    </ToggleGroupItem>
                </ToggleGroup>
                <Select value={currentSizeKey} onValueChange={(size) => onStyleChange('maxWidth', sizeMap[size])}>
                    <SelectTrigger className="w-14 h-9" title="Image Size">
                        <SelectValue>{iconMap[currentSizeKey]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="small">Small (25%)</SelectItem>
                        <SelectItem value="medium">Medium (50%)</SelectItem>
                        <SelectItem value="large">Large (75%)</SelectItem>
                        <SelectItem value="full-width">Full Width</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Border Toggle */}
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

            {/* Padding Controls */}
            <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Padding (px)</Label>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <Label htmlFor="padding-top" className="text-xs">Top</Label>
                        <Input
                            id="padding-top"
                            type="number"
                            min="0"
                            max="100"
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
                            min="0"
                            max="100"
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
    const [activeTab, setActiveTab] = useState('edit');

    useEffect(() => {
        if (isOpen) {
            console.log("--- Dialog Opened: Resetting State ---");
            setSelectedTemplate(template || (availableTemplates && availableTemplates[0]) || null);
            setUploadedFiles({});
            setImageStyles({});
            setActiveTab('edit');
        }
    }, [isOpen, template, availableTemplates]);

    const populateContent = useCallback((data, placeholders, styles, forPreview = true) => {
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
                            page-break-inside: avoid;
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
                // Highlight unfilled placeholders
                const highlightedPlaceholder = `<span style="background-color: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 3px; font-weight: bold;">{${placeholder.name}}</span>`;
                content = content.replace(regex, highlightedPlaceholder);
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
            
            if (masterField.date_config?.useCurrentDate) {
                return {
                    value: formatDate(new Date(), masterField.date_config.format),
                    source: 'System (Current Date)'
                };
            }
            
            const targetEntityType = placeholder.entity_type || 'principal';
            const entityId = entityIdMap[targetEntityType];
            
            if (!entityId) {
                console.log(`No entityId found for type: ${targetEntityType}`);
                continue;
            }
            
            if (masterField.sources) {
                for (const source of masterField.sources) {
                    if (placeholder.name.startsWith('%')) {
                        const docType = placeholder.name.replace(/%/g, '');
                        console.log(`[Image Source] Looking for document type: "${docType}" for company: ${entityIdMap?.company}`);

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
                            return {
                                value: imageUrl,
                                source: 'Document'
                            };
                        }
                    } else if (source.table && sourceDataCache[source.table]) {
                        const records = Object.values(sourceDataCache[source.table]);
                        const linkingVar = source.linking_variable || 'id';
                        
                        // Find record based on linking variable
                        const record = records.find(r => {
                            const recordValue = String(r[linkingVar] || '');
                            const targetValue = String(entityId);
                            return recordValue === targetValue;
                        });
                        
                        if (record) {
                            console.log(`[getPlaceholderValue] Found record for ${placeholder.name}:`, {
                                table: source.table,
                                path: source.path,
                                linkingVar,
                                entityId,
                                recordId: record.id,
                                matchedField: record[linkingVar]
                            });
                            
                            const value = parseJsonValue(record, source.path);
                            
                            console.log(`[getPlaceholderValue] Parsed value for ${placeholder.name}:`, {
                                path: source.path,
                                value,
                                recordData: record
                            });
                            
                            if (value) {
                                values.push(String(value));
                                sourceName = 'Master Field';
                                break;
                            }
                        } else {
                            console.log(`[getPlaceholderValue] No record found for ${placeholder.name}:`, {
                                table: source.table,
                                linkingVar,
                                entityId,
                                availableRecords: records.length,
                                availableValues: records.map(r => r[linkingVar])
                            });
                        }
                    }
                }
            }
        }

        if (values.length > 0) {
            const finalValue = values.join(' ');
            return { value: finalValue, source: sourceName };
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
            const newStyles = {
                ...prevStyles,
                [name]: {
                    ...(prevStyles[name] || {}),
                    [key]: value
                }
            };
            const preview = populateContent(formData, selectedTemplate.placeholders, newStyles);
            setPreviewContent(preview);
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
                        textAlign: 'center',
                        showBorder: false,
                        paddingTop: 0,
                        paddingBottom: 0
                    };
                }
            });

            setFormData(initialFormData);
            setAutoPopulatedFields(autoPopulated);
            setManuallyEditedFields(new Set());
            setImageStyles(initialImageStyles);

            const preview = populateContent(initialFormData, placeholders, initialImageStyles, true);
            setPreviewContent(preview);
        }
    }, [isOpen, selectedTemplate, getPlaceholderValue, smartFieldMatch, populateContent]);

    const handleInputChange = (placeholderName, value) => {
        const updatedFormData = {
            ...formData,
            [placeholderName]: value
        };
        setFormData(updatedFormData);
        
        if (!manuallyEditedFields.has(placeholderName)) {
            setManuallyEditedFields(prev => new Set(prev).add(placeholderName));
        }
        
        setPreviewContent(populateContent(updatedFormData, selectedTemplate.placeholders, imageStyles));
    };

    const handleFileChange = (placeholderName, e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                toast({
                    title: "File Too Large",
                    description: "Please select an image smaller than 5MB.",
                    variant: "destructive",
                });
                return;
            }

            setUploadedFiles(prev => ({
                ...prev,
                [placeholderName]: file
            }));

            const reader = new FileReader();
            reader.onloadend = () => {
                handleInputChange(placeholderName, reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

const generateAndDownload = async (outputType = 'word') => {
        setIsGenerating(true);
        try {
            const fileName = `${documentName.replace(/[^\w\s-]/g, '_')}_${formatDate(new Date(), 'YYYYMMDD')}`;
            const placeholders = selectedTemplate?.placeholders || [];

            // 1. GENERATE HTML CONTENT
            console.log("[Gen] Populating content...");
            // Force preview mode to true to get actual <img> tags with Base64/URLs
            let fullHtml = populateContent(formData, placeholders, imageStyles, true);

            // Cleanup: Use DOMParser to strip potentially malformed <html>/<body> tags
            // and get a clean root for processing
            const parser = new DOMParser();
            const doc = parser.parseFromString(fullHtml, 'text/html');
            const rootElement = doc.body;

            if (outputType === 'word') {
                console.log("[Word Gen] Starting Word generation...");
                const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel, convertInchesToTwip, BorderStyle } = await import('docx');

                // 2. RECURSIVE PARSER
                // Returns an Array of Paragraphs (Block Elements)
                const processNode = async (node) => {
                    // A. Handle Text Nodes
                    if (node.nodeType === Node.TEXT_NODE) {
                        const text = node.textContent?.replace(/[\r\n]+/g, ' ').trim(); // Replace newlines with space, trim
                        if (text && text.length > 0) {
                            // Return text wrapped in a specialized object we can detect later
                            return [{ type: 'inline_text', val: new TextRun({ text: node.textContent }) }]; 
                        }
                        return [];
                    }

                    // B. Handle Elements
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const tagName = node.tagName.toLowerCase();
                        const style = node.getAttribute('style') || '';

                        // --- IMAGE HANDLING ---
                        if (tagName === 'img') {
                            const src = node.getAttribute('src');
                            if (!src) return [];

                            try {
                                console.log(`[Word Gen] Processing Image: ${src.substring(0, 30)}...`);
                                
                                let imageData;
                                // 1. Handle Base64
                                if (src.startsWith('data:')) {
                                    const base64Match = src.match(/^data:([^;]+);base64,(.+)$/);
                                    if (base64Match) {
                                        const binaryString = window.atob(base64Match[2]);
                                        const len = binaryString.length;
                                        const bytes = new Uint8Array(len);
                                        for (let i = 0; i < len; i++) {
                                            bytes[i] = binaryString.charCodeAt(i);
                                        }
                                        imageData = bytes;
                                    }
                                } 
                                // 2. Handle URL
                                else {
                                    const response = await fetch(src, { mode: 'cors' });
                                    const blob = await response.blob();
                                    imageData = new Uint8Array(await blob.arrayBuffer());
                                }

                                if (!imageData) throw new Error("Failed to load image data");

                                // --- DIMENSION CALCULATION (CRITICAL) ---
                                // Check style width (e.g., "50%"), attribute width, or default
                                let widthPercent = 100;
                                const styleWidthMatch = style.match(/width:\s*(\d+)%/i);
                                const attrWidth = node.getAttribute('width');
                                
                                if (styleWidthMatch) {
                                    widthPercent = parseInt(styleWidthMatch[1]);
                                } else if (attrWidth) {
                                    // If strictly number, treat as pixel, convert roughly to % of A4 (approx 600px usable)
                                    const val = parseInt(attrWidth);
                                    widthPercent = val < 100 ? 100 : Math.min(100, Math.round((val / 600) * 100)); 
                                }

                                // Convert to pixels (Word expects integers)
                                // 550px is roughly full width on A4 with margins
                                let pixelWidth = Math.floor((widthPercent / 100) * 550);
                                let pixelHeight = Math.floor(pixelWidth * 0.75); // Default 4:3 aspect ratio

                                // Safety check to prevent NaN/0 (which corrupts docx)
                                if (!pixelWidth || pixelWidth < 10) pixelWidth = 550;
                                if (!pixelHeight || pixelHeight < 10) pixelHeight = 400;

                                // Extract Alignment
                                const parentStyle = node.parentElement?.getAttribute('style') || '';
                                let align = AlignmentType.CENTER; // Default for images
                                if (parentStyle.includes('text-align: left')) align = AlignmentType.LEFT;
                                if (parentStyle.includes('text-align: right')) align = AlignmentType.RIGHT;

                                // Create ImageRun
                                const imageRun = new ImageRun({
                                    data: imageData,
                                    transformation: {
                                        width: pixelWidth,
                                        height: pixelHeight,
                                    },
                                });

                                // Return as a Block Paragraph
                                return [{ 
                                    type: 'block', 
                                    val: new Paragraph({
                                        children: [imageRun],
                                        alignment: align,
                                        spacing: { before: 200, after: 200 }
                                    })
                                }];

                            } catch (err) {
                                console.error("[Word Gen] Image Error:", err);
                                return [{ 
                                    type: 'block', 
                                    val: new Paragraph({
                                        children: [new TextRun({ text: "[Image Upload Failed]", color: "red", italics: true })]
                                    })
                                }];
                            }
                        }

                        // --- RECURSIVELY PROCESS CHILDREN ---
                        const childNodes = [];
                        for (const child of node.childNodes) {
                            const results = await processNode(child);
                            if (results) childNodes.push(...results);
                        }

                        // --- HEADINGS ---
                        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                            // Extract only inline text for the heading
                            const inlineChildren = childNodes
                                .filter(c => c.type === 'inline_text' || c.type === 'inline_run')
                                .map(c => c.val);
                                
                            return [{
                                type: 'block',
                                val: new Paragraph({
                                    children: inlineChildren,
                                    heading: HeadingLevel[`HEADING_${tagName[1]}`],
                                    spacing: { before: 240, after: 120 }
                                })
                            }];
                        }

                        // --- PARAGRAPHS / DIVS ---
                        if (tagName === 'p' || tagName === 'div' || tagName === 'li') {
                            // Logic: If this container has Block children (like an Image), 
                            // we must return a Flat list of blocks (split the paragraph).
                            // If it only has Inline children, we wrap them in one Paragraph.

                            const hasBlockChildren = childNodes.some(c => c.type === 'block');

                            if (hasBlockChildren) {
                                // FLATTENING STRATEGY
                                // We iterate children. Inline items get bundled into a temp paragraph.
                                // Block items get pushed directly.
                                const finalBlocks = [];
                                let currentInline = [];

                                const flushInline = () => {
                                    if (currentInline.length > 0) {
                                        finalBlocks.push({
                                            type: 'block',
                                            val: new Paragraph({ children: currentInline })
                                        });
                                        currentInline = [];
                                    }
                                };

                                childNodes.forEach(child => {
                                    if (child.type === 'block') {
                                        flushInline();
                                        finalBlocks.push(child);
                                    } else {
                                        currentInline.push(child.val);
                                    }
                                });
                                flushInline(); // Flush remaining
                                return finalBlocks;
                            } 
                            else {
                                // Only inline content? Wrap in single Paragraph.
                                if (childNodes.length === 0 && tagName === 'p') {
                                    // Preserve empty P
                                    return [{ type: 'block', val: new Paragraph({}) }];
                                }
                                if (childNodes.length === 0) return [];

                                // Determine alignment
                                let align = AlignmentType.LEFT;
                                if (style.includes('text-align: center')) align = AlignmentType.CENTER;
                                if (style.includes('text-align: right')) align = AlignmentType.RIGHT;
                                if (style.includes('text-align: justify')) align = AlignmentType.JUSTIFIED;

                                const inlineContent = childNodes.map(c => c.val);
                                
                                return [{
                                    type: 'block',
                                    val: new Paragraph({
                                        children: inlineContent,
                                        alignment: align,
                                        bullet: tagName === 'li' ? { level: 0 } : undefined,
                                        spacing: { after: 120 }
                                    })
                                }];
                            }
                        }

                        // --- INLINE STYLING (B, I, U, SPAN) ---
                        if (['strong', 'b', 'em', 'i', 'span', 'u'].includes(tagName)) {
                            // Transform child text runs to add style
                            return childNodes.map(child => {
                                if (child.type === 'inline_text' && child.val instanceof TextRun) {
                                    // Create new TextRun with added styles
                                    return {
                                        type: 'inline_text',
                                        val: new TextRun({
                                            text: child.val.root.text,
                                            bold: (tagName === 'b' || tagName === 'strong') ? true : child.val.root.bold,
                                            italics: (tagName === 'i' || tagName === 'em') ? true : child.val.root.italics,
                                            underline: (tagName === 'u') ? {} : child.val.root.underline,
                                            // Handle Highlight Span
                                            highlight: (tagName === 'span' && style.includes('background-color: #fef08a')) ? "yellow" : undefined
                                        })
                                    };
                                }
                                return child; // Pass through non-text children (shouldn't happen often in valid HTML)
                            });
                        }

                        // --- LINE BREAK ---
                        if (tagName === 'br') {
                            return [{ type: 'inline_text', val: new TextRun({ break: 1 }) }];
                        }

                        // Default: return children as-is (e.g. wrapper spans, table cells handled loosely)
                        return childNodes;
                    }
                    return [];
                };

                // 3. EXECUTE PARSE
                console.log("[Word Gen] Starting DOM Traversal");
                const processedNodes = [];
                for (const child of rootElement.childNodes) {
                    const result = await processNode(child);
                    if (result) processedNodes.push(...result);
                }

                // 4. CLEANUP & FINAL ASSEMBLY
                // Ensure everything at root is a Block (Paragraph)
                const finalParagraphs = [];
                let strayInline = [];

                const flushStray = () => {
                    if (strayInline.length > 0) {
                        finalParagraphs.push(new Paragraph({ children: strayInline }));
                        strayInline = [];
                    }
                };

                processedNodes.forEach(item => {
                    if (item.type === 'block') {
                        flushStray();
                        finalParagraphs.push(item.val);
                    } else {
                        strayInline.push(item.val);
                    }
                });
                flushStray();

                console.log(`[Word Gen] Final Paragraph Count: ${finalParagraphs.length}`);

                const doc = new Document({
                    sections: [{
                        properties: {
                            page: { margin: { top: convertInchesToTwip(1), right: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1) } }
                        },
                        children: finalParagraphs.length > 0 ? finalParagraphs : [new Paragraph("")]
                    }],
                });

                const blob = await Packer.toBlob(doc);
                saveAs(blob, `${fileName}.docx`);

            } else if (outputType === 'pdf') {
                // ... Existing PDF Logic ...
                const html2pdf = (await import('html2pdf.js')).default;
                const element = document.createElement('div');
                element.innerHTML = populateContent(formData, placeholders, imageStyles, true);
                element.style.padding = '40px';
                element.style.fontFamily = 'Arial, sans-serif';
                const opt = { margin: 0.5, filename: `${fileName}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }};
                await html2pdf().set(opt).from(element).save();
            }

            toast({ title: "Success", description: "Download started.", className: "bg-green-500 text-white" });
            setActiveTab('preview');

        } catch (error) {
            console.error("Generation Error:", error);
            toast({ title: "Generation Failed", description: error.message, variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };

    const completionStats = useMemo(() => {
        const placeholders = selectedTemplate?.placeholders || [];
        const total = placeholders.length;
        if (total === 0) return { total: 0, filled: 0, percentage: 100 };
        
        const filled = placeholders.filter(p => 
            formData[p.name] && String(formData[p.name]).trim() !== ''
        ).length;
        
        const percentage = Math.round((filled / total) * 100);
        return { total, filled, percentage };
    }, [formData, selectedTemplate]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-0">
                {/* Header */}
                <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500 rounded-lg">
                                <Wand2 className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold">{documentName}</DialogTitle>
                                <DialogDescription className="text-sm">
                                    Fill in the fields and generate your document
                                </DialogDescription>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose}>
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">
                                Completion: {completionStats.filled} of {completionStats.total} fields
                            </span>
                            <span className="text-muted-foreground">
                                {completionStats.percentage}%
                            </span>
                        </div>
                        <Progress value={completionStats.percentage} className="h-2" />
                    </div>
                </DialogHeader>

                {/* Main Content */}
                <div className="flex-1 overflow-hidden">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                        <TabsList className="mx-6 mt-4 grid w-[400px] grid-cols-2">
                            <TabsTrigger value="edit" className="flex items-center gap-2">
                                <Edit3 className="h-4 w-4" />
                                Edit Fields
                            </TabsTrigger>
                            <TabsTrigger value="preview" className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                Preview
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex-1 overflow-hidden">
                            <TabsContent value="edit" className="h-full m-0 p-0">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-full">
                                    {/* Form Panel */}
                                    <ScrollArea className="h-full border-r bg-white dark:bg-gray-950">
                                        <div className="p-6 space-y-4">
                                            {availableTemplates?.length > 1 && (
                                                <div className="space-y-2 bg-blue-50 dark:bg-gray-900 p-4 rounded-lg">
                                                    <Label className="text-sm font-semibold">Template</Label>
                                                    <Select 
                                                        value={selectedTemplate?.id} 
                                                        onValueChange={id => setSelectedTemplate(availableTemplates.find(t => t.id === id))}
                                                    >
                                                        <SelectTrigger className="bg-white dark:bg-gray-950">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {availableTemplates.map(t => (
                                                                <SelectItem key={t.id} value={t.id}>
                                                                    {t.file_name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}

                                            {selectedTemplate && (
                                                <div className="space-y-4">
                                                    {(selectedTemplate.placeholders || []).map(p => {
                                                        const isFilled = formData[p.name] && String(formData[p.name]).trim() !== '';
                                                        const isAutoPopulated = autoPopulatedFields.has(p.name);
                                                        const isManuallyEdited = manuallyEditedFields.has(p.name);

                                                        // Image Placeholder
                                                        if (p.type === 'image') {
                                                            const previewSrc = uploadedFiles[p.name] 
                                                                ? URL.createObjectURL(uploadedFiles[p.name]) 
                                                                : formData[p.name];
                                                            
                                                            return (
                                                                <div key={p.id} className="space-y-3 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900/50">
                                                                    <div className="flex items-center justify-between">
                                                                        <Label className="text-base font-semibold flex items-center gap-2">
                                                                            <ImageIcon className="h-4 w-4" />
                                                                            {p.description || p.name}
                                                                            {p.required && !isFilled && (
                                                                                <Badge variant="destructive" className="text-xs">
                                                                                    Required
                                                                                </Badge>
                                                                            )}
                                                                        </Label>
                                                                        {isFilled && (
                                                                            <Badge variant="success" className="text-xs">
                                                                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                                                                Added
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                    
                                                                    <div className={`w-full h-48 border-2 border-dashed rounded-lg flex items-center justify-center p-2 transition-colors ${
                                                                        isFilled ? 'bg-white dark:bg-gray-950 border-blue-300' : 'bg-gray-100 dark:bg-gray-800 border-gray-300'
                                                                    }`}>
                                                                        {previewSrc ? (
                                                                            <img 
                                                                                src={previewSrc} 
                                                                                alt="Preview" 
                                                                                className="max-h-full max-w-full object-contain rounded" 
                                                                            />
                                                                        ) : (
                                                                            <div className="text-center text-muted-foreground">
                                                                                <ImageIcon className="mx-auto h-12 w-12 mb-2" />
                                                                                <p className="text-sm">No image uploaded</p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    
                                                                    <div className="flex gap-2">
                                                                        <Button 
                                                                            asChild 
                                                                            variant="outline" 
                                                                            className="flex-1"
                                                                        >
                                                                            <label htmlFor={p.name} className="cursor-pointer flex items-center justify-center gap-2">
                                                                                <FileUp className="h-4 w-4" />
                                                                                {previewSrc ? 'Change Image' : 'Upload Image'}
                                                                                <input 
                                                                                    id={p.name} 
                                                                                    type="file" 
                                                                                    accept="image/*" 
                                                                                    className="sr-only" 
                                                                                    onChange={e => handleFileChange(p.name, e)} 
                                                                                />
                                                                            </label>
                                                                        </Button>
                                                                    </div>
                                                                    
                                                                    {isFilled && (
                                                                        <div className="pt-2 border-t">
                                                                            <Label className="text-xs text-muted-foreground mb-2 block">
                                                                                Image Styling
                                                                            </Label>
                                                                            <ImagePlaceholderControls 
                                                                                styles={imageStyles[p.name] || {}} 
                                                                                onStyleChange={(key, val) => handleImageStyleChange(p.name, key, val)} 
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        }

                                                        // Select (Dropdown) Placeholder
                                                        const masterField = p.master_field_ids && masterFields 
                                                            ? masterFields.get(parseInt(p.master_field_ids[0], 10)) 
                                                            : null;
                                                        
                                                        if (masterField && masterField.type === 'select') {
                                                            const options = (masterField.options && masterField.options[0]) 
                                                                ? masterField.options[0].split('\n') 
                                                                : [];
                                                            
                                                            return (
                                                                <div key={p.id} className="space-y-2 p-4 border rounded-lg hover:border-blue-300 transition-colors">
                                                                    <Label htmlFor={p.name} className="text-base font-semibold flex items-center gap-2">
                                                                        {p.description || p.name}
                                                                        {p.required && !isFilled && (
                                                                            <Badge variant="destructive" className="text-xs">
                                                                                Required
                                                                            </Badge>
                                                                        )}
                                                                        {isFilled && (
                                                                            <Badge variant="success" className="text-xs">
                                                                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                                                                Filled
                                                                            </Badge>
                                                                        )}
                                                                    </Label>
                                                                    <Select 
                                                                        value={formData[p.name] || ''} 
                                                                        onValueChange={value => handleInputChange(p.name, value)}
                                                                    >
                                                                        <SelectTrigger className={!isFilled && p.required ? 'border-destructive' : ''}>
                                                                            <SelectValue placeholder="Select an option" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {options.map(opt => (
                                                                                <SelectItem key={opt} value={opt}>
                                                                                    {opt}
                                                                                </SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                    {isAutoPopulated && !isManuallyEdited && (
                                                                        <p className="text-xs text-blue-600 flex items-center gap-1">
                                                                            <CheckCircle2 className="h-3 w-3" />
                                                                            Auto-populated from {autoPopulatedFields.get(p.name)}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            );
                                                        }

                                                        // Text/Date/Textarea Placeholder
                                                        const isLongText = p.type === 'textarea' || (formData[p.name] && String(formData[p.name]).length > 100);
                                                        
                                                        return (
                                                            <div key={p.id} className="space-y-2 p-4 border rounded-lg hover:border-blue-300 transition-colors">
                                                                <Label htmlFor={p.name} className="text-base font-semibold flex items-center gap-2">
                                                                    {p.description || p.name}
                                                                    {p.required && !isFilled && (
                                                                        <Badge variant="destructive" className="text-xs">
                                                                            Required
                                                                        </Badge>
                                                                    )}
                                                                    {isFilled && (
                                                                        <Badge variant="success" className="text-xs">
                                                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                                                            Filled
                                                                        </Badge>
                                                                    )}
                                                                </Label>
                                                                
                                                                {isLongText ? (
                                                                    <Textarea
                                                                        id={p.name}
                                                                        value={formData[p.name] || ''}
                                                                        onChange={e => handleInputChange(p.name, e.target.value)}
                                                                        className={`min-h-[100px] ${!isFilled && p.required ? 'border-destructive' : ''}`}
                                                                        placeholder={`Enter ${p.description || p.name}`}
                                                                    />
                                                                ) : (
                                                                    <Input
                                                                        id={p.name}
                                                                        type={p.type === 'date' ? 'date' : 'text'}
                                                                        value={p.type === 'date' 
                                                                            ? formatDate(formData[p.name], 'YYYY-MM-DD') 
                                                                            : (formData[p.name] || '')
                                                                        }
                                                                        onChange={e => handleInputChange(p.name, e.target.value)}
                                                                        className={!isFilled && p.required ? 'border-destructive' : ''}
                                                                        placeholder={`Enter ${p.description || p.name}`}
                                                                    />
                                                                )}
                                                                
                                                                {isAutoPopulated && !isManuallyEdited && (
                                                                    <p className="text-xs text-blue-600 flex items-center gap-1">
                                                                        <CheckCircle2 className="h-3 w-3" />
                                                                        Auto-populated from {autoPopulatedFields.get(p.name)}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {!selectedTemplate && (
                                                <div className="text-center p-12">
                                                    <FileText className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                                                    <h3 className="text-lg font-medium mb-2">No Templates Available</h3>
                                                    <p className="text-sm text-muted-foreground">
                                                        Please create a template first to generate documents.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </ScrollArea>

                                    {/* Live Preview Panel (for edit tab) */}
                                    <div className="bg-gray-100 dark:bg-gray-900 p-6 overflow-y-auto">
                                        <div className="max-w-3xl mx-auto">
                                            <div className="bg-white shadow-2xl rounded-lg overflow-hidden">
                                                <div className="bg-gray-200 dark:bg-gray-800 px-4 py-2 flex items-center gap-2 border-b">
                                                    <div className="flex gap-1.5">
                                                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                                    </div>
                                                    <span className="text-xs text-muted-foreground ml-2">Live Preview</span>
                                                </div>
                                                <div 
                                                    dangerouslySetInnerHTML={{ __html: previewContent }}
                                                    className="prose prose-sm max-w-none p-8"
                                                    style={{
                                                        minHeight: '400px',
                                                        fontFamily: 'Georgia, serif',
                                                        lineHeight: '1.6',
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="preview" className="h-full m-0 p-0">
                                <div className="h-full bg-gray-100 dark:bg-gray-900 p-8 overflow-y-auto">
                                    <div className="max-w-4xl mx-auto">
                                        <div className="bg-white shadow-2xl rounded-lg overflow-hidden">
                                            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4 text-white">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h3 className="text-lg font-semibold">Document Preview</h3>
                                                        <p className="text-sm text-blue-100">
                                                            {documentName} • {formatDate(new Date(), 'YYYY-MM-DD')}
                                                        </p>
                                                    </div>
                                                    <Badge variant="secondary" className="bg-white/20 text-white">
                                                        {completionStats.percentage}% Complete
                                                    </Badge>
                                                </div>
                                            </div>
                                            <div 
                                                dangerouslySetInnerHTML={{ __html: previewContent }}
                                                className="prose prose-base max-w-none p-12"
                                                style={{
                                                    minHeight: '800px',
                                                    fontFamily: 'Georgia, serif',
                                                    lineHeight: '1.8',
                                                    fontSize: '14pt',
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>

                {/* Footer */}
                <DialogFooter className="border-t px-6 py-4 bg-gray-50 dark:bg-gray-900/50">
                    <div className="flex items-center justify-between w-full">
                        <div className="text-sm text-muted-foreground flex items-center gap-4">
                            {autoPopulatedFields.size > 0 && (
                                <span className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    <strong>{autoPopulatedFields.size}</strong> fields auto-populated
                                </span>
                            )}
                            {completionStats.total > 0 && completionStats.filled < completionStats.total && (
                                <span className="flex items-center gap-2 text-amber-600">
                                    <AlertCircle className="h-4 w-4" />
                                    {completionStats.total - completionStats.filled} fields remaining
                                </span>
                            )}
                        </div>
                        <div className='flex gap-2'>
                            <Button variant="outline" onClick={onClose} disabled={isGenerating}>
                                Cancel
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button 
                                        disabled={isGenerating || !selectedTemplate} 
                                        className="min-w-[200px]"
                                    >
                                        {isGenerating ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Generating...
                                            </>
                                        ) : (
                                            <>
                                                <Download className="mr-2 h-4 w-4" />
                                                Generate & Download
                                            </>
                                        )}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => generateAndDownload('word')}>
                                        <FileText className="mr-2 h-4 w-4" />
                                        Word Document (.docx)
                                    </DropdownMenuItem>
                                    {selectedTemplate?.file_type === 'text/html' && (
                                        <DropdownMenuItem onClick={() => generateAndDownload('pdf')}>
                                            <FileText className="mr-2 h-4 w-4" />
                                            PDF Document (.pdf)
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}