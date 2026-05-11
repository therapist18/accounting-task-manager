"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, Search, Pencil, Trash2, FileText, Link2, HelpCircle, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Placeholder, JobField, JobQuestion, Requirement } from "../types";

interface PlaceholderPanelProps {
  currentTemplate: any;
  placeholderSearch: string;
  onPlaceholderSearchChange: (value: string) => void;
  onAddPlaceholder: () => void;
  onEditPlaceholder: (index: number) => void;
  onRemovePlaceholder: (index: number) => void;
  masterFields: JobField[];
  jobQuestions: JobQuestion[];
  requirements: Requirement[];
}

export function PlaceholderPanel({
  currentTemplate,
  placeholderSearch,
  onPlaceholderSearchChange,
  onAddPlaceholder,
  onEditPlaceholder,
  onRemovePlaceholder,
  masterFields,
  jobQuestions,
  requirements
}: PlaceholderPanelProps) {
  const masterFieldMap = new Map(masterFields.map(f => [f.id, f.label]));

  const filteredPlaceholders = React.useMemo(() => {
    if (!currentTemplate?.placeholders) return [];
    // Show all placeholders in admin panel (ui_hidden only affects TemplateGenerationDialog)
    const allPlaceholders = currentTemplate.placeholders;
    if (!placeholderSearch) return allPlaceholders;
    const searchLower = placeholderSearch.toLowerCase();
    return allPlaceholders.filter((p: Placeholder) =>
      p.name.toLowerCase().includes(searchLower) ||
      p.type.toLowerCase().includes(searchLower) ||
      (Array.isArray(p.entity_type) ? p.entity_type : [p.entity_type]).some((et: any) => et?.toLowerCase().includes(searchLower)) ||
      (p.master_field_ids || []).some((id: number) =>
        masterFieldMap.get(id)?.toLowerCase().includes(searchLower)
      ) ||
      (p.linked_job_question_id && jobQuestions.find((q: JobQuestion) => q.id === p.linked_job_question_id)?.label.toLowerCase().includes(searchLower)) ||
      (p.linked_requirement_id && requirements.find((r: Requirement) => r.id === p.linked_requirement_id)?.label.toLowerCase().includes(searchLower))
    );
  }, [currentTemplate?.placeholders, placeholderSearch, masterFieldMap, jobQuestions, requirements]);

  if (!currentTemplate) {
    return (
      <div className="h-full flex items-center justify-center text-center border-2 border-dashed rounded-lg">
        <div>
          <h3 className="text-lg font-medium">No Template Selected</h3>
          <p className="text-sm text-muted-foreground mt-1">Select a template to view placeholders.</p>
        </div>
      </div>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Placeholders</CardTitle>
            <CardDescription>Fields for the selected template.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onAddPlaceholder}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add
          </Button>
        </div>
        <div className="relative pt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search placeholders..."
            value={placeholderSearch}
            onChange={(e) => onPlaceholderSearchChange(e.target.value)}
            disabled={!currentTemplate || !currentTemplate.placeholders?.length}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-[400px]">
        {currentTemplate?.placeholders?.length > 0 ? (
          filteredPlaceholders.length > 0 ? (
            <div className="h-[950px] overflow-auto">
              <Table className="border">
                <TableHeader className="bg-gray-100 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="border-r font-bold text-gray-700">Field</TableHead>
                    <TableHead className="border-r font-bold text-gray-700">Display Value</TableHead>
                    <TableHead className="border-r font-bold text-gray-700">Type</TableHead>
                    <TableHead className="border-r font-bold text-gray-700">Entity</TableHead>
                    <TableHead className="border-r font-bold text-gray-700">Linked Master Field</TableHead>
                    <TableHead className="border-r font-bold text-gray-700">Default Value</TableHead>
                    <TableHead className="text-right border-r font-bold text-gray-700">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPlaceholders.map((p: Placeholder) => {
                    const isChild = !!p.parent_name;
                    const isBlock = p.is_block_start;
                    const originalIndex = currentTemplate.placeholders.findIndex((orig: Placeholder) => orig.id === p.id);

                    return (
                      <TableRow
                        key={p.id}
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
                              {isBlock ? `{#${p.name}}` : `{${p.name}}`}
                            </span>
                            {p.ui_hidden && (
                              <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200 ml-2">
                                Backend Only
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="border-r">
                          <span className="text-sm text-gray-700">
                            {p.display_value || '-'}
                          </span>
                        </TableCell>

                        <TableCell className="border-r">
                          <Badge variant="outline" className="capitalize text-[10px]">
                            {p.type}
                          </Badge>
                        </TableCell>

                        <TableCell className="border-r">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "capitalize text-[10px]",
                              isChild && "bg-blue-100 text-blue-700"
                            )}
                          >
                            {p.entity_type}
                          </Badge>
                        </TableCell>

                        <TableCell className="border-r">
                          <div className="space-y-1">
                            {p.master_field_ids?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {p.master_field_ids.map((id: number) => (
                                  <Badge key={id} variant="outline" className="text-[9px] bg-white">
                                    {masterFieldMap.get(id) || id}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            {p.linked_job_question_id && (
                              <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-200">
                                <HelpCircle className="h-3 w-3 mr-1" />
                                {jobQuestions.find((q: JobQuestion) => q.id === p.linked_job_question_id)?.label || p.linked_job_question_id}
                              </Badge>
                            )}

                            {p.linked_requirement_id && (
                              <Badge variant="outline" className="text-[9px] bg-green-50 text-green-700 border-green-200">
                                <Database className="h-3 w-3 mr-1" />
                                {requirements.find((r: Requirement) => r.id === p.linked_requirement_id)?.label || p.linked_requirement_id}
                              </Badge>
                            )}

                            {!p.master_field_ids?.length && !p.linked_job_question_id && !p.linked_requirement_id && (
                              <span className="text-[10px] text-muted-foreground italic">Not Linked</span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="border-r">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "capitalize text-[10px]",
                              isChild && "bg-blue-100 text-blue-700"
                            )}
                          >
                            {p.default_value}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditPlaceholder(originalIndex)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemovePlaceholder(originalIndex)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center p-6 h-full flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No placeholders match your search.</p>
            </div>
          )
        ) : (
          <div className="text-center p-6 h-full flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No placeholders found.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
