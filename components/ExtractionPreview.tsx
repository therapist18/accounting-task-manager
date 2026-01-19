// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Download, Save, Trash2, RefreshCw, Eye, FileText, AlertTriangle, ZoomIn, ZoomOut, RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Image from 'next/image'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { Textarea } from '@/components/ui/textarea';
import DocumentActions from '@/app/generic-components/DocumentActions';
// Import extraction utility
import { performExtraction } from '@/lib/extractionUtils';

// Dynamically import PDF viewer to avoid SSR issues
const PDFViewer = dynamic(() => import('@/components/PDFViewer'), { ssr: false })

interface Field {
  id: string
  name: string
  type: string
  arrayConfig?: {
    fields?: Array<{
      name: string
      type: string
    }>
  }
}

interface ExtractionPreviewProps {
  // Single document mode props
  documentName?: string;
  extractedData?: Record<string, any>;
  fields?: Field[];
  onDataChange?: (fieldName: string, value: any) => void;
  onVerify?: () => void;
  onRemoveFile?: () => void;
  onDelete?: (doc?: any) => Promise<void> | void;
  onRetryExtraction?: (doc?: any) => Promise<void> | void;
  onDownload?: (format: 'document' | 'excel' | 'pdf') => Promise<void> | void;
  onSave?: (data: Record<string, any>) => Promise<void> | void;
  documentTypes?: Array<{ id: string; name: string }>;
  isVerified?: boolean;
  fileUrl?: string;
  fileName?: string;
  expanded?: boolean;
  showSaveButton?: boolean;
  type?: string;
  file?: any;
  extractionStatus?: 'pending' | 'success' | 'failed' | 'success';
  getStylesByType?: (type: string) => {
    getBgColor: () => string;
    getTextColor: () => string;
    getBorderColor: () => string;
    getButtonStyle: () => string;
  };
  supabase?: any;
  onDownloadSuccess?: () => void;
  onDownloadError?: (error: Error) => void;
  documentId?: string;
  
