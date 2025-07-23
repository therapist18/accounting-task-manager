// @ts-nocheck
"use client"
import { Button } from "@/components/ui/button";
import { Upload, Eye, AlertTriangle } from "lucide-react";
import { isDocumentOlderThanTask } from "@/lib/utils";
import { Document } from "@/types/documents";

interface DocumentStageCellProps {
  stage: any;
  task: any;
  onDocumentUpload: (task: any, stage: any) => void;
  onShowDocuments: (task: any, stage: any) => void;
  getKycFields: (documentId: string) => any[];
  allDocuments: Document[];
  isStageApplicableToTask: (stage: any, task: any) => boolean;
  isDocumentApplicableToTask: (document: any, task: any) => boolean;
  kycDocuments: Map<string, any>;
  linkedDocument: Document | null;
}

export function DocumentStageCell({
  stage,
  task,
  onDocumentUpload,
  onShowDocuments,
  getKycFields,
  allDocuments,
  isStageApplicableToTask,
  isDocumentApplicableToTask,
  kycDocuments,
  linkedDocument
}: DocumentStageCellProps) {
  if (!stage.documents || stage.documents.length === 0) {
    return <span className="text-xs text-gray-400 italic">N/A</span>
  }

  const stageApplicable = isStageApplicableToTask(stage, task)
  if (!stageApplicable) return <span className="text-xs text-gray-400 italic">N/A</span>

  const hasApplicableDocuments = stage.documents.some(doc => isDocumentApplicableToTask(doc, task))
  if (!hasApplicableDocuments) return <span className="text-xs text-gray-400 italic">N/A</span>

  const document = linkedDocument;
  const kycData = kycDocuments.get(stage.documents[0].kycId)
  const documentDisplayName = kycData?.display_name || kycData?.name || stage.documents[0].display_name || stage.documents[0].name || 'Document'

  const hasDocument = !!document
  const isOldDocument = document && task.created_at &&
    isDocumentOlderThanTask(document.created_at, task.created_at)

  const hasIndicator = document?.indicator === true

  return (
    <div className="flex items-center justify-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-blue-600 hover:bg-blue-100"
        onClick={() => onDocumentUpload(task, stage)}
        title={`Upload ${documentDisplayName}`}
      >
        <Upload className="h-4 w-4" />
      </Button>
      {hasDocument && !hasIndicator && !isOldDocument && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-green-600 hover:bg-green-100"
          onClick={() => onShowDocuments(task, stage)}
          title={`View Linked ${documentDisplayName}`}
        >
          <Eye className="h-4 w-4" />
        </Button>
      )}
      {isOldDocument && (
        <AlertTriangle className="h-3 w-3 text-orange-500" title="Document is older than task creation - preview disabled" />
      )}
      {hasDocument && (hasIndicator || isOldDocument) && (
        <span className="text-xs text-gray-500 ml-1" title="Preview is not available for this document.">No Preview</span>
      )}
      {!hasDocument && (
        <span className="text-xs text-gray-400 italic">Not Linked</span>
      )}
    </div>
  )
}
