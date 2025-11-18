// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Download, Save, Trash2, RefreshCw, Eye, FileText, AlertTriangle, ZoomIn, ZoomOut, RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Image from 'next/image'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import DocumentActions from '@/app/generic-components/DocumentActions';

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
  documentName: string;
  extractedData: Record<string, any>;
  fields: Field[];
  onDataChange: (fieldName: string, value: any) => void;
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
  supabase?: any; // Supabase client instance (optional, will use useSupabaseClient if not provided)
  onDownloadSuccess?: () => void;
  onDownloadError?: (error: Error) => void;
}

// Update the DocumentPreview component in ExtractionPreview.tsx
const DocumentPreview = ({ fileUrl, fileName, documentName }) => {
  const isPDF = fileName?.toLowerCase().endsWith('.pdf') || fileUrl?.toLowerCase().endsWith('.pdf');

  // State for image transformations
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Handlers for image controls
  const handleZoomIn = () => setZoom(prev => prev + 0.1);
  const handleZoomOut = () => setZoom(prev => Math.max(0.2, prev - 0.1)); // Prevent zooming out too much
  const handleRotateRight = () => setRotation(prev => (prev + 90) % 360);
  const handleRotateLeft = () => setRotation(prev => (prev - 90 + 360) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  // Reset transformations when the document changes
  useEffect(() => {
    handleReset();
  }, [fileUrl]);

  // Use the correct storage bucket 'kyc-documents'
  const displayUrl = fileUrl?.startsWith('blob:')
    ? fileUrl
    : fileUrl
      ? `https://zyszsqgdlrpnunkegipk.supabase.co/storage/v1/object/public/kyc-documents/${fileUrl}`
      : null;

  return (
    <div className="bg-white rounded-lg p-4 h-full">
      <h3 className="text-lg font-semibold mb-4">Document Preview</h3>
      <div className="relative aspect-[3/4] w-full bg-gray-100 rounded-lg overflow-hidden max-h-[80vh]">
        {displayUrl ? (
          isPDF ? (
            <PDFViewer url={displayUrl} />
          ) : (
            <>
              {/* Toolbar for image controls */}
              <div className="absolute top-2 right-2 z-10 bg-black bg-opacity-50 rounded-lg p-1 flex items-center space-x-1">
                <Button variant="ghost" size="icon" onClick={handleZoomIn} className="h-8 w-8 text-white hover:bg-white/20" title="Zoom In">
                  <ZoomIn size={18} />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleZoomOut} className="h-8 w-8 text-white hover:bg-white/20" title="Zoom Out">
                  <ZoomOut size={18} />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleRotateLeft} className="h-8 w-8 text-white hover:bg-white/20" title="Rotate Left">
                  <RotateCcw size={18} />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleRotateRight} className="h-8 w-8 text-white hover:bg-white/20" title="Rotate Right">
                  <RotateCw size={18} />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleReset} className="h-8 w-8 text-white hover:bg-white/20" title="Reset View">
                  <Undo2 size={18} />
                </Button>
              </div>

              {/* Image with transformations */}
              <Image
                src={displayUrl}
                alt={documentName || 'Document preview'}
                fill
                className="object-contain transition-transform duration-200"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                }}
                aria-label={documentName ? `Preview of ${documentName}` : 'Document preview'}
              />
            </>
          )
        ) : (
          <div className="flex items-center justify-center h-full">
            <FileText className="h-12 w-12 text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
};


