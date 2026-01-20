// @ts-nocheck

import supabase from "@/lib/supabase/client";

/**
 * Parses a date string into a Date object, supporting multiple date formats
 */
const parseDateString = (dateInput: string | Date | null | undefined): Date | null => {
    if (!dateInput) return null;
    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) return dateInput;
    if (typeof dateInput !== 'string') return null;

    // Attempt direct parsing first - handles ISO 8601
    let date = new Date(dateInput);
    if (!isNaN(date.getTime())) {
        return date;
    }

    const cleanedDateInput = dateInput.trim();

    const formatPatterns = [
        // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
        { regex: /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/, parts: { day: 1, month: 2, year: 3 } },
        // YYYY/MM/DD or YYYY-MM-DD or YYYY.MM.DD
        { regex: /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/, parts: { year: 1, month: 2, day: 3 } },
        // Month DD, YYYY e.g., April 21, 2026
        { regex: /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})$/i, parts: { monthName: 1, day: 2, year: 3 } },
        // DD Month YYYY e.g., 21 April 2026
        { regex: /^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i, parts: { day: 1, monthName: 2, year: 3 } },
        // Tue, 21 Apr 2026
        { regex: /^\w{3},\s+(\d{1,2})\s+(\w{3})\s+(\d{4})$/i, parts: { day: 1, monthAbbr: 2, year: 3 } },
    ];

    const monthMap = {
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
        'january': 1, 'february': 2, 'march': 3, 'april': 4, 'june': 6,
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
            } else if (parts.monthAbbr) {
                month = monthMap[match[parts.monthAbbr].toLowerCase()];
            }

            if (day && month && year) {
                const parsedDate = new Date(Date.UTC(year, month - 1, day));
                if (!isNaN(parsedDate.getTime()) && parsedDate.getUTCFullYear() === year && parsedDate.getUTCMonth() === month - 1 && parsedDate.getUTCDate() === day) {
                    return parsedDate;
                }
            }
        }
    }

    return null;
};

/**
 * Gets the expiry date from a document based on the document type's isEffectiveTo field
 */
const getExpiryDate = (
    doc: { extracted_details?: Record<string, any> },
    docType?: { fields?: Array<{ name: string; isEffectiveTo?: boolean }> } | null
): Date | null => {
    if (!docType || !doc.extracted_details) return null;
    
    try {
        // Look for a field marked as the expiry date (isEffectiveTo: true)
        const expiryDateField = docType.fields?.find(field => field.isEffectiveTo)?.name;
        if (expiryDateField && doc.extracted_details[expiryDateField]) {
            return parseDateString(doc.extracted_details[expiryDateField]);
        }
        return null;
    } catch (error) {
        console.error('Error getting expiry date:', error);
        return null;
    }
};

/**
 * Gets the issue/effective from date from a document based on the document type's isEffectiveFrom field
 */
const getIssueDate = (
    doc: { extracted_details?: Record<string, any> },
    docType?: { fields?: Array<{ name: string; isEffectiveFrom?: boolean }> } | null
): Date | null => {
    if (!docType || !doc.extracted_details) return null;
    
    try {
        const effectiveFromField = docType.fields?.find(field => field.isEffectiveFrom)?.name;
        if (effectiveFromField && doc.extracted_details[effectiveFromField]) {
            return parseDateString(doc.extracted_details[effectiveFromField]);
        }
        return null;
    } catch (error) {
        console.error('Error getting issue date:', error);
        return null;
    }
};

/**
 * Sorts documents by their effective date (newest first)
 * Uses the field marked with isEffectiveFrom in the document type configuration
 */
const sortDocumentsByLatest = <T extends { extracted_details?: Record<string, any>, created_at?: string }>(
    documents: T[],
    docType?: { fields?: Array<{ name: string; isEffectiveFrom?: boolean }> } | null
): T[] => {
    if (!documents.length) return [];

    return [...documents].sort((a, b) => {
        const getDate = (doc: T): Date => {
            // Try to get date from the effective date field if configured
            const date = getIssueDate(doc, docType);
            if (date) return date;
            
            // Fall back to created_at if no effective date is found
            return doc.created_at ? new Date(doc.created_at) : new Date(0);
        };

        return getDate(b).getTime() - getDate(a).getTime();
    });
};

/**
 * COMPUTED FUNCTION 1: determineImmigrationStatus()
 * 
 * Determines the current immigration status of an individual by:
 * 1. Fetching all documents of the types specified in computedDocuments
 * 2. Filtering for valid (non-expired) documents
 * 3. Returning the most recent valid document's type name
 * 
 * @param individualId - The ID of the individual
 * @param computedDocuments - Array of document type IDs to check (from automation config)
 * @returns The display name of the current valid immigration status, or "No Valid Status"
 */
