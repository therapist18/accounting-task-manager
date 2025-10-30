// @ts-nocheck
"use client"

import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Clock, Eye, Save, Trash2, FileText, AlertTriangle, RefreshCw, ZoomIn, ZoomOut, RotateCcw, RotateCw, Undo2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Image from 'next/image'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'

// Dynamically import PDF viewer with no SSR to prevent 'self is not defined' error
const PDFViewer = dynamic(() => import('@/components/PDFViewer').then(mod => mod.PDFViewer), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full">Loading PDF viewer...</div>
})

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
  documentName: string
  extractedData: Record<string, any>
  fields: Field[]
  onDataChange: (fieldName: string, value: any) => void
  onVerify?: () => void
  onRemoveFile?: () => void
  onDelete?: () => Promise<void> | void
  onRetryExtraction?: () => Promise<void> | void
  isVerified?: boolean
  fileUrl?: string
  fileName?: string
  expanded?: boolean
  showSaveButton?: boolean
  type?: string
  file?: any
  extractionStatus?: 'pending' | 'success' | 'failed' | 'success'
  getStylesByType?: (type: string) => {
    getBgColor: () => string
    getTextColor: () => string
    getBorderColor: () => string
    getButtonStyle: () => string
  }
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
  })
}: ExtractionPreviewProps) => {

  const [isOpen, setIsOpen] = useState(expanded)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [localData, setLocalData] = useState<Record<string, any>>({});

  useEffect(() => {
    const formattedData: Record<string, any> = {};
    fields.forEach(field => {
      // Convert field name to snake_case for matching with extracted data
      const snakeCase = field.name
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => '_' + chr.toLowerCase())
        .replace(/^_/, '');

      // Try different key formats to find the value
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

      formattedData[field.name] = value;
    });
    setLocalData(formattedData);
  }, [extractedData, fields]);

  const handleFieldChange = (field: string, value: any) => {
    setLocalData(prev => {
      const updated = { ...prev, [field]: value };
      onDataChange?.(field, value);
      return updated;
    });
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    try {
      setIsDeleting(true);
      await onDelete();
      setShowDeleteDialog(false);
      if (!expanded) setIsOpen(false);
      toast('Document deleted successfully');
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Failed to delete document. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRetryExtraction = async () => {
    if (!onRetryExtraction) return;

    try {
      setIsRetrying(true);
      await onRetryExtraction();
      toast('Document extraction retried successfully');
    } catch (error) {
      console.error('Error retrying extraction:', error);
      toast.error('Failed to retry extraction. Please try again.');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSave = () => {
    if (onDataChange) {
      const formattedData = { ...localData };
      if (formattedData.Surname) {
        formattedData.Surname = formattedData.Surname.toUpperCase();
      }
      onDataChange('save', {
        file: file,
        fileUrl: fileUrl,
        extractedData: formattedData,
        type: type
      });
    }
  };

  const renderField = (field: Field) => (
    <div key={field.id} className="space-y-1">
      <Label className="text-sm capitalize">{field.name.replace(/_/g, ' ')}</Label>
      <Input
        value={localData[field.name] || ''}
        onChange={(e) => handleFieldChange(field.name, e.target.value)}
        className="bg-white border"
        readOnly={!onDataChange}
      />
    </div>
  );

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
            <h3 className={`text-lg font-semibold ${getStylesByType?.(type || 'principal')?.getTextColor() || 'text-gray-900'}`}>
              Extracted Data
            </h3>
            {extractionStatus === 'failed' && onRetryExtraction && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryExtraction}
                disabled={isRetrying}
                className="text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
                {isRetrying ? 'Retrying...' : 'Retry Extraction'}
              </Button>
            )}
          </div>

          {extractionStatus === 'failed' && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              <AlertTriangle className="inline-block w-4 h-4 mr-2 -mt-1" />
              Document extraction failed. Please check the document and try again.
            </div>
          )}

          <div className="space-y-4 overflow-y-auto max-h-[calc(80vh-100px)]">
            {fields.map(renderField)}
          </div>

          {showSaveButton && (
            <Button
              onClick={handleSave}
              className={getStylesByType?.(type || 'principal')?.getButtonStyle() || 'bg-gray-600 hover:bg-gray-700 text-white'}
              disabled={isDeleting || isRetrying}
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
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