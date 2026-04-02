// @ts-nocheck
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { toast } from "@/lib/hooks/use-toast";
/**
 * Formats a download filename by removing timestamps and converting to uppercase
 * Example: 'aa_sample_-_limited_CR-12_-_BLUE_COPY_20251111_103523.pdf' -> 'AA SAMPLE - LIMITED - CR 12 - BLUE COPY.PDF'
 * @param filename - The original filename with path and extension
 * @returns Formatted filename in uppercase without timestamps
 */
export const formatDownloadFilename = (filename: string): string => {
    try {
        // Extract just the filename without path
        const baseName = filename.split('/').pop() || '';

        // Remove file extension and split into parts
        const [nameWithoutExt] = baseName.split('.');
        if (!nameWithoutExt) return '';

        // Remove timestamp and trailing underscores (matches _YYYYMMDD_HHMMSS pattern)
        const cleanName = nameWithoutExt
            .replace(/_\d{8}_\d{6}$/, '')  // Remove timestamp
            .replace(/_+$/, '')             // Remove any trailing underscores
            .replace(/_/g, ' ')             // Replace remaining underscores with spaces
            .replace(/\s+/g, ' ')          // Replace multiple spaces with single space
            .trim()                         // Trim any leading/trailing spaces
            .toUpperCase();                 // Convert to uppercase

        // Add the extension back (in uppercase)
        const extension = filename.split('.').pop()?.toUpperCase() || '';
        return extension ? `${cleanName}.${extension}` : cleanName;
    } catch (error) {
        console.error('Error formatting filename:', error);
        return filename; // Return original if there's an error
    }
};

/**
 * Formats the current date for use in filenames
 * @returns Formatted date string (YYYYMMDD_HHmmss)
 */
const formatDateForFilename = (): string => {
    return format(new Date(), 'yyyyMMdd_HHmmss');
};

/**
 * Extracts company name from file path
 * @param path - The file path to extract from
 * @returns Extracted company name or empty string
 */
const extractCompanyFromPath = (path: string): string => {
    const parts = path.split('/');
    // Assuming the path follows a pattern like: /company-name/.../filename.ext
    return parts.length > 1 ? parts[1].replace(/[^a-zA-Z0-9-_]/g, ' ') : '';
};

/**
 * Downloads a file from a given URL
 * @param url - The file URL
 * @param filename - The name to save the file as
 */
const downloadFile = (url: string, filename: string): void => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
};

/**
 * Handles document downloads in various formats
 * @param doc - The document object containing file_path and extracted_details
 * @param format - The download format ('document', 'excel', 'pdf')
 * @param docDisplayName - Optional display name for the document
 * @param documentTypes - Array of document types for additional context
 * @param currentDocumentType - Current document type for additional context
 * @param supabase - Supabase client instance
 * @returns Promise that resolves when download is complete
 */
