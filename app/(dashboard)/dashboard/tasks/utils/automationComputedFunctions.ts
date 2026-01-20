// @ts-nocheck
import supabase from "@/lib/supabase/client";

/**
 * Parses a date string into a Date object, supporting multiple date formats
 */
const parseDateString = (dateInput: string | Date | null | undefined): Date | null => {
    if (!dateInput) return null;
    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) return dateInput;
    if (typeof dateInput !== 'string') return null;

    let date = new Date(dateInput);
    if (!isNaN(date.getTime())) return date;

    const cleanedDateInput = dateInput.trim();

    const formatPatterns = [
        { regex: /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/, parts: { day: 1, month: 2, year: 3 } },
        { regex: /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/, parts: { year: 1, month: 2, day: 3 } },
        { regex: /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})$/i, parts: { monthName: 1, day: 2, year: 3 } },
        { regex: /^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i, parts: { day: 1, monthName: 2, year: 3 } },
    ];

    const monthMap = {
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
        'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
        'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12
    };

    for (const { regex, parts } of formatPatterns) {
        const match = cleanedDateInput.match(regex);
        if (match) {
            const day = parseInt(match[parts.day], 10);
            const year = parseInt(match[parts.year], 10);
            let month;

            if (parts.month) {
                month = parseInt(match[parts.month], 10);
            } else if (parts.monthName) {
                month = monthMap[match[parts.monthName].toLowerCase()];
            }

            if (day && month && year) {
                const parsedDate = new Date(Date.UTC(year, month - 1, day));
                if (!isNaN(parsedDate.getTime())) {
                    return parsedDate;
                }
            }
        }
    }

    return null;
};

// --- HELPERS ---

/**
 * Fetches uploaded documents and their corresponding type definitions from the DB.
 */
async function fetchDocsAndTypes(individualId: string | number, documentIds: string[]) {
    console.log(`[Computed] Fetching docs for Individual: ${individualId}, DocTypes: ${documentIds.join(', ')}`);

    if (!individualId || !documentIds || documentIds.length === 0) {
        console.warn("[Computed] Missing individualId or computedDocuments array.");
        return { docs: [], types: [] };
    }

    const { data: docTypes, error: typeError } = await supabase
        .from('acc_portal_kyc')
        .select('*')
        .in('id', documentIds);

    if (typeError) {
        console.error("[Computed] Error fetching doc types:", typeError);
        return { docs: [], types: [] };
    }

    const { data: uploadedDocs, error: docError } = await supabase
        .from('acc_portal_directors_documents')
        .select('*')
        .eq('director_id', individualId)
        .in('document_id', documentIds)
        .neq('status', 'deleted');

    if (docError) {
        console.error("[Computed] Error fetching uploaded documents:", docError);
        return { docs: [], types: [] };
    }

    console.log(`[Computed] Found ${uploadedDocs?.length} uploads and ${docTypes?.length} type definitions.`);
    return { docs: uploadedDocs || [], types: docTypes || [] };
}

/**
 * Sorts documents by 'Effective Date' (Newest First).
 */
function sortDocsByRecency(docs: any[], docTypes: any[]) {
    return docs.map(doc => {
        const type = docTypes.find((t: any) => t.id === doc.document_id);
        const details = doc.extracted_details || {};
        
        let sortDate = new Date(0);
        let dateSource = "none";

        if (type?.fields && Array.isArray(type.fields)) {
            const effectiveFromField = type.fields.find((f: any) => f.isEffectiveFrom);
            
            if (effectiveFromField && details[effectiveFromField.name]) {
                const parsed = parseDateString(details[effectiveFromField.name]);
                if (parsed) {
                    sortDate = parsed;
                    dateSource = `isEffectiveFrom (${effectiveFromField.name})`;
                }
            }
            
            if (dateSource === "none") {
                const issueField = type.fields.find((f: any) => 
                    f.name.toLowerCase().includes('issue') && f.name.toLowerCase().includes('date')
                );
                if (issueField && details[issueField.name]) {
                    const parsed = parseDateString(details[issueField.name]);
                    if (parsed) {
                        sortDate = parsed;
                        dateSource = `Name Match (${issueField.name})`;
                    }
                }
            }
        }

        if (dateSource === "none" && doc.created_at) {
            sortDate = new Date(doc.created_at);
            dateSource = "created_at";
        }
        
        return { doc, type, sortDate, dateSource };
    }).sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
}

// --- NEW: ARRAY EXTRACTION FUNCTION ---

/**
 * ARRAY EXTRACTION: extractFieldFromAllDocuments
 * 
 * Returns an array of values extracted from ALL documents (not just the latest).
 * This is used for array fields like "List of Previous Permits".
 * 
 * @param individualId - The director/individual ID
 * @param documentIds - Array of document type IDs to search
 * @param fieldPath - The JSON path to extract from each document
 * @returns Array of extracted values (one per document)
 */
