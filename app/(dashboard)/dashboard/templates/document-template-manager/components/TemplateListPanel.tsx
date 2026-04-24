"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, FileText, Trash2 } from "lucide-react";
import type { DocumentTemplate } from "../types";

interface TemplateListPanelProps {
  templates: DocumentTemplate[];
  currentTemplateIndex: number | null;
  onTemplateSelect: (index: number) => void;
  onTemplateDelete: (index: number) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddTextTemplate: () => void;
  isProcessing: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export function TemplateListPanel({
  templates,
  currentTemplateIndex,
  onTemplateSelect,
  onTemplateDelete,
  onFileUpload,
  onAddTextTemplate,
  isProcessing,
  fileInputRef
}: TemplateListPanelProps) {
  return (
    <div className="flex flex-col gap-6 h-full">
      <Card>
        <CardHeader><CardTitle className="text-lg">Add New Template</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="template-upload" className="text-sm font-medium">Upload .docx File</label>
            <Input 
              id="template-upload" 
              type="file" 
              accept=".docx" 
              onChange={onFileUpload} 
              disabled={isProcessing} 
              ref={fileInputRef} 
            />
          </div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>
          <Button onClick={onAddTextTemplate} variant="outline" className="w-full">
            <PlusCircle className="mr-2 h-4 w-4" /> Create Text Template
          </Button>
        </CardContent>
      </Card>

      <Card className="flex-1 flex flex-col">
        <CardHeader><CardTitle className="text-lg">Template Queue</CardTitle></CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          {templates.length > 0 ? (
            <div className="border rounded-md">
              {templates.map((tpl, idx) => (
                <div 
                  key={tpl.id} 
                  className={`p-3 border-b last:border-b-0 flex items-center justify-between gap-2 hover:bg-muted/50 cursor-pointer ${
                    idx === currentTemplateIndex ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`} 
                  onClick={() => onTemplateSelect(idx)}
                >
                  <div className="flex items-center gap-3 flex-grow truncate">
                    <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="truncate">
                      <p className="font-medium truncate">{tpl.name}</p>
                      <div className="flex items-center flex-wrap gap-1 mt-1">
                        <Badge variant={tpl.file_type === 'text/html' ? 'default' : 'secondary'} className="text-xs">
                          {tpl.file_type === 'text/html' ? 'HTML' : 'DOCX'}
                        </Badge>
                        {tpl.entity_types?.map(et => <Badge key={et} variant="outline" className="capitalize text-xs">{et}</Badge>)}
                        <p className="text-xs text-muted-foreground">{tpl.placeholders?.length || 0} fields</p>
                      </div>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 flex-shrink-0" 
                    onClick={(e) => { e.stopPropagation(); onTemplateDelete(idx); }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center p-8">
              <h3 className="text-sm font-medium">Queue is empty</h3>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
