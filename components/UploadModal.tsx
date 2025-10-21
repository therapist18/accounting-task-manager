// @ts-nocheck
"use client"

import { useState, useMemo, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from '@/components/ui/label'
import { Upload, Trash2, RotateCw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { performExtraction } from '@/lib/extractionUtils'
import { ExtractionPreview } from './ExtractionPreview'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface DocumentField {
  id: string
  name: string
  type: string
  isArray?: boolean
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

interface UploadModalProps {
  isOpen: boolean
  onClose: () => void
  onUpload: (data: {
    files: Array<{
      file: File
      extractedData: Record<string, any>
    }>
  }, selectedDoc: any) => Promise<void>
  documentName: string
  companyName: string
  uploadFor?: string
  relationship?: string
  documentFields?: DocumentField[]
  documentType?: string
  entityId?: string
  entityType?: 'individual' | 'company'
  allIndividuals?: any[]
  individualId?: string
  entityName?: string
  selectedDoc?: any
  documentUploads?: any[]
  extractedData?: Record<string, any>
  selectedMember?: any
  isFormContext?: boolean
  onDocumentReady?: (documentData: {
    file: File
    extractedData: Record<string, any>
    storagePath?: string
    status?: string
  }) => void
  isAllKepUpload?: boolean
  permitClassOptions?: any[]
  allDocumentTypes?: any[]
  mainTab?: string;
}

// Validation Dialog Component
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            {getIcon()}
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>
        <div className={`p-4 rounded-lg ${getColors()}`}>
          <p className="text-sm">{description}</p>
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
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ')        // Normalize spaces
    .trim();
}

// [UPDATED] - More lenient name matching (50% rule)
const checkNameMatch = (personName, fileName, extractedData) => {
  if (personName === 'New Individual') {
    return { match: true };
  }

  const normalizedPersonName = normalizeName(personName);
  const normalizedFileName = normalizeName(fileName);
  // Use "Full_Names" for alien card, fallback to "full_name"
  const extractedFullName = extractedData?.Full_Names || extractedData?.full_name || '';
  const normalizedExtractedName = normalizeName(extractedFullName);

  if (!normalizedPersonName) return { match: false, reason: 'Person name is missing' };

  const personNameParts = normalizedPersonName.split(' ').filter(part => part.length > 2);
  if (personNameParts.length === 0) return { match: true }; // Avoid issues with short names

  // 1. Check against filename
  const fileNameMatchCount = personNameParts.filter(part => normalizedFileName.includes(part)).length;
  const fileNameMatch = (fileNameMatchCount / personNameParts.length) >= 0.5;

  // 2. Check against extracted name
  let extractedNameMatch = false;
  if (normalizedExtractedName) {
    const extractedNameParts = normalizedExtractedName.split(' ').filter(part => part.length > 2);
    const extractedNameMatchCount = personNameParts.filter(personPart =>
      extractedNameParts.some(extractedPart => personPart.includes(extractedPart) || extractedPart.includes(personPart))
    ).length;
    extractedNameMatch = (extractedNameMatchCount / personNameParts.length) >= 0.5;
  }

  // A match is found if either the extracted name matches or the filename matches
  const hasMatch = extractedNameMatch || fileNameMatch;
  let reason = '';
  if (!hasMatch) {
    if (normalizedExtractedName) {
      reason = `Name in document ("${extractedFullName}") and filename ("${fileName}") do not sufficiently match "${personName}"`;
    } else {
      reason = `Filename "${fileName}" does not sufficiently match "${personName}"`;
    }
  }

  return { match: hasMatch, reason };
};


// [NEW] - Helper to find a unique identifier in the extracted data, case-insensitively
const getUniqueField = (extractedData, mainTab, docSubCategory) => {
  const fieldMap = {
    'Permit (KEP)': ['permit_number', 'Permit_Number', 'registration_number'],
    'KSP': ['pass_number', 'Pass_Number'],
    'KPP': ['pass_number', 'Pass_Number'],
    'KDP': ['pass_number', 'Pass_Number'],
    'E - VISA': ['application_number', 'Application_Number'],
    // Main Tab fallbacks
    'alien': ['Serial_No', 'serial_number', 'Indiv_Number'],
    'kenyan_id': ['id_number', 'ID_Number'],
    'passport': ['passport_number', 'Passport_Number'],
    'default': ['pass_number', 'Pass_Number']
  };

  const keysToSearch = fieldMap[docSubCategory] || fieldMap[mainTab] || fieldMap['default'];

  // Search for the key in a case-insensitive way
  for (const searchKey of keysToSearch) {
    for (const dataKey in extractedData) {
      if (dataKey.toLowerCase() === searchKey.toLowerCase() && extractedData[dataKey]) {
        return { actualFieldName: dataKey, uniqueValue: extractedData[dataKey] };
      }
    }
  }

  return { actualFieldName: null, uniqueValue: null };
};


// [UPDATED] - Uses the new getUniqueField helper for robust, case-insensitive duplicate checks
const checkForDuplicates = async (personId, docId, extractedData, mainTab, docSubCategory) => {
  const { actualFieldName, uniqueValue } = getUniqueField(extractedData, mainTab, docSubCategory);

  console.log(`DEBUG: UploadModal checkForDuplicates - Using actual field '${actualFieldName}' with value:`, uniqueValue);

  const duplicateChecks = [];

  if (uniqueValue && actualFieldName && typeof uniqueValue === 'string' && uniqueValue.trim()) {
    try {
      const { data: existingDocs, error } = await supabase
        .from('acc_portal_directors_documents')
        .select('id, file_path, extracted_details')
        .eq('director_id', parseInt(personId, 10))
        .eq('document_id', docId)
        .ilike(`extracted_details->>${actualFieldName}`, `%${uniqueValue.trim()}%`);

      if (error) {
        console.error(`Error checking duplicates for ${actualFieldName}:`, error);
        return duplicateChecks;
      }

      if (existingDocs && existingDocs.length > 0) {
        const fieldDisplayName = actualFieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        duplicateChecks.push({
          field: actualFieldName,
          value: uniqueValue.trim(),
          existingDocCount: existingDocs.length,
          fieldDisplayName: fieldDisplayName
        });
      }
    } catch (error) {
      console.error(`Error in duplicate check for ${actualFieldName}:`, error);
    }
  }

  return duplicateChecks;
};


// [UPDATED] - Always runs all checks and provides a single consolidated report.
const validateDocument = async (doc, validationContext) => {
  const {
    individualName,
    personId,
    docId,
    finalSelectedDoc,
    isFormContext,
    mainTab,
    docSubCategory
  } = validationContext;

  const validationIssues = [];

  // Check 1: Data Extraction
  const docHasFields = finalSelectedDoc?.fields && finalSelectedDoc.fields.length > 0;
  const hasExtractedData = doc.extractedData && Object.keys(doc.extractedData).length > 0;
  if (docHasFields && !hasExtractedData) {
    validationIssues.push({
      type: 'error',
      message: 'Critical: No data could be extracted. Please upload a clearer document.'
    });
  }

  // Check 2: Name Validation
  const nameCheck = checkNameMatch(individualName, doc.fileName, doc.extractedData);
  if (!nameCheck.match) {
    validationIssues.push({
      type: 'warning',
      message: `Warning: ${nameCheck.reason}`
    });
  }

  // Check 3: Duplicate Validation
  if (personId && docId && !isFormContext && hasExtractedData) {
    try {
      const duplicates = await checkForDuplicates(personId, docId, doc.extractedData, mainTab, docSubCategory);
      if (duplicates.length > 0) {
        const duplicateMessages = duplicates.map(dup => `${dup.fieldDisplayName}: ${dup.value}`).join(', ');
        validationIssues.push({
          type: 'error',
          message: `Critical: A duplicate document already exists for this person with the same ${duplicateMessages}.`
        });
      }
    } catch (error) {
      validationIssues.push({
        type: 'warning',
        message: 'Warning: Could not verify if this document already exists.'
      });
    }
  }

  // --- Generate Final Report ---
  if (validationIssues.length === 0) {
    return { status: 'valid', message: 'Document passed all checks.' };
  }

  const hasError = validationIssues.some(issue => issue.type === 'error');
  const finalStatus = hasError ? 'error' : 'warning';
  const consolidatedReport = validationIssues.map(issue => issue.message).join(' \n');

  return {
    status: finalStatus,
    message: consolidatedReport,
  };
};

export function UploadModal({
  isOpen,
  onClose,
  onUpload,
  documentName,
  documentFields = [],
  documentType = '',
  entityId,
  entityName,
  selectedDoc,
  selectedMember,
  isFormContext = false,
  onDocumentReady,
  isAllKepUpload = false,
  permitClassOptions = [],
  allDocumentTypes = [],
  mainTab,
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
  }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [validationDialog, setValidationDialog] = useState({
    isOpen: false,
    title: '',
    description: '',
    type: 'warning',
    onConfirm: null
  });
  const [finalSelectedDoc, setFinalSelectedDoc] = useState(selectedDoc);

  useEffect(() => {
    setFinalSelectedDoc(selectedDoc);
    setUploadedDocs([]);
  }, [isOpen, selectedDoc]);

  const individualName = useMemo(() => {
    return selectedMember?.full_name || selectedMember?.name || entityName || 'New Individual';
  }, [entityName, selectedMember]);

  const personId = useMemo(() => {
    return selectedMember?.id || entityId;
  }, [selectedMember, entityId]);

  const docId = useMemo(() => {
    return finalSelectedDoc?.id;
  }, [finalSelectedDoc]);

  const handleFileUpload = async (files: File[]) => {
    if (isAllKepUpload && !finalSelectedDoc) {
      toast.error("Please select a Permit Type before uploading files.");
      return;
    }
    const fileArray = Array.isArray(files) ? files : [files];
    if (!fileArray.length) return;

    const newDocs = fileArray.map(file => ({
      id: generateDocumentId(),
      file,
      fileUrl: URL.createObjectURL(file),
      extractedData: {},
      status: 'pending',
      fileName: file.name,
      validationStatus: 'pending' as const,
      validationMessage: 'Processing...'
    }));
    setUploadedDocs(prev => [...prev, ...newDocs]);

    const validationContext = {
      individualName,
      personId,
      docId,
      finalSelectedDoc,
      isFormContext,
      mainTab,
      docSubCategory: finalSelectedDoc?.sub_main_category
    };

    try {
      const processedDocsPromises = newDocs.map(async (doc) => {
        const extractionToastId = toast.loading(`Extracting from ${doc.fileName}...`);
        try {
          const { extractedData, success } = await performExtraction(
            doc.fileUrl, finalSelectedDoc?.fields || [], documentType,
            (progressMessage) => toast.loading(`${doc.fileName}: ${progressMessage}`, { id: extractionToastId }),
          );

          const parsedData = typeof extractedData === 'string' ? JSON.parse(extractedData) : extractedData || {};
          const docWithData = { ...doc, extractedData: parsedData, status: success ? 'valid' : 'pending' };

          toast.success(`Extracted from ${doc.fileName}`, { id: extractionToastId });

          const validation = await validateDocument(docWithData, validationContext);

          return {
            ...docWithData,
            validationStatus: validation.status,
            validationMessage: validation.message,
          };

        } catch (error) {
          toast.error(`Extraction failed for ${doc.fileName}`, { id: extractionToastId });
          return {
            ...doc,
            validationStatus: 'error' as const,
            validationMessage: 'Extraction failed.',
          };
        }
      });

      const fullyProcessedDocs = await Promise.all(processedDocsPromises);
      setUploadedDocs(prev => prev.map(oldDoc => fullyProcessedDocs.find(pd => pd.id === oldDoc.id) || oldDoc));

    } catch (error) {
      toast.error('An error occurred while processing files.');
    }
  };

  const handleReExtract = async (docIdToReExtract: string) => {
    const docToUpdate = uploadedDocs.find(d => d.id === docIdToReExtract);
    if (!docToUpdate) return;

    setUploadedDocs(prevDocs =>
      prevDocs.map(d =>
        d.id === docIdToReExtract ? { ...d, validationStatus: 'pending', validationMessage: 'Re-extracting...' } : d
      )
    );

    const extractionToastId = toast.loading(`Re-extracting from ${docToUpdate.fileName}...`);
    const validationContext = {
      individualName, personId, docId, finalSelectedDoc, isFormContext, mainTab,
      docSubCategory: finalSelectedDoc?.sub_main_category
    };

    try {
      const { extractedData, success } = await performExtraction(
        docToUpdate.fileUrl, finalSelectedDoc?.fields || [], documentType,
        (progressMessage) => toast.loading(`${docToUpdate.fileName}: ${progressMessage}`, { id: extractionToastId }),
      );
      const newExtractedData = typeof extractedData === 'string' ? JSON.parse(extractedData) : extractedData || {};
      const updatedDocForValidation = { ...docToUpdate, extractedData: newExtractedData, status: success ? 'valid' : 'pending' };

      toast.success(`Re-extracted from ${docToUpdate.fileName}`, { id: extractionToastId });

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
      toast.error(`Re-extraction failed for ${docToUpdate.fileName}`, { id: extractionToastId });
      setUploadedDocs(prevDocs =>
        prevDocs.map(d =>
          d.id === docIdToReExtract ? { ...d, validationStatus: 'error', validationMessage: 'Re-extraction failed.' } : d
        )
      );
    }
  };


  const handleSaveUploads = async () => {
    if (uploadedDocs.length === 0) {
      toast.error('Please upload at least one document.');
      return;
    }

    const docsWithErrors = uploadedDocs.filter(doc => doc.validationStatus === 'error');
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

    const docsWithWarnings = uploadedDocs.filter(doc => doc.validationStatus === 'warning');
    if (docsWithWarnings.length > 0) {
      const warningMessage = docsWithWarnings.map(d => `${d.fileName}: ${d.validationMessage}`).join(' \n\n');
      setValidationDialog({
        isOpen: true,
        title: 'Validation Warnings',
        description: `Potential issues were detected: \n\n${warningMessage} \n\nProceed with upload?`,
        type: 'warning',
        onConfirm: () => proceedWithUpload()
      });
      return;
    }

    await proceedWithUpload();
  };

  const proceedWithUpload = async () => {
    setIsUploading(true);
    try {
      const filesToUpload = uploadedDocs.map(doc => ({
        file: doc.file,
        extractedData: doc.extractedData,
      }));

      await onUpload({ files: filesToUpload }, finalSelectedDoc);
      onClose();

    } catch (error) {
      toast.error('Failed to save documents.');
    } finally {
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='max-w-7xl'>
        <DialogHeader>
          <DialogTitle>
            Upload <span className='uppercase'>{finalSelectedDoc?.display_name || documentName}</span> for {individualName}
          </DialogTitle>
        </DialogHeader>

        {isAllKepUpload && (
          <div className="my-4">
            <Label htmlFor="permit-type" className="font-semibold">Permit Type</Label>
            <select
              id="permit-type"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
              onChange={(e) => {
                const selectedValue = e.target.value;
                const foundDoc = allDocumentTypes.find(d => d.id === selectedValue);
                setFinalSelectedDoc(foundDoc);
              }}
              defaultValue=""
            >
              <option value="" disabled>-- Select a Permit Type --</option>
              {permitClassOptions.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.value}</option>
              ))}
            </select>
          </div>
        )}

        <FileUpload onFilesSelected={handleFileUpload} />

        {uploadedDocs.length > 0 && (
          <>
            <div className="mt-4 h-[60vh] overflow-y-auto space-y-6">
              <h4 className="font-medium mb-2">Preview Uploads</h4>
              {uploadedDocs.map((doc) => (
                <div key={doc.id} className={`relative rounded-lg p-4 border ${getValidationColor(doc.validationStatus)}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      {getValidationIcon(doc.validationStatus)}
                      <span className="text-xs font-medium">{doc.validationStatus.charAt(0).toUpperCase() + doc.validationStatus.slice(1)}</span>
                    </div>
                    <div className="flex items-center">
                      <Button
                        variant="ghost" size="sm" title="Re-extract"
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                        onClick={() => handleReExtract(doc.id)}
                      >
                        <RotateCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" title="Remove"
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

                  <ExtractionPreview
                    extractedData={doc.extractedData || {}}
                    fields={finalSelectedDoc?.fields || []}
                    fileUrl={doc.fileUrl}
                    fileName={doc.fileName}
                    expanded={true}
                    showSaveButton={false}
                    onDataChange={(fieldName, value) => {
                      setUploadedDocs(prevDocs => prevDocs.map(d =>
                        d.id === doc.id ? { ...d, extractedData: { ...d.extractedData, [fieldName]: value } } : d
                      ));
                    }}
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={handleSaveUploads} disabled={isUploading}>
                {isUploading ? 'Saving...' : `Save ${uploadedDocs.length} Document(s)`}
              </Button>
            </DialogFooter>
          </>
        )}

        <ValidationDialog {...validationDialog} onClose={() => setValidationDialog({ ...validationDialog, isOpen: false })} />
      </DialogContent>
    </Dialog>
  )
}