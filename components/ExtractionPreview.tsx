// @ts-nocheck
"use client"

import React from 'react';
import { FileText, FileIcon, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExtractionPreviewProps {
  documentName: string;
  fileUrl?: string;
  fileName?: string;
  extractedData?: Record<string, any>;
  fields?: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  viewMode?: boolean;
  documentId?: string;
  onDataChange?: (fieldName: string, value: any) => void;
}

const ExtractionPreview: React.FC<ExtractionPreviewProps> = ({
  documentName,
  fileUrl,
  fileName,
  extractedData = {},
  fields = [],
  viewMode = false,
  documentId,
  onDataChange = () => {},
}) => {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-primary text-primary-foreground p-3 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <FileText className="h-5 w-5" />
          <h3 className="font-medium">{documentName || 'Document Preview'}</h3>
        </div>
        {fileUrl && (
          <a
            href={fileUrl}
            download={fileName}
            className="text-primary-foreground hover:text-primary-foreground/80"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="h-4 w-4" />
          </a>
        )}
      </div>
      
      <div className="p-4">
        {fileUrl ? (
          <div className="flex items-center justify-center p-8 bg-muted/20 rounded">
            <div className="text-center">
              <FileIcon className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Preview not available for {fileName || 'this file'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                asChild
              >
                <a href={fileUrl} download={fileName} target="_blank" rel="noopener noreferrer">
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download File
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No file available for preview
          </div>
        )}
        
        {Object.keys(extractedData).length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-medium mb-3">Extracted Data</h4>
            <div className="space-y-2">
              {Object.entries(extractedData).map(([key, value]) => (
                <div key={key} className="flex justify-between py-1.5 border-b">
                  <span className="text-sm text-muted-foreground">{key}</span>
                  <span className="text-sm font-medium">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExtractionPreview;