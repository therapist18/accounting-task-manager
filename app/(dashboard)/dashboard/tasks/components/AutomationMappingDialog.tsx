// @ts-nocheck
"use client"

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Zap, User, Database, FileText, Eye, Image as ImageIcon } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from '@/hooks/use-toast';
import supabase from '@/lib/supabase/client';
import ExtractionPreview from '@/components/ExtractionPreview';

// Interfaces
interface AutomationMappingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  requirementId: string;
  taskId?: string;
  automationId?: string;
  isSubclass?: boolean;
  subDeptId?: string;
  subclassId?: string;
  task?: any;
  individualId?: string;
}

interface WebDataField {
  name: string;
  type: string;
  order: number;
  fieldType: string;
  isVisible?: boolean;
  isRequired: boolean;
  description: string;
  variableName: string;
  efnsDisplayName: string;
  masterFieldIds: string[];
  arrayItems?: any[];
  entityType: string;
  masterFields?: any[];
}

interface WebDataItem {
  fields: WebDataField[];
  documentId: string;
  automationId: string;
  documentName: string;
  kycDocsUpload?: KycDocUpload[];
}

interface KycDocUpload {
  entityType: string;
  isRequired: boolean;
  documentType: string;
  kycDocumentId: string;
  maxFileSizeMb: number;
  fileExtensions: string[];
}

interface JobFieldSource {
  path: string;
  table: string;
  priority: number;
  source_type: string;
}

interface JobField {
  id: number;
  field_key: string;
  label: string;
  type: string;
  is_required: boolean;
  sources: JobFieldSource[];
  options: any;
  created_at: string;
  updated_at: string;
  section_id: string | null;
  order_index: number;
  placeholder: string | null;
  show_in_table: boolean;
  show_in_dialog: boolean;
  table_header: string | null;
  class_name: string | null;
  col_span: number;
  callback: any;
  data_source: any;
  depends_on: any;
  has_dependent: boolean;
  static_options: any;
}

interface DocumentFile {
  id: string;
  director_id: string;
  document_id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
  status: string;
}

interface SourceData {
  [key: string]: any;
}

interface Field {
  id: string;
  name: string;
  type: string;
  isArray?: boolean;
  required?: boolean;
  arrayConfig?: {
    fields?: Array<{
      id: string;
      name: string;
      type: string;
      parentField?: string;
      isArray?: boolean;
      arrayConfig?: any;
    }>;
    maxItems?: number;
  };
}

