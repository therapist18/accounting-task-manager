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
const parseDateString = (dateInput: string | Date | number | null | undefined): Date | null => {
    if (!dateInput) return null;
    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) return dateInput;
    
    // Handle numeric values (could be timestamps or arithmetic results)
    if (typeof dateInput === 'number') {
        // Check if it's a reasonable timestamp (milliseconds since epoch)
        if (dateInput > 1000000000 && dateInput < 9999999999) {
            // Likely seconds timestamp, convert to milliseconds
            const date = new Date(dateInput * 1000);
            if (!isNaN(date.getTime())) return date;
        } else if (dateInput > 1000000000000 && dateInput < 9999999999999) {
            // Likely milliseconds timestamp
            const date = new Date(dateInput);
            if (!isNaN(date.getTime())) return date;
        }
        // If it's a year, create a date for January 1st of that year
        if (dateInput >= 1900 && dateInput <= 2100) {
            return new Date(dateInput, 0, 1);
        }
        return null;
    }
    
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
       const sorted = docs.map(doc => {
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
    return sorted;
}

/**
 * IMPROVED: Parse JSON path from document data
 * Handles both ->> (text extraction) and -> (JSON extraction)
 */
function parseJsonPath(doc: any, fieldPath: string | number): any {
    if (!fieldPath) return null;

    // Convert to string if it's a number
    const pathStr = String(fieldPath);

    // Handle ->> operator (PostgreSQL text extraction)
    if (pathStr.includes("->>")) {
        const parts = pathStr.split("->>");
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
    if (pathStr.includes("->")) {
        const parts = pathStr.split("->");
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
    return doc[pathStr];
}

// --- ARRAY EXTRACTION ---

export async function extractFieldFromAllDocuments(
    individualId: string | number,
    documentIds: string[],
    fieldPath: string,
    cache?: DocumentCache
): Promise<string[]> {
    try {
        console.log(`[Array-Extract] Starting extraction - Individual: ${individualId}, Docs: ${documentIds?.join(', ')}, Path: ${fieldPath}`);
        
        const { docs, types } = await fetchDocsAndTypes(individualId, documentIds, cache);
        if (docs.length === 0) {
            console.log(`[Array-Extract] No documents found`);
            return [];
        }

        const sorted = sortDocsByRecency(docs, types);
        const results: string[] = [];

        console.log(`[Array-Extract] Processing ${sorted.length} documents`);

        for (const item of sorted) {
            console.log(`[Array-Extract] Processing document - ID: ${item.doc.id}, extracted_details keys:`, Object.keys(item.doc.extracted_details || {}));
            
            const value = parseJsonPath(item.doc, fieldPath);
            console.log(`[Array-Extract] Document ${item.doc.id} - Path: ${fieldPath}, Value:`, value);
            
            results.push(value !== null && value !== undefined ? String(value) : "");
        }
        
        console.log(`[Array-Extract] Final results:`, results);
        return results;
    } catch (error) {
        console.error("[Array-Extract] Error:", error);
        return [];
    }
}

// --- SINGLE VALUE EXTRACTION ---

export async function getLatestDocument(
    individualId: string | number,
    documentIds: string[],
    cache?: DocumentCache
): Promise<any> {
    try {
        const { docs, types } = await fetchDocsAndTypes(individualId, documentIds, cache);
        if (docs.length === 0) return null;

        const sorted = sortDocsByRecency(docs, types);
        const latest = sorted[0];
        
        return {
            document: latest.doc,
            documentType: latest.type,
            sortDate: latest.sortDate,
            dateSource: latest.dateSource
        };
    } catch (error) {
        console.error("[Get Latest Document Error]:", error);
        return null;
    }
}

export async function getAllDocuments(
    individualId: string | number,
    documentIds: string[],
    cache?: DocumentCache
): Promise<any[]> {
    try {
        const { docs, types } = await fetchDocsAndTypes(individualId, documentIds, cache);
        if (docs.length === 0) return [];

        const sorted = sortDocsByRecency(docs, types);
        
        return sorted.map(item => ({
            document: item.doc,
            documentType: item.type,
            sortDate: item.sortDate,
            dateSource: item.dateSource
        }));
    } catch (error) {
        console.error("[Get All Documents Error]:", error);
        return [];
    }
}

export async function extractFieldFromLatestDocument(
    individualId: string | number,
    documentIds: string[],
    fieldPath: string,
    cache?: DocumentCache
): Promise<string> {
    try {
        console.log(`[Extract Debug] Individual: ${individualId}, Docs: ${documentIds?.join(', ') || 'none'}, Path: ${fieldPath}`);
        
        if (!documentIds || documentIds.length === 0) {
            console.log(`[Extract Debug] No document IDs provided`);
            return "No Document Specified";
        }

        const { docs, types } = await fetchDocsAndTypes(individualId, documentIds, cache);
     
        if (!docs || docs.length === 0) {
            console.log(`[Extract Debug] No documents found for the specified IDs`);
            return "Document Not Found";
        }

        console.log(`[Extract Debug] Found ${docs.length} documents`);
        const sorted = sortDocsByRecency(docs, types);
        const latestDoc = sorted[0]?.doc;
        
        if (!latestDoc) {
            console.log(`[Extract Debug] No valid document data found`);
            return "Invalid Document Data";
        }

        console.log(`[Extract Debug] Latest doc ID: ${latestDoc.id}`);
        console.log(`[Extract Debug] Extracting from path: ${fieldPath}`);
        
        // First try to get the value using the full path
        let value = parseJsonPath(latestDoc, fieldPath);
        
        // If not found and path contains 'extracted_details', try to get it directly from the nested object
        if ((value === null || value === undefined) && fieldPath.includes('extracted_details')) {
            const pathParts = fieldPath.split('->>')
                .join('.')  // Convert ->> to .
                .replace(/['"]/g, '')  // Remove quotes
                .split('.');  // Split by dot notation
            
            // Remove empty strings from the path parts
            const cleanPathParts = pathParts.filter(part => part.trim() !== '');
            
            // Traverse the object using the path parts
            value = cleanPathParts.reduce((obj, key) => {
                if (obj && typeof obj === 'object' && key in obj) {
                    return obj[key];
                }
                return undefined;
            }, latestDoc);
        }

        console.log(`[Extract Debug] Extracted value:`, value, `Type: ${typeof value}`);
        
        if (value === null || value === undefined || value === '') {
            console.log(`[Extract Debug] Field not found at path: ${fieldPath}`);
            return ""; // Return empty string instead of "Field Not Found" to allow for fallback
        }

        // If the value is an object, try to stringify it
        const result = typeof value === 'object' ? JSON.stringify(value) : String(value);
        console.log(`[Extract Debug] Final result: ${result}`);
        return result;

    } catch (error) {
        console.error(`[Extract Error] Individual: ${individualId}, Path: ${fieldPath}, Error:`, error);
        return ""; // Return empty string instead of error message to allow for fallback
    }
}

export async function getEducationalDetails(
    individualId: string | number,
    computedDocuments: string[],
    cache?: DocumentCache
): Promise<any[]> {
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

export async function getLatestDocumentExpiryDate(
    individualId: string | number, 
    computedDocuments: string[], 
    cache?: DocumentCache
): Promise<string> {
    if (!individualId) return "Expiry Not Found";
    
    // 1. Fetch doc and its metadata (using batch cache if provided)
    const { docs, types } = await fetchDocsAndTypes(individualId, computedDocuments, cache);
    if (docs.length === 0) return "Missing Document";

    // 2. Sort by recency to get the latest one
    const sorted = sortDocsByRecency(docs, types);
    const latest = sorted[0];
    const details = latest.doc.extracted_details || {};
    const docType = latest.type;

    // 3. DYNAMIC SEARCH: Find the field marked 'isEffectiveTo' in the KYC metadata
    if (docType?.fields && Array.isArray(docType.fields)) {
        const effectiveToField = docType.fields.find((f: any) => f.isEffectiveTo === true);
        if (effectiveToField && details[effectiveToField.name]) {
            const parsed = parseDateString(details[effectiveToField.name]);
            if (parsed) return parsed.toISOString().split('T')[0];
        }
    }

    // 4. FALLBACK: Check common hardcoded paths if metadata search failed
    const commonPaths = ["Date_of_Expiry", "Expiry_Date", "Valid_Until", "Expiration_Date", "Certificate Date"];
    for (const path of commonPaths) {
        const val = details[path];
        if (val) {
            const parsed = parseDateString(val);
            if (parsed) return parsed.toISOString().split('T')[0];
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

export async function getLatestDocumentStartDate(individualId: string | number, computedDocuments: string[], cache?: DocumentCache): Promise<string> {
    const commonPaths = ["extracted_details->>'With_Effect_From'", "extracted_details->>'Date_of_Issue'", "extracted_details->>'Issue_Date'", "extracted_details->>'Issued_Date'"];
    for (const path of commonPaths) {
        const result = await extractFieldFromLatestDocument(individualId, computedDocuments, path, cache);
        if (result !== "Field Not Found" && result !== "Missing Document") {
            const parsed = parseDateString(result);
            if (parsed) return parsed.toISOString().split('T')[0];
            return result;
        }
    }
    return "Start Date Not Found";
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

            return { doc, type, expiryDate, issueDate, details };
        }).sort((a, b) => {
            if (a.expiryDate.getTime() !== b.expiryDate.getTime()) {
                return b.expiryDate.getTime() - a.expiryDate.getTime();
            }
            return b.issueDate.getTime() - a.issueDate.getTime();
        });

        const current = sorted[0];
        const now = new Date();
        const details = current.details;
        
        // PRIORITY 1: Extract permit/pass type from extracted_details
        const permitTypeFieldNames = [
            'Permit_Type', 'permit_type', 'PermitType',
            'Pass_Type', 'pass_type', 'PassType',
            'Pass_type', 'Permit_type',
            'Immigration_Status', 'immigration_status', 'Status', 'status'
        ];
        
        let extractedPermitType = null;
        for (const fieldName of permitTypeFieldNames) {
            if (details[fieldName]) {
                extractedPermitType = String(details[fieldName]);
                console.log(`[Immigration Status] Found permit type in extracted_details: ${extractedPermitType}`);
                break;
            }
        }
        
        // PRIORITY 2: Use the immigration_status from the document type definition
        let typeBasedStatus = null;
        const immigrationStatus = current.type?.immigration_status;
        
        if (typeof immigrationStatus === 'string') {
            typeBasedStatus = immigrationStatus;
        } else if (typeof immigrationStatus === 'object' && immigrationStatus !== null) {
            if ('en' in immigrationStatus) {
                typeBasedStatus = String(immigrationStatus.en);
            } else if ('name' in immigrationStatus) {
                typeBasedStatus = String(immigrationStatus.name);
            }
        }
        
        // PRIORITY 3: Use document type name as fallback
        const fallbackStatus = current.type?.name || current.type?.id || "Unknown Status";
        
        // Determine final status (prefer extracted permit type if available)
        const finalStatus = extractedPermitType || typeBasedStatus || fallbackStatus;
        
        // Check if expired
        if (current.expiryDate.getTime() > 0 && current.expiryDate < now) {
            return `${finalStatus} (Expired)`;
        }

        return finalStatus;
    } catch (e) {
        console.error('[Immigration Status Error]:', e);
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
        // Helper function to resolve master field ID to actual document path using linked sources
        const resolveFieldPath = async (fieldPathOrId: any): Promise<string> => {
            // Convert to string first to handle all input types
            const fieldPathStr = String(fieldPathOrId);
            
            // If it's already a document path (contains ->>), return as-is
            if (fieldPathStr.includes('->>')) {
                return fieldPathStr;
            }

            // If it's a numeric ID, look up the master field and get its linked sources
            if (!isNaN(Number(fieldPathStr))) {
                try {
                    const { data: masterField } = await supabase
                        .from('tm_job_fields')
                        .select('*')
                        .eq('id', fieldPathOrId)
                        .maybeSingle();
                    if (masterField?.sources?.length > 0) {
                        // Find the source that matches document extraction
                        const documentSource = masterField.sources.find(source => 
                            source.table === 'acc_portal_directors_documents' && 
                            source.path
                        );
                        
                        if (documentSource?.path) {
                             return documentSource.path;
                        }
                    }
                } catch (error) {
                    console.error(`[Date Debug] Error looking up master field ${fieldPathOrId}:`, error);
                }
            }

           return fieldPathOrId;
        };

        // Resolve the actual paths
        const resolvedStartDatePath = await resolveFieldPath(startDatePath);
        const resolvedEndDatePath = await resolveFieldPath(endDatePath);
const startDateValue = await extractFieldFromLatestDocument(individualId, computedDocuments, resolvedStartDatePath, cache);
        if (startDateValue === "Field Not Found" || startDateValue === "Missing Document") {
            return "Start Date Not Found";
        }

        const endDateValue = await extractFieldFromLatestDocument(individualId, computedDocuments, resolvedEndDatePath, cache);
        if (endDateValue === "Field Not Found" || endDateValue === "Missing Document") {
            return "End Date Not Found";
        }

        // Convert string numbers to actual numbers if needed
        const startDateStr = typeof startDateValue === 'string' && !isNaN(Number(startDateValue)) ? Number(startDateValue) : startDateValue;
        const endDateStr = typeof endDateValue === 'string' && !isNaN(Number(endDateValue)) ? Number(endDateValue) : endDateValue;

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

async function getJobFieldDefinition(fieldKey: string) {
    const { data, error } = await supabase
        .from('tm_job_fields')
        .select('*')
        .eq('field_key', fieldKey)
        .maybeSingle();
    
    if (error || !data) return null;
    return data;
}

/**
 * Generic extractor that follows the "sources" configuration of a Master Field.
 * It now decides whether to use individualId or companyId based on the source_type.
 * ENHANCED: Now supports fallback to lower priority sources if higher priority returns empty
 */
async function extractFromMasterField(
    fieldKey: string, 
    individualId: string | number,
    companyId: string | number,
    extractionMode: 'latest' | 'all' = 'latest'
): Promise<string> {
    try {
        const fieldConfig = await getJobFieldDefinition(fieldKey);
        if (!fieldConfig || !fieldConfig.sources || fieldConfig.sources.length === 0) {
            console.log(`[Extract Master Field] No sources found for field: ${fieldKey}`);
            return '';
        }

        // Sort sources by priority (lower number = higher priority)
        const sortedSources = [...fieldConfig.sources].sort((a, b) => (a.priority || 99) - (b.priority || 99));
        
        console.log(`[Extract Master Field] Field: ${fieldKey}, Total sources: ${sortedSources.length}`);

        // Try each source in priority order
        for (let i = 0; i < sortedSources.length; i++) {
            const source = sortedSources[i];
            const { table, path, linking_variable = 'id', source_type, is_computed, document_id } = source;
            
            console.log(`[Extract Master Field] Trying source ${i + 1} (Priority: ${source.priority || 99}): table=${table}, path=${path}, source_type=${source_type}, is_computed=${is_computed}`);
            
            // Determine which ID to use based on source type
            const targetId = source_type === 'company' ? companyId : individualId;
            if (!targetId) {
                console.log(`[Extract Master Field] Skipping source ${i + 1} - no target ID for source_type: ${source_type}`);
                continue;
            }

            // Handle computed sources (document extraction)
            if (is_computed && document_id && document_id.length > 0) {
                console.log(`[Extract Master Field] Source ${i + 1} is computed, extracting from documents: ${document_id.join(', ')}, mode: ${extractionMode}`);
                
                let value: any;
                if (extractionMode === 'all') {
                    value = await extractFieldFromAllDocuments(targetId, document_id, path || '');
                } else {
                    value = await extractFieldFromLatestDocument(targetId, document_id, path || '');
                }
                
                // Check if the result is valid (not empty array for array fields, not empty string for single fields)
                const isValidResult = (extractionMode === 'all' && Array.isArray(value) && value.length > 0) ||
                                   (extractionMode === 'latest' && value && value !== '' && value !== 'Document Not Found' && value !== 'Field Not Found' && value !== 'No Document Specified');
                
                if (isValidResult) {
                    console.log(`[Extract Master Field] Source ${i + 1} SUCCESS - Got value:`, value);
                    
                    // Handle arrays (return as-is for array fields)
                    if (Array.isArray(value)) {
                        return value;
                    }
                    
                    // Handle objects (like translations {en: "..."})
                    if (typeof value === 'object' && value !== null) {
                        try {
                            const parsed = JSON.parse(value);
                            return parsed.en || parsed.name || parsed.title || String(Object.values(parsed)[0]);
                        } catch {
                            return String(value);
                        }
                    }
                    return String(value);
                } else {
                    console.log(`[Extract Master Field] Source ${i + 1} returned empty or error: ${value}, trying next source...`);
                }
                continue;
            }

            // Handle standard sources (direct table lookups)
            console.log(`[Extract Master Field] Source ${i + 1} is standard, querying table: ${table} with ${linking_variable}=${targetId}`);
            
            const { data: record, error } = await supabase
                .from(table)
                .select('*')
                .eq(linking_variable, targetId)
                .maybeSingle();

            if (error) {
                console.log(`[Extract Master Field] Source ${i + 1} query error:`, error);
                continue;
            }
            
            if (!record) {
                console.log(`[Extract Master Field] Source ${i + 1} - no record found, trying next source...`);
                continue;
            }

            // Extract value via the path
            const value = parseJsonPath(record, path);
            console.log(`[Extract Master Field] Source ${i + 1} extracted value:`, value);

            if (value !== null && value !== undefined && value !== '') {
                console.log(`[Extract Master Field] Source ${i + 1} SUCCESS - Got value: ${value}`);
                
                // Handle objects (like translations {en: "..."})
                if (typeof value === 'object') {
                    return value.en || value.name || value.title || String(Object.values(value)[0]);
                }
                return String(value);
            } else {
                console.log(`[Extract Master Field] Source ${i + 1} returned empty, trying next source...`);
            }
        }

        console.log(`[Extract Master Field] All sources exhausted for field: ${fieldKey}, returning empty string`);
        return '';
    } catch (error) {
        console.error(`[Extract Master Field Error - ${fieldKey}]:`, error);
        return '';
    }
}

const mapEntityTypeToRegistry = (type?: string): string => {
    const map: Record<string, string> = {
      'principal': 'Principal',
      'director': 'Director',
      'understudy': 'Understudy',
      'employee': 'Employee',
      'dependant': 'Dependant'
    };
    return map[type?.toLowerCase()] || 'Principal';
  };

/**
 * Extracts job title matching the specific entity type from registry associations
 */
export async function extractCurrentJobTitle(
    individualId: string | number,
    companyId: string | number,
    entityContext?: string
): Promise<string> {
    try {
        const { data: individual } = await supabase
            .from('registry_individuals')
            .select('employment_data')
            .eq('id', individualId)
            .maybeSingle();

        const associations = individual?.employment_data?.associations;

        if (Array.isArray(associations)) {
            const targetRegistryType = mapEntityTypeToRegistry(entityContext);
            
            // Filter by current status and individual type
            const match = associations.find(a => 
                a.is_current === true && 
                String(a.individual_type).toLowerCase() === targetRegistryType.toLowerCase()
            );

            // Path mapping based on your JSON: associations -> job -> title
            if (match?.job?.title) return String(match.job.title);
            if (match?.role) return String(match.role);
            
            // Context-less fallback: pick first current job
            const fallback = associations.find(a => a.is_current === true && a.job?.title);
            if (fallback?.job?.title) return String(fallback.job.title);
        }

        // Final fallback to documents logic via tm_job_fields
        return await extractFromMasterField('job_title', individualId, companyId);
    } catch (error) {
        console.error("Error in extractCurrentJobTitle:", error);
        return "";
    }
}

/**
 * Extracts job description matching the specific entity type from registry associations
 */
export async function extractCurrentJobDescription(
    individualId: string | number,
    companyId: string | number,
    entityContext?: string
): Promise<string> {
    try {
        const { data: individual } = await supabase
            .from('registry_individuals')
            .select('employment_data')
            .eq('id', individualId)
            .maybeSingle();

        const associations = individual?.employment_data?.associations;

        if (Array.isArray(associations)) {
            const targetRegistryType = mapEntityTypeToRegistry(entityContext);
            const match = associations.find(a => 
                a.is_current === true && 
                String(a.individual_type).toLowerCase() === targetRegistryType.toLowerCase()
            );

            // associations -> job -> description
            if (match?.job?.description) return String(match.job.description);
            if (match?.description) return String(match.description);
        }

        return await extractFromMasterField('job_description', individualId, companyId);
    } catch (error) {
        return "";
    }
}

/**
 * NEW: Helper function to extract computation config from sources array
 * Finds the first source with is_computed = true and returns its config
 */
async function getComputationConfigFromSources(fieldKey: string): Promise<{
    computedFunction: string;
    computedDocuments: string[];
    fieldPath?: string;
    arithmeticConfig?: any;
    extractionMode?: 'latest' | 'all';
} | null> {
    try {
        const fieldConfig = await getJobFieldDefinition(fieldKey);
        if (!fieldConfig || !fieldConfig.sources || fieldConfig.sources.length === 0) {
            return null;
        }

        // Find the first computed source (sorted by priority)
        const sortedSources = [...fieldConfig.sources].sort((a, b) => (a.priority || 99) - (b.priority || 99));
        const computedSource = sortedSources.find(source => source.is_computed === true);

        if (!computedSource) {
            return null;
        }

        return {
            computedFunction: computedSource.computed_function || '',
            computedDocuments: computedSource.document_id || [],
            fieldPath: computedSource.path,
            arithmeticConfig: computedSource.computed_config?.arithmeticConfig || {},
            extractionMode: computedSource.computed_config?.extractionMode || 'latest'
        };
    } catch (error) {
        console.error(`[Get Computation Config Error - ${fieldKey}]:`, error);
        return null;
    }
}

export async function executeComputedField(
    functionName: string,
    individualId: number | string,
    computedDocuments: string[],
    fieldPath?: string,
    extractionMode: 'latest' | 'all' = 'latest',
    cache?: DocumentCache,
    arithmeticConfig?: any,
    companyId?: string | number,
    entityContext?: string
): Promise<any> {
    // Handle cases where functionName might be undefined or null
    if (!functionName) {
        console.error('[ExecuteComputedField] No function name provided');
        return "Function not specified";
    }

    // Normalize the function name by removing any trailing parentheses and trimming whitespace
    const normalizedFunctionName = functionName.replace(/\(\).*$/, '').trim();
    console.log(`[ExecuteComputedField] Executing function: ${normalizedFunctionName} with path: ${fieldPath}`);

    // Handle extractFieldFromLatestDocument specifically
    if (normalizedFunctionName === 'extractFieldFromLatestDocument' || 
        (fieldPath && !arithmeticConfig)) {
        if (extractionMode === 'all') {
            return await extractFieldFromAllDocuments(individualId, computedDocuments, fieldPath || '', cache);
        } else {
            return await extractFieldFromLatestDocument(individualId, computedDocuments, fieldPath || '', cache);
        }
    }

    // Handle other functions
    switch (normalizedFunctionName) {
        case 'extractCurrentJobTitle':
            return await extractCurrentJobTitle(individualId, companyId, entityContext);
        case 'extractCurrentJobDescription':
            return await extractCurrentJobDescription(individualId, companyId, entityContext);
        case 'getLatestDocument':
            return await getLatestDocument(individualId, computedDocuments, cache);
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
        case 'getLatestDocumentStartDate':
            return await getLatestDocumentStartDate(individualId, computedDocuments, cache);
        case 'getEducationalDetails':
            return await getEducationalDetails(individualId, computedDocuments, cache);
        case 'calculateArithmetic':
            return await calculateArithmetic(
                individualId, 
                computedDocuments, 
                arithmeticConfig?.operation || 'add',
                arithmeticConfig?.field1Path || fieldPath || '',
                arithmeticConfig?.field2Path,
                arithmeticConfig?.operand,
                cache
            );
        case 'calculateDateDifference':
            return await calculateDateDifference(
                individualId, 
                computedDocuments, 
                arithmeticConfig?.startDatePath || fieldPath || '',
                arithmeticConfig?.endDatePath || '',
                arithmeticConfig?.unit || 'days',
                cache
            );
        default:
            console.warn(`[ExecuteComputedField] Unknown function: ${normalizedFunctionName}`);
            return `Unknown Function: ${normalizedFunctionName}`;
    }
}

/**
 * NEW: Process computed fields by reading configuration from sources array
 * This replaces the old approach of passing computedFieldsConfig directly
 */
export async function processComputedFieldsFromSources(
    individualId: number | string,
    fieldKeys: string[],
    companyId?: string | number,
    entityContext?: string
): Promise<Record<string, string | string[]>> {
    const results: Record<string, string | string[]> = {};
    
    for (const fieldKey of fieldKeys) {
        try {
            // Get computation config from sources
            const config = await getComputationConfigFromSources(fieldKey);
            
            if (!config) {
                results[fieldKey] = "No Computation Config";
                continue;
            }

            // Execute the computed field
            const value = await executeComputedField(
                config.computedFunction,
                individualId,
                config.computedDocuments,
                config.fieldPath,
                config.extractionMode || 'latest',
                undefined, // cache
                config.arithmeticConfig,
                companyId,
                entityContext
            );
            
            results[fieldKey] = value;
        } catch (error) {
            console.error(`[Process Computed Field Error - ${fieldKey}]:`, error);
            results[fieldKey] = "Error";
        }
    }
    
    return results;
}

/**
 * LEGACY: Kept for backward compatibility
 * Use processComputedFieldsFromSources for new implementations
 */
export async function processComputedFields(
    individualId: number | string,
    computedFieldsConfig: any[],
    companyId?: string | number
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
                config.arithmeticConfig,
                companyId
            );
            results[config.variableName] = value;
        } catch (error) {
            results[config.variableName] = "Error";
        }
    }
    return results;
}