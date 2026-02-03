// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { 
  Download, Save, Trash2, RefreshCw, Eye, FileText, 
  AlertTriangle, ZoomIn, ZoomOut, RotateCcw, RotateCw, 
  Undo2, X, ChevronDown 
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import Image from 'next/image'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { Textarea } from '@/components/ui/textarea';
import DocumentActions from '@/app/generic-components/DocumentActions';

// Dynamically import PDF viewer to avoid SSR issues
const PDFViewer = dynamic(() => import('@/components/PDFViewer'), { ssr: false })

interface Field {
  id: string
  name: string
  type: string
  options?: string[] // Added options for dropdowns
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
  supabase?: any;
  onDownloadSuccess?: () => void;
  onDownloadError?: (error: Error) => void;
}

// --- HELPER COMPONENTS MOVED OUTSIDE ---
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
  <div className="w-full sm:flex-1 p-2 flex items-center min-w-0 relative group">
    {children}
  </div>
);
// ---------------------------------------

const DocumentPreview = ({ fileUrl, fileName, documentName }) => {
  const isPDF = fileName?.toLowerCase().endsWith('.pdf') || fileUrl?.toLowerCase().endsWith('.pdf');

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
    : fileUrl?.startsWith('http')
      ? fileUrl
      : fileUrl
        ? `https://zyszsqgdlrpnunkegipk.supabase.co/storage/v1/object/public/kyc-documents/${fileUrl}`
        : null;

  return (
    <div className="bg-white rounded-lg p-4 h-full flex flex-col border border-gray-200 shadow-sm">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">Document Preview</h3>
      {/* Container takes remaining height relative to parent */}
      <div className="relative flex-1 w-full bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
        {displayUrl ? (
          isPDF ? (
            <PDFViewer url={displayUrl} />
          ) : (
            <>
              {/* Toolbar */}
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
                  />
                 </div>
              </div>
            </>
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
  
  // Update the localData state initialization to handle null/undefined field names
  const [localData, setLocalData] = useState<Record<string, any>>(() => {
    const initialData: Record<string, any> = {};
    fields.forEach(field => {
      // Add null check for field and field.name
      if (!field || !field.name) return;
      
      const snakeCase = String(field.name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+(.)/g, (_, chr) => '_' + (chr || '').toLowerCase())
        .replace(/^_/, '');

      let value = extractedData[snakeCase] ||
        extractedData[field.id] ||
        extractedData[field.name] ||
        '';
        
      initialData[field.name] = value;
    });
    return initialData;
  });

  const formattedData = useMemo(() => {
    const result: Record<string, any> = {};
    fields.forEach(field => {
      // FIX: Add safety check for null/undefined field or field.name
      if (!field || !field.name) return;

      const snakeCase = field.name
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => '_' + chr.toLowerCase())
        .replace(/^_/, '');

      const getNestedValue = (obj: any, path: string) => {
        return path.split('.').reduce((o, p) => o?.[p], obj);
      };

      let value = extractedData[snakeCase] ||
        extractedData[field.id] ||
        extractedData[field.name] ||
        extractedData[field.name.toLowerCase()] ||
        getNestedValue(extractedData, field.name) ||
        getNestedValue(extractedData, snakeCase) ||
        '';

      if (field.name.toLowerCase() === 'sex' || field.name.toLowerCase() === 'gender') {
        value = value.toString().toUpperCase() === 'FEMALE' ? 'F' :
          value.toString().toUpperCase() === 'MALE' ? 'M' : value;
      } else if (field.name.toLowerCase() === 'surname' && value) {
        value = value.toString().toUpperCase();
      } else if (field.name.toLowerCase() === 'directors_and_shareholders' && Array.isArray(value)) {
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
  }, [extractedData, fields]);

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
    onDataChange?.(field, value);
  };

  const handleDelete = async (docData?: any) => {
    if (!onDelete) return;
    try {
      setIsDeleting(true);
      const documentData = docData || {
        file_path: fileUrl,
        file_name: fileName,
        document_name: documentName,
        extracted_details: extractedData,
        document_type: type,
        id: file?.id,
        ...file
      };
      
      await onDelete(documentData);
      toast.success('Document deleted successfully');
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error(error.message || 'Failed to delete document');
      throw error;
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

  const renderField = (field: Field, index: number) => {
    // FIX: Add safety check. If name is missing, do not render this row.
    if (!field || !field.name) return null;

    const value = localData[field.name];
    const isEven = index % 2 === 0;

    // --- ARRAY TYPE ---
    if (Array.isArray(value)) {
      return (
        <RowWrapper key={field.id} className="items-start" isEven={isEven}>
          <LabelCell>{field.name.replace(/_/g, ' ')}</LabelCell>
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

    // --- OBJECT TYPE ---
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return (
        <RowWrapper key={field.id} className="items-start" isEven={isEven}>
          <LabelCell>{field.name.replace(/_/g, ' ')}</LabelCell>
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

    // --- DROPDOWN TYPE ---
    if (field.type === 'dropdown' && field.options && field.options.length > 0) {
      return (
        <RowWrapper key={field.id} isEven={isEven}>
          <LabelCell>{field.name.replace(/_/g, ' ')}</LabelCell>
          <ValueCell>
            <div className="flex w-full items-center gap-2">
              <Select
                value={value || ''}
                onValueChange={(val) => handleFieldChange(field.name, val)}
                disabled={!onDataChange}
              >
                <SelectTrigger 
                  className="w-full h-8 border-transparent focus:border-blue-500 hover:border-gray-200 focus:ring-1 focus:ring-blue-500 bg-transparent shadow-none text-sm transition-all px-2"
                >
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                  {/* Handle case where extracted value is NOT in options list */}
                  {value && !field.options.includes(value) && (
                    <SelectItem value={value} disabled className="hidden">
                      {value}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              
              {/* Clear Button */}
              {value && onDataChange && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-gray-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                  onClick={() => handleFieldChange(field.name, '')}
                  title="Clear selection"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            
            {/* Warning if extracted value isn't in list (Optional UX enhancement) */}
            {value && !field.options.includes(value) && (
              <div className="absolute top-0 right-8">
                 <span className="flex h-2 w-2 rounded-full bg-amber-500" title="Extracted value not in list" />
              </div>
            )}
          </ValueCell>
        </RowWrapper>
      );
    }

    // --- TEXT TYPE (Default) ---
    return (
      <RowWrapper key={field.id} isEven={isEven}>
        <LabelCell>{field.name.replace(/_/g, ' ')}</LabelCell>
        <ValueCell>
          <Input
            value={value || ''}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            className="border-transparent focus:border-blue-500 hover:border-gray-200 focus:ring-1 focus:ring-blue-500 bg-transparent shadow-none h-8 text-sm transition-all px-2"
            readOnly={!onDataChange}
            placeholder="-"
          />
        </ValueCell>
      </RowWrapper>
    );
  };

  const content = (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      {/* Document Preview - Fixed Height */}
      <div className="lg:col-span-2 h-[75vh]">
        <DocumentPreview
          fileUrl={fileUrl}
          fileName={fileName}
          documentName={documentName}
        />
      </div>

      {/* Extracted Data - Fixed Height with Overflow */}
      <div className="lg:col-span-1 h-[75vh] shadow-sm rounded-lg flex flex-col">
        <div className={`h-full flex flex-col rounded-lg border ${getStylesByType?.(type || 'principal')?.getBgColor() || 'bg-white'} ${getStylesByType?.(type || 'principal')?.getBorderColor() || 'border-gray-200'} overflow-hidden`}>
          
          {/* 1. Header Section (Fixed at top) */}
          <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">Extracted Details</h3>
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
            {fields
                .sort((a, b) => {
                  const order = ['name', 'company_name', 'date', 'reference_number', 'file_number'];
                  // Safe access with fallback to empty string
                  const aName = (a?.name || '').toLowerCase();
                  const bName = (b?.name || '').toLowerCase();
                  
                  const aIndex = order.indexOf(aName);
                  const bIndex = order.indexOf(bName);
                  return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
                })
                .map((field, index) => renderField(field, index))}
            </div>

            {/* Comment Section (Scrolls with content) */}
            {extractedData?.comment && (
               <div className="p-4 border-t border-gray-200 bg-yellow-50/30">
                <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase">Upload Comment</h4>
                <div className="p-3 bg-white border border-gray-200 rounded-md text-sm text-gray-700 italic">
                  "{extractedData.comment}"
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
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[98vw] max-h-[98vh] h-[95vh] p-0 overflow-hidden flex flex-col bg-gray-50">
          <DialogHeader className="p-4 border-b bg-white shrink-0">
            <DialogTitle>Document Details Extraction: {documentName}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
            <div className="w-full max-w-[1800px]">
              {content}
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete Document'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};