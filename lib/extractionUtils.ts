// @ts-nocheck
import { GoogleGenerativeAI } from "@google/generative-ai";
import dayjs from 'dayjs'; // Import dayjs library
import { API_KEYS } from './apiKeys';
import supabase from "./supabase/client";

// Initialize the Gemini API
let currentApiKeyIndex = 0;
let genAI = new GoogleGenerativeAI(API_KEYS[currentApiKeyIndex]);

// Track rate limits for each API key
const apiKeyStatus = new Map<string, {
  lastUsed: number;
  failureCount: number;
  cooldownUntil: number;
}>();

// Initialize status for all API keys
API_KEYS.forEach(key => {
  apiKeyStatus.set(key, {
    lastUsed: 0,
    failureCount: 0,
    cooldownUntil: 0
  });
});

const RATE_LIMIT_COOLDOWN = 60000; // 1 minute cooldown
const MAX_FAILURES = 3; // Max consecutive failures before cooling down

const getNextAvailableApiKey = (): string | null => {
  const now = Date.now();
  
  // Try to find a key that's not in cooldown
  for (let i = 0; i < API_KEYS.length; i++) {
    const key = API_KEYS[i];
    const status = apiKeyStatus.get(key);
    
    if (!status) continue;
    
    // Skip keys in cooldown
    if (now < status.cooldownUntil) continue;
    
    // Reset failure count if it's been more than the cooldown period
    if (now - status.lastUsed > RATE_LIMIT_COOLDOWN) {
      status.failureCount = 0;
    }
    
    // Use this key if it hasn't failed too many times
    if (status.failureCount < MAX_FAILURES) {
      return key;
    }
  }
  
  return null; // All keys are in cooldown
};

const markApiKeyFailure = (key: string) => {
  const status = apiKeyStatus.get(key);
  if (!status) return;
  
  status.failureCount++;
  status.lastUsed = Date.now();
  
  // Put key in cooldown if it's failed too many times
  if (status.failureCount >= MAX_FAILURES) {
    status.cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN;
    console.log(`API key ${key} put in cooldown until ${new Date(status.cooldownUntil).toISOString()}`);
  }
  
  apiKeyStatus.set(key, status);
};

const resetApiKeyStatus = (key: string) => {
  apiKeyStatus.set(key, {
    lastUsed: Date.now(),
    failureCount: 0,
    cooldownUntil: 0
  });
};

// Update getNextApiKey to use the new rotation mechanism
const getNextApiKey = (): string => {
  const nextKey = getNextAvailableApiKey();
  
  if (!nextKey) {
    // All keys are in cooldown, wait for the shortest cooldown
    const minCooldown = Math.min(...Array.from(apiKeyStatus.values()).map(s => s.cooldownUntil));
    const waitTime = Math.max(0, minCooldown - Date.now());
    
    if (waitTime > 0) {
      console.log(`All API keys are in cooldown. Waiting ${waitTime}ms...`);
      return API_KEYS[0]; // Return first key, it will fail but that's okay
    }
    
    // Reset all keys if all are in cooldown
    API_KEYS.forEach(key => resetApiKeyStatus(key));
  }
  
  return nextKey || API_KEYS[0];
};

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
};

