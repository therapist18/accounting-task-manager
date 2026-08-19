"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, Search, Pencil, Trash2, FileText, Link2, HelpCircle, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Placeholder, JobField, JobQuestion, Requirement } from "@/app/(dashboard)/dashboard/templates/document-template-manager/types";

export interface PlaceholderPanelProps {
  placeholders: Placeholder[];
  placeholderSearch: string;
  onPlaceholderSearchChange: (value: string) => void;
  masterFields: JobField[];
  jobQuestions?: JobQuestion[];
  requirements?: Requirement[];
  
  // Configuration options
  variant?: 'table' | 'list';
  showHeader?: boolean;
  title?: string;
  description?: string;
  showAddButton?: boolean;
  onAddPlaceholder?: () => void;
  onEditPlaceholder?: (placeholder: Placeholder, index: number) => void;
  onRemovePlaceholder?: (placeholder: Placeholder, index: number) => void;
  emptyMessage?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  // Opt-in "Belongs To" column (table variant only) - only Consultancy
  // Contracts has a per-placeholder company_role to show (see
  // Placeholder.company_role in ../types.ts and ccPlaceholderAdapter.ts's
  // resolveCompanyRole). A callback rather than a boolean flag so this
  // generic, multi-module component doesn't need to import CC-specific
  // resolution logic itself - the column only renders when a caller
  // supplies one.
  belongsToLabel?: (placeholder: Placeholder) => string;
}