export async function determineImmigrationStatus(
    individualId: number | string,
    computedDocuments: string[]
): Promise<string> {
    try {
        if (!individualId || !computedDocuments || computedDocuments.length === 0) {
            console.error('Missing required parameters for determineImmigrationStatus');
            return "No Valid Status";
        }

        console.log('🔍 Determining immigration status for individual:', individualId);
        console.log('📋 Document types to check:', computedDocuments);

        // 1. Fetch document type configurations
        const { data: docTypes, error: docTypesError } = await supabase
            .from('acc_portal_kyc')
            .select('*')
            .in('id', computedDocuments);

        if (docTypesError) {
            console.error('Error fetching document types:', docTypesError);
            return "Error Fetching Types";
        }

        if (!docTypes || docTypes.length === 0) {
            console.warn('No document types found for IDs:', computedDocuments);
            return "No Valid Status";
        }

        // 2. Fetch all uploaded documents for this individual matching these types
        const { data: uploadedDocs, error: docsError } = await supabase
            .from('acc_portal_directors_documents')
            .select('*')
            .eq('director_id', individualId)
            .in('document_id', computedDocuments)
            .neq('status', 'deleted');

        if (docsError) {
            console.error('Error fetching uploaded documents:', docsError);
            return "Error Fetching Docs";
        }

        if (!uploadedDocs || uploadedDocs.length === 0) {
            console.log('No uploaded documents found for individual');
            return "No Valid Status";
        }

        console.log(`📄 Found ${uploadedDocs.length} uploaded documents`);

        // 3. Filter for valid (non-expired) documents
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const validDocs = uploadedDocs.filter(doc => {
            const docType = docTypes.find(dt => dt.id === doc.document_id);
            if (!docType) return false;

            const expiryDate = getExpiryDate(doc, docType);
            
            // If no expiry date, consider it valid (permanent status)
            if (!expiryDate) return true;

            // Check if not expired
            return expiryDate >= today;
        });

        console.log(`✅ Found ${validDocs.length} valid (non-expired) documents`);

        if (validDocs.length === 0) {
            return "Expired Status";
        }

        // 4. Sort valid documents by issue date (newest first) and get the most recent
        const sortedDocs = validDocs.map(doc => {
            const docType = docTypes.find(dt => dt.id === doc.document_id);
            return { doc, docType };
        });

        // Sort by issue date
        sortedDocs.sort((a, b) => {
            const dateA = getIssueDate(a.doc, a.docType);
            const dateB = getIssueDate(b.doc, b.docType);
            
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;
            
            return dateB.getTime() - dateA.getTime();
        });

        const mostRecentDoc = sortedDocs[0];
        const statusName = mostRecentDoc.docType?.display_name || mostRecentDoc.docType?.name || "Unknown Status";

        console.log('🎯 Current immigration status:', statusName);
        return statusName;

    } catch (error) {
        console.error('Error in determineImmigrationStatus:', error);
        return "Error";
    }
}

/**
 * COMPUTED FUNCTION 2: getLatestWorkPermit()
 * 
 * Retrieves the permit number from the most recent work permit by:
 * 1. Fetching all work permit documents specified in computedDocuments
 * 2. Sorting them by issue date (newest first) OR expiry date (furthest)
 * 3. Returning the permit number from the latest permit
 * 
 * @param individualId - The ID of the individual
 * @param computedDocuments - Array of work permit document type IDs (from automation config)
 * @returns The permit number from the latest work permit, or "No Previous Permit"
 */
