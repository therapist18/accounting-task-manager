// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, Briefcase, Users, Plus, Minus, UserCheck, Loader2, Download, FileText, FileUp, Trash2, RefreshCw, Wand2, Save } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { ExtractionPreview } from "@/components/ExtractionPreview"
import supabase from "@/lib/supabase/client"
import { toast } from "@/components/ui/use-toast"
let htmlDocx: any = null;
import('html-docx-js/dist/html-docx')
  .then(module => {
    htmlDocx = module.default || module;
  })
  .catch(err => console.error('Failed to load html-docx-js', err));

import TemplateGenerationDialog from "./TemplateGenerationDialog"
import { StageUploadDialog } from "../tasks/components/StageUploadDialog"
import { UploadModal } from "@/app/generic-components/UploadModal"

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

export default function RequirementsTableCombined({ loading, error, filteredGroupedTasks, organizedRequirements, classRequirements, expandedDocuments, toggleDocumentExpansion, renderDocumentStatus, getDocumentDataForPreview, getDocumentStatusText, renderClientFieldData, renderReferencesData, hasReferencesColumn, individualNames, companyData, getCurrentRequirements, fuzzyMatch, kycDocuments, documentTypes, mainTab, handleUploadSubmit, handleDeleteDocument, handleRetryExtraction, handleSaveEditedDocument, documentTemplates }: any) {
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
  
  // Debug effect for preview modal state
  useEffect(() => {
    console.log('🔍 Preview Modal State:', {
      isOpen: showPreviewModal,
      hasPreviewData: !!previewingDocuments,
      documentCount: previewingDocuments?.documents?.length || 0
    });
  }, [showPreviewModal, previewingDocuments]);

  // State for the unified template generation dialog
  const [showTemplateGenerator, setShowTemplateGenerator] = useState(false);
  const [selectedLetterInfo, setSelectedLetterInfo] = useState(null);

  const [isPreparingTemplate, setIsPreparingTemplate] = useState(false);
  const [masterFields, setMasterFields] = useState<Map<number, any>>(new Map());
  const hasFetchedMasterFields = useRef(false);

  const classDocsAndFields = useMemo(() => classRequirements?.[0]?.documents_and_fields || [], [classRequirements]);

  const columnDefinitions = useMemo(() => {
    const cols = [];
    filteredGroupedTasks.forEach((group, groupIndex) => {
      const task = group.tasks[0];
      const isCompanyApplicant = task?.applicant_type === 'company';
      const companyName = task?.company_name || 'Company'

      // 1. Company Column
      cols.push({
        type: 'company',
        id: task?.company_id,
        label: companyName,
        task,
        groupIndex
      });

      // 2. Individual Target Columns
      if (isCompanyApplicant) {
        // If company, individual requirements apply to Directors
        (task?.directors_details || []).forEach(director => {
          cols.push({ type: 'director', id: director.id, label: director.full_name, subLabel: director.role, task, groupIndex });
        });
      } else {
        // If individual, apply to Principal
        cols.push({ type: 'principal', id: task?.individual_id, label: individualNames[task?.individual_id] || 'Principal', subLabel: 'Principal', task, groupIndex });
      }

      // 3. Dependant Columns
      (group.dependantIds || []).forEach((depId, idx) => {
        cols.push({ type: 'dependant', id: depId, label: individualNames[depId] || `Dependant ${idx + 1}`, subLabel: 'Dependant', task, groupIndex });
      });

      // 4. Understudy Column
      if (group.tasks.some(t => t.class_id === CLASS_D_ID)) {
        cols.push({ type: 'understudy', id: task?.understudy_id, label: individualNames[task?.understudy_id] || 'Understudy', subLabel: 'Understudy', task, groupIndex });
      }
    });
    return cols;
  }, [filteredGroupedTasks, individualNames]);

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

  const fetchDocumentTemplates = async (documentId: string) => {
    try {
      const { data: templates, error } = await supabase
        .from('acc_portal_templates')
        .select('*')
        .eq('document_id', documentId)
        .order('file_name', { ascending: true });
      if (error) throw error;
      return templates || [];
    } catch (error) {
      console.error('Error fetching document templates:', error);
      return [];
    }
  };

  const handleOpenTemplateGenerator = async (docItem, task, colType, colId) => {
    console.log("🚀 Starting template generation process...", { document: docItem.document.display_name, task_id: task.id, colType, colId });
    setIsPreparingTemplate(true);
    try {
      const entityIdMap = {
        principal: task.individual_id,
        company: task.company_id,
        dependant: colType === 'dependant' ? colId : undefined,
        understudy: colType === 'understudy' ? colId || task.understudy_id : undefined,
      };
      console.log("✅ Step 1: Entity ID Map created", entityIdMap);

      const templates = await fetchDocumentTemplates(docItem.document.id);
      console.log(`✅ Step 2: Found ${templates.length} available templates.`);
      if (!templates || templates.length === 0) {
        toast({ title: 'No Templates Found', description: `No templates are available for: ${docItem.document.display_name}.`, variant: 'destructive' });
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
                  tableQueries.links.get(linkVar).add(entityId);
                });
              }
            }
          });
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
        // In RequirementsTableCombined.tsx, around line 180-210
        if (table === 'acc_portal_kyc_uploads') {
          // Get company ID from entityIdMap
          const companyId = entityIdMap.company;

          // Filter out non-UUID values from docIds
          const validKycDocIds = [...docIds].filter(id =>
            typeof id === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
          );

          if (validKycDocIds.length > 0) {
            console.log(`    - by kyc_document_id and company_id:`, { kyc_document_ids: validKycDocIds, company_id: companyId });

            // First, get all matching kyc_document_ids
            let query = supabase
              .from(table)
              .select('*')
              .in('kyc_document_id', validKycDocIds);

            // Then filter by company_id if available
            if (companyId) {
              query = query.eq('company_id', companyId);
            }

            const { data, error } = await query;

            if (error) {
              console.error(`    - ❌ ERROR fetching documents:`, error);
              toast({
                title: `Failed to fetch from ${table}`,
                description: error.message,
                variant: "destructive"
              });
            } else {
              (data || []).forEach(rec => records.set(rec.id, rec));
              console.log(`    - Found ${data?.length || 0} matching documents`);
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
            const entityIds = [...entityIdsSet];
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

      const letterInfo = {
        document: docItem.document,
        task: task,
        masterFields: masterFields,
        entityIdMap: entityIdMap,
        sourceDataCache: sourceDataCache,
        availableTemplates: templates,
        // Pre-select template if only one exists, otherwise null to trigger selection screen
        template: templates.length === 1 ? templates[0] : null,
        personData: {}, companyData: {}, extractedData: {},
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

const handleViewDocuments = (documents: any[], docInfo: any, column: any) => {
  if (!documents || documents.length === 0) return;

  const previewData = {
    documents: documents.map(d => ({
      ...d,
      // Ensure we have the details even if nested
      edited_details: d.edited_details || d.extracted_details || {},
      file_path: d.file_path || d.url || d.document_url,
      file_name: d.file_name || d.name || 'document.pdf',
      id: d.id
    })),
    document_display_name: docInfo?.display_name || 'Document',
    person_full_name: column?.label || '', // Use the column label (Name of person/company)
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
      const { principalId } = group.tasks.reduce((acc, task) => {
        if (task.applicant_type === 'principal') acc.principalId = task.individual_id;
        return acc;
      }, { principalId: null });
      headers.push(individualNames[principalId] || "Principal");
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

      const { principalId, understudyId } = group.tasks.reduce((acc, task) => {
        if (task.applicant_type === 'principal') acc.principalId = task.individual_id;
        if (task.applicant_type === 'understudy') acc.understudyId = task.individual_id;
        return acc;
      }, { principalId: null, understudyId: null });

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
        .sort((a, b) => (a.document.custom_order || 999) - (b.document.custom_order || 999))
        .forEach((docItem, index) => {
          const row = [`${index + 1}.`, docItem.document.display_name];
          entityColumns.forEach(col => {
            const task = filteredGroupedTasks[col.groupIndex]?.tasks[0];
            row.push(task ? getDocumentStatusText(task, docItem.document, col.name, col.id) : "N/A");
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

  const renderDocumentSection = (documents: any[], sectionName: string) => {
    return documents
      .filter(docItem => !!docItem?.document?.id)
      .sort((a, b) => (a.document.custom_order || 999) - (b.document.custom_order || 999))
      .map((docItem, docIndex) => {
        const documentId = docItem.document.id;
        const isExpanded = expandedDocuments.has(documentId);
        const docCategory = docItem.document?.category || '';
        const isCompanyDoc = docCategory === 'company-docs' || docCategory === 'company';

        const requirementConfig = classDocsAndFields.find(d => d.id === documentId);
        const whitelistedFieldIds = new Set(requirementConfig?.fields?.map(f => f.id) || []);
        const fieldsToRender = (docItem.document.fields || []).filter(f => whitelistedFieldIds.has(f.id));

        return (
          <React.Fragment key={`${sectionName}-${documentId}`}>
            <TableRow className="group bg-white hover:bg-gray-50">
              <TableCell className="sticky left-0 bg-white group-hover:bg-gray-50 border-r z-10 text-center">{docIndex + 1}</TableCell>
              <TableCell className="sticky left-16 bg-white group-hover:bg-gray-50 border-r z-10">
                <div className="flex items-center gap-2">
                  <span className="truncate max-w-[250px] font-medium">{docItem.document.display_name}</span>
                  {fieldsToRender.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleDocumentExpansion(documentId)}>
                      {isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </TableCell>

              {columnDefinitions.map((col, colIdx) => {
                const isApplicable = isCompanyDoc ? col.type === 'company' : col.type !== 'company';
                const docData = getDocumentDataForPreview(col.task, docItem.document, col.type, col.id);

               return (
  <TableCell key={`${documentId}-col-${colIdx}`} className="text-center border p-2">
    {!isApplicable ? (
      <span className="text-[10px] text-gray-400">N/A</span>
    ) : docData ? (
      // THIS IS THE FIX: Wrap the status in a clickable container
      <div 
        className="cursor-pointer hover:opacity-70 transition-opacity"
        onClick={() => {
          // docData usually contains the uploaded document record(s)
          const docsArray = Array.isArray(docData) ? docData : [docData];
          handleViewDocuments(docsArray, docItem.document, col);
        }}
      >
        {renderDocumentStatus(col.task, docItem.document, col.type, col.id)}
      </div>
    ) : (sectionName === 'letters' || docCategory === 'letters') ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                        onClick={() => handleOpenTemplateGenerator(docItem, col.task, col.type, col.id)}
                        disabled={isPreparingTemplate}
                      >
                        {isPreparingTemplate ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
                        <span className="text-[10px] font-bold">GENERATE</span>
                      </Button>
                    ) : (
                      renderDocumentStatus(col.task, docItem.document, col.type, col.id)
                    )}
                  </TableCell>
                );
              })}
            </TableRow>

            {/* Field Rows */}
            {isExpanded && fieldsToRender.map((field, fIdx) => (
              <TableRow key={`${documentId}-field-${field.id}`} className="bg-gray-50/50">
                <TableCell className="sticky left-0 bg-gray-50 border-r text-center text-[10px] text-gray-400">{docIndex + 1}.{fIdx + 1}</TableCell>
                <TableCell className="sticky left-16 bg-gray-50 border-r pl-8 text-[11px] text-gray-600 italic">{field.name}</TableCell>
                {columnDefinitions.map((col, colIdx) => {
                  const isApplicable = isCompanyDoc ? col.type === 'company' : col.type !== 'company';
                  const docData = isApplicable ? getDocumentDataForPreview(col.task, docItem.document, col.type, col.id) : null;
                  return (
                    <TableCell key={`${field.id}-val-${colIdx}`} className="text-center border p-1 text-[11px]">
                      {docData?.extracted_details?.[field.name] || docData?.extracted_details?.[field.id] || '-'}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </React.Fragment>
        );
      });
  };
// In RequirementsTableCombined.tsx, inside the render method where the ExtractionPreview is used
console.log('🔍 Rendering ExtractionPreview with data:', {
  showPreviewModal,
  hasPreviewData: !!previewingDocuments,
  documentName: previewingDocuments?.document_display_name,
  hasDocuments: previewingDocuments?.documents?.length > 0,
  firstDocument: previewingDocuments?.documents?.[0]
});
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
  <DialogContent className="max-w-[95vw] w-full max-h-[95vh] flex flex-col p-0 overflow-hidden">
    <DialogHeader className="p-4 border-b shrink-0">
      <DialogTitle>
        {previewingDocuments?.document_display_name || 'Document Preview'}
        {previewingDocuments?.person_full_name && ` - ${previewingDocuments.person_full_name}`}
      </DialogTitle>
      {/* ADD THIS: Fixes accessibility warning and helps Radix render reliably */}
      <DialogDescription className="sr-only">
        Previewing extracted data and document images.
      </DialogDescription>
    </DialogHeader>

    {/* Ensure this container has a set height and allows children to grow */}
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
      {previewingDocuments?.documents?.length > 0 ? (
        <div className="space-y-6 max-w-[1600px] mx-auto"> 
          {previewingDocuments.documents.map((doc, index) => (
            <div key={doc.id || `doc-${index}`} className="border rounded-xl bg-white shadow-md overflow-hidden">
              <div className="p-3 bg-slate-100 border-b flex justify-between items-center sticky top-0 z-10">
                <span className="font-bold text-sm text-slate-700">File: {doc.file_name}</span>
                <div className="flex space-x-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8"
                    onClick={() => handleDeleteDocument?.(doc)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 bg-green-600 hover:bg-green-700"
                    onClick={() => handleSaveEditedDocument?.(doc)}
                  >
                    <Save className="h-3.5 w-3.5 mr-1" /> Save
                  </Button>
                </div>
              </div>
              
              <div className="p-4">
                <ExtractionPreview
                  documentName={previewingDocuments.document_display_name}
                  extractedData={doc.edited_details || doc.extracted_details || {}}
                  fields={previewingDocuments.document_fields || []}
                  fileUrl={doc.file_path}
                  fileName={doc.file_name}
                  expanded={true} // Crucial
                  showSaveButton={false}
                  documentId={doc.id}
                  onDataChange={(fieldName, value) => {
                    handlePreviewDataChange(doc.id, fieldName, value);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-2" />
          <p>Loading document content...</p>
        </div>
      )}
    </div>
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
                        let bgColor = 'bg-blue-400';
                        if (col.type === 'company') bgColor = 'bg-gray-700';
                        else if (['director', 'principal', 'shareholder'].includes(col.type)) bgColor = 'bg-blue-600';
                        else if (col.type === 'dependant') bgColor = 'bg-blue-500';

                        return (
                          <TableHead key={`header-${idx}`} className={`${bgColor} text-white border-r border-white/20 min-w-[180px] p-2 text-center`}>
                            <div className="flex flex-col items-center gap-1">
                              {col.type === 'company' ? <Briefcase className="h-4 w-4 opacity-70" /> : <UserCheck className="h-4 w-4 opacity-70" />}
                              <span className="text-xs font-bold uppercase line-clamp-1">{col.label}</span>
                              <span className="text-[9px] opacity-60 tracking-widest">{col.subLabel || 'ENTITY'}</span>
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

                        <TableRow className="bg-slate-100 hover:bg-slate-200 cursor-pointer" onClick={() => toggleSectionExpansion('letters')}>
                          <TableCell colSpan={totalColumns} className="py-2 px-4 font-bold text-slate-700 border-t-2 border-white uppercase text-xs tracking-wider">
                            <div className="flex items-center gap-2">
                              {expandedSections.letters ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />} Letters & Forms
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedSections.letters && renderDocumentSection(organizedRequirements.documents.letters, 'letters')}
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
      />
    )
  }
          </div >
          );
}