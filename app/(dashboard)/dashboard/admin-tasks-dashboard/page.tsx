// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { supabase } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Loader2, Settings2, RotateCcw, Download } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { fetchUserVisibilitySettings } from "./utils/visibilitySettings"
import { ENHANCED_TABLE_HEADERS_IMMIGRATION } from "../tasks/overall-view/tableUtils"
import { EnhancedTable } from "../tasks/overall-view/EnhancedTable"
import { fetchDepartments } from "../departments/departments/database"
import { fetchTasks, fetchStages, fetchCompanies, fetchAllDocuments, formatDateValue} from "../tasks/utils/taskManagerData"
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { RowVisibilityManagementDialog } from "./row-visibility-dialog"

export default function AdminStageDashboard() {
  // --- State ---
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  
  // Tabs State
  const [activeDepartmentTab, setActiveDepartmentTab] = useState<string>("");
  const [activeSubdepartmentTab, setActiveSubdepartmentTab] = useState<string>("all");

  const [tasks, setTasks] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Map<number, string>>(new Map());
  const [tmUsers, setTmUsers] = useState<Map<number, any>>(new Map()); // User map for staff names
  
  // Visibility State
  const [visibleStageIds, setVisibleStageIds] = useState<Set<string>>(new Set());
  const [visibleHeaderIds, setVisibleHeaderIds] = useState<Set<string>>(new Set(ENHANCED_TABLE_HEADERS_IMMIGRATION.map(h => h.id)));
  
  const [savedDefaultStageIds, setSavedDefaultStageIds] = useState<Set<string>>(new Set());
  const [savedDefaultHeaderIds, setSavedDefaultHeaderIds] = useState<Set<string>>(new Set());
  
  const [isVisibilityDialogOpen, setIsVisibilityDialogOpen] = useState(false);

  // Derived Data for EnhancedTable
  const [taskDependants, setTaskDependants] = useState<Map<string, any[]>>(new Map());
  const [tableRows, setTableRows] = useState<any[]>([]);
  
  const expandedSections = useMemo(() => new Set(['case_details', 'stages']), []);
  
  // --- Initial Data Fetching ---
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setUserId(user.id);

        const [deptsData, compsData, usersMap] = await Promise.all([
          fetchDepartments(),
          fetchCompanies()
        ]);

        setDepartments(deptsData);
        setCompanies(compsData);
        setTmUsers(usersMap);

        if (deptsData.length > 0) {
          setActiveDepartmentTab(deptsData[0].id.toString());
        }

        // Fetch saved visibility settings
        if (user) {
          const settings = await fetchUserVisibilitySettings(user.id);
          if (settings) {
            if (settings.defaultStageIds) {
              const stageDefaults = new Set(settings.defaultStageIds);
              setSavedDefaultStageIds(stageDefaults);
              setVisibleStageIds(stageDefaults);
            }
            if (settings.defaultHeaderIds) {
              const headerDefaults = new Set(settings.defaultHeaderIds);
              setSavedDefaultHeaderIds(headerDefaults);
              setVisibleHeaderIds(headerDefaults);
            }
          }
        }
      } catch (error) {
        console.error("Init error", error);
        toast({ title: "Error", description: "Failed to initialize dashboard", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // --- Fetch Tasks & Stages ---
  useEffect(() => {
    if (!activeDepartmentTab) return;

    const loadDepartmentData = async () => {
      setLoading(true);
      try {
        // Only pass subdepartment ID if it's not 'all'
        const subDeptId = activeSubdepartmentTab === 'all' ? undefined : activeSubdepartmentTab;

        const [tasksData, stagesData] = await Promise.all([
          fetchTasks(activeDepartmentTab, subDeptId),
          fetchStages(activeDepartmentTab, departments)
        ]);

        setTasks(tasksData);
        setStages(stagesData);

        // Process Dependants
        const depsMap = new Map();
        tasksData.forEach(task => {
            if(task.dependant_member && Array.isArray(task.dependant_member)) {
                depsMap.set(task.id.toString(), task.dependant_member);
            }
        });
        setTaskDependants(depsMap);

        // If no saved defaults, default to all stages
        if (savedDefaultStageIds.size === 0) {
            setVisibleStageIds(new Set(stagesData.map(s => s.id.toString())));
        }

      } catch (error) {
        console.error("Data fetch error", error);
      } finally {
        setLoading(false);
      }
    };

    loadDepartmentData();
  }, [activeDepartmentTab, activeSubdepartmentTab, departments, savedDefaultStageIds.size]);


  // --- Generate Table Rows ---
  useEffect(() => {
    if (!stages.length) return;

    const visibleStages = stages
      .filter(stage => visibleStageIds.has(stage.id.toString()))
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

    const rows = [];
    rows.push({ key: 'section_header_case', type: 'section_header', label: 'Case Details', id: 'case_details', icon: Settings2 });
    rows.push({ key: 'section_header_stages', type: 'section_header', label: 'Stages', id: 'stages', icon: Settings2 });

    if (expandedSections.has('stages')) {
        visibleStages.forEach(stage => {
            rows.push({
                key: `stage_${stage.id}`,
                label: stage.name,
                type: 'stage',
                stage: stage,
                stageId: stage.id,
                stageOrder: stage.order_num,
                getValue: (task: any) => task.stages?.[stage.id]
            });
        });
    }
    setTableRows(rows);
  }, [stages, visibleStageIds, expandedSections]);

  // --- Helpers ---
  
  const getTaskHierarchy = useCallback((task: any) => {
    if (!task || !departments.length) return null
    const dept = departments.find(d => d.id === task.department?.id || d.id === task.department_id)
    if (!dept) return null
    
    // Fallback: look in tm_subdepartments of active department if task.subdepartment is missing
    const subdeptId = task.subdepartment?.id || task.subdepartment_id;
    const subdept = dept.tm_subdepartments?.find(s => s.id === subdeptId);
    
    const classId = task.class_id?.toString();
    const cls = subdept?.classes?.find(c => c.id.toString() === classId);
    
    return { department: dept, subdepartment: subdept, class: cls }
  }, [departments]);

  const getStaffName = useCallback((userId: string | number) => {
    if (!userId) return '';
    const user = tmUsers.get(Number(userId));
    return user?.name || `User ${userId}`;
  }, [tmUsers]);

  // --- Renderers ---

  const renderDateCell = useCallback((row: any, task: any) => {
    if (row.type === 'stage') {
        const stageData = row.getValue(task);
        if (!stageData) return <span className="text-xs text-gray-300">-</span>;
        
        const dateValue = stageData.date || stageData.completedAt || stageData.created_at;
        
        if (dateValue) {
            return (
                <div className="flex flex-col justify-center items-center">
                    <span className="text-xs font-medium text-slate-700">{formatDateValue(dateValue)}</span>
                    {stageData.status && stageData.status !== 'completed' && (
                        <span className="text-[10px] text-slate-500 capitalize px-1 bg-slate-100 rounded">
                            {stageData.status.replace(/_/g, ' ')}
                        </span>
                    )}
                </div>
            );
        }
        if (stageData.status) {
             return <span className="text-xs text-slate-500 capitalize">{stageData.status.replace(/_/g, ' ')}</span>;
        }
        return <span className="text-xs text-gray-300">-</span>;
    }
    return null;
  }, []);

  const getCellContentWrapper = useCallback((task: any, headerId: string) => {
      // Enhanced cell content getter for case details
      switch(headerId) {
          case 'applicant_name': return task.applicant_name;
          case 'company_id': return companies.get(task.company_id) || 'Unknown';
          case 'job_level': {
              const h = getTaskHierarchy(task);
              return h?.class?.name || h?.subdepartment?.name || 'N/A';
          }
          case 'task_manager_id': return getStaffName(task.task_manager_id);
          case 'officer_id': return getStaffName(task.officer_id);
          case 'task_assistant_id': return getStaffName(task.task_assistant_id);
          case 'status': return task.status?.replace(/_/g, ' ') || 'Pending';
          case 'created_at': return formatDateValue(task.created_at);
          default: return task[headerId] || '';
      }
  }, [companies, getTaskHierarchy, getStaffName]);

  // --- Export Functionality ---
  const handleExportToExcel = useCallback(() => {
    if (!tasks.length) return;

    // 1. Prepare Headers (Visible Columns Only)
    const headers = [
      ...Array.from(visibleHeaderIds).map(id => {
         const def = ENHANCED_TABLE_HEADERS_IMMIGRATION.find(h => h.id === id);
         return def ? def.label : id;
      }),
      ...Array.from(visibleStageIds).map(id => {
         const stage = stages.find(s => s.id.toString() === id);
         return stage ? stage.name : `Stage ${id}`;
      })
    ];

    // 2. Prepare Data Rows
    const data = tasks.map(task => {
        const rowData: any = {};
        
        // Headers
        visibleHeaderIds.forEach(id => {
            const def = ENHANCED_TABLE_HEADERS_IMMIGRATION.find(h => h.id === id);
            const label = def ? def.label : id;
            rowData[label] = getCellContentWrapper(task, id);
        });

        // Stages
        visibleStageIds.forEach(id => {
            const stage = stages.find(s => s.id.toString() === id);
            if(stage) {
                const stageData = task.stages?.[id];
                const val = stageData?.date || stageData?.completedAt || stageData?.status || '';
                rowData[stage.name] = val;
            }
        });

        return rowData;
    });

    // 3. Create Worksheet
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AdminDashboard");
    
    // 4. Download
    const fileName = `Admin_Dashboard_Export_${new Date().toISOString().slice(0,10)}.xlsx`;
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8"});
    saveAs(blob, fileName);
    
    toast({ title: "Export Successful", description: `Downloaded ${fileName}` });
  }, [tasks, visibleHeaderIds, visibleStageIds, stages, getCellContentWrapper]);


  // --- Render ---
  return (
    <div className="flex-1 space-y-4 px-4 py-6 bg-slate-50/30 min-h-screen">
        <div className="flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Admin Stage Dashboard</h2>
                <p className="text-sm text-slate-500">View stage completion dates across departments.</p>
            </div>
            
            <div className="flex gap-2">
                <Button variant="outline" onClick={handleExportToExcel}>
                    <Download className="h-4 w-4 mr-2"/> Export Excel
                </Button>
                <Button variant="outline" onClick={() => {
                    setVisibleStageIds(savedDefaultStageIds);
                    setVisibleHeaderIds(savedDefaultHeaderIds);
                    toast({ title: "View Reset", description: "Reset to saved default columns." });
                }}>
                    <RotateCcw className="h-4 w-4 mr-2"/> Reset View
                </Button>
                <Button onClick={() => setIsVisibilityDialogOpen(true)}>
                    <Settings2 className="h-4 w-4 mr-2"/> Row Visibility
                </Button>
            </div>
        </div>

        <Tabs value={activeDepartmentTab} onValueChange={setActiveDepartmentTab}>
            {/* Department Tabs */}
            <TabsList className="grid w-full rounded-lg p-1 shadow-sm bg-white" style={{ gridTemplateColumns: `repeat(${departments.length}, 1fr)` }}>
                {departments.map(dept => (
                    <TabsTrigger key={dept.id} value={dept.id.toString()}>
                        {dept.name}
                    </TabsTrigger>
                ))}
            </TabsList>

            {departments.map(dept => {
               // Get subdepartments for this department
               const subDepts = dept.tm_subdepartments || [];
               
               return (
                <TabsContent key={dept.id} value={dept.id.toString()} className="space-y-4">
                    
                    {/* Subdepartment Tabs */}
                    {subDepts.length > 0 && (
                        <Tabs value={activeSubdepartmentTab} onValueChange={setActiveSubdepartmentTab}>
                            <TabsList className="flex flex-wrap h-auto bg-slate-100 rounded-lg p-1">
                                <TabsTrigger value="all" className="flex-1 min-w-[100px]">All Subdepartments</TabsTrigger>
                                {subDepts.map(sub => (
                                    <TabsTrigger key={sub.id} value={sub.id.toString()} className="flex-1 min-w-[100px]">
                                        {sub.name}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    )}

                    <Card className="border-slate-200 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle>{dept.name} Overview</CardTitle>
                            <CardDescription>
                                Showing {tasks.length} tasks.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <EnhancedTable
                                tasks={tasks}
                                tableType="Admin View"
                                ENHANCED_TABLE_HEADERS_IMMIGRATION={ENHANCED_TABLE_HEADERS_IMMIGRATION}
                                visibleHeaders={visibleHeaderIds} // Pass controlled header visibility
                                taskDependants={taskDependants}
                                expandedDependants={new Set()}
                                expandedSections={expandedSections}
                                tableRows={tableRows}
                                loading={loading}
                                error={null}
                                renderCellContent={renderDateCell} 
                                getCellContent={getCellContentWrapper}
                                // Props required but unused in read-only view
                                toggleSectionExpansion={() => {}}
                                toggleStageExpansion={() => {}}
                                toggleDocumentExpansion={() => {}}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
               );
            })}
        </Tabs>

        {/* Row Visibility Dialog */}
        <RowVisibilityManagementDialog
            open={isVisibilityDialogOpen}
            onOpenChange={setIsVisibilityDialogOpen}
            stages={stages}
            headers={ENHANCED_TABLE_HEADERS_IMMIGRATION} // Pass all available headers
            
            currentVisibleStageIds={visibleStageIds}
            currentVisibleHeaderIds={visibleHeaderIds}
            
            savedDefaultStageIds={savedDefaultStageIds}
            savedDefaultHeaderIds={savedDefaultHeaderIds}
            
            userId={userId || ''}
            
            onApply={(newStageIds, newHeaderIds) => {
                setVisibleStageIds(newStageIds);
                setVisibleHeaderIds(newHeaderIds);
            }}
            onDefaultsUpdated={(newDefaultStages, newDefaultHeaders) => {
                setSavedDefaultStageIds(newDefaultStages);
                setSavedDefaultHeaderIds(newDefaultHeaders);
            }}
        />
    </div>
  );
}