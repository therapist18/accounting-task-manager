// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, Briefcase, Users, Plus, Minus, UserCheck, Loader2, Download, FileText, FileUp, Trash2, RefreshCw, Wand2, Save, ChevronDown, ChevronRight, Users2, User, Building2, Zap, FileType, UploadCloud, Eye, Calendar, CheckCircle2, XCircle, AlertCircle, Heart, HeartPulse } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { ExtractionPreview } from "@/components/ExtractionPreview"
import supabase from "@/lib/supabase/client"
import { COMPUTED_FUNCTIONS } from "@/lib/constants/computed-functions"
import { performExtraction } from "@/lib/extractionUtils"
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
import { ENTITY_TYPES, type EntityType } from "@/lib/constants/entity-types"
import { UploadModal } from "@/app/generic-components/UploadModal"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

// Helper functions for entity type styling and checking
const getEntityTypeConfig = (type: string) => {
  const entityConfig = ENTITY_TYPES.find(et => et.value === type);
  if (!entityConfig) return { bgColor: 'bg-blue-600', Icon: User };

  switch (type) {
    case 'company':
      return { bgColor: 'bg-slate-700', Icon: Briefcase };
    case 'director':
      return { bgColor: 'bg-indigo-600', Icon: UserCheck };
    case 'dependant':
      return { bgColor: 'bg-blue-500', Icon: Users2 };
    case 'principal':
      return { bgColor: 'bg-blue-700', Icon: UserCheck };
    case 'sponsor':
      return { bgColor: 'bg-green-600', Icon: HeartPulse };
    default:
      return { bgColor: 'bg-blue-600', Icon: User };
  }
};

const isCompanyType = (type: string) => type === 'company';
const isIndividualType = (type: string) => ['principal', 'director', 'understudy'].includes(type);
const isPrincipalType = (type: string) => type === 'principal';

const generateDocxBlobFromHtml = async (html: string) => {
  if (!htmlDocx) {
    throw new Error('html-docx-js is not loaded yet');
  }
  return htmlDocx.asBlob(html);
};

const CLASS_D_ID = '1750687058159';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PERMIT_CLASS_OPTIONS = [
  { value: 'class_a', label: 'Class A' },
  { value: 'class_b', label: 'Class B' },
  { value: 'class_c', label: 'Class C' },
  { value: 'class_d', label: 'Class D' },
  { value: 'class_e', label: 'Class E' },
];

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

