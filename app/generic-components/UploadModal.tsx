// @ts-nocheck
"use client"

import { useState, useMemo, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Trash2, RotateCw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { performExtraction } from '@/lib/extractionUtils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { ExtractionPreview } from '@/components/ExtractionPreview'
import { FileUpload } from '@/components/ui/file-upload'
import { toast } from 'sonner'
import supabase from '@/lib/supabase/client'

interface DocumentField {
  id: string
  name: string
  type: string
  isArray?: boolean
  isUnique?: boolean;
  arrayConfig?: {
    fields: {
      id: string
      name: string
      type: string
      parentField: string
    }[]
    maxItems: number
  }
}

interface DropdownOption {
  id: string;
  value: string;
  label?: string;
  displayName?: string;
}

interface DropdownConfig {
  id: string;
  label: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  documentFields?: DocumentField[];
  entityName?: string;
  entityId?: string;
  company?: any;
  companyName?: string;
  selectedDoc?: any;
  selectedMember?: any;
  mainTab?: string;
  onSuccess?: (newDocument: any) => void;
  dropdowns?: DropdownConfig[];
  selectedDocumentId?: string;
  companyAssetId?: string;
  // New props for multi-document type support
  documentTypes?: Array<{ id: string; name: string; display_name?: string; fields?: any[] }>;
  allowMultipleTypes?: boolean;
  // Table and field configuration
  targetTable?: string;
  idFieldName?: string;
  documentIdFieldName?: string;
  isCompanyUpload?: boolean;
  additionalFields?: Record<string, any>;
  // Callback for custom upload handling
  onBeforeUpload?: (recordData: any) => Promise<any>;
}

const ValidationDialog = ({ isOpen, onClose, onConfirm, title, description, type = 'warning', isSubmitting = false }) => {
  const getIcon = () => {
    switch (type) {
      case 'error': return <XCircle className="h-6 w-6 text-red-500" />
      case 'success': return <CheckCircle className="h-6 w-6 text-green-500" />
      default: return <AlertTriangle className="h-6 w-6 text-yellow-500" />
    }
  }

  const getColors = () => {
    switch (type) {
      case 'error': return 'border-red-200 bg-red-50'
      case 'success': return 'border-green-200 bg-green-50'
      default: return 'border-yellow-200 bg-yellow-50'
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={isSubmitting ? () => {} : onClose}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            {getIcon()}
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>
        <div className={`p-4 rounded-lg ${getColors()}`}>
          <p className="text-sm whitespace-pre-line">{description}</p>
        </div>
        <DialogFooter>
          {!isSubmitting && type !== 'error' && (
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button
            disabled={isSubmitting}
            onClick={async () => {
              if (onConfirm) await onConfirm();
              // Close only if there wasn't an error in onConfirm
              if (type !== 'error') onClose();
            }}
            variant={type === 'error' ? 'default' : type === 'warning' ? 'destructive' : 'default'}
          >
            {isSubmitting ? (
              <><RotateCw className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
            ) : (
              type === 'error' ? 'OK' : type === 'warning' ? 'Proceed Anyway' : 'Continue'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const generateDocumentId = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Helper function to normalize names for comparison
const normalizeName = (name) => {
  if (!name || typeof name !== 'string') return '';
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Stricter file name match for companies (FALLBACK ONLY)
const checkCompanyNameMatchInFilename = (companyName, fileName) => {
  console.log('--- [Filename Check - Fallback] Starting ---');
  if (!companyName || !fileName) return { match: true };

  const normalizedCompanyName = normalizeName(companyName);
  const normalizedFileName = normalizeName(fileName);
  console.log(`[Filename Check] Normalized - Company: "${normalizedCompanyName}", File: "${normalizedFileName}"`);

  const companyNameParts = normalizedCompanyName.split(' ').filter(part => part.length > 2);
  if (companyNameParts.length === 0) return { match: true };
  console.log('[Filename Check] Significant Company Parts:', companyNameParts);

  // STRICT: Every significant part of the company name must be in the filename
  const allPartsFound = companyNameParts.every(part => normalizedFileName.includes(part));
  console.log(`[Filename Check] All parts found in filename? ${allPartsFound}`);

  let reason = '';
  if (!allPartsFound) {
    reason = `Filename "${fileName}" does not appear to match the company name "${companyName}".`;
  }

  console.log('--- [Filename Check - Fallback] Finished ---');
  return { match: allPartsFound, reason };
};


const checkNameMatch = (personName, fileName, extractedData) => {
  if (personName === 'New Individual') return { match: true };
  
  // Skip filename validation for CV uploads and generic entity names
  if (personName === 'CV Upload' || personName === 'Job Applicant' || !personName || personName.length < 3) {
    return { match: true, isWarning: false };
  }

  const normalizedPersonName = normalizeName(personName);
  const normalizedFileName = normalizeName(fileName);
  const extractedFullName = extractedData?.Full_Names || extractedData?.full_name || '';
  const normalizedExtractedName = normalizeName(extractedFullName);

  if (!normalizedPersonName) return { match: false, reason: 'Person name is missing', isWarning: true };

  const personNameParts = normalizedPersonName.split(' ').filter(part => part.length > 2);
  if (personNameParts.length === 0) return { match: true, isWarning: false };

  const fileNameMatchCount = personNameParts.filter(part => normalizedFileName.includes(part)).length;
  const fileNameMatch = (fileNameMatchCount / personNameParts.length) >= 0.5;

  let extractedNameMatch = false;
  if (normalizedExtractedName) {
    const extractedNameParts = normalizedExtractedName.split(' ').filter(part => part.length > 2);
    const extractedNameMatchCount = personNameParts.filter(personPart =>
      extractedNameParts.some(extractedPart => personPart.includes(extractedPart) || extractedPart.includes(personPart))
    ).length;
    extractedNameMatch = (extractedNameMatchCount / personNameParts.length) >= 0.5;
  }

  const hasMatch = extractedNameMatch || fileNameMatch;
  let reason = '';
  if (!hasMatch) {
    reason = `Filename "${fileName}" does not sufficiently match "${personName}". You can proceed anyway if this is correct.`;
  }

  return { match: hasMatch, reason, isWarning: !hasMatch };
};

// Universal duplicate check for INDIVIDUALS based on 'isUnique' flag
const checkForIndividualDuplicates = async (personId, docId, extractedData, documentFields) => {
  if (!documentFields || documentFields.length === 0) return [];

  const uniqueFields = documentFields.filter(field => field.isUnique);
  if (uniqueFields.length === 0) return [];

  const duplicateChecks = [];

  for (const field of uniqueFields) {
    const fieldName = field.name;
    const uniqueValue = extractedData[fieldName];

    if (uniqueValue && typeof uniqueValue === 'string' && uniqueValue.trim()) {
      try {
        const { data: existingDocs, error } = await supabase
          .from('acc_portal_directors_documents')
          .select('id, file_path, extracted_details')
          .eq('director_id', parseInt(personId, 10))
          .eq('document_id', docId)
          .ilike(`extracted_details->>${fieldName}`, `%${uniqueValue.trim()}%`);

        if (error) {
          console.error(`Error checking individual duplicates for ${fieldName}:`, error);
          continue;
        }

        if (existingDocs && existingDocs.length > 0) {
          duplicateChecks.push({
            field: fieldName,
            value: uniqueValue.trim(),
            fieldDisplayName: fieldName,
          });
        }
      } catch (error) {
        console.error(`Error in individual duplicate check for ${fieldName}:`, error);
      }
    }
  }

  return duplicateChecks;
};

// Duplicate check for companies based on 'isUnique' flag
const checkForCompanyDuplicates = async (companyId, docId, extractedData, documentFields) => {
  if (!documentFields || documentFields.length === 0) return [];

  const uniqueFields = documentFields.filter(field => field.isUnique);
  if (uniqueFields.length === 0) return [];

  const duplicateChecks = [];

  for (const field of uniqueFields) {
    const fieldName = field.name;
    const uniqueValue = extractedData[fieldName];

    if (uniqueValue && typeof uniqueValue === 'string' && uniqueValue.trim()) {
      try {
        const { data: existingDocs, error } = await supabase
          .from('acc_portal_kyc_uploads')
          .select('id, file_path, extracted_details')
          .eq('company_id', companyId)
          .eq('kyc_document_id', docId)
          .ilike(`extracted_details->>${fieldName}`, `%${uniqueValue.trim()}%`);

        if (error) {
          console.error(`Error checking company duplicates for ${fieldName}:`, error);
          continue;
        }

        if (existingDocs && existingDocs.length > 0) {
          duplicateChecks.push({
            field: fieldName,
            value: uniqueValue.trim(),
            fieldDisplayName: fieldName,
          });
        }
      } catch (error) {
        console.error(`Error in company duplicate check for ${fieldName}:`, error);
      }
    }
  }

  return duplicateChecks;
};
const validateMatchFields = (extractedData, documentFields, documentName = '') => {
  if (!documentFields || !extractedData) return { isValid: true };

  const matchFields = documentFields.filter(field => field.isMatch);
  if (matchFields.length === 0) return { isValid: true };

  const missingMatchFields = [];
  const mismatchedFields = [];

  // Normalize the document name by removing spaces and special characters
  const normalizeString = (str) => {
    if (!str) return '';
    return str.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const expectedIdentifier = normalizeString(documentName);

  for (const field of matchFields) {
    const fieldValue = extractedData[field.name];

    if (!fieldValue) {
      missingMatchFields.push(field.name);
      continue;
    }

    // If we have an expected identifier from the document name, check for a match
    if (expectedIdentifier) {
      try {
        const normalizedExtracted = normalizeString(fieldValue);
        const normalizedExpected = expectedIdentifier;

        // Check if either string is contained within the other
        if (!normalizedExtracted.includes(normalizedExpected) &&
          !normalizedExpected.includes(normalizedExtracted)) {
          mismatchedFields.push({
            field: field.name,
            expected: documentName, // Show original expected for better readability
            actual: fieldValue
          });
        }
      } catch (error) {
        console.error(`Error validating match field ${field.name}:`, error);
      }
    }
  }

  if (missingMatchFields.length > 0) {
    return {
      isValid: false,
      message: `The following match fields are missing: ${missingMatchFields.join(', ')}. ` +
        'Please ensure these fields are properly extracted from the document.'
    };
  }

  if (mismatchedFields.length > 0) {
    const mismatchMessages = mismatchedFields.map(m =>
      `Expected "${m.field}" to match "${m.expected}" but found "${m.actual}"`
    ).join('; ');

    return {
      isValid: false,
      message: `Document mismatch: ${mismatchMessages}. ` +
        'Please verify the document matches the expected asset.'
    };
  }

  return { isValid: true };
};

const validateDocument = async (doc, validationContext) => {
  const {
    isCompanyUpload,
    companyId,
    companyName,
    individualName,
    personId,
    docId,
    finalSelectedDoc,
    documentName,
  } = validationContext;

  const validationIssues = [];
  const hasExtractedData = doc.extractedData && Object.keys(doc.extractedData).length > 0;

  // --- CHANGE START ---
  if (finalSelectedDoc?.fields?.length > 0 && !hasExtractedData) {
    // Changed from 'error' to 'warning' to allow manual entry
    validationIssues.push({
      type: 'warning', 
      message: 'Automatic extraction failed. Please enter the details manually below.'
    });
  } 
  // --- CHANGE END ---
  else if (hasExtractedData && finalSelectedDoc?.fields) {
    // ... existing match validation logic ...
    const matchValidation = validateMatchFields(
      doc.extractedData,
      finalSelectedDoc.fields,
      documentName 
    );
    if (!matchValidation.isValid) {
      validationIssues.push({
        type: 'error',
        message: matchValidation.message
      });
    }
  }

  if (isCompanyUpload) {
    // --- COMPANY VALIDATIONS ---

    // **NEW PRIMARY CHECK**: Use extracted data first.
    const extractedTaxpayerName = doc.extractedData?.['Taxpayer Name'];
    if (extractedTaxpayerName) {
      const normalizedExtractedName = normalizeName(extractedTaxpayerName);
      const normalizedCompanyName = normalizeName(companyName);
      if (normalizedExtractedName !== normalizedCompanyName) {
        validationIssues.push({
          type: 'warning',
          message: `Warning: The name in the document ("${extractedTaxpayerName}") does not match the selected company ("${companyName}").`
        });
      }
    } else {
      // **FALLBACK CHECK**: If no taxpayer name, use the stricter filename check.
      const nameCheck = checkCompanyNameMatchInFilename(companyName, doc.fileName);
      if (!nameCheck.match) {
        validationIssues.push({ type: 'warning', message: `Warning: ${nameCheck.reason}` });
      }
    }

    if (companyId && docId && hasExtractedData && finalSelectedDoc?.fields) {
      try {
        const duplicates = await checkForCompanyDuplicates(companyId, docId, doc.extractedData, finalSelectedDoc.fields);
        if (duplicates.length > 0) {
          const duplicateMessages = duplicates.map(dup => `${dup.fieldDisplayName}: ${dup.value}`).join(', ');
          validationIssues.push({
            type: 'error',
            message: `Critical: A duplicate document already exists for this company with the same ${duplicateMessages}.`
          });
        }
      } catch (error) {
        validationIssues.push({ type: 'warning', message: 'Warning: Could not verify if this document already exists.' });
      }
    }
  } else {
    // --- INDIVIDUAL VALIDATIONS ---
    const nameCheck = checkNameMatch(individualName, doc.fileName, doc.extractedData);
    if (!nameCheck.match) {
      validationIssues.push({ 
        type: 'warning', 
        message: `Warning: ${nameCheck.reason} You can proceed anyway if this is correct.` 
      });
    }

    if (personId && docId && hasExtractedData && finalSelectedDoc?.fields) {
      try {
        const duplicates = await checkForIndividualDuplicates(personId, docId, doc.extractedData, finalSelectedDoc.fields);
        if (duplicates.length > 0) {
          const duplicateMessages = duplicates.map(dup => `${dup.fieldDisplayName}: ${dup.value}`).join(', ');
          validationIssues.push({
            type: 'error',
            message: `Critical: A duplicate document already exists for this person with the same ${duplicateMessages}.`
          });
        }
      } catch (error) {
        validationIssues.push({ type: 'warning', message: 'Warning: Could not verify if this document already exists.' });
      }
    }
  }

  if (validationIssues.length === 0) {
    return { status: 'valid', message: 'Document passed all checks.' };
  }

  const hasError = validationIssues.some(issue => issue.type === 'error');
  const finalStatus = hasError ? 'error' : 'warning';
  const consolidatedReport = validationIssues.map(issue => issue.message).join(' \n');

  return { status: finalStatus, message: consolidatedReport };
};


export function UploadModal({
  isOpen,
  onClose,
  documentName,
  documentFields,
  entityName,
  entityId,
  company,
  selectedDoc,
  selectedMember,
  mainTab = '',
  onSuccess,
  dropdowns = [],
  selectedDocumentId,
  companyName,
  companyAssetId,
  documentTypes,
  allowMultipleTypes = false,
  targetTable = 'acc_portal_kyc_uploads',
  idFieldName = 'company_id',
  documentIdFieldName = 'kyc_document_id',
  isCompanyUpload = true,
  additionalFields = {},
  onBeforeUpload
}: UploadModalProps) {
  const [uploadedDocs, setUploadedDocs] = useState<Array<{
    id: string;
    file: File;
    fileUrl: string;
    extractedData: Record<string, any>;
    status: string;
    fileName?: string;
    validationStatus?: 'pending' | 'valid' | 'warning' | 'error';
    validationMessage?: string;
    selectedDocTypeId?: string; // For multi-type support
  }>>([]);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [currentDocumentName, setCurrentDocumentName] = useState(documentName);
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});

  // Sync currentDocumentName with documentName prop
  useEffect(() => {
    setCurrentDocumentName(documentName);
  }, [documentName]);
  const [finalSelectedDoc, setFinalSelectedDoc] = useState(selectedDoc);
  const [validationDialog, setValidationDialog] = useState({
    isOpen: false,
    title: '',
    description: '',
    type: 'warning',
    onConfirm: null
  });

  // Multi-type support: Available document types for selection
  const availableDocTypes = useMemo(() => {
    if (allowMultipleTypes && documentTypes && documentTypes.length > 0) {
      return documentTypes;
    }
    return selectedDoc ? [selectedDoc] : [];
  }, [allowMultipleTypes, documentTypes, selectedDoc]);

  useEffect(() => {
    if (isOpen) {
      // Transform selectedDoc to use UUID instead of legacy ID
      const transformedDoc = selectedDoc ? {
        ...selectedDoc,
        id: selectedDoc.document_ids?.[0] || selectedDoc.kyc_document_id || selectedDoc.id
      } : null;
      setFinalSelectedDoc(transformedDoc);
      setUploadedDocs([]);
    }
  }, [isOpen, selectedDoc]);

  const individualName = useMemo(() => {
    const isCompanyUpload = !!company?.id;
    // For director uploads (individual type), always use the individual's name
    // Only use company name if it's actually a company upload (not individual director upload)
    if (isCompanyUpload && selectedMember?.type === 'company') {
      return companyName || company?.company_name || entityName || 'Unknown Company';
    }
    return selectedMember?.full_name || selectedMember?.name || entityName || 'New Individual';
  }, [entityName, selectedMember, company, companyName]);

  const personId = useMemo(() => {
    return selectedMember?.id || entityId;
  }, [selectedMember, entityId]);

  const docId = useMemo(() => {
    return finalSelectedDoc?.document_ids?.[0] || finalSelectedDoc?.kyc_document_id || selectedDoc?.document_ids?.[0] || selectedDoc?.kyc_document_id;
  }, [finalSelectedDoc, selectedDoc]);

  const handleFileUpload = async (files: File[]) => {
    const requiredDropdowns = dropdowns?.filter(d => d.required) || [];
    const missingRequiredDropdowns = requiredDropdowns.filter(d => !d.value);

    if (missingRequiredDropdowns.length > 0) {
      const missingLabels = missingRequiredDropdowns.map(d => d.label).join(', ');
      toast.error(`Please select: ${missingLabels}`);
      return;
    }

    const fileArray = Array.isArray(files) ? files : [files];
    if (!fileArray.length) return;

    // For multi-type support, initially don't assign a doc type
    const newDocs = fileArray.map(file => ({
      id: generateDocumentId(),
      file,
      fileUrl: URL.createObjectURL(file),
      extractedData: {},
      status: 'pending',
      fileName: file.name,
      validationStatus: 'pending' as const,
      validationMessage: 'Processing...',
      selectedDocTypeId: allowMultipleTypes ? '' : (finalSelectedDoc?.document_ids?.[0] || finalSelectedDoc?.kyc_document_id || selectedDoc?.document_ids?.[0] || selectedDoc?.kyc_document_id)
    }));
    setUploadedDocs(prev => [...prev, ...newDocs]);

    const isCompanyUpload = !!company?.id;
    const validationContext = {
      isCompanyUpload,
      companyId: company?.id,
      companyName: companyName || company?.company_name,
      individualName,
      personId,
      docId,
      documentName: documentName,
      finalSelectedDoc,
    };

    // If not allowing multiple types, process extraction immediately
   if (!allowMultipleTypes) {
      try {
        const processedDocsPromises = newDocs.map(async (doc) => {
          const extractionToastId = toast.loading(`Extracting from ${doc.fileName}...`);
          
          // Helper to create empty fields structure
          const createEmptyData = () => {
             const emptyData = {};
             if (finalSelectedDoc?.fields) {
               finalSelectedDoc.fields.forEach(field => {
                 emptyData[field.name] = "";
               });
             }
             return emptyData;
          };

          try {
            // Skip extraction if there are no fields to extract (saves credits)
            const fieldsToExtract = finalSelectedDoc?.fields || [];
            let extractedData = {};
            let success = true;
            
            if (fieldsToExtract.length > 0) {
              const result = await performExtraction(
                doc.fileUrl,
                fieldsToExtract,
                finalSelectedDoc?.name || documentName,
                (progressMessage) => toast.loading(`${doc.fileName}: ${progressMessage}`, { id: extractionToastId }),
              );
              extractedData = result.extractedData;
              success = result.success;
            } else {
              // No fields to extract, assume it's just an image/document
              toast.success(`${doc.fileName} processed (no extraction needed)`, { id: extractionToastId });
            }

            // --- CHANGE START ---
            // If extraction returns nothing, don't throw error. Fallback to manual entry.
            if (!extractedData || (typeof extractedData === 'object' && Object.keys(extractedData).length === 0)) {
               extractedData = createEmptyData();
            }
            // --- CHANGE END ---

            let parsedData;
            // ... existing parsing logic ...
             if (typeof extractedData === 'string') {
              try {
                parsedData = JSON.parse(extractedData);
              } catch (e) {
                // Fallback if JSON parse fails
                parsedData = createEmptyData();
              }
            } else {
              parsedData = extractedData;
            }

            const docWithData = {
              ...doc,
              extractedData: parsedData,
              status: 'valid'
            };

            toast.success(`Processed ${doc.fileName}`, { id: extractionToastId }); // Changed message slightly

            let validation = { status: 'valid' as const, message: 'Document passed validation' };
            if (finalSelectedDoc?.fields?.length > 0) {
              validation = await validateDocument(docWithData, validationContext);
            }

            return {
              ...docWithData,
              validationStatus: validation.status,
              validationMessage: validation.message,
            };

          } catch (error) {
            console.error(`Error processing ${doc.fileName}:`, error);
            
            // --- CHANGE START ---
            // On CRITICAL error (like the Gemini 400 error), catch it and allow manual entry
            toast.error(`Extraction failed for ${doc.fileName}. Please enter details manually.`, { id: extractionToastId });
            
            const emptyData = createEmptyData();
            
            return {
              ...doc,
              extractedData: emptyData,
              validationStatus: 'warning' as const, // Warning allows saving
              validationMessage: 'Extraction failed. Please fill in the details manually.',
            };
            // --- CHANGE END ---
          }
        });

        const fullyProcessedDocs = await Promise.all(processedDocsPromises);
        setUploadedDocs(prev => prev.map(oldDoc =>
          fullyProcessedDocs.find(pd => pd.id === oldDoc.id) || oldDoc
        ));

      } catch (error) {
        console.error('Error in file upload:', error);
        toast.error(`An error occurred while processing files: ${error.message}`);
      }
    }
  };

  const handleDocTypeChange = async (docId: string, newDocTypeId: string) => {
    const doc = uploadedDocs.find(d => d.id === docId);
    if (!doc) return;

    const selectedDocType = availableDocTypes.find(dt => dt.id === newDocTypeId);
    if (!selectedDocType) return;

    // Update the doc with the new type
    setUploadedDocs(prev => prev.map(d =>
      d.id === docId ? { ...d, selectedDocTypeId: newDocTypeId, validationStatus: 'pending', validationMessage: 'Re-extracting...' } : d
    ));

    // Perform extraction with the new document type
    const extractionToastId = toast.loading(`Extracting ${doc.fileName} as ${selectedDocType.display_name || selectedDocType.name}...`);

    try {
      // Skip extraction if there are no fields to extract (saves credits)
      const fieldsToExtract = selectedDocType.fields || [];
      let extractedData = {};
      let success = true;
      
      if (fieldsToExtract.length > 0) {
        const result = await performExtraction(
          doc.fileUrl,
          fieldsToExtract,
          selectedDocType.display_name || selectedDocType.name,
          (progressMessage) => toast.loading(`${doc.fileName}: ${progressMessage}`, { id: extractionToastId }),
        );
        extractedData = result.extractedData;
        success = result.success;
      } else {
        // No fields to extract, assume it's just an image/document
        toast.success(`${doc.fileName} processed (no extraction needed)`, { id: extractionToastId });
      }

      if (!extractedData || (typeof extractedData === 'object' && Object.keys(extractedData).length === 0)) {
        // Only throw error if we actually tried to extract and got nothing
        if (fieldsToExtract.length > 0) {
          throw new Error('No data was extracted from the document');
        } else {
          // No fields to extract, so empty data is expected
          extractedData = {};
        }
      }

      let parsedData;
      if (typeof extractedData === 'string') {
        try {
          parsedData = JSON.parse(extractedData);
        } catch (e) {
          console.error('Failed to parse extracted data:', e);
          throw new Error('Failed to parse extracted data');
        }
      } else {
        parsedData = extractedData;
      }

      const docWithData = {
        ...doc,
        extractedData: parsedData,
        status: 'valid',
        selectedDocTypeId: newDocTypeId
      };

      toast.success(`Extracted from ${doc.fileName}`, { id: extractionToastId });

      const isCompanyUpload = !!company?.id;
      const validationContext = {
        isCompanyUpload,
        companyId: company?.id,
        companyName: companyName || company?.company_name,
        individualName,
        personId,
        docId: newDocTypeId,
        documentName: selectedDocType.display_name || selectedDocType.name,
        finalSelectedDoc: selectedDocType,
      };

      let validation = { status: 'valid' as const, message: 'Document passed validation' };
      if (selectedDocType.fields?.length > 0) {
        validation = await validateDocument(docWithData, validationContext);
      }

      setUploadedDocs(prev => prev.map(d =>
        d.id === docId ? {
          ...docWithData,
          validationStatus: validation.status,
          validationMessage: validation.message,
        } : d
      ));
 } catch (error) {
      console.error(`Error processing ${doc.fileName}:`, error);
      toast.error(`Extraction failed. Please enter details manually.`, { id: extractionToastId });
      const emptyData = {};
      if (selectedDocType.fields) {
        selectedDocType.fields.forEach(field => {
          emptyData[field.name] = "";
        });
      }

      setUploadedDocs(prev => prev.map(d =>
        d.id === docId ? { 
          ...d, 
          extractedData: emptyData, // Set empty data
          selectedDocTypeId: newDocTypeId,
          validationStatus: 'warning', // Allow saving
          validationMessage: 'Extraction failed. Please fill in the details manually.' 
        } : d
      ));
    }
  };

  const handleReExtract = async (docIdToReExtract: string) => {
    const docToUpdate = uploadedDocs.find(d => d.id === docIdToReExtract);
    if (!docToUpdate) return;

    // Determine which doc type to use for re-extraction
    const docTypeToUse = allowMultipleTypes && docToUpdate.selectedDocTypeId
      ? availableDocTypes.find(dt => dt.id === docToUpdate.selectedDocTypeId)
      : finalSelectedDoc;

    if (!docTypeToUse) {
      toast.error('Please select a document type first');
      return;
    }

    setUploadedDocs(prevDocs =>
      prevDocs.map(d =>
        d.id === docIdToReExtract ? { ...d, validationStatus: 'pending', validationMessage: 'Re-extracting...' } : d
      )
    );

    const extractionToastId = toast.loading(`Re-extracting from ${docToUpdate.fileName}...`);
    const isCompanyUpload = !!company?.id;
    const validationContext = {
      isCompanyUpload,
      companyId: company?.id,
      companyName: companyName || company?.company_name,
      individualName,
      personId,
      docId: docTypeToUse.id,
      finalSelectedDoc: docTypeToUse,
      documentName: docTypeToUse.display_name || docTypeToUse.name,
    };

    try {
      // Skip extraction if there are no fields to extract (saves credits)
      const fieldsToExtract = docTypeToUse.fields || [];
      let extractedData = {};
      let success = true;
      
      if (fieldsToExtract.length > 0) {
        const result = await performExtraction(
          docToUpdate.fileUrl,
          fieldsToExtract,
          docTypeToUse.display_name || docTypeToUse.name || documentName,
          (progressMessage) => toast.loading(`${docToUpdate.fileName}: ${progressMessage}`, { id: extractionToastId }),
        );
        extractedData = result.extractedData;
        success = result.success;
      } else {
        // No fields to extract, assume it's just an image/document
        toast.success(`${docToUpdate.fileName} processed (no extraction needed)`, { id: extractionToastId });
      }
      
      const newExtractedData = typeof extractedData === 'string' ? JSON.parse(extractedData) : extractedData || {};
      const updatedDocForValidation = { ...docToUpdate, extractedData: newExtractedData, status: success ? 'valid' : 'pending' };

      if (fieldsToExtract.length > 0) {
        toast.success(`Re-extracted from ${docToUpdate.fileName}`, { id: extractionToastId });
      }

      const validation = await validateDocument(updatedDocForValidation, validationContext);

      setUploadedDocs(prevDocs =>
        prevDocs.map(d =>
          d.id === docIdToReExtract ? {
            ...updatedDocForValidation,
            validationStatus: validation.status,
            validationMessage: validation.message,
          } : d
        )
      );
   } catch (error) {
      toast.error(`Re-extraction failed for ${docToUpdate.fileName}. Please enter details manually.`, { id: extractionToastId });
     const emptyData = {};
      if (docTypeToUse.fields) {
        docTypeToUse.fields.forEach(field => {
          emptyData[field.name] = "";
        });
      }

      setUploadedDocs(prevDocs =>
        prevDocs.map(d =>
          d.id === docIdToReExtract ? { 
            ...d, 
            extractedData: emptyData, // Keep file, reset data to empty
            validationStatus: 'warning', 
            validationMessage: 'Re-extraction failed. Please fill in the details manually.' 
          } : d
        )
      );
    }
  };

  const handleSaveUploads = async () => {
    if (uploadedDocs.length === 0) {
      toast.error('Please select at least one file to upload');
      return;
    }

      // Check if multi-type mode and all docs have types selected
      if (allowMultipleTypes) {
      console.log('[UploadModal] Multi-type mode enabled, checking document types...');
        const docsWithoutType = uploadedDocs.filter(doc => !doc.selectedDocTypeId);
      console.log('[UploadModal] Documents without type:', docsWithoutType);
        if (docsWithoutType.length > 0) {
        console.log('[UploadModal] ERROR: Some documents missing type selection');
        toast.error('Please select a document type for all uploaded files.');
          return;
        }
      }

      // Only validate documents that have fields defined
      const docsToValidate = uploadedDocs.filter(doc => {
        const docType = allowMultipleTypes && doc.selectedDocTypeId
          ? availableDocTypes.find(dt => dt.id === doc.selectedDocTypeId)
          : finalSelectedDoc;
        return docType?.fields?.length > 0;
      });

    const docsWithErrors = docsToValidate.filter(doc => doc.validationStatus === 'error');
    console.log('[UploadModal] Documents with validation errors:', docsWithErrors);
    if (docsWithErrors.length > 0) {
      console.log('[UploadModal] ERROR: Validation errors blocking save');
      setValidationDialog({
        isOpen: true,
        title: 'Upload Blocked',
        description: `Cannot upload due to critical errors. Please resolve the issues highlighted in red.`,
        type: 'error',
        onConfirm: null
      });
        return;
      }

    const docsWithWarnings = docsToValidate.filter(doc => doc.validationStatus === 'warning');
    console.log('[UploadModal] Documents with warnings:', docsWithWarnings);
    if (docsWithWarnings.length > 0) {
      const warningMessage = docsWithWarnings.map(d => `${d.fileName}:\n${d.validationMessage}`).join('\n\n');
      console.log('[UploadModal] Warning message to show:', warningMessage);
      setValidationDialog({
        isOpen: true,
        title: 'Validation Warnings',
        description: `Potential issues were detected:\n\n${warningMessage}\n\nProceed with upload?`,
        type: 'warning',
        onConfirm: () => proceedWithUpload()
      });
        return;
      }

      await proceedWithUpload();
  };
  
const proceedWithUpload = async () => {
    console.log('[UploadModal] === PROCEED WITH UPLOAD START ===');
    setIsUploading(true);
    const toastId = toast.loading('Processing documents...');

    try {
      // 1. IMPROVED LOGIC: Determine if this is a company based on member type or prop
      const effectiveIsCompany = isCompanyUpload || selectedMember?.type === 'company' || targetTable === 'acc_portal_kyc_uploads';
      
      let entityIdToUse = effectiveIsCompany 
        ? (company?.id || entityId || selectedMember?.id) 
        : (selectedMember?.id || entityId);
        
      const entityNameToUse = effectiveIsCompany
        ? (companyName || company?.company_name || selectedMember?.full_name || entityName || 'Unknown Company')
        : (selectedMember?.name || selectedMember?.full_name || entityName || 'New Individual');
        
      if (!entityIdToUse) {
        const alternativeId = selectedMember?.director_id || selectedMember?.user_id || selectedMember?.person_id || entityId;
        if (alternativeId) {
          entityIdToUse = alternativeId;
        }
      }

      const shouldSkipSave = additionalFields?.disableSave === true;
      const isQuickAdd = !effectiveIsCompany && additionalFields?.isFormContext;
      
      if (!shouldSkipSave && !isQuickAdd && !entityIdToUse) {
        toast.error('Missing ID. Please ensure an entity is selected.', { id: toastId });
        setIsUploading(false);
        return;
      }
      
      const invalidDocs = uploadedDocs.filter(doc => {
        const docType = allowMultipleTypes && doc.selectedDocTypeId
          ? availableDocTypes.find(dt => dt.id === doc.selectedDocTypeId)
          : finalSelectedDoc;
        return (docType?.fields?.length > 0 && doc.validationStatus === 'error');
      });
      
      if (invalidDocs.length > 0) {
        toast.error('Validation errors must be fixed first.', { id: toastId });
        setIsUploading(false);
        return;
      }

      const dropdownValues = {};
      dropdowns?.forEach(dropdown => {
        if (dropdown.value) {
          dropdownValues[dropdown.id] = dropdown.value;
          const selectedOption = dropdown.options?.find(opt => opt.value === dropdown.value);
          if (selectedOption) {
            dropdownValues[`${dropdown.id}_label`] = selectedOption.label || selectedOption.displayName || dropdown.value;
          }
        }
      });

      const uploadPromises = uploadedDocs.map(async (doc) => {
        try {
          const docTypeForUpload = allowMultipleTypes && doc.selectedDocTypeId
            ? availableDocTypes.find(dt => dt.id === doc.selectedDocTypeId)
            : finalSelectedDoc;

          if (!docTypeForUpload?.id) throw new Error('Document type missing');
          
          if (shouldSkipSave) {
            return {
              file: doc.file,
              extractedData: { ...doc.extractedData, originalFileName: doc.file.name },
              documentType: docTypeForUpload
            };
          }

          const entityPathName = entityNameToUse.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_-]+/g, '-');
          
          const DOCUMENT_TYPE_IDS = {
            'Sale Agreement': 'f84cdd4b-8d62-49da-ab47-da58afb097bf',
            'Supplier Invoice': '40c57bf8-1c47-4867-8b43-0c026ad173e6',
            'Initial Loan Schedule': '728e1385-7b30-4c20-9d45-9ded211ac2e5',
            'Loan Agreement': 'b17d7f6f-7c11-43c4-91d6-9312a8e6951c',
            'ETR Receipt': 'b6b4a74f-eff9-4512-b1c9-485f4179dbc1'
          };

          const documentTypeId = DOCUMENT_TYPE_IDS[docTypeForUpload.display_name] || docTypeForUpload.id;

          // 2. CORRECTED PATH LOGIC: Use folder determined by entity type
          const folder = effectiveIsCompany ? 'company-documents' : 'individual-documents';
          const filePath = `${folder}/${entityPathName}/${documentTypeId}/${doc.file.name}`;
            
          console.log(`[UploadModal] Uploading to: ${filePath}`);

          const { error: uploadError } = await supabase.storage
            .from('kyc-documents')
            .upload(filePath, doc.file, { cacheControl: '3600', upsert: true });

          if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

          const extractedDataWithAssetId = { ...doc.extractedData };
          let assetIdToUse = companyAssetId || '';

          const recordData: any = {
            [documentIdFieldName]: documentTypeId,
            file_path: filePath,
            extracted_details: extractedDataWithAssetId,
            status: 'active',
            created_at: new Date().toISOString(),
            ...(assetIdToUse && { company_asset_id: assetIdToUse }),
            [idFieldName]: entityIdToUse,
            ...additionalFields
          };

          if (onBeforeUpload) {
            const customResult = await onBeforeUpload(recordData);
            if (customResult) return customResult;
          }

          const { data: insertedData, error: insertError } = await supabase
            .from(targetTable)
            .insert([recordData])
            .select();

          if (insertError) throw new Error(`DB Save failed: ${insertError.message}`);

          return { ...insertedData[0], ...(effectiveIsCompany && { company_id: entityIdToUse }) };

        } catch (error) {
          console.error('Error uploading doc:', doc.fileName, error);
          throw error;
        }
      });

      const results = await Promise.all(uploadPromises);
      console.log('[UploadModal] Upload completed, results:', results.length);

      // 3. TRIGGER PARENT SUCCESS HANDLING FOR STATE UPDATES
      if (shouldSkipSave) {
        console.log('[UploadModal] Quick add mode, passing data to parent');
        // For quick add mode, pass data to parent for processing
        onSuccess?.({ files: results.map(r => ({ file: r.file, extractedData: r.extractedData })) });
      } else {
        console.log('[UploadModal] Normal upload mode, calling onSuccess for state updates');
        // For normal uploads, trigger parent's refresh and state updates
        if (onSuccess) {
          const resultToPass = results.length === 1 ? results[0] : results;
          console.log('[UploadModal] Calling onSuccess with:', resultToPass);
          await onSuccess(resultToPass); // This will handle state fetching and updates
          console.log('[UploadModal] onSuccess completed');
        } else {
          console.log('[UploadModal] No onSuccess callback provided');
        }
      }

      // Only show success toast if parent didn't handle it
      toast.success('Successfully uploaded and processed!', { id: toastId });
      setUploadedDocs([]);
      setIsUploading(false);
      onClose();
      
    } catch (error) {
      console.error('[UploadModal] Error:', error);
      toast.error(error.message || 'Upload failed', { id: toastId });
      setIsUploading(false);
    }
  };

  const getValidationIcon = (status) => {
    switch (status) {
      case 'valid': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />
      default: return <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
    }
  };

  const getValidationColor = (status) => {
    switch (status) {
      case 'valid': return 'border-green-200 bg-green-50'
      case 'warning': return 'border-yellow-200 bg-yellow-50'
      case 'error': return 'border-red-200 bg-red-50'
      default: return 'border-gray-200 bg-gray-50'
    }
  };
  // Create a stable dependency value for dropdowns
  const dropdownsDeps = useMemo(() => {
    return dropdowns?.map(d => `${d.id}:${d.value}`).join() || '';
  }, [dropdowns]);

  useEffect(() => {
    if (!dropdowns) return;
    
    const initialValues = dropdowns.reduce((acc, dropdown) => {
      if (dropdown.value !== undefined) {
        acc[dropdown.id] = dropdown.value;
      }
      return acc;
    }, {} as Record<string, string>);
    
    // Only update if values have actually changed
    setSelectedValues(prev => {
      const hasChanges = Object.entries(initialValues).some(
        ([key, value]) => prev[key] !== value
      );
      return hasChanges ? { ...prev, ...initialValues } : prev;
    });
  }, [dropdownsDeps]);

  // Handle dialog close with state cleanup
  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className='max-w-[90vw] w-full max-h-[90vh]'
          onInteractOutside={(e) => {
            e.preventDefault();
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              Upload <span className='uppercase'>{currentDocumentName}</span> for {individualName}
            </DialogTitle>
          </DialogHeader>

          {dropdowns && dropdowns.length > 0 && (
            <div className="space-y-4">
              {dropdowns.map((dropdown) => (
                <div key={dropdown.id} className={dropdown.className || ''}>
                  <label htmlFor={dropdown.id} className="block text-sm font-medium text-gray-700 mb-1">
                    {dropdown.label}
                    {dropdown.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <select
                    id={dropdown.id}
                    className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={selectedValues[dropdown.id] || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      console.log(`Selected ${dropdown.id}:`, value);

                      // Update local state
                      setSelectedValues(prev => ({ ...prev, [dropdown.id]: value }));

                      // Update document name if this is a document type dropdown
                      if (dropdown.id === 'document-type') {
                        const selectedOption = dropdown.options?.find(opt => opt.value === value);
                        if (selectedOption) {
                          setCurrentDocumentName(selectedOption.label || documentName);
                        }
                      }

                      // Call the original onChange handler
                      dropdown.onChange(value);
                    }}
                    disabled={dropdown.disabled}
                  >
                    {dropdown.placeholder && (
                      <option value="" disabled>
                        {dropdown.placeholder}
                      </option>
                    )}
                    {dropdown.options && [...dropdown.options]
                      .sort((a, b) => {
                        // Sort by label if available, otherwise by value
                        const labelA = a.label || a.displayName || a.value || '';
                        const labelB = b.label || b.displayName || b.value || '';
                        return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
                      })
                      .map((option) => (
                        <option key={option.id} value={option.value}>
                          {option.label || option.displayName || option.value}
                        </option>
                      ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4">
            <div className="p-4">
              <FileUpload onFilesSelected={handleFileUpload} />
            </div>

            {uploadedDocs.length > 0 && (
              <>
                <div className="h-[60vh] overflow-y-auto space-y-6 mb-6">
                  {uploadedDocs.map((doc) => {
                    // Get the selected doc type for this document
                    const docTypeForPreview = allowMultipleTypes && doc.selectedDocTypeId
                      ? availableDocTypes.find(dt => dt.id === doc.selectedDocTypeId)
                      : finalSelectedDoc;

                    return (
                      <div key={doc.id} className={`relative rounded-lg p-4 border ${getValidationColor(doc.validationStatus)}`}>
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-2 flex-grow">
                            {getValidationIcon(doc.validationStatus)}
                            <span className="text-xs font-medium">
                              {doc.validationStatus ?
                                doc.validationStatus.charAt(0).toUpperCase() + doc.validationStatus.slice(1) :
                                'Pending'}
                            </span>

                            {/* Document Type Selector for Multi-Type Mode */}
                            {allowMultipleTypes && availableDocTypes.length > 1 && (
                              <div className="ml-4 flex-grow max-w-xs">
                                <Label className="text-xs text-gray-600 mb-1 block">Document Type</Label>
                                <Select
                                  value={doc.selectedDocTypeId || ''}
                                  onValueChange={(value) => handleDocTypeChange(doc.id, value)}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Select document type..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableDocTypes.map((docType) => (
                                      <SelectItem key={docType.id} value={docType.id}>
                                        {docType.display_name || docType.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Re-extract"
                              className="text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                              onClick={() => handleReExtract(doc.id)}
                              disabled={allowMultipleTypes && !doc.selectedDocTypeId}
                            >
                              <RotateCw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Remove"
                              className="text-red-600 hover:text-red-800 hover:bg-red-100"
                              onClick={() => setUploadedDocs(uploadedDocs.filter(d => d.id !== doc.id))}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {doc.validationMessage && doc.validationStatus !== 'valid' && (
                          <div className="mb-4 p-3 rounded-md bg-white border">
                            <p className="text-sm text-gray-700 whitespace-pre-line">{doc.validationMessage}</p>
                          </div>
                        )}

                        {/* Only show preview if a doc type has been selected (in multi-type mode) or extraction is complete */}
                        {(!allowMultipleTypes || doc.selectedDocTypeId) && docTypeForPreview && (
                          <ExtractionPreview
                            extractedData={doc.extractedData || {}}
                            fields={docTypeForPreview.fields || documentFields || []}
                            fileUrl={doc.fileUrl}
                            fileName={doc.fileName}
                            expanded={true}
                            showSaveButton={false}
                            onDataChange={(fieldName, value) => {
                              setUploadedDocs(prevDocs =>
                                prevDocs.map(d =>
                                  d.id === doc.id
                                    ? {
                                      ...d,
                                      extractedData: {
                                        ...d.extractedData,
                                        [fieldName]: value
                                      }
                                    }
                                    : d
                                )
                              );
                            }}
                          />
                        )}

                        {allowMultipleTypes && !doc.selectedDocTypeId && (
                          <div className="text-center py-8 text-gray-500 text-sm">
                            Please select a document type above to extract data
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <DialogFooter className="mt-4">
                  <Button
                    onClick={handleSaveUploads}
                    disabled={isUploading}
                    className="w-full sm:w-auto"
                  >
                    {isUploading ? 'Saving...' : `Save ${uploadedDocs.length} Document${uploadedDocs.length !== 1 ? 's' : ''}`}
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
     <ValidationDialog
  {...validationDialog}
  isSubmitting={isUploading} // Pass loading state here
  onClose={() => setValidationDialog({ ...validationDialog, isOpen: false })}
/>
    </>
  );
}