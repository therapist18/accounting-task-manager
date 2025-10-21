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
  Image as ImageIcon,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import Image from 'next/image'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

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
      isArray?: boolean
      arrayConfig?: any
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
  documentId?: string
  documentIndex?: number
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
      <div className="absolute top-2 right-2 z-10 flex gap-1 backdrop-blur-sm rounded-md p-1 border">
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

function ExtractionPreview({
  documentName,
  extractedData = {},
  fields: initialFields = [],
  fieldsPromise = null,
  onDataChange = () => { },
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
  documentId,
  documentIndex,
  getStylesByType = (type) => ({
    getBgColor: () => 'bg-primary',
    getTextColor: () => 'text-primary-foreground',
    getBorderColor: () => 'border-primary',
    getButtonStyle: () => 'bg-primary hover:bg-primary/90 text-primary-foreground'
  })
}: ExtractionPreviewProps) {
  const [fields, setFields] = useState<Field[]>(initialFields);
  const [loadingFields, setLoadingFields] = useState(!!fieldsPromise);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [localFormData, setLocalFormData] = useState<Record<string, any>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Initialize form data from extractedData
  useEffect(() => {
    console.log('🔄 Initializing form data from extractedData:', extractedData);
    setLocalFormData(extractedData || {});
    
    // Auto-expand sections that have data
    const newExpandedSections: Record<string, boolean> = {};
    Object.keys(extractedData || {}).forEach(key => {
      if (Array.isArray(extractedData[key]) && extractedData[key].length > 0) {
        newExpandedSections[key] = true;
      }
    });
    setExpandedSections(newExpandedSections);
  }, [JSON.stringify(extractedData)]);

  // Handle fields loading
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
  }, [fieldsPromise]);

  // Get field value - check both field name and ID
  const getFieldValue = useCallback((field: Field): any => {
    // First try field name, then field ID
    let value = localFormData[field.name] ?? localFormData[field.id];
    
    // For array fields, ensure we use field names consistently
    if (Array.isArray(value)) {
      value = value.map(item => {
        if (!item || typeof item !== 'object') return item;
        
        const newItem = {};
        // Process each field in the array config to ensure consistent naming
        if (field.arrayConfig?.fields) {
          field.arrayConfig.fields.forEach(subField => {
            const fieldName = subField.name || subField.id;
            
            // Always use field name as the primary key
            if (item[fieldName] !== undefined) {
              newItem[fieldName] = item[fieldName];
            } else if (item[subField.id] !== undefined) {
              // If we only have the ID, use it but also set the name
              newItem[fieldName] = item[subField.id];
            }
            
            // Maintain backward compatibility with ID keys
            if (fieldName !== subField.id) {
              newItem[subField.id] = newItem[fieldName];
            }
            
            // Initialize with empty string if no value exists
            if (newItem[fieldName] === undefined) {
              newItem[fieldName] = '';
            }
          });
        }
        return newItem;
      });
    }
    
    console.log('🔍 Getting value for field:', {
      fieldName: field.name,
      fieldId: field.id,
      value: value,
      availableKeys: Object.keys(localFormData)
    });

    return value ?? '';
  }, [localFormData]);

  // Handle field changes
  const handleFieldChange = useCallback((field: Field, value: any) => {
    if (viewMode) return;

    console.log(`🔄 Field changed:`, {
      fieldName: field.name,
      fieldId: field.id,
      newValue: value
    });

    setLocalFormData(prev => {
      const updatedData = {
        ...prev,
        [field.name]: value,
        [field.id]: value
      };
      return updatedData;
    });

    if (onDataChange) {
      onDataChange(field.name, value);
    }
  }, [viewMode, onDataChange]);

  // Handle array item changes
  const handleArrayItemChange = useCallback((field: Field, itemIndex: number, subField: { id: string, name: string }, value: any) => {
    if (viewMode) return;

    const currentArray = Array.isArray(getFieldValue(field)) ? [...getFieldValue(field)] : [];
    while (currentArray.length <= itemIndex) currentArray.push({});
    
    // Always use field name as the primary key, with fallback to ID
    const fieldName = subField.name || subField.id;
    
    // Create updated item with both name and ID mappings
    const updatedItem = { 
      ...currentArray[itemIndex],
      [fieldName]: value
    };
    
    // Maintain backward compatibility with ID keys
    if (fieldName !== subField.id) {
      updatedItem[subField.id] = value;
    }
    
    currentArray[itemIndex] = updatedItem;
    handleFieldChange(field, currentArray);
  }, [viewMode, getFieldValue, handleFieldChange]);

  // Add array item
  const addArrayItem = useCallback((field: Field) => {
    if (viewMode) return;
    const currentArray = Array.isArray(getFieldValue(field)) ? [...getFieldValue(field)] : [];
    const newItem = {};
    
    // Initialize new item with empty values for all sub-fields using consistent naming
    if (field.arrayConfig?.fields) {
      field.arrayConfig.fields.forEach(subField => {
        const fieldName = subField.name || subField.id;
        // Always use field name as the primary key
        newItem[fieldName] = '';
        
        // Maintain backward compatibility with ID keys
        if (fieldName !== subField.id) {
          newItem[subField.id] = '';
        }
      });
    }
    
    currentArray.push(newItem);
    handleFieldChange(field, currentArray);
  }, [viewMode, getFieldValue, handleFieldChange]);

  // Remove array item
  const removeArrayItem = useCallback((field: Field, itemIndex: number) => {
    if (viewMode) return;
    let currentArray = Array.isArray(getFieldValue(field)) ? [...getFieldValue(field)] : [];
    if (currentArray.length > 1) {
      currentArray.splice(itemIndex, 1);
      handleFieldChange(field, currentArray);
    }
  }, [viewMode, getFieldValue, handleFieldChange]);

  // Toggle section expansion
  const toggleSection = useCallback((sectionKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  }, []);

  // Convert field names to title case
  const toTitleCase = useCallback((str: string | undefined | null) => {
    if (!str) return '';
    return str.replace(/_/g, ' ').replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  }, []);

  // Render individual field
  const renderSimpleField = useCallback((field: Field, value: any, onChange: (value: any) => void) => {
    const displayName = toTitleCase(field.name) || field.id;
    
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id} className="text-sm font-medium text-foreground">
          {displayName}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          id={field.id}
          type={field.type === 'date' ? 'date' : 'text'}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${displayName}`}
          disabled={viewMode}
          className="w-full"
        />
      </div>
    );
  }, [toTitleCase, viewMode]);

  // Render array field with nested items
  const renderArrayField = useCallback((field: Field) => {
    const arrayValue = getFieldValue(field);
    const arrayData = Array.isArray(arrayValue) ? arrayValue : [];
    const displayName = toTitleCase(field.name) || field.id;
    const sectionKey = field.name || field.id;
    const isExpanded = expandedSections[sectionKey];

    return (
      <div key={field.id} className="space-y-3">
        <Collapsible open={isExpanded} onOpenChange={() => toggleSection(sectionKey)}>
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <h4 className="font-semibold text-base text-foreground">{displayName}</h4>
                <Badge variant="secondary" className="text-xs">
                  {arrayData.length} {arrayData.length === 1 ? 'item' : 'items'}
                </Badge>
              </div>
              {!viewMode && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    addArrayItem(field);
                  }}
                  className="flex items-center gap-1.5 ml-2"
                >
                  <Plus className="h-4 w-4" /> Add Item
                </Button>
              )}
            </div>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="space-y-3 mt-3">
            {arrayData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg border-2 border-dashed">
                <p className="font-medium">No items in {displayName}</p>
                <p className="text-sm">Click "Add Item" to create the first entry</p>
              </div>
            ) : (
              arrayData.map((item, itemIndex) => (
                <Card key={`${field.id}-${itemIndex}`} className="bg-background border-l-4 border-l-primary/20">
                  <CardHeader className="flex flex-row items-center justify-between py-3 px-4 bg-muted/10">
                    <CardTitle className="text-sm font-medium text-foreground">
                      {displayName} #{itemIndex + 1}
                    </CardTitle>
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
                  <CardContent className="p-4 space-y-4">
                    {field.arrayConfig?.fields?.map((subField) => {
                      // Use field name as the primary key, with fallback to ID
                      const fieldName = subField.name || subField.id;
                      // Get value using field name first, then fall back to ID
                      const subFieldValue = (item && typeof item === 'object') 
                        ? (item[fieldName] !== undefined ? item[fieldName] : (item[subField.id] || ''))
                        : '';
                      
                      const subFieldDisplayName = toTitleCase(subField.name) || subField.id;
                      const inputId = `${field.id}-${itemIndex}-${fieldName.replace(/\s+/g, '-').toLowerCase()}`;
                      
                      return (
                        <div key={`${field.id}-${itemIndex}-${fieldName}`} className="grid grid-cols-1 gap-2">
                          <Label 
                            htmlFor={inputId} 
                            className="text-sm font-medium text-foreground"
                          >
                            {subFieldDisplayName}
                            {subField.required && <span className="text-destructive ml-1">*</span>}
                          </Label>
                          <Input
                            id={inputId}
                            type={subField.type === 'date' ? 'date' : 'text'}
                            value={subFieldValue || ''}
                            onChange={(e) => {
                              handleArrayItemChange(field, itemIndex, subField, e.target.value);
                            }}
                            disabled={viewMode}
                            placeholder={`Enter ${subFieldDisplayName}`}
                            className="w-full"
                          />
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  }, [getFieldValue, addArrayItem, removeArrayItem, handleArrayItemChange, toTitleCase, viewMode, expandedSections, toggleSection]);

  // Main render function for fields
  const renderField = useCallback((field: Field) => {
    const isArrayField = field.isArray || field.type === 'array';
    
    if (isArrayField && field.arrayConfig?.fields) {
      return renderArrayField(field);
    }

    const value = getFieldValue(field);
    return (
      <div key={field.id}>
        {renderSimpleField(field, value, (newValue) => handleFieldChange(field, newValue))}
      </div>
    );
  }, [renderArrayField, renderSimpleField, getFieldValue, handleFieldChange]);

  // Handle save
  const handleSave = useCallback(() => {
    console.log(`💾 Save initiated:`, {
      documentName,
      localFormData,
      hasOnSave: !!onSave,
      hasOnVerify: !!onVerify
    });

    if (onSave) {
      onSave(localFormData);
    } else if (onVerify) {
      onVerify();
    }
  }, [onSave, onVerify, localFormData, documentName]);

  // Memoize rendered fields
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

  const content = (
    <div 
      className="space-y-6 max-w-9xl"
      data-doc-id={documentId}
      data-doc-index={documentIndex}
    >
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
    <div className="space-y-6 max-w-9xl">
      <div className="flex flex-col h-full bg-muted/40">
        <div className="flex-1 overflow-y-auto p-6">
          {content}
        </div>
      </div>
    </div>
  );
}

ExtractionPreview.displayName = 'ExtractionPreview';

export default React.memo(ExtractionPreview);