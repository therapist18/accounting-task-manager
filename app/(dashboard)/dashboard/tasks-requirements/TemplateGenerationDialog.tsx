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

// --- CONSTANTS ---
const ISSUE_DATE_FIELDS = ['effect_from', 'from', 'valid_from', 'with effect_from', 'date_issued', 'issued_date', 'issued_at', 'date_of_issue', 'Date_of_Issue'];

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

const getDocumentDate = (doc) => {
    // Try all possible date field names in order of preference
    const dateFields = [
        'issue_date', 'issued_date', 'date_issued', 'issued_at', 'date_of_issue', 'Date_of_Issue',
        'effective_date', 'date_effective', 'valid_from', 'valid_until', 'expiry_date', 'expiration_date',
        'created_at', 'updated_at', 'submission_date'
    ];
    
    for (const field of dateFields) {
        const dateValue = doc[field] || 
                         (doc.extracted_details && doc.extracted_details[field]);
        if (dateValue) {
            const date = new Date(dateValue);
            if (!isNaN(date.getTime())) return { date, field };
        }
    }
    return { date: null, field: null };
};

const getPlaceholderValue = useCallback((placeholder) => {
    console.log('\n' + '='.repeat(80));
    console.log(`📌 PROCESSING PLACEHOLDER: {${placeholder.name}}`);
    console.log('='.repeat(80));
    console.log('Placeholder object:', JSON.stringify(placeholder, null, 2));
    const ids = placeholder.master_field_ids || (placeholder.master_field_id ? [placeholder.master_field_id] : []);
    const targetDocumentId = placeholder.document_id; // A specific instance of a document
    
    // Log document linking information
    if (targetDocumentId) {
        console.log(`  🔗 Placeholder is linked to specific document ID: ${targetDocumentId}`);
    } else if (ids.length > 0) {
        console.log(`  🔄 Placeholder is linked to master field IDs: ${ids.join(', ')}`);
        
        // Log master field details if available
        ids.forEach(id => {
            const masterFieldId = parseInt(id, 10);
            if (!isNaN(masterFieldId) && masterFields?.has(masterFieldId)) {
                const field = masterFields.get(masterFieldId);
                console.log(`    📋 Master Field ${masterFieldId}: ${field.label || field.field_key}`);
                if (field.sources?.length) {
                    console.log(`      Sources: ${field.sources.map(s => 
                        `${s.table}${s.document_id ? ` (Doc Types: ${JSON.stringify(s.document_id)})` : ''}`
                    ).join(', ')}`);
                }
            }
        });
    }

    console.log('\n🔍 Available Data:');
    console.log('- Master Fields:', masterFields ? `Available (${masterFields.size} fields)` : 'Not available');
    console.log('- Source Data Cache:', sourceDataCache ? `Available (${Object.keys(sourceDataCache).length} tables)` : 'Not available');
    console.log('- Entity ID Map:', entityIdMap ? JSON.stringify(entityIdMap, null, 2) : 'Not available');
    
    if (ids.length > 0 && masterFields && sourceDataCache && entityIdMap) {
        const values = ids.flatMap(id => {
            const masterFieldId = parseInt(id, 10);
            if (isNaN(masterFieldId) || !masterFields.has(masterFieldId)) {
                console.log(`  ⚠️ Invalid or missing master field ID: ${id}`);
                return [];
            }

            const masterField = masterFields.get(masterFieldId);
            if (!masterField?.sources) {
                console.log(`  ⚠️ Master field ${masterFieldId} has no sources`);
                return [];
            }

            const targetEntityType = placeholder.entity_type || 'principal';
            const entityId = entityIdMap[targetEntityType];

            if (!entityId) {
                console.log(`  ⚠️ No entity ID found for type: ${targetEntityType}`);
                return [];
            }

            console.log(`\n🔧 Processing master field ID: ${masterFieldId}`);
            console.log('Field details:', {
                key: masterField.field_key,
                label: masterField.label,
                sources: masterField.sources?.length || 0
            });
            
            return masterField.sources.flatMap((source, sourceIndex) => {
                console.log(`\n  🔄 Source ${sourceIndex + 1}/${masterField.sources.length}:`);
                console.log('  - Type:', source.type);
                console.log('  - Table:', source.table);
                console.log('  - Path:', source.path);
                
                // Fix document_id handling - ensure it's a proper array of UUIDs
                if (source.document_id) {
                    let docIds: string[] = [];
                    
                    // Convert to string if it's an array of characters
                    const docIdStr = Array.isArray(source.document_id) 
                        ? source.document_id.join('') 
                        : String(source.document_id);
                    
                    // First try to split by comma if present
                    if (docIdStr.includes(',')) {
                        docIds = docIdStr.split(',').map(id => id.trim()).filter(Boolean);
                    } 
                    // If no commas, try to split by UUID pattern (8-4-4-4-12)
                    else if (docIdStr.length > 36) { // Minimum length for 2 UUIDs without separators
                        // This regex matches UUIDs in the format xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
                        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
                        const matches = docIdStr.match(uuidRegex);
                        if (matches) {
                            docIds = [...new Set(matches)]; // Remove duplicates
                        } else {
                            // If no matches, try to split into chunks of 36 characters (UUID length with dashes)
                            const chunkSize = 36;
                            for (let i = 0; i < docIdStr.length; i += chunkSize) {
                                const chunk = docIdStr.substring(i, i + chunkSize);
                                if (chunk.length >= 32) { // Minimum length for a UUID without dashes
                                    // Try to format as UUID if it's just the hex
                                    const formatted = chunk.length === 32 
                                        ? `${chunk.substring(0,8)}-${chunk.substring(8,12)}-${chunk.substring(12,16)}-${chunk.substring(16,20)}-${chunk.substring(20)}`
                                        : chunk;
                                    docIds.push(formatted);
                                }
                            }
                        }
                    } 
                    // If it's a single UUID or couldn't be split, use as is
                    else {
                        docIds = [docIdStr];
                    }
                    
                    // Clean up and store the processed document IDs
                    source.document_id = docIds.filter(id => id && id.trim() !== '');
                    console.log('  - Processed Document IDs:', source.document_id);
                }
                console.log('  - Document IDs:', source.document_id || 'Any');
                
                if (source.table && sourceDataCache[source.table]) {
                    const tableData = sourceDataCache[source.table];
                    console.log(`  - Table data (${Object.keys(tableData).length} records):`, 
                        Object.values(tableData).map((d: any) => ({
                            id: d.id,
                            document_id: d.document_id,
                            extracted: Object.keys(d.extracted_details || {}).length > 0 ? 'Yes' : 'No'
                        })));
                }
                if (source.type === 'documents' && sourceDataCache[source.table]) {
                    // Get all documents for the entity from the cache
                    console.log(`  📂 Fetching documents from table: ${source.table}`);
                    let allEntityDocuments = Object.values(sourceDataCache[source.table] || {});
                    console.log(`  - Found ${allEntityDocuments.length} total documents in table`);
                    
                    // Log first few documents for debugging
                    allEntityDocuments.slice(0, 3).forEach((doc: any, i) => {
                        console.log(`    ${i + 1}. ID: ${doc.id}, Document ID: ${doc.document_id}, ` +
                                  `Extracted: ${Object.keys(doc.extracted_details || {}).length} fields`);
                    });
                    if (allEntityDocuments.length > 3) {
                        console.log(`    ...and ${allEntityDocuments.length - 3} more`);
                    }
                    
                    // Filter by document type if specified in the source
                    console.log('\n  🔍 Filtering documents...');
                    let candidateDocuments = allEntityDocuments;
                    
                    if (source.document_id) {
                        // At this point, document_id should be an array of strings (UUIDs)
                        const docIds = Array.isArray(source.document_id) ? 
                            source.document_id.map(id => String(id).trim()).filter(Boolean) : 
                            [String(source.document_id).trim()];
                        
                        console.log(`  - Filtering for document IDs:`, docIds);
                        console.log(`  - Total documents before filtering: ${allEntityDocuments.length}`);
                        
                        const beforeCount = allEntityDocuments.length;
                        const allowedIdsSet = new Set(docIds);
                        
                        candidateDocuments = allEntityDocuments.filter(doc => 
                            doc.document_id && allowedIdsSet.has(doc.document_id.trim())
                        );
                        
                        console.log(`  - Filtered from ${beforeCount} to ${candidateDocuments.length} documents`);
                        
                        // Log document IDs that were found/not found
                        if (candidateDocuments.length === 0) {
                            console.log('  ❌ No matching documents found. Available document IDs:', 
                                allEntityDocuments.map(d => d.document_id).filter(Boolean));
                        } else {
                            console.log('  ✅ Found matching documents with IDs:', 
                                candidateDocuments.map(d => d.document_id));
                        }
                    } else {
                        console.log('  - No document type filter applied');
                    }
                    
                    // Log document details for debugging
                    if (candidateDocuments.length > 0) {
                        console.log(`    📄 Available documents (${candidateDocuments.length}):`);
                        candidateDocuments.forEach((doc, idx) => {
                            const docDate = getDocumentDate(doc);
                            console.log(`      ${idx + 1}. ID: ${doc.id}, ` +
                                      `Document ID: ${doc.document_id}, ` +
                                      `Type: ${doc.document_type || 'N/A'}, ` +
                                      `Date: ${docDate.date ? `${docDate.field}=${docDate.date.toISOString()}` : 'N/A'}`);
                            
                            // Log extracted details if available
                            if (doc.extracted_details) {
                                console.log(`         Extracted: ${JSON.stringify(doc.extracted_details, (k, v) => 
                                    v !== null && v !== undefined ? v : undefined, 2).replace(/\n/g, '\n         ')}`);
                            }
                        });
                        console.log(`    - Found ${candidateDocuments.length} documents of required type(s)`);
                    }
                    // If no candidates, this source cannot provide a value
                    if (candidateDocuments.length === 0) {
                        console.log('❌ NO MATCHING DOCUMENTS FOUND!');
                        console.log('- Document types expected:', source.document_id || 'Any');
                        console.log('- Available document types in table:', 
                            [...new Set(allEntityDocuments.map((d: any) => d.document_id))]);
                        return [];
                    }

                    // PRIORITY 1: Use the exact document if specified
                    console.log('\n  🔎 Document Selection:');
                    if (targetDocumentId) {
                        console.log(`  - Looking for specific document ID: ${targetDocumentId}`);
                        console.log(`  🎯 Looking for specific document instance ID: ${targetDocumentId}`);
                        const specificDoc = candidateDocuments.find(doc => doc.id === targetDocumentId);
                        if (specificDoc) {
                            console.log(`    ✅ Found exact document match`);
                            return parseJsonValue(specificDoc, source.path) || [];
                        }
                        console.log(`    ⚠️ Specified document not found, falling back to latest document`);
                    }

                    // PRIORITY 2: Find the most recent document based on issue/effective dates
                    console.log('\n  📅 Finding most recent document by date...');
                    console.log(`  - Documents to check: ${candidateDocuments.length}`);
                    const documentsWithDates = candidateDocuments.map(doc => ({
                        doc,
                        ...getDocumentDate(doc)
                    })).filter(d => d.date);

                    if (documentsWithDates.length > 0) {
                        console.log(`  - Found ${documentsWithDates.length} documents with valid dates`);
                        documentsWithDates.forEach((d, i) => {
                            console.log(`    ${i + 1}. ID: ${d.doc.id}, ${d.field}: ${d.date.toISOString()}`);
                        });
                        // Sort by date descending (newest first)
                        documentsWithDates.sort((a, b) => b.date - a.date);
                        const latestDoc = documentsWithDates[0];
                        console.log(`    ✅ Found latest document (ID: ${latestDoc.doc.id}) with ${latestDoc.field} = ${latestDoc.date.toISOString()}`);
                        
                        // Get and log the resolved value
                        const resolvedValue = parseJsonValue(latestDoc.doc, source.path);
                        console.log(`    📝 Resolved value from document ${latestDoc.doc.id}:`, 
                            JSON.stringify(resolvedValue, null, 2).replace(/\n/g, '\n    '));
                            
                        return resolvedValue || [];
                    }

                    // If no dates found, fall back to created_at or first document
                    console.log('\n  ℹ️ No date fields found in any document');
                    console.log('  - Falling back to first available document');
                    if (candidateDocuments.length > 0) {
                        console.log(`  - Selected document ID: ${candidateDocuments[0].id}`);
                        const firstDoc = candidateDocuments[0];
                        console.log(`    📄 Using first available document (ID: ${firstDoc.id})`);
                        const resolvedValue = parseJsonValue(firstDoc, source.path);
                        console.log(`    📝 Resolved value from document ${firstDoc.id}:`, 
                            JSON.stringify(resolvedValue, null, 2).replace(/\n/g, '\n    '));
                        return resolvedValue || [];
                    }
                } else if (source.table && sourceDataCache[source.table]) {
                    // Handle non-document sources
                    const allRecords = Object.values(sourceDataCache[source.table] || {});
                    const linkingVariable = source.linking_variable || 'id';
                    const record = allRecords.find(rec => 
                        String(rec[linkingVariable]) === String(entityId)
                    );
                    if (record) {
                        return parseJsonValue(record, source.path) || [];
                    }
                }
                return [];
            });
        }).filter(v => v !== null && v !== undefined && String(v).trim() !== '');

        if (values.length > 0) {
            const finalValue = values.join(' ');
            console.log(`  ✅ FINAL RESOLVED VALUE for {${placeholder.name}}:`);
            console.log(`  ┌${'─'.repeat(50)}`);
            console.log(`  │ Value: "${finalValue}"`);
            console.log(`  │ Source: Master Field`);
            console.log(`  │ Document IDs: ${targetDocumentId || 'Auto-selected'}`);
            if (targetDocumentId) {
                console.log(`  │ Specific Document: ${targetDocumentId}`);
            }
            console.log(`  └${'─'.repeat(50)}`);
            return { value: finalValue, source: 'Master Field' };
        } else {
            console.log(`  ⚠️ No valid values found for placeholder`);
        }
    } else {
        console.log(`  ℹ️ No master field IDs found, falling back to smart match`);
    }

    // Fallback to simple smart match
    const match = smartFieldMatch(placeholder.name);
    if (match.value) {
        console.log(`  🔍 Smart matched value: "${match.value}" from ${match.source}`);
    }
    return match;
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
    }, [isOpen, template, getPlaceholderValue, populateContent, masterFields, entityIdMap, sourceDataCache, extractedData]);

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