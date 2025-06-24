import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Save, FileText, X } from 'lucide-react';
import Image from 'next/image';
import dynamic from 'next/dynamic';

const PDFViewer = dynamic(() => import('@/components/PDFViewer'), { ssr: false });

interface Field {
  id: string;
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

interface ExtractionPreviewProps {
  documentName: string;
  extractedData: Record<string, any>;
  fields: Field[];
  onDataChange: (field: string, value: any) => void;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  onSave?: () => void;
  onCancel?: () => void;
  loading?: boolean;
}

const DocumentPreview = ({ fileUrl, fileName, documentName }: { fileUrl?: string; fileName?: string; documentName: string }) => {
  const isPDF = fileName?.toLowerCase().endsWith('.pdf');
  const isImage = fileUrl?.match(/\.(jpeg|jpg|gif|png)$/) != null;

  return (
    <div className="bg-white rounded-lg p-4 h-full">
      <h3 className="text-lg font-semibold mb-4">Document Preview</h3>
      <div className="relative aspect-[3/4] w-full bg-gray-100 rounded-lg overflow-hidden">
        {fileUrl ? (
          isPDF ? (
            <div className="w-full h-full">
              <PDFViewer url={fileUrl} />
            </div>
          ) : isImage ? (
            <Image
              src={fileUrl}
              alt={documentName}
              fill
              className="object-contain"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <FileText className="h-12 w-12 text-gray-400" />
              <span className="ml-2">Preview not available</span>
            </div>
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
  extractedData = {},
  fields = [],
  onDataChange,
  fileUrl,
  fileName,
  fileType,
  onSave,
  onCancel,
  loading = false,
}: ExtractionPreviewProps) => {
  const [localData, setLocalData] = useState<Record<string, any>>({});

  useEffect(() => {
    // Initialize form data with extracted data
    const initialData: Record<string, any> = {};
    
    fields.forEach(field => {
      // Try to match field name with extracted data keys (case insensitive)
      const key = Object.keys(extractedData).find(
        k => k.toLowerCase() === field.name.toLowerCase()
      );
      
      initialData[field.name] = key ? extractedData[key] : '';
    });
    
    setLocalData(initialData);
  }, [extractedData, fields]);

  const handleFieldChange = (fieldName: string, value: string) => {
    setLocalData(prev => ({
      ...prev,
      [fieldName]: value
    }));
    
    // Notify parent of change
    onDataChange(fieldName, value);
  };

  const handleSave = () => {
    if (onSave) {
      onSave();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Document Preview */}
      <div className="lg:col-span-1">
        <DocumentPreview 
          fileUrl={fileUrl}
          fileName={fileName}
          documentName={documentName}
        />
      </div>

      {/* Extracted Data Form */}
      <div className="lg:col-span-1">
        <Card className="h-full">
          <div className="p-4 border-b">
            <h3 className="text-lg font-semibold">Extracted Data</h3>
            <p className="text-sm text-muted-foreground">
              Review and edit the extracted information
            </p>
          </div>
          
          <div className="p-4 space-y-4 max-h-[calc(100%-120px)] overflow-y-auto">
            {fields.length > 0 ? (
              fields.map(field => (
                <div key={field.id} className="space-y-2">
                  <Label htmlFor={field.id}>
                    {field.name}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Input
                    id={field.id}
                    value={localData[field.name] || ''}
                    onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    placeholder={field.description || `Enter ${field.name}`}
                    className="w-full"
                  />
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No fields to display</p>
                <p className="text-sm">Configure extraction fields in the document settings</p>
              </div>
            )}
          </div>
          
          <div className="p-4 border-t flex justify-end space-x-2">
            {onCancel && (
              <Button variant="outline" onClick={onCancel} disabled={loading}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
            <Button onClick={handleSave} disabled={loading}>
              {loading ? (
                <>
                  <div className="h-4 w-4 border-2 border-t-2 border-t-primary rounded-full animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};
