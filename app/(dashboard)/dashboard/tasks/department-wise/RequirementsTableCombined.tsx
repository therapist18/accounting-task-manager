// @ts-nocheck
"use client"

import React, { useCallback, useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, Briefcase, Users, Plus, Minus, UserCheck, Loader2, User } from "lucide-react"
import { StageUploadDialog } from "../components/StageUploadDialog"

const CLASS_D_ID = '1750687058159';

interface RequirementsTableCombinedProps {
  loading: boolean
  error: string | null
  filteredGroupedTasks: any[]
  organizedRequirements: any
  expandedDocuments: Set<string>
  toggleDocumentExpansion: (documentId: string) => void
  renderDocumentStatus: (task: any, item: any, columnType: 'company' | 'principal' | 'dependant' | 'understudy' | 'reference', referenceId?: number, isPostApplication?: boolean) => React.ReactNode
  renderClientFieldData: (task: any, item: any, columnType: 'company' | 'principal' | 'dependant' | 'understudy') => React.ReactNode
  renderReferencesData: (task: any, columnType: 'principal' | 'dependant' | 'understudy', dependantId?: number) => React.ReactNode
  hasReferencesColumn: boolean
  individualNames: Record<number, string>
  companyData: Record<number, any>
  getCurrentRequirements: () => any[]
  fuzzyMatch: (str1: string, str2: string, threshold?: number) => boolean
}