const model = genAI.getGenerativeModel({ 
  model: "gemini-2.0-flash",
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

export const fetchKycFields = async (kycId: string): Promise<Field[]> => {
  try {
    const response = await fetch(`/api/kyc-fields/${kycId}`);
    if (!response.ok) throw new Error('Failed to fetch KYC fields');
    const data = await response.json();
    return data.fields || [];
  } catch (error) {
    console.error('Error fetching KYC fields:', error);
    return [];
  }
};

// Update the performExtraction function to handle array fields better
export const performExtraction = async (
  fileUrl: string,
  fields: Field[],
  documentType: string,
  onProgress?: (message: string) => void,
  originalFileName?: string,
  kycId?: string
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

  while (attempts < MAX_ATTEMPTS) {
    try {
      onProgress?.(`Attempt ${attempts + 1}/${MAX_ATTEMPTS}: Processing document...`);
      
      // If kycId is provided, fetch fields from KYC document
      let extractionFields = fields;
      if (kycId) {
        onProgress?.('Fetching document fields...');
        const kycFields = await fetchKycFields(kycId);
        if (kycFields.length > 0) {
          extractionFields = kycFields;
        }
      }
      
      const filePart = await fileToGenerativePart(fileUrl, originalFileName);
      const fieldPrompts = formatFieldPrompts(extractionFields);
      const exampleOutput = createExampleOutput(extractionFields);
      
      console.log('Extraction configuration:', {
        documentType,
        fields,
        fieldPrompts,
        exampleOutput
      });

      // Create detailed array field descriptions for better extraction
      const arrayFieldDescriptions = extractionFields
        .filter(field => (field.type === 'array' || field.isArray) && field.arrayConfig?.fields)
        .map(field => {
          const subFieldsDesc = field.arrayConfig!.fields!.map(sf => `"${sf.name}": "${sf.type}"`).join(', ');
          return `${field.name}: Array of objects, each containing {${subFieldsDesc}}`;
        })
        .join('\n');

      const prompt = `
        Extract the following information from this ${documentType}:
        ${fieldPrompts}
        
        ${arrayFieldDescriptions ? `\nArray Fields Structure:\n${arrayFieldDescriptions}\n` : ''}
        
        Please return the extracted data in this exact JSON format:
        ${JSON.stringify(exampleOutput, null, 2)}
        
        IMPORTANT INSTRUCTIONS:
        - For array fields, extract multiple items if present in the document
        - Each array item should be a complete object with all specified fields
        - If no data is found for an array field, return an empty array []
        - If no data is found for a regular field, return null
        - Ensure all dates are in DD/MM/YYYY format
        - Return ONLY valid JSON, no additional text or markdown formatting
      `.trim();

      console.log('Extraction prompt:', prompt);

      // Use structured output for better results
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash",
        generationConfig: {
          ...generationConfig,
          responseMimeType: "application/json"
        },
      });

      const result = await model.generateContent([prompt, filePart]);
      const response = await result.response;
      const text = response.text();
      
      console.log('Raw extraction response:', text);
      
      if (!text) {
        throw new Error('No text generated from the model');
      }

      onProgress?.('Parsing extracted data...');
      const extractedData = parseExtractionResponse(text);
      console.log('Parsed extraction data:', extractedData);
      
      // Clean and validate the extracted data
      const cleanedData = cleanExtractedData(extractedData, fields);
      
      // Enhanced array field processing
      const processedData = { ...cleanedData };
      
      extractionFields.forEach(field => {
        if ((field.type === 'array' || field.isArray) && field.arrayConfig?.fields) {
          const fieldName = field.name;
          let arrayData = extractedData[fieldName] || [];
          
          // Ensure it's an array
          if (!Array.isArray(arrayData)) {
            if (typeof arrayData === 'object' && arrayData !== null) {
              // If it's a single object, wrap it in an array
              arrayData = [arrayData];
            } else {
              arrayData = [];
            }
          }
          
          // Process each array item to ensure proper structure
          arrayData = arrayData.map((item: any) => {
            if (typeof item !== 'object' || item === null) {
              return {};
            }
            
            const processedItem: Record<string, any> = {};
            field.arrayConfig!.fields!.forEach(subField => {
              const subFieldName = subField.name.trim();
              let value = item[subFieldName];
              
              // Transform value based on type
              if (value !== undefined && value !== null && value !== '') {
                switch (subField.type) {
                  case 'date':
                    processedItem[subFieldName] = transformDateToISO(String(value));
                    break;
                  case 'number':
                    const numValue = Number(value);
                    processedItem[subFieldName] = isNaN(numValue) ? null : numValue;
                    break;
                  default:
                    processedItem[subFieldName] = String(value).trim();
                    break;
                }
              } else {
                processedItem[subFieldName] = null;
              }
            });
            
            return processedItem;
          }).filter((item: any) => {
            // Remove completely empty items
            return Object.values(item).some(val => val !== null && val !== undefined && val !== '');
          });
          
          processedData[fieldName] = arrayData;
        }
      });

      let validationErrors: ValidationError[] = [];
      extractionFields.forEach(field => {
        const value = processedData[field.name];
        const validation = validateField(value, field);
        if (!validation.isValid) {
          validationErrors.push({
            field: field.name,
            error: validation.error
          });
        }
      });

      return {
        extractedData: processedData,
        success: true,
        message: validationErrors.length > 0 
          ? 'Data extracted with some validation issues. Please review and correct if needed.'
          : 'Data extracted successfully',
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        failedImage: fileUrl,
        failedFields: fields
      };

    } catch (error) {
      attempts++;
      console.error(`Extraction attempt ${attempts} failed:`, error);
      
      // Check for rate limit error
      if (error.message?.includes('429') || error.message?.includes('quota')) {
        markApiKeyFailure(API_KEYS[currentApiKeyIndex]);
      }
      
      if (attempts < MAX_ATTEMPTS) {
        onProgress?.(`Extraction failed. Trying with backup API key (Attempt ${attempts + 1}/${MAX_ATTEMPTS})...`);
        const nextKey = getNextApiKey();
        currentApiKeyIndex = API_KEYS.indexOf(nextKey);
        genAI = new GoogleGenerativeAI(nextKey);
        
        await delay(1000);
      } else {
        return {
          extractedData: {},
          success: false,
          message: `Extraction failed after ${MAX_ATTEMPTS} attempts. Please enter the data manually.`,
          failedImage: fileUrl,
          failedFields: fields
        };
      }
    }
  }

  return {
    extractedData: {},
    success: false,
    message: 'Extraction failed after all attempts. Please enter the data manually.',
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
      // Update upload record
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

      // Update document record
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
      // onProgress?.(`Attempt ${attempt + 1} of ${maxRetries}...`);
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
        onProgress?.(`Retrying in ${backoffTime/1000} seconds...`);
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
  // Common date formats
  const dateFormats = [
    'YYYY-MM-DD',    // ISO format
    'DD/MM/YYYY',    // UK/European format
    'MM/DD/YYYY',    // US format
    'DD-MM-YYYY',    // Dash separated
    'DD.MM.YYYY',    // Dot separated
    'YYYY/MM/DD',    // ISO with slashes
  ];

  // Try to parse the date using each format
  for (const format of dateFormats) {
    const date = dayjs(value, format, true);
    if (date.isValid()) {
      return true;
    }
  }

  return false;
}

const transformDateToISO = (value: string): string => {
  const dateFormats = [
    'YYYY-MM-DD',
    'DD/MM/YYYY',
    'MM/DD/YYYY',
    'DD-MM-YYYY',
    'DD.MM.YYYY',
    'YYYY/MM/DD',
  ];

  for (const format of dateFormats) {
    const date = dayjs(value, format, true);
    if (date.isValid()) {
      return date.format('YYYY-MM-DD');
    }
  }

  return value;
}

export const validateField = (
  value: any,
  field: Field
): { isValid: boolean; error?: string } => {
  // Allow empty non-required fields
  if (!value && !field.required) {
    return { isValid: true };
  }

  // Required field check
  if (!value && field.required) {
    return {
      isValid: false,
      error: `${field.name} is required`
    };
  }

  try {
    switch (field.type) {
      case 'date':
        if (value && !validateDateField(value)) {
          return {
            isValid: false,
            error: `Invalid date format for ${field.name}`
          };
        }
        break;

      case 'number':
        if (value && isNaN(Number(value))) {
          return {
            isValid: false,
            error: `Invalid number format for ${field.name}`
          };
        }
        break;

      case 'email':
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return {
            isValid: false,
            error: `Invalid email format for ${field.name}`
          };
        }
        break;

      case 'phone':
        if (value && !/^\+?[\d\s-]{10,}$/.test(value)) {
          return {
            isValid: false,
            error: `Invalid phone format for ${field.name}`
          };
        }
        break;
    }

    return { isValid: true };
  } catch (error) {
    console.error(`Validation error for field ${field.name}:`, error);
    return {
      isValid: false,
      error: `Validation error for ${field.name}`
    };
  }
};

