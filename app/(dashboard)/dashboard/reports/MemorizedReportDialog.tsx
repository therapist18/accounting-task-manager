// @ts-nocheck
// components/MemorizedReportDialog.tsx

"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { Loader2, Plus, Pencil, Trash2, X, Save, Star, Filter } from "lucide-react"
import type { Department, KycDocument } from "../utils/taskManagerData"
import { ENHANCED_TABLE_HEADERS_IMMIGRATION } from "../tasks/overall-view/tableUtils"

// --- Type Definitions ---

type FieldConfig = {
  id: string;
  isDefault: boolean; // True = Visible on load
};

type ReportConfiguration = {
  taskFields: FieldConfig[]; 
  stages: {
    [stageId: string]: {
      isStageDateSelected: boolean;
      isStageDateDefault: boolean;
      documents: {
        [kycId: string]: {
          fields: FieldConfig[];
        }
      }
    }
  }
};

export type MemorizedReport = {
  id: string;
  name: string;
  description?: string;
  configuration: ReportConfiguration;
  department_id: number;
  is_favorite?: boolean;
};

interface MemorizedReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: Department | null;
  stages: any[];
  kycDocuments: Map<string, KycDocument>;
  onApplyReport: (report: MemorizedReport) => void;
  tableHeaders: typeof ENHANCED_TABLE_HEADERS_IMMIGRATION;
}

const INITIAL_REPORT_CONFIG: ReportConfiguration = {
  taskFields: [{ id: 'applicant_name', isDefault: true }],
  stages: {}
};

// --- Helper: Normalizer for Backward Compatibility ---
const normalizeConfiguration = (config: any): ReportConfiguration => {
  if (!config) return INITIAL_REPORT_CONFIG;

  const normalized: ReportConfiguration = {
    taskFields: [],
    stages: {}
  };

  if (Array.isArray(config.taskFields)) {
    normalized.taskFields = config.taskFields.map((f: any) => 
      typeof f === 'string' ? { id: f, isDefault: true } : f
    );
  }

  if (config.stages) {
    Object.entries(config.stages).forEach(([stageId, stageConfig]: [string, any]) => {
      normalized.stages[stageId] = {
        isStageDateSelected: stageConfig.isStageDateSelected ?? true,
        isStageDateDefault: stageConfig.isStageDateDefault ?? true,
        documents: {}
      };

      if (stageConfig.documents) {
        Object.entries(stageConfig.documents).forEach(([kycId, docConfig]: [string, any]) => {
          let fields: FieldConfig[] = [];
          if (Array.isArray(docConfig.fields)) {
            fields = docConfig.fields.map((f: any) => 
              typeof f === 'string' ? { id: f, isDefault: true } : f
            );
          }
          normalized.stages[stageId].documents[kycId] = { fields };
        });
      }
    });
  }

  return normalized;
};

