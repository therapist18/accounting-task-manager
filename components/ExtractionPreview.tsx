// @ts-nocheck
"use client"

import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Clock, Eye, Save, Trash2, FileText, RefreshCw, Loader2, Plus, Minus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Image from 'next/image'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'

// Dynamically import PDF viewer to avoid SSR issues
const PDFViewer = dynamic(() => import('@/components/PDFViewer'), { ssr: false })

interface Field {
  id: string
  name: string
  type: string
  isArray?: boolean
  arrayConfig?: {
    fields?: Array<{
      id: string
      name: string
      type: string
      parentField?: string
    }>
    maxItems?: number
  }
}

interface ExtractionPreviewProps {
  documentName: string
  extractedData: Record<string, any>
  fields: Field[]
  onDataChange?: (fieldName: string, value: any) => void
  onVerify?: () => void
  onRemoveFile?: () => void
  isVerified?: boolean
  fileUrl?: string
  fileName?: string
  expanded?: boolean
  showSaveButton?: boolean
  type?: string
  file?: any
  viewMode?: boolean
  getStylesByType?: (type: string) => {
    getBgColor: () => string
    getTextColor: () => string
    getBorderColor: () => string
    getButtonStyle: () => string
  }
}

const DocumentPreview = ({ fileUrl, fileName, documentName }) => {
  const isPDF = fileName?.toLowerCase().endsWith('.pdf')

  return (
    <div className="bg-white rounded-lg p-4 h-full">
      <h3 className="text-lg font-semibold mb-4">Document Preview</h3>
      <div className="relative aspect-[3/4] w-full bg-gray-100 rounded-lg overflow-hidden">
        {fileUrl ? (
          isPDF ? (
            <PDFViewer url={fileUrl} />
          ) : (
            <Image
              src={fileUrl}
              alt={documentName}
              fill
              className="object-contain"
            />
          )
        ) : (
          <div className="flex items-center justify-center h-full">
            <FileText className="h-12 w-12 text-gray-400" />
          </div>
        )}
      </div>
    </div>
  )
}

interface DocumentData {
  documentName: string;
  extractedData: Record<string, any>;
  fields: Field[];
  fileUrl?: string;
  fileName?: string;
  type?: string;
}

