// @ts-nocheck
import supabase from "@/lib/supabase/client";

export interface DocumentCache {
    documents: any[]; // All fetched acc_portal_directors_documents
    docTypes: any[];  // All fetched acc_portal_kyc
}

const parseDateString = (dateInput: string | Date | number | null | undefined): Date | null => {
    if (!dateInput) return null;
    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) return dateInput;

    if (typeof dateInput === 'number') {
        if (dateInput > 1000000000 && dateInput < 9999999999) {
            const date = new Date(dateInput * 1000);
            if (!isNaN(date.getTime())) return date;
        } else if (dateInput > 1000000000000 && dateInput < 9999999999999) {
            const date = new Date(dateInput);
            if (!isNaN(date.getTime())) return date;
        }
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
    if (cache) {
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

function parseJsonPath(doc: any, fieldPath: string | number): any {
    if (!fieldPath) return null;
    const pathStr = String(fieldPath);
    const findKeyCaseInsensitive = (obj: any, targetKey: string): any => {
        if (!obj || typeof obj !== 'object') return undefined;
        if (targetKey in obj) {
            return obj[targetKey];
        }
        const lowerTargetKey = targetKey.toLowerCase();
        for (const key in obj) {
            if (key.toLowerCase() === lowerTargetKey) {
                return obj[key];
            }
        }

        return undefined;
    };

    if (pathStr.includes("->>")) {
        const parts = pathStr.split("->>");
        if (parts.length === 2) {
            const column = parts[0].trim().replace(/['"]/g, '');
            const key = parts[1].trim().replace(/['"]/g, '');
            const columnData = doc[column];
            if (columnData && typeof columnData === 'object') {
                return findKeyCaseInsensitive(columnData, key);
            }
        }
        return null;
    }
    if (pathStr.includes("->")) {
        const parts = pathStr.split("->");
        if (parts.length === 2) {
            const column = parts[0].trim().replace(/['"]/g, '');
            const key = parts[1].trim().replace(/['"]/g, '');
            const columnData = doc[column];
            if (columnData && typeof columnData === 'object') {
                return findKeyCaseInsensitive(columnData, key);
            }
        }
        return null;
    }

    return findKeyCaseInsensitive(doc, pathStr);
}

export async function extractFieldFromAllDocuments(
    individualId: string | number,
    documentIds: string[],
    fieldPath: string,
    cache?: DocumentCache
): Promise<string[]> {
    try {
        const { docs, types } = await fetchDocsAndTypes(individualId, documentIds, cache);
        if (docs.length === 0) {
            return [];
        }

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
        if (!documentIds || documentIds.length === 0) {
            return "No Document Specified";
        }

        if (!fieldPath.includes('->>') && !fieldPath.includes('->') && fieldPath !== '') {
            let fieldKeyToExtract = fieldPath;
            if (!isNaN(Number(fieldPath))) {
                const { data: masterField } = await supabase
                    .from('tm_job_fields')
                    .select('field_key')
                    .eq('id', fieldPath)
                    .maybeSingle();

                if (masterField?.field_key) {
                    fieldKeyToExtract = masterField.field_key;
                }
            }
            if (fieldKeyToExtract) {
                const result = await extractFromMasterField(
                    fieldKeyToExtract,
                    individualId,
                    null // Company ID null
                );

                if (result !== '' && result !== 'No Computation Config') {
                    return String(result);
                }
            }
        }

        const { docs, types } = await fetchDocsAndTypes(individualId, documentIds, cache);

        if (!docs || docs.length === 0) {
            return "Document Not Found";
        }
        const sorted = sortDocsByRecency(docs, types);
        const latestDoc = sorted[0]?.doc;

        if (!latestDoc) {
            return "Invalid Document Data";
        }

        let value = parseJsonPath(latestDoc, fieldPath);
        if ((value === null || value === undefined) && fieldPath.includes('extracted_details')) {
            const pathParts = fieldPath.split('->>')
                .join('.')  // Convert ->> to .
                .replace(/['"]/g, '')  // Remove quotes
                .split('.');  // Split by dot notation

            const cleanPathParts = pathParts.filter(part => part.trim() !== '');

            const findKeyCaseInsensitive = (obj: any, targetKey: string): any => {
                if (!obj || typeof obj !== 'object') return undefined;

                if (targetKey in obj) {
                    return obj[targetKey];
                }

                const lowerTargetKey = targetKey.toLowerCase();
                for (const key in obj) {
                    if (key.toLowerCase() === lowerTargetKey) {
                        return obj[key];
                    }
                }

                return undefined;
            };

            value = cleanPathParts.reduce((obj, key) => {
                return findKeyCaseInsensitive(obj, key);
            }, latestDoc);
        }

        if (value === null || value === undefined || value === '') {
            return "";
        }

        const result = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return result;

    } catch (error) {
        console.error(`[Extract Error] Individual: ${individualId}, Path: ${fieldPath}, Error:`, error);
        return "";
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
    cache?: DocumentCache,
    providedLatest?: { doc: any, type: any }
): Promise<string> {
    if (!individualId && !providedLatest) return "Expiry Not Found";

    let latest, details, docType;

    if (providedLatest) {
        latest = providedLatest;
        details = latest.doc.extracted_details || {};
        docType = latest.type;
    } else {
        // 1. Fetch doc and its metadata (using batch cache if provided)
        const { docs, types } = await fetchDocsAndTypes(individualId, computedDocuments, cache);
        if (docs.length === 0) return "Missing Document";

        // 2. Sort by recency to get the latest one
        const sorted = sortDocsByRecency(docs, types);
        latest = sorted[0];
        details = latest.doc.extracted_details || {};
        docType = latest.type;
    }

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
        if (docs.length === 0) {
            return "No Status Doc";
        }

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
                break;
            }
        }

        const fallbackStatus = current.type?.name || current.type?.id || "Unknown Status";
        const finalStatus = typeBasedStatus || extractedPermitType || fallbackStatus;

        if (current.expiryDate.getTime() > 0 && current.expiryDate < now) {
            return `${finalStatus}`;
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
        const resolveFieldPath = async (pathOrId: string | number): Promise<string> => {
            const pathOrIdStr = String(pathOrId);
            if (pathOrIdStr.includes('->') || pathOrIdStr.includes('.')) {
                return pathOrIdStr;
            }
            try {
                const fieldConfig = await getJobFieldDefinition(pathOrIdStr);
                if (!fieldConfig || !fieldConfig.sources || fieldConfig.sources.length === 0) {
                    return '';
                }

                const source = fieldConfig.sources.find(s => s.path);
                if (source && source.path) {
                    return source.path;
                }

                return '';
            } catch (error) {
                console.error(`[Date Debug] Error resolving master field ${pathOrIdStr}:`, error);
                return '';
            }
        };

        const resolvedStartPath = await resolveFieldPath(startDatePath);
        const resolvedEndPath = await resolveFieldPath(endDatePath);
        if (!resolvedStartPath || !resolvedEndPath) {
            return "Invalid Field Paths";
        }

        const startDateValue = await extractFieldFromLatestDocument(individualId, computedDocuments, resolvedStartPath, cache);

        if (startDateValue === "Field Not Found" || startDateValue === "Missing Document" || !startDateValue || startDateValue === "") {
            return "Start Date Not Found";
        }
        if (typeof startDateValue === 'string' && (startDateValue.trim().startsWith('{') || startDateValue.trim().startsWith('['))) {
            return "Invalid Start Date Format";
        }

        const endDateValue = await extractFieldFromLatestDocument(individualId, computedDocuments, resolvedEndPath, cache);

        if (endDateValue === "Field Not Found" || endDateValue === "Missing Document" || !endDateValue || endDateValue === "") {
            return "End Date Not Found";
        }
        if (typeof endDateValue === 'string' && (endDateValue.trim().startsWith('{') || endDateValue.trim().startsWith('['))) {
            return "Invalid End Date Format";
        }

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
                difference = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
                if (endDate.getDate() < startDate.getDate()) {
                    difference--;
                }
                break;
            case 'years':
                difference = endDate.getFullYear() - startDate.getFullYear();
                const m = endDate.getMonth() - startDate.getMonth();
                if (m < 0 || (m === 0 && endDate.getDate() < startDate.getDate())) {
                    difference--;
                }
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

const jobFieldsCache: Record<string, any> = {};
let bulkFetchPromise: Promise<any> | null = null;

async function bulkFetchJobFields(): Promise<Record<string, any>> {
    if (bulkFetchPromise) {
        return bulkFetchPromise;
    }

    bulkFetchPromise = (async () => {
        try {
            const { data, error } = await supabase
                .from('tm_job_fields')
                .select('*');

            if (error) {
                console.error('Bulk fetch job fields error:', error);
                return {};
            }

            const fieldsMap: Record<string, any> = {};
            if (data) {
                data.forEach(field => {
                    fieldsMap[String(field.id)] = field;
                    if (field.field_key) {
                        fieldsMap[field.field_key] = field;
                    }
                });
            }
            return fieldsMap;
        } catch (error) {
            console.error('Bulk fetch job fields error:', error);
            return {};
        }
    })();

    return bulkFetchPromise;
}

async function getJobFieldDefinition(fieldKey: string) {
    const fieldsMap = await bulkFetchJobFields();
    return fieldsMap[fieldKey] || null;
}

async function extractFromMasterField(
    fieldKey: string,
    individualId: string | number,
    companyId: string | number,
    extractionMode: 'latest' | 'all' = 'latest'
): Promise<string> {
    try {
        const fieldConfig = await getJobFieldDefinition(fieldKey);
        if (!fieldConfig || !fieldConfig.sources || fieldConfig.sources.length === 0) {
            return '';
        }

        const sortedSources = [...fieldConfig.sources].sort((a, b) => (a.priority || 99) - (b.priority || 99));

        for (let i = 0; i < sortedSources.length; i++) {
            const source = sortedSources[i];
            const { table, path, linking_variable = 'id', source_type, is_computed, document_id } = source;

            const targetId = source_type === 'company' ? companyId : individualId;
            if (!targetId) {
                continue;
            }

            if (is_computed && document_id && document_id.length > 0) {
                let value: any;
                if (extractionMode === 'all') {
                    value = await extractFieldFromAllDocuments(targetId, document_id, path || '');
                } else {
                    value = await extractFieldFromLatestDocument(targetId, document_id, path || '');
                }

                const isValidResult = (extractionMode === 'all' && Array.isArray(value) && value.length > 0) ||
                    (extractionMode === 'latest' && value && value !== '' && value !== 'Document Not Found' && value !== 'Field Not Found' && value !== 'No Document Specified');

                if (isValidResult) {
                    if (Array.isArray(value)) {
                        return value;
                    }
                    if (typeof value === 'object' && value !== null) {
                        try {
                            const parsed = JSON.parse(value);
                            return parsed.en || parsed.name || parsed.title || String(Object.values(parsed)[0]);
                        } catch {
                            return String(value);
                        }
                    }
                    return String(value);
                }
                continue;
            }

            const { data: record, error } = await supabase
                .from(table)
                .select('*')
                .eq(linking_variable, targetId)
                .maybeSingle();

            if (error) {
                continue;
            }

            if (!record) {
                continue;
            }

            const value = parseJsonPath(record, path);

            if (value !== null && value !== undefined && value !== '') {
                if (typeof value === 'object') {
                    return value.en || value.name || value.title || String(Object.values(value)[0]);
                }
                return String(value);
            }
        }
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
            const match = associations.find(a =>
                a.is_current === true &&
                String(a.individual_type).toLowerCase() === targetRegistryType.toLowerCase()
            );

            if (match?.job?.title) return String(match.job.title);
            if (match?.role) return String(match.role);
            const fallback = associations.find(a => a.is_current === true && a.job?.title);
            if (fallback?.job?.title) return String(fallback.job.title);
        }
        return await extractFromMasterField('job_title', individualId, companyId);
    } catch (error) {
        console.error("Error in extractCurrentJobTitle:", error);
        return "";
    }
}

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
            if (match?.job?.description) return String(match.job.description);
            if (match?.description) return String(match.description);
        }

        return await extractFromMasterField('job_description', individualId, companyId);
    } catch (error) {
        return "";
    }
}

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
        const sortedSources = [...fieldConfig.sources].sort((a, b) => (a.priority || 99) - (b.priority || 99));
        const computedSource = sortedSources.find(source => source.is_computed === true);

        if (!computedSource) {
            return null;
        }

        return {
            computedFunction: computedSource.computed_function || '',
            computedDocuments: computedSource.document_id || [],
            fieldPath: computedSource.path,
            arithmeticConfig: {
                ...computedSource.computed_config?.arithmeticConfig,
                ...computedSource.computed_config?.dateDiffConfig
            } || {},
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
    if (!functionName) {
        console.error('[ExecuteComputedField] No function name provided');
        return "Function not specified";
    }
    const normalizedFunctionName = functionName.replace(/\(\).*$/, '').trim();
    if (normalizedFunctionName === 'extractFieldFromLatestDocument') {
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
            const diffConfig = arithmeticConfig?.dateDiffConfig || arithmeticConfig || {};
            return await calculateDateDifference(
                individualId,
                computedDocuments,
                diffConfig.startDatePath || '',
                diffConfig.endDatePath || '',
                diffConfig.unit || 'days',
                cache
            );
        default:
            console.error(`[ExecuteComputedField] Unknown function: ${normalizedFunctionName}`);
            return "Unknown function";
    }
}

export async function processComputedFieldsFromSources(
    individualId: number | string,
    fieldKeys: string[],
    companyId?: string | number,
    entityContext?: string
): Promise<Record<string, string | string[]>> {
    const results: Record<string, string | string[]> = {};

    for (const fieldKey of fieldKeys) {
        try {
            const config = await getComputationConfigFromSources(fieldKey);

            if (!config) {
                results[fieldKey] = "No Computation Config";
                continue;
            }
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