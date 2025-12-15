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
import { 
  Loader2, Plus, Minus, Pencil, Trash2, X, Save, Star, Filter, 
  Table as TableIcon, ChevronsUpDown, ChevronUp 
} from "lucide-react"
import type { Department, KycDocument } from "../utils/taskManagerData"
import { ENHANCED_TABLE_HEADERS_IMMIGRATION } from "../tasks/overall-view/tableUtils"
import { cn } from "@/lib/utils"

type FieldConfig = {
  id: string;
  isDefault: boolean;
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
  sessionIncludedFields?: string[];
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
  
  // State to track which fields are included in the report
  const [includedFields, setIncludedFields] = useState<Set<string>>(new Set());
  
  const [showSelectedOnly, setShowSelectedOnly] = useState(true);

  // State for Expand/Collapse All
  const [expandedSections, setExpandedSections] = useState<string[]>(['task-details']);
  const [allExpanded, setAllExpanded] = useState(false);
  
  // Generate a unique ID for each section
  const getSectionId = useCallback((title: string) => {
    return title.toLowerCase().replace(/\s+/g, '-');
  }, []);
  
  // Get all section IDs
  const getAllSectionIds = useCallback(() => {
    return [
      'task-details',
      ...stages.map(stage => getSectionId(stage.name))
    ];
  }, [stages, getSectionId]);
  
  // Toggle all sections expanded/collapsed
  const toggleAllSections = useCallback(() => {
    if (allExpanded) {
      setExpandedSections([]);
    } else {
      setExpandedSections(getAllSectionIds());
    }
    setAllExpanded(!allExpanded);
  }, [allExpanded, getAllSectionIds]);
  
  // Toggle a single section
  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const newState = prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId];
      // Update allExpanded state based on whether all sections are expanded
      const allSectionIds = getAllSectionIds();
      setAllExpanded(newState.length === allSectionIds.length);
      return newState;
    });
  }, [getAllSectionIds]);
  
  // Collapse all sections
  const handleCollapseAll = useCallback(() => {
    toggleAllSections(false);
  }, [toggleAllSections]);

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
    }
  }, [open, fetchReports, department]);
  
  useEffect(() => {
    setSelectedReport(null);
    setReportName("");
    setReportConfig(INITIAL_REPORT_CONFIG);
    setIncludedFields(new Set(['applicant_name']));
    setIsEditing(false);
    setShowSelectedOnly(true);
  }, [department?.id]);

  useEffect(() => {
    setExpandedSections(['task-details']);
  }, []);

  const handleCreateNew = () => {
    setSelectedReport(null);
    setReportName("");
    setReportConfig(INITIAL_REPORT_CONFIG);
    setIncludedFields(new Set(['applicant_name'])); 
    setIsEditing(true);
    setShowSelectedOnly(true);
    setExpandedSections(['task-details']);
  };

  const handleSelectReport = (report: MemorizedReport) => {
    const config = normalizeConfiguration(report.configuration);
    setSelectedReport(report);
    setReportName(report.name);
    setReportConfig(config);
    const included = new Set(config.taskFields.map(f => f.id));
    setIncludedFields(included);
    setIsEditing(false);
    setShowSelectedOnly(true);
    setExpandedSections(['task-details']);
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
      const finalConfig = getFinalConfiguration(reportConfig);
      const reportData = {
        name: reportName,
        configuration: finalConfig,
        department_id: department.id,
      };

      let savedReportData;

      if (selectedReport && selectedReport.id) {
        const { data, error } = await supabase.from('tm_memorized_reports').update(reportData).eq('id', selectedReport.id).select().single();
        if (error) throw error;
        savedReportData = data;
        toast({ title: "Success", description: "Report updated." });
      } else {
        const { data, error } = await supabase.from('tm_memorized_reports').insert(reportData).select().single();
        if (error) throw error;
        savedReportData = data;
        toast({ title: "Success", description: "Report created." });
      }

      const normalizedSavedConfig = normalizeConfiguration(savedReportData.configuration);
      setSelectedReport(savedReportData);
      setReportName(savedReportData.name);
      setReportConfig(normalizedSavedConfig); 
      setIsEditing(false);
      await fetchReports();
      
    } catch (error) {
      console.error(error);
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
      const finalConfig = getFinalConfiguration(reportConfig);
      onApplyReport({
        ...selectedReport,
        configuration: finalConfig,
        sessionIncludedFields: Array.from(includedFields) 
      });
      onOpenChange(false);
    }
  };

  const isTaskFieldIncluded = useCallback((fieldId: string) => {
    return includedFields.has(fieldId);
  }, [includedFields]);

  const toggleTaskFieldInclude = useCallback((fieldId: string) => {
    setIncludedFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldId)) {
        newSet.delete(fieldId);
      } else {
        newSet.add(fieldId);
      }
      return newSet;
    });
  }, [includedFields]);

  const getFinalConfiguration = (config: ReportConfiguration): ReportConfiguration => {
    const fieldsToSave = config.taskFields.filter(f => f.isDefault === true);
    return {
      ...config,
      taskFields: fieldsToSave
    };
  };

  const toggleTaskFieldDefault = useCallback((fieldId: string) => {
    setReportConfig(prev => {
      const current = prev.taskFields || [];
      const exists = current.find(f => f.id === fieldId);
      let newFields = [...current];

      if (exists) {
        newFields = newFields.map(f => 
          f.id === fieldId ? { ...f, isDefault: !f.isDefault } : f
        );
      } else {
        newFields.push({ id: fieldId, isDefault: true });
      }
      return { ...prev, taskFields: newFields };
    });

    setIncludedFields(prev => {
      if (!prev.has(fieldId)) {
        const newSet = new Set(prev);
        newSet.add(fieldId);
        return newSet;
      }
      return prev;
    });
  }, []);

  const toggleStageDateInclude = (stageId: string) => {
    setReportConfig(prev => {
      const newStages = { ...prev.stages };
      if (!newStages[stageId]) {
        newStages[stageId] = { isStageDateSelected: true, isStageDateDefault: false, documents: {} };
      } else {
        newStages[stageId].isStageDateSelected = !newStages[stageId].isStageDateSelected;
      }
      if (!newStages[stageId].isStageDateSelected && Object.keys(newStages[stageId].documents).length === 0) {
        delete newStages[stageId];
      }
      return { ...prev, stages: newStages };
    });
  };

  const toggleStageDateDefault = (stageId: string) => {
    setReportConfig(prev => {
      const newStages = { ...prev.stages };
      if (!newStages[stageId]) {
        newStages[stageId] = { isStageDateSelected: true, isStageDateDefault: true, documents: {} };
      } else {
        newStages[stageId].isStageDateDefault = !newStages[stageId].isStageDateDefault;
        if (newStages[stageId].isStageDateDefault) {
          newStages[stageId].isStageDateSelected = true;
        }
      }
      return { ...prev, stages: newStages };
    });
  };

  const toggleDocument = (stageId: string, kycId: string) => {
    setReportConfig(prev => {
      const newStages = JSON.parse(JSON.stringify(prev.stages));
      if (!newStages[stageId]) {
        newStages[stageId] = { isStageDateSelected: false, isStageDateDefault: false, documents: {} };
      }
      
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

  const toggleDocFieldInclude = (stageId: string, kycId: string, fieldId: string) => {
    setReportConfig(prev => {
      const newStages = JSON.parse(JSON.stringify(prev.stages));
      if (!newStages[stageId]?.documents[kycId]) return prev;

      const currentFields = newStages[stageId].documents[kycId].fields;
      const exists = currentFields.find((f: any) => f.id === fieldId);

      if (exists) {
        newStages[stageId].documents[kycId].fields = currentFields.filter((f: any) => f.id !== fieldId);
      } else {
        newStages[stageId].documents[kycId].fields.push({ id: fieldId, isDefault: false });
      }
      return { ...prev, stages: newStages };
    });
  };

  const toggleDocFieldDefault = (stageId: string, kycId: string, fieldId: string) => {
    setReportConfig(prev => {
      const newStages = JSON.parse(JSON.stringify(prev.stages));
      if (!newStages[stageId]?.documents[kycId]) return prev;

      const currentFields = newStages[stageId].documents[kycId].fields;
      const exists = currentFields.find((f: any) => f.id === fieldId);

      if (exists) {
        newStages[stageId].documents[kycId].fields = currentFields.map((f: any) => 
          f.id === fieldId ? { ...f, isDefault: !f.isDefault } : f
        );
      } else {
        newStages[stageId].documents[kycId].fields.push({ id: fieldId, isDefault: true });
      }
      return { ...prev, stages: newStages };
    });
  };

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
      <Button onClick={handleCreateNew} className="w-full mb-2 bg-slate-800 hover:bg-slate-700"><Plus className="mr-2 h-4 w-4" /> Create New Report</Button>
      <ScrollArea className="flex-1 pr-4 -mr-4">
        <div className="space-y-1">
          {sortedReports.map(report => (
            <div 
              key={report.id} 
              className={`group flex items-center justify-between p-2 rounded-md cursor-pointer border transition-all
                ${selectedReport?.id === report.id 
                  ? 'bg-blue-50 border-blue-200 shadow-sm' 
                  : 'border-transparent hover:bg-slate-50 hover:border-slate-200'}`} 
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

  // --- UI COMPONENTS ---

  const TableHeader = () => (
    <div className="grid grid-cols-12 gap-0 border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700 sticky top-0 z-20 shadow-sm">
      <div className="col-span-8 px-4 py-3 border-r border-slate-200">Field / Category</div>
      <div className="col-span-2 px-2 py-3 border-r border-slate-200 text-center bg-green-50/50 text-green-700">Default</div>
      <div className="col-span-2 px-2 py-3 text-center bg-blue-50/50 text-blue-700">Reports Table</div>
    </div>
  );

  const TableRow = ({ 
    label, 
    isIncluded, 
    isDefault, 
    onToggleInclude, 
    onToggleDefault, 
    depth = 0, 
    isSessionOnly = false,
    className = "",
    icon = null,
    readOnly = false
  }: {
    label: React.ReactNode;
    isIncluded?: boolean;
    isDefault?: boolean;
    onToggleInclude?: () => void;
    onToggleDefault?: () => void;
    depth?: number;
    isSessionOnly?: boolean;
    hasChildren?: boolean;
    className?: string;
    icon?: React.ReactNode;
    readOnly?: boolean;
  }) => (
    <div className={cn(
      "grid grid-cols-12 gap-0 border-b border-slate-100 items-stretch text-sm transition-colors bg-white hover:bg-slate-50", 
      className
    )}>
      {/* Label Column */}
      <div className="col-span-8 flex items-center border-r border-slate-100 py-2">
        <div style={{ width: `${depth * 24}px` }} className="shrink-0 h-full border-r border-dashed border-slate-100 mr-2 opacity-50" />
        <div className="flex items-center gap-2 px-2 min-w-0">
          {icon}
          <span className={cn("truncate font-medium", isSessionOnly ? "text-blue-600" : "text-slate-700")}>
            {label}
            {isSessionOnly && <span className="text-xs text-blue-500 font-normal ml-1">(Session Only)</span>}
          </span>
        </div>
      </div>
      
      {/* Default Checkbox Column */}
      <div className="col-span-2 flex items-center justify-center border-r border-slate-100 bg-slate-50/30 py-2">
        {(onToggleDefault || readOnly) && (
          <Checkbox 
            checked={isDefault} 
            onCheckedChange={onToggleDefault}
            disabled={readOnly || isSessionOnly}
            className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 disabled:opacity-50"
          />
        )}
      </div>

      {/* Reports Table Checkbox Column */}
      <div className="col-span-2 flex items-center justify-center bg-slate-50/30 py-2">
        {(onToggleInclude || readOnly) && (
          <Checkbox 
            checked={isIncluded} 
            onCheckedChange={onToggleInclude}
            disabled={readOnly}
            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 disabled:opacity-50"
          />
        )}
      </div>
    </div>
  );

  const ExpandableRow = React.memo(({ title, children }: { title: string, children: React.ReactNode }) => {
    const sectionId = getSectionId(title);
    
    return (
      <AccordionItem value={sectionId} className="border-b border-slate-200 last:border-0">
        <AccordionTrigger 
          className="w-full py-0 hover:no-underline group bg-slate-50/80 [&>svg]:hidden"
          onClick={() => toggleSection(sectionId)}
        >
          <div className="grid grid-cols-12 w-full gap-0 text-left">
            <div className="col-span-12 px-4 py-2.5 flex justify-between items-center gap-2">
              <span className="font-bold text-slate-800 text-sm">{title}</span>
              <div className="h-5 w-5 rounded border border-slate-300 bg-white flex items-center justify-center text-slate-500 shadow-sm transition-colors group-hover:border-blue-400 group-hover:text-blue-600">
                <Plus className="h-3 w-3 group-data-[state=open]:hidden" />
                <Minus className="h-3 w-3 hidden group-data-[state=open]:block" />
              </div>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-0 animate-in slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top-1">
          {children}
        </AccordionContent>
      </AccordionItem>
    );
  });

  const renderReportEditor = () => {
    const filteredTaskFields = tableHeaders.filter(field => {
        if(!showSelectedOnly) return true;
        return includedFields.has(field.id);
    });

    // Use the component-level functions

    const filteredStages = sortedStages.filter(stage => {
        if(!showSelectedOnly) return true;
        const stageConfig = reportConfig.stages?.[stage.id];
        if(!stageConfig) return false;
        if(stageConfig.isStageDateSelected) return true;
        if(Object.keys(stageConfig.documents).length > 0) return true;
        return false;
    });

    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex justify-between items-center mb-4 pb-4 border-b px-1">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{selectedReport ? "Edit Report" : "New Report"}</h3>
            <p className="text-xs text-slate-500">
              Configure fields. <strong>Default</strong> = Saved to DB. <strong>Reports Table</strong> = Temporary session visibility.
            </p>
          </div>
          <div className="flex items-center gap-2">
             <Button 
                variant="outline" 
                size="sm" 
                className="h-8 px-2 text-xs flex items-center gap-1" 
                onClick={toggleAllSections}
                title={allExpanded ? 'Collapse All' : 'Expand All'}
             >
                {allExpanded ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    <span>Collapse All</span>
                  </>
                ) : (
                  <>
                    <ChevronsUpDown className="h-3 w-3" />
                    <span>Expand All</span>
                  </>
                )}
             </Button>
             
             <div className="flex items-center space-x-2 bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200 ml-2">
                <Checkbox 
                    id="showSelectedOnly" 
                    checked={showSelectedOnly} 
                    onCheckedChange={(c) => setShowSelectedOnly(!!c)} 
                />
                <Label htmlFor="showSelectedOnly" className="text-xs cursor-pointer font-medium text-slate-700 flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    Show Included Only
                </Label>
             </div>
             <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}><X className="mr-2 h-4 w-4"/> Cancel</Button>
          </div>
        </div>
        
        <div className="space-y-4 flex-1 flex flex-col min-h-0">
          <div className="space-y-1">
            <Label htmlFor="reportName">Report Name</Label>
            <Input id="reportName" value={reportName} onChange={(e) => setReportName(e.target.value)} placeholder="e.g., Management Overview" className="max-w-md" />
          </div>

          <div className="flex-1 flex flex-col min-h-0 border rounded-lg shadow-sm overflow-hidden bg-white">
            <TableHeader />
            
            <ScrollArea className="flex-1">
              <Accordion 
                type="multiple" 
                className="w-full divide-y divide-slate-200" 
                value={expandedSections}
                onValueChange={(value) => {
                  setExpandedSections(value);
                }}
              >
                
                {filteredTaskFields.length > 0 && (
                  <ExpandableRow key="task-details-section" title="Task Details">
                      {filteredTaskFields.map(field => {
                        const isIncluded = isTaskFieldIncluded(field.id);
                        const config = reportConfig.taskFields?.find(f => f.id === field.id);
                        const isSessionOnly = isIncluded && !config?.isDefault;
                        
                        return (
                          <TableRow 
                            key={field.id}
                            label={field.label}
                            isIncluded={isIncluded}
                            isDefault={!!config?.isDefault}
                            onToggleInclude={() => toggleTaskFieldInclude(field.id)}
                            onToggleDefault={() => toggleTaskFieldDefault(field.id)}
                            depth={1}
                            isSessionOnly={isSessionOnly}
                          />
                        );
                      })}
                  </ExpandableRow>
                )}

                {filteredStages.map(stage => {
                    const stageConfig = reportConfig.stages?.[stage.id];
                    const filteredDocs = (stage.documents || []).filter((doc: any) => {
                         if(!showSelectedOnly) return true;
                         return !!stageConfig?.documents?.[doc.kycId];
                    });

                    if(showSelectedOnly && !stageConfig?.isStageDateSelected && filteredDocs.length === 0) return null;

                    // Create a unique key using the stage ID and a counter to ensure uniqueness
                    const stageKey = `stage-${stage.id}-${stages.findIndex(s => s.id === stage.id)}`;  

                    return (
                        <ExpandableRow key={stageKey} title={stage.name}>
                            {(!showSelectedOnly || stageConfig?.isStageDateSelected) && (
                                <TableRow 
                                  label="Stage Completion Date"
                                  isIncluded={!!stageConfig?.isStageDateSelected}
                                  isDefault={!!stageConfig?.isStageDateDefault}
                                  onToggleInclude={() => toggleStageDateInclude(stage.id)}
                                  onToggleDefault={() => toggleStageDateDefault(stage.id)}
                                  depth={1}
                                  className="bg-slate-50/50 italic text-slate-600"
                                />
                            )}

                            {filteredDocs.map((doc: any) => {
                            const kycDoc = kycDocuments.get(doc.kycId);
                            if (!kycDoc) return null;
                            const isDocActive = !!stageConfig?.documents?.[doc.kycId];
                            
                            return (
                                <div key={`doc-${stage.id}-${doc.kycId}-${Math.random().toString(36).substr(2, 9)}`} className="group/doc">
                                  {/* Document Header Row */}
                                  <div className="grid grid-cols-12 gap-0 border-b border-slate-100 items-stretch text-sm hover:bg-slate-50">
                                      <div className="col-span-8 flex items-center border-r border-slate-100 py-2">
                                          <div style={{ width: `24px` }} className="shrink-0 h-full border-r border-dashed border-slate-100 mr-2 opacity-50" />
                                          <div className="flex items-center gap-2 px-2 py-1 w-full">
                                            <Checkbox 
                                                id={`doc-${stage.id}-${doc.kycId}`} 
                                                checked={isDocActive} 
                                                onCheckedChange={() => toggleDocument(stage.id, doc.kycId)}
                                            />
                                            <Label htmlFor={`doc-${stage.id}-${doc.kycId}`} className="cursor-pointer font-semibold text-slate-700 flex-1 truncate">
                                                {kycDoc.display_name || kycDoc.name}
                                            </Label>
                                          </div>
                                      </div>
                                      {/* Spacers for doc row */}
                                      <div className="col-span-2 border-r border-slate-100 bg-slate-50/30"></div>
                                      <div className="col-span-2 bg-slate-50/30"></div>
                                  </div>

                                  {/* Document Fields */}
                                  {isDocActive && (
                                      <div className="bg-slate-50/30">
                                          {kycDoc.fields?.map((field: any) => {
                                              const docConfig = stageConfig?.documents?.[doc.kycId];
                                              const fieldConfig = docConfig?.fields.find((f: any) => f.id === field.id);
                                              if(showSelectedOnly && !fieldConfig) return null;

                                              return (
                                              <TableRow
                                                  key={`field-${stage.id}-${doc.kycId}-${field.id}-${Math.random().toString(36).substr(2, 4)}`}
                                                  label={field.fieldName}
                                                  isIncluded={!!fieldConfig}
                                                  isDefault={!!fieldConfig?.isDefault}
                                                  onToggleInclude={() => toggleDocFieldInclude(stage.id, doc.kycId, field.id)}
                                                  onToggleDefault={() => toggleDocFieldDefault(stage.id, doc.kycId, field.id)}
                                                  depth={2}
                                                  isSessionOnly={!!fieldConfig && !fieldConfig.isDefault}
                                                  className="bg-white"
                                              />
                                              );
                                          })}
                                      </div>
                                  )}
                                </div>
                            );
                            })}
                        </ExpandableRow>
                    );
                })}
              </Accordion>
            </ScrollArea>
          </div>
        </div>
      </div>
    );
  };

  const renderReportViewer = () => {
    const allIncludedFields = new Set([
      ...(reportConfig.taskFields?.map(f => f.id) || []),
      ...Array.from(includedFields)
    ]);
  
    return (
      <div className="flex flex-col h-full">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-slate-900">{selectedReport?.name}</h3>
          <p className="text-sm text-slate-500">Read-only preview.</p>
        </div>
  
        <div className="border rounded-lg shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden bg-white">
          <TableHeader />
          <ScrollArea className="flex-1">
             {/* Flattened View for Viewer using the same TableRow component */}
             <div className="divide-y divide-slate-100">
                <div className="bg-slate-50 px-4 py-2 font-bold text-xs uppercase text-slate-500 tracking-wider">Task Fields</div>
                {Array.from(allIncludedFields).map(fieldId => {
                  const fieldConfig = reportConfig.taskFields?.find(f => f.id === fieldId);
                  const header = tableHeaders.find(h => h.id === fieldId);
                  const isSessionOnly = !fieldConfig?.isDefault;
                  return (
                     <TableRow 
                        key={fieldId}
                        label={header?.label || fieldId}
                        isIncluded={true} 
                        isDefault={!!fieldConfig?.isDefault}
                        isSessionOnly={isSessionOnly}
                        depth={0}
                        readOnly={true}
                     />
                  )
                })}

                {Object.entries(reportConfig.stages).map(([stageId, stageConfig]) => {
                  const stage = stages.find(s => s.id === stageId);
                  if (!stage) return null;
                  return (
                    <div key={stageId}>
                       <div className="bg-slate-50 px-4 py-2 font-bold text-xs uppercase text-slate-500 tracking-wider border-t border-slate-200">{stage.name}</div>
                       {stageConfig.isStageDateSelected && (
                          <TableRow 
                            label="Completion Date" 
                            isIncluded={true} 
                            isDefault={stageConfig.isStageDateDefault} 
                            depth={0} 
                            readOnly={true}
                          />
                       )}
                       {Object.entries(stageConfig.documents).map(([kycId, docConfig]) => {
                          const kycDoc = kycDocuments.get(kycId);
                          const docFields = docConfig.fields || [];
                          if(!kycDoc) return null;

                          return (
                            <React.Fragment key={kycId}>
                              <div className="px-4 py-1.5 bg-slate-50/50 text-xs font-semibold text-slate-600 border-t border-slate-100 pl-8">
                                {kycDoc.display_name || kycDoc.name}
                              </div>
                              {docFields.map((field: any) => {
                                 const fieldInfo = kycDoc.fields?.find((f: any) => f.id === field.id);
                                 return (
                                   <TableRow 
                                      key={field.id}
                                      label={fieldInfo?.fieldName || field.id}
                                      isIncluded={true}
                                      isDefault={field.isDefault}
                                      isSessionOnly={!field.isDefault}
                                      depth={1}
                                      readOnly={true}
                                   />
                                 )
                              })}
                            </React.Fragment>
                          )
                       })}
                    </div>
                  );
                })}
             </div>
          </ScrollArea>
        </div>
      </div>
    );
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] grid grid-cols-12 gap-0 p-0 overflow-hidden bg-slate-50">
        <div className="col-span-3 border-r bg-white p-4 flex flex-col h-full overflow-hidden">
          <DialogHeader className="mb-4 px-1">
            <DialogTitle>Saved Reports</DialogTitle>
            <DialogDescription>Manage your customized report views.</DialogDescription>
          </DialogHeader>
          {isLoading && !isEditing ? <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500"/></div> : renderReportList()}
        </div>

        <div className="col-span-9 p-6 flex flex-col h-full overflow-hidden">
          <div className="flex-1 min-h-0 mb-4 overflow-hidden flex flex-col">
            {isEditing ? renderReportEditor() : selectedReport ? renderReportViewer() : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <div className="p-6 bg-white shadow-sm rounded-full mb-4"><TableIcon className="h-10 w-10 text-slate-200"/></div>
                <p className="font-semibold text-lg text-slate-600">Select a report to view details</p>
                <p className="text-sm">Or create a new one to get started.</p>
              </div>
            )}
          </div>
          
          <DialogFooter className="mt-auto pt-4 border-t bg-slate-50 -mx-6 -mb-6 p-6">
            {isEditing ? (
              <Button onClick={handleSaveReport} disabled={isLoading || !reportName.trim()} className="w-full sm:w-auto bg-green-600 hover:bg-green-700">
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>} 
                Save Configuration
              </Button>
            ) : selectedReport ? (
              <Button onClick={handleApply} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 shadow-sm">
                Apply This Report
              </Button>
            ) : null}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}