"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RefreshCw, ChevronDown, FileText, Download, X, Loader2 } from "lucide-react";
import { ENTITY_TYPES } from "@/lib/constants/entity-types";
import TemplateEditor from "@/components/TemplateEditor";
import { DocxLivePreview } from "@/components/DocxLivePreview";
import type { DocumentTemplate, EntityType } from "../types";

interface TemplateEditorPanelProps {
  currentTemplate: DocumentTemplate | null;
  templateFiles: Map<string, File>;
  onTemplateNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onEditorChange: (content: { html: string; header?: string; footer?: string } | string) => void;
  onEditorBlur: () => void;
  onRescanPlaceholders: () => void;
  onManualRescan: () => void;
  onEntityTypeToggle: (entityType: EntityType) => void;
  onClearEntityTypes: () => void;
  onDownloadTemplate?: () => void;
  isProcessing: boolean;
}

export function TemplateEditorPanel({
  currentTemplate,
  templateFiles,
  onTemplateNameChange,
  onEditorChange,
  onEditorBlur,
  onRescanPlaceholders,
  onManualRescan,
  onEntityTypeToggle,
  onClearEntityTypes,
  onDownloadTemplate,
  isProcessing
}: TemplateEditorPanelProps) {
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
      <CardContent className="flex-1 flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-4">
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
