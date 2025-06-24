// @ts-nocheck
"use client"

import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Clock, Eye, Save, Trash2, FileText } from 'lucide-react'
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

export const ExtractionPreview = ({
  documentName,
  extractedData,
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
  const [localData, setLocalData] = useState<Record<string, any>>(() => {
    const formattedData: Record<string, any> = {};
    
    console.log('ExtractionPreview - Processing Fields:', fields);
    console.log('ExtractionPreview - Extracted Data:', extractedData);
    
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
                  extractedData[field.name.toLowerCase()];

      console.log(`Field "${field.name}":`, {
        snakeCase,
        value,
        possibleKeys: {
          snakeCase: extractedData[snakeCase],
          id: extractedData[field.id],
          name: extractedData[field.name],
          lowercase: extractedData[field.name.toLowerCase()]
        }
      });
      
      // Format specific fields
      if (field.name.toLowerCase() === 'sex' || field.name.toLowerCase() === 'gender') {
        value = value?.toString().toUpperCase() === 'FEMALE' ? 'F' : 
                value?.toString().toUpperCase() === 'MALE' ? 'M' : value;
      } else if (field.name.toLowerCase() === 'surname' && value) {
        value = value.toString().toUpperCase();
      }
      
      formattedData[field.name] = value || '';
    });
    
    console.log('ExtractionPreview - Formatted Data:', formattedData);
    return formattedData;
  });

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
      } else if (field.name.toLowerCase() === 'surname') {
        value = value.toString().toUpperCase();
      }
      
      formattedData[field.name] = value;
    });
    setLocalData(formattedData);
  }, [extractedData, fields]);

  const handleFieldChange = (field: string, value: any, arrayIndex?: number, subField?: string) => {
    setLocalData(prev => {
      const updated = { ...prev };
      if (arrayIndex !== undefined && subField) {
        // Handle array field updates
        if (!Array.isArray(updated[field])) {
          updated[field] = [];
        }
        if (!updated[field][arrayIndex]) {
          updated[field][arrayIndex] = {};
        }
        updated[field][arrayIndex][subField] = value;
      } else {
        // Handle regular field updates
        updated[field] = value;
      }
      onDataChange?.(field, updated[field]);
      return updated;
    });
  };

  const handleAddArrayItem = (fieldName: string) => {
    setLocalData(prev => {
      const updated = { ...prev };
      if (!Array.isArray(updated[fieldName])) {
        updated[fieldName] = [];
      }
      updated[fieldName].push({});
      onDataChange?.(fieldName, updated[fieldName]);
      return updated;
    });
  };

  const handleRemoveArrayItem = (fieldName: string, index: number) => {
    setLocalData(prev => {
      const updated = { ...prev };
      if (Array.isArray(updated[fieldName])) {
        updated[fieldName] = updated[fieldName].filter((_, i) => i !== index);
        onDataChange?.(fieldName, updated[fieldName]);
      }
      return updated;
    });
  };

  const handleSave = () => {
    if (onDataChange) {
      const formattedData = { ...localData };
      fields.forEach(field => {
        if (field.type === 'array' && field.arrayConfig?.fields) {
          const arrayData = formattedData[field.name] || [];
          if (Array.isArray(arrayData)) {
            formattedData[field.name] = arrayData.filter(item =>
              Object.values(item).some(value => value !== undefined && value !== '')
            );
          }
        }
      });

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

  const renderField = (field: Field) => {
    const value = localData[field.name] || '';
    
    return (
      <div key={field.id} className="space-y-1">
        <Label className="text-sm capitalize">
          {field.name.replace(/_/g, ' ')}
        </Label>
        <Input
          value={value}
          onChange={(e) => handleFieldChange(field.name, e.target.value)}
          className="bg-white border"
          readOnly={!onDataChange}
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
      <div className="w-[350px]">
        <div className={`rounded-lg p-4 ${getStylesByType?.(type || 'principal')?.getBgColor() || 'bg-white'} ${getStylesByType?.(type || 'principal')?.getBorderColor() || 'border-gray-200'}`}>
          <h3 className={`text-lg font-semibold mb-4 ${getStylesByType?.(type || 'principal')?.getTextColor() || 'text-gray-900'}`}>Extracted Data</h3>
          <div className="space-y-4">
            {fields.map(renderField)}
          </div>
          {showSaveButton && (
            <div className="mt-4 flex justify-end">
              <Button
                onClick={handleSave}
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
