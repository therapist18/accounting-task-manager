"use client";
import React from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, Info, ArrowUp, ArrowDown, Database, HelpCircle, FileText, X } from "lucide-react";
import type { Placeholder, JobField, JobQuestion, Requirement } from "../types";

interface PlaceholderSourceManagerProps {
  placeholder: Placeholder;
  masterFields: JobField[];
  jobQuestions: JobQuestion[];
  requirements: Requirement[];
  onUpdate: (updates: Partial<Placeholder>) => void;
  onRemove: (type: 'db' | 'job' | 'req', id: any) => void;
}

export function PlaceholderSourceManager({
  placeholder,
  masterFields,
  jobQuestions,
  requirements,
  onUpdate,
  onRemove
}: PlaceholderSourceManagerProps) {
  const moveItem = (listKey: 'master_field_ids' | 'linked_job_question_ids' | 'linked_requirement_ids', index: number, direction: 'up' | 'down') => {
    const newList = [...(placeholder[listKey] || [])] as any[];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newList.length) return;
    [newList[index], newList[targetIndex]] = [newList[targetIndex], newList[index]];
    onUpdate({ [listKey]: newList });
  };

  const totalSources = (placeholder.master_field_ids?.length || 0) +
    (placeholder.linked_job_question_ids?.length || 0) +
    (placeholder.linked_job_question_id ? 1 : 0) +
    (placeholder.linked_requirement_ids?.length || 0);

  if (totalSources === 0) return null;

  return (
    <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner mb-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
          <Layers className="h-3 w-3" /> Active Sources & Priority
        </Label>
        {totalSources > 1 && (
          <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border shadow-sm">
            <Label className="text-[9px] font-bold text-slate-400 uppercase">Logic:</Label>
            <select
              value={placeholder.source_logic || 'priority'}
              onChange={(e) => onUpdate({ source_logic: e.target.value as 'all' | 'priority' })}
              className="h-6 w-[130px] text-[10px] border-none shadow-none focus:ring-0 bg-transparent"
            >
              <option value="priority">Fallback (Priority)</option>
              <option value="all">Return All (Merge)</option>
            </select>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {placeholder.master_field_ids?.map((id, idx) => (
          <div key={`db-${id}`} className="flex items-center gap-2 bg-white p-2 rounded-md border shadow-sm group">
            <div className="flex flex-col border-r pr-1 mr-1">
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-blue-600" onClick={() => moveItem('master_field_ids', idx, 'up')} disabled={idx === 0}><ArrowUp className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-blue-600" onClick={() => moveItem('master_field_ids', idx, 'down')} disabled={idx === placeholder.master_field_ids.length - 1}><ArrowDown className="h-3 w-3" /></Button>
            </div>
            <Database className="h-3.5 w-3.5 text-blue-600" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-700 truncate">{masterFields.find(f => f.id === id)?.label || id}</p>
              <p className="text-[9px] text-blue-500/70 font-mono">DB Field</p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => onRemove('db', id)}><X className="h-4 w-4" /></Button>
          </div>
        ))}

        {/* Legacy array support */}
        {placeholder.linked_job_question_ids?.map((id, idx) => (
          <div key={`job-${id}`} className="flex items-center gap-2 bg-white p-2 rounded-md border shadow-sm group">
            <div className="flex flex-col border-r pr-1 mr-1">
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-purple-600" onClick={() => moveItem('linked_job_question_ids', idx, 'up')} disabled={idx === 0}><ArrowUp className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-purple-600" onClick={() => moveItem('linked_job_question_ids', idx, 'down')} disabled={idx === placeholder.linked_job_question_ids.length - 1}><ArrowDown className="h-3 w-3" /></Button>
            </div>
            <HelpCircle className="h-3.5 w-3.5 text-purple-600" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-700 truncate">{jobQuestions.find(q => q.id === id)?.label || id}</p>
              <p className="text-[9px] text-purple-500/70 font-mono">Job Question</p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => onRemove('job', id)}><X className="h-4 w-4" /></Button>
          </div>
        ))}

        {/* New singular field with option mapping */}
        {placeholder.linked_job_question_id && (
          <div className="flex items-center gap-2 bg-purple-50 p-2 rounded-md border border-purple-200 shadow-sm group">
            <HelpCircle className="h-3.5 w-3.5 text-purple-600" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-700 truncate">{jobQuestions.find(q => q.id === placeholder.linked_job_question_id)?.label || placeholder.linked_job_question_id}</p>
              <p className="text-[9px] text-purple-500/70 font-mono">Job Question</p>
              {placeholder.linked_job_question_option && (
                <p className="text-[9px] text-amber-600 font-mono mt-0.5">
                  Option: <span className="font-bold">{placeholder.linked_job_question_option}</span>
                </p>
              )}
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 text-slate-300 hover:text-red-500" 
              onClick={() => onUpdate({ linked_job_question_id: undefined, linked_job_question_option: undefined })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {placeholder.linked_requirement_ids?.map((id, idx) => (
          <div key={`req-${id}`} className="flex items-center gap-2 bg-white p-2 rounded-md border shadow-sm group">
            <div className="flex flex-col border-r pr-1 mr-1">
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-green-600" onClick={() => moveItem('linked_requirement_ids', idx, 'up')} disabled={idx === 0}><ArrowUp className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-green-600" onClick={() => moveItem('linked_requirement_ids', idx, 'down')} disabled={idx === placeholder.linked_requirement_ids.length - 1}><ArrowDown className="h-3 w-3" /></Button>
            </div>
            <FileText className="h-3.5 w-3.5 text-green-600" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-700 truncate">{requirements.find(r => r.id === id)?.label || id}</p>
              <p className="text-[9px] text-green-500/70 font-mono">Requirement</p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => onRemove('req', id)}><X className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>

      {placeholder.source_logic === 'priority' && totalSources > 1 && (
        <div className="p-2 bg-blue-50 border border-blue-100 rounded-lg flex gap-2">
          <Info className="h-4 w-4 text-blue-500 shrink-0" />
          <p className="text-[10px] text-blue-700 leading-tight">
            <strong>Priority Mode:</strong> The system will try to find a value from the top source first, falling back to the next if empty.
          </p>
        </div>
      )}
    </div>
  );
}