const ExtractionPreview = ({
  documentName,
  extractedData = {},
  fields = [],
  onDataChange,
  fileUrl,
  fileName,
  expanded = false,
  showSaveButton = true,
  type,
  file,
  viewMode = false,
  getStylesByType = (type) => ({
    getBgColor: () => 'bg-white',
    getTextColor: () => 'text-gray-900',
    getBorderColor: () => 'border-gray-200',
    getButtonStyle: () => 'bg-gray-600 hover:bg-gray-700 text-white'
  })
}: ExtractionPreviewProps) => {
  const [isOpen, setIsOpen] = useState(expanded);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [documents, setDocuments] = useState<DocumentData[]>([]);

  // Initialize documents array with current document
  useEffect(() => {
    if (documentName) {
      setDocuments([{
        documentName,
        extractedData,
        fields,
        fileUrl,
        fileName,
        type
      }]);
    }
  }, [documentName, extractedData, fields, fileUrl, fileName, type]);

  const getNestedValue = (obj: any, path: string, defaultValue: any = '') => {
    if (!path || !obj) return defaultValue;
    
    // Handle direct field access
    if (obj.hasOwnProperty(path)) {
      return obj[path] !== undefined ? obj[path] : defaultValue;
    }
    
    // Handle nested path access (for array items)
    const keys = path.split('.');
    let result = obj;
    
    for (const key of keys) {
      if (result === null || result === undefined) return defaultValue;
      result = result[key];
    }
    
    return result !== undefined ? result : defaultValue;
  };

  const handleFieldChange = (fieldName: string, value: any, docIndex: number) => {
    if (viewMode) return;
    
    setDocuments(prevDocs => {
      const updatedDocs = [...prevDocs];
      const currentDoc = { ...updatedDocs[docIndex] };
      
      currentDoc.extractedData = {
        ...currentDoc.extractedData,
        [fieldName]: value
      };
      
      updatedDocs[docIndex] = currentDoc;
      return updatedDocs;
    });
    
    // Notify parent component of the change
    if (onDataChange) {
      onDataChange(fieldName, value);
    }
  };

  const handleArrayItemChange = (fieldName: string, itemIndex: number, subFieldName: string, value: any, docIndex: number) => {
    if (viewMode) return;
    
    setDocuments(prevDocs => {
      const updatedDocs = [...prevDocs];
      const currentDoc = { ...updatedDocs[docIndex] };
      
      // Get current array value
      const currentArray = Array.isArray(currentDoc.extractedData[fieldName]) 
        ? [...currentDoc.extractedData[fieldName]] 
        : [];
      
      // Ensure the array has enough items
      while (currentArray.length <= itemIndex) {
        currentArray.push({});
      }
      
      // Update the specific item
      currentArray[itemIndex] = {
        ...currentArray[itemIndex],
        [subFieldName]: value
      };
      
      // Update the document
      currentDoc.extractedData = {
        ...currentDoc.extractedData,
        [fieldName]: currentArray
      };
      
      updatedDocs[docIndex] = currentDoc;
      return updatedDocs;
    });
    
    // Notify parent component of the change
    if (onDataChange) {
      const currentDoc = documents[docIndex];
      const currentArray = Array.isArray(currentDoc?.extractedData?.[fieldName]) 
        ? [...currentDoc.extractedData[fieldName]] 
        : [];
      
      // Ensure the array has enough items
      while (currentArray.length <= itemIndex) {
        currentArray.push({});
      }
      
      // Update the specific item
      currentArray[itemIndex] = {
        ...currentArray[itemIndex],
        [subFieldName]: value
      };
      
      onDataChange(fieldName, currentArray);
    }
  };

  const addArrayItem = (fieldName: string, docIndex: number) => {
    if (viewMode) return;
    
    const currentDoc = documents[docIndex];
    const currentArray = Array.isArray(currentDoc?.extractedData?.[fieldName]) 
      ? [...currentDoc.extractedData[fieldName]] 
      : [];
    
    currentArray.push({});
    handleFieldChange(fieldName, currentArray, docIndex);
  };

  const removeArrayItem = (fieldName: string, itemIndex: number, docIndex: number) => {
    if (viewMode) return;
    
    const currentDoc = documents[docIndex];
    const currentArray = Array.isArray(currentDoc?.extractedData?.[fieldName]) 
      ? [...currentDoc.extractedData[fieldName]] 
      : [];
    
    if (currentArray.length > 1) { // Keep at least one item
      currentArray.splice(itemIndex, 1);
      handleFieldChange(fieldName, currentArray, docIndex);
    }
  };

  const renderField = (field: Field, docIndex: number) => {
    const isArrayField = field.type === 'array' || field.isArray;
    const fieldKey = field.name.trim();
    const displayName = field.name.replace(/_/g, ' ').replace(/^\s+|\s+$/g, '');
    
    // Handle array fields with config
    if (isArrayField && field.arrayConfig?.fields) {
      const arrayValue = getNestedValue(documents[docIndex]?.extractedData || {}, fieldKey, []);
      const arrayData = Array.isArray(arrayValue) ? arrayValue : [{}]; // Default to one empty item if no data
      
      return (
        <div key={`${docIndex}-${fieldKey}`} className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900">{displayName}</h4>
            {!viewMode && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addArrayItem(fieldKey, docIndex)}
                  className="flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Add Item
                </Button>
              </div>
            )}
          </div>
          
          <div className="space-y-4">
            {arrayData.map((item, itemIndex) => (
              <div key={`${fieldKey}-${itemIndex}`} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                <div className="flex items-center justify-between mb-4">
                  <h5 className="font-medium text-sm text-gray-700">Item {itemIndex + 1}</h5>
                  {!viewMode && arrayData.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => removeArrayItem(fieldKey, itemIndex, docIndex)}
                      className="flex items-center gap-1 text-red-600 hover:text-red-700"
                    >
                      <Minus className="h-3 w-3" />
                      Remove
                    </Button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {field.arrayConfig.fields.map((subField) => {
                    const subFieldKey = subField.name.trim();
                    const subFieldValue = item[subFieldKey] || '';
                    const subFieldDisplayName = subField.name.replace(/_/g, ' ').replace(/^\s+|\s+$/g, '');
                    
                    return (
                      <div key={`${fieldKey}-${itemIndex}-${subFieldKey}`} className="space-y-2">
                        <Label 
                          htmlFor={`${docIndex}-${fieldKey}-${itemIndex}-${subFieldKey}`} 
                          className="text-sm font-medium text-gray-700"
                        >
                          {subFieldDisplayName}
                        </Label>
                        <Input
                          id={`${docIndex}-${fieldKey}-${itemIndex}-${subFieldKey}`}
                          value={subFieldValue}
                          onChange={(e) => handleArrayItemChange(fieldKey, itemIndex, subFieldKey, e.target.value, docIndex)}
                          placeholder={`Enter ${subFieldDisplayName.toLowerCase()}`}
                          className="w-full"
                          disabled={viewMode}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Handle regular fields
    const value = getNestedValue(documents[docIndex]?.extractedData || {}, fieldKey, '');
    
    return (
      <div key={`${docIndex}-${fieldKey}`} className="space-y-2">
        <Label htmlFor={`${docIndex}-${fieldKey}`} className="text-sm font-medium text-gray-700">
          {displayName}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <Input
          id={`${docIndex}-${fieldKey}`}
          value={value}
          onChange={(e) => handleFieldChange(fieldKey, e.target.value, docIndex)}
          placeholder={`Enter ${displayName.toLowerCase()}`}
          className="w-full"
          disabled={viewMode}
        />
      </div>
    );
  };

  const renderDocument = (doc: DocumentData, index: number) => (
    <div key={index} className="mb-8 pb-8 border-b last:border-b-0 last:mb-0 last:pb-0">
      <h3 className="text-xl font-semibold mb-4">{doc.documentName}</h3>
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Document Preview */}
        <div className="lg:flex-1 min-w-0">
          <DocumentPreview
            fileUrl={doc.fileUrl}
            fileName={doc.fileName}
            documentName={doc.documentName}
          />
        </div>

        {/* Extracted Data */}
        <div className="lg:w-[600px] space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Document Details</h3>
            {!viewMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (typeof window.refreshExtraction === 'function') {
                    setIsRefreshing(true);
                    try {
                      await window.refreshExtraction();
                      toast.success('Extraction refreshed successfully');
                    } catch (error) {
                      toast.error('Failed to refresh extraction');
                    } finally {
                      setIsRefreshing(false);
                    }
                  }
                }}
                disabled={isRefreshing || !doc.fileUrl}
                className="flex items-center gap-2"
              >
                {isRefreshing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Refresh Extraction
                  </>
                )}
              </Button>
            )}
          </div>
          
          <div className={`rounded-lg p-6 ${getStylesByType?.(doc.type || 'principal')?.getBgColor() || 'bg-white'} ${getStylesByType?.(doc.type || 'principal')?.getBorderColor() || 'border border-gray-200'} shadow-sm`}>
            <div className="space-y-6 max-h-[70vh] overflow-y-auto">
              {doc.fields?.length > 0 ? (
                doc.fields.map((field, fieldIndex) => (
                  <div key={`${field.id || fieldIndex}-${field.name}`}>
                    {renderField(field, index)}
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No fields defined for this document</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const content = (
    <div className="space-y-8">
      {documents.length > 0 ? (
        documents.map((doc, index) => renderDocument(doc, index))
      ) : (
        <p className="text-center text-gray-500 py-8">No documents to display</p>
      )}
    </div>
  );

  if (expanded) {
    return content;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-[98vw] max-h-[98vh] p-0">
        <div className="h-[98vh] flex flex-col">
          <div className="p-4 border-b">
            <DialogTitle>Document Details Extraction</DialogTitle>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {content}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExtractionPreview;