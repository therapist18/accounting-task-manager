// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Zap, User, Database, FileText, Eye, Settings, Link, UploadCloud, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
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

    // Find the document instance from allDocuments by its unique ID
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

const parseJsonValue = (data: any, path: string): any => {
  if (!data || !path) return undefined;
  if (path.includes('->>') || path.includes('->')) {
    const parts = path.split(/(->>|->)/);
    const column = parts[0].trim().replace(/['"]/g, '');
    const jsonPath = parts[2].trim().replace(/['"]/g, '');
    const jsonData = data[column];
    if (!jsonData || typeof jsonData !== 'object') return undefined;
    return jsonPath.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), jsonData);
  }
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), data);
};

const updateJsonValue = (existingData: any, path: string, newValue: any): any => {
  if (!path) return { [path]: newValue };
  if (path.includes('->>') || path.includes('->')) {
    const parts = path.split(/(->>|->)/);
    const column = parts[0].trim().replace(/['"]/g, '');
    const jsonPath = parts[2].trim().replace(/['"]/g, '');
    const currentJsonData = existingData?.[column] || {};
    const pathParts = jsonPath.split('.');
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
  allDocuments = [], // Add allDocuments prop
  stage // Add stage prop
}: AutomationMappingDialogProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
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
 const getIndividualId = () => {
    if (individualId) return individualId;
    if (task?.individual_id) return task.individual_id.toString();
    if (task?.principal_member) return task.principal_member.toString();
    return '';
  };
  const [currentIndividualId, setCurrentIndividualId] = useState(getIndividualId());
  
  const getDocumentUrlForAutomation = useCallback((): string | null => {
    console.log('🔍 Getting document URL for automation...', {
      hasStage: !!stage,
      stageId: stage?.id,
      hasTask: !!task,
      taskId: task?.id,
      individualId: task?.individual_id,
      allDocumentsLength: allDocuments?.length || 0,
      documentFilesLength: documentFiles.length,
      hasSourceDocumentId: !!task?.source_document_id,
      sourceDocumentIdKeys: task?.source_document_id ? Object.keys(task.source_document_id) : []
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

      // Find documents that match the webData KYC document IDs
      const webDataKycIds = webData.flatMap(item =>
        (item.kycDocsUpload || []).map(upload => upload.kycDocumentId)
      ).filter(Boolean);

      console.log('WebData KYC IDs:', webDataKycIds);
      console.log('Available document files:', documentFiles.map(f => ({
        id: f.id,
        document_id: f.document_id,
        file_path: f.file_path
      })));

      // Prefer documents that match the webData requirements
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
          fileUrl,
          note: 'Using document from webData requirements'
        });
        return fileUrl;
      }
    }

    // Strategy 4: Find any document for this individual that matches stage requirements
    if (stage?.documents?.length > 0 && allDocuments?.length > 0) {
      console.log('🔄 Strategy 4: Finding documents matching stage requirements...');

      const individualDocs = allDocuments.filter(doc =>
        (doc.director_id === task.individual_id ||
          doc.director_id?.toString() === task.individual_id?.toString()) &&
        doc.file_path &&
        doc.status !== 'deleted'
      );

      console.log(`Found ${individualDocs.length} documents for individual ${task.individual_id}`);

      for (const stageDoc of stage.documents) {
        const matchingDoc = individualDocs.find(doc =>
          doc.document_id === stageDoc.kycId
        );

        if (matchingDoc) {
          const fileUrl = buildFileUrl(matchingDoc);
          console.log('✅ Strategy 4 succeeded:', {
            kycId: stageDoc.kycId,
            documentId: matchingDoc.id,
            fileUrl,
            note: 'Document exists but not linked to stage'
          });
          return fileUrl;
        }
      }
    }

    // Strategy 5: Use any valid document for this individual
    if (allDocuments?.length > 0) {
      console.log('🔄 Strategy 5: Using any available document for individual...');

      const individualDocs = allDocuments.filter(doc =>
        (doc.director_id === task.individual_id ||
          doc.director_id?.toString() === task.individual_id?.toString()) &&
        doc.file_path &&
        doc.status !== 'deleted' &&
        !doc.indicator // Avoid indicator documents
      );

      console.log(`Found ${individualDocs.length} valid documents for individual ${task.individual_id}`);

      if (individualDocs.length > 0) {
        // Prefer newer documents
        const sortedDocs = individualDocs.sort((a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );

        const firstDoc = sortedDocs[0];
        const fileUrl = buildFileUrl(firstDoc);
        console.log('✅ Strategy 5 succeeded:', {
          documentId: firstDoc.id,
          filePath: firstDoc.file_path,
          fileUrl,
          note: 'Using most recent available document (may not be stage-specific)'
        });
        return fileUrl;
      }
    }

    console.log('❌ All strategies failed - no document URL available');
    console.log('💡 Suggestions:');
    console.log('   1. Upload documents for this individual');
    console.log('   2. Link existing documents to stages');
    console.log('   3. Check document status (not deleted/indicator)');

    return null;
  }, [stage, task, allDocuments, documentFiles, webData]);

  // Function to find the appropriate stage for document URL
  const findStageForDocument = useCallback((): any | null => {
    if (stage) {
      console.log('Using provided stage:', stage.name, stage.id);
      return stage;
    }

    // If no stage provided, try to find an appropriate stage from the task
    if (task?.stage_id) {
      console.log('Using task stage_id:', task.stage_id);
      return { id: task.stage_id, name: 'Current Stage' };
    }

    // Look for stages that have documents and might have linked documents
    if (task?.source_document_id && typeof task.source_document_id === 'object') {
      const stageIds = Object.keys(task.source_document_id);
      if (stageIds.length > 0) {
        const firstStageId = stageIds[0];
        console.log('Using first available stage with documents:', firstStageId);
        return { id: firstStageId, name: 'Document Stage' };
      }
    }

    console.log('❌ No suitable stage found for document URL');
    return null;
  }, [stage, task]);

  // Enhanced document URL function that tries to find a suitable stage if none provided
  const getDocumentUrlWithFallback = useCallback((): string | null => {
    // First try with the provided stage
    if (stage) {
      return getDocumentUrlForAutomation();
    }

    // If no stage provided, try to find one
    const foundStage = findStageForDocument();
    if (foundStage && task && allDocuments?.length) {
      const linkedDoc = getLinkedDocumentForStage(task, foundStage, allDocuments);
      if (linkedDoc) {
        return buildFileUrl(linkedDoc);
      }
    }

    console.log('❌ Could not find document URL with any available stage');
    return null;
  }, [getDocumentUrlForAutomation, findStageForDocument, task, allDocuments]);

  // Extract automation mappings from stage documents
  const extractAutomationMappings = async (stageDocuments: any[]) => {
    try {
      const mappings: EntityAutomationMapping[] = [];
      const automationIds = new Set<string>();

      // Collect all automation links from stage documents
      stageDocuments.forEach(doc => {
        if (doc.automationLinks && typeof doc.automationLinks === 'object') {
          Object.entries(doc.automationLinks).forEach(([entityKey, automationId]) => {
            if (typeof automationId === 'string') {
              automationIds.add(automationId);

              // Parse entity key to get entity details
              const parts = entityKey.split('-');
              const entityType = parts[0]; // 'class', 'subclass', etc.
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

      // Fetch automation details for all unique automation IDs
      if (automationIds.size > 0) {
        const { data: automations, error } = await supabase
          .from('tm_automations')
          .select('*')
          .in('id', Array.from(automationIds));

        if (!error && automations) {
          // Map automation details to mappings
          mappings.forEach(mapping => {
            const automation = automations.find(a => a.id === mapping.automationId);
            if (automation) {
              mapping.automation = automation;
            }
          });
        }
      }

      setEntityAutomationMappings(mappings);

      // Set the first automation as selected by default
      if (mappings.length > 0 && mappings[0].automationId && !selectedAutomationId) {
        setSelectedAutomationId(mappings[0].automationId);
      }
    } catch (error) {
      console.error('Error extracting automation mappings:', error);
    }
  };

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

  const fetchSourceData = useCallback(async (individualId: string) => {
    if ((!individualId && !taskId) || !jobFields || Object.keys(jobFields).length === 0) return;

    // Prevent multiple simultaneous calls
    if (isLoadingData) return;

    setIsLoadingData(true);
    try {
      const sourceDataMap: Record<string, any> = {};
      const allSources = Object.values(jobFields).flatMap(field => field.sources || []);
      const uniqueTables = [...new Set(allSources.map(source => source.table))];

      // Process tables sequentially to avoid overwhelming the API
      for (const table of uniqueTables) {
        try {
          let queryField = 'id';
          let queryValue = individualId;
          
          if (table === 'acc_portal_directors_documents') {
            queryField = 'director_id';
          } else if (table === 'tm_tasks' && taskId) {
            queryField = 'id';
            queryValue = taskId; // Use taskId instead of individualId for tm_tasks
          }
          
          const { data, error } = await supabase.from(table).select('*').eq(queryField, queryValue).maybeSingle();

          if (error) {
            const { data: multipleData, error: multipleError } = await supabase.from(table).select('*').eq(queryField, individualId);
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
      toast({ title: 'Warning', description: 'Could not fetch all source data', variant: 'destructive' });
    } finally {
      setIsLoadingData(false);
    }
  }, [jobFields, isLoadingData]);

  const fetchDocumentFiles = useCallback(async (individualId: string) => {
    if (!individualId || !webData.length) return;

    // Prevent multiple simultaneous calls
    if (isLoadingDocuments) return;

    setIsLoadingDocuments(true);
    try {
      // Get all KYC document IDs from webData requirements
      const allKycDocumentIds = webData.flatMap(item =>
        (item.kycDocsUpload || []).map(upload => upload.kycDocumentId)
      ).filter(Boolean);

      if (allKycDocumentIds.length === 0) {
        console.log('No KYC document IDs found in webData requirements');
        setDocumentFiles([]);
        return;
      }

      console.log('Fetching documents for individual:', individualId, 'with KYC IDs:', allKycDocumentIds);

      // Fetch documents that match both the individual and the required KYC document types
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
        .neq('status', 'deleted'); // Exclude deleted documents

      if (error) {
        console.error('Error fetching documents:', error);
        setDocumentFiles([]);
      } else {
        console.log('Fetched documents:', data);
        // Only include documents that have valid file paths and match our requirements
        const validDocuments = (data || []).filter(doc =>
          doc.file_path &&
          doc.status !== 'deleted' &&
          allKycDocumentIds.includes(doc.document_id)
        );

        console.log('Valid documents after filtering:', validDocuments);
        setDocumentFiles(validDocuments);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      setDocumentFiles([]);
    } finally {
      setIsLoadingDocuments(false);
    }
  }, [webData, isLoadingDocuments]);

  useEffect(() => {
    if (!isOpen) {
      // Reset state when dialog closes
      setWebData([]);
      setJobFields({});
      setSourceData({});
      setDocumentFiles([]);
      setEntityAutomationMappings([]);
      setSelectedAutomationId('');
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

            // Fetch automation details from webData automationId
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

        // Fetch automation details from webData automationId
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

        // Extract automation mappings from stage documents if available
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
  }, [isOpen]); // Remove dynamic dependencies to prevent infinite loops

  // New function to fetch automation details from webData
  const fetchAutomationFromWebData = async (webDataItems: any[]) => {
    try {
      const automationIds = new Set<string>();
      const mappings: EntityAutomationMapping[] = [];

      // Collect automation IDs from webData
      webDataItems.forEach((item, index) => {
        if (item.automationId) {
          automationIds.add(item.automationId);

          // Create a mapping entry for this webData item
          mappings.push({
            entityKey: `webdata-${index}`, // Use index as key for webData items
            entityName: item.documentName || `WebData Item ${index + 1}`,
            entityType: 'webdata',
            automationId: item.automationId
          });
        }
      });

      // Fetch automation details from tm_automations
      if (automationIds.size > 0) {
        const { data: automations, error } = await supabase
          .from('tm_automations')
          .select('*')
          .in('id', Array.from(automationIds));

        if (!error && automations) {
          // Map automation details to mappings
          mappings.forEach(mapping => {
            const automation = automations.find(a => a.id === mapping.automationId);
            if (automation) {
              mapping.automation = automation;
            }
          });
        }
      }

      setEntityAutomationMappings(mappings);

      // Set the first automation as selected by default
      if (mappings.length > 0 && mappings[0].automationId && !selectedAutomationId) {
        setSelectedAutomationId(mappings[0].automationId);
      }
    } catch (error) {
      console.error('Error fetching automation from webData:', error);
    }
  };

  // Separate useEffect for source data fetching with debouncing
  useEffect(() => {
    if (!isOpen || !currentIndividualId) return;

    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const debouncedFetch = () => {
      timeoutId = setTimeout(async () => {
        if (!isMounted) return;

        try {
          // Only fetch if we have the required data
          if (Object.keys(jobFields).length > 0) {
            await fetchSourceData(currentIndividualId);
          }
          if (webData.length > 0) {
            await fetchDocumentFiles(currentIndividualId);
          }
        } catch (error) {
          console.error('Error in debounced fetch:', error);
        }
      }, 300); // 300ms debounce
    };

    debouncedFetch();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [currentIndividualId, isOpen]); // Minimal dependencies

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
  }, [jobFields, webData]); // Only trigger when these are populated

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

    // Log multi-source fields for debugging
    if (sources.length > 1) {
      console.log(`🔗 Multi-source field detected:`, {
        masterFieldIds,
        sources: sources.map(s => ({
          label: s.fieldLabel,
          path: s.source
        }))
      });
    }

    return { sources, hasData: sources.length > 0 };
  };

  const getSourceValueMerged = (sources: any[]): string => {
    if (sources.length === 0) return "Missing";

    if (sources.length === 1) {
      // Single source - return normally
      const sourceInfo = sources[0];
      return getSourceValue(sourceInfo.table, sourceInfo.path);
    }

    // Multiple sources - merge them
    const validValues: string[] = [];

    sources.forEach(sourceInfo => {
      const value = getSourceValue(sourceInfo.table, sourceInfo.path);

      if (typeof value === 'string' && value !== 'Missing' && value.trim() !== '') {
        const trimmedValue = value.trim();

        // Avoid duplicate values
        if (!validValues.some(existing =>
          existing.toLowerCase() === trimmedValue.toLowerCase()
        )) {
          validValues.push(trimmedValue);
        }
      }
    });

    if (validValues.length === 0) return "Missing";

    // Join with spaces and clean up multiple spaces
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
      const queryField = table === 'acc_portal_directors_documents' ? 'director_id' : 'id';

      // Get current record
      const { data: existingData, error: fetchError } = await supabase
        .from(table)
        .select('*')
        .eq(queryField, currentIndividualId)
        .maybeSingle();

      const updateData = updateJsonValue(existingData || {}, path, editValue);

      if (fetchError && !existingData) {
        // Create new record
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
        // Update existing record
        const { error: updateError } = await supabase
          .from(table)
          .update({
            ...updateData,
            updated_at: new Date().toISOString()
          })
          .eq(queryField, currentIndividualId);

        if (updateError) throw updateError;
      }

      // Refresh data after successful update
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
          // No sources mapped, skip this field
          return;
        }

        if (sources.length === 1) {
          // Single source - handle normally
          const sourceInfo = sources[0];
          const value = getSourceValue(sourceInfo.table, sourceInfo.path);

          if (typeof value === 'string' && value !== 'Missing') {
            // Handle date parsing if field has array items with date components
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
          // Multiple sources - merge them
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
            // Merge all values into one string
            const mergedValue = allValues.join(' ').trim();

            console.log(`🔗 Merging multiple sources for field "${field.variableName}":`, {
              fieldName: field.efnsDisplayName || field.name,
              variableName: field.variableName,
              sourceLabels: sources.map(s => s.fieldLabel),
              individualValues: allValues,
              mergedValue: mergedValue
            });

            // Handle date parsing if field has array items with date components
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
          } else {
            console.log(`⚠️ No valid values found for multi-source field "${field.variableName}"`);
          }
        }
      });
    });

    console.log('📝 Final prepared form data:', formData);
    return formData;
  };

  // Helper function to merge source values with better logic
  const mergeSourceValues = (sources: any[], fieldName: string): string | null => {
    const validValues: string[] = [];

    sources.forEach((sourceInfo, index) => {
      const value = getSourceValue(sourceInfo.table, sourceInfo.path);

      if (typeof value === 'string' && value !== 'Missing' && value.trim() !== '') {
        const trimmedValue = value.trim();

        // Avoid duplicating values (in case same data appears in multiple sources)
        if (!validValues.some(existingValue =>
          existingValue.toLowerCase() === trimmedValue.toLowerCase()
        )) {
          validValues.push(trimmedValue);
        }

        console.log(`  Source ${index + 1} (${sourceInfo.fieldLabel}): "${trimmedValue}"`);
      } else {
        console.log(`  Source ${index + 1} (${sourceInfo.fieldLabel}): Missing or empty`);
      }
    });

    if (validValues.length === 0) {
      return null;
    }

    // Join all valid values with spaces
    const merged = validValues.join(' ');

    console.log(`🔗 Merged result for "${fieldName}": "${merged}"`);
    return merged;
  };

  // Alternative helper function for more sophisticated merging (if needed)
  const mergeSourceValuesAdvanced = (sources: any[], fieldName: string): string | null => {
    const sourceData: { label: string; value: string }[] = [];

    sources.forEach(sourceInfo => {
      const value = getSourceValue(sourceInfo.table, sourceInfo.path);

      if (typeof value === 'string' && value !== 'Missing' && value.trim() !== '') {
        sourceData.push({
          label: sourceInfo.fieldLabel,
          value: value.trim()
        });
      }
    });

    if (sourceData.length === 0) {
      return null;
    }

    // Special handling for name fields
    if (fieldName.toLowerCase().includes('name')) {
      // For names, join with spaces and remove extra spaces
      const merged = sourceData.map(s => s.value).join(' ').replace(/\s+/g, ' ').trim();

      console.log(`👤 Name field "${fieldName}" merged:`, {
        sources: sourceData,
        result: merged
      });

      return merged;
    }

    // For other fields, simple space-separated join
    const merged = sourceData.map(s => s.value).join(' ').trim();

    console.log(`📄 Field "${fieldName}" merged:`, {
      sources: sourceData,
      result: merged
    });

    return merged;
  };

  const parseDateToComponents = (dateValue: string): { day: string; month: string; year: string } | string => {
    if (!dateValue) return dateValue;

    // Month name to number mapping
    const monthNames: Record<string, string> = {
      'Jan': '01', 'January': '01',
      'Feb': '02', 'February': '02',
      'Mar': '03', 'March': '03',
      'Apr': '04', 'April': '04',
      'May': '05', 'May': '05',
      'Jun': '06', 'June': '06',
      'Jul': '07', 'July': '07',
      'Aug': '08', 'August': '08',
      'Sep': '09', 'September': '09',
      'Oct': '10', 'October': '10',
      'Nov': '11', 'November': '11',
      'Dec': '12', 'December': '12'
    };

    // Month number to short name mapping (for output)
    const monthNumberToName: Record<string, string> = {
      '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
      '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
      '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
    };

    const formats = [
      // Numeric formats
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // DD/MM/YYYY
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD
      /^(\d{1,2})-(\d{1,2})-(\d{4})$/, // DD-MM-YYYY

      // Month name formats
      /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/, // DD Month YYYY (e.g., "15 Jan 2024")
      /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/, // Month DD, YYYY (e.g., "Jan 15, 2024" or "Jan 15 2024")
      /^(\d{1,2})[-\/]([A-Za-z]+)[-\/](\d{4})$/, // DD-Month-YYYY or DD/Month/YYYY
      /^([A-Za-z]+)[-\/](\d{1,2})[-\/](\d{4})$/, // Month-DD-YYYY or Month/DD/YYYY
    ];

    for (let i = 0; i < formats.length; i++) {
      const format = formats[i];
      const match = dateValue.match(format);

      if (match) {
        let day, month, year;

        if (i === 0 || i === 2) { // DD/MM/YYYY or DD-MM-YYYY
          [, day, month, year] = match;
          // Convert numeric month to month name
          month = monthNumberToName[month.padStart(2, '0')] || month.padStart(2, '0');
        } else if (i === 1) { // YYYY-MM-DD
          [, year, month, day] = match;
          // Convert numeric month to month name
          month = monthNumberToName[month.padStart(2, '0')] || month.padStart(2, '0');
        } else if (i === 3) { // DD Month YYYY
          [, day, month, year] = match;
          // Month is already a name, convert to short form if needed
          month = getShortMonthName(month, monthNames);
        } else if (i === 4) { // Month DD, YYYY
          [, month, day, year] = match;
          // Month is already a name, convert to short form if needed
          month = getShortMonthName(month, monthNames);
        } else if (i === 5) { // DD-Month-YYYY
          [, day, month, year] = match;
          // Month is already a name, convert to short form if needed
          month = getShortMonthName(month, monthNames);
        } else if (i === 6) { // Month-DD-YYYY
          [, month, day, year] = match;
          // Month is already a name, convert to short form if needed
          month = getShortMonthName(month, monthNames);
        }

        return {
          day: day.padStart(2, '0'),
          month: month, // Return month name (e.g., "Jan", "Feb", etc.)
          year: year
        };
      }
    }

    // If no format matches, return the original value
    return dateValue;
  };

  // Helper function to get short month name
  const getShortMonthName = (monthInput: string, monthNames: Record<string, string>): string => {
    const monthInputLower = monthInput.toLowerCase();

    // Check if it's already a short month name
    for (const [shortName] of Object.entries(monthNames)) {
      if (shortName.toLowerCase() === monthInputLower) {
        return shortName;
      }
    }

    // Check if it's a full month name
    for (const [shortName] of Object.entries(monthNames)) {
      const fullName = getFullMonthName(shortName);
      if (fullName.toLowerCase() === monthInputLower) {
        return shortName;
      }
    }

    // If not found, return the first 3 characters capitalized
    return monthInput.charAt(0).toUpperCase() + monthInput.slice(1, 3).toLowerCase();
  };

  // Helper function to get full month name from short name
  const getFullMonthName = (shortName: string): string => {
    const fullNames: Record<string, string> = {
      'Jan': 'January', 'Feb': 'February', 'Mar': 'March', 'Apr': 'April',
      'May': 'May', 'Jun': 'June', 'Jul': 'July', 'Aug': 'August',
      'Sep': 'September', 'Oct': 'October', 'Nov': 'November', 'Dec': 'December'
    };
    return fullNames[shortName] || shortName;
  };

  // Enhanced handleRunAutomation with improved document URL handling
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

      // Get the selected automation details
      const selectedMapping = entityAutomationMappings.find(m => m.automationId === selectedAutomationId);
      if (!selectedMapping?.automation) {
        throw new Error('Selected automation details not found');
      }

      const automation = selectedMapping.automation;

      // Find the corresponding webData item
      const webDataItem = webData.find(item => item.automationId === selectedAutomationId);
      if (!webDataItem) {
        throw new Error('WebData configuration not found for selected automation');
      }

      const formData = prepareFormData();

      // Enhanced document URL retrieval with better error handling
      const documentUrl = getDocumentUrlWithFallback();

      if (!documentUrl) {
        console.warn('⚠️ No document URL found for automation. This may be expected if no document is linked to any stage.');
        // Show user-friendly message but continue with automation
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
        // requirementId: getRequirementId(),
        photoUrl: documentUrl, // Use dynamic document URL
        // webDataItem: {
        //   documentId: webDataItem.documentId,
        //   documentName: webDataItem.documentName,
        //   automationId: webDataItem.automationId,
        //   fields: webDataItem.fields?.length || 0,
        //   kycDocsUpload: webDataItem.kycDocsUpload?.length || 0,
        //   photoUrl: documentUrl // Also include in webDataItem for backward compatibility
        // },
      };

      console.log('🚀 Sending automation request with payload:', payload);
      console.log('📡 Using webhook URL:', automation.webhook_url);
      console.log('📄 Document URL from linked document:', documentUrl);
      console.log('🗃️ WebData item:', webDataItem);

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
                          // Single source - show normally with inline editing
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
                          // Multi-source - show individual values with separate editing
                          <div className="space-y-2 text-sm">
                            {/* Show merged value at top */}
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

                            {/* Show individual sources with separate editing */}
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
        {/* Automation Selector */}
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
                {/* Login Configuration if available */}
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

  const renderDocumentsSection = () => {
    if (isLoadingDocuments) {
      return (
        <div className="flex flex-col items-center justify-center p-12 space-y-4 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div>
            <h4 className="font-medium text-gray-700">Gathering Documents</h4>
            <p className="text-sm text-gray-500 mt-1">Searching for all associated files and records...</p>
          </div>
        </div>
      );
    }

    if (!documentFiles.length) {
      const requiredKycIds = webData.flatMap(item =>
        (item.kycDocsUpload || []).map(upload => upload.kycDocumentId)
      ).filter(Boolean);

      return (
        <div className="text-center p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
            <FileText className="h-8 w-8 text-blue-500" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No Documents Found</h3>

          {!currentIndividualId ? (
            <div className="mt-2">
              <p className="text-gray-600">Enter an Individual ID to search for documents</p>
              <div className="mt-4 inline-flex items-center justify-center rounded-md bg-gray-50 px-4 py-2 text-sm text-gray-500">
                <User className="mr-2 h-4 w-4" />
                Individual ID Required
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h4 className="text-sm font-medium text-amber-800">Action Required</h4>
                  <div className="mt-2 text-sm text-amber-700">
                    <p>No documents found for individual <span className="font-semibold">{currentIndividualId}</span>.</p>
                    <p className="mt-1">Please upload the following required documents:</p>
                    <ul className="mt-2 space-y-1">
                      {requiredKycIds.map(kycId => {
                        const webDataDoc = webData.flatMap(item => item.kycDocsUpload || [])
                          .find(doc => doc.kycDocumentId === kycId);
                        return (
                          <li key={kycId} className="flex items-center">
                            <svg className="h-4 w-4 text-amber-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-sm">
                              {webDataDoc?.entityType || 'Document'} (KYC ID: {kycId})
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Document Summary Card */}
        <div className="rounded-lg border border-blue-100 bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-blue-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Database className="h-5 w-5" />
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">Document Repository</h3>
                </div>
              </div>
              <div className="flex-shrink-0">
                <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                  {documentFiles.length} {documentFiles.length === 1 ? 'Document' : 'Documents'} Found
                </span>
              </div>
            </div>
          </div>
          <div className="p-4 bg-white">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Required Document Types</h4>
            <div className="flex flex-wrap gap-2">
              {webData.flatMap(item => item.kycDocsUpload || []).map((doc, index) => (
                <Badge
                  key={doc.kycDocumentId}
                  variant="outline"
                  className="text-xs py-1 px-2.5 border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-50"
                >
                  <span className="font-medium">{doc.entityType || 'Document'}</span>
                  <span className="ml-1.5 font-mono text-[11px] text-blue-600">
                    {doc.kycDocument?.display_name || 'N/A'}  
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Document Preview Card */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-medium text-gray-700">Document Preview</h3>
          </div>
          <div className="p-4">
            {(() => {
              const documentUrl = getDocumentUrlWithFallback();
              if (documentUrl) {
                const usedDocument = documentFiles.find(doc => {
                  const testUrl = buildFileUrl(doc);
                  return testUrl === documentUrl;
                });

                return (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center text-sm text-gray-500 mb-1">
                          <span className="truncate">
                            {usedDocument?.file_name || usedDocument?.file_path?.split('/').pop() || 'Document'}
                          </span>
                        </div>
                        <div className="mt-1">
                          <div className="text-xs font-mono text-gray-500 bg-gray-50 p-2 rounded border border-gray-200 overflow-x-auto">
                            {documentUrl}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-4 flex-shrink-0"
                        onClick={() => setPreviewDocument({
                          file_name: usedDocument?.file_name || usedDocument?.file_path?.split('/').pop() || 'Document',
                          fileUrl: documentUrl,
                          extractedData: {}
                        })}
                      >
                        <Eye className="h-4 w-4 mr-1.5" />
                        Preview
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-100">
                        <span className="relative flex h-2 w-2 mr-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        Document Ready
                      </Badge>

                      {usedDocument?.document_id && (
                        <Badge variant="outline" className="text-xs">
                          <span className="text-gray-500 mr-1">KYC ID:</span>
                          <span className="font-mono">{usedDocument.document_id}</span>
                        </Badge>
                      )}

                      {stage && (
                        <div className="text-xs text-gray-500 flex items-center">
                          <span className="hidden sm:inline">Stage:</span>
                          <Badge variant="outline" className="ml-1 text-xs bg-blue-50 border-blue-100 text-blue-700">
                            {stage.name || stage.id}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                );
              } else {
                const requiredKycIds = webData.flatMap(item =>
                  (item.kycDocsUpload || []).map(upload => upload.kycDocumentId)
                ).filter(Boolean);

                return (
                  <div className="text-center p-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                    <div className="mx-auto h-12 w-12 text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No document linked</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {requiredKycIds.length > 0
                        ? 'Upload documents with the following KYC IDs:'
                        : 'No specific document requirements found.'}
                    </p>

                    {requiredKycIds.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-medium text-gray-700 mb-1">Required KYC IDs:</div>
                        <div className="flex flex-wrap gap-1.5 justify-center">
                          {requiredKycIds.map((kycId, idx) => (
                            <span key={idx} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {kycId}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-4">
                      <Button variant="outline" size="sm">
                        <svg className="-ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Upload Document
                      </Button>
                    </div>
                  </div>
                );
              }
            })()}
          </div>
        </div>
      </div>
    );
  };

  const handleDocumentPreview = (file: any) => {
    try {
      const kycDocument = file.kyc_document;

      if (!kycDocument || !file.file_path) {
        console.error('Error preparing preview: Missing kyc_document or file_path in the provided file object.', file);
        toast({
          title: 'Preview Error',
          description: 'Cannot preview the document because essential configuration or file path is missing.',
          variant: 'destructive',
        });
        return;
      }

      // Build the file URL directly from the file data
      const bucketName = 'kyc-documents';
      const filePath = file.file_path.startsWith(bucketName)
        ? file.file_path
        : `${bucketName}/${file.file_path}`;
      const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;

      console.log('Previewing document with pre-fetched data:', {
        fileId: file.id,
        documentId: file.document_id,
        filePath: file.file_path,
        fileUrl,
        kycDocumentId: kycDocument.id,
      });

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

      // Use extracted data from the file, with fallbacks
      let extractedData = {};
      if (file.extracted_details && typeof file.extracted_details === 'object') {
        extractedData = { ...file.extracted_details };
      } else if (file.extracted_data && typeof file.extracted_data === 'object') {
        extractedData = { ...file.extracted_data };
      } else if (file.extraction_result && typeof file.extraction_result === 'object') {
        extractedData = { ...file.extraction_result };
      }

      // Ensure all fields have values in extractedData for the form
      documentFields.forEach((field: any) => {
        const fieldName = field.name;
        if (extractedData[fieldName] === undefined) {
          extractedData[fieldName] = field.isArray ? [] : '';
        }
      });

      const documentName = kycDocument.display_name || kycDocument.name || 'Document';
      const fileName = file.file_name || file.file_path?.split('/').pop() || documentName;

      // Determine file type for proper preview
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
      const fileType = getFileType(fileName, file.mime_type);

      setPreviewDocument({
        file: { ...file, name: fileName, type: fileType, url: fileUrl },
        fileUrl,
        fileName,
        documentName,
        fields: documentFields,
        extractedData,
        type: kycDocument.document_type || 'document',
      });

    } catch (error) {
      console.error('Error preparing document preview:', error);
      toast({
        title: 'Error',
        description: 'Failed to prepare document preview: ' + (error?.message || 'Unknown error'),
        variant: 'destructive',
      });
    }
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
              <Tabs defaultValue="automation" className="max-h-[100vh] flex flex-col">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="automation" className="gap-2">
                    <Settings className="h-4 w-4" />
                    Automation Config
                  </TabsTrigger>
                  <TabsTrigger value="fields" className="gap-2">
                    <Database className="h-4 w-4" />
                    Field Mapping
                  </TabsTrigger>
                  <TabsTrigger value="documents" className="gap-2">
                    <FileText className="h-4 w-4" />
                    Documents ({documentFiles.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="automation" className="flex-grow overflow-y-auto mt-4">
                  {renderAutomationConfig()}
                </TabsContent>

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

      {/* Document Preview Dialog */}
      <Dialog open={!!previewDocument} onOpenChange={(open) => !open && setPreviewDocument(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Document Preview</DialogTitle>
            <DialogDescription>
              {previewDocument?.file_name || 'Document'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            {previewDocument && (
              <ExtractionPreview
                documentName={previewDocument.file_name}
                extractedData={previewDocument.extractedData || {}}
                fileUrl={previewDocument.fileUrl}
                fileName={previewDocument.file_name}
                viewMode={true}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDocument(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