export const ExtractionPreview = ({
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
}: ExtractionPreviewProps) => {

  const [isOpen, setIsOpen] = useState(expanded)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  // Initialize localData with a function to compute the initial state
  const [localData, setLocalData] = useState<Record<string, any>>(() => {
    const initialData: Record<string, any> = {};
    fields?.forEach(field => {
      if (!field?.name) return;
      
      const snakeCase = field.name
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => '_' + chr.toLowerCase())
        .replace(/^_/, '');

      let value = extractedData[snakeCase] ||
        extractedData[field.id] ||
        extractedData[field.name] ||
        extractedData[field.name.toLowerCase()] || '';

      if (field.name.toLowerCase() === 'sex' || field.name.toLowerCase() === 'gender') {
        value = value.toString().toUpperCase() === 'FEMALE' ? 'F' :
          value.toString().toUpperCase() === 'MALE' ? 'M' : value;
      } else if (field.name.toLowerCase() === 'surname' && value) {
        value = value.toString().toUpperCase();
      }

      initialData[field.name] = value;
    });
    return initialData;
  });

  // Use useMemo to compute derived state
  const formattedData = useMemo(() => {
    const result: Record<string, any> = {};
    fields?.forEach(field => {
      if (!field || !field.name) return;
      
      const snakeCase = field.name
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => '_' + chr.toLowerCase())
        .replace(/^_/, '');

      // Handle nested fields with dot notation (e.g., 'company.name')
      const getNestedValue = (obj: any, path: string) => {
        return path.split('.').reduce((o, p) => o?.[p], obj);
      };

      // Try to get value from various possible locations
      let value = extractedData[snakeCase] ||
        extractedData[field.id] ||
        extractedData[field.name] ||
        extractedData[field.name.toLowerCase()] ||
        getNestedValue(extractedData, field.name) ||
        getNestedValue(extractedData, snakeCase) ||
        '';

      // Handle special field types
      if (field.name.toLowerCase() === 'sex' || field.name.toLowerCase() === 'gender') {
        value = value.toString().toUpperCase() === 'FEMALE' ? 'F' :
          value.toString().toUpperCase() === 'MALE' ? 'M' : value;
      } else if (field.name.toLowerCase() === 'surname' && value) {
        value = value.toString().toUpperCase();
      } else if (field.name.toLowerCase() === 'directors_and_shareholders' && Array.isArray(value)) {
        // Ensure consistent structure for directors and shareholders
        value = value.map(item => ({
          name: item.name || item.Name || '-',
          shares: item.shares || item.Shares || '-',
          address: item.address || item.Address || '-',
          description: item.description || item.Description || '-',
          nationality: item.nationality || item.Nationality || '-',
          ...item // Include any additional fields
        }));
      }

      result[field.name] = value;
    });
    return result;
  }, [extractedData, fields]);

  // Update localData when formattedData changes
  useEffect(() => {
    setLocalData(prevData => ({
      ...prevData,
      ...Object.fromEntries(
        Object.entries(formattedData).filter(([key]) => prevData[key] === undefined || prevData[key] === '')
      )
    }));
  }, [formattedData]);

  const handleFieldChange = (field: string, value: any) => {
    setLocalData(prev => ({
      ...prev,
      [field]: value
    }));

    // Call onDataChange after state update is complete
    onDataChange?.(field, value);
  };

  const handleDelete = async (docData?: any) => {
    if (!onDelete) return;
    try {
      setIsDeleting(true);
      // If docData is provided (from DocumentActions), use it directly
      // Otherwise, construct the document data object
      const documentData = docData || {
        file_path: fileUrl,
        file_name: fileName,
        document_name: documentName,
        extracted_details: extractedData,
        document_type: type,
        id: file?.id,
        ...file
      };
      
      // Call the onDelete callback with the document data
      await onDelete(documentData);
      toast.success('Document deleted successfully');
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error(error.message || 'Failed to delete document');
      throw error; // Re-throw to allow DocumentActions to handle the error
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRetryExtraction = async () => {
    if (!onRetryExtraction) return
    try {
      setIsRetrying(true)
      await onRetryExtraction({
        fileUrl,
        fileName,
        documentName,
        extractedData,
        type,
        file
      })
    } catch (error) {
      console.error('Error retrying extraction:', error)
      toast.error('Failed to retry extraction')
    } finally {
      setIsRetrying(false)
    }
  }

  const handleSave = async () => {
    if (typeof onSave !== 'function') {
      console.warn('onSave handler is not defined');
      return;
    }
    try {
      setIsSaving(true);
      await onSave({
        ...localData,
        fileUrl,
        fileName,
        documentName,
        type,
        file
      });
      toast.success('Document saved successfully');
    } catch (error) {
      console.error('Error saving document:', error);
      toast.error(error.message || 'Failed to save document');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async (format: 'document' | 'excel' | 'pdf' = 'document') => {
    if (!onDownload) {
      console.warn('onDownload handler is not defined');
      return;
    }
    try {
      setIsDownloading(true);
      await onDownload(format);
    } catch (error) {
      console.error('Error downloading document:', error);
      toast.error(error.message || 'Failed to download document');
    } finally {
      setIsDownloading(false);
    }
  };

  const renderField = (field: Field) => {
    if (!field?.name) return null;
    
    const value = localData[field.name];

    // Handle array fields (like directors_and_shareholders)
    if (Array.isArray(value)) {
      return (
        <div key={field.id} className="space-y-3">
          <Label className="text-sm font-medium capitalize">{(field.name || '').replace(/_/g, ' ')}</Label>
          <div className="space-y-4">
            {value.map((item, index) => (
              <div key={index} className="p-3 border rounded-md bg-gray-50">
                {Object.entries(item).map(([key, val]) => (
                  <div key={key} className="grid grid-cols-3 gap-2 text-sm mb-1">
                    <span className="font-medium text-gray-500 capitalize">{key.replace(/_/g, ' ')}:</span>
                    <span className="col-span-2 text-gray-900">{String(val || '-')}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Handle nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return (
        <div key={field.id} className="space-y-1">
          <Label className="text-sm font-medium capitalize">{(field.name || '').replace(/_/g, ' ')}</Label>
          <div className="p-3 border rounded-md bg-gray-50">
            {Object.entries(value).map(([key, val]) => (
              <div key={key} className="grid grid-cols-3 gap-2 text-sm mb-1">
                <span className="font-medium text-gray-500 capitalize">{key.replace(/_/g, ' ')}:</span>
                <span className="col-span-2 text-gray-900">{String(val || '-')}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Handle simple fields
    return (
      <div key={field.id} className="space-y-1">
        <Label className="text-sm font-medium capitalize">{(field.name || '').replace(/_/g, ' ')}</Label>
        <Input
          value={value || ''}
          onChange={(e) => handleFieldChange(field.name, e.target.value)}
          className="bg-white border"
          readOnly={!onDataChange}
        />
      </div>
    );
  };

  const content = (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Document Preview */}
      <div className="lg:col-span-2 min-w-0">
        <DocumentPreview
          fileUrl={fileUrl}
          fileName={fileName}
          documentName={documentName}
        />
      </div>

      {/* Extracted Data */}
      <div className="lg:col-span-1 shadow-md">
        <div className={`rounded-lg p-4 ${getStylesByType?.(type || 'principal')?.getBgColor() || 'bg-white'} ${getStylesByType?.(type || 'principal')?.getBorderColor() || 'border-gray-200'}`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">Extracted Details</h3>
            <div className="flex items-center space-x-2">
              <DocumentActions
                document={{
                  ...localData,
                  fileUrl,
                  fileName,
                  documentName,
                  type,
                  file,
                  document_display_name: documentName,
                  document_id: type,
                  extracted_details: localData,
                  id: file?.id,
                  file_path: fileUrl
                }}
                documentTypes={documentTypes || []}
                supabase={supabase}
                onSave={onSave}
                onDelete={onDelete ? handleDelete : undefined}
                onRetry={onRetryExtraction}
                onDownloadSuccess={() => toast.success('Download started')}
                onDownloadError={(error) => toast.error(error.message || 'Download failed')}
                className="ml-auto"
                showDeleteConfirmation={true}
                deleteConfirmationTitle="Confirm Document Deletion"
                deleteConfirmationDescription="Are you sure you want to delete this document? This action cannot be undone."
              />
            </div>
          </div>

          {extractionStatus === 'failed' && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              <AlertTriangle className="inline-block w-4 h-4 mr-2 -mt-1" />
              Document extraction failed. Please check the document and try again.
            </div>
          )}

          <div className="space-y-6 overflow-y-auto max-h-[calc(90vh-230px)] pr-2">
            {fields
              .sort((a, b) => {
                // Sort fields to show important ones first
                const order = ['name', 'company_name', 'date', 'reference_number', 'file_number'];
                const aName = a?.name?.toLowerCase?.() || '';
                const bName = b?.name?.toLowerCase?.() || '';
                const aIndex = order.indexOf(aName);
                const bIndex = order.indexOf(bName);
                return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
              })
              .map(renderField)}
          </div>

          {/* Display comment if available */}
          {extractedData?.comment && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-500 mb-2">Upload Comment</h4>
              <div className="p-3 bg-gray-50 rounded-md text-sm text-gray-700">
                {extractedData.comment}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (expanded) {
    return content;
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[98vw] max-h-[98vh] p-0">
          <div className="h-[90vh] flex flex-col">
            <DialogHeader className="p-4 border-b">
              <DialogTitle>Document Details Extraction: {documentName}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto p-4">
              {content}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <AlertTriangle className="h-6 w-6 text-red-600 mr-2" />
              Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-600">
              Are you sure you want to delete this document? This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Document'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};