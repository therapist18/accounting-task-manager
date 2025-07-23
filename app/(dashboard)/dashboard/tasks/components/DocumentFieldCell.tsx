// @ts-nocheck
"use client"
import { Document } from "@/types/documents";

interface Field {
  id: string;
  fieldName?: string;
}

interface DocumentFieldCellProps {
  document: Document | null;
  field: Field;
  isOldDocument?: boolean;
}

export function DocumentFieldCell({ document, field, isOldDocument = false }: DocumentFieldCellProps) {
  if (!document || !document.extracted_details || document.indicator === true || isOldDocument) {
    return <span className="text-xs text-gray-400">-</span>
  }

  const value = document.extracted_details[field.fieldName] || document.extracted_details[field.id]

  if (!value) {
    return <span className="text-xs text-gray-400">-</span>
  }

  return (
    <div className="flex items-center gap-1">
      <div className="text-xs text-gray-700 p-1 max-w-[120px] truncate" title={value}>
        {value}
      </div>
    </div>
  )
}
