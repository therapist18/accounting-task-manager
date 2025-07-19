// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter, DialogDescription } from '@/components/ui/dialog'
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
  onSave?: (data: any) => void
  onClose?: () => void
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

// Enhanced Image Viewer component
const ImageViewer = React.memo(({ fileUrl, fileName, documentName }) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const handleZoomIn = useCallback(() => setZoom(prev => Math.min(prev + 0.25, 3)), []);
  const handleZoomOut = useCallback(() => setZoom(prev => Math.max(prev - 0.25, 0.25)), []);
  const handleRotate = useCallback(() => setRotation(prev => (prev + 90) % 360), []);
  const handleReset = useCallback(() => {
    setZoom(1);
    setRotation(0);
  }, []);

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
});

// Enhanced Document Viewer component
const DocumentViewer = React.memo(({ fileUrl, fileName, documentName }) => {
  const getFileType = useCallback((fileName: string) => {
    if (!fileName) return 'unknown';
    const extension = fileName.toLowerCase().split('.').pop();
    
    if (extension === 'pdf') return 'pdf';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) return 'image';
    return 'unknown';
  }, []);

  const fileType = getFileType(fileName);

  console.log('DocumentViewer rendering with:', { fileUrl, fileName, fileType });

  if (!fileUrl) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>No document available for preview</p>
        <p className="text-sm">File URL: {fileUrl || 'Not provided'}</p>
      </div>
    );
  }

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
          {fileType === 'pdf' ? (
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
});