export async function extractFieldFromAllDocuments(
    individualId: string | number,
    documentIds: string[],
    fieldPath: string
): Promise<string[]> {
    try {
        console.log(`[Array-Extract] Individual: ${individualId}, DocTypes: ${documentIds.join(',')}, Path: ${fieldPath}`);
        
        const { docs, types } = await fetchDocsAndTypes(individualId, documentIds);
        
        if (docs.length === 0) {
            console.warn("[Array-Extract] No documents found");
            return [];
        }

        // Sort all documents by recency (newest first)
        const sorted = sortDocsByRecency(docs, types);
        
        console.log(`[Array-Extract] Processing ${sorted.length} documents`);

        // Extract the field from EACH document
        const results: string[] = [];
        
        for (const item of sorted) {
            const doc = item.doc;
            let value: any = null;

            if (fieldPath.includes("->>")) {
                const match = fieldPath.match(/['"]?(\w+)['"]?\s*->>['"]?(\w+)['"]?/);
                if (match) {
                    const column = match[1];
                    const key = match[2];
                    
                    const columnData = doc[column];
                    if (columnData && typeof columnData === 'object') {
                        value = columnData[key];
                    }
                }
            } else {
                value = doc[fieldPath];
            }

            // Add to results (even if null, we want to maintain array length)
            results.push(value !== null && value !== undefined ? String(value) : "");
        }

        console.log(`[Array-Extract] Extracted ${results.length} values`);
        return results;

    } catch (error) {
        console.error("[Array-Extract] Error:", error);
        return [];
    }
}

// --- EXISTING: SINGLE VALUE EXTRACTION ---

/**
 * GENERIC COMPUTED FUNCTION: extractFieldFromLatestDocument
 * 
 * Extracts a SINGLE value from the LATEST document.
 */
export async function extractFieldFromLatestDocument(
    individualId: string | number, 
    documentIds: string[], 
    fieldPath: string
): Promise<string> {
    try {
        console.log(`[Generic-Extract] Individual: ${individualId}, DocTypes: ${documentIds.join(',')}, Path: ${fieldPath}`);
        
        const { docs, types } = await fetchDocsAndTypes(individualId, documentIds);
        
        if (docs.length === 0) {
            console.warn("[Generic-Extract] No documents found");
            return "Missing Document";
        }

        const sorted = sortDocsByRecency(docs, types);
        const latest = sorted[0];
        
        console.log(`[Generic-Extract] Latest doc ID: ${latest.doc.id}, Type: ${latest.type?.display_name}`);

        let value: any = null;

        if (fieldPath.includes("->>")) {
            const match = fieldPath.match(/['"]?(\w+)['"]?\s*->>['"]?(\w+)['"]?/);
            if (match) {
                const column = match[1];
                const key = match[2];
                
                const columnData = latest.doc[column];
                if (columnData && typeof columnData === 'object') {
                    value = columnData[key];
                }
            }
        } else {
            value = latest.doc[fieldPath];
        }

        if (value === null || value === undefined) {
            console.warn(`[Generic-Extract] Field not found in document: ${fieldPath}`);
            return "Field Not Found";
        }

        const result = String(value);
        console.log(`[Generic-Extract] Extracted value: "${result}"`);
        return result;

    } catch (error) {
        console.error("[Generic-Extract] Error:", error);
        return "Extraction Error";
    }
}

// --- LEGACY FUNCTIONS (Unchanged) ---

export async function getLatestDocumentNumber(individualId: string | number, computedDocuments: string[]): Promise<string> {
    const commonPaths = [
        "extracted_details->>'Passport_Number'",
        "extracted_details->>'Passport_No'",
        "extracted_details->>'Permit_Number'",
        "extracted_details->>'Permit_No'",
        "extracted_details->>'Document_Number'",
        "extracted_details->>'ID_Number'",
        "extracted_details->>'Reference_Number'"
    ];

    for (const path of commonPaths) {
        const result = await extractFieldFromLatestDocument(individualId, computedDocuments, path);
        if (result !== "Field Not Found" && result !== "Missing Document") {
            return result;
        }
    }

    return "Number Not Found";
}

export async function getLatestDocumentExpiryDate(individualId: string | number, computedDocuments: string[]): Promise<string> {
    const commonPaths = [
        "extracted_details->>'Date_of_Expiry'",
        "extracted_details->>'Expiry_Date'",
        "extracted_details->>'Valid_Until'",
        "extracted_details->>'Expiration_Date'"
    ];

    for (const path of commonPaths) {
        const result = await extractFieldFromLatestDocument(individualId, computedDocuments, path);
        if (result !== "Field Not Found" && result !== "Missing Document") {
            const parsed = parseDateString(result);
            if (parsed) {
                return parsed.toISOString().split('T')[0];
            }
            return result;
        }
    }

    return "Expiry Not Found";
}

export async function getLatestDocumentIssueDate(individualId: string | number, computedDocuments: string[]): Promise<string> {
    const commonPaths = [
        "extracted_details->>'Date_of_Issue'",
        "extracted_details->>'Issue_Date'",
        "extracted_details->>'With_Effect_From'",
        "extracted_details->>'Issued_Date'"
    ];

    for (const path of commonPaths) {
        const result = await extractFieldFromLatestDocument(individualId, computedDocuments, path);
        if (result !== "Field Not Found" && result !== "Missing Document") {
            const parsed = parseDateString(result);
            if (parsed) {
                return parsed.toISOString().split('T')[0];
            }
            return result;
        }
    }

    return "Issue Date Not Found";
}

export async function determineImmigrationStatus(individualId: string | number, computedDocuments: string[]): Promise<string> {
    const { docs, types } = await fetchDocsAndTypes(individualId, computedDocuments);
    if(docs.length === 0) return "No Status Doc";
    
    const sorted = docs.map(doc => {
        const type = types.find((t: any) => t.id === doc.document_id);
        const details = doc.extracted_details || {};
        
        let expiryDate = new Date(0);
        let issueDate = new Date(0);
        
        if (type?.fields) {
            const expField = type.fields.find((f: any) => f.isEffectiveTo);
            if (expField && details[expField.name]) {
                const p = parseDateString(details[expField.name]);
                if(p) expiryDate = p;
            }

            const issueField = type.fields.find((f: any) => f.isEffectiveFrom);
            if (issueField && details[issueField.name]) {
                const p = parseDateString(details[issueField.name]);
                if(p) issueDate = p;
            } else if (doc.created_at) {
                issueDate = new Date(doc.created_at);
            }
        }
        return { doc, type, expiryDate, issueDate };
    }).sort((a,b) => {
        if (a.expiryDate.getTime() !== b.expiryDate.getTime()) {
            return b.expiryDate.getTime() - a.expiryDate.getTime();
        }
        return b.issueDate.getTime() - a.issueDate.getTime();
    });

    const current = sorted[0];
    const now = new Date();

    if (current.expiryDate.getTime() > 0 && current.expiryDate < now) {
        return "Expired (" + (current.type?.display_name || "Unknown") + ")";
    }
    
    return current.type?.display_name || "Unknown Status";
}

export async function getLatestWorkPermit(individualId: string | number, computedDocuments: string[]): Promise<string> {
    return await getLatestDocumentNumber(individualId, computedDocuments);
}

/**
 * MASTER ROUTER - Enhanced to support array extraction
 */
export async function executeComputedField(
    functionName: string,
    individualId: number | string,
    computedDocuments: string[],
    fieldPath?: string,
    extractionMode: 'latest' | 'all' = 'latest' // NEW parameter
): Promise<string | string[]> {
    const normalizedFunctionName = functionName.replace(/\(\)/g, '').trim();
    console.log(`[Computed-Router] Executing: ${normalizedFunctionName}, Mode: ${extractionMode}`);

    // If a fieldPath is provided
    if (fieldPath) {
        if (extractionMode === 'all') {
            console.log(`[Computed-Router] Array extraction with path: ${fieldPath}`);
            return await extractFieldFromAllDocuments(individualId, computedDocuments, fieldPath);
        } else {
            console.log(`[Computed-Router] Single extraction with path: ${fieldPath}`);
            return await extractFieldFromLatestDocument(individualId, computedDocuments, fieldPath);
        }
    }

    // Legacy named functions (always return single value)
    switch (normalizedFunctionName) {
        case 'determineImmigrationStatus':
            return await determineImmigrationStatus(individualId, computedDocuments);
        case 'getLatestWorkPermit':
            return await getLatestWorkPermit(individualId, computedDocuments);
        case 'getLatestDocumentNumber':
            return await getLatestDocumentNumber(individualId, computedDocuments);
        case 'getLatestDocumentExpiryDate':
            return await getLatestDocumentExpiryDate(individualId, computedDocuments);
        case 'getLatestDocumentIssueDate':
            return await getLatestDocumentIssueDate(individualId, computedDocuments);
        case 'extractFieldFromLatestDocument':
            console.error('[Computed-Router] extractFieldFromLatestDocument requires a fieldPath parameter');
            return "Missing Path Parameter";
        case 'extractFieldFromAllDocuments':
            console.error('[Computed-Router] extractFieldFromAllDocuments requires a fieldPath parameter');
            return [];
        default:
            console.error('[Computed-Router] Unknown function:', functionName);
            return "Unknown Function";
    }
}

export async function processComputedFields(
    individualId: number | string,
    computedFieldsConfig: Array<{
        variableName: string;
        computedFunction: string;
        computedDocuments: string[];
        fieldPath?: string;
        extractionMode?: 'latest' | 'all';
    }>
): Promise<Record<string, string | string[]>> {
    const results: Record<string, string | string[]> = {};

    for (const config of computedFieldsConfig) {
        try {
            const value = await executeComputedField(
                config.computedFunction,
                individualId,
                config.computedDocuments || [],
                config.fieldPath,
                config.extractionMode || 'latest'
            );
            results[config.variableName] = value;
        } catch (error) {
            console.error(`[Computed-Process] Error field ${config.variableName}:`, error);
            results[config.variableName] = "Error";
        }
    }

    return results;
}