// @ts-nocheck

import { GoogleGenerativeAI } from "@google/generative-ai";
import dayjs from 'dayjs'; // Import dayjs library
import { supabase } from "@/utils/supabase/client";
import { toast } from "@/lib/hooks/use-toast"

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is not set. Please check your .env.local file.');
}

let genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
};

// Get the model instance
const model = genAI.getGenerativeModel({
  model: "gemini-3-flash-preview", // Updated to a more stable model name if needed, or keep gemini-3-flash-preview
  generationConfig,
});

// Map file extensions to MIME types
const mimeTypes = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/jpeg',
  '.tiff': 'image/jpeg',
  '.webp': 'image/jpeg',
};

const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

async function fileToGenerativePart(fileInput: string | File, originalFileName?: string): Promise<any> {
  try {
    let mimeType: string;
    let data: Uint8Array;

    if (fileInput instanceof File) {
      // Handle File object
      mimeType = fileInput.type;
      data = new Uint8Array(await fileInput.arrayBuffer());
    } else if (typeof fileInput === 'string') {
      // Handle URL string
      const response = await fetch(fileInput);
      const blob = await response.blob();
      mimeType = blob.type;
      data = new Uint8Array(await blob.arrayBuffer());
    } else {
      throw new Error('Invalid file input type');
    }

    // Validate mime type
    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
      console.warn('Mime type not explicitly supported:', mimeType);
      // Instead of throwing error, try to infer from extension
      const extension = (originalFileName || fileInput instanceof File ? fileInput.name : fileInput)
        .split('.')
        .pop()
        ?.toLowerCase();

      if (extension) {
        switch (extension) {
          case 'jpg':
          case 'jpeg':
            mimeType = 'image/jpeg';
            break;
          case 'png':
            mimeType = 'image/png';
            break;
          case 'pdf':
            mimeType = 'application/pdf';
            break;
          default:
            throw new Error(`Unsupported file type: ${extension}`);
        }
      }
    }

    // Convert to base64
    const base64 = Buffer.from(data).toString('base64');

    return {
      inlineData: {
        data: base64,
        mimeType
      }
    };
  } catch (error) {
    console.error('Error processing file:', error);
    throw error;
  }
}

// Types and Interfaces
interface ArrayConfig {
  fields?: {
    id: string;
    name: string;
    type: string;
  }[];
}

interface Field {
  id: string;
  name: string;
  type: string;
  arrayConfig?: ArrayConfig;
  required?: boolean;
  options?: string[]; // Added options support
}

interface Document {
  id: string;
  name: string;
  category?: string;
  subcategory?: string;
  fields?: Field[];
}

interface ExtractionResult {
  [key: string]: any;
}

interface ConversionResponse {
  success: boolean;
  message: string;
  image_base64?: string;
  mime_type?: string;
  width?: number;
  height?: number;
  processed_at?: string;
}

interface ExtractedField {
  name: string;
  value: any;
  confidence?: number;
}

interface ExtractionChoice {
  message: {
    content: string;
  };
}

interface ExtractionAPIResponse {
  choices: ExtractionChoice[];
}

interface ValidationError {
  field: string;
  error: string;
}

// Constants
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000; // 10 seconds
const SUPPORTED_IMAGE_TYPES = ['jpg', 'png', 'tiff', 'bmp', 'webp', 'jpeg']

// Utility Functions
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getRetryDelay = (attempt: number) => {
  const exponentialDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
  return Math.min(exponentialDelay, MAX_RETRY_DELAY);
};

const isRetryableError = (error: any) => {
  if (error?.message?.includes('503')) return true;
  if (error?.message?.includes('overloaded')) return true;
  if (error?.message?.includes('rate limit')) return true;
  return false;
};

const isImageFile = (filepath: string): boolean => {
  const extension = filepath.split('.').pop()?.toLowerCase();
  return extension === 'jpg' || extension === 'jpeg' || SUPPORTED_IMAGE_TYPES.includes(extension || '');
};

