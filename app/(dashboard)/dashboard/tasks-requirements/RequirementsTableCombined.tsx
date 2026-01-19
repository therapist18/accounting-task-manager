// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, Briefcase, Users, Plus, Minus, UserCheck, Loader2, Download, FileText, FileUp, Trash2, RefreshCw, Wand2, Save, ChevronDown, ChevronRight, Users2, User, Building2, Zap, FileType } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { ExtractionPreview } from "@/components/ExtractionPreview"
import supabase from "@/lib/supabase/client"
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

const generateDocxBlobFromHtml = async (html: string) => {
  if (!htmlDocx) {
    throw new Error('html-docx-js is not loaded yet');
  }
  return htmlDocx.asBlob(html);
};

const CLASS_D_ID = '1750687058159';

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
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
};

export default function RequirementsTableCombined({ loading, error, filteredGroupedTasks, organizedRequirements, classRequirements, expandedDocuments, toggleDocumentExpansion, renderDocumentStatus, renderClientFieldData, renderReferencesData, hasReferencesColumn, individualNames, companyData, getCurrentRequirements, fuzzyMatch, kycDocuments, documentTypes, mainTab, handleUploadSubmit, handleDeleteDocument, handleRetryExtraction, handleSaveEditedDocument, documentTemplates , allIndividualDocuments, allCompanyDocuments,}: any) {
  const [isStageDialogOpen, setIsStageDialogOpen] = useState(false);
  const [selectedStageTask, setSelectedStageTask] = useState<{ task: any, stage: any } | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    company: true,
    individual: true,
    letters: true,
  });
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedDocForUpload, setSelectedDocForUpload] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewingDocuments, setPreviewingDocuments] = useState<any>(null);
  const [showTemplateGenerator, setShowTemplateGenerator] = useState(false);
  const [selectedLetterInfo, setSelectedLetterInfo] = useState(null);
  const [isPreparingTemplate, setIsPreparingTemplate] = useState(false);
  const [masterFields, setMasterFields] = useState<Map<number, any>>(new Map());
  const hasFetchedMasterFields = useRef(false);

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

      // 1. FIND COMPANY
      const companyPart = participants.find(p => p.type === 'company');
      if (companyPart) {
        cols.push({
          type: 'company',
          id: companyPart.id,
          label: companyPart.name,
          subLabel: 'Entity',
          task,
          groupIndex
        });
      }

      // 2. FIND PRINCIPAL (Applicant)
      if (applicant && applicant.type === 'individual') {
        cols.push({
          type: 'principal',
          id: applicant.id,
          label: applicant.name,
          subLabel: applicant.role?.toUpperCase() || 'PRINCIPAL',
          task,
          groupIndex
        });
      }

      // 3. FIND DIRECTORS / SHAREHOLDERS
      const directors = participants.filter(p =>
        p.type === 'individual' &&
        (p.role === 'director' || p.role === 'shareholder' || (Array.isArray(p.role) && p.role.includes('director')))
      );
      directors.forEach(d => {
        cols.push({
          type: 'director',
          id: d.id,
          label: d.name,
          subLabel: 'Director',
          task,
          groupIndex
        });
      });

      // 4. FIND DEPENDANTS
      const dependants = participants.filter(p =>
        p.type === 'individual' &&
        (p.role === 'dependant' || p.relationship)
      );
      dependants.forEach(dep => {
        cols.push({
          type: 'dependant',
          id: dep.id,
          label: dep.name,
          subLabel: dep.relationship || 'Dependant',
          task,
          groupIndex,
          relationship: dep.relationship
        });
      });

      // 5. FIND UNDERSTUDY (Looking at root "understudy" field)
      if (task.understudy) {
        const understudyId = task.understudy;
        // Try to find name in participants, otherwise use individualNames map
        const uPart = participants.find(p => p.id === understudyId);
        cols.push({
          type: 'understudy',
          id: understudyId,
          label: uPart?.name || individualNames[understudyId] || 'Understudy',
          subLabel: 'Understudy',
          task,
          groupIndex
        });
      }
    });

    return cols;
  }, [filteredGroupedTasks, individualNames]);

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

  const fetchDocumentTemplates = async (documentId: string, task: any) => {
    try {
      console.log('=== fetchDocumentTemplates Debug ===');
      console.log('Task participants details:', JSON.stringify(task.participants_details, null, 2));

      // Get bank ID from task's participants_details
      const bankParticipant = task.participants_details?.find((p: any) => p.type === 'bank');
      const bankId = bankParticipant?.id;

      console.log('Found bank participant:', bankParticipant);
      console.log('Using bankId:', bankId);

      let query = supabase
        .from('acc_portal_templates')
        .select('*')
        .eq('document_id', documentId)
        .order('file_name', { ascending: true });

      // If bank ID is found, filter templates by bank_id
      // If bank ID is found, filter templates by bank_id
      if (bankId) {
        console.log(`Filtering templates for bank ID: ${bankId}`);
        // Use raw SQL filter for JSONB array containment
        query = query.filter('banks_associated', 'cs', `[{"bank_id":${bankId},"bank_name":"${bankParticipant.name}"}]`);
      } else {
        console.log('No bank ID found, fetching all templates for document');
      }

      console.log('Executing query with params:', {
        document_id: documentId,
        banks_associated: bankId ? `cs.[{"bank_id":"${bankId}"}]` : 'not filtered'
      });

      const { data: templates, error } = await query;

      if (error) {
        console.error('Error fetching templates:', error);
        throw error;
      }

      console.log(`Found ${templates?.length || 0} templates`);
      console.log('Templates sample:', templates?.slice(0, 2)); // Log first 2 templates to avoid cluttering
      console.log('=== End of Debug ===');

      return templates || [];
    } catch (error) {
      console.error('Error fetching document templates:', error);
      return [];
    }
  };

  const handleOpenTemplateGenerator = async (docItem, task, colType, colId) => {
    setIsPreparingTemplate(true);
    try {
      // 1. Find the specific participant for THIS column
      const participant = task.participants_details?.find(p => p.id === colId);

      // 2. Resolve Company ID robustly
      let companyId = task.company_id;
      if (!companyId && task.participants_details) {
        companyId = task.participants_details.find(p => p.type === 'company')?.id;
      }
      if (!companyId && task.applicant_details?.type === 'company') {
        companyId = task.applicant_details.id;
      }

      // 3. Map all categories for context
      const directorsIds = task.participants_details
        ?.filter(p => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('director') : p.role === 'director'))
        ?.map(d => d.id) || [];

      const dependantsIds = task.participants_details
        ?.filter(p => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('dependant') || p.role.includes('dependent') : p.role === 'dependant' || p.role === 'dependent'))
        ?.map(d => d.id) || [];

      // Get relationship data for the current company
      const companyRelationships = getRelationshipData()?.find(rel =>
        rel.company?.id === companyId || rel.company?.name === companyName
      );

      const entityIdMap = {
        company: companyId,
        directors: companyRelationships?.directors?.map(d => d.id) || [],
        // FIX: If we are in a director column, set THIS specific ID as the target director
        director: colType === 'director' ? colId : companyRelationships?.directors?.[0]?.id,
        principal: colType === 'principal' ? colId : companyRelationships?.principal?.id,
        dependants: companyRelationships?.dependants || [],
        understudy: companyRelationships?.understudy?.id
      }
      console.log("✅ Step 1: Entity ID Map created", entityIdMap);

      const templates = await fetchDocumentTemplates(docItem.document.id, task);
      console.log(`✅ Step 2: Found ${templates.length} available templates.`);
      if (!templates || templates.length === 0) {
        console.log('❌ No templates found, showing toast...');
        toast.error(`No templates are available for: ${docItem.document.display_name}`, {
          duration: 5000, // 5 seconds
          style: {
            background: 'hsl(var(--destructive))',
            color: 'hsl(var(--destructive-foreground))',
          },
        });
        setIsPreparingTemplate(false);
        return;
      }

      const queriesToRun = new Map();

      templates.forEach(template => {
        (template.placeholders || []).forEach(placeholder => {
          const pids = placeholder.master_field_ids || (placeholder.master_field_id ? [placeholder.master_field_id] : []);
          pids.forEach(id => {
            const masterField = masterFields.get(parseInt(id, 10));
            if (masterField?.sources) {
              const entityId = entityIdMap[placeholder.entity_type || 'principal'];
              if (entityId) {
                masterField.sources.forEach(source => {
                  const { table, linking_variable, document_id } = source;
                  if (!table) return;

                  if (!queriesToRun.has(table)) {
                    queriesToRun.set(table, { docIds: new Set(), links: new Map() });
                  }
                  const tableQueries = queriesToRun.get(table);

                  if (document_id) {
                    parseAndCleanUUIDs(document_id).forEach(uuid => tableQueries.docIds.add(uuid));
                  }

                  const linkVar = linking_variable || 'id';
                  if (!tableQueries.links.has(linkVar)) {
                    tableQueries.links.set(linkVar, new Set());
                  }
                  // Handle both single entity IDs and arrays of entity IDs (for directors)
                  if (Array.isArray(entityId)) {
                    entityId.forEach(id => {
                      if (id) {
                        // Extract ID if it's an object, otherwise use as is
                        const idValue = id && typeof id === 'object' ? (id.id || id.director_id || id.individual_id || id.company_id) : id;
                        if (idValue) tableQueries.links.get(linkVar).add(idValue);
                      }
                    });
                  } else {
                    if (entityId) {
                      // Extract ID if it's an object, otherwise use as is
                      const idValue = entityId && typeof entityId === 'object' ?
                        (entityId.id || entityId.director_id || entityId.individual_id || entityId.company_id) :
                        entityId;
                      if (idValue) tableQueries.links.get(linkVar).add(idValue);
                    }
                  }
                });
              }
            }
          });

          if (placeholder.type === 'document_checklist' && placeholder.linked_document_ids) {
            // Get data source configuration with defaults
            const dataSource = placeholder.checklist_data_source || {
              table: 'acc_portal_kyc_uploads',
              linking_variable: 'company_id',
              document_id_field: 'kyc_document_id'
            };

            const tableName = dataSource.table;

            console.log('[Query Builder] Document checklist detected:', {
              placeholder: placeholder.name,
              dataSource,
              linkedDocs: placeholder.linked_document_ids
            });

            // Initialize table queries if not exists
            if (!queriesToRun.has(tableName)) {
              queriesToRun.set(tableName, { docIds: new Set(), links: new Map() });
            }

            const tableQueries = queriesToRun.get(tableName);

            // Add document IDs
            placeholder.linked_document_ids.forEach(docId => {
              tableQueries.docIds.add(docId);
            });

            // Determine entity type and ID
            const entityType = Array.isArray(placeholder.entity_type)
              ? placeholder.entity_type[0]
              : placeholder.entity_type || 'company';

            const entityId = entityIdMap[entityType] || entityIdMap.company;

            if (entityId) {
              // Use the configured linking variable
              const linkVar = dataSource.linking_variable;

              if (!tableQueries.links.has(linkVar)) {
                tableQueries.links.set(linkVar, new Set());
              }

              // Handle both single IDs and arrays
              if (Array.isArray(entityId)) {
                entityId.forEach(id => {
                  const idValue = id && typeof id === 'object'
                    ? (id.id || id.director_id || id.individual_id || id.company_id)
                    : id;
                  if (idValue) tableQueries.links.get(linkVar).add(idValue);
                });
              } else {
                const idValue = entityId && typeof entityId === 'object'
                  ? (entityId.id || entityId.director_id || entityId.individual_id || entityId.company_id)
                  : entityId;
                if (idValue) tableQueries.links.get(linkVar).add(idValue);
              }

              console.log('[Query Builder] Added queries:', {
                table: tableName,
                linkVar,
                docIds: [...tableQueries.docIds],
                entityIds: [...tableQueries.links.get(linkVar)]
              });
            }
          }
        });
      });

      console.log("✅ Step 3: Analyzed templates. Required data sources:",
        Object.fromEntries(Array.from(queriesToRun.entries()).map(([table, { docIds, links }]) =>
          [table, { docIds: [...docIds], links: Object.fromEntries(Array.from(links.entries()).map(([lv, ids]) => [lv, [...ids]])) }]
        ))
      );

      console.log("⏳ Step 4: Fetching data from Supabase...");
      const sourceDataCache: Record<string, Record<number, any>> = { 'tm_tasks': { [task.id]: task } };

      for (const [table, { docIds, links }] of queriesToRun.entries()) {
        const records = new Map();
        console.log(`  - Querying table '${table}'...`);

        // CORRECTED CODE
        // Handle dynamic document tables (acc_portal_kyc_uploads, acc_portal_directors_documents, etc.)
        if (table === 'acc_portal_kyc_uploads' || table === 'acc_portal_directors_documents') {
          // Filter valid UUIDs
          const validDocIds = [...docIds].filter(id =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
          );

          if (validDocIds.length > 0) {
            console.log(`[Query Execution] Fetching from ${table}:`, validDocIds);

            // ✅ FIX: Determine the correct document ID field for this table
            const docIdField = table === 'acc_portal_kyc_uploads' ? 'kyc_document_id' : 'document_id';

            console.log(`[Query Execution] Using document ID field: ${docIdField}`);

            // ✅ FIX: Use single .in() with correct field
            let query = supabase
              .from(table)
              .select('*')
              .in(docIdField, validDocIds);

            const { data, error } = await query;

            if (error) {
              console.error(`[Query Execution] Error fetching from ${table}:`, error);
            } else {
              console.log(`[Query Execution] Found ${data?.length || 0} records in ${table}`);
              (data || []).forEach(rec => records.set(rec.id, rec));
            }
          }

          // Continue with linking variables...
          for (const [linkVar, entityIdsSet] of links.entries()) {
            const entityIds = Array.from(entityIdsSet).map(id => {
              if (id && typeof id === 'object') {
                return id.id || id.director_id || id.individual_id || id.company_id;
              }
              return id;
            }).filter(id => id != null && id !== '');

            if (entityIds.length > 0) {
              console.log(`[Query Execution] Fetching from ${table} by ${linkVar}:`, entityIds);

              const { data, error } = await supabase
                .from(table)
                .select('*')
                .in(linkVar, entityIds);

              if (error) {
                console.error(`[Query Execution] Error fetching by ${linkVar}:`, error);
              } else {
                console.log(`[Query Execution] Found ${data?.length || 0} additional records`);
                (data || []).forEach(rec => records.set(rec.id, rec));
              }
            }
          }
        }
        else {
          if (docIds.size > 0) {
            console.log(`    - by document_id:`, [...docIds]);
            const { data, error } = await supabase
              .from(table)
              .select('*')
              .in('document_id', [...docIds]);

            if (error) {
              console.error(`    - ❌ ERROR fetching by document_id:`, error);
              toast({
                title: `Failed to fetch from ${table}`,
                description: error.message,
                variant: "destructive"
              });
            } else {
              (data || []).forEach(rec => records.set(rec.id, rec));
            }
          }

          for (const [linkVar, entityIdsSet] of links.entries()) {
            // Convert Set to array and ensure all values are primitives
            const entityIds = Array.from(entityIdsSet).map(id => {
              // If it's an object with id property, extract it
              if (id && typeof id === 'object') {
                return id.id || id.director_id || id.individual_id || id.company_id;
              }
              return id;
            }).filter(id => id != null && id !== ''); // Remove any null/undefined/empty values

            if (entityIds.length > 0) {
              console.log(`    - by linking_variable '${linkVar}':`, entityIds);
              const { data, error } = await supabase
                .from(table)
                .select('*')
                .in(linkVar, entityIds);

              if (error) {
                console.error(`    - ❌ ERROR fetching by ${linkVar}:`, error);
                toast({
                  title: `Failed to fetch from ${table}`,
                  description: error.message,
                  variant: "destructive"
                });
              } else {
                (data || []).forEach(rec => records.set(rec.id, rec));
              }
            }
          }
        }

        sourceDataCache[table] = Array.from(records.values()).reduce((acc, rec) => {
          acc[rec.id] = rec;
          return acc;
        }, {});
        console.log(`  - ✅ Success! Fetched and cached ${records.size} unique records from '${table}'.`);
      }

      console.log("✅ Step 4: Data fetching complete. Final source data cache:", sourceDataCache);

      // Extract relationship data for the dialog
      console.log("🔍 Debug: task.participants_details:", task.participants_details);
      console.log("🔍 Debug: Looking for director ID:", entityIdMap.director);

      const relationshipData = {
        company: task.participants_details?.find(p => p.type === 'company') ||
          (task.applicant_details?.type === 'company' ? task.applicant_details : null) ||
          { id: task.company_id, name: task.company_name, type: 'company' }, // Fallback to top-level task props

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
          return task.participants_details?.filter(p =>
            p.type === 'individual' &&
            (Array.isArray(p.role) ? p.role.includes('director') : p.role === 'director')
          ) || [];
        })(),

        principal: task.participants_details?.find(p =>
          p.type === 'individual' &&
          (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
        ) || (task.applicant_details?.type === 'individual' ? task.applicant_details : null),

        dependants: task.participants_details?.filter(p =>
          p.type === 'individual' &&
          (Array.isArray(p.role) ? p.role.includes('dependant') || p.role.includes('dependent') : p.role === 'dependant' || p.role === 'dependent')
        ) || [],

        understudy: task.participants_details?.find(p =>
          p.type === 'individual' && p.id === task.understudy_id
        ),
      };

      console.log("🔗 Relationship Data Extracted:", relationshipData);
      console.log("🔗 Directors found:", relationshipData.directors.length, relationshipData.directors);

      // Debug: Log the full task object to see what's available
      console.log("🔍 Debug: Full task object:", task);
      console.log("🔍 Debug: task.applicant_details:", task.applicant_details);
      console.log("🔍 Debug: Looking for company in participants_details:", task.participants_details?.find(p => p.type === 'company'));

      // Try to get applicant details from different possible locations
      const applicantDetails = task.applicant_details ||
        task.participants_details?.find(p => p.type === 'company') ||
        {};

      console.log("🔍 Debug: Final applicantDetails:", applicantDetails);

      const letterInfo = {
        document: docItem.document,
        task: task,
        masterFields: masterFields,
        entityIdMap: entityIdMap,
        sourceDataCache: sourceDataCache,
        availableTemplates: templates,
        // Pre-select template if only one exists, otherwise null to trigger selection screen
        template: templates.length === 1 ? templates[0] : null,
        personData: applicantDetails?.type === 'individual' ? applicantDetails : {},
        companyData: applicantDetails?.type === 'company' ? applicantDetails : {},
        extractedData: applicantDetails || {},
        relationshipData: relationshipData,
      };
      console.log("✅ Step 5: Final data package prepared for dialog.");

      setSelectedLetterInfo(letterInfo);
      setShowTemplateGenerator(true); // Directly open the main dialog
      console.log("🏁 Process complete. Opening template generation dialog.");

    } catch (error) {
      console.error("❌FATAL ERROR during template data preparation:", error);
      toast({ title: "Error preparing template data", description: error.message, variant: "destructive" });
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

  // --- RequirementsTableCombined.tsx ---

  const getRelationshipData = useCallback(() => {
    if (columnDefinitions.length === 0) return [];

    // Group columns by their task group
    const groupedColumns = columnDefinitions.reduce((groups, col) => {
      if (!groups[col.groupIndex]) groups[col.groupIndex] = [];
      groups[col.groupIndex].push(col);
      return groups;
    }, {} as Record<number, any[]>);

    return Object.values(groupedColumns).map(columns => {
      const task = columns[0]?.task;
      const participants = task?.participants_details || [];
      const applicant = task?.applicant_details || {};

      // Company from participants
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
          .filter(p => p.type === 'individual' && (p.role === 'director' || p.role === 'shareholder'))
          .map(d => ({
            id: d.id,
            name: d.name,
            role: d.role
          })),
        dependants: participants
          .filter(p => p.type === 'individual' && (p.role === 'dependant' || p.relationship))
          .map(dep => ({
            id: dep.id,
            name: dep.name,
            relationship: dep.relationship || 'dependant'
          })),
        understudy: (() => {
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

  // Debug effect for relationship data
  useEffect(() => {
    if (relationshipData && relationshipData.length > 0) {
      console.log('=== RELATIONSHIP DATA ===', JSON.parse(JSON.stringify(relationshipData)));
      relationshipData.forEach(({ company, directors, principal, dependants, understudy }) => {
        console.log(`=== Company: ${company.name} ===`);
        console.log('Directors:', directors);
        console.log('Principal:', principal);
        console.log('Dependants:', dependants);
        console.log('Understudy:', understudy);
      });
    }
  }, [relationshipData]);

  const handleViewDocuments = (documents: any[], docInfo: any, column: any) => {
    if (!documents || documents.length === 0) return;

    const previewData = {
      // 1. Map the documents to the format ExtractionPreview expects
      documents: documents.map(d => ({
        ...d,
        id: d.id,
        // Pass the current state of data (prioritize user edits)
        extracted_details: d.extracted_details || {},
        edited_details: d.edited_details || d.extracted_details || {},
        file_path: d.file_path || d.url || d.document_url,
        file_name: d.file_name || d.name || 'document.pdf',
      })),
      // 2. The Title/Labels
      document_display_name: docInfo?.display_name || 'Document',
      person_full_name: column?.label || '',
      // 3. The SCHEMA: Critical for ExtractionPreview to render the form fields
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
      // Find principal from applicant_details
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

      // Find principal and understudy from participants_details
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
    // Create a docItem structure compatible with handleOpenTemplateGenerator
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

  const renderDocumentSection = (requirementsList: any[], sectionName: string) => {
    return requirementsList
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((reqItem, reqIndex) => {
        // Use uniqueId for tracking expansion (combines requirement ID with document ID)
        const requirementId = reqItem.uniqueId || reqItem.id;
        const isExpanded = expandedDocuments.has(requirementId);

        // The KYC definition (metadata, fields) attached in RequirementsTable.tsx
        const docDef = reqItem.documentDefinition;
        const fieldsToRender = docDef?.fields || [];

        return (
          <React.Fragment key={`${sectionName}-${requirementId}`}>
            <TableRow className="group bg-white hover:bg-gray-50">
              <TableCell className="sticky left-0 bg-white group-hover:bg-gray-50 border-r z-10 text-center">
                {reqIndex + 1}
              </TableCell>
              <TableCell className="sticky left-16 bg-white group-hover:bg-gray-50 border-r z-10">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="truncate max-w-[250px] font-medium text-slate-700">
                      {docDef?.display_name || reqItem.name}
                      {reqItem.isMultiDocument && (
                        <span className="text-xs text-blue-600 ml-2">
                          ({reqItem.documentCount} docs)
                        </span>
                      )}
                    </span>
                    {fieldsToRender.length > 0 && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleDocumentExpansion(requirementId)}>
                        {isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                  {reqItem.isRequired && (
                    <span className="text-[9px] text-red-500 font-bold uppercase">Required</span>
                  )}
                  {reqItem.isMultiDocument && (
                    <span className="text-[9px] text-blue-500 font-medium">
                      Multiple documents of this type
                    </span>
                  )}
                  
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
  
  // Parent now provides getDocumentDataForPreview which checks the pre-filtered state
  const docData = isApplicable ? getDocumentDataForPreview(col.task, reqItem, col.type, col.id) : null;

  return (
    <TableCell key={`${requirementId}-col-${colIdx}`} className="text-center border p-2">
      {!isApplicable ? (
        <span className="text-[10px] text-gray-300 font-medium italic">N/A</span>
      ) : (
        <div className="flex items-center justify-center gap-1">
          {/* Generate template button for requirements with templates */}
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
          
          {/* Existing document status (upload/view buttons) */}
          {renderDocumentStatus(col.task, reqItem, col.type, col.id)}
        </div>
      )}
    </TableCell>
  );
})}
            </TableRow>

            {/* Expanded Field Data Rows */}
            {isExpanded && fieldsToRender.map((field, fIdx) => (
              <TableRow key={`${requirementId}-field-${field.id}`} className="bg-slate-50/50">
                <TableCell className="sticky left-0 bg-slate-50 border-r text-center text-[10px] text-gray-400">
                  {reqIndex + 1}.{fIdx + 1}
                </TableCell>
                <TableCell className="sticky left-16 bg-slate-50 border-r pl-8 text-[11px] text-slate-500 italic">
                  {field.name}
                </TableCell>
                {columnDefinitions.map((col, colIdx) => {
                  const isApplicable = checkApplicability(col.type, reqItem);
                  // Use the single document ID for field extraction
                  const docData = isApplicable ? getDocumentDataForPreview(col.task, reqItem, col.type, col.id) : null;
                  return (
                    <TableCell key={`${field.id}-val-${colIdx}`} className="text-center border p-1 text-[11px] text-slate-600">
                      {isApplicable ? (docData?.extracted_details?.[field.name] || '-') : '-'}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </React.Fragment>
        );
      });
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
                        {/* File Info Bar */}
                        <div className="p-4 bg-slate-50 border-b flex justify-between items-center sticky top-0 z-20">
                          <div className="flex items-center gap-3">
                            <div className="bg-white p-2 rounded-lg border shadow-sm">
                              <FileText className="h-5 w-5 text-blue-600" />
                            </div>
                            <div className="flex flex-col">
                              <p className="text-sm font-bold text-slate-800 line-clamp-1">{doc.file_name || 'Document'}</p>
                              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">ID: {docId}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* We use the props from the parent (RequirementsTableCombined) */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() => handleDeleteDocument?.(doc)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              className="h-9 bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-200"
                              onClick={() => handleSaveEditedDocument?.(doc)}
                            >
                              <Save className="h-4 w-4 mr-2" /> Save Changes
                            </Button>
                          </div>
                        </div>

                        <div className="p-0 lg:p-4">
                          <ExtractionPreview
                            key={docId}
                            documentId={docId}
                            documentName={previewingDocuments?.document_display_name || 'Document'}
                            // Pass the details object
                            extractedData={doc.edited_details || doc.extracted_details || {}}
                            // Pass the schema array
                            fields={previewingDocuments?.document_fields || []}
                            // Construct the full URL
                            fileUrl={getFileUrl(doc.file_path)}
                            fileName={doc.file_name || 'document.pdf'}
                            expanded={true}
                            showSaveButton={false}
                            // Pass down handlers to the internal DocumentActions
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
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[9px] bg-black/20 rounded px-1.5 py-0.5 font-medium tracking-wider">
                            {col.subLabel}
                          </span>
                          {col.role && (
                            <span className="text-[8px] bg-blue-900/20 text-white rounded px-1.5 py-0.5 font-medium tracking-wider">
                              {Array.isArray(col.role) ? col.role.join(', ') : col.role}
                            </span>
                          )}
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
                        {expandedSections.templates ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />} Templates
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedSections.templates && renderDocumentSection(organizedRequirements.documents.templates, 'templates')}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {
        showTemplateGenerator && selectedLetterInfo && (
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
          />
        )
      }
    </div >
  );
}