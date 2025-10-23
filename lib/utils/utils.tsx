// @ts-nocheck

import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

export const deepEqual = (obj1, obj2) => {
    if (obj1 === obj2) return true;
    if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
        return false;
    }
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
        if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
            return false;
        }
    }
    return true;
};

export const parseDateString = (dateInput) => {
    if (!dateInput) return null;
    if (dateInput instanceof Date && !isNaN(dateInput)) return dateInput;
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

export const formatDateForDisplay = (dateInput) => {
    const date = parseDateString(dateInput);
    if (!date) return String(dateInput); // Return original value if parsing fails

    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const year = date.getUTCFullYear();

    return `${day}/${month}/${year}`;
};

export const EXPIRY_FIELD_PATTERNS = ['dateofexpiry', 'expirydate', 'validto', 'untill', 'witheffectto', 'expirationdate'];
export const ISSUE_DATE_FIELDS = ['effect_from', 'from', 'valid_from', 'with effect_from', 'date_issued', 'issued_date', 'issued_at', 'date_of_issue', 'Date_of_Issue'];

export const normalizeKey = (key) => {
    if (typeof key !== 'string') return '';
    return key.toLowerCase().replace(/[_-\s]/g, '');
};

export const getExpiryDate = (doc, docType) => {
    if (!doc?.extracted_details) return null;
    const details = doc.extracted_details;

    // 1. Check for direct expiry date fields using normalized keys.
    for (const key in details) {
        if (Object.prototype.hasOwnProperty.call(details, key)) {
            const normalized = normalizeKey(key);
            if (EXPIRY_FIELD_PATTERNS.includes(normalized)) {
                const value = details[key];
                const date = parseDateString(value);
                if (date) return date;
            }
        }
    }

    // 2. If no direct expiry date, calculate from an issue date and a validity period.
    if (docType?.validity_days > 0) {
        for (const field of ISSUE_DATE_FIELDS) {
            const value = details[field] || Object.entries(details).find(([k]) => normalizeKey(k) === normalizeKey(field))?.[1];
            const issueDate = parseDateString(value);
            if (issueDate) {
                issueDate.setDate(issueDate.getDate() + docType.validity_days);
                return issueDate;
            }
        }
    }

    return null; // No reliable date found
};

// --- NEW: Function to calculate days until expiry ---
export const getDaysUntilExpiry = (doc, docType) => {
    const expiryDate = getExpiryDate(doc, docType);
    if (!expiryDate) {
        return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiryDate.setHours(0, 0, 0, 0);

    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
};


export const getDocumentStatus = (doc, docType) => {
    const daysRemaining = getDaysUntilExpiry(doc, docType);
    
    if (daysRemaining === null) {
        return 'safe'; // If no expiry date can be determined, assume it's safe.
    }

    if (daysRemaining < 0) return 'expired';
    if (daysRemaining <= 30) return 'grace';
    return 'safe';
};


export const getStatusClass = (status) => {
    switch (status) {
        case 'expired':
            return 'bg-red-100';
        case 'grace':
            return 'bg-orange-100';
        default:
            return ''; // 'safe' or 'missing' don't need a special background
    }
};

export const getExpandedRowStatusClass = (status) => {
    switch (status) {
        case 'expired':
            return 'bg-red-50/70 border-l-4 border-red-400';
        case 'grace':
            return 'bg-orange-50/70 border-l-4 border-orange-400';
        default:
            return 'bg-blue-50 border-l-4 border-blue-300';
    }
};

export const calculateAge = (dob) => {
    const birthDate = parseDateString(dob);
    if (!birthDate) return null;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};

export const isDocApplicable = (person, doc) => {
    if (!doc || !person) return false;
    const { requirements } = doc;
    if (!requirements) return true;

    if (requirements.nationality) {
        const isKenyan = person.nationality?.toLowerCase() === 'kenyan';
        if (requirements.nationality.kenyan === false && isKenyan) return false;
        if (requirements.nationality.foreigner === false && !isKenyan) return false;
    }

    if (requirements.age_requirement && person.age !== null) {
        const isAdult = person.age >= 18;
        if (requirements.age_requirement === 'adult' && !isAdult) return false;
        if (requirements.age_requirement === 'minor' && isAdult) return false;
    }

    return true;
};

// Helper to sort documents by the most relevant date field, falling back to creation date
export const sortDocumentsByLatest = (docs) => {
    const dateFields = [
        'With_Effect_From', 'issue_date', 'issued_at', 'valid_from',
        'from', 'date_of_issue', 'expiry_date'
    ];

    const getDocDate = (doc) => {
        if (doc.extracted_details) {
            for (const field of dateFields) {
                const value = doc.extracted_details[field];
                const date = parseDateString(value);
                if (date) {
                    return date;
                }
            }
        }
        return new Date(doc.created_at);
    };

    return [...docs].sort((a, b) => getDocDate(b) - getDocDate(a));
};

// Fetches documents that have already been uploaded for a given set of individuals
export const fetchUploadedDocuments = async (personIds) => {
    if (!personIds || personIds.length === 0) return [];

    try {
        const numericIds = personIds
            .map(id => {
                const match = String(id).match(/\d+/);
                return match ? parseInt(match[0], 10) : null;
            })
            .filter(id => id !== null);

        if (numericIds.length === 0) return [];

        const { data, error } = await supabase
            .from('acc_portal_directors_documents')
            .select('id, director_id, document_id, expiry_date, file_path, extracted_details, created_at')
            .in('director_id', numericIds);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error("Error fetching uploaded documents:", error);
        toast.error("Could not fetch uploaded document statuses.");
        return [];
    }
};