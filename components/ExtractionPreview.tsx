// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { supabase as defaultSupabase } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Download, Save, Trash2, RefreshCw, Eye, FileText,
  AlertTriangle, ZoomIn, ZoomOut, RotateCcw, RotateCw,
  Undo2, X, ChevronDown, ChevronUp, User, Building2, MapPin, Share2, Tag
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
import { toast } from "@/lib/hooks/use-toast"
import dynamic from 'next/dynamic'
import { format } from 'date-fns'
import { Textarea } from '@/components/ui/textarea';
import DocumentActions from '@/app/generic-components/DocumentActions';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { formatDateForDisplay } from '@/app/generic-functions/documentSorting';

// Dynamically import PDF viewer to avoid SSR issues
const PDFViewer = dynamic(() => import('@/components/PDFViewer'), { ssr: false })

let extractionInstanceCounter = 0;
const nextExtractionInstanceId = () => {
  extractionInstanceCounter += 1;
  return extractionInstanceCounter;
};

const formatDateTimeToDMY = (value?: string | null) => {
  if (!value) return '';
  try {
    return format(new Date(value), 'dd/MM/yyyy HH:mm');
  } catch {
    return '';
  }
};

const fetchDocumentFieldsFromKYC = async (documentId: string, customSupabase?: any) => {
  if (!documentId) return [];

  try {
    const sb = customSupabase || defaultSupabase;
    const { data, error } = await sb
      .from('acc_portal_kyc')
      .select('fields')
      .eq('id', documentId)
      .single();

    if (error) {
      console.warn('Failed to fetch fields from acc_portal_kyc:', error);
      return [];
    }

    const fields = data?.[0]?.fields || data?.fields || [];
    return fields;
  } catch (err) {
    console.error('Error fetching document fields from KYC:', err);
    return [];
  }
};

interface Field {
  id: string
  name: string
  type: string
  displayName?: string
  isUnique?: boolean
  options?: string[]
  section?: string
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
  onRetryExtractionWithAI?: (doc?: any) => Promise<void> | void;
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
  documentId?: string;
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
  onDialogClose?: () => void;
  updatedAt?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  modifiedAt?: string;
  modifiedBy?: string;
  allowBackImage?: boolean;
  downloadNaming?: { entityName?: string; shortName?: string; expiryDate?: Date | null };
}

const RowWrapper = ({ children, className = "", isEven = false }) => (
  <div className={`flex flex-col sm:flex-row border-b last:border-b-0 border-gray-100 ${isEven ? 'bg-white' : 'bg-gray-50/60'} hover:bg-blue-50/50 transition-colors duration-150 ${className}`}>
    {children}
  </div>
);

const LabelCell = ({ children, isUnique = false }) => (
  <div className={`w-full sm:w-[160px] flex-shrink-0 p-3 sm:border-r border-gray-100 flex items-center ${isUnique ? 'bg-amber-50 border-l-4 border-l-amber-500' : 'bg-gray-50/50 sm:bg-transparent'}`}>
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-tight break-words">
        {children}
      </span>
      {isUnique && (
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-amber-500" title="Unique Identifier Field" />
          <span className="text-xs text-amber-600 font-medium">UNIQUE</span>
        </div>
      )}
    </div>
  </div>
);

const ValueCell = ({ children, isUnique = false }) => (
  <div className={`w-full sm:flex-1 p-2 flex items-center min-w-0 relative group ${isUnique ? 'bg-amber-50/30' : ''}`}>
    {children}
    {isUnique && (
      <div className="absolute top-0 right-0">
        <div className="h-1 w-full bg-gradient-to-l from-amber-200 to-transparent" />
      </div>
    )}
  </div>
);

