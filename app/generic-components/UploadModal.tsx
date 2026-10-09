// @ts-nocheck
"use client"

import { useState, useMemo, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Trash2, RotateCw, AlertTriangle, CheckCircle, XCircle, Square, Sparkles, X, Loader2 } from 'lucide-react'
import { performExtraction } from '@/lib/extractionUtils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { ExtractionPreview } from '@/components/ExtractionPreview'
import { FileUpload } from '@/components/ui/file-upload'
import { toast } from "@/lib/hooks/use-toast"
import supabase from '@/lib/supabase/client'
import { cn } from "@/lib/utils"

// File size constants (in bytes)
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILE_SIZE_MB = MAX_FILE_SIZE / (1024 * 1024);

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getFileSizeColor = (bytes: number): string => {
  const sizeMB = bytes / (1024 * 1024);
  if (sizeMB >= MAX_FILE_SIZE_MB) return 'text-red-600 font-semibold';
  if (sizeMB >= MAX_FILE_SIZE_MB * 0.8) return 'text-orange-600 font-medium';
  if (sizeMB >= MAX_FILE_SIZE_MB * 0.5) return 'text-yellow-600';
  return 'text-gray-500';
};

interface DocumentField {
  id: string
  name: string
  type: string
  displayName?: string
  isArray?: boolean
  isUnique?: boolean
  section?: string
  options?: string[]
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
  storagePathPrefix?: string;
  additionalFields?: Record<string, any>;
  onBeforeUpload?: (recordData: any) => Promise<any>;
  renderAsDialog?: boolean;
  showSaveButton?: boolean;
  onPendingChange?: (docs: any[]) => void;
  autoExtract?: boolean;
  allowBackImage?: boolean;
  backImageLabel?: string;
}