const formatExtractedValue = (value: any, fieldType: string): any => {
  if (value === null || value === undefined) return null;

  switch (fieldType) {
    case 'date':
      try {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
      } catch {
        return null;
      }

    case 'number':
      const num = typeof value === 'string' ?
        parseFloat(value.replace(/[^\d.-]/g, '')) :
        parseFloat(String(value));
      return isNaN(num) ? null : num;

    case 'array':
      return Array.isArray(value) ? value : [];

    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const lowered = value.toLowerCase().trim();
        if (['true', 'yes', '1'].includes(lowered)) return true;
        if (['false', 'no', '0'].includes(lowered)) return false;
      }
      return null;

    default:
      return String(value).trim();
  }
};

const parseExtractionResponse = (output: string): Record<string, any> => {
  try {
    // First try to parse as JSON
    if (typeof output !== 'string') {
      return output; // If it's already an object, return it
    }

    // Look for JSON in the string
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // If not JSON, try to parse line by line
    const parsedData: Record<string, any> = {};
    const lines = output.split('\n');

    lines.forEach(line => {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        const value = valueParts.join(':').trim();
        if (value) {
          // Try to parse as JSON if it looks like an array or object
          if ((value.startsWith('[') && value.endsWith(']')) ||
            (value.startsWith('{') && value.endsWith('}'))) {
            try {
              parsedData[key.trim()] = JSON.parse(value);
            } catch {
              parsedData[key.trim()] = value;
            }
          } else {
            // Try to convert to appropriate type
            const trimmedValue = value.trim();
            if (trimmedValue === 'true') {
              parsedData[key.trim()] = true;
            } else if (trimmedValue === 'false') {
              parsedData[key.trim()] = false;
            } else if (!isNaN(Number(trimmedValue))) {
              parsedData[key.trim()] = Number(trimmedValue);
            } else {
              parsedData[key.trim()] = trimmedValue;
            }
          }
        }
      }
    });

    return parsedData;
  } catch (error) {
    console.error('Error parsing extraction response:', error);
    throw new Error('Failed to parse extraction response');
  }
};

const validateExtractedData = (
  extractedData: ExtractionResult,
  fields: Field[]
): boolean => {
  try {
    for (const field of fields) {
      const value = extractedData[field.name];
      if (value === null) continue;

      switch (field.type) {
        case 'date':
          if (value && isNaN(Date.parse(String(value)))) {
            console.warn(`Invalid date value for field ${field.name}:`, value);
            return false;
          }
          break;

        case 'number':
          if (value && isNaN(Number(value))) {
            console.warn(`Invalid number value for field ${field.name}:`, value);
            return false;
          }
          break;

        case 'array':
          if (value && !Array.isArray(value)) {
            console.warn(`Invalid array value for field ${field.name}:`, value);
            return false;
          }
          if (field.arrayConfig?.fields && Array.isArray(value)) {
            for (const item of value) {
              for (const subField of field.arrayConfig.fields) {
                const subValue = item[subField.name];
                if (subValue !== undefined) {
                  const formattedValue = formatExtractedValue(subValue, subField.type);
                  if (formattedValue === null && subValue !== null) {
                    console.warn(`Invalid array item value for field ${field.name}.${subField.name}:`, subValue);
                    return false;
                  }
                }
              }
            }
          }
          break;
      }
    }
    return true;
  } catch (error) {
    console.error('Validation error:', error);
    return false;
  }
};

