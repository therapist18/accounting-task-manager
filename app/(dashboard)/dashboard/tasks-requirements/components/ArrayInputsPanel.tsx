/**
 * ArrayInputsPanel - UI component for rendering repeating table/block inputs
 * Handles both vertical and transposed table layouts for array data
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlaceholderInput } from './PlaceholderInput';
import { extractDisplayValue } from '../utils/templateUtils';

interface ArrayInputsPanelProps {
  blockName: string;
  blockData: any;
  formData: Record<string, any>;
  originalFormData: Record<string, any>;
  onArrayInputChange: (blockName: string, rowIndex: number, fieldName: string, value: any) => void;
  onFileChange: (fieldName: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  handleImageStyleChange: (fieldKey: string, key: string, value: any) => void;
  imageStyles: Record<string, any>;
  masterFields: Map<number, any>;
  saveFieldToDatabase: (placeholder: any, value: any, source: any, arrayIndex: number | null) => Promise<void>;
  isSavingProfile: boolean;
  resolveSpecificSourceValue: (type: string, id: string, placeholder: any, arrayIndex: number | null) => string;
  getDependentDropdownOptions: (placeholder: any, masterField: any, currentRow: any) => any[];
}

export const ArrayInputsPanel = ({
  blockName,
  blockData,
  formData,
  originalFormData,
  onArrayInputChange,
  onFileChange,
  handleImageStyleChange,
  imageStyles,
  masterFields,
  saveFieldToDatabase,
  isSavingProfile,
  resolveSpecificSourceValue,
  getDependentDropdownOptions
}: ArrayInputsPanelProps) => {
  const children = blockData.children || [];
  const rows = Array.isArray(formData[blockName]) ? formData[blockName] : [];
  const config = blockData.config || {};
  const isTransposed = config.array_direction === 'transposed';
  const isHorizontal = config.array_direction === 'horizontal';

  // --- HORIZONTAL LAYOUT (Digit-splitting style) ---
  if (isHorizontal) {
    const entityLabel = config.entity_type?.[0] || config.entity_type || blockName;

    return (
      <div className="space-y-4 mt-2 border-l-2 border-blue-200 pl-4 py-2 bg-blue-50/20 rounded-r-lg">
        <div className="flex items-center justify-between">
          <Badge className="bg-orange-600 uppercase text-[9px] tracking-tighter">
            {blockName} (Horizontal)
          </Badge>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2 text-blue-600 border-blue-200"
              onClick={() => {
                const emptyRow = children.reduce((acc: any, child: any) => ({ ...acc, [child.name]: '' }), {});
                onArrayInputChange(blockName, rows.length, '', { ...emptyRow, _isNewRow: true });
              }}
            >
              + Add Item
            </Button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-3 bg-white border rounded shadow-sm italic text-xs text-muted-foreground">
            No items in {blockName}
          </div>
        ) : (
          rows.map((row: any, idx: number) => (
            <div key={idx} className="p-3 bg-white border rounded shadow-sm space-y-3">
              {children.map((child: any) => {
                let resolvedOptions: any[] = [];
                if (child.master_field_ids?.length > 0) {
                  const mf = masterFields.get(parseInt(child.master_field_ids[0]));
                  if (mf?.type === 'select') resolvedOptions = getDependentDropdownOptions(child, mf, row);
                }
                return (
                  <PlaceholderInput
                    key={child.id}
                    placeholder={child}
                    value={row[child.name]}
                    originalValue={originalFormData[blockName]?.[idx]?.[child.name]}
                    onChange={(val) => onArrayInputChange(blockName, idx, child.name, val)}
                    onSaveToDb={saveFieldToDatabase}
                    resolvedOptions={resolvedOptions}
                    onFileChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const r = new FileReader();
                        r.onloadend = () => onArrayInputChange(blockName, idx, child.name, r.result);
                        r.readAsDataURL(file);
                      }
                    }}
                    masterFields={masterFields}
                    imageStyles={imageStyles}
                    onImageStyleChange={handleImageStyleChange}
                    isArrayItem={true}
                    arrayIndex={idx}
                    blockName={blockName}
                    showLabel={true}
                    resolveSourceValue={resolveSpecificSourceValue}
                    isSaving={isSavingProfile}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>
    );
  }

  // --- VERTICAL TABLE LAYOUT ---
  // Standard: Each row is an entity, columns are fields
  if (!isTransposed) {
    const entityLabel = config.entity_type?.[0] || config.entity_type || blockName;

    return (
      <div className="mt-2 space-y-2">
        <div className="flex items-center justify-between">
          <Badge className="bg-blue-600 uppercase text-[9px] tracking-tighter">
            {blockName} — {rows.length} {String(entityLabel).toLowerCase()}(s)
          </Badge>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2 text-blue-600 border-blue-200"
              onClick={() => {
                const emptyRow = children.reduce((acc: any, child: any) => ({ ...acc, [child.name]: '' }), {});
                onArrayInputChange(blockName, rows.length, '', { ...emptyRow, _isNewRow: true });
              }}
            >
              + Add Row
            </Button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-4 bg-white border-2 border-dashed rounded text-xs text-muted-foreground italic text-center">
            No {String(entityLabel).toLowerCase()}s found for {blockName}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-wider text-[10px] w-10 border-r border-slate-200">
                    #
                  </th>
                  {children.map((child: any) => (
                    <th key={child.id || child.name} className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-wider text-[10px] border-r border-slate-200 last:border-r-0">
                      {child.display_value || child.name.replace(/_/g, ' ')}
                    </th>
                  ))}
                  <th className="w-10 border-r border-slate-200 last:border-r-0" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any, idx: number) => (
                  <tr
                    key={idx}
                    className={cn(
                      "border-b border-slate-100 last:border-b-0 hover:bg-blue-50/30 transition-colors",
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                    )}
                  >
                    <td className="px-3 py-2 text-center text-slate-400 font-mono text-[10px] border-r border-slate-200">
                      {idx + 1}
                    </td>
                    {children.map((child: any) => {
                      let resolvedOptions: any[] = [];
                      if (child.master_field_ids?.length > 0) {
                        const mf = masterFields.get(parseInt(child.master_field_ids[0]));
                        if (mf?.type === 'select') {
                          resolvedOptions = getDependentDropdownOptions(child, mf, row);
                        }
                      }
                      return (
                        <td
                          key={child.id || child.name}
                          className="px-2 py-1.5 border-r border-slate-100 last:border-r-0 align-middle"
                        >
                          <PlaceholderInput
                            placeholder={child}
                            value={row[child.name]}
                            originalValue={originalFormData[blockName]?.[idx]?.[child.name]}
                            onChange={(val) => onArrayInputChange(blockName, idx, child.name, val)}
                            onSaveToDb={saveFieldToDatabase}
                            resolvedOptions={resolvedOptions}
                            onFileChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const r = new FileReader();
                                r.onloadend = () => onArrayInputChange(blockName, idx, child.name, r.result);
                                r.readAsDataURL(file);
                              }
                            }}
                            masterFields={masterFields}
                            imageStyles={imageStyles}
                            onImageStyleChange={handleImageStyleChange}
                            isArrayItem={true}
                            arrayIndex={idx}
                            blockName={blockName}
                            showLabel={false}
                            resolveSourceValue={resolveSpecificSourceValue}
                            isSaving={isSavingProfile}
                          />
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 border-r border-slate-100 last:border-r-0 align-middle">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full"
                        onClick={() => {
                          const newRows = rows.filter((_: any, i: number) => i !== idx);
                          onArrayInputChange(blockName, 0, '', newRows);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // --- TRANSPOSED TABLE LAYOUT ---
  // Columns: [Field Label] [Entity 1] [Entity 2] [Entity 3] ...
  const entityLabel = config.entity_type?.[0] || config.entity_type || blockName;
  const colCount = rows.length + 1; // +1 for the field label column

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center justify-between">
        <Badge className="bg-blue-600 uppercase text-[9px] tracking-tighter">
          {blockName} — {rows.length} {String(entityLabel).toLowerCase()}(s)
        </Badge>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 text-blue-600 border-blue-200"
            onClick={() => {
              const emptyRow = children.reduce((acc: any, child: any) => ({ ...acc, [child.name]: '' }), {});
              onArrayInputChange(blockName, rows.length, '', { ...emptyRow, _isNewRow: true });
            }}
          >
            + Add Row
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-4 bg-white border-2 border-dashed rounded text-xs text-muted-foreground italic text-center">
          No {String(entityLabel).toLowerCase()}s found for {blockName}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {/* Field column header */}
                <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-wider text-[10px] w-[140px] border-r border-slate-200 sticky left-0 bg-slate-50 z-10">
                  Field
                </th>
                {rows.map((_: any, idx: number) => (
                  <th key={idx} className="px-3 py-2 text-center border-r border-slate-200 last:border-r-0 min-w-[180px]">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-blue-700 text-[10px] uppercase tracking-tight">
                        {String(entityLabel).charAt(0).toUpperCase() + String(entityLabel).slice(1)} {idx + 1}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full shrink-0"
                        onClick={() => {
                          const newRows = rows.filter((_: any, i: number) => i !== idx);
                          onArrayInputChange(blockName, 0, '', newRows);
                        }}
                      >
                        <X className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {children.map((child: any, childIdx: number) => {
                const isEvenRow = childIdx % 2 === 0;
                return (
                  <tr
                    key={child.id || child.name}
                    className={cn(
                      "border-b border-slate-100 last:border-b-0 hover:bg-blue-50/30 transition-colors",
                      isEvenRow ? "bg-white" : "bg-slate-50/50"
                    )}
                  >
                    {/* Field label column */}
                    <td className="px-3 py-2 font-medium text-slate-700 text-[11px] border-r border-slate-200 sticky left-0 bg-inherit z-10">
                      {child.display_value || child.name.replace(/_/g, ' ')}
                    </td>

                    {/* One input cell per entity/row */}
                    {rows.map((row: any, rowIdx: number) => {
                      let resolvedOptions: any[] = [];
                      if (child.master_field_ids?.length > 0) {
                        const mf = masterFields.get(parseInt(child.master_field_ids[0]));
                        if (mf?.type === 'select') resolvedOptions = getDependentDropdownOptions(child, mf, row);
                      }
                      return (
                        <td
                          key={rowIdx}
                          className="px-2 py-1.5 border-r border-slate-100 last:border-r-0 align-middle"
                        >
                          <PlaceholderInput
                            placeholder={child}
                            value={row[child.name]}
                            originalValue={originalFormData[blockName]?.[rowIdx]?.[child.name]}
                            onChange={(val) => onArrayInputChange(blockName, rowIdx, child.name, val)}
                            onSaveToDb={saveFieldToDatabase}
                            resolvedOptions={resolvedOptions}
                            onFileChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const r = new FileReader();
                                r.onloadend = () => onArrayInputChange(blockName, rowIdx, child.name, r.result);
                                r.readAsDataURL(file);
                              }
                            }}
                            masterFields={masterFields}
                            imageStyles={imageStyles}
                            onImageStyleChange={handleImageStyleChange}
                            isArrayItem={true}
                            arrayIndex={rowIdx}
                            blockName={blockName}
                            showLabel={false}
                            resolveSourceValue={resolveSpecificSourceValue}
                            isSaving={isSavingProfile}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
