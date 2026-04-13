// @ts-nocheck
"use client"

import { useState, useMemo, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Trash2, RotateCw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { performExtraction } from '@/lib/extractionUtils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { ExtractionPreview } from '@/components/ExtractionPreview'
import { FileUpload } from '@/components/ui/file-upload'
import { toast } from "@/lib/hooks/use-toast"
import supabase from '@/lib/supabase/client'

// File size constants (in bytes)
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB - Supabase standard limit
const MAX_FILE_SIZE_MB = MAX_FILE_SIZE / (1024 * 1024);

// Helper function to format file sizes
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Helper function to get file size color based on size
const getFileSizeColor = (bytes: number): string => {
  const sizeMB = bytes / (1024 * 1024);
  if (sizeMB >= MAX_FILE_SIZE_MB) return 'text-red-600 font-semibold';
  if (sizeMB >= MAX_FILE_SIZE_MB * 0.8) return 'text-orange-600 font-medium';
  if (sizeMB >= MAX_FILE_SIZE_MB * 0.5) return 'text-yellow-600';
  return 'text-gray-500';
};

const toastControllers = new Map<string, ReturnType<typeof toast>>();

const showLoadingToast = (message: string, id?: string) => {
  const title = 'Processing';
  const description = message;

  if (id && toastControllers.has(id)) {
    toastControllers.get(id)?.update({ id, title, description, variant: 'default', open: true });
    return id;
  }

  const controller = toast({ title, description, variant: 'default' });
  toastControllers.set(controller.id, controller);
  return controller.id;
};

const showSuccessToast = (message: string, id?: string) => {
  const title = 'Success';
  const description = message;

  if (id && toastControllers.has(id)) {
    const controller = toastControllers.get(id)!;
    controller.update({ id, title, description, variant: 'success', open: true });
    return id;
  }

  const controller = toast({ title, description, variant: 'success' });
  toastControllers.set(controller.id, controller);
  return controller.id;
};

const showErrorToast = (message: string, id?: string) => {
  const title = 'Error';
  const description = message;

  if (id && toastControllers.has(id)) {
    const controller = toastControllers.get(id)!;
    controller.update({ id, title, description, variant: 'destructive', open: true });
    return id;
  }

  const controller = toast({ title, description, variant: 'destructive' });
  toastControllers.set(controller.id, controller);
  return controller.id;
};

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
  documentTypes?: Array<{ id: string; name: string; display_name?: string; fields?: any[] }>;
  allowMultipleTypes?: boolean;
  targetTable?: string;
  idFieldName?: string;
  documentIdFieldName?: string;
  isCompanyUpload?: boolean;
  additionalFields?: Record<string, any>;
  onBeforeUpload?: (recordData: any) => Promise<any>;
  renderAsDialog?: boolean;
  showSaveButton?: boolean;
  onPendingChange?: (docs: any[]) => void; // <--- Newly added callback
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
    <Dialog open={isOpen} onOpenChange={isSubmitting ? () => { } : onClose}>
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

const normalizeName = (name) => {
  if (!name || typeof name !== 'string') return '';
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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
  } = validationContext;

  const validationIssues = [];
  const hasExtractedData = doc.extractedData && Object.keys(doc.extractedData).length > 0;

  if (finalSelectedDoc?.fields?.length > 0 && !hasExtractedData) {
    validationIssues.push({
      type: 'warning',
      message: 'Automatic extraction failed. Please enter the details manually below.'
    });
  }
  else if (hasExtractedData && finalSelectedDoc?.fields) {
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
  companyName,
  selectedDoc,
  selectedMember,
  mainTab = '',
  onSuccess,
  dropdowns = [],
  selectedDocumentId,
  companyAssetId,
  documentTypes,
  allowMultipleTypes,
  targetTable,
  idFieldName,
  documentIdFieldName,
  isCompanyUpload,
  additionalFields,
  onBeforeUpload,
  renderAsDialog = true,
  showSaveButton = true,
  onPendingChange // Prop to pass unsubmitted state back to parent
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
    selectedDocTypeId?: string;
  }>>([]);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [currentDocumentName, setCurrentDocumentName] = useState(documentName);
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});

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
  const onPendingChangeRef = useRef(onPendingChange);

  const availableDocTypes = useMemo(() => {
    if (allowMultipleTypes && documentTypes && documentTypes.length > 0) {
      return documentTypes;
    }
    return selectedDoc ? [selectedDoc] : [];
  }, [allowMultipleTypes, documentTypes, selectedDoc]);

  useEffect(() => {
    if (isOpen) {
      const transformedDoc = selectedDoc ? {
        ...selectedDoc,
        id: selectedDoc.document_ids?.[0] || selectedDoc.kyc_document_id || selectedDoc.id
      } : null;
      setFinalSelectedDoc(transformedDoc);
      setUploadedDocs([]);
    }
  }, [isOpen, selectedDoc]);

  useEffect(() => {
    onPendingChangeRef.current = onPendingChange;
  }, [onPendingChange]);

  useEffect(() => {
    onPendingChangeRef.current?.(uploadedDocs);
  }, [uploadedDocs]);

  const individualName = useMemo(() => {
    const isCompanyUpload = !!company?.id;
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

  const showExtractionProgressToast = (fileName, message, toastId) => {
    return showLoadingToast(`${fileName}: ${message}`, toastId);
  };

  const handleFileUpload = async (files: File[]) => {
    const requiredDropdowns = dropdowns?.filter(d => d.required) || [];
    const missingRequiredDropdowns = requiredDropdowns.filter(d => !d.value);

    if (missingRequiredDropdowns.length > 0) {
      const missingLabels = missingRequiredDropdowns.map(d => d.label).join(', ');
      showErrorToast(`Please select: ${missingLabels}`);
      return;
    }

    const fileArray = Array.isArray(files) ? files : [files];
    if (!fileArray.length) return;

    // Validate file sizes before processing
    const oversizedFiles = fileArray.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      const oversizedFileNames = oversizedFiles.map(f => `${f.name} (${(f.size / (1024 * 1024)).toFixed(1)}MB)`).join(', ');
      showErrorToast(`Files exceed maximum size limit (${MAX_FILE_SIZE_MB}MB): ${oversizedFileNames}`);
      return;
    }

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

    if (!allowMultipleTypes) {
      try {
        const processedDocsPromises = newDocs.map(async (doc) => {
          const extractionToastId = showLoadingToast(`Extraction in progress for ${doc.fileName}...`);

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
            const fieldsToExtract = finalSelectedDoc?.fields || [];
            let extractedData = {};
            let success = true;

            if (fieldsToExtract.length > 0) {
              const result = await performExtraction(
                doc.fileUrl,
                fieldsToExtract,
                finalSelectedDoc?.name || documentName,
                (progressMessage) => showExtractionProgressToast(doc.fileName, progressMessage, extractionToastId),
                doc.fileName,
              );
              extractedData = result.extractedData;
              success = result.success;
            } else {
              showSuccessToast(`${doc.fileName} processed (no extraction needed)`, extractionToastId);
            }

            if (!extractedData || (typeof extractedData === 'object' && Object.keys(extractedData).length === 0)) {
              extractedData = createEmptyData();
            }

            let parsedData;
            if (typeof extractedData === 'string') {
              try {
                parsedData = JSON.parse(extractedData);
              } catch (e) {
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

            showSuccessToast(`Processed ${doc.fileName}`, extractionToastId);

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

            showErrorToast(`Extraction failed for ${doc.fileName}. Please enter details manually.`, extractionToastId);

            const emptyData = createEmptyData();

            return {
              ...doc,
              extractedData: emptyData,
              validationStatus: 'warning' as const,
              validationMessage: 'Extraction failed. Please fill in the details manually.',
            };
          }
        });

        const fullyProcessedDocs = await Promise.all(processedDocsPromises);
        setUploadedDocs(prev => prev.map(oldDoc =>
          fullyProcessedDocs.find(pd => pd.id === oldDoc.id) || oldDoc
        ));

      } catch (error) {
        console.error('Error in file upload:', error);
        showErrorToast(`An error occurred while processing files: ${error.message}`);
      }
    }
  };

  const handleDocTypeChange = async (docId: string, newDocTypeId: string) => {
    const doc = uploadedDocs.find(d => d.id === docId);
    if (!doc) return;

    const selectedDocType = availableDocTypes.find(dt => dt.id === newDocTypeId);
    if (!selectedDocType) return;

    setUploadedDocs(prev => prev.map(d =>
      d.id === docId ? { ...d, selectedDocTypeId: newDocTypeId, validationStatus: 'pending', validationMessage: 'Re-extracting...' } : d
    ));

    const extractionToastId = showLoadingToast(`Extraction in progress for ${doc.fileName}...`);

    try {
      const fieldsToExtract = selectedDocType.fields || [];
      let extractedData = {};
      let success = true;

      if (fieldsToExtract.length > 0) {
        const result = await performExtraction(
          doc.fileUrl,
          fieldsToExtract,
          selectedDocType.display_name || selectedDocType.name,
          (progressMessage) => showExtractionProgressToast(doc.fileName, progressMessage, extractionToastId),
          doc.fileName,
        );
        extractedData = result.extractedData;
        success = result.success;
      } else {
        showSuccessToast(`${doc.fileName} processed (no extraction needed)`, extractionToastId);
      }

      if (!extractedData || (typeof extractedData === 'object' && Object.keys(extractedData).length === 0)) {
        if (fieldsToExtract.length > 0) {
          throw new Error('No data was extracted from the document');
        } else {
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

      showSuccessToast(`Extracted from ${doc.fileName}`, extractionToastId);

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
      showErrorToast(`Extraction failed. Please enter details manually.`, extractionToastId);
      const emptyData = {};
      if (selectedDocType.fields) {
        selectedDocType.fields.forEach(field => {
          emptyData[field.name] = "";
        });
      }

      setUploadedDocs(prev => prev.map(d =>
        d.id === docId ? {
          ...d,
          extractedData: emptyData,
          selectedDocTypeId: newDocTypeId,
          validationStatus: 'warning',
          validationMessage: 'Extraction failed. Please fill in the details manually.'
        } : d
      ));
    }
  };

  const handleReExtract = async (docIdToReExtract: string) => {
    const docToUpdate = uploadedDocs.find(d => d.id === docIdToReExtract);
    if (!docToUpdate) return;

    const docTypeToUse = allowMultipleTypes && docToUpdate.selectedDocTypeId
      ? availableDocTypes.find(dt => dt.id === docToUpdate.selectedDocTypeId)
      : finalSelectedDoc;

    if (!docTypeToUse) {
      showErrorToast('Please select a document type first');
      return;
    }

    setUploadedDocs(prevDocs =>
      prevDocs.map(d =>
        d.id === docIdToReExtract ? { ...d, validationStatus: 'pending', validationMessage: 'Re-extracting...' } : d
      )
    );

    const extractionToastId = showLoadingToast(`Extraction in progress for ${docToUpdate.fileName}...`);
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
      const fieldsToExtract = docTypeToUse.fields || [];
      let extractedData = {};
      let success = true;

      if (fieldsToExtract.length > 0) {
        const result = await performExtraction(
          docToUpdate.fileUrl,
          fieldsToExtract,
          docTypeToUse.display_name || docTypeToUse.name || documentName,
          (progressMessage) => showExtractionProgressToast(docToUpdate.fileName, progressMessage, extractionToastId),
          docToUpdate.fileName,
        );
        extractedData = result.extractedData;
        success = result.success;
      } else {
        showSuccessToast(`${docToUpdate.fileName} processed (no extraction needed)`, extractionToastId);
      }

      const newExtractedData = typeof extractedData === 'string' ? JSON.parse(extractedData) : extractedData || {};
      const updatedDocForValidation = { ...docToUpdate, extractedData: newExtractedData, status: success ? 'valid' : 'pending' };

      if (fieldsToExtract.length > 0) {
        showSuccessToast(`Re-extracted from ${docToUpdate.fileName}`, extractionToastId);
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
      showErrorToast(`Re-extraction failed for ${docToUpdate.fileName}. Please enter details manually.`, extractionToastId);
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
            extractedData: emptyData,
            validationStatus: 'warning',
            validationMessage: 'Re-extraction failed. Please fill in the details manually.'
          } : d
        )
      );
    }
  };

  const handleSaveUploads = async () => {
    if (uploadedDocs.length === 0) {
      showErrorToast('Please select at least one file to upload');
      return;
    }

    if (allowMultipleTypes) {
      const docsWithoutType = uploadedDocs.filter(doc => !doc.selectedDocTypeId);
      if (docsWithoutType.length > 0) {
        showErrorToast('Please select a document type for all uploaded files.');
        return;
      }
    }

    const docsToValidate = uploadedDocs.filter(doc => {
      const docType = allowMultipleTypes && doc.selectedDocTypeId
        ? availableDocTypes.find(dt => dt.id === doc.selectedDocTypeId)
        : finalSelectedDoc;
      return docType?.fields?.length > 0;
    });

    const docsWithErrors = docsToValidate.filter(doc => doc.validationStatus === 'error');
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

    const docsWithWarnings = docsToValidate.filter(doc => doc.validationStatus === 'warning');
    if (docsWithWarnings.length > 0) {
      const warningMessage = docsWithWarnings.map(d => `${d.fileName}:\n${d.validationMessage}`).join('\n\n');
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
    setIsUploading(true);
    const toastId = showLoadingToast('Processing documents...');

    try {
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
        showErrorToast('Missing ID. Please ensure an entity is selected.', toastId);
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
        showErrorToast('Validation errors must be fixed first.', toastId);
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

          const folder = effectiveIsCompany ? 'company-documents' : 'individual-documents';
          const filePath = `${folder}/${entityPathName}/${documentTypeId}/${doc.file.name}`;

          const { error: uploadError } = await supabase.storage
            .from('kyc-documents')
            .upload(filePath, doc.file, { cacheControl: '3600', upsert: true });

          if (uploadError) {
            // Provide more specific error messages for common issues
            if (uploadError.message.includes('size') || uploadError.message.includes('exceeded')) {
              throw new Error(`File "${doc.fileName}" exceeds maximum size limit (${MAX_FILE_SIZE_MB}MB). Please compress the file or contact support for larger file uploads.`);
            } else if (uploadError.message.includes('quota') || uploadError.message.includes('limit')) {
              throw new Error(`Storage quota exceeded for file "${doc.fileName}". Please contact support or try a smaller file.`);
            } else {
              throw new Error(`Upload failed for "${doc.fileName}": ${uploadError.message}`);
            }
          }

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

      if (shouldSkipSave) {
        onSuccess?.({ files: results.map(r => ({ file: r.file, extractedData: r.extractedData })) });
      } else {
        if (onSuccess) {
          const resultToPass = results.length === 1 ? results[0] : results;
          await onSuccess(resultToPass);
        }
      }

      showSuccessToast('Successfully uploaded and processed!', toastId);
      setUploadedDocs([]);
      setIsUploading(false);
      onClose();

    } catch (error) {
      showErrorToast(error.message || 'Upload failed', toastId);
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

    setSelectedValues(prev => {
      const hasChanges = Object.entries(initialValues).some(
        ([key, value]) => prev[key] !== value
      );
      return hasChanges ? { ...prev, ...initialValues } : prev;
    });
  }, [dropdownsDeps]);

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  const renderContent = () => (
    <div className='w-full max-h-[90vh] overflow-y-auto'>
      {!renderAsDialog && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold">
            Upload <span className='uppercase'>{currentDocumentName}</span> for {individualName}
          </h3>
        </div>
      )}

      {dropdowns && dropdowns.length > 0 && (
        <div className="space-y-4 mb-4">
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
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <AlertTriangle className="h-4 w-4" />
            <span>
              <strong>File Size Limit:</strong> Maximum {MAX_FILE_SIZE_MB}MB per file.
              Files larger than this will be rejected automatically.
            </span>
          </div>
        </div>
        <div className="p-4">
          <FileUpload onFilesSelected={handleFileUpload} />
        </div>

        {uploadedDocs.length > 0 && (
          <>
            <div className="h-[60vh] overflow-y-auto space-y-6 mb-6">
              {uploadedDocs.map((doc) => {
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
                        <span className="text-xs text-gray-700">
                          {doc.fileName} (<span className={getFileSizeColor(doc.file.size)}>{formatFileSize(doc.file.size)}</span>)
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

            <div className="mt-4">
              {showSaveButton && (
                <Button
                  onClick={handleSaveUploads}
                  disabled={isUploading}
                  className="w-full sm:w-auto"
                >
                  {isUploading ? 'Saving...' : `Save ${uploadedDocs.length} Document${uploadedDocs.length !== 1 ? 's' : ''}`}
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <ValidationDialog
        {...validationDialog}
        isSubmitting={isUploading}
        onClose={() => setValidationDialog({ ...validationDialog, isOpen: false })}
      />
    </div>
  );

  if (renderAsDialog) {
    return (
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
          {renderContent()}
        </DialogContent>
      </Dialog>
    );
  }

  return isOpen ? renderContent() : null;
}
