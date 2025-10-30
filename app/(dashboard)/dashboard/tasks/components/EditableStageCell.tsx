// @ts-nocheck
"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Upload, Calendar, Check, X, Clock, CheckCircle, FileText, Eye, AlertTriangle, Zap, Loader2, Pencil } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { format, parse, isValid } from "date-fns"
import { AutomationMappingDialog } from "./AutomationMappingDialog"
import { ExtractionPreview } from "@/components/ExtractionPreview"

interface EditableStageCellProps {
  stage: any
  task: any
  value?: string | null
  onSave?: (
    stageId: string,
    taskId: string,
    value: string,
    updatedExtractedDetails?: Record<string, any>
  ) => Promise<void> | void
  onDocumentUpload?: (task: any, stage: any) => void
  onShowDocuments?: (task: any, stage: any) => void
  getKycFields?: (documentConfig: any) => Promise<any[]>
  allDocuments?: any[]
  isDocumentRow?: boolean
  documentData?: any
  onAutomationClick?: (e: React.MouseEvent, documentData?: any) => void
  departments?: any[]
}

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

// Helper function to get LINKED document for a stage
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

// Helper function to check if a document is applicable to the current task
const isDocumentApplicable = (doc: any, task: any): boolean => {
  if (!doc.isSpecial) return true;

  if (doc.targetEntities && Array.isArray(doc.targetEntities) && doc.targetEntities.length > 0) {
    return doc.targetEntities.some((entity: any) => {
      const classMatch = entity.class_id ? entity.class_id.toString() === task.class_id?.toString() : true;
      const subdeptMatch = entity.subdept_id ? entity.subdept_id.toString() === task.subdepartment?.id?.toString() : true;
      return classMatch && subdeptMatch;
    });
  }

  const taskClassId = task.class_id?.toString();
  const taskSubdeptId = task.subdepartment?.id?.toString();

  if (doc.entityType === 'class' && doc.class_id) {
    const classMatch = taskClassId === doc.class_id.toString();
    if (doc.subdept_id) {
      return classMatch && taskSubdeptId === doc.subdept_id.toString();
    }
    return classMatch;
  }

  if (doc.entityType === 'subdept' && doc.subdept_id) {
    return taskSubdeptId === doc.subdept_id?.toString();
  }

  if (doc.entityType === 'subclass' && doc.subclass_id && doc.class_id && doc.subdept_id) {
    return (
      taskSubdeptId === doc.subdept_id?.toString() &&
      taskClassId === doc.class_id?.toString() &&
      task.subclass_id?.toString() === doc.subclass_id?.toString()
    );
  }

  if (doc.class_id && doc.subdept_id) {
    return (
      taskSubdeptId === doc.subdept_id?.toString() &&
      taskClassId === doc.class_id?.toString()
    );
  }

  if (doc.subdept_id && !doc.class_id) {
    return taskSubdeptId === doc.subdept_id?.toString();
  }

  return false;
};

// [FIX 1] Replaced the complex and buggy applicability function with a correct and robust version.
const isStageApplicableToTask = (stage: any, task: any, departments: any[] = []): boolean => {
  try {
    // Default to true (applicable) if data required for the check is missing.
    if (!task || !stage || !departments || departments.length === 0) {
      return true;
    }

    const dept = departments.find(d => d?.id === task.department?.id || d?.id === task.department_id);
    if (!dept) return true;

    const subdept = dept.tm_subdepartments?.find((s: any) =>
      s?.id === task.subdepartment?.id || s?.id === task.subdepartment_id
    );
    if (!subdept) return true;

    // Check for an override at the class level first (most specific)
    if (task.class_id) {
      const cls = subdept.classes?.find((c: any) =>
        c?.id?.toString() === task.class_id?.toString()
      );
      if (cls) {
        const classStage = cls.stages?.find((s: any) => s.stage_id === stage.id);
        if (classStage && typeof classStage.applicable === 'boolean') {
          return classStage.applicable; // Return the explicit class-level setting
        }
      }
    }

    // If no class-level override, check the subdepartment level
    const subdeptStage = subdept.stages?.find((s: any) => s.stage_id === stage.id);
    if (subdeptStage && typeof subdeptStage.applicable === 'boolean') {
      return subdeptStage.applicable; // Return the explicit subdepartment-level setting
    }

    // If no specific override is found, the stage is applicable by default.
    return true;
  } catch (error) {
    console.error('Error in isStageApplicableToTask:', error);
    return true; // Default to applicable on error to avoid hiding UI elements.
  }
};

