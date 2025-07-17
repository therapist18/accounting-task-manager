// @ts-nocheck
"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import ExtractionPreview from "@/components/ExtractionPreview"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Upload, Calendar, Check, X, Clock, CheckCircle, FileText, Eye } from "lucide-react"
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
}

export default function EditableStageCell({
  stage,
  task,
  value,
  onSave,
  onDocumentUpload,
  onShowDocuments,
  getKycFields
}: EditableStageCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasDocuments, setHasDocuments] = useState(false)
  const [previewDocument, setPreviewDocument] = useState<any>(null)
  const [stageDate, setStageDate] = useState('');
  const inputRef = useRef<HTMLInputElement>(null)

  const requiresUpload = stage.documents && stage.documents.length > 0;

  // Get extracted date from document details
  const getExtractedDate = async (): Promise<string> => {
    if (!requiresUpload || !task.individual_id || !stage.documents?.[0]?.kycId) return '';

    try {
      const { data: documents, error } = await supabase
        .from('acc_portal_directors_documents')
        .select('extracted_details')
        .eq('director_id', task.individual_id)
        .eq('document_id', stage.documents[0].kycId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (documents && documents.length > 0) {
        const doc = documents[0];
        const dateFields = ['application_date', 'date', 'upload_date', 'created_date','date_generated', 'invoice_date_and_time' ];
        
        // Check extracted details for date fields
        if (doc.extracted_details) {
          for (const field of dateFields) {
            if (doc.extracted_details[field]) {
              return doc.extracted_details[field];
            }
          }
        }
      }
      return '';
    } catch (error) {
      console.error('Error getting extracted date:', error);
      return '';
    }
  };

  // Get initial extracted date
  useEffect(() => {
    const fetchDate = async () => {
      const date = await getExtractedDate();
      setStageDate(date);
    };
    fetchDate();
  }, [task.individual_id, stage.documents, requiresUpload]);

  // Check for existing documents when component mounts or task/stage changes
  useEffect(() => {
    const checkForDocuments = async () => {
      if (!requiresUpload || !task.individual_id || !stage.documents?.[0]?.kycId) {
        setHasDocuments(false);
        return;
      }

      try {
        const { data: documents, error } = await supabase
          .from('acc_portal_directors_documents')
          .select('*')
          .eq('director_id', task.individual_id)
          .eq('document_id', stage.documents[0].kycId)

        if (!error && documents && documents.length > 0) {
          setHasDocuments(true);
        } else {
          setHasDocuments(false);
        }
      } catch (error) {
        console.error('Error checking for documents:', error);
        setHasDocuments(false);
      }
    };

    checkForDocuments();
  }, [task.individual_id, stage.documents, requiresUpload]);

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

  const handleViewDocument = useCallback(async (e?: React.MouseEvent) => {
    if (!getKycFields) {
      throw new Error('getKycFields function not provided');
    }
    try {
      // Prevent event bubbling to avoid triggering parent click handlers
      e?.stopPropagation();
      // If we already have a preview document and the dialog is open, just toggle it
      if (previewDocument) {
        setPreviewDocument(null);
        return;
      }

      // Get the director_id from the task
      const directorId = task.individual_id;
      if (!directorId) {
        throw new Error('No director associated with this task');
      }

      // Get the kycId from the stage's document configuration
      const kycId = stage.documents?.[0]?.kycId;
      if (!kycId) {
        throw new Error('No document type (kycId) configured for this stage');
      }

      // Show loading state
      toast({
        title: "Loading document...",
        description: "Please wait while we load the document",
        variant: "default"
      });

      // Fetch the document for this director and kycId
      const { data: documents, error } = await supabase
        .from('acc_portal_directors_documents')
        .select('*')
        .eq('director_id', directorId)
        .eq('document_id', kycId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (documents && documents.length > 0) {
        // Get the most recent document
        const doc = documents[0];
        const documentName = stage.documents?.[0]?.name || 'Document';
        
        // Get the document configuration for this stage
        const documentConfig = stage.documents?.[0];
        if (!documentConfig) {
          throw new Error('Document configuration not found for this stage');
        }

        // Format the file path and URL
        const bucketName = 'kyc-documents';
        const filePath = doc.file_path?.startsWith(bucketName) 
          ? doc.file_path 
          : `${bucketName}/${doc.file_path}`;
          
        const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
        const fileName = doc.file_path?.split('/').pop() || documentName;
        const fileType = fileName.split('.').pop()?.toLowerCase() || 'pdf';
        
        // Fetch KYC fields for this document type
        const kycFields = await getKycFields(documentConfig);
        
        // Map KYC fields to the expected format
        const fields = kycFields.map(field => ({
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
        
        // Ensure all fields have values, using empty strings for missing ones
        fields.forEach(field => {
          if (extractedData[field.id] === undefined) {
            extractedData[field.id] = '';
          }
        });
        
        const formattedDoc = {
          documentName: documentConfig.name || documentName,
          fileUrl,
          fileName,
          extractedData,
          fields,
          type: documentConfig.documentType || 'document',
          file: {
            name: fileName,
            type: fileType,
            url: fileUrl
          }
        };
        
        // Set the document for preview
        setPreviewDocument(formattedDoc);

        // Update stage date with extracted date
        const dateFields = ['application_date', 'date', 'upload_date', 'created_date'];
        for (const field of dateFields) {
          if (doc.extracted_details && doc.extracted_details[field]) {
            setStageDate(doc.extracted_details[field]);
            break;
          }
        }
      } else {
        toast({
          title: 'No documents found',
          description: `No ${stage.documents?.[0]?.name || 'documents'} uploaded for this stage yet.`,
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast({
        title: 'Error',
        description: `Failed to load document: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [stage, task, getKycFields]);
       

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
        className={`flex items-center justify-center min-h-[32px] cursor-pointer hover:bg-gray-50 rounded p-1 ${
          requiresUpload ? 'hover:bg-blue-50' : 'hover:bg-gray-50'
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
            {hasDocuments && (
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
          </div>
          {hasDocuments && (
            <div className="text-xs text-gray-600 text-center mt-1">
              {formatDateDisplay(stageDate)}
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
    <Dialog open={!!previewDocument} onOpenChange={(open) => {
      if (!open) setPreviewDocument(null);
    }}>
      <DialogContent className="max-w-7xl w-[95vw] h-[95vh] p-0 flex flex-col">
        {previewDocument && (
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
                extractedData={previewDocument.extractedData}
                fields={previewDocument.fields}
                onDataChange={() => {}}
                onVerify={() => {}}
                onRemoveFile={() => {}}
                isVerified={false}
                expanded={true}
                showSaveButton={false}
                type={previewDocument.type}
                file={previewDocument.file}
                viewMode={true}
                getStylesByType={(type) => ({
                  getBgColor: () => 'bg-primary',
                  getTextColor: () => 'text-primary-foreground',
                  getBorderColor: () => 'border-primary',
                  getButtonStyle: () => 'bg-primary hover:bg-primary/90 text-primary-foreground'
                })}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  </>
  );
}
