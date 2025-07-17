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
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Image as ImageIcon
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
  fields?: Field[]
  fieldsPromise?: Promise<Field[]> | null
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

// Enhanced Image Viewer component
const ImageViewer = ({ fileUrl, fileName, documentName }) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.25));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  if (imageError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-secondary/20 rounded-md border">
        <ImageIcon className="h-16 w-16 mb-4" />
        <p className="text-lg font-medium">Failed to load image</p>
        <p className="text-sm">The image file could not be displayed</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Image Controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-1 bg-background/80 backdrop-blur-sm rounded-md p-1 border">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleZoomOut}
          disabled={zoom <= 0.25}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleZoomIn}
          disabled={zoom >= 3}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleRotate}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleReset}
          disabled={zoom === 1 && rotation === 0}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Zoom Level Indicator */}
      {zoom !== 1 && (
        <div className="absolute top-2 left-2 z-10 bg-background/80 backdrop-blur-sm rounded-md px-2 py-1 border text-xs font-medium">
          {Math.round(zoom * 100)}%
        </div>
      )}

      {/* Image Container */}
      <div className="w-full h-full overflow-auto bg-secondary/30 rounded-md border flex items-center justify-center">
        <div 
          className="transition-transform duration-200 ease-in-out"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'center center'
          }}
        >
          {imageLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-secondary/50">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
          <Image
            src={fileUrl}
            alt={documentName}
            width={800}
            height={600}
            className="max-w-none object-contain"
            style={{
              width: 'auto',
              height: 'auto',
              maxWidth: zoom === 1 ? '100%' : 'none',
              maxHeight: zoom === 1 ? '100%' : 'none'
            }}
            onLoad={() => setImageLoading(false)}
            onError={() => {
              setImageError(true);
              setImageLoading(false);
            }}
            priority
          />
        </div>
      </div>
    </div>
  );
};

// Enhanced Document Viewer component
const DocumentViewer = ({ fileUrl, fileName, documentName }) => {
  const getFileType = (fileName: string) => {
    if (!fileName) return 'unknown';
    const extension = fileName.toLowerCase().split('.').pop();
    
    if (extension === 'pdf') return 'pdf';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) return 'image';
    return 'unknown';
  };

  const fileType = getFileType(fileName);

  return (
    <Card className="w-full h-full flex flex-col min-h-[70vh]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Document Preview</CardTitle>
            <CardDescription>
              Visual representation of the uploaded {fileType === 'pdf' ? 'PDF' : fileType === 'image' ? 'image' : 'file'}.
            </CardDescription>
          </div>
          {fileName && (
            <Badge variant="outline" className="text-xs">
              {fileName.split('.').pop()?.toUpperCase()}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-2">
        <div className="relative w-full h-[65vh]">
          {fileUrl ? (
            fileType === 'pdf' ? (
              <PDFViewer url={fileUrl} />
            ) : fileType === 'image' ? (
              <ImageViewer 
                fileUrl={fileUrl} 
                fileName={fileName} 
                documentName={documentName} 
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-secondary/30 rounded-md border">
                <FileText className="h-16 w-16 mb-4" />
                <p className="text-lg font-medium">Unsupported File Type</p>
                <p className="text-sm">This file type cannot be previewed</p>
                {fileName && (
                  <p className="text-xs mt-2 opacity-70">{fileName}</p>
                )}
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-secondary/30 rounded-md border">
              <FileText className="h-16 w-16 mb-4" />
              <p className="text-lg font-medium">No Preview Available</p>
              <p className="text-sm">No file has been uploaded yet</p>
            </div>
          )}
        </div>
      </CardContent>
      {fileName && (
        <CardFooter className="text-xs text-muted-foreground border-t bg-muted/50">
          <div className="flex items-center justify-between w-full">
            <span>File: {fileName}</span>
            {fileType === 'image' && (
              <span>Use controls to zoom and rotate the image</span>
            )}
          </div>
        </CardFooter>
      )}
    </Card>
  );
};

const ExtractionPreview = ({
  documentName,
  extractedData = {},
  fields: initialFields = [],
  fieldsPromise,
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
  const [fields, setFields] = useState<Field[]>(initialFields);
  const [loadingFields, setLoadingFields] = useState(!!fieldsPromise);
  const [isOpen, setIsOpen] = useState(expanded);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [kycFields, setKycFields] = useState<Field[]>([]);

  useEffect(() => {
    if (fieldsPromise) {
      setLoadingFields(true);
      fieldsPromise
        .then(fetchedFields => {
          setFields(fetchedFields || []);
        })
        .catch(error => {
          console.error('Error loading fields:', error);
          setFields(initialFields);
        })
        .finally(() => {
          setLoadingFields(false);
        });
    } else {
      setFields(initialFields);
    }
  }, [fieldsPromise, initialFields]);

  useEffect(() => {
    const fetchKycFields = async () => {
      if (!extractedData?.kycId) {
        setKycFields(fields);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(`/api/kyc-fields/${extractedData.kycId}`);
        if (!response.ok) throw new Error('Failed to fetch KYC fields');
        const data = await response.json();
        setKycFields(data.fields || []);
      } catch (error) {
        console.error('Error fetching KYC fields:', error);
        setKycFields(fields); // Fallback to provided fields
      } finally {
        setIsLoading(false);
      }
    };

    if (documentName) {
      setDocuments([{
        documentName,
        extractedData,
        fields: kycFields.length > 0 ? kycFields : fields,
        fileUrl,
        fileName,
        type
      }]);
    }

    fetchKycFields();
  }, [documentName, extractedData, fields, fileUrl, fileName, type, extractedData?.kycId, kycFields]);

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
    const fieldKey = field.name?.trim() || '';
    const displayName = toTitleCase(field.name || '');

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
                      const subFieldKey = (subField.name || '').trim();
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
        <div className="flex gap-6 items-start grid grid-cols-3">
          <div className="xl:sticky xl:top-6 w-full col-span-2">
            <DocumentViewer fileUrl={doc.fileUrl} fileName={doc.fileName} documentName={doc.documentName} />
          </div>
          <Card className="h-full w-full col-span-1">
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
            <CardContent className="space-y-6 max-h-[65vh] overflow-y-auto">
              {doc.fields?.length > 0 ? doc.fields.map((field) => renderField(field, index)) : (
                <div className="flex flex-col items-center justify-center text-center py-10 text-muted-foreground">
                  <FileText className="h-12 w-12 mb-4" />
                  <p className="font-medium">No Fields Defined</p>
                  <p className="text-sm">There are no fields configured for this document type.</p>
                </div>
              )}
            </CardContent>
            {showSaveButton && !viewMode && (
              <CardFooter className="border-t bg-muted/50">
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

  if (loadingFields) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading document fields...</span>
      </div>
    );
  }

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