export default function EditableStageCell({
  stage,
  task,
  value,
  onSave,
  onDocumentUpload,
  onShowDocuments,
  getKycFields,
  allDocuments = [],
  isDocumentRow = false,
  documentData = null,
  onAutomationClick,
  departments
}: EditableStageCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [isLoading, setIsLoading] = useState(false);
  const [hasLinkedDocument, setHasLinkedDocument] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [stageDate, setStageDate] = useState('');
  const [kycDocumentData, setKycDocumentData] = useState<any>(null);
  const [isOldDocument, setIsOldDocument] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requiresUpload = stage.documents && stage.documents.length > 0;

  // Enhanced function to fetch KYC document data with fields
  const fetchKycDocumentData = useCallback(async (kycId: string) => {
    try {
      const { data, error } = await supabase
        .from('acc_portal_kyc')
        .select('id, fields, name, display_name, document_type')
        .eq('id', kycId)
        .single();

      if (error) throw error;

      console.log('Fetched KYC document data:', data);
      setKycDocumentData(data);
      return data;
    } catch (error) {
      console.error('Error fetching KYC document:', error);
      return null;
    }
  }, []);

  // Enhanced function to transform KYC fields to ExtractionPreview format
  const transformKycFieldsToPreviewFormat = useCallback((kycFields: any[]): any[] => {
    if (!Array.isArray(kycFields)) return [];

    return kycFields.map((field: any) => {
      const isArray = field.type === 'array' || field.isArray === true;

      const transformedField: any = {
        id: field.id || field.fieldName || field.name,
        name: field.fieldName || field.name || field.id,
        type: isArray ? 'array' : (field.fieldType || field.type || 'text'),
        isArray: isArray,
        required: field.isRequired !== false,
        description: field.description || ''
      };

      if (isArray && field.arrayConfig && Array.isArray(field.arrayConfig.fields)) {
        transformedField.arrayConfig = {
          maxItems: field.arrayConfig.maxItems || 10,
          fields: field.arrayConfig.fields.map((subField: any) => ({
            id: subField.id || subField.fieldName || subField.name,
            name: subField.fieldName || subField.name || subField.id,
            type: subField.fieldType || subField.type || 'text',
            required: subField.isRequired !== false
          }))
        };
      }

      return transformedField;
    });
  }, []);

  const buildPreviewDocumentData = useCallback(async () => {
    console.log('🔍 Building preview data for:', {
      stageName: stage.name,
      stageId: stage.id,
      isDocumentRow,
      documentData: documentData ? {
        id: documentData.id,
        name: documentData.name,
        display_name: documentData.display_name,
        kycId: documentData.kycId
      } : null,
      taskId: task.id,
      applicantName: task.applicant_name
    });

    let documentsToProcess = [];
    let targetDocumentKycIds = [];

    if (isDocumentRow && documentData) {
      // For document rows, process only the specific document
      console.log('📄 Document row mode - processing specific document:', {
        documentDataKycId: documentData.kycId,
        documentName: documentData.name || documentData.display_name
      });

      const singleDocStage = {
        ...stage,
        documents: [documentData]
      };

      const linkedDoc = getLinkedDocumentForStage(task, singleDocStage, allDocuments);

      if (linkedDoc && linkedDoc.document_id === documentData.kycId) {
        documentsToProcess = [{ linkedDoc, documentConfig: documentData }];
        targetDocumentKycIds = [documentData.kycId];
      } else {
        // Try to find the correct document for this specific document type
        const correctDoc = allDocuments.find(doc =>
          doc.director_id === task.individual_id &&
          doc.document_id === documentData.kycId
        );

        if (correctDoc) {
          documentsToProcess = [{ linkedDoc: correctDoc, documentConfig: documentData }];
          targetDocumentKycIds = [documentData.kycId];
        }
      }
    } else {
      // For stage rows, process ALL applicable documents for the stage
      console.log('🏗️ Stage row mode - processing all stage documents');

      if (!stage?.documents?.length) {
        console.log('❌ No documents configured for stage');
        toast({
          title: 'No Documents',
          description: 'No documents configured for this stage.',
          variant: 'default',
        });
        return null;
      }

      // Get all applicable documents for this stage and task
      const applicableDocuments = stage.documents.filter((doc: any) => {
        const isApplicable = !doc.targetEntities?.length ||
          doc.targetEntities.some((entity: any) => {
            const classMatch = entity.class_id ? entity.class_id.toString() === task.class_id?.toString() : true;
            const subdeptMatch = entity.subdept_id ? entity.subdept_id.toString() === task.subdepartment?.id?.toString() : true;
            return classMatch && subdeptMatch;
          });

        console.log('📋 Document applicability check:', {
          docName: doc.name || doc.display_name,
          docKycId: doc.kycId,
          isApplicable,
          taskClassId: task.class_id,
          taskSubdeptId: task.subdepartment?.id
        });

        return isApplicable;
      });

      console.log(`📚 Found ${applicableDocuments.length} applicable documents for stage`);

      // Find ALL linked documents for each applicable document type
      for (const docConfig of applicableDocuments) {
        console.log('🔍 Processing document config:', {
          docConfigName: docConfig.name || docConfig.display_name,
          docConfigKycId: docConfig.kycId
        });

        // Method 1: Try to find using the stage-based linking system
        const singleDocStage = {
          ...stage,
          documents: [docConfig]
        };

        const linkedDoc = getLinkedDocumentForStage(task, singleDocStage, allDocuments);

        console.log('🔗 Checking linked document for:', {
          docConfigName: docConfig.name || docConfig.display_name,
          docConfigKycId: docConfig.kycId,
          linkedDocId: linkedDoc?.id,
          linkedDocKycId: linkedDoc?.document_id,
          matches: linkedDoc?.document_id === docConfig.kycId
        });

        if (linkedDoc && linkedDoc.document_id === docConfig.kycId) {
          // Found matching linked document via stage linking
          documentsToProcess.push({ linkedDoc, documentConfig: docConfig });
          targetDocumentKycIds.push(docConfig.kycId);
          console.log('✅ Added linked document via stage linking:', {
            docName: docConfig.name || docConfig.display_name,
            linkedDocId: linkedDoc.id
          });
        } else {
          // Method 2: Try to find document directly by individual_id and document_id
          const directLinkedDoc = allDocuments.find(doc =>
            doc.director_id === task.individual_id &&
            doc.document_id === docConfig.kycId
          );

          if (directLinkedDoc) {
            documentsToProcess.push({ linkedDoc: directLinkedDoc, documentConfig: docConfig });
            targetDocumentKycIds.push(docConfig.kycId);
            console.log('✅ Added document via direct search:', {
              docName: docConfig.name || docConfig.display_name,
              linkedDocId: directLinkedDoc.id
            });
          } else {
            console.log('❌ No linked document found for:', {
              docName: docConfig.name || docConfig.display_name,
              docKycId: docConfig.kycId,
              searchedForDirectorId: task.individual_id
            });
          }
        }
      }

      if (documentsToProcess.length === 0) {
        console.log('❌ No linked documents found for any applicable document types');
        toast({
          title: 'No Linked Documents',
          description: 'No documents have been linked for any of the applicable document types in this stage.',
          variant: 'default',
        });
        return null;
      }

      console.log(`✅ Found ${documentsToProcess.length} linked documents to process`);
    }

    // Check for indicators and old documents
    const validDocuments = documentsToProcess.filter(({ linkedDoc, documentConfig }) => {
      if (linkedDoc.indicator === true) {
        console.log('⚠️ Document has indicator - skipping:', {
          docName: documentConfig.name || documentConfig.display_name,
          linkedDocId: linkedDoc.id
        });
        return false;
      }

      const isOldDoc = task.created_at &&
        isDocumentOlderThanTask(linkedDoc.created_at, task.created_at);

      if (isOldDoc) {
        console.log('⚠️ Document is older than task creation - skipping:', {
          docName: documentConfig.name || documentConfig.display_name,
          linkedDocId: linkedDoc.id
        });
        return false;
      }

      return true;
    });

    if (validDocuments.length === 0) {
      console.log('❌ No valid documents found after filtering');
      toast({
        title: 'Preview not available',
        description: 'Document preview is not available for the linked documents (either too old or marked as indicator).',
        variant: 'default',
      });
      return null;
    }

    console.log(`📋 Processing ${validDocuments.length} valid documents`);

    // Process each valid document
    const processedDocuments = [];

    for (const { linkedDoc, documentConfig } of validDocuments) {
      const kycId = linkedDoc.document_id;

      console.log('📋 Fetching KYC document data for:', {
        kycId,
        expectedDocType: documentConfig?.name || documentConfig?.display_name || 'Unknown',
        linkedDocId: linkedDoc.id
      });

      // Fetch KYC document data with fields
      const kycData = await fetchKycDocumentData(kycId);
      if (!kycData) {
        console.error('❌ Failed to fetch KYC document data for:', kycId);
        continue;
      }

      console.log('✅ Successfully fetched KYC document data:', {
        kycId: kycData.id,
        name: kycData.name,
        displayName: kycData.display_name,
        documentType: kycData.document_type,
        fieldsCount: kycData.fields?.length || 0
      });

      // Transform KYC fields to the format expected by ExtractionPreview
      const fields = transformKycFieldsToPreviewFormat(kycData.fields || []);

      // Get document name from KYC data
      const documentName = kycData.display_name || kycData.name || 'Document';

      // Build file URL
      const bucketName = 'kyc-documents';
      const filePath = linkedDoc.file_path?.startsWith(bucketName)
        ? linkedDoc.file_path
        : `${bucketName}/${linkedDoc.file_path}`;

      const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
      const fileName = linkedDoc.file_path?.split('/').pop() || documentName;

      // Prepare extracted data from the linked document
      const rawExtractedData = linkedDoc.extracted_details || {};

      // Ensure all fields have values in extractedData
      const extractedData = { ...rawExtractedData };
      fields.forEach((field: any) => {
        if (extractedData[field.id] === undefined && extractedData[field.name] === undefined) {
          extractedData[field.id] = field.isArray ? [] : '';
          extractedData[field.name] = field.isArray ? [] : '';
        }
      });

      const documentPreviewData = {
        documentId: linkedDoc.id,
        documentName,
        fileUrl,
        fileName,
        extractedData,
        fields,
        type: kycData.document_type || 'document',
        file: {
          name: fileName,
          type: fileName.split('.').pop()?.toLowerCase() || 'pdf',
          url: fileUrl
        }
      };

      processedDocuments.push(documentPreviewData);

      console.log('📄 Processed document:', {
        documentId: documentPreviewData.documentId,
        documentName: documentPreviewData.documentName,
        fileName: documentPreviewData.fileName,
        fieldsCount: documentPreviewData.fields.length
      });
    }

    if (processedDocuments.length === 0) {
      console.log('❌ No documents successfully processed');
      return null;
    }

    // Always return multiple documents format for stage rows to support multiple documents
    // For document rows, return single document format for backward compatibility
    const finalPreviewData = (isDocumentRow && processedDocuments.length === 1)
      ? processedDocuments[0]
      : {
        documents: processedDocuments,
        isMultiDocument: processedDocuments.length > 1,
        stageName: stage.name,
        applicantName: task.applicant_name,
        // For single document case, also include top-level properties for backward compatibility
        ...(processedDocuments.length === 1 ? processedDocuments[0] : {})
      };

    console.log('🎯 Final preview data prepared:', {
      isMultiDocument: processedDocuments.length > 1,
      documentCount: processedDocuments.length,
      stageName: stage.name,
      isDocumentRow,
      documentsProcessed: processedDocuments.map(d => ({
        name: d.documentName,
        id: d.documentId
      }))
    });

    return finalPreviewData;
  }, [task, stage, allDocuments, fetchKycDocumentData, transformKycFieldsToPreviewFormat, isDocumentRow, documentData]);

  const processExtractedData = (data: any, fields: any[]): any => {
    if (!data || typeof data !== 'object') return data;

    const result = { ...data };
    fields.forEach(field => {
      const fieldId = field.id || field.fieldName;

      if (field.isArray && Array.isArray(result[fieldId])) {
        result[fieldId] = result[fieldId].map((item: any) => {
          if (field.arrayConfig?.fields) {
            return processExtractedData(item, field.arrayConfig.fields);
          }
          return item;
        });
      }
      else if (typeof result[fieldId] === 'object' && result[fieldId] !== null) {
        result[fieldId] = processExtractedData(result[fieldId], field.fields || []);
      }
    });

    return result;
  };

  // Enhanced useEffect for preview preparation
  useEffect(() => {
    if (!isPreviewOpen) return;

    const preparePreview = async () => {
      const previewData = await buildPreviewDocumentData();
      if (previewData) {
        setPreviewDocument(previewData);
      } else {
        setIsPreviewOpen(false);
      }
    };

    preparePreview();
  }, [isPreviewOpen, buildPreviewDocumentData]);

  // Reset preview document when dialog closes
  useEffect(() => {
    if (!isPreviewOpen) {
      setPreviewDocument(null);
    }
  }, [isPreviewOpen]);

  // Initialize documents using LINKED documents only
  useEffect(() => {
    const linkedDoc = getLinkedDocumentForStage(task, stage, allDocuments);

    if (linkedDoc) {
      const isOldDoc = task.created_at &&
        isDocumentOlderThanTask(linkedDoc.created_at, task.created_at);

      setIsOldDocument(isOldDoc);
      const hasValidDocument = !linkedDoc.indicator && !isOldDoc;
      setHasLinkedDocument(hasValidDocument);

      if (hasValidDocument) {
        const dateFields = [
          'application_date', 'date', 'upload_date', 'created_date',
          'date_and_time_generated', 'invoice_date_and_time', 'With_Effect_From',
          'Expiry_Date', 'Date_of_Issue'
        ];

        if (linkedDoc.extracted_details) {
          const foundDate = findDateInObject(linkedDoc.extracted_details, dateFields);
          if (foundDate) {
            setStageDate(foundDate);
            return;
          }
        }
      }
      setStageDate('');
    } else {
      setHasLinkedDocument(false);
      setIsOldDocument(false);
      setStageDate('');
    }
  }, [allDocuments, task.individual_id, task.created_at, task.source_document_id, stage.id, stage.documents, requiresUpload]);

  // Helper function to find a date in an object, including nested arrays
  const findDateInObject = (obj: any, dateFields: string[]): string | null => {
    if (!obj || typeof obj !== 'object') return null;

    // First try direct fields
    for (const field of dateFields) {
      if (obj[field]) {
        return obj[field];
      }
    }

    // Then check array fields
    for (const key in obj) {
      if (Array.isArray(obj[key]) && obj[key].length > 0) {
        // Check first item in array (most recent)
        if (typeof obj[key][0] === 'object') {
          const dateInArray = findDateInObject(obj[key][0], dateFields);
          if (dateInArray) return dateInArray;
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        // Check nested objects
        const dateInNested = findDateInObject(obj[key], dateFields);
        if (dateInNested) return dateInNested;
      }
    }
    return null;
  };

  const isEnquiryStage = stage.name === 'Enquiry';
  const isConfirmationStage = stage.name === 'Confirmation';

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    // Set initial edit value when stageDate changes
    if (stageDate && stageDate !== 'NaN/NaN/NaN') {
      // Convert DD/MM/YYYY to YYYY-MM-DD for the date input
      const dateParts = stageDate.split('/');
      if (dateParts.length === 3) {
        const [day, month, year] = dateParts;
        if (!isNaN(Number(day)) && !isNaN(Number(month)) && !isNaN(Number(year))) {
          const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          setEditValue(isoDate);
          return;
        }
      }
    }
    setEditValue('');
  }, [stageDate]);

  const createDateFromInput = (dateString: string): Date | null => {
    if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return null;
    }

    const [year, month, day] = dateString.split('-').map(Number);

    if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    const date = new Date(year, month - 1, day);

    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }

    return date;
  };

  const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return '';

    const date = parse(dateStr, 'dd/MM/yyyy', new Date());
    if (isValid(date)) {
      return format(date, 'dd/MM/yyyy');
    }

    const isoDate = parse(dateStr, 'yyyy-MM-dd', new Date());
    if (isValid(isoDate)) {
      return format(isoDate, 'dd/MM/yyyy');
    }

    return dateStr;
  };

  // Function to update a date in a nested object/array structure
  const updateDateInNestedObject = (obj: any, path: string[], value: string): any => {
    if (!obj || !path.length) return obj;

    const [current, ...rest] = path;

    if (rest.length === 0) {
      return { ...obj, [current]: value };
    }

    if (Array.isArray(obj[current])) {
      const updatedArray = [...obj[current]];
      if (updatedArray.length > 0) {
        updatedArray[0] = updateDateInNestedObject(updatedArray[0], rest, value);
      }
      return { ...obj, [current]: updatedArray };
    }

    if (obj[current] && typeof obj[current] === 'object') {
      return {
        ...obj,
        [current]: updateDateInNestedObject(obj[current], rest, value)
      };
    }

    return obj;
  };

  const handleSave = async () => {
    if (!onSave) {
      console.error('onSave function is not provided');
      toast({
        title: "Error",
        description: "Cannot save stage: Save handler not available",
        variant: "destructive"
      });
      return;
    }

    if (!editValue.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid date",
        variant: "destructive"
      });
      return;
    }

    try {
      const dateObj = createDateFromInput(editValue);

      if (!dateObj || !isValid(dateObj)) {
        throw new Error('Invalid date format');
      }

      const formattedDate = format(dateObj, 'dd/MM/yyyy');

      const linkedDoc = getLinkedDocumentForStage(task, stage, allDocuments);

      let updatedExtractedDetails = {};

      if (linkedDoc) {
        const currentDetails = linkedDoc.extracted_details || {};
        const dateFields = [
          'application_date', 'date', 'upload_date', 'created_date',
          'date_generated', 'invoice_date_and_time', 'With_Effect_From',
          'Expiry_Date', 'Date_of_Issue'
        ];

        let dateFieldPath: string[] = [];

        const findDateField = (obj: any, path: string[] = []): boolean => {
          for (const key in obj) {
            const currentPath = [...path, key];
            const value = obj[key];

            if (dateFields.includes(key) && value) {
              dateFieldPath = currentPath;
              return true;
            }

            if (value && typeof value === 'object' && !Array.isArray(value)) {
              if (findDateField(value, currentPath)) {
                return true;
              }
            } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
              if (findDateField(value[0], [...currentPath, '0'])) {
                return true;
              }
            }
          }
          return false;
        };

        findDateField(currentDetails);

        if (dateFieldPath.length > 0) {
          updatedExtractedDetails = updateDateInNestedObject(
            currentDetails,
            dateFieldPath,
            formattedDate
          );
        } else {
          updatedExtractedDetails = { ...currentDetails };
          dateFields.some(field => {
            if (updatedExtractedDetails[field] !== undefined) {
              updatedExtractedDetails[field] = formattedDate;
              return true;
            }
            return false;
          });
        }
      }
      setIsLoading(true);

      await onSave(stage.id, task.id, formattedDate, updatedExtractedDetails);
      setIsEditing(false);

      toast({
        title: "Success",
        description: isConfirmationStage
          ? "Confirmation completed. Task moved to Work in Progress."
          : "Date saved successfully"
      });
    } catch (error) {
      console.error('Date save error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Please enter a valid date",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset to original stage date
    if (stageDate && stageDate !== 'NaN/NaN/NaN') {
      const dateParts = stageDate.split('/');
      if (dateParts.length === 3) {
        const [day, month, year] = dateParts;
        if (!isNaN(Number(day)) && !isNaN(Number(month)) && !isNaN(Number(year))) {
          const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          setEditValue(isoDate);
          setIsEditing(false);
          return;
        }
      }
    }
    setEditValue('');
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      handleSave();
    }
  };

  const handleDocumentUpload = () => {
    if (onDocumentUpload) {
      onDocumentUpload(task, stage);
    }
  };

  const handleTriggerAutomation = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAutomationDialogOpen(true);
  };

  const handleViewDocument = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();

    console.log('👁️ Handle view document called:', {
      stageName: stage.name,
      stageId: stage.id,
      isDocumentRow,
      documentData: documentData ? {
        id: documentData.id,
        name: documentData.name,
        display_name: documentData.display_name,
        kycId: documentData.kycId
      } : null,
      stageDocumentsCount: stage.documents?.length || 0
    });

    setIsPreviewOpen(true);
  }, [stage, isDocumentRow, documentData]);

  const handleClick = () => {
    if (requiresUpload) {
      handleDocumentUpload();
    } else {
      setIsEditing(true);
    }
  };

  if (isEditing && !requiresUpload) {
    return (
      <div
        className="flex items-center gap-2 min-w-[200px]"
        onBlur={handleBlur}
        tabIndex={-1}
      >
        <Input
          ref={inputRef}
          type="date"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="text-sm"
          disabled={isLoading}
        />
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-green-600 hover:text-green-800 hover:bg-green-100"
            onClick={handleSave}
            disabled={isLoading}
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-red-600 hover:text-red-800 hover:bg-red-100"
            onClick={handleCancel}
            disabled={isLoading}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  const renderCellContent = () => {
    // [FIX 2] First, for any stage row, check if the stage is applicable. If not, render N/A.
    // This is the main fix for the user's issue with non-document stages.
    if (!isDocumentRow && !isStageApplicableToTask(stage, task, departments)) {
      return <span className="text-gray-400">N/A</span>;
    }

    // For document rows, check if document is applicable to this task
    if (isDocumentRow && documentData) {
      const isApplicable = isDocumentApplicable(documentData, task);
      if (!isApplicable) {
        return <span className="text-gray-400">N/A</span>;
      }
    }

    // Check for automation - either at stage level or document level
    const automationData = isDocumentRow ? documentData?.automation : stage?.automation;
    const hasAutomation = !!(
      (automationData?.automationId ||
        automationData?.id ||
        (isDocumentRow && (documentData?.automationId || documentData?.hasAutomation))) &&
      automationData?.isActive !== false
    );

    // Get automation name for tooltip
    const automationName = automationData?.name ||
      automationData?.automationName ||
      (documentData?.automationId ? 'Document Automation' : null);

    if (isDocumentRow) {
      // For document rows, show automation icon only if status is 'Not Linked'
      const docValue = typeof value === 'object' ? value : { hasDocument: false, status: value };
      const isNotLinked = docValue.status === 'Not Linked' || docValue.status === 'Not linked';

      return (
        <div className="flex items-center gap-2 justify-center">
          <span className="text-sm">
            {docValue.status}
          </span>
          <div className="flex items-center">
            {docValue.hasDocument && !docValue.hasIndicator && !docValue.isOldDocument ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-green-600 hover:bg-green-100"
                onClick={handleViewDocument}
              >
                <Eye className="h-3 w-3" />
              </Button>
            ) : isNotLinked && hasAutomation ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-amber-500 hover:bg-amber-100"
                title={`Automation: ${automationName}`}
                onClick={handleTriggerAutomation}
              >
                <Zap className="h-3 w-3" />
              </Button>
            ) : null}
          </div>
        </div>
      );
    }

    // For stage rows
    if (requiresUpload) {
      // Ensure we have a valid stage with documents
      if (!stage?.documents?.length) {
        return <span className="text-gray-400">No documents configured</span>;
      }

      // Get all applicable documents for this stage and task
      const applicableDocuments = stage.documents.filter((doc: any) => {
        // If document has targetEntities, check if it applies to this task
        if (doc.targetEntities?.length > 0) {
          return isDocumentApplicable(doc, task);
        }
        // If document has entityType, check if it applies to this task
        if (doc.entityType) {
          return isDocumentApplicable(doc, task);
        }
        // If no specific targeting, check if document is applicable to task
        return isDocumentApplicable(doc, task);
      });

      if (applicableDocuments.length === 0) {
        return <span className="text-gray-400">N/A</span>;
      }

      // Check if we have any linked documents for this stage
      const hasAnyLinkedDocument = applicableDocuments.some(doc => {
        const linkedDoc = getLinkedDocumentForStage(task, { ...stage, documents: [doc] }, allDocuments || []);
        return !!linkedDoc;
      });

      // Check if any linked document is old
      const hasOldDocument = applicableDocuments.some(doc => {
        const linkedDoc = getLinkedDocumentForStage(task, { ...stage, documents: [doc] }, allDocuments || []);
        return linkedDoc && task.created_at && isDocumentOlderThanTask(linkedDoc.created_at, task.created_at);
      });

      // Only show automation icon if there are applicable documents with automationId AND no document is linked yet
      const shouldShowAutomationIcon = !hasAnyLinkedDocument && applicableDocuments.some(
        (doc: any) => doc.automationId || doc.automation?.id
      );

      return (
        <div className="flex flex-col items-center gap-1 p-1">
          <div className="flex gap-1">
            {/* Trigger Automation Button */}
            {shouldShowAutomationIcon && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-amber-500 hover:bg-amber-100"
                onClick={handleTriggerAutomation}
                title="Run automation"
              >
                <Zap className="h-4 w-4" />
              </Button>
            )}

            {/* Upload Button */}
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${hasAnyLinkedDocument ? 'text-blue-400' : 'text-blue-600'} hover:bg-blue-100`}
              onClick={handleDocumentUpload}
              title={hasAnyLinkedDocument ? 'Upload new document' : 'Upload document'}
            >
              <Upload className="h-4 w-4" />
            </Button>

            {/* Enhanced View Button with proper document preview */}
            {hasAnyLinkedDocument && !hasOldDocument && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-green-600 hover:bg-green-100"
                onClick={handleViewDocument}
                title="View linked document"
              >
                <Eye className="h-4 w-4" />
              </Button>
            )}

            {/* Show warning icon for old documents */}
            {hasOldDocument && (
              <div className="h-8 w-8 flex items-center justify-center">
                <AlertTriangle
                  className="h-4 w-4 text-orange-500"
                  title="Document is older than task creation - preview disabled"
                />
              </div>
            )}
          </div>

          {/* Show date if we have a stage date */}
          {stageDate && (
            <div className="text-xs text-gray-600 text-center mt-1">
              {formatDateDisplay(stageDate)}
            </div>
          )}

          {/* Show status message */}
          <div className={`text-xs text-center mt-1 ${hasOldDocument ? 'text-orange-600' :
            hasAnyLinkedDocument ? 'text-green-600' :
              'text-slate-500'
            }`}>
            {hasOldDocument ? 'Old Document' :
              hasAnyLinkedDocument ? 'Document Ready' :
                'No Document Linked'}
          </div>
          {/* <div className={`text-xs text-center mt-1 ${
        hasOldDocument ? 'text-orange-600' :
        hasAnyLinkedDocument ? 'text-green-600' :
        'text-slate-500'
      }`}>
        {hasOldDocument ? 'Old Document' :
          hasAnyLinkedDocument ? 'Completed' :
          (stage.status || 'Pending')} 
      </div> */}
        </div>
      );
    } else {
      // For non-upload stages, add automation button here too if needed
      const hasAutomation = !!(stage?.automation?.automationId || stage?.automation?.id || stage?.web_automation?.automationId);

      return (
        <div className="flex items-center gap-2">
          {/* Show automation button for non-upload stages too */}
          {hasAutomation && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-amber-500 hover:bg-amber-100"
              onClick={handleTriggerAutomation}
              disabled={isAutomationRunning}
              title={`Run ${stage.automation?.name || stage.automation?.automationName || 'automation'}`}
            >
              {isAutomationRunning ? (
                <Clock className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
            </Button>
          )}

          {stageDate && stageDate !== 'NaN/NaN/NaN' ? (
            <div className="flex items-center gap-2 group">
              <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
                <Check className="h-3 w-3 mr-1" />
                {formatDateDisplay(stageDate)}
              </Badge>
              <Pencil className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-gray-600 hover:text-gray-800 hover:bg-gray-100 border border-dashed border-gray-300"
            >
              <Calendar className="h-3 w-3 mr-1" />
              {isEnquiryStage ? 'Add Enquiry Date' :
                isConfirmationStage ? 'Add Confirmation Date' :
                  'Add Date'}
            </Button>
          )}
        </div>
      );
    }
  }

  // Get automation ID if it exists - check both stage and document level
  const automationId = isDocumentRow
    ? documentData?.automation?.automationId || documentData?.automation?.id
    : stage?.web_automation?.automationId || stage?.web_automation?.id;

  return (
    <>
      {/* Automation Mapping Dialog */}
      <AutomationMappingDialog
        isOpen={automationDialogOpen}
        onClose={() => setAutomationDialogOpen(false)}
        classId={task.class_id}
        requirementId={stage.id}
        taskId={task.id}
        automationId={automationId}
        task={task}
        subDeptId={task.subdepartment?.id?.toString() || task.subdepartment_id?.toString() || task.sub_dept_id?.toString()}
        isSubclass={!!task.subclass_id}
        subclassId={task.subclass_id?.toString()}
        stage={stage} // Pass the current stage
        allDocuments={allDocuments}
      />
      <div
        className={`flex items-center justify-center min-h-[32px] cursor-pointer hover:bg-gray-50 rounded p-1 ${requiresUpload ? 'hover:bg-blue-50' : 'hover:bg-gray-50'
          }`}
        onClick={handleClick}
      >
        {renderCellContent()}
      </div>

      {/* Enhanced Document Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-7xl w-[95vw] h-[95vh] p-0 flex flex-col">
          {previewDocument ? (
            <div className="flex flex-col h-full">
              <DialogHeader className="p-6 pb-2">
                <DialogTitle className="text-xl flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {previewDocument.isMultiDocument
                    ? `${previewDocument.stageName} - Multiple Documents`
                    : previewDocument.documentName
                  }
                </DialogTitle>
                <DialogDescription>
                  Review extracted details for {task.applicant_name || 'this document'} - Stage: {stage.name}
                  {previewDocument.isMultiDocument && (
                    <span className="block mt-1 text-sm">
                      Found {previewDocument.documents?.length || 0} documents for this stage
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto p-6 pt-2">
                {previewDocument.isMultiDocument ? (
                  // Render multiple documents
                  <div className="space-y-6">
                    {previewDocument.documents?.map((doc, index) => (
                      <div key={doc.documentId} className="border rounded-lg p-4">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {doc.documentName}
                          <Badge variant="outline" className="text-xs">
                            Document {index + 1} of {previewDocument.documents?.length || 0}
                          </Badge>
                        </h3>
                        <ExtractionPreview
                          documentName={doc.documentName}
                          fileUrl={doc.fileUrl}
                          fileName={doc.fileName}
                          extractedData={doc.extractedData || {}}
                          fields={doc.fields || []}
                          viewMode={true}
                          showSaveButton={false}
                          file={doc.file}
                          type={doc.type}
                          documentId={doc.documentId}
                          onDataChange={(fieldName, value) => {
                            console.log('Document field changed:', fieldName, value);
                          }}
                          onSave={(updatedData) => {
                            console.log('Document data saved:', updatedData);
                            // Handle save for individual document
                          }}
                          onClose={() => { }}
                          getStylesByType={(type) => ({
                            getBgColor: () => 'bg-primary',
                            getTextColor: () => 'text-primary-foreground',
                            getBorderColor: () => 'border-primary',
                            getButtonStyle: () => 'bg-primary hover:bg-primary/90 text-primary-foreground'
                          })}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  // Render single document
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
                      setIsPreviewOpen(false);
                      toast({
                        title: "Success",
                        description: "Document details saved successfully."
                      });
                    }}
                    onClose={() => setIsPreviewOpen(false)}
                    getStylesByType={(type) => ({
                      getBgColor: () => 'bg-primary',
                      getTextColor: () => 'text-primary-foreground',
                      getBorderColor: () => 'border-primary',
                      getButtonStyle: () => 'bg-primary hover:bg-primary/90 text-primary-foreground'
                    })}
                  />
                )}
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
}