export default function RequirementsTableCombined({
  loading,
  error,
  filteredGroupedTasks,
  organizedRequirements,
  expandedDocuments,
  toggleDocumentExpansion,
  renderDocumentStatus,
  renderClientFieldData,
  renderReferencesData,
  hasReferencesColumn,
  individualNames,
  companyData,
  getCurrentRequirements,
  fuzzyMatch
}: RequirementsTableCombinedProps) {

  const [isStageDialogOpen, setIsStageDialogOpen] = useState(false);
  const [selectedStageTask, setSelectedStageTask] = useState<{ task: any, stage: any } | null>(null);

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
    const baseColumns = 2; // # and Requirements
    const applicantColumns = filteredGroupedTasks.reduce((acc, group) => {
      const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
      const dependantCount = (group.dependantIds || []).length;
      let groupColumns = 1 + 1 + dependantCount; // Company + Principal + dependants
      if (hasClassD) groupColumns += 1;
      return acc + groupColumns;
    }, 0);
    const referenceColumns = hasReferencesColumn ? allReferences.length : 0;
    return baseColumns + applicantColumns + referenceColumns;
  }, [filteredGroupedTasks, hasReferencesColumn, allReferences]);


  return (
    <div className="space-y-4">
      <StageUploadDialog
        open={isStageDialogOpen}
        onOpenChange={setIsStageDialogOpen}
        selectedStageTask={selectedStageTask}
        getCurrentRequirements={getCurrentRequirements}
        fuzzyMatch={fuzzyMatch}
      />

      <Table className="min-w-full w-full border-collapse">
        <TableHeader className="sticky top-0 z-10">
          <TableRow className="h-12">
            <TableHead rowSpan={2} className="sticky left-0 bg-blue-600 border-r border-blue-500 w-16 z-20 text-white text-center font-semibold">#</TableHead>
            <TableHead rowSpan={2} className="sticky left-16 bg-blue-600 border-r border-blue-500 w-[300px] z-20 text-white font-semibold">Requirements</TableHead>
            {filteredGroupedTasks.map((group, groupIndex) => {
              const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
              const dependantCount = (group.dependantIds || []).length;
              let totalGroupCols = 1 + 1 + dependantCount;
              if (hasClassD) totalGroupCols += 1;
              const companyId = group.tasks[0]?.company_id;
              const company = companyId ? companyData[companyId] : null;
              return (
                <React.Fragment key={`group-${groupIndex}`}>
                  <TableHead
                    className="bg-gray-700 border-r border-gray-500 text-white text-center font-bold px-2"
                  >
                    {company ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-sm font-bold truncate max-w-[180px]" title={company.company_name}>
                          <Briefcase className="h-3 w-3 inline-block mr-1.5" />
                          {company.company_name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm font-medium">-</span>
                    )}
                  </TableHead>
                  <TableHead
                    className="bg-blue-700 border-r border-blue-500 text-white text-center font-bold px-2"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-sm font-bold truncate max-w-[180px]" title={group.applicantName}>
                        <User className="h-3 w-3 inline-block mr-1.5" />
                        {group.applicantName}
                      </span>
                      <span className="text-xs opacity-75">
                        {group.tasks.length} app{group.tasks.length !== 1 ? 's' : ''}
                        {dependantCount > 0 && ` • ${dependantCount} dep${dependantCount !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                  </TableHead>
                </React.Fragment>
              );
            })}
            {hasReferencesColumn && allReferences.length > 0 && (
              <TableHead colSpan={allReferences.length} className="bg-purple-700 border-r border-purple-500 text-white text-center font-bold px-2">
                References
              </TableHead>
            )}
          </TableRow>
          <TableRow className="h-14">
            {filteredGroupedTasks.map((group, groupIndex) => {
              const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
              const { principalId, understudyId } = group.tasks.reduce((acc, task) => {
                if (task.applicant_type === 'principal') acc.principalId = task.individual_id;
                if (task.applicant_type === 'understudy') acc.understudyId = task.individual_id;
                return acc;
              }, { principalId: null, understudyId: null });

              const principalName = principalId && individualNames[principalId];
              const understudyName = understudyId && individualNames[understudyId];
              const columns = [];

              // Company column
              const companyId = group.tasks[0]?.company_id;
              const company = companyId ? companyData[companyId] : null;

              columns.push(
                <TableHead
                  key={`${groupIndex}-company`}
                  className="bg-gray-600 border-r border-gray-400 text-white text-center font-semibold min-w-[200px] px-2 py-2"
                >
                  <div className="flex flex-col items-center gap-1">
                    <Briefcase className="h-4 w-4" />
                    <span className="text-xs">Company</span>
                    {company && (
                      <span className="text-xs font-medium truncate max-w-[180px]" title={company.company_name}>
                        {company.company_name}
                      </span>
                    )}
                  </div>
                </TableHead>
              );

              // Individual column
              columns.push(
                <TableHead
                  key={`${groupIndex}-individual`}
                  className="bg-blue-600 border-r border-blue-400 text-white text-center font-semibold min-w-[200px] px-2 py-2"
                >
                  <div className="flex flex-col items-center gap-1">
                    <User className="h-4 w-4" />
                    <span className="text-xs">Individual</span>
                    <div className="flex flex-col items-center gap-1">
                      {principalName ? (
                        <div className="flex items-center gap-1">
                          <UserCheck className="h-3 w-3" />
                          <span className="text-xs truncate max-w-[160px]" title={`${principalName} (Principal)`}>
                            {principalName}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs">-</span>
                      )}
                      {(group.dependantIds || []).map((dependantId, depIndex) => {
                        const dependantName = individualNames[dependantId];
                        return dependantName ? (
                          <div key={`dependant-${dependantId}`} className="flex items-center gap-1">
                            <User className="h-3 w-3 text-blue-200" />
                            <span className="text-xs truncate max-w-[160px]" title={`${dependantName} (Dependant ${depIndex + 1})`}>
                              {dependantName}
                            </span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                </TableHead>
              );

              // Understudy column if applicable
              if (hasClassD) {
                columns.push(
                  <TableHead
                    key={`${groupIndex}-understudy`}
                    className="bg-blue-400 border-r border-blue-400 text-white text-center font-semibold min-w-[150px] px-2 py-2"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs">Understudy</span>
                      {understudyName ? (
                        <div className="flex items-center gap-1">
                          <UserCheck className="h-3 w-3" />
                          <span className="text-xs truncate max-w-[100px]" title={understudyName}>
                            {understudyName}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs">-</span>
                      )}
                    </div>
                  </TableHead>
                );
              }

              return columns;
            })}

            {hasReferencesColumn && allReferences.map((reference, refIndex) => (
              <TableHead
                key={`reference-${reference.id}`}
                className="bg-purple-600 border-r border-purple-400 text-white text-center font-semibold min-w-[150px] px-2 py-2"
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs">Reference {refIndex + 1}</span>
                  <span className="text-xs truncate max-w-[100px]" title={reference.name}>
                    {reference.name}
                  </span>
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody className="divide-y">
          {loading ? (
            <TableRow>
              <TableCell colSpan={totalColumns} className="h-24 text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin" />
              </TableCell>
            </TableRow>
          ) : error ? (
            <TableRow>
              <TableCell colSpan={totalColumns} className="h-24 text-center text-destructive">
                <AlertTriangle className="mx-auto h-6 w-6" />
                {error}
              </TableCell>
            </TableRow>
          ) : (
            <>
              {/* Render company and individual documents side by side */}
              {organizedRequirements.documents.company.length > 0 ||
                organizedRequirements.documents.individual.length > 0 ? (
                Array.from({
                  length: Math.max(
                    organizedRequirements.documents.company.length,
                    organizedRequirements.documents.individual.length
                  )
                }).map((_, index) => {
                  const companyDoc = organizedRequirements.documents.company[index];
                  const individualDoc = organizedRequirements.documents.individual[index];
                  const hasCompanyDoc = !!companyDoc;
                  const hasIndividualDoc = !!individualDoc;

                  return (
                    <React.Fragment key={`doc-row-${index}`}>
                      <TableRow className="group bg-white hover:bg-gray-50">
                        {/* Document number */}
                        <TableCell
                          rowSpan={hasCompanyDoc && hasIndividualDoc ? 2 : 1}
                          className="sticky left-0 bg-white group-hover:bg-gray-50 border-r z-[5] text-center"
                        >
                          {index + 1}.
                        </TableCell>

                        {/* Company document */}
                        {hasCompanyDoc && (
                          <>
                            <TableCell className="sticky left-16 bg-white group-hover:bg-gray-50 border-r z-[5]">
                              <div className="flex items-center px-2">
                                <span>{companyDoc.document.display_name}</span>
                                {companyDoc.fields.length > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 ml-2"
                                    onClick={() => toggleDocumentExpansion(companyDoc.document.id)}
                                  >
                                    {expandedDocuments.has(companyDoc.document.id) ? <Minus /> : <Plus />}
                                  </Button>
                                )}
                              </div>
                            </TableCell>

                            {/* Document status cells for each group */}
                            {filteredGroupedTasks.map((group, groupIndex) => {
                              const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                              const dependantIds = group.dependantIds || [];

                              return (
                                <React.Fragment key={`company-doc-group-${groupIndex}`}>
                                  <TableCell className="text-center border p-1">
                                    {renderDocumentStatus(group.tasks[0], companyDoc.document, 'company')}
                                  </TableCell>
                                  <TableCell className="text-center border p-1">
                                    {renderDocumentStatus(group.tasks[0], companyDoc.document, 'principal')}
                                  </TableCell>
                                  {dependantIds.map(id => (
                                    <TableCell key={`cd-${id}`} className="text-center border p-1">
                                      {renderDocumentStatus(group.tasks[0], companyDoc.document, 'dependant', id)}
                                    </TableCell>
                                  ))}
                                  {hasClassD && (
                                    <TableCell className="text-center border p-1">
                                      {renderDocumentStatus(group.tasks[0], companyDoc.document, 'understudy')}
                                    </TableCell>
                                  )}
                                </React.Fragment>
                              );
                            })}

                            {/* Reference cells */}
                            {hasReferencesColumn && allReferences.map(ref => (
                              <TableCell
                                key={`cd-ref-${ref.id}`}
                                className="text-center border p-1"
                              >
                                {renderDocumentStatus(
                                  filteredGroupedTasks[0]?.tasks[0],
                                  companyDoc.document,
                                  'reference',
                                  ref.member
                                )}
                              </TableCell>
                            ))}
                          </>
                        )}
                      </TableRow>

                      {/* Individual document row (if exists) */}
                      {hasIndividualDoc && (
                        <TableRow className="group bg-white hover:bg-gray-50">
                          <TableCell className="sticky left-16 bg-white group-hover:bg-gray-50 border-r z-[5]">
                            <div className="flex items-center px-2">
                              <span>{individualDoc.document.display_name}</span>
                              {individualDoc.fields.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 ml-2"
                                  onClick={() => toggleDocumentExpansion(individualDoc.document.id)}
                                >
                                  {expandedDocuments.has(individualDoc.document.id) ? <Minus /> : <Plus />}
                                </Button>
                              )}
                            </div>
                          </TableCell>

                          {/* Individual document status cells for each group */}
                          {filteredGroupedTasks.map((group, groupIndex) => {
                            const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                            const dependantIds = group.dependantIds || [];

                            return (
                              <React.Fragment key={`ind-doc-group-${groupIndex}`}>
                                <TableCell className="text-center border p-1">
                                  {renderDocumentStatus(group.tasks[0], individualDoc.document, 'company')}
                                </TableCell>
                                <TableCell className="text-center border p-1">
                                  {renderDocumentStatus(group.tasks[0], individualDoc.document, 'principal')}
                                </TableCell>
                                {dependantIds.map(id => (
                                  <TableCell key={`id-${id}`} className="text-center border p-1">
                                    {renderDocumentStatus(group.tasks[0], individualDoc.document, 'dependant', id)}
                                  </TableCell>
                                ))}
                                {hasClassD && (
                                  <TableCell className="text-center border p-1">
                                    {renderDocumentStatus(group.tasks[0], individualDoc.document, 'understudy')}
                                  </TableCell>
                                )}
                              </React.Fragment>
                            );
                          })}

                          {/* Reference cells */}
                          {hasReferencesColumn && allReferences.map(ref => (
                            <TableCell
                              key={`id-ref-${ref.id}`}
                              className="text-center border p-1"
                            >
                              {renderDocumentStatus(
                                filteredGroupedTasks[0]?.tasks[0],
                                individualDoc.document,
                                'reference',
                                ref.member
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={totalColumns} className="text-center p-8 text-muted-foreground">
                    No requirements found for this applicant.
                  </TableCell>
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}