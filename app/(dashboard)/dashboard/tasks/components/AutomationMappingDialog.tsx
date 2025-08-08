// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Zap, User, Database, FileText, Eye, Image as ImageIcon, Settings, Link, Upload, Download, RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, Plus } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from '@/hooks/use-toast';
import supabase from '@/lib/supabase/client';
import ExtractionPreview from '@/components/ExtractionPreview';

// Enhanced interfaces
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
  stageDocuments?: any[];
  allDocuments?: any[];
  stage?: any;
}

interface AutomationDetails {
  id: string;
  name: string;
  description: string;
  webhook_url: string;
  webhook_type: string;
  webhook_method: string;
  login?: any;
  parameters?: any;
  is_active: boolean;
}

interface EntityAutomationMapping {
  entityKey: string;
  entityName: string;
  entityType: string;
  automationId: string;
  automation?: AutomationDetails;
}

interface DocumentStatus {
  hasDocument: boolean;
  status: 'Ready' | 'Not Linked' | 'Missing' | 'Old Document' | 'Uploading' | 'Processing';
  documentId?: string;
  filePath?: string;
  kycId?: string;
  canPreview: boolean;
  canUpload: boolean;
  statusColor: 'green' | 'red' | 'yellow' | 'blue' | 'gray';
}

// Helper function to get LINKED document for a stage (same as EditableStageCell)
const getLinkedDocumentForStage = (task: any, stage: any, allDocuments: any[]): any | null => {
  if (!task?.source_document_id || !stage?.id || !allDocuments?.length) {
    console.log('Missing data for getLinkedDocumentForStage:', {
      hasSourceDocumentId: !!task?.source_document_id,
      stageId: stage?.id,
      allDocumentsLength: allDocuments?.length || 0
    });
    return null;
  }

  const linkedDocumentData = task.source_document_id[stage.id];

  if (linkedDocumentData) {
    const documentId = typeof linkedDocumentData === 'string'
      ? linkedDocumentData
      : linkedDocumentData.id;

    const linkedDoc = allDocuments.find(doc => doc.id === documentId);

    console.log('Found linked document:', {
      stageId: stage.id,
      documentId: documentId,
      foundDoc: !!linkedDoc,
      docPath: linkedDoc?.file_path
    });

    return linkedDoc || null;
  }

  console.log('No linked document data for stage:', stage.id);
  return null;
};

// Helper function to build file URL (same pattern as EditableStageCell)
const buildFileUrl = (linkedDoc: any): string | null => {
  if (!linkedDoc?.file_path) {
    console.log('No file path in linked document:', linkedDoc);
    return null;
  }

  const bucketName = 'kyc-documents';
  const filePath = linkedDoc.file_path?.startsWith(bucketName)
    ? linkedDoc.file_path
    : `${bucketName}/${linkedDoc.file_path}`;

  const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;

  console.log('Built file URL:', {
    originalPath: linkedDoc.file_path,
    finalPath: filePath,
    fileUrl: fileUrl
  });

  return fileUrl;
};

// Helper function to check if document is older than task creation
const isDocumentOlderThanTask = (documentDate: string, taskDate: string): boolean => {
  try {
    const docDate = new Date(documentDate)
    const tskDate = new Date(taskDate)
    return docDate < tskDate
  } catch (error) {
    console.error('Error comparing dates:', error)
    return false
  }
}

