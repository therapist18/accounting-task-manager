// @ts-nocheck
import { format, parse, isValid } from "date-fns"

export const isValidDateFormat = (dateStr: string): boolean => {
  if (!dateStr || typeof dateStr !== 'string') return false;
  
  // Check for common valid date formats
  const dateFormats = [
    /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
    /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY
    /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
    /^\d{4}\/\d{2}\/\d{2}$/ // YYYY/MM/DD
  ];
  return dateFormats.some(format => format.test(dateStr));
};

export const findDateInObject = (obj: any, dateFields: string[]): string | null => {
  if (!obj || typeof obj !== 'object') {
    return null;
  }
  
  // Helper function to parse date string only if needed
  const parseDateIfNeeded = (dateStr: string): string | null => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    
    const trimmedStr = dateStr.trim();
    if (!trimmedStr) return null;
    
    // Check if it's already in DD/MM/YYYY HH:mm or DD/MM/YYYY format (display format)
    // This is the format we want to preserve as-is - don't convert it!
    const displayFormatRegex = /^\d{2}\/\d{2}\/\d{4}( \d{2}:\d{2})?$/;
    if (displayFormatRegex.test(trimmedStr)) {
      // console.log(`[findDateInObject] Date already in display format, preserving:`, trimmedStr);
      return trimmedStr; // Return as-is without conversion
    }
    
    // If already in a valid format like YYYY-MM-DD, return as is
    if (isValidDateFormat(trimmedStr)) {
      return trimmedStr;
    }
    
    // Common date formats to try for conversion
    const dateFormats = [
      'dd/MM/yyyy',
      'dd-MM-yyyy',
      'dd.MM.yyyy',
      'MM/dd/yyyy',
      'MM-dd-yyyy',
      'MM.dd.yyyy',
      'yyyy-MM-dd',
      'yyyy/MM/dd',
      'dd/MM/yy',
      'dd-MM-yy',
      'MM/dd/yy',
      'MM-dd-yy'
    ];
    
    // Try each format
    for (const formatStr of dateFormats) {
      try {
        const parsedDate = parse(trimmedStr, formatStr, new Date());
        if (isValid(parsedDate)) {
          // Convert to DD/MM/YYYY HH:mm format to match display format
          return format(parsedDate, 'dd/MM/yyyy HH:mm');
        }
      } catch (e) {
        // Ignore parse errors and try next format
      }
    }
    
    // Try ISO format (timestamps like "2025-12-16T07:00:46.224Z")
    if (!isNaN(Date.parse(trimmedStr))) {
      const date = new Date(trimmedStr);
      // Convert timestamps to DD/MM/YYYY HH:mm format
      return format(date, 'dd/MM/yyyy HH:mm');
    }
    
    return null;
  };
  
  // First, check for exact matches in dateFields
  for (const key in obj) {
    if (dateFields.includes(key) && obj[key] !== null && obj[key] !== undefined) {
      const dateValue = obj[key];
      
      // Handle string dates
      if (typeof dateValue === 'string') {
        const parsedDate = parseDateIfNeeded(dateValue);
        if (parsedDate) {
          // console.log(`[findDateInObject] Found date in field '${key}':`, dateValue, '->', parsedDate);
          return parsedDate;
        }
      }
      // Handle date objects
      else if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
        const formattedDate = format(dateValue, 'dd/MM/yyyy HH:mm');
        // console.log(`[findDateInObject] Found Date object in field '${key}':`, formattedDate);
        return formattedDate;
      }
    }
  }

  // Then check for partial matches (case insensitive)
  const lowerDateFields = dateFields.map(f => f.toLowerCase());
  for (const key in obj) {
    const lowerKey = key.toLowerCase();
    if (lowerDateFields.some(df => lowerKey.includes(df)) && obj[key] !== null && obj[key] !== undefined) {
      const dateValue = obj[key];
      
      // Handle string dates
      if (typeof dateValue === 'string') {
        const parsedDate = parseDateIfNeeded(dateValue);
        if (parsedDate) {
          // console.log(`[findDateInObject] Found date in partial match field '${key}':`, dateValue, '->', parsedDate);
          return parsedDate;
        }
      }
      // Handle date objects
      else if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
        const formattedDate = format(dateValue, 'dd/MM/yyyy HH:mm');
        // console.log(`[findDateInObject] Found Date object in partial match field '${key}':`, formattedDate);
        return formattedDate;
      }
    }
  }

  // Finally, recursively check nested objects
  for (const key in obj) {
    if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      const nestedDate = findDateInObject(obj[key], dateFields);
      if (nestedDate) {
        return nestedDate;
      }
    }
  }

  // console.log('[findDateInObject] No valid date found in object for fields:', dateFields, 'Object keys:', Object.keys(obj));
  return null;
};

/**
 * Determines which fields in the document configuration count as "Date Fields".
 * Looks for 'isImmigrationDate', fields with type 'date', or common date names.
 */