export async function getLatestWorkPermit(
    individualId: number | string,
    computedDocuments: string[]
): Promise<string> {
    try {
        if (!individualId || !computedDocuments || computedDocuments.length === 0) {
            console.error('Missing required parameters for getLatestWorkPermit');
            return "No Previous Permit";
        }

        console.log('🔍 Getting latest work permit for individual:', individualId);
        console.log('📋 Document types to check:', computedDocuments);

        // 1. Fetch document type configurations
        const { data: docTypes, error: docTypesError } = await supabase
            .from('acc_portal_kyc')
            .select('*')
            .in('id', computedDocuments);

        if (docTypesError) {
            console.error('Error fetching document types:', docTypesError);
            return "Error Fetching Types";
        }

        if (!docTypes || docTypes.length === 0) {
            console.warn('No document types found for IDs:', computedDocuments);
            return "No Previous Permit";
        }

        // 2. Fetch all work permit documents for this individual
        const { data: uploadedDocs, error: docsError } = await supabase
            .from('acc_portal_directors_documents')
            .select('*')
            .eq('director_id', individualId)
            .in('document_id', computedDocuments)
            .neq('status', 'deleted');

        if (docsError) {
            console.error('Error fetching uploaded documents:', docsError);
            return "Error Fetching Docs";
        }

        if (!uploadedDocs || uploadedDocs.length === 0) {
            console.log('No work permit documents found for individual');
            return "No Previous Permit";
        }

        console.log(`📄 Found ${uploadedDocs.length} work permit documents`);

        // 3. Sort documents by BOTH issue date and expiry date to find the most recent/active permit
        const sortedDocs = uploadedDocs.map(doc => {
            const docType = docTypes.find(dt => dt.id === doc.document_id);
            const issueDate = getIssueDate(doc, docType);
            const expiryDate = getExpiryDate(doc, docType);
            
            return { doc, docType, issueDate, expiryDate };
        });

        // Sort by: 1) Latest expiry date (furthest in future), 2) Latest issue date
        sortedDocs.sort((a, b) => {
            // First, prioritize by expiry date (furthest expiry = most current/recent permit)
            if (a.expiryDate && b.expiryDate) {
                const expiryDiff = b.expiryDate.getTime() - a.expiryDate.getTime();
                if (expiryDiff !== 0) return expiryDiff;
            }
            // If one has expiry and other doesn't, prioritize the one with expiry
            if (a.expiryDate && !b.expiryDate) return -1;
            if (!a.expiryDate && b.expiryDate) return 1;
            
            // Second, sort by issue date (newest first)
            if (a.issueDate && b.issueDate) {
                return b.issueDate.getTime() - a.issueDate.getTime();
            }
            if (a.issueDate && !b.issueDate) return -1;
            if (!a.issueDate && b.issueDate) return 1;
            
            return 0;
        });

        const latestPermit = sortedDocs[0];

        // 4. Extract permit number from the document's extracted_details
        // Strategy 1: Look for fields in docType configuration that likely contain permit number
        let permitNumber = null;
        const extractedDetails = latestPermit.doc.extracted_details || {};

        if (latestPermit.docType?.fields) {
            // Find fields that likely contain permit/reference numbers (excluding dates)
            const permitFields = latestPermit.docType.fields.filter(f => {
                const lowerName = f.name.toLowerCase();
                const isPermitRelated = 
                    lowerName.includes('permit') || 
                    lowerName.includes('number') ||
                    lowerName.includes('reference') ||
                    lowerName.includes('application');
                
                // Exclude date fields
                const isDateField = f.isEffectiveTo || f.isEffectiveFrom || lowerName.includes('date');
                
                return isPermitRelated && !isDateField;
            });

            // Try each field in priority order
            for (const field of permitFields) {
                if (extractedDetails[field.name]) {
                    permitNumber = extractedDetails[field.name];
                    console.log(`✅ Found permit number in field: ${field.name}`);
                    break;
                }
            }
        }

        // Strategy 2: Fallback to common field name patterns (case-insensitive)
        if (!permitNumber) {
            const commonPermitFields = [
                'permit_number',
                'permitNumber',
                'work_permit_number',
                'workPermitNumber',
                'permit_no',
                'permitNo',
                'reference_number',
                'referenceNumber',
                'application_number',
                'applicationNumber',
                'number'
            ];

            for (const fieldName of commonPermitFields) {
                const foundKey = Object.keys(extractedDetails).find(
                    key => key.toLowerCase() === fieldName.toLowerCase()
                );
                if (foundKey && extractedDetails[foundKey]) {
                    permitNumber = extractedDetails[foundKey];
                    console.log(`✅ Found permit number via fallback: ${foundKey}`);
                    break;
                }
            }
        }

        if (!permitNumber) {
            console.log('⚠️ Latest permit found but no permit number extracted');
            console.log('Available fields:', Object.keys(extractedDetails));
            return "Permit Number Not Found";
        }

        console.log('🎯 Latest work permit number:', permitNumber);
        return String(permitNumber);

    } catch (error) {
        console.error('Error in getLatestWorkPermit:', error);
        return "Error";
    }
}

/**
 * Generic computed field executor
 * Routes to the appropriate function based on the function name
 */
export async function executeComputedField(
    functionName: string,
    individualId: number | string,
    computedDocuments: string[]
): Promise<string> {
    const normalizedFunctionName = functionName.replace(/\(\)/g, '').toLowerCase();

    switch (normalizedFunctionName) {
        case 'determineimmigrationstatus':
            return await determineImmigrationStatus(individualId, computedDocuments);
        
        case 'getlatestworkpermit':
            return await getLatestWorkPermit(individualId, computedDocuments);
        
        default:
            console.error('Unknown computed function:', functionName);
            return "Unknown Function";
    }
}

/**
 * Batch process multiple computed fields for an individual
 * Useful when processing entire automation forms
 */
export async function processComputedFields(
    individualId: number | string,
    computedFieldsConfig: Array<{
        variableName: string;
        computedFunction: string;
        computedDocuments: string[];
    }>
): Promise<Record<string, string>> {
    const results: Record<string, string> = {};

    for (const config of computedFieldsConfig) {
        try {
            const value = await executeComputedField(
                config.computedFunction,
                individualId,
                config.computedDocuments
            );
            results[config.variableName] = value;
        } catch (error) {
            console.error(`Error processing computed field ${config.variableName}:`, error);
            results[config.variableName] = "Error";
        }
    }

    return results;
}