  // Multiple documents mode props
  documents?: Array<{
    id: string;
    fileUrl: string;
    extractedData: Record<string, any>;
    fields: Field[];
    name: string;
    uploadedAt: string;
  }>;
  initialIndex?: number;
  onDocumentChange?: (index: number) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// --- HELPER COMPONENTS ---
const RowWrapper = ({ children, className = "", isEven = false }) => (
  <div className={`flex flex-col sm:flex-row border-b last:border-b-0 border-gray-100 ${isEven ? 'bg-white' : 'bg-gray-50/60'} hover:bg-blue-50/50 transition-colors duration-150 ${className}`}>
    {children}
  </div>
);

const LabelCell = ({ children }) => (
  <div className="w-full sm:w-[160px] flex-shrink-0 p-3 sm:border-r border-gray-100 flex items-center bg-gray-50/50 sm:bg-transparent">
    <span className="text-xs font-semibold text-gray-500 uppercase tracking-tight break-words">
      {children}
    </span>
  </div>
);

const ValueCell = ({ children }) => (
  <div className="w-full sm:flex-1 p-2 flex items-center min-w-0">
    {children}
  </div>
);
// ---------------------------------------

const DocumentPreview = ({ fileUrl, fileName, documentName }) => {
  // Enhanced file type detection for PDF and various image formats
  const getFileType = (url?: string, name?: string) => {
    const fileExtension = (url || name || '').toLowerCase();
    
    if (fileExtension.includes('.pdf')) return 'pdf';
    if (fileExtension.includes('.jpg') || fileExtension.includes('.jpeg')) return 'image';
    if (fileExtension.includes('.png')) return 'image';
    if (fileExtension.includes('.gif')) return 'image';
    if (fileExtension.includes('.bmp')) return 'image';
    if (fileExtension.includes('.webp')) return 'image';
    if (fileExtension.includes('.svg')) return 'image';
    if (fileExtension.includes('.tiff') || fileExtension.includes('.tif')) return 'image';
    
    return 'unknown';
  };

  const fileType = getFileType(fileUrl, fileName);
  const isPDF = fileType === 'pdf';
  const isImage = fileType === 'image';
  const isUnsupported = fileType === 'unknown';

  // State for image transformations
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Handlers for image controls
  const handleZoomIn = () => setZoom(prev => prev + 0.1);
  const handleZoomOut = () => setZoom(prev => Math.max(0.2, prev - 0.1));
  const handleRotateRight = () => setRotation(prev => (prev + 90) % 360);
  const handleRotateLeft = () => setRotation(prev => (prev - 90 + 360) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  useEffect(() => {
    handleReset();
  }, [fileUrl]);

  const displayUrl = fileUrl?.startsWith('blob:')
    ? fileUrl
    : fileUrl
      ? `${fileUrl}`
      : null;

  return (
    <div className="bg-white rounded-lg p-4 h-full flex flex-col border border-gray-200 shadow-sm">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">Document Preview</h3>
      {/* Container takes remaining height relative to parent */}
      <div className="relative flex-1 w-full bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
        {displayUrl ? (
          isPDF ? (
            <PDFViewer url={displayUrl} />
          ) : isImage ? (
            <>
              {/* Toolbar for images */}
              <div className="absolute top-2 right-2 z-10 bg-black/60 backdrop-blur-sm rounded-lg p-1 flex items-center space-x-1 border border-white/10 shadow-lg">
                <Button variant="ghost" size="icon" onClick={handleZoomIn} className="h-7 w-7 text-white hover:bg-white/20" title="Zoom In">
                  <ZoomIn size={16} />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleZoomOut} className="h-7 w-7 text-white hover:bg-white/20" title="Zoom Out">
                  <ZoomOut size={16} />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleRotateLeft} className="h-7 w-7 text-white hover:bg-white/20" title="Rotate Left">
                  <RotateCcw size={16} />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleRotateRight} className="h-7 w-7 text-white hover:bg-white/20" title="Rotate Right">
                  <RotateCw size={16} />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleReset} className="h-7 w-7 text-white hover:bg-white/20" title="Reset View">
                  <Undo2 size={16} />
                </Button>
              </div>

              {/* Image Container with Scrolling/Centering */}
              <div className="w-full h-full flex items-center justify-center overflow-auto bg-gray-900/5">
                <div style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.2s ease-out',
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Image
                    src={displayUrl}
                    alt={documentName || 'Document preview'}
                    fill
                    className="object-contain"
                    priority
                    onError={(e) => {
                      console.error('Image failed to load:', e);
                      // Fallback for broken images
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full flex-col gap-2">
              <FileText className="h-12 w-12 text-gray-300" />
              <span className="text-gray-400 text-sm">Unsupported file type</span>
              <span className="text-gray-500 text-xs">({fileName || 'Unknown format'})</span>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center h-full flex-col gap-2">
            <FileText className="h-12 w-12 text-gray-300" />
            <span className="text-gray-400 text-sm">No preview available</span>
          </div>
        )}
      </div>
    </div>
  );
};


export const ExtractionPreview = ({
  // Single document mode props
  documentName,
  extractedData,
  fields = [],
  onDataChange,
  onDelete,
  onRetryExtraction,
  fileUrl,
  fileName,
  expanded = false,
  showSaveButton = true,
  type,
  file,
  extractionStatus,
  getStylesByType = (type) => ({
    getBgColor: () => 'bg-white',
    getTextColor: () => 'text-gray-900',
    getBorderColor: () => 'border-gray-200',
    getButtonStyle: () => 'bg-gray-600 hover:bg-gray-700 text-white'
  }),
  documentTypes,
  onDownloadSuccess,
  onDownloadError,
  onSave,
  documentId,
  
  // Multiple documents mode props
  documents,
  initialIndex = 0,
  onDocumentChange,
  open,
  onOpenChange,
}: ExtractionPreviewProps) => {
  // Determine if we're in multiple documents mode
  const isMultiDocumentMode = !!documents && documents.length > 0;
  
  // State for current document index in multi-document mode
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  
  // Get current document data
  const currentDoc = isMultiDocumentMode ? documents[currentIndex] : null;
  
  // Use current document data if in multi-document mode, otherwise use single document props
  const currentDocumentName = isMultiDocumentMode ? currentDoc?.name : documentName;
  const currentFileUrl = isMultiDocumentMode ? currentDoc?.fileUrl : fileUrl;
  const currentFileName = isMultiDocumentMode ? currentDoc?.name : fileName;
  const currentExtractedData = isMultiDocumentMode ? currentDoc?.extractedData : extractedData;
  const currentFields = isMultiDocumentMode ? currentDoc?.fields : fields;
  const currentDocumentId = isMultiDocumentMode ? currentDoc?.id : documentId;
  
  // Use open/onOpenChange for multi-document mode, otherwise use internal state
  const [internalIsOpen, setInternalIsOpen] = useState(() => {
    return expanded;
  });
  const isOpen = isMultiDocumentMode ? (open !== undefined ? open : internalIsOpen) : internalIsOpen;
  const setIsOpen = isMultiDocumentMode ? (onOpenChange || (() => {})) : setInternalIsOpen;
  
  console.log('🔍 ExtractionPreview - Props:', {
    documentName: currentDocumentName,
    hasFileUrl: !!currentFileUrl,
    hasFields: currentFields?.length > 0,
    isMultiDocumentMode,
    totalDocuments: isMultiDocumentMode ? documents.length : 1,
    currentIndex: isMultiDocumentMode ? currentIndex : 0,
    documentId: currentDocumentId
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

 const [localData, setLocalData] = useState<Record<string, any>>({});
 const lastSyncedData = useRef(null);

 const formattedData = useMemo(() => {
  const result: Record<string, any> = {};
  const safeFields = currentFields || []; // Use currentFields instead of fields
  
  safeFields.forEach(field => {
      if (!field?.name) return;

      const fieldName = field?.name || field?.id || 'field';
      const snakeCase = fieldName
        .toString()
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => '_' + chr.toLowerCase())
        .replace(/^_/, '');

      const getNestedValue = (obj: any, path: string) => {
        return path.split('.').reduce((o, p) => o?.[p], obj);
      };

      let value = currentExtractedData[snakeCase] || // Use currentExtractedData
        currentExtractedData[field?.id] ||
        (field?.name ? currentExtractedData[field.name] : '') ||
        (field?.name ? currentExtractedData[field.name.toLowerCase()] : '') ||
        (field?.name ? getNestedValue(currentExtractedData, field.name) : '') ||
        getNestedValue(currentExtractedData, snakeCase) ||
        '';

      if (field?.name && (field.name.toLowerCase() === 'sex' || field.name.toLowerCase() === 'gender')) {
        value = value.toString().toUpperCase() === 'FEMALE' ? 'F' :
          value.toString().toUpperCase() === 'MALE' ? 'M' : value;
      } else if (field?.name?.toLowerCase() === 'surname' && value) {
        value = value.toString().toUpperCase();
      } else if (field?.name?.toLowerCase() === 'directors_and_shareholders' && Array.isArray(value)) {
        value = value.map(item => ({
          name: item.name || item.Name || '-',
          shares: item.shares || item.Shares || '-',
          address: item.address || item.Address || '-',
          description: item.description || item.Description || '-',
          nationality: item.nationality || item.Nationality || '-',
          ...item
        }));
      }

      result[field.name] = value;
    });
    return result;
  }, [currentExtractedData, currentFields]); // Use current values in dependencies

  useEffect(() => {
  // Only sync if source data reference has actually changed 
  // (e.g., parent fetched new data from DB)
  if (currentExtractedData !== lastSyncedData.current) {
    setLocalData(formattedData);
    lastSyncedData.current = currentExtractedData;
  }
}, [formattedData, currentExtractedData]); // Use currentExtractedData

  const handleFieldChange = (field: string, value: any) => {
    setLocalData(prev => ({
      ...prev,
      [field]: value
    }));
    onDataChange?.(field, value);
  };

  const handleDelete = async (docData?: any) => {
    if (!onDelete) return;

    try {
      setIsDeleting(true);

      // Create document data with proper ID handling
      const documentData = {
        file_path: currentFileUrl, // Use current values
        file_name: currentFileName,
        document_name: currentDocumentName,
        extracted_details: currentExtractedData,
        document_type: type,
        id: docData?.id || file?.id || currentDocumentId, // Use currentDocumentId
        ...(docData || {}),
        ...(file || {})
      };

      // Ensure we have a valid ID before proceeding
      if (!documentData.id) {
        throw new Error('Cannot delete document: Missing document ID');
      }

      await onDelete(documentData);
      toast.success('Document deleted successfully');
    } catch (error) {
      console.error('Error deleting document:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete document';
      toast.error(errorMessage);
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };

  // UPDATED: Now performs extraction locally if no parent handler is provided
  const handleRetryExtraction = async () => {
    // 1. If parent provided specific logic (e.g. UploadModal), yield to it
    if (onRetryExtraction) {
      try {
        setIsRetrying(true);
        await onRetryExtraction({
          fileUrl,
          fileName,
          documentName,
          extractedData,
          type,
          file,
          id: documentId
        });
      } catch (error) {
        console.error('Error in parent retry extraction:', error);
        toast.error('Failed to retry extraction');
      } finally {
        setIsRetrying(false);
      }
      return;
    }

    // 2. Local implementation (for Standalone/EditableStageCell usage)
    if (!fileUrl) {
      toast.error("No file available for extraction");
      return;
    }

    setIsRetrying(true);
    const toastId = toast.loading("Re-extracting data...");

    try {
      const { extractedData: newRawData, success } = await performExtraction(
        fileUrl,
        fields,
        documentName,
        (msg) => toast.loading(msg, { id: toastId }),
        fileName,
        type || documentId
      );

      if (!success) {
        throw new Error("Extraction service returned failure status");
      }

      // Parse JSON if returned as string (Markdown block handling)
      let parsedData = newRawData;
      if (typeof newRawData === 'string') {
        try {
          const match = newRawData.match(/```json\n([\s\S]*?)\n```/);
          parsedData = match && match[1] ? JSON.parse(match[1]) : JSON.parse(newRawData);
        } catch (e) {
          console.warn("Failed to parse extracted JSON string", e);
          parsedData = {};
        }
      }

      console.log('Parsed extraction data:', parsedData); // Debug log

      // Update Local Data and Notify Parent of Changes
      const newLocalData = { ...localData };

      // Update fields based on configuration
      fields.forEach(field => {
        const value = parsedData[field.name];
        if (value !== undefined) {
          newLocalData[field.name] = value;
          if (onDataChange) {
            onDataChange(field.name, value);
          }
        }
      });

      // Update state with the new data
      setLocalData(newLocalData);
      toast.success("Extraction complete", { id: toastId });

      // Auto-save the new results - pass the parsed data directly
      if (onSave) {
        await onSave({
          ...newLocalData,
          ...parsedData
        });
      }

    } catch (error) {
      console.error('Error in local retry extraction:', error);
      toast.error(error.message || "Extraction failed", { id: toastId });
    } finally {
      setIsRetrying(false);
    }
  };

const handleSave = async () => {
  if (!documentId && !file?.id) {
    toast.error('Cannot save: Missing document ID');
    return;
  }

  try {
    setIsSaving(true);
    const documentIdToUpdate = documentId || file?.id;

    // Prepare the data to save - merge extractedData and localData
    const dataToSave = {
      ...extractedData,
      ...localData
    };

    console.log('Saving data:', dataToSave);

    // Call the parent's onSave with the complete data
    if (onSave) {
      await onSave(dataToSave);
      
      // After successful save, fetch the updated data
      try {
        // Call your fetch function here, for example:
        // const updatedData = await fetchUpdatedDocument(documentIdToUpdate);
        // Update local state with the new data
        // setExtractedData(updatedData.extracted_details || {});
        // setLocalData(updatedData.extracted_details || {});
        
        // If you have a parent component that handles the data, you might want to call a callback
        if (onDataChange) {
          // Trigger a data refresh in the parent component
          onDataChange('refresh', null);
        }
        
        toast.success('Document updated and refreshed successfully');
      } catch (fetchError) {
        console.error('Error fetching updated data:', fetchError);
        toast.error('Document saved, but could not refresh data');
      }
      return;
    }

    // Fallback to direct database update if no parent onSave
    const { error } = await supabase
      .from('acc_portal_directors_documents')
      .update({
        extracted_details: dataToSave,
        updated_at: new Date().toISOString()
      })
      .eq('id', documentIdToUpdate);

    if (error) throw error;

    // After successful direct save, fetch the updated data
    try {
      const { data: updatedDocument, error: fetchError } = await supabase
        .from('acc_portal_directors_documents')
        .select('*')
        .eq('id', documentIdToUpdate)
        .single();

      if (fetchError) throw fetchError;

      // Update local state with the new data
      setExtractedData(updatedDocument.extracted_details || {});
      setLocalData(updatedDocument.extracted_details || {});
      
      toast.success('Document updated and refreshed successfully');
    } catch (fetchError) {
      console.error('Error fetching updated data:', fetchError);
      toast.error('Document saved, but could not refresh data');
    }
  } catch (error) {
    console.error('Error saving document:', error);
    toast.error(error.message || 'Failed to save document');
  } finally {
    setIsSaving(false);
  }
};

const renderField = (field: Field, index: number) => {
  const value = localData[field.name];
  const isEven = index % 2 === 0;

  if (Array.isArray(value)) {
    return (
      <RowWrapper key={field.id} className="items-start" isEven={isEven}>
        <LabelCell>{field?.name?.replace(/_/g, ' ') || 'Unnamed Field'}</LabelCell>
        <div className="w-full sm:flex-1 p-2">
          <div className="space-y-3">
            {value.length === 0 && <span className="text-sm text-gray-400 italic">No entries found</span>}
            {value.map((item, i) => (
              <div key={i} className="p-3 border rounded-md bg-white shadow-sm text-sm">
                {Object.entries(item).map(([key, val]) => (
                  <div key={key} className="grid grid-cols-3 gap-2 mb-1 border-b last:border-b-0 pb-1 last:pb-0 border-gray-100">
                    <span className="font-medium text-gray-500 capitalize text-xs">{key.replace(/_/g, ' ')}:</span>
                    <span className="col-span-2 text-gray-900 break-words">{String(val || '-')}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </RowWrapper>
    );
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return (
      <RowWrapper key={field.id} className="items-start" isEven={isEven}>
        <LabelCell>{field?.name?.replace(/_/g, ' ') || 'Unnamed Field'}</LabelCell>
        <div className="w-full sm:flex-1 p-2">
          <div className="p-3 border rounded-md bg-white shadow-sm">
            {Object.entries(value).map(([key, val]) => (
              <div key={key} className="grid grid-cols-3 gap-2 text-sm mb-1 border-b last:border-b-0 pb-1 last:pb-0 border-gray-100">
                <span className="font-medium text-gray-500 capitalize text-xs">{key.replace(/_/g, ' ')}:</span>
                <span className="col-span-2 text-gray-900 break-words">{String(val || '-')}</span>
              </div>
            ))}
          </div>
        </div>
      </RowWrapper>
    );
  }

  return (
    <RowWrapper key={field.id} className="items-start" isEven={isEven}>
      <LabelCell>{field?.name?.replace(/_/g, ' ') || 'Unnamed Field'}</LabelCell>
      <div className="w-full sm:flex-1 p-2">
        <span className="text-gray-900 break-words">{String(value || '-')}</span>
      </div>
    </RowWrapper>
  );
};

const content = (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
    {/* Document Preview - Fixed Height */}
    <div className="lg:col-span-2 h-[75vh]">
      <DocumentPreview
        fileUrl={currentFileUrl}
        fileName={currentFileName}
        documentName={currentDocumentName}
      />
    </div>

    {/* Extracted Data - Fixed Height with Overflow */}
    <div className="lg:col-span-1 h-[75vh] shadow-sm rounded-lg flex flex-col">
      <div className={`h-full flex flex-col rounded-lg border ${getStylesByType?.(type || 'principal')?.getBgColor() || 'bg-white'} ${getStylesByType?.(type || 'principal')?.getBorderColor() || 'border-gray-200'} overflow-hidden`}>
        {/* Header Section */}
        <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-gray-800">Extracted Details</h3>
            <div className="flex items-center space-x-2">
              <DocumentActions
                document={{
                  ...localData,
                  fileUrl: currentFileUrl,
                  fileName: currentFileName,
                  documentName: currentDocumentName,
                  type,
                  file,
                  document_display_name: currentDocumentName,
                  document_id: type,
                  extracted_details: {
                    ...currentExtractedData,
                    ...localData
                  },
                  id: file?.id || currentDocumentId,
                  file_path: currentFileUrl
                }}
                documentTypes={documentTypes || []}
                supabase={supabase}
                onSave={onSave ? handleSave : undefined}
                onDelete={onDelete ? handleDelete : undefined}
                onRetry={handleRetryExtraction}
                onDownloadSuccess={() => toast.success('Download started')}
                onDownloadError={(error) => toast.error(error.message || 'Download failed')}
                className="ml-auto"
                showLabels={true}
                showDeleteConfirmation={true}
                deleteConfirmationTitle="Delete Document"
                deleteConfirmationDescription="Are you sure you want to delete this document? This will remove it from storage and update task stages."
              />
            </div>
          </div>

          {extractionStatus === 'failed' && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs">
              <AlertTriangle className="inline-block w-4 h-4 mr-2 -mt-1" />
              Extraction failed. Please verify manually.
            </div>
          )}
        </div>

        {/* 2. Table Column Headers (Fixed) */}
        <div className="flex bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider flex-shrink-0">
          <div className="w-full sm:w-[160px] p-3 border-r border-gray-200">Field</div>
          <div className="flex-1 p-3">Value</div>
        </div>

        {/* 3. Scrollable List Area (Takes remaining height) */}
        <div className="flex-1 overflow-y-auto bg-white scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
          <div className="flex flex-col">
            {currentFields
              .sort((a, b) => {
                const order = ['name', 'company_name', 'date', 'reference_number', 'file_number'];
                const aName = a?.name?.toLowerCase?.() || '';
                const bName = b?.name?.toLowerCase?.() || '';
                const aIndex = order.indexOf(aName);
                const bIndex = order.indexOf(bName);
                return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
              })
              .map((field, index) => renderField(field, index))}
          </div>

          {/* Comment Section (Scrolls with content) */}
          {currentExtractedData?.comment && (
            <div className="p-4 border-t border-gray-200 bg-yellow-50/30">
              <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase">Upload Comment</h4>
              <div className="p-3 bg-white border border-gray-200 rounded-md text-sm text-gray-700 italic">
                "{currentExtractedData.comment}"
              </div>
            </div>
          )}

          {/* Bottom Padding */}
          <div className="h-4"></div>
        </div>
      </div>
    </div>
  </div>
);

if (expanded) {
  return content;
}

return (
  <Dialog open={isOpen} onOpenChange={setIsOpen}>
    <DialogContent className="max-w-[98vw] max-h-[98vh] h-[95vh] p-0 overflow-hidden flex flex-col bg-gray-50">
      <DialogHeader className="p-4 border-b bg-white shrink-0">
        {/* Document Navigation for Multi-Document Mode */}
        {isMultiDocumentMode && documents.length > 1 && (
          <div className="flex items-center justify-between mb-3 pb-3 border-b">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newIndex = Math.max(0, currentIndex - 1);
                  setCurrentIndex(newIndex);
                  onDocumentChange?.(newIndex);
                }}
                disabled={currentIndex === 0}
                className="h-8"
              >
                Previous
              </Button>
              <span className="text-sm font-medium">
                Document {currentIndex + 1} of {documents.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newIndex = Math.min(documents.length - 1, currentIndex + 1);
                  setCurrentIndex(newIndex);
                  onDocumentChange?.(newIndex);
                }}
                disabled={currentIndex === documents.length - 1}
                className="h-8"
              >
                Next
              </Button>
            </div>
            <div className="text-xs text-gray-500">
              {currentDoc?.uploadedAt && new Date(currentDoc.uploadedAt).toLocaleDateString()}
            </div>
          </div>
        )}
        
        <DialogTitle>
          Document Details: {currentDocumentName || 'Untitled Document'} {currentExtractedData?.name || currentExtractedData?.fullName || currentExtractedData?.clientName || 'Unknown Individual'}
        </DialogTitle>
      </DialogHeader>
      <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
        <div className="w-full max-w-[1800px]">
          {content}
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
};