export const handleDocumentDownload = async (
    doc: {
        file_path: string;
        extracted_details?: Record<string, any>;
        [key: string]: any;
    },
    format: 'document' | 'excel' | 'pdf' = 'document',
    docDisplayName: string = 'document',
    documentTypes: Array<{ id: string; name: string }> = [],
    currentDocumentType: string = '',
    supabase: any
): Promise<void> => {
    try {
        if (!doc?.file_path) {
            throw new Error('No file path available for download');
        }

        const companyName = extractCompanyFromPath(doc.file_path);
        const docType = documentTypes.find(dt => dt.id === currentDocumentType)?.name || docDisplayName || 'document';
        const baseFilename = `${companyName ? companyName + '_' : ''}${docType}`.replace(/\s+/g, '_');
        const timestamp = formatDateForFilename();

        if (format === 'document') {
            const { data: fileData, error: downloadError } = await supabase.storage
                .from('kyc-documents')
                .download(doc.file_path);

            if (downloadError || !fileData) {
                throw new Error(downloadError?.message || 'File not found in storage');
            }

            // Format the download filename
            const fileExtension = doc.file_path.substring(doc.file_path.lastIndexOf('.'));
            const formattedFilename = formatDownloadFilename(doc.file_path);
            const downloadFilename = formattedFilename || `${baseFilename}${fileExtension}`;

            const url = window.URL.createObjectURL(fileData);
            downloadFile(url, downloadFilename);
        } else if (format === 'excel' && doc.extracted_details) {
            const ws = XLSX.utils.json_to_sheet([doc.extracted_details]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Extracted Data');
            XLSX.writeFile(wb, `${baseFilename}_${timestamp}.xlsx`);
        } else if (format === 'pdf' && doc.extracted_details) {
            const doc = new jsPDF();
            // Simple PDF generation - can be enhanced based on requirements
            let y = 20;
            doc.setFontSize(16);
            doc.text(`Document: ${docType}`, 20, y);
            y += 10;
            doc.setFontSize(12);

            Object.entries(doc.extracted_details).forEach(([key, value]) => {
                if (y > 280) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(`${key}: ${value}`, 20, y);
                y += 10;
            });

            doc.save(`${baseFilename}_${timestamp}.pdf`);
        }

        toast.success('Download started');
    } catch (error) {
        console.error('Download error:', error);
        toast.error(error.message || 'Failed to download document');
        throw error; // Re-throw to allow handling in the calling component if needed
    }
};

export const parseDateString = (dateInput: string | Date | null | undefined): Date | null => {
    if (!dateInput) return null;
    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) return dateInput;
    if (typeof dateInput !== 'string') return null;

    // Attempt direct parsing first - handles ISO 8601 (YYYY-MM-DD, 2026-04-21T00:00:00Z) and MM/DD/YYYY
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

    // Ordinal date: YYYY-DDD
    const ordinalMatch = cleanedDateInput.match(/^(\d{4})-(\d{3})$/);
    if (ordinalMatch) {
        const year = parseInt(ordinalMatch[1], 10);
        const dayOfYear = parseInt(ordinalMatch[2], 10);
        const dateFromOrdinal = new Date(year, 0); // Start at Jan 1
        dateFromOrdinal.setDate(dayOfYear);
        if (!isNaN(dateFromOrdinal.getTime())) return dateFromOrdinal;
    }

    return null;
};

/**
 * Parses a date string into a Date object
 * @param dateStr - Date string to parse (can be in DD/MM/YYYY format or ISO format)
 * @returns Date object or null if invalid
 */
export const parseDate = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr || typeof dateStr !== 'string') return null;

    // Handle DD/MM/YYYY format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // months are 0-indexed
        const year = parseInt(parts[2], 10);

        // Create date in local time and set to noon to avoid timezone issues
        const date = new Date(year, month, day, 12, 0, 0);

        // Check if the date is valid
        if (isNaN(date.getTime())) return null;

        // Check if the parsed values match the input (to catch invalid dates like 31/02/2023)
        if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
            return null;
        }

        return date;
    }

    // Handle ISO format and other date strings
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
};

/**
 * Gets the expiry date of a document based on the document type configuration
 * @param doc - The document object
 * @param docType - The document type configuration
 * @returns The expiry date or null if not applicable
 */
export const getExpiryDate = <T extends { extracted_details?: Record<string, any> }>(
    doc: T,
    docType?: {
        fields?: Array<{
            name: string;
            isEffectiveTo?: boolean;
        }>;
    } | null
): Date | null => {
    if (!docType) return null;

    try {
        // Look for a field marked as the expiry date (isEffectiveTo: true)
        const expiryDateField = docType.fields?.find(field => field.isEffectiveTo)?.name;
        if (expiryDateField && doc.extracted_details?.[expiryDateField]) {
            return parseDate(doc.extracted_details[expiryDateField]);
        }

        return null;
    } catch (error) {
        console.error('Error calculating expiry date:', error);
        return null;
    }
};

/**
 * Calculates the number of days until a document expires
 * @param doc - The document object
 * @param docType - The document type configuration
 * @returns Number of days until expiry (negative if expired) or null if not applicable
 */