export const transformFieldValue = (field: Field, value: any): any => {
  if (!value) return value;

  switch (field.type) {
    case 'date':
      return transformDateToISO(value);
    case 'number':
      return Number(value);
    default:
      return value;
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

export const isValidExtractionResponse = (
  response: any
): response is ExtractionAPIResponse => {
  return (
    response &&
    Array.isArray(response.choices) &&
    response.choices.length > 0 &&
    response.choices[0].message &&
    typeof response.choices[0].message.content === 'string'
  );
};

// Update the formatFieldPrompts function
export const formatFieldPrompts = (fields: Field[]): string => {
  if (!Array.isArray(fields)) {
    console.warn('Invalid fields parameter:', fields);
    return '';
  }

  return fields.map(field => {
    let prompt = `- ${field.name}`;
    
    if (field.type === 'array' && field.arrayConfig?.fields) {
      prompt += ' (array of objects with the following structure):';
      field.arrayConfig.fields.forEach(subField => {
        prompt += `\n  * ${subField.name} (${subField.type})`;
      });
    } else if (field.isArray && field.arrayConfig?.fields) {
      prompt += ' (array of objects with the following structure):';
      field.arrayConfig.fields.forEach(subField => {
        prompt += `\n  * ${subField.name} (${subField.type})`;
      });
    } else if (field.type === 'date') {
      prompt += ' (in DD/MM/YYYY format)';
    } else {
      prompt += ` (${field.type})`;
    }
    
    return prompt;
  }).join('\n');
};

// Update the createExampleOutput function
export const createExampleOutput = (fields: Field[]): Record<string, any> => {
  return fields.reduce((acc, field) => {
    if ((field.type === 'array' || field.isArray) && field.arrayConfig?.fields) {
      // Create example array with proper nested structure
      const exampleItem = field.arrayConfig.fields.reduce<Record<string, string>>((subAcc, subField) => {
        switch (subField.type) {
          case 'date':
            subAcc[subField.name] = 'DD/MM/YYYY';
            break;
          case 'number':
            subAcc[subField.name] = '123';
            break;
          case 'text':
          default:
            subAcc[subField.name || ''] = `sample_${(subField.name || '').toLowerCase()}`;
            break;
        }
        return subAcc;
      }, {});
      acc[field.name] = [exampleItem];
    } else {
      switch (field.type) {
        case 'date':
          acc[field.name] = 'DD/MM/YYYY';
          break;
        case 'number':
          acc[field.name] = '123';
          break;
        case 'array':
          acc[field.name] = [];
          break;
        default:
          acc[field.name] = `sample_${field.type}`;
          break;
      }
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