export default function RequirementsTableCombined({ loading, error, filteredGroupedTasks, organizedRequirements, classRequirements, expandedDocuments, onSaveDocument, onSave, toggleDocumentExpansion, renderDocumentStatus, renderClientFieldData, renderReferencesData, hasReferencesColumn, individualNames, companyData, getCurrentRequirements, fuzzyMatch, kycDocuments, documentTypes, mainTab, handleUploadSubmit, handleDeleteDocument, handleRetryExtraction, documentTemplates, allIndividualDocuments, allCompanyDocuments, searchQuery = "", refreshDocuments, jobLevel, }: any) {
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
  const [documentMetadataCache, setDocumentMetadataCache] = useState<Map<string, any>>(new Map());
  const [documentStatusCache, setDocumentStatusCache] = useState<Map<string, any>>(new Map());
  const [compositeStatusCache, setCompositeStatusCache] = useState<Map<string, any>>(new Map());

  const groupedRequirements = useMemo(() => {
    if (!organizedRequirements?.documents) return { general: [], processing: [], issuance: [], other: [] };
    const allReqs = [
      ...(organizedRequirements.documents.company || []),
      ...(organizedRequirements.documents.individual || []),
      ...(organizedRequirements.documents.templates || []),
      ...(organizedRequirements.documents.automations || [])
    ];
    const uniqueMap = new Map();
    allReqs.forEach(req => uniqueMap.set(req.uniqueId || req.id, req));
    const uniqueReqs = Array.from(uniqueMap.values());

    const groups = {
      general: [] as any[],
      processing: [] as any[],
      issuance: [] as any[],
      other: [] as any[]
    };
    const searchLower = searchQuery.toLowerCase().trim();
    uniqueReqs.forEach(req => {
      if (searchLower) {
        const searchableFields = [
          req.display_name,
          req.name,
          req.description,
          req.main_category,
          req.sub_category
        ].filter(Boolean);

        const matchesSearch = searchableFields.some(field =>
          field.toLowerCase().includes(searchLower)
        );
        if (!matchesSearch) return;
      }
      const cat = (req.category || 'processing').toLowerCase();
      if (cat === 'general') {
        groups.general.push(req);
      } else if (cat === 'processing') {
        groups.processing.push(req);
      } else if (cat === 'issuance') {
        groups.issuance.push(req);
      } else {
        groups.other.push(req);
      }
    });

    // 4. Sort each group by order
    Object.keys(groups).forEach(key => {
      groups[key as keyof typeof groups].sort((a, b) => (a.order || 0) - (b.order || 0));
    });

    return groups;
  }, [organizedRequirements, searchQuery]);

  const handleInternalRetryExtraction = async (doc: any, retryData: any) => {
    if (!doc?.file_path) {
      toast.error("No file available for extraction");
      return;
    }
    const toastId = toast.loading("Re-extracting data...");
    try {
      const docType = documentTypes?.find(dt => dt.id === doc.document_id);
      if (!docType?.fields) {
        toast.error("Document type not found or has no fields defined");
        return;
      }
      const fileUrl = getFileUrl(doc.file_path);
      const { extractedData, success } = await performExtraction(
        fileUrl,
        docType.fields,
        docType.display_name || docType.name,
        (progressMessage) => {
          toast.loading(progressMessage, { id: toastId });
        },
        doc.file_name || 'document.pdf'
      );
      if (!success) {
        throw new Error("Extraction service returned failure status");
      }
      if (onSaveDocument) {
        await onSaveDocument(doc, extractedData);
      } else if (onSave) {
        await onSave(doc, extractedData);
      }

      // Update the local Preview Modal state so the UI reflects changes immediately
      if (previewingDocuments) {
        setPreviewingDocuments(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            documents: prev.documents.map(d =>
              d.id === doc.id
                ? { ...d, edited_details: extractedData, extracted_details: extractedData }
                : d
            )
          };
        });
      }

      toast.success("Re-extraction completed successfully", { id: toastId });
      if (handleRetryExtraction) {
        await handleRetryExtraction(doc);
      }

    } catch (error) {
      toast.error(`Re-extraction failed: ${error.message}`, { id: toastId });
    }
  };

  const handleSaveEditedDocument = useCallback(async (doc: any, editedData?: any) => {
    // Bubble the save action to the parent logic
    if (onSaveDocument) {
      await onSaveDocument(doc, editedData);
    } else if (onSave) {
      // Fallback to generic onSave if passed
      await onSave(doc, editedData);
    }

    // Update the local Preview Modal state so the UI reflects changes immediately
    if (previewingDocuments) {
      setPreviewingDocuments(prev => {
        if (!prev) return prev;
        const dataToUpdate = editedData || doc.edited_details || {};
        return {
          ...prev,
          documents: prev.documents.map(d =>
            d.id === doc.id
              ? { ...d, edited_details: dataToUpdate, extracted_details: dataToUpdate }
              : d
          )
        };
      });
    }
  }, [onSaveDocument, onSave, previewingDocuments]);

  // Function to get document status with caching - now inside component
  const getDocumentStatus = async (task: any, docId: string, personType: string, personId: string, docObj?: any) => {
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

      // Get expiry date using computed function - pass the document if we already have it
      const expiryDate = await getLatestDocumentExpiryDate(personId, [docId], undefined, docObj ? { doc: docObj, type: docMetadata } : undefined);

      if (expiryDate.includes('Not Found')) {
        const result = { status: 'unknown', label: 'No Expiry', color: 'text-gray-400', bgColor: 'bg-gray-50' };
        setDocumentStatusCache(prev => new Map(prev.set(cacheKey, result)));
        return result;
      }

      const expiry = new Date(expiryDate);

      if (isNaN(expiry.getTime())) {
        console.error('[Date Bug] Invalid expiry date detected:', {
          expiryDate,
          rawExpiry: expiry,
          docId,
          personId,
          personType,
          taskName: task.title || task.id
        });

        const result = { status: 'unknown', label: 'No Expiry', color: 'text-gray-400', bgColor: 'bg-gray-50' };
        setDocumentStatusCache(prev => new Map(prev.set(cacheKey, result)));
        return result;
      }

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

  // Filter requirements based on computed functions and search query
  const filteredRequirements = useMemo(() => {
    if (!organizedRequirements.documents) return {};

    const filtered: any = {};
    const searchLower = searchQuery.toLowerCase().trim();

    Object.entries(organizedRequirements.documents).forEach(([key, reqList]: [string, any[]]) => {
      filtered[key] = reqList.filter(req => {
        // If no computed function or it's 'none', include it
        if (!req.computed_function || req.computed_function === 'none') {
          return true;
        }

        // Apply search filter if search query exists
        if (searchLower) {
          const searchableFields = [
            req.display_name,
            req.name,
            req.description,
            req.main_category,
            req.sub_category
          ].filter(Boolean);

          const matchesSearch = searchableFields.some(field =>
            field.toLowerCase().includes(searchLower)
          );

          if (!matchesSearch) {
            return false;
          }
        }

        return true;
      });
    });

    return filtered;
  }, [organizedRequirements, searchQuery]);

  const classDocsAndFields = useMemo(() => { return classRequirements?.[0]?.documents_and_fields || []; }, [classRequirements]);

  const checkApplicability = (colType: string, requirement: any, colRoles?: string[]) => {
    if (!requirement) return false;

    const typeMap: Record<string, string> = {
      'principal': 'principal',
      'director': 'director', // Keep as 'director' to match requirements that expect 'director'
      'company': 'company',
      'dependant': 'dependant',
      'understudy': 'understudy',
      'shareholder': 'shareholder',
      'sponsor': 'sponsor' // Add this line
    };
    const allowedTypes = requirement.entityTypes || (requirement.applicantType ? [requirement.applicantType] : []);

    // If column has multiple roles, check if document is applicable to ANY of them
    if (colRoles && colRoles.length > 0) {
      return colRoles.some(role => {
        const targetType = typeMap[role] || role;
        return allowedTypes.includes(targetType);
      });
    }

    // Fallback to single type check
    const targetType = typeMap[colType] || colType;
    return allowedTypes.includes(targetType);
  };

  const columnDefinitions = useMemo(() => {
    const cols = [];
    if (!filteredGroupedTasks) return cols;

    // Map to track all roles for each individual across all participants
    const individualRolesMap = new Map<number, Set<string>>();

    filteredGroupedTasks.forEach((group, groupIndex) => {
      const task = group.tasks?.[0];
      if (!task) return;

      const participants = task.participants_details || [];

      // Collect all roles for each individual
      participants.forEach(p => {
        if (p.type === 'individual' && p.id) {
          if (!individualRolesMap.has(p.id)) individualRolesMap.set(p.id, new Set());
          const roles = Array.isArray(p.role) ? p.role : (p.role ? [p.role] : []);
          roles.forEach(role => individualRolesMap.get(p.id).add(role));
        }
      });

      // Also check applicant_details
      const applicant = task.applicant_details || {};
      if (applicant.type === 'individual' && applicant.id) {
        if (!individualRolesMap.has(applicant.id)) individualRolesMap.set(applicant.id, new Set());
        const roles = Array.isArray(applicant.role) ? applicant.role : (applicant.role ? [applicant.role] : []);
        roles.forEach(role => individualRolesMap.get(applicant.id).add(role));
      }

      // Check understudy
      if (task.understudy) {
        if (!individualRolesMap.has(task.understudy)) individualRolesMap.set(task.understudy, new Set());
        individualRolesMap.get(task.understudy).add('understudy');
      }
    });

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
          // Determine the correct type based on the applicant's role
          let columnType = 'principal';
          let priority = 2;

          if (applicant.role) {
            const roles = Array.isArray(applicant.role) ? applicant.role : [applicant.role];

            if (roles.includes('dependant') || roles.includes('dependent')) {
              columnType = 'dependant';
              priority = 4;
            } else if (roles.includes('director') || roles.includes('shareholder')) {
              columnType = 'director';
              priority = 3;
            } else if (roles.includes('understudy')) {
              columnType = 'understudy';
              priority = 5;
            }
          }

          // Get all roles for this individual
          const allRoles = Array.from(individualRolesMap.get(applicant.id) || new Set());
          const primaryRole = columnType;

          groupCols.push({
            type: columnType,
            id: applicant.id,
            label: applicant.name,
            subLabel: primaryRole.toUpperCase(),
            roles: allRoles,
            task,
            groupIndex,
            priority
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
        const allRoles = Array.from(individualRolesMap.get(principalIndividual.id) || new Set());
        groupCols.push({
          type: 'principal',
          id: principalIndividual.id,
          label: principalIndividual.name,
          subLabel: 'PRINCIPAL',
          roles: allRoles,
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
          const allRoles = Array.from(individualRolesMap.get(d.id) || new Set());
          groupCols.push({
            type: 'director',
            id: d.id,
            label: d.name,
            subLabel: 'Director',
            roles: allRoles,
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
            const allRoles = Array.from(individualRolesMap.get(dep.id) || new Set());
            groupCols.push({
              type: 'dependant',
              id: dep.id,
              label: dep.name,
              subLabel: dep.relationship || 'Dependant',
              roles: allRoles,
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
            roles: Array.from(individualRolesMap.get(understudyParticipant.id) || new Set()),
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
            roles: Array.from(individualRolesMap.get(understudyId) || new Set()),
            task,
            groupIndex,
            priority: 5 // Understudy gets fifth priority
          });
        }
      }

      const sponsorParticipant = participants.find(p =>
        p.type === 'individual' &&
        (Array.isArray(p.role) ? p.role.includes('sponsor') : p.role === 'sponsor')
      );
      if (sponsorParticipant) {
        // Avoid duplicates
        if (!groupCols.find(col => col.id === sponsorParticipant.id && col.groupIndex === groupIndex)) {
          groupCols.push({
            type: 'sponsor',
            id: sponsorParticipant.id,
            label: sponsorParticipant.name,
            subLabel: 'Sponsor',
            roles: Array.from(individualRolesMap.get(sponsorParticipant.id) || new Set()),
            task,
            groupIndex,
            priority: 6 // Sponsor gets sixth priority
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
        // Logic for Company vs Individual IDs - MUST MATCH renderRequirementRows logic
        const personId = isCompanyType(col.type) ? col.task.company_id :
          isIndividualType(col.type) ? col.task.individual_id :
            col.id;

        const docsToCheck = isCompanyType(col.type)
          ? (allCompanyDocuments[personId] || [])
          : (allIndividualDocuments[personId] || []);

        for (const doc of docsToCheck) {
          const docId = doc.document_id;
          const cacheKey = `${col.task.id}-${docId}-${col.type}-${personId}`;

          // Only fetch if not already in cache and we have metadata definition
          if (!newStatuses.has(cacheKey) && documentMetadataCache.has(docId)) {
            const status = await getDocumentStatus(col.task, docId, col.type, personId, doc);
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
  }, [documentMetadataCache.size, columnDefinitions.length, allCompanyDocuments, allIndividualDocuments]); // Use sizes instead of objects to prevent infinite loops

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
          if (req.document_ids) {
            req.document_ids.forEach(id => {
              if (UUID_REGEX.test(id)) allDocIds.add(id);
            });
          }
          if (req.document_id && UUID_REGEX.test(req.document_id)) {
            allDocIds.add(req.document_id);
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

        if (data && !error) {
          setDocumentMetadataCache(prev => {
            const newCache = new Map(prev);
            data.forEach(doc => newCache.set(doc.id, doc));
            return newCache;
          });
        }
      } catch (error) {
        console.error('Error fetching document metadata:', error);
      }
    };

    fetchDocumentMetadata();
  }, [organizedRequirements]);

  const fetchDocumentTemplates = async (documentId: string, task: any) => {
    try {
      const bankParticipant = task.participants_details?.find((p: any) => p.type === 'bank');
      const bankId = bankParticipant?.id;

      let query = supabase
        .from('acc_portal_templates')
        .select('*')
        .eq('document_id', documentId);

      if (jobLevel) {
        const jobLevelJson = JSON.stringify([jobLevel]);
        query = query.filter('job_level', 'cs', jobLevelJson);
      }
      query = query.order('file_name', { ascending: true });
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

  const refreshDocumentData = useCallback(async () => {
    setIsPreparingTemplate(true);
    try {
      setDocumentMetadataCache(new Map());
      setDocumentStatusCache(new Map());
      setCompositeStatusCache(new Map());

      toast({
        title: "Data Refreshed",
        description: "Document states have been updated",
      });
    } catch (error) {
      console.error('Error refreshing document data:', error);
      toast({
        title: "Error",
        description: "Failed to refresh document data",
        variant: "destructive"
      });
    } finally {
      setIsPreparingTemplate(false);
    }
  }, []);

  const handleOpenTemplateGenerator = async (docItem, task, colType, colId) => {
    setIsPreparingTemplate(true);
    try {
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
        principal: (() => {
          if (colType === 'principal') return colId;

          const principalPart = task.participants_details?.find((p: any) =>
            p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
          );
          if (principalPart) return principalPart.id;

          // Try applicant details
          if (task.applicant_details?.type === 'individual') return task.applicant_details.id;

          return companyRelationships?.principal?.id || null;
        })(),
        dependants: companyRelationships?.dependants?.map(d => d.id) || [],
        understudy: companyRelationships?.understudy?.id || null,
        sponsor: (() => {
          if (colType === 'sponsor') return colId;
          const sponsorPart = task.participants_details?.find((p: any) =>
            p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('sponsor') : p.role === 'sponsor')
          );
          return sponsorPart?.id || null;
        })()
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

        // 4a. Fetch by Document IDs - use document_id field consistently
        if (docIds.size > 0) {
          const validDocIds = [...docIds].filter(id => UUID_REGEX.test(id));
          if (validDocIds.length > 0) {
            const { data } = await supabase.from(table).select('*').in('document_id', validDocIds);
            (data || []).forEach(rec => records.set(rec.id, rec));
          }
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
        sponsor: task.participants_details?.find(p => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('sponsor') : p.role === 'sponsor')),
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
        // Add these two context keys
        activeEntityType: colType,
        activeEntityId: colId
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

      const isApplicantDependant = applicant.role === 'dependant' ||
        (Array.isArray(applicant.role) && applicant.role.includes('dependant'));

      let principal = participants.find(p =>
        p.type === 'individual' &&
        (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
      );

      let dependants = participants
        .filter(p => p.type === 'individual' && (
          Array.isArray(p.role) ? p.role.includes('dependant') : p.role === 'dependant'
        ))
        .map(dep => ({
          id: dep.id,
          name: dep.name,
          relationship: dep.relationship || 'dependant'
        }));

      if (isApplicantDependant) {
        if (!dependants.find(d => d.id === applicant.id)) {
          dependants.push({
            id: applicant.id || task?.individual_id,
            name: applicant.name || individualNames[applicant.id],
            relationship: applicant.relationship || 'dependant'
          });
        }
      } else {
        if (!principal) {
          principal = {
            id: applicant.id || task?.individual_id,
            name: applicant.name || individualNames[applicant.id],
            role: applicant.role
          };
        }
      }

      return {
        company: {
          id: companyParticipant?.id || task?.company_id,
          name: companyParticipant?.name || task?.company_name || 'Company',
          type: 'company'
        },
        principal: principal ? {
          id: principal.id,
          name: principal.name,
          role: principal.role
        } : null,
        directors: participants
          .filter(p => p.type === 'individual' && (
            Array.isArray(p.role) ? (p.role.includes('director') || p.role.includes('shareholder')) : (p.role === 'director' || p.role === 'shareholder')
          ))
          .map(d => ({
            id: d.id,
            name: d.name,
            role: d.role
          })),
        dependants: dependants,
        understudy: (() => {
          const up = participants.find(p => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('understudy') : p.role === 'understudy'));
          return up ? { id: up.id, name: up.name } : null;
        })(),
        sponsor: (() => {
          const sp = participants.find(p => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('sponsor') : p.role === 'sponsor'));
          return sp ? { id: sp.id, name: sp.name } : null;
        })()
      };
    }).filter(Boolean);
  }, [columnDefinitions, individualNames]);

  const relationshipData = useMemo(() => getRelationshipData(), [getRelationshipData]);

  const handleViewDocuments = (documents: any[], docInfo: any, column: any, requirementId?: string) => {
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
      document_fields: docInfo?.fields || [],
      requirementId: requirementId // Store the requirement ID for closing
    };

    setPreviewingDocuments(previewData);
    setShowPreviewModal(true);
  };

  const handlePreviewDataChange = useCallback((docId, fieldName, value) => {
    setPreviewingDocuments(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        documents: prev.documents.map(doc =>
          doc.id === docId
            ? { ...doc, extracted_details: { ...doc.extracted_details, [fieldName]: value } }
            : doc
        )
      };
    });
  }, []);

  const handleDocumentUploadSuccess = (uploadedDocument: any) => {
    toast.success('Document uploaded successfully!');
    setShowUploadModal(false);
    if (refreshDocuments) {
      refreshDocuments();
    }
  };

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

  const handleGenerateTemplate = async (reqItem: any, task: any, columnType: string, columnId?: number) => {
    const docItem = {
      document: {
        id: reqItem.document_ids?.[0] || reqItem.id,
        display_name: reqItem.documentDefinition?.display_name || reqItem.name,
        name: reqItem.documentDefinition?.name || reqItem.name
      }
    };

    await handleOpenTemplateGenerator(docItem, task, columnType, columnId);
  };

  const getDocumentDataForPreview = useCallback((task: any, reqItem: any, columnType: string, entityId?: number) => {
    if (!reqItem) return null;

    const docIds = reqItem.document_ids || (reqItem.document_id ? [reqItem.document_id] : []);
    if (docIds.length === 0) return null;

    if (columnType === 'company') {
      const companyId = task.participants_details?.find(p => p.type === 'company')?.id || task.company_id;
      const companyDocs = allCompanyDocuments[companyId] || [];
      return companyDocs.find(doc => docIds.includes(doc.document_id));
    } else {
      const individualId = entityId || task.applicant_details?.id || task.individual_id;
      const indDocs = allIndividualDocuments[individualId] || [];
      return indDocs.find(doc => docIds.includes(doc.document_id));
    }
  }, [allCompanyDocuments, allIndividualDocuments]);

  const getDocumentStatusText = useCallback((task: any, docItem: any, columnType: string, entityId?: number) => {
    const reqItem = {
      document_ids: [docItem.id],
      document_id: docItem.id
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

    const docIds = reqItem.document_ids || [];
    if (docIds.length === 0) return { type: 'missing', count: 0, total: 0, latestStatus: null };

    const personId = columnType === 'company' ? (task.company_id || task.participants_details?.find(p => p.type === 'company')?.id) :
      (columnType === 'principal' || columnType === 'director') ? (task.individual_id || task.applicant_details?.id) :
        entityId;

    let latestDoc = null;
    let latestDocId = null;

    const docsToSearch = columnType === 'company'
      ? (allCompanyDocuments[personId] || [])
      : (allIndividualDocuments[personId] || []);

    docIds.forEach(docId => {
      const matchingDocs = docsToSearch.filter(d => d.document_id === docId);
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

    const foundCount = docIds.filter(docId =>
      docsToSearch.some(d => d.document_id === docId)
    ).length;

    // Check if any documents are valid (not expired)
    let validCount = 0;
    if (foundCount > 0) {
      for (const docId of docIds) {
        const matchingDocs = docsToSearch.filter(d => d.document_id === docId);
        if (matchingDocs.length > 0) {
          // Check if any of these documents are valid
          for (const doc of matchingDocs) {
            const statusKey = `${task.id}-${docId}-${columnType}-${personId}`;
            const docStatus = documentStatusCache.get(statusKey);
            // If status is valid, expiring, or has no expiry (considered valid), count it
            if (docStatus && (docStatus.status === 'valid' || docStatus.status === 'expiring' || docStatus.status === 'unknown')) {
              validCount++;
              break; // Only need one valid document per document type
            }
          }
        }
      }
    }

    let latestStatus = null;
    if (latestDocId) {
      const statusKey = `${task.id}-${latestDocId}-${columnType}-${personId}`;
      latestStatus = documentStatusCache.get(statusKey);
    }

    const result = {
      type: validCount > 0 ? 'uploaded' : 'missing',
      count: foundCount,
      validCount: validCount,
      total: docIds.length,
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
      return companyDocs.filter(doc => doc.document_id === docTypeId);
    } else {
      const individualId = entityId || task.applicant_details?.id || task.individual_id;
      const indDocs = allIndividualDocuments[individualId] || [];
      return indDocs.filter(doc => doc.document_id === docTypeId);
    }
  }, [allCompanyDocuments, allIndividualDocuments]);

  // Enhanced helper function to render unified status badge
  const renderStatusBadge = (status: any) => {
    if (!status) return null;

    let Icon;
    switch (status.status) {
      case 'valid': Icon = CheckCircle2; break;
      case 'expiring': Icon = AlertCircle; break;
      case 'expired': Icon = XCircle; break;
      default: Icon = Calendar;
    }

    const borderColorClass = status.color ? status.color.replace('text-', 'border-') : 'border-gray-200';

    return (
      <div className="flex items-center gap-1.5 w-full">
        <div className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md border ${status.bgColor} ${borderColorClass} shadow-sm w-fit`}>
          <Icon className={`h-3.5 w-3.5 shrink-0 ${status.color}`} />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${status.color}`}>
            {status.label}
          </span>
        </div>
        {status.expiryDate && (
          <div className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded text-[9.5px] font-medium ${status.color} bg-white border ${borderColorClass} shadow-sm w-fit`}>
            <Calendar className="h-3 w-3 opacity-70" />
            {status.expiryDate}
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

    // Define sort order: General -> Processing -> Issuance -> Job Specific -> Others
    const categoryOrder = ['general', 'processing', 'issuance', 'job-specific'];

    const sortedCategories = Object.keys(groupedByCategory).sort((a, b) => {
      const idxA = categoryOrder.indexOf(a.toLowerCase());
      const idxB = categoryOrder.indexOf(b.toLowerCase());

      // If both found in predefined list, sort by index
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;

      // If one found, it comes first
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;

      // If neither found, sort alphabetically
      return a.localeCompare(b);
    });

    return sortedCategories.map((category) => {
      const categoryReqs = groupedByCategory[category];

      return (
        <React.Fragment key={`${sectionName}-${category}`}>
          {/* Category Header */}
          {Object.keys(groupedByCategory).length > 1 && (
            <TableRow className="bg-blue-50/50 border-b">
              <TableCell colSpan={totalColumns} className="py-2 px-4 font-semibold text-blue-700 text-xs uppercase tracking-wider">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  {/* Clean up labels dynamically */}
                  {category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Requirements
                  <span className="text-blue-500 font-normal ml-1">({categoryReqs.length})</span>
                </span>
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
            const isComposite = reqItem.isMultiDocument && reqItem.document_ids?.length > 1;

            return (
              <React.Fragment key={`${sectionName}-${category}-${requirementId}`}>
                <TableRow className={`group hover:bg-gray-50 ${reqIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <TableCell className={`sticky left-0 border-r z-10 text-center ${reqIndex % 2 === 0 ? 'bg-white group-hover:bg-gray-50' : 'bg-gray-50/30 group-hover:bg-gray-100'}`}>
                    {reqIndex + 1}
                  </TableCell>
                  <TableCell className={`sticky left-16 border-r z-10 ${reqIndex % 2 === 0 ? 'bg-white group-hover:bg-gray-50' : 'bg-gray-50/30 group-hover:bg-gray-100'}`}>
                    <span className="flex">
                      <span className="flex justify-between items-center gap-2">
                        <span className="truncate max-w-[250px] font-medium text-slate-700">
                          {reqItem.name}
                        </span>
                        <span className="flex">
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
                        </span>
                      </span>

                      {/* Template and Automation Indicators */}
                      <span className="flex items-center gap-2 mt-1">
                        {reqItem.hasTemplate && (
                          <span className="flex items-center gap-1 text-orange-600" title="Has Template">
                            <FileType className="h-3 w-3 fill-current" />
                            <span className="text-[9px] font-medium">Template</span>
                          </span>
                        )}

                        {reqItem.web_automation?.automationId && (
                          <span className="flex items-center gap-1 text-blue-600" title={`Web Form: ${reqItem.web_automation.automationName}`}>
                            <Zap className="h-3 w-3 fill-current" />
                            <span className="text-[9px] font-medium truncate max-w-[100px]">{reqItem.web_automation.automationName}</span>
                          </span>
                        )}
                      </span>
                    </span>
                  </TableCell>

                  {columnDefinitions.map((col, colIdx) => {
                    const isApplicable = checkApplicability(col.type, reqItem, col.roles);
                    const groupRelationshipData = relationshipData[col.groupIndex];

                    if (!isApplicable) {
                      return (
                        <TableCell key={`${requirementId}-col-${colIdx}`} className="text-center border p-3 align-middle bg-slate-50/30">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 text-[10px] text-slate-400 font-medium italic shadow-sm">
                            N/A
                          </span>
                        </TableCell>
                      );
                    }

                    // For composite requirements, show aggregated status
                    if (isComposite) {
                      const cacheKey = `${col.task.id}-${reqItem.id || reqItem.uniqueId}-${col.type}-${col.id}`;
                      const compositeStatus = compositeStatusCache.get(cacheKey);
                      const statusToDisplay = compositeStatus || getCompositeRequirementStatus(reqItem, col.task, col.type, col.id);

                      return (
                        <TableCell key={`${requirementId}-col-${colIdx}`} className="text-center border p-3 align-middle">
                          <div className="flex items-center justify-center gap-2.5 w-full">
                            {statusToDisplay ? (
                              <div className="flex items-center gap-2 w-full">
                                {statusToDisplay.latestStatus ? (
                                  <>
                                    {renderStatusBadge(statusToDisplay.latestStatus)}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 w-full max-w-[120px] bg-white text-blue-600 border-blue-200 hover:bg-blue-50 shadow-sm flex items-center justify-center gap-1.5"
                                      onClick={() => {
                                        const latestDocId = reqItem.document_ids?.find((docId: string) => {
                                          const docs = isCompanyType(col.type)
                                            ? allCompanyDocuments[col.task.company_id || col.task.participants_details?.find((p: any) => p.type === 'company')?.id]?.filter(doc => doc.document_id === docId)
                                            : allIndividualDocuments[col.task.individual_id || col.task.applicant_details?.id || col.id]?.filter(doc => doc.document_id === docId);
                                          return docs && docs.length > 0;
                                        });
                                        if (latestDocId) {
                                          const docs = isCompanyType(col.type)
                                            ? allCompanyDocuments[col.task.company_id || col.task.participants_details?.find((p: any) => p.type === 'company')?.id]?.filter(doc => doc.document_id === latestDocId)
                                            : allIndividualDocuments[col.task.individual_id || col.task.applicant_details?.id || col.id]?.filter(doc => doc.document_id === latestDocId);
                                          if (docs && docs.length > 0) {
                                            setPreviewingDocuments(docs);
                                            setShowPreviewModal(true);
                                          }
                                        }
                                      }}
                                      title="Preview Latest Document"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      <span className="text-[10px] font-bold uppercase tracking-wider">View Docs</span>
                                    </Button>
                                  </>
                                ) : (
                                  <Badge variant="outline" className={`text-[10px] uppercase font-bold px-2.5 py-1 shadow-sm ${statusToDisplay.type === 'missing' ? 'border-amber-200 text-amber-600 bg-amber-50' :
                                    statusToDisplay.validCount === 0 && statusToDisplay.count > 0 ? 'border-red-200 text-red-600 bg-red-50' :
                                      'border-amber-200 text-amber-600 bg-amber-50'
                                    }`}>
                                    {statusToDisplay.type === 'missing' ? 'Missing' :
                                      statusToDisplay.validCount === 0 && statusToDisplay.count > 0 ? 'Invalid' :
                                        'No Status'}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" title="Checking status..." />
                            )}

                            {reqItem.hasTemplate && (
                              <Button
                                variant="default"
                                size="sm"
                                className="h-7 w-full max-w-[120px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 border border-indigo-200 shadow-sm flex items-center justify-center gap-1.5"
                                onClick={() => handleGenerateTemplate(reqItem, col.task, col.type, col.id)}
                                disabled={isPreparingTemplate}
                              >
                                {isPreparingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                                <span className="text-[10px] font-bold uppercase tracking-wider">Generate</span>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      );
                    }

                    // For non-composite requirements, use existing logic formatted cleanly
                    return (
                      <TableCell key={`${requirementId}-col-${colIdx}`} className="text-center border p-3 align-middle">
                        <div className="flex items-center justify-center gap-2.5 w-full">
                          <div className="flex items-center justify-center w-full min-h-[32px]">
                            {renderDocumentStatus(col.task, reqItem, col.type, col.id, groupRelationshipData)}
                          </div>

                          {reqItem.hasTemplate && (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 w-full max-w-[120px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 border border-indigo-200 shadow-sm flex items-center justify-center gap-1.5"
                              onClick={() => handleGenerateTemplate(reqItem, col.task, col.type, col.id)}
                              disabled={isPreparingTemplate}
                            >
                              {isPreparingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                              <span className="text-[10px] font-bold uppercase tracking-wider">Generate</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>

                {/* Expanded view for composite requirements showing individual document types */}
                {isComposite && isCompositeExpanded && reqItem.document_ids?.map((docId: string, docIdx: number) => {
                  const docMetadata = documentMetadataCache.get(docId);
                  if (!docMetadata) return null;

                  return (
                    <TableRow key={`${requirementId}-doctype-${docIdx}`} className="bg-blue-50/30">
                      <TableCell className="sticky left-0 border-r text-center text-[10px] text-gray-400 bg-blue-50/30">
                        {reqIndex + 1}.{docIdx + 1}
                      </TableCell>
                      <TableCell className="sticky left-16 bg-blue-50/50 border-r pl-8">
                        <span className="flex items-center gap-2">
                          <FileText className="h-3 w-3 text-blue-600" />
                          <span className="text-[11px] text-slate-700 font-medium">
                            {docMetadata.display_name || docMetadata.name}
                          </span>
                        </span>
                      </TableCell>
                      {columnDefinitions.map((col, colIdx) => {
                        const isApplicable = checkApplicability(col.type, reqItem, col.roles);
                        if (!isApplicable) {
                          return (
                            <TableCell key={`${docId}-col-${colIdx}`} className="text-center border p-3 align-middle">
                              <span className="inline-flex items-center justify-center px-2 py-1 rounded border border-slate-100 bg-slate-50 text-[10px] text-gray-300 italic">
                                -
                              </span>
                            </TableCell>
                          );
                        }

                        const docs = getDocumentsByType(docId, col.task, col.type, col.id);

                        return (
                          <TableCell key={`${docId}-col-${colIdx}`} className="text-center border p-3 align-middle">
                            <div className="flex items-center justify-between gap-2.5 w-full">
                              {docs.length > 0 ? (
                                <>
                                  {(() => {
                                    const personId = isCompanyType(col.type) ? col.task.company_id : isIndividualType(col.type) ? col.task.individual_id : col.id;
                                    const statusKey = `${col.task.id}-${docId}-${col.type}-${personId}`;
                                    if (!documentStatusCache.has(statusKey)) {
                                      const latestDoc = docs.reduce((prev, curr) => (new Date(curr.created_at) > new Date(prev.created_at)) ? curr : prev);
                                      getDocumentStatus(col.task, docId, col.type, personId, latestDoc);
                                      return <span className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" title="Checking status..." />;
                                    }
                                    const status = documentStatusCache.get(statusKey);
                                    return status ? renderStatusBadge(status) : null;
                                  })()}

                                  <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-md shadow-sm">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-9 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded"
                                      onClick={() => handleViewDocuments(docs, docMetadata, col, requirementId)}
                                      title={`View ${docs.length} document(s)`}
                                    >
                                      <Eye className="h-4 w-4" />
                                      {docs.length > 1 && <span className="text-[10px] font-bold ml-1">{docs.length}</span>}
                                    </Button>
                                    <div className="w-[1px] h-4 bg-slate-200" />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-9 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        let personName = col.label;
                                        if (!personName || personName === 'Unknown Person') {
                                          personName = individualNames[col.task?.individual_id] ||
                                            individualNames[col.task?.applicant_details?.id] ||
                                            col.task?.applicant_details?.name ||
                                            'Individual';
                                        }
                                        let documentName = docMetadata?.display_name || docMetadata?.name || docMetadata?.document_name || docMetadata?.main_category || docMetadata?.sub_category || docMetadata?.id || 'Document';
                                        setSelectedDocForUpload({
                                          doc: { ...docMetadata, display_name: documentName },
                                          fields: docMetadata.fields,
                                          person: { full_name: personName, id: col.id, type: 'individual' },
                                          task: col.task,
                                          columnType: col.type,
                                          columnId: col.id
                                        });
                                        setShowUploadModal(true);
                                      }}
                                      title={`Upload additional ${docMetadata.display_name || docMetadata.name}`}
                                    >
                                      <UploadCloud className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <Badge variant="outline" className="text-[10px] uppercase font-bold px-2.5 py-1 border-amber-200 text-amber-600 bg-amber-50 shadow-sm">
                                    Missing
                                  </Badge>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 w-full max-w-[100px] text-amber-600 border-amber-200 hover:bg-amber-50 shadow-sm flex items-center justify-center gap-1.5"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      let personName = col.label;
                                      if (!personName || personName === 'Unknown Person') {
                                        personName = individualNames[col.task?.individual_id] ||
                                          individualNames[col.task?.applicant_details?.id] ||
                                          col.task?.applicant_details?.name ||
                                          'Individual';
                                      }
                                      let documentName = docMetadata?.display_name || docMetadata?.name || docMetadata?.document_name || docMetadata?.main_category || docMetadata?.sub_category || docMetadata?.id || 'Document';
                                      setSelectedDocForUpload({
                                        doc: { ...docMetadata, display_name: documentName },
                                        fields: docMetadata.fields,
                                        person: { full_name: personName, id: col.id, type: 'individual' },
                                        task: col.task,
                                        columnType: col.type,
                                        columnId: col.id
                                      });
                                      setShowUploadModal(true);
                                    }}
                                    title={`Upload ${docMetadata.display_name || docMetadata.name}`}
                                  >
                                    <UploadCloud className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Upload</span>
                                  </Button>
                                </>
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
                      const isApplicable = checkApplicability(col.type, reqItem, col.roles);
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
      );
    });
  };

  const checkForDraft = useCallback((docItem: any, task: any, colType: string, colId?: number): any => {
    const requiredDocId = docItem.id;

    if (colType === 'company') {
      if (task.company_id && allCompanyDocuments[task.company_id]) {
        const draft = allCompanyDocuments[task.company_id].find(
          doc => doc.document_id === requiredDocId &&
            doc.status === 'draft'
        );
        return draft;
      }
    } else {
      let individualId: number | null = null;
      if (colType === 'principal') individualId = task.principal_member || task.individual_id;
      else if (colType === 'understudy') individualId = task.understudy_member;
      else if (colType === 'dependant' || colType === 'reference' || colType === 'director' || colType === 'sponsor') individualId = colId;

      if (individualId && allIndividualDocuments[individualId]) {
        const draft = allIndividualDocuments[individualId].find(
          doc => doc.document_id === requiredDocId &&
            doc.status === 'draft'
        );
        return draft;
      }
    }

    return null;
  }, [allCompanyDocuments, allIndividualDocuments]);

  const renderRequirementRows = (requirementsList: any[]) => {
    return requirementsList.map((reqItem, reqIndex) => {
      const requirementId = reqItem.uniqueId || reqItem.id;
      const isExpanded = expandedDocuments.has(requirementId);
      const isCompositeExpanded = expandedCompositeRequirements.has(requirementId);
      const docDef = reqItem.documentDefinition;
      const fieldsToRender = docDef?.fields || [];
      const isComposite = reqItem.isMultiDocument && reqItem.document_ids?.length > 1;

      return (
        <React.Fragment key={`${reqItem.category}-${requirementId}`}>
          <TableRow className={`group hover:bg-gray-50 ${reqIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
            <TableCell className={`sticky left-0 border-r z-10 text-center ${reqIndex % 2 === 0 ? 'bg-white group-hover:bg-gray-50' : 'bg-gray-50/30 group-hover:bg-gray-100'}`}>
              {reqIndex + 1}
            </TableCell>
            <TableCell className={`sticky left-16 border-r z-10 ${reqIndex % 2 === 0 ? 'bg-white group-hover:bg-gray-50' : 'bg-gray-50/30 group-hover:bg-gray-100'}`}>
              <span className="flex">
                <span className="flex justify-between items-center gap-2">
                  <span className="truncate max-w-[250px] font-medium text-slate-700">
                    {reqItem.name}
                  </span>
                  <span className="flex">
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
                  </span>
                </span>

                <span className="flex items-center gap-2 mt-1">
                  {reqItem.hasTemplate && (
                    <span className="flex items-center gap-1 text-orange-600" title="Has Template">
                      <FileType className="h-3 w-3 fill-current" />
                      <span className="text-[9px] font-medium">Template</span>
                    </span>
                  )}

                  {reqItem.web_automation?.automationId && (
                    <span className="flex items-center gap-1 text-blue-600" title={`Web Form: ${reqItem.web_automation.automationName}`}>
                      <Zap className="h-3 w-3 fill-current" />
                      <span className="text-[9px] font-medium truncate max-w-[100px]">{reqItem.web_automation.automationName}</span>
                    </span>
                  )}
                </span>
              </span>
            </TableCell>

            {columnDefinitions.map((col, colIdx) => {
              const isApplicable = checkApplicability(col.type, reqItem);
              const groupRelationshipData = relationshipData[col.groupIndex];

              if (!isApplicable) {
                return (
                  <TableCell key={`${requirementId}-col-${colIdx}`} className="text-center border p-3 align-middle bg-slate-50/30">
                    <span className="inline-flex items-center justify-center px-2.5 py-1 text-[10px] text-slate-400 font-medium italic shadow-sm">
                      N/A
                    </span>
                  </TableCell>
                );
              }

              if (isComposite) {
                const cacheKey = `${col.task.id}-${reqItem.id || reqItem.uniqueId}-${col.type}-${col.id}`;
                const compositeStatus = compositeStatusCache.get(cacheKey);
                const statusToDisplay = compositeStatus || getCompositeRequirementStatus(reqItem, col.task, col.type, col.id);

                return (
                  <TableCell key={`${requirementId}-col-${colIdx}`} className="text-center border p-3 align-middle">
                    <div className="flex items-center justify-between w-full">
                      {statusToDisplay ? (
                        <div className="flex items-center gap-2 w-full">
                          {statusToDisplay.latestStatus ? (
                            <>
                              {renderStatusBadge(statusToDisplay.latestStatus)}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-full max-w-[120px] bg-white text-blue-600 border-blue-200 hover:bg-blue-50 shadow-sm flex items-center justify-center gap-1.5"
                                onClick={() => {
                                  const latestDocId = reqItem.document_ids?.find((docId: string) => {
                                    const docs = isCompanyType(col.type)
                                      ? allCompanyDocuments[col.task.company_id || col.task.participants_details?.find((p: any) => p.type === 'company')?.id]?.filter(doc => doc.document_id === docId)
                                      : allIndividualDocuments[col.task.individual_id || col.task.applicant_details?.id || col.id]?.filter(doc => doc.document_id === docId);
                                    return docs && docs.length > 0;
                                  });
                                  if (latestDocId) {
                                    const docs = isCompanyType(col.type)
                                      ? allCompanyDocuments[col.task.company_id || col.task.participants_details?.find((p: any) => p.type === 'company')?.id]?.filter(doc => doc.document_id === latestDocId)
                                      : allIndividualDocuments[col.task.individual_id || col.task.applicant_details?.id || col.id]?.filter(doc => doc.document_id === latestDocId);
                                    if (docs && docs.length > 0) {
                                      setPreviewingDocuments(docs);
                                      setShowPreviewModal(true);
                                    }
                                  }
                                }}
                                title="Preview Latest Document"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">View Docs</span>
                              </Button>
                            </>
                          ) : (
                            <Badge variant="outline" className={`text-[10px] uppercase font-bold px-2.5 py-1 shadow-sm ${statusToDisplay.type === 'missing' ? 'border-amber-200 text-amber-600 bg-amber-50' :
                              statusToDisplay.validCount === 0 && statusToDisplay.count > 0 ? 'border-red-200 text-red-600 bg-red-50' :
                                'border-amber-200 text-amber-600 bg-amber-50'
                              }`}>
                              {statusToDisplay.type === 'missing' ? 'Missing' :
                                statusToDisplay.validCount === 0 && statusToDisplay.count > 0 ? 'Invalid' :
                                  'No Status'}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" title="Checking status..." />
                      )}

                      {reqItem.hasTemplate && (
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 w-full max-w-[120px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 border border-indigo-200 shadow-sm flex items-center justify-center gap-1.5"
                          onClick={() => handleGenerateTemplate(reqItem, col.task, col.type, col.id)}
                          disabled={isPreparingTemplate}
                        >
                          {isPreparingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                          <span className="text-[10px] font-bold uppercase tracking-wider">Generate</span>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                );
              }

              return (
                <TableCell key={`${requirementId}-col-${colIdx}`} className="text-center border p-3 align-middle">
                  <div className="flex items-center justify-center gap-2.5 w-full">
                    <div className="flex items-center justify-center w-full min-h-[32px]">
                      {renderDocumentStatus(col.task, reqItem, col.type, col.id, groupRelationshipData)}
                    </div>

                    {reqItem.hasTemplate && (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 w-full max-w-[120px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 border border-indigo-200 shadow-sm flex items-center justify-center gap-1.5"
                        onClick={() => handleGenerateTemplate(reqItem, col.task, col.type, col.id)}
                        disabled={isPreparingTemplate}
                      >
                        {isPreparingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                        <span className="text-[10px] font-bold uppercase tracking-wider">Generate</span>
                      </Button>
                    )}
                  </div>
                </TableCell>
              );
            })}
          </TableRow>

          {/* Expanded view for composite requirements */}
          {isComposite && isCompositeExpanded && reqItem.document_ids?.map((docId: string, docIdx: number) => {
            const docMetadata = documentMetadataCache.get(docId);
            if (!docMetadata) return null;

            return (
              <TableRow key={`${requirementId}-doctype-${docIdx}`} className="bg-blue-50/30">
                <TableCell className="sticky left-0 border-r text-center text-[10px] text-gray-400 bg-blue-50/30">
                  {reqIndex + 1}.{docIdx + 1}
                </TableCell>
                <TableCell className="sticky left-16 bg-blue-50/50 border-r pl-8">
                  <span className="flex items-center gap-2">
                    <FileText className="h-3 w-3 text-blue-600" />
                    <span className="text-[11px] text-slate-700 font-medium">
                      {docMetadata.display_name || docMetadata.name}
                    </span>
                  </span>
                </TableCell>
                {columnDefinitions.map((col, colIdx) => {
                  const isApplicable = checkApplicability(col.type, reqItem);
                  if (!isApplicable) {
                    return (
                      <TableCell key={`${docId}-col-${colIdx}`} className="text-center border p-3 align-middle">
                        <span className="inline-flex items-center justify-center px-2 py-1 rounded border border-slate-100 bg-slate-50 text-[10px] text-gray-300 italic">
                          -
                        </span>
                      </TableCell>
                    );
                  }

                  const docs = getDocumentsByType(docId, col.task, col.type, col.id);

                  return (
                    <TableCell key={`${docId}-col-${colIdx}`} className="text-center border p-3 align-middle">
                      <div className="flex items-center justify-center gap-2.5 w-full">
                        {docs.length > 0 ? (
                          <>
                            {(() => {
                              const personId = isCompanyType(col.type) ? col.task.company_id :
                                isIndividualType(col.type) ? col.task.individual_id :
                                  col.id;
                              const statusKey = `${col.task.id}-${docId}-${col.type}-${personId}`;
                              if (!documentStatusCache.has(statusKey)) {
                                const latestDoc = docs.reduce((prev, curr) => (new Date(curr.created_at) > new Date(prev.created_at)) ? curr : prev);
                                getDocumentStatus(col.task, docId, col.type, personId, latestDoc);
                                return <span className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" title="Checking status..." />;
                              }
                              const status = documentStatusCache.get(statusKey);
                              return status ? renderStatusBadge(status) : null;
                            })()}

                            <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-md shadow-sm">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-9 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded"
                                onClick={() => handleViewDocuments(docs, docMetadata, col, requirementId)}
                                title={`View ${docs.length} document(s)`}
                              >
                                <Eye className="h-4 w-4" />
                                {docs.length > 1 && <span className="text-[10px] font-bold ml-1">{docs.length}</span>}
                              </Button>
                              <div className="w-[1px] h-4 bg-slate-200" />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-9 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                                onClick={(e) => {
                                  e.stopPropagation();

                                  console.log('DEBUG: Composite Sub-Doc Upload Clicked', {
                                    parentRequirement: reqItem.name,
                                    targetDocMetadata: docMetadata,
                                    docId: docId
                                  });

                                  let personName = col.label;
                                  if (!personName || personName === 'Unknown Person') {
                                    personName = individualNames[col.task?.individual_id] ||
                                      individualNames[col.task?.applicant_details?.id] ||
                                      col.task?.applicant_details?.name ||
                                      'Individual';
                                  }

                                  setSelectedDocForUpload({
                                    doc: docMetadata,
                                    fields: docMetadata?.fields || [],
                                    person: {
                                      full_name: personName,
                                      id: col.id,
                                      type: isCompanyType(col.type) ? 'company' : 'individual'
                                    },
                                    task: col.task,
                                    columnType: col.type,
                                    columnId: col.id
                                  });
                                  setShowUploadModal(true);
                                }}
                                title={`Upload additional ${docMetadata?.display_name || 'Document'}`}
                              >
                                <UploadCloud className="h-4 w-4" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <Badge variant="outline" className="text-[10px] uppercase font-bold px-2.5 py-1 border-amber-200 text-amber-600 bg-amber-50 shadow-sm">
                              Missing
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-full max-w-[100px] text-amber-600 border-amber-200 hover:bg-amber-50 shadow-sm flex items-center justify-center gap-1.5"
                              onClick={(e) => {
                                e.stopPropagation();

                                console.log('DEBUG: Composite Sub-Doc Upload Clicked', {
                                  parentRequirement: reqItem.name,
                                  targetDocMetadata: docMetadata,
                                  docId: docId
                                });

                                let personName = col.label;
                                if (!personName || personName === 'Unknown Person') {
                                  personName = individualNames[col.task?.individual_id] ||
                                    individualNames[col.task?.applicant_details?.id] ||
                                    col.task?.applicant_details?.name ||
                                    'Individual';
                                }

                                setSelectedDocForUpload({
                                  doc: docMetadata,
                                  fields: docMetadata?.fields || [],
                                  person: {
                                    full_name: personName,
                                    id: col.id,
                                    type: isCompanyType(col.type) ? 'company' : 'individual'
                                  },
                                  task: col.task,
                                  columnType: col.type,
                                  columnId: col.id
                                });
                                setShowUploadModal(true);
                              }}
                              title={`Upload ${docMetadata?.display_name || 'Document'}`}
                            >
                              <UploadCloud className="h-3.5 w-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Upload</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}

          {/* Expanded Field Data Rows */}
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
                      if (typeof val === 'object') return JSON.stringify(val);
                      return String(val);
                    })() : '-'}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="space-y-4">
      {/* MODALS */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleUploadSubmit}
        onSuccess={handleDocumentUploadSuccess}
        documentName={selectedDocForUpload?.doc?.name || selectedDocForUpload?.doc?.display_name || selectedDocForUpload?.doc?.main_category || selectedDocForUpload?.doc?.sub_category || selectedDocForUpload?.doc?.id || 'Document'}
        documentFields={selectedDocForUpload?.fields}
        entityName={selectedDocForUpload?.person?.full_name}
        entityId={selectedDocForUpload?.person?.id || selectedDocForUpload?.person?.director_id || selectedDocForUpload?.task?.principal_id || selectedDocForUpload?.task?.director_id || selectedDocForUpload?.task?.individual_id}
        selectedDoc={selectedDocForUpload?.doc}
        selectedMember={selectedDocForUpload?.person}
        isAllKepUpload={selectedDocForUpload?.isAllKepUpload}
        permitClassOptions={PERMIT_CLASS_OPTIONS}
        allDocumentTypes={documentTypes}
        mainTab={mainTab}
        isPassportUpload={selectedDocForUpload?.isPassportUpload}
        selectedDocumentId={selectedDocForUpload?.doc?.id}
        dropdowns={selectedDocForUpload?.dropdowns || []}
        targetTable={selectedDocForUpload?.person?.type === 'company' ? 'acc_portal_kyc_uploads' : 'acc_portal_directors_documents'}
        idFieldName={selectedDocForUpload?.person?.type === 'company' ? 'company_id' : 'director_id'}
        documentIdFieldName='document_id'
        isCompanyUpload={selectedDocForUpload?.person?.type === 'company'}
        onBeforeUpload={async (recordData) => {
          if (selectedDocForUpload?.onBeforeUpload) {
            return selectedDocForUpload.onBeforeUpload(recordData);
          }
          return null;
        }}
      />

      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] flex p-0 overflow-hidden bg-slate-50">
          {showPreviewModal && previewingDocuments && (
            <>
              <DialogHeader className="p-4 border-b bg-white shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-xl">
                      <div className="flex items-center p-2">
                        <div className="bg-white p-2 rounded-lg border shadow-sm">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="flex">
                          <p className="text-xl font-bold text-slate-800 line-clamp-1">{previewingDocuments?.document_display_name || 'Document'}</p>
                        </div>
                      </div>
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

              <div className="flex-1 overflow-y-auto">
                <div className="space-y-10 mx-auto">
                  {previewingDocuments?.documents?.map((doc, index) => {
                    const docId = doc.id || `doc-${index}`;

                    return (
                      <div key={docId} className="p-0 lg:p-4">
                        <ExtractionPreview
                          key={docId}
                          documentName={previewingDocuments?.document_display_name || 'Document'}
                          extractedData={doc.edited_details || doc.extracted_details || {}}
                          fields={previewingDocuments?.document_fields || []}
                          fileUrl={getFileUrl(doc.file_path)}
                          fileName={doc.file_name || 'document.pdf'}
                          expanded={true}
                          showSaveButton={false}
                          onDelete={() => handleDeleteDocument?.(doc)}
                          onSave={(data) => handleSaveEditedDocument(doc, data)}
                          onRetryExtraction={(retryData) => handleInternalRetryExtraction(doc, retryData)}
                          onDataChange={(fieldName, value) => {
                            handlePreviewDataChange(docId, fieldName, value);
                          }}
                          documentTypes={documentTypes}
                          type={doc.director_id ? 'individual' : 'company'}
                          file={doc}
                          extractionStatus={doc.extraction_status || 'success'}
                          supabase={supabase}
                          onDialogClose={() => {
                            // Close the preview dialog
                            setShowPreviewModal(false);
                            // Also collapse the document expansion if needed
                            if (previewingDocuments?.requirementId && toggleDocumentExpansion) {
                              toggleDocumentExpansion(previewingDocuments.requirementId);
                            }
                          }}
                        />
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
                  const config = getEntityTypeConfig(col.type);
                  const { bgColor, Icon } = config;

                  return (
                    <TableHead
                      key={`header-${idx}`}
                      className={`${bgColor} text-white border-r border-white/10 min-w-[180px] p-2 text-center transition-colors`}
                    >
                      <span className="flex items-center gap-1">
                        <Icon className="h-4 w-4 opacity-70 mb-1" />
                        <span className="text-[11px] font-bold uppercase line-clamp-1 px-1">
                          {col.label}
                        </span>
                        <span className="flex justify-between items-center gap-2">
                          {col.roles && col.roles.length > 1 ? (
                            <div className="flex gap-1">
                              {col.roles.map((role, roleIdx) => (
                                <span key={roleIdx} className="text-[8px] bg-black/30 text-white rounded px-1 py-0.5 font-medium tracking-wider">
                                  {role.toUpperCase()}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[9px] bg-black/20 rounded px-1.5 py-0.5 font-medium tracking-wider">
                              {col.subLabel}
                            </span>
                          )}
                          {col.role && (
                            <span className="text-[8px] bg-blue-900/20 text-white rounded px-1.5 py-0.5 font-medium tracking-wider">
                              {Array.isArray(col.role) ? col.role.join(', ') : col.role}
                            </span>
                          )}
                          {isPrincipalType(col.type) && (() => {
                            const dependants = filteredGroupedTasks[col.groupIndex]?.tasks?.[0]?.participants_details?.filter(p =>
                              p.type === 'individual' && (
                                Array.isArray(p.role) ? p.role.includes('dependant') : p.role === 'dependant'
                              )
                            ) || [];
                            if (dependants.length > 0) {
                              const isExpanded = expandedDependants.has(col.groupIndex);
                              return (
                                <span className="flex items-center gap-1">
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
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </span>
                      </span>
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
                  {/* General Section */}
                  {groupedRequirements.general.length > 0 && (
                    <>
                      <TableRow className="bg-slate-100 hover:bg-slate-200 cursor-pointer" onClick={() => toggleSectionExpansion('general')}>
                        <TableCell colSpan={totalColumns} className="py-3 px-4">
                          <span className="flex items-center gap-3">
                            {expandedSections.general ? <Minus className="h-4 w-4 text-slate-500" /> : <Plus className="h-4 w-4 text-slate-500" />}
                            <span className="h-6 w-1 bg-blue-600 rounded-full" />
                            <span className="font-bold text-slate-700 uppercase text-xs tracking-wider">General Requirements ({groupedRequirements.general.length})</span>
                          </span>
                        </TableCell>
                      </TableRow>
                      {expandedSections.general && renderRequirementRows(groupedRequirements.general)}
                    </>
                  )}

                  {/* Processing Section */}
                  {groupedRequirements.processing.length > 0 && (
                    <>
                      <TableRow className="bg-slate-100 hover:bg-slate-200 cursor-pointer" onClick={() => toggleSectionExpansion('processing')}>
                        <TableCell colSpan={totalColumns} className="py-3 px-4">
                          <span className="flex items-center gap-3">
                            {expandedSections.processing ? <Minus className="h-4 w-4 text-slate-500" /> : <Plus className="h-4 w-4 text-slate-500" />}
                            <span className="h-6 w-1 bg-amber-500 rounded-full" />
                            <span className="font-bold text-slate-700 uppercase text-xs tracking-wider">Processing Requirements ({groupedRequirements.processing.length})</span>
                          </span>
                        </TableCell>
                      </TableRow>
                      {expandedSections.processing && renderRequirementRows(groupedRequirements.processing)}
                    </>
                  )}

                  {/* Issuance Section */}
                  {groupedRequirements.issuance.length > 0 && (
                    <>
                      <TableRow className="bg-slate-100 hover:bg-slate-200 cursor-pointer" onClick={() => toggleSectionExpansion('issuance')}>
                        <TableCell colSpan={totalColumns} className="py-3 px-4">
                          <span className="flex items-center gap-3">
                            {expandedSections.issuance ? <Minus className="h-4 w-4 text-slate-500" /> : <Plus className="h-4 w-4 text-slate-500" />}
                            <span className="h-6 w-1 bg-emerald-500 rounded-full" />
                            <span className="font-bold text-slate-700 uppercase text-xs tracking-wider">Issuance Requirements ({groupedRequirements.issuance.length})</span>
                          </span>
                        </TableCell>
                      </TableRow>
                      {expandedSections.issuance && renderRequirementRows(groupedRequirements.issuance)}
                    </>
                  )}

                  {/* Other Section */}
                  {groupedRequirements.other.length > 0 && (
                    <>
                      <TableRow className="bg-slate-100 hover:bg-slate-200 cursor-pointer" onClick={() => toggleSectionExpansion('other')}>
                        <TableCell colSpan={totalColumns} className="py-3 px-4">
                          <span className="flex items-center gap-3">
                            {expandedSections.other ? <Minus className="h-4 w-4 text-slate-500" /> : <Plus className="h-4 w-4 text-slate-500" />}
                            <span className="h-6 w-1 bg-slate-400 rounded-full" />
                            <span className="font-bold text-slate-700 uppercase text-xs tracking-wider">Other Requirements ({groupedRequirements.other.length})</span>
                          </span>
                        </TableCell>
                      </TableRow>
                      {expandedSections.other && renderRequirementRows(groupedRequirements.other)}
                    </>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {showTemplateGenerator && selectedLetterInfo && (
        <TemplateGenerationDialog
          isOpen={showTemplateGenerator}
          onClose={() => setShowTemplateGenerator(false)}
          template={selectedLetterInfo.template}
          availableTemplates={selectedLetterInfo.availableTemplates}
          documentName={selectedLetterInfo.document.display_name}
          onSave={handleSaveGeneratedLetter}
          masterFields={selectedLetterInfo.masterFields}
          entityIdMap={selectedLetterInfo.entityIdMap}
          sourceDataCache={selectedLetterInfo.sourceDataCache}
          extractedData={selectedLetterInfo.extractedData}
          personData={selectedLetterInfo.personData}
          companyData={selectedLetterInfo.companyData}
          relationshipData={selectedLetterInfo.relationshipData}
          onDraftDiscarded={refreshDocumentData}
          jobLevel={jobLevel}
          activeEntityType={selectedLetterInfo.activeEntityType}
          activeEntityId={selectedLetterInfo.activeEntityId}
          // ADD THIS PROP:
          refreshDocuments={refreshDocuments}
        />
      )}
    </div >
  );
}