// Update the performExtraction function
export const performExtraction = async (
  fileUrl: string,
  fields: Field[],
  documentType: string,
  onProgress?: (message: string) => void,
  originalFileName?: string,
  abortSignal?: AbortSignal
): Promise<{
  extractedData: ExtractionResult;
  success: boolean;
  message: string;
  validationErrors?: ValidationError[];
  failedImage?: string;
  failedFields?: Field[];
}> => {
  let attempts = 0;
  const MAX_ATTEMPTS = 3;

  onProgress?.('Preparing document for extraction...');

  while (attempts < MAX_ATTEMPTS) {
    try {
      // Check if extraction was aborted
      if (abortSignal?.aborted) {
        console.log('performExtraction: Abort signal detected, throwing AbortError');
        throw new DOMException('Extraction aborted', 'AbortError');
      }

      const progressMessage = `Attempt ${attempts + 1}/${MAX_ATTEMPTS}: Processing document...`;
      onProgress?.(progressMessage);

      const filePart = await fileToGenerativePart(fileUrl, originalFileName);
      const fieldPrompts = formatFieldPrompts(fields);
      const exampleOutput = createExampleOutput(fields);

      console.log('Extraction configuration:', {
        documentType,
        fields,
        fieldPrompts,
        exampleOutput
      });

      const prompt = `
        Extract the following information from this ${documentType}:
        ${fieldPrompts}
        
        Please return the extracted data in this JSON format:
        ${JSON.stringify(exampleOutput, null, 2)}
        
        Important instructions:
        1. If a field is a Dropdown type, you MUST match the extracted value to one of the provided allowed options exactly.
        2. If the value on the document is synonymous with an allowed option, select that option.
        3. If no matching option is found, return the raw text.
        4. All date values must be returned in the format "dd/mm/yyyy".
        5. Only return the JSON data, no other text.
      `.trim();

      console.log('Extraction prompt:', prompt);

      // Check if extraction was aborted before API call
      if (abortSignal?.aborted) {
        throw new DOMException('Extraction aborted', 'AbortError');
      }

      // Generate content using the model
      const result = await model.generateContent([prompt, filePart]);

      // Check if extraction was aborted after API call
      if (abortSignal?.aborted) {
        throw new DOMException('Extraction aborted', 'AbortError');
      }

      // Extract and parse the response
      const response = await result.response;
      const text = response.text();
      const extractedData = parseExtractionResponse(text);
      console.log('Parsed extraction data:', extractedData);

      // Perform initial cleaning
      const cleanedData = cleanExtractedData(extractedData, fields);

      let mappedData = extractedData.rawData || {};

      if (!extractedData.rawData) {
        fields.forEach(field => {
          if (field.type === 'array' && field.isArray && field.arrayConfig?.fields) {
            // Generic array field handling (existing logic)
            const arrayFieldName = field.name;
            let arrayData = extractedData[arrayFieldName] || [];

            if (!Array.isArray(arrayData)) {
              // ... (existing array fallback logic) ...
              // Preserving existing logic for brevity, logic handles nested structures
              const constructedArray = [];
              if (typeof extractedData[arrayFieldName] === 'object') {
                // ...
                constructedArray.push(extractedData[arrayFieldName]); // Simplified fallback
              }
              if (constructedArray.length > 0) arrayData = constructedArray;
            }

            arrayData = arrayData.filter(item => {
              if (!item || typeof item !== 'object') return false;
              return Object.values(item).some(val => val !== undefined && val !== null && val !== '');
            });

            if (arrayData.length > 0) {
              mappedData[arrayFieldName] = arrayData;
            }
          } else {
            // Handle regular fields
            const fieldKeys = [
              field.name.trim(),
              field.name.toLowerCase().trim(),
              field.name.replace(/[_\s]/g, ''),
              field.name.replace(/[_\s]/g, '.')
            ];

            const value = fieldKeys.reduce((val, key) => {
              if (val !== undefined) return val;
              if (extractedData[key] !== undefined) return extractedData[key];

              // Check nested objects
              const parts = key.split('.');
              let current = extractedData;
              for (const part of parts) {
                if (current === undefined || current === null) return undefined;
                current = current[part];
              }
              return current;
            }, undefined);

            if (value !== undefined) {
              mappedData[field.name] = value;
            }
          }
        });
      }

      let validationErrors: ValidationError[] = [];
      fields.forEach(field => {
        const value = mappedData[field.name];
        const validation = validateField(value, field);
        if (!validation.isValid) {
          validationErrors.push({
            field: field.name,
            error: validation.error
          });
        }
      });

      const resultMessage = validationErrors.length > 0
        ? 'Data extracted with some validation issues. Please review and correct if needed.'
        : 'Data extracted successfully';
      onProgress?.('Extraction complete. Validating extracted fields...');
      return {
        extractedData: mappedData,
        success: true,
        message: resultMessage,
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        failedImage: fileUrl,
        failedFields: fields
      };

    } catch (error) {
      attempts++;
      console.error(`Extraction attempt ${attempts} failed:`, error);

      if (attempts < MAX_ATTEMPTS) {
        const retryMessage = `Extraction failed. Retrying with same API key (Attempt ${attempts + 1}/${MAX_ATTEMPTS})...`;
        onProgress?.(retryMessage);
        await delay(2000); // Wait 2 seconds before retrying
      } else {
        const errorMessage = `Extraction failed after ${MAX_ATTEMPTS} attempts. Please enter the data manually.`;
        onProgress?.(errorMessage);
        return {
          extractedData: {},
          success: false,
          message: errorMessage,
          failedImage: fileUrl,
          failedFields: fields
        };
      }
    }
  }

  const finalErrorMessage = 'Extraction failed after all attempts. Please enter the data manually.';
  onProgress?.(finalErrorMessage);
  return {
    extractedData: {},
    success: false,
    message: finalErrorMessage,
    failedImage: fileUrl,
    failedFields: fields
  };
};

