// @ts-nocheck
"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { 
  Save, 
  Trash2, 
  FileText, 
  RefreshCw, 
  Loader2, 
  Plus, 
  Minus,
  Download // Added icon
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter } from '@/components/ui/dialog'
import Image from 'next/image'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { Badge } from '@/components/ui/badge'

// Dynamically import PDF viewer to avoid SSR issues
const PDFViewer = dynamic(() => import('@/components/PDFViewer'), { ssr: false })

interface Field {
  id: string
  name: string
  type: string
  isArray?: boolean
  required?: boolean
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

interface DocumentData {
  documentName: string;
  extractedData: Record<string, any>;
  fields: Field[];
  fileUrl?: string;
  fileName?: string;
  type?: string;
}

// Inlined and restyled Document Preview component
const DocumentViewer = ({ fileUrl, fileName, documentName }) => {
  const isPDF = fileName?.toLowerCase().endsWith('.pdf');

  return (
    <Card className="w-full h-full flex flex-col min-h-[70vh]">
      <CardHeader>
        <CardTitle className="text-lg">Document Preview</CardTitle>
        <CardDescription>Visual representation of the uploaded file.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 p-2">
        <div className="relative w-full h-full bg-secondary/30 rounded-md overflow-hidden border">
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
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileText className="h-16 w-16" />
              <p className="mt-2 text-sm">No preview available</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const ExtractionPreview = ({
  documentName,
  extractedData = {},
  fields = [],
  onDataChange,
  onVerify,
  onRemoveFile,
  fileUrl,
  fileName,
  expanded = false,
  showSaveButton = true,
  type,
  file,
  viewMode = false,
  getStylesByType = (type) => ({
    getBgColor: () => 'bg-primary',
    getTextColor: () => 'text-primary-foreground',
    getBorderColor: () => 'border-primary',
    getButtonStyle: () => 'bg-primary hover:bg-primary/90 text-primary-foreground'
  })
}: ExtractionPreviewProps) => {
  const [isOpen, setIsOpen] = useState(expanded);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [documents, setDocuments] = useState<DocumentData[]>([]);

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
    if (obj.hasOwnProperty(path)) return obj[path] !== undefined ? obj[path] : defaultValue;
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
      const currentDoc = { ...updatedDocs[docIndex], extractedData: { ...updatedDocs[docIndex].extractedData, [fieldName]: value }};
      updatedDocs[docIndex] = currentDoc;
      return updatedDocs;
    });
    if (onDataChange) onDataChange(fieldName, value);
  };

  const handleArrayItemChange = (fieldName: string, itemIndex: number, subFieldName: string, value: any, docIndex: number) => {
    if (viewMode) return;
    const currentDoc = documents[docIndex];
    let currentArray = Array.isArray(currentDoc?.extractedData?.[fieldName]) ? [...currentDoc.extractedData[fieldName]] : [];
    while (currentArray.length <= itemIndex) currentArray.push({});
    currentArray[itemIndex] = { ...currentArray[itemIndex], [subFieldName]: value };
    handleFieldChange(fieldName, currentArray, docIndex);
  };

  const addArrayItem = (fieldName: string, docIndex: number) => {
    if (viewMode) return;
    const currentDoc = documents[docIndex];
    const currentArray = Array.isArray(currentDoc?.extractedData?.[fieldName]) ? [...currentDoc.extractedData[fieldName]] : [];
    currentArray.push({});
    handleFieldChange(fieldName, currentArray, docIndex);
  };

  const removeArrayItem = (fieldName: string, itemIndex: number, docIndex: number) => {
    if (viewMode) return;
    const currentDoc = documents[docIndex];
    let currentArray = Array.isArray(currentDoc?.extractedData?.[fieldName]) ? [...currentDoc.extractedData[fieldName]] : [];
    if (currentArray.length > 1) {
      currentArray.splice(itemIndex, 1);
      handleFieldChange(fieldName, currentArray, docIndex);
    }
  };

  const toTitleCase = (str: string) => 
    str.replace(/_/g, ' ').replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

