// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Zap, User, Database, FileText, Eye, Image as ImageIcon, Settings, Link } from 'lucide-react';
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
  const linkedDocumentData = task.source_document_id?.[stage.id];

  if (linkedDocumentData) {
    const documentId = typeof linkedDocumentData === 'string'
      ? linkedDocumentData
      : linkedDocumentData.id;
    // Find the document instance from allDocuments by its unique ID
    const linkedDoc = allDocuments.find(doc => doc.id === documentId);
    return linkedDoc || null;
  }
  return null;
};

// Helper function to build file URL (same pattern as EditableStageCell)
const buildFileUrl = (linkedDoc: any): string | null => {
  if (!linkedDoc?.file_path) return null;

  const bucketName = 'kyc-documents';
  const filePath = linkedDoc.file_path?.startsWith(bucketName)
    ? linkedDoc.file_path
    : `${bucketName}/${linkedDoc.file_path}`;

  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
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
  const [editingCell, setEditingCell] = useState<any>(null);
  const [editValue, setEditValue] = useState('');

  const getIndividualId = () => {
    if (individualId) return individualId;
    if (task?.individual_id) return task.individual_id.toString();
    if (task?.principal_member) return task.principal_member.toString();
    return '';
  };

  const [currentIndividualId, setCurrentIndividualId] = useState(getIndividualId());

  // Enhanced function to get document URL for automation payload
  const getDocumentUrlForAutomation = useCallback((): string | null => {
    if (!stage || !task || !allDocuments?.length) {
      console.log('Missing required data for document URL:', { stage: !!stage, task: !!task, allDocuments: allDocuments?.length });
      return null;
    }

    // Get the linked document for this stage (same logic as EditableStageCell)
    const linkedDoc = getLinkedDocumentForStage(task, stage, allDocuments);
    
    if (!linkedDoc) {
      console.log('No linked document found for stage:', stage.id);
      return null;
    }

    // Build file URL using the same pattern as EditableStageCell
    const fileUrl = buildFileUrl(linkedDoc);
    
    console.log('Built document URL for automation:', {
      documentId: linkedDoc.id,
      filePath: linkedDoc.file_path,
      fileUrl
    });

    return fileUrl;
  }, [stage, task, allDocuments]);

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
        if (sources.length > 0) {
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
        }
      });
    });

    return formData;
  };

  const parseDateToComponents = (dateValue: string): { day: string; month: string; year: string } | string => {
    if (!dateValue) return dateValue;

    const formats = [
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // DD/MM/YYYY
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD
      /^(\d{1,2})-(\d{1,2})-(\d{4})$/, // DD-MM-YYYY
    ];

    for (const format of formats) {
      const match = dateValue.match(format);
      if (match) {
        let day, month, year;
        
        if (format === formats[1]) { // YYYY-MM-DD
          [, year, month, day] = match;
        } else { // DD/MM/YYYY or DD-MM-YYYY
          [, day, month, year] = match;
        }

        return {
          day: day.padStart(2, '0'),
          month: month.padStart(2, '0'),
          year: year
        };
      }
    }

    return dateValue;
  };

  // Enhanced handleRunAutomation with dynamic document URL
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
      
      // Get the document URL dynamically from the linked document (same as EditableStageCell)
      const documentUrl = getDocumentUrlForAutomation();
      
      if (!documentUrl) {
        console.warn('No document URL found for automation. This may be expected if no document is linked.');
        // Continue with automation even if no document URL (some automations may not require documents)
      }

      const payload = {
        url: "https://fns.immigration.go.ke/account/login.html",
        login: automation.login,
        formData: formData,
        taskId: taskId,
        individualId: currentIndividualId,
        classId: classId,
        requirementId: getRequirementId(),
        photoUrl: documentUrl, // Use dynamic document URL instead of hardcoded
        webDataItem: {
          documentId: webDataItem.documentId,
          documentName: webDataItem.documentName,
          fields: webDataItem.fields?.length || 0,
          kycDocsUpload: webDataItem.kycDocsUpload?.length || 0,
          photoUrl: documentUrl // Also include in webDataItem for backward compatibility
        }
      };

      console.log('Sending automation request with payload:', payload);
      console.log('Using webhook URL:', automation.webhook_url);
      console.log('Document URL from linked document:', documentUrl);
      console.log('WebData item:', webDataItem);

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
      console.error('Error triggering automation:', error);

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
        <Table className="max-w-6xl max-h-[90vh] flex flex-col overflow-y-auto">
          <TableHeader className="bg-blue-500">
            <TableRow>
              <TableHead className="w-[50px] border-r text-white">#</TableHead>
              <TableHead className="w-1/4 border-r text-white">WebData Field</TableHead>
              <TableHead className="w-1/4 border-r text-white">Source Path</TableHead>
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
                    <Badge variant="outline" className="mt-1 text-xs">
                      {field.fieldType}
                    </Badge>
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
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No source linked</span>
                    )}
                  </TableCell>
                  <TableCell    
                    className="align-top border-r cursor-pointer hover:bg-gray-50 w-1/4"
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
                                title="Click to edit"
                              >
                                {typeof value === 'string' && value !== 'Missing' ? (
                                  <span className="text-green-700 font-medium">{value}</span>
                                ) : (
                                  <span className="text-red-600 italic">Missing</span>
                                )}
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

                {/* Show Document URL being used */}
                <div className="md:col-span-2">
                  <Label className="text-sm font-medium text-gray-700">Document URL</Label>
                  <div className="p-2 bg-gray-50 rounded border text-xs font-mono text-gray-600 break-all">
                    {getDocumentUrlForAutomation() || 'No document linked for this stage'}
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documentFiles.map((file) => {
          const kycDocConfig = webData.flatMap(item => item.kycDocsUpload || [])
            .find(doc => doc.kycDocumentId === file.document_id);

          return (
            <Card key={file.id} className="cursor-pointer hover:shadow-md transition-shadow">
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

  const handleDocumentPreview = async (file: any) => {
    try {
      const fileUrl = supabase.storage.from('kyc-documents').getPublicUrl(file.file_path).data.publicUrl;

      const kycDocConfig = webData.flatMap(item => item.kycDocsUpload || [])
        .find(doc => doc.kycDocumentId === file.document_id);

      if (!kycDocConfig) {
        toast({ title: 'Error', description: 'Document configuration not found', variant: 'destructive' });
        return;
      }

      const { data: kycDocument, error: kycError } = await supabase
        .from('acc_portal_kyc')
        .select('*')
        .eq('id', file.document_id)
        .single();

      if (kycError || !kycDocument) {
        toast({ title: 'Error', description: 'Failed to load document configuration', variant: 'destructive' });
        return;
      }

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

      const extractedData = file.extracted_details || {};

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
              <Tabs defaultValue="automation" className="h-full flex flex-col">
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