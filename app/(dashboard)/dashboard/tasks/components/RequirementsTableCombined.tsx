// @ts-nocheck
"use client"

import React, { useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertTriangle, FileText, Briefcase, Users, Plus, Minus, UserCheck, ChevronDown, ChevronUp } from "lucide-react"

const CLASS_D_ID = '1750687058159';

interface RequirementsTableCombinedProps {
  loading: boolean
  error: string | null
  filteredGroupedTasks: any[]
  organizedRequirements: any
  expandedDocuments: Set<string>
  toggleDocumentExpansion: (documentId: string) => void
  renderDocumentStatus: (task: any, item: any, columnType: 'principal' | 'dependant' | 'understudy' | 'reference', referenceId?: number, isPostApplication?: boolean) => React.ReactNode
  renderClientFieldData: (task: any, item: any) => React.ReactNode
  renderReferencesData: (task: any, columnType: 'principal' | 'dependant' | 'understudy', dependantId?: number) => React.ReactNode
  hasReferencesColumn: boolean
  documentTab: string
  activeTab: string
  calculateStats: any
  individualNames: Record<number, string>
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
  documentTab,
  activeTab,
  calculateStats,
  individualNames
}: RequirementsTableCombinedProps) {

  // State for managing section expansions
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set([
    'documents-fields',
    'company-documents',
    'individual-documents',
    'bcl-workings',
    'company-bcl',
    'individual-bcl',
    'post-application',
    'company-post-app',
    'individual-post-app',
    'client-fields',
    'individual-client-fields'
  ]));

  // Toggle section expansion
  const toggleSectionExpansion = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  }, []);

  // Expand all sections
  const expandAllSections = useCallback(() => {
    setExpandedSections(new Set([
      'documents-fields',
      'company-documents',
      'individual-documents',
      'bcl-workings',
      'company-bcl',
      'individual-bcl',
      'post-application',
      'company-post-app',
      'individual-post-app',
      'client-fields',
      'individual-client-fields'
    ]));
  }, []);

  // Collapse all sections
  const collapseAllSections = useCallback(() => {
    setExpandedSections(new Set());
  }, []);

  // Get all unique references across all tasks
  const allReferences = React.useMemo(() => {
    const referencesMap = new Map();

    filteredGroupedTasks.forEach(group => {
      group.tasks.forEach(task => {
        if (task.references && Array.isArray(task.references)) {
          task.references.forEach(reference => {
            const referenceId = reference.id;
            if (!referencesMap.has(referenceId)) {
              referencesMap.set(referenceId, {
                id: referenceId,
                name: reference.name || individualNames[referenceId] || `Reference ${referenceId}`,
                member: reference.member || referenceId
              });
            }
          });
        }
      });
    });

    return Array.from(referencesMap.values());
  }, [filteredGroupedTasks, individualNames]);

  // Helper function to calculate total columns
  const getTotalColumns = () => {
    const baseColumns = 2; // # and Requirements columns
    const applicantColumns = filteredGroupedTasks.reduce((acc, group) => {
      const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
      let groupColumns = 1 + group.dependantIds.length; // Principal + dependants
      if (hasClassD) groupColumns += 1; // Understudy
      return acc + groupColumns;
    }, 0);

    // Add reference columns (individual columns, not sub-columns)
    const referenceColumns = hasReferencesColumn ? allReferences.length : 0;

    return baseColumns + applicantColumns + referenceColumns;
  };

  const totalColumns = getTotalColumns();

  const isMainApplicantDependant = useCallback((task: any, dependantId: number) => {
    return task.applicant_type === 'dependant' && task.individual_id === dependantId;
  }, []);

  // Helper function to check if task applicant type matches column type for post-application
  const shouldShowPostApplicationIcon = useCallback((task: any, columnType: 'principal' | 'dependant' | 'understudy' | 'reference', dependantId?: number, referenceId?: number) => {
    const taskApplicantType = task.applicant_type;

    // For principal column
    if (columnType === 'principal' && taskApplicantType === 'principal') {
      return true;
    }

    // For dependant column
    if (columnType === 'dependant' && taskApplicantType === 'dependant') {
      // If dependantId is provided, check if this specific dependant matches the task's individual_id
      if (dependantId && task.individual_id === dependantId) {
        return true;
      }
      // If no specific dependantId check, and task is dependant type
      if (!dependantId) {
        return true;
      }
    }

    // For understudy column
    if (columnType === 'understudy' && taskApplicantType === 'understudy') {
      return true;
    }

    // For reference column
    if (columnType === 'reference') {
      // References can apply to any task type, but check if this specific reference ID matches
      if (referenceId && task.references && Array.isArray(task.references)) {
        return task.references.some((ref: any) => ref.id === referenceId);
      }
    }

    return false;
  }, []);

  return (
    <div className="space-y-4">
      {/* Expand/Collapse All Controls */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Table Controls:</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={expandAllSections}
            className="text-xs"
          >
            <ChevronDown className="h-3 w-3 mr-1" />
            Expand All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={collapseAllSections}
            className="text-xs"
          >
            <ChevronUp className="h-3 w-3 mr-1" />
            Collapse All
          </Button>
        </div>
      </div>

      <Table className="min-w-full w-full border-collapse">
        <TableHeader className="sticky top-0 z-10">
          {/* Main header row - Applicant Names + References */}
          <TableRow className="h-12">
            <TableHead
              rowSpan={2}
              className="sticky left-0 bg-blue-600 border-r border-blue-500 w-16 z-20 text-white text-center font-semibold"
            >
              #
            </TableHead>
            <TableHead
              rowSpan={2}
              className="sticky left-16 bg-blue-600 border-r border-blue-500 w-[300px] z-20 text-white font-semibold"
            >
              Requirements
            </TableHead>

            {/* Applicants + References */}
            {filteredGroupedTasks.map((group, groupIndex) => {
              const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
              const hasDependant = group.tasks.some(task => task.applicant_type === 'dependant');
              const dependantCount = group.dependantIds.length;

              // Calculate columns - principal, dependants, understudy (NO references here)
              let totalColumns = 1; // Principal
              totalColumns += dependantCount; // Each dependant
              if (hasClassD) totalColumns += 1; // Understudy
              totalColumns += hasReferencesColumn ? allReferences.length : 0; // References

              return (
                <TableHead
                  key={`applicant-${groupIndex}`}
                  colSpan={totalColumns}
                  className="bg-blue-700 border-r border-blue-500 text-white text-center font-bold px-2"
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-bold truncate max-w-[200px]">
                        {group.applicantName}
                      </span>
                      {hasDependant && (
                        <UserCheck className="h-3 w-3 text-white" title="Has dependant relationship" />
                      )}
                    </div>
                    <span className="text-xs opacity-75">
                      {group.tasks.length} application{group.tasks.length !== 1 ? 's' : ''}
                      {dependantCount > 0 && ` • ${dependantCount} dependant${dependantCount !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                </TableHead>
              );
            })}
          </TableRow>

          {/* Applicant Type Row + Individual References */}
          <TableRow className="h-14">
            {filteredGroupedTasks.map((group, groupIndex) => {
              const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);

              // Find the main applicant task
              const mainApplicantTask = group.tasks[0]; // or find the primary task
              const isMainApplicantDependant = mainApplicantTask?.applicant_type === 'dependant';

              const { principalId, understudyId } = group.tasks.reduce(
                (acc, task) => {
                  if (task.applicant_type === 'principal') acc.principalId = task.individual_id;
                  if (task.applicant_type === 'understudy') acc.understudyId = task.individual_id;

                  if (task.principal_member) acc.principalId = acc.principalId || task.principal_member;
                  if (task.understudy_member) acc.understudyId = acc.understudyId || task.understudy_member;

                  return acc;
                },
                { principalId: null, understudyId: null }
              );

              const principalName = (principalId && individualNames[principalId]);
              const understudyName = (understudyId && individualNames[understudyId]);

              const columns = [];

              // Principal Column
              columns.push(
                <TableHead
                  key={`${groupIndex}-principal`}
                  className="bg-blue-600 border-r border-blue-400 text-white text-center font-semibold min-w-[150px] px-2 py-2"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs">Principal</span>
                    {principalName ? (
                      <div className="flex items-center gap-1">
                        <UserCheck className="h-3 w-3 text-blue-200" />
                        <span className="text-xs truncate max-w-[100px]" title={principalName}>
                          {principalName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </div>
                </TableHead>
              );

              // Add individual columns for each dependant
              group.dependantIds.forEach((dependantId, depIndex) => {
                const dependantName = individualNames[dependantId];
                const isMainApplicant = isMainApplicantDependant && mainApplicantTask?.individual_id === dependantId;

                columns.push(
                  <TableHead
                    key={`${groupIndex}-dependant-${dependantId}`}
                    className={`${isMainApplicant ? 'bg-blue-600' : 'bg-blue-500'} border-r border-blue-400 text-white text-center font-semibold min-w-[150px] px-2 py-2`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs">
                        {isMainApplicant ? 'Dependant (Main)' : `Dependant ${depIndex + 1}`}
                      </span>
                      {dependantName ? (
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-blue-200" />
                          <span className="text-xs truncate max-w-[100px]" title={dependantName}>
                            {dependantName}
                          </span>
                          {isMainApplicant && (
                            <span className="text-xs bg-yellow-500 px-1 rounded">★</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableHead>
                );
              });

              // Add Understudy Column if needed
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
                          <UserCheck className="h-3 w-3 text-blue-200" />
                          <span className="text-xs truncate max-w-[100px]" title={understudyName}>
                            {understudyName}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableHead>
                );
              }

              return columns;
            })}

            {/* Individual Reference Columns */}
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
              <TableCell
                colSpan={totalColumns}
                className="h-24 text-center bg-gray-50"
              >
                <div className="flex items-center justify-center space-x-2">
                  <div className="h-4 w-4 border-2 border-t-2 border-t-primary rounded-full animate-spin"></div>
                  <span>Loading requirements...</span>
                </div>
              </TableCell>
            </TableRow>
          ) : error ? (
            <TableRow>
              <TableCell
                colSpan={totalColumns}
                className="h-24 text-center text-destructive bg-red-50"
              >
                <div className="flex items-center justify-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <span>{error}</span>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            <>
              {/* Documents & Fields Section */}
              {(organizedRequirements.documents.company.length > 0 || organizedRequirements.documents.individual.length > 0) && (
                <>
                  {/* Main Documents & Fields Header */}
                  <TableRow className="bg-gradient-to-r from-slate-100 to-slate-50 border-y-2 border-slate-300">
                    <TableCell className="sticky left-0 bg-gradient-to-r from-slate-100 to-slate-50 border-r z-[5] text-center font-bold text-slate-700">
                      <FileText className="h-4 w-4 mx-auto" />
                    </TableCell>
                    <TableCell className="sticky left-16 bg-gradient-to-r from-slate-100 to-slate-50 border-r z-[5]">
                      <div className="flex items-center gap-2 px-2 py-2">
                        <span className="font-bold text-slate-700 text-lg">Documents & Fields</span>
                        <span className="text-sm bg-slate-200 text-slate-600 px-2 py-1 rounded-full ml-2">
                          {organizedRequirements.documents.company.length + organizedRequirements.documents.individual.length}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleSectionExpansion('documents-fields')}
                        >
                          {expandedSections.has('documents-fields') ?
                            <Minus className="h-4 w-4" /> :
                            <Plus className="h-4 w-4" />
                          }
                        </Button>
                      </div>
                    </TableCell>
                    {filteredGroupedTasks.map((group, groupIndex) => {
                      const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                      let columnsCount = 1 + group.dependantIds.length;
                      if (hasClassD) columnsCount += 1;

                      return Array.from({ length: columnsCount }, (_, idx) => (
                        <TableCell
                          key={`doc-section-${groupIndex}-${idx}`}
                          className="bg-gradient-to-r from-slate-100 to-slate-50 border-r text-center"
                        >
                          <div className="h-px bg-slate-300 w-full"></div>
                        </TableCell>
                      ));
                    })}
                    {/* Reference columns */}
                    {hasReferencesColumn && allReferences.map((_, refIndex) => (
                      <TableCell
                        key={`doc-section-reference-${refIndex}`}
                        className="bg-gradient-to-r from-slate-100 to-slate-50 border-r text-center"
                      >
                        <div className="h-px bg-slate-300 w-full"></div>
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* Documents & Fields Content */}
                  {expandedSections.has('documents-fields') && (
                    <>
                      {/* Company Documents Subsection */}
                      {organizedRequirements.documents.company.length > 0 && (
                        <>
                          <TableRow className="bg-blue-100">
                            <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-blue-700"></TableCell>
                            <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] px-4 py-2">
                              <div className="flex items-center justify-between px-2 py-2">
                                <div className="flex gap-2">
                                <span className="font-semibold text-blue-700">Company Documents</span>
                                <span className="text-sm bg-blue-200 text-blue-700 px-2 py-1 rounded-full ml-2">
                                  {organizedRequirements.documents.company.length}
                                </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0"
                                  onClick={() => toggleSectionExpansion('company-documents')}
                                >
                                  {expandedSections.has('company-documents') ?
                                    <Minus className="h-3 w-3" /> :
                                    <Plus className="h-3 w-3" />
                                  }
                                </Button>
                              </div>
                            </TableCell>
                            {filteredGroupedTasks.map((group, groupIndex) => {
                              const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                              let columnsCount = 1 + group.dependantIds.length;
                              if (hasClassD) columnsCount += 1;

                              return Array.from({ length: columnsCount }, (_, idx) => (
                                <TableCell
                                  key={`company-doc-header-${groupIndex}-${idx}`}
                                  className="bg-blue-100 border-r text-center"
                                >
                                  -
                                </TableCell>
                              ));
                            })}
                            {/* Reference columns */}
                            {hasReferencesColumn && allReferences.map((_, refIndex) => (
                              <TableCell
                                key={`company-doc-header-reference-${refIndex}`}
                                className="bg-blue-100 border-r text-center"
                              >
                                -
                              </TableCell>
                            ))}
                          </TableRow>

                          {/* Company Document Items */}
                          {expandedSections.has('company-documents') && organizedRequirements.documents.company
                            .slice()
                            .sort((a, b) => (a.document.custom_order || 0) - (b.document.custom_order || 0))
                            .map((docItem, docIndex) => {
                              const isExpanded = expandedDocuments.has(docItem.document.id);
                              const displayText = docItem.document.custom_order ? `${docItem.document.custom_order}` : `${docIndex + 1}.`;

                              return (
                                <React.Fragment key={`company-doc-${docItem.document.id}`}>
                                  {/* Document Row */}
                                  <TableRow className="group bg-blue-50 hover:bg-blue-100">
                                    <TableCell className="sticky left-0 bg-blue-50 group-hover:bg-blue-100 border-r z-[5] text-center text-sm font-semibold">
                                      {displayText}
                                    </TableCell>
                                    <TableCell className="sticky left-16 bg-blue-50 group-hover:bg-blue-100 border-r z-[5]">
                                      <div className="flex items-center px-2">
                                        <span className="text-sm font-semibold text-gray-800">
                                          {docItem.document.display_name}
                                        </span>
                                        {docItem.fields.length > 0 && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 ml-2"
                                            onClick={() => toggleDocumentExpansion(docItem.document.id)}
                                          >
                                            {isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                          </Button>
                                        )}
                                      </div>
                                    </TableCell>
                                    {filteredGroupedTasks.map((group, groupIndex) => {
                                      const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                                      const referenceTask = group.tasks[0]; // Use first task as reference since company docs are shared

                                      const columns = [
                                        // Principal Documents - for company docs, show same status across all columns
                                        <TableCell key={`${docItem.document.id}-${groupIndex}-principal`} className="text-center border p-1">
                                          {renderDocumentStatus(referenceTask, docItem.document, 'principal')}
                                        </TableCell>
                                      ];

                                      // Add columns for each dependant - for company docs, show same status
                                      group.dependantIds.forEach((dependantId) => {
                                        columns.push(
                                          <TableCell key={`${docItem.document.id}-${groupIndex}-dependant-${dependantId}`} className="text-center border p-1">
                                            {renderDocumentStatus(referenceTask, docItem.document, 'dependant')}
                                          </TableCell>
                                        );
                                      });

                                      // Understudy columns - for company docs, show same status
                                      if (hasClassD) {
                                        columns.push(
                                          <TableCell key={`${docItem.document.id}-${groupIndex}-understudy`} className="text-center border p-1">
                                            {renderDocumentStatus(referenceTask, docItem.document, 'understudy')}
                                          </TableCell>
                                        );
                                      }

                                      return columns;
                                    })}

                                    {/* Reference columns */}
                                    {hasReferencesColumn && allReferences.map((reference, refIndex) => (
                                      <TableCell key={`${docItem.document.id}-reference-${reference.id}`} className="text-center border p-1">
                                        {renderDocumentStatus(filteredGroupedTasks[0]?.tasks[0], docItem.document, 'reference', reference.member)}
                                      </TableCell>
                                    ))}
                                  </TableRow>

                                  {/* Document Fields (if expanded) */}
                                  {isExpanded && docItem.fields.map((field, fieldIndex) => (
                                    <TableRow key={`company-field-${field.id}`} className="group bg-blue-25 hover:bg-blue-50">
                                      <TableCell className="sticky left-0 bg-blue-25 group-hover:bg-blue-50 border-r z-[5] text-center text-sm text-gray-500">
                                        {docIndex + 1}.{fieldIndex + 1}
                                      </TableCell>
                                      <TableCell className="sticky left-16 bg-blue-25 group-hover:bg-blue-50 border-r z-[5]">
                                        <div className="flex items-center px-2 pl-8">
                                          <span className="text-sm text-gray-700">{field.name}</span>
                                          <Badge variant="outline" className="text-xs ml-2 bg-blue-50 text-blue-700">
                                            Field
                                          </Badge>
                                          {field.type && (
                                            <span className="text-xs text-gray-400 ml-2">
                                              ({field.type})
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      {filteredGroupedTasks.map((group, groupIndex) => {
                                        const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                                        const referenceTask = group.tasks[0];

                                        const columns = [
                                          // Principal Documents
                                          <TableCell key={`${field.id}-${groupIndex}-principal`} className="text-center border p-1">
                                            {renderDocumentStatus(referenceTask, field, 'principal')}
                                          </TableCell>
                                        ];

                                        // Add columns for each dependant
                                        group.dependantIds.forEach((dependantId) => {
                                          columns.push(
                                            <TableCell key={`${field.id}-${groupIndex}-dependant-${dependantId}`} className="text-center border p-1">
                                              {renderDocumentStatus(referenceTask, field, 'dependant', dependantId)}
                                            </TableCell>
                                          );
                                        });

                                        // Understudy columns
                                        if (hasClassD) {
                                          columns.push(
                                            <TableCell key={`${field.id}-${groupIndex}-understudy`} className="text-center border p-1">
                                              {renderDocumentStatus(referenceTask, field, 'understudy')}
                                            </TableCell>
                                          );
                                        }

                                        return columns;
                                      })}

                                      {/* Reference columns */}
                                      {hasReferencesColumn && allReferences.map((reference, refIndex) => (
                                        <TableCell key={`${field.id}-reference-${reference.id}`} className="text-center border p-1">
                                          {renderDocumentStatus(filteredGroupedTasks[0]?.tasks[0], field, 'reference', reference.member)}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
                                </React.Fragment>
                              );
                            })}
                        </>
                      )}

                      {/* Individual Documents Subsection */}
                      {organizedRequirements.documents.individual.length > 0 && (
                        <>
                          <TableRow className="bg-blue-100">
                            <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-blue-700"></TableCell>
                            <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] px-4 py-2">
                              <div className="flex items-center justify-between px-2 py-2">
                                <div className="flex gap-2">
                                <span className="font-semibold text-blue-700">Individual Documents</span>
                                <span className="text-sm bg-blue-200 text-blue-700 px-2 py-1 rounded-full ml-2">
                                  {organizedRequirements.documents.individual.length}
                                </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0"
                                  onClick={() => toggleSectionExpansion('individual-documents')}
                                >
                                  {expandedSections.has('individual-documents') ?
                                    <Minus className="h-3 w-3" /> :
                                    <Plus className="h-3 w-3" />
                                  }
                                </Button>
                              </div>
                            </TableCell>
                            {filteredGroupedTasks.map((group, groupIndex) => {
                              const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                              let columnsCount = 1 + group.dependantIds.length;
                              if (hasClassD) columnsCount += 1;

                              return Array.from({ length: columnsCount }, (_, idx) => (
                                <TableCell
                                  key={`individual-doc-header-${groupIndex}-${idx}`}
                                  className="bg-blue-100 border-r text-center"
                                >
                                  -
                                </TableCell>
                              ));
                            })}
                            {/* Reference columns */}
                            {hasReferencesColumn && allReferences.map((_, refIndex) => (
                              <TableCell
                                key={`individual-doc-header-reference-${refIndex}`}
                                className="bg-blue-100 border-r text-center"
                              >
                                -
                              </TableCell>
                            ))}
                          </TableRow>

                          {/* Individual Document Items */}
                          {expandedSections.has('individual-documents') && organizedRequirements.documents.individual
                            .slice()
                            .sort((a, b) => (a.document.custom_order || 0) - (b.document.custom_order || 0))
                            .map((docItem, docIndex) => {
                              const isExpanded = expandedDocuments.has(docItem.document.id);
                              const displayText = docItem.document.custom_order ? `${docItem.document.custom_order}` : `${docIndex + 1}.`;

                              return (
                                <React.Fragment key={`individual-doc-${docItem.document.id}`}>
                                  {/* Document Row */}
                                  <TableRow className="group bg-blue-50 hover:bg-blue-100">
                                    <TableCell className="sticky left-0 bg-blue-50 group-hover:bg-blue-100 border-r z-[5] text-center text-sm font-semibold">
                                      {displayText}
                                    </TableCell>
                                    <TableCell className="sticky left-16 bg-blue-50 group-hover:bg-blue-100 border-r z-[5]">
                                      <div className="flex items-center px-2">
                                        <span className="text-sm font-semibold text-gray-800">
                                          {docItem.document.display_name}
                                        </span>
                                        {docItem.fields.length > 0 && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 ml-2"
                                            onClick={() => toggleDocumentExpansion(docItem.document.id)}
                                          >
                                            {isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                          </Button>
                                        )}
                                      </div>
                                    </TableCell>
                                    {filteredGroupedTasks.map((group, groupIndex) => {
                                      const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                                      const referenceTask = group.tasks[0];

                                      const columns = [
                                        // Principal Documents
                                        <TableCell key={`${docItem.document.id}-${groupIndex}-principal`} className="text-center border p-1">
                                          {renderDocumentStatus(referenceTask, docItem.document, 'principal')}
                                        </TableCell>
                                      ];

                                      // Add columns for each dependant
                                      group.dependantIds.forEach((dependantId) => {
                                        columns.push(
                                          <TableCell key={`${docItem.document.id}-${groupIndex}-dependant-${dependantId}`} className="text-center border p-1">
                                            {renderDocumentStatus(referenceTask, docItem.document, 'dependant', dependantId)}
                                          </TableCell>
                                        );
                                      });

                                      // Understudy columns
                                      if (hasClassD) {
                                        columns.push(
                                          <TableCell key={`${docItem.document.id}-${groupIndex}-understudy`} className="text-center border p-1">
                                            {renderDocumentStatus(referenceTask, docItem.document, 'understudy')}
                                          </TableCell>
                                        );
                                      }

                                      return columns;
                                    })}

                                    {/* Reference columns */}
                                    {hasReferencesColumn && allReferences.map((reference, refIndex) => (
                                      <TableCell key={`${docItem.document.id}-reference-${reference.id}`} className="text-center border p-1">
                                        {renderDocumentStatus(filteredGroupedTasks[0]?.tasks[0], docItem.document, 'reference', reference.member)}
                                      </TableCell>
                                    ))}
                                  </TableRow>

                                  {/* Document Fields (if expanded) */}
                                  {isExpanded && docItem.fields.map((field, fieldIndex) => (
                                    <TableRow key={`individual-field-${field.id}`} className="group bg-blue-25 hover:bg-blue-50">
                                      <TableCell className="sticky left-0 bg-blue-25 group-hover:bg-blue-50 border-r z-[5] text-center text-sm text-gray-500">
                                        {docIndex + 1}.{fieldIndex + 1}
                                      </TableCell>
                                      <TableCell className="sticky left-16 bg-blue-25 group-hover:bg-blue-50 border-r z-[5]">
                                        <div className="flex items-center px-2 pl-8">
                                          <span className="text-sm text-gray-700">{field.name}</span>
                                          <Badge variant="outline" className="text-xs ml-2 bg-blue-50 text-blue-700">
                                            Field
                                          </Badge>
                                          {field.type && (
                                            <span className="text-xs text-gray-400 ml-2">
                                              ({field.type})
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      {filteredGroupedTasks.map((group, groupIndex) => {
                                        const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                                        const referenceTask = group.tasks[0];

                                        const columns = [
                                          // Principal Documents
                                          <TableCell key={`${field.id}-${groupIndex}-principal`} className="text-center border p-1">
                                            {renderDocumentStatus(referenceTask, field, 'principal')}
                                          </TableCell>
                                        ];

                                        // Add columns for each dependant
                                        group.dependantIds.forEach((dependantId) => {
                                          columns.push(
                                            <TableCell key={`${field.id}-${groupIndex}-dependant-${dependantId}`} className="text-center border p-1">
                                              {renderDocumentStatus(referenceTask, field, 'dependant', dependantId)}
                                            </TableCell>
                                          );
                                        });

                                        // Understudy columns
                                        if (hasClassD) {
                                          columns.push(
                                            <TableCell key={`${field.id}-${groupIndex}-understudy`} className="text-center border p-1">
                                              {renderDocumentStatus(referenceTask, field, 'understudy')}
                                            </TableCell>
                                          );
                                        }

                                        return columns;
                                      })}

                                      {/* Reference columns */}
                                      {hasReferencesColumn && allReferences.map((reference, refIndex) => (
                                        <TableCell key={`${field.id}-reference-${reference.id}`} className="text-center border p-1">
                                          {renderDocumentStatus(filteredGroupedTasks[0]?.tasks[0], field, 'reference', reference.member)}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
                                </React.Fragment>
                              );
                            })}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {/* BCL Workings Section */}
              {(organizedRequirements.bclTemplates.company.length > 0 || organizedRequirements.bclTemplates.individual.length > 0) && (
                <>
                  {/* Main BCL Workings Header */}
                  <TableRow className="bg-gradient-to-r from-blue-100 to-blue-50 border-y-2 border-blue-300">
                    <TableCell className="sticky left-0 bg-gradient-to-r from-blue-100 to-blue-50 border-r z-[5] text-center font-bold text-gray-700">
                      <Briefcase className="h-4 w-4 mx-auto" />
                    </TableCell>
                    <TableCell className="sticky left-16 bg-gradient-to-r from-blue-100 to-blue-50 border-r z-[5]">
                      <div className="flex items-center justify-between px-2 py-2">
                        <div className="flex gap-2">
                        <span className="font-bold text-gray-700 text-lg">BCL Workings</span>
                        <span className="text-sm bg-blue-200 text-blue-700 px-2 py-1 rounded-full ml-2">
                          {organizedRequirements.bclTemplates.company.length + organizedRequirements.bclTemplates.individual.length}
                        </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleSectionExpansion('bcl-workings')}
                        >
                          {expandedSections.has('bcl-workings') ?
                            <Minus className="h-4 w-4" /> :
                            <Plus className="h-4 w-4" />
                          }
                        </Button>
                      </div>
                    </TableCell>
                    {filteredGroupedTasks.map((group, groupIndex) => {
                      const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                      let columnsCount = 1 + group.dependantIds.length;
                      if (hasClassD) columnsCount += 1;

                      return Array.from({ length: columnsCount }, (_, idx) => (
                        <TableCell
                          key={`bcl-section-${groupIndex}-${idx}`}
                          className="bg-gradient-to-r from-blue-100 to-blue-50 border-r text-center"
                        >
                          <div className="h-px bg-blue-300 w-full"></div>
                        </TableCell>
                      ));
                    })}
                    {/* Reference columns */}
                    {hasReferencesColumn && allReferences.map((_, refIndex) => (
                      <TableCell
                        key={`bcl-section-reference-${refIndex}`}
                        className="bg-gradient-to-r from-blue-100 to-blue-50 border-r text-center"
                      >
                        <div className="h-px bg-blue-300 w-full"></div>
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* BCL Workings Content */}
                  {expandedSections.has('bcl-workings') && (
                    <>
                      {/* Company BCL Templates */}
                      {organizedRequirements.bclTemplates.company.length > 0 && (
                        <>
                          <TableRow className="bg-blue-100">
                            <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-blue-700"></TableCell>
                            <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] px-4 py-2">
                              <div className="flex items-center justify-between">
                                <div className="flex gap-2">
                                <span className="font-semibold text-blue-700">Company BCL Templates</span>
                                <span className="text-sm bg-blue-200 text-blue-700 px-2 py-1 rounded-full ml-2">
                                  {organizedRequirements.bclTemplates.company.length}
                                </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0"
                                  onClick={() => toggleSectionExpansion('company-bcl')}
                                >
                                  {expandedSections.has('company-bcl') ?
                                    <Minus className="h-3 w-3" /> :
                                    <Plus className="h-3 w-3" />
                                  }
                                </Button>
                              </div>
                            </TableCell>
                            {filteredGroupedTasks.map((group, groupIndex) => {
                              const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                              let columnsCount = 1 + group.dependantIds.length;
                              if (hasClassD) columnsCount += 1;

                              return Array.from({ length: columnsCount }, (_, idx) => (
                                <TableCell
                                  key={`company-bcl-header-${groupIndex}-${idx}`}
                                  className="bg-blue-100 border-r text-center"
                                >
                                  -
                                </TableCell>
                              ));
                            })}
                            {/* Reference columns */}
                            {hasReferencesColumn && allReferences.map((_, refIndex) => (
                              <TableCell
                                key={`company-bcl-header-reference-${refIndex}`}
                                className="bg-blue-100 border-r text-center"
                              >
                                -
                              </TableCell>
                            ))}
                          </TableRow>

                          {/* Company BCL Template Items */}
                          {expandedSections.has('company-bcl') && organizedRequirements.bclTemplates.company
                            .slice()
                            .sort((a, b) => (a.custom_order || 0) - (b.custom_order || 0))
                            .map((template, templateIndex) => {
                              const displayText = template.custom_order ? `${template.custom_order}` : `BCL-${templateIndex + 1}`;

                              return (
                                <TableRow key={`company-bcl-${template.id}`} className="group bg-blue-50 hover:bg-blue-100">
                                  <TableCell className="sticky left-0 bg-blue-50 group-hover:bg-blue-100 border-r z-[5] text-center text-sm font-semibold">
                                    {displayText}
                                  </TableCell>
                                  <TableCell className="sticky left-16 bg-blue-50 group-hover:bg-blue-100 border-r z-[5]">
                                    <div className="flex items-center px-2">
                                      <span className="text-sm font-semibold text-gray-800">
                                        {template.display_name}
                                      </span>
                                      <Badge variant="outline" className="text-xs ml-2 bg-blue-50 text-blue-700">
                                        Template
                                      </Badge>
                                    </div>
                                  </TableCell>
                                  {filteredGroupedTasks.map((group, groupIndex) => {
                                    const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                                    const referenceTask = group.tasks[0];

                                    const columns = [
                                      // Principal Documents
                                      <TableCell key={`${template.id}-${groupIndex}-principal`} className="text-center border p-1">
                                        {renderDocumentStatus(referenceTask, template, 'principal')}
                                      </TableCell>
                                    ];

                                    // Add columns for each dependant
                                    group.dependantIds.forEach((dependantId) => {
                                      columns.push(
                                        <TableCell key={`${template.id}-${groupIndex}-dependant-${dependantId}`} className="text-center border p-1">
                                          {renderDocumentStatus(referenceTask, template, 'dependant', dependantId)}
                                        </TableCell>
                                      );
                                    });

                                    // Understudy columns
                                    if (hasClassD) {
                                      columns.push(
                                        <TableCell key={`${template.id}-${groupIndex}-understudy`} className="text-center border p-1">
                                          {renderDocumentStatus(referenceTask, template, 'understudy')}
                                        </TableCell>
                                      );
                                    }

                                    return columns;
                                  })}

                                  {/* Reference columns */}
                                  {hasReferencesColumn && allReferences.map((reference, refIndex) => (
                                    <TableCell key={`${template.id}-reference-${reference.id}`} className="text-center border p-1">
                                      {renderDocumentStatus(filteredGroupedTasks[0]?.tasks[0], template, 'reference', reference.member)}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              );
                            })}
                        </>
                      )}

                      {/* Individual BCL Templates */}
                      {organizedRequirements.bclTemplates.individual.length > 0 && (
                        <>
                          <TableRow className="bg-blue-100">
                            <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-blue-700"></TableCell>
                            <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] px-4 py-2">
                              <div className="flex items-center justify-between">
                                <div className="flex gap-2">
                                <span className="font-semibold text-blue-700">Individual BCL Templates</span>
                                <span className="text-sm bg-blue-200 text-blue-700 px-2 py-1 rounded-full ml-2">
                                  {organizedRequirements.bclTemplates.individual.length}
                                </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0"
                                  onClick={() => toggleSectionExpansion('individual-bcl')}
                                >
                                  {expandedSections.has('individual-bcl') ?
                                    <Minus className="h-3 w-3" /> :
                                    <Plus className="h-3 w-3" />
                                  }
                                </Button>
                              </div>
                            </TableCell>
                            {filteredGroupedTasks.map((group, groupIndex) => {
                              const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                              let columnsCount = 1 + group.dependantIds.length;
                              if (hasClassD) columnsCount += 1;

                              return Array.from({ length: columnsCount }, (_, idx) => (
                                <TableCell
                                  key={`individual-bcl-header-${groupIndex}-${idx}`}
                                  className="bg-blue-100 border-r text-center"
                                >
                                  -
                                </TableCell>
                              ));
                            })}
                            {/* Reference columns */}
                            {hasReferencesColumn && allReferences.map((_, refIndex) => (
                              <TableCell
                                key={`individual-bcl-header-reference-${refIndex}`}
                                className="bg-blue-100 border-r text-center"
                              >
                                -
                              </TableCell>
                            ))}
                          </TableRow>

                          {/* Individual BCL Template Items */}
                          {expandedSections.has('individual-bcl') && organizedRequirements.bclTemplates.individual
                            .slice()
                            .sort((a, b) => (a.custom_order || 0) - (b.custom_order || 0))
                            .map((template, templateIndex) => {
                              const displayText = template.custom_order ? `${template.custom_order}` : `BCL-${templateIndex + 1}`;

                              return (
                                <TableRow key={`individual-bcl-${template.id}`} className="group bg-blue-50 hover:bg-blue-100">
                                  <TableCell className="sticky left-0 bg-blue-50 group-hover:bg-blue-100 border-r z-[5] text-center text-sm font-semibold">
                                    {displayText}
                                  </TableCell>
                                  <TableCell className="sticky left-16 bg-blue-50 group-hover:bg-blue-100 border-r z-[5]">
                                    <div className="flex items-center px-2">
                                      <span className="text-sm font-semibold text-gray-800">
                                        {template.display_name}
                                      </span>
                                    </div>
                                  </TableCell>
                                  {filteredGroupedTasks.map((group, groupIndex) => {
                                    const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                                    const referenceTask = group.tasks[0];

                                    const columns = [
                                      // Principal Documents
                                      <TableCell key={`${template.id}-${groupIndex}-principal`} className="text-center border p-1">
                                        {renderDocumentStatus(referenceTask, template, 'principal')}
                                      </TableCell>
                                    ];

                                    // Add columns for each dependant
                                    group.dependantIds.forEach((dependantId) => {
                                      columns.push(
                                        <TableCell key={`${template.id}-${groupIndex}-dependant-${dependantId}`} className="text-center border p-1">
                                          {renderDocumentStatus(referenceTask, template, 'dependant', dependantId)}
                                        </TableCell>
                                      );
                                    });

                                    // Understudy columns
                                    if (hasClassD) {
                                      columns.push(
                                        <TableCell key={`${template.id}-${groupIndex}-understudy`} className="text-center border p-1">
                                          {renderDocumentStatus(referenceTask, template, 'understudy')}
                                        </TableCell>
                                      );
                                    }

                                    return columns;
                                  })}

                                  {/* Reference columns */}
                                  {hasReferencesColumn && allReferences.map((reference, refIndex) => (
                                    <TableCell key={`${template.id}-reference-${reference.id}`} className="text-center border p-1">
                                      {renderDocumentStatus(filteredGroupedTasks[0]?.tasks[0], template, 'reference', reference.member)}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              );
                            })}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Post Application Section */}
              {(organizedRequirements.postApplication.company.length > 0 || organizedRequirements.postApplication.individual.length > 0) && (
                <>
                  {/* Main Post Application Header */}
                  <TableRow className="bg-gradient-to-r from-blue-100 to-blue-50 border-y-2 border-blue-300">
                    <TableCell className="sticky left-0 bg-gradient-to-r from-blue-100 to-blue-50 border-r z-[5] text-center font-bold text-gray-700">
                      <FileText className="h-4 w-4 mx-auto" />
                    </TableCell>
                    <TableCell className="sticky left-16 bg-gradient-to-r from-blue-100 to-blue-50 border-r z-[5]">
                      <div className="flex items-center justify-between px-2 py-2">
                        <div className="flex gap-2">
                        <span className="font-bold text-gray-700 text-lg">Post Application</span>
                        <span className="text-sm bg-blue-200 text-gray-700 px-2 py-1 rounded-full ml-2">
                          {organizedRequirements.postApplication.company.length + organizedRequirements.postApplication.individual.length}
                        </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleSectionExpansion('post-application')}
                        >
                          {expandedSections.has('post-application') ?
                            <Minus className="h-4 w-4" /> :
                            <Plus className="h-4 w-4" />
                          }
                        </Button>
                      </div>
                    </TableCell>
                    {filteredGroupedTasks.map((group, groupIndex) => {
                      const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                      let columnsCount = 1 + group.dependantIds.length;
                      if (hasClassD) columnsCount += 1;

                      return Array.from({ length: columnsCount }, (_, idx) => (
                        <TableCell
                          key={`post-app-section-${groupIndex}-${idx}`}
                          className="bg-gradient-to-r from-blue-100 to-blue-50 border-r text-center"
                        >
                          <div className="h-px bg-blue-300 w-full"></div>
                        </TableCell>
                      ));
                    })}
                    {/* Reference columns */}
                    {hasReferencesColumn && allReferences.map((_, refIndex) => (
                      <TableCell
                        key={`post-app-section-reference-${refIndex}`}
                        className="bg-gradient-to-r from-blue-100 to-blue-50 border-r text-center"
                      >
                        <div className="h-px bg-blue-300 w-full"></div>
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* Post Application Content */}
                  {expandedSections.has('post-application') && (
                    <>
                      {/* Company Post Application Documents */}
                      {organizedRequirements.postApplication.company.length > 0 && (
                        <>
                          <TableRow className="bg-blue-100">
                            <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-blue-700"></TableCell>
                            <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] px-4 py-2">
                              <div className="flex items-center justify-between">
                               <div className="flex gap-2">
                               <span className="font-semibold text-blue-700">Company Stage Documents</span>
                                <span className="text-sm bg-blue-200 text-blue-700 px-2 py-1 rounded-full ml-2">
                                  {organizedRequirements.postApplication.company.length}
                                </span>
                               </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0"
                                  onClick={() => toggleSectionExpansion('company-post-app')}
                                >
                                  {expandedSections.has('company-post-app') ?
                                    <Minus className="h-3 w-3" /> :
                                    <Plus className="h-3 w-3" />
                                  }
                                </Button>
                              </div>
                            </TableCell>
                            {filteredGroupedTasks.map((group, groupIndex) => {
                              const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                              let columnsCount = 1 + group.dependantIds.length;
                              if (hasClassD) columnsCount += 1;

                              return Array.from({ length: columnsCount }, (_, idx) => (
                                <TableCell
                                  key={`company-post-app-header-${groupIndex}-${idx}`}
                                  className="bg-blue-100 border-r text-center"
                                >
                                  -
                                </TableCell>
                              ));
                            })}
                            {/* Reference columns */}
                            {hasReferencesColumn && allReferences.map((_, refIndex) => (
                              <TableCell
                                key={`company-post-app-header-reference-${refIndex}`}
                                className="bg-blue-100 border-r text-center"
                              >
                                -
                              </TableCell>
                            ))}
                          </TableRow>

                          {/* Company Post Application Document Items - with restricted icons */}
                          {expandedSections.has('company-post-app') && organizedRequirements.postApplication.company.map((stageDoc, docIndex) => {
                            const displayText = `S${stageDoc.stageOrder || docIndex + 1}`;

                            return (
                              <TableRow key={`company-post-app-${stageDoc.id}`} className="group bg-blue-50 hover:bg-blue-100">
                                <TableCell className="sticky left-0 bg-blue-50 group-hover:bg-blue-100 border-r z-[5] text-center text-sm font-semibold">
                                  {displayText}
                                </TableCell>
                                <TableCell className="sticky left-16 bg-blue-50 group-hover:bg-blue-100 border-r z-[5]">
                                  <div className="flex flex-col px-2">
                                    <div className="flex items-center">
                                      <span className="text-sm font-semibold text-gray-800">
                                        {stageDoc.display_name}
                                      </span>
                                      <Badge variant="outline" className="text-xs ml-2 bg-blue-50 text-blue-700">
                                        {stageDoc.stageName}
                                      </Badge>
                                    </div>
                                    {stageDoc.stageDocumentConfig?.description && (
                                      <span className="text-xs text-gray-500 mt-1">
                                        {stageDoc.stageDocumentConfig.description}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                {filteredGroupedTasks.map((group, groupIndex) => {
                                  const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                                  const referenceTask = group.tasks[0];

                                  const columns = [
                                    // Principal Documents - RESTRICTED: Only show if task applicant type is principal
                                    <TableCell key={`${stageDoc.id}-${groupIndex}-principal`} className="text-center border p-1">
                                      {shouldShowPostApplicationIcon(referenceTask, 'principal') ?
                                        renderDocumentStatus(referenceTask, stageDoc, 'principal', undefined, true) :
                                        <span className="text-gray-400 text-xs">N/A</span>
                                      }
                                    </TableCell>
                                  ];

                                  // Add columns for each dependant - RESTRICTED: Only show if task applicant type is dependant AND matches this dependant ID
                                  group.dependantIds.forEach((dependantId) => {
                                    columns.push(
                                      <TableCell key={`${stageDoc.id}-${groupIndex}-dependant-${dependantId}`} className="text-center border p-1">
                                        {shouldShowPostApplicationIcon(referenceTask, 'dependant', dependantId) ?
                                          renderDocumentStatus(referenceTask, stageDoc, 'dependant', dependantId, true) :
                                          <span className="text-gray-400 text-xs">N/A</span>
                                        }
                                      </TableCell>
                                    );
                                  });

                                  // Understudy columns - RESTRICTED: Only show if task applicant type is understudy
                                  if (hasClassD) {
                                    columns.push(
                                      <TableCell key={`${stageDoc.id}-${groupIndex}-understudy`} className="text-center border p-1">
                                        {shouldShowPostApplicationIcon(referenceTask, 'understudy') ?
                                          renderDocumentStatus(referenceTask, stageDoc, 'understudy', undefined, true) :
                                          <span className="text-gray-400 text-xs">N/A</span>
                                        }
                                      </TableCell>
                                    );
                                  }

                                  return columns;
                                })}

                                {/* Reference columns - show for tasks that have references */}
                                {hasReferencesColumn && allReferences.map((reference, refIndex) => (
                                  <TableCell key={`${stageDoc.id}-reference-${reference.id}`} className="text-center border p-1">
                                    {shouldShowPostApplicationIcon(filteredGroupedTasks[0]?.tasks[0], 'reference', undefined, reference.id) ?
                                      renderDocumentStatus(filteredGroupedTasks[0]?.tasks[0], stageDoc, 'reference', reference.member, true) :
                                      <span className="text-gray-400 text-xs">N/A</span>
                                    }
                                  </TableCell>
                                ))}
                              </TableRow>
                            );
                          })}
                        </>
                      )}

                      {/* Individual Post Application Documents */}
                      {organizedRequirements.postApplication.individual.length > 0 && (
                        <>
                          <TableRow className="bg-blue-100">
                            <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-blue-700"></TableCell>
                            <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] px-4 py-2">
                              <div className="flex items-center justify-between px-2 py-2">
                                <div className="flex gap-2">
                                  <span className="font-semibold text-blue-700">Individual Stage Documents</span>
                                  <span className="text-sm bg-blue-200 text-blue-700 px-2 py-1 rounded-full ml-2">
                                    {organizedRequirements.postApplication.individual.length}
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0"
                                  onClick={() => toggleSectionExpansion('individual-post-app')}
                                >
                                  {expandedSections.has('individual-post-app') ?
                                    <Minus className="h-3 w-3" /> :
                                    <Plus className="h-3 w-3" />
                                  }
                                </Button>
                              </div>
                            </TableCell>
                            {filteredGroupedTasks.map((group, groupIndex) => {
                              const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                              let columnsCount = 1 + group.dependantIds.length;
                              if (hasClassD) columnsCount += 1;

                              return Array.from({ length: columnsCount }, (_, idx) => (
                                <TableCell
                                  key={`individual-post-app-header-${groupIndex}-${idx}`}
                                  className="bg-blue-100 border-r text-center"
                                >
                                  -
                                </TableCell>
                              ));
                            })}
                            {/* Reference columns */}
                            {hasReferencesColumn && allReferences.map((_, refIndex) => (
                              <TableCell
                                key={`individual-post-app-header-reference-${refIndex}`}
                                className="bg-blue-100 border-r text-center"
                              >
                                -
                              </TableCell>
                            ))}
                          </TableRow>

                          {/* Individual Post Application Document Items - with restricted icons */}
                          {expandedSections.has('individual-post-app') && organizedRequirements.postApplication.individual.map((stageDoc, docIndex) => {
                            const displayText = `S${stageDoc.stageOrder || docIndex + 1}`;

                            return (
                              <TableRow key={`individual-post-app-${stageDoc.id}`} className="group bg-blue-50 hover:bg-blue-100">
                                <TableCell className="sticky left-0 bg-blue-50 group-hover:bg-blue-100 border-r z-[5] text-center text-sm font-semibold">
                                  {displayText}
                                </TableCell>
                                <TableCell className="sticky left-16 bg-blue-50 group-hover:bg-blue-100 border-r z-[5]">
                                  <div className="flex flex-col px-2">
                                    <div className="flex items-center">
                                      <span className="text-sm font-semibold text-gray-800">
                                        {stageDoc.display_name}
                                      </span>
                                    </div>
                                    {stageDoc.stageDocumentConfig?.description && (
                                      <span className="text-xs text-gray-500 mt-1">
                                        {stageDoc.stageDocumentConfig.description}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                {filteredGroupedTasks.map((group, groupIndex) => {
                                  const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                                  const referenceTask = group.tasks[0];

                                  const columns = [
                                    // Principal Documents - RESTRICTED: Only show if task applicant type is principal
                                    <TableCell key={`${stageDoc.id}-${groupIndex}-principal`} className="text-center border p-1">
                                      {shouldShowPostApplicationIcon(referenceTask, 'principal') ?
                                        renderDocumentStatus(referenceTask, stageDoc, 'principal', undefined, true) :
                                        <span className="text-gray-400 text-xs">N/A</span>
                                      }
                                    </TableCell>
                                  ];

                                  // Add columns for each dependant - RESTRICTED: Only show if task applicant type is dependant AND matches this dependant ID
                                  group.dependantIds.forEach((dependantId) => {
                                    columns.push(
                                      <TableCell key={`${stageDoc.id}-${groupIndex}-dependant-${dependantId}`} className="text-center border p-1">
                                        {shouldShowPostApplicationIcon(referenceTask, 'dependant', dependantId) ?
                                          renderDocumentStatus(referenceTask, stageDoc, 'dependant', dependantId, true) :
                                          <span className="text-gray-400 text-xs">N/A</span>
                                        }
                                      </TableCell>
                                    );
                                  });

                                  // Understudy columns - RESTRICTED: Only show if task applicant type is understudy
                                  if (hasClassD) {
                                    columns.push(
                                      <TableCell key={`${stageDoc.id}-${groupIndex}-understudy`} className="text-center border p-1">
                                        {shouldShowPostApplicationIcon(referenceTask, 'understudy') ?
                                          renderDocumentStatus(referenceTask, stageDoc, 'understudy', undefined, true) :
                                          <span className="text-gray-400 text-xs">N/A</span>
                                        }
                                      </TableCell>
                                    );
                                  }

                                  return columns;
                                })}

                                {/* Reference columns - show for tasks that have references */}
                                {hasReferencesColumn && allReferences.map((reference, refIndex) => (
                                  <TableCell key={`${stageDoc.id}-reference-${reference.id}`} className="text-center border p-1">
                                    {shouldShowPostApplicationIcon(filteredGroupedTasks[0]?.tasks[0], 'reference', undefined, reference.id) ?
                                      renderDocumentStatus(filteredGroupedTasks[0]?.tasks[0], stageDoc, 'reference', reference.member, true) :
                                      <span className="text-gray-400 text-xs">N/A</span>
                                    }
                                  </TableCell>
                                ))}
                              </TableRow>
                            );
                          })}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Client Form Fields Section */}
              {(organizedRequirements.clientFields.company.length > 0 || organizedRequirements.clientFields.individual.length > 0) && (
                <>
                  {/* Main Client Form Fields Header */}
                  <TableRow className="bg-gradient-to-r from-slate-100 to-slate-50 border-y-2 border-slate-300">
                    <TableCell className="sticky left-0 bg-gradient-to-r from-slate-100 to-slate-50 border-r z-[5] text-center font-bold text-slate-700">
                      <Users className="h-4 w-4 mx-auto" />
                    </TableCell>
                    <TableCell className="sticky left-16 bg-gradient-to-r from-slate-100 to-slate-50 border-r z-[5]">
                      <div className="flex items-center justify-between px-2 py-2">
                        <div className="flex gap-2">
                          <span className="font-bold text-slate-700 text-lg">Client Form Fields</span>
                          <span className="text-sm bg-slate-200 text-slate-600 px-2 py-1 rounded-full ml-2">
                            {organizedRequirements.clientFields.company.length + organizedRequirements.clientFields.individual.length}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleSectionExpansion('client-fields')}
                        >
                          {expandedSections.has('client-fields') ?
                            <Minus className="h-4 w-4" /> :
                            <Plus className="h-4 w-4" />
                          }
                        </Button>
                      </div>
                    </TableCell>
                    {filteredGroupedTasks.map((group, groupIndex) => {
                      const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                      let columnsCount = 1 + group.dependantIds.length;
                      if (hasClassD) columnsCount += 1;

                      return Array.from({ length: columnsCount }, (_, idx) => (
                        <TableCell
                          key={`client-section-${groupIndex}-${idx}`}
                          className="bg-gradient-to-r from-slate-100 to-slate-50 border-r text-center"
                        >
                          <div className="h-px bg-slate-300 w-full"></div>
                        </TableCell>
                      ));
                    })}
                    {/* Reference columns */}
                    {hasReferencesColumn && allReferences.map((_, refIndex) => (
                      <TableCell
                        key={`client-section-reference-${refIndex}`}
                        className="bg-gradient-to-r from-slate-100 to-slate-50 border-r text-center"
                      >
                        <div className="h-px bg-slate-300 w-full"></div>
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* Client Form Fields Content */}
                  {expandedSections.has('client-fields') && (
                    <>
                      {/* Individual Client Fields Subsection */}
                      {organizedRequirements.clientFields.individual.length > 0 && (
                        <>
                          <TableRow className="bg-blue-100">
                            <TableCell className="sticky left-0 bg-blue-100 border-r z-[5] text-center font-semibold text-gray-700"></TableCell>
                            <TableCell className="sticky left-16 bg-blue-100 border-r z-[5] px-4 py-2">
                              <div className="flex items-center justify-between">
                                <div className="flex gap-2">
                                  <span className="font-semibold text-blue-700">Individual Fields</span>
                                  <span className="text-sm bg-blue-200 text-blue-700 px-2 py-1 rounded-full ml-2">
                                    {organizedRequirements.clientFields.individual.length}
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0"
                                  onClick={() => toggleSectionExpansion('individual-client-fields')}
                                >
                                  {expandedSections.has('individual-client-fields') ?
                                    <Minus className="h-3 w-3" /> :
                                    <Plus className="h-3 w-3" />
                                  }
                                </Button>
                              </div>
                            </TableCell>
                            {filteredGroupedTasks.map((group, groupIndex) => {
                              const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                              let columnsCount = 1 + group.dependantIds.length;
                              if (hasClassD) columnsCount += 1;

                              return Array.from({ length: columnsCount }, (_, idx) => (
                                <TableCell
                                  key={`individual-field-header-${groupIndex}-${idx}`}
                                  className="bg-blue-100 border-r text-center"
                                >
                                  -
                                </TableCell>
                              ));
                            })}
                            {/* Reference columns */}
                            {hasReferencesColumn && allReferences.map((_, refIndex) => (
                              <TableCell
                                key={`individual-field-header-reference-${refIndex}`}
                                className="bg-blue-100 border-r text-center"
                              >
                                -
                              </TableCell>
                            ))}
                          </TableRow>

                          {/* Individual Client Field Items */}
                          {expandedSections.has('individual-client-fields') && organizedRequirements.clientFields.individual.map((fieldItem, fieldIndex) => (
                            <TableRow key={`individual-field-${fieldItem.field.selectionId}`} className="group bg-blue-50 hover:bg-blue-100">
                              <TableCell className="sticky left-0 bg-blue-50 group-hover:bg-blue-100 border-r z-[5] text-center text-sm font-semibold">
                                {fieldIndex + 1}
                              </TableCell>
                              <TableCell className="sticky left-16 bg-blue-50 group-hover:bg-blue-100 border-r z-[5]">
                                <div className="flex items-center px-2">
                                  <span className="text-sm font-medium text-gray-700">
                                    {fieldItem.field.tableHeader || fieldItem.field.label}
                                  </span>
                                  {fieldItem.field.type && (
                                    <span className="text-xs text-gray-400 ml-2">
                                      ({fieldItem.field.type})
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              {filteredGroupedTasks.map((group, groupIndex) => {
                                const hasClassD = group.tasks.some(task => task.class_id === CLASS_D_ID);
                                const principalTask = group.tasks.find(task => task.applicant_type === 'principal');
                                const understudyTask = group.tasks.find(task => task.applicant_type === 'understudy');

                                const columns = [
                                  // Principal Field Data
                                  <TableCell key={`${fieldItem.field.selectionId}-${groupIndex}-principal-data`} className="text-center border p-1">
                                    {principalTask ? renderClientFieldData(principalTask, fieldItem) :
                                      <span className="text-gray-400 text-xs">N/A</span>}
                                  </TableCell>
                                ];

                                // Add columns for each dependant
                                group.dependantIds.forEach((dependantId) => {
                                  const dependantTask = group.tasks.find(task =>
                                    task.dependant_member &&
                                    Array.isArray(task.dependant_member) &&
                                    task.dependant_member.some((dep: any) => dep.id === dependantId)
                                  );

                                  // Dependant Field Data
                                  columns.push(
                                    <TableCell key={`${fieldItem.field.selectionId}-${groupIndex}-dependant-${dependantId}-data`} className="text-center border p-1">
                                      {dependantTask ? renderClientFieldData(dependantTask, fieldItem) :
                                        <span className="text-gray-400 text-xs">N/A</span>}
                                    </TableCell>
                                  );
                                });

                                // Understudy columns
                                if (hasClassD) {
                                  // Understudy Field Data
                                  columns.push(
                                    <TableCell key={`${fieldItem.field.selectionId}-${groupIndex}-understudy-data`} className="text-center border p-1">
                                      {understudyTask ? renderClientFieldData(understudyTask, fieldItem) :
                                        <span className="text-gray-400 text-xs">N/A</span>}
                                    </TableCell>
                                  );
                                }

                                return columns;
                              })}

                              {/* Reference columns */}
                              {hasReferencesColumn && allReferences.map((reference, refIndex) => (
                                <TableCell key={`${fieldItem.field.selectionId}-reference-${reference.id}`} className="text-center border p-1">
                                  -
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Empty state */}
              {organizedRequirements.documents.company.length === 0 &&
                organizedRequirements.documents.individual.length === 0 &&
                organizedRequirements.bclTemplates.company.length === 0 &&
                organizedRequirements.bclTemplates.individual.length === 0 &&
                organizedRequirements.postApplication.company.length === 0 &&
                organizedRequirements.postApplication.individual.length === 0 &&
                organizedRequirements.clientFields.company.length === 0 &&
                organizedRequirements.clientFields.individual.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={totalColumns}
                      className="text-center p-8 text-muted-foreground bg-gray-50"
                    >
                      <div className="flex flex-col items-center space-y-2">
                        <FileText className="h-8 w-8 text-muted-foreground/50" />
                        <p className="font-medium">No requirements found</p>
                        <p className="text-sm text-muted-foreground">
                          No selected documents, BCL templates, stage documents, or client fields to display for {documentTab} applications
                        </p>
                      </div>
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