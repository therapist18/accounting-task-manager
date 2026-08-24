"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Settings2, List, LayoutGrid, Database, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import supabase from "@/lib/supabase/client";
import { MasterFieldPicker } from "../../templates/document-template-manager/components/MasterFieldPicker";
import type { JobField } from "../../templates/document-template-manager/types";
import { CV_MASTER_FIELD_VARIABLES, fetchCvFieldLinks, upsertCvFieldLink, type CvFieldLink, type CvFieldVariable } from "../utils/cvFieldLinks";

// Variables with no existing registry_individuals column/path to link to
// today (confirmed by repo research - no marital status, LinkedIn, GitHub,
// or professional-title column exists there). Shown as a hint, not blocked -
// an admin can still link one once they've pointed a master field at
// something (a new column, another table) via the Master Fields admin tool.
const NO_KNOWN_SOURCE = new Set([
  "personalInfo.title",
  "personalInfo.linkedin",
  "personalInfo.github",
  "personalDetails.maritalStatus",
]);

const GROUPS: Array<"Contact" | "Demographics"> = ["Contact", "Demographics"];

function VariableCard({
  variable, linkedIds, masterFields, onChange,
}: {
  variable: CvFieldVariable;
  linkedIds: number[];
  masterFields: JobField[];
  onChange: (ids: number[]) => void;
}) {
  const linkedLabels = linkedIds.map((id) => masterFields.find((f) => f.id === id)?.label).filter(Boolean) as string[];

  return (
    <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{variable.label}</p>
          <p className="text-xs font-mono text-slate-400 truncate">{variable.key}</p>
        </div>
        {linkedLabels.length > 0 ? (
          <Badge variant="outline" className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1 shrink-0">
            <Database className="h-3 w-3" /> {linkedLabels.join(", ")}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] font-medium bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800 shrink-0">
            Not linked
          </Badge>
        )}
      </div>
      {NO_KNOWN_SOURCE.has(variable.key) && linkedIds.length === 0 && (
        <p className="text-xs text-amber-600 mb-2">No data source configured for this yet — link one via Master Fields admin first.</p>
      )}
      <MasterFieldPicker
        masterFields={masterFields}
        allowMultiple
        selectedFieldIds={linkedIds}
        onMultipleSelect={onChange}
        onClear={() => onChange([])}
        placeholder="Not linked — select master field(s)..."
      />
    </div>
  );
}

export default function CvGeneratorSettingsPage() {
  const { toast } = useToast();
  const [masterFields, setMasterFields] = useState<JobField[]>([]);
  const [links, setLinks] = useState<Map<string, CvFieldLink>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<"Contact" | "Demographics">("Contact");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: fields }, cvLinks] = await Promise.all([
      supabase.from("tm_job_fields").select("id, field_key, label, sources").order("label"),
      fetchCvFieldLinks(),
    ]);
    setMasterFields((fields || []) as JobField[]);
    setLinks(new Map(cvLinks.map((l: CvFieldLink) => [l.field_key, l])));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(
    () => GROUPS.map((group) => ({
      group,
      items: CV_MASTER_FIELD_VARIABLES.filter((v) => v.group === group),
    })),
    []
  );

  const groupVariables = grouped.find((g) => g.group === selectedGroup)?.items || [];

  const handleChange = async (fieldKey: string, ids: number[]) => {
    const result = await upsertCvFieldLink(fieldKey, ids);
    if (result.success) {
      setLinks((prev) => {
        const next = new Map(prev);
        const existing = next.get(fieldKey);
        next.set(fieldKey, {
          id: existing?.id ?? fieldKey,
          field_key: fieldKey,
          master_field_ids: ids,
          created_at: existing?.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        return next;
      });
    } else {
      toast({ title: "Error", description: result.error || "Failed to save link", variant: "destructive" });
    }
  };

  return (
    <div className="h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <Link href="/dashboard/cv-generator" className="p-1.5 -ml-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </Link>
        <Settings2 className="w-5 h-5 text-custom-blue" />
        <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">CV Generator Field Sources</h1>
        <p className="hidden md:block text-sm text-slate-400 ml-2">Link Contact &amp; Demographics fields to Master Fields so they auto-fill from the Registry.</p>
      </div>

      <PanelGroup direction="horizontal" className="flex-1 min-h-0 w-full">
        {/* LEFT PANEL: Group list */}
        <Panel defaultSize={22} minSize={16} maxSize={32} className="bg-white dark:bg-slate-900 flex flex-col z-10 overflow-auto">
          <div className="flex flex-col h-full border-r border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <List className="w-4 h-4 text-custom-blue" />
                Groups
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{CV_MASTER_FIELD_VARIABLES.length} fields</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {grouped.map(({ group, items }) => {
                  const linkedCount = items.filter((v) => (links.get(v.key)?.master_field_ids.length ?? 0) > 0).length;
                  return (
                    <button
                      key={group}
                      onClick={() => setSelectedGroup(group)}
                      className={cn(
                        "flex items-center w-full p-2.5 text-sm rounded-md transition-colors",
                        selectedGroup === group
                          ? "bg-custom-blue text-white font-medium shadow-sm"
                          : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                    >
                      <LayoutGrid className="w-4 h-4 mr-2 shrink-0" />
                      <span className="truncate flex-1 text-left">{group}</span>
                      <Badge variant="outline" className="text-[10px] font-semibold rounded-full px-1.5 py-0 ml-1 tabular-nums">
                        {linkedCount}/{items.length}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors cursor-col-resize z-20" />

        {/* MAIN PANEL: Variable cards for selected group */}
        <Panel minSize={40} className="bg-slate-50 dark:bg-slate-950 flex flex-col z-10 !overflow-auto">
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{selectedGroup}</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Fields with no master field linked fall back to the CV Builder's existing Registry-import mapping — nothing breaks while these are unlinked.
              </p>
            </div>

            <ScrollArea className="flex-1 p-5">
              {loading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {groupVariables.map((variable) => (
                    <VariableCard
                      key={variable.key}
                      variable={variable}
                      linkedIds={links.get(variable.key)?.master_field_ids ?? []}
                      masterFields={masterFields}
                      onChange={(ids) => handleChange(variable.key, ids)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
