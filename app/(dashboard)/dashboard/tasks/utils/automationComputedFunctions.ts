// @ts-nocheck
import supabase from "@/lib/supabase/client";

// --- TYPES ---
export interface DocumentCache {
    documents: any[]; // All fetched acc_portal_directors_documents
    docTypes: any[];  // All fetched acc_portal_kyc
}

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

async function fetchDocsAndTypes(
    individualId: string | number,
    documentIds: string[],
    cache?: DocumentCache
) {
    // 1. USE CACHE IF AVAILABLE
    if (cache) {
        // Filter the pre-fetched cache for this specific individual and requested doc types
        const relevantDocs = cache.documents.filter(d =>
            String(d.director_id) === String(individualId) &&
            documentIds.includes(d.document_id)
        );

        const relevantTypes = cache.docTypes.filter(t =>
            documentIds.includes(t.id)
        );

        return { docs: relevantDocs, types: relevantTypes };
    } if (!individualId || !documentIds || documentIds.length === 0) {
        return { docs: [], types: [] };
    }

    const { data: docTypes } = await supabase.from('acc_portal_kyc').select('*').in('id', documentIds);
    const { data: uploadedDocs } = await supabase.from('acc_portal_directors_documents')
        .select('*')
        .eq('director_id', individualId)
        .in('document_id', documentIds)
        .neq('status', 'deleted');

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

/**
 * IMPROVED: Parse JSON path from document data
 * Handles both ->> (text extraction) and -> (JSON extraction)
 */
function parseJsonPath(doc: any, fieldPath: string): any {
    if (!fieldPath) return null;

    // Handle ->> operator (PostgreSQL text extraction)
    if (fieldPath.includes("->>")) {
        const parts = fieldPath.split("->>");
        if (parts.length === 2) {
            const column = parts[0].trim().replace(/['"]/g, '');
            const key = parts[1].trim().replace(/['"]/g, '');
            const columnData = doc[column];
            if (columnData && typeof columnData === 'object') {
                return columnData[key];
            }
        }
        return null;
    }

    // Handle -> operator (PostgreSQL JSON extraction)
    if (fieldPath.includes("->")) {
        const parts = fieldPath.split("->");
        if (parts.length === 2) {
            const column = parts[0].trim().replace(/['"]/g, '');
            const key = parts[1].trim().replace(/['"]/g, '');
            const columnData = doc[column];
            if (columnData && typeof columnData === 'object') {
                return columnData[key];
            }
        }
        return null;
    }

    // Handle direct column access
    return doc[fieldPath];
}

// --- ARRAY EXTRACTION ---

export async function extractFieldFromAllDocuments(
    individualId: string | number,
    documentIds: string[],
    fieldPath: string,
    cache?: DocumentCache
): Promise<string[]> {
    try {
        const { docs, types } = await fetchDocsAndTypes(individualId, documentIds, cache);
        if (docs.length === 0) return [];

        const sorted = sortDocsByRecency(docs, types);
        const results: string[] = [];

        for (const item of sorted) {
            const value = parseJsonPath(item.doc, fieldPath);
            results.push(value !== null && value !== undefined ? String(value) : "");
        }
        return results;
    } catch (error) {
        console.error("[Array-Extract] Error:", error);
        return [];
    }
}

// --- SINGLE VALUE EXTRACTION ---

export async function extractFieldFromLatestDocument(
    individualId: string | number,
    documentIds: string[],
    fieldPath: string,
    cache?: DocumentCache
): Promise<string> {
    try {
        const { docs, types } = await fetchDocsAndTypes(individualId, documentIds, cache);
        if (docs.length === 0) return "Missing Document";

        const sorted = sortDocsByRecency(docs, types);
        const latest = sorted[0];
        const value = parseJsonPath(latest.doc, fieldPath);

        if (value === null || value === undefined) return "Field Not Found";
        return String(value);

    } catch (error) {
        console.error("[Extract Error]:", error);
        return "Extraction Error";
    }
}

// --- LEGACY FUNCTIONS WRAPPERS ---

export async function getEducationalDetails(individualId: string | number, computedDocuments: string[], cache?: DocumentCache): Promise<any[]> {
    try {
        const { docs, types } = await fetchDocsAndTypes(individualId, computedDocuments, cache);
        if (docs.length === 0) return [];

        const sorted = sortDocsByRecency(docs, types);
        const results: any[] = [];

        for (const item of sorted) {
            const details = item.doc.extracted_details || {};

            // Extract the educational record
            const educationRecord: any = {};

            // Map common field names
            if (details['Institution_Name'] || details['Institution']) {
                educationRecord.institution = details['Institution_Name'] || details['Institution'];
            }
            if (details['Programme_Name'] || details['Award_Title_and_Type'] || details['Description']) {
                educationRecord.description = details['Programme_Name'] || details['Award_Title_and_Type'] || details['Description'];
            }
            if (details['Education_level'] || details['Award_Title_and_Type']) {
                educationRecord.level = details['Education_level'] || details['Award_Title_and_Type'];
            }

            // Handle dates
            const startDateStr = details['Date_Issued'] || details['Start_Date'];
            const endDateStr = details['Date_Completed'] || details['End_Date'] || details['Date_of_Expiry'];

            if (startDateStr) {
                const parsed = parseDateString(startDateStr);
                if (parsed) {
                    educationRecord.startDate = {
                        day: parsed.getDate().toString(),
                        month: parsed.toLocaleString('default', { month: 'short' }),
                        year: parsed.getFullYear().toString()
                    };
                }
            }

            if (endDateStr) {
                const parsed = parseDateString(endDateStr);
                if (parsed) {
                    educationRecord.endDate = {
                        day: parsed.getDate().toString(),
                        month: parsed.toLocaleString('default', { month: 'short' }),
                        year: parsed.getFullYear().toString()
                    };
                }
            }

            // Only add if we have at least some data
            if (Object.keys(educationRecord).length > 0) {
                results.push(educationRecord);
            }
        }

        return results;
    } catch (error) {
        return [];
    }
}

export async function getLatestDocumentNumber(individualId: string | number, computedDocuments: string[], fieldPath?: string, cache?: DocumentCache): Promise<string> {
    if (fieldPath) {
        const result = await extractFieldFromLatestDocument(individualId, computedDocuments, fieldPath, cache);
        if (result !== "Field Not Found" && result !== "Missing Document") return result;
    }
    
    const commonPaths = ["extracted_details->>'Passport_Number'", "extracted_details->>'Passport_No'", "extracted_details->>'Permit_Number'", "extracted_details->>'ID_Number'"];
    for (const path of commonPaths) {
        const result = await extractFieldFromLatestDocument(individualId, computedDocuments, path, cache);
        if (result !== "Field Not Found" && result !== "Missing Document") return result;
    }
    return "Number Not Found";
}

export async function getLatestDocumentExpiryDate(individualId: string | number, computedDocuments: string[], cache?: DocumentCache): Promise<string> {
    const commonPaths = ["extracted_details->>'Date_of_Expiry'", "extracted_details->>'Expiry_Date'", "extracted_details->>'Valid_Until'", "extracted_details->>'Expiration_Date'"];
    for (const path of commonPaths) {
        const result = await extractFieldFromLatestDocument(individualId, computedDocuments, path, cache);
        if (result !== "Field Not Found" && result !== "Missing Document") {
            const parsed = parseDateString(result);
            if (parsed) return parsed.toISOString().split('T')[0];
            return result;
        }
    }
    return "Expiry Not Found";
}

export async function getLatestDocumentIssueDate(individualId: string | number, computedDocuments: string[], cache?: DocumentCache): Promise<string> {
    const commonPaths = ["extracted_details->>'Date_of_Issue'", "extracted_details->>'Issue_Date'", "extracted_details->>'With_Effect_From'", "extracted_details->>'Issued_Date'"];
    for (const path of commonPaths) {
        const result = await extractFieldFromLatestDocument(individualId, computedDocuments, path, cache);
        if (result !== "Field Not Found" && result !== "Missing Document") {
            const parsed = parseDateString(result);
            if (parsed) return parsed.toISOString().split('T')[0];
            return result;
        }
    }
    return "Issue Date Not Found";
}

export async function determineImmigrationStatus(individualId: string | number, computedDocuments: string[], cache?: DocumentCache): Promise<string> {
    try {
        const { docs, types } = await fetchDocsAndTypes(individualId, computedDocuments, cache);
        if (docs.length === 0) return "No Status Doc";
        const sorted = docs.map(doc => {
            const type = types.find((t: any) => t.id === doc.document_id);
            const details = doc.extracted_details || {};
            let expiryDate = new Date(0);
            let issueDate = new Date(0);

            if (type?.fields) {
                const expField = type.fields.find((f: any) => f.isEffectiveTo);
                if (expField && details[expField.name]) {
                    const p = parseDateString(details[expField.name]);
                    if (p) expiryDate = p;
                }

                const issueField = type.fields.find((f: any) => f.isEffectiveFrom);
                if (issueField && details[issueField.name]) {
                    const p = parseDateString(details[issueField.name]);
                    if (p) issueDate = p;
                } else if (doc.created_at) {
                    issueDate = new Date(doc.created_at);
                }
            } else if (doc.created_at) {
                issueDate = new Date(doc.created_at);
            }

            return { doc, type, expiryDate, issueDate };
        }).sort((a, b) => {
            if (a.expiryDate.getTime() !== b.expiryDate.getTime()) {
                return b.expiryDate.getTime() - a.expiryDate.getTime();
            }
            return b.issueDate.getTime() - a.issueDate.getTime();
        });

        const current = sorted[0];
        const now = new Date();
        if (current.expiryDate.getTime() > 0 && current.expiryDate < now) {
            const displayName = current.type?.display_name;
            let displayNameStr: string;

            if (typeof displayName === 'string') {
                displayNameStr = displayName;
            } else if (typeof displayName === 'object' && displayName !== null) {
                displayNameStr = JSON.stringify(displayName);
            } else {
                displayNameStr = "Unknown";
            }
            const expiredResult = `Expired (${displayNameStr})`;
            return expiredResult;
        }

        // CRITICAL FIX: Properly extract the display_name as a string
        const displayName = current.type?.display_name;
        let finalStatus: string;

        if (typeof displayName === 'string') {
            finalStatus = displayName;
        } else if (typeof displayName === 'object' && displayName !== null) {
            if ('en' in displayName) {
                finalStatus = String(displayName.en);
            } else if ('name' in displayName) {
                finalStatus = String(displayName.name);
            } else {
                finalStatus = current.type?.name || current.type?.id || "Unknown Status";
            }
        } else {
            finalStatus = "Unknown Status";
        }
        if (typeof finalStatus !== 'string') {
            return "Status Extraction Error";
        }

        return finalStatus;
    } catch (e) {
        return "COMPUTATION_RUNTIME_FAIL";
    }
}

export async function calculateArithmetic(
    individualId: string | number,
    computedDocuments: string[],
    operation: string,
    field1Path: string,
    field2Path?: string,
    operand?: number,
    cache?: DocumentCache
): Promise<string> {
    try {
        // Get first field value
        const value1 = await extractFieldFromLatestDocument(individualId, computedDocuments, field1Path, cache);
        if (value1 === "Field Not Found" || value1 === "Missing Document") {
            return "Field Not Found";
        }

        let result: number;
        const num1 = parseFloat(String(value1));
        
        if (isNaN(num1)) {
            return "Invalid Number";
        }

        // Handle operations with second field
        if (field2Path) {
            const value2 = await extractFieldFromLatestDocument(individualId, computedDocuments, field2Path, cache);
            if (value2 === "Field Not Found" || value2 === "Missing Document") {
                return "Field Not Found";
            }
            
            const num2 = parseFloat(String(value2));
            if (isNaN(num2)) {
                return "Invalid Number";
            }

            switch (operation.toLowerCase()) {
                case 'minus':
                case 'subtract':
                    result = num1 - num2;
                    break;
                case 'plus':
                case 'add':
                    result = num1 + num2;
                    break;
                case 'multiply':
                case 'times':
                    result = num1 * num2;
                    break;
                case 'divide':
                    result = num2 !== 0 ? num1 / num2 : 0;
                    break;
                default:
                    return "Invalid Operation";
            }
        } 
        // Handle operations with direct operand
        else if (operand !== undefined) {
            switch (operation.toLowerCase()) {
                case 'minus':
                case 'subtract':
                    result = num1 - operand;
                    break;
                case 'plus':
                case 'add':
                    result = num1 + operand;
                    break;
                case 'multiply':
                case 'times':
                    result = num1 * operand;
                    break;
                case 'divide':
                    result = operand !== 0 ? num1 / operand : 0;
                    break;
                default:
                    return "Invalid Operation";
            }
        } else {
            return "Missing Second Field or Operand";
        }

        return String(result);
    } catch (error) {
        console.error("[Arithmetic Error]:", error);
        return "Calculation Error";
    }
}

export async function calculateDateDifference(
    individualId: string | number,
    computedDocuments: string[],
    startDatePath: string,
    endDatePath: string,
    unit: 'days' | 'months' | 'years' = 'days',
    cache?: DocumentCache
): Promise<string> {
    try {
        // Get start date
        const startDateStr = await extractFieldFromLatestDocument(individualId, computedDocuments, startDatePath, cache);
        if (startDateStr === "Field Not Found" || startDateStr === "Missing Document") {
            return "Start Date Not Found";
        }

        // Get end date
        const endDateStr = await extractFieldFromLatestDocument(individualId, computedDocuments, endDatePath, cache);
        if (endDateStr === "Field Not Found" || endDateStr === "Missing Document") {
            return "End Date Not Found";
        }

        const startDate = parseDateString(startDateStr);
        const endDate = parseDateString(endDateStr);

        if (!startDate || !endDate) {
            return "Invalid Date Format";
        }

        let difference: number;
        
        switch (unit) {
            case 'days':
                const diffTime = endDate.getTime() - startDate.getTime();
                difference = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                break;
            case 'months':
                const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                              (endDate.getMonth() - startDate.getMonth());
                difference = months;
                break;
            case 'years':
                difference = endDate.getFullYear() - startDate.getFullYear();
                break;
            default:
                difference = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        return String(difference);
    } catch (error) {
        console.error("[Date Difference Error]:", error);
        return "Date Calculation Error";
    }
}

export async function getLatestWorkPermit(individualId: string | number, computedDocuments: string[], fieldPath?: string, cache?: DocumentCache): Promise<string> {
    return await getLatestDocumentNumber(individualId, computedDocuments, fieldPath, cache);
}

export async function executeComputedField(
    functionName: string,
    individualId: number | string,
    computedDocuments: string[],
    fieldPath?: string,
    extractionMode: 'latest' | 'all' = 'latest',
    cache?: DocumentCache,
    arithmeticConfig?: { operation?: string; field2Path?: string; operand?: number; unit?: string }
): Promise<any> {
    const normalizedFunctionName = functionName.replace(/\(\)/g, '').trim();

    // Handle field path extraction for generic extraction functions
    if (fieldPath) {
        if (extractionMode === 'all') {
            return await extractFieldFromAllDocuments(individualId, computedDocuments, fieldPath, cache);
        } else {
            return await extractFieldFromLatestDocument(individualId, computedDocuments, fieldPath, cache);
        }
    }

    // Handle specific computed functions
    switch (normalizedFunctionName) {
        case 'determineImmigrationStatus':
            return await determineImmigrationStatus(individualId, computedDocuments, cache);
        case 'getLatestWorkPermit': 
            return await getLatestWorkPermit(individualId, computedDocuments, fieldPath, cache);
        case 'getLatestDocumentNumber': 
            return await getLatestDocumentNumber(individualId, computedDocuments, fieldPath, cache);
        case 'getLatestDocumentExpiryDate': 
            return await getLatestDocumentExpiryDate(individualId, computedDocuments, cache);
        case 'getLatestDocumentIssueDate': 
            return await getLatestDocumentIssueDate(individualId, computedDocuments, cache);
        case 'getEducationalDetails': 
            return await getEducationalDetails(individualId, computedDocuments, cache);
        case 'calculateArithmetic': 
            if (!arithmeticConfig?.operation || !fieldPath) return "Missing Arithmetic Config";
            return await calculateArithmetic(individualId, computedDocuments, arithmeticConfig.operation, fieldPath, arithmeticConfig.field2Path, arithmeticConfig.operand, cache);
        case 'calculateDateDifference':
            if (!arithmeticConfig?.field2Path || !fieldPath) return "Missing Date Config";
            return await calculateDateDifference(individualId, computedDocuments, fieldPath, arithmeticConfig.field2Path, arithmeticConfig.unit as any, cache);
        case 'extractFieldFromLatestDocument':
            return "Missing Path Parameter";
        case 'extractFieldFromAllDocuments':
            return [];
        default:
            return "Unknown Function";
    }
}

export async function processComputedFields(
    individualId: number | string,
    computedFieldsConfig: any[]
): Promise<Record<string, string | string[]>> {
    const results: Record<string, string | string[]> = {};
    for (const config of computedFieldsConfig) {
        try {
            const value = await executeComputedField(
                config.computedFunction,
                individualId,
                config.computedDocuments || [],
                config.fieldPath,
                config.extractionMode || 'latest',
                config.cache,
                config.arithmeticConfig
            );
            results[config.variableName] = value;
        } catch (error) {
            results[config.variableName] = "Error";
        }
    }
    return results;
}