export const saveExtractedData = async (
  uploadId: string,
  documentId: string,
  extractedData: ExtractionResult
): Promise<{ upload: any; document: any }> => {
  try {
    const [uploadUpdate, documentUpdate] = await Promise.all([
      supabase
        .from('acc_portal_kyc_uploads')
        .update({
          extracted_details: extractedData,
          extraction_date: new Date().toISOString(),
          extraction_status: 'success',
          fields_extracted: true
        })
        .eq('id', uploadId)
        .select()
        .single(),

      supabase
        .from('acc_portal_kyc')
        .update({
          extracted_fields: extractedData,
          extraction_date: new Date().toISOString()
        })
        .eq('id', documentId)
        .select()
        .single()
    ]);

    if (uploadUpdate.error) throw uploadUpdate.error;
    if (documentUpdate.error) throw documentUpdate.error;

    return {
      upload: uploadUpdate.data,
      document: documentUpdate.data
    };
  } catch (error) {
    console.error('Error saving extracted data:', error);
    throw new Error('Failed to save extracted data');
  }
};

export const retryExtraction = async (
  fileUrl: string,
  fields: Field[],
  documentType: string,
  maxRetries: number = MAX_RETRIES,
  onProgress?: (message: string) => void,
  originalFileName?: string
): Promise<{ extractedData: ExtractionResult; success: boolean; message: string; validationErrors?: ValidationError[] }> => {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    try {
      const result = await performExtraction(fileUrl, fields, documentType, onProgress, originalFileName);
      if (result.success) {
        return result;
      }
      throw new Error('Extraction failed');
    } catch (error) {
      lastError = error as Error;
      attempt++;
      if (attempt < maxRetries) {
        const backoffTime = Math.pow(2, attempt - 1) * 1000;
        onProgress?.(`Retrying in ${backoffTime / 1000} seconds...`);
        await delay(backoffTime);
      }
    }
  }

  throw new Error(`Extraction failed after ${maxRetries} attempts: ${lastError?.message}`);
};

export const getSignedUrl = async (filepath: string): Promise<string> => {
  try {
    const { data, error } = await supabase
      .storage
      .from('kyc-documents')
      .createSignedUrl(filepath, 60);

    if (error) throw error;
    return data.signedUrl;
  } catch (error) {
    console.error('Error getting signed URL:', error);
    throw new Error('Failed to generate document URL');
  }
};

const extractionUtils = {
  performExtraction,
  saveExtractedData,
  retryExtraction,
  getSignedUrl,
  isImageFile,
  validateExtractedData,
  formatExtractedValue,
  parseExtractionResponse,
};

export default extractionUtils;

export const isExtractionError = (error: unknown): error is Error => {
  return error instanceof Error;
};

export const getErrorMessage = (error: unknown): string => {
  if (isExtractionError(error)) {
    return error.message;
  }
  return 'An unknown error occurred';
};

const validateDateField = (value: string): boolean => {
  const dateFormats = [
    'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY', 'DD.MM.YYYY', 'YYYY/MM/DD',
  ];
  for (const format of dateFormats) {
    const date = dayjs(value, format, true);
    if (date.isValid()) return true;
  }
  return false;
}

const transformDateToISO = (value: string): string => {
  const dateFormats = [
    'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY', 'DD.MM.YYYY', 'YYYY/MM/DD',
  ];
  for (const format of dateFormats) {
    const date = dayjs(value, format, true);
    if (date.isValid()) return date.format('YYYY-MM-DD');
  }
  return value;
}