// Helper function to parse JSON field paths properly
const parseJsonValue = (data: any, path: string): any => {
  if (!data || !path) return undefined;

  // Handle JSONB extraction paths like "column_name->>'property'" or "column_name->'property'"
  if (path.includes('->>') || path.includes('->')) {
    const parts = path.split(/(->>|->)/);
    const column = parts[0].trim().replace(/['"]/g, '');
    const jsonPath = parts[2].trim().replace(/['"]/g, '');

    const jsonData = data[column];
    if (!jsonData || typeof jsonData !== 'object') return undefined;

    // Navigate through nested JSON path
    return jsonPath.split('.').reduce((acc, key) => {
      if (acc && typeof acc === 'object') {
        return acc[key];
      }
      return undefined;
    }, jsonData);
  }

  // Handle regular nested paths
  return path.split('.').reduce((acc, key) => {
    if (acc && typeof acc === 'object') {
      return acc[key];
    }
    return undefined;
  }, data);
};

// Helper function to update JSON field values
const updateJsonValue = (existingData: any, path: string, newValue: any): any => {
  if (!path) return { [path]: newValue };

  if (path.includes('->>') || path.includes('->')) {
    const parts = path.split(/(->>|->)/);
    const column = parts[0].trim().replace(/['"]/g, '');
    const jsonPath = parts[2].trim().replace(/['"]/g, '');

    const currentJsonData = existingData?.[column] || {};
    const pathParts = jsonPath.split('.');

    // Create nested structure
    const updatedJsonData = { ...currentJsonData };
    let current = updatedJsonData;

    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) {
        current[pathParts[i]] = {};
      }
      current = current[pathParts[i]];
    }

    current[pathParts[pathParts.length - 1]] = newValue;

    return { [column]: updatedJsonData };
  }

  // Handle regular nested paths
  const pathParts = path.split('.');
  const result: any = {};
  let current = result;

  for (let i = 0; i < pathParts.length - 1; i++) {
    current[pathParts[i]] = {};
    current = current[pathParts[i]];
  }

  current[pathParts[pathParts.length - 1]] = newValue;
  return result;
};

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
  individualId,
  stageDocuments = [],
  allDocuments = [],
  stage
}: AutomationMappingDialogProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webData, setWebData] = useState<any[]>([]);
  const [jobFields, setJobFields] = useState<Record<string, any>>({});
  const [sourceData, setSourceData] = useState<Record<string, any>>({});
  const [documentFiles, setDocumentFiles] = useState<any[]>([]);
  const [entityAutomationMappings, setEntityAutomationMappings] = useState<EntityAutomationMapping[]>([]);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>('');
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [editingCell, setEditingCell] = useState<any>(null);
  const [editValue, setEditValue] = useState('');
  const [documentStatuses, setDocumentStatuses] = useState<Record<string, DocumentStatus>>({});

  const getIndividualId = () => {
    if (individualId) return individualId;
    if (task?.individual_id) return task.individual_id.toString();
    if (task?.principal_member) return task.principal_member.toString();
    return '';
  };

  const [currentIndividualId, setCurrentIndividualId] = useState(getIndividualId());

  // Enhanced document status calculation
  const calculateDocumentStatus = useCallback((kycId: string): DocumentStatus => {
    const linkedDoc = getLinkedDocumentForStage(task, stage, allDocuments);
    const hasMatchingDoc = documentFiles.some(doc => doc.document_id === kycId);
    
    if (linkedDoc && linkedDoc.document_id === kycId) {
      const isOld = task?.created_at && isDocumentOlderThanTask(linkedDoc.created_at, task.created_at);
      const hasIndicator = linkedDoc.indicator === true;
      
      if (isOld) {
        return {
          hasDocument: true,
          status: 'Old Document',
          documentId: linkedDoc.id,
          filePath: linkedDoc.file_path,
          kycId,
          canPreview: false,
          canUpload: true,
          statusColor: 'yellow'
        };
      }
      
      if (hasIndicator) {
        return {
          hasDocument: true,
          status: 'Not Linked',
          documentId: linkedDoc.id,
          kycId,
          canPreview: false,
          canUpload: true,
          statusColor: 'yellow'
        };
      }
      
      return {
        hasDocument: true,
        status: 'Ready',
        documentId: linkedDoc.id,
        filePath: linkedDoc.file_path,
        kycId,
        canPreview: true,
        canUpload: true,
        statusColor: 'green'
      };
    }
    
    if (hasMatchingDoc) {
      return {
        hasDocument: true,
        status: 'Not Linked',
        kycId,
        canPreview: false,
        canUpload: true,
        statusColor: 'yellow'
      };
    }
    
      return {
      hasDocument: false,
      status: 'Missing',
      kycId,
      canPreview: false,
      canUpload: true,
      statusColor: 'red'
    };
  }, [task, stage, allDocuments, documentFiles]);

  // Enhanced function to get document URL for automation payload
  const getDocumentUrlForAutomation = useCallback((): string | null => {
    console.log('🔍 Getting document URL for automation...', {
      hasStage: !!stage,
      stageId: stage?.id,
      hasTask: !!task,
      taskId: task?.id,
      individualId: task?.individual_id,
      allDocumentsLength: allDocuments?.length || 0,
      documentFilesLength: documentFiles.length,
      hasSourceDocumentId: !!task?.source_document_id
    });

    if (!task?.individual_id) {
      console.log('❌ Missing individual ID');
      return null;
    }

    // Strategy 1: Try the intended stage if provided
    if (stage && task?.source_document_id?.[stage.id]) {
      console.log('🎯 Strategy 1: Using intended stage link...');
      const linkedDoc = getLinkedDocumentForStage(task, stage, allDocuments);
      if (linkedDoc) {
        const fileUrl = buildFileUrl(linkedDoc);
        console.log('✅ Strategy 1 succeeded:', { stageId: stage.id, fileUrl });
        return fileUrl;
      }
    }

    // Strategy 2: Try any stage that has a linked document
    if (task?.source_document_id && typeof task.source_document_id === 'object') {
      console.log('🔄 Strategy 2: Trying any linked stage...');

      for (const [stageId, docData] of Object.entries(task.source_document_id)) {
        const documentId = typeof docData === 'string' ? docData : (docData as any)?.id;
        const linkedDoc = allDocuments.find(doc => doc.id === documentId);

        if (linkedDoc && linkedDoc.file_path) {
          const fileUrl = buildFileUrl(linkedDoc);
          console.log('✅ Strategy 2 succeeded:', { usedStageId: stageId, fileUrl });
          return fileUrl;
        }
      }
    }

    // Strategy 3: Use the already-fetched documents that match webData requirements
    if (documentFiles.length > 0) {
      console.log('🔄 Strategy 3: Using fetched documents from webData requirements...');

      const webDataKycIds = webData.flatMap(item =>
        (item.kycDocsUpload || []).map(upload => upload.kycDocumentId)
      ).filter(Boolean);

      const matchingDoc = documentFiles.find(doc =>
        webDataKycIds.includes(doc.document_id) &&
        doc.file_path &&
        doc.status !== 'deleted'
      );

      if (matchingDoc) {
        const fileUrl = buildFileUrl(matchingDoc);
        console.log('✅ Strategy 3 succeeded with webData document:', {
          documentId: matchingDoc.id,
          kycId: matchingDoc.document_id,
          fileUrl
        });
        return fileUrl;
      }
    }

    console.log('❌ All strategies failed - no document URL available');
    return null;
  }, [stage, task, allDocuments, documentFiles, webData]);

    // Enhanced fetchSourceData with tm_tasks exception
  const fetchSourceData = useCallback(async (individualId: string) => {
    if (!individualId || !jobFields || Object.keys(jobFields).length === 0) return;

    if (isLoadingData) return;

    setIsLoadingData(true);
    try {
      const sourceDataMap: Record<string, any> = {};
      const allSources = Object.values(jobFields).flatMap(field => field.sources || []);
      const uniqueTables = [...new Set(allSources.map(source => source.table))];

      for (const table of uniqueTables) {
        try {
          let queryField = 'id';
          let queryValue = individualId;

          // Special handling for tm_tasks table
          if (table === 'tm_tasks') {
            queryField = 'task_id';
            queryValue = taskId || individualId;
          } else if (table === 'acc_portal_directors_documents') {
            queryField = 'director_id';
          }

          const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq(queryField, queryValue)
            .maybeSingle();

          if (error) {
            const { data: multipleData, error: multipleError } = await supabase
              .from(table)
              .select('*')
              .eq(queryField, queryValue);
            
            if (multipleError) {
              console.warn(`Failed to fetch from ${table}:`, multipleError);
              sourceDataMap[table] = {};
            } else {
              sourceDataMap[table] = multipleData || [];
            }
          } else {
            sourceDataMap[table] = data || {};
          }
        } catch (err) {
          console.error(`Error fetching from ${table}:`, err);
          sourceDataMap[table] = {};
        }
      }

      setSourceData(sourceDataMap);
    } catch (error) {
      console.error('Error fetching source data:', error);
      toast({ 
        title: 'Warning', 
        description: 'Could not fetch all source data', 
        variant: 'destructive' 
      });
    } finally {
      setIsLoadingData(false);
    }
  }, [jobFields, isLoadingData, taskId]);

  const fetchDocumentFiles = useCallback(async (individualId: string) => {
    if (!individualId || !webData.length) return;

    if (isLoadingDocuments) return;

    setIsLoadingDocuments(true);
    try {
      const allKycDocumentIds = webData.flatMap(item =>
        (item.kycDocsUpload || []).map(upload => upload.kycDocumentId)
      ).filter(Boolean);

      if (allKycDocumentIds.length === 0) {
        setDocumentFiles([]);
        return;
      }

      const { data, error } = await supabase
        .from('acc_portal_directors_documents')
        .select(`
          *,
          kyc_document:acc_portal_kyc!document_id(
            id,
            name,
            display_name,
            document_type,
            fields
          )
        `)
        .eq('director_id', individualId)
        .in('document_id', allKycDocumentIds)
        .neq('status', 'deleted');

      if (error) {
        console.error('Error fetching documents:', error);
        setDocumentFiles([]);
      } else {
        const validDocuments = (data || []).filter(doc =>
          doc.file_path &&
          doc.status !== 'deleted' &&
          allKycDocumentIds.includes(doc.document_id)
        );

        setDocumentFiles(validDocuments);
        
        // Update document statuses
        const newStatuses: Record<string, DocumentStatus> = {};
        allKycDocumentIds.forEach(kycId => {
          newStatuses[kycId] = calculateDocumentStatus(kycId);
        });
        setDocumentStatuses(newStatuses);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      setDocumentFiles([]);
    } finally {
      setIsLoadingDocuments(false);
    }
  }, [webData, isLoadingDocuments, calculateDocumentStatus]);

 // Function to handle document upload
 const handleDocumentUpload = useCallback(async (kycId: string, file: File) => {
  if (!currentIndividualId || !file) return;

  setIsUploading(true);
  
  try {
    // Update document status to uploading
    setDocumentStatuses(prev => ({
      ...prev,
      [kycId]: { ...prev[kycId], status: 'Uploading', statusColor: 'blue' }
    }));

    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('director_id', currentIndividualId);
    formData.append('document_id', kycId);

    // Upload file to your upload endpoint
    const uploadResponse = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload document');
    }

    const uploadResult = await uploadResponse.json();

    // Update document status to processing
    setDocumentStatuses(prev => ({
      ...prev,
      [kycId]: { ...prev[kycId], status: 'Processing', statusColor: 'blue' }
    }));

    // Trigger extraction if available
    if (uploadResult.documentId) {
      try {
        const extractResponse = await fetch('/api/documents/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            documentId: uploadResult.documentId,
            kycId: kycId,
          }),
        });

        if (extractResponse.ok) {
          const extractResult = await extractResponse.json();
          console.log('Extraction completed:', extractResult);
        }
      } catch (extractError) {
        console.error('Extraction failed:', extractError);
      }
    }

    // Refresh data
    await fetchDocumentFiles(currentIndividualId);
    
    toast({
      title: 'Success',
      description: 'Document uploaded and processed successfully',
      variant: 'default'
    });

  } catch (error) {
    console.error('Document upload error:', error);
    toast({
      title: 'Error',
      description: error instanceof Error ? error.message : 'Failed to upload document',
      variant: 'destructive'
    });
    
    // Reset status on error
    setDocumentStatuses(prev => ({
      ...prev,
      [kycId]: calculateDocumentStatus(kycId)
    }));
  } finally {
    setIsUploading(false);
  }
}, [currentIndividualId, fetchDocumentFiles, calculateDocumentStatus]);

  const renderDocumentsSection = () => {
    if (isLoadingDocuments) {
      return (
        <div className="flex flex-col items-center justify-center p-12 space-y-4 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div>
            <h4 className="font-medium text-gray-700">Loading Documents</h4>
            <p className="text-sm text-gray-500 mt-1">Fetching document information...</p>
          </div>
        </div>
      );
    }

    if (!currentIndividualId) {
      return (
        <div className="text-center p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
            <User className="h-8 w-8 text-blue-500" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900">Individual ID Required</h3>
          <p className="mt-2 text-gray-600">Please enter an Individual ID to view document status</p>
        </div>
      );
    }

    const requiredKycIds = webData.flatMap(item =>
      (item.kycDocsUpload || []).map(upload => upload.kycDocumentId)
    ).filter(Boolean);

    if (requiredKycIds.length === 0) {
      return (
        <div className="text-center p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
            <FileText className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No Document Requirements</h3>
          <p className="mt-2 text-gray-600">No document requirements found for this automation</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Enhanced Document Summary Card */}
        <div className="rounded-lg border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-sm overflow-hidden">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                  <Database className="h-6 w-6" />
                </div>
                <div className="ml-4">
                  <h3 className="text-xl font-semibold text-gray-900">Document Status</h3>
                  <p className="text-sm text-gray-600">
                    Individual: <span className="font-mono font-medium text-blue-700">{currentIndividualId}</span>
                    {task?.applicant_name && (
                      <span className="ml-2">({task.applicant_name})</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-800">
                  {requiredKycIds.filter(kycId => documentStatuses[kycId]?.hasDocument).length}/{requiredKycIds.length}
                </div>
                <div className="text-xs text-blue-600">Documents Available</div>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Document Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {requiredKycIds.map((kycId) => {
            const status = documentStatuses[kycId] || { 
              status: 'Missing', 
              hasDocument: false, 
              canPreview: false, 
              canUpload: true, 
              statusColor: 'red' 
            };
            
            const webDataDoc = webData.flatMap(item => item.kycDocsUpload || [])
              .find(doc => doc.kycDocumentId === kycId);
            
            const documentName = webDataDoc?.entityType || `Document ${kycId.slice(-4)}`;

            return (
              <Card key={kycId} className="relative overflow-hidden border-l-4 border-l-blue-400">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base font-medium text-gray-900 truncate">
                        {documentName}
                      </CardTitle>
                      <CardDescription className="text-xs font-mono text-gray-500 mt-1">
                        KYC ID: {kycId}
                      </CardDescription>
                    </div>
                    <StatusBadge status={status} />
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {status.canPreview && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDocumentPreview(kycId)}
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Preview
                        </Button>
                      )}
                      
                      {status.canUpload && (
                        <div className="relative">
                          <input
                            type="file"
                            id={`upload-${kycId}`}
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleDocumentUpload(kycId, file);
                              }
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById(`upload-${kycId}`)?.click()}
                            disabled={isUploading}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            {isUploading ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4 mr-1" />
                            )}
                            {status.hasDocument ? 'Replace' : 'Upload'}
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {status.filePath && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(buildFileUrl({ file_path: status.filePath }), '_blank')}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {/* Progress indicator for uploading/processing */}
                  {(status.status === 'Uploading' || status.status === 'Processing') && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center text-xs text-gray-600">
                        <Clock className="h-3 w-3 mr-1 animate-spin" />
                        {status.status}...
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div className="bg-blue-600 h-1.5 rounded-full w-1/2 animate-pulse"></div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Document Summary Stats */}
        <Card className="bg-gray-50">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {requiredKycIds.filter(kycId => documentStatuses[kycId]?.status === 'Ready').length}
                </div>
                <div className="text-xs text-gray-600">Ready</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {requiredKycIds.filter(kycId => ['Not Linked', 'Old Document'].includes(documentStatuses[kycId]?.status)).length}
                </div>
                <div className="text-xs text-gray-600">Needs Attention</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {requiredKycIds.filter(kycId => documentStatuses[kycId]?.status === 'Missing').length}
                </div>
                <div className="text-xs text-gray-600">Missing</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {requiredKycIds.filter(kycId => ['Uploading', 'Processing'].includes(documentStatuses[kycId]?.status)).length}
                </div>
                <div className="text-xs text-gray-600">Processing</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Enhanced document preview handler
  const handleDocumentPreview = useCallback(async (kycId: string) => {
    try {
      const status = documentStatuses[kycId];
      if (!status?.canPreview) {
        toast({
          title: 'Preview Unavailable',
          description: 'This document cannot be previewed in its current state',
          variant: 'default'
        });
        return;
      }

      // Find the document
      const document = documentFiles.find(doc => doc.document_id === kycId);
      if (!document) {
        // Try linked document
        const linkedDoc = getLinkedDocumentForStage(task, stage, allDocuments);
        if (linkedDoc && linkedDoc.document_id === kycId) {
          await prepareDocumentPreview(linkedDoc);
        } else {
          toast({
            title: 'Document Not Found',
            description: 'Could not locate the document for preview',
            variant: 'destructive'
          });
        }
        return;
      }

      await prepareDocumentPreview(document);
    } catch (error) {
      console.error('Error preparing document preview:', error);
      toast({
        title: 'Preview Error',
        description: 'Failed to prepare document preview',
        variant: 'destructive'
      });
    }
  }, [documentStatuses, documentFiles, task, stage, allDocuments]);

  // Enhanced document preview preparation
  const prepareDocumentPreview = useCallback(async (document: any) => {
    try {
      const kycDocument = document.kyc_document;
      
      if (!kycDocument || !document.file_path) {
        throw new Error('Missing document configuration or file path');
      }

      const fileUrl = buildFileUrl(document);
      if (!fileUrl) {
        throw new Error('Could not build document URL');
      }

      // Transform KYC fields to ExtractionPreview format
      const documentFields = (kycDocument.fields || []).map((field: any) => ({
        id: field.id || field.fieldName || field.name || `field_${Math.random()}`,
        name: field.fieldName || field.name || field.id || `field_${Math.random()}`,
        type: field.fieldType || field.type || 'text',
        isArray: field.isArray || field.type === 'array' || false,
        required: field.isRequired || field.required || false,
        arrayConfig: field.arrayConfig ? {
          fields: (field.arrayConfig.fields || []).map((subField: any) => ({
            id: subField.id || subField.fieldName || subField.name || `subfield_${Math.random()}`,
            name: subField.fieldName || subField.name || subField.id || `subfield_${Math.random()}`,
            type: subField.fieldType || subField.type || 'text',
            required: subField.isRequired || subField.required || false,
          })),
          maxItems: field.arrayConfig.maxItems || 10,
        } : undefined,
      }));

      // Use extracted data from the document
      let extractedData = {};
      if (document.extracted_details && typeof document.extracted_details === 'object') {
        extractedData = { ...document.extracted_details };
      } else if (document.extracted_data && typeof document.extracted_data === 'object') {
        extractedData = { ...document.extracted_data };
      }

      // Ensure all fields have values in extractedData
      documentFields.forEach((field: any) => {
        const fieldName = field.name;
        if (extractedData[fieldName] === undefined) {
          extractedData[fieldName] = field.isArray ? [] : '';
        }
      });

      const fileName = document.file_name || document.file_path?.split('/').pop() || 'Document';
      const documentName = kycDocument.display_name || kycDocument.name || 'Document';

      // Determine file type
      const getFileType = (fileName: string, mimeType?: string) => {
        if (mimeType) {
          if (mimeType.startsWith('image/')) return 'image';
          if (mimeType === 'application/pdf') return 'pdf';
        }
        const extension = fileName.toLowerCase().split('.').pop();
        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension || '')) return 'image';
        if (extension === 'pdf') return 'pdf';
        return 'unknown';
      };
      
      const fileType = getFileType(fileName, document.mime_type);

      setPreviewDocument({
        file: { ...document, name: fileName, type: fileType, url: fileUrl },
        fileUrl,
        fileName,
        documentName,
        fields: documentFields,
        extractedData,
        type: kycDocument.document_type || 'document',
      });

    } catch (error) {
      console.error('Error preparing document preview:', error);
      throw error;
    }
  }, []);

  // Status Badge Component
  const StatusBadge = ({ status }: { status: DocumentStatus }) => {
    const icons = {
      'Ready': <CheckCircle className="h-3 w-3" />,
      'Not Linked': <AlertTriangle className="h-3 w-3" />,
      'Missing': <XCircle className="h-3 w-3" />,
      'Old Document': <Clock className="h-3 w-3" />,
      'Uploading': <Loader2 className="h-3 w-3 animate-spin" />,
      'Processing': <RefreshCw className="h-3 w-3 animate-spin" />
    };

    const colors = {
      green: 'bg-green-100 text-green-800 border-green-200',
      yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      red: 'bg-red-100 text-red-800 border-red-200',
      blue: 'bg-blue-100 text-blue-800 border-blue-200',
      gray: 'bg-gray-100 text-gray-800 border-gray-200'
    };

    return (
      <Badge 
        variant="outline" 
        className={`${colors[status.statusColor]} flex items-center gap-1 text-xs font-medium`}
      >
        {icons[status.status]}
        {status.status}
      </Badge>
    );
  };

  // Rest of the component implementation...
  const getRequirementId = useCallback(() => {
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
  }, [subDeptId, task, isSubclass, subclassId, classId]);

  // Extract automation mappings from stage documents
  const extractAutomationMappings = async (stageDocuments: any[]) => {
    try {
      const mappings: EntityAutomationMapping[] = [];
      const automationIds = new Set<string>();

      stageDocuments.forEach(doc => {
        if (doc.automationLinks && typeof doc.automationLinks === 'object') {
          Object.entries(doc.automationLinks).forEach(([entityKey, automationId]) => {
            if (typeof automationId === 'string') {
              automationIds.add(automationId);

              const parts = entityKey.split('-');
              const entityType = parts[0];
              const entityName = `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} ${parts.slice(1).join('-')}`;

              mappings.push({
                entityKey,
                entityName,
                entityType,
                automationId: automationId
              });
            }
          });
        }
      });

      if (automationIds.size > 0) {
        const { data: automations, error } = await supabase
          .from('tm_automations')
          .select('*')
          .in('id', Array.from(automationIds));

        if (!error && automations) {
          mappings.forEach(mapping => {
            const automation = automations.find(a => a.id === mapping.automationId);
            if (automation) {
              mapping.automation = automation;
            }
          });
        }
      }

      setEntityAutomationMappings(mappings);

      if (mappings.length > 0 && mappings[0].automationId && !selectedAutomationId) {
        setSelectedAutomationId(mappings[0].automationId);
      }
    } catch (error) {
      console.error('Error extracting automation mappings:', error);
    }
  };

  const fetchAutomationFromWebData = useCallback(async (webDataItems: any[]) => {
    try {
      const automationIds = new Set<string>();
      const mappings: EntityAutomationMapping[] = [];
  
      webDataItems.forEach((item, index) => {
        if (item.automationId) {
          automationIds.add(item.automationId);
          mappings.push({
            entityKey: `webdata-${index}`,
            entityName: item.documentName || `WebData Item ${index + 1}`,
            entityType: 'webdata',
            automationId: item.automationId
          });
        }
      });
  
      if (automationIds.size > 0) {
        const { data: automations, error } = await supabase
          .from('tm_automations')
          .select('*')
          .in('id', Array.from(automationIds));
  
        if (!error && automations) {
          mappings.forEach(mapping => {
            const automation = automations.find(a => a.id === mapping.automationId);
            if (automation) {
              mapping.automation = automation;
            }
          });
        }
      }
  
      setEntityAutomationMappings(mappings);
  
      if (mappings.length > 0 && mappings[0].automationId && !selectedAutomationId) {
        setSelectedAutomationId(mappings[0].automationId);
      }
    } catch (error) {
      console.error('Error fetching automation from webData:', error);
    }
  }, [selectedAutomationId])

  useEffect(() => {
    if (!isOpen) {
      // Reset state when dialog closes
      setWebData([]);
      setJobFields({});
      setSourceData({});
      setDocumentFiles([]);
      setEntityAutomationMappings([]);
      setSelectedAutomationId('');
      setDocumentStatuses({});
      setError(null);
      return;
    }

    let isMounted = true;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const requirementId = getRequirementId();

        const { data: requirement, error: requirementError } = await supabase
          .from('tm_class_requirements').select('*').eq('class_id', requirementId).maybeSingle();

        if (!isMounted) return;

        if (requirementError || !requirement) {
          const { data: fallbackReq, error: fallbackError } = await supabase
            .from('tm_class_requirements').select('*').eq('class_id', classId).maybeSingle();

          if (!isMounted) return;

          if (fallbackReq && !fallbackError) {
            const webDataItems = fallbackReq.webData || [];
            setWebData(webDataItems);

            await fetchAutomationFromWebData(webDataItems);

            const allMasterFieldIds = webDataItems.flatMap((item: any) =>
              item.fields?.flatMap(field => field.masterFieldIds || []) || []
            ).filter(Boolean);

            if (allMasterFieldIds.length > 0 && isMounted) {
              const { data: fields, error: fieldsError } = await supabase
                .from('tm_job_fields').select('*').in('id', allMasterFieldIds);
              if (fieldsError) throw new Error('Failed to fetch job fields');
              if (fields && isMounted) {
                setJobFields(fields.reduce((acc, field) => ({ ...acc, [field.id.toString()]: field }), {}));
              }
            }
            return;
          }
          throw new Error(`No requirement found for ID: ${requirementId}`);
        }

        const webDataItems = requirement.webData || [];
        if (isMounted) setWebData(webDataItems);

        await fetchAutomationFromWebData(webDataItems);

        const allMasterFieldIds = webDataItems.flatMap((item: any) =>
          item.fields?.flatMap(field => field.masterFieldIds || []) || []
        ).filter(Boolean);

        if (allMasterFieldIds.length > 0 && isMounted) {
          const { data: fields, error: fieldsError } = await supabase
            .from('tm_job_fields').select('*').in('id', allMasterFieldIds);
          if (fieldsError) throw new Error('Failed to fetch job fields');
          if (fields && isMounted) {
            setJobFields(fields.reduce((acc, field) => ({ ...acc, [field.id.toString()]: field }), {}));
          }
        }

        if (stageDocuments?.length > 0) {
          await extractAutomationMappings(stageDocuments);
        }

      } catch (error) {
        console.error('Error fetching mapping data:', error);
        if (isMounted) {
          setError('Failed to load mapping data. Please try again.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, getRequirementId, classId, stageDocuments, fetchAutomationFromWebData]);

  // Separate useEffect for source data fetching with debouncing
  useEffect(() => {
    if (!isOpen || !currentIndividualId) return;

    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const debouncedFetch = () => {
      timeoutId = setTimeout(async () => {
        if (!isMounted) return;

        try {
          if (Object.keys(jobFields).length > 0) {
            await fetchSourceData(currentIndividualId);
          }
          if (webData.length > 0) {
            await fetchDocumentFiles(currentIndividualId);
          }
        } catch (error) {
          console.error('Error in debounced fetch:', error);
        }
      }, 300);
    };

    debouncedFetch();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [currentIndividualId, isOpen]);

  // Separate effect to trigger data fetching when jobFields or webData are ready
  useEffect(() => {
    if (!isOpen || !currentIndividualId) return;

    let isMounted = true;

    const fetchWhenReady = async () => {
      if (Object.keys(jobFields).length > 0 && Object.keys(sourceData).length === 0) {
        await fetchSourceData(currentIndividualId);
      }
      if (webData.length > 0 && documentFiles.length === 0) {
        await fetchDocumentFiles(currentIndividualId);
      }
    };

    if (isMounted) {
      fetchWhenReady();
    }

    return () => {
      isMounted = false;
    };
  }, [jobFields, webData]);

  const getSourceInfo = (masterFieldIds: string[]) => {
    if (!masterFieldIds || masterFieldIds.length === 0) {
      return { sources: [], hasData: false };
    }

    const sources = masterFieldIds.map(fieldId => {
      const field = jobFields[fieldId];
      if (!field || !field.sources || field.sources.length === 0) return null;

      const source = field.sources[0];
      return {
        fieldId: fieldId,
        fieldLabel: field.label,
        source: `${source.table}.${source.path}`,
        table: source.table,
        path: source.path,
      };
    }).filter(Boolean);

    return { sources, hasData: sources.length > 0 };
  };

  const getSourceValueMerged = (sources: any[]): string => {
    if (sources.length === 0) return "Missing";

    if (sources.length === 1) {
      const sourceInfo = sources[0];
      return getSourceValue(sourceInfo.table, sourceInfo.path);
    }

    const validValues: string[] = [];

    sources.forEach(sourceInfo => {
      const value = getSourceValue(sourceInfo.table, sourceInfo.path);

      if (typeof value === 'string' && value !== 'Missing' && value.trim() !== '') {
        const trimmedValue = value.trim();

        if (!validValues.some(existing =>
          existing.toLowerCase() === trimmedValue.toLowerCase()
        )) {
          validValues.push(trimmedValue);
        }
      }
    });

    if (validValues.length === 0) return "Missing";

    return validValues.join(' ').replace(/\s+/g, ' ').trim();
  };

  const getSourceValue = (table: string, path: string) => {
    const tableData = sourceData[table];
    if (!tableData) return "Missing";

    if (Array.isArray(tableData)) {
      if (tableData.length === 0) return "Missing";
      for (const row of tableData) {
        const value = parseJsonValue(row, path);
        if (value !== undefined && value !== null) return String(value);
      }
      return "Missing";
    }

    const value = parseJsonValue(tableData, path);
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
      let queryField = 'id';
      let queryValue = currentIndividualId;

      // Special handling for tm_tasks table
      if (table === 'tm_tasks') {
        queryField = 'task_id';
        queryValue = taskId || currentIndividualId;
      } else if (table === 'acc_portal_directors_documents') {
        queryField = 'director_id';
      }

      const { data: existingData, error: fetchError } = await supabase
        .from(table)
        .select('*')
        .eq(queryField, queryValue)
        .maybeSingle();

      const updateData = updateJsonValue(existingData || {}, path, editValue);

      if (fetchError && !existingData) {
        const { error: insertError } = await supabase
          .from(table)
          .upsert({
            [queryField]: queryValue,
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
          .eq(queryField, queryValue);

        if (updateError) throw updateError;
      }

      await fetchSourceData(currentIndividualId);

      toast({
        title: 'Success',
        description: `Field "${editingCell.path}" updated successfully`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error updating field:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update field',
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

  const prepareFormData = () => {
    const formData: Record<string, any> = {};

    webData.forEach(item => {
      item.fields?.forEach(field => {
        const { sources } = getSourceInfo(field.masterFieldIds || []);

        if (sources.length === 0) {
          return;
        }

        if (sources.length === 1) {
          const sourceInfo = sources[0];
          const value = getSourceValue(sourceInfo.table, sourceInfo.path);

          if (typeof value === 'string' && value !== 'Missing') {
            if (field.arrayItems && field.arrayItems.length > 0) {
              const hasDateComponents = field.arrayItems.some((item: any) =>
                ['day', 'month', 'year'].includes(item.variableName)
              );

              if (hasDateComponents) {
                const parsedDate = parseDateToComponents(value);
                formData[field.variableName] = parsedDate;
              } else {
                formData[field.variableName] = value;
              }
            } else {
              formData[field.variableName] = value;
            }
          }
        } else {
          const allValues: string[] = [];
          let hasValidValue = false;

          sources.forEach(sourceInfo => {
            const value = getSourceValue(sourceInfo.table, sourceInfo.path);
            if (typeof value === 'string' && value !== 'Missing' && value.trim() !== '') {
              allValues.push(value.trim());
              hasValidValue = true;
            }
          });

          if (hasValidValue) {
            const mergedValue = allValues.join(' ').trim();

            if (field.arrayItems && field.arrayItems.length > 0) {
              const hasDateComponents = field.arrayItems.some((item: any) =>
                ['day', 'month', 'year'].includes(item.variableName)
              );

              if (hasDateComponents) {
                const parsedDate = parseDateToComponents(mergedValue);
                formData[field.variableName] = parsedDate;
              } else {
                formData[field.variableName] = mergedValue;
              }
            } else {
              formData[field.variableName] = mergedValue;
            }
          }
        }
      });
    });

    return formData;
  };

  const parseDateToComponents = (dateValue: string): { day: string; month: string; year: string } | string => {
    if (!dateValue) return dateValue;

    const monthNames: Record<string, string> = {
      'Jan': '01', 'January': '01', 'Feb': '02', 'February': '02',
      'Mar': '03', 'March': '03', 'Apr': '04', 'April': '04',
      'May': '05', 'Jun': '06', 'June': '06', 'Jul': '07', 'July': '07',
      'Aug': '08', 'August': '08', 'Sep': '09', 'September': '09',
      'Oct': '10', 'October': '10', 'Nov': '11', 'November': '11',
      'Dec': '12', 'December': '12'
    };

    const monthNumberToName: Record<string, string> = {
      '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
      '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
      '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
    };

    const formats = [
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
      /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
      /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/,
      /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/,
      /^(\d{1,2})[-\/]([A-Za-z]+)[-\/](\d{4})$/,
      /^([A-Za-z]+)[-\/](\d{1,2})[-\/](\d{4})$/,
    ];

    for (let i = 0; i < formats.length; i++) {
      const format = formats[i];
      const match = dateValue.match(format);

      if (match) {
        let day, month, year;

        if (i === 0 || i === 2) {
          [, day, month, year] = match;
          month = monthNumberToName[month.padStart(2, '0')] || month.padStart(2, '0');
        } else if (i === 1) {
          [, year, month, day] = match;
          month = monthNumberToName[month.padStart(2, '0')] || month.padStart(2, '0');
        } else if (i === 3) {
          [, day, month, year] = match;
          month = getShortMonthName(month, monthNames);
        } else if (i === 4) {
          [, month, day, year] = match;
          month = getShortMonthName(month, monthNames);
        } else if (i === 5) {
          [, day, month, year] = match;
          month = getShortMonthName(month, monthNames);
        } else if (i === 6) {
          [, month, day, year] = match;
          month = getShortMonthName(month, monthNames);
        }

        return {
          day: day.padStart(2, '0'),
          month: month,
          year: year
        };
      }
    }

    return dateValue;
  };

  const getShortMonthName = (monthInput: string, monthNames: Record<string, string>): string => {
    const monthInputLower = monthInput.toLowerCase();

    for (const [shortName] of Object.entries(monthNames)) {
      if (shortName.toLowerCase() === monthInputLower) {
        return shortName;
      }
    }

    for (const [shortName] of Object.entries(monthNames)) {
      const fullName = getFullMonthName(shortName);
      if (fullName.toLowerCase() === monthInputLower) {
        return shortName;
      }
    }

    return monthInput.charAt(0).toUpperCase() + monthInput.slice(1, 3).toLowerCase();
  };

  const getFullMonthName = (shortName: string): string => {
    const fullNames: Record<string, string> = {
      'Jan': 'January', 'Feb': 'February', 'Mar': 'March', 'Apr': 'April',
      'May': 'May', 'Jun': 'June', 'Jul': 'July', 'Aug': 'August',
      'Sep': 'September', 'Oct': 'October', 'Nov': 'November', 'Dec': 'December'
    };
    return fullNames[shortName] || shortName;
  };

  // Enhanced handleRunAutomation
  const handleRunAutomation = async () => {
    if (!currentIndividualId) {
      toast({
        title: 'Error',
        description: 'Please enter an Individual ID to run automation',
        variant: 'destructive'
      });
      return;
    }

    if (!selectedAutomationId) {
      toast({
        title: 'Error',
        description: 'Please select an automation to run',
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsAutomationRunning(true);

      const selectedMapping = entityAutomationMappings.find(m => m.automationId === selectedAutomationId);
      if (!selectedMapping?.automation) {
        throw new Error('Selected automation details not found');
      }

      const automation = selectedMapping.automation;
      const webDataItem = webData.find(item => item.automationId === selectedAutomationId);
      if (!webDataItem) {
        throw new Error('WebData configuration not found for selected automation');
      }

      const formData = prepareFormData();
      const documentUrl = getDocumentUrlForAutomation();

      if (!documentUrl) {
        console.warn('⚠️ No document URL found for automation');
        toast({
          title: 'No Document Linked',
          description: 'No document is linked to this stage. Automation will run without document data.',
          variant: 'default',
        });
      }

      const payload = {
        url: automation.webhook_url,
        login: automation.login,
        formData: formData,
        taskId: taskId,
        individualId: currentIndividualId,
        classId: classId,
        photoUrl: documentUrl,
      };

      console.log('🚀 Sending automation request with payload:', payload);

      const response = await fetch(automation.webhook_url, {
        method: automation.webhook_method || 'POST',
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
      console.error('❌ Error triggering automation:', error);

      if (error instanceof TypeError && error.message.includes('fetch')) {
        toast({
          title: 'Connection Error',
          description: 'Could not connect to automation server. Make sure the server is running',
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
        <Table className="max-w-6xl max-h-[60vh] flex flex-col overflow-y-auto">
          <TableHeader className="bg-blue-500">
            <TableRow>
              <TableHead className="w-[50px] border-r text-white">#</TableHead>
              <TableHead className="w-1/4 border-r text-white">WebData Field</TableHead>
              <TableHead className="w-1/4 border-r text-white">Source Path(s)</TableHead>
              <TableHead className="w-1/4 border-r text-white">Current Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => {
              const { sources, hasData } = getSourceInfo(field.masterFieldIds || []);

              return (
                <TableRow key={field.variableName || index}>
                  <TableCell className="align-top border-r w-[50px]">{index + 1}</TableCell>
                  <TableCell className="align-top border-r w-1/4">
                    <div className="text-sm font-medium text-gray-900">
                      {field.efnsDisplayName || field.name}
                      {field.isRequired && <span className="ml-1 text-red-500">*</span>}
                    </div>
                    <div className="text-xs text-gray-500 font-mono mt-1">
                      {field.variableName}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {field.fieldType}
                      </Badge>
                      {sources.length > 1 && (
                        <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                          Multi-Source ({sources.length})
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="align-top border-r w-1/4">
                    {hasData ? (
                      <div className="space-y-2">
                        {sources.map((sourceInfo, idx) => (
                          <div key={idx} className="font-mono text-xs">
                            <span className="font-semibold text-gray-800">{sourceInfo.fieldLabel}</span>
                            <span className="text-gray-400 mx-1">→</span>
                            <span className="text-blue-600">{sourceInfo.source}</span>
                          </div>
                        ))}
                        {sources.length > 1 && (
                          <div className="text-xs text-purple-600 font-medium italic mt-2 p-1 bg-purple-50 rounded">
                            ↗ Values will be merged: "{sources.map(s => s.fieldLabel).join(' + ')}"
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No source linked</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top border-r w-1/4">
                    {currentIndividualId ? (
                      hasData ? (
                        sources.length === 1 ? (
                          <div className="space-y-2 text-sm">
                            {sources.map((sourceInfo, idx) => {
                              const value = getSourceValue(sourceInfo.table, sourceInfo.path);
                              const isEditing = editingCell?.rowIndex === index && editingCell?.sourceIndex === idx;

                              return (
                                <div key={idx} className="p-1 rounded hover:bg-gray-100">
                                  {isEditing ? (
                                    <div className="flex items-center space-x-2">
                                      <Input
                                        autoFocus
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        onBlur={saveEdit}
                                        className="h-8 text-sm"
                                        placeholder={sourceInfo.fieldLabel}
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
                                  ) : (
                                    <div
                                      className="cursor-pointer"
                                      onClick={() => startEditing(index, idx, sourceInfo.table, sourceInfo.path, value)}
                                      title="Click to edit"
                                    >
                                      {typeof value === 'string' && value !== 'Missing' ? (
                                        <span className="text-green-700 font-medium">{value}</span>
                                      ) : (
                                        <span className="text-red-600 italic">Missing</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="space-y-2 text-sm">
                            <div className="border border-purple-200 bg-purple-50 p-2 rounded">
                              <div className="text-xs font-medium text-purple-800 mb-1">Merged Value:</div>
                              {(() => {
                                const mergedValue = getSourceValueMerged(sources);
                                return (
                                  <div className="font-medium text-purple-900">
                                    {mergedValue !== 'Missing' ? (
                                      <span className="text-purple-700">{mergedValue}</span>
                                    ) : (
                                      <span className="text-red-600 italic">No valid data</span>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>

                            <div className="space-y-1">
                              <div className="text-xs font-medium text-gray-600">Individual Sources (click to edit):</div>
                              {sources.map((sourceInfo, idx) => {
                                const value = getSourceValue(sourceInfo.table, sourceInfo.path);
                                const isEditing = editingCell?.rowIndex === index && editingCell?.sourceIndex === idx;

                                return (
                                  <div key={idx} className="text-xs p-1 rounded bg-gray-50 hover:bg-gray-100">
                                    <span className="font-medium text-gray-700">{sourceInfo.fieldLabel}:</span>
                                    {isEditing ? (
                                      <div className="flex items-center space-x-2 mt-1">
                                        <Input
                                          autoFocus
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          onKeyDown={handleKeyDown}
                                          onBlur={saveEdit}
                                          className="h-7 text-xs"
                                          placeholder={sourceInfo.fieldLabel}
                                        />
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            saveEdit();
                                          }}
                                          className="h-7 px-2 text-xs"
                                        >
                                          Save
                                        </Button>
                                      </div>
                                    ) : (
                                      <div
                                        className="ml-1 cursor-pointer inline-block"
                                        onClick={() => startEditing(index, idx, sourceInfo.table, sourceInfo.path, value)}
                                        title={`Click to edit ${sourceInfo.fieldLabel}`}
                                      >
                                        {typeof value === 'string' && value !== 'Missing' ? (
                                          <span className="text-green-700 hover:bg-green-100 px-1 rounded">{value}</span>
                                        ) : (
                                          <span className="text-red-600 italic hover:bg-red-100 px-1 rounded">Missing</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )
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

  const renderAutomationConfig = () => {
    if (entityAutomationMappings.length === 0) {
      return (
        <div className="text-center p-8 text-gray-500">
          <Settings className="h-10 w-10 mb-2 text-gray-300 mx-auto" />
          <p>No automations found for this requirement.</p>
          <p className="text-sm mt-1">Add webData configurations to enable automation.</p>
        </div>
      );
    }

    const selectedMapping = entityAutomationMappings.find(m => m.automationId === selectedAutomationId);

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link className="h-5 w-5 text-blue-600" />
              WebData Automation Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Select Automation</Label>
                <Select value={selectedAutomationId} onValueChange={setSelectedAutomationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an automation..." />
                  </SelectTrigger>
                  <SelectContent>
                    {entityAutomationMappings.map((mapping) => (
                      <SelectItem key={mapping.automationId} value={mapping.automationId}>
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-blue-500" />
                          <span>{mapping.automation?.name || mapping.automationId}</span>
                          <Badge variant="outline" className="text-xs ml-2">
                            {mapping.entityName}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedMapping && (
                <div>
                  <Label className="text-sm font-medium">WebData Document</Label>
                  <div className="p-2 bg-gray-50 rounded border text-sm">
                    <span className="font-medium">{selectedMapping.entityName}</span>
                    <Badge variant="outline" className="ml-2 text-xs">
                      {selectedMapping.entityType}
                    </Badge>
                  </div>
                </div>
              )}
            </div>

            {selectedMapping?.automation && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Webhook URL</Label>
                  <div className="p-2 bg-gray-50 rounded border text-xs font-mono text-gray-600 break-all">
                    {selectedMapping.automation.webhook_url}
                  </div>
                </div>
                {selectedMapping.automation.login && (
                  <div className="md:col-span-2">
                    <Label className="text-sm font-medium text-gray-700">Login Configuration</Label>
                    <div className="p-3 bg-blue-50 rounded border border-blue-200">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        {selectedMapping.automation.login.email && (
                          <div>
                            <span className="font-medium text-gray-600">Email:</span>
                            <div className="font-mono text-gray-800">{selectedMapping.automation.login.email}</div>
                          </div>
                        )}
                        {selectedMapping.automation.login.idNumber && (
                          <div>
                            <span className="font-medium text-gray-600">ID Number:</span>
                            <div className="font-mono text-gray-800">{selectedMapping.automation.login.idNumber}</div>
                          </div>
                        )}
                        {selectedMapping.automation.login.password && (
                          <div>
                            <span className="font-medium text-gray-600">Password:</span>
                            <div className="font-mono text-gray-800">{"*".repeat(selectedMapping.automation.login.password.length)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-600" />
              Automation Mapping & Data Preview
              {entityAutomationMappings.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {entityAutomationMappings.length} automation{entityAutomationMappings.length !== 1 ? 's' : ''} available
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              View the data mapping for this requirement and preview source data for a specific individual.
              {selectedAutomationId && (
                <div className="text-xs text-blue-600 mt-1">
                  Selected: {entityAutomationMappings.find(m => m.automationId === selectedAutomationId)?.automation?.name || 'Unknown'}
                </div>
              )}
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
              <Tabs defaultValue="documents" className="max-h-[100vh] flex flex-col">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="documents" className="gap-2">
                    <FileText className="h-4 w-4" />
                    Documents ({Object.keys(documentStatuses).length})
                  </TabsTrigger>
                  <TabsTrigger value="automation" className="gap-2">
                    <Settings className="h-4 w-4" />
                    Automation Config
                  </TabsTrigger>
                  <TabsTrigger value="fields" className="gap-2">
                    <Database className="h-4 w-4" />
                    Field Mapping
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="documents" className="flex-grow overflow-y-auto mt-4">
                  {renderDocumentsSection()}
                </TabsContent>

                <TabsContent value="automation" className="flex-grow overflow-y-auto mt-4">
                  {renderAutomationConfig()}
                </TabsContent>

                <TabsContent value="fields" className="flex-grow overflow-y-auto mt-4">
                  {renderFieldsTable()}
                </TabsContent>
              </Tabs>
            )}
          </div>

          <div className="flex justify-between items-center pt-4 border-t mt-auto">
            <div className="flex items-center gap-3">
              <Button
                onClick={handleRunAutomation}
                disabled={isAutomationRunning || !currentIndividualId || isLoadingData || !selectedAutomationId}
                variant="default"
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                {isAutomationRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Start Automation
              </Button>

              {selectedAutomationId && entityAutomationMappings.length > 1 && (
                <div className="text-xs text-gray-500">
                  Running: {entityAutomationMappings.find(m => m.automationId === selectedAutomationId)?.automation?.name}
                </div>
              )}
            </div>

            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enhanced Document Preview Dialog */}
      <Dialog open={!!previewDocument} onOpenChange={(open) => !open && setPreviewDocument(null)}>
        <DialogContent className="max-w-7xl w-[95vw] h-[95vh] p-0 flex flex-col">
          {previewDocument ? (
            <div className="flex flex-col h-full">
              <DialogHeader className="p-6 pb-2">
                <DialogTitle className="text-xl flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {previewDocument.documentName}
                </DialogTitle>
                <DialogDescription>
                  Review extracted details for {task?.applicant_name || 'this document'}
                  {stage && ` - Stage: ${stage.name}`}
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-hidden p-6 pt-2">
                <ExtractionPreview
                  documentName={previewDocument.documentName}
                  fileUrl={previewDocument.fileUrl}
                  fileName={previewDocument.fileName}
                  extractedData={previewDocument.extractedData || {}}
                  fields={previewDocument.fields || []}
                  viewMode={true}
                  showSaveButton={false}
                  file={previewDocument.file}
                  type={previewDocument.type}
                  documentId={previewDocument.documentId}
                  onDataChange={(fieldName, value) => {
                    console.log('Document field changed:', fieldName, value);
                  }}
                  onSave={(updatedData) => {
                    console.log('Document data saved:', updatedData);
                    setPreviewDocument(null);
                    toast({ 
                      title: "Success", 
                      description: "Document details saved successfully." 
                    });
                  }}
                  onClose={() => setPreviewDocument(null)}
                  getStylesByType={(type) => ({
                    getBgColor: () => 'bg-primary',
                    getTextColor: () => 'text-primary-foreground',
                    getBorderColor: () => 'border-primary',
                    getButtonStyle: () => 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  })}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading document preview...</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};