// @ts-nocheck
"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Trash2, RotateCw, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { performExtraction } from '@/lib/extractionUtils'
import { FileUpload } from '@/components/ui/file-upload'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { ExtractionPreview } from '@/components/ExtractionPreview'
import { toast } from 'sonner'
import { cn } from "@/lib/utils"
import supabase from '@/lib/supabase/client'
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

interface DocumentField {
  id: string
  name: string
  type: string
  isArray?: boolean
  isUnique?: boolean
  isMatch?: boolean
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
  onPendingChange?: (docs: any[]) => void;
  className?: string;
  showTitle?: boolean;
  hideSaveButton?: boolean;
}

// Validation Dialog Component (Kept as a modal for critical alerts)
const ValidationDialog = ({ isOpen, onClose, onConfirm, title, description, type = 'warning' }) => {
  const getIcon = () => {
    switch (type) {
      case 'error':
        return <XCircle className="h-6 w-6 text-red-500" />
      case 'success':
        return <CheckCircle className="h-6 w-6 text-green-500" />
      default:
        return <AlertTriangle className="h-6 w-6 text-yellow-500" />
    }
  }

  const getColors = () => {
    switch (type) {
      case 'error':
        return 'border-red-200 bg-red-50'
      case 'success':
        return 'border-green-200 bg-green-50'
      default:
        return 'border-yellow-200 bg-yellow-50'
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open ? onClose() : null}>
      <DialogContent className={cn("max-w-4xl max-h-[90vh] overflow-y-auto")}>
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
          {type !== 'error' && (
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button
            onClick={() => {
              if (onConfirm) onConfirm()
              onClose()
            }}
            variant={type === 'error' ? 'default' : type === 'warning' ? 'destructive' : 'default'}
          >
            {type === 'error' ? 'OK' : type === 'warning' ? 'Proceed Anyway' : 'Continue'}
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
  if (!companyName || !fileName) return { match: true };

  const normalizedCompanyName = normalizeName(companyName);
  const normalizedFileName = normalizeName(fileName);

  const companyNameParts = normalizedCompanyName.split(' ').filter(part => part.length > 2);
  if (companyNameParts.length === 0) return { match: true };

  const allPartsFound = companyNameParts.every(part => normalizedFileName.includes(part));

  let reason = '';
  if (!allPartsFound) {
    reason = `Filename "${fileName}" does not appear to match the company name "${companyName}".`;
  }

  return { match: allPartsFound, reason };
};

const checkNameMatch = (personName, fileName, extractedData) => {
  if (personName === 'New Individual') return { match: true };

  const normalizedPersonName = normalizeName(personName);
  const normalizedFileName = normalizeName(fileName);
  const extractedFullName = extractedData?.Full_Names || extractedData?.full_name || '';
  const normalizedExtractedName = normalizeName(extractedFullName);

  if (!normalizedPersonName) return { match: false, reason: 'Person name is missing' };

  const personNameParts = normalizedPersonName.split(' ').filter(part => part.length > 2);
  if (personNameParts.length === 0) return { match: true };

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
    reason = `Filename "${fileName}" does not sufficiently match "${personName}".`;
  }

  return { match: hasMatch, reason };
};

// Universal duplicate check for INDIVIDUALS based on 'isUnique' flag
const checkForIndividualDuplicates = async (personId, docId, extractedData, documentFields, targetTable = 'acc_portal_directors_documents') => {
  if (!documentFields || documentFields.length === 0) return [];

  const uniqueFields = documentFields.filter(field => field.isUnique);
  if (uniqueFields.length === 0) return [];

  const duplicateChecks = [];

  for (const field of uniqueFields) {
    const fieldName = field.name;
    const uniqueValue = extractedData[fieldName];

    if (uniqueValue && typeof uniqueValue === 'string' && uniqueValue.trim()) {
      try {
        const idField = targetTable === 'acc_portal_directors_documents' ? 'director_id' : 'person_id';
        const docIdField = targetTable === 'acc_portal_directors_documents' ? 'document_id' : 'kyc_document_id';

        const { data: existingDocs, error } = await supabase
          .from(targetTable)
          .select('id, file_path, extracted_details')
          .eq(idField, parseInt(personId, 10))
          .eq(docIdField, docId)
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
const checkForCompanyDuplicates = async (companyId, docId, extractedData, documentFields, targetTable = 'acc_portal_kyc_uploads') => {
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
          .from(targetTable)
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

    if (expectedIdentifier) {
      try {
        const normalizedExtracted = normalizeString(fieldValue);
        const normalizedExpected = expectedIdentifier;

        if (!normalizedExtracted.includes(normalizedExpected) &&
          !normalizedExpected.includes(normalizedExtracted)) {
          mismatchedFields.push({
            field: field.name,
            expected: documentName,
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
    targetTable,
  } = validationContext;

  const validationIssues = [];
  const hasExtractedData = doc.extractedData && Object.keys(doc.extractedData).length > 0;

  if (finalSelectedDoc?.fields?.length > 0 && !hasExtractedData) {
    validationIssues.push({
      type: 'error',
      message: 'Critical: No data could be extracted. Please upload a clearer document.'
    });
  } else if (hasExtractedData && finalSelectedDoc?.fields) {
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
      const nameCheck = checkCompanyNameMatchInFilename(companyName, doc.fileName);
      if (!nameCheck.match) {
        validationIssues.push({ type: 'warning', message: `Warning: ${nameCheck.reason}` });
      }
    }

    if (companyId && docId && hasExtractedData && finalSelectedDoc?.fields) {
      try {
        const duplicates = await checkForCompanyDuplicates(companyId, docId, doc.extractedData, finalSelectedDoc.fields, targetTable);
        if (duplicates.length > 0) {
          const duplicateMessages = duplicates.map(dup => `${dup.fieldDisplayName}: ${dup.value}`).join(', ');
          validationIssues.push({
            type: 'error',
            message: `Critical: A duplicate document already exists for this company with the same ${duplicateMessages}.`
          });
        }
      } catch (error) {
        console.error(`Error checking company duplicates for ${docId}:`, error);
        validationIssues.push({ type: 'warning', message: 'Warning: Could not verify if this document already exists.' });
      }
    }
  } else {
    const nameCheck = checkNameMatch(individualName, doc.fileName, doc.extractedData);
    if (!nameCheck.match) {
      validationIssues.push({ type: 'warning', message: `Warning: ${nameCheck.reason}` });
    }

    if (personId && docId && hasExtractedData && finalSelectedDoc?.fields) {
      try {
        const duplicates = await checkForIndividualDuplicates(personId, docId, doc.extractedData, finalSelectedDoc.fields, targetTable);
        if (duplicates.length > 0) {
          const duplicateMessages = duplicates.map(dup => `${dup.fieldDisplayName}: ${dup.value}`).join(', ');
          validationIssues.push({
            type: 'error',
            message: `Critical: A duplicate document already exists for this person with the same ${duplicateMessages}.`
          });
        }
      } catch (error) {
        console.error(`Error checking individual duplicates for ${docId}:`, error);
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

// Main Export
export function UploadModal({
  documentName,
  documentFields,
  entityName,
  company,
  entityId,
  selectedDoc,
  selectedMember,
  onSuccess,
  dropdowns = [],
  companyAssetId,
  documentTypes,
  allowMultipleTypes = false,
  targetTable = 'acc_portal_kyc_uploads',
  idFieldName = 'company_id',
  documentIdFieldName = 'kyc_document_id',
  isCompanyUpload: isCompanyUploadProp,
  additionalFields = {},
  onBeforeUpload,
  onPendingChange,
  companyName,
  className,
  showTitle = true,
  hideSaveButton = false,
}: UploadModalProps) {
  // Store uploaded documents by document type ID
  // State to track form data for each document
  const [formData, setFormData] = useState<Record<string, Record<string, any>>>(() => {
    console.log('[UploadModal] Initializing formData state');
    return {};
  });

  const [uploadedDocs, setUploadedDocs] = useState<Record<string, Array<{
    id: string;
    file: File;
    fileUrl: string;
    extractedData: Record<string, any>;
    status: string;
    fileName?: string;
    validationStatus?: 'pending' | 'valid' | 'warning' | 'error';
    validationMessage?: string;
    selectedDocTypeId?: string;
    isEditing?: boolean;
  }>>>(() => {
    // Initialize with empty arrays for each document type if available
    if (documentTypes?.length) {
      const initial: Record<string, any[]> = {};
      documentTypes.forEach(docType => {
        initial[docType.id] = [];
      });
      return initial;
    }
    return { 'default': [] };
  });
  const [savedDocTypes, setSavedDocTypes] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [currentDocumentName, setCurrentDocumentName] = useState(documentName);
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});
  const [finalSelectedDoc, setFinalSelectedDoc] = useState(selectedDoc);
  const [validationDialog, setValidationDialog] = useState({
    isOpen: false,
    title: '',
    description: '',
    type: 'warning' as const,
    onConfirm: null as (() => void) | null,
    onClose: null as (() => void) | null
  });

  // Blob URL cleanup using useRef to maintain stability across renders
  const blobUrlsRef = useRef<Set<string>>(new Set());

  // Helper to add urls
  const addBlobUrl = useCallback((url: string) => {
    if (blobUrlsRef.current) {
      blobUrlsRef.current.add(url);
    }
  }, []);

  // FIXED: Cleanup ONLY on unmount. 
  // Dependency array is EMPTY []. This prevents revokeObjectURL from running
  // when state updates (like extraction finishing), which was causing ERR_FILE_NOT_FOUND.
  useEffect(() => {
    return () => {
      // Clean up all blob URLs when component unmounts
      if (blobUrlsRef.current) {
        blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
        blobUrlsRef.current.clear();
      }
    };
  }, []);

  // Multi-type support: Available document types for selection
  const availableDocTypes = useMemo(() => {
    if (allowMultipleTypes && documentTypes && documentTypes.length > 0) {
      return documentTypes;
    }
    return selectedDoc ? [selectedDoc] : [];
  }, [allowMultipleTypes, documentTypes, selectedDoc]);

  // SAFE: Only update if selectedDoc ID actually changes or content differs significantly
  useEffect(() => {
    if (selectedDoc && selectedDoc?.id !== finalSelectedDoc?.id) {
      setFinalSelectedDoc(selectedDoc);
    }
  }, [selectedDoc, finalSelectedDoc]);

  const isCompanyUpload = useMemo(() => {
    if (isCompanyUploadProp !== undefined) return isCompanyUploadProp;
    return !!company?.id;
  }, [isCompanyUploadProp, company]);

  const individualName = useMemo(() => {
    if (isCompanyUpload) {
      return companyName || company?.company_name || entityName || 'Unknown Company';
    }
    return selectedMember?.full_name || selectedMember?.name || entityName || 'New Individual';
  }, [entityName, selectedMember, company, companyName, isCompanyUpload]);

  const personId = useMemo(() => {
    return selectedMember?.id || entityId;
  }, [selectedMember, entityId]);

  const docId = useMemo(() => {
    return finalSelectedDoc?.id;
  }, [finalSelectedDoc]);

  // Get the current document type ID or use 'default' if none selected
  const getCurrentDocTypeId = useCallback(() => {
    return finalSelectedDoc?.id || 'default';
  }, [finalSelectedDoc]);

  // Get documents for the current document type
  const getCurrentTabDocuments = useCallback(() => {
    const docTypeId = getCurrentDocTypeId();
    // Ensure the document type exists in the state
    if (!uploadedDocs[docTypeId]) {
      setUploadedDocs(prev => ({
        ...prev,
        [docTypeId]: []
      }));
      return [];
    }
    return uploadedDocs[docTypeId];
  }, [uploadedDocs, getCurrentDocTypeId]);

  useEffect(() => {
    if (onPendingChange) {
      const currentDocs = getCurrentTabDocuments();
      onPendingChange(currentDocs);
    }
  }, [uploadedDocs, onPendingChange, getCurrentTabDocuments]);

  // Update form data when document fields change
  useEffect(() => {
    console.log('[UploadModal] documentFields changed:', {
      hasDocumentFields: !!documentFields?.length,
      documentFields: documentFields
    });

    if (documentFields?.length) {
      setFormData(prev => {
        const newFormData = { ...prev };
        const docTypeId = getCurrentDocTypeId();
        const currentDocs = uploadedDocs[docTypeId] || [];

        currentDocs.forEach(doc => {
          if (!newFormData[doc.id]) {
            newFormData[doc.id] = { ...doc.extractedData };
          }
        });

        return newFormData;
      });
    }
  }, [documentFields, uploadedDocs, getCurrentDocTypeId]);

  // Handle field changes in the form
  const handleFieldChange = useCallback((docId: string, fieldId: string, value: any) => {
    console.log('[UploadModal] Field changed:', { docId, fieldId, value, currentFormData: formData[docId] });
    setFormData(prev => {
      const newData = {
        ...prev,
        [docId]: {
          ...(prev[docId] || {}),
          [fieldId]: value
        }
      };
      console.log('[UploadModal] New formData:', newData);
      return newData;
    });
  }, []);

  // Toggle edit mode for a document
  const toggleEditMode = useCallback((docId: string, isEditing: boolean) => {
    console.log(`[UploadModal] Toggling edit mode for doc ${docId} to ${isEditing}`);
    setUploadedDocs(prev => {
      const docTypeId = getCurrentDocTypeId();
      const updatedDocs = { ...prev };

      if (updatedDocs[docTypeId]) {
        updatedDocs[docTypeId] = updatedDocs[docTypeId].map(doc =>
          doc.id === docId ? { ...doc, isEditing } : doc
        );
      }

      return updatedDocs;
    });
  }, [getCurrentDocTypeId]);

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

    const docTypeId = getCurrentDocTypeId();
    const currentDocs = uploadedDocs[docTypeId] || [];

    const newDocs = fileArray.map(file => {
      const docId = generateDocumentId();
      const fileUrl = URL.createObjectURL(file);
      addBlobUrl(fileUrl); // Track URL for cleanup on unmount

      return {
        id: docId,
        file,
        fileUrl,
        extractedData: {},
        status: 'pending',
        fileName: file.name,
        validationStatus: 'pending' as const,
        validationMessage: 'Processing...',
        selectedDocTypeId: docTypeId,
        isEditing: false
      };
    });

    // Initialize form data for new documents
    setFormData(prev => ({
      ...prev,
      ...newDocs.reduce((acc, doc) => ({
        ...acc,
        [doc.id]: {}
      }), {})
    }));

    setUploadedDocs(prev => ({
      ...prev,
      [docTypeId]: [...currentDocs, ...newDocs]
    }));

    const validationContext = {
      isCompanyUpload,
      companyId: company?.id,
      companyName: companyName || company?.company_name,
      individualName,
      personId,
      docId,
      documentName: currentDocumentName,
      finalSelectedDoc,
      targetTable,
    };

    // If not allowing multiple types, process extraction immediately
    if (!allowMultipleTypes) {
      try {
        const processedDocsPromises = newDocs.map(async (doc) => {
          const extractionToastId = toast.loading(`Extracting from ${doc.fileName}...`);
          try {
            const { extractedData, success } = await performExtraction(
              doc.fileUrl,
              finalSelectedDoc?.fields || documentFields || [],
              finalSelectedDoc?.name || currentDocumentName,
              (progressMessage) => toast.loading(`${doc.fileName}: ${progressMessage}`, { id: extractionToastId }),
              doc.fileName,
              finalSelectedDoc?.id
            );

            if (!extractedData || (typeof extractedData === 'object' && Object.keys(extractedData).length === 0)) {
              throw new Error('No data was extracted from the document');
            }

            let parsedData = extractedData;
            if (typeof extractedData === 'string') {
              try {
                const match = extractedData.match(/```json\n([\s\S]*?)\n```/);
                parsedData = match && match[1] ? JSON.parse(match[1]) : JSON.parse(extractedData);
              } catch (e) {
                console.error('Failed to parse extracted data:', e);
                parsedData = {};
              }
            }

            const finalExtractedData = {};
            const fieldsToProcess = finalSelectedDoc?.fields || documentFields || [];

            fieldsToProcess.forEach(field => {
              const fieldName = field.name;
              const fieldId = field.id || fieldName;
              const extractedValue = parsedData[fieldName];

              // Use existing form data if available, otherwise use extracted value
              const existingValue = formData[doc.id]?.[fieldId];

              if (field.isArray) {
                finalExtractedData[fieldId] = Array.isArray(extractedValue) ? extractedValue : [];
              } else {
                finalExtractedData[fieldId] = existingValue ?? extractedValue ?? '';
              }
            });

            // Update form data with extracted values
            setFormData(prev => ({
              ...prev,
              [doc.id]: {
                ...(prev[doc.id] || {}),
                ...finalExtractedData
              }
            }));

            const docWithData = {
              ...doc,
              extractedData: finalExtractedData,
              status: success ? 'valid' : 'pending'
            };

            toast.success(`Extracted from ${doc.fileName}`, { id: extractionToastId });

            const validation = await validateDocument(docWithData, validationContext);

            return {
              ...docWithData,
              validationStatus: validation.status,
              validationMessage: validation.message,
            };

          } catch (error) {
            console.error(`Error processing ${doc.fileName}:`, error);
            toast.error(`Error processing ${doc.fileName}: ${error.message}`, { id: extractionToastId });
            return {
              ...doc,
              validationStatus: 'error' as const,
              validationMessage: error.message || 'Failed to process document',
            };
          }
        });

        const fullyProcessedDocs = await Promise.all(processedDocsPromises);
        setUploadedDocs(prev => {
          const updatedDocs = { ...prev };
          Object.entries(updatedDocs).forEach(([docType, docs]) => {
            updatedDocs[docType] = docs.map(oldDoc =>
              fullyProcessedDocs.find(pd => pd.id === oldDoc.id) || oldDoc
            );
          });
          return updatedDocs;
        });

      } catch (error) {
        console.error('Error in file upload:', error);
        toast.error(`An error occurred while processing files: ${error.message}`);
      }
    }
  };

  // Handle document type change
  const handleDocTypeChange = useCallback((docTypeId: string) => {
    const selectedDoc = availableDocTypes.find(doc => doc.id === docTypeId);
    if (selectedDoc) {
      setFinalSelectedDoc(selectedDoc);
      setCurrentDocumentName(selectedDoc.name);
      // Ensure the document type exists in the state
      setUploadedDocs(prev => ({
        ...prev,
        [docTypeId]: prev[docTypeId] || []
      }));
    }
  }, [availableDocTypes]);

  const handleDocTypeChangeWithDocId = async (docId: string, newDocTypeId: string) => {
    const doc = uploadedDocs.find(d => d.id === docId);
    if (!doc) return;

    const selectedDocType = availableDocTypes.find(dt => dt.id === newDocTypeId);
    if (!selectedDocType) return;

    setUploadedDocs(prev => prev.map(d =>
      d.id === docId ? { ...d, selectedDocTypeId: newDocTypeId, validationStatus: 'pending', validationMessage: 'Extracting...' } : d
    ));

    const extractionToastId = toast.loading(`Extracting ${doc.fileName} as ${selectedDocType.display_name || selectedDocType.name}...`);

    try {
      const { extractedData, success } = await performExtraction(
        doc.fileUrl,
        selectedDocType.fields || [],
        selectedDocType.display_name || selectedDocType.name,
        (progressMessage) => toast.loading(`${doc.fileName}: ${progressMessage}`, { id: extractionToastId }),
        doc.fileName,
        selectedDocType.id
      );

      if (!extractedData || (typeof extractedData === 'object' && Object.keys(extractedData).length === 0)) {
        throw new Error('No data was extracted from the document');
      }

      let parsedData = extractedData;
      if (typeof extractedData === 'string') {
        try {
          const match = extractedData.match(/```json\n([\s\S]*?)\n```/);
          parsedData = match && match[1] ? JSON.parse(match[1]) : JSON.parse(extractedData);
        } catch (e) {
          console.error('Failed to parse extracted data:', e);
          parsedData = {};
        }
      }

      const docWithData = {
        ...doc,
        extractedData: parsedData,
        status: 'valid',
        selectedDocTypeId: newDocTypeId
      };

      toast.success(`Extracted from ${doc.fileName}`, { id: extractionToastId });

      const validationContext = {
        isCompanyUpload,
        companyId: company?.id,
        companyName: companyName || company?.company_name,
        individualName,
        personId,
        docId: newDocTypeId,
        documentName: selectedDocType.display_name || selectedDocType.name,
        finalSelectedDoc: selectedDocType,
        targetTable,
      };

      const validation = await validateDocument(docWithData, validationContext);

      setUploadedDocs(prev => prev.map(d =>
        d.id === docId ? {
          ...docWithData,
          validationStatus: validation.status,
          validationMessage: validation.message,
        } : d
      ));

    } catch (error) {
      console.error(`Error processing ${doc.fileName}:`, error);
      toast.error(`Error processing ${doc.fileName}: ${error.message}`, { id: extractionToastId });
      setUploadedDocs(prev => prev.map(d =>
        d.id === docId ? { ...d, validationStatus: 'error', validationMessage: error.message || 'Failed to process document' } : d
      ));
    }
  };

  const handleReExtract = async (docIdToReExtract: string) => {
    // Get all document arrays from the uploadedDocs object and flatten them
    const allDocs = Object.values(uploadedDocs).flat();
    const docToUpdate = allDocs.find(d => d.id === docIdToReExtract);
    if (!docToUpdate) {
      console.error(`Document with ID ${docIdToReExtract} not found`);
      return;
    }

    const docTypeToUse = allowMultipleTypes && docToUpdate.selectedDocTypeId
      ? availableDocTypes.find(dt => dt.id === docToUpdate.selectedDocTypeId)
      : finalSelectedDoc;

    if (!docTypeToUse) {
      toast.error('Please select a document type first');
      return;
    }

    setUploadedDocs(prevDocs => {
      // Create a new object for state update
      const newState = { ...prevDocs };
      
      // Find which key holds this document
      Object.keys(newState).forEach(key => {
        newState[key] = newState[key].map(doc => 
          doc.id === docIdToReExtract 
            ? { ...doc, validationStatus: 'pending', validationMessage: 'Re-extracting...' } 
            : doc
        );
      });
      
      return newState;
    });

    const extractionToastId = toast.loading(`Re-extracting from ${docToUpdate.fileName}...`);
    const validationContext = {
      isCompanyUpload,
      companyId: company?.id,
      companyName: companyName || company?.company_name,
      individualName,
      personId,
      docId: docTypeToUse.id,
      finalSelectedDoc: docTypeToUse,
      documentName: docTypeToUse.display_name || docTypeToUse.name,
      targetTable,
    };

    try {
      const { extractedData, success } = await performExtraction(
        docToUpdate.fileUrl,
        docTypeToUse.fields || [],
        docTypeToUse.display_name || docTypeToUse.name || currentDocumentName,
        (progressMessage) => toast.loading(`${docToUpdate.fileName}: ${progressMessage}`, { id: extractionToastId }),
        docToUpdate.fileName,
        docTypeToUse.id
      );

      let parsedData = extractedData;
      if (typeof extractedData === 'string') {
        try {
          const match = extractedData.match(/```json\n([\s\S]*?)\n```/);
          parsedData = match && match[1] ? JSON.parse(match[1]) : JSON.parse(extractedData);
        } catch (e) {
          parsedData = {};
        }
      }

      const finalExtractedData = {};
      (docTypeToUse.fields || []).forEach(field => {
        const value = parsedData[field.name];
        if (field.isArray) {
          finalExtractedData[field.name] = Array.isArray(value) ? value : [];
        } else {
          finalExtractedData[field.name] = value ?? '';
        }
      });

      const updatedDocForValidation = {
        ...docToUpdate,
        extractedData: finalExtractedData,
        status: success ? 'valid' : 'pending'
      };

      toast.success(`Re-extracted from ${docToUpdate.fileName}`, { id: extractionToastId });

      const validation = await validateDocument(updatedDocForValidation, validationContext);

      setUploadedDocs(prevDocs => {
        const newState = { ...prevDocs };
        Object.keys(newState).forEach(key => {
          newState[key] = newState[key].map(doc => 
            doc.id === docIdToReExtract 
              ? {
                ...updatedDocForValidation,
                validationStatus: validation.status,
                validationMessage: validation.message,
              }
              : doc
          );
        });
        return newState;
      });
      
    } catch (error) {
      toast.error(`Re-extraction failed for ${docToUpdate.fileName}`, { id: extractionToastId });
      setUploadedDocs(prevDocs => {
        const newState = { ...prevDocs };
        Object.keys(newState).forEach(key => {
          newState[key] = newState[key].map(doc => 
            doc.id === docIdToReExtract 
              ? { ...doc, validationStatus: 'error', validationMessage: 'Re-extraction failed.' } 
              : doc
          );
        });
        return newState;
      });
    }
  };

  const handleSaveUploads = async () => {
    const currentDocTypeId = getCurrentDocTypeId();
    const currentDocs = getCurrentTabDocuments();

    if (currentDocs.length === 0) {
      toast.error('Please upload at least one document.');
      return;
    }

    if (allowMultipleTypes) {
      const docsWithoutType = currentDocs.filter(doc => !doc.selectedDocTypeId);
      if (docsWithoutType.length > 0) {
        toast.error('Please select a document type for all uploaded files.');
        return;
      }
    }

    const docsWithErrors = currentDocs.filter(doc => doc.validationStatus === 'error');
    if (docsWithErrors.length > 0) {
      setValidationDialog({
        isOpen: true,
        title: 'Upload Blocked',
        description: `Cannot upload due to critical errors. Please resolve the issues highlighted in red.`,
        type: 'error',
        onConfirm: null
      });
      return;
    }

    const docsWithWarnings = currentDocs.filter(doc => doc.validationStatus === 'warning');
    if (docsWithWarnings.length > 0) {
      const warningMessage = docsWithWarnings.map(d => `${d.fileName}:\n${d.validationMessage}`).join('\n\n');
      setValidationDialog({
        isOpen: true,
        title: 'Validation Warnings',
        description: `Potential issues were detected:\n\n${warningMessage}\n\nProceed with upload?`,
        type: 'warning',
        onConfirm: () => proceedWithUpload(currentDocTypeId)
      });
      return;
    }

    await proceedWithUpload(currentDocTypeId);
  };

  const handleFinalSaveAndClose = () => {
    const allDocTypeIds = Object.keys(uploadedDocs);
    const unsavedDocTypes = allDocTypeIds.filter(id => !savedDocTypes.has(id));

    if (unsavedDocTypes.length > 0) {
      setValidationDialog({
        isOpen: true,
        title: 'Unsaved Changes',
        description: `You have unsaved documents in ${unsavedDocTypes.length} tab(s). Do you want to save them before closing?`,
        type: 'warning',
        onConfirm: async () => {
          // Save all unsaved document types
          for (const docTypeId of unsavedDocTypes) {
            const docs = uploadedDocs[docTypeId];
            if (docs && docs.length > 0) {
              await proceedWithUpload(docTypeId);
            }
          }
          onClose();
        },
        onClose: onClose
      });
    } else {
      onClose();
    }
  };

  const proceedWithUpload = async (docTypeId: string) => {
    setIsUploading(true);
    const toastId = toast.loading('Uploading documents...');

    try {
      const currentDocs = docTypeId ? (uploadedDocs[docTypeId] || []) : [];

      const entityIdToUse = isCompanyUpload ? (company?.id || entityId) : (selectedMember?.id || entityId);
      const entityNameToUse = isCompanyUpload
        ? (companyName || company?.company_name || entityName || 'Unknown Company')
        : (selectedMember?.name || entityName || 'Unknown Entity');

      if (!entityIdToUse) {
        const errorMsg = isCompanyUpload
          ? 'Company ID is missing. Please ensure a company is selected.'
          : 'Person/Entity ID is missing. Please ensure an entity is selected.';
        toast.error(errorMsg, { id: toastId });
        setIsUploading(false);
        return;
      }

      if (!currentDocs || currentDocs.length === 0) {
        toast.error('No documents to upload.', { id: toastId });
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

      const uploadPromises = currentDocs.map(async (doc) => {
        try {
          const docTypeForUpload = allowMultipleTypes && doc.selectedDocTypeId
            ? availableDocTypes.find(dt => dt.id === doc.selectedDocTypeId)
            : finalSelectedDoc;

          if (!docTypeForUpload?.id) {
            throw new Error('Document type is missing for upload');
          }

          const entityPathName = entityNameToUse
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^[-_]+|[-_]+$/g, '');

          const docName = (docTypeForUpload.display_name || docTypeForUpload.name || 'unknown_document')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^[-_]+|[-_]+$/g, '');

          const filePath = isCompanyUpload
            ? `company-documents/${entityPathName}/${docTypeForUpload.id}/${doc.file.name}`
            : `individual-documents/${entityPathName}/${docTypeForUpload.id}/${doc.file.name}`;

          const { data: bucketData, error: bucketError } = await supabase.storage.getBucket('kyc-documents');

          if (bucketError) {
            console.error('Error accessing storage bucket:', bucketError);
            throw new Error(`Failed to access file storage. Please try again later.`);
          }

          const { error: uploadError } = await supabase.storage
            .from('kyc-documents')
            .upload(filePath, doc.file, {
              cacheControl: '3600',
              upsert: true,
              contentType: doc.file.type || 'application/octet-stream'
            });

          if (uploadError) {
            console.error('File upload error:', uploadError);
            throw new Error(`Failed to upload file: ${uploadError.message}`);
          }

          const extractedDataWithAssetId = { ...doc.extractedData };

          let assetIdToUse = '';
          if (companyAssetId) {
            assetIdToUse = companyAssetId;
          } else if (extractedDataWithAssetId['Vehicle Registration Number']) {
            try {
              const { data: matchingAssets, error } = await supabase
                .from('acc_portal_company_assets')
                .select('id')
                .eq('company_id', entityIdToUse)
                .eq('asset_identifier', extractedDataWithAssetId['Vehicle Registration Number'].trim())
                .limit(1);

              if (!error && matchingAssets && matchingAssets.length > 0) {
                assetIdToUse = matchingAssets[0].id;
              }
            } catch (error) {
              console.error('Error fetching matching asset:', error);
            }
          }

          const recordData: any = {
            [documentIdFieldName]: docTypeForUpload.id,
            file_path: filePath,
            extracted_details: extractedDataWithAssetId,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...(docTypeForUpload.validity_days && { validity_days: docTypeForUpload.validity_days }),
            ...(docTypeForUpload.reminder_days && { reminder_days: docTypeForUpload.reminder_days }),
            ...(assetIdToUse && { company_asset_id: assetIdToUse }),
            [idFieldName]: entityIdToUse,
            ...additionalFields
          };

          if (Object.keys(dropdownValues).length > 0) {
            const commentLabels = Object.entries(dropdownValues)
              .filter(([key]) => key.endsWith('_label'))
              .map(([_, value]) => value);

            if (commentLabels.length > 0) {
              recordData.comments = commentLabels.join(' | ');
            }

            recordData.metadata = {
              ...recordData.metadata,
              dropdownValues
            };
          }

          Object.keys(recordData).forEach(key => recordData[key] === undefined && delete recordData[key]);

          if (onBeforeUpload) {
            const customResult = await onBeforeUpload(recordData);
            if (customResult) return customResult;
          }

          const { data: insertedData, error: insertError } = await supabase
            .from(targetTable)
            .insert([recordData])
            .select();

          if (insertError) {
            throw new Error(`Failed to save document record: ${insertError.message}`);
          }

          return {
            ...insertedData[0],
            ...(isCompanyUpload && { company_id: entityIdToUse })
          };

        } catch (error) {
          console.error('Error uploading document:', doc.fileName, error);
          throw error;
        }
      });

      const results = await Promise.all(uploadPromises);

      // Mark this document type as saved
      setSavedDocTypes(prev => {
        const newSet = new Set(prev);
        newSet.add(docTypeId);
        return newSet;
      });

      // Clear only the current tab's documents
      setUploadedDocs(prev => {
        const newState = { ...prev };
        delete newState[docTypeId];
        return newState;
      });

      toast.success(`Successfully uploaded ${results.length} document(s)`, { id: toastId });

      if (onSuccess) {
        onSuccess(results.length === 1 ? results[0] : results);
      }

      setIsUploading(false);
    } catch (error) {
      console.error('Error uploading documents:', error);
      let errorMessage = 'An unknown error occurred';

      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('storage') || error.message.includes('bucket')) {
          errorMessage = 'Storage service is not available. Please check your internet connection or contact support.';
        }
      }

      toast.error(errorMessage, { id: toastId });
      setIsUploading(false);
    }
  };

  const handleRemoveFile = useCallback((docId: string) => {
    setUploadedDocs(prev => {
      const newState = { ...prev };
      Object.keys(newState).forEach(key => {
        newState[key] = newState[key].filter(doc => doc.id !== docId);
      });
      return newState;
    });
  }, []);

  const handleDataChange = useCallback((docId: string, fieldName: string, value: any) => {
    setUploadedDocs(prev => {
      // 1. Create a shallow copy of the state object
      const newState = { ...prev };

      // 2. Iterate through the keys (document types) to find and update the specific document
      Object.keys(newState).forEach(key => {
        // Map through the array for this specific key
        newState[key] = newState[key].map(doc => {
          if (doc.id === docId) {
            // 3. Update the specific document's data
            return {
              ...doc,
              extractedData: {
                ...doc.extractedData,
                [fieldName]: value
              },
              // Update timestamp (optional)
              lastModified: new Date().toISOString()
            };
          }
          return doc;
        });
      });

      return newState;
    });
  }, []);

  const documentCallbacks = useMemo(() => {
    const callbacks = {};
    const currentDocs = getCurrentTabDocuments();

    currentDocs.forEach(doc => {
      callbacks[doc.id] = (fieldName: string, value: any) => {
        handleDataChange(doc.id, fieldName, value);
      };
    });

    return callbacks;
  }, [getCurrentTabDocuments, handleDataChange]);

  const getValidationIcon = (status) => {
    switch (status) {
      case 'valid': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />
      default: return <Loader2 className="h-4 w-4 animate-spin" />
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

  // SAFE: Only update selectedValues if content differs (prevents loop on prop ref change)
  useEffect(() => {
    if (dropdowns) {
      const initialValues = dropdowns.reduce((acc, dropdown) => {
        if (dropdown.value !== undefined) {
          acc[dropdown.id] = dropdown.value;
        }
        return acc;
      }, {} as Record<string, string>);

      setSelectedValues(prev => {
        const hasChanges = Object.entries(initialValues).some(([key, val]) => prev[key] !== val);
        return hasChanges ? { ...prev, ...initialValues } : prev;
      });
    }
  }, [dropdowns]);

  const isUploadButtonDisabled = () => {
    const currentDocs = getCurrentTabDocuments();
    return currentDocs.length === 0 || currentDocs.some(doc =>
      doc.status === 'uploading' || doc.status === 'pending'
    );
  };

  const renderDocumentForm = (doc: any) => {
    const fields = finalSelectedDoc?.fields || documentFields || [];
    const currentFormData = formData[doc.id] || {};

    console.log(`[UploadModal] Rendering form for doc ${doc.id}`, {
      docId: doc.id,
      docStatus: doc.status,
      isEditing: doc.isEditing,
      currentFormData,
      docExtractedData: doc.extractedData
    });

    return (
      <div className="space-y-4 mt-4">
        {fields.map((field) => {
          const fieldId = field.id || field.name;
          const fieldValue = currentFormData[fieldId] !== undefined
            ? currentFormData[fieldId]
            : doc.extractedData[field.name] || '';

          return (
            <div key={fieldId} className="space-y-2">
              <Label htmlFor={`${doc.id}-${fieldId}`}>
                {field.name}
                {field.isRequired && <span className="text-red-500 ml-1">*</span>}
              </Label>
              {field.type === 'select' ? (
                <Select
                  value={fieldValue}
                  onValueChange={(value) => handleFieldChange(doc.id, fieldId, value)}
                  disabled={doc.status === 'completed' && !doc.isEditing}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Select ${field.name}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label || option.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.type === 'date' ? (
                <Input
                  type="date"
                  id={`${doc.id}-${fieldId}`}
                  value={fieldValue}
                  onChange={(e) => handleFieldChange(doc.id, fieldId, e.target.value)}
                  required={field.isRequired}
                  disabled={doc.status === 'completed' && !doc.isEditing}
                />
              ) : field.type === 'textarea' ? (
                <Textarea
                  id={`${doc.id}-${fieldId}`}
                  value={fieldValue}
                  onChange={(e) => handleFieldChange(doc.id, fieldId, e.target.value)}
                  required={field.isRequired}
                  placeholder={`Enter ${field.name}`}
                  disabled={doc.status === 'completed' && !doc.isEditing}
                />
              ) : (
                <Input
                  id={`${doc.id}-${fieldId}`}
                  type={field.type || 'text'}
                  value={fieldValue}
                  onChange={(e) => handleFieldChange(doc.id, fieldId, e.target.value)}
                  required={field.isRequired}
                  placeholder={`Enter ${field.name}`}
                  disabled={doc.status === 'completed' && !doc.isEditing}
                />
              )}
              {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
              )}
            </div>
          );
        })}

        {doc.status === 'completed' && (
          <div className="flex justify-end gap-2 mt-4">
            {doc.isEditing ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleEditMode(doc.id, false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => toggleEditMode(doc.id, false)}
                >
                  Save Changes
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleEditMode(doc.id, true)}
              >
                Edit
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn("bg-background", className)}>
      {dropdowns && dropdowns.length > 0 && (
        <div className="space-y-4 mb-6">
          {dropdowns.map((dropdown) => (
            <div key={dropdown.id} className={dropdown.className || ''}>
              <label htmlFor={dropdown.id} className="block text-sm font-medium text-gray-700 mb-1">
                {dropdown.label}
                {dropdown.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              <select
                id={dropdown.id}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={selectedValues[dropdown.id] || dropdown.value || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedValues(prev => ({ ...prev, [dropdown.id]: value }));

                  if (dropdown.id === 'document-type') {
                    const selectedOption = dropdown.options?.find(opt => opt.value === value);
                    if (selectedOption) {
                      setCurrentDocumentName(selectedOption.label || documentName);
                    }
                  }

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
        <div className="p-4 border-dashed border-2 border-gray-300 rounded-lg">
          <FileUpload onFilesSelected={handleFileUpload} />
        </div>

        {getCurrentTabDocuments().length > 0 && (
          <>
            <div className="space-y-6 my-6">
              {getCurrentTabDocuments().map((doc) => {
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
                          onClick={() => handleRemoveFile(doc.id)}
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

                    {(!allowMultipleTypes || doc.selectedDocTypeId) && docTypeForPreview && (
                      <ExtractionPreview
                        documentName={currentDocumentName}
                        extractedData={doc.extractedData || {}}
                        fields={docTypeForPreview.fields || documentFields || []}
                        onDataChange={(fieldName, value) => handleDataChange(doc.id, fieldName, value)}
                        fileUrl={doc.fileUrl}
                        fileName={doc.fileName}
                        expanded={true}
                        showSaveButton={false}
                        type={docTypeForPreview?.document_type || 'document'}
                        file={doc.file}
                        documentId={doc.id}
                        documentIndex={0}
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

            {!hideSaveButton && (
              <div className="mt-6 flex justify-end">
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleSaveUploads}
                    disabled={isUploading || isUploadButtonDisabled()}
                    className="w-full sm:w-auto"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : `Save ${finalSelectedDoc?.name || 'Documents'} (${getCurrentTabDocuments().length})`}
                  </Button>

                  {allowMultipleTypes && documentTypes && documentTypes.length > 1 && (
                    <Button
                      onClick={handleFinalSaveAndClose}
                      variant="outline"
                      className="ml-2"
                    >
                      Save All & Close
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ValidationDialog
        {...validationDialog}
        onClose={() => setValidationDialog({ ...validationDialog, isOpen: false })}
      />
    </div>
  );
};