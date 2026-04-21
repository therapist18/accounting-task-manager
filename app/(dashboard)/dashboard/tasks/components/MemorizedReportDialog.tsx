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
import { toast } from "@/lib/hooks/use-toast"
import { Loader2, Plus, Edit, Trash2, X, Save } from "lucide-react"
import type { Department, KycDocument } from "../utils/taskManagerData"
import { ENHANCED_TABLE_HEADERS_IMMIGRATION } from "../overall-view/tableUtils"

// Type definitions for reports
type ReportConfiguration = {
  taskFields: string[];
  stages: {
    [stageId: string]: {
      isStageDateSelected: boolean; // NEW: To track if just the stage date is needed
      documents: {
        [kycId: string]: {
          fields: string[];
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
};

// Props for the dialog component
interface MemorizedReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: Department | null;
  stages: any[];
  kycDocuments: Map<string, KycDocument>;
  onApplyReport: (report: MemorizedReport) => void;
  tableHeaders: typeof ENHANCED_TABLE_HEADERS_IMMIGRATION; // Pass headers as a prop
}

const INITIAL_REPORT_CONFIG: ReportConfiguration = {
  taskFields: ['applicant_name'], // Default to at least one field
  stages: {}
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

  // ... (fetchReports, useEffect for fetch remain the same) ...
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
    }
  }, [open, fetchReports, department]);


  const handleCreateNew = () => {
    setSelectedReport(null);
    setReportName("");
    setReportConfig(INITIAL_REPORT_CONFIG);
    setIsEditing(true);
  };

  const handleSelectReport = (report: MemorizedReport) => {
    setSelectedReport(report);
    setReportName(report.name);
    // Ensure backward compatibility for old reports without isStageDateSelected
    const compatibleConfig = {
      ...report.configuration,
      stages: Object.entries(report.configuration.stages).reduce((acc, [stageId, stageConfig]) => {
        acc[stageId] = { isStageDateSelected: stageConfig.isStageDateSelected ?? true, ...stageConfig };
        return acc;
      }, {})
    };
    setReportConfig(compatibleConfig);
    setIsEditing(false);
  };

  const handleEditReport = () => {
    if (selectedReport) {
      setIsEditing(true);
    }
  }

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
        const { data, error } = await supabase
          .from('tm_memorized_reports')
          .update(reportData)
          .eq('id', selectedReport.id)
          .select().single();
        if (error) throw error;
        handleSelectReport(data); // Reselect the updated report
        toast({ title: "Success", description: "Report updated." });
      } else {
        const { data, error } = await supabase
          .from('tm_memorized_reports')
          .insert(reportData)
          .select()
          .single();
        if (error) throw error;
        setSelectedReport(data);
        toast({ title: "Success", description: "Report created." });
      }
      setIsEditing(false);
      await fetchReports();
    } catch (error) {
      console.error("Error saving report:", error);
      toast({ title: "Error", description: "Failed to save report.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // ... (handleDeleteReport, handleApply remain the same) ...
  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm("Are you sure you want to delete this report?")) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.from('tm_memorized_reports').delete().eq('id', reportId);
      if (error) throw error;
      toast({ title: "Success", description: "Report deleted." });
      setSelectedReport(null);
      setIsEditing(false);
      await fetchReports();
    } catch (error) {
      console.error("Error deleting report:", error);
      toast({ title: "Error", description: "Failed to delete report.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  const handleApply = () => {
    if (selectedReport) {
      onApplyReport(selectedReport);
      onOpenChange(false);
    }
  };


  const toggleTaskField = (fieldId: string) => {
    setReportConfig(prev => {
      const newFields = new Set(prev.taskFields);
      if (newFields.has(fieldId)) newFields.delete(fieldId);
      else newFields.add(fieldId);
      return { ...prev, taskFields: Array.from(newFields) };
    });
  }

  // UPDATED: Now toggles just the stage date visibility
  const toggleStageDate = (stageId: string) => {
    setReportConfig(prev => {
      const newStages = { ...prev.stages };
      if (!newStages[stageId]) {
        // If stage doesn't exist, add it with date selected
        newStages[stageId] = { isStageDateSelected: true, documents: {} };
      } else {
        // If it exists, toggle the date selection
        newStages[stageId].isStageDateSelected = !newStages[stageId].isStageDateSelected;
        // If nothing is selected for this stage anymore, remove it
        if (!newStages[stageId].isStageDateSelected && Object.keys(newStages[stageId].documents).length === 0) {
          delete newStages[stageId];
        }
      }
      return { ...prev, stages: newStages };
    });
  };

  const toggleDocument = (stageId: string, kycId: string) => {
    setReportConfig(prev => {
      const newStages = JSON.parse(JSON.stringify(prev.stages)); // Deep copy
      if (!newStages[stageId]) {
        newStages[stageId] = { isStageDateSelected: false, documents: {} };
      }
      if (newStages[stageId].documents[kycId]) {
        delete newStages[stageId].documents[kycId];
        // If no documents left and date not selected, remove stage
        if (Object.keys(newStages[stageId].documents).length === 0 && !newStages[stageId].isStageDateSelected) {
          delete newStages[stageId];
        }
      } else {
        newStages[stageId].documents[kycId] = { fields: [] };
      }
      return { ...prev, stages: newStages };
    });
  };

  const toggleField = (stageId: string, kycId: string, fieldId: string) => {
    setReportConfig(prev => {
      const newStages = JSON.parse(JSON.stringify(prev.stages)); // Deep copy
      if (!newStages[stageId] || !newStages[stageId].documents[kycId]) return prev;

      const newFields = new Set(newStages[stageId].documents[kycId].fields);
      if (newFields.has(fieldId)) {
        newFields.delete(fieldId);
      } else {
        newFields.add(fieldId);
      }
      newStages[stageId].documents[kycId].fields = Array.from(newFields);
      return { ...prev, stages: newStages };
    });
  };

  const sortedStages = useMemo(() => [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0)), [stages]);

  // ... (renderReportList remains the same) ...
  const renderReportList = () => (
    <div className="flex flex-col gap-2">
      <Button onClick={handleCreateNew}><Plus className="mr-2 h-4 w-4" /> Create New Report</Button>
      <ScrollArea className="h-96 pr-4">
        <div className="space-y-1">
          {reports.map(report => (
            <div key={report.id} className={`flex items-center justify-between p-2 rounded-md cursor-pointer ${selectedReport?.id === report.id ? 'bg-blue-100' : 'hover:bg-slate-50'}`} onClick={() => handleSelectReport(report)}>
              <span className="font-medium text-sm">{report.name}</span>
              {selectedReport?.id === report.id && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleEditReport(); }}><Edit className="h-4 w-4 text-blue-600" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleDeleteReport(report.id); }}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );


  // UPDATED: renderReportEditor to include all table headers
  const renderReportEditor = () => (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">{selectedReport ? "Editing Report" : "Creating New Report"}</h3>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}><X className="mr-2 h-4 w-4" /> Cancel</Button>
      </div>
      <div className="space-y-4">
        <div><Label htmlFor="reportName">Report Name</Label><Input id="reportName" value={reportName} onChange={(e) => setReportName(e.target.value)} /></div>
        <h4 className="font-medium text-md pt-2 border-t">Select Columns</h4>
        <ScrollArea className="h-[400px] border rounded-md p-2">
          <Accordion type="multiple" className="w-full">
            <AccordionItem value="task-fields"><AccordionTrigger>Task Details</AccordionTrigger>
              <AccordionContent className="pl-4"><div className="grid grid-cols-2 gap-2">
                {tableHeaders.map(field => (
                  <div key={field.id} className="flex items-center space-x-2">
                    <Checkbox id={`taskfield-${field.id}`} checked={reportConfig.taskFields?.includes(field.id)} onCheckedChange={() => toggleTaskField(field.id)} />
                    <Label htmlFor={`taskfield-${field.id}`} className="font-normal text-sm cursor-pointer">{field.label}</Label>
                  </div>
                ))}</div></AccordionContent>
            </AccordionItem>
            {sortedStages.map(stage => (
              <AccordionItem key={stage.id} value={`stage-${stage.id}`}>
                <AccordionTrigger>{stage.name}</AccordionTrigger>
                <AccordionContent className="pl-6 space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox id={`stage-date-${stage.id}`} checked={!!reportConfig.stages?.[stage.id]?.isStageDateSelected} onCheckedChange={() => toggleStageDate(stage.id)} />
                    <Label htmlFor={`stage-date-${stage.id}`} className="font-semibold text-sm cursor-pointer">{stage.name} - Completion Date</Label>
                  </div>
                  {stage.documents?.map(doc => {
                    const kycDoc = kycDocuments.get(doc.kycId);
                    if (!kycDoc) return null;
                    return (
                      <Accordion key={doc.kycId} type="single" collapsible className="w-full pl-4 border-l ml-2">
                        <AccordionItem value={`doc-${doc.kycId}`}>
                          <AccordionTrigger>
                            <div className="flex items-center space-x-2">
                              <Checkbox id={`doc-${stage.id}-${doc.kycId}`} checked={!!reportConfig.stages?.[stage.id]?.documents?.[doc.kycId]} onCheckedChange={() => toggleDocument(stage.id, doc.kycId)} onClick={(e) => e.stopPropagation()} />
                              <Label htmlFor={`doc-${stage.id}-${doc.kycId}`} className="cursor-pointer">{kycDoc.display_name || kycDoc.name}</Label>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pl-6 pt-2">
                            <div className="grid grid-cols-2 gap-2">{kycDoc.fields?.map(field => (
                              <div key={field.id} className="flex items-center space-x-2">
                                <Checkbox id={`field-${stage.id}-${doc.kycId}-${field.id}`} disabled={!reportConfig.stages?.[stage.id]?.documents?.[doc.kycId]} checked={reportConfig.stages?.[stage.id]?.documents?.[doc.kycId]?.fields.includes(field.id)} onCheckedChange={() => toggleField(stage.id, doc.kycId, field.id)} />
                                <Label htmlFor={`field-${stage.id}-${doc.kycId}-${field.id}`} className="font-normal text-sm cursor-pointer">{field.fieldName}</Label>
                              </div>))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )
                  })}
                </AccordionContent>
              </AccordionItem>))}
          </Accordion>
        </ScrollArea>
      </div>
    </div>
  );

  // ... (renderReportViewer remains the same) ...
  const renderReportViewer = () => (
    <div>
      <h3 className="text-lg font-semibold mb-2">{selectedReport?.name}</h3>
      <p className="text-sm text-muted-foreground mb-4">Preview of the selected columns for this report.</p>
      <ScrollArea className="h-[450px] border rounded-md p-4"><div className="space-y-3">
        <div><h4 className="font-semibold text-md">Task Fields</h4><ul className="list-disc list-inside text-sm text-slate-700">{ENHANCED_TABLE_HEADERS_IMMIGRATION.filter(f => selectedReport?.configuration.taskFields?.includes(f.id)).map(f => <li key={f.id}>{f.label}</li>)}</ul></div>
        {Object.keys(selectedReport?.configuration.stages || {}).map(stageId => {
          const stage = stages.find(s => s.id === stageId);
          if (!stage) return null;
          return (<div key={stageId} className="pt-2 border-t"><h4 className="font-semibold text-md">{stage.name}</h4><div className="pl-4 space-y-1">
            {Object.keys(selectedReport?.configuration.stages[stageId].documents || {}).map(kycId => {
              const kycDoc = kycDocuments.get(kycId);
              if (!kycDoc) return null;
              const fields = selectedReport?.configuration.stages[stageId].documents[kycId].fields;
              return (<div key={kycId}><h5 className="font-medium text-sm">{kycDoc.display_name || kycDoc.name}</h5><ul className="list-disc list-inside text-sm text-slate-700 pl-4">{kycDoc.fields?.filter(f => fields.includes(f.id)).map(f => <li key={f.id}>{f.fieldName}</li>)}</ul></div>)
            })}
          </div></div>)
        })}
      </div></ScrollArea>
    </div>
  )


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[700px] grid grid-cols-3 gap-6">
        <div className="col-span-1 border-r pr-6"><DialogHeader><DialogTitle>Memorized Reports</DialogTitle><DialogDescription>Select, create, or manage custom reports.</DialogDescription></DialogHeader>{isLoading ? <Loader2 className="animate-spin mx-auto mt-8" /> : renderReportList()}</div>
        <div className="col-span-2">{isEditing ? renderReportEditor() : selectedReport ? renderReportViewer() : <div className="flex items-center justify-center h-full text-slate-500"><p>Select a report to view or create a new one.</p></div>}</div>
        <DialogFooter className="col-span-3">{isEditing ? <Button onClick={handleSaveReport} disabled={isLoading || !reportName.trim()}>{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Report</Button> : selectedReport ? <Button onClick={handleApply}>Apply Report</Button> : null}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}