// FIXED: Wrap the main component in React.memo with custom comparison
const ExtractionPreview = React.memo(({
  documentName,
  extractedData = {},
  fields: initialFields = [],
  fieldsPromise,
  onDataChange = () => {},
  onVerify,
  onSave,
  onClose,
  onRemoveFile,
  fileUrl,
  fileName,
  expanded = false,
  showSaveButton = true,
  type = 'document',
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // FIXED: Add local state for immediate UI feedback while maintaining parent sync
  const [localData, setLocalData] = useState<Record<string, any>>(extractedData);

  console.log('ExtractionPreview rendering with:', {
    documentName,
    fileUrl,
    fileName,
    extractedData,
    localData,
    initialFields,
    viewMode
  });

  // FIXED: Sync local data with prop changes
  useEffect(() => {
    setLocalData(extractedData);
  }, [extractedData]);

  // FIXED: Handle fields loading more efficiently
  useEffect(() => {
    if (fieldsPromise) {
      setLoadingFields(true);
      fieldsPromise
        .then(fetchedFields => {
          console.log('Fetched fields from promise:', fetchedFields);
          setFields(fetchedFields || []);
        })
        .catch(error => {
          console.error('Error loading fields:', error);
          setFields(initialFields);
        })
        .finally(() => {
          setLoadingFields(false);
        });
    } else if (initialFields?.length > 0 && fields !== initialFields) {
      setFields(initialFields);
    }
  }, [fieldsPromise]); // Only depend on fieldsPromise

  const getFieldValue = useCallback((field: Field): any => {
    // Try multiple possible field identifiers to match against extracted data
    const possibleKeys = [
      field.id,
      field.name,
      field.fieldName,
      // Convert snake_case to camelCase
      field.name?.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      // Convert camelCase to snake_case  
      field.name?.replace(/([A-Z])/g, '_$1').toLowerCase(),
      // Try exact key match from extractedData
      Object.keys(extractedData).find(key => 
        key.toLowerCase() === field.name?.toLowerCase() ||
        key.toLowerCase() === field.id?.toLowerCase()
      )
    ].filter(Boolean);
  
    // Try to get value from local data first (for immediate UI feedback)
    let value = undefined;
    let matchedKey = null;
    
    for (const key of possibleKeys) {
      if (localData[key] !== undefined) {
        value = localData[key];
        matchedKey = key;
        break;
      }
    }
  
    // Fallback to prop data if not found in local data
    if (value === undefined) {
      for (const key of possibleKeys) {
        if (extractedData[key] !== undefined) {
          value = extractedData[key];
          matchedKey = key;
          break;
        }
      }
    }
  
    console.log(`🔍 Getting value for field:`, {
      fieldName: field.name,
      fieldId: field.id,
      possibleKeys,
      matchedKey,
      foundValue: value,
      localDataKeys: Object.keys(localData),
      extractedDataKeys: Object.keys(extractedData)
    });
    
    return value !== undefined ? value : '';
  }, [localData, extractedData]);
  

  const handleFieldChange = useCallback((field: Field, value: any) => {
    if (viewMode) return;
    
    console.log(`🔄 Field changed in ExtractionPreview:`, {
      fieldName: field.name,
      fieldId: field.id,
      newValue: value,
      timestamp: new Date().toISOString()
    });
    
    // Update local state immediately for UI feedback
    setLocalData(prev => {
      const updatedData = {
        ...prev,
        [field.id]: value,
        [field.name]: value // Store under both keys for compatibility
      };
      
      console.log(`📊 Local data updated:`, {
        fieldName: field.name,
        fieldId: field.id,
        previousValue: prev[field.id] || prev[field.name],
        newValue: value,
        allData: updatedData
      });
      
      return updatedData;
    });
    
    // Call parent's onDataChange for persistence
    if (onDataChange) {
      console.log(`📤 Calling parent onDataChange:`, {
        fieldId: field.id,
        fieldName: field.name,
        value: value
      });
      
      // Use field.id as the key for consistency with parent component
      onDataChange(field.id, value);
    } else {
      console.warn('⚠️ onDataChange callback not provided');
    }
  }, [viewMode, onDataChange]);

  const handleArrayItemChange = useCallback((field: Field, itemIndex: number, subFieldName: string, value: any) => {
    if (viewMode) return;
    
    console.log(`📝 Array item changed:`, {
      fieldName: field.name,
      fieldId: field.id,
      itemIndex,
      subFieldName,
      value
    });
    
    const currentArray = Array.isArray(getFieldValue(field)) ? [...getFieldValue(field)] : [];
    while (currentArray.length <= itemIndex) currentArray.push({});
    currentArray[itemIndex] = { ...currentArray[itemIndex], [subFieldName]: value };
    
    console.log(`📊 Updated array:`, {
      fieldName: field.name,
      newArray: currentArray
    });
    
    handleFieldChange(field, currentArray);
  }, [viewMode, getFieldValue, handleFieldChange]);
  

  const addArrayItem = useCallback((field: Field) => {
    if (viewMode) return;
    const currentArray = Array.isArray(getFieldValue(field)) ? [...getFieldValue(field)] : [];
    currentArray.push({});
    handleFieldChange(field, currentArray);
  }, [viewMode, getFieldValue, handleFieldChange]);

  const removeArrayItem = useCallback((field: Field, itemIndex: number) => {
    if (viewMode) return;
    let currentArray = Array.isArray(getFieldValue(field)) ? [...getFieldValue(field)] : [];
    if (currentArray.length > 1) {
      currentArray.splice(itemIndex, 1);
      handleFieldChange(field, currentArray);
    }
  }, [viewMode, getFieldValue, handleFieldChange]);

  const toTitleCase = useCallback((str: string | undefined | null) => {
    if (!str) return '';
    return str.replace(/_/g, ' ').replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  }, []);
  const renderField = useCallback((field: Field) => {
    const isArrayField = field.type === 'array' || field.isArray;
    const displayName = toTitleCase(field.name || '');
    const currentValue = getFieldValue(field);
  
    console.log(`🎨 Rendering field:`, {
      fieldName: field.name,
      fieldId: field.id,
      isArrayField,
      currentValue,
      fieldType: field.type
    });
  
    if (isArrayField && field.arrayConfig?.fields) {
      const arrayValue = currentValue;
      const arrayData = Array.isArray(arrayValue) && arrayValue.length > 0 ? arrayValue : [{}];
      
      return (
        <div key={field.id} className="space-y-4 rounded-lg border bg-background p-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-base text-foreground">{displayName}</h4>
            {!viewMode && (
              <Button 
                type="button" 
                size="sm" 
                variant="outline" 
                onClick={() => addArrayItem(field)} 
                className="flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {arrayData.map((item, itemIndex) => (
              <Card key={`${field.id}-${itemIndex}`} className="bg-muted/50">
                <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                  <CardTitle className="text-sm font-medium">Item {itemIndex + 1}</CardTitle>
                  {!viewMode && arrayData.length > 1 && (
                    <Button 
                      type="button" 
                      size="icon" 
                      variant="ghost" 
                      onClick={() => removeArrayItem(field, itemIndex)} 
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove Item</span>
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {field.arrayConfig.fields.map((subField) => {
                      const subFieldValue = item[subField.name] || item[subField.id] || '';
                      const subFieldDisplayName = toTitleCase(subField.name);
                      return (
                        <div key={`${field.id}-${itemIndex}-${subField.id}`} className="space-y-1.5">
                          <Label htmlFor={`${field.id}-${itemIndex}-${subField.id}`} className="text-xs font-medium">
                            {subFieldDisplayName}
                          </Label>
                          <Input 
                            id={`${field.id}-${itemIndex}-${subField.id}`} 
                            value={subFieldValue} 
                            onChange={(e) => {
                              console.log(`📝 Array subfield changed:`, {
                                parentField: field.name,
                                itemIndex,
                                subFieldName: subField.name,
                                newValue: e.target.value
                              });
                              handleArrayItemChange(field, itemIndex, subField.name, e.target.value);
                            }} 
                            placeholder={subFieldDisplayName} 
                            disabled={viewMode} 
                          />
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
  
    return (
      <div key={field.id} className="space-y-2">
        <Label htmlFor={field.id}>
          {displayName}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input 
          id={field.id} 
          value={currentValue || ''} 
          onChange={(e) => {
            console.log(`📝 Simple field changed:`, {
              fieldName: field.name,
              fieldId: field.id,
              previousValue: currentValue,
              newValue: e.target.value
            });
            handleFieldChange(field, e.target.value);
          }} 
          placeholder={`Enter ${displayName}`} 
          disabled={viewMode} 
        />
      </div>
    );
  }, [getFieldValue, handleFieldChange, handleArrayItemChange, addArrayItem, removeArrayItem, toTitleCase, viewMode]);
  
  const handleSave = useCallback(() => {
    console.log(`💾 Save initiated:`, {
      documentName,
      localData,
      hasOnSave: !!onSave,
      hasOnVerify: !!onVerify
    });
  
    if (onSave) {
      console.log(`📤 Calling onSave with data:`, localData);
      onSave(localData); // Use local data for save
    } else if (onVerify) {
      console.log(`✅ Calling onVerify`);
      onVerify();
    } else {
      console.warn('⚠️ No save or verify callback available');
    }
  }, [onSave, onVerify, localData, documentName]);

  // FIXED: Memoize the rendered fields to prevent re-renders
  const renderedFields = useMemo(() => {
    if (!fields?.length) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-10 text-muted-foreground">
          <FileText className="h-12 w-12 mb-4" />
          <p className="font-medium">No Fields Defined</p>
          <p className="text-sm">There are no fields configured for this document type.</p>
        </div>
      );
    }
    
    return fields.map(field => renderField(field));
  }, [fields, renderField]);

  if (loadingFields) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading document fields...</span>
      </div>
    );
  }

  const styles = getStylesByType?.(type || 'principal') || {};

  const content = (
    <div className="space-y-6 max-w-9xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center h-10 w-10 rounded-lg ${styles.getBgColor?.() || 'bg-primary'}`}>
            <FileText className={`h-5 w-5 ${styles.getTextColor?.() || 'text-primary-foreground'}`} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">{documentName}</h2>
            {type && <Badge variant="secondary" className="mt-1">{toTitleCase(type)}</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {fileUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={fileUrl} download={fileName}>
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
      
      <div className="grid grid-cols-3 xl:grid-cols-3 gap-6">
        <div className="col-span-2">
          <DocumentViewer fileUrl={fileUrl} fileName={fileName} documentName={documentName} />
        </div>
        
        <div className="col-span-1">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Extracted Details</CardTitle>
                  <CardDescription>
                    {viewMode ? 'Review the extracted data' : 'Review and edit the extracted data'}
                  </CardDescription>
                </div>
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
                    disabled={isRefreshing || !fileUrl} 
                    className="shrink-0"
                  >
                    {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Refresh
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6 max-h-[65vh] overflow-y-auto">
              {renderedFields}
            </CardContent>
            {showSaveButton && !viewMode && (
              <CardFooter className="border-t bg-muted/50">
                <Button onClick={handleSave} className="w-full sm:w-auto">
                  <Save className="mr-2 h-4 w-4" /> Save Changes
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>
      </div>
    </div>
  );

  if (expanded) {
    return <div className="p-4 sm:p-6 bg-muted/20">{content}</div>;
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent 
        className="max-w-7xl w-[95vw] h-[95vh] flex flex-col p-0"
        aria-describedby="document-extraction-desc"
      >
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-2xl">Document Details Extraction</DialogTitle>
          <DialogDescription id="document-extraction-desc">
            Review and verify the extracted document details
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 bg-muted/40">
          {content}
        </div>
        <DialogFooter className="p-4 border-t bg-background">
          <DialogClose asChild>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}, (prevProps, nextProps) => {
  // FIXED: Custom comparison function to prevent unnecessary re-renders
  // Only re-render if these specific props change
  return (
    prevProps.documentName === nextProps.documentName &&
    prevProps.fileUrl === nextProps.fileUrl &&
    prevProps.fileName === nextProps.fileName &&
    prevProps.expanded === nextProps.expanded &&
    prevProps.showSaveButton === nextProps.showSaveButton &&
    prevProps.type === nextProps.type &&
    prevProps.viewMode === nextProps.viewMode &&
    JSON.stringify(prevProps.extractedData) === JSON.stringify(nextProps.extractedData) &&
    prevProps.fieldsPromise === nextProps.fieldsPromise &&
    prevProps.onDataChange === nextProps.onDataChange
  );
});

ExtractionPreview.displayName = 'ExtractionPreview';

export default ExtractionPreview;