// @ts-nocheck
"use client"
import { Button } from "@/components/ui/button";
import { Upload, Eye, AlertTriangle } from "lucide-react";
import { isDocumentOlderThanTask } from "@/lib/utils";
import { Document } from "@/types/documents";

interface Stage {
  id: string;
  name: string;
  order_num?: number;
  documents?: Array<{
    kycId: string;
    display_name?: string;
    name?: string;
  }>;
}

interface Task {
  id: string;
  applicant_name: string;
  individual_id: string;
  created_at: string;
}

interface KycDocument {
  id: string;
  name: string;
  display_name?: string;
}

interface DocumentStageCellProps {
  stage: Stage;
  task: Task;
  onDocumentUpload: (task: Task, stage: Stage) => void;
  onShowDocuments: (task: Task, stage: Stage) => void;
  getKycFields: (documentId: string) => any[];
  allDocuments: Document[];
  isStageApplicableToTask: (stage: Stage, task: Task) => boolean;
  isDocumentApplicableToTask: (document: Document, task: Task) => boolean;
  kycDocuments: Map<string, KycDocument>;
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
        >
          <Eye className="h-4 w-4" />
        </Button>
      )}
      {/* Show alert icon for old documents */}
      {isOldDocument && (
        <AlertTriangle className="h-3 w-3 text-orange-500" />
      )}
      {/* If document exists but has an indicator or is old, show a message instead of the preview button */}
      {hasDocument && (hasIndicator || isOldDocument) && (
        <span className="text-xs text-gray-500 ml-1">No Preview</span>
      )}
      {!hasDocument && (
        <span className="text-xs text-gray-400 italic">Not Linked</span>
      )}
    </div>
  )
}
