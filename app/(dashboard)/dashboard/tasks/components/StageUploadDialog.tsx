// @ts-nocheck
"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, Send, FileText, MessageSquare, Star, Eye, Check } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { format, parseISO } from "date-fns"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { UploadModal } from "@/app/generic-components/UploadModal"
import { v4 as uuidv4 } from 'uuid'
import { performExtraction } from '@/lib/extractionUtils'
import supabase from "@/lib/supabase/client";

const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[~`!@#$%^&*+=\[\]\\';,{}|":<>?]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase();
};

const transformKycFields = (fields: any[]): any[] => {
  if (!Array.isArray(fields)) return []
  return fields.map((field: any) => {
    const isArray = field.type === 'array' || field.isArray === true
    const fieldName = field.name || field.fieldName || '';
    const transformedField: any = {
      id: field.id || fieldName,  // Keep the ID for internal reference
      fieldName: fieldName,       // Use the name as the primary identifier
      name: fieldName,            // Ensure name is set for consistency
      description: field.description || '',
      isRequired: field.isRequired !== false,
      fieldType: isArray ? 'array' : (field.type || field.fieldType || 'text'),
      parentField: field.parentField,
      isArray: isArray,
    }
    if (isArray && field.arrayConfig && Array.isArray(field.arrayConfig.fields)) {
      transformedField.arrayConfig = {
        maxItems: field.arrayConfig.maxItems,
        fields: transformKycFields(field.arrayConfig.fields)
      }
    }
    return transformedField
  })
}

const processExtractedData = (data: any, fields: any[]): any => {
  if (!data || typeof data !== 'object') return data;
  
  // Create a new object to store the processed data
  const result: Record<string, any> = {};
  
  // First, handle all fields to ensure we process them in the correct order
  fields.forEach(field => {
    const fieldId = field.id;
    const fieldName = field.name || field.fieldName;
    
    if (!fieldName) return; // Skip if no valid field name
    
    // Check if the data exists with either ID or name as key
    const value = data[fieldId] !== undefined ? data[fieldId] : 
                 data[fieldName] !== undefined ? data[fieldName] : 
                 undefined;
    
    if (value !== undefined) {
      // Process nested objects and arrays
      if (field.isArray && Array.isArray(value)) {
        result[fieldName] = value.map((item: any) => {
          if (field.arrayConfig?.fields) {
            return processExtractedData(item, field.arrayConfig.fields);
          }
          return item;
        });
      } else if (typeof value === 'object' && value !== null) {
        result[fieldName] = processExtractedData(value, field.fields || []);
      } else {
        result[fieldName] = value;
      }
    }
  });
  
  // Copy any remaining fields that weren't in our field definitions
  Object.entries(data).forEach(([key, value]) => {
    // Skip if we've already processed this field
    if (!(key in result)) {
      // Only copy if it's not an ID-based key
      if (!fields.some(f => f.id === key)) {
        result[key] = value;
      }
    }
  });
  
  return result;
};

// Filter documents applicable to the current task context
const isDocumentApplicableToTask = (doc: any, task: any, childContext: any = null) => {
  if (!doc.isSpecial) return true;

  if (doc.targetEntities?.length > 0) {
    const matchesTarget = doc.targetEntities.some((entity: any) => {
      const classMatch = entity.class_id ? entity.class_id.toString() === task.class_id?.toString() : true;
      const subdeptMatch = entity.subdept_id ? entity.subdept_id.toString() === task.subdepartment?.id?.toString() : true;
      return classMatch && subdeptMatch;
    });
    if (!matchesTarget) return false;
    return true;
  }

  const taskClassId = task.class_id?.toString();
  const taskSubdeptId = task.subdepartment?.id?.toString();
  const docClassId = doc.class_id?.toString();
  const docSubdeptId = doc.subdept_id?.toString();

  if (docClassId) {
    if (docClassId !== taskClassId) return false;
    if (docSubdeptId && docSubdeptId !== taskSubdeptId) return false;
    return true;
  }

  if (docSubdeptId) {
    return docSubdeptId === taskSubdeptId;
  }

  if (childContext?.childLevelId && childContext?.childLevelType) {
    const { childLevelId, childLevelType } = childContext;
    if (doc[`${childLevelType}_id`] && doc[`${childLevelType}_id`].toString() !== childLevelId) {
      return false;
    }
    if (childLevelType === 'subclass' && doc.class_id && doc.class_id.toString() !== taskClassId) return false;
    if (childLevelType === 'class' && doc.subdept_id && doc.subdept_id.toString() !== taskSubdeptId) return false;
  }

  if (doc.entityType === 'class' && doc.class_id) {
    const classMatch = taskClassId === doc.class_id.toString();
    if (doc.subdept_id) return classMatch && (taskSubdeptId === doc.subdept_id.toString());
    return classMatch;
  }

  if (doc.entityType === 'subdept' && doc.subdept_id) {
    return taskSubdeptId === doc.subdept_id.toString();
  }

  return false;
}

// --- Sub-Component: Document Tab Panel ---
const DocumentTabPanel = ({
  doc,
  task,
  individualName,
  existingDocs = [],
  isLocked,
  linkedDocInstanceId,
  kycData,
  activeDocFields,
  isSourceDocSelected,
  onUploadSuccess,
  onPreviewExisting,
  onUseExistingLink
}) => {
  const [useExisting, setUseExisting] = useState(false);
  const [selectedExistingId, setSelectedExistingId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [generatedFile, setGeneratedFile] = useState<File | null>(null);

  // Sync with locked state
  useEffect(() => {
    if (isLocked && linkedDocInstanceId) {
      setUseExisting(true);
      setSelectedExistingId(linkedDocInstanceId);
    }
  }, [isLocked, linkedDocInstanceId]);

  const documentName = kycData?.display_name || kycData?.name || doc.name || 'Document';
  const inputType = doc.inputType || (doc.isSpecial ? 'file' : 'both');

  // Convert Text to PDF and pass to UploadModal
  const handleConvertAndUpload = async () => {
    if (!messageText.trim()) return;
    setIsConverting(true);

    try {
      // Convert text to PDF
      const response = await fetch('/api/convert-message-to-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: messageText, 
          documentType: documentName 
        })
      });

      if (!response.ok) throw new Error('Failed to convert text to PDF');
      
      const blob = await response.blob();
      const fileName = `${documentName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
      const file = new File([blob], fileName, { type: 'application/pdf' });
      
      // Set the generated file - UploadModal will handle extraction and preview
      setGeneratedFile(file);
      
      toast({
        title: 'Success',
        description: 'PDF generated successfully. Review the document below.',
      });
    } catch (error) {
      console.error('Conversion error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to convert text to PDF',
        variant: 'destructive',
      });
    } finally {
      setIsConverting(false);
    }
  };

  const handlePendingChange = useCallback((docs: any[]) => {
    console.log('[DocumentTabPanel] handlePendingChange called:', docs);
    if (docs && docs.length > 0) {
      const activeDoc = docs[0];
      console.log('[DocumentTabPanel] Active doc:', activeDoc);
      
      if (activeDoc.file) {
        const payload = {
          file: activeDoc.file,
          extractedData: activeDoc.extractedData || {},
          kycId: doc.kycId,
          name: doc.name
        };
        console.log('[DocumentTabPanel] Calling onUploadSuccess with payload:', payload);
        onUploadSuccess(payload, doc);
      }
    }
  }, [doc, onUploadSuccess]);

  return (
    <div className="space-y-4 p-4 rounded-lg border h-full overflow-y-auto">
      {/* Existing Documents Section */}
      {(existingDocs.length > 0 || isLocked) && (
        <div className={`mb-4 p-4 rounded-lg border ${isLocked ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
          <div className="flex-1">
            <h4 className={`text-sm font-medium mb-2 ${isLocked ? 'text-green-900' : 'text-blue-900'}`}>
              {isLocked ? "Linked Source Document" : `Existing Documents (${existingDocs.length})`}
            </h4>

            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id={`use-existing-${doc.id}`}
                checked={useExisting}
                onChange={(e) => !isLocked && setUseExisting(e.target.checked)}
                disabled={isLocked}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <Label htmlFor={`use-existing-${doc.id}`} className={`text-sm font-medium ${isLocked ? 'text-green-800' : 'text-blue-800'}`}>
                {isLocked ? "This document is linked as the source" : "Use existing document"}
              </Label>
            </div>

            {useExisting && (
              <div className="ml-6 space-y-2">
                <RadioGroup value={selectedExistingId} onValueChange={(val) => !isLocked && setSelectedExistingId(val)}>
                  {existingDocs.map((ed) => {
                    const isSelected = selectedExistingId === ed.id;
                    const fileName = ed.file_path?.split('/').pop() || documentName;
                    return (
                      <div key={ed.id} className={`flex items-center gap-3 p-2 border rounded transition-colors ${isSelected ? 'bg-blue-50 border-blue-200' : 'hover:bg-slate-50'}`}>
                        <RadioGroupItem
                          value={ed.id}
                          id={ed.id}
                          disabled={isLocked}
                          className={`${isLocked ? 'opacity-50' : ''}`}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={ed.id} className="text-sm cursor-pointer">{fileName}</Label>
                            {isSourceDocSelected(ed.id) && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                Source
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{format(parseISO(ed.created_at), 'dd MMM yyyy')}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-500 hover:text-gray-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPreviewExisting(ed, kycData);
                          }}
                          type="button"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </RadioGroup>

                {!isLocked && selectedExistingId && (
                  <Button
                    onClick={() => onUseExistingLink(doc.id, selectedExistingId, doc.kycId)}
                    className="ml-6 mt-2"
                    size="sm"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Use Selected
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Upload / Message Section */}
      {isLocked ? (
        <div className="text-center p-6 bg-slate-50 border-dashed border-2 border-slate-200 rounded-lg">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40 text-slate-500" />
          <p className="font-medium text-slate-700">Stage Locked</p>
        </div>
      ) : !useExisting && (
        <>
          {/* File Upload Component - Receives generated file if available */}
          {activeDocFields ? (
            <UploadModal
              documentName={documentName}
              documentFields={activeDocFields}
              selectedDoc={{ id: doc.kycId, name: documentName, display_name: documentName, fields: activeDocFields }}
              selectedMember={{ id: task?.individual_id, name: individualName, full_name: individualName }}
              entityId={task?.individual_id}
              entityName={individualName}
              onSuccess={(newDoc) => {
                onUploadSuccess(newDoc, doc);
                setGeneratedFile(null); // Clear generated file after success
                setMessageText(""); // Clear text
              }}
              targetTable="acc_portal_directors_documents"
              idFieldName="director_id"
              documentIdFieldName="document_id"
              isCompanyUpload={false}
              additionalFields={{ expiry_date: null }}
              hideSaveButton={true}
              onPendingChange={handlePendingChange}
              
              // Pass generated file to trigger modal logic
              externalFile={generatedFile}
              onExternalFileClear={() => setGeneratedFile(null)}
              
              onBeforeUpload={async (recordData) => {
                if (doc.onBeforeUpload) return doc.onBeforeUpload(recordData);
                return null;
              }}
            />
          ) : (
            <div className="flex justify-center p-10 text-muted-foreground">Initializing fields...</div>
          )}

          {/* Text Input Section */}
          {(inputType === 'message' || inputType === 'both') && (
            <div className="mt-6 pt-6 border-t space-y-4">
              <Label className="font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Write Message & Convert to PDF
              </Label>
              
              <Textarea
                placeholder={`Type your message here...`}
                className="min-h-[120px] resize-none font-mono text-sm"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />

              <div className="flex gap-2">
                <Button 
                  onClick={handleConvertAndUpload} 
                  disabled={!messageText.trim() || isConverting} 
                  variant="outline" 
                  className="w-full border-dashed border-2 hover:bg-slate-50"
                >
                  {isConverting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  {isConverting ? 'Generating PDF...' : 'Convert to PDF & Review'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                This will convert your text into a PDF and open the document preview for final verification.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export function StageUploadDialog({
  open,
  onOpenChange,
  selectedStageTask,
  onTaskAction,
  onStageCompleted
}: any) {
  // State
  const [activeDocumentTab, setActiveDocumentTab] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [kycDocuments, setKycDocuments] = useState<Map<string, any>>(new Map());
  const [existingDocuments, setExistingDocuments] = useState<Record<string, any[]>>({});
  const [docFieldsMap, setDocFieldsMap] = useState<Record<string, any[]>>({});
  const [lockedDocuments, setLockedDocuments] = useState<Record<string, boolean>>({});
  const [linkedDocuments, setLinkedDocuments] = useState<Record<string, any>>({});
  const [pendingDocuments, setPendingDocuments] = useState<Record<string, any>>({});
  const [selectedSourceDocs, setSelectedSourceDocs] = useState<Record<string, any[]>>({ selected: [] });
  const [previewState, setPreviewState] = useState({
    isOpen: false,
    loading: false,
    data: null as any
  });

  const { task, stage } = selectedStageTask || {};

  // Initialize Source Docs
  useEffect(() => {
    if (open && task?.source_document_id) {
      setSelectedSourceDocs(prev => ({
        ...prev,
        ...(typeof task.source_document_id === 'object' ? task.source_document_id : {})
      }));
    }
  }, [open, task?.source_document_id]);

  const isDocSelectedAsSource = useCallback((docId: string) => {
    return Boolean(selectedSourceDocs[stage?.id || '']?.some(doc => doc.id === docId));
  }, [selectedSourceDocs, stage?.id]);

  const isDocumentLocked = useCallback((docId: string) => {
    return Boolean(lockedDocuments[docId]);
  }, [lockedDocuments]);

  // Determine which documents apply to this specific task
  const applicableDocuments = useMemo(() => {
    if (!stage?.documents || !task) return [];
    const childContext = {
      childLevelId: selectedStageTask.childLevelId,
      childLevelType: selectedStageTask.childLevelType
    };
    return stage.documents.filter((doc: any) => isDocumentApplicableToTask(doc, task, childContext));
  }, [stage, task, selectedStageTask?.childLevelId]);

  const individualName = useMemo(() =>
    task?.applicant_name || task?.principal_member_name || 'Individual',
    [task]);

  // Set initial tab
  useEffect(() => {
    if (open && applicableDocuments.length > 0 && !activeDocumentTab) {
      const firstDocId = applicableDocuments[0]?.id;
      if (firstDocId) {
        setActiveDocumentTab(firstDocId);
      }
    }
  }, [open, applicableDocuments.length]);

  // Clean up
  useEffect(() => {
    if (!open) {
      // Reset states when dialog closes
      const resetStates = () => {
        setActiveDocumentTab('');
        setPreviewState({ isOpen: false, data: null, loading: false });
        setPendingDocuments({});
      };

      // Use requestAnimationFrame to batch state updates
      requestAnimationFrame(() => {
        resetStates();
      });
    }
  }, [open]);

  // --- Optimized Data Fetching ---
  // Fetches ALL necessary data for the stage in parallel when dialog opens
  useEffect(() => {
    if (!open || !stage?.documents || !task?.individual_id) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 1. Identify all KYC IDs required by applicable documents
        const uniqueKycIds = [...new Set(applicableDocuments
          .map((d: any) => d.kycId)
          .filter(Boolean))];

        // 2. Prepare parallel fetches
        const promises: Promise<any>[] = [];

        // Fetch KYC Definitions
        if (uniqueKycIds.length > 0) {
          promises.push(
            supabase
              .from('acc_portal_kyc')
              .select('id, fields, name, display_name, document_type')
              .in('id', uniqueKycIds)
          );
        } else {
          promises.push(Promise.resolve({ data: [] }));
        }

        // Fetch Existing User Documents
        promises.push(
          supabase
            .from('acc_portal_directors_documents')
            .select('*')
            .eq('director_id', task.individual_id)
            .order('created_at', { ascending: false })
        );

        // Execute fetches
        const [kycRes, userDocsRes] = await Promise.all(promises);

        // 3. Process KYC Definitions & Fields
        const newKycMap = new Map();
        const newDocFieldsMap: Record<string, any[]> = {};

        // Process fetched KYC data
        if (kycRes.data) {
          kycRes.data.forEach((kycData: any) => {
            const transformed = { ...kycData, fields: transformKycFields(kycData.fields || []) };
            newKycMap.set(kycData.id, transformed);
          });
        }

        // Map fields to stage document IDs
        applicableDocuments.forEach((doc: any) => {
          let fields = [];
          if (doc.kycId && newKycMap.has(doc.kycId)) {
            const kycDoc = newKycMap.get(doc.kycId);
            if (kycDoc.fields) {
              fields = kycDoc.fields.map((field: any) => ({
                id: field.id || field.fieldName,
                name: field.fieldName,
                type: field.fieldType,
                required: field.isRequired,
                description: field.description,
                isArray: field.isArray,
                arrayConfig: field.arrayConfig
              }));
            }
          } else if (doc.extractionSpecs) {
            // Fallback to extractionSpecs if no KYC ID
            fields = doc.extractionSpecs.map((spec: any) => ({
              id: spec.id || spec.fieldName || `field-${Date.now()}`,
              name: spec.fieldName || spec.name || 'Field',
              type: spec.fieldType || 'text',
              required: spec.required || false,
              isArray: spec.isArray || false
            }));
          }
          newDocFieldsMap[doc.id] = fields;
        });

        // 4. Process Existing Documents
        const groupedDocs: Record<string, any[]> = {};
        if (userDocsRes.data) {
          applicableDocuments.forEach((stageDoc: any) => {
            if (stageDoc.kycId) {
              const matching = userDocsRes.data.filter((d: any) => d.document_id === stageDoc.kycId);
              if (matching.length > 0) groupedDocs[stageDoc.id] = matching;
            }
          });
        }

        setKycDocuments(newKycMap);
        setDocFieldsMap(newDocFieldsMap);
        setExistingDocuments(groupedDocs);

      } catch (error) {
        console.error("Error initializing stage upload dialog:", error);
        toast({ title: "Error loading data", description: "Please close and try again.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [open, stage?.documents, task?.individual_id, applicableDocuments]);

  // Check for locked documents
  useEffect(() => {
    if (!stage?.id || !applicableDocuments.length || !task?.id) return;

    const checkLockedDocuments = async () => {
      const { data: taskData } = await supabase
        .from('tm_tasks')
        .select('source_document_id')
        .eq('id', task.id)
        .single();

      if (taskData?.source_document_id) {
        const newLockedDocs = { ...lockedDocuments };
        const newLinkedDocs = { ...linkedDocuments };

        applicableDocuments.forEach((doc: any) => {
          const docInstance = taskData.source_document_id[stage.id]?.find(
            (d: any) => d.document_id === doc.kycId
          );

          if (docInstance) {
            newLockedDocs[doc.id] = true;
            newLinkedDocs[doc.id] = docInstance;
          } else {
            newLockedDocs[doc.id] = false;
          }
        });

        setLockedDocuments(newLockedDocs);
        setLinkedDocuments(newLinkedDocs);
      }
    };

    checkLockedDocuments();
  }, [stage?.id, task?.id, JSON.stringify(applicableDocuments)]);

  const handleDocumentSelection = useCallback((docId: string, docInstanceId: string, kycId: string) => {
    if (!stage?.id || !task?.id) return;

    const currentDate = new Date().toISOString();
    const docToAdd = {
      id: docInstanceId,
      document_id: kycId,
      linked_at: currentDate,
      updated_at: currentDate
    };

    // Update pending documents state
    setPendingDocuments(prev => ({
      ...prev,
      [docId]: docToAdd
    }));
  }, [stage?.id, task?.id]);

const saveAllDocuments = useCallback(async () => {
    if (!stage?.id || !task?.id) {
      toast({ title: 'Error', description: 'Missing stage or task information', variant: 'destructive' });
      return;
    }
    setIsSaving(true);

    try {
      const currentDate = new Date().toISOString();
      const updatedLinkedDocs = { ...linkedDocuments };
      const updatedLockedDocs = { ...lockedDocuments };
      const updatedSourceDocs = { ...selectedSourceDocs };
      const uploadedDocIds = new Set<string>();

      // --- 1. Process all pending documents (Upload & Link) ---
      for (const [docId, docData] of Object.entries(pendingDocuments)) {
        if (!docData) continue;

        console.log(`[saveAllDocuments] Processing doc ${docId}:`, docData);

        const docConfig = applicableDocuments.find(doc => doc.id === docId);
        if (!docConfig) {
          console.warn(`Document config not found for ID: ${docId}`);
          continue;
        }

        try {
          const file = docData.file;
          let filePath = '';
          let documentId = docData.id || '';

          if (file) {
            const sanitizedFilename = sanitizeFilename(file.name);
            filePath = `individual-documents/${task.individual_id}/${docConfig.kycId}/${sanitizedFilename}`;

            const { error: uploadError } = await supabase.storage
              .from('kyc-documents')
              .upload(filePath, file, {
                cacheControl: '3600',
                upsert: true,
                contentType: file.type || 'application/octet-stream'
              });

            if (uploadError) throw uploadError;
          } else {  
             filePath = docData.file_path || '';
          }

          let insertedDoc;
          if (file) {
            
            // Clean up extracted data logic
            const rawDetails = docData.extractedData || {};
            console.log(`[saveAllDocuments] Raw extracted details for ${docId}:`, rawDetails);
            
            const cleanedDetails = {};
            
            // Build map of ID -> Name to resolve UUID keys
            const fieldIdToName = new Map();
            const validFieldNames = new Set();
            
            const collectFieldInfo = (fields) => {
              if (!Array.isArray(fields)) return;
              fields.forEach(field => {
                if (field.id && field.name) fieldIdToName.set(field.id, field.name);
                if (field.name) validFieldNames.add(field.name);
                
                if (field.fields) collectFieldInfo(field.fields);
                if (field.arrayConfig?.fields) collectFieldInfo(field.arrayConfig.fields);
              });
            };

            // FIX: Use docFieldsMap instead of docConfig.fields to ensure we have the full field definitions
            const fullDocFields = docFieldsMap[docId];
            if (fullDocFields) {
               collectFieldInfo(fullDocFields);
            }
            
            // Map the data
            Object.entries(rawDetails).forEach(([key, value]) => {
              // Case 1: Key is a UUID that maps to a Field Name
              if (fieldIdToName.has(key)) {
                cleanedDetails[fieldIdToName.get(key)] = value;
              }
              // Case 2: Key is already a valid Field Name
              else if (validFieldNames.has(key)) {
                cleanedDetails[key] = value;
              }
              // Case 3: Key is not a UUID (allow custom metadata fields or non-config fields)
              else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
                cleanedDetails[key] = value;
              }
            });
            
            console.log(`[saveAllDocuments] Cleaned details for ${docId}:`, cleanedDetails);

            const { data: newDoc, error: insertError } = await supabase
              .from('acc_portal_directors_documents')
              .insert([{
                director_id: task.individual_id,
                document_id: docConfig.kycId,
                extracted_details: cleanedDetails,
                status: 'active',
                file_path: filePath,
                created_at: currentDate,
                updated_at: currentDate
              }])
              .select()
              .single();

            if (insertError) throw insertError;
            insertedDoc = newDoc;
            documentId = newDoc.id;
          } else if (docData.id) {
            insertedDoc = { id: docData.id };
            documentId = docData.id;
          }

          updatedLinkedDocs[docId] = {
            id: documentId,
            document_id: docConfig.kycId,
            linked_at: docData.linked_at || currentDate,
            updated_at: currentDate
          };
          updatedLockedDocs[docId] = true;
          uploadedDocIds.add(docId);

          if (!updatedSourceDocs[stage.id]) {
            updatedSourceDocs[stage.id] = [];
          }
          updatedSourceDocs[stage.id] = [
            ...(updatedSourceDocs[stage.id]?.filter((d: any) => d.document_id !== docConfig.kycId) || []),
            {
              id: insertedDoc.id,
              document_id: docConfig.kycId,
              linked_at: currentDate,
              status: 'uploaded',
              linked_document_id: insertedDoc.id,
            }
          ];

        } catch (error) {
          console.error(`Error processing document ${docId}:`, error);
          continue; 
        }
      }

      const STATUS_PRIORITY: Record<string, number> = {
        'pending': 0, 'new': 0, 'enquiry': 0,
        'in_progress': 1,
        'write_up_completed': 2,
        'endorsed': 3
      };

      // Map Stage IDs to Target Statuses
      const STAGE_STATUS_MAPPING: Record<string, string> = {
        'a19b270e-6d1e-4e6d-b2bc-f21db72cde08': 'in_progress',
        '072b9710-45df-4a05-ba65-01b4ef29d61d': 'write_up_completed',
        '6625f6d2-8017-4bf4-96c2-85335703164c': 'endorsed',
        'caefd742-5de5-4341-a3bb-81d7b9dd2b73': 'endorsed'
      };

      const normalizeStatus = (s: string | null | undefined) => {
        if (!s) return 'pending';
        return s.toLowerCase().trim().replace(/[\s-]/g, '_');
      };

      const currentStatusRaw = task.status;
      const currentStatusKey = normalizeStatus(currentStatusRaw);
      const potentialNewStatus = STAGE_STATUS_MAPPING[stage.id];

      let taskStatusUpdate = {};

      if (potentialNewStatus) {
        const currentPriority = STATUS_PRIORITY[currentStatusKey] ?? 0;
        const newPriority = STATUS_PRIORITY[potentialNewStatus] ?? 0;

        console.log('📊 Status Priority Check:', {
          current: { key: currentStatusKey, priority: currentPriority },
          new: { key: potentialNewStatus, priority: newPriority }
        });

        // Only update if new priority is strictly greater
        if (newPriority > currentPriority) {
          taskStatusUpdate = { status: potentialNewStatus };
          console.log(`✅ Applying Status Update: ${potentialNewStatus}`);
        } else {
          console.log(`ℹ️ Skipping Status Update: ${newPriority} <= ${currentPriority}`);
        }
      }

      // --- 3. Prepare Stages JSON ---
      const updatedStages = {
        ...task.stages,
        [stage.id]: {
          ...task.stages?.[stage.id],
          status: 'completed',
          date: currentDate.split('T')[0],
          completedAt: currentDate,
          documentsUploaded: Object.keys(updatedLinkedDocs).length,
          lastUpdated: currentDate,
          documents: {
            ...(task.stages?.[stage.id]?.documents || {}),
            ...Object.fromEntries(
              Array.from(uploadedDocIds).map(docId => {
                const docConfig = applicableDocuments.find(doc => doc.id === docId);
                return [docId, {
                  id: updatedLinkedDocs[docId]?.id,
                  document_id: docConfig?.kycId,
                  name: docConfig?.name || 'document',
                  linked_at: currentDate,
                  status: 'linked'
                }];
              })
            )
          }
        }
      };

      // --- 4. Execute DB Update ---
      const updateData = {
        ...taskStatusUpdate, // Includes 'status' only if priority check passed
        stages: updatedStages,
        source_document_id: updatedSourceDocs,
        updated_at: currentDate
      };

      console.log('🚀 Sending Payload:', updateData);

      const { error: updateError } = await supabase
        .from('tm_tasks')
        .update(updateData)
        .eq('id', task.id);

      if (updateError) throw updateError;

      // Show success message
      const successMsg = ('status' in taskStatusUpdate) 
        ? `Documents saved & Status updated to ${taskStatusUpdate.status}`
        : `Successfully uploaded ${uploadedDocIds.size} document(s)`;

      toast({
        title: 'Success',
        description: successMsg,
        variant: 'default'
      });

      // Refresh task data
      onTaskAction?.({ type: 'refresh', taskId: task.id });
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving documents:', error);
      toast({
        title: 'Error',
        description: 'Failed to save documents. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
      console.groupEnd();
    }
  }, [stage, task, pendingDocuments, linkedDocuments, selectedSourceDocs, onTaskAction, onOpenChange, applicableDocuments, lockedDocuments, docFieldsMap]);
  
  const handleUploadSuccess = useCallback((newDocument: any, originatingDoc: any) => {
    console.log('[StageUploadDialog] handleUploadSuccess called:', { newDocument, originatingDoc });
    
    if (!originatingDoc?.id) {
      console.warn('[StageUploadDialog] No originating doc ID');
      return;
    }

    setPendingDocuments(prev => {
      // Only update if the document is new or changed
      const existingDoc = prev[originatingDoc.id];
      
      const newPendingDoc = {
        ...newDocument,
        kycId: originatingDoc.kycId,
        name: originatingDoc.name
      };
      
      console.log('[StageUploadDialog] Updating pending doc:', {
        docId: originatingDoc.id,
        existingDoc,
        newPendingDoc,
        extractedData: newDocument.extractedData
      });
      
      if (existingDoc && JSON.stringify(existingDoc) === JSON.stringify(newPendingDoc)) {
        console.log('[StageUploadDialog] No change needed');
        return prev; // No change needed
      }

      return {
        ...prev,
        [originatingDoc.id]: newPendingDoc
      };
    });
  }, []);

  const handleUseExisting = useCallback((docConfigId: string, existingDocId: string, kycId: string) => {
    handleDocumentSelection(docConfigId, existingDocId, kycId);
  }, [handleDocumentSelection]);

  const handlePreview = useCallback(async (document: any, kycData: any) => {
    if (!kycData) return;
    setPreviewState(prev => ({ ...prev, isOpen: true, loading: true }));
    try {
      const bucketName = 'kyc-documents';
      const filePath = document.file_path?.startsWith(bucketName) ? document.file_path : `${bucketName}/${document.file_path}`;
      const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
      const fileName = document.file_path?.split('/').pop() || kycData.name;
      const fields = transformKycFields(kycData.fields || []);
      const processedData = processExtractedData(document.extracted_details || {}, fields);

      setPreviewState({
        isOpen: true,
        loading: false,
        data: {
          documentId: document.id,
          documentName: kycData.display_name || kycData.name,
          fileUrl,
          fileName,
          extractedData: processedData,
          fields,
          type: kycData.document_type || 'document',
          file: { name: fileName, url: fileUrl, type: fileName.split('.').pop() }
        }
      });
    } catch (error) {
      console.error('Preview error', error);
      toast({ title: "Error", description: "Failed to load preview", variant: "destructive" });
      setPreviewState(prev => ({ ...prev, isOpen: false, loading: false }));
    }
  }, []);

  if (!selectedStageTask) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[1800px] max-h-[95vh] flex flex-col p-0 gap-0">
          <div className="p-6 border-b flex justify-between items-center">
            <div className="flex-1">
              <DialogHeader>
                <DialogTitle className="flex justify-between">
                  <h2>Upload {stage?.name} for {individualName}</h2>
                  <div>
                    {applicableDocuments.some((doc: any) => doc.isSpecial) && (
                      <div className="p-2 flex gap-3">
                        <Star className="h-5 w-5 text-amber-600 flex-shrink-0" />
                        <p className="text-sm text-amber-700">
                          Special requirements apply to some documents
                        </p>
                      </div>
                    )}
                  </div>
                </DialogTitle>
                <DialogDescription>
                  Upload required documents or select existing ones to complete this stage.
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="flex items-center gap-2">
              {Object.keys(pendingDocuments).length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {Object.keys(pendingDocuments).length} document(s) pending save
                </span>
              )}
              <Button
                disabled={Object.keys(pendingDocuments).length === 0 || isSaving}
                onClick={saveAllDocuments}
                className="ml-4"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  `Save All (${Object.keys(pendingDocuments).length})`
                )}
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            <Tabs value={activeDocumentTab} onValueChange={setActiveDocumentTab} className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 pt-2 border-b bg-muted/10">
                <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-transparent gap-2">
                  {applicableDocuments.map((doc: any) => {
                    const kycDoc = kycDocuments.get(doc.kycId);
                    const displayName = kycDoc?.display_name || doc.name || 'Document';
                    return (
                      <TabsTrigger
                        key={doc.id}
                        value={doc.id}
                        className="relative px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-border"
                      >
                        {displayName}
                        {isDocumentLocked(doc.id) && (
                          <Check className="h-4 w-4 ml-2 text-green-600" />
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              <div className="flex-1 overflow-auto relative bg-slate-50/50">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  applicableDocuments.map((doc: any) => (
                    <div
                      key={doc.id}
                      className={`h-full overflow-y-auto p-6 ${activeDocumentTab === doc.id ? 'block' : 'hidden'}`}
                    >
                      <DocumentTabPanel
                        doc={doc}
                        task={task}
                        individualName={individualName}
                        existingDocs={existingDocuments[doc.id] || []}
                        isLocked={isDocumentLocked(doc.id)}
                        linkedDocInstanceId={isDocumentLocked(doc.id) ? linkedDocuments[doc.id]?.id : null}
                        kycData={doc.kycId ? kycDocuments.get(doc.kycId) : null}
                        activeDocFields={docFieldsMap[doc.id]}
                        isSourceDocSelected={isDocSelectedAsSource}
                        onUploadSuccess={(newDoc) => handleUploadSuccess(newDoc, doc)}
                        onPreviewExisting={handlePreview}
                        onUseExistingLink={handleUseExisting}
                        hideSaveButton={true}
                      />
                    </div>
                  ))
                )}
              </div>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={previewState.isOpen} onOpenChange={(v) => setPreviewState(p => ({ ...p, isOpen: v }))}>
        <DialogContent className="max-w-[1800px] max-h-[95vh] overflow-y-auto">
          {previewState.loading ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin h-10 w-10" /></div>
          ) : previewState.data ? (
            <ExtractionPreview
              {...previewState.data}
              expanded={true}
              showSaveButton={false}
              fieldsPromise={Promise.resolve(previewState.data.fields)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}