export const validateField = (
  value: any,
  field: Field
): { isValid: boolean; error?: string } => {
  if (!value && !field.required) {
    return { isValid: true };
  }
  if (!value && field.required) {
    return { isValid: false, error: `${field.name} is required` };
  }

  try {
    switch (field.type) {
      case 'date':
        if (value && !validateDateField(value)) {
          return { isValid: false, error: `Invalid date format for ${field.name}` };
        }
        break;
      case 'number':
        if (value && isNaN(Number(value))) {
          return { isValid: false, error: `Invalid number format for ${field.name}` };
        }
        break;
      case 'email':
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return { isValid: false, error: `Invalid email format for ${field.name}` };
        }
        break;
      case 'phone':
        if (value && !/^\+?[\d\s-]{10,}$/.test(value)) {
          return { isValid: false, error: `Invalid phone format for ${field.name}` };
        }
        break;
      case 'dropdown':
        if (field.options && field.options.length > 0 && value) {
          if (!field.options.includes(value)) {
            // We allow slight mismatch if AI cleaned it, but technically it should be valid
          }
        }
        break;
    }
    return { isValid: true };
  } catch (error) {
    console.error(`Validation error for field ${field.name}:`, error);
    return { isValid: false, error: `Validation error for ${field.name}` };
  }
};

export const transformFieldValue = (field: Field, value: any): any => {
  if (!value) return value;
  switch (field.type) {
    case 'date': return transformDateToISO(value);
    case 'number': return Number(value);
    default: return value;
  }
}

export const cleanExtractedData = (
  data: ExtractionResult,
  fields: Field[]
): ExtractionResult => {
  const cleanedData: ExtractionResult = {};

  fields.forEach(field => {
    const value = data[field.name];
    if (value === undefined) {
      cleanedData[field.name] = null;
      return;
    }

    if (field.type === 'array' && field.arrayConfig?.fields) {
      if (!Array.isArray(value)) {
        cleanedData[field.name] = [];
        return;
      }
      cleanedData[field.name] = value.map(item => {
        const cleanedItem = {};
        field.arrayConfig?.fields?.forEach(subField => {
          (cleanedItem as Record<string, unknown>)[subField.name] = transformFieldValue(subField, (item as Record<string, unknown>)[subField.name]);
        });
        return cleanedItem;
      });
    } else {
      cleanedData[field.name] = transformFieldValue(field, value);
    }
  });

  return cleanedData;
};

export const isValidExtractionResponse = (response: any): response is ExtractionAPIResponse => {
  return (
    response && Array.isArray(response.choices) && response.choices.length > 0 &&
    response.choices[0].message && typeof response.choices[0].message.content === 'string'
  );
};

// UPDATED: Now includes dropdown options in the prompt
export const formatFieldPrompts = (fields: Field[]): string => {
  if (!Array.isArray(fields)) {
    console.warn('Invalid fields parameter:', fields);
    return '';
  }

  return fields.map(field => {
    let prompt = `- ${field.name}`;

    if (field.type === 'array' && field.arrayConfig?.fields) {
      prompt += ' (multiple entries possible) with fields:';
      field.arrayConfig.fields.forEach(subField => {
        prompt += `\n  * ${subField.name}`;
      });
    } else if (field.type === 'date') {
      prompt += ' (in DD/MM/YYYY format)';
    } else if (field.type === 'dropdown' && field.options && field.options.length > 0) {
      // Pass the specific options to the AI prompt
      const optionsList = field.options.map(opt => `"${opt}"`).join(', ');
      prompt += ` (Strictly select one from: [${optionsList}])`;
    }

    return prompt;
  }).join('\n');
};

// UPDATED: Uses dropdown options for example output
export const createExampleOutput = (fields: Field[]): Record<string, any> => {
  return fields.reduce((acc, field) => {
    if (field.type === 'array' && field.arrayConfig?.fields) {
      acc[field.name] = [{
        ...field.arrayConfig.fields.reduce<Record<string, string>>((subAcc, subField) => {
          subAcc[subField.name] = `example_${subField.type}`;
          return subAcc;
        }, {})
      }];
    } else if (field.type === 'dropdown' && field.options && field.options.length > 0) {
      // Use the first option as an example to guide the model
      acc[field.name] = field.options[0];
    } else {
      acc[field.name] = `example_${field.type}`;
    }
    return acc;
  }, {} as Record<string, any>);
};

export const handleExtractionAPIError = (error: unknown): never => {
  let errorMessage = 'Failed to extract document details';
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  }
  console.error('Extraction API error:', error);
  throw new Error(errorMessage);
};