export const getDaysUntilExpiry = <T extends { extracted_details?: Record<string, any> }>(
    doc: T,
    docType?: Parameters<typeof getExpiryDate>[1]
): number | null => {
    try {
        const expiryDate = getExpiryDate(doc, docType);
        if (!expiryDate) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const timeDiff = expiryDate.getTime() - today.getTime();
        return Math.ceil(timeDiff / (1000 * 3600 * 24));
    } catch (error) {
        console.error('Error calculating days until expiry:', error);
        return null;
    }
};

/**
 * Determines the status of a document based on its expiry
 * @param doc - The document object
 * @param docType - The document type configuration
 * @returns Document status: 'expired', 'grace', 'safe', or 'missing'
 */
export const getDocumentStatus = <T extends { extracted_details?: Record<string, any> }>(
    doc: T,
    docType?: {
        grace_period_days?: string | number;
        fields?: Array<{
            name: string;
            isEffectiveTo?: boolean;
        }>;
    } | null
): 'expired' | 'grace' | 'safe' | 'missing' => {
    if (!doc) return 'missing';

    const daysRemaining = getDaysUntilExpiry(doc, docType);
    if (daysRemaining === null) return 'missing';

    // Get grace period from docType, default to 30 if not provided or invalid
    const gracePeriodDays = docType?.grace_period_days
        ? Math.max(1, parseInt(String(docType.grace_period_days), 10) || 30)
        : 30;

    if (daysRemaining < 0) return 'expired';
    if (daysRemaining <= gracePeriodDays) return 'grace';
    return 'safe';
};

/**
 * Gets the appropriate status color class based on document status
 * @param status - The document status
 * @returns Tailwind CSS class for the status
 */
export const getStatusClass = (status: 'expired' | 'grace' | 'safe' | 'missing'): string => {
    switch (status) {
        case 'expired':
            return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
        case 'grace':
            return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
        case 'missing':
            return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
        case 'safe':
        default:
            return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    }
};

/**
 * Formats a date string or Date object into a human-readable format
 * @param date - Date string or Date object to format
 * @returns Formatted date string in DD/MM/YYYY format or empty string if invalid
 */
export const formatDateForDisplay = (date: string | Date | null | undefined): string => {
    if (!date) return '';

    let dateObj: Date;

    if (typeof date === 'string') {
        // Handle string dates (could be in various formats)
        const parsedDate = parseDate(date);
        if (!parsedDate) return date; // Return original if we can't parse it
        dateObj = parsedDate;
    } else if (date instanceof Date) {
        dateObj = date;
    } else {
        return '';
    }

    // Format as DD/MM/YYYY
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();

    return `${day}/${month}/${year}`;
};

/**
 * Sorts an array of documents by their effective date in descending order (newest first).
 * Uses the field marked with isEffectiveFrom: true in the document type configuration.
 * Falls back to created_at if no effective date field is found.
 * @param documents - Array of document objects to sort
 * @param docType - Document type configuration containing field metadata
 * @returns A new array of documents sorted by effective date
 */
export const sortDocumentsByLatest = <T extends { extracted_details?: Record<string, any>, created_at: string }>(
    documents: T[],
    docType?: { fields?: Array<{ name: string; isEffectiveFrom?: boolean }> } | null
): T[] => {
    if (!documents.length) return [];

    // Find the effective date field from docType configuration
    const effectiveDateField = docType?.fields?.find(field => field.isEffectiveFrom)?.name;

    return [...documents].sort((a, b) => {
        const getDate = (doc: T): Date => {
            // Try to get date from the effective date field if configured
            if (effectiveDateField && doc.extracted_details?.[effectiveDateField]) {
                const date = parseDateString(doc.extracted_details[effectiveDateField]);
                if (date) return date;
            }

            // Fall back to created_at if no effective date is found
            return new Date(doc.created_at);
        };

        return getDate(b).getTime() - getDate(a).getTime();
    });
};
