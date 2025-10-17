// @ts-nocheck
"use client"

import React, { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, Briefcase, Users, Plus, Minus, UserCheck, Loader2, Download, FileText, FileUp } from "lucide-react"
import { StageUploadDialog } from "../components/StageUploadDialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import ExtractionPreview from "@/components/ExtractionPreview"
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

const CLASS_D_ID = '1750687058159';

interface RequirementsTableCombinedProps {
  loading: boolean
  error: string | null
  filteredGroupedTasks: any[]
  organizedRequirements: any
  expandedDocuments: Set<string>
  toggleDocumentExpansion: (documentId: string) => void
  // PROP REVERTED: Now just returns the React Node to display (e.g., a badge or an upload button).
  renderDocumentStatus: (task: any, item: any, columnType: 'company' | 'principal' | 'dependant' | 'understudy' | 'reference', referenceId?: number, isPostApplication?: boolean) => React.ReactNode
  // NEW PROP: Specifically for getting document data to pass to the previewer. Returns null if no document.
  getDocumentDataForPreview: (task: any, item: any, columnType: 'company' | 'principal' | 'dependant' | 'understudy' | 'reference', referenceId?: number) => any | null
  // NEW PROP: Returns a simple text representation ('Yes', 'No', 'N/A') for the data export.
  getDocumentStatusText: (task: any, item: any, columnType: 'company' | 'principal' | 'dependant' | 'understudy' | 'reference', referenceId?: number) => string
  renderClientFieldData: (task: any, item: any, columnType: 'company' | 'principal' | 'dependant' | 'understudy') => React.ReactNode
  renderReferencesData: (task: any, columnType: 'principal' | 'dependant' | 'understudy', dependantId?: number) => React.ReactNode
  hasReferencesColumn: boolean
  individualNames: Record<number, string>
  companyData: Record<number, any>
  getCurrentRequirements: () => any[]
  fuzzyMatch: (str1: string, str2: string, threshold?: number) => boolean
  kycDocuments: Map<string, any> // Needed for the previewer
}