function PlaceholderRow({
  placeholder,
  index,
  variant,
  masterFieldMap,
  jobQuestions,
  requirements,
  onEdit,
  onRemove,
  belongsToLabel
}: {
  placeholder: Placeholder;
  index: number;
  variant: 'table' | 'list';
  masterFieldMap: Map<number, string>;
  jobQuestions?: JobQuestion[];
  requirements?: Requirement[];
  onEdit?: (placeholder: Placeholder, index: number) => void;
  onRemove?: (placeholder: Placeholder, index: number) => void;
  belongsToLabel?: (placeholder: Placeholder) => string;
}) {
  const isChild = !!placeholder.parent_name;
  const isBlock = placeholder.is_block_start;
  const fieldIds = placeholder.master_field_ids || [];

  if (variant === 'list') {
    return (
      <div
        key={placeholder.id || `noId-${index}`}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded border text-sm font-mono",
          "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700",
          isChild && "bg-slate-50/50 dark:bg-slate-800/30 pl-8 border-l-2 border-sky-200 dark:border-sky-800 ml-1",
          isBlock && "bg-sky-50/40 dark:bg-sky-900/10 font-bold text-sky-700 dark:text-sky-400"
        )}
      >
        {isBlock ? (
          <span className="bg-sky-600 text-white text-[9px] px-1.5 py-0.5 rounded h-4">ARRAY</span>
        ) : isChild ? (
          <svg className="h-3 w-3 text-sky-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="23" y1="21" x2="17" y2="17" />
          </svg>
        ) : (
          <FileText className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
        )}
        <span className={cn("flex-1", isBlock && "font-bold text-sky-700 dark:text-sky-400")}>
          {isBlock ? `{#${placeholder.name}}` : `{${placeholder.name}}`}
        </span>
        <span className="text-xs text-slate-400 capitalize">{placeholder.type}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800 capitalize">
          {(Array.isArray(placeholder.entity_type) ? placeholder.entity_type[0] : placeholder.entity_type) || 'company'}
        </span>
        {fieldIds.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {fieldIds.map((id: number) => masterFieldMap.get(id) || id).join(', ')}
          </span>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 capitalize">
          {placeholder.default_value || '—'}
        </span>
      </div>
    );
  }

  // Table variant (DTM style)
  return (
    <TableRow
      key={placeholder.id || `noId-${index}`}
      className={cn(
        isChild && "bg-muted/10 hover:bg-muted/20",
        isBlock && "bg-blue-50/40 hover:bg-blue-50/60"
      )}
    >
      <TableCell className="border-r">
        <div className={cn(
          "flex items-center gap-2 font-mono text-sm",
          isChild && "pl-8 border-l-2 border-blue-200 ml-2"
        )}>
          {isBlock ? (
            <Badge className="bg-blue-600 hover:bg-blue-700 h-5 px-1.5 text-[10px]">ARRAY</Badge>
          ) : isChild ? (
            <Link2 className="h-3 w-3 text-blue-400" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className={cn(isBlock && "font-bold text-blue-800")}>
            {isBlock ? `{#${placeholder.name}}` : `{${placeholder.name}}`}
          </span>
          {placeholder.ui_hidden && (
            <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200 ml-2">
              Backend Only
            </Badge>
          )}
        </div>
      </TableCell>

      <TableCell className="border-r">
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {placeholder.display_value || '-'}
        </span>
      </TableCell>

      <TableCell className="border-r">
        <Badge variant="outline" className="capitalize text-[10px]">
          {placeholder.type}
        </Badge>
      </TableCell>

      <TableCell className="border-r">
        <Badge
          variant="secondary"
          className={cn(
            "capitalize text-[10px]",
            isChild && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
          )}
        >
          {Array.isArray(placeholder.entity_type) ? placeholder.entity_type.join(', ') : placeholder.entity_type}
        </Badge>
      </TableCell>

      {belongsToLabel && (
        <TableCell className="border-r">
          <Badge variant="outline" className="text-[10px] bg-slate-50 dark:bg-slate-800">
            {belongsToLabel(placeholder)}
          </Badge>
        </TableCell>
      )}

      <TableCell className="border-r">
        <div className="space-y-1">
          {fieldIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {fieldIds.map((id: number) => (
                <Badge key={id} variant="outline" className="text-[9px] bg-white dark:bg-slate-800">
                  {masterFieldMap.get(id) || id}
                </Badge>
              ))}
            </div>
          )}

          {placeholder.linked_job_question_id && jobQuestions && (
            <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800">
              <HelpCircle className="h-3 w-3 mr-1" />
              {jobQuestions.find((q: JobQuestion) => q.id === placeholder.linked_job_question_id)?.label || placeholder.linked_job_question_id}
            </Badge>
          )}

          {placeholder.linked_requirement_id && requirements && (
            <Badge variant="outline" className="text-[9px] bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800">
              <Database className="h-3 w-3 mr-1" />
              {requirements.find((r: Requirement) => r.id === placeholder.linked_requirement_id)?.label || placeholder.linked_requirement_id}
            </Badge>
          )}

          {!fieldIds.length && !placeholder.linked_job_question_id && !placeholder.linked_requirement_id && (
            <span className="text-[10px] text-muted-foreground italic">Not Linked</span>
          )}
        </div>
      </TableCell>

      <TableCell className="border-r">
        <Badge
          variant="secondary"
          className={cn(
            "capitalize text-[10px]",
            isChild && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
          )}
        >
          {placeholder.default_value}
        </Badge>
      </TableCell>

      {onEdit || onRemove ? (
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            {onEdit && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(placeholder, index)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {onRemove && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemove(placeholder, index)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            )}
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

export function PlaceholderPanel({
  placeholders,
  placeholderSearch,
  onPlaceholderSearchChange,
  masterFields,
  jobQuestions = [],
  requirements = [],
  variant = 'table',
  showHeader = true,
  title = 'Placeholders',
  description = 'Fields for the selected template.',
  showAddButton = false,
  onAddPlaceholder,
  onEditPlaceholder,
  onRemovePlaceholder,
  emptyMessage = 'No placeholders found.',
  searchPlaceholder = 'Search placeholders...',
  className = '',
  disabled = false,
  belongsToLabel
}: PlaceholderPanelProps) {
  const masterFieldMap = new Map(masterFields.map(f => [f.id, f.label]));

  const filteredPlaceholders = React.useMemo(() => {
    if (!placeholders?.length) return [];
    if (!placeholderSearch) return placeholders;
    const searchLower = placeholderSearch.toLowerCase();
    return placeholders.filter((p: Placeholder) =>
      p.name.toLowerCase().includes(searchLower) ||
      p.type.toLowerCase().includes(searchLower) ||
      (Array.isArray(p.entity_type) ? p.entity_type : [p.entity_type]).some((et: any) => et?.toLowerCase().includes(searchLower)) ||
      (p.master_field_ids || []).some((id: number) =>
        masterFieldMap.get(id)?.toLowerCase().includes(searchLower)
      ) ||
      (p.linked_job_question_id && jobQuestions.find((q: JobQuestion) => q.id === p.linked_job_question_id)?.label.toLowerCase().includes(searchLower)) ||
      (p.linked_requirement_id && requirements.find((r: Requirement) => r.id === p.linked_requirement_id)?.label.toLowerCase().includes(searchLower))
    );
  }, [placeholders, placeholderSearch, masterFieldMap, jobQuestions, requirements]);

  const hasPlaceholders = placeholders?.length > 0;
  const hasFiltered = filteredPlaceholders.length > 0;

  if (!hasPlaceholders) {
    return (
      <div className={cn("flex-1 flex items-center justify-center text-center border-2 border-dashed rounded-lg", className)}>
        <div>
          <h3 className="text-lg font-medium">No Placeholders</h3>
          <p className="text-sm text-muted-foreground mt-1">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (variant === 'list') {
      return (
        <div className="flex-1 overflow-y-auto min-h-[300px]">
          {hasFiltered ? (
            <div className="space-y-1">
              {filteredPlaceholders.map((p, idx) => (
                <PlaceholderRow
                  key={p.id || `noId-${idx}`}
                  placeholder={p}
                  index={idx}
                  variant="list"
                  masterFieldMap={masterFieldMap}
                  jobQuestions={jobQuestions}
                  requirements={requirements}
                />
              ))}
            </div>
          ) : (
            <div className="text-center p-6 flex-1 flex items-center justify-center">
              <p className="text-sm text-slate-400">No placeholders match your search.</p>
            </div>
          )}
        </div>
      );
    }

    return (
      <CardContent className="flex-1 overflow-y-auto min-h-[400px]">
        {hasFiltered ? (
          <div className="h-[950px] overflow-auto">
            <Table className="border">
              <TableHeader className="bg-gray-100 dark:bg-slate-800 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="border-r font-bold text-gray-700 dark:text-gray-300">Field</TableHead>
                  <TableHead className="border-r font-bold text-gray-700 dark:text-gray-300">Display Value</TableHead>
                  <TableHead className="border-r font-bold text-gray-700 dark:text-gray-300">Type</TableHead>
                  <TableHead className="border-r font-bold text-gray-700 dark:text-gray-300">Entity</TableHead>
                  {belongsToLabel && (
                    <TableHead className="border-r font-bold text-gray-700 dark:text-gray-300">Belongs To</TableHead>
                  )}
                  <TableHead className="border-r font-bold text-gray-700 dark:text-gray-300">Linked Master Field</TableHead>
                  <TableHead className="border-r font-bold text-gray-700 dark:text-gray-300">Default Value</TableHead>
                  {(onEditPlaceholder || onRemovePlaceholder) && (
                    <TableHead className="text-right border-r font-bold text-gray-700 dark:text-gray-300">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlaceholders.map((p, idx) => (
                  <PlaceholderRow
                    key={p.id || `noId-${idx}`}
                    placeholder={p}
                    index={idx}
                    variant="table"
                    masterFieldMap={masterFieldMap}
                    jobQuestions={jobQuestions}
                    requirements={requirements}
                    onEdit={onEditPlaceholder}
                    onRemove={onRemovePlaceholder}
                    belongsToLabel={belongsToLabel}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center p-6 h-full flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No placeholders match your search.</p>
          </div>
        )}
      </CardContent>
    );
  };

  if (variant === 'list') {
    return (
      <div className={cn("h-full flex flex-col", className)}>
        {showHeader && (
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300">{title}</h3>
            <p className="text-xs text-slate-400">{description}</p>
          </div>
        )}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder={searchPlaceholder}
            value={placeholderSearch}
            onChange={(e) => onPlaceholderSearchChange(e.target.value)}
            disabled={disabled || !hasPlaceholders}
            className="pl-9 w-full h-9 rounded-full text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
        </div>
        {renderContent()}
      </div>
    );
  }

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      {showHeader && (
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            {showAddButton && onAddPlaceholder && (
              <Button variant="outline" size="sm" onClick={onAddPlaceholder}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add
              </Button>
            )}
          </div>
          <div className="relative pt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={placeholderSearch}
              onChange={(e) => onPlaceholderSearchChange(e.target.value)}
              disabled={disabled || !hasPlaceholders}
              className="pl-9"
            />
          </div>
        </CardHeader>
      )}
      {renderContent()}
    </Card>
  );
}