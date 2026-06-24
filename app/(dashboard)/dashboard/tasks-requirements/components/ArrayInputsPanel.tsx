/**
 * ArrayInputsPanel - UI component for rendering repeating table/block inputs
 * Handles both vertical and transposed table layouts for array data
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, RotateCcw } from 'lucide-react';
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
  const [isTransposed, setIsTransposed] = useState(true); // Default to transposed layout
  const isHorizontal = config.array_direction === 'horizontal';

  // --- HORIZONTAL LAYOUT (Digit-splitting style) ---
  if (isHorizontal) {
    return (
      <div className="space-y-4 mt-3 border-l-4 border-indigo-500 pl-4 py-3 bg-slate-50/40 dark:bg-slate-900/15 rounded-r-xl border border-slate-200/50 dark:border-slate-800/40 shadow-sm">
        <div className="flex items-center justify-between">
          <Badge className="bg-orange-600/90 text-white uppercase text-[9px] font-black tracking-widest px-2 py-0.5 rounded-md">
            {blockName} (Horizontal Split)
          </Badge>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] font-bold px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200 rounded-lg shadow-sm"
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
          <div className="p-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl italic text-xs text-slate-400 text-center shadow-inner">
            No items in {blockName}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {rows.map((row: any, idx: number) => (
              <div key={idx} className="p-4 bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-850/80 rounded-xl shadow-sm space-y-3 relative group">
                <div className="absolute right-2.5 top-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg"
                    onClick={() => {
                      const newRows = rows.filter((_: any, i: number) => i !== idx);
                      onArrayInputChange(blockName, 0, '', newRows);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
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
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- VERTICAL / TRANSPOSED SHARED WRAPPER ---
  const entityLabel = config.entity_type?.[0] || config.entity_type || blockName;

  const PanelToolbar = () => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-100/60 border border-slate-200/60 dark:bg-slate-900/30 dark:border-slate-800 p-2.5 px-4 rounded-xl shadow-sm mb-3">
      <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
        <span className="w-1.5 h-3 bg-blue-600 rounded-full" />
        <span className="uppercase tracking-wider">{blockName}</span>
        <Badge variant="outline" className="text-[10px] font-black h-5 px-2 bg-blue-500/10 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-950">
          {rows.length} {rows.length === 1 ? String(entityLabel).toLowerCase() : `${String(entityLabel).toLowerCase()}s`}
        </Badge>
      </span>
      <div className="flex items-center gap-1.5 self-end sm:self-center">
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 text-[10px] font-bold px-2.5 rounded-lg border transition-all",
            isTransposed 
              ? "bg-white text-slate-700 hover:bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300"
              : "bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
          )}
          onClick={() => setIsTransposed(!isTransposed)}
          title={isTransposed ? "Switch to standard row table" : "Switch to column table"}
        >
          Layout: {isTransposed ? 'Columns' : 'Rows'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[10px] font-bold px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200 dark:border-blue-900 rounded-lg shadow-sm"
          onClick={() => {
            const emptyRow = children.reduce((acc: any, child: any) => ({ ...acc, [child.name]: '' }), {});
            onArrayInputChange(blockName, rows.length, '', { ...emptyRow, _isNewRow: true });
          }}
        >
          + Add {String(entityLabel).charAt(0).toUpperCase() + String(entityLabel).slice(1)}
        </Button>
      </div>
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="mt-2 space-y-2">
        <PanelToolbar />
        <div className="p-6 bg-white dark:bg-slate-950 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400 text-center italic shadow-inner">
          No {String(entityLabel).toLowerCase()} records found for {blockName}
        </div>
      </div>
    );
  }

  // --- VERTICAL TABLE LAYOUT ---
  if (!isTransposed) {
    return (
      <div className="mt-2 space-y-2">
        <PanelToolbar />
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-md">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <th className="text-center px-3 py-2.5 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9px] w-10 border-r border-slate-200 dark:border-slate-800">
                  #
                </th>
                {children.map((child: any) => (
                  <th key={child.id || child.name} className="text-left px-3 py-2.5 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9px] border-r border-slate-200 dark:border-slate-800 last:border-r-0">
                    {child.display_value || child.name.replace(/_/g, ' ')}
                  </th>
                ))}
                <th className="w-10 border-r border-slate-200 dark:border-slate-800 last:border-r-0" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any, idx: number) => (
                <tr
                  key={idx}
                  className={cn(
                    "border-b border-slate-100 last:border-b-0 hover:bg-blue-50/10 dark:border-slate-900 dark:hover:bg-blue-950/15 transition-colors align-middle",
                    idx % 2 === 0 ? "bg-white dark:bg-slate-950" : "bg-slate-50/50 dark:bg-slate-900/30"
                  )}
                >
                  <td className="px-3 py-2 text-center text-slate-400 dark:text-slate-500 font-mono font-bold text-[10px] border-r border-slate-200 dark:border-slate-850">
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
                        className="px-2 py-1.5 border-r border-slate-100 dark:border-slate-850 last:border-r-0 align-middle"
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
                  <td className="px-2 py-1.5 text-center align-middle">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full"
                      onClick={() => {
                        const newRows = rows.filter((_: any, i: number) => i !== idx);
                        onArrayInputChange(blockName, 0, '', newRows);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // --- TRANSPOSED TABLE LAYOUT ---
  return (
    <div className="mt-2 space-y-2">
      <PanelToolbar />
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-md">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              {/* Field column header */}
              <th className="text-left px-3.5 py-2.5 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9px] w-[140px] border-r border-slate-200 dark:border-slate-800 sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                Field Label
              </th>
              {rows.map((_: any, idx: number) => (
                <th key={idx} className="px-4 py-2 text-center border-r border-slate-200 dark:border-slate-800 last:border-r-0 min-w-[200px]">
                  <div className="flex items-center justify-between gap-2 p-0.5">
                    <Badge variant="outline" className="font-extrabold text-blue-700 bg-blue-50/50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-900 text-[10px] uppercase tracking-wide">
                      {String(entityLabel)} {idx + 1}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-red-400 hover:text-red-650 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full shrink-0"
                      onClick={() => {
                        const newRows = rows.filter((_: any, i: number) => i !== idx);
                        onArrayInputChange(blockName, 0, '', newRows);
                      }}
                    >
                      <X className="h-3 w-3" />
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
                    "border-b border-slate-100 last:border-b-0 hover:bg-blue-50/10 dark:border-slate-900 dark:hover:bg-blue-950/15 transition-colors align-middle",
                    isEvenRow ? "bg-white dark:bg-slate-950" : "bg-slate-50/50 dark:bg-slate-900/30"
                  )}
                >
                  {/* Field label column */}
                  <td className="px-3.5 py-2 font-bold text-slate-600 dark:text-slate-400 text-[10.5px] uppercase border-r border-slate-200 dark:border-slate-800 sticky left-0 bg-inherit z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
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
                        className="px-3 py-1.5 border-r border-slate-100 dark:border-slate-850 last:border-r-0 align-middle"
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
    </div>
  );
};
