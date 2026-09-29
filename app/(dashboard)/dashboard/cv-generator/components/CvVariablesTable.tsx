"use client";

// Table view of "all the variables on this CV" — the Review tab's alternate layout next to the
// per-section form (SectionEditors.tsx). Same cvData/setCvData shape, same fields
// (cvVariablesConfig.ts is the shared source of truth with the Excel export/import), just laid
// out as editable tables instead of one section at a time. Mirrors Consultancy Contracts'
// DataValuesPanel.tsx + ArrayBlockSection for the visual pattern (grouped scalar rows, then one
// transposed-free table per array section).
import { useState } from "react";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  SCALAR_FIELD_DEFS, ARRAY_SECTION_DEFS, getScalarValue, setScalarValue,
  isFieldRequired, responsibilitiesToLines, PROFICIENCY_LEVELS, COMMON_LANGUAGES,
} from "../utils/cvVariablesConfig";
import { getMissingFields } from "../utils/cvGeneratorData";

interface CvVariablesTableProps {
  cvData: any;
  setCvData: (updater: any) => void;
}

const SCALAR_GROUPS = ["Contact", "Personal Details", "Summary & Declaration"] as const;

export function CvVariablesTable({ cvData, setCvData }: CvVariablesTableProps) {
  return (
    <div className="space-y-6">
      {SCALAR_GROUPS.map((group) => (
        <ScalarGroupTable key={group} group={group} cvData={cvData} setCvData={setCvData} />
      ))}
      {ARRAY_SECTION_DEFS.map((section) => (
        <ArraySectionTable key={section.id} section={section} cvData={cvData} setCvData={setCvData} />
      ))}
    </div>
  );
}

function ScalarGroupTable({ group, cvData, setCvData }: { group: (typeof SCALAR_GROUPS)[number]; cvData: any; setCvData: (u: any) => void }) {
  const fields = SCALAR_FIELD_DEFS.filter((f) => f.group === group);
  const update = (path: string, value: any) => setCvData((prev: any) => setScalarValue(prev, path, value));

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">{group}</h4>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden divide-y divide-slate-100">
        {fields.map((f) => {
          const value = getScalarValue(cvData, f.path);
          return (
            <div key={f.path} className="grid grid-cols-1 md:grid-cols-[35%_1fr] gap-3.5 p-3 items-center hover:bg-slate-50/80 transition-colors">
              <span className="text-xs font-semibold text-slate-700 pl-1">{f.label}</span>
              {f.type === "boolean" ? (
                <select
                  value={value ? "yes" : "no"}
                  onChange={(e) => update(f.path, e.target.value === "yes")}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              ) : f.type === "textarea" ? (
                <Textarea
                  value={value || ""}
                  onChange={(e) => update(f.path, e.target.value)}
                  rows={3}
                  className="text-sm resize-none"
                />
              ) : (
                <Input
                  value={value || ""}
                  onChange={(e) => update(f.path, e.target.value)}
                  className="h-9 text-sm"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArraySectionTable({ section, cvData, setCvData }: { section: (typeof ARRAY_SECTION_DEFS)[number]; cvData: any; setCvData: (u: any) => void }) {
  const items: any[] = cvData[section.id] || [];
  const [editingCell, setEditingCell] = useState<{ idx: number; key: string } | null>(null);

  const updateItem = (idx: number, key: string, value: any) => {
    setCvData((prev: any) => {
      const next = [...(prev[section.id] || [])];
      next[idx] = { ...next[idx], [key]: value };
      return { ...prev, [section.id]: next };
    });
  };
  const removeItem = (idx: number) => {
    setCvData((prev: any) => ({ ...prev, [section.id]: (prev[section.id] || []).filter((_: any, i: number) => i !== idx) }));
  };
  const addItem = () => {
    setCvData((prev: any) => ({ ...prev, [section.id]: [...(prev[section.id] || []), section.emptyItem()] }));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">{section.label}</h4>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-indigo-50 text-indigo-600 border-indigo-200">
          {items.length} {items.length === 1 ? "entry" : "entries"}
        </Badge>
        <button
          type="button"
          onClick={addItem}
          className="ml-auto h-6 px-2 rounded-md text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 border border-dashed border-indigo-300 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {items.length === 0 ? (
        <div className="p-4 bg-white border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-400 text-center italic">
          No {section.label.toLowerCase()} entries yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {section.fields.map((f) => (
                  <th key={f.key} className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-wider text-[10px] border-r border-slate-200 last:border-r-0 min-w-[140px]">
                    {f.label}
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const missing = getMissingFields(section.id, item);
                return (
                  <tr key={idx} className={cn("border-b border-slate-100 last:border-b-0 align-top", idx % 2 === 1 && "bg-slate-50/50")}>
                    {section.fields.map((f) => {
                      const isEditing = editingCell?.idx === idx && editingCell?.key === f.key;
                      const rawValue = f.type === "list" ? responsibilitiesToLines(item[f.key]).join("\n") : (item[f.key] ?? "");
                      const isMissingReq = isFieldRequired(section.id, f.key) && missing.includes(f.label);
                      return (
                        <td key={f.key} className={cn("px-2 py-1 border-r border-slate-100 last:border-r-0", isMissingReq && "bg-amber-50/50")}>
                          {isEditing ? (
                            f.type === "list" || f.type === "textarea" ? (
                              <Textarea
                                autoFocus
                                className="text-[11px] min-h-[60px]"
                                value={rawValue}
                                onChange={(e) => updateItem(idx, f.key, f.type === "list" ? e.target.value.split("\n") : e.target.value)}
                                onBlur={() => setEditingCell(null)}
                              />
                            ) : f.type === "proficiency" ? (
                              <select
                                autoFocus
                                className="h-7 text-[11px] w-full border rounded px-1"
                                value={rawValue}
                                onChange={(e) => { updateItem(idx, f.key, e.target.value); setEditingCell(null); }}
                                onBlur={() => setEditingCell(null)}
                              >
                                <option value="">—</option>
                                {PROFICIENCY_LEVELS.map((p) => <option key={p} value={p}>{p}</option>)}
                              </select>
                            ) : f.type === "language" ? (
                              <input
                                autoFocus
                                list="cv-common-languages"
                                className="h-7 text-[11px] w-full border rounded px-1.5"
                                value={rawValue}
                                onChange={(e) => updateItem(idx, f.key, e.target.value)}
                                onBlur={() => setEditingCell(null)}
                              />
                            ) : (
                              <Input
                                autoFocus
                                className="h-7 text-[11px] px-1.5"
                                value={rawValue}
                                onChange={(e) => updateItem(idx, f.key, e.target.value)}
                                onBlur={() => setEditingCell(null)}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { setEditingCell(null); (e.target as HTMLInputElement).blur(); } }}
                              />
                            )
                          ) : (
                            <div
                              className={cn(
                                "min-h-[28px] flex items-center px-1.5 py-1 rounded cursor-text hover:bg-indigo-50/60 transition-colors whitespace-pre-wrap",
                                rawValue ? "text-slate-700" : "text-slate-400 italic"
                              )}
                              onClick={() => setEditingCell({ idx, key: f.key })}
                            >
                              {isMissingReq && <AlertCircle className="w-3 h-3 text-amber-500 mr-1 shrink-0" />}
                              {rawValue || "Click to edit"}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-1 py-1 text-center">
                      <button type="button" onClick={() => removeItem(idx)} className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50" title="Remove entry">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <datalist id="cv-common-languages">
        {COMMON_LANGUAGES.map((l) => <option key={l} value={l} />)}
      </datalist>
    </div>
  );
}
