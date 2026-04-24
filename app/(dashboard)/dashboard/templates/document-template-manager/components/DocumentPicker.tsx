"use client";
import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { ChevronsUpDown, Check, X, FileText } from "lucide-react";

interface DocumentPickerProps {
  documents: Array<{ id: string; display_name: string; name: string }>;
  selectedDocumentIds?: string[];
  onSelect: (documentId: string) => void;
  onRemove: (documentId: string) => void;
  onClear: () => void;
}

export function DocumentPicker({
  documents,
  selectedDocumentIds = [],
  onSelect,
  onRemove,
  onClear,
}: DocumentPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedDocuments = useMemo(() =>
    documents.filter(d => selectedDocumentIds.includes(d.id)),
    [documents, selectedDocumentIds]);

  const filteredDocuments = useMemo(() => {
    if (!search) return documents;
    const searchLower = search.toLowerCase();
    return documents.filter(document =>
      document.display_name?.toLowerCase().includes(searchLower) ||
      document.name?.toLowerCase().includes(searchLower)
    );
  }, [documents, search]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
              <span className="truncate">
                {selectedDocuments.length > 0
                  ? `${selectedDocuments.length} document${selectedDocuments.length > 1 ? 's' : ''} selected`
                  : "Select documents..."}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search documents..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>No documents found.</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {filteredDocuments.map((document) => {
                    const isSelected = selectedDocumentIds.includes(document.id);
                    return (
                      <CommandItem
                        key={document.id}
                        value={document.display_name || document.name}
                        onSelect={() => {
                          if (isSelected) {
                            onRemove(document.id);
                          } else {
                            onSelect(document.id);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div>
                            <div className="font-medium">{document.display_name || document.name}</div>
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedDocuments.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {selectedDocuments.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedDocuments.map(document => (
            <Badge
              key={document.id}
              variant="secondary"
              className="flex items-center gap-1.5 pr-1.5 bg-green-50 text-green-700 border-green-200"
            >
              <FileText className="h-3 w-3" />
              <span className="max-w-[200px] truncate">{document.display_name || document.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(document.id);
                }}
                className="ml-1 rounded-full p-0.5 hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