export const getPossibleDateFields = (
  documentFields: any[] | undefined, 
  stage: any, 
  linkedDocument: any
): string[] => {
  // console.log('[getPossibleDateFields] Document fields:', documentFields);
  // console.log('[getPossibleDateFields] Stage config fields:', stage?.document_config?.fields);
  
  // First check if we have document fields from the linked document
  if (documentFields && documentFields.length > 0) {
    const docTypeDateFields = documentFields
      .filter((field: any) => {
        // Check if field is marked as immigration date or has date in name/type
        const isImmigrationDate = field.isImmigrationDate === true;
        const isDateField = field.type === 'date' || 
                          field.field_type === 'date' || 
                          field.data_type === 'date' ||
                          (field.name && field.name.toLowerCase().includes('date')) ||
                          (field.key && field.key.toLowerCase().includes('date'));
        
        return isImmigrationDate || isDateField;
      })
      .map((field: any) => field.name || field.key)
      .filter(Boolean); // Remove any undefined/null values

    if (docTypeDateFields.length > 0) {
      // console.log('[getPossibleDateFields] Using date fields from document type:', docTypeDateFields);
      return docTypeDateFields;
    }
  }

  // Fallback to stage document config if available
  if (stage?.document_config?.fields) {
    const configFields = stage.document_config.fields
      .filter((field: any) => {
        return field.isImmigrationDate === true || 
               field.type === 'date' || 
               field.field_type === 'date' || 
               field.data_type === 'date';
      })
      .map((field: any) => field.name || field.key)
      .filter(Boolean);

    if (configFields.length > 0) {
      // console.log('[getPossibleDateFields] Using date fields from stage config:', configFields);
      return configFields;
    }
  }

  // If we still don't have date fields, try to find any date-like fields in extracted details
  if (linkedDocument?.extracted_details) {
    const potentialDateFields = Object.entries(linkedDocument.extracted_details)
      .filter(([_, value]) => {
        if (typeof value !== 'string') return false;
        // Check for common date patterns
        return /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(value) || // DD/MM/YYYY or similar
               /^\d{4}[\-\/]\d{1,2}[\-\/]\d{1,2}/.test(value); // YYYY-MM-DD
      })
      .map(([key]) => key);

    if (potentialDateFields.length > 0) {
      // console.log('[getPossibleDateFields] Inferred potential date fields from extracted details:', potentialDateFields);
      return potentialDateFields;
    }
  }

  // Final fallback to common date field names
  const commonDateFields = [
    'date', 
    'application_date', 
    'document_date', 
    'submission_date',
    'date_and_time',
    'receipt_date',
    'transaction_date',
    'created_at',
    'updated_at'
  ].filter(field => 
    linkedDocument?.extracted_details && 
    field in linkedDocument.extracted_details
  );

  if (commonDateFields.length > 0) {
    // console.log('[getPossibleDateFields] Using common date fields:', commonDateFields);
    return commonDateFields;
  }

  return [];
};

/**
 * Main logic to calculate the effective date for a stage
 */
export const calculateStageDate = (
  stage: any,
  stageData: any,
  linkedDocument: any,
  documentFields: any[],
  valueProp: string | null | undefined,
  isLoadingFields: boolean
): string => {
  const requiresUpload = stage.documents && stage.documents.length > 0;
  const hasDocumentsUploaded = stageData?.documentsUploaded !== undefined && stageData?.documentsUploaded !== null;
  
  // Check if we have a linked document with data
  const hasLinkedDocument = (() => {
    if (!linkedDocument) return false;
    const hasDocument = linkedDocument.file_path ||
      linkedDocument.url ||
      linkedDocument.document_url ||
      linkedDocument.extracted_details ||
      linkedDocument.extracted_data;
    
    // Note: In the original component this also checked `isDocumentApplicable`, 
    // but that usually happens before this function is called.
    return !!hasDocument;
  })();

  // For completed stages without a document, return empty string to allow manual date entry (or return stageData.date)
  if (stageData?.status === 'completed' && !hasLinkedDocument) {
    // console.log('[calculateStageDate] Stage completed without document, using stage data date:', stageData.date);
    return stageData.date || '';
  }
  
  // If we're still loading fields, return null to prevent flash of incorrect state
  if (isLoadingFields) {
    // console.log('[calculateStageDate] Still loading document fields, waiting...');
    return null;
  }
  
  // Check for document dates first
  if ((requiresUpload || hasDocumentsUploaded) && hasLinkedDocument) {
    
    // Get the fields we should look for
    const dateFields = getPossibleDateFields(documentFields, stage, linkedDocument);

    // Check extracted_details for dates
    if (linkedDocument.extracted_details) {
      const extractedDate = findDateInObject(linkedDocument.extracted_details, dateFields);
      if (extractedDate) {
        return extractedDate;
      }
    }
    
    // Check extracted_data for dates
    if (linkedDocument.extracted_data) {
      const extractedDate = findDateInObject(linkedDocument.extracted_data, dateFields);
      if (extractedDate) {
        return extractedDate;
      }
    }
    
    // If we get here, no date was found in the document
    const hasAnyDateField = dateFields.some(field =>
      (linkedDocument.extracted_details && field in linkedDocument.extracted_details) ||
      (linkedDocument.extracted_data && field in linkedDocument.extracted_data)
    );
    
    // Fallback to completedAt timestamp if no document field found
    if (!hasAnyDateField && stageData?.completedAt) {
      // console.log('[calculateStageDate] Using completedAt as fallback:', stageData.completedAt);
      const completedDate = new Date(stageData.completedAt);
      if (isValid(completedDate)) {
        return format(completedDate, 'dd/MM/yyyy HH:mm');
      }
      return stageData.completedAt;
    }
    return '';
  }
  
  // For non-document stages, use the value prop if available
  if (!requiresUpload && !hasDocumentsUploaded && valueProp) {
    // console.log('[calculateStageDate] Using value prop for non-document stage:', valueProp);
    return typeof valueProp === 'string' ? valueProp : '';
  }
  
  return '';
};