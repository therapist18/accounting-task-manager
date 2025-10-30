// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, Briefcase, Users, Plus, Minus, UserCheck, Loader2, Download, FileText, FileUp, Trash2, RefreshCw, Wand2, Save } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { UploadModal } from "@/components/UploadModal"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import supabase from "@/lib/supabase/client"
import { toast } from "@/components/ui/use-toast"
import htmlDocx from 'html-docx-js/dist/html-docx';
import TemplateGenerationDialog from "./TemplateGenerationDialog"
import { StageUploadDialog } from "../tasks/components/StageUploadDialog"

const generateDocxBlobFromHtml = (html: string) => {
  const blob = htmlDocx.asBlob(html);
  return blob;
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
  
  // State for the unified template generation dialog
  const [showTemplateGenerator, setShowTemplateGenerator] = useState(false);
  const [selectedLetterInfo, setSelectedLetterInfo] = useState(null);
  
  const [isPreparingTemplate, setIsPreparingTemplate] = useState(false);
  const [masterFields, setMasterFields] = useState<Map<number, any>>(new Map());

  const classDocsAndFields = useMemo(() => classRequirements?.[0]?.documents_and_fields || [], [classRequirements]);

  useEffect(() => {
    const fetchMasterFields = async () => {
      try {
        const { data, error } = await supabase.from('tm_job_fields').select('*');
        if (error) throw error;
        const fieldsMap = new Map(data.map(field => [field.id, field]));
        setMasterFields(fieldsMap);
      } catch (error) {
        console.error("Failed to fetch master fields:", error);
        toast({ title: "Could not load master fields", variant: "destructive" });
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

        if (docIds.size > 0) {
            console.log(`    - by document_id:`, [...docIds]);
            const { data, error } = await supabase.from(table).select('*').in('document_id', [...docIds]);
            if (error) console.error(`    - ❌ ERROR fetching by document_id:`, error);
            else (data || []).forEach(rec => records.set(rec.id, rec));
        }

        for (const [linkVar, entityIdsSet] of links.entries()) {
            const entityIds = [...entityIdsSet];
            if (entityIds.length > 0) {
                console.log(`    - by linking_variable '${linkVar}':`, entityIds);
                const { data, error } = await supabase.from(table).select('*').in(linkVar, entityIds);
                if (error) {
                    console.error(`    - ❌ ERROR fetching by ${linkVar}:`, error);
                    toast({ title: `Failed to fetch from ${table}`, description: error.message, variant: "destructive" });
                } else {
                    (data || []).forEach(rec => records.set(rec.id, rec));
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

  const handleViewDocuments = (documents: any[], docInfo: any, person: any) => {
    setPreviewingDocuments({
      documents: documents.map(d => ({ ...d, edited_details: d.extracted_details || {} })),
      document_display_name: docInfo.display_name,
      person_full_name: person.full_name,
      document_fields: docInfo.fields,
    });
    setShowPreviewModal(true);
  };

  const handlePreviewDataChange = (docId, fieldName, value) => {
    setPreviewingDocuments(prev => ({
      ...prev,
      documents: prev.documents.map(d =>
        d.id === docId ? { ...d, edited_details: { ...d.edited_details, [fieldName]: value } } : d
      ),
    }));
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

  const totalColumns = useMemo(() => {
    const baseColumns = 2;
    const applicantColumns = filteredGroupedTasks.reduce((acc, group) => {
      const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
      const dependantCount = (group.dependantIds || []).length;
      return acc + 1 + 1 + dependantCount + (hasClassD ? 1 : 0);
    }, 0);
    const referenceColumns = hasReferencesColumn ? allReferences.length : 0;
    return baseColumns + applicantColumns + referenceColumns;
  }, [filteredGroupedTasks, hasReferencesColumn, allReferences]);

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

  const renderDocumentSection = (documents: any[], sectionName: string, classDocsAndFields: any[]) => {
    return documents
      .filter(docItem => !!docItem?.document?.id)
      .sort((a, b) => (a.document.custom_order || 999) - (b.document.custom_order || 999))
      .map((docItem, docIndex) => {
        const documentId = docItem.document.id;
        const isExpanded = expandedDocuments.has(documentId);
        const allPossibleFields = docItem.document.fields || [];
        let fieldsToRender = [];

        const requirementConfig = classDocsAndFields.find(d => d.id === documentId);
        const whitelistedFields = requirementConfig?.fields || [];

        if (whitelistedFields.length > 0) {
          const whitelistedFieldIds = new Set(whitelistedFields.map(f => f.id));
          fieldsToRender = allPossibleFields.filter(field => whitelistedFieldIds.has(field.id));
        }

        const hasFields = fieldsToRender.length > 0;
        if (sectionName === 'letters') {
          return (
            <TableRow key={`letter-doc-${docItem.document.id}`} className="group bg-white hover:bg-gray-50">
              <TableCell className="sticky left-0 bg-white group-hover:bg-gray-50 border-r z-[5] text-center">{docIndex + 1}.</TableCell>
              <TableCell className="sticky left-16 bg-white group-hover:bg-gray-50 border-r z-[5] px-4">{docItem.document.display_name}</TableCell>
              {filteredGroupedTasks.map((group, groupIndex) => {
                const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                const dependantIds = group.dependantIds || [];
                const task = group.tasks[0];
                return (
                  <React.Fragment key={`letter-group-${groupIndex}`}>
                    {[
                      { type: 'company' }, { type: 'principal' },
                      ...dependantIds.map(id => ({ type: 'dependant', id })),
                      ...(hasClassD ? [{ type: 'understudy' }] : [])
                    ].map(col => {
                      const docCategory = docItem.document.category;
                      let isApplicableForColumn = false;
                      let cellContent;

                      if (col.type === 'company') {
                        isApplicableForColumn = docCategory === 'company-docs';
                      } else {
                        isApplicableForColumn = docCategory !== 'company-docs';
                      }

                      if (!isApplicableForColumn) {
                        cellContent = <span className="text-xs text-gray-500">N/A</span>;
                      } else {
                        const docForPreview = getDocumentDataForPreview(task, docItem.document, col.type, col.id);
                        if (docForPreview) {
                          cellContent = renderDocumentStatus(task, docItem.document, col.type, col.id);
                        } else {
                          cellContent = (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenTemplateGenerator(docItem, task, col.type, col.id)}
                              disabled={isPreparingTemplate}
                            >
                              {isPreparingTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                              Generate
                            </Button>
                          );
                        }
                      }

                      return (
                        <TableCell key={`letter-cell-${col.type}-${col.id || groupIndex}`} className="text-center border p-1">
                          {cellContent}
                        </TableCell>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              {hasReferencesColumn && allReferences.map(ref => <TableCell key={`letter-ref-${ref.id}`} />)}
            </TableRow>
          );
        }

        return (
          <React.Fragment key={`${sectionName}-doc-fragment-${docItem.document.id}`}>
            <TableRow className="group bg-white hover:bg-gray-50">
              <TableCell className="sticky left-0 bg-white group-hover:bg-gray-50 border-r z-[5] text-center">{docIndex + 1}.</TableCell>
              <TableCell className="sticky left-16 bg-white group-hover:bg-gray-50 border-r z-[5]">
                <div className="flex items-center px-2">
                  <span>{docItem.document.display_name}</span>
                  {hasFields && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-2" onClick={() => toggleDocumentExpansion(docItem.document.id)}>
                      {isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </TableCell>

              {filteredGroupedTasks.map((group, groupIndex) => {
                const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                const dependantIds = group.dependantIds || [];
                const task = group.tasks[0];
                return (
                  <React.Fragment key={`${sectionName}-doc-group-${groupIndex}`}>
                    {[
                      { type: 'company' }, { type: 'principal' },
                      ...dependantIds.map(id => ({ type: 'dependant', id })),
                      ...(hasClassD ? [{ type: 'understudy' }] : [])
                    ].map(col => {
                      const docForPreview = getDocumentDataForPreview(task, docItem.document, col.type, col.id);
                      const statusNode = renderDocumentStatus(task, docItem.document, col.type, col.id);
                      return (
                        <TableCell key={`${sectionName}-d-${col.type}-${col.id || groupIndex}`} className="text-center border p-1">
                          {docForPreview ? (
                            <div className="cursor-pointer" onClick={() => handleViewDocuments([docForPreview], docItem.document, { full_name: 'Entity Name' })} title="Click to view document">
                              {statusNode}
                            </div>
                          ) : (statusNode)}
                        </TableCell>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              {hasReferencesColumn && allReferences.map(ref => {
                const docForPreview = getDocumentDataForPreview(filteredGroupedTasks[0]?.tasks[0], docItem.document, 'reference', ref.member);
                const statusNode = renderDocumentStatus(filteredGroupedTasks[0]?.tasks[0], docItem.document, 'reference', ref.member);
                return (
                  <TableCell key={`${sectionName}-d-ref-${ref.id}`} className="text-center border p-1">
                    {docForPreview ? (
                      <div className="cursor-pointer" onClick={() => handleViewDocuments([docForPreview], docItem.document, { full_name: ref.name })} title="Click to view document">
                        {statusNode}
                      </div>
                    ) : (statusNode)}
                  </TableCell>
                )
              })}
            </TableRow>

            {isExpanded && hasFields && fieldsToRender.map((field, fieldIndex) => {
              return (
                <TableRow key={`${sectionName}-field-${docItem.document.id}-${field.id}`} className="bg-gray-50 hover:bg-gray-100">
                  <TableCell className="sticky left-0 bg-gray-50 hover:bg-gray-100 border-r z-[5] text-center text-sm text-gray-500">{`${docIndex + 1}.${fieldIndex + 1}`}</TableCell>
                  <TableCell className="sticky left-16 bg-gray-50 hover:bg-gray-100 border-r z-[5] pl-8 text-sm">{field.name || field.fieldName}</TableCell>

                  {filteredGroupedTasks.map((group, groupIndex) => {
                    const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                    const dependantIds = group.dependantIds || [];
                    const task = group.tasks[0];
                    return (
                      <React.Fragment key={`${sectionName}-field-group-${groupIndex}`}>
                        {[
                          { type: 'company' }, { type: 'principal' },
                          ...dependantIds.map(id => ({ type: 'dependant', id })),
                          ...(hasClassD ? [{ type: 'understudy' }] : [])
                        ].map(col => {
                          const docData = getDocumentDataForPreview(task, docItem.document, col.type, col.id);
                          const extractedData = docData?.extracted_details || {};
                          const fieldValue = extractedData[field.name] || extractedData[field.id] || '-';

                          return (
                            <TableCell key={`${sectionName}-df-${col.type}-${col.id || groupIndex}`} className="text-center border p-1 text-sm">
                              {fieldValue}
                            </TableCell>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                  {hasReferencesColumn && allReferences.map(ref => {
                    const docData = getDocumentDataForPreview(filteredGroupedTasks[0]?.tasks[0], docItem.document, 'reference', ref.member);
                    const extractedData = docData?.extracted_details || {};
                    const fieldValue = extractedData[field.name] || extractedData[field.id] || '-';
                    return (
                      <TableCell key={`${sectionName}-df-ref-${ref.id}`} className="text-center border p-1 text-sm">
                        {fieldValue}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </React.Fragment>
        );
      });
  };

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

      {showPreviewModal && previewingDocuments && (
        <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
          <DialogContent className="max-w-[95vw] w-full max-h-[95vh] flex flex-col p-0">
            <DialogHeader className="p-4 border-b">
              <DialogTitle>
                Preview: {previewingDocuments.document_display_name} - {previewingDocuments.person_full_name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-grow overflow-y-auto p-4 space-y-4">
              {previewingDocuments.documents.map((doc, index) => {
                const hasChanges = !deepEqual(doc.extracted_details, doc.edited_details);
                return (
                  <div key={doc.id} className="border rounded-lg shadow-sm">
                    <div className="p-3 bg-gray-50 border-b flex justify-between items-center">
                      <h3 className="font-medium text-sm">Document {index + 1}</h3>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="hover:bg-red-100"
                          onClick={() => handleDeleteDocument(doc)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Delete
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="hover:bg-blue-100"
                          onClick={() => handleRetryExtraction(doc)}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" /> Retry
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          disabled={!hasChanges}
                          className="bg-green-500 hover:bg-green-700"
                          onClick={() => handleSaveEditedDocument(doc)}
                        >
                          {hasChanges ? 'Save Changes' : 'Saved'}
                        </Button>
                      </div>
                    </div>
                    <div className="p-4">
                      <ExtractionPreview
                        extractedData={doc.edited_details || {}}
                        fields={previewingDocuments.document_fields || []}
                        fileUrl={doc.file_path}
                        fileName={doc.file_name}
                        expanded
                        showSaveButton={false}
                        onDataChange={(fieldName, value) =>
                          handlePreviewDataChange(doc.id, fieldName, value)
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showTemplateGenerator && selectedLetterInfo && (
        <TemplateGenerationDialog
          isOpen={showTemplateGenerator}
          onClose={() => setShowTemplateGenerator(false)}
          template={selectedLetterInfo.template} // This is the pre-selected one, or null
          availableTemplates={selectedLetterInfo.availableTemplates} // The full list
          documentName={selectedLetterInfo.document.display_name}
          onSave={handleSaveGeneratedLetter}
          masterFields={selectedLetterInfo.masterFields}
          entityIdMap={selectedLetterInfo.entityIdMap}
          sourceDataCache={selectedLetterInfo.sourceDataCache}
          personData={selectedLetterInfo.personData}
          companyData={selectedLetterInfo.companyData}
          extractedData={selectedLetterInfo.extractedData}
        />
      )}

      <Table className="min-w-full w-full border-collapse">
        <TableHeader className="sticky top-0 z-10">
          <TableRow className="h-16">
            <TableHead className="sticky left-0 bg-blue-600 border-r border-blue-500 w-16 z-20 text-white text-center font-semibold">#</TableHead>
            <TableHead className="sticky left-16 bg-blue-600 border-r border-blue-500 w-[300px] z-20 text-white font-semibold">Requirements</TableHead>
            {filteredGroupedTasks.map((group, groupIndex) => {
              const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
              const { principalId, understudyId } = group.tasks.reduce((acc, task) => {
                if (task.applicant_type === 'principal') acc.principalId = task.individual_id;
                if (task.applicant_type === 'understudy') acc.understudyId = task.individual_id;
                return acc;
              }, { principalId: null, understudyId: null });
              const principalName = principalId && individualNames[principalId];
              const understudyName = understudyId && individualNames[understudyId];
              const companyId = group.tasks[0]?.company_id;
              const company = companyId ? companyData[companyId] : null;
              return [
                <TableHead key={`${groupIndex}-company`} className="bg-gray-600 border-r border-gray-400 text-white text-center font-semibold min-w-[170px] px-2 py-2">
                  <div className="flex flex-col items-center justify-center gap-1.5 h-full">
                    <Briefcase className="h-4 w-4" />
                    {company ? (<span className="text-sm font-bold truncate max-w-[150px]" title={company.company_name}>{company.company_name}</span>) : (<span className="text-xs opacity-80">Company</span>)}
                  </div>
                </TableHead>,
                <TableHead key={`${groupIndex}-principal`} className="bg-blue-600 border-r border-blue-400 text-white text-center font-semibold min-w-[170px] px-2 py-2">
                  <div className="flex flex-col items-center justify-center gap-1.5 h-full">
                    <UserCheck className="h-4 w-4" />
                    {principalName ? (<><span className="text-sm font-bold truncate max-w-[150px]" title={principalName}>{principalName}</span><span className="text-xs opacity-80">Principal</span></>) : (<span className="text-xs opacity-80">Principal</span>)}
                  </div>
                </TableHead>,
                ...(group.dependantIds || []).map((dependantId, depIndex) => {
                  const dependantName = individualNames[dependantId];
                  return (
                    <TableHead key={`${groupIndex}-dependant-${dependantId}`} className={'bg-blue-500 border-r border-blue-400 text-white text-center font-semibold min-w-[170px] px-2 py-2'}>
                      <div className="flex flex-col items-center justify-center gap-1.5 h-full">
                        <Users className="h-4 w-4" />
                        {dependantName ? (<><span className="text-sm font-bold truncate max-w-[150px]" title={dependantName}>{dependantName}</span><span className="text-xs opacity-80">{`Dependant ${depIndex + 1}`}</span></>) : (<span className="text-xs opacity-80">{`Dependant ${depIndex + 1}`}</span>)}
                      </div>
                    </TableHead>
                  );
                }),
                hasClassD && (
                  <TableHead key={`${groupIndex}-understudy`} className="bg-blue-400 border-r border-blue-400 text-white text-center font-semibold min-w-[170px] px-2 py-2">
                    <div className="flex flex-col items-center justify-center gap-1.5 h-full">
                      <UserCheck className="h-4 w-4" />
                      {understudyName ? (<><span className="text-sm font-bold truncate max-w-[150px]" title={understudyName}>{understudyName}</span><span className="text-xs opacity-80">Understudy</span></>) : (<span className="text-xs opacity-80">Understudy</span>)}
                    </div>
                  </TableHead>
                )
              ];
            })}
            {hasReferencesColumn && allReferences.map((reference, refIndex) => (
              <TableHead key={`reference-${reference.id}`} className="bg-purple-600 border-r border-purple-400 text-white text-center font-semibold min-w-[170px] px-2 py-2">
                <div className="flex flex-col items-center justify-center gap-1.5 h-full">
                  <Users className="h-4 w-4" />
                  <span className="text-sm font-bold truncate max-w-[150px]" title={reference.name}>{reference.name}</span>
                  <span className="text-xs opacity-80">Reference {refIndex + 1}</span>
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y">
          {loading ? (<TableRow><TableCell colSpan={totalColumns} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>)
            : error ? (<TableRow><TableCell colSpan={totalColumns} className="h-24 text-center text-destructive"><AlertTriangle className="mx-auto h-6 w-6" />{error}</TableCell></TableRow>)
              : (<>
                {organizedRequirements.documents.company.length > 0 && (
                  <>
                    <TableRow className="bg-gray-100 hover:bg-gray-200 cursor-pointer" onClick={() => toggleSectionExpansion('company')}>
                      <TableCell colSpan={totalColumns} className="px-4 py-2 font-semibold text-gray-700">
                        <div className="flex items-center gap-2">
                          {expandedSections.company ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Company Documents
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedSections.company && renderDocumentSection(organizedRequirements.documents.company, 'company', classDocsAndFields)}
                  </>
                )}

                {organizedRequirements.documents.individual.length > 0 && (
                  <>
                    <TableRow className="bg-gray-100 hover:bg-gray-200 cursor-pointer" onClick={() => toggleSectionExpansion('individual')}>
                      <TableCell colSpan={totalColumns} className="px-4 py-2 font-semibold text-gray-700">
                        <div className="flex items-center gap-2">
                          {expandedSections.individual ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Individual Documents
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedSections.individual && renderDocumentSection(organizedRequirements.documents.individual, 'individual', classDocsAndFields)}
                  </>
                )}

                {organizedRequirements.documents.letters.length > 0 && (
                  <>
                    <TableRow className="bg-gray-100 hover:bg-gray-200 cursor-pointer" onClick={() => toggleSectionExpansion('letters')}>
                      <TableCell colSpan={totalColumns} className="px-4 py-2 font-semibold text-gray-700">
                        <div className="flex items-center gap-2">
                          {expandedSections.letters ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Letters
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedSections.letters && renderDocumentSection(organizedRequirements.documents.letters, 'letters', classDocsAndFields)}
                  </>
                )}

                {organizedRequirements.documents.company.length === 0 && organizedRequirements.documents.individual.length === 0 && organizedRequirements.documents.letters.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={totalColumns} className="text-center p-8 text-muted-foreground">
                      No requirements found for this applicant.
                    </TableCell>
                  </TableRow>
                )}
              </>)}
        </TableBody>
      </Table>
    </div>
  );
}