// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, Briefcase, Users, Plus, Minus, UserCheck, Loader2, Download, FileText, FileUp, Trash2, RefreshCw, Wand2, Save, ChevronDown, ChevronRight, Users2, User, Building2, Zap, FileType, UploadCloud, Eye, Calendar, CheckCircle2, XCircle, AlertCircle } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { ExtractionPreview } from "@/components/ExtractionPreview"
import supabase from "@/lib/supabase/client"
import { COMPUTED_FUNCTIONS } from "@/lib/constants/computed-functions"
import {
  getLatestDocument,
  getAllDocuments,
  determineImmigrationStatus,
  getLatestDocumentExpiryDate,
  type DocumentCache
} from "../tasks/utils/automationComputedFunctions"
let htmlDocx: any = null;
import('html-docx-js/dist/html-docx')
  .then(module => {
    htmlDocx = module.default || module;
  })
  .catch(err => console.error('Failed to load html-docx-js', err));

import TemplateGenerationDialog from "./TemplateGenerationDialog"
import { StageUploadDialog } from "../tasks/components/StageUploadDialog"
import { UploadModal } from "@/app/generic-components/UploadModal"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

const generateDocxBlobFromHtml = async (html: string) => {
  if (!htmlDocx) {
    throw new Error('html-docx-js is not loaded yet');
  }
  return htmlDocx.asBlob(html);
};

const CLASS_D_ID = '1750687058159';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deepEqual(obj1, obj2) {
  if (obj1 === obj2) return true;
  if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) return false;
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  if (keys1.length !== keys2.length) return false;
  for (let key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) return false;
  }
  return true;
}

// --- ROBUST HELPER FUNCTION TO VALIDATE AND CLEAN UUIDS ---
const parseAndCleanUUIDs = (input: any): string[] => {
  if (!input) return [];

  // Standard UUID regex
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

  // Convert input to a single string, handle arrays by joining them
  const inputString = Array.isArray(input) ? input.join(',') : String(input);

  const matches = inputString.match(uuidRegex) || [];

  // Return a unique set of valid UUIDs
  return [...new Set(matches)];
};

