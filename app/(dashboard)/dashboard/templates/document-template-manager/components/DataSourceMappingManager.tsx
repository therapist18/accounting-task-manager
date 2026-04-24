"use client";
import React from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { PlusCircle, X, Plus } from "lucide-react";
import { EntityType, ENTITY_TYPES, COMPUTED_FUNCTIONS } from "@/lib/constants/entity-types";
import { DocumentPicker } from "./DocumentPicker";

interface DataSourceMappingManagerProps {
  dataSources: Array<{
    id: string;
    table: 'acc_portal_kyc_uploads' | 'acc_portal_directors_documents';
    linking_variable: string;
    entity_types: EntityType[];
    computed_function?: string;
    linked_document_ids?: string[];
  }>;
  onChange: (dataSources: Array<{
    id: string;
    table: 'acc_portal_kyc_uploads' | 'acc_portal_directors_documents';
    linking_variable: string;
    entity_types: EntityType[];
    computed_function?: string;
    linked_document_ids?: string[];
  }>) => void;
  availableDocuments: Array<{ id: string; display_name: string; name: string }>;
}

export function DataSourceMappingManager({
  dataSources,
  onChange,
  availableDocuments,
}: DataSourceMappingManagerProps) {
  const addDataSource = () => {
    const newDataSource = {
      id: Date.now().toString(),
      table: 'acc_portal_kyc_uploads' as const,
      linking_variable: 'company_id',
      entity_types: ['company'] as EntityType[],
      computed_function: 'none',
      linked_document_ids: [] as string[]
    };
    onChange([...dataSources, newDataSource]);
  };

  const updateDataSource = (id: string, updates: Partial<typeof dataSources[0]>) => {
    onChange(dataSources.map(ds => ds.id === id ? { ...ds, ...updates } : ds));
  };

  const removeDataSource = (id: string) => {
    if (dataSources.length > 1) {
      onChange(dataSources.filter(ds => ds.id !== id));
    }
  };

  return (
    <div className="space-y-3">
      {dataSources.map((dataSource, index) => (
        <div key={dataSource.id} className="p-3 bg-white rounded-lg border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-bold text-blue-700">Data Source {index + 1}</Label>
            {dataSources.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeDataSource(dataSource.id)}
                className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1">
              <Label className="text-[9px] text-slate-500 font-semibold">Entity Context</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full h-7 text-xs justify-between bg-white">
                    {dataSource.entity_types.length > 0
                      ? `${dataSource.entity_types.length} entit${dataSource.entity_types.length > 1 ? 'ies' : 'y'} selected`
                      : "Select entity types..."}
                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search entity types..." className="h-7 text-xs" />
                    <CommandList>
                      <CommandEmpty>No entity types found.</CommandEmpty>
                      <CommandGroup className="max-h-[200px] overflow-y-auto">
                        {ENTITY_TYPES.map((type) => {
                          const isSelected = dataSource.entity_types.includes(type.value);
                          return (
                            <CommandItem
                              key={type.value}
                              value={type.value}
                              onSelect={() => {
                                const current = dataSource.entity_types;
                                if (isSelected) {
                                  updateDataSource(dataSource.id, {
                                    entity_types: current.filter(t => t !== type.value)
                                  });
                                } else {
                                  updateDataSource(dataSource.id, {
                                    entity_types: [...current, type.value]
                                  });
                                }
                              }}
                              className="cursor-pointer text-xs"
                            >
                              <div className={`mr-2 flex h-3 w-3 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                                {isSelected && <Check className="h-2 w-2" />}
                              </div>
                              <span className="text-xs">{type.label}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <Label className="text-[9px] text-slate-500 font-semibold">Source Table</Label>
              <Select
                value={dataSource.table}
                onValueChange={(v: 'acc_portal_kyc_uploads' | 'acc_portal_directors_documents') =>
                  updateDataSource(dataSource.id, { table: v })
                }
              >
                <SelectTrigger className="h-7 text-xs bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="acc_portal_kyc_uploads">KYC Uploads Table</SelectItem>
                  <SelectItem value="acc_portal_directors_documents">Directors Docs Table</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[9px] text-slate-500 font-semibold">Linking Field</Label>
              <Input
                className="h-7 text-xs bg-white"
                placeholder="e.g. company_id"
                value={dataSource.linking_variable}
                onChange={e => updateDataSource(dataSource.id, { linking_variable: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[9px] text-slate-500 font-semibold">Computed Function</Label>
              <Select
                value={dataSource.computed_function || 'none'}
                onValueChange={(v) => {
                  updateDataSource(dataSource.id, { computed_function: v });
                }}
              >
                <SelectTrigger className="h-7 text-xs bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMPUTED_FUNCTIONS.map(fn => (
                    <SelectItem key={fn.value} value={fn.value} className="text-xs">
                      {fn.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[9px] text-slate-500 font-semibold">Selected Documents</Label>
              <DocumentPicker
                documents={availableDocuments}
                selectedDocumentIds={dataSource.linked_document_ids || []}
                onSelect={(documentId) => {
                  const current = dataSource.linked_document_ids || [];
                  updateDataSource(dataSource.id, {
                    linked_document_ids: [...current, documentId]
                  });
                }}
                onRemove={(documentId) => {
                  const current = dataSource.linked_document_ids || [];
                  updateDataSource(dataSource.id, {
                    linked_document_ids: current.filter(id => id !== documentId)
                  });
                }}
                onClear={() => {
                  updateDataSource(dataSource.id, {
                    linked_document_ids: []
                  });
                }}
              />
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addDataSource}
        className="w-full h-8 border-dashed border-blue-300 text-blue-600 hover:bg-blue-100"
      >
        <PlusCircle className="h-3 w-3 mr-2" />
        Add Data Source Mapping
      </Button>
    </div>
  );
}
