"use client";
import React from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Database, Search, ChevronDown, Check, FileText, Sparkles, X } from "lucide-react";
import { EntityType, ENTITY_TYPES, COMPUTED_FUNCTIONS, LINKING_VARIABLES } from "@/lib/constants/entity-types";
import { BaseMediaConfig } from "../types";
import { type TableOption } from "@/lib/tableUtils";
import { cn } from "@/lib/utils";

interface MediaDataSourceProps {
  config: BaseMediaConfig;
  onChange: (updates: Partial<BaseMediaConfig>) => void;
  tables: TableOption[];
  loadingTables: boolean;
  documentTypes: any[];
  masterFields: any[];
  showEntityTypes?: boolean;
  showDocumentLinks?: boolean;
  showComputedFunction?: boolean;
  showDimensions?: boolean;
  showAI?: boolean;
  showMasterFieldSync?: boolean;
  title?: string;
}

export function MediaDataSource({
  config,
  onChange,
  tables,
  loadingTables,
  documentTypes,
  masterFields,
  showEntityTypes = true,
  showDocumentLinks = false,
  showComputedFunction = true,
  showDimensions = false,
  showAI = false,
  showMasterFieldSync = false,
  title = "Data Source Configuration"
}: MediaDataSourceProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-blue-600" />
        <Label className="text-sm font-medium text-blue-800">{title}</Label>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-bold text-slate-500">Source Table</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-between border-dashed border-2 hover:border-primary hover:bg-slate-50 transition-all">
              <span className="text-slate-400">
                {config.source_table ? tables.find(t => t.name === config.source_table)?.label || config.source_table : "Select source table..."}
              </span>
              <Search className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[450px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search tables..." />
              <CommandList>
                {loadingTables ? (
                  <div className="px-2 py-4 text-center text-sm text-slate-500">Loading tables...</div>
                ) : tables.length > 0 ? (
                  <CommandGroup className="max-h-[300px] overflow-y-auto">
                    {tables.map(table => (
                      <CommandItem key={table.name} onSelect={() => onChange({ source_table: table.name })}>
                        <Check className={cn("mr-2 h-4 w-4", config.source_table === table.name ? "opacity-100" : "opacity-0")} />
                        {table.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : (
                  <div className="px-2 py-4 text-center text-sm text-slate-500">No tables available</div>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {config.source_table && (
        <div className="space-y-2">
          <Label className="text-xs font-bold text-slate-500">Linking Variable</Label>
          <Select value={config.linking_variable || ''} onValueChange={(value) => onChange({ linking_variable: value || null })}>
            <SelectTrigger className="bg-white h-9">
              <SelectValue placeholder="Select linking variable..." />
            </SelectTrigger>
            <SelectContent>
              {LINKING_VARIABLES.map(variable => (
                <SelectItem key={variable.value} value={variable.value}>
                  {variable.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs font-bold text-slate-500">Document Types</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between border-dashed border-2 hover:border-primary hover:bg-slate-50 transition-all">
              <span className="text-slate-400">
                {config.document_type_ids?.length > 0
                  ? `${config.document_type_ids.length} document type${config.document_type_ids.length > 1 ? 's' : ''} selected`
                  : "Select document types..."
                }
              </span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[350px] max-h-[250px] overflow-y-auto">
            {documentTypes.map(docType => (
              <DropdownMenuCheckboxItem
                key={docType.id}
                checked={config.document_type_ids?.includes(docType.id) || false}
                onCheckedChange={(checked) => {
                  const current = config.document_type_ids || [];
                  const updated = checked
                    ? [...current, docType.id]
                    : current.filter(id => id !== docType.id);
                  onChange({ document_type_ids: updated });
                }}
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-3 w-3 text-slate-400" />
                  <span className="text-sm">{docType.display_name || docType.name}</span>
                  {docType.description && (
                    <span className="text-xs text-slate-400 ml-1">({docType.description})</span>
                  )}
                </div>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {config.document_type_ids && config.document_type_ids.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {config.document_type_ids.map(typeId => {
              const docType = documentTypes.find(dt => dt.id === typeId);
              return docType ? (
                <Badge key={typeId} variant="secondary" className="text-xs px-2 py-1 bg-amber-50 text-amber-700 border-amber-200">
                  <FileText className="h-3 w-3 mr-1" />
                  {docType.display_name || docType.name}
                  <button
                    onClick={() => {
                      const updated = config.document_type_ids?.filter(id => id !== typeId) || [];
                      onChange({ document_type_ids: updated });
                    }}
                    className="ml-1 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ) : null;
            })}
          </div>
        )}
      </div>

      {showEntityTypes && (
        <div className="space-y-2">
          <Label className="text-xs font-bold text-slate-500">Entity Types</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between border-dashed border-2 hover:border-primary hover:bg-slate-50 transition-all">
                <span className="text-slate-400">
                  {config.entity_types?.length > 0
                    ? config.entity_types.map(et => ENTITY_TYPES.find(t => t.value === et)?.label || et).join(', ')
                    : "Select entity types..."
                  }
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[300px] max-h-[200px] overflow-y-auto">
              {ENTITY_TYPES.map(entity => (
                <DropdownMenuCheckboxItem
                  key={entity.value}
                  checked={config.entity_types?.includes(entity.value) || false}
                  onCheckedChange={(checked) => {
                    const current = config.entity_types || [];
                    const updated = checked
                      ? [...current, entity.value]
                      : current.filter(et => et !== entity.value);
                    onChange({ entity_types: updated });
                  }}
                >
                  <span className="text-sm">{entity.label}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {showComputedFunction && (
        <div className="pt-4 border-t">
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-500">Extraction / Computed Function</Label>
            <Select value={config.computed_function || 'none'} onValueChange={(v) => {
              const updates: Partial<BaseMediaConfig> = { computed_function: v };

              if (v === 'none') {
                updates.execution_mode = 'latest';
              } else if (v.includes('Latest')) {
                updates.execution_mode = 'latest';
              } else {
                updates.execution_mode = 'all';
              }

              onChange(updates);
            }}>
              <SelectTrigger className="bg-white h-9">
                <SelectValue placeholder="Select extraction function..." />
              </SelectTrigger>
              <SelectContent>
                {COMPUTED_FUNCTIONS.map(fn => (
                  <SelectItem key={fn.value} value={fn.value}>
                    {fn.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {showDimensions && (
        <div className="grid grid-cols-2 gap-4 p-4 bg-green-50 rounded-xl border border-green-100">
          <div className="space-y-2">
            <Label className="text-[11px] font-bold text-green-700">Image Width</Label>
            <input className="bg-white" placeholder="e.g. 200px" />
          </div>
          <div className="space-y-2">
            <Label className="text-[11px] font-bold text-green-700">Image Height</Label>
            <input className="bg-white" placeholder="e.g. 150px" />
          </div>
        </div>
      )}

      {showAI && (
        <div className="space-y-4 border-t pt-4">
          <div className="flex items-center space-x-2">
            <Checkbox id="is_ai" />
            <Label htmlFor="is_ai" className="text-purple-700 font-bold flex items-center gap-2 uppercase text-[11px] tracking-wider">
              <Sparkles className="h-4 w-4" /> Enable AI Refinement
            </Label>
          </div>
          <Textarea
            className="bg-purple-50/30 border-purple-100"
            placeholder="Prompt: Rewrite the source data to be more professional..."
          />
        </div>
      )}

      {showMasterFieldSync && (
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase font-bold text-blue-600">Master Field Sync</Label>
          <Select value="none" onValueChange={() => {}}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Link field..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {masterFields.map(mf => (
                <SelectItem key={mf.id} value={String(mf.id)}>{mf.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
