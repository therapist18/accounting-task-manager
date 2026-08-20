"use client";
import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComboBox } from "@/components/ui/combobox";
import { RefreshCw, ChevronDown, FileText, Download, X, Loader2, Tag } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ENTITY_TYPES } from "@/lib/constants/entity-types";
import TemplateEditor from "@/components/TemplateEditor";
import { DocxLivePreview } from "@/components/DocxLivePreview";
import supabase from "@/lib/supabase/client";
import type { DocumentTemplate, EntityType } from "../types";

interface TemplateEditorPanelProps {
  currentTemplate: DocumentTemplate | null;
  templateFiles: Map<string, File>;
  onTemplateNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTemplateFieldChange?: (field: string, value: any) => void;
  onClassificationFieldChange?: (field: string, value: any) => void;
  onEditorChange: (content: { html: string; header?: string; footer?: string } | string) => void;
  onEditorBlur: () => void;
  onRescanPlaceholders: () => void;
  onManualRescan: () => void;
  onEntityTypeToggle: (entityType: EntityType) => void;
  onClearEntityTypes: () => void;
  onDownloadTemplate?: () => void;
  onToggleLetterhead?: () => void;
  isProcessing: boolean;
}

export function TemplateEditorPanel({
  currentTemplate,
  templateFiles,
  onTemplateNameChange,
  onTemplateFieldChange,
  onClassificationFieldChange,
  onEditorChange,
  onEditorBlur,
  onRescanPlaceholders,
  onManualRescan,
  onEntityTypeToggle,
  onClearEntityTypes,
  onDownloadTemplate,
  onToggleLetterhead,
  isProcessing
}: TemplateEditorPanelProps) {
  const [classificationOpen, setClassificationOpen] = useState(false);
  const [positionOptions, setPositionOptions] = useState<string[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [loadingClassificationOptions, setLoadingClassificationOptions] = useState(false);
  const classificationOptionsFetched = useRef(false);

  useEffect(() => {
    if (!classificationOpen || classificationOptionsFetched.current) return;
    classificationOptionsFetched.current = true;
    setLoadingClassificationOptions(true);
    supabase
      .from('registry_employees')
      .select('job_title, department')
      .then(({ data, error }: { data: any[] | null; error: any }) => {
        if (!error && data) {
          const positions = Array.from(new Set(data.map((d: any) => d.job_title).filter(Boolean))) as string[];
          const departments = Array.from(new Set(data.map((d: any) => d.department).filter(Boolean))) as string[];
          setPositionOptions(positions.sort());
          setDepartmentOptions(departments.sort());
        }
        setLoadingClassificationOptions(false);
      });
  }, [classificationOpen]);

  if (!currentTemplate) {
    return (
      <div className="h-full flex items-center justify-center text-center border-2 border-dashed rounded-lg">
        <div>
          <h3 className="text-lg font-medium">No Template Selected</h3>
          <p className="text-sm text-muted-foreground mt-1">Add or select a template to begin editing.</p>
        </div>
      </div>
    );
  }

  const classification = currentTemplate.classification || {};
  const classificationBadges: string[] = classification.is_general
    ? ['General']
    : [
        classification.contract_duration,
        classification.position_id && `Pos: ${classification.position_id}`,
        classification.department_id && `Dept: ${classification.department_id}`,
        classification.company_id && `Co: ${classification.company_id}`,
        classification.work_arrangement,
      ].filter(Boolean) as string[];

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row justify-between items-center">
        <div>
          <CardTitle>Template Editor</CardTitle>
          <CardDescription>Edit the name, type, and content below.</CardDescription>
        </div>
        {currentTemplate.isDirty && (
          <Button size="sm" onClick={onRescanPlaceholders}>
            <RefreshCw className="mr-2 h-4 w-4" /> Re-scan
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4 overflow-y-auto">
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name</Label>
            <Input 
              id="template-name" 
              value={currentTemplate.name || ''} 
              onChange={onTemplateNameChange} 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="entity-type">Template For</Label>
            <div className="flex gap-2 items-center">
              <DropdownMenu className="flex-1">
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="truncate pr-2">
                      {currentTemplate.entity_types?.length > 0 
                        ? currentTemplate.entity_types.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ') 
                        : "Select entities..."}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[--radix-popover-trigger-width]">
                  {ENTITY_TYPES.map(t => (
                    <DropdownMenuCheckboxItem 
                      key={t.value} 
                      checked={currentTemplate.entity_types?.includes(t.value)} 
                      onCheckedChange={() => onEntityTypeToggle(t.value)}
                    >
                      {t.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="sm"
                onClick={onClearEntityTypes}
                title="Clear all entity types"
                className="shrink-0 w-8 h-8 p-0 flex items-center justify-center"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
          {currentTemplate.file_type === 'text/html' && (
            <div className="space-y-2">
              <Label>Use Letterhead</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch
                  checked={currentTemplate.use_letterhead ?? false}
                  onCheckedChange={onToggleLetterhead}
                />
                <span className="text-xs text-muted-foreground">
                  {currentTemplate.use_letterhead ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          )}
          <div className="flex flex-col items-center justify-between">
            <Label htmlFor="entity-type"></Label>
            {currentTemplate.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && (
              <Button
                variant="outline"
                size="sm"
                onClick={onDownloadTemplate}
                className="ml-2"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onManualRescan}
              disabled={isProcessing}
              className="ml-2"
            >
              {isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Manual Rescan
            </Button>
          </div>
        </div>

        <div className="border-t border-b">
          <button
            type="button"
            onClick={() => setClassificationOpen(o => !o)}
            className="w-full flex items-center justify-between py-3"
          >
            <div className="flex items-center gap-3">
              <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="text-left">
                <Label className="text-base font-semibold cursor-pointer">Classification Settings</Label>
                <p className="text-xs text-muted-foreground">Set conditions for when this template should be used.</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {classificationBadges.length > 0 ? (
                  classificationBadges.map(b => (
                    <Badge key={b} variant="outline" className="text-[10px] font-medium">{b}</Badge>
                  ))
                ) : (
                  <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground">Any / Unset</Badge>
                )}
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${classificationOpen ? 'rotate-180' : ''}`} />
          </button>

          {classificationOpen && (
            <div className="grid grid-cols-3 gap-4 pb-4">
              <div className="space-y-2 flex items-center gap-2 col-span-3">
                <Label>General Template</Label>
                <Switch
                  checked={currentTemplate.classification?.is_general ?? false}
                  onCheckedChange={(checked) => onClassificationFieldChange?.('is_general', checked)}
                />
              </div>

              {!currentTemplate.classification?.is_general && (
                <>
                  <div className="space-y-2">
                    <Label>Contract Duration</Label>
                    <Select
                      value={currentTemplate.classification?.contract_duration || ''}
                      onValueChange={(val) => onClassificationFieldChange?.('contract_duration', val === 'none' ? null : val)}
                    >
                      <SelectTrigger><SelectValue placeholder="Any Duration" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Any Duration</SelectItem>
                        <SelectItem value="Probation">Probation</SelectItem>
                        <SelectItem value="Permanent">Permanent</SelectItem>
                        <SelectItem value="Fixed-Term">Fixed-Term</SelectItem>
                        <SelectItem value="Annual">Annual</SelectItem>
                        <SelectItem value="Internship">Internship</SelectItem>
                        <SelectItem value="Casual">Casual</SelectItem>
                        <SelectItem value="Part-Time">Part-Time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Position</Label>
                    <ComboBox
                      options={[{ value: '', label: 'Any position' }, ...positionOptions.map(p => ({ value: p, label: p }))]}
                      value={currentTemplate.classification?.position_id || ''}
                      onValueChange={(val) => onClassificationFieldChange?.('position_id', val || null)}
                      placeholder="Any position"
                      emptyText="No job titles found on employee records"
                      loading={loadingClassificationOptions}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Department</Label>
                    <ComboBox
                      options={[{ value: '', label: 'Any department' }, ...departmentOptions.map(d => ({ value: d, label: d }))]}
                      value={currentTemplate.classification?.department_id || ''}
                      onValueChange={(val) => onClassificationFieldChange?.('department_id', val || null)}
                      placeholder="Any department"
                      emptyText="No departments found on employee records"
                      loading={loadingClassificationOptions}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Company ID</Label>
                    <Input
                      placeholder="Company ID (Any if empty)"
                      value={currentTemplate.classification?.company_id || ''}
                      onChange={(e) => onClassificationFieldChange?.('company_id', e.target.value || null)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Work Arrangement</Label>
                    <Select
                      value={currentTemplate.classification?.work_arrangement || ''}
                      onValueChange={(val) => onClassificationFieldChange?.('work_arrangement', val === 'none' ? null : val)}
                    >
                      <SelectTrigger><SelectValue placeholder="Any Arrangement" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Any Arrangement</SelectItem>
                        <SelectItem value="On-site">On-site</SelectItem>
                        <SelectItem value="Remote">Remote</SelectItem>
                        <SelectItem value="Hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-[400px] border rounded-md overflow-hidden">
          {currentTemplate.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? (
            <div className="w-full h-full flex flex-col">
              {templateFiles.get(currentTemplate.id) ? (
                <DocxLivePreview
                  file={templateFiles.get(currentTemplate.id)!}
                  className="flex-1"
                />
              ) : (currentTemplate as any)._fileMissing ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center p-6">
                    <FileText className="h-12 w-12 mx-auto text-red-500 mb-3" />
                    <p className="text-sm font-medium text-red-700">File Not Found</p>
                    <p className="text-xs text-gray-500 mt-1">
                      The document file is missing from storage. Please re-upload the template.
                    </p>
                  </div>
                </div>
              ) : currentTemplate.file_path ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center p-6">
                    <FileText className="h-12 w-12 mx-auto text-blue-500 mb-3" />
                    <p className="text-sm font-medium text-gray-700">Word Document from Storage</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {currentTemplate.file_name || 'Document ready for processing'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center p-6">
                    <FileText className="h-12 w-12 mx-auto text-green-500 mb-3" />
                    <p className="text-sm font-medium text-gray-700">Word Document Uploaded</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {templateFiles.get(currentTemplate.id)?.name || 'Document ready for processing'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <TemplateEditor
              key={currentTemplate.id}
              initialContent={currentTemplate.content || ''}
              onChange={onEditorChange}
              onBlur={onEditorBlur}
              className="flex-1"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