export default function RequirementsTableCombined({
  loading,
  error,
  filteredGroupedTasks,
  organizedRequirements,
  expandedDocuments,
  toggleDocumentExpansion,
  renderDocumentStatus,
  getDocumentDataForPreview,
  getDocumentStatusText,
  renderClientFieldData,
  renderReferencesData,
  hasReferencesColumn,
  individualNames,
  companyData,
  getCurrentRequirements,
  fuzzyMatch,
  kycDocuments
}: RequirementsTableCombinedProps) {

  const [isStageDialogOpen, setIsStageDialogOpen] = useState(false);
  const [selectedStageTask, setSelectedStageTask] = useState<{ task: any, stage: any } | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    company: true,
    individual: true,
  });
  const [previewDocument, setPreviewDocument] = useState<any>(null);

  const handleViewDocument = async (document: any) => {
    if (!document || document.indicator === true) {
      console.warn("Preview is not available for this document.");
      return;
    }

    const kycId = document.document_id;
    const kycData = kycDocuments.get(kycId);
    if (!kycData) {
      console.error("Failed to load document configuration.");
      return;
    }

    const documentName = kycData.display_name || kycData.name || 'Document';
    const kycFields = kycData.fields || [];
    const fields = kycFields.map((field: any) => ({
      id: field.id || field.fieldName,
      name: field.fieldName,
      type: field.fieldType,
    }));

    const bucketName = 'kyc-documents';
    const filePath = document.file_path?.startsWith(bucketName)
      ? document.file_path
      : `${bucketName}/${document.file_path}`;
    const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
    const fileName = document.file_path?.split('/').pop() || documentName;

    setPreviewDocument({
      documentId: document.id,
      documentName,
      fileUrl,
      fileName,
      extractedData: document.extracted_details || {},
      fields,
      file: { name: fileName, url: fileUrl },
      type: kycData.documentType || 'document',
    });
  };

  const toggleSectionExpansion = (section: 'company' | 'individual') => {
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

  const getTotalColumns = () => {
    const baseColumns = 2; // # and Requirements
    const applicantColumns = filteredGroupedTasks.reduce((acc, group) => {
      const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
      const dependantCount = (group.dependantIds || []).length;
      let groupColumns = 1 + 1 + dependantCount;
      if (hasClassD) groupColumns += 1;
      return acc + groupColumns;
    }, 0);
    const referenceColumns = hasReferencesColumn ? allReferences.length : 0;
    return baseColumns + applicantColumns + referenceColumns;
  };

  const totalColumns = getTotalColumns();

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
      .sort((a,b) => (a.document.custom_order || 999) - (b.document.custom_order || 999))
      .forEach((docItem, index) => worksheetData.push([`${index + 1}.`, docItem.document.display_name, ...Array(headers.length - 2).fill(" ")]));
    
    worksheetData.push(["Individual Documents", ...Array(headers.length - 1).fill("")]);
    organizedRequirements.documents.individual
      .sort((a,b) => (a.document.custom_order || 999) - (b.document.custom_order || 999))
      .forEach((docItem, index) => worksheetData.push([`${index + 1}.`, docItem.document.display_name, ...Array(headers.length - 2).fill(" ")]));

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Requirements Checklist");
    XLSX.writeFile(workbook, "Requirements_Checklist.xlsx");
  };

  const handleExportData = () => {
    const worksheetData: any[] = [];
    const headers = ["#", "Requirement"];
    const entityColumns: {type: string, id?: number, name: string, groupIndex: number}[] = [];

    filteredGroupedTasks.forEach((group, groupIndex) => {
      const companyId = group.tasks[0]?.company_id;
      const company = companyId ? companyData[companyId] : null;
      headers.push(company ? company.company_name : `Company (Group ${groupIndex+1})`);
      entityColumns.push({ type: 'company', name: 'company', groupIndex });
      
      const { principalId, understudyId } = group.tasks.reduce((acc, task) => {
        if (task.applicant_type === 'principal') acc.principalId = task.individual_id;
        if (task.applicant_type === 'understudy') acc.understudyId = task.individual_id;
        return acc;
      }, { principalId: null, understudyId: null });

      headers.push(individualNames[principalId] || `Principal (Group ${groupIndex+1})`);
      entityColumns.push({ type: 'principal', name: 'principal', groupIndex });
      (group.dependantIds || []).forEach((id, depIndex) => {
          headers.push(individualNames[id] || `Dependant ${depIndex + 1} (Group ${groupIndex+1})`);
          entityColumns.push({ type: 'dependant', id, name: 'dependant', groupIndex });
      });
      if (group.tasks.some(task => task.class_id === CLASS_D_ID)) {
          headers.push(individualNames[understudyId] || `Understudy (Group ${groupIndex+1})`);
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
        .sort((a,b) => (a.document.custom_order || 999) - (b.document.custom_order || 999))
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

      <Dialog open={!!previewDocument} onOpenChange={(isOpen) => !isOpen && setPreviewDocument(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Document Preview: {previewDocument?.documentName}</DialogTitle>
            <DialogDescription>Review the extracted details and document.</DialogDescription>
          </DialogHeader>
          {previewDocument && (
            <div className="flex-grow overflow-hidden">
              <ExtractionPreview
                documentId={previewDocument.documentId}
                documentName={previewDocument.documentName}
                fileUrl={previewDocument.fileUrl}
                extractedData={previewDocument.extractedData}
                fields={previewDocument.fields}
                onClose={() => setPreviewDocument(null)}
                onSave={() => setPreviewDocument(null)}
                file={previewDocument.file}
                type={previewDocument.type}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                  {expandedSections.company && organizedRequirements.documents.company.sort((a,b) => (a.document.custom_order || 999) - (b.document.custom_order || 999)).map((docItem, docIndex) => {
                    const isExpanded = expandedDocuments.has(docItem.document.id);
                    return (
                      <TableRow key={`company-doc-${docItem.document.id}`} className="group bg-white hover:bg-gray-50">
                        <TableCell className="sticky left-0 bg-white group-hover:bg-gray-50 border-r z-[5] text-center">{docIndex + 1}.</TableCell>
                        <TableCell className="sticky left-16 bg-white group-hover:bg-gray-50 border-r z-[5]">
                          <div className="flex items-center px-2">
                            <span>{docItem.document.display_name}</span>
                            {docItem.fields.length > 0 && 
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-2" onClick={() => toggleDocumentExpansion(docItem.document.id)}>
                                {isExpanded ? <Minus /> : <Plus />}
                              </Button>
                            }
                          </div>
                        </TableCell>
                        {filteredGroupedTasks.map((group, groupIndex) => {
                          const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                          const dependantIds = group.dependantIds || [];
                          const task = group.tasks[0];
                          return (
                            <React.Fragment key={`company-doc-group-${groupIndex}`}>
                              {[
                                { type: 'company' },
                                { type: 'principal' },
                                ...dependantIds.map(id => ({ type: 'dependant', id })),
                                ...(hasClassD ? [{ type: 'understudy' }] : [])
                              ].map(col => {
                                const docForPreview = getDocumentDataForPreview(task, docItem.document, col.type, col.id);
                                const statusNode = renderDocumentStatus(task, docItem.document, col.type, col.id);
                                return (
                                  <TableCell key={`cd-${col.type}-${col.id || groupIndex}`} className="text-center border p-1">
                                    {docForPreview ? (
                                      <div className="cursor-pointer" onClick={() => handleViewDocument(docForPreview)} title="Click to view document">
                                        {statusNode}
                                      </div>
                                    ) : (
                                      statusNode
                                    )}
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
                            <TableCell key={`cd-ref-${ref.id}`} className="text-center border p-1">
                               {docForPreview ? (
                                <div className="cursor-pointer" onClick={() => handleViewDocument(docForPreview)} title="Click to view document">
                                  {statusNode}
                                </div>
                              ) : (
                                statusNode
                              )}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    );
                  })}
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
                  {expandedSections.individual && organizedRequirements.documents.individual.sort((a,b) => (a.document.custom_order || 999) - (b.document.custom_order || 999)).map((docItem, docIndex) => {
                    const isExpanded = expandedDocuments.has(docItem.document.id);
                    return (
                      <TableRow key={`ind-doc-${docItem.document.id}`} className="group bg-white hover:bg-gray-50">
                        <TableCell className="sticky left-0 bg-white group-hover:bg-gray-50 border-r z-[5] text-center">{docIndex + 1}.</TableCell>
                        <TableCell className="sticky left-16 bg-white group-hover:bg-gray-50 border-r z-[5]">
                          <div className="flex items-center px-2">
                            <span>{docItem.document.display_name}</span>
                            {docItem.fields.length > 0 && 
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-2" onClick={() => toggleDocumentExpansion(docItem.document.id)}>
                                {isExpanded ? <Minus /> : <Plus />}
                              </Button>
                            }
                          </div>
                        </TableCell>
                        {filteredGroupedTasks.map((group, groupIndex) => {
                          const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                          const dependantIds = group.dependantIds || [];
                          const task = group.tasks[0];
                          return (
                            <React.Fragment key={`ind-doc-group-${groupIndex}`}>
                              {[
                                { type: 'company' },
                                { type: 'principal' },
                                ...dependantIds.map(id => ({ type: 'dependant', id })),
                                ...(hasClassD ? [{ type: 'understudy' }] : [])
                              ].map(col => {
                                const docForPreview = getDocumentDataForPreview(task, docItem.document, col.type, col.id);
                                const statusNode = renderDocumentStatus(task, docItem.document, col.type, col.id);
                                return (
                                  <TableCell key={`id-${col.type}-${col.id || groupIndex}`} className="text-center border p-1">
                                    {docForPreview ? (
                                      <div className="cursor-pointer" onClick={() => handleViewDocument(docForPreview)} title="Click to view document">
                                        {statusNode}
                                      </div>
                                    ) : (
                                      statusNode
                                    )}
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
                            <TableCell key={`id-ref-${ref.id}`} className="text-center border p-1">
                               {docForPreview ? (
                                <div className="cursor-pointer" onClick={() => handleViewDocument(docForPreview)} title="Click to view document">
                                  {statusNode}
                                </div>
                              ) : (
                                statusNode
                              )}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    );
                  })}
                </>
              )}
              {organizedRequirements.documents.company.length === 0 && organizedRequirements.documents.individual.length === 0 && (
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