export function MemorizedReportDialog({
  open,
  onOpenChange,
  department,
  stages,
  kycDocuments,
  onApplyReport,
  tableHeaders,
}: MemorizedReportDialogProps) {
  const [reports, setReports] = useState<MemorizedReport[]>([])
  const [selectedReport, setSelectedReport] = useState<MemorizedReport | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [reportName, setReportName] = useState("")
  const [reportConfig, setReportConfig] = useState<ReportConfiguration>(INITIAL_REPORT_CONFIG)
  
  // UPDATED: Default is now TRUE
  const [showSelectedOnly, setShowSelectedOnly] = useState(true);

  const fetchReports = useCallback(async () => {
    if (!department) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('tm_memorized_reports')
        .select('*')
        .eq('department_id', department.id)
        .order('name', { ascending: true });
      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error("Error fetching reports:", error);
      toast({ title: "Error", description: "Could not fetch reports.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [department]);

  useEffect(() => {
    if (open && department) {
      fetchReports();
    } else {
      setSelectedReport(null);
      setIsEditing(false);
      setShowSelectedOnly(true); // Reset to true on open
    }
  }, [open, fetchReports, department]);

  // --- Actions ---

  const handleCreateNew = () => {
    setSelectedReport(null);
    setReportName("");
    setReportConfig(INITIAL_REPORT_CONFIG);
    setIsEditing(true);
    setShowSelectedOnly(true);
  };

  const handleSelectReport = (report: MemorizedReport) => {
    setSelectedReport(report);
    setReportName(report.name);
    setReportConfig(normalizeConfiguration(report.configuration));
    setIsEditing(false);
    setShowSelectedOnly(true);
  };

  const handleToggleFavorite = async (e: React.MouseEvent, report: MemorizedReport) => {
    e.stopPropagation();
    const newStatus = !report.is_favorite;
    setReports(prev => prev.map(r => r.id === report.id ? { ...r, is_favorite: newStatus } : r));
    try {
      await supabase.from('tm_memorized_reports').update({ is_favorite: newStatus }).eq('id', report.id);
    } catch (err) {
      toast({ title: "Error", description: "Failed to update favorite status", variant: "destructive" });
      fetchReports();
    }
  };

  const handleSaveReport = async () => {
    if (!reportName.trim() || !department) return;
    setIsLoading(true);
    try {
      const reportData = {
        name: reportName,
        configuration: reportConfig,
        department_id: department.id,
      };

      if (selectedReport && selectedReport.id) {
        const { data, error } = await supabase.from('tm_memorized_reports').update(reportData).eq('id', selectedReport.id).select().single();
        if (error) throw error;
        handleSelectReport(data);
        toast({ title: "Success", description: "Report updated." });
      } else {
        const { data, error } = await supabase.from('tm_memorized_reports').insert(reportData).select().single();
        if (error) throw error;
        setSelectedReport(data);
        toast({ title: "Success", description: "Report created." });
      }
      setIsEditing(false);
      await fetchReports();
    } catch (error) {
      toast({ title: "Error", description: "Failed to save report.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if(!window.confirm("Are you sure you want to delete this report?")) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.from('tm_memorized_reports').delete().eq('id', reportId);
      if (error) throw error;
      toast({ title: "Success", description: "Report deleted." });
      setSelectedReport(null);
      setIsEditing(false);
      await fetchReports();
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete report.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (selectedReport) {
      onApplyReport({
        ...selectedReport,
        configuration: normalizeConfiguration(reportConfig)
      });
      onOpenChange(false);
    }
  };

  // --- Toggle Logic (Updated for Independence) ---

  const toggleTaskField = (fieldId: string, type: 'include' | 'default') => {
    setReportConfig(prev => {
      const current = prev.taskFields || [];
      const exists = current.find(f => f.id === fieldId);
      let newFields = [...current];

      if (type === 'include') {
        if (exists) {
          // Unchecking Report Table removes it
          newFields = newFields.filter(f => f.id !== fieldId);
        } else {
          // Checking Report Table adds it (default false)
          newFields.push({ id: fieldId, isDefault: false });
        }
      } else if (type === 'default') {
        if (exists) {
          // Toggle default state
          newFields = newFields.map(f => f.id === fieldId ? { ...f, isDefault: !f.isDefault } : f);
        } else {
          // Checking Default on an item that isn't included adds it AND sets default true
          newFields.push({ id: fieldId, isDefault: true });
        }
      }
      return { ...prev, taskFields: newFields };
    });
  };

  const toggleStageDate = (stageId: string, type: 'include' | 'default') => {
    setReportConfig(prev => {
      const newStages = { ...prev.stages };
      if (!newStages[stageId]) newStages[stageId] = { isStageDateSelected: false, isStageDateDefault: false, documents: {} };
      
      if (type === 'include') {
        newStages[stageId].isStageDateSelected = !newStages[stageId].isStageDateSelected;
      } else {
        newStages[stageId].isStageDateDefault = !newStages[stageId].isStageDateDefault;
        // If enabling default, ensure it's selected
        if(newStages[stageId].isStageDateDefault) {
            newStages[stageId].isStageDateSelected = true;
        }
      }

      // Cleanup
      if (!newStages[stageId].isStageDateSelected && Object.keys(newStages[stageId].documents).length === 0) {
        delete newStages[stageId];
      }
      return { ...prev, stages: newStages };
    });
  };

  const toggleDocument = (stageId: string, kycId: string) => {
    setReportConfig(prev => {
      const newStages = JSON.parse(JSON.stringify(prev.stages));
      if (!newStages[stageId]) newStages[stageId] = { isStageDateSelected: false, isStageDateDefault: false, documents: {} };
      
      if (newStages[stageId].documents[kycId]) {
        delete newStages[stageId].documents[kycId];
      } else {
        newStages[stageId].documents[kycId] = { fields: [] };
      }
      
      if (!newStages[stageId].isStageDateSelected && Object.keys(newStages[stageId].documents).length === 0) {
        delete newStages[stageId];
      }
      return { ...prev, stages: newStages };
    });
  };

  const toggleDocField = (stageId: string, kycId: string, fieldId: string, type: 'include' | 'default') => {
    setReportConfig(prev => {
      const newStages = JSON.parse(JSON.stringify(prev.stages));
      if (!newStages[stageId]?.documents[kycId]) return prev;

      const currentFields = newStages[stageId].documents[kycId].fields;
      const exists = currentFields.find((f: any) => f.id === fieldId);
      let newFields = [...currentFields];

      if (type === 'include') {
        if (exists) newFields = newFields.filter((f: any) => f.id !== fieldId);
        else newFields.push({ id: fieldId, isDefault: false });
      } else if (type === 'default') {
        if (exists) {
            newFields = newFields.map((f: any) => f.id === fieldId ? { ...f, isDefault: !f.isDefault } : f);
        } else {
            newFields.push({ id: fieldId, isDefault: true });
        }
      }
      
      newStages[stageId].documents[kycId].fields = newFields;
      return { ...prev, stages: newStages };
    });
  };

  // --- Rendering ---

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      if (a.is_favorite && !b.is_favorite) return -1;
      if (!a.is_favorite && b.is_favorite) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [reports]);

  const sortedStages = useMemo(() => [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0)), [stages]);

  const renderReportList = () => (
    <div className="flex flex-col gap-2 h-full">
      <Button onClick={handleCreateNew} className="w-full mb-2"><Plus className="mr-2 h-4 w-4" /> Create New Report</Button>
      <ScrollArea className="flex-1 pr-4 -mr-4">
        <div className="space-y-1">
          {sortedReports.map(report => (
            <div 
              key={report.id} 
              className={`group flex items-center justify-between p-2 rounded-md cursor-pointer border border-transparent transition-all
                ${selectedReport?.id === report.id ? 'bg-blue-50 border-blue-200 shadow-sm' : 'hover:bg-slate-50 hover:border-slate-200'}`} 
              onClick={() => handleSelectReport(report)}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`h-6 w-6 shrink-0 ${report.is_favorite ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                  onClick={(e) => handleToggleFavorite(e, report)}
                >
                  <Star className="h-4 w-4 fill-current" />
                </Button>
                <span className={`font-medium text-sm truncate ${selectedReport?.id === report.id ? 'text-blue-700' : 'text-slate-700'}`}>
                  {report.name}
                </span>
              </div>
              
              {selectedReport?.id === report.id && (
                <div className="flex items-center gap-1 opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-blue-600" onClick={(e) => { e.stopPropagation(); handleEditReport(); }}>
                    <Pencil className="h-3.5 w-3.5"/>
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-red-600" onClick={(e) => { e.stopPropagation(); handleDeleteReport(report.id); }}>
                    <Trash2 className="h-3.5 w-3.5"/>
                  </Button>
                </div>
              )}
            </div>
          ))}
          {reports.length === 0 && <div className="text-center text-slate-400 py-8 text-sm">No reports found.</div>}
        </div>
      </ScrollArea>
    </div>
  );

  const handleEditReport = () => setIsEditing(true);

  // UPDATED: Grid Header with Default First
  const GridHeader = () => (
    <div className="grid grid-cols-12 gap-2 px-2 py-1 bg-slate-100 text-xs font-semibold text-slate-600 rounded mb-2 sticky top-0 z-10">
      <div className="col-span-8">Column Name</div>
      <div className="col-span-2 text-center">Default</div>
      <div className="col-span-2 text-center">Report Table</div>
    </div>
  );

  // UPDATED: Grid Row with Default First and Independent Checkboxes
  const GridRow = ({ label, isIncluded, isDefault, onToggleInclude, onToggleDefault, depth = 0 }: any) => (
    <div className="grid grid-cols-12 gap-2 py-1.5 items-center hover:bg-slate-50 rounded px-2 transition-colors">
      <div className="col-span-8 flex items-center gap-2">
        <span style={{ marginLeft: `${depth * 12}px` }} className="text-sm truncate" title={label}>{label}</span>
      </div>
      {/* Default Column First */}
      <div className="col-span-2 flex justify-center">
        <Checkbox 
          checked={isDefault} 
          onCheckedChange={onToggleDefault}
          // Disabled prop removed
        />
      </div>
      {/* Report Table Column Second */}
      <div className="col-span-2 flex justify-center">
        <Checkbox 
            checked={isIncluded} 
            onCheckedChange={onToggleInclude} 
        />
      </div>
    </div>
  );

  const renderReportEditor = () => {
    // Filter Logic
    const filteredTaskFields = tableHeaders.filter(field => {
        if(!showSelectedOnly) return true;
        return reportConfig.taskFields?.some(f => f.id === field.id);
    });

    const filteredStages = sortedStages.filter(stage => {
        if(!showSelectedOnly) return true;
        const stageConfig = reportConfig.stages?.[stage.id];
        if(!stageConfig) return false;
        if(stageConfig.isStageDateSelected) return true;
        if(Object.keys(stageConfig.documents).length > 0) return true;
        return false;
    });

    return (
      <div className="flex flex-col h-full">
        <div className="flex justify-between items-center mb-4 pb-4 border-b">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">{selectedReport ? "Edit Report" : "New Report"}</h3>
            <p className="text-xs text-slate-500">Configure columns and their default visibility.</p>
          </div>
          <div className="flex items-center gap-2">
             <div className="flex items-center space-x-2 bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">
                <Checkbox 
                    id="showSelectedOnly" 
                    checked={showSelectedOnly} 
                    onCheckedChange={(c) => setShowSelectedOnly(!!c)} 
                />
                <Label htmlFor="showSelectedOnly" className="text-xs cursor-pointer font-medium text-slate-700 flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    Show Selected Only
                </Label>
             </div>
             <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}><X className="mr-2 h-4 w-4"/> Cancel</Button>
          </div>
        </div>
        
        <div className="space-y-4 flex-1 flex flex-col min-h-0">
          <div className="space-y-1">
            <Label htmlFor="reportName">Report Name</Label>
            <Input id="reportName" value={reportName} onChange={(e) => setReportName(e.target.value)} placeholder="e.g., Management Overview" />
          </div>

          <div className="flex-1 flex flex-col min-h-0 border rounded-md">
            <div className="p-3 bg-slate-50 border-b">
              <h4 className="font-medium text-sm text-slate-700">Column Configuration</h4>
            </div>
            <div className="p-2 border-b"><GridHeader /></div>
            
            <ScrollArea className="flex-1 p-2">
              <Accordion type="multiple" className="w-full" defaultValue={['task-fields']}>
                
                {filteredTaskFields.length > 0 && (
                  <AccordionItem value="task-fields" className="border-b-0">
                    <AccordionTrigger className="py-2 hover:no-underline hover:bg-slate-50 px-2 rounded">
                      <span className="font-semibold text-sm">Task Details</span>
                    </AccordionTrigger>
                    <AccordionContent className="pt-1 pb-4">
                      {filteredTaskFields.map(field => {
                        const config = reportConfig.taskFields?.find(f => f.id === field.id);
                        return (
                          <GridRow 
                            key={field.id}
                            label={field.label}
                            isIncluded={!!config}
                            isDefault={!!config?.isDefault}
                            onToggleInclude={() => toggleTaskField(field.id, 'include')}
                            onToggleDefault={() => toggleTaskField(field.id, 'default')}
                            depth={1}
                          />
                        );
                      })}
                    </AccordionContent>
                  </AccordionItem>
                )}

                {filteredStages.map(stage => {
                    const stageConfig = reportConfig.stages?.[stage.id];
                    const filteredDocs = (stage.documents || []).filter((doc: any) => {
                         if(!showSelectedOnly) return true;
                         return !!stageConfig?.documents?.[doc.kycId];
                    });

                    if(showSelectedOnly && !stageConfig?.isStageDateSelected && filteredDocs.length === 0) return null;

                    return (
                        <AccordionItem key={stage.id} value={`stage-${stage.id}`} className="border-b-0">
                        <AccordionTrigger className="py-2 hover:no-underline hover:bg-slate-50 px-2 rounded">
                            <span className="font-semibold text-sm">{stage.name}</span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-1 pb-4 space-y-2">
                            {(!showSelectedOnly || stageConfig?.isStageDateSelected) && (
                                <GridRow 
                                label={`${stage.name} - Completion Date`}
                                isIncluded={!!stageConfig?.isStageDateSelected}
                                isDefault={!!stageConfig?.isStageDateDefault}
                                onToggleInclude={() => toggleStageDate(stage.id, 'include')}
                                onToggleDefault={() => toggleStageDate(stage.id, 'default')}
                                depth={1}
                                />
                            )}

                            {filteredDocs.map((doc: any) => {
                            const kycDoc = kycDocuments.get(doc.kycId);
                            if (!kycDoc) return null;
                            const isDocActive = !!stageConfig?.documents?.[doc.kycId];
                            
                            return (
                                <div key={`${stage.id}-${doc.kycId}`} className="mt-2">
                                <div className="flex items-center gap-2 py-1 px-2 ml-4 bg-slate-50/50 rounded">
                                    <Checkbox 
                                        id={`doc-${stage.id}-${doc.kycId}`} 
                                        checked={isDocActive} 
                                        onCheckedChange={() => toggleDocument(stage.id, doc.kycId)}
                                    />
                                    <Label htmlFor={`doc-${stage.id}-${doc.kycId}`} className="text-xs font-semibold text-slate-700 cursor-pointer">
                                        {kycDoc.display_name || kycDoc.name}
                                    </Label>
                                </div>

                                {isDocActive && (
                                    <div className="mt-1 ml-2 border-l-2 border-slate-100 pl-2">
                                        {kycDoc.fields?.map((field: any) => {
                                            const docConfig = stageConfig?.documents?.[doc.kycId];
                                            const fieldConfig = docConfig?.fields.find((f: any) => f.id === field.id);
                                            if(showSelectedOnly && !fieldConfig) return null;

                                            return (
                                            <GridRow
                                                key={`${stage.id}-${doc.kycId}-${field.id}`}
                                                label={field.fieldName}
                                                isIncluded={!!fieldConfig}
                                                isDefault={!!fieldConfig?.isDefault}
                                                onToggleInclude={() => toggleDocField(stage.id, doc.kycId, field.id, 'include')}
                                                onToggleDefault={() => toggleDocField(stage.id, doc.kycId, field.id, 'default')}
                                                depth={2}
                                            />
                                            );
                                        })}
                                    </div>
                                )}
                                </div>
                            );
                            })}
                        </AccordionContent>
                        </AccordionItem>
                    );
                })}
              </Accordion>
            </ScrollArea>
          </div>
        </div>
      </div>
    );
  };

  const renderReportViewer = () => (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-800">{selectedReport?.name}</h3>
        <p className="text-sm text-slate-500">Read-only preview of columns.</p>
      </div>

      <div className="border rounded-md flex-1 flex flex-col min-h-0">
        <div className="p-2 border-b bg-slate-50"><GridHeader /></div>
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-sm mb-2 text-blue-700">Task Fields</h4>
              {reportConfig.taskFields?.map(f => {
                const header = tableHeaders.find(h => h.id === f.id);
                return (
                  <div key={f.id} className="grid grid-cols-12 text-sm py-1 border-b border-dashed border-slate-100 last:border-0">
                    <div className="col-span-8 text-slate-700">{header?.label || f.id}</div>
                    <div className="col-span-2 text-center text-green-600">{f.isDefault ? "Yes" : "-"}</div>
                    <div className="col-span-2 text-center font-bold text-blue-600">Yes</div>
                  </div>
                )
              })}
            </div>

            {Object.entries(reportConfig.stages).map(([stageId, stageConfig]) => {
              const stage = stages.find(s => s.id === stageId);
              if (!stage) return null;
              return (
                <div key={stageId} className="pt-2">
                   <h4 className="font-semibold text-sm mb-2 text-blue-700">{stage.name}</h4>
                   {stageConfig.isStageDateSelected && (
                     <div className="grid grid-cols-12 text-sm py-1 border-b border-dashed border-slate-100">
                        <div className="col-span-8 text-slate-700 pl-2">Completion Date</div>
                        <div className="col-span-2 text-center text-green-600">{stageConfig.isStageDateDefault ? "Yes" : "-"}</div>
                        <div className="col-span-2 text-center font-bold text-blue-600">Yes</div>
                     </div>
                   )}
                   {Object.entries(stageConfig.documents).map(([kycId, docConfig]) => {
                      const kycDoc = kycDocuments.get(kycId);
                      if (!kycDoc) return null;
                      return (
                        <div key={kycId} className="mt-2 pl-4 border-l-2 border-slate-100 ml-1">
                          <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{kycDoc.display_name || kycDoc.name}</h5>
                          {docConfig.fields.map(f => (
                             <div key={f.id} className="grid grid-cols-12 text-sm py-1">
                                <div className="col-span-8 text-slate-700">{kycDoc.fields?.find((field: any) => field.id === f.id)?.fieldName || f.id}</div>
                                <div className="col-span-2 text-center text-green-600">{f.isDefault ? "Yes" : "-"}</div>
                                <div className="col-span-2 text-center font-bold text-blue-600">Yes</div>
                             </div>
                          ))}
                        </div>
                      )
                   })}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[80vh] grid grid-cols-3 gap-0 p-0 overflow-hidden">
        <div className="col-span-1 border-r bg-slate-50/50 p-4 flex flex-col h-full overflow-hidden">
          <DialogHeader className="mb-4">
            <DialogTitle>Saved Reports</DialogTitle>
            <DialogDescription>Manage your customized report views.</DialogDescription>
          </DialogHeader>
          {isLoading && !isEditing ? <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500"/></div> : renderReportList()}
        </div>

        <div className="col-span-2 p-6 flex flex-col h-full bg-white overflow-hidden">
          <div className="flex-1 min-h-0 mb-4 overflow-hidden flex flex-col">
            {isEditing ? renderReportEditor() : selectedReport ? renderReportViewer() : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <div className="p-4 bg-slate-50 rounded-full mb-4"><Star className="h-8 w-8 text-slate-300"/></div>
                <p className="font-medium">Select a report to view details</p>
                <p className="text-sm">Or create a new one to get started.</p>
              </div>
            )}
          </div>
          
          <DialogFooter className="mt-auto pt-4 border-t">
            {isEditing ? (
              <Button onClick={handleSaveReport} disabled={isLoading || !reportName.trim()} className="w-full sm:w-auto">
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>} 
                Save Report Configuration
              </Button>
            ) : selectedReport ? (
              <Button onClick={handleApply} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
                Apply This Report
              </Button>
            ) : null}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}