export const AutomationMappingDialog = ({
  isOpen,
  onClose,
  classId,
  requirementId,
  taskId,
  automationId,
  isSubclass = false,
  subDeptId = '',
  subclassId = '',
  task,
  individualId
}: AutomationMappingDialogProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webData, setWebData] = useState<WebDataItem[]>([]);
  const [jobFields, setJobFields] = useState<Record<string, JobField>>({});
  const [sourceData, setSourceData] = useState<Record<string, SourceData>>({});
  const [documentFiles, setDocumentFiles] = useState<DocumentFile[]>([]);
  const [previewDocument, setPreviewDocument] = useState<{
    file: DocumentFile;
    fileUrl: string;
    fields: Field[];
    extractedData: any;
  } | null>(null);
  const [editingCell, setEditingCell] = useState<{rowIndex: number, sourceIndex: number, table: string, path: string} | null>(null);
  const [editValue, setEditValue] = useState('');

  const getIndividualId = () => {
    if (individualId) return individualId;
    if (task?.individual_id) return task.individual_id.toString();
    if (task?.principal_member) return task.principal_member.toString();
    return '';
  };

  const [currentIndividualId, setCurrentIndividualId] = useState(getIndividualId());

  const getRequirementId = () => {
    let effectiveSubDeptId = subDeptId;
    if (!effectiveSubDeptId && task) {
      if (task.subdepartment?.id) effectiveSubDeptId = task.subdepartment.id.toString();
      else if (task.subdepartment_id) effectiveSubDeptId = task.subdepartment_id.toString();
      else if (task.sub_dept_id) effectiveSubDeptId = task.sub_dept_id.toString();
    }

    if (!effectiveSubDeptId) {
      if (isSubclass && subclassId) return classId;
      return classId;
    }

    if (isSubclass && subclassId) return `${effectiveSubDeptId}_${classId}_${subclassId}`;
    return `${effectiveSubDeptId}_${classId}`;
  };

  const getNestedValue = (obj: any, path: string): any => {
    if (!obj) return undefined;
    if (path.includes('->>')) {
      const [jsonColumn, jsonPath] = path.split('->>').map(s => s.trim().replace(/['"]/g, ''));
      const jsonData = obj[jsonColumn];
      if (typeof jsonData === 'object' && jsonData !== null) {
        return jsonPath.split('.').reduce((acc, key) =>
          acc && typeof acc === 'object' ? acc[key] : undefined, jsonData);
      }
      return undefined;
    }
    return path.split('.').reduce((acc, key) =>
      acc && typeof acc === 'object' ? acc[key] : undefined, obj);
  };

  const fetchSourceData = async (individualId: string) => {
    if (!individualId || !jobFields || Object.keys(jobFields).length === 0) return;

    setIsLoadingData(true);
    try {
      const sourceDataMap: Record<string, any> = {};
      const allSources = Object.values(jobFields).flatMap(field => field.sources || []);
      const uniqueTables = [...new Set(allSources.map(source => source.table))];

      for (const table of uniqueTables) {
        try {
          const queryField = table === 'acc_portal_directors_documents' ? 'director_id' : 'id';
          const { data, error } = await supabase.from(table).select('*').eq(queryField, individualId).maybeSingle();
          if (error) {
            const { data: multipleData, error: multipleError } = await supabase.from(table).select('*').eq(queryField, individualId);
            if (multipleError) sourceDataMap[table] = {};
            else sourceDataMap[table] = multipleData || [];
          } else {
            sourceDataMap[table] = data || {};
          }
        } catch (err) {
          sourceDataMap[table] = {};
        }
      }
      setSourceData(sourceDataMap);
    } catch (error) {
      console.error('Error fetching source data:', error);
      toast({ title: 'Warning', description: 'Could not fetch all source data', variant: 'destructive' });
    } finally {
      setIsLoadingData(false);
    }
  };

  const fetchDocumentFiles = async (individualId: string) => {
    if (!individualId) return;

    setIsLoadingDocuments(true);
    try {
      // Get all kyc document IDs from the webData kycDocsUpload
      const allKycDocumentIds = webData.flatMap(item => 
        (item.kycDocsUpload || []).map(upload => upload.kycDocumentId)
      ).filter(Boolean);

      if (allKycDocumentIds.length === 0) {
        setDocumentFiles([]);
        return;
      }

      // Fetch documents that match the director_id AND have document_id in our kycDocumentIds
      const { data, error } = await supabase
        .from('acc_portal_directors_documents')
        .select('*')
        .eq('director_id', individualId)
        .in('document_id', allKycDocumentIds);

      if (error) {
        console.error('Error fetching documents:', error);
        setDocumentFiles([]);
      } else {
        setDocumentFiles(data || []);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      setDocumentFiles([]);
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  const getDocumentFileUrl = (filePath: string) => {
    if (!filePath) return '';
    const { data } = supabase.storage.from('kyc-documents').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const convertWebDataFieldsToFields = (webDataFields: WebDataField[]): Field[] => {
    return webDataFields.map(field => ({
      id: field.variableName || field.name,
      name: field.efnsDisplayName || field.name,
      type: field.fieldType === 'array' ? 'array' : field.type || 'text',
      isArray: field.fieldType === 'array',
      required: field.isRequired,
      arrayConfig: field.arrayItems && field.arrayItems.length > 0 ? {
        fields: field.arrayItems.map((item: any) => ({
          id: item.variableName || item.name,
          name: item.name,
          type: item.type || 'text'
        })),
        maxItems: 10
      } : undefined
    }));
  };

  const handleDocumentPreview = async (file: DocumentFile) => {
    try {
      const fileUrl = getDocumentFileUrl(file.file_path);
      
      // Find the corresponding kyc document configuration
      const kycDocConfig = webData.flatMap(item => item.kycDocsUpload || [])
        .find(doc => doc.kycDocumentId === file.document_id);

      if (!kycDocConfig) {
        toast({ title: 'Error', description: 'Document configuration not found', variant: 'destructive' });
        return;
      }

      // Fetch the KYC document details to get the fields
      const { data: kycDocument, error: kycError } = await supabase
        .from('acc_portal_kyc')
        .select('*')
        .eq('id', file.document_id)
        .single();

      if (kycError || !kycDocument) {
        toast({ title: 'Error', description: 'Failed to load document configuration', variant: 'destructive' });
        return;
      }

      // Convert KYC document fields to the format expected by ExtractionPreview
      const kycFields = kycDocument.fields || [];
      const documentFields = kycFields.map((field: any) => ({
        id: field.id || field.fieldName || field.name,
        name: field.fieldName || field.name || field.id,
        type: field.fieldType || field.type || 'text',
        isArray: field.isArray || field.type === 'array',
        required: field.isRequired || false,
        arrayConfig: field.arrayConfig ? {
          fields: (field.arrayConfig.fields || []).map((subField: any) => ({
            id: subField.id || subField.fieldName || subField.name,
            name: subField.fieldName || subField.name || subField.id,
            type: subField.fieldType || subField.type || 'text'
          })),
          maxItems: field.arrayConfig.maxItems || 10
        } : undefined
      }));

      // Get extracted data from the document file
      const extractedData = file.extracted_details || {};
      
      // Ensure all fields have values in extractedData
      documentFields.forEach((field: any) => {
        if (extractedData[field.id] === undefined && extractedData[field.name] === undefined) {
          extractedData[field.id] = field.isArray ? [] : '';
          extractedData[field.name] = field.isArray ? [] : '';
        }
      });

      setPreviewDocument({
        file,
        fileUrl,
        fields: documentFields,
        extractedData
      });
    } catch (error) {
      console.error('Error preparing document preview:', error);
      toast({ title: 'Error', description: 'Failed to prepare document preview', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const requirementId = getRequirementId();

        const { data: requirement, error: requirementError } = await supabase
          .from('tm_class_requirements').select('*').eq('class_id', requirementId).maybeSingle();

        if (requirementError || !requirement) {
          const { data: fallbackReq, error: fallbackError } = await supabase
            .from('tm_class_requirements').select('*').eq('class_id', classId).maybeSingle();

          if (fallbackReq && !fallbackError) {
            const webDataItems = fallbackReq.webData || [];
            setWebData(webDataItems);
            const allMasterFieldIds = webDataItems.flatMap((item: WebDataItem) => 
              item.fields?.flatMap(field => field.masterFieldIds || []) || []
            ).filter(Boolean);
            if (allMasterFieldIds.length > 0) {
              const { data: fields, error: fieldsError } = await supabase.from('tm_job_fields').select('*').in('id', allMasterFieldIds);
              if (fieldsError) throw new Error('Failed to fetch job fields');
              if (fields) setJobFields(fields.reduce((acc, field) => ({ ...acc, [field.id.toString()]: field }), {}));
            }
            return;
          }
          throw new Error(`No requirement found for ID: ${requirementId}`);
        }

        const webDataItems = requirement.webData || [];
        setWebData(webDataItems);

        const allMasterFieldIds = webDataItems.flatMap((item: WebDataItem) => 
          item.fields?.flatMap(field => field.masterFieldIds || []) || []
        ).filter(Boolean);
        
        if (allMasterFieldIds.length > 0) {
          const { data: fields, error: fieldsError } = await supabase.from('tm_job_fields').select('*').in('id', allMasterFieldIds);
          if (fieldsError) throw new Error('Failed to fetch job fields');
          if (fields) setJobFields(fields.reduce((acc, field) => ({ ...acc, [field.id.toString()]: field }), {}));
        }
      } catch (error) {
        console.error('Error fetching mapping data:', error);
        setError('Failed to load mapping data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [isOpen, classId, requirementId, task]);

  useEffect(() => {
    if (currentIndividualId && Object.keys(jobFields).length > 0) {
      fetchSourceData(currentIndividualId);
      fetchDocumentFiles(currentIndividualId);
    }
  }, [currentIndividualId, jobFields]);

  const prepareFormData = () => {
    const formData: Record<string, any> = {};
    
    webData.forEach(item => {
      item.fields?.forEach(field => {
        const { sources } = getSourceInfo(field.masterFieldIds || []);
        if (sources.length > 0) {
          const sourceInfo = sources[0];
          const value = getSourceValue(sourceInfo.table, sourceInfo.path);
          
          if (typeof value === 'string' && value !== 'Missing') {
            formData[field.variableName] = value;
          }
        }
      });
    });

    return formData;
  };

  const handleRunAutomation = async () => {
    if (!currentIndividualId) {
      toast({ 
        title: 'Error', 
        description: 'Please enter an Individual ID to run automation', 
        variant: 'destructive' 
      });
      return;
    }

    try {
      setIsAutomationRunning(true);
      
      const formData = prepareFormData();
      
      const payload = {
        url: "https://fns.immigration.go.ke/account/login.html",
        login: {
          email: "edwinnyakundi91@gmail.com",
          idNumber: "30247621",
          password: "Nyakundi298"
        },
        formData: formData,
        taskId: taskId,
        individualId: currentIndividualId,
        classId: classId,
        requirementId: getRequirementId()
      };

      console.log('Sending automation request with payload:', payload);

      const response = await fetch('http://localhost:3000/api/permit/class-C', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to start automation');
      }

      toast({ 
        title: 'Success', 
        description: result.message || 'Automation completed successfully', 
        variant: 'default' 
      });

    } catch (error) {
      console.error('Error triggering automation:', error);
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        toast({ 
          title: 'Connection Error', 
          description: 'Could not connect to automation server. Make sure the server is running on localhost:3000', 
          variant: 'destructive' 
        });
      } else {
        toast({ 
          title: 'Error', 
          description: error instanceof Error ? error.message : 'Failed to start automation', 
          variant: 'destructive' 
        });
      }
    } finally {
      setIsAutomationRunning(false);
    }
  };

  const getSourceInfo = (masterFieldIds: string[]) => {
    if (!masterFieldIds || masterFieldIds.length === 0) return { sources: [], hasData: false };
    const sources = masterFieldIds.map(fieldId => {
      const field = jobFields[fieldId];
      if (!field || !field.sources || field.sources.length === 0) return null;
      const source = field.sources[0];
      return {
        fieldLabel: field.label,
        source: `${source.table}.${source.path}`,
        table: source.table,
        path: source.path,
      };
    }).filter(Boolean);
    return { sources, hasData: sources.length > 0 };
  };

  const getSourceValue = (table: string, path: string) => {
    const tableData = sourceData[table];
    if (!tableData) return "Missing";
    if (Array.isArray(tableData)) {
      if (tableData.length === 0) return "Missing";
      for (const row of tableData) {
        const value = getNestedValue(row, path);
        if (value !== undefined && value !== null) return String(value);
      }
      return "Missing";
    }
    const value = getNestedValue(tableData, path);
    return value !== undefined && value !== null ? String(value) : "Missing";
  };

  const startEditing = (rowIndex: number, sourceIndex: number, table: string, path: string, currentValue: string) => {
    setEditingCell({ rowIndex, sourceIndex, table, path });
    setEditValue(currentValue === 'Missing' ? '' : currentValue);
  };

  const stopEditing = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveEdit = async () => {
    if (!editingCell || !currentIndividualId) return;
    
    const { table, path } = editingCell;
    setIsLoadingData(true);
    
    try {
      let updateData = {};
      const pathParts = path.split('.');
      
      if (pathParts.length > 1) {
        let current = {};
        let temp = current;
        for (let i = 0; i < pathParts.length - 1; i++) {
          temp[pathParts[i]] = {};
          temp = temp[pathParts[i]];
        }
        temp[pathParts[pathParts.length - 1]] = editValue;
        updateData = current;
      } else {
        updateData = { [path]: editValue };
      }

      const queryField = table === 'acc_portal_directors_documents' ? 'director_id' : 'id';
      
      const { data: existingData, error: fetchError } = await supabase
        .from(table)
        .select('*')
        .eq(queryField, currentIndividualId)
        .maybeSingle();

      if (fetchError && !existingData) {
        const { error: insertError } = await supabase
          .from(table)
          .upsert({
            [queryField]: currentIndividualId,
            ...updateData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        
        if (insertError) throw insertError;
      } else {
        const { error: updateError } = await supabase
          .from(table)
          .update({
            ...updateData,
            updated_at: new Date().toISOString()
          })
          .eq(queryField, currentIndividualId);
        
        if (updateError) throw updateError;
      }

      await fetchSourceData(currentIndividualId);
      toast({
        title: 'Success',
        description: 'Field updated successfully',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error updating field:', error);
      toast({
        title: 'Error',
        description: 'Failed to update field',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingData(false);
      stopEditing();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEdit();
    } else if (e.key === 'Escape') {
      stopEditing();
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.startsWith('image/')) {
      return <ImageIcon className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  const renderFieldsTable = () => {
    if (!webData.length || !webData[0].fields) {
      return (
        <div className="text-center p-8 text-gray-500 h-full flex flex-col items-center justify-center">
          <Database className="h-10 w-10 mb-2 text-gray-300" />
          <p>No web data fields found for this requirement.</p>
        </div>
      );
    }

    const fields = webData[0].fields;

    return (
      <div className="rounded-md border">
        <Table className="max-h-[90vh] flex flex-col overflow-y-auto">
          <TableHeader className="bg-blue-500">
            <TableRow>
              <TableHead className="w-[50px] border-r text-white">#</TableHead>
              <TableHead className="border-r text-white">WebData Field</TableHead>
              <TableHead className="border-r text-white">Source</TableHead>
              <TableHead className="text-white">Current Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => {
              const { sources, hasData } = getSourceInfo(field.masterFieldIds || []);

              return (
                <TableRow key={field.variableName || index}>
                  <TableCell className="align-top border-r w-[50px]">{index + 1}</TableCell>
                  <TableCell className="align-top border-r">
                    <div className="text-sm font-medium text-gray-900">
                      {field.efnsDisplayName || field.name}
                      {field.isRequired && <span className="ml-1 text-red-500">*</span>}
                    </div>
                    <div className="text-xs text-gray-500 font-mono mt-1">
                      {field.variableName}
                    </div>
                    <Badge variant="outline" className="mt-1 text-xs">
                      {field.fieldType}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top border-r">
                    {hasData ? (
                      <div className="space-y-2">
                        {sources.map((sourceInfo, idx) => (
                          <div key={idx} className="font-mono text-xs">
                            <span className="font-semibold text-gray-800">{sourceInfo.fieldLabel}</span>
                            <span className="text-gray-400 mx-1">→</span>
                            <span>{sourceInfo.source}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No source linked</span>
                    )}
                  </TableCell>
                  <TableCell 
                    className="align-top border-r cursor-pointer hover:bg-gray-50"
                    onClick={() => {
                      if (currentIndividualId && hasData) {
                        const sourceInfo = sources[0];
                        const currentValue = getSourceValue(sourceInfo.table, sourceInfo.path);
                        startEditing(index, 0, sourceInfo.table, sourceInfo.path, currentValue);
                      }
                    }}
                  >
                    {editingCell?.rowIndex === index ? (
                      <div className="flex items-center space-x-2">
                        <Input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={saveEdit}
                          className="h-8 text-sm"
                        />
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={(e) => {
                            e.stopPropagation();
                            saveEdit();
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    ) : currentIndividualId ? (
                      hasData ? (
                        <div className="space-y-2 text-sm">
                          {sources.map((sourceInfo, idx) => {
                            const value = getSourceValue(sourceInfo.table, sourceInfo.path);
                            return (
                              <div 
                                key={idx} 
                                className="p-1 rounded hover:bg-gray-100"
                              >
                                {typeof value === 'string' ? value : <span className="text-red-600">Missing</span>}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No mapping</span>
                      )
                    ) : (
                      <span className="text-xs text-gray-400">Enter ID</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderDocumentsSection = () => {
    if (isLoadingDocuments) {
      return (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading documents...</span>
        </div>
      );
    }

    if (!documentFiles.length) {
      return (
        <div className="text-center p-8 text-gray-500">
          <FileText className="h-10 w-10 mb-2 text-gray-300 mx-auto" />
          <p>No documents found for this individual.</p>
          {!currentIndividualId && (
            <p className="text-sm mt-1">Enter an Individual ID to view documents.</p>
          )}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documentFiles.map((file) => {
          const kycDocConfig = webData.flatMap(item => item.kycDocsUpload || [])
            .find(doc => doc.kycDocumentId === file.document_id);

          return (
            <Card key={file.id} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getFileIcon(file.mime_type)}
                    <CardTitle className="text-sm font-medium truncate">
                      {file.file_name || 'Untitled Document'}
                    </CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {file.mime_type?.split('/')[1]?.toUpperCase() || 'FILE'}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  {kycDocConfig?.entityType || 'Document'} • {Math.round(file.file_size / 1024)} KB
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    Uploaded: {new Date(file.uploaded_at).toLocaleDateString()}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDocumentPreview(file)}
                    className="gap-1"
                  >
                    <Eye className="h-3 w-3" />
                    Preview
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Automation Mapping & Data Preview</DialogTitle>
            <DialogDescription>
              View the data mapping for this requirement and preview source data for a specific individual.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-4 py-2 border-b">
            <Label htmlFor="individualId" className="whitespace-nowrap flex items-center gap-2">
              <User className="h-4 w-4 text-gray-500" />
              Individual ID:
            </Label>
            <Input
              id="individualId"
              value={currentIndividualId}
              onChange={(e) => setCurrentIndividualId(e.target.value)}
              placeholder="Enter individual ID to preview data"
              className="max-w-sm"
            />
            {(isLoadingData || isLoadingDocuments) && <Loader2 className="h-4 w-4 animate-spin" />}
            {task?.individual_id && (
              <div className="text-xs text-gray-500 hidden sm:block">
                (From task: {task.individual_id} - {task.applicant_name || 'Unknown'})
              </div>
            )}
          </div>

          <div className="flex-grow overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center p-8 h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Loading mapping data...</span>
              </div>
            ) : error ? (
              <div className="text-red-600 p-4 bg-red-50 rounded-md h-full flex items-center justify-center">
                {error}
              </div>
            ) : (
              <Tabs defaultValue="fields" className="h-full flex flex-col">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="fields" className="gap-2">
                    <Database className="h-4 w-4" />
                    Field Mapping
                  </TabsTrigger>
                  <TabsTrigger value="documents" className="gap-2">
                    <FileText className="h-4 w-4" />
                    Documents ({documentFiles.length})
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="fields" className="flex-grow overflow-y-auto mt-4">
                  {renderFieldsTable()}
                </TabsContent>
                
                <TabsContent value="documents" className="flex-grow overflow-y-auto mt-4">
                  {renderDocumentsSection()}
                </TabsContent>
              </Tabs>
            )}
          </div>

          <div className="flex justify-between items-center pt-4 border-t mt-auto">
            <div>
              <Button
                onClick={handleRunAutomation}
                disabled={isAutomationRunning || !currentIndividualId || isLoadingData}
                variant="default"
                className="gap-2"
              >
                {isAutomationRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Start Automation
              </Button>
            </div>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Preview Dialog */}
      {previewDocument && (
        <Dialog open={!!previewDocument} onOpenChange={() => setPreviewDocument(null)}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full p-0">
            <DialogHeader className="p-6 pb-0">
              <DialogTitle className="flex items-center gap-2">
                {getFileIcon(previewDocument.file.mime_type)}
                {previewDocument.file.file_name || 'Document Preview'}
                <Badge variant="outline" className="ml-2">
                  {previewDocument.file.mime_type?.split('/')[1]?.toUpperCase() || 'FILE'}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                Review the document and its extracted data (Individual ID: {currentIndividualId})
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-hidden p-6 pt-2">
              <ExtractionPreview
                documentName={previewDocument.file.file_name || 'Document'}
                extractedData={previewDocument.extractedData}
                fields={previewDocument.fields}
                fileUrl={previewDocument.fileUrl}
                fileName={previewDocument.file.file_name}
                viewMode={true}
                showSaveButton={false}
                documentId={previewDocument.file.id}
                onClose={() => setPreviewDocument(null)}
                onDataChange={(fieldName, value) => {
                  console.log('Field changed in preview:', fieldName, value);
                }}
                onSave={(updatedData) => {
                  console.log('Document data saved:', updatedData);
                  setPreviewDocument(null);
                  toast({ 
                    title: "Success", 
                    description: "Document details updated successfully." 
                  });
                }}
                getStylesByType={(type) => ({
                  getBgColor: () => 'bg-primary',
                  getTextColor: () => 'text-primary-foreground',
                  getBorderColor: () => 'border-primary',
                  getButtonStyle: () => 'bg-primary hover:bg-primary/90 text-primary-foreground'
                })}
              />
            </div>
            <DialogFooter className="p-6 pt-0 border-t">
              <div className="flex items-center justify-between w-full">
                <div className="text-sm text-gray-500">
                  Document ID: {previewDocument.file.document_id} | 
                  Size: {Math.round(previewDocument.file.file_size / 1024)} KB |
                  Uploaded: {new Date(previewDocument.file.uploaded_at).toLocaleDateString()}
                </div>
                <Button variant="outline" onClick={() => setPreviewDocument(null)}>
                  Close Preview
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};