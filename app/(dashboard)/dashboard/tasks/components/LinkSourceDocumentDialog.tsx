// @ts-nocheck
"use client"
import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

interface Task {
  id: string;
  applicant_name: string;
  individual_id: string;
  source_document_id?: Record<string, string>;
  created_at: string;
}

interface Stage {
  id: string;
  name: string;
  order_num?: number;
  documents?: Array<{
    kycId: string;
  }>;
}

interface Document {
  id: string;
  document_id: string;
  file_path: string;
  created_at: string;
  director_id: string;
}

interface KycDocument {
  id: string;
  name: string;
  display_name?: string;
}

interface LinkSourceDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
  stages: Stage[];
  allDocuments: Document[];
  kycDocuments: Map<string, KycDocument>;
  onLinkSuccess: () => void;
  isStageApplicableToTask: (stage: Stage, task: Task) => boolean;
}

export function LinkSourceDocumentDialog({
  open,
  onOpenChange,
  task,
  stages,
  allDocuments,
  kycDocuments,
  onLinkSuccess,
  isStageApplicableToTask
}: LinkSourceDocumentDialogProps) {
  const [selectedDocs, setSelectedDocs] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (task?.source_document_id && typeof task.source_document_id === 'object') {
      setSelectedDocs(task.source_document_id as Record<string, string>);
    } else {
      setSelectedDocs({});
    }
  }, [task, open]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('tm_tasks')
        .update({ source_document_id: selectedDocs, updated_at: new Date().toISOString() })
        .eq('id', task.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Source documents have been linked successfully.",
      });
      onLinkSuccess();
    } catch (error) {
      console.error("Failed to link documents:", error);
      toast({
        title: "Error",
        description: `Failed to link source documents: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const applicableStages = useMemo(() => {
    return stages
      .filter(stage => isStageApplicableToTask(stage, task) && stage.documents?.length > 0)
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  }, [stages, task, isStageApplicableToTask]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Link Source Documents for: {task.applicant_name}</DialogTitle>
          <DialogDescription>
            Select a specific document version for each stage. Only the selected document will be shown in the task view.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-hidden border-t border-b">
          <ScrollArea className="h-full pr-6">
            <div className="space-y-6 py-4">
              {applicableStages.map(stage => {
                const stageDocTypes = stage.documents.map(d => d.kycId);
                const availableDocs = allDocuments.filter(
                  d => d.director_id === task.individual_id && stageDocTypes.includes(d.document_id)
                ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                return (
                  <div key={stage.id} className="p-4 border rounded-lg">
                    <h3 className="font-semibold text-lg text-slate-800 mb-3">{stage.name}</h3>
                    {availableDocs.length > 0 ? (
                      <RadioGroup
                        value={selectedDocs[stage.id]}
                        onValueChange={(docId) => {
                          setSelectedDocs(prev => ({ ...prev, [stage.id]: docId }));
                        }}
                      >
                        <div className="space-y-2">
                          {availableDocs.map(doc => {
                            const kycDoc = kycDocuments.get(doc.document_id);
                            return (
                              <Label
                                key={doc.id}
                                htmlFor={doc.id}
                                className={`flex items-center gap-4 p-3 border rounded-md cursor-pointer transition-colors hover:bg-slate-50 ${selectedDocs[stage.id] === doc.id ? 'bg-blue-50 border-blue-300' : ''}`}
                                title={`Select ${kycDoc?.display_name || kycDoc?.name || 'Document'}`}
                              >
                                <RadioGroupItem value={doc.id} id={doc.id} />
                                <FileText className="h-5 w-5 text-slate-600" />
                                <div className="flex-grow">
                                  <p className="font-medium text-slate-900">{kycDoc?.display_name || kycDoc?.name || 'Document'}</p>
                                  <p className="text-xs text-slate-500">{doc.file_path?.split('/').pop()}</p>
                                </div>
                                <div className="text-xs text-slate-500 text-right">
                                  <p>Uploaded:</p>
                                  <p>{format(parseISO(doc.created_at), 'dd MMM yyyy, HH:mm')}</p>
                                </div>
                              </Label>
                            )
                          })}
                        </div>
                      </RadioGroup>
                    ) : (
                      <div className="text-center py-4 text-slate-500 text-sm">
                        No documents of the required type found for this applicant.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Links
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
