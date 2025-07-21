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
  onSave?: (stageId: string, taskId: string, value: string) => Promise<void> | void
  onDocumentUpload?: (task: any, stage: any) => void
  onShowDocuments?: (doc: any) => void
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

// Helper function to filter documents for a specific stage and director
const filterDocumentsForStage = (documents: any[], directorId: number | string, stageDocuments: any[]): any[] => {
  if (!documents || documents.length === 0) return [];

  // Get all kycIds from stage documents
  const stageKycIds = stageDocuments?.map(doc => doc.kycId) || [];

  // Filter documents that match both director_id and kycId
  return documents.filter(doc => {
    const matchesDirector = doc.director_id === directorId;
    const matchesKycId = stageKycIds.includes(doc.document_id || doc.kyc_document_id);
    return matchesDirector && matchesKycId;
  });
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
  const [hasDocuments, setHasDocuments] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [stageDate, setStageDate] = useState('');
  const [cachedDocuments, setCachedDocuments] = useState<any[]>([]);
  const [kycDocumentData, setKycDocumentData] = useState<any>(null);
  const [isOldDocument, setIsOldDocument] = useState(false); // New state for old document detection
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

  // Update preview document when dialog opens or document data changes
  useEffect(() => {
    if (!isPreviewOpen) return;

    const buildPreviewDocument = async () => {
      console.log('--- Building preview document ---');
      console.log('Task:', { id: task.id, name: task.name });
      console.log('Stage:', { id: stage.id, name: stage.name });

      // Get the director_id from the task
      const directorId = task.individual_id;
      if (!directorId) {
        console.log('No director ID found in task');
        return null;
      }

      // Get the most recent document from allDocuments
      const stageDocuments = filterDocumentsForStage(allDocuments, directorId, stage.documents || []);
      console.log('Found stage documents:', stageDocuments);

      if (!stageDocuments.length) {
        console.log('No documents found for stage');
        return null;
      }

      const doc = stageDocuments[0];

      // Check if document has indicator - if so, don't show preview
      if (doc.indicator === true) {
        console.log('Document has indicator, skipping preview');
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
        isDocumentOlderThanTask(doc.created_at, task.created_at);

      if (isOldDoc) {
        console.log('Document is older than task creation, skipping preview');
        toast({
          title: 'Preview not available',
          description: 'Document is older than task creation - preview disabled.',
          variant: 'default',
        });
        setIsPreviewOpen(false);
        return null;
      }

      // Get the KYC document data using the document_id (which should match kycId)
      const kycId = doc.document_id;
      if (!kycId) {
        console.log('No KYC ID found in document');
        return null;
      }

      // Fetch KYC document data
      const kycData = await fetchKycDocumentData(kycId);
      if (!kycData) {
        console.log('No KYC data found');
        return null;
      }

      console.log('KYC Data:', kycData);
      console.log('Raw document data:', doc);

      // Use KYC document display_name or name, not stage document name
      const documentName = kycData.display_name || kycData.name || 'Document';

      // Format the file path and URL
      const bucketName = 'kyc-documents';
      const filePath = doc.file_path?.startsWith(bucketName)
        ? doc.file_path
        : `${bucketName}/${doc.file_path}`;

      const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
      const fileName = doc.file_path?.split('/').pop() || documentName;
      const fileType = fileName.split('.').pop()?.toLowerCase() || 'pdf';

      // Get KYC fields from the KYC document data (not from stage documents)
      const kycFields = kycData.fields || [];

      console.log('KYC Fields from KYC document:', kycFields);

      // Transform KYC fields to the expected format
      const transformKycFields = (fields: any[]): any[] => {
        if (!Array.isArray(fields)) return []

        return fields.map((field: any) => {
          const isArray = field.type === 'array' || field.isArray === true

          const transformedField: any = {
            id: field.id || field.fieldName || '',
            fieldName: field.name || field.fieldName || '',
            description: field.description || '',
            isRequired: field.isRequired !== false,
            fieldType: isArray ? 'array' : (field.type || field.fieldType || 'text'),
            parentField: field.parentField,
            isArray: isArray,
          }

          if (isArray && field.arrayConfig && Array.isArray(field.arrayConfig.fields)) {
            transformedField.arrayConfig = {
              maxItems: field.arrayConfig.maxItems,
              fields: transformKycFields(field.arrayConfig.fields)
            }
          }

          return transformedField
        })
      };

      // Map KYC fields to the expected format
      const fields = transformKycFields(kycFields).map((field: any) => ({
        id: field.id || field.fieldName,
        name: field.fieldName,
        type: field.fieldType,
        required: field.isRequired,
        description: field.description,
        isArray: field.isArray,
        arrayConfig: field.arrayConfig
      }));

      // Prepare extracted data, ensuring all fields have values
      const extractedData = { ...(doc.extracted_details || {}) };
      console.log('Extracted data from document:', extractedData);

      // Ensure all fields have values, using empty strings for missing ones
      fields.forEach((field: any) => {
        if (extractedData[field.id] === undefined) {
          extractedData[field.id] = '';
        }
      });

      const previewData = {
        documentId: doc.id,
        documentName: documentName, // Use KYC document name
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

  // Helper function to find matching document in cache
  const findMatchingDocument = (documentId: string, directorId: string): any => {
    return cachedDocuments.find(doc =>
      doc.document_id === documentId &&
      doc.director_id === directorId
    );
  };

  // Initialize documents using passed allDocuments - Updated to handle old documents
  useEffect(() => {
    const directorId = task.individual_id;
    if (!directorId) {
      return;
    }

    // Process KYC fields for the stage documents
    const processStageDocuments = async () => {
      const stageDocuments = filterDocumentsForStage(allDocuments, directorId, stage.documents || []);


      if (stageDocuments.length > 0) {
        const mostRecentDoc = stageDocuments[0];

        // Check if document is older than task creation
        const isOldDoc = task.created_at &&
          isDocumentOlderThanTask(mostRecentDoc.created_at, task.created_at);

        setIsOldDocument(isOldDoc);

        // Only set hasDocuments to true if document doesn't have indicator AND is not old
        setHasDocuments(!mostRecentDoc.indicator && !isOldDoc);

        // Extract date from most recent document only if no indicator AND not old
        if (!mostRecentDoc.indicator && !isOldDoc) {
          const dateFields = ['application_date', 'date', 'upload_date', 'created_date', 'date_generated', 'invoice_date_and_time'];
          for (const field of dateFields) {
            if (mostRecentDoc.extracted_details && mostRecentDoc.extracted_details[field]) {
              setStageDate(mostRecentDoc.extracted_details[field]);
              break;
            }
          }
        } else {
          // Clear stage date if document has indicator or is old
          setStageDate('');
        }
      } else {

        setHasDocuments(false);
        setIsOldDocument(false);
        setStageDate('');
      }
    };

    processStageDocuments();
  }, [allDocuments, task.individual_id, task.created_at, stage.documents, requiresUpload]);

  // Get extracted date from passed documents - Updated to handle old documents
  const getExtractedDate = (): string => {
    // Get extracted date for stage
    const stageId = stage.id;
    const individualId = task.individual_id;

    if (!allDocuments.length) {
      return '';
    }

    const stageDocuments = filterDocumentsForStage(allDocuments, task.individual_id, stage.documents || []);


    if (!stageDocuments.length) {
      return '';
    }

    const mostRecentDoc = stageDocuments[0];

    // Don't extract date if document has indicator
    if (mostRecentDoc.indicator) {
      console.log('Document has indicator, skipping date extraction');
      return '';
    }

    // Check if document is older than task creation
    const isOldDoc = task.created_at &&
      isDocumentOlderThanTask(mostRecentDoc.created_at, task.created_at);

    if (isOldDoc) {
      console.log('Document is older than task creation, skipping date extraction');
      return '';
    }

    const dateFields = ['application_date', 'date', 'upload_date', 'created_date', 'date_generated', 'invoice_date_and_time'];

    if (mostRecentDoc.extracted_details) {
      console.log('Document details:', mostRecentDoc.extracted_details);
      for (const field of dateFields) {
        if (mostRecentDoc.extracted_details[field]) {
          console.log('Found date in field:', field, mostRecentDoc.extracted_details[field]);
          return mostRecentDoc.extracted_details[field];
        }
      }
    }
    console.log('No date found in document details');
    return '';
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

      console.log('About to save stage:', {
        stageId: stage.id,
        stageName: stage.name,
        taskId: task.id,
        formattedDate,
        editValue
      });

      setIsLoading(true);
      await onSave(stage.id, task.id, formattedDate);

      // After successful save, trigger a refetch of the table data
      try {
        const response = await fetch('/api/tasks'); // Adjust the API endpoint as needed
        if (!response.ok) {
          throw new Error('Failed to refresh task data');
        }
        const data = await response.json();
        console.log('Task data refreshed successfully');
      } catch (fetchError) {
        console.error('Error refreshing task data:', fetchError);
        // Don't show error toast to user as the main operation was successful
      }

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

  // Updated handleViewDocument to prevent viewing old documents
  const handleViewDocument = useCallback((e?: React.MouseEvent) => {
    console.log('--- handleViewDocument called ---');
    e?.stopPropagation();

    // Get the director_id from the task
    const directorId = task.individual_id;
    console.log('Director ID:', directorId);

    if (!directorId) {
      console.error('No director ID found in task');
      toast({
        title: 'Error',
        description: 'No director associated with this task',
        variant: 'destructive',
      });
      return;
    }

    // Check if we have documents for this stage
    const stageDocuments = filterDocumentsForStage(allDocuments, directorId, stage.documents || []);
    console.log('Stage documents found:', stageDocuments);

    if (!stageDocuments.length) {
      console.log('No documents found for stage');
      toast({
        title: 'No documents found',
        description: 'There are no documents available for preview.',
        variant: 'default',
      });
      return;
    }

    // Check if document has indicator
    const doc = stageDocuments[0];
    if (doc.indicator === true) {
      console.log('Document has indicator, cannot preview');
      toast({
        title: 'Preview not available',
        description: 'Document preview is not available for this document.',
        variant: 'default',
      });
      return;
    }

    // Check if document is older than task creation
    const isOldDoc = task.created_at &&
      isDocumentOlderThanTask(doc.created_at, task.created_at);

    if (isOldDoc) {
      console.log('Document is older than task creation, cannot preview');
      toast({
        title: 'Preview not available',
        description: 'Document is older than task creation - preview disabled.',
        variant: 'default',
      });
      return;
    }

    console.log('Opening preview dialog');
    setIsPreviewOpen(true);

    // Update stage date with extracted date if available (only if not old)
    console.log('Document details:', doc);

    const dateFields = ['application_date', 'date', 'upload_date', 'created_date'];
    for (const field of dateFields) {
      if (doc.extracted_details && doc.extracted_details[field]) {
        console.log(`Found date field '${field}':`, doc.extracted_details[field]);
        setStageDate(doc.extracted_details[field]);
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
              {/* Only show Eye button if document exists, has no indicator, and is not old */}
              {hasDocuments && !isOldDocument && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-green-600 hover:bg-green-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewDocument(e);
                  }}
                  title="View document"
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
            {/* Show date only if document is not old and has no indicator */}
            {hasDocuments && !isOldDocument && stageDate && (
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
                    // Handle data changes if needed
                    console.log(`Field ${fieldName} changed to:`, value);
                  }}
                  onSave={() => {
                    console.log("Saving document data...");
                    // Add save logic here
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