// Add this helper function near the top of the file, after the imports
const getFileUrl = (filePath: string) => {
  if (!filePath) return '';
  // If it's already a full URL, return as is
  if (filePath.startsWith('http')) return filePath;
  // Otherwise, construct the Supabase storage URL
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${filePath}`;
};

export default function RequirementsTableCombined({ loading, error, filteredGroupedTasks, organizedRequirements, classRequirements, expandedDocuments, toggleDocumentExpansion, renderDocumentStatus, renderClientFieldData, renderReferencesData, hasReferencesColumn, individualNames, companyData, getCurrentRequirements, fuzzyMatch, kycDocuments, documentTypes, mainTab, handleUploadSubmit, handleDeleteDocument, handleRetryExtraction, handleSaveEditedDocument, documentTemplates, allIndividualDocuments, allCompanyDocuments, }: any) {
  const [isStageDialogOpen, setIsStageDialogOpen] = useState(false);
  const [selectedStageTask, setSelectedStageTask] = useState<{ task: any, stage: any } | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    company: true,
    individual: true,
    letters: true,
  });
  const [expandedDependants, setExpandedDependants] = useState<Set<number>>(new Set());
  const [expandedCompositeRequirements, setExpandedCompositeRequirements] = useState<Set<string>>(new Set());

  const toggleDependants = (groupIndex: number) => {
    setExpandedDependants(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupIndex)) {
        newSet.delete(groupIndex);
      } else {
        newSet.add(groupIndex);
      }
      return newSet;
    });
  };

  const toggleCompositeRequirement = (requirementId: string) => {
    setExpandedCompositeRequirements(prev => {
      const newSet = new Set(prev);
      if (newSet.has(requirementId)) {
        newSet.delete(requirementId);
      } else {
        newSet.add(requirementId);
      }
      return newSet;
    });
  };

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedDocForUpload, setSelectedDocForUpload] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewingDocuments, setPreviewingDocuments] = useState<any>(null);
  const [showTemplateGenerator, setShowTemplateGenerator] = useState(false);
  const [selectedLetterInfo, setSelectedLetterInfo] = useState(null);
  const [isPreparingTemplate, setIsPreparingTemplate] = useState(false);
  const [masterFields, setMasterFields] = useState<Map<number, any>>(new Map());
  const hasFetchedMasterFields = useRef(false);

  // New state for document metadata cache
  const [documentMetadataCache, setDocumentMetadataCache] = useState<Map<string, any>>(new Map());

  // New state for document status cache
  const [documentStatusCache, setDocumentStatusCache] = useState<Map<string, any>>(new Map());

  // New state for composite status cache
  const [compositeStatusCache, setCompositeStatusCache] = useState<Map<string, any>>(new Map());

  // Function to get document status with caching - now inside component
  const getDocumentStatus = async (task: any, docId: string, personType: string, personId: string) => {
    const cacheKey = `${task.id}-${docId}-${personType}-${personId}`;

    // Check cache first
    if (documentStatusCache.has(cacheKey)) {
      return documentStatusCache.get(cacheKey);
    }

    try {
      // Get the document metadata to check if it has isEffectiveTo field
      const docMetadata = documentMetadataCache.get(docId);
      if (!docMetadata) {
        const result = { status: 'unknown', label: 'Unknown', color: 'text-gray-400', bgColor: 'bg-gray-50' };
        setDocumentStatusCache(prev => new Map(prev.set(cacheKey, result)));
        return result;
      }

      // Check if document type has isEffectiveTo field
      const hasEffectiveToDate = docMetadata.fields?.some((field: any) => field.isEffectiveTo);

      if (!hasEffectiveToDate) {
        const result = { status: 'valid', label: 'Valid', color: 'text-green-600', bgColor: 'bg-green-50' };
        setDocumentStatusCache(prev => new Map(prev.set(cacheKey, result)));
        return result;
      }

      // Get expiry date using computed function
      const expiryDate = await getLatestDocumentExpiryDate(personId, [docId]);

      if (expiryDate.includes('Not Found')) {
        const result = { status: 'unknown', label: 'No Expiry', color: 'text-gray-400', bgColor: 'bg-gray-50' };
        setDocumentStatusCache(prev => new Map(prev.set(cacheKey, result)));
        return result;
      }

      const expiry = new Date(expiryDate);
      const now = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(now.getDate() + 30);

      let status, label, color, bgColor;

      if (expiry < now) {
        status = 'expired';
        label = 'Expired';
        color = 'text-red-600';
        bgColor = 'bg-red-50';
      } else if (expiry < thirtyDaysFromNow) {
        status = 'expiring';
        label = 'Expiring Soon';
        color = 'text-amber-600';
        bgColor = 'bg-amber-50';
      } else {
        status = 'valid';
        label = 'Valid';
        color = 'text-green-600';
        bgColor = 'bg-green-50';
      }
      const day = String(expiry.getDate()).padStart(2, '0');
      const month = String(expiry.getMonth() + 1).padStart(2, '0');
      const year = expiry.getFullYear();
      const formattedDate = `${day}/${month}/${year}`;

      const result = { status, label, color, bgColor, expiryDate: formattedDate };

      // Cache the result
      setDocumentStatusCache(prev => new Map(prev.set(cacheKey, result)));

      return result;
    } catch (error) {
      console.error('Error getting document status:', error);
      const result = { status: 'error', label: 'Error', color: 'text-red-400', bgColor: 'bg-red-50' };
      setDocumentStatusCache(prev => new Map(prev.set(cacheKey, result)));
      return result;
    }
  };

  // Update composite statuses when document statuses change
  useEffect(() => {
    // Trigger re-calculation of composite statuses when document cache changes
    const updateCompositeStatuses = async () => {
      // Clear composite cache to force recalculation
      setCompositeStatusCache(new Map());
    };

    if (documentStatusCache.size > 0) {
      updateCompositeStatuses();
    }
  }, [documentStatusCache]);

  // Filter requirements based on computed functions
  const filteredRequirements = useMemo(() => {
    if (!organizedRequirements.documents) return {};

    const filtered: any = {};

    Object.entries(organizedRequirements.documents).forEach(([key, reqList]: [string, any[]]) => {
      filtered[key] = reqList.filter(req => {
        // If no computed function or it's 'none', include it
        if (!req.computed_function || req.computed_function === 'none') {
          return true;
        }

        // For now, include all requirements - we can add filtering logic later
        return true;
      });
    });

    return filtered;
  }, [organizedRequirements]);

  // RequirementsTableCombined.tsx - Around line 105
  const classDocsAndFields = useMemo(() => { return classRequirements?.[0]?.documents_and_fields || []; }, [classRequirements]);

  const checkApplicability = (colType: string, requirement: any) => {
    if (!requirement) return false;

    // Normalizing colType to match your JSON (e.g., 'director' in table vs 'principal' in JSON)
    const typeMap: Record<string, string> = {
      'principal': 'principal',
      'director': 'principal', // Usually directors are treated as principal requirements in these flows
      'company': 'company',
      'dependant': 'dependant',
      'understudy': 'understudy'
    };

    const targetType = typeMap[colType] || colType;

    // Check the applicantTypes array or single applicantType string
    const allowedTypes = requirement.applicantTypes || (requirement.applicantType ? [requirement.applicantType] : []);

    return allowedTypes.includes(targetType);
  };

  const columnDefinitions = useMemo(() => {
    const cols = [];
    if (!filteredGroupedTasks) return cols;

    filteredGroupedTasks.forEach((group, groupIndex) => {
      const task = group.tasks?.[0];
      if (!task) return;

      const participants = task.participants_details || [];
      const applicant = task.applicant_details || {};
      const groupCols = [];

      // 1. HANDLE APPLICANT (can be company or individual)
      if (applicant && applicant.id) {
        if (applicant.type === 'company') {
          groupCols.push({
            type: 'company',
            id: applicant.id,
            label: applicant.name,
            subLabel: 'Applicant',
            task,
            groupIndex,
            priority: 1 // Company gets highest priority
          });
        } else if (applicant.type === 'individual') {
          groupCols.push({
            type: 'principal',
            id: applicant.id,
            label: applicant.name,
            subLabel: applicant.role?.toUpperCase() || 'PRINCIPAL',
            task,
            groupIndex,
            priority: 2 // Principal gets second priority
          });
        }
      }

      // 2. HANDLE COMPANY FROM PARTICIPANTS (if not already added as applicant)
      const companyPart = participants.find(p =>
        p.type === 'company' ||
        (Array.isArray(p.role) ? p.role.includes('company') : p.role === 'company')
      );
      if (companyPart && (!applicant || applicant.id !== companyPart.id)) {
        groupCols.push({
          type: 'company',
          id: companyPart.id,
          label: companyPart.name,
          subLabel: 'Entity',
          task,
          groupIndex,
          priority: 1 // Company gets highest priority
        });
      }

      // 3. HANDLE PRINCIPAL INDIVIDUAL FROM PARTICIPANTS (if not already added as applicant)
      const principalIndividual = participants.find(p =>
        p.type === 'individual' &&
        (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal') ||
        (Array.isArray(p.role) ? p.role.includes('applicant') : p.role === 'applicant') ||
        (!p.role && !p.relationship)
      );
      if (principalIndividual && (!applicant || applicant.id !== principalIndividual.id)) {
        groupCols.push({
          type: 'principal',
          id: principalIndividual.id,
          label: principalIndividual.name,
          subLabel: 'PRINCIPAL',
          task,
          groupIndex,
          priority: 2 // Principal gets second priority
        });
      }

      // 4. FIND DIRECTORS / SHAREHOLDERS
      const directors = participants.filter(p =>
        p.type === 'individual' &&
        (Array.isArray(p.role) ? p.role.includes('director') || p.role.includes('shareholder') : p.role === 'director' || p.role === 'shareholder')
      );
      directors.forEach(d => {
        // Avoid duplicates
        if (!groupCols.find(col => col.id === d.id && col.groupIndex === groupIndex)) {
          groupCols.push({
            type: 'director',
            id: d.id,
            label: d.name,
            subLabel: 'Director',
            task,
            groupIndex,
            priority: 3 // Directors get third priority
          });
        }
      });

      // 5. FIND DEPENDANTS (only show if expanded)
      const dependants = participants.filter(p =>
        p.type === 'individual' &&
        (Array.isArray(p.role) ? p.role.includes('dependant') : p.role === 'dependant')
      );
      if (expandedDependants.has(groupIndex)) {
        dependants.forEach(dep => {
          // Avoid duplicates
          if (!groupCols.find(col => col.id === dep.id && col.groupIndex === groupIndex)) {
            groupCols.push({
              type: 'dependant',
              id: dep.id,
              label: dep.name,
              subLabel: dep.relationship || 'Dependant',
              task,
              groupIndex,
              relationship: dep.relationship,
              priority: 4 // Dependants get fourth priority
            });
          }
        });
      }

      // 6. FIND UNDERSTUDY (Looking in participants_details by role first)
      const understudyParticipant = participants.find(p =>
        p.type === 'individual' &&
        (Array.isArray(p.role) ? p.role.includes('understudy') : p.role === 'understudy')
      );
      if (understudyParticipant) {
        // Avoid duplicates
        if (!groupCols.find(col => col.id === understudyParticipant.id && col.groupIndex === groupIndex)) {
          groupCols.push({
            type: 'understudy',
            id: understudyParticipant.id,
            label: understudyParticipant.name,
            subLabel: 'Understudy',
            task,
            groupIndex,
            priority: 5 // Understudy gets fifth priority
          });
        }
      } else if (task.understudy) {
        // Fallback to root understudy field
        const understudyId = task.understudy;
        const uPart = participants.find(p => p.id === understudyId);
        // Avoid duplicates
        if (!groupCols.find(col => col.id === understudyId && col.groupIndex === groupIndex)) {
          groupCols.push({
            type: 'understudy',
            id: understudyId,
            label: uPart?.name || individualNames[understudyId] || 'Understudy',
            subLabel: 'Understudy',
            task,
            groupIndex,
            priority: 5 // Understudy gets fifth priority
          });
        }
      }

      // Sort columns by priority to ensure company always comes first
      groupCols.sort((a, b) => a.priority - b.priority);
      cols.push(...groupCols);
    });

    return cols;
  }, [filteredGroupedTasks, individualNames, expandedDependants]);

  useEffect(() => {
    const calculateAllStatuses = async () => {
      // Wait for metadata and tasks to be ready
      if (documentMetadataCache.size === 0 || !columnDefinitions.length) return;

      const newStatuses = new Map(documentStatusCache);
      let changed = false;

      for (const col of columnDefinitions) {
        // Logic for Company vs Individual IDs
        const personId = col.type === 'company' ? col.id : (col.id || col.task.individual_id);

        const docsToCheck = col.type === 'company'
          ? (allCompanyDocuments[personId] || [])
          : (allIndividualDocuments[personId] || []);

        for (const doc of docsToCheck) {
          const docId = doc.kyc_document_id || doc.document_id;
          const cacheKey = `${col.task.id}-${docId}-${col.type}-${personId}`;

          // Only fetch if not already in cache and we have the metadata definition
          if (!newStatuses.has(cacheKey) && documentMetadataCache.has(docId)) {
            const status = await getDocumentStatus(col.task, docId, col.type, personId);
            newStatuses.set(cacheKey, status);
            changed = true;
          }
        }
      }

      if (changed) {
        setDocumentStatusCache(new Map(newStatuses));
      }
    };

    calculateAllStatuses();
  }, [documentMetadataCache, allCompanyDocuments, allIndividualDocuments, columnDefinitions]);

  const companySpans = useMemo(() => {
    const spans = [];
    let currentGroup = -1;
    columnDefinitions.forEach(col => {
      if (col.groupIndex !== currentGroup) {
        spans.push({ groupIndex: col.groupIndex, label: col.task?.company_name || 'Company', count: 1 });
        currentGroup = col.groupIndex;
      } else {
        spans[spans.length - 1].count++;
      }
    });
    return spans;
  }, [columnDefinitions]);

  const totalColumns = columnDefinitions.length + 2; // + index and name columns

  // Fetch master fields once on mount
  useEffect(() => {
    if (hasFetchedMasterFields.current) return;

    const fetchMasterFields = async () => {
      try {
        const { data, error } = await supabase.from('tm_job_fields').select('*').order('id', { ascending: true });
        if (error) throw error;

        const fieldsMap = new Map(data.map(field => [field.id, field]));
        setMasterFields(fieldsMap);
        hasFetchedMasterFields.current = true;
      } catch (error) {
        console.error("Failed to fetch master fields:", error);
        toast({
          title: "Could not load master fields",
          description: error.message,
          variant: "destructive"
        });
      }
    };

    fetchMasterFields();
  }, []);

  // Replace your current fetchDocumentMetadata useEffect (around line 500)
  useEffect(() => {
    const fetchDocumentMetadata = async () => {
      const allDocIds = new Set<string>();

      // Helper to extract IDs from requirements
      const extractIds = (reqList: any[]) => {
        reqList.forEach(req => {
          if (req.kyc_document_ids) {
            req.kyc_document_ids.forEach(id => {
              if (UUID_REGEX.test(id)) allDocIds.add(id);
            });
          }
          if (req.kyc_document_id && UUID_REGEX.test(req.kyc_document_id)) {
            allDocIds.add(req.kyc_document_id);
          }
        });
      };

      if (organizedRequirements.documents) {
        Object.values(organizedRequirements.documents).forEach((list: any) => extractIds(list));
      }

      if (allDocIds.size === 0) return;

      try {
        const { data, error } = await supabase
          .from('acc_portal_kyc')
          .select('*')
          .in('id', Array.from(allDocIds));

        if (error) throw error;

        const metadataMap = new Map(data.map(doc => [doc.id, doc]));
        setDocumentMetadataCache(metadataMap);
      } catch (error) {
        console.error('Error fetching document metadata:', error);
      }
    };

    fetchDocumentMetadata();
  }, [organizedRequirements]);

  const fetchDocumentTemplates = async (documentId: string, task: any) => {
    try {
      // Get bank ID from task's participants_details
      const bankParticipant = task.participants_details?.find((p: any) => p.type === 'bank');
      const bankId = bankParticipant?.id;

      let query = supabase
        .from('acc_portal_templates')
        .select('*')
        .eq('document_id', documentId)
        .order('file_name', { ascending: true });

      // If bank ID is found, filter templates by bank_id
      if (bankId) {
        query = query.filter('banks_associated', 'cs', `[{"bank_id":${bankId},"bank_name":"${bankParticipant.name}"}]`);
      }

      const { data: templates, error } = await query;

      if (error) {
        console.error('Error fetching templates:', error);
        throw error;
      }

      return templates || [];
    } catch (error) {
      console.error('Error fetching document templates:', error);
      return [];
    }
  };

  const handleOpenTemplateGenerator = async (docItem, task, colType, colId) => {
    setIsPreparingTemplate(true);
    try {
      // 1. Setup Context Variables
      const participant = task.participants_details?.find(p => p.id === colId);

      let companyId = task.company_id;
      let companyName = task.company_name;
      if (!companyId && task.participants_details) {
        const companyPart = task.participants_details.find(p => p.type === 'company');
        companyId = companyPart?.id;
        companyName = companyPart?.name;
      }
      if (!companyId && task.applicant_details?.type === 'company') {
        companyId = task.applicant_details.id;
        companyName = task.applicant_details.name;
      }

      const companyRelationships = getRelationshipData()?.find(rel =>
        rel.company?.id === companyId || rel.company?.name === companyName
      );

      const entityIdMap = {
        company: companyId,
        directors: companyRelationships?.directors?.map(d => d.id) || [],
        director: colType === 'director' ? colId : (companyRelationships?.directors?.[0]?.id || null),
        principal: colType === 'principal' ? colId : (companyRelationships?.principal?.id || null),
        dependants: companyRelationships?.dependants?.map(d => d.id) || [],
        understudy: companyRelationships?.understudy?.id || null
      };

      // 2. Fetch Templates
      const templates = await fetchDocumentTemplates(docItem.document.id, task);
      if (!templates || templates.length === 0) {
        toast.error(`No templates are available for: ${docItem.document.display_name}`);
        setIsPreparingTemplate(false);
        return;
      }

      // 3. Build Query Map
      const queriesToRun = new Map();

      // Helper to add query
      const addQuery = (tableName, docId, linkVar, entId) => {
        if (!queriesToRun.has(tableName)) {
          queriesToRun.set(tableName, { docIds: new Set(), links: new Map() });
        }
        const tq = queriesToRun.get(tableName);
        if (docId) tq.docIds.add(docId);
        if (linkVar && entId) {
          if (!tq.links.has(linkVar)) tq.links.set(linkVar, new Set());

          if (Array.isArray(entId)) {
            entId.forEach(id => {
              const val = (id && typeof id === 'object') ? (id.id || id.director_id || id.individual_id || id.company_id) : id;
              if (val) tq.links.get(linkVar).add(val);
            });
          } else {
            const val = (entId && typeof entId === 'object') ? (entId.id || entId.director_id || entId.individual_id || entId.company_id) : entId;
            if (val) tq.links.get(linkVar).add(val);
          }
        }
      };

      templates.forEach(template => {
        (template.placeholders || []).forEach(placeholder => {
          // Standard Master Fields
          const pids = placeholder.master_field_ids || (placeholder.master_field_id ? [placeholder.master_field_id] : []);
          pids.forEach(id => {
            const masterField = masterFields.get(parseInt(id, 10));
            if (masterField?.sources) {
              const entityId = entityIdMap[placeholder.entity_type || 'principal'];
              if (entityId) {
                masterField.sources.forEach(source => {
                  const { table, linking_variable, document_id } = source;
                  if (!table) return;
                  const validDocIds = document_id ? parseAndCleanUUIDs(document_id) : [];
                  if (validDocIds.length > 0) {
                    validDocIds.forEach(vid => addQuery(table, vid, linking_variable || 'id', entityId));
                  } else {
                    addQuery(table, null, linking_variable || 'id', entityId);
                  }
                });
              }
            }
          });

          // Checklist Placeholders
          if (placeholder.type === 'document_checklist' && placeholder.linked_document_ids) {
            const dataSource = placeholder.checklist_data_source || { table: 'acc_portal_kyc_uploads', linking_variable: 'company_id' };
            const entityId = entityIdMap[Array.isArray(placeholder.entity_type) ? placeholder.entity_type[0] : (placeholder.entity_type || 'company')];
            if (entityId) {
              placeholder.linked_document_ids.forEach(did => addQuery(dataSource.table, did, dataSource.linking_variable, entityId));
            }
          }
        });
      });

      // 4. PARALLEL FETCH EXECUTION
      const sourceDataCache: Record<string, Record<number, any>> = { 'tm_tasks': { [task.id]: task } };

      const fetchPromises = Array.from(queriesToRun.entries()).map(async ([table, { docIds, links }]) => {
        const records = new Map();
        const docIdField = (table === 'acc_portal_kyc_uploads') ? 'kyc_document_id' : 'document_id';

        // 4a. Fetch by Document IDs (if special tables)
        if ((table === 'acc_portal_kyc_uploads' || table === 'acc_portal_directors_documents') && docIds.size > 0) {
          const validDocIds = [...docIds].filter(id => UUID_REGEX.test(id));
          if (validDocIds.length > 0) {
            const { data } = await supabase.from(table).select('*').in(docIdField, validDocIds);
            (data || []).forEach(rec => records.set(rec.id, rec));
          }
        } else if (docIds.size > 0) {
          // Generic table document_id fetch
          const { data } = await supabase.from(table).select('*').in('document_id', [...docIds]);
          (data || []).forEach(rec => records.set(rec.id, rec));
        }

        // 4b. Fetch by Linking Variables (Parallelize internal link queries too)
        const linkPromises = Array.from(links.entries()).map(async ([linkVar, entityIdsSet]) => {
          const entityIds = Array.from(entityIdsSet).filter(Boolean);
          if (entityIds.length > 0) {
            const { data } = await supabase.from(table).select('*').in(linkVar, entityIds);
            return data || [];
          }
          return [];
        });

        const linkResults = await Promise.all(linkPromises);
        linkResults.flat().forEach(rec => records.set(rec.id, rec));

        return { table, data: Object.fromEntries(records) };
      });

      const results = await Promise.all(fetchPromises);
      results.forEach(({ table, data }) => {
        sourceDataCache[table] = data;
      });

      // 5. Prepare Dialog Data (Rest of logic remains the same)
      const relationshipData = {
        company: task.participants_details?.find(p => p.type === 'company') || (task.applicant_details?.type === 'company' ? task.applicant_details : null) || { id: task.company_id, name: task.company_name, type: 'company' },
        directors: (() => {
          if (colType === 'director') {
            const directorId = colId;
            let specificDirector = task.participants_details?.find(p => p.type === 'individual' && p.id === directorId);
            if (!specificDirector && sourceDataCache['registry_individuals']) {
              specificDirector = sourceDataCache['registry_individuals'][directorId];
              if (specificDirector) specificDirector = { ...specificDirector, type: 'individual' };
            }
            return specificDirector ? [specificDirector] : [];
          }
          return task.participants_details?.filter(p => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('director') : p.role === 'director')) || [];
        })(),
        principal: task.participants_details?.find(p => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')) || (task.applicant_details?.type === 'individual' ? task.applicant_details : null),
        dependants: task.participants_details?.filter(p => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('dependant') || p.role.includes('dependent') : p.role === 'dependant' || p.role === 'dependent')) || [],
        understudy: task.participants_details?.find(p => p.type === 'individual' && p.id === task.understudy_id),
      };

      const letterInfo = {
        document: docItem.document,
        task: task,
        masterFields: masterFields,
        entityIdMap: entityIdMap,
        sourceDataCache: sourceDataCache,
        availableTemplates: templates,
        template: templates.length === 1 ? templates[0] : null,
        personData: task.applicant_details?.type === 'individual' ? task.applicant_details : {},
        companyData: task.applicant_details?.type === 'company' ? task.applicant_details : {},
        extractedData: task.applicant_details || {},
        relationshipData: relationshipData,
      };

      setSelectedLetterInfo(letterInfo);
      setShowTemplateGenerator(true);

    } catch (error) {
      console.error("❌FATAL ERROR:", error);
      toast({ title: "Error preparing template", description: error.message, variant: "destructive" });
    } finally {
      setIsPreparingTemplate(false);
    }
  };

  const handleSaveGeneratedLetter = (file) => {
    if (!selectedLetterInfo) return;

    const { document, task } = selectedLetterInfo;
    const isCompanyDoc = selectedLetterInfo.entityIdMap.company && !selectedLetterInfo.entityIdMap.principal && !selectedLetterInfo.entityIdMap.dependant;

    const uploadData = {
      files: [file],
      document_id: document.id,
      company_id: selectedLetterInfo.entityIdMap.company,
      individual_id: selectedLetterInfo.entityIdMap.principal || selectedLetterInfo.entityIdMap.dependant || selectedLetterInfo.entityIdMap.understudy,
      task_id: task.id,
    };
    handleUploadSubmit(uploadData);
  };

  const getRelationshipData = useCallback(() => {
    if (columnDefinitions.length === 0) return [];

    const groupedColumns = columnDefinitions.reduce((groups, col) => {
      if (!groups[col.groupIndex]) groups[col.groupIndex] = [];
      groups[col.groupIndex].push(col);
      return groups;
    }, {} as Record<number, any[]>);

    return Object.values(groupedColumns).map(columns => {
      const task = columns[0]?.task;
      const participants = task?.participants_details || [];
      const applicant = task?.applicant_details || {};

      const companyParticipant = participants.find(p => p.type === 'company');

      return {
        company: {
          id: companyParticipant?.id || task?.company_id,
          name: companyParticipant?.name || task?.company_name || 'Company',
          type: 'company'
        },
        principal: {
          id: applicant.id || task?.individual_id,
          name: applicant.name || individualNames[applicant.id],
          role: applicant.role
        },
        directors: participants
          .filter(p => p.type === 'individual' && (
            Array.isArray(p.role) ? (p.role.includes('director') || p.role.includes('shareholder')) : (p.role === 'director' || p.role === 'shareholder')
          ))
          .map(d => ({
            id: d.id,
            name: d.name,
            role: d.role
          })),
        dependants: participants
          .filter(p => p.type === 'individual' && (
            Array.isArray(p.role) ? p.role.includes('dependant') : p.role === 'dependant'
          ))
          .map(dep => ({
            id: dep.id,
            name: dep.name,
            relationship: dep.relationship || 'dependant'
          })),
        understudy: (() => {
          const understudyParticipant = participants.find(p =>
            p.type === 'individual' &&
            (Array.isArray(p.role) ? p.role.includes('understudy') : p.role === 'understudy')
          );
          if (understudyParticipant) {
            return {
              id: understudyParticipant.id,
              name: understudyParticipant.name
            };
          }

          const uId = task?.understudy || task?.understudy_id;
          if (!uId) return null;
          const uPart = participants.find(p => p.id === uId);
          return {
            id: uId,
            name: uPart?.name || individualNames[uId] || 'Understudy'
          };
        })()
      };
    }).filter(Boolean);
  }, [columnDefinitions, individualNames]);

  const relationshipData = useMemo(() => getRelationshipData(), [getRelationshipData]);


  const handleViewDocuments = (documents: any[], docInfo: any, column: any) => {
    if (!documents || documents.length === 0) return;

    const previewData = {
      documents: documents.map(d => ({
        ...d,
        id: d.id,
        extracted_details: d.extracted_details || {},
        edited_details: d.edited_details || d.extracted_details || {},
        file_path: d.file_path || d.url || d.document_url,
        file_name: d.file_name || d.name || 'document.pdf',
      })),
      document_display_name: docInfo?.display_name || 'Document',
      person_full_name: column?.label || '',
      document_fields: docInfo?.fields || []
    };

    setPreviewingDocuments(previewData);
    setShowPreviewModal(true);
  };

  const handlePreviewDataChange = useCallback((docId, fieldName, value) => {
    setPreviewingDocuments(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        documents: prev.documents.map(d =>
          d.id === docId ? { ...d, edited_details: { ...d.edited_details, [fieldName]: value } } : d
        ),
      };
    });
  }, []);

  const toggleSectionExpansion = (section: 'company' | 'individual' | 'letters') => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const allReferences = useMemo(() => {
    const referencesMap = new Map();
    filteredGroupedTasks.forEach(group => {
      group.tasks.forEach(task => {
        if (Array.isArray(task.references)) {
          task.references.forEach(ref => {
            if (ref.id && !referencesMap.has(ref.id)) {
              referencesMap.set(ref.id, { id: ref.id, name: ref.name || individualNames[ref.id] || `Reference ${ref.id}`, member: ref.member || ref.id });
            }
          });
        }
      });
    });
    return Array.from(referencesMap.values());
  }, [filteredGroupedTasks, individualNames]);

  const handleExportChecklist = () => {
    const worksheetData: any[] = [];
    const headers = ["#", "Requirement"];

    filteredGroupedTasks.forEach(group => {
      const companyId = group.tasks[0]?.company_id;
      const company = companyId ? companyData[companyId] : null;
      headers.push(company ? company.company_name : "Company");
      const principal = group.tasks[0]?.participants_details?.find(p =>
        (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
      );
      const principalId = principal?.id || group.tasks[0]?.individual_id;
      headers.push(principal?.name || individualNames[principalId] || "Principal");
      (group.dependantIds || []).forEach((id, index) => headers.push(individualNames[id] || `Dependant ${index + 1}`));
      if (group.tasks.some(task => task.class_id === CLASS_D_ID)) headers.push("Understudy");
    });
    if (hasReferencesColumn) allReferences.forEach(ref => headers.push(ref.name));

    worksheetData.push(headers);
    worksheetData.push(["Company Documents", ...Array(headers.length - 1).fill("")]);
    organizedRequirements.documents.company
      .sort((a, b) => (a.document.custom_order || 999) - (b.document.custom_order || 999))
      .forEach((docItem, index) => worksheetData.push([`${index + 1}.`, docItem.document.display_name, ...Array(headers.length - 2).fill(" ")]));

    worksheetData.push(["Individual Documents", ...Array(headers.length - 1).fill("")]);
    organizedRequirements.documents.individual
      .sort((a, b) => (a.document.custom_order || 999) - (b.document.custom_order || 999))
      .forEach((docItem, index) => worksheetData.push([`${index + 1}.`, docItem.document.display_name, ...Array(headers.length - 2).fill(" ")]));

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Requirements Checklist");
    XLSX.writeFile(workbook, "Requirements_Checklist.xlsx");
  };

  const handleExportData = () => {
    const worksheetData: any[] = [];
    const headers = ["#", "Requirement"];
    const entityColumns: { type: string, id?: number, name: string, groupIndex: number }[] = [];

    filteredGroupedTasks.forEach((group, groupIndex) => {
      const companyId = group.tasks[0]?.company_id;
      const company = companyId ? companyData[companyId] : null;
      headers.push(company ? company.company_name : `Company (Group ${groupIndex + 1})`);
      entityColumns.push({ type: 'company', name: 'company', groupIndex });

      const participants = group.tasks[0]?.participants_details || [];
      const principal = participants.find(p =>
        (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
      );
      const understudy = participants.find(p =>
        (Array.isArray(p.role) ? p.role.includes('understudy') : p.role === 'understudy')
      );
      const principalId = principal?.id || null;
      const understudyId = understudy?.id || null;

      headers.push(individualNames[principalId] || `Principal (Group ${groupIndex + 1})`);
      entityColumns.push({ type: 'principal', name: 'principal', groupIndex });
      (group.dependantIds || []).forEach((id, depIndex) => {
        headers.push(individualNames[id] || `Dependant ${depIndex + 1} (Group ${groupIndex + 1})`);
        entityColumns.push({ type: 'dependant', id, name: 'dependant', groupIndex });
      });
      if (group.tasks.some(task => task.class_id === CLASS_D_ID)) {
        headers.push(individualNames[understudyId] || `Understudy (Group ${groupIndex + 1})`);
        entityColumns.push({ type: 'understudy', name: 'understudy', groupIndex });
      }
    });
    if (hasReferencesColumn) {
      allReferences.forEach(ref => {
        headers.push(ref.name);
        entityColumns.push({ type: 'reference', id: ref.member, name: 'reference', groupIndex: 0 });
      });
    }
    worksheetData.push(headers);

    const processDocuments = (docType: string, documents: any[]) => {
      worksheetData.push([`${docType} Documents`, ...Array(headers.length - 1).fill("")]);
      documents
        .sort((a, b) => (a.order || 999) - (b.order || 999))
        .forEach((reqItem, index) => {
          const docDef = reqItem.documentDefinition;
          const row = [`${index + 1}.`, docDef?.display_name || docDef?.name || reqItem.name];
          entityColumns.forEach(col => {
            const task = filteredGroupedTasks[col.groupIndex]?.tasks[0];
            row.push(task ? getDocumentStatusText(task, docDef, col.type, col.id) : "N/A");
          });
          worksheetData.push(row);
        });
    };

    processDocuments("Company", organizedRequirements.documents.company);
    processDocuments("Individual", organizedRequirements.documents.individual);

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Requirements Data");
    XLSX.writeFile(workbook, "Requirements_Data_Export.xlsx");
  };

  const handleGenerateTemplate = async (reqItem: any, task: any, columnType: string, columnId?: number) => {
    const docItem = {
      document: {
        id: reqItem.kyc_document_ids?.[0] || reqItem.id,
        display_name: reqItem.documentDefinition?.display_name || reqItem.name,
        name: reqItem.documentDefinition?.name || reqItem.name
      }
    };

    await handleOpenTemplateGenerator(docItem, task, columnType, columnId);
  };

  const getDocumentDataForPreview = useCallback((task: any, reqItem: any, columnType: string, entityId?: number) => {
    if (!reqItem) return null;

    const kycDocIds = reqItem.kyc_document_ids || (reqItem.kyc_document_id ? [reqItem.kyc_document_id] : []);
    if (kycDocIds.length === 0) return null;

    if (columnType === 'company') {
      const companyId = task.participants_details?.find(p => p.type === 'company')?.id || task.company_id;
      const companyDocs = allCompanyDocuments[companyId] || [];
      return companyDocs.find(doc => kycDocIds.includes(doc.kyc_document_id));
    } else {
      const individualId = entityId || task.applicant_details?.id || task.individual_id;
      const indDocs = allIndividualDocuments[individualId] || [];
      return indDocs.find(doc => kycDocIds.includes(doc.document_id));
    }
  }, [allCompanyDocuments, allIndividualDocuments]);

  const getDocumentStatusText = useCallback((task: any, docItem: any, columnType: string, entityId?: number) => {
    const reqItem = {
      kyc_document_ids: [docItem.id],
      kyc_document_id: docItem.id
    };

    const docData = getDocumentDataForPreview(task, reqItem, columnType, entityId);
    return docData ? 'Uploaded' : 'Missing';
  }, [getDocumentDataForPreview]);

  const getCompositeRequirementStatus = useCallback((reqItem: any, task: any, columnType: string, entityId?: number) => {
    const cacheKey = `${task.id}-${reqItem.id || reqItem.uniqueId}-${columnType}-${entityId}`;

    // 1. Check cache first
    if (compositeStatusCache.has(cacheKey)) {
      return compositeStatusCache.get(cacheKey);
    }

    const kycDocIds = reqItem.kyc_document_ids || [];
    if (kycDocIds.length === 0) return { type: 'missing', count: 0, total: 0, latestStatus: null };

    const personId = columnType === 'company' ? (task.company_id || task.participants_details?.find(p => p.type === 'company')?.id) :
      (columnType === 'principal' || columnType === 'director') ? (task.individual_id || task.applicant_details?.id) :
        entityId;

    let latestDoc = null;
    let latestDocId = null;

    const docsToSearch = columnType === 'company'
      ? (allCompanyDocuments[personId] || [])
      : (allIndividualDocuments[personId] || []);

    kycDocIds.forEach(docId => {
      const matchingDocs = docsToSearch.filter(d => (d.kyc_document_id === docId || d.document_id === docId));
      if (matchingDocs.length > 0) {
        const mostRecent = matchingDocs.reduce((prev, curr) =>
          (new Date(curr.created_at) > new Date(prev.created_at)) ? curr : prev
        );
        if (!latestDoc || new Date(mostRecent.created_at) > new Date(latestDoc.created_at)) {
          latestDoc = mostRecent;
          latestDocId = docId;
        }
      }
    });

    const foundCount = kycDocIds.filter(docId =>
      docsToSearch.some(d => (d.kyc_document_id === docId || d.document_id === docId))
    ).length;

    let latestStatus = null;
    if (latestDocId) {
      const statusKey = `${task.id}-${latestDocId}-${columnType}-${personId}`;
      latestStatus = documentStatusCache.get(statusKey);
    }

    const result = {
      type: foundCount > 0 ? 'uploaded' : 'missing',
      count: foundCount,
      total: kycDocIds.length,
      latestStatus: latestStatus || (latestDocId ? { status: 'loading', label: 'Loading...', color: 'text-gray-400', bgColor: 'bg-gray-50' } : null)
    };

    // Cache the result for the next render if we have meaningful data
    if (result.latestStatus?.status !== 'loading') {
      setTimeout(() => {
        setCompositeStatusCache(prev => {
          // Prevent unnecessary state updates if already cached correctly
          if (prev.get(cacheKey)?.latestStatus?.status === result.latestStatus?.status) return prev;
          return new Map(prev.set(cacheKey, result));
        });
      }, 0);
    }

    return result;
  }, [allCompanyDocuments, allIndividualDocuments, documentStatusCache, compositeStatusCache]);
  // NEW: Get documents by type for composite requirements
  const getDocumentsByType = useCallback((docTypeId: string, task: any, columnType: string, entityId?: number) => {
    if (columnType === 'company') {
      const companyId = task.participants_details?.find(p => p.type === 'company')?.id || task.company_id;
      const companyDocs = allCompanyDocuments[companyId] || [];
      return companyDocs.filter(doc => doc.kyc_document_id === docTypeId);
    } else {
      const individualId = entityId || task.applicant_details?.id || task.individual_id;
      const indDocs = allIndividualDocuments[individualId] || [];
      return indDocs.filter(doc => doc.document_id === docTypeId);
    }
  }, [allCompanyDocuments, allIndividualDocuments]);

  // Helper function to render status icon and badge
  const renderStatusBadge = (status: any) => {
    if (!status) return null;

    let Icon;
    switch (status.status) {
      case 'valid':
        Icon = CheckCircle2;
        break;
      case 'expiring':
        Icon = AlertCircle;
        break;
      case 'expired':
        Icon = XCircle;
        break;
      default:
        Icon = Calendar;
    }

    return (
      <div className="flex flex-col items-center gap-1">
        <div className={`flex items-center gap-1 px-2 py-1 rounded-md ${status.bgColor}`}>
          <Icon className={`h-3 w-3 ${status.color}`} />
          <span className={`text-[10px] font-semibold ${status.color}`}>
            {status.label}
          </span>
        </div>
        {status.expiryDate && (
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded ${status.bgColor}`}>
            <Calendar className={`h-2.5 w-2.5 ${status.color}`} />
            <span className={`text-[9px] ${status.color}`}>
              {status.expiryDate}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderDocumentSection = (requirementsList: any[], sectionName: string) => {
    // Group requirements by category
    const groupedByCategory = requirementsList
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .reduce((groups, reqItem) => {
        const category = reqItem.category || 'general';
        if (!groups[category]) {
          groups[category] = [];
        }
        groups[category].push(reqItem);
        return groups;
      }, {} as Record<string, any[]>);

    return Object.entries(groupedByCategory).map(([category, categoryReqs], categoryIndex) => (
      <React.Fragment key={`${sectionName}-${category}`}>
        {/* Category Header */}
        {Object.keys(groupedByCategory).length > 1 && (
          <TableRow className="bg-blue-50/50 border-b">
            <TableCell colSpan={totalColumns} className="py-2 px-4 font-semibold text-blue-700 text-xs uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                {/* Clean up labels dynamically */}
                {category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Requirements
                <span className="text-blue-500 font-normal ml-1">({categoryReqs.length})</span>
              </div>
            </TableCell>
          </TableRow>
        )}

        {/* Category Requirements */}
        {categoryReqs.map((reqItem, reqIndex) => {
          const requirementId = reqItem.uniqueId || reqItem.id;
          const isExpanded = expandedDocuments.has(requirementId);
          const isCompositeExpanded = expandedCompositeRequirements.has(requirementId);

          const docDef = reqItem.documentDefinition;
          const fieldsToRender = docDef?.fields || [];

          // Check if this is a composite requirement (multiple document types)
          const isComposite = reqItem.isMultiDocument && reqItem.kyc_document_ids?.length > 1;

          return (
            <React.Fragment key={`${sectionName}-${category}-${requirementId}`}>
              <TableRow className={`group hover:bg-gray-50 ${reqIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                <TableCell className={`sticky left-0 border-r z-10 text-center ${reqIndex % 2 === 0 ? 'bg-white group-hover:bg-gray-50' : 'bg-gray-50/30 group-hover:bg-gray-100'}`}>
                  {reqIndex + 1}
                </TableCell>
                <TableCell className={`sticky left-16 border-r z-10 ${reqIndex % 2 === 0 ? 'bg-white group-hover:bg-gray-50' : 'bg-gray-50/30 group-hover:bg-gray-100'}`}>
                  <div className="flex flex-col">
                    <div className="flex justify-between items-center gap-2">
                      <span className="truncate max-w-[250px] font-medium text-slate-700">
                        {reqItem.name}
                      </span>
                      {/* Computed Function Badge */}
                      {reqItem.computed_function && reqItem.computed_function !== 'none' && (
                        (() => {
                          const functionItem = COMPUTED_FUNCTIONS.find(fn => fn.value === reqItem.computed_function);
                          return functionItem ? (
                            <Badge variant="outline" className="text-[8px] px-1.5 py-0.5 ml-2" title={`Function: ${functionItem.label}`}>
                              {functionItem.label}
                            </Badge>
                          ) : null;
                        })()
                      )}
                      <div className="flex">
                        {isComposite && (
                          <Badge variant="solid" color="blue" className="ml-2">
                            {reqItem.documentCount}
                          </Badge>
                        )}
                        {!isComposite && fieldsToRender.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleDocumentExpansion(requirementId)}>
                            {isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                          </Button>
                        )}
                        {isComposite && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleCompositeRequirement(requirementId)}
                          >
                            {isCompositeExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Template and Automation Indicators */}
                    <div className="flex items-center gap-2 mt-1">
                      {reqItem.hasTemplate && (
                        <div className="flex items-center gap-1 text-orange-600" title="Has Template">
                          <FileType className="h-3 w-3 fill-current" />
                          <span className="text-[9px] font-medium">Template</span>
                        </div>
                      )}

                      {reqItem.web_automation?.automationId && (
                        <div className="flex items-center gap-1 text-blue-600" title={`Web Form: ${reqItem.web_automation.automationName}`}>
                          <Zap className="h-3 w-3 fill-current" />
                          <span className="text-[9px] font-medium truncate max-w-[100px]">{reqItem.web_automation.automationName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>

                {columnDefinitions.map((col, colIdx) => {
                  const isApplicable = checkApplicability(col.type, reqItem);
                  const groupRelationshipData = relationshipData[col.groupIndex];

                  if (!isApplicable) {
                    return (
                      <TableCell key={`${requirementId}-col-${colIdx}`} className="text-center border p-2">
                        <span className="text-[10px] text-gray-300 font-medium italic">N/A</span>
                      </TableCell>
                    );
                  }

                  // For composite requirements, show aggregated status
                  if (isComposite) {
                    const cacheKey = `${col.task.id}-${reqItem.id || reqItem.uniqueId}-${col.type}-${col.id}`;
                    const compositeStatus = compositeStatusCache.get(cacheKey);

                    // Get status (this will return a loading state if not yet in cache)
                    const statusToDisplay = compositeStatus || getCompositeRequirementStatus(reqItem, col.task, col.type, col.id);

                    return (
                      <TableCell key={`${requirementId}-col-${colIdx}`} className="text-center border p-2">
                        <div className="flex flex-col items-center justify-center gap-1">
                          {reqItem.hasTemplate && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                              onClick={() => handleGenerateTemplate(reqItem, col.task, col.type, col.id)}
                              title={`Generate ${reqItem.name} Template`}
                              disabled={isPreparingTemplate}
                            >
                              {isPreparingTemplate ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
                              <span className="text-[10px] font-bold uppercase">Generate</span>
                            </Button>
                          )}

                          <div className="flex items-center gap-3">
                            {statusToDisplay ? (
                              <>
                                {statusToDisplay.latestStatus ? (
                                  <div className="flex items-center gap-2">
                                    {renderStatusBadge(statusToDisplay.latestStatus)}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                      onClick={() => {
                                        const latestDocId = reqItem.kyc_document_ids?.find((docId: string) => {
                                          const docs = col.type === 'company'
                                            ? allCompanyDocuments[col.task.company_id || col.task.participants_details?.find((p: any) => p.type === 'company')?.id]?.filter(doc => doc.kyc_document_id === docId)
                                            : allIndividualDocuments[col.task.individual_id || col.task.applicant_details?.id || col.id]?.filter(doc => doc.document_id === docId);
                                          return docs && docs.length > 0;
                                        });
                                        if (latestDocId) {
                                          const docs = col.type === 'company'
                                            ? allCompanyDocuments[col.task.company_id || col.task.participants_details?.find((p: any) => p.type === 'company')?.id]?.filter(doc => doc.kyc_document_id === latestDocId)
                                            : allIndividualDocuments[col.task.individual_id || col.task.applicant_details?.id || col.id]?.filter(doc => doc.document_id === latestDocId);
                                          if (docs && docs.length > 0) {
                                            setPreviewingDocuments(docs);
                                            setShowPreviewModal(true);
                                          }
                                        }
                                      }}
                                      title="Preview Latest Document"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-amber-600 font-bold uppercase">
                                    {statusToDisplay.type === 'missing' ? 'Missing' : 'No Status'}
                                  </span>
                                )}
                              </>
                            ) : (
                              <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse" title="Checking status..." />
                            )}
                          </div>
                        </div>
                      </TableCell>
                    );
                  }

                  // For non-composite requirements, use existing logic
                  return (
                    <TableCell key={`${requirementId}-col-${colIdx}`} className="text-center border p-2">
                      <div className="flex items-center justify-center gap-1">
                        {reqItem.hasTemplate && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                            onClick={() => handleGenerateTemplate(reqItem, col.task, col.type, col.id)}
                            title={`Generate ${reqItem.documentDefinition?.display_name || reqItem.name} Template`}
                            disabled={isPreparingTemplate}
                          >
                            {isPreparingTemplate ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
                            <span className="text-[10px] font-bold uppercase">Generate</span>
                          </Button>
                        )}

                        {renderDocumentStatus(col.task, reqItem, col.type, col.id, groupRelationshipData)}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>

              {/* Expanded view for composite requirements showing individual document types */}
              {isComposite && isCompositeExpanded && reqItem.kyc_document_ids?.map((docId: string, docIdx: number) => {
                const docMetadata = documentMetadataCache.get(docId);
                if (!docMetadata) return null;

                return (
                  <TableRow key={`${requirementId}-doctype-${docIdx}`} className="bg-blue-50/30">
                    <TableCell className="sticky left-0 border-r text-center text-[10px] text-gray-400 bg-blue-50/30">
                      {reqIndex + 1}.{docIdx + 1}
                    </TableCell>
                    <TableCell className="sticky left-16 bg-blue-50/50 border-r pl-8">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3 text-blue-600" />
                        <span className="text-[11px] text-slate-700 font-medium">
                          {docMetadata.display_name || docMetadata.name}
                        </span>
                      </div>
                    </TableCell>
                    {columnDefinitions.map((col, colIdx) => {
                      const isApplicable = checkApplicability(col.type, reqItem);
                      if (!isApplicable) {
                        return (
                          <TableCell key={`${docId}-col-${colIdx}`} className="text-center border p-1">
                            <span className="text-[10px] text-gray-300">-</span>
                          </TableCell>
                        );
                      }

                      const docs = getDocumentsByType(docId, col.task, col.type, col.id);

                      return (
                        <TableCell key={`${docId}-col-${colIdx}`} className="text-center border p-1">
                          <div className="flex items-center justify-center gap-1">
                            {docs.length > 0 ? (
                              <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-green-600 hover:bg-green-100"
                                    onClick={() => handleViewDocuments(docs, docMetadata, col)}
                                    title={`View ${docs.length} document(s)`}
                                  >
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                  {docs.length > 1 && (
                                    <span className="text-[9px] text-green-600 font-bold">{docs.length}</span>
                                  )}
                                </div>

                                {/* Document Status Badge */}
                                {(() => {
                                  const personId = col.type === 'company' ? col.task.company_id :
                                    (col.type === 'principal' || col.type === 'director') ? col.task.individual_id :
                                      col.id;
                                  const statusKey = `${col.task.id}-${docId}-${col.type}-${personId}`;

                                  // Trigger status calculation and show loading state initially
                                  if (!documentStatusCache.has(statusKey)) {
                                    getDocumentStatus(col.task, docId, col.type, personId);
                                    return (
                                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse" title="Checking status..." />
                                    );
                                  }

                                  const status = documentStatusCache.get(statusKey);
                                  return status ? renderStatusBadge(status) : null;
                                })()}
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-amber-600 hover:bg-amber-50"
                                onClick={() => {
                                  // Trigger upload for this specific document type
                                  setSelectedDocForUpload({
                                    doc: docMetadata,
                                    fields: docMetadata.fields,
                                    person: { full_name: col.label },
                                    task: col.task,
                                    columnType: col.type,
                                    columnId: col.id
                                  });
                                  setShowUploadModal(true);
                                }}
                                title={`Upload ${docMetadata.display_name || docMetadata.name}`}
                              >
                                <UploadCloud className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}

              {/* Expanded Field Data Rows (for non-composite or when not showing document types) */}
              {!isComposite && isExpanded && fieldsToRender.map((field, fIdx) => (
                <TableRow key={`${requirementId}-field-${field.id}`} className={`${reqIndex % 2 === 0 ? 'bg-slate-50/50' : 'bg-slate-100/50'}`}>
                  <TableCell className={`sticky left-0 border-r text-center text-[10px] text-gray-400 ${reqIndex % 2 === 0 ? 'bg-slate-50/50' : 'bg-slate-100/50'}`}>
                    {reqIndex + 1}.{fIdx + 1}
                  </TableCell>
                  <TableCell className="sticky left-16 bg-slate-50 border-r pl-8 text-[11px] text-slate-500 italic">
                    {field.name}
                  </TableCell>
                  {columnDefinitions.map((col, colIdx) => {
                    const isApplicable = checkApplicability(col.type, reqItem);
                    const docData = isApplicable ? getDocumentDataForPreview(col.task, reqItem, col.type, col.id) : null;
                    return (
                      <TableCell key={`${field.id}-val-${colIdx}`} className="text-center border p-1 text-[11px] text-slate-600">
                        {isApplicable ? (() => {
                          const val = docData?.extracted_details?.[field.name];
                          if (val === null || val === undefined) return '-';
                          if (typeof val === 'object') return JSON.stringify(val); // Prevents "Objects are not valid as React child"
                          return String(val);
                        })() : '-'}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </React.Fragment>
          );
        })}
      </React.Fragment>
    ));
  };

  const checkForDraft = useCallback((docItem: any, task: any, colType: string, colId?: number): any => {
    const requiredDocId = docItem.id;

    if (colType === 'company') {
      if (task.company_id && allCompanyDocuments[task.company_id]) {
        const draft = allCompanyDocuments[task.company_id].find(
          doc => (doc.kyc_document_id === requiredDocId || doc.document_id === requiredDocId) &&
            doc.status === 'draft'
        );
        return draft;
      }
    } else {
      let individualId: number | null = null;
      if (colType === 'principal') individualId = task.principal_member || task.individual_id;
      else if (colType === 'understudy') individualId = task.understudy_member;
      else if (colType === 'dependant' || colType === 'reference' || colType === 'director') individualId = colId;

      if (individualId && allIndividualDocuments[individualId]) {
        const draft = allIndividualDocuments[individualId].find(
          doc => (doc.document_id === requiredDocId || doc.kyc_document_id === requiredDocId) &&
            doc.status === 'draft'
        );
        return draft;
      }
    }

    return null;
  }, [allCompanyDocuments, allIndividualDocuments]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExportChecklist}>
              <FileText className="mr-2 h-4 w-4" /> Export Requirements Checklist
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportData}>
              <FileUp className="mr-2 h-4 w-4" /> Export Data
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <StageUploadDialog open={isStageDialogOpen} onOpenChange={setIsStageDialogOpen} selectedStageTask={selectedStageTask} getCurrentRequirements={getCurrentRequirements} fuzzyMatch={fuzzyMatch} />

      {/* MODALS */}
      {showUploadModal && (
        <UploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onUpload={handleUploadSubmit}
          documentName={selectedDocForUpload?.doc?.display_name || 'KEP Document'}
          documentFields={selectedDocForUpload?.fields}
          entityName={selectedDocForUpload?.person?.full_name}
          selectedDoc={selectedDocForUpload?.doc}
          selectedMember={selectedDocForUpload?.person}
          isAllKepUpload={selectedDocForUpload?.isAllKepUpload}
          allDocumentTypes={documentTypes}
          mainTab={mainTab}
        />
      )}

      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] flex flex-col p-0 overflow-hidden bg-slate-50">
          {showPreviewModal && previewingDocuments && (
            <>
              <DialogHeader className="p-4 border-b bg-white shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-xl">
                      {previewingDocuments?.document_display_name || 'Document Preview'}
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">
                      Target: {previewingDocuments?.person_full_name || 'Unknown'}
                    </p>
                  </div>
                  <div className="text-sm font-medium bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-100">
                    {previewingDocuments?.documents?.length || 0} File(s)
                  </div>
                </div>
                <DialogDescription className="sr-only">
                  Document extraction and verification interface.
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-10 max-w-[1600px] mx-auto">
                  {previewingDocuments?.documents?.map((doc, index) => {
                    const docId = doc.id || `doc-${index}`;

                    return (
                      <div key={docId} className="group relative border rounded-2xl bg-white shadow-xl overflow-hidden transition-all hover:shadow-2xl">
                        <div className="p-4 bg-slate-50 border-b flex justify-between items-center sticky top-0 z-20">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center"> <div className="bg-white p-2 rounded-lg border shadow-sm">
                              <FileText className="h-5 w-5 text-blue-600" />
                            </div>
                              <div className="flex flex-col">
                                <p className="text-sm font-bold text-slate-800 line-clamp-1">{previewingDocuments?.document_display_name || 'Document'}</p>
                              </div></div>
                            <div className="text-xs text-slate-600">
                              {`${index + 1}/${previewingDocuments?.documents?.length || 0}`}
                            </div>
                          </div>
                        </div>

                        <div className="p-0 lg:p-4">
                          <ExtractionPreview
                            key={docId}
                            documentId={docId}
                            documentName={previewingDocuments?.document_display_name || 'Document'}
                            extractedData={doc.edited_details || doc.extracted_details || {}}
                            fields={previewingDocuments?.document_fields || []}
                            fileUrl={getFileUrl(doc.file_path)}
                            fileName={doc.file_name || 'document.pdf'}
                            expanded={true}
                            showSaveButton={false}
                            onDelete={() => handleDeleteDocument?.(doc)}
                            onSave={(data) => handleSaveEditedDocument?.({ ...doc, edited_details: data })}
                            onRetryExtraction={() => handleRetryExtraction?.(doc)}
                            onDataChange={(fieldName, value) => {
                              handlePreviewDataChange(docId, fieldName, value);
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 border-t bg-white flex justify-end shrink-0">
                <Button variant="outline" onClick={() => setShowPreviewModal(false)} className="w-24">
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="rounded-md border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[75vh]">
          <Table className="border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-20">
              <TableRow className="h-20 bg-blue-600">
                <TableHead className="sticky left-0 bg-blue-700 text-white w-16 border-r border-blue-500 text-center z-30 font-bold">#</TableHead>
                <TableHead className="sticky left-16 bg-blue-700 text-white w-[300px] border-r border-blue-500 z-30 font-bold">Requirement Mapping</TableHead>
                {columnDefinitions.map((col, idx) => {
                  let bgColor = 'bg-blue-600';
                  let Icon = User;

                  if (col.type === 'company') {
                    bgColor = 'bg-slate-700';
                    Icon = Briefcase;
                  } else if (col.type === 'director') {
                    bgColor = 'bg-indigo-600';
                    Icon = UserCheck;
                  } else if (col.type === 'dependant') {
                    bgColor = 'bg-blue-500';
                    Icon = Users2;
                  } else if (col.type === 'principal') {
                    bgColor = 'bg-blue-700';
                    Icon = UserCheck;
                  }

                  return (
                    <TableHead
                      key={`header-${idx}`}
                      className={`${bgColor} text-white border-r border-white/10 min-w-[180px] p-2 text-center transition-colors`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <Icon className="h-4 w-4 opacity-70 mb-1" />
                        <span className="text-[11px] font-bold uppercase line-clamp-1 px-1">
                          {col.label}
                        </span>
                        <div className="flex justify-between items-center gap-6">
                          <span className="text-[9px] bg-black/20 rounded px-1.5 py-0.5 font-medium tracking-wider">
                            {col.subLabel}
                          </span>
                          {col.role && (
                            <span className="text-[8px] bg-blue-900/20 text-white rounded px-1.5 py-0.5 font-medium tracking-wider">
                              {Array.isArray(col.role) ? col.role.join(', ') : col.role}
                            </span>
                          )}
                          {col.type === 'principal' && (() => {
                            const dependants = filteredGroupedTasks[col.groupIndex]?.tasks?.[0]?.participants_details?.filter(p =>
                              p.type === 'individual' && (
                                Array.isArray(p.role) ? p.role.includes('dependant') : p.role === 'dependant'
                              )
                            ) || [];
                            if (dependants.length > 0) {
                              const isExpanded = expandedDependants.has(col.groupIndex);
                              return (
                                <div className="flex items-center gap-1">
                                  {!isExpanded && (
                                    <span className="text-[10px] bg-amber-500 text-white rounded-full px-2.5 py-0.5 font-bold">
                                      {dependants.length}
                                    </span>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => toggleDependants(col.groupIndex)}
                                    className="h-6 w-6 p-0 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20"
                                    title={`${isExpanded ? 'Hide' : 'Show'} ${dependants.length} dependant(s)`}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-3 w-3" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={totalColumns} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" /></TableCell></TableRow>
              ) : (
                <>
                  <TableRow className="bg-slate-100 hover:bg-slate-200 cursor-pointer" onClick={() => toggleSectionExpansion('company')}>
                    <TableCell colSpan={totalColumns} className="py-2 px-4 font-bold text-slate-700 uppercase text-xs tracking-wider">
                      <div className="flex items-center gap-2">
                        {expandedSections.company ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />} Company Requirements
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedSections.company && renderDocumentSection(organizedRequirements.documents.company, 'company')}

                  <TableRow className="bg-slate-100 hover:bg-slate-200 cursor-pointer" onClick={() => toggleSectionExpansion('individual')}>
                    <TableCell colSpan={totalColumns} className="py-2 px-4 font-bold text-slate-700 border-t-2 border-white uppercase text-xs tracking-wider">
                      <div className="flex items-center gap-2">
                        {expandedSections.individual ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />} Individual Requirements
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedSections.individual && renderDocumentSection(organizedRequirements.documents.individual, 'individual')}

                  <TableRow className="bg-slate-100 hover:bg-slate-200 cursor-pointer" onClick={() => toggleSectionExpansion('templates')}>
                    <TableCell colSpan={totalColumns} className="py-2 px-4 font-bold text-slate-700 border-t-2 border-white uppercase text-xs tracking-wider">
                      <div className="flex items-center gap-2">
                        {expandedSections.templates ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />} Automations and Templates
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedSections.templates && renderDocumentSection([ ...organizedRequirements.documents.automations,...organizedRequirements.documents.templates], 'templates')}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {showTemplateGenerator && selectedLetterInfo && (
        <TemplateGenerationDialog isOpen={showTemplateGenerator} onClose={() => setShowTemplateGenerator(false)} template={selectedLetterInfo.template} availableTemplates={selectedLetterInfo.availableTemplates} documentName={selectedLetterInfo.document.display_name} onSave={handleSaveGeneratedLetter} masterFields={selectedLetterInfo.masterFields} entityIdMap={selectedLetterInfo.entityIdMap} sourceDataCache={selectedLetterInfo.sourceDataCache} extractedData={selectedLetterInfo.extractedData} personData={selectedLetterInfo.personData} companyData={selectedLetterInfo.companyData} relationshipData={selectedLetterInfo.relationshipData} />
      )}
    </div >
  );
}