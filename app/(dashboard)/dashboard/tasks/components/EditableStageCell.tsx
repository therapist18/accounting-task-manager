// @ts-nocheck
"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import ExtractionPreview from "@/components/ExtractionPreview"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Upload, Calendar, Check, X, Clock, CheckCircle, FileText, Eye, AlertTriangle } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { format, parse, isValid } from "date-fns"

interface EditableStageCellProps {
  stage: any
  task: any
  value?: string | null
  onSave?: (
    stageId: string,
    taskId: string,
    value: string,
    updatedExtractedDetails?: Record<string, any>
  ) => Promise<void> | void
  onDocumentUpload?: (task: any, stage: any) => void
  onShowDocuments?: (task: any, stage: any) => void
  getKycFields?: (documentConfig: any) => Promise<any[]>
  allDocuments?: any[]
}

// Helper function to check if document is older than task creation
const isDocumentOlderThanTask = (documentDate: string, taskDate: string): boolean => {
  try {
    const docDate = new Date(documentDate)
    const tskDate = new Date(taskDate)
    return docDate < tskDate
  } catch (error) {
    console.error('Error comparing dates:', error)
    return false
  }
}

// Helper function to get LINKED document for a stage
const getLinkedDocumentForStage = (task: any, stage: any, allDocuments: any[]): any | null => {
  const linkedDocumentData = task.source_document_id?.[stage.id];

  if (linkedDocumentData) {
    const documentId = typeof linkedDocumentData === 'string'
      ? linkedDocumentData
      : linkedDocumentData.id;
    // Find the document instance from allDocuments by its unique ID
    const linkedDoc = allDocuments.find(doc => doc.id === documentId);
    return linkedDoc || null;
  }
  return null;
};

export default function EditableStageCell({
  stage,
  task,
  value,
  onSave,
  onDocumentUpload,
  onShowDocuments,
  getKycFields,
  allDocuments = []
}: EditableStageCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [isLoading, setIsLoading] = useState(false);
  const [hasLinkedDocument, setHasLinkedDocument] = useState(false); // UPDATED: Track linked documents only
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [stageDate, setStageDate] = useState('');
  const [kycDocumentData, setKycDocumentData] = useState<any>(null);
  const [isOldDocument, setIsOldDocument] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requiresUpload = stage.documents && stage.documents.length > 0;

  // Fetch KYC document data - Updated to include display_name
  const fetchKycDocumentData = useCallback(async (kycId: string) => {
    try {
      const { data, error } = await supabase
        .from('acc_portal_kyc')
        .select('id, fields, name, display_name, document_type')
        .eq('id', kycId)
        .single();

      if (error) throw error;

      console.log('Fetched KYC document data:', data);
      setKycDocumentData(data);
      return data;
    } catch (error) {
      console.error('Error fetching KYC document:', error);
      return null;
    }
  }, []);

  // Function to process extracted data and ensure proper date handling for arrays
  const processExtractedData = (data: any, fields: any[]): any => {
    if (!data || typeof data !== 'object') return data;

    const result = { ...data };

    // Process each field
    fields.forEach(field => {
      const fieldId = field.id || field.fieldName;

      // Handle array fields
      if (field.isArray && Array.isArray(result[fieldId])) {
        // Process each item in the array
        result[fieldId] = result[fieldId].map((item: any) => {
          if (field.arrayConfig?.fields) {
            // Recursively process nested fields
            return processExtractedData(item, field.arrayConfig.fields);
          }
          return item;
        });
      }
      // Handle nested objects
      else if (typeof result[fieldId] === 'object' && result[fieldId] !== null) {
        result[fieldId] = processExtractedData(result[fieldId], field.fields || []);
      }
    });

    return result;
  };

  // Update preview document when dialog opens or document data changes
  useEffect(() => {
    if (!isPreviewOpen) return;

    const buildPreviewDocument = async () => {
      const linkedDoc = getLinkedDocumentForStage(task, stage, allDocuments);

      if (!linkedDoc) {
        setIsPreviewOpen(false);
        toast({
          title: 'No Linked Document',
          description: 'No document has been linked for this stage yet.',
          variant: 'default',
        });
        return null;
      }

      // Check if document has indicator - if so, don't show preview
      if (linkedDoc.indicator === true) {
        toast({
          title: 'Preview not available',
          description: 'Document preview is not available for this document.',
          variant: 'default',
        });
        setIsPreviewOpen(false);
        return null;
      }

      // Check if document is older than task creation - if so, don't show preview
      const isOldDoc = task.created_at &&
        isDocumentOlderThanTask(linkedDoc.created_at, task.created_at);

      if (isOldDoc) {
        toast({
          title: 'Preview not available',
          description: 'Document is older than task creation - preview disabled.',
          variant: 'default',
        });
        setIsPreviewOpen(false);
        return null;
      }

      // Get the KYC document data using the document_id (which should match kycId)
      const kycId = linkedDoc.document_id;
      if (!kycId) {
        return null;
      }

      // Fetch KYC document data
      const kycData = await fetchKycDocumentData(kycId);
      if (!kycData) {
        console.log('No KYC data found');
        return null;
      }

      console.log('KYC Data:', kycData);
      console.log('Raw document data:', linkedDoc);

      // Use KYC document display_name or name, not stage document name
      const documentName = kycData.display_name || kycData.name || 'Document';

      // Format the file path and URL
      const bucketName = 'kyc-documents';
      const filePath = linkedDoc.file_path?.startsWith(bucketName)
        ? linkedDoc.file_path
        : `${bucketName}/${linkedDoc.file_path}`;

      const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
      const fileName = linkedDoc.file_path?.split('/').pop() || documentName;
      const fileType = fileName.split('.').pop()?.toLowerCase() || 'pdf';

      // Get KYC fields from the KYC document data (not from stage documents)
      const kycFields = kycData.fields || [];

      // Transform KYC fields to the expected format
      const transformKycFields = (fields: any[]): any[] => {
        if (!Array.isArray(fields)) return [];

        return fields.map((field: any) => {
          const isArray = field.type === 'array' || field.isArray === true;

          const transformedField: any = {
            id: field.id || field.fieldName || '',
            fieldName: field.name || field.fieldName || '',
            description: field.description || '',
            isRequired: field.isRequired !== false,
            fieldType: isArray ? 'array' : (field.type || field.fieldType || 'text'),
            parentField: field.parentField,
            isArray: isArray,
            fields: field.fields ? transformKycFields(field.fields) : undefined,
          };

          if (isArray && field.arrayConfig && Array.isArray(field.arrayConfig.fields)) {
            transformedField.arrayConfig = {
              maxItems: field.arrayConfig.maxItems,
              fields: transformKycFields(field.arrayConfig.fields)
            };
          }

          return transformedField;
        });
      };

      // Map KYC fields to the expected format
      const fields = transformKycFields(kycFields).map((field: any) => ({
        id: field.id || field.fieldName,
        name: field.fieldName,
        type: field.fieldType,
        required: field.isRequired,
        description: field.description,
        isArray: field.isArray,
        arrayConfig: field.arrayConfig,
        fields: field.fields || []
      }));

      // Prepare extracted data
      const rawExtractedData = linkedDoc.extracted_details || {};

      // Process the extracted data to handle arrays and nested fields
      const processedExtractedData = processExtractedData(rawExtractedData, fields);

      // Ensure all fields have values, using empty strings for missing ones
      const extractedData = { ...processedExtractedData };
      fields.forEach((field: any) => {
        if (extractedData[field.id] === undefined) {
          extractedData[field.id] = field.isArray ? [] : '';
        }
      });

      const previewData = {
        documentId: linkedDoc.id,
        documentName: documentName,
        fileUrl,
        fileName,
        extractedData,
        fields,
        type: kycData.documentType || 'document',
        file: {
          name: fileName,
          type: fileType,
          url: fileUrl
        }
      };

      console.log('Final preview data being passed to ExtractionPreview:', previewData);
      setPreviewDocument(previewData);
    };

    buildPreviewDocument();
  }, [isPreviewOpen, task, stage, allDocuments, fetchKycDocumentData]);

  // Reset preview document when dialog closes
  useEffect(() => {
    if (!isPreviewOpen) {
      setPreviewDocument(null);
    }
  }, [isPreviewOpen]);

  // UPDATED: Initialize documents using LINKED documents only
  useEffect(() => {
    const linkedDoc = getLinkedDocumentForStage(task, stage, allDocuments);

    if (linkedDoc) {
      const isOldDoc = task.created_at &&
        isDocumentOlderThanTask(linkedDoc.created_at, task.created_at);

      setIsOldDocument(isOldDoc);
      const hasValidDocument = !linkedDoc.indicator && !isOldDoc;
      setHasLinkedDocument(hasValidDocument);

      if (hasValidDocument) {
        const dateFields = [
          'application_date', 'date', 'upload_date', 'created_date',
          'date_and_time_generated', 'invoice_date_and_time', 'With_Effect_From',
          'Expiry_Date', 'Date_of_Issue'
        ];

        if (linkedDoc.extracted_details) {
          const foundDate = findDateInObject(linkedDoc.extracted_details, dateFields);
          if (foundDate) {
            setStageDate(foundDate);
            return;
          }
        }
      }
      setStageDate('');
    } else {
      setHasLinkedDocument(false);
      setIsOldDocument(false);
      setStageDate('');
    }
  }, [allDocuments, task.individual_id, task.created_at, task.source_document_id, stage.id, stage.documents, requiresUpload]);

  // Helper function to find a date in an object, including nested arrays
  const findDateInObject = (obj: any, dateFields: string[]): string | null => {
    if (!obj || typeof obj !== 'object') return null;

    // First try direct fields
    for (const field of dateFields) {
      if (obj[field]) {
        return obj[field];
      }
    }

    // Then check array fields
    for (const key in obj) {
      if (Array.isArray(obj[key]) && obj[key].length > 0) {
        // Check first item in array (most recent)
        if (typeof obj[key][0] === 'object') {
          const dateInArray = findDateInObject(obj[key][0], dateFields);
          if (dateInArray) return dateInArray;
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        // Check nested objects
        const dateInNested = findDateInObject(obj[key], dateFields);
        if (dateInNested) return dateInNested;
      }
    }
    return null;
  };

  const isEnquiryStage = stage.name === 'Enquiry';
  const isConfirmationStage = stage.name === 'Confirmation';

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    // Set initial edit value when stageDate changes
    if (stageDate && stageDate !== 'NaN/NaN/NaN') {
      // Convert DD/MM/YYYY to YYYY-MM-DD for the date input
      const dateParts = stageDate.split('/');
      if (dateParts.length === 3) {
        const [day, month, year] = dateParts;
        if (!isNaN(Number(day)) && !isNaN(Number(month)) && !isNaN(Number(year))) {
          const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          setEditValue(isoDate);
          return;
        }
      }
    }
    setEditValue('');
  }, [stageDate]);

  const createDateFromInput = (dateString: string): Date | null => {
    if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return null;
    }

    const [year, month, day] = dateString.split('-').map(Number);

    // Validate date components
    if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    // Create date in local timezone to avoid UTC conversion issues
    const date = new Date(year, month - 1, day);

    // Verify the date is valid and matches what we expected
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }

    return date;
  };

  const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return '';

    // Try to parse various date formats
    const date = parse(dateStr, 'dd/MM/yyyy', new Date());
    if (isValid(date)) {
      return format(date, 'dd/MM/yyyy');
    }

    // Try ISO format
    const isoDate = parse(dateStr, 'yyyy-MM-dd', new Date());
    if (isValid(isoDate)) {
      return format(isoDate, 'dd/MM/yyyy');
    }

    return dateStr;
  };

  // Function to update a date in a nested object/array structure
  const updateDateInNestedObject = (obj: any, path: string[], value: string): any => {
    if (!obj || !path.length) return obj;

    const [current, ...rest] = path;

    // If we're at the target path, update the value
    if (rest.length === 0) {
      return { ...obj, [current]: value };
    }

    // Handle arrays
    if (Array.isArray(obj[current])) {
      // For array fields, we'll update the first item by default
      // You might want to enhance this to handle specific array indices
      const updatedArray = [...obj[current]];
      if (updatedArray.length > 0) {
        updatedArray[0] = updateDateInNestedObject(updatedArray[0], rest, value);
      }
      return { ...obj, [current]: updatedArray };
    }

    // Handle nested objects
    if (obj[current] && typeof obj[current] === 'object') {
      return {
        ...obj,
        [current]: updateDateInNestedObject(obj[current], rest, value)
      };
    }

    return obj;
  };

  const handleSave = async () => {
    if (!onSave) {
      console.error('onSave function is not provided');
      toast({
        title: "Error",
        description: "Cannot save stage: Save handler not available",
        variant: "destructive"
      });
      return;
    }

    if (!editValue.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid date",
        variant: "destructive"
      });
      return;
    }

    try {
      const dateObj = createDateFromInput(editValue);

      if (!dateObj || !isValid(dateObj)) {
        throw new Error('Invalid date format');
      }

      const formattedDate = format(dateObj, 'dd/MM/yyyy');

      // UPDATED: Find the LINKED document to update
      const linkedDoc = getLinkedDocumentForStage(task, stage, allDocuments);

      let updatedExtractedDetails = {};

      if (linkedDoc) {
        const currentDetails = linkedDoc.extracted_details || {};

        // Try to find where the date was originally stored
        const dateFields = [
          'application_date', 'date', 'upload_date', 'created_date',
          'date_generated', 'invoice_date_and_time', 'With_Effect_From',
          'Expiry_Date', 'Date_of_Issue'
        ];

        // Find the field that contains the date
        let dateFieldPath: string[] = [];

        const findDateField = (obj: any, path: string[] = []): boolean => {
          for (const key in obj) {
            const currentPath = [...path, key];
            const value = obj[key];

            if (dateFields.includes(key) && value) {
              dateFieldPath = currentPath;
              return true;
            }

            if (value && typeof value === 'object' && !Array.isArray(value)) {
              if (findDateField(value, currentPath)) {
                return true;
              }
            } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
              // Check first item in array
              if (findDateField(value[0], [...currentPath, '0'])) {
                return true;
              }
            }
          }
          return false;
        };

        findDateField(currentDetails);

        // Update the date in the appropriate location
        if (dateFieldPath.length > 0) {
          updatedExtractedDetails = updateDateInNestedObject(
            currentDetails,
            dateFieldPath,
            formattedDate
          );
        } else {
          // If we couldn't find the original field, just update the first date field
          updatedExtractedDetails = { ...currentDetails };
          dateFields.some(field => {
            if (updatedExtractedDetails[field] !== undefined) {
              updatedExtractedDetails[field] = formattedDate;
              return true;
            }
            return false;
          });
        }
      }
      setIsLoading(true);

      await onSave(stage.id, task.id, formattedDate, updatedExtractedDetails);
      setIsEditing(false);

      toast({
        title: "Success",
        description: isConfirmationStage
          ? "Confirmation completed. Task moved to Work in Progress."
          : "Date saved successfully"
      });
    } catch (error) {
      console.error('Date save error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Please enter a valid date",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset to original stage date
    if (stageDate && stageDate !== 'NaN/NaN/NaN') {
      const dateParts = stageDate.split('/');
      if (dateParts.length === 3) {
        const [day, month, year] = dateParts;
        if (!isNaN(Number(day)) && !isNaN(Number(month)) && !isNaN(Number(year))) {
          const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          setEditValue(isoDate);
          setIsEditing(false);
          return;
        }
      }
    }
    setEditValue('');
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      handleSave();
    }
  };

  const handleDocumentUpload = () => {
    if (onDocumentUpload) {
      onDocumentUpload(task, stage);
    }
  };

  // UPDATED: Only handle view for LINKED documents
  const handleViewDocument = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();

    // UPDATED: Get LINKED document only
    const linkedDoc = getLinkedDocumentForStage(task, stage, allDocuments);

    if (!linkedDoc) {
      toast({
        title: 'No Linked Document',
        description: 'No document has been linked for this stage yet. Please use the Link button to link a document first.',
        variant: 'default',
      });
      return;
    }

    // Check if document has indicator
    if (linkedDoc.indicator === true) {
      toast({
        title: 'Preview not available',
        description: 'Document preview is not available for this document.',
        variant: 'default',
      });
      return;
    }

    // Check if document is older than task creation
    const isOldDoc = task.created_at &&
      isDocumentOlderThanTask(linkedDoc.created_at, task.created_at);

    if (isOldDoc) {
      toast({
        title: 'Preview not available',
        description: 'Document is older than task creation - preview disabled.',
        variant: 'default',
      });
      return;
    }
    setIsPreviewOpen(true);
    const dateFields = ['application_date', 'date', 'upload_date', 'created_date'];
    for (const field of dateFields) {
      if (linkedDoc.extracted_details && linkedDoc.extracted_details[field]) {
        setStageDate(linkedDoc.extracted_details[field]);
        break;
      }
    }
  }, [task, stage, allDocuments]);

  const handleClick = () => {
    if (requiresUpload) {
      handleDocumentUpload();
    } else {
      setIsEditing(true);
    }
  };

  if (isEditing && !requiresUpload) {
    return (
      <div
        className="flex items-center gap-2 min-w-[200px]"
        onBlur={handleBlur}
        tabIndex={-1}
      >
        <Input
          ref={inputRef}
          type="date"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="text-sm"
          disabled={isLoading}
        />
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-green-600 hover:text-green-800 hover:bg-green-100"
            onClick={handleSave}
            disabled={isLoading}
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-red-600 hover:text-red-800 hover:bg-red-100"
            onClick={handleCancel}
            disabled={isLoading}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  if (isEnquiryStage && stageDate && stageDate !== 'NaN/NaN/NaN') {
    return (
      <div className="flex items-center justify-center">
        <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
          <Check className="h-3 w-3 mr-1" />
          {formatDateDisplay(stageDate)}
        </Badge>
      </div>
    );
  }

  return (
    <>
      <div
        className={`flex items-center justify-center min-h-[32px] cursor-pointer hover:bg-gray-50 rounded p-1 ${requiresUpload ? 'hover:bg-blue-50' : 'hover:bg-gray-50'
          }`}
        onClick={handleClick}
      >
        {requiresUpload ? (
          <div className="flex flex-col items-center gap-1 p-1">
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-blue-600 hover:bg-blue-100"
                onClick={handleDocumentUpload}
                title="Upload document"
              >
                <Upload className="h-4 w-4" />
              </Button>
              {/* UPDATED: Only show Eye button if document is LINKED, has no indicator, and is not old */}
              {hasLinkedDocument && !isOldDocument && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-green-600 hover:bg-green-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewDocument(e);
                  }}
                  title="View linked document"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              {/* Show warning icon for old documents */}
              {isOldDocument && (
                <div className="h-8 w-8 flex items-center justify-center">
                  <AlertTriangle
                    className="h-4 w-4 text-orange-500"
                    title="Document is older than task creation - preview disabled"
                  />
                </div>
              )}
            </div>
            {/* UPDATED: Show date only if document is LINKED, not old and has no indicator */}
            {hasLinkedDocument && !isOldDocument && stageDate && (
              <div className="text-xs text-gray-600 text-center mt-1">
                {formatDateDisplay(stageDate)}
              </div>
            )}
            {/* Show "Old Document" message for old documents */}
            {isOldDocument && (
              <div className="text-xs text-orange-600 text-center mt-1">
                Old Document
              </div>
            )}
            {/* UPDATED: Show "No Linked Document" message when no document is linked */}
            {!hasLinkedDocument && !isOldDocument && (
              <div className="text-xs text-slate-500 text-center mt-1">
                No Linked Document
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {stageDate && stageDate !== 'NaN/NaN/NaN' ? (
              <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
                <Check className="h-3 w-3 mr-1" />
                {formatDateDisplay(stageDate)}
              </Badge>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-gray-600 hover:text-gray-800 hover:bg-gray-100 border border-dashed border-gray-300"
              >
                <Calendar className="h-3 w-3 mr-1" />
                {isEnquiryStage ? 'Add Enquiry Date' :
                  isConfirmationStage ? 'Add Confirmation Date' :
                    'Add Date'}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Document Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-7xl w-[95vw] h-[95vh] p-0 flex flex-col">
          {previewDocument ? (
            <div className="flex flex-col h-full">
              <DialogHeader className="p-6 pb-2">
                <DialogTitle className="text-xl">{previewDocument.documentName}</DialogTitle>
                <DialogDescription>
                  Review extracted details for {task.applicant_name || 'this document'}
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto p-6 pt-2">
                <ExtractionPreview
                  documentName={previewDocument.documentName}
                  fileUrl={previewDocument.fileUrl}
                  fileName={previewDocument.fileName}
                  extractedData={previewDocument.extractedData || {}}
                  fields={previewDocument.fields || []}
                  viewMode={true}
                  file={previewDocument.file}
                  type={previewDocument.type}
                  onDataChange={(fieldName, value) => {
                  }}
                  onSave={() => {
                    setIsPreviewOpen(false);
                    toast({ title: "Success", description: "Document details saved." });
                  }}
                  getStylesByType={(type) => ({
                    getBgColor: () => 'bg-primary',
                    getTextColor: () => 'text-primary-foreground',
                    getBorderColor: () => 'border-primary',
                    getButtonStyle: () => 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  })}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted-foreground">No document data available</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}