  const renderField = (field: Field, docIndex: number) => {
    const isArrayField = field.type === 'array' || field.isArray;
    const fieldKey = field.name.trim();
    const displayName = toTitleCase(field.name);

    if (isArrayField && field.arrayConfig?.fields) {
      const arrayValue = getNestedValue(documents[docIndex]?.extractedData || {}, fieldKey, []);
      const arrayData = Array.isArray(arrayValue) && arrayValue.length > 0 ? arrayValue : [{}];
      
      return (
        <div key={`${docIndex}-${fieldKey}`} className="space-y-4 rounded-lg border bg-background p-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-base text-foreground">{displayName}</h4>
            {!viewMode && (
              <Button type="button" size="sm" variant="outline" onClick={() => addArrayItem(fieldKey, docIndex)} className="flex items-center gap-1.5">
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {arrayData.map((item, itemIndex) => (
              <Card key={`${fieldKey}-${itemIndex}`} className="bg-muted/50">
                <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                  <CardTitle className="text-sm font-medium">Item {itemIndex + 1}</CardTitle>
                  {!viewMode && arrayData.length > 1 && (
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeArrayItem(fieldKey, itemIndex, docIndex)} className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove Item</span>
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {field.arrayConfig.fields.map((subField) => {
                      const subFieldKey = subField.name.trim();
                      const subFieldValue = item[subFieldKey] || '';
                      const subFieldDisplayName = toTitleCase(subField.name);
                      return (
                        <div key={`${fieldKey}-${itemIndex}-${subFieldKey}`} className="space-y-1.5">
                          <Label htmlFor={`${docIndex}-${fieldKey}-${itemIndex}-${subFieldKey}`} className="text-xs font-medium">{subFieldDisplayName}</Label>
                          <Input id={`${docIndex}-${fieldKey}-${itemIndex}-${subFieldKey}`} value={subFieldValue} onChange={(e) => handleArrayItemChange(fieldKey, itemIndex, subFieldKey, e.target.value, docIndex)} placeholder={subFieldDisplayName} disabled={viewMode} />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      );
    }

    const value = getNestedValue(documents[docIndex]?.extractedData || {}, fieldKey, '');
    return (
      <div key={`${docIndex}-${fieldKey}`} className="space-y-2">
        <Label htmlFor={`${docIndex}-${fieldKey}`}>
          {displayName}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input id={`${docIndex}-${fieldKey}`} value={value} onChange={(e) => handleFieldChange(fieldKey, e.target.value, docIndex)} placeholder={`Enter ${displayName}`} disabled={viewMode} />
      </div>
    );
  };

  const renderDocument = (doc: DocumentData, index: number) => {
    const styles = getStylesByType?.(doc.type || 'principal') || {};
    return (
      <div key={index} className="space-y-6 max-w-9xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center h-10 w-10 rounded-lg ${styles.getBgColor?.() || 'bg-primary'}`}>
              <FileText className={`h-5 w-5 ${styles.getTextColor?.() || 'text-primary-foreground'}`} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">{doc.documentName}</h2>
              {doc.type && <Badge variant="secondary" className="mt-1">{toTitleCase(doc.type)}</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {doc.fileUrl && (
              <Button asChild variant="outline" size="sm">
                <a href={doc.fileUrl} download={doc.fileName}>
                  <Download className="mr-2 h-4 w-4" /> Download
                </a>
              </Button>
            )}
            {onRemoveFile && !viewMode && (
              <Button variant="destructive" size="sm" onClick={onRemoveFile}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            )}
          </div>
        </div>
        <div className="flex gap-6 items-start">
          <div className="xl:sticky xl:top-6 w-full">
            <DocumentViewer fileUrl={doc.fileUrl} fileName={doc.fileName} documentName={doc.documentName} />
          </div>
          <Card className="h-full w-full">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Extracted Details</CardTitle>
                  <CardDescription>Review and edit the extracted data.</CardDescription>
                </div>
                {!viewMode && (
                  <Button variant="outline" size="sm" onClick={async () => {
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
                  }} disabled={isRefreshing || !doc.fileUrl} className="shrink-0">
                    {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Refresh
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {doc.fields?.length > 0 ? doc.fields.map((field) => renderField(field, index)) : (
                <div className="flex flex-col items-center justify-center text-center py-10 text-muted-foreground">
                  <FileText className="h-12 w-12 mb-4" />
                  <p className="font-medium">No Fields Defined</p>
                  <p className="text-sm">There are no fields configured for this document type.</p>
                </div>
              )}
            </CardContent>
            {showSaveButton && !viewMode && (
              <CardFooter>
                <Button onClick={onVerify} className="w-full sm:w-auto">
                  <Save className="mr-2 h-4 w-4" /> Save Changes
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>
      </div>
    );
  };

  const content = (
    <div className="space-y-12">
      {documents.length > 0 ? documents.map(renderDocument) : (
        <div className="flex flex-col items-center justify-center h-[50vh] text-center text-muted-foreground bg-background rounded-lg border border-dashed">
          <FileText className="h-16 w-16 mb-4" />
          <h3 className="text-xl font-semibold">No Documents</h3>
          <p className="mt-2 text-sm">There are no documents to display or preview.</p>
        </div>
      )}
    </div>
  );

  if (expanded) {
    return <div className="p-4 sm:p-6 bg-muted/20">{content}</div>;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-7xl w-[95vw] h-[95vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-2xl">Document Details Extraction</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 bg-muted/40">
          {content}
        </div>
        <DialogFooter className="p-4 border-t bg-background">
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExtractionPreview;