// @ts-nocheck
"use client"

import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Clock, Eye, Save, Trash2, FileText, RefreshCw, Loader2 } from 'lucide-react'
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
  isVerified?: boolean
  fileUrl?: string
  fileName?: string
  expanded?: boolean
  showSaveButton?: boolean
  type?: string
  file?: any
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
  getStylesByType = (type) => ({
    getBgColor: () => 'bg-white',
    getTextColor: () => 'text-gray-900',
    getBorderColor: () => 'border-gray-200',
    getButtonStyle: () => 'bg-gray-600 hover:bg-gray-700 text-white'
  })
}: ExtractionPreviewProps) => {
  console.log('ExtractionPreview - Received Props:', {
    documentName,
    extractedData,
    fields,
    fileUrl,
    fileName,
    type
  });

  const [isOpen, setIsOpen] = useState(expanded)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Helper function to get nested value from object using dot notation
  const getNestedValue = (obj: any, path: string, defaultValue: any = '') => {
    if (!path) return defaultValue;
    const keys = path.split('.');
    let result = obj;
    
    for (const key of keys) {
      if (result === null || result === undefined) return defaultValue;
      result = result[key];
    }
    
    return result !== undefined ? result : defaultValue;
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    if (onDataChange) {
      onDataChange(fieldName, value);
    }
  };

  const renderField = (field: Field, parentKey = '') => {
    const fieldKey = parentKey ? `${parentKey}.${field.id}` : field.id;
    const value = getNestedValue(extractedData, fieldKey, '');

    if (field.type === 'array' && field.arrayConfig?.fields) {
      const arrayValue = Array.isArray(value) ? value : [];
      
      return (
        <div key={fieldKey} className="space-y-4">
          <Label>{field.name}</Label>
          {arrayValue.length > 0 ? (
            arrayValue.map((item, index) => (
              <div key={index} className="pl-4 border-l-2 border-gray-200">
                {field.arrayConfig.fields?.map((subField) =>
                  renderField(
                    {
                      ...subField,
                      id: `${index}.${subField.name}`,
                      name: subField.name,
                      type: subField.type || 'text'
                    },
                    `${fieldKey}`
                  )
                )}
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500">No items</div>
          )}
        </div>
      );
    }

    return (
      <div key={fieldKey} className="space-y-2">
        <Label htmlFor={fieldKey}>
          {field.name}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <Input
          id={fieldKey}
          value={value}
          onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
          placeholder={`Enter ${field.name.toLowerCase()}`}
          className="w-full"
        />
      </div>
    );
  };

  const content = (
    <div className="flex gap-6">
      {/* Document Preview */}
      <div className="flex-1 min-w-0">
        <DocumentPreview
          fileUrl={fileUrl}
          fileName={fileName}
          documentName={documentName}
        />
      </div>

      {/* Extracted Data */}
      <div className="w-[400px] space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Document Details</h3>
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
            disabled={isRefreshing || !fileUrl}
          >
            {isRefreshing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh Extraction
              </>
            )}
          </Button>
        </div>
        <div className={`rounded-lg p-4 ${getStylesByType?.(type || 'principal')?.getBgColor() || 'bg-white'} ${getStylesByType?.(type || 'principal')?.getBorderColor() || 'border-gray-200'}`}>
          <div className="space-y-4">
            {fields.length > 0 ? (
              fields.map((field) => renderField(field))
            ) : (
              <p className="text-sm text-gray-500">No fields defined for this document</p>
            )}
          </div>
          {showSaveButton && (
            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => {
                  // Handle save logic here
                  toast.success('Document details saved successfully');
                }}
                className={getStylesByType?.(type || 'principal')?.getButtonStyle() || 'bg-gray-600 hover:bg-gray-700 text-white'}
              >
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-[98vw] max-h-[98vh] p-0">
        <div className="h-[98vh] flex flex-col">
          <div className="p-4 border-b">
            <DialogTitle>Document Details Extraction</DialogTitle>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {content}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
export default ExtractionPreview;