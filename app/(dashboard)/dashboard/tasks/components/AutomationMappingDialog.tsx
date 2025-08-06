// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { Database, Edit2, FileText, Loader2, Settings, User, X, Zap, Check } from "lucide-react";
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
  stageDocuments?: any[]; // Add stage documents to get automation links
  allDocuments?: any[]; // Add allDocuments to access linked documents
  stage?: any; // Add stage to get linked document for this specific stage
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
  allDocuments = [], // Add allDocuments prop
  stage // Add stage prop
}: AutomationMappingDialogProps) => {
  const [isLoading, setIsLoading] = useState(true);
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
  const [editingState, setEditingState] = useState<{
    fieldIndex: number;
    sourceIndex: number;
    table: string;
    path: string;
    value: string;
  } | null>(null);
  const [editingCell, setEditingCell] = useState<any>(null);
  const [editValue, setEditValue] = useState('');

  const getIndividualId = () => {
    if (individualId) return individualId;
    if (task?.individual_id) return task.individual_id.toString();
    if (task?.principal_member) return task.principal_member.toString();
    return '';
  };

  const [currentIndividualId, setCurrentIndividualId] = useState(getIndividualId());

  // Enhanced function to get document URL for automation payload with comprehensive fallback strategies
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
    if (!individualId || !jobFields || Object.keys(jobFields).length === 0) return;

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
          const queryField = table === 'acc_portal_directors_documents' ? 'director_id' : 'id';
          const { data, error } = await supabase.from(table).select('*').eq(queryField, individualId).maybeSingle();
          
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
      const allKycDocumentIds = webData.flatMap(item => 
        (item.kycDocsUpload || []).map(upload => upload.kycDocumentId)
      ).filter(Boolean);

      if (allKycDocumentIds.length === 0) {
        setDocumentFiles([]);
        return;
      }

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
        description: 'Failed to update field: ' + (error?.message || 'Unknown error'),
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
              <TableHead className="w-1/4 border-r text-white">Source Path</TableHead>
              <TableHead className="w-1/4 border-r text-white">Current Value</TableHead>
              <TableHead className="w-[150px] border-r text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.flatMap((field, fieldIndex) => {
              const { sources, hasData } = getSourceInfo(field.masterFieldIds || []);
              
              if (sources.length === 0) {
                return (
                  <TableRow key={`${field.variableName || fieldIndex}-empty`}>
                    <TableCell className="align-top border-r">{fieldIndex + 1}</TableCell>
                    <TableCell className="align-top border-r">
                      <div className="text-sm font-medium text-gray-900">
                        {field.efnsDisplayName || field.name}
                        {field.isRequired && <span className="ml-1 text-red-500">*</span>}
                      </div>
                      <div className="text-xs text-gray-500 font-mono mt-1">
                        {field.variableName}
                      </div>
                    </TableCell>
                    <TableCell colSpan={3} className="text-center text-gray-400">
                      No source mapping
                    </TableCell>
                  </TableRow>
                );
              }
              
              return sources.map((source, sourceIndex) => {
                const isEditing = editingState?.fieldIndex === fieldIndex && 
                                editingState?.sourceIndex === sourceIndex;
                const value = getSourceValue(source.table, source.path);
                const displayValue = typeof value === 'string' && value !== 'Missing' 
                  ? value 
                  : <span className="text-red-600 italic">Missing</span>;
                
                return (
                  <TableRow 
                    key={`${field.variableName || fieldIndex}-${sourceIndex}`}
                    className={sourceIndex > 0 ? 'bg-gray-50' : ''}
                  >
                    {sourceIndex === 0 && (
                      <TableCell 
                        rowSpan={sources.length} 
                        className="align-top border-r"
                      >
                        {fieldIndex + 1}
                      </TableCell>
                    )}
                    {sourceIndex === 0 && (
                      <TableCell 
                        rowSpan={sources.length} 
                        className="align-top border-r"
                      >
                        <div className="text-sm font-medium text-gray-900">
                          {field.efnsDisplayName || field.name}
                          {field.isRequired && <span className="ml-1 text-red-500">*</span>}
                        </div>
                        <div className="text-xs text-gray-500 font-mono mt-1">
                          {field.variableName}
                        </div>
                        {sources.length > 1 && sourceIndex === 0 && (
                          <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 mt-1">
                            {sources.length} sources
                          </Badge>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="align-top border-r">
                      <div className="font-mono text-xs">
                        <div className="font-medium text-gray-800">{source.fieldLabel}</div>
                        <div className="text-blue-600 break-all">{source.source}</div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top border-r">
                      {isEditing ? (
                        <div className="flex items-center space-x-2">
                          <Input
                            autoFocus
                            value={editingState?.value || ''}
                            onChange={(e) => setEditingState({
                              ...editingState!,
                              value: e.target.value
                            })}
                            onKeyDown={handleKeyDown}
                            onBlur={saveEdit}
                            className="h-8 text-sm"
                            placeholder="Enter value"
                          />
                        </div>
                      ) : (
                        <div 
                          className={`p-1 rounded ${currentIndividualId ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                          onClick={() => {
                            if (currentIndividualId) {
                              startEditing(fieldIndex, sourceIndex, source.table, source.path, value === 'Missing' ? '' : value);
                            }
                          }}
                        >
                          {displayValue}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top border-r">
                      {!isEditing && currentIndividualId && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            startEditing(fieldIndex, sourceIndex, source.table, source.path, value === 'Missing' ? '' : value);
                          }}
                          className="h-8 px-2 text-xs"
                        >
                          <Edit2 className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                      )}
                      {isEditing && (
                        <div className="flex space-x-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={saveEdit}
                            className="h-8 px-2 text-xs"
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Save
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setEditingState(null)}
                            className="h-8 px-2 text-xs"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              });
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
            <CardDescription>
              Select which automation to run from the configured webData items.
            </CardDescription>
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
                <div>
                  <Label className="text-sm font-medium text-gray-700">Method</Label>
                  <div className="p-2 bg-gray-50 rounded border text-sm">
                    <Badge variant="outline">
                      {selectedMapping.automation.webhook_method || 'POST'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Type</Label>
                  <div className="p-2 bg-gray-50 rounded border text-sm">
                    <Badge variant="outline">
                      {selectedMapping.automation.webhook_type || 'Standard'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Status</Label>
                  <div className="p-2 bg-gray-50 rounded border text-sm">
                    <Badge variant={selectedMapping.automation.is_active ? "default" : "destructive"}>
                      {selectedMapping.automation.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-sm font-medium text-gray-700">Description</Label>
                  <div className="p-2 bg-gray-50 rounded border text-sm text-gray-600">
                    {selectedMapping.automation.description || 'No description available'}
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

                {/* Enhanced Document URL Display */}
                <div className="md:col-span-2">
                  <Label className="text-sm font-medium text-gray-700">Document URL</Label>
                  <div className="p-2 bg-gray-50 rounded border">
                    {(() => {
                      const documentUrl = getDocumentUrlWithFallback();
                      if (documentUrl) {
                        // Check which document is being used
                        const usedDocument = documentFiles.find(doc => {
                          const testUrl = buildFileUrl(doc);
                          return testUrl === documentUrl;
                        });

                        return (
                          <div className="space-y-2">
                            <div className="text-xs font-mono text-gray-600 break-all">{documentUrl}</div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="default" className="text-xs">
                                Document Available
                              </Badge>
                              {usedDocument && (
                                <Badge variant="outline" className="text-xs">
                                  KYC ID: {usedDocument.document_id}
                                </Badge>
                              )}
                              {stage && (
                                <span className="text-xs text-gray-500">
                                  Target stage: {stage.name || stage.id}
                                </span>
                              )}
                            </div>
                            {usedDocument && (
                              <div className="text-xs text-blue-600">
                                Using: {usedDocument.file_name || usedDocument.file_path?.split('/').pop()}
                              </div>
                            )}
                          </div>
                        );
                      } else {
                        return (
                          <div className="space-y-1">
                            <div className="text-xs text-gray-500 italic">No document available for automation</div>
                            <Badge variant="outline" className="text-xs">
                              No Document
                            </Badge>
                            <div className="text-xs text-amber-600 mt-1">
                              Upload documents matching KYC ID: {webData.flatMap(item => 
                                (item.kycDocsUpload || []).map(upload => upload.kycDocumentId)
                              ).filter(Boolean).join(', ')}
                            </div>
                          </div>
                        );
                      }
                    })()}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* WebData Items Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-5 w-5 text-green-600" />
              WebData Configurations
            </CardTitle>
            <CardDescription>
              All webData items configured for this requirement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {webData.map((item, index) => {
                const mapping = entityAutomationMappings.find(m => m.automationId === item.automationId);
                const isSelected = item.automationId === selectedAutomationId;
                
                return (
                  <div 
                    key={index}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => item.automationId && setSelectedAutomationId(item.automationId)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-gray-900">{item.documentName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <Badge className="text-xs bg-blue-600">Selected</Badge>
                        )}
                        {item.automationId ? (
                          <Badge variant="outline" className="text-xs text-green-600">
                            <Zap className="h-3 w-3 mr-1" />
                            Automation
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-gray-500">
                            No Automation
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600">
                      <div>
                        <span className="font-medium">Fields:</span> {item.fields?.length || 0}
                      </div>
                      <div>
                        <span className="font-medium">Documents:</span> {item.kycDocsUpload?.length || 0}
                      </div>
                      <div>
                        <span className="font-medium">Automation:</span> 
                        <span className="font-mono ml-1">
                          {mapping?.automation?.name || item.automationId?.slice(0, 8) + '...' || 'None'}
                        </span>
                      </div>
                    </div>
                    
                    {item.documentId && (
                      <div className="mt-2 text-xs text-blue-600">
                        Document ID: {item.documentId}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
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
      <div className="space-y-4">
        {/* Show which documents are being used */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-800 mb-2">Documents for WebData Requirements</h4>
          <p className="text-sm text-blue-700">
            Showing documents that match the KYC requirements for this automation: 
            {webData.flatMap(item => 
              (item.kycDocsUpload || []).map(upload => upload.kycDocumentId)
            ).filter(Boolean).join(', ')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documentFiles.map((file) => {
            const kycDocConfig = webData.flatMap(item => item.kycDocsUpload || [])
              .find(doc => doc.kycDocumentId === file.document_id);

            // Check if this document will be used for automation
            const isAutomationDocument = webData.flatMap(item => 
              (item.kycDocsUpload || []).map(upload => upload.kycDocumentId)
            ).includes(file.document_id);

            return (
              <Card key={file.id} className={`cursor-pointer hover:shadow-md transition-shadow ${
                isAutomationDocument ? 'ring-2 ring-blue-500 bg-blue-50' : ''
              }`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {file.mime_type?.startsWith('image/') ? (
                        <ImageIcon className="h-4 w-4" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                      <CardTitle className="text-sm font-medium truncate">
                        {file.file_name || 'Untitled Document'}
                      </CardTitle>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className="text-xs">
                        {file.mime_type?.split('/')[1]?.toUpperCase() || 'FILE'}
                      </Badge>
                      {isAutomationDocument && (
                        <Badge variant="default" className="text-xs bg-blue-600">
                          Automation Doc
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardDescription className="text-xs">
                    KYC ID: {file.document_id}
                    <br />
                    {kycDocConfig?.entityType || 'Document'} • {Math.round((file.file_size || 0) / 1024)} KB
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                      Uploaded: {new Date(file.uploaded_at || file.created_at).toLocaleDateString()}
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
      </div>
    );
  };

  const handleDocumentPreview = async (file: any) => {
    try {
      // Build the file URL directly from the file data
      const bucketName = 'kyc-documents';
      const filePath = file.file_path?.startsWith(bucketName)
        ? file.file_path
        : `${bucketName}/${file.file_path}`;
      const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
  
      console.log('Previewing document:', {
        fileId: file.id,
        documentId: file.document_id,
        filePath: file.file_path,
        fileUrl,
        mimeType: file.mime_type,
        fileName: file.file_name
      });
  
      // Get KYC document configuration
      const { data: kycDocument, error: kycError } = await supabase
        .from('acc_portal_kyc')
        .select('*')
        .eq('id', file.document_id)
        .single();
  
      if (kycError || !kycDocument) {
        console.error('Failed to load KYC document:', kycError);
        toast({ 
          title: 'Error', 
          description: 'Failed to load document configuration', 
          variant: 'destructive' 
        });
        return;
      }
  
      console.log('KYC Document loaded:', {
        id: kycDocument.id,
        name: kycDocument.name,
        display_name: kycDocument.display_name,
        fields: kycDocument.fields,
        document_type: kycDocument.document_type
      });
  
      // Transform KYC fields to ExtractionPreview format
      const kycFields = kycDocument.fields || [];
      const documentFields = kycFields.map((field: any) => ({
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
            required: subField.isRequired || subField.required || false
          })),
          maxItems: field.arrayConfig.maxItems || 10
        } : undefined
      }));
  
      console.log('Transformed document fields:', documentFields);
  
      // Use extracted data from the file, with fallbacks
      let extractedData = {};
      
      // Try multiple possible sources for extracted data
      if (file.extracted_details && typeof file.extracted_details === 'object') {
        extractedData = { ...file.extracted_details };
      } else if (file.extracted_data && typeof file.extracted_data === 'object') {
        extractedData = { ...file.extracted_data };
      } else if (file.extraction_result && typeof file.extraction_result === 'object') {
        extractedData = { ...file.extraction_result };
      }
  
      console.log('Initial extracted data:', extractedData);
  
      // Ensure all fields have values in extractedData
      documentFields.forEach((field: any) => {
        const fieldName = field.name;
        const fieldId = field.id;
        
        // Check if data exists for this field (by name or id)
        if (extractedData[fieldName] === undefined && extractedData[fieldId] === undefined) {
          // Initialize with appropriate default value
          const defaultValue = field.isArray ? [] : '';
          extractedData[fieldName] = defaultValue;
          extractedData[fieldId] = defaultValue;
        } else if (extractedData[fieldName] === undefined && extractedData[fieldId] !== undefined) {
          // Copy from ID to name
          extractedData[fieldName] = extractedData[fieldId];
        } else if (extractedData[fieldId] === undefined && extractedData[fieldName] !== undefined) {
          // Copy from name to ID
          extractedData[fieldId] = extractedData[fieldName];
        }
      });
  
      console.log('Final extracted data:', extractedData);
  
      const documentName = kycDocument.display_name || kycDocument.name || 'Document';
      const fileName = file.file_name || file.file_path?.split('/').pop() || documentName;
  
      // Determine file type for proper preview
      const getFileType = (fileName: string, mimeType?: string) => {
        if (mimeType) {
          if (mimeType.startsWith('image/')) return 'image';
          if (mimeType === 'application/pdf') return 'pdf';
        }
        
        if (fileName) {
          const extension = fileName.toLowerCase().split('.').pop();
          if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension || '')) return 'image';
          if (extension === 'pdf') return 'pdf';
        }
        
        return 'unknown';
      };
  
      const fileType = getFileType(fileName, file.mime_type);
  
      console.log('File type determined:', {
        fileName,
        mimeType: file.mime_type,
        fileType
      });
  
      setPreviewDocument({
        file: {
          ...file,
          name: fileName,
          type: fileType,
          url: fileUrl
        },
        fileUrl,
        fileName,
        documentName,
        fields: documentFields,
        extractedData,
        type: kycDocument.document_type || 'document'
      });
  
      console.log('Document preview prepared:', {
        documentName,
        fieldsCount: documentFields.length,
        extractedDataKeys: Object.keys(extractedData),
        fileType,
        hasFileUrl: !!fileUrl
      });
  
    } catch (error) {
      console.error('Error preparing document preview:', error);
      toast({ 
        title: 'Error', 
        description: 'Failed to prepare document preview: ' + (error?.message || 'Unknown error'), 
        variant: 'destructive' 
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
      {previewDocument && (
        <Dialog open={!!previewDocument} onOpenChange={() => setPreviewDocument(null)}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full p-0">
            <DialogHeader className="p-6 pb-0">
              <DialogTitle className="flex items-center gap-2">
                {previewDocument.file.mime_type?.startsWith('image/') ? (
                  <ImageIcon className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
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
            <div className="p-6 pt-0 border-t">
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
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};