const DocumentPreview = ({ fileUrl, fileName, documentName }) => {
  const isPDF = fileName?.toLowerCase().endsWith('.pdf') || fileUrl?.toLowerCase().endsWith('.pdf') || fileUrl?.includes('/sign/') || fileUrl?.includes('.pdf?');

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleZoomIn = () => setZoom(prev => prev + 0.1);
  const handleZoomOut = () => setZoom(prev => Math.max(0.2, prev - 0.1));
  const handleRotateRight = () => setRotation(prev => (prev + 90) % 360);
  const handleRotateLeft = () => setRotation(prev => (prev - 90 + 360) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  useEffect(() => {
    if (fileUrl) {
      handleReset();
    }
  }, [fileUrl]);

  const displayUrl = fileUrl?.startsWith('blob:')
    ? fileUrl
    : fileUrl?.startsWith('http')
      ? fileUrl
      : fileUrl
        ? `https://zyszsqgdlrpnunkegipk.supabase.co/storage/v1/object/public/kyc-documents/${fileUrl}`
        : null;

  return (
    <div className="bg-white rounded-lg p-4 h-full flex flex-col border border-gray-200 shadow-sm overflow-hidden">
      <h3 className="text-sm font-semibold mb-3 text-gray-800">Document Preview</h3>
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
  extractedData = {},
  fields = [],
  onDataChange,
  onDelete,
  onRetryExtraction,
  onRetryExtractionWithAI,
  fileUrl,
  fileName,
  expanded = false,
  showSaveButton = true,
  type,
  file,
  documentId,
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
  onDialogClose,
  updatedAt,
  uploadedAt,
  uploadedBy,
  modifiedAt,
  modifiedBy,
  allowBackImage = false,
  downloadNaming,
  supabase = defaultSupabase,
}: ExtractionPreviewProps) => {

  const isCardCapture = allowBackImage || !!extractedData?.backFileUrl;

  const [isOpen, setIsOpen] = useState(expanded);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [resolvedFields, setResolvedFields] = useState<Field[]>(fields);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const panelGroupInstanceId = useMemo(() => {
    const suffix = documentId || nextExtractionInstanceId();
    return {
      groupId: `extraction-preview-group-${suffix}`,
      panel1: `extraction-preview-panel-1-${suffix}`,
      panel2: `extraction-preview-panel-2-${suffix}`,
    };
  }, [documentId]);

  const SECTION_META: Record<string, { label: string; icon: any }> = {
    contact_person: { label: 'Contact Person', icon: User },
    company: { label: 'Company', icon: Building2 },
    office: { label: 'Location & Address', icon: MapPin },
    socials: { label: 'Social Media', icon: Share2 },
    meta: { label: 'Categorization & Period', icon: Tag },
  };

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    const resolveFields = async () => {
      if ((!fields || fields.length === 0) && documentId) {
        const fetchedFields = await fetchDocumentFieldsFromKYC(documentId, supabase);
        setResolvedFields(fetchedFields || []);
      } else {
        setResolvedFields(fields || []);
      }
    };

    resolveFields();
  }, [fields, documentId, supabase]);

  const [localData, setLocalData] = useState<Record<string, any>>(() => {
    const initialData: Record<string, any> = {};
    (fields || []).forEach(field => {
      if (!field || !field.name) return;

      const snakeCase = String(field.name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+(.)/g, (_, chr) => '_' + (chr || '').toLowerCase())
        .replace(/^_/, '');

      let value = extractedData[snakeCase] ||
        extractedData[field.id] ||
        extractedData[field.name] ||
        '';

      if (field.type === 'date' && value) value = formatDateForDisplay(value);

      initialData[field.name] = value;
    });
    return initialData;
  });

  const formattedData = useMemo(() => {
    const result: Record<string, any> = {};
    resolvedFields.forEach(field => {
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

      if (field.type === 'date' && value) value = formatDateForDisplay(value);

      result[field.name] = value;
    });
    return result;
  }, [extractedData, resolvedFields]);

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
        company_id: file?.company_id,
        kyc_document_id: file?.kyc_document_id,
        director_id: file?.director_id,
        ...file,
        id: documentId
      };

      await onDelete(documentData);

      if (onDialogClose) {
        onDialogClose();
      } else {
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      if (!error?.message?.includes('already handled')) {
        toast({ title: 'Error', description: error?.message || 'Failed to delete document', variant: 'destructive' });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRetryExtraction = async () => {
    if (!onRetryExtraction) return;
    try {
      setIsRetrying(true);
      await onRetryExtraction({
        fileUrl,
        fileName,
        documentName,
        extractedData,
        type,
        file,
        documentId
      });
    } catch (error) {
      console.error('Error retrying extraction:', error);
      toast({ title: 'Error', description: 'Failed to retry extraction', variant: 'destructive' });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleRetryExtractionWithAI = async () => {
    if (!onRetryExtractionWithAI) return;
    try {
      setIsRetrying(true);
      await onRetryExtractionWithAI({
        fileUrl,
        fileName,
        documentName,
        extractedData,
        type,
        file,
        documentId
      });
    } catch (error) {
      console.error('Error retrying extraction with AI:', error);
      toast({ title: 'Error', description: 'Failed to retry extraction with AI', variant: 'destructive' });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSave = async () => {
    if (typeof onSave !== 'function') return;
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
      toast({ title: 'Success', description: 'Document saved successfully', variant: 'success' });
    } catch (error) {
      console.error('Error saving document:', error);
      toast({ title: 'Error', description: error?.message || 'Failed to save document', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const renderField = (field: Field, index: number) => {
    if (!field || !field.name) return null;

    const value = localData[field.name];
    const isEven = index % 2 === 0;

    if (field.type === 'array' || Array.isArray(value)) {
      const arrayFields = field.arrayConfig?.fields || [];
      const items = Array.isArray(value) ? value : [];

      return (
        <RowWrapper key={field.id} className="items-start" isEven={isEven}>
          <LabelCell isUnique={field.isUnique}>{field.displayName || field.name.replace(/_/g, ' ')}</LabelCell>
          <div className="w-full sm:flex-1 p-2">
            <div className="space-y-4">
              {items.length === 0 && (
                <span className="text-xs text-gray-400 italic">No entries found</span>
              )}

              {items.map((item, itemIndex) => (
                <div key={itemIndex} className="p-4 border rounded-lg bg-white shadow-sm border-blue-100 relative">
                  <div className="absolute top-0 right-0 p-1">
                    <span className="text-xs font-bold text-blue-300 uppercase">Item #{itemIndex + 1}</span>
                  </div>

                  <div className="space-y-3">
                    {arrayFields.length > 0 ? (
                      arrayFields.map((subField) => {
                        const subValue = item[subField.name] || item[subField.id] || '';

                        if (subField.type === 'array') {
                          return (
                            <div key={subField.id} className="mt-2 pt-2 border-t border-gray-50">
                              <label className="text-xs font-bold text-gray-400 uppercase">{subField.name}</label>
                              <div className="pl-4 border-l-2 border-gray-100 ml-1">
                                {Array.isArray(subValue) ? subValue.map((nestedItem, nestedIdx) => (
                                  <div key={nestedIdx} className="text-xs text-gray-600 bg-gray-50 p-1 mb-1 rounded">
                                    {Object.entries(nestedItem).map(([k, v]) => (
                                      <div key={k}><strong>{k}:</strong> {String(v)}</div>
                                    ))}
                                  </div>
                                )) : <span className="text-xs text-gray-400 italic">None</span>}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={subField.id} className="grid grid-cols-3 gap-2 border-b border-gray-50 last:border-0 pb-1">
                            <span className="text-xs font-medium text-gray-500">{subField.name}:</span>
                            <input
                              className="col-span-2 text-xs bg-transparent border-none p-0 focus:ring-0 text-gray-900"
                              value={String(subValue)}
                              onChange={(e) => {
                                const newArray = [...items];
                                newArray[itemIndex] = { ...newArray[itemIndex], [subField.name]: e.target.value };
                                handleFieldChange(field.name, newArray);
                              }}
                              placeholder="-"
                            />
                          </div>
                        );
                      })
                    ) : (
                      Object.entries(item).map(([key, val]) => (
                        <div key={key} className="grid grid-cols-3 gap-2 mb-1 border-b last:border-b-0 pb-1 border-gray-100 text-xs">
                          <span className="font-medium text-gray-500 capitalize">{key.replace(/_/g, ' ')}:</span>
                          <span className="col-span-2 text-gray-900 break-words">{String(val || '-')}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}

              {onDataChange && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-dashed"
                  onClick={() => {
                    const newItem = {};
                    arrayFields.forEach(f => newItem[f.name] = "");
                    handleFieldChange(field.name, [...items, newItem]);
                  }}
                >
                  + Add {field.name}
                </Button>
              )}
            </div>
          </div>
        </RowWrapper>
      );
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return (
        <RowWrapper key={field.id} className="items-start" isEven={isEven}>
          <LabelCell isUnique={field.isUnique}>{field.displayName || field.name.replace(/_/g, ' ')}</LabelCell>
          <div className="w-full sm:flex-1 p-2">
            <div className="p-3 border rounded-md bg-white shadow-sm">
              {Object.entries(value).map(([key, val]) => (
                <div key={key} className="grid grid-cols-3 gap-2 text-xs mb-1 border-b last:border-b-0 pb-1 last:pb-0 border-gray-100">
                  <span className="font-medium text-gray-500 capitalize text-xs">{key.replace(/_/g, ' ')}:</span>
                  <span className="col-span-2 text-gray-900 break-words">{String(val || '-')}</span>
                </div>
              ))}
            </div>
          </div>
        </RowWrapper>
      );
    }

    if (field.type === 'dropdown' && field.options && field.options.length > 0) {
      return (
        <RowWrapper key={field.id} isEven={isEven}>
          <LabelCell isUnique={field.isUnique}>{field.displayName || field.name.replace(/_/g, ' ')}</LabelCell>
          <ValueCell isUnique={field.isUnique}>
            <div className="flex w-full items-center gap-2">
              <Select
                value={value || ''}
                onValueChange={(val) => handleFieldChange(field.name, val)}
                disabled={!onDataChange}
              >
                <SelectTrigger
                  className="w-full h-7 border-transparent focus:border-blue-500 hover:border-gray-200 focus:ring-1 focus:ring-blue-500 bg-transparent shadow-none text-xs transition-all px-2"
                >
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                  {value && !field.options.includes(value) && (
                    <SelectItem value={value} disabled className="hidden">
                      {value}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>

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

            {value && !field.options.includes(value) && (
              <div className="absolute top-0 right-8">
                <span className="flex h-2 w-2 rounded-full bg-amber-500" title="Extracted value not in list" />
              </div>
            )}
          </ValueCell>
        </RowWrapper>
      );
    }

    return (
      <RowWrapper key={field.id} isEven={isEven}>
        <LabelCell isUnique={field.isUnique}>{field.displayName || field.name.replace(/_/g, ' ')}</LabelCell>
        <ValueCell isUnique={field.isUnique}>
          <Input
            value={value || ''}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            className="border-transparent focus:border-blue-500 hover:border-gray-200 focus:ring-1 focus:ring-blue-500 bg-transparent shadow-none h-7 text-xs md:text-xs transition-all px-2"
            readOnly={!onDataChange}
            placeholder="-"
          />
        </ValueCell>
      </RowWrapper>
    );
  };

  const content = (
    <ResizablePanelGroup id={panelGroupInstanceId.groupId} orientation="horizontal" className="h-full w-full min-h-0">
      {/* Preview Panel */}
      <ResizablePanel id={panelGroupInstanceId.panel1} order={1} defaultSize={40} minSize={20} maxSize={60} className="h-full min-h-0 flex flex-col">
        <div className="h-full max-h-full flex flex-col min-h-0 overflow-hidden shadow-sm">
          {isCardCapture ? (
            <div className={`h-full max-h-full flex flex-col min-h-0 border ${getStylesByType?.(type || 'principal')?.getBgColor() || 'bg-white'} ${getStylesByType?.(type || 'principal')?.getBorderColor() || 'border-gray-200'} overflow-hidden`}>
              {/* Header */}
              <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
                <h3 className="text-sm font-bold text-gray-800">Card Preview</h3>
                <p className="text-xs text-gray-500">Review both sides before extraction</p>
              </div>

              {/* Image Grid - Stacked Vertically for landscape cards */}
              <div className="flex-1 overflow-auto p-4 bg-gray-50/30">
                <div className="flex flex-col gap-4 h-full min-h-0">
                  {/* Front Image */}
                  {fileUrl ? (
                    <div className="flex-1 min-h-[220px] group relative rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col">
                      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md text-white text-xs font-bold px-2 py-1 rounded-md z-10">
                        FRONT
                      </div>
                      <div className="flex-1 flex items-center justify-center bg-gray-50 p-2 min-h-0">
                        <img
                          src={fileUrl}
                          alt="Front"
                          className="max-w-full max-h-full object-contain rounded"
                        />
                      </div>
                      <div className="px-2 py-1.5 border-t border-gray-100 bg-white flex-shrink-0">
                        <span className="text-xs text-gray-400 truncate block" title={fileName}>{fileName}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-[150px] border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center bg-gray-50/50">
                      <div className="w-10 h-10 mb-2 rounded-full bg-gray-100 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-gray-300" />
                      </div>
                      <p className="text-xs text-gray-400 font-medium">No image uploaded</p>
                    </div>
                  )}

                  {/* Back Image (if available) */}
                  {extractedData?.backFileUrl ? (
                    <div className="flex-1 min-h-[220px] group relative rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col">
                      <div className="absolute top-2 left-2 bg-gray-600/60 backdrop-blur-md text-white text-xs font-bold px-2 py-1 rounded-md z-10">
                        BACK
                      </div>
                      <div className="flex-1 flex items-center justify-center bg-gray-50 p-2 min-h-0">
                        <img
                          src={extractedData.backFileUrl}
                          alt="Back"
                          className="max-w-full max-h-full object-contain rounded"
                        />
                      </div>
                      <div className="px-2 py-1.5 border-t border-gray-100 bg-white flex-shrink-0">
                        <span className="text-xs text-gray-400 truncate block" title={extractedData.backFileName}>{extractedData.backFileName}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-[150px] border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center bg-gray-50/50">
                      <div className="w-10 h-10 mb-2 rounded-full bg-gray-100 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-gray-300" />
                      </div>
                      <p className="text-xs text-gray-400 font-medium">Back not uploaded</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <DocumentPreview fileUrl={fileUrl} fileName={fileName} documentName={documentName} />
          )}
        </div>
      </ResizablePanel>

      <ResizableHandle />

      {/* Extracted Data Panel */}
      <ResizablePanel id={panelGroupInstanceId.panel2} order={2} defaultSize={60} minSize={30} maxSize={80} className="h-full min-h-0 flex flex-col">
        <div className="h-full max-h-full flex flex-col min-h-0 overflow-hidden shadow-sm">
          <div className={`h-full max-h-full flex flex-col min-h-0 ${getStylesByType?.(type || 'principal')?.getBgColor() || 'bg-white'} ${getStylesByType?.(type || 'principal')?.getBorderColor() || 'border-gray-200'} overflow-hidden`}>

            {/* Header Section */}
            <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
              <div className="flex flex-wrap justify-between items-center gap-3">
                <div>
                  <h3 className="text-base font-bold text-gray-800">Extracted Details</h3>
                  {(uploadedAt || modifiedAt || updatedAt) && (
                    <div className="mt-1 space-y-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
                      {uploadedAt && (
                        <p className="text-xs text-gray-500">
                          <span className="font-semibold">Uploaded:</span> {formatDateTimeToDMY(uploadedAt)}
                          {uploadedBy && <> by <span className="font-semibold">{uploadedBy}</span></>}
                        </p>
                      )}
                      {modifiedAt && (
                        <p className="text-xs text-gray-500">
                          <span className="font-semibold">Edited:</span> {formatDateTimeToDMY(modifiedAt)}
                          {modifiedBy && <> by <span className="font-semibold">{modifiedBy}</span></>}
                        </p>
                      )}
                      {updatedAt && (!modifiedAt || modifiedAt !== updatedAt) && (
                        <p className="text-xs text-gray-500">
                          <span className="font-semibold">Last updated:</span> {formatDateTimeToDMY(updatedAt)}
                        </p>
                      )}
                    </div>
                  )}
                </div>

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
                      id: file?.id || documentId,
                      file_path: fileUrl
                    }}
                    documentTypes={documentTypes || []}
                    supabase={supabase}
                    onSave={onSave ? handleSave : undefined}
                    onDelete={onDelete ? handleDelete : undefined}
                    onRetry={onRetryExtraction ? handleRetryExtraction : undefined}
                    onRetryWithAI={onRetryExtractionWithAI ? handleRetryExtractionWithAI : undefined}
                    onDownloadSuccess={() => toast({ title: 'Success', description: 'Download started' })}
                    onDownloadError={(error) => toast({ title: 'Error', description: error?.message || 'Download failed', variant: 'destructive' })}
                    className="ml-auto"
                    showDeleteConfirmation={true}
                    naming={downloadNaming}
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

            {/* Table Column Headers */}
            <div className="flex bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider flex-shrink-0">
              <div className="w-full sm:w-[160px] p-3 border-r border-gray-200">Field</div>
              <div className="flex-1 p-3">Value</div>
            </div>

            {/* Scrollable List Area */}
            <div className="flex-1 overflow-auto bg-white scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
              {(() => {
                const hasSections = resolvedFields.some(f => f.section);
                if (!hasSections) {
                  return (
                    <div className="flex flex-col">
                      {resolvedFields
                        .sort((a, b) => {
                          const order = ['name', 'company_name', 'date', 'reference_number', 'file_number'];
                          const aName = (a?.name || '').toLowerCase();
                          const bName = (b?.name || '').toLowerCase();
                          const aIndex = order.indexOf(aName);
                          const bIndex = order.indexOf(bName);
                          return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
                        })
                        .map((field, index) => renderField(field, index))}
                    </div>
                  );
                }

                const grouped: Record<string, Field[]> = {};
                const sectionOrder: string[] = [];
                resolvedFields.forEach(f => {
                  const key = f.section || '__ungrouped__';
                  if (!grouped[key]) { grouped[key] = []; sectionOrder.push(key); }
                  grouped[key].push(f);
                });

                return sectionOrder.map(sectionKey => {
                  const sectionFields = grouped[sectionKey];
                  const isUngrouped = sectionKey === '__ungrouped__';
                  const meta = !isUngrouped ? (SECTION_META[sectionKey] || { label: sectionKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), icon: null }) : null;
                  const isCollapsed = !!collapsedSections[sectionKey];

                  if (isUngrouped) {
                    return (
                      <div key={sectionKey} className="flex flex-col">
                        {sectionFields.map((field, index) => renderField(field, index))}
                      </div>
                    );
                  }

                  return (
                    <div key={sectionKey} className="border-b border-gray-100">
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionKey)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-gray-50/80 hover:bg-gray-100/80 transition-colors text-left sticky top-0 z-10"
                      >
                        {meta?.icon && <meta.icon className="h-3.5 w-3.5 text-gray-400" />}
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider flex-1">{meta?.label || sectionKey}</span>
                        <span className="text-xs text-gray-400 font-medium mr-1">{sectionFields.length} fields</span>
                        {isCollapsed ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronUp className="h-3.5 w-3.5 text-gray-400" />}
                      </button>
                      {!isCollapsed && (
                        <div className="flex flex-col">
                          {sectionFields.map((field, index) => renderField(field, index))}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}

              {extractedData?.comment && (
                <div className="p-4 border-t border-gray-200 bg-yellow-50/30">
                  <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase">Upload Comment</h4>
                  <div className="p-3 bg-white border border-gray-200 rounded-md text-xs text-gray-700 italic">
                    &ldquo;{extractedData.comment}&rdquo;
                  </div>
                </div>
              )}

              <div className="h-4"></div>
            </div>

          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );

  if (expanded) {
    return content;
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[98vw] sm:max-w-[98vw] max-h-[98vh] sm:h-[95vh] p-0 overflow-hidden flex flex-col bg-gray-50">
          <DialogHeader className="p-4 border-b bg-white shrink-0">
            <DialogTitle>Document Details Extraction: {documentName}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden flex items-stretch justify-center">
            <div className="w-full max-w-[1800px] flex items-stretch min-w-0 min-h-0 h-full">
              {content}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
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