const ValidationDialog = ({ isOpen, onClose, onConfirm, title, description, type = 'warning', isSubmitting = false, uniqueFields = [] }) => {
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {getIcon()}
            <div className="flex-1">
              <DialogTitle>{title}</DialogTitle>
              {uniqueFields.length > 0 && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="text-xs font-medium text-amber-800">
                      Unique Identifier Fields:
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {uniqueFields.map((field, index) => (
                      <span key={index} className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">
                        {field.displayName || field.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
  );
};

const generateDocumentId = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

const fetchDocumentFieldsFromKYC = async (documentId: string) => {
  if (!documentId) return [];
  try {
    const { data, error } = await supabase
      .from('acc_portal_kyc')
      .select('fields')
      .eq('id', documentId)
      .single();

    if (error) {
      console.warn('Failed to fetch fields from acc_portal_kyc:', error);
      return [];
    }

    let fields = [];
    if (Array.isArray(data)) {
      if (data.length > 0 && data[0].fields) fields = data[0].fields;
      else fields = data;
    } else if (data && typeof data === 'object') {
      if (data.fields) fields = data.fields;
      else if (Array.isArray(data)) fields = data;
    }
    return fields || [];
  } catch (err) {
    console.error('Error fetching document fields from KYC:', err);
    return [];
  }
};

const normalizeName = (name) => {
  if (!name || typeof name !== 'string') return '';
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

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
            fieldDisplayName: field.displayName || fieldName,
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
            fieldDisplayName: field.displayName || fieldName,
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
      message: `The following match fields are missing: ${missingMatchFields.join(', ')}. Please ensure these fields are properly extracted.`
    };
  }

  if (mismatchedFields.length > 0) {
    const mismatchMessages = mismatchedFields.map(m =>
      `Expected "${m.field}" to match "${m.expected}" but found "${m.actual}"`
    ).join('; ');

    return {
      isValid: false,
      message: `Document mismatch: ${mismatchMessages}. Please verify the document matches the expected asset.`
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
  storagePathPrefix,
  additionalFields,
  onBeforeUpload,
  renderAsDialog = true,
  showSaveButton = true,
  onPendingChange,
  autoExtract = true,
  allowBackImage = false,
  backImageLabel = 'Back',
}: UploadModalProps) {
  const [uploadedDocs, setUploadedDocs] = useState<Array<{
    id: string;
    file: File;
    fileUrl: string;
    backFile?: File;
    backFileUrl?: string;
    extractedData: Record<string, any>;
    status: string;
    fileName?: string;
    validationStatus?: 'pending' | 'valid' | 'warning' | 'error';
    validationMessage?: string;
    selectedDocTypeId?: string;
    fields?: any[];
  }>>([]);

  const [isUploading, setIsUploading] = useState(false);
  const [currentDocumentName, setCurrentDocumentName] = useState(documentName);
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});
  const [backFileTarget, setBackFileTarget] = useState<string | null>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    setCurrentDocumentName(documentName);
  }, [documentName]);

  const [finalSelectedDoc, setFinalSelectedDoc] = useState(selectedDoc);
  const [validationDialog, setValidationDialog] = useState({
    isOpen: false,
    title: '',
    description: '',
    type: 'warning',
    onConfirm: null,
    uniqueFields: []
  });

  const availableDocTypes = useMemo(() => {
    if (allowMultipleTypes && documentTypes && documentTypes.length > 0) {
      return documentTypes;
    }
    return selectedDoc ? [selectedDoc] : [];
  }, [allowMultipleTypes, documentTypes, selectedDoc]);

  useEffect(() => {
    if (isOpen) {
      setFinalSelectedDoc(selectedDoc);
      setUploadedDocs([]);
    }
  }, [isOpen, selectedDoc]);

  const onPendingChangeRef = useRef(onPendingChange);
  useEffect(() => {
    onPendingChangeRef.current = onPendingChange;
  }, [onPendingChange]);

  useEffect(() => {
    onPendingChangeRef.current?.(uploadedDocs);
  }, [uploadedDocs]);

  const individualName = useMemo(() => {
    const isCompany = !!company?.id || isCompanyUpload;
    if (isCompany) {
      return companyName || company?.company_name || entityName || 'Unknown Company';
    }
    return selectedMember?.full_name || selectedMember?.name || entityName || 'New Individual';
  }, [entityName, selectedMember, company, companyName, isCompanyUpload]);

  const personId = useMemo(() => {
    return selectedMember?.id || entityId;
  }, [selectedMember, entityId]);

  const docId = useMemo(() => {
    return finalSelectedDoc?.id || selectedDocumentId;
  }, [finalSelectedDoc, selectedDocumentId]);

  const handleStopExtraction = (docIdToStop: string) => {
    const controller = abortControllersRef.current.get(docIdToStop);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(docIdToStop);
    }
    setUploadedDocs(prev => prev.map(d =>
      d.id === docIdToStop && d.validationStatus === 'pending'
        ? { ...d, validationStatus: 'warning', validationMessage: 'Extraction stopped. Please fill in the details manually.' }
        : d
    ));
  };

  const getUniqueFieldsFromDocs = (docs) => {
    const uniqueFieldsMap = new Map();
    docs.forEach(doc => {
      const docType = allowMultipleTypes && doc.selectedDocTypeId
        ? availableDocTypes.find(dt => dt.id === doc.selectedDocTypeId)
        : finalSelectedDoc;

      if (docType?.fields) {
        docType.fields.forEach(field => {
          if (field.isUnique && !uniqueFieldsMap.has(field.name)) {
            uniqueFieldsMap.set(field.name, {
              name: field.name,
              displayName: field.displayName || field.name
            });
          }
        });
      }
    });
    return Array.from(uniqueFieldsMap.values());
  };

  const handleSaveUploads = async () => {
    const shouldSkipSave = additionalFields?.disableSave === true;

    if (uploadedDocs.length === 0) {
      toast({ title: 'Notice', description: 'Please upload at least one document.', variant: 'default' });
      return;
    }

    if (!shouldSkipSave) {
      if (!targetTable || !idFieldName || !documentIdFieldName) {
        toast({ title: 'Error', description: 'Upload configuration is incomplete.', variant: 'destructive' });
        return;
      }
    }

    const docsToValidate = uploadedDocs.filter(doc => {
      const docType = allowMultipleTypes && doc.selectedDocTypeId
        ? availableDocTypes.find(dt => dt.id === doc.selectedDocTypeId)
        : finalSelectedDoc;
      return docType?.fields?.length > 0;
    });

    if (autoExtract === false) {
      const docsNotYetExtracted = docsToValidate.filter(doc => Object.keys(doc.extractedData || {}).length === 0);
      if (docsNotYetExtracted.length > 0) {
        toast({
          title: 'Extraction Required',
          description: docsNotYetExtracted.length === 1
            ? `Click "Extract" on ${docsNotYetExtracted[0].fileName} before saving.`
            : `Click "Extract" on all documents before saving.`,
          variant: 'destructive'
        });
        return;
      }
    }

    const docsWithErrors = docsToValidate.filter(doc => doc.validationStatus === 'error');
    if (docsWithErrors.length > 0) {
      const uniqueFields = getUniqueFieldsFromDocs(docsWithErrors);
      setValidationDialog({
        isOpen: true,
        title: 'Critical Validation Errors',
        description: 'Cannot upload due to critical errors. Please resolve the issues before proceeding.',
        type: 'error',
        onConfirm: null,
        uniqueFields
      });
      return;
    }

    const docsWithWarnings = docsToValidate.filter(doc => doc.validationStatus === 'warning');
    if (docsWithWarnings.length > 0) {
      const warningMessage = docsWithWarnings.map(d => `${d.fileName}:\n${d.validationMessage}`).join('\n\n');
      const uniqueFields = getUniqueFieldsFromDocs(docsWithWarnings);

      setValidationDialog({
        isOpen: true,
        title: 'Validation Warnings',
        description: `Potential issues were detected:\n\n${warningMessage}\n\nProceed with upload?`,
        type: 'warning',
        onConfirm: async () => {
          await proceedWithUpload();
        },
        uniqueFields
      });
      return;
    }

    await proceedWithUpload();
  };

  const handleFileUpload = async (files: File[]) => {
    const requiredDropdowns = dropdowns?.filter(d => d.required) || [];
    const missingRequiredDropdowns = requiredDropdowns.filter(d => !d.value);

    if (missingRequiredDropdowns.length > 0) {
      const missingLabels = missingRequiredDropdowns.map(d => d.label).join(', ');
      toast({ title: 'Required Fields', description: `Please select: ${missingLabels}`, variant: 'destructive' });
      return;
    }

    const fileArray = Array.isArray(files) ? files : [files];
    if (!fileArray.length) return;

    const selectedDocTypeFromDropdown = selectedValues['document-type'] || '';

    const newDocs = fileArray.map(file => ({
      id: generateDocumentId(),
      file,
      fileUrl: URL.createObjectURL(file),
      extractedData: {},
      status: 'pending',
      fileName: file.name,
      validationStatus: 'pending' as const,
      validationMessage: 'Processing...',
      selectedDocTypeId: allowMultipleTypes ? (selectedDocTypeFromDropdown || '') : (finalSelectedDoc?.id || selectedDoc?.id)
    }));

    setUploadedDocs(prev => [...prev, ...newDocs]);

    const isCompany = !!company?.id || isCompanyUpload;
    const validationContext = {
      isCompanyUpload: isCompany,
      companyId: company?.id,
      companyName: companyName || company?.company_name,
      individualName,
      personId,
      docId,
      documentName,
      finalSelectedDoc,
    };

    try {
      const processedDocsPromises = newDocs.map(async (doc) => {
        if (autoExtract === false) {
          let docTypeToUse = finalSelectedDoc;
          let fieldsToExtract = finalSelectedDoc?.fields || [];

          if (allowMultipleTypes && doc.selectedDocTypeId) {
            docTypeToUse = availableDocTypes.find(dt => dt.id === doc.selectedDocTypeId);
            if (docTypeToUse) {
              fieldsToExtract = docTypeToUse.fields || [];
              if (fieldsToExtract.length === 0 && docTypeToUse.id) {
                fieldsToExtract = await fetchDocumentFieldsFromKYC(docTypeToUse.id);
              }
            }
          } else if (!allowMultipleTypes) {
            if (fieldsToExtract.length === 0 && selectedDocumentId) {
              fieldsToExtract = await fetchDocumentFieldsFromKYC(selectedDocumentId);
              setFinalSelectedDoc(prev => ({ ...prev, fields: fieldsToExtract }));
            }
          }

          return {
            ...doc,
            fields: fieldsToExtract,
            status: 'pending',
            validationStatus: 'warning' as const,
            validationMessage: allowBackImage
              ? 'Ready for extraction. Add a back image if necessary, then click "Extract".'
              : 'Ready for extraction. Click "Extract" to proceed.'
          };
        }

        const controller = new AbortController();
        abortControllersRef.current.set(doc.id, controller);

        try {
          let docTypeToUse = finalSelectedDoc;
          let fieldsToExtract = finalSelectedDoc?.fields || [];

          if (allowMultipleTypes && doc.selectedDocTypeId) {
            docTypeToUse = availableDocTypes.find(dt => dt.id === doc.selectedDocTypeId);
            if (docTypeToUse) {
              fieldsToExtract = docTypeToUse.fields || [];
              if (fieldsToExtract.length === 0 && docTypeToUse.id) {
                fieldsToExtract = await fetchDocumentFieldsFromKYC(docTypeToUse.id);
              }
            }
          } else if (!allowMultipleTypes) {
            if (fieldsToExtract.length === 0 && selectedDocumentId) {
              fieldsToExtract = await fetchDocumentFieldsFromKYC(selectedDocumentId);
              setFinalSelectedDoc(prev => ({ ...prev, fields: fieldsToExtract }));
            }
          }

          if (fieldsToExtract.length === 0) {
            return { ...doc, status: 'valid', validationStatus: 'valid' as const, validationMessage: 'Ready' };
          }

          const extractionResult = await performExtraction(
            doc.fileUrl,
            fieldsToExtract,
            docTypeToUse?.name || documentName,
            undefined,
            doc.fileName,
            controller.signal
          );

          if (extractionResult.cancelled) {
            return {
              ...doc,
              fields: fieldsToExtract,
              validationStatus: 'warning' as const,
              validationMessage: 'Extraction stopped. Please fill in details manually.'
            };
          }

          let { extractedData } = extractionResult;
          let parsedData = typeof extractedData === 'string' ? JSON.parse(extractedData) : (extractedData || {});

          const docWithData = {
            ...doc,
            extractedData: parsedData,
            fields: fieldsToExtract,
            status: 'valid'
          };

          const validation = await validateDocument(docWithData, {
            ...validationContext,
            docId: docTypeToUse?.id || docId,
            documentName: docTypeToUse?.name || documentName,
            finalSelectedDoc: docTypeToUse || finalSelectedDoc
          });

          return {
            ...docWithData,
            validationStatus: validation.status,
            validationMessage: validation.message,
          };
        } catch (error) {
          if ((error as any)?.name === 'AbortError') {
            return {
              ...doc,
              validationStatus: 'warning' as const,
              validationMessage: 'Extraction stopped. Please fill in details manually.'
            };
          }
          return {
            ...doc,
            validationStatus: 'warning' as const,
            validationMessage: 'Extraction failed. Please fill manually.'
          };
        } finally {
          abortControllersRef.current.delete(doc.id);
        }
      });

      const fullyProcessedDocs = await Promise.all(processedDocsPromises);
      setUploadedDocs(prev => prev.map(oldDoc =>
        fullyProcessedDocs.find(pd => pd.id === oldDoc.id) || oldDoc
      ));
    } catch (error) {
      console.error('Error handling files:', error);
    }
  };

  const handleAddBackFile = (docId: string, files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploadedDocs(prev => prev.map(d =>
      d.id === docId ? { ...d, backFile: file, backFileUrl: URL.createObjectURL(file) } : d
    ));
    setBackFileTarget(null);
  };

  const handleDocTypeChange = async (docId: string, newDocTypeId: string) => {
    const doc = uploadedDocs.find(d => d.id === docId);
    if (!doc) return;

    const selectedDocType = availableDocTypes.find(dt => dt.id === newDocTypeId) || selectedDoc;
    if (!selectedDocType) return;

    if (autoExtract === false) {
      let fieldsToExtract = selectedDocType.fields || [];
      if (fieldsToExtract.length === 0 && selectedDocType.id) {
        fieldsToExtract = await fetchDocumentFieldsFromKYC(selectedDocType.id);
      }
      setUploadedDocs(prev => prev.map(d =>
        d.id === docId ? {
          ...d,
          selectedDocTypeId: newDocTypeId,
          fields: fieldsToExtract,
          validationStatus: 'warning',
          validationMessage: 'Document type updated. Click "Extract" to process.'
        } : d
      ));
      return;
    }

    setUploadedDocs(prev => prev.map(d =>
      d.id === docId ? { ...d, selectedDocTypeId: newDocTypeId, validationStatus: 'pending', validationMessage: 'Re-extracting...' } : d
    ));

    const controller = new AbortController();
    abortControllersRef.current.set(docId, controller);

    try {
      let fieldsToExtract = selectedDocType.fields || [];
      if (fieldsToExtract.length === 0 && selectedDocType.id) {
        fieldsToExtract = await fetchDocumentFieldsFromKYC(selectedDocType.id);
      }

      if (fieldsToExtract.length === 0) {
        setUploadedDocs(prev => prev.map(d =>
          d.id === docId
            ? { ...d, extractedData: {}, status: 'valid', validationStatus: 'valid', validationMessage: 'Image uploaded successfully' }
            : d
        ));
        return;
      }

      const docTypeExtractionResult = await performExtraction(
        doc.fileUrl,
        fieldsToExtract,
        selectedDocType.display_name || selectedDocType.name,
        undefined,
        doc.fileName,
        controller.signal
      );

      if (docTypeExtractionResult.cancelled) {
        setUploadedDocs(prev => prev.map(d =>
          d.id === docId ? { ...d, validationStatus: 'warning', validationMessage: 'Extraction stopped. Please fill in details manually.' } : d
        ));
        return;
      }

      const { extractedData } = docTypeExtractionResult;
      let parsedData = typeof extractedData === 'string' ? JSON.parse(extractedData) : (extractedData || {});

      const docWithData = {
        ...doc,
        extractedData: parsedData,
        status: 'valid',
        selectedDocTypeId: newDocTypeId
      };

      const isCompany = !!company?.id || isCompanyUpload;
      const validation = await validateDocument(docWithData, {
        isCompanyUpload: isCompany,
        companyId: company?.id,
        companyName: companyName || company?.company_name,
        individualName,
        personId,
        docId: newDocTypeId,
        documentName: selectedDocType.display_name || selectedDocType.name,
        finalSelectedDoc: selectedDocType,
      });

      setUploadedDocs(prev => prev.map(d =>
        d.id === docId ? {
          ...docWithData,
          validationStatus: validation.status,
          validationMessage: validation.message,
        } : d
      ));
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        setUploadedDocs(prev => prev.map(d =>
          d.id === docId ? { ...d, validationStatus: 'warning', validationMessage: 'Extraction stopped. Please fill in details manually.' } : d
        ));
        return;
      }
      setUploadedDocs(prev => prev.map(d =>
        d.id === docId ? {
          ...d,
          extractedData: {},
          selectedDocTypeId: newDocTypeId,
          validationStatus: 'warning',
          validationMessage: 'Extraction failed. Please fill manually.'
        } : d
      ));
    } finally {
      abortControllersRef.current.delete(docId);
    }
  };

  const handleReExtract = async (docIdToReExtract: string, forceAI: boolean = false) => {
    const docToUpdate = uploadedDocs.find(d => d.id === docIdToReExtract);
    if (!docToUpdate) return;

    let docTypeToUse = allowMultipleTypes && docToUpdate.selectedDocTypeId
      ? availableDocTypes.find(dt => dt.id === docToUpdate.selectedDocTypeId)
      : finalSelectedDoc;

    if (!docTypeToUse) docTypeToUse = selectedDoc || null;
    if (!docTypeToUse) {
      toast({ title: 'Error', description: 'Please select a document type first.', variant: 'destructive' });
      return;
    }

    setUploadedDocs(prevDocs =>
      prevDocs.map(d =>
        d.id === docIdToReExtract ? { ...d, validationStatus: 'pending', validationMessage: forceAI ? 'Re-extracting with AI...' : 'Extracting...' } : d
      )
    );

    const controller = new AbortController();
    abortControllersRef.current.set(docIdToReExtract, controller);

    try {
      let fieldsToExtract = docTypeToUse.fields || [];
      if (fieldsToExtract.length === 0 && docTypeToUse.id) {
        fieldsToExtract = await fetchDocumentFieldsFromKYC(docTypeToUse.id);
      }

      if (fieldsToExtract.length === 0) {
        setUploadedDocs(prevDocs =>
          prevDocs.map(d =>
            d.id === docIdToReExtract ? {
              ...d,
              extractedData: {},
              validationStatus: 'valid',
              validationMessage: 'Image uploaded successfully'
            } : d
          )
        );
        return;
      }

      const reExtractionResult = await performExtraction(
        docToUpdate.fileUrl,
        fieldsToExtract,
        docTypeToUse.display_name || docTypeToUse.name || documentName,
        undefined,
        docToUpdate.fileName,
        controller.signal,
        forceAI
      );

      if (reExtractionResult.cancelled) {
        setUploadedDocs(prevDocs =>
          prevDocs.map(d =>
            d.id === docIdToReExtract ? { ...d, validationStatus: 'warning', validationMessage: 'Extraction stopped. Please fill in details manually.' } : d
          )
        );
        return;
      }

      const { extractedData, success } = reExtractionResult;
      const newExtractedData = typeof extractedData === 'string' ? JSON.parse(extractedData) : (extractedData || {});

      const updatedDocForValidation = {
        ...docToUpdate,
        extractedData: newExtractedData,
        status: success ? 'valid' : 'pending'
      };

      const isCompany = !!company?.id || isCompanyUpload;
      const validation = await validateDocument(updatedDocForValidation, {
        isCompanyUpload: isCompany,
        companyId: company?.id,
        companyName: companyName || company?.company_name,
        individualName,
        personId,
        docId: docTypeToUse.id,
        finalSelectedDoc: docTypeToUse,
        documentName: docTypeToUse.display_name || docTypeToUse.name,
      });

      setUploadedDocs(prevDocs =>
        prevDocs.map(d =>
          d.id === docIdToReExtract ? {
            ...updatedDocForValidation,
            validationStatus: validation.status,
            validationMessage: validation.message,
          } : d
        )
      );
      toast({ title: 'Success', description: `Processed ${docToUpdate.fileName}`, variant: 'success' });
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        setUploadedDocs(prevDocs =>
          prevDocs.map(d =>
            d.id === docIdToReExtract ? { ...d, validationStatus: 'warning', validationMessage: 'Extraction stopped. Please fill in details manually.' } : d
          )
        );
        return;
      }
      setUploadedDocs(prevDocs =>
        prevDocs.map(d =>
          d.id === docIdToReExtract ? {
            ...d,
            extractedData: {},
            validationStatus: 'warning',
            validationMessage: 'Extraction failed. Please fill manually.'
          } : d
        )
      );
    } finally {
      abortControllersRef.current.delete(docIdToReExtract);
    }
  };

  const proceedWithUpload = async () => {
    setIsUploading(true);

    try {
      const isCompany = !!company?.id || isCompanyUpload;
      const entityIdToUse = isCompany ? (company?.id || entityId) : (selectedMember?.id || entityId);
      const shouldSkipSave = additionalFields?.disableSave === true;

      const resolveDocTypeForSave = (doc: any) => {
        if (doc?.selectedDocTypeId) {
          const found = (documentTypes || []).find(dt => String(dt.id) === String(doc.selectedDocTypeId))
            || availableDocTypes.find(dt => String(dt.id) === String(doc.selectedDocTypeId));
          if (found) return found;
        }
        return finalSelectedDoc;
      };

      const dropdownValues: Record<string, any> = {};
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
        const docTypeForUpload = resolveDocTypeForSave(doc);
        const documentTypeId = docTypeForUpload?.id || selectedDocumentId;

        if (shouldSkipSave) {
          return {
            files: [{
              file: doc.file,
              backFile: doc.backFile,
              extractedData: {
                ...doc.extractedData,
                originalFileName: doc.file.name
              },
              documentType: docTypeForUpload
            }]
          };
        }

        const pathPrefix = storagePathPrefix || (isCompany ? 'company-documents' : 'individual-documents');
        const filePath = `${pathPrefix}/${entityIdToUse}/${documentTypeId}/${doc.file.name}`;

        const { error: uploadError } = await supabase.storage
          .from('kyc-documents')
          .upload(filePath, doc.file, {
            cacheControl: '3600',
            upsert: true
          });

        if (uploadError) {
          throw new Error(`Failed to upload file: ${uploadError.message}`);
        }

        let backFilePath: string | null = null;
        if (doc.backFile) {
          backFilePath = `${pathPrefix}/${entityIdToUse}/${documentTypeId}/back_${doc.backFile.name}`;
          await supabase.storage
            .from('kyc-documents')
            .upload(backFilePath, doc.backFile, { cacheControl: '3600', upsert: true });
        }

        const recordData: any = {
          [documentIdFieldName]: documentTypeId,
          file_path: filePath,
          extracted_details: {
            ...doc.extractedData,
            ...(backFilePath ? { back_file_path: backFilePath } : {})
          },
          ...(targetTable !== 'acc_portal_directors_documents' && { status: 'active' }),
          created_at: new Date().toISOString(),
          ...(companyAssetId && { company_asset_id: companyAssetId }),
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
        }

        Object.keys(recordData).forEach(key => recordData[key] === undefined && delete recordData[key]);

        if (onBeforeUpload) {
          const result = await onBeforeUpload(recordData);
          if (result) return result;
        }

        return {
          ...recordData,
          file: doc.file,
          extractedData: doc.extractedData,
          documentType: docTypeForUpload
        };
      });

      const results = await Promise.all(uploadPromises);
      toast({ title: 'Success', description: 'All documents processed successfully!', variant: 'success' });
      setUploadedDocs([]);
      setIsUploading(false);
      onClose();

      if (onSuccess && results && results.length > 0) {
        const resultToPass = results.length === 1 ? results[0] : results;
        onSuccess(resultToPass);
      }
    } catch (error) {
      console.error('Error uploading documents:', error);
      toast({ title: 'Upload Failed', description: error?.message || 'Failed to upload documents.', variant: 'destructive' });
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
      case 'valid': return 'border-green-200 bg-green-50/50'
      case 'warning': return 'border-yellow-200 bg-yellow-50/50'
      case 'error': return 'border-red-200 bg-red-50/50'
      default: return 'border-gray-200 bg-gray-50/50'
    }
  };

  const renderContent = () => (
    <div className="flex flex-col h-full max-h-[85vh]">
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
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
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

      <div>
        <div className="p-4">
          <FileUpload onFilesSelected={handleFileUpload} />
        </div>

        {uploadedDocs.length > 0 && (
          <div className="flex flex-col max-h-[60vh] mt-4 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pb-2">
              {uploadedDocs.map((doc) => {
                const docTypeForPreview = allowMultipleTypes && doc.selectedDocTypeId
                  ? availableDocTypes.find(dt => dt.id === doc.selectedDocTypeId)
                  : finalSelectedDoc;
                const fieldsToShow = doc.fields || docTypeForPreview?.fields || documentFields || [];

                return (
                  <div key={doc.id} className={`relative rounded-lg p-4 border ${getValidationColor(doc.validationStatus)}`}>
                    <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                      <div className="flex items-center gap-2 flex-grow">
                        {getValidationIcon(doc.validationStatus)}
                        <span className="text-xs font-semibold">
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
                        {allowBackImage && (
                          <>
                            {doc.backFileUrl ? (
                              <div className="relative group">
                                <img src={doc.backFileUrl} alt={backImageLabel} className="h-8 w-14 object-contain bg-gray-50 rounded border border-gray-200" />
                                <span className="absolute top-0.5 left-0.5 text-[9px] font-bold bg-gray-700 text-white px-1 rounded">{backImageLabel.toUpperCase()}</span>
                                <button
                                  onClick={() => setUploadedDocs(prev => prev.map(d => d.id === doc.id ? { ...d, backFile: undefined, backFileUrl: undefined } : d))}
                                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs border-dashed border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50"
                                onClick={() => { setBackFileTarget(doc.id); backFileInputRef.current?.click(); }}
                              >
                                + {backImageLabel}
                              </Button>
                            )}
                          </>
                        )}

                        {doc.validationStatus === 'pending' ? (
                          <Button
                            size="sm"
                            className="h-8 text-xs gap-1.5 font-semibold bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                            onClick={() => handleStopExtraction(doc.id)}
                          >
                            <Square className="h-3 w-3 fill-current" />
                            Stop
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className={cn(
                              "h-8 text-xs gap-1.5 font-semibold",
                              (!doc.extractedData || Object.keys(doc.extractedData).length === 0)
                                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                                : "bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                            )}
                            onClick={() => handleReExtract(doc.id)}
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                            {!doc.extractedData || Object.keys(doc.extractedData).length === 0 ? 'Extract' : 'Re-extract'}
                          </Button>
                        )}

                        {doc.validationStatus !== 'pending' && doc.extractedData && Object.keys(doc.extractedData).length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            title="Re-extract using AI instead of local parser"
                            className="h-8 text-xs gap-1.5 font-semibold border-purple-200 text-purple-600 hover:bg-purple-50"
                            onClick={() => handleReExtract(doc.id, true)}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Re-extract with AI
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          title="Remove"
                          className="text-red-600 hover:text-red-800 hover:bg-red-100 h-8 w-8 p-0"
                          onClick={() => setUploadedDocs(uploadedDocs.filter(d => d.id !== doc.id))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {doc.validationMessage && doc.validationStatus !== 'valid' && (
                      <div className="mb-4 p-3 rounded-md bg-white border text-xs text-gray-700 whitespace-pre-line">
                        {doc.validationMessage}
                      </div>
                    )}

                    <div className="space-y-4">
                      <div className="h-[70vh] min-h-0 overflow-hidden rounded border border-gray-200">
                        <ExtractionPreview
                          extractedData={{
                            ...(doc.extractedData || {}),
                            ...(doc.backFileUrl ? { backFileUrl: doc.backFileUrl, backFileName: doc.backFile?.name } : {}),
                          }}
                          fields={fieldsToShow}
                          fileUrl={doc.fileUrl}
                          fileName={doc.fileName}
                          expanded={true}
                          showSaveButton={false}
                          allowBackImage={allowBackImage}
                          documentId={docTypeForPreview?.id || selectedDocumentId}
                          onDataChange={(fieldName, value) => {
                            setUploadedDocs(prev => prev.map(d =>
                              d.id === doc.id ? {
                                ...d,
                                extractedData: { ...d.extractedData, [fieldName]: value }
                              } : d
                            ));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {showSaveButton && (
              <DialogFooter className="shrink-0 pt-4 border-t mt-2">
                <Button
                  onClick={handleSaveUploads}
                  disabled={isUploading}
                  className="w-full sm:w-auto"
                >
                  {isUploading ? 'Saving...' : `Save ${uploadedDocs.length} Document${uploadedDocs.length !== 1 ? 's' : ''}`}
                </Button>
              </DialogFooter>
            )}
          </div>
        )}
      </div>

      <ValidationDialog
        {...validationDialog}
        isSubmitting={isUploading}
        onClose={() => setValidationDialog({ ...validationDialog, isOpen: false })}
      />

      {allowBackImage && (
        <input
          ref={backFileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={e => {
            if (backFileTarget && e.target.files) {
              handleAddBackFile(backFileTarget, Array.from(e.target.files));
              e.target.value = '';
            }
          }}
        />
      )}
    </div>
  );

  if (renderAsDialog) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="max-w-[85vw] sm:max-w-[85vw] w-full max-h-[92vh] overflow-hidden flex flex-col p-6"
          onInteractOutside={(e) => {
            e.preventDefault();
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Upload <span className="uppercase text-primary">{currentDocumentName}</span> for {individualName}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {renderContent()}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return isOpen ? renderContent() : null;
}
